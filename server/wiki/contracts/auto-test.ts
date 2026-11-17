// Proposals are generated only within permitted projects and require an exact user action to save.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { Deps, TurnInfo } from '../../features/types.ts';
import { openDb } from '../../db.ts';
import { notesOf } from '../../notes.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { createSpace, updateSpace } from '../../spaces/index.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { autoContracts, suggestContracts } from './auto.ts';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-auto-contract-'));
const project = path.join(temp, 'project');
fs.mkdirSync(path.join(project, '.wiki', 'wiki'), { recursive: true });
fs.writeFileSync(path.join(project, '.wiki', 'wiki', 'ordinary.md'), '# Example\ndocument_kind: contract\nnot-a-real-contract\n');
const db = openDb(path.join(temp, 'test.db'));
const app = Fastify();
const key = 'codex:contract-test';
const items = [
  { kind: 'user', id: 'user-1', seq: 1, text: 'Always cite the original source.', ts: Date.now() },
  { kind: 'assistant', id: 'assistant-1', seq: 2, text: 'I will cite original sources.', ts: Date.now() },
];
let onTimelineRead: (() => void) | undefined;
const deps = { app, db, sessions: { summary: (session: string) => ({ cwd: session === 'codex:empty-contract' ? path.join(temp, 'empty') : session === 'codex:no-project' ? temp : project, agent: 'codex' }), timeline: async () => ({ readMore: async () => { onTimelineRead?.(); }, parser: { items } }) } } as unknown as Deps;
const turn = { key, agent: 'codex', cwd: project, status: 'idle', external: false, startedAt: Date.now(), endedAt: Date.now() } as TurnInfo;
let calls = 0;
const ask = async (_db: unknown, request: { prompt: string }) => { assert.doesNotMatch(request.prompt, /not-a-real-contract/); calls++; return { proposal: { title: 'Sources', scope: 'Research', content: 'Cite the original source.', reason: 'User requirement', sourceIds: ['user-1'], existingPath: null } }; };
try {
  autoContracts.routes!(deps);
  setWikiSettings(db, { enabled: true, projectWikis: 'folder', gitIgnore: false });
  const sp = createSpace(db, { name: 'Research', folder: project });
  // Project, privacy and Memory gates are checked before the helper is called.
  for (const [session, extra] of [
    ['codex:no-project', {}],
    ['codex:private', { space: sp.id, confidential: true }],
    ['codex:no-memory', { space: sp.id, memory: false }],
    ['codex:no-contracts', { space: sp.id, wikiFeatures: { contracts: false } }],
  ] as const) {
    setSessionExtra(db, session, extra);
    await suggestContracts({ ...turn, key: session }, deps, ask as never);
    assert.equal(calls, 0, `${session} must not call the helper`);
    assert.equal(notesOf(db, session, 'wiki-contracts').length, 0);
  }
  // Model outputs without a real user-message reference are discarded.
  const unsupported = 'codex:unsupported';
  setSessionExtra(db, unsupported, { space: sp.id });
  await suggestContracts({ ...turn, key: unsupported }, deps, (async () => ({ proposal: { title: 'Guess', scope: 'Project', content: 'A rule', reason: 'Guess', sourceIds: ['invented'] } })) as never);
  assert.equal(notesOf(db, unsupported, 'wiki-contracts').length, 0);
  // A switch turned off during the model call prevents even a proposal card.
  const switched = 'codex:switched';
  setSessionExtra(db, switched, { space: sp.id });
  await suggestContracts({ ...turn, key: switched }, deps, (async () => {
    setSessionExtra(db, switched, { wikiFeatures: { autoContracts: false } });
    return { proposal: { title: 'Sources', scope: 'Research', content: 'Cite sources.', reason: 'User request', sourceIds: ['user-1'] } };
  }) as never);
  assert.equal(notesOf(db, switched, 'wiki-contracts').length, 0);
  setSessionExtra(db, key, { space: sp.id, wikiFeatures: { autoContracts: false } });
  await suggestContracts(turn, deps, ask as never);
  assert.equal(calls, 0);
  setSessionExtra(db, key, { wikiFeatures: { autoContracts: true } });
  await suggestContracts(turn, deps, ask as never);
  assert.equal(calls, 1);
  const note = notesOf(db, key, 'wiki-contracts')[0];
  assert.ok(note);
  const data = note.data as { hash: string; path: string };
  assert.equal(fs.existsSync(path.join(project, '.wiki', data.path)), false, 'no contract before user approval');
  const url = `/api/wiki-contracts/${note.id}/save`;
  assert.equal((await app.inject({ method: 'POST', url, payload: { sha256: 'wrong' } })).statusCode, 409);
  updateSpace(db, sp.id, { wikiFeatures: { contracts: false } });
  assert.equal((await app.inject({ method: 'POST', url, payload: { sha256: data.hash } })).statusCode, 409);
  updateSpace(db, sp.id, { wikiFeatures: { contracts: true } });
  const response = await app.inject({ method: 'POST', url, payload: { sha256: data.hash } });
  assert.equal(response.statusCode, 200, response.body);
  assert.match(fs.readFileSync(path.join(project, '.wiki', data.path), 'utf8'), /Cite the original source/);
  assert.equal((await app.inject({ method: 'POST', url, payload: { sha256: data.hash } })).statusCode, 409);
  // A later conversation can propose a revision of an existing confirmed contract.
  const second = 'codex:contract-revision';
  setSessionExtra(db, second, { space: sp.id });
  const existing = fs.readFileSync(path.join(project, '.wiki', data.path), 'utf8');
  // A second contract is part of the helper's input even when the proposal revises the first.
  const otherPath = path.join(project, '.wiki', 'wiki', 'other-contract.md');
  const other = '---\ndocument_kind: contract\ndocument_status: active\n---\n\n# Other\nOriginal rule.\n';
  fs.writeFileSync(otherPath, other);
  const revisionAsk = async () => ({ proposal: { title: 'Sources', scope: 'Research', content: existing.replace('Cite the original source.', 'Cite the original source and page.'), reason: 'User clarification', sourceIds: ['user-1'], existingPath: data.path } });
  await suggestContracts({ ...turn, key: second }, deps, revisionAsk as never);
  const revisionNote = notesOf(db, second, 'wiki-contracts')[0];
  assert.ok(revisionNote, 'revision proposal should be reviewable');
  const revision = revisionNote.data as { hash: string; original?: string };
  assert.equal(revision.original, existing);
  const revisionUrl = `/api/wiki-contracts/${revisionNote.id}/save`;
  // Changes to a different supplied contract or either supplied message invalidate acceptance.
  fs.writeFileSync(otherPath, other.replace('Original rule.', 'Changed rule.'));
  assert.equal((await app.inject({ method: 'POST', url: revisionUrl, payload: { sha256: revision.hash } })).statusCode, 409);
  assert.equal(fs.readFileSync(path.join(project, '.wiki', data.path), 'utf8'), existing);
  fs.writeFileSync(otherPath, other);
  const userText = items[0].text;
  items[0].text = 'A changed source message.';
  assert.equal((await app.inject({ method: 'POST', url: revisionUrl, payload: { sha256: revision.hash } })).statusCode, 409);
  items[0].text = userText;
  const assistantText = items[1].text;
  items[1].text = 'A changed assistant response.';
  assert.equal((await app.inject({ method: 'POST', url: revisionUrl, payload: { sha256: revision.hash } })).statusCode, 409);
  items[1].text = assistantText;
  // Later unrelated messages do not invalidate an otherwise unchanged proposal.
  items.push({ kind: 'user', id: 'user-2', seq: 3, text: 'Another question.', ts: Date.now() });
  const revisionResponse = await app.inject({ method: 'POST', url: `/api/wiki-contracts/${revisionNote.id}/save`, payload: { sha256: revision.hash } });
  assert.equal(revisionResponse.statusCode, 200, revisionResponse.body);
  items.pop();
  assert.match(fs.readFileSync(path.join(project, '.wiki', data.path), 'utf8'), /original source and page/);
  const history = fs.readdirSync(path.join(project, '.wiki', 'output/projects/.archive'));
  assert.ok(history.some((name) => name.startsWith('revision-')), 'the former contract is preserved');
  // Changes while the helper runs never produce an already-stale proposal card.
  const changing = 'codex:contract-changing';
  setSessionExtra(db, changing, { space: sp.id });
  await suggestContracts({ ...turn, key: changing }, deps, (async () => {
    fs.writeFileSync(otherPath, other.replace('Original rule.', 'Changed during generation.'));
    return { proposal: { title: 'New rule', scope: 'Research', content: 'Cite sources.', reason: 'User request', sourceIds: ['user-1'] } };
  }) as never);
  assert.equal(notesOf(db, changing, 'wiki-contracts').length, 0);
  fs.writeFileSync(otherPath, other);
  // Recheck model inputs after the asynchronous project guard, directly before writing.
  const racing = 'codex:contract-racing';
  setSessionExtra(db, racing, { space: sp.id });
  await suggestContracts({ ...turn, key: racing }, deps, (async () => ({ proposal: { title: 'New safety rule', scope: 'Research', content: 'Check source details.', reason: 'User request', sourceIds: ['user-1'] } })) as never);
  const racingNote = notesOf(db, racing, 'wiki-contracts')[0];
  assert.ok(racingNote);
  const racingData = racingNote.data as { hash: string; path: string };
  let reads = 0;
  onTimelineRead = () => { if (++reads === 2) fs.writeFileSync(otherPath, other.replace('Original rule.', 'Changed during approval.')); };
  const racingResponse = await app.inject({ method: 'POST', url: `/api/wiki-contracts/${racingNote.id}/save`, payload: { sha256: racingData.hash } });
  onTimelineRead = undefined;
  assert.equal(racingResponse.statusCode, 409);
  assert.equal(fs.existsSync(path.join(project, '.wiki', racingData.path)), false);
  fs.writeFileSync(otherPath, other);
  // A first automatic suggestion also leaves a missing wiki untouched until the user saves it.
  const emptyFolder = path.join(temp, 'empty'); fs.mkdirSync(emptyFolder);
  const emptyProject = createSpace(db, { name: 'Empty', folder: emptyFolder });
  const emptyKey = 'codex:empty-contract'; setSessionExtra(db, emptyKey, { space: emptyProject.id });
  await suggestContracts({ ...turn, key: emptyKey, cwd: emptyFolder }, deps, ask as never);
  const first = notesOf(db, emptyKey, 'wiki-contracts')[0]; assert.ok(first);
  const firstData = first.data as { hash: string; path: string };
  assert.equal(fs.existsSync(path.join(emptyFolder, '.wiki')), false);
  const savedFirst = await app.inject({ method: 'POST', url: `/api/wiki-contracts/${first.id}/save`, payload: { sha256: firstData.hash } });
  assert.equal(savedFirst.statusCode, 200, savedFirst.body);
  assert.ok(fs.existsSync(path.join(emptyFolder, '.wiki', firstData.path)));
  console.log('Contract suggestion requires an active project and exact user save');
} finally {
  await app.close(); db.close();
  // Remove only this test's scratch directory.
  if (process.platform === 'darwin') { const { spawnSync } = await import('node:child_process'); spawnSync('/usr/bin/chflags', ['-R', 'nouchg', temp]); }
  fs.rmSync(temp, { recursive: true, force: true });
}
