import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './icons';

/*
 * Floating window, draggable by its title bar (like Figma's plugin windows).
 * Position is remembered per window id. `modal` adds a dimmed backdrop that closes on click.
 * Rendered into <body> so transformed ancestors (e.g. the toolbar) can't offset `position: fixed`.
 */

let topZ = 100;
const KEY = 'vellum:win:';

type Pos = { x: number; y: number };

const clamp = (p: Pos, w: number, h: number): Pos => ({
  x: Math.min(Math.max(p.x, 80 - w), window.innerWidth - 80),
  y: Math.min(Math.max(p.y, 0), window.innerHeight - Math.min(h, 48)),
});

function loadPos(id: string): Pos | null {
  try {
    return JSON.parse(localStorage.getItem(KEY + id) ?? 'null');
  } catch {
    return null;
  }
}

export function Window({ id, title, onClose, children, modal = false, width = 420 }: { id: string; title: ReactNode; onClose: () => void; children: ReactNode; modal?: boolean; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [z, setZ] = useState(() => ++topZ);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    const saved = modal ? null : loadPos(id);
    setPos(clamp(saved ?? { x: (window.innerWidth - r.width) / 2, y: Math.max(56, (window.innerHeight - r.height) / 3) }, r.width, r.height));
  }, [id, modal]);

  useEffect(() => {
    const onResize = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setPos((p) => p && clamp(p, r.width, r.height));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && z === topZ) onClose();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, z]);

  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea') || !pos) return;
    e.preventDefault();
    const ox = e.clientX - pos.x;
    const oy = e.clientY - pos.y;
    const r = ref.current!.getBoundingClientRect();
    let last = pos;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      last = clamp({ x: ev.clientX - ox, y: ev.clientY - oy }, r.width, r.height);
      setPos(last);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        if (!modal) localStorage.setItem(KEY + id, JSON.stringify(last));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return createPortal(
    <>
      {modal && <div className="modal-bg" style={{ zIndex: z - 1 }} onPointerDown={onClose} />}
      <div
        ref={ref}
        role="dialog"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`window${dragging ? ' dragging' : ''}`}
        style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, zIndex: z, width: `min(${width}px, calc(100vw - 16px))`, visibility: pos ? 'visible' : 'hidden' }}
        onPointerDown={() => z !== topZ && setZ(++topZ)}
      >
        <div className="window-head" onPointerDown={startDrag}>
          <strong>{title}</strong>
          <button className="icon-btn" title="Close (Esc)" onClick={onClose}>
            <Icons.close />
          </button>
        </div>
        <div className="window-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}
