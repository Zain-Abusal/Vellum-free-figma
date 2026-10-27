# Writing a Vellum extension

Extensions are Vellum's version of Figma plugins. Each one is a small TypeScript module that reads and changes the open file through a safe API. They're bundled with the app, so there's nothing to install.

- Open them from the toolbar (puzzle icon) or with **⌘/ (Ctrl+/)**.
- Re-run the last one with **⌘⌥P (Ctrl+Alt+P)**.
- Everything an extension changes is **one undo step**.

## Quick start

1. Copy the template:

   ```bash
   cp -r src/extensions/_template src/extensions/my-extension
   ```

2. Edit `src/extensions/my-extension/index.ts`. Give it a unique `id`, a `name` and a `description`.
3. Run `npm run dev`. The extension appears in the Extensions list automatically, with no registration step.

Every `src/extensions/<folder>/index.ts` with a default export is picked up by [`registry.ts`](../src/extensions/registry.ts). Folders that start with `_` are ignored.

## Anatomy

```ts
import { defineExtension } from '../types';

export default defineExtension({
  id: 'make-buttons',             // unique, kebab-case
  name: 'Make Buttons',           // shown in the list
  description: 'Creates a row of buttons.',
  icon: '🔘',                     // emoji or 1–2 characters
  needsSelection: false,          // true = refuse to run with nothing selected

  // Optional form shown before running. Values arrive in `values` by key.
  inputs: [
    { key: 'count', label: 'How many', type: 'number', default: 3, min: 1 },
    { key: 'label', label: 'Label', type: 'text', default: 'Button' },
    { key: 'color', label: 'Color', type: 'color', default: '#0d99ff' },
  ],

  // Do the work. Return a string to show it as a toast.
  run(api, values) {
    const c = api.viewportCenter();
    const row = api.create('frame', {
      name: 'Buttons', x: c.x, y: c.y, fill: null,
      autoLayout: { direction: 'horizontal', gap: 12, padding: 0, align: 'center' },
    });
    for (let i = 0; i < Number(values.count); i++) {
      const btn = api.create('frame', {
        name: 'Button', fill: String(values.color), radius: 8,
        autoLayout: { direction: 'horizontal', gap: 0, padding: 12, align: 'center' },
      }, row);
      api.create('text', { text: `${values.label} ${i + 1}`, fill: '#ffffff', fontWeight: 600, fontSize: 14 }, btn);
    }
    api.select([row]);
    return 'Buttons created';
  },
});
```

### Input types

| `type` | Value | Extra options |
| --- | --- | --- |
| `text` | string | `placeholder` |
| `textarea` | string | `placeholder` |
| `number` | number | `min`, `max`, `step` |
| `select` | string | `options: [{ value, label }]` |
| `color` | `#rrggbb` | none |
| `checkbox` | boolean | none |

### Search pickers (icons, images, …)

Add a `picker` to show a search box with a thumbnail grid. The picked item's `value` is passed as `values.picked`:

```ts
picker: {
  placeholder: 'Search emoji',
  async search(query) {
    return ['😀', '🎉', '🚀'].filter((e) => !query || e.includes(query))
      .map((e) => ({ label: e, value: e }));
  },
},
run(api, values) {
  api.create('text', { text: String(values.picked), fontSize: 64 });
},
```

The built-in **Icons** extension uses a picker with the public Iconify API.

## The API (`ExtensionAPI`)

All coordinates are **absolute page coordinates**. Reads return **snapshots** (plain copies), so mutate through `update`, never by editing the objects you got back.

| Method | What it does |
| --- | --- |
| `selection()` | Selected layers (top-level of the selection). |
| `pageNodes()` | Every layer on the current page, nested ones included. |
| `get(id)` / `children(id)` | Read one layer / its children (bottom → top). |
| `page()` | `{ id, name, bg }` of the current page. |
| `create(type, props?, parentId?)` | New `frame`, `component`, `rect`, `ellipse`, `path`, `text` or `image`. Returns its id. In an auto-layout parent, position is automatic. |
| `update(id, patch)` | Change any property. Changing `x`/`y` moves children too, and changing `w`/`h` applies constraints. |
| `remove(id)` | Delete a layer and its children. |
| `group(ids)` | Group layers. Returns the group id. |
| `addImage(src, { at, width, name, parentId })` | Insert an image from a URL (needs CORS) or data URL. It's inlined into the file. |
| `addSvg(svg, opts)` | Insert an SVG string as an image layer. |
| `select(ids)` / `zoomTo(ids)` | Change selection / move the camera. |
| `viewportCenter()` | Centre of the visible canvas. |
| `notify(message)` | Show a toast. |

The layer properties (`fill`, `stroke`, `radius`, `gradient`, `shadow`, `autoLayout`, `constraints`, `fontSize`, …) are documented in [`src/types.ts`](../src/types.ts) (`SceneNode`).

## Rules of thumb

- **Async is fine.** `run` can be `async`. Use `fetch` for any CORS-enabled API.
- **Throwing is fine.** Errors are caught and shown as a toast; changes made before the error stay and can be undone.
- **Stay inside the API.** Don't import the store or touch the DOM. The API keeps undo, collaboration sync and auto layout correct.
- **Live files:** in a shared file, your extension's changes sync to everyone like any other edit. View-only users can't run extensions.
- **Keep it small.** Extensions are bundled into the app. Put heavy dependencies behind `await import('…')` so they load only when the extension runs.

## Built-in extensions

| Folder | Inspired by | What it does |
| --- | --- | --- |
| `lorem-ipsum` | Lorem ipsum | Placeholder copy for text layers |
| `placeholder-images` | Unsplash | Random photos into shapes / frames |
| `icons` | Iconify | Search 200k+ open-source icons, insert as SVG |
| `color-palette` | Coolors | Shades, analogous, complementary, triadic palettes |
| `contrast-checker` | Stark | WCAG AA contrast check for text |
| `batch-rename` | Rename It | Rename layers with patterns |
| `find-replace` | Find & Replace | Replace text across the page |
| `arrange-grid` | Tidy up | Even grid layout |
| `clean-document` | Clean Document | Remove hidden or empty layers, round to pixels |
| `random-data` | Content Reel | Names, emails, cities, dates, prices |
| `bar-chart` | Chart | Editable bar chart from numbers |
