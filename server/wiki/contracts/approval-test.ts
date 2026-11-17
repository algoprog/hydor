// Exact contract approval rejects denial, stale sources and switched-off access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApprovalRequest } from '../../../shared/types.ts';
import type { ApprovalAnswer } from '../../agents/live.ts';
import { openDb } from '../../db.ts';
import type { RunCtx } from '../../features/types.ts';
import { contractTools, previewContract } from './tools.ts';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-contract-approval-'));
const root = path.join(temp, 'wiki');
fs.mkdirSync(path.join(root, 'wiki'), { recursive: true });
const source = path.join(root, 'wiki', 'source.md');
fs.writeFileSync(source, '# Source\nUse citations.\n');
const db = openDb(path.join(temp, 'app.db'));
try {
  let decision: ApprovalAnswer = { decision: 'decline' };
  let mutate: (() => void) | undefined;
  let allowed = true;
  const cards: ApprovalRequest[] = [];
  const adapter = { ask: async (card: ApprovalRequest, options: { check?: (a: ApprovalAnswer) => string | null } = {}) => {
    cards.push(card); mutate?.(); const error = options.check?.(decision); if (error) throw new Error(error); return decision;
  } };
  const ctx = { key: 'codex:test', runId: 'test', agent: 'codex', cwd: temp, deps: { db, sessions: { adapterByRun: () => adapter } } } as unknown as RunCtx;
  const resolve = () => { if (!allowed) throw new Error('Contracts disabled'); return root; };
  const adopt = contractTools(resolve, async () => undefined).find((t) => t.name === 'wiki_contract_adopt')!;
  const args = { slug: 'citations', title: 'Citations', scope: 'Research', origin: 'User request', sourcePath: 'wiki/source.md' };
  const preview = previewContract(root, args);
  assert.equal(await adopt.run({ ...args, sha256: preview.sha256 }, ctx), 'Not saved');
  assert.equal(fs.existsSync(path.join(root, preview.path)), false);
  assert.ok(cards[0].detail?.includes(preview.content.trimEnd()));
  decision = { decision: 'accept', form: { confirmed: 'Yes' } };
  mutate = () => fs.writeFileSync(source, '# Changed source\n');
  await assert.rejects(() => adopt.run({ ...args, sha256: preview.sha256 }, ctx), /preview changed/);
  assert.equal(fs.existsSync(path.join(root, preview.path)), false);
  mutate = () => { allowed = false; };
  const fresh = previewContract(root, args);
  await assert.rejects(() => adopt.run({ ...args, sha256: fresh.sha256 }, ctx), /Contracts disabled/);
  assert.equal(fs.existsSync(path.join(root, preview.path)), false);
  allowed = true; mutate = undefined;
  await adopt.run({ ...args, sha256: fresh.sha256 }, ctx);
  assert.equal(fs.readFileSync(path.join(root, fresh.path), 'utf8'), fresh.content);
  console.log('Contract approval binds source, content and enabled state');
} finally {
  db.close();
  // Remove only the scratch wiki used by this test.
  fs.rmSync(temp, { recursive: true, force: true });
}
