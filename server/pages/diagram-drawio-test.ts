// Script tests for draw.io files (shared/diagram-drawio.ts): reading them into diagrams (a flowchart as draw.io saves it,
// with its colours, ports, waypoints and words on and along its connectors; a compressed page and pages after it; a
// swimlane with what is in it; a group; an ER entity and a UML class made of rows; a draw.io table with a connector to one
// of its rows; a picture; HTML labels; stencils a diagram has no kind for; layers; a draw.io SVG and PNG; files that are
// not draw.io's), writing them (well formed, ids, containers and groups as draw.io keeps them), and the round trips both
// ways. It touches no data. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/diagram-drawio-test.ts && node dist/dev/diagram-drawio-test.js
import zlib from 'node:zlib';
import { diagramToDrawio, drawioToDiagram, htmlText, isDrawio, parseXml, type XmlEl } from '../../shared/diagram-drawio.ts';
import { normalizeDiagram, SHAPE_KINDS, type Diagram, type DiagramEdge, type DiagramShape } from '../../shared/diagram.ts';
import { lookOf } from '../../shared/diagram-shapes.ts';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const inflate = (b: Uint8Array) => zlib.inflateRawSync(b);
const read = (input: string | Uint8Array) => drawioToDiagram(input, { inflate });
const item = (d: Diagram, id: string, page = 0) => d.pages[page]?.items.find((i) => i.id === id);
const shape = (d: Diagram, id: string, page = 0) => {
  const it = item(d, id, page);
  return it?.type === 'shape' ? it : undefined;
};
const edge = (d: Diagram, id: string, page = 0) => {
  const it = item(d, id, page);
  return it?.type === 'edge' ? it : undefined;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const attrEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const all = (el: XmlEl, tag: string): XmlEl[] => [...(el.tag === tag ? [el] : []), ...el.kids.flatMap((k) => all(k, tag))];

const model = (cells: string, grid = 10) =>
  `<mxGraphModel dx="1434" dy="764" grid="1" gridSize="${grid}" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0"><root><mxCell id="0" /><mxCell id="1" parent="0" />${cells}</root></mxGraphModel>`;
const LABEL = 'edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];';
const ROW = 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;html=1;';
const CELL = 'shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;overflow=hidden;html=1;';
const TROW = 'shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;top=0;left=0;right=0;bottom=1;';
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// A flowchart as draw.io saves one: colours, ports, a waypoint, words on a connector and as labels along it, a free end.
const FLOW = model(`
<mxCell id="start" value="Start" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
  <mxGeometry x="340" y="40" width="120" height="60" as="geometry" />
</mxCell>
<mxCell id="dec" value="Is it &lt;b&gt;ok&lt;/b&gt;?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
  <mxGeometry x="330" y="160" width="140" height="90" as="geometry" />
</mxCell>
<mxCell id="proc" value="Do it&lt;br&gt;now &amp;amp;&amp;nbsp;then&lt;div&gt;and again&lt;/div&gt;" style="whiteSpace=wrap;html=1;fontSize=14;fontStyle=1;fontColor=#333333;" vertex="1" parent="1">
  <mxGeometry x="560" y="175" width="120" height="60" as="geometry" />
</mxCell>
<mxCell id="end" value="End&#10;here" style="ellipse;whiteSpace=wrap;dashed=1;dashPattern=1 2;strokeWidth=2;" vertex="1" parent="1">
  <mxGeometry x="350" y="320" width="100" height="60" as="geometry" />
</mxCell>
<mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" parent="1" source="start" target="dec">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e2" value="Yes" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=0;strokeColor=#82b366;" edge="1" parent="1" source="dec" target="proc">
  <mxGeometry x="-0.5" relative="1" as="geometry"><Array as="points"><mxPoint x="520" y="205" /></Array></mxGeometry>
</mxCell>
<mxCell id="e3" style="edgeStyle=none;html=1;endArrow=ERmandOne;startArrow=ERzeroToMany;startFill=0;" edge="1" parent="1" source="dec" target="end">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="e3a" value="1" style="${LABEL}" vertex="1" connectable="0" parent="e3"><mxGeometry x="-0.8" relative="1" as="geometry"><mxPoint as="offset" /></mxGeometry></mxCell>
<mxCell id="e3b" value="N" style="${LABEL}" vertex="1" connectable="0" parent="e3"><mxGeometry x="0.8" relative="1" as="geometry"><mxPoint as="offset" /></mxGeometry></mxCell>
<mxCell id="e3c" value="No" style="${LABEL}" vertex="1" connectable="0" parent="e3"><mxGeometry x="0.2" relative="1" as="geometry"><mxPoint as="offset" /></mxGeometry></mxCell>
<mxCell id="e4" value="" style="endArrow=classic;html=1;curved=1;" edge="1" parent="1" source="proc">
  <mxGeometry width="50" height="50" relative="1" as="geometry"><mxPoint x="620" y="235" as="sourcePoint" /><mxPoint x="700" y="320" as="targetPoint" /></mxGeometry>
</mxCell>`);

// A page of containers, a group, rows, a table, a picture, stencils, a linked object and a hidden shape (compressed below).
const DETAILS = model(
  `
<mxCell id="lane" value="Team" style="swimlane;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="300" height="200" as="geometry" /></mxCell>
<mxCell id="inLane" value="Task" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="lane"><mxGeometry x="20" y="60" width="100" height="40" as="geometry" /></mxCell>
<mxCell id="pool" value="Pool" style="swimlane;horizontal=0;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="300" width="400" height="120" as="geometry" /></mxCell>
<mxCell id="grp" value="" style="group" vertex="1" connectable="0" parent="1"><mxGeometry x="400" y="40" width="200" height="100" as="geometry" /></mxCell>
<mxCell id="g1" value="A" style="ellipse;whiteSpace=wrap;html=1;" vertex="1" parent="grp"><mxGeometry width="80" height="80" as="geometry" /></mxCell>
<mxCell id="g2" value="B" style="triangle;whiteSpace=wrap;html=1;direction=south;" vertex="1" parent="grp"><mxGeometry x="120" y="20" width="80" height="60" as="geometry" /></mxCell>
<mxCell id="gE" style="endArrow=classic;html=1;" edge="1" parent="grp" source="g1" target="g2"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="100" y="10" /></Array></mxGeometry></mxCell>
<mxCell id="ent" value="Customer" style="swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=26;fillColor=none;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;html=1;" vertex="1" parent="1"><mxGeometry x="640" y="40" width="160" height="104" as="geometry" /></mxCell>
<mxCell id="ent1" value="id" style="${ROW}" vertex="1" parent="ent"><mxGeometry y="26" width="160" height="26" as="geometry" /></mxCell>
<mxCell id="ent2" value="name" style="${ROW}" vertex="1" parent="ent"><mxGeometry y="52" width="160" height="26" as="geometry" /></mxCell>
<mxCell id="ent3" value="email" style="${ROW}" vertex="1" parent="ent"><mxGeometry y="78" width="160" height="26" as="geometry" /></mxCell>
<mxCell id="cls" value="Order" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="640" y="200" width="180" height="86" as="geometry" /></mxCell>
<mxCell id="cls1" value="+ total: number" style="${ROW}" vertex="1" parent="cls"><mxGeometry y="26" width="180" height="26" as="geometry" /></mxCell>
<mxCell id="cls2" value="" style="line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=inherit;" vertex="1" parent="cls"><mxGeometry y="52" width="180" height="8" as="geometry" /></mxCell>
<mxCell id="cls3" value="+ pay(): void" style="${ROW}" vertex="1" parent="cls"><mxGeometry y="60" width="180" height="26" as="geometry" /></mxCell>
<mxCell id="tbl" value="Invoice" style="shape=table;startSize=30;container=1;collapsible=1;childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;html=1;" vertex="1" parent="1"><mxGeometry x="880" y="40" width="180" height="90" as="geometry" /></mxCell>
<mxCell id="tr1" value="" style="${TROW}" vertex="1" parent="tbl"><mxGeometry y="30" width="180" height="30" as="geometry" /></mxCell>
<mxCell id="tc1" value="PK" style="${CELL}fontStyle=1;" vertex="1" parent="tr1"><mxGeometry width="30" height="30" as="geometry"><mxRectangle width="30" height="30" as="alternateBounds" /></mxGeometry></mxCell>
<mxCell id="tc2" value="id" style="${CELL}align=left;spacingLeft=6;" vertex="1" parent="tr1"><mxGeometry x="30" width="150" height="30" as="geometry"><mxRectangle width="150" height="30" as="alternateBounds" /></mxGeometry></mxCell>
<mxCell id="tr2" value="" style="${TROW}" vertex="1" parent="tbl"><mxGeometry y="60" width="180" height="30" as="geometry" /></mxCell>
<mxCell id="tc3" value="FK" style="${CELL}" vertex="1" parent="tr2"><mxGeometry width="30" height="30" as="geometry" /></mxCell>
<mxCell id="tc4" value="customer_id" style="${CELL}align=left;" vertex="1" parent="tr2"><mxGeometry x="30" width="150" height="30" as="geometry" /></mxCell>
<mxCell id="rel" style="edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERoneToMany;startArrow=ERmandOne;rounded=0;" edge="1" parent="1" source="ent1" target="tr2"><mxGeometry width="100" height="100" relative="1" as="geometry" /></mxCell>
<mxCell id="pic" value="Logo" style="shape=image;verticalLabelPosition=bottom;labelBackgroundColor=default;verticalAlign=top;aspect=fixed;imageAspect=0;image=data:image/png,${PNG_1PX};" vertex="1" parent="1"><mxGeometry x="40" y="460" width="64" height="64" as="geometry" /></mxCell>
<mxCell id="aws1" value="Lambda" style="sketch=0;outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=#ED7100;strokeColor=none;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;pointerEvents=1;shape=mxgraph.aws4.lambda_function;" vertex="1" parent="1"><mxGeometry x="200" y="460" width="48" height="48" as="geometry" /></mxCell>
<mxCell id="aws2" value="" style="shape=mxgraph.aws4.lambda;fillColor=#ED7100;" vertex="1" parent="1"><mxGeometry x="300" y="460" width="48" height="48" as="geometry" /></mxCell>
<mxCell id="cisco" value="" style="shape=mxgraph.cisco.routers.router;html=1;" vertex="1" parent="1"><mxGeometry x="400" y="460" width="50" height="30" as="geometry" /></mxCell>
<UserObject label="Docs" link="https://example.com/docs" tooltip="Read the docs" id="uo"><mxCell style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="500" y="460" width="80" height="40" as="geometry" /></mxCell></UserObject>
<mxCell id="hid" value="hidden" style="rounded=0;" vertex="1" parent="1" visible="0"><mxGeometry x="0" y="600" width="80" height="40" as="geometry" /></mxCell>`,
  20,
);

// Two layers on one page.
const LAYERS = `<mxGraphModel grid="1" gridSize="10"><root><mxCell id="0" /><mxCell id="1" parent="0" /><mxCell id="L2" value="Notes" parent="0" />
<mxCell id="a" value="On layer 1" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry" /></mxCell>
<mxCell id="b" value="On layer 2" style="text;html=1;" vertex="1" parent="L2"><mxGeometry x="100" width="80" height="40" as="geometry" /></mxCell>
</root></mxGraphModel>`;

const compressed = zlib.deflateRawSync(Buffer.from(encodeURIComponent(DETAILS))).toString('base64');
const FILE = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" agent="Mozilla/5.0" version="24.7.17" type="device">
  <diagram id="flow-page" name="Flow">${FLOW}</diagram>
  <diagram id="details-page" name="Details">${compressed}</diagram>
  <diagram id="layers-page" name="Layers">${LAYERS}</diagram>
</mxfile>`;

const { diagram: d, notes } = await read(FILE);

// ---- the flowchart --------------------------------------------------------------------------------------------------------
{
  ok(d.pages.length === 3 && d.pages.map((p) => p.name).join() === 'Flow,Details,Layers', `three pages by their names (${d.pages.map((p) => p.name)})`);
  ok(d.pages[0].id === 'flow-page' && d.grid === 10, 'pages keep their ids; the grid is the first page’s');
  const start = shape(d, 'start');
  ok(start?.shape === 'rounded' && start.x === 340 && start.y === 40 && start.w === 120 && start.h === 60, 'a rounded box where it was, as large');
  ok(start?.style?.fill === '#dae8fc' && start.style.stroke === '#6c8ebf' && start.text === 'Start', 'its colours and words');
  ok(start?.style?.size === 12 && start.style.radius === undefined, `draw.io's 12-pixel words kept, its usual corners the kind's own (${JSON.stringify(start?.style)})`);
  ok(shape(d, 'dec')?.shape === 'diamond' && shape(d, 'dec')?.text === 'Is it ok?', 'a rhombus is a diamond; HTML tags left out');
  const proc = shape(d, 'proc');
  ok(proc?.shape === 'rect' && proc.text === 'Do it\nnow & then\nand again', `an HTML label's lines, entities and spaces (${JSON.stringify(proc?.text)})`);
  ok(proc?.style?.bold === true && proc.style.color === '#333333' && proc.style.size === undefined, 'bold, its colour, and 14 pixels (the kind’s own) left out');
  const end = shape(d, 'end');
  ok(end?.shape === 'ellipse' && end.text === 'End\nhere' && end.style?.dash === 'dotted' && end.style.width === 2, 'a plain label’s line break, a dotted line two pixels wide');
  const e1 = edge(d, 'e1');
  ok(same(e1?.from, { id: 'start', port: [0.5, 1] }) && same(e1?.to, { id: 'dec', port: [0.5, 0] }), 'ports from exitX/exitY and entryX/entryY');
  ok(e1?.route === undefined && e1?.style?.radius === 0, 'an orthogonal connector (the default) with sharp bends (rounded=0)');
  const e2 = edge(d, 'e2');
  ok(e2?.text === 'Yes' && e2.at === 0.25 && same(e2.points, [[520, 205]]), 'words placed along it (x -0.5 is a quarter), a waypoint');
  ok(e2?.style?.end === 'triangle' && e2.style.stroke === '#82b366' && e2.style.radius === undefined, 'a hollow block arrow, its colour, rounded bends the default');
  const e3 = edge(d, 'e3');
  ok(e3?.route === 'straight' && e3.style?.end === 'er-only-one' && e3.style.start === 'er-zero-many', 'a straight ER connector with its crow’s feet');
  ok(e3?.fromText === '1' && e3.toText === 'N' && e3.text === 'No' && e3.at === 0.6, 'labels near its ends and along it');
  const e4 = edge(d, 'e4');
  ok(e4?.route === 'curved' && same(e4.from, { id: 'proc' }) && same(e4.to, { x: 700, y: 320 }), 'a curved connector with a free end');
  ok(e4?.style?.end === undefined && e4?.style?.start === undefined, 'draw.io’s default arrowheads are a diagram’s');
}

