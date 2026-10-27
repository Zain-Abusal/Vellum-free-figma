import { create } from 'zustand';
import { produce } from 'immer';
import type { Doc, Pt, Tool, Version } from './types';
import { layoutAll, newDoc } from './doc';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Peer {
  id: string;
  name: string;
  color: string;
  pageId: string;
  cursor: Pt | null;
  selection: string[];
}

export interface CollabInfo {
  roomId: string;
  token?: string;
  canEdit: boolean;
  status: 'connecting' | 'live' | 'offline' | 'error';
  error?: string;
  peers: Peer[];
}

export interface State {
  fileId: string | null;
  fileName: string;
  versions: Version[];
  doc: Doc;
  pageId: string;
  selection: string[];
  tool: Tool;
  camera: Camera;
  past: Doc[];
  future: Doc[];
  editingTextId: string | null;
  /** Path being point-edited (vector edit mode). */
  vectorEditId: string | null;
  hoverId: string | null;
  presenting: string | null;
  clipboard: { doc: Doc; ids: string[] } | null;
  /** Visual-only offsets while dragging; committed to the doc on drop. */
  dragPreview: Record<string, Pt> | null;
  readOnly: boolean;
  collab: CollabInfo | null;
  showRulers: boolean;
  showGrids: boolean;
  outlineMode: boolean;
  hideUI: boolean;
  showComments: boolean;
  activeComment: string | null;
  /** Short status message shown at the bottom of the canvas. */
  toast: string | null;
  /** false = closed, true = list, string = open this extension directly. */
  extensionsOpen: boolean | string;
  paletteOpen: boolean;
  /** Top-bar dialogs, openable from anywhere (command palette, menus). */
  dialog: 'versions' | 'shortcuts' | 'share' | null;
  prefsOpen: boolean;
  variablesOpen: boolean;
  /** Layer currently being renamed inline in the layers panel (⌘R). */
  renamingId: string | null;
  /** Bumped to collapse every layer row (⌥L). */
  collapseNonce: number;
  set: (p: Partial<State>) => void;
  load: (fileId: string, name: string, doc: Doc, versions: Version[]) => void;
  /** Apply an edit. `history: false` is for live drags (call checkpoint() once first). */
  update: (fn: (d: Doc) => void, history?: boolean, extra?: Partial<State>) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[]) => void;
  setTool: (t: Tool) => void;
}

const initial = newDoc();
const HISTORY = 100;

export const useStore = create<State>((set, get) => {
  const sanitize = (d: Doc) => {
    const s = get();
    return {
      selection: s.selection.filter((id) => d.nodes[id]),
      pageId: d.pages.some((p) => p.id === s.pageId) ? s.pageId : d.pages[0].id,
      editingTextId: null,
      vectorEditId: null,
    };
  };

  return {
    fileId: null,
    fileName: 'Untitled',
    versions: [],
    doc: initial,
    pageId: initial.pages[0].id,
    selection: [],
    tool: 'select',
    camera: { x: 0, y: 0, zoom: 1 },
    past: [],
    future: [],
    editingTextId: null,
    vectorEditId: null,
    hoverId: null,
    presenting: null,
    clipboard: null,
    dragPreview: null,
    readOnly: false,
    collab: null,
    showRulers: false,
    showGrids: true,
    outlineMode: false,
    hideUI: false,
    showComments: false,
    activeComment: null,
    toast: null,
    extensionsOpen: false,
    paletteOpen: false,
    dialog: null,
    prefsOpen: false,
    variablesOpen: false,
    renamingId: null,
    collapseNonce: 0,
    set: (p) => set(p),
    load: (fileId, name, doc, versions) =>
      set({
        fileId,
        fileName: name,
        versions,
        doc,
        pageId: doc.pages[0].id,
        selection: [],
        past: [],
        future: [],
        tool: 'select',
        editingTextId: null,
        vectorEditId: null,
        hoverId: null,
        presenting: null,
        dragPreview: null,
        readOnly: false,
        collab: null,
        activeComment: null,
      }),
    update: (fn, history = true, extra) => {
      const { doc, past, readOnly } = get();
      if (readOnly) return extra ? set(extra) : undefined;
      const next = produce(doc, (d) => {
        fn(d);
        layoutAll(d);
      });
      if (next === doc) return extra ? set(extra) : undefined;
      set(history ? { doc: next, past: [...past.slice(-HISTORY + 1), doc], future: [], ...extra } : { doc: next, ...extra });
    },
    checkpoint: () => {
      const { doc, past } = get();
      set({ past: [...past.slice(-HISTORY + 1), doc], future: [] });
    },
    undo: () => {
      const { past, future, doc, readOnly } = get();
      if (!past.length || readOnly) return;
      const prev = past[past.length - 1];
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future].slice(0, HISTORY), ...sanitize(prev) });
    },
    redo: () => {
      const { past, future, doc, readOnly } = get();
      if (!future.length || readOnly) return;
      const next = future[0];
      set({ doc: next, past: [...past, doc], future: future.slice(1), ...sanitize(next) });
    },
    select: (ids) => set({ selection: ids }),
    setTool: (tool) => set({ tool, vectorEditId: null }),
  };
});
