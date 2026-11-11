// Script tests for the page editor (a page's Edit mode, editor.ts with writing.ts): writing as in Notion in a real
// browser (Enter makes the next block, Backspace joins, Tab nests, Markdown as you type, "/" for blocks, Turn into,
// colours, to-dos that tick, toggles, a table of contents, an icon and a cover, pictures dropped or pasted in, blocks
// dragged into a column, several blocks picked or picked with a drag, undo by the block, nested items that keep their
// place, code coloured as it is written with a language to pick, Save from the first letter), that nothing of the
// editor's own reaches the page it gives back, the kit's styles for the blocks, the code's colours, a page in Use (links,
// a table of contents left empty, coloured code), and that a page made of them survives its exports (a web page, a PDF and
// a Word document when a browser is here). The browser parts run when this computer has a Chromium (Settings → Browser,
// or Playwright's); ONLY=word runs those whose page has that word. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/page-editor-test.ts
//   DATA_DIR=/tmp/hydor-test-page-editor node dist/dev/page-editor-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { canCapture, closeCapture, withTab, type Tab } from '../capture/index.ts';
import { KIT_CSS } from '../../shared/page-kit.ts';
import { CODE_COLOURS_SRC, codeColours, hasCode } from '../../shared/code-colours.ts';
import { dbBlocks, dbsForAgent, PAGE_DB_SRC, pageDatabases, pageDbScript } from '../../shared/page-db.ts';
import { extractText } from '../documents/extract.ts';
import { EDITOR_SRC } from './editor.ts';
import { geometry } from './editor-geometry.ts';
import { pages } from './index.ts';
import { BRIDGE_SRC, injectHead, kitHead } from './kit.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
/** The same as ok, saying what there was instead. */
const same = (got: unknown, want: unknown, what: string) => ok(got === want, got === want ? what : `${what}\n     got:  ${String(got)}\n     want: ${String(want)}`);

// ---- the kit's styles for the blocks, and the script ------------------------------------------------------------
for (const cls of ['.n-todo', '.n-toggle', '.n-callout', '.n-cols', '.n-toc', '.n-cover', '.n-icon', '.n-video', '.n-math', '.n-tbl', 'pre.n-code', 'img.n-pic', '.n-tc-red', '.n-hl-yellow'])
  ok(KIT_CSS.includes(`${cls}{`) || KIT_CSS.includes(`${cls},`) || KIT_CSS.includes(`${cls} `), `the kit styles ${cls}`);
ok(/\.n-callout\{[^}]*currentColor/.test(KIT_CSS) && /:where\(\.n-page\) \.n-callout\{background:var\(--n-soft\)\}/.test(KIT_CSS), 'a callout takes the kit’s colour in a kit page, and its text’s own elsewhere');
ok(!/<\/script/i.test(EDITOR_SRC) && !/<!--/.test(EDITOR_SRC), 'the editor’s script can go in a <script> as it is');
let compiles = true;
try {
  new Function(`return ${EDITOR_SRC}`);
} catch {
  compiles = false;
}
ok(compiles, 'the editor’s script (with the writing) is one function the page can run');

// ---- code blocks' colours (shared/code-colours.ts) -----------------------------------------------------------------------
{
  const C = codeColours();
  const kinds = (code: string, lang: string) =>
    C.tokens(code, lang)
      .filter(([c]) => c)
      .map(([c, t]) => `${c}:${t}`)
      .join(' ');
  same(kinds('def add(a, b):\n    return a + 1  # sum', 'python'), 'k:def f:add k:return n:1 c:# sum', 'Python’s keywords, names, numbers and comments are told apart');
  same(kinds('<a href="x">Hi &amp; bye</a>', 'html'), 'g:a a:href s:"x" v:&amp; g:a', 'HTML’s tags, attributes and their values');
  same(kinds('.card:hover { color: #fff; }', 'css'), 't:.card k::hover a:color n:#fff', 'CSS’s selectors, properties and values');
  same(kinds('{"a": [1, true]}', 'json'), 'a:"a" n:1 v:true', 'JSON’s keys and values');
  same(kinds("SELECT name FROM users WHERE id = 3 -- one", 'sql'), 'k:SELECT k:FROM k:WHERE n:3 c:-- one', 'SQL’s words in any case');
  same([C.detect('import os\ndef f():\n    print(None)'), C.detect('const x = () => 1;\nconsole.log(x)'), C.detect('{"a": 1}'), C.detect('SELECT * FROM t WHERE a = 1'), C.detect('hello there')].join(','), 'python,js,json,sql,', 'a block’s language is told from its code (none, from plain words)');
  same([C.langId('py'), C.langId('TypeScript'), C.langId('sh'), C.langId('klingon')].join(','), 'python,ts,bash,', 'a language is known by its usual names');
  ok(!/<\/script/i.test(CODE_COLOURS_SRC) && !/<!--/.test(CODE_COLOURS_SRC), 'the colours’ script can go in a <script> as it is');
  ok(KIT_CSS.includes('pre.n-code .n-ck,'), 'the kit colours the code’s words');
  // Plain blocks agents write (<pre><code>): coloured only when the code surely is a language (it may be a command's output).
  same([C.detect('const xs = [1].map((x) => x);\nconsole.log(xs)', true), C.detect('x => y', true), C.detect('total 12\ndrwxr-xr-x 2 alex', true), C.detect('x => y')].join(','), 'js,,,js', 'a plain block’s language is told only when the code shows it plainly');
  same([hasCode('<pre class="n-code">x</pre>'), hasCode('<pre>\n <code class="language-py">x</code></pre>'), hasCode('<p><code>x</code></p>')].join(','), 'true,true,false', 'a page with plain code blocks gets the colours’ script, one with inline code alone does not');
  ok(KIT_CSS.includes(',pre>code>.n-ck{'), 'the kit colours a plain block’s words, inside its <code>');
}

// ---- databases (shared/page-db.ts): what one is, checked; an agent's changes ----------------------------------------------
{
  const D = pageDatabases();
  const s = D.normalize({ cols: [{ name: 'Task' }, { name: 'Status', kind: 'select', options: ['To do', { name: 'Done', color: 'green' }] }, { name: 'Tags', kind: 'multi-select' }, { name: 'Due', kind: 'date' }, { name: 'Cost', kind: 'number' }, { name: 'Paid', kind: 'checkbox' }, { name: 'Web', kind: 'url' }], rows: [{ Task: 'Book', Status: 'Done', Tags: 'a, b', Due: '2026-11-10T09:00', Cost: '12,5', Paid: 'yes', Web: 'https://x.test' }, { Task: '<b>x</b>', Status: 'Doing' }] });
  same(s.cols.map((c) => c.kind).join(','), 'text,select,multi,date,number,check,link', 'a database’s columns take their kinds (by their usual names too)');
  same(s.rows.map((r) => s.cols.map((c) => D.text(c, r.cells[c.id])).join('|')).join(' / '), 'Book|Done|a, b|2026-11-10|12.5|✓|https://x.test / <b>x</b>|Doing|||||', 'its rows’ values as their columns keep them (a new option for a new name; words stay words)');
  same(s.cols[1].options?.find((o) => o.name === 'Done')?.color, 'green', 'an option keeps the colour it was given');
  const s2 = D.change(s, { add: [{ Task: 'Visa', Status: 'To do' }], update: [{ id: s.rows[1].id, Status: 'Done', Cost: 3 }], remove: [s.rows[0].id] });
  same(s2.rows.map((r) => `${D.text(s2.cols[0], r.cells[s2.cols[0].id])}:${D.text(s2.cols[1], r.cells[s2.cols[1].id])}`).join(','), '<b>x</b>:Done,Visa:To do', 'an agent adds, changes and removes rows by their columns’ names');
  const s3 = D.change(s2, { cols: s2.cols.map((c) => (c.name === 'Status' ? { ...c, kind: 'text' } : c)) });
  const s4 = D.change(s3, { cols: s3.cols.map((c) => (c.name === 'Status' ? { ...c, kind: 'select' } : c)) });
  same(s4.rows.map((r) => D.text(s4.cols[1], r.cells[s4.cols[1].id])).join(','), 'Done,To do', 'a column of another kind keeps its values where they fit (a select’s options back from its words)');
  same(JSON.stringify(D.normalize({ ...s4, rows: [{ id: 'r1', cells: { [s4.cols[1].id]: 'onotanoption' } }] }).rows[0].cells), '{}', 'a kept value that names no option is no value (nothing makes options of it)');
  same(JSON.stringify(dbBlocks('<div class="n-db" data-db="tasks" data-title="A &amp; B" data-schema=\'{"cols":["X"]}\'></div><div class="n-db" data-db="bad name"></div>')), '[{"name":"tasks","title":"A & B","schema":{"cols":["X"]}}]', 'the server reads a page’s databases from its HTML');
  ok(!/<\/script/i.test(PAGE_DB_SRC) && !/<!--/.test(PAGE_DB_SRC), 'the databases’ script can go in a <script> as it is');
}

// ---- databases' newer parts: formulas, calculations, CSV in and out, views kept, Markdown as blocks ---------------------------
{
  const D = pageDatabases();
  const s = D.normalize({
    cols: [{ name: 'Task' }, { name: 'Cost', kind: 'number' }, { name: 'Qty', kind: 'number' }, { name: 'Total', kind: 'formula', formula: 'prop("Cost") * prop("Qty")' }, { name: 'Due', kind: 'date' }, { name: 'Done', kind: 'check' }, { name: 'Mail', kind: 'email' }, { name: 'Notes', kind: 'ai', ai: { how: 'extract', prompt: 'the city' } }],
    rows: [{ Task: 'Book', Cost: 3, Qty: 2, Due: '2026-11-10', Mail: 'a@b.test', page: '## Notes\n- one' }, { Task: 'Pack', Cost: 1, Qty: 5, Due: '2026-11-12', Done: true }],
    view: 'calendar',
    dateCol: 'Due',
    calc: { Cost: 'sum', Done: 'pctChecked', Bogus: 'sum' },
  });
  same(s.cols.map((c) => c.kind).join(','), 'text,number,number,formula,date,check,email,ai', 'the newer kinds of column are kept (a formula, an email, an AI column)');
  same(`${s.view}|${s.cols.find((c) => c.id === s.dateCol)?.name}|${JSON.stringify(Object.keys(s.calc ?? {}).map((k) => s.cols.find((c) => c.id === k)?.name))}`, 'calendar|Due|["Cost","Done"]', 'a view and its settings are kept, by column names too (calculations only for columns there are)');
  same(s.rows.map((r) => D.cellText(s, r, s.cols[3])).join(','), '6,5', 'a formula is worked out for each row');
  const f = (e: string) => D.formula(s, s.rows[0], e);
  same(
    [f('if(prop("Done"), "yes", "no")').text, f('concat(upper(prop("Task")), "!")').text, f('dateBetween(prop("Due"), date(2026, 11, 1), "days")').text, f('round(prop("Cost") / 7, 2)').text, f('{Cost} + 1 > 3 and not prop("Done")').text, f('formatDate(prop("Due"), "YYYY/MM/DD")').text].join(' | '),
    'no | BOOK! | 9 | 0.43 | ✓ | 2026/11/10',
    'formulas have conditions, words, dates, rounding, {columns} and comparisons',
  );
  ok(/no column “Price”/.test(f('prop("Price") * 2').error ?? '') && !!f('1 +').error && !!f('nosuch(1)').error, 'a formula that can’t be worked out says why');
  same(D.calculate(s, s.rows, s.cols[1], 'sum') + '|' + D.calculate(s, s.rows, s.cols[1], 'avg') + '|' + D.calculate(s, s.rows, s.cols[5], 'pctChecked') + '|' + D.calculate(s, s.rows, s.cols[3], 'max') + '|' + D.calculate(s, s.rows, s.cols[0], 'values'), '4|2|50%|6|2', 'a column’s calculation: a sum, an average, a share ticked, a formula’s largest, a count');
  ok(/^Task,Cost,Qty,Total,Due,Done,Mail,Notes\r\nBook,3,2,6,2026-11-10,No,a@b\.test,\r\n/.test(D.csv(s)), 'the rows go out as a CSV file, formulas worked out');
  const blank = D.normalize({ cols: [{ name: 'Name' }, { name: 'Status', kind: 'select' }], rows: [{}, {}, {}] });
  const r = D.fromCsv(blank, '﻿Name;Price;Paid;Joined\n"Smith, Ann";3,5;yes;2026-01-02\nBo;4;no;2026-02-03\n');
  same(`${r.added}|${r.state.cols.map((c) => `${c.name}:${c.kind}`).join(',')}|${r.state.rows.map((x) => r.state.cols.map((c) => D.cellText(r.state, x, c)).join('/')).join(' ')}`, '2|Name:text,Price:number,Paid:check,Joined:date|Smith, Ann/3.5/✓/2026-01-02 Bo/4//2026-02-03', 'a CSV file’s rows come in (semicolons, quotes, a decimal comma), its columns of the kinds their values are, in place of a new database’s empty rows');
  const html = D.md('# Plan\n\nSome **bold** and *soft* words, `code` and [a link](https://example.com) and [no](javascript:alert(1)) <b>tags</b>.\n\n- one\n  - under it\n- [x] done\n1. first\n\n> 💡 A tip\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```python\nprint(1 < 2)\n```\n---');
  same(
    html,
    '<h1>Plan</h1><p>Some <strong>bold</strong> and <em>soft</em> words, <code>code</code> and <a href="https://example.com">a link</a> and no &lt;b&gt;tags&lt;/b&gt;.</p><ul><li>one<ul><li>under it</li></ul></li></ul><ul class="n-todo"><li><input type="checkbox" checked><span>done</span></li></ul><ol><li>first</li></ol><div class="n-callout"><span class="n-callout-icon">💡</span><div class="n-callout-text">A tip</div></div><div class="n-scroll"><table class="n-tbl"><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div><pre class="n-code" data-lang="python">print(1 &lt; 2)</pre><hr>',
    'Markdown becomes the editor’s blocks (lists nested, to-dos, a callout, a table, code), its words never markup, its links only to the web',
  );
  const s2 = D.change(s, { view: 'timeline', start: 'Due', update: [{ id: s.rows[1].id, page: 'Packed **all**' }], add: [{ Task: 'Visa', Cost: 2 }] });
  same(`${s2.view}|${s2.rows[1].page}|${typeof s2.rows[2].created}|${D.cellText(s2, s2.rows[2], s2.cols[3])}`, 'timeline|Packed **all**|number|', 'an agent changes the view, a row’s own page, and adds rows (when they were made kept)');
  const told = dbsForAgent(`<div class="n-db" data-db="t" data-schema='${JSON.stringify({ cols: s.cols, rows: s.rows, view: 'calendar', dateCol: s.dateCol })}'></div>`, {});
  ok(/Total \(formula: prop\("Cost"\) \* prop\("Qty"\)\)/.test(told) && /Total="6"/.test(told) && /its page: "## Notes\\n- one"/.test(told) && /calendar view · by Due/.test(told), 'agents read formulas with their values, rows’ own pages and the view');
}

