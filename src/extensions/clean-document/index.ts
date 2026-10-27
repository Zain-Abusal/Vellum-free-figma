import { defineExtension } from '../types';

/** Like "Clean Document": tidy up the current page. */
export default defineExtension({
  id: 'clean-document',
  name: 'Clean Document',
  description: 'Delete hidden layers, remove empty frames, and round positions/sizes to whole pixels.',
  icon: '🧹',
  inputs: [
    { key: 'hidden', label: 'Delete hidden layers', type: 'checkbox', default: true },
    { key: 'empty', label: 'Delete empty frames without fill', type: 'checkbox', default: true },
    { key: 'round', label: 'Round to whole pixels', type: 'checkbox', default: true },
  ],
  run(api, v) {
    let removed = 0;
    let rounded = 0;
    for (const n of api.pageNodes()) {
      if (!api.get(n.id)) continue;
      if (v.hidden && !n.visible) {
        api.remove(n.id);
        removed++;
        continue;
      }
      if (v.empty && n.type === 'frame' && !n.children.length && !n.fill && !n.stroke) {
        api.remove(n.id);
        removed++;
        continue;
      }
      if (v.round && n.type !== 'text' && [n.x, n.y, n.w, n.h].some((k) => k !== Math.round(k))) {
        api.update(n.id, { x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h) });
        rounded++;
      }
    }
    return `Removed ${removed} layer${removed === 1 ? '' : 's'}, rounded ${rounded}.`;
  },
});
