// Script tests for added accounts: where a Claude session's transcript is, found in any account's folder once
// written and, before the CLI has written it (a session just started), expected in the folder of the account
// the session runs as, so its timeline follows the file the CLI writes; and the folders an added account trusts
// (shareTrust). Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/accounts-test.ts
//   DATA_DIR=/tmp/hydor-test-accounts CLAUDE_CONFIG_DIR=/tmp/hydor-test-accounts/claude node dist/dev/accounts-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountById, addAccount, claudeTranscriptOf, removeAccount, shareTrust } from './accounts.ts';
import { config } from './config.ts';
import { openDb } from './db.ts';

if (!config.dataDir.startsWith('/tmp/') || !config.claudeProjectsDir.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and CLAUDE_CONFIG_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-accounts-test-'));
const db = openDb(path.join(tmp, 'test.db'));
const work = addAccount(db, 'claude', 'Work');
const projects = path.join(accountById(db, work.id)!.dir, 'projects');
const cwd = '/home/u/my app';
const id = crypto.randomUUID();
const inWork = path.join(projects, '-home-u-my-app', `${id}.jsonl`);

assert.equal(claudeTranscriptOf(db, id, cwd, work.id), inWork, 'not written yet: in the folder of the account it runs as');
assert.equal(claudeTranscriptOf(db, id, cwd, undefined), path.join(config.claudeProjectsDir, '-home-u-my-app', `${id}.jsonl`), 'the CLI’s own account: its own folder');
assert.equal(claudeTranscriptOf(db, id, cwd, 'removed'), path.join(config.claudeProjectsDir, '-home-u-my-app', `${id}.jsonl`), 'an account since removed: the CLI’s own folder');
assert.equal(claudeTranscriptOf(db, id, undefined, work.id), null, 'no folder known: nowhere to expect it');

fs.mkdirSync(path.dirname(inWork), { recursive: true });
fs.writeFileSync(inWork, '{}\n');
assert.equal(claudeTranscriptOf(db, id, cwd, undefined), inWork, 'once written, found in whichever account’s folder it is');
assert.equal(claudeTranscriptOf(db, id, '/somewhere/else', undefined), inWork, 'found by its id, whatever folder the session was in');
assert.equal(claudeTranscriptOf(db, id, undefined, undefined), inWork);

removeAccount(db, work.id, true);
// shareTrust: a folder the default account trusts is trusted in an added account's own file too (not a symlink's
// target, and nothing else in the file changes); anything else leaves the file as it was.
{
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-trust-test-'));
  const acct = path.join(scratch, 'acct');
  const main = path.join(scratch, 'main.json');
  const own = path.join(acct, '.claude.json');
  const reset = (acctJson: unknown | null) => {
    fs.mkdirSync(acct, { recursive: true });
    fs.rmSync(own, { force: true });
    if (acctJson !== null) fs.writeFileSync(own, typeof acctJson === 'string' ? acctJson : JSON.stringify(acctJson));
  };
  const writeMain = (v: unknown) => fs.writeFileSync(main, typeof v === 'string' ? v : JSON.stringify(v));
  const bytes = () => (fs.existsSync(own) ? fs.readFileSync(own) : null);
  const mainTrusts = (folder: string) => writeMain({ projects: { [folder]: { hasTrustDialogAccepted: true } } });
  const base = { userID: 'x', projects: { '/other': { allowedTools: ['A'] } } };

  // 1. The folder is trusted by the account, the other fields are kept, the file is 0600, no temp file is left.
  mainTrusts('/home/u/proj');
  reset(base);
  shareTrust(acct, '/home/u/proj', main);
  const after = JSON.parse(fs.readFileSync(own, 'utf8'));
  assert.equal(after.projects['/home/u/proj'].hasTrustDialogAccepted, true);
  assert.equal(after.userID, 'x');
  assert.deepEqual(after.projects['/other'], { allowedTools: ['A'] });
  assert.equal(fs.statSync(own).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(acct).filter((f) => f.endsWith('.tmp')), []);

  // 2. The main account trusts a parent: the account gets that parent's key, not the cwd's.
  writeMain({ projects: { '/home/u': { hasTrustDialogAccepted: true } } });
  reset(base);
  shareTrust(acct, '/home/u/proj/sub', main);
  const parent = JSON.parse(fs.readFileSync(own, 'utf8')).projects;
  assert.equal(parent['/home/u'].hasTrustDialogAccepted, true);
  assert.equal(parent['/home/u/proj/sub'], undefined, 'not the cwd key');

  // 3. Main has no entry for the folder, or does not accept it: nothing changes.
  for (const m of [{ projects: {} }, { projects: { '/home/u/proj': { hasTrustDialogAccepted: false } } }]) {
    writeMain(m);
    const text = JSON.stringify(base, null, 4);
    reset(text);
    shareTrust(acct, '/home/u/proj', main);
    assert.equal(bytes()!.toString('utf8'), text, `unchanged for main ${JSON.stringify(m)}`);
  }

  // 4. The account already trusts the folder, or its parent: nothing changes.
  mainTrusts('/home/u/proj');
  for (const trustedKey of ['/home/u/proj', '/home/u']) {
    const text = JSON.stringify({ projects: { [trustedKey]: { hasTrustDialogAccepted: true } } }, null, 1);
    reset(text);
    shareTrust(acct, '/home/u/proj', main);
    assert.equal(bytes()!.toString('utf8'), text, `unchanged when the account trusts ${trustedKey}`);
  }

  // 5. The account has no .claude.json: none is made.
  reset(null);
  shareTrust(acct, '/home/u/proj', main);
  assert.equal(bytes(), null, 'no file created');

  // 6. Main missing, or not valid JSON: the account file is unchanged.
  const text6 = JSON.stringify(base);
  for (const setMain of [() => fs.rmSync(main, { force: true }), () => fs.writeFileSync(main, '{ not json')]) {
    setMain();
    reset(text6);
    shareTrust(acct, '/home/u/proj', main);
    assert.equal(bytes()!.toString('utf8'), text6);
  }

  // 7. The account's .claude.json is a symlink: its target is left as it is.
  const target = path.join(scratch, 'elsewhere.json');
  const targetText = JSON.stringify(base);
  fs.writeFileSync(target, targetText);
  mainTrusts('/home/u/proj');
  fs.rmSync(own, { force: true });
  fs.symlinkSync(target, own);
  shareTrust(acct, '/home/u/proj', main);
  assert.equal(fs.readFileSync(target, 'utf8'), targetText, 'the symlink target is unchanged');

  fs.rmSync(scratch, { recursive: true, force: true });
}

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('accounts-test: all passed');
