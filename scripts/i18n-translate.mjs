#!/usr/bin/env node
// Batch translation with the Claude Code CLI (`claude -p`): the app's dictionary (ui), the Help guide (guide) and any
// flat file of English strings such as the website's (json). Chunks are translated in parallel, checked, retried with
// the problems stated, cached as they finish (a rerun reuses them) and written in the shape the app reads.
//
//   node scripts/i18n-translate.mjs ui    --lang es,fr,ja,pt [--jobs 8] [--model sonnet] [--effort low] [--limit N] [--dry-run]
//   node scripts/i18n-translate.mjs guide --lang es,fr,ja,pt [--topics 04-projects,22-ask-agents] [--force] [--limit N] [--dry-run]
//   node scripts/i18n-translate.mjs json  --in website/i18n/strings.json --out website/i18n --lang de,zh,el,es,fr,ja,pt [--force] [--limit N]
//
// --limit N: at most N chunks per language (for tests). --dry-run: count what is left and call nothing.
// --work <dir>: the cache and the log (default /tmp/hydor-i18n-work). Per-language style and glossary: scripts/i18n-style/<lang>.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundled = await build({
  stdin: {
    contents: "export { keepsValues } from './shared/translate.ts'; export { AGENT_TOPICS, topicId, parseTopic, translatedTopic } from './shared/guide.ts'; export { LANGS } from './shared/i18n.ts'; export { combineLanguageCatalogs, isLanguageSupplement } from './shared/language-catalog.ts';",
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { keepsValues, AGENT_TOPICS, topicId, parseTopic, translatedTopic, LANGS, combineLanguageCatalogs, isLanguageSupplement } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

// ---- arguments ----------------------------------------------------------------------------------------------------

const MODE = process.argv[2];
const args = {};
for (let i = 3; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) die(`unexpected argument ${a}`);
  const name = a.slice(2);
  if (['force', 'dry-run'].includes(name)) args[name] = true;
  else args[name] = process.argv[++i];
}
function die(msg) {
  console.error(msg);
  process.exit(1);
}
if (!['ui', 'guide', 'json'].includes(MODE)) die('usage: i18n-translate.mjs ui|guide|json --lang es,fr,ja,pt [options] (see the top of this file)');
const langs = (args.lang ?? '').split(',').filter(Boolean);
if (!langs.length) die('--lang is needed (es,fr,ja,pt)');
for (const l of langs) {
  if (!LANGS.some((x) => x.id === l && l !== 'en')) die(`unknown language ${l}`);
  if (!fs.existsSync(path.join(root, 'scripts/i18n-style', `${l}.md`))) die(`scripts/i18n-style/${l}.md is missing`);
}
const JOBS = Number(args.jobs ?? 8);
const MODEL = args.model ?? 'sonnet';
const EFFORT = args.effort ?? 'low';
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const FORCE = !!args.force;
const DRY = !!args['dry-run'];
const WORK = path.resolve(args.work ?? '/tmp/hydor-i18n-work');
const PROMPT_VERSION = 'v2';

const english = (l) => LANGS.find((x) => x.id === l).english;
const style = (l) => fs.readFileSync(path.join(root, 'scripts/i18n-style', `${l}.md`), 'utf8').trim();
const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);
const words = (s) => s.split(/\s+/).filter(Boolean).length;
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 24);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (n) => `$${n.toFixed(3)}`;
const fill = (text, lang) => text.split('{LANGUAGE}').join(english(lang)).split('{STYLE}').join(style(lang));

// ---- prompts (verbatim) -------------------------------------------------------------------------------------------

