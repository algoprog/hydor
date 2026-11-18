// Exercises the native wiki tools against a disposable project and Hydor settings database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.ts';
import type { RunCtx } from '../features/types.ts';
import { createSpace, updateSpace } from '../spaces/index.ts';
import { wikiRoot } from './roots.ts';
import { setWikiSettings } from './settings/settings.ts';
import { wiki } from './index.ts';
import { projectWikiTarget, wikiTools } from './tools.ts';
import { setSessionExtra } from '../sessionExtra.ts';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-tools-')));
const db = openDb(path.join(temp, 'hydor.db'));
try {
  const project = path.join(temp, 'project');
  const hub = path.join(temp, 'hub');
  fs.mkdirSync(project);
  const space = createSpace(db, { name: 'Sky project', folder: project });
  setWikiSettings(db, { hubPath: hub, projectWikis: 'hub' });
  const ctx = { key: 'test:wiki', runId: 'wiki-test', agent: 'codex', cwd: project, deps: { db } } as unknown as RunCtx;
  const tool = (name: string) => wikiTools().find((t) => t.name === name)!;
  const invoke = async (name: string, args: Record<string, unknown>) => JSON.parse(String(await tool(name).run(args, ctx)));
  // On by default; nothing exists yet, and reading says so without making anything.
  assert.ok(wiki.tools!(ctx).length > 0);
  assert.deepEqual(await invoke('wiki_status', {}), { root: null, empty: true, settings: (await invoke('wiki_status', {})).settings });
  assert.equal((await invoke('wiki_read', { path: 'index.md' })).empty, true);
  assert.equal((await invoke('wiki_check', {})).empty, true);
  assert.equal(fs.existsSync(hub), false, 'reading never makes the hub');
  // The first write makes the project's wiki in the hub (not in the project's folder).
  const source = await invoke('wiki_ingest_text', { content: 'Source: the sky is blue.\n', origin: 'manual:sample' });
  const root = wikiRoot(db, space.id)!;
  assert.ok(root.startsWith(path.join(hub, 'projects') + path.sep));
  assert.deepEqual(fs.readdirSync(project), [], 'nothing is written into the project folder');
  assert.equal((await invoke('wiki_status', {})).root, root);
  assert.equal(fs.readFileSync(path.join(root, source.originalPath), 'utf8'), 'Source: the sky is blue.\n');
  assert.equal((await invoke('wiki_ingest_text', { content: 'Source: the sky is blue.\n', origin: 'manual:sample' })).existing, true);
  const article = `---\nsources:\n  - ${source.path}\n---\n# Sky\n\nBlue.\n`;
  await invoke('wiki_write', { path: 'wiki/concepts/sky.md', content: article, expectedSha256: null });
  const read = await invoke('wiki_read', { path: 'wiki/concepts/sky.md' });
  assert.equal(read.content, article);
  // The index follows every article written, so the new article is listed there and not an orphan (check-test.ts covers orphans).
  assert.match((await invoke('wiki_read', { path: 'index.md' })).content, /\]\(wiki\/concepts\/sky\.md\)/, 'the index lists the article just written');
  assert.ok(!(await invoke('wiki_check', {})).issues.some((issue: { path: string; detail: string }) => issue.path === 'wiki/concepts/sky.md' && /no incoming/i.test(issue.detail)));
  await assert.rejects(invoke('wiki_write', { path: 'raw/notes/lesson.md', content: 'private', expectedSha256: null }), /wiki_ingest/);
  await assert.rejects(invoke('wiki_write', { path: read.path, content: 'stale', expectedSha256: '0'.repeat(64) }), /conflict/);
  // Secrets are not kept: not in pasted text, not in an origin.
  await assert.rejects(invoke('wiki_ingest_text', { content: 'Use AKIAIOSFODNN7EXAMPLE for the bucket.', origin: 'manual:x' }), /credentials/);
  await assert.rejects(invoke('wiki_ingest_text', { content: 'fine', origin: 'ssh://deploy:hunter2@host.example/repo' }), /credentials/);
  await assert.rejects(invoke('wiki_ingest_text', { content: 'fine', origin: 'https://example.org/hook/xoxb-123456789012-abcdefghijklmnop' }), /credentials/);
  // A folder that is not a project never gets a wiki of its own, whatever it holds: its sessions use the shared wiki.
  const unregistered = path.join(temp, 'unregistered');
  const localWiki = path.join(unregistered, '.wiki');
  fs.mkdirSync(localWiki, { recursive: true });
  const localCtx = { ...ctx, key: 'test:unregistered', cwd: unregistered };
  assert.throws(() => projectWikiTarget(localCtx), /no project wiki/, 'plans need a project wiki');
  assert.equal(JSON.parse(String(await tool('wiki_status').run({}, localCtx))).root, fs.realpathSync(hub), 'a .wiki folder in a folder that is not a project is not its wiki');
  fs.writeFileSync(path.join(unregistered, 'AGENTS.md'), '- Wiki: `.wiki/_index.md`\n');
  assert.equal(JSON.parse(String(await tool('wiki_status').run({}, localCtx))).root, fs.realpathSync(hub), 'nor is a Wiki line in its AGENTS.md');
  await tool('wiki_ingest_text').run({ content: 'Source: shared.\n', origin: 'manual:shared' }, localCtx);
  assert.deepEqual(fs.readdirSync(localWiki), [], 'nothing is written into that folder');
  assert.equal(fs.existsSync(path.join(unregistered, '.gitignore')), false);
  setSessionExtra(db, localCtx.key, { confidential: true });
  await assert.rejects(tool('wiki_status').run({}, localCtx), /unavailable in confidential sessions/, 'a Confidential chat has no wiki');
  // A session starting in the project: told about wiki memory, the agent asked to send checkpoints, the wiki bound as its knowledge and left bound.
  const deps = { db } as unknown as Parameters<NonNullable<typeof wiki.spawn>>[1];
  const info = { agent: 'claude' as const, key: 'claude:s1', cwd: project, runId: 'r1', resume: false, extra: { space: space.id } };
  const bindings = () => db.prepare('select base, active from kb_wiki_bindings where space = ?').all(space.id) as { base: string; active: number }[];
  const added = (await wiki.spawn!(info, deps))!;
  assert.match(added.instructions!.join(' '), /Wiki memory is on/);
  assert.doesNotMatch(added.instructions!.join(' '), /LLM|nvk/i);
  assert.deepEqual(added.env, { HYDOR_WIKI_EVENTS: '1' });
  assert.equal(bindings().length, 1);
  assert.equal(bindings()[0].active, 1);
  await wiki.spawn!({ ...info, key: 'claude:s2', runId: 'r2' }, deps);
  assert.deepEqual(bindings(), [{ ...bindings()[0], active: 1 }], 'a second session keeps the same binding bound');
  // LOOK only while the wiki has an article (or the session waits for a build of it): an empty wiki says nothing of itself.
  const sky = path.join(root, 'wiki', 'concepts', 'sky.md');
  const skyText = fs.readFileSync(sky, 'utf8');
  fs.rmSync(sky);
  const empty = (await wiki.spawn!({ ...info, key: 'claude:s3', runId: 'r3' }, deps))!;
  assert.doesNotMatch((empty.instructions ?? []).join(' '), /Wiki memory is on/, 'no article: no instruction');
  setSessionExtra(db, 'claude:s3', { memoryBuild: true });
  assert.match(((await wiki.spawn!({ ...info, key: 'claude:s3', runId: 'r4' }, deps))!.instructions ?? []).join(' '), /Wiki memory is on/, 'a session that waits for a build is told');
  assert.match(((await wiki.spawn!({ ...info, key: 'claude:s4', runId: 'r5', extra: { space: space.id, memoryBuild: true } }, deps))!.instructions ?? []).join(' '), /Wiki memory is on/, 'also from the extra it is spawned with');
  fs.mkdirSync(path.dirname(sky), { recursive: true });
  fs.writeFileSync(path.join(root, 'wiki', 'redirect.md'), '---\nredirect: wiki/concepts/sky.md\n---\n');
  assert.doesNotMatch(((await wiki.spawn!({ ...info, key: 'claude:s5', runId: 'r6' }, deps))!.instructions ?? []).join(' '), /Wiki memory is on/, 'a redirect is no article');
  fs.rmSync(path.join(root, 'wiki', 'redirect.md'));
  fs.writeFileSync(sky, skyText);
  assert.match(((await wiki.spawn!({ ...info, key: 'claude:s6', runId: 'r7' }, deps))!.instructions ?? []).join(' '), /Wiki memory is on/, 'an article again: told again (the check follows the folder)');
  // A confidential session gets nothing.
  assert.equal(await wiki.spawn!({ ...info, extra: { space: space.id, confidential: true } }, deps), undefined);
  // The project's own switch: off for this project, whatever Settings say.
  updateSpace(db, space.id, { wikiMemory: false });
  assert.deepEqual(wiki.tools!(ctx), []);
  assert.equal(await wiki.spawn!(info, deps), undefined, 'off: no instructions and no checkpoint events');
  assert.equal(bindings()[0].active, 0, 'off unbinds the project’s wiki');
  await assert.rejects(invoke('wiki_status', {}), /off for this project/);
  updateSpace(db, space.id, { wikiMemory: null });
  setWikiSettings(db, { enabled: false });
  assert.deepEqual(wiki.tools!(ctx), []);
  await assert.rejects(invoke('wiki_status', {}), /off/);
  console.log('Native wiki tools: project, ingestion, reading, checking and guards passed');
} finally {
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
