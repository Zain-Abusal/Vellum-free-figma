import { useEffect, useState } from 'react';
import { extensions } from '../extensions/registry';
import { runExtension } from '../extensions/api';
import type { Extension, PickItem, Values } from '../extensions/types';
import { Window } from './Window';
import { Icons } from './icons';

const defaults = (ext: Extension): Values => Object.fromEntries((ext.inputs ?? []).map((f) => [f.key, f.default ?? (f.type === 'checkbox' ? false : f.type === 'number' ? 0 : '')]));

function Picker({ ext, onPick, picked }: { ext: Extension; onPick: (v: unknown) => void; picked: unknown }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PickItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    setItems(null);
    const t = setTimeout(() => {
      ext
        .picker!.search(q)
        .then((r) => alive && setItems(r))
        .catch(() => alive && setItems([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, ext]);
  return (
    <div className="picker">
      <div className="search slim">
        <Icons.search />
        <input autoFocus placeholder={ext.picker!.placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="pick-grid">
        {items === null && <p className="muted">Searching…</p>}
        {items?.length === 0 && <p className="muted">No results.</p>}
        {items?.map((it, i) => (
          <button key={i} className={`pick${picked === it.value ? ' on' : ''}`} title={it.label} onClick={() => onPick(it.value)}>
            {it.preview ? <img src={it.preview} alt="" loading="lazy" /> : <span>{it.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Runner({ ext, onDone }: { ext: Extension; onDone: () => void }) {
  const [values, setValues] = useState<Values>(() => defaults(ext));
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));
  const run = async (vals = values) => {
    setBusy(true);
    await runExtension(ext, vals);
    setBusy(false);
    onDone();
  };
  return (
    <div className="ext-runner">
      <p className="muted">{ext.description}</p>
      {ext.picker && <Picker ext={ext} picked={values.picked} onPick={(v) => set('picked', v)} />}
      {(ext.inputs ?? []).map((f) => (
        <label key={f.key} className={f.type === 'checkbox' ? 'check-row' : 'field'}>
          {f.type === 'checkbox' ? (
            <>
              <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}
            </>
          ) : (
            <>
              <span className="muted">{f.label}</span>
              {f.type === 'select' ? (
                <select value={String(values[f.key])} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea className="text-input area" value={String(values[f.key])} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
              ) : f.type === 'color' ? (
                <input type="color" value={String(values[f.key])} onChange={(e) => set(f.key, e.target.value)} />
              ) : (
                <input
                  className="text-input"
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={String(values[f.key])}
                  placeholder={f.type === 'text' ? f.placeholder : undefined}
                  min={f.type === 'number' ? f.min : undefined}
                  max={f.type === 'number' ? f.max : undefined}
                  step={f.type === 'number' ? f.step : undefined}
                  onChange={(e) => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && run()}
                />
              )}
            </>
          )}
        </label>
      ))}
      <button className="btn primary wide" disabled={busy || (!!ext.picker && values.picked === undefined)} onClick={() => run()}>
        {busy ? 'Running…' : `Run ${ext.name}`}
      </button>
    </div>
  );
}

export function ExtensionsModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState<Extension | null>(null);
  const list = extensions.filter((e) => (e.name + ' ' + e.description).toLowerCase().includes(q.toLowerCase()));
  return (
    <Window id="extensions" width={380} title={active ? active.name : 'Extensions'} onClose={onClose}>
      {active ? (
        <>
          <button className="link-btn" onClick={() => setActive(null)}>
            ← All extensions
          </button>
          <Runner ext={active} onDone={onClose} />
        </>
      ) : (
        <>
          <div className="search slim">
            <Icons.search />
            <input autoFocus placeholder="Search extensions" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="ext-list">
            {list.map((e) => (
              <button
                key={e.id}
                className="ext"
                onClick={() => {
                  // Extensions with no options run straight away.
                  if (!e.inputs?.length && !e.picker) runExtension(e, {}).then(onClose);
                  else setActive(e);
                }}
              >
                <span className="ext-icon">{e.icon ?? '⚡'}</span>
                <span>
                  <strong>{e.name}</strong>
                  <span className="muted">{e.description}</span>
                </span>
              </button>
            ))}
            {!list.length && <p className="muted">No extensions match.</p>}
          </div>
          <p className="muted small">Build your own: copy src/extensions/_template — see docs/EXTENSIONS.md.</p>
        </>
      )}
    </Window>
  );
}
