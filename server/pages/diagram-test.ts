// Script tests for diagrams (shared/diagram*.ts, diagrams.ts): what a diagram keeps and how it is checked (ids, parents,
// connectors to shapes that are gone, colours, fixed points to four places), its text a line an item; every kind of
// shape drawn (an outline that closes, words that go in it, fixed points on its edge); connectors at right angles that
// keep clear of the shapes they join and of shapes in the way, straight ones to the outline, curved ones; layouts with
// no shapes over one another (layers that flow, trees, mind maps, lanes, containers that hold theirs); a spec made a
// page (sizes that fit the words, colours by name); changes by id; the editor's moves, copies, lining up and order; the
// SVG drawn (light, dark and themed, by hand the same each time); every template and every shape of the panel; a
// diagram written as it streams in; and, through the routes, save_diagram (nodes and edges, Mermaid, the model, changes),
// what get_page says, page_action, the files it exports as and is opened from, its own pages. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/diagram-test.ts
//   DATA_DIR=/tmp/hydor-test-diagram node dist/dev/diagram-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { pages } from './index.ts';
import { lucideIcon } from './slides.ts';
import { CONTAINER_KINDS, diagramText, isEdge, isShape, normalizeDiagram, SHAPE_KINDS, type Diagram, type DiagramEdge, type DiagramPage, type DiagramShape } from '../../shared/diagram.ts';
import { KINDS, pageBox, shapeGeom, shapePorts, toPage, inShape, perimeterPoint } from '../../shared/diagram-shapes.ts';
import { distanceTo, edgeCourse, edgeGeom } from '../../shared/diagram-route.ts';
import { layout } from '../../shared/diagram-layout.ts';
import { LAYOUTS, specPage, sizeFor } from '../../shared/diagram-spec.ts';
import { applyDiagramEdits, relayoutPage } from '../../shared/diagram-edits.ts';
import { alignShapes, cloneItems, distributeShapes, hitItem, moveItems, movingSet, removeItems, reorder, reparent, snapBox } from '../../shared/diagram-ops.ts';
import { pageSvg, sketchPath } from '../../shared/diagram-render.ts';
import { PALETTE } from '../../shared/diagram-palette.ts';
import { draftDiagram } from '../../shared/draft-diagram.ts';
import { DraftMemo } from '../../shared/page-drafts.ts';
import { readPartial } from '../../shared/partial-json.ts';
import { textWidth, wrapText } from '../../shared/diagram-text.ts';
import { diagramToDrawio } from '../../shared/diagram-drawio.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

type B = { x: number; y: number; w: number; h: number };
const overlap = (a: B, b: B, m = 0) => a.x < b.x + b.w - m && b.x < a.x + a.w - m && a.y < b.y + b.h - m && b.y < a.y + a.h - m;
/** Shapes of a page that lie over one another (a container over what it holds does not count). */
function clashes(p: DiagramPage): string[] {
  const shapes = p.items.filter(isShape);
  const out: string[] = [];
  const inside = (a: DiagramShape, b: DiagramShape) => {
    for (let x: string | undefined = a.parent; x; x = shapes.find((s) => s.id === x)?.parent) if (x === b.id) return true;
    return false;
  };
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i];
      const b = shapes[j];
      if (inside(a, b) || inside(b, a)) continue;
      if (overlap(pageBox(a), pageBox(b), 1)) out.push(`${a.id}/${b.id}`);
    }
  return out;
}
const axisAligned = (pts: { x: number; y: number }[]) => pts.slice(1).every((q, i) => Math.abs(q.x - pts[i].x) < 0.6 || Math.abs(q.y - pts[i].y) < 0.6);
/** Whether a course runs through the inside of a box (its ends may touch its edge). */
function crosses(pts: { x: number; y: number }[], b: B, m = 1): boolean {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const c = pts[i];
    for (let k = 1; k < 20; k++) {
      const x = a.x + ((c.x - a.x) * k) / 20;
      const y = a.y + ((c.y - a.y) * k) / 20;
      if (x > b.x + m && x < b.x + b.w - m && y > b.y + m && y < b.y + b.h - m) return true;
    }
  }
  return false;
}
const shape = (id: string, x: number, y: number, w = 120, h = 60, more: Partial<DiagramShape> = {}): DiagramShape => ({ id, type: 'shape', shape: 'rect', x, y, w, h, ...more });
const edge = (id: string, from: string, to: string, more: Partial<DiagramEdge> = {}): DiagramEdge => ({ id, type: 'edge', from: { id: from }, to: { id: to }, ...more });

