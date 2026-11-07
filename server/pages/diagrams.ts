// Diagrams in the Library (shared/diagram.ts): kept as their model's text, each picture apart; their own page (a viewer
// that fits the diagram to its frame, to pan and zoom, a tab for each page; every page on paper its own size; the first
// page still, for the Library's picture); what get_page tells an agent of one; what an agent's save_diagram makes (whole
// diagrams said as nodes and edges laid out here, Mermaid, the model itself, or changes by id); and the files a diagram
// is saved as (SVG, PNG, draw.io) or opened from (draw.io files, Mermaid).
import zlib from 'node:zlib';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { ASSET } from '../../shared/slides.ts';
import { DIAGRAM_LIMITS, diagramSources, diagramText, FONTS, isShape, mapDiagramSources, newDiagram, normalizeDiagram, SHAPE_KINDS, STYLE_SETS, ARROWS, type Diagram, type DiagramPage } from '../../shared/diagram.ts';
import { LAYOUTS, specPage, type SpecPage } from '../../shared/diagram-spec.ts';
import { applyDiagramEdits, editsIn } from '../../shared/diagram-edits.ts';
import { pageSvg, themeCss, FLOW_CSS } from '../../shared/diagram-render.ts';
import { mermaidSpec } from '../../shared/diagram-mermaid.ts';
import { diagramToDrawio, drawioToDiagram, isDrawio } from '../../shared/diagram-drawio.ts';
import { assetDataUrl, putAsset, takeIn } from './assets.ts';
import { lucideIcon } from './slides.ts';
import { zipParts } from './ooxml.ts';
import { canCapture, withTab } from '../capture/index.ts';

export const MAX_DIAGRAM = 8 * 1024 * 1024;

