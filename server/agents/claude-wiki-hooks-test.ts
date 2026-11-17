// Check the per-run Claude settings and conservative overlap detection in isolated directories.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudeSpec, claudeWikiHooksMayOverlap } from './claude.ts';
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
  assert.equal(claudeSpec(opts, { CLAUDE_CONFIG_DIR: config }).args.includes('--settings'), false);
  fs.writeFileSync(path.join(config, 'settings.json'), JSON.stringify({ hooks: { PreCompact: [{ hooks: [] }] } }));
  assert.equal(claudeWikiHooksMayOverlap(opts, env), true);
  assert.equal(claudeSpec(opts, env).env.HYDOR_WIKI_HOOK_TOKEN, undefined);
  fs.writeFileSync(path.join(config, 'settings.json'), JSON.stringify({ enabledPlugins: { 'wiki@example': true } }));
  assert.equal(claudeWikiHooksMayOverlap(opts, env), true);
  fs.writeFileSync(path.join(config, 'settings.json'), '{');
  assert.equal(claudeWikiHooksMayOverlap(opts, env), true);
  process.stdout.write('Claude wiki hook configuration tests passed\n');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
