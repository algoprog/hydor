// What a template's runs say about its steps, for its Edit page and for agents (app_get). A step that failed
// and had an agent do its work (If it fails, an agent tries) wants fixing. An agent step that did the same
// thing in each of its last runs (read the page at the link it was given, then its answer) can be done by
// fixed steps for less: Firm it up proposes them, the tools it called, with the values it called them with
// (the same each time, or one of the values its instructions were given), then a model step with its
// instructions and what the tools gave. The proposal is tried on the template's examples before it is used.
import type { AgentStep, ModelStep, Step, ToolStep } from '../../shared/app-manifest.ts';
import { allSteps, labelOf, STEP_TOOLS, titleOf, usedFrom } from '../../shared/app-manifest.ts';
import type { AppAdvice as Advice, AppDef, AppRecipe, FirmUp as Firm, RescuedStep as Rescued } from '../../shared/apps.ts';
import type { ToolItem } from '../../shared/types.ts';
import type { Deps } from '../features/types.ts';
import { getRun, listRuns, listSteps } from './store.ts';

/** How many of a template's latest runs are read, and how many times an agent step must have done the same. */
const LOOK = 12;
const AT_LEAST = 3;
const SAMPLES = 5;
const MOST_CALLS = 4;

/** What each tool step is called, on screen. */
const TOOL_TITLE: Record<string, string> = {
  web_search: 'Search the web',
  read_page: 'Read the page',
  http_request: 'Call the address',
  read_document: 'Read the document',
  generate_image: 'Make a picture',
  knowledge_search: 'Search the knowledge bases',
  knowledge_read: 'Read from a knowledge base',
  recall: 'Look in memory',
  notify_user: 'Send a notification',
};

/** Calls that are not part of the work (handing in the answer, loading tools, a to-do list). */
const AROUND = new Set(['submit_result', 'TodoWrite', 'ToolSearch', 'update_plan']);

interface Call {
  tool: string;
  with: Record<string, unknown>;
}

/** A tool call as a tool step would make it (Claude's own web tools as the app's), "around" for one that is not part of the work, or null for one no step can make. */
function asStepCall(t: ToolItem['tool']): Call | 'around' | null {
  const n = t.name.replace(/^mcp__(?:naget-agent|agent-console)__/, '');
  if (AROUND.has(n)) return 'around';
  const i = (t.input && typeof t.input === 'object' ? t.input : {}) as Record<string, unknown>;
  if (n === 'WebFetch') return typeof i.url === 'string' ? { tool: 'read_page', with: { url: i.url } } : null;
  if (n === 'WebSearch') return typeof i.query === 'string' ? { tool: 'web_search', with: { query: i.query } } : null;
  return STEP_TOOLS.includes(n) ? { tool: n, with: i } : null;
}

