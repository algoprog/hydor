// Script tests for sharing a project with people: making, opening, running out, stopping and making again a person's
// link (only its hash kept); a link reaching its own project's things and nothing else (other projects' documents and
// sessions, an app's screens, Confidential sessions, other pictures, the owner's routes, path tricks, other sites'
// pages); wrong tokens counted as wrong passwords by address (a pause for every link from there), links that worked
// once not counted; comments under the person's name (on the words they quote, in a document and a LaTeX source;
// replies, resolving, only their own changed or deleted), a run of them kept as one version, the owner told and an
// inbox line until it is answered; View and comment cannot save, Edit documents can and the version says who, without
// changing who wrote anyone else's comments; a save on an older version keeping people's comments since; a session
// as a read-only link shows it; the reading list; and what agents and Word files say of people's comments.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/spaces/share-test.ts
//   DATA_DIR=/tmp/hydor-test-share node dist/dev/share-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { Comment } from '../../shared/comments.ts';
import type { Doc } from '../../shared/docs.ts';
import type { TexDoc } from '../../shared/latex.ts';
import type { PortalItemView, PortalView, ProjectShare } from '../../shared/share.ts';
import type { TimelineItem } from '../../shared/types.ts';
import { Zip } from '../documents/zip.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { pages } from '../pages/index.ts';
import { putAsset } from '../pages/assets.ts';
import { addVersion, createPage, pageInfo, pageModel, putValues, versionsOf } from '../pages/store.ts';
import { texSetup } from '../pages/latex.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { createSpace, deleteSpace } from './index.ts';
import { sharing, shareInbox } from './share.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-share-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
  try {
    done(null, String(b).trim() ? JSON.parse(String(b)) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));

// ---- a project with its things, another project, and sessions ---------------------------------------------------------
const thesis = createSpace(db, { name: 'Thesis', folder: tmp, description: 'My PhD thesis on dense retrieval', color: 'violet' });
const taxes = createSpace(db, { name: 'Taxes', folder: tmp });

