// read_page: a page's readable text for agents that have no fetch of their own, in parts when it is
// long; or, given a question, only the parts that answer it (Naget's context filter, or failing
// that the paragraphs that share the most words with the question). Pages come through the app's safe
// fetch: public addresses only.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { formatPage } from '../../shared/search.ts';
import type { DocumentText } from '../documents/extract.ts';
import { assertPublic, BlockedAddress, type FetchedPage } from '../web/fetch.ts';
import type { PageArgs } from './args.ts';
import { contextFilter, type Filtered } from './naget.ts';
import { SearchError, type ProviderCtx } from './types.ts';

/** About 3,000 words: a part a small model can hold beside its work. */
export const PART_CHARS = 12_000;

export interface ReadDeps {
  fetchPage(url: string, o: { timeoutMs?: number; maxBytes?: number }): Promise<FetchedPage>;
  /** Text from a document file (PDF…), or null when that format cannot be read here. */
  extract(file: string): Promise<DocumentText | null>;
  /** Naget Search's settings, while it is on: its context filter answers questions. */
  naget?: ProviderCtx;
  /** Why Naget's filter is not used, when it is not (off, or resting after a failure). */
  nagetWhy?: string;
  /** Naget's filter failed: it rests as after a failed search. */
  nagetFailed?(e: SearchError): void;
}

export interface ReadResult {
  text: string;
  isError?: boolean;
  /** What was read, for the turn's sources. */
  source?: { url: string; title?: string };
}

interface Readable {
  url: string;
  title?: string;
  text: string;
  /** How it was read, when not as a web page ("PDF, 12 pages"). */
  kind?: string;
}

/** Splits text into parts of about `size` characters, at paragraph breaks where it can. */
export function parts(text: string, size = PART_CHARS): string[] {
  const out: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) out.push(cur);
    cur = '';
  };
  for (let para of text.split(/\n{2,}/)) {
    while (para.length > size) {
      flush();
      const at = Math.max(para.lastIndexOf(' ', size), Math.floor(size / 2));
      out.push(para.slice(0, at));
      para = para.slice(at).trimStart();
    }
    if (cur && cur.length + para.length + 2 > size) flush();
    cur = cur ? `${cur}\n\n${para}` : para;
  }
  flush();
  return out.length ? out : [''];
}

const STOP = new Set(
  'the and for with that this what which who whom whose when where why how are was were been being have has had does did not but from into onto about over under than then them they their there these those its your you our out off can could should would will shall may might must also just only very more most some such any each other all both few own same too yet nor per via'.split(' '),
);

/** The paragraphs that share the most words with a question, in page order, within `max` characters. */
export function nearest(text: string, question: string, max = 6000): string {
  const words = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter((w) => !STOP.has(w));
  if (!words.length) return '';
  const any = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const scored = text
    .split(/\n{2,}|\n(?=\S)/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20)
    .map((p, i) => {
      const low = p.toLowerCase();
      const distinct = words.filter((w) => low.includes(w)).length;
      // Distinct words first; how often they come up only breaks ties.
      return { i, p, score: distinct + Math.min(0.9, (low.match(any)?.length ?? 0) / 50) };
    })
    .filter((s) => s.score >= 1);
  const keep: typeof scored = [];
  let size = 0;
  for (const s of scored.sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (size + s.p.length > max) continue;
    keep.push(s);
    size += s.p.length + 2;
  }
  return keep
    .sort((a, b) => a.i - b.i)
    .map((s) => s.p)
    .join('\n\n');
}

const cache = new Map<string, { at: number; page: Readable }>();
const blocked = (url: string, e: Error): ReadResult => ({ text: `${url} cannot be read: ${e.message}. Only public web pages can be read.`, isError: true });

