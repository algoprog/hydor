// LaTeX documents in Pages: a page of the kind "tex" keeps its project (shared/latex.ts) as text that reads as the
// source itself, its pictures apart (assets.ts). This typesets it with the TeX this computer has, and makes what the
// app shows and hands out of it: its pages as pictures (the editor's preview, its own page in a frame, its picture
// in Pages), the PDF, main.tex alone and the whole project as a .zip, and what an agent is told of it. A project
// can come in as a .tex file, a .zip of one, or (from an agent) a folder of its session.
//
// Typesetting runs whatever a document asks TeX to do, and documents may come from agents that read the web, so it
// is held in. TeX runs in a folder of its own under the app's data, with no shell escape, reading and writing only
// in that folder (openin_any=p, openout_any=p: no other place, no parent folder, no hidden file), in an environment
// of its own (no keys or tokens of the app's), at low priority, for at most 45 seconds, with limits on the files it
// writes, its memory and its time. Where bubblewrap works (Linux), it also runs shut in: it sees only the system,
// TeX's own trees and fonts, and its folder, with no network. That holds in what TeX's own rules do not: \pdfobj file
// and \XeTeXpicfile read a file by any path, and LuaTeX's Lua any file at all; so without bubblewrap a document that
// names those two is not typeset, and LuaLaTeX not at all. The pictures of a typeset PDF are made the same way
// (pdftoppm, from poppler).
//
// Typesetting is kept by the hash of what goes in (the last 30 on disk), and the same document is never typeset
// twice at once.
import { execFileSync, spawn } from 'node:child_process';
import { linkPath } from '../platform.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  cleanEngine,
  cleanTexName,
  engineLabel,
  extOf,
  guessEngine,
  normalizeTex,
  parseTexText,
  TEX_FILE_EXT,
  TEX_LIMITS,
  TEX_MAIN,
  texOutline,
  texText,
  uncommented,
  type TexCompiled,
  type TexDoc,
  type TexEngine,
  type TexIssue,
  type TexPicture,
  type TexSetup,
} from '../../shared/latex.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { which } from '../documents/tools.ts';
import { Zip } from '../documents/zip.ts';
import { getAsset, putAsset, takeIn } from './assets.ts';
import { zipParts } from './ooxml.ts';

export { isTexText } from '../../shared/latex.ts';

/** The longest a document's kept text may be (its pictures are kept apart). */
export const MAX_TEX = TEX_LIMITS.total + 512 * 1024;

/** The file names a LaTeX document is made from. */
export const TEX_OPENS = /\.(tex|ltx|zip)$/i;

const ROOT = path.join(config.dataDir, 'pages', 'tex');
const PICS = path.join(ROOT, 'pics');
/** Bump when the way documents are typeset changes: older results are not used again. */
const RECIPE = 'tex-1';
const KEEP = 30;
const KEEP_PICS = 40;
const TIME_MS = 45_000;
/** What a typesetting may write into its folder, all files together. */
const MAX_OUT = 300 * 1024 * 1024;
/** The most pages shown as pictures (the PDF has them all). */
export const MAX_SHOWN = 60;

const ASSET = 'naget-asset:';
const isKey = (k: string) => /^[a-f0-9]{40}$/.test(k);

// ---- the model, as it comes in and as it is kept ---------------------------------------------------------------

/** A document's text, read back; a broken one is an error a person can act on. */
export function readTex(text: string): TexDoc {
  try {
    return normalizeTex(parseTexText(text));
  } catch (e) {
    throw new HttpError(500, `This LaTeX document could not be read: ${(e as Error).message}`);
  }
}

const dataPicture = (s: string) => /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(s);

