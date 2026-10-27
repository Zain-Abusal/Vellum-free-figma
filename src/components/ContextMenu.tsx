import { useEffect } from 'react';
import { useStore } from '../store';
import {
  autoLayoutSelection,
  booleanOp,
  copyProperties,
  copySelection,
  createComponent,
  deleteSelection,
  detachInstance,
  duplicateSelection,
  flattenSelection,
  flipSelection,
  useAsMask,
  groupSelection,
  paste,
  pasteProperties,
  reorder,
  selectAll,
  setProps,
  ungroupSelection,
  wrapInFrame,
  zoomToFit,
  zoomToSelection,
} from '../actions';
import { copyAsPNG, copyAsSVG, cssFor } from '../exporter';

const mac = navigator.platform.includes('Mac');
const mod = mac ? '⌘' : 'Ctrl+';
const alt = mac ? '⌥' : 'Alt+';

type Item = { label: string; keys?: string; run: () => void; disabled?: boolean } | '-';

export default function ContextMenu({ at, onClose }: { at: { x: number; y: number }; onClose: () => void }) {
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  const clipboard = useStore((s) => s.clipboard);
  const readOnly = useStore((s) => s.readOnly);
  const nodes = selection.map((id) => doc.nodes[id]).filter(Boolean);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  const copyCss = () => navigator.clipboard.writeText(nodes.map((n) => cssFor(doc, n)).join('\n\n'));
  const items: Item[] = nodes.length
    ? [
        { label: 'Copy', keys: `${mod}C`, run: copySelection },
        { label: 'Paste here', keys: `${mod}V`, run: paste, disabled: !clipboard || readOnly },
        { label: 'Duplicate', keys: `${mod}D`, run: duplicateSelection, disabled: readOnly },
        { label: 'Delete', keys: '⌫', run: deleteSelection, disabled: readOnly },
        '-',
        { label: 'Copy as PNG', keys: `⇧${mod}C`, run: () => copyAsPNG(doc, selection) },
        { label: 'Copy as SVG', run: () => copyAsSVG(doc, selection) },
        { label: 'Copy as CSS', run: copyCss },
        { label: 'Copy properties', keys: `${alt}${mod}C`, run: copyProperties },
        { label: 'Paste properties', keys: `${alt}${mod}V`, run: pasteProperties, disabled: readOnly },
        '-',
        { label: 'Bring to front', keys: `${mod}${alt}]`, run: () => reorder('front'), disabled: readOnly },
        { label: 'Send to back', keys: `${mod}${alt}[`, run: () => reorder('back'), disabled: readOnly },
        '-',
        { label: 'Group selection', keys: `${mod}G`, run: groupSelection, disabled: readOnly },
        { label: 'Frame selection', keys: `${mod}${alt}G`, run: wrapInFrame, disabled: readOnly },
        { label: 'Ungroup', keys: `⇧${mod}G`, run: ungroupSelection, disabled: readOnly },
        { label: 'Add auto layout', keys: '⇧A', run: autoLayoutSelection, disabled: readOnly },
        '-',
        { label: 'Flip horizontal', keys: '⇧H', run: () => flipSelection('h'), disabled: readOnly },
        { label: 'Flip vertical', keys: '⇧V', run: () => flipSelection('v'), disabled: readOnly },
        { label: 'Flatten', keys: `${mod}E`, run: flattenSelection, disabled: readOnly },
        { label: nodes.length === 1 && nodes[0].isMask ? 'Release mask' : 'Use as mask', keys: `${alt}${mod}M`, run: useAsMask, disabled: readOnly || (nodes.length < 2 && !nodes[0]?.isMask) },
        ...(nodes.length > 1
          ? ([
              { label: 'Union selection', run: () => booleanOp('union'), disabled: readOnly },
              { label: 'Subtract selection', run: () => booleanOp('subtract'), disabled: readOnly },
              { label: 'Intersect selection', run: () => booleanOp('intersect'), disabled: readOnly },
              { label: 'Exclude selection', run: () => booleanOp('exclude'), disabled: readOnly },
            ] as Item[])
          : []),
        '-',
        nodes.some((n) => n.type === 'instance')
          ? { label: 'Detach instance', keys: `${mod}${alt}B`, run: detachInstance, disabled: readOnly }
          : { label: 'Create component', keys: `${mod}${alt}K`, run: createComponent, disabled: readOnly },
        { label: nodes.every((n) => n.visible) ? 'Hide' : 'Show', keys: `⇧${mod}H`, run: () => setProps(selection, { visible: !nodes.every((n) => n.visible) }), disabled: readOnly },
        { label: nodes.every((n) => n.locked) ? 'Unlock' : 'Lock', keys: `⇧${mod}L`, run: () => setProps(selection, { locked: !nodes.every((n) => n.locked) }), disabled: readOnly },
        { label: 'Zoom to selection', keys: '⇧2', run: zoomToSelection },
      ]
    : [
        { label: 'Paste here', keys: `${mod}V`, run: paste, disabled: !clipboard || readOnly },
        { label: 'Select all', keys: `${mod}A`, run: selectAll },
        { label: 'Zoom to fit', keys: '⇧1', run: () => zoomToFit() },
      ];

  // Keep the menu on screen.
  const top = Math.min(at.y, Math.max(8, window.innerHeight - 80 - items.length * 26));
  return (
    <div className="menu" style={{ left: at.x, top }} onPointerDown={(e) => e.stopPropagation()}>
      {items.map((it, i) =>
        it === '-' ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            className="menu-item"
            disabled={it.disabled}
            onClick={() => {
              it.run();
              onClose();
            }}
          >
            <span>{it.label}</span>
            {it.keys && <span className="menu-keys">{it.keys}</span>}
          </button>
        ),
      )}
    </div>
  );
}
