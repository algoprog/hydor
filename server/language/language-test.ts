// Script tests for the app in other languages: the translator (whole strings, patterns with values in
// another order, the spaces around fragments), every shipped translation keeping its values, how much of
// the app each language covers, and agents asked to write in the user's language. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/language/language-test.ts
//   DATA_DIR=/tmp/naget-test-language node dist/dev/language-test.js
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

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-language-test-'));
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
});

test('the browser’s language picks one the app has, else English', () => {
  assert.equal(preferred(['el-GR', 'en']), 'el');
  assert.equal(preferred(['zh-CN']), 'zh');
  assert.equal(preferred(['fr-FR', 'de']), 'en');
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

test('agents are asked to write in the user’s language; English asks nothing', async () => {
  registerFeatures([language], { db, app: { get() {}, put() {} } } as unknown as Deps);
  const info = { agent: 'claude' as const, key: 'claude:k', cwd: tmp, runId: 'r', resume: false, extra: {} };
  assert.equal(userLang(db), 'en');
  assert.deepEqual((await spawnAdditions(info)).instructions, []);
  db.prepare("insert or replace into kv (k, v) values ('ui.language', 'zh')").run();
  assert.match((await spawnAdditions(info)).instructions.join('\n'), /reads this app in Chinese \(Simplified\)\. Write to them in Chinese \(Simplified\)/);
});

test('what the server says outside the pages (a phone’s notifications) comes in the user’s language', () => {
  db.prepare("insert or replace into kv (k, v) values ('ui.language', 'en')").run();
  assert.equal(appWords(db)('Finished'), 'Finished');
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
