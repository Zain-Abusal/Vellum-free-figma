import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { addImageFiles, centerOn, getMe, setMe, startPresent, topFrames, zoomBy, zoomToFit, zoomToSelection } from '../actions';
import { renderNode } from '../render';
import { uid } from '../doc';
import { download, exportLayers } from '../exporter';
import { createRoom } from '../collab';
import { deleteFile, putFile } from '../files';
import type { Tool } from '../types';
import { Icons, Logo } from './icons';
import { ExtensionsModal } from './Extensions';
import { Window } from './Window';
import { setThemePref, useThemePref } from '../theme';

const isMac = navigator.platform.includes('Mac');
const MOD = isMac ? '⌘' : 'Ctrl+';
const ALT = isMac ? '⌥' : 'Alt+';

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [open, close]);
  return ref;
}

function VersionHistory({ onClose }: { onClose: () => void }) {
  const versions = useStore((s) => s.versions);
  const [name, setName] = useState('');
  const save = () => {
    const s = useStore.getState();
    s.set({ versions: [{ id: uid(), name: name.trim() || `Version ${versions.length + 1}`, date: Date.now(), doc: s.doc }, ...versions] });
    setName('');
  };
  return (
    <Window id="versions" title="Version history" onClose={onClose}>
      <div className="row">
        <input className="text-input" placeholder="Name this version" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <button className="btn primary" onClick={save}>
          Save version
        </button>
      </div>
      <div className="version-list">
        {versions.length === 0 && <p className="muted">No saved versions yet. Unlimited history, saved in this browser.</p>}
        {versions.map((v) => (
          <div key={v.id} className="version">
            <div>
              <strong>{v.name}</strong>
              <div className="muted">{new Date(v.date).toLocaleString()}</div>
            </div>
            <div className="row">
              <button
                className="btn"
                onClick={() => {
                  const s = useStore.getState();
                  if (s.readOnly) return;
                  s.checkpoint();
                  s.set({ doc: v.doc, selection: [], pageId: v.doc.pages[0].id });
                  onClose();
                }}
              >
                Restore
              </button>
              <button className="icon-btn" title="Delete version" onClick={() => useStore.getState().set({ versions: versions.filter((x) => x.id !== v.id) })}>
                <Icons.close />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Window>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      <span className="muted">{label}</span>
      <div className="row">
        <input className="text-input" readOnly value={value} onFocus={(e) => e.target.select()} />
        <button
          className="btn"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}

function ShareModal({ onClose }: { onClose: () => void }) {
  const collab = useStore((s) => s.collab);
  const [me, setMeState] = useState(getMe);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = location.origin + location.pathname;

  const goLive = async () => {
    setBusy(true);
    setError('');
    try {
      const s = useStore.getState();
      const { id, token } = await createRoom(s.fileName, s.doc);
      const oldId = s.fileId;
      await putFile({ id: 'room:' + id, name: s.fileName, updated: Date.now(), doc: s.doc, versions: s.versions, room: { id, token } });
      // Stop the old editor from re-saving the local copy on unmount.
      s.set({ fileId: null });
      if (oldId && !oldId.startsWith('room:')) await deleteFile(oldId);
      location.hash = `#/room/${id}/${token}`;
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    const s = useStore.getState();
    download(new Blob([JSON.stringify({ format: 'vellum', version: 1, name: s.fileName, doc: s.doc })], { type: 'application/json' }), `${s.fileName || 'Untitled'}.vellum.json`);
  };

  return (
    <Window id="share" modal title="Share this file" onClose={onClose}>
      <div className="row">
        <label className="field">
          <span className="muted">Your name</span>
          <input
            className="text-input"
            value={me.name}
            onChange={(e) => {
              const next = { ...me, name: e.target.value.slice(0, 40) };
              setMeState(next);
              setMe(next);
            }}
          />
        </label>
        <label className="field narrow">
          <span className="muted">Color</span>
          <input
            type="color"
            value={me.color}
            onChange={(e) => {
              const next = { ...me, color: e.target.value };
              setMeState(next);
              setMe(next);
            }}
          />
        </label>
      </div>
      {collab ? (
        <>
          {collab.token && <CopyField label="Invite to edit" value={`${base}#/room/${collab.roomId}/${collab.token}`} />}
          <CopyField label="Invite to view" value={`${base}#/room/${collab.roomId}`} />
          <p className="muted">Anyone with a link can open this file. Everyone with the edit link sees changes and cursors live, from anywhere.</p>
        </>
      ) : (
        <>
          <p>Invite people to edit with you in real time. This uploads the file to your Vellum server and gives you invite links.</p>
          <button className="btn primary wide" disabled={busy} onClick={goLive}>
            {busy ? 'Creating live file…' : 'Start live collaboration'}
          </button>
          {error && <p className="error">{error}</p>}
        </>
      )}
      <div className="menu-sep light" />
      <button className="btn wide" onClick={exportJson}>
        Download a copy (.json)
      </button>
    </Window>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Move / select', 'V'],
  ['Frame', 'F or A'],
  ['Rectangle / ellipse / line / arrow', 'R / O / L / ⇧L'],
  ['Pen', 'P'],
  ['Text', 'T'],
  ['Comment', 'C'],
  ['Hand (pan)', 'H or hold Space'],
  ['Zoom', `${MOD}scroll / pinch`],
  ['Zoom to fit / selection / 100%', '⇧1 / ⇧2 / ⇧0'],
  ['Undo / redo', `${MOD}Z / ⇧${MOD}Z`],
  ['Copy / paste / duplicate', `${MOD}C / ${MOD}V / ${MOD}D`],
  ['Copy as PNG', `⇧${MOD}C`],
  ['Copy / paste properties', `${ALT}${MOD}C / ${ALT}${MOD}V`],
  ['Duplicate while dragging', `Hold ${ALT.replace('+', '')}`],
  ['Measure distances', `Hold ${ALT.replace('+', '')} and hover`],
  ['Group / ungroup', `${MOD}G / ⇧${MOD}G`],
  ['Frame selection', `${MOD}${ALT}G`],
  ['Auto layout', '⇧A'],
  ['Create component / detach', `${MOD}${ALT}K / ${MOD}${ALT}B`],
  ['Align left / right / top / bottom', `${ALT}A / ${ALT}D / ${ALT}W / ${ALT}S`],
  ['Align centers', `${ALT}H / ${ALT}V`],
  ['Flip horizontal / vertical', '⇧H / ⇧V'],
  ['Flatten', `${MOD}E`],
  ['Bring forward / send backward', `${MOD}] / ${MOD}[`],
  ['Hide / lock', `⇧${MOD}H / ⇧${MOD}L`],
  ['Rulers / outlines / comments', `⇧R / ${MOD}Y / ⇧C`],
  ['Show / hide UI', `${MOD}\\`],
  ['Extensions / run last extension', `${MOD}/ / ${MOD}${ALT}P`],
  ['Select parent / children', 'Esc / Enter'],
  ['Edit text or vector points', 'Double-click or Enter'],
  ['Nudge', 'Arrows (⇧ = 10px)'],
];

function Avatars() {
  const collab = useStore((s) => s.collab);
  if (!collab) return null;
  const me = getMe();
  const label = collab.status === 'live' ? 'Live' : collab.status === 'connecting' ? 'Connecting…' : collab.status === 'offline' ? 'Reconnecting…' : 'Error';
  return (
    <div className="avatars" title={collab.error ?? label}>
      <span className={`live-dot ${collab.status}`} />
      {!collab.canEdit && <span className="badge">View only</span>}
      {collab.peers.slice(0, 5).map((p) => (
        <button
          key={p.id}
          className="avatar"
          style={{ background: p.color }}
          title={`${p.name} — click to jump to them`}
          onClick={() => {
            const s = useStore.getState();
            if (p.pageId !== s.pageId) s.set({ pageId: p.pageId, selection: [] });
            if (p.cursor) requestAnimationFrame(() => centerOn(p.cursor!));
          }}
        >
          {p.name[0]?.toUpperCase()}
        </button>
      ))}
      {collab.peers.length > 5 && <span className="avatar more">+{collab.peers.length - 5}</span>}
      <span className="avatar me" style={{ background: me.color }} title={`${me.name} (you)`}>
        {me.name[0]?.toUpperCase()}
      </span>
    </div>
  );
}

export function TopBar() {
  const fileName = useStore((s) => s.fileName);
  const zoom = useStore((s) => s.camera.zoom);
  const readOnly = useStore((s) => s.readOnly);
  const showRulers = useStore((s) => s.showRulers);
  const outlineMode = useStore((s) => s.outlineMode);
  const showComments = useStore((s) => s.showComments);
  const [menu, setMenu] = useState(false);
  const [zoomMenu, setZoomMenu] = useState(false);
  const [modal, setModal] = useState<'versions' | 'shortcuts' | 'share' | null>(null);
  const menuRef = useOutside(menu, () => setMenu(false));
  const zoomRef = useOutside(zoomMenu, () => setZoomMenu(false));
  const set = useStore.getState().set;
  const theme = useThemePref();

  const exportJson = () => {
    const s = useStore.getState();
    download(new Blob([JSON.stringify({ format: 'vellum', version: 1, name: s.fileName, doc: s.doc })], { type: 'application/json' }), `${s.fileName || 'Untitled'}.vellum.json`);
  };
  const exportFrames = (format: 'pdf' | 'png') => {
    const s = useStore.getState();
    const ids = topFrames(s.doc, s.pageId).map((f) => f.id);
    if (!ids.length) return alert('No frames on this page.');
    exportLayers(s.doc, ids, [{ format, scale: format === 'png' ? 2 : 2, suffix: '' }], s.fileName).catch((e) => alert('Export failed: ' + e));
  };
  const item = (label: string, run: () => void, keys?: string, on?: boolean) => (
    <button
      className="menu-item"
      onClick={() => {
        run();
        setMenu(false);
      }}
    >
      <span>
        {on !== undefined && <span className="check-mark">{on ? '✓' : ''}</span>}
        {label}
      </span>
      {keys && <span className="menu-keys">{keys}</span>}
    </button>
  );

  return (
    <header className="topbar">
      <div className="tb-left">
        <div className="dropdown" ref={menuRef}>
          <button className="logo-btn" onClick={() => setMenu(!menu)} title="Main menu">
            <Logo size={22} />
            <Icons.chevron />
          </button>
          {menu && (
            <div className="menu" style={{ top: 38, left: 0 }}>
              {item('Back to files', () => (location.hash = ''))}
              <div className="menu-sep" />
              {item('Save local copy (.json)', exportJson)}
              {item('Export frames to PDF', () => exportFrames('pdf'))}
              {item('Export frames as PNG (ZIP)', () => exportFrames('png'))}
              {item('Version history', () => setModal('versions'))}
              <div className="menu-sep" />
              {item('Rulers', () => set({ showRulers: !showRulers }), '⇧R', showRulers)}
              {item('Outline mode', () => set({ outlineMode: !outlineMode }), `${MOD}Y`, outlineMode)}
              {item('Comments', () => set({ showComments: !showComments }), '⇧C', showComments)}
              {item('Hide UI', () => set({ hideUI: true }), `${MOD}\\`)}
              <div className="menu-sep" />
              {item('Theme: System', () => setThemePref('system'), undefined, theme === 'system')}
              {item('Theme: Light', () => setThemePref('light'), undefined, theme === 'light')}
              {item('Theme: Dark', () => setThemePref('dark'), undefined, theme === 'dark')}
              <div className="menu-sep" />
              {item('Keyboard shortcuts', () => setModal('shortcuts'))}
            </div>
          )}
        </div>
        <div className="file-title">
          <span className="muted">Drafts /</span>
          <input className="file-name" value={fileName} readOnly={readOnly} onChange={(e) => set({ fileName: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </div>
      </div>
      <div className="tb-right">
        <Avatars />
        <button className="icon-btn" title="Version history" onClick={() => setModal('versions')}>
          <Icons.history />
        </button>
        <button className="icon-btn" title="Present" onClick={startPresent}>
          <Icons.play />
        </button>
        <button className="btn primary" onClick={() => setModal('share')}>
          Share
        </button>
        <div className="dropdown" ref={zoomRef}>
          <button className="zoom-btn" onClick={() => setZoomMenu(!zoomMenu)}>
            {Math.round(zoom * 100)}%
          </button>
          {zoomMenu && (
            <div className="menu" style={{ top: 34, right: 0 }} onClick={() => setZoomMenu(false)}>
              <button className="menu-item" onClick={() => zoomBy(2)}>
                <span>Zoom in</span>
                <span className="menu-keys">{MOD}+</span>
              </button>
              <button className="menu-item" onClick={() => zoomBy(0.5)}>
                <span>Zoom out</span>
                <span className="menu-keys">{MOD}-</span>
              </button>
              <button className="menu-item" onClick={() => zoomToFit()}>
                <span>Zoom to fit</span>
                <span className="menu-keys">⇧1</span>
              </button>
              <button className="menu-item" onClick={zoomToSelection}>
                <span>Zoom to selection</span>
                <span className="menu-keys">⇧2</span>
              </button>
              <button className="menu-item" onClick={() => zoomBy(1, 1)}>
                <span>Zoom to 100%</span>
                <span className="menu-keys">⇧0</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {modal === 'versions' && <VersionHistory onClose={() => setModal(null)} />}
      {modal === 'share' && <ShareModal onClose={() => setModal(null)} />}
      {modal === 'shortcuts' && (
        <Window id="shortcuts" title="Keyboard shortcuts" width={460} onClose={() => setModal(null)}>
          <div className="shortcuts">
            {SHORTCUTS.map(([a, b]) => (
              <div key={a} className="shortcut">
                <span>{a}</span>
                <kbd>{b}</kbd>
              </div>
            ))}
          </div>
        </Window>
      )}
    </header>
  );
}

const SHAPES: [Tool, () => JSX.Element, string, string][] = [
  ['rect', Icons.rect, 'Rectangle', 'R'],
  ['line', Icons.line, 'Line', 'L'],
  ['arrow', Icons.arrow, 'Arrow', '⇧L'],
  ['ellipse', Icons.ellipse, 'Ellipse', 'O'],
  ['polygon', Icons.polygon, 'Polygon', ''],
  ['star', Icons.star, 'Star', ''],
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const readOnly = useStore((s) => s.readOnly);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shapeMenu, setShapeMenu] = useState(false);
  const [lastShape, setLastShape] = useState<Tool>('rect');
  const extOpen = useStore((s) => s.extensionsOpen);
  const shapeRef = useOutside(shapeMenu, () => setShapeMenu(false));
  const setTool = useStore.getState().setTool;
  const shapeActive = SHAPES.some(([t]) => t === tool);
  const current = SHAPES.find(([t]) => t === (shapeActive ? tool : lastShape)) ?? SHAPES[0];
  const CurIcon = current[1];

  if (readOnly)
    return (
      <div className="toolbar">
        <button className={`tool${tool === 'select' ? ' active' : ''}`} title="Move (V)" onClick={() => setTool('select')}>
          <Icons.select />
        </button>
        <button className={`tool${tool === 'hand' ? ' active' : ''}`} title="Hand tool (H)" onClick={() => setTool('hand')}>
          <Icons.hand />
        </button>
        <span className="tool-sep" />
        <span className="muted view-only">View only</span>
      </div>
    );

  return (
    <div className="toolbar">
      <button className={`tool${tool === 'select' ? ' active' : ''}`} title="Move (V)" onClick={() => setTool('select')}>
        <Icons.select />
      </button>
      <button className={`tool${tool === 'frame' ? ' active' : ''}`} title="Frame (F)" onClick={() => setTool('frame')}>
        <Icons.frame />
      </button>
      <div className="tool-split" ref={shapeRef}>
        <button className={`tool${shapeActive ? ' active' : ''}`} title={`${current[2]} (${current[3] || '—'})`} onClick={() => setTool(current[0])}>
          <CurIcon />
        </button>
        <button className="tool-caret" title="Shape tools" onClick={() => setShapeMenu(!shapeMenu)}>
          <Icons.caretUp />
        </button>
        {shapeMenu && (
          <div className="menu up">
            {SHAPES.map(([t, Icon, label, key]) => (
              <button
                key={t}
                className="menu-item"
                onClick={() => {
                  setTool(t);
                  setLastShape(t);
                  setShapeMenu(false);
                }}
              >
                <span className="menu-icon-label">
                  <Icon /> {label}
                </span>
                <span className="menu-keys">{key}</span>
              </button>
            ))}
            <div className="menu-sep" />
            <button
              className="menu-item"
              onClick={() => {
                fileRef.current?.click();
                setShapeMenu(false);
              }}
            >
              <span className="menu-icon-label">
                <Icons.image /> Place image…
              </span>
              <span className="menu-keys">⇧{MOD}K</span>
            </button>
          </div>
        )}
      </div>
      <button className={`tool${tool === 'pen' ? ' active' : ''}`} title="Pen (P)" onClick={() => setTool('pen')}>
        <Icons.pen />
      </button>
      <button className={`tool${tool === 'text' ? ' active' : ''}`} title="Text (T)" onClick={() => setTool('text')}>
        <Icons.text />
      </button>
      <button className={`tool${tool === 'hand' ? ' active' : ''}`} title="Hand tool (H)" onClick={() => setTool('hand')}>
        <Icons.hand />
      </button>
      <span className="tool-sep" />
      <button className={`tool${tool === 'comment' ? ' active' : ''}`} title="Comment (C)" onClick={() => setTool('comment')}>
        <Icons.comment />
      </button>
      <button className={`tool${extOpen ? ' active' : ''}`} title={`Extensions (${MOD}/)`} onClick={() => useStore.getState().set({ extensionsOpen: true })}>
        <Icons.puzzle />
      </button>
      {extOpen && <ExtensionsModal onClose={() => useStore.getState().set({ extensionsOpen: false })} />}
      <input
        id="place-image"
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addImageFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function Present() {
  const frameId = useStore((s) => s.presenting);
  const doc = useStore((s) => s.doc);
  const pageId = useStore((s) => s.pageId);
  const frames = topFrames(doc, pageId);
  const n = frameId ? doc.nodes[frameId] : null;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const i = frames.findIndex((f) => f.id === s.presenting);
      if (e.key === 'Escape') s.set({ presenting: null });
      if (e.key === 'ArrowRight' && i < frames.length - 1) s.set({ presenting: frames[i + 1].id });
      if (e.key === 'ArrowLeft' && i > 0) s.set({ presenting: frames[i - 1].id });
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [frames]);

  if (!n) return null;
  const click = (e: React.MouseEvent) => {
    let id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id') ?? null;
    while (id) {
      const node = doc.nodes[id];
      if (node?.link && doc.nodes[node.link]) return useStore.getState().set({ presenting: node.link });
      id = node?.parentId ?? null;
    }
  };
  return (
    <div className="present">
      <div className="present-bar">
        <span>{n.name}</span>
        <span className="muted">
          {frames.findIndex((f) => f.id === n.id) + 1} / {frames.length}
        </span>
        <button className="btn" onClick={() => useStore.getState().set({ presenting: null })}>
          Close
        </button>
      </div>
      <svg key={n.id} className="present-frame" viewBox={`${n.x} ${n.y} ${n.w} ${n.h}`} preserveAspectRatio="xMidYMid meet" onClick={click}>
        {renderNode({ doc, interactive: true, prefix: 'p-', depth: 0, zoom: 1 }, n.id)}
      </svg>
    </div>
  );
}
