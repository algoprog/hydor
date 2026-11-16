// Script tests for the app in other languages: the translator (whole strings, patterns with values in
// another order, the spaces around fragments), every shipped translation keeping its values, how much of
// the app each language covers, and agents asked to write in the user's language. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/language/language-test.ts
//   DATA_DIR=/tmp/hydor-test-language node dist/dev/language-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preferred } from '../../shared/i18n.ts';
import { noticeText } from '../../shared/notice.ts';
import { keepsValues, translator } from '../../shared/translate.ts';
import { APP_ROOT } from '../config.ts';
import { openDb } from '../db.ts';
import { registerFeatures, spawnAdditions } from '../features/registry.ts';
import type { Deps } from '../features/types.ts';
import { appWords, language, userLang } from './index.ts';
import { readLanguageCatalog } from './catalog.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-language-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'web/src/i18n', f), 'utf8')) as Record<string, string>;

test('the translator: whole strings, patterns whose values move, spaces kept, unknown left alone', () => {
  const t = translator({ Inbox: 'Εισερχόμενα', '{0} waiting on you': '还有 {0} 项等你处理', 'Reading {0} of {1}…': 'Διαβάζονται {0} από {1}…', 'From {0} to {1}': 'Έως {1}, από {0}' });
  assert.equal(t('Inbox'), 'Εισερχόμενα');
  assert.equal(t('  Inbox '), '  Εισερχόμενα ');
  assert.equal(t('5 waiting on you'), '还有 5 项等你处理');
  assert.equal(t('Reading 3 of 11…'), 'Διαβάζονται 3 από 11…');
  assert.equal(t('From 1 to 10'), 'Έως 10, από 1');
  assert.equal(t('Something else'), null);
  assert.equal(t('42'), null);
  assert.equal(t('Inbox\n  '), 'Εισερχόμενα\n  ');
  // An English plural's ending, filled in as a value, is left out of the translation.
  const p = translator({ 'Cleared {0} note{1}': '已清除 {0} 条笔记{1}', 'Made by {0}{1}': 'Από {0}{1}' });
  assert.equal(p('Cleared 3 notes'), '已清除 3 条笔记');
  assert.equal(p('Cleared 1 note'), '已清除 1 条笔记');
  assert.equal(p('Made by Ada, today'), 'Από Ada, today');
  // An ending right before another value takes only its "s"; a value at the end may be empty.
  const f = translator({ '{0} file{1}{2}': '{0} αρχεία{1}{2}' });
  assert.equal(f('3 files'), '3 αρχεία');
  assert.equal(f('3 files, 2 new'), '3 αρχεία, 2 new');
  // A value that is one of the app's own phrases is translated in the sentence too.
  const v = translator({ 'Start an agent in any folder on {0}': '在{0}的任意文件夹中启动智能体', 'this machine': '这台机器' });
  assert.equal(v('Start an agent in any folder on this machine'), '在这台机器的任意文件夹中启动智能体');
  assert.equal(v('Start an agent in any folder on studio-box'), '在studio-box的任意文件夹中启动智能体');
  // A value glued to letters ("12ms") is no piece of a word: "Forms" is not "For" + "ms", nor "Programs" "Progra" + "ms".
  const g = translator({ '{0}ms': '{0}ms', For: '适用于', 'Step{0}done': 'Βήμα{0}έγινε' });
  assert.equal(g('12ms'), '12ms');
  assert.equal(g('Forms'), null);
  assert.equal(g('Programs'), null);
  assert.equal(g('Step 3 done'), 'Βήμα 3 έγινε');
  assert.equal(g('Stepping done'), null);
});

