import { getStore } from './store';
import { bbox, getPage, insert, isFrameLike, makeNode, moveDeep, nextName, removeNode, resizeTo } from '../src/doc';
import { toSVG } from '../src/exporter';
import type { Doc, NodeType, SceneNode } from '../src/types';

/*
 * MCP server (Streamable HTTP, stateless JSON-RPC) for live Vellum files.
 * An AI agent connects with the URL from Share → "Connect an AI agent":
 *   POST /api/mcp?name=<agent name>
 *   Authorization: Bearer <project edit token>
 * The token is the file's edit token, so it both authenticates and identifies the file.
 * Read-only access (no token) uses ?room=<id> instead.
 * It can see who is online (cursors, selections), read and render the file, and edit it.
 * Edits are pushed as normal sync ops, so everyone sees them appear live, and the agent
 * shows up as a 🤖 collaborator with its own cursor.
 */

const PROTOCOL = '2025-06-18';
const AGENT_COLOR = '#0d9488';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, mcp-session-id, mcp-protocol-version, authorization',
  'access-control-expose-headers': 'mcp-session-id',
  'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
};

interface Ctx {
  room: string;
  token: string;
  agent: string;
  clientId: string;
}

class RpcError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- room access ---------- */

async function loadDoc(ctx: Ctx) {
  if (!ctx.room) throw new Error('No file connected. Use the setup from Vellum → Share → "Connect an AI agent".');
  const snap = await getStore().snapshot(ctx.room);
  if (!snap) throw new Error('This shared file was not found (it may have expired).');
  const nodes: Record<string, SceneNode> = {};
  const raw = new Map<string, string>();
  for (const j of snap.nodes) {
    const n = JSON.parse(j) as SceneNode;
    nodes[n.id] = n;
    raw.set(n.id, JSON.stringify(n));
  }
  const doc: Doc = { pages: JSON.parse(snap.pages), nodes, ...(snap.styles ? { styles: JSON.parse(snap.styles) } : {}) };
  return { doc, raw, seq: snap.seq, pagesRaw: JSON.stringify(doc.pages), name: snap.name };
}

interface Presence {
  id: string;
  name: string;
  color: string;
  pageId: string;
  cursor: { x: number; y: number } | null;
  selection: string[];
}

/** Writes the agent's presence (and optional ops); returns live collaborators. */
async function sync(ctx: Ctx, presence: Omit<Presence, 'id' | 'name' | 'color'>, ops?: { list: unknown[]; upserts: [string, string][]; dels: string[]; pages: string }) {
  const r = await getStore().sync({
    room: ctx.room,
    clientId: ctx.clientId,
    since: Number.MAX_SAFE_INTEGER,
    tokenHash: ctx.token ? await sha256(ctx.token) : '',
    presence: JSON.stringify({ id: ctx.clientId, name: `🤖 ${ctx.agent}`, color: AGENT_COLOR, ...presence }),
    now: Date.now(),
    opsJson: ops?.list.length ? JSON.stringify(ops.list) : '',
    upserts: ops?.upserts ?? [],
    dels: ops?.dels ?? [],
    pages: ops?.pages ?? '',
    name: '',
    styles: '',
  });
  if (r.missing) throw new Error('This shared file was not found.');
  if (ops?.list.length && !r.pushed) throw new Error('This is a view-only link, so edits are not allowed. Use the edit link from Share.');
  return r.presence.flatMap((p) => {
    try {
      return [JSON.parse(p.slice(p.indexOf('|') + 1)) as Presence];
    } catch {
      return [];
    }
  });
}

