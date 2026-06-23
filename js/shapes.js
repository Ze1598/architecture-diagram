/* shapes.js — custom shape definitions and factory */

App.Shapes = (function () {

  const PORT_GROUPS = {
    ports: {
      groups: {
        cardinal: {
          position: 'absolute',
          attrs: {
            circle: {
              r: 6,
              magnet: true,
              stroke: '#4a7cf6',
              fill: '#ffffff',
              strokeWidth: 1.5,
              cursor: 'crosshair'
            }
          }
        }
      },
      items: [
        { group: 'cardinal', args: { x: '50%', y: '0%'   }, id: 'top'    },
        { group: 'cardinal', args: { x: '100%', y: '50%' }, id: 'right'  },
        { group: 'cardinal', args: { x: '50%', y: '100%' }, id: 'bottom' },
        { group: 'cardinal', args: { x: '0%',  y: '50%'  }, id: 'left'   }
      ]
    }
  };

  function _ports() {
    return JSON.parse(JSON.stringify(PORT_GROUPS));
  }

  // ---- Shape definitions ----

  const Rectangle = joint.dia.Element.define('archd.Rectangle', {
    attrs: {
      body: { refWidth: '100%', refHeight: '100%', fill: '#ffffff', stroke: '#333333', strokeWidth: 1.5, rx: 0, ry: 0 },
      label: { refX: '50%', refY: '50%', textAnchor: 'middle', textVerticalAnchor: 'middle', fill: '#333333', fontSize: 13, fontFamily: 'inherit' }
    },
    ..._ports()
  }, {
    markup: [
      { tagName: 'rect',  selector: 'body'  },
      { tagName: 'text',  selector: 'label' }
    ]
  });

  const RoundedRect = joint.dia.Element.define('archd.RoundedRect', {
    attrs: {
      body: { refWidth: '100%', refHeight: '100%', fill: '#ffffff', stroke: '#333333', strokeWidth: 1.5, rx: 12, ry: 12 },
      label: { refX: '50%', refY: '50%', textAnchor: 'middle', textVerticalAnchor: 'middle', fill: '#333333', fontSize: 13, fontFamily: 'inherit' }
    },
    ..._ports()
  }, {
    markup: [
      { tagName: 'rect',  selector: 'body'  },
      { tagName: 'text',  selector: 'label' }
    ]
  });

  const Ellipse = joint.dia.Element.define('archd.Ellipse', {
    attrs: {
      body: { refCx: '50%', refCy: '50%', refRx: '50%', refRy: '50%', fill: '#ffffff', stroke: '#333333', strokeWidth: 1.5 },
      label: { refX: '50%', refY: '50%', textAnchor: 'middle', textVerticalAnchor: 'middle', fill: '#333333', fontSize: 13, fontFamily: 'inherit' }
    },
    ..._ports()
  }, {
    markup: [
      { tagName: 'ellipse', selector: 'body'  },
      { tagName: 'text',    selector: 'label' }
    ]
  });

  const Diamond = joint.dia.Element.define('archd.Diamond', {
    attrs: {
      body: {
        refPoints: '50,0 100,50 50,100 0,50',
        fill: '#ffffff', stroke: '#333333', strokeWidth: 1.5
      },
      label: { refX: '50%', refY: '50%', textAnchor: 'middle', textVerticalAnchor: 'middle', fill: '#333333', fontSize: 13, fontFamily: 'inherit' }
    },
    ..._ports()
  }, {
    markup: [
      { tagName: 'polygon', selector: 'body'  },
      { tagName: 'text',    selector: 'label' }
    ]
  });

  const Cylinder = joint.dia.Element.define('archd.Cylinder', {
    attrs: {
      body: {
        // Main rectangle body — drawn slightly below the top ellipse
        refX: 0, refY: '12%', refWidth: '100%', refHeight: '88%',
        fill: '#ffffff', stroke: '#333333', strokeWidth: 1.5
      },
      top: {
        // Top ellipse cap
        refCx: '50%', refCy: '12%', refRx: '50%', ry: 10,
        fill: '#e8e8e8', stroke: '#333333', strokeWidth: 1.5
      },
      label: { refX: '50%', refY: '60%', textAnchor: 'middle', textVerticalAnchor: 'middle', fill: '#333333', fontSize: 13, fontFamily: 'inherit' }
    },
    ..._ports()
  }, {
    markup: [
      { tagName: 'rect',    selector: 'body'  },
      { tagName: 'ellipse', selector: 'top'   },
      { tagName: 'text',    selector: 'label' }
    ]
  });

  const Cloud = joint.dia.Element.define('archd.Cloud', {
    attrs: {
      body: {
        // Cloud path — will be set via refD after sizing
        d: 'M 50,80 C 20,80 5,65 5,50 C 5,38 12,28 22,24 C 22,12 32,4 44,4 C 50,4 56,7 60,12 C 64,6 72,2 81,2 C 94,2 104,12 104,25 C 112,25 120,33 120,42 C 120,55 110,62 98,62 C 96,72 88,80 78,80 Z',
        fill: '#ffffff', stroke: '#333333', strokeWidth: 1.5
      },
      label: { refX: '50%', refY: '55%', textAnchor: 'middle', textVerticalAnchor: 'middle', fill: '#333333', fontSize: 13, fontFamily: 'inherit' }
    },
    ..._ports()
  }, {
    markup: [
      { tagName: 'path', selector: 'body'  },
      { tagName: 'text', selector: 'label' }
    ]
  });

  const Hexagon = joint.dia.Element.define('archd.Hexagon', {
    attrs: {
      body: {
        refPoints: '25,0 75,0 100,50 75,100 25,100 0,50',
        fill: '#ffffff', stroke: '#333333', strokeWidth: 1.5
      },
      label: { refX: '50%', refY: '50%', textAnchor: 'middle', textVerticalAnchor: 'middle', fill: '#333333', fontSize: 13, fontFamily: 'inherit' }
    },
    ..._ports()
  }, {
    markup: [
      { tagName: 'polygon', selector: 'body'  },
      { tagName: 'text',    selector: 'label' }
    ]
  });

  const Parallelogram = joint.dia.Element.define('archd.Parallelogram', {
    attrs: {
      body: {
        refPoints: '20,0 100,0 80,100 0,100',
        fill: '#ffffff', stroke: '#333333', strokeWidth: 1.5
      },
      label: { refX: '50%', refY: '50%', textAnchor: 'middle', textVerticalAnchor: 'middle', fill: '#333333', fontSize: 13, fontFamily: 'inherit' }
    },
    ..._ports()
  }, {
    markup: [
      { tagName: 'polygon', selector: 'body'  },
      { tagName: 'text',    selector: 'label' }
    ]
  });

  const Actor = joint.dia.Element.define('archd.Actor', {
    attrs: {
      head: { refCx: '50%', refCy: '15%', r: 12, fill: '#ffffff', stroke: '#333333', strokeWidth: 1.5 },
      body: {
        d: 'M 50,27 L 50,65 M 20,40 L 80,40 M 50,65 L 20,90 M 50,65 L 80,90',
        fill: 'none', stroke: '#333333', strokeWidth: 1.5, strokeLinecap: 'round'
      },
      label: { refX: '50%', refY: '95%', textAnchor: 'middle', textVerticalAnchor: 'top', fill: '#333333', fontSize: 12, fontFamily: 'inherit' }
    },
    ..._ports()
  }, {
    markup: [
      { tagName: 'circle', selector: 'head'  },
      { tagName: 'path',   selector: 'body'  },
      { tagName: 'text',   selector: 'label' }
    ]
  });

  const StickyNote = joint.dia.Element.define('archd.StickyNote', {
    attrs: {
      body: { refWidth: '100%', refHeight: '100%', fill: '#fff9c4', stroke: '#f0c040', strokeWidth: 1.5, rx: 2 },
      fold: {
        // Dog-ear triangle at top-right
        refPoints: '80,0 100,0 100,20',
        fill: '#f0c040', stroke: '#f0c040', strokeWidth: 1
      },
      label: { refX: '10%', refY: '20%', refWidth: '80%', textAnchor: 'middle', refX2: '50%', textVerticalAnchor: 'top', fill: '#333333', fontSize: 12, fontFamily: 'inherit' }
    },
    ..._ports()
  }, {
    markup: [
      { tagName: 'rect',    selector: 'body'  },
      { tagName: 'polygon', selector: 'fold'  },
      { tagName: 'text',    selector: 'label' }
    ]
  });

  const TextLabel = joint.dia.Element.define('archd.TextLabel', {
    attrs: {
      label: { refX: '50%', refY: '50%', textAnchor: 'middle', textVerticalAnchor: 'middle', fill: '#333333', fontSize: 14, fontFamily: 'inherit', fontWeight: '500' }
    }
    // No ports on text label
  }, {
    markup: [
      { tagName: 'text', selector: 'label' }
    ]
  });

  // Generic image shape — holds pasted images and uploaded custom shapes
  const ImageShape = joint.dia.Element.define('archd.ImageShape', {
    attrs: {
      body: { refWidth: '100%', refHeight: '100%', fill: 'none', stroke: '#d0d0d0', strokeWidth: 1 },
      image: { refWidth: '100%', refHeight: '100%', preserveAspectRatio: 'xMidYMid meet' },
      label: { refX: '50%', refY: '108%', textAnchor: 'middle', textVerticalAnchor: 'top', fill: '#555555', fontSize: 11, fontFamily: 'inherit' }
    },
    ...JSON.parse(JSON.stringify(PORT_GROUPS))
  }, {
    markup: [
      { tagName: 'rect',  selector: 'body'  },
      { tagName: 'image', selector: 'image' },
      { tagName: 'text',  selector: 'label' }
    ]
  });

  // ---- Namespace for graph.fromJSON reconstruction ----

  const namespace = Object.assign({}, joint.shapes);
  namespace.archd = {
    Rectangle,
    RoundedRect,
    Ellipse,
    Diamond,
    Cylinder,
    Cloud,
    Hexagon,
    Parallelogram,
    Actor,
    StickyNote,
    TextLabel,
    ImageShape
  };

  // ---- Shape descriptors for palette ----

  const TYPES = [
    {
      type: 'archd.Rectangle',
      label: 'Rectangle',
      defaultSize: { width: 120, height: 60 },
      icon: `<svg viewBox="0 0 32 24" width="32" height="24"><rect x="2" y="3" width="28" height="18" rx="0" fill="#fff" stroke="#555" stroke-width="1.5"/></svg>`
    },
    {
      type: 'archd.RoundedRect',
      label: 'Rounded Rect',
      defaultSize: { width: 120, height: 60 },
      icon: `<svg viewBox="0 0 32 24" width="32" height="24"><rect x="2" y="3" width="28" height="18" rx="6" fill="#fff" stroke="#555" stroke-width="1.5"/></svg>`
    },
    {
      type: 'archd.Ellipse',
      label: 'Ellipse',
      defaultSize: { width: 120, height: 70 },
      icon: `<svg viewBox="0 0 32 24" width="32" height="24"><ellipse cx="16" cy="12" rx="14" ry="9" fill="#fff" stroke="#555" stroke-width="1.5"/></svg>`
    },
    {
      type: 'archd.Diamond',
      label: 'Diamond',
      defaultSize: { width: 120, height: 80 },
      icon: `<svg viewBox="0 0 32 24" width="32" height="24"><polygon points="16,2 30,12 16,22 2,12" fill="#fff" stroke="#555" stroke-width="1.5"/></svg>`
    },
    {
      type: 'archd.Cylinder',
      label: 'Cylinder / DB',
      defaultSize: { width: 100, height: 80 },
      icon: `<svg viewBox="0 0 32 24" width="32" height="24"><rect x="4" y="6" width="24" height="14" fill="#fff" stroke="#555" stroke-width="1.5"/><ellipse cx="16" cy="6" rx="12" ry="4" fill="#e0e0e0" stroke="#555" stroke-width="1.5"/></svg>`
    },
    {
      type: 'archd.Cloud',
      label: 'Cloud',
      defaultSize: { width: 140, height: 90 },
      icon: `<svg viewBox="0 0 32 24" width="32" height="24"><path d="M16,20 C8,20 2,16 2,11 C2,7 5,4 9,3 C10,1 13,0 16,0 C19,0 22,1 24,3 C27,3 30,6 30,9 C30,14 26,17 22,17 C21,20 18,20 16,20 Z" fill="#fff" stroke="#555" stroke-width="1.5"/></svg>`
    },
    {
      type: 'archd.Hexagon',
      label: 'Hexagon',
      defaultSize: { width: 120, height: 80 },
      icon: `<svg viewBox="0 0 32 24" width="32" height="24"><polygon points="8,2 24,2 30,12 24,22 8,22 2,12" fill="#fff" stroke="#555" stroke-width="1.5"/></svg>`
    },
    {
      type: 'archd.Parallelogram',
      label: 'Parallelogram',
      defaultSize: { width: 130, height: 60 },
      icon: `<svg viewBox="0 0 32 24" width="32" height="24"><polygon points="7,3 30,3 25,21 2,21" fill="#fff" stroke="#555" stroke-width="1.5"/></svg>`
    },
    {
      type: 'archd.Actor',
      label: 'Actor',
      defaultSize: { width: 60, height: 100 },
      icon: `<svg viewBox="0 0 32 32" width="24" height="32"><circle cx="16" cy="6" r="5" fill="#fff" stroke="#555" stroke-width="1.5"/><line x1="16" y1="11" x2="16" y2="22" stroke="#555" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="16" x2="26" y2="16" stroke="#555" stroke-width="1.5" stroke-linecap="round"/><line x1="16" y1="22" x2="7" y2="30" stroke="#555" stroke-width="1.5" stroke-linecap="round"/><line x1="16" y1="22" x2="25" y2="30" stroke="#555" stroke-width="1.5" stroke-linecap="round"/></svg>`
    },
    {
      type: 'archd.StickyNote',
      label: 'Sticky Note',
      defaultSize: { width: 110, height: 90 },
      icon: `<svg viewBox="0 0 32 28" width="32" height="28"><rect x="2" y="2" width="28" height="24" rx="2" fill="#fff9c4" stroke="#f0c040" stroke-width="1.5"/><polygon points="22,2 30,2 30,10" fill="#f0c040"/></svg>`
    },
    {
      type: 'archd.TextLabel',
      label: 'Text Label',
      defaultSize: { width: 100, height: 30 },
      icon: `<svg viewBox="0 0 32 20" width="32" height="20"><text x="16" y="14" text-anchor="middle" font-size="13" fill="#555" font-family="sans-serif" font-weight="600">T</text></svg>`
    }
  ];

  function createImageShape(dataUrl, position, naturalW, naturalH, labelText) {
    const MAX = 300;
    const ratio = (naturalW || 1) / (naturalH || 1);
    let w = naturalW || 200, h = naturalH || 200;
    if (w > MAX || h > MAX) {
      if (w >= h) { w = MAX; h = Math.round(MAX / ratio); }
      else        { h = MAX; w = Math.round(MAX * ratio); }
    }
    const el = new ImageShape();
    el.resize(w, h);
    el.position(
      Math.round((position.x - w / 2) / 10) * 10,
      Math.round((position.y - h / 2) / 10) * 10
    );
    el.attr('image/href', dataUrl);
    el.attr('label/text', labelText || '');
    App.Canvas.graph.addCell(el);
    return el;
  }

  function createShape(type, position, extraAttrs) {
    const descriptor = TYPES.find(t => t.type === type);
    if (!descriptor) throw new Error('Unknown shape type: ' + type);

    const ShapeClass = _resolveClass(type);
    if (!ShapeClass) throw new Error('Shape class not found: ' + type);

    const el = new ShapeClass();
    el.resize(descriptor.defaultSize.width, descriptor.defaultSize.height);
    el.position(
      Math.round((position.x - descriptor.defaultSize.width  / 2) / 10) * 10,
      Math.round((position.y - descriptor.defaultSize.height / 2) / 10) * 10
    );
    el.attr('label/text', descriptor.label);
    if (extraAttrs) el.attr(extraAttrs);
    App.Canvas.graph.addCell(el);
    return el;
  }

  function _resolveClass(type) {
    const parts = type.split('.');
    let obj = namespace;
    for (const part of parts) {
      obj = obj && obj[part];
    }
    return obj || null;
  }

  return {
    namespace,
    TYPES,
    createShape,
    createImageShape
  };
})();
