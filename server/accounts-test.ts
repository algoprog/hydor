// Script tests for added accounts: where a Claude session's transcript is, found in any account's folder once
// written and, before the CLI has written it (a session just started), expected in the folder of the account
// the session runs as, so its timeline follows the file the CLI writes; and the folders an added account trusts
// (shareTrust); and Grok Build's accounts (GROK_HOME, the settings linked in and the sign-in not, the mismatch errors); and moving a session's history between
// accounts (historyMoves, clearWay, moveAcross), above all over a stale copy the other account already holds. Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/accounts-test.ts
//   DATA_DIR=/tmp/hydor-test-accounts CLAUDE_CONFIG_DIR=/tmp/hydor-test-accounts/claude node dist/dev/accounts-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountById, accountEnv, accountPool, addAccount, claudeTranscriptOf, clearWay, grokHome, grokHomeOf, grokSessionMove, historyMoves, moveAcross, removeAccount, shareTrust } from './accounts.ts';
import { HttpError } from './auth.ts';
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

// A Grok Build account: its own GROK_HOME, the settings of the default home linked in, never its sign-in or sessions.
{
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-grok-test-'));
  const home = path.join(scratch, 'grok-home');
  const was = process.env.GROK_HOME;
  process.env.GROK_HOME = home;
  assert.equal(grokHome(), home, 'GROK_HOME names the default home');
  fs.mkdirSync(path.join(home, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(home, 'sessions'), { recursive: true });
  for (const f of ['config.toml', 'AGENTS.md', 'auth.json', 'agent_id', 'skills/s.md', 'sessions/x.json']) fs.writeFileSync(path.join(home, f), 'x');

  const grok = addAccount(db, 'grok', 'Work');
  const claude = addAccount(db, 'claude', 'Work');
  const dir = accountById(db, grok.id)!.dir;
  assert.equal(grok.agent, 'grok');
  assert.deepEqual(accountEnv(db, 'grok', grok.id), { GROK_HOME: dir }, 'an added Grok account runs with its own GROK_HOME');
  assert.deepEqual(accountEnv(db, 'grok', undefined), {}, 'the default account: the program’s own home');
  assert.deepEqual(accountEnv(db, 'claude', claude.id), { CLAUDE_CONFIG_DIR: accountById(db, claude.id)!.dir });
  for (const f of ['config.toml', 'AGENTS.md', 'skills']) assert.ok(fs.lstatSync(path.join(dir, f)).isSymbolicLink(), `${f} is linked from the default home`);
  assert.equal(fs.readFileSync(path.join(dir, 'skills/s.md'), 'utf8'), 'x', 'a linked folder shows the default home’s files');
  for (const f of ['auth.json', 'agent_id', 'sessions']) assert.equal(fs.existsSync(path.join(dir, f)), false, `${f} is never shared`);
  assert.equal(fs.existsSync(path.join(dir, 'requirements.toml')), false, 'what the default home does not have is not linked');

  assert.throws(() => accountEnv(db, 'claude', grok.id), (e) => e instanceof HttpError && e.status === 400 && /Grok Build account/.test(e.message), 'a Grok account is not a Claude Code one');
  assert.throws(() => accountEnv(db, 'grok', claude.id), (e) => e instanceof HttpError && e.status === 400 && /Claude Code account/.test(e.message));
  assert.throws(() => accountEnv(db, 'grok', 'gone'), (e) => e instanceof HttpError && e.status === 404);
  assert.throws(() => addAccount(db, 'gemini' as never, 'x'), (e) => e instanceof HttpError && e.message === 'Pick Claude Code, Codex or Grok Build');
  assert.throws(() => addAccount(db, 'grok', 'work'), (e) => e instanceof HttpError && e.status === 409, 'one name once per program');
  assert.deepEqual(accountPool(db, 'grok'), [undefined, grok.id]);
  assert.deepEqual(accountPool(db, 'claude'), [undefined, claude.id]);

  // Moving a session between Grok accounts: its folder (found by scanning, whatever the cwd's folder is called) goes to the same place
  // under the other home; the index stays; a destination that exists, or no folder at all, is told apart.
  assert.equal(grokHomeOf(db, grok.id), dir);
  assert.equal(grokHomeOf(db, undefined), home);
  {
    const gid = '01a1e8cf-aaaa-bbbb-cccc-1234567890ab';
    const folder = path.join(home, 'sessions', '%2Ftmp%2Fproj', gid);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'summary.json'), '{}');
    fs.writeFileSync(path.join(home, 'sessions', 'session_search.sqlite'), 'idx');
    const move = grokSessionMove(db, gid, undefined, grok.id)!;
    assert.deepEqual(move, [folder, path.join(dir, 'sessions', '%2Ftmp%2Fproj', gid)]);
    assert.equal(grokSessionMove(db, 'no-such-session', undefined, grok.id), null, 'no folder: nothing to move');
    assert.equal(grokSessionMove(db, '../x', undefined, grok.id), null, 'not an id');
    moveAcross(...move);
    assert.ok(fs.existsSync(path.join(move[1], 'summary.json')));
    assert.equal(fs.existsSync(folder), false);
    assert.ok(fs.existsSync(path.join(home, 'sessions', 'session_search.sqlite')), 'the index stays');
    assert.deepEqual(grokSessionMove(db, gid, grok.id, undefined), [move[1], folder], 'and back');
    fs.mkdirSync(folder, { recursive: true });
    assert.throws(() => grokSessionMove(db, gid, grok.id, undefined), (e) => e instanceof HttpError && e.status === 409, 'the other account has it already');
  }

  removeAccount(db, grok.id, true);
  removeAccount(db, claude.id, true);
  assert.equal(fs.existsSync(dir), false, 'wiped with its account');
  assert.ok(fs.existsSync(path.join(home, 'auth.json')), 'the default home is untouched');
  if (was === undefined) delete process.env.GROK_HOME;
  else process.env.GROK_HOME = was;
  fs.rmSync(scratch, { recursive: true, force: true });
}

