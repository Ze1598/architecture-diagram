"""DiagramModel — in-memory representation of a .archd file."""

from __future__ import annotations

import json
import math
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

SCHEMA_VERSION = "1.0"

_SHAPE_DEFAULTS: Dict[str, Dict[str, float]] = {
    "archd.Rectangle":     {"width": 120, "height": 60},
    "archd.RoundedRect":   {"width": 120, "height": 60},
    "archd.Ellipse":       {"width": 120, "height": 70},
    "archd.Diamond":       {"width": 120, "height": 80},
    "archd.Cylinder":      {"width": 100, "height": 80},
    "archd.Cloud":         {"width": 140, "height": 90},
    "archd.Hexagon":       {"width": 120, "height": 80},
    "archd.Parallelogram": {"width": 130, "height": 60},
    "archd.Actor":         {"width": 60,  "height": 100},
    "archd.StickyNote":    {"width": 110, "height": 90},
    "archd.TextLabel":     {"width": 100, "height": 30},
}

_PORT_GROUPS = {
    "groups": {
        "cardinal": {
            "position": "absolute",
            "attrs": {
                "circle": {
                    "r": 6, "magnet": True,
                    "stroke": "#4a7cf6", "fill": "#ffffff",
                    "strokeWidth": 1.5, "cursor": "crosshair"
                }
            }
        }
    },
    "items": [
        {"group": "cardinal", "args": {"x": "50%",  "y": "0%"},   "id": "top"},
        {"group": "cardinal", "args": {"x": "100%", "y": "50%"},  "id": "right"},
        {"group": "cardinal", "args": {"x": "50%",  "y": "100%"}, "id": "bottom"},
        {"group": "cardinal", "args": {"x": "0%",   "y": "50%"},  "id": "left"},
    ]
}

SHAPE_NAME_MAP: Dict[str, str] = {
    "rectangle":     "archd.Rectangle",
    "rounded":       "archd.RoundedRect",
    "ellipse":       "archd.Ellipse",
    "diamond":       "archd.Diamond",
    "cylinder":      "archd.Cylinder",
    "cloud":         "archd.Cloud",
    "hexagon":       "archd.Hexagon",
    "parallelogram": "archd.Parallelogram",
    "actor":         "archd.Actor",
    "sticky":        "archd.StickyNote",
    "text":          "archd.TextLabel",
}


def _uid() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _esc(text: str) -> str:
    return (text.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace('"', "&quot;"))


def _boundary_point(
    ex: float, ey: float, ew: float, eh: float,
    toward_x: float, toward_y: float,
) -> tuple[float, float]:
    """Return where a ray from the bbox center toward (toward_x, toward_y) exits the bbox."""
    cx, cy = ex + ew / 2, ey + eh / 2
    dx, dy = toward_x - cx, toward_y - cy
    if dx == 0 and dy == 0:
        return cx, cy
    ts = []
    if dx != 0:
        ts.append(((ex if dx < 0 else ex + ew) - cx) / dx)
    if dy != 0:
        ts.append(((ey if dy < 0 else ey + eh) - cy) / dy)
    t = min((t for t in ts if t >= 0), default=0.0)
    return cx + t * dx, cy + t * dy


