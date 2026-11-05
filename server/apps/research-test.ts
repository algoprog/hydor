// Script tests for the ready-made apps for keeping up with a research field (templates-research.ts): their programs run
// in the sandbox on what the services answered once (an arXiv Atom feed, OpenAlex works, Semantic Scholar's author,
// papers and citations, a Hugging Face list and a model's page and card, ccfddl's and ai-deadlines' YAML), saved as
// fixtures, with the time fixed, and checked value by value; then Paper radar runs whole through the flow runner with
// stand-ins for the services and the model, its records kept, and read and changed through the routes as its own
// page does. With LIVE=1 the programs that only fetch and parse ask the real services instead (no model is asked).
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/research-test.ts
//   DATA_DIR=/tmp/hydor-test-research HYDOR_APPS_DIR=/tmp/hydor-test-research-apps node dist/dev/research-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { allSteps, type CodeStep } from '../../shared/app-manifest.ts';
import { isActive } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import { APP_ROOT } from '../config.ts';
import { openDb } from '../db.ts';
import { registerFeatures } from '../features/registry.ts';
import type { Deps, Feature, RunTool } from '../features/types.ts';
import { setHelperModel } from '../helper.ts';
import { USER_PROFILE } from '../memory/about-user.ts';
import { RANK_BY_INTEREST } from '../memory/interest.ts';
import { vaultTables } from '../connections/vault.ts';
import { AGENT_FILE } from '../models/config.ts';
import { Scheduler } from '../scheduler.ts';
import type { SessionManager } from '../sessions.ts';
import { runCode } from './code.ts';
import { findRecords } from './data.ts';
import { apps } from './index.ts';
import { startRun, startRuns, waitFor } from './runs.ts';
import * as store from './store.ts';
import { templateById } from './templates.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HYDOR_APPS_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
const LIVE = process.env.LIVE === '1';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-research-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
vaultTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const fixture = (name: string) => fs.readFileSync(path.join(APP_ROOT, 'server/apps/fixtures/research', name), 'utf8');

// ---- the services, as they answered once ------------------------------------------------------------------------

/** What http_request gives: its status line, a blank line, the body (cut as the tool cuts it). */
const answer = (url: string, body: string, max = 200_000) => ({ text: `HTTP 200 OK  ·  ${new URL(url).host}  ·  ${body.length} bytes\n\n${body.length > max ? `${body.slice(0, max)}\n… (cut at ${max.toLocaleString('en')} characters of ${body.length.toLocaleString('en')})` : body}` });

/** A service's answer to a request, by its address; what is not here fails as a 404 would. */
type Route = (url: URL) => string | { status: number } | null;
let routes: Route[] = [];
const asked: string[] = [];
async function fakeHttp(a: Record<string, unknown>): Promise<{ text: string }> {
  const url = new URL(String(a.url));
  asked.push(url.href);
  if (a.auth) throw new Error(`http_request: There is no key named ${a.auth} in the vault. Ask the user for it with request_secret.`);
  for (const r of routes) {
    const got = r(url);
    if (typeof got === 'string') return answer(url.href, got, Number(a.max_chars) || 40_000);
    if (got) throw new Error(`http_request: HTTP ${got.status} Too Many Requests  ·  ${url.host}`);
  }
  throw new Error(`http_request: HTTP 404 Not Found  ·  ${url.host}`);
}
/** The real services, for LIVE=1: the same answer's shape. */
async function liveHttp(a: Record<string, unknown>): Promise<{ text: string }> {
  if (a.auth) throw new Error(`http_request: There is no key named ${a.auth} in the vault.`);
  const r = await fetch(String(a.url), { headers: { 'User-Agent': 'Hydor (+https://github.com/algoprog/hydor)' }, signal: AbortSignal.timeout(60_000) });
  const body = await r.text();
  if (r.status >= 400) throw new Error(`http_request: HTTP ${r.status} ${r.statusText}  ·  ${new URL(String(a.url)).host}`);
  return answer(String(a.url), body, Number(a.max_chars) || 40_000);
}

/** What a program's ctx calls reach: the services, the app's records (kept here), and the tools named. */
function ctxOf(o: { data?: Map<string, Record<string, unknown>[]>; tools?: Record<string, (a: Record<string, unknown>) => unknown> } = {}) {
  const data = o.data ?? new Map<string, Record<string, unknown>[]>();
  const calls: { kind: string; args: Record<string, unknown> }[] = [];
  let n = 0;
  const onCall = async (kind: string, args: Record<string, unknown>): Promise<unknown> => {
    calls.push({ kind, args });
    if (kind === 'tool') {
      const w = (args.with ?? {}) as Record<string, unknown>;
      if (args.tool === 'http_request') return LIVE ? liveHttp(w) : fakeHttp(w);
      const t = o.tools?.[String(args.tool)];
      if (!t) throw new Error(`${String(args.tool)}: The tool ${String(args.tool)} is not here: is its part of Hydor turned on?`);
      return t(w);
    }
    if (kind === 'data') {
      const list = data.get(String(args.collection)) ?? [];
      data.set(String(args.collection), list);
      const w = (args.with ?? {}) as Record<string, unknown>;
      const where = (args.where ?? {}) as Record<string, unknown>;
      const fits = (r: Record<string, unknown>) =>
        Object.entries(where).every(([k, v]) => (v && typeof v === 'object' ? Object.entries(v).every(([op, x]) => (op === '<' ? String(r[k]) < String(x) : op === '!=' ? r[k] !== x : r[k] === x)) : r[k] === v));
      if (args.op === 'add') {
        const rec = { ...w, id: typeof w.id === 'string' ? w.id : `r${++n}`, createdAt: Date.now() + n };
        list.push(rec);
        return { record: rec, id: rec.id };
      }
      if (args.op === 'update') {
        const rec = list.find((r) => r.id === args.record);
        if (rec) Object.assign(rec, w);
        return { records: rec ? [rec] : [], count: rec ? 1 : 0 };
      }
      if (args.op === 'remove') {
        const before = list.length;
        data.set(
          String(args.collection),
          list.filter((r) => !(args.record ? r.id === args.record : fits(r))),
        );
        return { count: before - (data.get(String(args.collection))?.length ?? 0) };
      }
      const found = list.filter(fits);
      return { records: found, count: found.length, first: found[0] ?? null };
    }
    throw new Error(`ctx has no ${kind} here`);
  };
  return { onCall, calls, data };
}

/** A template's code step, run in the sandbox on the input given. */
async function program(app: string, step: string, input: Record<string, unknown>, ctx = ctxOf()): Promise<Record<string, unknown>> {
  const t = templateById(app)!;
  const all = [...allSteps(t.flow!.steps), ...Object.values(t.flows ?? {}).flatMap((f) => allSteps(f.steps))];
  const s = all.find((x) => x.id === step) as CodeStep | undefined;
  assert.ok(s && s.do === 'code', `${app} has a program “${step}”`);
  const out = await runCode({ language: s.language, code: s.code, input, slug: app, seconds: s.seconds ?? 20, onCall: ctx.onCall });
  return out.values;
}

