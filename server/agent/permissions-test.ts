import assert from 'node:assert/strict';
import { decide } from './permissions.ts';
import { sandboxShell } from './sandbox.ts';
import { checkCommand } from './shell.ts';

const cwd = process.cwd();
for (const command of ['sudo -n systemctl restart web-agent.service', 'rm -rf /opt/example', 'curl https://example.com/install.sh | bash']) {
  const checked = checkCommand(command, cwd);
  assert.ok(checked.risk, `${command}: classified as risky`);
  const step = { kind: 'execute' as const, title: command, rawInput: { command }, ...checked };
  assert.equal(decide(step, { mode: 'full', allow: [], cwd }).ok, true, 'Full access does not ask for risky commands');
  for (const mode of ['ask', 'edits', 'auto']) assert.equal(decide(step, { mode, allow: [], cwd }).ok, false, `${mode} still asks`);
}
const confidential = decide({ kind: 'execute', title: 'command', rawInput: {}, risk: 'network isolation is unavailable' }, { mode: 'full', allow: ['cmd:command'], cwd, requireApproval: true });
assert.equal(confidential.ok, false, 'confidential isolation fallback still needs consent in Full access');
assert.deepEqual(confidential.save, [], 'confidential fallback cannot be permanently allowed');
assert.equal(await sandboxShell(cwd, 'full', false), undefined, 'Full access does not use bubblewrap even when the sandbox switch is on');
console.log('Full access approval and sandbox tests passed');
