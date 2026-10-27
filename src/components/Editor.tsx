import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { getFile, loadPrefs, putFile, saveLocal, savePrefs, type FileRecord } from '../files';
import { copyAsPNG, thumbnail } from '../exporter';
import { clearTextCache } from '../doc';
import { fetchRoom, startSync } from '../collab';
import {
  addImageFiles,
  align,
  autoLayoutSelection,
  copyProperties,
  copySelection,
  createComponent,
  deleteSelection,
  detachInstance,
  duplicateSelection,
  enterSelection,
  escapeSelection,
  flattenSelection,
  flipSelection,
  eyedropper,
  useAsMask,
  gotoFrame,
  selectSibling,
  startRename,
  groupSelection,
  nudge,
  paste,
  pasteProperties,
  reorder,
  selectAll,
  setProps,
  ungroupSelection,
  wrapInFrame,
  zoomBy,
  zoomToFit,
  zoomToSelection,
} from '../actions';
import type { Tool } from '../types';
import { lastRun, runExtension } from '../extensions/api';
import { getUiPrefs } from '../uiPrefs';
import CommandPalette from './CommandPalette';
import Preferences from './Preferences';
import { ExtensionsModal } from './Extensions';
import EmptyHint from './EmptyHint';
import Canvas from './Canvas';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';
import { Present, Toolbar, TopBar } from './Chrome';

const TOOL_KEYS: Record<string, Tool> = { k: 'scale', v: 'select', f: 'frame', a: 'frame', r: 'rect', o: 'ellipse', l: 'line', p: 'pen', t: 'text', h: 'hand', c: 'comment' };

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const s = useStore.getState();
  if (s.presenting) return;
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();
  const run = (f: () => void) => {
    e.preventDefault();
    f();
  };
  if (s.tool === 'pen' && (k === 'enter' || k === 'escape')) return;
  if (s.vectorEditId && (k === 'delete' || k === 'backspace')) return;

  if (mod) {
    if (k === 'z') return run(() => (e.shiftKey ? s.redo() : s.undo()));
    if (k === 'y' && !e.shiftKey && !isMacLike()) return run(s.redo);
    if (e.code === 'KeyY') return run(() => s.set({ outlineMode: !s.outlineMode }));
    if (e.code === 'KeyC' && e.altKey) return run(copyProperties);
    if (e.code === 'KeyV' && e.altKey) return run(pasteProperties);
    if (e.code === 'KeyC' && e.shiftKey) return run(() => copyAsPNG(s.doc, s.selection).catch(() => alert('Your browser blocked clipboard images.')));
    if (k === 'c') return run(copySelection);
    if (k === 'x') return run(() => (copySelection(), deleteSelection()));
    if (k === 'd') return run(duplicateSelection);
    if (k === 'a') return run(selectAll);
    if (k === 'e') return run(flattenSelection);
    if (e.code === 'Slash' && e.shiftKey) return run(() => s.set({ dialog: 'shortcuts' }));
    if (e.code === 'Slash') return run(() => s.set({ paletteOpen: true }));
    if (e.code === 'Comma') return run(() => s.set({ prefsOpen: true }));
    if (e.code === 'KeyR' && !e.shiftKey && !e.altKey) return run(startRename);
    if (e.code === 'KeyP' && e.altKey) return run(() => {
      const l = lastRun();
      if (l) runExtension(l.ext, l.values);
      else s.set({ extensionsOpen: true });
    });
    if (e.code === 'Backslash') return run(() => s.set({ hideUI: !s.hideUI }));
    if (e.code === 'KeyG') return run(() => (e.altKey ? wrapInFrame() : e.shiftKey ? ungroupSelection() : groupSelection()));
    if (e.code === 'KeyK' && e.altKey) return run(createComponent);
    if (e.code === 'KeyM' && e.altKey) return run(useAsMask);
    if (e.code === 'Digit4' && e.shiftKey) return run(() => s.set({ showGrids: !s.showGrids }));
    if (e.code === 'KeyK' && e.shiftKey) return run(() => document.getElementById('place-image')?.click());
    if (e.code === 'KeyK' && !e.altKey && !e.shiftKey) return run(() => s.set({ paletteOpen: true }));
    if (e.code === 'KeyB' && e.altKey) return run(detachInstance);
    if (e.code === 'KeyH' && e.shiftKey) return run(() => setProps(s.selection, { visible: !s.selection.every((id) => s.doc.nodes[id]?.visible) }));
    if (e.code === 'KeyL' && e.shiftKey) return run(() => setProps(s.selection, { locked: !s.selection.every((id) => s.doc.nodes[id]?.locked) }));
    if (e.code === 'BracketRight') return run(() => reorder(e.altKey ? 'front' : 'forward'));
    if (e.code === 'BracketLeft') return run(() => reorder(e.altKey ? 'back' : 'backward'));
    if (k === '=' || k === '+') return run(() => zoomBy(2));
    if (k === '-') return run(() => zoomBy(0.5));
    if (k === '0') return run(() => zoomBy(1, 1));
    return;
  }
  if (e.key === 'Tab' && (t === document.body || t.closest('.canvas-wrap'))) return run(() => selectSibling(e.shiftKey ? -1 : 1));
  if (e.altKey && !e.shiftKey && e.code === 'KeyL') return run(() => s.set({ collapseNonce: s.collapseNonce + 1 }));
  if (e.altKey && !e.shiftKey) {
    const m: Record<string, Parameters<typeof align>[0]> = { KeyA: 'left', KeyD: 'right', KeyW: 'top', KeyS: 'bottom', KeyH: 'hcenter', KeyV: 'vcenter' };
    if (m[e.code]) return run(() => align(m[e.code]));
  }
  if (e.shiftKey && e.code === 'Digit1') return run(() => zoomToFit());
  if (e.shiftKey && e.code === 'Digit2') return run(zoomToSelection);
  if (e.shiftKey && e.code === 'Digit0') return run(() => zoomBy(1, 1));
  if (e.shiftKey && e.code === 'KeyA') return run(autoLayoutSelection);
  if (e.shiftKey && e.code === 'KeyH') return run(() => flipSelection('h'));
  if (e.shiftKey && e.code === 'KeyV') return run(() => flipSelection('v'));
  if (e.shiftKey && e.code === 'KeyR') return run(() => s.set({ showRulers: !s.showRulers }));
  if (e.shiftKey && e.code === 'KeyC') return run(() => s.set({ showComments: !s.showComments }));
  if (e.shiftKey && e.code === 'KeyL') return run(() => s.setTool('arrow'));
  if (e.shiftKey && e.code === 'KeyS') return run(() => s.setTool('section'));
  if (e.code === 'KeyN' && !e.altKey) return run(() => gotoFrame(e.shiftKey ? -1 : 1));
  if (k === 'i' && !e.altKey && !e.shiftKey) return run(eyedropper);
  if (k === 'delete' || k === 'backspace') return run(deleteSelection);
  if (k.startsWith('arrow')) {
    const step = e.shiftKey ? getUiPrefs().bigNudge : 1;
    return run(() => nudge(k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0));
  }
  if (k === 'escape') return run(() => (s.tool !== 'select' ? s.setTool('select') : escapeSelection()));
  if (k === 'enter') return run(enterSelection);
  if (!e.altKey && !e.shiftKey && TOOL_KEYS[k]) return run(() => s.setTool(TOOL_KEYS[k]));
}

