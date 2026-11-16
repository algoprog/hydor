// Trying an agent's examples: each in a throwaway session started as the agent (on its tier, with its tools, in an
// empty folder of its own, archived so it stays out of the list), as a test that sends nothing (calls to connected apps
// that would act are kept as ones it would have sent; what it hands back goes nowhere but the try). When its turn
// ends, its checks are read: a sentence by the helper model against its reply and what it handed back, a rule as an
// app's check is ({{reply}}, {{result.field}}). Nothing runs by itself: only Try the examples (or a call to it) starts
// them, and the page says first what that costs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { asText, evalRule, lookup, refsIn, type Scope } from '../../shared/app-manifest.ts';
import { exampleName, isRuleCheck, type AgentCheck, type AgentExample, type AgentExampleRun, type AgentExamplesState, type ExampleEstimate } from '../../shared/agent-files.ts';
import { agentMode, assistantExtra, type Assistant } from '../../shared/assistants.ts';
import { tierLabel } from '../../shared/tiers.ts';
import type { Agent } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { ownSpend } from '../budget/spend.ts';
import type { DB } from '../db.ts';
import type { Deps, TurnInfo } from '../features/types.ts';
import { helperJson } from '../helper.ts';
import { lastTurn } from '../opinion/turns.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { addExampleRun, exampleRun, exampleRuns, latestTries, openExampleRuns, setExampleRun } from './exampleRuns.ts';
import { monthSpend } from './rules.ts';
import { findAssistant } from './store.ts';
import { currentVersion, keepVersion } from './versions.ts';

/** What a session that tries an example keeps in its settings (SessionExtra.agentExample). */
export interface ExampleMark {
  agent: string;
  run: string;
  example: string;
}

export const exampleMark = (db: DB, key: string): ExampleMark | null => {
  const m = sessionExtra(db, key).agentExample as ExampleMark | undefined;
  return m && typeof m === 'object' && typeof m.run === 'string' ? m : null;
};

// ---- the checks ----------------------------------------------------------------------------------------------

/** Reads sentences against what a try gave: one verdict for each, in order. */
export type Judge = (db: DB, q: { agent: string; message: string; reply: string; result?: Record<string, unknown>; checks: string[] }) => Promise<{ ok: boolean; why?: string }[]>;

const JUDGE_SYSTEM = [
  'You check what an agent did with a message against what it must do. You get the message, its reply, what it handed back (when it did) and a numbered list of checks, each a sentence about what a good answer does.',
  'For each check, decide whether the reply and what it handed back meet it. Judge only by what you are given: when they do not show something, it does not hold. Be fair, not pedantic: a check about the gist holds when the gist is there.',
  'Answer with one JSON object and nothing else: {"checks": [{"ok": true or false, "why": "one short sentence saying what you saw"}]}, one entry per check, in their order.',
].join(' ');