// ---- the model, checked -----------------------------------------------------------------------------------------------
{
  const d = normalizeDiagram({
    pages: [
      {
        name: 'One',
        items: [
          { id: 'a', type: 'shape', shape: 'decision', x: 10, y: 10, w: 100, h: 60, text: 'Is it?<br>Yes', style: { fill: 'blue', stroke: '#ABC', opacity: 0.5, start: 'nope' } },
          { id: 'a', type: 'shape', shape: 'rect', x: 200, y: 10 },
          { id: 'c', type: 'shape', shape: 'nonsense-kind', x: 0, y: 0 },
          { id: 'kid', type: 'shape', shape: 'rect', x: 0, y: 0, parent: 'ghost' },
          { id: 'e1', type: 'edge', from: { id: 'a', port: [0.123456, 1.7] }, to: 'gone' },
          { id: 'e2', type: 'edge', from: { id: 'a' }, to: { id: 'gone', x: 5, y: 6 }, style: { end: 'crowfoot', dash: 'dashed' } },
        ],
      },
    ],
    grid: 0,
  });
  const p = d.pages[0];
  const a = p.items.find((x) => x.id === 'a') as DiagramShape;
  ok(a.shape === 'diamond' && a.text === 'Is it?\nYes', 'a shape named by another name is its kind, <br> a line break');
  ok(a.style?.fill === '#1971c2' && a.style.stroke === '#aabbcc' && a.style.opacity === 50 && a.style.start === undefined, 'colours by name and #rgb, opacity as a share, an arrow that is none left out');
  ok(p.items.filter((x) => x.id === 'a').length === 1 && p.items.length === 4, 'a clash of ids is renamed; a shape of no kind and a connector to nothing are left out');
  ok(!(p.items.find((x) => x.id === 'kid') as DiagramShape).parent, 'a parent that is not there is let go');
  const e2 = p.items.find((x) => x.id === 'e2') as DiagramEdge;
  ok(!e2.to.id && e2.to.x === 5 && e2.style?.end === 'er-many' && e2.style.dash === 'dashed', 'an end whose shape is gone keeps its place; crowfoot is an ER end');
  ok(d.grid === 0, 'a grid of 0 is kept');
  const d2 = normalizeDiagram({ items: [{ id: 's', shape: 'rect', x: 0, y: 0 }, { id: 't', shape: 'rect', x: 0, y: 200 }, { id: 'm', from: { id: 's', port: [0.123456, 0.5] }, to: 't' }] });
  ok((d2.pages[0].items[2] as DiagramEdge).from.port?.[0] === 0.1235, 'a fixed point is kept to four places');
  // Links and pictures: nothing that runs.
  const risky = normalizeDiagram({ items: [shape('l', 0, 0, 10, 10, { link: 'javascript:alert(1)', src: 'javascript:alert(1)' }), shape('m', 0, 0, 10, 10, { link: 'https://example.com', src: 'naget-asset:abc' })] }).pages[0].items as DiagramShape[];
  ok(!risky[0].link && !risky[0].src && risky[1].link === 'https://example.com' && risky[1].src === 'naget-asset:abc', 'a link or a picture that would run is left out');
  // Text a line an item, read back as it was.
  const text = diagramText(d);
  ok(text.split('\n').length === 2 + d.pages.length * 2 + p.items.length && JSON.stringify(normalizeDiagram(JSON.parse(text))) === JSON.stringify(d), 'kept as a line an item, read back the same');
  // A parent that is (through others) its own child.
  const loop = normalizeDiagram({ items: [shape('x', 0, 0, 10, 10, { parent: 'y' }), shape('y', 0, 0, 10, 10, { parent: 'x' })] });
  ok(loop.pages[0].items.filter((s) => s.parent).length === 1, 'a ring of parents is broken');
}

// ---- words ------------------------------------------------------------------------------------------------------------
{
  ok(Math.abs(textWidth('Hello', { size: 10 }) - 22.78) < 0.01, 'words are as wide as Helvetica draws them');
  ok(textWidth('Ünïcödé', { size: 14 }) === textWidth('Unicode', { size: 14 }), 'a letter with an accent is as wide as its letter');
  ok(textWidth('中文', { size: 14 }) === 28, 'Chinese is as wide as it is tall');
  const lines = wrapText('The quick brown fox jumps over the lazy dog', 80, { size: 14 });
  ok(lines.length > 2 && lines.every((l) => textWidth(l, { size: 14 }) <= 80), `words break into lines no wider than asked (${lines.join(' | ')})`);
  ok(wrapText('Supercalifragilisticexpialidocious', 60, { size: 14 }).length > 1, 'a word wider than a line is cut');
  ok(wrapText('one\n\ntwo', 200, { size: 14 }).length === 3, 'lines given stay lines, empty ones too');
}

