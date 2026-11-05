// A LaTeX document made ready for elsewhere: the arXiv package (Export → arXiv package (.zip)) and the paper on disk
// for the ready-made apps that take one (the editor's Tools → Your paper).
//
// The package: arXiv publishes the source as it is sent, so its comments come out (safely: a \% stays, and so does
// what TeX takes as it is, in verbatim, listings and the addresses of \url and \href; \begin{comment} blocks go, and
// \iffalse … \fi blocks when asked); only the files the paper uses go in (the pictures \includegraphics shows, with
// \graphicspath and the extensions TeX tries, the .tex files it reads, its own styles, classes and data); the .bbl of
// the last typesetting goes in under main.bbl and the .bib stays out (arXiv uses a .bbl it finds); \input and
// \include can be written into main.tex; names with spaces get dashes, and the source follows. It is then typeset as
// it is, in the same sandbox as every document, to see it builds; what is large (arXiv takes 50 MB at most, and
// warns of pictures over 34 megapixels), what was left out and what to pick on arXiv is said; and it is kept an hour
// to download.
//
// The paper on disk: a Library document's files, pictures and last PDF written to a folder of the app's data
// (pages/papers/<id>), so an app can read it by its path; a file's document is its own folder, its PDF written there.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { extOf, normalizeTex, TEX_MAIN, type TexDoc } from '../../shared/latex.ts';
import { ARXIV_DEFAULTS, type ArxivOptions, type ArxivPackage } from '../../shared/latex-submit.ts';
import { getAsset } from './assets.ts';
import { compileTex, readTex, texFolderOk, texOutput } from './latex.ts';
import { cleanTex, readsIn, scanTex, texSources, type Span, type TexSource } from './latex-paper.ts';
import { zipParts } from './ooxml.ts';
import { mustPage, pageInfo, pageSource } from './store.ts';

const ARXIV_DIR = path.join(config.dataDir, 'pages', 'tex', 'arxiv');
const PAPERS = path.join(config.dataDir, 'pages', 'papers');
/** arXiv's limits: the whole submission, and the pictures it warns of. */
const ARXIV_MAX = 50 * 1024 * 1024;
const MEGAPIXELS = 34;

// ---- comments out ------------------------------------------------------------------------------------------------

/** A span grown to its whole lines (with the line break after), when nothing but spaces is beside it on them. */
function wholeLines(s: string, sp: Span): Span {
  const ls = s.lastIndexOf('\n', sp.from - 1) + 1;
  let le = s.indexOf('\n', sp.to);
  if (le < 0) le = s.length;
  if (s.slice(ls, sp.from).trim() || s.slice(sp.to, le).trim()) return sp;
  return { from: ls, to: le < s.length ? le + 1 : le };
}

/**
 * A source without its comments, as arXiv should get it: a line that is only a comment goes whole; a comment after
 * text goes but its % stays (so the line still runs into the next as it did); \begin{comment} blocks go, and
 * \iffalse … \fi blocks with `iffalse`. A \% is text, and so is what TeX takes as it is (verbatim, listings, \verb,
 * the addresses of \url and \href).
 */
export function stripComments(s: string, o: { iffalse?: boolean } = {}): { text: string; comments: number; blocks: number } {
  const scan = scanTex(s);
  const cut: (Span & { keep?: string })[] = [];
  const blocks = [...scan.commentEnvs, ...(o.iffalse ? scan.iffalse : [])].map((b) => wholeLines(s, b));
  const inBlock = (at: number) => blocks.some((b) => at >= b.from && at < b.to);
  for (const b of blocks) cut.push(b);
  let comments = 0;
  for (const c of scan.comments) {
    if (inBlock(c.from)) continue;
    if (c.own) {
      const ls = s.lastIndexOf('\n', c.from - 1) + 1;
      cut.push({ from: ls, to: c.to < s.length ? c.to + 1 : c.to });
      comments++;
    } else if (c.to > c.from + 1) {
      cut.push({ from: c.from + 1, to: c.to });
      comments++;
    }
  }
  // From the end, so each cut's place is still right; spans inside one already cut are skipped.
  cut.sort((a, b) => b.from - a.from);
  let out = s;
  let floor = Infinity;
  for (const c of cut) {
    if (c.to > floor) continue;
    out = out.slice(0, c.from) + out.slice(c.to);
    floor = c.from;
  }
  return { text: out, comments, blocks: blocks.length };
}

