import { useEffect, useRef, useState } from 'react';
import { useStore, type Camera } from '../store';
import type { Box } from '../doc';
import type { Pt } from '../types';
import { addComment, deleteComment, getMe, replyComment, setCommentResolved } from '../actions';

const RED = '#f24822';

/* ---------- Alt-hover distance measurement ---------- */

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  v: number;
}

function gaps(a: Box, b: Box): Seg[] {
  const out: Seg[] = [];
  const ay = a.y + a.h / 2;
  const ax = a.x + a.w / 2;
  if (a.x + a.w <= b.x) out.push({ x1: a.x + a.w, y1: ay, x2: b.x, y2: ay, v: b.x - a.x - a.w });
  else if (b.x + b.w <= a.x) out.push({ x1: b.x + b.w, y1: ay, x2: a.x, y2: ay, v: a.x - b.x - b.w });
  else {
    if (b.x < a.x) out.push({ x1: b.x, y1: ay, x2: a.x, y2: ay, v: a.x - b.x });
    if (b.x + b.w > a.x + a.w) out.push({ x1: a.x + a.w, y1: ay, x2: b.x + b.w, y2: ay, v: b.x + b.w - a.x - a.w });
  }
  if (a.y + a.h <= b.y) out.push({ x1: ax, y1: a.y + a.h, x2: ax, y2: b.y, v: b.y - a.y - a.h });
  else if (b.y + b.h <= a.y) out.push({ x1: ax, y1: b.y + b.h, x2: ax, y2: a.y, v: a.y - b.y - b.h });
  else {
    if (b.y < a.y) out.push({ x1: ax, y1: b.y, x2: ax, y2: a.y, v: a.y - b.y });
    if (b.y + b.h > a.y + a.h) out.push({ x1: ax, y1: a.y + a.h, x2: ax, y2: b.y + b.h, v: b.y + b.h - a.y - a.h });
  }
  return out.filter((s) => s.v > 0.01);
}

