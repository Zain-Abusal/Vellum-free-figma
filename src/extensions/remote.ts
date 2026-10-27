import { useSyncExternalStore } from 'react';
import type { Extension, ExtensionAPI, Field } from './types';

/*
 * Third-party extensions loaded from a URL (an ES module with a default-exported extension).
 * Each runs in its own sandboxed iframe (sandbox="allow-scripts", opaque origin): no access to
 * the page, storage or cookies. It talks to Vellum only through postMessage calls that map onto a
 * whitelisted subset of the ExtensionAPI, so every API call is async on the extension's side.
 */

const KEY = 'vellum:remote-extensions';
const ALLOWED = new Set<keyof ExtensionAPI>(['selection', 'pageNodes', 'get', 'children', 'page', 'create', 'update', 'remove', 'duplicate', 'group', 'addImage', 'addSvg', 'select', 'viewportCenter', 'zoomTo', 'notify', 'download']);

export interface RemoteEntry {
  url: string;
  ext?: Extension;
  error?: string;
}

let entries: RemoteEntry[] = [];
const listeners = new Set<() => void>();
const emit = () => {
  entries = [...entries];
  listeners.forEach((l) => l());
};
const frames = new Map<string, HTMLIFrameElement>();

function loadUrls(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveUrls() {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.map((e) => e.url)));
  } catch {
    /* ignore */
  }
}

const srcdoc = (url: string) => `<!doctype html><script type="module">
const pending = new Map(); let seq = 0; let ext;
const call = (method, args) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); parent.postMessage({ type: 'call', id, method, args }, '*'); });
const api = new Proxy({}, { get: (_, method) => (...args) => call(method, args) });
addEventListener('message', async (e) => {
  const m = e.data || {};
  if (m.type === 'result') { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.rej(new Error(m.error)) : p.res(m.value); }
  if (m.type === 'run') {
    try { const out = await ext.run(api, m.values || {}); parent.postMessage({ type: 'done', runId: m.runId, value: typeof out === 'string' ? out : undefined }, '*'); }
    catch (err) { parent.postMessage({ type: 'done', runId: m.runId, error: String((err && err.message) || err) }, '*'); }
  }
});
try {
  ext = (await import(${JSON.stringify(url)})).default;
  if (!ext || typeof ext.run !== 'function') throw new Error('The module must default-export an extension with a run() function.');
  parent.postMessage({ type: 'meta', meta: { id: String(ext.id || 'remote'), name: String(ext.name || 'Remote extension'), description: String(ext.description || ''), icon: ext.icon ? String(ext.icon) : undefined, inputs: Array.isArray(ext.inputs) ? ext.inputs : [], needsSelection: !!ext.needsSelection } }, '*');
} catch (err) { parent.postMessage({ type: 'loadError', error: String((err && err.message) || err) }, '*'); }
</script>`;

function load(entry: RemoteEntry) {
  frames.get(entry.url)?.remove();
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.style.display = 'none';
  frame.srcdoc = srcdoc(entry.url);
  frames.set(entry.url, frame);

  let api: ExtensionAPI | null = null;
  const runs = new Map<number, { resolve: (v?: string) => void; reject: (e: Error) => void }>();
  let runSeq = 0;
  const post = (m: unknown) => frame.contentWindow?.postMessage(m, '*');

  window.addEventListener('message', async (e) => {
    if (e.source !== frame.contentWindow) return;
    const m = e.data ?? {};
    if (m.type === 'meta') {
      entry.error = undefined;
      entry.ext = {
        id: 'remote:' + m.meta.id,
        name: m.meta.name,
        description: m.meta.description,
        icon: m.meta.icon ?? '🌐',
        inputs: m.meta.inputs as Field[],
        needsSelection: m.meta.needsSelection,
        run: (runApi, values) =>
          new Promise<string | void>((resolve, reject) => {
            api = runApi;
            const runId = ++runSeq;
            runs.set(runId, { resolve, reject });
            const t = setTimeout(() => {
              runs.delete(runId);
              api = null;
              reject(new Error('Timed out after 60 s'));
            }, 60_000);
            const done = runs.get(runId)!;
            runs.set(runId, {
              resolve: (v) => (clearTimeout(t), (api = null), done.resolve(v)),
              reject: (err) => (clearTimeout(t), (api = null), done.reject(err)),
            });
            post({ type: 'run', runId, values: JSON.parse(JSON.stringify(values)) });
          }),
      };
      emit();
    } else if (m.type === 'loadError') {
      entry.error = m.error;
      emit();
    } else if (m.type === 'call') {
      const method = m.method as keyof ExtensionAPI;
      try {
        if (!api) throw new Error('API calls are only allowed while the extension is running.');
        if (!ALLOWED.has(method)) throw new Error(`Not allowed: ${String(method)}`);
        const fn = api[method] as (...a: unknown[]) => unknown;
        const value = await fn(...(Array.isArray(m.args) ? m.args : []));
        post({ type: 'result', id: m.id, value: value === undefined ? undefined : JSON.parse(JSON.stringify(value)) });
      } catch (err) {
        post({ type: 'result', id: m.id, error: err instanceof Error ? err.message : String(err) });
      }
    } else if (m.type === 'done') {
      const r = runs.get(m.runId);
      runs.delete(m.runId);
      if (r) m.error ? r.reject(new Error(m.error)) : r.resolve(m.value);
    }
  });
  document.body.appendChild(frame);
}

let started = false;
export function initRemoteExtensions() {
  if (started) return;
  started = true;
  entries = loadUrls().map((url) => ({ url }));
  entries.forEach(load);
  emit();
}

export function installRemoteExtension(url: string) {
  const u = new URL(url, location.href).toString();
  if (!/^https?:/.test(u)) throw new Error('Use an http(s) URL to an ES module.');
  if (entries.some((e) => e.url === u)) return;
  const entry: RemoteEntry = { url: u };
  entries.push(entry);
  saveUrls();
  load(entry);
  emit();
}

export function removeRemoteExtension(url: string) {
  frames.get(url)?.remove();
  frames.delete(url);
  entries = entries.filter((e) => e.url !== url);
  saveUrls();
  emit();
}

export const getRemoteExtensions = () => entries;

export function useRemoteExtensions() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => entries,
  );
}
