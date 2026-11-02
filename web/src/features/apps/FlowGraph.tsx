// A template's flow as a graph, to look at (the builder's What it does, Graph): each step a node in the
// colour of its kind, the order as grey wires from one to the next, a Decide's paths and the branches side
// by side and joined again, a Repeat's steps in a frame of their own, what runs when a step fails off to
// its right in red, and thin coloured wires from a step to the steps that use its values. It lays itself
// out, top to bottom; a click on a node opens that step in the list.
import type { ReactNode } from 'react';
import { AppWindow, Bot, CodeXml, Columns2, Database, MessageCircleQuestion, Repeat, Sparkles, Split, Wrench } from 'lucide-react';
import type { Flow, Step, StepKind } from '@shared/app-manifest';
import { allSteps, refsIn, STEP_KINDS, titleOf } from '@shared/app-manifest';

const W = 200;
const H = 52;
const GAP_Y = 30;
const GAP_X = 28;
const LABEL = 20;
const PAD = 16;

/** Each kind's colour: the node's stripe and the wires of the values it gives. */
export const KIND_COLOR: Record<StepKind, string> = {
  agent: '#8b5cf6',
  model: '#3b82f6',
  tool: '#f59e0b',
  decide: '#94a3b8',
  repeat: '#14b8a6',
  parallel: '#6366f1',
  app: '#06b6d4',
  data: '#22c55e',
  ask: '#f97316',
  code: '#ec4899',
};
const ICON: Record<StepKind, typeof Bot> = { agent: Bot, model: Sparkles, tool: Wrench, decide: Split, repeat: Repeat, parallel: Columns2, app: AppWindow, data: Database, ask: MessageCircleQuestion, code: CodeXml };
const KIND = Object.fromEntries(STEP_KINDS.map((k) => [k.value, k.label])) as Record<StepKind, string>;

interface Node {
  s: Step;
  x: number;
  y: number;
}
interface Wire {
  d: string;
  fail?: boolean;
}
interface Label {
  x: number;
  y: number;
  text: string;
  fail?: boolean;
}
interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** A part of the graph in its own coordinates: its size, the line its wires come in and go out on, and what it draws. */
interface Part {
  w: number;
  h: number;
  cx: number;
  nodes: Node[];
  wires: Wire[];
  labels: Label[];
  frames: Frame[];
}

const empty = (): Part => ({ w: W * 0.6, h: 22, cx: W * 0.3, nodes: [], wires: [], labels: [], frames: [] });

/** Moves a part by (dx, dy) into another's coordinates. */
function shift(p: Part, dx: number, dy: number): Omit<Part, 'w' | 'h' | 'cx'> {
  // Each command's numbers: H is an x, V a y, the rest pairs of x and y.
  const mv = (d: string) =>
    d.replace(/([MLHVQC])([^MLHVQC]*)/g, (_m, c: string, args: string) => {
      const nums = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
      return `${c}${nums.map((n, i) => (c === 'H' ? n + dx : c === 'V' ? n + dy : i % 2 === 0 ? n + dx : n + dy)).join(' ')} `;
    });
  return {
    nodes: p.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
    wires: p.wires.map((w) => ({ ...w, d: mv(w.d) })),
    labels: p.labels.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy })),
    frames: p.frames.map((f) => ({ ...f, x: f.x + dx, y: f.y + dy })),
  };
}

function merge(into: Omit<Part, 'w' | 'h' | 'cx'>, p: Omit<Part, 'w' | 'h' | 'cx'>) {
  into.nodes.push(...p.nodes);
  into.wires.push(...p.wires);
  into.labels.push(...p.labels);
  into.frames.push(...p.frames);
}

/** Steps one under another on one line, a wire from each to the next. */
function list(steps: Step[]): Part {
  if (!steps.length) return empty();
  const parts = steps.map(step);
  const cx = Math.max(...parts.map((p) => p.cx));
  const w = Math.max(...parts.map((p) => cx - p.cx + p.w));
  const out: Part = { w, h: 0, cx, nodes: [], wires: [], labels: [], frames: [] };
  let y = 0;
  parts.forEach((p, i) => {
    if (i) {
      out.wires.push({ d: `M${cx} ${y} V${y + GAP_Y}` });
      y += GAP_Y;
    }
    merge(out, shift(p, cx - p.cx, y));
    y += p.h;
  });
  out.h = y;
  return out;
}

