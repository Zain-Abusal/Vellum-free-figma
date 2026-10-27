import { useEffect, useState } from 'react';

/*
 * One tooltip for the whole app. Any element with a `title` (or `data-tip`) gets a styled,
 * delayed tooltip instead of the browser's. A trailing "(…)" in the text becomes a shortcut chip:
 *   title="Rectangle (R)"  →  Rectangle  [R]
 */
interface Tip {
  text: string;
  keys?: string;
  x: number;
  y: number;
  below: boolean;
}

export default function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: Element | null = null;
    let warm = false;
    let coolTimer: ReturnType<typeof setTimeout> | undefined;

    const hide = () => {
      clearTimeout(timer);
      current = null;
      setTip(null);
      clearTimeout(coolTimer);
      coolTimer = setTimeout(() => (warm = false), 400);
    };

    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[title], [data-tip]');
      if (el === current) return;
      if (!el) return hide();
      // Take over the native tooltip.
      const t = el.getAttribute('title');
      if (t) {
        el.setAttribute('data-tip', t);
        el.removeAttribute('title');
        if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', t);
      }
      current = el;
      clearTimeout(timer);
      setTip(null);
      timer = setTimeout(
        () => {
          if (current !== el || !el.isConnected) return;
          const raw = el.getAttribute('data-tip') ?? '';
          const m = raw.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
          const r = el.getBoundingClientRect();
          const below = r.top < 60 || !el.closest('.toolbar');
          setTip({ text: m ? m[1] : raw, keys: m?.[2], x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below });
          warm = true;
        },
        warm ? 60 : 550,
      );
    };

    window.addEventListener('pointerover', over);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('pointerover', over);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 80), window.innerWidth - 80);
  return (
    <div className={`tooltip${tip.below ? ' below' : ' above'}`} style={{ left, top: tip.y }} role="tooltip">
      {tip.text}
      {tip.keys && <kbd>{tip.keys}</kbd>}
    </div>
  );
}