const UI_INTRO = `You translate the interface of Hydor from English into {LANGUAGE}. Hydor is a desktop and web app where people work with AI agents (Claude Code, Codex and others): sessions (conversations with an agent), projects, a Library of the pages, slides, documents and spreadsheets agents make, apps, scheduled tasks, memory, a terminal, files and a web browser. Many of its users are not programmers, so its English is plain and friendly: write the way a native {LANGUAGE} interface writer would, in the same plain, friendly tone.`;
const SITE_INTRO = `You translate the website of Hydor (hydor.app) from English into {LANGUAGE}. Hydor is a free, open-source desktop and web app where people work with AI agents (Claude Code, Codex or any model), with one memory for all of them. The site's copy is warm, clear and plain; headlines may be adapted so they work in {LANGUAGE} (keep their meaning), not translated word for word. Inline tags such as <0>…</0> wrap words that are links or emphasis: keep every tag, around the words that correspond.`;
const UI_RULE4 = `4. Each item is [id, English, where]. "where" is the source file, which tells you the part of the app (web/src/features/pages/slides/… is the slides editor; server/… is text the server sends), or "part: …", the editor the word is shown in, with its meaning there.`;
const SITE_RULE4 = `4. Each item is [id, English, note]; the note, when given, says where it appears.`;
const uiPrompt = (intro, rule4) => `${intro}

{STYLE}

Rules:
1. Placeholders ({0}, {1}, {n}, {name}…) stay exactly as written, as many times as in the English; move them to where {LANGUAGE} needs them. A placeholder glued to the end of an English word ("{0} file{1}", "session{1}") only adds the English plural ending (s or nothing): leave that one out and write a form that reads right for any count.
2. Keep as they are: product and brand names (Hydor, Naget, Claude, Claude Code, Codex, ChatGPT, OpenAI, Anthropic, Gemini, GitHub, OpenRouter, Ollama, Telegram…), the agent named Custom, code, commands, file names and paths, web addresses, keyboard keys and shortcuts (Ctrl+K, ⌘K, Enter, Esc, Shift, Tab), units, and Markdown or HTML markup.
3. Keep the same leading and trailing spaces and the same line breaks: a tooltip of several lines is translated line by line.
${rule4}
5. A button or menu item is a command; a heading or a setting's name is a noun phrase. Use the glossary, and one translation per concept everywhere.
6. Some items are search keywords: a line of lowercase words without punctuation ("theme dark mode light colours"). Translate them as a line of words people would type in {LANGUAGE}, and keep the English words people may type too (names, technical words).
7. An item with nothing to translate (only placeholders, symbols, code or names) comes back unchanged.
Answer with only one JSON object that maps every id to its translation.`;
const GUIDE_PROMPT = `You translate part of the Hydor guide (the app's Help pages) from English into {LANGUAGE}. Hydor is a desktop and web app where people work with AI agents (Claude Code, Codex and others). Write natural, plain {LANGUAGE} for people who are not programmers, the way a native technical writer would, addressing the reader as the style below says.

{STYLE}

Rules:
1. Keep the Markdown structure exactly: the same headings, at the same levels and in the same order (translate their words), the same lists, tables, quotes, bold and italics.
2. Links and pictures: translate the text in [ ] (and a picture's description), and keep every address in ( ) exactly as it is, in the same order. Never add, drop or change a link.
3. Bold text that names something on screen must read exactly as the app shows it in {LANGUAGE}: the On-screen labels list gives the app's own translation of the labels in this part; use those exactly, in bold. Labels joined by → are a path through the app. Every other bold word or phrase (a term being explained, such as **session**, or an emphasis) is translated like the rest of the text and stays bold: never leave English words in the text unless they are names or code.
4. Code (inline and fenced), commands, file names, paths, keyboard shortcuts and product names stay as they are.
5. Examples of what to ask an agent are translated, as someone would type them in {LANGUAGE}.
Answer with only the translated Markdown, nothing before or after it.`;

// ---- the model ----------------------------------------------------------------------------------------------------

const CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-translate-cwd-'));
process.on('exit', () => fs.rmSync(CWD, { recursive: true, force: true }));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
fs.mkdirSync(WORK, { recursive: true });
const LOG = path.join(WORK, 'log.jsonl');
const costs = Object.fromEntries(langs.map((l) => [l, 0]));
const failures = []; // { lang, mode, what, problem }

let running = 0;
const waiting = [];
async function slot() {
  if (running >= JOBS) await new Promise((r) => waiting.push(r));
  running++;
}
function release() {
  running--;
  waiting.shift()?.();
}

/** Every worker waits while this is in the future (a usage limit was hit). */
let pausedUntil = 0;
const LIMIT_RE = /usage limit|rate.?limit|limit reached|limit will reset|resets? at|quota|too many requests/i;

