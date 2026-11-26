// The neutral judge: it scores one app built from one brief, and knows nothing of how it was built (in any stack).
//   node scripts/webapp-bench/judge.ts <app folder> <brief folder> [--port n] [--change] [--json]
// What it trusts is `judge.json` in the app's folder, and only for where things are (ACCEPTANCE.md). Everything else it concludes by starting the app in production, in an
// empty data folder, and using it over HTTP as people do: a visitor, a first person, a second person. README.md lists every line; the ids are stable.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { expectedNumber, resolveRow } from './expect-base.ts';
import { countNumber, fold, hasPhrase, numberTokens, visibleText } from './lib.ts';
import { type ActionDecl, type JudgeJson, declared, fieldDecl, fill, opOf, readJudgeJson } from './acceptance.ts';
import { AppProcess, environment, sh, tail } from './appproc.ts';
import { type ActionSpec, type PartSpec, type Row, type VersusExpect, briefFile, linesFor, loadExpect, planProblems } from './expect.ts';
import { Client, type Reply, type SessionStyle, at, ok, refused, wordsOf } from './http.ts';
import { booking, club, crews, crewsSetup, kb } from './larger.ts';
import { type Bound, add, addressesOf, bind, bodyOf, change, idOf, list, markerField, markerOf, readOne, remove, rowsOf, sameValue } from './things.ts';

/** `not-checked`: the line could not be tried because judge.json lacks what it needs (an address, a field the maker needs). It is left out of the count, which says it once, on judge-json. */
export type Status = 'pass' | 'fail' | 'could-not-run' | 'not-checked';
export interface Line {
  id: string;
  status: Status;
  say: string;
}

export interface Options {
  app: string;
  brief: string;
  port: number;
  /** Judge the change request (expect-change.json) instead of the first build. */
  change?: boolean;
  /** Seconds the app has to start (60). */
  startSeconds?: number;
  /** Minutes the build has (10). */
  buildMinutes?: number;
}

export interface Result {
  brief: string;
  lines: Line[];
  /** `total` is the lines that count: those not left out as `not-checked`. A disagreement about where something is costs one line (judge-json), not the lines that needed it. */
  score: { passed: number; total: number; notChecked: number; all: boolean };
  /** What was timed: seconds to build, seconds to start. */
  timing: { build: number | null; start: number | null };
  notes: string[];
}

/** Whether a text says a phrase. A phrase written `re:<pattern>` is a pattern (read over the text folded to lower case without accents): one phrase then stands for every way of saying it that the maker's words allow. */
export function says(text: string, phrase: string): boolean {
  if (phrase.startsWith('re:')) return new RegExp(phrase.slice(3), 'i').test(fold(text));
  return hasPhrase(text, phrase);
}

/** What an answer's part is when judge.json does not say where it is: it is not compared. */
const NOT_MAPPED = Symbol('not mapped');
/** A whole line of words where an item was expected: each part is looked for inside it. */
class WholeLine {
  readonly text: string;
  constructor(text: string) {
    this.text = text;
  }
}

/** Whether a text says the day `iso` (YYYY-MM-DD): written as that, or as a date a person writes ("8 May 2027", "May 8, 2027", "8/5/2027" either way round). */
export function dayMatches(text: string, iso: string): boolean {
  if (text.includes(iso)) return true;
  const day = (ms: number) => (Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10));
  if (day(Date.parse(`${text.replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1')} 12:00 UTC`)) === iso) return true;
  const m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(text);
  if (m) return [`${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`, `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`].includes(iso);
  return false;
}

const short = (r: Reply): string => `${r.status}${r.json?.error ? ` ${JSON.stringify(r.json.error).slice(0, 80)}` : r.json?.message ? ` ${JSON.stringify(r.json.message).slice(0, 80)}` : r.text ? ` ${r.text.replace(/\s+/g, ' ').slice(0, 60)}` : ''}`;
const more = (problems: string[], n = 5): string => problems.slice(0, n).join('; ') + (problems.length > n ? `; and ${problems.length - n} more` : '');
const uniqueTag = (() => {
  let n = 0;
  return () => `zq${++n}x`;
})();

/** A refusal said in words a person can read. */
function saysSomething(r: Reply): boolean {
  const said = typeof r.json?.error === 'string' ? r.json.error : typeof r.json?.message === 'string' ? r.json.message : typeof r.json?.error?.message === 'string' ? r.json.error.message : r.json === null ? r.text : '';
  return said.trim().length >= 8 && /\s/.test(said.trim());
}

export class Run {
  readonly o: Options;
  readonly e: VersusExpect;
  readonly order: string[];
  readonly lines = new Map<string, Line>();
  readonly notes: string[] = [];
  readonly now = new Date();
  j: JudgeJson | null = null;
  bound = new Map<string, Bound>();
  proc: AppProcess;
  dataDir = '';
  secrets: Record<string, string> = {};
  timing = { build: null as number | null, start: null as number | null };

  // who is who in this run
  V!: Client;
  A: Client | undefined;
  B: Client | undefined;
  creds = new Map<string, { email: string; password: string }>();
  ids: Record<string, string[]> = {};
  logical: Record<string, Row[]> = {};
  idsB: Record<string, string[]> = {};
  logicalB: Record<string, Row[]> = {};
  /** What every page a visitor read said, by address (for the phrases, and for the secrets). */
  public_ = new Map<string, string>();
  rawPages: string[] = [];

  constructor(o: Options) {
    this.o = o;
    this.e = loadExpect(briefFile(o.brief, o.change ? 'change' : 'expect'));
    this.order = linesFor(this.e);
    this.proc = new AppProcess(o.app, o.port);
  }

  // ---------------------------------------------------------------------------------------------- lines

  set(id: string, status: Status, say: string): void {
    if (this.order.includes(id)) this.lines.set(id, { id, status, say: say.replaceAll(this.o.app, '<app>') });
  }
  pass = (id: string, say: string) => this.set(id, 'pass', say);
  fail = (id: string, say: string) => this.set(id, 'fail', say);
  cannot = (id: string, say: string) => this.set(id, 'could-not-run', say);
  verdict(id: string, problems: string[], good: string): void {
    if (problems.length === 0) this.pass(id, good);
    else this.fail(id, more(problems));
  }
  /** Lines the judge could not try because judge.json does not say where something is: not counted, and said as such (the failure is counted once, in judge-json). */
  skip(ids: readonly string[], why: string): void {
    for (const id of ids) if (!this.lines.has(id)) this.set(id, 'not-checked', `not checked, because ${why}; counted once, in judge-json`);
  }
  rest(ids: readonly string[], why: string): void {
    for (const id of ids) if (!this.lines.has(id)) this.cannot(id, why);
  }

  get origin(): string {
    return this.proc.origin;
  }

  newClient(label: string): Client {
    const c = new Client(this.origin, label);
    const s = this.j?.accounts?.session;
    c.useSession(s && s !== 'cookie' ? ({ token: s.token, header: s.header, ...(s.prefix ? { prefix: s.prefix } : {}) } satisfies SessionStyle) : { cookie: true });
    return c;
  }

  // ---------------------------------------------------------------------------------------------- judge.json

  readJudgeJson(): boolean {
    const file = join(this.o.app, 'judge.json');
    const read = readJudgeJson(existsSync(file) ? readFileSync(file, 'utf8') : null);
    if ('problems' in read) {
      this.fail('judge-json', more(read.problems));
      return false;
    }
    this.j = read.json;
    const problems: string[] = [];
    const { bound, problems: boundProblems } = bind(this.e, this.j);
    this.bound = bound;
    problems.push(...boundProblems);
    this.excludeKinds();
    if (this.e.accounts !== 'none' && !this.j.accounts) problems.push('"accounts" is missing: how to make an account and sign in');
    if (this.e.numbers.length > 0 && !this.j.home) problems.push('"home" is missing: the address that shows the numbers');
    for (const a of this.e.actions ?? []) problems.push(...this.actionProblems(a));
    const planned = planProblems(this.e, this.now);
    if (planned.length > 0) problems.push(`(the brief's own plan is wrong: ${planned[0]})`);
    this.verdict('judge-json', problems, `judge.json says where everything the brief names is: ${this.bound.size} kind(s) of thing, ${this.e.actions?.length ?? 0} rule(s)${this.e.accounts === 'none' ? '' : ', how to make an account and sign in'}`);
    return true;
  }

  actionDecl(a: ActionSpec): { name: string; decl: ActionDecl } | undefined {
    const found = declared(this.j?.actions, a.id, a.names);
    if (found) return { name: found.name, decl: found.value };
    const all = Object.entries(this.j?.actions ?? {});
    // the only rule of the brief and the only one declared: the maker's word for it does not matter
    return (this.e.actions?.length ?? 0) === 1 && all.length === 1 ? { name: all[0]![0], decl: all[0]![1] } : undefined;
  }

  /** The key a part of an action is written with: found by the maker's word for it. */
  partKey<T>(table: Record<string, T> | undefined, p: PartSpec): { name: string; value: T } | undefined {
    return declared(table, p.id, p.names);
  }

