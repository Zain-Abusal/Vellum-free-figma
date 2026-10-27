/** Frame size presets shown while the Frame tool is active. */
import { useState } from 'react';
import { FRAME_PRESETS, insertFramePreset } from '../../actions';
import { Icons } from '../icons';

export function FramePresets() {
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
