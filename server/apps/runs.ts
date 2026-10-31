// Running apps: a run fills the prompt from the form, starts a session with the app's settings, follows
// it until its turn ends, nudges the agent once if it finished without handing in the answer fields,
// then keeps the reply, the result and what it spent. Public runs use Custom with no shell and no files
// (publicRun.ts), in a fresh folder under the system's temporary folder, deleted when they end.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { SessionExtra } from '../../shared/features.ts';
import type { AppRecipe, AppRun, RunProgress, RunSource, RunStatus } from '../../shared/apps.ts';
import { ACTIVE, checkInputs, fillTemplate, inputsLine, isActive } from '../../shared/apps.ts';
import type { Agent, AgentModel, SessionSummary, TimelineItem } from '../../shared/types.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import { spending } from '../budget/spend.ts';
import { config } from '../config.ts';
import { extractText } from '../documents/extract.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { AGENT_FILE } from '../models/config.ts';
import { costOf, rateFor } from '../prices.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { getRun, insertRun, listRuns, runView, updateRun, type RunRecord } from './store.ts';

/** Where an app's runs keep their files when the app names no folder: outside the app's data, which Custom treats as private. */
export const WORK_DIR = process.env.NAGET_APPS_DIR || path.join(config.home, 'naget-apps');
/** Public runs' throwaway folders. */
const PUBLIC_DIR = path.join(os.tmpdir(), 'naget-public-runs');

/** What a session started by an app keeps in its settings (SessionExtra.app). */
export interface AppMark {
  id: string;
  run: string;
  name: string;
  /** A public page's run: Custom without shell or files, the web only when `web`. */
  public?: boolean;
  web?: boolean;
}

export const markOf = (extra: SessionExtra | undefined): AppMark | null => {
  const a = extra?.app as AppMark | undefined;
  return a && typeof a === 'object' && typeof a.run === 'string' ? a : null;
};

let deps: Deps | null = null;
const d = () => {
  if (!deps) throw new Error('Apps are still starting');
  return deps;
};

/** The agent process (its run id) behind each app run, from the moment it starts. */
const byAgentRun = new Map<string, string>();
/** Runs being followed: when their session was last seen idle, whether a stop was asked for. */
const followed = new Map<string, { idleSince: number; stopping?: boolean }>();
const waiters = new Map<string, Set<() => void>>();
const finishedHooks: ((r: RunRecord) => void)[] = [];

/** Told when a run ends (runs over rows start the next one). */
export const onFinished = (fn: (r: RunRecord) => void) => finishedHooks.push(fn);

function changed(r: RunRecord | null) {
  if (!r) return;
  d().broadcast({ t: 'feature', id: 'apps', data: { run: runView(r) } });
}

// ---- which run a session or tool call belongs to ------------------------------------------------------

const cache = new Map<string, { at: number; r: RunRecord | null }>();
const cached = (id: string): RunRecord | null => {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 1500) return hit.r;
  const r = getRun(d().db, id);
  cache.set(id, { at: Date.now(), r });
  if (cache.size > 500) cache.clear();
  return r;
};

/** The app run a tool call comes from: by the agent process, else by the session's settings. */
export function runOfCtx(ctx: Pick<RunCtx, 'runId' | 'key'>): { run: RunRecord; mark: AppMark } | null {
  const id = byAgentRun.get(ctx.runId);
  const extra = sessionExtra(d().db, ctx.key);
  const mark = markOf(extra);
  const runId = id ?? mark?.run;
  if (!runId) return null;
  const run = cached(runId);
  if (!run) return null;
  return { run, mark: mark ?? { id: run.app, run: run.id, name: run.appName, public: run.source === 'public' } };
}

/** A starting agent: remembered under its run id, so its tools know the app even before the session's settings are written. */
export function noteAgentRun(agentRun: string, mark: AppMark) {
  byAgentRun.set(agentRun, mark.run);
  if (byAgentRun.size > 2000) byAgentRun.delete(byAgentRun.keys().next().value!);
}

// ---- starting --------------------------------------------------------------------------------------