def _shape_svg(shape_type: str, x: float, y: float, w: float, h: float,
               fill: str, stroke: str, sw: float) -> str:
    cx, cy = x + w / 2, y + h / 2
    base = f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"'

    if shape_type == "archd.RoundedRect":
        return f'  <rect x="{x:.1f}" y="{y:.1f}" width="{w:.0f}" height="{h:.0f}" rx="8" {base}/>'

    if shape_type == "archd.Ellipse":
        return f'  <ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{w/2:.1f}" ry="{h/2:.1f}" {base}/>'

    if shape_type == "archd.Diamond":
        pts = f"{cx:.1f},{y:.1f} {x+w:.1f},{cy:.1f} {cx:.1f},{y+h:.1f} {x:.1f},{cy:.1f}"
        return f'  <polygon points="{pts}" {base}/>'

    if shape_type == "archd.Cylinder":
        ry = h * 0.12
        path = (f"M {x:.1f},{y+ry:.1f} Q {x:.1f},{y:.1f} {cx:.1f},{y:.1f} "
                f"Q {x+w:.1f},{y:.1f} {x+w:.1f},{y+ry:.1f} "
                f"L {x+w:.1f},{y+h-ry:.1f} "
                f"Q {x+w:.1f},{y+h:.1f} {cx:.1f},{y+h:.1f} "
                f"Q {x:.1f},{y+h:.1f} {x:.1f},{y+h-ry:.1f} Z")
        cap = f'  <ellipse cx="{cx:.1f}" cy="{y+ry:.1f}" rx="{w/2:.1f}" ry="{ry:.1f}" {base}/>'
        return f'  <path d="{path}" {base}/>\n{cap}'

    if shape_type == "archd.Hexagon":
        dx = w / 4
        pts = (f"{x+dx:.1f},{y:.1f} {x+w-dx:.1f},{y:.1f} "
               f"{x+w:.1f},{cy:.1f} {x+w-dx:.1f},{y+h:.1f} "
               f"{x+dx:.1f},{y+h:.1f} {x:.1f},{cy:.1f}")
        return f'  <polygon points="{pts}" {base}/>'

    if shape_type == "archd.Parallelogram":
        sk = w * 0.15
        pts = (f"{x+sk:.1f},{y:.1f} {x+w:.1f},{y:.1f} "
               f"{x+w-sk:.1f},{y+h:.1f} {x:.1f},{y+h:.1f}")
        return f'  <polygon points="{pts}" {base}/>'

    if shape_type == "archd.StickyNote":
        cr = min(w, h) * 0.15
        body = (f"{x:.1f},{y:.1f} {x+w-cr:.1f},{y:.1f} "
                f"{x+w:.1f},{y+cr:.1f} {x+w:.1f},{y+h:.1f} {x:.1f},{y+h:.1f}")
        fold = f"M {x+w-cr:.1f},{y:.1f} L {x+w-cr:.1f},{y+cr:.1f} L {x+w:.1f},{y+cr:.1f}"
        return (f'  <polygon points="{body}" {base}/>\n'
                f'  <path d="{fold}" fill="none" stroke="{stroke}" stroke-width="{sw}"/>')

    if shape_type == "archd.Actor":
        hr = w * 0.2
        head_cy = y + hr
        body_top = y + hr * 2.2
        body_bot = y + h * 0.65
        arm_y = body_top + (body_bot - body_top) * 0.3
        return (f'  <circle cx="{cx:.1f}" cy="{head_cy:.1f}" r="{hr:.1f}" {base}/>\n'
                f'  <line x1="{cx:.1f}" y1="{body_top:.1f}" x2="{cx:.1f}" y2="{body_bot:.1f}" '
                f'stroke="{stroke}" stroke-width="{sw}"/>\n'
                f'  <line x1="{x:.1f}" y1="{arm_y:.1f}" x2="{x+w:.1f}" y2="{arm_y:.1f}" '
                f'stroke="{stroke}" stroke-width="{sw}"/>\n'
                f'  <line x1="{cx:.1f}" y1="{body_bot:.1f}" x2="{x:.1f}" y2="{y+h:.1f}" '
                f'stroke="{stroke}" stroke-width="{sw}"/>\n'
                f'  <line x1="{cx:.1f}" y1="{body_bot:.1f}" x2="{x+w:.1f}" y2="{y+h:.1f}" '
                f'stroke="{stroke}" stroke-width="{sw}"/>')

    if shape_type == "archd.Cloud":
        return f'  <rect x="{x:.1f}" y="{y:.1f}" width="{w:.0f}" height="{h:.0f}" rx="{h/2:.1f}" {base}/>'

    # fallback: rect (Rectangle, TextLabel, ImageShape, etc.)
    return f'  <rect x="{x:.1f}" y="{y:.1f}" width="{w:.0f}" height="{h:.0f}" {base}/>'


