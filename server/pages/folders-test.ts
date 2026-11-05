// Script tests for the Library's folders (folders.ts): made, renamed, nested, things put in them and taken out, a
// folder moved into another (never into itself) or to another project with what it holds, deleted (what it held goes
// up a level, nothing is deleted), a project deleted (its folders stay, in no project); pictures, videos and sounds in
// folders too; agents saving into a folder by its name or path (made when missing) and get_page saying where each thing
// is; and a folder of this computer brought in (import-folder.ts): a folder of documents as a folder of the Library, a
// LaTeX project as one document. Through the routes, with a stand-in for the session manager. Build and run with a
// scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/folders-test.ts
//   DATA_DIR=/tmp/hydor-test-folders node dist/dev/folders-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { initMedia, getMedia } from '../media/store.ts';
import { createSpace, deleteSpace } from '../spaces/index.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { deleteFolder, folderById, listFolders, putInFolder } from './folders.ts';
import { pages } from './index.ts';
import { readTex } from './latex.ts';
import { pageSource } from './store.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-folders-test-')));
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
const told: unknown[] = [];
const deps = { app, db, sessions: { deliverOrQueue: async () => {} }, broadcast: (m: unknown) => told.push(m), toSubscribers() {}, publicBase: () => 'https://naget.example' } as unknown as Deps;
pages.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tools = Object.fromEntries(pages.tools!(ctx).map((t) => [t.name, t]));

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) =>
  app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'app.test' } });
