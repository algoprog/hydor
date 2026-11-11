// Script tests for forking a Claude session before a compaction (precompactCopy: the transcript cut at the first
// compact boundary after an entry, into a copy in a scratch folder) and for the last words of a failed run's stderr
// (lastWords). Build and run with a scratch DATA_DIR:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/fork-test.ts && DATA_DIR=/tmp/hydor-test-fork node dist/dev/fork-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lastWords } from '../sessions.ts';
import { precompactCopy } from './claude.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-fork-test-'));
let n = 0;
/** A scratch folder for one case's copies (not created: the code under test makes it). */
const dirFor = () => path.join(root, `copies-${n++}`);

type Entry = Record<string, unknown>;
const user = (uuid: string, text: string, extra: Entry = {}): Entry => ({ type: 'user', uuid, parentUuid: null, sessionId: 's', message: { role: 'user', content: text }, ...extra });
const assistant = (uuid: string, parentUuid: string | null, text: string): Entry => ({ type: 'assistant', uuid, parentUuid, sessionId: 's', message: { role: 'assistant', content: text } });
const boundary = (previous: string): Entry => ({ type: 'system', subtype: 'compact_boundary', uuid: crypto.randomUUID(), parentUuid: null, logicalParentUuid: previous });

/** The lines as file text: each line ends with a newline. */
const join = (lines: string[]) => lines.map((l) => l + '\n').join('');
const lineOf = (e: Entry) => JSON.stringify(e);
/** The byte offset of line i in the file made from `lines`. */
const offsetOf = (lines: string[], i: number) => Buffer.byteLength(join(lines.slice(0, i)));

/** Writes a transcript and returns its path. */
const write = (name: string, text: string | Buffer) => {
  const p = path.join(root, `${name}-${crypto.randomUUID()}.jsonl`);
  fs.writeFileSync(p, text);
  return p;
};

