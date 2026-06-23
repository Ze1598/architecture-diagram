/* interactions.js — selection, move, resize, rotate, delete, label edit */

App.Interactions = (function () {

  const selectedIds = new Set();
  let marqueeActive = false;
  let marqueeStart = null;
  let marqueeEl = null;
  let labelEditor = null;
  let editingCell = null;

  // ---- Resize handle tool ----
  // Control.setPosition receives coords in the element's local (unrotated) space.
  // For resize: coords.x/y are the new corner coordinates relative to the element's origin.

  function _makeResizeHandle(position, cursor) {
    return joint.elementTools.Control.extend({
      children: [{
        tagName: 'rect',
        selector: 'handle',
        attributes: {
          x: -5, y: -5, width: 10, height: 10,
          fill: '#4a7cf6', stroke: '#fff', 'stroke-width': 1.5,
          rx: 2, ry: 2,
          cursor: cursor || 'nwse-resize',
          'pointer-events': 'auto'
        }
      }],
      getPosition(view) {
        const { width, height } = view.model.size();
        const map = {
          nw: {x: 0,       y: 0      },
          n:  {x: width/2, y: 0      },
          ne: {x: width,   y: 0      },
          e:  {x: width,   y: height/2},
          se: {x: width,   y: height  },
          s:  {x: width/2, y: height  },
          sw: {x: 0,       y: height  },
          w:  {x: 0,       y: height/2}
        };
        return map[position] || map.se;
      },
      setPosition(view, coords, event) {
        const model = view.model;
        const { x: ox, y: oy } = model.position();
        const { width: ow, height: oh } = model.size();
        let nx = ox, ny = oy, nw = ow, nh = oh;

        switch (position) {
          case 'se': nw = Math.max(20, coords.x);           nh = Math.max(20, coords.y);           break;
          case 's':  nh = Math.max(20, coords.y);           break;
          case 'e':  nw = Math.max(20, coords.x);           break;
          case 'sw': nw = Math.max(20, ow - coords.x); nh = Math.max(20, coords.y);           nx = ox + ow - nw; break;
          case 'ne': nw = Math.max(20, coords.x);      nh = Math.max(20, oh - coords.y); ny = oy + oh - nh; break;
          case 'nw': nw = Math.max(20, ow - coords.x); nh = Math.max(20, oh - coords.y); nx = ox + ow - nw; ny = oy + oh - nh; break;
          case 'n':  nh = Math.max(20, oh - coords.y); ny = oy + oh - nh; break;
          case 'w':  nw = Math.max(20, ow - coords.x); nx = ox + ow - nw; break;
        }

        if (event.shiftKey) {
          if (['se','ne','sw','nw'].includes(position)) {
            nh = nw / (ow / oh);
          }
        }

        model.set({ position: {x: Math.round(nx), y: Math.round(ny)}, size: {width: Math.round(nw), height: Math.round(nh)} });
      }
    });
  }

  // ---- Rotate handle tool ----
  // setPosition receives relative (local unrotated) coords. We convert back to absolute
  // to compute the true angle of the mouse vs element center.

  const RotateHandle = joint.elementTools.Control.extend({
    children: [{
      tagName: 'circle',
      selector: 'handle',
      attributes: {
        r: 7, fill: '#4a7cf6', stroke: '#fff', 'stroke-width': 1.5,
        cursor: 'crosshair'
      }
    }],
    getPosition(view) {
      const { width } = view.model.size();
      return { x: width / 2, y: -30 };
    },
    setPosition(view, relCoords, event) {
      const model = view.model;
      const absPoint = model.getAbsolutePointFromRelative(relCoords.x, relCoords.y);
      const center   = model.getCenter();
      let angle = Math.atan2(absPoint.y - center.y, absPoint.x - center.x) * (180 / Math.PI) + 90;
      angle = ((angle % 360) + 360) % 360;
      if (event.shiftKey) angle = Math.round(angle / 15) * 15;
      model.rotate(angle, true);
    }
  });

  function _buildTools() {
    const CURSORS = {
      nw: 'nwse-resize', n: 'ns-resize',   ne: 'nesw-resize',
      e:  'ew-resize',   se: 'nwse-resize', s:  'ns-resize',
      sw: 'nesw-resize', w:  'ew-resize'
    };
    const handles = Object.entries(CURSORS).map(([pos, cur]) => new (_makeResizeHandle(pos, cur))());
    return new joint.dia.ToolsView({
      tools: [...handles, new RotateHandle()]
    });
  }

  // ---- Selection management ----

  function _highlightCell(cellView) {
    try {
      joint.highlighters.stroke.add(cellView, 'root', 'selection-hl', {
        padding: 3,
        attrs: { stroke: '#4a7cf6', 'stroke-width': 2.5 }
      });
    } catch (e) { /* ignore if shape has no highlightable node */ }
  }

  function _unhighlightCell(cellView) {
    try {
      joint.highlighters.stroke.remove(cellView, 'selection-hl');
    } catch (e) { /* ignore */ }
  }

  function _showTools(elementView) {
    const tools = _buildTools();
    elementView.addTools(tools);
  }

  function _hideTools(elementView) {
    elementView.removeTools();
  }

  function selectCell(cell, addToSelection) {
    if (!addToSelection) clearSelection();
    if (!cell) return;

    const id = cell.id;
    if (selectedIds.has(id)) return;
    selectedIds.add(id);

    const view = App.Canvas.paper.findViewByModel(cell);
    if (view) {
      _highlightCell(view);
      if (cell.isElement()) _showTools(view);
    }

    App.Events.emit('selection:changed', getSelectedCells());
  }

  function deselectCell(cell) {
    const id = cell.id;
    if (!selectedIds.has(id)) return;
    selectedIds.delete(id);

    const view = App.Canvas.paper.findViewByModel(cell);
    if (view) {
      _unhighlightCell(view);
      if (cell.isElement()) _hideTools(view);
    }

    App.Events.emit('selection:changed', getSelectedCells());
  }

  function clearSelection() {
    selectedIds.forEach(id => {
      const cell = App.Canvas.graph.getCell(id);
      if (cell) {
        const view = App.Canvas.paper.findViewByModel(cell);
        if (view) {
          _unhighlightCell(view);
          if (cell.isElement()) _hideTools(view);
        }
      }
    });
    selectedIds.clear();
    App.Events.emit('selection:changed', []);
  }

  function getSelectedCells() {
    return Array.from(selectedIds)
      .map(id => App.Canvas.graph.getCell(id))
      .filter(Boolean);
  }

  function selectAll() {
    clearSelection();
    App.Canvas.graph.getCells().forEach(cell => selectCell(cell, true));
  }

  // ---- Delete ----

  function deleteSelected() {
    const cells = getSelectedCells();
    if (cells.length === 0) return;
    App.History.push();
    clearSelection();
    App.Canvas.graph.removeCells(cells);
  }

  // ---- Z-order ----

  function bringForward() {
    getSelectedCells().forEach(c => c.isElement() && c.toFront());
  }

  function sendBackward() {
    getSelectedCells().forEach(c => c.isElement() && c.toBack());
  }

  function bringToFront() { bringForward(); }
  function sendToBack() { sendBackward(); }

  // ---- Nudge ----

  function nudge(dx, dy) {
    const cells = getSelectedCells().filter(c => c.isElement());
    if (cells.length === 0) return;
    App.History.push();
    cells.forEach(c => c.translate(dx, dy));
  }

  // ---- Label editing ----

  function _startLabelEdit(elementView, evt) {
    if (labelEditor) _commitLabelEdit();
    editingCell = elementView.model;

    const bbox = elementView.getBBox({ useModelGeometry: false });
    const wrap = document.getElementById('canvas-wrap');
    const wrapRect = wrap.getBoundingClientRect();
    const paperEl = App.Canvas.paper.el;
    const paperRect = paperEl.getBoundingClientRect();

    const left   = paperRect.left - wrapRect.left + bbox.x * App.Canvas.getZoom() + App.Canvas.paper.translate().tx;
    const top    = paperRect.top  - wrapRect.top  + bbox.y * App.Canvas.getZoom() + App.Canvas.paper.translate().ty;
    const width  = Math.max(60, bbox.width  * App.Canvas.getZoom());
    const height = Math.max(24, bbox.height * App.Canvas.getZoom());

    labelEditor = document.createElement('textarea');
    labelEditor.id = 'label-editor';
    labelEditor.value = editingCell.attr('label/text') || '';
    labelEditor.style.left   = left   + 'px';
    labelEditor.style.top    = top    + 'px';
    labelEditor.style.width  = width  + 'px';
    labelEditor.style.height = height + 'px';
    wrap.appendChild(labelEditor);
    labelEditor.focus();
    labelEditor.select();

    labelEditor.addEventListener('blur',    _commitLabelEdit);
    labelEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { _cancelLabelEdit(); e.stopPropagation(); }
      if (e.key === 'Enter' && !e.shiftKey) { _commitLabelEdit(); e.preventDefault(); }
    });
  }

  function _commitLabelEdit() {
    if (!labelEditor || !editingCell) return;
    const newText = labelEditor.value;
    App.History.push();
    editingCell.attr('label/text', newText);
    _removeLabelEditor();
  }

  function _cancelLabelEdit() {
    _removeLabelEditor();
  }

  function _removeLabelEditor() {
    if (labelEditor) {
      labelEditor.removeEventListener('blur', _commitLabelEdit);
      if (labelEditor.parentNode) labelEditor.parentNode.removeChild(labelEditor);
      labelEditor = null;
    }
    editingCell = null;
  }

  // ---- Marquee selection ----

  function _initMarquee() {
    marqueeEl = document.createElement('div');
    marqueeEl.id = 'marquee';
    document.getElementById('canvas-wrap').appendChild(marqueeEl);

    App.Canvas.paper.on('blank:pointerdown', (evt, x, y) => {
      if (App.Canvas.isPanning) return;
      if (evt.shiftKey) return;
      clearSelection();
      marqueeActive = true;
      const wrap = document.getElementById('canvas-wrap');
      const rect = wrap.getBoundingClientRect();
      marqueeStart = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
      marqueeEl.style.left   = marqueeStart.x + 'px';
      marqueeEl.style.top    = marqueeStart.y + 'px';
      marqueeEl.style.width  = '0px';
      marqueeEl.style.height = '0px';
      marqueeEl.style.display = 'block';
    });

    document.addEventListener('mousemove', (e) => {
      if (!marqueeActive) return;
      const wrap = document.getElementById('canvas-wrap');
      const rect = wrap.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const x = Math.min(cx, marqueeStart.x);
      const y = Math.min(cy, marqueeStart.y);
      const w = Math.abs(cx - marqueeStart.x);
      const h = Math.abs(cy - marqueeStart.y);
      marqueeEl.style.left   = x + 'px';
      marqueeEl.style.top    = y + 'px';
      marqueeEl.style.width  = w + 'px';
      marqueeEl.style.height = h + 'px';
    });

    document.addEventListener('mouseup', (e) => {
      if (!marqueeActive) return;
      marqueeActive = false;
      marqueeEl.style.display = 'none';

      const wrap = document.getElementById('canvas-wrap');
      const rect = wrap.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const t = App.Canvas.paper.translate();
      const s = App.Canvas.getZoom();

      const x1 = (Math.min(cx, marqueeStart.x) - t.tx) / s;
      const y1 = (Math.min(cy, marqueeStart.y) - t.ty) / s;
      const x2 = (Math.max(cx, marqueeStart.x) - t.tx) / s;
      const y2 = (Math.max(cy, marqueeStart.y) - t.ty) / s;

      if (x2 - x1 < 4 && y2 - y1 < 4) return;

      const area = new joint.g.Rect(x1, y1, x2 - x1, y2 - y1);
      const views = App.Canvas.paper.findViewsInArea(area);
      views.forEach(v => selectCell(v.model, true));
    });
  }

  // ---- Paper event wiring ----

  function init() {
    const paper = App.Canvas.paper;

    // Element click — select
    paper.on('element:pointerdown', (elementView, evt) => {
      if (evt.button !== 0) return;
      if (App.Canvas.isPanning) return;
      const cell = elementView.model;
      if (evt.shiftKey) {
        if (selectedIds.has(cell.id)) deselectCell(cell);
        else selectCell(cell, true);
      } else {
        if (!selectedIds.has(cell.id)) selectCell(cell, false);
      }
    });

    // Link click
    paper.on('link:pointerdown', (linkView, evt) => {
      if (evt.button !== 0) return;
      const cell = linkView.model;
      if (evt.shiftKey) {
        if (selectedIds.has(cell.id)) deselectCell(cell);
        else selectCell(cell, true);
      } else {
        selectCell(cell, false);
      }
    });

    // Blank click — clear selection
    paper.on('blank:pointerdown', (evt) => {
      if (!evt.shiftKey && !App.Canvas.isPanning) clearSelection();
    });

    // Double-click to edit label
    paper.on('element:pointerdblclick', (elementView, evt) => {
      evt.stopPropagation();
      _startLabelEdit(elementView, evt);
    });

    // Remove deleted cells from selection
    App.Canvas.graph.on('remove', (cell) => {
      selectedIds.delete(cell.id);
    });

    _initMarquee();
  }

  return {
    get selectedCells() { return getSelectedCells(); },
    get selectedIds() { return selectedIds; },
    init,
    selectCell,
    deselectCell,
    clearSelection,
    selectAll,
    getSelectedCells,
    deleteSelected,
    bringForward,
    sendBackward,
    bringToFront,
    sendToBack,
    nudge
  };
})();