export interface StartInput {
  /** The app's id, or "tpl:<id>". */
  app: string;
  /** Its address, for the folder's name. */
  slug: string;
  recipe: AppRecipe;
  source: RunSource;
  inputs: Record<string, unknown>;
  /** File fields, as sent: a name and base64 contents. */
  files?: Record<string, { name: string; data: string }>;
  /** A public run: Custom with this model, the web only when `web`, spending at most `capUsd`. */
  public?: { model: string; web: boolean; capUsd: number };
  visitor?: string;
  ip?: string;
  batch?: string;
  row?: number;
  /** Wait in line (rows of a CSV) instead of starting now. */
  queued?: boolean;
}

/** The checked form, or an error that says what to fix. */
export function checkedInputs(recipe: AppRecipe, inputs: Record<string, unknown>, isPublic: boolean, files: Record<string, unknown> = {}) {
  // A file field with a file sent counts as answered.
  const raw = { ...inputs };
  for (const f of recipe.fields) if (f.type === 'file' && files[f.id]) raw[f.id] = (files[f.id] as { name?: string }).name || 'file';
  return checkInputs(recipe.fields, raw, { maxLong: isPublic ? 12_000 : 60_000, maxText: isPublic ? 600 : 2000 });
}

/** Creates the run and starts its session in the background (unless it waits in line). */
export function startRun(o: StartInput): RunRecord {
  const { values, errors } = checkedInputs(o.recipe, o.inputs, !!o.public, o.files);
  if (errors.length) throw new HttpError(400, `Check the form: ${errors.join('; ')}`);
  const maxFile = o.public ? 3 << 20 : 25 << 20;
  for (const [id, f] of Object.entries(o.files ?? {})) {
    if (!o.recipe.fields.some((x) => x.id === id && x.type === 'file')) throw new HttpError(400, `There is no file field ${id}`);
    if (typeof f?.data !== 'string' || typeof f.name !== 'string') throw new HttpError(400, 'Send each file as a name and its base64 contents');
    if (f.data.length * 0.75 > maxFile) throw new HttpError(413, `${f.name} is too big (at most ${maxFile >> 20} MB)`);
  }
  const r = insertRun(d().db, { app: o.app, appName: o.recipe.name, recipe: o.recipe, source: o.source, inputs: values, status: o.queued ? 'queued' : 'starting', visitor: o.visitor, ip: o.ip, batch: o.batch, row: o.row });
  if (!o.queued) void launch(r, o).catch(() => {});
  changed(r);
  return r;
}

/** Starts a run that waited in line. */
export function launchQueued(r: RunRecord, slug: string) {
  updateRun(d().db, r.id, { status: 'starting' });
  const next = getRun(d().db, r.id)!;
  changed(next);
  void launch(next, { app: r.app, slug, recipe: r.recipe, source: r.source }).catch(() => {});
}

const stamp = (t = Date.now()) => {
  const x = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}-${p(x.getHours())}${p(x.getMinutes())}`;
};

const safeName = (n: string) => path.basename(String(n || 'file')).replace(/[^\w.\- ()]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file';

/** A file's text for a run that cannot open files (public): the documents reader, pdftotext, or plain text. */
async function fileText(file: string): Promise<string | null> {
  const doc = await extractText(file).catch(() => null);
  if (doc?.text) return doc.text;
  if (/\.pdf$/i.test(file)) {
    const r = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', timeout: 30_000, maxBuffer: 32 << 20 });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.replace(/\f/g, '\n');
  }
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, 8000).includes(0)) return null;
  return buf.toString('utf8');
}

/** The default mode for a run nobody watches: one that goes ahead with routine steps. */
function modeFor(agent: Agent, acpAgent: string | undefined, mode: string | undefined): string | undefined {
  if (mode) return mode;
  if (agent === 'claude' || agent === 'codex') return 'auto';
  return acpAgent === CONSOLE_ID ? 'auto' : undefined;
}

/** What the agent is told about the run: the answer fields to hand in, and to finish without asking. */
export function runInstructions(r: Pick<RunRecord, 'recipe' | 'source' | 'appName'>): string {
  const lines = [
    `This session runs the app "${r.appName}" (Naget Agent Apps)${r.source === 'web' || r.source === 'test' ? '' : ': nobody watches it live'}. Do the task in the first message from start to finish. Don't stop to ask questions: make sensible assumptions and say what they were.`,
  ];
  const a = r.recipe.answer;
  if (a.length) {
    lines.push(
      'When you have the result, call the submit_result tool (on the naget-agent server) once, with these fields:',
      ...a.map((f) => {
        const kind = f.type === 'table' ? `table: a list of rows, each with ${(f.columns ?? []).map((c) => `${c.id} (${c.type})`).join(', ')}` : f.type === 'list' ? 'list of short texts' : f.type === 'markdown' ? 'text, Markdown' : f.type === 'yesno' ? 'true or false' : f.type;
        return `- ${f.id} (${kind}${f.required ? ', required' : ''}): ${f.label}${f.description ? ` — ${f.description}` : ''}`;
      }),
      'If it answers with problems, fix them and call it again. Then end with a short reply; the person sees the result as a card, so there is no need to repeat it all.',
    );
  } else lines.push('Your last reply is the result the person sees: make it complete.');
  return lines.join('\n');
}