function runClaude(system, user) {
  return new Promise((resolve) => {
    const child = spawn(
      'claude',
      ['-p', '--model', MODEL, '--effort', EFFORT, '--system-prompt', system, '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--output-format', 'json'],
      { cwd: CWD, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 20 * 60e3);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: String(e) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(user);
  });
}

/** One model call with retries: { text, cost, usage, secs }. Throws when it cannot get an answer. */
async function callModel(meta, system, user) {
  let failed = 0;
  let limitWaits = 0;
  for (;;) {
    while (Date.now() < pausedUntil) await sleep(Math.min(pausedUntil - Date.now(), 30e3));
    await slot();
    const t0 = Date.now();
    let r;
    try {
      r = await runClaude(system, user);
    } finally {
      release();
    }
    const secs = (Date.now() - t0) / 1000;
    let json = null;
    try {
      json = JSON.parse(r.out);
    } catch {}
    const text = typeof json?.result === 'string' ? json.result : '';
    const ok = r.code === 0 && json && !json.is_error && text.trim() !== '';
    const cost = Number(json?.total_cost_usd) || 0;
    costs[meta.lang] += cost;
    const usage = json?.usage ? { in: (json.usage.input_tokens ?? 0) + (json.usage.cache_read_input_tokens ?? 0) + (json.usage.cache_creation_input_tokens ?? 0), out: json.usage.output_tokens ?? 0 } : null;
    fs.appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...meta, cost, tokens: usage, seconds: Math.round(secs * 10) / 10, ok: !!ok }) + '\n');
    if (ok) return { text, cost, usage, secs };
    const why = `${text} ${r.err} ${r.out}`.slice(0, 600).replace(/\s+/g, ' ').trim() || `exit ${r.code}`;
    if (LIMIT_RE.test(why)) {
      if (++limitWaits > 6) throw new Error(`usage limit: gave up after 6 waits (${why.slice(0, 160)})`);
      if (pausedUntil < Date.now()) {
        pausedUntil = Date.now() + 10 * 60e3;
        console.error(`usage limit hit: pausing all workers for 10 minutes (${limitWaits}/6) — ${why.slice(0, 160)}`);
      }
      continue;
    }
    if (failed >= 3) throw new Error(`call failed: ${why.slice(0, 300)}`);
    await sleep([20, 60, 120][failed++] * 1000);
  }
}

// ---- checks -------------------------------------------------------------------------------------------------------