test('the translator leaves what it has no entry for in English, whole, and takes lines and facts one by one', () => {
  const t = translator({
    '{0} and {1}': '{0}和{1}',
    'Use {0}': '使用 {0}',
    '{0} files': '{0} 个文件',
    '{0} {1} files': '{0} {1} 个文件',
    '{0} changed': '{0} 个已更改',
    '{0} file{1} changed': '{0} 个文件已更改',
    'Brings together {0}': '组合了 {0}',
    'Goal: {0}': '目标：{0}',
    'Excel workbook': 'Excel 工作簿',
    'Memory: on': '记忆：开启',
    'Effort: {0}': '思考强度：{0}',
    High: '高',
    'up to {0} results': '最多 {0} 条结果',
    '· next {0}': '· 下次：{0}',
    'in {0} h{1}': '{0} 小时{1}后',
    '{0} min': '{0} 分钟',
    '{0} ago': '{0} 前',
    'Added {0}': '添加于 {0}',
    '{0} at {1}': '{0} {1}',
    Sun: '周日',
    Wed: '周三',
  });
  // A pattern with little fixed text takes a few words, not most of a sentence it sits in (a note, a description).
  assert.equal(t('Use when a request is big or open-ended and a wrong guess would waste real work'), null);
  assert.equal(t('General: Help with anything: questions, writing, planning, files'), null);
  assert.equal(t('Receipts, forms and deadlines for the year'), null);
  assert.equal(t('The garden and Taxes 2026'), 'The garden和Taxes 2026');
  assert.equal(t('Use Brave Search'), '使用 Brave Search');
  // After a label it holds whatever the label names; the surer pattern (more fixed text) goes first.
  assert.equal(t('Goal: Write a two-page summary of the quarter for the board, with the charts'), '目标：Write a two-page summary of the quarter for the board, with the charts');
  assert.equal(t('1 file changed'), '1 个文件已更改');
  // Lines one by one; facts joined by " · " part by part (also as written after a dot); values with numbers, and lists of the app's words.
  assert.equal(t('Effort: High\nMemory: on'), '思考强度：高\n记忆：开启');
  assert.equal(t('Excel workbook · 17.6 KB'), 'Excel 工作簿 · 17.6 KB');
  assert.equal(t('Sun, Wed at 18:00 · next in 2 h 28 min'), '周日, 周三 18:00 · 下次：2 小时 28 分钟后');
  assert.equal(t('Added 3m ago'), '添加于 3m 前');
  // A value glued to a word that the translation keeps takes what follows it; fewer loose values win a tie; a value
  // never spans a " · ".
  const w = translator({ 'Working{0}': '工作中{0}', ', checked {0}': '，检查于 {0}', '{0}, checked {1}': '{0}，检查频率：{1}', '{0} ago': '{0} 前', 'On{0}': '开启{0}', 'On {0}': '已切换到 {0}', '{0} at {1}': '{0} {1}', '· {0} at once': '· 同时 {0} 个' });
  assert.equal(w('Working, checked 5m ago'), '工作中，检查于 5m 前');
  assert.equal(w('On · 4 at once'), '开启 · 同时 4 个');
  // A value in quotes is a name: as it is, however long.
  const q = translator({ 'Delete “{0}”?': '删除“{0}”？', Notes: '笔记' });
  assert.equal(q('Delete “Notes”?'), '删除“Notes”？');
  assert.equal(q('Delete “Planting calendar for the garden, zone 5b, with frost dates”?'), '删除“Planting calendar for the garden, zone 5b, with frost dates”？');
  // A sentence the page built from pieces is not split: its pieces go one by one instead.
  assert.equal(t('Excel workbook · 17.6 KB', false), null);
  // The first letter matches in either case, and the translation follows the source's case.
  assert.equal(t('Up to 100 results'), '最多 100 条结果');
  const el = translator({ On: 'Ενεργό', 'up to {0} results': 'έως {0} αποτελέσματα', 'Pdf files': 'PDF αρχεία' });
  assert.equal(el('on'), 'ενεργό');
  assert.equal(el('Up to 30 results'), 'Έως 30 αποτελέσματα');
  // A translation that starts with an acronym keeps it.
  assert.equal(el('pdf files'), 'PDF αρχεία');
  // A part's own word is its entry or nothing: no pattern takes the part's name for a value.
  const part = translator({ '{0} of {1}': '{0} / {1}', 'diagram::Page': '页面', Page: '网页' });
  assert.equal(part('diagram::1 of 3'), null);
  assert.equal(part('diagram::Page'), '页面');
  assert.equal(part('diagram::Page '), '页面 ');
  assert.equal(part('1 of 3'), '1 / 3');
});

