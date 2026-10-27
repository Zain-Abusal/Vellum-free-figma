# AGENTS.md: guide and progress tracker for Vellum

Read this before changing the code. **Update the progress tracker and changelog at the bottom whenever you finish a change.**

Vellum is an original, free, Figma-style design editor. The UI, layout and shortcuts deliberately mirror Figma (UI3) so Figma users feel at home, but **never copy Figma's code, name, logo or other assets**.

## Commands

| Command | What |
| --- | --- |
| `npm run dev` | Dev server. `/api` works with in-memory rooms, so collaboration works locally. |
| `npm run build` | Type-check (`tsc`) + production build to `dist/` |
| `npm run test:e2e` | Run after `npm run build`. Drives real Chrome against `vite preview`: editing, extensions, localStorage, two-browser live collaboration. Set `CHROME_PATH` if Chrome isn't at `/usr/bin/google-chrome`. Screenshots go to `test-results/`. |

A change is done when **`npm run build` and `npm run test:e2e` both pass**. For UI changes, also look at the screenshots.

## Architecture

```
src/
  types.ts        Data model (SceneNode, Page, Doc…). Start here.
  doc.ts          Pure tree helpers + layoutAll() (text measuring, group bounds, auto layout, constraints)
  geometry.ts     Paths, polygons/stars, boolean ops (polygon-clipping), flatten
  store.ts        zustand store: doc, selection, camera, undo/redo, UI flags
  actions.ts      Every editor command (group, align, boolean, comments, camera animation…)
  render.tsx      SVG renderer: renderNode() (static: export/present) and NodeView (memoized live canvas)
  exporter.tsx    SVG/PNG/JPG/PDF/ZIP export, font embedding, clipboard, dev-mode CSS
  files.ts        IndexedDB + synchronous localStorage mirror, per-file prefs
  collab.ts       Live collaboration client (diff → ops → /api/sync polling)
  cursors.ts      Custom Figma-style cursors (SVG data URLs)
  zip.ts          Tiny store-only ZIP writer
  extensions/     Plugin system: types.ts (API), api.ts (implementation), registry.ts (auto-discovery), one folder per extension
  components/     Canvas, panels, toolbar/top bar (Chrome.tsx), overlays (rulers, measure, comments), Home, Editor
server/           Collaboration backend: store.ts (Upstash Redis Lua + in-memory fallback), handlers.ts (HTTP)
api/              Vercel Edge Function entry points (thin wrappers around server/handlers.ts)
scripts/e2e.mjs   End-to-end tests
docs/EXTENSIONS.md  How to write extensions
```

### Invariants (don't break these)

0. **Colors come from CSS tokens** (`--bg`, `--text`, `--canvas`, …) so both themes work. Don't hard-code UI colors. Floating UI that uses `position: fixed` must be portaled to `<body>` (transformed ancestors like the toolbar break it).

1. **Absolute coordinates.** Every node's `x/y` is in page space. Moving a container means moving its descendants too (`moveDeep`). Resizing goes through `resizeTo`, which applies constraints.
2. **All edits go through `store.update(fn, history?)`**, which runs `fn` on an immer draft and then `layoutAll`. Never mutate store objects directly.
3. **History:** for drags, call `checkpoint()` once, then `update(fn, false)` per frame, so one gesture is one undo step. Extensions get the same treatment automatically.
4. **Drags don't touch the doc.** Moving uses `dragPreview` (visual offsets on `NodeView`) and commits on drop. Auto-layout reorders animate with FLIP (`flip()` in Canvas.tsx).
5. **Live canvas = `NodeView`.** Each layer subscribes only to its own node. Keep node objects referentially stable (immer does this), or every layer re-renders.
6. **Collaboration diffs by reference.** `collab.ts` sends every node whose object identity changed. Unnecessary new objects mean unnecessary network traffic.
7. **Tree repair:** after remote ops, `repair()` fixes orphans and duplicate children. Run it when you add new parent/child relationships.
8. **Text auto-sizes.** `w/h` of text nodes are derived. Change `fontSize`, not `h`.

### Adding a layer property (checklist)

`types.ts` (field) → `doc.ts` `makeNode` (default, if needed) → `render.tsx` `drawNode` → `components/RightPanel.tsx` (control) → `exporter.tsx` `cssFor` (dev mode) → `geometry.ts`/`actions.ts` if it affects shapes → e2e test if it's user-visible.

### Collaboration design

- Vercel can't hold WebSockets, so clients **poll** `POST /api/sync`. That's ~300 ms while active, slowing to 1.2–3 s when idle and 5 s in hidden tabs.
- Each sync is **one atomic Lua script** in Upstash Redis. It applies my ops, appends them to a log (sorted set, last 400 batches), writes my presence, and returns ops since my cursor plus live peers.
- Conflict policy: **last writer wins per node**, plus `repair()`. Pages (including comments) are one value. A client that falls behind the log gets `reset` and reloads the snapshot.
- Links: `#/room/<id>/<token>` = edit, `#/room/<id>` = view-only. The server stores only `sha256(token)`. Rooms expire 30 days after the last edit.
- Free-tier budget: one Redis command per sync. See the README for numbers.

