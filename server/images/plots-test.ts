// Script tests for plots and the editors' videos: what a plot's writer is told and shown (the data's start, never more
// than a few KB; the size, colours and font), the check a script passes before it runs, a script that fails going back
// to the writer with what went wrong (three tries), code drawn again as it is and code changed, the drawing cleaned or
// kept as a picture, the interactive version (Plotly, in a page of the app's own), make_plot's files in the session,
// and a video made for an editor: sent, followed, kept as decks keep theirs with its first frame, failed, picked up
// again after a restart. The writer and OpenRouter are stand-ins; Python is real (one with matplotlib: HYDOR_TEST_PYTHON,
// else /tmp/hydor-mr-a3-py/bin/python), run as the picture tools would (a folder of its own, a time limit).
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/images/plots-test.ts
//   DATA_DIR=/tmp/hydor-test-plots node dist/dev/plots-test.js
// LIVE_PLOT=1 also draws one plot with the real writer (Claude, through its CLI).
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { KIT_LIBS } from '../../shared/app-media.ts';
import { APP_ROOT } from '../config.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { hasFfmpeg } from '../media/frames.ts';
import { loadConfig, saveConfig } from '../models/config.ts';
import { getAsset, initAssets, putAsset } from '../pages/assets.ts';
import { getVideo } from '../pages/videos.ts';
import { setCloudTools, setLocalTools, type LocalTools, type PythonRun } from './hooks.ts';
import { codeOf, dataKind, figureOf, inPixels, NO_PYTHON, plotlyPage, plotTiming, plots, preview, promptFor, pyParts, screen, setPlotWriterForTests, sizeOf, svgSize, systemFor, themeOf, type PyEnv } from './plots.ts';
import { timing } from './video.ts';
import { fitVideo, NO_KEY, videoJobs } from './videojobs.ts';
import type { WriteAsk } from './writer.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-plots-test-')));
{
  const c = loadConfig();
  delete c.openrouter.apiKey;
  saveConfig(c);
}

// ---- a Python with matplotlib, run as the picture tools run one ----------------------------------------------

const PY = [process.env.HYDOR_TEST_PYTHON, '/tmp/hydor-mr-a3-py/bin/python'].find((p) => p && fs.existsSync(p));
const scripts = path.join(tmp, 'scripts');
const mpl = path.join(tmp, 'mpl');
fs.mkdirSync(scripts);
fs.mkdirSync(mpl);
const runs: { code: string; given: string[]; ended?: 'ok' | 'failed' | 'stopped' }[] = [];
const runPython: LocalTools['runPython'] = async (code, o) => {
  const one: (typeof runs)[number] = { code, given: Object.keys(o.files ?? {}) };
  runs.push(one);
  for (const [n, b] of Object.entries(o.files ?? {})) fs.writeFileSync(path.join(o.cwd, n), b);
  const file = path.join(scripts, `run-${runs.length}.py`);
  fs.writeFileSync(file, code);
  return new Promise<PythonRun>((resolve) => {
    const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: o.cwd, MPLBACKEND: 'Agg', MPLCONFIGDIR: mpl, CUDA_VISIBLE_DEVICES: '' };
    execFile(PY!, ['-I', file], { cwd: o.cwd, env, timeout: o.timeoutMs, signal: o.signal, maxBuffer: 8 << 20 }, (err, stdout, stderr) => {
      const files: Record<string, Buffer> = {};
      for (const n of fs.readdirSync(o.cwd)) if (!(n in (o.files ?? {}))) files[n] = fs.readFileSync(path.join(o.cwd, n));
      const late = (err as { killed?: boolean } | null)?.killed ? `\nIt ran over ${o.timeoutMs / 1000} s and was stopped.` : '';
      one.ended = !err ? 'ok' : err.name === 'AbortError' ? 'stopped' : 'failed';
      resolve({ ok: !err, stdout, stderr: `${stderr}${late}`, files });
    });
  });
};
const tools: LocalTools = {
  state: () => ({ ready: true, installing: false, canInstall: true, sizeMb: 120, downloaded: [], loaded: [] }),
  ready: () => true,
  cutout: async () => {
    throw new Error('not in this test');
  },
  erase: async () => {
    throw new Error('not in this test');
  },
  runPython,
};

// ---- the writer, a stand-in that answers as told ---------------------------------------------------------------

const asks: WriteAsk[] = [];
let answers: string[] = [];
setPlotWriterForTests(async (q) => {
  asks.push(q);
  const a = answers.shift();
  if (a === undefined) throw new Error('The test writer has nothing more to say');
  return a;
});
const say = (code: string, words = 'Bars of each month’s sales, the spring months twice the winter ones.') => `\`\`\`python\n${code}\n\`\`\`\n${words}`;