/** What a diagram may be opened from: a draw.io file (also one saved as an SVG or a PNG with its diagram inside), or Mermaid. */
export const DIAGRAM_OPENS = /\.(drawio|dio|mmd|mermaid)$|\.drawio\.(svg|png|xml)$/i;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The diagram as it is kept, checked; pictures given as data: kept apart. */
export function keepDiagram(db: DB, input: unknown): { diagram: Diagram; text: string } {
  let d: Diagram;
  try {
    d = normalizeDiagram(input);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  d = mapDiagramSources(d, (s) => {
    if (!s.startsWith('data:')) return s;
    const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(s);
    return m ? ASSET + putAsset(db, Buffer.from(m[1], 'base64')) : '';
  });
  const text = diagramText(d);
  if (Buffer.byteLength(text) > MAX_DIAGRAM) throw new HttpError(413, `The diagram is over ${MAX_DIAGRAM / 1024 / 1024} MB without its pictures; make it smaller.`);
  return { diagram: d, text };
}

export function readDiagram(text: string): Diagram {
  try {
    return normalizeDiagram(JSON.parse(text));
  } catch (e) {
    throw new HttpError(500, `This diagram could not be read: ${(e as Error).message}`);
  }
}

export const freshDiagram = (): Diagram => newDiagram();

/** Pictures as the page itself carries them (a kept one as a data: address). */
const inside = (db: DB) => (s: string) => (s.startsWith(ASSET) ? (assetDataUrl(db, s.slice(ASSET.length)) ?? '') : s);

// ---- its own page -----------------------------------------------------------------------------------------------------

const VIEW_CSS = [
  'html,body{margin:0;padding:0}',
  "body.dg-body{background:var(--n-bg,#fff);color:var(--n-fg,#1f2328);font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif}",
  '.dg-page[hidden]{display:none}',
  '.dg-view{position:relative;overflow:hidden;display:flex;justify-content:center;padding:12px 0}',
  '.dg-view>svg{display:block;max-width:calc(100% - 16px);height:auto;transform-origin:0 0}',
  'body.dg-fill{overflow:hidden}',
  'body.dg-fill .dg-view{position:fixed;inset:0;bottom:var(--dg-tabs,0px);padding:0;display:block;cursor:grab;touch-action:none}',
  'body.dg-fill .dg-view.dg-grab{cursor:grabbing}',
  'body.dg-fill .dg-view>svg{position:absolute;left:0;top:0;max-width:none}',
  '.dg-tabs{display:flex;gap:2px;overflow-x:auto;padding:4px 8px;border-top:1px solid var(--n-line,#d8dee4);background:var(--n-card,#f6f8fa)}',
  'body.dg-fill .dg-tabs{position:fixed;left:0;right:0;bottom:0}',
  ".dg-tabs button{border:0;background:none;font:inherit;color:var(--n-muted,#6e7781);padding:5px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}",
  '.dg-tabs button[aria-selected=true]{background:var(--n-bg,#fff);color:var(--n-fg,#1f2328);font-weight:600;box-shadow:0 0 0 1px var(--n-line,#d8dee4)}',
  '.dg-zoom{position:fixed;right:10px;bottom:calc(var(--dg-tabs,0px) + 10px);display:none;gap:2px;background:var(--n-card,#fff);border:1px solid var(--n-line,#d8dee4);border-radius:8px;padding:2px}',
  'body.dg-fill .dg-zoom{display:flex}',
  '.dg-zoom button{border:0;background:none;width:28px;height:28px;border-radius:6px;font:15px/1 system-ui;color:var(--n-fg,#1f2328);cursor:pointer}',
  '.dg-zoom button:hover,.dg-tabs button:hover{background:var(--n-soft,rgba(0,0,0,.05))}',
  '.dg-empty{padding:40px;text-align:center;color:var(--n-muted,#6e7781)}',
].join('');

// Shown whole (its own address, or full screen): each page fits the window, and the wheel, a pinch or the buttons zoom
// it about the pointer, a drag moves it; a double click fits it again. In a frame that grows to it, it is a picture.
const VIEW_JS =
  "(function(){var b=document.body,fill=(window.hydor&&window.hydor.fill)||window.parent===window;if(fill)b.classList.add('dg-fill');" +
  "var tabs=document.querySelector('.dg-tabs');if(tabs&&fill)document.documentElement.style.setProperty('--dg-tabs',tabs.offsetHeight+'px');" +
  "var st=[];function view(i){var p=document.querySelectorAll('.dg-page')[i];return p&&p.querySelector('.dg-view')}" +
  "function apply(v,s){var g=v.querySelector('svg');g.style.transform='translate('+s.x+'px,'+s.y+'px) scale('+s.k+')'}" +
  "function fit(v){var g=v.querySelector('svg');var w=+g.getAttribute('width'),h=+g.getAttribute('height');var W=v.clientWidth,H=v.clientHeight;var k=Math.min(1.5,Math.max(.05,Math.min((W-32)/w,(H-32)/h)));var s={k:k,x:(W-w*k)/2,y:(H-h*k)/2};v.__s=s;apply(v,s)}" +
  "function zoom(v,f,cx,cy){var s=v.__s;var k=Math.min(8,Math.max(.05,s.k*f));s.x=cx-(cx-s.x)*k/s.k;s.y=cy-(cy-s.y)*k/s.k;s.k=k;apply(v,s)}" +
  "document.querySelectorAll('.dg-view').forEach(function(v){if(!fill)return;fit(v);var drag=null,pts={},pinch=0;" +
  "v.addEventListener('wheel',function(e){e.preventDefault();var r=v.getBoundingClientRect();if(e.ctrlKey||e.metaKey||Math.abs(e.deltaY)>40&&!e.deltaX)zoom(v,Math.exp(-e.deltaY*(e.ctrlKey?.01:.002)),e.clientX-r.left,e.clientY-r.top);else{v.__s.x-=e.deltaX;v.__s.y-=e.deltaY;apply(v,v.__s)}},{passive:false});" +
  "v.addEventListener('pointerdown',function(e){if(e.target.closest('a'))return;v.setPointerCapture(e.pointerId);pts[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(pts);if(ids.length===2){var a=pts[ids[0]],c=pts[ids[1]];pinch=Math.hypot(a.x-c.x,a.y-c.y)}drag={x:e.clientX,y:e.clientY};v.classList.add('dg-grab')});" +
  "v.addEventListener('pointermove',function(e){if(!pts[e.pointerId])return;var ids=Object.keys(pts);pts[e.pointerId]={x:e.clientX,y:e.clientY};if(ids.length===2){var a=pts[ids[0]],c=pts[ids[1]],d=Math.hypot(a.x-c.x,a.y-c.y),r=v.getBoundingClientRect();if(pinch)zoom(v,d/pinch,(a.x+c.x)/2-r.left,(a.y+c.y)/2-r.top);pinch=d;return}if(drag){v.__s.x+=e.clientX-drag.x;v.__s.y+=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};apply(v,v.__s)}});" +
  "function up(e){delete pts[e.pointerId];pinch=0;if(!Object.keys(pts).length){drag=null;v.classList.remove('dg-grab')}}v.addEventListener('pointerup',up);v.addEventListener('pointercancel',up);v.addEventListener('dblclick',function(){fit(v)});});" +
  "var z=document.querySelector('.dg-zoom');if(z)z.addEventListener('click',function(e){var a=e.target.closest('button');if(!a)return;var p=document.querySelector('.dg-page:not([hidden]) .dg-view');if(!p)return;var r=p.getBoundingClientRect();if(a.dataset.z==='fit')fit(p);else zoom(p,a.dataset.z==='in'?1.25:.8,r.width/2,r.height/2)});" +
  "addEventListener('resize',function(){if(fill)document.querySelectorAll('.dg-page:not([hidden]) .dg-view').forEach(fit)});" +
  "if(tabs)tabs.addEventListener('click',function(e){var a=e.target.closest('button');if(!a)return;var i=a.getAttribute('data-i');document.querySelectorAll('.dg-page').forEach(function(p){p.hidden=p.getAttribute('data-i')!==i});tabs.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-selected',String(x===a))});if(fill){var v=view(+i);if(v)fit(v)}});})();";

/** A diagram's own page: to look at (fitting its frame), to print (each page on paper its own size), or its first page still. */
export function diagramPage(db: DB, d: Diagram, title: string, mode: 'viewer' | 'print' | 'still'): string {
  const src = inside(db);
  const head = (css: string) => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><meta name="generator" content="Hydor diagrams"><style>${css}</style></head>`;
  if (mode === 'still') {
    const p = d.pages[0];
    const { svg, box } = pageSvg(d, p, { src, margin: 32 });
    const k = Math.min(2, 1216 / box.w, 736 / box.h);
    return `${head(`html,body{margin:0;width:1280px;height:800px;overflow:hidden;background:${p.background ?? '#ffffff'}}.s{width:1280px;height:800px;display:flex;align-items:center;justify-content:center}.s>svg{width:${Math.round(box.w * k)}px;height:${Math.round(box.h * k)}px}`)}<body><div class="s">${svg}</div></body></html>`;
  }
  if (mode === 'print') {
    // Each page on paper as large as it is (shrunk to fit 200 inches, PDF's most).
    const rules: string[] = ['html,body{margin:0;padding:0}', 'section{break-after:page;overflow:hidden}', 'section:last-child{break-after:auto}', 'section>svg{display:block}'];
    const parts = d.pages.map((p, i) => {
      const { svg, box } = pageSvg(d, p, { src, margin: 28 });
      const k = Math.min(1, 19000 / box.w, 19000 / box.h);
      const w = Math.max(1, Math.round(box.w * k));
      const h = Math.max(1, Math.round(box.h * k));
      rules.push(`@page dg${i}{size:${w}px ${h}px;margin:0}section.dg${i}{page:dg${i};width:${w}px;height:${h}px}section.dg${i}>svg{width:${w}px;height:${h}px}`);
      return `<section class="dg${i}">${svg}</section>`;
    });
    return `${head(rules.join(''))}<body>${parts.join('')}</body></html>`;
  }
  const flow = d.pages.some((p) => p.items.some((it) => it.type === 'edge' && it.style?.flow));
  const sections = d.pages.map((p, i) => {
    const empty = !p.items.length;
    const { svg } = pageSvg(d, p, { src, themed: true, links: true, background: !!p.background, margin: 20 });
    return `<section class="dg-page" data-i="${i}"${i ? ' hidden' : ''}>${empty ? '<div class="dg-empty">This page is empty.</div>' : `<div class="dg-view">${svg.replace(/<style>[^<]*<\/style>/, '')}</div>`}</section>`;
  });
  const tabs = d.pages.length > 1 ? `<nav class="dg-tabs" role="tablist">${d.pages.map((p, i) => `<button type="button" role="tab" data-i="${i}" aria-selected="${i === 0}">${esc(p.name)}</button>`).join('')}</nav>` : '';
  const zoom = '<div class="dg-zoom"><button type="button" data-z="out" title="Zoom out">−</button><button type="button" data-z="fit" title="Fit">⤢</button><button type="button" data-z="in" title="Zoom in">+</button></div>';
  // The theme's colours, the kit's own paper where it is shown in the app.
  const theme = themeCss().replace(/\.dg-paper-f\{fill:[^}]*\}/g, '.dg-paper-f{fill:var(--n-bg,#ffffff)}');
  return `${head(VIEW_CSS + theme + (flow ? FLOW_CSS : ''))}<body class="n-page dg-body">${sections.join('')}${tabs}${zoom}<script>${VIEW_JS}</script></body></html>`;
}

// ---- for agents ---------------------------------------------------------------------------------------------------------

const r0 = (v: number) => Math.round(v);

/** A look said briefly: its fill, line, words and more. */
function lookLine(st: Diagram['pages'][number]['items'][number]['style']): string {
  if (!st) return '';
  const parts: string[] = [];
  const set = STYLE_SETS.find((x) => x.fill === st.fill && x.stroke === st.stroke && (x.color ?? undefined) === (st.color ?? undefined));
  if (set) parts.push(`color ${set.id}`);
  else {
    if (st.fill) parts.push(`fill ${st.fill}`);
    if (st.stroke) parts.push(`stroke ${st.stroke}`);
    if (st.color) parts.push(`text ${st.color}`);
  }
  for (const k of ['width', 'dash', 'opacity', 'radius', 'size', 'font', 'align', 'valign', 'label', 'start', 'end', 'gradient'] as const) if (st[k] !== undefined) parts.push(`${k} ${st[k]}`);
  for (const k of ['bold', 'italic', 'underline', 'shadow', 'sketch', 'flow'] as const) if (st[k]) parts.push(k);
  return parts.length ? ` · ${parts.join(', ')}` : '';
}

const quote = (s: string) => JSON.stringify(s.length > 300 ? `${s.slice(0, 300)}…` : s);

/** What get_page tells an agent of a diagram: each page, its shapes and connectors by id, and how to change it. */
export function diagramForAgent(text: string): string {
  const d = readDiagram(text);
  const out: string[] = [
    `A diagram of ${d.pages.length} page${d.pages.length === 1 ? '' : 's'}${d.sketch ? ', drawn by hand (sketch)' : ''}${d.font ? `, words in ${d.font}` : ''}; the grid is ${d.grid || 'off'}. Places are pixels: x right, y down; a shape's x, y is its top left.`,
  ];
  d.pages.forEach((p, i) => {
    const shapes = p.items.filter(isShape);
    const edges = p.items.filter((it) => it.type === 'edge');
    out.push('', `Page ${i + 1} “${p.name}” (${p.id})${p.background ? `, background ${p.background}` : ''}: ${shapes.length} shape${shapes.length === 1 ? '' : 's'}, ${edges.length} connector${edges.length === 1 ? '' : 's'} (in the order drawn, back to front).`);
    for (const it of p.items) {
      if (it.type === 'shape') {
        out.push(
          `- ${it.id} · ${it.shape}${it.icon ? ` (icon ${it.icon.name})` : ''}${it.text ? ` ${quote(it.text)}` : ''} at ${r0(it.x)},${r0(it.y)} ${r0(it.w)}×${r0(it.h)}${it.rot ? ` turned ${it.rot}°` : ''}${it.flipH ? ' flipped across' : ''}${it.flipV ? ' flipped down' : ''}${it.parent ? ` · in ${it.parent}` : ''}${it.group ? ` · group ${it.group}` : ''}${lookLine(it.style)}${it.rows?.length ? ` · rows ${JSON.stringify(it.rows)}` : ''}${it.link ? ` · link ${it.link}` : ''}${it.note ? ` · note ${quote(it.note)}` : ''}${it.src ? ` · picture ${it.src.startsWith('data:') ? '(inside)' : it.src}` : ''}${it.locked ? ' · locked' : ''}`,
        );
      } else {
        const end = (e: typeof it.from) => (e.id ? `${e.id}${e.port ? `[${e.port.join(',')}]` : ''}` : `(${r0(e.x ?? 0)},${r0(e.y ?? 0)})`);
        out.push(
          `- ${it.id} · connector ${end(it.from)} → ${end(it.to)}${it.text ? ` ${quote(it.text)}` : ''}${it.fromText ? ` · near start ${quote(it.fromText)}` : ''}${it.toText ? ` · near end ${quote(it.toText)}` : ''} · ${it.route ?? 'orthogonal'}${it.points?.length ? ` through ${it.points.map((q) => `${r0(q[0])},${r0(q[1])}`).join(' ')}` : ''}${it.parent ? ` · in ${it.parent}` : ''}${lookLine(it.style)}`,
        );
      }
    }
  });
  out.push(
    '',
    'To change it: save_diagram with this id and change (each by id, the fields that change: text, shape, color, fill, stroke, textColor, style, x, y, w, h, parent, rows, icon; a connector’s from, to, text, arrow, dashed, route, color), add ({nodes, edges}: those without x, y are placed beside what they join), remove (ids; their connectors go too), and layout (lay the page out again: down, right, tree, mindmap…); or send the whole diagram again (pages with nodes and edges, mermaid, or diagram).',
  );
  return out.join('\n');
}

