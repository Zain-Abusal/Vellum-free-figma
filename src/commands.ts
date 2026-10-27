import { useStore } from './store';
import {
  align,
  applyColorStyle,
  autoLayoutSelection,
  booleanOp,
  copyProperties,
  combineAsVariants,
  copySelection,
  createComponent,
  deleteSelection,
  detachInstance,
  distribute,
  eyedropper,
  useAsMask,
  duplicateSelection,
  flattenSelection,
  flipSelection,
  gotoFrame,
  groupSelection,
  insertInstance,
  paste,
  pasteProperties,
  reorder,
  selectAll,
  setProps,
  startPresent,
  startRename,
  topFrames,
  ungroupSelection,
  wrapInFrame,
  zoomBy,
  zoomToBox,
  zoomToFit,
  zoomToSelection,
} from './actions';
import { copyAsPNG, copyAsSVG, download, exportLayers } from './exporter';
import { extensions } from './extensions/registry';
import { getRemoteExtensions } from './extensions/remote';
import { setThemePref } from './theme';
import type { Tool } from './types';

export interface Command {
  id: string;
  label: string;
  group: string;
  keys?: string;
  run: () => void;
  /** Hidden unless the user types something (e.g. individual layers). */
  searchOnly?: boolean;
}

const mac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
export const MOD = mac ? '⌘' : 'Ctrl+';
export const ALT = mac ? '⌥' : 'Alt+';

const S = () => useStore.getState();
const tool = (t: Tool) => () => S().setTool(t);

