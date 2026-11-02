// A template's flow as a graph to build in (the builder's What it does, Graph, on a computer). Each step is a
// node in the colour of its kind; grey wires say what happens next (a Decide's paths and the branches side by
// side, a Repeat's steps in a frame, what runs when a step fails in red), and thin coloured wires carry values
// from the step that gives them to the steps that use them. It lays itself out; a node dragged elsewhere stays
// there (the recipe's graph keeps where), with the steps inside it, and Tidy lays it all out again.
//
// A click on a node opens its settings beside the graph. A + on a wire puts a new step there. Dragging from
// the dot on a node's right carries one of its values: let go on another node to put it in one of that step's
// inputs, or in empty space for a new step that uses it. Shift-click picks several nodes, to group them with a
// note. The canvas moves by dragging its background, and zooms with Ctrl and the wheel, or its buttons.
//
// Try it runs the template as it is on screen, as a test run, in the graph: each step lights up as it runs
// and as it ends, the wires into the steps that ran with it, and a value's wire says what it carried. A step
// can pause the try before it (then Go on, or Step to the next one), and a frozen step gives what it gave in
// the last try, so the steps after an expensive one can be tried again and again at no cost.
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, Bot, CircleDot, CodeXml, Columns2, Database, Ellipsis, FlaskConical, Group, LayoutGrid, Maximize, Maximize2, MessageCircleQuestion, Minimize2, Minus, Plus, Repeat, Snowflake, Sparkles, Split, Wrench, X } from 'lucide-react';
import type { Flow, Step, StepKind } from '@shared/app-manifest';
import { allSteps, asText, givesOf, refsIn, STEP_KINDS, titleOf } from '@shared/app-manifest';
import type { AppGraph, AppRecipe, AppRun, RunProgress, RunStepView } from '@shared/apps';
import { isActive } from '@shared/apps';
import { api, enc, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, cx, IconButton, MenuItem, Popover, Throbber } from '../../components/ui';
import { money, useRunEvents, type RunDetail } from './api';
import { AppForm, formErrors, initialValues, type FormFiles, type FormValues } from './Form';
import { childList, listsOf, type ListPath } from './paths';
import type { Ctx } from './StepsEditor';

const W = 200;
const H = 52;
const GAP_Y = 36;
const GAP_X = 28;
const LABEL = 20;
const PAD = 16;
const SLOT_W = 128;
const SLOT_H = 28;

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
export const ICON: Record<StepKind, typeof Bot> = { agent: Bot, model: Sparkles, tool: Wrench, decide: Split, repeat: Repeat, parallel: Columns2, app: AppWindow, data: Database, ask: MessageCircleQuestion, code: CodeXml };
const KIND = Object.fromEntries(STEP_KINDS.map((k) => [k.value, k.label])) as Record<StepKind, string>;

// ---- laying it out ------------------------------------------------------------------------------------------

/** A step where the layout puts it: the list it is in, its place there, and its top left corner. */
interface Spot {
  s: Step;
  list: ListPath;
  i: number;
  x: number;
  y: number;
}
/** An empty list's place: a button that adds its first step. `parent`: the step it is in (moving with it). */
interface Slot {
  list: ListPath;
  parent: string | null;
  x: number;
  y: number;
}
interface Label {
  x: number;
  y: number;
  text: string;
  fail?: boolean;
  parent: string;
}
/** A part of the layout in its own coordinates: its size, the line its wires come in and go out on, and what is in it. */
interface Part {
  w: number;
  h: number;
  cx: number;
  spots: Spot[];
  slots: Slot[];
  labels: Label[];
}

const shift = (p: Part, dx: number, dy: number): Part => ({
  ...p,
  spots: p.spots.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
  slots: p.slots.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
  labels: p.labels.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy })),
});

function merge(into: Part, p: Part) {
  into.spots.push(...p.spots);
  into.slots.push(...p.slots);
  into.labels.push(...p.labels);
}

const blank = (w: number, h: number, cx: number): Part => ({ w, h, cx, spots: [], slots: [], labels: [] });

/** Steps one under another; an empty list, the button that adds its first. */
function list(steps: Step[], path: ListPath, parent: string | null): Part {
  if (!steps.length) {
    const p = blank(SLOT_W, SLOT_H, SLOT_W / 2);
    p.slots.push({ list: path, parent, x: 0, y: 0 });
    return p;
  }
  const parts = steps.map((s, i) => step(s, path, i));
  const cx = Math.max(...parts.map((p) => p.cx));
  const out = blank(Math.max(...parts.map((p) => cx - p.cx + p.w)), 0, cx);
  let y = 0;
  parts.forEach((p, i) => {
    if (i) y += GAP_Y;
    merge(out, shift(p, cx - p.cx, y));
    y += p.h;
  });
  out.h = y;
  return out;
}

/** Lists side by side under a node (a Decide's paths, the branches), each with its label. */
function columns(node: Part, cols: { label: string; part: Part }[], parent: string): Part {
  const colsW = cols.reduce((n, c) => n + c.part.w, 0) + GAP_X * (cols.length - 1);
  const w = Math.max(W, colsW);
  const cx = w / 2;
  const out = blank(w, 0, cx);
  merge(out, shift(node, cx - node.cx, 0));
  const top = node.h + GAP_Y;
  let x = (w - colsW) / 2;
  for (const c of cols) {
    out.labels.push({ x: x + c.part.cx, y: top + 13, text: c.label, parent });
    merge(out, shift(c.part, x, top + LABEL));
    x += c.part.w + GAP_X;
  }
  out.h = top + LABEL + Math.max(...cols.map((c) => c.part.h)) + GAP_Y / 2;
  return out;
}

