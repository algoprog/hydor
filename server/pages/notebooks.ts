// Jupyter notebooks kept in the Library: the notebook as nbformat 4 has it (its cells, with the outputs of their last
// run), checked as it comes in and kept as nbformat writes it (a line per line of each cell, so two versions read as
// a diff of lines). Its own page shows the cells and outputs as a reader sees them (to print, to picture, or as a web
// page of its own); an agent is told it cell by cell; it exports as the .ipynb itself and as a Python script with
// # %% cells. A notebook of the Library runs in a folder of its own in the app's data folder (workFile), as one from
// Files runs in its own folder.
import fs from 'node:fs';
import path from 'node:path';
import { blockHtml, docCss, listInfo, normalizeDoc } from '../../shared/docs.ts';
import { CELL_ID, collapseCarriageReturns, joinLines, newCellId, newNotebookJson, notebookText, PYTHON_NOTEBOOK } from '../../shared/notebook.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';

type Json = Record<string, any>;

/** The longest a notebook may be as text, its outputs' pictures included. */
export const MAX_NOTEBOOK = 10 * 1024 * 1024;

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** Terminal colours in tracebacks and printed text, which a page shows as plain text. */
const noAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

// ---- what is kept ----------------------------------------------------------------------------------------

const OUTPUT_TYPES = new Set(['stream', 'display_data', 'execute_result', 'error', 'update_display_data']);

function checkOutput(o: Json, where: string): Json {
  const type = String(o.output_type ?? '');
  if (!OUTPUT_TYPES.has(type)) throw new HttpError(400, `${where}: an output's output_type is stream, display_data, execute_result or error`);
  const out: Json = { ...o, output_type: type === 'update_display_data' ? 'display_data' : type };
  if (type === 'stream') {
    out.name = o.name === 'stderr' ? 'stderr' : 'stdout';
    out.text = joinLines(o.text);
  } else if (type === 'error') {
    out.ename = String(o.ename ?? 'Error');
    out.evalue = String(o.evalue ?? '');
    out.traceback = Array.isArray(o.traceback) ? o.traceback.map(String) : [];
  } else {
    out.data = isObj(o.data) ? o.data : {};
    out.metadata = isObj(o.metadata) ? o.metadata : {};
    if (out.output_type === 'execute_result') out.execution_count = Number.isInteger(o.execution_count) ? o.execution_count : null;
    else delete out.execution_count;
  }
  return out;
}

/**
 * A notebook as an agent, the editor or a file gave it (its object, or an .ipynb's text): nbformat 4, cells of the
 * three types, ids where nbformat 4.5 wants them (made up where missing or taken twice), outputs on code cells only.
 */
export function checkNotebook(input: unknown): Json {
  let nb = input;
  if (typeof nb === 'string') {
    try {
      nb = JSON.parse(nb);
    } catch {
      throw new HttpError(400, 'The notebook is not valid JSON: send the .ipynb file’s object, or its text');
    }
  }
  if (!isObj(nb) || !Array.isArray(nb.cells)) throw new HttpError(400, 'A notebook is an object with a list of cells (an .ipynb file’s content)');
  if (nb.nbformat !== undefined && Number(nb.nbformat) !== 4) throw new HttpError(400, `Notebook format ${nb.nbformat} is not kept here (only format 4): convert it with “jupyter nbconvert --to notebook”`);
  const seen = new Set<string>();
  const cells = nb.cells.map((c: unknown, i: number) => {
    const where = `Cell ${i + 1}`;
    if (!isObj(c)) throw new HttpError(400, `${where} is not a cell`);
    const type = c.cell_type === undefined ? 'code' : String(c.cell_type);
    if (type !== 'code' && type !== 'markdown' && type !== 'raw') throw new HttpError(400, `${where}: cell_type is code, markdown or raw`);
    let id = typeof c.id === 'string' && CELL_ID.test(c.id) ? c.id : '';
    while (!id || seen.has(id)) id = newCellId();
    seen.add(id);
    const out: Json = { ...c, id, cell_type: type, metadata: isObj(c.metadata) ? c.metadata : {}, source: joinLines(c.source) };
    if (type === 'code') {
      out.outputs = (Array.isArray(c.outputs) ? c.outputs : []).filter(isObj).map((o: Json) => checkOutput(o, where));
      out.execution_count = Number.isInteger(c.execution_count) ? c.execution_count : null;
      delete out.attachments;
    } else {
      delete out.outputs;
      delete out.execution_count;
    }
    return out;
  });
  const metadata = isObj(nb.metadata) ? nb.metadata : {};
  return { ...nb, cells, metadata: Object.keys(metadata).length ? metadata : structuredClone(PYTHON_NOTEBOOK), nbformat: 4, nbformat_minor: Math.max(5, Number(nb.nbformat_minor) || 0) };
}

