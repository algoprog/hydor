// A template as a folder of files, to work on in any editor or with a coding agent (Claude Code or Codex in a
// session opened on it). app.json says what it asks, does, gives back and keeps; each step's instructions are a
// Markdown file in instructions/, each code step a file in steps/ (JavaScript or Python), each screen a page in
// screens/, and graph.json says where its steps sit in the graph. .naget/ has the schema of app.json and the
// types of a code step, for an editor's completion and checks.
//
// Once made, the folder is watched: a change that checks out is saved as a version by its folder (the editor
// shows it), a mistake is said in words and changes nothing, and a save made elsewhere (the editor, an agent)
// writes the folder again. Its data stays in the app's database, not in the folder.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Flow, Step } from '../../shared/app-manifest.ts';
import { allSteps, titleOf } from '../../shared/app-manifest.ts';
import type { AppDef, AppRecipe } from '../../shared/apps.ts';
import { cleanRecipe } from '../../shared/apps.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { pageSource } from '../pages/store.ts';
import { appSchema, STEP_TYPES } from './schema.ts';
import { changeScreen } from './screens.ts';
import { coreOf, getApp, listApps, saveApp } from './store.ts';

export const APP_FILE = 'app.json';

/** Where a template's folder goes unless another is picked. */
export const defaultFolder = (slug: string) => path.join(config.home, 'Naget', 'Templates', slug);

type Files = Record<string, string>;
type FileRef = { file: string };

const isRef = (v: unknown): v is FileRef => !!v && typeof v === 'object' && typeof (v as FileRef).file === 'string';
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const indent = (t: string, by: string) =>
  t
    .split('\n')
    .map((l) => (l ? by + l : l))
    .join('\n');
const dedent = (t: string, by: number) =>
  t
    .split('\n')
    .map((l) => (l.startsWith(' '.repeat(by)) ? l.slice(by) : l.trimStart() === '' ? '' : l))
    .join('\n');

/** A code step as a file: the body of its function, inside the function an editor can check (with ctx's types). */
function codeFile(s: Extract<Step, { do: 'code' }>, app: string): string {
  const head = `“${titleOf(s)}”, a step of the template “${app}”: it gets input (the values it is given) and returns the step's values; ctx (.naget/step.d.ts) asks models, agents, tools and people, each call a step of the run.`;
  if (s.language === 'python') return `# ${head}\ndef step(input, ctx):\n${indent(s.code, '    ')}\n`;
  if (s.language === 'typescript') return `// ${head}\nimport type { Ctx, StepInput } from '../.naget/step';\n\nexport default async function step(input: StepInput, ctx: Ctx) {\n${indent(s.code, '  ')}\n}\n`;
  return `// ${head}\n// @ts-check\n/** @param {import('../.naget/step').StepInput} input @param {import('../.naget/step').Ctx} ctx */\nexport default async function step(input, ctx) {\n${indent(s.code, '  ')}\n}\n`;
}

/** The body of a code step's file (null: its function is not there as the file began with it). */
function codeOf(text: string, python: boolean): string | null {
  if (python) {
    const m = /^def step\(input(?:\s*,\s*ctx)?\)(?:\s*->[^:]+)?:[ \t]*\r?\n([\s\S]*)$/m.exec(text);
    return m ? dedent(m[1].replace(/\s+$/, ''), 4) : null;
  }
  const m = /export default async function step\s*\(([^)]*)\)\s*(?::[^{]+)?\{[ \t]*\r?\n([\s\S]*)\r?\n\}\s*$/.exec(text);
  return m && /^\s*input\b/.test(m[1]) ? dedent(m[2], 2) : null;
}

const README = (name: string) => `# ${name}

This folder is the template “${name}” of Naget Agent. Change its files in any editor, or ask a coding agent to:
each change you save comes to the app as a new version of the template, and a mistake is said there in words.

- app.json: what it asks (fields), what it does (prompt, or flow: its steps), what it gives back (answer),
  what it keeps (data), its examples and the rest. .naget/app.schema.json describes each part.
- instructions/: each step's instructions (and the task of a template without steps), in Markdown.
- steps/: each code step, as the function it runs (.naget/step.d.ts says what it gets and gives).
- screens/: its screens, as pages that use naget.app.
- graph.json: where its steps sit in the graph (leave it out, and they are laid out by themselves).
`;

