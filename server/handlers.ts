import { getStore } from './store';
import { handleMcp } from './mcp';

/*
 * HTTP API for live collaboration. Runs as Vercel Edge Functions (see /api) and,
 * in local dev / preview, through the Vite middleware in vite.config.ts.
 *
 *   POST /api/rooms   { name, doc }                                    -> { id, token }
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

async function snapshot(url: URL) {
  const id = url.searchParams.get('id') ?? '';
  if (!ID.test(id)) return json({ error: 'Bad room id' }, 400);
  const snap = await getStore().snapshot(id);
  if (!snap) return json({ error: 'Room not found' }, 404);
  return new Response(`{"seq":${snap.seq},"name":${JSON.stringify(snap.name)},"pages":${snap.pages},"nodes":[${snap.nodes.join(',')}],"styles":${snap.styles || 'null'}}`, {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
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
    if (op.t === 'node' && typeof op.node?.id === 'string') upserts.push([op.node.id, JSON.stringify(op.node)]);
    else if (op.t === 'del' && typeof op.id === 'string') dels.push(op.id);
    else if (op.t === 'pages') pages = JSON.stringify(op.pages);
    else if (op.t === 'name') name = String(op.name).slice(0, 200);
    else if (op.t === 'styles') styles = JSON.stringify(op.styles);
  }
  const presence = JSON.stringify(b.presence ?? {}).slice(0, 4000);
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
