// Previewing a first contract must not create a wiki; approval creates only the reviewed target.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApprovalAnswer } from '../../agents/live.ts';
import { openDb } from '../../db.ts';
import type { RunCtx } from '../../features/types.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { createSpace } from '../../spaces/index.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { guardProject } from '../tools.ts';
import { contractTarget, createContractTarget } from './target.ts';
import { contractTools, previewContract } from './tools.ts';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-contract-empty-'));
const db = openDb(path.join(temp, 'db.sqlite'));
try {
  for (const location of ['folder', 'hub'] as const) {
    const folder = path.join(temp, location); fs.mkdirSync(folder);
    const hub = path.join(temp, `hub-${location}`);
    setWikiSettings(db, { projectWikis: location, hubPath: hub, gitIgnore: false });
    const sp = createSpace(db, { name: `Project ${location}`, folder });
    const key = `codex:${location}`;
    setSessionExtra(db, key, { space: sp.id });
    let decision: ApprovalAnswer = { decision: 'decline' };
    const adapter = { ask: async () => decision };
    const ctx = { key, cwd: folder, runId: 'test', agent: 'codex', deps: { db, sessions: { adapterByRun: () => adapter } } } as unknown as RunCtx;
    const registryBefore = db.prepare("select name from sqlite_master where type='table' and name='wiki_project_dirs'").get();
    const root = contractTarget(ctx);
    assert.deepEqual(db.prepare("select name from sqlite_master where type='table' and name='wiki_project_dirs'").get(), registryBefore, 'preview does not create a project registry');
    const args = { slug: 'quality', title: 'Quality', scope: 'Project', origin: 'User request', content: 'Review changes.' };
    const before = previewContract(root, args);
    const adopt = contractTools(contractTarget, guardProject, createContractTarget).find((t) => t.name === 'wiki_contract_adopt')!;
    assert.equal(fs.existsSync(root), false);
    assert.equal(await adopt.run({ ...args, sha256: before.sha256 }, ctx), 'Not saved');
    assert.equal(fs.existsSync(root), false, 'declining did not create a wiki');
    decision = { decision: 'accept', form: { confirmed: 'Yes' } };
    await adopt.run({ ...args, sha256: before.sha256 }, ctx);
    assert.equal(fs.readFileSync(path.join(root, before.path), 'utf8'), before.content);
  }
  // A prospective project wiki must never follow a symlink outside the project.
  const unsafe = path.join(temp, 'unsafe'), outside = path.join(temp, 'outside');
  fs.mkdirSync(unsafe); fs.mkdirSync(outside); fs.symlinkSync(outside, path.join(unsafe, '.wiki'));
  setWikiSettings(db, { projectWikis: 'folder', projectPath: '.wiki' });
  const unsafeProject = createSpace(db, { name: 'Unsafe', folder: unsafe });
  setSessionExtra(db, 'codex:unsafe', { space: unsafeProject.id });
  const unsafeCtx = { key: 'codex:unsafe', cwd: unsafe, deps: { db } } as unknown as RunCtx;
  assert.throws(() => contractTarget(unsafeCtx), /outside/);
  console.log('First contract previews do not create project wikis');
} finally {
  db.close();
  // Only the test's scratch project and database are removed.
  fs.rmSync(temp, { recursive: true, force: true });
}
