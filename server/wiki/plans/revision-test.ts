// Verify protected plan revisions, explicit approval and fail-closed concurrent writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ApprovalAnswer } from '../../agents/live.ts';
import { openDb } from '../../db.ts';
import type { RunCtx } from '../../features/types.ts';
import { readWiki, wikiHash } from '../core.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { wikiTools } from '../tools.ts';
import { applyRevision, previewRevision } from './revision.ts';
import { revisionTools } from './revision-tools.ts';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-plan-revision-')));
const root = path.join(temp, 'project', '.wiki');
fs.mkdirSync(path.join(root, 'output', 'projects', 'sample'), { recursive: true });
const file = path.join(root, 'output', 'projects', 'sample', 'plan.md');
const original = '---\ndocument_id: "PLAN-EXAMPLE"\ndocument_kind: "plan"\nrevision: 3\n---\n# Plan\n\nWP-1: Existing work.\n';
fs.writeFileSync(file, original);
const db = openDb(path.join(temp, 'db.sqlite'));
try {
  setWikiSettings(db, { enabled: true, hubPath: root });
  let answer: ApprovalAnswer = { decision: 'decline' };
  let concurrent: (() => void) | undefined;
  let cards = 0;
  const adapter = { ask: async (_card: unknown, options: { check?: (a: ApprovalAnswer) => string | null } = {}) => {
    cards++;
    concurrent?.();
    const error = options.check?.(answer);
    if (error) throw new Error(error);
    return answer;
  } };
  const ctx = { key: 'codex:plan', runId: 'test', agent: 'codex', cwd: path.dirname(root), deps: { db, sessions: { adapterByRun: () => adapter } } } as unknown as RunCtx;
  const args = { path: 'output/projects/sample/plan.md', content: `${original}\nWP-2: New work.\n`, expectedSha256: wikiHash(original), reason: 'Add requested work', authorization: 'User request on 2026-11-16' };
  const tools = revisionTools(() => root);
  const previewTool = tools.find((tool) => tool.name === 'wiki_plan_revision_preview')!;
  const reviseTool = tools.find((tool) => tool.name === 'wiki_plan_revise')!;
  const preview = JSON.parse(String(await previewTool.run(args, ctx)));
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.equal(fs.existsSync(path.join(root, 'output/projects/.archive')), false, 'preview is read-only');
  assert.equal(await reviseTool.run({ ...args, sha256: preview.sha256 }, ctx), 'Not saved');
  assert.equal(fs.readFileSync(file, 'utf8'), original, 'declined proposal must not write');
  assert.equal(fs.existsSync(path.join(root, 'output/projects/.archive')), false);
  answer = { decision: 'accept', form: { confirmed: 'Yes' } };
  concurrent = () => fs.writeFileSync(file, `${original}\nConcurrent change.\n`);
  await assert.rejects(() => reviseTool.run({ ...args, sha256: preview.sha256 }, ctx), /changed|preview/i);
  assert.equal(fs.existsSync(path.join(root, 'output/projects/.archive')), false, 'concurrent changes must stop before creating snapshot');
  fs.writeFileSync(file, original);
  concurrent = undefined;
  // The archive-aware lifecycle helper uses this same lock; do not bypass it.
  const archiveRoot = path.join(root, 'output/projects/.archive');
  fs.mkdirSync(archiveRoot);
  fs.writeFileSync(path.join(archiveRoot, '.revision.lock'), 'other writer');
  assert.throws(() => applyRevision(root, args, preview.sha256), /locked/);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  fs.unlinkSync(path.join(archiveRoot, '.revision.lock'));
  const result = JSON.parse(String(await reviseTool.run({ ...args, sha256: preview.sha256 }, ctx)));
  assert.equal(result.revision, 4);
  assert.equal(result.implementation, 'not authorized by plan revision');
  const archived = path.join(root, result.snapshot);
  assert.equal(fs.readFileSync(path.join(archived, 'document.md'), 'utf8'), original);
  const record = JSON.parse(fs.readFileSync(path.join(archived, 'record.json'), 'utf8'));
  assert.equal(record.sha256, wikiHash(original));
  assert.equal(record.original_path, args.path);
  assert.equal(record.original_link_base, 'output/projects/sample');
  assert.equal(record.superseded_by_revision, 4);
  assert.equal(record.protection, result.protection);
  assert.equal(fs.statSync(path.join(archived, 'document.md')).mode & 0o222, 0);
  assert.equal(fs.statSync(path.join(archived, 'record.json')).mode & 0o222, 0);
  assert.equal(fs.statSync(path.join(archived, 'WHY.md')).mode & 0o222, 0);
  assert.match(fs.readFileSync(file, 'utf8'), /revision: 4/);
  assert.match(fs.readFileSync(file, 'utf8'), /WP-2: New work/);
  assert.equal(cards, 3);
  assert.throws(() => previewRevision(root, args), /changed/i);
  // A colliding historical snapshot fails without replacing the current plan.
  const second = { ...args, expectedSha256: readWiki(root, args.path).sha256, content: `${fs.readFileSync(file, 'utf8')}\nWP-3: More work.\n` };
  assert.throws(() => previewRevision(root, { ...second, content: '# Plan\n\nWP-3: More work.\n' }), /identifiers/);
  const next = previewRevision(root, second);
  fs.mkdirSync(path.join(root, next.snapshot));
  const beforeCollision = fs.readFileSync(file);
  assert.throws(() => applyRevision(root, second, next.sha256));
  assert.deepEqual(fs.readFileSync(file), beforeCollision);
  assert.throws(() => previewRevision(root, { ...second, path: 'output/projects/.archive/old/plan.md' }), /active project plan/);
  // A failed final replacement leaves the original intact and retains the protected snapshot for inspection.
  const failureFile = path.join(root, 'output/projects/sample/failure-plan.md');
  const failureOriginal = '# Original plan\n';
  fs.writeFileSync(failureFile, failureOriginal);
  const failureArgs = { ...args, path: 'output/projects/sample/failure-plan.md', expectedSha256: wikiHash(failureOriginal), content: '# Changed plan\n' };
  const failurePreview = previewRevision(root, failureArgs);
  const rename = fs.renameSync;
  try {
    fs.renameSync = (() => { throw new Error('simulated replacement failure'); }) as typeof fs.renameSync;
    assert.throws(() => applyRevision(root, failureArgs, failurePreview.sha256), /simulated replacement failure/);
  } finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(failureFile, 'utf8'), failureOriginal);
  assert.equal(fs.readFileSync(path.join(root, failurePreview.snapshot, 'document.md'), 'utf8'), failureOriginal);
  assert.equal(fs.existsSync(path.join(root, '.hydor-wiki-write.lock')), false);
  assert.equal(fs.existsSync(path.join(root, 'output/projects/.archive/.revision.lock')), false);
  // CRLF frontmatter must retain the stable identity and exact original snapshot bytes.
  const crlf = '---\r\ndocument_id: "PLAN-CRLF"\r\ndocument_kind: plan\r\nrevision: 2\r\n---\r\n# Plan\r\n';
  const crlfPath = 'output/projects/sample/crlf.md';
  fs.writeFileSync(path.join(root, crlfPath), crlf);
  const crlfArgs = { ...args, path: crlfPath, content: `${crlf}\r\nNew work.\r\n`, expectedSha256: wikiHash(crlf) };
  const crlfPreview = previewRevision(root, crlfArgs);
  assert.equal(crlfPreview.documentId, 'PLAN-CRLF');
  const crlfResult = applyRevision(root, crlfArgs, crlfPreview.sha256);
  assert.equal(crlfResult.revision, 3);
  assert.deepEqual(fs.readFileSync(path.join(root, crlfResult.snapshot, 'document.md')), Buffer.from(crlf));
  // Simulate a filesystem that reports read-only mode but still opens the snapshot for writing.
  const weakPath = 'output/projects/sample/weak.md';
  const weakOriginal = '# Weak protection plan\n';
  fs.writeFileSync(path.join(root, weakPath), weakOriginal);
  const weakArgs = { ...args, path: weakPath, content: '# Proposed plan\n', expectedSha256: wikiHash(weakOriginal) };
  const weakPreview = previewRevision(root, weakArgs);
  const weakDocument = path.join(root, weakPreview.snapshot, 'document.md');
  const open = fs.openSync;
  try {
    fs.openSync = ((file: fs.PathLike, flags: string | number, mode?: fs.Mode) => {
      if (String(file) === weakDocument && typeof flags === 'number' && (flags & fs.constants.O_APPEND)) return open(file, 'r');
      return open(file, flags, mode);
    }) as typeof fs.openSync;
    assert.throws(() => applyRevision(root, weakArgs, weakPreview.sha256), /cannot be protected/);
  } finally {
    fs.openSync = open;
    // Clear only a flag that this isolated test may have set on its own temporary snapshot.
    if (process.platform === 'darwin' && fs.existsSync(weakDocument)) spawnSync('/usr/bin/chflags', ['nouchg', weakDocument]);
  }
  assert.equal(fs.readFileSync(path.join(root, weakPath), 'utf8'), weakOriginal);
  const generic = wikiTools().find((tool) => tool.name === 'wiki_write')!;
  await assert.rejects(() => generic.run({ path: args.path, content: '# Bypass', expectedSha256: second.expectedSha256 }, ctx), /plan revision workflow/);
  // Clearly named older plans and explicitly typed plans cannot bypass revision protection.
  const older = 'output/projects/sample/old-umsetzungsplan.md';
  fs.writeFileSync(path.join(root, older), '# Older plan\n');
  await assert.rejects(() => generic.run({ path: older, content: '# Bypass', expectedSha256: wikiHash('# Older plan\n') }, ctx), /plan revision workflow/);
  const quoted = 'output/projects/sample/custom.md';
  const quotedContent = '---\n"document_kind" : "plan"\n---\n# Plan\n';
  fs.writeFileSync(path.join(root, quoted), quotedContent);
  await assert.rejects(() => generic.run({ path: quoted, content: '# Bypass', expectedSha256: wikiHash(quotedContent) }, ctx), /plan revision workflow/);
  const quotedPreview = previewRevision(root, { ...args, path: quoted, content: `${quotedContent}\nNew work.\n`, expectedSha256: wikiHash(quotedContent) });
  assert.equal((quotedPreview.content.match(/document_kind\s*:/g) ?? []).length, 1);
  console.log('Plan revision preview, approvals, protection and concurrency passed');
} finally {
  db.close();
  // Remove only this disposable test wiki; protected test files have ordinary read-only modes.
  fs.rmSync(temp, { recursive: true, force: true });
}