  actionProblems(a: ActionSpec): string[] {
    const found = this.actionDecl(a);
    if (!found) return [`no entry in "actions" for ${a.id} (the maker's word for it)`];
    const out: string[] = [];
    const used = new Set<string>();
    for (const c of [...a.cases, ...a.edges, ...a.refused]) for (const k of Object.keys(c.in)) used.add(k);
    for (const p of a.inputs) if ((p.required || used.has(p.id)) && !this.partKey(found.decl.input, p)) out.push(`"${found.name}" does not say which key takes the ${p.id}`);
    for (const p of a.outputs) if (!this.partKey(found.decl.output, p)) out.push(`"${found.name}" does not say where the ${p.id} is in the answer`);
    return out;
  }

  // ---------------------------------------------------------------------------------------------- build, start

  build(): boolean {
    const command = this.j!.build;
    if (!command) {
      this.pass('build', 'judge.json names no build: nothing has to be built');
      return true;
    }
    const r = sh(command, this.o.app, this.o.buildMinutes ?? 10);
    this.timing.build = Math.round(r.seconds);
    if (r.status === 0) this.pass('build', `\`${command}\` works (${Math.round(r.seconds)} s)`);
    else this.fail('build', `${r.timedOut ? 'it ran out of time' : `\`${command}\` failed`}: ${tail(r.out)}`);
    return r.status === 0;
  }

  async start(withJudgeEnv: boolean): Promise<boolean> {
    const { env, secrets } = environment(this.j!, this.o.port, this.dataDir, withJudgeEnv);
    this.secrets = secrets;
    try {
      await this.proc.start(this.j!, env, this.o.startSeconds ?? 60);
      return true;
    } catch (error) {
      this.startError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }
  startError = '';

  // ---------------------------------------------------------------------------------------------- the words

  async publicPages(): Promise<void> {
    const V = this.V;
    const home = await V.page('/');
    this.public_.set('/', wordsOf(home));
    this.rawPages.push(home.text);
    const links = new Set<string>((this.e.pages ?? []).flatMap((p) => p.paths));
    for (const m of home.text.matchAll(/href="(\/[^"#?]*)/g)) if (!/^\/(api|assets|admin|_)/.test(m[1]!) && !/\.\w{2,5}$/.test(m[1]!) && m[1] !== '/') links.add(m[1]!);
    for (const path of [...links].slice(0, 30)) {
      const page = await V.page(path);
      if (page.status === 200) {
        this.public_.set(path, wordsOf(page));
        this.rawPages.push(page.text);
      }
    }
    const first = this.public_.get('/') ?? '';
    // the name as the maker gave it; "&" and "and" are one word
    const named = (t: string) => [this.e.product, this.e.product.replace(/&/g, 'and'), this.e.product.replace(/\band\b/gi, '&')].some((p) => hasPhrase(t, p));
    if (home.status !== 200) this.fail('name-shown', `the first page answers ${home.status}, not a page`);
    else if (named(first)) this.pass('name-shown', `"${this.e.product}" is on the first page`);
    else this.fail('name-shown', `the first page, as the server sends it, does not say "${this.e.product}", the name the maker gave`);
    if (this.e.pages?.length) {
      const problems: string[] = [];
      for (const p of this.e.pages) {
        const hit = [...this.public_.entries()].find(([path, t]) => path !== '/' && p.phrases.every((g) => g.some((x) => says(t, x))));
        if (!hit) problems.push(`no public page besides the first says what the "${p.id}" page was asked to say (${p.phrases.map((g) => `"${g[0]}"`).join(', ')})`);
      }
      this.verdict('second-page', problems, `${this.e.pages.length} other public page(s) answer and say what they were asked to`);
    }
  }

  /** What the maker's words need is on a page a person reads: the public pages, and the home page of a signed-in person (a tool's lists are named there). */
  async phrases(): Promise<void> {
    const texts = [...this.public_.values()];
    if (this.A && this.j?.home) {
      const home = await this.A.page(this.j.home);
      if (home.status === 200) {
        texts.push(wordsOf(home));
        this.rawPages.push(home.text);
        // and the pages it links to (a tool's lists are named in its menu, and their own pages)
        const seen = new Set<string>([this.j.home, '/']);
        for (const m of home.text.matchAll(/href="(\/[^"#?]*)/g)) {
          const path = m[1]!;
          if (seen.has(path) || seen.size > 14 || /^\/(api|assets|_)/.test(path) || /\.\w{2,5}$/.test(path) || /sign-?out|log-?out/i.test(path)) continue;
          seen.add(path);
          const page = await this.A.page(path);
          if (page.status === 200) texts.push(wordsOf(page));
        }
      }
    }
    const missing = this.e.phrases.filter((group) => !texts.some((t) => group.some((p) => says(t, p)))).map((g) => `"${g[0]!.replace(/^re:/, '')}"`);
    if (missing.length === 0) this.pass('phrases-shown', `all ${this.e.phrases.length} things the maker's words need are on the pages a person reads`);
    else this.fail('phrases-shown', `not on any page a person reads (in the HTML the server sends): ${missing.join(', ')}`);
  }