## Progress tracker

Legend: ✅ done · 🟡 partial · ⬜ not started

### Editor
- ✅ Infinite canvas, pan/zoom (wheel, pinch, space, H), animated zoom-to-fit/selection
- ✅ Frames, rectangles, ellipses, lines, arrows, polygons, stars, pen (straight segments), text, images
- ✅ Selection, marquee, Figma-style group drilling, multi-select, Alt-duplicate drag
- ✅ Resize handles with Shift aspect lock, rotation handles (Shift = 15°)
- ✅ Smart guides / snapping, Alt-hover distance measurement, rulers (⇧R), outline mode (⌘Y)
- ✅ Smooth drag preview + FLIP animations for auto-layout reorder
- ✅ Viewport culling + per-node memoized rendering + text measure cache
- ✅ Light / dark / system theme (tokens in `styles.css`, `src/theme.ts`; set before first paint in `index.html`)
- ✅ Draggable floating windows (`components/Window.tsx`, portaled to `<body>`, positions remembered), resizable side panels
- ✅ UI motion: menus, windows, toasts, tabs, buttons (disabled under `prefers-reduced-motion`)
- ✅ Custom Figma-style cursors (arrow, crosshair, pen, text, hand, rotate, resize at any angle, comment, duplicate)
- ✅ Layers panel (tree, drag to reorder/nest, rename, hide, lock, search), pages
- ✅ Components & instances, Assets panel, detach, go to main
- ✅ Auto layout (direction, gap, padding, align, hug), constraints (left/right/both/center/scale)
- ✅ Fill (solid / linear / radial gradient), stroke, radius, opacity, blend modes, drop shadow, layer blur
- ✅ Typography: Google Fonts, weight, size, line height, letter spacing, decoration, alignment
- ✅ Boolean ops (union/subtract/intersect/exclude, destructive), flatten (⌘E), vector point editing
- ✅ Flip H/V, align, distribute, copy/paste properties, document colors
- ✅ Prototype links + Present mode, Inspect (CSS)
- ✅ Comments (pins, threads, resolve) stored in the file
- ⬜ Bezier curves in the pen tool / curve handles in vector edit
- ⬜ Live (non-destructive) boolean groups
- ⬜ Instance overrides (text/fill per instance), component variants/properties
- ⬜ Fixed-width (wrapping) text, rich text spans
- ⬜ Color styles / variables, text styles
- ⬜ Layout grids, image crop mode, masks
- ⬜ Prototype transitions (smart animate), scroll/overflow behaviour

### Files, storage, export
- ✅ IndexedDB storage + synchronous localStorage mirror (flush on tab close), quota eviction
- ✅ Per-file remembered camera and page
- ✅ Version history (named, restore)
- ✅ Export PNG/JPG/SVG/PDF, multiple export settings per layer, ZIP bundling, embedded web fonts
- ✅ Copy as PNG / SVG / CSS
- ✅ Import / download `.json`
- ⬜ Import `.fig` files (closed format, so probably never; SVG import is more realistic)
- ⬜ SVG import as editable vectors

### Collaboration (Vercel + Upstash Redis)
- ✅ Rooms, edit and view-only invite links, live sync, cursors, selections, avatars, jump-to-person
- ✅ Local dev without Redis (in-memory store)
- 🟡 Undo in shared files is local-only and rebased over remote ops (not per-user operational undo)
- ⬜ Accounts / auth, per-person permissions, revoking links
- ⬜ Images in Vercel Blob instead of inline data URLs (large images bloat sync)
- ⬜ CRDT (e.g. Yjs) for character-level concurrent text editing

### Extensions
- ✅ Extension API, auto-discovery, forms, search pickers, one-undo-step runs, run-last (⌘⌥P)
- ✅ Built-in: Lorem Ipsum, Placeholder Images, Icons, Color Palette, Contrast Checker, Batch Rename, Find & Replace, Arrange in Grid, Clean Document, Random Data, Bar Chart
- ⬜ Load third-party extensions at runtime (would need sandboxing in an iframe)

## Changelog

- **2026-10-27**: v0.3. Dark mode (system/light/dark), draggable floating windows with remembered positions (Extensions, Versions, Shortcuts; Share is modal), resizable side panels, UI animations and polish (focus rings, scrollbars, theme cross-fade).

- **2026-10-27**: v0.2. Smooth drag previews + FLIP, performance (memoized NodeView, culling, measure cache), localStorage mirror, PDF/ZIP/multi-export + font embedding, gradients, constraints, boolean ops, flatten, vector edit, rotation handles, measurement, rulers, outline mode, polygon/star/arrow tools, comments, custom cursors, live collaboration on Vercel Edge + Upstash Redis, extension system with 11 built-ins, e2e test suite.
- **2026-10-27**: v0.1. Initial editor: canvas, tools, layers, pages, components, auto layout, prototype/present, inspect, versions, PNG/JPG/SVG export, IndexedDB files.
