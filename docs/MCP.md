# Connect an AI agent (MCP)

Vellum runs a remote **MCP server** (Model Context Protocol, Streamable HTTP) for every live file. An AI agent such as Claude can join a shared file and work alongside you in real time:

- **See it live:** who is online, which page they're on, where their cursor is and what they've selected.
- **Look at the design:** a layer outline, full layer JSON, or an SVG render.
- **Edit:** create, update and delete layers. Your collaborators see each change appear live, plus the agent's **🤖 cursor**.

## Connect

1. Open a file and click **Share → Start live collaboration** (MCP works on live files).
2. In **Share → Connect an AI agent (MCP)**, set the agent's name and copy one of the following:
   - **Claude Code:**

     ```bash
     claude mcp add --transport http vellum "https://<your-app>/api/mcp?room=<id>&token=<edit token>&name=Claude"
     ```

   - **Other MCP clients** (Claude Desktop connectors, Cursor, the MCP Inspector, …): add an HTTP server with that URL, or paste the JSON config shown in the dialog.
3. Ask the agent things like *"look at what I've selected and suggest a better layout"* or *"add a pricing section under the hero"*.

The URL contains the file's **edit token**, so treat it like the edit link. A URL without `token` connects **read-only**: the agent can look but not edit.

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
| `point_at` | Move the 🤖 cursor to a layer and highlight it for everyone. |

Layer properties are documented in [`src/types.ts`](../src/types.ts) (`SceneNode`).

## How it works

- `POST /api/mcp` ([`server/mcp.ts`](../server/mcp.ts)) is a stateless JSON-RPC handler that runs as a Vercel Edge Function next to the collaboration API.
- Reads come from the room snapshot in Upstash Redis. Edits are diffed per node and pushed through the **same atomic sync script** browsers use, so they land in everyone's change log and appear live.
- The agent writes **presence** like a person does (name `🤖 <name>`, cursor at the layer it touched, selection). That's how you watch it work.
- Text sizes from the server are approximate; browsers re-measure them when the change arrives.
- Locally, `npm run dev` serves `/api/mcp` too, so you can point a client at `http://localhost:5173/api/mcp?...`.
