import { produce } from 'immer';
import { useStore, type CollabInfo, type Peer } from './store';
import { getMe } from './actions';
import { layoutAll } from './doc';
import type { Doc, Page, Pt, SceneNode, Styles } from './types';

/*
 * Live collaboration client.
 * Every local edit is diffed per node (immer keeps unchanged nodes identical, so this is cheap)
 * and sent on the next sync tick. The server keeps a per-node last-writer-wins snapshot plus a
 * short change log; each tick returns other people's changes and cursors.
 */

type Op = { t: 'node'; node: SceneNode } | { t: 'del'; id: string } | { t: 'pages'; pages: Page[] } | { t: 'name'; name: string } | { t: 'styles'; styles: Styles };
interface Entry {
  seq: number;
  c: string;
  ops: Op[];
}

const randomId = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijkmnopqrstuvwxyz23456789'[b % 33]).join('');

async function errorText(r: Response) {
  const j = await r.json().catch(() => null);
  return j?.error ?? `Server error (${r.status})`;
}

export async function createRoom(name: string, doc: Doc): Promise<{ id: string; token: string }> {
  const r = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, doc }) });
  if (!r.ok) throw new Error(r.status === 404 ? 'Live collaboration API not found. Deploy to Vercel or run `npm run dev`.' : await errorText(r));
  return r.json();
}