test('the browser’s language picks one the app has, else English', () => {
  assert.equal(preferred(['el-GR', 'en']), 'el');
  assert.equal(preferred(['zh-CN']), 'zh');
  assert.equal(preferred(['de-AT', 'en']), 'de');
  assert.equal(preferred(['fr-FR', 'de']), 'de');
  assert.equal(preferred(['fr-FR']), 'en');
});

test('every shipped translation keeps its values, and covers nearly all the app', () => {
  const strings = read('strings.json');
  const total = Object.keys(strings).length;
  for (const lang of ['zh.json', 'el.json']) {
    const dict = read(lang);
    const broken = Object.entries(dict).filter(([k, v]) => !keepsValues(k, v));
    assert.deepEqual(broken, [], `${lang}: translations that lose a value`);
    const covered = Object.keys(strings).filter((k) => k in dict).length;
    assert.ok(covered / total >= 0.9, `${lang} covers ${covered} of ${total}`);
  }
});

test('language supplements stay scoped, ordered and behind base translations', () => {
  // A separate directory keeps the fixture independent of the installed catalogs.
  const directory = fs.mkdtempSync(path.join(tmp, 'supplements-'));
  fs.writeFileSync(path.join(directory, 'de.json'), JSON.stringify({ shared: 'base' }));
  fs.writeFileSync(path.join(directory, 'de.a.json'), JSON.stringify({ shared: 'module', added: 'first' }));
  fs.writeFileSync(path.join(directory, 'de.b.json'), JSON.stringify({ added: 'second', next: 'next' }));
  fs.writeFileSync(path.join(directory, 'el.a.json'), JSON.stringify({ other: 'other' }));
  assert.deepEqual(readLanguageCatalog(directory, 'de'), { shared: 'base', added: 'first', next: 'next' });
  assert.throws(() => readLanguageCatalog(directory, '../de'));
});

