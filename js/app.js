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

    // New blank document
    App.Model.newDocument('Untitled');

    // UI wiring
    _initDropdowns();
    _initToolbar();
    _initKeyboard();
    _initStatusUpdates();
    _initBeforeUnload();

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
