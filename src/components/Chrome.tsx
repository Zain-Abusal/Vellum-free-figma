import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { addImageFiles, centerOn, getMe, setMe, startPresent, topFrames, zoomBy, zoomToFit, zoomToSelection } from '../actions';
import { renderNode } from '../render';
import { uid } from '../doc';
import { download, exportLayers } from '../exporter';
import { createRoom } from '../collab';
import { deleteFile, putFile } from '../files';
import type { Tool, Transition } from '../types';
import { Icons, Logo } from './icons';
import { Window } from './Window';
import { setThemePref, useThemePref } from '../theme';
import { useUiPrefs } from '../uiPrefs';

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
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/** Connect an AI agent over MCP: it sees collaborators live and edits the file with a 🤖 cursor. */
function McpConnect({ roomId, token }: { roomId: string; token?: string }) {
  const [agent, setAgent] = useState('Claude');
  const url = `${location.origin}/api/mcp?room=${roomId}${token ? `&token=${token}` : ''}&name=${encodeURIComponent(agent || 'AI agent')}`;
  const cli = `claude mcp add --transport http vellum "${url}"`;
  const json = JSON.stringify({ mcpServers: { vellum: { type: 'http', url } } }, null, 2);
  return (
    <div className="mcp-box">
      <strong>Connect an AI agent (MCP)</strong>
      <p className="muted">
        Give Claude or any MCP client live access to this file. It can see who is online and what they selected, read and render the design, and edit it while you watch its 🤖 cursor.
        {!token && ' This is a view-only connection (no edits).'}
      </p>
      <label className="field">
        <span className="muted">Agent name (shown on its cursor)</span>
        <input className="text-input" value={agent} onChange={(e) => setAgent(e.target.value.slice(0, 30))} />
      </label>
      <CopyField label="MCP server URL" value={url} />
      <CopyField label="Claude Code" value={cli} />
      <details>
        <summary className="muted">Other clients (JSON config)</summary>
        <pre className="code">{json}</pre>
      </details>
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
          <McpConnect roomId={collab.roomId} token={collab.token} />
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
  ['Section', '⇧S'],
  ['Pen (drag to curve; double-click a point to smooth it)', 'P'],
  ['Scale tool / eyedropper', 'K / I'],
  ['Use as mask', `${ALT}${MOD}M`],
  ['Layout grids', '⌃⇧4'],
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
  ['Quick actions (search everything)', `${MOD}/ or ${MOD}K`],
  ['Preferences', `${MOD},`],
  ['Next / previous layer', 'Tab / ⇧Tab'],
  ['Next / previous frame', 'N / ⇧N'],
  ['Rename layer', `${MOD}R`],
  ['Collapse all layers', `${ALT}L`],
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
          {Array.from(p.name)[0]?.toUpperCase()}
        </button>
      ))}
      {collab.peers.length > 5 && <span className="avatar more">+{collab.peers.length - 5}</span>}
      <span className="avatar me" style={{ background: me.color }} title={`${me.name} (you)`}>
        {Array.from(me.name)[0]?.toUpperCase()}
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
  const modal = useStore((s) => s.dialog);
  const setModal = (dialog: 'versions' | 'shortcuts' | 'share' | null) => useStore.getState().set({ dialog });
  const pageName = useStore((s) => s.doc.pages.find((p) => p.id === s.pageId)?.name);
  const prefs = useUiPrefs();
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
              {item('Quick actions…', () => set({ paletteOpen: true }), `${MOD}/`)}
              {item('Preferences…', () => set({ prefsOpen: true }), `${MOD},`)}
              {item('Keyboard shortcuts', () => setModal('shortcuts'), `${MOD}⇧?`)}
            </div>
          )}
        </div>
        <div className="file-title">
          <span className="muted crumb">Drafts</span>
          <span className="muted crumb-sep">/</span>
          <input className="file-name" aria-label="File name" style={{ width: `calc(${Math.min(Math.max(fileName.length, 4), 32)}ch + 16px)` }} value={fileName} readOnly={readOnly} onChange={(e) => set({ fileName: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          {pageName && <span className="page-pill" title="Current page">{pageName}</span>}
        </div>
      </div>
      {prefs.toolbar === 'top' && (
        <div className="tb-center">
          <Toolbar docked />
        </div>
      )}
      <div className="tb-right">
        <button className="icon-btn" title={`Quick actions (${MOD}/)`} onClick={() => set({ paletteOpen: true })}>
          <Icons.search />
        </button>
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

const FRAMES: [Tool, () => JSX.Element, string, string][] = [
  ['frame', Icons.frame, 'Frame', 'F'],
  ['section', Icons.section, 'Section', '⇧S'],
];

const SHAPES: [Tool, () => JSX.Element, string, string][] = [
  ['rect', Icons.rect, 'Rectangle', 'R'],
  ['line', Icons.line, 'Line', 'L'],
  ['arrow', Icons.arrow, 'Arrow', '⇧L'],
  ['ellipse', Icons.ellipse, 'Ellipse', 'O'],
  ['polygon', Icons.polygon, 'Polygon', ''],
  ['star', Icons.star, 'Star', ''],
];

/** Split button: last-used tool + caret menu (Figma's tool groups). */
function ToolGroup({ items, docked, extra }: { items: [Tool, () => JSX.Element, string, string][]; docked?: boolean; extra?: React.ReactNode }) {
  const tool = useStore((s) => s.tool);
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<Tool>(items[0][0]);
  const ref = useOutside(open, () => setOpen(false));
  const setTool = useStore.getState().setTool;
  const active = items.some(([t]) => t === tool);
  const current = items.find(([t]) => t === (active ? tool : last)) ?? items[0];
  const CurIcon = current[1];
  return (
    <div className="tool-split" ref={ref}>
      <button className={`tool${active ? ' active' : ''}`} title={`${current[2]}${current[3] ? ` (${current[3]})` : ''}`} aria-pressed={active} onClick={() => setTool(current[0])}>
        <CurIcon />
      </button>
      <button className="tool-caret" title={`More ${items[0][2].toLowerCase()} tools`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {docked ? <Icons.chevronDown /> : <Icons.caretUp />}
      </button>
      {open && (
        <div className={`menu ${docked ? 'down' : 'up'}`} role="menu" onClick={() => setOpen(false)}>
          {items.map(([t, Icon, label, key]) => (
            <button
              key={t}
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setTool(t);
                setLast(t);
              }}
            >
              <span className="menu-icon-label">
                <span className="check-mark">{tool === t ? '✓' : ''}</span>
                <Icon /> {label}
              </span>
              <span className="menu-keys">{key}</span>
            </button>
          ))}
          {extra}
        </div>
      )}
    </div>
  );
}

export function Toolbar({ docked }: { docked?: boolean }) {
  const tool = useStore((s) => s.tool);
  const readOnly = useStore((s) => s.readOnly);
  const extOpen = useStore((s) => s.extensionsOpen);
  const prefs = useUiPrefs();
  const fileRef = useRef<HTMLInputElement>(null);
  const setTool = useStore.getState().setTool;
  if (!docked && prefs.toolbar === 'top') return null;
  const btn = (t: Tool, Icon: () => JSX.Element, title: string) => (
    <button className={`tool${tool === t ? ' active' : ''}`} title={title} aria-pressed={tool === t} onClick={() => setTool(t)}>
      <Icon />
    </button>
  );
  const cls = `toolbar${docked ? ' docked' : ''}`;

  if (readOnly)
    return (
      <div className={cls} role="toolbar" aria-label="Tools">
        {btn('select', Icons.select, 'Move (V)')}
        {btn('hand', Icons.hand, 'Hand tool (H)')}
        <span className="tool-sep" />
        <span className="muted view-only">View only</span>
      </div>
    );

  return (
    <div className={cls} role="toolbar" aria-label="Tools">
      {btn('select', Icons.select, 'Move (V)')}
      <ToolGroup items={FRAMES} docked={docked} />
      <ToolGroup
        items={SHAPES}
        docked={docked}
        extra={
          <>
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => fileRef.current?.click()}>
              <span className="menu-icon-label">
                <span className="check-mark" />
                <Icons.image /> Place image…
              </span>
              <span className="menu-keys">⇧{MOD}K</span>
            </button>
          </>
        }
      />
      {btn('pen', Icons.pen, 'Pen (P), drag to curve')}
      {btn('text', Icons.text, 'Text (T)')}
      {btn('hand', Icons.hand, 'Hand tool (H)')}
      {btn('scale', Icons.scale, 'Scale (K)')}
      <span className="tool-sep" />
      {btn('comment', Icons.comment, 'Comment (C)')}
      <button id="btn-extensions" className={`tool${extOpen ? ' active' : ''}`} title="Extensions" onClick={() => useStore.getState().set({ extensionsOpen: true })}>
        <Icons.puzzle />
      </button>
      <button className="tool actions" title={`Actions (${MOD}/)`} onClick={() => useStore.getState().set({ paletteOpen: true })}>
        <Icons.command />
        {!docked && <span>Actions</span>}
      </button>
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
  const [history, setHistory] = useState<string[]>([]);
  const [anim, setAnim] = useState<{ t: Transition; back: boolean }>({ t: 'instant', back: false });
  const [hotspots, setHotspots] = useState(false);

  const go = (id: string, t: Transition = 'dissolve', back = false) => {
    const s = useStore.getState();
    if (!back && s.presenting) setHistory((h) => [...h, s.presenting!]);
    setAnim({ t, back });
    s.set({ presenting: id });
  };
  const goBack = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    go(prev, anim.t, true);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const i = frames.findIndex((f) => f.id === s.presenting);
      if (e.key === 'Escape') s.set({ presenting: null });
      if (e.key === 'ArrowRight' && i < frames.length - 1) go(frames[i + 1].id, 'slide-left');
      if (e.key === 'ArrowLeft' && i > 0) go(frames[i - 1].id, 'slide-right');
      if (e.key === 'Backspace') goBack();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  if (!n) return null;
  const click = (e: React.MouseEvent) => {
    let id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id') ?? null;
    while (id) {
      const node = doc.nodes[id];
      if (node?.link === '__back') return goBack();
      if (node?.link && doc.nodes[node.link]) return go(node.link, node.linkTransition ?? 'dissolve');
      id = node?.parentId ?? null;
    }
    // Missed: briefly highlight what's clickable.
    setHotspots(true);
    setTimeout(() => setHotspots(false), 700);
  };
  const cls = anim.back && anim.t.startsWith('slide') ? { 'slide-left': 'slide-right', 'slide-right': 'slide-left', 'slide-up': 'slide-down', 'slide-down': 'slide-up' }[anim.t as 'slide-left'] : anim.t;
  return (
    <div className="present">
      <div className="present-bar">
        <span className="row tight">
          {history.length > 0 && (
            <button className="btn small" onClick={goBack}>
              ← Back
            </button>
          )}
          <span>{n.name}</span>
        </span>
        <span className="muted">
          {frames.findIndex((f) => f.id === n.id) + 1} / {frames.length}
        </span>
        <button className="btn" onClick={() => useStore.getState().set({ presenting: null })}>
          Close
        </button>
      </div>
      <div className="present-stage">
        <svg key={n.id} className={`present-frame t-${cls}${hotspots ? ' show-hotspots' : ''}`} viewBox={`${n.x} ${n.y} ${n.w} ${n.h}`} preserveAspectRatio="xMidYMid meet" onClick={click}>
          {renderNode({ doc, interactive: true, prefix: 'p-', depth: 0, zoom: 1 }, n.id)}
        </svg>
      </div>
    </div>
  );
}