const run = async (name: string, args: Record<string, unknown>): Promise<{ text?: string; error?: string }> => {
  try {
    const r = await tools[name].run(args, ctx);
    return { text: typeof r === 'string' ? r : r.text };
  } catch (e) {
    return { error: (e as Error).message };
  }
};
const idOf = (text?: string) => /\(page ([a-f0-9]{10})/.exec(text ?? '')?.[1] ?? '';
const pageOf = async (id: string) => (await req('GET', `/api/pages/${id}`)).json().page;
const html = (t: string) => `<!doctype html><html><body><p>${t}</p></body></html>`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// ---- folders and what is in them ------------------------------------------------------------------------------
const lab = createSpace(db, { name: 'Lab', folder: tmp });
const thesis = (await req('POST', '/api/pages/folders', { name: 'Thesis' })).json().folder;
ok(thesis?.id && thesis.name === 'Thesis' && !thesis.parent && !thesis.space, 'a folder is made at the top of no project');
ok((await req('POST', '/api/pages/folders', { name: 'thesis' })).statusCode === 409, 'a name a folder there has (capitals aside) is refused');
const drafts = (await req('POST', '/api/pages/folders', { name: 'Drafts', parent: thesis.id, space: lab.id })).json().folder;
ok(drafts.parent === thesis.id && !drafts.space, 'a folder in a folder is in that folder’s place, whatever place is asked');
const renamed = (await req('PATCH', `/api/pages/folders/${drafts.id}`, { name: 'Chapter drafts' })).json().folder;
ok(renamed.name === 'Chapter drafts', 'a folder is renamed');
ok((await req('POST', '/api/pages/folders', { name: '  ' })).statusCode === 400 && (await req('POST', '/api/pages/folders', { name: 'a/b' })).json().folder?.name === 'a-b', 'a folder needs a name, and a slash in it becomes a dash');

const p1 = (await req('POST', '/api/pages', { title: 'Plan', html: html('plan'), folder: drafts.id })).json().page;
ok(p1.folder === drafts.id && !p1.space, 'New in a folder makes the page in it');
const md = (await req('POST', '/api/pages/import', { name: 'notes.md', data: Buffer.from('# Notes\n\nWords.\n').toString('base64'), folder: thesis.id })).json().page;
ok(md.kind === 'doc' && md.folder === thesis.id, 'a file opened in a folder comes in there');
await req('PATCH', `/api/pages/${p1.id}`, { folder: thesis.id });
ok((await pageOf(p1.id)).folder === thesis.id, 'a page is moved into another folder');
await req('PATCH', `/api/pages/${p1.id}`, { folder: null });
ok(!(await pageOf(p1.id)).folder, 'and out of any, to its place’s top');
const listed = (await req('GET', '/api/pages')).json();
ok(listed.folders?.length === 3 && listed.pages.some((p: { id: string; folder?: string }) => p.id === md.id && p.folder === thesis.id), 'the Library’s list has the folders, and each page’s folder');

// Projects: a thing put in a folder of a project goes to that project; one moved to another project leaves its folder.
const results = (await req('POST', '/api/pages/folders', { name: 'Results', space: lab.id })).json().folder;
ok(results.space === lab.id, 'a folder is made at the top of a project');
await req('PATCH', `/api/pages/${p1.id}`, { folder: results.id });
let p = await pageOf(p1.id);
ok(p.folder === results.id && p.space === lab.id, 'a page put in a folder of a project goes to that project');
await req('PATCH', `/api/pages/${p1.id}`, { space: null });
p = await pageOf(p1.id);
ok(!p.folder && !p.space, 'moved to another project, it leaves its folder');

// A folder moved: into another, never into itself; to another project, with what it holds.
await req('PATCH', `/api/pages/${p1.id}`, { folder: drafts.id });
ok((await req('PATCH', `/api/pages/folders/${thesis.id}`, { parent: drafts.id })).statusCode === 400, 'a folder cannot go inside itself');
const moved = (await req('PATCH', `/api/pages/folders/${thesis.id}`, { space: lab.id })).json().folder;
const all = new Map(listFolders(db).map((f) => [f.id, f]));
ok(moved.space === lab.id && all.get(drafts.id)?.space === lab.id, 'a folder moved to another project takes its folders along');
ok((await pageOf(p1.id)).space === lab.id && (await pageOf(md.id)).space === lab.id, 'and the things in them');
const other = (await req('POST', '/api/pages/folders', { name: 'Chapter drafts', space: lab.id })).json().folder;
const up = (await req('PATCH', `/api/pages/folders/${drafts.id}`, { parent: null })).json().folder;
ok(!up.parent && up.space === lab.id && up.name === 'Chapter drafts 2', 'one moved where a folder has its name gets a number');
await req('PATCH', `/api/pages/folders/${drafts.id}`, { parent: thesis.id });
await req('DELETE', `/api/pages/folders/${other.id}`);

// A folder deleted: what it held goes up a level, nothing is deleted.
const deep = (await req('POST', '/api/pages/folders', { name: 'Old', parent: drafts.id })).json().folder;
const del = (await req('DELETE', `/api/pages/folders/${drafts.id}`)).json();
ok(del.ok && del.moved === 2, 'deleting a folder says how many things went up');
ok((await pageOf(p1.id)).folder === thesis.id && folderById(db, deep.id)?.parent === thesis.id, 'what it held is now in the folder it was in');
ok(!folderById(db, drafts.id) && (await req('GET', `/api/pages/${p1.id}`)).statusCode === 200, 'the folder is gone, its pages stay');

// A folder in a folder of its name keeps it when the outer one goes.
{
  const outer = (await req('POST', '/api/pages/folders', { name: 'Same', space: lab.id })).json().folder;
  const inner = (await req('POST', '/api/pages/folders', { name: 'Same', parent: outer.id })).json().folder;
  await req('DELETE', `/api/pages/folders/${outer.id}`);
  const now = folderById(db, inner.id);
  ok(now?.name === 'Same' && !now.parent && now.space === lab.id, 'a folder going up keeps its name when it is free there');
  await req('DELETE', `/api/pages/folders/${inner.id}`);
}

// Pictures, videos and sounds go in folders too.
initMedia(db);
db.prepare("insert into media (id, kind, title, description, file, mime, bytes, caption, space, created_at, updated_at) values ('m1', 'image', 'Boat', '', 'x.png', 'image/png', 1, 'done', null, 1, 1)").run();
putInFolder(db, 'media', 'm1', thesis.id);
ok(getMedia(db, 'm1')?.folder === thesis.id && getMedia(db, 'm1')?.space === lab.id, 'a picture is put in a folder, in its project');
const gone = deleteFolder(db, thesis.id);
ok(gone.media && !getMedia(db, 'm1')?.folder && getMedia(db, 'm1')?.space === lab.id, 'a deleted folder’s picture goes up, its project kept');

// A project deleted: its folders stay, in no project.
const temp = createSpace(db, { name: 'Temp', folder: tmp });
const tf = (await req('POST', '/api/pages/folders', { name: 'Kept', space: temp.id })).json().folder;
deleteSpace(db, temp.id);
ok(!listFolders(db).find((f) => f.id === tf.id)?.space, 'a deleted project’s folders stay, in no project');

// ---- agents ----------------------------------------------------------------------------------------------------------
{
  const a = await run('save_doc', { title: 'Week one', markdown: '# Week one\n\nNotes.', libraryFolder: 'Notes/Week 1' });
  const id = idOf(a.text);
  const inFolder = (await pageOf(id)).folder;
  const f = listFolders(db).find((x) => x.id === inFolder);
  ok(f?.name === 'Week 1' && folderById(db, f.parent!)?.name === 'Notes', 'an agent saves into a folder by its path, made when missing');
  const list = (await run('get_page', {})).text ?? '';
  ok(list.includes(`${id} · Week one`) && list.includes('in the folder “Notes/Week 1”'), 'get_page’s list says each thing’s folder');
  setSessionExtra(db, 'claude:s1', { space: lab.id });
  const b = await run('save_page', { title: 'Run log', html: html('log'), libraryFolder: 'results' });
  const pb = await pageOf(idOf(b.text));
  ok(pb.folder === results.id && pb.space === lab.id, 'a name finds the folder of the session’s project first');
  await run('save_doc', { id, title: 'Week one', markdown: '# Week one\n\nMore notes.', libraryFolder: 'Results' });
  ok((await pageOf(id)).folder === results.id && (await pageOf(id)).space === lab.id, 'a thing an agent changes moves to the folder it names');
  const c = await run('save_latex', { title: 'Paper', source: '\\documentclass{article}\\begin{document}Hi.\\end{document}', libraryFolder: 'Papers' });
  ok(c.text && (await pageOf(idOf(c.text))).folder, 'save_latex takes libraryFolder too (its folder stays a project folder of the session)');
  setSessionExtra(db, 'claude:s1', { space: null });
}

// ---- a folder of this computer brought in -----------------------------------------------------------------------------
{
  const D = path.join(tmp, 'Field work');
  const put = (rel: string, data: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(D, rel)), { recursive: true });
    fs.writeFileSync(path.join(D, rel), data);
  };
  put('notes.md', '# Notes\n\nFrom the field.\n');
  put('counts.csv', 'site,count\nA,3\nB,5\n');
  put('analysis.ipynb', JSON.stringify({ cells: [{ cell_type: 'code', id: 'a', execution_count: null, metadata: {}, source: 'print(1)', outputs: [] }], metadata: {}, nbformat: 4, nbformat_minor: 5 }));
  put('photo.png', PNG);
  put('talk.pptx', 'not really');
  put('chapter.tex', 'Only a part of a document.\n');
  put('days/monday.txt', 'Rain.\n');
  put('days/empty/.keep', '');
  put('.hidden/secret.md', '# No\n');
  put('paper/main.tex', '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\\input{sections/intro}\n\\includegraphics{figures/plot}\n\\end{document}\n');
  put('paper/sections/intro.tex', 'Intro.\n');
  put('paper/figures/plot.png', PNG);
  put('paper/old/draft.tex', 'An old draft.\n');
  const r = (await req('POST', '/api/pages/import-folder', { path: D, space: lab.id })).json();
  ok(r.folder?.name === 'Field work' && r.folder.space === lab.id, 'a folder of documents becomes a Library folder, in the project asked');
  const titles = (r.pages ?? []).map((x: { title: string }) => x.title).sort();
  ok(JSON.stringify(titles) === JSON.stringify(['analysis', 'counts', 'monday', 'notes', 'paper']), `its documents, spreadsheets, notebooks and LaTeX come in (${titles.join(', ')})`);
  const why = new Map((r.skipped ?? []).map((s: { path: string; why: string }) => [s.path, s.why]));
  ok(why.get('photo.png') === 'picture' && why.get('talk.pptx') === 'slides' && why.get('chapter.tex') === 'part', 'what is left out is said, with why');
  ok(!(r.pages ?? []).some((x: { title: string }) => x.title === 'secret'), 'hidden folders are passed over');
  ok(r.folders === 2, 'its folder with something in it is a folder too; an empty one is not made');
  const monday = r.pages.find((x: { title: string }) => x.title === 'monday');
  const mondayFolder = folderById(db, monday.folder);
  ok(mondayFolder?.name === 'days' && mondayFolder.parent === r.folder.id, 'a document of a folder in it lands in that folder');
  const paper = r.pages.find((x: { title: string }) => x.title === 'paper');
  ok(paper.kind === 'tex' && paper.folder === r.folder.id, 'a LaTeX project in it comes in as one document');
  const doc = readTex(pageSource(db, paper.id)!.text);
  ok(doc.files.some((f) => f.name === 'sections/intro.tex') && doc.files.some((f) => f.name === 'old/draft.tex') && doc.pictures.some((x) => x.name === 'figures/plot.png'), 'with its files and pictures in their folders, the ones it does not use too');
  ok(told.some((m) => (m as { data?: { what?: string } }).data?.what === 'pages'), 'the Library hears of it');
}
{
  // A LaTeX project brought in whole: one document, no folder; past a document's limits, the files it uses stay.
  const D = path.join(tmp, 'big-paper');
  fs.mkdirSync(path.join(D, 'chapters'), { recursive: true });
  fs.mkdirSync(path.join(D, 'attic'), { recursive: true });
  fs.writeFileSync(path.join(D, 'thesis.tex'), '\\documentclass{book}\n\\begin{document}\n\\include{chapters/one}\n\\include{chapters/two}\n\\end{document}\n');
  fs.writeFileSync(path.join(D, 'chapters', 'one.tex'), 'One.\n');
  fs.writeFileSync(path.join(D, 'chapters', 'two.tex'), 'Two.\n');
  fs.writeFileSync(path.join(D, 'chapters', 'diagram.eps'), '%!PS-Adobe-3.0 EPSF-3.0\n');
  for (let i = 0; i < 60; i++) fs.writeFileSync(path.join(D, 'attic', `a${String(i).padStart(2, '0')}.tex`), `Old ${i}.\n`);
  const r = (await req('POST', '/api/pages/import-folder', { path: D, space: null, folder: results.id })).json();
  ok(!r.folder && r.pages?.length === 1 && r.pages[0].kind === 'tex' && r.pages[0].folder === results.id && r.pages[0].space === lab.id, 'a LaTeX project comes in as one document, into the folder asked (and its project)');
  const doc = readTex(pageSource(db, r.pages[0].id)!.text);
  ok(doc.files.length === 50 && doc.files[0].name === 'chapters/one.tex' && doc.files[1].name === 'chapters/two.tex', 'past a document’s limits, the files it uses come first and stay');
  ok(r.notes.some((n: string) => n.includes('attic/a') && n.includes('left out')), 'and what did not fit is said');
  ok(r.notes.some((n: string) => n.includes('chapters/diagram.eps') && n.includes('left out')), 'so is a picture of a kind TeX here cannot take');
  ok((await req('POST', '/api/pages/import-folder', { path: path.join(tmp, 'nowhere') })).statusCode === 404, 'a folder that is not there is said to be');
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
