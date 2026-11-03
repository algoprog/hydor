// Watchers: cheap checks that make no model call and wake a task's agent only when something
// changed: new items in an RSS or Atom feed, a page's readable text (or a part of it), a value in
// JSON, new files in a folder, a command's output or exit code. Each keeps what it saw last (its
// state) to compare with; the first look only takes note. What they read comes from outside: the
// scheduler quotes it to the agent as data, never as instructions.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { JsonOp, WatchSpec } from '../../shared/automations.ts';
import { HttpError } from '../auth.ts';
import { assertPublic, decodeEntities, htmlText } from '../web/fetch.ts';
import { parseSelector, selectText } from './select.ts';

export interface WatchResult {
  /** Something new: the agent should wake. */
  changed: boolean;
  /** What changed, for the agent. */
  report?: string;
  /** One line for the task list: "12 items, 2 new". */
  note: string;
  /** What it sees now, shortened (the Test button shows it). */
  sample: string;
  /** What to compare with next time. */
  state: unknown;
}

const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---- the checks' inputs ---------------------------------------------------------------------------

/** A page's body, following redirects itself; only public addresses unless the watcher allows this machine's network. */
async function fetchText(input: string, local?: boolean, maxBytes = 3_000_000): Promise<{ url: string; type: string; text: string }> {
  const signal = AbortSignal.timeout(30_000);
  let url = new URL(input);
  for (let hop = 0; ; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https addresses');
    if (!local) await assertPublic(url);
    const r = await fetch(url, { redirect: 'manual', signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; Hydor watcher)', accept: '*/*' } });
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) {
      if (hop >= 8) throw new Error('Too many redirects');
      url = new URL(loc, url);
      continue;
    }
    if (r.status >= 400) throw new Error(`${url.host} answered ${r.status} ${r.statusText}`.trim());
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of r.body ?? []) {
      const b = Buffer.from(c as Uint8Array);
      chunks.push(b);
      size += b.length;
      if (size > maxBytes) break;
    }
    const body = Buffer.concat(chunks).subarray(0, maxBytes);
    const type = r.headers.get('content-type') ?? '';
    // In the character set the header or the page's own <meta> names.
    const charset = (/charset=["']?([\w-]+)/i.exec(type)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(body.subarray(0, 4096).toString('latin1'))?.[1] ?? 'utf-8').toLowerCase();
    let text: string;
    try {
      text = new TextDecoder(charset).decode(body);
    } catch {
      text = body.toString('utf8');
    }
    return { url: url.toString(), type, text };
  }
}

/** A command's output (stdout and stderr together) and exit code, in a minute at most. */
export function runCommand(command: string, cwd: string, timeoutMs = 60_000): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const p = spawn('/bin/sh', ['-c', command], { cwd: fs.existsSync(cwd) ? cwd : os.homedir(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const add = (b: Buffer) => {
      if (out.length < 200_000) out += b.toString('utf8');
    };
    p.stdout.on('data', add);
    p.stderr.on('data', add);
    const timer = setTimeout(() => {
      try {
        process.kill(-p.pid!, 'SIGKILL');
      } catch {}
      out += `\n[stopped after ${Math.round(timeoutMs / 1000)} s]`;
    }, timeoutMs);
    p.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: 127, output: e.message });
    });
    p.on('close', (code, sig) => {
      clearTimeout(timer);
      resolve({ code: code ?? (sig ? 128 : 1), output: out.trimEnd() });
    });
  });
}

// ---- feeds -----------------------------------------------------------------------------------------

export interface FeedItem {
  id: string;
  title: string;
  link?: string;
  date?: string;
  summary?: string;
}

/** An element's content: CDATA unwrapped, entities read. */
function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  if (!m) return undefined;
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(m[1]);
  return (cdata ? cdata[1] : decodeEntities(m[1])).trim();
}

const plain = (s: string | undefined) => (s ? htmlText(s).replace(/\s+/g, ' ').trim() : '');

