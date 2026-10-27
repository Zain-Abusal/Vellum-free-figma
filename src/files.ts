import type { Doc, Version } from './types';

export interface FileRecord {
  id: string;
  name: string;
  updated: number;
  doc: Doc;
  versions: Version[];
  thumb?: string;
  /** Set when this file is a live, shared room. */
  room?: { id: string; token?: string };
}

/*
 * Storage: IndexedDB is the main store (large quota, holds images).
 * localStorage is a synchronous mirror so the very latest edits survive a tab close
 * (IDB writes are async and can be cut off), and a fallback when IDB is unavailable.
 */

let dbp: Promise<IDBDatabase> | null = null;

function db() {
  return (dbp ??= new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB unavailable'));
    const r = indexedDB.open('vellum', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const req = fn(d.transaction('files', mode).objectStore('files'));
        req.onsuccess = () => res(req.result as T);
        req.onerror = () => rej(req.error);
      }),
  );
}

const LS = 'vellum:file:';

type LocalRecord = FileRecord & { partial?: boolean };

function lsKeys() {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LS)) out.push(k);
    }
  } catch {
    /* storage blocked */
  }
  return out;
}

function readLocal(id: string): LocalRecord | null {
  try {
    const raw = localStorage.getItem(LS + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Synchronous best-effort write. Evicts other files' mirrors, then drops versions, if over quota. */
export function saveLocal(f: FileRecord): boolean {
  const tryWrite = (rec: LocalRecord) => {
    try {
      localStorage.setItem(LS + f.id, JSON.stringify(rec));
      return true;
    } catch {
      return false;
    }
  };
  const full: LocalRecord = { ...f, thumb: undefined };
  if (tryWrite(full)) return true;
  const others = lsKeys()
    .filter((k) => k !== LS + f.id)
    .map((k) => ({ k, t: readLocal(k.slice(LS.length))?.updated ?? 0 }))
    .sort((a, b) => a.t - b.t);
  for (const o of others) {
    try {
      localStorage.removeItem(o.k);
    } catch {
      /* ignore */
    }
    if (tryWrite(full)) return true;
  }
  return tryWrite({ ...full, versions: [], partial: true });
}

const removeLocal = (id: string) => {
  try {
    localStorage.removeItem(LS + id);
  } catch {
    /* ignore */
  }
};

/** Newest of the IDB record and the localStorage mirror. */
function newest(idb: FileRecord | undefined, local: LocalRecord | null): FileRecord | undefined {
  if (!local) return idb;
  if (!idb || local.updated > idb.updated) {
    const { partial, ...rec } = local;
    return { ...rec, versions: partial && idb ? idb.versions : rec.versions, thumb: idb?.thumb };
  }
  return idb;
}

export async function listFiles(): Promise<FileRecord[]> {
  const idb = await tx<FileRecord[]>('readonly', (s) => s.getAll()).catch(() => [] as FileRecord[]);
  const byId = new Map(idb.map((f) => [f.id, f]));
  for (const k of lsKeys()) {
    const id = k.slice(LS.length);
    const merged = newest(byId.get(id), readLocal(id));
    if (merged) byId.set(id, merged);
  }
  return [...byId.values()].sort((a, b) => b.updated - a.updated);
}

export async function getFile(id: string) {
  const idb = await tx<FileRecord | undefined>('readonly', (s) => s.get(id)).catch(() => undefined);
  return newest(idb, readLocal(id));
}

export async function putFile(f: FileRecord) {
  saveLocal(f);
  await tx<IDBValidKey>('readwrite', (s) => s.put(f)).catch((e) => {
    if (!readLocal(f.id)) throw e;
  });
}

export async function deleteFile(id: string) {
  removeLocal(id);
  await tx<undefined>('readwrite', (s) => s.delete(id)).catch(() => undefined);
}

/** Accepts our export wrapper or a bare Doc. */
export function parseDocJson(text: string): { name?: string; doc: Doc } | null {
  try {
    const j = JSON.parse(text);
    const doc = j?.doc ?? j;
    if (!Array.isArray(doc?.pages) || typeof doc?.nodes !== 'object') return null;
    return { name: j?.name, doc };
  } catch {
    return null;
  }
}

/* ---------- per-file view prefs ---------- */

export function savePrefs(fileId: string, prefs: Record<string, unknown>) {
  try {
    localStorage.setItem('vellum:prefs:' + fileId, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function loadPrefs<T>(fileId: string): Partial<T> {
  try {
    return JSON.parse(localStorage.getItem('vellum:prefs:' + fileId) ?? '{}');
  } catch {
    return {};
  }
}
