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
import base64
import io
import json
import threading
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

# ---- FastMCP (MCP Python SDK >= 1.0) ----
from mcp.server.fastmcp import FastMCP

# ---- FastAPI (HTTP bridge) ----
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
def set_diagram(
    path: str,
    nodes: list,
    edges: list,
    auto_layout: Optional[str] = "TB",
) -> Dict[str, Any]:
    """Replace a diagram's content atomically with a full node+edge spec.

    Clears the existing diagram, inserts all nodes and edges, optionally
    runs auto-layout, then saves.  Ideal for bulk one-shot diagram creation.

    Each node: {"id": str, "label": str, "shape"?: str, "x"?: float, "y"?: float,
                 "fill"?: str, "stroke"?: str}
    Each edge: {"source_id": str, "target_id": str, "label"?: str,
                 "directed"?: bool, "dashed"?: bool}
    auto_layout: "TB" | "LR" | "BT" | "RL" | null (skip layout)
    """
    global _current_path
    _work_dir.mkdir(parents=True, exist_ok=True)
    model_name = Path(path).stem.replace("_", " ")
    model = DiagramModel(model_name)
    _diagrams[path] = model

    id_map: Dict[str, str] = {}
    for node_spec in nodes:
        caller_id = node_spec.get("id", "")
        shape_alias = node_spec.get("shape", "rectangle")
        node_type = SHAPE_NAME_MAP.get(shape_alias, "archd.Rectangle")
        real_id = model.add_node(
            node_type=node_type,
            label=node_spec.get("label", ""),
            x=node_spec.get("x"),
            y=node_spec.get("y"),
            fill=node_spec.get("fill"),
            stroke=node_spec.get("stroke"),
        )
        if caller_id:
            id_map[caller_id] = real_id

    for edge_spec in edges:
        src = id_map.get(edge_spec["source_id"], edge_spec["source_id"])
        tgt = id_map.get(edge_spec["target_id"], edge_spec["target_id"])
        model.add_edge(
            src, tgt,
            label=edge_spec.get("label", ""),
            directed=edge_spec.get("directed", True),
            dashed=edge_spec.get("dashed", False),
        )

    if auto_layout and auto_layout in ("TB", "BT", "LR", "RL"):
        model.apply_layout(direction=auto_layout)

    _save(path)
    return {
        "path": path,
        "nodes": len(nodes),
        "edges": len(edges),
        "layout": auto_layout or "none",
        "id_map": id_map,
    }


