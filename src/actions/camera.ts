/** Camera: viewport size, animated zoom/pan. */
import { type Camera } from '../store';
import { bbox, getPage, type Box } from '../doc';
import type { Pt } from '../types';
import { S } from './shared';

export const viewport = { w: 1200, h: 800 };

export let camAnim = 0;

/** Ease the camera to a target (instant when `animate` is false). */
export function setCamera(target: Camera, animate = true) {
  cancelAnimationFrame(camAnim);
  const s = S();
  if (!animate) return s.set({ camera: target });
  const from = s.camera;
  const t0 = performance.now();
  const dur = 220;
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    // Interpolate zoom in log space so it feels linear.
    const z = Math.exp(Math.log(from.zoom) + (Math.log(target.zoom) - Math.log(from.zoom)) * e);
    const wx = (viewport.w / 2 - from.x) / from.zoom + ((viewport.w / 2 - target.x) / target.zoom - (viewport.w / 2 - from.x) / from.zoom) * e;
    const wy = (viewport.h / 2 - from.y) / from.zoom + ((viewport.h / 2 - target.y) / target.zoom - (viewport.h / 2 - from.y) / from.zoom) * e;
    S().set({ camera: { zoom: z, x: viewport.w / 2 - wx * z, y: viewport.h / 2 - wy * z } });
    if (k < 1) camAnim = requestAnimationFrame(step);
  };
  camAnim = requestAnimationFrame(step);
}

export function zoomToBox(b: Box | null, max = 1, animate = true) {
  if (!b) return setCamera({ x: viewport.w / 2, y: viewport.h / 2, zoom: 1 }, animate);
  const pad = 80;
  const z = Math.min(max, Math.max(0.02, Math.min((viewport.w - pad * 2) / Math.max(b.w, 1), (viewport.h - pad * 2) / Math.max(b.h, 1))));
  setCamera({ zoom: z, x: viewport.w / 2 - (b.x + b.w / 2) * z, y: viewport.h / 2 - (b.y + b.h / 2) * z }, animate);
}

export function zoomToFit(animate = true) {
  const s = S();
  zoomToBox(bbox(getPage(s.doc, s.pageId).children.map((id) => s.doc.nodes[id]).filter((n) => n?.visible)), 1, animate);
}

export function zoomToSelection() {
  const s = S();
  const b = bbox(s.selection.map((id) => s.doc.nodes[id]).filter(Boolean));
  b ? zoomToBox(b, 8) : zoomToFit();
}

export function zoomBy(f: number, zoomTo?: number) {
  const c = S().camera;
  const z = Math.min(256, Math.max(0.02, zoomTo ?? c.zoom * f));
  const mx = viewport.w / 2;
  const my = viewport.h / 2;
  setCamera({ zoom: z, x: mx - ((mx - c.x) * z) / c.zoom, y: my - ((my - c.y) * z) / c.zoom });
}

export function centerOn(p: Pt) {
  const c = S().camera;
  setCamera({ zoom: c.zoom, x: viewport.w / 2 - p.x * c.zoom, y: viewport.h / 2 - p.y * c.zoom });
}

export function worldCenter(): Pt {
  const c = S().camera;
  return { x: (viewport.w / 2 - c.x) / c.zoom, y: (viewport.h / 2 - c.y) / c.zoom };
}
