import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { fontStack, NodeView } from '../render';
import { ancestry, bbox, cloneSubtree, descendants, frameAt, getPage, insert, inside, intersects, isFrameLike, makeNode, moveDeep, moveTo, nextName, pathFromAbs, removeNode, resizeTo, siblings, type Box } from '../doc';
import { absRings, getRings, ringsFromAbs, ringsToD, setAbsRings, shapePoints } from '../geometry';
import { addImageFiles, editText, insertInstance, resolveHit, setProps, topLevel, viewport, zoomToFit } from '../actions';
import { reportCursor } from '../collab';
import { CURSOR, HANDLE_ANGLE, resizeCursor } from '../cursors';
import { loadPrefs } from '../files';
import type { Doc, PathPoint, Pt, SceneNode } from '../types';
import ContextMenu from './ContextMenu';
import { useUiPrefs } from '../uiPrefs';
import { CommentsLayer, Measure, Rulers } from './Overlays';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'marquee'; start: Pt; base: string[] }
  | { kind: 'move'; start: Pt; ids: string[]; startBox: Box; orig: Record<string, Pt>; started: boolean; alt: boolean; hit: string }
  | { kind: 'resize'; start: Pt; handle: string; startBox: Box; ids: string[]; orig: Record<string, SceneNode>; started: boolean; keepAspect: boolean; scale: boolean }
  | { kind: 'rotate'; id: string; c: Pt; a0: number; r0: number; started: boolean }
  | { kind: 'vpoint'; id: string; r: number; i: number; start: Pt; orig: PathPoint[][]; started: boolean }
  | { kind: 'vhandle'; id: string; r: number; i: number; which: 'in' | 'out'; orig: PathPoint[][]; started: boolean }
  | { kind: 'penHandle'; idx: number; start: Pt }
  | { kind: 'create'; start: Pt; id: string; type: SceneNode['type']; line: boolean };

interface MoveEvent {
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const ACCENT = 'var(--accent)';
const PURPLE = 'var(--component)';

function handlePos(h: string, b: Box): Pt {
  const x = h.includes('w') ? b.x : h.includes('e') ? b.x + b.w : b.x + b.w / 2;
  const y = h.includes('n') ? b.y : h.includes('s') ? b.y + b.h : b.y + b.h / 2;
  return { x, y };
}

/** Snap a moving box to sibling / parent edges and centres. */
function snap(doc: Doc, ids: string[], box: Box, dx: number, dy: number, th: number) {
  const first = doc.nodes[ids[0]];
  const parent = first.parentId ? doc.nodes[first.parentId] : null;
  if (parent?.autoLayout) return { dx: 0, dy: 0, gx: null, gy: null };
  const cand: Box[] = [];
  for (const id of siblings(doc, first)) {
    const n = doc.nodes[id];
    if (!ids.includes(id) && n?.visible) cand.push(n);
  }
  if (parent) cand.push(parent);
  const bx = [box.x + dx, box.x + dx + box.w / 2, box.x + dx + box.w];
  const by = [box.y + dy, box.y + dy + box.h / 2, box.y + dy + box.h];
  let sx: number | null = null, sy: number | null = null, gx: number | null = null, gy: number | null = null;
  for (const c of cand) {
    for (const t of [c.x, c.x + c.w / 2, c.x + c.w])
      for (const a of bx) {
        const diff = t - a;
        if (Math.abs(diff) <= th && (sx === null || Math.abs(diff) < Math.abs(sx))) {
          sx = diff;
          gx = t;
        }
      }
    for (const t of [c.y, c.y + c.h / 2, c.y + c.h])
      for (const a of by) {
        const diff = t - a;
        if (Math.abs(diff) <= th && (sy === null || Math.abs(diff) < Math.abs(sy))) {
          sy = diff;
          gy = t;
        }
      }
  }
  return { dx: sx ?? 0, dy: sy ?? 0, gx, gy };
}

/** Pages on the default background follow the light/dark theme. */
const DEFAULT_BG = '#f5f5f5';

const CREATE_TOOLS = new Set(['frame', 'section', 'rect', 'ellipse', 'line', 'arrow', 'polygon', 'star']);

export default function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const doc = useStore((s) => s.doc);
  const pageId = useStore((s) => s.pageId);
  const selection = useStore((s) => s.selection);
  const camera = useStore((s) => s.camera);
  const tool = useStore((s) => s.tool);
  const editingTextId = useStore((s) => s.editingTextId);
  const vectorEditId = useStore((s) => s.vectorEditId);
  const hoverId = useStore((s) => s.hoverId);
  const preview = useStore((s) => s.dragPreview);
  const showRulers = useStore((s) => s.showRulers);
  const showGrids = useStore((s) => s.showGrids);
  const { canvasDots } = useUiPrefs();
  const outlineMode = useStore((s) => s.outlineMode);
  const readOnly = useStore((s) => s.readOnly);
  const peers = useStore((s) => s.collab?.peers);
  const fileId = useStore((s) => s.fileId);

