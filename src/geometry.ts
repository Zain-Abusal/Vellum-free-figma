import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import type { PathPoint, Pt, SceneNode } from './types';
import { bbox } from './doc';

/** Normalised rings of a path node (single-ring paths use `points`). */
export const getRings = (n: SceneNode): PathPoint[][] => n.rings ?? [n.points ?? []];

const hasOut = (p: PathPoint) => p.ox !== undefined && p.oy !== undefined;
const hasIn = (p: PathPoint) => p.ix !== undefined && p.iy !== undefined;

function cubic(a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}

/** Segment a→b as a polyline (curves sampled). Excludes `a`, includes `b`. */
function segmentPoints(a: PathPoint, b: PathPoint, steps = 16): Pt[] {
  if (!hasOut(a) && !hasIn(b)) return [{ x: b.x, y: b.y }];
  const c1 = hasOut(a) ? { x: a.ox!, y: a.oy! } : a;
  const c2 = hasIn(b) ? { x: b.ix!, y: b.iy! } : b;
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) out.push(cubic(a, c1, c2, b, i / steps));
  return out;
}

/** A ring flattened to straight segments. */
export function flattenRing(r: PathPoint[], closed: boolean): Pt[] {
  if (!r.length) return [];
  const out: Pt[] = [{ x: r[0].x, y: r[0].y }];
  for (let i = 1; i < r.length; i++) out.push(...segmentPoints(r[i - 1], r[i]));
  if (closed && r.length > 2 && (hasOut(r[r.length - 1]) || hasIn(r[0]))) out.push(...segmentPoints(r[r.length - 1], r[0]).slice(0, -1));
  return out;
}

/** SVG path data for rings in any coordinate space (`map` converts a point to output space). */
export function ringsToD(rings: PathPoint[][], closed: boolean, map: (x: number, y: number) => string) {
  return rings
    .map((r) => {
      if (!r.length) return '';
      let d = `M${map(r[0].x, r[0].y)}`;
      const seg = (a: PathPoint, b: PathPoint) =>
        hasOut(a) || hasIn(b) ? ` C${map(a.ox ?? a.x, a.oy ?? a.y)} ${map(b.ix ?? b.x, b.iy ?? b.y)} ${map(b.x, b.y)}` : ` L${map(b.x, b.y)}`;
      for (let i = 1; i < r.length; i++) d += seg(r[i - 1], r[i]);
      if (closed && r.length > 1) {
        if (hasOut(r[r.length - 1]) || hasIn(r[0])) d += seg(r[r.length - 1], r[0]);
        d += ' Z';
      }
      return d;
    })
    .join(' ');
}

const mapPoint = (p: PathPoint, f: (x: number, y: number) => Pt): PathPoint => {
  const o: PathPoint = f(p.x, p.y);
  if (hasIn(p)) {
    const q = f(p.ix!, p.iy!);
    o.ix = q.x;
    o.iy = q.y;
  }
  if (hasOut(p)) {
    const q = f(p.ox!, p.oy!);
    o.ox = q.x;
    o.oy = q.y;
  }
  return o;
};

/** Absolute rings → node box (tight around the curve, not the handles) + normalised rings. */
export function ringsFromAbs(rings: PathPoint[][], closed = true) {
  const pts = rings.flatMap((r) => flattenRing(r, closed));
  const b = bbox(pts.map((p) => ({ ...p, w: 0, h: 0 }))) ?? { x: 0, y: 0, w: 0, h: 0 };
  const norm = rings.map((r) => r.map((p) => mapPoint(p, (x, y) => ({ x: b.w ? (x - b.x) / b.w : 0, y: b.h ? (y - b.y) / b.h : 0 }))));
  return { x: b.x, y: b.y, w: b.w, h: b.h, norm };
}

/** Write absolute rings back into a path node, keeping the single-ring `points` form when possible. */
export function setAbsRings(n: SceneNode, rings: PathPoint[][]) {
  const r = ringsFromAbs(rings, n.closed || !!n.rings);
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

export const absRings = (n: SceneNode): PathPoint[][] => getRings(n).map((r) => r.map((p) => mapPoint(p, (x, y) => ({ x: n.x + x * n.w, y: n.y + y * n.h }))));

/** Mirror a path's points (and handles) inside its box. */
export const flipRing = (r: PathPoint[], axis: 'h' | 'v') => r.map((p) => mapPoint(p, (x, y) => (axis === 'h' ? { x: 1 - x, y } : { x, y: 1 - y })));

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

/** SVG path for a rectangle with independent corner radii (clamped like CSS). */
export function roundedRectD(x: number, y: number, w: number, h: number, radii: [number, number, number, number]) {
  const k = Math.min(1, w / Math.max(radii[0] + radii[1], 1e-9), w / Math.max(radii[2] + radii[3], 1e-9), h / Math.max(radii[0] + radii[3], 1e-9), h / Math.max(radii[1] + radii[2], 1e-9));
  const [a, b, c, d] = radii.map((r) => Math.max(0, r * k));
  return `M${x + a} ${y}H${x + w - b}A${b} ${b} 0 0 1 ${x + w} ${y + b}V${y + h - c}A${c} ${c} 0 0 1 ${x + w - c} ${y + h}H${x + d}A${d} ${d} 0 0 1 ${x} ${y + h - d}V${y + a}A${a} ${a} 0 0 1 ${x + a} ${y}Z`;
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
    if (!n.closed && !n.rings) return null;
    rings = absRings(n).map((r) => flattenRing(r, true));
  } else if (n.type === 'rect' || n.type === 'frame' || n.type === 'component' || n.type === 'image' || n.type === 'instance') {
    const radii = n.radii ?? [n.radius, n.radius, n.radius, n.radius];
    const cap = Math.min(n.w / 2, n.h / 2);
    const corners: [number, number, number, number][] = [
      [n.x + n.w, n.y, -90, Math.min(radii[1], cap)],
      [n.x + n.w, n.y + n.h, 0, Math.min(radii[2], cap)],
      [n.x, n.y + n.h, 90, Math.min(radii[3], cap)],
      [n.x, n.y, 180, Math.min(radii[0], cap)],
    ];
    const pts: Pt[] = [];
    for (const [cx0, cy0, start, r] of corners) {
      if (r <= 0) {
        pts.push({ x: cx0, y: cy0 });
        continue;
      }
      const cx = cx0 + (start === -90 || start === 0 ? -r : r);
      const cy = cy0 + (start === 0 || start === 90 ? -r : r);
      for (let i = 0; i <= 8; i++) {
        const a = ((start + (i * 90) / 8) * Math.PI) / 180;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
    }
    rings = [pts];
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
