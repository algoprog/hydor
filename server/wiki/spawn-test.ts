// What the wiki tells a new session as it starts: one picked into a project on the start page before it has a key (a new
// Codex thread) is told of that project's wiki, even when it works in a folder outside the project.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.ts';
import type { Deps, SpawnAdditions } from '../features/types.ts';
import { onIndexed, progress } from '../knowledge/indexer.ts';
import { createSpace } from '../spaces/index.ts';
import { wiki } from './index.ts';
import { wikiRoot } from './roots.ts';
import { setWikiSettings } from './settings/settings.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-spawn-')));
const db = openDb(path.join(temp, 'test.db'));
// The wikis a start binds are read in the background: let that finish before the database closes.
const indexed = new Set<string>();
let lastIndexed = Date.now();
onIndexed((base) => {
  indexed.add(base);
  lastIndexed = Date.now();
});
try {
  setWikiSettings(db, { enabled: true, hubPath: path.join(temp, 'hub') });
  const folder = path.join(temp, 'shop');
  const elsewhere = path.join(temp, 'scratch');
  fs.mkdirSync(folder);
  fs.mkdirSync(elsewhere);
  const space = createSpace(db, { name: 'Shop', folder });
  const root = wikiRoot(db, space.id, { create: true })!;
  fs.writeFileSync(path.join(root, 'wiki', 'deploys.md'), '---\ntitle: Deploys\n---\n\n# Deploys\n\nWe deploy on Fridays.\n');
  const d = { db } as unknown as Deps;
  const told = async (cwd: string, extra: Record<string, unknown>) =>
    (((await wiki.spawn!({ agent: 'codex', cwd, runId: 'r', resume: false, extra }, d)) as SpawnAdditions | undefined)?.instructions ?? []).some((line) => line.startsWith('Wiki memory is on'));
  assert.equal(await told(elsewhere, { space: space.id }), true, 'picked on the start page, working elsewhere, no key yet: its project’s wiki');
  assert.equal(await told(folder, {}), true, 'in the project’s folder: found by its folder, as before');
  assert.equal(await told(elsewhere, {}), false, 'neither: no project wiki to tell of');
  assert.equal(await told(elsewhere, { space: 'spgone' }), false, 'a project that no longer exists is not one');
  for (let i = 0; i < 300 && (indexed.size < 2 || progress.size || Date.now() - lastIndexed < 250); i++) await new Promise((r) => setTimeout(r, 20));
  console.log('A new session picked into a project is told of its wiki before it has a key');
} finally {
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
