// Script tests for the guide and what agents do with it: reading docs/guide into topics and sections (ids as the
// page makes them), finding sections by words, the guide itself (every link lands, every Settings section and
// every API route the app has is in it, so it keeps up with the app), app_api's rules and cards (what is free,
// what asks, what is refused, Plan and full access, a form on the card, settings on a device), ask_form, and Agent
// Guidelines (the levels, most general first; changed ones start an idle agent afresh; the old tone moves in).
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/guide/guide-test.ts
//   DATA_DIR=/tmp/hydor-test-guide node dist/dev/guide-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { OPTIONS, SECTIONS } from '../../shared/find-catalog.ts';
import { headingId, parseTopic, topicId, translatedTopic } from '../../shared/guide.ts';
import { TIP_GUIDE } from '../../shared/tips.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import type { ApprovalAnswer } from '../agents/live.ts';
import { setSettings, toneOf } from '../assistants/store.ts';
import { APP_ROOT } from '../config.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { globalGuidelines, guidelines, guidelinesBlock, guidelinesView, putGuidelines } from '../guidelines/index.ts';
import { internalHeaders, isInternal } from '../internal.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import { createSpace } from '../spaces/index.ts';
import { appApi, forgetAllowed, ruleFor } from './api.ts';
import { findByWords, guideTopics } from './content.ts';
import { askForm } from './form.ts';
import { answersText, keepForm, standAll, standingForm, standingForms } from '../openForms.ts';
import { guide, GUIDE_INSTRUCTIONS, helpInstructions } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-guide-test-'));
const db = openDb(path.join(tmp, 'test.db'));
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- reading the guide ---------------------------------------------------------------------------------

