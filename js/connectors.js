/* connectors.js — link defaults, routing, arrowheads */

App.Connectors = (function () {

  const ARROWHEAD_STYLES = {
    none:     { type: 'path', d: '',                           fill: 'none',    stroke: 'none' },
    arrow:    { type: 'path', d: 'M 10 -5 0 0 10 5 z',        fill: 'inherit', stroke: 'none' },
    openArrow:{ type: 'path', d: 'M 10 -5 0 0 10 5',          fill: 'none',    stroke: 'inherit', strokeWidth: 1.5 },
    diamond:  { type: 'path', d: 'M 10 0 5 -5 0 0 5 5 z',     fill: 'inherit', stroke: 'none' },
    circle:   { type: 'ellipse', rx: 5, ry: 5, cx: 5, cy: 0,  fill: 'inherit', stroke: 'none' }
  };

  function createLink(opts) {
    opts = opts || {};
    const link = new joint.shapes.standard.Link({
      source: opts.source || {},
      target: opts.target || {},
      router: opts.router || { name: 'orthogonal', args: { padding: 20 } },
      connector: { name: 'rounded', args: { radius: 6 } },
      attrs: {
        line: {
          stroke: opts.stroke || '#333333',
          strokeWidth: opts.strokeWidth || 1.5,
          strokeDasharray: opts.strokeDasharray || '',
          targetMarker: ARROWHEAD_STYLES.arrow,
          sourceMarker: ARROWHEAD_STYLES.none
        }
      },
      labels: opts.labels || []
    });
    App.Canvas.graph.addCell(link);
    return link;
  }

  function setRouter(link, routerName) {
    link.set('router', { name: routerName, args: { padding: 20 } });
  }

  function setArrowhead(link, end, styleName) {
    const style = ARROWHEAD_STYLES[styleName] || ARROWHEAD_STYLES.none;
    const attrPath = end === 'source' ? 'line/sourceMarker' : 'line/targetMarker';
    link.attr(attrPath, style);
  }

  function init() {
    // Wire link:connect / link:disconnect to history
    App.Canvas.paper.on('link:connect link:disconnect', () => {
      App.History.push();
    });
  }

  return {
    ARROWHEAD_STYLES,
    createLink,
    setRouter,
    setArrowhead,
    init
  };
})();