/** The document as it is kept, checked; data: pictures are kept apart. */
export function keepTex(db: DB, input: unknown): { doc: TexDoc; text: string } {
  let doc: TexDoc;
  try {
    doc = normalizeTex(input);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  doc = {
    ...doc,
    pictures: doc.pictures.map((p) => {
      const m = p.src.startsWith('data:') ? dataPicture(p.src) : null;
      return m ? { ...p, src: ASSET + putAsset(db, Buffer.from(m[1], 'base64')) } : p;
    }),
  };
  const text = texText(doc);
  if (Buffer.byteLength(text) > MAX_TEX) throw new HttpError(413, `The document is over ${Math.round(MAX_TEX / 1024 / 1024)} MB without its pictures; make it smaller.`);
  return { doc, text };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** A path an agent gave: from its session's folder, from home (~), or absolute. */
const fromSession = (cwd: string, p: string) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : path.resolve(cwd || config.defaultCwd, p));

/** A text file's bytes as text: UTF-8, or Latin-1 when they are not. */
export function textOf(b: Buffer): string {
  const s = b.toString('utf8');
  return s.includes('\ufffd') && !b.includes(Buffer.from([0xef, 0xbf, 0xbd])) ? b.toString('latin1') : s;
}

/**
 * A document from an agent, checked as keepTex does. Files and pictures may be named by path in its session's folder
 * (and pictures by an address on the web); a whole project folder of the session may come as `folder`. With `prev`
 * (the version it changes), what it leaves out stays: main.tex unless `source` comes, the files and pictures it does
 * not name, the engine; `remove` takes files or pictures out, and a file sent empty goes too. What was left out or
 * changed on the way is said in `notes`.
 */
export async function agentTex(db: DB, input: unknown, cwd: string, prev?: TexDoc | null): Promise<{ doc: TexDoc; text: string; notes: string[] }> {
  const notes: string[] = [];
  const v: Obj = isObj(input) ? { ...input } : { source: input };
  const files = new Map<string, string>();
  const pictures = new Map<string, string>();
  let main: string | null = null;
  let engine: TexEngine | null = cleanEngine(v.engine);
  const used = (name: string) => [...files.keys(), ...pictures.keys()].some((n) => n.toLowerCase() === name.toLowerCase());

  if (prev) {
    main = prev.main;
    for (const f of prev.files) files.set(f.name, f.text);
    for (const p of prev.pictures) pictures.set(p.name, p.src);
    engine ??= prev.engine;
  }
  if (typeof v.folder === 'string' && v.folder.trim()) {
    const dir = fromSession(cwd, v.folder.trim());
    const st = fs.statSync(dir, { throwIfNoEntry: false });
    if (!st?.isDirectory()) throw new Error(`There is no folder ${dir}.`);
    const got = await projectFrom(readFolder(dir, notes), notes);
    main = got.main;
    files.clear();
    pictures.clear();
    for (const f of got.files) files.set(f.name, f.text);
    // Kept now, as every picture of a document is (a data: address would make the kept text heavy).
    for (const p of got.pictures) {
      const m = dataPicture(p.src);
      if (m) pictures.set(p.name, ASSET + putAsset(db, Buffer.from(m[1], 'base64')));
    }
    engine ??= got.engine;
  }
  for (const k of ['source', 'main', 'tex']) {
    if (typeof v[k] === 'string') {
      main = v[k] as string;
      break;
    }
  }

  // Files: a text, or a file of the session's to read; sent empty, a file goes.
  const fileList: { name: unknown; text?: unknown; path?: unknown }[] = isObj(v.files)
    ? Object.entries(v.files).map(([name, x]) => (isObj(x) ? { name: x.name ?? name, text: x.text ?? x.content, path: x.path ?? x.file } : { name, text: x }))
    : Array.isArray(v.files)
      ? v.files.map((x) => (isObj(x) ? { name: x.name ?? x.path ?? x.file, text: x.text ?? x.content ?? x.source, path: x.path ?? x.file } : { name: x, path: x }))
      : [];
  for (const f of fileList) {
    let text = typeof f.text === 'string' ? f.text : null;
    const name = typeof f.name === 'string' ? f.name.trim().replace(/^\.\//, '') : '';
    if (text === null && typeof f.path === 'string' && f.path.trim()) {
      const file = fromSession(cwd, f.path.trim());
      const st = fs.statSync(file, { throwIfNoEntry: false });
      if (!st?.isFile()) throw new Error(`There is no file ${file} for ${name || f.path}.`);
      if (st.size > TEX_LIMITS.file) throw new Error(`${file} is over ${TEX_LIMITS.file / 1024 / 1024} MB.`);
      text = textOf(fs.readFileSync(file));
    }
    const key = /^[a-z]:|^[/~]/i.test(name) ? path.basename(name) : name;
    if (key === TEX_MAIN) {
      if (text !== null) main = text;
      continue;
    }
    if (!text) files.delete(key);
    else files.set(key, text);
  }
  if (Array.isArray(v.remove))
    for (const r of v.remove) {
      if (typeof r !== 'string') continue;
      files.delete(r.trim());
      pictures.delete(r.trim());
    }

  // Pictures: taken in below; a PDF picture becomes a PNG of its first page.
  const picList: { name: string | null; src: string }[] = [];
  const addPic = (name: unknown, src: unknown) => {
    if (typeof src !== 'string' || !src.trim()) return;
    picList.push({ name: typeof name === 'string' && name.trim() ? name.trim() : null, src: src.trim() });
  };
  if (isObj(v.pictures)) for (const [name, x] of Object.entries(v.pictures)) addPic(isObj(x) ? (x.name ?? name) : name, isObj(x) ? (x.src ?? x.path ?? x.file ?? x.url) : x);
  else if (Array.isArray(v.pictures)) for (const x of v.pictures) isObj(x) ? addPic(x.name, x.src ?? x.path ?? x.file ?? x.url) : addPic(null, x);
  for (const p of picList) {
    let name = p.name ?? (/^(\/|~|[a-z]:|https?:|data:|naget-asset:)/i.test(p.src) ? path.basename(p.src.replace(/[?#].*$/, '')) : p.src);
    name = name.replace(/\\/g, '/').replace(/^\.\//, '');
    let src = p.src;
    // A PDF of the session's (a plot saved as PDF): its first page as a PNG, under the same name with .png.
    if (/\.pdf$/i.test(src) && !/^(https?:|data:|naget-asset:)/i.test(src)) {
      const file = fromSession(cwd, src);
      try {
        const st = fs.statSync(file, { throwIfNoEntry: false });
        if (!st?.isFile()) throw new Error('no such file');
        if (st.size > 40 * 1024 * 1024) throw new Error('it is over 40 MB');
        const png = await pdfToPng(fs.readFileSync(file));
        src = ASSET + putAsset(db, png);
        if (/\.pdf$/i.test(name)) {
          const was = name;
          name = name.replace(/\.pdf$/i, '.png');
          notes.push(`The PDF picture ${was} became a PNG of it, ${name}: \\includegraphics names it so (or without an extension).`);
        }
      } catch (e) {
        notes.push(`The picture ${src} was left out: ${(e as Error).message}.`);
        continue;
      }
    } else {
      src = await takeIn(db, src, { cwd, notes });
      if (!src.startsWith(ASSET)) {
        if (src) notes.push(`The picture ${p.src} could not be kept (TeX needs it here); it was left out.`);
        continue;
      }
    }
    // TeX takes PNG and JPEG; the name says which, and must say it truly.
    const a = getAsset(db, src.slice(ASSET.length));
    const kind = a?.mime === 'image/png' ? 'png' : a?.mime === 'image/jpeg' ? 'jpg' : null;
    if (!kind) {
      notes.push(`${name} is ${a?.mime ?? 'not a picture'}; LaTeX takes PNG or JPEG pictures (convert it first). It was left out.`);
      continue;
    }
    const ext = extOf(name);
    if (!['png', 'jpg', 'jpeg'].includes(ext) || (ext === 'png') !== (kind === 'png')) {
      const was = name;
      name = `${ext && ext.length <= 4 ? name.slice(0, -ext.length - 1) : name}.${kind}`;
      notes.push(`${was} is a ${kind === 'png' ? 'PNG' : 'JPEG'} picture, so it is named ${name}.`);
    }
    if (files.has(name) || (used(name) && !pictures.has(name))) throw new Error(`Two files or pictures are named ${name}.`);
    pictures.set(name, src);
  }

  let doc: TexDoc;
  try {
    if (main === null) throw new Error('A LaTeX document needs its main file: source, the whole text of main.tex (\\documentclass{…} … \\end{document}).');
    doc = normalizeTex({
      main,
      engine: engine ?? undefined,
      files: [...files].map(([name, text]) => ({ name, text })),
      pictures: [...pictures].map(([name, src]) => ({ name, src })),
    });
  } catch (e) {
    throw new Error(`${(e as Error).message} See save_latex's description for the document's shape.`);
  }
  const text = texText(doc);
  if (Buffer.byteLength(text) > MAX_TEX) throw new Error(`The document is over ${Math.round(MAX_TEX / 1024 / 1024)} MB without its pictures; make it smaller.`);
  return { doc, text, notes };
}

// ---- TeX on this computer ------------------------------------------------------------------------------------------

/** Where TeX Live and MacTeX put their programs, when they are not on the PATH (an app started outside a shell). */
function texDirs(): string[] {
  const out = ['/Library/TeX/texbin'];
  for (const root of ['/usr/local/texlive', '/opt/texlive', path.join(os.homedir(), 'texlive')]) {
    try {
      for (const y of fs.readdirSync(root).filter((x) => /^\d{4}$/.test(x)).sort().reverse()) {
        const bin = path.join(root, y, 'bin');
        for (const arch of fs.readdirSync(bin)) out.push(path.join(bin, arch));
      }
    } catch {}
  }
  return out;
}

let dirsCache: { at: number; dirs: string[] } | null = null;
const tex = (name: string) => {
  if (!dirsCache || Date.now() - dirsCache.at > 60_000) dirsCache = { at: Date.now(), dirs: texDirs() };
  return which(name, dirsCache.dirs.map((d) => path.join(d, name)));
};

interface Tools {
  pdflatex: string | null;
  xelatex: string | null;
  lualatex: string | null;
  latexmk: string | null;
  bibtex: string | null;
  makeindex: string | null;
  kpsewhich: string | null;
  pdftoppm: string | null;
  pdftocairo: string | null;
  pdfinfo: string | null;
  synctex: string | null;
}

function tools(): Tools {
  return {
    pdflatex: tex('pdflatex'),
    xelatex: tex('xelatex'),
    lualatex: tex('lualatex'),
    latexmk: tex('latexmk'),
    bibtex: tex('bibtex'),
    makeindex: tex('makeindex'),
    kpsewhich: tex('kpsewhich'),
    pdftoppm: which('pdftoppm'),
    pdftocairo: which('pdftocairo'),
    pdfinfo: which('pdfinfo'),
    synctex: tex('synctex'),
  };
}

const INSTALL =
  'On Debian or Ubuntu: sudo apt install texlive-latex-extra texlive-xetex latexmk (and texlive-luatex for LuaLaTeX); on Fedora: sudo dnf install texlive-scheme-medium latexmk; on a Mac: MacTeX (tug.org/mactex). In the Docker image, build it with --build-arg LATEX=true.';

/** What is missing to typeset with `engine` here, in words, or null. */
function missingFor(t: Tools, engine: TexEngine): string | null {
  if (!t.pdflatex && !t.xelatex && !t.lualatex) return `LaTeX is not installed on this computer, so the document is kept but not typeset. ${INSTALL} You can still edit the source meanwhile.`;
  if (!t[engine]) {
    const pkg = engine === 'xelatex' ? 'texlive-xetex' : engine === 'lualatex' ? 'texlive-luatex' : 'texlive-latex-base';
    return `${engineLabel(engine)} is not installed on this computer: pick another engine, or install it (Debian or Ubuntu: sudo apt install ${pkg}).`;
  }
  return null;
}

const LUA_UNSAFE =
  'LuaLaTeX runs Lua code that could read and change any of your files, so this app runs it only shut in by bubblewrap, which does not work here. Pick XeLaTeX (it writes the same languages and fonts), or install bubblewrap (Linux: sudo apt install bubblewrap).';

// ---- held in -------------------------------------------------------------------------------------------------------

/** TeX's environment: its programs, the user's home (where TeX keeps its own caches), and its rules; nothing else of the app's. */
function texEnv(t: Tools, work: string): NodeJS.ProcessEnv {
  const bins = [t.pdflatex, t.xelatex, t.lualatex, t.latexmk].filter((x): x is string => !!x).map((x) => path.dirname(x));
  const lang = process.env.LANG && /utf-?8/i.test(process.env.LANG) ? process.env.LANG : process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8';
  return {
    PATH: [...new Set([...bins, '/usr/local/bin', '/usr/bin', '/bin', '/opt/homebrew/bin'])].join(path.delimiter),
    HOME: os.homedir(),
    LANG: lang,
    TMPDIR: work,
    // Read and write only in its folder, never a hidden file; run nothing.
    openin_any: 'p',
    openout_any: 'p',
    shell_escape: 'f',
    // Long lines in the log, unbroken, so they can be read.
    max_print_line: '10000',
    error_line: '254',
    half_error_line: '238',
  };
}

interface Box {
  /** bubblewrap's arguments: the system, TeX's trees and fonts read-only, `read` too, `work` (writable or not), no network. */
  args: (work: string, writable: boolean, read?: string[]) => string[];
}

let boxState: { at: number; box: Box | null; why?: string } | null = null;
let boxProbe: Promise<Box | null> | null = null;

/** The folders TeX reads besides /usr and /etc: its trees (and the user's), fonts, and where its programs are. */
function texReadDirs(t: Tools): string[] {
  const out = new Set<string>(['/var/lib/texmf', '/var/cache/fontconfig', '/nix', '/opt/texlive', '/home/linuxbrew/.linuxbrew', '/Library/TeX']);
  const home = os.homedir();
  for (const d of ['.fonts', '.local/share/fonts', '.cache/fontconfig', '.fontconfig', 'texmf']) out.add(path.join(home, d));
  for (const b of [t.pdflatex, t.xelatex, t.lualatex, t.latexmk]) {
    if (!b) continue;
    try {
      out.add(path.dirname(fs.realpathSync(b)));
    } catch {}
  }
  if (t.kpsewhich) {
    try {
      // Synchronous: once, at the first typesetting.
      const r = execFileSync(t.kpsewhich, ['-expand-var=$TEXMFROOT,$TEXMFDIST,$TEXMFLOCAL,$TEXMFSYSVAR,$TEXMFSYSCONFIG,$TEXMFVAR,$TEXMFCONFIG,$TEXMFHOME,$TEXMFDBS,$OSFONTDIR'], {
        encoding: 'utf8',
        timeout: 10_000,
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: os.homedir() },
      });
      for (const p of r.split(/[,:;{}\s]+/)) {
        const d = p.replace(/^!!/, '');
        if (d.startsWith('/')) out.add(d);
      }
    } catch {}
  }
  // Never a folder that holds the home or the app's data (a TEXMFHOME set to $HOME, say): those stay out of sight.
  const holds = (d: string, p: string) => p === d || p.startsWith(d.endsWith('/') ? d : `${d}/`);
  return [...out].filter((d) => d !== '/' && !/^\/(usr|etc)(\/|$)/.test(d) && !holds(d, home) && !holds(d, config.dataDir) && !holds(config.dataDir, d) && fs.existsSync(d));
}

function makeBox(bwrap: string, dirs: string[]): Box {
  const tops: string[] = [];
  for (const top of ['/bin', '/sbin', '/lib', '/lib32', '/lib64', '/libx32']) {
    try {
      const st = fs.lstatSync(top);
      if (st.isSymbolicLink()) tops.push('--symlink', fs.readlinkSync(top), top);
      else if (st.isDirectory()) tops.push('--ro-bind', top, top);
    } catch {}
  }
  return {
    args: (work, writable, read = []) => [
      bwrap,
      '--unshare-all',
      '--die-with-parent',
      '--new-session',
      '--ro-bind',
      '/usr',
      '/usr',
      '--ro-bind',
      '/etc',
      '/etc',
      ...tops,
      ...dirs.flatMap((d) => ['--ro-bind-try', d, d]),
      '--proc',
      '/proc',
      '--dev',
      '/dev',
      // After /dev and /proc, which would hide a folder under them (/dev/shm).
      ...read.flatMap((d) => ['--ro-bind-try', d, d]),
      writable ? '--bind' : '--ro-bind',
      work,
      work,
      // Nothing else may be written: the root it builds becomes read-only.
      '--remount-ro',
      '/',
      '--chdir',
      work,
      '--',
    ],
  };
}

/**
 * Whether bubblewrap can shut TeX in here: tried once with a tiny document (again ten minutes after it could not).
 * Null: TeX runs held in by its own rules only.
 */
function sandbox(t: Tools): Promise<Box | null> {
  if (boxState && (boxState.box || Date.now() - boxState.at < 600_000)) return Promise.resolve(boxState.box);
  boxProbe ??= probeBox(t).finally(() => (boxProbe = null));
  return boxProbe;
}

async function probeBox(t: Tools): Promise<Box | null> {
  // HYDOR_TEX_SANDBOX=off: where bubblewrap misbehaves, TeX runs held in by its own rules only (and LuaLaTeX not at all).
  const bwrap = process.platform === 'linux' && process.env.HYDOR_TEX_SANDBOX !== 'off' ? which('bwrap') : null;
  if (!bwrap) {
    boxState = { at: Date.now(), box: null, why: 'no bubblewrap' };
    return null;
  }
  const box = makeBox(bwrap, texReadDirs(t));
  const dir = path.join(ROOT, `probe-${process.pid}`);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const engine = t.pdflatex ?? t.xelatex;
    let r: Ran;
    let ok: boolean;
    if (engine) {
      fs.writeFileSync(path.join(dir, 'p.tex'), '\\documentclass{article}\\begin{document}x\\end{document}\n');
      r = await runHeld([engine, '-interaction=nonstopmode', '-no-shell-escape', 'p.tex'], { cwd: dir, env: texEnv(t, dir), box, timeout: 30_000 });
      ok = r.code === 0 && fs.existsSync(path.join(dir, 'p.pdf'));
    } else {
      r = await runHeld(['true'], { cwd: dir, env: texEnv(t, dir), box, timeout: 10_000 });
      ok = r.code === 0;
    }
    boxState = ok ? { at: Date.now(), box } : { at: Date.now(), box: null, why: lastLines(r.out, 4) };
    if (!ok) console.error(`[pages] LaTeX runs without bubblewrap here: ${boxState.why}`);
  } catch (e) {
    boxState = { at: Date.now(), box: null, why: (e as Error).message };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return boxState.box;
}

interface Ran {
  code: number | null;
  /** The program's output and errors, the end of them. */
  out: string;
  killed?: 'time' | 'size';
  ms: number;
}

/** Limits on each program run: the size of a file it writes, its processor time and its memory; and low priority. */
const LIMITS = 'ulimit -f 409600 2>/dev/null; ulimit -t 120 2>/dev/null; ulimit -v 4194304 2>/dev/null; exec nice -n 10 "$@"';

/** Bytes of the files in a folder (and its folders, a few deep). */
function folderBytes(dir: string, depth = 0): number {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isFile()) n += fs.statSync(p, { throwIfNoEntry: false })?.size ?? 0;
      else if (e.isDirectory() && depth < 6) n += folderBytes(p, depth + 1);
    }
  } catch {}
  return n;
}

/**
 * Runs a program held in: in its own process group (all of it stops at the time limit), with the limits above, shut
 * in by bubblewrap when `box` is given; stopped too when its folder grows past what it may write.
 */
function runHeld(cmd: string[], o: { cwd: string; env: NodeJS.ProcessEnv; box: Box | null; timeout: number; writable?: boolean; read?: string[] }): Promise<Ran> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const argv = [...(o.box ? o.box.args(o.cwd, o.writable !== false, o.read) : []), ...cmd];
    // Windows has no sh, ulimit or nice: the program alone, stopped by the time limit.
    const win = process.platform === 'win32';
    const child = win
      ? spawn(argv[0], argv.slice(1), { cwd: o.cwd, env: o.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
      : spawn('/bin/sh', ['-c', LIMITS, 'hydor-tex', ...argv], { cwd: o.cwd, env: o.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const take = (b: Buffer) => {
      out += b.toString('utf8');
      if (out.length > 400_000) out = out.slice(-200_000);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    let killed: Ran['killed'];
    const stop = (why: Ran['killed']) => {
      killed ??= why;
      try {
        if (win) child.kill('SIGKILL');
        else process.kill(-child.pid!, 'SIGKILL');
      } catch {}
    };
    const timer = setTimeout(() => stop('time'), o.timeout);
    const watch = o.writable === false ? null : setInterval(() => folderBytes(o.cwd) > MAX_OUT && stop('size'), 1000);
    child.on('error', (e) => {
      out += `\n${e.message}`;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (watch) clearInterval(watch);
      resolve({ code, out, killed, ms: Date.now() - t0 });
    });
  });
}

/** At most two typesettings (or picture makings) at a time: the computer is shared with everything else. */
let busy = 0;
const waiting: (() => void)[] = [];
async function slot<T>(f: () => Promise<T>): Promise<T> {
  if (busy >= 2) await new Promise<void>((ok) => waiting.push(ok));
  busy++;
  try {
    return await f();
  } finally {
    busy--;
    waiting.shift()?.();
  }
}

// ---- typesetting ---------------------------------------------------------------------------------------------------

export type { TexIssue };

export interface TexResult {
  /** The hash of what was typeset: its pictures and PDF are at /api/pages/tex/<key>/…. */
  key: string;
  /** Typeset with no errors. */
  ok: boolean;
  /** The PDF, when TeX made one (with errors it may still have). */
  pdf?: Buffer;
  pages: number;
  /** Each page's size in points (at most MAX_SHOWN of them), when they could be read. */
  sizes?: { w: number; h: number }[];
  /** TeX's log, cut to its start and its end when long (BibTeX's after it). */
  log: string;
  errors: TexIssue[];
  warnings: TexIssue[];
  engine: TexEngine;
  /** No TeX here (or not this engine): what to install. */
  missing?: string;
  ms?: number;
  /** Whether it ran shut in by bubblewrap. */
  sandboxed?: boolean;
}

/** What is kept of a typesetting beside its PDF. */
type Kept = Omit<TexResult, 'pdf'> & { pdf: boolean; pdfSha?: string; names: string[] };

const keyOf = (d: TexDoc) => {
  const h = crypto.createHash('sha256');
  h.update(`${RECIPE}\0${d.engine}\0${d.main}\0`);
  for (const f of d.files) h.update(`${f.name}\0${f.text}\0`);
  for (const p of d.pictures) h.update(`${p.name}\0${p.src}\0`);
  return h.digest('hex').slice(0, 40);
};

/** The key a document is typeset under (its pictures and PDF are found by it). */
export const texKey = keyOf;

const kept = new Map<string, Kept>();
const running = new Map<string, Promise<TexResult>>();

/** A typesetting kept on disk, or null. */
function keptResult(key: string): Kept | null {
  if (!isKey(key)) return null;
  const mem = kept.get(key);
  if (mem) return mem;
  try {
    const k = JSON.parse(fs.readFileSync(path.join(ROOT, key, 'result.json'), 'utf8')) as Kept;
    remember(key, k);
    return k;
  } catch {
    return null;
  }
}

function remember(key: string, k: Kept) {
  kept.delete(key);
  kept.set(key, k);
  while (kept.size > 80) kept.delete(kept.keys().next().value!);
}

function touch(dir: string) {
  const now = new Date();
  try {
    fs.utimesSync(dir, now, now);
  } catch {}
}

function withPdf(k: Kept): TexResult {
  const { pdf, pdfSha: _sha, names: _names, ...rest } = k;
  touch(path.join(ROOT, k.key));
  if (!pdf) return rest;
  try {
    return { ...rest, pdf: fs.readFileSync(path.join(ROOT, k.key, 'main.pdf')) };
  } catch {
    return rest;
  }
}

/** The last typesetting of this document, when it is kept (none is made). */
export function cachedTex(doc: TexDoc): TexResult | null {
  const k = keptResult(keyOf(doc));
  return k ? withPdf(k) : null;
}

/**
 * Typesets a document (or gives back how it was typeset, kept): its PDF, pages, errors and warnings with their files
 * and lines, and TeX's log. `base`: the key of an earlier typesetting of it, whose cross-references and bibliography
 * start this one (fewer runs). `folder`: a document of a file on this computer (texFolderOk), typeset among the
 * files of its folder (its figures, styles, data), which TeX may read but not change. Never fails for what is in
 * the document: its errors are in the result.
 */
export async function compileTex(db: DB, doc: TexDoc, o: { base?: string; direct?: boolean; folder?: string } = {}): Promise<TexResult> {
  const plan = o.folder ? folderPlan(o.folder) : null;
  // A folder's files change what comes of it: its listing (names, sizes, times) is part of the key.
  const key = plan ? crypto.createHash('sha256').update(`${keyOf(doc)}\0${o.folder}\0${plan.sig}`).digest('hex').slice(0, 40) : keyOf(doc);
  const k = keptResult(key);
  if (k) return withPdf(k);
  const t = tools();
  const missing = missingFor(t, doc.engine);
  if (missing) return { key, ok: false, pages: 0, log: '', errors: [], warnings: [], engine: doc.engine, missing };
  const on = running.get(key);
  if (on) return on;
  const job = slot(() => typeset(db, doc, key, t, { ...o, plan })).finally(() => running.delete(key));
  running.set(key, job);
  return job;
}

/** What latexmk keeps between runs, carried from an earlier typesetting of the same document. */
const CARRY = /\.(aux|bbl|toc|lof|lot|out|nav|snm|vrb|fdb_latexmk|bcf|run\.xml|ind|idx|ilg|glo|gls)$/;

function carry(from: string, to: string, depth = 0) {
  try {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const a = path.join(from, e.name);
      const b = path.join(to, e.name);
      if (e.isDirectory() && depth < 6) {
        fs.mkdirSync(b, { recursive: true });
        carry(a, b, depth + 1);
      } else if (e.isFile() && CARRY.test(e.name)) fs.copyFileSync(a, b);
    }
  } catch {}
}

/** Where a project's file goes in its folder: inside it, always. */
function inside(dir: string, name: string): string {
  const p = path.resolve(dir, name);
  if (!p.startsWith(dir + path.sep)) throw new Error(`Unsafe name ${name}`);
  return p;
}

async function typeset(db: DB, doc: TexDoc, key: string, t: Tools, o: { base?: string; direct?: boolean; folder?: string; plan?: FolderPlan | null }): Promise<TexResult> {
  const t0 = Date.now();
  const box = await sandbox(t);
  if (doc.engine === 'lualatex' && !box) return { key, ok: false, pages: 0, log: '', errors: [], warnings: [], engine: doc.engine, missing: LUA_UNSAFE };
  // Outside bubblewrap, two primitives still read any file by its path into the PDF: a document naming them is not
  // typeset (a document built to hide them can still get past this; bubblewrap is what holds).
  if (!box) {
    for (const [name, text] of [[TEX_MAIN, doc.main] as const, ...doc.files.map((f) => [f.name, f.text] as const)]) {
      const at = text.split('\n').findIndex((l) => /pdfobj\b[^\n]*\bfile\b|XeTeXpicfile|XeTeXpdffile|pdfextension\s*obj[^\n]*\bfile\b/.test(uncommented(l)));
      if (at >= 0)
        return {
          key,
          ok: false,
          pages: 0,
          log: '',
          errors: [{ file: name, line: at + 1, message: 'This reads a file by its path into the PDF, which documents typeset here may not do.', hint: 'Show pictures with \\includegraphics and a picture of the document.' }],
          warnings: [],
          engine: doc.engine,
        };
    }
  }
  const dir = path.join(ROOT, key);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const warnings: TexIssue[] = [];

  // The project, as TeX reads it.
  const write = (name: string, data: string | Buffer) => {
    const p = inside(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  };
  write(TEX_MAIN, doc.main);
  for (const f of doc.files) write(f.name, f.text);
  for (const p of doc.pictures) {
    const data = pictureBytes(db, p);
    if (!data) {
      warnings.push({ message: `The picture ${p.name} is no longer kept: add it again under Pictures.` });
      continue;
    }
    const png = data[0] === 0x89 && data[1] === 0x50;
    if (png !== (extOf(p.name) === 'png')) warnings.push({ message: `${p.name} is a ${png ? 'PNG' : 'JPEG'} picture: name it .${png ? 'png' : 'jpg'}, or TeX may not read it.` });
    write(p.name, data);
  }
  if (o.base && isKey(o.base) && o.base !== key && keptResult(o.base)?.ok) carry(path.join(ROOT, o.base), dir);
  // A file's document: the rest of its folder beside it, as links TeX reads through (the folder is read-only to it).
  const read = o.folder && o.plan ? (mirror(o.folder, dir, o.plan), [o.folder]) : undefined;

  const env = texEnv(t, dir);
  const flags = ['-interaction=nonstopmode', '-file-line-error', '-no-shell-escape', '-no-parse-first-line', '-synctex=1'];
  const lua = doc.engine === 'lualatex';
  let out = '';
  let killed: Ran['killed'];
  const deadline = t0 + TIME_MS;
  const left = () => Math.max(1000, deadline - Date.now());
  if (t.latexmk && !o.direct) {
    // latexmk runs TeX (and BibTeX, makeindex) as often as the cross-references need. -norc: no rc file of anyone's
    // (one in the folder would be Perl code); -f: on past errors TeX recovers from, for the pages it can make.
    const r = await runHeld(
      [
        t.latexmk,
        '-norc',
        doc.engine === 'xelatex' ? '-xelatex' : lua ? '-lualatex' : '-pdf',
        '-f',
        '-bibtex-cond',
        ...(lua ? [`-pdflualatex=${t.lualatex} --nosocket %O %S`] : []),
        ...flags,
        TEX_MAIN,
      ],
      { cwd: dir, env, box, timeout: TIME_MS, read },
    );
    out = r.out;
    killed = r.killed;
  } else {
    // Without latexmk: TeX, then BibTeX and makeindex when the document has them, then TeX until the references settle.
    const engine = t[doc.engine]!;
    const pass = async () => {
      const r = await runHeld([engine, ...flags, ...(lua ? ['--nosocket'] : []), TEX_MAIN], { cwd: dir, env, box, timeout: left(), read });
      out += r.out;
      killed ??= r.killed;
      return r;
    };
    await pass();
    const aux = fs.existsSync(path.join(dir, 'main.aux')) ? fs.readFileSync(path.join(dir, 'main.aux'), 'utf8') : '';
    let again = false;
    if (!killed && /\\bibdata\{/.test(aux) && t.bibtex && (doc.files.some((f) => f.name.endsWith('.bib')) || !!o.plan?.entries.some((e) => e.rel.endsWith('.bib')))) {
      const r = await runHeld([t.bibtex, 'main'], { cwd: dir, env, box, timeout: left(), read });
      out += r.out;
      killed ??= r.killed;
      again = true;
    }
    if (!killed && fs.existsSync(path.join(dir, 'main.idx')) && t.makeindex) {
      const r = await runHeld([t.makeindex, '-q', 'main.idx'], { cwd: dir, env, box, timeout: left(), read });
      out += r.out;
      killed ??= r.killed;
      again = true;
    }
    const rerun = () => /Rerun to get|Label\(s\) may have changed|Rerun LaTeX|There were undefined references/.test(readTail(path.join(dir, 'main.log'), 400_000));
    for (let i = 0; i < 3 && !killed && (again || rerun()); i++) {
      again = false;
      await pass();
    }
  }

  // What came of it.
  const names = new Set([TEX_MAIN, ...doc.files.map((f) => f.name), ...doc.pictures.map((p) => p.name)]);
  const logText = readTail(path.join(dir, 'main.log'), 3_000_000);
  const texts = new Map<string, string>([[TEX_MAIN, doc.main], ...doc.files.filter((f) => /\.(tex|ltx|sty|cls)$/i.test(f.name)).map((f) => [f.name, f.text] as [string, string])]);
  const parsed = parseLog(logText, names, texts);
  const blg = readTail(path.join(dir, 'main.blg'), 200_000);
  const bib = blg ? parseBlg(blg, names) : { errors: [], warnings: [] };
  const errors = [...parsed.errors, ...bib.errors];
  warnings.push(...parsed.warnings, ...bib.warnings);
  if (killed === 'time') errors.unshift({ message: `Typesetting took longer than ${TIME_MS / 1000} seconds, so it was stopped.`, hint: 'A loop that never ends, or a very large document: look at what changed last.' });
  if (killed === 'size') errors.unshift({ message: `Typesetting wrote more than ${MAX_OUT / 1024 / 1024} MB, so it was stopped.`, hint: 'Something writes far more than a document needs: look at what changed last.' });
  if (!logText && !killed) errors.push({ message: `TeX did not start: ${lastLines(out, 3) || 'no output'}` });

  const pdfFile = path.join(dir, 'main.pdf');
  const st = fs.statSync(pdfFile, { throwIfNoEntry: false });
  const pdf = st?.isFile() && st.size > 0 && st.mtimeMs >= t0 - 1000 ? fs.readFileSync(pdfFile) : undefined;
  if (!pdf) fs.rmSync(pdfFile, { force: true });
  let pages = 0;
  for (const m of logText.matchAll(/Output written on [^\n]*?\((\d+) pages?/g)) pages = Number(m[1]);
  let sizes: { w: number; h: number }[] | undefined;
  if (pdf) {
    sizes = await pageSizes(t, dir, box);
    if (sizes?.length && !pages) pages = sizes.length;
    if (!pages) pages = 1;
  }

  // The pictures copied in go (each typesetting writes them again); XeTeX's intermediate file too.
  for (const p of doc.pictures) fs.rmSync(path.join(dir, p.name), { force: true });
  fs.rmSync(path.join(dir, 'main.xdv'), { force: true });

  const log = cutLog(logText || out) + (blg ? `\n\n---- BibTeX (main.blg) ----\n${blg.slice(-20_000)}` : '');
  const result: Kept = {
    key,
    ok: !!pdf && errors.length === 0,
    pdf: !!pdf,
    pdfSha: pdf ? crypto.createHash('sha256').update(pdf).digest('hex').slice(0, 40) : undefined,
    pages: pdf ? pages : 0,
    sizes,
    log,
    errors: dedupe(errors).slice(0, 40),
    warnings: dedupe(warnings).slice(0, 80),
    engine: doc.engine,
    ms: Date.now() - t0,
    sandboxed: !!box,
    names: [...names],
  };
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result));
  remember(key, result);
  sweep();
  return withPdf(result);
}

// ---- a file's document, typeset among the files of its folder --------------------------------------------------------

/**
 * Whether a document's folder may be read by TeX beside it: a folder of its own, never the root, the home folder or
 * one holding it, nor the app's data (those stay out of TeX's sight, as texReadDirs keeps them).
 */
export function texFolderOk(folder: string): boolean {
  const home = os.homedir();
  const holds = (d: string, p: string) => p === d || p.startsWith(d.endsWith(path.sep) ? d : d + path.sep);
  if (!path.isAbsolute(folder) || folder === path.parse(folder).root || holds(folder, home) || holds(folder, config.dataDir) || holds(config.dataDir, folder)) return false;
  return !!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory();
}

/** What TeX writes beside a document (the folder's own typesettings left them): never linked in, so none is written through. */
const OUTPUTS = /\.(aux|log|out|toc|lof|lot|loa|lol|bbl|blg|bcf|run\.xml|fls|fdb_latexmk|synctex|synctex\.gz|nav|snm|vrb|idx|ind|ilg|glo|gls|glg|acn|acr|alg|xdv|dvi|brf|thm|nlo|nls|maf|ptc|upa|upb)$/i;

interface FolderPlan {
  /** A hash of its files' names, sizes and times. */
  sig: string;
  entries: { rel: string; dir: boolean }[];
}

const plans = new Map<string, { at: number; plan: FolderPlan }>();

/** A document's folder as TeX finds it beside the document: its folders and files (no hidden ones, none TeX wrote), a few thousand at most. */
function folderPlan(folder: string): FolderPlan {
  const hit = plans.get(folder);
  if (hit && Date.now() - hit.at < 2000) return hit.plan;
  const entries: FolderPlan['entries'] = [];
  const h = crypto.createHash('sha256');
  const walk = (dir: string, rel: string, depth: number) => {
    let list: fs.Dirent[];
    try {
      list = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    } catch {
      return;
    }
    for (const e of list) {
      if (entries.length >= 4000) return;
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      const st = fs.statSync(path.join(dir, e.name), { throwIfNoEntry: false });
      if (st?.isDirectory()) {
        if (depth >= 6) continue;
        entries.push({ rel: r, dir: true });
        walk(path.join(dir, e.name), r, depth + 1);
      } else if (st?.isFile()) {
        // The typesetting's own files are main.*: one of the folder's would be written through.
        if (OUTPUTS.test(e.name) || (!rel && /^main\./i.test(e.name))) continue;
        entries.push({ rel: r, dir: false });
        h.update(`${r}\0${st.size}\0${Math.floor(st.mtimeMs)}\0`);
      }
    }
  };
  walk(folder, '', 0);
  const plan = { sig: h.digest('hex').slice(0, 40), entries };
  plans.set(folder, { at: Date.now(), plan });
  if (plans.size > 20) plans.delete(plans.keys().next().value!);
  return plan;
}

/** The folder's files in a typesetting's folder, beside the document's own (which come first and stay): links, in folders of their own. */
function mirror(folder: string, dir: string, plan: FolderPlan) {
  for (const e of plan.entries) {
    const to = path.join(dir, e.rel);
    if (fs.lstatSync(to, { throwIfNoEntry: false })) continue;
    try {
      if (e.dir) fs.mkdirSync(to, { recursive: true });
      else {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        linkPath(path.join(folder, e.rel), to);
      }
    } catch {}
  }
}

/** A picture's bytes: one the app keeps, or one inside the model (an unsaved upload). */
function pictureBytes(db: DB, p: TexPicture): Buffer | null {
  if (p.src.startsWith(ASSET)) return getAsset(db, p.src.slice(ASSET.length))?.data ?? null;
  const m = dataPicture(p.src);
  return m ? Buffer.from(m[1], 'base64') : null;
}

function readTail(file: string, max: number): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const n = Math.min(size, max);
      const b = Buffer.alloc(n);
      fs.readSync(fd, b, 0, n, size - n);
      return b.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

const lastLines = (s: string, n: number) =>
  s
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .slice(-n)
    .join(' ')
    .slice(0, 400);

/** A long log, cut: its start (what was loaded) and its end (where it stopped). */
function cutLog(s: string): string {
  if (s.length <= 140_000) return s;
  return `${s.slice(0, 12_000)}\n\n… (${Math.round((s.length - 132_000) / 1024)} KB of the log left out) …\n\n${s.slice(-120_000)}`;
}

function dedupe(list: TexIssue[]): TexIssue[] {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = `${x.file ?? ''}:${x.line ?? ''}:${x.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Removes the oldest typesettings past the last KEEP (and the oldest pictures past KEEP_PICS). */
function sweep() {
  const prune = (root: string, keep: number, ok: (n: string) => boolean) => {
    try {
      const list = fs
        .readdirSync(root)
        .filter(ok)
        .map((n) => ({ n, t: fs.statSync(path.join(root, n), { throwIfNoEntry: false })?.mtimeMs ?? 0 }))
        .sort((a, b) => b.t - a.t);
      for (const x of list.slice(keep)) {
        if (running.has(x.n)) continue;
        fs.rmSync(path.join(root, x.n), { recursive: true, force: true });
        kept.delete(x.n);
      }
    } catch {}
  };
  prune(ROOT, KEEP, isKey);
  prune(PICS, KEEP_PICS, isKey);
}

/** Each page's size in points, from pdfinfo (at most MAX_SHOWN pages). */
async function pageSizes(t: Tools, dir: string, box: Box | null): Promise<{ w: number; h: number }[] | undefined> {
  if (!t.pdfinfo) return undefined;
  const r = await runHeld([t.pdfinfo, '-f', '1', '-l', String(MAX_SHOWN), 'main.pdf'], { cwd: dir, env: texEnv(t, dir), box, timeout: 15_000, writable: false });
  const out: { w: number; h: number }[] = [];
  for (const m of r.out.matchAll(/^Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/gm)) out.push({ w: Math.round(Number(m[1]) * 100) / 100, h: Math.round(Number(m[2]) * 100) / 100 });
  if (!out.length) {
    const one = /^Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/m.exec(r.out);
    if (one) out.push({ w: Number(one[1]), h: Number(one[2]) });
  }
  return out.length ? out : undefined;
}

// ---- reading TeX's log --------------------------------------------------------------------------------------------

const PACKAGES: Record<string, string> = {
  siunitx: 'texlive-science',
  biblatex: 'texlive-bibtex-extra (and biber)',
  ctex: 'texlive-lang-chinese',
  xeCJK: 'texlive-lang-chinese',
  CJKutf8: 'texlive-lang-cjk',
  luaotfload: 'texlive-luatex',
  lmodern: 'lmodern',
  fontawesome5: 'texlive-fonts-extra',
  moderncv: 'texlive-latex-extra',
  minted: 'texlive-latex-extra (and it needs shell escape, which documents here may not use)',
  pgfplots: 'texlive-pictures',
  'tikz-cd': 'texlive-pictures',
  algorithm2e: 'texlive-science',
  physics: 'texlive-science',
};

/** What a missing file most likely is, and what to do. */
function missingFile(name: string, names: Set<string>): { message: string; hint: string } {
  const ext = extOf(name);
  const base = name.replace(/\.[^.]+$/, '');
  if (ext === 'sty' || ext === 'cls') {
    const what = ext === 'sty' ? 'package' : 'document class';
    const pkg = PACKAGES[base];
    return {
      message: `The ${what} ${base} is not installed on this computer.`,
      hint: `Install it with your TeX: TeX Live's tlmgr install ${base}${pkg ? `; on Debian or Ubuntu it comes with ${pkg}` : '; on Debian or Ubuntu, apt-file search ' + name + ' names the package (most are in texlive-latex-extra, texlive-science or texlive-fonts-extra)'}. Or add ${name} to the document as a file of its own.`,
    };
  }
  if ((!ext || ['png', 'jpg', 'jpeg', 'pdf', 'eps'].includes(ext)) && !names.has(name))
    return { message: `There is no picture ${name} in this document.`, hint: 'Add it under Pictures with the name \\includegraphics gives it (PNG or JPEG).' };
  if (ext === 'bst') return { message: `The bibliography style ${base} is not installed here.`, hint: 'Pick a standard one (plain, abbrv, alpha, unsrt, or natbib’s plainnat), or add the .bst file to the document.' };
  return { message: `There is no file ${name} in this document.`, hint: 'Add it as a file, with the name the document gives it.' };
}

/** Plain words for TeX's most common errors. */
function hintFor(message: string): string | undefined {
  const m = message;
  if (/^Undefined control sequence/.test(m)) return 'A command TeX does not know: a typo, or its package is not loaded (\\usepackage{…}).';
  if (/Missing \$ inserted/.test(m)) return 'Math (x^2, \\alpha, a _) goes between $ signs.';
  if (/File ended while scanning|Runaway argument|Paragraph ended before/.test(m)) return 'A { that is never closed, or a command’s argument that runs on.';
  if (/Extra \}, or forgotten|Too many \}'s/.test(m)) return 'A } too many, or a { or $ missing before it.';
  if (/Unicode character .* not set up for use with LaTeX/.test(m)) return 'pdfLaTeX cannot write that character: pick XeLaTeX, with a font that has it (\\usepackage{fontspec}).';
  if (/Environment \S+ undefined/.test(m)) return 'No environment by that name: a typo, or its package is not loaded.';
  if (/ended by \\end\{/.test(m)) return 'A \\begin{…} and the \\end{…} that closes it do not match.';
  if (/Missing \\begin\{document\}/.test(m)) return 'Text before \\begin{document}, or a stray character in the preamble.';
  if (/There's no line here to end/.test(m)) return '\\\\ where no line is being written: leave it out (an empty line starts a new paragraph).';
  if (/Misplaced alignment tab character &/.test(m)) return 'An & outside a table or an aligned equation: write \\& for the sign itself.';
  if (/shell-escape|shell escape|write18/i.test(m)) return 'This needs to run a program, which documents here may not. For code, use the listings package rather than minted.';
  if (/The font .* cannot be found/.test(m)) return 'That font is not on this computer: pick one it has, or leave \\setmainfont out.';
  if (/I can't write on file/.test(m)) return 'TeX writes only into the document’s own folder, never elsewhere.';
  if (/Missing number|Illegal unit of measure/.test(m)) return 'A length or a number is expected there (10pt, 2cm, 0.5\\linewidth).';
  if (/Double superscript|Double subscript/.test(m)) return 'Two ^ or _ in a row: put braces around one, x^{a^b}.';
  if (/Lonely \\item|perhaps a missing list environment/.test(m)) return '\\item goes inside itemize, enumerate or description.';
  if (/Too many unprocessed floats/.test(m)) return 'Many figures or tables in a row: \\clearpage between them lets them out.';
  if (/TeX capacity exceeded/.test(m)) return 'TeX ran out of room: usually a command that calls itself without end.';
  return undefined;
}

const FILE_PAREN = /^\(((?:\.\/|\/|[A-Za-z0-9_])[^\s()"'<>]*?\.(?:tex|ltx|sty|cls|cfg|def|clo|fd|bbl|aux|toc|lof|lot|out|nav|snm|bib|ind|dat|lua|ldf))(?=[\s)]|$)/;

/**
 * Which of the project's files TeX was reading as it wrote each line of its log (it shows "(./name" on opening a file
 * and ")" on leaving it): the file it was in, when that is one of the project's (not a package's).
 */
function filesByLine(lines: string[], names: Set<string>): (string | undefined)[] {
  // A file of the project's, another file (null), or parentheses of text (false).
  const stack: (string | null | false)[] = [];
  const at: (string | undefined)[] = [];
  const current = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i] !== false) return stack[i] || undefined;
    return undefined;
  };
  let skip = false;
  for (const line of lines) {
    at.push(current());
    // A box's contents and an error's context are the document's own text, parentheses and all.
    if (/^(Overfull|Underfull|Tight|Loose) \\[hv]box/.test(line) || /^l\.\d+ /.test(line)) {
      skip = true;
      continue;
    }
    if (skip) {
      if (!line.trim()) skip = false;
      continue;
    }
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '(') {
        const m = FILE_PAREN.exec(line.slice(i));
        if (m) {
          const n = m[1].replace(/^\.\//, '');
          stack.push(names.has(n) ? n : null);
          i += m[0].length - 1;
        } else stack.push(false);
      } else if (c === ')') stack.pop();
    }
  }
  return at;
}

/** Where the project's sources name a file TeX could not find: the first \usepackage, \includegraphics, \input… of it. */
function locate(name: string, texts: Map<string, string>): { file: string; line: number } | null {
  const ext = extOf(name);
  const base = name.replace(/\.[^./]+$/, '');
  const q = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re =
    ext === 'sty'
      ? new RegExp(`\\\\(usepackage|RequirePackage)\\s*(\\[[^\\]]*\\])?\\s*\\{[^}]*\\b${q(base)}\\b`)
      : ext === 'cls'
        ? new RegExp(`\\\\documentclass\\s*(\\[[^\\]]*\\])?\\s*\\{\\s*${q(base)}\\s*\\}`)
        : ext === 'bst'
          ? new RegExp(`\\\\bibliographystyle\\s*\\{\\s*${q(base)}\\s*\\}`)
          : new RegExp(`\\{\\s*(\\./)?(${q(name)}|${q(base)})\\s*\\}`);
  for (const [file, text] of texts) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) if (re.test(uncommented(lines[i]))) return { file, line: i + 1 };
  }
  return null;
}

const projectFile = (p: string, names: Set<string>) => {
  const n = p.replace(/^\.\//, '');
  return names.has(n) ? n : undefined;
};

/** Errors and warnings from TeX's log, each with its file and line where the log says them. */
export function parseLog(log: string, names: Set<string>, texts: Map<string, string> = new Map()): { errors: TexIssue[]; warnings: TexIssue[] } {
  const errors: TexIssue[] = [];
  const warnings: TexIssue[] = [];
  const lines = log.split('\n');
  const where = filesByLine(lines, names);
  const glyphs = new Map<string, Set<string>>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // file:line: message (with -file-line-error), or "! message" (then the line from "l.12 …" below it).
    const fl = /^((?:\.\/|\/)[^:\s][^:]*?):(\d+): (.*)$/.exec(line);
    const bang = fl ? null : /^! (.*)$/.exec(line);
    if (fl || bang) {
      let message = (fl ? fl[3] : bang![1]).trim();
      let file = fl ? projectFile(fl[1], names) : where[i];
      let lineNo = fl ? Number(fl[2]) : undefined;
      if (fl && !file) message = `${path.basename(fl[1])}: ${message}`;
      if (/^(Emergency stop|==> Fatal error occurred)/.test(message) || /^Fatal error occurred/.test(message)) {
        if (!errors.length) errors.push({ file, line: lineNo, message: 'TeX stopped here.' });
        continue;
      }
      // What it stopped at: "l.12 Hello \foo".
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        const ctx = /^l\.(\d+) (.*)$/.exec(lines[j]);
        if (!ctx) continue;
        lineNo ??= Number(ctx[1]);
        if (/^Undefined control sequence/.test(message)) {
          const cs = /(\\[A-Za-z@]+|\\.)\s*$/.exec(ctx[2]);
          if (cs) message = `Undefined control sequence ${cs[1]}`;
        }
        break;
      }
      const nf = /(?:LaTeX Error: )?File [`']([^']+)' not found/.exec(message) ?? /I can't find file [`']([^']+)'/.exec(message);
      const pdfdef = /Package (?:pdftex|xetex|luatex)\.def Error: File [`']([^']+)' not found/.exec(message);
      if (nf || pdfdef) {
        const missing = (nf ?? pdfdef)![1].replace(/^\.\//, '');
        const m = missingFile(missing, names);
        // TeX tells where it noticed (often the line after); the source says where it is named.
        const at = locate(missing, texts);
        errors.push({ file: at?.file ?? file ?? undefined, line: at?.line ?? lineNo, message: m.message, hint: m.hint });
        continue;
      }
      errors.push({ file: file ?? undefined, line: lineNo, message: message.replace(/^LaTeX Error: /, '').replace(/\s+/g, ' ').slice(0, 400), hint: hintFor(message) });
      continue;
    }
    // Warnings: LaTeX's, a package's or a class's (their message goes on over lines starting "(name)").
    const w = /^(LaTeX|Package (\S+)|Class (\S+)|LaTeX Font) Warning: (.*)$/.exec(line);
    if (w) {
      let message = w[4];
      for (let j = i + 1; j < lines.length && /^\([^)\s]+\)\s+/.test(lines[j]); j++) message += ` ${lines[j].replace(/^\([^)\s]+\)\s+/, '')}`;
      message = message.replace(/\s+/g, ' ').trim();
      if (/^(There were undefined references|Label\(s\) may have changed|Rerun to get|There were multiply-defined labels|Some font shapes were not available)/.test(message)) continue;
      const lineM = /on input line (\d+)\.?/.exec(message);
      const ref = /^(Reference|Citation) [`']([^']+)' on page \d+ undefined/.exec(message);
      const lab = /^Label [`']([^']+)' multiply defined/.exec(message);
      const text = ref
        ? ref[1] === 'Reference'
          ? `Undefined reference ${ref[2]} (no \\label{${ref[2]}})`
          : `Undefined citation ${ref[2]} (not in the bibliography)`
        : lab
          ? `The label ${lab[1]} is defined twice`
          : `${w[2] ? `${w[2]}: ` : w[3] ? `${w[3]}: ` : ''}${message.replace(/\s*on input line \d+\.?$/, '')}`;
      warnings.push({ file: where[i], line: lineM ? Number(lineM[1]) : undefined, message: text.slice(0, 300) });
      continue;
    }
    const over = /^Overfull \\hbox \(([\d.]+)pt too wide\) .*?(?:at lines? (\d+)(?:--\d+)?)?$/.exec(line);
    if (over && Number(over[1]) > 1) {
      warnings.push({ file: where[i], line: over[2] ? Number(over[2]) : undefined, message: `A line sticks out into the margin by ${Math.round(Number(over[1]))}pt` });
      continue;
    }
    // XeTeX and LuaTeX: a letter the font has not.
    const miss = /^Missing character: There is no (.+?) (?:\(U\+([0-9A-Fa-f]+)\) )?in font (.+?)!/.exec(line);
    if (miss) {
      const font = miss[3].replace(/^"|"$/g, '').replace(/[:/].*$/, '');
      if (!glyphs.has(font)) glyphs.set(font, new Set());
      const set = glyphs.get(font)!;
      if (set.size < 8) set.add(miss[2] ? `${miss[1]} (U+${miss[2].toUpperCase()})` : miss[1]);
      continue;
    }
    if (/^Error in luaotfload: reverting to OT1/.test(line)) {
      warnings.push({ message: 'LuaLaTeX’s font loader (luaotfload) is missing here, so it falls back to old fonts.', hint: 'Install it (Debian or Ubuntu: sudo apt install texlive-luatex), or pick XeLaTeX.' });
    }
  }
  for (const [font, set] of glyphs)
    warnings.push({ message: `The font ${font} has no ${[...set].join(', ')}: those are left out.`, hint: 'Pick a font that has them (\\setmainfont{…}), with XeLaTeX or LuaLaTeX.' });
  return { errors, warnings };
}

/** BibTeX's errors and warnings, from its log (main.blg). */
function parseBlg(blg: string, names: Set<string>): { errors: TexIssue[]; warnings: TexIssue[] } {
  const errors: TexIssue[] = [];
  const warnings: TexIssue[] = [];
  const lines = blg.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const at = /^(.*?)---line (\d+) of file (.+)$/.exec(l);
    if (at) {
      const open = /I couldn't open (?:database|style) file (.+)$/.exec(at[1]);
      if (open) errors.push({ message: `BibTeX: there is no ${open[1].trim()} in this document`, hint: /\.bst$/.test(open[1]) ? 'Pick a standard style (plain, abbrv, alpha, unsrt, plainnat).' : 'Add the .bib file as a file of the document, with the name \\bibliography gives it.' });
      else errors.push({ file: projectFile(at[3].trim(), names), line: Number(at[2]), message: `BibTeX: ${at[1].trim() || lines[i - 1]?.trim() || 'an error'}` });
      continue;
    }
    const w = /^Warning--(.*)$/.exec(l);
    if (w) {
      const entry = /I didn't find a database entry for "([^"]+)"/.exec(w[1]);
      warnings.push({ message: entry ? `No entry ${entry[1]} in the bibliography (.bib)` : `BibTeX: ${w[1]}` });
    }
  }
  return { errors, warnings };
}

// ---- pictures of the pages -------------------------------------------------------------------------------------

const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 40);

/** A width for pictures, in steps (fewer kinds of picture to keep). */
const stepWidth = (w: number) => Math.min(2400, Math.max(200, Math.ceil((Number.isFinite(w) ? w : 1200) / 100) * 100));

/** Pictures being made, by PDF: one making at a time for each (the next finds what the last one made). */
const drawing = new Map<string, Promise<unknown>>();

/**
 * Pictures of pages `first`…`last` of a PDF kept at pics/<sha>/, at `width` pixels, made where missing (with `ahead`
 * pages after them, likely asked for next); their files.
 */
async function renderPages(pdfSha: string, pdf: () => Buffer, width: number, first: number, last: number, ahead = 0): Promise<string[]> {
  const dir = path.join(PICS, pdfSha);
  const fileOf = (n: number) => path.join(dir, `w${width}-${n}.png`);
  const want = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
  const make = async () => {
    const missing = want.filter((n) => !fs.existsSync(fileOf(n)));
    if (!missing.length) return;
    const t = tools();
    if (!t.pdftoppm) throw new HttpError(503, 'The pages cannot be shown as pictures here: install poppler (Debian or Ubuntu: sudo apt install poppler-utils; a Mac: brew install poppler).');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const src = path.join(dir, 'doc.pdf');
    if (!fs.existsSync(src)) fs.writeFileSync(src, pdf());
    const box = await sandbox(t);
    const from = Math.min(...missing);
    const to = Math.max(...missing) + ahead;
    const prefix = `r${width}x${crypto.randomBytes(3).toString('hex')}`;
    await slot(() => runHeld([t.pdftoppm!, '-png', '-scale-to-x', String(width), '-scale-to-y', '-1', '-f', String(from), '-l', String(to), 'doc.pdf', prefix], { cwd: dir, env: texEnv(t, dir), box, timeout: 60_000 }));
    // pdftoppm numbers its files with as many digits as the PDF has pages: named by page here.
    for (const f of fs.readdirSync(dir)) {
      const m = /^(r\d+x[a-f0-9]+)-(\d+)\.png$/.exec(f);
      if (m?.[1] === prefix) fs.renameSync(path.join(dir, f), fileOf(Number(m[2])));
    }
  };
  const before = drawing.get(pdfSha) ?? Promise.resolve();
  const job = before.then(make, make);
  drawing.set(pdfSha, job);
  try {
    await job;
  } finally {
    if (drawing.get(pdfSha) === job) drawing.delete(pdfSha);
  }
  touch(dir);
  return want.map(fileOf).filter((f) => fs.existsSync(f));
}

/**
 * Pictures (PNG) of a PDF's pages, `width` pixels wide: its first `pages` (at most MAX_SHOWN). Kept by the PDF's hash,
 * so asking again costs nothing.
 */
export async function pdfPictures(pdf: Buffer, o: { width: number; pages?: number }): Promise<Buffer[]> {
  const s = sha(pdf);
  const width = stepWidth(o.width);
  const last = Math.min(MAX_SHOWN, o.pages ?? MAX_SHOWN);
  const files = await renderPages(s, () => pdf, width, 1, last);
  return files.map((f) => fs.readFileSync(f));
}

/** A page's picture of a typesetting (by its key), `width` pixels wide; null when there is no such page. */
export async function texPagePicture(key: string, page: number, width: number): Promise<Buffer | null> {
  const k = keptResult(key);
  if (!k?.pdf || !k.pdfSha || !Number.isInteger(page) || page < 1 || page > k.pages) return null;
  const [file] = await renderPages(k.pdfSha, () => fs.readFileSync(path.join(ROOT, key, 'main.pdf')), stepWidth(width), page, page, Math.min(3, k.pages - page));
  return file ? fs.readFileSync(file) : null;
}

/** A PDF's first page as a PNG (a figure saved as PDF): 300 dpi, or less when that would be over 3000 pixels. */
export async function pdfToPng(pdf: Buffer): Promise<Buffer> {
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('it is not a PDF');
  const t = tools();
  const draw = t.pdftocairo ?? t.pdftoppm;
  if (!draw) throw new Error('turning PDF pictures into PNG needs poppler (Debian or Ubuntu: sudo apt install poppler-utils)');
  fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
  const dir = fs.mkdtempSync(path.join(ROOT, 'pic-'));
  try {
    fs.writeFileSync(path.join(dir, 'in.pdf'), pdf);
    const box = await sandbox(t);
    const env = texEnv(t, dir);
    let dpi = 300;
    if (t.pdfinfo) {
      const info = await runHeld([t.pdfinfo, '-f', '1', '-l', '1', 'in.pdf'], { cwd: dir, env, box, timeout: 15_000, writable: false });
      const m = /size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/.exec(info.out);
      if (m) dpi = Math.max(36, Math.min(300, Math.floor((3000 * 72) / Math.max(Number(m[1]), Number(m[2]), 1))));
    }
    const r = await slot(() => runHeld([draw, '-png', '-singlefile', '-r', String(dpi), '-f', '1', '-l', '1', 'in.pdf', 'out'], { cwd: dir, env, box, timeout: 60_000 }));
    const out = path.join(dir, 'out.png');
    if (!fs.existsSync(out)) throw new Error(`the PDF could not be drawn (${lastLines(r.out, 2) || 'no picture came out'})`);
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Where the source of a point on a page is (SyncTeX): the project's file and line, or null. */
export async function texSourceAt(key: string, page: number, x: number, y: number): Promise<{ file: string; line: number } | null> {
  const k = keptResult(key);
  const t = tools();
  if (!k?.pdf || !t.synctex || !(page >= 1 && page <= k.pages) || ![x, y].every((v) => Number.isFinite(v) && v >= 0 && v < 20000)) return null;
  const dir = path.join(ROOT, key);
  if (!fs.existsSync(path.join(dir, 'main.synctex.gz'))) return null;
  const r = await runHeld([t.synctex, 'edit', '-o', `${page}:${x.toFixed(2)}:${y.toFixed(2)}:main.pdf`], { cwd: dir, env: texEnv(t, dir), box: await sandbox(t), timeout: 10_000, writable: false });
  const input = /^Input:(.+)$/m.exec(r.out)?.[1];
  const line = Number(/^Line:(-?\d+)$/m.exec(r.out)?.[1]);
  if (!input || !(line > 0)) return null;
  const rel = path.relative(dir, path.resolve(dir, input.trim())).split(path.sep).join('/');
  const names = new Set(k.names);
  return names.has(rel) ? { file: rel, line } : null;
}

/** Where a line of the source shows in the PDF (SyncTeX): its page, and the box in points from the page's top left. */
export async function texPlaceOf(key: string, file: string, line: number): Promise<{ page: number; x: number; y: number; w: number; h: number } | null> {
  const k = keptResult(key);
  const t = tools();
  if (!k?.pdf || !t.synctex || !k.names.includes(file) || !(line >= 1 && line < 1_000_000)) return null;
  const dir = path.join(ROOT, key);
  if (!fs.existsSync(path.join(dir, 'main.synctex.gz'))) return null;
  const r = await runHeld([t.synctex, 'view', '-i', `${line}:0:${file}`, '-o', 'main.pdf'], { cwd: dir, env: texEnv(t, dir), box: await sandbox(t), timeout: 10_000, writable: false });
  const num = (re: RegExp) => Number(re.exec(r.out)?.[1]);
  const page = num(/^Page:(\d+)$/m);
  if (!(page >= 1)) return null;
  const h = num(/^h:([\d.-]+)$/m);
  const v = num(/^v:([\d.-]+)$/m);
  const W = num(/^W:([\d.-]+)$/m);
  const H = num(/^H:([\d.-]+)$/m);
  return { page, x: h || 0, y: (v || 0) - (H || 0), w: W || 0, h: H || 0 };
}

// ---- its own page --------------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const PAGE_CSS = [
  'html,body{margin:0;padding:0}',
  'body{background:var(--n-bg,#f6f5f1);color:var(--n-fg,#1b1915);font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}',
  'html[data-n-theme=dark] body{background:#000000;color:#e9edf5}',
  '.nt-top{padding:6px 12px 0}',
  '.nt-top summary{display:flex;align-items:center;gap:10px;list-style:none;cursor:pointer;color:var(--n-muted,#77736b);font-size:12px;padding:4px 0;user-select:none}',
  '.nt-top summary::-webkit-details-marker{display:none}',
  '.nt-top summary .nt-act{margin-left:auto;color:var(--n-accent,#8a6d1f)}',
  '.nt-top[open] .nt-show,.nt-top:not([open]) .nt-hide{display:none}',
  'pre{margin:6px 0 10px;padding:12px 14px;border-radius:10px;background:var(--n-card,#fff);border:1px solid var(--n-line,rgba(0,0,0,.1));font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;max-height:70vh;overflow:auto}',
  'html[data-n-theme=dark] pre{background:#1b1a18;border-color:rgba(255,255,255,.1)}',
  '.nt-pages{display:flex;flex-direction:column;gap:12px;padding:6px 12px 14px}',
  '.nt-pages img{display:block;width:100%;height:auto;background:#fff;border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,.16),0 0 0 1px rgba(0,0,0,.04)}',
  '.nt-note{margin:10px 12px 0;padding:10px 12px;border-radius:10px;background:var(--n-soft,rgba(0,0,0,.05));font-size:13px}',
  '.nt-more{color:var(--n-muted,#77736b);font-size:12px;text-align:center;padding:0 12px 14px}',
].join('');

const shell = (title: string, css: string, body: string) =>
  [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>`,
    '<meta name="generator" content="Hydor LaTeX">',
    `<style>${css}</style></head><body>`,
    body,
    '</body></html>',
  ].join('\n');

/** Why a document has no pages to show, in a line. */
function whyNot(r: TexResult): string {
  if (r.missing) return r.missing;
  const e = r.errors[0];
  return e
    ? `It could not be typeset: ${e.file ? `${e.file}${e.line ? `:${e.line}` : ''}: ` : ''}${e.message}${r.errors.length > 1 ? ` (and ${r.errors.length - 1} more)` : ''}${e.hint ? ` ${e.hint}` : ''}`
    : 'It could not be typeset.';
}

/** The source, with a note on why the pages are not shown. */
function sourcePage(doc: TexDoc, title: string, note: string): string {
  const others = doc.files.length + doc.pictures.length ? `<p class="nt-more" style="text-align:left;padding:0">Also in it: ${esc([...doc.files.map((f) => f.name), ...doc.pictures.map((p) => p.name)].join(', '))}</p>` : '';
  return shell(title, PAGE_CSS, `<div class="nt-note">${esc(note)}</div><div class="nt-top"><pre translate="no">${esc(doc.main)}</pre>${others}</div>`);
}

const pngSize = (b: Buffer) => (b.length > 24 && b.readUInt32BE(0) === 0x89504e47 ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null);

/**
 * The document's own page: its typeset pages as pictures, one under the other, filling the width, with a quiet line
 * and the source to open (`viewer`); every page on a printed page of its size (`print`); or its first page alone,
 * as a picture of it (`still`, 1280×800, for its picture in Pages). When it cannot be typeset, the source and why.
 */
export async function texPage(db: DB, doc: TexDoc, title: string, mode: 'viewer' | 'print' | 'still' = 'viewer'): Promise<string> {
  const r = await compileTex(db, doc);
  if (!r.pdf || !r.pages) return sourcePage(doc, title, whyNot(r));
  let pics: Buffer[];
  try {
    pics = await pdfPictures(r.pdf, { width: mode === 'still' ? 1100 : 1400, pages: mode === 'still' ? 1 : r.pages });
  } catch (e) {
    return sourcePage(doc, title, (e as Error).message);
  }
  if (!pics.length) return sourcePage(doc, title, 'Its pages could not be drawn as pictures.');
  // A page inside a frame stays light enough to open: past about 16 MB of pictures, the rest are in the PDF.
  let bytes = 0;
  const fit = pics.findIndex((b) => (bytes += b.length) > 16 * 1024 * 1024);
  if (fit > 0) pics = pics.slice(0, fit);
  const img = (b: Buffer, i: number) => {
    const s = pngSize(b);
    return `<img src="data:image/png;base64,${b.toString('base64')}" alt="Page ${i + 1}"${s ? ` width="${s.w}" height="${s.h}"` : ''}${i > 1 ? ' loading="lazy"' : ''}>`;
  };
  if (mode === 'still') {
    const css = 'html,body{margin:0;width:1280px;height:800px;overflow:hidden;background:#e7e5df}img{display:block;width:1100px;height:auto;margin:48px auto 0;box-shadow:0 2px 10px rgba(0,0,0,.18)}';
    return shell(title, css, img(pics[0], 0));
  }
  if (mode === 'print') {
    const size = r.sizes?.[0];
    const css = `@page{size:${size ? `${size.w}pt ${size.h}pt` : 'A4'};margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:100%;height:auto;break-after:page}img:last-child{break-after:auto}`;
    return shell(title, css, pics.map(img).join('\n'));
  }
  const more = r.pages > pics.length ? `<p class="nt-more">Pages ${pics.length + 1} to ${r.pages} are in the PDF.</p>` : '';
  const line = `Typeset with ${engineLabel(r.engine)} · ${r.pages} page${r.pages === 1 ? '' : 's'}`;
  const top = `<details class="nt-top"><summary><span>${line}</span><span class="nt-act nt-show">Show the source</span><span class="nt-act nt-hide">Hide the source</span></summary><pre translate="no">${esc(doc.main)}</pre></details>`;
  return shell(title, PAGE_CSS, `${top}\n<main class="nt-pages">\n${pics.map(img).join('\n')}\n</main>${more}`);
}

// ---- files ---------------------------------------------------------------------------------------------------------

/** main.tex alone. */
export const texSource = (doc: TexDoc) => doc.main;

/** The project as a .zip: main.tex, its files and its pictures, as TeX reads them. */
export function texZip(db: DB, doc: TexDoc): Buffer {
  const parts: { name: string; data: string | Buffer }[] = [{ name: TEX_MAIN, data: doc.main }, ...doc.files.map((f) => ({ name: f.name, data: f.text }))];
  for (const p of doc.pictures) {
    const b = pictureBytes(db, p);
    if (b) parts.push({ name: p.name, data: b });
  }
  return zipParts(parts);
}

/** The typeset PDF: 503 when there is no TeX here, 422 (with its first error) when it does not typeset. */
export async function texPdf(db: DB, doc: TexDoc): Promise<Buffer> {
  const r = await compileTex(db, doc);
  if (r.missing) throw new HttpError(503, r.missing);
  if (!r.pdf) throw new HttpError(422, whyNot(r));
  return r.pdf;
}

// ---- made from files ------------------------------------------------------------------------------------------------

interface Entry {
  name: string;
  data: Buffer;
}

/** A project's files from a folder of the agent's session (not its hidden files, nor what typesetting made). */
function readFolder(dir: string, notes: string[]): Entry[] {
  const out: Entry[] = [];
  let bytes = 0;
  const walk = (d: string, rel: string, depth: number) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__MACOSX') continue;
      const p = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory() && depth < 6) walk(p, r, depth + 1);
      else if (e.isFile()) {
        if (!/\.(tex|ltx|bib|bbl|bst|sty|cls|clo|cfg|def|fd|ist|bbx|cbx|lbx|txt|csv|tsv|dat|tikz|pgf|lua|png|jpe?g|pdf)$/i.test(e.name)) continue;
        const size = fs.statSync(p).size;
        if (size > 40 * 1024 * 1024 || bytes + size > 200 * 1024 * 1024 || out.length >= 600) {
          notes.push(`${r} was left out: the folder is too large to take in whole.`);
          continue;
        }
        bytes += size;
        out.push({ name: r, data: fs.readFileSync(p) });
      }
    }
  };
  walk(dir, '', 0);
  return out;
}