function step(s: Step, path: ListPath, i: number): Part {
  const node = blank(W, H, W / 2);
  node.spots.push({ s, list: path, i, x: 0, y: 0 });
  const inner = (key: string) => list(childList(s, key), [...path, i, key], s.id);
  let core = node;
  if (s.do === 'decide')
    core = columns(
      node,
      [
        { label: 'Then', part: inner('then') },
        { label: 'Otherwise', part: inner('else') },
      ],
      s.id,
    );
  else if (s.do === 'parallel') core = columns(node, s.branches.map((_, n) => ({ label: `Branch ${n + 1}`, part: inner(`b${n}`) })), s.id);
  else if (s.do === 'repeat') {
    // Its steps under it, in a frame drawn around them.
    const body = inner('steps');
    const fw = Math.max(W, body.w + PAD * 2);
    core = blank(fw + 18, 0, fw / 2);
    merge(core, shift(node, fw / 2 - W / 2, 0));
    const top = H + GAP_Y;
    core.labels.push({ x: fw / 2, y: top + 14, text: s.over !== undefined ? 'For each item' : 'Each round', parent: s.id });
    merge(core, shift(body, fw / 2 - body.cx, top + LABEL + PAD / 2));
    core.h = top + LABEL + body.h + PAD * 1.5 + GAP_Y / 2;
  }
  if (!Array.isArray(s.failed)) return core;
  // What runs when it fails, to its right.
  const fail = inner('failed');
  const out = blank(core.w + GAP_X + fail.w, Math.max(core.h, H / 2 + LABEL + fail.h) + GAP_Y / 2, core.cx);
  merge(out, core);
  const fx = core.w + GAP_X;
  out.labels.push({ x: fx + fail.cx, y: H / 2 + 14, text: 'If it fails', fail: true, parent: s.id });
  merge(out, shift(fail, fx, H / 2 + LABEL));
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

// ---- where a value can go --------------------------------------------------------------------------------

interface Input {
  label: string;
  put: (s: Step, ref: string) => Step;
}

const text = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : JSON.stringify(v));
const addTo = (t: string | undefined, ref: string) => (t?.trim() ? `${t.trimEnd()}\n${ref}` : ref);
const putIn = (w: Record<string, unknown> | undefined, key: string, ref: string) => ({ ...(w ?? {}), [key]: text(w?.[key]).trim() ? `${text(w?.[key]).trimEnd()} ${ref}` : ref });

/** The inputs of a step a value can go in, each with how it goes there. */
function inputsOf(s: Step, ctx: Ctx, value: string): Input[] {
  const out: Input[] = [];
  switch (s.do) {
    case 'agent':
    case 'model':
      out.push({ label: 'Its instructions', put: (x, r) => ({ ...x, instructions: addTo((x as typeof s).instructions, r) }) as Step });
      break;
    case 'tool': {
      const t = ctx.tools.find((x) => x.name === s.tool);
      for (const i of t?.inputs ?? []) out.push({ label: i.name, put: (x, r) => ({ ...x, with: putIn((x as typeof s).with, i.name, r) }) as Step });
      break;
    }
    case 'app': {
      const a = ctx.apps.find((x) => x.slug === s.app || x.id === s.app);
      for (const f of a?.fields ?? []) out.push({ label: f.label || f.id, put: (x, r) => ({ ...x, with: putIn((x as typeof s).with, f.id, r) }) as Step });
      break;
    }
    case 'code': {
      for (const k of Object.keys(s.with ?? {})) out.push({ label: k, put: (x, r) => ({ ...x, with: putIn((x as typeof s).with, k, r) }) as Step });
      const name = s.with && value in s.with ? `${value}_2` : value;
      out.push({ label: `A new input, “${name}”`, put: (x, r) => ({ ...x, with: { ...((x as typeof s).with ?? {}), [name]: r } }) as Step });
      break;
    }
    case 'data': {
      const fields = ctx.recipe.data?.[s.collection]?.fields ?? [];
      if (s.op === 'add' || s.op === 'update') for (const f of fields) out.push({ label: f.id, put: (x, r) => ({ ...x, with: putIn((x as typeof s).with, f.id, r) }) as Step });
      if (s.op === 'search') out.push({ label: 'The question', put: (x, r) => ({ ...x, query: addTo((x as typeof s).query, r) }) as Step });
      if (s.op === 'find') out.push({ label: 'Words to look for', put: (x, r) => ({ ...x, search: addTo((x as typeof s).search, r) }) as Step });
      if (s.op === 'get' || s.op === 'update' || s.op === 'remove') out.push({ label: 'The record', put: (x, r) => ({ ...x, record: r }) as Step });
      break;
    }
    case 'decide':
      out.push({ label: 'Its rule: when it is there', put: (x, r) => ({ ...x, rule: `${r} is not empty`, ask: undefined }) as Step });
      out.push({ label: 'Its question in words', put: (x, r) => ({ ...x, ask: addTo((x as typeof s).ask, r), rule: undefined }) as Step });
      break;
    case 'repeat':
      out.push({ label: 'The list it goes through', put: (x, r) => ({ ...x, over: r, until: undefined, untilAsk: undefined }) as Step });
      break;
    case 'ask':
      out.push({ label: 'Its question', put: (x, r) => ({ ...x, question: addTo((x as typeof s).question, r) }) as Step });
      break;
  }
  out.push({ label: 'Only when it is there', put: (x, r) => ({ ...x, if: `${r} is not empty` }) });
  return out;
}

/** New steps that use a value, put after the step that gives it. */
function usersOf(ctx: Ctx): { label: string; make: (ref: string) => Step }[] {
  const lists = Object.entries(ctx.recipe.data ?? {});
  return [
    { label: 'Ask a model about it', make: (r) => ({ ...(ctx.make('model') as Extract<Step, { do: 'model' }>), instructions: r }) },
    { label: 'Ask an agent about it', make: (r) => ({ ...(ctx.make('agent') as Extract<Step, { do: 'agent' }>), instructions: r }) },
    { label: 'Decide on it', make: (r) => ({ ...(ctx.make('decide') as Extract<Step, { do: 'decide' }>), rule: `${r} is not empty` }) },
    { label: 'Repeat for each item of it', make: (r) => ({ ...(ctx.make('repeat') as Extract<Step, { do: 'repeat' }>), over: r }) },
    ...(lists.length
      ? [
          {
            label: `Keep it in “${lists[0][0]}”`,
            make: (r: string) => ({ ...(ctx.make('data') as Extract<Step, { do: 'data' }>), op: 'add' as const, collection: lists[0][0], with: { [lists[0][1].fields?.[0]?.id ?? 'value']: r } }),
          },
        ]
      : []),
    { label: 'Use it in code', make: (r) => ({ ...(ctx.make('code') as Extract<Step, { do: 'code' }>), with: { value: r } }) },
    { label: 'Send it to you as a notification', make: (r) => ({ ...(ctx.make('tool') as Extract<Step, { do: 'tool' }>), tool: 'notify_user', with: { message: r } }) },
  ];
}

// ---- the editor ---------------------------------------------------------------------------------------------

