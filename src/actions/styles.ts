/** Linked color and text styles. */
import { uid } from '../doc';
import type { Doc } from '../types';
import { S } from './shared';

export const ensureStyles = (d: Doc) => (d.styles ??= { colors: [], texts: [] });

export function createColorStyle(name: string, color: string, applyTo: string[] = []) {
  const id = uid();
  S().update((d) => {
    ensureStyles(d).colors.push({ id, name, color });
    for (const n of applyTo.map((i) => d.nodes[i]).filter(Boolean)) Object.assign(n, { fill: color, gradient: null, fillStyleId: id });
  });
  return id;
}

export function applyColorStyle(ids: string[], styleId: string) {
  S().update((d) => {
    const st = d.styles?.colors.find((c) => c.id === styleId);
    if (!st) return;
    for (const id of ids) if (d.nodes[id]) Object.assign(d.nodes[id], { fill: st.color, gradient: null, fillStyleId: styleId });
  });
}

/** Editing a style updates every layer linked to it. */
export function updateColorStyle(styleId: string, patch: { name?: string; color?: string }, history = true) {
  S().update((d) => {
    const st = d.styles?.colors.find((c) => c.id === styleId);
    if (!st) return;
    Object.assign(st, patch);
    if (patch.color) for (const id in d.nodes) if (d.nodes[id].fillStyleId === styleId) d.nodes[id].fill = patch.color;
  }, history);
}

export const TEXT_KEYS = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const;

export function createTextStyle(name: string, fromId: string) {
  const n = S().doc.nodes[fromId];
  if (!n || n.type !== 'text') return;
  const id = uid();
  S().update((d) => {
    ensureStyles(d).texts.push({ id, name, fontFamily: n.fontFamily ?? 'Inter', fontSize: n.fontSize ?? 16, fontWeight: n.fontWeight ?? 400, lineHeight: n.lineHeight ?? 1.2, letterSpacing: n.letterSpacing ?? 0 });
    d.nodes[fromId].textStyleId = id;
  });
}

export function applyTextStyle(ids: string[], styleId: string) {
  S().update((d) => {
    const st = d.styles?.texts.find((t) => t.id === styleId);
    if (!st) return;
    for (const id of ids) {
      const n = d.nodes[id];
      if (n?.type !== 'text') continue;
      for (const k of TEXT_KEYS) (n as unknown as Record<string, unknown>)[k] = st[k];
      n.textStyleId = styleId;
    }
  });
}

export function updateTextStyle(styleId: string, patch: Partial<Omit<import('../types').TextStyle, 'id'>>) {
  S().update((d) => {
    const st = d.styles?.texts.find((t) => t.id === styleId);
    if (!st) return;
    Object.assign(st, patch);
    for (const id in d.nodes) {
      const n = d.nodes[id];
      if (n.textStyleId === styleId) for (const k of TEXT_KEYS) (n as unknown as Record<string, unknown>)[k] = st[k];
    }
  });
}

export function deleteStyle(kind: 'colors' | 'texts', styleId: string) {
  S().update((d) => {
    if (!d.styles) return;
    if (kind === 'colors') d.styles.colors = d.styles.colors.filter((c) => c.id !== styleId);
    else d.styles.texts = d.styles.texts.filter((t) => t.id !== styleId);
    // Layers keep their current look but are detached.
    for (const id in d.nodes) {
      const n = d.nodes[id];
      if (n.fillStyleId === styleId) n.fillStyleId = undefined;
      if (n.textStyleId === styleId) n.textStyleId = undefined;
    }
  });
}
