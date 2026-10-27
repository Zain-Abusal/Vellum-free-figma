import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import {
  align,
  autoLayoutSelection,
  booleanOp,
  createComponent,
  detachInstance,
  distribute,
  flattenSelection,
  goToMainComponent,
  insertInstance,
  setProps,
  startPresent,
  topFrames,
  type AlignKind,
} from '../actions';
import { getPage, isFrameLike, moveDeep, setSize } from '../doc';
import { shapePoints } from '../geometry';
import { cssFor, exportCombined, exportLayers } from '../exporter';
import type { AutoLayout, ExportFormat, ExportSetting, Gradient, HConstraint, SceneNode, VConstraint } from '../types';
import { Icons } from './icons';

export const FONTS = ['Inter', 'Roboto', 'Poppins', 'Montserrat', 'Space Grotesk', 'Playfair Display', 'DM Serif Display', 'Space Mono', 'Arial', 'Georgia', 'Times New Roman', 'Courier New'];
const WEIGHTS: [number, string][] = [
  [300, 'Light'],
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'Semi Bold'],
  [700, 'Bold'],
  [800, 'Extra Bold'],
];
const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

const fmt = (v: number) => String(Math.round(v * 100) / 100);

type OnNum = (v: number, live?: boolean) => void;

function Num({ label, icon, value, onChange, step = 1, min, max, disabled, title }: { label?: string; icon?: ReactNode; value: number | null; onChange: OnNum; step?: number; min?: number; max?: number; disabled?: boolean; title?: string }) {
  const [text, setText] = useState(value === null ? 'Mixed' : fmt(value));
  useEffect(() => setText(value === null ? 'Mixed' : fmt(value)), [value]);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = () => {
    // Allow simple math like Figma: "100/2", "20+4".
    let v = parseFloat(text);
    if (/^[\d.\s+\-*/()]+$/.test(text)) {
      try {
        v = Function(`"use strict";return (${text})`)();
      } catch {
        /* keep parseFloat */
      }
    }
    if (typeof v === 'number' && isFinite(v) && v !== value) onChange(clamp(v));
    else setText(value === null ? 'Mixed' : fmt(value));
  };
  // Drag the label to scrub.
  const scrub = (e: React.PointerEvent) => {
    if (disabled || value === null) return;
    e.preventDefault();
    const startX = e.clientX;
    const start = value;
    let started = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!started) {
        if (Math.abs(dx) < 2) return;
        started = true;
        useStore.getState().checkpoint();
      }
      onChange(clamp(start + Math.round(dx) * step * (ev.shiftKey ? 10 : 1)), true);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <label className={`num${disabled ? ' disabled' : ''}`} title={title}>
      <span className="num-label" onPointerDown={scrub}>
        {icon ?? label}
      </span>
      <input
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value !== null) {
            e.preventDefault();
            onChange(clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1) * step));
          }
        }}
      />
    </label>
  );
}

const normHex = (t: string) => {
  let h = t.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toLowerCase() : null;
};

function ColorField({ value, onChange, extra }: { value: string; onChange: (v: string, live?: boolean) => void; extra?: ReactNode }) {
  const [text, setText] = useState(value.slice(1).toUpperCase());
  useEffect(() => setText(value.slice(1).toUpperCase()), [value]);
  return (
    <div className="color-field">
      <input type="color" value={value} onFocus={() => useStore.getState().checkpoint()} onChange={(e) => onChange(e.target.value, true)} />
      <input
        className="hex"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const h = normHex(text);
          if (h && h !== value) onChange(h);
          else setText(value.slice(1).toUpperCase());
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {extra}
    </div>
  );
}