/** The pages a save gives, as specs: its own pages, or its nodes and edges (or Mermaid) as one page. */
function specsOf(a: Record<string, unknown>, notes: string[]): SpecPage[] | null {
  const one = (x: Record<string, unknown>, i: number): SpecPage => {
    const layout = typeof x.layout === 'string' && (LAYOUTS as string[]).includes(x.layout) ? (x.layout as SpecPage['layout']) : typeof x.direction === 'string' && (LAYOUTS as string[]).includes(x.direction) ? (x.direction as SpecPage['layout']) : undefined;
    if (typeof x.mermaid === 'string' && x.mermaid.trim()) {
      const m = mermaidSpec(x.mermaid);
      notes.push(...m.notes);
      return { ...m.page, name: typeof x.name === 'string' && x.name.trim() ? x.name : (m.page.name ?? `Page ${i + 1}`), ...(layout ? { layout } : {}) };
    }
    return {
      name: typeof x.name === 'string' && x.name.trim() ? x.name.trim() : `Page ${i + 1}`,
      layout,
      nodes: Array.isArray(x.nodes) ? (x.nodes as SpecPage['nodes']) : [],
      edges: Array.isArray(x.edges) ? (x.edges as SpecPage['edges']) : [],
      background: typeof x.background === 'string' ? x.background : undefined,
      route: typeof x.route === 'string' && ['orthogonal', 'straight', 'curved'].includes(x.route) ? (x.route as SpecPage['route']) : undefined,
      spacing: typeof x.spacing === 'number' ? x.spacing : undefined,
    };
  };
  if (Array.isArray(a.pages) && a.pages.length && a.pages.every((p) => p && typeof p === 'object' && !Array.isArray((p as Record<string, unknown>).items))) return (a.pages as Record<string, unknown>[]).map(one);
  if (Array.isArray(a.nodes) || (typeof a.mermaid === 'string' && a.mermaid.trim())) return [one(a, 0)];
  return null;
}

