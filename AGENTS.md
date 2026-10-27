# AGENTS.md: guide and progress tracker for Vellum

Read this before changing the code. **Update the progress tracker and changelog at the bottom whenever you finish a change.**

Vellum is an original, free, Figma-style design editor. Layout, workflow and shortcuts deliberately match Figma so Figma users feel at home, but **never copy Figma's code, name, logo or other assets**.

**Own identity, kept on purpose:** violet accent `--accent` (#5b4ef0) and teal components `--component`, the Geist UI font, floating rounded "island" panels on `--app-bg`, round selection handles and pill size labels, the dotted canvas (`--canvas-dot`), and the gradient V logo. Keep new UI consistent with these; don't drift back to Figma's blue/purple or square handles.

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
  geometry.ts     Paths & bezier curves, polygons/stars, boolean ops (polygon-clipping), live boolean outlines
  svgImport.ts    SVG → editable vector layers (path parser incl. arcs, transforms, sanitizing)
  canvasMath.ts   Pure canvas math (handles, snapping)
  store.ts        zustand store: doc, selection, camera, undo/redo, UI flags
  actions/        Editor commands split by area (camera, selection, edit, structure, components, shapes,
                  pages, comments, images, styles, variables, navigation, prototype, presets…); import from `../actions`
  render.tsx      SVG renderer: renderNode() (static: export/present) and NodeView (memoized live canvas)
  exporter.tsx    SVG/PNG/JPG/PDF/ZIP export, font embedding, clipboard, dev-mode CSS
  codegen.ts      Inspect: Tailwind classes and React (inline styles or Tailwind) code
  commands.ts     Quick actions registry (⌘/)
  uiPrefs.ts      Per-browser UI preferences (toolbar dock, contrast, inputs, dots)
  files.ts        IndexedDB + synchronous localStorage mirror, per-file prefs
  collab.ts       Live collaboration client (diff → ops → /api/sync polling)
  cursors.ts      Custom Figma-style cursors (SVG data URLs)
  zip.ts          Tiny store-only ZIP writer
  extensions/     Plugin system: types.ts (API), api.ts (implementation), registry.ts (auto-discovery),
                  remote.ts (sandboxed URL extensions), one folder per built-in extension
  components/     Canvas, LeftPanel, toolbar/top bar (Chrome.tsx), overlays, LayoutGrids, Home, Editor
  components/panels/  Right panel split by tab/section: controls, Design, FillSection, ImageSection, VariablesUI,
                  InstanceProps, FramePresets, ExportSection, Prototype, Inspect
server/           Backend: store.ts (Upstash Redis Lua + in-memory fallback), handlers.ts (HTTP), mcp.ts (MCP server for AI agents)
api/              Vercel Edge Function entry points (thin wrappers around server/handlers.ts)
scripts/e2e.mjs   End-to-end tests
docs/EXTENSIONS.md  How to write extensions
docs/MCP.md         Connecting AI agents over MCP
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
   Remote ops are rebased onto every undo-history doc: **give each `produce` its own copy of the ops** (immer freezes inserted objects, and layout must write to them).
8. **Text auto-sizes.** `w/h` of text nodes are derived. Change `fontSize`, not `h`.

### Adding a layer property (checklist)

`types.ts` (field) → `doc.ts` `makeNode` (default, if needed) → `render.tsx` `drawNode` → `components/RightPanel.tsx` (control) → `exporter.tsx` `cssFor` (dev mode) → `geometry.ts`/`actions.ts` if it affects shapes → e2e test if it's user-visible.

### Collaboration design

- Vercel can't hold WebSockets, so clients **poll** `POST /api/sync`. That's ~300 ms while active, slowing to 1.2–3 s when idle and 5 s in hidden tabs.
- Each sync is **one atomic Lua script** in Upstash Redis. It applies my ops, appends them to a log (sorted set, last 400 batches), writes my presence, and returns ops since my cursor plus live peers.
- Conflict policy: **last writer wins per node**, plus `repair()`. Pages (including comments) are one value. A client that falls behind the log gets `reset` and reloads the snapshot.
- Links: `#/room/<id>/<token>` = edit, `#/room/<id>` = view-only. The server stores only `sha256(token)` (and a `vellum:tok:<hash> → room` index used by MCP Bearer auth). Rooms expire 30 days after the last edit.
- Free-tier budget: one Redis command per sync. See the README for numbers.

## User research → features

Vellum's roadmap is driven by what Figma users complain about. When adding features, check this list.

| Feedback (source) | Vellum's answer |
| --- | --- |
| UI3's floating bottom toolbar covers work; nobody asked for it (Figma forum) | Preferences → Toolbar: **Floating** or **Docked in the top bar** |
| Plugins buried in sub-menus; hard to find properties (Figma forum) | **Quick actions** (`⌘/` / `⌘K`): every command, extension, page, frame, component, style and layer; toolbar **Actions** + **Extensions** buttons |
| Low contrast, gray input fields, hard-to-read icons (Figma forum) | Preferences → **High contrast** and **Outlined inputs**; redrawn 16px icon set; tooltips with shortcut chips |
| Inserting components requires search; no list view (Figma forum) | Assets panel **list / grid** toggle, click or drag to insert, components in Quick actions |
| No offline access (G2, Capterra) | **PWA**: installable, app shell + fonts cached by `public/sw.js`, files stored locally |
| Steep learning curve (G2, Capterra) | Empty-page **Start designing** card, tooltips everywhere, shortcut sheet, Quick actions |
| Layers get confusing on big projects (G2) | Layer search, **Tab/⇧Tab** sibling navigation, **N/⇧N** frame navigation, **⌘R** rename, **⌥L** collapse all, auto-scroll to selection, **Sections** |
| Text styles limited (Capterra) | Linked **color & text styles** (edit once, update everywhere), synced in live files |
| Auto layout for sections (Figma forum) | Sections are frames, so auto layout and constraints work on them |
| Radial repeat only in Figma Draw (Figma forum) | **Radial Repeat** extension |
| Handoff needs plugins (common) | Inspect generates **Tailwind** and **React**; **Export to HTML** extension |
| AI help inside the design tool (trend) | **MCP server**: any MCP agent (e.g. Claude) joins the live file and edits with a visible cursor |
| Cost (G2, Capterra) | Everything is free |

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
- ✅ Quick actions command palette (`components/CommandPalette.tsx`, `commands.ts`): fuzzy search, recents
- ✅ Global tooltips with shortcut chips (`components/Tooltip.tsx` takes over every `title`)
- ✅ Preferences (`⌘,`): theme, toolbar floating/docked, outlined inputs, high contrast, nudge, tips (`uiPrefs.ts`)
- ✅ Keyboard navigation: Tab/⇧Tab siblings, N/⇧N frames, ⌘R rename, ⌥L collapse, auto-scroll layers
- ✅ Sections (⇧S), empty-page start card, PWA offline support
- ✅ Frame presets (phone, tablet, desktop, watch, social, paper, slides) + resize-to-preset
- ✅ Auto layout v2: space-between / packed alignment, hug or fixed per axis, children fill / stretch
- ✅ Per-corner radius, dashed strokes, inner shadow, eyedropper (I), scale tool (K)
- ✅ Inspect: CSS, Tailwind, React, React + Tailwind
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
- ✅ Bezier pen (drag to pull handles), curve handles in vector edit (Alt breaks symmetry), double-click a point to toggle smooth/sharp
- ✅ Live (non-destructive) boolean groups (switch operation in the Design panel, ⌘E flattens)
- ✅ Instance overrides: per-instance text and layer visibility (Design → Instance properties), reset
- ✅ Component variants: Combine as variants, `Prop=Value` names, per-property dropdowns on instances
- ⬜ Typed component properties (boolean/instance-swap) beyond variants
- ✅ Fixed-width wrapping text (auto width / auto height; side handles set width)
- ⬜ Rich text spans (mixed styles in one text layer)
- ✅ Linked color & text styles (Assets → Styles, Design panel pickers)
- ✅ Variables with modes (color + number), bind fill/stroke/radius/opacity/gap/padding, per-frame mode override, Variables window
- ✅ Layout grids (columns / rows / grid, ⌃⇧4), masks (⌥⌘M, alpha mask groups)
- ✅ Image fill modes: fill, fit, crop (zoom + focal point), tile
- ✅ Prototype transitions (dissolve, slide ×4), Back action, hotspot flash on misclick
- ✅ Prototype overlays and Smart animate (matching layer names glide between frames)
- ⬜ Scroll/overflow behaviour, interactive components

### Files, storage, export
- ✅ IndexedDB storage + synchronous localStorage mirror (flush on tab close), quota eviction
- ✅ Per-file remembered camera and page
- ✅ Version history (named, restore)
- ✅ Export PNG/JPG/SVG/PDF, multiple export settings per layer, ZIP bundling, embedded web fonts
- ✅ Copy as PNG / SVG / CSS
- ✅ Import / download `.json`
- ⬜ Import `.fig` files (closed format, so probably never; SVG import is more realistic)
- ✅ SVG import as editable vectors (drop/paste/place .svg or paste SVG markup)

### Collaboration (Vercel + Upstash Redis)
- ✅ MCP `watch_changes`: agents long-poll to follow edits and selection changes live
- ✅ **MCP server** for AI agents (`/api/mcp`): live view of collaborators, read/render/edit tools, 🤖 presence cursor; auth = project edit token as `Authorization: Bearer` (token → file index, 401 otherwise)
- ✅ Rooms, edit and view-only invite links, live sync, cursors, selections, avatars, jump-to-person
- ✅ Local dev without Redis (in-memory store)
- 🟡 Undo in shared files is local-only and rebased over remote ops (not per-user operational undo)
- ✅ Revoking access: Share → Reset edit link (rotates the token; old links and MCP connections become view-only/401)
- ⬜ Accounts / auth, per-person permissions
- ⬜ Images in Vercel Blob instead of inline data URLs (large images bloat sync)
- ⬜ CRDT (e.g. Yjs) for character-level concurrent text editing

### Extensions
- ✅ Extension API, auto-discovery, forms, search pickers, one-undo-step runs, run-last (⌘⌥P)
- ✅ Built-in: QR Code, Avatars, Blob Generator, Table, Shadow Presets, Emoji, Export to HTML, Radial Repeat, Lorem Ipsum, Placeholder Images, Icons, Color Palette, Contrast Checker, Batch Rename, Find & Replace, Arrange in Grid, Clean Document, Random Data, Bar Chart
- ✅ Third-party extensions from a URL, sandboxed in an opaque-origin iframe with a whitelisted API bridge

## Changelog

- **2026-10-27**: v0.6. Fixed: remote edits crashing sync for clients with undo history (no live edits), unvalidated presence able to crash collaborators, file-name sync race, auto-layout fill/stretch layout, flatten deleting frame contents, stale layer drag, MCP pageId, SVG import, localStorage eviction. Added: live booleans, variants, variables & modes, image crop/tile, SVG import, overlays & smart animate, edit-link revocation, sandboxed URL extensions, MCP `watch_changes`. Refactor: `actions/` modules, `components/panels/`, canvas helpers.

- **2026-10-27**: v0.5. Figma parity: bezier pen + curve editing, auto layout v2, frame presets, per-corner radius, dashed strokes, inner shadow, masks, layout grids, instance overrides, eyedropper, scale tool, prototype transitions/back, Tailwind/React codegen. Own identity (violet/teal, Geist, island panels, round handles, dotted canvas, new logo). 7 new extensions (19 total). MCP server so AI agents can join live files.

- **2026-10-27**: v0.4. Driven by Figma user research (forum, G2, Capterra): quick actions palette, tooltips with shortcuts, preferences (docked toolbar, high contrast, outlined inputs), keyboard navigation, sections, wrapping text, linked color/text styles (synced live), assets list view, redrawn icon set, empty-page start card, PWA offline mode, Radial Repeat extension, extension `duplicate()` API.

- **2026-10-27**: v0.3. Dark mode (system/light/dark), draggable floating windows with remembered positions (Extensions, Versions, Shortcuts; Share is modal), resizable side panels, UI animations and polish (focus rings, scrollbars, theme cross-fade).

- **2026-10-27**: v0.2. Smooth drag previews + FLIP, performance (memoized NodeView, culling, measure cache), localStorage mirror, PDF/ZIP/multi-export + font embedding, gradients, constraints, boolean ops, flatten, vector edit, rotation handles, measurement, rulers, outline mode, polygon/star/arrow tools, comments, custom cursors, live collaboration on Vercel Edge + Upstash Redis, extension system with 11 built-ins, e2e test suite.
- **2026-10-27**: v0.1. Initial editor: canvas, tools, layers, pages, components, auto layout, prototype/present, inspect, versions, PNG/JPG/SVG export, IndexedDB files.