/** An RSS or Atom feed's title and items, newest as the feed lists them. */
export function parseFeed(xml: string): { title?: string; items: FeedItem[] } {
  const atom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const firstItem = xml.search(atom ? /<entry[\s>]/i : /<item[\s>]/i);
  const title = plain(tag(firstItem >= 0 ? xml.slice(0, firstItem) : xml, 'title')) || undefined;
  const items = blocks.map((b): FeedItem => {
    const link = atom ? (/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i.exec(b) ?? /<link[^>]*href=["']([^"']+)/i.exec(b))?.[1] : tag(b, 'link');
    const t = plain(tag(b, 'title'));
    const summary = plain(tag(b, atom ? 'summary' : 'description') ?? tag(b, 'content') ?? tag(b, 'content:encoded'));
    return {
      id: (atom ? tag(b, 'id') : tag(b, 'guid')) || link || t,
      title: t || '(untitled)',
      link: link ? decodeEntities(link) : undefined,
      date: tag(b, atom ? 'updated' : 'pubDate') ?? tag(b, 'published') ?? tag(b, 'dc:date'),
      summary: summary ? clip(summary, 400) : undefined,
    };
  });
  return { title, items };
}

const itemText = (i: FeedItem) => [`- ${i.title}`, i.link && `  ${i.link}`, i.date && `  ${i.date}`, i.summary && `  ${i.summary}`].filter(Boolean).join('\n');

async function checkFeed(w: Extract<WatchSpec, { kind: 'feed' }>, prev: { seen: string[] } | undefined): Promise<WatchResult> {
  const page = await fetchText(w.url, w.local);
  const feed = parseFeed(page.text);
  if (!feed.items.length && !/<(rss|feed|rdf:RDF)[\s>]/i.test(page.text)) throw new Error('That address is not an RSS or Atom feed');
  const seen = new Set(prev?.seen ?? []);
  const fresh = prev ? feed.items.filter((i) => !seen.has(i.id)) : [];
  const all = [...new Set([...feed.items.map((i) => i.id), ...(prev?.seen ?? [])])].slice(0, 1000);
  const name = feed.title ?? new URL(page.url).host;
  return {
    changed: fresh.length > 0,
    report: fresh.length ? `${plural(fresh.length, 'new item')} in ${name}:\n\n${fresh.slice(0, 25).map(itemText).join('\n\n')}` : undefined,
    note: `${plural(feed.items.length, 'item')}${fresh.length ? `, ${fresh.length} new` : prev ? '' : ' (first look)'}`,
    sample: `${name}\n\n${feed.items.slice(0, 8).map(itemText).join('\n\n')}`,
    state: { seen: all },
  };
}

// ---- pages -----------------------------------------------------------------------------------------

/** The lines that mention `text`, each with the line before and after. */
export function linesNear(page: string, text: string): string {
  const lines = page.split('\n').map((l) => l.trim()).filter(Boolean);
  const want = text.toLowerCase();
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (l.toLowerCase().includes(want)) for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < lines.length) keep.add(j);
  });
  return [...keep]
    .sort((a, b) => a - b)
    .map((i) => lines[i])
    .join('\n');
}

/** Lines added and removed between two texts (as sets of lines, which is what a reader notices). */
export function lineDiff(before: string, after: string): { added: string[]; removed: string[] } {
  const a = before.split('\n').filter(Boolean);
  const b = after.split('\n').filter(Boolean);
  const count = (l: string[]) => l.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  const ca = count(a);
  const cb = count(b);
  const added = b.filter((x) => {
    const n = ca.get(x) ?? 0;
    if (n > 0) {
      ca.set(x, n - 1);
      return false;
    }
    return true;
  });
  const removed = a.filter((x) => {
    const n = cb.get(x) ?? 0;
    if (n > 0) {
      cb.set(x, n - 1);
      return false;
    }
    return true;
  });
  return { added, removed };
}

const tidy = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

async function checkPage(w: Extract<WatchSpec, { kind: 'page' }>, prev: { hash: string; text: string } | undefined): Promise<WatchResult> {
  const page = await fetchText(w.url, w.local);
  const html = /html/i.test(page.type) || /^\s*<(!doctype html|html)/i.test(page.text);
  let text = tidy(w.selector ? selectText(page.text, w.selector) : html ? htmlText(page.text) : page.text);
  if (w.selector && !text) throw new Error(`Nothing on the page matches ${w.selector}`);
  if (w.match) {
    text = linesNear(text, w.match);
    if (!text) throw new Error(`“${w.match}” is not on the page`);
  }
  text = text.slice(0, 60_000);
  const h = hash(text);
  const changed = !!prev && prev.hash !== h;
  let report: string | undefined;
  if (changed) {
    const d = lineDiff(prev!.text, text);
    const part = (title: string, lines: string[], mark: string) => (lines.length ? `${title}:\n${lines.slice(0, 60).map((l) => `${mark} ${clip(l, 400)}`).join('\n')}${lines.length > 60 ? `\n(and ${lines.length - 60} more)` : ''}` : '');
    report = [`${page.url} changed${w.selector ? ` (${w.selector})` : w.match ? ` (near “${w.match}”)` : ''}.`, part('Now on the page', d.added, '+'), part('No longer on the page', d.removed, '-'), text.length < 3000 ? `The part watched now reads:\n${text}` : '']
      .filter(Boolean)
      .join('\n\n');
  }
  return { changed, report, note: `${plural(text.split('\n').length, 'line')} of text${changed ? ', changed' : prev ? ', no change' : ' (first look)'}`, sample: clip(text, 4000), state: { hash: h, text: text.slice(0, 30_000) } };
}