/**
 * What an agent's save_diagram makes: the version it changes changed by id (change, add, remove, layout); or a whole new
 * diagram from its pages of nodes and edges (or Mermaid), laid out here, or from the model itself (diagram, or pages of
 * items). Pictures it names (files of its folder, addresses) are kept; icons come from Lucide by name.
 */
export async function agentDiagram(db: DB, a: Record<string, unknown>, cwd: string, prevText?: string): Promise<{ diagram: Diagram; notes: string[] }> {
  const notes: string[] = [];
  const prev = prevText ? readDiagram(prevText) : null;
  const opts = { icon: lucideIcon, font: typeof a.font === 'string' ? (a.font as Diagram['font']) : prev?.font };
  let d: Diagram;
  if (editsIn(a)) {
    if (!prev) throw new Error('change, add, remove and layout change a saved diagram: give its id (get_page lists them), or send the whole diagram (pages, nodes and edges, mermaid or diagram).');
    if (specsOf(a, []) || a.diagram !== undefined) throw new Error('Give the whole diagram (pages, nodes, mermaid or diagram) or changes to the saved one (change, add, remove, layout), not both.');
    const r = applyDiagramEdits(prev, { change: a.change as unknown[], add: a.add as never, remove: a.remove as unknown[], page: a.page as string | number | undefined, layout: typeof a.layout === 'string' ? (a.layout as never) : undefined }, opts);
    d = r.diagram;
    notes.push(...r.notes);
  } else if (a.diagram !== undefined || (Array.isArray(a.pages) && a.pages.some((p) => p && typeof p === 'object' && Array.isArray((p as Record<string, unknown>).items)))) {
    d = normalizeDiagram(a.diagram ?? { pages: a.pages });
  } else {
    const specs = specsOf(a, notes);
    if (!specs) {
      if (prev && (a.sketch !== undefined || a.font !== undefined || a.grid !== undefined)) d = prev;
      else throw new Error('Give the diagram: nodes and edges (one page), pages (each with nodes and edges, or mermaid), mermaid, or diagram (the model as get_page shows it); or, with id, change, add, remove or layout.');
    } else {
      const pages: DiagramPage[] = specs.slice(0, DIAGRAM_LIMITS.pages).map((s, i) => {
        const r = specPage(s, { ...opts, id: `p${i + 1}`, name: `Page ${i + 1}` });
        notes.push(...r.notes.map((n) => (specs.length > 1 ? `Page ${i + 1}: ${n}` : n)));
        return r.page;
      });
      d = normalizeDiagram({ pages, grid: prev?.grid ?? 10, sketch: prev?.sketch, font: prev?.font });
    }
  }
  if (a.sketch === true || a.sketch === false) d = { ...d, sketch: a.sketch || undefined };
  if (typeof a.font === 'string' && FONTS.some((f) => f.id === a.font)) d = { ...d, font: a.font === 'sans' ? undefined : (a.font as Diagram['font']) };
  if (typeof a.grid === 'number') d = { ...d, grid: Math.max(0, Math.min(200, Math.round(a.grid))) };
  // Pictures named by the agent: files of its folder, or addresses, kept in the app.
  const srcs = new Map<string, string>();
  for (const s of new Set(diagramSources(d))) srcs.set(s, await takeIn(db, s, { cwd, notes }));
  d = mapDiagramSources(d, (s) => srcs.get(s) ?? s);
  if (!d.pages.some((p) => p.items.length)) notes.push('The diagram is empty.');
  return { diagram: normalizeDiagram(d), notes };
}

