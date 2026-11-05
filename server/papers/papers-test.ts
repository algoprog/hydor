// Script tests for the apps for papers and what they stand on: finding what a paper was given as, BibTeX in and out, a
// reading list's papers matched and merged, a LaTeX project read for its title, figures and text, Zotero kept in step
// (with canned answers: no key here), the ready-made apps' steps and views checked as a save checks them, their programs
// run on canned inputs, their flows run end to end with stand-ins (a model server, read_paper, save_sheet), the Library's
// save tools as steps, keys a flow needs, and a form filled in from its address. Then a few real look-ups on arXiv,
// Crossref and OpenAlex (ONLINE=0 leaves them out).
// Build and run with scratch folders, from the worktree:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/papers/papers-test.ts
//   DATA_DIR=/tmp/hydor-test-papers HYDOR_APPS_DIR=/tmp/hydor-test-papers-apps node dist/dev/papers-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import type { AnswerField } from '../../shared/apps.ts';
import { checkInputs, cleanRecipe, isActive, prefillOf } from '../../shared/apps.ts';
import { allSteps, checkFlow, givesOf, refsIn, STEP_ONLY_TOOLS, STEP_TOOLS, type CodeStep } from '../../shared/app-manifest.ts';
import { checkUi, missingIn, uiEngine, uiTexts } from '../../shared/app-ui.ts';
import { neededBy } from '../../shared/app-secrets.ts';
import { parseBibEntry } from '../../shared/latex-bib.ts';
import { VENUES, VENUE_NAMES } from '../../shared/venues.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import { saveSecret, vaultTables } from '../connections/vault.ts';
import { registerFeatures } from '../features/registry.ts';
import type { Deps, Feature, RunCtx } from '../features/types.ts';
import { setHelperModel } from '../helper.ts';
import { AGENT_FILE } from '../models/config.ts';
import { apps } from '../apps/index.ts';
import { mediaBytes } from '../apps/media.ts';
import { startRuns, waitFor } from '../apps/runs.ts';
import { needSecrets } from '../apps/secrets.ts';
import * as store from '../apps/store.ts';
import { TEMPLATES } from '../apps/templates.ts';
import { pages } from '../pages/index.ts';
import { initPages, pageInfo, pageSource } from '../pages/store.ts';
import { createSpace } from '../spaces/index.ts';
import { findSame, mergePaper, readBib, samePaper, splitBib, statusOf, tagsOf, tidyPaper, writeBib, type Paper } from './bib.ts';
import { papers, READ_PAPER, useZoteroForTests } from './index.ts';
import { appList, findPapers, keepPapers, READING_LIST } from './list.ts';
import { arxivIn, arxivRecords, bibOfRecord, doiIn, expandTex, invertedAbstract, mainTexOf, metaTags, paperQuery, partsOf, readLatexSource, readPaper, recordOfBib, sectionsOf, texPlain, titleFromFirstPage, titleLike } from './resolve.ts';
import { libraryOf, paperOfZotero, summaryOf, syncZotero, zoteroOfPaper, type ZoteroSend } from './zotero.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HYDOR_APPS_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-papers-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
initPages(db);
vaultTables(db);
let passed = 0;
let skipped = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!;
const IDS = ['reading-list', 'literature-matrix', 'reproduce-paper', 'reviewer-simulator', 'rebuttal-workbench', 'paper-to-talk', 'figure-doctor'];

/** One of a template's code steps, wherever it is (its main flow or another), run on canned input. */
async function program(id: string, step: string, input: Record<string, unknown>): Promise<any> {
  const t = tpl(id);
  const all = [...allSteps(t.flow!.steps), ...Object.values(t.flows ?? {}).flatMap((f) => allSteps(f.steps))];
  const s = all.find((x) => x.id === step) as CodeStep | undefined;
  assert.ok(s && s.do === 'code' && s.language === 'javascript', `${id}: ${step} is a JavaScript step`);
  return new AsyncFunction('input', 'ctx', s.code)(input, {});
}

// ---- stand-ins ----------------------------------------------------------------------------------------------------------

class FakeSessions extends EventEmitter {
  made: { key: string; o: any }[] = [];
  async create(o: any) {
    const key = `acp:fake-${this.made.length + 1}`;
    this.made.push({ key, o });
    return key;
  }
  summary() {
    return null;
  }
  async timeline() {
    return { parser: { items: [] }, readMore: async () => {} } as any;
  }
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  setFlags() {}
  async interrupt() {}
  async deliverOrQueue() {}
}

/** A model server as Custom's speak to theirs: each answer made from what its step asks for (its fields' ids). */
const model = { calls: [] as { system: string; user: string }[] };
function answerFor(system: string, user: string): Record<string, unknown> {
  const ids = new Set([...system.matchAll(/^- (\w+) \(/gm)].map((m) => m[1]));
  if (ids.has('cells')) {
    const cols = /The columns, in this order:\n([\s\S]*?)\n\n/.exec(user)?.[1].split('\n').map((l) => l.replace(/^- /, '').trim()) ?? [];
    return { cells: cols.map((c, i) => ({ column: c, answer: `${c} of it`, where: `p. ${i + 1}` })), gist: 'It ranks passages.' };
  }
  if (ids.has('synthesis')) return { synthesis: 'They agree on recall [1] and differ on cost [2].' };
  if (ids.has('points')) {
    const who = /Reviewer (\S+):/.exec(user)?.[1] ?? 'R1';
    return { points: [{ point: 'No comparison with ColBERTv2', quote: 'does not compare with ColBERTv2', kind: 'Needs an experiment', severity: 'Major' }, { point: `A detail ${who} asks about`, quote: 'Section 4.2 should say', kind: 'Needs words', severity: 'Minor' }] };
  }
  if (ids.has('groups')) {
    const all = [...user.matchAll(/^(R\d+\.\d+) \[/gm)].map((m) => m[1]);
    const shared = all.filter((id) => id.endsWith('.1'));
    return { groups: [{ point: 'Compare with ColBERTv2', kind: 'Needs an experiment', ids: shared.join(', '), priority: 1 }, ...all.filter((id) => !id.endsWith('.1')).map((id, i) => ({ point: `Detail ${id}`, kind: 'Needs words', ids: id, priority: i + 2 }))] };
  }
  if (ids.has('reply')) return { reply: /ColBERTv2/.test(user) ? 'We will add ColBERTv2 to Table 2: [results].' : 'Section 4.2 now names the split (§4.2).', kind: /ColBERTv2/.test(user) ? 'Needs an experiment' : 'Needs words', cites: ['§4.2'], experiment: /ColBERTv2/.test(user) ? 'Run ColBERTv2 on MS MARCO dev' : 'None', change: /ColBERTv2/.test(user) ? 'Add ColBERTv2 to Table 2' : 'Name the split in §4.2' };
  if (ids.has('fields') && ids.has('scores')) {
    const n = Number(/You are reviewer (\d+)/.exec(user)?.[1] ?? 1);
    return { summary: `Review ${n}.`, fields: [{ id: 'summary', text: 'It does X.' }], scores: [{ id: 'overall', score: n === 1 ? 2 : 1 }, { id: 'confidence', score: 4 }, { id: 'soundness', score: 9 }], strengths: ['Clear'], weaknesses: [{ point: 'Weak baselines', severity: 'Major', kind: 'Baselines' }], questions: ['Why?'], missing: [{ kind: 'Baseline', what: 'BM25', why: 'standard' }], recommendation: 'Findings' };
  }
  if (ids.has('meta') && ids.has('risks')) return { verdict: 'Borderline', meta: 'The reviewers agree the baselines are weak.', risks: [{ weakness: 'Clarity', why: 'minor', likelihood: 'Low', fix: 'rewrite' }, { weakness: 'Baselines', why: 'all reviewers', likelihood: 'High', fix: 'add BM25' }], asks: [{ kind: 'Baseline', what: 'BM25', why: 'standard', effort: 'hours' }], checklist: ['Add BM25', 'Fix Table 3'] };
  if (ids.has('slides')) return { slides: [1, 2, 3, 4].map((i) => ({ title: `Slide ${i}`, minutes: i === 1 ? 1 : 4, points: 'a; b', figure: '', equation: '', notes: 'Say it.' })), message: 'Late interaction is fast.', hook: 'What if?' };
  if (ids.has('x') && ids.has('linkedin')) return { x: ['Post one', 'Post two'], bluesky: ['Post one', 'Post two'], linkedin: 'A post.' };
  if (ids.has('setting')) return { setting: 'MS MARCO dev', expected: [{ metric: 'MRR@10', setting: 'Table 1', value: 0.36, where: 'p. 6' }], data: [], checkpoints: [] };
  return {};
}
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const system = String(b.messages?.find((m: any) => m.role === 'system')?.content ?? '');
    const user = String(b.messages?.find((m: any) => m.role === 'user')?.content ?? '');
    model.calls.push({ system, user });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(answerFor(system, user)) }, finish_reason: 'stop' }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
