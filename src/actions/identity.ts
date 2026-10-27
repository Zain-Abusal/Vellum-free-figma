/** Local identity used for comments and multiplayer. */

export const COLORS = ['#f24822', '#ff7262', '#ffa629', '#14ae5c', '#5b4ef0', '#0d9488', '#e93d82', '#0fa958'];

export function getMe(): { name: string; color: string } {
  try {
    const raw = localStorage.getItem('vellum:me');
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const me = { name: 'Guest ' + Math.floor(Math.random() * 900 + 100), color: COLORS[Math.floor(Math.random() * COLORS.length)] };
  setMe(me);
  return me;
}

export function setMe(me: { name: string; color: string }) {
  try {
    localStorage.setItem('vellum:me', JSON.stringify(me));
  } catch {
    /* ignore */
  }
}
