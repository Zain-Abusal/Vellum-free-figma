/** Variables with modes (e.g. Light / Dark), bindable to fill, stroke, radius, opacity, gap and padding. */
import { uid } from '../doc';
import type { Doc, VarCollection, VarProp, Variable } from '../types';
import { S } from './shared';

const cols = (d: Doc) => ((d.styles ??= { colors: [], texts: [] }).variables ??= []);
const col = (d: Doc, id: string) => cols(d).find((c) => c.id === id);

export function createCollection(name = 'Theme'): string {
  const id = uid();
  const light = uid();
  const dark = uid();
  S().update((d) => {
    cols(d).push({
      id,
      name,
      defaultMode: light,
      modes: [
        { id: light, name: 'Light' },
        { id: dark, name: 'Dark' },
      ],
      vars: [],
    });
  });
  return id;
}

export const renameCollection = (id: string, name: string) => S().update((d) => void (col(d, id) && (col(d, id)!.name = name)));
export const deleteCollection = (id: string) =>
  S().update((d) => {
    const c = col(d, id);
    if (!c) return;
    const varIds = new Set(c.vars.map((v) => v.id));
    d.styles!.variables = cols(d).filter((x) => x.id !== id);
    unbind(d, varIds);
    for (const nid in d.nodes) if (d.nodes[nid].varModes?.[id]) delete d.nodes[nid].varModes![id];
  });

export function addMode(colId: string, name: string) {
  S().update((d) => {
    const c = col(d, colId);
    if (!c) return;
    const id = uid();
    c.modes.push({ id, name });
    // New modes start as a copy of the default mode.
    for (const v of c.vars) v.values[id] = v.values[c.defaultMode];
  });
}

export const renameMode = (colId: string, modeId: string, name: string) =>
  S().update((d) => {
    const m = col(d, colId)?.modes.find((x) => x.id === modeId);
    if (m) m.name = name;
  });

export function deleteMode(colId: string, modeId: string) {
  S().update((d) => {
    const c = col(d, colId);
    if (!c || c.modes.length < 2) return;
    c.modes = c.modes.filter((m) => m.id !== modeId);
    if (c.defaultMode === modeId) c.defaultMode = c.modes[0].id;
    for (const v of c.vars) delete v.values[modeId];
    for (const nid in d.nodes) if (d.nodes[nid].varModes?.[colId] === modeId) delete d.nodes[nid].varModes![colId];
  });
}

export const setDefaultMode = (colId: string, modeId: string) => S().update((d) => void (col(d, colId) && (col(d, colId)!.defaultMode = modeId)));

export function addVariable(colId: string, type: Variable['type']): string {
  const id = uid();
  S().update((d) => {
    const c = col(d, colId);
    if (!c) return;
    const n = c.vars.filter((v) => v.type === type).length + 1;
    c.vars.push({ id, name: type === 'color' ? `color/${n}` : `space/${n}`, type, values: Object.fromEntries(c.modes.map((m, i) => [m.id, type === 'color' ? (i % 2 ? '#1e1e1e' : '#ffffff') : 8])) });
  });
  return id;
}

export const renameVariable = (colId: string, varId: string, name: string) =>
  S().update((d) => {
    const v = col(d, colId)?.vars.find((x) => x.id === varId);
    if (v) v.name = name;
  });

export const setVariableValue = (colId: string, varId: string, modeId: string, value: string | number, history = true) =>
  S().update((d) => {
    const v = col(d, colId)?.vars.find((x) => x.id === varId);
    if (v) v.values[modeId] = value;
  }, history);

export function deleteVariable(colId: string, varId: string) {
  S().update((d) => {
    const c = col(d, colId);
    if (!c) return;
    c.vars = c.vars.filter((v) => v.id !== varId);
    unbind(d, new Set([varId]));
  });
}

function unbind(d: Doc, varIds: Set<string>) {
  for (const nid in d.nodes) {
    const n = d.nodes[nid];
    if (!n.vars) continue;
    for (const [k, v] of Object.entries(n.vars)) if (v && varIds.has(v)) delete n.vars[k as VarProp];
  }
}

/** Bind (or unbind with null) a property of the selected layers to a variable. */
export function bindVariable(ids: string[], prop: VarProp, varId: string | null) {
  S().update((d) => {
    for (const id of ids) {
      const n = d.nodes[id];
      if (!n) continue;
      const vars = { ...(n.vars ?? {}) };
      if (varId) vars[prop] = varId;
      else delete vars[prop];
      n.vars = Object.keys(vars).length ? vars : undefined;
      if (prop === 'fill' && varId) n.fillStyleId = undefined;
    }
  });
}

/** Set (or clear) a frame's mode for a collection; children inherit it. */
export function setFrameMode(ids: string[], colId: string, modeId: string | null) {
  S().update((d) => {
    for (const id of ids) {
      const n = d.nodes[id];
      if (!n) continue;
      const m = { ...(n.varModes ?? {}) };
      if (modeId) m[colId] = modeId;
      else delete m[colId];
      n.varModes = Object.keys(m).length ? m : undefined;
    }
  });
}

/** Every variable of a type, with its collection, for pickers. */
export const variablesOfType = (doc: Doc, type: Variable['type']): { col: VarCollection; v: Variable }[] =>
  (doc.styles?.variables ?? []).flatMap((c) => c.vars.filter((v) => v.type === type).map((v) => ({ col: c, v })));
