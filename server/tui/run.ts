// `hydor run`: one request, no questions asked. It starts a session with the message, follows it until the work is
// done (its turn ended, no helper works or still owes its reply, none of Claude Code's own helpers works in the
// background, its own or a helper's, and nothing waits in its queue: a lead that ended its turn to wait for them is woken
// by their replies or their ends, so the turn after them is waited for), prints the agent's last
// reply, and ends. Progress goes to stderr as short lines when that is a terminal. An approval or a question with
// nobody to answer stops it (exit 3); --json prints one object at the end, --stream-json a line per event.
// Exit codes: 0 done, 1 the session failed or the server refused, 2 bad usage, 3 it needs an answer, 124 timed out,
// 130 interrupted (Ctrl+C stops the turn first).
import { childReplyOf } from '../../shared/children.ts';
import type { SessionNote } from '../../shared/features.ts';
import type { LiveState, TimelineItem } from '../../shared/types.ts';
import { UsageError, type Opts } from './args.ts';
import { ApiError, enc, spentOf, type Conn } from './client.ts';
import { readStdin, whyNoReply } from './commands.ts';
import { INDENT, modelLabel, textLines, type Look } from './lines.ts';
import { busy, lastReply, Printer, SessionView } from './session.ts';
import { catalogOf, newStartId, planStart, startBody, tiersOf, type Boot } from './start.ts';
import { colorWanted, makePaint } from './term.ts';

export interface RunResult {
  key: string;
  url: string;
  status: 'done' | 'failed' | 'needs-answer' | 'timeout' | 'interrupted';
  reply: string;
  model?: string;
  costUsd: number;
  tokens: { in: number; out: number; cached: number };
  durationMs: number;
  turns: number;
  children: { key: string; title: string; label: string; tier?: string; costUsd: number; status: string }[];
  error?: string;
  /** What it waits for, when it needs an answer. */
  asks?: string;
}

const CODES: Record<RunResult['status'], number> = { done: 0, failed: 1, 'needs-answer': 3, timeout: 124, interrupted: 130 };

/** The message: the words given, else stdin when something is piped in. */
export async function messageOf(o: Opts): Promise<string> {
  const words = o.args.join(' ').trim();
  if (words) return words;
  if (!process.stdin.isTTY) return (await readStdin()).trim();
  return '';
}

/** How the run stands now: null while it goes on. */
function verdict(view: SessionView, since: { settled?: number }): Pick<RunResult, 'status' | 'error' | 'asks'> | null {
  const l = view.live;
  const ask = view.overlay.approvals[0];
  if (ask) return { status: 'needs-answer', asks: ask.title };
  const helper = view.helperWaiting();
  if (helper) return { status: 'needs-answer', asks: `The helper “${helper.note.title}” needs an answer` };
  if (l?.status === 'error') return { status: 'failed', error: l.error ?? 'The agent stopped with an error' };
  if (!view.settled()) {
    since.settled = undefined;
    return null;
  }
  const turn = view.lastTurn();
  const now = Date.now();
  since.settled ??= now;
  // Settled a moment (a helper's reply may be on its way), with the turn's end in the conversation; or settled a while.
  const replied = !!lastReply(view.items) || view.items.some((i) => i.kind === 'turn');
  // Settled with nothing to show for it a few seconds on: it never got going (a usage limit, an error at the start).
  if (!replied && now - since.settled >= 3000) return { status: 'failed', error: '' };
  if (!(turn && now - since.settled >= 1200) && now - since.settled < 15_000) return null;
  if (l?.status === 'exited' && l.error) return { status: 'failed', error: l.error };
  if (turn?.status === 'failed') return { status: 'failed', error: lastError(view.items) ?? 'The turn failed' };
  if (turn?.status === 'interrupted') return { status: 'failed', error: view.notes.some((n) => n.kind === 'budget') ? 'It was stopped at its spending cap' : 'Its turn was stopped' };
  return { status: 'done' };
}

/** The last error the conversation shows. */
function lastError(items: TimelineItem[]): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === 'system' && it.level === 'error') return it.text;
    if (it.kind === 'user') return undefined;
  }
}