const summaries = new Map<string, any>();
const timelines = new Map<string, TimelineItem[]>();
function session(key: string, space: string, title: string, items: TimelineItem[], extra: Record<string, unknown> = {}) {
  db.prepare('insert into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(key, 'claude', 1, 2);
  setSessionExtra(db, key, { space, ...extra });
  summaries.set(key, { key, agent: 'claude', id: key, title, extra: { space, ...extra }, stats: {}, updatedAt: 2, live: { status: 'idle' } });
  timelines.set(key, items);
}
const at = 1_700_000_000_000;
session('claude:s1', thesis.id, 'Write chapter 3', [
  { kind: 'user', id: 'u1', seq: 0, ts: at, text: 'Write chapter 3 about the results' },
  { kind: 'user', id: 'n1', seq: 0, ts: at, text: '<system-reminder>The user’s memory: likes cats</system-reminder>', meta: 'note' },
  { kind: 'thinking', id: 'th', seq: 0, ts: at, text: 'Secret plan' } as TimelineItem,
  { kind: 'tool', id: 't1', seq: 0, ts: at, tool: { id: 't1', name: 'Bash', category: 'command', title: 'cat ~/.ssh/id_rsa', label: 'Read a key', status: 'ok', input: { command: 'cat ~/.ssh/id_rsa' }, output: '-----BEGIN KEY-----' } } as TimelineItem,
  { kind: 'user', id: 'c1', seq: 0, ts: at, text: 'Total cost: $4.20', meta: 'command-output' },
  { kind: 'assistant', id: 'a1', seq: 0, ts: at, text: 'Chapter 3 is written.' },
  { kind: 'system', id: 'sy', seq: 0, ts: at, level: 'error', text: 'A hiccup', detail: 'stack trace with /home/owner/secret' },
  { kind: 'turn', id: 'tu', seq: 0, ts: at, status: 'completed', durationMs: 5000, costUsd: 4.2, tokens: { input: 1, output: 2 } } as TimelineItem,
]);
session('claude:s2', thesis.id, 'My private notes', [{ kind: 'user', id: 'u2', seq: 0, ts: at, text: 'Diary' }], { confidential: true });
session('claude:s3', taxes.id, 'Tax return', [{ kind: 'user', id: 'u3', seq: 0, ts: at, text: 'My income is…' }]);
// Kept Confidential in its stored settings alone (the summary the app has does not say so yet).
session('claude:s4', thesis.id, 'Health notes', [{ kind: 'user', id: 'u4', seq: 0, ts: at, text: 'My diagnosis' }]);
setSessionExtra(db, 'claude:s4', { confidential: true });

const notices: any[] = [];
const events: any[] = [];
const deps = {
  app,
  db,
  sessions: {
    summary: (k: string) => summaries.get(k) ?? null,
    timeline: async (k: string) => ({ parser: { items: timelines.get(k) ?? [] } }),
    emit: (e: string, n: unknown) => e === 'notify' && notices.push(n),
    deliverOrQueue: async () => {},
  },
  broadcast: (e: unknown) => void events.push(e),
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
pages.routes!(deps);
sharing.routes!(deps);
await app.ready();

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const pic = putAsset(db, png);
const otherPic = putAsset(db, Buffer.concat([png, Buffer.from([0])]));
const chapter = createPage(db, {
  title: 'Chapter 3',
  kind: 'doc',
  model: { markdown: `# Results\n\nDense retrieval beats BM25 on every dataset we tried.\n\nThe gap is largest on long queries.\n\n![A plot](naget-asset:${pic})` },
  by: 'agent',
  space: thesis.id,
});
const paper = createPage(db, {
  title: 'Paper',
  kind: 'tex',
  model: { main: '\\documentclass{article}\n\\begin{document}\nWe study dense retrieval.\n\\input{intro}\n\\end{document}\n', files: [{ name: 'intro.tex', text: 'Our method is simple and fast.\n' }] },
  by: 'agent',
  space: thesis.id,
});
const budget = createPage(db, { title: 'Budget', kind: 'sheet', model: { sheets: [{ name: 'Sheet1', cells: { A1: 'Item', B1: 'Cost', A2: 'GPU hours', B2: 120 } }] }, by: 'agent', space: thesis.id });
const tracker = createPage(db, { title: 'Reading tracker', html: '<!doctype html><html><body><h1>Tracker</h1></body></html>', by: 'agent', space: thesis.id });
putValues(db, tracker.id, [['read', JSON.stringify(12)]]);
const screen = createPage(db, { title: 'An app’s screen', html: '<!doctype html><p>x</p>', by: 'agent', app: 'someapp' });
db.prepare('update pages set space = ? where id = ?').run(thesis.id, screen.id);
const receipts = createPage(db, { title: 'Receipts', kind: 'doc', model: { markdown: `Receipts\n\n![x](naget-asset:${otherPic})` }, by: 'agent', space: taxes.id });

// The reading list app's papers (its records), for this project and another.
db.exec("create table if not exists app_data (app_id text not null, collection text not null, id text not null, data text not null, created_at integer not null, updated_at integer not null, primary key (app_id, collection, id))");
const paperRec = (id: string, rec: Record<string, unknown>) => db.prepare('insert into app_data (app_id, collection, id, data, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run('tpl:reading-list', 'papers', id, JSON.stringify(rec), 1, 1);
paperRec('r1', { title: 'Dense Passage Retrieval', authors: ['Karpukhin', 'Oguz'], year: 2020, venue: 'EMNLP', doi: '10.18653/v1/2020.emnlp-main.550', status: 'read', project: 'Thesis', notes: 'My private thoughts', pdf: '/home/owner/papers/dpr.pdf' });
paperRec('r2', { title: 'ColBERT', arxiv: '2004.12832', status: 'to read', project: thesis.id });
paperRec('r3', { title: 'Tax law', project: 'Taxes' });

// ---- a small test runner ------------------------------------------------------------------------------------------------
let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const HOST = 'app.test';
const req = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', host: HOST, ...headers } });
const from = (ip: string) => ({ 'x-forwarded-for': ip });

// ---- making links -----------------------------------------------------------------------------------------------------------
let r = await req('POST', `/api/projects/${thesis.id}/shares`, { name: '  Maria  Lopez ', role: 'comment', days: 7 });
ok(r.statusCode === 200, `invite: ${r.body}`);
const maria = r.json() as { share: ProjectShare; token: string };
ok(/^[A-Za-z0-9_-]{32}$/.test(maria.token), 'the link’s token is long and random');
ok(maria.share.name === 'Maria Lopez' && maria.share.role === 'comment' && maria.share.expiresAt! > Date.now() + 6.9 * 86_400_000, 'the person, what they may do and until when');
ok(!JSON.stringify(maria.share).includes(maria.token), 'the share says nothing of its token');
const rows = JSON.stringify(db.prepare('select * from project_shares').all());
ok(!rows.includes(maria.token), 'only the hash of the token is kept');
ok((await req('POST', `/api/projects/${thesis.id}/shares`, { name: ' ', role: 'comment' })).statusCode === 400, 'a name is needed');
ok((await req('POST', `/api/projects/${thesis.id}/shares`, { name: 'X', role: 'admin' })).statusCode === 400, 'only the two roles');
ok((await req('POST', `/api/projects/nope/shares`, { name: 'X' })).statusCode === 404, 'only for a project there is');
r = await req('POST', `/api/projects/${thesis.id}/shares`, { name: 'Nikos', role: 'edit', days: null });
const nikos = r.json() as { share: ProjectShare; token: string };
ok(nikos.share.role === 'edit' && !nikos.share.expiresAt, 'Edit documents, until stopped');
const listed = (await req('GET', `/api/projects/${thesis.id}/shares`)).json() as { shares: ProjectShare[]; owner: string };
ok(listed.shares.length === 2 && listed.owner === 'Owner', 'the people it is shared with, and the owner shows as Owner');
r = await req('PUT', '/api/projects/sharing', { owner: 'Chris' });
ok(r.json().owner === 'Chris', 'the owner gives the name people see');

// ---- what a link opens ----------------------------------------------------------------------------------------------------------
const M = `/p-api/${maria.token}`;
const N = `/p-api/${nikos.token}`;
r = await req('GET', `${M}?visit=1`, undefined, from('198.51.100.7'));
ok(r.statusCode === 200 && r.headers['cache-control'] === 'no-store', 'the portal opens, not kept by caches');
const view = r.json() as PortalView;
ok(view.project.name === 'Thesis' && view.project.description === 'My PhD thesis on dense retrieval' && view.owner === 'Chris', 'the project as the owner describes it');
ok(view.me.name === 'Maria Lopez' && view.me.role === 'comment', 'who they are, and what they may do');
const ids = view.items.map((x) => x.id).sort();
ok(JSON.stringify(ids) === JSON.stringify([chapter.id, paper.id, budget.id, tracker.id].sort()), 'its documents alone: not another project’s, not an app’s screen');
ok(view.sessions.length === 1 && view.sessions[0].key === 'claude:s1', 'its sessions, not Confidential ones or another project’s');
ok(view.runs.length === 0, 'no runs yet');
ok(view.reading.length === 2 && view.reading.some((p) => p.title === 'Dense Passage Retrieval' && p.link === 'https://doi.org/10.18653/v1/2020.emnlp-main.550' && p.authors === 'Karpukhin, Oguz' && p.year === '2020'), 'the reading list: its papers, linked by DOI');
ok(view.reading.some((p) => p.title === 'ColBERT' && p.link === 'https://arxiv.org/abs/2004.12832'), 'by arXiv id, and by the project’s id');
ok(!JSON.stringify(view).includes('private thoughts') && !JSON.stringify(view).includes('/home/owner'), 'never a paper’s notes or files');
ok(!JSON.stringify(view).includes(tmp), 'never the project’s folder');
const shares = (await req('GET', `/api/projects/${thesis.id}/shares`)).json().shares as ProjectShare[];
ok(shares.find((s) => s.id === maria.share.id)?.views === 1 && !!shares.find((s) => s.id === maria.share.id)?.seenAt, 'a visit is counted');

// A document: its own page to read, and its comments.
r = await req('GET', `${M}/items/${chapter.id}`);
let item = r.json() as PortalItemView;
ok(r.statusCode === 200 && !item.editable && item.html?.includes('Dense retrieval beats BM25') && Array.isArray(item.comments), 'a document opens as its own page, with its comments');
ok(item.html!.includes('data:image/png;base64'), 'its pictures inside it');
ok((await req('GET', `${M}/items/${receipts.id}`)).statusCode === 404, 'not another project’s document');
ok((await req('GET', `${M}/items/${screen.id}`)).statusCode === 404, 'not an app’s screen');
ok((await req('GET', `${M}/items/..%2F..%2Fapi`)).statusCode === 404, 'not a path trick');
r = await req('POST', `${M}/items/${tracker.id}/storage`, { op: 'get', key: 'read' });
ok(r.statusCode === 200 && r.json().value === 12, 'a page’s data reads as it is');
ok((await req('POST', `${M}/items/${tracker.id}/storage`, { op: 'set', key: 'read', value: 0 })).statusCode === 403, 'and is not changed through a link');
ok((await req('POST', `${M}/items/${tracker.id}/storage`, { op: 'get', key: 'read' }, { origin: 'https://evil.example' })).statusCode === 403, 'nothing sent from another site');

// ---- comments under their name ------------------------------------------------------------------------------------------------
const v0 = pageInfo(db, chapter.id)!.version;
r = await req('POST', `${M}/items/${chapter.id}/comments`, { text: 'Which datasets exactly?', quote: 'beats  BM25 on\nevery dataset' });
ok(r.statusCode === 200, `a comment on words they quote: ${r.body}`);
let doc = pageModel(db, chapter.id) as Doc;
const c1 = doc.comments?.find((c) => c.text === 'Which datasets exactly?');
ok(c1?.by === 'person' && c1.name === 'Maria Lopez' && c1.who === maria.share.id, 'the comment carries their name, not you or an agent');
ok(c1?.quote === 'beats BM25 on every dataset', 'on the words as the document has them');
const marked = doc.blocks.flatMap((b) => (b.type === 'p' ? b.runs : [])).filter((x) => x.cm?.includes(c1!.id));
ok(marked.map((x) => x.t).join('') === 'beats BM25 on every dataset', 'those words are marked in the document');
ok(pageInfo(db, chapter.id)!.version === v0 + 1 && pageInfo(db, chapter.id)!.who === 'Maria Lopez', 'a new version, made by them');
ok((await req('POST', `${M}/items/${chapter.id}/comments`, { text: 'Hm', quote: 'words that are not there' })).statusCode === 400, 'words not in the document are said');
r = await req('POST', `${M}/items/${chapter.id}/comments`, { text: 'Lovely chapter overall.' });
ok(r.statusCode === 200 && (r.json().comments as Comment[]).some((c) => c.text === 'Lovely chapter overall.' && !c.quote), 'a comment on the whole document');
ok(pageInfo(db, chapter.id)!.version === v0 + 2 && versionsOf(db, chapter.id).length === 2, 'a run of comments is kept as one version');
ok(notices.length === 2 && notices[0].title === 'Chapter 3' && /Maria Lopez commented: “Which datasets exactly\?”/.test(notices[0].body) && notices[0].url === `/pages/${chapter.id}`, 'the owner is told who commented, and where');
let inbox = shareInbox(db);
ok(inbox.length === 2 && inbox.some((x) => x.title === 'Maria Lopez commented on “Chapter 3”' && x.detail === 'Which datasets exactly?' && x.path === `/pages/${chapter.id}`), 'an inbox line for each comment');
r = await req('POST', `${M}/items/${chapter.id}/comments`, { id: c1!.id, reply: 'Also: which split?' });
ok(r.statusCode === 200 && (pageModel(db, chapter.id) as Doc).comments!.find((c) => c.id === c1!.id)!.replies?.[0].name === 'Maria Lopez', 'a reply under their name');
// The owner's own comment, and an agent's answer.
doc = pageModel(db, chapter.id) as Doc;
const owners: Comment = { id: 'cowner1', by: 'user', text: 'Note to self: add the table', at: Date.now() };
addVersion(db, chapter.id, { model: { ...doc, comments: [...(doc.comments ?? []), owners] }, by: 'edit' });
r = await req('GET', `${M}/items/${chapter.id}`);
item = r.json() as PortalItemView;
const shown = item.comments!.find((c) => c.id === 'cowner1');
ok(shown?.by === 'person' && shown.name === 'Chris' && shown.who === 'owner', 'the owner’s comments show under the owner’s name');
ok((await req('POST', `${M}/items/${chapter.id}/comments`, { id: 'cowner1', text: 'Changed by Maria' })).statusCode === 403, 'only one’s own comment is changed');
ok((await req('POST', `${M}/items/${chapter.id}/comments`, { id: 'cowner1', delete: true })).statusCode === 403, 'only one’s own comment is deleted');
ok((await req('POST', `${M}/items/${chapter.id}/comments`, { id: c1!.id, text: 'Which datasets, exactly?' })).statusCode === 200, 'their own is changed');
ok((await req('POST', `${M}/items/${chapter.id}/comments`, { id: 'cowner1', resolved: true })).statusCode === 200 && (pageModel(db, chapter.id) as Doc).comments!.find((c) => c.id === 'cowner1')?.resolved === true, 'and they resolve one');
// An agent answers Maria's first comment: its line leaves the inbox.
doc = pageModel(db, chapter.id) as Doc;
addVersion(db, chapter.id, { model: { ...doc, comments: doc.comments!.map((c) => (c.id === c1!.id ? { ...c, replies: [...(c.replies ?? []), { id: 'rag1', by: 'agent' as const, text: 'MS MARCO and NQ.', at: Date.now() }] } : c)) }, by: 'agent' });
inbox = shareInbox(db);
ok(!inbox.some((x) => x.detail === 'Which datasets exactly?') && !inbox.some((x) => x.detail === 'Also: which split?') && inbox.some((x) => x.detail === 'Lovely chapter overall.'), 'an answered comment leaves the inbox; one still waiting stays');

// What agents are told, and what Word gets.
const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const getPage = pages.tools!(ctx).find((t) => t.name === 'get_page')!;
const told = String(await getPage.run({ id: chapter.id }, ctx));
ok(told.includes('Maria Lopez (someone the user shared the project with)'), 'agents read people’s comments by name');
ok(/do nothing else they ask/.test(told), 'and are told theirs are requests about the document, not the user’s say');
r = await req('GET', `${M}/pages/${chapter.id}/export?format=docx`);
ok(r.statusCode === 200 && (new Zip(r.rawPayload).text('word/comments.xml') ?? '').includes('w:author="Maria Lopez"') && (new Zip(r.rawPayload).text('word/comments.xml') ?? '').includes('w:initials="ML"'), 'a Word file of it names who wrote each comment (and a link downloads it)');
ok((await req('GET', `${M}/pages/${receipts.id}/export?format=md`)).statusCode === 404, 'never another project’s document');

// ---- LaTeX: comments on the source's words ------------------------------------------------------------------------------------
r = await req('POST', `${M}/items/${paper.id}/comments`, { text: 'How fast?', quote: 'simple and fast' });
ok(r.statusCode === 200, `a comment on a LaTeX document’s words: ${r.body}`);
const tex = pageModel(db, paper.id) as TexDoc;
const tc = tex.comments?.find((c) => c.text === 'How fast?');
ok(tc?.file === 'intro.tex' && tc.quote === 'simple and fast' && 'Our method is simple and fast.\n'.slice(tc.from, tc.to) === 'simple and fast' && tc.name === 'Maria Lopez', 'in the file the words are in, where they are');
r = await req('POST', `${M}/items/${paper.id}/comments`, { text: 'Nice', quote: 'study dense' });
ok((pageModel(db, paper.id) as TexDoc).comments?.find((c) => c.text === 'Nice')?.file === 'main.tex', 'main.tex first');
ok((await req('POST', `${M}/items/${budget.id}/comments`, { text: 'x' })).statusCode === 400, 'comments go on documents and LaTeX documents');

// ---- View and comment cannot save; Edit documents can, and the version says who ----------------------------------------------
const cur = pageInfo(db, chapter.id)!;
ok((await req('POST', `${M}/items/${chapter.id}/versions`, { model: { markdown: 'Gone' }, base: cur.version })).statusCode === 403, 'View and comment cannot save a document');
r = await req('GET', `${N}/items/${chapter.id}`);
item = r.json() as PortalItemView;
ok(item.editable && !!item.model && !item.html, 'Edit documents opens it in its editor');
const edited = structuredClone(item.model) as Doc;
const para = edited.blocks.find((b) => b.type === 'p' && b.runs.some((x) => x.t.includes('long queries'))) as Extract<Doc['blocks'][number], { type: 'p' }>;
para.runs = [{ t: 'The gap is largest on long, rare queries.' }];
// Their own new comment (the editor writes it as "user"), a forged one, and the owner's comment changed and deleted.
edited.comments = [
  ...(edited.comments ?? []).filter((c) => c.id !== 'cowner1').map((c) => (c.id === c1!.id ? { ...c, text: 'Forged text', by: 'agent' as const } : c)),
  { id: 'cnik1', by: 'user', text: 'I reworded this', at: 1 },
  { id: 'cnik2', by: 'person', name: 'Chris', who: 'owner', text: 'Pretending to be the owner', at: 1 },
];
r = await req('POST', `${N}/items/${chapter.id}/versions`, { model: edited, base: cur.version });
ok(r.statusCode === 200, `Edit documents saves: ${r.body}`);
doc = pageModel(db, chapter.id) as Doc;
ok(JSON.stringify(doc.blocks).includes('long, rare queries'), 'their change is kept');
ok(versionsOf(db, chapter.id)[0].who === 'Nikos' && versionsOf(db, chapter.id)[0].by === 'edit', 'the version says who changed it');
{
  // A picture at a web address can't come in through a link: drawing the document would fetch it from this computer.
  const now = pageInfo(db, chapter.id)!;
  const web = await req('POST', `${N}/items/${chapter.id}/versions`, { model: { markdown: 'With a picture\n\n![x](https://example.com/x.png)', blocks: [{ type: 'image', src: 'https://example.com/x.png' }] }, base: now.version });
  ok(web.statusCode === 400 && pageInfo(db, chapter.id)!.version === now.version, 'a save that adds a picture at a web address is refused');
}
const byId = new Map(doc.comments!.map((c) => [c.id, c]));
ok(byId.get('cnik1')?.by === 'person' && byId.get('cnik1')?.name === 'Nikos', 'their new comment is theirs');
ok(byId.get('cnik2')?.name === 'Nikos', 'a comment they write is theirs whatever it claims');
ok(byId.get(c1!.id)?.text === 'Which datasets, exactly?' && byId.get(c1!.id)?.by === 'person' && byId.get(c1!.id)?.name === 'Maria Lopez', 'someone else’s comment keeps its words and its writer');
ok(byId.get('cowner1')?.by === 'user' && byId.get('cowner1')?.text === 'Note to self: add the table', 'the owner’s comment comes back, as the owner’s');
ok(notices.some((n) => /Nikos commented: “I reworded this”/.test(n.body)), 'the owner hears of a comment made in the editor too');
ok((await req('POST', `${N}/items/${tracker.id}/versions`, { model: {}, base: 1 })).statusCode === 403, 'a page of HTML is not changed through a link');
ok((await req('POST', `${N}/items/${receipts.id}/versions`, { model: { markdown: 'x' }, base: 1 })).statusCode === 404, 'nor another project’s document');
r = await req('POST', `${N}/items/${budget.id}/versions`, { model: { sheets: [{ name: 'Sheet1', cells: { A1: 'Item', B1: 'Cost', A2: 'GPU hours', B2: 140 } }] }, base: pageInfo(db, budget.id)!.version });
ok(r.statusCode === 200 && pageInfo(db, budget.id)!.who === 'Nikos', 'a spreadsheet is changed through Edit documents');
const sandboxed = (await texSetup()).sandbox;
r = await req('POST', `${N}/items/${paper.id}/versions`, { model: pageModel(db, paper.id), base: pageInfo(db, paper.id)!.version });
ok(sandboxed ? r.statusCode === 200 : r.statusCode === 403, `LaTeX is changed through a link only where TeX runs shut in (${sandboxed ? 'here it does' : 'not here'})`);
ok((await req('POST', `${M}/pages/tex/compile`, { model: pageModel(db, paper.id) })).statusCode === 403, 'View and comment typesets nothing');
ok((await req('GET', `${N}/pages/tex/0123456789abcdef0123456789abcdef01234567/1`)).statusCode === 404, 'a typesetting not made through this link is not served');

// ---- what an agent in a shared project is told ---------------------------------------------------------------------------------------
const spawned = await sharing.spawn!({ agent: 'claude', cwd: tmp, runId: 'r1', resume: false, extra: { space: thesis.id } } as never, deps);
ok(/shared the project “Thesis” with 2 people: Nikos and Maria Lopez|shared the project “Thesis” with 2 people: Maria Lopez and Nikos/.test(spawned?.instructions?.[0] ?? '') && /Write nothing in this session the user would not want them to read/.test(spawned!.instructions![0]), 'an agent in a shared project hears who reads its sessions');
ok(!(await sharing.spawn!({ agent: 'claude', cwd: tmp, runId: 'r1', resume: false, extra: { space: thesis.id, confidential: true } } as never, deps)), 'not in a Confidential session, which no one sees');
ok(!(await sharing.spawn!({ agent: 'claude', cwd: tmp, runId: 'r1', resume: false, extra: { space: taxes.id } } as never, deps)), 'nor in a project shared with no one');

// ---- a save on an older version keeps people's comments since -------------------------------------------------------------------
let base = pageInfo(db, chapter.id)!.version;
const stale = pageModel(db, chapter.id) as Doc;
await req('POST', `${M}/items/${chapter.id}/comments`, { text: 'One more thought', quote: 'Results' });
r = await req('POST', `/api/pages/${chapter.id}/versions`, { model: { ...stale, blocks: stale.blocks.map((b) => (b.type === 'p' && b.runs.some((x) => x.t === 'Results') ? { ...b, runs: [{ t: 'Results' }] } : b)) }, base });
ok(r.statusCode === 200, `the owner saves on top of people’s comments without being asked: ${r.body}`);
doc = pageModel(db, chapter.id) as Doc;
const carriedC = doc.comments?.find((c) => c.text === 'One more thought');
ok(!!carriedC && doc.blocks.some((b) => b.type === 'p' && b.runs.some((x) => x.cm?.includes(carriedC.id))), 'and the comment that came meanwhile is kept, on its words');
base = pageInfo(db, chapter.id)!.version;
addVersion(db, chapter.id, { model: pageModel(db, chapter.id), by: 'agent' });
ok((await req('POST', `/api/pages/${chapter.id}/versions`, { model: pageModel(db, chapter.id), base })).statusCode === 409, 'an agent’s change meanwhile is still asked about');

// ---- a session, as a read-only link shows it ------------------------------------------------------------------------------------------
r = await req('GET', `${M}/sessions/claude:s1`);
const sv = r.json() as { title: string; items: TimelineItem[] };
const text = JSON.stringify(sv);
ok(r.statusCode === 200 && sv.title === 'Write chapter 3' && sv.items.some((x) => x.kind === 'assistant'), 'a session of the project opens');
ok(!text.includes('Secret plan') && !text.includes('BEGIN KEY') && !text.includes('id_rsa') && !text.includes('likes cats') && !text.includes('$4.20') && !text.includes('/home/owner') && !text.includes('costUsd'), 'never thinking, command output or input, the harness’s notes, or what it cost');
ok((await req('GET', `${M}/sessions/claude:s2`)).statusCode === 404, 'not a Confidential session');
ok((await req('GET', `${M}/sessions/claude:s4`)).statusCode === 404 && !JSON.stringify((await req('GET', M)).json()).includes('Health notes'), 'nor one its stored settings keep Confidential, nor a word of it');
ok((await req('GET', `${M}/sessions/claude:s3`)).statusCode === 404, 'not another project’s session');

// ---- pictures, and what else a link might be asked for --------------------------------------------------------------------------------
ok((await req('GET', `${M}/pages/assets/${pic}`)).statusCode === 200, 'a picture of its documents');
ok((await req('GET', `${M}/pages/assets/${otherPic}`)).statusCode === 404, 'not a picture of another project’s');
ok((await req('POST', `${M}/pages/assets`, { data: `data:image/png;base64,${png.toString('base64')}` })).statusCode === 403, 'View and comment adds no pictures');
r = await req('POST', `${N}/pages/assets`, { url: 'http://169.254.169.254/latest/meta-data' });
ok(r.statusCode === 400, 'nothing is fetched from the web for a link');
for (const p of [`${M}/../api/projects`, `${M}/pages/fonts.css?f=Inter`, `${M}/pages/picture?url=http://127.0.0.1`, `${M}/x/api/fs/read?path=/etc/passwd`, `${M}/pages/${chapter.id}`, `${M}/items/${chapter.id}/versions`])
  ok([403, 404].includes((await req('GET', p)).statusCode), `nothing else: ${p}`);
ok((await req('DELETE', `${M}/items/${chapter.id}`)).statusCode === 404, 'nothing is deleted through a link');

// ---- links that stop, run out, are made again; wrong ones counted ---------------------------------------------------------------------
r = await req('POST', `/api/projects/${thesis.id}/shares/${maria.share.id}/link`);
const again = r.json() as { share: ProjectShare; token: string };
ok(again.share.id === maria.share.id && again.token !== maria.token, 'a new link for the same person');
r = await req('GET', M, undefined, from('203.0.113.9'));
ok(r.statusCode === 410 && /replaced/.test(r.json().error), 'the old one says it was replaced');
ok((await req('GET', `/p-api/${again.token}`, undefined, from('203.0.113.9'))).statusCode === 200, 'the new one works');
r = await req('PATCH', `/api/projects/${thesis.id}/shares/${nikos.share.id}`, { role: 'comment', days: 30 });
ok(r.json().share.role === 'comment' && r.json().share.expiresAt > Date.now(), 'what they may do and until when can change');
ok((await req('POST', `${N}/items/${budget.id}/versions`, { model: pageModel(db, budget.id), base: pageInfo(db, budget.id)!.version })).statusCode === 403, 'and it holds at once');
db.prepare('update project_shares set expires_at = ? where id = ?').run(Date.now() - 1000, nikos.share.id);
r = await req('GET', N, undefined, from('203.0.113.9'));
ok(r.statusCode === 410 && /expired/.test(r.json().error), 'a link that ran out says so');
ok((await req('DELETE', `/api/projects/${thesis.id}/shares/${maria.share.id}`)).statusCode === 200, 'stop sharing with someone');
r = await req('GET', `/p-api/${again.token}`, undefined, from('203.0.113.9'));
ok(r.statusCode === 410 && /turned off/.test(r.json().error), 'their link stops at once');
ok((await req('GET', `/api/projects/${thesis.id}/shares`)).json().shares.length === 1, 'and they leave the list');
const triesAfterGone = JSON.parse((db.prepare("select v from kv where k = 'auth:tries'").get() as { v: string } | undefined)?.v ?? '{}');
ok(!triesAfterGone.by?.['203.0.113.9'], 'links that worked once are not counted as guesses');

// Wrong tokens, from one address: the tenth pauses it, for every link (right ones too); another address goes on.
const fresh = (await req('POST', `/api/projects/${thesis.id}/shares`, { name: 'Eleni', role: 'comment' })).json() as { token: string };
const guess = (i: number) => `${'A'.repeat(31)}${i % 10}`;
for (let i = 0; i < 9; i++) ok((await req('GET', `/p-api/${guess(i)}`, undefined, from('192.0.2.50'))).statusCode === 404, `a wrong token opens nothing (${i + 1})`);
ok((await req('GET', `/p-api/${fresh.token}`, undefined, from('192.0.2.50'))).statusCode === 200, 'the right one still works before the pause');
r = await req('GET', `/p-api/not-even-a-token/items/x`, undefined, from('192.0.2.50'));
ok(r.statusCode === 429 && /Too many wrong links/.test(r.json().error), 'the tenth wrong one pauses the address');
ok((await req('GET', `/p-api/${fresh.token}`, undefined, from('192.0.2.50'))).statusCode === 429, 'every link from there waits out the pause');
ok((await req('GET', `/p-api/${fresh.token}`, undefined, from('192.0.2.77'))).statusCode === 200, 'another address goes on');
const tries = JSON.parse((db.prepare("select v from kv where k = 'auth:tries'").get() as { v: string }).v);
ok(tries.by['192.0.2.50']?.until > Date.now() && !(tries.all ?? []).length, 'counted with the address’s wrong passwords, not over every address');

// A deleted project: its links open nothing, say so, and are stopped.
const temp = createSpace(db, { name: 'Temp', folder: tmp });
const tl = (await req('POST', `/api/projects/${temp.id}/shares`, { name: 'Sam' })).json() as { share: ProjectShare; token: string };
deleteSpace(db, temp.id);
r = await req('GET', `/p-api/${tl.token}`, undefined, from('203.0.113.40'));
ok(r.statusCode === 410 && /no longer shared/.test(r.json().error), 'a deleted project’s link says it is no longer shared');
sharing.event!({ t: 'feature', id: 'spaces', data: { changed: true } } as never, deps);
ok(!!(db.prepare('select stopped_at from project_shares where id = ?').get(tl.share.id) as { stopped_at: number | null }).stopped_at, 'and is stopped');

console.log(`${passed} passed, ${failed} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