// ---- JSON ------------------------------------------------------------------------------------------

/** The value at a path like "data.items[0].price" or "$.data.price". */
export function valueAt(data: unknown, p: string): unknown {
  const parts = p
    .replace(/^\$\.?/, '')
    .split(/\.|\[(\d+)\]/)
    .filter((x) => x !== undefined && x !== '');
  let v: unknown = data;
  for (const k of parts) {
    if (v == null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v;
}

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(/[,\s]/g, ''))) ? Number(v.replace(/[,\s]/g, '')) : null);

/** Whether a value meets a condition (numbers compare as numbers). */
export function meets(op: JsonOp, v: unknown, want = ''): boolean {
  const shown = typeof v === 'string' ? v : JSON.stringify(v);
  const a = num(v);
  const b = num(want);
  switch (op) {
    case 'eq':
      return a !== null && b !== null ? a === b : shown === want;
    case 'ne':
      return a !== null && b !== null ? a !== b : shown !== want;
    case 'gt':
      return a !== null && b !== null && a > b;
    case 'lt':
      return a !== null && b !== null && a < b;
    case 'contains':
      return shown.toLowerCase().includes(want.toLowerCase());
    default:
      return false;
  }
}

const OP_WORDS: Record<JsonOp, string> = { changed: 'changed', eq: 'equals', ne: 'is not', gt: 'is above', lt: 'is below', contains: 'contains' };

async function checkJson(w: Extract<WatchSpec, { kind: 'json' }>, prev: { value: string; hit?: boolean } | undefined): Promise<WatchResult> {
  const page = await fetchText(w.url, w.local);
  let data: unknown;
  try {
    data = JSON.parse(page.text);
  } catch {
    throw new Error('That address did not answer with JSON');
  }
  const v = valueAt(data, w.path);
  if (v === undefined) throw new Error(`There is nothing at ${w.path}`);
  const shown = clip(typeof v === 'string' ? v : JSON.stringify(v), 5000);
  const op = w.op ?? 'changed';
  if (op === 'changed') {
    const changed = !!prev && prev.value !== shown;
    return {
      changed,
      report: changed ? `${w.path} at ${page.url} is now ${shown} (it was ${prev!.value}).` : undefined,
      note: `${w.path} = ${clip(shown, 60)}${changed ? ' (changed)' : prev ? '' : ' (first look)'}`,
      sample: `${w.path} = ${clip(JSON.stringify(v, null, 2) ?? shown, 3000)}`,
      state: { value: shown },
    };
  }
  const hit = meets(op, v, w.value);
  // Wakes when it starts to hold, not on every check while it does.
  const changed = hit && !prev?.hit;
  return {
    changed,
    report: changed ? `${w.path} at ${page.url} is now ${shown}, which ${OP_WORDS[op]} ${w.value}${prev ? ` (it was ${prev.value})` : ''}.` : undefined,
    note: `${w.path} = ${clip(shown, 60)}: ${hit ? 'holds' : 'does not hold'}`,
    sample: `${w.path} = ${clip(JSON.stringify(v, null, 2) ?? shown, 3000)}\n\n${OP_WORDS[op]} ${w.value}: ${hit ? 'yes' : 'no'}`,
    state: { value: shown, hit },
  };
}

// ---- folders ---------------------------------------------------------------------------------------

const home = (p: string) => (p === '~' ? os.homedir() : p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);

