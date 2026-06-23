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


class DiagramModel:
    def __init__(self, name: str = "Untitled") -> None:
        self.name = name
        self._doc_id = _uid()
        self._created_at = _now()
        self.cells: List[Dict[str, Any]] = []

    # ---- Queries ----

    def elements(self) -> List[Dict]:
        return [c for c in self.cells if "Link" not in c.get("type", "")]

    def links(self) -> List[Dict]:
        return [c for c in self.cells if "Link" in c.get("type", "")]

    def find(self, cell_id: str) -> Optional[Dict]:
        return next((c for c in self.cells if c["id"] == cell_id), None)

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
