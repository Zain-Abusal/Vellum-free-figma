import { useStore } from '../store';
import { bbox, cloneSubtree, getPage, insert, makeNode, moveDeep, nextName, removeNode, resizeTo, siblings } from '../doc';
import { topLevel, worldCenter, zoomToBox } from '../actions';
import type { Doc, Pt, SceneNode } from '../types';
import type { Extension, ExtensionAPI, Values } from './types';

const S = () => useStore.getState();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function notify(message: string) {
  S().set({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => S().set({ toast: null }), 3500);
}

/** Edits inside a run skip history; runExtension takes one checkpoint first, so a run is one undo step. */
const edit = (fn: (d: Doc) => void) => S().update(fn, false);

function loadImage(src: string): Promise<{ src: string; w: number; h: number }> {
  return new Promise((res, rej) => {
    const finish = (dataUrl: string) => {
      const img = new Image();
      img.onload = () => res({ src: dataUrl, w: img.naturalWidth || 200, h: img.naturalHeight || 200 });
      img.onerror = () => rej(new Error('Could not load image'));
      img.src = dataUrl;
    };
    if (src.startsWith('data:')) return finish(src);
    // Inline remote images so files stay self-contained and exportable.
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`Image request failed (${r.status})`);
        return r.blob();
      })
      .then((b) => {
        const fr = new FileReader();
        fr.onload = () => finish(fr.result as string);
        fr.onerror = () => rej(fr.error);
        fr.readAsDataURL(b);
      })
      .catch(rej);
  });
}

export function createApi(): ExtensionAPI {
  const api: ExtensionAPI = {
    selection: () => {
      const s = S();
      return topLevel(s.doc, s.selection).map((id) => clone(s.doc.nodes[id]));
    },
    pageNodes: () => {
      const s = S();
      return Object.values(s.doc.nodes)
        .filter((n) => n.pageId === s.pageId)
        .map(clone);
    },
    get: (id) => {
      const n = S().doc.nodes[id];
      return n ? clone(n) : undefined;
    },
    children: (id) => (S().doc.nodes[id]?.children ?? []).map((c) => clone(S().doc.nodes[c])),
    page: () => {
      const p = getPage(S().doc, S().pageId);
      return { id: p.id, name: p.name, bg: p.bg };
    },
    create: (type, props = {}, parentId = null) => {
      const s = S();
      const node = makeNode(type, s.pageId, props);
      edit((d) => {
        if (!props.name) node.name = nextName(d, type);
        insert(d, node, parentId && d.nodes[parentId] ? parentId : null);
      });
      return node.id;
    },
    update: (id, patch) =>
      edit((d) => {
        const n = d.nodes[id];
        if (!n) return;
        const { x, y, w, h, id: _id, children: _c, parentId: _p, pageId: _pg, ...rest } = patch;
        Object.assign(n, rest);
        if (x !== undefined || y !== undefined) moveDeep(d, id, (x ?? n.x) - n.x, (y ?? n.y) - n.y);
        if (w !== undefined || h !== undefined) resizeTo(d, id, { x: n.x, y: n.y, w: w ?? n.w, h: h ?? n.h });
      }),
    remove: (id) => edit((d) => removeNode(d, id)),
    duplicate: (id, dx = 0, dy = 0) => {
      let out: string | null = null;
      edit((d) => {
        const n = d.nodes[id];
        if (n) out = cloneSubtree(d, id, d, n.parentId, n.pageId, siblings(d, n).indexOf(id) + 1, dx, dy);
      });
      return out;
    },
    group: (ids) => {
      const s = S();
      const valid = ids.filter((id) => s.doc.nodes[id]);
      if (!valid.length) return null;
      const first = s.doc.nodes[valid[0]];
      const g = makeNode('group', first.pageId);
      edit((d) => {
        g.name = nextName(d, 'group');
        const sib = siblings(d, d.nodes[first.id]);
        insert(d, g, first.parentId, Math.max(...valid.map((id) => sib.indexOf(id))) + 1);
        for (const id of valid) {
          const n = d.nodes[id];
          const list = siblings(d, n);
          list.splice(list.indexOf(id), 1);
          n.parentId = g.id;
          d.nodes[g.id].children.push(id);
        }
      });
      return g.id;
    },
    addImage: async (src, opts = {}) => {
      const im = await loadImage(src);
      const w = opts.width ?? Math.min(im.w, 400);
      const h = Math.round((w * im.h) / im.w);
      const at = opts.at ?? worldCenter();
      return api.create('image', { src: im.src, x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h, name: opts.name }, opts.parentId);
    },
    addSvg: (svg, opts = {}) => api.addImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), opts),
    select: (ids) => S().select(ids.filter((id) => S().doc.nodes[id])),
    viewportCenter: () => worldCenter(),
    zoomTo: (ids) => zoomToBox(bbox(ids.map((id) => S().doc.nodes[id]).filter(Boolean)), 4),
    notify,
    download: (filename, content, mime = 'text/plain') => {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };
  return api;
}

let last: { ext: Extension; values: Values } | null = null;
export const lastRun = () => last;

export async function runExtension(ext: Extension, values: Values) {
  const s = S();
  if (s.readOnly) return notify('This file is view-only.');
  if (ext.needsSelection && !s.selection.length) return notify(`${ext.name}: select some layers first.`);
  s.checkpoint();
  const before = S().doc;
  try {
    const msg = await ext.run(createApi(), values);
    last = { ext, values };
    if (msg) notify(msg);
    else if (S().doc === before) notify(`${ext.name}: nothing to change.`);
  } catch (e) {
    notify(`${ext.name} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  // Drop the checkpoint if nothing changed, so undo isn't wasted.
  if (S().doc === before) S().set({ past: S().past.slice(0, -1) });
}

export type { Pt, SceneNode };