/** Run an edit against the latest snapshot and push only what changed. */
async function edit(ctx: Ctx, mutate: (doc: Doc) => { focus?: string; text: string; pageId?: string }) {
  const { doc, raw, pagesRaw } = await loadDoc(ctx);
  const out = mutate(doc);
  const list: unknown[] = [];
  const upserts: [string, string][] = [];
  const dels: string[] = [];
  for (const id in doc.nodes) {
    const j = JSON.stringify(doc.nodes[id]);
    if (raw.get(id) !== j) {
      list.push({ t: 'node', node: doc.nodes[id] });
      upserts.push([id, j]);
    }
  }
  for (const id of raw.keys())
    if (!doc.nodes[id]) {
      list.push({ t: 'del', id });
      dels.push(id);
    }
  const pagesNow = JSON.stringify(doc.pages);
  const pagesChanged = pagesNow !== pagesRaw;
  if (pagesChanged) list.push({ t: 'pages', pages: doc.pages });
  const f = out.focus ? doc.nodes[out.focus] : null;
  await sync(
    ctx,
    { pageId: f?.pageId ?? out.pageId ?? doc.pages[0].id, cursor: f ? { x: Math.round(f.x + f.w / 2), y: Math.round(f.y + f.h / 2) } : null, selection: f ? [f.id] : [] },
    { list, upserts, dels, pages: pagesChanged ? pagesNow : '' },
  );
  return out.text;
}

/* ---------- helpers ---------- */

const WRITABLE = new Set(['name', 'x', 'y', 'w', 'h', 'rotation', 'fill', 'gradient', 'stroke', 'strokeWidth', 'strokeDash', 'radius', 'radii', 'opacity', 'visible', 'locked', 'shadow', 'innerShadow', 'blur', 'blendMode', 'constraints', 'text', 'fontSize', 'fontWeight', 'fontFamily', 'textAlign', 'lineHeight', 'letterSpacing', 'textDecoration', 'textAutoResize', 'points', 'closed', 'arrowEnd', 'src', 'imageFit', 'autoLayout', 'clip', 'layoutFill', 'layoutStretch', 'layoutGrid', 'link', 'linkTransition']);

function applyProps(doc: Doc, n: SceneNode, props: Record<string, unknown>) {
  const bad = Object.keys(props).filter((k) => !WRITABLE.has(k));
  if (bad.length) throw new Error(`Unknown or read-only properties: ${bad.join(', ')}`);
  const { x, y, w, h, ...rest } = props as Partial<SceneNode>;
  Object.assign(n, rest);
  if (x !== undefined || y !== undefined) moveDeep(doc, n.id, (x ?? n.x) - n.x, (y ?? n.y) - n.y);
  if (w !== undefined || h !== undefined) resizeTo(doc, n.id, { x: n.x, y: n.y, w: w ?? n.w, h: h ?? n.h });
  if (n.type === 'text') approxText(n);
}

/** Rough text box (browsers re-measure exactly when the change arrives). */
function approxText(n: SceneNode) {
  const size = n.fontSize ?? 16;
  const lines = (n.text ?? '').split('\n');
  if (n.textAutoResize !== 'height') n.w = Math.ceil(Math.max(1, ...lines.map((l) => l.length)) * size * 0.56);
  n.h = Math.round(lines.length * size * (n.lineHeight ?? 1.2));
}

function brief(n: SceneNode) {
  const extra = n.type === 'text' ? ` "${(n.text ?? '').slice(0, 60).replace(/\n/g, '⏎')}"` : n.fill ? ` fill=${n.fill}` : '';
  return `${n.name} [${n.section ? 'section' : n.type}] id=${n.id} x=${Math.round(n.x)} y=${Math.round(n.y)} w=${Math.round(n.w)} h=${Math.round(n.h)}${extra}${n.visible ? '' : ' (hidden)'}`;
}

function outline(doc: Doc, pageId: string, maxDepth: number) {
  const lines: string[] = [];
  const walk = (ids: string[], depth: number) => {
    for (const id of [...ids].reverse()) {
      const n = doc.nodes[id];
      if (!n || lines.length > 500) continue;
      lines.push(`${'  '.repeat(depth)}- ${brief(n)}`);
      if (depth < maxDepth) walk(n.children, depth + 1);
      else if (n.children.length) lines.push(`${'  '.repeat(depth + 1)}… ${n.children.length} children`);
    }
  };
  walk(getPage(doc, pageId).children, 0);
  return lines.join('\n') || '(empty page)';
}

const stripImages = (svg: string) => svg.replace(/href="data:[^"]{200,}"/g, 'href="data:,image-omitted"');

/* ---------- tools ---------- */

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });

const TOOLS = [
  {
    name: 'get_live_view',
    description: 'See the file live: who is online right now, which page they are on, where their cursor is and what they have selected. Call this first to understand what the user is looking at.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_document',
    description: 'Outline of a page: every layer with id, type, name, position, size and text. Defaults to the page the user is on.',
    inputSchema: { type: 'object', properties: { pageId: str('Page id (optional).'), depth: num('How deep to list nested layers (default 6).') } },
  },
  {
    name: 'get_layer',
    description: 'Full JSON of one layer (all properties).',
    inputSchema: { type: 'object', properties: { id: str('Layer id.') }, required: ['id'] },
  },
  {
    name: 'render_svg',
    description: 'Render a layer (or the whole page) to SVG markup so you can see exactly what it looks like. Embedded images are omitted.',
    inputSchema: { type: 'object', properties: { id: str('Layer id (optional; defaults to the current page).'), pageId: str('Page id when rendering a page.') } },
  },
  {
    name: 'create_layer',
    description:
      'Create a layer. Types: frame, rect, ellipse, text, path, image, component. Coordinates are absolute page coordinates. Put layers inside a frame with parentId. Colors are hex. Useful props: fill, stroke, strokeWidth, radius, text, fontSize, fontWeight, fontFamily, autoLayout {direction:"horizontal"|"vertical", gap, padding, align:"start"|"center"|"end", justify}, shadow {x,y,blur,color,opacity}, opacity.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['frame', 'rect', 'ellipse', 'text', 'path', 'image', 'component'] },
        name: str('Layer name.'),
        parentId: str('Parent frame id (optional).'),
        pageId: str('Page id (optional; defaults to the user’s current page).'),
        x: num('X'),
        y: num('Y'),
        w: num('Width'),
        h: num('Height'),
        props: { type: 'object', description: 'Any other layer properties.', additionalProperties: true },
      },
      required: ['type'],
    },
  },
  {
    name: 'update_layer',
    description: 'Change properties of a layer (x/y move its children too; w/h respect constraints).',
    inputSchema: { type: 'object', properties: { id: str('Layer id.'), props: { type: 'object', additionalProperties: true } }, required: ['id', 'props'] },
  },
  {
    name: 'delete_layer',
    description: 'Delete a layer and everything inside it.',
    inputSchema: { type: 'object', properties: { id: str('Layer id.') }, required: ['id'] },
  },
  {
    name: 'watch_changes',
    description:
      'Follow the file live: waits up to 20 seconds for anyone to edit layers, rename the file, or change what they have selected, then reports what changed and who did it. Returns a `since` cursor; pass it to the next call to keep watching without missing anything.',
    inputSchema: { type: 'object', properties: { since: num('Cursor from the previous watch_changes call (omit to start watching from now).'), timeoutSeconds: num('Max seconds to wait (1-20, default 20).') } },
  },
  {
    name: 'point_at',
    description: 'Move your 🤖 cursor to a layer and highlight it for everyone, e.g. to show the user what you are talking about.',
    inputSchema: { type: 'object', properties: { id: str('Layer id.') }, required: ['id'] },
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Long-poll the room's change log (and presence) for activity by anyone except this agent. */
async function watch(ctx: Ctx, since: number | undefined, timeoutS: number) {
  const store = getStore();
  const first = await loadDoc(ctx);
  let cursor = since ?? first.seq;
  const deadline = Date.now() + Math.min(20, Math.max(1, timeoutS)) * 1000;
  const selKey = (ps: Presence[]) => ps.map((p) => `${p.id}:${p.pageId}:${p.selection.join(',')}`).sort().join('|');
  const initialPeers = await sync(ctx, { pageId: first.doc.pages[0].id, cursor: null, selection: [] });
  const humans = (ps: Presence[]) => ps.filter((p) => p.id !== ctx.clientId);
  const startSel = selKey(humans(initialPeers));
  for (;;) {
    const r = await store.sync({ room: ctx.room, clientId: ctx.clientId, since: cursor, tokenHash: '', presence: JSON.stringify({ id: ctx.clientId, name: `🤖 ${ctx.agent}`, color: AGENT_COLOR, pageId: first.doc.pages[0].id, cursor: null, selection: [] }), now: Date.now(), opsJson: '', upserts: [], dels: [], pages: '', name: '', styles: '' });
    if (r.missing) throw new Error('This shared file was not found.');
    const peers = humans(r.presence.flatMap((p) => { try { return [JSON.parse(p.slice(p.indexOf('|') + 1)) as Presence]; } catch { return []; } }));
    const nameOf = new Map(peers.map((p) => [p.id, p.name]));
    const lines: string[] = [];
    if (r.reset) lines.push('The file changed a lot since your cursor; call get_document for the current state.');
    for (const e of r.entries) {
      const a = e.indexOf('|');
      const b = e.indexOf('|', a + 1);
      const who = e.slice(a + 1, b);
      if (who === ctx.clientId) continue;
      let ops: { t: string; node?: SceneNode; id?: string; name?: string }[] = [];
      try {
        ops = JSON.parse(e.slice(b + 1));
      } catch {
        continue;
      }
      const by = nameOf.get(who) ?? 'Someone';
      const changed = ops.filter((o) => o.t === 'node' && o.node).map((o) => `${o.node!.name} [${o.node!.type}] id=${o.node!.id}`);
      const deleted = ops.filter((o) => o.t === 'del').length;
      if (changed.length) lines.push(`${by} changed ${changed.length} layer${changed.length > 1 ? 's' : ''}: ${changed.slice(0, 12).join('; ')}${changed.length > 12 ? '…' : ''}`);
      if (deleted) lines.push(`${by} deleted ${deleted} layer${deleted > 1 ? 's' : ''}.`);
      if (ops.some((o) => o.t === 'pages')) lines.push(`${by} changed pages or page structure.`);
      if (ops.some((o) => o.t === 'name')) lines.push(`${by} renamed the file.`);
    }
    if (selKey(peers) !== startSel) {
      const doc = (await loadDoc(ctx)).doc;
      for (const p of peers) {
        const sel = p.selection.map((id) => doc.nodes[id]).filter(Boolean);
        lines.push(`${p.name} now has ${sel.length ? 'selected: ' + sel.map((n) => brief(n)).join('; ') : 'nothing selected'}.`);
      }
    }
    cursor = r.reset ? r.seq : Math.max(cursor, r.seq);
    if (lines.length) return `${lines.join('\n')}\n\nsince=${cursor} (pass this to watch_changes to keep following)`;
    if (Date.now() > deadline) return `No changes in the last ${Math.round(timeoutS)} s.\n\nsince=${cursor}`;
    await sleep(1000);
  }
}

async function userPage(ctx: Ctx, doc: Doc) {
  const peers = (await sync(ctx, { pageId: doc.pages[0].id, cursor: null, selection: [] })).filter((p) => !p.name.startsWith('🤖'));
  return peers.find((p) => doc.pages.some((pg) => pg.id === p.pageId))?.pageId ?? doc.pages[0].id;
}

async function callTool(ctx: Ctx, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_live_view': {
      const { doc, name: fileName } = await loadDoc(ctx);
      const peers = await sync(ctx, { pageId: doc.pages[0].id, cursor: null, selection: [] });
      const people = peers.filter((p) => !p.name.startsWith('🤖') || p.id !== ctx.clientId);
      const lines = [`File: "${fileName}" (${doc.pages.length} page${doc.pages.length > 1 ? 's' : ''}: ${doc.pages.map((p) => `${p.name} [${p.id}]`).join(', ')})`];
      if (!people.length) lines.push('Nobody else is online right now.');
      for (const p of people) {
        const page = doc.pages.find((pg) => pg.id === p.pageId);
        lines.push(`\n${p.name} is on page "${page?.name ?? '?'}"${p.cursor ? `, cursor at (${p.cursor.x}, ${p.cursor.y})` : ''}.`);
        const sel = p.selection.map((id) => doc.nodes[id]).filter(Boolean);
        lines.push(sel.length ? `  Selected:\n${sel.map((n) => `  - ${brief(n)}`).join('\n')}` : '  Nothing selected.');
      }
      return lines.join('\n');
    }
    case 'get_document': {
      const { doc } = await loadDoc(ctx);
      const pageId = String(args.pageId ?? (await userPage(ctx, doc)));
      const page = getPage(doc, pageId);
      return `Page "${page.name}" [${page.id}] (background ${page.bg}). Layers top → bottom:\n${outline(doc, page.id, Number(args.depth ?? 6))}`;
    }
    case 'get_layer': {
      const { doc } = await loadDoc(ctx);
      const n = doc.nodes[String(args.id)];
      if (!n) throw new Error('Layer not found.');
      const copy = { ...n, src: n.src && n.src.length > 200 ? n.src.slice(0, 60) + '…(image data omitted)' : n.src };
      return JSON.stringify(copy, null, 2);
    }
    case 'render_svg': {
      const { doc } = await loadDoc(ctx);
      const ids = args.id ? [String(args.id)] : getPage(doc, String(args.pageId ?? (await userPage(ctx, doc)))).children;
      const r = toSVG(doc, ids);
      return r ? stripImages(r.svg) : 'Nothing to render (empty page).';
    }
    case 'create_layer': {
      const type = String(args.type) as NodeType;
      if (!['frame', 'rect', 'ellipse', 'text', 'path', 'image', 'component'].includes(type)) throw new Error('Unsupported type.');
      const { doc: peek } = await loadDoc(ctx);
      const pageId = String(args.pageId ?? (await userPage(ctx, peek)));
      if (!peek.pages.some((p) => p.id === pageId)) throw new Error(`pageId not found. Pages: ${peek.pages.map((p) => `${p.name} [${p.id}]`).join(', ')}`);
      return edit(ctx, (doc) => {
        const parentId = args.parentId ? String(args.parentId) : null;
        if (parentId && !doc.nodes[parentId]) throw new Error('parentId not found.');
        if (parentId && !isFrameLike(doc.nodes[parentId])) throw new Error('parentId must be a frame, section or component.');
        // Inside a parent, the layer always lives on the parent's page.
        const page = parentId ? doc.nodes[parentId].pageId : pageId;
        const top = getPage(doc, page).children.map((id) => doc.nodes[id]).filter(Boolean);
        const b = bbox(top);
        const n = makeNode(type, page, {
          name: args.name ? String(args.name) : nextName(doc, type),
          x: Number(args.x ?? (parentId ? doc.nodes[parentId].x + 16 : b ? b.x + b.w + 80 : 0)),
          y: Number(args.y ?? (parentId ? doc.nodes[parentId].y + 16 : b ? b.y : 0)),
          w: Number(args.w ?? (type === 'frame' ? 400 : 100)),
          h: Number(args.h ?? (type === 'frame' ? 300 : 100)),
        });
        if (type === 'text') n.text = 'Text';
        insert(doc, n, parentId);
        applyProps(doc, n, (args.props as Record<string, unknown>) ?? {});
        return { focus: n.id, text: `Created ${brief(n)}` };
      });
    }
    case 'update_layer':
      return edit(ctx, (doc) => {
        const n = doc.nodes[String(args.id)];
        if (!n) throw new Error('Layer not found.');
        applyProps(doc, n, (args.props as Record<string, unknown>) ?? {});
        return { focus: n.id, text: `Updated ${brief(n)}` };
      });
    case 'delete_layer':
      return edit(ctx, (doc) => {
        const n = doc.nodes[String(args.id)];
        if (!n) throw new Error('Layer not found.');
        removeNode(doc, n.id);
        return { text: `Deleted ${n.name}.`, pageId: n.pageId };
      });
    case 'watch_changes':
      return watch(ctx, args.since === undefined ? undefined : Number(args.since), Number(args.timeoutSeconds ?? 20));
    case 'point_at': {
      const { doc } = await loadDoc(ctx);
      const n = doc.nodes[String(args.id)];
      if (!n) throw new Error('Layer not found.');
      await sync(ctx, { pageId: n.pageId, cursor: { x: Math.round(n.x + n.w / 2), y: Math.round(n.y + n.h / 2) }, selection: [n.id] });
      return `Pointing at ${n.name}. Collaborators see your cursor and highlight for about 15 seconds.`;
    }
  }
  throw new RpcError(-32602, `Unknown tool: ${name}`);
}