/** French spacing outside backticks: a no-break space before ; : ! ? that ends a word or the string, and inside « ». */
function frenchSpacing(s) {
  return s
    .split(/(`[^`]*`)/)
    .map((seg, i) =>
      i % 2
        ? seg
        : seg
            .replace(/([^\s+;:!?])[  ]?([;:!?])(?=\s|$)/g, '$1 $2')
            .replace(/«[  ]*/g, '« ')
            .replace(/[  ]*»/g, ' »'),
    )
    .join('');
}

const tagsOf = (s) => (s.match(/<\/?[A-Za-z0-9]+[^<>]*?\/?>/g) ?? []).sort().join('|');
const nl = (s) => (s.match(/\n/g) ?? []).length;
/** Nothing to translate: no letters at all (only placeholders' braces, digits, symbols). */
const trivial = (en) => !/\p{L}/u.test(en);

/** { value } for a good translation (with the English's own leading and trailing space), else { problem }. */
function checkItem(en, tr, { lang, tags }) {
  if (typeof tr !== 'string' || !tr.trim()) return { problem: 'missing or empty' };
  const core = en.trim();
  let t = tr.trim();
  if (!keepsValues(en, t)) return { problem: `placeholders differ: the English has ${(en.match(/\{\d+\}/g) ?? []).join(' ') || 'none'}, your text has ${(t.match(/\{\d+\}/g) ?? []).join(' ') || 'none'}` };
  if (nl(t) !== nl(core)) return { problem: `it has ${nl(t)} line break(s), the English has ${nl(core)}: keep the same line breaks` };
  if (tags && tagsOf(core) !== tagsOf(t)) return { problem: `the tags differ: the English has ${tagsOf(core) || 'none'}, your text has ${tagsOf(t) || 'none'}` };
  if (lang === 'fr') t = frenchSpacing(t);
  return { value: /^\s*/.exec(en)[0] + t + /\s*$/.exec(en)[0] };
}

function parseObject(text) {
  let s = text.trim().replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  for (const cand of [s, s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)]) {
    try {
      const o = JSON.parse(cand);
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch {}
  }
  return null;
}

// ---- item translation (ui and json) -------------------------------------------------------------------------------

const rowsText = (items) => '[\n' + items.map((i) => JSON.stringify([i.id, i.english, i.where])).join(',\n') + '\n]';

/** Chunks of at most 300 items or 3,500 English words, in order. */
function chunkItems(items) {
  const chunks = [];
  let cur = [];
  let w = 0;
  for (const it of items) {
    const iw = words(it.english);
    if (cur.length && (cur.length >= 300 || w + iw > 3500)) {
      chunks.push(cur);
      cur = [];
      w = 0;
    }
    cur.push(it);
    w += iw;
  }
  if (cur.length) chunks.push(cur);
  return chunks.map((c) => c.map((it, i) => ({ ...it, id: String(i + 1) })));
}

/** Translates a chunk: the good ones { key → value }, and the bad ones [{ key, problem }] after up to 2 follow-ups. */
async function translateChunk({ lang, mode, n, system, items, tags }) {
  const good = {};
  let spent = 0;
  let pending = items;
  const problems = {};
  let lastError = '';
  for (let attempt = 0; attempt <= 2 && pending.length; attempt++) {
    let user = rowsText(pending);
    if (attempt) {
      user = `Some of your translations had problems. Translate these items again, fixing the problem stated for each id, and keep the same ids.\n\n${user}\n\nProblems:\n${JSON.stringify(Object.fromEntries(pending.map((i) => [i.id, problems[i.id]])), null, 2)}`;
    }
    let res;
    try {
      res = await callModel({ mode, lang, chunk: n, attempt }, system, user);
    } catch (e) {
      lastError = String(e.message ?? e);
      break;
    }
    spent += res.cost;
    const obj = parseObject(res.text);
    const next = [];
    for (const it of pending) {
      const r = obj ? checkItem(it.english, obj[it.id], { lang, tags }) : { problem: 'the answer was not one JSON object' };
      if (r.value !== undefined) good[it.key] = r.value;
      else {
        problems[it.id] = `${r.problem}${typeof obj?.[it.id] === 'string' ? ` (you wrote: ${JSON.stringify(obj[it.id]).slice(0, 200)})` : ''}`;
        next.push(it);
      }
    }
    pending = next;
  }
  return { good, spent, bad: pending.map((it) => ({ key: it.key, problem: lastError || problems[it.id] })) };
}

/**
 * Translates `todo` (items { key, english, where }) for one language: chunks run in parallel, each appended to `cacheFile` as
 * it finishes. Returns the number of items still not translated (failed or beyond --limit).
 */
async function runItems({ lang, mode, todo, cacheFile, system, tags }) {
  const chunks = chunkItems(todo);
  const selected = chunks.slice(0, LIMIT);
  let finished = 0;
  const bad = [];
  await Promise.all(
    selected.map(async (items, i) => {
      const t0 = Date.now();
      const { good, spent, bad: b } = await translateChunk({ lang, mode, n: i + 1, system, items, tags });
      const lines = Object.entries(good).map(([k, v]) => JSON.stringify({ k, v }));
      if (lines.length) fs.appendFileSync(cacheFile, lines.join('\n') + '\n');
      bad.push(...b);
      finished++;
      console.log(`${lang} ${mode} ${finished}/${selected.length} ${money(spent)} ${Math.round((Date.now() - t0) / 1000)}s${b.length ? ` (${b.length} left out)` : ''}`);
    }),
  );
  for (const b of bad) failures.push({ lang, mode, what: b.key, problem: b.problem });
  return { skipped: chunks.length - selected.length, bad: bad.length };
}

const readCache = (file) => {
  const out = {};
  if (fs.existsSync(file))
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const { k, v } = JSON.parse(line);
        if (typeof k === 'string' && typeof v === 'string') out[k] = v;
      } catch {}
    }
  return out;
};

const dry = (lang, mode, items) => {
  const chunks = chunkItems(items);
  console.log(`${lang} ${mode}: ${items.length} items left in ${chunks.length} chunks, ${items.reduce((a, i) => a + words(i.english), 0)} English words${Number.isFinite(LIMIT) ? ` (--limit ${LIMIT}: ${Math.min(LIMIT, chunks.length)} would run)` : ''}`);
};

/** The trivial items (no letters) are their own translation: add them to the cache. */
function addTrivial(items, done, cacheFile) {
  const t = items.filter((i) => trivial(i.english) && !(i.key in done));
  if (!t.length) return;
  for (const i of t) done[i.key] = i.english;
  if (!DRY) fs.appendFileSync(cacheFile, t.map((i) => JSON.stringify({ k: i.key, v: i.english })).join('\n') + '\n');
}

const formatJson = (obj) => JSON.stringify(obj, null, 2) + '\n';

/**
 * Adds entries at the end of a dictionary file and leaves the rest of its text as it is: the dictionaries mix two
 * layouts, and rewriting them whole would change every line (and every other branch's edits would conflict).
 */
function appendEntries(file, entries) {
  const had = readJson(file, {});
  if (!fs.existsSync(file) || !Object.keys(had).length) return fs.writeFileSync(file, formatJson(Object.fromEntries(entries)));
  if (!entries.length) return;
  const text = fs.readFileSync(file, 'utf8').replace(/\s*\}\s*$/, '');
  fs.writeFileSync(file, `${text},\n${entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`);
}

// ---- mode ui ------------------------------------------------------------------------------------------------------

const PARTS = {
  media: 'picture, video and sound editors',
  slides: 'the slides editor',
  doc: 'documents',
  sheet: 'spreadsheets',
  tex: 'LaTeX',
  notebook: 'notebooks',
  pages: 'Studio',
  design: 'the design editor',
  diagram: 'the diagram editor',
  board: 'the board editor',
  browser: 'the web browser',
  agents: 'the Agents page',
  jobs: 'the Jobs page: long computing work running in the background, such as builds and training runs, never employment',
};
const PART_RE = /^([a-z]+)::/;

function uiKeys() {
  const sources = readJson(path.join(root, 'web/src/i18n/strings.json'), {});
  const items = Object.entries(sources)
    .map(([key, file], i) => ({ key, english: key.replace(PART_RE, ''), where: String(file), i }))
    .sort((a, b) => (a.where < b.where ? -1 : a.where > b.where ? 1 : a.i - b.i));
  const known = new Set(Object.keys(sources));
  const parts = [];
  for (const l of ['de', 'zh', 'el'])
    for (const key of Object.keys(readJson(path.join(root, `web/src/i18n/${l}.json`), {}))) {
      const m = PART_RE.exec(key);
      if (m && !known.has(key)) {
        known.add(key);
        parts.push({ key, english: key.slice(m[0].length), where: `part: ${m[1]}${PARTS[m[1]] ? ` (${PARTS[m[1]]})` : ''}`, part: m[1], i: parts.length });
      }
    }
  parts.sort((a, b) => (a.part < b.part ? -1 : a.part > b.part ? 1 : a.i - b.i));
  return [...items, ...parts].filter((i) => i.english.trim());
}

async function modeUi() {
  const all = uiKeys();
  const system = (lang) => fill(uiPrompt(UI_INTRO, UI_RULE4), lang);
  await Promise.all(
    langs.map(async (lang) => {
      const file = path.join(root, `web/src/i18n/${lang}.json`);
      const existing = readJson(file, {});
      const cacheFile = path.join(WORK, `${lang}.ui.jsonl`);
      const done = { ...readCache(cacheFile), ...existing };
      addTrivial(all, done, cacheFile);
      const todo = all.filter((i) => !(i.key in done));
      if (DRY) return dry(lang, 'ui', todo);
      if (todo.length) await runItems({ lang, mode: 'ui', todo, cacheFile, system: system(lang), tags: false });
      const now = { ...readCache(cacheFile), ...existing };
      if (all.some((i) => !(i.key in now))) return console.log(`${lang} ui: not complete (${all.filter((i) => !(i.key in now)).length} keys left); ${path.relative(root, file)} not written`);
      const keySet = new Set(all.map((i) => i.key));
      const added = Object.keys(now).filter((k) => !(k in existing) && keySet.has(k)).sort();
      if (added.length || !fs.existsSync(file)) {
        appendEntries(file, added.map((k) => [k, now[k]]));
        console.log(`${lang} ui: wrote ${path.relative(root, file)} (${Object.keys(existing).length + added.length} entries, ${added.length} new)`);
      }
    }),
  );
}

// ---- mode json ----------------------------------------------------------------------------------------------------

async function modeJson() {
  if (!args.in || !args.out) die('json mode needs --in <file> and --out <dir>');
  const src = readJson(path.resolve(args.in), null);
  if (!src) die(`cannot read ${args.in}`);
  const items = Object.entries(src)
    .map(([key, v]) => ({ key, english: typeof v === 'string' ? v : String(v?.text ?? ''), where: typeof v === 'object' && v?.note ? String(v.note) : '' }))
    .filter((i) => i.english.trim());
  const outDir = path.resolve(args.out);
  const base = path.basename(args.in).replace(/\.json$/, '');
  await Promise.all(
    langs.map(async (lang) => {
      const file = path.join(outDir, `${lang}.json`);
      const existing = readJson(file, {});
      const cacheFile = path.join(WORK, `${lang}.json-${base}.jsonl`);
      const done = FORCE ? {} : { ...readCache(cacheFile), ...existing };
      addTrivial(items, done, cacheFile);
      const todo = items.filter((i) => !(i.key in done));
      if (DRY) return dry(lang, 'json', todo);
      if (todo.length) await runItems({ lang, mode: 'json', todo, cacheFile, system: fill(uiPrompt(SITE_INTRO, SITE_RULE4), lang), tags: true });
      const cached = readCache(cacheFile);
      const out = { ...existing };
      const had = new Set(FORCE ? [] : Object.keys(existing));
      let changed = 0;
      for (const i of items) {
        const fresh = (FORCE || !had.has(i.key)) && i.key in cached;
        if (fresh && out[i.key] !== cached[i.key]) {
          out[i.key] = cached[i.key];
          changed++;
        }
      }
      const left = items.filter((i) => !(i.key in out)).length;
      if (changed || !fs.existsSync(file)) {
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(file, formatJson(out));
      }
      console.log(`${lang} json: ${changed} written to ${path.relative(process.cwd(), file)}${left ? `, ${left} still without a translation` : ''}`);
    }),
  );
}

// ---- mode guide ---------------------------------------------------------------------------------------------------

const FENCE = /^\s*(```|~~~)/;
const linksOf = (md) => [...md.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
const fencesIn = (md) => md.split('\n').filter((l) => FENCE.test(l)).length;
const headingLevels = (md) => {
  const out = [];
  let fence = false;
  for (const line of md.split('\n')) {
    if (FENCE.test(line)) fence = !fence;
    else if (!fence) {
      const h = /^(#{1,6})\s+\S/.exec(line);
      if (h) out.push(h[1].length);
    }
  }
  return out;
};

/** Units of a topic: its start (title and intro) and each `## ` section; one over ~4,000 words is cut further before `### `. */
function guideChunks(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const cutBefore = (from, to, re) => {
    const cuts = [from];
    let fence = false;
    for (let i = from; i < to; i++) {
      if (FENCE.test(lines[i])) fence = !fence;
      else if (!fence && i > from && re.test(lines[i])) cuts.push(i);
    }
    cuts.push(to);
    return cuts;
  };
  const top = cutBefore(0, lines.length, /^## /);
  const units = [];
  for (let k = 0; k + 1 < top.length; k++) {
    const text = lines.slice(top[k], top[k + 1]).join('\n');
    if (words(text) > 4000) {
      const sub = cutBefore(top[k], top[k + 1], /^### /);
      for (let j = 0; j + 1 < sub.length; j++) units.push(lines.slice(sub[j], sub[j + 1]).join('\n'));
    } else units.push(text);
  }
  const chunks = [];
  let cur = [];
  let w = 0;
  for (const u of units) {
    const uw = words(u);
    if (cur.length && w + uw > 2500) {
      chunks.push(cur.join('\n'));
      cur = [];
      w = 0;
    }
    cur.push(u);
    w += uw;
  }
  if (cur.length) chunks.push(cur.join('\n'));
  return chunks.map((c) => c.replace(/^\n+|\s+$/g, ''));
}

/** The app's dictionary for a language, as the runtime builds it (supplements merged), plus what ui has translated so far. */
function dictionary(lang) {
  const dir = path.join(root, 'web/src/i18n');
  const base = readJson(path.join(dir, `${lang}.json`), {});
  const supplements = fs
    .readdirSync(dir)
    .filter((n) => isLanguageSupplement(n, lang))
    .map((n) => [n, readJson(path.join(dir, n), {})]);
  return combineLanguageCatalogs(combineLanguageCatalogs(base, supplements), [['cache', readCache(path.join(WORK, `${lang}.ui.jsonl`))]]);
}

/** The languages' own names, as the language menu shows them in every language. */
const NATIVE_NAMES = new Set(LANGS.map((l) => l.name));

function labelsOf(chunk, dict, lang) {
  const plain = chunk
    .split('\n')
    .reduce(
      (acc, line) => {
        if (FENCE.test(line)) acc.fence = !acc.fence;
        else if (!acc.fence) acc.lines.push(line);
        return acc;
      },
      { fence: false, lines: [] },
    )
    .lines.join('\n')
    .replace(/`[^`\n]*`/g, '');
  const has = (k) => typeof dict[k] === 'string' && dict[k].trim() !== '';
  // A word in small letters ("session") takes the capitalised entry ("Session") with its first letter made small, as
  // the runtime does, unless the translation starts with a word that keeps its capital (German nouns, "PDF").
  const lowerFirst = (t) => (t.length > 1 && t[0] !== t[0].toLowerCase() && t[1] === t[1].toLowerCase() && lang !== 'de' ? t[0].toLowerCase() + t.slice(1) : t);
  const exact = (s) => {
    if (has(s)) return dict[s];
    const cap = s[0].toUpperCase() + s.slice(1);
    if (cap !== s && has(cap)) return lowerFirst(dict[cap]);
    return null;
  };
  const one = (s) => {
    const t = exact(s);
    if (t != null) return t;
    const m = /^(.*?)([…:,.]+|\.\.\.)$/.exec(s);
    if (m && m[1].trim()) {
      const u = exact(m[1].trim());
      if (u != null) return u + m[2];
    }
    return null;
  };
  const found = new Map();
  for (const m of plain.matchAll(/\*\*([^*\n]+?)\*\*/g)) {
    const span = m[1].trim();
    if (found.has(span)) continue;
    // The language menu shows each language by its own name, untranslated (English, Deutsch, 日本語).
    let t = NATIVE_NAMES.has(span) ? span : one(span);
    if (t == null && span.includes(' → ')) {
      const parts = span.split(' → ').map((p) => one(p.trim()));
      if (parts.every((p) => p != null)) t = parts.join(' → ');
    }
    if (t != null) found.set(span, t);
  }
  return [...found].map(([en, tr]) => `${en} → ${tr}`);
}

function checkGuideChunk(en, tr, lang) {
  const problems = [];
  const a = headingLevels(en).join(',');
  const b = headingLevels(tr).join(',');
  if (a !== b) problems.push(`The headings differ: the English has levels [${a}] in this order, your text has [${b}]. Keep every heading, at the same level.`);
  const la = linksOf(en);
  const lb = linksOf(tr);
  if (JSON.stringify(la) !== JSON.stringify(lb)) {
    const missing = la.filter((x) => !lb.includes(x));
    const extra = lb.filter((x) => !la.includes(x));
    problems.push(`The link addresses differ from the English (${la.length} expected, ${lb.length} found${missing.length ? `; missing: ${missing.slice(0, 5).join(' ')}` : ''}${extra.length ? `; not in the English: ${extra.slice(0, 5).join(' ')}` : ''}). Keep every address in ( ) exactly, in the same order.`);
  }
  if (fencesIn(en) !== fencesIn(tr)) problems.push(`The number of code fences differs: ${fencesIn(en)} in the English, ${fencesIn(tr)} in your text.`);
  const ratio = ['ja', 'zh'].includes(lang) ? 0.25 : 0.6;
  if (tr.length < ratio * en.length) problems.push(`Your text is far shorter than the English (${tr.length} against ${en.length} characters): translate all of it, leave nothing out.`);
  return problems;
}

const stripOuterFence = (s) => {
  const m = /^\s*```(?:markdown|md)\s*\n([\s\S]*?)\n```\s*$/.exec(s);
  return (m ? m[1] : s).trim();
};

async function translateGuideChunk({ lang, topic, n, system, user, en }) {
  let prev = '';
  let spent = 0;
  let problems = [];
  for (let attempt = 0; attempt <= 2; attempt++) {
    const msg = attempt ? `${user}\n\nYour previous translation of this part:\n\n<<<\n${prev}\n>>>\n\nIt had these problems:\n${problems.map((p) => `- ${p}`).join('\n')}\n\nTranslate the whole part again, fixing them. Answer with only the translated Markdown.` : user;
    const res = await callModel({ mode: 'guide', lang, chunk: `${topic}#${n}`, attempt }, system, msg);
    spent += res.cost;
    const tr = stripOuterFence(res.text);
    problems = checkGuideChunk(en, tr, lang);
    if (!problems.length) return { text: tr, spent };
    prev = tr;
  }
  return { problems, spent };
}

async function modeGuide() {
  const dir = path.join(root, 'docs/guide');
  const only = args.topics ? args.topics.split(',').map((s) => s.trim().replace(/\.md$/, '')) : null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d+-[a-z0-9-]+\.md$/.test(f) && f !== '30-settings.md' && !AGENT_TOPICS.includes(topicId(f)))
    .filter((f) => !only || only.includes(f.replace(/\.md$/, '')) || only.includes(topicId(f)))
    .sort();
  if (only) for (const o of only) if (!files.some((f) => f.replace(/\.md$/, '') === o || topicId(f) === o)) die(`no topic ${o}`);
  await Promise.all(
    langs.map(async (lang) => {
      const sys = fill(GUIDE_PROMPT, lang);
      const styleHash = sha(style(lang));
      const dict = DRY ? {} : dictionary(lang);
      const cacheDir = path.join(WORK, lang, 'guide');
      const jobs = []; // chunks to translate
      const topics = [];
      for (const f of files) {
        const md = fs.readFileSync(path.join(dir, f), 'utf8');
        const target = path.join(dir, lang, f);
        if (!FORCE && fs.existsSync(target)) {
          const t = fs.readFileSync(target, 'utf8');
          if (translatedTopic(parseTopic(f, md), f, t) && JSON.stringify(linksOf(t)) === JSON.stringify(linksOf(md))) continue;
        }
        const chunks = guideChunks(md).map((en, i) => {
          const labels = labelsOf(en, dict, lang);
          const user = `${labels.length ? `On-screen labels in this part (use exactly these, in bold):\n${labels.join('\n')}\n\n` : ''}Markdown to translate:\n\n${en}`;
          const cacheFile = path.join(cacheDir, `${f.replace(/\.md$/, '')}.${i + 1}.${sha(`${en}\n${styleHash}\n${PROMPT_VERSION}\n${labels.join('\n')}`)}.md`);
          return { f, n: i + 1, en, user, cacheFile };
        });
        topics.push({ f, md, target, chunks });
        for (const c of chunks) if (!fs.existsSync(c.cacheFile) || DRY) jobs.push(c);
      }
      if (DRY) {
        const pending = topics.flatMap((t) => t.chunks).filter((c) => !fs.existsSync(c.cacheFile));
        console.log(`${lang} guide: ${topics.length} topics to do, ${topics.flatMap((t) => t.chunks).length} chunks (${pending.length} not cached), ${pending.reduce((a, c) => a + words(c.en), 0)} English words left${Number.isFinite(LIMIT) ? ` (--limit ${LIMIT}: ${Math.min(LIMIT, pending.length)} would run)` : ''}`);
        return;
      }
      const todo = jobs.slice(0, LIMIT);
      let finished = 0;
      const failedTopics = new Map();
      await Promise.all(
        todo.map(async (c) => {
          const t0 = Date.now();
          let r;
          try {
            r = await translateGuideChunk({ lang, topic: c.f.replace(/\.md$/, ''), n: c.n, system: sys, user: c.user, en: c.en });
          } catch (e) {
            r = { problems: [String(e.message ?? e)], spent: 0 };
          }
          if (r.text) {
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(c.cacheFile, r.text + '\n');
          } else failedTopics.set(c.f, `chunk ${c.n}: ${r.problems.join(' ')}`);
          finished++;
          console.log(`${lang} guide ${finished}/${todo.length} ${c.f}#${c.n} ${money(r.spent)} ${Math.round((Date.now() - t0) / 1000)}s${r.text ? '' : ' FAILED'}`);
        }),
      );
      for (const [f, problem] of failedTopics) failures.push({ lang, mode: 'guide', what: f, problem });
      for (const t of topics) {
        if (failedTopics.has(t.f) || !t.chunks.every((c) => fs.existsSync(c.cacheFile))) continue;
        const text = t.chunks.map((c) => fs.readFileSync(c.cacheFile, 'utf8').trim()).join('\n\n') + '\n';
        const ok = translatedTopic(parseTopic(t.f, t.md), t.f, text) && JSON.stringify(linksOf(text)) === JSON.stringify(linksOf(t.md));
        if (!ok) {
          failures.push({ lang, mode: 'guide', what: t.f, problem: 'the joined topic does not match the English headings or links (guide-test would fail); nothing written' });
          continue;
        }
        fs.mkdirSync(path.dirname(t.target), { recursive: true });
        fs.writeFileSync(t.target, text);
        console.log(`${lang} guide: wrote ${path.relative(root, t.target)}`);
      }
    }),
  );
}

// ---- run ----------------------------------------------------------------------------------------------------------

await { ui: modeUi, guide: modeGuide, json: modeJson }[MODE]();

if (!DRY) {
  console.log('\nCost: ' + langs.map((l) => `${l} ${money(costs[l])}`).join(', ') + `, total ${money(Object.values(costs).reduce((a, b) => a + b, 0))}`);
  if (failures.length) {
    const file = path.join(WORK, `failed.${MODE}.json`);
    fs.writeFileSync(file, formatJson(failures));
    console.log(`\n${failures.length} left out (also in ${file}):`);
    for (const f of failures.slice(0, 40)) console.log(`  ${f.lang} ${f.mode} ${JSON.stringify(f.what).slice(0, 80)}: ${f.problem.slice(0, 200)}`);
    if (failures.length > 40) console.log(`  … and ${failures.length - 40} more`);
    process.exitCode = 1;
  }
}
