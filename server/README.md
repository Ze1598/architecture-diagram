# archd MCP Server

Python service that exposes the architecture diagram tools via the **Model Context Protocol** (MCP) and an optional HTTP REST bridge for browser integration.

## Requirements

- Python ≥ 3.11
- [uv](https://docs.astral.sh/uv/) — `curl -LsSf https://astral.sh/uv/install.sh | sh`

## Setup

```bash
cd server
uv sync          # creates .venv and installs all deps from pyproject.toml
```

`uv sync` is idempotent — re-run it whenever `pyproject.toml` changes.

## Running

All commands are run from the `server/` directory (or prefix with `--project server/`).

### MCP stdio mode (for Claude Desktop / Claude Code)

```bash
uv run python main.py
```

Register in `~/.claude.json` (Claude Code) or `claude_desktop_config.json` (Claude Desktop):

```json
{
  "mcpServers": {
    "archd": {
      "command": "uv",
      "args": ["run", "python", "main.py"],
      "cwd": "/absolute/path/to/server"
    }
  }
}
```

### HTTP bridge mode (for the browser "Connect to bridge" feature)

```bash
uv run python main.py --http            # default port 7474
uv run python main.py --http --port 8080
uv run python main.py --http --work-dir ~/diagrams
```

Then in the app toolbar click **Bridge → Connect** and enter `http://localhost:7474`.
The app polls `/current` every 2 seconds and auto-reloads when the MCP server writes a new diagram.

### Run both at once

```bash
uv run python main.py --both            # MCP stdio + HTTP on :7474
```

## MCP Tools

| Tool | Description |
|---|---|
| `create_diagram` | Create a new `.archd` file |
| `get_diagram` / `list_elements` | Read current nodes and edges |
| `add_node` | Add a shape (rectangle, diamond, cylinder, …) |
| `add_edge` | Connect two nodes with an arrow |
| `update_node` | Change label, position, or colour of a node |
| `delete_element` | Remove a node or edge (cascades to connected edges) |
| `apply_layout` | Auto-layout using hierarchical algorithm (TB/BT/LR/RL) |
| `export_diagram` | Export topology as Mermaid |

## Example session (Claude using MCP tools)

```
create_diagram(name="Auth Flow")
→ { path: "diagrams/Auth_Flow.archd", ... }

a = add_node(path=..., label="Client",       shape="rectangle")
b = add_node(path=..., label="Auth Service", shape="cylinder")
c = add_node(path=..., label="Database",     shape="cylinder", fill="#e8f4fd")
add_edge(path=..., source_id=a.node_id, target_id=b.node_id, label="login request")
add_edge(path=..., source_id=b.node_id, target_id=c.node_id, label="query user")
apply_layout(path=..., direction="LR")
```

Open the resulting `.archd` file in the editor to see the diagram.
