/* palette.js — shape palette sidebar with sections and search */

App.Palette = (function () {

  let _uploadInput = null;

  function init() {
    _uploadInput = document.getElementById('palette-upload-input');

    _render();
    _bindSearch();
    _bindUpload();
    _bindCanvasDrop();

    App.Events.on('library:changed', _renderCustomSection);
  }

  // ---- Rendering ----

  function _render() {
    const content = document.getElementById('palette-content');
    content.innerHTML = '';
    _renderBuiltinSection(content);
    _renderCustomSection();
  }

  function _renderBuiltinSection(container) {
    const section = _makeSection('Shapes', null, null, 'palette-section-builtin');
    const ul = section.querySelector('ul');
    App.Shapes.TYPES.forEach(d => ul.appendChild(_makeBuiltinItem(d)));
    container.appendChild(section);
  }

  function _renderCustomSection() {
    const content = document.getElementById('palette-content');
    const existing = content.querySelector('.palette-section-custom');
    if (existing) content.removeChild(existing);

    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'palette-upload-btn';
    uploadBtn.title = 'Upload SVG or PNG';
    uploadBtn.textContent = '+ Upload';
    uploadBtn.addEventListener('click', () => _uploadInput && _uploadInput.click());

    const section = _makeSection('Custom', uploadBtn, null, 'palette-section-custom');
    const ul = section.querySelector('ul');
    const items = App.CustomLibrary.getCache();

    if (items.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'palette-empty-msg';
      empty.textContent = 'Upload an SVG or PNG to add it here';
      ul.appendChild(empty);
    } else {
      items.forEach(entry => ul.appendChild(_makeCustomItem(entry)));
    }

    content.appendChild(section);
    _applySearch();
  }

  function _makeSection(title, headerExtra, _, className) {
    const section = document.createElement('div');
    section.className = 'palette-section ' + (className || '');

    const header = document.createElement('div');
    header.className = 'palette-section-header';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    header.appendChild(titleSpan);
    if (headerExtra) header.appendChild(headerExtra);
    section.appendChild(header);

    const ul = document.createElement('ul');
    ul.className = 'palette-section-list';
    section.appendChild(ul);

    return section;
  }

  function _makeBuiltinItem(descriptor) {
    const li = document.createElement('li');
    li.className = 'palette-item';
    li.draggable = true;
    li.dataset.shapeType = descriptor.type;
    li.dataset.label = descriptor.label.toLowerCase();
    li.title = descriptor.label;

    const icon = document.createElement('span');
    icon.className = 'palette-icon';
    icon.innerHTML = descriptor.icon;

    const label = document.createElement('span');
    label.className = 'palette-label';
    label.textContent = descriptor.label;

    li.appendChild(icon);
    li.appendChild(label);

    li.addEventListener('click', () => {
      App.History.push();
      App.Shapes.createShape(descriptor.type, App.Canvas.getViewportCenter());
    });
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', descriptor.type);
    });

    return li;
  }

  function _makeCustomItem(entry) {
    const li = document.createElement('li');
    li.className = 'palette-item palette-custom-item';
    li.draggable = true;
    li.dataset.customId = entry.id;
    li.dataset.label = (entry.name || '').toLowerCase();
    li.title = entry.name || 'Custom shape';

    const icon = document.createElement('span');
    icon.className = 'palette-icon palette-custom-icon';
    const thumb = document.createElement('img');
    thumb.src = entry.dataUrl;
    thumb.alt = entry.name || '';
    icon.appendChild(thumb);

    const label = document.createElement('span');
    label.className = 'palette-label';
    label.textContent = entry.name || 'Custom';

    const del = document.createElement('button');
    del.className = 'palette-delete-btn';
    del.title = 'Remove from library';
    del.textContent = '×';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await App.CustomLibrary.remove(entry.id);
    });

    li.appendChild(icon);
    li.appendChild(label);
    li.appendChild(del);

    li.addEventListener('click', () => _placeCustomShape(entry));
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', 'custom:' + entry.id);
    });

    return li;
  }

  function _placeCustomShape(entry) {
    App.History.push();
    const img = new Image();
    img.onload = () => {
      App.Shapes.createImageShape(entry.dataUrl, App.Canvas.getViewportCenter(), img.naturalWidth, img.naturalHeight, entry.name || '');
    };
    img.onerror = () => {
      App.Shapes.createImageShape(entry.dataUrl, App.Canvas.getViewportCenter(), 200, 200, entry.name || '');
    };
    img.src = entry.dataUrl;
  }

  // ---- Search ----

  function _bindSearch() {
    const input = document.getElementById('palette-search');
    if (!input) return;
    input.addEventListener('input', _applySearch);
  }

  function _applySearch() {
    const input = document.getElementById('palette-search');
    const q = input ? input.value.trim().toLowerCase() : '';

    document.querySelectorAll('#palette-content .palette-item').forEach(li => {
      const lbl = (li.dataset.label || '');
      li.style.display = (!q || lbl.includes(q)) ? '' : 'none';
    });

    // Show/hide sections: keep if has matching items OR has the empty-state placeholder
    document.querySelectorAll('#palette-content .palette-section').forEach(section => {
      const visible  = section.querySelectorAll('.palette-item:not([style*="display: none"])').length;
      const hasEmpty = section.querySelector('.palette-empty-msg');
      section.style.display = (visible > 0 || hasEmpty) ? '' : 'none';
    });
  }

  // ---- Upload ----

  function _bindUpload() {
    if (!_uploadInput) return;
    _uploadInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        await _processUpload(file);
      }
      _uploadInput.value = '';
    });
  }

  async function _processUpload(file) {
    if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
      await _processZipUpload(file);
      return;
    }

    const allowed = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      alert('Unsupported file type: ' + file.type + '\nPlease upload SVG, PNG, JPEG, WebP, or ZIP.');
      return;
    }

    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const name = file.name.replace(/\.[^.]+$/, '');
    await App.CustomLibrary.add({ name, dataUrl, mimeType: file.type });
  }

  async function _processZipUpload(file) {
    const bridgeUrl = _getBridgeUrl();
    if (!bridgeUrl) {
      alert('ZIP upload requires the HTTP bridge to be connected.\n\nConnect the bridge via the Bridge button in the toolbar, then retry.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file, file.name);
      const res = await fetch(bridgeUrl + '/shapes/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        alert('ZIP upload failed: ' + res.status + (text ? '\n' + text : ''));
        return;
      }
      const result = await res.json();
      const count = result.accepted || 0;
      if (count === 0) {
        alert('ZIP contained no supported image files (SVG, PNG, JPEG).');
      } else {
        await _reloadBridgeShapes(bridgeUrl);
      }
    } catch (e) {
      alert('ZIP upload error: ' + e.message);
    }
  }

  async function _reloadBridgeShapes(bridgeUrl) {
    try {
      const res = await fetch(bridgeUrl + '/shapes', { cache: 'no-store' });
      if (!res.ok) return;
      const shapes = await res.json();
      for (const shape of shapes) {
        const imgRes = await fetch(bridgeUrl + '/shapes/' + encodeURIComponent(shape.filename), { cache: 'no-store' });
        if (!imgRes.ok) continue;
        const blob = await imgRes.blob();
        const dataUrl = await new Promise(resolve => {
          const r = new FileReader();
          r.onload = e => resolve(e.target.result);
          r.readAsDataURL(blob);
        });
        const name = shape.filename.replace(/\.[^.]+$/, '');
        const existing = App.CustomLibrary.getCache().find(e => e.name === name);
        if (!existing) {
          await App.CustomLibrary.add({ name, dataUrl, mimeType: blob.type });
        }
      }
    } catch (e) {
      console.warn('Could not reload bridge shapes:', e);
    }
  }

  function _getBridgeUrl() {
    const urlInput = document.getElementById('bridge-url');
    const dot = document.getElementById('bridge-dot');
    if (!dot || !dot.classList.contains('bridge-dot-on')) return null;
    return urlInput ? (urlInput.value || '').trim().replace(/\/$/, '') : null;
  }

  // ---- Canvas drop ----

  function _bindCanvasDrop() {
    const wrap = document.getElementById('canvas-wrap');

    wrap.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('text/plain');
      const pos  = App.Canvas.clientToGraph(e.clientX, e.clientY);

      if (data.startsWith('archd.')) {
        App.History.push();
        App.Shapes.createShape(data, pos);
      } else if (data.startsWith('custom:')) {
        const id    = data.slice('custom:'.length);
        const entry = App.CustomLibrary.getCache().find(s => s.id === id);
        if (entry) {
          App.History.push();
          const img = new Image();
          img.onload = () => App.Shapes.createImageShape(entry.dataUrl, pos, img.naturalWidth, img.naturalHeight, entry.name || '');
          img.onerror = () => App.Shapes.createImageShape(entry.dataUrl, pos, 200, 200, entry.name || '');
          img.src = entry.dataUrl;
        }
      }
    });
  }

  return { init };
})();
