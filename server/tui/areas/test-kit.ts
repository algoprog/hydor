// For an area's test (`<area>-test.ts`): a fake connection that answers the API's routes from a table and records
// every call, and a Ctx that collects what a verb prints. Not a test itself (the runner only runs *-test.ts).
//   const { conn, calls } = fakeConn({ 'GET /api/projects': { spaces: [...] }, 'DELETE /api/projects/sp1': { ok: true } });
//   const t = run(conn, area, 'show web', { json: true });   // the words after the area, the options by name
import { parseArgv } from '../args.ts';
import { ApiError, type Conn } from '../client.ts';
import type { Look } from '../lines.ts';
import { makePaint } from '../term.ts';
import { defaultVerb } from './index.ts';
import { runVerb, UsageError, usageLine, type Ctx, type PickItem } from './kit.ts';

export interface Call {
  method: string;
  path: string;
  body?: unknown;
}

/** A route's answer: a value, or a function of the request (its body); an ApiError to refuse. */
export type Answer = unknown | ((body: unknown, path: string) => unknown);

/** A connection whose `api` answers `"METHOD /path"` from the table (the path as called, query and all), or 404s. */
export function fakeConn(routes: Record<string, Answer>, o: { here?: boolean } = {}): { conn: Conn; calls: Call[] } {
  const calls: Call[] = [];
  const conn: Conn = {
    base: 'http://fake',
    local: true,
    here: o.here ?? true,
    version: '0',
    async api(method: string, p: string, body?: unknown) {
      calls.push({ method, path: p, ...(body !== undefined ? { body } : {}) });
      const key = `${method} ${p}`;
      if (!(key in routes)) throw new ApiError(404, `No fake route ${key}`);
      const a = routes[key];
      const r = typeof a === 'function' ? (a as (b: unknown, p: string) => unknown)(body, p) : a;
      if (r instanceof Error) throw r;
      return r as never;
    },
    events: () => {
      throw new Error('no events in a fake');
    },
    url: (k) => `http://fake${k ? `/s/${k}` : ''}`,
    close() {},
  };
  return { conn, calls };
}

/** What a verb run through `run` printed, said and asked. */
export interface Ran {
  /** Lines printed with ctx.out, joined by newlines. */
  out: string;
  /** Values printed with ctx.json. */
  json: unknown[];
  /** The questions confirm was asked (not when --yes answered). */
  asked: string[];
  /** The titles pick was asked. */
  picked: string[];
  /** The exit code (a UsageError is thrown, as in main.ts, to be caught by the test). */
  code: number;
  /** The text edit() was handed, in order. */
  edited: string[];
  /** The prompts the hidden question (secret) was asked. */
  secretAsked: string[];
}

export interface Answers {
  /** confirm's answer (default true; --yes answers for itself). */
  confirm?: boolean;
  /** What pick returns (default: the first item). */
  pick?: string | null;
  /** What the editor returns (null: unchanged). */
  edit?: string | null;
  /** The files readText reads, by path. */
  files?: Record<string, string>;
  /** What a hidden prompt (secret) returns: a string, or null for nobody there (default: null). */
  secret?: string | null;
  /** Whether a person is there (default false: piped). */
  interactive?: boolean;
  /** Whether lists are cut to the width (default false). */
  fit?: boolean;
}

/** A Ctx that collects. */
export function testCtx(conn: Conn, usage: string, o: ReturnType<typeof parseArgv>, a: Answers = {}): { ctx: Ctx; ran: Ran } {
  const ran: Ran = { out: '', json: [], asked: [], picked: [], code: 0, edited: [], secretAsked: [] };
  const look: Look = { p: makePaint(false), width: 80, home: '/home/u' };
  const ctx: Ctx = {
    conn,
    look,
    usage,
    interactive: a.interactive ?? false,
    fit: a.fit ?? false,
    o,
    out(lines) {
      ran.out += `${(Array.isArray(lines) ? lines : [lines]).join('\n')}\n`;
    },
    json(value) {
      ran.json.push(value);
    },
    async confirm(q) {
      // As the terminal's: --yes says yes; with nobody to ask, and no answer set up, it refuses.
      if (o.yes) return true;
      if (!ctx.interactive && a.confirm === undefined) throw new UsageError(`${q.replace(/\?$/, '')}: nobody to ask here, so add -y to say yes`);
      ran.asked.push(q);
      return a.confirm ?? true;
    },
    async edit(text) {
      ran.edited.push(text);
      return a.edit === undefined ? null : a.edit;
    },
    async readText({ file, current }) {
      if (file) {
        const t = a.files?.[file];
        if (t === undefined) throw new Error(`no fake file ${file}`);
        return t;
      }
      if (!ctx.interactive) throw new UsageError('There is no terminal for the editor: give the text with --file <path>');
      return ctx.edit(current ?? '');
    },
    async secret(prompt) {
      ran.secretAsked.push(prompt);
      return a.secret === undefined ? null : a.secret;
    },
    async pick(title, items: PickItem[]) {
      ran.picked.push(title);
      return a.pick === undefined ? (items[0]?.value ?? null) : a.pick;
    },
  };
  return { ctx, ran };
}

/**
 * Runs `hydor <words>` (the area's words and options, as typed) through the real parser and `runVerb`, against the fake
 * connection. UsageErrors and ApiErrors are thrown, as main.ts catches them.
 */
export async function run(conn: Conn, words: string[], a: Answers = {}): Promise<Ran> {
  const o = parseArgv(words);
  if (!o.route) throw new Error(`not an area: ${words.join(' ')}`);
  const verb = o.route.verb ?? defaultVerb(o.route.area);
  const { ctx, ran } = testCtx(conn, usageLine(o.route.area, verb), o, a);
  ran.code = await runVerb(ctx, o.route.area, verb, o.args, o.route.values);
  return ran;
}