type Pt = { x: number; y: number };
interface Linking {
  from: string;
  at: Pt;
}
/** A menu open at a point of the canvas: steps to add there, where a value goes, or new steps that use it. */
type Menu = { pt: Pt } & ({ kind: 'add'; list: ListPath; at: number } | { kind: 'into'; from: string; to: string } | { kind: 'new'; from: string });

export interface GraphEditorProps {
  ctx: Ctx;
  /** The saved template's id (none: not saved yet), which its tries are runs of. */
  appId?: string | null;
  graph: AppGraph | undefined;
  onGraph: (g: AppGraph | undefined) => void;
  Body: ComponentType<{ s: Step; list: ListPath; i: number; ctx: Ctx }>;
  Actions: ComponentType<{ s: Step; list: ListPath; i: number; last: number; ctx: Ctx; done: () => void }>;
}

/** A try of the template as it is on screen: its run, its steps as they go, and what moves it on. */
function useTry(appId: string | null | undefined) {
  const [run, setRun] = useState<AppRun | null>(null);
  const [detail, setDetail] = useState<{ steps: RunStepView[]; progress?: RunProgress } | null>(null);
  const refresh = (id: string) =>
    api<RunDetail>(`/api/apps/runs/${enc(id)}`).then(
      (d) => (setRun(d.run), setDetail({ steps: d.steps ?? [], progress: d.progress })),
      () => {},
    );
  useRunEvents((r) => void (run && r.id === run.id && refresh(r.id)));
  const active = !!run && isActive(run.status);
  useEffect(() => {
    if (!run || !active) return;
    const t = setInterval(() => refresh(run.id), 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, active]);
  return {
    run,
    detail,
    active,
    async start(recipe: AppRecipe, inputs: FormValues, files: FormFiles, pause: string[], frozen: string[]) {
      // Frozen steps give what they gave in the last try that ended.
      const freeze = frozen.length && run && !active ? { from: run.id, steps: frozen } : undefined;
      const r = await post<{ run: AppRun }>(`/api/apps/${enc(appId ?? 'test')}/runs`, {
        recipe,
        source: 'test',
        inputs,
        files: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, { name: f.name, data: f.data }])),
        ...(pause.length ? { pause } : {}),
        ...(freeze ? { freeze } : {}),
      });
      setRun(r.run);
      setDetail(null);
      void refresh(r.run.id);
    },
    go: (step?: boolean) => run && post(`/api/apps/runs/${enc(run.id)}/go`, step ? { step: true } : {}).then(() => refresh(run.id), toastError),
    stop: () => run && post(`/api/apps/runs/${enc(run.id)}/stop`, {}).then(() => refresh(run.id), toastError),
  };
}
type Try = ReturnType<typeof useTry>;

/** How a step lit up in a try: its ring. */
const LIT: Record<string, string> = {
  running: 'ring-2 ring-accent/70 animate-pulse',
  waiting: 'ring-2 ring-warn/80',
  done: 'ring-2 ring-ok/50',
  failed: 'ring-2 ring-err/70',
  stopped: 'ring-2 ring-fg-3/40',
};

