/** Per-instance overrides and variant switching. */
import { useStore } from '../../store';
import { parseVariant, setProps, switchVariant, variantSet } from '../../actions';
import { descendants } from '../../doc';
import type { SceneNode } from '../../types';
import { Section } from './controls';

export function InstanceProps({ n, master }: { n: SceneNode; master: SceneNode }) {
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
  const vs = variantSet(doc, master.id);
  const current = parseVariant(master.name);
  return (
    <Section title="Instance properties" action={Object.keys(ov).length ? <button className="link-btn" onClick={() => setProps([n.id], { overrides: undefined })}>Reset all</button> : undefined}>
      {vs &&
        Object.entries(vs.props).map(([prop, values]) => (
          <label key={prop} className="field">
            <span className="muted">❖ {prop}</span>
            <select value={current[prop] ?? ''} onChange={(e) => switchVariant(n.id, prop, e.target.value)}>
              {values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
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