/** What a notebook keeps: checked, as its file's text. */
export function keepNotebook(input: unknown): { nb: Json; text: string } {
  const nb = checkNotebook(input);
  const text = notebookText(nb);
  if (Buffer.byteLength(text) > MAX_NOTEBOOK) throw new HttpError(413, `The notebook is over ${MAX_NOTEBOOK / 1024 / 1024} MB, its outputs included; clear or shrink the largest outputs first.`);
  return { nb, text };
}

export const readNotebook = (text: string): Json => JSON.parse(text) as Json;

export const freshNotebook = (title: string): Json => newNotebookJson(title);

/** An .ipynb file someone opens. */
export function notebookFromFile(buf: Buffer): Json {
  return checkNotebook(buf.toString('utf8').replace(/^﻿/, ''));
}

/** The language its code is in, as the notebook says (Python unless it says another). */
const languageOf = (nb: Json): string => String(nb.metadata?.language_info?.name ?? nb.metadata?.kernelspec?.language ?? 'python').toLowerCase();

// ---- its own page ----------------------------------------------------------------------------------------

/** Markdown as the Library's documents show it (headings, lists, tables, code, pictures, links). */
function markdownHtml(md: string): string {
  if (!md.trim()) return '';
  try {
    const d = normalizeDoc({ markdown: md });
    const { labels } = listInfo(d.blocks);
    return d.blocks.map((b, i) => blockHtml(b, labels[i], { src: (s) => s })).join('');
  } catch {
    return `<p>${esc(md)}</p>`;
  }
}

/** The best of an output's forms a page can show by itself: a picture, a table, text. */
function outputHtml(o: Json): string {
  if (o.output_type === 'stream') {
    const text = noAnsi(collapseCarriageReturns(joinLines(o.text)).replace(/\r/g, ''));
    return text ? `<pre class="nb-out${o.name === 'stderr' ? ' nb-err' : ''}">${esc(text)}</pre>` : '';
  }
  if (o.output_type === 'error') return `<pre class="nb-out nb-err">${esc(noAnsi((o.traceback ?? []).join('\n') || `${o.ename}: ${o.evalue}`))}</pre>`;
  const data = isObj(o.data) ? o.data : {};
  const meta = isObj(o.metadata) ? o.metadata : {};
  for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
    if (typeof data[mime] !== 'string' && !Array.isArray(data[mime])) continue;
    const m = isObj(meta[mime]) ? meta[mime] : {};
    const size = `${Number(m.width) > 0 ? ` width="${Number(m.width)}"` : ''}${Number(m.height) > 0 ? ` height="${Number(m.height)}"` : ''}`;
    return `<img class="nb-img" alt=""${size} src="data:${mime};base64,${joinLines(data[mime]).replace(/\s/g, '')}">`;
  }
  // Scripts never run on this page (its policy says so), so an interactive chart shows what it has without them.
  if (data['text/html'] !== undefined) return `<div class="nb-html">${joinLines(data['text/html'])}</div>`;
  if (data['image/svg+xml'] !== undefined) return `<div class="nb-html">${joinLines(data['image/svg+xml'])}</div>`;
  if (data['text/markdown'] !== undefined) return `<div class="nb-md">${markdownHtml(joinLines(data['text/markdown']))}</div>`;
  if (data['text/latex'] !== undefined) return `<pre class="nb-out">${esc(joinLines(data['text/latex']))}</pre>`;
  if (data['application/json'] !== undefined) return `<pre class="nb-out">${esc(JSON.stringify(data['application/json'], null, 2))}</pre>`;
  if (data['text/plain'] !== undefined) return `<pre class="nb-out">${esc(joinLines(data['text/plain']))}</pre>`;
  return '';
}

