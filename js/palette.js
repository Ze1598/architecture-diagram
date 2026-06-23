/* palette.js — shape palette sidebar (hand-built, no JointJS Stencil) */

App.Palette = (function () {

  function init() {
    render();
    _bindCanvasDrop();
  }

  function render() {
    const list = document.getElementById('palette-list');
    list.innerHTML = '';
    App.Shapes.TYPES.forEach(descriptor => {
      const li = document.createElement('li');
      li.draggable = true;
      li.dataset.shapeType = descriptor.type;
      li.title = descriptor.label;

      const iconWrap = document.createElement('span');
      iconWrap.className = 'palette-icon';
      iconWrap.innerHTML = descriptor.icon;

      const label = document.createElement('span');
      label.className = 'palette-label';
      label.textContent = descriptor.label;

      li.appendChild(iconWrap);
      li.appendChild(label);
      list.appendChild(li);

      // Click to place at viewport center
      li.addEventListener('click', () => {
        const pos = App.Canvas.getViewportCenter();
        App.History.push();
        App.Shapes.createShape(descriptor.type, pos);
      });

      // Drag start
      li.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', descriptor.type);
      });
    });
  }

  function _bindCanvasDrop() {
    const wrap = document.getElementById('canvas-wrap');

    wrap.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/plain');
      if (!type || !type.startsWith('archd.')) return;
      const pos = App.Canvas.clientToGraph(e.clientX, e.clientY);
      App.History.push();
      App.Shapes.createShape(type, pos);
    });
  }

  return { init, render };
})();
