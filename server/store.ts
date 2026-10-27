import { Redis } from '@upstash/redis';

/*
 * Room storage. Each room has:
 *   meta      hash   { name, edit: sha256(editToken) }
 *   seq       int    latest change number
 *   nodes     hash   nodeId -> node JSON (current snapshot)
 *   pages     string pages JSON
 *   log       zset   recent change batches, score = seq, member = "seq|clientId|opsJson"
 *   presence  hash   clientId -> "timestampMs|presenceJson"
 * Production uses Upstash Redis (one atomic Lua script per sync). Local dev falls back to memory.
 */

export interface SyncArgs {
  room: string;
  clientId: string;
  since: number;
  tokenHash: string;
  presence: string;
  now: number;
  opsJson: string;
  upserts: [string, string][];
  dels: string[];
  pages: string;
  name: string;
}

export interface SyncResult {
  missing?: boolean;
  seq: number;
  pushed: number;
  canEdit: boolean;
  reset: boolean;
  entries: string[];
  presence: string[];
}

export interface Snapshot {
  seq: number;
  name: string;
  pages: string;
  nodes: string[];
}

export interface RoomStore {
  kind: 'redis' | 'memory';
  create(room: string, editHash: string, name: string, pages: string, nodes: [string, string][]): Promise<void>;
  snapshot(room: string): Promise<Snapshot | null>;
  sync(a: SyncArgs): Promise<SyncResult>;
}

const TTL = 60 * 60 * 24 * 30; // rooms expire 30 days after the last edit
const LOG_KEEP = 400;
const PRESENCE_MS = 15000;

const keys = (room: string) => {
  const k = (s: string) => `vellum:{${room}}:${s}`;
  return [k('meta'), k('seq'), k('nodes'), k('pages'), k('log'), k('presence')];
};

const SYNC_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return {-1} end
local canEdit = 0
if ARGV[3] ~= '' and redis.call('HGET', KEYS[1], 'edit') == ARGV[3] then canEdit = 1 end
local pushed = 0
if canEdit == 1 and ARGV[7] ~= '' then
  local nUp = tonumber(ARGV[10])
  local i = 11
  for k = 1, nUp do
    redis.call('HSET', KEYS[3], ARGV[i], ARGV[i + 1])
    i = i + 2
  end
  while i <= #ARGV do
    redis.call('HDEL', KEYS[3], ARGV[i])
    i = i + 1
  end
  if ARGV[8] ~= '' then redis.call('SET', KEYS[4], ARGV[8]) end
  if ARGV[9] ~= '' then redis.call('HSET', KEYS[1], 'name', ARGV[9]) end
  pushed = redis.call('INCR', KEYS[2])
  redis.call('ZADD', KEYS[5], pushed, pushed .. '|' .. ARGV[1] .. '|' .. ARGV[7])
  redis.call('ZREMRANGEBYRANK', KEYS[5], 0, -${LOG_KEEP + 1})
  for k = 1, 5 do redis.call('EXPIRE', KEYS[k], ${TTL}) end
end
redis.call('HSET', KEYS[6], ARGV[1], ARGV[5] .. '|' .. ARGV[4])
redis.call('EXPIRE', KEYS[6], 3600)
local seq = tonumber(redis.call('GET', KEYS[2]) or '0')
local since = tonumber(ARGV[2])
local reset = 0
local entries = {}
if since > seq then
  reset = 1
elseif since < seq then
  local first = redis.call('ZRANGE', KEYS[5], 0, 0, 'WITHSCORES')
  if first[2] == nil or tonumber(first[2]) > since + 1 then
    reset = 1
  else
    entries = redis.call('ZRANGEBYSCORE', KEYS[5], '(' .. since, '+inf')
  end
end
local now = tonumber(ARGV[5])
local pres = redis.call('HGETALL', KEYS[6])
local alive = {}
for k = 1, #pres, 2 do
  local ts = tonumber(string.match(pres[k + 1], '^(%d+)|'))
  if ts and now - ts < ${PRESENCE_MS} then
    if pres[k] ~= ARGV[1] then table.insert(alive, pres[k + 1]) end
  else
    redis.call('HDEL', KEYS[6], pres[k])
  end
end
return {seq, pushed, canEdit, reset, entries, alive}
`;

const SNAPSHOT_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return {-1} end
return {tonumber(redis.call('GET', KEYS[2]) or '0'), redis.call('HGET', KEYS[1], 'name') or '', redis.call('GET', KEYS[4]) or '[]', redis.call('HVALS', KEYS[3])}
`;

