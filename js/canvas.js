/* canvas.js — JointJS paper/graph setup, zoom, pan */

App.Canvas = (function () {
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 4.0;
  const ZOOM_STEP = 0.15;

  let graph, paper;
  let currentScale = 1.0;
  let isPanning = false;
  let panStart = null;
  let panOrigin = null;
  let spaceDown = false;
  let _preInteractionSnapshot = null;

  function init() {
    graph = new joint.dia.Graph({}, { cellNamespace: App.Shapes.namespace });

    paper = new joint.dia.Paper({
      el: document.getElementById('paper-container'),
      model: graph,
      width: 5000,
      height: 4000,
      gridSize: 10,
      drawGrid: { name: 'dot', args: [{ color: '#c0c0c0', thickness: 1 }] },
      background: { color: '#f8f9fa' },
      defaultRouter: { name: 'orthogonal', args: { padding: 20 } },
      defaultConnector: { name: 'rounded', args: { radius: 6 } },
      defaultConnectionPoint: { name: 'boundary', args: { sticky: true } },
      connectionStrategy: joint.connectionStrategies.pinAbsolute,
      magnetThreshold: 'onleave',
      snapLinks: { radius: 20 },
      markAvailable: true,
      interactive: { labelMove: true },
      linkPinning: false,
      validateConnection(srcView, srcMagnet, tgtView, tgtMagnet) {
        return srcView !== tgtView;
      }
    });

    _bindPaperEvents();
    _bindKeyboard();

    return { graph, paper };
  }

  function _bindPaperEvents() {
    const wrap = document.getElementById('canvas-wrap');

    // Wheel zoom
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const rect = wrap.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      zoomAroundPoint(currentScale + delta, cx, cy);
    }, { passive: false });

    // Pan via middle mouse or space+drag
    wrap.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && spaceDown)) {
        e.preventDefault();
        _startPan(e);
      }
    });

    wrap.addEventListener('mousemove', (e) => {
      if (isPanning) _doPan(e);
    });

    wrap.addEventListener('mouseup', (e) => {
      if (isPanning) _endPan();
    });

    wrap.addEventListener('mouseleave', () => {
      if (isPanning) _endPan();
    });

    // Context menu prevention on canvas
    wrap.addEventListener('contextmenu', e => e.preventDefault());

    // Snapshot capture for history
    paper.on('element:pointerdown link:pointerdown', () => {
      _preInteractionSnapshot = JSON.stringify(graph.toJSON());
    });

    paper.on('element:pointerup link:pointerup', () => {
      if (!_preInteractionSnapshot) return;
      const current = JSON.stringify(graph.toJSON());
      if (current !== _preInteractionSnapshot) {
        App.History.pushSnapshot(_preInteractionSnapshot);
      }
      _preInteractionSnapshot = null;
    });

    // Mark dirty on any graph change
    graph.on('change add remove', () => {
      App.Model.markDirty();
    });
  }

  function _startPan(e) {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    const t = paper.translate();
    panOrigin = { x: t.tx, y: t.ty };
    document.getElementById('canvas-wrap').classList.add('panning');
    document.body.style.userSelect = 'none';
  }

  function _doPan(e) {
    if (!isPanning) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    paper.translate(panOrigin.x + dx, panOrigin.y + dy);
  }

  function _endPan() {
    isPanning = false;
    panStart = null;
    panOrigin = null;
    document.getElementById('canvas-wrap').classList.remove('panning');
    document.body.style.userSelect = '';
  }

  function _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && !_isInputFocused()) {
        spaceDown = true;
        document.getElementById('canvas-wrap').classList.add('pan-ready');
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        spaceDown = false;
        document.getElementById('canvas-wrap').classList.remove('pan-ready');
      }
    });
  }

  function _isInputFocused() {
    const tag = document.activeElement && document.activeElement.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function zoomAroundPoint(newScale, cx, cy) {
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    const t = paper.translate();
    const scaleFactor = newScale / currentScale;
    const newTx = cx - scaleFactor * (cx - t.tx);
    const newTy = cy - scaleFactor * (cy - t.ty);
    currentScale = newScale;
    paper.scale(currentScale, currentScale);
    paper.translate(newTx, newTy);
    _emitZoom();
  }

  function zoom(delta) {
    const wrap = document.getElementById('canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    zoomAroundPoint(currentScale + delta, rect.width / 2, rect.height / 2);
  }

  function setZoom(scale) {
    const wrap = document.getElementById('canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    zoomAroundPoint(scale, rect.width / 2, rect.height / 2);
  }

  function resetZoom() {
    paper.scale(1, 1);
    paper.translate(0, 0);
    currentScale = 1.0;
    _emitZoom();
  }

  function fitToContent() {
    if (graph.getCells().length === 0) return;
    paper.scaleContentToFit({ padding: 60, minScale: MIN_SCALE, maxScale: MAX_SCALE });
    currentScale = paper.scale().sx;
    _emitZoom();
  }

  function getZoom() { return currentScale; }

  function _emitZoom() {
    App.Events.emit('canvas:zoom', currentScale);
  }

  function clientToGraph(clientX, clientY) {
    const wrap = document.getElementById('canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    const t = paper.translate();
    const s = paper.scale().sx;
    return {
      x: (clientX - rect.left - t.tx) / s,
      y: (clientY - rect.top  - t.ty) / s
    };
  }

  function getViewportCenter() {
    const wrap = document.getElementById('canvas-wrap');
    return clientToGraph(
      wrap.offsetLeft + wrap.offsetWidth  / 2,
      wrap.offsetTop  + wrap.offsetHeight / 2
    );
  }

  return {
    get graph() { return graph; },
    get paper() { return paper; },
    get isPanning() { return isPanning; },
    init,
    zoom,
    setZoom,
    getZoom,
    resetZoom,
    fitToContent,
    clientToGraph,
    getViewportCenter,
    ZOOM_STEP
  };
})();