// ---- containers, groups, rows, tables, pictures, stencils -----------------------------------------------------------------
{
  const lane = shape(d, 'lane', 1);
  const task = shape(d, 'inLane', 1);
  ok(lane?.shape === 'swimlane' && lane.style?.fill === '#d5e8d4' && lane.style.bold === undefined, 'a swimlane, its colour (its bold title its own)');
  ok(task?.parent === 'lane' && task.x === 60 && task.y === 100, `what is in it: its parent, placed on the page (${task?.x}, ${task?.y})`);
  ok(shape(d, 'pool', 1)?.shape === 'lane', 'a swimlane with its title on its left is a lane');
  const g1 = shape(d, 'g1', 1);
  const g2 = shape(d, 'g2', 1);
  ok(!item(d, 'grp', 1) && g1?.group === 'grp' && g2?.group === 'grp', 'a group is not a shape: its shapes are grouped');
  ok(g1?.x === 400 && g1.y === 40 && g2?.x === 520 && g2.y === 60, 'grouped shapes placed on the page');
  ok(g2?.shape === 'triangle' && g2.flipV === true, 'a triangle pointing south is one flipped');
  const gE = edge(d, 'gE', 1);
  ok(gE?.group === 'grp' && same(gE.points, [[500, 50]]), 'a connector in a group: grouped, its points on the page');
  const ent = shape(d, 'ent', 1);
  ok(ent?.shape === 'entity' && ent.text === 'Customer' && same(ent.rows, ['id', 'name', 'email']), 'an ER entity: one shape with its rows');
  ok(!item(d, 'ent1', 1) && !item(d, 'cls2', 1), 'its rows are not shapes of their own');
  const cls = shape(d, 'cls', 1);
  ok(cls?.shape === 'class' && same(cls.rows, ['+ total: number', '---', '+ pay(): void']), 'a UML class: its members, a line between them');
  const tbl = shape(d, 'tbl', 1);
  ok(tbl?.shape === 'table' && tbl.text === 'Invoice' && same(tbl.rows, ['PK|id', 'FK|customer_id']), `a draw.io table: its rows of cells (${JSON.stringify(tbl?.rows)})`);
  const rel = edge(d, 'rel', 1);
  ok(same(rel?.from, { id: 'ent', port: [1, 0.38] }) && same(rel?.to, { id: 'tbl', port: [0, 0.83] }), `a connector to rows: to their shape, at the row, facing (${JSON.stringify([rel?.from, rel?.to])})`);
  ok(rel?.style?.end === 'er-one-many' && rel.style.start === 'er-only-one' && rel.route === undefined, 'ER ends; entity-relation routing is orthogonal');
  const pic = shape(d, 'pic', 1);
  ok(pic?.shape === 'image' && pic.src === `data:image/png;base64,${PNG_1PX}` && !!pic && lookOf(pic).label === 'below', 'a picture: its data URI given back its ";base64", its words under it');
  const aws = shape(d, 'aws1', 1);
  ok(aws?.shape === 'rect' && aws.style?.fill === '#ed7100' && aws.style.label === 'below' && aws.text === 'Lambda', 'a stencil is a rectangle in its colours, its words where they were');
  ok(notes.includes("2 shapes of draw.io's stencils (mxgraph.aws4.*) came in as plain rectangles"), `a note for each stencil library (${notes.join(' | ')})`);
  ok(notes.includes("1 shape of draw.io's stencils (mxgraph.cisco.*) came in as plain rectangles"), 'and one shape is one');
  const uo = shape(d, 'uo', 1);
  ok(uo?.text === 'Docs' && uo.link === 'https://example.com/docs' && uo.note === 'Read the docs', 'an object’s label, link and tooltip');
  ok(!item(d, 'hid', 1) && notes.includes('1 hidden shape or connector was left out'), 'a hidden shape is left out, and said');
  ok(!!item(d, 'a', 2) && !!item(d, 'b', 2) && notes.includes('2 layers were put together into one on their page'), 'layers flattened onto the page, and said');
  const b = shape(d, 'b', 2);
  ok(b?.shape === 'text' && b.style?.align === 'left' && b.style.valign === 'top' && b.style.fill === undefined, 'draw.io’s "text" style: words at its top left, nothing drawn');
}