fs.writeFileSync(AGENT_FILE, JSON.stringify({ models: [{ id: 'fake', label: 'Fake', provider: 'endpoint', baseUrl: `http://127.0.0.1:${(srv.address() as { port: number }).port}/v1`, model: 'fake-1', tools: 'native' }] }));

/** Papers read_paper finds here, by what was given (no web): an id's record, a PDF's pages. */
const CANNED: Record<string, Record<string, unknown>> = {
  '1706.03762': { title: 'Attention Is All You Need', authors: ['Ashish Vaswani', 'Noam Shazeer'], year: '2017', venue: 'arXiv', arxiv: '1706.03762', url: 'https://arxiv.org/abs/1706.03762', bibtex: '@misc{vaswani2017attention,\n  title = {Attention Is All You Need},\n  eprint = {1706.03762}\n}\n', key: 'vaswani2017attention' },
  '2004.12832': { title: 'ColBERT: Efficient and Effective Passage Search', authors: ['Omar Khattab', 'Matei Zaharia'], year: '2020', venue: 'SIGIR', doi: '10.1145/3397271.3401075', arxiv: '2004.12832', url: 'https://doi.org/10.1145/3397271.3401075' },
};
const readCalls: Record<string, unknown>[] = [];
const fakePaper: Feature = {
  id: 'fake-papers',
  tools: () => [
    {
      name: 'read_paper',
      description: 'Reads a paper.',
      inputSchema: { type: 'object' },
      async run(a) {
        readCalls.push(a);
        const given = String(a.upload || a.paper || '');
        const id = arxivIn(given) || (given.includes('3397271') ? '2004.12832' : '');
        const rec = CANNED[id];
        if (!rec) return JSON.stringify({ found: false, title: /^[A-Z][a-z]/.test(given) && !/\d{4}\./.test(given) ? given : '', authors: [], parts: [], notes: [`No paper “${given}” was found.`] });
        const text = a.text === false ? [] : ['[Page 1]\n1 Introduction\nWe rank passages with late interaction.', '[Page 2]\n4 Experiments\nOn MS MARCO dev the MRR@10 is 36.0. Section 4.2 uses the dev split.'];
        return JSON.stringify({ found: true, ...rec, parts: text, sections: ['1 Introduction', '4 Experiments'], source: text.length ? 'arXiv’s PDF' : '', figures: [{ file: '/tmp/fig1.pdf', caption: 'The model', label: 'fig:model' }], notes: [] });
      },
    },
    {
      name: 'save_sheet',
      description: 'Saves a spreadsheet.',
      inputSchema: { type: 'object' },
      async run(a) {
        sheetsSaved.push(a);
        return `Saved "${a.title}" (page sheet42, version 1), 2 sheets. It shows in the conversation and in the Library (http://test.local/pages/sheet42).`;
      },
    },
  ],
};
const sheetsSaved: Record<string, unknown>[] = [];

const events: unknown[] = [];
const http = Fastify();
await http.register(cookie);
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
});
const deps = { app: http, db, sessions: new FakeSessions() as any, scheduler: undefined, models: null as any, broadcast: (e: unknown) => events.push(e), toSubscribers: () => {}, publicBase: () => 'http://test.local' } as unknown as Deps;
apps.routes!(deps);
registerFeatures([fakePaper, papers], deps);
startRuns(deps);
await http.ready();
setHelperModel(db, 'fake');

/** A run of one of the ready-made apps (its main flow, or another), waited for to its end. */
async function run(id: string, inputs: Record<string, unknown>, flow?: string) {
  const r = await http.inject({ method: 'POST', url: `/api/apps/tpl:${id}/runs`, payload: { inputs, ...(flow ? { flow } : {}) } });
  assert.equal(r.statusCode, 200, `${id}${flow ? ` (${flow})` : ''} starts: ${r.body}`);
  const done = await waitFor(r.json().run.id, 60_000);
  assert.ok(done && !isActive(done.status), `${id} ended`);
  assert.equal(done!.status, 'done', `${id}${flow ? ` (${flow})` : ''} ends well: ${done!.error ?? ''}`);
  return done!;
}

const today = new Date().toISOString().slice(0, 10);

// ---- what a paper was given as ---------------------------------------------------------------------------------------------

test('a paper given any way: arXiv ids and links, DOIs alone or in a publisher’s link, links, a Library document, files, and titles', () => {
  assert.equal(arxivIn('arXiv:1706.03762v5'), '1706.03762');
  assert.equal(arxivIn('https://arxiv.org/pdf/2004.12832v2'), '2004.12832');
  assert.equal(arxivIn('https://arxiv.org/html/2310.06825'), '2310.06825');
  assert.equal(arxivIn('10.48550/arXiv.2106.09685'), '2106.09685');
  assert.equal(arxivIn('hep-th/9901001'), 'hep-th/9901001');
  assert.equal(arxivIn('10.1145/3397271.3401075'), '');
  assert.equal(doiIn('doi:10.1145/3397271.3401075.'), '10.1145/3397271.3401075');
  assert.equal(doiIn('https://dl.acm.org/doi/10.1145/3397271.3401075'), '10.1145/3397271.3401075');
  assert.equal(doiIn('10.48550/arXiv.1706.03762'), '', 'arXiv’s own DOIs go by arXiv');
  assert.deepEqual(paperQuery('1706.03762'), { kind: 'arxiv', id: '1706.03762' });
  assert.deepEqual(paperQuery('https://link.springer.com/article/10.1007/s10791-020-09377-3'), { kind: 'doi', doi: '10.1007/s10791-020-09377-3' });
  assert.deepEqual(paperQuery('https://aclanthology.org/2020.emnlp-main.550/'), { kind: 'url', url: 'https://aclanthology.org/2020.emnlp-main.550/' });
  assert.deepEqual(paperQuery('/pages/abc123'), { kind: 'library', id: 'abc123' });
  assert.deepEqual(paperQuery('https://dev.naget.com/pages/abc123'), { kind: 'library', id: 'abc123' });
  assert.deepEqual(paperQuery('Dense Passage Retrieval for Open-Domain Question Answering'), { kind: 'title', words: 'Dense Passage Retrieval for Open-Domain Question Answering' });
  const pdf = path.join(tmp, 'draft.pdf');
  fs.writeFileSync(pdf, '%PDF-1.4');
  assert.deepEqual(paperQuery(pdf), { kind: 'path', path: pdf });
  assert.deepEqual(paperQuery('draft.pdf', tmp), { kind: 'path', path: pdf });
  assert.deepEqual(paperQuery('missing.pdf', tmp).kind, 'title', 'a file that is not there is a title');
});

test('titles: alike by their words, from a PDF’s first page, its headings', () => {
  assert.equal(titleLike('Attention Is All You Need', 'Attention is all you need.'), 1);
  assert.ok(titleLike('Dense Passage Retrieval for Open-Domain QA', 'Dense Passage Retrieval for Open-Domain Question Answering') > 0.7);
  assert.ok(titleLike('BERT', 'Attention Is All You Need') < 0.2);
  const page = 'arXiv:2004.12832v2 [cs.IR] 4 Jun 2020\nColBERT: Efficient and Effective Passage Search via\nContextualized Late Interaction over BERT\nOmar Khattab\nStanford University\nokhattab@stanford.edu\nAbstract';
  assert.equal(titleFromFirstPage(page), 'ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT');
  assert.deepEqual(sectionsOf('[Page 1]\n1 Introduction\ntext\n\n4.2 Training Details\nmore\n\nReferences\n'), ['1 Introduction', '4.2 Training Details', 'References']);
  const parts = partsOf(`${'a '.repeat(6000)}\n\n${'b '.repeat(6000)}\n\n${'c '.repeat(6000)}`, 18_000);
  assert.ok(parts.length >= 2 && parts.every((p) => p.length <= 18_000), 'parts no longer than asked');
});