/** Issue a new edit token; old edit links (and MCP connections using them) become view-only. */
export async function rotateRoomToken(roomId: string, token: string): Promise<string> {
  const r = await fetch('/api/rooms/rotate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room: roomId, token }) });
  if (!r.ok) throw new Error(await errorText(r));
  return (await r.json()).token;
}

export async function fetchRoom(id: string): Promise<{ seq: number; name: string; doc: Doc } | null> {
  const r = await fetch(`/api/room?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(await errorText(r));
  const j = (await r.json()) as { seq: number; name: string; pages: Page[]; nodes: SceneNode[]; styles?: Styles | null };
  return { seq: j.seq, name: j.name, doc: { pages: j.pages, nodes: Object.fromEntries(j.nodes.map((n) => [n.id, n])), ...(j.styles ? { styles: j.styles } : {}) } };
}

/** Restores tree invariants after concurrent edits (orphans, dangling children, duplicates). */
export function repair(d: Doc) {
  const pageIds = new Set(d.pages.map((p) => p.id));
  for (let changed = true; changed; ) {
    changed = false;
    for (const id in d.nodes) {
      const n = d.nodes[id];
      if (!pageIds.has(n.pageId) || (n.parentId && !d.nodes[n.parentId])) {
        delete d.nodes[id];
        changed = true;
      }
    }
  }
  for (const p of d.pages) {
    const kids = p.children.filter((c, i, a) => d.nodes[c] && !d.nodes[c].parentId && d.nodes[c].pageId === p.id && a.indexOf(c) === i);
    if (kids.length !== p.children.length) p.children = kids;
  }
  for (const id in d.nodes) {
    const n = d.nodes[id];
    const kids = n.children.filter((c, i, a) => d.nodes[c]?.parentId === id && a.indexOf(c) === i);
    if (kids.length !== n.children.length) n.children = kids;
  }
  for (const id in d.nodes) {
    const n = d.nodes[id];
    const list = n.parentId ? d.nodes[n.parentId].children : d.pages.find((p) => p.id === n.pageId)!.children;
    if (!list.includes(id)) list.push(id);
  }
}

function applyOps(d: Doc, ops: Op[]) {
  for (const op of ops) {
    if (op.t === 'node') d.nodes[op.node.id] = op.node;
    else if (op.t === 'del') delete d.nodes[op.id];
    else if (op.t === 'pages') d.pages = op.pages;
    else if (op.t === 'styles') d.styles = op.styles;
  }
  repair(d);
  // Remote edits (incl. AI agents over MCP) may carry approximate text sizes; re-measure locally.
  layoutAll(d);
}

let cursor: Pt | null = null;
let onActivity: (() => void) | null = null;

/** Called by the canvas with the pointer position in world space. */
export function reportCursor(p: Pt | null) {
  cursor = p ? { x: Math.round(p.x), y: Math.round(p.y) } : null;
  onActivity?.();
}

const setCollab = (p: Partial<CollabInfo>) => useStore.setState((s) => ({ collab: s.collab ? { ...s.collab, ...p } : null }));

export function startSync(roomId: string, token: string | undefined, initialSeq: number): () => void {
  const clientId = randomId(12);
  let seq = initialSeq;
  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastTick = 0;
  let lastActivity = Date.now();
  let applying = false;
  let lastDoc = useStore.getState().doc;
  let lastName = useStore.getState().fileName;
  const pending = new Map<string, SceneNode | null>();
  let pagesDirty = false;
  let nameDirty = false;
  let stylesDirty = false;

  useStore.setState({ collab: { roomId, token, canEdit: !!token, status: 'connecting', peers: [] }, readOnly: !token });

  const diff = (a: Doc, b: Doc) => {
    for (const id in b.nodes) if (a.nodes[id] !== b.nodes[id]) pending.set(id, b.nodes[id]);
    for (const id in a.nodes) if (!(id in b.nodes)) pending.set(id, null);
    if (a.pages !== b.pages) pagesDirty = true;
    if (a.styles !== b.styles) stylesDirty = true;
  };

  const schedule = (delay: number) => {
    if (stopped || inFlight) return;
    clearTimeout(timer);
    timer = setTimeout(tick, Math.max(delay, 250 - (Date.now() - lastTick)));
  };

  const poke = () => {
    lastActivity = Date.now();
    schedule(40);
  };
  onActivity = () => {
    if (Date.now() - lastActivity > 1000) poke();
    else lastActivity = Date.now();
  };

  const unsub = useStore.subscribe((s, prev) => {
    if (applying) {
      lastDoc = s.doc;
      return;
    }
    if (s.doc !== lastDoc) {
      diff(lastDoc, s.doc);
      lastDoc = s.doc;
      poke();
    }
    if (s.fileName !== lastName) {
      lastName = s.fileName;
      nameDirty = true;
      poke();
    }
    if (s.selection !== prev.selection || s.pageId !== prev.pageId) poke();
  });

  const applyRemote = (ops: Op[], replace?: Doc) => {
    const s = useStore.getState();
    const nameOp = [...ops].reverse().find((o): o is Extract<Op, { t: 'name' }> => o.t === 'name');
    // Each produce gets its own copy of the ops: immer freezes inserted objects, and repair/layout
    // must be able to write to them again when the same ops are rebased onto undo history.
    const json = JSON.stringify(ops);
    const fn = (d: Doc) => applyOps(d, JSON.parse(json) as Op[]);
    const doc = replace ? produce(replace, fn) : produce(s.doc, fn);
    applying = true;
    useStore.setState({
      doc,
      past: replace ? [] : s.past.map((p) => produce(p, fn)),
      future: replace ? [] : s.future.map((p) => produce(p, fn)),
      selection: s.selection.filter((id) => doc.nodes[id]),
      pageId: doc.pages.some((p) => p.id === s.pageId) ? s.pageId : doc.pages[0].id,
      editingTextId: s.editingTextId && doc.nodes[s.editingTextId] ? s.editingTextId : null,
      ...(nameOp ? { fileName: nameOp.name } : {}),
    });
    applying = false;
    lastName = useStore.getState().fileName;
  };

  const pendingOps = (): Op[] => {
    const s = useStore.getState();
    const ops: Op[] = [];
    for (const [id, n] of pending) ops.push(n ? { t: 'node', node: n } : { t: 'del', id });
    if (pagesDirty) ops.push({ t: 'pages', pages: s.doc.pages });
    if (nameDirty) ops.push({ t: 'name', name: s.fileName });
    if (stylesDirty && s.doc.styles) ops.push({ t: 'styles', styles: s.doc.styles });
    return ops;
  };

  async function tick() {
    if (stopped) return;
    inFlight = true;
    lastTick = Date.now();
    const s = useStore.getState();
    const canEdit = s.collab?.canEdit ?? false;
    const ops = canEdit ? pendingOps() : [];
    const sent = new Map(pending);
    const sentPages = pagesDirty;
    const sentName = nameDirty;
    const sentStyles = stylesDirty;
    const sentKeys = new Set([...sent.keys(), ...(sentPages ? ['#pages'] : []), ...(sentStyles ? ['#styles'] : []), ...(sentName ? ['#name'] : [])]);
    if (canEdit) {
      pending.clear();
      pagesDirty = false;
      nameDirty = false;
      stylesDirty = false;
    }
    const me = getMe();
    const presence = { id: clientId, name: me.name, color: me.color, pageId: s.pageId, cursor, selection: s.selection.slice(0, 50) };
    let gotRemote = false;
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room: roomId, clientId, since: seq, token, ops, presence }),
      });
      if (res.status === 404) {
        setCollab({ status: 'error', error: 'This shared file no longer exists.' });
        stopped = true;
        return;
      }
      if (!res.ok) throw new Error(await errorText(res));
      const j = (await res.json()) as { seq: number; pushed: number; canEdit: boolean; reset: boolean; entries: Entry[]; peers: Peer[] };
      if (j.reset) {
        const snap = await fetchRoom(roomId);
        if (snap) {
          applyRemote(pendingOps(), snap.doc);
          seq = snap.seq;
          gotRemote = true;
        }
      } else {
        const remote: Op[] = [];
        for (const e of j.entries) {
          if (e.c === clientId) continue;
          for (const op of e.ops) {
            const key = op.t === 'node' ? op.node.id : op.t === 'del' ? op.id : '#' + op.t;
            // Newer local edits win; so do ours that landed after theirs.
            if (pending.has(key) || (key === '#pages' && pagesDirty) || (key === '#name' && nameDirty) || (key === '#styles' && stylesDirty)) continue;
            if (j.pushed && e.seq < j.pushed && sentKeys.has(key)) continue;
            remote.push(op);
          }
        }
        if (remote.length) {
          try {
            applyRemote(remote);
          } catch (err) {
            // Never get stuck: if remote changes can't be applied incrementally, reload the snapshot.
            console.error('Applying remote changes failed; reloading the shared file', err);
            const snap = await fetchRoom(roomId);
            if (snap) applyRemote(pendingOps(), snap.doc);
          }
          gotRemote = true;
        }
        seq = j.seq;
      }
      if (gotRemote) lastActivity = Date.now();
      useStore.setState((st) => ({ readOnly: !j.canEdit, collab: st.collab ? { ...st.collab, status: 'live', error: undefined, canEdit: j.canEdit, peers: j.peers } : null }));
    } catch (err) {
      for (const [id, n] of sent) if (!pending.has(id)) pending.set(id, n);
      if (sentPages) pagesDirty = true;
      if (sentName) nameDirty = true;
      if (sentStyles) stylesDirty = true;
      setCollab({ status: 'offline', error: err instanceof Error ? err.message : String(err) });
    } finally {
      inFlight = false;
      const idle = Date.now() - lastActivity;
      const busy = pending.size > 0 || pagesDirty || nameDirty || stylesDirty;
      schedule(document.hidden ? 5000 : busy ? 0 : idle < 10_000 ? 300 : idle < 60_000 ? 1200 : 3000);
    }
  }

  const onVisible = () => !document.hidden && poke();
  document.addEventListener('visibilitychange', onVisible);
  tick();

  return () => {
    stopped = true;
    clearTimeout(timer);
    unsub();
    onActivity = null;
    document.removeEventListener('visibilitychange', onVisible);
    useStore.setState({ collab: null, readOnly: false });
  };
}