/** The project's files from a .zip (a dozen hundred at most, as unpacked within bounds). */
function zipEntries(buf: Buffer, notes: string[]): Entry[] {
  const z = new Zip(buf, 300 * 1024 * 1024);
  const out: Entry[] = [];
  for (const name of z.names()) {
    if (/(^|\/)(__MACOSX|\.[^/]*)(\/|$)/.test(name)) continue;
    if (!/\.(tex|ltx|bib|bbl|bst|sty|cls|clo|cfg|def|fd|ist|bbx|cbx|lbx|txt|csv|tsv|dat|tikz|pgf|lua|png|jpe?g|pdf|eps|svg|gif|webp)$/i.test(name)) continue;
    if (out.length >= 600) {
      notes.push('The .zip has more files than a document may: the rest were left out.');
      break;
    }
    const data = z.read(name, 40 * 1024 * 1024);
    if (!data || z.cut.has(name)) {
      notes.push(`${name} was left out: it could not be unpacked.`);
      continue;
    }
    out.push({ name: name.replace(/\\/g, '/'), data });
  }
  return out;
}

const PREFERRED = ['main.tex', 'paper.tex', 'thesis.tex', 'report.tex', 'article.tex', 'document.tex', 'ms.tex', 'manuscript.tex', 'cv.tex', 'resume.tex'];