export function GraphEditor({ ctx, appId, graph, onGraph, Body, Actions }: GraphEditorProps) {
  const flow: Flow = ctx.flow;
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 40, y: 30, k: 1 });
  const [picked, setPicked] = useState<string[]>([]);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [linking, setLinking] = useState<Linking | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [noteEdit, setNoteEdit] = useState<string | null>(null);
  const menuAnchor = useRef<HTMLDivElement>(null);
  // Over the whole window, for room to work in.
  const [full, setFull] = useState(false);
  // Trying it: the panel, the steps it pauses before, and those frozen at what they gave.
  const t = useTry(appId);
  const [trying, setTrying] = useState(false);
  const [pause, setPause] = useState<Set<string>>(new Set());
  const [frozen, setFrozen] = useState<Set<string>>(new Set());
  const toggle = (set: Set<string>, id: string) => (set.has(id) ? new Set([...set].filter((x) => x !== id)) : new Set([...set, id]));
  // Each step as it went in the try (the latest round of one in a Repeat), and those it is paused before.
  const lit = new Map<string, RunStepView>();
  for (const st of t.detail?.steps ?? []) if (st.kind !== 'round') lit.set(st.id, st);
  const pausedAt = new Set((t.detail?.progress?.paused ?? []).map((p) => p.split(/[/#]/).pop()!));

  // The layout, then where each step is: placed by hand, or moved with the step it is in.
  const laid = useMemo(() => list(flow.steps, [], null), [flow.steps]);
  const auto = useMemo(() => new Map(laid.spots.map((n) => [n.s.id, n])), [laid]);
  const at = graph?.at ?? {};
  const delta = useMemo(() => {
    const d = new Map<string | null, Pt>([[null, { x: 0, y: 0 }]]);
    const walk = (steps: Step[], parent: Pt) => {
      for (const s of steps) {
        const a = auto.get(s.id);
        const own = drag?.id === s.id ? drag : at[s.id];
        const mine = own && a ? { x: own.x - a.x, y: own.y - a.y } : parent;
        d.set(s.id, mine);
        for (const { key } of listsOf(s)) walk(childList(s, key), mine);
      }
    };
    walk(flow.steps, { x: 0, y: 0 });
    return d;
  }, [flow.steps, auto, at, drag]);
  const nodes = laid.spots.map((n) => {
    const d = delta.get(n.s.id) ?? { x: 0, y: 0 };
    return { ...n, x: n.x + d.x, y: n.y + d.y };
  });
  const pos = new Map(nodes.map((n) => [n.s.id, n]));
  const slots = laid.slots.map((sl) => {
    const d = delta.get(sl.parent) ?? { x: 0, y: 0 };
    return { ...sl, x: sl.x + d.x, y: sl.y + d.y };
  });
  const labels = laid.labels.map((l) => {
    const d = delta.get(l.parent) ?? { x: 0, y: 0 };
    return { ...l, x: l.x + d.x, y: l.y + d.y };
  });
  const slotOf = (path: ListPath) => slots.find((sl) => JSON.stringify(sl.list) === JSON.stringify(path));

  // A box around steps (a Repeat's frame, a group).
  const around = (ids: string[], pad: number, top = pad): { x: number; y: number; w: number; h: number } | null => {
    const ps = ids.map((id) => pos.get(id)).filter((p): p is (typeof nodes)[number] => !!p);
    if (!ps.length) return null;
    const x = Math.min(...ps.map((p) => p.x)) - pad;
    const y = Math.min(...ps.map((p) => p.y)) - top;
    return { x, y, w: Math.max(...ps.map((p) => p.x + W)) + pad - x, h: Math.max(...ps.map((p) => p.y + H)) + pad - y };
  };
  const frames = nodes
    .filter((n) => n.s.do === 'repeat')
    .map((n) => {
      const s = n.s as Extract<Step, { do: 'repeat' }>;
      const inside = allSteps(s.steps).map((x) => x.id);
      const b = inside.length ? around(inside, PAD, PAD + LABEL) : (() => {
        const sl = slotOf([...n.list, n.i, 'steps']);
        return sl ? { x: sl.x - PAD, y: sl.y - PAD - LABEL, w: SLOT_W + PAD * 2, h: SLOT_H + PAD * 2 + LABEL } : null;
      })();
      return b ? { id: s.id, ...b } : null;
    })
    .filter((f): f is { id: string; x: number; y: number; w: number; h: number } => !!f);

  // ---- the wires: what happens next, and the values ----
  const wires: { d: string; fail?: boolean; loop?: boolean; to?: string }[] = [];
  const pluses: { pt: Pt; list: ListPath; at: number }[] = [];
  const bottom = (id: string): Pt => {
    const p = pos.get(id)!;
    return { x: p.x + W / 2, y: p.y + H };
  };
  const curve = (a: Pt, b: Pt) => {
    const d = b.y > a.y ? Math.max(14, (b.y - a.y) / 2) : 60;
    return `M${a.x} ${a.y} C${a.x} ${a.y + d} ${b.x} ${b.y - d} ${b.x} ${b.y}`;
  };
  /** Where a list starts: its first step's top, or its empty slot's. */
  const entry = (steps: Step[], path: ListPath): Pt | null => {
    if (steps.length) {
      const p = pos.get(steps[0].id);
      return p ? { x: p.x + W / 2, y: p.y } : null;
    }
    const sl = slotOf(path);
    return sl ? { x: sl.x + SLOT_W / 2, y: sl.y } : null;
  };
  /** Where the flow leaves a list (or a step): the points the next step's wires come from, and whether from a failure. */
  const exits = (steps: Step[], path: ListPath): { pt: Pt; fail?: boolean }[] => {
    if (!steps.length) {
      const sl = slotOf(path);
      return sl ? [{ pt: { x: sl.x + SLOT_W / 2, y: sl.y + SLOT_H } }] : [];
    }
    const i = steps.length - 1;
    return exitsOf(steps[i], path, i);
  };
  const exitsOf = (s: Step, path: ListPath, i: number): { pt: Pt; fail?: boolean }[] => {
    let out: { pt: Pt; fail?: boolean }[];
    if (s.do === 'decide') out = [...exits(s.then, [...path, i, 'then']), ...exits(s.else ?? [], [...path, i, 'else'])];
    else if (s.do === 'parallel') out = s.branches.flatMap((b, n) => exits(b, [...path, i, `b${n}`]));
    else if (s.do === 'repeat') {
      const f = frames.find((x) => x.id === s.id);
      out = [{ pt: f ? { x: f.x + f.w / 2, y: f.y + f.h } : bottom(s.id) }];
    } else out = [{ pt: bottom(s.id) }];
    if (Array.isArray(s.failed)) out.push(...exits(s.failed, [...path, i, 'failed']).map((e) => ({ ...e, fail: true })));
    return out;
  };
  const walkWires = (steps: Step[], path: ListPath) => {
    steps.forEach((s, i) => {
      const p = pos.get(s.id);
      if (!p) return;
      // A new step before this one.
      pluses.push({ pt: { x: p.x + W / 2, y: p.y - 13 }, list: path, at: i });
      if (i > 0) for (const e of exitsOf(steps[i - 1], path, i - 1)) wires.push({ d: curve(e.pt, { x: p.x + W / 2, y: p.y }), fail: e.fail, to: s.id });
      for (const { key } of listsOf(s)) {
        const inner = childList(s, key);
        const ip = [...path, i, key];
        const to = entry(inner, ip);
        if (to) {
          if (key === 'failed') wires.push({ d: `M${p.x + W} ${p.y + H / 2} C${p.x + W + 30} ${p.y + H / 2} ${to.x} ${to.y - 30} ${to.x} ${to.y}`, fail: true, to: inner[0]?.id });
          else wires.push({ d: curve(bottom(s.id), to), to: inner[0]?.id });
        }
        walkWires(inner, ip);
      }
      // A Repeat's next round: from the end of its steps back up to it.
      if (s.do === 'repeat') {
        const f = frames.find((x) => x.id === s.id);
        if (f) wires.push({ d: `M${f.x + f.w - 8} ${f.y + f.h - 12} C${f.x + f.w + 22} ${f.y + f.h - 12} ${f.x + f.w + 22} ${p.y + H / 2} ${p.x + W} ${p.y + H / 2}`, loop: true });
      }
    });
    // A new step at the end of the list.
    if (steps.length) {
      const last = exits(steps, path);
      const lowest = last.reduce((m, e) => (e.pt.y > m.y ? e.pt : m), last[0]?.pt ?? { x: 0, y: 0 });
      const first = pos.get(steps[steps.length - 1].id)!;
      pluses.push({ pt: { x: first.x + W / 2, y: lowest.y + 14 }, list: path, at: steps.length });
    }
  };
  walkWires(flow.steps, []);
  const values: ReactNode[] = [];
  let k = 0;
  for (const n of nodes)
    for (const id of usesOf(n.s)) {
      const from = pos.get(id);
      if (!from || from === n) continue;
      const x1 = from.x + W;
      const y1 = from.y + H / 2;
      const x2 = n.x + W;
      const y2 = n.y + H / 2;
      const out = 26 + (k++ % 6) * 9;
      const d = `M${x1} ${y1} C${Math.max(x1, x2) + out} ${y1} ${Math.max(x1, x2) + out} ${y2} ${x2} ${y2}`;
      // What it carried in the try, when there was one.
      const gave = lit.get(id)?.values;
      const said = refsIn(JSON.stringify(n.s))
        .filter((r) => r.split(/[.[]/)[0] === id)
        .map((r) => {
          const v = gave?.[r.split(/[.[]/)[1] ?? ''];
          return `{{${r}}}${v !== undefined ? ` = ${asText(v, 200)}` : ''}`;
        })
        .join('\n');
      values.push(
        <g key={`v${k}`}>
          <path d={d} fill="none" stroke={KIND_COLOR[from.s.do]} strokeWidth={1.5} strokeOpacity={hover && (hover === id || hover === n.s.id) ? 1 : 0.55} />
          <path d={d} fill="none" stroke="transparent" strokeWidth={10} className="cursor-help">
            <title>{said}</title>
          </path>
        </g>,
      );
    }

  // ---- moving about ----
  const toCanvas = (e: { clientX: number; clientY: number }): Pt => {
    const r = box.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
  };
  const zoom = (by: number, around?: Pt) => {
    setView((v) => {
      const k = Math.min(1.6, Math.max(0.35, v.k * by));
      const r = box.current?.getBoundingClientRect();
      const c = around ?? { x: (r?.width ?? 600) / 2, y: (r?.height ?? 400) / 2 };
      return { k, x: c.x - ((c.x - v.x) * k) / v.k, y: c.y - ((c.y - v.y) * k) / v.k };
    });
  };
  const fit = () => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const xs = [...nodes.map((n) => n.x), ...slots.map((s) => s.x)];
    const ys = [...nodes.map((n) => n.y), ...slots.map((s) => s.y)];
    if (!xs.length) return;
    const x0 = Math.min(...xs) - 30;
    const y0 = Math.min(...ys) - 40;
    const w = Math.max(...nodes.map((n) => n.x + W), ...slots.map((s) => s.x + SLOT_W)) + 90 - x0;
    const h = Math.max(...nodes.map((n) => n.y + H), ...slots.map((s) => s.y + SLOT_H)) + 40 - y0;
    const kk = Math.min(1, Math.max(0.35, Math.min(r.width / w, r.height / h)));
    setView({ k: kk, x: (r.width - w * kk) / 2 - x0 * kk, y: Math.max(10, (r.height - h * kk) / 2) - y0 * kk });
  };
  // Fit once there is a box to fit in.
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  const nodeAt = (p: Pt) => nodes.find((n) => p.x >= n.x && p.x <= n.x + W && p.y >= n.y && p.y <= n.y + H);

  /** Follows the pointer until it is let go: moving the canvas, a node, or a value's wire. */
  const follow = (e: React.PointerEvent, onMove: (ev: PointerEvent, moved: boolean) => void, onUp: (ev: PointerEvent, moved: boolean) => void) => {
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4) moved = true;
      onMove(ev, moved);
    };
    const up = (ev: PointerEvent) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      onUp(ev, moved);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  const panStart = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    box.current?.focus();
    const v0 = view;
    const x0 = e.clientX;
    const y0 = e.clientY;
    follow(
      e,
      (ev) => setView({ ...v0, x: v0.x + ev.clientX - x0, y: v0.y + ev.clientY - y0 }),
      (_ev, moved) => {
        if (!moved) setPicked([]);
      },
    );
  };

  const nodeStart = (e: React.PointerEvent, n: (typeof nodes)[number]) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    box.current?.focus();
    const p0 = toCanvas(e);
    const o = { x: n.x - p0.x, y: n.y - p0.y };
    follow(
      e,
      (ev, moved) => {
        if (!moved) return;
        const p = toCanvas(ev);
        setDrag({ id: n.s.id, x: Math.round(p.x + o.x), y: Math.round(p.y + o.y) });
      },
      (ev, moved) => {
        if (moved) {
          const p = toCanvas(ev);
          onGraph({ ...graph, at: { ...at, [n.s.id]: { x: Math.round(p.x + o.x), y: Math.round(p.y + o.y) } } });
          setDrag(null);
        } else if (ev.shiftKey) setPicked((x) => (x.includes(n.s.id) ? x.filter((y) => y !== n.s.id) : [...x, n.s.id]));
        else setPicked([n.s.id]);
      },
    );
  };

  const linkStart = (e: React.PointerEvent, n: (typeof nodes)[number]) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setLinking({ from: n.s.id, at: toCanvas(e) });
    follow(
      e,
      (ev) => setLinking({ from: n.s.id, at: toCanvas(ev) }),
      (ev) => {
        setLinking(null);
        const p = toCanvas(ev);
        const to = nodeAt(p);
        if (to && to.s.id !== n.s.id) setMenu({ kind: 'into', from: n.s.id, to: to.s.id, pt: p });
        else if (!to) setMenu({ kind: 'new', from: n.s.id, pt: p });
      },
    );
  };

  const one = picked.length === 1 ? pos.get(picked[0]) : undefined;
  const listLen = (path: ListPath) => {
    let steps = flow.steps;
    for (let j = 0; j + 1 < path.length; j += 2) steps = childList(steps[path[j] as number], path[j + 1] as string);
    return steps.length;
  };
  const remove = (id: string) => {
    const n = pos.get(id);
    if (!n) return;
    ctx.edit(n.list, (l) => l.filter((_, j) => j !== n.i));
    setPicked([]);
  };
  const groups = graph?.groups ?? [];
  const setGroups = (g: NonNullable<AppGraph['groups']>) => onGraph({ ...graph, groups: g.length ? g : undefined });

  const editor = (
    <>
      {full && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setFull(false)} />}
      <div className={cx('flex overflow-hidden rounded-xl border border-line', full ? 'fixed inset-3 z-40 bg-bg shadow-2xl' : 'h-[600px] bg-bg-1')}>
      <div
        ref={box}
        tabIndex={0}
        role="application"
        aria-label={`The flow as a graph: ${nodes.length} steps`}
        className="relative min-w-0 flex-1 cursor-grab touch-none overflow-hidden outline-none select-none active:cursor-grabbing"
        onPointerDown={panStart}
        onKeyDown={(e) => {
          if (e.target !== box.current) return;
          if ((e.key === 'Delete' || e.key === 'Backspace') && one) (e.preventDefault(), remove(one.s.id));
          if (e.key === 'Escape') {
            if (picked.length) setPicked([]);
            else setFull(false);
          }
        }}
      >
        <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg width={1} height={1} className="absolute top-0 left-0 overflow-visible" aria-hidden>
            {groups.map((g) => {
              const b = around(g.steps, 18, 38);
              return b ? <rect key={g.id} x={b.x} y={b.y} width={b.w} height={b.h} rx={14} fill="var(--accent)" fillOpacity={0.06} stroke="var(--accent)" strokeOpacity={0.35} /> : null;
            })}
            {frames.map((f) => (
              <rect key={f.id} x={f.x} y={f.y} width={f.w} height={f.h} rx={12} fill="none" stroke="var(--line-2)" strokeDasharray="4 4" />
            ))}
            {wires.map((w, i) => (
              <path key={i} d={w.d} fill="none" stroke={w.to && /^(running|waiting|done)$/.test(lit.get(w.to)?.status ?? '') ? 'var(--accent)' : w.fail ? 'var(--err)' : 'var(--fg-3)'} strokeWidth={w.fail || w.loop ? 1.5 : 2} strokeDasharray={w.fail || w.loop ? '5 4' : undefined} />
            ))}
            {values}
            {linking &&
              (() => {
                const from = pos.get(linking.from);
                if (!from) return null;
                return <path d={`M${from.x + W} ${from.y + H / 2} C${from.x + W + 60} ${from.y + H / 2} ${linking.at.x - 60} ${linking.at.y} ${linking.at.x} ${linking.at.y}`} fill="none" stroke={KIND_COLOR[from.s.do]} strokeWidth={2} />;
              })()}
          </svg>
          {groups.map((g) => {
            const b = around(g.steps, 18, 38);
            if (!b) return null;
            return (
              <div key={g.id} className="group/g absolute flex items-center gap-1" style={{ left: b.x + 10, top: b.y + 8, width: b.w - 20 }} onPointerDown={(e) => e.stopPropagation()}>
                {noteEdit === g.id ? (
                  <input
                    autoFocus
                    defaultValue={g.note}
                    className="h-6 min-w-0 flex-1 rounded border border-line-2 bg-panel px-1.5 text-[12px]"
                    onBlur={(e) => (setNoteEdit(null), setGroups(groups.map((x) => (x.id === g.id ? { ...x, note: e.target.value.slice(0, 300) } : x))))}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-accent" onClick={() => setNoteEdit(g.id)} translate="no">
                    {g.note || <span className="text-fg-3">Write a note</span>}
                  </button>
                )}
                <button type="button" title="Ungroup" aria-label="Ungroup" className="shrink-0 rounded p-0.5 text-fg-3 opacity-0 group-hover/g:opacity-100 hover:text-fg" onClick={() => setGroups(groups.filter((x) => x.id !== g.id))}>
                  <X size={12} />
                </button>
              </div>
            );
          })}
          {labels.map((l, i) => (
            <div key={i} className={cx('absolute -translate-x-1/2 text-[10.5px] font-medium tracking-wide whitespace-nowrap uppercase', l.fail ? 'text-err' : 'text-fg-3')} style={{ left: l.x, top: l.y - 11 }}>
              {l.text}
            </div>
          ))}
          {slots.map((sl) => (
            <button
              key={JSON.stringify(sl.list)}
              type="button"
              className="absolute flex items-center justify-center gap-1 rounded-lg border border-dashed border-line-2 bg-panel text-[12px] text-fg-3 hover:border-fg-3 hover:text-fg"
              style={{ left: sl.x, top: sl.y, width: SLOT_W, height: SLOT_H }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setMenu({ kind: 'add', list: sl.list, at: 0, pt: { x: sl.x + SLOT_W / 2, y: sl.y + SLOT_H } })}
            >
              <Plus size={13} />
              Add a step
            </button>
          ))}
          {pluses.map((p) => (
            <button
              key={`${JSON.stringify(p.list)}:${p.at}`}
              type="button"
              title="Put a step here"
              aria-label="Put a step here"
              className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line-2 bg-panel text-fg-2 opacity-40 transition-opacity hover:text-fg hover:opacity-100 focus-visible:opacity-100"
              style={{ left: p.pt.x, top: p.pt.y }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setMenu({ kind: 'add', list: p.list, at: p.at, pt: p.pt })}
            >
              <Plus size={12} />
            </button>
          ))}
          {nodes.map((n) => {
            const I = ICON[n.s.do];
            const on = picked.includes(n.s.id);
            const msgs = ctx.msgs.get(n.s.id) ?? [];
            const went = pausedAt.has(n.s.id) ? 'waiting' : lit.get(n.s.id)?.status;
            return (
              <div
                key={n.s.id}
                className={cx(
                  'group/n absolute flex cursor-pointer items-center gap-2.5 rounded-lg border bg-panel pr-2.5 shadow-sm transition-colors',
                  on ? 'border-accent ring-2 ring-accent/30' : 'border-line-2 hover:border-fg-3',
                  !on && went && LIT[went],
                  went === 'skipped' && 'opacity-55',
                )}
                style={{ left: n.x, top: n.y, width: W, height: H }}
                onPointerDown={(e) => nodeStart(e, n)}
                onPointerEnter={() => setHover(n.s.id)}
                onPointerLeave={() => setHover((h) => (h === n.s.id ? null : h))}
              >
                <span className="h-full w-1.5 shrink-0 rounded-l-lg" style={{ background: KIND_COLOR[n.s.do] }} />
                <I size={15} className="shrink-0" style={{ color: KIND_COLOR[n.s.do] }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium" translate="no">
                    {titleOf(n.s)}
                  </span>
                  <span className="block truncate text-[11px] text-fg-3">
                    <span>{KIND[n.s.do]}</span>
                    {n.s.failed === 'agent' && <span> · an agent if it fails</span>}
                  </span>
                </span>
                {msgs.length > 0 && <span className={cx('h-2 w-2 shrink-0 rounded-full', msgs.some((m) => m.error) ? 'bg-err' : 'bg-warn')} />}
                {pausedAt.has(n.s.id) && <span className="absolute -top-5 left-1 text-[10.5px] font-medium text-warn">Paused before it</span>}
                {pause.has(n.s.id) && <span title="A try pauses before it" className="absolute -top-1.5 -left-1.5 h-3 w-3 rounded-full bg-err ring-2 ring-panel" />}
                {frozen.has(n.s.id) && (
                  <span title="Frozen: in a try it gives what it gave in the last one" className="absolute -top-2 right-2 rounded bg-panel px-0.5 text-accent">
                    <Snowflake size={12} />
                  </span>
                )}
                {/* Its values: drag from here to where they go. */}
                <span
                  title="Drag one of its values to another step, or to empty space for a new step"
                  className="absolute top-1/2 -right-[7px] h-3.5 w-3.5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-panel opacity-0 shadow group-hover/n:opacity-100"
                  style={{ background: KIND_COLOR[n.s.do], opacity: on ? 1 : undefined }}
                  onPointerDown={(e) => linkStart(e, n)}
                />
              </div>
            );
          })}
          {menu && <div ref={menuAnchor} className="absolute h-0 w-0" style={{ left: menu.pt.x, top: menu.pt.y }} />}
        </div>
        <div className="absolute top-2.5 left-2.5 flex items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5 shadow-sm" onPointerDown={(e) => e.stopPropagation()}>
          <IconButton label="Zoom out" size="sm" onClick={() => zoom(1 / 1.2)}>
            <Minus size={14} />
          </IconButton>
          <span className="w-10 text-center text-[11.5px] text-fg-3 tabular-nums">{Math.round(view.k * 100)}%</span>
          <IconButton label="Zoom in" size="sm" onClick={() => zoom(1.2)}>
            <Plus size={14} />
          </IconButton>
          <IconButton label="Fit it in" size="sm" onClick={fit}>
            <Maximize size={14} />
          </IconButton>
          <IconButton label="Tidy: lay it all out again" size="sm" onClick={() => onGraph(graph?.groups ? { groups: graph.groups } : undefined)} disabled={!Object.keys(at).length}>
            <LayoutGrid size={14} />
          </IconButton>
          <IconButton label="Try it" size="sm" onClick={() => (setTrying((x) => !x), setPicked([]))}>
            <FlaskConical size={14} className={trying ? 'text-accent' : undefined} />
          </IconButton>
          <IconButton label={full ? 'Back in the page' : 'Full screen'} size="sm" onClick={() => (setFull((f) => !f), setTimeout(fit, 50))}>
            {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </IconButton>
          {picked.length > 1 && (
            <IconButton label="Group them, with a note" size="sm" onClick={() => (setGroups([...groups, { id: `g${Date.now().toString(36)}`, note: '', steps: picked }]), setPicked([]))}>
              <Group size={14} />
            </IconButton>
          )}
        </div>
        <div className="pointer-events-none absolute right-3 bottom-2.5 text-[11px] text-fg-3">Drag a node’s dot to wire a value · Ctrl and the wheel zoom</div>
        {menu && <GraphMenu menu={menu} anchor={menuAnchor} ctx={ctx} pos={pos} onClose={() => setMenu(null)} onPick={(id) => setPicked([id])} />}
      </div>
      {one ? (
        <Inspector
          key={one.s.id}
          n={one}
          ctx={ctx}
          last={listLen(one.list) - 1}
          Body={Body}
          Actions={Actions}
          onClose={() => setPicked([])}
          went={lit.get(one.s.id)}
          pause={pause.has(one.s.id)}
          frozen={frozen.has(one.s.id)}
          onPause={() => setPause((x) => toggle(x, one.s.id))}
          onFreeze={() => setFrozen((x) => toggle(x, one.s.id))}
        />
      ) : (
        trying && <TryPanel recipe={ctx.recipe} t={t} pause={[...pause]} frozen={[...frozen]} titleOf={(id) => (pos.get(id) ? titleOf(pos.get(id)!.s) : id)} onClose={() => setTrying(false)} />
      )}
      </div>
    </>
  );
  // Full screen, over the whole app (out of the page and whatever it sits in).
  return full ? createPortal(editor, document.body) : editor;
}

/** The menu at a point: steps to put there, the inputs a value can go in, or new steps that use it. */
function GraphMenu({ menu, anchor, ctx, pos, onClose, onPick }: { menu: Menu; anchor: React.RefObject<HTMLDivElement | null>; ctx: Ctx; pos: Map<string, Spot>; onClose: () => void; onPick: (id: string) => void }) {
  const from = menu.kind !== 'add' ? pos.get(menu.from) : undefined;
  const gives = from ? (givesOf(from.s) ?? ['result']) : [];
  const [value, setValue] = useState(gives[0] ?? '');
  const ref = from ? `{{${from.s.id}.${value}}}` : '';
  const done = (id?: string) => {
    onClose();
    if (id) onPick(id);
  };
  return (
    <Popover anchor={anchor} open onClose={onClose} width={300}>
      <div className="p-1">
        {menu.kind === 'add' &&
          STEP_KINDS.map((k) => {
            const I = ICON[k.value];
            return (
              <button key={k.value} type="button" title={k.hint} onClick={() => done(ctx.insert(menu.list, menu.at, k.value))} className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] hover:bg-bg-2">
                <I size={14} className="shrink-0" style={{ color: KIND_COLOR[k.value] }} />
                {k.label}
              </button>
            );
          })}
        {menu.kind !== 'add' && from && (
          <>
            <div className="px-2 pt-1 pb-1.5 text-[12px] text-fg-3">
              <span>{menu.kind === 'into' ? 'Put a value of this step in that one' : 'A new step that uses a value of this one'}</span>
              <select className="mt-1.5 block h-7 w-full rounded-md border border-line bg-bg px-1.5 font-mono text-[12px] text-fg" value={value} onChange={(e) => setValue(e.target.value)} translate="no">
                {gives.map((g) => (
                  <option key={g} value={g}>{`{{${from.s.id}.${g}}}`}</option>
                ))}
              </select>
            </div>
            {menu.kind === 'into' &&
              (() => {
                const to = pos.get(menu.to);
                if (!to) return null;
                return inputsOf(to.s, ctx, value).map((inp) => (
                  <MenuItem key={inp.label} onClick={() => (ctx.update(to.list, to.i, inp.put(to.s, ref)), done(to.s.id))}>
                    {inp.label}
                  </MenuItem>
                ));
              })()}
            {menu.kind === 'new' &&
              usersOf(ctx).map((u) => (
                <MenuItem key={u.label} onClick={() => done(ctx.insert(from.list, from.i + 1, u.make(ref)))}>
                  {u.label}
                </MenuItem>
              ))}
          </>
        )}
      </div>
    </Popover>
  );
}

