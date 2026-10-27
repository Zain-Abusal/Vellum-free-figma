import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import {
  align,
  applyColorStyle,
  applyTextStyle,
  createColorStyle,
  createTextStyle,
  updateColorStyle,
  FRAME_PRESETS,
  insertFramePreset,
  useAsMask,
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
import { descendants, getPage, isFrameLike, moveDeep, setSize } from '../doc';
import { shapePoints } from '../geometry';
import { cssFor, exportCombined, exportLayers } from '../exporter';
import { reactFor, tailwindFor } from '../codegen';
import type { AutoLayout, ExportFormat, ExportSetting, Gradient, HConstraint, SceneNode, Shadow, Transition, VConstraint } from '../types';
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

/** Style chip + picker. Linked layers show the style name; editing values detaches (like Figma). */
function StylePicker({ kind, current, onApply, onCreate, onDetach, onEdit }: { kind: 'colors' | 'texts'; current?: string; onApply: (id: string) => void; onCreate: () => void; onDetach: () => void; onEdit?: (id: string) => void }) {
  const styles = useStore((s) => s.doc.styles?.[kind] ?? []);
  const [open, setOpen] = useState(false);
  const cur = styles.find((x) => x.id === current);
  return (
    <div className="style-picker">
      {cur ? (
        <div className="style-chip">
          {'color' in cur ? <span className="swatch" style={{ background: cur.color }} /> : <span className="type-ag">Ag</span>}
          <span className="layer-name">{cur.name}</span>
          {onEdit && (
            <button className="icon-btn" title="Edit style" onClick={() => onEdit(cur.id)}>
              <Icons.settings />
            </button>
          )}
          <button className="icon-btn" title="Detach style" onClick={onDetach}>
            <Icons.detach />
          </button>
        </div>
      ) : (
        <button className="link-btn style-open" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icons.style /> {styles.length ? 'Apply style…' : 'Create style…'}
        </button>
      )}
      {open && !cur && (
        <div className="style-menu">
          {styles.map((x) => (
            <button
              key={x.id}
              className="style-row"
              onClick={() => {
                onApply(x.id);
                setOpen(false);
              }}
            >
              {'color' in x ? <span className="swatch" style={{ background: x.color }} /> : <span className="type-ag" style={{ fontFamily: x.fontFamily, fontWeight: x.fontWeight }}>Ag</span>}
              <span className="layer-name">{x.name}</span>
            </button>
          ))}
          <button
            className="style-row create"
            onClick={() => {
              onCreate();
              setOpen(false);
            }}
          >
            <Icons.plus /> Create new style
          </button>
        </div>
      )}
    </div>
  );
}

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
            !n.fillStyleId && <ColorField value={n.fill!} onChange={(c, live) => set({ fill: c, fillStyleId: undefined }, live)} />
          )}
          {!g && (
            <StylePicker
              kind="colors"
              current={n.fillStyleId}
              onApply={(id) => applyColorStyle(nodes.map((m) => m.id), id)}
              onCreate={() => {
                const name = prompt('Color style name', `Color ${(useStore.getState().doc.styles?.colors.length ?? 0) + 1}`);
                if (name) createColorStyle(name, n.fill!, nodes.map((m) => m.id));
              }}
              onDetach={() => set({ fillStyleId: undefined })}
              onEdit={(id) => {
                const st = useStore.getState().doc.styles?.colors.find((c) => c.id === id);
                const v = st && prompt(`Change “${st.name}” for every layer using it (hex):`, st.color);
                const hex = v && /^#?[0-9a-f]{6}$/i.test(v.trim()) ? '#' + v.trim().replace('#', '').toLowerCase() : null;
                if (hex) updateColorStyle(id, { color: hex });
              }}
            />
          )}
          {!n.fillStyleId && <DocColors onPick={(c) => set({ fill: c, gradient: null })} />}
        </>
      )}
    </Section>
  );
}

