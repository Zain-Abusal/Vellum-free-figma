import { defineExtension } from '../types';

/**
 * Template extension. Copy this folder to src/extensions/<your-id>/ (no leading underscore),
 * change the id/name, and rebuild. See docs/EXTENSIONS.md.
 */
export default defineExtension({
  id: 'my-extension',
  name: 'My Extension',
  description: 'Creates a rounded rectangle at the centre of the screen.',
  icon: '✨',
  inputs: [
    { key: 'size', label: 'Size', type: 'number', default: 120, min: 1 },
    { key: 'color', label: 'Color', type: 'color', default: '#9747ff' },
  ],
  run(api, values) {
    const size = Number(values.size) || 120;
    const c = api.viewportCenter();
    const id = api.create('rect', { x: c.x - size / 2, y: c.y - size / 2, w: size, h: size, radius: 16, fill: String(values.color) });
    api.select([id]);
    return 'Done!';
  },
});