test('a topic: its title, the paragraph under it, its sections with the ids the page gives their headings', () => {
  const t = parseTopic(
    '04-projects.md',
    [
      '# Projects and knowledge',
      '',
      'A project keeps a piece of work together.',
      'Its second line.',
      '',
      'More intro.',
      '',
      '## Make a project',
      'Steps.',
      '### Pick a **folder**',
      'Where.',
      '## What’s in a project?',
      '```md',
      '## not a heading',
      '```',
      '## Make a project',
      'Again.',
    ].join('\n'),
  );
  assert.equal(t.id, 'projects');
  assert.equal(t.title, 'Projects and knowledge');
  assert.equal(t.summary, 'A project keeps a piece of work together. Its second line.');
  assert.deepEqual(
    t.sections.map((s) => s.id),
    ['make-a-project', 'whats-in-a-project', 'make-a-project-1'],
  );
  assert.match(t.sections[0].text, /### Pick a \*\*folder\*\*\nWhere\./);
  assert.match(t.sections[1].text, /## not a heading/);
  assert.equal(headingId('Pick a **folder**'), 'pick-a-folder');
  assert.equal(headingId('Use Ctrl+K (⌘K)'), 'use-ctrlk-k');
});

const topics = guideTopics();
const byId = new Map(topics.map((t) => [t.id, t]));

test('the guide: every topic has its title, a summary and sections; the API topic is among them', () => {
  assert.ok(topics.length >= 15, `only ${topics.length} topics in docs/guide`);
  for (const t of topics) {
    assert.ok(t.title && t.title !== t.id, `${t.id}: a "# Title" first`);
    assert.ok(t.summary.length > 40 && t.summary.length < 700, `${t.id}: a paragraph under the title sums it up (${t.summary.length} characters)`);
    assert.ok(t.sections.length >= 2, `${t.id}: sections`);
    const ids = t.sections.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${t.id}: section ids repeat`);
  }
  for (const id of ['start', 'sessions', 'guidelines', 'projects', 'ask-agents', 'settings', 'api']) assert.ok(byId.has(id), `a topic "${id}"`);
});

test('the guide’s index (docs/guide/README.md) lists every topic once and links to files that exist', () => {
  const dir = path.join(APP_ROOT, 'docs', 'guide');
  const index = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  const files = fs.readdirSync(dir).filter((f) => /^\d+-[a-z0-9-]+\.md$/.test(f));
  const linked = [...index.matchAll(/^- \[[^\]]+\]\((\d+-[a-z0-9-]+\.md)\)/gm)].map((m) => m[1]);
  for (const f of linked) assert.ok(files.includes(f), `docs/guide/README.md links to ${f}, which is not in docs/guide`);
  for (const f of files) assert.ok(linked.includes(f), `docs/guide/README.md does not list ${f}`);
  assert.equal(new Set(linked).size, linked.length, 'docs/guide/README.md lists a topic twice');
  for (const f of linked) {
    const title = /^# (.+)$/m.exec(fs.readFileSync(path.join(dir, f), 'utf8'))?.[1];
    assert.ok(index.includes(`[${title}](${f})`), `docs/guide/README.md names ${f} other than by its title, "${title}"`);
  }
});

test('the guide’s links land: other topics and their sections, Settings sections, the app’s pages', () => {
  const sections = new Set(SECTIONS.map(([id]) => id));
  const pages = /^\/(?:$|\?|s\/|guide|settings|projects|knowledge|apps|agents|answers|pages|library|media|inbox|usage|stats|arena|system|files|search|git|terminal|preview|review\/)/;
  const bad: string[] = [];
  for (const t of topics)
    for (const m of t.body.matchAll(/\]\((\/[^)\s]*)\)/g)) {
      const href = m[1];
      const g = /^\/guide\/([a-z0-9-]+)(?:#([^)]+))?$/.exec(href);
      if (g) {
        const to = byId.get(g[1]);
        if (!to) bad.push(`${t.id}: ${href} (no such topic)`);
        else if (g[2] && !headingIds(to.body).has(decodeURIComponent(g[2]))) bad.push(`${t.id}: ${href} (no such section)`);
        continue;
      }
      const s = /^\/settings\?s=([a-z-]+)(?:&find=([^)&]+))?/.exec(href);
      if (s) {
        if (!sections.has(s[1])) bad.push(`${t.id}: ${href} (no such Settings section)`);
        else if (s[2] && !OPTIONS.some(([sid, find]) => sid === s[1] && find === decodeURIComponent(s[2]))) bad.push(`${t.id}: ${href} (no such option in shared/find-catalog.ts)`);
        continue;
      }
      if (!pages.test(href)) bad.push(`${t.id}: ${href} (not one of the app’s pages)`);
    }
  assert.deepEqual(bad, []);
});

test('the tips’ Learn more links land in the guide: each tip’s topic and section', () => {
  const bad: string[] = [];
  for (const [tip, href] of Object.entries(TIP_GUIDE)) {
    const g = /^\/guide\/([a-z0-9-]+)#([^)]+)$/.exec(href);
    const to = g && byId.get(g[1]);
    if (!g || !to || !headingIds(to.body).has(g[2])) bad.push(`${tip}: ${href}`);
  }
  assert.deepEqual(bad, [], 'shared/tips.ts TIP_GUIDE: a link to a topic or section that is not there');
});

/** Every heading's id in a topic, `### ` ones too, counted as the page counts them. */
function headingIds(body: string): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  let fence = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = fence ? null : /^#{2,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!h) continue;
    const base = headingId(h[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

test('the guide covers the app: every Settings section by its name', () => {
  const all = topics.map((t) => t.body).join('\n');
  const missing = SECTIONS.filter(([, label]) => !all.includes(label)).map(([id, label]) => `${label} (${id})`);
  assert.deepEqual(missing, [], 'Settings sections the guide never names: describe them (CLAUDE.md, "Docs")');
});

/** Routes agents are never to use, which the API topic leaves out (app_api refuses them too). */
const UNDOCUMENTED =
  /^\/api\/(fs|terminals|terminal-history|kernels|git|uploads|auth)\/|^\/api\/(fs|terminals|terminal-history|kernels|git|uploads)$|^\/api\/(browser|computer)\/sessions\/|^\/api\/(push\/(subscribe|unsubscribe)|me\/timezone|find\/usage|tour|health)$|^\/api\/voice\/(transcribe|command|cancel)$|^\/api\/(images\/(make|edit|svg|cutout|erase)|plots\/make|videos\/make(\/:job)?)$|^\/api\/mediaedit\/|^\/api\/photos\/|^\/api\/slides\/(sounds|narration|shows)(\/|$)/;

test('the guide covers the app: every API route is in the API topic, or one agents never use', () => {
  const api = byId.get('api')!.body;
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.ts$/.test(e.name) && !/-test\.ts$/.test(e.name) ? [path.join(dir, e.name)] : []));
  const routes = new Set<string>();
  for (const f of files(path.join(APP_ROOT, 'server')))
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/app\.(get|post|put|patch|delete)\(\s*['"`](\/api\/[^'"`]+)['"`]/g)) routes.add(`${m[1].toUpperCase()} ${m[2]}`);
  assert.ok(routes.size > 200, `found ${routes.size} routes`);
  // The API topic writes a route as `METHOD /api/path` (params as :name).
  const missing = [...routes].filter((r) => !UNDOCUMENTED.test(r.split(' ')[1]) && !api.includes(r));
  assert.deepEqual(missing, [], 'routes the guide’s API topic (docs/guide/90-api.md) does not list');
});

test('a translation takes the English headings’ ids by their place; one out of step shows in English', () => {
  const en = parseTopic('04-projects.md', '# Projects\n\nAbout projects.\n\n## Make a project\nSteps.\n### Pick a folder\nWhere.\n## Delete a project\nGone.');
  const zh = translatedTopic(en, '04-projects.md', '# 项目\n\n关于项目。\n\n## 创建项目\n步骤。\n### 选择文件夹\n位置。\n## 删除项目\n没了。')!;
  assert.equal(zh.title, '项目');
  assert.equal(zh.summary, '关于项目。');
  assert.deepEqual(
    zh.sections.map((x) => [x.id, x.title]),
    [
      ['make-a-project', '创建项目'],
      ['delete-a-project', '删除项目'],
    ],
  );
  assert.deepEqual(zh.anchors, ['make-a-project', 'pick-a-folder', 'delete-a-project']);
  assert.equal(translatedTopic(en, '04-projects.md', '# 项目\n\n关于。\n\n## 创建项目\n## 删除项目\n'), null, 'a heading missing');
  assert.equal(translatedTopic(en, '04-projects.md', '# 项目\n\n关于。\n\n## 创建项目\n## 选择文件夹\n## 删除项目\n'), null, 'a level changed');
});

/** A file's link addresses, in order. */
const linksOf = (md: string) => [...md.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);

test('the translations: every topic but the API one, each with the English headings in their places and the same links', () => {
  for (const lang of ['zh', 'el'] as const) {
    const dir = path.join(APP_ROOT, 'docs', 'guide', lang);
    const files = fs.readdirSync(dir).filter((f) => /^\d+-[a-z0-9-]+\.md$/.test(f));
    const problems: string[] = [];
    for (const f of files) {
      const enFile = path.join(APP_ROOT, 'docs', 'guide', f);
      if (!fs.existsSync(enFile)) {
        problems.push(`${lang}/${f}: no English topic of that name`);
        continue;
      }
      const enText = fs.readFileSync(enFile, 'utf8');
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const t = translatedTopic(parseTopic(f, enText), f, text);
      if (!t) problems.push(`${lang}/${f}: its headings are not the English one's (a heading or a level more or less)`);
      else if (!t.summary || t.title === t.id) problems.push(`${lang}/${f}: a "# Title" and a paragraph under it`);
      if (JSON.stringify(linksOf(text)) !== JSON.stringify(linksOf(enText))) problems.push(`${lang}/${f}: its links are not the English one's, in the same order`);
    }
    const missing = topics.filter((t) => t.id !== 'api' && !files.some((f) => topicId(f) === t.id)).map((t) => t.id);
    if (missing.length) problems.push(`${lang}: no translation of ${missing.join(', ')}`);
    assert.deepEqual(problems, [], 'translations out of step with the English: translate the change (CLAUDE.md, "Docs")');
    const shown = guideTopics(lang);
    assert.deepEqual(
      shown.map((t) => t.id),
      topics.map((t) => t.id),
    );
    assert.notEqual(shown.find((t) => t.id === 'projects')!.title, byId.get('projects')!.title, `${lang}: the translated title shows`);
  }
});

test('finding sections by words: the one about it first', () => {
  const hits = findByWords('make a new project for my work', 5);
  assert.ok(hits.length, 'something found');
  assert.equal(hits[0].topic.id, 'projects');
  assert.equal(findByWords('the and of', 5).length, 0);
});

// ---- app_api ------------------------------------------------------------------------------------------

test('rules: reading is free; changes ask; risky ones every time; some are never an agent’s', () => {
  const lv = (m: string, p: string) => ruleFor(m, p).level;
  assert.equal(lv('GET', '/api/projects'), 'free');
  assert.equal(lv('PUT', '/api/search/settings'), 'confirm');
  assert.equal(lv('POST', '/api/projects'), 'confirm');
  assert.equal(lv('DELETE', '/api/projects/sp1'), 'always');
  assert.equal(lv('POST', '/api/skillpack/skills/x/remove'), 'always');
  assert.equal(lv('POST', '/api/setup/mcp'), 'always');
  assert.equal(lv('PUT', '/api/browser/settings'), 'always');
  assert.equal(lv('POST', '/api/sessions'), 'always');
  assert.equal(lv('POST', '/api/tasks'), 'always');
  assert.equal(lv('POST', '/api/search/test'), 'free');
  for (const [m, p] of [
    ['POST', '/api/auth/password'],
    ['GET', '/api/fs/read'],
    ['POST', '/api/terminals'],
    ['POST', '/api/git/push'],
    ['POST', '/api/sessions/claude:x/approvals/a1'],
    ['POST', '/api/skillpack/proposals/p1/approve'],
    ['POST', '/api/mcp/tokens'],
    ['POST', '/api/access-tokens'],
    ['POST', '/api/connections/secrets'],
    ['PUT', '/api/budget/claude:x'],
    ['POST', '/api/accounts/claude/login'],
    ['POST', '/api/sites'],
    // The editors' AI tools: agents have their own.
    ['POST', '/api/images/make'],
    ['POST', '/api/images/cutout'],
    ['POST', '/api/plots/make'],
    ['GET', '/api/videos/make/j1'],
    ['POST', '/api/mediaedit/video'],
    ['POST', '/api/mediaedit/image'],
    ['POST', '/api/slides/narration'],
    ['POST', '/api/slides/shows/s1/do'],
  ])
    assert.equal(lv(m, p), 'refuse', `${m} ${p}`);
  assert.equal(lv('GET', '/api/images/tiers'), 'free');
  assert.equal(lv('POST', '/api/write/rewrite'), 'free');
  assert.equal(lv('POST', '/api/images/local/setup'), 'always');
  assert.equal(lv('DELETE', '/api/images/local'), 'always');
  // Listing and revoking tokens is fine; deleting a key in the vault asks.
  assert.equal(lv('GET', '/api/mcp/tokens'), 'free');
  assert.equal(lv('DELETE', '/api/connections/secrets/BRAVE'), 'always');
});

interface Card {
  card: ApprovalRequest;
}
/** A session's agent as app_api sees it: its mode, and the cards it shows, answered as the test says. */
function session(mode: string | undefined, answer: (c: ApprovalRequest) => ApprovalAnswer | null) {
  const cards: Card[] = [];
  const sent: unknown[] = [];
  const adapter = {
    state: { mode, status: 'idle' as const },
    ask: async (card: ApprovalRequest, o: { check?: (a: ApprovalAnswer) => string | null } = {}) => {
      cards.push({ card });
      const a = answer(card);
      if (a && o.check) {
        const wrong = o.check(a);
        if (wrong) throw new Error(wrong);
      }
      return a;
    },
  };
  return { adapter, cards, sent };
}

async function testApp() {
  const app = Fastify();
  // Like the server's own: only the app's in-process calls get in.
  app.addHook('onRequest', async (req, reply) => {
    if (!isInternal(req)) return reply.code(401).send({ error: 'Sign in required' });
  });
  let settings = { results: 10, meaning: false, name: 'x' };
  app.get('/api/search/settings', async () => settings);
  app.put('/api/search/settings', async (req) => (settings = { ...settings, ...(req.body as object) }));
  app.post('/api/projects', async (req) => ({ id: 'sp1', ...(req.body as object) }));
  app.delete('/api/projects/:id', async () => ({ ok: true }));
  await app.ready();
  return app;
}

function ctxOf(app: Awaited<ReturnType<typeof testApp>>, s: ReturnType<typeof session>, agent: RunCtx['agent'] = 'claude', acpAgent?: string): RunCtx {
  const deps = {
    app,
    db,
    sessions: { adapterByRun: () => s.adapter, summary: (k: string) => ({ key: k, title: 'Other work' }), formsChanged: (k: string) => s.sent.push({ formsChanged: k }) },
    toSubscribers: (key: string, e: unknown) => s.sent.push({ key, e }),
    publicBase: () => 'https://agent.example',
  } as unknown as Deps;
  return { runId: 'r1', key: 'claude:own', agent, acpAgent, cwd: tmp, deps };
}

test('the app’s own calls carry what lets them in; nothing else does', async () => {
  const app = await testApp();
  assert.equal((await app.inject({ method: 'GET', url: '/api/search/settings' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/api/search/settings', headers: { 'x-naget-internal': 'guess' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/api/search/settings', headers: internalHeaders() })).statusCode, 200);
  await app.close();
});

test('app_api: reading runs at once; a change shows a card with before → after, and goes once allowed', async () => {
  forgetAllowed();
  const app = await testApp();
  const s = session('default', () => ({ decision: 'accept' }));
  const ctx = ctxOf(app, s);
  const read = await appApi({ method: 'GET', path: '/api/search/settings' }, ctx);
  assert.match(read.text, /^200 OK\n/);
  assert.match(read.text, /"results": 10/);
  assert.equal(s.cards.length, 0);
  const r = await appApi({ method: 'PUT', path: '/api/search/settings', body: { results: 20 }, summary: 'Twenty results a search' }, ctx);
  assert.equal(r.isError, undefined, r.text);
  assert.match(r.text, /"results": 20/);
  const card = s.cards[0].card;
  assert.equal(card.title, 'Twenty results a search');
  assert.ok(card.prose);
  assert.match(card.detail!, /\*\*Results\*\*: 10 → 20/);
  assert.match(card.detail!, /`PUT \/api\/search\/settings`/);
  assert.deepEqual(
    card.options.map((o) => o.id),
    ['accept', 'always', 'deny'],
  );
  await app.close();
});

test('app_api: “Allow for this session” lets later changes go without a card, but not the ones that ask every time', async () => {
  forgetAllowed();
  const app = await testApp();
  const s = session('default', () => ({ decision: 'always' }));
  const ctx = ctxOf(app, s);
  await appApi({ method: 'PUT', path: '/api/search/settings', body: { results: 5 } }, ctx);
  assert.equal(s.cards.length, 1);
  await appApi({ method: 'PUT', path: '/api/search/settings', body: { results: 6 } }, ctx);
  assert.equal(s.cards.length, 1, 'no second card');
  const del = await appApi({ method: 'DELETE', path: '/api/projects/sp1', summary: 'Delete the project “Old”' }, ctx);
  assert.equal(s.cards.length, 2, 'deleting asks again');
  assert.equal(s.cards[1].card.options[0].label, 'Delete');
  assert.ok(!s.cards[1].card.options.some((o) => o.id === 'always'));
  assert.match(del.text, /^200 OK/);
  await app.close();
});

test('app_api: no from the user changes nothing, and says what they said', async () => {
  forgetAllowed();
  const app = await testApp();
  const s = session('default', () => ({ decision: 'deny', message: 'Keep 10' }));
  const r = await appApi({ method: 'PUT', path: '/api/search/settings', body: { results: 50 } }, ctxOf(app, s));
  assert.equal(r.isError, true);
  assert.match(r.text, /said no: “Keep 10”/);
  assert.match((await appApi({ method: 'GET', path: '/api/search/settings' }, ctxOf(app, s))).text, /"results": 10/);
  await app.close();
});

test('app_api: Plan mode only reads; full access asks nothing, including Custom', async () => {
  forgetAllowed();
  const app = await testApp();
  const plan = session('plan', () => ({ decision: 'accept' }));
  const r = await appApi({ method: 'PUT', path: '/api/search/settings', body: { results: 3 } }, ctxOf(app, plan));
  assert.equal(r.isError, true);
  assert.match(r.text, /only reads/);
  assert.equal(plan.cards.length, 0);
  const full = session('bypassPermissions', () => null);
  assert.match((await appApi({ method: 'DELETE', path: '/api/projects/sp1' }, ctxOf(app, full))).text, /^200 OK/);
  assert.equal(full.cards.length, 0);
  const codexFull = session('full', () => null);
  assert.match((await appApi({ method: 'PUT', path: '/api/search/settings', body: { results: 4 } }, ctxOf(app, codexFull, 'codex'))).text, /^200 OK/);
  const custom = session('full', () => ({ decision: 'accept' }));
  await appApi({ method: 'PUT', path: '/api/search/settings', body: { results: 7 } }, ctxOf(app, custom, 'acp', 'console'));
  assert.equal(custom.cards.length, 0);
  await appApi({ method: 'DELETE', path: '/api/projects/sp1' }, ctxOf(app, custom, 'acp', 'console'));
  assert.equal(custom.cards.length, 0);
  await app.close();
});

test('app_api: a form on the card, filled in from the body; the user’s answers go in', async () => {
  forgetAllowed();
  const app = await testApp();
  const s = session('default', (c) => ({ decision: 'accept', form: { name: 'Thesis 2', color: c.form!.fields[1].options![1] } }));
  const r = await appApi(
    {
      method: 'POST',
      path: '/api/projects',
      body: { name: 'Thesis', color: 'blue', instructions: 'Cite in APA style.' },
      summary: 'Make the space “Thesis”',
      form: { fields: { name: { type: 'string', title: 'Name' }, color: { type: 'string', enum: ['blue', 'green'] } }, required: ['name'], message: 'Check the name.' },
    },
    ctxOf(app, s),
  );
  const card = s.cards[0].card;
  assert.deepEqual(
    card.form!.fields.map((f) => [f.id, f.default]),
    [
      ['name', 'Thesis'],
      ['color', 'blue'],
    ],
  );
  assert.match(card.detail!, /^Check the name\./);
  assert.match(card.detail!, /\*\*Instructions\*\*: “Cite in APA style\.”/);
  assert.doesNotMatch(card.detail!, /\*\*Name\*\*/, 'what the form asks is not listed twice');
  assert.equal(card.options[0].label, 'Save');
  assert.match(r.text, /"name": "Thesis 2"/);
  assert.match(r.text, /"color": "green"/);
  assert.match(r.text, /"instructions": "Cite in APA style\."/);
  await app.close();
});

test('app_api: never the user’s own things, nor raising a cap, nor changing permissions', async () => {
  const app = await testApp();
  const s = session('bypassPermissions', () => ({ decision: 'accept' }));
  const ctx = ctxOf(app, s);
  for (const [method, p, body, why] of [
    ['POST', '/api/auth/password', {}, /Password/],
    ['GET', '/api/fs/read?path=/etc/passwd', {}, /your own tools/],
    ['POST', '/api/sessions/claude:own/approvals/a1', { decision: 'allow' }, /Only the user answers/],
    ['POST', '/api/sessions/claude:own/config', { mode: 'bypassPermissions' }, /permissions are the user’s/],
    ['PATCH', '/api/sessions/claude:other/extra', { capUsd: 500 }, /Spending caps/],
    ['POST', '/api/sessions/claude:own/message', { text: 'hi' }, /That is this session/],
    ['PUT', '/api/models', { openrouterKey: 'sk-or-v1-x' }, /never passes through an agent/],
    ['POST', '/api/images/make', { prompt: 'a cat' }, /generate_image/],
    ['GET', 'https://evil.example/m/x/api/projects', {}, /path:/],
  ] as const) {
    const r = await appApi({ method, path: p, body }, ctx);
    assert.equal(r.isError, true, `${method} ${p}`);
    assert.match(r.text, why, `${method} ${p}: ${r.text}`);
  }
  await app.close();
});

test('app_api: a device’s own settings go to the pages showing the session', async () => {
  const app = await testApp();
  const s = session('default', () => null);
  const ctx = ctxOf(app, s);
  const r = await appApi({ method: 'PUT', path: '/device', body: { theme: 'dark', sound: true } }, ctx);
  assert.equal(r.isError, undefined, r.text);
  assert.deepEqual(s.sent, [{ key: 'claude:own', e: { t: 'feature', id: 'guide', key: 'claude:own', data: { device: { theme: 'dark', sound: true } } } }]);
  assert.equal((await appApi({ method: 'PUT', path: '/device', body: { theme: 'purple' } }, ctx)).isError, true);
  assert.equal(s.cards.length, 0, 'no card for a device’s look');
  await app.close();
});

test('ask_form: the fields as a card; the answers come back in their types; closing it says so', async () => {
  const app = await testApp();
  const s = session('default', () => ({ decision: 'accept', form: { from: '2027-03-26', nights: '4', kind: 'City', pets: 'Yes' } }));
  const r = await askForm(
    {
      title: 'Your trip',
      message: 'So I can look for places.',
      fields: { from: { type: 'string', format: 'date', title: 'From' }, nights: { type: 'integer', minimum: 1 }, kind: { type: 'string', enum: ['City', 'Beach'] }, pets: { type: 'boolean', title: 'Pets' } },
      required: ['from'],
      submit: 'Plan it',
    },
    ctxOf(app, s),
  );
  assert.equal(s.cards[0].card.title, 'Your trip');
  assert.equal(s.cards[0].card.options[0].label, 'Plan it');
  assert.deepEqual(JSON.parse(r.text.slice(r.text.indexOf('{'))), { from: '2027-03-26', nights: 4, kind: 'City', pets: true });
  const no = session('default', () => ({ decision: 'decline' }));
  assert.match((await askForm({ title: 'X', fields: { a: { type: 'string' } } }, ctxOf(app, no))).text, /closed the form/);
  assert.equal((await askForm({ title: 'X', fields: {} }, ctxOf(app, no))).isError, true);
  await app.close();
});

test('ask_form never expires: a form not answered by the end of its step stays, and its answers come as a message', async () => {
  const app = await testApp();
  assert.deepEqual(standingForms(db, 'claude:own'), [], 'answered and closed forms leave nothing open');
  // Its step is over without an answer (its time is up, the turn ended): it stays, and the agent is told to end its turn.
  const s = session('default', () => null);
  const r = await askForm({ title: 'Your trip', fields: { from: { type: 'string', format: 'date', title: 'From' }, nights: { type: 'integer', title: 'Nights' }, pets: { type: 'boolean', title: 'Pets' } } }, ctxOf(app, s));
  assert.equal(r.isError, undefined, r.text);
  assert.match(r.text, /stays open in the conversation[\s\S]*next message: end your turn now/);
  const [card] = standingForms(db, 'claude:own');
  assert.equal(card?.title, 'Your trip');
  assert.deepEqual(s.sent, [{ formsChanged: 'claude:own' }], 'the pages hear of it');
  assert.equal(standingForm(db, 'claude:other', card.id), undefined, 'only in its own session');
  // Its answers, as the user's message.
  assert.equal(answersText(standingForm(db, 'claude:own', card.id)!, { from: '2027-03-26', nights: 4, pets: true }), 'My answers to “Your trip”:\n- From: 2027-03-26\n- Nights: 4\n- Pets: yes');
  // One still answered through its step when the app stopped stands after the next start.
  keepForm(db, { key: 'claude:own', card: { ...card, id: 'form-live1' }, schema: { type: 'object', properties: {}, required: [] }, live: true });
  assert.equal(standingForms(db, 'claude:own').length, 1, 'answered through its step meanwhile, not shown twice');
  assert.deepEqual(standAll(db), ['claude:own']);
  assert.equal(standingForms(db, 'claude:own').length, 2);
  await app.close();
});

test('every agent hears of the tools, by name', async () => {
  const add = await guide.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: {} }, {} as Deps);
  assert.deepEqual(add?.instructions, [GUIDE_INSTRUCTIONS]);
  for (const name of ['app_guide', 'app_api', 'ask_form']) assert.ok(GUIDE_INSTRUCTIONS.includes(name));
  assert.deepEqual(
    guide.tools!({} as RunCtx).map((t) => t.name),
    ['app_guide', 'app_api', 'ask_form'],
  );
});

test('a question asked on Help: its agent answers it from the guide, knowing the topic being read', async () => {
  const add = await guide.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: { help: 'projects' } }, {} as Deps);
  assert.equal(add?.instructions?.length, 2);
  assert.equal(add!.instructions![0], GUIDE_INSTRUCTIONS);
  assert.match(add!.instructions![1], /Help page, while reading the guide's topic "Projects and knowledge"/);
  assert.match(helpInstructions(true)!, /from the guide \(app_guide\)/);
  assert.doesNotMatch(helpInstructions('no-such-topic')!, /while reading/);
  assert.equal(helpInstructions(undefined), null);
});

test('the guide’s pictures: every one it shows is there; the light one when asked for, else the one there is', async () => {
  const dir = path.join(APP_ROOT, 'docs', 'guide', 'images');
  const missing: string[] = [];
  for (const lang of ['en', 'zh', 'el'] as const)
    for (const t of guideTopics(lang))
      for (const m of t.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const name = /^images\/([a-z0-9-]+\.(?:webp|png|jpg))$/.exec(m[1])?.[1];
        if (!name || !fs.existsSync(path.join(dir, name))) missing.push(`${lang}/${t.id}: ${m[1]}`);
      }
  assert.deepEqual(missing, [], 'pictures the guide shows that are not in docs/guide/images');
  const app = Fastify();
  guide.routes!({ app } as unknown as Deps);
  await app.ready();
  for (const bad of ['..%2Fsecret.webp', 'Projects.webp', 'projects.gif', 'no-such-picture.webp'])
    assert.equal((await app.inject({ method: 'GET', url: `/api/guide/images/${bad}` })).statusCode, 404, bad);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const dark = files.find((f) => /^[a-z0-9-]+\.webp$/.test(f) && !f.endsWith('-light.webp') && files.includes(f.replace(/\.webp$/, '-light.webp')));
  if (dark) {
    const get = (q: string) => app.inject({ method: 'GET', url: `/api/guide/images/${dark}${q}` });
    const plain = await get('');
    assert.equal(plain.statusCode, 200);
    assert.equal(plain.headers['content-type'], 'image/webp');
    assert.ok(plain.rawPayload.equals(fs.readFileSync(path.join(dir, dark))));
    assert.ok((await get('?theme=light')).rawPayload.equals(fs.readFileSync(path.join(dir, dark.replace(/\.webp$/, '-light.webp')))));
  }
  const only = files.find((f) => /^[a-z0-9-]+\.webp$/.test(f) && !f.endsWith('-light.webp') && !files.includes(f.replace(/\.webp$/, '-light.webp')));
  if (only) assert.ok((await app.inject({ method: 'GET', url: `/api/guide/images/${only}?theme=light` })).rawPayload.equals(fs.readFileSync(path.join(dir, only))));
  await app.close();
});

// ---- Agent Guidelines ----------------------------------------------------------------------------------

const recycled: string[] = [];
const status = { value: 'idle' as string };
const d = {
  db,
  sessions: {
    summary: (k: string) => ({ key: k, title: 'A session' }),
    queueSummary: () => {},
    runOf: (k: string) => (k === 'acp:z' ? 'r-acp' : `r-${k}`),
    adapterByRun: () => ({ state: { status: status.value } }),
    recycle: async (k: string) => void recycled.push(k),
  },
  broadcast: () => {},
} as unknown as Deps;

test('guidelines: every session’s, the project’s, the session’s own, the most general first', () => {
  assert.equal(guidelinesBlock(db, {}), '');
  const sp = createSpace(db, { name: 'Thesis', instructions: 'Cite in APA style.' });
  putGuidelines(d, { global: '  Answer in plain English.  ' });
  setSessionExtra(db, 'claude:k1', { space: sp.id, guidelines: 'Only Python 3.12.' });
  const block = guidelinesBlock(db, sessionExtra(db, 'claude:k1'));
  assert.match(block, /^# Agent Guidelines\n/);
  assert.match(block, /## For every session\nAnswer in plain English\.\n\n## For the project “Thesis”\nCite in APA style\.\n\n## For this session\nOnly Python 3\.12\.$/);
  const v = guidelinesView(db, { key: 'claude:k1' });
  assert.deepEqual(v, { global: 'Answer in plain English.', space: { id: sp.id, name: 'Thesis', text: 'Cite in APA style.' }, session: { key: 'claude:k1', text: 'Only Python 3.12.' } });
  putGuidelines(d, { space: { id: sp.id, text: 'Cite in MLA style.' }, session: { key: 'claude:k1', text: '' } });
  assert.equal(guidelinesView(db, { key: 'claude:k1' }).space?.text, 'Cite in MLA style.');
  assert.equal(sessionExtra(db, 'claude:k1').guidelines, undefined, 'an emptied level goes');
  assert.throws(() => putGuidelines(d, { space: { id: 'spnone', text: 'x' } }), /No such project/);
});

test('guidelines: every agent gets them when it starts; a change starts an idle Claude Code or Codex afresh before the next message', async () => {
  const add = await guidelines.spawn!({ agent: 'claude', key: 'claude:k2', cwd: tmp, runId: 'r-claude:k2', resume: false, extra: sessionExtra(db, 'claude:k2') }, d);
  assert.match(add!.instructions![0], /Answer in plain English/);
  await guidelines.beforeSend!('claude:k2', d);
  assert.deepEqual(recycled, [], 'nothing changed');
  setSessionExtra(db, 'claude:k2', { guidelines: 'Be brief.' });
  status.value = 'working';
  await guidelines.beforeSend!('claude:k2', d);
  assert.deepEqual(recycled, [], 'not in the middle of a turn');
  status.value = 'idle';
  await guidelines.beforeSend!('claude:k2', d);
  assert.deepEqual(recycled, ['claude:k2']);
  // ACP agents (Custom reads them before each turn) are left as they are.
  await guidelines.spawn!({ agent: 'acp', acpAgent: 'console', key: 'acp:z', cwd: tmp, runId: 'r-acp', resume: false, extra: {} }, d);
  putGuidelines(d, { global: 'Something new.' });
  await guidelines.beforeSend!('acp:z', d);
  assert.deepEqual(recycled, ['claude:k2']);
});

test('guidelines: “How the agents talk to you” moves into every session’s, once', () => {
  putGuidelines(d, { global: 'Answer in plain English.' });
  setSettings(db, { tone: 'Brief and technical' });
  guidelines.start!(d);
  assert.equal(globalGuidelines(db), 'Answer in plain English.\n\nHow to talk to me: Brief and technical');
  assert.equal(toneOf(db), '');
  guidelines.start!(d);
  assert.equal(globalGuidelines(db), 'Answer in plain English.\n\nHow to talk to me: Brief and technical');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}\n${(e as Error).stack ?? e}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