const KIND_GROUPS =
  'Basic: rect, rounded, ellipse, diamond, triangle, hexagon, octagon, pentagon, parallelogram, trapezoid, star, cross, heart, cylinder, cloud, document, note, card, callout, cube, step, chevron, arrow-right|left|up|down|both, text, image (src: a picture file of your folder or an https address), icon (icon: a Lucide name such as server, database, user, globe, cloud, smartphone, lock), sticky, brace, bracket. ' +
  'Flowchart: terminator (start or end), process (rect), decision (diamond), data (parallelogram), predefined, manual-input, delay, display, database (cylinder), multi-document, off-page, connector, manual-operation, stored-data, internal-storage, merge, extract, sort, collate, or, summing, loop-limit, punched-tape, annotation. ' +
  'Containers (nodes name one as parent; it grows to hold them): container (a group box), swimlane (title band on top), lane (title band on the left: stack lanes for a swimlane diagram), frame (UML), package. ' +
  'UML and ER: class (text = name, rows = attributes, "---", methods), entity (text = table name, rows = "id int PK" …), table (rows = "cell|cell"), actor, component, lifeline, activation, initial, final, bar (fork or join). BPMN: task (rounded), event, event-end, event-mid, gateway, gateway-parallel, gateway-inclusive, data-object.';

