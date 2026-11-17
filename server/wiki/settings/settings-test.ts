// Exercise persistent defaults, validation and the non-destructive Git ignore behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { kvGet, kvSet, openDb } from '../../db.ts';
import { taskRoot } from '../../assistants/store.ts';
import { createSpace } from '../../spaces/index.ts';
import { guardUnregisteredWikiFolder, guardWikiFolder, ignoreProjectWiki } from './gitignore.ts';
import { setWikiSettings, wikiSettings } from './settings.ts';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-settings-'));
const dbPath = path.join(temp, 'app.db');
let db = openDb(dbPath);
try {
  assert.deepEqual(wikiSettings(db), { enabled: true, fromDocuments: true, documentLimit: 100, hubPath: path.join(taskRoot(db), '.wiki'), projectWikis: 'hub', projectPath: '.wiki', gitIgnore: false, defaultChatEnabled: true, defaultAutoLessons: false }, 'on by default; project wikis in the hub; .gitignore left alone');
  setWikiSettings(db, { defaultChatEnabled: false, defaultAutoLessons: true });
  assert.deepEqual([wikiSettings(db).projectWikis, wikiSettings(db).gitIgnore, wikiSettings(db).defaultChatEnabled, wikiSettings(db).defaultAutoLessons], ['hub', false, false, true], 'explicit preferences override defaults; the project settings stay');
  setWikiSettings(db, { enabled: false });
  assert.equal(wikiSettings(db).enabled, false);
  setWikiSettings(db, { enabled: true });
  kvSet(db, 'assistants.taskRoot', path.join(temp, 'new-root'));
  assert.equal(wikiSettings(db).hubPath, path.join(temp, 'new-root', '.wiki'), 'unconfigured hub follows Hydor’s task root');
  setWikiSettings(db, { enabled: true, hubPath: temp, projectPath: 'notes/wiki', gitIgnore: false, fromDocuments: false, projectWikis: 'folder' });
  kvSet(db, 'assistants.taskRoot', path.join(temp, 'another-root'));
  assert.equal(wikiSettings(db).hubPath, temp, 'an explicitly configured hub does not follow later task root changes');
  assert.throws(() => setWikiSettings(db, { projectPath: '../outside', enabled: false }));
  assert.throws(() => setWikiSettings(db, { projectWikis: 'elsewhere' as 'hub' }));
  assert.throws(() => setWikiSettings(db, { hubPath: 'relative/hub' }), /absolute/);
  assert.throws(() => setWikiSettings(db, { hubPath: '/' }), /absolute/);
  assert.throws(() => setWikiSettings(db, { fromDocuments: 'yes' as unknown as boolean }));
  assert.equal(wikiSettings(db).enabled, true);
  // The most documents read into the wiki: a whole number from 0 to 100000, kept as given.
  assert.equal(setWikiSettings(db, { documentLimit: 0 }).documentLimit, 0, '0 reads none');
  assert.equal(setWikiSettings(db, { documentLimit: 100000 }).documentLimit, 100000);
  for (const bad of [-1, 100001, 2.5, '50', null, Number.NaN]) assert.throws(() => setWikiSettings(db, { documentLimit: bad as unknown as number }), /whole number from 0 to 100000/, String(bad));
  assert.equal(wikiSettings(db).documentLimit, 100000, 'a refused change keeps the last one');
  kvSet(db, 'wiki.documentLimit', 'many');
  assert.equal(wikiSettings(db).documentLimit, 100, 'an unreadable stored value is the default');
  assert.equal(setWikiSettings(db, { enabled: true }).documentLimit, 100, 'other changes leave it');
  setWikiSettings(db, { documentLimit: 250 });
  assert.equal(kvGet(db, 'wiki.documentLimit'), '250');
  setWikiSettings(db, { documentLimit: 100 });
  db.close();
  db = openDb(dbPath);
  assert.deepEqual(wikiSettings(db), { enabled: true, fromDocuments: false, documentLimit: 100, hubPath: temp, projectWikis: 'folder', projectPath: 'notes/wiki', gitIgnore: false, defaultChatEnabled: false, defaultAutoLessons: true });
  const project = path.join(temp, 'project');
  const hubFolder = path.join(temp, 'hub');
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
  // Outside a Git repository nothing is made: no .gitignore appears.
  const plain = path.join(temp, 'plain');
  fs.mkdirSync(path.join(plain, '.wiki'), { recursive: true });
  assert.deepEqual(await ignoreProjectWiki(plain, path.join(plain, '.wiki'), true), { changed: false, tracked: false });
  assert.equal(fs.existsSync(path.join(plain, '.gitignore')), false);
  // The settings decide: project-local wikis, only with the switch on, even for explicit bindings in hub mode.
  const space = createSpace(db, { name: 'Plain', folder: plain });
  const repo = createSpace(db, { name: 'Repo', folder: project });
  setWikiSettings(db, { projectWikis: 'hub', gitIgnore: true });
  assert.equal((await guardWikiFolder(db, repo.id, path.join(project, '.wiki')))?.changed, false, 'a local binding remains protected in hub mode');
  setWikiSettings(db, { projectWikis: 'folder', gitIgnore: false });
  fs.writeFileSync(path.join(project, '.gitignore'), 'other\n');
  assert.equal(await guardWikiFolder(db, repo.id, path.join(project, '.wiki')), undefined, 'explicitly switched off');
  assert.equal(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'), 'other\n');
  setWikiSettings(db, { gitIgnore: true });
  assert.equal(await guardWikiFolder(db, space.id, path.join(plain, '.wiki')).then((r) => r?.changed), false);
  assert.equal(fs.existsSync(path.join(plain, '.gitignore')), false, 'not in a repository');
  assert.equal(await guardWikiFolder(db, repo.id, path.join(temp, 'elsewhere')), undefined, 'outside the project');
  assert.equal((await guardWikiFolder(db, repo.id, path.join(project, '.wiki')))?.changed, true);
  assert.equal(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'), 'other\n/.wiki/\n');
  assert.equal((await guardWikiFolder(db, repo.id, path.join(project, '.wiki')))?.changed, false, 'already there: no change');
  fs.writeFileSync(path.join(project, '.gitignore'), 'other\n');
  assert.equal((await guardUnregisteredWikiFolder(db, project, path.join(project, '.wiki')))?.changed, true, 'an unregistered project wiki is protected');
  assert.equal(await guardUnregisteredWikiFolder(db, project, temp), undefined, 'an external shared wiki is never added');
  setWikiSettings(db, { gitIgnore: false });
  assert.equal(await guardUnregisteredWikiFolder(db, project, path.join(project, '.wiki')), undefined, 'the unregistered guard respects opt-out');
  assert.equal(await guardWikiFolder(db, null, hubFolder), undefined);
  console.log('Wiki settings and Git ignore tests passed');
} finally {
  db.close();
  // Only the disposable test directory is removed.
  fs.rmSync(temp, { recursive: true, force: true });
}
