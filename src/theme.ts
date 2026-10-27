import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'vellum:theme';
const listeners = new Set<() => void>();
const media = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(pref: ThemePref, animate: boolean) {
  const dark = pref === 'dark' || (pref === 'system' && !!media?.matches);
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-anim');
    setTimeout(() => root.classList.remove('theme-anim'), 400);
  }
  root.dataset.theme = dark ? 'dark' : 'light';
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  apply(pref, true);
  listeners.forEach((l) => l());
}

export function initTheme() {
  apply(getThemePref(), false);
  media?.addEventListener('change', () => getThemePref() === 'system' && apply('system', true));
}

export function useThemePref() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getThemePref,
  );
}