// ---- arXiv, OpenAlex and Semantic Scholar: Paper radar's programs -------------------------------------------------

const arxivRoute: Route = (u) => (u.host === 'export.arxiv.org' ? fixture('arxiv.xml') : null);
const openAlexRoute: Route = (u) => (u.host === 'api.openalex.org' && u.pathname === '/works' ? fixture('openalex.json') : null);

test('Paper radar: what to look for, from the form and from you; the days to look at after a gap', async () => {
  const me = { profile: 'I research retrieval-augmented generation.\nI like hiking.', projects: [{ name: 'Hydor', about: 'A self-hosted home for AI agents', recent: ['Fix the dense retrieval eval'] }] };
  const v = await program('paper-radar', 'plan', { fields: 'Information Retrieval, cs.CL, conversational search', topics: 'dense retrieval\nDense Retrieval', people: 'Hamed Zamani', count: '12', today: '2026-11-05', me, seen: [{ day: '2026-10-30', keys: ['ax1', 'ax2'] }] });
  assert.deepEqual(v.cats, ['cs.IR', 'cs.CL']);
  assert.deepEqual(v.topics, ['conversational search', 'dense retrieval'], 'a field that is no category is a topic; the same topic once');
  assert.deepEqual(v.people, ['Hamed Zamani']);
  assert.equal(v.count, 12);
  assert.equal(v.from, '2026-10-28', 'six days since the last update: eight days back, at most');
  assert.deepEqual(v.seen, ['ax1', 'ax2']);
  assert.equal(v.guess, false);
  const interests = v.interests as { label: string; kind: string; text: string }[];
  assert.deepEqual(
    interests.map((x) => [x.label, x.kind]),
    [
      ['Hydor', 'project'],
      ['conversational search', 'topic'],
      ['dense retrieval', 'topic'],
      ['Your work', 'profile'],
    ],
  );
  assert.match(interests[0].text, /^Hydor\. A self-hosted home for AI agents\. Fix the dense retrieval eval$/);
  const empty = await program('paper-radar', 'plan', { fields: '', topics: '', people: '', count: '', today: '2026-11-05', me: {}, seen: [] });
  assert.equal(empty.guess, true, 'nothing given: fields are guessed from your work');
  assert.equal(empty.from, '2026-11-02', 'the last three days');
  assert.equal(empty.count, 15);
});

