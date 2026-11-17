// Verify project defaults and per-chat feature gates against persisted settings.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.ts';
import { setSessionExtra, sessionExtra } from '../sessionExtra.ts';
import { createSpace, updateSpace } from '../spaces/index.ts';
import { wikiFeatureEnabled } from './access.ts';
import { setWikiSettings } from './settings/settings.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-access-'));
const db = openDb(path.join(dir, 'app.db'));
try {
  const project = createSpace(db, { name: 'One', folder: dir });
  const key = 'codex:one';
  // Both API spellings control the same persisted automatic-lessons choice.
  const lessonsKey = 'codex:lessons';
  setSessionExtra(db, lessonsKey, { space: project.id, wikiFeatures: { autoLessons: false } });
  assert.equal(sessionExtra(db, lessonsKey).wikiAutoLessons, false);
  assert.equal(wikiFeatureEnabled(db, lessonsKey, dir, 'autoLessons'), false);
  setSessionExtra(db, lessonsKey, { wikiAutoLessons: true });
  assert.equal(wikiFeatureEnabled(db, lessonsKey, dir, 'autoLessons'), true);
  setSessionExtra(db, lessonsKey, { wikiFeatures: { autoLessons: null } });
  assert.equal(sessionExtra(db, lessonsKey).wikiAutoLessons, undefined);
  assert.equal(wikiFeatureEnabled(db, lessonsKey, dir, 'autoLessons'), true);
  assert.throws(() => setSessionExtra(db, lessonsKey, { wikiAutoLessons: true, wikiFeatures: { autoLessons: false } }), /Conflicting automatic lessons choices/);
  setSessionExtra(db, key, { space: project.id, wikiFeatures: { plans: false, execution: true } });
  assert.equal(wikiFeatureEnabled(db, key, dir, 'plans'), false);
  assert.equal(wikiFeatureEnabled(db, key, dir, 'execution'), true);
  setSessionExtra(db, key, { wikiFeatures: { contracts: false } });
  assert.equal(sessionExtra(db, key).wikiFeatures?.plans, false);
  assert.equal(wikiFeatureEnabled(db, key, dir, 'autoContracts'), false);
  assert.throws(() => setSessionExtra(db, key, { wikiFeatures: { plans: 'yes' } }), /true, false or null/);
  updateSpace(db, project.id, { wikiFeatures: { plans: false } });
  setSessionExtra(db, key, { wikiFeatures: { plans: true } });
  assert.equal(wikiFeatureEnabled(db, key, dir, 'plans'), false);
  setWikiSettings(db, { featureDefaults: { plans: false } });
  updateSpace(db, project.id, { wikiFeatures: { plans: true } });
  assert.equal(wikiFeatureEnabled(db, key, dir, 'plans'), true, 'project can override a global default');
  updateSpace(db, project.id, { wikiMemory: false });
  assert.equal(wikiFeatureEnabled(db, key, dir, 'plans'), false);
  console.log('Wiki feature access honors project overrides and chat gates');
} finally {
  db.close();
  // This directory belongs exclusively to the test.
  fs.rmSync(dir, { recursive: true, force: true });
}
