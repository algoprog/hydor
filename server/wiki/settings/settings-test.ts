// Exercise persistent defaults, validation and the non-destructive Git ignore behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { kvSet, openDb } from '../../db.ts';
import { taskRoot } from '../../assistants/store.ts';
import { ignoreProjectWiki } from './gitignore.ts';
import { setWikiSettings, wikiSettings } from './settings.ts';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-settings-'));
const dbPath = path.join(temp, 'app.db');
let db = openDb(dbPath);
try {
  assert.deepEqual(wikiSettings(db), { enabled: false, hubPath: path.join(taskRoot(db), '.wiki'), projectPath: '.wiki', gitIgnore: true });
  setWikiSettings(db, { enabled: true });
  kvSet(db, 'assistants.taskRoot', path.join(temp, 'new-root'));
  assert.equal(wikiSettings(db).hubPath, path.join(temp, 'new-root', '.wiki'), 'unconfigured hub follows Hydor’s task root');
  setWikiSettings(db, { enabled: true, hubPath: temp, projectPath: 'notes/wiki', gitIgnore: false });
  kvSet(db, 'assistants.taskRoot', path.join(temp, 'another-root'));
  assert.equal(wikiSettings(db).hubPath, temp, 'an explicitly configured hub does not follow later task root changes');
  assert.throws(() => setWikiSettings(db, { projectPath: '../outside', enabled: false }));
  assert.equal(wikiSettings(db).enabled, true);
  db.close();
  db = openDb(dbPath);
  assert.deepEqual(wikiSettings(db), { enabled: true, hubPath: temp, projectPath: 'notes/wiki', gitIgnore: false });
  const project = path.join(temp, 'project');
  fs.mkdirSync(path.join(project, '.wiki'), { recursive: true });
  execFileSync('git', ['init', '-q', project]);
  fs.writeFileSync(path.join(project, '.wiki', 'tracked.md'), 'source');
  execFileSync('git', ['-C', project, 'add', '-f', '.wiki/tracked.md']);
  fs.writeFileSync(path.join(project, '.gitignore'), 'other\n');
  assert.deepEqual(await ignoreProjectWiki(project, path.join(project, '.wiki'), false), { changed: false, tracked: false });
  assert.deepEqual(await ignoreProjectWiki(project, path.join(project, '.wiki'), true), { changed: true, tracked: true });
  assert.deepEqual(await ignoreProjectWiki(project, path.join(project, '.wiki'), true), { changed: false, tracked: true });
  assert.equal(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'), 'other\n/.wiki/\n');
  assert.throws(() => setWikiSettings(db, { projectPath: '.' }));
  assert.throws(() => setWikiSettings(db, { projectPath: '.GIT/data' }));
  assert.throws(() => setWikiSettings(db, { projectPath: 'wiki\n!secret' }));
  await assert.rejects(ignoreProjectWiki(project, temp, true));
  console.log('Wiki settings and Git ignore tests passed');
} finally {
  db.close();
  // Only the disposable test directory is removed.
  fs.rmSync(temp, { recursive: true, force: true });
}
