// Plan changes remain available while an embedded execution register is protected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApprovalAnswer } from '../../agents/live.ts';
import type { RunCtx } from '../../features/types.ts';
import { openDb } from '../../db.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { createSpace } from '../../spaces/index.ts';
import { wiki } from '../index.ts';
import { readWiki } from '../core.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { executionOnlyChange } from './register.ts';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-execution-gate-'));
const project = path.join(temp, 'project'), root = path.join(project, '.wiki');
fs.mkdirSync(path.join(root, 'output/projects/example'), { recursive: true });
const file = path.join(root, 'output/projects/example/plan.md');
fs.writeFileSync(file, '# Plan\n\nWork.\n\n## Execution control\n\nOpen.\n');
const db = openDb(path.join(temp, 'db.sqlite'));
try {
  setWikiSettings(db, { enabled: true, projectWikis: 'folder' });
  const sp = createSpace(db, { name: 'Project', folder: project });
  const key = 'codex:execution';
  setSessionExtra(db, key, { space: sp.id, wikiFeatures: { execution: false } });
  let answer: ApprovalAnswer = { decision: 'decline' };
  let duringApproval: (() => void) | undefined;
  const adapter = { ask: async (_card: unknown, options: { check?: (value: ApprovalAnswer) => string | null } = {}) => {
    duringApproval?.();
    const error = options.check?.(answer);
    if (error) throw new Error(error);
    return answer;
  } };
  const ctx = { key, cwd: project, agent: 'codex', runId: 'test', deps: { db, sessions: { adapterByRun: () => adapter } } } as unknown as RunCtx;
  const adoption = wiki.tools!(ctx).find((t) => t.name === 'wiki_plan_preview')!;
  const standalone = { slug: 'no-register', origin: 'User request', content: '# Plan\n\nNew scope.\n' };
  assert.equal(JSON.parse(String(await adoption.run(standalone, ctx))).registerPath, null);
  await assert.rejects(adoption.run({ ...standalone, registerContent: '## Execution control\nOpen.' }, ctx), /Execution control is off/);
  const preview = wiki.tools!(ctx).find((t) => t.name === 'wiki_plan_revision_preview')!;
  const initial = readWiki(root, 'output/projects/example/plan.md');
  const args = { path: initial.path, expectedSha256: initial.sha256, content: initial.content.replace('Work.', 'More work.'), reason: 'Update scope', authorization: 'User request' };
  assert.ok(await preview.run(args, ctx), 'plan text remains editable');
  await assert.rejects(preview.run({ ...args, content: initial.content.replace('Open.', 'Done.') }, ctx), /Execution control is off/);
  // Explicit markers also protect a user-selected register heading.
  fs.writeFileSync(file, '# Plan\n\nWork.\n\n<!-- hydor-execution-register: "Team dashboard" -->\n## Team dashboard\n\nOpen.\n');
  const custom = readWiki(root, 'output/projects/example/plan.md');
  await assert.rejects(preview.run({ ...args, expectedSha256: custom.sha256, content: custom.content.replace('Open.', 'Done.') }, ctx), /Execution control is off/);
  // With plans off and execution on, only the identified register can be revised.
  setSessionExtra(db, key, { wikiFeatures: { plans: false, execution: true } });
  const execute = { ...args, expectedSha256: custom.sha256, content: custom.content.replace('Open.', 'Done.'), mode: 'execution' };
  await assert.rejects(preview.run({ ...execute, mode: 'plan' }, ctx), /Wiki plans are off/);
  await assert.rejects(preview.run({ ...execute, content: execute.content.replace('Work.', 'Changed scope.') }, ctx), /only one identified/);
  assert.equal(executionOnlyChange('# Plan\n```md\n## Evidence\nOpen\n```\n', '# Plan\n```md\n## Evidence\nDone\n```\n'), false);
  assert.equal(executionOnlyChange('## Evidence\nOpen\n## Execution control\nOpen\n', '## Evidence\nDone\n## Execution control\nOpen\n'), false);
  const proposal = JSON.parse(String(await preview.run(execute, ctx)));
  const revise = wiki.tools!(ctx).find((t) => t.name === 'wiki_plan_revise')!;
  assert.equal(await revise.run({ ...execute, sha256: proposal.sha256 }, ctx), 'Not saved');
  assert.equal(fs.readFileSync(file, 'utf8'), custom.content);
  answer = { decision: 'accept', form: { confirmed: 'Yes' } };
  duringApproval = () => setSessionExtra(db, key, { wikiFeatures: { execution: false } });
  await assert.rejects(revise.run({ ...execute, sha256: proposal.sha256 }, ctx), /Execution control is off/);
  assert.equal(fs.readFileSync(file, 'utf8'), custom.content);
  duringApproval = undefined;
  setSessionExtra(db, key, { wikiFeatures: { execution: true } });
  const saved = JSON.parse(String(await revise.run({ ...execute, sha256: proposal.sha256 }, ctx)));
  assert.equal(fs.readFileSync(path.join(root, saved.snapshot, 'document.md'), 'utf8'), custom.content);
  assert.match(fs.readFileSync(file, 'utf8'), /Done\./);
  console.log('Embedded execution tracking is independently gated');
} finally {
  db.close();
  // Delete only scratch data for this test.
  fs.rmSync(temp, { recursive: true, force: true });
}
