// Script tests for added accounts: where a Claude session's transcript is, found in any account's folder once
// written and, before the CLI has written it (a session just started), expected in the folder of the account
// the session runs as, so its timeline follows the file the CLI writes. Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/accounts-test.ts
//   DATA_DIR=/tmp/hydor-test-accounts CLAUDE_CONFIG_DIR=/tmp/hydor-test-accounts/claude node dist/dev/accounts-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountById, addAccount, claudeTranscriptOf, removeAccount } from './accounts.ts';
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
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('accounts-test: all passed');
