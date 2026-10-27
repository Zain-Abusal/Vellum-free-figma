/** Variables: binding pickers for the Design panel, frame mode overrides, and the Variables window. */
import { useState } from 'react';
import { useStore } from '../../store';
import {
  addMode,
  addVariable,
  bindVariable,
  createCollection,
  deleteCollection,
  deleteMode,
  deleteVariable,
  renameCollection,
  renameMode,
  renameVariable,
  setDefaultMode,
  setFrameMode,
  setVariableValue,
  variablesOfType,
} from '../../actions';
import type { SceneNode, VarProp } from '../../types';
import { Window } from '../Window';
import { Icons } from '../icons';

/** Small "bind to variable" control: shows the bound variable as a chip, or a picker. */
export function VarBinding({ nodes, prop, type }: { nodes: SceneNode[]; prop: VarProp; type: 'color' | 'number' }) {
  const doc = useStore((s) => s.doc);
  const [open, setOpen] = useState(false);
  const options = variablesOfType(doc, type);
  const bound = nodes[0].vars?.[prop];
  const cur = options.find((o) => o.v.id === bound);
  const ids = nodes.map((n) => n.id);
  if (cur)
    return (
      <div className="style-chip var-chip">
        {type === 'color' ? <span className="swatch" style={{ background: String(cur.v.values[cur.col.defaultMode]) }} /> : <span className="type-ag">#</span>}
        <span className="layer-name">{cur.v.name}</span>
        <button className="icon-btn" title="Detach variable" onClick={() => bindVariable(ids, prop, null)}>
          <Icons.detach />
        </button>
      </div>
    );
  return (
    <div className="style-picker">
      <button className="link-btn style-open" onClick={() => (options.length ? setOpen(!open) : useStore.getState().set({ variablesOpen: true }))}>
        <Icons.variable /> {options.length ? `Bind ${prop} to variable…` : 'Create variables…'}
      </button>
      {open && (
        <div className="style-menu">
          {options.map(({ col, v }) => (
            <button
              key={v.id}
              className="style-row"
              onClick={() => {
                bindVariable(ids, prop, v.id);
                setOpen(false);
              }}
            >
              {type === 'color' ? <span className="swatch" style={{ background: String(v.values[col.defaultMode]) }} /> : <span className="type-ag">#</span>}
              <span className="layer-name">{v.name}</span>
              <span className="muted">{col.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Per-frame mode override (e.g. this frame uses Dark). */
export function FrameModes({ n }: { n: SceneNode }) {
  const cols = useStore((s) => s.doc.styles?.variables ?? []);
  if (!cols.length) return null;
  return (
    <>
      {cols.map((c) => (
        <label key={c.id} className="field">
          <span className="muted">{c.name} mode</span>
          <select value={n.varModes?.[c.id] ?? ''} onChange={(e) => setFrameMode([n.id], c.id, e.target.value || null)}>
            <option value="">Auto ({c.modes.find((m) => m.id === c.defaultMode)?.name})</option>
            {c.modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </>
  );
}

/** Variables window: collections × modes table. */
export function VariablesWindow() {
  const cols = useStore((s) => s.doc.styles?.variables ?? []);
  const [active, setActive] = useState<string | null>(null);
  const col = cols.find((c) => c.id === active) ?? cols[0];
  const close = () => useStore.getState().set({ variablesOpen: false });
  return (
    <Window id="variables" title="Variables" width={640} onClose={close}>
      <div className="row tight wrap">
        {cols.map((c) => (
          <button key={c.id} className={`chip${c.id === col?.id ? ' on' : ''}`} onClick={() => setActive(c.id)} onDoubleClick={() => { const v = prompt('Rename collection', c.name); if (v) renameCollection(c.id, v); }}>
            {c.name}
          </button>
        ))}
        <button className="btn small" onClick={() => setActive(createCollection(cols.length ? `Collection ${cols.length + 1}` : 'Theme'))}>
          + Collection
        </button>
      </div>
      {!col ? (
        <p className="muted">Variables store reusable colors and numbers with <strong>modes</strong> (like Light and Dark). Bind them to fills, strokes, radius, opacity, gap or padding, then switch a frame’s mode to re-theme it.</p>
      ) : (
        <div className="var-table-wrap">
          <table className="var-table">
            <thead>
              <tr>
                <th>Name</th>
                {col.modes.map((m) => (
                  <th key={m.id}>
                    <input className="text-input" value={m.name} onChange={(e) => renameMode(col.id, m.id, e.target.value)} />
                    <span className="row tight">
                      <button className={`link-btn${col.defaultMode === m.id ? '' : ' muted'}`} title="Default mode" onClick={() => setDefaultMode(col.id, m.id)}>
                        {col.defaultMode === m.id ? '★ default' : '☆'}
                      </button>
                      {col.modes.length > 1 && (
                        <button className="icon-btn" title="Delete mode" onClick={() => deleteMode(col.id, m.id)}>
                          <Icons.close />
                        </button>
                      )}
                    </span>
                  </th>
                ))}
                <th>
                  <button className="btn small" onClick={() => addMode(col.id, `Mode ${col.modes.length + 1}`)}>
                    + Mode
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {col.vars.map((v) => (
                <tr key={v.id}>
                  <td>
                    <input className="text-input" value={v.name} onChange={(e) => renameVariable(col.id, v.id, e.target.value)} />
                  </td>
                  {col.modes.map((m) => (
                    <td key={m.id}>
                      {v.type === 'color' ? (
                        <input type="color" value={String(v.values[m.id] ?? '#000000')} onChange={(e) => setVariableValue(col.id, v.id, m.id, e.target.value)} />
                      ) : (
                        <input className="text-input" type="number" value={Number(v.values[m.id] ?? 0)} onChange={(e) => setVariableValue(col.id, v.id, m.id, Number(e.target.value))} />
                      )}
                    </td>
                  ))}
                  <td>
                    <button className="icon-btn" title="Delete variable" onClick={() => deleteVariable(col.id, v.id)}>
                      <Icons.close />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row tight">
            <button className="btn small" onClick={() => addVariable(col.id, 'color')}>
              + Color
            </button>
            <button className="btn small" onClick={() => addVariable(col.id, 'number')}>
              + Number
            </button>
            <span className="grow" />
            <button className="link-btn danger" onClick={() => confirm(`Delete “${col.name}” and unbind its variables?`) && deleteCollection(col.id)}>
              Delete collection
            </button>
          </div>
        </div>
      )}
    </Window>
  );
}