/** A project from its files: the main file found (the .tex that starts a document), the rest named from its folder. */
async function projectFrom(list: Entry[], notes: string[]): Promise<{ main: string; files: { name: string; text: string }[]; pictures: { name: string; src: string }[]; engine: TexEngine }> {
  const texts = list.filter((e) => /\.(tex|ltx)$/i.test(e.name)).map((e) => ({ ...e, text: textOf(e.data) }));
  const starts = texts.filter((e) => /\\documentclass/.test(e.text) && /\\begin\s*\{document\}/.test(e.text));
  if (!starts.length) throw new Error('It holds no LaTeX document: no .tex file with \\documentclass and \\begin{document}.');
  const depth = (n: string) => n.split('/').length;
  starts.sort((a, b) => {
    const pa = PREFERRED.indexOf(path.basename(a.name).toLowerCase());
    const pb = PREFERRED.indexOf(path.basename(b.name).toLowerCase());
    return depth(a.name) - depth(b.name) || (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || b.text.length - a.text.length;
  });
  const mainEntry = starts[0];
  if (starts.length > 1) notes.push(`It has ${starts.length} documents; ${mainEntry.name} is the one taken as main.tex (${starts.slice(1).map((s) => s.name).join(', ')} came in as files).`);
  // TeX reads names from the main file's folder: the project starts there.
  const root = mainEntry.name.includes('/') ? mainEntry.name.slice(0, mainEntry.name.lastIndexOf('/') + 1) : '';
  const files: { name: string; text: string }[] = [];
  const pictures: { name: string; src: string }[] = [];
  const stems = new Set(list.filter((e) => /\.(tex|ltx)$/i.test(e.name)).map((e) => e.name.replace(/\.[^.]+$/, '').toLowerCase()));
  const used = new Set<string>();
  const sources = texts.map((e) => e.text).join('\n');
  const renamed: [string, string][] = [];
  for (const e of list) {
    if (e.name === mainEntry.name) continue;
    if (root && !e.name.startsWith(root)) {
      notes.push(`${e.name} was left out: it is outside the main file's folder (${root}).`);
      continue;
    }
    let name = e.name.slice(root.length);
    const ext = extOf(name);
    if (TEX_FILE_EXT.includes(ext)) {
      if (name.toLowerCase() === TEX_MAIN) name = 'main-1.tex';
      if (!cleanTexName(name, 'file') || used.has(name.toLowerCase())) {
        notes.push(`${e.name} was left out: its name is not one a document may have.`);
        continue;
      }
      if (files.length >= TEX_LIMITS.files) {
        notes.push(`${e.name} was left out: a document may have ${TEX_LIMITS.files} files.`);
        continue;
      }
      if (e.data.length > TEX_LIMITS.file) {
        notes.push(`${e.name} was left out: it is over ${TEX_LIMITS.file / 1024 / 1024} MB.`);
        continue;
      }
      used.add(name.toLowerCase());
      files.push({ name, text: textOf(e.data) });
      continue;
    }
    if (pictures.length >= TEX_LIMITS.pictures) {
      notes.push(`${e.name} was left out: a document may have ${TEX_LIMITS.pictures} pictures.`);
      continue;
    }
    let data: Buffer = e.data;
    if (ext === 'pdf') {
      const stem = name.replace(/\.pdf$/i, '');
      // The typeset document beside its source is no figure; a PDF no \includegraphics names is left out.
      if (stems.has(e.name.replace(/\.pdf$/i, '').toLowerCase())) continue;
      if (!new RegExp(`\\{\\s*(\\./)?${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.pdf)?\\s*\\}`).test(sources)) {
        notes.push(`${e.name} was left out: no \\includegraphics names it.`);
        continue;
      }
      try {
        data = await pdfToPng(e.data);
      } catch (err) {
        notes.push(`${e.name} was left out: ${(err as Error).message}.`);
        continue;
      }
      const to = `${stem}.png`;
      renamed.push([name, to]);
      notes.push(`The PDF picture ${name} became a PNG of it, ${to}.`);
      name = to;
    } else if (!['png', 'jpg', 'jpeg'].includes(ext)) {
      notes.push(`${e.name} was left out: LaTeX here takes PNG and JPEG pictures (and PDF ones, made into PNG); convert it first.`);
      continue;
    }
    const png = data[0] === 0x89 && data[1] === 0x50;
    const jpeg = data[0] === 0xff && data[1] === 0xd8;
    if (!png && !jpeg) {
      notes.push(`${e.name} was left out: it is not a PNG or JPEG picture.`);
      continue;
    }
    if (!cleanTexName(name, 'picture') || used.has(name.toLowerCase())) {
      notes.push(`${e.name} was left out: its name is not one a document may have.`);
      continue;
    }
    used.add(name.toLowerCase());
    pictures.push({ name, src: `data:image/${png ? 'png' : 'jpeg'};base64,${data.toString('base64')}` });
  }
  let main = mainEntry.text;
  // \includegraphics{x.pdf} for a figure that became x.png names the PNG now.
  if (renamed.length) {
    const fix = (s: string) =>
      s.replace(/(\\includegraphics\*?\s*(?:\[[^\]]*\]\s*)?\{\s*)([^}]*?)(\s*\})/g, (whole, a: string, n: string, b: string) => {
        const hit = renamed.find(([from]) => n.replace(/^\.\//, '') === from);
        return hit ? `${a}${hit[1]}${b}` : whole;
      });
    main = fix(main);
    for (const f of files) if (/\.(tex|ltx)$/i.test(f.name)) f.text = fix(f.text);
  }
  return { main, files, pictures, engine: guessEngine(main) };
}

/**
 * A document from a file someone opens: a .tex file, or a .zip of a project (its main file found; its files and its
 * PNG and JPEG pictures, PDF ones made into PNG). What could not come in is said in `notes`.
 */
export async function importTex(buf: Buffer, name: string): Promise<{ doc: TexDoc; notes: string[] }> {
  const notes: string[] = [];
  if (/\.zip$/i.test(name)) {
    const p = await projectFrom(zipEntries(buf, notes), notes);
    return { doc: normalizeTex(p), notes };
  }
  if (buf.length > TEX_LIMITS.main) throw new Error(`It is over ${TEX_LIMITS.main / 1024 / 1024} MB`);
  return { doc: normalizeTex({ main: textOf(buf) }), notes };
}

/** A document from a file someone opens (importTex, without its notes). */
export const texFromFile = async (buf: Buffer, name: string) => (await importTex(buf, name)).doc;

// ---- what an agent is told -------------------------------------------------------------------------------------------

const issueLine = (x: TexIssue) => `- ${x.file ? `${x.file}${x.line ? `:${x.line}` : ''}: ` : x.line ? `line ${x.line}: ` : ''}${x.message}${x.hint ? ` (${x.hint})` : ''}`;

/** A typesetting in a few lines, for the agent that saved the document (`pdf`: the PDF, or whether there is one). */
export function compileSummary(r: Omit<TexResult, 'pdf'> & { pdf?: Buffer | boolean }): string {
  if (r.missing) return `It is kept, but not typeset: ${r.missing}`;
  const label = engineLabel(r.engine);
  const warn = r.warnings.length ? `\n${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}:\n${r.warnings.slice(0, 8).map(issueLine).join('\n')}${r.warnings.length > 8 ? '\n- …' : ''}` : '';
  if (r.ok) return `Typeset with ${label}: ${r.pages} page${r.pages === 1 ? '' : 's'}, no errors.${warn}`;
  const head = r.pdf
    ? `Typeset with ${label}, with ${r.errors.length} error${r.errors.length === 1 ? '' : 's'} (${r.pages} page${r.pages === 1 ? '' : 's'} made anyway, maybe not as meant):`
    : `It did not typeset with ${label}: ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}, no PDF:`;
  return `${head}\n${r.errors.slice(0, 12).map(issueLine).join('\n')}${r.errors.length > 12 ? '\n- …' : ''}${warn}\nFix them and save again with the same id.`;
}

/** The keys of a .bib's entries, to cite. */
const bibKeys = (text: string) => [...text.matchAll(/@\s*([A-Za-z]+)\s*[{(]\s*([^,\s]+)\s*,/g)].filter((m) => !/^(comment|string|preamble)$/i.test(m[1])).map((m) => m[2]);

/** What get_page tells an agent of a LaTeX document: its outline, its files, and how it last typeset. */
export function texForAgent(text: string): string {
  const d = readTex(text);
  const out: string[] = [];
  const n = d.files.length;
  out.push(
    `A LaTeX document (${engineLabel(d.engine)}): main.tex${n ? ` and ${n} other file${n === 1 ? '' : 's'} (${d.files.map((f) => f.name).join(', ')})` : ''}${d.pictures.length ? `; ${d.pictures.length} picture${d.pictures.length === 1 ? '' : 's'}: ${d.pictures.map((p) => `${p.name} (${p.src})`).join(', ')}` : ''}.`,
  );
  const outline = texOutline(d);
  const top = Math.min(...outline.map((h) => h.level));
  if (outline.length) out.push(`\nOutline:\n${outline.slice(0, 200).map((h) => `${'  '.repeat(h.level - top)}- ${h.title} (${h.file}:${h.line})`).join('\n')}`);
  const k = keptResult(keyOf(d));
  if (k) out.push(`\nAs last typeset: ${compileSummary(k).replace(/\nFix them and save again with the same id\.$/, '')}`);
  else out.push('\nIt has not been typeset in this version yet.');
  out.push('\nTo change it: save_latex with this id and what changes (source for main.tex, files to add or replace, pictures to add); what you leave out stays as it is. Keep naget-asset: pictures as they are.');
  let budget = 150_000;
  const show = (name: string, body: string) => {
    let s = body;
    if (name.endsWith('.bib') && s.length > 20_000) {
      const keys = bibKeys(s);
      s = `${s.slice(0, 20_000)}\n… (cut: ${Math.round(body.length / 1024)} KB in all; its ${keys.length} entries: ${keys.join(', ').slice(0, 8000)})`;
    } else if (s.length > budget) s = `${s.slice(0, Math.max(2000, budget))}\n… (cut: ${Math.round(body.length / 1024)} KB in all; to change this file, send it whole, or change other files and leave this one out)`;
    budget -= s.length;
    out.push(`\n=== ${name} ===\n${s}`);
  };
  show(TEX_MAIN, d.main);
  for (const f of d.files) {
    if (budget <= 0) {
      out.push(`\n=== ${f.name} === (not shown: ${Math.round(f.text.length / 1024)} KB; left out of save_latex, it stays as it is)`);
      continue;
    }
    show(f.name, f.text);
  }
  return out.join('\n');
}

const LATEX_HELP = [
  'Make or change a LaTeX document, kept in the user’s Library: a paper, a thesis, a CV, a letter, a report, math-heavy notes, a beamer talk, anything the user wants typeset with LaTeX. It shows in the conversation and in the Library as its typeset pages; there the user edits the source beside its PDF (typeset again as they type) and downloads the PDF, main.tex or the whole project as a .zip. Use it rather than writing .tex files when the user asks for LaTeX, unless they want the files in a folder of theirs.',
  'source: the whole of main.tex, from \\documentclass to \\end{document}. files: the other files it reads, by the names it gives them ({"refs.bib": "…", "chapters/intro.tex": "…"}, or [{name, text}], or {name, path} for a file of this session); names are letters, digits, - _ . and / between folders. Or folder: a LaTeX project folder of this session, taken in whole.',
  'pictures: what \\includegraphics shows, each by the name it uses: [{"name": "figures/plot.png", "src": "plots/plot.png"}] with src a PNG or JPEG file of this session, a public https address, or a picture of the document already (naget-asset:…); a path alone is its own name. A PDF picture becomes a PNG of it.',
  'engine: pdflatex (the default), xelatex (Unicode text and this computer’s fonts with fontspec: Greek, Chinese and other scripts), or lualatex. Packages: those of a standard TeX Live (amsmath, graphicx, hyperref, geometry, tikz, pgfplots, booktabs, beamer, natbib…); for a bibliography, a .bib file with \\bibliography and BibTeX (biblatex and biber may be missing). Nothing that runs programs (minted, svg, shell escape): it is turned off.',
  'The answer says whether it typeset, with each error’s file, line and what it most likely means: fix them and save again with the same id.',
  'To change a document: get_page with its id gives every file; send save_latex with that id and only what changes (source for main.tex, files to add or replace, an empty text or remove: [names] to take one out, pictures to add); what you leave out stays as it is. Each save is a new version, the older ones restorable. Keep what the user changed.',
].join(' ');

export const SAVE_LATEX_DESCRIPTION = LATEX_HELP;

export const SAVE_LATEX_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'A saved LaTeX document’s id, to save a new version of it.' },
    title: { type: 'string', description: 'Its name in the Library: "Thesis", "CV".' },
    source: { type: 'string', description: 'The whole of main.tex, from \\documentclass to \\end{document}.' },
    files: {
      description: 'The other files it reads, by name: {"refs.bib": "…"} or [{"name": "chapters/intro.tex", "text": "…"}] ({"name", "path"} for a file of this session).',
      anyOf: [{ type: 'object' }, { type: 'array', items: { type: 'object' } }],
    },
    pictures: {
      description: 'Its pictures by the name \\includegraphics uses: [{"name": "figures/plot.png", "src": "plots/plot.png"}] (a file of this session, an https address, or naget-asset:…), or paths alone.',
      anyOf: [{ type: 'object' }, { type: 'array', items: { anyOf: [{ type: 'object' }, { type: 'string' }] } }],
    },
    engine: { type: 'string', enum: ['pdflatex', 'xelatex', 'lualatex'] },
    folder: { type: 'string', description: 'Instead of source and files: a LaTeX project folder of this session, taken in whole.' },
    remove: { type: 'array', items: { type: 'string' }, description: 'With id: names of files or pictures to take out.' },
  },
  required: ['title'],
};