test('German covers the extracted catalog and preserves interpolation values', () => {
  const strings = read('strings.json');
  const dict = readLanguageCatalog(path.join(APP_ROOT, 'web/src/i18n'), 'de');
  // Missing or empty translations must not silently fall back to English.
  const missing = Object.keys(strings).filter((key) => !dict[key]?.trim());
  const broken = Object.entries(dict).filter(([key, value]) => !keepsValues(key, value));
  assert.deepEqual(missing, [], 'German catalog entries missing');
  assert.deepEqual(broken, [], 'German translations that lose a value');
  // Named template variables must retain their exact spelling.
  for (const [key, value] of Object.entries(dict)) {
    const tokens = key.match(/\{\{[^{}]+\}\}/g) ?? [];
    for (const token of tokens) assert.ok(value.includes(token), `German lost ${token} in ${key}`);
  }
  // These named placeholders are filled by the application rather than the translator.
  for (const token of ['{agent}', '{date}', '{time}', '{page}', '{pages}', '{column}']) {
    for (const [key, value] of Object.entries(dict)) {
      if (key.includes(token)) assert.ok(value.includes(token), `German lost ${token} in ${key}`);
    }
  }
  // Quoted theme names remain literal inside translated accessible labels.
  assert.equal(translator(dict)('More for “Midnight”'), 'Mehr für „Midnight“');
  assert.equal(dict['Memory (RAM)'], 'Arbeitsspeicher (RAM)');
  // English plural suffixes must not leak into German timeout messages.
  const german = translator(dict);
  // The same English label denotes RAM in system views and persistent notes everywhere else.
  assert.equal(german('system::Memory'), 'Arbeitsspeicher');
  assert.equal(german('Memory'), 'Memory');
  assert.equal(german('Memory for this session'), 'Memory für diese Sitzung');
  // Deep research is the feature's name in German, including its dynamic status.
  assert.equal(german('Deep research'), 'Deep research');
  assert.equal(german('Deep research: on'), 'Deep research: ein');
  // Options and dynamic status labels retain the related feature names as well.
  assert.equal(german('Swarm'), 'Swarm');
  assert.equal(german('Swarm: on'), 'Swarm: ein');
  assert.equal(german('Research'), 'Research');
  // Known structured server failures are extracted too; arbitrary tool diagnostics remain literal values.
  for (const key of ['the agent gave no answer', 'Tailscale didn’t publish the app{0}.{1}']) assert.ok(read('strings.json')[key], `Missing visible server failure: ${key}`);
  assert.equal(german('the agent gave no answer'), 'der Agent hat keine Antwort geliefert');
  const phoneFailure = german('Tailscale didn’t publish the app (it took too long). It said: E_TIMEOUT');
  assert.ok(phoneFailure?.startsWith('Tailscale konnte die App nicht bereitstellen'));
  assert.ok(phoneFailure?.includes('E_TIMEOUT'));
  // Library boards, leaderboards and the agents' shared work overview have distinct German names.
  assert.equal(german('Board'), 'Board');
  assert.equal(german('arena::Board'), 'Rangliste');
  assert.equal(german('swarm::Board'), 'Arbeitsübersicht');
  // Whole reset notices must keep spacing and German singular/plural forms.
  assert.equal(german('1 reset available'), '1 Reset verfügbar');
  assert.equal(german('2 resets available'), '2 Resets verfügbar');
  assert.equal(german('Put {name} where each setting’s value goes: python train.py --lr {lr}'), 'Setze {name} als Platzhalter für den jeweiligen Parameterwert ein, zum Beispiel: python train.py --lr {lr}');
  // Short tip actions are contextual so longer labels elsewhere stay descriptive.
  assert.equal(german('tips::Skip tips'), 'Überspringen');
  assert.equal(german('tips::Learn more'), 'Mehr');
  // Product Skills retain their name in project views and search placeholders.
  assert.equal(german('New skill'), 'Neuer Skill');
  assert.equal(german('Search 286 skills'), '286 Skills durchsuchen');
  assert.equal(german('Its own'), 'Eigene');
  assert.equal(german('Too many wrong links from this address. Try again in 1 minute.'), 'Zu viele falsche Links von dieser Adresse. Versuche es nach 1 Min. erneut.');
  assert.equal(german('Too many wrong links from this address. Try again in 2 minutes.'), 'Zu viele falsche Links von dieser Adresse. Versuche es nach 2 Min. erneut.');
  assert.equal(german('1 file changed'), '1 Datei geändert');
  assert.equal(german('2 files changed'), '2 Dateien geändert');
  assert.equal(german('Confidential: on'), 'Vertraulich: ein');
  assert.equal(german('codex resume 123'), 'codex resume 123');
  // Shell and configuration examples must remain executable.
  assert.ok(dict['In Docker its restart policy brings it back: restart: unless-stopped in compose.yaml.'].includes('restart: unless-stopped'));
  assert.ok(dict['I approve this command — please run it now: ``` {0} ```'].includes('``` {0} ```'));
  // Authentication examples must remain copyable after translation.
  assert.equal(german('Bearer abc123'), 'Bearer abc123');
  assert.equal(german('Authorization: Bearer …'), 'Authorization: Bearer …');
  assert.equal(
    german('claude mcp add --transport http hydor http://localhost --header "Authorization: Bearer xyz"'),
    'claude mcp add --transport http hydor http://localhost --header "Authorization: Bearer xyz"',
  );
  // Protocol names, time zones and tool identifiers keep their exact spelling.
  for (const [key, token] of [
    ['Send the recording as application/octet-stream', 'application/octet-stream'],
    ['No answer to tools/list', 'tools/list'],
    ['Where those are, as Europe/Athens', 'Europe/Athens'],
    ['It is still working: wait for its reply, or message_child it.', 'message_child'],
  ]) assert.ok(dict[key].includes(token), `German lost ${token}`);
  // Example schemas, formula identifiers and LUT headers must remain usable as written.
  const databaseExample = Object.entries(dict).find(([key]) => key.startsWith('To change a database, save_page with this id and databases:'));
  assert.ok(databaseExample);
  for (const token of ['"YYYY-MM-DD"', '"page"', 'true', 'page_action fill_column']) assert.ok(databaseExample[1].includes(token));
  const formulas = Object.entries(dict).find(([key]) => key.startsWith('SUM AVERAGE COUNT COUNTA COUNTIF'));
  assert.ok(formulas);
  assert.equal(formulas[1], formulas[0]);
  assert.equal(dict['TITLE "Hydor grade"'], 'TITLE "Hydor grade"');
  assert.equal(dict['YYYY-MM-DD HH:MM'], 'YYYY-MM-DD HH:MM');
  assert.ok(dict['The start is a day written as YYYY-MM-DD'].includes('YYYY-MM-DD'));
  // Guide topic titles are translated even when the guide body is in English.
  assert.equal(german('Research: papers, writing and the lab'), 'Research: Publikationen, Schreiben und Labor');
  // Product names and executable fragments are not ordinary prose.
  for (const key of ['Codex', 'Anthropic', 'Mermaid', 'Markdown', 'NORM.DIST(x, mean, standard_dev, cumulative)', 'linear infinite', 'codex resume {0}', 'npm install', 'kubectl rollout undo deployment/web', 'input, textarea, select, [contenteditable]', '“{0} (filled).pdf”']) {
    assert.equal(dict[key], key, `German must preserve ${key}`);
  }
});

