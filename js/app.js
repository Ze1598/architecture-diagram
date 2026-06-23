/* app.js — bootstrap, toolbar wiring, keyboard shortcuts, copy/paste/duplicate */

(function () {

  // ---- Clipboard ----

  const Clipboard = {
    cells: [],
    pasteOffset: 0,

    copy(cells) {
      this.cells = cells.map(c => c.clone());
      this.pasteOffset = 20;
    },

    paste() {
      if (this.cells.length === 0) return;
      App.History.push();
      App.Interactions.clearSelection();
      const offset = this.pasteOffset;
      const newCells = this.cells.map(c => {
        const clone = c.clone();
        if (clone.isElement()) {
          const pos = clone.position();
          clone.position(pos.x + offset, pos.y + offset);
        }
        return clone;
      });
      App.Canvas.graph.addCells(newCells);
      newCells.forEach(c => App.Interactions.selectCell(c, true));
      this.pasteOffset += 20;
    },

    cut(cells) {
      this.copy(cells);
      App.History.push();
      App.Interactions.clearSelection();
      App.Canvas.graph.removeCells(cells);
    },

    duplicate(cells) {
      this.copy(cells);
      this.pasteOffset = 20;
      this.paste();
    }
  };

  // ---- Dropdown menus ----

  function _initDropdowns() {
    document.querySelectorAll('.dropdown-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = btn.closest('.dropdown');
        const wasOpen = dropdown.classList.contains('open');
        document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
        if (!wasOpen) dropdown.classList.add('open');
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
    });
  }

  // ---- Action dispatcher ----

  function _dispatch(action) {
    const cells = App.Interactions.getSelectedCells();
    switch (action) {
      case 'new':           App.IO.newFile();    break;
      case 'open':          App.IO.openFile();   break;
      case 'save':          App.IO.saveFile();   break;
      case 'save-as':       App.IO.saveFileAs(); break;
      case 'undo':          App.History.undo();  break;
      case 'redo':          App.History.redo();  break;
      case 'delete':        App.Interactions.deleteSelected(); break;
      case 'select-all':    App.Interactions.selectAll(); break;
      case 'copy':          if (cells.length) Clipboard.copy(cells); break;
      case 'cut':           if (cells.length) Clipboard.cut(cells); break;
      case 'paste':         Clipboard.paste(); break;
      case 'duplicate':     if (cells.length) Clipboard.duplicate(cells); break;
      case 'bring-forward': App.Interactions.bringForward(); break;
      case 'send-backward': App.Interactions.sendBackward(); break;
      case 'bring-to-front':App.Interactions.bringToFront(); break;
      case 'send-to-back':  App.Interactions.sendToBack(); break;
      case 'align-left':    App.Interactions.alignLeft();   break;
      case 'align-right':   App.Interactions.alignRight();  break;
      case 'align-hcenter': App.Interactions.alignHCenter();break;
      case 'align-top':     App.Interactions.alignTop();    break;
      case 'align-bottom':  App.Interactions.alignBottom(); break;
      case 'align-vcenter': App.Interactions.alignVCenter();break;
      case 'distribute-h':  App.Interactions.distributeH(); break;
      case 'distribute-v':  App.Interactions.distributeV(); break;
    }
  }

  // ---- Toolbar buttons ----

  function _initToolbar() {
    // All data-action buttons (toolbar + menus)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      _dispatch(btn.dataset.action);
    });

    document.getElementById('btn-zoom-in').addEventListener('click',  () => App.Canvas.zoom(App.Canvas.ZOOM_STEP));
    document.getElementById('btn-zoom-out').addEventListener('click', () => App.Canvas.zoom(-App.Canvas.ZOOM_STEP));
    document.getElementById('btn-fit').addEventListener('click',      () => App.Canvas.fitToContent());
    document.getElementById('zoom-display').addEventListener('click', () => App.Canvas.resetZoom());

    document.getElementById('btn-help').addEventListener('click', _showShortcuts);
    document.getElementById('shortcuts-close-btn').addEventListener('click', () => {
      document.getElementById('shortcuts-dialog').close();
    });
  }

  function _showShortcuts() {
    document.getElementById('shortcuts-dialog').showModal();
  }

  // ---- Keyboard shortcuts ----

  function _initKeyboard() {
    document.addEventListener('keydown', (e) => {
      const focused = document.activeElement;
      const inInput = focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.tagName === 'SELECT');
      if (inInput) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && !e.shiftKey && e.key === 'z') { e.preventDefault(); App.History.undo(); return; }
      if (ctrl && (e.shiftKey && e.key === 'z' || e.key === 'y')) { e.preventDefault(); App.History.redo(); return; }
      if (ctrl && e.key === 'c') { e.preventDefault(); const c = App.Interactions.getSelectedCells(); if (c.length) Clipboard.copy(c); return; }
      if (ctrl && e.key === 'x') { e.preventDefault(); const c = App.Interactions.getSelectedCells(); if (c.length) Clipboard.cut(c); return; }
      if (ctrl && e.key === 'v') { e.preventDefault(); Clipboard.paste(); return; }
      if (ctrl && e.key === 'd') { e.preventDefault(); const c = App.Interactions.getSelectedCells(); if (c.length) Clipboard.duplicate(c); return; }
      if (ctrl && e.key === 'a') { e.preventDefault(); App.Interactions.selectAll(); return; }
      if (ctrl && e.key === 's' && e.shiftKey) { e.preventDefault(); App.IO.saveFileAs(); return; }
      if (ctrl && e.key === 's') { e.preventDefault(); App.IO.saveFile(); return; }
      if (ctrl && e.key === 'n') { e.preventDefault(); App.IO.newFile(); return; }
      if (ctrl && e.key === 'o') { e.preventDefault(); App.IO.openFile(); return; }
      if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); App.Canvas.zoom(App.Canvas.ZOOM_STEP); return; }
      if (ctrl && e.key === '-') { e.preventDefault(); App.Canvas.zoom(-App.Canvas.ZOOM_STEP); return; }
      if (ctrl && e.key === '0') { e.preventDefault(); App.Canvas.resetZoom(); return; }
      if (ctrl && e.shiftKey && e.key === 'F') { e.preventDefault(); App.Canvas.fitToContent(); return; }

      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); App.Interactions.deleteSelected(); return; }
      if (e.key === 'Escape') { App.Interactions.clearSelection(); return; }
      if (e.key === '?') { _showShortcuts(); return; }

      const nudge = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); App.Interactions.nudge(-nudge, 0); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); App.Interactions.nudge(nudge,  0); return; }
      if (e.key === 'ArrowUp')    { e.preventDefault(); App.Interactions.nudge(0, -nudge); return; }
      if (e.key === 'ArrowDown')  { e.preventDefault(); App.Interactions.nudge(0,  nudge); return; }
    });
  }

  // ---- Status / title updates ----

  function _initStatusUpdates() {
    // Zoom display
    App.Events.on('canvas:zoom', (scale) => {
      const pct = Math.round(scale * 100) + '%';
      document.getElementById('zoom-display').textContent = pct;
      document.getElementById('status-zoom').textContent  = pct;
    });

    // Selection count
    App.Events.on('selection:changed', (cells) => {
      const el = document.getElementById('status-selection');
      el.textContent = cells.length ? cells.length + ' selected' : '';
      _updateUndoRedoBtns();
    });

    // History state
    App.Events.on('history:changed', _updateUndoRedoBtns);

    // Dirty state → window title + indicator
    function _updateTitle() {
      const name   = (App.Model.current && App.Model.current.name) || 'Untitled';
      const dirty  = App.Model.isDirty;
      document.title = (dirty ? '● ' : '') + name + ' — Architecture Diagram';
      document.getElementById('filename-display').textContent = name;
      document.getElementById('dirty-indicator').hidden = !dirty;
    }

    App.Events.on('document:dirtied', _updateTitle);
    App.Events.on('document:saved',   _updateTitle);
    App.Events.on('document:new',     () => {
      _updateTitle();
      _updateUndoRedoBtns();
    });
    App.Events.on('document:loaded',  (doc) => {
      if (doc) document.getElementById('filename-display').textContent = doc.name || 'Untitled';
      _updateTitle();
      _updateUndoRedoBtns();
    });
  }

  function _updateUndoRedoBtns() {
    document.getElementById('btn-undo').disabled      = !App.History.canUndo();
    document.getElementById('btn-redo').disabled      = !App.History.canRedo();
    const menuUndo = document.getElementById('menu-undo');
    const menuRedo = document.getElementById('menu-redo');
    if (menuUndo) menuUndo.disabled = !App.History.canUndo();
    if (menuRedo) menuRedo.disabled = !App.History.canRedo();
  }

  // ---- Clipboard image paste ----

  function _initClipboardPaste() {
    document.addEventListener('paste', (e) => {
      // Ignore if a text input is focused
      const focused = document.activeElement;
      if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return;

      const items = Array.from(e.clipboardData.items || []);
      const imgItem = items.find(it => it.type.startsWith('image/'));
      if (!imgItem) return;
      e.preventDefault();

      const blob   = imgItem.getAsFile();
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = (ev) => _pasteImageDataUrl(ev.target.result, imgItem.type);
      reader.readAsDataURL(blob);
    });
  }

  function _pasteImageDataUrl(dataUrl, mimeType) {
    const MAX = 800;
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      let finalUrl = dataUrl;
      if (w > MAX || h > MAX) {
        const r = MAX / Math.max(w, h);
        w = Math.round(w * r); h = Math.round(h * r);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        finalUrl = canvas.toDataURL(mimeType || 'image/png');
      }
      App.History.push();
      App.Shapes.createImageShape(finalUrl, App.Canvas.getViewportCenter(), w, h, '');
    };
    img.src = dataUrl;
  }

  // ---- Auto-layout popover ----

  function _initLayout() {
    const btn     = document.getElementById('btn-layout');
    const popover = document.getElementById('layout-popover');
    if (!btn || !popover) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = btn.getBoundingClientRect();
      popover.style.top  = (r.bottom + 4) + 'px';
      popover.style.left = r.left + 'px';
      popover.hidden = !popover.hidden;
    });

    popover.querySelectorAll('[data-dir]').forEach(b => {
      b.addEventListener('click', () => {
        App.Layout.applyDagre(b.dataset.dir);
        popover.hidden = true;
      });
    });

    document.addEventListener('click', () => { popover.hidden = true; });
  }

  // ---- MCP bridge ----

  const Bridge = (function () {
    let _url     = null;
    let _timer   = null;
    let _lastMod = null;

    function _setStatus(connected, msg) {
      const dot  = document.getElementById('bridge-dot');
      const text = document.getElementById('bridge-status-text');
      const conn = document.getElementById('bridge-connect-btn');
      const disc = document.getElementById('bridge-disconnect-btn');
      if (dot)  dot.className  = 'bridge-dot' + (connected ? ' bridge-dot-on' : '');
      if (text) text.textContent = msg;
      if (conn) conn.disabled = connected;
      if (disc) disc.disabled = !connected;
    }

    function connect(url) {
      _url = url.replace(/\/$/, '');
      _setStatus(false, 'Connecting…');
      _poll();
    }

    function disconnect() {
      clearTimeout(_timer);
      _timer   = null;
      _url     = null;
      _lastMod = null;
      _setStatus(false, 'Disconnected');
    }

    async function _poll() {
      if (!_url) return;
      try {
        const res = await fetch(_url + '/current', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const envelope = await res.json();
        const mod = envelope.document && envelope.document.modifiedAt;
        if (mod && mod !== _lastMod) {
          _lastMod = mod;
          App.History.push();
          App.Canvas.graph.fromJSON(envelope.graph || {});
          if (envelope.document) {
            App.Model.current.document = envelope.document;
            App.Events.emit('document:loaded', App.Model.current);
          }
        }
        _setStatus(true, 'Connected — watching for changes');
      } catch (err) {
        _setStatus(false, 'Error: ' + err.message);
      }
      _timer = setTimeout(_poll, 2000);
    }

    return { connect, disconnect };
  })();

  function _initBridge() {
    const btn     = document.getElementById('btn-bridge');
    const dialog  = document.getElementById('bridge-dialog');
    const connBtn = document.getElementById('bridge-connect-btn');
    const discBtn = document.getElementById('bridge-disconnect-btn');
    const cancelBtn = document.getElementById('bridge-cancel-btn');
    if (!btn || !dialog) return;

    btn.addEventListener('click', () => dialog.showModal());
    cancelBtn.addEventListener('click', () => dialog.close());

    connBtn.addEventListener('click', () => {
      const url = (document.getElementById('bridge-url').value || '').trim();
      if (!url) return;
      Bridge.connect(url);
    });

    discBtn.addEventListener('click', () => Bridge.disconnect());
  }

  // ---- Unsaved changes guard ----

  function _initBeforeUnload() {
    window.addEventListener('beforeunload', (e) => {
      if (App.Model.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // ---- Confirm dialog helper ----

  App.Confirm = function (title, message) {
    return new Promise((resolve) => {
      const dialog = document.getElementById('confirm-dialog');
      document.getElementById('confirm-title').textContent   = title;
      document.getElementById('confirm-message').textContent = message;
      dialog.showModal();
      function onOk()     { dialog.close(); resolve(true);  cleanup(); }
      function onCancel() { dialog.close(); resolve(false); cleanup(); }
      function cleanup() {
        document.getElementById('confirm-ok-btn').removeEventListener('click', onOk);
        document.getElementById('confirm-cancel-btn').removeEventListener('click', onCancel);
      }
      document.getElementById('confirm-ok-btn').addEventListener('click', onOk);
      document.getElementById('confirm-cancel-btn').addEventListener('click', onCancel);
    });
  };

  // ---- Bootstrap ----

  function init() {
    // Modules must init in dependency order
    App.Canvas.init();       // creates graph + paper (needs App.Shapes.namespace)
    App.Connectors.init();
    App.Interactions.init();
    App.Properties.init();
    App.Palette.init();
    App.IO.init();
    App.Export.init();

    // Async: custom library loads from IDB and fires library:changed → palette re-renders
    App.CustomLibrary.init().catch(err => console.warn('Custom library init failed:', err));

    // New blank document
    App.Model.newDocument('Untitled');

    // UI wiring
    _initDropdowns();
    _initToolbar();
    _initKeyboard();
    _initStatusUpdates();
    _initBeforeUnload();
    _initLayout();
    _initBridge();

    // Clipboard paste — images land as canvas nodes
    _initClipboardPaste();

    // Check for autosave recovery after everything is ready
    setTimeout(() => App.IO.checkAutosaveRecovery(), 300);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