class DiagramModel:
    def __init__(self, name: str = "Untitled") -> None:
        self.name = name
        self._doc_id = _uid()
        self._created_at = _now()
        self.cells: List[Dict[str, Any]] = []
        self._export_svg: Optional[str] = None  # browser-rendered SVG, embedded on save

    # ---- Queries ----

    def elements(self) -> List[Dict]:
        return [c for c in self.cells if "Link" not in c.get("type", "")]

    def links(self) -> List[Dict]:
        return [c for c in self.cells if "Link" in c.get("type", "")]

    def find(self, cell_id: str) -> Optional[Dict]:
        return next((c for c in self.cells if c["id"] == cell_id), None)

    def _invalidate_svg(self) -> None:
        self._export_svg = None

    # ---- Mutations ----

    def add_node(
        self,
        node_type: str = "archd.Rectangle",
        label: str = "",
        x: Optional[float] = None,
        y: Optional[float] = None,
        width: Optional[float] = None,
        height: Optional[float] = None,
        fill: Optional[str] = None,
        stroke: Optional[str] = None,
    ) -> str:
        self._invalidate_svg()
        size = _SHAPE_DEFAULTS.get(node_type, {"width": 120, "height": 60})
        w = width  if width  is not None else size["width"]
        h = height if height is not None else size["height"]
        px = x if x is not None else 100.0
        py = y if y is not None else 100.0

        cell: Dict[str, Any] = {
            "type": node_type,
            "id": _uid(),
            "position": {"x": px, "y": py},
            "size": {"width": w, "height": h},
            "angle": 0,
            "ports": _PORT_GROUPS,
            "attrs": {
                "body": {
                    "fill": fill or "#ffffff",
                    "stroke": stroke or "#333333",
                    "strokeWidth": 1.5,
                },
                "label": {
                    "text": label,
                    "fill": "#333333",
                    "fontSize": 13,
                },
            },
            "z": len(self.cells) + 1,
        }
        self.cells.append(cell)
        return cell["id"]

    def add_edge(
        self,
        source_id: str,
        target_id: str,
        label: str = "",
        directed: bool = True,
        dashed: bool = False,
    ) -> str:
        self._invalidate_svg()
        target_marker: Dict[str, Any] = (
            {"type": "path", "d": "M 10 -5 0 0 10 5 z", "fill": "inherit", "stroke": "none"}
            if directed
            else {"type": "path", "d": "", "fill": "none", "stroke": "none"}
        )
        link: Dict[str, Any] = {
            "type": "standard.Link",
            "id": _uid(),
            "source": {"id": source_id},
            "target": {"id": target_id},
            "router": {"name": "orthogonal", "args": {"padding": 20}},
            "connector": {"name": "rounded", "args": {"radius": 6}},
            "attrs": {
                "line": {
                    "stroke": "#333333",
                    "strokeWidth": 1.5,
                    "strokeDasharray": "4 4" if dashed else "",
                    "targetMarker": target_marker,
                    "sourceMarker": {"type": "path", "d": "", "fill": "none", "stroke": "none"},
                }
            },
            "labels": (
                [{"attrs": {"text": {"text": label, "fontSize": 11, "fill": "#333333"}},
                  "position": {"distance": 0.5}}]
                if label else []
            ),
            "z": len(self.cells) + 1,
        }
        self.cells.append(link)
        return link["id"]

    def update_node(
        self,
        node_id: str,
        label: Optional[str] = None,
        x: Optional[float] = None,
        y: Optional[float] = None,
        width: Optional[float] = None,
        height: Optional[float] = None,
        fill: Optional[str] = None,
        stroke: Optional[str] = None,
    ) -> bool:
        self._invalidate_svg()
        cell = self.find(node_id)
        if cell is None:
            return False
        if label is not None:
            cell.setdefault("attrs", {}).setdefault("label", {})["text"] = label
        if x is not None:
            cell["position"]["x"] = x
        if y is not None:
            cell["position"]["y"] = y
        if width is not None:
            cell["size"]["width"] = width
        if height is not None:
            cell["size"]["height"] = height
        if fill is not None:
            cell.setdefault("attrs", {}).setdefault("body", {})["fill"] = fill
        if stroke is not None:
            cell.setdefault("attrs", {}).setdefault("body", {})["stroke"] = stroke
        return True

    def delete_element(self, element_id: str) -> bool:
        self._invalidate_svg()
        before = len(self.cells)
        self.cells = [
            c for c in self.cells
            if c["id"] != element_id
            and c.get("source", {}).get("id") != element_id
            and c.get("target", {}).get("id") != element_id
        ]
        return len(self.cells) < before

    # ---- Layout ----

    def apply_layout(self, direction: str = "TB", ranksep: int = 80, nodesep: int = 50) -> None:
        """Hierarchical layout via topological sort (no external deps)."""
        self._invalidate_svg()
        els = self.elements()
        lnks = self.links()
        if not els:
            return

        el_ids = {e["id"] for e in els}
        out_edges: Dict[str, List[str]] = defaultdict(list)
        in_degree: Dict[str, int] = {e["id"]: 0 for e in els}

        for lnk in lnks:
            src = lnk.get("source", {}).get("id", "")
            tgt = lnk.get("target", {}).get("id", "")
            if src in el_ids and tgt in el_ids:
                out_edges[src].append(tgt)
                in_degree[tgt] += 1

        # Kahn's algorithm with layer tracking
        layer: Dict[str, int] = {}
        roots = deque(nid for nid in el_ids if in_degree[nid] == 0)
        for nid in roots:
            layer[nid] = 0

        visited: set = set(roots)
        queue = deque(roots)
        while queue:
            nid = queue.popleft()
            for nb in out_edges[nid]:
                in_degree[nb] -= 1
                layer[nb] = max(layer.get(nb, 0), layer[nid] + 1)
                if in_degree[nb] == 0 and nb not in visited:
                    visited.add(nb)
                    queue.append(nb)

        # Disconnected / cyclic nodes go to a grid after the last layer
        next_layer = (max(layer.values()) + 1) if layer else 0
        for nid in el_ids:
            if nid not in layer:
                layer[nid] = next_layer
                next_layer += 1

        # Group nodes by layer
        layer_nodes: Dict[int, List[str]] = defaultdict(list)
        for nid, lyr in layer.items():
            layer_nodes[lyr].append(nid)

        id_to_el = {e["id"]: e for e in els}

        if direction in ("TB", "BT"):
            y = 60.0
            for lyr_idx in sorted(layer_nodes):
                nodes = layer_nodes[lyr_idx]
                total_w = sum(id_to_el[n]["size"]["width"] for n in nodes)
                gaps = nodesep * (len(nodes) - 1)
                cx = 500.0 - (total_w + gaps) / 2
                max_h = max(id_to_el[n]["size"]["height"] for n in nodes)
                for nid in nodes:
                    el = id_to_el[nid]
                    el["position"]["x"] = round(cx / 10) * 10
                    el["position"]["y"] = round(y / 10) * 10
                    cx += el["size"]["width"] + nodesep
                y += max_h + ranksep
        else:  # LR / RL
            x = 60.0
            for lyr_idx in sorted(layer_nodes):
                nodes = layer_nodes[lyr_idx]
                total_h = sum(id_to_el[n]["size"]["height"] for n in nodes)
                gaps = nodesep * (len(nodes) - 1)
                cy = 300.0 - (total_h + gaps) / 2
                max_w = max(id_to_el[n]["size"]["width"] for n in nodes)
                for nid in nodes:
                    el = id_to_el[nid]
                    el["position"]["x"] = round(x / 10) * 10
                    el["position"]["y"] = round(cy / 10) * 10
                    cy += el["size"]["height"] + nodesep
                x += max_w + ranksep

    # ---- Serialization ----

    def to_envelope(self) -> Dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "document": {
                "id": self._doc_id,
                "name": self.name,
                "createdAt": self._created_at,
                "modifiedAt": _now(),
            },
            "assets": [],
            "graph": {"cells": self.cells},
        }

    def save(self, path: str) -> None:
        Path(path).write_text(json.dumps(self.to_envelope(), indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: str) -> "DiagramModel":
        envelope = json.loads(Path(path).read_text(encoding="utf-8"))
        doc = envelope.get("document", {})
        model = cls(doc.get("name", "Untitled"))
        model._doc_id = doc.get("id", _uid())
        model._created_at = doc.get("createdAt", _now())
        model.cells = envelope.get("graph", {}).get("cells", [])
        model._export_svg = envelope.get("exportSvg")
        return model

    # ---- Mermaid export ----

    def to_mermaid(self) -> str:
        _SHAPE_WRAP = {
            "archd.Rectangle":     ('["', '"]'),
            "archd.RoundedRect":   ('(["', '"])'),
            "archd.Ellipse":       ('(("', '"))'),
            "archd.Diamond":       ('{"', '"}'),
            "archd.Cylinder":      ('[("', '")]'),
            "archd.Cloud":         ('("', '")'),
            "archd.Hexagon":       ('{{"', '"}}'),
            "archd.Parallelogram": ('[/"', '"/]'),
            "archd.Actor":         ('(["', '"])'),
            "archd.StickyNote":    ('["', '"]'),
        }
        els = [e for e in self.elements() if e["type"] not in ("archd.TextLabel", "archd.ImageShape")]
        if not els:
            return "flowchart TD\n  %% empty"

        id_map = {e["id"]: f"node{i}" for i, e in enumerate(els)}
        lines = ["flowchart TD"]
        for el in els:
            nid = id_map[el["id"]]
            txt = el.get("attrs", {}).get("label", {}).get("text", "").replace('"', "'")
            wrap = _SHAPE_WRAP.get(el["type"], ('["', '"]'))
            lines.append(f"  {nid}{wrap[0]}{txt}{wrap[1]}")

        for lnk in self.links():
            src = id_map.get(lnk.get("source", {}).get("id", ""))
            tgt = id_map.get(lnk.get("target", {}).get("id", ""))
            if not src or not tgt:
                continue
            lbl = ""
            if lnk.get("labels"):
                lbl = lnk["labels"][0].get("attrs", {}).get("text", {}).get("text", "")
            target_d = lnk.get("attrs", {}).get("line", {}).get("targetMarker", {}).get("d", "")
            dashed = bool(lnk.get("attrs", {}).get("line", {}).get("strokeDasharray", "").strip())
            arrow = ("-.->" if target_d else "-.-") if dashed else ("-->" if target_d else "---")
            if lbl:
                lines.append(f'  {src} {arrow}|"{lbl}"| {tgt}')
            else:
                lines.append(f"  {src} {arrow} {tgt}")

        return "\n".join(lines)

    # ---- SVG export ----

    def to_svg(self) -> str:
        """Return SVG for the diagram.

        Uses the browser-rendered SVG embedded on last save when available.
        Falls back to a server-generated approximation otherwise.
        """
        if self._export_svg:
            return self._export_svg
        els  = [e for e in self.elements() if e["type"] != "archd.ImageShape"]
        lnks = self.links()

        pad = 40
        if els:
            xs = [e["position"]["x"] for e in els]
            ys = [e["position"]["y"] for e in els]
            xe = [e["position"]["x"] + e["size"]["width"] for e in els]
            ye = [e["position"]["y"] + e["size"]["height"] for e in els]
            ox = pad - min(xs)
            oy = pad - min(ys)
            svg_w = max(xe) - min(xs) + pad * 2
            svg_h = max(ye) - min(ys) + pad * 2
        else:
            ox, oy, svg_w, svg_h = pad, pad, 200, 100

        parts: List[str] = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{svg_w:.0f}" height="{svg_h:.0f}" '
            f'viewBox="0 0 {svg_w:.0f} {svg_h:.0f}">',
            "<defs>",
            '  <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">',
            '    <path d="M0,0 L0,6 L7,3 z" fill="#333"/>',
            "  </marker>",
            "</defs>",
        ]

        for el in els:
            ex = el["position"]["x"] + ox
            ey = el["position"]["y"] + oy
            ew = el["size"]["width"]
            eh = el["size"]["height"]
            body      = el.get("attrs", {}).get("body", {})
            lbl_attrs = el.get("attrs", {}).get("label", {})
            fill      = body.get("fill", "#ffffff")
            stroke    = body.get("stroke", "#333333")
            sw        = body.get("strokeWidth", 1.5)
            label     = lbl_attrs.get("text", "")
            lbl_fill  = lbl_attrs.get("fill", "#333333")
            font_size = lbl_attrs.get("fontSize", 13)

            parts.append(_shape_svg(el["type"], ex, ey, ew, eh, fill, stroke, sw))
            if label:
                lcx = ex + ew / 2
                lcy = ey + eh / 2 + font_size * 0.35
                parts.append(
                    f'  <text x="{lcx:.1f}" y="{lcy:.1f}" text-anchor="middle" '
                    f'font-family="system-ui,sans-serif" font-size="{font_size}" fill="{lbl_fill}">'
                    f"{_esc(label)}</text>"
                )

        el_map = {e["id"]: e for e in els}
        for lnk in lnks:
            src_el = el_map.get(lnk.get("source", {}).get("id", ""))
            tgt_el = el_map.get(lnk.get("target", {}).get("id", ""))
            if not src_el or not tgt_el:
                continue

            s_cx = src_el["position"]["x"] + ox + src_el["size"]["width"] / 2
            s_cy = src_el["position"]["y"] + oy + src_el["size"]["height"] / 2
            t_cx = tgt_el["position"]["x"] + ox + tgt_el["size"]["width"] / 2
            t_cy = tgt_el["position"]["y"] + oy + tgt_el["size"]["height"] / 2
            sx, sy = _boundary_point(
                src_el["position"]["x"] + ox, src_el["position"]["y"] + oy,
                src_el["size"]["width"], src_el["size"]["height"],
                t_cx, t_cy,
            )
            tx, ty = _boundary_point(
                tgt_el["position"]["x"] + ox, tgt_el["position"]["y"] + oy,
                tgt_el["size"]["width"], tgt_el["size"]["height"],
                s_cx, s_cy,
            )

            line_a   = lnk.get("attrs", {}).get("line", {})
            s_color  = line_a.get("stroke", "#333333")
            s_width  = line_a.get("strokeWidth", 1.5)
            dash     = line_a.get("strokeDasharray", "").strip()
            directed = bool(line_a.get("targetMarker", {}).get("d", ""))

            dash_attr  = f' stroke-dasharray="{dash}"' if dash else ""
            arrow_attr = ' marker-end="url(#arr)"' if directed else ""
            parts.append(
                f'  <line x1="{sx:.1f}" y1="{sy:.1f}" x2="{tx:.1f}" y2="{ty:.1f}" '
                f'stroke="{s_color}" stroke-width="{s_width}"{dash_attr}{arrow_attr}/>'
            )
            if lnk.get("labels"):
                lbl = lnk["labels"][0].get("attrs", {}).get("text", {}).get("text", "")
                if lbl:
                    mx, my = (sx + tx) / 2, (sy + ty) / 2 - 6
                    parts.append(
                        f'  <text x="{mx:.1f}" y="{my:.1f}" text-anchor="middle" '
                        f'font-family="system-ui,sans-serif" font-size="11" fill="#333">'
                        f"{_esc(lbl)}</text>"
                    )

        parts.append("</svg>")
        return "\n".join(parts)
