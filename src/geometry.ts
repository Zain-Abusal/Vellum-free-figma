import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import type { Pt, SceneNode } from './types';
import { bbox } from './doc';

/** Normalised rings of a path node (single-ring paths use `points`). */
export const getRings = (n: SceneNode): Pt[][] => n.rings ?? [n.points ?? []];

/** Absolute rings → node box + normalised rings. */
export function ringsFromAbs(rings: Pt[][]) {
  const b = bbox(rings.flat().map((p) => ({ ...p, w: 0, h: 0 }))) ?? { x: 0, y: 0, w: 0, h: 0 };
  const norm = rings.map((r) => r.map((p) => ({ x: b.w ? (p.x - b.x) / b.w : 0, y: b.h ? (p.y - b.y) / b.h : 0 })));
  return { x: b.x, y: b.y, w: b.w, h: b.h, norm };
}

/** Write absolute rings back into a path node, keeping the single-ring `points` form when possible. */
export function setAbsRings(n: SceneNode, rings: Pt[][]) {
  const r = ringsFromAbs(rings);
  n.x = r.x;
  n.y = r.y;
  n.w = r.w;
  n.h = r.h;
  if (r.norm.length === 1 && !n.rings) n.points = r.norm[0];
  else {
    n.rings = r.norm;
    n.points = undefined;
  }
}

export const absRings = (n: SceneNode): Pt[][] => getRings(n).map((r) => r.map((p) => ({ x: n.x + p.x * n.w, y: n.y + p.y * n.h })));

/** Regular polygon / star points normalised to a tight unit box. */
export function shapePoints(sides: number, ratio?: number): Pt[] {
  const pts: Pt[] = [];
  const count = ratio ? sides * 2 : sides;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / count;
    const r = ratio && i % 2 ? ratio : 1;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  const b = bbox(pts.map((p) => ({ ...p, w: 0, h: 0 })))!;
  return pts.map((p) => ({ x: (p.x - b.x) / b.w, y: (p.y - b.y) / b.h }));
}

function rotatePts(pts: Pt[], n: SceneNode): Pt[] {
  if (!n.rotation) return pts;
  const a = (n.rotation * Math.PI) / 180;
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map((p) => ({ x: cx + (p.x - cx) * c - (p.y - cy) * s, y: cy + (p.x - cx) * s + (p.y - cy) * c }));
}

/** Outline of a shape as absolute polygons, or null if it has no area. */
export function toPolygons(n: SceneNode): Pt[][] | null {
  let rings: Pt[][];
  if (n.type === 'ellipse') {
    const pts: Pt[] = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      pts.push({ x: n.x + n.w / 2 + (Math.cos(a) * n.w) / 2, y: n.y + n.h / 2 + (Math.sin(a) * n.h) / 2 });
    }
    rings = [pts];
  } else if (n.type === 'path') {
    if (!n.closed) return null;
    rings = absRings(n);
  } else if (n.type === 'rect' || n.type === 'frame' || n.type === 'component' || n.type === 'image' || n.type === 'instance') {
    const r = Math.min(n.radius, n.w / 2, n.h / 2);
    if (r <= 0) rings = [[{ x: n.x, y: n.y }, { x: n.x + n.w, y: n.y }, { x: n.x + n.w, y: n.y + n.h }, { x: n.x, y: n.y + n.h }]];
    else {
      const pts: Pt[] = [];
      const corners = [
        [n.x + n.w - r, n.y + r, -90],
        [n.x + n.w - r, n.y + n.h - r, 0],
        [n.x + r, n.y + n.h - r, 90],
        [n.x + r, n.y + r, 180],
      ];
      for (const [cx, cy, start] of corners)
        for (let i = 0; i <= 8; i++) {
          const a = ((start + (i * 90) / 8) * Math.PI) / 180;
          pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
      rings = [pts];
    }
  } else return null;
  return rings.map((r) => rotatePts(r, n));
}

const toGeom = (rings: Pt[][]): Polygon => rings.map((r) => [...r.map((p) => [p.x, p.y] as [number, number]), [r[0].x, r[0].y]] as Ring);

export type BoolOp = 'union' | 'subtract' | 'intersect' | 'exclude';

/** Runs a boolean op over shapes ordered bottom → top. Returns absolute rings. */
export function booleanRings(op: BoolOp, shapes: Pt[][][]): Pt[][] {
  const geoms = shapes.map(toGeom);
  const [first, ...rest] = geoms;
  let out: MultiPolygon;
  if (op === 'union') out = polygonClipping.union(first, ...rest);
  else if (op === 'subtract') out = polygonClipping.difference(first, ...rest);
  else if (op === 'intersect') out = polygonClipping.intersection(first, ...rest);
  else out = polygonClipping.xor(first, ...rest);
  return out.flatMap((poly) => poly.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))));
}
