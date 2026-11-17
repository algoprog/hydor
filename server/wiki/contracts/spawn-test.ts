// A new session must resolve its selected project's contract controls before it receives a session key.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Deps, SpawnInfo } from '../../features/types.ts';
import { openDb } from '../../db.ts';
import { createSpace, updateSpace } from '../../spaces/index.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { wiki } from '../index.ts';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-contract-spawn-'));
const folder = path.join(temp, 'project'), elsewhere = path.join(temp, 'elsewhere');
fs.mkdirSync(path.join(folder, '.wiki', 'wiki'), { recursive: true }); fs.mkdirSync(elsewhere);
fs.writeFileSync(path.join(folder, '.wiki', 'wiki', 'sources.md'), '---\ndocument_kind: contract\ndocument_status: active\nauthorization_ref: User\n---\n# Sources\nUse primary sources.');
const db = openDb(path.join(temp, 'db.sqlite'));
try {
  setWikiSettings(db, { enabled: true, projectWikis: 'folder' });
  const project = createSpace(db, { name: 'Project', folder });
  const start = { agent: 'codex', cwd: elsewhere, runId: 'test', resume: false, prompt: 'Check the sources', extra: { space: project.id } } as SpawnInfo;
  const deps = { db } as unknown as Deps;
  const allowed = await wiki.spawn!(start, deps);
  assert.match(allowed?.notes?.join('\n') ?? '', /Use primary sources/);
  updateSpace(db, project.id, { wikiFeatures: { contracts: false } });
  const denied = await wiki.spawn!(start, deps);
  assert.equal(denied?.notes?.length ?? 0, 0);
  console.log('New selected-project sessions respect contract gates before a key exists');
} finally {
  db.close();
  // Remove only scratch data belonging to the test.
  fs.rmSync(temp, { recursive: true, force: true });
}