const PAGE_CSS = `
:root{color-scheme:light;--fg:#1d1d1b;--muted:#6b6a65;--line:#e4e3dd;--code:#f6f5f1;--err:#b42318;--accent:#2a78d6}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:32px 28px 48px}
.nb-title{font-size:13px;color:var(--muted);margin:0 0 18px}
.nb-cell{display:flex;gap:10px;margin:0 0 14px}
.nb-n{flex:0 0 46px;text-align:right;font:12px/22px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);padding-top:8px}
.nb-body{flex:1;min-width:0}
.nb-code{margin:0;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--code);font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
.nb-out{margin:8px 0 0;padding:0 2px;font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
.nb-err{color:var(--err)}
.nb-img{display:block;max-width:100%;height:auto;margin:8px 0 0}
.nb-html{margin:8px 0 0;overflow-x:auto;font-size:13px}
.nb-html table{border-collapse:collapse}
.nb-html th,.nb-html td{border-bottom:1px solid var(--line);padding:4px 10px;text-align:right}
.nb-html th{font-weight:600}
.nb-md{padding:0 2px}
.nb-md.nb-cell-md > :first-child{margin-top:4px}
.nb-raw{margin:0;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;color:var(--muted)}
@media print{main{max-width:none;padding:0}.nb-cell{break-inside:avoid-page}}
`;

/** Its own page: the cells and their outputs, to look at (viewer), print (a PDF), or picture (still: the first cells). */
export function notebookPage(text: string, title: string, mode: 'viewer' | 'print' | 'still'): string {
  const nb = readNotebook(text);
  const lang = languageOf(nb);
  const cells: Json[] = Array.isArray(nb.cells) ? nb.cells : [];
  const shown = mode === 'still' ? cells.slice(0, 8) : cells;
  const body = shown
    .map((c) => {
      const src = joinLines(c.source);
      if (c.cell_type === 'markdown') return `<section class="nb-cell"><div class="nb-n"></div><div class="nb-body nb-md nb-cell-md">${markdownHtml(src)}</div></section>`;
      if (c.cell_type === 'raw') return src.trim() ? `<section class="nb-cell"><div class="nb-n"></div><div class="nb-body"><pre class="nb-raw">${esc(src)}</pre></div></section>` : '';
      const n = Number.isInteger(c.execution_count) ? c.execution_count : ' ';
      const outs = (Array.isArray(c.outputs) ? c.outputs : []).map(outputHtml).join('');
      return `<section class="nb-cell"><div class="nb-n">[${n}]</div><div class="nb-body"><pre class="nb-code" data-lang="${esc(lang)}">${esc(src)}</pre>${outs}</div></section>`;
    })
    .join('\n');
  const md = docCss(normalizeDoc({ markdown: '' }), '.nb-md');
  return [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>`,
    // Outputs may carry scripts (an interactive chart, a widget): none runs here.
    `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'">`,
    '<meta name="generator" content="Hydor notebooks">',
    `<style>${PAGE_CSS}\n${md}${mode === 'still' ? '\nbody{overflow:hidden}' : ''}</style></head><body>`,
    `<main translate="no"><p class="nb-title">${esc(title)} · Jupyter notebook</p>${body}</main>`,
    '</body></html>',
  ].join('\n');
}

// ---- for agents ------------------------------------------------------------------------------------------

const CUT = 2_000;
const cut = (s: string, n = CUT) => (s.length > n ? `${s.slice(0, n)}… (${s.length - n} more characters)` : s);

