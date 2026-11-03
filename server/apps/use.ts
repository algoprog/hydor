// use_app: an agent in one of the user's sessions runs one of their apps for them (the Trip planner when they ask
// for a trip), in the conversation. What the request said goes in as the answers to the app's form; what the app
// needs and the request left out, the user fills in on the app's own card (the optional questions may stay empty),
// then it runs. Its card in the conversation (an "app-run" note, AppRunNote in the pages) follows the run and shows
// its answer as the app shows it. The call waits for the answer; a longer run carries on, and its answer comes to
// the session as a message when it ends. Which apps: those installed whose page lets agents use them, made for it.
// There may be very many: agents are told of the few the user runs most, and find the others with find_apps
// (search.ts: the best twenty for a few words on what the user wants, by words and by meaning).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppField, AppRecipe } from '../../shared/apps.ts';
import { checkInputs, isActive, madeForSessions } from '../../shared/apps.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import type { ApprovalAnswer } from '../agents/live.ts';
import type { DB } from '../db.ts';
import type { Deps, RunCtx, RunTool } from '../features/types.ts';
import { addNote } from '../notes.ts';
import { opensTurn } from '../opinion/turns.ts';
import { checkDaily } from './api.ts';
import { builtinsForAgents } from './builtins.ts';
import { startRun, waitFor } from './runs.ts';
import { FIND_K, FIND_MAX, findApps } from './search.ts';
import { getApp, getRun, listApps, updateRun, type RunRecord } from './store.ts';
import { missingSecrets } from './secrets.ts';

/** One app agents may run: the name they give it by, its run's app ("tpl:<id>" for a ready-made one), and what it is. */
export interface Usable {
  ref: string;
  app: string;
  slug: string;
  recipe: AppRecipe;
  own: boolean;
}

/** The apps agents in sessions may run now: yours first (by their address), then the ready-made ones installed. */
export function usableApps(db: DB): Usable[] {
  const own = listApps(db).filter((a) => a.agents && madeForSessions(a));
  const taken = new Set(own.map((a) => a.slug));
  return [
    ...own.map((a) => ({ ref: a.slug, app: a.id, slug: a.slug, recipe: a as AppRecipe, own: true })),
    ...builtinsForAgents(db).map((t) => ({ ref: taken.has(t.id) ? `tpl:${t.id}` : t.id, app: `tpl:${t.id}`, slug: t.id, recipe: t as AppRecipe, own: false })),
  ];
}

function findApp(list: Usable[], want: string): Usable | null {
  const w = want.trim();
  const low = w.toLowerCase();
  return list.find((u) => u.ref === w) ?? list.find((u) => u.app === w || u.slug === low || `tpl:${u.slug}` === low) ?? list.find((u) => u.recipe.name.toLowerCase() === low) ?? null;
}

const typeWord = (f: AppField) => (f.type === 'choice' ? (f.options ?? []).join(' | ') : f.type === 'yesno' ? 'yes/no' : f.type === 'long' ? 'long text' : f.type === 'file' ? 'a file’s path' : f.type);
const clipLine = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);

/** One app in a line, for the tool and the start-up note: how to name it, what it does, and what its form asks. */
function appLine(u: Usable, asks: boolean): string {
  const head = `${u.recipe.name}${u.own ? '' : ' (ready-made)'}${u.recipe.description ? ` — ${clipLine(u.recipe.description, 150)}` : ''}`;
  const form = asks && u.recipe.fields.length ? ` Asks ${u.recipe.fields.map((f) => `${f.id}${f.required && !f.default ? '' : '?'}: ${typeWord(f)}`).join(', ')}.` : '';
  return `- "${u.ref}": ${head}${form && !/[.!?…]$/.test(head) ? '.' : ''}${form}`;
}

/** Up to this many apps, the start-up note names them all; past it, the ones run most lately, and find_apps finds the rest. */
const NAMED = 10;

