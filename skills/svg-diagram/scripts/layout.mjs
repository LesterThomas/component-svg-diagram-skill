// Diagram model → SVG, drawn with D3 into a jsdom document. See spec §5.
import * as d3 from 'd3';
import { JSDOM } from 'jsdom';

const FONT = 'Arial, Helvetica, sans-serif';
const C = { box: '#404040', ink: '#000000', paper: '#ffffff', muted: '#666666', onBox: '#cfcfcf' };
// Subtle per-function tints: stroke for the connector, fill for the glyph head and label pill.
export const FN_COLOR = {
  core: { stroke: '#4c9a52', fill: '#e8f5e9', name: 'Core function' },
  management: { stroke: '#4a7fbf', fill: '#e7eff9', name: 'Management function' },
  security: { stroke: '#c0504d', fill: '#fbeaea', name: 'Security function' },
};

// Helvetica advance widths (1/1000 em) for ASCII 32..126 — no text metrics in Node.
const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
export function textWidth(s, size = 12, bold = false) {
  let w = 0;
  for (const ch of String(s)) { const c = ch.charCodeAt(0); w += (c >= 32 && c <= 126 ? W[c - 32] : 600); }
  return (w / 1000) * size * (bold ? 1.07 : 1);
}

// Greedy word wrap to at most `maxLines` lines within `maxW` px.
function wrap(s, maxW, size, maxLines = 2) {
  const words = String(s).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textWidth(next, size) <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    head.push(lines.slice(maxLines - 1).join(' '));
    return head;
  }
  return lines;
}

const L = {
  margin: 30, titleH: 50, fs: 12,
  boxPad: 30, rectH: 30, rectGap: 10, rectMinW: 560, emptyBoxW: 380,
  sidCols: 3, sidH: 38, sidGap: 16, sidTop: 40,
  apiPitch: 46, groupGap: 20, stub: 150, r: 10, labelGap: 24,
  noteH: 30, legendH: 64, legendGap: 30,
};

// Row offsets for one side: even pitch, with an extra gap wherever the function changes.
function rowOffsets(apis, boxH) {
  if (!apis.length) return [];
  const breaks = apis.reduce((n, a, i) => n + (i && a.fn !== apis[i - 1].fn ? 1 : 0), 0);
  const avail = boxH - L.boxPad * 2 - breaks * L.groupGap;
  const pitch = Math.min(L.apiPitch * 1.3, avail / apis.length);
  let y = L.boxPad, prev = null;
  return apis.map((a) => {
    if (prev && a.fn !== prev) y += L.groupGap;
    prev = a.fn;
    const at = y + pitch / 2;
    y += pitch;
    return at;
  });
}

