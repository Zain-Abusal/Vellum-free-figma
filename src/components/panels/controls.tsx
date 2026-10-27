/** Shared Design-panel controls: number scrubbers, color fields, sections, style pickers. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../../store';
import type { Shadow } from '../../types';
import { Icons } from '../icons';

export const FONTS = ['Inter', 'Roboto', 'Poppins', 'Montserrat', 'Space Grotesk', 'Playfair Display', 'DM Serif Display', 'Space Mono', 'Arial', 'Georgia', 'Times New Roman', 'Courier New'];

export const WEIGHTS: [number, string][] = [
  [300, 'Light'],
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'Semi Bold'],
  [700, 'Bold'],
  [800, 'Extra Bold'],
];

export const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

export const fmt = (v: number) => String(Math.round(v * 100) / 100);

export type OnNum = (v: number, live?: boolean) => void;

export function Num({ label, icon, value, onChange, step = 1, min, max, disabled, title }: { label?: string; icon?: ReactNode; value: number | null; onChange: OnNum; step?: number; min?: number; max?: number; disabled?: boolean; title?: string }) {
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

export const normHex = (t: string) => {
  let h = t.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toLowerCase() : null;
};

export function ColorField({ value, onChange, extra }: { value: string; onChange: (v: string, live?: boolean) => void; extra?: ReactNode }) {
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
export function DocColors({ onPick }: { onPick: (c: string) => void }) {
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

export function Section({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
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

export const AddBtn = ({ onClick, title }: { onClick: () => void; title: string }) => (
  <button className="icon-btn" title={title} onClick={onClick}>
    <Icons.plus />
  </button>
);

export const RemoveBtn = ({ onClick, title }: { onClick: () => void; title: string }) => (
  <button className="icon-btn" title={title} onClick={onClick}>
    <Icons.minus />
  </button>
);

/** Style chip + picker. Linked layers show the style name; editing values detaches (like Figma). */
export function StylePicker({ kind, current, onApply, onCreate, onDetach, onEdit }: { kind: 'colors' | 'texts'; current?: string; onApply: (id: string) => void; onCreate: () => void; onDetach: () => void; onEdit?: (id: string) => void }) {
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

export function ShadowEditor({ value, onChange }: { value: Shadow; onChange: (v: Shadow, live?: boolean) => void }) {
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
