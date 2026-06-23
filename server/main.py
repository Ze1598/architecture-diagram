# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "mcp[cli]>=1.0.0",
#   "fastapi>=0.110.0",
#   "uvicorn[standard]>=0.27.0",
#   "pydantic>=2.0.0",
# ]
# ///

"""archd MCP server — exposes diagram tools via Model Context Protocol (stdio)
and optionally an HTTP REST bridge for browser integration.

Usage
-----
MCP mode (for Claude Desktop / Claude Code):
    python server/main.py

HTTP bridge mode (for the browser "Connect to bridge" feature):
    python server/main.py --http [--port 7474] [--work-dir ./diagrams]

Run both at once (HTTP in background thread):
    python server/main.py --both [--port 7474]
"""

from __future__ import annotations

import argparse
import json
import threading
from pathlib import Path
from typing import Any, Dict, Optional

# ---- FastMCP (MCP Python SDK >= 1.0) ----
from mcp.server.fastmcp import FastMCP

# ---- FastAPI (HTTP bridge) ----
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from diagram import DiagramModel, SHAPE_NAME_MAP

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

_diagrams: Dict[str, DiagramModel] = {}
_work_dir = Path(__file__).parent / "diagrams"

# Current diagram tracked for the browser bridge
_current_path: Optional[str] = None


def _ensure(path: str) -> DiagramModel:
    if path not in _diagrams:
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"Diagram not found: {path}")
        _diagrams[path] = DiagramModel.load(path)
    return _diagrams[path]


def _save(path: str) -> None:
    global _current_path
    _diagrams[path].save(path)
    _current_path = path


# ---------------------------------------------------------------------------
# MCP server (stdio)
# ---------------------------------------------------------------------------

mcp = FastMCP("archd-diagram")


@mcp.tool()
def create_diagram(name: str, path: Optional[str] = None) -> Dict[str, Any]:
    """Create a new, empty architecture diagram and save it as a .archd file.

    Returns the file path and document id so subsequent tools can reference it.
    """
    global _current_path
    _work_dir.mkdir(parents=True, exist_ok=True)
    out = path or str(_work_dir / (name.replace(" ", "_") + ".archd"))
    model = DiagramModel(name)
    _diagrams[out] = model
    _save(out)
    return {"path": out, "name": name, "document_id": model._doc_id}


@mcp.tool()
def get_diagram(path: str) -> Dict[str, Any]:
    """Return a summary of all nodes and edges in the diagram at *path*.

    Each node includes its id, type alias, label, and position.
    """
    model = _ensure(path)
    return {
        "path": path,
        "name": model.name,
        "nodes": [
            {
                "id": e["id"],
                "type": e["type"],
                "label": e.get("attrs", {}).get("label", {}).get("text", ""),
                "x": e["position"]["x"],
                "y": e["position"]["y"],
            }
            for e in model.elements()
        ],
        "edges": [
            {
                "id": lnk["id"],
                "source": lnk["source"]["id"],
                "target": lnk["target"]["id"],
                "label": (
                    lnk["labels"][0].get("attrs", {}).get("text", {}).get("text", "")
                    if lnk.get("labels") else ""
                ),
            }
            for lnk in model.links()
        ],
    }


@mcp.tool()
def list_elements(path: str) -> Dict[str, Any]:
    """List all nodes and edges with their IDs — useful before add_edge or update_node."""
    return get_diagram(path)


@mcp.tool()
def add_node(
    path: str,
    label: str,
    shape: str = "rectangle",
    x: Optional[float] = None,
    y: Optional[float] = None,
    fill: Optional[str] = None,
    stroke: Optional[str] = None,
) -> Dict[str, Any]:
    """Add a shape node to the diagram.

    shape options: rectangle, rounded, ellipse, diamond, cylinder, cloud,
                   hexagon, parallelogram, actor, sticky, text.
    Omit x/y to let auto-layout position the node later.
    Returns the new node_id which is required by add_edge.
    """
    model = _ensure(path)
    node_type = SHAPE_NAME_MAP.get(shape, "archd.Rectangle")
    node_id = model.add_node(
        node_type=node_type, label=label, x=x, y=y, fill=fill, stroke=stroke
    )
    _save(path)
    return {"node_id": node_id, "type": node_type, "label": label}


@mcp.tool()
def add_edge(
    path: str,
    source_id: str,
    target_id: str,
    label: str = "",
    directed: bool = True,
    dashed: bool = False,
) -> Dict[str, Any]:
    """Connect two nodes with a directed or undirected edge.

    Use directed=True for dependency/flow arrows, directed=False for association lines.
    Use dashed=True for weak/optional relationships.
    """
    model = _ensure(path)
    edge_id = model.add_edge(source_id, target_id, label=label, directed=directed, dashed=dashed)
    _save(path)
    return {"edge_id": edge_id, "source": source_id, "target": target_id}


@mcp.tool()
def update_node(
    path: str,
    node_id: str,
    label: Optional[str] = None,
    x: Optional[float] = None,
    y: Optional[float] = None,
    fill: Optional[str] = None,
    stroke: Optional[str] = None,
) -> Dict[str, Any]:
    """Update a node's label, position, or colours. Only supplied fields are changed."""
    model = _ensure(path)
    ok = model.update_node(node_id, label=label, x=x, y=y, fill=fill, stroke=stroke)
    if not ok:
        raise ValueError(f"Node not found: {node_id}")
    _save(path)
    return {"updated": node_id}


