// Script tests for the highlights you make on web pages in your own browsing: the page's address as highlights are kept by
// (no #fragment, no tracking parameters), the table (adding, a page's list in order, all of them newest first with words,
// notes, deleting, the limits), the marks put back when a page has loaded (a stand-in tab: at once and again later, only
// the pages that have highlights, another page, a tab that closes, a delete or a note reaching the open tabs), the routes
// being the user's alone (agents refused), and the code that runs in a page, in a real Chromium when there is one (marking
// a selection across paragraphs and links, finding it again by its words and the words round it among several of the same
// words, hidden text left alone, taking the marks away so the page is as it was, a page that built its content late).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/highlights-test.ts
//   DATA_DIR=/tmp/hydor-test-highlights node dist/dev/highlights-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { highlightKey, HIGHLIGHT_MAX } from '../../shared/highlights.ts';
import { openDb } from '../db.ts';
import { ruleFor } from '../guide/api.ts';
import { Cdp } from './cdp.ts';
import { findChromes, launchChrome } from './chrome.ts';
import { addHighlight, clearHighlights, getHighlight, listHighlights, MAX_PER_PAGE, pageCount, pageHighlights, removeHighlight, setNote } from './highlights.ts';
import { HighlightsLive, type LiveTab } from './highlights-live.ts';
import { applyScript, noteScript, removeScript, scrollScript, selectScript } from './highlights-page.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let passed = 0;
let failed = 0;
const check = async (name: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').join('\n     ')}`);
    process.exitCode = 1;
  }
};