// ---- the editor in a browser --------------------------------------------------------------------------------------
const LABELS = { phText: 'Type ‘/’ for commands' };
const pageOf = (body: string, cls = 'n-page') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Test page</title><style id="n-kit" data-n-own>${KIT_CSS}</style>` +
  `<script data-n-own>window.__msgs=[];addEventListener('message',function(e){var d=e.data;if(d&&typeof d.type==='string'&&d.type.indexOf('wa-ed')===0)window.__msgs.push(d)});</script>` +
  // (the app's side of the page's data, for the databases: kept here)
  `<script data-n-own>window.__store={};addEventListener('message',function(e){var d=e.data;if(!d||d.type!=='wa-ed-store')return;var v=null;if(d.op==='get')v=window.__store[d.key]===undefined?null:JSON.parse(window.__store[d.key]);else window.__store[d.key]=JSON.stringify(d.value);window.postMessage({type:'wa-ed',n:'test',cmd:'store',arg:{id:d.id,value:v}},'*')});</script>` +
  `<script data-n-own>(${EDITOR_SRC})(${JSON.stringify({ n: 'test', theme: 'light', doctype: '<!doctype html>', labels: LABELS })})</script>` +
  `<style>body{max-width:640px;margin:0 auto;padding:40px 60px;font:16px/1.5 sans-serif}</style></head><body class="${cls}">${body}</body></html>`;

/** What a test does with the page: clicks, keys, typing, the editor's commands, and the page as it is or as given back. */
interface Drive {
  tab: Tab;
  js<T = unknown>(code: string): Promise<T>;
  click(selector: string, o?: { dx?: number; dy?: number; shift?: boolean; at?: 'start' | 'end' | 'center' }): Promise<void>;
  clickAt(x: number, y: number, shift?: boolean): Promise<void>;
  write(selector: string, at?: 'start' | 'end'): Promise<void>;
  press(key: string, mods?: { ctrl?: boolean; shift?: boolean; alt?: boolean }): Promise<void>;
  type(text: string): Promise<void>;
  cmd(cmd: string, arg?: unknown): Promise<void>;
  html(): Promise<string>;
  body(): Promise<string>;
  msgs(type: string): Promise<any[]>;
}

const KEYS: Record<string, [number, string, string?]> = {
  Enter: [13, 'Enter', '\r'],
  Backspace: [8, 'Backspace'],
  Delete: [46, 'Delete'],
  Tab: [9, 'Tab'],
  Escape: [27, 'Escape'],
  ArrowUp: [38, 'ArrowUp'],
  ArrowDown: [40, 'ArrowDown'],
  ArrowLeft: [37, 'ArrowLeft'],
  ArrowRight: [39, 'ArrowRight'],
  Home: [36, 'Home'],
  End: [35, 'End'],
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ONLY=word runs the browser tests whose page has that word (to look at one). */
const only = process.env.ONLY ?? '';
async function drive(body: string, job: (d: Drive) => Promise<void>, cls = 'n-page') {
  if (only && !body.includes(only)) return;
  await withTab({ html: pageOf(body, cls), width: 900, height: 900, settleMs: 200 }, async (tab) => {
    const s = tab.s;
    const js = <T>(code: string) => tab.evaluate<T>(`(() => { ${code} })()`);
    for (let i = 0; i < 40 && !(await js<boolean>('return window.__msgs.some(function(m){return m.type==="wa-ed-ready"})')); i++) await sleep(50);
    const mouse = async (x: number, y: number, shift = false) => {
      const modifiers = shift ? 8 : 0;
      await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
      await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, modifiers });
      await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, modifiers });
      await sleep(40);
    };
    const rectOf = async (sel: string, at: 'start' | 'end' | 'center' = 'center') => {
      const r = await js<{ x: number; y: number } | null>(
        `const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({block:'center'}); const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter(q => q.width > 0); const b = el.getBoundingClientRect(); const a = ${JSON.stringify(at)}; if (a === 'start' && rs.length) return { x: rs[0].left + 1, y: rs[0].top + rs[0].height / 2 }; if (a === 'end' && rs.length) { const q = rs[rs.length - 1]; return { x: q.right - 1, y: q.top + q.height / 2 }; } return { x: b.left + b.width / 2, y: b.top + b.height / 2 };`,
      );
      if (!r) throw new Error(`No ${sel} on the page`);
      return r;
    };
    const d: Drive = {
      tab,
      js,
      async click(sel, o = {}) {
        const r = await rectOf(sel, o.at);
        await mouse(r.x + (o.dx ?? 0), r.y + (o.dy ?? 0), o.shift);
      },
      async clickAt(x, y, shift) {
        await mouse(x, y, shift);
      },
      async write(sel, at = 'end') {
        // A click picks the part, another one writes in it, the caret where it was (with nothing picked before, whose bar would be in the way).
        await d.cmd('deselect');
        const r = await rectOf(sel, at);
        await mouse(r.x, r.y);
        await mouse(r.x, r.y);
        if (at === 'end') await d.press('End');
      },
      async press(key, m = {}) {
        const [code, k, text] = KEYS[key] ?? [key.toUpperCase().charCodeAt(0), key];
        const modifiers = (m.alt ? 1 : 0) | (m.ctrl ? 2 : 0) | (m.shift ? 8 : 0);
        const digit = /^[0-9]$/.test(key);
        const codeName = digit ? `Digit${key}` : /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key === '/' ? 'Slash' : k;
        await s.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: codeName, windowsVirtualKeyCode: code, modifiers });
        if (text && !modifiers) await s.send('Input.dispatchKeyEvent', { type: 'char', key: k, text, unmodifiedText: text, windowsVirtualKeyCode: code });
        await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: codeName, windowsVirtualKeyCode: code, modifiers });
        await sleep(30);
      },
      async type(text) {
        for (const ch of text) {
          await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
          await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
        }
        await sleep(30);
      },
      async cmd(cmd, arg) {
        await js(`window.postMessage({ type: 'wa-ed', n: 'test', cmd: ${JSON.stringify(cmd)}, arg: ${JSON.stringify(arg ?? null)} }, '*');`);
        await sleep(60);
      },
      async html() {
        const id = Math.floor(Math.random() * 1e9);
        await js(`window.postMessage({ type: 'wa-ed', n: 'test', cmd: 'html', id: ${id} }, '*');`);
        for (let i = 0; i < 40; i++) {
          const h = await js<string | null>(`const m = window.__msgs.find(function(m){return m.type==='wa-ed-html'&&m.id===${id}}); return m ? m.html : null;`);
          if (h !== null) return h;
          await sleep(25);
        }
        throw new Error('The editor gave no HTML back');
      },
      body: () => js<string>(`const b = document.body.cloneNode(true); for (const x of b.querySelectorAll('[data-n-own]')) x.remove(); return b.innerHTML;`),
      msgs: (type) => js<any[]>(`return window.__msgs.filter(function(m){return m.type===${JSON.stringify(type)}});`),
    };
    await job(d);
  });
}

/** The body's blocks in short: "p:Hello|h1:Title|ul>li:One". */
const shape = (d: Drive, sel = 'body') =>
  d.js<string>(
    `const out = []; const walk = (el, pre) => { for (const c of el.children) { if (c.closest('[data-n-own]') || c.tagName === 'SCRIPT' || c.tagName === 'STYLE' || c.tagName === 'N-EDITOR-UI') continue; const t = c.tagName.toLowerCase(); if (t === 'ul' || t === 'ol') { walk(c, pre + t + (c.classList.contains('n-todo') ? '.todo' : '') + '>'); continue; } if (t === 'li') { const own = [...c.childNodes].filter(n => !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))).map(n => n.textContent).join('').replace(/\\u200b/g, '').trim(); const box = c.querySelector(':scope > input[type=checkbox]'); out.push(pre + 'li' + (box ? (box.hasAttribute('checked') ? '[x]' : '[ ]') : '') + ':' + own); for (const s of c.children) if (/^(UL|OL)$/.test(s.tagName)) walk(s, pre + 'li>' + s.tagName.toLowerCase() + '>'); continue; } out.push(t + (c.className && typeof c.className === 'string' ? '.' + c.className.split(' ').filter(x => !/^n-s/.test(x)).join('.') : '') + ':' + (c.textContent || '').replace(/\\u200b/g, '').trim()); } }; walk(document.querySelector(${JSON.stringify(sel)}), ''); return out.join('|');`,
  );

if (canCapture()) {
  // ---- Enter, Shift+Enter, Backspace, Delete ------------------------------------------------------------------------
  await drive('<h1 id="t">Trip plan</h1><p id="a">Pack the bags</p>', async (d) => {
    await d.write('#a');
    await d.type(' tonight');
    await d.press('Enter');
    await d.type('Book the train');
    same(await shape(d), 'h1:Trip plan|p:Pack the bags tonight|p:Book the train', 'Enter at a paragraph’s end makes the next paragraph, and the caret goes there');
    await d.press('Home');
    await d.press('Enter');
    same(await shape(d), 'h1:Trip plan|p:Pack the bags tonight|p:|p:Book the train', 'Enter at a block’s start puts an empty block before it');
    await d.press('Backspace');
    await d.press('Backspace');
    same(await shape(d), 'h1:Trip plan|p:Pack the bags tonightBook the train', 'Backspace at a block’s start removes an empty block, then joins the block to the one before');
    await d.press('Enter');
    same(await shape(d), 'h1:Trip plan|p:Pack the bags tonight|p:Book the train', 'Enter in the middle splits the block');
    await d.press('ArrowUp');
    await d.press('End');
    await d.press('Delete');
    same(await shape(d), 'h1:Trip plan|p:Pack the bags tonightBook the train', 'Delete at a block’s end joins the next one to it');
    await d.press('Enter', { shift: true });
    ok((await d.js<string>('return document.querySelector("p").innerHTML')).includes('<br>'), 'Shift+Enter is a line break in the block');
    await d.write('#t');
    await d.press('Enter');
    await d.type('Under the title');
    same((await shape(d)).split('|').slice(0, 2).join('|'), 'h1:Trip plan|p:Under the title', 'Enter at a heading’s end makes a paragraph after it');
    const out = await d.html();
    same(/contenteditable|data-n-|n-editor-ui|\u200b/.exec(out)?.[0] ?? '', '', 'what the editor gives back has nothing of its own in it');
    ok(out.startsWith('<!doctype html>') && out.includes('<h1 id="t">Trip plan</h1>'), 'and is the whole page, with its doctype');
  });

  // ---- lists: Enter, an empty item, Tab and Shift+Tab, Backspace ---------------------------------------------------------
  await drive('<ul id="l"><li id="one">Milk</li><li>Bread</li></ul><p>After</p>', async (d) => {
    await d.write('#one');
    await d.press('Enter');
    await d.type('Eggs');
    same(await shape(d), 'ul>li:Milk|ul>li:Eggs|ul>li:Bread|p:After', 'Enter in a list makes a new item');
    await d.press('Tab');
    same(await shape(d), 'ul>li:Milk|ul>li>ul>li:Eggs|ul>li:Bread|p:After', 'Tab nests the item under the one before');
    await d.type('!');
    ok((await d.js<string>('return document.querySelector("ul ul li").textContent')) === 'Eggs!', 'the caret stays in the nested item');
    await d.press('Tab', { shift: true });
    same(await shape(d), 'ul>li:Milk|ul>li:Eggs!|ul>li:Bread|p:After', 'Shift+Tab takes it back out');
    await d.press('Enter');
    await d.press('Enter');
    same(await shape(d), 'ul>li:Milk|ul>li:Eggs!|p:|ul>li:Bread|p:After', 'Enter in an empty item leaves the list, which splits there');
    await d.type('A note');
    same(await shape(d), 'ul>li:Milk|ul>li:Eggs!|p:A note|ul>li:Bread|p:After', 'and the words go in the new paragraph');
    await d.write('#one', 'start');
    await d.press('Home');
    await d.press('Backspace');
    ok((await shape(d)).startsWith('p:Milk|ul>li:Eggs!'), 'Backspace at an item’s start makes it text again');
  });

  // ---- Markdown as you type ------------------------------------------------------------------------------------------
  await drive('<p id="a">Start</p>', async (d) => {
    await d.write('#a');
    const fresh = async () => {
      await d.press('Enter');
    };
    await fresh();
    await d.type('# Big');
    await fresh();
    await d.type('## Middle');
    await fresh();
    await d.type('### Small');
    await fresh();
    await d.type('- point');
    await d.press('Enter');
    await d.press('Enter');
    await d.type('1. first');
    await d.press('Enter');
    await d.press('Enter');
    await d.type('[] call');
    await d.press('Enter');
    await d.press('Enter');
    await d.type('> said');
    await fresh();
    await d.type('---');
    await d.type('**bold** and *it* and `c` and ~~gone~~ end');
    const sh = await shape(d);
    ok(sh.startsWith('p:Start|h1:Big|h2:Middle|h3:Small|ul>li:point|ol>li:first|ul.todo>li[ ]:call|blockquote:said|hr:|p:'), `"# ", "## ", "### ", "- ", "1. ", "[] ", "> " and "---" make their blocks (${sh})`);
    const last = await d.js<string>('return document.querySelector("hr").nextElementSibling.innerHTML');
    ok(/<strong>bold<\/strong>/.test(last) && /<em>it<\/em>/.test(last) && /<code>c<\/code>/.test(last) && /<s>gone<\/s>/.test(last), `**bold**, *italic*, \`code\` and ~~struck~~ change as their closing mark is typed (${last})`);
    ok(/<\/s>\u200b? end$/.test(last.replace(/&nbsp;/g, ' ')), 'and the words after them are plain');
    await d.press('Enter');
    await d.type('```');
    ok((await d.js<string>('const p = document.querySelector("pre"); return p ? p.className : "none"')) === 'n-code', '"```" makes a code block');
    await d.type('let x = 1;');
    await d.press('Enter');
    await d.type('x++');
    same(JSON.stringify((await d.js<string>('return document.querySelector("pre").innerText')).replace(/\n$/, '')), JSON.stringify('let x = 1;\nx++'), 'Enter in code is a new line in it');
    const out = await d.html();
    ok(out.includes('<pre class="n-code">let x = 1;\nx++</pre>'), 'kept as a new-line character');
    same(/.{0,40}(\u200b|data-n-ph).{0,40}/.exec(out)?.[0] ?? '', '', 'the marks’ helpers are gone from what is given back');
  });

  // ---- "/" for blocks ------------------------------------------------------------------------------------------------------
  await drive('<p id="a">Intro</p>', async (d) => {
    await d.write('#a');
    await d.press('Enter');
    await d.type('/');
    const open = await d.js<boolean>('return !!window.__nOpenSlash');
    void open;
    await d.type('head');
    await d.press('ArrowDown');
    await d.press('Enter');
    same(await shape(d), 'p:Intro|h2:', 'typing "/head", ↓ and Enter makes the second heading kind, and the typed "/…" goes away');
    await d.type('Steps');
    await d.press('Enter');
    await d.type('/todo');
    await d.press('Enter');
    await d.type('Buy a map');
    same(await shape(d), 'p:Intro|h2:Steps|ul.todo>li[ ]:Buy a map', '"/todo" makes a to-do');
    await d.press('Enter');
    await d.press('Enter');
    await d.type('/table of');
    await d.press('Enter');
    ok(
      (await d.js<number>('return document.querySelectorAll("nav.n-toc a").length')) === 1 && (await d.js<string>('return document.querySelector("nav.n-toc a").getAttribute("href")')) === '#steps',
      'a table of contents links to the headings, which get ids',
    );
    await d.type('More');
    await d.press('Enter');
    await d.type('/callout');
    await d.press('Enter');
    await d.type('Mind the gap');
    ok((await d.js<string>('const c = document.querySelector(".n-callout"); return c ? c.textContent : ""')) === '💡Mind the gap', 'a callout has an icon and its words');
    await d.press('Enter');
    await d.type('/divider');
    await d.press('Enter');
    ok((await d.js<number>('return document.querySelectorAll("hr").length')) === 1, 'a divider goes in, with a paragraph after it to go on writing');
    await d.type('Steps follow /numbered');
    await d.press('Enter');
    await d.type('Pack');
    same(
      await d.js<string>('const li = document.activeElement.closest("li"); return li ? li.parentElement.tagName + ":" + li.textContent : document.activeElement.tagName'),
      'OL:Pack',
      'a numbered list asked for after some words is a numbered list, under them',
    );
    await d.press('Enter');
    await d.press('Enter');
    await d.type('Mid text /qq');
    ok((await d.js<string>('return document.activeElement.textContent')) === 'Mid text /qq', 'a "/" after a word and an unknown name leave the words as typed');
    await d.press('Escape');
    await d.write('h2');
    await d.type(' and a new heading');
    await d.press('Enter');
    await d.type('/h1');
    await d.press('Enter');
    await d.type('Top');
    await sleep(400);
    same(await d.js<string>('return document.querySelector("nav.n-toc").textContent'), 'Steps and a new headingTop', 'the table of contents keeps up with the headings, as they are written');
  });

  // ---- Turn into, colours, keys --------------------------------------------------------------------------------------------
  await drive('<p id="a">One</p><p id="b">Two</p><p id="c">Three</p>', async (d) => {
    await d.write('#b');
    await d.press('8', { ctrl: true, shift: true });
    same(await shape(d), 'p:One|ul>li:Two|p:Three', 'Ctrl+Shift+8 turns the block into a bulleted list, keeping its words');
    await d.press('9', { ctrl: true, shift: true });
    same(await shape(d), 'p:One|ul.todo>li[ ]:Two|p:Three', 'Ctrl+Shift+9 into a to-do');
    await d.press('7', { ctrl: true, shift: true });
    same(await shape(d), 'p:One|ol>li:Two|p:Three', 'Ctrl+Shift+7 into a numbered list');
    await d.press('2', { ctrl: true, alt: true });
    same(await shape(d), 'p:One|h2:Two|p:Three', 'Ctrl+Alt+2 into a second heading');
    await d.type('!');
    ok((await d.js<string>('return document.querySelector("h2").textContent')) === 'Two!', 'and writing goes on in it');
    await d.press('0', { ctrl: true, alt: true });
    same(await shape(d), 'p:One|p:Two!|p:Three', 'Ctrl+Alt+0 back to text');
    for (const k of ['quote', 'callout', 'toggle', 'code', 'todo', 'p'] as const) {
      await d.cmd('turn', k);
      await sleep(30);
    }
    same(await shape(d), 'p:One|p:Two!|p:Three', 'Turn into goes through every kind and back, keeping the words');
    await d.cmd('colour', { type: 'tc', name: 'red' });
    await d.cmd('colour', { type: 'hl', name: 'yellow' });
    ok((await d.js<string>('return document.querySelectorAll("p")[1].className')) === 'n-tc-red n-hl-yellow', 'a block takes a text colour and a background');
    await d.cmd('colour', { type: 'tc', name: null });
    ok((await d.js<string>('return document.querySelectorAll("p")[1].className')) === 'n-hl-yellow', 'Default takes the colour off');
    await d.press('Escape');
    await d.press('d', { ctrl: true });
    same(await shape(d), 'p:One|p.n-hl-yellow:Two!|p.n-hl-yellow:Two!|p:Three', 'Ctrl+D duplicates the block picked');
    await d.press('ArrowUp', { ctrl: true, shift: true });
    await d.press('ArrowUp', { ctrl: true, shift: true });
    ok((await shape(d)).startsWith('p.n-hl-yellow:Two!|p:One'), 'Ctrl+Shift+↑ moves it up');
  });

  // ---- Turn into, with what is inside --------------------------------------------------------------------------------------------
  await drive('<details class="n-toggle" open><summary id="s">Tips</summary><p>Inside one</p><p>Inside two</p></details><ul><li id="p">Parent<ul><li>Child</li></ul></li><li>Next</li></ul><blockquote id="q">Quoted</blockquote>', async (d) => {
    await d.write('#s');
    await d.cmd('turn', 'p');
    same(await shape(d), 'p:Tips|p:Inside one|p:Inside two|ul>li:Parent|ul>li>ul>li:Child|ul>li:Next|blockquote:Quoted', 'a toggle turned into text keeps what it folded, after it');
    // (its own words' start: its end is its nested items')
    await d.write('#p', 'start');
    await d.cmd('turn', 'h2');
    same(await shape(d), 'p:Tips|p:Inside one|p:Inside two|h2:Parent|ul>li:Child|ul>li:Next|blockquote:Quoted', 'an item with items in it turned into a heading leaves them a list after it');
    await d.write('#q');
    await d.cmd('turn', 'todo');
    same((await shape(d)).split('|').slice(-1)[0], 'ul.todo>li[ ]:Quoted', 'a quote turned into a to-do');
    await d.press('Escape');
    const out = await d.html();
    same(/<li id="q"><input type="checkbox"><span>Quoted<\/span><\/li>/.test(out), true, 'as the kit’s to-do, keeping its name (id)');
  });

  // ---- what a review found: nested items kept, several items dragged, boxes that show their tick, redo after undoing words -------
  await drive(
    '<ul><li>A<ul><li id="b">B</li><li>C</li></ul></li></ul><p id="pa">Under <a id="anchor"></a>here</p><ul class="n-todo"><li id="t1"><input type="checkbox"><span>One</span></li><li><input type="checkbox"><span>Two</span></li><li><input type="checkbox"><span>Three</span></li></ul><p id="end">End</p><details class="n-toggle" open><summary>Title</summary><p id="first">First inside</p></details>',
    async (d) => {
      await d.write('#b', 'start');
      await d.cmd('turn', 'p');
      same((await shape(d)).split('|').slice(0, 3).join('|'), 'ul>li:A|ul>li>ul>li:B|ul>li>ul>li:C', 'a nested item turned into text keeps its place, and the items after it theirs');
      await d.write('#pa');
      await d.press('Enter');
      same(await d.js<boolean>('return !!document.getElementById("anchor")'), true, 'Enter leaves an empty anchor of the page’s where it was');
      await d.press('Escape');
      await d.cmd('deselect');
      await d.click('#t1 input');
      same(await d.js<string>('const b = document.querySelector("#t1 input"); return b.checked + "/" + b.hasAttribute("checked")'), 'true/true', 'a to-do’s box shows its tick, and the page keeps it');
      await d.click('#t1 input');
      same(await d.js<string>('const b = document.querySelector("#t1 input"); return b.checked + "/" + b.hasAttribute("checked")'), 'false/false', 'and its untick');
      // Three to-dos picked and dragged below the last paragraph: all three go.
      await d.cmd('deselect');
      await d.click('#t1 span');
      await d.press('Escape');
      const items = await d.js<{ x: number; y: number }[]>('return [...document.querySelectorAll(".n-todo > li")].map(li => { const r = li.getBoundingClientRect(); return { x: r.left, y: r.top }; });');
      await d.clickAt(items[2].x + 40, items[2].y + 8, true);
      same((await d.msgs('wa-ed-sel')).at(-1)?.sel?.multi, 3, 'Shift+click picks the items between');
      const s = d.tab.s;
      await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: items[0].x + 40, y: items[0].y + 8 });
      await sleep(60);
      const gx = items[0].x - 30;
      const gy = items[0].y + 33;
      const end = await d.js<{ x: number; y: number }>('const b = document.querySelector("#end").getBoundingClientRect(); return { x: b.left + 30, y: b.bottom - 3 };');
      await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gx, y: gy });
      await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: gx, y: gy, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 6; i++) await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gx + ((end.x - gx) * i) / 6, y: gy + ((end.y - gy) * i) / 6, buttons: 1 });
      await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end.x, y: end.y, button: 'left', clickCount: 1 });
      await sleep(80);
      same(
        await d.js<string>('const e = document.getElementById("end"); const n = e.nextElementSibling; return n && n.matches("ul.n-todo") ? [...n.children].map(li => li.textContent).join(",") : "none";'),
        'One,Two,Three',
        'several items dragged together all arrive, in a list of their kind',
      );
      // A toggle's first block joins its title.
      await d.write('#first', 'start');
      await d.press('Home');
      await d.press('Backspace');
      same(await d.js<string>('return document.querySelector("summary").textContent'), 'TitleFirst inside', 'Backspace at the start of a toggle’s first block joins it to the title');
    },
  );

  await drive('<p id="a">Alpha</p><p id="b">Beta</p>', async (d) => {
    await d.write('#a');
    await d.type(' one');
    await d.write('#b');
    await d.type(' xyz');
    await d.press('z', { ctrl: true });
    await d.press('z', { ctrl: true });
    same(await shape(d), 'p:Alpha|p:Beta', 'Ctrl+Z takes back the words of the block, then those of the block before');
    await d.press('y', { ctrl: true });
    await d.press('y', { ctrl: true });
    same(await shape(d), 'p:Alpha one|p:Beta xyz', 'and Ctrl+Y brings both back');
    await d.write('#a');
    await d.press('Home');
    for (let i = 0; i < 5; i++) await d.press('ArrowRight', { shift: true });
    await d.press('Enter');
    same(await shape(d), 'p:|p:one|p:Beta xyz', 'Enter with words selected takes them out, then splits');
  });

  // ---- undo, a step per block ------------------------------------------------------------------------------------------------
  await drive('<p id="a">Alpha</p>', async (d) => {
    await d.write('#a');
    await d.type(' beta');
    await d.press('Enter');
    await d.type('Gamma delta');
    await d.press('z', { ctrl: true });
    same(await shape(d), 'p:Alpha beta|p:Gamma', 'Ctrl+Z while writing takes back the last word typed');
    await d.press('z', { ctrl: true });
    await d.press('z', { ctrl: true });
    same(await shape(d), 'p:Alpha beta', 'then the new block');
    await d.type('!');
    same(await shape(d), 'p:Alpha beta!', 'with the caret back where it was');
    await d.press('Escape');
    await d.press('z', { ctrl: true });
    same(await shape(d), 'p:Alpha beta', 'and once writing is done, a block’s words are one step');
    await d.press('z', { ctrl: true, shift: true });
    same(await shape(d), 'p:Alpha beta!', 'Ctrl+Shift+Z puts it back');
  });

  // ---- to-dos, toggles, several blocks, clicks below the last block ------------------------------------------------------------
  await drive('<ul class="n-todo"><li><input type="checkbox"><span>Call</span></li></ul><details class="n-toggle" open><summary>More</summary><p>Inside</p></details><p id="x">X</p><p id="y">Y</p>', async (d) => {
    await d.click('.n-todo input');
    ok((await d.js<boolean>('return document.querySelector(".n-todo input").hasAttribute("checked")')) === true, 'a to-do’s box ticks in Edit, kept in the page');
    await d.click('summary', { at: 'start', dx: -14 });
    ok((await d.js<boolean>('return document.querySelector("details").open')) === false, 'a toggle’s triangle folds it');
    await d.click('#x');
    await d.click('#y', { shift: true });
    ok((await d.msgs('wa-ed-sel')).at(-1)?.sel?.multi === 2, 'Shift+click picks several blocks');
    await d.press('Delete');
    ok(!(await shape(d)).includes('p:X') && !(await shape(d)).includes('p:Y'), 'Delete takes them all');
    const bottom = await d.js<number>('return document.body.lastElementChild.previousElementSibling ? document.querySelector("details").getBoundingClientRect().bottom : 0');
    await d.clickAt(450, Math.min(880, bottom + 120));
    await d.type('At the end');
    ok((await shape(d)).endsWith('p:At the end'), 'a click below the last block starts a new paragraph at the end');
    const out = await d.html();
    ok(/<input type="checkbox" checked="">/.test(out) && /<details class="n-toggle">/.test(out), 'the to-do’s tick and the folded toggle are in the page given back');
  });

  // ---- toggles, nested lists, pasted lines, what "/" and Backspace leave alone ---------------------------------------------------
  await drive(
    '<details class="n-toggle" open><summary id="s">Packing</summary><p>Socks</p></details><ul><li id="p1">Parent<ul><li id="kid">Kid</li></ul></li></ul><hr><p id="after">After the line</p><table><tr><td id="cell">A cell</td></tr></table>',
    async (d) => {
      await d.write('#s');
      await d.press('Enter');
      await d.type('Hat');
      same(await d.js<string>('return [...document.querySelector("details").children].map(c => c.tagName + ":" + c.textContent).join("|")'), 'SUMMARY:Packing|P:Hat|P:Socks', 'Enter in a toggle’s title makes the first block inside it');
      await d.write('#kid', 'start');
      await d.press('Home');
      await d.press('Backspace');
      same(await shape(d, 'ul'), 'li:Parent|li:Kid', 'Backspace at a nested item’s start takes it up a level');
      await d.write('#after', 'start');
      await d.press('Home');
      await d.press('Backspace');
      same((await d.msgs('wa-ed-sel')).at(-1)?.sel?.tag, 'hr', 'Backspace at a block’s start after a line across picks the line, as Notion does');
      // (its words' start: a small part's resize handle sits over its end)
      await d.write('#cell', 'start');
      await d.press('End');
      await d.type(' /');
      same(await d.js<string>('return document.querySelector("#cell").textContent'), 'A cell /', '"/" in a table’s cell is only a slash');
      await d.press('Escape');
      await d.write('#after');
      await d.js(
        'const dt = new DataTransfer(); dt.setData("text/plain", " and more\\n- a point\\n## A title\\nPlain words"); document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));',
      );
      await sleep(100);
      same((await shape(d)).split('|').slice(-5).join('|'), 'p:After the line and more|ul>li:a point|h2:A title|p:Plain words|table:A cell /', 'lines pasted become blocks, Markdown and all');
    },
  );

  // ---- dragging a block by its handle, into a column; a page with no blocks left ----------------------------------------------
  await drive('<h1 id="t">Columns</h1><p id="m">Move me</p><div class="n-cols"><div><p>Left</p></div><div></div></div>', async (d) => {
    const r = await d.js<{ x: number; y: number }>('const b = document.querySelector("#m").getBoundingClientRect(); return { x: b.left, y: b.top };');
    await d.clickAt(r.x + 20, r.y + 5);
    await d.press('Escape');
    await d.press('Escape');
    const s = d.tab.s;
    await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x + 30, y: r.y + 8 });
    await sleep(80);
    // The handle sits left of the block (+ then ⋮⋮), centred on its first line.
    const gx = r.x - 16;
    const gy = r.y + 11;
    await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gx, y: gy });
    await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: gx, y: gy, button: 'left', clickCount: 1 });
    const col = await d.js<{ x: number; y: number }>('const b = document.querySelector(".n-cols > div:nth-child(2)").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + 4 };');
    for (let i = 1; i <= 6; i++) await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gx + ((col.x - gx) * i) / 6, y: gy + ((col.y - gy) * i) / 6, buttons: 1 });
    await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: col.x, y: col.y, button: 'left', clickCount: 1 });
    await sleep(80);
    same(await d.js<string>('return document.querySelector(".n-cols > div:nth-child(2)").innerHTML'), '<p id="m">Move me</p>', 'a block dragged by its ⋮⋮ goes into an empty column');
    await d.press('z', { ctrl: true });
    same(await shape(d), 'h1:Columns|p:Move me|div.n-cols:Left', 'and Ctrl+Z takes the move back');
    for (const sel of ['#t', '#m', '.n-cols']) {
      await d.cmd('deselect');
      await d.click(sel);
      await d.press('Delete');
    }
    same(await shape(d), '', 'every block can go');
    await d.clickAt(400, 300);
    await d.type('A fresh start');
    same(await shape(d), 'p:A fresh start', 'and a click in an empty page starts a paragraph');
  });

  // ---- a picture dropped on the page -------------------------------------------------------------------------------------------------
  await drive('<h1>Drop</h1><p id="one">First</p><p id="two">Second</p>', async (d) => {
    const file = path.join(os.tmpdir(), `hydor-drop-${process.pid}.png`);
    fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    const r = await d.js<{ x: number; y: number }>('const b = document.querySelector("#two").getBoundingClientRect(); return { x: b.left + 20, y: b.top + 3 };');
    const data = { items: [], files: [file], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) await d.tab.s.send('Input.dispatchDragEvent', { type, x: r.x, y: r.y, data });
    await sleep(150);
    const sent = (await d.msgs('wa-ed-file')).at(-1);
    ok(
      sent && typeof sent.id === 'string' && (await d.js<boolean>('const m = window.__msgs.filter(function(m){return m.type==="wa-ed-file"}).pop(); return !!m && m.file instanceof File && m.file.type === "image/png";')),
      'a picture dropped on the page goes to the app, as a file, to be made small enough',
    );
    await d.cmd('fill', { id: sent?.id, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' });
    same(await shape(d), 'h1:Drop|p:First|img.n-pic:|p:Second', 'and it lands where it was dropped');
    fs.rmSync(file, { force: true });
  });

  // ---- an icon, a cover, a picture, maths, a video ------------------------------------------------------------------------------
  await drive('<h1 id="t">Garden</h1><p id="a">Notes</p>', async (d) => {
    await d.cmd('icon', '🌱');
    await d.cmd('cover', { gradient: 'linear-gradient(135deg,#d4fc79,#96e6a1)' });
    ok((await shape(d)).startsWith('div.n-cover:|div.n-icon:🌱|h1:Garden'), 'the icon and the cover go above the first heading');
    await d.cmd('page');
    const page = (await d.msgs('wa-ed-page')).at(-1)?.page;
    ok(page?.icon === '🌱' && page?.cover?.kind === 'gradient', 'the Page tab is told of them');
    await d.cmd('cover', { gradient: 'url(javascript:alert(1))' });
    ok((await d.js<string>('return document.querySelector(".n-cover").style.backgroundImage')).includes('linear-gradient'), 'a cover that is not a gradient or a picture is refused');
    await d.cmd('icon', null);
    await d.cmd('cover', null);
    ok((await shape(d)).startsWith('h1:Garden'), 'and both can be taken away');
    await d.write('#a');
    await d.press('Enter');
    await d.type('/picture');
    await d.press('Enter');
    const askP = (await d.msgs('wa-ed-ask')).at(-1);
    ok(askP?.what === 'picture' && typeof askP.id === 'string' && askP.rect, '"/picture" asks the app for the picture, where the caret is');
    await d.cmd('fill', { id: askP.id, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' });
    ok((await shape(d)).includes('img.n-pic:') && !(await shape(d)).includes('p:|img'), 'and it takes the empty block’s place');
    await d.cmd('fill', { id: askP.id, src: 'data:image/png;base64,AAAA' });
    ok((await d.js<number>('return document.querySelectorAll("img").length')) === 1, 'an answer comes once');
    await d.write('#a');
    await d.press('Enter');
    await d.type('/math');
    await d.press('Enter');
    const askM = (await d.msgs('wa-ed-ask')).at(-1);
    await d.cmd('fill', { id: askM.id, tex: 'E=mc^2', html: '<span class="katex"><span onclick="x()">E</span></span><script>bad()</script>', css: 'https://cdn.jsdelivr.net/npm/katex@0.19.0/dist/katex.min.css' });
    const m = await d.js<string>('const m = document.querySelector(".n-math"); return m ? m.outerHTML : ""');
    ok(m.includes('data-tex="E=mc^2"') && m.includes('role="img"') && !/onclick|script/.test(m), 'maths goes in drawn, with its TeX kept and nothing that runs');
    ok((await d.js<string>('const l = document.getElementById("n-katex"); return l ? l.getAttribute("href") : ""')).includes('cdn.jsdelivr.net/npm/katex@'), 'and the page loads KaTeX’s look from jsDelivr');
    await d.write('#a');
    await d.press('Enter');
    await d.type('/video');
    await d.press('Enter');
    const askV = (await d.msgs('wa-ed-ask')).at(-1);
    await d.cmd('fill', { id: askV.id, href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', play: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', thumb: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', title: 'A song' });
    ok((await d.js<string>('const v = document.querySelector("a.n-video"); return v ? v.getAttribute("data-video") : ""')) === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'a video goes in as its still, linked to it');
  });

  // ---- code blocks: coloured as they show and as they are written, a language to pick, plain code in the page kept --------
  await drive('<p id="a">Before</p><pre class="n-code" id="c">const x = 1; // one\nfunction f(a) { return "s"; }</pre><p id="z">After</p>', async (d) => {
    same(
      await d.js<string>('return [...document.querySelectorAll("#c span")].map(s => s.className + ":" + s.textContent).join(" ")'),
      'n-ck:const n-cn:1 n-cc:// one n-ck:function n-cf:f n-ck:return n-cs:"s"',
      'a code block shows its code coloured, the language told from the code',
    );
    await d.click('#c');
    same((await d.msgs('wa-ed-sel')).at(-1)?.sel?.tag, 'pre', 'a click on a coloured word picks the code block, not the word');
    same((await d.msgs('wa-ed-sel')).at(-1)?.sel?.langAuto, 'js', 'the Part tab is told the language its code looks like');
    await d.cmd('codeLang', 'python');
    same(await d.js<string>('return document.querySelector("#c").getAttribute("data-lang")'), 'python', 'a language picked is kept with the block');
    same(await d.js<string>('return [...document.querySelectorAll("#c .n-ck")].map(s => s.textContent).join(",")'), 'return', 'and its code is coloured as that language');
    await d.write('#c');
    await d.press('Enter');
    await d.type('def g(): pass');
    await sleep(80);
    same(await d.js<string>('return [...document.querySelectorAll("#c .n-ck")].map(s => s.textContent).join(",")'), 'return,def,pass', 'code typed is coloured as it is written');
    await d.type('!');
    ok((await d.js<string>('return document.querySelector("#c").textContent')).endsWith('def g(): pass!'), 'with the caret where it was');
    await d.press('Escape');
    const out = await d.html();
    ok(out.includes('<pre class="n-code" id="c" data-lang="python">const x = 1; // one\nfunction f(a) { return "s"; }\ndef g(): pass!</pre>'), 'the page given back keeps its code as plain text, and its language');
    await d.cmd('codeLang', '');
    same(await d.js<string>('return document.querySelector("#c").hasAttribute("data-lang")'), false, 'Auto takes the language off');
  });

  // ---- plain code blocks agents write (<pre><code>): coloured in Edit inside their <code>, kept as they were written ----------
  await drive(
    '<pre id="p1"><code class="language-python">def f(a):\n    return a  # one</code></pre><pre id="p2"><code>total 12\nnotes</code></pre><pre id="p3"><code class="lang-js">let <b>x</b> = 1;</code></pre><pre id="p4" data-lang="sql"><code>SELECT 1</code></pre>',
    async (d) => {
      const kinds = (sel: string) => d.js<string>(`return [...document.querySelectorAll(${JSON.stringify(sel)})].map(s => s.className + ":" + s.textContent).join(" ")`);
      same(await kinds('#p1 > code > span'), 'n-ck:def n-cf:f n-ck:return n-cc:# one', 'a plain code block shows its code coloured as its class says, inside its <code>');
      same([await kinds('#p2 span'), await kinds('#p3 code > span'), await kinds('#p4 code > span')].join('|'), '||n-ck:SELECT n-cn:1', 'one that is surely no language stays plain, one with markup of its own is left as it is, its block’s data-lang counts');
      await d.click('#p1 .n-cf');
      same((await d.msgs('wa-ed-sel')).at(-1)?.sel?.tag, 'code', 'a click on a coloured word picks the block’s code, not the word');
      await d.write('#p1 code');
      same(await d.js<number>('return document.querySelectorAll("#p1 span").length'), 0, 'written in, its code is plain text');
      await d.type('!');
      await d.press('Escape');
      same(await kinds('#p1 > code > .n-ck'), 'n-ck:def n-ck:return', 'and coloured again once it is left');
      const out = await d.html();
      ok(out.includes('<pre id="p1"><code class="language-python">def f(a):\n    return a  # one!</code></pre>') && out.includes('<pre id="p3"><code class="lang-js">let <b>x</b> = 1;</code></pre>') && !/n-c[a-z]"/.test(out), 'the page given back has its plain code blocks as they were written, no colours');
    },
  );

  // ---- comments: Comment on a block, marks beside the blocks, their places kept as blocks change -----------------------------
  await drive('<h2 id="h">Prices</h2><p id="p">Ten euros a day.</p><p id="q">Paid at the door.</p>', async (d) => {
    await d.cmd('caps', { comment: true });
    await d.cmd('comments', [
      { id: 'c1', on: { path: [1, 0], tag: 'h2', words: 'Prices' }, n: 2 },
      { id: 'c2', on: { path: [1, 9], tag: 'p', words: 'Paid at the door.' }, n: 1 },
      { id: 'c3', on: { words: 'nowhere at all' }, n: 1 },
    ]);
    await d.write('#p');
    for (let i = 0; i < 5; i++) await d.press('ArrowLeft', { shift: true });
    await d.press('m', { ctrl: true, alt: true });
    const asked = (await d.msgs('wa-ed-comment')).at(-1);
    ok(asked?.on?.tag === 'p' && asked?.on?.words === 'Ten euros a day.' && asked?.quote === 'day.', 'Ctrl+Alt+M asks the app for a comment on the block written in, and on the words picked there');
    await d.click('#h');
    await d.press('Escape');
    await d.click('#h');
    await d.cmd('comment');
    same((await d.msgs('wa-ed-comment')).at(-1)?.quote, 'Prices', 'Comment on a block picked: its words');
    await d.cmd('anchors', { id: 7 });
    same(
      JSON.stringify((await d.msgs('wa-ed-anchors')).at(-1)?.list?.map((x: { id: string; on: { tag: string } }) => `${x.id}:${x.on.tag}`)),
      JSON.stringify(['c1:h2', 'c2:p']),
      'each comment is found on its block: where it was, or by its words where the page changed (none for words no block has)',
    );
    await d.write('#q');
    await d.cmd('turn', 'h3');
    await d.press('Escape');
    await d.cmd('anchors', { id: 8 });
    const moved = (await d.msgs('wa-ed-anchors')).at(-1)?.list?.find((x: { id: string }) => x.id === 'c2');
    same(moved?.on?.tag, 'h3', 'a commented block turned into another kind keeps its comment, which the app keeps once saved');
    const out = await d.html();
    same(/c1|c2|cmshow|n-cm/.test(out), false, 'nothing of the comments is in the page given back');
  });

  // ---- a database in Edit: "/database", its cells written in where they are, kept with the page's data through the app ---------
  await drive('<h1 id="t">Trips</h1><p id="a">Plans</p>', async (d) => {
    await d.write('#a');
    await d.press('Enter');
    await d.type('/database');
    await d.press('Enter');
    await sleep(400);
    const db = await d.js<string>('const x = document.querySelector(".n-db"); return x ? x.getAttribute("data-db") + "|" + x.shadowRoot.querySelectorAll("tbody tr").length + "|" + [...x.shadowRoot.querySelectorAll("th")].map(t => t.textContent).join(",") : "none"');
    ok(/^db-\w+\|3\|Name,Status,Date,$/.test(db), `"/database" puts in a database: a name of its own, three empty rows, a name, a status and a date (${db})`);
    same((await d.msgs('wa-ed-sel')).at(-1)?.sel?.name, 'Database', 'and picks it');
    const at = await d.js<{ x: number; y: number }>('const i = document.querySelector(".n-db").shadowRoot.querySelector("tbody input.cell"); const b = i.getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 };');
    await d.clickAt(at.x, at.y);
    await d.type('Lisbox');
    await d.press('Backspace');
    await d.type('n');
    await sleep(500);
    same(await d.js<string>('return document.querySelector(".n-db").shadowRoot.querySelector("tbody input.cell").value'), 'Lisbon', 'its cells are written in where they are (Backspace too), the block staying');
    ok(/^n-db:db-\w+=\{.*"Lisbon"/.test(await d.js<string>('const k = Object.keys(window.__store)[0]; return k ? k + "=" + window.__store[k] : ""')), 'and what it holds is kept with the page’s data, through the app');
    const out = await d.html();
    ok(/<div class="n-db" data-db="db-\w+" data-schema="[^"]*"><\/div>/.test(out) && !/Lisbon|<table/.test(out), 'the page given back has the block alone, nothing it draws or holds');
    // A copy (Ctrl+D, a paste) is a database of its own: two blocks of one name would overwrite each other's rows.
    // (picked as its handle picks it, the caret no longer in its cell: there, Ctrl+D is the cell's)
    await d.click('#t');
    await d.cmd('select', await d.js<number[]>('const x = document.querySelector(".n-db"); return [[...document.documentElement.children].indexOf(document.body), [...document.body.children].indexOf(x)];'));
    await d.press('d', { ctrl: true });
    await sleep(400);
    const both = await d.js<string>('return [...document.querySelectorAll(".n-db")].map(x => x.getAttribute("data-db") + ":" + (x.shadowRoot ? x.shadowRoot.querySelector("tbody input.cell").value : "")).join(",")');
    const [first, copy] = both.split(',').map((x) => x.split(':'));
    ok(!!copy && first[0] !== copy[0] && copy[1] === 'Lisbon', `Duplicate makes a database of its own, a name of its own, with the rows the first holds (${both})`);
    const cellAt = await d.js<{ x: number; y: number }>('const i = document.querySelectorAll(".n-db")[1].shadowRoot.querySelector("tbody input.cell"); const b = i.getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 };');
    await d.clickAt(cellAt.x, cellAt.y);
    const saves = (await d.msgs('wa-ed-save')).length;
    await d.press('s', { ctrl: true });
    same((await d.msgs('wa-ed-save')).length, saves + 1, 'Ctrl+S in a database’s cell saves the page (its other keys are its own)');
  });

  // ---- AI on the page: Space on an empty line, an answer shown in place, kept as one step to undo ---------------------------
  await drive('<h1 id="t">Trip</h1><p id="a">Plans for Lisbon</p>', async (d) => {
    await d.write('#a');
    await d.press('Enter');
    await d.type(' ');
    await sleep(150);
    await d.type('a packing list');
    await d.press('Enter');
    await sleep(100);
    const asked = (await d.msgs('wa-ed-ai')).at(-1);
    ok(asked?.ask?.action === 'ask' && asked.ask.ask === 'a packing list' && /Plans for Lisbon/.test(asked.ask.before ?? ''), `Space on an empty line opens the AI, and what is typed is asked of it, with the page before (${JSON.stringify(asked?.ask ?? null).slice(0, 160)})`);
    await d.cmd('aiAnswer', { id: asked?.id, markdown: '- Socks\n- [ ] Passport\n\n**Sun cream**', model: 'Test', cost: 0.0012 });
    same(await d.js<string>('const p = document.querySelector("[data-n-ai]"); return p ? [...p.querySelectorAll("li")].map(x => x.textContent).join("+") + "|" + document.querySelectorAll("p[data-n-ai-hide]").length : "none"'), 'Socks+Passport|1', 'its answer shows in place, as blocks, in place of the empty line');
    ok(!/Socks|data-n-ai/.test(await d.html()), 'until it is kept, the page given back has none of it');
    await d.press('Enter');
    await sleep(100);
    same(await shape(d), 'h1:Trip|p:Plans for Lisbon|ul>li:Socks|ul.todo>li[ ]:Passport|p:Sun cream', 'Done keeps it: its blocks take the empty line’s place');
    await d.press('Escape');
    await d.press('z', { ctrl: true });
    same(await shape(d), 'h1:Trip|p:Plans for Lisbon|p:', 'one step to undo takes it all back');
  });
  await drive('<p id="a">The quick brown fox jumps over the lazy dog</p><p id="b">Second</p>', async (d) => {
    await d.write('#a');
    await d.js('const t = document.querySelector("#a").firstChild; const r = document.createRange(); r.setStart(t, 4); r.setEnd(t, 15); getSelection().removeAllRanges(); getSelection().addRange(r);');
    await d.press('j', { ctrl: true });
    await sleep(150);
    await d.type('shorter');
    await d.press('Enter');
    await sleep(100);
    const asked = (await d.msgs('wa-ed-ai')).at(-1);
    same(`${asked?.ask?.action}|${asked?.ask?.text}`, 'shorter|quick brown', 'Ctrl+J over picked words: the list filters as you type, and Make shorter asks about those words');
    await d.cmd('aiAnswer', { id: asked?.id, markdown: 'fast', model: 'Test' });
    await d.press('Enter');
    await sleep(100);
    same(await shape(d), 'p:The fast fox jumps over the lazy dog|p:Second', 'Replace puts the answer in the words’ place, the rest of the block as it was');
    await d.press('Escape');
    await d.press('j', { ctrl: true });
    await sleep(120);
    await d.type('Summarize');
    await d.press('Enter');
    const again = (await d.msgs('wa-ed-ai')).at(-1);
    ok(again?.id !== asked?.id && again?.ask?.action === 'summarize', 'Ctrl+J on a picked block asks about it');
    await d.cmd('aiAnswer', { id: again?.id, markdown: 'A fox.' });
    await d.press('Escape');
    await d.press('Escape');
    ok(!(await d.js<number>('return document.querySelectorAll("[data-n-ai]").length')) && (await shape(d)) === 'p:The fast fox jumps over the lazy dog|p:Second', 'Esc twice throws an answer away, the page as it was');
  });

  // ---- links to other pages: "@" or "/" → Link to a page, a chip with the page's icon -----------------------------------------
  await drive('<p id="a">See</p><p id="b">Also</p>', async (d) => {
    await d.cmd('pages', [
      { id: 'abc1234567', title: 'Trip notes', kind: 'page', icon: '🧭' },
      { id: 'def1234567', title: 'Budget', kind: 'sheet', icon: '' },
      { id: 'bad"<x', title: 'Not a page' },
    ]);
    await d.write('#a');
    await d.type(' @tri');
    await d.press('Enter');
    await d.type('now');
    const a = await d.js<string>('return document.querySelector("#a").innerHTML');
    ok(/See @?<a class="n-pagelink" href="\/pages\/abc1234567" data-page="abc1234567"[^>]*><span class="n-pagelink-icon" aria-hidden="true">🧭<\/span>Trip notes<\/a>(&nbsp;| )now/.test(a), `"@" and a page's name put a link to it in, with its icon, the caret after it (${a})`);
    same(a.includes('@'), false, 'the "@…" typed goes');
    same(await d.js<string>('return document.querySelector("#a a").getAttribute("contenteditable")'), 'false', 'while words are written, the link is one piece');
    await d.write('#b');
    await d.type(' /link');
    await d.press('Enter');
    await d.type('bud');
    await d.press('Enter');
    same(await d.js<string>('const l = document.querySelector("#b a.n-pagelink"); return l ? l.getAttribute("data-page") + " " + l.querySelector(".n-pagelink-icon").getAttribute("data-kind") : "none"'), 'def1234567 sheet', '"/" → Link to a page does the same; a page with no icon shows its kind’s');
    await d.press('Escape');
    const out = await d.html();
    ok(out.includes('<a class="n-pagelink" href="/pages/abc1234567" data-page="abc1234567"><span class="n-pagelink-icon" aria-hidden="true">🧭</span>Trip notes</a>'), 'the page given back has the link as the kit draws it, and nothing of the editor’s');
    await d.cmd('pages', [{ id: 'abc1234567', title: 'Trip notes, Lisbon', kind: 'page', icon: '🗺️' }]);
    same(await d.js<string>('return document.querySelector("#a a.n-pagelink").textContent'), '🗺️Trip notes, Lisbon', 'a link takes its page’s new title and icon');
  });

  // ---- picking blocks with a drag: from beside a block's words, from the left margin, item by item, from the + ---------------
  await drive('<h1 id="t">Pick</h1><p id="a">Short</p><p id="b">Also short</p><ul><li id="i1">One<ul><li id="i2">Two</li></ul></li><li id="i3">Three</li></ul><p id="z">Last</p>', async (d) => {
    const s = d.tab.s;
    const box = (sel: string) => d.js<{ l: number; r: number; t: number; b: number; m: number }>(`const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, m: b.top + Math.min(b.height, 24) / 2 };`);
    const drag = async (x0: number, y0: number, x1: number, y1: number) => {
      await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
      await sleep(60);
      await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 8; i++) await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / 8, y: y0 + ((y1 - y0) * i) / 8, buttons: 1 });
      await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
      await sleep(100);
    };
    const picked = async () => (await d.msgs('wa-ed-sel')).at(-1)?.sel?.multi ?? 0;
    const [a, b, t, i2, i3, z] = await Promise.all(['#a', '#b', '#t', '#i2', '#i3', '#z'].map(box));
    await drag(a.r - 30, a.m, a.r - 30, b.m);
    same(await picked(), 2, 'a drag from beside a block’s words down to the next block picks both');
    await d.cmd('deselect');
    await drag(t.l - 56, t.m, t.l - 56, i2.m);
    same(await picked(), 4, 'a drag down the left margin picks the blocks beside it (a list’s item with the items under it)');
    await d.cmd('deselect');
    await drag(i2.r - 40, i2.m, i2.r - 40, i3.m);
    same(await picked(), 2, 'a drag across a list picks its items one by one, nested ones too');
    same(await d.js<string>('return document.querySelector("#i2").textContent'), 'Two', 'and changes nothing');
    await d.cmd('deselect');
    await drag(a.l + 4, a.m, a.l + 4, a.m + 3);
    same(await picked(), 0, 'a press on a block’s words that hardly moves is still a click');
    await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: z.l + 10, y: z.m });
    await sleep(80);
    const plus = { x: z.l - 36, y: z.m };
    await drag(plus.x, plus.y, plus.x, b.m);
    ok((await picked()) >= 4 && (await shape(d)).endsWith('p:Last'), 'a drag from the + beside a block picks blocks too, and adds none');
    await d.press('Delete');
    same(await shape(d), 'h1:Pick|p:Short', 'the blocks picked go together with Delete');
  });

  // ---- nested items keep their place: turned into text, a heading, a quote or a to-do, they stay under their parent ---------
  await drive(
    '<ul><li id="c">Clothes<ul><li id="s">Socks</li><li id="sh">Shirts<ul><li>Linen</li><li>Cotton</li></ul></li><li id="j">A jacket</li></ul></li><li>Papers</li></ul><p id="end">End</p>',
    async (d) => {
      const held = () => d.js<string>('return [...document.querySelectorAll("li.n-block")].map(li => li.firstElementChild.tagName + ":" + li.firstElementChild.textContent).join(",")');
      await d.write('#sh', 'start');
      await d.cmd('turn', 'p');
      same(
        await shape(d),
        'ul>li:Clothes|ul>li>ul>li:Socks|ul>li>ul>li:Shirts|ul>li>ul>li>ul>li:Linen|ul>li>ul>li>ul>li:Cotton|ul>li>ul>li:A jacket|ul>li:Papers|p:End',
        'an item under another turned into text stays where it was, with the items under it',
      );
      same(await held(), 'P:Shirts', 'its item holds the paragraph (li.n-block, no marker of its own)');
      await d.type('!');
      same(await held(), 'P:!Shirts', 'and writing goes on in it');
      await d.press('End');
      await d.press('Enter');
      await d.type('Ties');
      same(await held(), 'P:!Shirts,P:Ties', 'Enter at its end makes the next block at the same level');
      same(await d.js<string>('const li = document.querySelectorAll("li.n-block")[1]; return [...li.querySelectorAll("li")].map(x => x.textContent).join(",")'), 'Linen,Cotton', 'which the items under it go with');
      await d.cmd('turn', 'h3');
      same(await held(), 'P:!Shirts,H3:Ties', 'a held block turned into a heading stays held');
      await d.cmd('turn', 'bullet');
      same(await held(), 'P:!Shirts', 'and into a bulleted list it is an item there again');
      ok((await shape(d)).includes('ul>li>ul>li:Ties|ul>li>ul>li>ul>li:Linen'), 'with the items under it');
      await d.write('#j', 'start');
      await d.cmd('turn', 'quote');
      same(await held(), 'P:!Shirts,BLOCKQUOTE:A jacket', 'an item turned into a quote stays in place too');
      await d.press('Home');
      await d.press('Backspace');
      same(await held(), 'P:!Shirts,P:A jacket', 'Backspace at a held quote’s start makes it text, as anywhere');
      await d.press('Backspace');
      ok((await shape(d)).includes('ul>li:Clothes') && (await shape(d)).includes('|p:A jacket|ul>li:Papers'), `then takes it up a level: out of the list, where it was, from the list’s top (${await shape(d)})`);
      await d.press('Tab');
      same(await held(), 'P:!Shirts,P:A jacket', 'Tab puts a block under the list item before it');
      await d.press('Tab', { shift: true });
      ok((await shape(d)).includes('|p:A jacket|ul>li:Papers'), 'and Shift+Tab takes it back out');
      await d.write('#s', 'start');
      await d.cmd('turn', 'todo');
      same(await d.js<string>('const li = document.querySelector("#c ul.n-todo > li"); return li ? li.textContent : "none"'), 'Socks', 'an item under another turned into a to-do stays under it too');
      const out = await d.html();
      ok(/<li id="sh" class="n-block"><p>!Shirts<\/p><\/li>/.test(out), 'the page given back keeps held blocks as the kit draws them');
    },
  );

  // ---- what the second round found: an empty table of contents, Save from the first letter, code from an empty block -------
  await drive('<h1 id="t">Plan</h1><nav class="n-toc"></nav><h2>Days</h2><p id="a">Words</p>', async (d) => {
    same(await d.js<number>('return document.querySelectorAll("nav.n-toc a").length'), 2, 'a table of contents an agent left empty is filled as the editor starts');
    same((await d.msgs('wa-ed-state')).some((m) => m.dirty), false, 'and that is no change of the user’s');
    await d.write('#a');
    await d.type(' more');
    same((await d.msgs('wa-ed-state')).at(-1)?.dirty, true, 'the first letter typed shows the page changed, before its block is left');
    for (let i = 0; i < 5; i++) await d.press('Backspace');
    await d.press('Escape');
    same((await d.msgs('wa-ed-state')).at(-1)?.dirty, false, 'words typed and taken back leave it unchanged');
    await d.write('#a');
    await d.press('Enter');
    await d.type('/code');
    await d.press('Enter');
    await d.type('x = 1');
    await d.press('Enter');
    await d.type('y');
    await d.press('Escape');
    same(JSON.stringify(await d.js<string>('return document.querySelector("pre").textContent')), JSON.stringify('x = 1\ny'), 'a code block made from an empty paragraph holds its code and no stray line');
  });

  // ---- a page in Use (the kit's bridge): links, and a table of contents left empty -------------------------------------------------
  {
    const body =
      '<a id="out" href="https://example.com/x">Out</a> <a id="pg" class="n-pagelink" data-page="abc123" href="/pages/abc123">A page</a> <a id="in" href="#days">In</a> <a id="own" href="https://example.com/y" onclick="event.preventDefault()">Own</a><nav class="n-toc"></nav><h2>Days</h2><h3>Monday</h3><pre class="n-code" data-lang="js">let a = 1;</pre><pre id="plain"><code class="language-python">x = None</code></pre>';
    const html = injectHead(`<!doctype html><html><head><title>Use</title></head><body>${body}</body></html>`, kitHead({ n: 't', theme: 'light', max: { key: 200, value: 1000 } }));
    await withTab({ html, width: 700, height: 500, settleMs: 150 }, async (tab) => {
      const js = <T>(code: string) => tab.evaluate<T>(`(() => { ${code} })()`);
      await js('window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; }; return 1;');
      const click = async (sel: string) => {
        const r = await js<{ x: number; y: number }>(`const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.left + 4, y: b.top + b.height / 2 };`);
        for (const type of ['mousePressed', 'mouseReleased'] as const) await tab.s.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
        await sleep(80);
      };
      const at = await js<string>('return location.href');
      await click('#out');
      await click('#pg');
      await click('#own');
      await click('#in');
      const opened = await js<string[]>('return window.__opened');
      same(opened[0], 'https://example.com/x', 'a link to another site opens in a tab of its own');
      ok(/\/pages\/abc123$/.test(opened[1] ?? ''), `a link to a page of the Library opens that page (in a tab, where no app is around it) (${opened[1]})`);
      same(opened.length, 2, 'a link the page’s own script took care of is left to it');
      same(await js<string>('return location.href.split("#")[0]'), at.split('#')[0], 'and the page stays where it is');
      same(await js<string>('return [...document.querySelectorAll("nav.n-toc a")].map(a => a.getAttribute("href") + " " + a.className).join(",")'), '#days n-toc-1,#monday n-toc-2', 'a table of contents left empty shows the page’s headings');
      same(await js<string>('return [...document.querySelectorAll("pre.n-code span")].map(s => s.className + ":" + s.textContent).join(" ")'), 'n-ck:let n-cn:1', 'a code block shows its code coloured, as in Edit');
      same(await js<string>('return [...document.querySelectorAll("#plain > code > span")].map(s => s.className + ":" + s.textContent + ":" + (getComputedStyle(s).color !== getComputedStyle(s.parentElement).color)).join(" ")'), 'n-cv:None:true', 'and a plain block an agent wrote, inside its <code>, in the kit’s colours');
    });
  }

  // ---- a database in Use: rows added, sorted, a board whose cards move between lanes, kept by the page's storage -----------
  {
    const schema = JSON.stringify({ cols: [{ name: 'Task' }, { name: 'Status', kind: 'select', options: ['To do', 'Done'] }, { name: 'Cost', kind: 'number' }], rows: [{ Task: 'Book', Status: 'To do', Cost: 3 }, { Task: 'Pack', Status: 'Done', Cost: 1 }] }).replace(/"/g, '&quot;');
    const head = `<style id="n-kit">${KIT_CSS}</style><script>(${BRIDGE_SRC})(${JSON.stringify({ n: 't', theme: 'light', max: { key: 200, value: 600000 } })})</script><script>(${PAGE_DB_SRC})().run(null, null, { readOnly: false })</script>`;
    const html = injectHead(`<!doctype html><html><head></head><body class="n-page"><div class="n-db" data-db="tasks" data-title="Tasks" data-schema="${schema}"></div></body></html>`, head);
    await withTab({ html, width: 900, height: 700, settleMs: 300 }, async (tab) => {
      const js = <T>(code: string) => tab.evaluate<T>(`(async () => { const R = document.querySelector(".n-db").shadowRoot; ${code} })()`);
      const click = async (code: string) => {
        const r = await js<{ x: number; y: number } | null>(`const el = (${code}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + Math.min(20, b.width / 2), y: b.top + b.height / 2 };`);
        if (!r) throw new Error(`nothing to click: ${code}`);
        for (const type of ['mousePressed', 'mouseReleased'] as const) await tab.s.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
        await sleep(120);
      };
      const cells = () => js<string>('return [...R.querySelectorAll("tbody tr")].map(tr => [...tr.querySelectorAll("td")].slice(0, 3).map(td => (td.querySelector("input") ? td.querySelector("input").value : td.textContent)).join(":")).join(",")');
      same(await cells(), 'Book:To do:3,Pack:Done:1', 'a database shows its rows, as its block starts it');
      await click('[...R.querySelectorAll(".foot .b")].find(b => /New/.test(b.textContent))');
      for (const ch of 'Visa') await tab.s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch });
      await sleep(500);
      same(await cells(), 'Book:To do:3,Pack:Done:1,Visa::', 'New adds a row, its first cell ready to type');
      ok(/"Visa"/.test(JSON.stringify(await tab.evaluate('hydor.storage.get("n-db:tasks")'))), 'what it holds is kept by the page’s storage');
      await click('[...R.querySelectorAll("th .b")].find(b => /Cost/.test(b.textContent))');
      await click('[...R.querySelectorAll(".pop .row")].find(b => /ascending/.test(b.textContent))');
      same(await cells(), 'Pack:Done:1,Book:To do:3,Visa::', 'a column’s menu sorts the rows by it (the empty last)');
      await click('[...R.querySelectorAll(".tabs .b")].find(b => /Board/.test(b.textContent))');
      same(await js<string>('return [...R.querySelectorAll(".lane")].map(l => l.querySelector(".lh").textContent + "=" + [...l.querySelectorAll(".card .ct")].map(c => c.textContent).join("+")).join(" | ")'), 'To do1=Book | Done1=Pack | No value1=Visa', 'its board has a lane for each option, with its cards');
      const from = await js<{ x: number; y: number }>('const b = [...R.querySelectorAll(".card")].find(c => c.textContent.startsWith("Book")).getBoundingClientRect(); return { x: b.left + 20, y: b.top + 10 };');
      const to = await js<{ x: number; y: number }>('const b = R.querySelectorAll(".lane")[1].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.bottom - 10 };');
      await tab.s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 8; i++) await tab.s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8, buttons: 1 });
      await tab.s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
      await sleep(500);
      same(await js<string>('return [...R.querySelectorAll(".lane")].map(l => [...l.querySelectorAll(".card .ct")].map(c => c.textContent).join("+")).join(" | ")'), ' | Pack+Book | Visa', 'a card dragged to another lane takes its option');
    });
  }

  // ---- a database's newer views in Use: a formula and a sum, a calendar, a row's own page, a gallery and a timeline ----------
  {
    const schema = JSON.stringify({
      cols: [{ name: 'Task' }, { name: 'Cost', kind: 'number' }, { name: 'Qty', kind: 'number' }, { name: 'Total', kind: 'formula', formula: 'prop("Cost") * prop("Qty")' }, { name: 'Start', kind: 'date' }, { name: 'End', kind: 'date' }],
      rows: [{ Task: 'Book', Cost: 3, Qty: 2, Start: '2026-11-10', End: '2026-11-12' }, { Task: 'Pack', Cost: 1, Qty: 5, Start: '2026-11-12' }],
      calc: { Cost: 'sum' },
    }).replace(/"/g, '&quot;');
    const head = `<style id="n-kit">${KIT_CSS}</style><script>(${BRIDGE_SRC})(${JSON.stringify({ n: 't', theme: 'light', max: { key: 200, value: 600000 } })})</script><script>(${PAGE_DB_SRC})().run(null, null, { readOnly: false })</script>`;
    const html = injectHead(`<!doctype html><html><head></head><body class="n-page"><div class="n-db" data-db="plan" data-title="Plan" data-schema="${schema}"></div><div class="n-chart" data-chart='{"type":"bar","db":"plan","x":"Task","y":["Cost"]}'></div></body></html>`, head);
    await withTab({ html, width: 1000, height: 800, settleMs: 300 }, async (tab) => {
      const js = <T>(code: string) => tab.evaluate<T>(`(async () => { const R = document.querySelector(".n-db").shadowRoot; ${code} })()`);
      const click = async (code: string) => {
        const r = await js<{ x: number; y: number } | null>(`const el = (${code}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + Math.min(12, b.width / 2), y: b.top + b.height / 2 };`);
        if (!r) throw new Error(`nothing to click: ${code}`);
        for (const type of ['mousePressed', 'mouseReleased'] as const) await tab.s.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
        await sleep(150);
      };
      same(await js<string>('return [...R.querySelectorAll("tbody tr")].map(tr => tr.querySelectorAll("td")[3].textContent).join(",") + "|" + R.querySelector("tfoot td:nth-child(2)").textContent.replace(/\\s+/g, " ").trim()'), '6,5|Sum4', 'a formula column works its value out for each row, and the footer sums a column');
      ok((await tab.evaluate<number>('document.querySelector(".n-chart").shadowRoot.querySelectorAll("rect").length')) === 2, 'a chart draws the database’s numbers, a bar for each row’s group');
      await click('[...R.querySelectorAll(".tabs .b")].find(b => /Calendar/.test(b.textContent))');
      same(await js<string>('return [...R.querySelectorAll(".cd")].filter(c => c.querySelector(".chip")).map(c => c.dataset.day + ":" + [...c.querySelectorAll(".chip")].map(x => x.textContent).join("+")).join(" ")'), '2026-11-10:Book 2026-11-12:Pack', 'the calendar shows each row on its day');
      await click('[...R.querySelectorAll(".chip")].find(c => c.textContent === "Book")');
      same(await js<string>('return R.querySelector(".peek .pkt")?.value ?? "none"'), 'Book', 'a row opens as a page of its own, its title on top');
      await click('R.querySelector(".peek .pkd")');
      for (const ch of 'Bring the tickets') await tab.s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch });
      await sleep(900);
      ok(/Bring the tickets/.test(JSON.stringify(await tab.evaluate('hydor.storage.get("n-db:plan")'))), 'what is written in a row’s own page is kept with the database');
      await click('R.querySelector(".peek [aria-label=Close]")');
      await click('[...R.querySelectorAll(".tabs .b")].find(b => /Gallery/.test(b.textContent))');
      same(await js<number>('return R.querySelectorAll(".gc").length'), 2, 'the gallery shows a card for each row');
      await click('[...R.querySelectorAll(".tabs .b")].find(b => /Timeline/.test(b.textContent))');
      same(await js<string>('return [...R.querySelectorAll(".bar")].map(b => b.textContent + ":" + Math.round(parseFloat(b.style.width) / 26)).join(",")'), 'Book:3,Pack:1', 'the timeline draws each row from its start to its end');
    });
  }

  // ---- a database only to read (a page saved as a file, a PDF, a published copy): its rows as words, sorted for whoever reads -
  {
    const schema = JSON.stringify({ cols: ['Task'] }).replace(/"/g, '&quot;');
    const stored = JSON.stringify({ cols: [{ name: 'Task' }, { name: 'When', kind: 'date' }, { name: 'Tags', kind: 'multi', options: ['red', 'blue'] }, { name: 'Site', kind: 'link' }, { name: 'Done', kind: 'check' }], rows: [{ Task: 'Visa', When: '2026-12-01', Tags: ['red', 'blue'], Site: 'https://example.com/a', Done: true }, { Task: 'Book' }] });
    const html = injectHead(`<!doctype html><html><head></head><body class="n-page"><div class="n-db" data-db="trip" data-schema="${schema}"></div></body></html>`, `<style id="n-kit">${KIT_CSS}</style>${pageDbScript(null, { 'n-db:trip': stored })}`);
    await withTab({ html, width: 900, height: 700, settleMs: 300 }, async (tab) => {
      const js = <T>(code: string) => tab.evaluate<T>(`(async () => { const R = document.querySelector(".n-db").shadowRoot; ${code} })()`);
      const click = async (code: string) => {
        const r = await js<{ x: number; y: number }>(`const b = (${code}).getBoundingClientRect(); return { x: b.left + Math.min(20, b.width / 2), y: b.top + b.height / 2 };`);
        for (const type of ['mousePressed', 'mouseReleased'] as const) await tab.s.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
        await sleep(120);
      };
      const rows = () => js<string>('return [...R.querySelectorAll("tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.textContent + (td.querySelector("input:checked") ? "✓" : "")).join(":")).join(",")');
      const first = await rows();
      ok(/^Visa:[^:]*2026[^:]*:redblue:https:\/\/example\.com\/a:✓,Book::::$/.test(first) && !first.includes('2026-12-01'), `a database shows the rows its page keeps, as words (a date as this device writes one) (${first})`);
      same(await js<string>('return [R.querySelectorAll("input:not([type=checkbox]), .foot .b, th.end").length, R.querySelector("td a")?.href].join("|")'), '0|https://example.com/a', 'only to read: no fields, no New, its links open');
      await click('R.querySelector("input[type=checkbox]")');
      ok(await js<boolean>('return R.querySelector("input[type=checkbox]").checked'), 'and its boxes stay as they are');
      await click('R.querySelector(".tools .b")');
      await click('[...R.querySelectorAll(".pop .row")].find(b => b.textContent === "Task")');
      ok((await rows()).startsWith('Book'), 'whoever reads it can still sort it (for them alone)');
      const note = await tab.evaluate<string>(`(async () => {
        const el = document.createElement('div');
        el.setAttribute('data-db', 'other');
        el.setAttribute('data-schema', '{"cols":["Name"],"rows":[{"Name":"Kept"}]}');
        document.body.append(el);
        (${PAGE_DB_SRC})().mount(el, { store: { get: () => Promise.reject(new Error('No answer')), set: () => Promise.resolve() }, edit: true });
        await new Promise((r) => setTimeout(r, 50));
        const R = el.shadowRoot;
        return [R.querySelector('.note')?.textContent, R.querySelectorAll('input:not([type=checkbox])').length, R.querySelector('tbody td')?.textContent].join('|');
      })()`);
      same(note, 'Its rows can be changed in Use.|0|Kept', 'in the editor, a database whose rows the app does not give stays as its block says, to read, saying where they change');
    });
  }
  // ---- the Studio's placing: right-click, free moving with guides, arrows, sizing from every side, the clipboard, dropped files ----
  /** A drag with the mouse (Alt 1, Ctrl 2, ⌘ 4, Shift 8 as `mods`), in six steps, with the buttons down as a real one has them. */
  const dragTo = async (d: Drive, x0: number, y0: number, x1: number, y1: number, mods = 0) => {
    const s = d.tab.s;
    await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, modifiers: mods });
    await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1, modifiers: mods, buttons: 1 });
    for (let i = 1; i <= 6; i++) await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / 6, y: y0 + ((y1 - y0) * i) / 6, buttons: 1, modifiers: mods });
    await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1, modifiers: mods });
    await sleep(100);
  };
  /** Picks a part by a selector (the editor knows parts by their place in the page). */
  const pick = async (d: Drive, sel: string) =>
    d.cmd('select', await d.js<number[]>(`const o = []; for (let x = document.querySelector(${JSON.stringify(sel)}); x !== document.documentElement; x = x.parentElement) o.unshift([...x.parentElement.children].indexOf(x)); return o;`));
  const rectOfEl = (d: Drive, sel: string) => d.js<{ l: number; t: number; r: number; b: number; w: number; h: number }>(`const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };`);
  const placedPage =
    '<div id="wrap" style="position:relative;height:320px"><div id="a" style="position:absolute;left:100px;top:40px;width:120px;height:60px;background:#ccd"></div><div id="b" style="position:absolute;left:330px;top:170px;width:80px;height:50px;background:#dcc"></div></div>';
  await drive(
    placedPage,
    async (d) => {
      await d.click('#b');
      const A = await rectOfEl(d, '#a');
      const B = await rectOfEl(d, '#b');
      // Dragged to 3 px short of #a's left edge (and well apart from its other lines): it snaps onto it, with guides drawn.
      await dragTo(d, B.l + 40, B.t + 25, B.l + 40 + (A.l + 3 - B.l), B.t + 25 + 30);
      const after = await rectOfEl(d, '#b');
      same(Math.round(after.l), Math.round(A.l), 'a placed part dragged near another’s edge snaps onto it');
      same(Math.round(after.t - B.t), 30, 'and moves freely the other way');
      same(await d.js<string>('return document.querySelector("#b").style.left'), '100px', 'writing the offset its place uses (left, from its block)');
      await d.press('z', { ctrl: true });
      same(await d.js<string>('return document.querySelector("#b").style.left + "," + document.querySelector("#b").style.top'), '330px,170px', 'one Ctrl+Z puts it back (the whole drag is one step)');
      // Alt: no snapping for this drag.
      await dragTo(d, B.l + 40, B.t + 25, B.l + 40 + (A.l + 3 - B.l), B.t + 25 + 30, 1);
      const free = await rectOfEl(d, '#b');
      ok(Math.abs(free.l - (A.l + 3)) < 1.5, `Alt turns snapping off (${free.l} against ${A.l + 3})`);
      await d.press('z', { ctrl: true });
      // Shift: straight.
      await dragTo(d, B.l + 40, B.t + 25, B.l + 100, B.t + 45, 8);
      const straight = await rectOfEl(d, '#b');
      ok(Math.abs(straight.t - B.t) < 1.5 && straight.l > B.l + 40, 'Shift keeps the move straight');
      await d.press('z', { ctrl: true });
      // Ctrl: a copy is dragged; the part stays.
      await dragTo(d, B.l + 40, B.t + 25, B.l + 40, B.t - 80, 2);
      same(await d.js<number>('return document.querySelectorAll("#wrap > div").length'), 3, 'Ctrl drags a copy');
      same(await d.js<string>('return document.querySelector("#b").style.top'), '170px', 'and the part stays');
      ok(await d.js<boolean>('return !document.querySelector("#wrap > div:nth-child(3)").id'), 'the copy has no id of its own (ids are for one part)');
      await d.press('z', { ctrl: true });
      same(await d.js<number>('return document.querySelectorAll("#wrap > div").length'), 2, 'and Ctrl+Z takes the copy back');
      // The arrow keys: one pixel, ten with Shift; a run of them is one step.
      await pick(d, '#b');
      await d.press('ArrowRight');
      await d.press('ArrowRight');
      await d.press('ArrowRight');
      await d.press('ArrowDown', { shift: true });
      same(await d.js<string>('const b = document.querySelector("#b"); return b.style.left + "," + b.style.top'), '333px,180px', 'the arrow keys move a placed part by 1 px, Shift by 10');
      await d.press('z', { ctrl: true });
      same(await d.js<string>('const b = document.querySelector("#b"); return b.style.left + "," + b.style.top'), '330px,170px', 'and a run of presses is one step to undo');
    },
    '',
  );
  // A part that sticks when scrolled: dragged to where it sticks on the screen (snapping under a header that stays there), nudged
  // up and down, one step to undo each, its rows in the menu.
  await drive(
    '<header id="hd" style="position:fixed;left:0;top:0;width:100%;height:50px;background:#eee"></header><div id="gap" style="height:120px"></div><nav id="st" style="position:sticky;height:40px;background:#cde">Sticky</nav><div style="height:2000px"></div>',
    async (d) => {
      await d.js('scrollTo(0, 0)');
      await pick(d, '#st');
      const S = await rectOfEl(d, '#st');
      // Taken up to 3 px under the header: it snaps under it, and is told to stick there (it stays where it falls until scrolled).
      await dragTo(d, S.l + 30, S.t + 20, S.l + 30, 53 + 20);
      same(await d.js<string>('return document.querySelector("#st").style.top'), '50px', 'a part that sticks, dragged near the bottom of a header on the screen, sticks right under it');
      same(Math.round((await rectOfEl(d, '#st')).t), Math.round(S.t), 'and stays where it falls until the page is scrolled');
      same((await d.msgs('wa-ed-sel')).at(-1)?.sel?.multi ?? 0, 0, 'a drag that leaves the part picks no blocks on its way (it is not a drag from the margin)');
      ok(!(await d.js<string>('return document.querySelector("#st").style.left')), 'nothing is written across (its page does not scroll sideways)');
      await d.js('scrollTo(0, 400)');
      await sleep(50);
      same(Math.round((await rectOfEl(d, '#st')).t), 50, 'scrolled, it sticks where it was dragged');
      // Stuck, dragged lower: it follows the pointer.
      const T = await rectOfEl(d, '#st');
      await dragTo(d, T.l + 30, T.t + 20, T.l + 30, T.t + 20 + 30);
      same(await d.js<string>('return document.querySelector("#st").style.top'), '80px', 'dragged while it is stuck, it sticks lower');
      same(Math.round((await rectOfEl(d, '#st')).t), 80, 'and is drawn there');
      await d.press('z', { ctrl: true });
      same(await d.js<string>('return document.querySelector("#st").style.top'), '50px', 'the drag is one step to undo');
      // ↑ and ↓ move where it sticks; a run of presses is one step. ← picks the part around it, as for a part in the flow.
      await pick(d, '#st');
      await d.press('ArrowDown');
      await d.press('ArrowDown');
      await d.press('ArrowDown', { shift: true });
      same(await d.js<string>('return document.querySelector("#st").style.top'), '62px', 'the arrow keys move where it sticks by 1 px, Shift by 10');
      await d.press('z', { ctrl: true });
      same(await d.js<string>('return document.querySelector("#st").style.top'), '50px', 'and a run of presses is one step to undo');
      await d.press('ArrowLeft');
      ok(!(await d.js<string>('return document.querySelector("#st").style.left')) && (await d.msgs('wa-ed-sel')).at(-1)?.sel?.tag === 'body', '← does not move it across: it picks the part around it');
      // Its rows in the menu: back in the flow, in front or behind.
      const r = await rectOfEl(d, '#st');
      const s = d.tab.s;
      await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.l + 6, y: r.t + 10 });
      await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.l + 6, y: r.t + 10, button: 'right', clickCount: 1, buttons: 2 });
      await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.l + 6, y: r.t + 10, button: 'right', clickCount: 1 });
      await sleep(120);
      const rows = ((await d.msgs('wa-ed-menu')).filter((m) => m.on).at(-1)?.rows ?? []) as string[];
      for (const row of ['Back in the flow', 'Bring forward', 'Send backward']) ok(rows.includes(row), `on a part that sticks: ${row} (${rows.join(', ')})`);
      await d.press('Escape');
      await pick(d, '#st');
      await d.cmd('place', 'flow');
      same(await d.js<string>('return getComputedStyle(document.querySelector("#st")).position + "|" + document.querySelector("#st").style.top'), 'static|', 'Back in the flow: it no longer sticks, and its offsets go');
    },
    '',
  );
  // A part placed by a class of the page's own: Back in the flow says it for that part alone.
  await drive('<style>.pin{position:absolute;left:20px;top:20px}</style><div id="w" style="position:relative;height:100px"><p id="pp" class="pin">Pinned</p></div>', async (d) => {
    await pick(d, '#pp');
    await d.cmd('place', 'flow');
    same(await d.js<string>('return getComputedStyle(document.querySelector("#pp")).position'), 'static', 'a part placed by its class goes back in the flow too');
  }, '');
  // Place freely, and back in the flow; the menu's rows.
  await drive(
    '<p id="p1">First</p><p id="p2" style="margin-top:30px">Second, <a id="lk" href="https://example.com">a link</a></p>',
    async (d) => {
      await pick(d, '#p2');
      await d.cmd('place', 'free');
      same(await d.js<string>('return getComputedStyle(document.querySelector("#p2")).position'), 'relative', 'Place freely makes a part one that is moved from where it falls (nothing jumps)');
      const before = await d.js<string>('return document.querySelector("#p2").getBoundingClientRect().top + ""');
      await d.cmd('place', 'flow');
      same((await d.js<string>('return document.querySelector("#p2").getAttribute("style")')).replace(/[\s;]/g, ''), 'margin-top:30px', 'Back in the flow takes its offsets and place away, nothing else');
      same(await d.js<string>('return document.querySelector("#p2").getBoundingClientRect().top + ""'), before, 'where it sits does not change with either');
      await d.press('z', { ctrl: true });
      await d.press('z', { ctrl: true });
      ok(!(await d.js<string>('return document.querySelector("#p2").getAttribute("style")')).includes('relative'), 'each is a step to undo');
      // Right-click: picks the part under the pointer and opens its menu, with what is under it.
      const s = d.tab.s;
      const click = async (sel: string, mods = 0) => {
        const r = await rectOfEl(d, sel);
        await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.l + 6, y: r.t + r.h / 2 });
        await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.l + 6, y: r.t + r.h / 2, button: 'right', clickCount: 1, modifiers: mods, buttons: 2 });
        await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.l + 6, y: r.t + r.h / 2, button: 'right', clickCount: 1, modifiers: mods });
        await sleep(120);
      };
      await d.cmd('deselect');
      await click('#p1');
      const menus = (await d.msgs('wa-ed-menu')).filter((m) => m.on);
      ok(menus.length === 1, 'a right-click opens the menu of the part under it');
      same((await d.msgs('wa-ed-sel')).at(-1)?.sel?.tag, 'p', 'having picked it');
      const rows = (menus[0].rows ?? []) as string[];
      for (const row of ['Place freely', 'Cut', 'Copy', 'Paste', 'Duplicate', 'Delete', 'Colour']) ok(rows.includes(row), `the menu has ${row} (${rows.join(', ')})`);
      ok(!rows.includes('Open the link'), 'and no link’s rows where there is no link');
      await d.press('Escape');
      await d.cmd('deselect');
      await click('#lk');
      const withLink = ((await d.msgs('wa-ed-menu')).filter((m) => m.on).at(-1)?.rows ?? []) as string[];
      for (const row of ['Open the link', 'Change the link', 'Remove the link']) ok(withLink.includes(row), `on a link: ${row}`);
      same((await d.msgs('wa-ed-sel')).at(-1)?.sel?.tag, 'a', 'the link is what was picked');
      await d.cmd('unlink');
      same(await d.js<string>('return document.querySelector("#p2").innerHTML'), 'Second, a link', 'Remove the link takes the link off and leaves its words');
      await d.press('z', { ctrl: true });
      // Shift+right-click: the browser's own menu (the editor leaves it alone).
      const count = (await d.msgs('wa-ed-menu')).filter((m) => m.on).length;
      await d.js('window.__ctxPrevented = null; addEventListener("contextmenu", function(e){ window.__ctxPrevented = e.defaultPrevented; });');
      await click('#p1', 8);
      same((await d.msgs('wa-ed-menu')).filter((m) => m.on).length, count, 'Shift+right-click opens no menu of the editor');
    },
    '',
  );
  // A placed part on a picture: its rows (Back in the flow, Bring forward, Send backward).
  await drive('<div style="position:relative;height:200px"><img id="im" alt="x" style="position:absolute;left:40px;top:40px;width:80px;height:60px" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="><div id="o" style="position:absolute;left:60px;top:50px;width:50px;height:50px;background:#ccc;z-index:3"></div></div>', async (d) => {
    const s = d.tab.s;
    const r = await rectOfEl(d, '#im');
    await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.l + 5, y: r.t + 5 });
    await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.l + 5, y: r.t + 5, button: 'right', clickCount: 1, buttons: 2 });
    await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.l + 5, y: r.t + 5, button: 'right', clickCount: 1 });
    await sleep(120);
    const rows = ((await d.msgs('wa-ed-menu')).filter((m) => m.on).at(-1)?.rows ?? []) as string[];
    for (const row of ['Replace the picture', 'Edit picture', 'Description', 'Back in the flow', 'Bring forward', 'Send backward']) ok(rows.includes(row), `on a placed picture: ${row} (${rows.join(', ')})`);
    await d.press('Escape');
    await pick(d, '#im');
    await d.cmd('layer', 'front');
    same(await d.js<string>('return document.querySelector("#im").style.zIndex'), '4', 'Bring forward puts a part one above the highest beside it');
    await d.cmd('layer', 'back');
    same(await d.js<string>('return document.querySelector("#im").style.zIndex'), '-1', 'Send backward, below the lowest');
  }, '');
  // Sizing: from every side, by the box the page uses, a flex cell that keeps its size, Shift in proportion, edges that snap.
  await drive(
    '<div id="c" style="box-sizing:content-box;width:200px;height:50px;padding:20px;border:2px solid #888;background:#eef;margin-bottom:20px"></div>' +
      '<div id="row" style="display:flex;width:480px;margin-bottom:20px"><div id="fa" style="flex:1;height:40px;background:#cde"></div><div id="fb" style="flex:1;height:40px;background:#edc"></div></div>' +
      '<div id="ref" style="box-sizing:border-box;width:300px;height:30px;background:#ccc;margin-bottom:10px"></div><div id="sz" style="box-sizing:border-box;width:200px;height:40px;background:#cdc"></div>',
    async (d) => {
      const handle = async (sel: string, h: 'se' | 'e' | 'w' | 's' | 'n' | 'sw' | 'nw' | 'ne') => {
        await d.cmd('deselect');
        await d.click(sel, { dx: 0 });
        const r = await rectOfEl(d, sel);
        const at = { se: [r.r + 1, r.b + 1], e: [r.r + 1, (r.t + r.b) / 2], w: [r.l - 5.5, (r.t + r.b) / 2], s: [(r.l + r.r) / 2, r.b + 1], n: [(r.l + r.r) / 2, r.t - 5.5], sw: [r.l - 6, r.b + 1], nw: [r.l - 6, r.t - 6], ne: [r.r + 1, r.t - 6] }[h];
        return { x: at[0], y: at[1], r };
      };
      // The first drag does not jump by the padding and the border of a content-box part.
      let h = await handle('#c', 'se');
      await dragTo(d, h.x, h.y, h.x + 30, h.y + 10, 1);
      let r = await rectOfEl(d, '#c');
      ok(Math.abs(r.w - (h.r.w + 30)) < 1.5 && Math.abs(r.h - (h.r.h + 10)) < 1.5, `a part is sized by what is drawn (${r.w}×${r.h} from ${h.r.w}×${h.r.h}, asked for +30 and +10)`);
      await d.press('z', { ctrl: true });
      // From the left: the right edge stays where it is.
      h = await handle('#c', 'w');
      await dragTo(d, h.x, h.y, h.x - 30, h.y, 1);
      r = await rectOfEl(d, '#c');
      ok(Math.abs(r.r - h.r.r) < 1.5 && Math.abs(r.w - (h.r.w + 30)) < 1.5, `the left handle grows it to the left, its right edge staying (${r.l}…${r.r} from ${h.r.l}…${h.r.r})`);
      await d.press('z', { ctrl: true });
      // From the top.
      h = await handle('#c', 'n');
      await dragTo(d, h.x, h.y, h.x, h.y - 20, 1);
      r = await rectOfEl(d, '#c');
      ok(Math.abs(r.b - h.r.b) < 1.5 && Math.abs(r.h - (h.r.h + 20)) < 1.5, 'the top handle grows it upward, its bottom edge staying');
      await d.press('z', { ctrl: true });
      // Shift keeps its shape.
      h = await handle('#c', 'se');
      await dragTo(d, h.x, h.y, h.x + 60, h.y, 8 | 1);
      r = await rectOfEl(d, '#c');
      ok(Math.abs(r.w / r.h - h.r.w / h.r.h) < 0.03, `Shift keeps the proportions (${(r.w / r.h).toFixed(3)} from ${(h.r.w / h.r.h).toFixed(3)})`);
      await d.press('z', { ctrl: true });
      // A cell of a flex row takes the size it is given (flex: 1 would have ignored a width).
      h = await handle('#fa', 'se');
      await dragTo(d, h.x, h.y, h.x + 60, h.y, 1);
      r = await rectOfEl(d, '#fa');
      ok(Math.abs(r.w - (h.r.w + 60)) < 1.5, `a flex cell keeps the size it is sized to (${r.w} from ${h.r.w}, +60)`);
      await d.press('z', { ctrl: true });
      // Its edge snaps to the edge of another part: 4 px short of #ref's right edge it lands on it.
      h = await handle('#sz', 'e');
      const ref = await rectOfEl(d, '#ref');
      await dragTo(d, h.x, h.y, ref.r - 4 + 1, h.y);
      r = await rectOfEl(d, '#sz');
      ok(Math.abs(r.r - ref.r) < 0.6, `a side snaps to another part’s edge (${r.r} against ${ref.r})`);
      same(await d.js<string>('return document.querySelector("#sz").style.width'), '300px', 'and its width is written in whole pixels');
    },
    '',
  );
  // Addresses an attribute may have (the Part tab's Link): bare sites made links that go somewhere; code refused.
  await drive('<p><a id="lk" href="https://a.example">link</a></p><img id="im" src="https://x.example/a.png" alt="">', async (d) => {
    await pick(d, '#lk');
    await d.cmd('attr', { name: 'href', value: 'example.com' });
    same(await d.js<string>('return document.querySelector("#lk").getAttribute("href")'), 'https://example.com', 'a link typed as "example.com" goes to the site, not to a page beside this one');
    await d.cmd('attr', { name: 'href', value: 'javascript:alert(1)' });
    await d.cmd('attr', { name: 'href', value: 'data:text/html,<script>alert(1)</script>' });
    await d.cmd('attr', { name: 'href', value: 'vbscript:x' });
    same(await d.js<string>('return document.querySelector("#lk").getAttribute("href")'), 'https://example.com', 'javascript:, data: and vbscript: addresses are refused');
    await d.cmd('attr', { name: 'href', value: 'ann@example.com' });
    same(await d.js<string>('return document.querySelector("#lk").getAttribute("href")'), 'mailto:ann@example.com', 'an email address becomes a mail link');
    await pick(d, '#im');
    await d.cmd('attr', { name: 'src', value: 'data:text/html,hi' });
    same(await d.js<string>('return document.querySelector("#im").getAttribute("src")'), 'https://x.example/a.png', 'a picture’s source cannot be a page of data');
    await d.cmd('attr', { name: 'src', value: 'data:image/png;base64,AAAA' });
    same(await d.js<string>('return document.querySelector("#im").getAttribute("src")'), 'data:image/png;base64,AAAA', 'but a picture of data can');
  }, '');
  // The clipboard: a part copied reaches it as HTML and as words; pasted words keep their look and nothing harmful.
  await drive('<p id="p">Hello there</p><p id="q">Second one</p>', async (d) => {
    await d.js('window.__copy = null; addEventListener("copy", function(e){ window.__copy = [e.clipboardData.getData("text/html"), e.clipboardData.getData("text/plain")]; });');
    await pick(d, '#p');
    // (a real key: a copy needs a person's gesture to reach the clipboard)
    await d.press('c', { ctrl: true });
    const got = await d.js<string[] | null>('return window.__copy');
    ok(!!got && got[0].includes('data-hydor-parts') && got[0].includes('<p id="p">Hello there</p>') && got[1] === 'Hello there', 'a part copied is on the clipboard as HTML (wrapped, so the editor knows it) and as words');
    const copied = (await d.msgs('wa-ed-copied')).at(-1);
    ok(copied && copied.text === 'Hello there' && copied.system === true, 'and the app is told its words, and that the frame wrote the clipboard itself');
    // Pasted back with nothing being written: after the part picked, as it was copied.
    const paste = (html: string, text = '') =>
      d.js<boolean>(`const dt = new DataTransfer(); ${html ? `dt.setData('text/html', ${JSON.stringify(html)});` : ''} dt.setData('text/plain', ${JSON.stringify(text)}); const t = document.querySelector('[data-n-ce]') || document.body; const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); t.dispatchEvent(e); return e.defaultPrevented;`);
    await pick(d, '#q');
    await paste(got![0], got![1]);
    same(await shape(d), 'p:Hello there|p:Second one|p:Hello there', 'a part pasted goes after the one picked');
    await d.press('z', { ctrl: true });
    // Other HTML (a page's, Word's) comes in as blocks of words: its markup is not kept.
    await pick(d, '#p');
    await paste('<h2 style="color:red">Title</h2><p class="x">One <b>bold</b> <script>alert(1)</script>two</p><ul><li>A</li><li>B</li></ul>', 'Title\nOne bold two\nA\nB');
    const blocks = await shape(d);
    ok(blocks.startsWith('p:Hello there|h2:Title|p:One bold two|ul>li:A|ul>li:B'), `HTML pasted with nothing written comes in as blocks (${blocks})`);
    ok(!(await d.body()).includes('script') && !(await d.body()).includes('color:red'), 'with no script, style or class of the page it came from');
    await d.press('z', { ctrl: true });
    // Words being written: bold, italic, links, kept; scripts, styles, handlers and code addresses dropped.
    await d.write('#p', 'start');
    await d.js('const p = document.querySelector("#p"); const r = document.createRange(); r.selectNodeContents(p); getSelection().removeAllRanges(); getSelection().addRange(r);');
    const bad = await paste('<meta charset="utf-8"><p style="font-size:30px">A <b>bold</b>, <i>soft</i> and <u>under</u> <a href="https://e.example/p" onclick="x()">link</a> <a href="javascript:alert(1)">trick</a><img src=x onerror=alert(1)><script>alert(2)</script><span style="font-weight:700;color:red">heavy</span></p>', 'A bold, soft and under link trick heavy');
    ok(bad, 'pasted HTML is taken by the editor (the browser’s own paste is stopped)');
    const html = await d.js<string>('return document.querySelector("[data-n-ce]").innerHTML');
    ok(html.includes('<strong>bold</strong>') && html.includes('<em>soft</em>') && html.includes('<u>under</u>'), `bold, italic and underline survive a paste (${html})`);
    ok(html.includes('<a href="https://e.example/p">link</a>'), 'a link survives, with its address and nothing else');
    ok(!/javascript|onclick|onerror|<script|<img|font-size|color:/.test(html) && html.includes('trick'), 'and nothing that runs: its words stay, its handlers, scripts, pictures and styles go');
    ok(html.includes('<strong>heavy</strong>'), 'a span styled bold, as Word and Docs write it, is bold');
    await d.press('z', { ctrl: true });
    // Without formatting: Ctrl+Shift+V.
    await d.js('const p = document.querySelector("[data-n-ce]") || document.querySelector("#p"); const r = document.createRange(); r.selectNodeContents(p); getSelection().removeAllRanges(); getSelection().addRange(r);');
    // (the key as an event of its own: a real one would also paste what this page copied above, on its own)
    await d.js('const t = document.querySelector("[data-n-ce]") || document.body; t.dispatchEvent(new KeyboardEvent("keydown", { key: "V", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));');
    await paste('<p>Some <b>bold</b> words</p>', 'Some bold words');
    const plain = await d.js<string>('return document.querySelector("[data-n-ce]").innerHTML');
    ok(!plain.includes('<strong>') && plain.includes('Some bold words'), `Ctrl+Shift+V pastes only the words (${plain})`);
    await d.press('z', { ctrl: true });
    // A lone address pasted over selected words links them.
    await d.js('const p = document.querySelector("[data-n-ce]") || document.querySelector("#p"); const r = document.createRange(); r.selectNodeContents(p); getSelection().removeAllRanges(); getSelection().addRange(r);');
    await paste('', 'https://example.org/page');
    same(await d.js<string>('return document.querySelector("[data-n-ce]").innerHTML'), '<a href="https://example.org/page">Hello there</a>', 'a web address pasted over selected words makes them a link to it');
    // The pieces: what pasteWords makes of HTML (as the page runs it).
    const pieces = await d.js<{ kind: string; html: string }[]>(`const g = (${geometry.toString()})(); return g.pasteWords('<h1>Big</h1><p>x <b>y</b></p><ol><li>one<ul><li>nested</li></ul></li></ol><blockquote>q</blockquote><pre>a\\nb</pre><table><tr><td>c1</td><td>c2</td></tr></table>');`);
    same(pieces.map((p) => `${p.kind}:${p.html}`).join('|'), 'h1:Big|:x <strong>y</strong>|number:one|bullet:nested|quote:q|code:a<br>b|:c1 c2', 'pasted HTML is told into pieces by its blocks: headings, lists (nested items too), quotes, code, table rows');
  });
  // Ctrl+A picks every part; Delete takes them all, as one step.
  await drive('<h1>One</h1><p>Two</p><p>Three</p>', async (d) => {
    await d.cmd('deselect');
    await d.press('a', { ctrl: true });
    same((await d.msgs('wa-ed-sel')).at(-1)?.sel?.multi, 3, 'Ctrl+A picks every part of the page');
    await d.press('Delete');
    same(await shape(d), '', 'Delete takes them all out');
    await d.press('z', { ctrl: true });
    same(await shape(d), 'h1:One|p:Two|p:Three', 'and one Ctrl+Z brings them all back');
  });
  // Any file dropped on the page: a PDF, a video, a sound, another file; kept in the order dropped; where it fell; the line's side in a grid.
  await drive('<h1>Drop</h1><div style="display:grid;grid-template-columns:1fr 1fr;gap:20px"><p id="ga">A</p><p id="gb">B</p></div><p id="end">End</p>', async (d) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-drops-'));
    const files = ['a.pdf', 'b.mp4', 'c.mp3', 'd.zip', 'e.png'].map((n) => {
      const f = path.join(dir, n);
      fs.writeFileSync(f, n.endsWith('.png') ? Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') : 'x');
      return f;
    });
    // Over #gb's left half, in its lower half: before #gb (its row is a grid's: the line stands beside it), not after it.
    const r = await rectOfEl(d, '#gb');
    const at = { x: r.l + 6, y: r.b - 3 };
    const data = { items: [], files, dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) await d.tab.s.send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data });
    await sleep(200);
    // (the files themselves cannot be read back as JSON: their names and kinds are)
    const sent = await d.js<{ id: string; what?: string; name: string }[]>('return window.__msgs.filter(function(m){return m.type==="wa-ed-file"}).map(function(m){return { id: m.id, what: m.what, name: m.file.name }});');
    same(sent.map((m) => `${m.what ?? 'picture'}:${m.name}`).sort().join(' '), 'audio:c.mp3 file:d.zip pdf:a.pdf picture:e.png video:b.mp4', 'files dropped on the page are sorted by kind (a PDF, a video, a sound, a picture, any other file) and each is sent to the app');
    const by = (n: string) => sent.find((m) => m.name === n)!;
    // Answered in the order opposite to the one dropped: they are kept in the order they were dropped in.
    const hex = 'a'.repeat(64);
    await d.cmd('fill', { id: by('d.zip').id, src: `/pg/file/${hex}/abcdef0123456789/d.zip`, name: 'd.zip', size: 1 });
    await d.cmd('fill', { id: by('c.mp3').id, src: `/pg/file/${hex}/abcdef0123456789/c.mp3`, name: 'c.mp3', size: 1 });
    await d.cmd('fill', { id: by('b.mp4').id, file: `/pg/video/${'b'.repeat(32)}/${'c'.repeat(24)}` });
    await d.cmd('fill', { id: by('a.pdf').id, src: `/pg/file/${hex}/abcdef0123456789/a.pdf`, name: 'a.pdf', size: 1 });
    const order = await d.js<string>('return [...document.querySelector("div").children].map(function(c){ return c.id || c.className.split(" ").filter(function(x){return /^n-(pdf|vidfile|audio|file)$/.test(x)}).join("") || c.tagName.toLowerCase(); }).join(",")');
    ok(/^ga,(n-pdf,n-vidfile,n-audio,n-file,)?gb$/.test(order) || /^ga,.*gb$/.test(order), `they land at the drop line, before the part beside it in a grid (${order})`);
    const kinds = await d.js<string>('return ["div.n-pdf", "video.n-vidfile", "div.n-audio", "a.n-file"].map(function(s){ return document.querySelectorAll(s).length }).join("")');
    same(kinds, '1111', 'each file became its block: a PDF, a video, a sound, a file to download');
    const seq = await d.js<string>('return [...document.body.querySelectorAll(".n-pdf, .n-vidfile, .n-audio, .n-file")].map(function(x){ return x.className.replace(/.*n-(pdf|vidfile|audio|file).*/, "$1") }).join(",")');
    same(seq, 'pdf,vidfile,audio,file', 'in the order they were dropped');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  // Find and replace in the page's words: matches counted (through bold too), words only changed, one step to undo.
  await drive('<p id="a" title="apples">Apples and apples</p><p id="b">Go <b>app</b>les<script>var apples = 1;</script></p><p id="c">Pears</p>', async (d) => {
    const found = async () => (await d.msgs('wa-ed-found')).at(-1) as { count: number; index: number };
    await d.cmd('find', { query: 'apples', opts: { matchCase: false, wholeWord: false, regex: false } });
    same(`${(await found()).count}/${(await found()).index}`, '3/0', 'find counts every match in the page’s words (a match may run through bold), and starts on the first');
    await d.cmd('find', { query: 'apples', opts: {}, step: 1 });
    same((await found()).index, 1, 'the next match is on view');
    await d.cmd('find', { query: 'apples', opts: { matchCase: true } });
    same((await found()).count, 2, 'Match case leaves out “Apples”');
    await d.cmd('find', { query: 'app', opts: { wholeWord: true } });
    same((await found()).count, 0, 'Whole words leaves out “apples”');
    await d.cmd('find', { query: 'a(p+)les', opts: { regex: true } });
    same((await found()).count, 3, 'a regular expression finds the same');
    await d.cmd('find', { query: 'apples', opts: {} });
    await d.cmd('findReplace', { query: 'apples', opts: {}, replacement: 'pears', all: false });
    same(await d.js<string>('return document.querySelector("#a").innerHTML'), 'pears and apples', 'Replace changes the match on view, in its words');
    same(await d.js<string>('return document.querySelector("#a").getAttribute("title")'), 'apples', 'and never an attribute');
    await d.cmd('findReplace', { query: 'apples', opts: {}, replacement: 'pears', all: true });
    same(await d.js<string>('return document.querySelector("#a").innerHTML + "|" + document.querySelector("#b").innerHTML.replace(/<script>.*<\\/script>/, "")'), 'pears and pears|Go <b>pears</b>', 'Replace all changes every match, even one through bold, and no tag');
    ok((await d.body()).includes('var apples = 1;'), 'and a script’s text is not the page’s words');
    await d.press('z', { ctrl: true });
    same(await d.js<string>('return document.querySelector("#a").innerHTML'), 'pears and apples', 'Replace all is one step to undo');
    await d.cmd('find', { query: '(\\w+) and', opts: { regex: true } });
    await d.cmd('findReplace', { query: '(\\w+) and', opts: { regex: true }, replacement: 'and $1', all: false });
    same(await d.js<string>('return document.querySelector("#a").innerHTML'), 'and pears apples', 'a regular expression’s groups go in the replacement');
    await d.cmd('findClear');
  });
  closeCapture();
} else console.log('(no Chromium here: the editor’s browser tests were skipped)');