/** The apps by when they last ran (the user's own first among those never run). */
function byUse(db: DB, list: Usable[]): Usable[] {
  let last = new Map<string, number>();
  try {
    last = new Map((db.prepare("select app_id as id, max(created_at) as at from app_runs where source not in ('step', 'chat') group by app_id").all() as { id: string; at: number }[]).map((r) => [r.id, r.at]));
  } catch {}
  return [...list].sort((a, b) => (last.get(b.app) ?? 0) - (last.get(a.app) ?? 0) || Number(b.own) - Number(a.own));
}

/** What every session (not an app's own run) is told of the apps it may run, when there are some. */
export function useNote(db: DB): string | null {
  const list = usableApps(db);
  if (!list.length) return null;
  const head =
    "The user's apps (the Apps page) do jobs for them: small tools that look things up, work them out and show the answer in a view of their own (a forecast, a trip plan, a comparison, a quiz…). When the user asks for something an app does, run it with use_app instead of doing that work yourself: it asks them for what is missing on the app's own card and shows its answer in the conversation as the app shows it. Prefer their own apps to the ready-made ones that do the same.";
  if (list.length <= NAMED) return [head, ...list.map((u) => appLine(u, false))].join('\n');
  return [
    `${head} There are ${list.length}: when a request might be one of their jobs, call find_apps with a few words on what the user wants to get the best fits (with their forms), then pick one. Those they run most:`,
    ...byUse(db, list)
      .slice(0, 6)
      .map((u) => appLine(u, false)),
  ].join('\n');
}

// ---- the answers the agent gives ------------------------------------------------------------------------------

type Sent = { name: string; data: string };

/** A file for a file question, by its path (from the session's folder, or ~): read whole, 25 MB at most. */
function fileAt(v: string, cwd: string): Sent | null {
  const p = path.resolve(cwd, v.trim().replace(/^~(?=\/|$)/, os.homedir()));
  try {
    const st = fs.statSync(p);
    if (st.isFile() && st.size <= 25 << 20) return { name: path.basename(p), data: fs.readFileSync(p).toString('base64') };
  } catch {}
  return null;
}

const looksLikePath = (v: string) => !v.includes('\n') && v.length < 400 && (/^(~|\.{0,2})\//.test(v.trim()) || /^[\w.\- ]+\.[A-Za-z0-9]{1,6}$/.test(v.trim()));

/**
 * What the agent gave, as the form takes it: text for each question, yes or no, a choice as the form writes it, a
 * file read from its path (or a text given for it, as a file). `unread`: file questions whose path is not a file.
 */
export function intake(fields: AppField[], raw: Record<string, unknown>, cwd: string): { values: Record<string, string>; files: Record<string, Sent>; unknown: string[]; unread: string[] } {
  const values: Record<string, string> = {};
  const files: Record<string, Sent> = {};
  const unread: string[] = [];
  const byId = new Map(fields.map((f) => [f.id.toLowerCase(), f]));
  const unknown: string[] = [];
  const given: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    const f = byId.get(k.toLowerCase()) ?? fields.find((x) => x.label.toLowerCase() === k.toLowerCase());
    if (f) given[f.id] = v;
    else unknown.push(k);
  }
  for (const f of fields) {
    const v = given[f.id];
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) continue;
    if (f.type === 'yesno') values[f.id] = v === true || /^(yes|y|true|1|on)$/i.test(String(v)) ? 'Yes' : v === false || /^(no|n|false|0|off)$/i.test(String(v)) ? 'No' : String(v);
    else if (f.type === 'choice') {
      const s = Array.isArray(v) ? String(v[0] ?? '') : String(v);
      values[f.id] = (f.options ?? []).find((o) => o.toLowerCase() === s.trim().toLowerCase()) ?? s.trim();
    } else if (f.type === 'file') {
      const s = String(v);
      const file = looksLikePath(s) ? fileAt(s, cwd) : { name: `${f.id}.txt`, data: Buffer.from(s, 'utf8').toString('base64') };
      if (file) {
        files[f.id] = file;
        values[f.id] = file.name;
      } else unread.push(f.id);
    } else values[f.id] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return { values, files, unknown, unread };
}