const tests: [string, () => void][] = [
  [
    'at before one boundary: the copy is the file up to the boundary, in a 0600 file in the folder',
    () => {
      const at = crypto.randomUUID();
      const lines = [lineOf(user(at, 'hello')), lineOf(assistant(crypto.randomUUID(), at, 'hi')), lineOf(boundary('x')), lineOf(assistant(crypto.randomUUID(), null, 'after'))];
      const original = Buffer.from(join(lines));
      const dir = dirFor();
      const copy = precompactCopy(write('one', original), at, dir);
      assert.ok(copy, 'a copy is made');
      assert.equal(path.dirname(copy), dir);
      assert.ok(fs.readFileSync(copy).equals(original.subarray(0, offsetOf(lines, 2))), 'the bytes up to the boundary line');
      assert.equal(fs.statSync(copy).mode & 0o777, 0o600);
    },
  ],
  [
    'at after the last boundary: null, and no file in the folder',
    () => {
      const at = crypto.randomUUID();
      const lines = [lineOf(boundary('x')), lineOf(user(at, 'late')), lineOf(assistant(crypto.randomUUID(), at, 'reply'))];
      const dir = dirFor();
      assert.equal(precompactCopy(write('late', join(lines)), at, dir), null);
      assert.ok(!fs.existsSync(dir) || fs.readdirSync(dir).length === 0, 'no copy written');
    },
  ],
  [
    'two boundaries with at between them: the cut is at the second, so the copy keeps the first',
    () => {
      const at = crypto.randomUUID();
      const b1 = boundary('x');
      const lines = [lineOf(b1), lineOf(user(at, 'between')), lineOf(assistant(crypto.randomUUID(), at, 'reply')), lineOf(boundary('y')), lineOf(assistant(crypto.randomUUID(), null, 'after'))];
      const original = Buffer.from(join(lines));
      const copy = precompactCopy(write('two', original), at, dirFor());
      assert.ok(copy);
      const bytes = fs.readFileSync(copy);
      assert.ok(bytes.equals(original.subarray(0, offsetOf(lines, 3))), 'cut at the second boundary');
      assert.ok(bytes.toString('utf8').includes(lineOf(b1)), 'the first boundary is in the copy');
    },
  ],
  [
    'at not in the file, or a transcript that does not exist: null',
    () => {
      const at = crypto.randomUUID();
      const lines = [lineOf(user(crypto.randomUUID(), 'other')), lineOf(boundary('x'))];
      const dir = dirFor();
      assert.equal(precompactCopy(write('absent', join(lines)), at, dir), null, 'uuid not in the file');
      assert.equal(precompactCopy(path.join(root, 'no-such-file.jsonl'), at, dir), null, 'file missing');
    },
  ],
  [
    'decoys that look like the target or the boundary: the cut is still exactly at the real boundary line',
    () => {
      const at = crypto.randomUUID();
      // (a) a user message whose text is an escaped copy of the target and a boundary
      const decoyText = lineOf(user(crypto.randomUUID(), JSON.stringify({ uuid: at, type: 'system', subtype: 'compact_boundary' })));
      const target = lineOf(user(at, 'real target'));
      // (b) a line that has the words "compact_boundary" but is not a system entry
      const attachment = lineOf({ type: 'attachment', note: 'compact_boundary', uuid: crypto.randomUUID() });
      // (c) a line whose parent is the target
      const child = lineOf(assistant(crypto.randomUUID(), at, 'child'));
      const real = lineOf(boundary('x'));
      const lines = [decoyText, target, attachment, child, real, lineOf(user(crypto.randomUUID(), 'after'))];
      const original = Buffer.from(join(lines));
      const copy = precompactCopy(write('decoys', original), at, dirFor());
      assert.ok(copy);
      assert.ok(fs.readFileSync(copy).equals(original.subarray(0, offsetOf(lines, 4))), 'cut exactly at the real boundary');
    },
  ],
  [
    'multi-byte text before the boundary: the copy is the exact byte prefix',
    () => {
      const at = crypto.randomUUID();
      const lines = [lineOf(user(at, 'Καλημέρα κόσμε 🦉')), lineOf(assistant(crypto.randomUUID(), at, 'ναι 🦉 ok')), lineOf(boundary('x')), lineOf(user(crypto.randomUUID(), 'τέλος 🦉'))];
      const original = Buffer.from(join(lines), 'utf8');
      const copy = precompactCopy(write('utf8', original), at, dirFor());
      assert.ok(copy);
      assert.ok(fs.readFileSync(copy).equals(original.subarray(0, offsetOf(lines, 2))), 'exact bytes up to the boundary');
    },
  ],
  [
    'stale copies (over an hour old) are deleted; fresh ones are kept',
    () => {
      const at = crypto.randomUUID();
      const lines = [lineOf(user(at, 'hello')), lineOf(boundary('x'))];
      const dir = dirFor();
      fs.mkdirSync(dir, { recursive: true });
      const old = path.join(dir, 'old.jsonl');
      const fresh = path.join(dir, 'fresh.jsonl');
      fs.writeFileSync(old, 'old');
      fs.writeFileSync(fresh, 'fresh');
      const twoHoursAgo = (Date.now() - 2 * 3_600_000) / 1000;
      fs.utimesSync(old, twoHoursAgo, twoHoursAgo);
      const copy = precompactCopy(write('stale', join(lines)), at, dir);
      assert.ok(copy);
      assert.ok(!fs.existsSync(old), 'the old copy is gone');
      assert.ok(fs.existsSync(fresh), 'the fresh copy is kept');
    },
  ],
  [
    'the target is the last line with no trailing newline, and no boundary: null',
    () => {
      const at = crypto.randomUUID();
      const text = [lineOf(user(crypto.randomUUID(), 'first')), lineOf(user(at, 'last'))].join('\n');
      assert.equal(precompactCopy(write('nonl', text), at, dirFor()), null);
    },
  ],
];

const lastWordsTests: [string, () => void][] = [
  [
    'the trust warning is dropped; the last words are the error',
    () => {
      const trust = 'Ignoring 6 permissions.allow entries from .claude/settings.json: this workspace has not been trusted. Run Claude Code interactively here once and accept the trust dialog, or set projects["/home/u/proj"].hasTrustDialogAccepted: true in /home/u/.claude.json.';
      assert.equal(lastWords(`${trust}\nNo message found with message.uuid of: X\n`), 'No message found with message.uuid of: X');
    },
  ],
  [
    'blank lines are skipped; the last three lines are joined by one space',
    () => {
      assert.equal(lastWords('a\n\nb\n\nc\n\nd\n\ne\n'), 'c d e');
    },
  ],
  [
    'a line over 300 characters: the last 300 characters, behind an ellipsis',
    () => {
      const long = 'abcdefghij'.repeat(50);
      const out = lastWords(long + '\n');
      assert.ok(out.startsWith('…'));
      assert.equal(out.length, 301);
      assert.ok(out.endsWith(long.slice(-300)));
    },
  ],
  [
    'only the trust warning: an empty string',
    () => {
      assert.equal(lastWords('Ignoring 6 permissions.allow entries from .claude/settings.json: this workspace has not been trusted. Run Claude Code interactively here once.\n'), '');
    },
  ],
];

const all = [...tests, ...lastWordsTests];
let passed = 0;
for (const [name, fn] of all) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${passed}/${all.length} passed`);