function outputForAgent(o: Json): string {
  if (o.output_type === 'stream') return `${o.name ?? 'stdout'}:\n${cut(noAnsi(collapseCarriageReturns(joinLines(o.text)).replace(/\r/g, '')).trimEnd())}`;
  if (o.output_type === 'error') return `error: ${o.ename}: ${cut(String(o.evalue ?? ''), 500)}`;
  const data = isObj(o.data) ? o.data : {};
  const meta = isObj(o.metadata) ? o.metadata : {};
  const parts: string[] = [];
  for (const mime of Object.keys(data)) {
    if (mime.startsWith('image/') && mime !== 'image/svg+xml') {
      const m = isObj(meta[mime]) ? meta[mime] : {};
      parts.push(`[a picture, ${mime}${m.width ? `, ${m.width}×${m.height ?? '?'}` : ''}]`);
    }
  }
  if (data['text/plain'] !== undefined) parts.push(cut(joinLines(data['text/plain']).trimEnd()));
  else if (data['text/markdown'] !== undefined) parts.push(cut(joinLines(data['text/markdown']).trimEnd()));
  else if (data['text/html'] !== undefined) parts.push(`[HTML] ${cut(joinLines(data['text/html']).replace(/\s+/g, ' '), 600)}`);
  return parts.join('\n') || `[${Object.keys(data).join(', ') || 'empty'} output]`;
}

/** What get_page tells an agent: each cell in order, its id, its source and what its last run showed. */
export function notebookForAgent(text: string): string {
  const nb = readNotebook(text);
  const cells: Json[] = Array.isArray(nb.cells) ? nb.cells : [];
  const lang = languageOf(nb);
  const code = cells.filter((c) => c.cell_type === 'code').length;
  const env = nb.metadata?.kernelspec?.display_name ? ` Its kernel: ${nb.metadata.kernelspec.display_name}.` : '';
  const head = `A Jupyter notebook, ${cells.length} cell${cells.length === 1 ? '' : 's'} (${code} of code, in ${lang}).${env} The cells in order, each with its id; under a code cell, what its last run showed (pictures named, long text cut).`;
  let budget = 120_000;
  const parts: string[] = [];
  cells.forEach((c, i) => {
    if (budget <= 0) return;
    const src = joinLines(c.source);
    const run = c.cell_type === 'code' ? (Number.isInteger(c.execution_count) ? ` · run [${c.execution_count}]` : ' · not run') : '';
    let s = `--- cell ${i + 1} · ${c.cell_type} · id ${c.id}${run}\n`;
    s += c.cell_type === 'code' ? `\`\`\`${lang}\n${src}\n\`\`\`` : src;
    const outs = c.cell_type === 'code' && Array.isArray(c.outputs) ? c.outputs.map(outputForAgent).filter(Boolean) : [];
    if (outs.length) s += `\nOutput:\n${outs.join('\n')}`;
    budget -= s.length;
    parts.push(s);
  });
  if (budget <= 0) parts.push(`… (cut: the notebook has ${cells.length} cells; ask for fewer at a time by reading its .ipynb, export_page format ipynb)`);
  return [
    head,
    parts.join('\n\n'),
    'To change it: save_notebook with this id and the whole notebook as it should be (notebook: the .ipynb object, with the cells you keep, their ids and outputs), or path: an .ipynb file you wrote and ran. Keep the cells and outputs you do not change; a code cell you change has no output until it runs again.',
  ].join('\n\n');
}

// ---- its files -------------------------------------------------------------------------------------------

/** A Python script of its cells, text cells as comments under # %% [markdown], as editors and jupytext read them. */
export function notebookScript(text: string): string {
  const nb = readNotebook(text);
  const cells: Json[] = Array.isArray(nb.cells) ? nb.cells : [];
  const out = cells.map((c) => {
    const src = joinLines(c.source).replace(/\s+$/, '');
    if (c.cell_type === 'markdown') return `# %% [markdown]\n${src.split('\n').map((l) => (l ? `# ${l}` : '#')).join('\n')}`;
    if (c.cell_type === 'raw') return `# %% [raw]\n${src.split('\n').map((l) => (l ? `# ${l}` : '#')).join('\n')}`;
    return `# %%\n${src}`;
  });
  return `${out.join('\n\n')}\n`;
}

// ---- where a notebook of the Library runs ----------------------------------------------------------------

