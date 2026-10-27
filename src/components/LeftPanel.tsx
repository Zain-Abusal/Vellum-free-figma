import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { addPage, deletePage, insertInstance, moveLayer, setProps } from '../actions';
import { isAncestor, isContainer } from '../doc';
import { renderNode } from '../render';
import { Icons, TypeIcon } from './icons';

let dragId: string | null = null;

function InlineName({ value, onDone, className }: { value: string; onDone: (v: string) => void; className?: string }) {
  const [v, setV] = useState(value);
  return (
    <input
      className={'inline-name ' + (className ?? '')}
      autoFocus
      value={v}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v.trim() || value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') onDone(value);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function LayerRow({ id, depth, flat }: { id: string; depth: number; flat?: boolean }) {
  const n = useStore((s) => s.doc.nodes[id]);
  const selected = useStore((s) => s.selection.includes(id));
  const hovered = useStore((s) => s.hoverId === id);
  const containsSel = useStore((s) => s.selection.some((x) => isAncestor(s.doc, id, x)));
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [zone, setZone] = useState<'above' | 'below' | 'inside' | null>(null);

  useEffect(() => {
    if (containsSel) setOpen(true);
  }, [containsSel]);

  if (!n) return null;
  const hasKids = n.children.length > 0;
  const comp = n.type === 'component' || n.type === 'instance';

  const click = (e: React.MouseEvent) => {
    const s = useStore.getState();
    if (e.shiftKey || e.metaKey || e.ctrlKey) s.select(selected ? s.selection.filter((x) => x !== id) : [...s.selection, id]);
    else s.select([id]);
  };

  return (
    <>
      <div
        className={`layer-row${selected ? ' selected' : ''}${hovered ? ' hovered' : ''}${containsSel && !selected ? ' parent-selected' : ''}${comp ? ' comp' : ''}${!n.visible ? ' hidden' : ''}${zone ? ' drop-' + zone : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={click}
        onDoubleClick={() => setRenaming(true)}
        onPointerEnter={() => useStore.getState().set({ hoverId: id })}
        onPointerLeave={() => useStore.getState().hoverId === id && useStore.getState().set({ hoverId: null })}
        draggable={!renaming}
        onDragStart={(e) => {
          dragId = id;
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (!dragId || dragId === id) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const f = (e.clientY - r.top) / r.height;
          setZone(isContainer(n) && f > 0.25 && f < 0.75 ? 'inside' : f < 0.5 ? 'above' : 'below');
        }}
        onDragLeave={() => setZone(null)}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId && zone) moveLayer(dragId, id, zone);
          setZone(null);
          dragId = null;
        }}
      >
        <span
          className={`caret${open ? ' open' : ''}${hasKids ? '' : ' empty'}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          {hasKids && <Icons.chevron />}
        </span>
        <span className="layer-icon">
          <TypeIcon type={n.type} />
        </span>
        {renaming ? (
          <InlineName
            value={n.name}
            onDone={(v) => {
              setRenaming(false);
              if (v !== n.name) setProps([id], { name: v });
            }}
          />
        ) : (
          <span className="layer-name">{n.name}</span>
        )}
        <span className="layer-actions">
          <button
            className={`icon-btn${n.locked ? ' on' : ''}`}
            title={n.locked ? 'Unlock' : 'Lock'}
            onClick={(e) => {
              e.stopPropagation();
              setProps([id], { locked: !n.locked });
            }}
          >
            {n.locked ? <Icons.lock /> : <Icons.unlock />}
          </button>
          <button
            className={`icon-btn${!n.visible ? ' on' : ''}`}
            title={n.visible ? 'Hide' : 'Show'}
            onClick={(e) => {
              e.stopPropagation();
              setProps([id], { visible: !n.visible });
            }}
          >
            {n.visible ? <Icons.eye /> : <Icons.eyeOff />}
          </button>
        </span>
      </div>
      {open && hasKids && !flat && [...n.children].reverse().map((c) => <LayerRow key={c} id={c} depth={depth + 1} />)}
    </>
  );
}

function Pages() {
  const pages = useStore((s) => s.doc.pages);
  const pageId = useStore((s) => s.pageId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="pages">
      <div className="section-head">
        <button className="section-toggle" onClick={() => setCollapsed(!collapsed)}>
          Pages
        </button>
        <button className="icon-btn" title="Add page" onClick={addPage}>
          <Icons.plus />
        </button>
      </div>
      {!collapsed &&
        pages.map((p) => (
          <div key={p.id} className={`page-row${p.id === pageId ? ' active' : ''}`} onClick={() => useStore.getState().set({ pageId: p.id, selection: [] })} onDoubleClick={() => setRenaming(p.id)}>
            <span className="check">{p.id === pageId ? '✓' : ''}</span>
            {renaming === p.id ? (
              <InlineName
                value={p.name}
                onDone={(v) => {
                  setRenaming(null);
                  useStore.getState().update((d) => {
                    const pg = d.pages.find((x) => x.id === p.id);
                    if (pg) pg.name = v;
                  });
                }}
              />
            ) : (
              <span className="layer-name">{p.name}</span>
            )}
            {pages.length > 1 && (
              <button
                className="icon-btn row-hover"
                title="Delete page"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${p.name}"?`)) deletePage(p.id);
                }}
              >
                <Icons.close />
              </button>
            )}
          </div>
        ))}
    </div>
  );
}

