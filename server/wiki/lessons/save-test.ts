// Exercise the real approval card and Git guard before saving a lesson.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApprovalRequest } from '../../../shared/types.ts';
import type { ApprovalAnswer } from '../../agents/live.ts';
import { execFileSync } from 'node:child_process';
import { openDb } from '../../db.ts';
import { createSpace } from '../../spaces/index.ts';
import type { RunCtx } from '../../features/types.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { guardProject } from '../tools.ts';
import { lessonsTools } from './tools.ts';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-lesson-save-')));
const db = openDb(path.join(temp, 'test.db'));
try {
  const project = path.join(temp, 'project');
  const root = path.join(project, '.wiki');
  fs.mkdirSync(root, { recursive: true });
  execFileSync('git', ['init', '-q', project]);
  createSpace(db, { name: 'Lessons', folder: project });
  setWikiSettings(db, { enabled: true, hubPath: path.join(temp, 'hub'), projectWikis: 'folder', projectPath: '.wiki', gitIgnore: true });
  const row = db.prepare('insert into chunk_text (key, kind, ts, text) values (?, ?, ?, ?)').run('codex:lesson', 'user', 1, 'Correction: retries should be three.');
  const candidates = [{ title: 'Retries', lesson: 'Use three retries.', evidence: 'User correction', uncertainty: 'Not tested', sourceIds: [`chunk:${row.lastInsertRowid}`] }];
  const cards: ApprovalRequest[] = [];
  let decision: ApprovalAnswer = { decision: 'decline' };
  const adapter = {
    ask: async (card: ApprovalRequest, options: { check?: (a: ApprovalAnswer) => string | null } = {}) => {
      cards.push(card);
      const error = options.check?.(decision);
      if (error) throw new Error(error);
      return decision;
    },
  };
  const ctx = { key: 'codex:lesson', runId: 'test', agent: 'codex', cwd: project, deps: { db, sessions: { adapterByRun: () => adapter } } } as unknown as RunCtx;
  const tools = lessonsTools(() => root, guardProject);
  const preview = tools.find((t) => t.name === 'wiki_lessons_preview')!;
  const save = tools.find((t) => t.name === 'wiki_lessons_save')!;
  const proposed = JSON.parse(String(await preview.run({ candidates }, ctx)));
  assert.equal(fs.existsSync(path.join(project, '.gitignore')), false, 'preview must not write a Git ignore');
  assert.equal(await save.run({ candidates, sha256: proposed.sha256 }, ctx), 'Not saved');
  assert.equal(cards.length, 1);
  assert.ok(cards[0].detail?.includes(proposed.content.trimEnd()), 'approval card must show the reviewed content');
  assert.equal(fs.existsSync(path.join(root, proposed.path)), false, 'decline must not save');
  assert.equal(fs.existsSync(path.join(project, '.gitignore')), false, 'decline must not modify Git ignore');
  await assert.rejects(() => save.run({ candidates, sha256: '0'.repeat(64) }, ctx), /Preview changed/);
  assert.equal(cards.length, 1, 'stale previews do not prompt or write');
  decision = { decision: 'accept', form: { confirmed: 'Yes' } };
  const saved = JSON.parse(String(await save.run({ candidates, sha256: proposed.sha256 }, ctx)));
  assert.equal(cards.length, 2);
  assert.deepEqual(saved.paths, [proposed.path]);
  assert.equal(fs.readFileSync(path.join(root, proposed.path), 'utf8'), proposed.content);
  assert.equal(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'), '/.wiki/\n');
  assert.equal(saved.gitIgnore.changed, true);
  console.log('Lessons approval, denial and Git guard tests passed');
} finally {
  db.close();
  // Remove only this disposable project and database.
  fs.rmSync(temp, { recursive: true, force: true });
}