/** The folder a notebook of the Library runs in, and the file its kernel is known by. */
export const workFolder = (id: string) => path.join(config.dataDir, 'notebooks', id.replace(/[^\w-]/g, ''));
export const workFile = (id: string) => path.join(workFolder(id), 'notebook.ipynb');

/** Writes the notebook into its folder (kernels start from a notebook's file), and says where it is. */
export function writeWorkFile(id: string, text: string): string {
  const file = workFile(id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

/** A notebook deleted from the Library: its folder goes, with what its runs wrote there. */
export function dropWorkFolder(id: string) {
  try {
    fs.rmSync(workFolder(id), { recursive: true, force: true });
  } catch {}
}

// ---- what agents send ------------------------------------------------------------------------------------

/**
 * What save_notebook was given, as a notebook: the notebook itself (its object or an .ipynb's text), the path of
 * an .ipynb file (one the agent wrote and ran: its outputs come along), or cells to make one of.
 */
export function agentNotebook(a: Json, resolve: (p: string) => string): Json {
  const given = [a.notebook !== undefined, typeof a.path === 'string' && a.path.trim() !== '', Array.isArray(a.cells)].filter(Boolean).length;
  if (given !== 1) throw new Error('Give one of: notebook (the .ipynb object or its text), path (an .ipynb file), or cells (a list of { type, source }).');
  if (a.notebook !== undefined) return checkNotebook(a.notebook);
  if (typeof a.path === 'string' && a.path.trim()) {
    const file = resolve(a.path.trim());
    if (!/\.ipynb$/i.test(file)) throw new Error(`${file} is not a notebook (.ipynb)`);
    let buf: Buffer;
    try {
      buf = fs.readFileSync(file);
    } catch {
      throw new Error(`There is no notebook at ${file}`);
    }
    if (buf.length > MAX_NOTEBOOK) throw new Error(`${file} is over ${MAX_NOTEBOOK / 1024 / 1024} MB, outputs included; shrink its outputs first`);
    return notebookFromFile(buf);
  }
  const cells = (a.cells as unknown[]).map((c, i) => {
    if (typeof c === 'string') return { cell_type: 'code', source: c };
    if (!isObj(c)) throw new Error(`cells[${i}] is not a cell: { type: "markdown" | "code" | "raw", source }`);
    return { ...c, cell_type: c.cell_type ?? c.type ?? 'code', source: c.source ?? c.text ?? '' };
  });
  for (const c of cells) delete (c as Json).type;
  return checkNotebook({ cells, metadata: isObj(a.metadata) ? a.metadata : structuredClone(PYTHON_NOTEBOOK), nbformat: 4, nbformat_minor: 5 });
}

export const SAVE_NOTEBOOK_DESCRIPTION = [
  'Keep a Jupyter notebook in the user’s Library: they read it with its outputs, edit and run its cells there (in a folder of its own, in a Python environment they pick),',
  'ask an agent about it, and export it as an .ipynb file, a Python script, a PDF or a web page. Give one of: path, an .ipynb file you wrote and ran (its outputs come along:',
  'run it from the top first, so they match its code); notebook, the .ipynb’s object or text; or cells, a list of { type: "markdown" | "code" | "raw", source } (no outputs yet).',
  'With id, the notebook replaces that one’s content as a new version (read it with get_page first, and keep the cells, ids and outputs you do not change).',
  'A notebook that belongs with a project’s code or data in a folder stays a file there instead (present_files hands it over).',
].join(' ');

export const SAVE_NOTEBOOK_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Its name in the Library.' },
    id: { type: 'string', description: 'A notebook of the Library to change (get_page lists them); leave out to make a new one.' },
    path: { type: 'string', description: 'An .ipynb file to keep: from the session’s folder, or absolute.' },
    notebook: { description: 'The notebook: an .ipynb file’s object ({ cells, metadata, nbformat: 4, nbformat_minor }), or its text.' },
    cells: {
      type: 'array',
      description: 'Cells to make a notebook of, in order.',
      items: { type: 'object', properties: { type: { type: 'string', enum: ['markdown', 'code', 'raw'] }, source: { type: 'string' } }, required: ['source'] },
    },
  },
  required: ['title'],
};