/** The value each {{ref}} of a template had in a text filled from it (null: it cannot be told apart). */
export function unfill(tpl: string, filled: string): Record<string, string> | null {
  if (/\{\{\s*[#^/]/.test(tpl)) return null;
  const parts = tpl.split(/\{\{\s*([^{}]+?)\s*\}\}/);
  if (!filled.startsWith(parts[0])) return null;
  let at = parts[0].length;
  const out: Record<string, string> = {};
  for (let i = 1; i < parts.length; i += 2) {
    const ref = parts[i];
    const next = parts[i + 1];
    let end: number;
    if (i + 2 >= parts.length) {
      if (!filled.endsWith(next)) return null;
      end = filled.length - next.length;
      if (end < at) return null;
    } else {
      // Two values side by side cannot be told apart.
      if (!next) return null;
      end = filled.indexOf(next, at);
      if (end < 0) return null;
    }
    const v = filled.slice(at, end);
    if (ref in out && out[ref] !== v) return null;
    out[ref] = v;
    at = end + next.length;
  }
  return out;
}

const json = (v: unknown) => JSON.stringify(v ?? null);

/** How an input of a call can be written for every run: the same value each time, or text around one of the values the instructions had. */
function inputOf(values: unknown[], given: Record<string, string>[]): { ok: true; value: unknown } | { ok: false } {
  if (values.every((v) => json(v) === json(values[0]))) return { ok: true, value: values[0] };
  if (!values.every((v) => typeof v === 'string')) return { ok: false };
  const texts = values as string[];
  for (const ref of Object.keys(given[0])) {
    const first = given[0][ref].trim();
    if (!first) continue;
    const at = texts[0].indexOf(first);
    if (at < 0) continue;
    const before = texts[0].slice(0, at);
    const after = texts[0].slice(at + first.length);
    if (texts.every((t, i) => given[i][ref] !== undefined && t === `${before}${given[i][ref].trim()}${after}`)) return { ok: true, value: `${before}{{${ref}}}${after}` };
  }
  return { ok: false };
}

/** One time an agent step ran: the instructions as it got them, the tools it called, what it took. */
export interface Seen {
  prompt: string;
  calls: Call[];
  seconds: number;
  costUsd: number;
  inputs: Record<string, string>;
}

/** The steps that could do what an agent step did the same way each time it was seen (null: it did not, or a step could not). */
export function firmOf(s: AgentStep, seen: Seen[], r: Pick<AppRecipe, 'flow' | 'flows'>): Firm | null {
  if (seen.length < AT_LEAST) return null;
  const names = seen[0].calls.map((c) => c.tool);
  if (names.length > MOST_CALLS || !seen.every((x) => x.calls.length === names.length && x.calls.every((c, i) => c.tool === names[i]))) return null;
  const given = seen.map((x) => unfill(s.instructions, x.prompt));
  if (given.some((g) => !g)) return null;
  const vals = given as Record<string, string>[];
  const ids = new Set(allSteps([...(r.flow?.steps ?? []), ...Object.values(r.flows ?? {}).flatMap((f) => f.steps)]).map((x) => x.id));
  const freeId = (base: string) => {
    const b = base.slice(0, 34);
    let id = b;
    for (let n = 2; ids.has(id); n++) id = `${b}_${n}`;
    ids.add(id);
    return id;
  };
  const tools: ToolStep[] = [];
  for (let i = 0; i < names.length; i++) {
    const keys = [...new Set(seen.flatMap((x) => Object.keys(x.calls[i].with)))];
    const w: Record<string, unknown> = {};
    for (const k of keys) {
      const got = inputOf(
        seen.map((x) => x.calls[i].with[k]),
        vals,
      );
      if (!got.ok) return null;
      if (got.value !== undefined) w[k] = got.value;
    }
    // A tool step that fails has an agent do its work, so firming it up never stops a run that worked.
    tools.push({ id: freeId(`${s.id}_${names[i]}`), title: TOOL_TITLE[names[i]] ?? labelOf(names[i]), do: 'tool', tool: names[i], ...(Object.keys(w).length ? { with: w } : {}), failed: 'agent', ...(s.if ? { if: s.if } : {}) });
  }
  const gave = tools.map((t) => `What ${t.tool} gave:\n{{${t.id}.text}}`).join('\n\n');
  const reply = usedFrom(r, s.id).includes('reply');
  const model: ModelStep = {
    id: s.id,
    ...(s.title ? { title: s.title } : {}),
    do: 'model',
    instructions: gave ? `${s.instructions}\n\n${gave}` : s.instructions,
    ...(s.outputs?.length ? { outputs: s.outputs } : reply ? { outputs: [{ id: 'reply', label: 'Reply', type: 'markdown', required: true }] } : {}),
    ...(s.if ? { if: s.if } : {}),
    ...(s.failed ? { failed: s.failed } : {}),
  };
  const avg = (f: (x: Seen) => number) => seen.reduce((n, x) => n + f(x), 0) / seen.length;
  return {
    step: s.id,
    title: titleOf(s),
    runs: seen.length,
    calls: names,
    steps: [...tools, model],
    agent: { seconds: Math.round(avg((x) => x.seconds)), costUsd: Math.round(avg((x) => x.costUsd) * 10000) / 10000 },
    inputs: seen.slice(0, 3).map((x) => x.inputs),
  };
}

const stepsIn = (r: Pick<AppRecipe, 'flow' | 'flows'>) => allSteps([...(r.flow?.steps ?? []), ...Object.values(r.flows ?? {}).flatMap((f) => f.steps)]);

/** What a template's latest runs say about its steps. */
export async function adviceOf(d: Pick<Deps, 'db' | 'sessions'>, app: AppDef): Promise<Advice> {
  const runs = listRuns(d.db, { app: app.id, limit: LOOK });
  const steps = stepsIn(app);
  const byId = new Map(steps.map((x) => [x.id, x]));
  // Steps an agent had to do the work of: in how many runs, and why they failed the last time.
  const rescued = new Map<string, Rescued>();
  for (const r of runs) {
    const here = new Set<string>();
    for (const st of listSteps(d.db, r.id)) {
      const s = byId.get(st.id);
      if (!st.rescued || st.reused || !s || here.has(st.id)) continue;
      here.add(st.id);
      const x = rescued.get(st.id);
      if (x) x.runs++;
      else rescued.set(st.id, { step: st.id, title: titleOf(s), runs: 1, of: runs.length, error: st.error ?? '', run: r.id });
    }
  }
  // Agent steps that did the same each time they ran (with the instructions they have now).
  const firm: Firm[] = [];
  for (const s of steps) {
    if (s.do !== 'agent') continue;
    const seen: Seen[] = [];
    let can = true;
    for (const r of runs) {
      if (seen.length >= SAMPLES || !can) break;
      const def = r.status === 'done' ? stepsIn(r.recipe).find((x) => x.id === s.id) : undefined;
      if (!def || def.do !== 'agent' || def.instructions !== s.instructions) continue;
      for (const st of listSteps(d.db, r.id)) {
        if (seen.length >= SAMPLES || !can) break;
        if (st.id !== s.id || st.status !== 'done' || !st.childRun || st.reused || st.rescued) continue;
        const child = getRun(d.db, st.childRun);
        if (!child?.key || child.status !== 'done') continue;
        const tl = await d.sessions.timeline(child.key).catch(() => null);
        if (!tl) continue;
        const calls: Call[] = [];
        for (const it of tl.parser.items) {
          if (it.kind !== 'tool') continue;
          const c = asStepCall((it as ToolItem).tool);
          if (c === 'around') continue;
          // A tool no step can call (a shell, files): the agent does more than steps could.
          if (!c) {
            can = false;
            break;
          }
          calls.push(c);
        }
        if (can) seen.push({ prompt: child.recipe.prompt, calls, seconds: st.startedAt && st.endedAt ? (st.endedAt - st.startedAt) / 1000 : 0, costUsd: child.costUsd ?? 0, inputs: r.inputs });
      }
    }
    const f = can ? firmOf(s, seen, app) : null;
    if (f) firm.push(f);
  }
  return { rescued: [...rescued.values()], firm };
}
