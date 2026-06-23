/* export.js — SVG and PNG export (joint.format is JointJS+; implemented manually) */

App.Export = (function () {
  const MAX_CANVAS_PX = 8192;
  const EXPORT_PADDING = 30;

  function showDialog() {
    document.getElementById('export-dialog').showModal();
  }

  function hideDialog() {
    document.getElementById('export-dialog').close();
  }

  // ---- SVG export ----

  function exportSVG() {
    const svgStr = _buildSVGString();
    if (!svgStr) return;
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    _triggerDownload(blob, _filename('svg'));
  }

  function exportPNG(scale, transparentBg) {
    scale = scale || 2;
    const svgStr = _buildSVGString();
    if (!svgStr) return;

    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth  * scale;
      let h = img.naturalHeight * scale;

      if (w > MAX_CANVAS_PX || h > MAX_CANVAS_PX) {
        const factor = MAX_CANVAS_PX / Math.max(w, h);
        w = Math.floor(w * factor);
        h = Math.floor(h * factor);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = w || 800;
      canvas.height = h || 600;
      const ctx = canvas.getContext('2d');
      if (!transparentBg) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        _triggerDownload(blob, _filename('png'));
      }, 'image/png');
    };
    img.onerror = () => alert('PNG export failed: could not render SVG.');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  }

  function _buildSVGString() {
    const paper = App.Canvas.paper;
    const graph = App.Canvas.graph;

    if (graph.getCells().length === 0) {
      alert('Nothing to export — the diagram is empty.');
      return null;
    }

    // Get content bounding box in local (graph) coordinates
    const contentArea = paper.getContentArea({ useModelGeometry: true });
    if (!contentArea || contentArea.width === 0 || contentArea.height === 0) {
      alert('Nothing to export — the diagram is empty.');
      return null;
    }

    const pad = EXPORT_PADDING;
    const viewX = contentArea.x - pad;
    const viewY = contentArea.y - pad;
    const viewW = contentArea.width  + pad * 2;
    const viewH = contentArea.height + pad * 2;

    // Clone the live SVG
    const liveSvg = paper.svg;
    const clone   = liveSvg.cloneNode(true);

    // Set explicit size and viewBox
    clone.setAttribute('width',   viewW);
    clone.setAttribute('height',  viewH);
    clone.setAttribute('viewBox', viewX + ' ' + viewY + ' ' + viewW + ' ' + viewH);

    // Remove the zoom/pan transform from the root viewport group so export
    // renders at 1:1 scale regardless of current zoom level.
    const layers = clone.querySelector('.joint-layers');
    if (layers) {
      layers.setAttribute('transform', '');
    }

    // Remove paper-specific inline styles (position:absolute, overflow:hidden)
    // so the SVG renders correctly as a standalone file.
    clone.removeAttribute('style');
    clone.style.overflow = 'visible';

    // Embed a minimal inline style so shapes look correct without app.css
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = 'text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }';
    clone.insertBefore(style, clone.firstChild);

    const serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(clone);

    if (!svgStr.startsWith('<?xml')) {
      svgStr = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgStr;
    }

    return svgStr;
  }

  function _filename(ext) {
    const name = (App.Model.current && App.Model.current.name) || 'diagram';
    return name.replace(/[/\\?%*:|"<>]/g, '_') + '.' + ext;
  }

  function _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function init() {
    document.getElementById('btn-export').addEventListener('click', showDialog);

    document.getElementById('export-svg-btn').addEventListener('click', () => {
      hideDialog();
      exportSVG();
    });

    document.getElementById('export-png-btn').addEventListener('click', () => {
      const scale       = parseInt(document.getElementById('export-scale').value, 10);
      const transparent = document.getElementById('export-transparent').checked;
      hideDialog();
      exportPNG(scale, transparent);
    });

    document.getElementById('export-cancel-btn').addEventListener('click', hideDialog);
  }

  return { init, showDialog, hideDialog, exportSVG, exportPNG };
})();