// ---- every kind of shape ----------------------------------------------------------------------------------------------
{
  for (const k of SHAPE_KINDS) {
    const def = KINDS[k];
    const s = shape(`s-${k}`, 0, 0, def.w, def.h, { shape: k, text: 'Words', rows: ['a', '---', 'b'] });
    const g = shapeGeom(s);
    ok(g.paths.length > 0 && g.paths.every((p) => p.d.startsWith('M') && !/NaN|undefined/.test(p.d)), `${k}: drawn`);
    ok(g.poly.length >= 3 || k === 'brace', `${k}: its outline is a polygon`);
    for (const [fx, fy] of shapePorts(s)) ok(fx >= -0.001 && fx <= 1.001 && fy >= -0.001 && fy <= 1.001, `${k}: its fixed points are on its box`);
  }
  const d = shape('d', 0, 0, 100, 60, { shape: 'diamond' });
  ok(inShape(d, 50, 30) && !inShape(d, 5, 5), 'a diamond holds its middle, not its corners');
  const pp = perimeterPoint(d, { x: 300, y: 30 });
  ok(Math.abs(pp.x - 100) < 0.5 && Math.abs(pp.y - 30) < 0.5, 'a line out of a diamond leaves at its tip');
  const turned = shape('t', 0, 0, 100, 50, { rot: 90 });
  const c = toPage(turned, 100, 25);
  ok(Math.abs(c.x - 50) < 0.01 && Math.abs(c.y - 75) < 0.01, 'a turned shape’s points turn with it');
  ok(KINDS.icon.style?.label === 'below' && KINDS.actor.style?.label === 'below', 'an icon’s and a person’s words go under them');
}

// ---- connectors -------------------------------------------------------------------------------------------------------
{
  const a = shape('a', 0, 0);
  const b = shape('b', 300, 200);
  const shapes = new Map([a, b].map((s) => [s.id, s]));
  const o = edgeCourse(edge('e', 'a', 'b'), shapes);
  ok(axisAligned(o.pts) && !crosses(o.pts, pageBox(a)) && !crosses(o.pts, pageBox(b)), 'an orthogonal connector runs at right angles, clear of its shapes');
  ok(o.pts.length <= 3, `apart both ways: one bend (${o.pts.length - 2})`);
  // Stacked: straight down, on one line though the shapes are not quite in line.
  const top = shape('top', 0, 0, 120, 60);
  const below = shape('below', 4, 160, 120, 60);
  const st = edgeCourse(edge('e', 'top', 'below'), new Map([top, below].map((s) => [s.id, s])));
  ok(st.pts.length === 2 && Math.abs(st.pts[0].x - st.pts[1].x) < 0.01, 'shapes almost in line are joined straight');
  // A shape in the way is gone round.
  const left = shape('l', 0, 100);
  const mid = shape('m', 220, 90, 120, 80);
  const right = shape('r', 440, 100);
  const sm = new Map([left, mid, right].map((s) => [s.id, s]));
  const round = edgeCourse(edge('e', 'l', 'r'), sm);
  ok(axisAligned(round.pts) && !crosses(round.pts, pageBox(mid)), 'a connector goes round a shape in its way');
  // Self loops, straight, curved and free ends.
  const self = edgeCourse(edge('e', 'a', 'a'), shapes);
  ok(self.pts.length >= 3 && axisAligned(self.pts) && !crosses(self.pts, pageBox(a)), 'a connector back to its own shape loops round it');
  const sg = edgeGeom(edge('e', 'a', 'b', { route: 'straight' }), shapes);
  ok(sg.pts.length === 2 && inShape(a, sg.pts[0].x, sg.pts[0].y, 0.6) && inShape(b, sg.pts[1].x, sg.pts[1].y, 0.6), 'a straight connector meets the outlines');
  const cg = edgeGeom(edge('e', 'a', 'b', { route: 'curved' }), shapes);
  ok(cg.d.includes('C') && cg.walk.length > 10, 'a curved one is a curve');
  const free = edgeGeom({ id: 'f', type: 'edge', from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, route: 'straight' }, new Map());
  ok(free.length > 99 && free.length < 101, 'free ends stay where they are');
  const ported = edgeCourse(edge('e', 'a', 'b', { from: { id: 'a', port: [1, 0.5] }, to: { id: 'b', port: [0.5, 0] } }), shapes);
  ok(Math.abs(ported.pts[0].x - 120) < 0.01 && Math.abs(ported.pts[ported.pts.length - 1].y - 200) < 0.01, 'fixed points are where they say');
  const through = edgeCourse(edge('e', 'a', 'b', { points: [[200, 90]] }), shapes);
  ok(axisAligned(through.pts) && distanceTo(through.pts, { x: 200, y: 90 }) < 0.01, `it runs through the points it is given, at right angles (${JSON.stringify(through.pts)})`);
}