/** Lists side by side under a node (a Decide's paths, the branches), each with its label, joined again below. */
function columns(node: Part, cols: { label: string; part: Part }[]): Part {
  const colsW = cols.reduce((n, c) => n + c.part.w, 0) + GAP_X * (cols.length - 1);
  const w = Math.max(W, colsW);
  const cx = w / 2;
  const out: Part = { w, h: 0, cx, nodes: [], wires: [], labels: [], frames: [] };
  merge(out, shift(node, cx - node.cx, 0));
  const top = node.h + GAP_Y;
  const tallest = Math.max(...cols.map((c) => c.part.h));
  const join = top + LABEL + tallest + GAP_Y / 2;
  let x = (w - colsW) / 2;
  for (const c of cols) {
    const ccx = x + c.part.cx;
    out.wires.push({ d: `M${cx} ${node.h} V${node.h + GAP_Y / 2} H${ccx} V${top + LABEL}` });
    out.labels.push({ x: ccx, y: top + 13, text: c.label });
    merge(out, shift(c.part, x, top + LABEL));
    out.wires.push({ d: `M${ccx} ${top + LABEL + c.part.h} V${join} H${cx}` });
    x += c.part.w + GAP_X;
  }
  out.h = join;
  return out;
}

function step(s: Step): Part {
  const node: Part = { w: W, h: H, cx: W / 2, nodes: [{ s, x: 0, y: 0 }], wires: [], labels: [], frames: [] };
  let core: Part = node;
  if (s.do === 'decide') core = columns(node, [{ label: 'Then', part: list(s.then) }, { label: 'Otherwise', part: list(s.else ?? []) }]);
  else if (s.do === 'parallel') core = columns(node, s.branches.map((b, i) => ({ label: `Branch ${i + 1}`, part: list(b) })));
  else if (s.do === 'repeat') {
    // Its steps in a frame of their own, with a wire back up for the next round.
    const body = list(s.steps);
    const fw = Math.max(W, body.w + PAD * 2);
    const w = fw + 18;
    const cx = fw / 2;
    core = { w, h: 0, cx, nodes: [], wires: [], labels: [], frames: [] };
    merge(core, shift(node, cx - node.cx, 0));
    const top = H + GAP_Y;
    const fh = LABEL + body.h + PAD * 1.5;
    core.frames.push({ x: 0, y: top, w: fw, h: fh });
    core.labels.push({ x: cx, y: top + 14, text: s.over !== undefined ? 'For each item' : 'Each round' });
    core.wires.push({ d: `M${cx} ${H} V${top + LABEL + PAD / 2}` });
    merge(core, shift(body, cx - body.cx, top + LABEL + PAD / 2));
    core.wires.push({ d: `M${cx} ${top + LABEL + PAD / 2 + body.h} V${top + fh + GAP_Y / 2}` });
    core.wires.push({ d: `M${fw - 6} ${top + fh - 10} C${fw + 14} ${top + fh - 10} ${fw + 14} ${top + 10} ${fw - 6} ${top + 10}` });
    core.h = top + fh + GAP_Y / 2;
  }
  if (!Array.isArray(s.failed) || !s.failed.length) return core;
  // What runs when it fails, to its right in red, back on the line below.
  const fail = list(s.failed);
  const w = core.w + GAP_X + fail.w;
  const out: Part = { w, h: Math.max(core.h, H / 2 + LABEL + fail.h) + GAP_Y / 2, cx: core.cx, nodes: [], wires: [], labels: [], frames: [] };
  merge(out, shift(core, 0, 0));
  const fx = core.w + GAP_X;
  const fcx = fx + fail.cx;
  out.wires.push({ d: `M${core.cx + W / 2} ${H / 2} H${fcx} V${H / 2 + LABEL}`, fail: true });
  out.labels.push({ x: fcx, y: H / 2 + 14, text: 'If it fails', fail: true });
  merge(out, shift(fail, fx, H / 2 + LABEL));
  out.wires.push({ d: `M${fcx} ${H / 2 + LABEL + fail.h} V${out.h} H${core.cx}`, fail: true });
  out.wires.push({ d: `M${core.cx} ${core.h} V${out.h}` });
  return out;
}