/** The result object (--json, and the last line of --stream-json). */
function resultOf(conn: Conn, view: SessionView, v: Pick<RunResult, 'status' | 'error' | 'asks'>, t0: number, turnsBefore: number): RunResult {
  const s = view.summary;
  const helpers = [...view.helpers.values()];
  const cost = (s?.stats.costUsd ?? 0) + helpers.reduce((a, h) => a + (h.summary?.stats.costUsd ?? 0), 0);
  const tok = [s?.stats, ...helpers.map((h) => h.summary?.stats)].filter(Boolean);
  const replies = new Map<string, string>();
  for (const it of view.items) if (it.kind === 'user') {
    const r = childReplyOf(it.text);
    if (r) replies.set(r.key, r.ended);
  }
  return {
    key: view.key,
    url: conn.url(view.key),
    status: v.status,
    reply: lastReply(view.items),
    model: view.live?.model ?? s?.model,
    costUsd: Math.round(cost * 10_000) / 10_000,
    tokens: { in: tok.reduce((a, x) => a + (x!.tokensIn ?? 0), 0), out: tok.reduce((a, x) => a + (x!.tokensOut ?? 0), 0), cached: tok.reduce((a, x) => a + (x!.tokensCached ?? 0), 0) },
    durationMs: Date.now() - t0,
    turns: view.items.filter((i) => i.kind === 'turn').length - turnsBefore,
    children: helpers.map((h) => ({
      key: h.key,
      title: h.note.title,
      label: h.note.label,
      ...(h.note.tier ? { tier: h.note.tier } : {}),
      costUsd: h.summary?.stats.costUsd ?? 0,
      status: busy(h.summary?.live) ? 'working' : h.replaced ? 'stepped-up' : replies.get(h.key) === 'failed' ? 'failed' : replies.get(h.key) === 'stopped' ? 'stopped' : 'done',
    })),
    ...(v.error ? { error: v.error } : {}),
    ...(v.asks ? { asks: v.asks } : {}),
  };
}

/** A line of --stream-json. */
const emit = (v: unknown) => process.stdout.write(`${JSON.stringify(v)}\n`);