// ---- layouts ----------------------------------------------------------------------------------------------------------
{
  const nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, w: 120, h: 50 }));
  const edges = [
    ['a', 'b'],
    ['a', 'c'],
    ['b', 'd'],
    ['c', 'd'],
    ['d', 'e'],
    ['e', 'a'],
    ['f', 'e'],
  ].map(([from, to]) => ({ from, to }));
  const r = layout(nodes, edges, 'down');
  const box = (id: string) => r.pos.get(id)!;
  ok([...r.pos.values()].every((p, i, all) => all.every((q, j) => i === j || !overlap(p, q))), 'in layers: no two shapes over each other');
  ok(box('a').y < box('b').y && box('b').y < box('d').y && box('d').y < box('e').y, 'in layers: each below what leads to it');
  ok(r.back.size === 1, 'a cycle’s edge goes back round the side');
  const right = layout(nodes, edges, 'right');
  ok(right.pos.get('a')!.x < right.pos.get('d')!.x, 'across: each right of what leads to it');
  const tree = layout(['root', 'x', 'y', 'z'].map((id) => ({ id, w: 100, h: 40 })), [{ from: 'root', to: 'x' }, { from: 'root', to: 'y' }, { from: 'root', to: 'z' }], 'tree');
  const rt = tree.pos.get('root')!;
  const kids = ['x', 'y', 'z'].map((id) => tree.pos.get(id)!);
  ok(kids.every((k) => k.y > rt.y) && Math.abs(rt.x + rt.w / 2 - (kids[0].x + kids[2].x + kids[2].w) / 2) < 1, 'a tree: the parent over the middle of its children');
  const mm = layout(['c', 'p', 'q', 'r', 's'].map((id) => ({ id, w: 100, h: 40 })), ['p', 'q', 'r', 's'].map((to) => ({ from: 'c', to })), 'mindmap');
  const cm = mm.pos.get('c')!;
  const sides = ['p', 'q', 'r', 's'].map((id) => Math.sign(mm.pos.get(id)!.x - cm.x));
  ok(sides.includes(1) && sides.includes(-1), 'a mind map: branches on both sides');
  // Containers hold what is in them.
  const cont = layout([{ id: 'box', w: 40, h: 40, pad: { top: 40, left: 20, right: 20, bottom: 20 } }, { id: 'in1', w: 100, h: 40, parent: 'box' }, { id: 'in2', w: 100, h: 40, parent: 'box' }, { id: 'out', w: 100, h: 40 }], [{ from: 'in1', to: 'in2' }, { from: 'out', to: 'in1' }], 'down');
  const bx = cont.pos.get('box')!;
  ok(['in1', 'in2'].every((id) => { const q = cont.pos.get(id)!; return q.x >= bx.x && q.y >= bx.y + 40 && q.x + q.w <= bx.x + bx.w && q.y + q.h <= bx.y + bx.h; }), 'a container grows round what it holds');
  ok(!overlap(cont.pos.get('out')!, bx), 'and what is outside stays outside');
  // Lanes: one under another, each step in its own lane, the flow across them in order.
  const lanes = specPage({
    layout: 'right',
    nodes: [
      { id: 'l1', text: 'One', shape: 'lane' },
      { id: 'l2', text: 'Two', shape: 'lane' },
      { id: 'a', text: 'A', parent: 'l1' },
      { id: 'b', text: 'B', parent: 'l2' },
      { id: 'c', text: 'C', parent: 'l1' },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ],
  }).page;
  const lb = (id: string) => pageBox(lanes.items.find((x) => x.id === id) as DiagramShape);
  ok(lb('l1').y + lb('l1').h <= lb('l2').y + 0.5 && Math.abs(lb('l1').w - lb('l2').w) < 0.5, 'lanes one under another, as long as each other');
  ok(lb('a').x < lb('b').x && lb('b').x < lb('c').x && overlap(lb('a'), lb('l1')) && overlap(lb('b'), lb('l2')), 'the flow runs across the lanes, each step in its lane');
}

// ---- a spec made a page -----------------------------------------------------------------------------------------------
{
  const r = specPage(
    {
      nodes: [
        { id: 'a', text: 'Start', shape: 'start', color: 'green' },
        { id: 'b', text: 'A step with a rather long name that has to wrap onto more lines', color: '#ff8800' },
        { id: 'c', text: 'Ready?', shape: 'decision' },
        { id: 'srv', text: 'Server', icon: 'server' },
        { id: 'x', text: 'Nope', shape: 'wobble' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c', text: 'then', dashed: true, arrow: 'both' },
        { from: 'c', to: 'zz' },
      ],
    },
    { icon: lucideIcon },
  );
  const p = r.page;
  const b = p.items.find((x) => x.id === 'b') as DiagramShape;
  const g = shapeGeom(b);
  ok(wrapText(b.text!, g.text!.w, { size: 14 }).length * 17.5 <= g.text!.h + 1, 'a shape is sized to hold its words');
  ok(b.style?.fill === '#ff8800' && b.style.stroke && b.style.stroke !== '#ff8800', 'a colour fills it, its line darker');
  ok((p.items.find((x) => x.id === 'a') as DiagramShape).style?.fill === '#d5e8d4', 'a ready-made look by name');
  const srv = p.items.find((x) => x.id === 'srv') as DiagramShape;
  ok(srv.shape === 'icon' && (srv.icon?.paths.length ?? 0) > 0, 'an icon by its Lucide name');
  ok(r.notes.some((n) => n.includes('wobble')) && r.notes.some((n) => n.includes('zz')), 'what could not be made is said');
  const e = p.items.find((x) => isEdge(x) && x.from.id === 'b') as DiagramEdge;
  ok(e.style?.dash === 'dashed' && e.style.start === 'arrow' && e.text === 'then', 'an edge’s look and words');
  ok(clashes(p).length === 0, `laid out with nothing over anything (${clashes(p).join(', ')})`);
  const order = p.items.map((x) => (isEdge(x) ? 'e' : 's')).join('');
  ok(/^e+s+$/.test(order), 'connectors drawn under the shapes');
  ok(sizeFor('diamond', { text: 'Is the order complete and paid?' }).w > sizeFor('rect', { text: 'Is the order complete and paid?' }).w, 'a diamond is wider than a box for the same words');
}

// ---- changes by id ----------------------------------------------------------------------------------------------------
{
  const base = normalizeDiagram({ pages: [specPage({ layout: 'down', nodes: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] }).page] });
  const r = applyDiagramEdits(base, {
    change: [{ id: 'a', text: 'A much longer name for the first step of all', color: 'red' }, { id: 'nope', text: 'x' }],
    add: { nodes: [{ id: 'd', text: 'D' }, { id: 'a', text: 'clash' }], edges: [{ from: 'c', to: 'd' }] },
    remove: ['b'],
  });
  const p = r.diagram.pages[0];
  const a = p.items.find((x) => x.id === 'a') as DiagramShape;
  ok(a.style?.fill === '#f8cecc' && a.w >= 120, 'a change: new words (grown to fit), a new look');
  ok(!p.items.some((x) => x.id === 'b') && !p.items.some((x) => isEdge(x) && (x.from.id === 'b' || x.to.id === 'b')), 'a shape taken out takes its connectors');
  ok(p.items.some((x) => x.id === 'd') && p.items.some((x) => isEdge(x) && x.from.id === 'c' && x.to.id === 'd'), 'added: a shape joined to one there');
  ok(p.items.filter(isShape).length === 4 && clashes(p).length === 0, `added shapes go clear of the others (${clashes(p).join(', ')})`);
  ok(r.notes.some((n) => n.includes('nope')), 'a change to nothing is said');
  const again = relayoutPage(p, 'right');
  ok(clashes(again).length === 0 && (again.items.find((x) => x.id === 'c') as DiagramShape).x > (again.items.find((x) => x.id === 'a') as DiagramShape).x - 1, 'laid out again, across');
}