// ---- labels -----------------------------------------------------------------------------------------------------------------
{
  ok(htmlText('A<div><br></div><div>B</div>') === 'A\n\nB', 'an empty block is an empty line');
  ok(htmlText('<div>a<br></div><div>b</div>') === 'a\nb', 'a line break ending a block adds none');
  ok(htmlText('<ul><li>one</li><li>two</li></ul>') === '• one\n• two', 'a list’s items');
  ok(htmlText('x &lt;y&gt; &quot;z&quot; &#169; &#x263A;  <span style="color:red">  w </span>') === 'x <y> "z" © ☺ w', 'entities, and spaces run together');
  ok(htmlText('<table><tr><td>PK</td><td>id</td></tr><tr><td>FK</td><td>ref</td></tr></table>') === 'PK id\nFK ref', 'an HTML table’s rows');
}

// ---- a draw.io SVG and PNG, a bare model, what is not draw.io's -----------------------------------------------------------
const chunk = (type: string, data: Uint8Array) => {
  // Its CRC left as zeros: the reader does not check it.
  const b = new Uint8Array(12 + data.length);
  new DataView(b.buffer).setUint32(0, data.length);
  b.set(Buffer.from(type, 'latin1'), 4);
  b.set(data, 8);
  return b;
};
const png = (...chunks: Uint8Array[]) => new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', new Uint8Array(13)), ...chunks, chunk('IDAT', new Uint8Array(0)), chunk('IEND', new Uint8Array(0))]));
{
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="900px" height="600px" viewBox="-0.5 -0.5 900 600" content="${attrEsc(FILE)}"><defs/><g><rect x="340" y="40" width="120" height="60"/></g></svg>`;
  const fromSvg = await read(svg);
  ok(isDrawio(svg) && fromSvg.diagram.pages.length === 3 && same(fromSvg.diagram.pages[1].items, d.pages[1].items), 'a draw.io SVG: the file in its content');
  const tEXt = png(chunk('tEXt', Buffer.concat([Buffer.from('mxfile\0'), Buffer.from(encodeURIComponent(FILE))])));
  const fromPng = await read(tEXt);
  ok(isDrawio(tEXt) && same(fromPng.diagram.pages, d.pages), 'a draw.io PNG: the file in its tEXt chunk');
  const zTXt = png(chunk('zTXt', Buffer.concat([Buffer.from('mxGraphModel\0\0'), zlib.deflateRawSync(Buffer.from(encodeURIComponent(FLOW)))])));
  ok(same((await read(zTXt)).diagram.pages[0].items, d.pages[0].items), 'an older draw.io PNG: the model, deflated, in a zTXt chunk');
  const iTXt = png(chunk('iTXt', Buffer.concat([Buffer.from('mxfile\0\x01\0\0\0'), zlib.deflateSync(Buffer.from(FILE))])));
  ok(same((await read(iTXt)).diagram.pages, d.pages), 'an iTXt chunk, compressed with zlib’s wrapping');
  ok(!isDrawio(png()) && !isDrawio('<html><body>hi</body></html>') && !isDrawio('hello') && !isDrawio('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'other PNGs, HTML, words and SVGs are not draw.io files');
  ok(isDrawio(FLOW) && isDrawio(new TextEncoder().encode(FILE)) && isDrawio(`<?xml version="1.0"?>\n<!-- saved -->\n${FLOW}`), 'a bare model, and a file as bytes, are');
  const bare = await read(FLOW);
  ok(bare.diagram.pages.length === 1 && same(bare.diagram.pages[0].items, d.pages[0].items) && bare.diagram.pages[0].name === 'Page 1', 'a bare <mxGraphModel> is one page');
  const uri = await read(encodeURIComponent(FILE));
  ok(same(uri.diagram.pages, d.pages), 'a URI-encoded file');
  const refused = async (input: string | Uint8Array, re: RegExp) => read(input).then(() => false, (e: unknown) => e instanceof Error && re.test(e.message));
  ok(await refused('<html><body>hi</body></html>', /not a draw\.io file/), 'HTML is refused');
  ok(await refused('just some words', /not a draw\.io file/), 'words are refused');
  ok(await refused('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>', /no draw\.io diagram/), 'an SVG without a diagram is refused');
  ok(await refused(png(), /no draw\.io diagram/), 'a PNG without one is refused');
  ok(await refused('<mxfile host="x"></mxfile>', /no pages/), 'a file without pages is refused');
  const broken = await read(`<mxfile><diagram id="a" name="Bad">%%%not-base64%%%</diagram><diagram id="b" name="Good">${FLOW}</diagram></mxfile>`);
  ok(broken.diagram.pages.length === 1 && broken.notes.includes('1 page could not be read'), 'a page that cannot be read is left out, and said');
  const many = await read(`<mxfile>${Array.from({ length: 42 }, (_, i) => `<diagram id="p${i}" name="P${i}">${model('')}</diagram>`).join('')}</mxfile>`);
  ok(many.diagram.pages.length === 40 && many.notes.includes('2 pages were over the 40 a diagram holds'), 'pages over the forty a diagram holds, said');
}

// ---- the file it writes -----------------------------------------------------------------------------------------------------
const out = diagramToDrawio(d);
{
  const x = parseXml(out);
  const pages = x.kids.filter((k) => k.tag === 'diagram');
  ok(x.tag === 'mxfile' && x.attrs.host === 'Hydor' && pages.length === 3 && pages.map((p) => p.attrs.name).join() === 'Flow,Details,Layers', 'an <mxfile> of three <diagram>s by their names');
  for (const p of pages) {
    const root = p.kids[0]?.kids.find((k) => k.tag === 'root');
    const els = root?.kids ?? [];
    const idOf = (el: XmlEl) => el.attrs.id;
    const cellOf = (el: XmlEl) => (el.tag === 'mxCell' ? el : el.kids.find((k) => k.tag === 'mxCell'));
    const seen = new Set<string>();
    let order = true;
    for (const el of els) {
      const parent = cellOf(el)?.attrs.parent;
      if (parent !== undefined && !seen.has(parent)) order = false;
      seen.add(idOf(el));
    }
    ok(p.kids[0]?.tag === 'mxGraphModel' && idOf(els[0]) === '0' && idOf(els[1]) === '1' && cellOf(els[1])?.attrs.parent === '0', `${p.attrs.name}: the root and its layer first`);
    ok(seen.size === els.length && order, `${p.attrs.name}: every cell of its own id, after the cell it is in`);
    const edgesOk = els.every((el) => !cellOf(el)?.attrs.edge || ['source', 'target'].every((k) => !cellOf(el)?.attrs[k] || seen.has(cellOf(el)!.attrs[k])));
    ok(edgesOk, `${p.attrs.name}: connectors join cells that are there`);
  }
  const cells = new Map<string, { el: XmlEl; cell: XmlEl }>();
  for (const el of all(x, 'mxCell')) if (el.attrs.id) cells.set(el.attrs.id, { el, cell: el });
  for (const el of all(x, 'UserObject')) cells.set(el.attrs.id, { el, cell: el.kids.find((k) => k.tag === 'mxCell')! });
  const geo = (id: string) => cells.get(id)?.cell.kids.find((k) => k.tag === 'mxGeometry')?.attrs ?? {};
  const style = (id: string) => cells.get(id)?.cell.attrs.style ?? '';
  const parentOf = (id: string) => cells.get(id)?.cell.attrs.parent;
  ok(parentOf('inLane') === 'lane' && geo('inLane').x === '20' && geo('inLane').y === '60', 'a swimlane’s shape is in it, placed from its corner');
  ok(style('grp') === 'group' && parentOf('g1') === 'grp' && geo('g1').x === '0' && geo('g2').x === '120' && geo('g2').y === '20', 'a group is draw.io’s group cell round its shapes, each placed from its corner');
  ok(parentOf('gE') === 'grp' && all(cells.get('gE')!.cell, 'mxPoint').some((p) => p.attrs.x === '100' && p.attrs.y === '10'), 'a grouped connector’s points from the group’s corner');
  ok(style('ent').includes('childLayout=stackLayout') && [...cells.values()].filter((c) => c.cell.attrs.parent === 'ent').length === 3, 'an entity is a swimlane stacking a cell for each row');
  ok([...cells.values()].some((c) => c.cell.attrs.parent === 'cls' && c.cell.attrs.style?.startsWith('line;')), 'a class’s "---" is a line between its rows');
  const rows = [...cells.values()].filter((c) => c.cell.attrs.parent === 'tbl');
  ok(style('tbl').startsWith('shape=table;') && rows.length === 2 && rows.every((r) => r.cell.attrs.style?.startsWith('shape=tableRow;')), 'a table is draw.io’s table of rows');
  ok(rows.every((r) => [...cells.values()].filter((c) => c.cell.attrs.parent === r.cell.attrs.id && c.cell.attrs.style?.startsWith('shape=partialRectangle;')).length === 2), 'each row its cells');
  ok(style('pic').includes(`image=data:image/png,${PNG_1PX};`), 'a picture’s data URI as draw.io writes it');
  ok(geo('e2').x === '-0.5' && style('e2').includes('endArrow=block;endFill=0;') && style('e2').includes('edgeStyle=orthogonalEdgeStyle'), 'words along a connector by its x; a hollow block; orthogonal');
  ok(style('e1').includes('exitX=0.5;exitY=1;') && style('e1').includes('entryX=0.5;entryY=0;') && style('e1').includes('rounded=0;'), 'ports, sharp bends');
  ok(cells.get('e3-from')?.cell.attrs.value === '1' && geo('e3-from').x === '-0.8' && geo('e3-to').x === '0.8', 'words near the ends as labels on the connector');
  ok(all(cells.get('e4')!.cell, 'mxPoint').some((p) => p.attrs.as === 'targetPoint' && p.attrs.x === '700' && p.attrs.y === '320'), 'a free end');
  ok(cells.get('uo')?.el.tag === 'UserObject' && cells.get('uo')?.el.attrs.link === 'https://example.com/docs' && cells.get('uo')?.el.attrs.tooltip === 'Read the docs', 'a link and a note on a <UserObject>');
  ok(cells.get('proc')?.cell.attrs.value === 'Do it<br>now &amp; then<br>and again', 'words as an HTML label, escaped, its lines apart by <br>');
  ok(style('start').includes('fillColor=#dae8fc;') && !style('dec').includes('fontColor') && !style('inLane').includes('fillColor'), 'colours given are written; the theme’s are left out');
}

// ---- round trips ------------------------------------------------------------------------------------------------------------
const diffs = (a: Diagram, b: Diagram, what: string) => {
  ok(a.pages.length === b.pages.length, `${what}: as many pages`);
  a.pages.forEach((p, i) => {
    const q = b.pages[i];
    ok(q && p.id === q.id && p.name === q.name && p.background === q.background && p.items.length === q.items.length, `${what}: page ${p.name} as it was (${p.items.length} items, ${q?.items.length})`);
    for (const it of p.items) {
      const back = q?.items.find((x) => x.id === it.id);
      ok(same(back, it), `${what}: ${it.id} as it was\n  was ${JSON.stringify(it)}\n  now ${JSON.stringify(back)}`);
    }
  });
};
{
  const again = await read(out);
  diffs(d, again.diagram, 'draw.io, a diagram, draw.io, a diagram');
  ok(again.diagram.grid === d.grid && again.notes.length === 0, `nothing to say the second time (${again.notes.join(' | ')})`);
  ok(diagramToDrawio(again.diagram) === out, 'and written again, the same file');
}
{
  // Every kind of shape, and every look and connector a diagram has, through draw.io and back.
  const icon = { name: 'server', paths: [['rect', { x: 2, y: 2, width: 20, height: 8, rx: 2 }], ['path', { d: 'M6 6h.01' }], ['circle', { cx: 12, cy: 18, r: 2 }]] };
  const rows: Record<string, string[]> = { class: ['+ id: int', '---', '+ save(): void'], entity: ['id', 'name'], table: ['a|b|c', 'd|e|f'] };
  const kinds = SHAPE_KINDS.map((k, i) => ({
    id: `k${i}`,
    type: 'shape',
    shape: k,
    x: (i % 10) * 200,
    y: Math.floor(i / 10) * 200,
    w: k === 'bar' ? 100 : 120,
    h: k === 'bar' ? 8 : 80,
    text: `A ${k}`,
    ...(rows[k] ? { rows: rows[k] } : {}),
    ...(k === 'icon' ? { icon } : {}),
    ...(k === 'image' ? { src: `data:image/png;base64,${PNG_1PX}` } : {}),
  }));
  const arrows = ['open', 'block', 'triangle', 'diamond', 'diamond-open', 'circle', 'circle-open', 'bar', 'cross', 'er-one', 'er-only-one', 'er-zero-one', 'er-many', 'er-one-many', 'er-zero-many'];
  const ours = normalizeDiagram({
    grid: 20,
    pages: [
      { id: 'kinds', name: 'Every kind', background: '#fafafa', items: kinds },
      {
        id: 'looks',
        name: 'Looks',
        items: [
          { id: 'r', shape: 'rect', x: 10, y: 10, w: 160, h: 90, rot: 30, text: 'Looked at  twice\n<b>&amp;', link: 'https://example.com', note: 'A note', locked: true, style: { fill: '#ffe6cc', gradient: '#d79b00', stroke: '#b4430a', width: 3, dash: 'dash-dot', opacity: 60, shadow: true, radius: 6, font: 'serif', size: 18, color: '#7048e8', italic: true, underline: true, align: 'right', valign: 'bottom' } },
          { id: 'tri', shape: 'triangle', x: 200, y: 10, w: 80, h: 60, flipV: true },
          { id: 'tri2', shape: 'triangle-right', x: 300, y: 10, w: 60, h: 80, flipH: true },
          { id: 'brace', shape: 'brace', x: 400, y: 10, w: 30, h: 120, flipH: true, text: 'Left' },
          { id: 'step', shape: 'step', x: 500, y: 10, w: 140, h: 60, rot: 90, text: 'Down' },
          { id: 'sticky', shape: 'sticky', x: 700, y: 10, w: 150, h: 150, text: 'Remember' },
          { id: 'asset', shape: 'image', x: 900, y: 10, w: 100, h: 80, src: 'naget-asset:pic-123.png', text: 'Kept in the app' },
          { id: 'box', shape: 'container', x: 10, y: 300, w: 600, h: 300, text: 'Box', style: { fill: '#f5f5f5' } },
          { id: 'c1', shape: 'rounded', x: 40, y: 360, w: 120, h: 60, text: 'In the box', parent: 'box', style: { radius: 4 } },
          { id: 'gA', shape: 'ellipse', x: 300, y: 360, w: 80, h: 80, text: 'A', parent: 'box', group: 'gg' },
          { id: 'gB', shape: 'diamond', x: 420, y: 400, w: 80, h: 80, text: 'B', parent: 'box', group: 'gg' },
          { id: 'x5', type: 'edge', from: { id: 'gA' }, to: { id: 'gB' }, parent: 'box', group: 'gg', route: 'straight', points: [[400, 380]] },
          { id: 'x4', type: 'edge', from: { id: 'c1', port: [1, 0.5] }, to: { id: 'gA', port: [0, 0.5] }, parent: 'box', points: [[230, 390], [230, 400]], style: { radius: 0 } },
          { id: 'x1', type: 'edge', from: { id: 'r' }, to: { id: 'sticky', port: [0.25, 0] }, text: 'Along', at: 0.3, fromText: '0..*', toText: '1', route: 'curved', style: { stroke: '#cf222e', width: 3, dash: 'dashed', size: 11, color: '#1971c2', bold: true, flow: true, radius: 4 } },
          { id: 'x2', type: 'edge', from: { x: 700, y: 700 }, to: { x: 900, y: 750 }, style: { start: 'arrow', end: 'none' } },
          ...arrows.map((a, i) => ({ id: `a${i}`, type: 'edge', from: { x: 0, y: 800 + i * 20 }, to: { x: 200, y: 800 + i * 20 }, route: 'straight', style: { start: a, end: a } })),
        ],
      },
    ],
  });
  ok(ours.pages[0].items.length === SHAPE_KINDS.length, 'a shape of every kind to try');
  const written = diagramToDrawio(ours);
  const back = await read(written);
  diffs(ours, back.diagram, 'a diagram, draw.io, a diagram');
  ok(back.diagram.grid === 20 && back.notes.length === 0, `its grid, and nothing to say (${back.notes.join(' | ')})`);
  ok(/hydorShape=sticky;/.test(written) && /hydorShape=event-end;/.test(written) && /hydorIcon=server;/.test(written), 'kinds draw.io lacks are marked to read back as themselves');
  ok(!/hydorShape=(rounded|ellipse|diamond|swimlane|actor|cylinder|terminator|table);/.test(written), 'kinds draw.io has are its own shapes, unmarked');
  ok(/image=data:image\/svg\+xml,[A-Za-z0-9+/=]+;/.test(written), 'an icon is a picture of it draw.io shows');
  const asset = written.split('\n').find((l) => l.includes('id="asset"')) ?? '';
  ok(/style="rounded=0;/.test(asset) && asset.includes('hydorSrc=naget-asset%3Apic-123.png;') && asset.includes('fillColor=#f5f5f5;') && !asset.includes('image='), 'a picture only the app reaches is a grey box keeping its source');
  // Changed in draw.io to another shape, a marked one is that shape.
  const changed = await read(written.replace(/rounded=0;whiteSpace=wrap;html=1;(fillColor=#fff1a8)/, 'ellipse;whiteSpace=wrap;html=1;$1'));
  ok(changed.diagram.pages[0].items.find((it) => it.type === 'shape' && it.text === 'A sticky')?.type === 'shape' && (changed.diagram.pages[0].items.find((it) => it.type === 'shape' && it.text === 'A sticky') as DiagramShape).shape === 'ellipse', 'a marked shape changed in draw.io is what it was changed to');
}
{
  const small = normalizeDiagram({ sketch: true, font: 'mono', pages: [{ id: 'p1', name: 'Page 1', items: [{ id: '1', shape: 'rect', x: 0, y: 0, w: 100, h: 50, text: 'One' }, { id: 'e', type: 'edge', from: { id: '1' }, to: { x: 300, y: 25 } }] }] });
  const xml = diagramToDrawio(small, 'My diagram');
  const back = (await read(xml)).diagram;
  ok(/<diagram id="p1" name="My diagram">/.test(xml), 'a single page without a name of its own takes the title');
  ok(/<mxCell id="1-2" value="One"/.test(xml) && /source="1-2"/.test(xml), 'an item called "1" (draw.io’s layer) is given another cell id, its connectors with it');
  ok(back.sketch === true && back.pages[0].items.every((it) => !it.style?.sketch), 'drawn by hand throughout: the whole diagram is');
  ok(back.pages[0].items.every((it) => !it.text || it.style?.font === 'mono'), 'the diagram’s font, on each item with words');
  const e = back.pages[0].items.find((it): it is DiagramEdge => it.type === 'edge');
  ok(e?.from.id === '1-2' && same(e.to, { x: 300, y: 25 }), 'and the connector still joins it');
}

console.log(`${passed} passed${failed ? `, ${failed} failed` : ''}`);
if (failed) process.exit(1);
