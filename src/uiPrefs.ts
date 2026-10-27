import { useSyncExternalStore } from 'react';

/**
 * Per-browser UI preferences. These answer common Figma UI3 complaints:
 * the floating toolbar covering work, low-contrast UI and gray input fields.
 */
export interface UiPrefs {
  /** Floating at the bottom (UI3) or docked in the top bar (classic). */
  toolbar: 'bottom' | 'top';
  /** Gray-filled inputs (UI3) or outlined inputs (classic, higher contrast). */
  inputs: 'filled' | 'outlined';
  contrast: 'normal' | 'high';
  /** Shift+arrow nudge distance. */
  bigNudge: number;
  /** Show the empty-canvas "get started" card. */
  hints: boolean;
  /** Vellum's dotted canvas background. */
  canvasDots: boolean;
}

const KEY = 'vellum:ui';
const DEFAULTS: UiPrefs = { toolbar: 'bottom', inputs: 'filled', contrast: 'normal', bigNudge: 10, hints: true, canvasDots: true };
const listeners = new Set<() => void>();
let current = load();

function load(): UiPrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

function apply() {
  const r = document.documentElement;
  r.dataset.inputs = current.inputs;
  r.dataset.contrast = current.contrast;
}

export const getUiPrefs = () => current;

export function setUiPrefs(patch: Partial<UiPrefs>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  apply();
  listeners.forEach((l) => l());
}

export function initUiPrefs() {
  apply();
}

export function useUiPrefs() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getUiPrefs,
  );
}