/* ---------- JSON-RPC ---------- */

interface RpcMsg {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

async function dispatch(ctx: Ctx, m: RpcMsg) {
  switch (m.method) {
    case 'initialize':
      return {
        protocolVersion: (m.params?.protocolVersion as string) ?? PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'vellum', title: 'Vellum design file', version: '0.5.0' },
        instructions:
          'You are connected to a live Vellum design file that people may be editing right now. Start with get_live_view to see who is online and what they selected, use get_document / render_svg to look at the design, then create_layer / update_layer to make changes. Everyone sees your edits and your 🤖 cursor live. To follow along as people work, call watch_changes repeatedly with the returned `since` cursor.',
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const name = String(m.params?.name ?? '');
      try {
        const text = await callTool(ctx, name, (m.params?.arguments as Record<string, unknown>) ?? {});
        return { content: [{ type: 'text', text }] };
      } catch (e) {
        if (e instanceof RpcError) throw e;
        return { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true };
      }
    }
    case 'resources/list':
      return { resources: [] };
    case 'prompts/list':
      return { prompts: [] };
  }
  throw new RpcError(-32601, `Method not found: ${m.method}`);
}

export async function handleMcp(req: Request, url: URL): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method === 'DELETE') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')
    return new Response('Vellum MCP endpoint. Connect an MCP client (Streamable HTTP) to this URL.', { status: 405, headers: { ...CORS, allow: 'POST, OPTIONS' } });

  const session = (req.headers.get('mcp-session-id') ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  const agent = (url.searchParams.get('name') ?? 'AI agent').slice(0, 30);

  // Auth: the project's edit token as a Bearer token. It also tells us which file this is.
  const auth = req.headers.get('authorization') ?? '';
  const bearer = /^Bearer\s+(\S+)$/i.exec(auth)?.[1] ?? '';
  // Legacy: ?token= in the URL still works, but secrets in URLs end up in logs, so prefer the header.
  const token = (bearer || url.searchParams.get('token') || '').replace(/[^A-Za-z0-9]/g, '');
  let room = (url.searchParams.get('room') ?? '').replace(/[^A-Za-z0-9]/g, '');
  const unauthorized = (message: string) =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message } }), {
      status: 401,
      headers: { ...CORS, 'content-type': 'application/json', 'www-authenticate': 'Bearer realm="vellum", error="invalid_token"' },
    });
  if (auth && !bearer) return unauthorized('Malformed Authorization header. Use: Authorization: Bearer <project token>');
  if (token) {
    const hash = await sha256(token);
    if (room) {
      if (!(await getStore().tokenMatches(room, hash))) return unauthorized('This token is not valid for this file.');
    } else {
      room = (await getStore().roomForToken(hash)) ?? '';
      if (!room) return unauthorized('Unknown or expired project token. Copy a fresh one from Share → Connect an AI agent.');
    }
  } else if (!room) {
    return unauthorized('Missing credentials. Send your project token as "Authorization: Bearer <token>" (Share → Connect an AI agent), or use ?room=<id> for read-only access.');
  }
  const ctx: Ctx = {
    room,
    token,
    agent,
    clientId: ('mcp' + (session || agent.replace(/[^A-Za-z0-9]/g, '') + 'agent')).slice(0, 40).padEnd(8, '0'),
  };

  let body: RpcMsg | RpcMsg[];
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400, headers: CORS });
  }
  const msgs = Array.isArray(body) ? body : [body];
  const replies: unknown[] = [];
  let isInit = false;
  for (const m of msgs) {
    if (m.method === 'initialize') isInit = true;
    if (m.id === undefined || m.id === null) continue; // notification
    try {
      replies.push({ jsonrpc: '2.0', id: m.id, result: await dispatch(ctx, m) });
    } catch (e) {
      replies.push({ jsonrpc: '2.0', id: m.id, error: { code: e instanceof RpcError ? e.code : -32603, message: e instanceof Error ? e.message : String(e) } });
    }
  }
  const headers: Record<string, string> = { ...CORS, 'content-type': 'application/json' };
  if (isInit) headers['mcp-session-id'] = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return new Response(JSON.stringify(Array.isArray(body) ? replies : replies[0]), { headers });
}
