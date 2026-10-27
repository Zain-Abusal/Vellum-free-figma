/** Fill: solid, gradients, color styles, variables, document colors. */
import { VarBinding } from './VariablesUI';
import { useStore } from '../../store';
import { applyColorStyle, createColorStyle, updateColorStyle } from '../../actions';
import { isFrameLike } from '../../doc';
import type { Gradient, SceneNode } from '../../types';
import { Icons } from '../icons';
import { AddBtn, ColorField, DocColors, Num, RemoveBtn, Section, StylePicker } from './controls';

export function FillSection({ nodes, set }: { nodes: SceneNode[]; set: (p: Partial<SceneNode>, live?: boolean) => void }) {
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
          {!g && !n.fillStyleId && <VarBinding nodes={nodes} prop="fill" type="color" />}
          {!n.fillStyleId && <DocColors onPick={(c) => set({ fill: c, gradient: null })} />}
        </>
      )}
    </Section>
  );
}