export const SAVE_DIAGRAM_DESCRIPTION = [
  'Save a diagram in the user’s Library: a flowchart, process or swimlane diagram, org chart, mind map, network, cloud or software architecture, UML (class, sequence, state, use case), ER diagram, timeline, decision tree. They edit it there as in draw.io (shapes, connectors that follow them, styles, pages, layouts) and export it as SVG, PNG, PDF or a draw.io file.',
  'Leave out id to make a new one; give a saved diagram’s id (get_page lists them) to change it: change, add, remove and layout change only what they name; anything else replaces the whole diagram (older versions stay restorable).',
  'Say it simply, and the app lays it out and sizes each shape to its words: nodes [{id, text, shape?, color?, icon?, parent?, rows?}] and edges [{from, to, text?, arrow?, dashed?}] with layout (down: a flowchart top to bottom, the default; right, up, left; tree: an org chart; tree-right; mindmap: the first node in the middle; radial; circle; grid). Give x, y (and w, h) only to place shapes yourself (layout none). Line breaks in text: \\n.',
  `Shapes: ${KIND_GROUPS} Other names work too (process, decision, start, end, database, person, server…). Left out: a rounded box.`,
  `Colours: color is a ready-made look (${STYLE_SETS.map((s) => s.id).join(', ')}) or a fill (#rrggbb); fill, stroke and textColor set each; style holds the rest (width, dash: dashed|dotted|dash-dot, radius, shadow, opacity, size, bold, italic, align, valign, font: sans|serif|mono|hand, sketch, gradient). Keep a calm palette: one look per kind of thing (inputs, decisions, outcomes), the strong looks for one or two shapes that matter most.`,
  `Edges: arrow end (default)|start|both|none, or start and end as kinds (${ARROWS.map((x) => x.id).join(', ')}: open for UML dependency, triangle for inheritance, diamond for composition, the er- kinds for ER cardinality); dashed, dotted, thick, color, width; route orthogonal (default), straight or curved; fromText and toText (words near the ends: "1", "0..*"); fromPort and toPort (n, e, s, w, or [x, y] as fractions of the shape) to fix where they meet.`,
  'mermaid instead of nodes and edges: a Mermaid flowchart, mindmap, class, ER, state or sequence diagram, made an editable diagram (a sequence diagram as lifelines and messages).',
  'pages for a diagram of several pages (each {name, layout, nodes, edges} or {name, mermaid}); sketch: true draws it all by hand, as on a whiteboard; font for all its words. diagram: the model as get_page shows it, for exact control.',
  `Changes to a saved one (with id): change [{id, …fields that change}] (a shape’s text, shape, color, fill, stroke, textColor, style, x, y, w, h, parent, rows, icon; a connector’s from, to, text, arrow, start, end, dashed, route, color, points), add {nodes, edges} (new ones beside what they join; edges may join shapes already there; page names the page), remove [ids] (their connectors go too), layout (lay page out again). At most ${DIAGRAM_LIMITS.items} items a page, ${DIAGRAM_LIMITS.pages} pages.`,
].join(' ');