/** The picked step's settings, beside the graph. */
function Inspector({
  n,
  ctx,
  last,
  Body,
  Actions,
  onClose,
  went,
  pause,
  frozen,
  onPause,
  onFreeze,
}: {
  n: Spot;
  ctx: Ctx;
  last: number;
  Body: GraphEditorProps['Body'];
  Actions: GraphEditorProps['Actions'];
  onClose: () => void;
  went?: RunStepView;
  pause: boolean;
  frozen: boolean;
  onPause: () => void;
  onFreeze: () => void;
}) {
  const more = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const I = ICON[n.s.do];
  return (
    <aside className="relative z-10 flex w-[380px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line py-2 pr-2 pl-3">
        <I size={15} className="shrink-0" style={{ color: KIND_COLOR[n.s.do] }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium" translate="no">
            {titleOf(n.s)}
          </span>
          <span className="block text-[11.5px] text-fg-3">{KIND[n.s.do]}</span>
        </span>
        <IconButton label={pause ? 'A try pauses before it: no more' : 'Pause a try before it'} size="sm" onClick={onPause}>
          <CircleDot size={15} className={pause ? 'text-err' : undefined} />
        </IconButton>
        <IconButton label={frozen ? 'Frozen: let it run again' : 'Freeze: in a try, it gives what it gave in the last one'} size="sm" onClick={onFreeze}>
          <Snowflake size={15} className={frozen ? 'text-accent' : undefined} />
        </IconButton>
        <IconButton ref={more} label="More" size="sm" onClick={() => setOpen((o) => !o)}>
          <Ellipsis size={15} />
        </IconButton>
        <Popover anchor={more} open={open} onClose={() => setOpen(false)} align="end" width={200}>
          <Actions s={n.s} list={n.list} i={n.i} last={last} ctx={ctx} done={() => setOpen(false)} />
        </Popover>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {went && <LastTry st={went} />}
        <Body s={n.s} list={n.list} i={n.i} ctx={ctx} />
      </div>
    </aside>
  );
}

const WENT: Record<string, string> = { running: 'Working', waiting: 'Needs you', done: 'Done', failed: 'Did not finish', skipped: 'Skipped', stopped: 'Stopped' };

/** How a step went in the last try: done or not, how long, what it cost, and what it gave. */
function LastTry({ st }: { st: RunStepView }) {
  const took = st.startedAt && st.endedAt ? Math.max(0, Math.round((st.endedAt - st.startedAt) / 100) / 10) : null;
  return (
    <div className="rounded-lg border border-line bg-bg-1 px-2.5 py-2 text-[12.5px]">
      <div className="flex flex-wrap items-baseline gap-x-2 text-fg-2">
        <span className="font-medium text-fg">In the last try</span>
        <span>{st.reused ? 'Frozen' : WENT[st.status]}</span>
        {took !== null && <span>{`${took} s`}</span>}
        {!!st.costUsd && <span>{money(st.costUsd)}</span>}
      </div>
      {st.error && st.status !== 'skipped' && <div className="mt-1 text-err">{st.error}</div>}
      {st.values && Object.keys(st.values).length > 0 && (
        <pre className="mt-1.5 max-h-40 overflow-auto rounded bg-bg-2 p-1.5 text-[11.5px] whitespace-pre-wrap" translate="no">
          {JSON.stringify(st.values, null, 1).slice(0, 4000)}
        </pre>
      )}
    </div>
  );
}

/** Trying the template as it is on screen: its form, then the run as it goes, pausing where it was asked to. */
function TryPanel({ recipe, t, pause, frozen, titleOf: name, onClose }: { recipe: AppRecipe; t: Try; pause: string[]; frozen: string[]; titleOf: (id: string) => string; onClose: () => void }) {
  const [values, setValues] = useState<FormValues>(() => initialValues(recipe.fields));
  const [files, setFiles] = useState<FormFiles>({});
  const [busy, setBusy] = useState(false);
  const paused = (t.detail?.progress?.paused ?? []).map((p) => p.split(/[/#]/).pop()!);
  const start = async () => {
    const errs = formErrors(recipe.fields, values, files);
    if (Object.keys(errs).length) return toast(`Fill in ${Object.keys(errs).map((k) => recipe.fields.find((f) => f.id === k)?.label).join(', ')}`, 'error');
    setBusy(true);
    try {
      await t.start(recipe, values, files, pause, frozen);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const r = t.run;
  return (
    <aside className="relative z-10 flex w-[380px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line py-2 pr-2 pl-3">
        <FlaskConical size={15} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 text-[13.5px] font-medium">Try it</span>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-[12.5px] text-fg-3">A test run of the template as it is on screen: each step lights up as it goes.</p>
        <AppForm fields={recipe.fields} values={values} files={files} onChange={(k, v) => setValues((x) => ({ ...x, [k]: v }))} onFile={(k, f) => setFiles((x) => (f ? { ...x, [k]: f } : Object.fromEntries(Object.entries(x).filter(([j]) => j !== k))))} disabled={t.active} />
        {(pause.length > 0 || frozen.length > 0) && (
          <ul className="space-y-0.5 text-[12.5px] text-fg-2">
            {pause.length > 0 && <li>{`It pauses before ${pause.map((id) => `“${name(id)}”`).join(', ')}`}</li>}
            {frozen.length > 0 && <li>{r && !t.active ? `Frozen, giving what they gave in the last try: ${frozen.map((id) => `“${name(id)}”`).join(', ')}` : `Frozen once there is a try to keep: ${frozen.map((id) => `“${name(id)}”`).join(', ')}`}</li>}
          </ul>
        )}
        {r && (
          <div className="rounded-lg border border-line bg-bg-1 px-2.5 py-2 text-[12.5px]">
            {paused.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-warn">{`Paused before ${paused.map((id) => `“${name(id)}”`).join(' and ')}`}</span>
                <Button size="sm" variant="secondary" onClick={() => void t.go(true)}>
                  One step
                </Button>
                <Button size="sm" variant="primary" onClick={() => void t.go()}>
                  Go on
                </Button>
              </div>
            ) : t.active ? (
              <span className="flex items-center gap-2 text-fg-2">
                <Throbber className="h-3.5" />
                {t.detail?.progress?.waiting ?? 'Working…'}
              </span>
            ) : (
              <span className={r.status === 'done' ? 'text-ok' : 'text-err'}>
                {r.status === 'done' ? 'Done' : r.status === 'stopped' ? 'Stopped' : 'Did not finish'}
                {r.startedAt && r.endedAt ? ` · ${Math.max(1, Math.round((r.endedAt - r.startedAt) / 1000))} s` : ''}
                {r.costUsd ? ` · ${money(r.costUsd)}` : ''}
              </span>
            )}
            {r.error && !t.active && <div className="mt-1 text-err">{r.error}</div>}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-line p-2.5">
        {t.active ? (
          <Button variant="ghost" onClick={() => void t.stop()}>
            Stop
          </Button>
        ) : (
          <Button variant="primary" icon={busy ? <Throbber /> : undefined} disabled={busy} onClick={() => void start()}>
            {r ? 'Try again' : 'Run'}
          </Button>
        )}
      </div>
    </aside>
  );
}
