/* properties.js — context-sensitive properties panel for shapes and connectors */

App.Properties = (function () {

  let _cells = [];
  let _preChangeSnap = null;

  // ---- Attribute helpers ----

  function _bodySelector(cell) {
    return cell.get('type') === 'archd.TextLabel' ? null : 'body';
  }

  function _toHex(color) {
    if (!color || color === 'none' || color === 'transparent' || color === 'inherit') return '#ffffff';
    if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
    return '#333333';
  }

  function _v(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = String(val);
  }

  function _on(id, evt, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, fn);
  }

  // ---- Fill UI from model ----

  function _fillElementUI(elements) {
    const el = elements[0];
    const sel = _bodySelector(el);
    const hasBody = sel !== null;

    if (hasBody) {
      const fill    = el.attr(sel + '/fill');
      const stroke  = el.attr(sel + '/stroke') || '#333333';
      const strokeW = el.attr(sel + '/strokeWidth');
      const dash    = el.attr(sel + '/strokeDasharray') || '';
      const opacity = el.attr(sel + '/opacity');
      const rx      = el.attr('body/rx') || 0;

      const isNoneFill = (fill === 'none' || fill === 'transparent');
      _v('prop-fill-color', isNoneFill ? '#ffffff' : _toHex(fill || '#ffffff'));
      document.getElementById('prop-fill-none').classList.toggle('active', isNoneFill);

      _v('prop-stroke-color', _toHex(stroke));
      _v('prop-stroke-width', strokeW !== undefined ? strokeW : 1.5);
      _v('prop-stroke-style', dash);

      const op = opacity !== undefined ? opacity : 1;
      _v('prop-opacity', op);
      document.getElementById('prop-opacity-val').textContent = Math.round(op * 100) + '%';

      const type = el.get('type');
      const showRadius = (type === 'archd.Rectangle' || type === 'archd.RoundedRect') && elements.length === 1;
      document.getElementById('prop-radius-row').style.display = showRadius ? 'flex' : 'none';
      _v('prop-corner-radius', rx);
    }

    document.getElementById('prop-fill-section').style.display    = hasBody ? 'block' : 'none';
    document.getElementById('prop-stroke-section').style.display  = hasBody ? 'block' : 'none';
    document.getElementById('prop-appear-section').style.display  = hasBody ? 'block' : 'none';

    _v('prop-text-color', _toHex(el.attr('label/fill') || '#333333'));
    _v('prop-font-size',  el.attr('label/fontSize') || 13);
  }

  function _fillLinkUI(link) {
    _v('prop-link-color', _toHex(link.attr('line/stroke') || '#333333'));
    _v('prop-link-width', link.attr('line/strokeWidth') || 1.5);
    _v('prop-link-style', link.attr('line/strokeDasharray') || '');

    _v('prop-source-arrow', _identifyArrow(link.attr('line/sourceMarker')));
    _v('prop-target-arrow', _identifyArrow(link.attr('line/targetMarker')));

    const router = link.get('router') || {};
    _v('prop-routing', router.name || 'orthogonal');

    const labels = link.labels() || [];
    const firstLabel = labels[0];
    const labelText = firstLabel && firstLabel.attrs && firstLabel.attrs.text
      ? (firstLabel.attrs.text.text || '') : '';
    _v('prop-link-label', labelText);
  }

  function _identifyArrow(marker) {
    if (!marker) return 'none';
    if (marker.type === 'ellipse' || marker.rx !== undefined) return 'circle';
    const d = marker.d || '';
    if (!d) return 'none';
    if (d.includes('5 -5') && d.endsWith('z')) return 'diamond';
    if (d.endsWith('z')) return 'arrow';
    return 'openArrow';
  }

  // ---- Refresh ----

  function _refresh() {
    _hideAll();
    const elements = _cells.filter(c => c.isElement());
    const links    = _cells.filter(c => c.isLink());

    if (_cells.length === 0) {
      document.getElementById('prop-empty').style.display = 'flex';
    } else if (elements.length > 0 && links.length === 0) {
      _fillElementUI(elements);
      document.getElementById('prop-element').style.display = 'block';
    } else if (links.length > 0 && elements.length === 0) {
      _fillLinkUI(links[0]);
      document.getElementById('prop-link').style.display = 'block';
    } else {
      document.getElementById('prop-mixed').style.display = 'flex';
    }
  }

  function _hideAll() {
    ['prop-empty', 'prop-element', 'prop-link', 'prop-mixed'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  // ---- Apply helpers ----

  function _els()   { return _cells.filter(c => c.isElement()); }
  function _links() { return _cells.filter(c => c.isLink()); }

  function _startLive() {
    if (!_preChangeSnap) _preChangeSnap = JSON.stringify(App.Canvas.graph.toJSON());
  }

  function _commitLive() {
    if (_preChangeSnap) { App.History.pushSnapshot(_preChangeSnap); _preChangeSnap = null; }
  }

  function _instant(fn) {
    const pre = JSON.stringify(App.Canvas.graph.toJSON());
    fn();
    App.History.pushSnapshot(pre);
  }

  // ---- Input binding ----

  function _bindInputs() {

    // === Element: Fill color ===
    _on('prop-fill-color', 'input', () => {
      _startLive();
      const hex = document.getElementById('prop-fill-color').value;
      _els().forEach(el => { const s = _bodySelector(el); if (s) el.attr(s + '/fill', hex); });
    });
    _on('prop-fill-color', 'change', _commitLive);

    // === Element: No fill ===
    _on('prop-fill-none', 'click', () => {
      const btn = document.getElementById('prop-fill-none');
      const isNone = btn.classList.toggle('active');
      _instant(() => {
        _els().forEach(el => {
          const s = _bodySelector(el);
          if (s) el.attr(s + '/fill', isNone ? 'none' : '#ffffff');
        });
      });
      _refresh();
    });

    // === Element: Stroke color ===
    _on('prop-stroke-color', 'input', () => {
      _startLive();
      const hex = document.getElementById('prop-stroke-color').value;
      _els().forEach(el => { const s = _bodySelector(el); if (s) el.attr(s + '/stroke', hex); });
    });
    _on('prop-stroke-color', 'change', _commitLive);

    // === Element: Stroke width ===
    _on('prop-stroke-width', 'input', () => {
      _startLive();
      const w = parseFloat(document.getElementById('prop-stroke-width').value) || 0;
      _els().forEach(el => { const s = _bodySelector(el); if (s) el.attr(s + '/strokeWidth', w); });
    });
    _on('prop-stroke-width', 'change', _commitLive);

    // === Element: Stroke style ===
    _on('prop-stroke-style', 'change', () => _instant(() => {
      const dash = document.getElementById('prop-stroke-style').value;
      _els().forEach(el => { const s = _bodySelector(el); if (s) el.attr(s + '/strokeDasharray', dash); });
    }));

    // === Element: Opacity ===
    _on('prop-opacity', 'input', () => {
      _startLive();
      const op = parseFloat(document.getElementById('prop-opacity').value);
      document.getElementById('prop-opacity-val').textContent = Math.round(op * 100) + '%';
      _els().forEach(el => { const s = _bodySelector(el); if (s) el.attr(s + '/opacity', op); });
    });
    _on('prop-opacity', 'change', _commitLive);

    // === Element: Corner radius ===
    _on('prop-corner-radius', 'input', () => {
      _startLive();
      const r = parseInt(document.getElementById('prop-corner-radius').value, 10) || 0;
      _els().forEach(el => { el.attr('body/rx', r); el.attr('body/ry', r); });
    });
    _on('prop-corner-radius', 'change', _commitLive);

    // === Element: Text color ===
    _on('prop-text-color', 'input', () => {
      _startLive();
      _els().forEach(el => el.attr('label/fill', document.getElementById('prop-text-color').value));
    });
    _on('prop-text-color', 'change', _commitLive);

    // === Element: Font size ===
    _on('prop-font-size', 'input', () => {
      _startLive();
      const s = parseInt(document.getElementById('prop-font-size').value, 10) || 13;
      _els().forEach(el => el.attr('label/fontSize', s));
    });
    _on('prop-font-size', 'change', _commitLive);

    // === Link: Color ===
    _on('prop-link-color', 'input', () => {
      _startLive();
      _links().forEach(l => l.attr('line/stroke', document.getElementById('prop-link-color').value));
    });
    _on('prop-link-color', 'change', _commitLive);

    // === Link: Width ===
    _on('prop-link-width', 'input', () => {
      _startLive();
      const w = parseFloat(document.getElementById('prop-link-width').value) || 1;
      _links().forEach(l => l.attr('line/strokeWidth', w));
    });
    _on('prop-link-width', 'change', _commitLive);

    // === Link: Style ===
    _on('prop-link-style', 'change', () => _instant(() => {
      const dash = document.getElementById('prop-link-style').value;
      _links().forEach(l => l.attr('line/strokeDasharray', dash));
    }));

    // === Link: Source arrowhead ===
    _on('prop-source-arrow', 'change', () => _instant(() => {
      const style = document.getElementById('prop-source-arrow').value;
      _links().forEach(l => App.Connectors.setArrowhead(l, 'source', style));
    }));

    // === Link: Target arrowhead ===
    _on('prop-target-arrow', 'change', () => _instant(() => {
      const style = document.getElementById('prop-target-arrow').value;
      _links().forEach(l => App.Connectors.setArrowhead(l, 'target', style));
    }));

    // === Link: Routing ===
    _on('prop-routing', 'change', () => _instant(() => {
      const name = document.getElementById('prop-routing').value;
      _links().forEach(l => App.Connectors.setRouter(l, name));
    }));

    // === Link: Label ===
    _on('prop-link-label', 'change', () => _instant(() => {
      const text = document.getElementById('prop-link-label').value.trim();
      _links().forEach(l => {
        l.labels(text ? [{
          attrs: { text: { text, fontSize: 11, fill: '#333333' } },
          position: { distance: 0.5 }
        }] : []);
      });
    }));
  }

  function init() {
    App.Events.on('selection:changed', (cells) => {
      _cells = cells;
      _refresh();
    });
    _bindInputs();
  }

  return { init };

})();