test('agents are asked to write in the user’s language; English asks nothing', async () => {
  registerFeatures([language], { db, app: { get() {}, put() {} } } as unknown as Deps);
  const info = { agent: 'claude' as const, key: 'claude:k', cwd: tmp, runId: 'r', resume: false, extra: {} };
  assert.equal(userLang(db), 'en');
  assert.deepEqual((await spawnAdditions(info)).instructions, []);
  // German selection must also reach agent instructions.
  db.prepare("insert or replace into kv (k, v) values ('ui.language', 'de')").run();
  assert.match((await spawnAdditions(info)).instructions.join('\n'), /reads this app in German\. Write to them in German/);
  db.prepare("insert or replace into kv (k, v) values ('ui.language', 'zh')").run();
  assert.match((await spawnAdditions(info)).instructions.join('\n'), /reads this app in Chinese \(Simplified\)\. Write to them in Chinese \(Simplified\)/);
});

test('what the server says outside the pages (a phone’s notifications) comes in the user’s language', () => {
  db.prepare("insert or replace into kv (k, v) values ('ui.language', 'en')").run();
  assert.equal(appWords(db)('Finished'), 'Finished');
  // Server-side words use the same German dictionary as the browser.
  db.prepare("insert or replace into kv (k, v) values ('ui.language', 'de')").run();
  assert.equal(appWords(db)('Settings'), 'Einstellungen');
  db.prepare("insert or replace into kv (k, v) values ('ui.language', 'el')").run();
  const tr = appWords(db);
  const el = read('el.json');
  assert.equal(tr('Finished'), el.Finished);
  assert.equal(tr('Something no dictionary has'), 'Something no dictionary has');
  // The status in the language; the reply as the agent wrote it.
  const done = { key: 'claude:k', kind: 'done', title: 'Plan the trip', body: 'Here is the plan.', agent: 'claude', at: 0 } as const;
  assert.deepEqual(noticeText(done, tr), { title: 'Plan the trip', body: `${el.Finished} · Here is the plan.` });
  assert.deepEqual(noticeText({ ...done, kind: 'waiting', body: 'Needs your approval' }, tr), { title: 'Plan the trip', body: el['Needs your approval'] });
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
