import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attachedUploads, decide, UPLOADS } from './permissions.ts';
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

// Files a person attached to a message, which the app keeps in its uploads folder: read without asking, and only those.
{
  const up = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-uploads-'));
  fs.mkdirSync(path.join(up, 'a1'));
  const pdf = path.join(up, 'a1', 'paper.pdf');
  fs.writeFileSync(pdf, '%PDF-1.4');
  const link = path.join(up, 'a1', 'link.txt');
  let linked = true;
  try {
    fs.symlinkSync(path.join(os.homedir(), '.ssh', 'id_rsa'), link);
  } catch {
    linked = false;
  }
  const listed = [pdf, ...(linked ? [link] : []), path.join(up, 'a1', 'missing.pdf'), path.join(os.homedir(), '.ssh', 'id_rsa'), up];
  const message = `what is this about\n\nAttached files:\n${listed.map((f) => `- ${f}`).join('\n')}`;
  assert.deepEqual(attachedUploads(message, up), [pdf], 'only files kept in the uploads folder count, not links, folders or other paths');
  assert.deepEqual(attachedUploads(`look at ${pdf} please`, up), [], 'a path in the words of a message is not an attachment');
  fs.rmSync(up, { recursive: true, force: true });

  // Checked against the real uploads folder, which is inside the app's own data (nothing is written there).
  const attached = path.join(UPLOADS, 'zz-permissions-test', 'notes.pdf');
  const step = (write = false) => ({ kind: (write ? 'edit' : 'read') as 'edit' | 'read', title: attached, rawInput: {}, paths: [{ path: attached, write }] });
  const state = path.join(os.tmpdir(), 'hydor-agent-state');
  assert.equal(decide(step(), { mode: 'ask', allow: [], cwd, readable: [state, attached] }).ok, true, 'an attached file is read without asking');
  assert.equal(decide(step(true), { mode: 'ask', allow: [], cwd, readable: [state, attached] }).ok, false, 'but not changed without asking');
  const elsewhere = decide(step(), { mode: 'ask', allow: [], cwd, readable: [state] });
  assert.equal(elsewhere.ok, false, 'a file attached in another conversation still asks');
  assert.match(elsewhere.why ?? '', /a file attached in another conversation/, 'and says so, not that it holds keys');
  console.log('Attached files tests passed');
}