function Layers() {
  const children = useStore((s) => s.doc.pages.find((p) => p.id === s.pageId)?.children ?? []);
  const doc = useStore((s) => s.doc);
  const pageId = useStore((s) => s.pageId);
  const [q, setQ] = useState('');
  const matches = q ? Object.values(doc.nodes).filter((n) => n.pageId === pageId && n.name.toLowerCase().includes(q.toLowerCase())) : [];
  return (
    <div className="layers" onClick={(e) => e.target === e.currentTarget && useStore.getState().select([])}>
      <div className="section-head">
        <span className="section-toggle">Layers</span>
      </div>
      <div className="search slim">
        <Icons.search />
        <input placeholder="Find layer" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q ? (
        matches.length ? (
          matches.map((n) => <LayerRow key={n.id} id={n.id} depth={0} flat />)
        ) : (
          <p className="muted pad">No layers match.</p>
        )
      ) : (
        <>
          {children.length === 0 && <p className="muted pad">No layers yet. Press F to draw a frame.</p>}
          {[...children].reverse().map((id) => (
            <LayerRow key={id} id={id} depth={0} />
          ))}
        </>
      )}
    </div>
  );
}

function Assets() {
  const doc = useStore((s) => s.doc);
  const [q, setQ] = useState('');
  const comps = Object.values(doc.nodes).filter((n) => n.type === 'component' && n.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="assets">
      <div className="search">
        <Icons.search />
        <input placeholder="Search assets" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="section-head">
        <span className="section-toggle">Local components</span>
      </div>
      {comps.length === 0 && <p className="muted pad">Select a layer and press {navigator.platform.includes('Mac') ? '⌥⌘K' : 'Ctrl+Alt+K'} to create a component. Drag components from here onto the canvas.</p>}
      <div className="asset-grid">
        {comps.map((c) => (
          <div
            key={c.id}
            className="asset"
            title={`${c.name} — click or drag to insert`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/x-vellum-component', c.id)}
            onClick={() => insertInstance(c.id)}
          >
            <svg viewBox={`${c.x - 4} ${c.y - 4} ${c.w + 8} ${c.h + 8}`}>{renderNode({ doc, interactive: false, prefix: 'a-', depth: 0, zoom: 1 }, c.id) ?? null}</svg>
            <span>{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LeftPanel() {
  const [tab, setTab] = useState<'layers' | 'assets'>('layers');
  return (
    <aside className="panel left">
      <div className="tabs">
        <button className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}>
          File
        </button>
        <button className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')}>
          Assets
        </button>
      </div>
      {tab === 'layers' ? (
        <div className="tab-body" key="layers">
          <Pages />
          <Layers />
        </div>
      ) : (
        <div className="tab-body" key="assets">
          <Assets />
        </div>
      )}
    </aside>
  );
}
