/* custom-library.js — IDB-backed library of user-uploaded shapes */

App.CustomLibrary = (function () {
  const DB_NAME    = 'archdCustomLibrary';
  const DB_VERSION = 1;
  const STORE      = 'shapes';

  let _db    = null;
  let _cache = [];   // in-memory snapshot for sync reads

  function _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  function _promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  function _tx(mode) {
    return _db.transaction(STORE, mode).objectStore(STORE);
  }

  async function _loadAll() {
    return new Promise((resolve, reject) => {
      const items = [];
      const req = _tx('readonly').openCursor();
      req.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) { items.push(cur.value); cur.continue(); }
        else resolve(items.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '')));
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function add(entry) {
    entry.id        = entry.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36));
    entry.dateAdded = entry.dateAdded || new Date().toISOString();
    await _promisify(_tx('readwrite').put(entry));
    _cache = await _loadAll();
    App.Events.emit('library:changed');
    return entry;
  }

  async function remove(id) {
    await _promisify(_tx('readwrite').delete(id));
    _cache = _cache.filter(s => s.id !== id);
    App.Events.emit('library:changed');
  }

  async function init() {
    _db    = await _openDB();
    _cache = await _loadAll();
    App.Events.emit('library:changed');
  }

  function getCache() { return _cache; }

  return { init, add, remove, getCache };
})();