// ---- what the editor does ---------------------------------------------------------------------------------------------
{
  const box = shape('box', 0, 0, 300, 200, { shape: 'container' });
  const kid = shape('kid', 50, 60, 100, 50, { parent: 'box' });
  const other = shape('other', 400, 60);
  // As the app keeps them: containers, then connectors, then shapes.
  const p: DiagramPage = { id: 'p', name: 'P', items: [box, edge('e1', 'kid', 'other', { points: [[300, 85]] }), edge('e2', 'box', 'kid'), kid, other] };
  const set = movingSet(p, ['box']);
  ok(set.has('kid') && set.has('e2') && !set.has('e1'), 'a container moves with what it holds, and the connectors among them');
  const moved = moveItems(p, set, 10, 20);
  ok((moved.items.find((x) => x.id === 'kid') as DiagramShape).x === 60, 'what it holds moves too');
  const gone = removeItems(p, new Set(['other']));
  ok(!gone.items.some((x) => x.id === 'e1'), 'taken out with the connectors left hanging');
  const copies = cloneItems(p.items.filter((x) => ['kid', 'other', 'e1'].includes(x.id)), 30, 0);
  const ce = copies.find(isEdge)!;
  ok(copies.every((x) => !['kid', 'other', 'e1'].includes(x.id)) && copies.some((x) => x.id === ce.from.id) && ce.points?.[0][0] === 330, 'copies: new ids, connectors joined to the copies, moved');
  ok(!(copies.find((x) => isShape(x) && x.x === 80) as DiagramShape).parent, 'a copy without its container is on its own');
  const al = alignShapes(p, new Set(['kid', 'other']), 'top');
  ok((al.items.find((x) => x.id === 'kid') as DiagramShape).y === 60 && (al.items.find((x) => x.id === 'other') as DiagramShape).y === 60, 'aligned by their tops');
  const three: DiagramPage = { id: 'q', name: 'Q', items: [shape('1', 0, 0, 50, 50), shape('2', 70, 0, 50, 50), shape('3', 400, 0, 50, 50)] };
  const sp = distributeShapes(three, new Set(['1', '2', '3']), 'x');
  ok(Math.abs((sp.items[1] as DiagramShape).x - 200) < 0.01, 'spaced out evenly');
  ok(reorder(three, new Set(['1']), 'front').items[2].id === '1' && reorder(three, new Set(['3']), 'backward').items[1].id === '3', 'brought to the front, sent back a step');
  const dropped = reparent(moveItems(p, new Set(['other']), -350, 0), new Set(['other']));
  ok((dropped.items.find((x) => x.id === 'other') as DiagramShape).parent === 'box', 'dropped in a container, a shape goes in it');
  ok(hitItem(p, 100, 85, 4)?.id === 'kid' && hitItem(p, 150, 150, 4) === null, 'a click picks what is under it, not a container’s inside');
  const sn = snapBox({ x: 403, y: 300, w: 120, h: 60 }, [{ x: 400, y: 60, w: 120, h: 60 }], 6);
  ok(sn.dx === -3 && sn.guides.length === 1, 'a moving box lines up with another');
}