/** A template as its folder's files. */
export function filesOf(db: DB, a: AppDef): Files {
  const r = cleanRecipe(a);
  const files: Files = {};
  const out = JSON.parse(JSON.stringify({ ...r, screens: undefined, graph: undefined })) as Record<string, any>;
  if (out.prompt && !out.flow) {
    files['instructions/task.md'] = `${out.prompt}\n`;
    out.prompt = { file: 'instructions/task.md' };
  }
  const flows: Flow[] = [out.flow, ...Object.values((out.flows ?? {}) as Record<string, Flow>)].filter(Boolean);
  for (const f of flows)
    for (const s of allSteps(f.steps)) {
      if ((s.do === 'agent' || s.do === 'model') && s.instructions) {
        files[`instructions/${s.id}.md`] = `${s.instructions}\n`;
        (s as unknown as { instructions: FileRef }).instructions = { file: `instructions/${s.id}.md` };
      }
      if (s.do === 'code') {
        const file = `steps/${s.id}.${s.language === 'python' ? 'py' : s.language === 'typescript' ? 'ts' : 'js'}`;
        files[file] = codeFile(s, r.name);
        (s as unknown as { code: FileRef }).code = { file };
      }
    }
  if (r.screens) {
    out.screens = {};
    for (const [name, sc] of Object.entries(r.screens)) {
      const html = pageSource(db, sc.page)?.text;
      if (html === undefined) continue;
      files[`screens/${name}.html`] = html;
      out.screens[name] = { file: `screens/${name}.html`, ...(sc.title ? { title: sc.title } : {}) };
    }
  }
  if (r.graph) files['graph.json'] = `${JSON.stringify(r.graph, null, 2)}\n`;
  files[APP_FILE] = `${JSON.stringify({ $schema: './.naget/app.schema.json', ...out }, null, 2)}\n`;
  files['.naget/app.schema.json'] = `${JSON.stringify(appSchema(), null, 2)}\n`;
  files['.naget/step.d.ts'] = STEP_TYPES;
  return files;
}

/** A template as its folder says it is: the recipe, its screens' pages, and what is wrong (nothing changes then). */
export function readFolder(dir: string): { recipe: Record<string, any>; screens: Record<string, { html: string; title?: string }>; errors: string[] } {
  const errors: string[] = [];
  const read = (rel: string): string | null => {
    try {
      return fs.readFileSync(path.join(dir, rel), 'utf8');
    } catch {
      errors.push(`${rel} is missing`);
      return null;
    }
  };
  let recipe: Record<string, any> = {};
  try {
    recipe = JSON.parse(fs.readFileSync(path.join(dir, APP_FILE), 'utf8'));
  } catch (e) {
    return { recipe, screens: {}, errors: [`${APP_FILE}: ${(e as Error).message}`] };
  }
  delete recipe.$schema;
  if (isRef(recipe.prompt)) recipe.prompt = (read(recipe.prompt.file) ?? '').replace(/\n$/, '');
  for (const f of [recipe.flow, ...Object.values(recipe.flows ?? {})].filter((x) => x && Array.isArray((x as Flow).steps)) as Flow[])
    for (const s of allSteps(f.steps) as unknown as Record<string, any>[]) {
      if (isRef(s.instructions)) s.instructions = (read(s.instructions.file) ?? '').replace(/\n$/, '');
      if (isRef(s.code)) {
        const text = read(s.code.file);
        const code = text === null ? null : codeOf(text, s.language === 'python');
        if (text !== null && code === null) errors.push(`${s.code.file}: keep the step's code inside ${s.language === 'python' ? '“def step(input, ctx):”' : '“export default async function step(input, ctx) { … }”'}`);
        s.code = code ?? '';
      }
    }
  const screens: Record<string, { html: string; title?: string }> = {};
  for (const [name, sc] of Object.entries((recipe.screens ?? {}) as Record<string, unknown>)) {
    if (!isRef(sc)) continue;
    const html = read(sc.file);
    const title = (sc as FileRef & { title?: unknown }).title;
    if (html !== null) screens[name] = { html, ...(typeof title === 'string' ? { title } : {}) };
  }
  delete recipe.screens;
  if (fs.existsSync(path.join(dir, 'graph.json')))
    try {
      recipe.graph = JSON.parse(fs.readFileSync(path.join(dir, 'graph.json'), 'utf8'));
    } catch (e) {
      errors.push(`graph.json: ${(e as Error).message}`);
    }
  return { recipe, screens, errors };
}

// ---- keeping the folder and the template in step ------------------------------------------------------------

interface Watch {
  dir: string;
  watcher: fs.FSWatcher;
  timer?: NodeJS.Timeout;
  /** What this wrote, by file: its own writes are no change. */
  written: Map<string, string>;
  error?: string;
}

const watches = new Map<string, Watch>();
let deps: { db: DB; check: (raw: unknown) => { errors: string[] }; changed: (a: AppDef) => void; told: (id: string, error?: string) => void } | null = null;

/** What the folders need of the app: its database, the template checks, and how to say a template changed or its folder has a mistake. */
export function initFolders(d: NonNullable<typeof deps>) {
  deps = d;
  for (const a of listApps(d.db)) if (a.folder && fs.existsSync(path.join(a.folder, APP_FILE))) watch(a.id, a.folder);
}

/** The folder of a template, and the mistake in it, if any. */
export const folderOf = (a: AppDef) => (a.folder ? { path: a.folder, ...(watches.get(a.id)?.error ? { error: watches.get(a.id)!.error } : {}) } : null);

