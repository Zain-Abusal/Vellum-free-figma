import { defineExtension } from '../types';

/** Find & replace text content across the page (or selection). */
export default defineExtension({
  id: 'find-replace',
  name: 'Find & Replace Text',
  description: 'Replace text in every text layer on the page (or only in the selection).',
  icon: '⇄',
  inputs: [
    { key: 'find', label: 'Find', type: 'text', default: '' },
    { key: 'replace', label: 'Replace with', type: 'text', default: '' },
    { key: 'matchCase', label: 'Match case', type: 'checkbox', default: false },
    { key: 'selectionOnly', label: 'Selection only', type: 'checkbox', default: false },
  ],
  run(api, v) {
    const find = String(v.find ?? '');
    if (!find) return 'Enter text to find.';
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), v.matchCase ? 'g' : 'gi');
    const pool = v.selectionOnly ? api.selection().flatMap((n) => [n, ...api.pageNodes().filter((m) => isInside(m, n.id, api.get))]) : api.pageNodes();
    let count = 0;
    for (const n of pool) {
      if (n.type !== 'text' || !n.text || !re.test(n.text)) continue;
      re.lastIndex = 0;
      api.update(n.id, { text: n.text.replace(re, String(v.replace ?? '')) });
      count++;
    }
    return `Updated ${count} text layer${count === 1 ? '' : 's'}.`;
  },
});

function isInside(n: { parentId: string | null }, ancestor: string, get: (id: string) => { parentId: string | null } | undefined) {
  let p = n.parentId;
  while (p) {
    if (p === ancestor) return true;
    p = get(p)?.parentId ?? null;
  }
  return false;
}
