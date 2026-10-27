import { memo, type ReactNode } from 'react';
import type { Doc, SceneNode } from './types';
import { getRings, liveBooleanRings, ringsToD, roundedRectD } from './geometry';
import { useStore } from './store';
import { textLines } from './doc';

export interface RenderCtx {
  doc: Doc;
  /** Adds data-id attributes and invisible hit areas. */
  interactive: boolean;
  /** Keeps clipPath / filter ids unique when a subtree is rendered more than once. */
  prefix: string;
  depth: number;
  zoom: number;
  hideId?: string | null;
  /** Instance overrides applied to main-component layers while rendering an instance. */
  overrides?: SceneNode['overrides'];
}

type ChildFn = (id: string) => ReactNode;

export const fontStack = (f?: string) => `'${f ?? 'Inter'}', system-ui, sans-serif`;

export function pathD(n: SceneNode) {
  return ringsToD(getRings(n), !!(n.closed || n.rings), (x, y) => `${n.x + x * n.w} ${n.y + y * n.h}`);
}

function strokeProps(n: SceneNode) {
  return n.stroke ? { stroke: n.stroke, strokeWidth: n.strokeWidth, strokeDasharray: n.strokeDash ? `${n.strokeDash} ${n.strokeDash}` : undefined } : {};
}

/** A rectangle outline honouring per-corner radii. */
function Box({ n, ...rest }: { n: SceneNode } & React.SVGProps<SVGPathElement & SVGRectElement>) {
  if (n.radii) return <path d={roundedRectD(n.x, n.y, n.w, n.h, n.radii)} {...rest} />;
  return <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.radius} {...rest} />;
}

/** Paint for the fill, plus the <defs> it needs. */
function paint(n: SceneNode, key: string, fallback = 'none'): [string, ReactNode] {
  const g = n.gradient;
  if (!g || !n.fill) return [n.fill ?? fallback, null];
  const id = `gr-${key}`;
  const stops = g.stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />);
  const def =
    g.type === 'radial' ? (
      <radialGradient id={id} cx="0.5" cy="0.5" r="0.5">
        {stops}
      </radialGradient>
    ) : (
      <linearGradient id={id} x1="0" y1="0.5" x2="1" y2="0.5" gradientTransform={`rotate(${g.angle} 0.5 0.5)`}>
        {stops}
      </linearGradient>
    );
  return [`url(#${id})`, def];
}

function frameBody(ctx: RenderCtx, n: SceneNode, key: string, hitFill: boolean, child: ChildFn) {
  const clipId = `clip-${key}`;
  const [fill, def] = paint(n, key, hitFill ? 'transparent' : 'none');
  return (
    <>
      {def}
      <Box n={n} fill={fill} {...strokeProps(n)} />
      {n.clip && (
        <clipPath id={clipId}>
          <Box n={n} />
        </clipPath>
      )}
      <g clipPath={n.clip ? `url(#${clipId})` : undefined}>{n.children.map(child)}</g>
    </>
  );
}