/** Whether a question's answer is fine as given (a file question by its file). */
function fine(f: AppField, values: Record<string, string>, files: Record<string, Sent>): boolean {
  if (f.type === 'file') return !!files[f.id] || (!f.required && !values[f.id]);
  return !checkInputs([f], values[f.id] === undefined ? {} : { [f.id]: values[f.id] }).errors.length;
}

// ---- the card that asks -----------------------------------------------------------------------------------------

/** How long the card waits for the user, and the whole call for its answer (under Codex's ten minutes for a tool call). */
const CALL_MS = 540_000;

/** The item that began the session's turn now, which its card shows under. */
async function turnAnchor(d: Deps, key: string): Promise<string | undefined> {
  try {
    const items = (await d.sessions.timeline(key)).parser.items;
    for (let i = items.length - 1; i >= 0; i--) if (opensTurn(items[i])) return items[i].id;
  } catch {}
  return undefined;
}

/** A value as the card shows what the request said. */
const shown = (f: AppField, v: string) => (f.type === 'file' ? path.basename(v) : clipLine(v.replace(/\s+/g, ' '), 120));

/**
 * The app's card with the questions left: those it needs that the request did not answer (or answered in a way the
 * form does not take) and the optional ones it left out, each filled in as far as it can be. Gives the answers
 * merged into the request's, or why there are none.
 */
async function askUser(ctx: RunCtx, u: Usable, got: ReturnType<typeof intake>, raw: Record<string, unknown>, ms: number): Promise<{ values: Record<string, string>; files: Record<string, Sent> } | { why: 'nobody' | 'declined' | 'timeout' }> {
  const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
  if (!adapter) return { why: 'nobody' };
  const fields = u.recipe.fields;
  const asked = fields.filter((f) => !(f.id in got.values || f.id in got.files) || !fine(f, got.values, got.files));
  // Keys it needs that the vault does not have: the card asks for them too (they go straight to the vault).
  const keys = missingSecrets(ctx.deps.db, u.recipe);
  // Everything answered already (ask: true on a form the request filled in) and every key there: nothing to show.
  if (!asked.length && !keys.length) return { values: got.values, files: got.files };
  const given = fields.filter((f) => !asked.includes(f));
  const card: ApprovalRequest = {
    id: `app-${crypto.randomBytes(6).toString('hex')}`,
    kind: 'other',
    // The pages say what the card is for (an app's card, in the app's language).
    title: u.recipe.name,
    options: [
      { id: 'accept', label: 'Run it', style: 'primary' },
      { id: 'decline', label: 'Not now' },
    ],
    form: {
      fields: asked.map((f) => {
        const said = got.values[f.id] ?? (raw[f.id] !== undefined && raw[f.id] !== null ? String(raw[f.id]) : '');
        const keep = said && f.type !== 'file' && fine(f, { [f.id]: said }, {});
        // What the request said that the form does not take ("in May" for a date) shows under the question.
        const note = said && !keep && f.type !== 'file' ? `From your message: “${clipLine(said, 80)}”` : got.unread.includes(f.id) ? `“${clipLine(String(raw[f.id] ?? ''), 80)}” is not a file here: pick it` : '';
        return { ...f, ...(keep ? { default: checkInputs([f], { [f.id]: said }).values[f.id] } : {}), ...(note ? { help: [note, f.help].filter(Boolean).join(' · ') } : {}) };
      }),
    },
    app: {
      id: u.app,
      name: u.recipe.name,
      icon: u.recipe.icon,
      color: u.recipe.color,
      given: given.map((f) => ({ label: f.label, value: shown(f, got.values[f.id] ?? '') })).filter((g) => g.value),
      ...(keys.length ? { secrets: keys.map(({ name, label, help, url }) => ({ name, label, ...(help ? { help } : {}), ...(url ? { url } : {}) })) } : {}),
    },
    createdAt: Date.now(),
  };
  const merged = (a: ApprovalAnswer) => {
    const values = { ...got.values };
    const files = { ...got.files };
    for (const f of asked) {
      const v = String(a.form?.[f.id] ?? '').trim();
      delete values[f.id];
      delete files[f.id];
      if (!v) continue;
      if (f.type === 'file') {
        // A file picked on the card was saved ahead of the answer (POST /api/uploads): its path.
        const file = fileAt(v, ctx.cwd);
        if (file) {
          files[f.id] = file;
          values[f.id] = file.name;
        }
      } else values[f.id] = v;
    }
    return { values, files };
  };
  const check = (a: ApprovalAnswer) => {
    if (a.decision !== 'accept') return null;
    // The card saves the keys to the vault before it answers.
    const still = missingSecrets(ctx.deps.db, u.recipe);
    if (still.length) return `${still[0].label}: needed`;
    const m = merged(a);
    const wrong = fields.find((f) => !fine(f, m.values, m.files));
    if (!wrong) return null;
    if (wrong.type === 'file') return `${wrong.label}: pick the file`;
    return checkInputs([wrong], { [wrong.id]: m.values[wrong.id] ?? '' }).errors[0] ?? `${wrong.label}: needed`;
  };
  const limit = AbortSignal.timeout(Math.max(30_000, ms));
  const answer = await adapter.ask(card, { signal: ctx.signal ? AbortSignal.any([ctx.signal, limit]) : limit, check });
  if (!answer) return { why: limit.aborted ? 'timeout' : 'nobody' };
  if (answer.decision !== 'accept') return { why: 'declined' };
  return merged(answer);
}

