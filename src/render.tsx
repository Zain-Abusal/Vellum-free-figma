import { memo, type ReactNode } from 'react';
import type { Doc, SceneNode } from './types';
import { getRings } from './geometry';
import { useStore } from './store';

export interface RenderCtx {
  doc: Doc;
  /** Adds data-id attributes and invisible hit areas. */
  interactive: boolean;
  /** Keeps clipPath / filter ids unique when a subtree is rendered more than once. */
  prefix: string;
  depth: number;
  zoom: number;
  hideId?: string | null;
}

type ChildFn = (id: string) => ReactNode;

export const fontStack = (f?: string) => `'${f ?? 'Inter'}', system-ui, sans-serif`;

export function pathD(n: SceneNode) {
  const close = n.closed || !!n.rings;
  return getRings(n)
    .map((r) => r.map((p, i) => `${i ? 'L' : 'M'}${n.x + p.x * n.w} ${n.y + p.y * n.h}`).join(' ') + (close && r.length ? ' Z' : ''))
    .join(' ');
}

function strokeProps(n: SceneNode) {
  return n.stroke ? { stroke: n.stroke, strokeWidth: n.strokeWidth } : {};
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
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.radius} fill={fill} {...strokeProps(n)} />
      {n.clip && (
        <clipPath id={clipId}>
          <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.radius} />
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
      body = <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.radius} fill={fill} {...strokeProps(n)} />;
      break;
    case 'ellipse':
      body = <ellipse cx={n.x + n.w / 2} cy={n.y + n.h / 2} rx={n.w / 2} ry={n.h / 2} fill={fill} {...strokeProps(n)} />;
      break;
    case 'image': {
      const cid = `img-${key}`;
      body = (
        <>
          {n.radius > 0 && (
            <clipPath id={cid}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.radius} />
            </clipPath>
          )}
          <image href={n.src} x={n.x} y={n.y} width={n.w} height={n.h} preserveAspectRatio={n.imageFit === 'fit' ? 'xMidYMid meet' : 'xMidYMid slice'} clipPath={n.radius > 0 ? `url(#${cid})` : undefined} />
          {n.stroke && <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.radius} fill="none" {...strokeProps(n)} />}
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
            {(n.text ?? '').split('\n').map((line, i) => (
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
    case 'group':
      body = <>{n.children.map(child)}</>;
      break;
    case 'instance': {
      const m = ctx.doc.nodes[n.componentId ?? ''];
      if (!m || ctx.depth > 8) {
        body = <rect x={n.x} y={n.y} width={n.w} height={n.h} fill="#f3e8ff" stroke="#9747ff" strokeDasharray="4 4" />;
        break;
      }
      const sx = m.w ? n.w / m.w : 1;
      const sy = m.h ? n.h / m.h : 1;
      const sub: RenderCtx = { ...ctx, interactive: false, prefix: key + '-', depth: ctx.depth + 1 };
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
  const blur = n.blur ?? 0;
  const fid = `fx-${key}`;
  const hasFx = !!sh || blur > 0;
  const opacity = ctx.hideId === n.id ? 0 : n.opacity !== 1 ? n.opacity : undefined;
  return (
    <g
      key={key}
      data-id={ctx.interactive ? n.id : undefined}
      data-link={ctx.interactive && n.link ? '1' : undefined}
      opacity={opacity}
      filter={hasFx ? `url(#${fid})` : undefined}
      style={n.blendMode && n.blendMode !== 'normal' ? { mixBlendMode: n.blendMode as React.CSSProperties['mixBlendMode'] } : undefined}
    >
      {hasFx && (
        <filter id={fid} x="-50%" y="-50%" width="200%" height="200%">
          {sh && <feDropShadow dx={sh.x} dy={sh.y} stdDeviation={sh.blur / 2} floodColor={sh.color} floodOpacity={sh.opacity} result="s" />}
          {blur > 0 && <feGaussianBlur in={sh ? 's' : 'SourceGraphic'} stdDeviation={blur / 2} />}
        </filter>
      )}
      {n.rotation ? <g transform={`rotate(${n.rotation} ${n.x + n.w / 2} ${n.y + n.h / 2})`}>{body}</g> : body}
    </g>
  );
}

/** Static render (export, thumbnails, presentation, instance contents). */
export function renderNode(ctx: RenderCtx, id: string): ReactNode {
  const n = ctx.doc.nodes[id];
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
  const doc = useStore((s) => (s.doc.nodes[id]?.type === 'instance' ? s.doc : EMPTY));
  const off = useStore((s) => s.dragPreview?.[id]);
  if (!n || !n.visible) return null;
  const ctx: RenderCtx = { doc, interactive: true, prefix: '', depth: 0, zoom, hideId: hidden ? id : null };
  return <g transform={off ? `translate(${off.x} ${off.y})` : undefined}>{drawNode(ctx, n, liveChild)}</g>;
});