@mcp.tool()
def delete_element(path: str, element_id: str) -> Dict[str, Any]:
    """Delete a node or edge. Deleting a node also removes its connected edges."""
    model = _ensure(path)
    ok = model.delete_element(element_id)
    if not ok:
        raise ValueError(f"Element not found: {element_id}")
    _save(path)
    return {"deleted": element_id}


@mcp.tool()
def apply_layout(path: str, direction: str = "TB") -> Dict[str, Any]:
    """Auto-layout the diagram using a hierarchical algorithm.

    direction: TB (top→bottom), BT (bottom→top), LR (left→right), RL (right→left).
    Positions are written back to the file — open the file in the app to see the result.
    """
    if direction not in ("TB", "BT", "LR", "RL"):
        raise ValueError("direction must be TB, BT, LR, or RL")
    model = _ensure(path)
    model.apply_layout(direction=direction)
    _save(path)
    return {"status": "layout applied", "direction": direction, "path": path}


@mcp.tool()
def export_diagram(path: str, format: str = "mermaid") -> Dict[str, Any]:
    """Export the diagram topology.

    Currently supports format='mermaid' (lossy: preserves topology and labels only).
    Returns the Mermaid source as a string.
    """
    if format != "mermaid":
        raise ValueError("Only 'mermaid' export is currently supported")
    model = _ensure(path)
    return {"format": "mermaid", "content": model.to_mermaid()}


# ---------------------------------------------------------------------------
# HTTP bridge (FastAPI) — optional, for browser "Connect to bridge" feature
# ---------------------------------------------------------------------------

http_app = FastAPI(
    title="archd HTTP Bridge",
    description="REST wrapper around the MCP tools for browser integration.",
)
http_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class NodeBody(BaseModel):
    label: str = ""
    shape: str = "rectangle"
    x: Optional[float] = None
    y: Optional[float] = None
    fill: Optional[str] = None
    stroke: Optional[str] = None


class EdgeBody(BaseModel):
    source_id: str
    target_id: str
    label: str = ""
    directed: bool = True
    dashed: bool = False


class LayoutBody(BaseModel):
    direction: str = "TB"


@http_app.get("/")
async def bridge_info():
    return {"service": "archd HTTP bridge", "version": "1.0", "current": _current_path}


@http_app.get("/current")
async def get_current():
    """Returns the most recently written diagram (for the browser polling loop)."""
    if not _current_path:
        raise HTTPException(404, "No diagram written yet")
    model = _ensure(_current_path)
    return model.to_envelope()


@http_app.get("/diagram/{rest_path:path}")
async def http_get(rest_path: str):
    path = "/" + rest_path
    try:
        model = _ensure(path)
    except FileNotFoundError:
        raise HTTPException(404, f"Not found: {path}")
    return model.to_envelope()


@http_app.post("/diagram")
async def http_create(body: Dict[str, Any]):
    name = body.get("name", "Untitled")
    result = create_diagram(name=name, path=body.get("path"))
    return result


@http_app.post("/diagram/{rest_path:path}/node")
async def http_add_node(rest_path: str, body: NodeBody):
    path = "/" + rest_path
    try:
        _ensure(path)
    except FileNotFoundError:
        raise HTTPException(404, f"Not found: {path}")
    return add_node(
        path=path, label=body.label, shape=body.shape,
        x=body.x, y=body.y, fill=body.fill, stroke=body.stroke,
    )


@http_app.post("/diagram/{rest_path:path}/edge")
async def http_add_edge(rest_path: str, body: EdgeBody):
    path = "/" + rest_path
    return add_edge(
        path=path, source_id=body.source_id, target_id=body.target_id,
        label=body.label, directed=body.directed, dashed=body.dashed,
    )


@http_app.post("/diagram/{rest_path:path}/layout")
async def http_layout(rest_path: str, body: LayoutBody = LayoutBody()):
    path = "/" + rest_path
    return apply_layout(path=path, direction=body.direction)


@http_app.delete("/diagram/{rest_path:path}/element/{element_id}")
async def http_delete(rest_path: str, element_id: str):
    path = "/" + rest_path
    return delete_element(path=path, element_id=element_id)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _run_http(port: int) -> None:
    """Run uvicorn in its own asyncio event loop (for background thread use)."""
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    config = uvicorn.Config(http_app, host="127.0.0.1", port=port, log_level="warning", loop="none")
    server = uvicorn.Server(config)
    loop.run_until_complete(server.serve())


def main() -> None:
    parser = argparse.ArgumentParser(description="archd diagram server")
    parser.add_argument("--http",  action="store_true", help="Run HTTP bridge instead of MCP stdio")
    parser.add_argument("--both",  action="store_true", help="Run MCP stdio + HTTP bridge together")
    parser.add_argument("--port",  type=int, default=7474, help="HTTP bridge port (default 7474)")
    parser.add_argument("--work-dir", default=None, help="Directory for saved diagrams")
    args = parser.parse_args()

    global _work_dir
    if args.work_dir:
        _work_dir = Path(args.work_dir)
        _work_dir.mkdir(parents=True, exist_ok=True)

    if args.http:
        print(f"archd HTTP bridge → http://127.0.0.1:{args.port}")
        uvicorn.run(http_app, host="127.0.0.1", port=args.port)
    elif args.both:
        t = threading.Thread(target=_run_http, args=(args.port,), daemon=True)
        t.start()
        print(f"archd HTTP bridge → http://127.0.0.1:{args.port} (background)", flush=True)
        mcp.run()
    else:
        mcp.run()


if __name__ == "__main__":
    main()
