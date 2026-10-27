/** Image fill modes: fill, fit, crop (zoom + focal point) and tile. */
import type { SceneNode } from '../../types';
import { Num, Section } from './controls';

type Set = (p: Partial<SceneNode>, live?: boolean) => void;

export function ImageSection({ n, set }: { n: SceneNode; set: Set }) {
  const mode = n.imageFit ?? 'fill';
  const natural = !!(n.naturalW && n.naturalH);
  return (
    <Section title="Image">
      <div className="seg wide-seg">
        {(['fill', 'fit', 'crop', 'tile'] as const).map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} disabled={!natural && (m === 'crop' || m === 'tile')} title={!natural && (m === 'crop' || m === 'tile') ? 'Re-import the image to enable cropping and tiling' : undefined} onClick={() => set({ imageFit: m })}>
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      {mode === 'crop' && natural && (
        <div className="grid2">
          <Num label="Zoom" title="Zoom %" value={Math.round((n.cropZoom ?? 1) * 100)} min={100} max={800} onChange={(v, live) => set({ cropZoom: v / 100 }, live)} />
          <span />
          <Num label="X" title="Horizontal focus %" value={Math.round((n.cropX ?? 0.5) * 100)} min={0} max={100} onChange={(v, live) => set({ cropX: v / 100 }, live)} />
          <Num label="Y" title="Vertical focus %" value={Math.round((n.cropY ?? 0.5) * 100)} min={0} max={100} onChange={(v, live) => set({ cropY: v / 100 }, live)} />
        </div>
      )}
      {mode === 'tile' && natural && (
        <div className="grid2">
          <Num label="Scale" title="Tile scale %" value={Math.round((n.tileScale ?? 0.25) * 100)} min={1} max={400} onChange={(v, live) => set({ tileScale: v / 100 }, live)} />
        </div>
      )}
      {natural && (
        <p className="muted">
          Original {n.naturalW}×{n.naturalH}px
        </p>
      )}
    </Section>
  );
}