// ---- what the agent hears -------------------------------------------------------------------------------------

/** A value made short enough to read: long texts by their start, long lists by their first items. */
function clip(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return v.length > 1500 ? `${v.slice(0, 1500)}… (${v.length.toLocaleString('en-US')} characters)` : v;
  if (Array.isArray(v)) return [...v.slice(0, 30).map((x) => clip(x, depth + 1)), ...(v.length > 30 ? [`… and ${v.length - 30} more`] : [])];
  if (v && typeof v === 'object') return depth > 6 ? '…' : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clip(x, depth + 1)]));
  return v;
}

/** A run as the agent reads it: how it went, what it gave (shortened), and its page. */
function runText(r: RunRecord): string {
  return JSON.stringify(
    {
      app: r.appName,
      run: r.id,
      status: r.status,
      ...(r.result ? { result: clip(r.result) } : {}),
      ...(r.reply && !r.result ? { reply: clip(r.reply) } : {}),
      ...(r.error ? { error: r.error } : {}),
      ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}),
      link: `/apps/runs/${r.id}`,
    },
    null,
    1,
  );
}

/** What the call answers once the run ended, or while it goes on. */
function endText(r: RunRecord): string {
  if (r.status === 'done') return `${r.appName} is done. The user sees its answer in its card here, as the app shows it: reply in a sentence or two (what came of it, what to look at or decide next) without repeating it.\n\n${runText(r)}`;
  if (r.status === 'stopped') return `${r.appName} was stopped before it finished.\n\n${runText(r)}`;
  if (r.status === 'failed') return `${r.appName} failed: ${r.error ?? 'it did not finish'}. Its card here says so. Tell the user, and offer what could help (a detail it lacked, trying again).\n\n${runText(r)}`;
  const waiting = r.status === 'waiting' ? ' It waits for the user’s answer to one of its questions, on its card.' : '';
  return `${r.appName} is still running (run ${r.id}); its card here shows it working.${waiting} Its answer comes to you as a message when it ends: end your turn now (say it is on its way), or call use_app with run "${r.id}" to wait for it.`;
}

/** Runs a use_app call is waiting for now: those it answers itself. */
const watching = new Set<string>();

/** A run an agent started for a session ended after its call stopped waiting: the session hears how it went. */
export async function tellAsker(d: Deps, r: RunRecord) {
  if (!r.askedBy || r.told || watching.has(r.id) || isActive(r.status)) return;
  updateRun(d.db, r.id, { told: true });
  const head =
    r.status === 'done'
      ? `[${r.appName} finished] The run you started for the user is done; its card with the answer shows right under your reply. Reply in a sentence or two (what came of it, what to look at), without repeating it.`
      : `[${r.appName} ${r.status === 'stopped' ? 'was stopped' : 'failed'}] The run you started for the user did not finish${r.error ? `: ${r.error}` : ''}.`;
  try {
    await d.sessions.deliverOrQueue(r.askedBy, `${head}\n\n${runText(r)}`);
  } catch {
    try {
      d.sessions.enqueue(r.askedBy, `${head}\n\n${runText(r)}`);
    } catch {}
  }
}

