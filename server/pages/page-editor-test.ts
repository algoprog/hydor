// Script tests for the page editor (a page's Edit mode, editor.ts with writing.ts): writing as in Notion in a real
// browser (Enter makes the next block, Backspace joins, Tab nests, Markdown as you type, "/" for blocks, Turn into,
// colours, to-dos that tick, toggles, a table of contents, an icon and a cover, several blocks picked, undo by the
// block), that nothing of the editor's own reaches the page it gives back, the kit's styles for the blocks, and that a
// page made of them survives its exports (a web page, a PDF and a Word document when a browser is here). The browser
// parts run when this computer has a Chromium (Settings → Browser, or Playwright's). Build and run with a scratch folder:
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
import { extractText } from '../documents/extract.ts';
import { EDITOR_SRC } from './editor.ts';
import { pages } from './index.ts';

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

// ---- the editor in a browser --------------------------------------------------------------------------------------
const LABELS = { phText: 'Type ‘/’ for commands' };
const pageOf = (body: string, cls = 'n-page') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Test page</title><style id="n-kit" data-n-own>${KIT_CSS}</style>` +
  `<script data-n-own>window.__msgs=[];addEventListener('message',function(e){var d=e.data;if(d&&typeof d.type==='string'&&d.type.indexOf('wa-ed')===0)window.__msgs.push(d)});</script>` +
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
