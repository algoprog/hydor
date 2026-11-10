// Hidden checker for logger-move. Run: node check.mjs <workdir>
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);
const abs = (rel) => path.join(dir, rel);
const load = (rel) => import(pathToFileURL(abs(rel)).href);
const read = (rel) => fs.readFileSync(abs(rel), 'utf8');
const importsLogMjs = (code) => /(['"])(?:[^'"]*\/)?log\.mjs\1/.test(code);
const stripComments = (s) => s.replace(/(^|\s)\/\/.*$/gm, '$1');
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

function listFiles(root) {
  const out = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(root, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (e.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

// What each module does when it is exercised, so its sink entries can be compared with the original program's.
const RUNS = {
  'src/config/defaults.mjs': (m) => {
    m.withDefaults({ port: 1 });
    m.withDefaults();
  },
  'src/config/load.mjs': (m) => {
    m.loadConfig('{"port": 80, "x": 1}');
    m.loadConfig('{"port": 3000}');
    m.loadConfig('nope');
  },
  'src/net/http.mjs': (m) => {
    m.buildRequest('GET', 'https://a.test');
    m.buildRequest('PUT', 'http://b.test', { x: 1 });
    for (const code of [200, 404, 410, 500]) m.parseStatus(code);
  },
  'src/net/retry.mjs': (m) => {
    m.withRetry((n) => {
      if (n < 2) throw new Error('first');
      return 1;
    });
    try {
      m.withRetry(() => {
        throw new Error('always');
      }, 2);
    } catch {}
    m.withRetry(() => 5, 1);
  },
  'src/db/store.mjs': (m) => {
    const s = new m.Store();
    s.set('k', 1);
    s.set('k', 2);
    s.get('k');
    s.get('z');
    s.remove('k');
    s.remove('k');
  },
  'src/db/migrate.mjs': (m) => {
    m.migrate({}, { a: () => {}, b: () => { throw new Error('bad'); }, c: () => {} });
    m.migrate({}, {});
  },
  'src/util/format.mjs': (m) => {
    m.logResult('a', 1);
    m.money(150);
    m.money(1.4);
  },
  'src/services/auth.mjs': (m) => {
    m.login('ada', 'lovelace');
    m.login('alan', 'x');
    m.login('zed', 'y');
  },
  'src/services/billing.mjs': (m) => {
    m.charge('a', 100);
    m.charge('b', -1);
    m.charge('c', 200000);
  },
  'src/services/report.mjs': (m) => {
    m.buildReport('u');
  },
  'src/services/notify.mjs': (m) => {
    m.notify('u', 'hi');
    m.notify('u', '');
  },
  'src/app.mjs': (m) => {
    m.runApp();
  },
};

const EXPECTED = JSON.parse(String.raw`{"src/config/defaults.mjs":[{"level":"info","message":"config merged","more":[3]},{"level":"info","message":"config merged","more":[3]}],"src/config/load.mjs":[{"level":"warn","message":"privileged port requested","more":[80]},{"level":"info","message":"config loaded","more":[{"keys":["port","x"]}]},{"level":"info","message":"config merged","more":[4]},{"level":"info","message":"config loaded","more":[{"keys":["port"]}]},{"level":"info","message":"config merged","more":[3]},{"level":"error","message":"config is not valid JSON: SyntaxError","more":[]},{"level":"info","message":"config loaded","more":[{"keys":[]}]},{"level":"info","message":"config merged","more":[3]}],"src/net/http.mjs":[{"level":"info","message":"GET https://a.test","more":[]},{"level":"info","message":"PUT http://b.test","more":[]},{"level":"warn","message":"insecure url: http://b.test","more":[{"method":"PUT"}]},{"level":"warn","message":"client error 404","more":["not found"]},{"level":"warn","message":"client error 410","more":["rejected"]},{"level":"error","message":"server error 500","more":[]}],"src/net/retry.mjs":[{"level":"warn","message":"attempt 1 failed: first","more":[]},{"level":"info","message":"attempt 2 ok","more":[]},{"level":"warn","message":"attempt 1 failed: always","more":[]},{"level":"error","message":"attempt 2 failed: always","more":[]},{"level":"info","message":"attempt 1 ok","more":[]}],"src/db/store.mjs":[{"level":"info","message":"set k","more":[]},{"level":"warn","message":"overwriting k","more":[1]},{"level":"info","message":"set k","more":[]},{"level":"warn","message":"missing z","more":[]},{"level":"info","message":"removed k","more":[true]},{"level":"info","message":"removed k","more":[false]}],"src/db/migrate.mjs":[{"level":"info","message":"migration a applied","more":[]},{"level":"error","message":"migration b failed","more":["bad"]},{"level":"info","message":"1 of 3 migrations applied","more":[]},{"level":"info","message":"0 of 0 migrations applied","more":[]}],"src/util/format.mjs":[{"level":"info","message":"a: 1","more":[]},{"level":"warn","message":"money() wants whole cents","more":[1.4]}],"src/services/auth.mjs":[{"level":"info","message":"ada logged in","more":[]},{"level":"error","message":"bad password for alan","more":[{"attempts":1}]},{"level":"warn","message":"unknown user zed","more":[]}],"src/services/billing.mjs":[{"level":"info","message":"charged a 1.00 EUR","more":[]},{"level":"error","message":"invalid amount for b","more":[-1]},{"level":"info","message":"charged c 2000.00 EUR","more":[]},{"level":"warn","message":"large charge for c","more":[{"cents":200000,"label":"2000.00 EUR"}]}],"src/services/report.mjs":[{"level":"info","message":"report for u","more":[2]},{"level":"info","message":"  section: overview","more":[]},{"level":"info","message":"  section: totals","more":[]},{"level":"warn","message":"u has 1 warning section(s)","more":[]}],"src/services/notify.mjs":[{"level":"info","message":"notified u","more":[2]},{"level":"warn","message":"empty notification skipped","more":["u"]}],"src/app.mjs":[{"level":"info","message":"app starting","more":[]},{"level":"warn","message":"privileged port requested","more":[80]},{"level":"info","message":"config loaded","more":[{"keys":["port","region"]}]},{"level":"info","message":"config merged","more":[3]},{"level":"error","message":"config is not valid JSON: SyntaxError","more":[]},{"level":"info","message":"config loaded","more":[{"keys":[]}]},{"level":"info","message":"config merged","more":[3]},{"level":"info","message":"GET https://example.test/api","more":[]},{"level":"info","message":"POST http://example.test/api","more":[]},{"level":"warn","message":"insecure url: http://example.test/api","more":[{"method":"POST"}]},{"level":"warn","message":"client error 404","more":["not found"]},{"level":"error","message":"server error 503","more":[]},{"level":"warn","message":"attempt 1 failed: try 1","more":[]},{"level":"warn","message":"attempt 2 failed: try 2","more":[]},{"level":"info","message":"attempt 3 ok","more":[]},{"level":"warn","message":"attempt 1 failed: always","more":[]},{"level":"error","message":"attempt 2 failed: always","more":[]},{"level":"warn","message":"gave up","more":["always"]},{"level":"info","message":"set a","more":[]},{"level":"warn","message":"overwriting a","more":[1]},{"level":"info","message":"set a","more":[]},{"level":"warn","message":"missing b","more":[]},{"level":"info","message":"removed a","more":[true]},{"level":"info","message":"set x","more":[]},{"level":"info","message":"migration one applied","more":[]},{"level":"error","message":"migration two failed","more":["boom"]},{"level":"info","message":"1 of 2 migrations applied","more":[]},{"level":"info","message":"statuses: ok,rejected,error","more":[]},{"level":"info","message":"ada logged in","more":[]},{"level":"error","message":"bad password for ada","more":[{"attempts":1}]},{"level":"warn","message":"unknown user bob","more":[]},{"level":"info","message":"charged acct-1 25.50 EUR","more":[]},{"level":"error","message":"invalid amount for acct-2","more":[0]},{"level":"info","message":"charged acct-3 2500.00 EUR","more":[]},{"level":"warn","message":"large charge for acct-3","more":[{"cents":250000,"label":"2500.00 EUR"}]},{"level":"info","message":"report for ada","more":[2]},{"level":"info","message":"  section: overview","more":[]},{"level":"info","message":"  section: totals","more":[]},{"level":"warn","message":"ada has 1 warning section(s)","more":[]},{"level":"info","message":"notified ada","more":[5]},{"level":"warn","message":"empty notification skipped","more":["ada"]},{"level":"info","message":"app finished","more":[]}]}`);
const MAIN_OUTPUT = JSON.parse(String.raw`"[info] app starting\n[warn] privileged port requested 80\n[info] config loaded { keys: [ 'port', 'region' ] }\n[info] config merged 3\n[error] config is not valid JSON: SyntaxError\n[info] config loaded { keys: [] }\n[info] config merged 3\n[info] GET https://example.test/api\n[info] POST http://example.test/api\n[warn] insecure url: http://example.test/api { method: 'POST' }\n[warn] client error 404 not found\n[error] server error 503\n[warn] attempt 1 failed: try 1\n[warn] attempt 2 failed: try 2\n[info] attempt 3 ok\n[warn] attempt 1 failed: always\n[error] attempt 2 failed: always\n[warn] gave up always\n[info] set a\n[warn] overwriting a 1\n[info] set a\n[warn] missing b\n[info] removed a true\n[info] set x\n[info] migration one applied\n[error] migration two failed boom\n[info] 1 of 2 migrations applied\n[info] statuses: ok,rejected,error\n[info] ada logged in\n[error] bad password for ada { attempts: 1 }\n[warn] unknown user bob\n[info] charged acct-1 25.50 EUR\n[error] invalid amount for acct-2 0\n[info] charged acct-3 2500.00 EUR\n[warn] large charge for acct-3 { cents: 250000, label: '2500.00 EUR' }\n[info] report for ada 2\n[info]   section: overview\n[info]   section: totals\n[warn] ada has 1 warning section(s)\n[info] notified ada 5\n[warn] empty notification skipped ada\n[info] app finished\n[\n  {\n    \"level\": \"info\",\n    \"message\": \"app starting\",\n    \"more\": []\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"privileged port requested\",\n    \"more\": [\n      80\n    ]\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"config loaded\",\n    \"more\": [\n      {\n        \"keys\": [\n          \"port\",\n          \"region\"\n        ]\n      }\n    ]\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"config merged\",\n    \"more\": [\n      3\n    ]\n  },\n  {\n    \"level\": \"error\",\n    \"message\": \"config is not valid JSON: SyntaxError\",\n    \"more\": []\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"config loaded\",\n    \"more\": [\n      {\n        \"keys\": []\n      }\n    ]\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"config merged\",\n    \"more\": [\n      3\n    ]\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"GET https://example.test/api\",\n    \"more\": []\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"POST http://example.test/api\",\n    \"more\": []\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"insecure url: http://example.test/api\",\n    \"more\": [\n      {\n        \"method\": \"POST\"\n      }\n    ]\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"client error 404\",\n    \"more\": [\n      \"not found\"\n    ]\n  },\n  {\n    \"level\": \"error\",\n    \"message\": \"server error 503\",\n    \"more\": []\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"attempt 1 failed: try 1\",\n    \"more\": []\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"attempt 2 failed: try 2\",\n    \"more\": []\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"attempt 3 ok\",\n    \"more\": []\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"attempt 1 failed: always\",\n    \"more\": []\n  },\n  {\n    \"level\": \"error\",\n    \"message\": \"attempt 2 failed: always\",\n    \"more\": []\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"gave up\",\n    \"more\": [\n      \"always\"\n    ]\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"set a\",\n    \"more\": []\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"overwriting a\",\n    \"more\": [\n      1\n    ]\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"set a\",\n    \"more\": []\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"missing b\",\n    \"more\": []\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"removed a\",\n    \"more\": [\n      true\n    ]\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"set x\",\n    \"more\": []\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"migration one applied\",\n    \"more\": []\n  },\n  {\n    \"level\": \"error\",\n    \"message\": \"migration two failed\",\n    \"more\": [\n      \"boom\"\n    ]\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"1 of 2 migrations applied\",\n    \"more\": []\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"statuses: ok,rejected,error\",\n    \"more\": []\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"ada logged in\",\n    \"more\": []\n  },\n  {\n    \"level\": \"error\",\n    \"message\": \"bad password for ada\",\n    \"more\": [\n      {\n        \"attempts\": 1\n      }\n    ]\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"unknown user bob\",\n    \"more\": []\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"charged acct-1 25.50 EUR\",\n    \"more\": []\n  },\n  {\n    \"level\": \"error\",\n    \"message\": \"invalid amount for acct-2\",\n    \"more\": [\n      0\n    ]\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"charged acct-3 2500.00 EUR\",\n    \"more\": []\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"large charge for acct-3\",\n    \"more\": [\n      {\n        \"cents\": 250000,\n        \"label\": \"2500.00 EUR\"\n      }\n    ]\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"report for ada\",\n    \"more\": [\n      2\n    ]\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"  section: overview\",\n    \"more\": []\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"  section: totals\",\n    \"more\": []\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"ada has 1 warning section(s)\",\n    \"more\": []\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"notified ada\",\n    \"more\": [\n      5\n    ]\n  },\n  {\n    \"level\": \"warn\",\n    \"message\": \"empty notification skipped\",\n    \"more\": [\n      \"ada\"\n    ]\n  },\n  {\n    \"level\": \"info\",\n    \"message\": \"app finished\",\n    \"more\": []\n  }\n]\n"`);

async function runModule(rel) {
  const { sink } = await load('src/logger.mjs');
  const m = await load(rel);
  sink.length = 0;
  const quiet = console.log;
  console.log = () => {};
  try {
    RUNS[rel](m);
  } finally {
    console.log = quiet;
  }
  return JSON.parse(JSON.stringify(sink));
}

test('src/log.mjs is deleted', () => {
  assert.equal(fs.existsSync(abs('src/log.mjs')), false);
});
test('no file refers to log.mjs any more', () => {
  const bad = listFiles(dir).filter((f) => importsLogMjs(stripComments(fs.readFileSync(f, 'utf8'))))
    .map((f) => path.relative(dir, f));
  assert.deepEqual(bad, []);
});
test('no call to log( is left', () => {
  const bad = listFiles(dir)
    .filter((f) => /(?<![\w$.])log\s*\(/.test(stripComments(fs.readFileSync(f, 'utf8'))))
    .map((f) => path.relative(dir, f));
  assert.deepEqual(bad, []);
});

for (const rel of Object.keys(RUNS)) {
  test(`${rel}: uses the logger and behaves as before`, async () => {
    const code = stripComments(read(rel));
    assert.ok(!importsLogMjs(code), 'still imports log.mjs');
    assert.ok(!/(?<![\w$.])log\s*\(/.test(code), 'still calls log(');
    const m = code.match(/import\s*\{[^}]*\blogger\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/);
    assert.ok(m, 'does not import logger');
    assert.equal(path.resolve(path.dirname(abs(rel)), m[1]), abs('src/logger.mjs'), 'imports logger from the wrong path');
    assert.ok(/\blogger\s*(\.|\[)/.test(code), 'does not use logger');
    assert.deepEqual(await runModule(rel), EXPECTED[rel]);
  });
}

test('node main.mjs prints exactly what it printed before', () => {
  const r = spawnSync('node', ['main.mjs'], { cwd: dir, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, MAIN_OUTPUT);
});
test('node --test passes', () => {
  const r = spawnSync('node', ['--test'], { cwd: dir, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stdout.slice(-300));
});
test('logResult is still there and still works', async () => {
  const code = read('src/util/format.mjs');
  assert.ok(/export function logResult\(label, value\)/.test(code), 'logResult changed');
  assert.ok(/logResult\('statuses'/.test(read('src/app.mjs')), 'call to logResult changed');
  const { sink } = await load('src/logger.mjs');
  const { logResult } = await load('src/util/format.mjs');
  sink.length = 0;
  const quiet = console.log;
  console.log = () => {};
  let out;
  try {
    out = logResult('n', 3);
  } finally {
    console.log = quiet;
  }
  assert.equal(out, 'n: 3');
  assert.deepEqual(JSON.parse(JSON.stringify(sink)), [{ level: 'info', message: 'n: 3', more: [] }]);
});
test("catalog('info') is still called in report.mjs", async () => {
  const code = read('src/services/report.mjs');
  assert.ok(code.includes("const sections = catalog('info');"), "the call catalog('info') changed");
  const { catalog } = await load('src/util/catalog.mjs');
  assert.deepEqual(catalog('info'), ['overview', 'totals']);
  assert.deepEqual(catalog('nothing'), []);
});
test('the comment mentioning log is untouched', () => {
  const code = read('src/util/format.mjs');
  assert.ok(
    code.includes("// Old style was log('info', ...) at every call site; there is a logger with one method per level now."),
    'comment changed',
  );
});

const failed = [];
for (const [name, fn] of cases) {
  try {
    await fn();
  } catch (e) {
    failed.push(name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${name}: ${String(e?.message ?? e).split('\n')[0]}`);
  }
}
console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
