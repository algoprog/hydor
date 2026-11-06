// Plots for documents, slides and pages, drawn by code a model writes: the helper model picked in Settings → Models,
// else Claude (writer.ts), writes a Python script that draws the plot with matplotlib; it runs on this computer (the
// picture tools' Python, else one here that has matplotlib: local.ts, through hooks.ts), and when it fails or saves
// nothing, what went wrong goes back to the writer to fix, three tries in all. The data goes in a file beside the
// script (data.csv, data.tsv, data.json); the writer sees only its columns and first rows. A drawing (SVG) is cleaned
// before it is kept (cleanSvg, make.ts'); a picture (PNG) is kept when it cannot be. With `interactive`, the same
// script also writes the plot for Plotly, which the app puts in a small page of its own that moves and answers the
// pointer in the deck's colours: for a slide's custom code part in a web deck. Before a script runs it is read for
// what a plot has no need of (other programs, the network, files outside its folder): a check, not a sandbox.
//   POST /api/plots/make          PlotAsk → PlotAnswer: a plot from words and data, or one made before changed
//   POST /api/videos/make         MakeVideoAsk → VideoJob (videojobs.ts)
//   GET  /api/videos/make/:job    VideoJob
// Agents get make_plot (while Settings → Images, video and audio has images on): the same, into the session's images/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { KIT_LIBS, LIB_CDN } from '../../shared/app-media.ts';
import type { PlotAnswer, PlotAsk } from '../../shared/images.ts';
import { ASSET, SLIDE_LIMITS } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import { kvGet, type DB } from '../db.ts';
import { inSession } from '../documents/index.ts';
import type { Feature, RunTool } from '../features/types.ts';
import { pictureType, putAsset } from '../pages/assets.ts';
import { cloudTools, localTools, type LocalTools, type PythonRun } from './hooks.ts';
import { dimensions, slug } from './openrouter.ts';
import { videoRoutes } from './videojobs.ts';
import { writeWith, type WriteAsk } from './writer.ts';

/** The most data a plot takes inline (the editors' and an agent's), and from an agent's file. */
export const MAX_DATA = 200 * 1024;
const MAX_DATA_FILE = 20 * 1024 * 1024;
const MAX_CODE = 100 * 1024;
/** How long a script may run, and the writer take to write one (the tests run shorter). */
export const plotTiming = { runMs: 60_000, writeMs: 150_000 };
const TRIES = 3;
/** The most of the data the writer is shown: its columns and first rows. */
const PREVIEW = 3000;
/** The interactive page's most: what a slide's custom code part keeps. */
const MAX_HTML = SLIDE_LIMITS.html;
/** A drawing heavier than this (many thousands of points) is kept as a picture instead. */
const MAX_SVG = 4 * 1024 * 1024;
/** Plots drawn at once; more wait their turn. */
const AT_ONCE = 3;

export const NO_PYTHON = 'Plots need Python with matplotlib: set up the picture tools in Settings → Images, video and audio';

// ---- what is asked ------------------------------------------------------------------------------------------

export type DataKind = 'csv' | 'tsv' | 'json' | 'jsonl';

export interface PlotData {
  kind: DataKind;
  bytes: Buffer;
}

export interface Theme {
  /** The series' colours, in order (#hex, lower case). */
  colors: string[];
  /** The text's colour, and the one it is shown on. */
  fg: string;
  bg: string;
  font?: string;
}

/** A plot to draw, as the route and the tool both read it. */
export interface Plotting {
  request: string;
  data?: PlotData;
  theme: Theme;
  /** The size it is shown at, in pixels. */
  w: number;
  h: number;
  format: 'svg' | 'png';
  /** A plot made before: its code, and what to change (none: it is drawn again as it is). */
  code?: string;
  change?: string;
  interactive: boolean;
}

/** The data's file, beside the script. */
export const fileOf = (d: PlotData) => `data.${d.kind}`;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLORS = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2'];
const GENERIC = /^(sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|cursive|fantasy|inherit|initial)$/i;

const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v.trim());

