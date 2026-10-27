import { defineExtension } from '../types';

/** Like "Rename It": rename many layers at once. */
export default defineExtension({
  id: 'batch-rename',
  name: 'Batch Rename',
  description: 'Rename selected layers with a pattern ($n = number, $& = old name) or find & replace.',
  icon: '✎',
  needsSelection: true,
  inputs: [
    { key: 'pattern', label: 'New name pattern (leave empty to use find/replace)', type: 'text', default: 'Item $n', placeholder: 'Card $n' },
    { key: 'start', label: 'Start number', type: 'number', default: 1 },
    { key: 'find', label: 'Find', type: 'text', default: '' },
    { key: 'replace', label: 'Replace with', type: 'text', default: '' },
  ],
  run(api, v) {
    const sel = api.selection().sort((a, b) => a.y - b.y || a.x - b.x);
    const pattern = String(v.pattern ?? '');
    let i = Number(v.start) || 1;
    for (const n of sel) {
      const name = pattern ? pattern.replace(/\$n/g, String(i++)).replace(/\$&/g, n.name) : v.find ? n.name.split(String(v.find)).join(String(v.replace ?? '')) : n.name;
      if (name !== n.name) api.update(n.id, { name });
    }
    return `Renamed ${sel.length} layer${sel.length > 1 ? 's' : ''}.`;
  },
});