/** Writes a template's files to its folder, those that differ from what is there. */
export function writeFolder(db: DB, a: AppDef, dir: string) {
  const w = watches.get(a.id);
  const files = filesOf(db, a);
  // A README to start with, which the folder then keeps as its own.
  if (!fs.existsSync(path.join(dir, 'README.md'))) files['README.md'] = README(a.name);
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, rel);
    let now: string | null = null;
    try {
      now = fs.readFileSync(file, 'utf8');
    } catch {}
    w?.written.set(rel, hash(text));
    if (now === text) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
}

/** Makes a template's folder (written out, then watched); the folder must be empty, or one of this template's. */
export function linkFolder(db: DB, a: AppDef, dir: string): AppDef {
  const abs = path.resolve(dir.replace(/^~(?=\/|$)/, config.home));
  if (fs.existsSync(abs) && fs.readdirSync(abs).length && !fs.existsSync(path.join(abs, APP_FILE))) throw new Error('That folder has other files in it: pick an empty one, or one of this template');
  const other = listApps(db).find((x) => x.folder === abs && x.id !== a.id);
  if (other) throw new Error(`That folder is the template “${other.name}”'s`);
  fs.mkdirSync(abs, { recursive: true });
  unwatch(a.id);
  const saved = saveApp(db, { id: a.id, recipe: a, folder: abs });
  watch(a.id, abs);
  writeFolder(db, saved, abs);
  return saved;
}

/** Stops keeping a template and its folder in step (the files stay). */
export function unlinkFolder(db: DB, a: AppDef): AppDef {
  unwatch(a.id);
  return saveApp(db, { id: a.id, recipe: a, folder: null });
}

export function unwatch(id: string) {
  const w = watches.get(id);
  if (!w) return;
  clearTimeout(w.timer);
  w.watcher.close();
  watches.delete(id);
}

function watch(id: string, dir: string) {
  const w: Watch = { dir, watcher: null as unknown as fs.FSWatcher, written: new Map() };
  try {
    w.watcher = fs.watch(dir, { recursive: true }, (_e, name) => {
      const rel = String(name ?? '');
      // Its own notes, editors' swap and backup files, and git's are no change.
      if (rel.startsWith('.naget') || rel.startsWith('.git') || /(~|\.swp|\.swx|\.tmp|\.crswap)$/.test(rel) || /(^|\/)\.#/.test(rel)) return;
      clearTimeout(w.timer);
      w.timer = setTimeout(() => void reload(id), 400);
    });
  } catch {
    return;
  }
  // Files already there, as this would write them, are no change either.
  const a = deps ? getApp(deps.db, id) : null;
  if (a && deps) for (const [rel, text] of Object.entries(filesOf(deps.db, a))) w.written.set(rel, hash(text));
  watches.set(id, w);
}

/** The folder changed: what it says now becomes the template, when it checks out. */
async function reload(id: string) {
  const w = watches.get(id);
  const a = deps ? getApp(deps.db, id) : null;
  if (!w || !a || !deps) return;
  // Only its own writes since: nothing to take.
  const now = filesOn(w.dir);
  if (Object.entries(now).every(([rel, text]) => w.written.get(rel) === hash(text))) return;
  const { recipe, screens, errors } = readFolder(w.dir);
  const problems = errors.length ? errors : deps.check(recipe).errors;
  if (problems.length) {
    w.error = problems.slice(0, 5).join('; ');
    deps.told(id, w.error);
    return;
  }
  const hadError = !!w.error;
  w.error = undefined;
  for (const [rel, text] of Object.entries(now)) w.written.set(rel, hash(text));
  let saved = a;
  if (coreOf(recipe as AppRecipe) !== coreOf(a) || JSON.stringify(recipe.graph ?? null) !== JSON.stringify(a.graph ?? null)) saved = saveApp(deps.db, { id, recipe: { ...(recipe as AppRecipe), screens: a.screens }, by: 'folder' });
  // Its screens, each where its page changed.
  for (const [name, sc] of Object.entries(screens))
    if (a.screens?.[name] && pageSource(deps.db, a.screens[name].page)?.text !== sc.html) changeScreen(deps.db, getApp(deps.db, id)!, name, { html: sc.html, ...(sc.title ? { title: sc.title } : {}) });
  saved = getApp(deps.db, id) ?? saved;
  if (saved.updatedAt !== a.updatedAt) deps.changed(saved);
  if (hadError) deps.told(id);
}

/** The folder's files as text (those a template has: app.json, its instructions, steps, screens, graph). */
function filesOn(dir: string): Files {
  const out: Files = {};
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(r);
      else if (/^(app\.json|graph\.json|instructions\/.+\.md|steps\/.+\.(js|ts|py)|screens\/.+\.html)$/.test(r)) out[r] = fs.readFileSync(path.join(dir, r), 'utf8');
    }
  };
  try {
    walk('');
  } catch {}
  return out;
}

/** A save made elsewhere (the editor, an agent): the folder gets it. */
export function folderSaved(db: DB, a: AppDef) {
  const w = watches.get(a.id);
  if (!w || a.folder !== w.dir) return;
  writeFolder(db, a, w.dir);
  // Written out whole again: a mistake there before is gone.
  if (w.error) {
    w.error = undefined;
    deps?.told(a.id);
  }
}