// ---- the editor's routes --------------------------------------------------------------------------------------------

/** What this computer can do with LaTeX: which engines it has, and whether it can show pages and shut TeX in. */
export async function texSetup(): Promise<TexSetup> {
  const t = tools();
  const box = t.pdflatex || t.xelatex || t.lualatex || t.pdftoppm ? await sandbox(t) : null;
  const notes: Partial<Record<TexEngine, string>> = {};
  for (const e of ['pdflatex', 'xelatex', 'lualatex'] as TexEngine[]) {
    const m = missingFor(t, e);
    if (m) notes[e] = m;
    else if (e === 'lualatex' && !box) notes[e] = LUA_UNSAFE;
  }
  const any = !!(t.pdflatex || t.xelatex || t.lualatex);
  return {
    engines: { pdflatex: !!t.pdflatex, xelatex: !!t.xelatex, lualatex: !!t.lualatex && !!box },
    latexmk: !!t.latexmk,
    bibtex: !!t.bibtex,
    pictures: !!t.pdftoppm,
    sync: !!t.synctex,
    sandbox: !!box,
    missing: any ? undefined : missingFor(t, 'pdflatex')!,
    notes,
  };
}

/** A typesetting as the editor gets it: everything but the PDF itself. */
const forEditor = (r: TexResult): TexCompiled => ({
  key: r.key,
  ok: r.ok,
  pdf: !!r.pdf,
  pages: r.pages,
  sizes: r.sizes,
  errors: r.errors,
  warnings: r.warnings,
  log: r.log,
  engine: r.engine,
  missing: r.missing,
  ms: r.ms,
  sandboxed: r.sandboxed,
});