const dir = process.env.DATA_DIR!;
fs.mkdirSync(dir, { recursive: true });
let n = 0;
const fresh = () => openDb(path.join(dir, `highlights-${++n}-${process.pid}.db`), { cacheMb: 8 });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await check('address: the same page whatever follows it (fragment, tracking, www, scheme, a slash), other pages stay other', () => {
    const k = highlightKey('https://www.Example.com/a/b/?utm_source=x&id=2&fbclid=abc&a=1#frag');
    assert.equal(k, 'example.com/a/b?a=1&id=2');
    assert.equal(highlightKey('http://example.com/a/b?id=2&a=1'), k);
    assert.equal(highlightKey('https://example.com/'), 'example.com');
    assert.equal(highlightKey('https://example.com'), 'example.com');
    assert.notEqual(highlightKey('https://example.com/a?id=1'), highlightKey('https://example.com/a?id=2'));
    assert.notEqual(highlightKey('https://example.com/a'), highlightKey('https://sub.example.com/a'));
    assert.equal(highlightKey('file:///home/me/notes.html#x'), 'file:///home/me/notes.html');
    for (const bad of ['about:blank', 'chrome-extension://abc/x.html', 'javascript:alert(1)', 'not a url', '', 'data:text/html,hi']) assert.equal(highlightKey(bad), null, bad);
  });

  await check('table: a highlight keeps its words, the words round them, the title, the time; a page lists its own in order', () => {
    const db = fresh();
    const a = addHighlight(db, { url: 'https://a.example/post?utm_medium=x#top', title: '  A \n post ', text: '  the   quick brown\n fox ', prefix: 'and then ', suffix: ' jumped over' }, 100)!;
    assert.deepEqual([a.key, a.url, a.title, a.text, a.prefix, a.suffix, a.note, a.at], ['a.example/post', 'https://a.example/post?utm_medium=x', 'A post', 'the quick brown fox', 'and then ', ' jumped over', '', 100]);
    const b = addHighlight(db, { url: 'http://www.a.example/post/', title: 'A post', text: 'lazy dog' }, 200)!;
    addHighlight(db, { url: 'https://b.example/', title: 'B', text: 'elsewhere' }, 300);
    assert.deepEqual(
      pageHighlights(db, 'https://a.example/post#else').map((h) => h.id),
      [a.id, b.id],
    );
    assert.equal(pageCount(db, 'https://a.example/post'), 2);
    assert.equal(pageCount(db, 'https://c.example/'), 0);
    assert.equal(addHighlight(db, { url: 'about:blank', text: 'x' }), null);
    assert.equal(addHighlight(db, { url: 'https://a.example/', text: '   ' }), null);
    assert.throws(() => addHighlight(db, { url: 'https://a.example/', text: 'x'.repeat(HIGHLIGHT_MAX + 1) }), /up to/);
    assert.equal(getHighlight(db, a.id)?.text, 'the quick brown fox');
    db.close();
  });

  await check('table: all of them newest first, found by words in the text, note, title or address; paging; notes; deleting', () => {
    const db = fresh();
    const ids = [1, 2, 3].map((i) => addHighlight(db, { url: `https://site${i}.example/p`, title: `Title ${i}`, text: `Words number ${i} about otters`, id: undefined }, i * 100)!.id);
    assert.deepEqual(
      listHighlights(db).map((h) => h.id),
      [...ids].reverse(),
    );
    assert.equal(listHighlights(db, { q: 'OTTERS site2' }).length, 1);
    assert.equal(listHighlights(db, { q: 'number 3 title' })[0].id, ids[2]);
    assert.equal(listHighlights(db, { before: 300 }).length, 2);
    assert.equal(listHighlights(db, { limit: 1 }).length, 1);
    assert.equal(setNote(db, ids[0], '  remember\r\nthis  ')?.note, 'remember\nthis');
    assert.equal(listHighlights(db, { q: 'remember' }).length, 1, 'the note is searched');
    assert.equal(setNote(db, ids[0], '')?.note, '');
    assert.equal(listHighlights(db, { q: 'remember' }).length, 0);
    assert.equal(setNote(db, 'nope', 'x'), null);
    assert.equal(removeHighlight(db, ids[1])?.id, ids[1]);
    assert.equal(removeHighlight(db, ids[1]), null);
    assert.equal(listHighlights(db).length, 2);
    assert.equal(clearHighlights(db, 'https://site1.example/p#x'), 1);
    assert.equal(clearHighlights(db), 1);
    db.close();
  });

  await check('table: a page keeps up to a most', () => {
    const db = fresh();
    for (let i = 0; i < MAX_PER_PAGE; i++) addHighlight(db, { url: 'https://many.example/', text: `w${i}` }, i);
    assert.throws(() => addHighlight(db, { url: 'https://many.example/', text: 'one more' }), /up to/);
    assert.ok(addHighlight(db, { url: 'https://other.example/', text: 'fine' }));
    db.close();
  });

  await check('routes: the user’s own browsing is refused to agents, so are highlights', () => {
    for (const [m, p] of [
      ['GET', '/api/browser/browsing/highlights'],
      ['POST', '/api/browser/browsing/highlights'],
      ['PATCH', '/api/browser/browsing/highlights/abc'],
      ['DELETE', '/api/browser/browsing/highlights/abc'],
      ['POST', '/api/browser/browsing/highlights/abc/open'],
    ]) assert.equal(ruleFor(m, p).level, 'refuse', `${m} ${p}`);
  });

  await check('live: a page that has loaded gets its highlights, again a moment later; pages with none, loading ones and agents’ are left alone', async () => {
    const db = fresh();
    const h = addHighlight(db, { url: 'https://a.example/post', title: 'A', text: 'found me' })!;
    const ran: string[] = [];
    const tab = (id: string, url: string): LiveTab & { calls: number } => ({
      targetId: id,
      url,
      calls: 0,
      async evaluate<T>(expr: string) {
        this.calls++;
        ran.push(`${id}:${expr.includes('.apply(') ? 'apply' : expr.includes('.remove(') ? 'remove' : expr.includes('.note(') ? 'note' : 'other'}`);
        return { ids: [h.id], missing: [], shown: false } as T;
      },
    });
    const a = tab('a', 'https://a.example/post#x');
    const blank = tab('blank', 'about:blank');
    const other = tab('other', 'https://other.example/');
    const live = new HighlightsLive(db, () => [a, blank, other], [0, 40]);
    live.seen({ open: true, tabs: [{ id: 'a', url: a.url, loading: true }, { id: 'blank', url: blank.url }, { id: 'other', url: other.url }] });
    await wait(80);
    assert.equal(a.calls, 0, 'not while it loads');
    assert.equal(blank.calls, 0);
    live.seen({ open: true, tabs: [{ id: 'a', url: a.url }, { id: 'blank', url: blank.url }, { id: 'other', url: other.url }] });
    await wait(120);
    assert.equal(a.calls, 2, 'at once and a moment later');
    assert.equal(other.calls, 0, 'a page with no highlights costs the page nothing');
    // The same state again (a title changed): no new pass.
    live.seen({ open: true, tabs: [{ id: 'a', url: a.url }, { id: 'blank', url: blank.url }, { id: 'other', url: other.url }] });
    await wait(80);
    assert.equal(a.calls, 2);
    // A reload is a new pass.
    live.seen({ open: true, tabs: [{ id: 'a', url: a.url, loading: true }] });
    live.seen({ open: true, tabs: [{ id: 'a', url: a.url }] });
    await wait(120);
    assert.equal(a.calls, 4);
    // A reload too quick to be seen loading (the view waits a moment between looks): its new load time is a new pass.
    live.seen({ open: true, tabs: [{ id: 'a', url: a.url, loadedAt: 1000 }] });
    await wait(120);
    assert.equal(a.calls, 6, 'a load time it had not seen');
    live.seen({ open: true, tabs: [{ id: 'a', url: a.url, loadedAt: 1000 }] });
    await wait(80);
    assert.equal(a.calls, 6, 'the same load time: no new pass');
    live.seen({ open: true, tabs: [{ id: 'a', url: a.url, loadedAt: 2000 }] });
    await wait(120);
    assert.equal(a.calls, 8, 'loaded again');
    // Moving on to another page without loading (a single-page app): looked at again.
    a.url = 'https://other.example/';
    live.seen({ open: true, tabs: [{ id: 'a', url: a.url }] });
    await wait(80);
    assert.equal(a.calls, 8, 'that page has none');
    a.url = 'https://a.example/post';
    live.seen({ open: true, tabs: [{ id: 'a', url: a.url }] });
    await wait(120);
    assert.equal(a.calls, 10);
    // Delete and note reach the open tabs showing the page.
    ran.length = 0;
    await live.removed(h);
    await live.noted({ ...h, note: 'n' });
    assert.deepEqual(ran, ['a:remove', 'a:note']);
    live.stop();
    db.close();
  });

  await check('live: a tab that closes is forgotten, a pass that fails does not break the next, the browser closing stops it', async () => {
    const db = fresh();
    addHighlight(db, { url: 'https://a.example/post', text: 'x y z' });
    let fail = true;
    let calls = 0;
    const t: LiveTab = {
      targetId: 't',
      url: 'https://a.example/post',
      async evaluate<T>() {
        calls++;
        if (fail) throw new Error('Cannot find context with specified id');
        return { ids: [], missing: [], shown: false } as T;
      },
    };
    let tabs: LiveTab[] = [t];
    const live = new HighlightsLive(db, () => tabs, [0, 30]);
    live.seen({ open: true, tabs: [{ id: 't', url: t.url }] });
    await wait(80);
    assert.ok(calls >= 2, 'it tried again');
    fail = false;
    const before = calls;
    tabs = [];
    live.seen({ open: true, tabs: [] });
    await wait(60);
    assert.equal(calls, before, 'a closed tab is not run in');
    live.seen({ open: false, tabs: [] });
    live.stop();
    db.close();
  });

  await pageScript();

  console.log(`\n${passed}/${passed + failed} passed`);
}