/** Runs one request: the exit code. */
export async function runCommand(conn: Conn, o: Opts, boot: Boot, message?: string): Promise<number> {
  const text = message ?? (await messageOf(o));
  if (!text) throw new UsageError('Give the request: hydor run "…" (or pipe it in)');
  const errLook: Look = { p: makePaint(colorWanted(process.stderr, o.noColor)), width: process.stderr.columns || 100, home: boot.home, verbose: o.verbose };
  const progress = !o.quiet && !!process.stderr.isTTY;
  const tiers = await tiersOf(conn);
  const plan = await planStart(conn, o, boot, tiers);
  const t0 = Date.now();
  const fail = (error: string, status: RunResult['status'] = 'failed', key = '') => {
    const r: RunResult = { key, url: key ? conn.url(key) : '', status, reply: '', costUsd: 0, tokens: { in: 0, out: 0, cached: 0 }, durationMs: Date.now() - t0, turns: 0, children: [], error };
    if (o.json) emit(r);
    else if (o.streamJson) emit({ type: 'result', ...r });
    else process.stderr.write(`${errLook.p.red('✗')} ${error}\n`);
    return CODES[status];
  };
  let key: string;
  try {
    key = (await conn.api<{ key: string }>('POST', '/api/sessions', startBody(plan, text, newStartId()), { timeoutMs: 120_000 })).key;
  } catch (e) {
    return fail(`It did not start: ${(e as Error).message}`);
  }
  const view = new SessionView(conn, key, { poll: 2000 });
  const models = (await catalogOf(conn, plan.agent, plan.acpAgent)).models;
  const look: Look = { ...errLook, models, cwd: plan.cwd };
  const printer = new Printer(look, { brief: true });
  printer.echo(text);
  const sent = new Map<string, string>();
  const sentNotes = new Set<string>();
  let lastLive = '';
  const stream = () => {
    if (!o.streamJson) return;
    for (const it of view.items) {
      const j = JSON.stringify(it);
      if (sent.get(it.id) === j) continue;
      sent.set(it.id, j);
      emit({ type: 'item', item: it });
    }
    for (const n of view.notes as SessionNote[]) {
      if (sentNotes.has(n.id)) continue;
      sentNotes.add(n.id);
      emit({ type: 'note', note: n });
    }
    const l = JSON.stringify(view.live);
    if (l !== lastLive) {
      lastLive = l;
      emit({ type: 'live', live: view.live as LiveState | null });
    }
  };
  const showProgress = () => {
    if (!progress) return;
    const { lines } = printer.take(view);
    if (lines.length) process.stderr.write(`${lines.filter((l) => l !== '').join('\n')}\n`);
  };
  try {
    await view.open();
  } catch (e) {
    return fail(`Could not follow it: ${(e as Error).message}`, 'failed', key);
  }
  if (progress) process.stderr.write(`${look.p.dim(`${INDENT}Working in ${conn.url(key)}`)}\n`);
  const since: { settled?: number } = {};
  const outcome = await new Promise<Pick<RunResult, 'status' | 'error' | 'asks'>>((resolve) => {
    let over = false;
    const finish = (v: Pick<RunResult, 'status' | 'error' | 'asks'>) => {
      if (over) return;
      over = true;
      clearInterval(tick);
      if (timer) clearTimeout(timer);
      view.off('change', check);
      process.off('SIGINT', onInt);
      resolve(v);
    };
    const check = () => {
      stream();
      showProgress();
      const v = verdict(view, since);
      if (v) finish(v);
    };
    const tick = setInterval(check, 1000);
    const stopAll = async () => {
      await conn.api('POST', `/api/sessions/${enc(key)}/interrupt`, {}).catch(() => {});
      await Promise.all(view.helpersWorking().map((h) => conn.api('POST', `/api/sessions/${enc(h.key)}/interrupt`, {}).catch(() => {})));
      // Its helpers in the background would wake the agent again later: stopped too (a dev server left running is not).
      await Promise.all(view.background().map(({ key, task }) => conn.api('POST', `/api/sessions/${enc(key)}/tasks/${encodeURIComponent(task.id)}/stop`, {}).catch(() => {})));
    };
    const timer = o.timeout
      ? setTimeout(async () => {
          await stopAll();
          finish({ status: 'timeout', error: `It took longer than ${o.timeout} s, so its turn was stopped` });
        }, o.timeout * 1000)
      : null;
    const onInt = async () => {
      if (progress) process.stderr.write(`${look.p.dim('Stopping…')}\n`);
      await stopAll();
      finish({ status: 'interrupted', error: 'Interrupted: its turn was stopped' });
    };
    process.on('SIGINT', onInt);
    view.on('change', check);
    check();
  });
  // The last lines of the transcript land a moment after the turn ends.
  if (outcome.status === 'done') await view.refresh().catch(() => {});
  if (outcome.status === 'failed' && !outcome.error) outcome.error = await whyNoReply(conn, view, plan.agent);
  stream();
  showProgress();
  const r = resultOf(conn, view, outcome, t0, 0);
  // What it cost as the server adds it up (its tokens at their price until the agent's own figure lands), helpers and all.
  const spent = key ? await spentOf(conn, key) : null;
  if (spent) r.costUsd = Math.round(spent.spentUsd * 10_000) / 10_000;
  for (const c of r.children) {
    const own = await spentOf(conn, c.key);
    if (own) c.costUsd = Math.round(own.ownUsd * 10_000) / 10_000;
  }
  view.close();
  if (o.json) emit(r);
  else if (o.streamJson) emit({ type: 'result', ...r });
  else {
    if (r.reply) {
      if (process.stdout.isTTY) {
        const outLook: Look = { p: makePaint(colorWanted(process.stdout, o.noColor)), width: process.stdout.columns || 100, home: boot.home, models };
        process.stdout.write(`${textLines(r.reply, outLook).map((l) => l.replace(/^ {2}/, '')).join('\n')}\n`);
      } else process.stdout.write(`${r.reply}\n`);
    }
    const p = errLook.p;
    if (r.status === 'needs-answer') process.stderr.write(`${p.yellow('?')} It needs an answer: ${r.asks}.\n  Answer it in the app (${r.url}) or here: hydor resume ${key}\n`);
    else if (r.status !== 'done') process.stderr.write(`${p.red('✗')} ${r.error}\n`);
    else if (progress) {
      const bits = [`${Math.round(r.durationMs / 100) / 10} s`, r.costUsd ? `$${r.costUsd.toFixed(2)}` : '', modelLabel(r.model, models), r.children.length ? `${r.children.length} ${r.children.length === 1 ? 'helper' : 'helpers'}` : ''].filter(Boolean);
      process.stderr.write(`${p.green('✓')} ${p.dim(bits.join(' · '))}\n`);
    }
  }
  return CODES[r.status];
}