const NODE_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    text: { type: 'string' },
    shape: { type: 'string', description: 'A kind of shape (see the description); a rounded box when left out.' },
    color: { type: 'string', description: 'A ready-made look by name (blue, green, orange, yellow, red, purple, grey, teal, pink, white, dark-blue…) or a fill colour.' },
    icon: { type: 'string', description: 'For an icon shape: a Lucide icon name.' },
    parent: { type: 'string', description: 'The id of the container node it is in.' },
    rows: { type: 'array', items: { type: 'string' }, description: 'A class’s, an entity’s or a table’s rows.' },
    fill: { type: 'string' },
    stroke: { type: 'string' },
    textColor: { type: 'string' },
    style: { type: 'object' },
    x: { type: 'number' },
    y: { type: 'number' },
    w: { type: 'number' },
    h: { type: 'number' },
    link: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['id'],
};
const EDGE_SCHEMA = {
  type: 'object',
  properties: {
    from: { type: 'string' },
    to: { type: 'string' },
    text: { type: 'string' },
    arrow: { type: 'string', enum: ['end', 'start', 'both', 'none'] },
    start: { type: 'string' },
    end: { type: 'string' },
    dashed: { type: 'boolean' },
    dotted: { type: 'boolean' },
    thick: { type: 'boolean' },
    route: { type: 'string', enum: ['orthogonal', 'straight', 'curved'] },
    color: { type: 'string' },
    fromText: { type: 'string' },
    toText: { type: 'string' },
    fromPort: {},
    toPort: {},
    id: { type: 'string' },
  },
  required: ['from', 'to'],
};

export const SAVE_DIAGRAM_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'A saved diagram’s id, to change it (a new version).' },
    title: { type: 'string', description: 'Its name in the Library: "Checkout flow".' },
    nodes: { type: 'array', items: NODE_SCHEMA, description: 'The shapes of a one-page diagram.' },
    edges: { type: 'array', items: EDGE_SCHEMA, description: 'The connectors between them, by the nodes’ ids.' },
    layout: { type: 'string', enum: LAYOUTS, description: 'How the nodes are laid out (down when left out); with id and no nodes: that page laid out again.' },
    mermaid: { type: 'string', description: 'Instead of nodes and edges: Mermaid text (flowchart, mindmap, classDiagram, erDiagram, stateDiagram, sequenceDiagram).' },
    pages: { type: 'array', items: { type: 'object' }, description: 'Several pages: each {name, layout, nodes, edges} or {name, mermaid}.' },
    diagram: { type: 'object', description: 'The model itself, as get_page shows it (pages of items), for exact control.' },
    change: { type: 'array', items: { type: 'object' }, description: 'With id: items changed, each {id, …the fields that change}.' },
    add: { type: 'object', description: 'With id: {nodes, edges} added (nodes without x, y go beside what they join).' },
    remove: { type: 'array', items: { type: 'string' }, description: 'With id: ids of items taken out.' },
    page: { description: 'With id: the page add and layout are for (its name or number from 1; the first when left out).' },
    sketch: { type: 'boolean', description: 'Drawn by hand, as on a whiteboard.' },
    font: { type: 'string', enum: FONTS.map((f) => f.id) },
  },
};

// ---- files --------------------------------------------------------------------------------------------------------------

/** A page of a diagram as an SVG file that works on its own (its pictures inside), light or dark. */
export function svgOfPage(db: DB, d: Diagram, i: number, o: { dark?: boolean; transparent?: boolean } = {}): string {
  const p = d.pages[i];
  if (!p) throw new HttpError(404, 'No such page');
  const { svg } = pageSvg(d, p, { src: inside(db), background: !o.transparent, ...(o.dark ? { theme: { paper: '#16181d', ink: '#e6e8eb', muted: '#9198a1', fill: '#1d2026', grid: '#30363d', dark: true } } : {}) });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
}

