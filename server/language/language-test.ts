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
import { keepsValues, translator } from '../../shared/translate.ts';
import { APP_ROOT } from '../config.ts';
import { openDb } from '../db.ts';
import { registerFeatures, spawnAdditions } from '../features/registry.ts';
import type { Deps } from '../features/types.ts';
import { language, userLang } from './index.ts';

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