export function renderSvg(model) {
  const { document, XMLSerializer } = new JSDOM('<!DOCTYPE html><body></body>').window;
  const fs = L.fs;
  const isImpl = model.kind === 'implementation';
  const color = (d) => FN_COLOR[d.fn] ?? FN_COLOR.core;

  // ---- measure --------------------------------------------------------------
  const pillPad = 5;
  const labelW = (apis) => Math.max(0, ...apis.map((a) => textWidth(a.label, fs, a.required) + pillPad * 2));
  const leftGutter = Math.max(L.stub, labelW(model.dependent) + L.labelGap) + L.r * 2;
  const rightGutter = Math.max(L.stub, labelW(model.exposed) + L.labelGap) + L.r * 2;

  // A published spec with no eTOMs gets an explicit "none assigned" row; an implementation
  // simply doesn't carry eTOM/SID mappings, so its box is left compact instead.
  const etoms = model.etoms.length || isImpl ? model.etoms
    : [{ label: 'No eTOM business activities assigned', tooltip: 'componentMetadata.eTOMs is empty', placeholder: true }];
  const hasContent = etoms.length || model.sids.length;
  const rectW = hasContent ? Math.max(L.rectMinW, ...etoms.map((e) => textWidth(e.label, fs) + 16)) : L.emptyBoxW - L.boxPad * 2;
  const boxW = rectW + L.boxPad * 2;
  const etomH = etoms.length ? etoms.length * (L.rectH + L.rectGap) - L.rectGap : 0;
  const sidRows = Math.ceil(model.sids.length / L.sidCols);
  const sidH = sidRows ? (etomH ? L.sidTop : 0) + sidRows * (L.sidH + L.sidGap) - L.sidGap : 0;
  const contentH = L.boxPad * 2 + etomH + sidH;
  const groupCount = (apis) => new Set(apis.map((a) => a.fn)).size;
  const apiH = (apis) => L.boxPad * 2 + apis.length * L.apiPitch + Math.max(0, groupCount(apis) - 1) * L.groupGap;
  const boxH = Math.max(contentH, apiH(model.dependent), apiH(model.exposed), 200);

  const fnsShown = Object.keys(FN_COLOR).filter((fn) =>
    [...model.exposed, ...model.dependent].some((a) => a.fn === fn));
  // Legend: shape key (eTOM/SID only when the diagram can contain them) + colour key when >1 function.
  const legend = {
    shapes: isImpl ? ['dependent', 'exposed', ...(etoms.length ? ['etom'] : []), ...(model.sids.length ? ['sid'] : [])]
      : ['etom', 'sid', 'dependent', 'exposed'],
    fns: fnsShown.length > 1 || isImpl ? fnsShown : [],
  };
  const legendMinW = 140 + legendWidths(legend).reduce((a, b) => a + b, 0) + 30;

  const notes = [
    `Source: ${model.source}${model.functionalBlock ? ` · ${model.functionalBlock}` : ''} · bold API = required`,
    ...(model.sourceDetail ? [model.sourceDetail] : []),
  ];
  const noteW = Math.max(...notes.map((n) => textWidth(n, 11))) + leftGutter;
  const contentW = leftGutter + boxW + rightGutter;
  const titleW = textWidth(model.title, 16, true);
  const pageW = L.margin * 2 + Math.max(contentW, legendMinW, titleW, noteW);
  const originX = L.margin + Math.round((pageW - L.margin * 2 - contentW) / 2); // centre the diagram
  const boxX = Math.round(originX + leftGutter), boxY = L.margin + L.titleH;
  const legendY = boxY + boxH + L.noteH + (notes.length - 1) * 14 + L.legendGap;
  const pageH = legendY + L.legendH + L.margin;

  // ---- draw -----------------------------------------------------------------
  const svg = d3.select(document.body).append('svg')
    .attr('xmlns', 'http://www.w3.org/2000/svg')
    .attr('version', '1.1')
    .attr('width', Math.ceil(pageW)).attr('height', Math.ceil(pageH))
    .attr('viewBox', `0 0 ${Math.ceil(pageW)} ${Math.ceil(pageH)}`)
    .attr('font-family', FONT).attr('font-size', fs);
  svg.append('title').text(model.title);
  svg.append('desc').text(
    `ODA component architecture for ${model.id} (${model.source}, ${model.status}). ` +
    `Exposed APIs on the right, dependent APIs on the left; green = core, blue = management, red = security function. ` +
    `Generated by skills/svg-diagram.`);
  svg.append('rect').attr('width', '100%').attr('height', '100%').attr('fill', C.paper);

  svg.append('text').attr('x', L.margin).attr('y', L.margin + 10)
    .attr('font-size', 16).attr('font-weight', 'bold').attr('fill', C.ink).text(model.title);
  if (isImpl) {
    svg.append('text').attr('x', L.margin).attr('y', L.margin + 30).attr('fill', C.muted).text('Reference implementation');
  }

  // component box
  const box = svg.append('g').attr('id', 'component').attr('transform', `translate(${boxX},${boxY})`);
  box.append('rect').attr('width', boxW).attr('height', boxH).attr('fill', C.box).attr('stroke', C.ink);
  if (!hasContent) {
    box.append('text').attr('x', boxW / 2).attr('y', boxH / 2).attr('text-anchor', 'middle')
      .attr('font-style', 'italic').attr('fill', C.onBox)
      .text('No eTOM / SID mapping in implementation');
  }

  // eTOM activities
  const et = box.append('g').attr('id', 'etoms').selectAll('g').data(etoms).join('g')
    .attr('class', 'etom')
    .attr('transform', (_, i) => `translate(${L.boxPad},${L.boxPad + i * (L.rectH + L.rectGap)})`);
  et.append('title').text((d) => d.tooltip);
  et.append('rect').attr('width', rectW).attr('height', L.rectH).attr('fill', C.paper).attr('stroke', C.ink);
  et.append('text').attr('x', 6).attr('y', L.rectH / 2).attr('dy', '0.35em')
    .attr('fill', (d) => (d.placeholder ? C.muted : C.ink))
    .attr('font-style', (d) => (d.placeholder ? 'italic' : null))
    .text((d) => d.label);

  // SID entities as cylinders
  const colW = (rectW - (L.sidCols - 1) * L.sidGap) / L.sidCols;
  const cylW = Math.min(colW, 200), ry = 5;
  const sidY0 = L.boxPad + etomH + (etomH ? L.sidTop : 0);
  const sid = box.append('g').attr('id', 'sids').selectAll('g').data(model.sids).join('g')
    .attr('class', 'sid')
    .attr('transform', (_, i) => {
      const col = i % L.sidCols, row = Math.floor(i / L.sidCols);
      const x = L.boxPad + col * (colW + L.sidGap) + (colW - cylW) / 2;
      return `translate(${x},${sidY0 + row * (L.sidH + L.sidGap)})`;
    });
  sid.append('title').text((d) => d.tooltip);
  sid.append('path').attr('fill', C.paper).attr('stroke', C.ink)
    .attr('d', `M0,${ry} A${cylW / 2},${ry} 0 0 1 ${cylW},${ry} V${L.sidH - ry} A${cylW / 2},${ry} 0 0 1 0,${L.sidH - ry} Z`);
  sid.append('path').attr('fill', 'none').attr('stroke', C.ink)
    .attr('d', `M0,${ry} A${cylW / 2},${ry} 0 0 0 ${cylW},${ry}`);
  sid.each(function (d) {
    const lines = wrap(d.label, cylW - 10, fs);
    const t = d3.select(this).append('text').attr('text-anchor', 'middle').attr('fill', C.ink);
    const cy = ry + (L.sidH - ry) / 2 - ((lines.length - 1) * 13) / 2;
    lines.forEach((ln, i) => t.append('tspan').attr('x', cylW / 2).attr('y', cy + i * 13).attr('dy', '0.35em').text(ln));
  });

  // API label with a subtle function-coloured pill behind it, centred on cx.
  const label = (sel, cx) => {
    sel.append('rect')
      .attr('x', (d) => cx - (textWidth(d.label, fs, d.required) / 2 + pillPad)).attr('y', -23)
      .attr('width', (d) => textWidth(d.label, fs, d.required) + pillPad * 2).attr('height', 17).attr('rx', 3)
      .attr('fill', (d) => color(d).fill);
    sel.append('text').attr('x', cx).attr('y', -10).attr('text-anchor', 'middle')
      .attr('fill', C.ink).attr('font-weight', (d) => (d.required ? 'bold' : null)).text((d) => d.label);
  };

  // dependent (left): socket = half circle opening to the left, line into the box
  const depY = rowOffsets(model.dependent, boxH);
  const dep = svg.append('g').attr('id', 'dependent-apis').selectAll('g').data(model.dependent).join('g')
    .attr('class', 'dependent-api').attr('data-api', (d) => d.id).attr('data-function', (d) => d.fn)
    .attr('transform', (_, i) => `translate(${originX},${boxY + depY[i]})`);
  dep.append('title').text((d) => d.tooltip);
  dep.append('path').attr('fill', 'none').attr('stroke', (d) => color(d).stroke).attr('stroke-width', 2.5)
    .attr('d', `M${L.r},${-L.r} A${L.r},${L.r} 0 0 1 ${L.r},${L.r}`);
  dep.append('line').attr('x1', L.r * 2).attr('x2', leftGutter).attr('y1', 0).attr('y2', 0)
    .attr('stroke', (d) => color(d).stroke).attr('stroke-width', 2);
  label(dep, L.r + leftGutter / 2);

  // exposed (right): lollipop = line out of the box ending in a circle
  const expY = rowOffsets(model.exposed, boxH);
  const exp = svg.append('g').attr('id', 'exposed-apis').selectAll('g').data(model.exposed).join('g')
    .attr('class', 'exposed-api').attr('data-api', (d) => d.id).attr('data-function', (d) => d.fn)
    .attr('transform', (_, i) => `translate(${boxX + boxW},${boxY + expY[i]})`);
  exp.append('title').text((d) => d.tooltip);
  exp.append('line').attr('x1', 0).attr('x2', rightGutter - L.r * 2).attr('y1', 0).attr('y2', 0)
    .attr('stroke', (d) => color(d).stroke).attr('stroke-width', 2);
  exp.append('circle').attr('cx', rightGutter - L.r).attr('cy', 0).attr('r', L.r)
    .attr('fill', (d) => color(d).fill).attr('stroke', (d) => color(d).stroke).attr('stroke-width', 2);
  label(exp, (rightGutter - L.r) / 2);

  // note under the box
  notes.forEach((n, i) => svg.append('text').attr('x', boxX).attr('y', boxY + boxH + 20 + i * 14)
    .attr('font-style', 'italic').attr('font-size', 11).attr('fill', C.muted).text(n));

  drawLegend(svg, L.margin, legendY, pageW - L.margin * 2, L.legendH, legend);

  return new XMLSerializer().serializeToString(svg.node()) + '\n';
}