/** A diagram as SVG: its one page, the page asked for, or a zip of every page. */
export function diagramSvgFile(db: DB, d: Diagram, title: string, page?: number): { data: Buffer; zip: boolean } {
  const name = (s: string) => s.replace(/[\u0000-\u001f\u007f/\\?%*:|"<>]+/g, ' ').trim().slice(0, 60) || 'page';
  if (page !== undefined || d.pages.length === 1) return { data: Buffer.from(svgOfPage(db, d, page ?? 0), 'utf8'), zip: false };
  return { data: zipParts(d.pages.map((p, i) => ({ name: `${String(i + 1).padStart(2, '0')} ${name(p.name)}.svg`, data: Buffer.from(svgOfPage(db, d, i), 'utf8') }))), zip: true };
}

/** A page of a diagram as a PNG (or JPEG), drawn by the browser pictures are taken with, `scale` times its size. */
export async function rasterPage(db: DB, d: Diagram, i: number, o: { scale?: number; transparent?: boolean; format?: 'png' | 'jpg' } = {}): Promise<Buffer> {
  if (!canCapture()) throw new HttpError(503, 'Making a picture of a diagram needs a browser on this computer: Settings → Browser can download one.');
  const p = d.pages[i];
  if (!p) throw new HttpError(404, 'No such page');
  const { svg, box } = pageSvg(d, p, { src: inside(db), background: !o.transparent || o.format === 'jpg' });
  const k = Math.max(0.25, Math.min(4, o.scale ?? 2));
  // Large pages are drawn smaller: a picture at most 12000 pixels on its longer side.
  const kk = Math.min(k, 12000 / Math.max(box.w, box.h));
  const w = Math.max(1, Math.round(box.w * kk));
  const h = Math.max(1, Math.round(box.h * kk));
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`;
  return withTab({ html, width: Math.min(w, 4000), height: Math.min(h, 4000), settleMs: 150, blockPrivate: true }, async (tab) => {
    await tab.evaluate('document.fonts.ready.then(() => true)');
    if (o.transparent && o.format !== 'jpg') await tab.s.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }).catch(() => {});
    const shot = await tab.s.send('Page.captureScreenshot', { format: o.format === 'jpg' ? 'jpeg' : 'png', quality: o.format === 'jpg' ? 92 : undefined, clip: { x: 0, y: 0, width: w, height: h, scale: 1 }, captureBeyondViewport: true }, 60_000);
    return Buffer.from(shot.data, 'base64');
  });
}

/** A diagram as pictures: its one page (or the page asked for) as a picture, else a zip of a picture of each page. */
export async function diagramRasterFile(db: DB, d: Diagram, o: { page?: number; scale?: number; transparent?: boolean; format: 'png' | 'jpg' }): Promise<{ data: Buffer; zip: boolean }> {
  if (o.page !== undefined || d.pages.length === 1) return { data: await rasterPage(db, d, o.page ?? 0, o), zip: false };
  const parts: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < d.pages.length; i++) parts.push({ name: `page-${String(i + 1).padStart(2, '0')}.${o.format}`, data: await rasterPage(db, d, i, o) });
  return { data: zipParts(parts), zip: true };
}

/** A diagram as a draw.io file. */
export const drawioFile = (d: Diagram, title: string) => diagramToDrawio(d, title);

/** A diagram from a file someone opens: a draw.io file (or a draw.io SVG or PNG), or Mermaid. */
export async function diagramFromFile(buf: Buffer, name: string): Promise<{ model: Diagram; notes?: string[] }> {
  const text = buf.toString('utf8');
  if (/\.(mmd|mermaid)$/i.test(name) || (!isDrawio(buf) && /^\s*(%%.*\n\s*)*(flowchart|graph|mindmap|classDiagram|erDiagram|stateDiagram|sequenceDiagram)\b/m.test(text))) {
    const m = mermaidSpec(text);
    const r = specPage(m.page, { icon: lucideIcon, name: m.page.name ?? name.replace(/\.[^.]+$/, '') });
    return { model: normalizeDiagram({ pages: [r.page] }), notes: [...m.notes, ...r.notes] };
  }
  try {
    const r = await drawioToDiagram(/\.png$/i.test(name) ? new Uint8Array(buf) : text, { inflate: (b) => new Uint8Array(zlib.inflateRawSync(b)) });
    return { model: r.diagram, notes: r.notes };
  } catch (e) {
    throw new HttpError(400, `${name} could not be opened as a diagram: ${(e as Error).message}`);
  }
}

void SHAPE_KINDS;