/** How light a colour is, 0 (black) to 1 (white). */
function lightness(hex: string): number {
  let h = hex.slice(1);
  if (h.length <= 4) h = h.replace(/./g, '$&$&');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The colours and font to draw in: those given, else the app's; dark text on a light background, light on a dark one. */
export function themeOf(t: PlotAsk['theme'] | undefined): Theme {
  const given = (Array.isArray(t?.colors) ? t.colors : []).filter(isHex).map((c) => c.trim().toLowerCase());
  const bg = isHex(t?.bg) ? t.bg.trim().toLowerCase() : '#ffffff';
  const fg = isHex(t?.fg) ? t.fg.trim().toLowerCase() : lightness(bg) < 0.45 ? '#f3f4f6' : '#1f2937';
  const first =
    typeof t?.font === 'string'
      ? t.font
          .split(',')[0]
          .trim()
          .replace(/^['"]|['"]$/g, '')
      : '';
  const font = /^[\w .'-]{1,60}$/.test(first) && !GENERIC.test(first) ? first : undefined;
  return { colors: given.length ? given.slice(0, 12) : COLORS, fg, bg, ...(font ? { font } : {}) };
}

const side = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Math.min(2400, Math.max(160, Number(v)))) : undefined);

/** Its size in pixels: as given (each side 160 to 2400), the other side at 16:9 when one is missing, else 960×540. */
export function sizeOf(w: unknown, h: unknown): { w: number; h: number } {
  const W = side(w);
  const H = side(h);
  if (W && H) return { w: W, h: H };
  if (W) return { w: W, h: Math.max(160, Math.round((W * 9) / 16)) };
  if (H) return { w: Math.min(2400, Math.round((H * 16) / 9)), h: H };
  return { w: 960, h: 540 };
}

const parses = (s: string) => {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
};

/** What the data is: by its file's name when it has one, else by its first characters. */
export function dataKind(text: string, name = ''): DataKind {
  const ext = path.extname(name).slice(1).toLowerCase();
  if (ext === 'json' || ext === 'geojson') return 'json';
  if (ext === 'jsonl' || ext === 'ndjson') return 'jsonl';
  if (ext === 'tsv' || ext === 'tab') return 'tsv';
  if (ext === 'csv') return 'csv';
  const t = text.replace(/^\ufeff/, '').trimStart();
  if (/^[[{]/.test(t)) {
    if (parses(t)) return 'json';
    const lines = t.split(/\r?\n/).filter((l) => l.trim());
    if (lines.slice(0, 5).every(parses)) return 'jsonl';
  }
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const tabs = first.split('\t').length - 1;
  return tabs > 0 && tabs >= first.split(',').length - 1 ? 'tsv' : 'csv';
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** A JSON value in a few words: "an array of 120 objects with date, sales", "an object with x (120 numbers), y (…)". */
function shapeOf(v: unknown): string {
  const kind = (x: unknown) => (x === null ? 'null' : Array.isArray(x) ? 'list' : typeof x === 'object' ? 'object' : typeof x);
  if (Array.isArray(v)) {
    const kinds = [...new Set(v.slice(0, 50).map(kind))];
    const fields = kinds.length === 1 && kinds[0] === 'object' ? [...new Set(v.slice(0, 50).flatMap((x) => Object.keys(x as object)))].slice(0, 30) : [];
    return `an array of ${v.length} ${kinds.join(' or ')}${v.length === 1 ? '' : 's'}${fields.length ? ` with the fields ${fields.join(', ')}` : ''}`;
  }
  if (v && typeof v === 'object') {
    const keys = Object.entries(v as Record<string, unknown>).slice(0, 30);
    return `an object with the keys ${keys.map(([k, x]) => (Array.isArray(x) ? `${k} (a list of ${x.length})` : `${k} (${kind(x)})`)).join(', ')}`;
  }
  return `a single ${kind(v)}`;
}

/** What the writer is shown of the data: what it is and its start, never more than a few KB. */
export function preview(d: PlotData): { about: string; head: string } {
  const text = d.bytes.toString('utf8').replace(/^\ufeff/, '');
  if (d.kind === 'json') {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      return { about: 'JSON that does not parse', head: cut(text, PREVIEW) };
    }
    // Long lists shortened, so the start shows every part of it.
    const short = JSON.stringify(v, (_k, x) => (Array.isArray(x) && x.length > 6 ? [...x.slice(0, 6), `… ${x.length - 6} more`] : typeof x === 'string' ? cut(x, 200) : x), 1);
    return { about: shapeOf(v), head: cut(short, PREVIEW) };
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  let head = '';
  for (const l of lines.slice(0, 12)) {
    const line = cut(l, 300);
    if (head.length + line.length > PREVIEW) break;
    head += `${line}\n`;
  }
  const about = d.kind === 'jsonl' ? `${lines.length} lines, a JSON value each` : `${lines.length} lines: most likely a header and ${lines.length - 1} rows`;
  return { about, head: head.trimEnd() };
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The route's ask, checked: what to plot, its data (up to 200 KB), its look and size, a plot to change. */
export function readAsk(body: unknown): Plotting {
  const a = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const request = text(a.request, 4000);
  const code = typeof a.code === 'string' && a.code.trim() ? a.code : undefined;
  if (code && Buffer.byteLength(code) > MAX_CODE) throw new HttpError(413, 'The code is over 100 KB');
  const change = text(a.change, 4000) || undefined;
  if (!request && !code) throw new HttpError(400, 'Say what to plot (request)');
  if (change && !code) throw new HttpError(400, 'To change a plot, send the code it was made with and what to change');
  let data: PlotData | undefined;
  if (typeof a.data === 'string' && a.data.trim()) {
    if (Buffer.byteLength(a.data) > MAX_DATA) throw new HttpError(413, `The data is over ${MAX_DATA / 1024} KB: give less of it, or a summary of it`);
    data = { kind: dataKind(a.data), bytes: Buffer.from(a.data.replace(/^\ufeff/, ''), 'utf8') };
  }
  return { request, data, theme: themeOf(a.theme as PlotAsk['theme']), ...sizeOf(a.w, a.h), format: a.format === 'png' ? 'png' : 'svg', code, change, interactive: a.interactive === true };
}

// ---- the check before a script runs ---------------------------------------------------------------------------

/** Python's source as its code and its strings (comments left out), enough to read its imports, names and paths. */
export function pyParts(src: string): { code: string; strings: string[] } {
  let code = '';
  const strings: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '#') {
      const end = src.indexOf('\n', i);
      i = end < 0 ? src.length : end;
      continue;
    }
    // A string: its prefix (r, b, u, f, or two of them), then its quotes, once or three times.
    const m = /^([rRbBuUfF]{0,2})('''|"""|'|")/.exec(src.slice(i, i + 5));
    if (m && (!m[1] || i === 0 || !/\w/.test(src[i - 1]))) {
      const q = m[2];
      let j = i + m[0].length;
      let body = '';
      while (j < src.length) {
        if (src[j] === '\\') {
          body += src.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (src.startsWith(q, j)) {
          j += q.length;
          break;
        }
        // An unclosed one ends with its line.
        if (q.length === 1 && src[j] === '\n') break;
        body += src[j++];
      }
      strings.push(body);
      // What an f-string puts in its braces is code.
      code += /f/i.test(m[1]) ? ` ${body} ` : ' "" ';
      i = j;
      continue;
    }
    code += c;
    i++;
  }
  return { code, strings };
}

/** The modules a plot's script may import: the plotting and data ones, and the standard library's for data and text. */
const MODULE_NAMES =
  'matplotlib mpl_toolkits numpy pandas cycler json csv math cmath statistics datetime calendar time zoneinfo collections itertools functools operator re string textwrap decimal fractions random io typing dataclasses enum warnings unicodedata bisect heapq copy numbers';
const MODULES = new Set(MODULE_NAMES.split(' '));
/** The double-underscore names a plot's script may use (a class of its own, `if __name__ == "__main__"`, versions). */
const DUNDERS = new Set(['name', 'main', 'version', 'init', 'repr', 'str', 'len', 'iter', 'next', 'getitem', 'contains', 'call', 'enter', 'exit', 'eq', 'ne', 'lt', 'le', 'gt', 'ge', 'hash', 'bool', 'doc', 'post_init']);
// Python's own, not a method of the same name (re.compile, a table's eval).
const CALLS = /(?<![.\w])(eval|exec|compile|globals|breakpoint|__import__)\s*\(/;
/** pandas' and numpy's ways to reach a database, the clipboard, the web or pickled code. */
const REACH = /\.(read_pickle|to_pickle|read_sql\w*|to_sql|read_gbq|to_gbq|read_clipboard|to_clipboard|read_html|read_xml|to_xml|read_hdf|to_hdf)\s*\(|\ballow_pickle\b/;
/**
 * A path outside the script's folder (a folder of the system's or anyone's, two folders deep, home, a drive, a folder
 * above), or an address on the web. Not a unit ("/s") or a rough number ("~5%").
 */
const OUTSIDE =
  /^\/(?:etc|home|usr|var|tmp|proc|dev|root|opt|mnt|media|srv|sys|bin|sbin|lib\w*|boot|run|snap|nix|Users|Applications|Library|System|Volumes|private)(?:\/|$)|^\/[\w.-]+\/|^~(?:[\\/]|[A-Za-z_][\w.-]*(?:[\\/]|$))|^[A-Za-z]:[\\/]|^\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|^[A-Za-z][\w+.-]*:\/\//;

export const SCRIPT_RULE =
  'a plot’s script uses only matplotlib, numpy, pandas and the standard library’s modules for data and text (csv, json, math, statistics, datetime, collections, itertools, functools, re, textwrap, io), reads only its data file and writes only the plot’s files, by their names alone (no other paths, no addresses on the web, no other programs)';

/** Why the app will not run this script, or null: it reaches for what a plot has no need of. A check, not a sandbox. */
export function screen(src: string): string | null {
  const { code, strings } = pyParts(src);
  const why = (what: string) => `This script ${what}, which plots here may not: ${SCRIPT_RULE}.`;
  for (const m of code.matchAll(/(?:^|[;:\n])[ \t]*(?:from[ \t]+(\.*[\w.]*)[ \t]+import\b|import[ \t]+([\w.]+(?:[ \t]+as[ \t]+\w+)?(?:[ \t]*,[ \t]*[\w.]+(?:[ \t]+as[ \t]+\w+)?)*))/g)) {
    const names = m[1] !== undefined ? [m[1]] : m[2].split(',').map((x) => x.trim().split(/\s+/)[0]);
    for (const n of names) {
      const top = n.split('.')[0];
      if (!top || !MODULES.has(top)) return why(top ? `imports ${n}` : 'imports from its own folder');
    }
  }
  const call = CALLS.exec(code);
  if (call) return why(`calls ${call[1]}()`);
  const dunders = [...code.matchAll(/\b__(\w+?)__\b/g)].map((m) => m[1]);
  for (const s of strings) {
    const m = /^__(\w+?)__$/.exec(s.trim());
    if (m) dunders.push(m[1]);
  }
  const inner = dunders.find((d) => !DUNDERS.has(d));
  if (inner !== undefined) return why(`reaches into Python itself (__${inner}__)`);
  const reach = REACH.exec(code);
  if (reach) return why(`uses ${reach[1] ?? reach[0]}`);
  const out = strings.find((s) => OUTSIDE.test(s.trim()));
  if (out !== undefined) return why(`names a file or address outside its folder (“${cut(out.trim(), 80)}”)`);
  return null;
}

// ---- the Python here --------------------------------------------------------------------------------------------

export interface PyEnv {
  matplotlib: string;
  numpy: string;
  pandas?: string;
  fonts: Set<string>;
}

/** What the Python here has: matplotlib's and numpy's versions, pandas' if it is there, and the fonts matplotlib finds. */
const PROBE = [
  'import importlib.util, json, sys',
  'import matplotlib',
  "matplotlib.use('Agg')",
  'import numpy',
  'from matplotlib import font_manager',
  'pandas = None',
  "if importlib.util.find_spec('pandas') is not None:",
  '    try:',
  '        import pandas',
  '    except Exception:',
  '        pandas = None',
  "print(json.dumps({'matplotlib': matplotlib.__version__, 'numpy': numpy.__version__, 'pandas': pandas.__version__ if pandas else None, 'fonts': sorted({f.name for f in font_manager.fontManager.ttflist})[:3000]}))",
].join('\n');

let probed: { tools: LocalTools; ready: boolean; at: number; env: Promise<PyEnv> } | null = null;

/** The Python here, asked once every ten minutes (again when the picture tools are set up or taken away). */
function pythonHere(tools: LocalTools): Promise<PyEnv> {
  const ready = tools.ready();
  if (probed && probed.tools === tools && probed.ready === ready && Date.now() - probed.at < 600_000) return probed.env;
  const env = (async (): Promise<PyEnv> => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hydor-plot-'));
    let r: PythonRun;
    try {
      r = await tools.runPython(PROBE, { cwd: dir, timeoutMs: 60_000 });
    } catch (e) {
      throw new HttpError(400, (e as Error).message || NO_PYTHON);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
    if (!r.ok) throw new HttpError(400, /No module named .?(matplotlib|numpy)/.test(r.stderr) ? NO_PYTHON : `The Python here cannot draw plots: ${lastLine(r.stderr || r.stdout)}`);
    try {
      const j = JSON.parse(lastLine(r.stdout));
      return { matplotlib: String(j.matplotlib), numpy: String(j.numpy), ...(j.pandas ? { pandas: String(j.pandas) } : {}), fonts: new Set(Array.isArray(j.fonts) ? j.fonts.map(String) : []) };
    } catch {
      throw new HttpError(400, `The Python here cannot draw plots: it said ${cut(lastLine(r.stdout || r.stderr), 200) || 'nothing'}`);
    }
  })();
  probed = { tools, ready, at: Date.now(), env };
  env.catch(() => probed?.env === env && (probed = null));
  return env;
}

const lastLine = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop() ?? '';

/** The end of what a failed run said, for the writer to read. */
function tail(s: string): string {
  const lines = s.trimEnd().split('\n');
  const end = lines.slice(-40).join('\n');
  return end.length > 4000 ? `…${end.slice(-4000)}` : end;
}

/** The gist of an error, for a person: its last line (Python's says what went wrong last). */
const gist = (s: string) => cut(s.includes('\n') ? lastLine(s) : s.trim(), 500);

// ---- the writer --------------------------------------------------------------------------------------------------

type Writer = (q: WriteAsk) => Promise<string>;
let writerForTests: Writer | null = null;
/** A stand-in for the writer (the tests' canned scripts); null: the real one. */
export const setPlotWriterForTests = (w: Writer | null) => void (writerForTests = w);

async function write(db: DB, q: WriteAsk): Promise<{ text: string; model: string }> {
  try {
    if (writerForTests) return { text: await writerForTests(q), model: 'the test writer' };
    return await writeWith(db, q);
  } catch (e) {
    if (q.signal?.aborted) throw stopped();
    throw e instanceof HttpError ? e : new HttpError(502, `The model that writes plots did not answer: ${(e as Error).message}`);
  }
}

/** The base font size: 12 pt on a 960-pixel-wide plot, in step with its size. */
const basePt = (p: Plotting) => Math.max(8, Math.min(28, Math.round(Math.min(p.w, (p.h * 16) / 9) / 80)));

const INTERACTIVE = [
  "- Also writes plot.json, the same plot for plotly.js 4, with `json.dump({'data': traces, 'layout': layout}, open('plot.json', 'w'), default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o))`:",
  '  the same data, colours, title and axis titles as the matplotlib plot; titles as {"text": …} (plotly.js takes no plain-string titles, and no titlefont); no width or height in the layout (it fills its frame);',
  '  at most about 3,000 points in all (sample evenly when there are more), numbers rounded to 4 significant digits, None where a value is missing (never NaN): it must stay under 150 KB.',
].join('\n');

/** What the writer is told once: what the script must do, and what makes a plot read well. */
export function systemFor(env: PyEnv, p: Plotting): string {
  const libs = env.pandas ? `matplotlib ${env.matplotlib}, numpy ${env.numpy} and pandas ${env.pandas}` : `matplotlib ${env.matplotlib} and numpy ${env.numpy} (pandas is not installed here: read the data with csv or json)`;
  const saves = p.format === 'png' ? "`fig.savefig('plot.png', dpi=192, transparent=True)`" : "`fig.savefig('plot.svg', transparent=True)` and then `fig.savefig('plot.png', dpi=192, transparent=True)` (the same plot as a drawing and as a picture)";
  return [
    'You write one Python script that draws one plot with matplotlib, for a slide, a document or a web page. Answer with the whole script in a single ```python block, then at most two short sentences on what the plot shows; nothing else.',
    '',
    'The script:',
    `- Uses only ${libs}, and Python's standard library for data and text (csv, json, math, statistics, datetime, collections, itertools, functools, re, textwrap, io). No other package: no seaborn, scipy, plotly or statsmodels (work out fits, bins and statistics with numpy).`,
    "- Starts with `import matplotlib` and `matplotlib.use('Agg')`, then `import matplotlib.pyplot as plt`.",
    p.data ? `- Reads the data from ${fileOf(p.data)}, by that name alone, and no other file.` : '- Makes the numbers it draws itself: there is no data file.',
    '- Opens no network connection, starts no other program, uses no os, sys, subprocess, eval or exec, and names no other file or folder.',
    "- Draws on one figure of exactly the size given, with layout='constrained' (`plt.subplots(..., figsize=..., layout='constrained')` is fine); never bbox_inches='tight', never plt.show().",
    `- Ends with ${saves}.`,
    ...(p.interactive ? [INTERACTIVE] : []),
    '',
    'A plot people read at a glance:',
    '- A title that says the point ("Sales doubled after the spring launch"), not only what is plotted.',
    '- Every axis labelled, with its units ("Revenue (US$ thousands)", "Time (s)"); tick labels readable and never crowded (fewer ticks, thousands separated, short dates).',
    '- The colours given, in the order given, one for each series; text, axes and ticks in the text colour given; grid lines light, and only where they help read values.',
    '- No chart junk: no 3D, shadows or heavy frames (hide the top and right spines), no legend for a single series (label lines at their ends when that reads better), no more decimals than matter.',
    '- Error bars, bands, fits, annotations and reference lines where the data or the request calls for them.',
    '- A see-through background (transparent=True, as above) unless the request asks for one; it is shown on the background colour given, so everything must read on it.',
    '- The font given, at the base size given (titles a little larger), so it reads at the size it is shown.',
    '',
    'Asked to change a plot, change only what is asked and keep the rest of the script as it is. Shown that your script failed, answer with the whole script again, fixed.',
  ].join('\n');
}

/** What the writer is asked: the plot, its data's start, its size, colours and font. */
export function promptFor(env: PyEnv, p: Plotting): string {
  const out: string[] = [];
  if (p.request) out.push(`What to plot: ${p.request}`);
  if (p.code && p.change) out.push(`${p.request ? '\n' : ''}Change this plot: ${p.change}`, '', 'The script it was made with:', '```python', p.code.trimEnd(), '```');
  out.push('');
  if (p.data) {
    const v = preview(p.data);
    const kb = p.data.bytes.length >= 1024 ? `${Math.round(p.data.bytes.length / 1024)} KB` : `${p.data.bytes.length} bytes`;
    out.push(`The data: ${fileOf(p.data)} in the current folder (${kb}; ${v.about}). It starts:`, '```', v.head, '```');
  } else out.push('No data file: the script makes the numbers it draws, from the request.');
  // As a sum, not inches rounded: matplotlib cuts a picture's pixels short (8.333 inches at 192 dpi is 1,599 pixels).
  out.push('', `Size: ${p.w}×${p.h} pixels, so figsize=(${p.w} / 96, ${p.h} / 96). Base font size: ${basePt(p)} pt.`);
  out.push(`Colours for the series, in order: ${p.theme.colors.join(', ')}.`);
  out.push(`Text, axes and ticks: ${p.theme.fg}. It is shown on ${p.theme.bg}.`);
  const font = p.theme.font;
  out.push(font && env.fonts.has(font) ? `Font: ${font} (installed here): plt.rcParams['font.family'] = '${font}'.` : `Font: matplotlib's own sans-serif, DejaVu Sans${font ? ` (${font}, the page's own, is not installed here)` : ''}.`);
  return out.join('\n');
}

/** What the writer hears after a script of its own failed: the script, and what went wrong. */
function again(last: { code: string; error: string }): string {
  return [...(last.code ? ['Your last script:', '```python', last.code.trimEnd(), '```', 'It did not draw the plot:'] : ['Your last answer did not draw the plot:']), '```', last.error, '```', 'Answer with the whole script again, fixed.'].join('\n');
}

/** The script in the writer's answer (its longest Python block), and the words around it. */
export function codeOf(answer: string): { code: string; notes?: string } {
  const fence = /```[ \t]*(?:python3?|py)?[ \t]*\r?\n([\s\S]*?)(?:```|$)/gi;
  const blocks = [...answer.matchAll(fence)].map((m) => m[1]);
  const code = blocks.sort((a, b) => b.length - a.length)[0]?.trim() ?? '';
  // An answer that is the script alone, without its fence.
  if (!code) return { code: /^\s*(?:import|from)\s+matplotlib/m.test(answer) ? answer.trim() : '' };
  const notes = answer.replace(fence, ' ').replace(/\s+/g, ' ').trim();
  return { code, ...(notes ? { notes: cut(notes, 600) } : {}) };
}

// ---- one run of a script ------------------------------------------------------------------------------------------

const UNIT: Record<string, number> = { '': 1, px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };

function svgLength(v: string | undefined): number | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(px|pt|pc|in|cm|mm)?\s*$/i.exec(v ?? '');
  return m ? Number(m[1]) * UNIT[(m[2] ?? '').toLowerCase()] : undefined;
}

/** A drawing's size in pixels, from its width and height (matplotlib's are in points), else its viewBox. */
export function svgSize(svg: string): { w: number; h: number } | null {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const attr = (n: string) => new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
  let w = svgLength(attr('width'));
  let h = svgLength(attr('height'));
  const vb = attr('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (vb?.length === 4 && vb[2] > 0 && vb[3] > 0) {
    if (w && !h) h = (w * vb[3]) / vb[2];
    else if (h && !w) w = (h * vb[2]) / vb[3];
    else if (!w && !h) [w, h] = [vb[2], vb[3]];
  }
  return w && h ? { w: Math.round(w), h: Math.round(h) } : null;
}

/** A drawing with its root's width and height in pixels (matplotlib writes points), so cleaning keeps its size. */
export function inPixels(svg: string): string {
  return svg.replace(/<svg\b[^>]*>/i, (tag) =>
    tag.replace(/(\s(?:width|height)\s*=\s*["'])([^"']*)(["'])/gi, (m, a: string, v: string, q: string) => {
      const n = svgLength(v);
      return n ? `${a}${Math.round(n * 100) / 100}${q}` : m;
    }),
  );
}

export interface Figure {
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
}

/** The Plotly plot a script wrote (plot.json), or what is wrong with it. */
export function figureOf(b: Buffer | undefined): Figure | string {
  if (!b?.length) return 'It saved no plot.json (the same plot for Plotly).';
  const raw = b.toString('utf8');
  let j: any;
  try {
    j = JSON.parse(raw);
  } catch {
    try {
      // Python's json writes NaN and Infinity, which are not JSON.
      j = JSON.parse(raw.replace(/\bNaN\b|-?\bInfinity\b/g, 'null'));
    } catch (e) {
      return `plot.json is not JSON: ${cut((e as Error).message, 200)}`;
    }
  }
  if (!j || typeof j !== 'object' || !Array.isArray(j.data) || !j.data.length || !j.data.every((t: unknown) => t && typeof t === 'object' && !Array.isArray(t)))
    return 'plot.json needs "data": a list of Plotly traces (objects), and "layout": an object.';
  return { data: j.data, layout: j.layout && typeof j.layout === 'object' && !Array.isArray(j.layout) ? j.layout : {} };
}

/** Titles as plotly.js 3 and later take them ({ text }, their font inside), and no fixed size: it fills its frame. */
function plotlyTitles(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(plotlyTitles);
  if (!v || typeof v !== 'object') return v;
  const o: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k === 'titlefont') continue;
    o[k] = k === 'title' && (typeof x === 'string' || typeof x === 'number') ? { text: String(x) } : plotlyTitles(x);
  }
  const font = (v as Record<string, unknown>).titlefont;
  if (font && typeof font === 'object') o.title = { ...(o.title && typeof o.title === 'object' ? (o.title as object) : {}), font };
  return o;
}

/** JSON that may sit inside a <script>: nothing in it can end the element. */
const inScript = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

const PLOTLY = `${LIB_CDN}${KIT_LIBS.plotly.pkg}@${KIT_LIBS.plotly.version}/${KIT_LIBS.plotly.js}`;

// The page's own script: the deck's colours (--n-c1… --n-c6, --n-fg, --n-bg) take the place of those it was made in,
// its font (--n-font) is used, and the plot fills its frame; Plotly's button that sends a plot to its cloud stays off.
const PAGE_SCRIPT = `(function () {
  var fig = JSON.parse(document.getElementById('figure').textContent);
  var made = JSON.parse(document.getElementById('made-in').textContent);
  var box = document.getElementById('plot');
  if (!window.Plotly) {
    box.className = 'off';
    box.textContent = 'This plot moves with Plotly, from jsDelivr, which cannot be reached here.';
    return;
  }
  var root = getComputedStyle(document.documentElement);
  var css = function (n) { return root.getPropertyValue(n).trim(); };
  var swap = {};
  made.colors.forEach(function (c, i) { var now = css('--n-c' + (i + 1)); if (now) swap[c] = now; });
  var fg = css('--n-fg'), bg = css('--n-bg'), font = css('--n-font');
  if (fg) swap[made.fg] = fg;
  if (bg) swap[made.bg] = bg;
  var recolour = function (v) {
    if (typeof v === 'string') return swap[v.toLowerCase()] || v;
    if (Array.isArray(v)) return v.map(recolour);
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = recolour(v[k]); }); return o; }
    return v;
  };
  var ink = fg || made.fg;
  var tint = function (c, a) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (!m) return c;
    var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  };
  var data = recolour(fig.data), layout = recolour(fig.layout);
  layout.autosize = true;
  layout.font = Object.assign({ color: ink }, layout.font);
  if (fg) layout.font.color = fg;
  layout.font.family = font || layout.font.family || (made.font ? made.font + ', ' : '') + 'system-ui, sans-serif';
  if (!('paper_bgcolor' in layout)) layout.paper_bgcolor = 'rgba(0,0,0,0)';
  if (!('plot_bgcolor' in layout)) layout.plot_bgcolor = 'rgba(0,0,0,0)';
  layout.legend = Object.assign({ bgcolor: 'rgba(0,0,0,0)' }, layout.legend);
  layout.modebar = Object.assign({ bgcolor: 'rgba(0,0,0,0)', color: tint(ink, 0.45), activecolor: ink }, layout.modebar);
  layout.margin = Object.assign({ l: 56, r: 24, t: layout.title ? 56 : 24, b: 48 }, layout.margin);
  if (!layout.xaxis) layout.xaxis = {};
  if (!layout.yaxis) layout.yaxis = {};
  Object.keys(layout).forEach(function (k) {
    if (!/^[xy]axis\\d*$/.test(k)) return;
    var ax = (layout[k] = Object.assign({}, layout[k]));
    if (ax.automargin === undefined) ax.automargin = true;
    if (!ax.gridcolor) ax.gridcolor = tint(ink, 0.12);
    if (!ax.linecolor) ax.linecolor = tint(ink, 0.35);
    if (!ax.zerolinecolor) ax.zerolinecolor = tint(ink, 0.25);
  });
  Plotly.newPlot(box, data, layout, {
    responsive: true,
    displaylogo: false,
    showSendToCloud: false,
    plotlyServerURL: '',
    modeBarButtonsToRemove: ['sendDataToCloud', 'sendChartToCloud', 'toImage', 'select2d', 'lasso2d'],
  });
})();`;

/** The plot that moves and answers the pointer: one small page that loads Plotly (jsDelivr, the version views use), its data inside it. */
export function plotlyPage(fig: Figure, theme: Theme): string {
  const layout = plotlyTitles(fig.layout) as Record<string, unknown>;
  delete layout.width;
  delete layout.height;
  const figure = { data: plotlyTitles(fig.data), layout };
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}#plot{position:absolute;inset:0}#plot.off{display:flex;align-items:center;justify-content:center;padding:1em;text-align:center;font:14px/1.4 system-ui,sans-serif;color:var(--n-muted,#888)}</style>',
    `<script src="${PLOTLY}"></script>`,
    '</head><body><div id="plot"></div>',
    `<script type="application/json" id="figure">${inScript(figure)}</script>`,
    `<script type="application/json" id="made-in">${inScript({ colors: theme.colors, fg: theme.fg, bg: theme.bg, font: theme.font ?? '' })}</script>`,
    `<script>${PAGE_SCRIPT}</script>`,
    '</body></html>',
  ].join('\n');
}

interface Drawn {
  picture: Buffer;
  mime: string;
  w: number;
  h: number;
  html?: string;
  notes: string[];
}

const stopped = () => new HttpError(409, 'It was stopped');

/**
 * One script run here, and what it drew: the drawing (cleaned) or the picture, and the interactive page; else what
 * went wrong, in words for the writer. `last`: no try comes after (a missing Plotly version is then only a note).
 */
async function runScript(tools: LocalTools, code: string, p: Plotting, signal: AbortSignal | undefined, last: boolean): Promise<({ ok: true } & Drawn) | { ok: false; error: string }> {
  const refused = screen(code);
  if (refused) return { ok: false, error: refused };
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hydor-plot-'));
  const got: Record<string, Buffer | undefined> = {};
  let run: PythonRun;
  try {
    try {
      run = await tools.runPython(code, { cwd: dir, timeoutMs: plotTiming.runMs, files: p.data ? { [fileOf(p.data)]: p.data.bytes } : {}, signal });
    } catch (e) {
      if (signal?.aborted) throw stopped();
      return { ok: false, error: `It did not run: ${(e as Error).message}` };
    }
    for (const n of ['plot.svg', 'plot.png', 'plot.json']) got[n] = run.files[n] ?? (await fs.promises.readFile(path.join(dir, n)).catch(() => undefined));
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
  if (signal?.aborted) throw stopped();
  if (!run.ok) return { ok: false, error: tail(run.stderr || run.stdout) || 'It stopped with an error, and said nothing.' };
  const notes: string[] = [];
  const saved = Object.keys(run.files).filter((n) => !p.data || n !== fileOf(p.data));
  const nothing = `It ran without an error but saved ${p.format === 'svg' ? 'neither plot.svg nor plot.png' : 'no plot.png'} in the current folder${saved.length ? ` (it saved ${saved.slice(0, 8).join(', ')})` : ''}.`;
  let picture: Buffer | undefined;
  let mime = '';
  let size: { w: number; h: number } | null = null;
  const svg = got['plot.svg'];
  const png = got['plot.png'];
  if (p.format === 'svg' && svg) {
    const raw = svg.toString('utf8');
    const clean = cloudTools()?.cleanSvg;
    let kept: string | null = null;
    let why = '';
    if (/<image\b/i.test(raw)) why = 'the drawing had a picture inside it (such as a heat map’s cells), which drawings here may not';
    else if (svg.length > MAX_SVG) why = `as a drawing it is over ${MAX_SVG / 1024 / 1024} MB (it has very many points)`;
    else {
      kept = clean ? clean(inPixels(raw)) : null;
      if (!kept || pictureType(Buffer.from(kept.slice(0, 2048))) !== 'image/svg+xml') {
        kept = null;
        why = 'its drawing (SVG) could not be kept safely';
      }
    }
    if (kept) {
      picture = Buffer.from(kept, 'utf8');
      mime = 'image/svg+xml';
      size = svgSize(kept);
    } else if (png) notes.push(`It is kept as a picture (PNG): ${why}.`);
    else return { ok: false, error: `It saved plot.svg but no plot.png: save both (${why}).` };
  } else if (p.format === 'svg' && png) notes.push('It is kept as a picture (PNG): the script saved no drawing (plot.svg).');
  if (!picture) {
    if (!png) return { ok: false, error: nothing };
    if (pictureType(png) !== 'image/png') return { ok: false, error: "plot.png is not a PNG picture: save it with fig.savefig('plot.png', dpi=192, transparent=True)." };
    picture = png;
    mime = 'image/png';
    // Made at twice its size, for sharp screens.
    const d = dimensions(png);
    size = d ? { w: Math.round(d.w / 2), h: Math.round(d.h / 2) } : null;
  }
  let html: string | undefined;
  if (p.interactive) {
    const fig = figureOf(got['plot.json']);
    if (typeof fig === 'string') {
      if (!last) return { ok: false, error: `The picture is right, but: ${fig}` };
      notes.push(`No interactive version: ${fig}`);
    } else {
      const page = plotlyPage(fig, p.theme);
      if (page.length > MAX_HTML) notes.push(`No interactive version: with its data it is over ${Math.round(MAX_HTML / 1000)},000 characters, too much for a slide; ask for fewer points.`);
      else html = page;
    }
  }
  return { ok: true, picture, mime, ...(size ?? { w: p.w, h: p.h }), ...(html ? { html } : {}), notes };
}

let busy = 0;
const waiting: (() => void)[] = [];

/** One plot at a time per slot (a writer and a Python each); the rest wait their turn. */
async function turn<T>(fn: () => Promise<T>): Promise<T> {
  while (busy >= AT_ONCE) await new Promise<void>((r) => waiting.push(r));
  busy++;
  try {
    return await fn();
  } finally {
    busy--;
    waiting.shift()?.();
  }
}

export interface Plot extends Omit<Drawn, 'notes'> {
  code: string;
  notes?: string;
  /** Who wrote the code (none: it was drawn as it was given). */
  model?: string;
}

/**
 * A plot drawn: with `change`, the writer changes the code given; with code alone, it is drawn as it is; else the
 * writer writes it. A script that fails or saves nothing goes back to the writer with what went wrong (three tries);
 * the last one's failure is an error with its code (`code` beside `error`).
 */
export async function drawPlot(db: DB, p: Plotting, signal?: AbortSignal): Promise<Plot> {
  const tools = localTools();
  if (!tools) throw new HttpError(400, NO_PYTHON);
  return turn(async () => {
    if (signal?.aborted) throw stopped();
    const env = await pythonHere(tools);
    if (p.code && !p.change) {
      const r = await runScript(tools, p.code, p, signal, true);
      if (!r.ok) throw new HttpError(422, `The code did not draw a plot: ${gist(r.error)}`, { code: p.code });
      return { picture: r.picture, mime: r.mime, w: r.w, h: r.h, code: p.code, ...(r.html ? { html: r.html } : {}), ...(r.notes.length ? { notes: r.notes.join('\n') } : {}) };
    }
    const system = systemFor(env, p);
    const prompt = promptFor(env, p);
    let last: { code: string; error: string } | undefined;
    let model = '';
    for (let i = 0; i < TRIES; i++) {
      if (signal?.aborted) throw stopped();
      const w = await write(db, { system, prompt: last ? `${prompt}\n\n${again(last)}` : prompt, timeoutMs: plotTiming.writeMs, signal });
      model = w.model;
      const { code, notes } = codeOf(w.text);
      if (!code) {
        last = { code: '', error: 'It had no ```python block with the script.' };
        continue;
      }
      const r = await runScript(tools, code, p, signal, i === TRIES - 1);
      if (r.ok) {
        const said = [notes, ...r.notes].filter(Boolean).join('\n');
        return { picture: r.picture, mime: r.mime, w: r.w, h: r.h, code, model, ...(r.html ? { html: r.html } : {}), ...(said ? { notes: said } : {}) };
      }
      last = { code, error: r.error };
    }
    throw new HttpError(422, `The plot could not be drawn in ${TRIES} tries: ${gist(last!.error)}`, { ...(last!.code ? { code: last!.code } : {}), model });
  });
}

// ---- the route ---------------------------------------------------------------------------------------------------

function plotRoutes(app: FastifyInstance, db: DB) {
  app.post('/api/plots/make', async (req, reply) => {
    const p = readAsk(req.body);
    // Closed in the editor (or cut by a proxy): the writer and Python stop.
    const gone = new AbortController();
    reply.raw.on('close', () => reply.raw.writableFinished || gone.abort());
    const made = await drawPlot(db, p, gone.signal);
    const answer: PlotAnswer = {
      src: ASSET + putAsset(db, made.picture),
      w: made.w,
      h: made.h,
      mime: made.mime,
      code: made.code,
      ...(made.html ? { html: made.html } : {}),
      ...(made.notes ? { notes: made.notes } : {}),
      ...(made.model ? { model: made.model } : {}),
    };
    return answer;
  });
}

// ---- make_plot ---------------------------------------------------------------------------------------------------

function imagesOn(db: DB): boolean {
  try {
    return JSON.parse(kvGet(db, 'images') ?? '{}').enabled !== false;
  } catch {
    return true;
  }
}

const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const KINDS: DataKind[] = ['csv', 'tsv', 'json', 'jsonl'];

/** A data file of the session's: CSV, TSV or JSON text, up to 20 MB. */
async function readData(file: string): Promise<PlotData> {
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new Error(`No such data file: ${file}`);
  if (st.size > MAX_DATA_FILE) throw new Error(`${path.basename(file)} is over ${MAX_DATA_FILE / 1024 / 1024} MB: give a part or a summary of it.`);
  const bytes = await fs.promises.readFile(file);
  if (bytes.subarray(0, 8000).includes(0)) throw new Error(`${path.basename(file)} is not text: give a CSV, TSV or JSON file (convert a spreadsheet to CSV first).`);
  return { kind: dataKind(bytes.subarray(0, 64 * 1024).toString('utf8'), file), bytes };
}

function plotTool(db: DB): RunTool {
  return {
    name: 'make_plot',
    // It writes files, and asks the writer (a model, most often outside this computer).
    annotations: { readOnlyHint: false, openWorldHint: true },
    description: [
      'Draw a plot from data, or from maths, as a picture for a slide, a document or a page: a model (the helper model picked in Settings → Models, else Claude) writes its Python with matplotlib, it runs on this computer, and what goes wrong goes back to the model to fix (up to three tries).',
      'Use it for what the chart part of slides cannot draw: scatter plots, histograms, box plots, error bars and bands, several axes or panels, heat maps, functions and other maths, fits and annotations; for plain bars, lines and pies in a deck, the deck’s own chart is better.',
      'Give the data inline in data (CSV, TSV or JSON text, up to 200 KB) or as data_file (the path of a CSV, TSV or JSON file, up to 20 MB): the model sees its columns and first rows, the script reads all of it. Without data, request says what to draw (a function, a distribution).',
      'Say in request what to plot and the point it makes; theme gives the colours, text colour, background and font to draw in (a deck’s theme), width and height its size in pixels (default 960×540).',
      'Free (Python runs here), apart from the model’s answer; it takes about half a minute.',
      'It saves images/<name>.svg (format png: .png) and its code, images/<name>.py; with interactive: true also images/<name>.html, the same plot with Plotly, that moves and answers the pointer, for a custom code part in a web-format deck (its picture as the poster).',
      'To change a plot, give code (its .py path) and change (what to change), with the same data; code alone draws that code again as it is.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        request: { type: 'string', description: 'What to plot, and the point it should make ("monthly sales as bars, 2025 against 2026; show that spring doubled").' },
        data: { type: 'string', description: 'The data, inline: CSV, TSV or JSON text, up to 200 KB.' },
        data_file: { type: 'string', description: 'Or the path of a CSV, TSV or JSON file with the data, up to 20 MB.' },
        code: { type: 'string', description: 'A plot made before: its .py path (or its code), to change it or draw it again.' },
        change: { type: 'string', description: 'What to change in that plot ("log scale on y", "label the peak").' },
        theme: {
          type: 'object',
          properties: {
            colors: { type: 'array', items: { type: 'string' }, maxItems: 12, description: 'The series’ colours, in order, as #hex (a deck’s theme colours).' },
            fg: { type: 'string', description: 'The text colour, #hex.' },
            bg: { type: 'string', description: 'The colour it is shown on, #hex (the plot itself stays see-through).' },
            font: { type: 'string', description: 'The font, used when this computer has it.' },
          },
          description: 'The colours and font to draw in.',
        },
        width: { type: 'integer', minimum: 160, maximum: 2400, description: 'Its width in pixels.' },
        height: { type: 'integer', minimum: 160, maximum: 2400, description: 'Its height in pixels.' },
        format: { type: 'string', enum: ['svg', 'png'], description: 'svg (a drawing, sharp at any size; the default) or png (a picture: for very many points).' },
        interactive: { type: 'boolean', description: 'Also the same plot with Plotly, as a small page (images/<name>.html), for a web-format deck.' },
        name: { type: 'string', description: 'A short file name, without extension (default: from the request).' },
      },
    },
    async run(a, ctx) {
      const request = text(a.request, 4000);
      const change = text(a.change, 4000) || undefined;
      let code = typeof a.code === 'string' && a.code.trim() ? a.code : undefined;
      let codeFile: string | undefined;
      if (code && /^[^\n]{1,500}\.py$/.test(code.trim())) {
        codeFile = inSession(ctx.cwd, code.trim());
        code = await fs.promises.readFile(codeFile, 'utf8').catch(() => {
          throw new Error(`No such script: ${codeFile}`);
        });
      }
      if (code && Buffer.byteLength(code) > MAX_CODE) throw new Error('The code is over 100 KB.');
      if (!request && !code) throw new Error('Say what to plot in request, and give its data in data or data_file.');
      if (change && !code) throw new Error('To change a plot, give its code (its .py path) with change.');
      let data: PlotData | undefined;
      let inline = false;
      if (typeof a.data_file === 'string' && a.data_file.trim()) data = await readData(inSession(ctx.cwd, a.data_file.trim()));
      else if (typeof a.data === 'string' && a.data.trim()) {
        if (Buffer.byteLength(a.data) > MAX_DATA) throw new Error(`data is over ${MAX_DATA / 1024} KB inline: save it as a file and give data_file.`);
        data = { kind: dataKind(a.data), bytes: Buffer.from(a.data.replace(/^\ufeff/, ''), 'utf8') };
        inline = true;
      } else if (codeFile) {
        // The data a plot made here read, kept beside its code.
        const stem = codeFile.replace(/\.py$/, '');
        for (const k of KINDS)
          if (fs.existsSync(`${stem}.data.${k}`)) {
            data = { kind: k, bytes: await fs.promises.readFile(`${stem}.data.${k}`) };
            inline = true;
            break;
          }
      }
      let theme = a.theme as PlotAsk['theme'] | string | undefined;
      if (typeof theme === 'string')
        try {
          theme = JSON.parse(theme.trim() || '{}') as PlotAsk['theme'];
        } catch {
          throw new Error('theme: an object, like { "colors": ["#2563eb", "#ea580c"], "fg": "#1f2937", "bg": "#ffffff", "font": "Inter" }.');
        }
      const p: Plotting = { request, data, theme: themeOf(theme as PlotAsk['theme']), ...sizeOf(a.width, a.height), format: a.format === 'png' ? 'png' : 'svg', code, change, interactive: a.interactive === true || a.interactive === 'true' };
      const dir = path.join(ctx.cwd, 'images');
      const base = slug(text(a.name, 120) || (codeFile ? path.basename(codeFile, '.py') : request || change || 'plot'), 'plot');
      let made: Plot;
      try {
        made = await drawPlot(db, p, ctx.signal);
      } catch (e) {
        const err = e as HttpError;
        const failed = typeof err.extra?.code === 'string' ? err.extra.code : '';
        if (!failed || !(err instanceof HttpError)) return { isError: true, text: err.message };
        // Its last script, for the agent to read and mend.
        await fs.promises.mkdir(dir, { recursive: true });
        const stem = freeStem(dir, `${base}-failed`);
        await fs.promises.writeFile(path.join(dir, `${stem}.py`), failed.endsWith('\n') ? failed : `${failed}\n`);
        if (data && inline) await fs.promises.writeFile(path.join(dir, `${stem}.data.${data.kind}`), data.bytes);
        return { isError: true, text: `${err.message}\nIts last script: ${path.join(dir, `${stem}.py`)}. Mend it and call make_plot with code: that path alone, to draw it as it is.` };
      }
      await fs.promises.mkdir(dir, { recursive: true });
      const ext = made.mime === 'image/svg+xml' ? 'svg' : 'png';
      // A name of its own, claimed by its picture (another plot may be saving beside it).
      let stem = '';
      let pic = '';
      for (let n = 0; !stem; n++) {
        const s = freeStem(dir, base);
        try {
          await fs.promises.writeFile(path.join(dir, `${s}.${ext}`), made.picture, { flag: 'wx' });
          [stem, pic] = [s, path.join(dir, `${s}.${ext}`)];
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || n > 20) throw e;
        }
      }
      await fs.promises.writeFile(path.join(dir, `${stem}.py`), made.code.endsWith('\n') ? made.code : `${made.code}\n`);
      const dataCopy = data && inline ? path.join(dir, `${stem}.data.${data.kind}`) : '';
      if (dataCopy) await fs.promises.writeFile(dataCopy, data!.bytes);
      const page = made.html ? path.join(dir, `${stem}.html`) : '';
      if (page) await fs.promises.writeFile(page, made.html!);
      return [
        made.model ? `Made a plot with Python here, its code written by ${made.model}:` : 'Drew the plot with Python here, from the code as it was given:',
        `${pic} (${made.w}×${made.h}, ${size(made.picture.length)})`,
        `Its code: ${path.join(dir, `${stem}.py`)}${data ? ` (it reads its data as ${fileOf(data)}${dataCopy ? `; that data is beside it: ${dataCopy}` : ''})` : ''}.`,
        ...(page ? [`Its interactive version: ${page} (Plotly; for a custom code part in a web-format deck, with the picture above as its poster).`] : []),
        `Use it by its path in a slide, a document or a page, or show it to the user with present_files. To change it, call make_plot with code: "${path.join(dir, `${stem}.py`)}" and change${dataCopy ? '' : ', with the same data'}.`,
        ...(made.notes ? [`Notes: ${made.notes}`] : []),
      ].join('\n');
    },
  };
}

/** A name none of a plot's files has in `dir` yet. */
function freeStem(dir: string, base: string): string {
  for (let n = 1; n < 1000; n++) {
    const s = `${base}${n > 1 ? `-${n}` : ''}`;
    if (!['svg', 'png', 'py', 'html', ...KINDS.map((k) => `data.${k}`)].some((e) => fs.existsSync(path.join(dir, `${s}.${e}`)))) return s;
  }
  return `${base}-${Date.now()}`;
}

export const plots: Feature = {
  id: 'plots',
  routes({ app, db }) {
    plotRoutes(app, db);
    videoRoutes(app, db);
  },
  tools: ({ deps }) => (imagesOn(deps.db) ? [plotTool(deps.db)] : []),
};
