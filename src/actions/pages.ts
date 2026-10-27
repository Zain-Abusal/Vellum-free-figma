/** Pages and layer-tree moves. */
import { detach, getPage, isAncestor, moveTo, removeNode, siblings, uid } from '../doc';
import { S } from './shared';

export function moveLayer(dragId: string, targetId: string, zone: 'above' | 'below' | 'inside') {
  const s = S();
  s.update((d) => {
    if (dragId === targetId || isAncestor(d, dragId, targetId) || !d.nodes[dragId] || !d.nodes[targetId]) return;
    const t = d.nodes[targetId];
    if (zone === 'inside') return moveTo(d, dragId, targetId, t.pageId);
    detach(d, dragId);
    const ti = siblings(d, t).indexOf(targetId);
    moveTo(d, dragId, t.parentId, t.pageId, zone === 'above' ? ti + 1 : ti);
  });
}

export function addPage() {
  const s = S();
  const id = uid();
  s.update((d) => {
    d.pages.push({ id, name: `Page ${d.pages.length + 1}`, children: [], bg: '#f5f5f5' });
  });
  s.set({ pageId: id, selection: [] });
}

export function deletePage(id: string) {
  const s = S();
  if (s.doc.pages.length < 2) return;
  s.update((d) => {
    const p = getPage(d, id);
    for (const c of [...p.children]) removeNode(d, c);
    d.pages = d.pages.filter((x) => x.id !== id);
  });
  if (s.pageId === id) S().set({ pageId: S().doc.pages[0].id, selection: [] });
}
