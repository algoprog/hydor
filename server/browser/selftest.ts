// A check of the browser against a small local test site: outline numbers, steps, dialogs, files in
// and out, the private-network guard (WebSockets too), extract (with a stand-in helper), find, payments,
// tabs, asking the user, taking over (clicks landing where they were made), the live view's frames, and
// the agent's pointer in it (gliding while someone watches) with the marks on the steps' pictures. Build it and run it with a scratch data folder:
//
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/selftest.ts
//   DATA_DIR=/tmp/hydor-browser-test node dist/dev/selftest.js
//
// It needs a Chromium (see chrome.ts); it starts its own and closes it at the end. With HYDOR_BROWSER_ENGINE=desktop it
// runs on the desktop app's own browser instead (desktop/scripts/browser-selftest.mjs starts the app and runs this in it).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AgentPointer } from '../../shared/pointer.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { openDb } from '../db.ts';
import { registerFeatures } from '../features/registry.ts';
import { applyScript, removeScript, selectScript } from './highlights-page.ts';
import { jpegWidth } from './jpeg.ts';
import { act, askUser, open, read, tabs, upload, type OpCtx } from './ops.ts';
import { browserOf, closeAll, GLIDE_MS, setBrowserDeps } from './session.ts';
import { setSessionOptions, setBrowserSettings } from './settings.ts';
import { pickChrome } from './chrome.ts';
import { DESKTOP_CHROME } from '../../shared/browser.ts';
import { jpegLayout } from './jpeg.ts';
import { browserTools } from './tools.ts';
import { readMarks, stepFile } from './steps.ts';

if (!process.env.DATA_DIR) throw new Error('Set DATA_DIR to a scratch folder');
const KEY = 'claude:selftest';
/** Whether this runs on the desktop app's own browser (Electron), which cannot do everything Chrome can. */
const DESKTOP = process.env.HYDOR_BROWSER_ENGINE === 'desktop';
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-browser-cwd-'));
fs.writeFileSync(path.join(cwd, 'resume.txt'), 'my resume');
const outside = path.join(os.tmpdir(), `hydor-outside-${process.pid}.txt`);
fs.writeFileSync(outside, 'secret');

// ---- the test site, and a "private" server the guard must keep pages away from ----
let secretHits = 0;
const secret = http.createServer((_req, res) => {
  secretHits++;
  res.end('secret');
});
// A WebSocket reaching it counts too (CDP's request guard never sees those).
secret.on('upgrade', (_req, socket) => {
  secretHits++;
  socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
});
const page = (title: string, body: string) => `<!doctype html><html><head><title>${title}</title><meta name="viewport" content="width=device-width"></head><body style="font:16px sans-serif">${body}</body></html>`;
let secretPort = 0;
const site = http.createServer((req, res) => {
  const u = new URL(req.url ?? '/', 'http://x');
  const html = (t: string, b: string) => (res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page(t, b)));
  switch (u.pathname) {
    case '/form':
      return html(
        'Sign up',
        `<h1>Sign up</h1><p>Fill in the form below.</p><form action="/done" method="get">
          <label>Name <input name="name"></label><br>
          <label>Email <input name="email" type="email" placeholder="you@example.com"></label><br>
          <label>Password <input name="pw" type="password"></label><br>
          <label>Country <select name="country"><option>Greece</option><option>Canada</option><option>Japan</option></select></label><br>
          <label><input type="checkbox" name="news"> Send me news</label><br>
          <textarea name="note" aria-label="Note"></textarea><br>
          <button type="submit">Create account</button></form>
          <p><a href="/links">More links</a></p>`,
      );
    case '/done':
      return html('Welcome', `<h1>Welcome ${u.searchParams.get('name') ?? ''}</h1><p id=r>email=${u.searchParams.get('email')} country=${u.searchParams.get('country')} news=${u.searchParams.get('news') ?? 'off'} pwlen=${(u.searchParams.get('pw') ?? '').length}</p>`);
    case '/links':
      return html('Links', `<h1>Links</h1><a href="/form">The form</a> <a href="/changing" target="_blank">Changing page (new tab)</a> <a href="/file.txt">Get the file</a>${'<p>Filler text, a paragraph of it.</p>'.repeat(120)}<p>The unique phrase is purple elephant.</p><button>Far button</button>`);
    case '/changing':
      return html('Changing', `<h1>Changing</h1><button id=add onclick="const b=document.createElement('button');b.textContent='Item '+(document.querySelectorAll('.it').length+1);b.className='it';document.body.appendChild(b)">Add item</button><button onclick="history.pushState({},'','/changing/2');document.querySelector('h1').textContent='Step two'">Next step</button>`);
    case '/dialog':
      return html('Dialog', `<h1>Dialog</h1><button onclick="document.getElementById('out').textContent='confirmed: '+confirm('Delete everything?')">Delete</button><p id=out>nothing yet</p>`);
    case '/upload':
      return html('Upload', `<h1>Upload</h1><label class=pick>Choose your resume <input type=file id=f style="display:none" onchange="document.getElementById('o').textContent='picked '+this.files[0].name"></label><p id=o>none</p>`);
    case '/file.txt':
      res.writeHead(200, { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="report.txt"' });
      return res.end('the report');
    case '/private':
      return html('Private', `<h1>Reaches inward</h1><img src="http://127.0.0.1:${secretPort}/x.png"><script>fetch('http://localhost:${secretPort}/api').catch(()=>{})</script>`);
    case '/socket':
      return html('Socket', `<h1>Sockets inward</h1><p id=s>trying</p><script>for (const h of ['127.0.0.1', 'localhost', '[::1]']) { try { const w = new WebSocket('ws://' + h + ':${secretPort}/'); w.onopen = () => (document.getElementById('s').textContent = 'open ' + h); } catch {} }</script>`);
    case '/pay':
      return html('Checkout', `<h1>Checkout</h1><form action="/paid"><input autocomplete="cc-number" name="card" aria-label="Card number"><input name="cvc" aria-label="CVC"><button type=submit>Place order</button></form>`);
    case '/paid':
      return html('Paid', '<h1>Paid!</h1>');
    case '/clicks':
      return html('Clicks', `<p>Where a click lands.</p>${'<p>Filler text, a paragraph of it.</p>'.repeat(80)}<script>addEventListener('click', (e) => history.replaceState(null, '', '#' + e.clientX + ',' + e.clientY))</script>`);
    case '/article':
      return html('Article', `<h1>The answer</h1><p>The meaning of life is 42, says the book.</p><table><tr><th>Item</th><th>Price</th></tr><tr><td>Tea</td><td>3 EUR</td></tr></table>`);
    default:
      return html('Home', '<h1>Home</h1>');
  }
});

const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as { port: number }).port)));