/**
 * The editor's live preview, signed in:
 *   GET  /api/pages/tex/setup — what this computer has: { engines, latexmk, bibtex, pictures, sync, sandbox, missing?, notes }
 *   POST /api/pages/tex/compile { model, base? } — typesets the editor's model as it is (saved or not):
 *        { key, ok, pdf, pages, sizes, errors, warnings, log, engine, missing?, ms }
 *   GET  /api/pages/tex/:key/:page?w= — a page's picture (PNG), w pixels wide
 *   GET  /api/pages/tex/:key/pdf — the PDF
 *   GET  /api/pages/tex/:key/sync?page=&x=&y= — the source of a point of a page (points from its top left): { file, line } or {}
 *   GET  /api/pages/tex/:key/place?file=&line= — where a line shows: { page, x, y, w, h } or {}
 *   POST /api/pages/tex/picture { name, data } — a picture for a document (PNG, JPEG, or PDF made into PNG): { name, src }
 * Keys are typesettings' hashes; nothing outside their folders is ever served.
 */
export function texRoutes(app: FastifyInstance, db: DB) {
  const P = (req: { params: unknown }) => req.params as Record<string, string>;
  app.get('/api/pages/tex/setup', async () => texSetup());
  app.post('/api/pages/tex/compile', { bodyLimit: 24 * 1024 * 1024 }, async (req) => {
    const b = (req.body ?? {}) as { model?: unknown; base?: unknown; folder?: unknown };
    let doc: TexDoc;
    try {
      doc = normalizeTex(b.model);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    // A file's document (opened from Files): typeset in its folder, when that may be read.
    const folder = typeof b.folder === 'string' && b.folder ? path.resolve(b.folder) : undefined;
    const r = await compileTex(db, doc, { base: typeof b.base === 'string' ? b.base : undefined, folder: folder && texFolderOk(folder) ? folder : undefined });
    return forEditor(r);
  });
  app.get('/api/pages/tex/:key/pdf', async (req, reply) => {
    const key = P(req).key;
    const k = keptResult(key);
    if (!k?.pdf) return reply.code(404).send({ error: 'No such typesetting' });
    touch(path.join(ROOT, key));
    return reply
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .header('Content-Disposition', 'inline; filename="document.pdf"')
      .type('application/pdf')
      .send(fs.createReadStream(path.join(ROOT, key, 'main.pdf')));
  });
  app.get('/api/pages/tex/:key/sync', async (req) => {
    const q = req.query as { page?: string; x?: string; y?: string };
    return (await texSourceAt(P(req).key, Number(q.page), Number(q.x), Number(q.y))) ?? {};
  });
  app.get('/api/pages/tex/:key/place', async (req) => {
    const q = req.query as { file?: string; line?: string };
    return (await texPlaceOf(P(req).key, String(q.file ?? ''), Number(q.line))) ?? {};
  });
  app.get('/api/pages/tex/:key/:page', async (req, reply) => {
    const { key, page } = P(req);
    const w = Number((req.query as { w?: string }).w ?? 1200);
    const png = await texPagePicture(key, Number(page), w);
    if (!png) return reply.code(404).send({ error: 'No such page' });
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type('image/png').send(png);
  });
  app.post('/api/pages/tex/picture', { bodyLimit: 56 * 1024 * 1024 }, async (req) => {
    const b = (req.body ?? {}) as { name?: unknown; data?: unknown };
    if (typeof b.data !== 'string') throw new HttpError(400, 'Send the picture as data (base64, or a data: address) with its name');
    const raw = Buffer.from(b.data.replace(/^data:[^;,]*;base64,/, ''), 'base64');
    // A name TeX may be given: the file's own, its odd characters made dashes.
    let name =
      (typeof b.name === 'string' ? b.name : '')
        .split(/[\\/]/)
        .pop()!
        .replace(/[^A-Za-z0-9_.+-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/-+\./g, '.')
        .replace(/^[-.]+|[-.]+$/g, '')
        .slice(0, 80) || 'picture.png';
    let data: Buffer = raw;
    if (raw.subarray(0, 5).toString('latin1') === '%PDF-') {
      try {
        data = await pdfToPng(raw);
      } catch (e) {
        throw new HttpError(422, `That PDF could not be made into a picture: ${(e as Error).message}`);
      }
      name = name.replace(/\.pdf$/i, '') + '.png';
    }
    const png = data[0] === 0x89 && data[1] === 0x50;
    const jpeg = data[0] === 0xff && data[1] === 0xd8;
    if (!png && !jpeg) throw new HttpError(415, 'LaTeX takes PNG, JPEG or PDF pictures');
    const ext = extOf(name);
    if (!['png', 'jpg', 'jpeg'].includes(ext) || (ext === 'png') !== png) name = `${ext ? name.slice(0, -ext.length - 1) : name}.${png ? 'png' : 'jpg'}`;
    return { name, src: ASSET + putAsset(db, data) };
  });
}