async function launch(r: RunRecord, o: Pick<StartInput, 'app' | 'slug' | 'recipe' | 'source' | 'files' | 'public'>) {
  const { db, sessions } = d();
  const recipe = o.recipe;
  try {
    // The folder: the app's own, or a new one for this run.
    let cwd: string;
    let fresh = true;
    if (o.public) cwd = path.join(PUBLIC_DIR, r.id);
    else if (recipe.cwd) {
      cwd = path.resolve(recipe.cwd.replace(/^~(?=\/|$)/, config.home));
      if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error(`The app’s folder is not there: ${cwd}`);
      fresh = false;
    } else cwd = path.join(WORK_DIR, o.slug, `${stamp(r.createdAt)}-${r.id.slice(0, 4)}`);
    if (fresh) fs.mkdirSync(cwd, { recursive: true, mode: 0o700 });
    // Files: saved for agents that open them, their text in the message for public runs.
    const values = { ...r.inputs };
    const docs: string[] = [];
    for (const [id, f] of Object.entries(o.files ?? {})) {
      const dir = fresh ? cwd : path.join(WORK_DIR, 'uploads', r.id);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, safeName(f.name));
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'), { mode: 0o600 });
      if (o.public) {
        const text = await fileText(file).catch(() => null);
        values[id] = `"${safeName(f.name)}" (its text is at the end of this message)`;
        docs.push(`<document name="${safeName(f.name)}">\n${text ? text.slice(0, 60_000) : '(This file could not be read as text.)'}\n</document>`);
      } else values[id] = file;
    }
    let prompt = fillTemplate(recipe.prompt, values, { known: recipe.fields.map((f) => f.id) });
    // Custom on a public run hears nothing from the capabilities: what it needs to know comes with the message.
    if (o.public) prompt = `${prompt}\n\n---\n${runInstructions(r)}${docs.length ? `\n\n${docs.join('\n\n')}` : ''}`;
    const mark: AppMark = { id: r.app, run: r.id, name: recipe.name, ...(o.public ? { public: true, web: o.public.web } : {}) };
    const extra: SessionExtra = { app: mark };
    if (recipe.assistant && !o.public) extra.assistant = recipe.assistant;
    if (recipe.limits.capUsd) extra.capUsd = recipe.limits.capUsd;
    // A public run never spends more than the page may in a day, whatever is left of it.
    if (o.public) extra.capUsd = Math.min(recipe.limits.capUsd ?? Infinity, o.public.capUsd);
    if (o.public) extra.memory = false;
    const agent: Agent = o.public ? 'acp' : recipe.agent;
    const acpAgent = o.public ? CONSOLE_ID : recipe.agent === 'acp' ? recipe.acpAgent || CONSOLE_ID : undefined;
    const line = inputsLine(recipe.fields, r.inputs, 50);
    const key = await sessions.create({
      agent,
      acpAgent,
      cwd,
      prompt,
      model: o.public ? o.public.model : recipe.model,
      effort: o.public || agent === 'acp' ? undefined : recipe.effort,
      // Public runs ask before anything Custom's rules would ask about; with no shell or files there is nothing to ask.
      mode: o.public ? 'ask' : modeFor(agent, acpAgent, recipe.mode),
      title: `${recipe.name}${line ? ` · ${line}` : ''}`,
      remember: false,
      extra,
    });
    updateRun(db, r.id, { key, status: 'running', startedAt: Date.now() });
    const t = { idleSince: 0, stopping: followed.get(r.id)?.stopping };
    followed.set(r.id, t);
    // Runs nobody opens one by one stay out of the session list (they show under their app).
    if (r.source === 'public' || r.source === 'batch' || r.source === 'api' || r.source === 'mcp') sessions.setFlags(key, { archived: true });
    changed(getRun(db, r.id));
    if (t.stopping) await sessions.interrupt(key).catch(() => {});
  } catch (e) {
    finish(r.id, 'failed', (e as Error).message || 'It could not start');
  }
}