/** Colors already used in the file (Figma's "Document colors"). */
function DocColors({ onPick }: { onPick: (c: string) => void }) {
  const doc = useStore((s) => s.doc);
  const colors = useMemo(() => {
    const count = new Map<string, number>();
    for (const n of Object.values(doc.nodes))
      for (const c of [n.fill, n.stroke, ...(n.gradient?.stops.map((s) => s.color) ?? [])]) if (c) count.set(c, (count.get(c) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c]) => c);
  }, [doc.nodes]);
  if (colors.length < 2) return null;
  return (
    <div className="swatches" title="Document colors">
      {colors.map((c) => (
        <button key={c} className="swatch" style={{ background: c }} title={c} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="section">
      <div className="section-head">
        <span className="section-title">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

const AddBtn = ({ onClick, title }: { onClick: () => void; title: string }) => (
  <button className="icon-btn" title={title} onClick={onClick}>
    <Icons.plus />
  </button>
);
const RemoveBtn = ({ onClick, title }: { onClick: () => void; title: string }) => (
  <button className="icon-btn" title={title} onClick={onClick}>
    <Icons.minus />
  </button>
);

function ExportRows({ rows, onChange }: { rows: ExportSetting[]; onChange: (rows: ExportSetting[]) => void }) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="export-row">
          <select value={r.scale} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, scale: +e.target.value } : x)))} disabled={r.format === 'svg'}>
            {[0.5, 0.75, 1, 1.5, 2, 3, 4].map((k) => (
              <option key={k} value={k}>
                {k}x
              </option>
            ))}
          </select>
          <input className="text-input" placeholder="Suffix" value={r.suffix} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, suffix: e.target.value } : x)))} />
          <select value={r.format} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, format: e.target.value as ExportFormat } : x)))}>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="svg">SVG</option>
            <option value="pdf">PDF</option>
          </select>
          <RemoveBtn title="Remove export" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
    </>
  );
}

const DEFAULT_EXPORT: ExportSetting = { scale: 1, format: 'png', suffix: '' };