/** Waits for a run, at most `ms` (or until the agent gives up on the call), and says how it stands. */
async function waitAndSay(ctx: RunCtx, id: string, ms: number): Promise<string> {
  const { db } = ctx.deps;
  watching.add(id);
  try {
    let left = ms;
    let r = getRun(db, id);
    while (r && isActive(r.status) && left > 0 && !ctx.signal?.aborted) {
      const step = Math.min(left, 5_000);
      r = await waitFor(id, step);
      left -= step;
    }
  } finally {
    watching.delete(id);
  }
  // Read once no longer watched: a run that ends from here on is told by message (tellAsker), one ended before by this answer.
  const r = getRun(db, id);
  if (!r) return 'That run is gone.';
  if (!isActive(r.status)) updateRun(db, id, { told: true });
  return endText(r);
}

// ---- the tool -------------------------------------------------------------------------------------------------

/** find_apps: the apps most likely to do what the user asks, best first, with their forms, for use_app. */
export function findAppsTool(ctx: RunCtx): RunTool | null {
  const { db } = ctx.deps;
  if (!usableApps(db).length) return null;
  return {
    name: 'find_apps',
    annotations: { readOnlyHint: true },
    description: [
      "Finds the user's apps that may do what they ask (a weather outlook, a recipe from what is in the fridge, a trip plan, a comparison, a quiz…), best first, each with what its form asks, so you can run the best fit with use_app.",
      `Give query: what the user wants, in a few words with a synonym or two, in English (the ready-made apps' language) and in the user's own words too if they wrote in another language ("weather forecast rain this weekend Lisbon"). It searches by words and, when search by meaning is on, by meaning; you get the best ${FIND_K} (k for more or fewer). If none fits, do the work yourself.`,
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the user wants, in a few words.' },
        k: { type: 'number', description: `How many to get (1 to ${FIND_MAX}; ${FIND_K} unless set).` },
      },
      required: ['query'],
    },
    async run(args) {
      const list = usableApps(db);
      const query = String(args.query ?? '').trim();
      if (!query) return { text: 'Give query: what the user wants, in a few words.', isError: true };
      const { found, matched } = await findApps(db, list, query, Number(args.k) || FIND_K);
      if (!found.length) return 'The user has no apps agents can run.';
      const lines = found.map((f) => appLine(f.u, true));
      const head = matched
        ? `The apps that may do it, best first (${found.length} of ${list.length}; ? marks a question an app can do without). Run the one that fits with use_app; if none does, do the work yourself.`
        : `No app's words or meaning matched “${query}”. The user's apps, the ones run lately first (${found.length} of ${list.length}): run one with use_app only if it does what they asked; otherwise do the work yourself.`;
      return [head, ...lines].join('\n');
    },
  };
}