const CSV = 'month,sales\nJan,120\nFeb,135\nMar,240\nApr,260\nMay,250\n';
const GOOD = `import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import csv, json

rows = list(csv.DictReader(open('data.csv')))
months = [r['month'] for r in rows]
sales = [float(r['sales']) for r in rows]
fig, ax = plt.subplots(figsize=(800 / 96, 450 / 96), layout='constrained')
ax.bar(months, sales, color='#2563eb')
ax.set_title('Sales doubled after the spring launch')
ax.set_ylabel('Sales (units)')
ax.spines[['top', 'right']].set_visible(False)
fig.savefig('plot.svg', transparent=True)
fig.savefig('plot.png', dpi=192, transparent=True)
json.dump({'data': [{'type': 'bar', 'x': months, 'y': sales, 'marker': {'color': '#2563eb'}, 'name': '</script><script>alert(1)</script>'}],
           'layout': {'title': 'Sales doubled', 'width': 800, 'height': 450, 'xaxis': {'title': 'Month'}, 'yaxis': {'title': {'text': 'Sales'}, 'titlefont': {'size': 14}}}},
          open('plot.json', 'w'), default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o))
`;
const BAD = GOOD.replace("float(r['sales'])", "float(r['Sales'])");
const NOTHING = GOOD.replace(/fig\.savefig\([^\n]*\n/g, '').replace(/json\.dump[\s\S]*$/, '');
const MATHS = `import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
x = np.linspace(0, 2 * np.pi, 200)
fig, ax = plt.subplots(figsize=(400 / 96, 300 / 96), layout='constrained')
ax.plot(x, np.sin(x), color='#16a34a')
ax.set_title('One period of the sine')
fig.savefig('plot.png', dpi=192, transparent=True)
`;
const HEAT = `import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
fig, ax = plt.subplots(figsize=(4, 3), layout='constrained')
ax.imshow(np.arange(16).reshape(4, 4))
fig.savefig('plot.svg', transparent=True)
fig.savefig('plot.png', dpi=192, transparent=True)
`;

// ---- the app around it --------------------------------------------------------------------------------------

const db = openDb(path.join(tmp, 'test.db'));
initAssets(db);
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
  try {
    done(null, String(b).trim() ? JSON.parse(String(b)) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});
app.setErrorHandler((err: Error & { status?: number; statusCode?: number; extra?: Record<string, unknown> }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ ...err.extra, error: err.message }));
const deps = { app, db, broadcast() {}, toSubscribers() {}, publicBase: () => 'https://hydor.example' } as unknown as Deps;
plots.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:p1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tool = () => plots.tools!(ctx).find((t) => t.name === 'make_plot');
const run = async (args: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> => {
  try {
    const r = await tool()!.run(args, ctx);
    return typeof r === 'string' ? { text: r } : r;
  } catch (e) {
    return { text: String((e as Error).message), isError: true };
  }
};
const req = (method: 'GET' | 'POST', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const until = async (cond: () => boolean | Promise<boolean>, ms = 15_000) => {
  const end = Date.now() + ms;
  while (!(await cond()) && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  return cond();
};

ok(plots.id === 'plots' && /\bimages, plots,/.test(fs.readFileSync(path.join(APP_ROOT, 'server/features/index.ts'), 'utf8')), 'plots is one of the app’s capabilities, after images');

// ---- what is asked, read ------------------------------------------------------------------------------------

{
  ok(dataKind(CSV) === 'csv' && dataKind('a\tb\n1\t2') === 'tsv' && dataKind('[{"a": 1}]') === 'json' && dataKind('{"a": 1}\n{"a": 2}\n') === 'jsonl', 'CSV, TSV, JSON and JSON lines, from their start');
  ok(dataKind('x', 'sales.TSV') === 'tsv' && dataKind('[1]', 'a.csv') === 'csv' && dataKind('{}', 'a.geojson') === 'json' && dataKind('a,b\tc,d') === 'csv', 'by the file’s name first; commas outnumbering tabs');
  const big = `t,value\n${Array.from({ length: 9000 }, (_, i) => `${i},${Math.sin(i).toFixed(6)}`).join('\n')}\n`;
  const v = preview({ kind: 'csv', bytes: Buffer.from(big) });
  ok(v.head.length <= 3000 && v.head.startsWith('t,value\n0,0.000000') && v.head.split('\n').length === 12 && /9001 lines/.test(v.about), `a long table: its first rows only, ${v.head.length} characters (${v.about})`);
  const wide = preview({ kind: 'csv', bytes: Buffer.from(`${'x'.repeat(5000)}\n1\n`) });
  ok(wide.head.length < 400 && wide.head.endsWith('…\n1'), 'a very long line cut');
  const j = preview({ kind: 'json', bytes: Buffer.from(JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ day: `2026-01-${(i % 28) + 1}`, temp: i / 10 })))) });
  ok(/^an array of 500 objects with the fields day, temp$/.test(j.about) && /… 494 more/.test(j.head) && j.head.length < 3000, `JSON: its shape, its lists shortened (${j.about})`);
  const o = preview({ kind: 'json', bytes: Buffer.from(JSON.stringify({ x: [1, 2, 3], y: [4, 5, 6], title: 'T' })) });
  ok(o.about === 'an object with the keys x (a list of 3), y (a list of 3), title (string)', `an object of columns: ${o.about}`);

  const t = themeOf({ colors: ['#FF0000', 'red', '#00ff00', 'javascript:x'], bg: '#0b1020', font: '"Inter", system-ui, sans-serif' });
  ok(t.colors.join() === '#ff0000,#00ff00' && t.fg === '#f3f4f6' && t.bg === '#0b1020' && t.font === 'Inter', `colours as #hex, light text on a dark background, the font’s first family: ${JSON.stringify(t)}`);
  const d = themeOf(undefined);
  ok(d.colors.length === 6 && d.fg === '#1f2937' && d.bg === '#ffffff' && !d.font, 'the app’s colours when none are given');
  ok(!themeOf({ font: 'sans-serif' }).font && !themeOf({ font: 'x</style>' }).font, 'no generic or odd font names');
  ok(
    JSON.stringify(sizeOf(undefined, undefined)) === '{"w":960,"h":540}' && JSON.stringify(sizeOf(800, undefined)) === '{"w":800,"h":450}' && JSON.stringify(sizeOf(99999, 10)) === '{"w":2400,"h":160}',
    'its size: 960×540, 16:9 from one side, kept within bounds',
  );
  ok(JSON.stringify(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="600pt" height="337.5pt" viewBox="0 0 600 337.5">')) === '{"w":800,"h":450}', 'matplotlib’s points read as pixels');
  ok(
    inPixels('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="720pt" height="337.5pt" viewBox="0 0 720 337.5" stroke-width="2pt"><rect width="10pt" height="1"/></svg>') ===
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="960" height="450" viewBox="0 0 720 337.5" stroke-width="2pt"><rect width="10pt" height="1"/></svg>',
    'the root’s size in pixels before it is cleaned (a cleaner reads pixels), nothing else touched',
  );
  ok(JSON.stringify(svgSize('<svg viewBox="0 0 120 60" stroke-width="3">')) === '{"w":120,"h":60}' && JSON.stringify(svgSize('<svg width="200" viewBox="0 0 100 50">')) === '{"w":200,"h":100}', 'else its viewBox');

  const c = codeOf('Here it is:\n```py\nimport x\n```\nand the whole of it:\n```python\nimport matplotlib\nprint(1)\n```\nIt shows the trend.');
  ok(c.code === 'import matplotlib\nprint(1)' && c.notes === 'Here it is: and the whole of it: It shows the trend.', `the longest Python block, and the words around it: ${JSON.stringify(c)}`);
  ok(codeOf('import matplotlib\nplt.savefig("plot.png")').code.startsWith('import matplotlib') && codeOf('No code today.').code === '', 'a script without its fence; no script at all');
  ok(codeOf('```python\nimport matplotlib\n').code === 'import matplotlib', 'a block cut short');
}

// ---- the check before a script runs ---------------------------------------------------------------------------

{
  const parts = pyParts(`# import os\nx = "import os; open('/etc/passwd')"  # eval(\ny = r'\\d+' + '''a\n'b' c''' + f"{v:.0f}/s"\nz = 'it\\'s'`);
  ok(!/import os|eval/.test(parts.code) && parts.strings.includes("import os; open('/etc/passwd')") && parts.strings.includes("a\n'b' c") && parts.strings.includes("it\\'s"), `comments out, strings apart: ${JSON.stringify(parts)}`);
  ok(screen(GOOD) === null && screen(MATHS) === null && screen(HEAT) === null, 'a plot’s script passes');
  ok(screen('import re\np = re.compile("x")\ndf.eval("a + b")\nprint(f"{v}/s", "~5%", "...", "/", "km/h")\nif __name__ == "__main__": pass') === null, 're.compile, a table’s eval, units, rough numbers and __main__ pass');
  const refused: [string, RegExp][] = [
    ['import os\nos.system("ls")', /imports os/],
    ['import matplotlib, subprocess', /imports subprocess/],
    ['from pathlib import Path', /imports pathlib/],
    ['from . import helper', /imports from its own folder/],
    ['x = 1; import socket', /imports socket/],
    ['eval("1")', /calls eval\(\)/],
    ["exec('import os')", /calls exec\(\)/],
    ["__import__('os')", /calls __import__\(\)|__import__/],
    ['().__class__.__bases__[0].__subclasses__()', /__class__/],
    ["getattr(x, '__globals__')", /__globals__/],
    ['print(f"{eval(\'1\')}")', /calls eval\(\)/],
    ["open('/etc/passwd')", /outside its folder/],
    ["open('../secret.txt')", /outside its folder/],
    ["open('~/.ssh/id_rsa')", /outside its folder/],
    ["pd.read_csv('https://example.com/x.csv')", /outside its folder/],
    ["df = pd.read_pickle('data.json')", /read_pickle/],
    ["np.load('data.json', allow_pickle=True)", /allow_pickle/],
    ["fig.savefig('/tmp/x/plot.png')", /outside its folder/],
  ];
  for (const [src, why] of refused) {
    const r = screen(src);
    ok(r && why.test(r) && /plots here may not/.test(r), `refused: ${src.split('\n')[0]} → ${r}`);
  }
}

// ---- what the writer is told -------------------------------------------------------------------------------------

{
  const env: PyEnv = { matplotlib: '3.11.2', numpy: '2.5.4', fonts: new Set(['DejaVu Sans']) };
  const p = { request: 'Monthly sales', data: { kind: 'csv' as const, bytes: Buffer.from(CSV) }, theme: themeOf({ colors: ['#2563eb', '#ea580c'], font: 'Inter' }), w: 800, h: 450, format: 'svg' as const, interactive: true };
  const sys = systemFor(env, p);
  ok(/matplotlib 3\.11\.2 and numpy 2\.5\.4 \(pandas is not installed here/.test(sys) && /Reads the data from data\.csv, by that name alone/.test(sys), 'the writer knows what this Python has, and the data’s file');
  ok(
    /plot\.svg', transparent=True\)` and then `fig\.savefig\('plot\.png', dpi=192/.test(sys) && /plot\.json/.test(sys) && /plotly\.js 4/.test(sys) && /title that says the point/.test(sys),
    'to save the drawing and the picture, the Plotly version, and to make it read well',
  );
  const prompt = promptFor(env, p);
  ok(/^What to plot: Monthly sales\n/.test(prompt) && prompt.includes('```\nmonth,sales\nJan,120') && /figsize=\(800 \/ 96, 450 \/ 96\)/.test(prompt) && /Base font size: 10 pt/.test(prompt), `the request, the data’s start, the size: ${prompt}`);
  ok(
    /in order: #2563eb, #ea580c\./.test(prompt) && /Text, axes and ticks: #1f2937\. It is shown on #ffffff\./.test(prompt) && /DejaVu Sans \(Inter, the page's own, is not installed here\)/.test(prompt),
    'its colours, and a font this computer lacks said so',
  );
  const withPandas = systemFor({ ...env, pandas: '3.1.1', fonts: new Set(['Inter']) }, { ...p, data: undefined, format: 'png', interactive: false });
  ok(/numpy 2\.5\.4 and pandas 3\.1\.1/.test(withPandas) && /there is no data file/.test(withPandas) && !/plot\.svg/.test(withPandas) && !/plot\.json/.test(withPandas), 'pandas when it is there; a plot without data; a picture alone');
  ok(/Font: Inter \(installed here\)/.test(promptFor({ ...env, fonts: new Set(['Inter']) }, p)), 'a font this computer has');
  const change = promptFor(env, { ...p, code: GOOD, change: 'log scale' });
  ok(/Change this plot: log scale\n\nThe script it was made with:\n```python\nimport matplotlib/.test(change), 'a change: what, and the script it was made with');
}

// ---- the interactive version ------------------------------------------------------------------------------------

{
  ok(
    figureOf(undefined) === 'It saved no plot.json (the same plot for Plotly).' && /needs "data"/.test(String(figureOf(Buffer.from('{"data": []}')))) && /not JSON/.test(String(figureOf(Buffer.from('{oops')))),
    'a missing, empty or broken plot.json, said so',
  );
  const nan = figureOf(Buffer.from('{"data": [{"type": "scatter", "y": [1, NaN, -Infinity]}], "layout": {}}'));
  ok(typeof nan === 'object' && JSON.stringify(nan.data[0].y) === '[1,null,null]', 'Python’s NaN read as nothing');
  const fig = figureOf(
    Buffer.from(JSON.stringify({ data: [{ type: 'bar', y: [1], name: '</script><script>alert(1)</script>', marker: { colorbar: { title: 'Units' } } }], layout: { title: 'T', width: 9, height: 9, xaxis: { title: 'X', titlefont: { size: 12 } } } })),
  );
  const page = plotlyPage(fig as Exclude<typeof fig, string>, themeOf({ colors: ['#2563EB'], fg: '#111111', bg: '#fafafa', font: 'Inter' }));
  const json = JSON.parse(/<script type="application\/json" id="figure">(.*?)<\/script>/.exec(page)![1]);
  ok(page.includes(`https://cdn.jsdelivr.net/npm/plotly.js-dist-min@${KIT_LIBS.plotly.version}/plotly.min.js`), 'Plotly from jsDelivr, at the version views use');
  ok(!page.includes('</script><script>alert') && json.data[0].name === '</script><script>alert(1)</script>', 'what the data says stays data: nothing in it ends its element');
  ok(
    json.layout.title.text === 'T' && json.layout.xaxis.title.text === 'X' && json.layout.xaxis.title.font.size === 12 && !('titlefont' in json.layout.xaxis) && json.data[0].marker.colorbar.title.text === 'Units',
    'titles as plotly.js takes them now',
  );
  ok(!('width' in json.layout) && !('height' in json.layout), 'no fixed size: it fills its frame');
  ok(
    /showSendToCloud: false/.test(page) && /'--n-c' \+ \(i \+ 1\)/.test(page) && /--n-font/.test(page) && /"colors":\["#2563eb"\],"fg":"#111111","bg":"#fafafa","font":"Inter"/.test(page),
    'the deck’s colours and font take the place of those it was made in; nothing goes to Plotly’s cloud',
  );
}

// ---- POST /api/plots/make -----------------------------------------------------------------------------------------

{
  const none = await req('POST', '/api/plots/make', { request: 'x' });
  ok(none.statusCode === 400 && none.json().error === NO_PYTHON, `no Python for plots yet: ${none.body}`);
}

if (!PY) console.log('(no Python with matplotlib here: set HYDOR_TEST_PYTHON to run the plots for real)');
else {
  setLocalTools(tools);
  plotTiming.runMs = 20_000;

  ok((await req('POST', '/api/plots/make', {})).statusCode === 400 && (await req('POST', '/api/plots/make', { change: 'x' })).statusCode === 400, 'nothing to plot; a change without its code');
  const huge = await req('POST', '/api/plots/make', { request: 'x', data: 'a,b\n'.repeat(60_000) });
  ok(huge.statusCode === 413 && /over 200 KB/.test(huge.json().error), 'data over 200 KB, refused');

  // A first script that fails: the error goes back, and the second draws it. No cleaner for drawings yet: a PNG.
  answers = [say(BAD), say(GOOD)];
  asks.length = 0;
  const before = runs.length;
  const r1 = await req('POST', '/api/plots/make', { request: 'Monthly sales: show that spring doubled', data: CSV, theme: { colors: ['#2563eb'] }, w: 800, h: 450, interactive: true });
  const a1 = r1.json();
  ok(r1.statusCode === 200 && asks.length === 2, `drawn on the second try: ${r1.statusCode} ${r1.body.slice(0, 300)}`);
  ok(runs.length === before + 3 && runs[before].code.includes('font_manager') && runs[before + 1].given.join() === 'data.csv', 'Python asked what it has, once; the data beside each script');
  ok(/KeyError: 'Sales'/.test(asks[1].prompt) && asks[1].prompt.includes("float(r['Sales'])") && /Answer with the whole script again, fixed\.$/.test(asks[1].prompt), 'the failed script and its error, back to the writer');
  ok(asks[0].prompt.includes('month,sales\nJan,120') && /matplotlib 3\.\d+/.test(asks[0].system) && /pandas \d/.test(asks[0].system), 'the writer saw the data’s start and what this Python has');
  ok(a1.mime === 'image/png' && a1.w === 800 && a1.h === 450 && /^naget-asset:[a-f0-9]{40}$/.test(a1.src) && a1.code === GOOD.trim() && a1.model === 'the test writer', `a picture at the size asked, with its code: ${a1.mime} ${a1.w}×${a1.h}`);
  ok(/twice the winter/.test(a1.notes) && /kept as a picture \(PNG\): its drawing \(SVG\) could not be kept safely/.test(a1.notes), `what the writer said, and why it is a PNG: ${a1.notes}`);
  const kept = getAsset(db, a1.src.slice('naget-asset:'.length));
  ok(kept?.mime === 'image/png' && kept.data.readUInt32BE(16) === 1600, 'kept, at twice its size for sharp screens');
  ok(typeof a1.html === 'string' && a1.html.includes('Plotly.newPlot') && !a1.html.includes('</script><script>alert') && /"title":\{"text":"Sales doubled"\}/.test(a1.html), 'its interactive version, with its data inside');

  // Drawings cleaned before they are kept.
  let cleaned = 0;
  let cleaner: (t: string) => string | null = (t) => (cleaned++, t.replace(/<metadata>[\s\S]*?<\/metadata>/, ''));
  setCloudTools({ edit: async () => ({}) as never, cleanSvg: (t) => cleaner(t) });
  answers = [say(GOOD)];
  const r2 = (await req('POST', '/api/plots/make', { request: 'Monthly sales', data: CSV, w: 800, h: 450 })).json();
  const svg = getAsset(db, String(r2.src).slice('naget-asset:'.length));
  ok(r2.mime === 'image/svg+xml' && cleaned === 1 && svg?.mime === 'image/svg+xml' && !svg.data.includes('<metadata>') && r2.w === 800 && r2.h === 450 && !r2.html, `a drawing, cleaned, at its size: ${r2.mime} ${r2.w}×${r2.h}`);
  cleaner = () => null;
  answers = [say(GOOD)];
  const r3 = (await req('POST', '/api/plots/make', { request: 'Monthly sales', data: CSV })).json();
  ok(r3.mime === 'image/png' && /could not be kept safely/.test(r3.notes), 'nothing safe left of the drawing: the picture');
  cleaner = (t) => t;
  answers = [say(HEAT)];
  const r4 = (await req('POST', '/api/plots/make', { request: 'A heat map' })).json();
  ok(r4.mime === 'image/png' && /a picture inside it/.test(r4.notes) && !runs[runs.length - 1].given.length, `a drawing with a picture in it: the picture (${r4.notes}); no data file`);
  answers = [say(MATHS, 'One period.')];
  const r5 = (await req('POST', '/api/plots/make', { request: 'sin x over one period', format: 'png', w: 400, h: 300 })).json();
  ok(r5.mime === 'image/png' && r5.w === 400 && r5.h === 300 && r5.notes === 'One period.', 'maths, as a picture');

  // Code drawn again as it is: no writer. Changed: the writer gets it.
  asks.length = 0;
  const r6 = (await req('POST', '/api/plots/make', { request: 'Monthly sales', data: CSV, code: GOOD, w: 800, h: 450 })).json();
  ok(asks.length === 0 && r6.mime === 'image/svg+xml' && r6.code === GOOD && !r6.model, 'code alone, drawn as it is');
  const r7 = await req('POST', '/api/plots/make', { code: BAD, data: CSV });
  ok(r7.statusCode === 422 && /KeyError: 'Sales'/.test(r7.json().error) && r7.json().code === BAD && asks.length === 0, `code that fails, said so, with its code: ${r7.json().error}`);
  const r8 = await req('POST', '/api/plots/make', { code: 'import os\nprint(os.listdir("/"))' });
  ok(r8.statusCode === 422 && /imports os/.test(r8.json().error), 'code the check refuses, never run');
  answers = [say(GOOD.replace("color='#2563eb'", "color='#ea580c'"))];
  const r9 = (await req('POST', '/api/plots/make', { request: 'Monthly sales', data: CSV, code: GOOD, change: 'orange bars' })).json();
  ok(asks.length === 1 && /Change this plot: orange bars/.test(asks[0].prompt) && asks[0].prompt.includes(GOOD.trimEnd()) && r9.code.includes('#ea580c'), 'a change, made by the writer to the code given');

  // Three tries, then the last script back with the error.
  asks.length = 0;
  answers = [say(BAD), 'I cannot do that.', say('import os\nos.system("rm -rf /")')];
  const n = runs.length;
  const r10 = await req('POST', '/api/plots/make', { request: 'Monthly sales', data: CSV });
  const e10 = r10.json();
  ok(r10.statusCode === 422 && /could not be drawn in 3 tries: This script imports os/.test(e10.error) && e10.code.includes('os.system') && e10.model === 'the test writer', `three tries: ${e10.error}`);
  ok(/Your last answer did not draw the plot:\n```\nIt had no ```python block/.test(asks[2].prompt) && runs.length === n + 1, 'an answer without a script said so; the refused one never ran');
  // A script that saves nothing, then one that runs too long, then one that works.
  plotTiming.runMs = 3000;
  answers = [say(NOTHING), say('import matplotlib\nmatplotlib.use("Agg")\nwhile True:\n    pass\n'), say(GOOD)];
  asks.length = 0;
  const r11 = await req('POST', '/api/plots/make', { request: 'Monthly sales', data: CSV });
  ok(r11.statusCode === 200 && /saved neither plot\.svg nor plot\.png in the current folder/.test(asks[1].prompt) && /ran over 3 s/.test(asks[2].prompt), 'saving nothing and running too long, both told to the writer');
  plotTiming.runMs = 20_000;
  // The Plotly version missing: asked again, and on the last try only a note.
  answers = [say(MATHS), say(GOOD)];
  asks.length = 0;
  const r12 = (await req('POST', '/api/plots/make', { request: 'Monthly sales', data: CSV, interactive: true })).json();
  ok(asks.length === 2 && /The picture is right, but: It saved no plot\.json/.test(asks[1].prompt) && typeof r12.html === 'string', 'no plot.json: asked again');
  const r13 = (await req('POST', '/api/plots/make', { code: MATHS, interactive: true })).json();
  ok(!r13.html && /No interactive version: It saved no plot\.json/.test(r13.notes), 'code alone without it: a note');

  // A request that is stopped (the dialog closed) stops the writer.
  const ac = new AbortController();
  setPlotWriterForTests(async (q) => {
    asks.push(q);
    ac.abort();
    throw new Error('stopped');
  });
  const { drawPlot, readAsk } = await import('./plots.ts');
  const stopped = await drawPlot(db, readAsk({ request: 'x' }), ac.signal).then(
    () => 'made',
    (e: Error) => e.message,
  );
  ok(stopped === 'It was stopped', `stopped: ${stopped}`);
  setPlotWriterForTests(async (q) => {
    asks.push(q);
    const a = answers.shift();
    if (a === undefined) throw new Error('The test writer has nothing more to say');
    return a;
  });

  // Over a real connection: a request that ends well is not stopped by its own end; one closed mid-way stops its Python.
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const post = (body: unknown, signal?: AbortSignal) => fetch(`${base}/api/plots/make`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  const real = await post({ code: MATHS, format: 'png' });
  ok(real.status === 200 && (await real.json()).mime === 'image/png' && runs[runs.length - 1].ended === 'ok', 'a plot over a real connection');
  const SLOW = 'import matplotlib\nmatplotlib.use("Agg")\nimport time\ntime.sleep(30)\n';
  const closed = new AbortController();
  const gone = post({ code: SLOW }, closed.signal).catch(() => null);
  ok(await until(() => runs[runs.length - 1].code === SLOW), 'its script running');
  closed.abort();
  await gone;
  ok(await until(() => runs[runs.length - 1].ended === 'stopped', 5000), `closed: its Python stopped (${runs[runs.length - 1].ended})`);
  answers = [say(MATHS)];
  const after = await post({ request: 'sin', format: 'png' });
  ok(after.status === 200, 'and the next one draws');

  // ---- make_plot ----------------------------------------------------------------------------------------------

  ok(!!tool() && tool()!.inputSchema && /chart part of slides cannot draw/.test(tool()!.description), 'agents get make_plot, said what it is for');
  const images = path.join(tmp, 'images');
  answers = [say(GOOD)];
  const t1 = await run({ request: 'Monthly sales, spring doubled', data: CSV, theme: { colors: ['#2563eb'] }, width: 800, height: 450, interactive: true, name: 'Sales by month' });
  ok(!t1.isError && /^Made a plot with Python here, its code written by the test writer:/.test(t1.text), `made: ${t1.text.split('\n')[0]}`);
  const line = t1.text.split('\n')[1];
  ok(
    /^(\/.+?\.(?:png|jpe?g|webp|gif|svg|avif))(?: \((?:(\d+)×(\d+), )?[^)]*\))?$/i.test(line) && line.startsWith(path.join(images, 'sales-by-month.svg')) && /\(800×450, \d+ KB\)$/.test(line),
    `its picture’s line, as the conversation reads pictures: ${line}`,
  );
  ok(
    ['sales-by-month.svg', 'sales-by-month.py', 'sales-by-month.data.csv', 'sales-by-month.html'].every((f) => fs.existsSync(path.join(images, f))),
    `its files: ${fs.readdirSync(images).join(', ')}`,
  );
  ok(fs.readFileSync(path.join(images, 'sales-by-month.py'), 'utf8') === GOOD && fs.readFileSync(path.join(images, 'sales-by-month.data.csv'), 'utf8') === CSV, 'its code and its data, beside it');
  ok(/reads its data as data\.csv; that data is beside it/.test(t1.text) && /Its interactive version: .*sales-by-month\.html/.test(t1.text) && /present_files/.test(t1.text), 'where everything is, and how to change it');

  // Changed by its .py path: its data found beside it, a new name.
  asks.length = 0;
  answers = [say(GOOD.replace('#2563eb', '#16a34a'))];
  const t2 = await run({ code: path.join(images, 'sales-by-month.py'), change: 'green bars' });
  ok(
    !t2.isError && asks[0].prompt.includes('month,sales\nJan,120') && /Change this plot: green bars/.test(asks[0].prompt) && fs.existsSync(path.join(images, 'sales-by-month-2.svg')),
    `changed by its path, its data found beside it: ${t2.text.split('\n')[1]}`,
  );
  // A data file of the session's.
  fs.writeFileSync(path.join(tmp, 'sales.tsv'), CSV.replace(/,/g, '\t'));
  answers = [say(GOOD.replace("open('data.csv')", "open('data.tsv'), delimiter='\\t'"))];
  asks.length = 0;
  const t3 = await run({ request: 'Monthly sales', data_file: 'sales.tsv', format: 'png' });
  ok(
    !t3.isError &&
      /The data: data\.tsv in the current folder/.test(asks[0].prompt) &&
      fs.existsSync(path.join(images, 'monthly-sales.png')) &&
      !fs.existsSync(path.join(images, 'monthly-sales.data.tsv')) &&
      /reads its data as data\.tsv\)/.test(t3.text),
    `a data file, read where it is: ${t3.text.split('\n').slice(0, 3).join(' / ')}`,
  );
  ok((await run({ request: 'x', data_file: 'nope.csv' })).isError && (await run({})).isError && (await run({ change: 'x' })).isError, 'no such file; nothing asked; a change without its code');
  fs.writeFileSync(path.join(tmp, 'binary.csv'), Buffer.from([0, 1, 2, 3]));
  ok(/is not text/.test((await run({ request: 'x', data_file: 'binary.csv' })).text), 'a file that is not text');
  // Three failed tries: its last script kept for the agent to mend.
  answers = [say(BAD), say(BAD), say(BAD)];
  const t4 = await run({ request: 'Monthly sales', data: CSV, name: 'broken' });
  ok(
    t4.isError && /could not be drawn in 3 tries: KeyError: 'Sales'/.test(t4.text) && fs.readFileSync(path.join(images, 'broken-failed.py'), 'utf8') === BAD && /code: that path alone/.test(t4.text),
    `failed: its last script kept (${t4.text.split('\n').pop()})`,
  );
  // Images off in Settings: no tool.
  kvSet(db, 'images', JSON.stringify({ enabled: false }));
  ok(!tool(), 'no make_plot while images are off');
  kvSet(db, 'images', JSON.stringify({ enabled: true }));
}

// ---- videos for the editors ------------------------------------------------------------------------------------

const ff = await hasFfmpeg();
const clip = path.join(tmp, 'clip.mp4');
if (ff) execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=640x360:rate=24', '-pix_fmt', 'yuv420p', clip]);
else console.log('(no ffmpeg here: the videos are not tested)');

const VIDEO_MODELS = [
  {
    id: 'google/veo-3.1-lite',
    name: 'Google: Veo 3.1 Lite',
    created: 1790000000,
    supported_durations: [4, 6, 8],
    supported_resolutions: ['1080p', '720p'],
    supported_aspect_ratios: ['16:9', '9:16'],
    supported_frame_images: ['first_frame', 'last_frame'],
    generate_audio: true,
    pricing_skus: { duration_seconds_with_audio: '0.08', duration_seconds_without_audio: '0.05', duration_seconds_with_audio_720p: '0.05', duration_seconds_without_audio_720p: '0.03' },
  },
  {
    id: 'bytedance/seedance-2.0-fast',
    name: 'ByteDance: Seedance 2.0 Fast',
    supported_durations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    supported_resolutions: ['480p', '720p'],
    supported_aspect_ratios: ['16:9'],
    generate_audio: true,
    pricing_skus: { video_tokens: '0.0000042' },
  },
  { id: 'runway/aleph-2', name: 'Runway: Aleph 2.0', supported_aspect_ratios: ['16:9'], pricing_skus: { cents_per_second_output: '28' } },
];
const calls: { path: string; body?: any }[] = [];
const jobsThere = new Map<string, { polls: number; outcome: 'completed' | 'failed' | 'slow' }>();
let outcome: 'completed' | 'failed' | 'slow' = 'completed';
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://openrouter.ai/')) return realFetch(input, init);
  const u = new URL(url);
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  const p = u.pathname.replace(/^\/api\/v1/, '');
  calls.push({ path: p, body });
  const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } });
  if (p === '/videos/models') return json({ data: VIDEO_MODELS });
  if (p === '/videos' && init?.method === 'POST') {
    const id = `gen-vid-${String(calls.length).padStart(12, '0')}`;
    jobsThere.set(id, { polls: 0, outcome });
    return json({ id, status: 'pending' }, 202);
  }
  const job = /^\/videos\/([^/]+)$/.exec(p)?.[1];
  if (job) {
    const j = jobsThere.get(job);
    if (!j) return json({ error: { message: 'Not found' } }, 404);
    j.polls++;
    if (j.outcome === 'slow' || j.polls < 2) return json({ id: job, status: 'in_progress' });
    if (j.outcome === 'failed') return json({ id: job, status: 'failed', error: 'Content policy violation' });
    return json({ id: job, status: 'completed', unsigned_urls: [`https://openrouter.ai/api/v1/videos/${job}/content?index=0`], usage: { cost: 0.4 } });
  }
  if (/^\/videos\/[^/]+\/content$/.test(p)) return new Response(fs.readFileSync(clip), { headers: { 'content-type': 'video/mp4' } });
  return json({ error: { message: `No route ${p}` } }, 404);
}) as typeof fetch;
timing.pollMs = 20;