const isMacLike = () => navigator.platform.includes('Mac');

function onPaste(e: ClipboardEvent) {
  const t = e.target as HTMLElement;
  if (t?.closest?.('input, textarea')) return;
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
  e.preventDefault();
  if (files.length) addImageFiles(files);
  else paste();
}

const PANEL_KEY = 'vellum:panels';
type Widths = { left: number; right: number };

function loadWidths(): Widths {
  try {
    return { left: 241, right: 241, ...JSON.parse(localStorage.getItem(PANEL_KEY) ?? '{}') };
  } catch {
    return { left: 241, right: 241 };
  }
}

/** Drag handle between a side panel and the canvas. Double-click resets the width. */
function Resizer({ side, widths, setWidths }: { side: 'left' | 'right'; widths: Widths; setWidths: (w: Widths) => void }) {
  const [active, setActive] = useState(false);
  const save = (w: Widths) => {
    try {
      localStorage.setItem(PANEL_KEY, JSON.stringify(w));
    } catch {
      /* ignore */
    }
  };
  return (
    <div
      className={`resizer ${side}${active ? ' active' : ''}`}
      title="Drag to resize · double-click to reset"
      onDoubleClick={() => {
        const w = { ...widths, [side]: 241 };
        setWidths(w);
        save(w);
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        setActive(true);
        let last = widths;
        const move = (ev: PointerEvent) => {
          const v = Math.round(Math.min(480, Math.max(180, side === 'left' ? ev.clientX : window.innerWidth - ev.clientX)));
          last = { ...last, [side]: v };
          setWidths(last);
        };
        const up = () => {
          setActive(false);
          save(last);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}

function record(fileId: string, room?: { id: string; token?: string }): FileRecord {
  const s = useStore.getState();
  return { id: fileId, name: s.fileName, updated: Date.now(), doc: s.doc, versions: s.versions, room };
}

export default function Editor({ fileId, room }: { fileId: string; room?: { id: string; token?: string } }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(true);
  const [roomInfo, setRoomInfo] = useState(room);
  const presenting = useStore((s) => s.presenting);
  const hideUI = useStore((s) => s.hideUI);
  const toast = useStore((s) => s.toast);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const prefsOpen = useStore((s) => s.prefsOpen);
  const extOpen = useStore((s) => s.extensionsOpen);
  const [widths, setWidths] = useState(loadWidths);

  // Load (local file, or a live room with a local cache as fallback).
  useEffect(() => {
    let alive = true;
    let stop: (() => void) | undefined;
    (async () => {
      const cached = await getFile(fileId);
      if (!room) {
        if (!cached) return void (location.hash = '');
        if (!alive) return;
        useStore.getState().load(fileId, cached.name, cached.doc, cached.versions ?? []);
      } else {
        const token = room.token ?? cached?.room?.token;
        const snap = await fetchRoom(room.id).catch(() => undefined);
        if (!alive) return;
        if (snap === null) return setError('This shared file was not found. It may have expired or the link is wrong.');
        if (!snap && !cached) return setError("Couldn't reach the collaboration server. Check your connection and try again.");
        const doc = snap?.doc ?? cached!.doc;
        useStore.getState().load(fileId, snap?.name ?? cached!.name, doc, cached?.versions ?? []);
        setRoomInfo({ id: room.id, token });
        stop = startSync(room.id, token, snap?.seq ?? 0);
      }
      const prefs = loadPrefs<{ pageId: string }>(fileId);
      const s = useStore.getState();
      if (prefs.pageId && s.doc.pages.some((p) => p.id === prefs.pageId)) s.set({ pageId: prefs.pageId });
      setReady(true);
    })();
    return () => {
      alive = false;
      stop?.();
    };
  }, [fileId, room?.id, room?.token]);

  // Autosave to IndexedDB (+ localStorage mirror); flush synchronously when the tab is hidden or closed.
  useEffect(() => {
    if (!ready) return;
    let timer: number | undefined;
    const save = () => {
      const s = useStore.getState();
      if (s.fileId !== fileId) return;
      putFile({ ...record(fileId, roomInfo), thumb: thumbnail(s.doc) })
        .then(() => setSaved(true))
        .catch((err) => console.error('Autosave failed', err));
    };
    const flush = () => {
      if (useStore.getState().fileId === fileId) saveLocal(record(fileId, roomInfo));
    };
    const unsub = useStore.subscribe((s, prev) => {
      if (s.doc === prev.doc && s.fileName === prev.fileName && s.versions === prev.versions) return;
      setSaved(false);
      clearTimeout(timer);
      timer = window.setTimeout(save, 600);
    });
    const onHide = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      unsub();
      clearTimeout(timer);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      save();
    };
  }, [ready, fileId, roomInfo]);

  // Remember the camera per page and the last page.
  useEffect(() => {
    if (!ready) return;
    let timer: number | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.camera === prev.camera && s.pageId === prev.pageId) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const cur = useStore.getState();
        const prefs = loadPrefs<{ cams: Record<string, unknown> }>(fileId);
        savePrefs(fileId, { ...prefs, pageId: cur.pageId, cams: { ...(prefs.cams ?? {}), [cur.pageId]: cur.camera } });
      }, 400);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [ready, fileId]);

  // Re-measure text once web fonts arrive.
  useEffect(() => {
    if (!ready || !document.fonts) return;
    const remeasure = () => {
      clearTextCache();
      if (!useStore.getState().readOnly) useStore.getState().update(() => {}, false);
    };
    document.fonts.ready.then(remeasure);
    document.fonts.addEventListener('loadingdone', remeasure);
    return () => document.fonts.removeEventListener('loadingdone', remeasure);
  }, [ready]);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  if (error)
    return (
      <div className="loading">
        <div className="stack center">
          <p>{error}</p>
          <button className="btn" onClick={() => (location.hash = '')}>
            Back to files
          </button>
        </div>
      </div>
    );
  if (!ready) return <div className="loading">Loading…</div>;
  return (
    <div className={`editor${hideUI ? ' hide-ui' : ''}`} style={{ '--left-w': widths.left + 'px', '--right-w': widths.right + 'px' } as React.CSSProperties}>
      {!hideUI && <TopBar />}
      <div className="main">
        {!hideUI && <LeftPanel />}
        {!hideUI && <Resizer side="left" widths={widths} setWidths={setWidths} />}
        <div className="center">
          <Canvas />
          {!hideUI && <EmptyHint />}
          {!hideUI && <Toolbar />}
          {!hideUI && <div className="save-state">{saved ? 'Saved' : 'Saving…'}</div>}
        </div>
        {!hideUI && <Resizer side="right" widths={widths} setWidths={setWidths} />}
        {!hideUI && <RightPanel />}
      </div>
      {presenting && <Present />}
      {paletteOpen && <CommandPalette />}
      {prefsOpen && <Preferences />}
      {extOpen && <ExtensionsModal key={String(extOpen)} initial={typeof extOpen === 'string' ? extOpen : undefined} onClose={() => useStore.getState().set({ extensionsOpen: false })} />}
      {toast && (
        <div className="toast" key={toast}>
          {toast}
        </div>
      )}
    </div>
  );
}
