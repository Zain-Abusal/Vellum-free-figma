import { useStore } from '../store';
import { setThemePref, useThemePref, type ThemePref } from '../theme';
import { setUiPrefs, useUiPrefs } from '../uiPrefs';
import { Window } from './Window';
import { Icons } from './icons';

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string, (() => JSX.Element)?][]; onChange: (v: T) => void }) {
  return (
    <div className="seg wide-seg" role="radiogroup">
      {options.map(([v, label, Icon]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {Icon && <Icon />}
          {label}
        </button>
      ))}
    </div>
  );
}

/** Preferences (⌘,): appearance and the layout choices UI3 users asked Figma for. */
export default function Preferences() {
  const theme = useThemePref();
  const p = useUiPrefs();
  const close = () => useStore.getState().set({ prefsOpen: false });
  return (
    <Window id="prefs" title="Preferences" width={400} onClose={close}>
      <div className="pref">
        <span>Theme</span>
        <Seg<ThemePref>
          value={theme}
          onChange={setThemePref}
          options={[
            ['system', 'System'],
            ['light', 'Light', Icons.sun],
            ['dark', 'Dark', Icons.moon],
          ]}
        />
      </div>
      <div className="pref">
        <span>Toolbar</span>
        <Seg
          value={p.toolbar}
          onChange={(toolbar) => setUiPrefs({ toolbar })}
          options={[
            ['bottom', 'Floating (bottom)'],
            ['top', 'Docked (top bar)'],
          ]}
        />
        <p className="muted">Docked keeps the toolbar from covering your canvas.</p>
      </div>
      <div className="pref">
        <span>Input fields</span>
        <Seg
          value={p.inputs}
          onChange={(inputs) => setUiPrefs({ inputs })}
          options={[
            ['filled', 'Filled'],
            ['outlined', 'Outlined'],
          ]}
        />
      </div>
      <div className="pref">
        <span>Contrast</span>
        <Seg
          value={p.contrast}
          onChange={(contrast) => setUiPrefs({ contrast })}
          options={[
            ['normal', 'Standard'],
            ['high', 'High contrast'],
          ]}
        />
      </div>
      <div className="pref">
        <span>Big nudge (⇧ + arrows)</span>
        <Seg
          value={String(p.bigNudge) as '8' | '10'}
          onChange={(v) => setUiPrefs({ bigNudge: Number(v) })}
          options={[
            ['8', '8 px'],
            ['10', '10 px'],
          ]}
        />
      </div>
      <label className="check-row">
        <input type="checkbox" checked={p.hints} onChange={(e) => setUiPrefs({ hints: e.target.checked })} /> Show “get started” tips on empty pages
      </label>
    </Window>
  );
}
