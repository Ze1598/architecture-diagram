/* mermaid-export.js — lossy Mermaid/Markdown export of diagram topology */

App.MermaidExport = (function () {

  // Map archd shape types to Mermaid node syntax wrappers [open, close]
  const SHAPE_WRAP = {
    'archd.Rectangle':    ['["', '"]'],
    'archd.RoundedRect':  ['(["', '"])'],
    'archd.Ellipse':      ['(("', '"))'],
    'archd.Diamond':      ['{"',  '"}'],
    'archd.Cylinder':     ['[("', '")]'],
    'archd.Cloud':        ['("',  '")'],
    'archd.Hexagon':      ['{{"', '"}}'],
    'archd.Parallelogram':['[/"', '"/]'],
    'archd.Actor':        ['(["', '"])'],
    'archd.StickyNote':   ['["', '"]'],
  };

  // Types that are pure visual and carry no topology
  const SKIP_TYPES = new Set(['archd.TextLabel', 'archd.ImageShape']);

  function _sanitizeId(raw) {
    return raw.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  function _sanitizeLabel(text) {
    return (text || '').replace(/"/g, "'").replace(/\n/g, ' ').trim() || ' ';
  }

  function build() {
    const graph    = App.Canvas.graph;
    const elements = graph.getElements().filter(e => !SKIP_TYPES.has(e.get('type')));
    const links    = graph.getLinks();

    if (elements.length === 0) return null;

    const idMap = new Map();
    elements.forEach((el, i) => {
      idMap.set(el.id, 'node' + i);
    });

    const lines = ['flowchart TD'];

    elements.forEach(el => {
      const nodeId  = idMap.get(el.id);
      const type    = el.get('type');
      const label   = _sanitizeLabel(el.attr('label/text'));
      const wrap    = SHAPE_WRAP[type] || ['["', '"]'];
      lines.push('  ' + nodeId + wrap[0] + label + wrap[1]);
    });

    links.forEach(link => {
      const srcId  = idMap.get(link.get('source').id);
      const tgtId  = idMap.get(link.get('target').id);
      if (!srcId || !tgtId) return;

      const labels   = link.labels() || [];
      const linkText = labels.length > 0 && labels[0].attrs && labels[0].attrs.text
        ? _sanitizeLabel(labels[0].attrs.text.text) : '';

      const tgtMarker = link.attr('line/targetMarker') || {};
      const srcMarker = link.attr('line/sourceMarker') || {};
      const hasTgt    = tgtMarker.d && tgtMarker.d.length > 0;
      const hasSrc    = srcMarker.d && srcMarker.d.length > 0;
      const isDashed  = !!(link.attr('line/strokeDasharray') || '').trim();

      let arrow;
      if (isDashed) {
        arrow = hasTgt ? '-.->': '-.-';
      } else {
        arrow = hasTgt ? '-->' : '---';
      }
      if (hasSrc && hasTgt) arrow = '<' + arrow;

      const edgeLine = linkText
        ? `  ${srcId} ${arrow}|"${linkText}"| ${tgtId}`
        : `  ${srcId} ${arrow} ${tgtId}`;

      lines.push(edgeLine);
    });

    return lines.join('\n');
  }

  function exportToFile() {
    const mermaid = build();
    if (!mermaid) {
      alert('Nothing to export — no connectable shapes on the canvas.');
      return;
    }
    const md = '```mermaid\n' + mermaid + '\n```\n';
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const name = ((App.Model.current && App.Model.current.document && App.Model.current.document.name) || 'diagram')
      .replace(/[/\\?%*:|"<>]/g, '_');
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = name + '.md';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return { build, exportToFile };
})();