  const drag = useRef<Drag | null>(null);
  const moveEv = useRef<MoveEvent | null>(null);
  const raf = useRef(0);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [pen, setPenState] = useState<PathPoint[] | null>(null);
  const penRef = useRef<PathPoint[] | null>(null);
  const setPen = (p: PathPoint[] | null) => {
    penRef.current = p;
    setPenState(p);
  };
  const [penHover, setPenHover] = useState<Pt | null>(null);
  const [space, setSpace] = useState(false);
  const [alt, setAlt] = useState(false);
  const [dragCursor, setDragCursor] = useState<string | null>(null);
  const [menu, setMenu] = useState<Pt | null>(null);
  const [vSel, setVSel] = useState<{ r: number; i: number } | null>(null);
  const [draft, setDraft] = useState<Pt | null>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });

  const get = useStore.getState;

  const toWorld = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    const c = get().camera;
    return { x: (e.clientX - r.left - c.x) / c.zoom, y: (e.clientY - r.top - c.y) / c.zoom };
  };

  /** FLIP: animate layers from where they were on screen to where the edit puts them. */
  const flip = (ids: string[], mutate: () => void) => {
    const svg = svgRef.current!;
    const el = (id: string) => svg.querySelector<SVGGElement>(`[data-id="${id}"]`);
    const before = new Map<string, DOMRect>();
    for (const id of ids) {
      const e = el(id);
      if (e) before.set(id, e.getBoundingClientRect());
    }
    mutate();
    requestAnimationFrame(() => {
      const z = get().camera.zoom;
      for (const [id, r0] of before) {
        const e = el(id);
        if (!e) continue;
        const r1 = e.getBoundingClientRect();
        const dx = (r0.left - r1.left) / z;
        const dy = (r0.top - r1.top) / z;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    });
  };

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const measure = () => {
      viewport.w = el.clientWidth;
      viewport.h = el.clientHeight;
      setVp({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Restore this page's camera, or fit it.
  useEffect(() => {
    const cams = fileId ? loadPrefs<{ cams: Record<string, { x: number; y: number; zoom: number }> }>(fileId).cams : undefined;
    const cam = cams?.[pageId];
    if (cam) get().set({ camera: cam });
    else zoomToFit(false);
  }, [pageId, fileId, get]);

  // Wheel: pan, ctrl/⌘ (or pinch) zoom around the cursor. Needs a non-passive listener.
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = get();
      const c = s.camera;
      if (e.ctrlKey || e.metaKey) {
        const r = svg.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        const z = Math.min(256, Math.max(0.02, c.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01))));
        s.set({ camera: { zoom: z, x: mx - ((mx - c.x) * z) / c.zoom, y: my - ((my - c.y) * z) / c.zoom } });
      } else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        s.set({ camera: { ...c, x: c.x - dx, y: c.y - dy } });
      }
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [get]);

  // Keys handled by the canvas: space-pan, alt-measure, pen finish, vector point delete.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest?.('input, textarea, select');
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAlt(true);
      if (typing(e)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpace(true);
      }
      if (penRef.current && (e.key === 'Enter' || e.key === 'Escape')) finishPen(false);
      const s = get();
      if (s.vectorEditId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        setVSel((sel) => {
          if (!sel) return sel;
          const n = s.doc.nodes[s.vectorEditId!];
          const rings = absRings(n);
          if (rings[sel.r].length <= 2) return sel;
          rings[sel.r].splice(sel.i, 1);
          s.update((d) => setAbsRings(d.nodes[n.id], rings));
          return null;
        });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAlt(false);
      if (e.code === 'Space') setSpace(false);
    };
    const blur = () => {
      setAlt(false);
      setSpace(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [get]);

  useEffect(() => {
    if (tool !== 'pen' && penRef.current) finishPen(false);
    if (tool !== 'comment') setDraft(null);
  }, [tool]);

  useEffect(() => {
    if (!editingTextId) return;
    const t = setTimeout(() => {
      taRef.current?.focus();
      taRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, [editingTextId]);

  useEffect(() => setVSel(null), [vectorEditId]);

  function finishPen(closed: boolean) {
    const pts = (penRef.current ?? []).filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) > 0.5);
    setPen(null);
    setPenHover(null);
    const s = get();
    if (pts.length < 2) return;
    const r = ringsFromAbs([pts], closed);
    const node = makeNode('path', s.pageId, { x: r.x, y: r.y, w: r.w, h: r.h, points: r.norm[0], closed, fill: closed ? '#d9d9d9' : null });
    s.update((d) => {
      node.name = nextName(d, 'path');
      insert(d, node, null);
    });
    s.set({ selection: [node.id], tool: 'select' });
  }

  function finishText() {
    const s = get();
    const id = s.editingTextId;
    if (!id) return;
    s.set({ editingTextId: null });
    const n = s.doc.nodes[id];
    if (n && !(n.text ?? '').trim()) {
      s.update((d) => removeNode(d, id), false);
      s.select([]);
    }
  }

  const hitAt = (el: Element | null, s = get()) => {
    const t = el?.closest('[data-id]');
    if (!t) return null;
    const id = t.getAttribute('data-id')!;
    return t.hasAttribute('data-title') ? id : resolveHit(s.doc, id, s.selection);
  };

  /* ---------- pointer down ---------- */

  const onPointerDown = (e: React.PointerEvent) => {
    setMenu(null);
    if (e.button === 2) return;
    const s = get();
    const p = toWorld(e);
    svgRef.current!.setPointerCapture(e.pointerId);

    if (e.button === 1 || space || s.tool === 'hand') {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: s.camera.x, cy: s.camera.y };
      setDragCursor(CURSOR.grabbing);
      return;
    }
    if (s.tool === 'comment') {
      setDraft(p);
      s.set({ activeComment: null });
      return;
    }

    const target = e.target as Element;

    // Vector edit mode: drag points; clicking elsewhere leaves the mode.
    const vhAttr = target.getAttribute('data-vhandle');
    if (s.vectorEditId && vhAttr) {
      const [r, i, which] = vhAttr.split(':');
      drag.current = { kind: 'vhandle', id: s.vectorEditId, r: +r, i: +i, which: which as 'in' | 'out', orig: absRings(s.doc.nodes[s.vectorEditId]), started: false };
      return;
    }
    const vpAttr = target.getAttribute('data-vpoint');
    if (s.vectorEditId && vpAttr) {
      const [r, i] = vpAttr.split(':').map(Number);
      setVSel({ r, i });
      drag.current = { kind: 'vpoint', id: s.vectorEditId, r, i, start: p, orig: absRings(s.doc.nodes[s.vectorEditId]), started: false };
      return;
    }
    if (s.vectorEditId) {
      if (target.closest('[data-id]')?.getAttribute('data-id') === s.vectorEditId) return;
      s.set({ vectorEditId: null });
    }

    if (target.hasAttribute('data-rotate') && !s.readOnly) {
      const n = s.doc.nodes[s.selection[0]];
      const c = { x: n.x + n.w / 2, y: n.y + n.h / 2 };
      drag.current = { kind: 'rotate', id: n.id, c, a0: Math.atan2(p.y - c.y, p.x - c.x), r0: n.rotation, started: false };
      setDragCursor(CURSOR.rotate);
      return;
    }

    const handle = target.getAttribute('data-handle');
    if (handle && !s.readOnly) {
      const ids = topLevel(s.doc, s.selection).filter((id) => !s.doc.nodes[id].locked);
      const startBox = bbox(ids.map((id) => s.doc.nodes[id]));
      if (!startBox) return;
      const orig: Record<string, SceneNode> = {};
      for (const id of ids) for (const k of [id, ...descendants(s.doc, id)]) orig[k] = s.doc.nodes[k];
      const one = ids.length === 1 ? s.doc.nodes[ids[0]] : null;
      // Text: side handles set a fixed (wrapping) width like Figma; other handles scale the type.
      const keepAspect = !!one && (one.type === 'image' || (one.type === 'text' && handle !== 'e' && handle !== 'w'));
      const scale = s.tool === 'scale';
      drag.current = { kind: 'resize', start: p, handle, startBox, ids, orig, started: false, keepAspect: keepAspect || scale, scale };
      setDragCursor(resizeCursor(HANDLE_ANGLE[handle] + (one?.rotation ?? 0)));
      return;
    }

    if (s.readOnly && s.tool !== 'select') return;

    if (s.tool === 'pen') {
      const cur = penRef.current;
      if (cur && cur.length > 2 && Math.hypot(cur[0].x - p.x, cur[0].y - p.y) * s.camera.zoom < 8) return finishPen(true);
      const next = [...(cur ?? []), { x: p.x, y: p.y }];
      setPen(next);
      // Dragging right after placing a point pulls out symmetric bezier handles.
      drag.current = { kind: 'penHandle', idx: next.length - 1, start: p };
      return;
    }

    if (s.tool === 'text') {
      e.preventDefault();
      const parent = frameAt(s.doc, p, s.pageId);
      const node = makeNode('text', s.pageId, { x: Math.round(p.x), y: Math.round(p.y - 14) });
      s.checkpoint();
      s.update((d) => {
        node.name = nextName(d, 'text');
        insert(d, node, parent && !d.nodes[parent].autoLayout ? parent : null);
      }, false);
      s.set({ editingTextId: node.id, selection: [node.id], tool: 'select' });
      return;
    }

    if (CREATE_TOOLS.has(s.tool)) {
      const t = s.tool;
      const line = t === 'line' || t === 'arrow';
      const type: SceneNode['type'] = t === 'section' ? 'frame' : t === 'frame' || t === 'rect' || t === 'ellipse' ? t : 'path';
      const extra: Partial<SceneNode> = line
        ? { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], name: t === 'arrow' ? 'Arrow' : 'Line', arrowEnd: t === 'arrow' }
        : t === 'polygon'
          ? { points: shapePoints(3), closed: true, fill: '#d9d9d9', stroke: null, polySides: 3, name: 'Polygon' }
          : t === 'star'
            ? { points: shapePoints(5, 0.382), closed: true, fill: '#d9d9d9', stroke: null, polySides: 5, starRatio: 0.382, name: 'Star' }
            : t === 'section'
              ? { section: true, fill: '#ebebeb', stroke: '#d4d4d4', clip: false, radius: 4 }
              : {};
      const parentId = t === 'section' ? null : frameAt(s.doc, p, s.pageId);
      const node = makeNode(type, s.pageId, { x: p.x, y: p.y, w: 0, h: 0, ...extra });
      s.checkpoint();
      s.update((d) => {
        if (t === 'section') node.name = `Section ${Object.values(d.nodes).filter((n) => n.section).length + 1}`;
        else if (!extra.name) node.name = nextName(d, type);
        insert(d, node, parentId && !d.nodes[parentId].autoLayout ? parentId : null);
      }, false);
      s.select([node.id]);
      drag.current = { kind: 'create', start: p, id: node.id, type, line };
      return;
    }

    // Select tool
    const hit = hitAt(target, s);
    if (!hit) {
      drag.current = { kind: 'marquee', start: p, base: e.shiftKey ? s.selection : [] };
      if (!e.shiftKey) s.select([]);
      return;
    }
    let sel = s.selection;
    if (e.shiftKey) {
      sel = sel.includes(hit) ? sel.filter((x) => x !== hit) : [...sel, hit];
      s.select(sel);
      if (!sel.includes(hit)) return;
    } else if (!sel.includes(hit)) {
      sel = [hit];
      s.select(sel);
    }
    if (s.readOnly) return;
    const ids = topLevel(s.doc, sel).filter((id) => !s.doc.nodes[id].locked);
    const startBox = bbox(ids.map((id) => s.doc.nodes[id]));
    const orig = Object.fromEntries(ids.map((id) => [id, { x: s.doc.nodes[id].x, y: s.doc.nodes[id].y }]));
    if (startBox) drag.current = { kind: 'move', start: p, ids, startBox, orig, started: false, alt: e.altKey, hit };
  };

  /* ---------- pointer move (coalesced to one update per frame) ---------- */

  const processMove = (e: MoveEvent) => {
    const s = get();
    const p = toWorld(e);
    const d = drag.current;
    reportCursor(p);
    if (s.tool === 'pen' && penRef.current) setPenHover(p);
    if (!d) {
      const id = s.tool === 'select' || s.tool === 'scale' ? hitAt(e.target as Element, s) : null;
      if (id !== s.hoverId) s.set({ hoverId: id });
      return;
    }
    const z = s.camera.zoom;
    switch (d.kind) {
      case 'pan':
        s.set({ camera: { ...s.camera, x: d.cx + e.clientX - d.sx, y: d.cy + e.clientY - d.sy } });
        break;
      case 'marquee': {
        const box = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
        setMarquee(box);
        const hits = getPage(s.doc, s.pageId).children.filter((id) => {
          const n = s.doc.nodes[id];
          return n.visible && !n.locked && intersects(n, box);
        });
        s.select([...new Set([...d.base, ...hits])]);
        break;
      }
      case 'move': {
        let dx = p.x - d.start.x;
        let dy = p.y - d.start.y;
        if (!d.started) {
          if (Math.hypot(dx, dy) * z < 3) return;
          d.started = true;
          s.checkpoint();
          if (d.alt) {
            const out: string[] = [];
            s.update((doc) => {
              for (const id of d.ids) {
                const n = doc.nodes[id];
                out.push(cloneSubtree(doc, id, doc, n.parentId, n.pageId, siblings(doc, n).indexOf(id) + 1));
              }
            }, false);
            d.orig = Object.fromEntries(out.map((id, i) => [id, d.orig[d.ids[i]]]));
            d.ids = out;
            s.select(out);
          }
        }
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const doc0 = get().doc;
        const sn = snap(doc0, d.ids, d.startBox, dx, dy, 6 / z);
        dx = Math.round(dx + sn.dx);
        dy = Math.round(dy + sn.dy);
        setGuides({ x: sn.gx, y: sn.gy });

        // Live reorder inside auto layout, with siblings sliding out of the way.
        if (d.ids.length === 1) {
          const n = doc0.nodes[d.ids[0]];
          const parent = n.parentId ? doc0.nodes[n.parentId] : null;
          if (parent?.autoLayout && inside(p, parent)) {
            const hz = parent.autoLayout.direction === 'horizontal';
            const others = parent.children.filter((c) => c !== n.id);
            let idx = others.findIndex((c) => {
              const k = doc0.nodes[c];
              return hz ? p.x < k.x + k.w / 2 : p.y < k.y + k.h / 2;
            });
            if (idx < 0) idx = others.length;
            if (parent.children.indexOf(n.id) !== idx) flip(others, () => s.update((dd) => moveTo(dd, n.id, parent.id, s.pageId, idx), false));
          }
        }

        const doc1 = get().doc;
        const off: Record<string, Pt> = {};
        for (const id of d.ids) off[id] = { x: d.orig[id].x + dx - doc1.nodes[id].x, y: d.orig[id].y + dy - doc1.nodes[id].y };
        s.set({ dragPreview: off });
        break;
      }
      case 'resize': {
        if (!d.started) {
          d.started = true;
          s.checkpoint();
        }
        const sb = d.startBox;
        const h = d.handle;
        const dx = p.x - d.start.x;
        const dy = p.y - d.start.y;
        let x1 = sb.x, y1 = sb.y, x2 = sb.x + sb.w, y2 = sb.y + sb.h;
        if (h.includes('w')) x1 += dx;
        if (h.includes('e')) x2 += dx;
        if (h.includes('n')) y1 += dy;
        if (h.includes('s')) y2 += dy;
        if ((e.shiftKey || d.keepAspect) && sb.w && sb.h) {
          const k = h.length === 2 ? Math.max(Math.abs(x2 - x1) / sb.w, Math.abs(y2 - y1) / sb.h) : h === 'n' || h === 's' ? Math.abs(y2 - y1) / sb.h : Math.abs(x2 - x1) / sb.w;
          if (h.includes('w')) x1 = x2 - sb.w * k;
          else if (h.includes('e')) x2 = x1 + sb.w * k;
          else {
            x1 = sb.x + sb.w / 2 - (sb.w * k) / 2;
            x2 = x1 + sb.w * k;
          }
          if (h.includes('n')) y1 = y2 - sb.h * k;
          else if (h.includes('s')) y2 = y1 + sb.h * k;
          else {
            y1 = sb.y + sb.h / 2 - (sb.h * k) / 2;
            y2 = y1 + sb.h * k;
          }
        }
        const nb = { x: Math.round(Math.min(x1, x2)), y: Math.round(Math.min(y1, y2)), w: Math.round(Math.abs(x2 - x1)), h: Math.round(Math.abs(y2 - y1)) };
        const sx = sb.w ? nb.w / sb.w : 1;
        const sy = sb.h ? nb.h / sb.h : 1;
        if (d.scale) {
          // Scale tool (K): everything scales, including strokes, radii, text and effects.
          const k = sb.w ? sx : sy;
          s.update((doc) => {
            for (const id in d.orig) {
              const o = d.orig[id];
              const n = doc.nodes[id];
              if (!n) continue;
              const sc = <T extends { x: number; y: number; blur: number }>(v: T | null | undefined) => (v ? { ...v, x: v.x * k, y: v.y * k, blur: v.blur * k } : v);
              Object.assign(n, {
                x: nb.x + (o.x - sb.x) * k,
                y: nb.y + (o.y - sb.y) * k,
                w: o.w * k,
                h: o.h * k,
                strokeWidth: o.strokeWidth * k,
                radius: o.radius * k,
                radii: o.radii ? (o.radii.map((r) => r * k) as [number, number, number, number]) : o.radii,
                shadow: sc(o.shadow),
                innerShadow: sc(o.innerShadow),
                blur: o.blur ? o.blur * k : o.blur,
              });
              if (o.type === 'text') Object.assign(n, { fontSize: Math.max(1, (o.fontSize ?? 16) * k), letterSpacing: (o.letterSpacing ?? 0) * k });
              if (o.autoLayout) n.autoLayout = { ...o.autoLayout, gap: o.autoLayout.gap * k, padding: o.autoLayout.padding * k };
            }
          }, false);
          break;
        }
        s.update((doc) => {
          // Reset the subtree to its pre-drag state, then apply the resize (constraints included).
          for (const id in d.orig) {
            const o = d.orig[id];
            const n = doc.nodes[id];
            if (!n) continue;
            Object.assign(n, { x: o.x, y: o.y, w: o.w, h: o.h });
            if (o.type === 'text') {
              n.fontSize = o.fontSize;
              n.textAutoResize = o.textAutoResize;
            }
          }
          for (const id of d.ids) {
            const o = d.orig[id];
            const box = { x: nb.x + (o.x - sb.x) * sx, y: nb.y + (o.y - sb.y) * sy, w: sb.w ? o.w * sx : nb.w, h: sb.h ? o.h * sy : nb.h };
            if (o.type === 'text' && d.ids.length === 1 && (h === 'e' || h === 'w')) {
              Object.assign(doc.nodes[id], { textAutoResize: 'height', x: box.x, w: Math.max(8, box.w) });
            } else if (o.type === 'text') {
              doc.nodes[id].fontSize = Math.max(1, Math.round((o.fontSize ?? 16) * (sb.h ? sy : 1) * 10) / 10);
              moveDeep(doc, id, box.x - o.x, box.y - o.y);
            } else resizeTo(doc, id, box);
          }
        }, false);
        break;
      }
      case 'rotate': {
        if (!d.started) {
          d.started = true;
          s.checkpoint();
        }
        let r = d.r0 + ((Math.atan2(p.y - d.c.y, p.x - d.c.x) - d.a0) * 180) / Math.PI;
        if (e.shiftKey) r = Math.round(r / 15) * 15;
        setProps([d.id], { rotation: Math.round((((r % 360) + 360) % 360) * 10) / 10 }, false);
        break;
      }
      case 'vpoint': {
        if (!d.started) {
          if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * z < 2) return;
          d.started = true;
          s.checkpoint();
        }
        const rings = d.orig.map((r) => r.map((q) => ({ ...q })));
        const o = d.orig[d.r][d.i];
        const dx = Math.round(o.x + p.x - d.start.x) - o.x;
        const dy = Math.round(o.y + p.y - d.start.y) - o.y;
        rings[d.r][d.i] = { ...o, x: o.x + dx, y: o.y + dy, ...(o.ix !== undefined ? { ix: o.ix + dx, iy: o.iy! + dy } : {}), ...(o.ox !== undefined ? { ox: o.ox + dx, oy: o.oy! + dy } : {}) };
        s.update((doc) => setAbsRings(doc.nodes[d.id], rings), false);
        break;
      }
      case 'vhandle': {
        if (!d.started) {
          d.started = true;
          s.checkpoint();
        }
        const rings = d.orig.map((r) => r.map((q) => ({ ...q })));
        const q = rings[d.r][d.i];
        const hx = p.x - q.x;
        const hy = p.y - q.y;
        // Handles stay mirrored unless Alt is held (Figma-style "break symmetry").
        if (d.which === 'out') Object.assign(q, { ox: p.x, oy: p.y }, e.altKey ? {} : { ix: q.x - hx, iy: q.y - hy });
        else Object.assign(q, { ix: p.x, iy: p.y }, e.altKey ? {} : { ox: q.x - hx, oy: q.y - hy });
        s.update((doc) => setAbsRings(doc.nodes[d.id], rings), false);
        break;
      }
      case 'penHandle': {
        const cur = penRef.current;
        if (!cur || Math.hypot(p.x - d.start.x, p.y - d.start.y) * z < 3) return;
        const next = cur.map((q, i) => (i === d.idx ? { x: q.x, y: q.y, ox: p.x, oy: p.y, ix: 2 * q.x - p.x, iy: 2 * q.y - p.y } : q));
        setPen(next);
        break;
      }
      case 'create': {
        let w = p.x - d.start.x;
        let h = p.y - d.start.y;
        if (d.line) {
          let end = p;
          if (e.shiftKey) {
            const a = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * (Math.PI / 4);
            const len = Math.hypot(w, h);
            end = { x: d.start.x + Math.cos(a) * len, y: d.start.y + Math.sin(a) * len };
          }
          setProps([d.id], pathFromAbs([d.start, end]), false);
          break;
        }
        if (e.shiftKey) {
          const m = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w || 1) * m;
          h = Math.sign(h || 1) * m;
        }
        setProps([d.id], { x: Math.round(Math.min(d.start.x, d.start.x + w)), y: Math.round(Math.min(d.start.y, d.start.y + h)), w: Math.round(Math.abs(w)), h: Math.round(Math.abs(h)) }, false);
        break;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    moveEv.current = { clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, altKey: e.altKey, target: e.target };
    if (!raf.current)
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        if (moveEv.current) processMove(moveEv.current);
      });
  };

  /* ---------- pointer up ---------- */

  const onPointerUp = (e: React.PointerEvent) => {
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      if (moveEv.current) processMove(moveEv.current);
    }
    const d = drag.current;
    drag.current = null;
    setMarquee(null);
    setGuides({ x: null, y: null });
    setDragCursor(null);
    if (!d) return;
    const s = get();

    if (d.kind === 'move') {
      if (!d.started) {
        if (!e.shiftKey && s.selection.length > 1) s.select([d.hit]);
        return;
      }
      const off = s.dragPreview ?? {};
      const p = toWorld(e);
      if (d.ids.length !== 1) {
        s.update((doc) => d.ids.forEach((id) => off[id] && moveDeep(doc, id, off[id].x, off[id].y)), false, { dragPreview: null });
        return;
      }
      // Single layer: drop into / out of frames, or into an auto layout slot.
      const id = d.ids[0];
      const doc = s.doc;
      const n = doc.nodes[id];
      const inGroup = !!n.parentId && doc.nodes[n.parentId].type === 'group';
      let targetId = inGroup ? n.parentId : frameAt(doc, p, s.pageId, id);
      if (targetId && ancestry(doc, targetId).includes(id)) targetId = n.parentId;
      const tp = targetId ? doc.nodes[targetId] : null;
      const old = n.parentId ? doc.nodes[n.parentId] : null;
      flip([id, ...(tp?.autoLayout ? tp.children : []), ...(old?.autoLayout ? old.children : [])], () =>
        s.update(
          (dd) => {
            if (tp?.autoLayout) {
              if (tp.id === n.parentId) return;
              const hz = tp.autoLayout.direction === 'horizontal';
              const kids = dd.nodes[tp.id].children.filter((c) => c !== id);
              let idx = kids.findIndex((c) => {
                const k = dd.nodes[c];
                return hz ? p.x < k.x + k.w / 2 : p.y < k.y + k.h / 2;
              });
              if (idx < 0) idx = kids.length;
              moveTo(dd, id, tp.id, s.pageId, idx);
            } else {
              if (off[id]) moveDeep(dd, id, off[id].x, off[id].y);
              if (!inGroup && targetId !== dd.nodes[id].parentId) moveTo(dd, id, targetId, s.pageId);
            }
          },
          false,
          { dragPreview: null },
        ),
      );
      return;
    }

    if (d.kind === 'create') {
      const n = s.doc.nodes[d.id];
      if (!n) return;
      const z = s.camera.zoom;
      if (n.w * z < 3 && n.h * z < 3) setProps([d.id], d.line ? { w: 100, h: 0, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } : n.section ? { w: 600, h: 400 } : { w: 100, h: 100 }, false);
      if (d.type === 'frame') {
        // Like Figma: drawing a frame around layers adopts them.
        s.update((doc) => {
          const f = doc.nodes[d.id];
          for (const c of siblings(doc, f).filter((c) => c !== d.id)) {
            const k = doc.nodes[c];
            if (k.x >= f.x && k.y >= f.y && k.x + k.w <= f.x + f.w && k.y + k.h <= f.y + f.h) moveTo(doc, c, d.id, f.pageId);
          }
        }, false);
      }
      s.setTool('select');
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const s = get();
    if (s.tool === 'pen') return finishPen(false);
    const vp = document.elementFromPoint(e.clientX, e.clientY)?.getAttribute('data-vpoint');
    if (s.vectorEditId && vp) {
      // Toggle a point between sharp corner and smooth curve.
      const [r, i] = vp.split(':').map(Number);
      const n = s.doc.nodes[s.vectorEditId];
      const rings = absRings(n);
      const q = rings[r][i];
      if (q.ix !== undefined || q.ox !== undefined) rings[r][i] = { x: q.x, y: q.y };
      else {
        const prev = rings[r][(i - 1 + rings[r].length) % rings[r].length];
        const next = rings[r][(i + 1) % rings[r].length];
        const tx = (next.x - prev.x) / 4;
        const ty = (next.y - prev.y) / 4;
        rings[r][i] = { x: q.x, y: q.y, ix: q.x - tx, iy: q.y - ty, ox: q.x + tx, oy: q.y + ty };
      }
      s.update((d) => setAbsRings(d.nodes[n.id], rings));
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-id]');
    if (!el || el.hasAttribute('data-title')) return;
    const id = el.getAttribute('data-id')!;
    const n = s.doc.nodes[id];
    const hit = resolveHit(s.doc, id, s.selection);
    if (n.locked || s.readOnly) return;
    if (n.type === 'text' && (hit === id || s.selection.includes(n.parentId ?? ''))) return editText(id);
    if (n.type === 'path' && hit === id) return s.set({ vectorEditId: id, selection: [id] });
    if (n.type === 'instance' && hit === id) return;
    if (hit && hit !== id) {
      const chain = ancestry(s.doc, id);
      const i = chain.indexOf(hit);
      if (i >= 0 && i < chain.length - 1) s.select([chain[i + 1]]);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const s = get();
    const hit = hitAt(document.elementFromPoint(e.clientX, e.clientY), s);
    if (hit && !s.selection.includes(hit)) s.select([hit]);
    const r = wrapRef.current!.getBoundingClientRect();
    setMenu({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const p = toWorld(e);
    const comp = e.dataTransfer.getData('application/x-vellum-component');
    if (comp) return insertInstance(comp, p);
    const files = [...e.dataTransfer.files];
    if (files.length) addImageFiles(files, p);
  };

  /* ---------- render ---------- */

  const page = getPage(doc, pageId);
  const z = camera.zoom;
  const S = (x: number, y: number) => ({ x: x * z + camera.x, y: y * z + camera.y });
  const shifted = (n: SceneNode): SceneNode => {
    const o = preview?.[n.id] ?? (preview && ancestry(doc, n.id).map((a) => preview[a]).find(Boolean));
    return o ? { ...n, x: n.x + o.x, y: n.y + o.y } : n;
  };
  const selNodes = selection.map((id) => doc.nodes[id]).filter(Boolean).map(shifted);
  const selBox = bbox(selNodes);
  const hover = hoverId && !selection.includes(hoverId) && doc.nodes[hoverId] ? doc.nodes[hoverId] : null;
  const editing = editingTextId ? doc.nodes[editingTextId] : null;
  const vnode = vectorEditId ? doc.nodes[vectorEditId] : null;
  const isComp = (n: SceneNode) => n.type === 'component' || n.type === 'instance' || ancestry(doc, n.id).some((a) => doc.nodes[a]?.type === 'component');
  const single = selNodes.length === 1 ? selNodes[0] : null;

  // Only mount layers near the viewport.
  const margin = 200 / z;
  const view = { x: -camera.x / z - margin, y: -camera.y / z - margin, w: vp.w / z + margin * 2, h: vp.h / z + margin * 2 };
  const visibleIds = page.children.filter((id) => {
    const n = doc.nodes[id];
    if (!n) return false;
    if (!n.rotation) return intersects(n, view);
    const r = Math.hypot(n.w, n.h) / 2;
    return intersects({ x: n.x + n.w / 2 - r, y: n.y + n.h / 2 - r, w: r * 2, h: r * 2 }, view);
  });

  const outline = (n: SceneNode, key: string, color: string, width = 1) => {
    const p = S(n.x, n.y);
    const c = S(n.x + n.w / 2, n.y + n.h / 2);
    return <rect key={key} x={p.x} y={p.y} width={n.w * z} height={n.h * z} fill="none" stroke={color} strokeWidth={width} transform={n.rotation ? `rotate(${n.rotation} ${c.x} ${c.y})` : undefined} />;
  };

  // Alt: measure from selection to the hovered layer (or the parent frame).
  const measureTo = alt && selBox && !drag.current ? (hover && !selection.includes(hover.id) ? hover : selNodes[0]?.parentId ? doc.nodes[selNodes[0].parentId] : null) : null;

  const penClose = !!pen && pen.length > 2 && !!penHover && Math.hypot(pen[0].x - penHover.x, pen[0].y - penHover.y) * z < 8;
  const cursor =
    dragCursor ??
    (space || tool === 'hand'
      ? CURSOR.hand
      : tool === 'select'
        ? alt && hover === null && hoverId && selection.includes(hoverId)
          ? CURSOR.duplicate
          : CURSOR.default
        : tool === 'text'
          ? CURSOR.text
          : tool === 'pen'
            ? penClose
              ? CURSOR.penClose
              : CURSOR.pen
            : tool === 'comment'
              ? CURSOR.comment
              : CURSOR.crosshair);
  const selColor = selNodes.length && selNodes.every(isComp) ? PURPLE : ACCENT;
  const showHandles = selBox && (tool === 'select' || tool === 'scale') && !editing && !vnode && !readOnly;

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap"
      style={{
        backgroundColor: page.bg === DEFAULT_BG ? 'var(--canvas)' : page.bg,
        // Signature dotted canvas: dots follow pan/zoom; fades out when zoomed far out.
        ...(canvasDots && page.bg === DEFAULT_BG && z > 0.15
          ? { backgroundImage: 'radial-gradient(circle, var(--canvas-dot) 1px, transparent 1.2px)', backgroundSize: `${24 * z}px ${24 * z}px`, backgroundPosition: `${camera.x}px ${camera.y}px` }
          : {}),
      }} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <svg
        ref={svgRef}
        className={`canvas-svg${outlineMode ? ' outline-mode' : ''}`}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          reportCursor(null);
          if (get().hoverId) get().set({ hoverId: null });
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        <g className="world" transform={`translate(${camera.x} ${camera.y}) scale(${z})`}>
          {visibleIds.map((id) => (
            <NodeView key={id} id={id} />
          ))}
          {showGrids && <LayoutGrids doc={doc} ids={visibleIds} />}
          {pen && (
            <>
              <path d={ringsToD([[...pen, ...(penHover && !drag.current ? [penHover] : [])]], false, (x, y) => `${x} ${y}`)} fill="none" stroke={ACCENT} strokeWidth={1.5 / z} />
              {pen.map((p, i) =>
                p.ox !== undefined ? (
                  <g key={'h' + i}>
                    <line x1={p.ix} y1={p.iy} x2={p.ox} y2={p.oy} stroke={ACCENT} strokeWidth={1 / z} />
                    <circle cx={p.ix} cy={p.iy} r={2.5 / z} fill={ACCENT} />
                    <circle cx={p.ox} cy={p.oy} r={2.5 / z} fill={ACCENT} />
                  </g>
                ) : null,
              )}
              {pen.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.5 / z} fill="#fff" stroke={ACCENT} strokeWidth={1.5 / z} />
              ))}
            </>
          )}
        </g>

        <g className="overlay">
          {page.children.flatMap((id) => (doc.nodes[id]?.section ? [id, ...doc.nodes[id].children] : [id])).map((id) => {
            const raw = doc.nodes[id];
            if (!raw || !raw.visible || !isFrameLike(raw)) return null;
            const n = shifted(raw);
            const p = S(n.x, n.y);
            const sel = selection.includes(id);
            if (n.section) {
              const w = Math.min(n.name.length * 6.6 + 16, Math.max(0, n.w * z - 12));
              return (
                <g key={'t' + id} data-id={id} data-title="" className="section-tag">
                  <rect x={p.x + 6} y={p.y + 6} width={w} height={20} rx={5} fill={sel ? ACCENT : 'var(--section-tag)'} />
                  <text x={p.x + 14} y={p.y + 20} fill={sel ? '#fff' : 'var(--text)'} className="frame-title">
                    {n.name}
                  </text>
                </g>
              );
            }
            return (
              <text key={'t' + id} data-id={id} data-title="" x={p.x} y={p.y - 6} className="frame-title" fill={n.type === 'component' ? PURPLE : sel ? ACCENT : '#8c8c8c'}>
                {n.type === 'component' ? '❖ ' : ''}
                {n.name}
              </text>
            );
          })}

          {peers?.map((peer) =>
            peer.pageId === pageId
              ? peer.selection.map((id) => (doc.nodes[id] && doc.nodes[id].pageId === pageId ? outline(doc.nodes[id], `ps-${peer.id}-${id}`, peer.color, 1.5) : null))
              : null,
          )}

          {hover && !preview && outline(hover, 'hover', isComp(hover) ? PURPLE : ACCENT, 1.5)}
          {selNodes.map((n) => outline(n, 's' + n.id, selColor))}

          {vnode &&
            (() => {
              const rings = getRings(vnode);
              return rings.map((r, ri) =>
                r.map((q, i) => {
                  const p = S(vnode.x + q.x * vnode.w, vnode.y + q.y * vnode.h);
                  const on = vSel?.r === ri && vSel.i === i;
                  const H = (hx?: number, hy?: number, which?: string) =>
                    hx === undefined || hy === undefined ? null : (() => {
                      const h = S(vnode.x + hx * vnode.w, vnode.y + hy * vnode.h);
                      return (
                        <g key={which}>
                          <line x1={p.x} y1={p.y} x2={h.x} y2={h.y} className="vhandle-line" />
                          <circle data-vhandle={`${ri}:${i}:${which}`} cx={h.x} cy={h.y} r={4} className="vhandle" />
                        </g>
                      );
                    })();
                  return (
                    <g key={`v${ri}-${i}`}>
                      {on && H(q.ix, q.iy, 'in')}
                      {on && H(q.ox, q.oy, 'out')}
                      <rect data-vpoint={`${ri}:${i}`} className={`vpoint${on ? ' on' : ''}${q.ox !== undefined ? ' smooth' : ''}`} x={p.x - 4} y={p.y - 4} width={8} height={8} rx={q.ox !== undefined ? 4 : 1.5} />
                    </g>
                  );
                }),
              );
            })()}

          {showHandles && (
            <>
              {selNodes.length > 1 && outline({ ...selNodes[0], ...selBox, rotation: 0 }, 'union', selColor)}
              {single &&
                !single.locked &&
                ['nw', 'ne', 'se', 'sw'].map((h) => {
                  const p = S(handlePos(h, selBox).x, handlePos(h, selBox).y);
                  const ox = h.includes('w') ? -10 : 10;
                  const oy = h.includes('n') ? -10 : 10;
                  return <circle key={'r' + h} data-rotate="" cx={p.x + ox} cy={p.y + oy} r={10} className="rotate-zone" style={{ cursor: CURSOR.rotate }} />;
                })}
              {HANDLES.filter((h) => h.length === 1).map((h) => {
                const p = S(handlePos(h, selBox).x, handlePos(h, selBox).y);
                const vert = h === 'n' || h === 's';
                return (
                  <rect
                    key={h}
                    data-handle={h}
                    className="edge-handle"
                    x={vert ? p.x - (selBox.w * z) / 2 + 4 : p.x - 4}
                    y={vert ? p.y - 4 : p.y - (selBox.h * z) / 2 + 4}
                    width={vert ? Math.max(0, selBox.w * z - 8) : 8}
                    height={vert ? 8 : Math.max(0, selBox.h * z - 8)}
                    style={{ cursor: resizeCursor(HANDLE_ANGLE[h] + (single?.rotation ?? 0)) }}
                  />
                );
              })}
              {HANDLES.filter((h) => h.length === 2).map((h) => {
                const p = S(handlePos(h, selBox).x, handlePos(h, selBox).y);
                return <circle key={h} data-handle={h} cx={p.x} cy={p.y} r={4.5} className="handle" stroke={selColor} style={{ cursor: resizeCursor(HANDLE_ANGLE[h] + (single?.rotation ?? 0)) }} />;
              })}
              {(() => {
                const p = S(selBox.x + selBox.w / 2, selBox.y + selBox.h);
                const label = single?.rotation && drag.current?.kind === 'rotate' ? `${single.rotation}°` : `${Math.round(selBox.w * 100) / 100} × ${Math.round(selBox.h * 100) / 100}`;
                const w = label.length * 6.2 + 10;
                return (
                  <g className="size-label">
                    <rect x={p.x - w / 2} y={p.y + 8} width={w} height={18} rx={9} fill={selColor} />
                    <text x={p.x} y={p.y + 20} textAnchor="middle" fill="#fff">
                      {label}
                    </text>
                  </g>
                );
              })()}
            </>
          )}

          {measureTo && selBox && <Measure a={selBox} b={measureTo} cam={camera} />}

          {marquee &&
            (() => {
              const p = S(marquee.x, marquee.y);
              return <rect x={p.x} y={p.y} width={marquee.w * z} height={marquee.h * z} fill="var(--accent-fill)" stroke={ACCENT} />;
            })()}
          {guides.x !== null && <line x1={guides.x * z + camera.x} x2={guides.x * z + camera.x} y1={0} y2="100%" stroke="#f24822" />}
          {guides.y !== null && <line y1={guides.y * z + camera.y} y2={guides.y * z + camera.y} x1={0} x2="100%" stroke="#f24822" />}

          {peers?.map((peer) => {
            if (peer.pageId !== pageId || !peer.cursor) return null;
            const p = S(peer.cursor.x, peer.cursor.y);
            const w = peer.name.length * 6.6 + 14;
            return (
              <g key={'c' + peer.id} className="peer-cursor" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
                <path d="M0 0l11 6.3-4.8 1.2L3.7 12z" fill={peer.color} stroke="#fff" strokeWidth={1.2} strokeLinejoin="round" />
                <rect x={10} y={14} width={w} height={18} rx={4} fill={peer.color} />
                <text x={17} y={27} fill="#fff" fontSize={11} fontWeight={500}>
                  {peer.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {showRulers && <Rulers cam={camera} w={vp.w} h={vp.h} sel={selBox} />}

      {editing &&
        (() => {
          const p = S(editing.x, editing.y);
          return (
            <textarea
              ref={taRef}
              className="text-editor"
              value={editing.text ?? ''}
              spellCheck={false}
              style={{
                left: p.x,
                top: p.y,
                width: editing.textAutoResize === 'height' ? editing.w * z : Math.max(editing.w * z + 8, 24),
                whiteSpace: editing.textAutoResize === 'height' ? 'pre-wrap' : 'pre',
                height: Math.max(editing.h * z, 16),
                fontSize: (editing.fontSize ?? 16) * z,
                fontFamily: fontStack(editing.fontFamily),
                fontWeight: editing.fontWeight,
                lineHeight: editing.lineHeight,
                letterSpacing: (editing.letterSpacing ?? 0) * z,
                color: editing.fill ?? '#000',
                textAlign: editing.textAlign,
              }}
              onChange={(e) => setProps([editing.id], { text: e.target.value }, false)}
              onBlur={finishText}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
              }}
            />
          );
        })()}

      <CommentsLayer cam={camera} draft={draft} setDraft={setDraft} />
      {menu && <ContextMenu at={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** Layout grid overlays for frames (not exported, toggle with ⌃⇧4). */
function LayoutGrids({ doc, ids }: { doc: Doc; ids: string[] }) {
  const frames: SceneNode[] = [];
  const walk = (list: string[]) => {
    for (const id of list) {
      const n = doc.nodes[id];
      if (!n || !n.visible) continue;
      if (n.layoutGrid?.visible && isFrameLike(n)) frames.push(n);
      if (isFrameLike(n) || n.type === 'group') walk(n.children);
    }
  };
  walk(ids);
  return (
    <g className="layout-grids" pointerEvents="none">
      {frames.map((f) => {
        const g = f.layoutGrid!;
        const rects: [number, number, number, number][] = [];
        if (g.type === 'grid') {
          const sz = Math.max(1, g.size);
          for (let x = 0; x < f.w; x += sz) rects.push([f.x + x, f.y, 0.5, f.h]);
          for (let y = 0; y < f.h; y += sz) rects.push([f.x, f.y + y, f.w, 0.5]);
        } else {
          const len = g.type === 'columns' ? f.w : f.h;
          const cell = Math.max(0, (len - g.margin * 2 - g.gutter * (g.count - 1)) / Math.max(1, g.count));
          for (let i = 0; i < g.count; i++) {
            const o = g.margin + i * (cell + g.gutter);
            rects.push(g.type === 'columns' ? [f.x + o, f.y, cell, f.h] : [f.x, f.y + o, f.w, cell]);
          }
        }
        return (
          <g key={f.id} clipPath={undefined}>
            {rects.map(([x, y, w, h], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} fill={g.color} fillOpacity={g.type === 'grid' ? 0.6 : 0.12} />
            ))}
          </g>
        );
      })}
    </g>
  );
}