// ---- a page of such blocks survives its exports -------------------------------------------------------------------------
{
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-page-editor-test-')));
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
  const deps = { app, db, sessions: { deliverOrQueue: async () => {} }, broadcast: () => {}, toSubscribers() {}, publicBase: () => 'https://naget.example' } as unknown as Deps;
  pages.routes!(deps);
  await app.ready();
  const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
  const tools = Object.fromEntries(pages.tools!(ctx).map((t) => [t.name, t]));
  const req = (method: 'GET' | 'POST', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'app.test' } });
  const html =
    '<!doctype html><html><head><title>Plan</title></head><body class="n-page"><div class="n-cover" style="background-image:linear-gradient(135deg,#a1c4fd,#c2e9fb)"></div><div class="n-icon">🧭</div><h1>Plan</h1>' +
    '<ul class="n-todo"><li><input type="checkbox" checked><span>Book the tickets</span></li><li><input type="checkbox"><span>Pack</span></li></ul>' +
    '<details class="n-toggle"><summary>Packing list</summary><p>Socks and a hat</p></details>' +
    '<div class="n-callout"><span class="n-callout-icon">💡</span><div class="n-callout-text">Leave early</div></div>' +
    '<div class="n-cols"><div><p>Left side</p></div><div><p>Right side</p></div></div>' +
    '<p class="n-tc-red">Red words</p><p>Some <mark class="n-hl-yellow">marked</mark> words</p></body></html>';
  const r = (await tools.save_page.run({ title: 'Plan', html }, ctx)) as string;
  const id = /\(page ([a-f0-9]{10})/.exec(r)?.[1] ?? '';
  ok(id, 'a page of Notion-like blocks is saved as it is');
  const listed = (JSON.parse((await req('GET', '/api/pages')).body).pages as { id: string; icon?: string }[]).find((p) => p.id === id);
  same(listed?.icon, '🧭', 'the Library knows a page’s icon (its .n-icon), for links to it from other pages');

  // ---- comments on its blocks: kept outside the page, changed by a list of changes, answered by agents -------------------
  {
    const ops = (body: unknown) => req('POST', `/api/pages/${id}/comments`, body).then((r) => ({ status: r.statusCode, ...JSON.parse(r.body) }));
    const r1 = await ops({ ops: [{ text: 'Bigger, please', on: { path: [1, 2], tag: 'h1', words: 'Plan' }, quote: 'Plan' }, { text: 'Is this the date?', on: { path: [1, 4], tag: 'details', words: 'Packing list' } }] });
    same(r1.comments?.length, 2, 'comments go on a page’s blocks');
    ok(r1.added?.length === 2 && r1.comments[0].by === 'user' && r1.comments[0].on.tag === 'h1', 'each the user’s, on its block (where it is, its tag and words)');
    const before = (await req('GET', `/api/pages/${id}/export?format=html`)).body;
    ok(!before.includes('Bigger, please'), 'and they are not in the page');
    same(JSON.parse((await req('GET', `/api/pages/${id}`)).body).page.version, 1, 'nor a new version of it');
    const c1 = r1.added[0];
    const c2 = r1.added[1];
    await ops({ ops: [{ id: c2, reply: 'It is.' }, { id: c2, resolve: true }] });
    const got = JSON.parse((await req('GET', `/api/pages/${id}/comments`)).body).comments;
    ok(got.find((c: { id: string }) => c.id === c2)?.resolved && got.find((c: { id: string }) => c.id === c2)?.replies?.[0]?.text === 'It is.', 'they are answered and resolved');
    const bad = await ops({ ops: [{ text: '<script>x</script>', on: { path: ['x'], tag: 'H1 bad', words: 7 } }] });
    ok(bad.status === 200 && !bad.comments.at(-1).on, 'an anchor that is not one is left out');
    await ops({ ops: [{ id: bad.added[0], delete: true }] });
    const read = (await tools.get_page.run({ id }, ctx)) as string;
    ok(read.includes(`- ${c1} · open · on the <h1> “Plan”`) && read.includes('Bigger, please') && read.includes('save_page with this id and comments'), 'an agent reads them in get_page, and how to answer');
    const answered = (await tools.save_page.run({ id, title: 'Plan', comments: [{ id: c1, reply: 'Made it bigger.', resolve: true }, { text: 'Check the dates', on: 'Packing list' }] }, ctx)) as string;
    ok(/answered its comments; the page itself is as it was/.test(answered), `save_page answers them without the page (${answered})`);
    const after = JSON.parse((await req('GET', `/api/pages/${id}/comments`)).body).comments;
    ok(after.find((c: { id: string }) => c.id === c1)?.replies?.[0]?.by === 'agent' && after.find((c: { id: string }) => c.id === c1)?.resolved, 'as the agent');
    ok(after.some((c: { by: string; on?: { words?: string } }) => c.by === 'agent' && c.on?.words === 'Packing list'), 'and adds its own, on the words of its block');
    same(JSON.parse((await req('GET', `/api/pages/${id}`)).body).page.version, 1, 'the page itself stays as it was');
    let refused = '';
    try {
      await tools.save_page.run({ title: 'New' }, ctx);
    } catch (e) {
      refused = (e as Error).message;
    }
    ok(/html/.test(refused), 'a new page still needs its html');
  }

  // ---- a database: an agent makes one, fills it with save_page's databases, reads it in get_page; its exports show it ------
  {
    const dbHtml = `<!doctype html><html><body class="n-page"><h1>Trip</h1><div class="n-db" data-db="tasks" data-title="Tasks" data-schema='{"cols":[{"name":"Task"},{"name":"Status","kind":"select","options":["To do","Done"]}],"rows":[{"Task":"Book","Status":"To do"}]}'></div></body></html>`;
    const made = (await tools.save_page.run({ title: 'Trip', html: dbHtml, databases: { tasks: { add: [{ Task: 'Pack', Status: 'Done' }] } } }, ctx)) as string;
    const pid = /\(page ([a-f0-9]{10})/.exec(made)?.[1] ?? '';
    ok(/Database tasks: 2 rows/.test(made), `save_page fills a page’s database as it makes the page (${made})`);
    const kept = JSON.parse((await req('GET', `/api/pages/${pid}/data`)).body).entries.find((x: { key: string }) => x.key === 'n-db:tasks')?.value;
    same(kept?.rows?.length, 2, 'what it holds is kept as the page’s data (n-db:tasks)');
    const changed = (await tools.save_page.run({ id: pid, title: 'Trip', databases: { tasks: { update: [{ id: kept.rows[0].id, Status: 'Done' }], add: [{ Task: 'Visa' }] }, nowhere: { add: [{}] } } }, ctx)) as string;
    ok(/changed its databases/.test(changed) && /Database tasks: 3 rows/.test(changed) && /no database "nowhere"/.test(changed), `and changes its rows without the page (${changed})`);
    const read = (await tools.get_page.run({ id: pid }, ctx)) as string;
    ok(/- tasks “Tasks” · 3 rows/.test(read) && /Task="Book", Status="Done"/.test(read) && /Task="Visa"/.test(read) && !/Stored data:\n\{\n "n-db/.test(read), 'get_page shows its columns and rows (and not twice, as stored data)');
    same(JSON.parse((await req('GET', `/api/pages/${pid}`)).body).page.version, 1, 'its rows are the page’s data: no new version');
    const web = (await req('GET', `/api/pages/${pid}/export?format=html`)).body;
    ok(web.includes('().run(null, {"n-db:tasks"') && web.includes('Visa'), 'a page saved as a file carries its databases’ rows, to show them');
  }
  const web = await req('GET', `/api/pages/${id}/export?format=html`);
  ok(web.statusCode === 200 && web.body.includes('id="n-kit"') && web.body.includes('.n-todo{') && web.body.includes('<input type="checkbox" checked>'), 'as a web page it keeps its blocks, with the kit’s look for them');
  if (canCapture()) {
    const pdf = await req('GET', `/api/pages/${id}/export?format=pdf`);
    ok(pdf.statusCode === 200 && pdf.rawPayload.subarray(0, 5).toString() === '%PDF-', 'it prints as a PDF');
    const docx = await req('GET', `/api/pages/${id}/export?format=docx`);
    ok(docx.statusCode === 200, 'it exports as a Word document');
    const file = path.join(tmp, 'Plan.docx');
    fs.writeFileSync(file, docx.rawPayload);
    const text = (await extractText(file))?.text ?? '';
    ok(text.includes('☑') && text.includes('Book the tickets') && text.includes('☐'), 'with the to-dos, ticked or not');
    ok(text.includes('Socks and a hat') && text.includes('Packing list'), 'a toggle’s title and what it folds');
    ok(text.includes('Leave early') && text.includes('Left side') && text.includes('Right side'), 'the callout’s words and both columns');
  }
  await app.close();
  closeCapture();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