// ---- the files it uses ----------------------------------------------------------------------------------------------

const stem = (n: string) => n.replace(/\.[^./]+$/, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The files and pictures a paper uses, from main.tex on (its styles' own \RequirePackage too); `bib`: its .bib and .bst as well. */
export function usedFiles(doc: TexDoc, sources: TexSource[], bib: boolean): { files: Set<string>; pictures: Set<string> } {
  const files = new Set(sources.map((s) => s.name).filter((n) => n !== TEX_MAIN));
  const pictures = new Set<string>();
  const texts = new Map(sources.map((s) => [s.name, s.clean]));
  const all = () => [...texts.values()].join('\n');
  // Pictures: by \includegraphics (in the folders \graphicspath names, with the extensions TeX tries), or named anywhere.
  const dirs = [''];
  for (const m of all().matchAll(/\\graphicspath\s*\{((?:\s*\{[^{}]*\})+)\s*\}/g)) for (const d of m[1].matchAll(/\{([^{}]*)\}/g)) dirs.push(d[1].trim().replace(/^\.\//, ''));
  const picNames = new Set(doc.pictures.map((p) => p.name));
  for (const m of all().matchAll(/\\includegraphics\*?\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/g)) {
    const n = m[1]
      .trim()
      .replace(/^\.\//, '')
      .replace(/^"(.*)"$/, '$1');
    for (const d of dirs) for (const cand of [n, `${n}.png`, `${n}.jpg`, `${n}.jpeg`, `${n}.PNG`, `${n}.JPG`]) if (picNames.has(`${d}${cand}`)) pictures.add(`${d}${cand}`);
    // A PDF picture became a PNG of it when it came in.
    const png = `${stem(n)}.png`;
    for (const d of dirs) if (/\.pdf$/i.test(n) && picNames.has(`${d}${png}`)) pictures.add(`${d}${png}`);
  }
  // Other files: styles and classes by their commands, the bibliography when it is sent, the rest when its name is in a kept file.
  for (let round = 0; round < 6; round++) {
    const text = all();
    const pkgs = new Set([...text.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g)].flatMap((m) => m[1].split(',').map((x) => x.trim())));
    const classes = new Set([...text.matchAll(/\\(?:documentclass|LoadClass)\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g)].map((m) => m[1].trim()));
    const themes = new Set([...text.matchAll(/\\use(color|font|inner|outer|)theme\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g)].map((m) => `beamer${m[1]}theme${m[2].trim()}`));
    const bibs = new Set([...text.matchAll(/\\bibliography\s*\{([^{}]*)\}/g)].flatMap((m) => m[1].split(',').map((x) => `${x.trim().replace(/\.bib$/, '')}.bib`)));
    for (const m of text.matchAll(/\\addbibresource\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g)) bibs.add(m[1].trim());
    const styles = new Set([...text.matchAll(/\\bibliographystyle\s*\{([^{}]*)\}/g)].map((m) => `${m[1].trim()}.bst`));
    let added = false;
    for (const f of doc.files) {
      if (files.has(f.name)) continue;
      const ext = extOf(f.name);
      const base = stem(f.name);
      const named = (base.length >= 3 && new RegExp(`(^|[{\\s,/])${esc(base)}(\\.${esc(ext)})?([}\\s,]|$)`).test(text)) || text.includes(f.name);
      const use = ext === 'sty' ? pkgs.has(base) || themes.has(base) : ext === 'cls' ? classes.has(base) : ext === 'bib' ? bib && bibs.has(f.name) : ext === 'bst' ? bib && styles.has(f.name) : ext === 'bbl' ? false : named;
      if (!use) continue;
      files.add(f.name);
      texts.set(f.name, ['tex', 'ltx', 'sty', 'cls', 'tikz', 'pgf', 'cfg', 'def', 'clo'].includes(ext) ? cleanTex(f.text) : '');
      added = true;
    }
    for (const p of doc.pictures) if (!pictures.has(p.name) && stem(p.name).length >= 3 && new RegExp(`[{/\\s]${esc(stem(p.name.split('/').pop()!))}(\\.\\w+)?[}\\s]`).test(text)) pictures.add(p.name);
    if (!added) break;
  }
  return { files, pictures };
}

// ---- \input and \include into main.tex ----------------------------------------------------------------------------

/** A source with the files it reads written in where it reads them (\include with its page breaks), those files in turn too. */
export function flattenTex(doc: TexDoc, texts: Map<string, string>, name = TEX_MAIN, depth = 0, seen = new Set<string>()): string {
  const text = texts.get(name) ?? '';
  if (depth > 10) return text;
  seen.add(name);
  const reads = readsIn(doc, cleanTex(text)).filter((r) => texts.has(r.name) && !seen.has(r.name));
  let out = text;
  for (const r of [...reads].reverse()) {
    const inner = flattenTex(doc, texts, r.name, depth + 1, seen).replace(/\s+$/, '');
    const body = r.how === 'include' ? `\\clearpage\n${inner}\n\\clearpage` : inner;
    out = out.slice(0, r.at) + body + out.slice(r.end);
  }
  return out;
}

// ---- names TeX and arXiv take ----------------------------------------------------------------------------------------

/** A name with only letters, digits, - _ . + and /: spaces and the rest as dashes. */
const plainName = (n: string) => n.replace(/[^A-Za-z0-9._/+-]+/g, '-').replace(/-{2,}/g, '-');

/** References to `from` in a source (an argument naming it, with or without its extension) made to name `to`. */
function renameIn(text: string, from: string, to: string): string {
  return text.replace(/(\\[A-Za-z@]+\*?\s*(?:\[[^\]]*\]\s*)?\{)([^{}]*)(\})/g, (all, a: string, arg: string, b: string) => {
    const parts = arg.split(',').map((p) => {
      const n = p.trim().replace(/^\.\//, '');
      if (n === from) return p.replace(n, to);
      if (n === stem(from)) return p.replace(n, stem(to));
      return p;
    });
    const next = parts.join(',');
    return next === arg ? all : `${a}${next}${b}`;
  });
}

// ---- a picture's size ------------------------------------------------------------------------------------------------

/** A PNG's or JPEG's width and height in pixels, or null. */
export function pictureSize(b: Buffer): { w: number; h: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

const pictureData = (db: DB, src: string): Buffer | null => {
  if (src.startsWith('naget-asset:')) return getAsset(db, src.slice('naget-asset:'.length))?.data ?? null;
  const m = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(src);
  return m ? Buffer.from(m[1], 'base64') : null;
};

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;

// ---- the package --------------------------------------------------------------------------------------------------

/** Makes a document's arXiv package: the .zip, and what it holds, what was left out and how it typeset. */
export async function arxivPackage(db: DB, doc: TexDoc, opts: ArxivOptions, title: string): Promise<{ zip: Buffer; report: Omit<ArxivPackage, 'token'> }> {
  const removed: string[] = [];
  const warnings: string[] = [];
  const sources = texSources(doc);
  const usesBib = sources.some((s) => /\\(bibliography|addbibresource)\s*(\[[^\]]*\])?\s*\{/.test(s.clean));
  const biblatex = sources.some((s) => /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\bbiblatex\b/.test(s.clean));
  // The bibliography as it was typeset here.
  let bbl: Buffer | null = null;
  if (opts.bbl && usesBib) {
    const r = await compileTex(db, doc);
    bbl = r.pdf ? texOutput(r.key, 'main.bbl') : null;
    if (!bbl) warnings.push('There is no .bbl to add (the document did not typeset with its bibliography here), so the .bib goes in and arXiv runs BibTeX itself.');
  }
  const withBib = !bbl;
  const used = opts.unused ? usedFiles(doc, sources, withBib) : { files: new Set(doc.files.map((f) => f.name).filter((n) => withBib || !/\.(bib|bst)$/i.test(n))), pictures: new Set(doc.pictures.map((p) => p.name)) };
  const leftOut = [...doc.files.map((f) => f.name).filter((n) => !used.files.has(n)), ...doc.pictures.map((p) => p.name).filter((n) => !used.pictures.has(n))];
  const bibsOut = leftOut.filter((n) => /\.(bib|bst|bbl)$/i.test(n));
  const unusedOut = leftOut.filter((n) => !/\.(bib|bst|bbl)$/i.test(n));
  if (unusedOut.length) removed.push(`Files the paper does not use: ${unusedOut.slice(0, 12).join(', ')}${unusedOut.length > 12 ? ` and ${unusedOut.length - 12} more` : ''}.`);
  if (bbl && bibsOut.length) removed.push(`${bibsOut.join(', ')} (the .bbl is there instead).`);
  // The sources, comments out.
  const texts = new Map<string, string>([[TEX_MAIN, doc.main], ...doc.files.filter((f) => used.files.has(f.name)).map((f) => [f.name, f.text] as [string, string])]);
  let comments = 0;
  let blocks = 0;
  if (opts.strip)
    for (const [name, text] of texts) {
      if (!/\.(tex|ltx)$/i.test(name)) continue;
      const s = stripComments(text, { iffalse: opts.iffalse });
      texts.set(name, s.text);
      comments += s.comments;
      blocks += s.blocks;
    }
  if (comments) removed.push(`${comments} comment${comments === 1 ? '' : 's'}.`);
  if (blocks) removed.push(`${blocks} block${blocks === 1 ? '' : 's'} of switched-off text (\\begin{comment}${opts.iffalse ? ' and \\iffalse' : ''}).`);
  // \input and \include into main.tex.
  if (opts.flatten) {
    const before = [...texts.keys()].filter((n) => /\.(tex|ltx)$/i.test(n) && n !== TEX_MAIN);
    texts.set(TEX_MAIN, flattenTex(doc, texts));
    const still = new Set(readsIn(doc, cleanTex(texts.get(TEX_MAIN)!)).map((r) => r.name));
    for (const n of before) if (!still.has(n)) texts.delete(n);
  }
  if (opts.pdfoutput && doc.engine === 'pdflatex' && !/\\pdfoutput\s*=\s*1/.test(texts.get(TEX_MAIN)!.split('\n').slice(0, 5).join('\n'))) texts.set(TEX_MAIN, `\\pdfoutput=1\n${texts.get(TEX_MAIN)}`);
  // Names without spaces, the source following.
  const renamed: [string, string][] = [];
  const pictures = doc.pictures.filter((p) => used.pictures.has(p.name)).map((p) => ({ ...p }));
  const taken = new Set([...texts.keys(), ...pictures.map((p) => p.name)].map((n) => n.toLowerCase()));
  const rename = (from: string): string => {
    let to = plainName(from);
    if (to === from) return from;
    for (let i = 2; taken.has(to.toLowerCase()); i++) to = `${stem(plainName(from))}-${i}${extOf(from) ? `.${extOf(from)}` : ''}`;
    taken.add(to.toLowerCase());
    renamed.push([from, to]);
    return to;
  };
  for (const p of pictures) {
    const to = rename(p.name);
    if (to !== p.name) {
      for (const [n, t] of texts) if (/\.(tex|ltx|sty|cls)$/i.test(n)) texts.set(n, renameIn(t, p.name, to));
      p.name = to;
    }
  }
  for (const n of [...texts.keys()]) {
    if (n === TEX_MAIN) continue;
    const to = rename(n);
    if (to === n) continue;
    const t = texts.get(n)!;
    texts.delete(n);
    texts.set(to, t);
    for (const [m, x] of texts) if (/\.(tex|ltx|sty|cls)$/i.test(m)) texts.set(m, renameIn(x, n, to));
  }
  // The package, typeset as it is.
  const files = [...texts].filter(([n]) => n !== TEX_MAIN).map(([name, text]) => ({ name, text }));
  if (bbl) files.push({ name: 'main.bbl', text: bbl.toString('utf8') });
  let compiled: ArxivPackage['compiled'] = { ok: false, pages: 0, errors: [] };
  try {
    const pkg = normalizeTex({ main: texts.get(TEX_MAIN)!, engine: doc.engine, files, pictures });
    const r = await compileTex(db, pkg);
    compiled = { ok: r.ok, pages: r.pages, errors: r.errors.slice(0, 8).map((e) => ({ file: e.file, line: e.line, message: e.message })), missing: r.missing };
    if (!r.missing && !r.pdf) warnings.push('The package did not typeset here: arXiv would refuse it. See the errors below.');
    else if (!r.missing && r.errors.length) warnings.push('The package typeset with errors here: look at them before you upload it.');
  } catch (e) {
    compiled = { ok: false, pages: 0, errors: [{ message: (e as Error).message }] };
  }
  // What arXiv should be told, and what it may not like.
  if (doc.engine === 'xelatex') warnings.push('When you submit, pick XeLaTeX as arXiv’s processor.');
  else if (doc.engine === 'lualatex') warnings.push('arXiv does not typeset with LuaLaTeX: switch to pdfLaTeX or XeLaTeX first, or upload the PDF itself.');
  else warnings.push('When you submit, pick pdfLaTeX as arXiv’s processor.');
  if (bbl && biblatex) {
    const v = /bbl format version\s+([\d.]+)/.exec(bbl.toString('utf8').slice(0, 2000))?.[1];
    if (v && v !== '3.3') warnings.push(`This .bbl is biblatex’s format ${v}: arXiv’s default TeX Live 2025 takes only 3.3. Pick TeX Live 2023 when you submit, or untick “Add the .bbl” so arXiv runs Biber itself.`);
  }
  const parts: { name: string; data: string | Buffer }[] = [{ name: TEX_MAIN, data: texts.get(TEX_MAIN)! }, ...files.map((f) => ({ name: f.name, data: f.text }))];
  for (const p of pictures) {
    const data = pictureData(db, p.src);
    if (!data) {
      warnings.push(`The picture ${p.name} is no longer kept, so it is not in the package.`);
      continue;
    }
    const size = pictureSize(data);
    if (size && (size.w * size.h) / 1e6 > MEGAPIXELS) warnings.push(`${p.name} is ${Math.round((size.w * size.h) / 1e6)} megapixels: arXiv warns of pictures over ${MEGAPIXELS}. A smaller one prints as well.`);
    parts.push({ name: p.name, data });
  }
  const zip = zipParts(parts);
  if (zip.length > ARXIV_MAX) warnings.unshift(`It is ${mb(zip.length)}: arXiv takes 50 MB at most. Make the largest pictures smaller.`);
  else if (zip.length > 10 * 1024 * 1024) warnings.push(`It is ${mb(zip.length)}: arXiv takes it, but readers download all of it. Smaller pictures would help.`);
  return {
    zip,
    report: {
      name: `${(title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'paper').slice(0, 60)}-arxiv.zip`,
      bytes: zip.length,
      files: parts.map((p) => ({ name: p.name, bytes: typeof p.data === 'string' ? Buffer.byteLength(p.data) : p.data.length })),
      removed,
      renamed,
      compiled,
      warnings,
    },
  };
}

/** Packages made, kept an hour to download: token → file name. */
const made = new Map<string, { name: string; at: number }>();

function keepZip(zip: Buffer, name: string): string {
  fs.mkdirSync(ARXIV_DIR, { recursive: true, mode: 0o700 });
  // The ones older than an hour go.
  for (const f of fs.readdirSync(ARXIV_DIR)) {
    const st = fs.statSync(path.join(ARXIV_DIR, f), { throwIfNoEntry: false });
    if (st && Date.now() - st.mtimeMs > 3600_000) fs.rmSync(path.join(ARXIV_DIR, f), { force: true });
  }
  const token = crypto.randomBytes(12).toString('hex');
  fs.writeFileSync(path.join(ARXIV_DIR, `${token}.zip`), zip);
  made.set(token, { name, at: Date.now() });
  return token;
}

// ---- the paper on disk, for the apps that take one --------------------------------------------------------------------

const slug = (s: string) => (s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'paper').slice(0, 60);

/**
 * Where a paper is on this computer, for an app to read: a Library document's files, pictures and PDF written to its
 * own folder of the app's data (written again each time); a file's document is its own folder, its PDF beside the
 * app's copy. `pdf` is missing when it does not typeset.
 */
export async function paperOnDisk(db: DB, doc: TexDoc, o: { page?: string; folder?: string; title: string; base?: string }): Promise<{ folder: string; pdf?: string }> {
  const r = await compileTex(db, doc, { base: o.base, folder: o.folder });
  const id = o.page
    ? o.page.replace(/[^\w-]/g, '')
    : `file-${crypto
        .createHash('sha256')
        .update(o.folder ?? '')
        .digest('hex')
        .slice(0, 12)}`;
  const dir = path.join(PAPERS, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const inside = (name: string) => {
    const p = path.resolve(dir, name);
    if (!p.startsWith(dir + path.sep)) throw new Error(`Unsafe name ${name}`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    return p;
  };
  let folder = dir;
  if (o.folder) folder = o.folder;
  else {
    fs.writeFileSync(inside(TEX_MAIN), doc.main);
    for (const f of doc.files) fs.writeFileSync(inside(f.name), f.text);
    for (const p of doc.pictures) {
      const data = pictureData(db, p.src);
      if (data) fs.writeFileSync(inside(p.name), data);
    }
  }
  if (!r.pdf) return { folder };
  const pdf = path.join(dir, `${slug(o.title)}.pdf`);
  fs.writeFileSync(pdf, r.pdf);
  return { folder, pdf };
}

/** A Library document's folder of the app's data goes with it. */
export function dropPaperFolder(id: string) {
  try {
    fs.rmSync(path.join(PAPERS, id.replace(/[^\w-]/g, '')), { recursive: true, force: true });
  } catch {}
}

// ---- routes -------------------------------------------------------------------------------------------------------------

const cleanOptions = (v: unknown): ArxivOptions => {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return Object.fromEntries(Object.entries(ARXIV_DEFAULTS).map(([k, d]) => [k, typeof o[k] === 'boolean' ? o[k] : d])) as unknown as ArxivOptions;
};

/**
 * Signed in:
 *   POST /api/pages/tex/arxiv { page, version?, options? } (or { model, title }) — makes the arXiv package: ArxivPackage
 *   GET  /api/pages/tex/arxiv/:token — the .zip, for an hour
 *   POST /api/pages/tex/paper { model, page?, folder?, base? } — the paper on disk for an app: { folder, pdf? }
 */
export function arxivRoutes(app: FastifyInstance, db: DB) {
  app.post('/api/pages/tex/arxiv', { bodyLimit: 24 * 1024 * 1024 }, async (req) => {
    const b = (req.body ?? {}) as { page?: unknown; version?: unknown; model?: unknown; title?: unknown; options?: unknown };
    let doc: TexDoc;
    let title = typeof b.title === 'string' && b.title.trim() ? b.title.trim() : 'paper';
    if (typeof b.page === 'string' && b.page) {
      const p = mustPage(db, b.page);
      if (p.kind !== 'tex') throw new HttpError(400, 'That page is not a LaTeX document');
      const src = pageSource(db, p.id, typeof b.version === 'number' ? b.version : undefined);
      if (!src) throw new HttpError(404, 'That version is no longer kept');
      doc = readTex(src.text);
      title = p.title;
    } else {
      try {
        doc = normalizeTex(b.model);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
    }
    const { zip, report } = await arxivPackage(db, doc, cleanOptions(b.options), title);
    return { token: keepZip(zip, report.name), ...report } satisfies ArxivPackage;
  });
  app.get('/api/pages/tex/arxiv/:token', async (req, reply) => {
    const token = (req.params as { token: string }).token;
    const file = path.join(ARXIV_DIR, `${token}.zip`);
    if (!/^[a-f0-9]{24}$/.test(token) || !fs.existsSync(file)) return reply.code(404).send({ error: 'That package is no longer kept: make it again.' });
    const name = made.get(token)?.name ?? 'paper-arxiv.zip';
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`)
      .type('application/zip')
      .send(fs.createReadStream(file));
  });
  app.post('/api/pages/tex/paper', { bodyLimit: 24 * 1024 * 1024 }, async (req) => {
    const b = (req.body ?? {}) as { model?: unknown; page?: unknown; folder?: unknown; base?: unknown };
    let doc: TexDoc;
    try {
      doc = normalizeTex(b.model);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const page = typeof b.page === 'string' && b.page ? pageInfo(db, b.page) : null;
    const folder = typeof b.folder === 'string' && b.folder ? path.resolve(b.folder) : undefined;
    if (!page && !(folder && texFolderOk(folder))) throw new HttpError(400, 'Which document: its page, or the folder of its file');
    return paperOnDisk(db, doc, { page: page?.id, folder: page ? undefined : folder, title: page?.title ?? path.basename(folder ?? 'paper'), base: typeof b.base === 'string' ? b.base : undefined });
  });
}
