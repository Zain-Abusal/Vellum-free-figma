# Connect an AI agent (MCP)

Vellum runs a remote **MCP server** (Model Context Protocol, Streamable HTTP) for every live file. An AI agent such as Claude can join a shared file and work alongside you in real time:

- **See it live:** who is online, which page they're on, where their cursor is and what they've selected.
- **Look at the design:** a layer outline, full layer JSON, or an SVG render.
- **Edit:** create, update and delete layers. Your collaborators see each change appear live, plus the agent's **🤖 cursor**.

## Connect

1. Open a file and click **Share → Start live collaboration** (MCP works on live files).
2. In **Share → Connect an AI agent (MCP)**, set the agent's name and copy one of these:
   - **Claude Code:**

     ```bash
     claude mcp add --transport http vellum "https://<your-app>/api/mcp?name=Claude" \
       --header "Authorization: Bearer <project token>"
     ```

   - **Other MCP clients** (Claude Desktop connectors, Cursor, the MCP Inspector, …): an HTTP server with that URL and an `Authorization: Bearer <project token>` header, or paste the JSON config from the dialog:

     ```json
     { "mcpServers": { "vellum": { "type": "http", "url": "https://<your-app>/api/mcp?name=Claude",
       "headers": { "Authorization": "Bearer <project token>" } } } }
     ```

3. To have the agent work *with* you, ask it to call `watch_changes` in a loop. It sees each edit and selection change as it happens and can react.
4. Ask the agent things like *"look at what I've selected and suggest a better layout"* or *"add a pricing section under the hero"*.

## Authentication

- The **project token** is the file's **edit token** (the secret part of the edit invite link). Send it as `Authorization: Bearer <token>`.
- The token is both the credential and the file selector, so the MCP URL contains no file id and no secret.
- **Missing or invalid token → HTTP 401** with a `WWW-Authenticate: Bearer` header.
- The server stores only `sha256(token)` (plus a `token-hash → file` index), never the token itself.
- **Read-only access:** no token, with `?room=<id>` in the URL. The agent can look but not edit.
- Legacy `?token=` URLs still work, but prefer the header so the secret doesn't end up in logs and history.
- Anyone with the token can edit the file, just like the edit link. To revoke it, use **Share → Reset edit link**. That issues a new token, the old one gets 401, and old edit links become view-only.

## Tools

| Tool | What it does |
| --- | --- |
| `get_live_view` | Who is online, their page, cursor and selection (with layer details). Call this first. |
| `get_document` | Outline of a page (defaults to the page the user is on): ids, types, names, boxes, text. |
| `get_layer` | Full JSON of one layer. |
| `render_svg` | SVG of a layer or the whole page, so the agent can "see" the design. |
| `create_layer` | `frame`, `rect`, `ellipse`, `text`, `path`, `image`, `component`, with any props (fill, autoLayout, shadow, …). |
| `update_layer` | Change properties. Moving moves children; resizing applies constraints. |
| `delete_layer` | Remove a layer and its children. |
| `watch_changes` | **Follow along live:** waits up to 20 s for edits or selection changes, then reports what changed and who did it. Pass the returned `since` cursor to the next call. |
| `point_at` | Move the 🤖 cursor to a layer and highlight it for everyone. |

Layer properties are documented in [`src/types.ts`](../src/types.ts) (`SceneNode`).

## How it works

- `POST /api/mcp` ([`server/mcp.ts`](../server/mcp.ts)) is a stateless JSON-RPC handler that runs as a Vercel Edge Function next to the collaboration API. It resolves the Bearer token to its file through the token index.
- Reads come from the room snapshot in Upstash Redis. Edits are diffed per node and pushed through the **same atomic sync script** browsers use, so they land in everyone's change log and appear live.
- The agent writes **presence** like a person does (name `🤖 <name>`, cursor at the layer it touched, selection). That's how you watch it work.
- Text sizes from the server are approximate; browsers re-measure them when the change arrives.
- Locally, `npm run dev` serves `/api/mcp` too, so you can point a client at `http://localhost:5173/api/mcp` with the same header.
