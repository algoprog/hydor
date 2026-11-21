// Verify plan revisions kept as ordinary snapshots, explicit approval and fail-closed concurrent writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  // Snapshots are ordinary files: nothing is made read-only or immutable, and record.json holds the checksum that detects changes.
  assert.equal('protection' in record, false);
  assert.equal('protection' in result, false);
  for (const name of ['document.md', 'record.json', 'WHY.md']) {
    assert.equal(fs.statSync(path.join(archived, name)).mode & 0o200, 0o200, `${name} stays writable by its owner`);
    fs.accessSync(path.join(archived, name), fs.constants.W_OK);
  }
  assert.equal(record.sha256, wikiHash(fs.readFileSync(path.join(archived, 'document.md'))));
  assert.match(fs.readFileSync(file, 'utf8'), /revision: 4/);
  assert.match(fs.readFileSync(file, 'utf8'), /WP-2: New work/);
  assert.equal(cards, 3);
  assert.throws(() => previewRevision(root, args), /changed/i);
  // A colliding historical snapshot fails without replacing the current plan.
  const second = { ...args, expectedSha256: readWiki(root, args.path).sha256, content: `${fs.readFileSync(file, 'utf8')}\nWP-3: More work.\n` };
  assert.throws(() => previewRevision(root, { ...second, content: '# Plan\n\nWP-3: More work.\n' }), /work item ids the plan has: WP-1/);
  const next = previewRevision(root, second);
  fs.mkdirSync(path.join(root, next.snapshot));
  const beforeCollision = fs.readFileSync(file);
  assert.throws(() => applyRevision(root, second, next.sha256));
  assert.deepEqual(fs.readFileSync(file), beforeCollision);
  assert.throws(() => previewRevision(root, { ...second, path: 'output/projects/.archive/old/plan.md' }), /path must be output\/projects\/<plan>\/<file>\.md/);
  // A failed final replacement leaves the original intact and leaves no snapshot behind, so the plan can be revised again.
  const failureFile = path.join(root, 'output/projects/sample/failure-plan.md');
  const failureOriginal = '# Original plan\n';
  fs.writeFileSync(failureFile, failureOriginal);
  const failureArgs = { ...args, path: 'output/projects/sample/failure-plan.md', expectedSha256: wikiHash(failureOriginal), content: '# Changed plan\n' };
  const failurePreview = previewRevision(root, failureArgs);
  const rename = fs.renameSync;
  try {
    fs.renameSync = ((from: fs.PathLike, to: fs.PathLike) => { if (String(to) === failureFile) throw new Error('simulated replacement failure'); return rename(from, to); }) as typeof fs.renameSync;
    assert.throws(() => applyRevision(root, failureArgs, failurePreview.sha256), /simulated replacement failure/);
  } finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(failureFile, 'utf8'), failureOriginal);
  assert.equal(fs.existsSync(path.join(root, failurePreview.snapshot)), false, 'no snapshot of a plan that was not replaced');
  assert.deepEqual(fs.readdirSync(path.join(root, 'output/projects/.archive')).filter((name) => name.startsWith('.tmp-')), [], 'no half-made folder');
  assert.equal(fs.existsSync(path.join(root, '.hydor-wiki-write.lock')), false);
  assert.equal(fs.existsSync(path.join(root, 'output/projects/.archive/.revision.lock')), false);
  assert.equal(applyRevision(root, failureArgs, failurePreview.sha256).revision, 2, 'and the same revision goes through afterwards');
  assert.equal(fs.readFileSync(path.join(root, failurePreview.snapshot, 'document.md'), 'utf8'), failureOriginal);
  // A failure while the snapshot is built (here: it cannot be written) leaves nothing either.
  const buildFile = path.join(root, 'output/projects/sample/build-plan.md');
  fs.writeFileSync(buildFile, '# Build plan\n');
  const buildArgs = { ...args, path: 'output/projects/sample/build-plan.md', expectedSha256: wikiHash('# Build plan\n'), content: '# Build plan changed\n' };
  const buildPreview = previewRevision(root, buildArgs);
  const writeFile = fs.writeFileSync;
  try {
    fs.writeFileSync = ((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => { if (String(file).endsWith('record.json')) throw new Error('simulated disk full'); return (writeFile as (...a: unknown[]) => void)(file, ...rest); }) as typeof fs.writeFileSync;
    assert.throws(() => applyRevision(root, buildArgs, buildPreview.sha256), /disk full/);
  } finally { fs.writeFileSync = writeFile; }
  assert.equal(fs.existsSync(path.join(root, buildPreview.snapshot)), false);
  assert.deepEqual(fs.readdirSync(path.join(root, 'output/projects/.archive')).filter((name) => name.startsWith('.tmp-')), [], 'the temporary folder is removed');
  // A snapshot left by an interrupted run (its plan never replaced) is cleared; one of anything else is history and blocks.
  const leftover = path.join(root, buildPreview.snapshot);
  fs.mkdirSync(leftover);
  fs.writeFileSync(path.join(leftover, 'document.md'), '# Build plan\n');
  fs.writeFileSync(path.join(leftover, 'record.json'), JSON.stringify({ sha256: wikiHash('# Build plan\n') }));
  fs.chmodSync(path.join(leftover, 'document.md'), 0o444);
  assert.equal(applyRevision(root, buildArgs, buildPreview.sha256).revision, 2, 'a leftover snapshot of the same bytes does not block');
  fs.writeFileSync(path.join(root, 'output/projects/sample/history-plan.md'), '# History\n');
  const historyArgs = { ...args, path: 'output/projects/sample/history-plan.md', expectedSha256: wikiHash('# History\n'), content: '# History changed\n' };
  const historyPreview = previewRevision(root, historyArgs);
  fs.mkdirSync(path.join(root, historyPreview.snapshot));
  fs.writeFileSync(path.join(root, historyPreview.snapshot, 'record.json'), JSON.stringify({ sha256: wikiHash('# Something else\n') }));
  assert.throws(() => applyRevision(root, historyArgs, historyPreview.sha256), /already exists/);
  fs.rmSync(path.join(root, historyPreview.snapshot), { recursive: true });
  // A stale lock (old, or left by a process that is gone) is cleared; a fresh one from a live process is respected.
  const lockFile = path.join(root, 'output/projects/.archive/.revision.lock');
  fs.writeFileSync(lockFile, `${process.pid}\n${Date.now()}\n`);
  assert.throws(() => applyRevision(root, historyArgs, historyPreview.sha256), /locked/, 'a live holder keeps it');
  fs.writeFileSync(lockFile, 'other writer');
  const old = new Date(Date.now() - 20 * 60_000);
  fs.utimesSync(lockFile, old, old);
  assert.equal(applyRevision(root, historyArgs, historyPreview.sha256).revision, 2, 'a lock older than a few minutes is stale');
  assert.equal(fs.existsSync(lockFile), false);
  fs.writeFileSync(path.join(root, 'output/projects/sample/dead-plan.md'), '# Dead\n');
  const deadArgs = { ...args, path: 'output/projects/sample/dead-plan.md', expectedSha256: wikiHash('# Dead\n'), content: '# Dead changed\n' };
  const deadPreview = previewRevision(root, deadArgs);
  fs.writeFileSync(lockFile, '2147483646\n' + Date.now() + '\n');
  assert.equal(applyRevision(root, deadArgs, deadPreview.sha256).revision, 2, 'a lock whose process is gone is stale');
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
  // A filesystem that ignores chmod (a network share) changes nothing: the snapshot is plain files either way.
  const weakPath = 'output/projects/sample/weak.md';
  const weakOriginal = '# Weak protection plan\n';
  fs.writeFileSync(path.join(root, weakPath), weakOriginal);
  const weakArgs = { ...args, path: weakPath, content: '# Proposed plan\n', expectedSha256: wikiHash(weakOriginal) };
  const weakPreview = previewRevision(root, weakArgs);
  const chmod = fs.chmodSync;
  let chmods = 0;
  try {
    fs.chmodSync = (() => { chmods++; }) as typeof fs.chmodSync;
    assert.equal(applyRevision(root, weakArgs, weakPreview.sha256).revision, 2);
  } finally { fs.chmodSync = chmod; }
  assert.equal(chmods, 0, 'no mode is changed on the user\'s files');
  assert.equal(fs.readFileSync(path.join(root, weakPreview.snapshot, 'document.md'), 'utf8'), weakOriginal);
  // Words in document_status are fine; an ending status in the replacement is refused with its line; owned fields written oddly are ignored.
  const wordsPath = 'output/projects/sample/words.md';
  const wordsOriginal = '---\ndocument_status: In progress\ntitle: Words\n---\n# Words\n\nWP-1: Work.\n';
  fs.writeFileSync(path.join(root, wordsPath), wordsOriginal);
  const wordsArgs = { ...args, path: wordsPath, expectedSha256: wikiHash(wordsOriginal), content: wordsOriginal.replace('In progress', '"Waiting for review (draft 2)"') + '\nWP-2: More.\n' };
  assert.match(previewRevision(root, wordsArgs).content, /document_status: "Waiting for review \(draft 2\)"/);
  assert.throws(() => previewRevision(root, { ...wordsArgs, content: wordsOriginal.replace('In progress', 'Archived') + '\nWP-2: More.\n' }), /The replacement, line 2: document_status "Archived" ends a plan/);
  const oddOwned = '---\ndocument_id: not a valid id!\ndocument_kind: [a, b]\nrevision: 3 (draft)\nchange_reason: >\n  long text\ndocument_status: In progress\ntitle: Words\n---\n# Words\n\nWP-1: Work.\n\nWP-2: More.\n';
  const oddPreview = previewRevision(root, { ...wordsArgs, content: oddOwned });
  assert.match(oddPreview.content, /^---\ndocument_status: In progress\ntitle: Words\ndocument_id: "DOC-[a-f0-9]{12}"\ndocument_kind: "plan"\nrevision: 2\n/);
  assert.equal(oddPreview.content.includes('long text'), false, 'an owned field takes its continuation lines with it');
  // Errors in the current plan name the document, the field, the line and what was found.
  const badPath = 'output/projects/sample/bad.md';
  const bad = '---\ntitle: Bad\nrevision: 3 (draft)\n---\n# Bad\n';
  fs.writeFileSync(path.join(root, badPath), bad);
  const badArgs = { ...args, path: badPath, expectedSha256: wikiHash(bad), content: '# Better\n' };
  assert.throws(() => previewRevision(root, badArgs), (error: Error) => error.message === 'The current plan, line 3: revision must be a whole number (found "3 (draft)").');
  fs.writeFileSync(path.join(root, badPath), '---\ntitle: Bad\n');
  assert.throws(() => previewRevision(root, { ...badArgs, expectedSha256: wikiHash('---\ntitle: Bad\n') }), /The current plan's frontmatter opens with --- on line 1 but has no closing --- line/);
  assert.throws(() => previewRevision(root, { ...wordsArgs, content: '---\ndocument_status: a\ndocument_status: b\n---\n# X\nWP-1 WP-2\n' }), /The replacement, line 3: document_status appears twice \(first on line 2\)/);
  assert.throws(() => previewRevision(root, { ...wordsArgs, content: '---\ntitle: x\n<<: *base\n---\n# X\n' }), /The replacement, line 3: YAML merge keys \(<<:\) are not allowed/);
  // A replacement that drops work item ids names them (ten at most).
  const manyOriginal = `# Many\n\n${Array.from({ length: 12 }, (_, i) => `WI-${i + 1}: item`).join('\n')}\nWP-3: x\n`;
  fs.writeFileSync(path.join(root, 'output/projects/sample/many.md'), manyOriginal);
  const manyArgs = { ...args, path: 'output/projects/sample/many.md', expectedSha256: wikiHash(manyOriginal), content: '# Many\n\nWI-1: item\n' };
  assert.throws(() => previewRevision(root, manyArgs), /drops work item ids the plan has: WI-2, WI-3, WI-4, WI-5, WI-6, WI-7, WI-8, WI-9, WI-10, WI-11 and 2 more\. Keep every id/);
  assert.throws(() => previewRevision(root, { ...manyArgs, content: '' }), /The replacement is empty/);
  assert.throws(() => previewRevision(root, { ...manyArgs, reason: '' }), /The reason is missing/);
  assert.throws(() => previewRevision(root, { ...manyArgs, authorization: 'a\nb' }), /The authorization must be one line/);
  assert.throws(() => previewRevision(root, { ...manyArgs, path: 'output/projects/sample/_index.md' }), /not a plan/);
  assert.throws(() => previewRevision(root, { ...manyArgs, expectedSha256: wikiHash('other') }), /wiki_read it again for its current sha256/);
  const generic = wikiTools().find((tool) => tool.name === 'wiki_write')!;
  await assert.rejects(() => generic.run({ path: args.path, content: '# Bypass', expectedSha256: second.expectedSha256 }, ctx), /wiki_plan_revise/);
  // Clearly named older plans and explicitly typed plans cannot bypass revision rules.
  const older = 'output/projects/sample/old-umsetzungsplan.md';
  fs.writeFileSync(path.join(root, older), '# Older plan\n');
  await assert.rejects(() => generic.run({ path: older, content: '# Bypass', expectedSha256: wikiHash('# Older plan\n') }, ctx), /wiki_plan_revise/);
  const quoted = 'output/projects/sample/custom.md';
  const quotedContent = '---\n"document_kind" : "plan"\n---\n# Plan\n';
  fs.writeFileSync(path.join(root, quoted), quotedContent);
  await assert.rejects(() => generic.run({ path: quoted, content: '# Bypass', expectedSha256: wikiHash(quotedContent) }, ctx), /wiki_plan_revise/);
  const quotedPreview = previewRevision(root, { ...args, path: quoted, content: `${quotedContent}\nNew work.\n`, expectedSha256: wikiHash(quotedContent) });
  assert.equal((quotedPreview.content.match(/document_kind\s*:/g) ?? []).length, 1);
  console.log('Plan revision preview, approvals, snapshots and concurrency passed');
} finally {
  db.close();
  // Remove only this disposable test wiki.
  fs.rmSync(temp, { recursive: true, force: true });
}