test('Paper radar: the new papers from arXiv’s Atom and OpenAlex’s works, each once, with their BibTeX; arXiv asked three seconds apart; none seen before', async () => {
  routes = [arxivRoute, openAlexRoute];
  asked.length = 0;
  const plan = { cats: ['cs.IR'], topics: ['dense retrieval'], people: [], count: 10, from: '2026-11-02', to: '2026-11-05', seen: ['ax2611_06876'] };
  const started = Date.now();
  const v = await program('paper-radar', 'search', { plan, guessed: [], guessedTopics: [] });
  const items = v.items as Record<string, string>[];
  // Four entries in the feed (one seen before), and the same feed for the topics: each once; OpenAlex's work with an
  // abstract besides (the one without is left out).
  assert.deepEqual(
    items.map((p) => p.key),
    ['ax2611_06914', 'ax2611_06859', 'ax2611_06856', items[3].key],
  );
  assert.equal(items.length, 4);
  const q = items.find((p) => p.key === 'ax2611_06859')!;
  assert.equal(q.title, 'Balancing hierarchical representation and quantization: A performance trade-off in text embeddings');
  assert.match(q.authors, /^Kai Ponel, Marco Polignano, Erasmo Purificato et al\.$/);
  assert.equal(q.date, '2026-11-04');
  assert.equal(q.where, 'Information Sciences 763 (2027) 124271', 'a journal reference is where it is');
  assert.equal(q.url, 'https://arxiv.org/abs/2611.06859');
  assert.equal(q.via, 'field,topic');
  assert.match(q.abstract, /^Hierarchical text embedding models offer variable-length representations/);
  assert.match(q.bibtex, /^@article\{ponel2026balancing,\n {2}title = \{\{Balancing hierarchical/);
  assert.match(q.bibtex, /doi = \{10\.1016\/j\.ins\.2026\.124271\}/);
  const other = items.find((p) => p.key === 'ax2611_06914')!;
  assert.match(other.bibtex, /^@misc\{\w+2026framework,[\s\S]*eprint = \{2611\.06914\},\n {2}archivePrefix = \{arXiv\},\n {2}primaryClass = \{cs\.MA\}/);
  const oa = items[3];
  assert.match(oa.title, /^Secure Domain Adaptation and Retrieval Augmented Generation/);
  assert.equal(oa.where, 'Research Square');
  assert.match(oa.url, /^https:\/\/doi\.org\/10\.21203\//);
  assert.match(oa.abstract, /\w+ \w+ \w+/, 'its abstract put back together from the places of its words');
  assert.equal(v.fetched, 4);
  assert.deepEqual((v.ranking as { id: string }[]).map((x) => x.id), items.map((p) => p.key));
  assert.ok((v.seen as string[]).includes('ax2611_06876'), 'what was fetched is kept as seen, the seen ones too');
  // The categories, then the topics: arXiv twice, three seconds apart; OpenAlex once (no key), with its filter.
  const arxivCalls = asked.filter((u) => u.includes('export.arxiv.org'));
  assert.equal(arxivCalls.length, 2);
  assert.match(decodeURIComponent(arxivCalls[0]), /search_query=\(cat:cs\.IR\) AND submittedDate:\[202611020000 TO 202611052359\]&sortBy=submittedDate/);
  assert.match(decodeURIComponent(arxivCalls[1]), /\(ti:"dense retrieval" OR abs:"dense retrieval"\) AND submittedDate/);
  assert.ok(Date.now() - started >= 3000, 'arXiv’s second call waited its turn');
  assert.match(decodeURIComponent(asked.find((u) => u.includes('openalex'))!), /title_and_abstract\.search:"dense retrieval",from_publication_date:2026-11-02/);
  assert.match(String(v.sources), /^arXiv \(cs\.IR\) and OpenAlex$/);
  // arXiv down: said in a note, and what OpenAlex found still comes.
  routes = [openAlexRoute];
  const down = await program('paper-radar', 'search', { plan, guessed: [], guessedTopics: [] });
  assert.equal((down.items as unknown[]).length, 1);
  assert.match(String(down.notes), /arXiv did not answer for the categories/);
});

test('Paper radar: the best for you, the people you follow first, under the project or topic each fits; written up and laid out; what it looked at kept', async () => {
  const items = [
    { key: 'a', title: 'Dense retrieval for long documents', abstract: 'We chunk.', authors: 'A. B.', via: 'field', who: '', bibtex: '@misc{a}', url: 'https://arxiv.org/abs/1', date: '2026-11-04', where: 'arXiv · cs.IR', pdf: 'https://arxiv.org/pdf/1' },
    { key: 'b', title: 'Image segmentation', abstract: 'Pixels.', authors: 'C. D.', via: 'field', who: '', bibtex: '@misc{b}', url: 'https://arxiv.org/abs/2', date: '2026-11-04', where: 'arXiv · cs.CV', pdf: '' },
    { key: 'c', title: 'A new benchmark', abstract: 'By someone you follow.', authors: 'Hamed Zamani', via: 'person', who: 'Hamed Zamani', bibtex: '@misc{c}', url: 'https://arxiv.org/abs/3', date: '2026-11-03', where: 'arXiv · cs.IR', pdf: '' },
  ];
  const interests = [
    { label: 'Hydor', kind: 'project', text: 'Hydor', about: 'Agents at home' },
    { label: 'dense retrieval', kind: 'topic', text: 'dense retrieval', about: '' },
  ];
  const ranked = [
    { id: 'a', score: 0.8, interest: 1 },
    { id: 'b', score: 0.02 },
    { id: 'c', score: 0.05 },
  ];
  const v = await program('paper-radar', 'pick', { items, ranked, interests, count: 2 });
  const papers = v.papers as Record<string, unknown>[];
  assert.deepEqual(
    papers.map((p) => [p.key, p.group, p.n]),
    [
      ['c', 'People you follow', 1],
      ['a', 'dense retrieval', 2],
    ],
  );
  assert.deepEqual(
    (v.groups as Record<string, unknown>[]).map((g) => [g.group, g.kind, g.count, g.n]),
    [
      ['People you follow', 'person', 1, 1],
      ['dense retrieval', 'topic', 1, 2],
    ],
  );
  assert.match(String(v.lines), /^1\. \[People you follow\] A new benchmark — Hamed Zamani \(by Hamed Zamani, whom they follow\)\nBy someone you follow\.\n\n2\. \[dense retrieval\]/);
  // Without a ranking: by the topics' words.
  const plain = await program('paper-radar', 'pick', { items, ranked: '', interests, count: 5 });
  assert.equal((plain.papers as Record<string, unknown>[]).find((p) => p.key === 'a')!.group, 'dense retrieval', 'by the interests’ words, it still finds its group');
  assert.equal((plain.papers as Record<string, unknown>[]).find((p) => p.key === 'b')!.group, 'Also new');
  // Laid out: what was written of each, the papers looked at kept (and a month-old update forgotten), the marks kept to the latest.
  const ctx = ctxOf();
  ctx.data.set('seen', [{ id: 'old', day: '2026-09-01', keys: ['x'] }]);
  ctx.data.set('marks', Array.from({ length: 160 }, (_, i) => ({ id: `m${i}`, mark: 'no' })));
  const e = await program('paper-radar', 'edition', { papers, groups: v.groups, written: [{ n: 2, tldr: 'It chunks.', why: 'For Hydor: its eval.' }], headline: 'Long documents', seen: ['a', 'b', 'c'], today: '2026-11-05', fetched: 3, window: '2026-11-02' }, ctx);
  const out = e.papers as Record<string, unknown>[];
  assert.equal(e.headline, 'Long documents');
  assert.equal(e.window, 'sent since 2026-11-02');
  assert.deepEqual(
    out.map((p) => [p.key, p.tldr, p.why, p.n, p.pdf]),
    [
      ['c', '', '', 1, null],
      ['a', 'It chunks.', 'For Hydor: its eval.', 2, 'https://arxiv.org/pdf/1'],
    ],
  );
  assert.deepEqual(
    ctx.data.get('seen')!.map((r) => [r.day, r.keys]),
    [['2026-11-05', ['a', 'b', 'c']]],
  );
  assert.equal(ctx.data.get('marks')!.length, 150, 'the oldest marks forgotten (the latest found first)');
});

// ---- Semantic Scholar: Citation alerts' programs ------------------------------------------------------------------

/** Semantic Scholar busy the first time an address is asked, then answering: what its key-less pool does. */
const busyOnce = new Set<string>();
const s2Route: Route = (u) => {
  if (u.host !== 'api.semanticscholar.org') return null;
  const at = u.pathname + u.search;
  if (/\/citations/.test(u.pathname) && !busyOnce.has(at)) {
    busyOnce.add(at);
    return { status: 429 };
  }
  if (u.pathname.endsWith('/author/search')) return fixture('s2-author-search.json');
  if (/\/author\/\d+\/papers$/.test(u.pathname)) return fixture('s2-author-papers.json');
  if (/\/author\/\d+$/.test(u.pathname)) return JSON.stringify({ authorId: '2006776003', name: 'Chris Samarinas', affiliations: ['University of Massachusetts Amherst'], citationCount: 155, hIndex: 6 });
  if (/\/citations$/.test(u.pathname)) return fixture('s2-citations.json');
  return null;
};

test('Citation alerts: you and your papers from Semantic Scholar; only those with citations, the papers named alone when some are', async () => {
  routes = [s2Route];
  const v = await program('citation-alerts', 'who', { me: 'Chris Samarinas', papers: '' });
  const a = v.author as Record<string, unknown>;
  assert.deepEqual([a.name, a.id, a.where, a.citations, a.hindex, a.source], ['Chris Samarinas', '2006776003', 'University of Massachusetts Amherst', 155, 6, 'Semantic Scholar']);
  const papers = v.papers as Record<string, unknown>[];
  assert.equal(papers.length, 6);
  assert.equal(papers[0].title, 'Beyond Factual Accuracy: Evaluating Coverage of Diverse Factual Information in Long-form Text Generation', 'the most cited first');
  assert.match(String(papers[0].key), /^ax/);
  assert.ok(papers.every((p) => p.s2));
  const one = await program('citation-alerts', 'who', { me: 'Chris Samarinas', papers: 'ProCIS: A Benchmark for Proactive Retrieval in Conversations' });
  assert.deepEqual((one.papers as Record<string, unknown>[]).map((p) => p.title), ['ProCIS: A Benchmark for Proactive Retrieval in Conversations']);
});

test('Citation alerts: who cited each paper, new ones against those seen (the first look: last month’s only), Semantic Scholar asked again after a wait; how each cites you, your paper’s mention marked', async () => {
  routes = [s2Route];
  busyOnce.clear();
  const mine = [{ key: 'axcolbert', title: 'ColBERT', s2: 'p1', first: 'Khattab', year: 2020 }];
  const ctx = ctxOf();
  ctx.data.set('cited', [{ id: 'axcolbert', title: 'ColBERT', citing: ['ax2608_30757'], count: 1 }]);
  const started = Date.now();
  // Seen before: one of the four; the others new.
  const v = await program('citation-alerts', 'cites', { papers: mine, seen: ctx.data.get('cited'), today: '2026-11-05' }, ctx);
  assert.ok(Date.now() - started >= 2500, 'it waited before asking again');
  const fresh = v.fresh as Record<string, unknown>[];
  assert.deepEqual(
    fresh.map((c) => c.title),
    [
      'Preference Shapes Relevance: Cross-component Hierarchical Semantic Alignment for Personalized Generative Retrieval',
      'Agents in the Large: Perception-Centered Architecture for Persistent Agents',
      fresh[2].title,
    ],
  );
  assert.equal(fresh.length, 3);
  assert.deepEqual(v.counts, { axcolbert: 3 });
  assert.equal(v.sorting, 2, 'those with a sentence are sorted');
  assert.match(String(v.to_sort), /^1\. Citing: Preference Shapes Relevance[\s\S]*“To address these limitations, STAR/);
  const keep = (v.keep as Record<string, unknown>[])[0];
  assert.equal(keep.count, 4);
  // The first look at a paper: only last month's are news.
  const first = await program('citation-alerts', 'cites', { papers: mine, seen: [], today: '2026-11-05' }, ctxOf());
  assert.equal((first.fresh as unknown[]).length, 0, 'August’s citations are not news the first time');
  assert.equal(((first.keep as Record<string, unknown>[])[0] as { count: number }).count, 4, 'but they are seen');
  // Laid out: how each cites you, the mention of your paper marked, and the seen ones kept.
  const r = await program(
    'citation-alerts',
    'report',
    {
      author: { name: 'Omar Khattab', where: 'Stanford', citations: 9000, hindex: 20, source: 'Semantic Scholar' },
      papers: [{ key: 'axcolbert', title: 'ColBERT', year: 2020, venue: 'SIGIR', citations: 3000, url: 'https://arxiv.org/abs/2004.12832' }],
      fresh: fresh.map((c, i) => ({ ...c, n: i < 2 ? i + 1 : undefined })),
      counts: v.counts,
      keep: v.keep,
      kinds: [
        { n: 1, kind: 'Compares with', gist: 'a late-interaction baseline' },
        { n: 2, kind: 'mentions' },
      ],
      notes: '',
      more: '',
      today: '2026-11-05',
    },
    ctx,
  );
  const cites = r.citations as Record<string, unknown>[];
  assert.deepEqual(
    cites.map((c) => [c.kind, c.mark]),
    [
      ['compares with', '(Khattab and Zaharia, 2020)'],
      ['mentions', 'Khattab & Zaharia, 2020'],
      ['', ''],
    ],
  );
  assert.equal(cites[0].gist, 'a late-interaction baseline');
  assert.match(String(cites[0].pre), /STAR \(Zhan et al\., 2021\) introduces stable negative sampling, while ColBERT $/);
  assert.match(String(cites[1].pre), /\(Nogueira & Cho, 2019; $/);
  assert.equal(cites[1].post, ').');
  assert.match(String(cites[0].post), /^ and Sentence-BERT/);
  assert.equal((r.papers as Record<string, unknown>[])[0].new, 3);
  assert.equal(r.fresh, 3);
  assert.deepEqual(ctx.data.get('cited')!.map((x) => [x.id, x.count]), [['axcolbert', 4]]);
});

// ---- Hugging Face: New-model watch's programs ---------------------------------------------------------------------

test('New-model watch: the newest models, those old enough with downloads to look at (most downloaded first), those too new to wait; their pages and cards; the licence and size kept to', async () => {
  routes = [(u) => (u.host === 'huggingface.co' && u.pathname === '/api/models' ? fixture('hf-models.json') : null)];
  asked.length = 0;
  const v = await program('new-model-watch', 'list', { task: 'Rerankers (text-ranking)', words: '', downloads: '50', days: '7', today: '2026-11-05', kept: [{ model: 'arlenecc/jina-reranker-v2-base-multilingual-onnx' }] });
  assert.match(decodeURIComponent(asked[0]), /pipeline_tag=text-ranking&sort=createdAt&direction=-1&limit=1000&expand\[\]=createdAt/);
  assert.equal(v.task, 'text-ranking');
  assert.deepEqual(
    (v.look as Record<string, unknown>[]).map((m) => [m.model, m.downloads]),
    [
      ['hindsight-ai/hs-rerank-1', 117822],
      ['GTrush/Qwen3-VL-Reranker-8B-Q8_0-GGUF-llama_cpp', 375],
      ['pameydorke/arcanumchat-reranker-bge-reranker-v2-m3-v2', 58],
    ],
  );
  assert.deepEqual((v.young as Record<string, unknown>[]).map((m) => m.model), ['HangGlidersRule/Darkstar-Nemotron-3.5-Rerank-8B-Base-ModelOpt-W4A4-NVFP4', 'liudev/novel-reranker-gpl-base-v1']);
  assert.equal(v.young_count, 2);
  assert.equal(v.listed, 6);
  // Their pages and cards.
  routes = [
    (u) => (u.host === 'huggingface.co' && u.pathname === '/api/models/hindsight-ai/hs-rerank-1' ? fixture('hf-model.json') : null),
    (u) => (u.host === 'huggingface.co' && u.pathname.endsWith('/raw/main/README.md') ? fixture('hf-readme.md') : null),
    (u) => (u.host === 'huggingface.co' && u.pathname.startsWith('/api/models/') ? JSON.stringify({ tags: ['gguf', 'license:apache-2.0'], cardData: { license: 'apache-2.0' } }) : null),
  ];
  const c = await program('new-model-watch', 'cards', { look: v.look, licence: 'mit, apache-2.0', size: '500M' });
  const models = c.models as Record<string, unknown>[];
  assert.deepEqual(
    models.map((m) => [m.model, m.licence, m.size, m.runnable, m.skip]),
    [
      ['hindsight-ai/hs-rerank-1', 'mit', 113.8, true, ''],
      ['GTrush/Qwen3-VL-Reranker-8B-Q8_0-GGUF-llama_cpp', 'apache-2.0', null, false, ''],
      ['pameydorke/arcanumchat-reranker-bge-reranker-v2-m3-v2', 'apache-2.0', null, false, ''],
    ],
  );
  assert.equal(c.count, 3);
  assert.match(String(c.lines), /^1\. hindsight-ai\/hs-rerank-1 \(113\.8M parameters\), from jhu-clsp\/mmBERT-small \(finetune\)\n# hs-rerank-1 hs-rerank-1 is a multilingual cross-encoder reranker built for \[Hindsight\]/);
  assert.ok(!/license: mit|!\[Hindsight\]/.test(String(c.lines)), 'without the card’s header and pictures');
  const strict = await program('new-model-watch', 'cards', { look: v.look.slice(0, 1), licence: 'apache-2.0', size: '' });
  assert.match(String((strict.models as Record<string, unknown>[])[0].skip), /^Its licence \(mit\) is not one of yours$/);
  const small = await program('new-model-watch', 'cards', { look: v.look.slice(0, 1), licence: '', size: '100M' });
  assert.equal((small.models as Record<string, unknown>[])[0].skip, 'Too big: 113.8M parameters');
});

test('New-model watch: each model worth trying goes to Experiments with your evaluation, told to say when it beats your best; the earlier ones’ scores read; what changed kept, and laid out', async () => {
  const runs: Record<string, unknown>[] = [];
  const tools = {
    experiment_run: (a: Record<string, unknown>) => {
      runs.push(a);
      return { text: JSON.stringify({ id: `run${runs.length}`, status: 'queued' }), data: { id: `run${runs.length}`, status: 'queued' } };
    },
    experiment_list: () => ({ data: { runs: [{ id: 'old1', status: 'done', metrics: { 'nDCG@10': 0.512 } }, { id: 'old2', status: 'failed', metrics: {} }] } }),
  };
  const ctx = ctxOf({ tools });
  ctx.data.set('models', [
    { id: 'older-a', model: 'org/older-a', state: 'evaluating', run: 'old1', score: null, checked: '2026-10-20' },
    { id: 'older-b', model: 'org/older-b', state: 'evaluating', run: 'old2', score: null, checked: '2026-10-20' },
  ]);
  const models = [
    { model: 'hindsight-ai/hs-rerank-1', created: '2026-10-28', downloads: 117822, likes: 4, licence: 'mit', size: 113.8, runnable: true, skip: '' },
    { model: 'org/copy', created: '2026-10-28', downloads: 90, likes: 0, licence: 'mit', size: 300, runnable: true, skip: '' },
    { model: 'org/gguf', created: '2026-10-28', downloads: 90, likes: 0, licence: 'mit', size: null, runnable: false, skip: '' },
    { model: 'org/big', created: '2026-10-28', downloads: 90, likes: 0, licence: 'mit', size: 9000, runnable: true, skip: 'Too big: 9000M parameters' },
  ];
  const read = [
    { n: 1, what: 'A multilingual cross-encoder reranker.', worth: true },
    { n: 2, what: 'A copy.', worth: false },
    { n: 3, what: 'Quantized.', worth: true },
  ];
  const v = await program('new-model-watch', 'runs', { models, read, kept: ctx.data.get('models'), command: 'python eval.py --model {model}', folder: '~/eval', metric: 'ndcg@10', better: 'Higher', best: '0.5', today: '2026-11-05' }, ctx);
  assert.deepEqual(runs, [
    { command: 'python eval.py --model hindsight-ai/hs-rerank-1', cwd: '~/eval', name: 'Evaluate hindsight-ai/hs-rerank-1', group: 'New-model watch', gpus: 1, tags: ['new-model-watch'], notify: { when: { metric: 'ndcg@10', op: '>', value: 0.5 } } },
  ]);
  const changed = v.changed as Record<string, unknown>[];
  assert.deepEqual(
    changed.map((m) => [m.model, m.state, m.run, m.score]),
    [
      ['hindsight-ai/hs-rerank-1', 'evaluating', 'run1', null],
      ['org/copy', 'skipped', '', null],
      ['org/gguf', 'not run', '', null],
      ['org/big', 'skipped', '', null],
      ['org/older-a', 'beats', 'old1', 0.512],
      ['org/older-b', 'failed', 'old2', null],
    ],
  );
  assert.equal(ctx.data.get('models')!.length, 6, 'the new ones added, the earlier ones changed');
  // Without Experiments: said so, and the model stays to try.
  const none = await program('new-model-watch', 'runs', { models: models.slice(0, 1), read: read.slice(0, 1), kept: [], command: 'python eval.py --model {model}', folder: '', metric: '', better: 'Higher', best: '', today: '2026-11-05' }, ctxOf());
  assert.match(String((none.changed as Record<string, unknown>[])[0].note), /^Experiments could not take it: experiment_run: The tool experiment_run is not here/);
  // Laid out: what beats your best first, then what is new.
  const r = await program('new-model-watch', 'report', { changed, kept: [], young: [{ model: 'org/young', created: '2026-11-04', downloads: 3, likes: 0 }], young_count: 1, later: 0, task: 'text-ranking', listed: 400, best: '0.5', metric: 'ndcg@10', command: 'x', notes: '', more: '', today: '2026-11-05' });
  assert.equal(r.headline, '1 new model beats your best');
  assert.deepEqual(
    (r.models as Record<string, unknown>[]).map((m) => [m.model, m.state]),
    [
      ['org/older-a', 'beats'],
      ['hindsight-ai/hs-rerank-1', 'evaluating'],
      ['org/gguf', 'not run'],
      ['org/copy', 'skipped'],
      ['org/big', 'skipped'],
      ['org/older-b', 'failed'],
      ['org/young', 'too new'],
    ],
  );
  assert.equal(r.best, 0.5);
  assert.equal(r.evaluates, true);
});

// ---- ccfddl and ai-deadlines: Deadline radar's programs -----------------------------------------------------------

const deadlineRoutes: Route[] = [
  (u) => (u.host === 'raw.githubusercontent.com' && u.pathname === '/ccfddl/ccf-deadlines/main/conference/DB/sigir.yml' ? fixture('ccf-sigir.yml') : null),
  (u) => (u.host === 'raw.githubusercontent.com' && u.pathname === '/ccfddl/ccf-deadlines/main/conference/AI/acl.yml' ? fixture('ccf-acl.yml') : null),
  (u) => (u.host === 'raw.githubusercontent.com' && u.pathname === '/huggingface/ai-deadlines/main/src/data/conferences/sigir.yml' ? fixture('hfd-sigir.yml') : null),
  (u) => (u.host === 'raw.githubusercontent.com' && u.pathname === '/huggingface/ai-deadlines/main/src/data/conferences/neurips.yml' ? fixture('hfd-neurips.yml') : null),
];

test('Deadline radar: your venues found in both lists by the names you use, their YAML read, each deadline turned from its time zone into yours, the past ones of the last months kept, the calls to read listed', async () => {
  routes = deadlineRoutes;
  asked.length = 0;
  const v = await program('deadline-radar', 'lists', { venues: 'SIGIR, ACL 2027, NeurIPS, Imaginary Conf', calls: [], now: '2026-11-05 09:00', zone: 'Europe/Athens', today: '2026-11-05' });
  assert.deepEqual(v.missing, ['Imaginary Conf']);
  const ds = v.deadlines as Record<string, unknown>[];
  const sig = ds.filter((d) => d.venue === 'SIGIR');
  // SIGIR 2027 (ccfddl): abstracts 14 January at 23:59 AoE, which is 15 January at 13:59 in Athens (UTC+2 in winter).
  assert.deepEqual(
    sig.filter((d) => d.year === 2027).map((d) => [d.kind, d.label, d.day, d.time, d.utc, d.given, d.past, d.next]),
    [
      ['abstract', 'Abstracts', '2027-01-15', '13:59', '2027-01-15T11:59:59Z', '2027-01-14 23:59 AoE', false, true],
      ['paper', 'Papers', '2027-01-22', '13:59', '2027-01-22T11:59:59Z', '2027-01-21 23:59 AoE', false, false],
    ],
  );
  // SIGIR 2026's deadlines from both lists, the same moments once; its past ones of the last four months kept (camera-ready's not).
  assert.ok(!sig.some((d) => d.year === 2026), 'SIGIR 2026’s are long past');
  // ACL 2027 in UTC−12 (ARR): 4 January 2027 at 23:59 there.
  const acl = ds.filter((d) => d.venue === 'ACL');
  assert.deepEqual(acl.map((d) => [d.year, d.label, d.day, d.time, d.past]), [[2027, 'ARR Submission', '2027-01-05', '13:59', false]]);
  // NeurIPS 2026 (ai-deadlines): its reviews, discussion and decisions are past but within four months; its submission is not.
  const nips = ds.filter((d) => d.venue === 'NeurIPS');
  assert.deepEqual(
    nips.map((d) => [d.kind, d.label, d.past]),
    [
      ['other', 'Reviews released to authors', true],
      ['rebuttal', 'Author + Reviewer + AC Discussion Period starts', true],
      ['rebuttal', 'Author + Reviewer + AC Discussion Period ends', true],
      ['notification', 'Author notification', true],
    ],
  );
  assert.equal(nips[3].day, '2026-09-25', 'AoE 23:59 on the 24th is the 25th in Athens (and 14:59 there, in summer time)');
  assert.equal(nips[3].time, '14:59');
  assert.deepEqual(
    (v.venues as Record<string, unknown>[]).map((x) => [x.venue, x.rank, x.next, x.day]),
    [
      ['SIGIR', 'ERA A', 'Abstracts', '2027-01-15'],
      ['ACL', 'CORE A* · CCF A', 'ARR Submission', '2027-01-05'],
      ['NeurIPS', 'ERA A', '', null],
    ],
  );
  assert.deepEqual(
    (v.need as Record<string, unknown>[]).map((n) => [n.id, n.venue, n.link]),
    [
      ['sigir27', 'SIGIR', 'https://sigir2027.org/'],
      ['acl27', 'ACL', 'https://2027.aclweb.org/'],
    ],
  );
  assert.ok(asked.some((u) => u.endsWith('/conference/DB/sigir.yml')) && asked.some((u) => u.endsWith('/conferences/neurips.yml')));
  // A call read lately is not read again.
  const again = await program('deadline-radar', 'lists', { venues: 'SIGIR', calls: [{ id: 'sigir27', pages: '9 pages', checked: '2026-11-01' }], now: '2026-11-05 09:00', zone: 'Europe/Athens', today: '2026-11-05' });
  assert.deepEqual(again.need, []);
});

test('Deadline radar: reminders at the days you gave, the nearest one come for each deadline and each once, all in one notification; the calls’ page limits and templates kept', async () => {
  routes = deadlineRoutes;
  const told: Record<string, unknown>[] = [];
  const ctx = ctxOf({ tools: { notify_user: (a) => (told.push(a), { text: 'Sent.' }) } });
  // On 12 January, three days and a bit before SIGIR's abstracts and ten before its papers: each one's 14-day reminder
  // (the 3-day one has not come yet); ACL's deadline has passed.
  let lists = await program('deadline-radar', 'lists', { venues: 'SIGIR, ACL', calls: [], now: '2027-01-12 09:00', zone: 'Europe/Athens', today: '2027-01-12' });
  const v = await program('deadline-radar', 'remind', { lists, read: [{ pages: '9 pages, references not counted', template: 'https://www.acm.org/publications/proceedings-template' }, {}], calls: [], sent: [], reminders: '14, 3, 1', today: '2027-01-12' }, ctx);
  assert.equal(told.length, 1);
  assert.equal(told[0].title, '2 deadlines are near');
  assert.equal(told[0].message, 'SIGIR 2027: abstracts due in 3 days (2027-01-15, 13:59 your time). SIGIR 2027: papers due in 10 days (2027-01-22, 13:59 your time).');
  assert.equal((v.reminded as string[]).length, 2);
  const keys = (v.deadlines as Record<string, unknown>[]).filter((d) => d.venue === 'SIGIR' && d.year === 2027).map((d) => d.key);
  assert.deepEqual(ctx.data.get('sent')!.map((r) => [r.id, r.sent]), [[keys[0], [14]], [keys[1], [14]]]);
  const sig = (v.deadlines as Record<string, unknown>[]).find((d) => d.key === keys[0])!;
  assert.deepEqual([sig.pages, sig.template], ['9 pages, references not counted', 'https://www.acm.org/publications/proceedings-template']);
  assert.deepEqual(ctx.data.get('calls')!.map((r) => [r.id, r.pages]), [['sigir27', '9 pages, references not counted']], 'ACL’s call is not read: its deadline has passed');
  assert.equal(v.headline, 'SIGIR 2027: abstracts due 2027-01-15');
  // Later the same morning: nothing new to send.
  told.length = 0;
  lists = await program('deadline-radar', 'lists', { venues: 'SIGIR, ACL', calls: ctx.data.get('calls'), now: '2027-01-12 12:00', zone: 'Europe/Athens', today: '2027-01-12' });
  await program('deadline-radar', 'remind', { lists, read: [], calls: ctx.data.get('calls'), sent: ctx.data.get('sent'), reminders: '14, 3, 1', today: '2027-01-12' }, ctx);
  assert.equal(told.length, 0);
  // The next morning: the abstracts' 3-day reminder, once; the papers' 14-day one was sent already.
  lists = await program('deadline-radar', 'lists', { venues: 'SIGIR, ACL', calls: ctx.data.get('calls'), now: '2027-01-13 09:00', zone: 'Europe/Athens', today: '2027-01-13' });
  await program('deadline-radar', 'remind', { lists, read: [], calls: ctx.data.get('calls'), sent: ctx.data.get('sent'), reminders: '14, 3, 1', today: '2027-01-13' }, ctx);
  assert.deepEqual(told.map((t) => [t.title, t.message]), [['A deadline is near', 'SIGIR 2027: abstracts due in 2 days (2027-01-15, 13:59 your time).']]);
  assert.deepEqual(ctx.data.get('sent')!.find((r) => r.id === keys[0])!.sent, [14, 3]);
  // No reminders asked for: none sent.
  told.length = 0;
  await program('deadline-radar', 'remind', { lists, read: [], calls: [], sent: [], reminders: '', today: '2027-01-13' }, ctxOf({ tools: { notify_user: (a) => (told.push(a), { text: 'Sent.' }) } }));
  assert.equal(told.length, 0);
});

// ---- Living related work and Gap finder ----------------------------------------------------------------------------

test('Living related work: each topic’s papers to weigh (the first time its best and latest, the seeds’ citing papers too), the closest numbered, what was kept added with cite keys of their own', async () => {
  routes = [arxivRoute, openAlexRoute, s2Route];
  busyOnce.clear();
  busyOnce.add('/graph/v1/paper/sSeed/citations?fields=title,authors,year,venue,externalIds,publicationDate,abstract&limit=50');
  const v = await program('living-related-work', 'look', {
    topics: 'dense retrieval\nquery performance prediction',
    seeds: 'ColBERT: Efficient and Effective Passage Search',
    most: '40',
    known: [{ topic: 'query performance prediction', key: 'ax2611_06914', added: '2026-11-01' }],
    seeded: [{ line: 'ColBERT: Efficient and Effective Passage Search', title: 'ColBERT', s2: 'sSeed', year: 2020 }],
    themed: [{ topic: 'query performance prediction', themes: ['Predictors'] }],
    today: '2026-11-05',
  });
  const topics = v.topics as Record<string, unknown>[];
  assert.deepEqual(
    topics.map((t) => [t.topic, t.slug, t.first, t.room, t.themes]),
    [
      ['dense retrieval', 'dense-retrieval', true, 40, []],
      ['query performance prediction', 'query-performance-prediction', false, 39, ['Predictors']],
    ],
  );
  const pool = topics[0].pool as Record<string, unknown>[];
  assert.ok(pool.some((p) => String(p.seed) === 'ColBERT'), 'the seed’s citing papers come in');
  assert.ok(!(topics[1].pool as Record<string, unknown>[]).some((p) => p.key === 'ax2611_06914'), 'what a topic has is left out');
  assert.deepEqual(topics[0].interests, ['dense retrieval', 'ColBERT']);
  const choose = await program('living-related-work', 'choose', { pool, ranked: [{ id: pool[1].key, score: 0.9 }, { id: pool[0].key, score: 0.05 }], first: true, room: 40 });
  assert.equal(choose.count, 1, 'what fits the topic too little is left out');
  assert.match(String(choose.lines), /^1\. /);
  const merged = await program('living-related-work', 'merge', { topic: 'dense retrieval', papers: choose.papers, judged: [{ n: 1, keep: true, summary: 'It does X.', relation: 'extends ColBERT', theme: 'Late interaction' }], themes: ['Late interaction'], before: [] });
  assert.deepEqual(merged.themes, ['Late interaction']);
  const ctx = ctxOf();
  const two = { ...(merged.papers as Record<string, unknown>[])[0] };
  const saved = await program('living-related-work', 'save', { rounds: [merged, { papers: [{ ...two, key: 'other' }], themes: ['Predictors'] }], topics, seeds: [], known: [{ topic: 'query performance prediction', key: 'k1', citekey: two.citekey, hidden: false }], themed: [{ id: 'tp1', topic: 'query performance prediction', themes: ['Predictors'] }], notes: '', today: '2026-11-05' }, ctx);
  const papers = ctx.data.get('papers')!;
  assert.deepEqual(
    papers.map((p) => [p.topic, p.theme, p.added, p.citekey === two.citekey]),
    [
      ['dense retrieval', 'Late interaction', '2026-11-05', true],
      ['query performance prediction', 'Late interaction', '2026-11-05', false],
    ],
  );
  assert.equal(papers[1].citekey, `${String(two.citekey)}a`, 'a key the topic has already gets a letter');
  assert.match(String(papers[1].bibtex), new RegExp(`^@\\w+\\{${String(two.citekey)}a,`));
  assert.deepEqual(
    (saved.topics as Record<string, unknown>[]).map((t) => [t.topic, t.count, t.new]),
    [
      ['dense retrieval', 1, 1],
      ['query performance prediction', 2, 1],
    ],
  );
  assert.equal(saved.headline, '2 new papers on your topics');
  assert.deepEqual(ctx.data.get('topics')!.map((t) => t.id), ['tp-dense-retrieval'], 'a new topic’s themes added; the one there changed');
  const draft = await program('living-related-work', 'prep', { papers: [...papers, { ...papers[0], hidden: true, citekey: 'gone' }] });
  assert.equal(draft.count, 2);
  assert.match(String(draft.lines), /^## Late interaction\n- \\cite\{\w+\} /);
  assert.ok(!String(draft.bib).includes('gone'));
});

test('Gap finder: the month’s papers in an area by its category or its words; ideas checked against what is near them, done ones last, as many as asked', async () => {
  routes = [arxivRoute];
  asked.length = 0;
  const m = await program('gap-finder', 'month', { area: 'Information Retrieval', today: '2026-11-05' });
  assert.match(decodeURIComponent(asked[0]), /search_query=cat:cs\.IR AND submittedDate:\[202610060000 TO 202611052359\]/);
  assert.equal(m.count, 4);
  const w = await program('gap-finder', 'month', { area: 'retrieval-augmented generation', today: '2026-11-05' });
  assert.match(decodeURIComponent(asked[1]), /\(abs:retrieval AND abs:augmented AND abs:generation OR ti:"retrieval-augmented generation"\)/);
  assert.equal(w.count, 4);
  const pair = await program('gap-finder', 'pair', { mine: [{ n: 1, title: 'ProCIS', year: 2024, abstract: 'A benchmark.' }], month: m.papers, ranked: '', ideas: '3' });
  assert.equal(pair.ask, 5);
  assert.match(String(pair.text), /^M1\. ProCIS \(2024\)\nA benchmark\.\n\n---\n\nR1\. /);
  const final = await program('gap-finder', 'final', {
    checked: [
      { title: 'Done one', verdict: 'done', fits: 'fits' },
      { title: 'New and big', verdict: 'new', fits: 'too big' },
      { title: 'New and small', verdict: 'new', fits: 'fits', closest_url: null },
      {},
    ],
    want: '2',
    mine: [{ title: 'ProCIS', year: 2024, url: 'https://arxiv.org/abs/1' }],
    recent: [{ title: 'R', date: '2026-11-01', url: 'nope' }],
    month: 4,
    area: 'cs.IR',
    compute: 'one 24 GB GPU',
  });
  assert.deepEqual((final.ideas as Record<string, unknown>[]).map((i) => [i.n, i.title]), [[1, 'New and small'], [2, 'New and big']]);
  assert.equal(final.headline, '2 of 2 ideas look new');
  assert.equal((final.recent as Record<string, unknown>[])[0].url, null, 'a link that is not one is left out');
  // A verdict put with its idea: the closest paper named, P numbers in words.
  const merged = await program('gap-finder', 'merge', { idea: { title: 'X', idea: 'Do X.', crosses: 'M1 × R2', first: 'Try it.' }, verdict: { verdict: 'Partly done', why: 'P1 does half of it.', closest: 1, cost: 'about 10 GPU hours', fits: 'It fits' }, papers: [{ n: 1, title: 'Half of X', year: 2025, url: 'https://arxiv.org/abs/9' }] });
  assert.deepEqual([merged.verdict, merged.why, merged.closest, merged.closest_url, merged.fits], ['partly done', '“Half of X” does half of it.', 'Half of X (2025)', 'https://arxiv.org/abs/9', 'fits']);
});

// ---- Paper radar through the flow runner -------------------------------------------------------------------------

/** The session manager, for agent steps (none run here). */
class FakeSessions extends EventEmitter {
  async create() {
    return 'acp:none';
  }
  summary() {
    return null;
  }
  setFlags() {}
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  async timeline() {
    return { parser: { items: [] }, readMore: async () => {} } as any;
  }
}

/** A model server as Custom's models speak to theirs: each answer from `reply`, by what was asked. */
let reply = (_user: string): unknown => ({});
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const user = String(b.messages?.find((m: { role: string }) => m.role === 'user')?.content ?? '');
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(reply(user)) }, finish_reason: 'stop' }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
fs.writeFileSync(AGENT_FILE, JSON.stringify({ models: [{ id: 'fake', label: 'Fake', provider: 'endpoint', baseUrl: `http://127.0.0.1:${(srv.address() as { port: number }).port}/v1`, model: 'fake-1', tools: 'native' }] }));

const stepTool = (name: string, run: RunTool['run']): RunTool => ({ name, description: name, inputSchema: { type: 'object' }, run });
const services: Feature = {
  id: 'research-services',
  tools: (ctx) => (ctx.step ? [stepTool('http_request', (a) => fakeHttp(a)), RANK_BY_INTEREST, USER_PROFILE] : []),
};
const http = Fastify();
await http.register(cookie);
http.setErrorHandler((err: Error, _req, res) => {
  res.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const sessions = new FakeSessions();
const scheduler = new Scheduler(db, sessions as unknown as SessionManager);
const deps = { app: http, db, sessions: sessions as any, scheduler, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
apps.routes!(deps);
registerFeatures([services], deps);
startRuns(deps);
await http.ready();
setHelperModel(db, 'fake');

test('Paper radar, as it comes: you read, the papers found and ranked against your topics, written up, the papers looked at kept; the next update brings none of them again; its page saves and puts aside papers in its records', async () => {
  routes = [arxivRoute, openAlexRoute];
  reply = (user) => {
    const n = [...user.matchAll(/^(\d+)\. \[/gm)].map((m) => Number(m[1]));
    return { headline: 'Embeddings and agents', papers: n.map((i) => ({ n: i, tldr: `Paper ${i} in a line.`, why: `For dense retrieval: number ${i}.` })) };
  };
  const t = templateById('paper-radar')!;
  const inputs = { fields: 'cs.IR', topics: 'text embeddings', people: '', count: '5' };
  const r1 = (await waitFor(startRun({ app: 'tpl:paper-radar', slug: 'paper-radar', recipe: t, source: 'web', inputs }).id, 120_000))!;
  assert.equal(r1.status, 'done', r1.error);
  const res = r1.result as Record<string, any>;
  assert.equal(res.headline, 'Embeddings and agents');
  assert.equal(res.papers.length, 5, 'as many as asked (five at least)');
  assert.equal(res.fetched, 5);
  assert.equal(res.papers[0].group, 'text embeddings', 'the paper on embeddings first, under its topic');
  assert.match(res.papers[0].title, /text embeddings/);
  assert.ok(res.papers.every((p: any) => /^Paper \d in a line\.$/.test(p.tldr) && p.bibtex.startsWith('@')));
  const seen = findRecords(db, 'tpl:paper-radar', t.data, 'seen').records;
  assert.equal(seen.length, 1);
  assert.equal((seen[0].keys as string[]).length, 5);
  // The next update: the same papers come, all seen, so none is shown again; the run still ends well.
  const r2 = (await waitFor(startRun({ app: 'tpl:paper-radar', slug: 'paper-radar', recipe: t, source: 'web', inputs }).id, 120_000))!;
  assert.equal(r2.status, 'done', r2.error);
  assert.equal((r2.result as Record<string, any>).papers.length, 0);
  assert.equal((r2.result as Record<string, any>).headline, 'Nothing new for you today');
  // Its own page: Save and Not for me kept in its records through the routes, read back as its view reads them.
  const key = res.papers[0].key;
  const add = (collection: string, record: Record<string, unknown>) => http.inject({ method: 'POST', url: `/api/apps/tpl:paper-radar/data/${collection}`, payload: { record } });
  assert.equal((await add('marks', { id: key, key, mark: 'saved', title: res.papers[0].title })).statusCode, 200);
  assert.equal((await add('saved', { id: key, key, title: res.papers[0].title, bibtex: res.papers[0].bibtex })).statusCode, 200);
  assert.equal((await add('saved', { id: key, key })).statusCode, 409, 'saved once');
  const marks = (await http.inject({ method: 'GET', url: '/api/apps/tpl:paper-radar/data/marks?where=' + encodeURIComponent('{"mark":"saved"}') })).json();
  assert.deepEqual(marks.records.map((m: any) => m.id), [key]);
  assert.equal((await http.inject({ method: 'GET', url: '/api/apps/tpl:paper-radar/data/nothing' })).statusCode, 404);
  assert.equal((await http.inject({ method: 'GET', url: '/api/apps/tpl:no-such-app/data/marks' })).statusCode, 404);
  assert.deepEqual(
    (await http.inject({ method: 'GET', url: '/api/apps/tpl:paper-radar/data' })).json().collections.map((c: any) => [c.name, c.count]),
    [
      ['saved', 1],
      ['marks', 1],
      ['seen', 2],
    ],
  );
  // What you saved leans the next ranking toward it: the saved paper is liked.
  const steps = store.listSteps(db, r2.id);
  assert.ok(steps.some((s) => s.id === 'liked' && s.status === 'done'));
});

// ---- run ---------------------------------------------------------------------------------------------------------

const only = LIVE ? tests.filter(([name]) => !/as it comes/.test(name)) : tests;
if (LIVE) console.log('LIVE: the programs that fetch ask the real services (their checks on exact values may differ)');
for (const [name, fn] of only) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${only.length} passed`);
srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