function redisStore(redis: Redis): RoomStore {
  return {
    kind: 'redis',
    async create(room, editHash, name, pages, nodes) {
      const [meta, seq, nodesKey, pagesKey, log] = keys(room);
      const p = redis.pipeline();
      p.hset(meta, { name, edit: editHash, created: String(Date.now()) });
      p.set(seq, '0');
      p.set(pagesKey, pages);
      // Keep each request well under Upstash's request-size limit.
      let batch: Record<string, string> = {};
      let size = 0;
      for (const [id, json] of nodes) {
        batch[id] = json;
        size += json.length;
        if (size > 600_000) {
          p.hset(nodesKey, batch);
          batch = {};
          size = 0;
        }
      }
      if (Object.keys(batch).length) p.hset(nodesKey, batch);
      for (const k of [meta, seq, nodesKey, pagesKey, log]) p.expire(k, TTL);
      await p.exec();
    },
    async snapshot(room) {
      const r = (await redis.eval(SNAPSHOT_LUA, keys(room), [])) as unknown[];
      if (r[0] === -1) return null;
      return { seq: Number(r[0]), name: String(r[1] ?? ''), pages: String(r[2]), nodes: (r[3] as string[]) ?? [] };
    },
    async sync(a) {
      const args = [a.clientId, String(a.since), a.tokenHash, a.presence, String(a.now), '', a.opsJson, a.pages, a.name, String(a.upserts.length), ...a.upserts.flat(), ...a.dels];
      const r = (await redis.eval(SYNC_LUA, keys(a.room), args)) as unknown[];
      if (r[0] === -1) return { missing: true, seq: 0, pushed: 0, canEdit: false, reset: false, entries: [], presence: [] };
      return {
        seq: Number(r[0]),
        pushed: Number(r[1]),
        canEdit: Number(r[2]) === 1,
        reset: Number(r[3]) === 1,
        entries: (r[4] as string[]) ?? [],
        presence: (r[5] as string[]) ?? [],
      };
    },
  };
}

interface MemRoom {
  meta: Record<string, string>;
  seq: number;
  nodes: Map<string, string>;
  pages: string;
  log: { seq: number; v: string }[];
  presence: Map<string, string>;
}

/** Same semantics as the Lua scripts, for local development. Not shared between server instances. */
function memoryStore(): RoomStore {
  const g = globalThis as unknown as { __vellumRooms?: Map<string, MemRoom> };
  const rooms = (g.__vellumRooms ??= new Map<string, MemRoom>());
  return {
    kind: 'memory',
    async create(room, editHash, name, pages, nodes) {
      rooms.set(room, { meta: { name, edit: editHash }, seq: 0, nodes: new Map(nodes), pages, log: [], presence: new Map() });
    },
    async snapshot(room) {
      const r = rooms.get(room);
      return r ? { seq: r.seq, name: r.meta.name, pages: r.pages, nodes: [...r.nodes.values()] } : null;
    },
    async sync(a) {
      const r = rooms.get(a.room);
      if (!r) return { missing: true, seq: 0, pushed: 0, canEdit: false, reset: false, entries: [], presence: [] };
      const canEdit = !!a.tokenHash && r.meta.edit === a.tokenHash;
      let pushed = 0;
      if (canEdit && a.opsJson) {
        for (const [id, json] of a.upserts) r.nodes.set(id, json);
        for (const id of a.dels) r.nodes.delete(id);
        if (a.pages) r.pages = a.pages;
        if (a.name) r.meta.name = a.name;
        pushed = ++r.seq;
        r.log.push({ seq: pushed, v: `${pushed}|${a.clientId}|${a.opsJson}` });
        if (r.log.length > LOG_KEEP) r.log.splice(0, r.log.length - LOG_KEEP);
      }
      r.presence.set(a.clientId, `${a.now}|${a.presence}`);
      let reset = false;
      let entries: string[] = [];
      if (a.since > r.seq) reset = true;
      else if (a.since < r.seq) {
        if (!r.log.length || r.log[0].seq > a.since + 1) reset = true;
        else entries = r.log.filter((e) => e.seq > a.since).map((e) => e.v);
      }
      const presence: string[] = [];
      for (const [id, v] of r.presence) {
        const ts = Number(v.slice(0, v.indexOf('|')));
        if (a.now - ts < PRESENCE_MS) {
          if (id !== a.clientId) presence.push(v);
        } else r.presence.delete(id);
      }
      return { seq: r.seq, pushed, canEdit, reset, entries, presence };
    },
  };
}

let store: RoomStore | null = null;

export function getStore(): RoomStore {
  if (store) return store;
  const env = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  store = url && token ? redisStore(new Redis({ url, token, automaticDeserialization: false })) : memoryStore();
  return store;
}