// ---- drawn ------------------------------------------------------------------------------------------------------------
{
  const flow = specPage({
    layout: 'down',
    nodes: [
      { id: 'a', text: 'Start', shape: 'ellipse' },
      { id: 'b', text: 'Is it complete?', shape: 'diamond' },
      { id: 'c', text: 'Do the work' },
      { id: 'd', text: 'Ask for what is missing', color: 'orange' },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c', text: 'Yes' },
      { from: 'b', to: 'd', text: 'No' },
      { from: 'd', to: 'b', dashed: true },
    ],
  });
  const d = normalizeDiagram({ pages: [flow.page] });
  const light = pageSvg(d, d.pages[0]);
  ok(light.svg.startsWith('<svg') && light.svg.endsWith('</svg>') && !/NaN|undefined/.test(light.svg), 'a page drawn as SVG');
  const opens = (light.svg.match(/<g[\s>]/g) ?? []).length;
  const closes = (light.svg.match(/<\/g>/g) ?? []).length;
  ok(opens === closes, 'its groups close');
  const dark = pageSvg(d, d.pages[0], { theme: { paper: '#000000', ink: '#eeeeee', muted: '#999999', fill: '#111111', grid: '#333333', dark: true } });
  ok(dark.svg.includes('#eeeeee') && !light.svg.includes('#eeeeee'), 'dark: the theme’s colours where none are given');
  const themed = pageSvg(d, d.pages[0], { themed: true });
  ok(themed.svg.includes('dg-ink-s') && themed.svg.includes('<style>'), 'themed: classes the page’s stylesheet colours');
  ok(sketchPath('M0 0L100 0L100 50Z', 'x') === sketchPath('M0 0L100 0L100 50Z', 'x') && sketchPath('M0 0L100 0', 'x') !== sketchPath('M0 0L100 0', 'y'), 'drawn by hand, the same each time');
  const sk = pageSvg({ ...d, sketch: true }, d.pages[0]);
  ok(sk.svg.length > light.svg.length, 'by hand, every line drawn twice');
}

// ---- every layout, and the panel -----------------------------------------------------------------------------------------
{
  const words = ['Launch', 'Plan the work', 'Build it', 'Test it', 'Write the docs', 'Tell the press', 'Fix what broke', 'Ship it'];
  const nodes = words.map((text, i) => ({ id: `n${i}`, text, icon: i === 7 ? 'rocket' : undefined }));
  const edges = [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [3, 6], [6, 7]].map(([a, b]) => ({ from: `n${a}`, to: `n${b}` }));
  for (const l of LAYOUTS) {
    if (l === 'none') continue;
    const r = specPage({ layout: l, nodes, edges }, { icon: lucideIcon });
    const d = normalizeDiagram({ pages: [r.page] });
    ok(r.page.items.length === nodes.length + edges.length && clashes(r.page).length === 0, `${l}: laid out, nothing over anything (${clashes(r.page).join(', ')})`);
    ok(!/NaN|undefined/.test(pageSvg(d, d.pages[0]).svg), `${l}: drawn`);
  }
  const entries = PALETTE.flatMap((g) => g.entries);
  ok(new Set(entries.map((e) => e.id)).size === entries.length, 'each shape of the panel has an id of its own');
  for (const e of entries) {
    if (e.edge) continue;
    const s = shape(e.id, 0, 0, e.w ?? KINDS[e.shape!].w, e.h ?? KINDS[e.shape!].h, { shape: e.shape, text: e.text, rows: e.rows, style: e.style });
    ok(!/NaN|undefined/.test(pageSvg(normalizeDiagram({}), { id: 'p', name: 'P', items: [s] }).svg), `${e.id}: drawn`);
    if (e.icon) ok(!!lucideIcon(e.icon), `${e.id}: Lucide has “${e.icon}”`);
  }
}