function ExportSection({ ids, name, nodeRows }: { ids: string[]; name: string; nodeRows?: ExportSetting[] }) {
  const [localRows, setLocalRows] = useState<ExportSetting[]>([{ ...DEFAULT_EXPORT, scale: 2 }]);
  const [busy, setBusy] = useState(false);
  const rows = nodeRows ?? localRows;
  const setRows = (r: ExportSetting[]) => (nodeRows ? setProps(ids, { exports: r }) : setLocalRows(r));
  return (
    <Section title="Export" action={<AddBtn title="Add export setting" onClick={() => setRows([...rows, rows.length ? { ...rows[rows.length - 1], suffix: `@${rows.length + 1}` } : DEFAULT_EXPORT])} />}>
      <ExportRows rows={rows} onChange={setRows} />
      {rows.length > 0 && (
        <button
          className="btn wide"
          disabled={busy || !ids.length}
          onClick={async () => {
            setBusy(true);
            try {
              const doc = useStore.getState().doc;
              if (nodeRows) await exportLayers(doc, ids, rows, name);
              else for (const r of rows) await exportCombined(doc, ids, r, name + r.suffix);
            } catch (e) {
              alert('Export failed: ' + (e instanceof Error ? e.message : e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Exporting…' : `Export ${name}`}
        </button>
      )}
    </Section>
  );
}

function PageDesign() {
  const page = useStore((s) => getPage(s.doc, s.pageId));
  return (
    <>
      <Section title="Page">
        <ColorField
          value={page.bg}
          onChange={(c, live) =>
            useStore.getState().update((d) => {
              getPage(d, page.id).bg = c;
            }, !live)
          }
        />
      </Section>
      <ExportSection ids={page.children} name={page.name} />
    </>
  );
}

const ALIGNS: [AlignKind, () => JSX.Element, string][] = [
  ['left', Icons.alignLeft, 'Align left (⌥A)'],
  ['hcenter', Icons.alignHCenter, 'Align horizontal centers (⌥H)'],
  ['right', Icons.alignRight, 'Align right (⌥D)'],
  ['top', Icons.alignTop, 'Align top (⌥W)'],
  ['vcenter', Icons.alignVCenter, 'Align vertical centers (⌥V)'],
  ['bottom', Icons.alignBottom, 'Align bottom (⌥S)'],
];

function FillSection({ nodes, set }: { nodes: SceneNode[]; set: (p: Partial<SceneNode>, live?: boolean) => void }) {
  const n = nodes[0];
  const g = n.gradient;
  const kind = !n.fill ? 'none' : g ? g.type : 'solid';
  const setG = (p: Partial<Gradient>, live = false) => set({ gradient: { ...g!, ...p } }, live);
  const defaultFill = isFrameLike(n) ? '#ffffff' : n.type === 'text' ? '#1e1e1e' : '#d9d9d9';
  return (
    <Section title="Fill" action={n.fill === null ? <AddBtn title="Add fill" onClick={() => set({ fill: defaultFill })} /> : <RemoveBtn title="Remove fill" onClick={() => set({ fill: null, gradient: null })} />}>
      {kind !== 'none' && (
        <>
          <select
            className="wide"
            value={kind}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'solid') set({ gradient: null });
              else set({ gradient: { type: v as Gradient['type'], angle: g?.angle ?? 90, stops: g?.stops ?? [{ offset: 0, color: n.fill! }, { offset: 1, color: '#ffffff' }] } });
            }}
          >
            <option value="solid">Solid</option>
            <option value="linear">Linear gradient</option>
            <option value="radial">Radial gradient</option>
          </select>
          {g ? (
            <>
              <div className="gradient-bar" style={{ background: `linear-gradient(90deg, ${g.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})` }} />
              {g.stops.map((s, i) => (
                <div key={i} className="stop-row">
                  <Num label="%" value={Math.round(s.offset * 100)} min={0} max={100} onChange={(v, live) => setG({ stops: g.stops.map((x, j) => (j === i ? { ...x, offset: v / 100 } : x)) }, live)} />
                  <ColorField value={s.color} onChange={(c, live) => set({ fill: i === 0 ? c : n.fill, gradient: { ...g, stops: g.stops.map((x, j) => (j === i ? { ...x, color: c } : x)) } }, live)} />
                  {g.stops.length > 2 && <RemoveBtn title="Remove stop" onClick={() => setG({ stops: g.stops.filter((_, j) => j !== i) })} />}
                </div>
              ))}
              <div className="grid2">
                {g.type === 'linear' && <Num icon={<Icons.rotate />} title="Angle" value={g.angle} onChange={(v, live) => setG({ angle: v }, live)} />}
                <button className="btn" onClick={() => setG({ stops: [...g.stops, { offset: 0.5, color: '#888888' }].sort((a, b) => a.offset - b.offset) })}>
                  + Stop
                </button>
              </div>
            </>
          ) : (
            <ColorField value={n.fill!} onChange={(c, live) => set({ fill: c }, live)} />
          )}
          <DocColors onPick={(c) => set({ fill: c, gradient: null })} />
        </>
      )}
    </Section>
  );
}

function Design() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const readOnly = useStore((s) => s.readOnly);
  const nodes = selection.map((id) => doc.nodes[id]).filter(Boolean);
  if (!nodes.length) return <PageDesign />;

  const n = nodes[0];
  const ids = nodes.map((m) => m.id);
  const single = nodes.length === 1;
  const num = (k: keyof SceneNode): number | null => {
    const v = n[k];
    return typeof v === 'number' && nodes.every((m) => m[k] === v) ? v : null;
  };
  const set = (patch: Partial<SceneNode>, live = false) => setProps(ids, patch, !live);
  const update = useStore.getState().update;
  const allType = (...t: SceneNode['type'][]) => nodes.every((m) => t.includes(m.type));
  const hasFill = !allType('group', 'instance', 'image');
  const hasRadius = allType('rect', 'frame', 'component', 'image');
  const al = single && isFrameLike(n) ? n.autoLayout : undefined;
  const setAL = (p: Partial<AutoLayout>, live = false) => set({ autoLayout: { ...al!, ...p } }, live);
  const master = n.type === 'instance' ? doc.nodes[n.componentId ?? ''] : null;
  const parent = n.parentId ? doc.nodes[n.parentId] : null;
  const showConstraints = single && parent && isFrameLike(parent) && !parent.autoLayout;
  const con = n.constraints ?? { h: 'left', v: 'top' };
  const isShape = single && n.type === 'path' && !!n.polySides;

  return (
    <fieldset className="design" disabled={readOnly}>
      <div className="section header-section">
        <span className={`type-badge${n.type === 'component' || n.type === 'instance' ? ' comp' : ''}`}>{single ? (n.type === 'rect' ? 'Rectangle' : n.type === 'path' ? 'Vector' : n.type[0].toUpperCase() + n.type.slice(1)) : `${nodes.length} layers`}</span>
        {single && n.type === 'instance' && (
          <div className="stack">
            <p className="muted">Instance of {master?.name ?? 'missing component'}</p>
            <div className="row">
              {master && (
                <button className="btn" onClick={() => goToMainComponent(n.id)}>
                  Go to main
                </button>
              )}
              <button className="btn" onClick={detachInstance}>
                Detach
              </button>
            </div>
          </div>
        )}
        {single && n.type === 'component' && (
          <button className="btn wide" onClick={() => insertInstance(n.id)}>
            ❖ Insert instance
          </button>
        )}
        {single && (n.type === 'frame' || n.type === 'group') && (
          <button className="btn wide" onClick={createComponent}>
            Create component
          </button>
        )}
        {nodes.length > 1 && (
          <div className="bool-row">
            {(['union', 'subtract', 'intersect', 'exclude'] as const).map((op) => (
              <button key={op} className="btn small" onClick={() => booleanOp(op)} title={`${op[0].toUpperCase() + op.slice(1)} selection`}>
                {op[0].toUpperCase() + op.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="section align-row">
        {ALIGNS.map(([k, Icon, t]) => (
          <button key={k} className="icon-btn" title={t} onClick={() => align(k)}>
            <Icon />
          </button>
        ))}
        {nodes.length > 2 && (
          <>
            <button className="icon-btn" title="Distribute horizontal spacing" onClick={() => distribute('h')}>
              ⇹
            </button>
            <button className="icon-btn" title="Distribute vertical spacing" onClick={() => distribute('v')}>
              ⇵
            </button>
          </>
        )}
      </div>

      <Section title={isFrameLike(n) ? 'Frame' : 'Layout'}>
        <div className="grid2">
          <Num label="X" value={num('x')} onChange={(v, live) => update((d) => ids.forEach((id) => moveDeep(d, id, v - d.nodes[id].x, 0)), !live)} />
          <Num label="Y" value={num('y')} onChange={(v, live) => update((d) => ids.forEach((id) => moveDeep(d, id, 0, v - d.nodes[id].y)), !live)} />
          <Num label="W" value={num('w')} min={0} disabled={allType('text') || !!al} title={al ? 'Hug contents (auto layout)' : undefined} onChange={(v, live) => update((d) => ids.forEach((id) => setSize(d, id, v, d.nodes[id].h)), !live)} />
          <Num label="H" value={num('h')} min={0} disabled={allType('text') || !!al} onChange={(v, live) => update((d) => ids.forEach((id) => setSize(d, id, d.nodes[id].w, v)), !live)} />
          <Num icon={<Icons.rotate />} title="Rotation" value={num('rotation')} onChange={(v, live) => set({ rotation: ((v % 360) + 360) % 360 }, live)} />
          {hasRadius && <Num icon={<Icons.radius />} title="Corner radius" value={num('radius')} min={0} onChange={(v, live) => set({ radius: v }, live)} />}
        </div>
        {single && isFrameLike(n) && (
          <label className="check-row">
            <input type="checkbox" checked={!!n.clip} onChange={(e) => set({ clip: e.target.checked })} /> Clip content
          </label>
        )}
      </Section>

      {isShape && (
        <Section title={n.starRatio ? 'Star' : 'Polygon'}>
          <div className="grid2">
            <Num label="Count" value={n.polySides!} min={3} max={60} onChange={(v, live) => set({ polySides: Math.round(v), points: shapePoints(Math.round(v), n.starRatio) }, live)} />
            {n.starRatio !== undefined && <Num label="Ratio" value={Math.round(n.starRatio * 100)} min={5} max={100} onChange={(v, live) => set({ starRatio: v / 100, points: shapePoints(n.polySides!, v / 100) }, live)} />}
          </div>
        </Section>
      )}

      {showConstraints && (
        <Section title="Constraints">
          <div className="grid2">
            <select value={con.h} onChange={(e) => set({ constraints: { ...con, h: e.target.value as HConstraint } })}>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="leftright">Left & right</option>
              <option value="center">Center</option>
              <option value="scale">Scale</option>
            </select>
            <select value={con.v} onChange={(e) => set({ constraints: { ...con, v: e.target.value as VConstraint } })}>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="topbottom">Top & bottom</option>
              <option value="center">Center</option>
              <option value="scale">Scale</option>
            </select>
          </div>
        </Section>
      )}

      {single && isFrameLike(n) && (
        <Section title="Auto layout" action={al ? <RemoveBtn title="Remove auto layout" onClick={() => set({ autoLayout: null })} /> : <AddBtn title="Add auto layout (⇧A)" onClick={autoLayoutSelection} />}>
          {al && (
            <>
              <div className="row">
                <div className="seg">
                  <button className={al.direction === 'vertical' ? 'on' : ''} title="Vertical" onClick={() => setAL({ direction: 'vertical' })}>
                    <Icons.arrowDown />
                  </button>
                  <button className={al.direction === 'horizontal' ? 'on' : ''} title="Horizontal" onClick={() => setAL({ direction: 'horizontal' })}>
                    <Icons.arrowRight />
                  </button>
                </div>
                <select value={al.align} onChange={(e) => setAL({ align: e.target.value as AutoLayout['align'] })}>
                  <option value="start">Align start</option>
                  <option value="center">Align center</option>
                  <option value="end">Align end</option>
                </select>
              </div>
              <div className="grid2">
                <Num label="Gap" value={al.gap} min={0} onChange={(v, live) => setAL({ gap: v }, live)} />
                <Num label="Pad" value={al.padding} min={0} onChange={(v, live) => setAL({ padding: v }, live)} />
              </div>
            </>
          )}
        </Section>
      )}

      <Section title="Layer">
        <div className="grid2">
          <select value={n.blendMode ?? 'normal'} onChange={(e) => set({ blendMode: e.target.value })} title="Blend mode">
            {BLENDS.map((b) => (
              <option key={b} value={b}>
                {b === 'normal' ? 'Pass through' : b.replace('-', ' ')}
              </option>
            ))}
          </select>
          <Num label="%" title="Opacity" value={num('opacity') === null ? null : Math.round(n.opacity * 100)} min={0} max={100} onChange={(v, live) => set({ opacity: v / 100 }, live)} />
        </div>
      </Section>

      {allType('text') && (
        <Section title="Text">
          <select className="wide" value={n.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
          <div className="grid2">
            <select value={n.fontWeight} onChange={(e) => set({ fontWeight: +e.target.value })}>
              {WEIGHTS.map(([w, l]) => (
                <option key={w} value={w}>
                  {l}
                </option>
              ))}
            </select>
            <Num label="Size" value={num('fontSize')} min={1} onChange={(v, live) => set({ fontSize: v }, live)} />
            <Num label="LH" title="Line height %" value={num('lineHeight') === null ? null : Math.round((n.lineHeight ?? 1.2) * 100)} min={50} onChange={(v, live) => set({ lineHeight: v / 100 }, live)} />
            <Num label="LS" title="Letter spacing (px)" value={n.letterSpacing ?? 0} step={0.1} onChange={(v, live) => set({ letterSpacing: v }, live)} />
            <div className="seg">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} className={n.textAlign === a ? 'on' : ''} title={`Align ${a}`} onClick={() => set({ textAlign: a })}>
                  {a === 'left' ? <Icons.alignLeft /> : a === 'center' ? <Icons.alignHCenter /> : <Icons.alignRight />}
                </button>
              ))}
            </div>
            <div className="seg">
              {(['none', 'underline', 'line-through'] as const).map((t) => (
                <button key={t} className={(n.textDecoration ?? 'none') === t ? 'on' : ''} title={t === 'none' ? 'No decoration' : t} onClick={() => set({ textDecoration: t })} style={{ textDecoration: t }}>
                  {t === 'none' ? '—' : 'U'}
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      {single && n.type === 'image' && (
        <Section title="Image">
          <select className="wide" value={n.imageFit ?? 'fill'} onChange={(e) => set({ imageFit: e.target.value as 'fill' | 'fit' })}>
            <option value="fill">Fill</option>
            <option value="fit">Fit</option>
          </select>
        </Section>
      )}

      {hasFill && <FillSection nodes={nodes} set={set} />}

      {!allType('group', 'instance') && (
        <Section title="Stroke" action={n.stroke === null ? <AddBtn title="Add stroke" onClick={() => set({ stroke: '#1e1e1e', strokeWidth: n.strokeWidth || 1 })} /> : <RemoveBtn title="Remove stroke" onClick={() => set({ stroke: null, arrowEnd: false })} />}>
          {n.stroke !== null && (
            <>
              <ColorField value={n.stroke} onChange={(c, live) => set({ stroke: c }, live)} />
              <div className="grid2">
                <Num label="W" title="Stroke width" value={num('strokeWidth')} min={0} step={0.5} onChange={(v, live) => set({ strokeWidth: v }, live)} />
                {n.type === 'path' && !n.closed && (
                  <label className="check-row">
                    <input type="checkbox" checked={!!n.arrowEnd} onChange={(e) => set({ arrowEnd: e.target.checked })} /> Arrow
                  </label>
                )}
              </div>
            </>
          )}
        </Section>
      )}

      <Section title="Effects">
        <div className="effect-row">
          <span>Drop shadow</span>
          {n.shadow ? <RemoveBtn title="Remove shadow" onClick={() => set({ shadow: null })} /> : <AddBtn title="Add drop shadow" onClick={() => set({ shadow: { x: 0, y: 4, blur: 12, color: '#000000', opacity: 0.25 } })} />}
        </div>
        {n.shadow && (
          <>
            <div className="grid2">
              <Num label="X" value={n.shadow.x} onChange={(v, live) => set({ shadow: { ...n.shadow!, x: v } }, live)} />
              <Num label="Y" value={n.shadow.y} onChange={(v, live) => set({ shadow: { ...n.shadow!, y: v } }, live)} />
              <Num label="Blur" value={n.shadow.blur} min={0} onChange={(v, live) => set({ shadow: { ...n.shadow!, blur: v } }, live)} />
              <Num label="%" value={Math.round(n.shadow.opacity * 100)} min={0} max={100} onChange={(v, live) => set({ shadow: { ...n.shadow!, opacity: v / 100 } }, live)} />
            </div>
            <ColorField value={n.shadow.color} onChange={(c, live) => set({ shadow: { ...n.shadow!, color: c } }, live)} />
          </>
        )}
        <div className="effect-row">
          <span>Layer blur</span>
          {n.blur ? <RemoveBtn title="Remove blur" onClick={() => set({ blur: 0 })} /> : <AddBtn title="Add layer blur" onClick={() => set({ blur: 4 })} />}
        </div>
        {!!n.blur && (
          <div className="grid2">
            <Num label="Blur" value={n.blur} min={0} onChange={(v, live) => set({ blur: v }, live)} />
          </div>
        )}
      </Section>

      {single && n.type === 'path' && (
        <div className="section">
          <button className="btn wide" onClick={() => useStore.getState().set({ vectorEditId: n.id })}>
            Edit points (Enter)
          </button>
        </div>
      )}
      {single && (n.type === 'rect' || n.type === 'ellipse') && (
        <div className="section">
          <button className="btn wide" onClick={flattenSelection}>
            Flatten to vector (⌘E)
          </button>
        </div>
      )}

      <ExportSection ids={ids} name={single ? n.name : `${nodes.length} layers`} nodeRows={n.exports ?? []} />
    </fieldset>
  );
}

function Prototype() {
  const doc = useStore((s) => s.doc);
  const pageId = useStore((s) => s.pageId);
  const selection = useStore((s) => s.selection);
  const n = selection.length === 1 ? doc.nodes[selection[0]] : null;
  const frames = topFrames(doc, pageId);
  return (
    <>
      <Section title="Interactions">
        {!n ? (
          <p className="muted">Select a layer to add a click interaction.</p>
        ) : (
          <>
            <p className="muted">On click → Navigate to</p>
            <select className="wide" value={n.link ?? ''} onChange={(e) => setProps([n.id], { link: e.target.value || null })}>
              <option value="">None</option>
              {frames
                .filter((f) => f.id !== n.id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </>
        )}
      </Section>
      <Section title="Presentation">
        <button className="btn primary wide" onClick={startPresent}>
          <Icons.play /> Present
        </button>
        <p className="muted">Click linked layers to navigate. ← → switch frames, Esc exits.</p>
      </Section>
    </>
  );
}

function Inspect() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const n = selection.length === 1 ? doc.nodes[selection[0]] : null;
  const [copied, setCopied] = useState(false);
  if (!n) return <p className="muted pad">Select one layer to inspect its CSS.</p>;
  const css = cssFor(doc, n);
  return (
    <Section
      title="CSS"
      action={
        <button
          className="btn small"
          onClick={() => {
            navigator.clipboard.writeText(css);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      }
    >
      <pre className="code">{css}</pre>
    </Section>
  );
}

export default function RightPanel() {
  const [tab, setTab] = useState<'design' | 'prototype' | 'inspect'>('design');
  return (
    <aside className="panel right">
      <div className="tabs">
        {(['design', 'prototype', 'inspect'] as const).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="panel-scroll" key={tab}>{tab === 'design' ? <Design /> : tab === 'prototype' ? <Prototype /> : <Inspect />}</div>
    </aside>
  );
}
