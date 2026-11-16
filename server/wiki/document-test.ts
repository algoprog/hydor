// Exercise original document preservation and extraction with a disposable OOXML document.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDb } from '../db.ts';
import type { RunCtx } from '../features/types.ts';
import { setWikiSettings } from './settings/settings.ts';
import { wikiTools } from './tools.ts';

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-doc-')));
const db = openDb(path.join(tmp, 'app.db'));
try {
  const project = path.join(tmp, 'project');
  const root = path.join(project, '.wiki');
  const source = path.join(project, 'brief.docx');
  const parts = path.join(tmp, 'parts');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(parts, 'word'), { recursive: true });
  // Hydor's OOXML reader recognizes the standard document part of a Word package.
  fs.writeFileSync(path.join(parts, '[Content_Types].xml'), '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  fs.writeFileSync(path.join(parts, 'word', 'document.xml'), '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>The lighthouse is blue.</w:t></w:r></w:p></w:body></w:document>');
  execFileSync('zip', ['-q', '-r', source, '[Content_Types].xml', 'word'], { cwd: parts });
  const original = fs.readFileSync(source);
  setWikiSettings(db, { enabled: true, hubPath: tmp, projectPath: '.wiki', gitIgnore: true });
  const ctx = { key: 'codex:doc', runId: 'doc', agent: 'codex', cwd: project, deps: { db } } as unknown as RunCtx;
  const tool = wikiTools().find((item) => item.name === 'wiki_ingest_document')!;
  const ingest = async (args: Record<string, unknown>) => JSON.parse(String(await tool.run(args, ctx)));
  const one = await ingest({ path: 'brief.docx', origin: 'Manual document A' });
  assert.deepEqual(fs.readFileSync(path.join(root, one.originalPath)), original);
  assert.match(fs.readFileSync(path.join(root, one.path), 'utf8'), /The lighthouse is blue/);
  assert.equal(one.format, 'docx');
  assert.equal(one.existing, false);
  assert.equal(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'), '/.wiki/\n');
  assert.equal((await ingest({ path: 'brief.docx', origin: 'Manual document A' })).existing, true);
  const other = await ingest({ path: 'brief.docx', origin: 'Manual document B' });
  assert.notEqual(other.path, one.path);
  assert.equal(other.originalPath, one.originalPath);
  assert.match(fs.readFileSync(path.join(root, other.path), 'utf8'), /Manual document B/);
  fs.symlinkSync(source, path.join(project, 'link.docx'));
  await assert.rejects(ingest({ path: 'link.docx' }), /symbolic/);
  fs.mkdirSync(path.join(project, '.archive'));
  fs.copyFileSync(source, path.join(project, '.archive', 'old.docx'));
  await assert.rejects(ingest({ path: '.archive/old.docx' }), /excluded/);
  await assert.rejects(ingest({ path: 'brief.docx', origin: 'https://example.invalid/?token=secret' }), /credentials|sensitive/);
  fs.writeFileSync(path.join(project, 'huge.docx'), 'x');
  fs.truncateSync(path.join(project, 'huge.docx'), 20 * 1024 * 1024 + 1);
  await assert.rejects(ingest({ path: 'huge.docx' }), /20 MiB/);
  console.log('Wiki document ingestion tests passed');
} finally {
  db.close();
  // Remove only the disposable test directory.
  fs.rmSync(tmp, { recursive: true, force: true });
}
