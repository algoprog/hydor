// Check the per-run Claude settings and conservative overlap detection in isolated directories.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudeSpec, claudeWikiHooksMayOverlap, settingsOf } from './claude.ts';
import { runToken } from '../mcp.ts';
import { wikiHookRunOf } from '../wiki/session/hook-auth.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-claude-hooks-'));
try {
  const config = path.join(dir, 'config');
  fs.mkdirSync(config);
  const opts = { cwd: dir, sessionId: '123e4567-e89b-12d3-a456-426614174000', pageServer: `http://localhost:9999/agent/run/${runToken('0123456789ab')}` };
  const env = { CLAUDE_CONFIG_DIR: config, HYDOR_WIKI_AUTO_HOOKS: '1' };
  const spec = claudeSpec(opts, env);
  const token = spec.env.HYDOR_WIKI_HOOK_TOKEN;
  assert.equal(wikiHookRunOf(token), '0123456789ab');
  assert.ok(!JSON.stringify(spec.args).includes(token));
  const settings = JSON.parse(spec.args[spec.args.indexOf('--settings') + 1]);
  assert.equal(settings.hooks.PreCompact[0].matcher, 'auto');
  assert.equal(settings.hooks.PostCompact[0].matcher, 'auto');
  assert.equal(settings.hooks.PreCompact[0].hooks[0].type, 'command');
  // Exec form, as Claude Code's own hook schema describes it ("set `command` to the executable and `args` to its arguments",
  // checked against Claude Code 2.1.325): no shell, so nothing to quote, and the bearer is never in it.
  const hook = settings.hooks.PreCompact[0].hooks[0];
  assert.equal(hook.command, process.execPath);
  assert.ok(Array.isArray(hook.args) && hook.args[0] === '-e' && /^http:\/\/127\.0\.0\.1:\d+\/agent\/claude\/wiki-event$/.test(hook.args[2]));
  assert.ok(!JSON.stringify(settings).includes(token));
  assert.equal(claudeSpec(opts, { CLAUDE_CONFIG_DIR: config }).args.includes('--settings'), false);
  fs.writeFileSync(path.join(config, 'settings.json'), JSON.stringify({ hooks: { PreCompact: [{ hooks: [] }] } }));
  assert.equal(claudeWikiHooksMayOverlap(opts, env), true);
  assert.equal(claudeSpec(opts, env).env.HYDOR_WIKI_HOOK_TOKEN, undefined);
  fs.writeFileSync(path.join(config, 'settings.json'), JSON.stringify({ enabledPlugins: { 'wiki@example': true } }));
  assert.equal(claudeWikiHooksMayOverlap(opts, env), true);
  fs.writeFileSync(path.join(config, 'settings.json'), '{');
  assert.equal(claudeWikiHooksMayOverlap(opts, env), true);

  // A project's skill switches pass a --settings of their own: Claude Code keeps one, so the app's hooks join it.
  fs.rmSync(path.join(config, 'settings.json'));
  const switches = ['--settings', JSON.stringify({ skillOverrides: { 'pdf-tools': 'off' } })];
  const given = (args: string[]) => ({ instructions: [], notes: [], mcpServers: {}, env: {}, args, skillRoots: [], disallowedTools: [], allowedTools: [], strictMcp: false, codexConfig: {}, builtinTools: null });
  const both = claudeSpec({ ...opts, add: given(switches) }, { ...env, HYDOR_MEMORY_HOOKS: '1' });
  assert.equal(both.args.filter((a) => a === '--settings').length, 1, 'one --settings');
  const merged = JSON.parse(both.args[both.args.indexOf('--settings') + 1]);
  assert.deepEqual(merged.skillOverrides, { 'pdf-tools': 'off' }, 'the switches kept');
  assert.equal(merged.hooks.PostToolUse[0].matcher, 'Read|Edit|MultiEdit|Write|NotebookEdit', "memory's hook beside them");
  assert.equal(merged.hooks.PreCompact[0].matcher, 'auto', "the wiki's hooks too");
  // One that does not read as JSON goes on as it was, and no hooks are added beside it.
  assert.deepEqual(settingsOf(['--settings', '{', '--x']), { settings: {}, rest: ['--settings', '{', '--x'], bad: true });
  const broken = claudeSpec({ ...opts, add: given(['--settings', '{']) }, { ...env, HYDOR_MEMORY_HOOKS: '1' });
  assert.equal(broken.args.filter((a) => a === '--settings').length, 1);
  assert.equal(broken.args[broken.args.indexOf('--settings') + 1], '{');
  assert.equal(broken.env.HYDOR_MEMORY_HOOK_TOKEN, undefined);
  process.stdout.write('Claude wiki hook configuration tests passed\n');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
