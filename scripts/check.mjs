// `npm run check`: the type check and the tests that belong to what changed, with only the failures printed (for coding
// agents, and for people). What changed is what git says against HEAD (or `--base <ref>`'s merge-base), staged or not,
// plus new files; or the files you name. See AGENTS.md "Building and testing" and `node scripts/check.mjs --help`.
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// What else a changed file brings in, beyond the tests beside it (docs/development.md, "Testing"). Each rule says where
// it comes from; `paths` are repo-relative regexes, `defines` is a regex a changed server/*.ts file's text must hold.
const RULES = [
  { name: 'guide', from: 'AGENTS.md "Docs"', tests: ['server/guide/guide-test.ts'], paths: [/^docs\/guide\//, /^server\/guide\//], defines: /app\.(get|post|put|patch|delete)\(\s*['"`]\/api\// },
  {
    name: 'settings',
    from: 'AGENTS.md "Docs"',
    tests: ['server/guide/guide-test.ts', 'server/tui/settings-test.ts'],
    paths: [/^shared\/(find-catalog|device)\.ts$/, /^server\/tui\/settings-table\.ts$/, /^web\/src\/features\/settings\//, /^web\/src\/features\/[^/]+\/feature\.tsx$/],
  },
  {
    name: 'find',
    from: 'AGENTS.md "Search embeddings"',
    tests: ['server/find/find-test.ts'],
    paths: [/^shared\/find-catalog\.ts$/, /^server\/find\//, /^server\/apps\/templates[^/]*\.ts$/, /^server\/assistants\/builtins\.ts$/, /^skills\//, /^server\/memory\/(embed|codebook)\./],
  },
  { name: 'releases', from: 'AGENTS.md "Releases"', tests: ['server/releases/releases-test.ts'], paths: [/^package(-lock)?\.json$/, /^CHANGELOG\.md$/] },
  {
    name: 'i18n', // the tests that read the dictionaries: the translator and each language's coverage, the wiki's strings, the goal loop's
    from: 'AGENTS.md "Docs"',
    tests: ['server/language/language-test.ts', 'web/src/features/wiki/wiki-i18n-test.ts', 'server/goals/i18n-test.ts'],
    paths: [/^web\/src\/i18n\//],
  },
  { name: 'skills', from: 'docs/development.md "Testing"', tests: ['server/skillpack/tests.ts'], paths: [/^skills\//] },
  { name: 'plugins', from: 'docs/development.md "Testing"', tests: ['server/plugins/plugins-test.ts'], paths: [/^plugins\//] },
  { name: 'check', from: 'scripts/check.mjs and scripts/test.mjs', tests: ['server/check-test.ts'], paths: [/^scripts\/(check|test)\.mjs$/] },
  { name: 'agent-tools', from: 'scripts/agent-tools/README.md', tests: ['server/agent-tools-test.ts'], paths: [/^scripts\/agent-tools\//] },
];

const ROOTS = ['server', 'shared', 'web/src']; // where source files and their tests live (as scripts/test.mjs walks)
const BIG_DIR = 8; // a directory with more tests than this is narrowed to the tests named like the changed file, when there are any
const TYPE_DIRS = /^(server|shared|web\/src|scripts)\//; // tsconfig.json's "include"
const NOT_TYPED = /^scripts\/agent-tools\/(fixtures|lib\/sym\/vendor)\//; // and its "exclude": sample files for sym's tests, vendored code
const MAX_CHARS = 6000; // the most printed without --verbose
const KEEP_LOGS = 10;
const DEFAULT_CAP = '6G'; // tsc peaks at about 3.1 GB; six tests at once at about 2.2 GB (measured: see the report in the commit)

const isTestFile = (f) => /(-test|^tests|^selftest)\.ts$/.test(path.posix.basename(f));
const isTs = (f) => /\.(ts|tsx|mts|cts)$/.test(f);
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const cut = (s, n = 200) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const secs = (ms) => (ms < 9950 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------------------------------------------- pure

/** Does the type check cover anything in these files? (TypeScript, or JSON in what tsconfig.json includes.) */
export function typesRelevant(files) {
  const hit = files.filter((f) => !NOT_TYPED.test(f) && (f === 'tsconfig.json' || isTs(f) || (f.endsWith('.json') && TYPE_DIRS.test(f))));
  return hit;
}

const baseName = (t) => path.posix.basename(t).replace(/(-test|^tests|^selftest)?\.ts$/, '') || path.posix.basename(t, '.ts');
const sing = (s) => s.replace(/s$/, '');
/** Is test file `t` named for source `stem` (sheet.ts and sheet-test.ts, slides.ts and slides-editor-test.ts, pages-store.ts and pages-test.ts)? */
function related(stem, t) {
  const a = stem.toLowerCase();
  const b = baseName(t).toLowerCase();
  const eq = (x, y) => !!x && !!y && (x === y || x.startsWith(`${y}-`) || y.startsWith(`${x}-`));
  return eq(a, b) || eq(sing(a), sing(b));
}

/** The tests for one changed source file: those in its directory, else in the nearest directory above that has any. */
export function nearestTests(file, tests) {
  const stem = path.posix.basename(file).replace(/\.[^.]+$/, '');
  let dir = path.posix.dirname(file);
  for (;;) {
    const here = tests.filter((t) => path.posix.dirname(t) === dir);
    if (ROOTS.includes(dir)) {
      const named = here.filter((t) => related(stem, t));
      return { tests: named, how: `same directory as ${file}, by name`, dir, total: here.length, byName: true };
    }
    if (here.length) {
      const named = here.length > BIG_DIR ? here.filter((t) => related(stem, t)) : [];
      const own = dir === path.posix.dirname(file);
      if (named.length) return { tests: named, how: `${own ? 'same directory as' : 'nearest directory above'} ${file}, by name`, dir, total: here.length, byName: true };
      return { tests: here, how: `${own ? 'same directory as' : 'nearest directory with tests above'} ${file}`, dir, total: here.length, byName: false };
    }
    dir = path.posix.dirname(dir);
  }
}

/**
 * Changed files to tests: Map(test -> reasons). `tests` is every test file; `read(file)` the text of a file (or '').
 * `info`, when given, is filled with what the mapping left out: `narrowed` ([{ dir, kept, total }]: a directory run only
 * for the tests named like a changed file) and `unmapped` (changed source files that brought no test at all).
 */
export function mapTests(changed, tests, read = () => '', info = {}) {
  const out = new Map();
  const dirs = new Map();
  const unmapped = [];
  const add = (t, why) => {
    if (!tests.includes(t)) return false;
    const list = out.get(t) ?? out.set(t, []).get(t);
    if (!list.includes(why)) list.push(why);
    return true;
  };
  for (const f of changed) {
    let brought = 0;
    if (isTestFile(f)) brought += add(f, 'changed test file') ? 1 : 0;
    else if (ROOTS.some((r) => f.startsWith(`${r}/`)) && !f.endsWith('.md')) {
      const n = nearestTests(f, tests);
      for (const t of n.tests) brought += add(t, n.how) ? 1 : 0;
      if (n.byName) dirs.set(n.dir, n.total);
    }
    for (const r of RULES) {
      const byPath = r.paths.some((p) => p.test(f));
      const byText = !byPath && r.defines && f.startsWith('server/') && f.endsWith('.ts') && !isTestFile(f) && r.defines.test(read(f));
      if (byPath || byText) for (const t of r.tests) brought += add(t, `rule: ${r.name} (${r.from})${byText ? `, ${f} defines /api/ routes` : ''}`) ? 1 : 0;
    }
    if (!brought && isTs(f) && !isTestFile(f) && ROOTS.some((r) => f.startsWith(`${r}/`))) unmapped.push(f);
  }
  // Narrowed: some of a directory's tests run, not all (counting those another file or a rule brought).
  info.narrowed = [...dirs]
    .map(([dir, total]) => ({ dir, total, kept: [...out.keys()].filter((t) => path.posix.dirname(t) === dir).length }))
    .filter((d) => d.kept > 0 && d.kept < d.total);
  info.unmapped = unmapped;
  return out;
}

/** The clauses for the result line and --plan: what the mapping narrowed, and the files that brought no test. */
export function coverageNotes(info) {
  const notes = [];
  const n = info.narrowed ?? [];
  const shown = n.slice(0, 2).map((d) => `${d.kept} of ${d.total} tests in ${d.dir} (all: npm run check -- ${d.dir}/)`);
  if (shown.length) notes.push(`narrowed: ${shown.join('; ')}${n.length > 2 ? `; +${n.length - 2} more directories` : ''}`);
  const u = info.unmapped ?? [];
  if (u.length) notes.push(`no test maps to ${u.slice(0, 3).join(', ')}${u.length > 3 ? `, +${u.length - 3} more` : ''}`);
  return notes;
}

/** tsc's text to its errors: [{ file, line, col, code, msg }]. */
export function parseTsc(text) {
  const errors = [];
  for (const raw of stripAnsi(text).split('\n')) {
    let m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(raw);
    if (m) errors.push({ file: m[1], line: +m[2], col: +m[3], code: m[4], msg: m[5].trim() });
    else if ((m = /^error (TS\d+): (.*)$/.exec(raw))) errors.push({ file: '(project)', line: 0, col: 0, code: m[1], msg: m[2].trim() });
  }
  return errors;
}

/** The lines to print for type errors: grouped by file, at most 6 a file and 20 in all. */
export function formatTypes(errors, logPath, { maxTotal = 20, maxFile = 6 } = {}) {
  const byFile = new Map();
  for (const e of errors) (byFile.get(e.file) ?? byFile.set(e.file, []).get(e.file)).push(e);
  const lines = [`types: ${plural(errors.length, 'error')} in ${plural(byFile.size, 'file')}`];
  let shown = 0;
  for (const [file, list] of byFile)
    for (const e of list.slice(0, maxFile)) {
      if (shown >= maxTotal) break;
      lines.push(cut(e.line ? `${file}(${e.line},${e.col}): ${e.code} ${e.msg}` : `${file}: ${e.code} ${e.msg}`));
      shown++;
    }
  if (shown < errors.length) lines.push(`… ${errors.length - shown} more (full log: ${logPath})`);
  return lines;
}

/** What scripts/test.mjs printed: each test's result and time, the output of the failed ones, and its count. */
export function parseTestRun(text) {
  const clean = stripAnsi(text);
  const parts = clean.split(/^---- (\S+)\n/m);
  const results = [];
  for (const m of parts[0].matchAll(/^(ok  |FAIL) (\S+) \(([\d.]+) s\)( \(stopped after 15 min\))?$/gm)) results.push({ file: m[2], ok: m[1] === 'ok  ', secs: Number(m[3]), timedOut: !!m[4] });
  const sections = new Map();
  for (let i = 1; i < parts.length; i += 2) sections.set(parts[i], parts[i + 1].replace(/\n\n\d+ of \d+ passed[\s\S]*$/, '').trimEnd());
  const c = /(\d+) of (\d+) passed/.exec(clean);
  return { results, sections, passed: c ? Number(c[1]) : results.filter((r) => r.ok).length, total: c ? Number(c[2]) : results.length };
}

const STRONG = /^\s*(Uncaught )?AssertionError|^\s*FAIL\b|✗|^\s*not ok\b|✘ \[ERROR\]|^\s*\d+\) /;
const WEAK = /\b[A-Za-z]*Error(?: \[[A-Z_]+\])?:|Uncaught|Unhandled|Could not resolve/;
const HEADER = /^\s*(FAIL\b|✗|not ok\b|\d+\) )/;

/** The useful part of a failed test's output: the message and the top of its stack, else the last 25 lines. */
export function excerpt(text, max = 40) {
  const lines = stripAnsi(text).split('\n').map((l) => l.replace(/\s+$/, ''));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  let i = lines.findIndex((l) => STRONG.test(l));
  // else the last Error: line, as an uncaught error ends the output
  if (i < 0) i = lines.findLastIndex((l) => WEAK.test(l) && !/^\s+at /.test(l));
  if (i < 0) return lines.slice(-25).map((l) => cut(l));
  let start = i;
  for (let k = i - 1; k >= Math.max(0, i - 3); k--) if (HEADER.test(lines[k])) (start = k), (k = -1);
  const out = [];
  let frames = 0;
  for (let j = start; j < lines.length && out.length < max; j++) {
    const l = lines[j];
    if (/^\s+at /.test(l)) {
      if (/node:internal|node_modules/.test(l) || ++frames > 3) continue;
    } else frames = 0;
    if (/^Node\.js v\d/.test(l) || (!l && !out.length)) continue;
    if (/^\s*generatedMessage: /.test(l)) break; // node's dump of the error object after its stack
    out.push(cut(l));
  }
  while (out.length && !out.at(-1)) out.pop();
  return out;
}

/** The text to print for failures, shrunk until it is within `limit` (the last line always stays). */
export function fit(build, last, limit = MAX_CHARS) {
  for (const perTest of [40, 25, 12, 6, 0]) {
    const text = [...build(perTest), last].join('\n');
    if (text.length <= limit) return text;
  }
  return `${build(0).join('\n').slice(0, limit - last.length - 1)}\n${last}`;
}

/** Arguments to what to do; { error } for a usage mistake. */
export function parseArgs(argv) {
  const o = { base: null, names: [], jobs: null, typesOnly: false, testsOnly: false, all: false, plan: false, verbose: false, selftest: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--types-only') o.typesOnly = true;
    else if (a === '--tests-only') o.testsOnly = true;
    else if (a === '--all') o.all = true;
    else if (a === '--plan') o.plan = true;
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--selftest') o.selftest = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--base' || a.startsWith('--base=')) {
      const v = a === '--base' ? argv[++i] : a.slice(7);
      if (!v || v.startsWith('--')) return { error: '--base needs a branch or ref: --base main' };
      o.base = v;
    } else if (a.startsWith('--jobs=')) {
      const n = Number(a.slice(7));
      if (!Number.isInteger(n) || n < 1) return { error: `--jobs=N takes a whole number of 1 or more, not "${a.slice(7)}"` };
      o.jobs = n;
    } else if (a.startsWith('-')) return { error: `unknown option ${a}` };
    else o.names.push(a);
  }
  if (o.typesOnly && o.testsOnly) return { error: '--types-only and --tests-only together leave nothing to run' };
  return o;
}

/** Was a step killed by the memory cap? `report` is what the wrapper read from the step's cgroup. */
export function killedByCap(res, scoped) {
  if (!scoped) return false;
  if (res.report?.oom > 0) return true;
  return !res.report && (res.signal === 'SIGKILL' || res.signal === 'SIGTERM' || res.code === 137 || res.code === 143);
}

/** Keep the newest `keep` log files of `dir`. */
export function pruneLogs(dir, keep = KEEP_LOGS) {
  const logs = fs.readdirSync(dir).filter((f) => f.endsWith('.log')).sort();
  for (const f of logs.slice(0, Math.max(0, logs.length - keep))) fs.rmSync(path.join(dir, f), { force: true });
}

// ------------------------------------------------------------------------------------------------------------ selftest

async function selftest() {
  const results = [];
  const test = (name, fn) => {
    try {
      fn();
      results.push([name, null]);
    } catch (e) {
      results.push([name, e]);
    }
  };
  const many = (dir, names) => names.map((n) => `${dir}/${n}-test.ts`);
  const fake = [
    ...many('server/pages', ['pages', 'sheet-editor', 'sheet-functions', 'slides-editor', 'slides-web', 'doc-editing', 'doc-files', 'boards', 'live', 'reader']),
    'server/accounts-test.ts', 'server/auth-test.ts', 'server/files-test.ts', 'server/git-test.ts', 'server/starts-test.ts', 'server/stats-test.ts', 'server/titles-test.ts', 'server/view-test.ts', 'server/platform-test.ts', 'server/env-test.ts',
    'server/guide/guide-test.ts', 'server/find/find-test.ts', 'server/releases/releases-test.ts', 'server/tui/settings-test.ts', 'server/language/language-test.ts', 'server/goals/i18n-test.ts',
    'web/src/features/wiki/wiki-i18n-test.ts', 'server/skillpack/tests.ts', 'server/plugins/plugins-test.ts', 'server/check-test.ts', 'server/agent-tools-test.ts',
    'server/wiki/session/codex-live-test.ts', 'server/browser/selftest.ts', 'server/browser/bookmarks-test.ts',
    'server/wiki/digest/a-test.ts', 'server/mail/mail-test.ts',
    ...many('shared', ['sheet-diff', 'snap', 'zoom', 'translate-names', 'translate-values', 'file-edits', 'latex-nav', 'app-pages', 'app-estimate', 'update-progress', 'mediaedit-video-captions']),
    'web/src/components/ui-test.ts', 'web/src/lib/a-test.ts',
  ];
  const map = (files, read) => Object.fromEntries([...mapTests(files, fake, read)].map(([t, why]) => [t, why]));
  const names = (files, read) => Object.keys(map(files, read)).sort();

  test('a changed test file is itself, and nothing else', () => {
    assert.deepEqual(names(['server/pages/boards-test.ts']), ['server/pages/boards-test.ts']);
    assert.deepEqual(names(['server/skillpack/tests.ts']), ['server/skillpack/tests.ts']);
    assert.deepEqual(names(['server/browser/selftest.ts']), ['server/browser/selftest.ts']);
  });
  test('a source file in a small directory runs that directory\'s tests', () => {
    assert.deepEqual(names(['server/wiki/digest/b.ts']), ['server/wiki/digest/a-test.ts']);
    assert.deepEqual(names(['server/browser/cdp.ts']), ['server/browser/bookmarks-test.ts', 'server/browser/selftest.ts']);
    assert.match(map(['server/browser/cdp.ts'])['server/browser/selftest.ts'][0], /^same directory as server\/browser\/cdp\.ts$/);
  });
  test('a big directory is narrowed by name, and is whole when no name fits', () => {
    assert.deepEqual(names(['server/pages/sheet-editor.ts']), ['server/pages/sheet-editor-test.ts']);
    assert.deepEqual(names(['server/pages/sheet.ts']), ['server/pages/sheet-editor-test.ts', 'server/pages/sheet-functions-test.ts']);
    assert.deepEqual(names(['server/pages/slides.ts']), ['server/pages/slides-editor-test.ts', 'server/pages/slides-web-test.ts']);
    assert.deepEqual(names(['server/pages/pages-store.ts']), ['server/pages/pages-test.ts']);
    assert.equal(names(['server/pages/zzz.ts']).length, 10);
  });
  test('a file at the top of server/ or shared/ runs only the tests named for it', () => {
    assert.deepEqual(names(['server/accounts.ts']), ['server/accounts-test.ts']);
    assert.deepEqual(names(['server/nothing.ts']), []);
    assert.deepEqual(names(['shared/sheets.ts']), ['shared/sheet-diff-test.ts']);
    assert.deepEqual(names(['shared/types.ts']), []);
  });
  test('with no tests in its directory, the nearest directory above that has any', () => {
    assert.deepEqual(names(['server/wiki/digest/deep/er/x.ts']), ['server/wiki/digest/a-test.ts']);
    assert.match(map(['server/wiki/digest/deep/x.ts'])['server/wiki/digest/a-test.ts'][0], /nearest directory with tests above/);
    assert.deepEqual(names(['web/src/components/ui.tsx']), ['web/src/components/ui-test.ts']);
    assert.deepEqual(names(['web/src/App.tsx']), []);
  });
  test('a narrowed directory is said, with how to run it whole', () => {
    const info = {};
    mapTests(['server/pages/sheet-editor.ts'], fake, () => '', info);
    assert.deepEqual(info.narrowed, [{ dir: 'server/pages', total: 10, kept: 1 }]);
    assert.deepEqual(coverageNotes(info), ['narrowed: 1 of 10 tests in server/pages (all: npm run check -- server/pages/)']);
    const top = {};
    mapTests(['server/accounts.ts'], fake, () => '', top);
    assert.deepEqual(coverageNotes(top), [`narrowed: 1 of ${fake.filter((t) => path.posix.dirname(t) === 'server').length} tests in server (all: npm run check -- server/)`]);
    const whole = {};
    mapTests(['server/pages/sheet-editor.ts', 'server/pages/zzz.ts'], fake, () => '', whole);
    assert.deepEqual(whole.narrowed, [], 'another file brought the whole directory');
    const small = {};
    mapTests(['server/browser/cdp.ts'], fake, () => '', small);
    assert.deepEqual(coverageNotes(small), []);
    const many = { narrowed: [1, 2, 3].map((n) => ({ dir: `server/d${n}`, kept: 1, total: 9 })) };
    assert.match(coverageNotes(many)[0], /; \+1 more directories$/);
  });
  test('a changed source file that brings no test is said', () => {
    const info = {};
    mapTests(['shared/types.ts', 'web/src/App.tsx', 'shared/find-catalog.ts', 'README.md', 'server/pages/boards-test.ts', 'shared/sheets.ts'], fake, () => '', info);
    assert.deepEqual(info.unmapped, ['shared/types.ts', 'web/src/App.tsx']);
    assert.deepEqual(coverageNotes({ unmapped: ['shared/types.ts'] }), ['no test maps to shared/types.ts']);
    assert.equal(coverageNotes({ unmapped: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'] })[0], 'no test maps to a.ts, b.ts, c.ts, +2 more');
    assert.deepEqual(coverageNotes({ narrowed: [], unmapped: [] }), []);
  });
  test('rules: the guide, settings, search, releases, dictionaries, the developer tools', () => {
    assert.deepEqual(names(['docs/guide/12-tasks.md']), ['server/guide/guide-test.ts']);
    assert.deepEqual(names(['docs/guide/de/12-tasks.md']), ['server/guide/guide-test.ts']);
    assert.deepEqual(names(['shared/find-catalog.ts']), ['server/find/find-test.ts', 'server/guide/guide-test.ts', 'server/tui/settings-test.ts']);
    assert.deepEqual(names(['server/apps/templates-lab.ts']), ['server/find/find-test.ts']);
    assert.deepEqual(names(['server/assistants/builtins.ts']), ['server/find/find-test.ts']);
    assert.deepEqual(names(['skills/foo/SKILL.md']), ['server/find/find-test.ts', 'server/skillpack/tests.ts']);
    assert.deepEqual(names(['package.json']), ['server/releases/releases-test.ts']);
    assert.deepEqual(names(['CHANGELOG.md']), ['server/releases/releases-test.ts']);
    assert.deepEqual(names(['web/src/i18n/de.json']), ['server/goals/i18n-test.ts', 'server/language/language-test.ts', 'web/src/features/wiki/wiki-i18n-test.ts']);
    assert.deepEqual(names(['scripts/check.mjs']), ['server/check-test.ts']);
    assert.deepEqual(names(['scripts/agent-tools/bin/sym']), ['server/agent-tools-test.ts']);
    assert.deepEqual(names(['scripts/agent-tools/lib/sym/vendor/web-tree-sitter/tree-sitter.js', 'scripts/agent-tools/README.md']), ['server/agent-tools-test.ts']);
    assert.deepEqual(names(['README.md', 'docs/features.md']), []);
  });
  test('a server file that defines /api/ routes brings the guide test', () => {
    const read = (f) => (f === 'server/accounts.ts' ? "app.get('/api/accounts', async () => ({}));" : 'export const x = 1;');
    assert.deepEqual(names(['server/accounts.ts'], read), ['server/accounts-test.ts', 'server/guide/guide-test.ts']);
    assert.match(map(['server/accounts.ts'], read)['server/guide/guide-test.ts'][0], /defines \/api\/ routes/);
    assert.deepEqual(names(['server/stats.ts'], read), ['server/stats-test.ts']);
  });
  test('a test that several files bring has all the reasons', () => {
    const m = map(['server/pages/boards.ts', 'docs/guide/04-x.md']);
    assert.equal(m['server/pages/boards-test.ts'].length, 1);
    assert.equal(Object.keys(m).length, 2);
    const g = map(['server/guide/x.ts', 'docs/guide/a.md'])['server/guide/guide-test.ts'];
    assert.ok(g.some((w) => /same directory/.test(w)) && g.some((w) => /rule: guide \(AGENTS\.md "Docs"\)/.test(w)));
  });
  test('the type check runs for TypeScript and tsconfig JSON, not for Markdown or the like', () => {
    assert.equal(typesRelevant(['README.md', 'docs/guide/a.md', 'package.json', 'web/src/index.css']).length, 0);
    assert.equal(typesRelevant(['web/src/components/ui.tsx']).length, 1);
    assert.equal(typesRelevant(['web/src/i18n/de.json']).length, 1);
    assert.equal(typesRelevant(['scripts/x.mts']).length, 1);
    assert.equal(typesRelevant(['catalog/connections/a.json']).length, 0);
    assert.equal(typesRelevant(['scripts/agent-tools/fixtures/sym/ts/forms.ts', 'scripts/agent-tools/lib/sym/vendor/web-tree-sitter/tree-sitter.js']).length, 0);
  });
  test('tsc output is grouped by file, and cut at 6 a file and 20 in all', () => {
    const line = (f, n) => `${f}(${n},3): error TS2322: Type 'string' is not assignable to type 'number'.\n  Types of property are incompatible.`;
    const text = [
      ...Array.from({ length: 9 }, (_, i) => line('server/a.ts', i + 1)),
      ...Array.from({ length: 5 }, (_, i) => line('server/b.ts', i + 1)),
      ...Array.from({ length: 5 }, (_, i) => line('server/c.ts', i + 1)),
      ...Array.from({ length: 5 }, (_, i) => line('server/d.ts', i + 1)),
      'error TS18003: No inputs were found in config file.',
    ].join('\n');
    const errors = parseTsc(text);
    assert.equal(errors.length, 25);
    const out = formatTypes(errors, '/tmp/x.log');
    assert.equal(out[0], 'types: 25 errors in 5 files');
    assert.equal(out.filter((l) => l.startsWith('server/a.ts')).length, 6);
    assert.equal(out.length, 1 + 20 + 1);
    assert.equal(out[1], "server/a.ts(1,3): TS2322 Type 'string' is not assignable to type 'number'.");
    assert.equal(out.at(-1), '… 5 more (full log: /tmp/x.log)');
    assert.deepEqual(formatTypes(parseTsc(line('x.ts', 2)), 'l'), ['types: 1 error in 1 file', "x.ts(2,3): TS2322 Type 'string' is not assignable to type 'number'."]);
  });
  test('a failed test: the assertion and the top of its stack', () => {
    const out = ['ok  one', 'ok  two', 'node:assert:123', '  throw new AssertionError(obj);', '  ^', '', 'AssertionError [ERR_ASSERTION]: sheet total', '+ actual - expected', '', '+ 3', '- 4', '    at file:///a/b.js:10:5', '    at ModuleJob.run (node:internal/modules/esm/module_job:1:1)', '    at c (/x/y.js:1:1)', '    at d (/x/y.js:1:1)', '    at e (/x/y.js:1:1)', '    at f (/x/y.js:1:1)', '', 'Node.js v22.1.0'].join('\n');
    const e = excerpt(out);
    assert.equal(e[0], 'AssertionError [ERR_ASSERTION]: sheet total');
    assert.ok(e.includes('- 4'));
    assert.equal(e.filter((l) => /^\s+at /.test(l)).length, 3);
    assert.ok(!e.some((l) => /node:internal|Node\.js v/.test(l)));
  });
  test('a failed test: a FAIL line with its header, an uncaught error at the end, and the last 25 lines', () => {
    const custom = ['     ok a', 'FAIL pages are saved', '     Error: boom', '     at x (file:///a.js:1:1)'].join('\n');
    assert.deepEqual(excerpt(custom), ['FAIL pages are saved', '     Error: boom', '     at x (file:///a.js:1:1)']);
    const late = ['log: Error: this is expected', ...Array.from({ length: 30 }, (_, i) => `line ${i}`), 'TypeError: x is not a function', '    at y (/a.js:2:2)'].join('\n');
    assert.equal(excerpt(late)[0], 'TypeError: x is not a function');
    const none = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
    const e = excerpt(none);
    assert.equal(e.length, 25);
    assert.equal(e.at(-1), 'line 59');
    assert.equal(excerpt(['AssertionError: x', ...Array.from({ length: 100 }, (_, i) => `d${i}`)].join('\n')).length, 40);
    assert.ok(excerpt(`AssertionError: ${'x'.repeat(900)}`)[0].length <= 200);
  });
  test('the runner\'s output: results, failures, and the count', () => {
    const text = 'ok   server/a-test.ts (1.5 s)\nFAIL server/b-test.ts (12.0 s)\nFAIL server/c-test.ts (900.0 s) (stopped after 15 min)\n\n---- server/b-test.ts\nAssertionError: no\n\n---- server/c-test.ts\nlast words\n\n1 of 3 passed; not run here (--all runs them): selftest.ts (the network)\n';
    const r = parseTestRun(text);
    assert.deepEqual(r.results.map((x) => [x.file, x.ok, x.secs, x.timedOut]), [['server/a-test.ts', true, 1.5, false], ['server/b-test.ts', false, 12, false], ['server/c-test.ts', false, 900, true]]);
    assert.equal(r.sections.get('server/b-test.ts'), 'AssertionError: no');
    assert.equal(r.sections.get('server/c-test.ts'), 'last words');
    assert.deepEqual([r.passed, r.total], [1, 3]);
  });
  test('the printed failures fit in 6000 characters, the last line whole', () => {
    const body = (n) => Array.from({ length: 12 }, (_, t) => [`FAIL server/t${t}-test.ts (3 s)`, ...Array.from({ length: n }, (_, i) => `  ${'x'.repeat(150)} ${i}`)]).flat();
    const text = fit(body, 'check failed: 12 tests · full log: /tmp/x.log');
    assert.ok(text.length <= MAX_CHARS, String(text.length));
    assert.ok(text.endsWith('check failed: 12 tests · full log: /tmp/x.log'));
    assert.ok(text.includes('FAIL server/t0-test.ts'));
    assert.equal(fit(() => ['a'], 'b'), 'a\nb');
  });
  test('arguments: flags, --base with its ref, names, and usage errors', () => {
    const p = parseArgs(['--base', 'main', 'pages', '--plan', '--jobs=3', 'guide/']);
    assert.deepEqual([p.base, p.names, p.plan, p.jobs], ['main', ['pages', 'guide/'], true, 3]);
    assert.equal(parseArgs(['--base=origin/main']).base, 'origin/main');
    assert.match(parseArgs(['--base']).error, /--base needs/);
    assert.match(parseArgs(['--base', '--plan']).error, /--base needs/);
    assert.match(parseArgs(['--jobs=0']).error, /--jobs/);
    assert.match(parseArgs(['--nope']).error, /unknown option --nope/);
    assert.match(parseArgs(['--types-only', '--tests-only']).error, /nothing to run/);
    assert.equal(parseArgs(['--all', '--verbose']).all, true);
  });
  test('a step killed by the memory cap is told from a failure', () => {
    assert.equal(killedByCap({ code: 1, signal: null, report: { oom: 1 } }, true), true);
    assert.equal(killedByCap({ code: 137, signal: null, report: { oom: 0 } }, true), false);
    assert.equal(killedByCap({ code: null, signal: 'SIGKILL', report: null }, true), true);
    assert.equal(killedByCap({ code: null, signal: 'SIGKILL', report: null }, false), false);
  });
  test('only the 10 newest logs are kept', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-check-selftest-'));
    try {
      for (let i = 0; i < 14; i++) fs.writeFileSync(path.join(dir, `20260101-0000${String(i).padStart(2, '0')}-1.log`), 'x');
      fs.writeFileSync(path.join(dir, 'other.txt'), 'x');
      pruneLogs(dir);
      const left = fs.readdirSync(dir).filter((f) => f.endsWith('.log'));
      assert.equal(left.length, 10);
      assert.ok(left.includes('20260101-000013-1.log') && !left.includes('20260101-000003-1.log'));
      assert.ok(fs.existsSync(path.join(dir, 'other.txt')));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  let bad = 0;
  for (const [name, err] of results) {
    if (err) bad++;
    console.log(`${err ? 'FAIL' : 'ok  '} ${name}${err ? `\n     ${String(err.stack ?? err).split('\n').slice(0, 5).join('\n     ')}` : ''}`);
  }
  console.log(`\n${results.length - bad} of ${results.length} passed`);
  return bad ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------------------------- run

const HELP = `usage: npm run check -- [files or test names] [options]

  (no arguments)         what changed against HEAD (staged, unstaged and new files)
  --base <ref>           what changed since the merge-base with <ref>, plus uncommitted work
  server/pages/x.ts      an existing file: it is the changed set
  pages guide/           anything else: test names (as npm test), and the type check too

  --types-only  --tests-only  --all (every test, as npm test)  --plan (say what would run, run nothing)
  --jobs=N      --verbose (stream the full output)             --selftest  --help

Env: CHECK_MEMORY_MAX (default ${DEFAULT_CAP}) caps the memory of the type check and of the tests together.
Exit: 0 all passed, 1 something failed, 2 a usage error.`;

// Runs the command, then writes what its cgroup says (peak memory, processes the memory cap killed) to $CHECK_CG_REPORT.
const WRAP_SH = 'cg=/sys/fs/cgroup$(sed -n "s/^0:://p" /proc/self/cgroup); "$@"; rc=$?; { echo "peak=$(cat "$cg/memory.peak" 2>/dev/null)"; echo "oom=$(sed -n "s/^oom_kill //p" "$cg/memory.events" 2>/dev/null)"; } > "$CHECK_CG_REPORT" 2>/dev/null; exit $rc';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(root, path.resolve(p)).split(path.sep).join('/');

function git(...args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) return { error: (r.stderr || r.error?.message || 'git failed').trim() };
  return { out: r.stdout };
}

function changedFiles(base) {
  let ref = 'HEAD';
  if (base) {
    const mb = git('merge-base', 'HEAD', base);
    if (mb.error) return { error: `--base ${base}: ${mb.error.split('\n')[0]}`, usage: true };
    ref = mb.out.trim();
  }
  const tracked = git('diff', '--name-only', '--no-renames', '-z', ref);
  const fresh = git('ls-files', '-o', '--exclude-standard', '-z');
  if (tracked.error || fresh.error) return { error: `could not ask git what changed: ${tracked.error ?? fresh.error}` };
  const files = new Set([...tracked.out.split('\0'), ...fresh.out.split('\0')].filter(Boolean));
  return { files: [...files].sort() };
}

/** Where heavy children run: a memory-capped systemd scope when this machine has them, else just nice. */
function sandboxFor(cap) {
  const probe = (cmd, args) => {
    const r = spawnSync(cmd, args, { stdio: 'ignore', timeout: 15000 });
    return r.status === 0;
  };
  const niced = probe('nice', ['-n', '10', 'true']);
  const scoped = process.platform === 'linux' && probe('systemd-run', [...scopeArgs(cap), 'true']);
  return { scoped, niced, cap };
}

// OOMPolicy=continue: the kernel kills one process of a scope over its cap, and systemd leaves the rest (our wrapper
// that reports it, the other tests) alone instead of stopping the whole scope.
const scopeArgs = (cap) => ['--user', '--scope', '-q', '-p', `MemoryMax=${cap}`, '-p', 'MemorySwapMax=0', '-p', 'OOMPolicy=continue'];

function wrapCommand(sb, cmd, argv) {
  const nice = sb.niced ? ['nice', '-n', '10'] : [];
  if (sb.scoped) return { cmd: 'systemd-run', argv: [...scopeArgs(sb.cap), ...nice, 'sh', '-c', WRAP_SH, 'sh', cmd, ...argv] };
  if (sb.niced) return { cmd: 'nice', argv: ['-n', '10', cmd, ...argv] };
  return { cmd, argv };
}

function main(opts) {
  return (async () => {
    // What to look at.
    const files = [];
    const names = [];
    for (const a of opts.names) {
      let st = null;
      try {
        st = fs.statSync(path.resolve(a));
      } catch {}
      if (st?.isFile()) {
        const r = rel(a);
        if (r.startsWith('..')) return fail(`${a} is outside the repository`);
        files.push(r);
      } else names.push(a);
    }
    let changed = [...new Set(files)].sort();
    let source = files.length ? 'files you named' : opts.all ? 'all tests' : 'none: the tests are named';
    if (!files.length && !names.length && !opts.all) {
      const c = changedFiles(opts.base);
      if (c.error) return fail(c.error);
      changed = c.files;
      source = opts.base ? `changed since the merge-base with ${opts.base}, and uncommitted` : 'changed against HEAD, and new';
    }

    const list = spawnSync(process.execPath, [path.join(root, 'scripts/test.mjs'), '--list'], { encoding: 'utf8' });
    if (list.status !== 0) return fail(`scripts/test.mjs --list failed: ${(list.stderr || '').trim()}`);
    const { tests: allTests, needs } = JSON.parse(list.stdout);

    const text = new Map();
    const read = (f) => {
      if (!text.has(f)) {
        let s = '';
        try {
          s = fs.readFileSync(path.join(root, f), 'utf8');
        } catch {}
        text.set(f, s);
      }
      return text.get(f);
    };
    const exists = (f) => fs.existsSync(path.join(root, f));

    // Which tests, and why.
    const selected = new Map();
    for (const n of names) {
      const hit = allTests.filter((t) => (allTests.includes(n) ? t === n : t.includes(n)));
      if (!hit.length) return fail(`No tests match ${n}`);
      for (const t of hit) selected.set(t, [`named: ${n}`]);
    }
    const explicit = new Set(selected.keys());
    const info = {};
    if (!opts.typesOnly) {
      if (opts.all) for (const t of allTests) if (!selected.has(t)) selected.set(t, ['--all']);
      const mapped = mapTests(changed, allTests, read, info);
      for (const [t, why] of mapped) selected.set(t, [...(selected.get(t) ?? []), ...why]);
    }
    const notes = coverageNotes(info);
    const toRun = [...selected.keys()].filter((t) => explicit.has(t) || !needs[t]).sort();
    const notRun = [...selected.keys()].filter((t) => !explicit.has(t) && needs[t]).sort();

    // The type check.
    const typeFiles = typesRelevant(changed);
    let typesWhy;
    if (opts.testsOnly) typesWhy = { run: false, why: '--tests-only' };
    else if (opts.typesOnly) typesWhy = { run: true, why: '--types-only' };
    else if (names.length || opts.all) typesWhy = { run: true, why: names.length ? 'tests named' : '--all' };
    else if (typeFiles.length) typesWhy = { run: true, why: `TypeScript or tsconfig JSON changed: ${typeFiles[0]}${typeFiles.length > 1 ? ` and ${typeFiles.length - 1} more` : ''}` };
    else typesWhy = { run: false, why: 'no TypeScript changed' };
    const runTests = !opts.typesOnly && toRun.length > 0;

    const demanded = names.length || opts.all || opts.typesOnly;
    if (!changed.length && !demanded) {
      console.log('check: nothing to check (no changed files)');
      return 0;
    }

    const cap = process.env.CHECK_MEMORY_MAX || DEFAULT_CAP;
    if (!/^\d+(\.\d+)?[KMGT]?%?$/i.test(cap)) return fail(`CHECK_MEMORY_MAX="${cap}" is not a size such as 6G or 4096M`);

    if (opts.plan) {
      const sb = sandboxFor(cap);
      const out = [`changed (${changed.length}, ${source}):`, ...changed.slice(0, 30).map((f) => `  ${f}`)];
      if (changed.length > 30) out.push(`  … and ${changed.length - 30} more`);
      out.push(`types: ${typesWhy.run ? 'run' : 'skipped'} (${typesWhy.why})`);
      if (opts.typesOnly) out.push('tests: skipped (--types-only)');
      else if (!toRun.length && !notRun.length) out.push('tests: none found for the changed files');
      else {
        out.push(`tests (${toRun.length}):`);
        for (const t of toRun) out.push(`  ${t}  ${cut(selected.get(t).slice(0, 3).join('; '), 150)}`);
        for (const t of notRun) out.push(`  not run here: ${t} (${needs[t]})`);
      }
      for (const n of notes) out.push(n);
      out.push(`limits: ${sb.scoped ? `systemd-run scope, MemoryMax=${cap}, no swap` : 'no memory cap (systemd-run --user --scope does not work here)'}${sb.niced ? ', nice 10' : ''}, CUDA_VISIBLE_DEVICES empty`);
      console.log(out.join('\n'));
      return 0;
    }

    const doTypes = typesWhy.run;
    if (!doTypes && !runTests && !notRun.length) {
      console.log(`check ok: types skipped: ${typesWhy.why} · tests: none found for the changed files${notes.map((n) => ` · ${n}`).join('')}`);
      return 0;
    }

    // Run.
    const logDir = path.join(os.tmpdir(), 'hydor-check');
    fs.mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
    const logPath = path.join(logDir, `${stamp}-${process.pid}.log`);
    fs.writeFileSync(logPath, `check ${opts.names.join(' ')} · changed: ${changed.join(', ') || '(none)'}\n`);
    pruneLogs(logDir);
    const sb = sandboxFor(cap);
    const env = { ...process.env, CUDA_VISIBLE_DEVICES: '' };

    const step = (title, cmd, argv, limitMs) =>
      new Promise((resolve) => {
        const report = path.join(logDir, `${stamp}-${process.pid}.${title.split(' ')[0]}.cg`);
        const w = wrapCommand(sb, cmd, argv);
        fs.appendFileSync(logPath, `\n==== ${title}: ${cmd} ${argv.join(' ')}\n`);
        const t0 = Date.now();
        const p = spawn(w.cmd, w.argv, { cwd: root, env: { ...env, CHECK_CG_REPORT: report }, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        const take = (b) => {
          out += b;
          fs.appendFileSync(logPath, b);
          if (opts.verbose) process.stdout.write(b);
        };
        p.stdout.on('data', take);
        p.stderr.on('data', take);
        const timer = setTimeout(() => p.kill('SIGKILL'), limitMs);
        const done = (code, signal, err) => {
          clearTimeout(timer);
          let rep = null;
          try {
            const t = fs.readFileSync(report, 'utf8');
            rep = { peak: Number(/peak=(\d+)/.exec(t)?.[1] ?? NaN), oom: Number(/oom=(\d+)/.exec(t)?.[1] ?? 0) };
            fs.rmSync(report, { force: true });
          } catch {}
          const ms = Date.now() - t0;
          const killed = killedByCap({ code, signal, report: rep }, sb.scoped);
          fs.appendFileSync(logPath, `\n---- ${title}: exit ${code ?? signal} in ${secs(ms)}${rep?.peak ? `, peak memory ${Math.round(rep.peak / 1048576)} MiB` : ''}${killed ? ', killed by the memory cap' : ''}\n`);
          resolve({ code, signal, out, ms, report: rep, killed, err });
        };
        p.on('error', (e) => done(null, null, e));
        p.on('close', (code, signal) => done(code, signal));
      });

    const capNote = `killed by the memory cap (MemoryMax=${cap}): raise CHECK_MEMORY_MAX`;
    const failed = [];
    const body = []; // builders: (perTest) => lines
    let okTypes = null;
    let okTests = null;
    let capKilled = false;

    if (doTypes) {
      const tsc = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
      if (!fs.existsSync(tsc)) return fail('node_modules/.bin/tsc is missing: run npm ci (or link node_modules)');
      const r = await step('types', tsc, ['-p', 'tsconfig.json', '--noEmit', '--pretty', 'false'], 10 * 60_000);
      if (r.code === 0) okTypes = r.ms;
      else {
        failed.push('types');
        const errors = parseTsc(r.out);
        if (r.killed) {
          capKilled = true;
          body.push(() => ['types: ' + capNote]);
        } else if (errors.length) body.push(() => formatTypes(errors, logPath));
        else body.push(() => [`types: tsc failed (${r.err ? r.err.message : `exit ${r.code ?? r.signal}`})`, ...stripAnsi(r.out).trim().split('\n').slice(-10).map((l) => cut(l))]);
      }
    }

    if (runTests) {
      const argv = [path.join(root, 'scripts/test.mjs'), ...toRun, '--tail=200', ...(opts.jobs ? [`--jobs=${opts.jobs}`] : [])];
      const r = await step('tests', process.execPath, argv, 45 * 60_000);
      const run = parseTestRun(r.out);
      const bad = run.results.filter((x) => !x.ok);
      if (r.killed) capKilled = true;
      if (!bad.length && r.code === 0) okTests = { ms: r.ms, n: run.results.length || toRun.length };
      else {
        failed.push(bad.length ? plural(bad.length, 'test') : 'tests');
        body.push((perTest) => {
          const lines = [];
          if (!bad.length && !r.killed) lines.push(`tests: runner failed (${r.err ? r.err.message : `exit ${r.code ?? r.signal}`})`, ...stripAnsi(r.out).trim().split('\n').slice(-10).map((l) => cut(l)));
          for (const b of bad) {
            lines.push(`FAIL ${b.file} (${b.secs < 10 ? b.secs.toFixed(1) : Math.round(b.secs)} s)${b.timedOut ? ' stopped after 15 min' : ''}`);
            if (perTest) lines.push(...excerpt(run.sections.get(b.file) ?? '', perTest).slice(0, perTest).map((l) => `  ${l}`));
          }
          if (bad.length) lines.push(`${run.passed} of ${run.total} passed`);
          return lines;
        });
        if (r.killed) body.push(() => ['tests: ' + capNote]);
      }
    }

    const notRunNote = notRun.length ? ` · not run here: ${notRun.length === 1 ? `${notRun[0]} (${needs[notRun[0]]})` : `${notRun[0]} and ${notRun.length - 1} more`}` : '';
    const noteText = notes.map((n) => ` · ${n}`).join('');
    if (!failed.length) {
      // One line: the names of the tests shrink (3, 1, none) until it is within 400 characters.
      const line = (names) => {
        const bits = [okTypes != null ? `types ok (${secs(okTypes)})` : `types skipped: ${typesWhy.why}`];
        if (okTests) bits.push(`${plural(okTests.n, 'test')} ok${names ? `: ${toRun.slice(0, names).join(', ')}${toRun.length > names ? `, +${toRun.length - names} more` : ''}` : ''} (${secs(okTests.ms)})`);
        else if (opts.typesOnly) bits.push('tests skipped: --types-only');
        else bits.push('no tests found for the changed files');
        return `check ok: ${bits.join(' · ')}${noteText}${notRunNote}`;
      };
      const text = [3, 1, 0].map(line).find((l) => l.length <= 400) ?? cut(line(0), 400);
      console.log(text);
      return 0;
    }
    const last = `check failed: ${failed.join(', ')}${noteText} · full log: ${logPath}`;
    const printed = opts.verbose ? [...body.flatMap((b) => b(200)), last].join('\n') : fit((n) => body.flatMap((b) => b(n)), last);
    console.log(printed);
    if (capKilled && !printed.includes('killed by the memory cap')) console.log(capNote);
    return 1;
  })();
}

function fail(msg, code = 2) {
  console.error(`check: ${msg}`);
  return code;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.error) {
    console.error(`check: ${opts.error}\n\n${HELP}`);
    process.exit(2);
  }
  if (opts.help) {
    console.log(HELP);
    process.exit(0);
  }
  process.exit(opts.selftest ? await selftest() : await main(opts));
}
