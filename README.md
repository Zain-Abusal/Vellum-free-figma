# Vellum

A free, browser-based design editor with a Figma-style workflow, its own look, live multiplayer collaboration and AI agents over MCP. Every feature is unlocked, with no plans and no limits.

> Building on this? Read **[AGENTS.md](AGENTS.md)** (architecture + progress tracker), **[docs/EXTENSIONS.md](docs/EXTENSIONS.md)** (plugins) and **[docs/MCP.md](docs/MCP.md)** (AI agents).

## Features

- **Figma-like UI and shortcuts**: layers and pages on the left; Design / Prototype / Inspect on the right; floating toolbar; custom canvas cursors.
- **Light & dark mode** (follows your system, or pick one), **draggable windows**, resizable panels and smooth animations.
- **Built from Figma users' feedback**: Quick actions (`⌘/`) to find anything, a toolbar you can dock out of the way, high-contrast and outlined-input options, keyboard layer navigation, tooltips with shortcuts, and it works offline (installable PWA). See the table in [AGENTS.md](AGENTS.md#user-research--features).
- **Tools**: frame (with device/social/paper presets), section, rectangle, ellipse, line, arrow, polygon, star, pen with bezier curves, text, images (drop, paste or place), comments, scale (K), eyedropper (I).
- **Editing**:
  - smooth drag previews, snapping guides, Alt-hover measurements, rotation handles, rulers, outline mode
  - auto layout (packed or space-between, hug/fixed, fill/stretch children) with animated reordering, and constraints
  - components, variants and instances with per-instance text/visibility overrides
  - live boolean groups, flatten, masks, vector point and curve editing, layout grids, SVG import as vectors
- **Styling**: variables with modes (e.g. Light/Dark), linked color and text styles, solid and gradient fills, solid or dashed strokes, per-corner radius, blend modes, drop and inner shadows, blur, Google Fonts with letter spacing, decoration and wrapping text, document colors.
- **Prototyping**: click-through links and overlays with dissolve/slide/Smart animate transitions and Back, plus a Present mode. **Inspect** gives CSS, Tailwind and React code.
- **Files**: unlimited files and pages, works offline, autosaved to IndexedDB with a localStorage backup, unlimited named versions.
- **Export**: PNG / JPG / SVG / PDF / GIF (animated when the layer contains animated GIFs) at any scale, several presets per layer, ZIP bundles, embedded fonts, copy as PNG / SVG / CSS.
- **Live collaboration**: invite links (edit or view-only, resettable to revoke access), real-time sync, live cursors and selections, avatars, comments.
- **AI agents (MCP)**: connect Claude or any MCP client to a live file. It sees who's online and what they selected, follows edits live, renders and edits the design, and shows its own 🤖 cursor.
- **Extensions**: 19 built-in plugins, plus third-party extensions installed from a URL and run in a sandbox (QR code, avatars, blobs, tables, shadow presets, emoji, HTML export, radial repeat, icons, placeholder images, lorem ipsum, palettes, contrast checker, batch rename, find & replace, grid, clean-up, random data, charts), plus your own.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173 (collaboration works locally with an in-memory server)
```

## Deploy to Vercel (with free live collaboration)

The whole thing runs on Vercel: the app is static and the collaboration API is Vercel Edge Functions in `api/`.

1. Push this folder to GitHub and import it at **vercel.com → Add New → Project**. The Vite preset is detected automatically.
2. In the project, open **Storage → Marketplace → Upstash for Redis → Create** (the free plan is fine) and connect it to the project. This adds `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_*`) automatically.
   - For worldwide users, pick **Global** replication when creating the database.
3. **Redeploy.** Check `https://<your-app>.vercel.app/api/health`: it should say `"storage":"redis"`.

CLI alternative: `npm i -g vercel && vercel --prod`, then add Upstash Redis from the project's Storage tab and redeploy.

> ⚠️ Without Redis env vars, the API falls back to in-memory storage. That works for local dev, but in production rooms would randomly disappear because each serverless instance has its own memory.

### How sharing works

Click **Share → Start live collaboration**. This uploads the file and gives you two links:

- **Invite to edit**: `…/#/room/<id>/<secret>`
- **Invite to view**: `…/#/room/<id>`

Anyone with a link can open the file. Rooms expire 30 days after the last edit. Every collaborator also keeps a local copy in their browser.

### Free-tier budget

Each client sends one request (and one Redis command) about every 300 ms while active, every 1.2–3 s when idle, and every 5 s in a background tab. As a rough guide, one actively editing person uses ~12k commands an hour. Check your current Upstash and Vercel plan limits. Upstash pay-as-you-go is the cheap next step if you outgrow the free plan.

## Tests

```bash
npm run build && npm run test:e2e   # real Chrome; set CHROME_PATH if needed
```

## Status

See the **progress tracker in [AGENTS.md](AGENTS.md#progress-tracker)**. Notable gaps: rich text (mixed styles in one layer), typed component properties, scroll behaviour in prototypes, accounts and permissions, `.fig` import.