test('records: arXiv’s feed, a BibTeX entry, OpenAlex’s abstract, a page’s citation tags; and BibTeX made from a record', () => {
  const feed = `<feed><entry><id>http://arxiv.org/abs/1706.03762v7</id><published>2017-06-12T17:57:34Z</published><title>Attention Is All
  You Need</title><summary>The dominant sequence transduction models…</summary><author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author><arxiv:doi>10.5555/3295222</arxiv:doi><arxiv:primary_category term="cs.CL"/></entry></feed>`;
  const [r] = arxivRecords(feed);
  assert.equal(r.title, 'Attention Is All You Need');
  assert.deepEqual(r.authors, ['Ashish Vaswani', 'Noam Shazeer']);
  assert.equal(r.year, '2017');
  assert.equal(r.arxiv, '1706.03762');
  assert.equal(r.doi, '10.5555/3295222');
  assert.equal(r.category, 'cs.CL');
  const e = parseBibEntry('@inproceedings{khattab2020colbert, author = {Khattab, Omar and Zaharia, Matei}, title = {{ColBERT}: Efficient and Effective Passage Search}, booktitle = {SIGIR}, year = 2020, doi = {10.1145/3397271.3401075}}')!;
  const rec = recordOfBib(e);
  assert.deepEqual(rec.authors, ['Omar Khattab', 'Matei Zaharia']);
  assert.equal(rec.title, 'ColBERT: Efficient and Effective Passage Search');
  assert.equal(rec.venue, 'SIGIR');
  assert.equal(rec.doi, '10.1145/3397271.3401075');
  assert.equal(recordOfBib(parseBibEntry('@misc{x, title={T}, eprint={2004.04906}, archivePrefix={arXiv}}')!).arxiv, '2004.04906');
  assert.equal(invertedAbstract({ dense: [0], retrieval: [1, 3], works: [2] }), 'dense retrieval works retrieval');
  assert.deepEqual(metaTags(`<meta name="citation_title" content="Don't Stop"><meta content="10.1/x" name="citation_doi">`), [
    { name: 'citation_title', content: "Don't Stop" },
    { name: 'citation_doi', content: '10.1/x' },
  ]);
  const made = bibOfRecord({ title: 'ColBERT & Co', authors: ['Omar Khattab'], year: '2020', venue: 'Proceedings of SIGIR', doi: '10.1145/3397271.3401075' });
  assert.match(made.bibtex, /^@inproceedings\{khattab2020colbert,/);
  assert.match(made.bibtex, /title\s+= \{ColBERT \\& Co\}/);
  assert.match(made.bibtex, /booktitle\s+= \{Proceedings of SIGIR\}/);
  assert.match(bibOfRecord({ title: 'A preprint', authors: ['Jane Doe'], year: '2025', arxiv: '2501.00001' }).bibtex, /^@misc\{doe2025preprint,[\s\S]*eprint\s+= \{2501\.00001\}[\s\S]*archivePrefix = \{arXiv\}/);
});

test('LaTeX: the main file found, what it brings in put in, its title, authors, abstract, sections and figures with their files', () => {
  const dir = path.join(tmp, 'paper-src');
  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'figs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'macros.tex'), '\\newcommand{\\sys}{ColBERT}\n');
  fs.writeFileSync(
    path.join(dir, 'paper.tex'),
    '\\documentclass{article}\n\\graphicspath{{figs/}}\n\\title{Late Interaction\\thanks{Work done at X.}}\n\\author{Omar Khattab \\\\ Stanford \\and Matei Zaharia\\\\Stanford}\n\\begin{document}\n\\maketitle\n\\begin{abstract}We present \\textbf{ColBERT}. % a comment\n\\end{abstract}\n\\input{sections/intro}\n\\begin{figure}\\centering\\includegraphics[width=\\linewidth]{arch}\\caption{The \\sys{} model.}\\label{fig:arch}\\end{figure}\n\\end{document}\n',
  );
  fs.writeFileSync(path.join(dir, 'sections', 'intro.tex'), '\\section{Introduction}\nRanking with BERT is slow. 50\\% faster.\n');
  fs.writeFileSync(path.join(dir, 'figs', 'arch.pdf'), '%PDF-1.4');
  fs.writeFileSync(path.join(dir, 'refs.bib'), '@misc{a, title={A}}');
  assert.equal(mainTexOf(dir), path.join(dir, 'paper.tex'));
  const full = expandTex(path.join(dir, 'paper.tex'), dir);
  assert.match(full, /Ranking with BERT is slow/);
  assert.ok(!/a comment/.test(full), 'comments left out');
  assert.match(full, /50\\% faster/, 'an escaped % stays');
  const files = [path.join(dir, 'paper.tex'), path.join(dir, 'figs', 'arch.pdf'), path.join(dir, 'refs.bib'), path.join(dir, 'sections', 'intro.tex')];
  const src = readLatexSource(full, dir, dir, files);
  assert.equal(src.title, 'Late Interaction');
  assert.deepEqual(src.authors, ['Omar Khattab', 'Matei Zaharia']);
  assert.equal(src.abstract, 'We present ColBERT.');
  assert.deepEqual(src.figures, [{ file: path.join(dir, 'figs', 'arch.pdf'), caption: 'The model.', label: 'fig:arch' }]);
  assert.deepEqual(src.bibs, [path.join(dir, 'refs.bib')]);
  assert.ok(src.sections.includes('Introduction'));
  assert.equal(texPlain('\\emph{Fast} retrieval~\\cite{x}'), 'Fast retrieval');
});

test('read_paper: a LaTeX project’s folder read as a paper, as a step reads it (with its figures and its text in parts)', async () => {
  const dir = path.join(tmp, 'paper-src');
  const r = JSON.parse((await READ_PAPER.run({ paper: dir }, { runId: 'flow-x', key: 'acp:flow-x', agent: 'acp', cwd: tmp, deps, step: true } as RunCtx)) as string);
  assert.equal(r.found, true);
  assert.equal(r.kind, 'latex');
  assert.equal(r.title, 'Late Interaction');
  assert.equal(r.main, path.join(dir, 'paper.tex'));
  assert.equal(r.figures.length, 1);
  assert.equal(r.source, 'its LaTeX source');
  assert.ok(r.parts.length >= 1 && /Ranking with BERT/.test(r.parts.join('\n')));
  const none = JSON.parse((await READ_PAPER.run({ paper: '' }, { runId: 'flow-x', key: 'k', agent: 'acp', cwd: tmp, deps, step: true } as RunCtx)) as string);
  assert.equal(none.found, false);
  assert.match(none.notes[0], /Say which paper/);
});

// ---- BibTeX and the reading list's papers -------------------------------------------------------------------------------

const BIB = String.raw`@string{sigir = "Proceedings of SIGIR"}
@comment{ made by hand }
@inproceedings{khattab2020colbert,
  author    = {Khattab, Omar and Zaharia, Matei},
  title     = {{ColBERT}: Efficient and Effective Passage Search via Contextualized Late Interaction over {BERT}},
  booktitle = sigir,
  year      = {2020},
  doi       = {10.1145/3397271.3401075},
  keywords  = {retrieval, late interaction}
}

@article{karpukhin2020dense,
  title = "Dense Passage Retrieval for Open-Domain Question Answering",
  author = "Karpukhin, Vladimir and O{\u{g}}uz, Barlas",
  journal = {arXiv preprint arXiv:2004.04906},
  year = 2020
}

@misc{notitle, author = {Nobody}, year = {2021}}
`;

test('a .bib: its entries split (braces and quotes, @string put in, @comment left out), each a paper, those without a title counted', () => {
  assert.equal(splitBib(BIB).length, 3);
  const { papers: ps, skipped } = readBib(BIB);
  assert.equal(ps.length, 2);
  assert.equal(skipped, 1);
  assert.equal(ps[0].venue, 'Proceedings of SIGIR');
  assert.equal(ps[0].authors, 'Omar Khattab, Matei Zaharia');
  assert.deepEqual(ps[0].tags, ['retrieval', 'late interaction']);
  assert.equal(ps[0].key, 'khattab2020colbert');
  assert.equal(ps[0].url, 'https://doi.org/10.1145/3397271.3401075');
  assert.equal(ps[1].arxiv, '2004.04906');
  assert.equal(ps[1].venue, 'arXiv');
  assert.equal(ps[1].year, 2020);
});

test('papers: the same one told apart (DOI, arXiv id, Zotero key, title and year), merged without overwriting what is yours, written as a .bib with keys of their own', () => {
  assert.ok(samePaper({ doi: '10.1/A' }, { doi: '10.1/a' }));
  assert.ok(!samePaper({ doi: '10.1/a', title: 'X' }, { doi: '10.1/b', title: 'X' }), 'two DOIs: two papers');
  assert.ok(samePaper({ arxiv: '1706.03762v2' }, { arxiv: '1706.03762' }));
  assert.ok(samePaper({ title: 'Attention Is All You Need', year: 2017 }, { title: 'Attention is all you need!', year: 2018 }));
  assert.ok(!samePaper({ title: 'Attention Is All You Need', year: 2017 }, { title: 'Attention is all you need', year: 2021 }));
  assert.equal(findSame([{ id: 'a', title: 'X', zotero_key: 'ABCD1234' }, { id: 'b', title: 'Y' }], { title: 'Y', zotero_key: 'ABCD1234' })?.id, 'a', 'a Zotero key first');
  assert.equal(statusOf('done'), 'Read');
  assert.equal(statusOf('to-read'), 'To read');
  assert.deepEqual(tagsOf('#a, b; a\nc'), ['a', 'b', 'c']);
  const kept: Paper = { title: 'X', status: 'Read', notes: 'Mine', tags: ['a'], venue: '' };
  assert.deepEqual(mergePaper(kept, { title: 'X', status: 'To read', notes: 'Theirs', tags: ['b'], venue: 'SIGIR' }), { venue: 'SIGIR', tags: ['a', 'b'] });
  assert.equal(mergePaper(kept, { title: 'X', tags: ['a'] }), null, 'nothing new: nothing changes');
  assert.deepEqual(mergePaper({ title: 'Old', venue: 'arXiv' }, { title: 'New', venue: 'SIGIR' }, { metadata: true }), { title: 'New', venue: 'SIGIR' }, 'a newer record changes the record');
  const t = tidyPaper({ title: '  A  paper ', year: '2020a', doi: 'https://doi.org/10.1145/x', arxiv: 'arXiv:2004.04906v3', status: 'reading', zotero_key: 'bad', url: 'nope' });
  assert.deepEqual(t, { title: 'A paper', year: 2020, doi: '10.1145/x', arxiv: '2004.04906', url: 'https://doi.org/10.1145/x', status: 'Reading' });
  const bib = writeBib([{ title: 'A', authors: 'Jane Doe', year: 2020, bibtex: '@misc{doe2020a, title={A}}' }, { title: 'B', authors: 'Jane Doe', year: 2020, bibtex: '@misc{doe2020a, title={B}}' }, { title: 'Made here', authors: 'Ann Lee', year: 2024 }]);
  assert.deepEqual([...bib.matchAll(/^@\w+\{([^,]+),/gm)].map((m) => m[1]), ['doe2020a', 'doe2020a2', 'lee2024made']);
});

// ---- a reading list -------------------------------------------------------------------------------------------------------

const LIST_DATA = tpl('reading-list').data;

test('a list: papers kept (new ones added with today’s date, the rest completed), found by status, tag, project and words', () => {
  const list = appList(db, 'test-list', LIST_DATA);
  const a = keepPapers(list, [{ title: 'Attention Is All You Need', arxiv: '1706.03762', tags: ['architecture'] }, { title: 'BERT', doi: '10.18653/v1/N19-1423' }], { today: '2026-11-05', project: 'Transformers', tags: ['to cite'] });
  assert.deepEqual([a.added, a.updated, a.unchanged, a.count], [2, 0, 0, 2]);
  assert.equal(a.papers[0].status, 'To read');
  assert.equal(a.papers[0].added, '2026-11-05');
  assert.deepEqual(a.papers[0].tags, ['architecture', 'to cite']);
  assert.match(a.papers[1].bibtex ?? '', /^@\w+\{/, 'a BibTeX entry made for one that had none');
  const b = keepPapers(list, [{ title: 'Attention is all you need', arxiv: '1706.03762v5', venue: 'NeurIPS', status: 'Read' }], { today: '2026-11-06' });
  assert.deepEqual([b.added, b.updated], [0, 1]);
  assert.equal(b.papers[0].venue, 'NeurIPS');
  assert.equal(b.papers[0].status, 'To read', 'its status stays yours');
  assert.equal(findPapers(list, { tag: 'architecture' }).length, 1);
  assert.equal(findPapers(list, { project: 'transformers' }).length, 2);
  assert.equal(findPapers(list, { search: 'bert' }).length, 1);
  assert.equal(findPapers(list, { status: 'Read' }).length, 0);
});

// ---- Zotero, with canned answers -----------------------------------------------------------------------------------------

/** Zotero as its API answers, kept in memory: items with versions, a library version, deletions; and what it was asked. */
function fakeZotero() {
  const z = {
    version: 100,
    items: [
      { key: 'ZCOLBERT', version: 90, data: { itemType: 'conferencePaper', title: 'ColBERT: Efficient and Effective Passage Search', creators: [{ creatorType: 'author', firstName: 'Omar', lastName: 'Khattab' }], date: '2020-07', proceedingsTitle: 'SIGIR 2020', DOI: '10.1145/3397271.3401075', tags: [{ tag: 'retrieval' }] }, bibtex: '@inproceedings{khattab_colbert_2020,\n title = {{ColBERT}},\n}\n' },
      { key: 'ZDPR0001', version: 95, data: { itemType: 'preprint', title: 'Dense Passage Retrieval for Open-Domain Question Answering', creators: [{ creatorType: 'author', firstName: 'Vladimir', lastName: 'Karpukhin' }], date: '2020', archiveID: 'arXiv:2004.04906', repository: 'arXiv', tags: [] } },
      { key: 'ZNOTE001', version: 96, data: { itemType: 'note', note: 'just a note' } },
    ] as { key: string; version: number; data: Record<string, any>; bibtex?: string }[],
    deleted: [] as string[],
    calls: [] as { method: string; url: string; headers: Record<string, string>; body?: string }[],
  };
  const send: ZoteroSend = async (c) => {
    z.calls.push(c);
    assert.equal(c.headers['Zotero-API-Version'], '3');
    const u = new URL(c.url);
    if (u.pathname === '/keys/current') return { status: 200, headers: {}, body: JSON.stringify({ userID: 4242, username: 'chris' }) };
    assert.ok(u.pathname.startsWith('/users/4242/'), `the user's library: ${u.pathname}`);
    const since = Number(u.searchParams.get('since') ?? c.headers['If-Modified-Since-Version'] ?? 0);
    if (u.pathname === '/users/4242/items/top' && c.method === 'GET') {
      if (c.headers['If-Modified-Since-Version'] && Number(c.headers['If-Modified-Since-Version']) >= z.version) return { status: 304, headers: { 'last-modified-version': String(z.version) }, body: '' };
      const changed = z.items.filter((i) => i.version > since);
      const start = Number(u.searchParams.get('start') ?? 0);
      const limit = Number(u.searchParams.get('limit') ?? 50);
      assert.equal(u.searchParams.get('include'), 'data,bibtex');
      return { status: 200, headers: { 'last-modified-version': String(z.version), 'total-results': String(changed.length) }, body: JSON.stringify(changed.slice(start, start + limit)) };
    }
    if (u.pathname === '/users/4242/deleted') return { status: 200, headers: { 'last-modified-version': String(z.version) }, body: JSON.stringify({ items: z.deleted, collections: [] }) };
    if (u.pathname === '/users/4242/items' && c.method === 'POST') {
      assert.match(c.headers['Zotero-Write-Token'] ?? '', /^[a-f0-9]{32}$/, 'a write token, so a retry never makes two');
      const sent = JSON.parse(c.body ?? '[]') as Record<string, any>[];
      z.version++;
      const successful: Record<string, { key: string; version: number }> = {};
      sent.forEach((it, i) => {
        assert.ok(it.itemType && it.title, 'each item has its type and title');
        const key = `ZNEW000${i}`;
        z.items.push({ key, version: z.version, data: it });
        successful[String(i)] = { key, version: z.version };
      });
      return { status: 200, headers: { 'last-modified-version': String(z.version) }, body: JSON.stringify({ successful, success: Object.fromEntries(Object.entries(successful).map(([k, v]) => [k, v.key])), unchanged: {}, failed: {} }) };
    }
    return { status: 404, headers: {}, body: 'Not found' };
  };
  return { z, send };
}

test('Zotero: items as papers and papers as items; a library from a user ID or a group’s; a sync’s summary in a line', () => {
  const p = paperOfZotero({ key: 'ABCD1234', version: 7, data: { itemType: 'journalArticle', title: 'T', creators: [{ creatorType: 'editor', name: 'Ed' }, { creatorType: 'author', firstName: 'Ann', lastName: 'Lee' }], date: '2019-03-01', publicationTitle: 'IRJ', extra: 'arXiv: 1901.04085\nDOI: 10.1234/zz', tags: [{ tag: 'rerank' }] }, bibtex: '@article{lee_t_2019,\n title={T}\n}' })!;
  assert.deepEqual([p.authors, p.year, p.venue, p.doi, p.arxiv, p.key, p.zotero_key, p.zotero_version], ['Ann Lee', 2019, 'IRJ', '10.1234/zz', '1901.04085', 'lee_t_2019', 'ABCD1234', 7]);
  assert.deepEqual(p.tags, ['rerank']);
  assert.equal(paperOfZotero({ key: 'NOTE0001', version: 1, data: { itemType: 'note', note: 'x' } }), null);
  const conf = zoteroOfPaper({ title: 'ColBERT', authors: 'Omar Khattab, Matei Zaharia', year: 2020, venue: 'SIGIR', doi: '10.1145/3397271.3401075', bibtex: '@inproceedings{k, title={ColBERT}}', tags: ['ir'] });
  assert.deepEqual([conf.itemType, conf.proceedingsTitle, conf.DOI, conf.date], ['conferencePaper', 'SIGIR', '10.1145/3397271.3401075', '2020']);
  assert.deepEqual(conf.creators, [
    { creatorType: 'author', firstName: 'Omar', lastName: 'Khattab' },
    { creatorType: 'author', firstName: 'Matei', lastName: 'Zaharia' },
  ]);
  const pre = zoteroOfPaper({ title: 'A preprint', arxiv: '2501.00001' });
  assert.deepEqual([pre.itemType, pre.repository, pre.archiveID], ['preprint', 'arXiv', 'arXiv:2501.00001']);
  assert.equal(zoteroOfPaper({ title: 'A book', venue: 'MIT Press', bibtex: '@book{b, title={A book}}', doi: '10.1/b' }).extra, 'DOI: 10.1/b', 'a DOI where Zotero keeps none goes in Extra');
  assert.equal(libraryOf('4242'), 'users/4242');
  assert.equal(libraryOf('groups/77'), 'groups/77');
  assert.equal(libraryOf('me'), '');
  assert.equal(summaryOf({ added: 12, updated: 0, sent: 3, unlinked: 0, failed: [] }), '12 new from Zotero, 3 sent to it');
  assert.match(summaryOf({ added: 0, updated: 0, sent: 0, unlinked: 0, failed: [] }), /already in step/);
});

test('Zotero: the first sync takes everything and sends what is only here; the next moves only what changed (304), and a paper deleted there stays here, unlinked', async () => {
  const list = appList(db, 'zotero-list', LIST_DATA);
  keepPapers(list, [{ title: 'Attention Is All You Need', arxiv: '1706.03762' }, { title: 'ColBERT: Efficient and Effective Passage Search', doi: '10.1145/3397271.3401075', notes: 'Mine' }], { today });
  const { z, send } = fakeZotero();
  const first = await syncZotero(list, { send, since: 0, today });
  assert.deepEqual([first.library, first.added, first.updated, first.sent, first.unlinked], ['users/4242', 1, 1, 1, 0], first.summary);
  assert.equal(first.version, 101);
  assert.equal(first.summary, '1 new from Zotero, 1 updated from it, 1 sent to it');
  const all = list.all();
  assert.equal(all.length, 3);
  assert.equal(all.find((p) => p.doi === '10.1145/3397271.3401075')?.zotero_key, 'ZCOLBERT', 'matched by DOI and linked');
  assert.equal(all.find((p) => p.doi === '10.1145/3397271.3401075')?.notes, 'Mine', 'your notes stay');
  assert.equal(all.find((p) => p.arxiv === '1706.03762')?.zotero_key, 'ZNEW0000', 'the one only here was sent, and keeps its key');
  assert.equal(all.find((p) => p.arxiv === '2004.04906')?.zotero_key, 'ZDPR0001');
  assert.ok(!all.some((p) => /note/.test(p.title)), 'notes in Zotero are not papers');
  const posted = z.calls.filter((c) => c.method === 'POST');
  assert.equal(posted.length, 1);
  assert.equal(JSON.parse(posted[0].body!)[0].title, 'Attention Is All You Need');
  // Nothing changed since: one request says so; a deletion there unlinks the paper here.
  z.deleted = ['ZDPR0001'];
  const calls = z.calls.length;
  const next = await syncZotero(list, { send, since: first.version, today, user: '4242' });
  assert.deepEqual([next.added, next.updated, next.sent, next.unlinked], [0, 0, 0, 1]);
  assert.equal(z.calls[calls].headers['If-Modified-Since-Version'], '101');
  assert.equal(next.summary, '1 deleted there (kept here)');
  const dpr = list.all().find((p) => p.arxiv === '2004.04906')!;
  assert.ok(dpr && !dpr.zotero_key, 'still here, no longer linked');
  const again = await syncZotero(list, { send, since: next.version, today, user: '4242' });
  assert.equal(again.sent, 0, 'and never sent back');
});

// ---- the ready-made apps --------------------------------------------------------------------------------------------------

/** An answer in the shape of its fields, every field there. */
function answerOf(answer: AnswerField[]): Record<string, unknown> {
  const cell = (type: string, n: number): unknown => (type === 'number' ? n : type === 'yesno' ? true : type === 'date' ? `2026-11-2${n}` : type === 'url' ? `https://example.com/${n}` : type === 'image' ? `https://example.com/${n}.png` : `text ${n}`);
  return Object.fromEntries(answer.map((f) => [f.id, f.type === 'table' ? [1, 2].map((n) => Object.fromEntries((f.columns ?? []).map((c) => [c.id, cell(c.type, n)]))) : f.type === 'list' ? ['one', 'two'] : cell(f.type, 1)]));
}

test('the seven apps: there, under Research and Writing, each checking out as a save checks it, with a view that uses only what it gives, and examples that pass their forms', async () => {
  const E = uiEngine();
  for (const id of IDS) {
    const t = tpl(id);
    assert.ok(t, `${id} is a ready-made app`);
    assert.ok(['Research', 'Writing'].includes(t.category ?? ''), `${id}: its kind`);
    assert.deepEqual(cleanRecipe(t).flow, t.flow, `${id}: its steps tidy as written`);
    const checked = (await http.inject({ method: 'POST', url: '/api/apps/check', payload: { recipe: t } })).json();
    assert.deepEqual(checked.errors, [], `${id}: its steps check out`);
    assert.deepEqual(checked.warnings.filter((w: string) => !/, which is empty when /.test(w)), [], `${id}: nothing it uses is missing`);
    assert.deepEqual(checkFlow(t).errors, [], `${id}: checkFlow`);
    assert.deepEqual(checkUi(t), { errors: [], warnings: [] }, `${id}: its view checks out`);
    const inputs = Object.fromEntries(t.fields.map((f) => [f.id, f.options?.[0] ?? (f.type === 'number' ? '3' : f.type === 'date' ? '2026-11-20' : 'x')]));
    assert.deepEqual(missingIn(t.ui!, { result: answerOf(t.answer), inputs }), [], `${id}: every name its view uses is given`);
    for (const el of Object.values(t.ui!.elements ?? {})) assert.equal(E.parse(el.html).error, undefined, `${id}: its elements parse`);
    assert.ok(uiTexts(t.ui).length > 5, `${id}: words to translate`);
    const used = new Set(refsIn([t.flow, ...Object.values(t.flows ?? {})]).map((r) => r.split(/[.[]/)[0]));
    for (const f of t.fields.filter((x) => x.required)) assert.ok(used.has(f.id), `${id}: ${f.id} is used`);
    const steps = allSteps(t.flow!.steps);
    for (const f of t.answer) {
      const ref = /^\{\{\s*(\w+)\.(\w+)\s*\}\}$/.exec(t.flow!.outputs?.[f.id] ?? '');
      assert.ok(ref, `${id}: ${f.id} comes from one value of a step`);
      const from = steps.find((s) => s.id === ref[1]);
      assert.ok(from && (givesOf(from) ?? []).includes(ref[2]), `${id}: ${f.id} from {{${ref[1]}.${ref[2]}}}`);
    }
    for (const s of steps) if (s.do === 'tool') assert.ok(STEP_TOOLS.includes(s.tool), `${id}: ${s.tool} runs as a step`);
    assert.ok((t.examples ?? []).length >= 2, `${id}: examples`);
    for (const e of t.examples ?? []) assert.deepEqual(checkInputs(t.fields, e.inputs).errors, [], `${id}, ${e.id}: its answers pass the form`);
  }
  // The contract: apps that take a paper ask for it by these two names.
  for (const id of ['reviewer-simulator', 'rebuttal-workbench', 'paper-to-talk', 'reproduce-paper']) {
    const f = tpl(id).fields;
    assert.equal(f.find((x) => x.id === 'paper')?.type, 'text', `${id}: paper`);
    assert.equal(f.find((x) => x.id === 'upload')?.type, 'file', `${id}: upload`);
  }
  assert.deepEqual(tpl('reviewer-simulator').fields.find((f) => f.id === 'venue')?.options, VENUE_NAMES);
  for (const v of VENUES) assert.ok(v.scores.some((s) => s.id === v.overall) && v.fields.length >= 3, `${v.name}: its form`);
  assert.equal(tpl('reading-list').ui!.pages.filter((p) => p.on === 'app').length, 3, 'the Reading list has a page of its own');
});

test('step tools: the Library’s saves and the papers’ tools run as steps; the papers’ only there', () => {
  for (const name of ['save_sheet', 'save_doc', 'save_slides', 'save_latex', 'save_page', 'read_paper', 'reading_list', 'zotero_sync']) assert.ok(STEP_TOOLS.includes(name), name);
  for (const name of ['read_paper', 'reading_list', 'zotero_sync']) assert.ok(STEP_ONLY_TOOLS.includes(name), name);
  assert.deepEqual(papers.tools!({ step: false } as RunCtx), [], 'agents in sessions do not get them');
  assert.deepEqual(papers.tools!({ step: true } as RunCtx).map((t) => t.name), ['read_paper', 'reading_list', 'zotero_sync']);
});

// ---- their programs, on canned inputs ------------------------------------------------------------------------------------

test('literature matrix: the papers asked for (lines, and the reading list by tag, project, status or ids), each once, and the matrix and its spreadsheet', async () => {
  const which = await program('literature-matrix', 'which', { papers: '1. 1706.03762\n- my reading list, tag: retrieval, project: Survey\nreading list: {"r1":true,"r2":true}', columns: 'Task\nData\nData\n', project: 'X' });
  assert.deepEqual(which.lines, ['1706.03762']);
  assert.equal(which.from, true);
  assert.equal(which.tag, 'retrieval');
  assert.equal(which.list_project, 'Survey');
  assert.deepEqual(which.ids, ['r1', 'r2']);
  assert.deepEqual(which.columns, ['Task', 'Data']);
  assert.deepEqual((await program('literature-matrix', 'which', { papers: '1706.03762\n2. 10.1145/3397271.3401075', columns: '', project: '' })).lines, ['1706.03762', '10.1145/3397271.3401075'], 'an id at the start of a line is not a list’s number');
  const alone = await program('literature-matrix', 'which', { papers: 'my reading list', columns: '', project: 'Survey' });
  assert.equal(alone.list_project, 'Survey', 'the form’s project, for “my reading list” alone');
  assert.equal(alone.columns.length, 6);
  const read = await program('literature-matrix', 'which', { papers: 'reading list, read', columns: 'A', project: '' });
  assert.equal(read.status, 'Read');
  const targets = await program('literature-matrix', 'targets', { lines: ['1706.03762', '1706.03762'], listed: { papers: [{ title: 'ColBERT', doi: '10.1/c', pdf: '/home/me/colbert.pdf' }, { title: 'DPR', arxiv: '2004.04906' }] } });
  assert.deepEqual(targets.items.map((x: any) => x.paper), ['1706.03762', '/home/me/colbert.pdf', 'arXiv:2004.04906'], 'each once, by what finds it best');
  await assert.rejects(() => program('literature-matrix', 'targets', { lines: [], listed: {} }), /No papers to read/);
  const row = await program('literature-matrix', 'row', { p: { n: 1, label: 'x', paper: 'x' }, got: { title: 'T', authors: ['A', 'B', 'C', 'D'], year: '2020', parts: ['text'], source: 'arXiv’s PDF', url: 'https://arxiv.org/abs/1' }, cells: [{ column: 'data', answer: 'MS MARCO', where: 'p. 3' }], gist: 'g', columns: ['Task', 'Data'] });
  assert.deepEqual(row.cells, [
    { n: 1, column: 'Task', answer: 'Not stated', where: '' },
    { n: 1, column: 'Data', answer: 'MS MARCO', where: 'p. 3' },
  ]);
  assert.equal(row.authors, 'A, B, C et al.');
  assert.equal(row.read, true);
  const m = await program('literature-matrix', 'matrix', { rows: [row, { n: 2, title: 'Gone', read: false, note: 'It was not found.', cells: [] }], items: [{ n: 1, label: 'x' }, { n: 2, label: 'Gone' }], columns: ['Task', 'Data'], left: 0, project: 'Survey', today: '2026-11-05' });
  assert.equal(m.count, 1);
  assert.deepEqual(m.unread, ['Gone: It was not found.']);
  assert.deepEqual(m.sheets[0].rows[0], ['Paper', 'Year', 'Task', 'Data', 'Link']);
  assert.deepEqual(m.sheets[0].rows[1].slice(2, 4), ['Not stated', 'MS MARCO [p. 3]']);
  assert.equal(m.title, 'Literature matrix: Survey (2026-11-05)');
  const kept = await program('literature-matrix', 'kept', { saved: 'Saved "M" (page abc_12, version 1), 2 sheets.' });
  assert.deepEqual(kept, { sheet: 'abc_12', saved: true });
});

test('reproduce a paper: its code found in it (near "code" first), the repository picked from a search, the numbers compared with the paper’s', async () => {
  const hints = await program('reproduce-paper', 'hints', { read: { title: 'ColBERT: Efficient Passage Search', parts: ['See https://github.com/other/thing. Our code is available at https://github.com/stanford-futuredata/ColBERT.', 'Models at https://huggingface.co/colbert-ir/colbertv2.0'] }, code: '', paper: 'x' });
  assert.equal(hints.repo, 'https://github.com/stanford-futuredata/ColBERT');
  assert.deepEqual(hints.hf, ['https://huggingface.co/colbert-ir/colbertv2.0']);
  assert.equal((await program('reproduce-paper', 'hints', { read: {}, code: '~/src/colbert', paper: 'Some title' })).repo, '~/src/colbert', 'the code given first');
  const pick = await program('reproduce-paper', 'pick', { github: 'HTTP 200 OK\ncontent-type: application/json\n\n' + JSON.stringify({ items: [{ html_url: 'https://github.com/a/unrelated', full_name: 'a/unrelated', description: 'cats', stargazers_count: 9000 }, { html_url: 'https://github.com/b/colbert', full_name: 'b/colbert', description: 'Efficient passage search', stargazers_count: 10 }] }), web: '', words: 'ColBERT Efficient Passage Search' });
  assert.equal(pick.repo, 'https://github.com/b/colbert');
  const cmp = await program('reproduce-paper', 'compare', { results: [{ metric: 'MRR@10', setting: 'dev', paper: 36.0, ours: 35.6 }, { metric: 'Recall@1k', setting: 'dev', paper: 0.968, ours: 0.95 }, { metric: 'Latency', setting: 'ms', paper: 61, ours: null }], verdict: '', steps: [{ step: 'Clone', minutes: 2 }, { step: 'Index', minutes: '30', ok: false }] });
  assert.deepEqual(cmp.results.map((r: any) => [r.difference, r.close]), [[-0.4, true], [-0.018, false], [null, false]]);
  assert.equal(cmp.matched, false);
  assert.equal(cmp.summary, '1 of 3 numbers within reach of the paper’s.');
  assert.deepEqual(cmp.steps.map((s: any) => [s.n, s.minutes, s.ok]), [[1, 2, true], [2, 30, false]]);
});

test('reviewer simulator: the venue’s form and the reviewers seated; the reviews laid side by side with their scores; the weaknesses ranked by how likely each sinks it', async () => {
  const panel = await program('reviewer-simulator', 'panel', { venue: 'SIGIR', reviewers: '9', read: { title: 'P', parts: ['text'] } });
  assert.equal(panel.venue, 'SIGIR');
  assert.equal(panel.reviewers.length, 5, 'five at most');
  assert.match(panel.form, /overall \(Overall recommendation, -3 to 3\)/);
  assert.equal((await program('reviewer-simulator', 'panel', { venue: 'Somewhere', reviewers: '', read: { parts: ['x'] } })).venue, 'Other');
  await assert.rejects(() => program('reviewer-simulator', 'panel', { venue: 'SIGIR', reviewers: '3', read: { parts: [], notes: ['No open copy.'] } }), /could not be read: No open copy/);
  const b = await program('reviewer-simulator', 'bundle', {
    reviews: [{ summary: 'S1', scores: [{ id: 'overall', score: 2 }, { id: 'confidence', score: 4 }], weaknesses: [{ point: 'Weak baselines', severity: 'Major', kind: 'Baselines' }], fields: [{ id: 'summary', text: 'x' }] }, { summary: 'S2', scores: [{ id: 'overall', score: -9 }] }],
    reviewers: [{ n: 1, name: 'A' }, { n: 2, name: 'B' }],
    scales: [{ id: 'overall', label: 'Overall recommendation', min: -3, max: 3 }, { id: 'confidence', label: 'Confidence', min: 1, max: 5 }],
    overall: 'overall',
    venue: 'SIGIR',
  });
  assert.deepEqual(b.cards.map((c: any) => [c.overall, c.confidence]), [['2 / 3', '4 / 5'], ['-3 / 3', '']]);
  assert.equal(b.average, 0.42, 'scores kept within their scale, then averaged');
  assert.match(b.text, /W1\. Weak baselines \[Major, Baselines\]/);
  const f = await program('reviewer-simulator', 'final', { risks: [{ weakness: 'a', likelihood: 'Low' }, { weakness: 'b', likelihood: 'high' }, { weakness: 'c', likelihood: 'Medium' }], asks: [{ kind: 'Baseline', what: 'BM25' }], text: 'R', meta: 'M', verdict: 'V', venue: 'SIGIR' });
  assert.deepEqual(f.risks.map((r: any) => [r.n, r.weakness]), [[1, 'b'], [2, 'c'], [3, 'a']]);
  assert.match(f.reviews, /^# Reviews \(SIGIR, simulated\)/);
});

const REVIEWS = `Official Review of Submission123 by Reviewer xYz1
Summary: The paper proposes a reranker.
Weaknesses: The paper does not compare with ColBERTv2.

Reviewer 2:
The ablation of the distillation loss is missing.
Reviewers agree that the idea is interesting, but section 4.2 should say which split is used.

R3: Please add a significance test.

Meta-review
Borderline: the reviewers agree the comparison with ColBERTv2 is missing.`;

test('rebuttal: reviews split by who wrote them (OpenReview’s, “Reviewer 2”, “R3:”, the meta-review) and the limit read; lengths against it', async () => {
  const s = await program('rebuttal-workbench', 'split', { reviews: REVIEWS, limit: '2,500 characters per reviewer' });
  assert.deepEqual(s.reviewers.map((r: any) => r.name), ['xYz1', 'R2', 'R3', 'Meta']);
  assert.match(s.reviewers[1].text, /Reviewers agree that/, 'a line that starts with “Reviewers” is not a new review');
  assert.deepEqual([s.n, s.unit, s.per, s.limit], [2500, 'characters', 'reviewer', '2,500 characters per reviewer']);
  const all = await program('rebuttal-workbench', 'split', { reviews: 'One long review with no heading at all, but more than twenty characters.', limit: '1 page in all' });
  assert.deepEqual([all.reviewers.length, all.reviewers[0].name, all.n, all.per], [1, 'R1', 3500, 'all']);
  assert.deepEqual((await program('rebuttal-workbench', 'split', { reviews: REVIEWS, limit: '500 words per point' })).unit, 'words');
  const numbered = await program('rebuttal-workbench', 'numbered', { got: [{ points: [{ point: 'p1', quote: 'q1', kind: 'Misread' }] }, { points: [{ point: 'p2', quote: 'q2' }, { point: 'p3', quote: 'q3' }] }], reviewers: [{ name: 'xYz1' }, { name: 'R2' }] });
  assert.deepEqual(numbered.items.map((x: any) => x.id), ['xYz1.1', 'R2.1', 'R2.2']);
  const ctx = await program('rebuttal-workbench', 'context', { groups: [{ point: 'Both ask', kind: 'Needs words', ids: 'xYz1.1, R2.1', priority: 1 }], items: numbered.items, parts: ['[Page 4]\n4.2 Data\nWe use the dev split of MS MARCO for all our experiments here, as section 4.2 says in full.'], n: 2500, unit: 'characters', per: 'reviewer', reviewers: [] });
  assert.deepEqual(ctx.items.map((x: any) => [x.reviewers, x.ids]), [['xYz1, R2', 'xYz1.1, R2.1'], ['R2', 'R2.2']], 'a point no group took is a group of its own');
  assert.equal(ctx.items[0].budget, Math.floor((2500 * 0.92) / 2), 'R2 has two points to share its limit');
  const out = await program('rebuttal-workbench', 'assemble', {
    items: ctx.items,
    drafts: [{ reply: 'x'.repeat(400), kind: 'Needs words', experiment: 'None', change: 'Say the split' }, { reply: 'y'.repeat(3000), kind: 'Needs an experiment', experiment: 'Run BM25', change: '' }],
    reviewers: [{ name: 'xYz1' }, { name: 'R2' }, { name: 'Meta' }],
    n: 2500,
    unit: 'characters',
    per: 'reviewer',
    limit: '2,500 characters per reviewer',
  });
  assert.deepEqual(out.reviewers.map((r: any) => [r.reviewer, r.points, r.over]), [['xYz1', 1, false], ['R2', 2, true]]);
  assert.deepEqual(out.experiments.map((e: any) => e.what), ['Run BM25'], '“None” is no experiment');
  assert.deepEqual(out.changes.map((e: any) => e.what), ['Say the split']);
  assert.match(out.rebuttal, /^## Response to xYz1/);
  assert.equal(out.summary, '2 points from 2 reviewers: 1 need an experiment, 1 need words.');
});

test('paper to talk: its figures gathered; the slides timed to the talk’s length in half minutes; what was made listed', async () => {
  const c = await program('paper-to-talk', 'check', { read: { title: 'T', parts: ['x'], figures: [{ file: '/p/f.pdf', caption: 'C', label: 'fig:a' }], folder: '/p' } });
  assert.equal(c.figures, '- /p/f.pdf (fig:a): C');
  for (const [minutes, plan] of [
    [15, [3, 3, 3, 3, 3]],
    [10, [1, 9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    [7, [2, 2, 2]],
  ] as [number, number[]][]) {
    const t = await program('paper-to-talk', 'timing', { slides: plan.map((m, i) => ({ title: `S${i}`, minutes: m })), minutes });
    assert.equal(t.total, minutes, `${minutes} minutes in all`);
    assert.ok(t.slides.every((s: any) => s.minutes >= 0.5 && (s.minutes * 2) % 1 === 0), 'in half minutes, none under half a minute');
  }
  const made = await program('paper-to-talk', 'made', { slides: { page: 'http://x/pages/deck1', title: 'Deck' }, poster: {}, page: { page: 'pg2' }, title: 'ColBERT', total: 15, thread: ['a'] });
  assert.deepEqual(made.made.map((m: any) => [m.what, m.page]), [['Slides', 'deck1'], ['Project page', 'pg2']]);
  assert.equal(made.summary, 'For “ColBERT”: slides, project page and a thread, for a talk of 15 minutes.');
});

test('figure doctor: the width from the venue’s template (or inches given), the paper’s font, and one style file with vector PDFs and TrueType fonts', async () => {
  const acl = await program('figure-doctor', 'setup', { venue: 'ACL, EMNLP, NAACL', span: 'One column', inches: '', font: 'As the template' });
  assert.deepEqual([acl.width, acl.font, acl.size], [3.03, 'Times', 8]);
  assert.match(acl.style, /^figure\.figsize : 3\.03, 1\.88$/m);
  assert.match(acl.style, /^pdf\.fonttype : 42$/m);
  assert.match(acl.style, /^axes\.prop_cycle : cycler\('color', \['0072B2', 'E69F00'/m, 'colours without # (an .mplstyle reads # as a comment)');
  const acm = await program('figure-doctor', 'setup', { venue: 'ACM (SIGIR, KDD, CIKM, WSDM, TheWebConf)', span: 'Both columns', inches: '', font: 'As the template' });
  assert.deepEqual([acm.width, acm.font, acm.size], [7, 'Linux Libertine', 9]);
  const own = await program('figure-doctor', 'setup', { venue: 'Other (give the width)', span: 'One column', inches: '4.2', font: 'Computer Modern' });
  assert.deepEqual([own.width, own.font], [4.2, 'Computer Modern']);
  assert.match(own.style, /mathtext\.fontset : cm/);
});

// ---- the flows, end to end ------------------------------------------------------------------------------------------------

test('Reading list: a paper added by its arXiv id (looked up, kept with its BibTeX), then again (completed, yours kept); records reached as a ready-made app’s', async () => {
  const r = await run('reading-list', { paper: 'arXiv:1706.03762', project: 'Transformers', tags: 'architecture, to cite' });
  assert.equal(readCalls[readCalls.length - 1].text, false, 'its record only');
  assert.equal(r.result!.title, 'Attention Is All You Need');
  assert.equal(r.result!.added, true);
  assert.equal(r.result!.count, 1);
  assert.match(String(r.result!.bibtex), /@misc\{vaswani2017attention/);
  assert.deepEqual(r.result!.tags, ['architecture', 'to cite']);
  const again = await run('reading-list', { paper: '1706.03762', status: 'Read', tags: 'mine' });
  assert.equal(again.result!.added, false);
  assert.equal(again.result!.status, 'To read', 'its status stays as it was');
  assert.match(String(again.result!.note), /in your list already/);
  const rows = (await http.inject({ method: 'GET', url: '/api/apps/tpl:reading-list/data/papers' })).json();
  assert.equal(rows.count, 1);
  assert.deepEqual(rows.records[0].tags, ['architecture', 'to cite', 'mine']);
  assert.equal(rows.records[0].added, today);
  assert.ok(events.some((e: any) => e?.data?.data?.app === READING_LIST && e.data.data.collection === 'papers'), 'pages hear its records changed');
  // A title nothing finds is kept as given, with a BibTeX entry made from it.
  const t = await run('reading-list', { paper: 'My Unpublished Notes On Rankers' });
  assert.equal(t.result!.title, 'My Unpublished Notes On Rankers');
  assert.match(String(t.result!.note), /not found online/);
  // The records' routes: a ready-made app that keeps none has none; one that does takes changes.
  assert.equal((await http.inject({ method: 'GET', url: '/api/apps/tpl:trip-planner/data' })).statusCode, 404);
  const id = rows.records[0].id;
  const patched = await http.inject({ method: 'PATCH', url: `/api/apps/tpl:reading-list/data/papers/${id}`, payload: { set: { status: 'Read', read_on: today } } });
  assert.equal(patched.json().record.status, 'Read');
});

test('Reading list: a .bib imported (one completed, one added, one left out), exported as a file to download (all, or a tag’s)', async () => {
  const imp = await run('reading-list', { bibtex: BIB.replace('doi       = {10.1145/3397271.3401075},', 'eprint = {1706.03762}, archivePrefix = {arXiv},'), project: 'IR' }, 'import');
  assert.deepEqual([imp.result!.added, imp.result!.updated, imp.result!.count], [1, 1, 3]);
  assert.equal(imp.result!.summary, '1 added, 1 completed (1 without a title left out).');
  const all = await run('reading-list', {}, 'export');
  assert.equal(all.result!.count, 3);
  assert.match(String(all.result!.file), /^\/app-media\/[a-f0-9]{40}\/reading-list\.bib$/);
  const sha = /\/app-media\/([a-f0-9]{40})\//.exec(String(all.result!.file))![1];
  const bib = mediaBytes(db, sha)!.toString('utf8');
  assert.equal([...bib.matchAll(/^@/gm)].length, 3);
  const tag = await run('reading-list', { tag: 'architecture' }, 'export');
  assert.equal(tag.result!.count, 1);
  assert.equal(tag.result!.name, 'reading-list-architecture.bib');
});

test('Reading list: Sync with Zotero needs its key (asked for then, not before), then syncs and keeps the sync with the list', async () => {
  const refused = await http.inject({ method: 'POST', url: '/api/apps/tpl:reading-list/runs', payload: { inputs: {}, flow: 'zotero' } });
  assert.equal(refused.statusCode, 409);
  assert.deepEqual(refused.json().secrets.map((s: any) => [s.name, !!s.optional]), [['ZOTERO_API_KEY', false], ['ZOTERO_USER_ID', true]], 'the flow’s keys, asked for together');
  const t = tpl('reading-list');
  assert.doesNotThrow(() => needSecrets(db, t, 'run'), 'adding a paper needs no key');
  assert.ok(t.secrets!.every((s) => neededBy(s, 'zotero') && !neededBy(s, 'run')));
  saveSecret(db, { name: 'ZOTERO_API_KEY', value: 'k', domains: ['api.zotero.org'] });
  const { send } = fakeZotero();
  useZoteroForTests({ send, user: '' });
  const s = await run('reading-list', {}, 'zotero');
  assert.match(String(s.result!.summary), /new from Zotero/);
  const syncs = (await http.inject({ method: 'GET', url: '/api/apps/tpl:reading-list/data/syncs' })).json();
  assert.equal(syncs.count, 1);
  assert.equal(syncs.records[0].library, 'users/4242');
  assert.ok(syncs.records[0].version > 100);
  useZoteroForTests(null);
});

test('Literature matrix: papers given and from the reading list (by ids) read, each row filled, the unreadable one said plainly, kept as a spreadsheet', async () => {
  const listed = (await http.inject({ method: 'GET', url: '/api/apps/tpl:reading-list/data/papers?q=ColBERT' })).json().records;
  assert.equal(listed.length, 1);
  const m = await run('literature-matrix', { papers: `1706.03762\nNo Such Paper At All\nreading list: ${JSON.stringify({ [listed[0].id]: true })}`, columns: 'Task\nResults', project: 'Survey' });
  assert.equal(m.result!.papers.length, 3);
  assert.deepEqual(m.result!.papers.map((p: any) => p.read), [true, false, true]);
  assert.equal(m.result!.cells.length, 4, 'a cell for each column of each paper read');
  assert.deepEqual(m.result!.cells[0], { n: 1, column: 'Task', answer: 'Task of it', where: 'p. 1' });
  assert.match(m.result!.unread[0], /^No Such Paper At All: No paper/);
  assert.equal(m.result!.sheet, 'sheet42');
  assert.equal(sheetsSaved[0].project, 'Survey');
  assert.match(String(m.result!.synthesis), /agree/);
  assert.ok(readCalls.some((a) => a.paper === '10.1145/3397271.3401075' && a.pages === true), 'the list’s paper (from Zotero) by its DOI, a PDF first for its pages');
});

test('Rebuttal workbench: points pulled from each review, merged across reviewers, replies drafted within their share, experiments and changes listed', async () => {
  const r = await run('rebuttal-workbench', { reviews: 'Reviewer 1\nThe paper does not compare with ColBERTv2. Section 4.2 should say which split.\n\nReviewer 2\nI am not convinced without ColBERTv2.', limit: '1,000 characters per reviewer' });
  const points = r.result!.points as any[];
  assert.equal(points.length, 3, 'R1.1 and R2.1 merged');
  assert.equal(points[0].reviewers, 'R1, R2');
  assert.equal(points[0].kind, 'Needs an experiment');
  assert.ok(points.every((p) => p.length > 0 && p.budget > 0));
  assert.deepEqual((r.result!.experiments as any[]).map((e) => e.what), ['Run ColBERTv2 on MS MARCO dev']);
  assert.match(String(r.result!.rebuttal), /## Response to R1[\s\S]*## Response to R2/);
  assert.equal(r.result!.limit, '1,000 characters per reviewer');
});

test('Reviewer simulator: two reviewers on the venue’s form, a meta-review, the risks ranked; the reviews as text for the rebuttal', async () => {
  const r = await run('reviewer-simulator', { paper: '2004.12832', venue: 'ACL Rolling Review', reviewers: '2' });
  assert.equal((r.result!.reviews as any[]).length, 2);
  assert.equal((r.result!.scores as any[]).find((s) => s.n === 1 && s.label === 'Soundness')?.score, 5, 'a score kept within its scale');
  assert.equal((r.result!.risks as any[])[0].weakness, 'Baselines', 'the most likely to sink it first');
  assert.match(String(r.result!.reviews_text), /## Reviewer 1 \(The method’s expert\)/);
  assert.equal(r.result!.venue, 'ACL Rolling Review');
});

test('Paper to talk: only a thread asked for: the talk planned and timed, the posts written, nothing made in the Library', async () => {
  const r = await run('paper-to-talk', { paper: '2004.12832', minutes: '12', slides: 'No', poster: 'No', thread: 'Yes', page: 'No' });
  assert.equal((r.result!.talk as any[]).reduce((a, s) => a + s.minutes, 0), 12);
  assert.deepEqual(r.result!.x, ['Post one', 'Post two']);
  assert.deepEqual(r.result!.made, []);
  assert.equal(r.result!.summary, 'For “ColBERT: Efficient and Effective Passage Search”: a thread, for a talk of 12 minutes.');
});

// ---- the Library's saves as steps, and the form from the address -----------------------------------------------------------

test('save_sheet as a step: kept in the project the step names (by its name), with no session', async () => {
  const space = createSpace(db, { name: 'Dense retrieval survey', folder: tmp });
  const tool = pages.tools!({} as RunCtx).find((t) => t.name === 'save_sheet')!;
  const ctx = { runId: 'flow-r1', key: 'acp:flow-r1', agent: 'acp', cwd: tmp, deps, step: true } as RunCtx;
  const out = String(await tool.run({ title: 'Matrix', project: 'dense retrieval SURVEY', sheets: [{ name: 'Matrix', rows: [['Paper', 'Task'], ['ColBERT', 'Ranking']] }] }, ctx));
  const id = /\(page ([\w-]+), version/.exec(out)![1];
  const p = pageInfo(db, id)!;
  assert.equal(p.space, space.id);
  assert.equal(p.sessionKey, undefined, 'no session made it');
  assert.match(pageSource(db, id)!.text, /ColBERT/);
  const none = String(await tool.run({ title: 'Loose', project: 'No such project', sheets: [{ name: 'A', rows: [['x']] }] }, ctx));
  assert.equal(pageInfo(db, /\(page ([\w-]+), version/.exec(none)![1])!.space ?? null, null, 'a project that is not there: in none');
});

test('a form filled in from its address: ?in.<question>=… for its own questions (a choice as it writes it), never a file', () => {
  const f = tpl('reviewer-simulator').fields;
  assert.deepEqual(prefillOf(f, '?in.paper=%2Fhome%2Fme%2Fdraft.pdf&in.venue=sigir&in.upload=x.pdf&in.nope=1&tab=runs'), { paper: '/home/me/draft.pdf', venue: 'SIGIR' });
  assert.deepEqual(prefillOf(f, new URLSearchParams({ 'in.focus': 'line one\r\nline two' })), { focus: 'line one\nline two' });
  assert.deepEqual(prefillOf(f, ''), {});
});

// ---- real look-ups (arXiv, Crossref, OpenAlex) -------------------------------------------------------------------------------

const online = process.env.ONLINE !== '0';
async function onWeb(fn: () => Promise<void>) {
  if (!online) {
    skipped++;
    return;
  }
  try {
    await fn();
  } catch (e) {
    // A service that does not answer from here (a network hiccup, a limit) is not a failure of the code: said, and passed over.
    if (/fetch failed|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|TimeoutError|aborted|answered 429|answered 5\d\d/i.test(String((e as Error).message ?? e))) {
      skipped++;
      console.log(`     (the web did not answer: ${(e as Error).message})`);
      return;
    }
    throw e;
  }
}

test('on the web: an arXiv id’s record and BibTeX (its record only, quickly)', () =>
  onWeb(async () => {
    const r = await readPaper({ paper: '1706.03762' }, { text: false });
    assert.equal(r.found, true);
    assert.match(r.title, /Attention Is All You Need/);
    assert.ok(r.authors.includes('Ashish Vaswani'));
    assert.match(r.bibtex, /^@\w+\{vaswani2017/);
  }));

test('on the web: a DOI’s record from Crossref, with doi.org’s BibTeX', () =>
  onWeb(async () => {
    const r = await readPaper({ paper: '10.1145/3397271.3401075' }, { text: false });
    assert.equal(r.found, true);
    assert.match(r.title, /ColBERT/);
    assert.equal(r.year, '2020');
    assert.match(r.bibtex, /3397271\.3401075/);
  }));

test('on the web: a title found in Crossref or arXiv', () =>
  onWeb(async () => {
    const r = await readPaper({ paper: 'Dense Passage Retrieval for Open-Domain Question Answering' }, { text: false });
    assert.equal(r.found, true);
    assert.ok(r.arxiv === '2004.04906' || /emnlp/i.test(r.doi), `found ${r.arxiv || r.doi}`);
  }));

test('on the web: an arXiv paper’s text from its PDF, its pages marked', () =>
  onWeb(async () => {
    const r = await readPaper({ paper: '2004.12832' }, { pages: true, maxChars: 30_000 });
    assert.equal(r.found, true);
    assert.equal(r.source, 'arXiv’s PDF');
    assert.match(r.parts[0], /^\[Page 1\]/);
    assert.ok(r.pages > 5);
  }));

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${tests.length} passed${skipped ? ` (${skipped} look-ups on the web passed over)` : ''}`);
srv.close();
process.exit(process.exitCode ?? 0);
