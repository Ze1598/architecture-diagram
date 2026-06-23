/* model.js — document envelope, schema versioning, dirty tracking, App.Events */

window.App = window.App || {};

App.Events = (function () {
  const handlers = {};
  return {
    on(event, fn) {
      (handlers[event] = handlers[event] || []).push(fn);
    },
    off(event, fn) {
      if (!handlers[event]) return;
      handlers[event] = handlers[event].filter(f => f !== fn);
    },
    emit(event, ...args) {
      (handlers[event] || []).forEach(fn => fn(...args));
    }
  };
})();

App.Model = (function () {
  const SCHEMA_VERSION = '1.0';

  let _current = null;
  let _dirty = false;

  function _generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function newDocument(name) {
    const now = new Date().toISOString();
    _current = {
      schemaVersion: SCHEMA_VERSION,
      document: {
        id: _generateId(),
        name: name || 'Untitled',
        createdAt: now,
        modifiedAt: now
      },
      assets: []
    };
    _dirty = false;
    return _current;
  }

  function serialize() {
    if (!_current) newDocument('Untitled');
    const now = new Date().toISOString();
    _current.document.modifiedAt = now;
    const envelope = {
      schemaVersion: _current.schemaVersion,
      document: Object.assign({}, _current.document),
      assets: _current.assets.slice(),
      graph: App.Canvas.graph.toJSON()
    };
    return JSON.stringify(envelope, null, 2);
  }

  function deserialize(jsonString) {
    let envelope;
    try {
      envelope = JSON.parse(jsonString);
    } catch (e) {
      throw new Error('Invalid file: could not parse JSON.');
    }

    if (!envelope.schemaVersion) {
      throw new Error('Invalid file: missing schemaVersion.');
    }

    const [major] = envelope.schemaVersion.split('.').map(Number);
    const [curMajor] = SCHEMA_VERSION.split('.').map(Number);
    if (major > curMajor) {
      throw new Error(
        `This file was created with a newer version of the app (schema ${envelope.schemaVersion}). ` +
        `Please update the app to open it.`
      );
    }

    App.Canvas.graph.fromJSON(envelope.graph || {});
    _current = {
      schemaVersion: SCHEMA_VERSION,
      document: Object.assign({}, envelope.document),
      assets: envelope.assets || []
    };
    _dirty = false;
    App.Events.emit('document:loaded', _current);
    return _current;
  }

  function markDirty() {
    if (!_dirty) {
      _dirty = true;
      App.Events.emit('document:dirtied');
    }
  }

  function markClean() {
    _dirty = false;
    App.Events.emit('document:saved');
  }

  return {
    get current() { return _current; },
    get isDirty() { return _dirty; },
    newDocument,
    serialize,
    deserialize,
    markDirty,
    markClean
  };
})();