/** "*.pdf", "report-??.csv": a file name pattern as a regular expression. */
function globRe(pattern: string): RegExp {
  const src = pattern
    .split('')
    .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${src}$`, 'i');
}

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

async function checkFolder(w: Extract<WatchSpec, { kind: 'folder' }>, prev: { seen: string[] } | undefined): Promise<WatchResult> {
  const dir = home(w.path);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`There is no folder at ${w.path}`);
  const re = w.pattern ? globRe(w.pattern) : null;
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.') && (!re || re.test(e.name)))
    .map((e) => {
      const st = fs.statSync(path.join(dir, e.name));
      return { name: e.name, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  const seen = new Set(prev?.seen ?? []);
  const fresh = prev ? files.filter((f) => !seen.has(f.name)) : [];
  const line = (f: (typeof files)[number]) => `- ${path.join(dir, f.name)} (${size(f.size)}, ${new Date(f.mtime).toISOString().slice(0, 16).replace('T', ' ')})`;
  return {
    changed: fresh.length > 0,
    report: fresh.length ? `${plural(fresh.length, 'new file')} in ${dir}:\n${fresh.slice(0, 100).map(line).join('\n')}` : undefined,
    note: `${plural(files.length, 'file')}${fresh.length ? `, ${fresh.length} new` : prev ? '' : ' (first look)'}`,
    sample: files.length ? files.slice(0, 20).map(line).join('\n') : '(no files)',
    state: { seen: files.map((f) => f.name).slice(0, 5000) },
  };
}

// ---- commands --------------------------------------------------------------------------------------

async function checkCommand(w: Extract<WatchSpec, { kind: 'command' }>, prev: { hash: string; exit: number; output: string } | undefined, cwd: string): Promise<WatchResult> {
  const r = await runCommand(w.command, cwd);
  const h = hash(r.output);
  const changed = !!prev && (w.on === 'exit' ? prev.exit !== r.code : prev.hash !== h);
  const tail = r.output.length > 6000 ? `…${r.output.slice(-6000)}` : r.output;
  let report: string | undefined;
  if (changed) {
    const d = w.on === 'exit' ? null : lineDiff(prev!.output, r.output.slice(-4000));
    report = [
      `The command: ${w.command}`,
      `Exit code: ${r.code}${prev!.exit !== r.code ? ` (it was ${prev!.exit})` : ''}`,
      d && d.added.length + d.removed.length < 80 ? `Lines new in its output:\n${d.added.map((l) => `+ ${l}`).join('\n') || '(none)'}\nLines gone:\n${d.removed.map((l) => `- ${l}`).join('\n') || '(none)'}` : '',
      `Its output now:\n${tail || '(nothing)'}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  return {
    changed,
    report,
    note: `exit ${r.code}, ${plural(r.output ? r.output.split('\n').length : 0, 'line')} of output${changed ? ', changed' : prev ? '' : ' (first look)'}`,
    sample: `exit code ${r.code}\n\n${clip(tail, 4000) || '(no output)'}`,
    state: { hash: h, exit: r.code, output: r.output.slice(-4000) },
  };
}

// ---- running a watcher -----------------------------------------------------------------------------

/** Looks once; `prev` is what the last look kept (undefined the first time, which only takes note). */
export async function checkWatch(w: WatchSpec, prev: unknown, o: { cwd: string }): Promise<WatchResult> {
  const p = prev as any;
  switch (w.kind) {
    case 'feed':
      return checkFeed(w, p);
    case 'page':
      return checkPage(w, p);
    case 'json':
      return checkJson(w, p);
    case 'folder':
      return checkFolder(w, p);
    case 'command':
      return checkCommand(w, p, o.cwd);
  }
}

const OPS: JsonOp[] = ['changed', 'eq', 'ne', 'gt', 'lt', 'contains'];

/** A watcher from a form or an agent, checked; throws an HttpError that says what is missing. */
export function validWatch(x: unknown): WatchSpec {
  const w = (x ?? {}) as Record<string, any>;
  const str = (v: unknown, max = 2000) => String(v ?? '').trim().slice(0, max);
  const url = () => {
    try {
      const u = new URL(str(w.url));
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
    } catch {}
    throw new HttpError(400, 'Give the watcher an http or https address');
  };
  const local = w.local === true ? { local: true as const } : {};
  switch (w.kind) {
    case 'feed':
      return { kind: 'feed', url: url(), ...local };
    case 'page': {
      const selector = str(w.selector, 300) || undefined;
      if (selector) parseSelector(selector);
      return { kind: 'page', url: url(), ...(str(w.match, 300) ? { match: str(w.match, 300) } : {}), ...(selector ? { selector } : {}), ...local };
    }
    case 'json': {
      const op: JsonOp = OPS.includes(w.op) ? w.op : 'changed';
      if (!str(w.path)) throw new HttpError(400, 'Say where the value is, like data.price');
      if (op !== 'changed' && !str(w.value, 500)) throw new HttpError(400, 'Give the value to compare with');
      return { kind: 'json', url: url(), path: str(w.path, 300), ...(op !== 'changed' ? { op, value: str(w.value, 500) } : {}), ...local };
    }
    case 'folder': {
      const p = str(w.path, 1000);
      if (!p || !path.isAbsolute(home(p))) throw new HttpError(400, 'Give the folder’s full path');
      return { kind: 'folder', path: p, ...(str(w.pattern, 200) ? { pattern: str(w.pattern, 200) } : {}) };
    }
    case 'command':
      if (!str(w.command)) throw new HttpError(400, 'Give the command to run');
      return { kind: 'command', command: str(w.command), on: w.on === 'exit' ? 'exit' : 'output' };
  }
  throw new HttpError(400, 'Pick what the watcher looks at');
}

/** Two watchers look at the same thing (a changed one starts afresh). */
export const sameWatch = (a: WatchSpec | undefined, b: WatchSpec | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
