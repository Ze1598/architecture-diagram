# Architecture Diagram

A local-first, browser-based architecture diagram editor built with vanilla JS, HTML, and CSS — no build toolchain, no framework, no server required for normal use. It uses [JointJS v4 free core](https://www.jointjs.com/) for the canvas and ships a Python MCP server so AI agents (Claude Desktop, Claude Code) can create and manipulate diagrams programmatically.

---

## Quickstart

### Frontend only

No install required. Open `index.html` directly in any modern browser:

```bash
open index.html          # macOS
xdg-open index.html      # Linux
```

> **Note:** Chromium-based browsers (Chrome, Edge, Arc) support the File System Access API, which enables in-place Save. Firefox and Safari fall back to download-and-replace. For the best save experience in Chromium, serve the file over HTTP:
>
> ```bash
> python3 -m http.server 8765
> # then open http://localhost:8765
> ```

---

### Frontend + MCP server

This enables an AI agent (via Claude Desktop or Claude Code) to create and edit diagrams on your behalf, with the browser optionally reflecting changes in real time.

**1. Install uv** (if not already installed)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**2. Install server dependencies**

```bash
cd server
uv sync
```

**3. Start the server**

MCP stdio mode (for agent tool use):

```bash
uv run python main.py
```

HTTP bridge mode (also exposes a REST endpoint the browser polls):

```bash
uv run python main.py --http          # default port 7474
uv run python main.py --both          # MCP stdio + HTTP bridge together
```

**4. Register with Claude**

*Claude Code* — add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "archd": {
      "command": "uv",
      "args": [
        "run",
        "/absolute/path/to/architecture-diagram/server/main.py"
      ]
    }
  }
}
```

*Claude Desktop* — add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "archd": {
      "command": "uv",
      "args": [
        "run",
        "/absolute/path/to/architecture-diagram/server/main.py"
      ]
    }
  }
}
```

**5. (Optional) Connect the browser bridge**

If you started the server with `--http` or `--both`, click **Bridge** in the toolbar, enter `http://localhost:7474`, and click **Connect**. The app will poll for changes every 2 seconds and auto-reload any diagram the agent writes.

---

## Front-end

### Canvas & Navigation

`js/canvas.js` wraps JointJS's `dia.Paper` and `dia.Graph`. It provides an infinite canvas with dot-grid background, zoom (mouse wheel, Ctrl+=/−, toolbar buttons, zoom-% click to reset), pan (Space+drag or middle-mouse drag), fit-to-content, and a client↔graph coordinate helper used by drop targets. Zoom state is broadcast via `App.Events` so the toolbar and statusbar stay in sync.

### Shapes

`js/shapes.js` defines 11 custom element types via `joint.dia.Element.define('archd.*', …)`: Rectangle, RoundedRect, Ellipse, Diamond, Cylinder, Cloud, Hexagon, Parallelogram, Actor, StickyNote, and TextLabel — plus ImageShape, which holds pasted or uploaded raster images as base64 data URLs inside an SVG `<image>` element. All shapes except TextLabel get 4 cardinal ports (N/S/E/W) that appear on hover.

### Connectors

`js/connectors.js` supplies the link factory and arrowhead presets. Links default to orthogonal routing + rounded connector with a filled target arrow. JointJS handles magnetic snapping and rerouting as shapes move.

### Interactions

`js/interactions.js` owns selection (single click, Shift+click multi-select, marquee drag), resize handles (8-point, Shift for proportional), rotate handle (Shift for 15° snap), double-click inline label editing (textarea overlay), nudge, delete, z-order, and the full set of alignment and distribution tools (align left/right/center/top/bottom/middle, distribute H/V).

### History

`js/history.js` is snapshot-based undo/redo: `graph.toJSON()` snapshots are pushed onto a stack (max 100). Every operation that changes topology calls `App.History.push()` before acting. Undo/redo call `graph.fromJSON()` from the stack.

### Palette

`js/palette.js` renders a left sidebar with two sections — *Shapes* (the 11 built-in types) and *Custom* (user-uploaded icons, IDB-backed). It supports text search that filters across both sections, click-to-place, and HTML5 drag-and-drop onto the canvas. The Custom section has an Upload button and per-item delete.

### Custom Library

`js/custom-library.js` persists user-uploaded SVGs and PNGs to IndexedDB (`archdCustomLibrary`). It exposes a synchronous `getCache()` and async `add()`/`remove()`, and fires `library:changed` so the palette re-renders reactively.

### File I/O

