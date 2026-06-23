/* history.js — snapshot-based undo/redo */

App.History = (function () {
  const MAX_SNAPSHOTS = 100;

  let undoStack = [];   // each entry is a JSON string snapshot taken BEFORE an operation
  let redoStack = [];
  let _batching = false;
  let _batchSnapshot = null;
  let _suspended = false;

  function _current() {
    return JSON.stringify(App.Canvas.graph.toJSON());
  }

  function push() {
    if (_suspended) return;
    if (_batching) return;
    const snap = _current();
    undoStack.push(snap);
    if (undoStack.length > MAX_SNAPSHOTS) undoStack.shift();
    redoStack = [];
    App.Events.emit('history:changed');
  }

  // Called with the pre-interaction snapshot (captured at pointerdown)
  function pushSnapshot(preSnap) {
    if (_suspended) return;
    if (_batching) return;
    undoStack.push(preSnap);
    if (undoStack.length > MAX_SNAPSHOTS) undoStack.shift();
    redoStack = [];
    App.Events.emit('history:changed');
  }

  function batchStart() {
    if (!_batching) {
      _batchSnapshot = _current();
      _batching = true;
    }
  }

  function batchEnd() {
    if (!_batching) return;
    _batching = false;
    const now = _current();
    if (now !== _batchSnapshot) {
      undoStack.push(_batchSnapshot);
      if (undoStack.length > MAX_SNAPSHOTS) undoStack.shift();
      redoStack = [];
      App.Events.emit('history:changed');
    }
    _batchSnapshot = null;
  }

  function undo() {
    if (undoStack.length === 0) return;
    const redoSnap = _current();
    const snap = undoStack.pop();
    redoStack.push(redoSnap);
    _restore(snap);
    App.Events.emit('history:changed');
  }

  function redo() {
    if (redoStack.length === 0) return;
    const undoSnap = _current();
    const snap = redoStack.pop();
    undoStack.push(undoSnap);
    _restore(snap);
    App.Events.emit('history:changed');
  }

  function _restore(snap) {
    _suspended = true;
    App.Interactions.clearSelection();
    try {
      App.Canvas.graph.fromJSON(JSON.parse(snap));
    } finally {
      _suspended = false;
    }
    App.Model.markDirty();
  }

  function clear() {
    undoStack = [];
    redoStack = [];
    App.Events.emit('history:changed');
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  return {
    push,
    pushSnapshot,
    batchStart,
    batchEnd,
    undo,
    redo,
    clear,
    canUndo,
    canRedo
  };
})();
