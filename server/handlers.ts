import { getStore } from './store';
import { handleMcp } from './mcp';

/*
 * HTTP API for live collaboration. Runs as Vercel Edge Functions (see /api) and,
 * in local dev / preview, through the Vite middleware in vite.config.ts.
 *
 *   POST /api/rooms   { name, doc }                                    -> { id, token }
 *   POST /api/rooms/rotate { room, token }                         -> { token }  (revokes the old edit link)
 *   GET  /api/room?id=                                                 -> { seq, name, pages, nodes }
 *   POST /api/sync    { room, clientId, since, token?, ops?, presence } -> { seq, pushed, canEdit, reset, entries, peers }
 *   POST /api/mcp?room=&token=&name=  (MCP, Streamable HTTP; see docs/MCP.md)
 *   GET  /api/health                                                   -> { ok, storage }
 */

type Op = { t: 'node'; node: { id: string } } | { t: 'del'; id: string } | { t: 'pages'; pages: unknown } | { t: 'name'; name: string } | { t: 'styles'; styles: unknown };

const ID = /^[A-Za-z0-9]{6,40}$/;
const MAX_BODY = 4_000_000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function randomId(len: number) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function body<T>(req: Request): Promise<T | null> {
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function createRoom(req: Request) {
  const b = await body<{ name?: string; doc?: { pages?: unknown[]; nodes?: Record<string, { id: string }>; styles?: unknown } }>(req);
  if (!b?.doc || !Array.isArray(b.doc.pages) || typeof b.doc.nodes !== 'object') return json({ error: 'Invalid document (or larger than 4 MB).' }, 400);
  const id = randomId(12);
  const token = randomId(24);
  const nodes = Object.values(b.doc.nodes).map((n) => [n.id, JSON.stringify(n)] as [string, string]);
  await getStore().create(id, await sha256(token), String(b.name ?? 'Untitled').slice(0, 200), JSON.stringify(b.doc.pages), nodes, b.doc.styles ? JSON.stringify(b.doc.styles) : '');
  return json({ id, token });
}

async function rotate(req: Request) {
  const b = await body<{ room?: string; token?: string }>(req);
  if (!b || !ID.test(b.room ?? '') || !ID.test(b.token ?? '')) return json({ error: 'Bad request' }, 400);
  const token = randomId(24);
  const ok = await getStore().rotateToken(b.room!, await sha256(b.token!), await sha256(token));
  return ok ? json({ token }) : json({ error: 'Only someone with the current edit link can reset it.' }, 403);
}

async function snapshot(url: URL) {
  const id = url.searchParams.get('id') ?? '';
  if (!ID.test(id)) return json({ error: 'Bad room id' }, 400);
  const snap = await getStore().snapshot(id);
  if (!snap) return json({ error: 'Room not found' }, 404);
  return new Response(`{"seq":${snap.seq},"name":${JSON.stringify(snap.name)},"pages":${snap.pages},"nodes":[${snap.nodes.join(',')}],"styles":${snap.styles || 'null'}}`, {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Presence is relayed to every collaborator, so it must always be well-formed and small. */
export function cleanPresence(p: unknown, clientId: string): string {
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number, dflt = '') => (typeof v === 'string' ? v.slice(0, max) : dflt);
  const c = o.cursor as Record<string, unknown> | null;
  const cursor = c && typeof c === 'object' && Number.isFinite(c.x) && Number.isFinite(c.y) ? { x: Math.round(Number(c.x)), y: Math.round(Number(c.y)) } : null;
  const color = str(o.color, 7);
  return JSON.stringify({
    id: clientId,
    name: str(o.name, 64, 'Guest') || 'Guest',
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#8c8c8c',
    pageId: str(o.pageId, 64),
    cursor,
    selection: Array.isArray(o.selection) ? o.selection.filter((x): x is string => typeof x === 'string').slice(0, 50).map((x) => x.slice(0, 64)) : [],
  });
}

async function sync(req: Request) {
  const b = await body<{ room: string; clientId: string; since: number; token?: string; ops?: Op[]; presence?: unknown }>(req);
  if (!b || !ID.test(b.room ?? '') || !ID.test(b.clientId ?? '') || typeof b.since !== 'number') return json({ error: 'Bad request' }, 400);
  const ops = Array.isArray(b.ops) ? b.ops : [];
  const upserts: [string, string][] = [];
  const dels: string[] = [];
  let pages = '';
  let name = '';
  let styles = '';
  for (const op of ops) {
    if (op.t === 'node') {
      if (typeof op.node?.id !== 'string' || !/^[\w-]{1,64}$/.test(op.node.id)) return json({ error: 'Invalid node op' }, 400);
      upserts.push([op.node.id, JSON.stringify(op.node)]);
    }
    else if (op.t === 'del' && typeof op.id === 'string') dels.push(op.id);
    else if (op.t === 'pages') {
      if (!Array.isArray(op.pages)) return json({ error: 'Invalid pages op' }, 400);
      pages = JSON.stringify(op.pages);
    }
    else if (op.t === 'name') name = String(op.name).slice(0, 200);
    else if (op.t === 'styles') styles = JSON.stringify(op.styles);
  }
  const presence = cleanPresence(b.presence, b.clientId);
  const r = await getStore().sync({
    room: b.room,
    clientId: b.clientId,
    since: b.since,
    tokenHash: b.token ? await sha256(b.token) : '',
    presence,
    now: Date.now(),
    opsJson: ops.length ? JSON.stringify(ops) : '',
    upserts,
    dels,
    pages,
    name,
    styles,
  });
  if (r.missing) return json({ error: 'Room not found' }, 404);
  // Entries are "seq|clientId|opsJson"; splice them into the response without re-parsing.
  const entries = r.entries.map((e) => {
    const a = e.indexOf('|');
    const c = e.indexOf('|', a + 1);
    return `{"seq":${e.slice(0, a)},"c":${JSON.stringify(e.slice(a + 1, c))},"ops":${e.slice(c + 1)}}`;
  });
  const peers = r.presence.map((p) => p.slice(p.indexOf('|') + 1));
  return new Response(`{"seq":${r.seq},"pushed":${r.pushed},"canEdit":${r.canEdit},"reset":${r.reset},"entries":[${entries.join(',')}],"peers":[${peers.join(',')}]}`, {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  try {
    if (path === 'rooms' && req.method === 'POST') return await createRoom(req);
    if (path === 'rooms/rotate' && req.method === 'POST') return await rotate(req);
    if (path === 'room' && req.method === 'GET') return await snapshot(url);
    if (path === 'sync' && req.method === 'POST') return await sync(req);
    if (path === 'mcp') return await handleMcp(req, url);
    if (path === 'health') return json({ ok: true, storage: getStore().kind });
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: 'Server error' }, 500);
  }
}
