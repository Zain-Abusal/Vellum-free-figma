/** Figma-style canvas cursors as inline SVG data URLs (hotspot, then a system fallback). */
const cur = (svg: string, hx: number, hy: number, fallback: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${svg}</svg>`)}") ${hx} ${hy}, ${fallback}`;

const ARROW = '<path d="M6 4l15 8.5-6.6 1.6-3.4 6.4z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>';
const CROSS = (x: number, y: number) =>
  `<path d="M${x} ${y - 9}v18M${x - 9} ${y}h18" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><path d="M${x} ${y - 8}v16M${x - 8} ${y}h16" stroke="#000" stroke-width="1.4"/>`;

export const CURSOR = {
  default: cur(ARROW, 6, 4, 'default'),
  duplicate: cur(
    ARROW + '<path d="M20 20h7M23.5 16.5v7" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M20 20h7M23.5 16.5v7" stroke="#000" stroke-width="1.6" stroke-linecap="round"/>',
    6,
    4,
    'copy',
  ),
  crosshair: cur(CROSS(16, 16), 16, 16, 'crosshair'),
  pen: cur(
    '<path d="M8 6l10 4 3 9-4 3-9-3-4-10z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/><circle cx="13" cy="12" r="1.8" fill="#000"/><path d="M5 3l8 9" stroke="#000" stroke-width="1.4"/>',
    5,
    3,
    'crosshair',
  ),
  penClose: cur(
    '<path d="M8 6l10 4 3 9-4 3-9-3-4-10z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/><path d="M5 3l8 9" stroke="#000" stroke-width="1.4"/><circle cx="24" cy="24" r="3.5" fill="#fff" stroke="#000" stroke-width="1.4"/>',
    5,
    3,
    'crosshair',
  ),
  text: cur('<path d="M12 6c2 0 3 1 4 2 1-1 2-2 4-2M12 26c2 0 3-1 4-2 1 1 2 2 4 2M16 8v16M13 16h6" fill="none" stroke="#fff" stroke-width="3.5"/><path d="M12 6c2 0 3 1 4 2 1-1 2-2 4-2M12 26c2 0 3-1 4-2 1 1 2 2 4 2M16 8v16M13 16h6" fill="none" stroke="#000" stroke-width="1.4"/>', 16, 16, 'text'),
  hand: cur(
    '<path d="M11 15V8.5a1.6 1.6 0 013.2 0V14m0-7a1.6 1.6 0 013.2 0v7m0-5.5a1.6 1.6 0 013.2 0V15m0-3.5a1.6 1.6 0 013.2 0v7c0 5-3 8-7.5 8-3.4 0-5.3-1.6-6.6-4L7 18a1.7 1.7 0 012.8-1.8L11 18" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/>',
    16,
    16,
    'grab',
  ),
  grabbing: cur(
    '<path d="M10 14.5c0-1 .8-1.7 1.7-1.7s1.6.7 1.6 1.7m0-1c0-1 .8-1.7 1.7-1.7s1.6.7 1.6 1.7m0 0c0-1 .8-1.7 1.7-1.7s1.6.7 1.6 1.7m0 .5c0-1 .8-1.7 1.6-1.7.9 0 1.7.7 1.7 1.7v4.5c0 5-3 8-7.5 8-4 0-7.6-3-7.6-7.5V17c0-1.4 1-2.5 2.3-2.5" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/>',
    16,
    16,
    'grabbing',
  ),
  rotate: cur(
    '<path d="M9 21a9 9 0 0114-11" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><path d="M9 21a9 9 0 0114-11" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/><path d="M19 6l5 4-6 2z" fill="#000" stroke="#fff" stroke-width="1"/>',
    16,
    16,
    'alias',
  ),
  comment: cur(
    '<path d="M6 26V14a9 9 0 019-9h2a9 9 0 019 9v1a9 9 0 01-9 9H8z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>',
    6,
    26,
    'crosshair',
  ),
};

const resizeCache = new Map<number, string>();

/** Double-headed resize arrow rotated to any angle (degrees), like Figma's. */
export function resizeCursor(angle: number) {
  const a = ((Math.round(angle / 15) * 15) % 180 + 180) % 180;
  let c = resizeCache.get(a);
  if (!c) {
    const g = `<g transform="rotate(${a} 16 16)"><path d="M6 16l5-5v3h10v-3l5 5-5 5v-3H11v3z" fill="#000" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></g>`;
    c = cur(g, 16, 16, 'move');
    resizeCache.set(a, c);
  }
  return c;
}

export const HANDLE_ANGLE: Record<string, number> = { e: 0, w: 0, n: 90, s: 90, nw: 45, se: 45, ne: 135, sw: 135 };