export function Measure({ a, b, cam }: { a: Box; b: Box; cam: Camera }) {
  const S = (x: number, y: number) => ({ x: x * cam.zoom + cam.x, y: y * cam.zoom + cam.y });
  const bs = S(b.x, b.y);
  return (
    <g>
      <rect x={bs.x} y={bs.y} width={b.w * cam.zoom} height={b.h * cam.zoom} fill="none" stroke={RED} />
      {gaps(a, b).map((s, i) => {
        const p1 = S(s.x1, s.y1);
        const p2 = S(s.x2, s.y2);
        const label = String(Math.round(s.v * 100) / 100);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const w = label.length * 6.5 + 8;
        return (
          <g key={i}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={RED} />
            <rect x={mx - w / 2} y={my - 8} width={w} height={16} rx={3} fill={RED} />
            <text x={mx} y={my + 4} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={500}>
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/* ---------- rulers ---------- */

const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

export function Rulers({ cam, w, h, sel }: { cam: Camera; w: number; h: number; sel: Box | null }) {
  const step = STEPS.find((s) => s * cam.zoom >= 60) ?? 20000;
  const ticks = (len: number, off: number) => {
    const out: number[] = [];
    const start = Math.floor(-off / cam.zoom / step) * step;
    for (let v = start; v * cam.zoom + off < len; v += step) out.push(v);
    return out;
  };
  const R = 20;
  return (
    <svg className="rulers" width={w} height={h}>
      <rect x={0} y={0} width={w} height={R} className="ruler-bg" />
      <rect x={0} y={0} width={R} height={h} className="ruler-bg" />
      {sel && (
        <>
          <rect x={sel.x * cam.zoom + cam.x} y={0} width={sel.w * cam.zoom} height={R} className="ruler-sel" />
          <rect x={0} y={sel.y * cam.zoom + cam.y} width={R} height={sel.h * cam.zoom} className="ruler-sel" />
        </>
      )}
      {ticks(w, cam.x).map((v) => {
        const x = v * cam.zoom + cam.x;
        return x < R ? null : (
          <g key={'x' + v}>
            <line x1={x} x2={x} y1={R - 6} y2={R} className="ruler-tick" />
            <text x={x + 3} y={11} className="ruler-label">
              {v}
            </text>
          </g>
        );
      })}
      {ticks(h, cam.y).map((v) => {
        const y = v * cam.zoom + cam.y;
        return y < R ? null : (
          <g key={'y' + v}>
            <line y1={y} y2={y} x1={R - 6} x2={R} className="ruler-tick" />
            <text x={11} y={y - 3} className="ruler-label" transform={`rotate(-90 11 ${y - 3})`}>
              {v}
            </text>
          </g>
        );
      })}
      <rect x={0} y={0} width={R} height={R} className="ruler-corner" />
    </svg>
  );
}

/* ---------- comments ---------- */

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? 'now' : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : new Date(t).toLocaleDateString();
};

const colorFor = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ['#f24822', '#ffa629', '#14ae5c', '#5b4ef0', '#0d9488', '#e93d82'][h % 6];
};

function Composer({ placeholder, onSubmit, autoFocus }: { placeholder: string; onSubmit: (t: string) => void; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) setTimeout(() => ref.current?.focus(), 0);
  }, [autoFocus]);
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText('');
  };
  return (
    <div className="composer">
      <textarea
        ref={ref}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button className="btn primary small" disabled={!text.trim()} onClick={submit}>
        Post
      </button>
    </div>
  );
}

export function CommentsLayer({ cam, draft, setDraft }: { cam: Camera; draft: Pt | null; setDraft: (p: Pt | null) => void }) {
  const comments = useStore((s) => s.doc.pages.find((p) => p.id === s.pageId)?.comments ?? []);
  const show = useStore((s) => s.showComments || s.tool === 'comment');
  const active = useStore((s) => s.activeComment);
  const readOnly = useStore((s) => s.readOnly);
  const S = (p: Pt) => ({ left: p.x * cam.zoom + cam.x, top: p.y * cam.zoom + cam.y });
  const me = getMe();
  const open = comments.find((c) => c.id === active);

  return (
    <>
      {show &&
        comments
          .filter((c) => !c.resolved || c.id === active)
          .map((c) => (
            <button
              key={c.id}
              className={`comment-pin${c.id === active ? ' active' : ''}`}
              style={{ ...S(c), background: colorFor(c.thread[0]?.author ?? '') }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => useStore.getState().set({ activeComment: c.id === active ? null : c.id })}
              title={c.thread[0]?.text}
            >
              {(c.thread[0]?.author ?? '?')[0].toUpperCase()}
              {c.thread.length > 1 && <span className="pin-count">{c.thread.length}</span>}
            </button>
          ))}
      {draft && (
        <div className="comment-pop" style={S(draft)} onPointerDown={(e) => e.stopPropagation()}>
          <Composer
            autoFocus
            placeholder={readOnly ? 'View-only: comments are disabled' : 'Add a comment'}
            onSubmit={(t) => {
              addComment(draft, t, me.name);
              setDraft(null);
            }}
          />
          <button className="link-btn" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </div>
      )}
      {open && show && (
        <div className="comment-pop" style={S(open)} onPointerDown={(e) => e.stopPropagation()}>
          <div className="comment-head">
            <button className="link-btn" onClick={() => setCommentResolved(open.id, !open.resolved)}>
              {open.resolved ? 'Reopen' : '✓ Resolve'}
            </button>
            <button className="link-btn danger" onClick={() => deleteComment(open.id)}>
              Delete
            </button>
            <button className="link-btn" onClick={() => useStore.getState().set({ activeComment: null })}>
              ✕
            </button>
          </div>
          <div className="thread">
            {open.thread.map((r) => (
              <div key={r.id} className="reply">
                <div className="reply-meta">
                  <span className="avatar small" style={{ background: colorFor(r.author) }}>
                    {r.author[0]?.toUpperCase()}
                  </span>
                  <strong>{r.author}</strong>
                  <span className="muted">{ago(r.date)}</span>
                </div>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
          <Composer placeholder="Reply" onSubmit={(t) => replyComment(open.id, t, me.name)} />
        </div>
      )}
    </>
  );
}
