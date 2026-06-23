/* layout.js — auto-layout using dagre (vendor/dagre.js) */

App.Layout = (function () {

  function applyDagre(direction) {
    if (typeof dagre === 'undefined') {
      alert('dagre.js not loaded. Check that vendor/dagre.js is present.');
      return;
    }

    const graph    = App.Canvas.graph;
    const elements = graph.getElements();
    const links    = graph.getLinks();

    if (elements.length === 0) return;

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir:  direction || 'TB',
      ranksep:  80,
      nodesep:  50,
      marginx:  40,
      marginy:  40
    });
    g.setDefaultEdgeLabel(() => ({}));

    elements.forEach(el => {
      const { width, height } = el.size();
      g.setNode(el.id, { width, height, label: el.id });
    });

    links.forEach(link => {
      const src = (link.get('source') || {}).id;
      const tgt = (link.get('target') || {}).id;
      if (src && tgt && g.hasNode(src) && g.hasNode(tgt)) {
        g.setEdge(src, tgt);
      }
    });

    dagre.layout(g);

    App.History.push();
    elements.forEach(el => {
      const node = g.node(el.id);
      if (node) {
        el.position(
          Math.round((node.x - node.width  / 2) / 10) * 10,
          Math.round((node.y - node.height / 2) / 10) * 10
        );
      }
    });
  }

  return { applyDagre };
})();