/** A page's readable text: fetched once, then kept for ten minutes (so its next part comes at once). */
async function load(url: string, d: ReadDeps): Promise<{ page: Readable } | { fail: ReadResult }> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 10 * 60_000) return { page: hit.page };
  let p: FetchedPage;
  try {
    p = await d.fetchPage(url, { timeoutMs: 30_000, maxBytes: 10_000_000 });
  } catch (e) {
    if (e instanceof BlockedAddress) return { fail: blocked(url, e) };
    const why = (e as Error)?.name === 'TimeoutError' ? 'it did not answer within 30 seconds' : ((e as Error)?.message ?? String(e));
    return { fail: { text: `${url} could not be read: ${why}.`, isError: true } };
  }
  if (p.status >= 400) return { fail: { text: `The site answered ${p.status} for ${p.url}.${p.text.trim() ? `\n\n${p.text.trim().slice(0, 1500)}` : ''}`, isError: true } };
  let page: Readable;
  if ((/pdf/i.test(p.contentType) || p.body?.subarray(0, 5).toString() === '%PDF-') && p.body) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'naget-page-'));
    let doc: DocumentText | null = null;
    try {
      const file = path.join(dir, 'page.pdf');
      await fs.writeFile(file, p.body);
      doc = await d.extract(file).catch(() => null);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    if (!doc?.text.trim()) {
      const ask = d.naget ? ' Ask with a question to get the parts of it that answer it: Naget Search reads PDFs.' : '';
      return { fail: { text: `${p.url} is a PDF (${Math.round(p.body.length / 1024)} KB), and PDFs cannot be read whole here yet.${ask}`, isError: !d.naget } };
    }
    page = { url: p.url, text: doc.text, kind: `PDF${doc.parts ? `, ${doc.parts} pages` : ''}${doc.note ? ` (${doc.note})` : ''}` };
  } else if (!p.text.trim()) {
    return { fail: { text: p.body?.length ? `${p.url} is a ${p.contentType || 'binary'} file, not a page with text.` : `${p.url} has no text.`, isError: true } };
  } else page = { url: p.url, title: p.title, text: p.text };
  cache.set(url, { at: Date.now(), page });
  if (cache.size > 30) cache.delete(cache.keys().next().value!);
  return { page };
}

/** Reads a page whole (one part of it), or the parts of it that answer a question. */
export async function readPage(a: PageArgs, d: ReadDeps): Promise<ReadResult> {
  if (a.question) return answer(a.url, a.question, d);
  const r = await load(a.url, d);
  if ('fail' in r) return r.fail;
  const { page } = r;
  const all = parts(page.text);
  if (a.page > all.length) return { text: `${page.url} has ${all.length} part${all.length === 1 ? '' : 's'}; there is no part ${a.page}.`, isError: true };
  const detail = [page.kind, all.length > 1 ? `part ${a.page} of ${all.length}` : ''].filter(Boolean).join(', ');
  const footer = a.page < all.length ? `More: read_page with page ${a.page + 1} (of ${all.length}) for the next part, or with a question for just the parts that answer it.` : undefined;
  return { text: formatPage({ title: page.title, url: page.url, detail: detail || undefined, body: all[a.page - 1], footer }), source: { url: page.url, title: page.title } };
}

const count = (n: number) => n.toLocaleString('en-US');

async function answer(url: string, question: string, d: ReadDeps): Promise<ReadResult> {
  let why = d.nagetWhy ?? 'Naget Search is off in Settings → Search';
  if (d.naget) {
    try {
      // Never hand a private address to a service outside.
      await assertPublic(new URL(url));
      let f: Filtered;
      try {
        f = await contextFilter(d.naget, { query: question, url });
      } catch (e) {
        // A page Naget cannot reach may still be readable from here: send its text instead.
        if (!(e instanceof SearchError && e.code === 'page_unreadable')) throw e;
        const r = await load(url, d);
        if ('fail' in r) return r.fail;
        f = { ...(await contextFilter(d.naget, { query: question, text: r.page.text.slice(0, 500_000) })), title: r.page.title, url: r.page.url };
      }
      const at = f.url ?? url;
      const detail = `the parts that answer ${JSON.stringify(question)}${f.keptWords != null && f.inputWords ? ` (${count(f.keptWords)} of ${count(f.inputWords)} words)` : ''}`;
      const body = f.text || 'Nothing on this page answers that. Read it whole (read_page without question), or try another page.';
      return { text: formatPage({ title: f.title, url: at, detail, body }), source: { url: at, title: f.title } };
    } catch (e) {
      if (e instanceof BlockedAddress) return blocked(url, e);
      if (e instanceof SearchError && e.kind === 'invalid') return { text: e.message, isError: true };
      if (e instanceof SearchError) d.nagetFailed?.(e);
      why = e instanceof SearchError ? e.message : `Naget Search failed (${(e as Error)?.message ?? e})`;
    }
  }
  // Without Naget's filter: the paragraphs that share the most words with the question.
  const r = await load(url, d);
  if ('fail' in r) return r.fail;
  const { page } = r;
  const near = nearest(page.text, question);
  const detail = near ? `the paragraphs that share the most words with ${JSON.stringify(question)}` : 'its beginning (no paragraph shares words with the question)';
  const footer = `(${why.replace(/\.$/, '')}, so these were picked by their words. Read the page whole if they miss the answer.)`;
  return { text: formatPage({ title: page.title, url: page.url, detail, body: near || parts(page.text)[0], footer }), source: { url: page.url, title: page.title } };
}