const helperJudge: Judge = async (db, q) => {
  const prompt = [
    `The agent: ${q.agent}`,
    `The message it got:\n<message>\n${q.message}\n</message>`,
    `Its reply:\n<reply>\n${q.reply.slice(0, 30_000) || '(no reply)'}\n</reply>`,
    q.result ? `What it handed back:\n<result>\n${JSON.stringify(q.result, null, 2).slice(0, 20_000)}\n</result>` : '',
    `The checks:\n${q.checks.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const raw = await helperJson<{ checks?: { ok?: unknown; why?: unknown }[] }>(db, { system: JUDGE_SYSTEM, prompt, timeoutMs: 90_000 }, 'a verdict on each check');
  const got = Array.isArray(raw.checks) ? raw.checks : [];
  return q.checks.map((_c, i) => ({ ok: got[i]?.ok === true, ...(typeof got[i]?.why === 'string' ? { why: String(got[i].why).slice(0, 300) } : got[i] ? {} : { why: 'The helper model gave no verdict on it.' }) }));
};

let judge: Judge = helperJudge;
/** For tests: another judge in place of the helper model. */
export const setJudge = (j: Judge | null) => void (judge = j ?? helperJudge);

/** How each of an example's checks went on what a try gave: rules read here, sentences by the judge. */
export async function readChecks(db: DB, a: Assistant, ex: AgentExample, got: { reply: string; result?: Record<string, unknown> }): Promise<AgentCheck[]> {
  const out: (AgentCheck | null)[] = [];
  const sentences: { at: number; check: string }[] = [];
  const scope: Scope = { inputs: {}, steps: { result: got.result ?? {} }, vars: { reply: got.reply } };
  // An agent with fields hands back a result: a try that ends without one does not pass.
  if (a.output?.fields?.length) out.push(got.result ? { check: 'It hands back a result', ok: true } : { check: 'It hands back a result', ok: false, why: 'It ended without handing back a result.' });
  for (const check of ex.checks ?? []) {
    if (!isRuleCheck(check)) {
      sentences.push({ at: out.length, check });
      out.push(null);
      continue;
    }
    try {
      if (evalRule(check, scope)) out.push({ check, ok: true });
      else {
        const seen = refsIn(check).map((p) => `${p} is ${asText(lookup(p, scope).value, 80) || 'empty'}`);
        out.push({ check, ok: false, ...(seen.length ? { why: seen.join('; ') } : {}) });
      }
    } catch (e) {
      out.push({ check, ok: false, why: (e as Error).message });
    }
  }
  if (sentences.length) {
    const verdicts = await judge(db, { agent: a.name, message: ex.message, reply: got.reply, result: got.result, checks: sentences.map((s) => s.check) });
    sentences.forEach((s, i) => (out[s.at] = { check: s.check, ok: verdicts[i]?.ok === true, ...(verdicts[i]?.why ? { why: verdicts[i].why } : {}) }));
  }
  return out.filter((c): c is AgentCheck => !!c);
}

// ---- what it costs -------------------------------------------------------------------------------------------

const cents = (n: number) => Math.round(n * 100) / 100;

/** What trying `count` of an agent's examples comes to: from what its last tries cost, else what its sessions cost this month. */
export function estimateTries(db: DB, a: Assistant, count: number): ExampleEstimate {
  const spent = monthSpend(db, a.id);
  const tried = exampleRuns(db, a.id, 40).filter((r) => r.endedAt && (r.costUsd ?? 0) > 0).slice(0, 10);
  const est: ExampleEstimate = { count, ...(a.tier ? { tier: tierLabel(a.tier) } : {}) };
  if (tried.length) {
    est.perRun = tried.reduce((s, r) => s + (r.costUsd ?? 0), 0) / tried.length;
    est.from = 'tries';
  } else if (spent.sessions && spent.usd > 0) {
    est.perRun = spent.usd / spent.sessions;
    est.from = 'sessions';
  }
  if (est.perRun !== undefined) {
    est.perRun = Math.max(0.01, cents(est.perRun));
    est.total = cents(est.perRun * count);
  }
  if (a.budgetUsd) est.budgetLeft = Math.max(0, cents(a.budgetUsd - spent.usd));
  return est;
}

// ---- trying them ---------------------------------------------------------------------------------------------

const changed = (d: Pick<Deps, 'broadcast'>, id: string) => d.broadcast({ t: 'feature', id: 'assistants', data: { examples: id } });

/** The version an agent is at, kept now when it has none yet (an agent saved before versions were kept). */
function versionNow(db: DB, a: Assistant): number {
  return currentVersion(db, a.id) || keepVersion(db, null, a, 'before', 'As it was before versions were kept.') || currentVersion(db, a.id);
}

/**
 * Starts a try of each of an agent's examples (or those named), each in a throwaway session of its own; those already
 * being tried are left to finish. `use` is the program picked on the start page, for an agent that suggests none.
 */
export async function tryExamples(d: Deps, a: Assistant, o: { only?: string[]; use?: { agent?: Agent; acpAgent?: string } } = {}): Promise<AgentExampleRun[]> {
  if (a.builtin) throw new HttpError(400, 'Built-in agents have no examples: duplicate one to give it some');
  const list = (a.examples ?? []).filter((e) => !o.only?.length || o.only.includes(e.id));
  if (!list.length) throw new HttpError(400, o.only?.length ? 'It has no such example' : `${a.name} has no examples yet: add one first`);
  const going = new Set(openExampleRuns(d.db).filter((r) => r.agent === a.id).map((r) => r.example));
  const version = versionNow(d.db, a);
  const agent: Agent = a.agent ?? o.use?.agent ?? 'claude';
  const acpAgent = agent === 'acp' ? (a.agent ? a.acpAgent : o.use?.acpAgent) || 'console' : undefined;
  const out: AgentExampleRun[] = [];
  for (const ex of list) {
    if (going.has(ex.id)) continue;
    const id = crypto.randomBytes(6).toString('hex');
    try {
      const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-agent-example-'));
      const key = await d.sessions.create({
        agent,
        acpAgent,
        cwd,
        prompt: ex.message,
        title: `Example: ${exampleName(ex)} · ${a.name}`,
        remember: false,
        // Its own model on its own program, unless it thinks with a tier (whose model the start picks).
        ...(a.agent && a.model && !a.tier ? { model: a.model } : {}),
        mode: agentMode(a.mode, agent, acpAgent) ?? (agent === 'claude' ? 'default' : agent === 'codex' ? 'auto' : undefined),
        extra: { ...assistantExtra(a), agentExample: { agent: a.id, run: id, example: ex.id } satisfies ExampleMark },
      });
      // A throwaway: it stays out of the session list, and opens from the example.
      d.sessions.setFlags(key, { archived: true });
      addExampleRun(d.db, { id, agent: a.id, example: ex.id, version, key, status: 'running' });
    } catch (e) {
      addExampleRun(d.db, { id, agent: a.id, example: ex.id, version, status: 'error', error: (e as Error).message || 'It could not start' });
    }
    out.push(exampleRun(d.db, id)!);
  }
  changed(d, a.id);
  return out;
}

const judging = new Set<string>();

/** A try's session ended its turn: its checks are read, and how it went is kept. */
export async function exampleTurnEnded(d: Deps, t: Pick<TurnInfo, 'key'> & { status?: TurnInfo['status'] }): Promise<void> {
  const mark = exampleMark(d.db, t.key);
  if (!mark) return;
  const run = exampleRun(d.db, mark.run);
  if (!run || (run.status !== 'running' && run.status !== 'waiting') || judging.has(run.id)) return;
  judging.add(run.id);
  try {
    const tl = await d.sessions.timeline(t.key).catch(() => null);
    await tl?.readMore?.().catch(() => {});
    const turn = lastTurn(tl?.parser.items ?? []);
    const reply = turn?.reply ?? '';
    const costUsd = Math.round(ownSpend(d.db, t.key).usd * 10_000) / 10_000;
    const a = findAssistant(d.db, run.agent);
    const ex = a?.examples?.find((e) => e.id === run.example);
    if (!a || !ex) return void setExampleRun(d.db, run.id, { status: 'error', error: 'The example is gone.', reply, costUsd, endedAt: Date.now() });
    if (!reply && (t.status === 'error' || turn?.status === 'failed' || turn?.error))
      return void setExampleRun(d.db, run.id, { status: 'error', error: turn?.error || 'It stopped before it answered.', costUsd, endedAt: Date.now() });
    setExampleRun(d.db, run.id, { status: 'judging', reply });
    changed(d, a.id);
    const now = exampleRun(d.db, run.id)!;
    try {
      const checks = await readChecks(d.db, a, ex, { reply, result: now.result });
      setExampleRun(d.db, run.id, { status: checks.every((c) => c.ok) ? 'passed' : 'failed', checks, costUsd, endedAt: Date.now() });
    } catch (e) {
      setExampleRun(d.db, run.id, { status: 'error', error: `Its checks could not be read: ${(e as Error).message}`, costUsd, endedAt: Date.now() });
    }
  } finally {
    judging.delete(run.id);
    changed(d, run.agent);
  }
}

const BUSY = new Set(['starting', 'working']);

/**
 * An agent's examples as its page shows them: the latest try of each (one waiting on you in its session says so; one
 * whose session ended without its turn being seen, after a restart, is read now), what a try costs, and the version
 * they were last tried with when the agent changed since.
 */
export function examplesState(d: Deps, a: Assistant): AgentExamplesState {
  const version = currentVersion(d.db, a.id);
  const ids = new Set((a.examples ?? []).map((e) => e.id));
  const runs = latestTries(d.db, a.id)
    .filter((r) => ids.has(r.example))
    .map((r): AgentExampleRun => {
      if (r.status !== 'running' && r.status !== 'waiting') return r;
      const live = r.key ? d.sessions.summary(r.key)?.live : undefined;
      if (live?.status === 'waiting') return { ...r, status: 'waiting' };
      if (!live || !BUSY.has(live.status)) {
        if (r.key && Date.now() - r.startedAt > 20_000) void exampleTurnEnded(d, { key: r.key }).catch(() => {});
        return r;
      }
      return { ...r, status: 'running' };
    });
  const tried = runs.length ? Math.max(...runs.map((r) => r.version)) : 0;
  return {
    runs,
    estimate: estimateTries(d.db, a, a.examples?.length ?? 0),
    version,
    ...(tried && version && tried !== version ? { changedSince: tried } : {}),
  };
}

/** How its examples went with each version: those tried with it, the latest try of each example. */
export function examplesByVersion(db: DB, agent: string): Map<number, { tried: number; passed: number }> {
  const seen = new Set<string>();
  const out = new Map<number, { tried: number; passed: number }>();
  for (const r of exampleRuns(db, agent)) {
    if (r.status !== 'passed' && r.status !== 'failed' && r.status !== 'error') continue;
    const k = `${r.version}:${r.example}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const v = out.get(r.version) ?? { tried: 0, passed: 0 };
    v.tried++;
    if (r.status === 'passed') v.passed++;
    out.set(r.version, v);
  }
  return out;
}