@mcp.tool()
def export_diagram(
    path: str,
    format: str = "mermaid",
    output_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Export the diagram in the requested format.

    format options:
      'mermaid' — Mermaid source string (topology + labels).
      'svg'     — Basic SVG (shapes, positions, edges, labels).
      'archd'   — Full .archd JSON; round-trip safe for opening on another machine.
      'png'     — PNG image rendered at 2× scale.

    output_path (optional): write the result to this file and return its path.
      If omitted, content is returned inline (base64 for PNG, string for others).
      Recommended for PNG to avoid large base64 payloads in the conversation.
    """
    model = _ensure(path)

    if format == "mermaid":
        content = model.to_mermaid()
        if output_path:
            Path(output_path).write_text(content, encoding="utf-8")
            return {"format": "mermaid", "output_path": str(output_path)}
        return {"format": "mermaid", "content": content}

    if format == "svg":
        content = model.to_svg()
        if output_path:
            out = output_path if output_path.endswith(".svg") else output_path + ".svg"
            Path(out).write_text(content, encoding="utf-8")
            return {"format": "svg", "output_path": out}
        return {"format": "svg", "content": content}

    if format == "archd":
        content = json.dumps(model.to_envelope(), indent=2)
        if output_path:
            out = output_path if output_path.endswith(".archd") else output_path + ".archd"
            Path(out).write_text(content, encoding="utf-8")
            return {"format": "archd", "output_path": out}
        return {"format": "archd", "content": content}

    if format == "png":
        svg_str = model.to_svg()
        try:
            import cairosvg
        except ImportError:
            raise ValueError(
                "PNG export requires cairosvg and the Cairo system library.\n"
                "On macOS: brew install cairo && uv add cairosvg"
            )
        png_bytes = cairosvg.svg2png(bytestring=svg_str.encode("utf-8"), scale=2)
        if output_path:
            out = output_path if output_path.endswith(".png") else output_path + ".png"
            Path(out).write_bytes(png_bytes)
            return {"format": "png", "output_path": out}
        return {
            "format": "png",
            "content_base64": base64.b64encode(png_bytes).decode(),
            "size_bytes": len(png_bytes),
        }

    raise ValueError("Supported formats: 'mermaid', 'svg', 'archd', 'png'")


@mcp.tool()
def list_custom_shapes() -> List[Dict[str, Any]]:
    """List all custom shapes stored in server/shapes/.

    Returns each shape's filename, MIME type, and a base64-encoded data URI
    so the LLM can reference them in add_node calls.
    """
    shapes_dir = Path(__file__).parent / "shapes"
    shapes_dir.mkdir(parents=True, exist_ok=True)
    allowed_suffixes = {".svg", ".png", ".jpg", ".jpeg"}
    result = []
    for p in sorted(shapes_dir.iterdir()):
        if p.suffix.lower() not in allowed_suffixes:
            continue
        data = p.read_bytes()
        mime = {
            ".svg":  "image/svg+xml",
            ".png":  "image/png",
            ".jpg":  "image/jpeg",
            ".jpeg": "image/jpeg",
        }.get(p.suffix.lower(), "application/octet-stream")
        data_uri = f"data:{mime};base64,{base64.b64encode(data).decode()}"
        result.append({"filename": p.name, "mime": mime, "data_uri": data_uri})
    return result


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


# ---- Shapes endpoints ----

_ALLOWED_SHAPE_SUFFIXES = {".svg", ".png", ".jpg", ".jpeg"}


def _shapes_dirs():
    server_shapes = Path(__file__).parent / "shapes"
    project_shapes = Path(__file__).parent.parent / "custom_shapes"
    server_shapes.mkdir(parents=True, exist_ok=True)
    project_shapes.mkdir(parents=True, exist_ok=True)
    return server_shapes, project_shapes


@http_app.post("/shapes/upload")
async def http_upload_shapes(file: UploadFile = File(...)):
    """Accept a ZIP file, extract accepted image types, write to both shapes dirs."""
    server_dir, project_dir = _shapes_dirs()
    content = await file.read()
    accepted: List[str] = []
    skipped: List[str] = []

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            for name in zf.namelist():
                p = Path(name)
                if p.suffix.lower() not in _ALLOWED_SHAPE_SUFFIXES:
                    skipped.append(name)
                    continue
                data = zf.read(name)
                safe_name = p.name
                (server_dir  / safe_name).write_bytes(data)
                (project_dir / safe_name).write_bytes(data)
                accepted.append(safe_name)
    except zipfile.BadZipFile as e:
        raise HTTPException(400, f"Invalid ZIP file: {e}")

    return {"accepted": len(accepted), "files": accepted, "skipped": skipped}


@http_app.get("/shapes")
async def http_list_shapes():
    server_dir, _ = _shapes_dirs()
    shapes = []
    for p in sorted(server_dir.iterdir()):
        if p.suffix.lower() in _ALLOWED_SHAPE_SUFFIXES:
            shapes.append({"filename": p.name, "size": p.stat().st_size})
    return shapes


@http_app.get("/shapes/{filename}")
async def http_get_shape(filename: str):
    server_dir, _ = _shapes_dirs()
    p = server_dir / filename
    if not p.exists() or p.suffix.lower() not in _ALLOWED_SHAPE_SUFFIXES:
        raise HTTPException(404, f"Shape not found: {filename}")
    mime_map = {".svg": "image/svg+xml", ".png": "image/png",
                ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
    return FileResponse(str(p), media_type=mime_map.get(p.suffix.lower(), "application/octet-stream"))


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