export function useAppTool(ctx: RunCtx): RunTool | null {
  const { db } = ctx.deps;
  const list = usableApps(db);
  if (!list.length) return null;
  const many = list.length > NAMED;
  return {
    name: 'use_app',
    description: [
      "Runs one of the user's apps for them, here in the conversation: use it when they ask for what one of their apps does, instead of doing that work yourself.",
      'Give app and inputs, the answers to its form: only what the user said or clearly meant (dates as YYYY-MM-DD, numbers, true or false for yes/no, a choice word for word, a file by its path). Leave out what they did not say: the user fills in what the app needs on its card here, and may leave its optional questions empty. ask: true shows the card even when nothing it needs is missing, to let them add the optional details.',
      'It runs once they have, and its answer shows in the conversation as the app shows it. The call waits for that answer (wait, in seconds: 300 unless set); a longer run comes back still running, and its answer comes to you as a message when it ends. Then reply in a sentence or two: the user sees the answer itself in its card.',
      many
        ? `The user has ${list.length} apps: find the one to run with find_apps, which gives each one's name to use here and what its form asks.`
        : `The apps (? marks a question it can do without):\n${list.map((u) => appLine(u, true)).join('\n')}`,
    ].join('\n\n'),
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', ...(many ? {} : { enum: list.map((u) => u.ref) }), description: many ? 'Which app, by the name find_apps gives it (in quotes there).' : 'Which app, as listed.' },
        inputs: { type: 'object', description: 'The answers to its form that the user gave, by the names listed.' },
        ask: { type: 'boolean', description: 'Show its card even when nothing it needs is missing.' },
        wait: { type: 'number', description: 'Most seconds to wait for its answer (1 to 540; 300 unless set).' },
        run: { type: 'string', description: 'A run started here before that was still running: waits for its answer.' },
      },
    },
    async run(args, c) {
      const started = Date.now();
      const wait = Math.max(1, Math.min(Number(args.wait) || 300, CALL_MS / 1000)) * 1000;
      // Waiting for a run this session started before.
      if (typeof args.run === 'string' && args.run.trim()) {
        const r = getRun(db, args.run.trim());
        if (!r || r.askedBy !== c.key) return { text: 'No run with that id was started from this session.', isError: true };
        return waitAndSay(c, r.id, wait);
      }
      const now = usableApps(db);
      const u = findApp(now, String(args.app ?? ''));
      if (!u) {
        // Too many to list: the nearest by name, and find_apps for the rest.
        const near = now.length > NAMED ? (await findApps(db, now, String(args.app ?? ''), 8)).found.map((f) => f.u) : now;
        return { text: `There is no app “${String(args.app ?? '')}” for agents to run here. ${now.length > NAMED ? 'Some with names like it' : 'The apps'}: ${near.map((x) => `"${x.ref}" (${x.recipe.name})`).join(', ') || 'none'}.${now.length > NAMED ? ' find_apps finds the others.' : ''}`, isError: true };
      }
      const raw = args.inputs && typeof args.inputs === 'object' && !Array.isArray(args.inputs) ? (args.inputs as Record<string, unknown>) : {};
      let got = intake(u.recipe.fields, raw, c.cwd);
      // What it needs and lacks (or the user may add to, when asked): the app's card.
      if (u.recipe.fields.some((f) => !fine(f, got.values, got.files)) || args.ask === true || missingSecrets(db, u.recipe).length) {
        const a = await askUser(c, u, got, raw, CALL_MS - 60_000);
        if ('why' in a) {
          if (a.why === 'declined') return `The user closed ${u.recipe.name}'s card without running it. Ask in words if you still need it, or go on without it.`;
          if (a.why === 'timeout') return { text: `The user did not fill in ${u.recipe.name}'s card in time, so it was withdrawn. Ask for what it needs in your reply instead.`, isError: true };
          return { text: `Nobody can fill in ${u.recipe.name}'s card now (this session is not running in the app): ask for what it needs in your reply instead.`, isError: true };
        }
        got = { ...got, values: a.values, files: a.files, unread: [] };
      }
      let r: RunRecord;
      try {
        if (u.own) {
          const a = getApp(db, u.app);
          if (!a) return { text: 'That app is gone.', isError: true };
          checkDaily(db, a);
        }
        r = startRun({ app: u.app, slug: u.slug, recipe: u.recipe, source: 'session', inputs: got.values, ...(Object.keys(got.files).length ? { files: got.files } : {}), askedBy: c.key });
      } catch (e) {
        return { text: `${u.recipe.name} could not start: ${(e as Error).message}`, isError: true };
      }
      addNote(db, { key: c.key, kind: 'app-run', anchor: await turnAnchor(c.deps, c.key), data: { run: r.id, app: u.app, name: u.recipe.name, icon: u.recipe.icon, color: u.recipe.color } });
      const extra = got.unknown.length ? `\n(Its form has no ${got.unknown.map((k) => `“${k}”`).join(', ')}: left out.)` : '';
      return (await waitAndSay(c, r.id, Math.min(wait, CALL_MS - (Date.now() - started)))) + extra;
    },
  };
}