  /** No secret of the app's environment in a file a browser gets: the pages, what they load, and the folders judge.json says are sent as they are. */
  async noSecrets(): Promise<void> {
    const secrets = Object.entries(this.secrets).filter(([, v]) => v.length >= 12);
    if (secrets.length === 0) {
      this.fail('no-secret-in-browser', 'the judge could not plant a secret in the environment');
      return;
    }
    const found: string[] = [];
    const seen = new Set<string>();
    const look = (where: string, text: string) => {
      for (const [name, value] of secrets) if (text.includes(value) || text.includes(encodeURIComponent(value))) found.push(`${name} is in ${where}`);
    };
    const queue: string[] = [];
    const take = (html: string, base: string) => {
      for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"'#]+)["']/gi)) queue.push(new URL(m[1]!, `${this.origin}${base}`).pathname + new URL(m[1]!, `${this.origin}${base}`).search);
    };
    for (const html of this.rawPages) {
      look('a page', html);
      take(html, '/');
    }
    const assetLike = /\/[\w.\-/]+\.(?:js|mjs|css|json|map|html|txt|svg|webmanifest)$/i;
    for (let i = 0; i < queue.length && seen.size < 300; i++) {
      const path = queue[i]!;
      if (seen.has(path) || !assetLike.test(path.split('?')[0]!) || /^\/api\//.test(path)) continue;
      seen.add(path);
      const r = await this.V.get(path);
      if (r.status !== 200) continue;
      look(path, r.text);
      if (/\.(?:js|mjs|css)$/i.test(path.split('?')[0]!)) {
        for (const m of r.text.matchAll(/["'`(]((?:\.{0,2}\/)?[\w.\-/]+\.(?:js|mjs|css|json))["'`)]/g)) {
          const next = new URL(m[1]!, `${this.origin}${path}`);
          if (next.origin === this.origin) queue.push(next.pathname + next.search);
        }
      }
    }
    let files = 0;
    for (const folder of this.j!.start.browserFolders ?? []) {
      const root = resolve(this.o.app, folder);
      if (!root.startsWith(resolve(this.o.app)) || !existsSync(root)) continue;
      const walk = (d: string) => {
        for (const entry of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, entry.name);
          if (entry.isDirectory()) walk(p);
          else if (statSync(p).size < 8_000_000) {
            files++;
            look(`${folder}/${p.slice(root.length + 1)}`, readFileSync(p).toString('latin1'));
          }
        }
      };
      walk(root);
    }
    if (found.length > 0) this.fail('no-secret-in-browser', `${[...new Set(found)].slice(0, 4).join('; ')}`);
    else this.pass('no-secret-in-browser', `${secrets.length} secret(s) of the environment (${secrets.map(([n]) => n).join(', ')}; the last one is planted by the judge) are in none of ${this.rawPages.length} page(s), ${seen.size} file(s) the pages load${files ? ` or ${files} file(s) of ${(this.j!.start.browserFolders ?? []).join(', ')}` : ''}`);
  }

  // ---------------------------------------------------------------------------------------------- people

  async step(c: Client, s: NonNullable<JudgeJson['accounts']>['signUp'], values: Record<string, string>): Promise<Reply> {
    const fields = Object.fromEntries(Object.entries(s.body ?? {}).map(([k, v]) => [k, fill(v, values)]));
    return c.call(s.method ?? 'POST', s.path, { send: s.send ?? 'json', fields });
  }

  /** The first address a signed-in person can read and a visitor cannot: the first kind's list, else the home page. */
  probePath(): string | undefined {
    for (const b of this.bound.values()) if (!b.kind.readOnly && b.decl.list) return b.decl.list.path;
    return this.j?.home;
  }

  async probe(c: Client): Promise<boolean> {
    const path = this.probePath();
    if (!path) return false;
    const r = await c.get(path);
    return r.status >= 200 && r.status < 300;
  }

  /** Makes an account and signs in. `works`: the person can then read what only people may. `made`: the account exists (sign-up was accepted and the same email and password sign in), whatever it may read. */
  async makePerson(label: string): Promise<{ client: Client; reply: Reply; works: boolean; made: boolean }> {
    const c = this.newClient(label);
    const values = { email: `${label}@judge.test`, password: `Correct-horse-${label}-1`, name: `Judge ${label}` };
    this.creds.set(label, values);
    const reply = await this.step(c, this.j!.accounts!.signUp, values);
    let works = ok(reply) && (await this.probe(c));
    let made = works;
    if (ok(reply) && !works) {
      const again = await this.step(c, this.j!.accounts!.signIn, values);
      made = ok(again);
      works = await this.probe(c);
    }
    return { client: c, reply, works, made };
  }

  async signInAgain(label: string, wrongPassword = false): Promise<{ client: Client; reply: Reply }> {
    const client = this.newClient(`${label}-again`);
    const creds = this.creds.get(label)!;
    const reply = await this.step(client, this.j!.accounts!.signIn, wrongPassword ? { ...creds, password: `${creds.password}-wrong` } : creds);
    return { client, reply };
  }

  async people(): Promise<void> {
    if (this.e.accounts === 'none') return;
    const made = await this.makePerson('owner');
    if (made.works) this.A = made.client;
    const problems: string[] = [];
    if (!ok(made.reply)) problems.push(`making an account answered ${short(made.reply)}`);
    else if (!made.works) problems.push('after making an account (and signing in) the person still cannot see what only people may see');
    else {
      const again = await this.signInAgain('owner');
      if (!ok(again.reply) || !(await this.probe(again.client))) problems.push(`a person who made an account cannot sign in again with the same email and password (${short(again.reply)})`);
      const wrong = await this.signInAgain('owner', true);
      if (ok(wrong.reply)) problems.push(`a wrong password is accepted (${wrong.reply.status}); a refusal is a 4xx`);
    }
    this.verdict('account', problems, 'a person makes an account and is let in, signs in again with the same email and password, and a wrong password is refused');
    if (this.e.accounts === 'owner-only' || this.e.accounts === 'open' || this.e.accounts === 'any') {
      if (!this.A) {
        if (this.e.accounts !== 'any') this.cannot('signup-policy', 'the first person could not be let in, so who else may make an account could not be tried');
        return;
      }
      const second = await this.makePerson('second');
      if (second.works) this.B = second.client;
      if (this.e.accounts === 'owner-only') {
        if (second.made) this.fail('signup-policy', 'a second person could make an account and sign in with it: the maker said nobody but them');
        else this.pass('signup-policy', `a second person is refused (${short(second.reply)}): only the first person has an account`);
      } else if (this.e.accounts === 'open') {
        if (second.made) this.pass('signup-policy', 'a second person makes their own account and signs in');
        else this.fail('signup-policy', `a second person cannot make an account: ${ok(second.reply) ? 'they are not let in' : short(second.reply)}; the maker said anyone could`);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- rows

  /** Who adds the rows of a kind: a visitor where the maker said so, else the first person. */
  adder(b: Bound): Client | undefined {
    return b.kind.visitorAdds ? this.V : this.A;
  }

  /** The kinds the judge cannot send or find rows of, because judge.json lacks a field the maker needs (or an address) or because they point at such a kind: kind -> why. They are left out of every line about rows, which says so; the other kinds are checked as ever. */
  readonly excluded = new Map<string, string>();

  excludeKinds(): void {
    for (const kind of this.e.kinds) {
      if (kind.readOnly) continue;
      const b = this.bound.get(kind.id);
      if (!b) this.excluded.set(kind.id, 'judge.json has no entry for it');
      else if (b.missing.length > 0) this.excluded.set(kind.id, `judge.json has no field for ${b.missing.join(', ')}`);
      else if ((kind.needOne ?? []).length > 0 && !kind.needOne!.some((id) => b.fields.has(id))) this.excluded.set(kind.id, `judge.json has no field for any of ${kind.needOne!.join(', ')}`);
      else if (!b.decl.list || !b.decl.add) this.excluded.set(kind.id, 'judge.json gives no list or add address for it');
    }
    // a kind that points at one of those cannot have rows made either
    for (let again = true; again; ) {
      again = false;
      for (const kind of this.e.kinds) {
        if (kind.readOnly || this.excluded.has(kind.id)) continue;
        const to = kind.fields.find((f) => f.kind === 'ref' && f.to && this.excluded.has(f.to) && this.bound.get(kind.id)?.fields.has(f.id));
        if (to) {
          this.excluded.set(kind.id, `it points to ${to.to}, which is not checked`);
          again = true;
        }
      }
    }
  }

  /** Says in the lines about rows which kinds were left out and why (the failure is counted once, in judge-json). */
  annotateExcluded(ids: readonly string[]): void {
    if (this.excluded.size === 0) return;
    const note = ` (not checked for ${[...this.excluded].map(([k, why]) => `${k}, because ${why}`).join('; ')}; counted once, in judge-json)`;
    for (const id of ids) {
      const l = this.lines.get(id);
      if (l && (l.status === 'pass' || l.status === 'fail')) this.lines.set(id, { ...l, say: l.say + note });
    }
  }

  stateful(): Bound[] {
    return this.e.kinds.filter((k) => !k.readOnly && !this.excluded.has(k.id)).map((k) => this.bound.get(k.id)).filter((b): b is Bound => !!b && !!b.decl.list && !!b.decl.add);
  }

  /** Adds a plan's rows, kind by kind, as `who` (by default as the kind says); keeps their ids and values. Says what went wrong. */
  async addRows(rows: Record<string, Row[]>, ids: Record<string, string[]>, logical: Record<string, Row[]>, as?: Client): Promise<string[]> {
    const problems: string[] = [];
    for (const kind of this.e.kinds) {
      const b = this.bound.get(kind.id);
      if (!b || kind.readOnly || !b.decl.add || this.excluded.has(kind.id)) continue;
      const who = as ?? this.adder(b);
      if (!who) continue;
      const here = ((ids[kind.id] ??= []), ids[kind.id]!);
      const rowsHere = ((logical[kind.id] ??= []), logical[kind.id]!);
      for (const raw of kind.onePerPerson && !as ? (rows[kind.id] ?? []).slice(0, ids[kind.id]?.length ? 0 : 1) : (rows[kind.id] ?? [])) {
        const row = resolveRow(raw, this.now);
        const sent = await add(who, b, bodyOf(b, row, ids, this.j!));
        rowsHere.push(row);
        if (!ok(sent.reply)) {
          problems.push(`${b.name}: adding "${markerOf(b, row) ?? JSON.stringify(row).slice(0, 30)}" gave ${short(sent.reply)}`);
          here.push('missing');
        } else here.push(sent.id ?? 'unknown');
      }
      // where the app's answer did not say the new row's id, it is found in the list
      if (here.includes('unknown')) {
        const reader = this.A;
        const listed = reader ? await list(reader, b) : null;
        for (const [i, id] of here.entries()) {
          if (id !== 'unknown') continue;
          const marker = markerOf(b, rowsHere[i]!);
          const hit = marker ? listed?.rows?.find((r) => JSON.stringify(r).includes(marker)) : undefined;
          here[i] = (hit && idOf(b, hit)) || 'unknown';
        }
      }
    }
    return problems;
  }

  async addAndRead(): Promise<void> {
    const problems = await this.addRows(this.e.rows, this.ids, this.logical);
    const lister = this.A;
    for (const kind of this.e.kinds) {
      const b = this.bound.get(kind.id);
      if (!b || kind.readOnly || this.excluded.has(kind.id)) continue;
      if (!lister) {
        problems.push(`${b.name}: no one signed in to read the list`);
        continue;
      }
      const got = await list(lister, b);
      if (!got.rows) {
        problems.push(`${b.name}: the list at ${b.decl.list!.path} answered ${short(got.reply)}, not rows`);
        continue;
      }
      for (const [i, row] of (this.logical[kind.id] ?? []).entries()) {
        const id = this.ids[kind.id]?.[i];
        if (!id || id === 'missing') continue;
        const marker = markerOf(b, row);
        const listed = got.rows.find((r) => (id !== 'unknown' && idOf(b, r) === id) || (marker && JSON.stringify(r).includes(marker)));
        if (!listed) {
          problems.push(`${b.name}: "${marker ?? id}" was added and is not in the list${typeof got.reply.json?.total === 'number' && got.reply.json.total > got.rows.length ? ` (the list gave only ${got.rows.length} of ${got.reply.json.total} rows: give a bigger page in list.path, like /api/things?pageSize=100)` : ''}`);
          continue;
        }
        const one = id !== 'unknown' ? await readOne(lister, b, id) : null;
        const oneJson = one && ok(one) ? (one.json?.row ?? one.json?.data ?? one.json) : undefined;
        if (b.decl.one?.read && id !== 'unknown' && !(one && ok(one))) problems.push(`${b.name}: reading "${marker ?? id}" by its own address answered ${one ? short(one) : 'nothing'}`);
        const wrong: string[] = [];
        for (const [fid, f] of b.fields) {
          if (row[fid] === undefined || f.spec.kind === 'file') continue;
          let value = at(listed, f.key);
          if (value === undefined && oneJson !== undefined) value = at(oneJson, f.key);
          if (value === undefined) wrong.push(`${fid} is not given back`);
          else if (!sameValue(f, value, row[fid], this.ids, this.j!)) wrong.push(`${fid} was ${JSON.stringify(row[fid])} and comes back as ${JSON.stringify(value)}`);
        }
        if (wrong.length > 0) problems.push(`${b.name} "${marker ?? id}": ${wrong.join(', ')}`);
      }
    }
    this.verdict('add-and-read', problems, `${Object.values(this.logical).reduce((n, r) => n + r.length, 0)} row(s) in ${this.stateful().length} kind(s) were added (${this.e.kinds.some((k) => k.visitorAdds) ? 'by a visitor where the maker said so' : 'by the first person'}) and come back in the list with each value as given. Fields: ${this.fieldsSaid()}`);
  }

  private soloCount = 0;
  /** A person made for one thing (a kind that keeps one record for each person is tried on with records of people of the judge's own, never with more of the first person's). */
  async freshPerson(): Promise<Client | undefined> {
    const p = await this.makePerson(`solo${++this.soloCount}`);
    return p.made ? p.client : undefined;
  }

  /** A row for trying things on: a copy of the first row of the plan with a mark of its own in a text, added as the kind says. */
  async spare(b: Bound, tag = uniqueTag()): Promise<{ id: string | undefined; row: Row; body: Record<string, unknown>; tag: string } | null> {
    const who = b.kind.onePerPerson ? await this.freshPerson() : this.adder(b);
    const base = (this.logical[b.kind.id] ?? [])[0];
    if (!who || !base) return null;
    // a kind with no text to carry a mark (opening hours, days off) is found again by its id, or by what the list gained
    const marked = markerField(b) !== undefined;
    const before = marked || !this.A ? null : new Set(((await list(this.A, b)).rows ?? []).map((r) => idOf(b, r)));
    const row = this.tagged(b, base, tag);
    const body = bodyOf(b, row, this.ids, this.j!);
    const sent = await add(who, b, body);
    if (!ok(sent.reply)) return null;
    let id = sent.id;
    if (!id && this.A) {
      const got = await list(this.A, b);
      const hit = marked ? got.rows?.find((r) => JSON.stringify(r).includes(tag)) : got.rows?.find((r) => !before?.has(idOf(b, r)));
      id = hit ? idOf(b, hit) : undefined;
    }
    return { id, row, body, tag: marked ? tag : '' };
  }

  /** The same row with a text that carries the tag: the field the row is found by (a name, a title; an email only when there is nothing else, as a local part), and every email the app has: it is told apart in lists, and refused or kept rows are found by it. Only fields the app has. */
  tagged(b: Bound, row: Row, tag: string, skip?: string): Row {
    const copy: Row = { ...row };
    const id = markerField(b, skip);
    if (id && typeof copy[id] === 'string') copy[id] = b.fields.get(id)!.spec.email ? String(copy[id]).replace(/@/, `.${tag}@`) : `${copy[id]} ${tag}`;
    // an app may keep one row for each email: every email the app has is made different too
    for (const f of b.fields.values()) if (f.spec.email && f.spec.id !== id && f.spec.id !== skip && typeof copy[f.spec.id] === 'string') copy[f.spec.id] = String(copy[f.spec.id]).replace(/@/, `.${tag}@`);
    return copy;
  }

  async kept(b: Bound, tags: string[]): Promise<string[]> {
    const reader = this.A;
    if (!reader) return [];
    const got = await list(reader, b);
    const text = JSON.stringify(got.rows ?? []);
    return tags.filter((t) => t !== '' && text.includes(t));
  }

  /** What the kind's rows hold before and after a set of attempts, for the ones that must be refused to be seen not to have been kept. */
  async attempts(kindIds: string[], what: 'required' | 'bad'): Promise<string[]> {
    const problems: string[] = [];
    for (const id of kindIds) {
      const b = this.bound.get(id);
      const first = b && this.adder(b);
      const base = b && (this.logical[id] ?? [])[0];
      if (!b || !first || !base) continue;
      // a kind with one record for each person: what is refused is tried by one person of the judge's own, what must be taken by a new one each time (the first person's own record is not touched)
      const shared = b.kind.onePerPerson ? await this.freshPerson() : undefined;
      if (b.kind.onePerPerson && !shared) continue;
      const refusedTags: string[] = [];
      const acceptedIds: string[] = [];
      const send = async (label: string, row: Row, raw: Record<string, unknown>, expect: 'refused' | 'taken', skip?: string) => {
        const tag = uniqueTag();
        const tagged = this.tagged(b, row, tag, skip);
        const body = bodyOf(b, tagged, this.ids, this.j!, raw);
        const who = b.kind.onePerPerson ? (expect === 'refused' ? shared! : ((await this.freshPerson()) ?? shared!)) : first;
        const sent = await add(who, b, body);
        if (expect === 'refused') {
          if (ok(sent.reply)) problems.push(`${b.name}: ${label} was accepted`);
          else if (!refused(sent.reply)) problems.push(`${b.name}: ${label} answered ${short(sent.reply)}, a refusal is a 4xx`);
          refusedTags.push(tag);
        } else if (!ok(sent.reply)) problems.push(`${b.name}: ${label} answered ${short(sent.reply)}, but the maker said it may be left out`);
        if (ok(sent.reply) && sent.id) acceptedIds.push(sent.id);
        if (ok(sent.reply) && !sent.id) refusedTags.push(`~${tag}`);
      };
      const needOne = (b.kind.needOne ?? []).filter((x) => b.fields.has(x));
      if (what === 'required' && needOne.length > 0) {
        const bare: Row = { ...base };
        for (const x of needOne) delete bare[x];
        await send(`${needOne.join(', ')} all left out (the maker needs at least one of them)`, bare, {}, 'refused', needOne[0]);
      }
      for (const { spec: f } of b.fields.values()) {
        if (f.readOnly) continue;
        const without = (): Row => {
          const r = { ...base };
          delete r[f.id];
          return r;
        };
        if (what === 'required') {
          // a field the app MAY have is never tried as needed: the app may make it so, or not
          if (f.kind === 'yesno' || f.kind === 'file' || f.mayHave) continue;
          if (f.required) {
            await send(`${f.id} left out`, without(), {}, 'refused', f.id);
            if (f.kind === 'text' && !f.open) await send(`${f.id} left blank`, base, { [f.id]: '   ' }, 'refused', f.id);
          } else if (!needOne.includes(f.id)) await send(`${f.id} left out`, without(), {}, 'taken', f.id);
        } else {
          const lim = (v: number) => (f.kind === 'money' ? v * (this.j!.money === 'cents' ? 100 : 1) : v);
          const bads: [string, unknown][] = [];
          if (f.kind === 'integer') bads.push(['a fraction (1.5)', 1.5], ['a word', 'abc']);
          else if (f.kind === 'number') bads.push(['a word', 'abc']);
          else if (f.kind === 'money') bads.push(['a word', 'abc']);
          else if (f.kind === 'day') bads.push(['2027-02-30', '2027-02-30'], ['"next week"', 'next week']);
          else if (f.kind === 'choice') bads.push(['a word that is not one of the choices', 'nonsense_word']);
          else if (f.kind === 'ref') bads.push(['a row that is not there', '00000000-0000-4000-8000-000000000000']);
          else if (f.email) bads.push(['not an email address', 'not-an-email']);
          if (f.min !== undefined && ['integer', 'number', 'money'].includes(f.kind)) bads.push([`${f.min - 1}, under the least the maker allows (${f.min})`, lim(f.min - 1)]);
          if (f.max !== undefined && ['integer', 'number', 'money'].includes(f.kind)) bads.push([`${f.max + 1}, over the most the maker allows (${f.max})`, lim(f.max + 1)]);
          for (const [label, value] of bads) await send(`${f.id} as ${label}`, base, { [f.id]: value }, 'refused', f.id);
          if (f.min !== undefined && ['integer', 'number', 'money'].includes(f.kind)) await send(`${f.id} at its least (${f.min})`, { ...base, [f.id]: f.min }, {}, 'taken', f.id);
          if (f.max !== undefined && ['integer', 'number', 'money'].includes(f.kind)) await send(`${f.id} at its most (${f.max})`, { ...base, [f.id]: f.max }, {}, 'taken', f.id);
        }
      }
      const stored = await this.kept(b, refusedTags.filter((t) => !t.startsWith('~')));
      if (stored.length > 0) problems.push(`${b.name}: a refused row was kept anyway (${stored.length} of them are in the list)`);
      for (const accepted of acceptedIds) await remove(this.A ?? first, b, accepted);
    }
    return problems;
  }

  /** What the judge tried, said in the line: the fields the app has, which of them a row is found by, and the ones it left out because the app has none. */
  fieldsSaid(): string {
    return this.stateful()
      .map((b) => {
        const left = b.kind.fields.filter((f) => f.mayHave && !b.fields.has(f.id)).map((f) => f.id);
        return `${b.name}: ${[...b.fields.keys()].join(', ')}${b.extras.length ? ` and ${b.extras.map((x) => x.name).join(', ')} (not in the brief, sent as they are)` : ''}; rows found by ${markerField(b) ?? 'their id'}${left.length ? `; ${left.join(', ')} not in the app, left out of every row` : ''}`;
      })
      .join(' | ');
  }

  async requiredAndBad(): Promise<void> {
    const ids = this.stateful().map((b) => b.kind.id);
    const required = await this.attempts(ids, 'required');
    this.verdict('required-fields', required, `${ids.length} kind(s): what the maker said is needed cannot be left out or blank (refused, nothing kept), what may be left out can be. Fields tried: ${this.fieldsSaid()}`);
    const bad = await this.attempts(ids, 'bad');
    this.verdict('bad-values', bad, `values that make no sense (fractions, words for numbers, days that do not exist, words that are not a choice, rows that are not there, numbers past the maker's limits, an email that is not an address) are refused and nothing is kept. Fields tried: ${this.fieldsSaid()}`);
  }

  async changeRemove(): Promise<void> {
    const problems: string[] = [];
    let tried = 0;
    const did: string[] = [];
    for (const b of this.stateful()) {
      const ops = b.kind.ops ?? [];
      if (ops.length === 0 || !this.A) continue;
      const s = await this.spare(b);
      if (!s?.id) {
        problems.push(`${b.name}: a row to try on could not be added or found`);
        continue;
      }
      tried++;
      // reading one row by its own address and removing one are tried when judge.json gives them: the maker's words never ask for them, so a builder who gives neither is not failed
      if (opOf(b.decl.one, 'read')) {
        did.push('read');
        const r = await readOne(this.A, b, s.id);
        if (!r || !ok(r) || !JSON.stringify(r.json).includes(s.tag)) problems.push(`${b.name}: a row is not read by its own address (${r ? short(r) : 'no address'})`);
      }
      if (ops.includes('change') && opOf(b.decl.one, 'change')) {
        did.push('change');
        const row = this.tagged(b, s.row, 'changedzq');
        const r = await change(this.A, b, s.id, bodyOf(b, row, this.ids, this.j!));
        if (!ok(r)) problems.push(`${b.name}: changing a row answered ${short(r)}`);
        else if ((await this.kept(b, ['changedzq'])).length === 0) problems.push(`${b.name}: a row was changed (${r.status}) and the list does not show it`);
      }
      if (opOf(b.decl.one, 'remove')) {
        did.push('remove');
        const r = await remove(this.A, b, s.id);
        if (!r || !ok(r)) problems.push(`${b.name}: removing a row answered ${r ? short(r) : 'no address'}`);
        else if ((await this.kept(b, [s.tag])).length > 0) problems.push(`${b.name}: a row was removed (${r.status}) and is still in the list`);
      } else await remove(this.A, b, s.id);
    }
    if (tried === 0 && problems.length === 0) this.cannot('change-remove', 'no row could be tried on');
    else this.verdict('change-remove', problems, `${tried} kind(s): ${[...new Set(did)].join(', ')} tried (a row is changed and the list shows it; reading and removing are tried only where judge.json gives them)`);
  }

  /** Every way someone might reach one row they have no right to: its address, the list's address with its id, each way to ask, and the ids next to it. Says what got through. */
  async probes(who: Client, label: string, b: Bound, s: { id: string; tag: string }, markers: string[]): Promise<string[]> {
    const problems: string[] = [];
    const listing = await who.call('GET', b.decl.list!.path);
    const seen = JSON.stringify(listing.json ?? listing.text);
    const listed = rowsOf(listing, b.decl.list!.rows) ?? [];
    // a kind the maker lets visitors read (published articles, opening hours) is not a leak when read; what visitors may not do with it is still tried
    const mayRead = b.kind.publicRead === true && label === 'a visitor';
    if (!mayRead && ok(listing) && (markers.some((m) => seen.includes(m)) || (s.tag !== '' && seen.includes(s.tag)) || listed.some((r) => idOf(b, r) === s.id))) problems.push(`${label} reads ${b.name} at ${b.decl.list!.path}`);
    const blank = bodyOf(b, this.tagged(b, (this.logical[b.kind.id] ?? [])[0] ?? {}, 'hackedzq'), this.ids, this.j!);
    for (const address of addressesOf(b, s.id)) {
      const got = await who.call('GET', address);
      if (!mayRead && ok(got) && ((s.tag !== '' && JSON.stringify(got.json ?? got.text).includes(s.tag)) || markers.some((m) => JSON.stringify(got.json ?? got.text).includes(m)))) problems.push(`${label} reads a ${b.name} row at ${address}`);
      for (const method of ['PATCH', 'PUT']) await who.call(method, address, { send: 'json', fields: blank });
      await who.call('DELETE', address);
    }
    if (/^\d+$/.test(s.id)) {
      for (const n of [Number(s.id) - 2, Number(s.id) - 1, Number(s.id) + 1, Number(s.id) + 2].filter((x) => x > 0)) {
        const got = await who.call('GET', addressesOf(b, String(n))[0]!);
        if (!mayRead && ok(got) && markers.some((m) => JSON.stringify(got.json ?? got.text).includes(m))) problems.push(`${label} reads a ${b.name} row by guessing the id ${n}`);
      }
    }
    return problems;
  }

  /** After someone tried: the row is still there, whole. */
  async intact(b: Bound, s: { id: string; tag: string }): Promise<string[]> {
    if (!this.A) return [];
    const got = await list(this.A, b);
    const text = JSON.stringify(got.rows ?? []);
    const out: string[] = [];
    if (!text.includes(s.tag !== '' ? s.tag : s.id)) out.push(`a row of ${b.name} was removed or changed by someone with no right to it`);
    if (text.includes('hackedzq')) out.push(`a row of ${b.name} was changed by someone with no right to it`);
    return out;
  }

  markersOf(b: Bound): string[] {
    return (this.logical[b.kind.id] ?? []).map((r) => markerOf(b, r)).filter((m): m is string => !!m);
  }

  async visitorShutOut(): Promise<void> {
    const problems: string[] = [];
    const V = this.V;
    for (const b of this.stateful()) {
      const s = await this.spare(b);
      if (!s?.id) {
        problems.push(`${b.name}: a row to try on could not be added or found`);
        continue;
      }
      const markers = this.markersOf(b);
      problems.push(...(await this.probes(V, 'a visitor', b, { id: s.id, tag: s.tag }, markers)));
      problems.push(...(await this.intact(b, { id: s.id, tag: s.tag })));
      if (!b.kind.visitorAdds && this.A) {
        const before = (await list(this.A, b)).rows?.length ?? 0;
        const sent = await add(V, b, bodyOf(b, this.tagged(b, (this.logical[b.kind.id] ?? [])[0] ?? {}, uniqueTag()), this.ids, this.j!));
        const after = (await list(this.A, b)).rows?.length ?? 0;
        if (ok(sent.reply) && after > before) problems.push(`a visitor adds a row to ${b.name}`);
      }
      if (this.A) await remove(this.A, b, s.id);
    }
    for (const path of ['/', this.j?.home].filter((p): p is string => !!p)) {
      const page = await V.page(path);
      const text = visibleText(page.text);
      for (const b of this.stateful()) if (!b.kind.visitorAdds && this.markersOf(b).some((m) => text.includes(m))) problems.push(`a visitor reads ${b.name} rows on ${path}`);
    }
    this.verdict('visitor-shut-out', problems, `a visitor lists, reads, changes and removes nothing (every address, the id guessed), adds only where the maker said, and sees no row on ${this.j?.home ? `${this.j.home} or ` : ''}the first page`);
  }

  /** Where the brief does not say who may make an account, a second person is let in through `start.judgeEnv`: with none, the lines about two people are not checked (they are not the app's failing); where it does say (open), a second person who cannot get in is the app's. */
  noSecond(id: string, first: Client | undefined): void {
    if (!first) return this.cannot(id, 'the first person could not sign in, so what each sees of the other could not be tried');
    if (this.e.accounts === 'any') return this.skip([id], 'a second person could not make an account and judge.json\'s start.judgeEnv does not say how to let one in (the maker did not say who may make an account)');
    return this.cannot(id, 'a second person could not make an account, so what each sees of the other could not be tried');
  }

  /** Why the first person's team could not be made (for the crews' lines). */
  teamProblem = '';
  theirsDone = false;
  async addTheirs(): Promise<string[]> {
    this.theirsDone = true;
    return this.B ? this.addRows(this.e.theirs ?? {}, this.idsB, this.logicalB, this.B) : [];
  }

  async others(): Promise<void> {
    const B = this.B;
    const A = this.A;
    if (this.e.access === 'own') {
      if (!A || !B) return this.noSecond('others-cannot', A);
      const problems: string[] = [];
      const theirProblems = this.theirsDone ? [] : await this.addTheirs();
      if (theirProblems.length > 0) problems.push(`the second person could not add their own rows: ${theirProblems[0]}`);
      for (const b of this.stateful()) {
        const s = await this.spare(b);
        if (!s?.id) {
          problems.push(`${b.name}: a row to try on could not be added or found`);
          continue;
        }
        const markers = this.markersOf(b);
        const got = await list(B, b);
        const text = JSON.stringify(got.rows ?? []);
        // a list that is refused (a notice board for members who have paid) shows nothing: that is not seeing the first person's rows
        if (!got.rows && !refused(got.reply)) problems.push(`${b.name}: the second person's list answered ${short(got.reply)}`);
        else if (markers.some((m) => text.includes(m)) || (s.tag !== '' && text.includes(s.tag))) problems.push(`the second person sees the first person's ${b.name}`);
        problems.push(...(await this.probes(B, 'the second person', b, { id: s.id, tag: s.tag }, markers)));
        problems.push(...(await this.intact(b, { id: s.id, tag: s.tag })));
        const theirMarkers = (this.logicalB[b.kind.id] ?? []).map((r) => markerOf(b, r)).filter((m): m is string => !!m);
        const own = JSON.stringify(got.rows ?? []);
        if (theirMarkers.length > 0 && !theirMarkers.every((m) => own.includes(m))) problems.push(`the second person does not see their own ${b.name}`);
        const mine = JSON.stringify((await list(A, b)).rows ?? []);
        if (!b.kind.staffSeeAll && theirMarkers.some((m) => mine.includes(m))) problems.push(`rows the second person added show among the first person's ${b.name}`);
        await remove(A, b, s.id);
      }
      if (this.j?.home) {
        const page = await B.page(this.j.home);
        const text = visibleText(page.text);
        for (const b of this.stateful()) if (this.markersOf(b).some((m) => text.includes(m))) problems.push(`the second person reads the first person's ${b.name} on ${this.j.home}`);
      }
      this.verdict('others-cannot', problems, "a second person's list has none of the first person's rows, no address (nor the id guessed) reads, changes or removes one, and what they add is theirs alone");
    } else if (this.e.access === 'team') {
      if (!A || !B) return this.noSecond('team-shares', A);
      const problems: string[] = [];
      for (const b of this.stateful()) {
        const got = await list(B, b);
        const text = JSON.stringify(got.rows ?? []);
        const missing = this.markersOf(b).filter((m) => !text.includes(m));
        if (!got.rows) problems.push(`${b.name}: the second person's list answered ${short(got.reply)}`);
        else if (missing.length > 0) problems.push(`the second person does not see ${missing.length} of the ${this.markersOf(b).length} ${b.name} rows${b.kind.visitorAdds ? ' visitors sent' : ' the first person added'}`);
        if (b.kind.visitorAdds) continue;
        const s = await this.spare(b);
        if (!s?.id) continue;
        if ((b.kind.ops ?? []).includes('change') && b.decl.one?.change) {
          const r = await change(B, b, s.id, bodyOf(b, this.tagged(b, s.row, 'sharedzq'), this.ids, this.j!));
          if (!ok(r) || (await this.kept(b, ['sharedzq'])).length === 0) problems.push(`the second person cannot change a ${b.name} row the first person added (${short(r)})`);
        }
        const theirs = await add(B, b, bodyOf(b, this.tagged(b, s.row, 'fromBzq'), this.ids, this.j!));
        if (!ok(theirs.reply)) problems.push(`the second person cannot add a ${b.name} row (${short(theirs.reply)})`);
        else if ((await this.kept(b, ['fromBzq'])).length === 0) problems.push(`a ${b.name} row the second person added is not seen by the first person`);
        await remove(A, b, s.id);
      }
      this.verdict('team-shares', problems, 'the second person sees the same rows as the first, changes and adds them, and the first person sees what they add');
    }
  }

  // ---------------------------------------------------------------------------------------------- the numbers on the home page

  async homeNumbers(): Promise<void> {
    const A = this.A;
    if (!this.j?.home) return this.skip(['home-numbers'], 'judge.json has no "home" (the address that shows the numbers)');
    if (!A) return this.cannot('home-numbers', 'there is no signed-in person, so the numbers could not be read');
    const e = this.e;
    const usableNumbers = e.numbers.filter((n) => !this.excluded.has(n.of));
    if (usableNumbers.length === 0) return this.skip(['home-numbers'], `every number on the home page is worked out from ${[...new Set(e.numbers.map((n) => n.of))].join(', ')}, which cannot be checked (${[...this.excluded].map(([k, w]) => `${k}: ${w}`).join('; ')})`);
    const problems: string[] = [];
    const first: Record<string, Row[]> = Object.fromEntries(Object.entries(this.logical).map(([k, v]) => [k, [...v]]));
    const read = async (): Promise<string> => {
      const r = await A.page(this.j!.home!);
      if (r.status !== 200) {
        problems.push(`the home page ${this.j!.home} answers ${r.status}, not a page`);
        return '';
      }
      this.rawPages.push(r.text);
      return visibleText(r.text);
    };
    const before = await read();
    const failed = await this.addRows(e.later, this.ids, this.logical);
    if (failed.length > 0) problems.push(`the later rows could not be added: ${failed[0]}`);
    const after = await read();
    const t0 = numberTokens(before);
    const t1 = numberTokens(after);
    const good: string[] = [];
    for (const spec of usableNumbers) {
      const kind = e.kinds.find((k) => k.id === spec.of)!;
      const [v0, v1] = [expectedNumber(spec, kind, first[spec.of] ?? [], this.now), expectedNumber(spec, kind, this.logical[spec.of] ?? [], this.now)];
      const show = (v: number) => (spec.show === 'money' ? v.toFixed(2) : String(Math.round(v * 100) / 100));
      const has0 = countNumber(t0, v0, false) >= 1;
      const moved = countNumber(t1, v1, false) > countNumber(t0, v1, false);
      if (has0 && moved) good.push(`${spec.say} ${show(v0)} then ${show(v1)}`);
      else if (!has0 && !moved) problems.push(`${spec.say}: expected ${show(v0)} and then ${show(v1)} from the rows, and the page shows neither`);
      else if (!has0) problems.push(`${spec.say}: the page did not show ${show(v0)}, what the rows came to`);
      else problems.push(`${spec.say}: more rows were added and the page still did not show ${show(v1)}: the number is not worked out from the rows`);
    }
    this.verdict('home-numbers', problems, `${good.length} number(s) on ${this.j.home}, read from the HTML, are what the rows come to and move when rows are added: ${good.join('; ')}${e.access === 'own' ? " (the other person's rows are not in them)" : ''}`);
  }

  // ---------------------------------------------------------------------------------------------- rules

  /** The inputs of a case that judge.json gives no key for: the case cannot be sent as it is, which judge-json has said. */
  unmapped(a: ActionSpec, input: Record<string, unknown>): string[] {
    const decl = this.actionDecl(a)?.decl;
    return Object.keys(input).filter((id) => !decl || !this.partKey(decl.input, a.inputs.find((x) => x.id === id)!));
  }

  async callAction(a: ActionSpec, input: Record<string, unknown>, as?: Client): Promise<{ reply: Reply; decl: ActionDecl } | null> {
    const found = this.actionDecl(a);
    if (!found) return null;
    const { decl } = found;
    const send = decl.send ?? 'json';
    const attempt = async (blank: unknown) => {
      const fields: Record<string, unknown> = {};
      let file: { part: string; name: string; type: string; content: string } | undefined;
      for (const [id, value] of Object.entries(input)) {
        const p = a.inputs.find((x) => x.id === id)!;
        const key = this.partKey(decl.input, p);
        if (!key) continue;
        const k = fieldDecl(key.value)?.key ?? id;
        if (p.kind === 'file') file = { part: k, name: 'takings.csv', type: 'text/csv', content: String(value) };
        else if (value === null || value === undefined) fields[k] = blank;
        else if (Array.isArray(value)) fields[k] = send === 'json' ? value.map((v) => (v === null ? blank : v)) : value.map((v) => (v === null ? '' : v));
        else fields[k] = value;
      }
      const body = send === 'json' && file ? { send, fields: { ...fields, [file.part]: file.content } } : { send, fields, ...(file ? { file } : {}) };
      return (as ?? this.A_or_V()).call(decl.method ?? 'POST', decl.path, body);
    };
    // "nothing" for an answer a child did not give is null, or an empty text: the maker's words allow both, so a refusal of the first is tried again with the second
    let reply = await attempt(null);
    if (!ok(reply) && Object.values(input).some((v) => Array.isArray(v) && v.includes(null))) {
      const again = await attempt('');
      if (ok(again)) reply = again;
    }
    return { reply, decl };
  }

  /** A client for what is open to visitors (calls of the rules). */
  A_or_V(): Client {
    return this.V;
  }

  /** What an answer holds for each output of the rule, by the paths the builder gave. An output judge.json does not map is left out (`NOT_MAPPED`): it is not compared. */
  extract(a: ActionSpec, decl: ActionDecl, json: unknown): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const p of a.outputs) {
      const d = this.partKey(decl.output, p)?.value;
      if (d === undefined) {
        out[p.id] = NOT_MAPPED;
        continue;
      }
      if (typeof d === 'string') {
        out[p.id] = at(json, d);
        continue;
      }
      let list = at(json, d.path);
      const subs = p.items ?? [];
      // an object of one thing for each key ({ "2027-05-08": 35.5 }) is a list of what it holds: the key, then the value
      if (list && typeof list === 'object' && !Array.isArray(list) && subs.length === 2) list = Object.entries(list).map(([k, v]) => ({ __0: k, __1: v }));
      if (!Array.isArray(list)) {
        out[p.id] = list;
        continue;
      }
      out[p.id] = list.map((item) => {
        const one: Record<string, unknown> = {};
        for (const [i, sub] of subs.entries()) {
          const key = declared(d.item, sub.id, sub.names);
          if (item && typeof item === 'object' && '__0' in item) one[sub.id] = (item as any)[`__${i}`];
          // a line of words ("Tomatoes: sow indoors, 2027-02-20") where an item was asked for: each part is looked for in it
          else if (typeof item === 'string') one[sub.id] = new WholeLine(item);
          else one[sub.id] = key ? at(item, key.value) : NOT_MAPPED;
        }
        return one;
      });
    }
    return out;
  }

  /** Whether an answer's value is the case's, for the part's kind; null when it is (or when it was not mapped, which is not compared). */
  equal(p: PartSpec, got: unknown, wanted: unknown): string | null {
    if (got === NOT_MAPPED) return null;
    if (p.kind === 'rows') {
      if (!Array.isArray(got)) return `${p.id} is not a list`;
      const w = wanted as Record<string, unknown>[];
      if (got.length !== w.length) return `${p.id} has ${got.length} item(s), not ${w.length}`;
      for (const [i, item] of w.entries()) {
        for (const sub of p.items ?? []) {
          if (!(sub.id in item)) continue;
          const bad = this.equal(sub, (got[i] as any)?.[sub.id], item[sub.id]);
          if (bad) return `${p.id} item ${i + 1}: ${bad}`;
        }
      }
      return null;
    }
    const line = got instanceof WholeLine ? got.text : null;
    if (p.kind === 'number' || p.kind === 'whole') {
      if (line !== null) return numberTokens(line).some((t) => Math.abs(t.value - Number(wanted)) <= (p.tol ?? 0) + 1e-9) ? null : `${p.id}: ${Number(wanted)} is not in "${line.slice(0, 60)}"`;
      const n = typeof got === 'string' && got.trim() !== '' ? Number(got.replace(/[£€$,]/g, '')) : got;
      if (typeof n !== 'number' || Number.isNaN(n)) return `${p.id} is ${JSON.stringify(got)}, not a number`;
      return Math.abs(n - Number(wanted)) <= (p.tol ?? 0) + 1e-9 ? null : `${p.id} is ${n}, not ${wanted}`;
    }
    if (p.kind === 'day') {
      const text = line ?? (typeof got === 'string' ? got : null);
      return text !== null && dayMatches(text, String(wanted)) ? null : `${p.id} is ${JSON.stringify(line ?? got)}, not the day ${wanted}`;
    }
    if (p.kind === 'text') {
      if (line !== null) return fold(line).includes(fold(String(wanted))) ? null : `${p.id}: "${wanted}" is not in "${line.slice(0, 60)}"`;
      return typeof got === 'string' && fold(got) === fold(String(wanted)) ? null : `${p.id} is ${JSON.stringify(got)}, not ${JSON.stringify(wanted)}`;
    }
    return JSON.stringify(got) === JSON.stringify(wanted) ? null : `${p.id} is ${JSON.stringify(got)}`;
  }

  async rules(): Promise<void> {
    for (const a of this.e.actions ?? []) {
      const found = this.actionDecl(a);
      if (!found) {
        this.skip(['rule-cases', 'rule-edges', 'bad-input-refused'], `judge.json has no entry in "actions" for ${a.id}`);
        continue;
      }
      for (const [id, group, say] of [['rule-cases', a.cases, "the maker's own worked examples"], ['rule-edges', a.edges, 'the easy-to-get-wrong cases']] as const) {
        const problems: string[] = [];
        const left: string[] = [];
        let tried = 0;
        for (const c of group) {
          const lacking = this.unmapped(a, c.in);
          const mappedOut = Object.keys(c.out ?? {}).filter((pid) => this.partKey(found.decl.output, a.outputs.find((p) => p.id === pid)!));
          if (lacking.length > 0 || mappedOut.length === 0) {
            left.push(`${c.label} (${lacking.length > 0 ? `no key for ${lacking.join(', ')}` : 'none of its answers is mapped'})`);
            continue;
          }
          tried++;
          const r = await this.callAction(a, c.in);
          if (!r) continue;
          if (!ok(r.reply) || r.reply.json === null) {
            problems.push(`${c.label}: answered ${short(r.reply)}`);
            continue;
          }
          const got = this.extract(a, r.decl, r.reply.json);
          for (const [pid, wanted] of Object.entries(c.out ?? {})) {
            const bad = this.equal(a.outputs.find((p) => p.id === pid)!, got[pid], wanted);
            if (bad) {
              problems.push(`${c.label}: ${bad}`);
              break;
            }
          }
        }
        if (tried === 0) this.skip([id], `judge.json gives no way to send or read any of the ${group.length} cases`);
        else this.verdict(id, problems, `${tried} case(s) of ${say} give what the maker's words give${left.length ? ` (${left.length} not tried: ${left.slice(0, 2).join('; ')}; counted in judge-json)` : ''}`);
      }
      const problems: string[] = [];
      const left: string[] = [];
      let tried = 0;
      for (const c of a.refused) {
        const lacking = this.unmapped(a, c.in);
        if (lacking.length > 0) {
          left.push(`${c.label} (no key for ${lacking.join(', ')})`);
          continue;
        }
        tried++;
        const r = await this.callAction(a, c.in);
        if (!r) continue;
        if (ok(r.reply)) problems.push(`${c.label}: was given an answer (${r.reply.status})`);
        else if (!refused(r.reply)) problems.push(`${c.label}: answered ${short(r.reply)}, a refusal is a 4xx`);
        else if (!saysSomething(r.reply)) problems.push(`${c.label}: refused with no sentence a person can read`);
      }
      if (tried === 0) this.skip(['bad-input-refused'], 'judge.json gives no key for any input of the rule');
      else this.verdict('bad-input-refused', problems, `${tried} inputs that make no sense are each refused (4xx) with a sentence and no answer${left.length ? ` (${left.length} not tried: ${left.slice(0, 2).join('; ')}; counted in judge-json)` : ''}`);
    }
  }

  /** The score board: plays are sent, then the board is read from its list. Every place, in order. */
  async board(): Promise<void> {
    const spec = this.e.board!;
    const action = this.e.actions!.find((a) => a.id === spec.action)!;
    const b = this.bound.get(spec.kind);
    if (!b || !b.decl.list) return this.skip(['board-rules'], 'judge.json has no "things" entry with a "list" for the score board');
    if (!this.actionDecl(action)) return this.skip(['board-rules'], 'judge.json has no way to play (an entry in "actions")');
    const lacking = [...new Set(spec.plays.flatMap((p) => this.unmapped(action, p)))];
    if (lacking.length > 0) return this.skip(['board-rules'], `judge.json gives no key for ${lacking.join(', ')} in the way to play`);
    const problems: string[] = [];
    for (const play of spec.plays) {
      const r = await this.callAction(action, play);
      if (!r || !ok(r.reply)) problems.push(`a play of "${String(play.name)}" answered ${r ? short(r.reply) : 'nothing'}`);
    }
    const got = await list(this.V, b);
    if (!got.rows) problems.push(`the board answered ${short(got.reply)}, not a list`);
    else {
      const read = got.rows.map((r) => Object.fromEntries([...b.fields].map(([id, f]) => [id, at(r, f.key)])));
      if (read.length !== spec.expect.length) problems.push(`the board has ${read.length} place(s), it should have ${spec.expect.length}: ${read.map((r) => `${r.name} ${r.points}`).join(', ')}`);
      for (const [i, want] of spec.expect.entries()) {
        const have = read[i];
        if (!have) break;
        // only what judge.json says where to read (the others are said missing once, in judge-json)
        const wrong = [b.fields.has('name') && fold(String(have.name ?? '')) !== fold(String(want.name)) ? `name ${JSON.stringify(have.name)} for ${JSON.stringify(want.name)}` : '', b.fields.has('points') && Number(have.points) !== Number(want.points) ? `points ${have.points} for ${want.points}` : '', b.fields.has('seconds') && Math.abs(Number(have.seconds) - Number(want.seconds)) > 0.01 ? `seconds ${have.seconds} for ${want.seconds}` : ''].filter(Boolean);
        if (wrong.length > 0) {
          problems.push(`place ${i + 1} has ${wrong.join(', ')}`);
          break;
        }
      }
    }
    this.verdict('board-rules', problems, `after ${spec.plays.length} plays the board has ${spec.expect.length} place(s), each name once with its best play, best first, ties as the maker said`);
  }
  boardSeen = '';

  /** The board as it is at the end of the run, to compare with it after the restart. */
  async boardSnapshot(): Promise<void> {
    const b = this.bound.get(this.e.board!.kind);
    if (!b) return;
    const got = await list(this.V, b);
    this.boardSeen = JSON.stringify((got.rows ?? []).map((r) => Object.fromEntries([...b.fields].map(([id, f]) => [id, at(r, f.key)]))));
  }

  // ---------------------------------------------------------------------------------------------- a second start
  async keeps(): Promise<void> {
    const problems: string[] = [];
    let reader: Client | undefined = this.V;
    if (this.e.accounts !== 'none') reader = this.A ? (await this.signInAgain('owner')).client : undefined;
    if (!reader) return this.cannot('keeps-after-restart', 'no one could sign in before, so what was kept could not be looked for');
    for (const b of this.stateful()) {
      const got = await list(reader, b);
      const text = JSON.stringify(got.rows ?? []);
      if (!got.rows) problems.push(`${b.name}: the list answered ${short(got.reply)} after the restart`);
      else {
        const missing = this.markersOf(b).filter((m) => !text.includes(m));
        if (missing.length > 0) problems.push(`${b.name}: ${missing.length} of ${this.markersOf(b).length} row(s) added before are gone`);
      }
    }
    if (this.e.board) {
      const b = this.bound.get(this.e.board.kind);
      if (b) {
        const got = await list(this.V, b);
        const read = JSON.stringify((got.rows ?? []).map((r) => Object.fromEntries([...b.fields].map(([id, f]) => [id, at(r, f.key)]))));
        if (read !== this.boardSeen) problems.push('the score board is not what it was before the restart');
      }
    }
    this.verdict('keeps-after-restart', problems, 'the rows (and the score board) are all still there after the app is stopped and started again in the same data folder');
  }
}

// ------------------------------------------------------------------------------------------------ the whole run

export async function judge(o: Options): Promise<Result> {
  const run = new Run(o);
  run.dataDir = mkdtempSync(join(tmpdir(), 'hydor-versus-data-'));
  const timing = { build: null as number | null, start: null as number | null };
  try {
    const parsed = run.readJudgeJson();
    if (!parsed) run.rest(run.order, 'judge.json is missing or cannot be read, so nothing could be found or started');
    else {
      const built = run.build();
      timing.build = run.timing.build;
      const accounts = run.e.accounts;
      if (!built) run.rest(run.order, 'the build did not work, so the app could not be started');
      else if (!(await run.start(accounts === 'any'))) {
        run.fail('starts', run.startError);
        run.rest(run.order, 'the app did not start');
      } else {
        timing.start = Math.round(run.proc.startedInSeconds * 10) / 10;
        run.pass('starts', `the app answered ${Math.round(run.proc.startedInSeconds * 10) / 10} s after it was started, in an empty data folder, on the port the judge gave`);
        run.V = run.newClient('visitor');
        const guard = async (ids: string[], f: () => Promise<unknown>) => {
          try {
            await f();
          } catch (error) {
            run.rest(ids, `it stopped on an error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300));
          }
        };
        await guard(['name-shown', 'second-page'], () => run.publicPages());
        if (run.e.accounts !== 'none' && !run.j!.accounts) run.skip(['account', 'signup-policy'], 'judge.json has no "accounts" (how to make an account and sign in)');
        else await guard(['account', 'signup-policy'], () => run.people());
        await guard(['phrases-shown'], () => run.phrases());
        const stateful = run.e.kinds.some((k) => !k.readOnly);
        if (run.e.board) await guard(['board-rules'], () => run.board());
        if (stateful) {
          const behind = ['add-and-read', 'required-fields', 'bad-values', 'change-remove', 'visitor-shut-out', 'team-shares', 'others-cannot', 'home-numbers', 'keeps-after-restart'];
          const usable = run.stateful();
          const unusable = run.e.kinds.filter((k) => !k.readOnly && !usable.some((b) => b.kind.id === k.id)).map((k) => `${k.id} (${run.excluded.get(k.id) ?? 'no usable list and add'})`);
          if (run.e.accounts !== 'none' && !run.j!.accounts) run.skip(behind, 'judge.json has no "accounts" (how to make an account and sign in), which everything about the rows needs');
          else if (usable.length === 0) run.skip(behind, `no kind of thing could be tried: ${unusable.join('; ')}`);
          else if (!run.A && run.e.accounts !== 'none') run.rest(behind, 'no one could sign in, so no row could be added or read');
          else if (run.e.teams && !run.j!.teams) run.skip([...behind, 'teams-isolation', 'teams-invite', 'teams-two', 'teams-removal'], 'judge.json has no "teams" (how a person makes a team, invites into it and takes someone out), which every row of a team needs');
          else {
            if (run.e.teams) await guard(['add-and-read'], () => crewsSetup(run));
            await guard(['add-and-read'], () => run.addAndRead());
            if (run.e.access === 'own') {
              // the second person's rows are in before the numbers are read: they must not be counted
              await guard(['others-cannot'], () => run.addTheirs());
            }
            if (run.e.numbers.length > 0) await guard(['home-numbers'], () => run.homeNumbers());
            await guard(['required-fields', 'bad-values'], () => run.requiredAndBad());
            if (run.order.includes('change-remove')) await guard(['change-remove'], () => run.changeRemove());
            await guard(['visitor-shut-out'], () => run.visitorShutOut());
            if (run.order.includes('others-cannot') || run.order.includes('team-shares')) await guard(['others-cannot', 'team-shares'], () => run.others());
          }
        }
        if (run.A || run.e.accounts === 'none') {
          // a scenario that needs a kind the judge cannot send rows of is not checked, and says why
          const left = (kinds: string[]) => kinds.filter((k) => run.excluded.has(k)).map((k) => `${k}, because ${run.excluded.get(k)}`).join('; ');
          const scenario = async (ids: string[], kinds: string[], go: () => Promise<void>) => (left(kinds) ? run.skip(ids, `not checked for ${left(kinds)}`) : guard(ids, go));
          if (run.e.club) await scenario(['club-roles', 'club-payments'], [run.e.club.details, run.e.club.notices], () => club(run));
          if (run.e.teams && run.j!.teams) await scenario(['teams-isolation', 'teams-invite', 'teams-two', 'teams-removal'], run.e.teams.kinds, () => crews(run));
          if (run.e.kb) await scenario(['kb-reading', 'kb-search', 'kb-category', 'kb-address', 'kb-drafts'], [run.e.kb.kind], () => kb(run));
          if (run.e.booking) await scenario(['booking-slots', 'booking-once', 'booking-cancel', 'booking-dayoff', 'booking-timezone'], [run.e.booking.hours, run.e.booking.daysOff], () => booking(run));
        } else run.rest(run.order.filter((id) => /^(club|teams|kb|booking)-/.test(id)), 'no one could sign in');
        if (run.e.actions?.length && !run.e.booking) await guard(['rule-cases', 'rule-edges', 'bad-input-refused'], () => run.rules());
        if (run.e.board) await guard(['keeps-after-restart'], () => run.boardSnapshot());
        if (run.A) await guard([], async () => run.rawPages.push((await run.A!.page(run.j!.home ?? '/')).text));
        await guard(['no-secret-in-browser'], () => run.noSecrets());
        const stopped = await run.proc.stop();
        if (stopped.stopped) run.pass('stops', `the app stopped ${stopped.took.toFixed(1)} s after it was asked, and nothing answers on the port`);
        else run.fail('stops', 'the app did not stop within 10 seconds of being asked (SIGTERM), or something still answered on the port');
        if (run.order.includes('keeps-after-restart') && !run.lines.has('keeps-after-restart')) {
          if (await run.start(accounts === 'any')) {
            await guard(['keeps-after-restart'], () => run.keeps());
            await run.proc.stop();
          } else run.fail('keeps-after-restart', `the app did not start again in the same data folder: ${run.startError}`);
        }
      }
    }
  } catch (error) {
    run.rest(run.order, `the judge stopped on an error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300));
  } finally {
    await run.proc.stop();
    rmSync(run.dataDir, { recursive: true, force: true });
  }
  run.annotateExcluded(['add-and-read', 'required-fields', 'bad-values', 'change-remove', 'visitor-shut-out', 'team-shares', 'others-cannot', 'home-numbers', 'keeps-after-restart']);
  const lines = run.order.map((id) => run.lines.get(id) ?? { id, status: 'could-not-run' as Status, say: 'nothing was said for this line' });
  const passed = lines.filter((l) => l.status === 'pass').length;
  const notChecked = lines.filter((l) => l.status === 'not-checked').length;
  const total = lines.length - notChecked;
  return { brief: run.e.id, lines, score: { passed, total, notChecked, all: passed === total }, timing, notes: run.notes };
}

export function render(r: Result): string {
  const mark = { pass: 'pass ', fail: 'FAIL ', 'could-not-run': 'n/a  ', 'not-checked': 'skip ' } as const;
  const out = [`${r.brief}: ${r.score.passed} of ${r.score.total} lines passed${r.score.all ? '' : ' (not all)'}${r.score.notChecked ? `; ${r.score.notChecked} not checked, left out of the count` : ''}`];
  for (const l of r.lines) out.push(`  ${mark[l.status]} ${l.id}: ${l.status === 'could-not-run' ? 'could not run: ' : ''}${l.say}`);
  for (const n of r.notes) out.push(`  note: ${n}`);
  return out.join('\n');
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { port: { type: 'string' }, change: { type: 'boolean' }, json: { type: 'boolean' } } });
  const [app, brief] = positionals;
  if (!app || !brief || !existsSync(app) || !existsSync(briefFile(resolve(brief), values.change ? 'change' : 'expect'))) {
    console.error('usage: node scripts/webapp-bench/judge.ts <app folder> <brief folder> [--port 4760] [--change] [--json]');
    return 2;
  }
  const result = await judge({ app: resolve(app), brief: resolve(brief), port: Number(values.port ?? 4760), change: values.change === true });
  console.log(values.json ? JSON.stringify(result, null, 2) : render(result));
  return result.score.all ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) process.exit(await main());
