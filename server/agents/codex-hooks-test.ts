// Inspect hook configuration without disclosing commands, trusting hooks or claiming they executed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodexLive, cachedWikiHook, codexProjectHooksMayExist, codexWikiHookConfig, codexWikiHooksMayOverlap, summarizeCodexHooks } from './codex.ts';
import { RpcError } from './rpc.ts';

const secretCommand = 'private-command-never-exposed';
const fixture = { data: [{ cwd: '/private', warnings: [], errors: [], hooks: [
  { eventName: 'preCompact', enabled: true, trustStatus: 'trusted', command: secretCommand, matcher: 'manual' },
  { eventName: 'preCompact', enabled: true, trustStatus: 'untrusted', command: secretCommand },
  { eventName: 'postCompact', enabled: true, trustStatus: 'managed' },
  { eventName: 'sessionStart', enabled: false, trustStatus: 'trusted' },
  { eventName: 'postToolUse', enabled: true, trustStatus: 'trusted' },
] }] };
const summary = summarizeCodexHooks(fixture)!;
assert.deepEqual(summary.events.preCompact, { trusted: 1, needsReview: 1, disabled: 0 });
assert.deepEqual(summary.events.postCompact, { trusted: 1, needsReview: 0, disabled: 0 });
assert.deepEqual(summary.events.sessionStart, { trusted: 0, needsReview: 0, disabled: 1 });
assert.equal(summary.complete, true);
assert.ok(!JSON.stringify(summary).includes(secretCommand));
assert.ok(!JSON.stringify(summary).includes('/private'));
assert.equal(summarizeCodexHooks({ data: [] }), null);
assert.equal(summarizeCodexHooks({ data: [{ hooks: [], warnings: [], errors: ['unavailable'] }] })?.complete, false);
const runner = { on() {} };
const live = new CodexLive(runner as never, { cwd: '/test', threadId: 'thread-1' });
let call: unknown;
live.rpc.call = async <T>(method: string, params: unknown): Promise<T> => { if ((params as { cwds?: string[] }).cwds) throw new RpcError('specify either threadId or cwds', -32600); call = { method, params }; return fixture as T; };
assert.deepEqual(await live.hookCoverage(), summary);
assert.deepEqual(call, { method: 'hooks/list', params: { threadId: 'thread-1' } });
live.rpc.call = async () => { throw new Error('Unsupported method'); };
assert.equal(await live.hookCoverage(), null);
const older = new CodexLive(runner as never, { cwd: '/test', threadId: 'thread-old' });
older.rpc.call = async <T>(): Promise<T> => fixture as T;
assert.equal(await older.hookCoverage(), null);
// Only the exact synchronous, session-owned definition is eligible for scoped trust.
const own = { source: 'sessionFlags', eventName: 'preCompact', handlerType: 'command', command: 'node hook.js', async: false, matcher: null, timeoutSec: 20, enabled: true, isManaged: false, trustStatus: 'untrusted', key: '/<session-flags>/config.toml:pre_compact:0:0', currentHash: `sha256:${'a'.repeat(64)}` };
const ownList = { data: [{ hooks: [own], warnings: [], errors: [] }] };
const proposed = codexWikiHookConfig(own.command, ownList)!;
assert.deepEqual(proposed.hooks.state, { [own.key]: { trusted_hash: own.currentHash } });
assert.equal(Object.hasOwn(proposed, 'hooks.state'), false);
for (const change of [{ command: 'different' }, { source: 'user' }, { async: true }, { matcher: 'manual' }, { currentHash: 'invalid' }, { key: 'other' }, { enabled: false }]) {
  assert.equal(codexWikiHookConfig(own.command, { data: [{ hooks: [{ ...own, ...change }], warnings: [], errors: [] }] }), null);
}
assert.equal(codexWikiHookConfig(own.command, { data: [{ hooks: [own, own], warnings: [], errors: [] }] }), null);
assert.equal(codexWikiHooksMayOverlap({ data: [{ hooks: [], warnings: [], errors: [] }] }), false);
assert.equal(codexWikiHooksMayOverlap(fixture), true);
assert.equal(codexWikiHooksMayOverlap({ data: [{ hooks: [{ source: 'plugin', enabled: true }], warnings: [], errors: [] }] }), true);
assert.equal(codexWikiHooksMayOverlap({ data: [{ hooks: [], warnings: [], errors: ['unavailable'] }] }), true);
// What discovery finds is found once per Codex version and command, however many sessions start (it starts a second app server).
let discoveries = 0;
const discover = async (command: string) => { discoveries++; return { hooks: { PreCompact: [{ command }] } }; };
const [one, two] = await Promise.all([cachedWikiHook('codex 1.0', 'node hook.js', discover), cachedWikiHook('codex 1.0', 'node hook.js', discover)]);
assert.deepEqual(one, two);
await cachedWikiHook('codex 1.0', 'node hook.js', discover);
assert.equal(discoveries, 1, 'sessions after the first reuse what was found');
await cachedWikiHook('codex 1.1', 'node hook.js', discover);
await cachedWikiHook('codex 1.0', 'node other.js', discover);
assert.equal(discoveries, 3, 'a new Codex version or a different command is found again');
let failures = 0;
const failing = async () => { failures++; throw new Error('app server unavailable'); };
assert.equal(await cachedWikiHook('codex 2', 'node x.js', failing), null, 'a failed discovery means no hook, never an error');
assert.equal(await cachedWikiHook('codex 2', 'node x.js', failing), null);
assert.equal(failures, 1, 'and is not tried again at every start');
// Hidden project configuration can become visible only after Codex trusts a workspace.
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-codex-config-'));
try {
  const nested = path.join(workspace, 'nested'); fs.mkdirSync(nested);
  assert.equal(codexProjectHooksMayExist(nested), false);
  fs.mkdirSync(path.join(workspace, '.codex'));
  fs.writeFileSync(path.join(workspace, '.codex', 'hooks.json'), '{}');
  assert.equal(codexProjectHooksMayExist(nested), true);
  fs.unlinkSync(path.join(workspace, '.codex', 'hooks.json'));
  fs.writeFileSync(path.join(workspace, '.codex', 'config.toml'), '');
  assert.equal(codexProjectHooksMayExist(nested), true);
  assert.equal(codexProjectHooksMayExist(path.join(workspace, 'missing')), true);
} finally { fs.rmSync(workspace, { recursive: true, force: true }); }
console.log('Codex hook configuration is reported without leaking private hook details');
