// Exercise generated wiki content in configured languages without changing source bytes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, kvSet } from '../db.ts';
import { preferred } from '../../shared/i18n.ts';
import type { RunCtx } from '../features/types.ts';
import { setWikiSettings } from './settings/settings.ts';
import { wikiTools } from './tools.ts';
import { previewLessons } from './lessons/lessons.ts';
import { wordsForLang } from '../language/index.ts';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-language-')));
const db = openDb(path.join(temp, 'app.db'));
try {
  const root = path.join(temp, 'project', '.wiki');
  fs.mkdirSync(root, { recursive: true });
  setWikiSettings(db, { enabled: true, hubPath: root });
  const ctx = { key: 'codex:lang', cwd: path.dirname(root), deps: { db } } as unknown as RunCtx;
  const source = wikiTools().find((tool) => tool.name === 'wiki_ingest_text')!;
  kvSet(db, 'ui.language', 'zh');
  const original = 'Original language stays unchanged.\n';
  const chinese = JSON.parse(String(await source.run({ content: original, origin: 'manual:one' }, ctx)));
  const note = fs.readFileSync(path.join(root, chinese.path), 'utf8');
  assert.match(note, /来源/);
  assert.ok(note.endsWith(original));
  assert.equal(fs.readFileSync(path.join(root, chinese.originalPath), 'utf8'), original);
  const greek = JSON.parse(String(await source.run({ content: original, origin: 'manual:two', language: 'el' }, ctx)));
  assert.match(fs.readFileSync(path.join(root, greek.path), 'utf8'), /Πηγή/);
  // Repeating an existing source in a different language never rewrites it.
  await source.run({ content: original, origin: 'manual:one', language: 'el' }, ctx);
  assert.equal(fs.readFileSync(path.join(root, chinese.path), 'utf8'), note);
  assert.equal(preferred(['el-GR', 'en']), 'el');
  const items = [{ kind: 'user' as const, id: 'u1', seq: 1, text: 'Keep evidence.' }];
  const candidates = [{ title: 'Test', lesson: 'Keep evidence.', evidence: 'User request', sourceIds: ['u1'] }];
  const zh = previewLessons({ session: 'test', target: root, items, candidates, date: '2026-01-01', translate: wordsForLang('zh') });
  const el = previewLessons({ session: 'test', target: root, items, candidates, date: '2026-01-01', translate: wordsForLang('el') });
  assert.match(zh.content, /经验总结/);
  assert.match(el.content, /Διδάγματα/);
  assert.match(zh.content, /Keep evidence\./);
  console.log('Wiki language follows Hydor settings or an explicit choice without altering sources');
} finally {
  db.close();
  // Remove only the isolated test files created here.
  fs.rmSync(temp, { recursive: true, force: true });
}