const messages: string[] = [];
const events: { type: string }[] = [];
let ok = 0;
const check = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    ok++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').join('\n     ')}`);
    process.exitCode = 1;
  }
};

async function main() {
  const port = await listen(site);
  secretPort = await listen(secret);
  const base = `http://127.0.0.1:${port}`;
  const db = openDb(path.join(process.env.DATA_DIR!, 'test.db'));
  const sessions = {
    summary: () => ({ key: KEY, title: 'Browser test', agent: 'claude', cwd }),
    deliverOrQueue: async (_k: string, text: string) => void messages.push(text),
    timeline: async () => ({ parser: { items: [] } }),
    emit: () => true,
    on: () => sessions,
  };
  const deps = {
    app: null,
    db,
    sessions,
    scheduler: null,
    models: null,
    broadcast: () => {},
    toSubscribers: (_k: string, e: { t: string; data?: { type: string } }) => void (e.t === 'feature' && e.data && events.push(e.data)),
    publicBase: () => 'http://localhost',
  } as unknown as Deps;
  registerFeatures([], deps);
  setBrowserDeps(deps);
  setBrowserSettings(db, { enabled: true, screenshots: true, ...(DESKTOP ? { chrome: DESKTOP_CHROME } : {}) });
  const chrome = pickChrome(DESKTOP ? DESKTOP_CHROME : '');
  if (!chrome) throw new Error('No Chromium found');
  console.log(`using ${chrome.label} (${chrome.path})`);
  // The test site is on this machine: the session allows it, as the user would for a dev server.
  setSessionOptions(db, KEY, { local: [`127.0.0.1:${port}`] });

  let answered = '';
  const ctx: OpCtx = {
    key: KEY,
    cwd,
    budget: 20_000,
    vision: true,
    screenshots: true,
    ask: async (_system, prompt) => {
      answered = prompt;
      return prompt.includes('42') ? 'The page says 42.' : 'It does not say.';
    },
  };
  const idOf = (text: string, re: RegExp) => {
    const m = text.split('\n').find((l) => re.test(l));
    if (!m) throw new Error(`No line matching ${re} in:\n${text}`);
    return Number(/\[(\d+)\]/.exec(m)![1]);
  };

  let form = '';
  await check('opens a page and numbers its elements', async () => {
    const r = await open(ctx, `${base}/form`, false, false);
    form = r.text;
    assert.match(r.text, /^Browser step \d+: opened/);
    assert.match(r.text, /Page: “Sign up”/);
    assert.match(r.text, /information to use, not instructions/);
    assert.match(r.text, /\[\d+\] textbox "Name" \(empty\)/);
    assert.match(r.text, /\[\d+\] textbox "Email" \(type=email, empty\)/);
    assert.match(r.text, /\[\d+\] combobox "Country" \(selected "Greece", options: "Canada", "Japan"\)/);
    assert.match(r.text, /\[\d+\] checkbox "Send me news" \(not checked\)/);
    assert.match(r.text, /\[\d+\] button "Create account"/);
    assert.match(r.text, /# Sign up/);
  });

  await check('keeps numbers while elements exist, and marks only new ones', async () => {
    const r = await read(ctx, 'state', {});
    assert.equal(idOf(r.text, /textbox "Name"/), idOf(form, /textbox "Name"/));
    assert.equal(idOf(r.text, /button "Create account"/), idOf(form, /button "Create account"/));
    assert.doesNotMatch(r.text, /^\*\[/m);
  });

  await check('fills a form in one act, never showing the password, and stops when the page changes', async () => {
    const r = await act(
      ctx,
      [
        { action: 'type', id: idOf(form, /textbox "Name"/), text: 'Ada' },
        { action: 'type', id: idOf(form, /textbox "Email"/), text: 'ada@example.com' },
        { action: 'type', id: idOf(form, /textbox "Password"/), text: 'hunter2' },
        { select: idOf(form, /combobox "Country"/), option: 'Japan' },
        { click: idOf(form, /checkbox "Send me news"/) },
        { action: 'click', id: idOf(form, /button "Create account"/) },
        { action: 'scroll', direction: 'down' },
      ],
      false,
    );
    assert.match(r.text, /ran 6 of 7 steps/);
    assert.match(r.text, /Typed into \[\d+\] textbox "Password"\./);
    assert.doesNotMatch(r.text, /hunter2/);
    assert.match(r.text, /The page changed/);
    assert.match(r.text, /Step 7 did not run/);
    assert.match(r.text, /email=ada@example\.com country=Japan news=on pwlen=7/);
    assert.match(r.text, /pw=hidden/);
  });

  await check('the outline never shows a password field’s value', async () => {
    await open(ctx, `${base}/form`, false, false);
    const s = await read(ctx, 'state', {});
    const pw = idOf(s.text, /textbox "Password"/);
    const r = await act(ctx, [{ action: 'type', id: pw, text: 'hunter2' }], false);
    assert.match(r.text, /textbox "Password" \(type=password, filled, value hidden/);
    assert.doesNotMatch(r.text, /hunter2/);
  });

  await check('types a key from the vault on its own host only, never showing it, and hides it on the page', async () => {
    const vault: Record<string, { value: string; domains: string[] }> = {
      SITE_USER: { value: 'ada-lovelace', domains: ['127.0.0.1'] },
      SITE_PASSWORD: { value: 'vault-pw-123', domains: ['127.0.0.1'] },
      ELSEWHERE_PASSWORD: { value: 'other-pw-456', domains: ['example.com'] },
    };
    const vctx: OpCtx = { ...ctx, secret: (n) => vault[n] ?? null };
    let r = await open(vctx, `${base}/form`, false, false);
    const nameId = idOf(r.text, /textbox "Name"/);
    const pwId = idOf(r.text, /textbox "Password"/);
    r = await act(vctx, [{ action: 'type', id: pwId, secret: 'ELSEWHERE_PASSWORD' }], false);
    assert.match(r.text, /ELSEWHERE_PASSWORD may only be typed on example\.com/);
    r = await act(vctx, [{ action: 'type', id: idOf(r.text, /textbox "Note"/), secret: 'SITE_PASSWORD' }], false);
    assert.match(r.text, /not a one-line text field/);
    r = await act(vctx, [{ action: 'type', id: pwId, secret: 'NO_SUCH_KEY' }], false);
    assert.match(r.text, /no key named NO_SUCH_KEY in the vault: ask the user for it with request_secret/);
    r = await act(vctx, [{ action: 'type', id: nameId, secret: 'SITE_USER' }, { action: 'type', id: pwId, secret: 'SITE_PASSWORD' }], false);
    assert.match(r.text, /Typed SITE_USER into \[\d+\] textbox "Name"\./);
    assert.match(r.text, /textbox "Name" \(filled with SITE_USER from the vault, value hidden/);
    assert.doesNotMatch(r.text, /ada-lovelace|vault-pw-123/);
    const b = browserOf(KEY)!;
    const shown = await b.active!.onElement<string>(b.refs.get(nameId)!, "function () { return this.style.getPropertyValue('-webkit-text-security'); }");
    assert.equal(shown, 'disc');
    r = await act(vctx, [{ action: 'click', id: idOf(r.text, /button "Create account"/) }], false);
    assert.match(r.text, /# Welcome ada-lovelace/);
    assert.match(r.text, /pwlen=12/);
  });

  await check('marks elements that appeared, and stops on an in-page route change', async () => {
    let r = await open(ctx, `${base}/changing`, false, false);
    r = await act(ctx, [{ action: 'click', id: idOf(r.text, /button "Add item"/) }], false);
    assert.match(r.text, /^\*\[\d+\] button "Item 1"/m);
    assert.match(r.text, /^\[\d+\] button "Add item"/m);
    r = await act(ctx, [{ action: 'click', id: idOf(r.text, /button "Next step"/) }, { action: 'wait', seconds: 1 }], false);
    assert.match(r.text, /The page changed \(now .*\/changing\/2\)/);
    assert.match(r.text, /# Step two/);
  });

  await check('a dialog goes to the user, and the agent hears the answer', async () => {
    let r = await open(ctx, `${base}/dialog`, false, false);
    r = await act(ctx, [{ action: 'click', id: idOf(r.text, /button "Delete"/) }], false);
    assert.match(r.text, /confirm dialog: “Delete everything\?”/);
    const b = browserOf(KEY)!;
    assert.equal(b.view().dialog?.message, 'Delete everything?');
    const before = messages.length;
    await b.answerDialog(true);
    assert.match(messages[before] ?? '', /answered OK/);
    r = await read(ctx, 'state', {});
    assert.match(r.text, /confirmed: true/);
  });

  await check('uploads only from the session’s folder', async () => {
    let r = await open(ctx, `${base}/upload`, false, false);
    const id = idOf(r.text, /file input/);
    assert.match(r.text, /hidden: use browser_upload/);
    const bad = await upload(ctx, id, [outside]);
    assert.match(bad.text, /not a file in the session’s folder/);
    r = await upload(ctx, id, ['resume.txt']);
    assert.match(r.text, /attached resume\.txt/);
    assert.match(r.text, /picked resume\.txt/);
  });

  await check('downloads land in the session’s folder', async () => {
    let r = await open(ctx, `${base}/links`, false, false);
    r = await act(ctx, [{ action: 'click', id: idOf(r.text, /link "Get the file"/) }, { action: 'wait', seconds: 1 }], false);
    const file = path.join(cwd, 'downloads', 'report.txt');
    for (let i = 0; i < 40 && !fs.existsSync(file); i++) await new Promise((x) => setTimeout(x, 100));
    assert.equal(fs.readFileSync(file, 'utf8'), 'the report');
    r = await read(ctx, 'state', {});
    assert.match(r.text + (browserOf(KEY)!.view().downloads.map((d) => d.name).join(',') ?? ''), /report\.txt/);
  });

  await check('pages cannot reach this machine’s other servers', async () => {
    secretHits = 0;
    const r = await open(ctx, `${base}/private`, false, false);
    await new Promise((x) => setTimeout(x, 800));
    assert.equal(secretHits, 0);
    assert.match(r.text, /Blocked \d+ requests? \(.*on this machine or its network/);
  });

  await check('WebSockets cannot reach this machine’s other servers either', async () => {
    secretHits = 0;
    await open(ctx, `${base}/socket`, false, false);
    await new Promise((x) => setTimeout(x, 1500));
    assert.equal(secretHits, 0);
    const r = await read(ctx, 'text', {});
    assert.match(r.text, /trying/);
  });

  await check('opening a local address asks the user, and works once allowed', async () => {
    const r = await open(ctx, `http://127.0.0.1:${secretPort}/`, false, false);
    assert.match(r.text, /I asked the user whether this session may open 127\.0\.0\.1:\d+/);
    assert.equal(secretHits, 0);
    const b = browserOf(KEY)!;
    const ask = b.asks.find((a) => a.kind === 'local')!;
    assert.ok(ask);
    setSessionOptions(db, KEY, { local: [`127.0.0.1:${port}`, ask.text] });
    await b.answer(ask.id, 'done');
    assert.match(messages.at(-1) ?? '', /I allowed 127\.0\.0\.1:\d+/);
    const r2 = await open(ctx, `http://127.0.0.1:${secretPort}/`, false, false);
    assert.match(r2.text, /opened/);
    assert.ok(secretHits > 0);
    setSessionOptions(db, KEY, { local: [`127.0.0.1:${port}`] });
  });

  await check('extract answers from the page with the helper (a stand-in here)', async () => {
    await open(ctx, `${base}/article`, false, false);
    const r = await read(ctx, 'extract', { question: 'What is the meaning of life?' });
    assert.match(r.text, /The page says 42\./);
    assert.match(answered, /<page>[\s\S]*The meaning of life is 42[\s\S]*Tea \| 3 EUR/);
  });

  await check('highlights: marked, found again by their words and taken away in a world of the page’s own (as in your own browsing)', async () => {
    await open(ctx, `${base}/article`, false, false);
    const t = browserOf(KEY)!.active!;
    const id = '33333333-3333-3333-3333-333333333333';
    const before = await t.evaluate<string>('document.body.innerHTML');
    await t.evaluate(`(() => { const p = document.querySelector('p'); const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
    const made = await t.evaluate<{ text?: string; prefix?: string; suffix?: string; error?: string }>(selectScript(id));
    assert.equal(made.text, 'The meaning of life is 42, says the book.');
    assert.equal(await t.evaluate<number>(`document.querySelectorAll('mark.hydor-hl[data-hydor-hl="${id}"]').length`), 1);
    assert.equal(await t.evaluate(removeScript(id)), 1);
    assert.equal(await t.evaluate<string>('document.body.innerHTML'), before, 'the page is as it was');
    // Marked again from what was kept (a page that loads again).
    const again = await t.evaluate<{ ids: string[]; missing: string[] }>(applyScript([{ id, text: made.text!, prefix: made.prefix ?? '', suffix: made.suffix ?? '', note: 'n' }]));
    assert.deepEqual(again.ids, [id]);
    assert.equal(await t.evaluate<string>(`document.querySelector('mark.hydor-hl').title`), 'n');
    await t.evaluate(removeScript(id));
  });

  // Your own browsing is the desktop app's: its routes make a highlight from a tab's selection, put it back when the page
  // loads again, show it from the list and take it away.
  if (DESKTOP) {
    await check('your own browsing: a highlight made from the selection is marked again when the page loads, shown from its list, and goes with its delete', async () => {
      const { default: Fastify } = await import('fastify');
      const { HttpError } = await import('../auth.ts');
      const { browsingRoutes } = await import('./browsing.ts');
      const { BROWSING_KEY } = await import('../../shared/browser.ts');
      const app = Fastify();
      app.setErrorHandler((err: Error, _req, reply) => void reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
      browsingRoutes({ ...deps, app } as unknown as Deps);
      const call = async (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) => {
        const r = await app.inject({ method, url, ...(payload ? { payload } : {}) });
        return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : {} };
      };
      const open1 = await call('POST', '/api/browser/browsing/open', { url: `${base}/article` });
      assert.equal(open1.status, 200, JSON.stringify(open1.body));
      const mine = browserOf(BROWSING_KEY)!;
      const tab = mine.active!;
      await tab.waitLoad(5000);
      assert.ok(tab.url.endsWith('/article'), tab.url);
      const marksOn = (t: typeof tab) => t.evaluate<number>(`document.querySelectorAll('mark.hydor-hl').length`).catch(() => -1);
      const until = async (t: typeof tab, want: number, ms = 6000) => {
        for (let t0 = Date.now(); Date.now() - t0 < ms; ) {
          if ((await marksOn(t)) === want) return;
          await new Promise((r) => setTimeout(r, 100));
        }
        assert.equal(await marksOn(t), want);
      };
      // Nothing selected: said so.
      assert.equal((await call('POST', '/api/browser/browsing/highlights', { tab: tab.targetId })).status, 409);
      await tab.evaluate(`(() => { const p = document.querySelector('p'); const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
      const made = await call('POST', '/api/browser/browsing/highlights', { tab: tab.targetId });
      assert.equal(made.status, 200, JSON.stringify(made.body));
      assert.equal(made.body.highlight.text, 'The meaning of life is 42, says the book.');
      assert.equal(made.body.count, 1);
      assert.equal(await marksOn(tab), 1);
      const id = made.body.highlight.id as string;
      // The page loads again: the highlight is found and marked, by the server, without anyone asking.
      await tab.navigate(`${base}/article?utm_source=x#again`);
      await until(tab, 1);
      // Another page of the site has none.
      await tab.navigate(`${base}/links`);
      await until(tab, 0);
      // Shown from its list: the page opens (here already in the tab) and the words are marked.
      const shown = await call('POST', `/api/browser/browsing/highlights/${id}/open`);
      assert.equal(shown.status, 200, JSON.stringify(shown.body));
      const here = mine.tabs.find((t) => t.url.includes('/article'))!;
      assert.ok(here, 'its page is open');
      await until(here, 1);
      // Deleted: the marks go from the page open now.
      assert.deepEqual((await call('DELETE', `/api/browser/browsing/highlights/${id}`)).body, { removed: true });
      assert.equal(await marksOn(here), 0);
      await app.close();
    });
  }

  await check('find looks through the whole page without a model', async () => {
    await open(ctx, `${base}/links`, false, false);
    const r = await read(ctx, 'find', { text: 'purple elephant' });
    assert.match(r.text, /screens down: The unique phrase is purple elephant\./);
    const far = await read(ctx, 'find', { text: 'Far button' });
    // The step's picture shows the part on screen, even scrolled down.
    const n = Number(/Browser step (\d+)/.exec(r.text)![1]);
    const { stepFile } = await import('./steps.ts');
    assert.ok(fs.statSync(stepFile(KEY, n)!).size > 1500, 'the picture is blank');
    const id = idOf(far.text, /button "Far button"/);
    const c = await act(ctx, [{ action: 'click', id }], false);
    assert.match(c.text, /Clicked \[\d+\] button "Far button"/);
    const m = Number(/Browser step (\d+)/.exec(c.text)![1]);
    const pic = fs.readFileSync(stepFile(KEY, m)!);
    assert.ok(pic.length > 1500, 'the scrolled picture is blank');
    fs.writeFileSync(path.join(process.env.DATA_DIR!, 'scrolled-step.jpg'), pic);
  });

  await check('text reads the page in parts', async () => {
    const r = await read(ctx, 'text', { part: 1 });
    assert.match(r.text, /part 1 of \d+/);
    assert.match(r.text, /The form \(\/form\)/);
  });

  await check('a link to a new tab is followed, and tabs can be switched and closed', async () => {
    let r = await open(ctx, `${base}/links`, false, false);
    r = await act(ctx, [{ action: 'click', id: idOf(r.text, /link "Changing page \(new tab\)"/) }, { action: 'wait' }], false);
    assert.match(r.text, /A new tab opened/);
    assert.match(r.text, /Tab 2 of 2/);
    r = await tabs(ctx, 'switch', 1);
    assert.match(r.text, /Tab 1 of 2/);
    r = await tabs(ctx, 'close', 2);
    assert.match(r.text, /1\. \(current\)/);
  });

  await check('purchases are left to the user', async () => {
    let r = await open(ctx, `${base}/pay`, false, false);
    r = await act(ctx, [{ action: 'click', id: idOf(r.text, /button "Place order"/) }], false);
    assert.match(r.text, /Did not press \[\d+\] “Place order”/);
    const b = browserOf(KEY)!;
    const ask = b.asks.find((a) => a.kind === 'payment');
    assert.ok(ask);
    assert.doesNotMatch(r.text, /Paid!/);
    await b.answer(ask!.id, 'skipped');
  });

  await check('a screenshot with numbered boxes, for models that see images', async () => {
    await open(ctx, `${base}/form`, false, false);
    const r = await read(ctx, 'screenshot', {});
    assert.ok(r.images?.length === 1);
    const jpeg = Buffer.from(r.images![0].data, 'base64');
    assert.equal(jpeg[0], 0xff);
    // One interleaved scan, as models' image readers expect (the full Chromium's own JPEGs reach them garbled).
    assert.deepEqual(jpegLayout(jpeg), { frame: [1, 2, 3], scans: [[1, 2, 3]] });
    fs.writeFileSync(path.join(process.env.DATA_DIR!, 'labeled.jpg'), jpeg);
    const text = await read({ ...ctx, vision: false }, 'screenshot', {});
    assert.match(text.text, /cannot see images/);
  });

  await check('asking the user hands them the browser; the agent waits and hears back', async () => {
    const r = await askUser(ctx, 'Log in to the test site');
    assert.match(r.text, /asked the user/);
    const b = browserOf(KEY)!;
    const turned = await read(ctx, 'state', {});
    assert.match(turned.text, /The browser is the user’s until they finish/);
    const ask = b.asks.find((a) => a.kind === 'ask')!;
    await b.answer(ask.id, 'done');
    assert.match(messages.at(-1) ?? '', /^Done in the browser \(Log in to the test site\)\. The browser now shows “Sign up”/);
  });

  await check('what the user types while driving stays hidden from the agent', async () => {
    let r = await read(ctx, 'state', {});
    const b = browserOf(KEY)!;
    const field = b.refs.get(idOf(r.text, /textbox "Name"/))!;
    await b.takeOver(true);
    try {
      const t = b.active!;
      const p = await t.point(field);
      if ('error' in p) throw new Error(p.error);
      const { w, h } = t.viewport;
      await b.input([
        { t: 'mouse', type: 'down', x: p.x / w, y: p.y / h },
        { t: 'mouse', type: 'up', x: p.x / w, y: p.y / h },
        { t: 'text', text: 'my secret name' },
      ]);
      await new Promise((x) => setTimeout(x, 300));
    } finally {
      await b.takeOver(false);
    }
    r = await read(ctx, 'state', {});
    assert.match(r.text, /textbox "Name" \(filled by the user, value hidden/);
    assert.doesNotMatch(r.text, /my secret name/);
  });

  /** Types into the form's Email field (the page changes; the agent's step takes its small picture), then the widths of the live view's frames meanwhile. */
  const frameWidths = async (text: string) => {
    const email = idOf((await read(ctx, 'state', {})).text, /textbox "Email"/);
    events.length = 0;
    await act(ctx, [{ action: 'type', id: email, text }], false);
    await new Promise((x) => setTimeout(x, 800));
    return events.filter((e) => e.type === 'frame').map((e) => jpegWidth((e as unknown as { data: string }).data));
  };

  // Before any other view asks (the largest view asked for sets the size, and an ask lasts 45 seconds).
  await check('a view opened larger gets frames as large as it asks: the stream starts again at its size', async () => {
    const b = browserOf(KEY)!;
    // The folded panel's small picture starts the stream...
    await b.watch(160, 100, 'folded');
    await new Promise((x) => setTimeout(x, 600));
    const small = await frameWidths('small@example.com');
    assert.ok(small.length > 0 && small.every((w) => w > 0 && w <= 160), `the small picture's frames: ${small.join(', ')} pixels wide`);
    // ...then the panel opens up: its frames come at its size, not the small picture's stretched.
    await b.watch(800, 500, 'opened');
    await new Promise((x) => setTimeout(x, 800));
    const large = await frameWidths('large@example.com');
    assert.ok(large.length > 0 && large.every((w) => w >= 2 * Math.max(...small)), `the opened view's frames: ${large.join(', ')} pixels wide`);
  });

  await check('pictures of the page taken at the same time leave the live view’s frames as large as they were', async () => {
    const t = browserOf(KEY)!.active!;
    const before = await frameWidths('before@example.com');
    // Chromium makes the view smaller for each: taken together, the view stayed small (and the stream with it).
    await Promise.all([t.screenshot({ quality: 60, width: 160, height: 100 }), t.screenshot({ quality: 55, width: 360 }), t.screenshot({ quality: 60, width: 160, height: 100 })]);
    const after = await frameWidths('after@example.com');
    assert.ok(before.length > 0 && after.length > 0 && after.every((w) => w === Math.max(...before)), `before: ${before.join(', ')}; after: ${after.join(', ')} pixels wide`);
  });

  await check('the small pictures of the agent’s steps never show in the live view', async () => {
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) seen.push(...(await frameWidths(`step${i}@example.com`)));
    assert.ok(seen.length > 0 && seen.every((w) => w === seen[0]), `frames ${seen.join(', ')} pixels wide`);
  });

  await check('the live view streams frames while watched', async () => {
    const b = browserOf(KEY)!;
    events.length = 0;
    await b.watch(800, 500);
    await act(ctx, [{ action: 'type', id: idOf((await read(ctx, 'state', {})).text, /textbox "Email"/), text: 'frames@example.com' }], false);
    await new Promise((x) => setTimeout(x, 800));
    const frames = events.filter((e) => e.type === 'frame').length;
    assert.ok(frames >= 2, `only ${frames} frames`);
    assert.ok(events.some((e) => e.type === 'state'));
  });

  await check('the agent’s pointer shows where it acts: a glide first while someone watches (the click waits for it), then what it did', async () => {
    const b = browserOf(KEY)!;
    let r = await open(ctx, `${base}/form`, false, false);
    events.length = 0;
    await b.watch(800, 500);
    const box = idOf(r.text, /checkbox "Send me news"/);
    const t0 = Date.now();
    r = await act(ctx, [{ action: 'click', id: box }, { action: 'type', id: idOf(r.text, /textbox "Email"/), text: 'seen@example.com' }, { action: 'keys', keys: 'Tab' }], false);
    const took = Date.now() - t0;
    const shown = events.filter((e) => e.type === 'pointer').map((e) => (e as unknown as { pointer: AgentPointer }).pointer);
    assert.deepEqual(shown.map((p) => p.act), ['click', 'type', 'key']);
    assert.equal(shown[0].glide, GLIDE_MS, 'it glides to the checkbox first');
    assert.ok(took >= 2 * GLIDE_MS, `the actions waited for their glides (${took} ms)`);
    assert.ok(shown[1].box && shown[1].box.w > 0.05 && shown[1].box.h > 0.01, 'the field typed into is outlined');
    assert.equal(shown[2].keys, 'Tab');
    assert.equal(shown[2].glide, undefined, 'a key is pressed where it rests');
    // In fractions of the frame the live view shows: where the checkbox is on the page.
    const t = b.active!;
    const p = await t.point(b.refs.get(box)!);
    const f = await t.frameSize();
    if ('error' in p) throw new Error(p.error);
    assert.ok(Math.abs(shown[0].x - p.x / f.w) < 0.002 && Math.abs(shown[0].y - p.y / f.h) < 0.002, JSON.stringify({ shown: shown[0], p, f }));
    assert.deepEqual(b.view().pointer, { x: shown[1].x, y: shown[1].y }, 'it rests where it last pointed');
    // The step's picture is marked where the click landed and the field it typed into.
    const n = Number(/Browser step (\d+)/.exec(r.text)![1]);
    const marks = readMarks(stepFile(KEY, n, 'json'));
    assert.deepEqual(marks.map((m) => m.act), ['click', 'type']);
    assert.deepEqual([marks[0].x, marks[0].y], [shown[0].x, shown[0].y]);
    assert.ok(marks[1].box, 'with the field');
    // Nobody watching: nothing glides, nothing waits.
    b.watchUntil = 0;
    events.length = 0;
    const t1 = Date.now();
    await act(ctx, [{ action: 'click', id: box }], false);
    const quiet = events.find((e) => e.type === 'pointer') as unknown as { pointer: AgentPointer } | undefined;
    assert.ok(quiet && quiet.pointer.act === 'click' && quiet.pointer.glide === undefined, 'shown, without a glide');
    assert.ok(Date.now() - t1 < 2500);
  });

  await check('a click made while driving lands where it was made, the page’s scrollbar or not', async () => {
    const b = browserOf(KEY)!;
    await open(ctx, `${base}/clicks`, false, false);
    await b.takeOver(true);
    try {
      for (const [fx, fy] of [
        [0.9, 0.5],
        [0.25, 0.75],
      ]) {
        await b.input([
          { t: 'mouse', type: 'down', x: fx, y: fy },
          { t: 'mouse', type: 'up', x: fx, y: fy },
        ]);
        await new Promise((x) => setTimeout(x, 300));
        const [x, y] = (new URL(b.active!.url).hash.slice(1) || '0,0').split(',').map(Number);
        const { w, h } = b.active!.viewport;
        assert.ok(Math.abs(x - fx * w) <= 1 && Math.abs(y - fy * h) <= 1, `at ${fx},${fy} of ${w}×${h} it landed at ${x},${y}`);
      }
    } finally {
      await b.takeOver(false);
      // The form again, for the checks after.
      await open(ctx, `${base}/form`, false, false);
    }
  });

  await check('the tools take small models’ step formats', async () => {
    const tools = browserTools({ runId: 'x', key: KEY, agent: 'claude', cwd, deps } as RunCtx);
    assert.deepEqual(
      tools.map((t) => t.name),
      ['browser_open', 'browser_act', 'browser_read', 'browser_tabs', 'browser_upload', 'browser_ask_user'],
    );
    const s = await read(ctx, 'state', {});
    const r = await act(ctx, JSON.stringify([`type ${idOf(s.text, /textbox "Email"/)} small@example.com`, 'keys Tab']), false);
    assert.match(r.text, /Typed into .*small@example\.com/);
    assert.match(r.text, /Pressed Tab/);
  });

  await closeAll();
  site.close();
  secret.close();
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.rmSync(outside, { force: true });
  console.log(`\n${ok} passed${process.exitCode ? ', some failed' : ''}`);
  setTimeout(() => process.exit(), 200);
}

main().catch(async (e) => {
  console.error(e);
  await closeAll().catch(() => {});
  process.exit(1);
});