// ---- following -----------------------------------------------------------------------------------

/** Looks at a followed run's session and moves it on: running, waiting for you, or done. */
async function check(id: string) {
  const t = followed.get(id);
  const { db, sessions } = d();
  const r = getRun(db, id);
  if (!t || !r || !isActive(r.status)) return void followed.delete(id);
  if (!r.key) return;
  const s = sessions.summary(r.key);
  const st = s?.live?.status;
  if (st === 'working' || st === 'starting' || st === 'stopping') {
    t.idleSince = 0;
    if (r.status !== 'running') (updateRun(db, id, { status: 'running' }), changed(getRun(db, id)));
    return;
  }
  if (st === 'waiting') {
    t.idleSince = 0;
    if (r.status !== 'waiting') (updateRun(db, id, { status: 'waiting' }), changed(getRun(db, id)));
    return;
  }
  // The turn ended (or the agent is gone): give the transcript a moment to land.
  if (!t.idleSince) {
    t.idleSince = Date.now();
    setTimeout(() => void check(id), 1700);
    return;
  }
  if (Date.now() - t.idleSince < 1500) return;
  if (r.recipe.answer.length && !r.result && !r.nudged && !t.stopping && st === 'idle') {
    // Finished without the answer fields: one reminder.
    updateRun(db, id, { nudged: true });
    t.idleSince = 0;
    try {
      await sessions.deliverOrQueue(r.key, `You haven't handed in the result yet. Call submit_result now with the fields it asks for (${r.recipe.answer.map((f) => f.id).join(', ')}), from what you found. Where something could not be found, say so in that field rather than leaving it out.`);
    } catch (e) {
      finish(id, 'done', `The reminder to hand in the result could not be sent: ${(e as Error).message}`);
    }
    return;
  }
  const failed = st === 'error' && !r.result;
  finish(id, t.stopping ? 'stopped' : failed ? 'failed' : 'done', failed ? s?.live?.error || 'The agent stopped with an error' : undefined);
}

/** The last thing the agent said that reads like an answer (a short "Done." after the nudge does not). */
function replyOf(items: TimelineItem[]): string | undefined {
  const said = items.filter((i): i is Extract<TimelineItem, { kind: 'assistant' }> => i.kind === 'assistant' && !!i.text.trim()).map((i) => i.text.trim());
  if (!said.length) return undefined;
  const last = said[said.length - 1];
  const full = [...said].reverse().find((t) => t.length >= 300);
  return (last.length < 300 && full ? full : last).slice(0, 60_000);
}

function customModel(id?: string): AgentModel | undefined {
  try {
    const list: AgentModel[] = JSON.parse(fs.readFileSync(AGENT_FILE, 'utf8')).models ?? [];
    return list.find((m) => m.id === id) ?? (id ? undefined : list[0]);
  } catch {
    return undefined;
  }
}

/** What the spending caps count for a session (server/budget), once its transcript is indexed; null before. */
function indexedSpend(key: string | undefined): number | null {
  const db = d().db;
  if (!key || !db.prepare('select 1 from sessions where key = ?').get(key)) return null;
  const sp = spending(db, key);
  return sp.spentUsd > 0 || !sp.unpriced ? sp.spentUsd : null;
}

/**
 * What a run spent: what the spending caps count (the agent's own figure, or its tokens at API prices),
 * else the session's tokens, else for Custom an estimate from the text it read and wrote.
 */
