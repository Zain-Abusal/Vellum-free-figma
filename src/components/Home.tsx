import { useEffect, useRef, useState } from 'react';
import { deleteFile, listFiles, parseDocJson, putFile, type FileRecord } from '../files';
import { newDoc, uid } from '../doc';
import type { Doc } from '../types';
import { Icons, Logo } from './icons';
import { setThemePref, useThemePref, type ThemePref } from '../theme';

function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return new Date(t).toLocaleDateString();
}

export default function Home() {
  const [files, setFiles] = useState<FileRecord[] | null>(null);
  const [q, setQ] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const theme = useThemePref();
  const refresh = () => listFiles().then(setFiles);

  useEffect(() => {
    refresh();
  }, []);

  const create = async (doc: Doc = newDoc(), name = 'Untitled') => {
    const id = uid();
    await putFile({ id, name, updated: Date.now(), doc, versions: [] });
    location.hash = `#/file/${id}`;
  };

  const shown = (files ?? []).filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="home">
      <aside className="home-side">
        <div className="home-brand">
          <Logo size={24} /> <strong>Vellum</strong>
        </div>
        <div className="search">
          <Icons.search />
          <input placeholder="Search files" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="side-link active">Drafts</button>
        <div className="theme-switch" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? 'on' : ''} onClick={() => setThemePref(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <p className="muted side-note">Everything is free: unlimited files, pages, components, version history, prototyping, dev mode and exports. Files are stored in this browser. Use Share to collaborate live with invite links.</p>
      </aside>
      <main className="home-main">
        <div className="home-head">
          <h1>Drafts</h1>
          <div className="row">
            <button className="btn" onClick={() => importRef.current?.click()}>
              Import .json
            </button>
            <button className="btn primary" onClick={() => create()}>
              <Icons.plus /> New design file
            </button>
          </div>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const parsed = parseDocJson(await f.text());
              if (!parsed) return alert('That file is not a Vellum document.');
              create(parsed.doc, parsed.name ?? f.name.replace(/\.(vellum\.)?json$/, ''));
            }}
          />
        </div>
        {files === null ? (
          <p className="muted">Loading…</p>
        ) : shown.length === 0 ? (
          <div className="empty">
            <p>{q ? 'No files match.' : 'No files yet.'}</p>
            {!q && (
              <button className="btn primary" onClick={() => create()}>
                Create your first design
              </button>
            )}
          </div>
        ) : (
          <div className="file-grid">
            {shown.map((f) => (
              <div key={f.id} className="file-card" onClick={() => (location.hash = f.room ? `#/room/${f.room.id}${f.room.token ? '/' + f.room.token : ''}` : `#/file/${f.id}`)}>
                <div className="file-thumb">{f.thumb ? <img src={f.thumb} alt="" /> : <span className="muted">Empty</span>}</div>
                <div className="file-meta">
                  <div>
                    <strong>{f.name}</strong>
                    {f.room && <span className="badge live">Live</span>}
                    <div className="muted">Edited {ago(f.updated)}</div>
                  </div>
                  <div className="file-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn small" title="Duplicate" onClick={async () => (await putFile({ ...f, id: uid(), name: f.name + ' (copy)', updated: Date.now() }), refresh())}>
                      Duplicate
                    </button>
                    <button className="icon-btn" title="Delete" onClick={async () => confirm(`Delete "${f.name}"?`) && (await deleteFile(f.id), refresh())}>
                      <Icons.close />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