const LEGEND_LABEL = { etom: 'eTOM Business Activity', sid: 'SID Data Entity', dependent: 'Dependent API', exposed: 'Exposed API' };
const legendWidths = ({ shapes, fns }) =>
  [...shapes.map((k) => LEGEND_LABEL[k]), ...fns.map((f) => FN_COLOR[f].name)].map((t) => 60 + textWidth(t) + 30);

function drawLegend(svg, x, y, w, h, { shapes, fns }) {
  const g = svg.append('g').attr('id', 'legend').attr('transform', `translate(${x},${y})`);
  g.append('rect').attr('width', w).attr('height', h).attr('rx', h / 2)
    .attr('fill', C.paper).attr('stroke', C.ink).attr('stroke-width', 1.5);
  g.append('text').attr('x', 40).attr('y', h / 2).attr('dy', '0.35em').attr('font-weight', 'bold').text('LEGEND');

  const core = FN_COLOR.core;
  // Items sit at their natural widths, with the leftover space shared out evenly between them.
  const keys = [...shapes, ...fns], widths = legendWidths({ shapes, fns });
  const spare = Math.max(0, (w - 170 - widths.reduce((a, b) => a + b, 0)) / keys.length);
  const xs = widths.map((_, i) => 140 + widths.slice(0, i).reduce((a, b) => a + b + spare, 0));
  const cy = h / 2;
  const item = (key, label, draw) => {
    const i = keys.indexOf(key);
    if (i < 0) return;
    const s = g.append('g').attr('transform', `translate(${xs[i]},${cy})`);
    draw(s);
    s.append('text').attr('x', 60).attr('dy', '0.35em').attr('fill', C.ink).text(label);
  };
  item('etom', LEGEND_LABEL.etom, (s) =>
    s.append('rect').attr('x', 0).attr('y', -10).attr('width', 50).attr('height', 20).attr('fill', C.paper).attr('stroke', C.ink));
  item('sid', LEGEND_LABEL.sid, (s) => {
    s.append('path').attr('fill', C.paper).attr('stroke', C.ink)
      .attr('d', 'M0,-8 A25,4 0 0 1 50,-8 V8 A25,4 0 0 1 0,8 Z');
    s.append('path').attr('fill', 'none').attr('stroke', C.ink).attr('d', 'M0,-8 A25,4 0 0 0 50,-8');
  });
  item('dependent', LEGEND_LABEL.dependent, (s) => {
    s.append('path').attr('fill', 'none').attr('stroke', core.stroke).attr('stroke-width', 2.5).attr('d', 'M10,-10 A10,10 0 0 1 10,10');
    s.append('line').attr('x1', 20).attr('x2', 50).attr('stroke', core.stroke).attr('stroke-width', 2);
  });
  item('exposed', LEGEND_LABEL.exposed, (s) => {
    s.append('line').attr('x1', 0).attr('x2', 30).attr('stroke', core.stroke).attr('stroke-width', 2);
    s.append('circle').attr('cx', 40).attr('r', 10).attr('fill', core.fill).attr('stroke', core.stroke).attr('stroke-width', 2);
  });
  fns.forEach((fn) => item(fn, FN_COLOR[fn].name, (s) =>
    s.append('rect').attr('x', 0).attr('y', -9).attr('width', 50).attr('height', 18).attr('rx', 3)
      .attr('fill', FN_COLOR[fn].fill).attr('stroke', FN_COLOR[fn].stroke).attr('stroke-width', 2)));
}