export function runCost(r: Pick<RunRecord, 'recipe' | 'source' | 'key'>, s: SessionSummary | null, items: TimelineItem[]): number | undefined {
  const db = d().db;
  const counted = indexedSpend(r.key);
  if (counted !== null) return counted;
  if (s?.stats.costUsd) return s.stats.costUsd;
  if (s && s.stats.tokensIn + s.stats.tokensOut > 0) return costOf(db, s.model ?? r.recipe.model, s.stats) ?? undefined;
  const custom = s?.agent === 'acp' || r.source === 'public' || r.recipe.agent === 'acp';
  if (!custom) return undefined;
  const m = customModel(s?.prefs?.model ?? s?.model ?? r.recipe.model);
  if (!m) return undefined;
  if (m.provider === 'ollama' || m.provider === 'vllm') return 0;
  const rate = rateFor(db, m.id) ?? rateFor(db, m.model) ?? rateFor(db, m.model.replace(/^[^/]+\//, ''));
  if (!rate) return undefined;
  let out = 0;
  let all = 6000;
  let steps = 1;
  for (const it of items) {
    if (it.kind === 'assistant') (out += it.text.length, (all += it.text.length));
    else if (it.kind === 'user') all += it.text.length;
    else if (it.kind === 'tool') {
      steps++;
      const input = JSON.stringify(it.tool.input ?? '').length;
      out += input;
      all += input + (it.tool.output?.length ?? 0);
    }
  }
  // Each step sends the conversation so far again: on average about half of all of it, plus the instructions.
  const tokensIn = (steps * (all / 2 + 6000)) / 4;
  return (tokensIn * rate.input + (out / 4) * rate.output) / 1e6;
}

/** Ends a run: its reply, what it spent, and the waiters told. */
export function finish(id: string, status: RunStatus, error?: string) {
  const { db, sessions } = d();
  followed.delete(id);
  const r = getRun(db, id);
  if (!r || !isActive(r.status)) return;
  const done = async () => {
    let reply: string | undefined;
    let cost: number | undefined;
    if (r.key) {
      const tl = await sessions.timeline(r.key).catch(() => null);
      await tl?.readMore().catch(() => {});
      const items = tl?.parser.items ?? [];
      reply = replyOf(items);
      cost = runCost(r, sessions.summary(r.key), items);
    }
    // Done with nothing to show is a failure, said plainly.
    if (status === 'done' && !reply && !getRun(db, id)?.result) {
      status = 'failed';
      error ??= 'The agent ended without an answer';
    }
    updateRun(db, id, { status, endedAt: Date.now(), ...(reply ? { reply } : {}), ...(cost !== undefined ? { costUsd: Math.round(cost * 10000) / 10000 } : {}), ...(error ? { error } : {}) });
    const next = getRun(db, id)!;
    cache.delete(id);
    if (next.source === 'public') fs.rm(path.join(PUBLIC_DIR, id), { recursive: true, force: true }, () => {});
    // The transcript's last lines reach the index a little later: what the caps count then wins.
    if (next.key)
      setTimeout(() => {
        const later = indexedSpend(next.key);
        if (later !== null && later !== getRun(db, id)?.costUsd) updateRun(db, id, { costUsd: Math.round(later * 10000) / 10000 });
      }, 30_000).unref();
    changed(next);
    for (const w of waiters.get(id) ?? []) w();
    waiters.delete(id);
    for (const h of finishedHooks) {
      try {
        h(next);
      } catch {}
    }
  };
  void done().catch((e) => console.warn(`[apps] finishing ${id}: ${(e as Error).message}`));
}

/** Resolves when the run ends, or after `ms`, with the run as it is then. */
export function waitFor(id: string, ms: number): Promise<RunRecord | null> {
  const r = getRun(d().db, id);
  if (!r || !isActive(r.status) || ms <= 0) return Promise.resolve(r);
  return new Promise((resolve) => {
    let set = waiters.get(id);
    if (!set) waiters.set(id, (set = new Set()));
    const done = () => {
      clearTimeout(timer);
      set!.delete(done);
      // The run's last write lands just before waiters hear of it.
      resolve(getRun(d().db, id));
    };
    const timer = setTimeout(done, ms);
    set.add(done);
  });
}

/** Stops a run: one waiting in line ends at once; a running one is interrupted and ends as stopped. */
export async function stopRun(id: string) {
  const { db, sessions } = d();
  const r = getRun(db, id);
  if (!r || !isActive(r.status)) return;
  if (r.status === 'queued') {
    updateRun(db, id, { status: 'stopped', endedAt: Date.now() });
    const next = getRun(db, id)!;
    changed(next);
    for (const h of finishedHooks) h(next);
    return;
  }
  const t = followed.get(id) ?? { idleSince: 0 };
  t.stopping = true;
  followed.set(id, t);
  if (r.key) await sessions.interrupt(r.key).catch(() => {});
  // An agent that is not running any more has nothing to interrupt.
  setTimeout(() => void check(id), 2500);
}

/** Saves what submit_result handed in. */
export function saveResult(id: string, value: Record<string, unknown>) {
  updateRun(d().db, id, { result: value });
  cache.delete(id);
  changed(getRun(d().db, id));
}

// ---- progress -------------------------------------------------------------------------------------

const VERB: Record<string, string> = { command: 'Ran', edit: 'Changed', read: 'Read', search: 'Searched', web: 'Looked up', todo: 'Planned', message: 'Messaged', agent: 'Asked a helper' };

/** A step as one line: the app's own tools by what they do, others by their kind and title. */
export function stepTitle(t: { name: string; category?: string; title: string; label?: string }, publicView = false): string {
  const bare = /^(?:mcp__naget-agent__|naget-agent[:.]\s*)(.+)$/.exec(t.name)?.[1] ?? /^naget-agent:\s*(.+)$/.exec(t.title)?.[1] ?? t.name;
  if (bare === 'submit_result') return 'Handed in the result';
  if (bare === 'web_search') return 'Searched the web';
  if (bare === 'read_page' || bare === 'web_fetch' || t.name === 'WebFetch') return publicView ? 'Read a page' : `Read ${t.title.replace(/^naget-agent:\s*\w+\s*/, '') || 'a page'}`;
  if (bare === 'todo_write' || t.category === 'todo' || (bare === 'think' && t.title === 'Plan')) return 'Updated the plan';
  if (publicView) return 'Worked on it';
  const what = (t.label || t.title || bare).replace(/\s+/g, ' ').trim();
  const v = VERB[t.category ?? ''];
  return (v && !what.toLowerCase().startsWith(v.toLowerCase()) ? `${v} ${what}` : what).slice(0, 140);
}

/** How a run is getting on: the latest steps and what the agent said last. */
export async function progressOf(r: RunRecord, publicView: boolean): Promise<RunProgress> {
  if (!r.key || r.status === 'queued') return { steps: [] };
  const { sessions } = d();
  const tl = await sessions.timeline(r.key).catch(() => null);
  const items = tl?.parser.items ?? [];
  const live = sessions.liveSnapshot(r.key);
  const tools = [...items, ...live.overlay.items].filter((i): i is Extract<TimelineItem, { kind: 'tool' }> => i.kind === 'tool');
  const seen = new Set<string>();
  const all = tools
    .filter((i) => !seen.has(i.id) && seen.add(i.id))
    .map((i) => ({ title: stepTitle(i.tool, publicView), status: (i.tool.status === 'running' || i.tool.status === 'pending' ? 'running' : i.tool.status === 'error' ? 'error' : 'ok') as RunProgress['steps'][number]['status'] }));
  // The same step twice in a row (a plan and its list) reads as one.
  const steps = all.filter((x, i) => i === all.length - 1 || x.title !== all[i + 1].title || x.status !== all[i + 1].status).slice(-8);
  const said = [...items].reverse().find((i) => i.kind === 'assistant' && i.text.trim()) as Extract<TimelineItem, { kind: 'assistant' }> | undefined;
  const waiting = r.status === 'waiting' ? (publicView ? 'Waiting' : (live.live?.pendingApprovals ?? 0) > 0 ? 'It needs your approval in the session' : 'It has a question for you in the session') : undefined;
  return { steps, said: publicView ? undefined : said?.text.replace(/\s+/g, ' ').trim().slice(0, 280), waiting };
}

// ---- the server starting -----------------------------------------------------------------------------

/** Follows runs that were going when the server stopped; drops leftovers of public runs. */
export function startRuns(dd: Deps) {
  deps = dd;
  const { db, sessions } = dd;
  for (const r of listRuns(db, { status: ACTIVE.filter((s) => s !== 'queued'), limit: 2000 })) {
    if (!r.key) finish(r.id, 'failed', 'The server restarted before the run started');
    else followed.set(r.id, { idleSince: 0 });
  }
  sessions.on('live', (key: string) => {
    for (const [id] of followed) {
      const r = cached(id);
      if (r?.key === key) void check(id);
    }
  });
  setInterval(() => {
    for (const id of followed.keys()) void check(id);
  }, 2500).unref();
  // Public runs' folders from before a restart.
  try {
    for (const n of fs.readdirSync(PUBLIC_DIR)) {
      const r = getRun(db, n);
      if (!r || !isActive(r.status)) fs.rmSync(path.join(PUBLIC_DIR, n), { recursive: true, force: true });
    }
  } catch {}
}

export const setDeps = (dd: Deps) => (deps = dd);

export type { AppRun };