/** Everything Quick Actions can do, built fresh each time it opens. */
export function buildCommands(): Command[] {
  const s = S();
  const sel = s.selection;
  const c: Command[] = [];
  const add = (group: string, label: string, run: () => void, keys?: string, id = group + ':' + label) => c.push({ id, label, group, keys, run });

  add('Tools', 'Move', tool('select'), 'V');
  add('Tools', 'Frame', tool('frame'), 'F');
  add('Tools', 'Section', tool('section'), '⇧S');
  add('Tools', 'Rectangle', tool('rect'), 'R');
  add('Tools', 'Ellipse', tool('ellipse'), 'O');
  add('Tools', 'Line', tool('line'), 'L');
  add('Tools', 'Arrow', tool('arrow'), '⇧L');
  add('Tools', 'Polygon', tool('polygon'));
  add('Tools', 'Star', tool('star'));
  add('Tools', 'Pen', tool('pen'), 'P');
  add('Tools', 'Text', tool('text'), 'T');
  add('Tools', 'Hand', tool('hand'), 'H');
  add('Tools', 'Comment', tool('comment'), 'C');
  add('Tools', 'Scale', tool('scale'), 'K');
  add('Tools', 'Eyedropper (pick color)', eyedropper, 'I');
  add('Tools', 'Frame presets (phone, desktop, social…)', tool('frame'));
  add('Tools', 'Place image…', () => document.getElementById('place-image')?.click(), `⇧${MOD}K`);

  add('Edit', 'Undo', s.undo, `${MOD}Z`);
  add('Edit', 'Redo', s.redo, `⇧${MOD}Z`);
  add('Edit', 'Paste', paste, `${MOD}V`);
  add('Edit', 'Select all', selectAll, `${MOD}A`);
  if (sel.length) {
    add('Edit', 'Copy', copySelection, `${MOD}C`);
    add('Edit', 'Duplicate', duplicateSelection, `${MOD}D`);
    add('Edit', 'Delete', deleteSelection, '⌫');
    add('Edit', 'Rename layer', startRename, `${MOD}R`);
    add('Edit', 'Copy as PNG', () => copyAsPNG(s.doc, sel), `⇧${MOD}C`);
    add('Edit', 'Copy as SVG', () => copyAsSVG(s.doc, sel));
    add('Edit', 'Copy properties', copyProperties, `${ALT}${MOD}C`);
    add('Edit', 'Paste properties', pasteProperties, `${ALT}${MOD}V`);
    add('Arrange', 'Group selection', groupSelection, `${MOD}G`);
    add('Arrange', 'Ungroup', ungroupSelection, `⇧${MOD}G`);
    add('Arrange', 'Frame selection', wrapInFrame, `${MOD}${ALT}G`);
    add('Arrange', 'Add auto layout', autoLayoutSelection, '⇧A');
    add('Arrange', 'Bring to front', () => reorder('front'), `${MOD}${ALT}]`);
    add('Arrange', 'Send to back', () => reorder('back'), `${MOD}${ALT}[`);
    add('Arrange', 'Flip horizontal', () => flipSelection('h'), '⇧H');
    add('Arrange', 'Flip vertical', () => flipSelection('v'), '⇧V');
    for (const [k, l, key] of [
      ['left', 'Align left', 'A'],
      ['hcenter', 'Align horizontal centers', 'H'],
      ['right', 'Align right', 'D'],
      ['top', 'Align top', 'W'],
      ['vcenter', 'Align vertical centers', 'V'],
      ['bottom', 'Align bottom', 'S'],
    ] as const)
      add('Arrange', l, () => align(k), ALT + key);
    add('Arrange', 'Distribute horizontal spacing', () => distribute('h'));
    add('Arrange', 'Distribute vertical spacing', () => distribute('v'));
    add('Shape', 'Flatten', flattenSelection, `${MOD}E`);
    add('Shape', 'Use as mask', useAsMask, `${ALT}${MOD}M`);
    add('Shape', 'Union selection', () => booleanOp('union'));
    add('Shape', 'Subtract selection', () => booleanOp('subtract'));
    add('Shape', 'Intersect selection', () => booleanOp('intersect'));
    add('Shape', 'Exclude selection', () => booleanOp('exclude'));
    add('Components', 'Create component', createComponent, `${MOD}${ALT}K`);
    add('Components', 'Combine as variants', combineAsVariants);
    add('Components', 'Detach instance', detachInstance, `${MOD}${ALT}B`);
    add('Edit', 'Show / hide selection', () => setProps(sel, { visible: !sel.every((id) => s.doc.nodes[id]?.visible) }), `⇧${MOD}H`);
    add('Edit', 'Lock / unlock selection', () => setProps(sel, { locked: !sel.every((id) => s.doc.nodes[id]?.locked) }), `⇧${MOD}L`);
  }

  add('View', 'Zoom in', () => zoomBy(2), `${MOD}+`);
  add('View', 'Zoom out', () => zoomBy(0.5), `${MOD}-`);
  add('View', 'Zoom to fit', () => zoomToFit(), '⇧1');
  add('View', 'Zoom to selection', zoomToSelection, '⇧2');
  add('View', 'Zoom to 100%', () => zoomBy(1, 1), '⇧0');
  add('View', 'Next frame', () => gotoFrame(1), 'N');
  add('View', 'Previous frame', () => gotoFrame(-1), '⇧N');
  add('View', 'Toggle layout grids', () => s.set({ showGrids: !s.showGrids }), `⌃⇧4`);
  add('View', 'Toggle rulers', () => s.set({ showRulers: !s.showRulers }), '⇧R');
  add('View', 'Toggle outline mode', () => s.set({ outlineMode: !s.outlineMode }), `${MOD}Y`);
  add('View', 'Toggle comments', () => s.set({ showComments: !s.showComments }), '⇧C');
  add('View', 'Hide / show UI', () => s.set({ hideUI: !s.hideUI }), `${MOD}\\`);
  add('View', 'Collapse all layers', () => s.set({ collapseNonce: s.collapseNonce + 1 }), `${ALT}L`);

  add('File', 'Present', startPresent);
  add('File', 'Share / invite collaborators', () => s.set({ dialog: 'share' }));
  add('File', 'Variables (colors & numbers with modes)', () => s.set({ variablesOpen: true }));
  add('File', 'Version history', () => s.set({ dialog: 'versions' }));
  add('File', 'Export frames to PDF', () => exportLayers(s.doc, topFrames(s.doc, s.pageId).map((f) => f.id), [{ format: 'pdf', scale: 2, suffix: '' }], s.fileName));
  add('File', 'Export frames as PNG (ZIP)', () => exportLayers(s.doc, topFrames(s.doc, s.pageId).map((f) => f.id), [{ format: 'png', scale: 2, suffix: '' }], s.fileName));
  add('File', 'Download a copy (.json)', () =>
    download(new Blob([JSON.stringify({ format: 'vellum', version: 1, name: s.fileName, doc: s.doc })], { type: 'application/json' }), `${s.fileName || 'Untitled'}.vellum.json`),
  );
  add('File', 'Back to files', () => (location.hash = ''));

  add('Preferences', 'Theme: System', () => setThemePref('system'));
  add('Preferences', 'Theme: Light', () => setThemePref('light'));
  add('Preferences', 'Theme: Dark', () => setThemePref('dark'));
  add('Preferences', 'Preferences…', () => s.set({ prefsOpen: true }), `${MOD},`);
  add('Help', 'Keyboard shortcuts', () => s.set({ dialog: 'shortcuts' }), `${MOD}⇧?`);

  add('Extensions', 'Browse extensions', () => s.set({ extensionsOpen: true }));
  for (const e of [...extensions, ...getRemoteExtensions().flatMap((r) => (r.ext ? [r.ext] : []))]) add('Extensions', e.name, () => s.set({ extensionsOpen: e.id }), undefined, 'ext:' + e.id);

  for (const p of s.doc.pages) if (p.id !== s.pageId) add('Pages', `Go to ${p.name}`, () => s.set({ pageId: p.id, selection: [] }), undefined, 'page:' + p.id);
  for (const f of topFrames(s.doc, s.pageId))
    add(
      'Frames',
      f.name,
      () => {
        s.select([f.id]);
        zoomToBox(f, 2);
      },
      undefined,
      'frame:' + f.id,
    );
  for (const n of Object.values(s.doc.nodes)) {
    if (n.type === 'component') add('Components', `Insert ${n.name}`, () => insertInstance(n.id), undefined, 'comp:' + n.id);
  }
  for (const st of s.doc.styles?.colors ?? []) if (sel.length) add('Styles', `Apply color: ${st.name}`, () => applyColorStyle(sel, st.id), undefined, 'cs:' + st.id);

  // Individual layers on this page: only shown when searching.
  const frameIds = new Set(topFrames(s.doc, s.pageId).map((f) => f.id));
  for (const n of Object.values(s.doc.nodes)) {
    if (n.pageId !== s.pageId || frameIds.has(n.id)) continue;
    c.push({
      id: 'layer:' + n.id,
      label: n.name,
      group: 'Layers',
      searchOnly: true,
      run: () => {
        if (s.pageId !== n.pageId) s.set({ pageId: n.pageId });
        s.select([n.id]);
        zoomToBox(n, 4);
      },
    });
  }
  return c;
}

/** Simple fuzzy score: substring beats word-start beats subsequence. -1 = no match. */
export function score(label: string, q: string): number {
  const l = label.toLowerCase();
  q = q.toLowerCase().trim();
  if (!q) return 0;
  const i = l.indexOf(q);
  if (i === 0) return 1000 - l.length;
  if (i > 0) return (l[i - 1] === ' ' ? 800 : 600) - i;
  let j = 0;
  for (const ch of l) if (ch === q[j]) j++;
  return j === q.length ? 200 - l.length : -1;
}
