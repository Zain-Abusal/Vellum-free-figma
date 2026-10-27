import { useStore } from '../store';
import { setUiPrefs, useUiPrefs } from '../uiPrefs';
import { MOD } from '../commands';
import type { Tool } from '../types';
import { Icons } from './icons';

const STARTERS: [Tool, () => JSX.Element, string, string][] = [
  ['frame', Icons.frame, 'Frame', 'F'],
  ['rect', Icons.rect, 'Shape', 'R'],
  ['text', Icons.text, 'Text', 'T'],
  ['pen', Icons.pen, 'Pen', 'P'],
];

/** Friendly start card on empty pages: helps people new to design tools (a common review complaint). */
export default function EmptyHint() {
  const empty = useStore((s) => (s.doc.pages.find((p) => p.id === s.pageId)?.children.length ?? 0) === 0);
  const readOnly = useStore((s) => s.readOnly);
  const tool = useStore((s) => s.tool);
  const { hints } = useUiPrefs();
  if (!empty || readOnly || !hints || tool !== 'select') return null;
  const set = useStore.getState().set;
  return (
    <div className="empty-hint" role="note">
      <strong>Start designing</strong>
      <p className="muted">Pick a tool, or drop an image anywhere on the canvas.</p>
      <div className="starters">
        {STARTERS.map(([t, Icon, label, key]) => (
          <button key={t} className="starter" onClick={() => useStore.getState().setTool(t)}>
            <Icon />
            <span>{label}</span>
            <kbd>{key}</kbd>
          </button>
        ))}
      </div>
      <div className="hint-links">
        <button className="link-btn" onClick={() => set({ paletteOpen: true })}>
          Search all actions <kbd>{MOD}/</kbd>
        </button>
        <button className="link-btn" onClick={() => set({ dialog: 'shortcuts' })}>
          Shortcuts
        </button>
        <button className="link-btn muted" onClick={() => setUiPrefs({ hints: false })}>
          Don’t show again
        </button>
      </div>
    </div>
  );
}