// ---- written as it streams in -----------------------------------------------------------------------------------------
{
  const call = JSON.stringify({ title: 'Flow', layout: 'down', nodes: [{ id: 'a', text: 'Alpha' }, { id: 'b', text: 'Beta' }, { id: 'c', text: 'Gamma' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] });
  const memo = new DraftMemo();
  let last = 0;
  let grew = true;
  for (const cut of [40, 70, 100, call.length - 30, call.length]) {
    const r = draftDiagram(null, readPartial(call.slice(0, cut)), memo);
    const n = r ? r.model.pages[0].items.filter(isShape).length : 0;
    if (n < last) grew = false;
    last = n;
  }
  ok(grew && last === 3, 'a diagram written as nodes grows as they come');
  const base = normalizeDiagram({ pages: [specPage({ nodes: [{ id: 'a', text: 'A' }], edges: [] }).page] });
  const ch = draftDiagram(base, readPartial('{"id":"x","change":[{"id":"a","text":"Changed'), new DraftMemo());
  ok((ch?.model.pages[0].items[0] as DiagramShape).text === 'Changed' && ch?.mark?.kind === 'diagram' && ch.mark.item === 'a', 'a change shows as it is written, the shape marked');
}

// ---- through the routes -----------------------------------------------------------------------------------------------
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-diagram-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
  try {
    done(null, String(b).trim() ? JSON.parse(String(b)) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const deps = {
  app,
  db,
  sessions: { deliverOrQueue: async () => {} },
  broadcast: () => {},
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
pages.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tools = Object.fromEntries(pages.tools!(ctx).map((t) => [t.name, t]));
const run = async (name: string, args: Record<string, unknown>): Promise<{ text?: string; error?: string }> => {
  try {
    const r = await tools[name].run(args, ctx);
    return { text: typeof r === 'string' ? r : r.text };
  } catch (e) {
    return { error: (e as Error).message };
  }
};
const req = (method: 'GET' | 'POST', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'app.test' } });
const idOf = (text?: string) => /\(page ([a-f0-9]{10})/.exec(text ?? '')?.[1] ?? '';
const modelOf = async (id: string) => (await req('GET', `/api/pages/${id}`)).json().model as Diagram;
{
  ok(!!tools.save_diagram && /draw\.io/.test(tools.save_diagram.description), 'agents have save_diagram');
  const made = await run('save_diagram', {
    title: 'Refunds',
    description: 'How a refund is handled.',
    layout: 'down',
    nodes: [
      { id: 'start', text: 'Refund asked', shape: 'start', color: 'green' },
      { id: 'check', text: 'Within 30 days?', shape: 'decision', color: 'yellow' },
      { id: 'pay', text: 'Pay it back', color: 'blue' },
      { id: 'no', text: 'Say no, kindly', color: 'red' },
      { id: 'db', text: 'Orders', shape: 'database' },
    ],
    edges: [
      { from: 'start', to: 'check' },
      { from: 'check', to: 'pay', text: 'yes' },
      { from: 'check', to: 'no', text: 'no' },
      { from: 'pay', to: 'db', dashed: true },
    ],
  });
  const id = idOf(made.text);
  ok(id && /5 shapes/.test(made.text ?? ''), `save_diagram makes one (${made.error ?? made.text?.slice(0, 80)})`);
  const info = (await req('GET', `/api/pages/${id}`)).json();
  ok(info.page?.kind === 'diagram' && info.model.pages[0].items.length === 9, 'kept as a diagram of the Library');
  const said = (await run('get_page', { id })).text ?? '';
  ok(/check · diamond "Within 30 days\?" at \d+,\d+/.test(said) && /connector check → pay "yes"/.test(said) && said.includes('color yellow'), 'get_page lists each shape and connector by id, with its look');
  const changed = await run('save_diagram', { id, change: [{ id: 'no', text: 'Offer store credit', color: 'orange' }], add: { nodes: [{ id: 'mail', text: 'Email the customer' }], edges: [{ from: 'pay', to: 'mail' }] }, remove: ['db'] });
  const m2 = await modelOf(id);
  ok(!changed.error && m2.pages[0].items.some((x) => x.id === 'mail') && !m2.pages[0].items.some((x) => x.id === 'db') && (m2.pages[0].items.find((x) => x.id === 'no') as DiagramShape).text === 'Offer store credit', `changes by id (${changed.error ?? ''})`);
  ok((await run('save_diagram', { change: [{ id: 'a' }] })).error?.includes('give its id'), 'changes need the id of a saved diagram');
  ok((await run('save_slides', { id, slides: [] })).error?.includes('save_diagram'), 'another kind’s save points to save_diagram');
  const mer = await run('save_diagram', { title: 'From Mermaid', mermaid: 'flowchart LR\n  A[Write] --> B{Review?}\n  B -- yes --> C([Publish])\n  B -- no --> A' });
  const mm = await modelOf(idOf(mer.text));
  ok(!mer.error && mm.pages[0].items.filter(isShape).length === 3 && (mm.pages[0].items.find((x) => x.id === 'B') as DiagramShape).shape === 'diamond', `Mermaid becomes shapes (${mer.error ?? ''})`);
  const seq = await run('save_diagram', { title: 'Login', mermaid: 'sequenceDiagram\n  participant B as Browser\n  participant S as Server\n  B->>S: POST /login\n  S-->>B: 200 OK' });
  ok(!seq.error && (await modelOf(idOf(seq.text))).pages[0].items.some((x) => isShape(x) && x.shape === 'lifeline'), 'a sequence diagram becomes lifelines');
  const raw = await run('save_diagram', { title: 'Exact', diagram: { pages: [{ name: 'P', items: [{ id: 'x', type: 'shape', shape: 'rect', x: 5, y: 6, w: 70, h: 40, text: 'Hi' }] }] } });
  ok(!raw.error && (await modelOf(idOf(raw.text))).pages[0].items[0].id === 'x', 'the model itself, exactly');
  const many = await run('save_diagram', { title: 'Two pages', pages: [{ name: 'Overview', nodes: [{ id: 'a', text: 'A' }], edges: [] }, { name: 'Detail', mermaid: 'mindmap\n  root((Topic))\n    One\n    Two' }] });
  const mp = await modelOf(idOf(many.text));
  ok(mp.pages.length === 2 && mp.pages[1].name === 'Detail', 'pages, each its own way');
  // A picture of the session's folder goes in, kept apart.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(path.join(tmp, 'logo.png'), png);
  const pic = await run('save_diagram', { title: 'With a picture', nodes: [{ id: 'p', shape: 'image', text: 'Logo', style: {} }], edges: [] });
  void pic;
  const withSrc = await run('save_diagram', { title: 'Picture', diagram: { items: [{ id: 'p', type: 'shape', shape: 'image', x: 0, y: 0, w: 50, h: 50, src: 'logo.png' }] } });
  const ps = (await modelOf(idOf(withSrc.text))).pages[0].items[0] as DiagramShape;
  ok(ps.src?.startsWith('naget-asset:'), `a picture of the folder is kept by the app (${ps.src})`);
  // page_action.
  const lay = await run('page_action', { id, action: 'layout', layout: 'right' });
  ok(!lay.error && /laid out/.test(lay.text ?? ''), `page_action layout (${lay.error ?? ''})`);
  const rs = await run('page_action', { id, action: 'restyle', color: 'purple', sketch: true });
  const m3 = await modelOf(id);
  ok(!rs.error && m3.sketch === true && m3.pages[0].items.filter(isShape).every((s) => s.style?.fill === '#e1d5e7'), `page_action restyle (${rs.error ?? ''})`);
  // Its own pages and files.
  const v = (await req('GET', `/api/pages/${id}/versions/${(await req('GET', `/api/pages/${id}`)).json().page.version}`)).json();
  ok(/class="dg-view"/.test(v.html) && /dg-ink-s/.test(v.html), 'its own page: a viewer in the app’s theme');
  const svg = await req('GET', `/api/pages/${id}/export?format=svg`);
  ok(svg.statusCode === 200 && svg.headers['content-type']?.toString().includes('svg') && svg.body.startsWith('<?xml') && !svg.body.includes('dg-ink-s'), 'an SVG file, its colours its own');
  const dio = await req('GET', `/api/pages/${id}/export?format=drawio`);
  ok(dio.statusCode === 200 && dio.body.includes('<mxfile') && dio.body.includes('Offer store credit'), 'a draw.io file');
  const two = await req('GET', `/api/pages/${idOf(many.text)}/export?format=svg`);
  ok(two.statusCode === 200 && two.headers['content-type']?.toString().includes('zip'), 'several pages: a zip of SVGs');
  const one = await req('GET', `/api/pages/${idOf(many.text)}/export?format=svg&slide=2`);
  ok(one.statusCode === 200 && one.body.includes('Topic'), 'or one page alone');
  // Opened from files: Mermaid and draw.io (its own and compressed).
  const fromMmd = await req('POST', '/api/pages/import', { name: 'plan.mmd', data: Buffer.from('graph TD\n  a --> b').toString('base64') });
  ok(fromMmd.statusCode === 200 && fromMmd.json().page.kind === 'diagram' && fromMmd.json().page.title === 'plan', 'a Mermaid file opens as a diagram');
  const xml = diagramToDrawio(m3, 'Refunds');
  const fromDio = await req('POST', '/api/pages/import', { name: 'refunds.drawio', data: Buffer.from(xml).toString('base64') });
  const back = fromDio.statusCode === 200 ? await modelOf(fromDio.json().page.id) : null;
  ok(back && back.pages[0].items.filter(isShape).length === m3.pages[0].items.filter(isShape).length, `a draw.io file opens as a diagram (${fromDio.statusCode})`);
  const inner = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Zipped" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="10" y="10" width="100" height="40" as="geometry"/></mxCell></root></mxGraphModel>';
  const packed = zlib.deflateRawSync(Buffer.from(encodeURIComponent(inner))).toString('base64');
  const zipped = await req('POST', '/api/pages/import', { name: 'x.drawio', data: Buffer.from(`<mxfile><diagram name="Z">${packed}</diagram></mxfile>`).toString('base64') });
  ok(zipped.statusCode === 200 && (await modelOf(zipped.json().page.id)).pages[0].items.some((x) => x.text === 'Zipped'), 'a compressed draw.io page opens too');
  const asked = await req('POST', '/api/pages/import', { name: 'drawn.svg', kind: 'diagram', data: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" content="${xml.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"></svg>`).toString('base64') });
  ok(asked.statusCode === 200 && asked.json().page.kind === 'diagram', 'a draw.io SVG opens as a diagram when asked');
  // New: an empty one.
  const fresh = await req('POST', '/api/pages', { title: 'Blank', kind: 'diagram' });
  ok(fresh.statusCode === 200 && (await modelOf(fresh.json().page.id)).pages.length === 1, 'New makes an empty diagram');
  // The rest of the kinds' lists name diagrams.
  ok(/save_diagram/.test((await pages.spawn!({ extra: {} } as never, deps))!.instructions!.join(' ')), 'every agent hears of save_diagram');
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
void CONTAINER_KINDS;
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
