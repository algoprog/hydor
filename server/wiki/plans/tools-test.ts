// Exercise exact plan previews, user approval, provenance and stale-write protection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApprovalRequest } from '../../../shared/types.ts';
import type { ApprovalAnswer } from '../../agents/live.ts';
import { openDb } from '../../db.ts';
import type { RunCtx } from '../../features/types.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { planTools, previewPlan } from './tools.ts';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-plan-adoption-')));
const root = path.join(temp, 'wiki');
fs.mkdirSync(path.join(root, 'wiki', 'references'), { recursive: true });
fs.mkdirSync(path.join(root, 'output', 'projects', 'existing'), { recursive: true });
fs.mkdirSync(path.join(root, 'output', 'evidence', 'existing'), { recursive: true });
const sourcePath = path.join(root, 'wiki', 'references', 'proposal.md');
const source = '# Proposal\n\nWP-01: implement and test.\n\n';
fs.writeFileSync(sourcePath, source);
const registerPath = path.join(root, 'output', 'evidence', 'existing', 'evidence.md');
fs.writeFileSync(registerPath, '# Evidence\nWP-01: blocked; acceptance pending.\n');
const db = openDb(path.join(temp, 'app.db'));
try {
  setWikiSettings(db, { enabled: true, hubPath: root });
  const cards: ApprovalRequest[] = [];
  let decision: ApprovalAnswer = { decision: 'decline' };
  let mutate: (() => void) | null = null;
  const adapter = { ask: async (card: ApprovalRequest, options: { check?: (a: ApprovalAnswer) => string | null } = {}) => {
    cards.push(card);
    mutate?.();
    const error = options.check?.(decision);
    if (error) throw new Error(error);
    return decision;
  } };
  const ctx = { key: 'codex:plan', runId: 'test', agent: 'codex', cwd: temp, deps: { db, sessions: { adapterByRun: () => adapter } } } as unknown as RunCtx;
  const tools = planTools(() => root);
  const preview = tools.find((tool) => tool.name === 'wiki_plan_preview')!;
  const adopt = tools.find((tool) => tool.name === 'wiki_plan_adopt')!;
  const args = { slug: 'new-plan', origin: 'User-selected proposal', sourcePath: 'wiki/references/proposal.md', registerPath: 'output/evidence/existing/evidence.md' };
  const planned = JSON.parse(String(await preview.run(args, ctx)));
  assert.equal(planned.sourcePath, args.sourcePath);
  assert.equal(planned.registerPath, args.registerPath);
  assert.ok(planned.existingPlans.includes(args.registerPath));
  assert.ok(planned.content.startsWith(source), 'source text must be retained exactly');
  assert.equal(fs.existsSync(path.join(root, planned.path)), false, 'preview must not write');
  assert.equal(await adopt.run({ ...args, sha256: planned.sha256 }, ctx), 'Not saved');
  assert.equal(fs.existsSync(path.join(root, planned.path)), false, 'decline must not write');
  assert.ok(cards[0].detail?.includes(planned.content.trimEnd()), 'approval shows exact planned contents');
  await assert.rejects(() => adopt.run({ ...args, sha256: '0'.repeat(64) }, ctx), /preview changed/i);
  decision = { decision: 'accept', form: { confirmed: 'Yes' } };
  mutate = () => fs.writeFileSync(registerPath, '# Changed evidence\n');
  await assert.rejects(() => adopt.run({ ...args, sha256: planned.sha256 }, ctx), /preview changed/i);
  assert.equal(fs.existsSync(path.join(root, planned.path)), false, 'a concurrent register change must abort');
  mutate = null;
  const fresh = await previewPlan(root, args);
  const saved = JSON.parse(String(await adopt.run({ ...args, sha256: fresh.sha256 }, ctx)));
  assert.equal(saved.registerPath, args.registerPath);
  assert.equal(saved.implementation, 'not authorized by plan adoption');
  assert.equal(fs.readFileSync(path.join(root, fresh.path), 'utf8'), fresh.content);
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), source, 'adoption leaves source unchanged');
  assert.equal(fs.readFileSync(registerPath, 'utf8'), '# Changed evidence\n', 'adoption leaves the chosen register unchanged');
  await assert.rejects(() => previewPlan(root, args), /already exists/);
  const registerContent = '## Execution control\n\nImplementation: not started.\nDeployment: not requested.\nAcceptance: not started.';
  const combined = await previewPlan(root, { slug: 'combined', origin: 'Chat', content: '# Plan\n\nWP-02: test.\n', registerContent });
  assert.equal(combined.registerPath, combined.path);
  assert.match(combined.content, /Implementation: not started/);
  assert.match(combined.content, /Deployment: not requested/);
  assert.match(combined.content, /Acceptance: not started/);
  const translated = await previewPlan(root, { slug: 'deutsch', origin: 'Chat', content: '# Plan\nWP-03: Prüfen.\n', registerContent: '## Umsetzungskontrolle\nUmsetzung: offen.\nAuslieferung: nicht beauftragt.\nAbnahme: offen.' });
  assert.match(translated.content, /## Umsetzungskontrolle/);
  assert.doesNotMatch(translated.content, /Implementation: not started/);
  // The register is evidence, never inside the plans area (where only these tools write).
  for (const bad of ['output/projects/existing/evidence.md', 'wiki/references/proposal.md', 'output/evidence/../projects/existing/evidence.md', 'output/evidence/existing/missing.md']) await assert.rejects(() => previewPlan(root, { ...args, slug: 'other', registerPath: bad }), /execution register|not an active|Missing|ENOENT/, bad);
  await assert.rejects(() => previewPlan(root, { slug: 'wrong', origin: 'Chat', content: '# Plan\n## Evidence\nExisting\n' }), /appears to contain a register/);
  await assert.rejects(() => previewPlan(root, { slug: '../escape', origin: 'Chat', content: 'No' }), /valid plan folder/);
  await assert.rejects(() => previewPlan(root, { slug: 'wrong', origin: 'https://example.test/?token=secret', content: 'No' }), /origin/i);
  console.log('Plan preview, approval and concurrent-change tests passed');
} finally {
  db.close();
  // Remove only the disposable test data created above.
  fs.rmSync(temp, { recursive: true, force: true });
}
