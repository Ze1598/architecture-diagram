/* io.js — File System Access API, fallback save/open, IndexedDB autosave, recent files */

App.IO = (function () {
  const RECENT_KEY = 'archd_recent_files';
  const MAX_RECENT = 5;
  const IDB_NAME = 'archdAutosave';
  const IDB_STORE = 'documents';
  const AUTOSAVE_DELAY = 30000;
  const FOLDER_KEY = 'diagramsFolder';
  const FOLDER_AUTOSAVE = '_autosave.archd';

  const hasFSA = typeof window.showSaveFilePicker === 'function';
  const hasDirPicker = typeof window.showDirectoryPicker === 'function';

  let fileHandle = null;     // FileSystemFileHandle | null
  let _dirHandle = null;     // FileSystemDirectoryHandle | null
  let _folderHandleReady = null;
  let _idb = null;
  let _autosaveTimer = null;
  let _lastExplicitSaveAt = null;

  // ---- IndexedDB setup ----

  function _openIDB() {
    return new Promise((resolve, reject) => {
      if (_idb) { resolve(_idb); return; }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = (e) => { _idb = e.target.result; resolve(_idb); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  async function _idbPut(record) {
    const db = await _openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function _idbGet(id) {
    const db = await _openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ---- Diagrams folder (FSA directory) ----

  async function _loadFolderHandle() {
    if (!hasDirPicker) return;
    try {
      const record = await _idbGet(FOLDER_KEY);
      if (record && record.handle) _dirHandle = record.handle;
    } catch (e) {
      console.warn('Could not restore folder handle:', e);
    }
  }

  async function _canReadDir() {
    if (!_dirHandle) return false;
    try {
      return (await _dirHandle.queryPermission({ mode: 'read' })) === 'granted';
    } catch { return false; }
  }

  async function _canWriteDir() {
    if (!_dirHandle) return false;
    try {
      return (await _dirHandle.queryPermission({ mode: 'readwrite' })) === 'granted';
    } catch { return false; }
  }

  async function chooseDiagramsFolder() {
    if (!hasDirPicker) {
      alert('Directory picker is not supported in this browser. Use a Chromium-based browser.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      _dirHandle = handle;
      await _idbPut({ id: FOLDER_KEY, handle });
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('chooseDiagramsFolder:', e);
    }
  }

  async function _autosaveToDiagramsFolder(data) {
    if (!await _canWriteDir()) return;
    try {
      const fh = await _dirHandle.getFileHandle(FOLDER_AUTOSAVE, { create: true });
      const writable = await fh.createWritable();
      await writable.write(data);
      await writable.close();
    } catch (e) {
      console.warn('Folder autosave failed:', e);
    }
  }

  async function _clearFolderAutosave() {
    if (!await _canWriteDir()) return;
    try { await _dirHandle.removeEntry(FOLDER_AUTOSAVE); } catch { /* already gone */ }
  }

  // ---- Autosave ----

  function _scheduleAutosave() {
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(_autosave, AUTOSAVE_DELAY);
  }

  async function _autosave() {
    try {
      const data = App.Model.serialize();
      await _idbPut({ id: 'current', data, savedAt: new Date().toISOString() });
      await _autosaveToDiagramsFolder(data);
    } catch (e) {
      console.warn('Autosave failed:', e);
    }
  }

  async function checkAutosaveRecovery() {
    await _folderHandleReady;

    // Prefer folder autosave over IDB blob
    if (await _canReadDir()) {
      try {
        const fh = await _dirHandle.getFileHandle(FOLDER_AUTOSAVE).catch(() => null);
        if (fh) {
          const file = await fh.getFile();
          const ok = window.confirm(
            'Unsaved changes found in diagrams folder (' +
            new Date(file.lastModified).toLocaleString() + ').\n\nRestore them?'
          );
          if (ok) {
            App.Model.deserialize(await file.text());
            App.History.clear();
            App.Events.emit('document:loaded', App.Model.current);
          } else {
            await _clearFolderAutosave();
          }
          return;
        }
      } catch (e) { /* fall through to IDB */ }
    }

    // IDB fallback
    try {
      const record = await _idbGet('current');
      if (!record) return;
      if (_lastExplicitSaveAt && new Date(record.savedAt) <= new Date(_lastExplicitSaveAt)) return;
      const ok = window.confirm(
        'Unsaved changes were found from a previous session (' +
        new Date(record.savedAt).toLocaleString() + ').\n\nRestore them?'
      );
      if (ok) {
        App.Model.deserialize(record.data);
        App.History.clear();
        App.Events.emit('document:loaded', App.Model.current);
      } else {
        await _clearAutosave();
      }
    } catch (e) {
      console.warn('Could not check autosave:', e);
    }
  }

  async function _clearAutosave() {
    try {
      const db = await _openIDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete('current');
        tx.oncomplete = resolve;
        tx.onerror = (e) => reject(e.target.error);
      });
    } catch (e) { /* ignore */ }
  }

  // ---- Recent files ----

  function getRecentFiles() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    } catch { return []; }
  }

  function _addRecentFile(name) {
    const recents = getRecentFiles().filter(r => r.name !== name);
    recents.unshift({ name, savedAt: new Date().toISOString() });
    if (recents.length > MAX_RECENT) recents.length = MAX_RECENT;
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recents)); } catch { /* ignore */ }
    _renderRecentFiles();
  }

  function _renderRecentFiles() {
    const container = document.getElementById('recent-files-list');
    if (!container) return;
    const recents = getRecentFiles();
    container.innerHTML = '';
    if (recents.length === 0) {
      container.innerHTML = '<span class="menu-label" style="opacity:0.5">None</span>';
      return;
    }
    recents.forEach(r => {
      const btn = document.createElement('button');
      btn.textContent = r.name;
      btn.title = r.savedAt ? 'Saved: ' + new Date(r.savedAt).toLocaleString() : '';
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
      });
      container.appendChild(btn);
    });
  }

  // ---- New file ----

  function newFile() {
    if (App.Model.isDirty) {
      if (!window.confirm('Discard unsaved changes and start a new diagram?')) return;
    }
    fileHandle = null;
    App.Canvas.graph.clear();
    App.Model.newDocument('Untitled');
    App.History.clear();
    _clearAutosave();
    _clearFolderAutosave();
    App.Events.emit('document:new');
  }

  // ---- Open file ----

  async function openFile() {
    if (App.Model.isDirty) {
      if (!window.confirm('Discard unsaved changes and open a file?')) return;
    }
    try {
      if (hasFSA) {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Architecture Diagram', accept: { 'application/json': ['.archd', '.json'] } }]
        });
        fileHandle = handle;
        const file = await handle.getFile();
        const text = await file.text();
        _loadFromText(text, file.name);
      } else {
        document.getElementById('file-input').click();
      }
    } catch (e) {
      if (e.name !== 'AbortError') alert('Failed to open file: ' + e.message);
    }
  }

  function _loadFromText(text, name) {
    try {
      App.Model.deserialize(text);
      App.History.clear();
      _lastExplicitSaveAt = new Date().toISOString();
      if (name) _addRecentFile(name);
      App.Events.emit('document:loaded', App.Model.current);
    } catch (e) {
      alert('Failed to load file: ' + e.message);
    }
  }

  // ---- Save file ----

  async function saveFile() {
    if (hasFSA) {
      if (!fileHandle) { await saveFileAs(); return; }
      await _writeFSA(fileHandle);
    } else {
      _downloadFallback();
    }
  }

  async function saveFileAs() {
    if (hasFSA) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: (App.Model.current && App.Model.current.name) || 'diagram',
          types: [{ description: 'Architecture Diagram', accept: { 'application/json': ['.archd'] } }]
        });
        fileHandle = handle;
        await _writeFSA(handle);
      } catch (e) {
        if (e.name !== 'AbortError') alert('Save failed: ' + e.message);
      }
    } else {
      _downloadFallback();
    }
  }

  async function _writeFSA(handle) {
    try {
      const writable = await handle.createWritable();
      await writable.write(App.Model.serialize());
      await writable.close();
      const file = await handle.getFile();
      _lastExplicitSaveAt = new Date().toISOString();
      App.Model.markClean();
      _addRecentFile(file.name);
      await _clearAutosave();
      await _clearFolderAutosave();
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
  }

  function _downloadFallback() {
    const data = App.Model.serialize();
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const name = (App.Model.current && App.Model.current.name) || 'diagram';
    a.download = name.endsWith('.archd') ? name : name + '.archd';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    _lastExplicitSaveAt = new Date().toISOString();
    App.Model.markClean();
    _addRecentFile(a.download);
    _clearFolderAutosave();
  }

  function init() {
    // Start loading the persisted folder handle (async, awaited in checkAutosaveRecovery)
    _folderHandleReady = _loadFolderHandle();

    // Wire graph changes to autosave schedule
    App.Canvas.graph.on('change add remove', _scheduleAutosave);

    // File input fallback for open
    const fileInput = document.getElementById('file-input');
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => _loadFromText(ev.target.result, file.name);
      reader.readAsText(file);
      fileInput.value = '';
    });

    _renderRecentFiles();
  }

  return {
    get fileHandle() { return fileHandle; },
    get hasFSA() { return hasFSA; },
    get hasDirPicker() { return hasDirPicker; },
    get dirHandle() { return _dirHandle; },
    init,
    newFile,
    openFile,
    saveFile,
    saveFileAs,
    checkAutosaveRecovery,
    chooseDiagramsFolder,
    getRecentFiles
  };
})();