// clearWay: makes room for history that moves where a copy of it already is. Missing: nothing to do; only other names
// (hard links) of the very files that move: removed; anything else: handed to `aside` (the app's Trash), not removed here.
{
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-clearway-test-'));
  const put = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const stub = () => {
    const calls: string[] = [];
    return { calls, aside: async (p: string) => void calls.push(p) };
  };

  // 1. Nothing at the destination.
  {
    const src = path.join(scratch, '1', 'a', 's.jsonl');
    const dst = path.join(scratch, '1', 'b', 's.jsonl');
    put(src, 'mine\n');
    const { calls, aside } = stub();
    await clearWay(src, dst, aside);
    assert.deepEqual(calls, [], 'nothing at the destination: nothing set aside');
    assert.equal(fs.readFileSync(src, 'utf8'), 'mine\n');
  }
  // 2. A file that is another name of the file that moves: removed, the original stays.
  {
    const src = path.join(scratch, '2', 'a', 's.jsonl');
    const dst = path.join(scratch, '2', 'b', 's.jsonl');
    put(src, 'mine\n');
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.linkSync(src, dst);
    const { calls, aside } = stub();
    await clearWay(src, dst, aside);
    assert.equal(fs.existsSync(dst), false, 'a hard link of the history goes');
    assert.equal(fs.readFileSync(src, 'utf8'), 'mine\n', 'the history itself stays');
    assert.deepEqual(calls, [], 'a link is not set aside');
  }
  // 3. A folder whose files, nested too, are all links of the files at the same places: removed.
  {
    const src = path.join(scratch, '3', 'a', 'id');
    const dst = path.join(scratch, '3', 'b', 'id');
    put(path.join(src, 'subagents', 'agent-x.jsonl'), 'sub\n');
    put(path.join(src, 'notes.txt'), 'n\n');
    fs.mkdirSync(path.join(dst, 'subagents'), { recursive: true });
    fs.linkSync(path.join(src, 'subagents', 'agent-x.jsonl'), path.join(dst, 'subagents', 'agent-x.jsonl'));
    const { calls, aside } = stub();
    await clearWay(src, dst, aside);
    assert.equal(fs.existsSync(dst), false, 'a folder of links of the folder’s own files goes');
    assert.equal(fs.readFileSync(path.join(src, 'subagents', 'agent-x.jsonl'), 'utf8'), 'sub\n', 'the files that move stay');
    assert.deepEqual(calls, []);
  }
  // 4. A different file (a separate copy, not a link): set aside by `aside`, and clearWay itself leaves it.
  {
    const src = path.join(scratch, '4', 'a', 's.jsonl');
    const dst = path.join(scratch, '4', 'b', 's.jsonl');
    put(src, 'mine\n');
    put(dst, 'theirs\n');
    const { calls, aside } = stub();
    await clearWay(src, dst, aside);
    assert.deepEqual(calls, [dst], 'a different file is set aside, once');
    assert.equal(fs.readFileSync(dst, 'utf8'), 'theirs\n', 'clearWay does not remove it itself');
    // A file with the same content that is not a link is a different file too.
    put(dst, 'mine\n');
    await clearWay(src, dst, aside);
    assert.deepEqual(calls, [dst, dst], 'same words, not the same file: set aside');
  }
  // 5. A folder with a file the history lacks: set aside whole.
  {
    const src = path.join(scratch, '5', 'a', 'id');
    const dst = path.join(scratch, '5', 'b', 'id');
    put(path.join(src, 'subagents', 'agent-x.jsonl'), 'sub\n');
    fs.mkdirSync(path.join(dst, 'subagents'), { recursive: true });
    fs.linkSync(path.join(src, 'subagents', 'agent-x.jsonl'), path.join(dst, 'subagents', 'agent-x.jsonl'));
    put(path.join(dst, 'subagents', 'agent-extra.jsonl'), 'only there\n');
    const { calls, aside } = stub();
    await clearWay(src, dst, aside);
    assert.deepEqual(calls, [dst], 'the folder is set aside when it holds a file the history lacks');
    assert.ok(fs.existsSync(path.join(dst, 'subagents', 'agent-extra.jsonl')), 'and left in place by clearWay');
  }
  // 6. A file where the history has a folder: set aside.
  {
    const src = path.join(scratch, '6', 'a', 'id');
    const dst = path.join(scratch, '6', 'b', 'id');
    put(path.join(src, 'x.jsonl'), 'x\n');
    put(dst, 'a file\n');
    const { calls, aside } = stub();
    await clearWay(src, dst, aside);
    assert.deepEqual(calls, [dst]);
  }

  // moveAcross where the destination is already another name of the file: the source goes, the destination holds the content.
  {
    const src = path.join(scratch, '7', 'a', 's.jsonl');
    const dst = path.join(scratch, '7', 'b', 's.jsonl');
    put(src, 'content\n');
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.linkSync(src, dst);
    moveAcross(src, dst);
    assert.equal(fs.existsSync(src), false, 'the old name goes');
    assert.equal(fs.readFileSync(dst, 'utf8'), 'content\n', 'the new name holds the content');
  }
  // And an ordinary move still moves.
  {
    const src = path.join(scratch, '8', 'a', 's.jsonl');
    const dst = path.join(scratch, '8', 'b', 's.jsonl');
    put(src, 'content\n');
    moveAcross(src, dst);
    assert.equal(fs.existsSync(src), false);
    assert.equal(fs.readFileSync(dst, 'utf8'), 'content\n');
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}

// historyMoves between two added Claude accounts: always built from the from-account's folder, even when the index knows
// the session by a copy in the to-account's folder; only what exists moves; a file in neither folder is refused.
{
  const from = addAccount(db, 'claude', 'From');
  const to = addAccount(db, 'claude', 'To');
  const root = (a: { id: string }) => path.join(accountById(db, a.id)!.dir, 'projects');
  const [pa, pb] = [root(from), root(to)];
  const sid = crypto.randomUUID();
  const rel = path.join('-home-u-app', `${sid}.jsonl`);
  const transcript = path.join(pa, rel);
  const sub = path.join(pa, '-home-u-app', sid);
  fs.mkdirSync(path.join(sub, 'subagents'), { recursive: true });
  fs.writeFileSync(transcript, '{}\n');
  fs.writeFileSync(path.join(sub, 'subagents', 'agent-x.jsonl'), '{}\n');

  const moves = historyMoves(db, 'claude', sid, transcript, from.id, to.id);
  assert.deepEqual(moves, [[transcript, path.join(pb, rel)], [sub, path.join(pb, '-home-u-app', sid)]], 'the transcript and its folder move, and no file-history that is not there');

  fs.rmSync(sub, { recursive: true, force: true });
  assert.deepEqual(historyMoves(db, 'claude', sid, transcript, from.id, to.id), [[transcript, path.join(pb, rel)]], 'only sources that exist');

  // The index knows the session by a copy in the to-account's folder: the move still comes from the from-account's folder.
  const stale = path.join(pb, rel);
  fs.mkdirSync(path.dirname(stale), { recursive: true });
  fs.writeFileSync(stale, '{}\n');
  const viaStale = historyMoves(db, 'claude', sid, stale, from.id, to.id);
  assert.equal(viaStale[0][0], transcript, 'a file given under the other account’s folder: the move’s source is still the from-account’s path');
  assert.equal(viaStale[0][1], stale);

  // A history that exists in neither account's folder.
  assert.throws(() => historyMoves(db, 'claude', sid, path.join(tmp, 'elsewhere', `${sid}.jsonl`), from.id, to.id), (e) => e instanceof HttpError && e.status === 409, 'a file under neither account’s folder is refused');

  removeAccount(db, from.id, true);
  removeAccount(db, to.id, true);
}

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('accounts-test: all passed');
