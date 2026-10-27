import { isFrameLike } from '../doc';
import type { Doc, SceneNode } from '../types';

/** Layout grid overlays for frames (not exported, toggle with ⌃⇧4). */
export function LayoutGrids({ doc, ids }: { doc: Doc; ids: string[] }) {
  const frames: SceneNode[] = [];
  const walk = (list: string[]) => {
    for (const id of list) {
      const n = doc.nodes[id];
      if (!n || !n.visible) continue;
      if (n.layoutGrid?.visible && isFrameLike(n)) frames.push(n);
      if (isFrameLike(n) || n.type === 'group') walk(n.children);
    }
  };
  walk(ids);
  return (
    <g className="layout-grids" pointerEvents="none">
      {frames.map((f) => {
        const g = f.layoutGrid!;
        const rects: [number, number, number, number][] = [];
        if (g.type === 'grid') {
          const sz = Math.max(1, g.size);
          for (let x = 0; x < f.w; x += sz) rects.push([f.x + x, f.y, 0.5, f.h]);
          for (let y = 0; y < f.h; y += sz) rects.push([f.x, f.y + y, f.w, 0.5]);
        } else {
          const len = g.type === 'columns' ? f.w : f.h;
          const cell = Math.max(0, (len - g.margin * 2 - g.gutter * (g.count - 1)) / Math.max(1, g.count));
          for (let i = 0; i < g.count; i++) {
            const o = g.margin + i * (cell + g.gutter);
            rects.push(g.type === 'columns' ? [f.x + o, f.y, cell, f.h] : [f.x, f.y + o, f.w, cell]);
          }
        }
        return (
          <g key={f.id} clipPath={undefined}>
            {rects.map(([x, y, w, h], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} fill={g.color} fillOpacity={g.type === 'grid' ? 0.6 : 0.12} />
            ))}
          </g>
        );
      })}
    </g>
  );
}