/** Shared drawing code for the static renderer and the live canvas. */
function drawNode(ctx: RenderCtx, n: SceneNode, child: ChildFn): ReactNode {
  const key = ctx.prefix + n.id;
  let body: ReactNode = null;
  const [fill, def] = paint(n, key);

  switch (n.type) {
    case 'rect':
      body = <Box n={n} fill={fill} {...strokeProps(n)} />;
      break;
    case 'ellipse':
      body = <ellipse cx={n.x + n.w / 2} cy={n.y + n.h / 2} rx={n.w / 2} ry={n.h / 2} fill={fill} {...strokeProps(n)} />;
      break;
    case 'image': {
      const cid = `img-${key}`;
      const mode = n.imageFit ?? 'fill';
      const natural = !!(n.naturalW && n.naturalH);
      const clip = n.radius > 0 || !!n.radii || (natural && (mode === 'crop' || mode === 'tile'));
      let img: ReactNode;
      if (mode === 'crop' && natural) {
        // Cover the box, zoom in, and position by focal point.
        const s0 = Math.max(n.w / n.naturalW!, n.h / n.naturalH!) * Math.max(1, n.cropZoom ?? 1);
        const dw = n.naturalW! * s0;
        const dh = n.naturalH! * s0;
        img = <image href={n.src} x={n.x + (n.w - dw) * (n.cropX ?? 0.5)} y={n.y + (n.h - dh) * (n.cropY ?? 0.5)} width={dw} height={dh} preserveAspectRatio="none" clipPath={`url(#${cid})`} />;
      } else if (mode === 'tile' && natural) {
        const pid = `tile-${key}`;
        const tw = n.naturalW! * (n.tileScale ?? 0.25);
        const th = n.naturalH! * (n.tileScale ?? 0.25);
        img = (
          <>
            <pattern id={pid} patternUnits="userSpaceOnUse" x={n.x} y={n.y} width={tw} height={th}>
              <image href={n.src} width={tw} height={th} preserveAspectRatio="none" />
            </pattern>
            <Box n={n} fill={`url(#${pid})`} />
          </>
        );
      } else img = <image href={n.src} x={n.x} y={n.y} width={n.w} height={n.h} preserveAspectRatio={mode === 'fit' ? 'xMidYMid meet' : 'xMidYMid slice'} clipPath={clip ? `url(#${cid})` : undefined} />;
      body = (
        <>
          {clip && (
            <clipPath id={cid}>
              <Box n={n} />
            </clipPath>
          )}
          {img}
          {n.stroke && <Box n={n} fill="none" {...strokeProps(n)} />}
          {ctx.interactive && <rect x={n.x} y={n.y} width={n.w} height={n.h} fill="transparent" />}
        </>
      );
      break;
    }
    case 'path': {
      const d = pathD(n);
      const mid = `ar-${key}`;
      const filled = n.closed || !!n.rings;
      body = (
        <>
          {n.arrowEnd && n.stroke && (
            <marker id={mid} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill={n.stroke} />
            </marker>
          )}
          <path d={d} fill={filled ? fill : 'none'} fillRule="evenodd" strokeLinecap="round" strokeLinejoin="round" markerEnd={n.arrowEnd && n.stroke ? `url(#${mid})` : undefined} {...strokeProps(n)} />
          {ctx.interactive && <path d={d} fill={filled ? 'transparent' : 'none'} stroke="transparent" strokeWidth={10 / ctx.zoom} />}
        </>
      );
      break;
    }
    case 'text': {
      const size = n.fontSize ?? 16;
      const lh = size * (n.lineHeight ?? 1.2);
      const anchor = n.textAlign === 'center' ? 'middle' : n.textAlign === 'right' ? 'end' : 'start';
      const ax = n.textAlign === 'center' ? n.x + n.w / 2 : n.textAlign === 'right' ? n.x + n.w : n.x;
      body = (
        <>
          {ctx.interactive && <rect x={n.x} y={n.y} width={n.w} height={n.h} fill="transparent" />}
          <text
            fill={fill}
            fontSize={size}
            fontFamily={fontStack(n.fontFamily)}
            fontWeight={n.fontWeight}
            textAnchor={anchor}
            dominantBaseline="central"
            letterSpacing={n.letterSpacing || undefined}
            textDecoration={n.textDecoration && n.textDecoration !== 'none' ? n.textDecoration : undefined}
            style={{ whiteSpace: 'pre' }}
            {...strokeProps(n)}
          >
            {textLines(n).map((line, i) => (
              <tspan key={i} x={ax} y={n.y + (i + 0.5) * lh}>
                {line || ' '}
              </tspan>
            ))}
          </text>
        </>
      );
      break;
    }
    case 'frame':
    case 'component':
      return wrap(ctx, n, key, frameBody(ctx, n, key, ctx.interactive, child));
    case 'group': {
      if (n.booleanOp) {
        // Live boolean: draw the combined outline with the group's own paint; children stay editable in Layers.
        const rings = liveBooleanRings(ctx.doc, n);
        const d = rings.map((r) => r.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') + ' Z').join(' ');
        body = <path d={d} fill={fill === 'none' ? '#d9d9d9' : fill} fillRule="evenodd" {...strokeProps(n)} />;
        break;
      }
      if (n.masked && n.children.length > 1) {
        // The bottom layer is the mask (alpha), everything above is clipped by it.
        const [m, ...rest] = n.children;
        const mid = `mask-${key}`;
        body = (
          <>
            <mask id={mid} style={{ maskType: 'alpha' }}>
              {child(m)}
            </mask>
            <g mask={`url(#${mid})`}>{rest.map(child)}</g>
          </>
        );
      } else body = <>{n.children.map(child)}</>;
      break;
    }
    case 'instance': {
      const m = ctx.doc.nodes[n.componentId ?? ''];
      if (!m || ctx.depth > 8) {
        body = <rect x={n.x} y={n.y} width={n.w} height={n.h} fill="#d5f5f0" stroke="#0d9488" strokeDasharray="4 4" />;
        break;
      }
      const sx = m.w ? n.w / m.w : 1;
      const sy = m.h ? n.h / m.h : 1;
      const sub: RenderCtx = { ...ctx, interactive: false, prefix: key + '-', depth: ctx.depth + 1, overrides: { ...ctx.overrides, ...n.overrides } };
      body = (
        <>
          {ctx.interactive && <rect x={n.x} y={n.y} width={n.w} height={n.h} fill="transparent" />}
          <g transform={`translate(${n.x} ${n.y}) scale(${sx} ${sy}) translate(${-m.x} ${-m.y})`}>{frameBody(sub, m, sub.prefix + m.id, false, (c) => renderNode(sub, c))}</g>
        </>
      );
      break;
    }
  }
  return wrap(
    ctx,
    n,
    key,
    <>
      {def}
      {body}
    </>,
  );
}

/** Outer group: id, opacity, effects and blend mode. Rotation goes on an inner group so CSS animations on the outer one stay safe. */
function wrap(ctx: RenderCtx, n: SceneNode, key: string, body: ReactNode) {
  const sh = n.shadow;
  const inner = n.innerShadow;
  const blur = n.blur ?? 0;
  const fid = `fx-${key}`;
  const hasFx = !!sh || !!inner || blur > 0;
  const opacity = ctx.hideId === n.id ? 0 : n.opacity !== 1 ? n.opacity : undefined;
  const base = sh ? 'ds' : 'SourceGraphic';
  return (
    <g
      key={key}
      data-id={ctx.interactive ? n.id : undefined}
      data-link={ctx.interactive && n.link ? '1' : undefined}
      data-mask={n.isMask ? '1' : undefined}
      data-name={ctx.interactive ? n.name : undefined}
      opacity={opacity}
      filter={hasFx ? `url(#${fid})` : undefined}
      style={n.blendMode && n.blendMode !== 'normal' ? { mixBlendMode: n.blendMode as React.CSSProperties['mixBlendMode'] } : undefined}
    >
      {hasFx && (
        <filter id={fid} x="-50%" y="-50%" width="200%" height="200%">
          {sh && <feDropShadow dx={sh.x} dy={sh.y} stdDeviation={sh.blur / 2} floodColor={sh.color} floodOpacity={sh.opacity} result="ds" />}
          {inner && (
            <>
              <feFlood floodColor={inner.color} floodOpacity={inner.opacity} result="ic" />
              <feComposite in="ic" in2="SourceAlpha" operator="out" result="iv" />
              <feOffset in="iv" dx={inner.x} dy={inner.y} result="io" />
              <feGaussianBlur in="io" stdDeviation={inner.blur / 2} result="ib" />
              <feComposite in="ib" in2="SourceAlpha" operator="in" result="is" />
              <feMerge result="im">
                <feMergeNode in={base} />
                <feMergeNode in="is" />
              </feMerge>
            </>
          )}
          {blur > 0 && <feGaussianBlur in={inner ? 'im' : base} stdDeviation={blur / 2} />}
        </filter>
      )}
      {n.rotation ? <g transform={`rotate(${n.rotation} ${n.x + n.w / 2} ${n.y + n.h / 2})`}>{body}</g> : body}
    </g>
  );
}

/** Static render (export, thumbnails, presentation, instance contents). */
export function renderNode(ctx: RenderCtx, id: string): ReactNode {
  const base = ctx.doc.nodes[id];
  if (!base) return null;
  const o = ctx.overrides?.[id];
  const n = o ? { ...base, ...o, fill: o.fill !== undefined ? o.fill : base.fill } : base;
  if (!n || !n.visible || ctx.depth > 10) return null;
  return drawNode(ctx, n, (c) => renderNode(ctx, c));
}

const EMPTY: Doc = { pages: [], nodes: {} };
const liveChild: ChildFn = (id) => <NodeView key={id} id={id} />;

/**
 * Live canvas node. Subscribes only to its own node, so edits re-render just the changed layers.
 * The outer <g> carries the drag-preview offset.
 */
export const NodeView = memo(function NodeView({ id }: { id: string }) {
  const n = useStore((s) => s.doc.nodes[id]);
  const hidden = useStore((s) => s.editingTextId === id);
  const zoom = useStore((s) => (s.doc.nodes[id]?.type === 'path' ? s.camera.zoom : 1));
  // Instances and live boolean groups render from other layers, so they need the whole document.
  const doc = useStore((s) => (s.doc.nodes[id]?.type === 'instance' || s.doc.nodes[id]?.booleanOp ? s.doc : EMPTY));
  const off = useStore((s) => s.dragPreview?.[id]);
  if (!n || !n.visible) return null;
  const ctx: RenderCtx = { doc, interactive: true, prefix: '', depth: 0, zoom, hideId: hidden ? id : null };
  return <g transform={off ? `translate(${off.x} ${off.y})` : undefined}>{drawNode(ctx, n, liveChild)}</g>;
});
