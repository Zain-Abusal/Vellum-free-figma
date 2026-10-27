import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { buildCommands, score, type Command } from '../commands';
import { Icons } from './icons';

const RECENT_KEY = 'vellum:recent-commands';

function recents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** Quick actions (⌘/ or ⌘K): search every command, extension, page, frame, component and layer. */
export default function CommandPalette() {
  const close = () => useStore.getState().set({ paletteOpen: false });
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const all = useMemo(buildCommands, []);

  const results = useMemo<Command[]>(() => {
    if (!q.trim()) {
      const rec = recents()
        .map((id) => all.find((c) => c.id === id))
        .filter((c): c is Command => !!c)
        .map((c) => ({ ...c, group: 'Recent' }));
      return [...rec, ...all.filter((c) => !c.searchOnly && !rec.some((r) => r.id === c.id))].slice(0, 60);
    }
    return all
      .map((c) => ({ c, s: Math.max(score(c.label, q), score(`${c.group} ${c.label}`, q) - 50) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map((x) => x.c);
  }, [q, all]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.cmd.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify([c.id, ...recents().filter((x) => x !== c.id)].slice(0, 5)));
    } catch {
      /* ignore */
    }
    close();
    // Let the palette unmount before running (some commands open windows or focus inputs).
    requestAnimationFrame(() => c.run());
  };

  return createPortal(
    <div className="palette-bg" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Quick actions">
        <div className="palette-input">
          <Icons.search />
          <input
            autoFocus
            placeholder="Search actions, layers, pages, extensions…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(results[active]);
              } else if (e.key === 'Escape') close();
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <p className="muted pad">No matching actions.</p>}
          {results.map((c, i) => (
            <div key={c.id + i}>
              {!q.trim() && (i === 0 || results[i - 1].group !== c.group) && <div className="cmd-group">{c.group}</div>}
              <button className={`cmd${i === active ? ' active' : ''}`} onPointerMove={() => setActive(i)} onClick={() => run(c)}>
                <span>{c.label}</span>
                <span className="cmd-meta">
                  {q.trim() && <span className="cmd-tag">{c.group}</span>}
                  {c.keys && <kbd>{c.keys}</kbd>}
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