function ShadowEditor({ value, onChange }: { value: Shadow; onChange: (v: Shadow, live?: boolean) => void }) {
  return (
    <>
      <div className="grid2">
        <Num label="X" value={value.x} onChange={(v, live) => onChange({ ...value, x: v }, live)} />
        <Num label="Y" value={value.y} onChange={(v, live) => onChange({ ...value, y: v }, live)} />
        <Num label="Blur" value={value.blur} min={0} onChange={(v, live) => onChange({ ...value, blur: v }, live)} />
        <Num label="%" value={Math.round(value.opacity * 100)} min={0} max={100} onChange={(v, live) => onChange({ ...value, opacity: v / 100 }, live)} />
      </div>
      <ColorField value={value.color} onChange={(c, live) => onChange({ ...value, color: c }, live)} />
    </>
  );
}

function FramePresets() {
  const [q, setQ] = useState('');
  return (
    <div className="presets">
      <div className="search slim">
        <Icons.search />
        <input placeholder="Search frame sizes" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="muted pad tight">Drag on the canvas for a custom size, or pick a preset.</p>
      {FRAME_PRESETS.map((g) => {
        const items = g.items.filter(([name]) => (g.group + ' ' + name).toLowerCase().includes(q.toLowerCase()));
        if (!items.length) return null;
        return (
          <div key={g.group} className="preset-group">
            <div className="cmd-group">{g.group}</div>
            {items.map(([name, w, h]) => (
              <button key={name} className="preset" onClick={() => insertFramePreset(name, w, h)}>
                <span className="preset-thumb" style={{ aspectRatio: `${w} / ${h}` }} />
                <span className="layer-name">{name}</span>
                <span className="muted mono">
                  {w}×{h}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function InstanceProps({ n, master }: { n: SceneNode; master: SceneNode }) {
  const doc = useStore((s) => s.doc);
  const texts = descendants(doc, master.id).map((id) => doc.nodes[id]).filter((m) => m?.type === 'text');
  const layers = master.children.map((id) => doc.nodes[id]).filter(Boolean);
  const ov = n.overrides ?? {};
  const setOv = (id: string, patch: { text?: string; visible?: boolean }) =>
    setProps([n.id], (node) => {
      const cur = { ...(node.overrides ?? {}) };
      cur[id] = { ...cur[id], ...patch };
      node.overrides = cur;
    });
  return (
    <Section title="Instance properties" action={Object.keys(ov).length ? <button className="link-btn" onClick={() => setProps([n.id], { overrides: undefined })}>Reset all</button> : undefined}>
      {texts.map((t) => (
        <label key={t.id} className="field">
          <span className="muted">{t.name}</span>
          <input className="text-input" value={ov[t.id]?.text ?? t.text ?? ''} onChange={(e) => setOv(t.id, { text: e.target.value })} />
        </label>
      ))}
      {layers.length > 0 && <span className="muted">Show layers</span>}
      {layers.map((l) => {
        const vis = ov[l.id]?.visible ?? l.visible;
        return (
          <label key={l.id} className="check-row">
            <input type="checkbox" checked={vis} onChange={(e) => setOv(l.id, { visible: e.target.checked })} /> {l.name}
          </label>
        );
      })}
      {!texts.length && !layers.length && <p className="muted">This component has no editable properties.</p>}
    </Section>
  );
}

function Design() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const readOnly = useStore((s) => s.readOnly);
  const nodes = selection.map((id) => doc.nodes[id]).filter(Boolean);
  const tool = useStore((s) => s.tool);
  if (!nodes.length) return tool === 'frame' ? <FramePresets /> : <PageDesign />;

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
  const hz = al?.direction === 'horizontal';
  const hugW = !!al && (hz ? al.hugMain !== false : al.hugCross !== false);
  const hugH = !!al && (hz ? al.hugCross !== false : al.hugMain !== false);
  const setHug = (axis: 'w' | 'h', hug: boolean) => setAL((axis === 'w') === hz ? { hugMain: hug } : { hugCross: hug });
  const inAL = !!parent?.autoLayout;

  return (
    <fieldset className="design" disabled={readOnly}>
      <div className="section header-section">
        <span className={`type-badge${n.type === 'component' || n.type === 'instance' ? ' comp' : ''}`}>{single ? (n.section ? 'Section' : n.type === 'rect' ? 'Rectangle' : n.type === 'path' ? 'Vector' : n.type[0].toUpperCase() + n.type.slice(1)) : `${nodes.length} layers`}</span>
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
              <Icons.distH />
            </button>
            <button className="icon-btn" title="Distribute vertical spacing" onClick={() => distribute('v')}>
              <Icons.distV />
            </button>
          </>
        )}
      </div>

      <Section title={isFrameLike(n) ? 'Frame' : 'Layout'}>
        <div className="grid2">
          <Num label="X" value={num('x')} onChange={(v, live) => update((d) => ids.forEach((id) => moveDeep(d, id, v - d.nodes[id].x, 0)), !live)} />
          <Num label="Y" value={num('y')} onChange={(v, live) => update((d) => ids.forEach((id) => moveDeep(d, id, 0, v - d.nodes[id].y)), !live)} />
          <Num label="W" value={num('w')} min={0} disabled={(allType('text') && n.textAutoResize !== 'height') || hugW} title={hugW ? 'Hug contents (auto layout)' : undefined} onChange={(v, live) => update((d) => ids.forEach((id) => setSize(d, id, v, d.nodes[id].h)), !live)} />
          <Num label="H" value={num('h')} min={0} disabled={allType('text') || hugH} title={hugH ? 'Hug contents (auto layout)' : undefined} onChange={(v, live) => update((d) => ids.forEach((id) => setSize(d, id, d.nodes[id].w, v)), !live)} />
          <Num icon={<Icons.rotate />} title="Rotation" value={num('rotation')} onChange={(v, live) => set({ rotation: ((v % 360) + 360) % 360 }, live)} />
          {hasRadius && !n.radii && (
            <div className="num-with-btn">
              <Num icon={<Icons.radius />} title="Corner radius" value={num('radius')} min={0} onChange={(v, live) => set({ radius: v }, live)} />
              <button className="icon-btn" title="Independent corners" onClick={() => set({ radii: [n.radius, n.radius, n.radius, n.radius] })}>
                <Icons.corners />
              </button>
            </div>
          )}
        </div>
        {hasRadius && n.radii && (
          <div className="corner-grid">
            {(['↖', '↗', '↘', '↙'] as const).map((lbl, i) => (
              <Num key={i} label={lbl} title={['Top left', 'Top right', 'Bottom right', 'Bottom left'][i] + ' radius'} value={n.radii![i]} min={0} onChange={(v, live) => set({ radii: n.radii!.map((r, j) => (j === i ? v : r)) as [number, number, number, number] }, live)} />
            ))}
            <button className="icon-btn on" title="Same radius on all corners" onClick={() => set({ radius: Math.max(...n.radii!), radii: null })}>
              <Icons.corners />
            </button>
          </div>
        )}
        {al && (
          <div className="grid2">
            <select value={hugW ? 'hug' : 'fixed'} onChange={(e) => setHug('w', e.target.value === 'hug')} title="Width sizing">
              <option value="hug">W: Hug</option>
              <option value="fixed">W: Fixed</option>
            </select>
            <select value={hugH ? 'hug' : 'fixed'} onChange={(e) => setHug('h', e.target.value === 'hug')} title="Height sizing">
              <option value="hug">H: Hug</option>
              <option value="fixed">H: Fixed</option>
            </select>
          </div>
        )}
        {single && isFrameLike(n) && !n.section && (
          <select
            className="wide"
            value=""
            onChange={(e) => {
              const [name, w, h] = e.target.value.split('|');
              if (name) insertFramePreset(name, +w, +h);
            }}
          >
            <option value="">Resize to preset…</option>
            {FRAME_PRESETS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map(([name, w, h]) => (
                  <option key={name} value={`${name}|${w}|${h}`}>
                    {name} ({w}×{h})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
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
              <select className="wide" value={al.justify ?? 'start'} onChange={(e) => setAL({ justify: e.target.value as AutoLayout['justify'], ...(e.target.value !== 'start' ? { hugMain: false } : {}) })} title="Distribution along the main axis">
                <option value="start">Packed: start</option>
                <option value="center">Packed: center</option>
                <option value="end">Packed: end</option>
                <option value="between">Space between</option>
              </select>
              <div className="grid2">
                <Num label="Gap" value={al.gap} min={0} onChange={(v, live) => setAL({ gap: v }, live)} />
                <Num label="Pad" value={al.padding} min={0} onChange={(v, live) => setAL({ padding: v }, live)} />
              </div>
            </>
          )}
        </Section>
      )}

      {inAL && (
        <Section title="Auto layout child">
          <label className="check-row">
            <input type="checkbox" checked={!!n.layoutFill} onChange={(e) => set({ layoutFill: e.target.checked })} /> Fill container ({parent!.autoLayout!.direction === 'horizontal' ? 'width' : 'height'})
          </label>
          <label className="check-row">
            <input type="checkbox" checked={!!n.layoutStretch} onChange={(e) => set({ layoutStretch: e.target.checked })} /> Stretch ({parent!.autoLayout!.direction === 'horizontal' ? 'height' : 'width'})
          </label>
          {n.layoutFill && parent!.autoLayout!.hugMain !== false && <p className="muted">Set the parent to a fixed size for “fill” to take effect.</p>}
        </Section>
      )}

      {single && n.type === 'instance' && master && <InstanceProps n={n} master={master} />}

      {single && isFrameLike(n) && (
        <Section
          title="Layout grid"
          action={
            n.layoutGrid ? (
              <RemoveBtn title="Remove layout grid" onClick={() => set({ layoutGrid: null })} />
            ) : (
              <AddBtn title="Add layout grid" onClick={() => set({ layoutGrid: { type: 'columns', count: 12, size: 8, gutter: 20, margin: 24, color: '#ff4d6d', visible: true } })} />
            )
          }
        >
          {n.layoutGrid && (
            <>
              <div className="row">
                <select value={n.layoutGrid.type} onChange={(e) => set({ layoutGrid: { ...n.layoutGrid!, type: e.target.value as 'columns' } })}>
                  <option value="columns">Columns</option>
                  <option value="rows">Rows</option>
                  <option value="grid">Grid</option>
                </select>
                <button className={`icon-btn${n.layoutGrid.visible ? '' : ' on'}`} title="Show / hide (⌃⇧4 toggles all)" onClick={() => set({ layoutGrid: { ...n.layoutGrid!, visible: !n.layoutGrid!.visible } })}>
                  {n.layoutGrid.visible ? <Icons.eye /> : <Icons.eyeOff />}
                </button>
              </div>
              <div className="grid2">
                {n.layoutGrid.type === 'grid' ? (
                  <Num label="Size" value={n.layoutGrid.size} min={1} onChange={(v, live) => set({ layoutGrid: { ...n.layoutGrid!, size: v } }, live)} />
                ) : (
                  <>
                    <Num label="Count" value={n.layoutGrid.count} min={1} max={48} onChange={(v, live) => set({ layoutGrid: { ...n.layoutGrid!, count: Math.round(v) } }, live)} />
                    <Num label="Gutter" value={n.layoutGrid.gutter} min={0} onChange={(v, live) => set({ layoutGrid: { ...n.layoutGrid!, gutter: v } }, live)} />
                    <Num label="Margin" value={n.layoutGrid.margin} min={0} onChange={(v, live) => set({ layoutGrid: { ...n.layoutGrid!, margin: v } }, live)} />
                  </>
                )}
              </div>
              <ColorField value={n.layoutGrid.color} onChange={(c, live) => set({ layoutGrid: { ...n.layoutGrid!, color: c } }, live)} />
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
        <Section
          title="Text"
          action={
            <div className="seg mini">
              <button className={(n.textAutoResize ?? 'width') === 'width' ? 'on' : ''} title="Auto width" onClick={() => set({ textAutoResize: 'width' })}>
                <Icons.textWidth />
              </button>
              <button className={n.textAutoResize === 'height' ? 'on' : ''} title="Auto height (fixed width, wraps)" onClick={() => set({ textAutoResize: 'height' })}>
                <Icons.textHeight />
              </button>
            </div>
          }
        >
          <StylePicker
            kind="texts"
            current={single ? n.textStyleId : undefined}
            onApply={(id) => applyTextStyle(ids, id)}
            onCreate={() => {
              const name = prompt('Text style name', `${n.fontSize}/${Math.round((n.lineHeight ?? 1.2) * 100)} ${n.fontFamily}`);
              if (name) createTextStyle(name, n.id);
            }}
            onDetach={() => set({ textStyleId: undefined })}
          />
          <select className="wide" value={n.fontFamily} onChange={(e) => set({ fontFamily: e.target.value, textStyleId: undefined })}>
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
          <div className="grid2">
            <select value={n.fontWeight} onChange={(e) => set({ fontWeight: +e.target.value, textStyleId: undefined })}>
              {WEIGHTS.map(([w, l]) => (
                <option key={w} value={w}>
                  {l}
                </option>
              ))}
            </select>
            <Num label="Size" value={num('fontSize')} min={1} onChange={(v, live) => set({ fontSize: v, textStyleId: undefined }, live)} />
            <Num label="LH" title="Line height %" value={num('lineHeight') === null ? null : Math.round((n.lineHeight ?? 1.2) * 100)} min={50} onChange={(v, live) => set({ lineHeight: v / 100, textStyleId: undefined }, live)} />
            <Num label="LS" title="Letter spacing (px)" value={n.letterSpacing ?? 0} step={0.1} onChange={(v, live) => set({ letterSpacing: v, textStyleId: undefined }, live)} />
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
                <Num label="Dash" title="Dash length (0 = solid)" value={n.strokeDash ?? 0} min={0} onChange={(v, live) => set({ strokeDash: v }, live)} />
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
        {n.shadow && <ShadowEditor value={n.shadow} onChange={(v, live) => set({ shadow: v }, live)} />}
        <div className="effect-row">
          <span>Inner shadow</span>
          {n.innerShadow ? <RemoveBtn title="Remove inner shadow" onClick={() => set({ innerShadow: null })} /> : <AddBtn title="Add inner shadow" onClick={() => set({ innerShadow: { x: 0, y: 2, blur: 6, color: '#000000', opacity: 0.25 } })} />}
        </div>
        {n.innerShadow && <ShadowEditor value={n.innerShadow} onChange={(v, live) => set({ innerShadow: v }, live)} />}
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

      {nodes.length > 1 && (
        <div className="section">
          <button className="btn wide" onClick={useAsMask} title="Use as mask (⌃⌘M)">
            <Icons.mask /> Use bottom layer as mask
          </button>
        </div>
      )}
      {single && n.isMask && (
        <div className="section">
          <button className="btn wide" onClick={useAsMask}>
            <Icons.mask /> Release mask
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
              <option value="__back">← Back</option>
              {frames
                .filter((f) => f.id !== n.id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
            {n.link && (
              <>
                <p className="muted">Animation</p>
                <select className="wide" value={n.linkTransition ?? 'dissolve'} onChange={(e) => setProps([n.id], { linkTransition: e.target.value as Transition })}>
                  <option value="instant">Instant</option>
                  <option value="dissolve">Dissolve</option>
                  <option value="slide-left">Slide in from right</option>
                  <option value="slide-right">Slide in from left</option>
                  <option value="slide-up">Slide up</option>
                  <option value="slide-down">Slide down</option>
                </select>
              </>
            )}
          </>
        )}
      </Section>
      <Section title="Presentation">
        <button className="btn primary wide" onClick={startPresent}>
          <Icons.play /> Present
        </button>
        <p className="muted">Click linked layers to navigate. Clicking elsewhere flashes the hotspots. ← → switch frames, Backspace goes back, Esc exits.</p>
      </Section>
    </>
  );
}

function Inspect() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const n = selection.length === 1 ? doc.nodes[selection[0]] : null;
  const [lang, setLang] = useState<'css' | 'tailwind' | 'react' | 'react-tw'>(() => (localStorage.getItem('vellum:code-lang') as 'css') ?? 'css');
  const [copied, setCopied] = useState(false);
  if (!n) return <p className="muted pad">Select one layer to inspect its code.</p>;
  const code = lang === 'css' ? cssFor(doc, n) : lang === 'tailwind' ? tailwindFor(doc, n) : reactFor(doc, n, lang === 'react-tw' ? 'tailwind' : 'style');
  const pick = (l: typeof lang) => {
    setLang(l);
    try {
      localStorage.setItem('vellum:code-lang', l);
    } catch {
      /* ignore */
    }
  };
  return (
    <>
      <div className="section">
        <div className="seg wide-seg">
          {(
            [
              ['css', 'CSS'],
              ['tailwind', 'Tailwind'],
              ['react', 'React'],
              ['react-tw', 'React + TW'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={lang === k ? 'on' : ''} onClick={() => pick(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <Section
        title={lang === 'css' ? 'CSS' : lang === 'tailwind' ? 'Tailwind classes' : 'React component'}
        action={
          <button
            className="btn small"
            onClick={() => {
              navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        }
      >
        <pre className="code">{code}</pre>
      </Section>
    </>
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