// ---- the code that runs in a page, in a real Chromium ---------------------------------------------------------------

const PAGE = `<!doctype html><html><head><title>t</title><style>.gone{display:none}</style></head><body>
<article>
<h1>The  quick   brown fox</h1>
<p id="p1">The quick brown fox jumps over the <a href="#x" id="link">lazy dog</a> and keeps running.</p>
<p id="p2">Later, the quick brown fox jumps over a fence. Then <b>the quick brown fox</b> sleeps.</p>
<p class="gone" id="hid">hidden words that nobody sees</p>
<ul><li>first item</li><li>second item</li></ul>
<table><tr><td>cell one</td><td>cell two</td></tr></table>
<textarea id="ta">words in a box</textarea>
<script>window.late = false; setTimeout(() => { const p = document.createElement('p'); p.id = 'late'; p.textContent = 'content that arrived late'; document.body.appendChild(p); window.late = true; }, 300);</script>
</article></body></html>`;

async function pageScript() {
  const chrome = findChromes().find((c) => c.source !== 'desktop');
  if (!chrome) {
    console.log('skip the page code in a real Chromium: none found');
    return;
  }
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-highlights-'));
  const { proc, wsUrl } = await launchChrome(chrome, { userDataDir, headless: true });
  const cdp = await Cdp.connect(wsUrl);
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m: string, p: object = {}) => cdp.send(m, p, sessionId);
    await send('Page.enable');
    await send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}` });
    await wait(600);
    const ev = async <T>(expression: string): Promise<T> => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value as T;
    };
    const marked = (id: string) => ev<string>(`[...document.querySelectorAll('mark.hydor-hl[data-hydor-hl="${id}"]')].map((m) => m.textContent).join('|')`);
    const html0 = await ev<string>('document.body.innerHTML');
    const bodyText = () => ev<string>('document.body.textContent');
    const text0 = await bodyText();

    await check('page: a selection across a paragraph and a link is marked where it is, and kept with its words round it', async () => {
      // Select from "jumps over the " to the end of "lazy dog".
      await ev(`(() => { const p = document.getElementById('p1'); const r = document.createRange(); r.setStart(p.firstChild, 20); r.setEnd(document.getElementById('link').firstChild, 8); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
      const r = await ev<{ text?: string; prefix?: string; suffix?: string; error?: string }>(selectScript('11111111-1111-1111-1111-111111111111'));
      assert.equal(r.error, undefined);
      assert.equal(r.text, 'jumps over the lazy dog');
      assert.equal(r.prefix?.endsWith('quick brown fox '), true, r.prefix);
      assert.equal(r.suffix?.startsWith(' and keeps'), true, r.suffix);
      assert.equal(await marked('11111111-1111-1111-1111-111111111111'), 'jumps over the |lazy dog');
      assert.equal(await ev('String(getSelection())'), '', 'the selection is let go so the mark shows');
      assert.equal(await bodyText(), text0, 'the page’s words are the same');
      const style = await ev<string>(`getComputedStyle(document.querySelector('mark.hydor-hl')).backgroundColor`);
      assert.match(style, /rgba\(255, 214, 10, 0\.4\)/);
    });

    await check('page: nothing selected, or too much, is said so and marks nothing', async () => {
      await ev('getSelection().removeAllRanges()');
      assert.match((await ev<{ error: string }>(selectScript('22222222-2222-2222-2222-222222222222'))).error, /Select some words/);
      await ev(`(() => { const r = document.createRange(); r.selectNodeContents(document.body); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
      // The page is short: it is allowed. Only the limit's error is checked in the table; here the marks must be undone.
      const r = await ev<{ text?: string }>(selectScript('33333333-3333-3333-3333-333333333333'));
      assert.ok(r.text && !r.text.includes('hidden words'), 'hidden text is not in it');
      assert.ok(!r.text!.includes('words in a box'), 'a box’s own text is not in it');
      assert.match(r.text!, /first item second item cell one cell two/, 'a space between blocks');
      await ev(removeScript('33333333-3333-3333-3333-333333333333'));
      assert.equal(await marked('33333333-3333-3333-3333-333333333333'), '');
      assert.equal(await bodyText(), text0);
    });

    await check('page: taking the marks away leaves the page as it was', async () => {
      const removed = await ev<number>(removeScript('11111111-1111-1111-1111-111111111111'));
      assert.equal(removed, 2);
      assert.equal(await marked('11111111-1111-1111-1111-111111111111'), '');
      assert.equal(await ev<number>(`document.querySelectorAll('mark.hydor-hl').length`), 0);
      assert.equal(await ev<string>('document.body.innerHTML'), html0, 'the same markup');
    });

    await check('page: among several of the same words, the place with the words round it is found', async () => {
      const list = [
        { id: 'aaaaaaaa-0000-0000-0000-000000000001', text: 'the quick brown fox', prefix: 'Later, ', suffix: ' jumps over a fence', note: 'second one' },
        { id: 'aaaaaaaa-0000-0000-0000-000000000002', text: 'the quick brown fox', prefix: 'Then ', suffix: ' sleeps.', note: '' },
        { id: 'aaaaaaaa-0000-0000-0000-000000000003', text: 'lazy dog and keeps', prefix: 'over the ', suffix: ' running.', note: '' },
        { id: 'aaaaaaaa-0000-0000-0000-000000000004', text: 'words that are not on the page', prefix: '', suffix: '', note: '' },
        { id: 'aaaaaaaa-0000-0000-0000-000000000005', text: 'hidden words', prefix: '', suffix: '', note: '' },
        { id: 'aaaaaaaa-0000-0000-0000-000000000006', text: 'words in a box', prefix: '', suffix: '', note: '' },
        { id: 'aaaaaaaa-0000-0000-0000-000000000007', text: 'The quick brown fox', prefix: '', suffix: ' jumps over the lazy', note: '' },
      ];
      const r = await ev<{ ids: string[]; missing: string[] }>(applyScript(list));
      assert.deepEqual(r.missing, [list[3].id, list[4].id, list[5].id]);
      // The second paragraph's two places are told apart; the one with a note shows it.
      assert.equal(await ev(`document.querySelector('#p2 mark[data-hydor-hl="${list[0].id}"]')?.parentElement.id`), 'p2');
      assert.equal(await ev(`document.querySelector('#p2 mark[data-hydor-hl="${list[0].id}"]').title`), 'second one');
      assert.equal(await ev(`document.querySelector('#p2 b mark[data-hydor-hl="${list[1].id}"]') !== null || document.querySelector('#p2 mark[data-hydor-hl="${list[1].id}"]')?.closest('b') !== null`), true, 'the one in bold');
      assert.equal(await marked(list[2].id), 'lazy dog| and keeps');
      assert.equal(await ev(`document.querySelector('mark[data-hydor-hl="${list[6].id}"]').closest('p').id`), 'p1', 'the one before “jumps over the lazy”');
      assert.equal(await bodyText(), text0);
      // Again: nothing is marked twice.
      const again = await ev<{ ids: string[] }>(applyScript(list));
      assert.equal(again.ids.length, 4);
      assert.equal(await ev<number>(`document.querySelectorAll('mark[data-hydor-hl="${list[0].id}"]').length`), 1);
      await ev(noteScript(list[0].id, ''));
      assert.equal(await ev(`document.querySelector('mark[data-hydor-hl="${list[0].id}"]').hasAttribute('title')`), false);
      for (const h of list) await ev(removeScript(h.id));
      assert.equal(await ev<number>(`document.querySelectorAll('mark.hydor-hl').length`), 0);
    });

    await check('page: content that came late is marked by a later pass; scrolling to a highlight finds it', async () => {
      const h = { id: 'bbbbbbbb-0000-0000-0000-000000000001', text: 'content that arrived late', prefix: '', suffix: '', note: '' };
      await send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(PAGE.replace(', 300);', ', 700);'))}` });
      await wait(250);
      assert.deepEqual((await ev<{ ids: string[]; missing: string[] }>(applyScript([h]))).missing, [h.id], 'not there yet');
      await wait(700);
      const r = await ev<{ ids: string[]; shown: boolean }>(applyScript([h], h.id));
      assert.deepEqual(r.ids, [h.id]);
      assert.equal(r.shown, true);
      assert.equal(await ev<boolean>(scrollScript(h.id)), true);
      assert.equal(await ev<boolean>(scrollScript('bbbbbbbb-0000-0000-0000-00000000ffff')), false);
    });
  } finally {
    cdp.close();
    try {
      proc.kill('SIGKILL');
    } catch {}
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

void main().then(() => process.exit(process.exitCode ?? 0));