/** The values a step uses, by the step that gives them. */
function usesOf(s: Step): string[] {
  const own: unknown[] = [s.if];
  if (s.do === 'agent' || s.do === 'model') own.push(s.instructions);
  if (s.do === 'tool' || s.do === 'app' || s.do === 'code') own.push(s.with);
  if (s.do === 'data') own.push(s.with, s.where, s.record, s.search, s.query);
  if (s.do === 'decide') own.push(s.rule, s.ask);
  if (s.do === 'repeat') own.push(s.over, s.until, s.untilAsk);
  if (s.do === 'ask') own.push(s.question);
  return [...new Set(refsIn(own).map((r) => r.split(/[.[]/)[0]))];
}

export function FlowGraph({ flow, onPick }: { flow: Flow; onPick: (id: string) => void }) {
  const g = list(flow.steps);
  const at = new Map(g.nodes.map((n) => [n.s.id, n]));
  // Values from one step to another: a curve on the right, each a little further out.
  const data: ReactNode[] = [];
  let k = 0;
  for (const n of g.nodes)
    for (const id of usesOf(n.s)) {
      const from = at.get(id);
      if (!from || from === n) continue;
      const x1 = from.x + W;
      const y1 = from.y + H / 2;
      const x2 = n.x + W;
      const y2 = n.y + H / 2;
      const out = 26 + (k++ % 6) * 9;
      data.push(<path key={`d${k}`} d={`M${x1} ${y1} C${Math.max(x1, x2) + out} ${y1} ${Math.max(x1, x2) + out} ${y2} ${x2} ${y2}`} fill="none" stroke={KIND_COLOR[from.s.do]} strokeWidth={1.5} strokeOpacity={0.75} />);
    }
  const w = g.w + 90;
  const h = g.h + 8;
  const all = allSteps(flow.steps).length;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-bg-1 p-4" role="group" aria-label={`The flow as a graph: ${all} steps`}>
      <div className="relative mx-auto" style={{ width: w, height: h }}>
        <svg width={w} height={h} className="absolute inset-0" aria-hidden>
          {g.frames.map((f, i) => (
            <rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} rx={12} fill="none" stroke="var(--line-2)" strokeDasharray="4 4" />
          ))}
          {g.wires.map((wire, i) => (
            <path key={i} d={wire.d} fill="none" stroke={wire.fail ? 'var(--err)' : 'var(--fg-3)'} strokeWidth={wire.fail ? 1.5 : 2} strokeDasharray={wire.fail ? '5 4' : undefined} strokeLinejoin="round" />
          ))}
          {data}
        </svg>
        {g.labels.map((l, i) => (
          <div key={i} className={`absolute -translate-x-1/2 text-[10.5px] font-medium tracking-wide uppercase ${l.fail ? 'text-err' : 'text-fg-3'}`} style={{ left: l.x, top: l.y - 11 }}>
            {l.text}
          </div>
        ))}
        {g.nodes.map(({ s, x, y }) => {
          const I = ICON[s.do];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.id)}
              className="absolute flex items-center gap-2.5 overflow-hidden rounded-lg border border-line-2 bg-panel pr-2.5 text-left shadow-sm transition-colors hover:border-fg-3"
              style={{ left: x, top: y, width: W, height: H }}
            >
              <span className="h-full w-1.5 shrink-0" style={{ background: KIND_COLOR[s.do] }} />
              <I size={15} className="shrink-0" style={{ color: KIND_COLOR[s.do] }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium" translate="no">
                  {titleOf(s)}
                </span>
                <span className="block truncate text-[11px] text-fg-3">
                  <span>{KIND[s.do]}</span>
                  {s.failed === 'agent' && <span> · an agent if it fails</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
