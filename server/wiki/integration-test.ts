// Exercises the native wiki tools against a disposable project and Hydor settings database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.ts';
import type { RunCtx } from '../features/types.ts';
import { setWikiSettings } from './settings/settings.ts';
import { wiki } from './index.ts';
import { wikiTools } from './tools.ts';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-tools-'));
const db = openDb(path.join(temp, 'hydor.db'));
try {
  const project = path.join(temp, 'project');
  const root = path.join(project, '.wiki');
  const hub = path.join(temp, 'hub');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(hub);
  fs.writeFileSync(path.join(root, '_index.md'), '# Existing wiki\n');
  setWikiSettings(db, { enabled: true, hubPath: hub, projectPath: '.wiki', gitIgnore: false });
  const ctx = { key: 'test:wiki', runId: 'wiki-test', agent: 'codex', cwd: project, deps: { db } } as unknown as RunCtx;
  const tool = (name: string) => wikiTools().find((t) => t.name === name)!;
  const invoke = async (name: string, args: Record<string, unknown>) => JSON.parse(String(await tool(name).run(args, ctx)));
  assert.equal((await invoke('wiki_status', {})).root, fs.realpathSync(root));
  const source = await invoke('wiki_ingest_text', { content: 'Source: the sky is blue.\n', origin: 'manual:sample' });
  assert.equal(fs.readFileSync(path.join(root, source.originalPath), 'utf8'), 'Source: the sky is blue.\n');
  assert.equal((await invoke('wiki_ingest_text', { content: 'Source: the sky is blue.\n', origin: 'manual:sample' })).existing, true);
  const article = `---\nsources:\n  - ${source.path}\n---\n# Sky\n\nBlue.\n`;
  await invoke('wiki_write', { path: 'wiki/concepts/sky.md', content: article, expectedSha256: null });
  const read = await invoke('wiki_read', { path: 'wiki/concepts/sky.md' });
  assert.equal(read.content, article);
  assert.deepEqual((await invoke('wiki_check', {})).issues, []);
  await assert.rejects(invoke('wiki_write', { path: 'raw/notes/lesson.md', content: 'private', expectedSha256: null }), /lessons workflow/);
  await assert.rejects(invoke('wiki_write', { path: read.path, content: 'stale', expectedSha256: '0'.repeat(64) }), /conflict/);
  setWikiSettings(db, { enabled: false });
  assert.deepEqual(wiki.tools!(ctx), []);
  await assert.rejects(invoke('wiki_status', {}), /off/);
  console.log('Native wiki tools: project, ingestion, reading, checking and guards passed');
} finally {
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
