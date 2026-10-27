import type { NodeType, Pt, SceneNode } from '../types';

/** A form field the host renders before running an extension. */
export type Field =
  | { key: string; label: string; type: 'text' | 'textarea'; default?: string; placeholder?: string }
  | { key: string; label: string; type: 'number'; default?: number; min?: number; max?: number; step?: number }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; default?: string }
  | { key: string; label: string; type: 'color'; default?: string }
  | { key: string; label: string; type: 'checkbox'; default?: boolean };

/** Search-and-pick UI (e.g. icons, images). The picked item's `value` is passed as `values.picked`. */
export interface PickItem {
  label: string;
  /** Image URL (or data URL) shown as the thumbnail. */
  preview?: string;
  value: unknown;
}

export interface Picker {
  placeholder: string;
  /** Called on open with '' and on every (debounced) query change. */
  search: (query: string) => Promise<PickItem[]>;
}

export type Values = Record<string, unknown>;

export interface Extension {
  /** Unique, kebab-case. Folders starting with "_" are ignored. */
  id: string;
  name: string;
  description: string;
  /** An emoji or 1–2 characters shown on the extension's tile. */
  icon?: string;
  /** Selection requirement checked before running. */
  needsSelection?: boolean;
  inputs?: Field[];
  picker?: Picker;
  /** Do the work. Everything you change becomes ONE undo step. Return a string to show it as a toast. */
  run: (api: ExtensionAPI, values: Values) => void | string | Promise<void | string>;
}

/** The only surface extensions should use to read and change the document. */
export interface ExtensionAPI {
  /** Selected layers (top-level of the selection), as read-only snapshots. */
  selection(): SceneNode[];
  /** Every layer on the current page (including nested ones). */
  pageNodes(): SceneNode[];
  /** One layer by id. */
  get(id: string): SceneNode | undefined;
  /** Children of a layer, bottom → top. */
  children(id: string): SceneNode[];
  /** Current page info. */
  page(): { id: string; name: string; bg: string };
  /** Create a layer. Coordinates are absolute page coordinates. Returns the new id. */
  create(type: Exclude<NodeType, 'instance' | 'group'>, props?: Partial<SceneNode>, parentId?: string | null): string;
  /** Patch a layer. Moving x/y moves its children too; resizing frames respects constraints. */
  update(id: string, patch: Partial<SceneNode>): void;
  /** Delete a layer and its children. */
  remove(id: string): void;
  /** Wrap layers in a group. Returns the group id. */
  group(ids: string[]): string | null;
  /** Insert an image from a URL or data URL. Returns the new id. */
  addImage(src: string, opts?: { at?: Pt; width?: number; name?: string; parentId?: string | null }): Promise<string>;
  /** Insert an SVG string as an image layer. Returns the new id. */
  addSvg(svg: string, opts?: { at?: Pt; width?: number; name?: string; parentId?: string | null }): Promise<string>;
  select(ids: string[]): void;
  /** Centre of the visible canvas, in page coordinates. */
  viewportCenter(): Pt;
  zoomTo(ids: string[]): void;
  /** Show a short message. */
  notify(message: string): void;
}

export const defineExtension = (e: Extension) => e;