if (ff) {
  const noKey = await req('POST', '/api/videos/make', { prompt: 'A paper boat on a pond' });
  ok(noKey.statusCode === 400 && noKey.json().error === NO_KEY, `no key: where to add one (${noKey.body})`);
  {
    const c = loadConfig();
    c.openrouter.apiKey = 'sk-or-test';
    saveConfig(c);
  }
  ok((await req('POST', '/api/videos/make', {})).statusCode === 400, 'nothing said of the video');

  const m = (await import('./video.ts')).videoModel(VIDEO_MODELS[0]);
  ok(JSON.stringify(fitVideo(m, { duration: 7, aspect: '4:3', resolution: '900p', audio: true })) === '{"duration":6,"aspect":"16:9","resolution":"720p","audio":true}', 'fitted: the nearest length (the shorter of two), shape and resolution');
  ok(
    JSON.stringify(fitVideo(m, { duration: 30, aspect: 'wide', resolution: '4K' })) === '{"duration":8,"resolution":"1080p"}' && fitVideo(undefined, { duration: 3 }).duration === 3,
    'the longest it makes; a shape that is not one left out; an unknown model as asked',
  );

  const r1 = await req('POST', '/api/videos/make', { prompt: 'A red paper boat drifting on a pond', duration: 7, aspect: '4:3', audio: true });
  const j1 = r1.json();
  const sent = calls.filter((c) => c.path === '/videos').pop()!.body;
  ok(r1.statusCode === 200 && /^gen-vid-/.test(j1.job) && j1.status === 'queued' && j1.model === 'google/veo-3.1-lite' && j1.seconds === 6 && Math.abs(j1.cost - 0.3) < 1e-9 && j1.startedAt > 0, `started: ${r1.body}`);
  ok(sent.model === 'google/veo-3.1-lite' && sent.duration === 6 && sent.aspect_ratio === '16:9' && sent.resolution === '720p' && sent.generate_audio === true && !sent.frame_images, `what OpenRouter was asked: ${JSON.stringify(sent)}`);
  ok(await until(async () => (await req('GET', `/api/videos/make/${j1.job}`)).json().status === 'done'), 'followed until it is done');
  const d1 = (await req('GET', `/api/videos/make/${j1.job}`)).json();
  ok(
    /^naget-video:[a-f0-9]{40}$/.test(d1.src) && /^naget-asset:[a-f0-9]{40}$/.test(d1.poster) && d1.w === 640 && d1.h === 360 && d1.seconds === 3 && d1.cost === 0.4,
    `done: kept, its first frame, size, length and what it cost: ${JSON.stringify(d1)}`,
  );
  const v = getVideo(db, d1.src.slice('naget-video:'.length));
  ok(v && fs.statSync(v.file).size === fs.statSync(clip).size && getAsset(db, d1.poster.slice('naget-asset:'.length))?.mime === 'image/jpeg', 'the video kept as decks keep theirs, its first frame a kept picture');
  const left = [...videoJobs.values()].find((j) => j.job.job === j1.job);
  ok(left?.ended && !fs.readdirSync(os.tmpdir()).some((n) => n.startsWith('hydor-video-') && fs.existsSync(path.join(os.tmpdir(), n, 'video.mp4'))), 'the download’s folder gone');

  // From a kept picture: the frame sent, the shape left to the picture.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
  const pic = `naget-asset:${putAsset(db, png)}`;
  const r2 = await req('POST', '/api/videos/make', { prompt: 'It sails off', first: pic });
  const s2 = calls.filter((c) => c.path === '/videos').pop()!.body;
  ok(
    r2.statusCode === 200 && s2.frame_images?.[0]?.frame_type === 'first_frame' && s2.frame_images[0].image_url.url.startsWith('data:image/png;base64,') && !('aspect_ratio' in s2),
    `started on the picture: ${JSON.stringify({ ...s2, frame_images: s2.frame_images?.length })}`,
  );
  const svgPic = `naget-asset:${putAsset(db, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'))}`;
  ok(
    (await req('POST', '/api/videos/make', { prompt: 'x', first: svgPic })).statusCode === 400 && (await req('POST', '/api/videos/make', { prompt: 'x', first: 'naget-asset:0000000000000000' })).statusCode === 400,
    'not a drawing, nor a picture it does not keep',
  );
  ok(/does not start on a picture/.test((await req('POST', '/api/videos/make', { prompt: 'x', first: pic, model: 'bytedance/seedance-2.0-fast' })).json().error), 'a model that does not start on a picture, said so');
  ok(/changes a video it is given/.test((await req('POST', '/api/videos/make', { prompt: 'x', model: 'runway/aleph-2' })).json().error), 'a model that changes videos, said so');
  ok(
    /has no video model/.test((await req('POST', '/api/videos/make', { prompt: 'x', model: 'nobody/none' })).json().error) && (await req('POST', '/api/videos/make', { prompt: 'x', model: 'a b' })).statusCode === 400,
    'a model OpenRouter does not have; not an id',
  );
  kvSet(db, 'videos', JSON.stringify({ enabled: true, model: 'bytedance/seedance-2.0-fast' }));
  const r3 = (await req('POST', '/api/videos/make', { prompt: 'Waves', duration: 5 })).json();
  ok(r3.model === 'bytedance/seedance-2.0-fast' && r3.seconds === 5 && r3.cost > 0, 'the model picked in Settings');
  kvSet(db, 'videos', JSON.stringify({ enabled: true, model: '' }));

  // A video OpenRouter refuses to finish.
  outcome = 'failed';
  const f1 = (await req('POST', '/api/videos/make', { prompt: 'Something it refuses' })).json();
  ok(await until(async () => (await req('GET', `/api/videos/make/${f1.job}`)).json().status === 'failed'), 'a failure followed');
  ok((await req('GET', `/api/videos/make/${f1.job}`)).json().error === 'The video was not made: Content policy violation', 'its words');
  outcome = 'completed';

  // Four at once at most.
  outcome = 'slow';
  await until(() => [...videoJobs.values()].every((j) => j.ended));
  const slow: { job: string; status: string }[] = [];
  for (let i = 0; i < 4; i++) slow.push((await req('POST', '/api/videos/make', { prompt: `Slow ${i}` })).json());
  const fifth = await req('POST', '/api/videos/make', { prompt: 'One more' });
  ok(slow.every((j) => j.status === 'queued' || j.status === 'running') && fifth.statusCode === 429, `a fifth waits: ${fifth.body}`);
  ok(await until(async () => (await req('GET', `/api/videos/make/${slow[0].job}`)).json().status === 'running'), 'in line, then being made');
  for (const j of slow) jobsThere.get(j.job)!.outcome = 'completed';
  ok(await until(() => [...videoJobs.values()].every((j) => j.ended), 20_000), 'all four done');
  outcome = 'completed';

  // After a restart: the app no longer knows the job, OpenRouter does.
  jobsThere.set('gen-vid-from-before', { polls: 0, outcome: 'completed' });
  const back = await req('GET', '/api/videos/make/gen-vid-from-before');
  ok(back.statusCode === 200 && back.json().model === '' && ['queued', 'running'].includes(back.json().status), `picked up again: ${back.body}`);
  ok(await until(async () => (await req('GET', '/api/videos/make/gen-vid-from-before')).json().status === 'done'), 'and kept when done');
  ok((await req('GET', '/api/videos/make/gen-vid-nobody-knows')).statusCode === 404 && (await req('GET', '/api/videos/make/x')).statusCode === 400, 'one nobody knows; not an id');
}

