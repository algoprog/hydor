// Script tests for the files kept things have in their projects' folders (kept-files.ts): written on a save and again on
// the next, read back when changed outside the app (both kept when the app changed too, set aside when it cannot be
// read), renamed with an automatic name only, moved with a project change (and into a folder asked for), trashed when
// the thing leaves every project or is deleted, followed through Files' renames and deletes, left as plain files when
// the project goes; media copied, or adopted from inside the folder (the user's own then: never trashed or moved);
// listings that say which files they are; agents' projectFolder and the folder they work in; LaTeX projects as folders;
// HTML pages that come back as they were; and the backfill. Through the routes and tools, with the engine's waits made
// short. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/spaces/kept-files-test.ts
//   DATA_DIR=/tmp/hydor-test-keptfiles node dist/dev/kept-files-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { listDir, renamePath, deletePath, listTrash, type FsEntry } from '../files.ts';
import { media } from '../media/index.ts';
import { setCaptionChoice } from '../media/caption.ts';
import { getMedia, listMedia, setCaption } from '../media/store.ts';
import { listMediaVersions } from '../media/versions.ts';
import { replaceInLibrary } from '../mediaedit/index.ts';
import { exportPage, FILE_HEAD_START } from '../pages/export.ts';
import { pages } from '../pages/index.ts';
import { putAsset } from '../pages/assets.ts';
import { createPage, pageInfo, pageSource, putValues, versionsOf } from '../pages/store.ts';
import { pictureAddress } from '../pages/kept-pictures.ts';
import { annotateKept, keptFilesDeleted, keptFilesMoved, startKeptFiles } from './kept-files.ts';
import { createSpace, spaces } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-kept-test-')));
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
const told: { id: string; data: any }[] = [];
const deps = {
  app,
  db,
  sessions: { deliverOrQueue: async () => {}, queueSummary() {}, on() {} },
  models: { agentModels: () => [], ensure: async () => null },
  broadcast: (m: any) => told.push(m),
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
pages.routes!(deps);
media.routes!(deps);
spaces.routes!(deps);
await app.ready();
// No model writes titles here: nothing leaves this computer, and nothing of it runs a model.
setCaptionChoice(db, { provider: 'ollama' });
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
const run = async (name: string, args: Record<string, unknown>): Promise<{ text: string; error: string }> => {
  try {
    const r = await tools[name].run(args, ctx);
    return { text: typeof r === 'string' ? r : r.text, error: '' };
  } catch (e) {
    return { text: '', error: (e as Error).message };
  }
};
const idOf = (text: string) => /\(page ([a-f0-9]{10})/.exec(text)?.[1] ?? '';
const page = (id: string) => pageInfo(db, id)!;
const fileOf = (id: string) => page(id).projectFile ?? '';
const there = (p: string) => !!p && fs.existsSync(p);
const text = (id: string) => pageSource(db, id)!.text;
const inTrash = async (name: string) => (await listTrash()).items.some((i) => i.name === name);

/** The folder of a new project. */
const project = (name: string) => {
  const folder = path.join(tmp, name);
  fs.mkdirSync(folder, { recursive: true });
  return { id: createSpace(db, { name, folder }).id, folder };
};
const lab = project('Lab');
const other = project('Other');

const engine = startKeptFiles(deps, { debounceMs: 20, sweepMs: 0, settleMs: 0, backfillMs: 0, backfillGapMs: 0 });
const idle = () => engine.idle();
/** A look at the files, and what it sets off. */
const sweep = async () => {
  await engine.sweep();
  await idle();
};
/** The Word file a document of these words would be, made and then thrown away. */
const docxOf = async (words: string) => {
  const p = createPage(db, { title: 'Scratch', kind: 'doc', model: { blocks: [{ type: 'p', text: words }] }, by: 'made' });
  const out = await exportPage(db, p.id, { format: 'docx' });
  await req('DELETE', `/api/pages/${p.id}`);
  return out.data;
};
/** Writes over a file as another program would, its change time its own. */
const outside = (file: string, data: Buffer | string) => {
  fs.writeFileSync(file, data);
  const at = new Date(Date.now() - 5000 + Math.floor(Math.random() * 3000));
  fs.utimesSync(file, at, at);
};
const words = (file: string) => fs.readFileSync(file, 'utf8');

// ---- a document: written, written again, read back -------------------------------------------------------------
const saved = await run('save_doc', { title: 'Report', markdown: 'First words.', project: 'Lab' });
const doc = idOf(saved.text);
ok(fileOf(doc) === path.join(lab.folder, 'Report.docx') && there(fileOf(doc)), `a doc saved in a project gets <title>.docx: ${saved.text} ${saved.error}`);
ok(saved.text.includes(`Its file in the project’s folder: ${fileOf(doc)}`), 'the save says its file');
ok((await run('get_page', {})).text.includes(`· its file: ${fileOf(doc)}`), 'get_page lists the file');
const first = fs.readFileSync(fileOf(doc));
await run('save_doc', { id: doc, markdown: 'Second words, quite different from the first ones.' });
await idle();
ok(!fs.readFileSync(fileOf(doc)).equals(first) && fs.readdirSync(lab.folder).join() === 'Report.docx', 'a second save writes the same file again');
ok(told.some((e) => e.id === 'pages'), 'the pages hear of the file');
const before = page(doc).version;
await sweep();
ok(page(doc).version === before, 'a file the app wrote is not read back');

outside(fileOf(doc), await docxOf('Changed in Word.'));
const written = fs.readFileSync(fileOf(doc));
await sweep();
ok(page(doc).version === before + 1 && page(doc).by === 'file' && text(doc).includes('Changed in Word.'), `an outside edit comes back as a version by "file": ${page(doc).version} ${page(doc).by}`);
ok(fs.readFileSync(fileOf(doc)).equals(written), 'and the file is left as it is');
const touched = new Date(Date.now() - 1000);
fs.utimesSync(fileOf(doc), touched, touched);
await sweep();
ok(page(doc).version === before + 1, 'a file only touched makes no version');

// both changed: the app's stays current, the file's is kept
outside(fileOf(doc), await docxOf('Their words.'));
await req('POST', `/api/pages/${doc}/versions`, { model: { blocks: [{ type: 'p', text: 'Our words.' }] }, base: page(doc).version, force: true });
await idle();
const list = versionsOf(db, doc);
const theirs = list.find((v) => v.by === 'file' && v.version > before + 1);
ok(text(doc).includes('Our words.') && page(doc).by === 'restore', `both changed: the app's is current (${page(doc).by})`);
ok(!!theirs && pageSource(db, doc, theirs.version)!.text.includes('Their words.'), 'and the file’s is kept as a version');
const back = (await req('POST', '/api/pages/import', { path: fileOf(doc), title: 'Check' })).json().page;
ok(text(back.id).includes('Our words.'), 'the file holds the app’s again');
ok(await inTrash('Report.docx'), 'with a copy of the outside one in the Trash');
await req('DELETE', `/api/pages/${back.id}`);

// unreadable: set aside, written anew
outside(fileOf(doc), 'not a word file at all');
await sweep();
const aside = path.join(lab.folder, 'Report (changed outside Hydor).docx');
ok(there(aside) && words(aside) === 'not a word file at all', 'a file that cannot be read back is set aside');
ok(there(fileOf(doc)) && fs.readFileSync(fileOf(doc)).subarray(0, 2).toString() === 'PK', 'and written anew');
fs.rmSync(aside);

// ---- names ------------------------------------------------------------------------------------------------------
const old = fileOf(doc);
await req('PATCH', `/api/pages/${doc}`, { title: 'Annual report' });
await idle();
ok(fileOf(doc) === path.join(lab.folder, 'Annual report.docx') && there(fileOf(doc)) && !there(old), `a title rename renames an auto-named file: ${fileOf(doc)}`);
const twin = idOf((await run('save_doc', { title: 'Annual report', markdown: 'Another.', project: 'Lab' })).text);
ok(fileOf(twin) === path.join(lab.folder, 'Annual report 2.docx'), `a taken name gets a number: ${fileOf(twin)}`);
const mine = path.join(lab.folder, 'mine.docx');
const from = fileOf(doc);
await renamePath(from, mine);
keptFilesMoved(deps, from, mine);
ok(fileOf(doc) === mine, 'a rename in Files is followed');
await req('PATCH', `/api/pages/${doc}`, { title: 'Final report' });
await idle();
ok(fileOf(doc) === mine && there(mine), 'a file the user named keeps its name');

// ---- folders, projects, trash ------------------------------------------------------------------------------------
const sub = path.join(other.folder, 'deep');
fs.mkdirSync(sub);
const bad = await req('PATCH', `/api/pages/${twin}`, { space: other.id, dir: lab.folder });
ok(bad.statusCode === 400 && /dir:/.test(bad.json().error) && page(twin).space === lab.id, `a dir outside the project is refused before anything changes: ${bad.body}`);
const was = fileOf(twin);
const moved = await req('PATCH', `/api/pages/${twin}`, { space: other.id, dir: sub });
ok(moved.statusCode === 200 && moved.json().page.projectFile === path.join(sub, 'Annual report.docx') && !there(was), `moving to another project with dir moves the file: ${moved.body}`);
const top = await req('PATCH', `/api/pages/${twin}`, { dir: other.folder });
ok(top.json().page?.projectFile === path.join(other.folder, 'Annual report.docx'), `dir alone moves the file: ${top.body}`);
const none = await req('PATCH', `/api/pages/${twin}`, { space: null });
await idle();
ok(none.statusCode === 200 && !fileOf(twin) && !there(path.join(other.folder, 'Annual report.docx')) && (await inTrash('Annual report.docx')), 'moving to no project trashes the file');
await req('PATCH', `/api/pages/${twin}`, { space: lab.id });
const twinFile = fileOf(twin);
ok(there(twinFile), 'back in a project it has a file again');
await req('DELETE', `/api/pages/${twin}`);
await idle();
ok(!there(twinFile) && (await inTrash(path.basename(twinFile))), 'deleting trashes the file');

// ---- missing, and Files' deletes ---------------------------------------------------------------------------------
fs.rmSync(fileOf(doc));
await sweep();
ok(fileOf(doc) === mine, 'missing once, it is still the file');
await sweep();
ok(!fileOf(doc) && page(doc).space === lab.id, 'missing twice, it is forgotten and the doc stays in its project');
await run('save_doc', { id: doc, markdown: 'After it went missing.' });
await idle();
ok(there(fileOf(doc)) && fileOf(doc) === path.join(lab.folder, 'Final report.docx'), `it gets a fresh file at its next change: ${fileOf(doc)}`);

const gone = fileOf(doc);
await deletePath(gone);
keptFilesDeleted(deps, gone);
await idle();
ok(!page(doc).space && !fileOf(doc), 'a delete in Files takes the doc out of its project, not away');

// moved in Files into another project's folder, then out of every project's
await req('PATCH', `/api/pages/${doc}`, { space: lab.id });
const a = fileOf(doc);
const b = path.join(other.folder, path.basename(a));
await renamePath(a, b);
keptFilesMoved(deps, a, b);
ok(page(doc).space === other.id && fileOf(doc) === b, 'a move in Files into another project’s folder takes the doc there');
const c = path.join(tmp, path.basename(b));
await renamePath(b, c);
keptFilesMoved(deps, b, c);
ok(!page(doc).space && !fileOf(doc) && there(c), 'moved out of every project’s folder, it leaves its project');

// a project deleted: plain files
const temp = project('Temp');
const keptThere = idOf((await run('save_doc', { title: 'Stays', markdown: 'Here.', project: 'Temp' })).text);
const stays = fileOf(keptThere);
ok(there(stays), 'a doc in a project to be deleted');
await req('DELETE', `/api/projects/${temp.id}`);
await idle();
await sweep();
ok(there(stays) && !page(keptThere).space && !fileOf(keptThere), 'a deleted project leaves plain files');

// ---- other kinds -------------------------------------------------------------------------------------------------
const sheet = idOf((await run('save_sheet', { title: 'Budget', sheets: [{ name: 'S', rows: [['a', 'b'], [1, 2]] }], project: 'Lab' })).text);
ok(fileOf(sheet).endsWith('Budget.xlsx') && there(fileOf(sheet)), 'a spreadsheet as .xlsx');
const board = await run('save_board', { title: 'Numbers', project: 'Lab', cards: [] });
const boardId = idOf(board.text) || createPage(db, { title: 'Numbers', kind: 'board', model: { format: 1, cards: [] }, by: 'made', space: lab.id }).id;
await idle();
ok(!fileOf(boardId) && !fs.readdirSync(lab.folder).some((n) => n.startsWith('Numbers')), 'a board gets no file');
const nb = idOf((await run('save_notebook', { title: 'Analysis', cells: ['print(1)'] })).text);
ok(!fileOf(nb), 'a thing in no project has no file');
await req('PATCH', `/api/pages/${nb}`, { space: lab.id });
ok(fileOf(nb).endsWith('Analysis.ipynb') && there(fileOf(nb)), 'put in a project, it gets one');

// a deck: web format as HTML (never read back), PowerPoint format as .pptx
const web = idOf((await run('save_slides', { title: 'Talk', slides: [{ title: 'Hello' }], project: 'Lab' })).text);
ok(fileOf(web).endsWith('Talk.html'), `a web deck as HTML: ${fileOf(web)}`);
const webVersion = page(web).version;
outside(fileOf(web), '<!doctype html><p>mine</p>');
await sweep();
ok(page(web).version === webVersion && there(path.join(lab.folder, 'Talk (changed outside Hydor).html')) && words(fileOf(web)).length > 1000, 'a web deck’s file is set aside, never read back');
const ppt = idOf((await run('save_slides', { title: 'Deck', format: 'pptx', slides: [{ title: 'One' }], project: 'Lab' })).text);
ok(fileOf(ppt).endsWith('Deck.pptx'), `a PowerPoint deck as .pptx: ${fileOf(ppt)}`);

// an HTML page: out and back, the same
const asset = putAsset(db, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const source = `<!doctype html><html><body class="n-page"><img src="${pictureAddress(asset)}"><div class="n-db" data-db="t"></div><p>Original</p></body></html>`;
const html = idOf((await run('save_page', { title: 'Tracker', html: source, project: 'Lab' })).text);
const htmlFile = fileOf(html);
const out = words(htmlFile);
ok(htmlFile.endsWith('Tracker.html') && out.includes(FILE_HEAD_START) && out.includes('data:image/png;base64,'), 'a page as HTML, its picture inside');
outside(htmlFile, out.replace('Original', 'Edited'));
await sweep();
ok(text(html) === source.replace('Original', 'Edited') && page(html).by === 'file', `an HTML page comes back without what was added: ${text(html).slice(0, 300)}`);
const v = page(html).version;
putValues(db, html, [['n-db:t', JSON.stringify({ rows: [{ id: 'r1', cells: { x: 'marker-row' } }] })]]);
await idle();
ok(words(htmlFile).includes('marker-row') && page(html).version === v, 'rows added to its database show in its file');

// ---- LaTeX --------------------------------------------------------------------------------------------------------
const main = '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}\n';
const tex = idOf((await run('save_latex', { title: 'Paper', source: main, project: 'Lab' })).text);
ok(fileOf(tex) === path.join(lab.folder, 'Paper.tex') && words(fileOf(tex)) === main, `only main text: a .tex file: ${fileOf(tex)}`);
outside(fileOf(tex), main.replace('Hello', 'Hello again'));
await sweep();
ok(text(tex).includes('Hello again') && page(tex).by === 'file', 'a .tex file read back');
const oneFile = fileOf(tex);
await run('save_latex', { id: tex, files: { 'refs.bib': '@book{x, title={X}}\n' } });
await idle();
const dir = fileOf(tex);
ok(dir === path.join(lab.folder, 'Paper') && fs.statSync(dir).isDirectory() && there(path.join(dir, 'main.tex')) && there(path.join(dir, 'refs.bib')) && !there(oneFile), `with files, a folder: ${dir}`);
fs.writeFileSync(path.join(dir, 'main.aux'), 'aux');
const texVersion = page(tex).version;
await sweep();
ok(page(tex).version === texVersion, 'what LaTeX leaves in the folder changes nothing');
outside(path.join(dir, 'refs.bib'), '@book{y, title={Why}}\n');
await sweep();
ok(text(tex).includes('Why') && page(tex).version === texVersion + 1 && page(tex).by === 'file', 'a file in the folder read back');
const picAsset = `naget-asset:${asset}`;
const pic = createPage(db, { title: 'Figures', kind: 'tex', model: { v: 1, engine: 'pdflatex', main: main.replace('Hello', '\\includegraphics{fig.png}'), files: [], pictures: [{ name: 'fig.png', src: picAsset }] }, by: 'made', space: lab.id });
await idle();
ok(fileOf(pic.id) && there(path.join(fileOf(pic.id), 'fig.png')) && there(path.join(fileOf(pic.id), 'main.tex')), 'tex with pictures becomes a folder');
await req('DELETE', `/api/pages/${pic.id}`);

// ---- projectFolder ------------------------------------------------------------------------------------------------
const deep = await run('save_doc', { title: 'Notes', markdown: 'n', project: 'Lab', projectFolder: 'reports/2026' });
const notes = idOf(deep.text);
ok(fileOf(notes) === path.join(lab.folder, 'reports', '2026', 'Notes.docx') && deep.text.includes(fileOf(notes)), `projectFolder on save_doc: ${deep.text} ${deep.error}`);
await run('save_doc', { id: notes, markdown: 'n again' });
await idle();
ok(fileOf(notes) === path.join(lab.folder, 'reports', '2026', 'Notes.docx'), 'left out, an existing file stays where it is');
await run('save_doc', { id: notes, projectFolder: 'reports' });
ok(fileOf(notes) === path.join(lab.folder, 'reports', 'Notes.docx'), `projectFolder alone moves it: ${fileOf(notes)}`);
for (const wrong of ['../x', '/etc', 'a/../../b', '~/x'])
  ok(/projectFolder:/.test((await run('save_doc', { title: 'No', markdown: 'n', project: 'Lab', projectFolder: wrong })).error), `projectFolder ${wrong} is refused`);
ok(!fs.existsSync(path.join(lab.folder, 'No.docx')), 'and nothing was saved');
const props = (n: string) => (tools[n].inputSchema as { properties: Record<string, { description?: string }> }).properties;
ok(['save_page', 'save_slides', 'save_doc', 'save_sheet', 'save_latex', 'save_notebook', 'save_diagram'].every((n) => props(n).projectFolder) && !props('save_board').projectFolder, 'the save tools but save_board take projectFolder');
const made = (await req('POST', '/api/pages', { kind: 'doc', title: 'In reports', space: lab.id, dir: path.join(lab.folder, 'reports') })).json().page;
await idle();
ok(fileOf(made.id) === path.join(lab.folder, 'reports', 'In reports.docx'), `POST /api/pages with dir: ${fileOf(made.id)}`);
ok((await req('POST', '/api/pages', { kind: 'doc', title: 'x', space: lab.id, dir: tmp })).statusCode === 400, 'POST /api/pages refuses a dir outside');
ok((await req('POST', '/api/pages', { kind: 'doc', title: 'x', dir: tmp })).statusCode === 400, 'and a dir with no project');
const mdFile = path.join(lab.folder, 'source.md');
fs.writeFileSync(mdFile, '# From a file\n\nWords.');
const imported = (await req('POST', '/api/pages/import', { path: mdFile, space: lab.id, dir: path.join(lab.folder, 'reports') })).json().page;
await idle();
ok(fileOf(imported.id) === path.join(lab.folder, 'reports', 'source.docx') && words(mdFile) === '# From a file\n\nWords.', 'an imported page gets a file of its own');

// ---- media --------------------------------------------------------------------------------------------------------
const png = (w: number) => {
  const b = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
  b.writeUInt32BE(w, 16);
  return b;
};
const elsewhere = path.join(tmp, 'boat.png');
fs.writeFileSync(elsewhere, png(2));
const kept = (await req('POST', '/api/media', { path: elsewhere, space: lab.id, prompt: 'A red boat' })).json().item;
await idle();
const m = () => getMedia(db, kept.id)!;
ok(m().projectFile === path.join(lab.folder, `${m().title}.png`) && fs.readFileSync(m().projectFile!).equals(png(2)), `a kept picture is copied into the project: ${m().projectFile}`);
ok(told.some((e) => e.id === 'media' && e.data.item?.projectFile), 'the media pages hear of the file');
setCaption(db, kept.id, { title: 'Boat on a pond', caption: 'done' });
await idle();
ok(m().projectFile === path.join(lab.folder, 'Boat on a pond.png') && there(m().projectFile!), `a caption's title renames it: ${m().projectFile}`);
outside(m().projectFile!, png(3));
await sweep();
ok(m().width === 3 && fs.readFileSync(m().file).equals(png(3)) && m().versions === 1, `a picture changed outside is a new version: ${m().width} ${m().versions}`);
outside(m().projectFile!, 'garbage');
await sweep();
ok(m().width === 3 && there(path.join(lab.folder, 'Boat on a pond (changed outside Hydor).png')) && fs.readFileSync(m().projectFile!).equals(png(3)), 'an unreadable picture is set aside and written anew');

const inside = path.join(lab.folder, 'photo.png');
fs.writeFileSync(inside, png(5));
const own = (await req('POST', '/api/media', { path: inside, space: lab.id })).json().item;
await idle();
ok(own.projectFile === inside && !fs.readdirSync(lab.folder).some((n) => n !== 'photo.png' && n.startsWith('photo')), `a file from inside the folder is adopted, not copied: ${own.projectFile}`);
setCaption(db, own.id, { title: 'A new title', caption: 'done' });
await idle();
ok(getMedia(db, own.id)!.projectFile === inside && there(inside), 'an adopted file keeps its name');
const second = path.join(tmp, 'second.png');
fs.writeFileSync(second, png(7));
const placed = (await req('POST', '/api/media', { path: second, space: lab.id, dir: path.join(lab.folder, 'reports') })).json().item;
await idle();
ok(path.dirname(getMedia(db, placed.id)!.projectFile!) === path.join(lab.folder, 'reports'), 'POST /api/media with dir');
const mm = await req('PATCH', `/api/media/${placed.id}`, { space: other.id });
ok(path.dirname(mm.json().item.projectFile) === other.folder, `a media item moved to another project takes its file: ${mm.body}`);
const mf = mm.json().item.projectFile;
await req('DELETE', `/api/media/${placed.id}`);
await idle();
ok(!there(mf), 'a deleted media item’s file is trashed');

// the picture editor writes over it: the file follows, in its new format
const edited = png(11);
await replaceInLibrary(deps, own.id, edited, 'png');
await idle();
ok(fs.readFileSync(inside).equals(edited), 'a picture saved over in the app is written to its file');
// both changed: the app's stays, the file's is kept as an earlier version
outside(inside, png(13));
await replaceInLibrary(deps, own.id, png(17), 'png');
await idle();
const o = getMedia(db, own.id)!;
ok(o.width === 17 && fs.readFileSync(inside).equals(png(17)), `both changed: the app's picture stays: ${o.width}`);
ok(listMediaVersions(db, own.id).some((x) => x.width === 13), 'and the file’s is an earlier version of it');
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
await replaceInLibrary(deps, own.id, jpeg, 'jpeg');
await idle();
const asJpeg = path.join(lab.folder, 'photo.jpg');
ok(getMedia(db, own.id)!.projectFile === asJpeg && there(asJpeg) && !getMedia(db, own.id)!.projectFileAdopted, `saved in another format, the item gets a file of that kind: ${getMedia(db, own.id)!.projectFile}`);
ok(fs.readFileSync(inside).equals(png(17)), 'and the user’s own file stays as it was');
await replaceInLibrary(deps, own.id, png(5), 'png');
await idle();
ok(getMedia(db, own.id)!.projectFile === path.join(lab.folder, 'photo 2.png') && !there(asJpeg) && there(inside), `the app’s own file changes format as any other: ${getMedia(db, own.id)!.projectFile}`);

// ---- adopted files are the user’s own: never trashed or moved ------------------------------------------------------
/** A picture of the user’s own in a project’s folder, kept. */
const adopted = async (where: { id: string; folder: string }, name: string, w: number) => {
  const file = path.join(where.folder, name);
  fs.writeFileSync(file, png(w));
  const item = (await req('POST', '/api/media', { path: file, space: where.id })).json().item;
  await idle();
  ok(item.projectFile === file && item.projectFileAdopted === true, `${name} is adopted: ${item.projectFile}`);
  return { file, id: item.id as string, now: () => getMedia(db, item.id)! };
};
const del = await adopted(lab, 'mine-delete.png', 21);
await req('DELETE', `/api/media/${del.id}`);
await idle();
ok(there(del.file) && !(await inTrash('mine-delete.png')), 'deleting the item leaves an adopted file');
const out2 = await adopted(lab, 'mine-none.png', 23);
await req('PATCH', `/api/media/${out2.id}`, { space: null });
await idle();
ok(there(out2.file) && !out2.now().projectFile && !out2.now().projectFileAdopted && !(await inTrash('mine-none.png')), 'taking it out of its project leaves it too');
const gonePlace = project('Gone');
const proj = await adopted(gonePlace, 'mine-project.png', 25);
await req('DELETE', `/api/projects/${gonePlace.id}`);
await idle();
await sweep();
ok(there(proj.file) && !proj.now().projectFile && !proj.now().space, 'and so does deleting the project');
const mv = await adopted(lab, 'mine-move.png', 27);
const movedItem = (await req('PATCH', `/api/media/${mv.id}`, { space: other.id })).json().item;
const copy = path.join(other.folder, `${movedItem.title}.png`);
ok(movedItem.projectFile === copy && !movedItem.projectFileAdopted && fs.readFileSync(copy).equals(png(27)) && there(mv.file), `moved to another project, it is copied there and the original stays: ${movedItem.projectFile}`);
await req('DELETE', `/api/media/${mv.id}`);
await idle();
ok(!there(copy) && there(mv.file), 'the copy is the app’s own: trashed with the item, the original left');
const into = await adopted(lab, 'mine-dir.png', 29);
const sorted = path.join(lab.folder, 'sorted');
fs.mkdirSync(sorted);
const putThere = (await req('PATCH', `/api/media/${into.id}`, { dir: sorted })).json().item;
ok(path.dirname(putThere.projectFile) === sorted && !putThere.projectFileAdopted && there(into.file), `into another folder: a copy, the original left: ${putThere.projectFile}`);
const broken = await adopted(lab, 'mine-broken.png', 31);
outside(broken.file, 'not a picture any more');
await sweep();
ok(words(broken.file) === 'not a picture any more' && !fs.readdirSync(lab.folder).some((n) => n.startsWith('mine-broken (changed')), 'changed into something unreadable, it keeps its name and place');
ok(!!broken.now().projectFile && broken.now().projectFile !== broken.file && !broken.now().projectFileAdopted && fs.readFileSync(broken.now().projectFile!).equals(png(31)), `and the item gets a file of its own: ${broken.now().projectFile}`);
const renamedOwn = await adopted(lab, 'mine-renamed.png', 33);
const renamedTo = path.join(lab.folder, 'mine-again.png');
await renamePath(renamedOwn.file, renamedTo);
keptFilesMoved(deps, renamedOwn.file, renamedTo);
ok(renamedOwn.now().projectFile === renamedTo && renamedOwn.now().projectFileAdopted === true, 'renamed in Files, it is still the user’s');

// ---- an agent working in a subfolder of the project saves there ----------------------------------------------------
const agentDir = path.join(lab.folder, 'agent', 'work');
fs.mkdirSync(agentDir, { recursive: true });
const runIn = async (cwd: string, args: Record<string, unknown>, name = 'save_doc') => {
  const r = await tools[name].run(args, { ...ctx, cwd });
  return typeof r === 'string' ? r : r.text;
};
const here = idOf(await runIn(agentDir, { title: 'From the subfolder', markdown: 'x', project: 'Lab' }));
ok(fileOf(here) === path.join(agentDir, 'From the subfolder.docx'), `a new save from a subfolder goes there: ${fileOf(here)}`);
await runIn(lab.folder, { id: here, markdown: 'y' });
await idle();
ok(fileOf(here) === path.join(agentDir, 'From the subfolder.docx'), 'and stays there when saved again from elsewhere');
const topped = idOf(await runIn(agentDir, { title: 'Asked for the top', markdown: 'x', project: 'Lab', projectFolder: '.' }));
ok(fileOf(topped) === path.join(lab.folder, 'Asked for the top.docx'), `projectFolder wins over the working folder: ${fileOf(topped)}`);
const older = idOf(await runIn(lab.folder, { title: 'Made at the top', markdown: 'x', project: 'Lab' }));
await runIn(agentDir, { id: older, markdown: 'again' });
await idle();
ok(fileOf(older) === path.join(lab.folder, 'Made at the top.docx'), 'an existing file does not move to the working folder');
const away = idOf(await runIn(tmp, { title: 'From outside', markdown: 'x', project: 'Lab' }));
ok(fileOf(away) === path.join(lab.folder, 'From outside.docx'), 'a working folder outside the project: at its top');
const page2 = idOf(await runIn(agentDir, { title: 'Counter', html: '<!doctype html><p>c</p>', project: 'Lab' }, 'save_page'));
const sheet2 = idOf(await runIn(agentDir, { title: 'Sums', sheets: [{ name: 'S', rows: [[1]] }], project: 'Lab' }, 'save_sheet'));
ok(fileOf(page2) === path.join(agentDir, 'Counter.html') && fileOf(sheet2) === path.join(agentDir, 'Sums.xlsx'), `so do save_page and save_sheet: ${fileOf(page2)} ${fileOf(sheet2)}`);

// ---- the other kinds read back ------------------------------------------------------------------------------------
const kinds: [string, string, unknown, unknown, string][] = [
  ['sheet', 'xlsx', { sheets: [{ name: 'S', base: { cells: { A1: 'before' } } }] }, { sheets: [{ name: 'S', base: { cells: { A1: 'afterwards' } } }] }, 'afterwards'],
  ['slides', 'pptx', { format: 'pptx', slides: [{ els: [{ type: 'text', x: 80, y: 60, w: 900, h: 120, text: 'before' }] }] }, { format: 'pptx', slides: [{ els: [{ type: 'text', x: 80, y: 60, w: 900, h: 120, text: 'afterwards' }] }] }, 'afterwards'],
  ['notebook', 'ipynb', { cells: [{ cell_type: 'code', source: 'before', metadata: {}, outputs: [], execution_count: null }], metadata: {}, nbformat: 4, nbformat_minor: 5 }, { cells: [{ cell_type: 'code', source: 'afterwards', metadata: {}, outputs: [], execution_count: null }], metadata: {}, nbformat: 4, nbformat_minor: 5 }, 'afterwards'],
  ['diagram', 'drawio', { pages: [{ id: 'p1', name: 'One', items: [{ id: 'a', type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 60, text: 'before' }] }] }, { pages: [{ id: 'p1', name: 'One', items: [{ id: 'a', type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 60, text: 'afterwards' }] }] }, 'afterwards'],
];
for (const [kind, ext, was, now, marker] of kinds) {
  const p = createPage(db, { title: `Round ${kind}`, kind: kind as 'sheet', model: was, by: 'made', space: lab.id });
  await idle();
  const scratch = createPage(db, { title: 'Scratch', kind: kind as 'sheet', model: now, by: 'made' });
  const changedFile = (await exportPage(db, scratch.id, { format: ext as 'xlsx' })).data;
  await req('DELETE', `/api/pages/${scratch.id}`);
  const f = fileOf(p.id);
  ok(f === path.join(lab.folder, `Round ${kind}.${ext}`), `a ${kind} gets a .${ext}: ${f}`);
  outside(f, changedFile);
  await sweep();
  ok(page(p.id).by === 'file' && page(p.id).version === 2 && text(p.id).includes(marker) && fileOf(p.id) === f && fs.readFileSync(f).equals(changedFile), `a ${kind}’s file is read back: ${page(p.id).by} ${page(p.id).version} ${fileOf(p.id)}`);
}

// a file changed outside is taken in before the app writes over it, with no look in between
const raced = createPage(db, { title: 'Raced', kind: 'doc', model: { blocks: [{ type: 'p', text: 'one' }] }, by: 'made', space: lab.id });
await idle();
outside(fileOf(raced.id), await docxOf('written outside meanwhile'));
await req('PATCH', `/api/pages/${raced.id}`, { title: 'Raced on' });
await idle();
ok(versionsOf(db, raced.id).some((x) => x.by === 'file') && text(raced.id).includes('written outside meanwhile'), 'a pending outside edit comes in before the app writes');

// a name that is not plain letters, in the rename hooks
const emoji = path.join(lab.folder, '🚀 plans');
fs.mkdirSync(emoji);
await req('PATCH', `/api/pages/${raced.id}`, { dir: emoji });
const emoji2 = path.join(lab.folder, '🚀 later');
await renamePath(emoji, emoji2);
keptFilesMoved(deps, emoji, emoji2);
ok(fileOf(raced.id) === path.join(emoji2, 'Raced on.docx'), `a folder with such a name is followed: ${fileOf(raced.id)}`);

// ---- listings -------------------------------------------------------------------------------------------------------
const listing = await listDir(lab.folder);
annotateKept(db, listing.path, listing.entries);
const entry = (name: string): FsEntry | undefined => listing.entries.find((e) => e.name === name);
ok(entry('Budget.xlsx')?.kept?.id === sheet && entry('Budget.xlsx')?.kept?.kind === 'sheet' && entry('Budget.xlsx')?.kept?.type === 'page', 'a listing says which files are kept pages');
ok(entry('photo 2.png')?.kept?.type === 'media' && entry('photo 2.png')?.kept?.kind === 'image' && !entry('photo.png')?.kept && entry('Tracker.html')?.kept?.kind === 'page' && entry('Paper')?.kept?.id === tex, 'and media, pages and LaTeX folders');
ok(!entry('source.md')?.kept && !entry('reports')?.kept, 'and not the others');
const inPaper = await listDir(path.join(lab.folder, 'Paper'));
annotateKept(db, inPaper.path, inPaper.entries);
ok(inPaper.entries.find((e) => e.name === 'main.tex')?.kept?.id === tex && !inPaper.entries.find((e) => e.name === 'refs.bib')?.kept, 'in a LaTeX folder, its main.tex is the document');

// a folder renamed and deleted in Files
const reports = path.join(lab.folder, 'reports');
const papers = path.join(lab.folder, 'papers');
await renamePath(reports, papers);
keptFilesMoved(deps, reports, papers);
ok(fileOf(notes) === path.join(papers, 'Notes.docx') && page(notes).space === lab.id, 'a folder renamed in Files takes its things’ files along');
await deletePath(papers);
keptFilesDeleted(deps, papers);
ok(!page(notes).space && !fileOf(notes) && !page(made.id).space, 'a folder deleted in Files takes its things out of the project');

// ---- backfill ---------------------------------------------------------------------------------------------------------
engine.stop();
const later = project('Later');
const b1 = createPage(db, { title: 'Waiting', kind: 'doc', model: { blocks: [{ type: 'p', text: 'w' }] }, by: 'made', space: later.id });
const already = path.join(later.folder, 'already.png');
fs.writeFileSync(already, png(9));
// Kept while nothing watched the files: media whose source is in the folder.
const b2 = (await req('POST', '/api/media', { path: already, space: later.id })).json().item;
ok(!pageInfo(db, b1.id)!.projectFile && !getMedia(db, b2.id)!.projectFile, 'without the engine nothing is written');
const again = startKeptFiles(deps, { debounceMs: 20, sweepMs: 0, settleMs: 0, backfillMs: 0, backfillGapMs: 0 });
const done = await again.backfill();
await again.idle();
ok(pageInfo(db, b1.id)!.projectFile === path.join(later.folder, 'Waiting.docx') && there(path.join(later.folder, 'Waiting.docx')), 'the backfill writes what has no file');
ok(getMedia(db, b2.id)!.projectFileAdopted === true, 'a file the backfill takes is the user’s own');
ok(getMedia(db, b2.id)!.projectFile === already && done.adopted >= 1 && done.written >= 1 && !done.failed, `and takes a file that is already there: ${JSON.stringify(done)}`);
const repeat = await again.backfill();
ok(!repeat.written && !repeat.adopted, `a second time there is nothing to do: ${JSON.stringify(repeat)}`);
ok(listMedia(db).length >= 3, 'the media are all still there');
again.stop();

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} failed, ${passed} passed` : `all ${passed} passed`);
process.exit(failed ? 1 : 0);