`js/io.js` handles the full file lifecycle. In Chromium it uses the File System Access API (real handles, in-place save). In Firefox and Safari it falls back to download-link saves and `<input type=file>` opens. The file format is a `.archd` JSON envelope with `schemaVersion`, `document`, `assets`, and `graph` (raw `graph.toJSON()` output). There is also 30-second autosave to IndexedDB with crash-recovery prompt on next load, and a recent-files list in localStorage.

### Export

`js/export.js` exports to SVG (via JointJS's built-in serializer) and PNG (SVG → canvas → blob, 1×/2×/3× scales, optional transparent background). `js/mermaid-export.js` produces a `flowchart TD` Mermaid file — topology and labels only, lossy.

### Properties Panel

`js/properties.js` is the right-sidebar panel (220px). It is context-sensitive: selecting a shape shows fill colour, stroke colour/width/style, opacity, corner radius (rect types only), text colour, and font size. Selecting a connector shows line colour/width/style, source/target arrowhead selectors, routing selector, and a label input. Continuous inputs (colour pickers, sliders) use a start/commit pattern so each drag gesture produces a single undo entry.

### Auto-layout

`vendor/dagre.js` (dagre@0.8.5, MIT) is vendored. `js/layout.js` wraps it: the **Layout ▾** toolbar button shows a popover with four directions (TB / LR / BT / RL). Clicking one runs a full dagre hierarchical layout over all elements and their link topology, snaps positions to the 10px grid, and pushes an undo snapshot.

### Bridge UI

A **Bridge** button in the toolbar opens a dialog where you enter the local server URL (default `http://localhost:7474`). When connected the app polls `GET /current` every 2 seconds; if the server has written a newer diagram (`modifiedAt` changed) it calls `graph.fromJSON()` to auto-reload. A green dot indicates live connection.

### App bootstrap & keyboard shortcuts

`js/app.js` wires everything together: initialises all modules in dependency order, handles all keyboard shortcuts (Ctrl+Z/Y/C/X/V/D/A/S/N/O, arrows for nudge, Space for pan, `?` for shortcuts dialog), owns the clipboard (copy/cut/paste/duplicate with progressive offset), and the clipboard-paste handler that downscales pasted images (≤ 800px) and creates an ImageShape.

---

## MCP Server

The server lives in `server/` and is managed with **uv** (`pyproject.toml`). No build step — `uv sync` installs deps into `.venv`, and everything runs via `uv run python main.py`.

### diagram.py — the model

`DiagramModel` is a pure-Python in-memory representation of a `.archd` file with no dependencies beyond the standard library. It provides:

- `add_node()` — creates a JointJS-compatible cell dict for any of the 11 shape types with correct `attrs`, port groups, and default sizes
- `add_edge()` — creates a `standard.Link` cell with orthogonal router, rounded connector, optional dashed stroke and label
- `update_node()` / `delete_element()` — mutations; delete cascades to connected edges
- `apply_layout()` — hierarchical layout via Kahn's topological sort + rank assignment; supports TB/BT/LR/RL directions
- `to_mermaid()` — Mermaid `flowchart TD` export matching the browser module's output
- `save()` / `load()` — serialize/deserialize the full `.archd` envelope in the same schema the browser reads and writes

### main.py — the server

Built on **FastMCP** (from the `mcp` SDK ≥ 1.0) for the MCP stdio transport, plus **FastAPI** for the optional HTTP bridge.

The eight MCP tools are plain Python functions decorated with `@mcp.tool()`. FastMCP handles all protocol framing, JSON Schema generation from type annotations, and stdio I/O.

| Tool | Description |
|---|---|
| `create_diagram` | Create a new `.archd` file |
| `get_diagram` / `list_elements` | Read current nodes and edges |
| `add_node` | Add a shape (rectangle, diamond, cylinder, …) |
| `add_edge` | Connect two nodes with an arrow |
| `update_node` | Change label, position, or colour of a node |
| `delete_element` | Remove a node or edge (cascades to connected edges) |
| `apply_layout` | Auto-layout (TB/BT/LR/RL) |
| `export_diagram` | Export topology as Mermaid |

The FastAPI `http_app` mirrors the same tools as REST endpoints under `/diagram/{path}/…`, plus a `/current` endpoint that returns the most recently written diagram (the one the browser polls). CORS is wide-open so the browser can reach it from any origin including `file://`.

Three run modes: default (MCP stdio), `--http` (FastAPI only, for the bridge), `--both` (MCP on main thread + FastAPI in a daemon thread).

### schema/archd.schema.json

JSON Schema draft-2020-12 that formally specifies the envelope: `schemaVersion` (the major version number determines compatibility), `document` (id, name, createdAt, modifiedAt), `assets` array, and `graph.cells` array where each cell is typed against a `$defs/cell` sub-schema covering positions, sizes, attrs, source/target, router, connector, and labels.