// ---- one live plot, with the real writer ------------------------------------------------------------------------

if (process.env.LIVE_PLOT === '1' && PY) {
  setPlotWriterForTests(null);
  plotTiming.runMs = 60_000;
  const shots = '/tmp/hydor-mr-a3-shots';
  fs.mkdirSync(shots, { recursive: true });
  const data = `year,co2_ppm,uncertainty\n${Array.from({ length: 30 }, (_, i) => `${1995 + i},${(360 + i * 2.1 + Math.sin(i) * 0.8).toFixed(2)},${(0.3 + (i % 4) * 0.05).toFixed(2)}`).join('\n')}\n`;
  const t0 = Date.now();
  const live = await req('POST', '/api/plots/make', {
    request: 'CO2 at Mauna Loa by year, with error bars from the uncertainty column, and a linear fit with its slope in the legend',
    data,
    theme: { colors: ['#0ea5e9', '#f97316'], fg: '#e5e7eb', bg: '#0b1020' },
    w: 960,
    h: 540,
    interactive: true,
  });
  const lj = live.json();
  console.log(`live plot: ${live.statusCode} in ${Math.round((Date.now() - t0) / 1000)} s, ${lj.mime ?? ''} ${lj.w ?? ''}×${lj.h ?? ''}, by ${lj.model ?? '?'}: ${lj.notes ?? lj.error ?? ''}`);
  ok(live.statusCode === 200 && lj.code && lj.html, 'a live plot, with its interactive version');
  if (live.statusCode === 200) {
    const a = getAsset(db, String(lj.src).slice('naget-asset:'.length))!;
    fs.writeFileSync(path.join(shots, `live-plot.${a.mime === 'image/svg+xml' ? 'svg' : 'png'}`), a.data);
    fs.writeFileSync(path.join(shots, 'live-plot.py'), lj.code);
    if (lj.html) fs.writeFileSync(path.join(shots, 'live-plot.html'), lj.html);
  }
}

globalThis.fetch = realFetch;
await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
