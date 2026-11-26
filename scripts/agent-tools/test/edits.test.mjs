import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EDITS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'edits');
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
let ROOT;
let counter = 0;

before(() => { ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'edits-test-')); });
after(() => {
  // restore permissions that tests may have removed, then delete everything
  spawnSync('chmod', ['-R', 'u+rwX', ROOT]);
  fs.rmSync(ROOT, { recursive: true, force: true });
});

function mkcase() {
  const d = path.join(ROOT, `c${++counter}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function run(cwd, args, input) {
  const r = spawnSync(process.execPath, [EDITS, ...args], { cwd, input: input ?? '', encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr, all: r.stdout + r.stderr };
}
const w = (d, f, content) => {
  const p = path.join(d, f);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
};
const rd = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
const blk = (search, rep, mod = '') => `<<<<<<< SEARCH${mod ? ' ' + mod : ''}\n${search}\n=======\n${rep}\n>>>>>>> REPLACE\n`;
const sec = (file, ...blocks) => `=== ${file}\n${blocks.join('')}`;
function snapshot(dir) {
  const res = [];
  const walk = (p, rel) => {
    for (const name of fs.readdirSync(p).sort()) {
      const full = path.join(p, name);
      const r = path.join(rel, name);
      const st = fs.lstatSync(full);
      if (st.isDirectory()) { res.push(`${r}/ ${(st.mode & 0o777).toString(8)}`); walk(full, r); }
      else if (st.isSymbolicLink()) res.push(`${r} -> ${fs.readlinkSync(full)}`);
      else res.push(`${r} ${(st.mode & 0o777).toString(8)} ${crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')}`);
    }
  };
  walk(dir, '');
  return res.join('\n');
}
function rows(out) {
  const res = [];
  for (const l of out.split('\n')) {
    const m = /^([ +]) +(\d+)  (.*)$/.exec(l);
    if (m) res.push({ mark: m[1], n: Number(m[2]), text: m[3] });
  }
  return res;
}

describe('basic application', () => {
  test('single block, header and excerpt', () => {
    const d = mkcase();
    w(d, 'a.txt', 'one\ntwo\nthree\nfour\nfive\n');
    const r = run(d, [], sec('a.txt', blk('three', 'THREE')));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'one\ntwo\nTHREE\nfour\nfive\n');
    assert.match(r.out, /^applied 1 edit in 1 file\n/);
    assert.match(r.out, /a\.txt: 1 edit\n/);
    assert.deepEqual(rows(r.out).map((x) => `${x.mark}${x.n}:${x.text}`), [' 1:one', ' 2:two', '+3:THREE', ' 4:four', ' 5:five']);
  });

  test('multiple blocks and several files', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a1\na2\na3\n');
    w(d, 'sub/b.txt', 'b1\nb2\n');
    w(d, 'c.md', 'foo\n');
    const r = run(d, [], sec('a.txt', blk('a1', 'A1'), blk('a3', 'A3')) + sec('sub/b.txt', blk('b2', 'B2')) + sec('c.md', blk('foo', 'bar')));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'A1\na2\nA3\n');
    assert.equal(rd(d, 'sub/b.txt'), 'b1\nB2\n');
    assert.equal(rd(d, 'c.md'), 'bar\n');
    assert.match(r.out, /^applied 4 edits in 3 files\n/);
    assert.match(r.out, /a\.txt: 2 edits/);
    assert.match(r.out, /sub\/b\.txt: 1 edit\n/);
  });

  test('reads script from FILE argument and absolute paths', () => {
    const d = mkcase();
    const p = w(d, 'a.txt', 'x\n');
    w(d, 'script.txt', sec(p, blk('x', 'y')));
    const r = run(d, ['script.txt']);
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'y\n');
  });

  test('sequential blocks in one file: second depends on first', () => {
    const d = mkcase();
    w(d, 'a.txt', 'alpha\nbeta\n');
    const r = run(d, [], sec('a.txt', blk('alpha', 'gamma\ndelta'), blk('delta\nbeta', 'epsilon')));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'gamma\nepsilon\n');
  });

  test('a block depending on a later block fails (order matters)', () => {
    const d = mkcase();
    w(d, 'a.txt', 'alpha\nbeta\n');
    const before = snapshot(d);
    const r = run(d, [], sec('a.txt', blk('delta', 'x'), blk('alpha', 'delta')));
    assert.equal(r.code, 1);
    assert.match(r.err, /a\.txt: block 1: 0 matches/);
    assert.equal(snapshot(d), before);
  });

  test('mid-line substring edit', () => {
    const d = mkcase();
    w(d, 'a.txt', 'const foo = bar(1, 2);\nnext\n');
    const r = run(d, [], sec('a.txt', blk('bar(1', 'baz(9')));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'const foo = baz(9, 2);\nnext\n');
  });

  test('a search is a pure substring (no word boundaries)', () => {
    const d = mkcase();
    w(d, 'a.txt', 'foobar\n');
    const r = run(d, [], sec('a.txt', blk('foo', 'X')));
    assert.equal(r.code, 0);
    assert.equal(rd(d, 'a.txt'), 'Xbar\n');
  });

  test('unicode', () => {
    const d = mkcase();
    w(d, 'a.txt', 'héllo 日本語 😀 wörld\nzwei\n');
    const r = run(d, [], sec('a.txt', blk('日本語 😀', '中文 🎉'), blk('zwei', 'ü')));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'héllo 中文 🎉 wörld\nü\n');
  });

  test('file without trailing newline stays without', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\nb');
    run(d, [], sec('a.txt', blk('b', 'c')));
    assert.equal(rd(d, 'a.txt'), 'a\nc');
  });

  test('replacement of unchanged text is reported as unchanged and not written', () => {
    const d = mkcase();
    const p = w(d, 'a.txt', 'same\n');
    const old = new Date(2000, 0, 1);
    fs.utimesSync(p, old, old);
    const r = run(d, [], sec('a.txt', blk('same', 'same')));
    assert.equal(r.code, 0);
    assert.match(r.out, /a\.txt: unchanged/);
    assert.equal(fs.statSync(p).mtimeMs, old.getTime());
  });

  test('~/ is expanded', () => {
    const d = mkcase();
    w(d, 'home/f.txt', 'old\n');
    const r = spawnSync(process.execPath, [EDITS], { cwd: d, input: sec('~/f.txt', blk('old', 'new')), encoding: 'utf8', env: { ...process.env, HOME: path.join(d, 'home') } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(rd(d, 'home/f.txt'), 'new\n');
  });

  test('--help is short and carries the three notes', () => {
    const r = run(mkcase(), ['--help']);
    assert.equal(r.code, 0);
    assert.ok(r.out.trim().split('\n').length < 45);
    assert.match(r.out, /exact substring and must be unique/);
    assert.match(r.out, /leave a blank line/);
    assert.match(r.out, /literal "=======" line.*JSON/);
  });

  test('usage errors exit 2', () => {
    const d = mkcase();
    assert.equal(run(d, ['--bogus'], '').code, 2);
    assert.equal(run(d, ['--context', 'x'], '').code, 2);
    assert.equal(run(d, ['--context=-1'], '').code, 2);
  });
});

describe('exactly-once enforcement and atomicity', () => {
  test('0 matches leaves ALL files byte-identical', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\nb\n');
    w(d, 'b.txt', 'c\nd\n');
    const before = snapshot(d);
    const r = run(d, [], sec('a.txt', blk('a', 'A')) + sec('b.txt', blk('nope', 'x')));
    assert.equal(r.code, 1);
    assert.match(r.err, /b\.txt: block 1: 0 matches/);
    assert.equal(r.out, '');
    assert.equal(snapshot(d), before);
  });

  test('2 matches leaves ALL files byte-identical and lists lines', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\nb\n');
    w(d, 'b.txt', 'x\nfoo\nm\nfoo\nn\nfoo\n');
    const before = snapshot(d);
    const r = run(d, [], sec('a.txt', blk('a', 'A')) + sec('b.txt', blk('foo', 'bar')));
    assert.equal(r.code, 1);
    assert.match(r.err, /b\.txt: block 1: 3 matches \(lines 2, 4, 6\), expected 1: add surrounding lines or use "SEARCH all"\/"SEARCH 3"/);
    assert.equal(snapshot(d), before);
  });

  test('all problems are collected (up to 10)', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\n');
    const script = sec('a.txt', ...Array.from({ length: 13 }, (_, i) => blk(`missing${i}`, 'x'))) + sec('nofile.txt', blk('a', 'b'));
    const r = run(d, [], script);
    assert.equal(r.code, 1);
    assert.match(r.err, /14 problems/);
    assert.equal((r.err.match(/0 matches/g) || []).length, 10);
    assert.match(r.err, /and 4 more/);
  });

  test('SEARCH all replaces every occurrence; zero occurrences is an error', () => {
    const d = mkcase();
    w(d, 'a.txt', 'foo foo\nfoo\n');
    let r = run(d, [], sec('a.txt', blk('foo', 'x', 'all')));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'x x\nx\n');
    r = run(d, [], sec('a.txt', blk('foo', 'y', 'all')));
    assert.equal(r.code, 1);
    assert.match(r.err, /0 matches/);
  });

  test('SEARCH N requires exactly N', () => {
    const d = mkcase();
    w(d, 'a.txt', 'foo foo foo\n');
    let before = snapshot(d);
    let r = run(d, [], sec('a.txt', blk('foo', 'x', '2')));
    assert.equal(r.code, 1);
    assert.match(r.err, /3 matches \(lines 1, 1, 1\), expected 2/);
    assert.equal(snapshot(d), before);
    r = run(d, [], sec('a.txt', blk('foo', 'x', '3')));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'x x x\n');
  });

  test('matches are non-overlapping, left to right, and not re-scanned', () => {
    const d = mkcase();
    w(d, 'a.txt', 'aaaa\n');
    const r = run(d, [], sec('a.txt', blk('aa', 'aaa', 'all')));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'aaaaaa\n');
  });

  test('missing file suggests (new)', () => {
    const d = mkcase();
    const r = run(d, [], sec('nope.txt', blk('a', 'b')));
    assert.equal(r.code, 1);
    assert.match(r.err, /nope\.txt: file not found.*\(new\)/);
  });

  test('empty search in an existing file is refused', () => {
    const d = mkcase();
    w(d, 'a.txt', 'x\n');
    const before = snapshot(d);
    const r = run(d, [], sec('a.txt', blk('', 'y')));
    assert.equal(r.code, 1);
    assert.match(r.err, /a\.txt: block 1: empty search/);
    assert.equal(snapshot(d), before);
  });

  test('0-match hint: first line locations; whitespace-insensitive match (tabs vs spaces)', () => {
    const d = mkcase();
    w(d, 'a.txt', 'function f() {\n\tfoo();\n\tbar();\n}\n');
    const before = snapshot(d);
    const r = run(d, [], sec('a.txt', blk('    foo();\n    bar();', 'x')));
    assert.equal(r.code, 1);
    assert.match(r.err, /a\.txt: block 1: 0 matches/);
    assert.match(r.err, /matches at line 2 if whitespace is ignored: check indentation\/trailing spaces/);
    assert.equal(snapshot(d), before);
  });

  test('0-match hint lists lines where the first non-blank search line occurs (max 5)', () => {
    const d = mkcase();
    w(d, 'a.txt', Array.from({ length: 8 }, () => 'x = 1;\n').join('') + 'tail\n');
    const r = run(d, [], sec('a.txt', blk('x = 1;\nDIFFERENT', 'z')));
    assert.equal(r.code, 1);
    assert.match(r.err, /first search line occurs at lines 1, 2, 3, 4, 5, …/);
    assert.doesNotMatch(r.err, /if whitespace is ignored/);
  });

  test('trailing-space mismatch gives the whitespace hint (and is not applied)', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\nfoo  \nb\n');
    const before = snapshot(d);
    const r = run(d, [], sec('a.txt', blk('foo\nb', 'X')));
    assert.equal(r.code, 1);
    assert.match(r.err, /matches at line 2 if whitespace is ignored/);
    assert.equal(snapshot(d), before);
  });
});

describe('deletion', () => {
  test('empty replacement removes the newline when the match starts a line', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\nb\nc\n');
    const r = run(d, [], sec('a.txt', '<<<<<<< SEARCH\nb\n=======\n>>>>>>> REPLACE\n'));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'a\nc\n');
    assert.match(r.out, /- \(1 line removed after line 1\)/);
  });

  test('multi-line deletion shows the count and context', () => {
    const d = mkcase();
    w(d, 'a.txt', '1\n2\n3\n4\n5\n6\n');
    const r = run(d, [], sec('a.txt', '<<<<<<< SEARCH\n3\n4\n5\n=======\n>>>>>>> REPLACE\n'));
    assert.equal(rd(d, 'a.txt'), '1\n2\n6\n');
    assert.match(r.out, /- \(3 lines removed after line 2\)/);
    assert.deepEqual(rows(r.out).map((x) => `${x.mark}${x.n}`), [' 1', ' 2', ' 3']);
  });

  test('a search of two whole lines deletes exactly those two lines', () => {
    const d = mkcase();
    w(d, 'a.txt', '1\n2\n3\n4\n');
    run(d, [], sec('a.txt', '<<<<<<< SEARCH\n2\n3\n=======\n>>>>>>> REPLACE\n'));
    assert.equal(rd(d, 'a.txt'), '1\n4\n');
  });

  test('a search ending with a newline (last line blank) does not eat the next line break', () => {
    const d = mkcase();
    w(d, 'a.txt', '1\n2\n\n3\n');
    // search "2\n" (lines "2" and "") deletes "2\n" only; the blank line stays
    const r = run(d, [], sec('a.txt', '<<<<<<< SEARCH\n2\n\n=======\n>>>>>>> REPLACE\n'));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), '1\n\n3\n');
  });

  test('SEARCH all with a newline-terminated search removes only the matched text', () => {
    const d = mkcase();
    w(d, 'a.txt', 'x\n\nx\n\ny\n');
    run(d, [], sec('a.txt', '<<<<<<< SEARCH all\nx\n\n=======\n>>>>>>> REPLACE\n'));
    assert.equal(rd(d, 'a.txt'), '\n\ny\n');
  });

  test('no newline removal when the match does not start at a line start', () => {
    const d = mkcase();
    w(d, 'a.txt', 'foo bar\nnext\n');
    run(d, [], sec('a.txt', '<<<<<<< SEARCH\n bar\n=======\n>>>>>>> REPLACE\n'));
    assert.equal(rd(d, 'a.txt'), 'foo\nnext\n');
  });

  test('no newline removal when the match is not followed by a newline', () => {
    const d = mkcase();
    w(d, 'a.txt', 'foo bar\nnext\n');
    run(d, [], sec('a.txt', '<<<<<<< SEARCH\nfoo\n=======\n>>>>>>> REPLACE\n'));
    assert.equal(rd(d, 'a.txt'), ' bar\nnext\n');
  });

  test('deleting the last line of a file without trailing newline', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\nb');
    run(d, [], sec('a.txt', '<<<<<<< SEARCH\nb\n=======\n>>>>>>> REPLACE\n'));
    assert.equal(rd(d, 'a.txt'), 'a\n');
  });

  test('SEARCH all with deletions removes each whole line', () => {
    const d = mkcase();
    w(d, 'a.txt', 'x\nkeep\nx\nkeep2\nx\n');
    const r = run(d, [], sec('a.txt', '<<<<<<< SEARCH all\nx\n=======\n>>>>>>> REPLACE\n'));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'keep\nkeep2\n');
  });

  test('deletion in a CRLF file removes the CRLF', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\r\nb\r\nc\r\n');
    run(d, [], sec('a.txt', '<<<<<<< SEARCH\nb\n=======\n>>>>>>> REPLACE\n'));
    assert.equal(rd(d, 'a.txt'), 'a\r\nc\r\n');
  });
});

describe('bytes preserved', () => {
  test('CRLF file: search/replacement converted, other bytes untouched', () => {
    const d = mkcase();
    w(d, 'a.txt', 'one\r\ntwo\r\nthree\r\nfour');
    const r = run(d, [], sec('a.txt', blk('two\nthree', 'TWO\nMID\nTHREE')));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'one\r\nTWO\r\nMID\r\nTHREE\r\nfour');
  });

  test('mostly-LF file with one CRLF line is treated as LF', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\nb\r\nc\nd\n');
    run(d, [], sec('a.txt', blk('c\nd', 'C\nD')));
    assert.equal(rd(d, 'a.txt'), 'a\nb\r\nC\nD\n');
  });

  test('BOM is kept', () => {
    const d = mkcase();
    fs.writeFileSync(path.join(d, 'a.txt'), Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('hello\nworld\n')]));
    const r = run(d, [], sec('a.txt', blk('hello', 'HELLO')));
    assert.equal(r.code, 0, r.all);
    const out = fs.readFileSync(path.join(d, 'a.txt'));
    assert.deepEqual([...out.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
    assert.equal(out.subarray(3).toString(), 'HELLO\nworld\n');
    assert.match(r.out, /\+ 1  HELLO/);
  });

  test('file mode 0755 is preserved', () => {
    const d = mkcase();
    const p = w(d, 'run.sh', '#!/bin/sh\necho a\n');
    fs.chmodSync(p, 0o755);
    const r = run(d, [], sec('run.sh', blk('echo a', 'echo b')));
    assert.equal(r.code, 0, r.all);
    assert.equal(fs.statSync(p).mode & 0o777, 0o755);
    assert.equal(rd(d, 'run.sh'), '#!/bin/sh\necho b\n');
  });

  test('symlink: edit goes to the target, link is kept', () => {
    const d = mkcase();
    w(d, 'real/target.txt', 'old\n');
    fs.symlinkSync('real/target.txt', path.join(d, 'link.txt'));
    const r = run(d, [], sec('link.txt', blk('old', 'new')));
    assert.equal(r.code, 0, r.all);
    assert.ok(fs.lstatSync(path.join(d, 'link.txt')).isSymbolicLink());
    assert.equal(fs.readlinkSync(path.join(d, 'link.txt')), 'real/target.txt');
    assert.equal(rd(d, 'real/target.txt'), 'new\n');
  });

  test('same file through two paths is treated as one file', () => {
    const d = mkcase();
    w(d, 'a.txt', 'one\n');
    fs.symlinkSync('a.txt', path.join(d, 'l.txt'));
    fs.mkdirSync(path.join(d, 'sub'));
    // block 2 depends on block 1 and goes through another path
    const r = run(d, [], sec('a.txt', blk('one', 'two')) + sec('sub/../a.txt', blk('two', 'three')) + sec('l.txt', blk('three', 'four')));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'four\n');
    assert.match(r.out, /^applied 3 edits in 1 file\n/);
  });

  test('(new) and a second block for the same file via another path is refused', () => {
    const d = mkcase();
    w(d, 'a.txt', 'one\n');
    const before = snapshot(d);
    const r = run(d, [], sec('a.txt', blk('one', 'two')) + sec('./a.txt (overwrite)', blk('', 'x')));
    assert.equal(r.code, 1);
    assert.match(r.err, /must be the only block/);
    assert.equal(snapshot(d), before);
  });

  test('binary and non-UTF-8 files are refused, directories too', () => {
    const d = mkcase();
    fs.writeFileSync(path.join(d, 'bin.dat'), Buffer.from([0x61, 0x00, 0x62]));
    fs.writeFileSync(path.join(d, 'latin.txt'), Buffer.from([0x61, 0xE9, 0x62, 0x0A]));
    fs.mkdirSync(path.join(d, 'dir'));
    w(d, 'ok.txt', 'a\n');
    const before = snapshot(d);
    const r = run(d, [], sec('bin.dat', blk('a', 'x')) + sec('latin.txt', blk('a', 'x')) + sec('dir', blk('a', 'x')) + sec('ok.txt', blk('a', 'x')));
    assert.equal(r.code, 1);
    assert.match(r.err, /bin\.dat: .*binary/);
    assert.match(r.err, /latin\.txt: .*not valid UTF-8/);
    assert.match(r.err, /dir: .*directory/);
    assert.equal(snapshot(d), before);
  });

  test('files over 20 MB are refused', () => {
    const d = mkcase();
    fs.writeFileSync(path.join(d, 'big.txt'), Buffer.alloc(20 * 1024 * 1024 + 1, 0x61));
    const r = run(d, [], sec('big.txt', blk('a', 'b')));
    assert.equal(r.code, 1);
    assert.match(r.err, /too large/);
  });
});

describe('new files and overwrite', () => {
  test('(new) creates a file, including parent directories', () => {
    const d = mkcase();
    const r = run(d, [], '=== deep/er/new.txt (new)\n<<<<<<< SEARCH\n=======\nline1\nline2\n\n>>>>>>> REPLACE\n');
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'deep/er/new.txt'), 'line1\nline2\n');
    assert.match(r.out, /deep\/er\/new\.txt: created \(2 lines\)\n/);
    assert.match(r.out, /^applied 1 edit in 1 file/);
  });

  test('text format (new)/(overwrite): a trailing newline is added when missing', () => {
    const d = mkcase();
    w(d, 'o.txt', 'old');
    const r = run(d, [], '=== n.txt (new)\n<<<<<<< SEARCH\n=======\nabc\n>>>>>>> REPLACE\n=== o.txt (overwrite)\n<<<<<<< SEARCH\n=======\nx\ny\n>>>>>>> REPLACE\n=== e.txt (new)\n<<<<<<< SEARCH\n=======\n>>>>>>> REPLACE\n');
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'n.txt'), 'abc\n');
    assert.equal(rd(d, 'o.txt'), 'x\ny\n');
    assert.equal(rd(d, 'e.txt'), '');
    assert.doesNotMatch(r.out, /no trailing newline/);
    assert.match(r.out, /n\.txt: created \(1 line\)\n/);
  });

  test('JSON create/overwrite is byte-for-byte; missing trailing newline is noted', () => {
    const d = mkcase();
    w(d, 'o.txt', 'old\n');
    const r = run(d, [], JSON.stringify([{ file: 'n.txt', create: 'abc' }, { file: 'o.txt', overwrite: 'xyz' }, { file: 'm.txt', create: 'ok\n' }]));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'n.txt'), 'abc');
    assert.equal(rd(d, 'o.txt'), 'xyz');
    assert.match(r.out, /n\.txt: created \(1 line\) \[no trailing newline\]/);
    assert.match(r.out, /o\.txt: overwritten \(1 line\) \[no trailing newline\]/);
    assert.match(r.out, /m\.txt: created \(1 line\)\n/);
  });

  test('(new) on an existing file is refused and nothing changes', () => {
    const d = mkcase();
    w(d, 'a.txt', 'x\n');
    w(d, 'b.txt', 'y\n');
    const before = snapshot(d);
    const r = run(d, [], sec('b.txt', blk('y', 'z')) + '=== a.txt (new)\n<<<<<<< SEARCH\n=======\nfoo\n>>>>>>> REPLACE\n');
    assert.equal(r.code, 1);
    assert.match(r.err, /a\.txt: already exists/);
    assert.equal(snapshot(d), before);
  });

  test('(new) with a non-empty SEARCH is a format error with the line number', () => {
    const d = mkcase();
    const r = run(d, [], '=== n.txt (new)\n<<<<<<< SEARCH\nabc\n=======\nfoo\n>>>>>>> REPLACE\n');
    assert.equal(r.code, 1);
    assert.match(r.err, /script line 2: .*empty SEARCH/);
    assert.equal(fs.existsSync(path.join(d, 'n.txt')), false);
  });

  test('(overwrite) replaces an existing file and creates a missing one', () => {
    const d = mkcase();
    const p = w(d, 'a.txt', 'old\nstuff\n');
    fs.chmodSync(p, 0o640);
    const r = run(d, [], '=== a.txt (overwrite)\n<<<<<<< SEARCH\n=======\nfresh\n\n>>>>>>> REPLACE\n=== b/c.txt (overwrite)\n<<<<<<< SEARCH\n=======\nmade\n>>>>>>> REPLACE\n');
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'fresh\n');
    assert.equal(fs.statSync(p).mode & 0o777, 0o640);
    assert.equal(rd(d, 'b/c.txt'), 'made\n');
    assert.match(r.out, /a\.txt: overwritten/);
  });

  test('(new) where a parent is a file is refused', () => {
    const d = mkcase();
    w(d, 'f', 'x');
    const r = run(d, [], '=== f/sub/x.txt (new)\n<<<<<<< SEARCH\n=======\nfoo\n>>>>>>> REPLACE\n');
    assert.equal(r.code, 1);
    assert.match(r.err, /not a directory/);
  });
});

describe('rollback', { skip: IS_ROOT ? 'running as root: permissions are not enforced' : false }, () => {
  test('a failing write restores the files already written', () => {
    const d = mkcase();
    w(d, 'ok/a.txt', 'a\n');
    w(d, 'ok/z.txt', 'z\n');
    w(d, 'ro/b.txt', 'b\n');
    fs.chmodSync(path.join(d, 'ro'), 0o555);
    try {
      const before = snapshot(d);
      const r = run(d, [], sec('ok/a.txt', blk('a', 'A')) + sec('ok/z.txt', blk('z', 'Z')) + sec('ro/b.txt', blk('b', 'B')) + '=== newdir/n.txt (new)\n<<<<<<< SEARCH\n=======\nx\n>>>>>>> REPLACE\n');
      assert.equal(r.code, 1);
      assert.match(r.err, /write failed for ro\/b\.txt/);
      assert.match(r.err, /restored 2 files/);
      assert.equal(snapshot(d), before);
      assert.deepEqual(fs.readdirSync(path.join(d, 'ok')).sort(), ['a.txt', 'z.txt']);
    } finally { fs.chmodSync(path.join(d, 'ro'), 0o755); }
  });

  test('rollback removes created files and directories', () => {
    const d = mkcase();
    w(d, 'ro/b.txt', 'b\n');
    fs.chmodSync(path.join(d, 'ro'), 0o555);
    try {
      const before = snapshot(d);
      const r = run(d, [], '=== newdir/sub/n.txt (new)\n<<<<<<< SEARCH\n=======\nx\n>>>>>>> REPLACE\n' + sec('ro/b.txt', blk('b', 'B')));
      assert.equal(r.code, 1);
      assert.equal(snapshot(d), before);
    } finally { fs.chmodSync(path.join(d, 'ro'), 0o755); }
  });
});

describe('JSON format', () => {
  test('array with count variants, create and overwrite', () => {
    const d = mkcase();
    w(d, 'a.txt', 'foo foo\nbar\n');
    w(d, 'b.txt', 'old\n');
    const edits = [
      { file: 'a.txt', old: 'foo', new: 'X', count: 'all' },
      { file: 'a.txt', old: 'bar', new: 'baz' },
      { file: 'c.txt', create: 'created\n' },
      { file: 'b.txt', overwrite: 'replaced\n' },
    ];
    const r = run(d, [], JSON.stringify(edits));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'X X\nbaz\n');
    assert.equal(rd(d, 'c.txt'), 'created\n');
    assert.equal(rd(d, 'b.txt'), 'replaced\n');
    assert.doesNotMatch(r.out, /no trailing newline/);
  });

  test('{"edits": [...]} with leading whitespace and numeric count', () => {
    const d = mkcase();
    w(d, 'a.txt', 'q q\n');
    const r = run(d, [], '\n  ' + JSON.stringify({ edits: [{ file: 'a.txt', old: 'q', new: 'r', count: 2 }] }));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'r r\n');
  });

  test('text containing marker lines can be edited', () => {
    const d = mkcase();
    const content = 'x\n<<<<<<< SEARCH\n=======\n>>>>>>> REPLACE\ny\n';
    w(d, 'a.txt', content);
    const r = run(d, [], JSON.stringify([{ file: 'a.txt', old: '<<<<<<< SEARCH\n=======\n>>>>>>> REPLACE\n', new: '=== hi\n' }]));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'x\n=== hi\ny\n');
  });

  test('exactly-once and atomicity apply to JSON too', () => {
    const d = mkcase();
    w(d, 'a.txt', 'k\nk\n');
    w(d, 'b.txt', 'm\n');
    const before = snapshot(d);
    const r = run(d, [], JSON.stringify([{ file: 'b.txt', old: 'm', new: 'n' }, { file: 'a.txt', old: 'k', new: 'j' }]));
    assert.equal(r.code, 1);
    assert.match(r.err, /a\.txt: block 1: 2 matches \(lines 1, 2\)/);
    assert.equal(snapshot(d), before);
  });

  test('bad JSON and bad entries are format errors', () => {
    const d = mkcase();
    assert.match(run(d, [], '[{"file": ').err, /format error[\s\S]*JSON/);
    const r = run(d, [], JSON.stringify([{ file: 'a', old: 'x', new: 'y', cnt: 2 }]));
    assert.equal(r.code, 1);
    assert.match(r.err, /entry 1: unknown key "cnt"/);
    assert.match(run(d, [], JSON.stringify([{ file: 'a', old: 'x' }])).err, /"new" must be a string/);
    assert.match(run(d, [], JSON.stringify([{ file: 'a', old: 'x', new: 'y', count: 0 }])).err, /count/);
  });
});

describe('text format parsing', () => {
  test('marker lines inside a replacement: a second ======= belongs to the replacement', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\nb\n');
    const r = run(d, [], '=== a.txt\n<<<<<<< SEARCH\na\n=======\nx\n=======\ny\n>>>>>>> REPLACE\n');
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'x\n=======\ny\nb\n');
  });

  test('blank lines between blocks and sections are ignored; script without trailing newline', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\nb\n');
    w(d, 'b.txt', 'c\n');
    const r = run(d, [], '\n\n=== a.txt\n\n<<<<<<< SEARCH\na\n=======\nA\n>>>>>>> REPLACE\n\n\n=== b.txt\n<<<<<<< SEARCH\nc\n=======\nC\n>>>>>>> REPLACE');
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'A\nb\n');
    assert.equal(rd(d, 'b.txt'), 'C\n');
  });

  test('blank lines and leading/trailing whitespace inside search text are exact', () => {
    const d = mkcase();
    w(d, 'a.txt', '  indented\n\nnext\n');
    const r = run(d, [], sec('a.txt', blk('  indented\n\nnext', 'done')));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'done\n');
  });

  test('a script saved with CRLF line endings works', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\nb\n');
    const r = run(d, [], sec('a.txt', blk('a\nb', 'x\ny')).replace(/\n/g, '\r\n'));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'x\ny\n');
  });

  test('format errors carry the script line number and write nothing', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\n');
    const before = snapshot(d);
    const cases = [
      ['junk\n=== a.txt\n', /script line 1: text before the first "=== PATH"/],
      ['=== a.txt\n<<<<<<< SEARCH\na\n=======\nb\n', /script line 2: block has no ">>>>>>> REPLACE"/],
      ['=== a.txt\n<<<<<<< SEARCH\na\n', /script line 2: block has no "======="/],
      ['=== a.txt\n<<<<<<< SEARCH\na\n>>>>>>> REPLACE\n', /script line 4: ">>>>>>> REPLACE" before "======="/],
      ['=== a.txt\n<<<<<<< SEARCH 0\na\n=======\nb\n>>>>>>> REPLACE\n', /script line 2: bad SEARCH modifier "0"/],
      ['=== a.txt\n<<<<<<< SEARCH few\na\n=======\nb\n>>>>>>> REPLACE\n', /script line 2: bad SEARCH modifier "few"/],
      ['=== a.txt\nstray\n', /script line 2: unexpected text outside a block/],
      ['=== a.txt\n<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE\n=== b.txt\n', /script line 7: no SEARCH\/REPLACE block for b\.txt/],
      ['=== a.txt\n<<<<<<< SEARCH\na\n=======\nb\n<<<<<<< SEARCH\nc\n=======\nd\n>>>>>>> REPLACE\n', /script line 6: "<<<<<<< SEARCH" inside the block started at line 2/],
      ['<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE\n', /script line 1: text before the first/],
      ['=== \n', /script line 1: empty path/],
      ['', /no edits/],
    ];
    for (const [script, re] of cases) {
      const r = run(d, [], script);
      assert.equal(r.code, 1, script);
      assert.match(r.err, re, script);
      assert.equal(snapshot(d), before);
    }
  });
});

describe('dry run', () => {
  test('--dry-run writes nothing but reports the result', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\nb\n');
    const before = snapshot(d);
    const r = run(d, ['--dry-run'], sec('a.txt', blk('b', 'B')) + '=== n/new.txt (new)\n<<<<<<< SEARCH\n=======\nx\n>>>>>>> REPLACE\n');
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /^dry run: would apply 2 edits in 2 files\n/);
    assert.match(r.out, /\+ 2  B/);
    assert.equal(snapshot(d), before);
  });

  test('--dry-run still reports errors with exit 1', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\n');
    const r = run(d, ['--dry-run'], sec('a.txt', blk('zzz', 'B')));
    assert.equal(r.code, 1);
  });
});

describe('output format', () => {
  const lines = (n, f = (i) => `L${i}`) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n') + '\n';

  test('context lines, default 2 and --context N', () => {
    const d = mkcase();
    w(d, 'a.txt', lines(20));
    let r = run(d, [], sec('a.txt', blk('L10', 'X')));
    assert.deepEqual(rows(r.out).map((x) => x.n), [8, 9, 10, 11, 12]);
    assert.deepEqual(rows(r.out).filter((x) => x.mark === '+').map((x) => x.text), ['X']);
    w(d, 'a.txt', lines(20));
    r = run(d, ['--context', '0'], sec('a.txt', blk('L10', 'X')));
    assert.deepEqual(rows(r.out).map((x) => x.n), [10]);
    w(d, 'a.txt', lines(20));
    r = run(d, ['--context=4'], sec('a.txt', blk('L10', 'X')));
    assert.deepEqual(rows(r.out).map((x) => x.n), [6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  test('context is clamped at file boundaries', () => {
    const d = mkcase();
    w(d, 'a.txt', lines(4));
    const r = run(d, [], sec('a.txt', blk('L1', 'X')));
    assert.deepEqual(rows(r.out).map((x) => x.n), [1, 2, 3]);
  });

  test('line format: "  123  text" and "+ 123  text"', () => {
    const d = mkcase();
    w(d, 'a.txt', lines(130));
    const r = run(d, [], sec('a.txt', blk('L123', 'X')));
    assert.match(r.out, /^  121  L121$/m);
    assert.match(r.out, /^\+ 123  X$/m);
  });

  test('multi-line replacement marks every changed line', () => {
    const d = mkcase();
    w(d, 'a.txt', lines(8));
    const r = run(d, [], sec('a.txt', blk('L4', 'a\nb\nc')));
    assert.deepEqual(rows(r.out).map((x) => `${x.mark}${x.n}:${x.text}`), [' 2:L2', ' 3:L3', '+4:a', '+5:b', '+6:c', ' 7:L5', ' 8:L6']);
  });

  test('numbers reflect earlier edits of the same script (later block sees shifted lines)', () => {
    const d = mkcase();
    w(d, 'a.txt', lines(12));
    const r = run(d, [], sec('a.txt', blk('L2', 'L2\nn1\nn2\nn3'), blk('L9', 'NINE')));
    assert.equal(r.code, 0, r.all);
    const rs = rows(r.out);
    assert.ok(rs.some((x) => x.mark === '+' && x.n === 12 && x.text === 'NINE'), r.out);
    assert.ok(rs.some((x) => x.mark === '+' && x.n === 2 && x.text === 'L2'), r.out);
  });

  test('numbers of an earlier block are mapped to the final file when a later block shifts them', () => {
    const d = mkcase();
    w(d, 'a.txt', lines(12));
    const r = run(d, [], sec('a.txt', blk('L9', 'NINE'), blk('L2', 'L2\nn1\nn2')));
    assert.equal(r.code, 0, r.all);
    const final = rd(d, 'a.txt').split('\n');
    for (const x of rows(r.out)) assert.equal(final[x.n - 1], x.text, `row ${x.n}`);
    assert.ok(rows(r.out).some((x) => x.mark === '+' && x.text === 'NINE' && x.n === 11));
  });

  test('every printed row matches the final file (several files, deletions, all)', () => {
    const d = mkcase();
    w(d, 'a.txt', lines(40, (i) => `row${i % 5}`));
    const r = run(d, ['--context', '1'], sec('a.txt', blk('row3', 'THREE', 'all'), blk('row0\nrow1', 'zero-one', 'all')));
    assert.equal(r.code, 0, r.all);
    const final = rd(d, 'a.txt').split('\n');
    for (const x of rows(r.out)) assert.equal(final[x.n - 1], x.text);
  });

  test('excerpt cap: 14 changed lines shown in full, more are elided (first 6 / last 6)', () => {
    const d = mkcase();
    w(d, 'a.txt', lines(60));
    let r = run(d, [], sec('a.txt', blk('L30', Array.from({ length: 14 }, (_, i) => `n${i}`).join('\n'))));
    assert.equal(rows(r.out).filter((x) => x.mark === '+').length, 14);
    assert.doesNotMatch(r.out, /more changed lines/);
    w(d, 'a.txt', lines(60));
    r = run(d, [], sec('a.txt', blk('L30', Array.from({ length: 40 }, (_, i) => `n${i}`).join('\n'))));
    const plus = rows(r.out).filter((x) => x.mark === '+').map((x) => x.text);
    assert.deepEqual(plus, ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n34', 'n35', 'n36', 'n37', 'n38', 'n39']);
    assert.match(r.out, /… 28 more changed lines …/);
    const final = rd(d, 'a.txt').split('\n');
    for (const x of rows(r.out)) assert.equal(final[x.n - 1], x.text);
  });

  test('lines longer than 200 chars are cut for display only', () => {
    const d = mkcase();
    w(d, 'a.txt', 'short\n' + 'y'.repeat(500) + '\n');
    const r = run(d, [], sec('a.txt', blk('short', 'x'.repeat(300))));
    const row = rows(r.out).find((x) => x.mark === '+');
    assert.equal(row.text, 'x'.repeat(200) + '…');
    assert.equal(rd(d, 'a.txt'), 'x'.repeat(300) + '\n' + 'y'.repeat(500) + '\n');
  });

  test('--max-chars: later edits collapse to one line each', () => {
    const d = mkcase();
    const U = (i) => `<L${i}>`;
    w(d, 'a.txt', lines(200, U));
    w(d, 'b.txt', lines(50, U));
    const script = sec('a.txt', ...[10, 50, 90, 130, 170].map((n) => blk(`<L${n}>`, `changed ${n}`))) + sec('b.txt', blk('<L7>', 'seven'));
    const full = run(d, [], script);
    assert.equal(full.code, 0);
    w(d, 'a.txt', lines(200, U));
    w(d, 'b.txt', lines(50, U));
    const r = run(d, ['--max-chars', '260'], script);
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /^applied 6 edits in 2 files\n/);
    assert.match(r.out, /^a\.txt: lines 130-130 changed$/m);
    assert.match(r.out, /^a\.txt: lines 170-170 changed$/m);
    assert.match(r.out, /^b\.txt: lines 7-7 changed$/m);
    assert.match(r.out, /\+ +10  changed 10/);
    assert.ok(r.out.length < full.out.length);
    assert.equal(rd(d, 'b.txt').split('\n')[6], 'seven');
  });
});

describe('--check', () => {
  function repo(kind, exitCode = 0) {
    const d = mkcase();
    spawnSync('git', ['init', '-q'], { cwd: d });
    w(d, 'src/a.txt', 'a\n');
    w(d, 'src/b.txt', 'b\n');
    if (kind === 'script') {
      const p = w(d, 'scripts/check', `#!/bin/sh\necho "cwd=$(pwd) args=$*"\necho "to-stderr" >&2\nexit ${exitCode}\n`);
      fs.chmodSync(p, 0o755);
    } else if (kind === 'npm') {
      w(d, 'package.json', JSON.stringify({ name: 'x', version: '1.0.0', scripts: { check: `echo "npm-args:" && node -e "console.log(process.argv.slice(1).join('|'))" --` + (exitCode ? ' && exit ' + exitCode : '') } }));
    } else if (kind === 'nonexec') {
      w(d, 'scripts/check', '#!/bin/sh\necho no\n');
    }
    return fs.realpathSync(d);
  }

  test('scripts/check passes: output appended after "--- check", edited paths relative to root', () => {
    const d = repo('script');
    const r2 = run(path.join(d, 'src'), ['--check'], sec('a.txt', blk('a', 'AA')) + sec('b.txt', blk('b', 'BB')));
    assert.equal(r2.code, 0, r2.all);
    assert.match(r2.out, /^applied 2 edits in 2 files\n/);
    assert.match(r2.out, /\n--- check\ncwd=.*args=src\/a\.txt src\/b\.txt\nto-stderr\n$/);
    assert.ok(r2.out.includes(`cwd=${d} `));
  });

  test('scripts/check fails: exit code propagated, edits kept, header says so', () => {
    const d = repo('script', 3);
    const r = run(d, ['--check'], sec('src/a.txt', blk('a', 'A')));
    assert.equal(r.code, 3, r.all);
    assert.match(r.out, /^applied 1 edit in 1 file \(kept\); check failed\n/);
    assert.match(r.out, /\n--- check\n/);
    assert.equal(rd(d, 'src/a.txt'), 'A\n');
  });

  test('--check=ARGS replaces the default arguments', () => {
    const d = repo('script');
    const r = run(d, ['--check=--fast "two words"'], sec('src/a.txt', blk('a', 'A')));
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /args=--fast two words\n/);
    assert.doesNotMatch(r.out, /src\/a\.txt\n/);
  });

  test('package.json check script via npm run check --silent --', () => {
    const d = repo('npm');
    const r = run(d, ['--check'], sec('src/a.txt', blk('a', 'A')) + sec('src/b.txt', blk('b', 'B')));
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /--- check\nnpm-args:\nsrc\/a\.txt\|src\/b\.txt\n$/);
    const bad = repo('npm', 5);
    const r2 = run(bad, ['--check'], sec('src/a.txt', blk('a', 'A')));
    assert.equal(r2.code, 5, r2.all);
    assert.match(r2.out, /check failed/);
  });

  test('no check command: message, exit 0', () => {
    const d = repo('none');
    const r = run(d, ['--check'], sec('src/a.txt', blk('a', 'A')));
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, new RegExp(`--- check\\nno check command found in ${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n$`));
    assert.doesNotMatch(r.out, /check failed/);
  });

  test('a non-executable scripts/check is not used', () => {
    const d = repo('nonexec');
    const r = run(d, ['--check'], sec('src/a.txt', blk('a', 'A')));
    assert.match(r.out, /no check command found/);
  });

  test('failed edits do not run the check', () => {
    const d = repo('script');
    const r = run(d, ['--check'], sec('src/a.txt', blk('zzz', 'A')));
    assert.equal(r.code, 1);
    assert.doesNotMatch(r.out + r.err, /--- check/);
  });
});

// ------------------------------------------------------------------ property
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Independent, deliberately naive reference implementation.
function refApply(text, search, rep, count, original) {
  // line ending style of the ORIGINAL file: CRLF if more than half of its line endings are CRLF
  let nl = 0, crlf = 0;
  for (let i = 0; i < original.length; i++) {
    if (original[i] === '\n') { nl++; if (i > 0 && original[i - 1] === '\r') crlf++; }
  }
  const useCrlf = crlf * 2 > nl;
  const conv = (s) => (useCrlf ? s.split('\n').join('\r\n') : s);
  const s = conv(search), r = conv(rep);
  const pieces = text.split(s);
  const found = pieces.length - 1;
  if (found === 0) return { ok: false };
  if (count !== 'all' && found !== count) return { ok: false };
  let out = pieces[0];
  let off = pieces[0].length;
  let skip = 0;
  for (let j = 1; j < pieces.length; j++) {
    const start = off;
    const end = start + s.length;
    let piece = pieces[j];
    if (r === '') {
      const atLineStart = start === 0 || text[start - 1] === '\n';
      if (atLineStart && !s.endsWith('\n')) {
        if (text.startsWith('\r\n', end)) { piece = piece.slice(2); skip = 2; }
        else if (text.startsWith('\n', end)) { piece = piece.slice(1); skip = 1; }
      }
    }
    out += r + piece;
    off = end + pieces[j].length;
  }
  return { ok: true, text: out };
}

test('property: 200 random files/scripts agree with the reference implementation', () => {
  const rnd = mulberry32(Number(process.env.EDITS_TEST_SEED || 20261125));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const int = (n) => Math.floor(rnd() * n);
  const words = ['foo', 'bar', 'baz', 'x', 'héllo', '日本', 'a b', '{', '}', 'if (x) {', 'return 1;', '  ', 'tab\there', '😀'];
  const mkLine = () => pick(['', '  ', '    ', '\t']) + Array.from({ length: int(4) }, () => pick(words)).join(' ');
  let failures = 0, successes = 0;
  const d = mkcase();
  for (let iter = 0; iter < 200; iter++) {
    const dir = path.join(d, `p${iter}`);
    fs.mkdirSync(dir);
    const nFiles = 1 + int(3);
    const files = [];
    for (let f = 0; f < nFiles; f++) {
      const n = int(13);
      const style = pick(['lf', 'lf', 'lf', 'crlf', 'crlf', 'mixed']);
      let content = '';
      for (let i = 0; i < n; i++) {
        const eol = style === 'lf' ? '\n' : style === 'crlf' ? '\r\n' : (rnd() < 0.8 ? '\r\n' : '\n');
        const last = i === n - 1;
        content += mkLine() + (last && rnd() < 0.3 ? '' : eol);
      }
      const bom = rnd() < 0.2;
      files.push({ name: `f${f}.txt`, orig: content, bom, cur: content });
    }
    let script = '';
    let expectFail = false;
    const mode = {};
    for (const f of files) {
      fs.writeFileSync(path.join(dir, f.name), (f.bom ? '﻿' : '') + f.orig);
      const nb = 1 + int(4);
      script += `=== ${f.name}\n`;
      for (let b = 0; b < nb; b++) {
        const lf = f.cur.replace(/\r\n/g, '\n');
        let search;
        const kind = int(10);
        if (kind < 4 && lf.length) {
          const ls = lf.split('\n');
          const i = int(ls.length), j = Math.min(ls.length - 1, i + int(3));
          search = ls.slice(i, j + 1).join('\n') + (rnd() < 0.3 && j < ls.length - 1 ? '\n' : '');
        } else if (kind < 8 && lf.length) {
          const a = int(lf.length), len = 1 + int(Math.min(25, lf.length - a));
          search = lf.slice(a, a + len);
        } else search = pick(['zzz-not-there', 'foo\nzzz', 'x']);
        if (search === '') search = 'q-none';
        // slicing may split a surrogate pair: not representable as UTF-8 text
        if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(search)) search = 'x';
        // a search line equal to the separator is not expressible in the text format (by design)
        if (search.split('\n').includes('=======')) search = 'x';
        const rep = pick(['', '', 'NEW', 'multi\nline\nrep', 'ünï', 'tail\n', '\n', 'a\n=======\nb']);
        if (rep === '' && search.startsWith('\n')) search = 'x';
        let countSpec = 1, mod = '';
        const cm = int(6);
        if (cm === 0) { countSpec = 'all'; mod = 'all'; }
        else if (cm === 1) {
          const c = lf.split(search).length - 1;
          countSpec = c >= 1 ? c : 2; mod = String(countSpec);
          if (countSpec === 1) mod = '';
        }
        script += `<<<<<<< SEARCH${mod ? ' ' + mod : ''}\n${search}\n=======\n${rep}\n>>>>>>> REPLACE\n`;
        const res = refApply(f.cur, search, rep, countSpec, f.orig);
        if (res.ok) f.cur = res.text; else expectFail = true;
      }
    }
    const r = run(dir, [], script);
    if (expectFail) {
      failures++;
      assert.equal(r.code, 1, `iter ${iter}\n${script}\n${r.all}`);
      for (const f of files) assert.equal(fs.readFileSync(path.join(dir, f.name), 'utf8'), (f.bom ? '﻿' : '') + f.orig, `iter ${iter} unchanged`);
    } else {
      successes++;
      assert.equal(r.code, 0, `iter ${iter}\n${script}\n${r.all}`);
      for (const f of files) {
        const got = fs.readFileSync(path.join(dir, f.name));
        assert.ok(got.equals(Buffer.from((f.bom ? '﻿' : '') + f.cur)), `iter ${iter} ${f.name}\n${script}\nexpected ${JSON.stringify(f.cur)}\ngot      ${JSON.stringify(got.toString())}`);
      }
    }
  }
  assert.ok(failures >= 20 && successes >= 20, `generator balance: ${successes} ok / ${failures} failing`);
});

// ---------------------------------------------------------------- Windows behaviour (hidden seams, run on Linux)
// EDITS_FAKE_PLATFORM=win32 turns on the Windows rules; EDITS_FAKE_RENAME_FAILS=N[@NAME] makes the first N renames
// onto each target whose path contains NAME fail with EPERM; EDITS_FAKE_CHMOD_FAIL=1 makes fchmod fail.
function runEnv(cwd, env, input, args = []) {
  const r = spawnSync(process.execPath, [EDITS, ...args], { cwd, input: input ?? '', encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr, all: r.stdout + r.stderr };
}
const leftovers = (d) => fs.readdirSync(d, { recursive: true }).filter((n) => /\.edits-.*\.tmp$/.test(String(n)));

describe('windows: transient rename failures', () => {
  test('succeeds when the rename fails twice (EPERM) and then works', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\n');
    w(d, 'b.txt', 'b\n');
    fs.chmodSync(path.join(d, 'b.txt'), 0o640);
    const t0 = Date.now();
    const r = runEnv(d, { EDITS_FAKE_PLATFORM: 'win32', EDITS_FAKE_RENAME_FAILS: '2' }, sec('a.txt', blk('a', 'A')) + sec('b.txt', blk('b', 'B')));
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /^applied 2 edits in 2 files/);
    assert.equal(rd(d, 'a.txt'), 'A\n');
    assert.equal(rd(d, 'b.txt'), 'B\n');
    assert.equal(fs.statSync(path.join(d, 'b.txt')).mode & 0o777, 0o640);
    assert.deepEqual(leftovers(d), []);
    assert.ok(Date.now() - t0 < 5000, 'the backoff is short');
  });

  test('4 failures still succeed (5 attempts in all); 5 failures report the error', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\n');
    assert.equal(runEnv(d, { EDITS_FAKE_PLATFORM: 'win32', EDITS_FAKE_RENAME_FAILS: '4' }, sec('a.txt', blk('a', 'A'))).code, 0);
    assert.equal(rd(d, 'a.txt'), 'A\n');
    const r = runEnv(d, { EDITS_FAKE_PLATFORM: 'win32', EDITS_FAKE_RENAME_FAILS: '5' }, sec('a.txt', blk('A', 'AA')));
    assert.equal(r.code, 1);
    assert.match(r.err, /write failed for a\.txt: EPERM/);
    assert.match(r.err, /nothing changed/);
    assert.equal(rd(d, 'a.txt'), 'A\n');
    assert.deepEqual(leftovers(d), []);
  });

  test('after 5 failures on a later file the error is reported and every file already written is rolled back', () => {
    const d = mkcase();
    w(d, 'one.txt', '1\n');
    w(d, 'two.txt', '2\n');
    w(d, 'sub/three.txt', '3\n');
    fs.chmodSync(path.join(d, 'two.txt'), 0o600);
    const before = snapshot(d);
    const script = sec('one.txt', blk('1', 'ONE')) + '=== newdir/n.txt (new)\n<<<<<<< SEARCH\n=======\nx\n>>>>>>> REPLACE\n'
      + sec('sub/three.txt', blk('3', 'THREE')) + sec('two.txt', blk('2', 'TWO'));
    const r = runEnv(d, { EDITS_FAKE_PLATFORM: 'win32', EDITS_FAKE_RENAME_FAILS: '5@two.txt' }, script);
    assert.equal(r.code, 1);
    assert.match(r.err, /write failed for two\.txt: EPERM/);
    assert.match(r.err, /restored 3 files already written; nothing changed/);
    assert.doesNotMatch(r.all, /ROLLBACK INCOMPLETE/);
    assert.equal(snapshot(d), before, 'every file, mode and directory is as before');
    assert.deepEqual(leftovers(d), []);
    assert.ok(!fs.existsSync(path.join(d, 'newdir')));
  });

  test('without the Windows rules there is a single attempt (Linux behaviour is unchanged)', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\n');
    const r = runEnv(d, { EDITS_FAKE_RENAME_FAILS: '1' }, sec('a.txt', blk('a', 'A')));
    assert.equal(r.code, 1);
    assert.match(r.err, /write failed for a\.txt: EPERM/);
    assert.equal(rd(d, 'a.txt'), 'a\n');
    assert.deepEqual(leftovers(d), []);
  });
});

describe('windows: chmod and chown', () => {
  test('a failing chmod does not fail the edit on win32, and does on Linux', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\n');
    const ok = runEnv(d, { EDITS_FAKE_PLATFORM: 'win32', EDITS_FAKE_CHMOD_FAIL: '1' }, sec('a.txt', blk('a', 'A')));
    assert.equal(ok.code, 0, ok.all);
    assert.equal(rd(d, 'a.txt'), 'A\n');
    const bad = runEnv(d, { EDITS_FAKE_CHMOD_FAIL: '1' }, sec('a.txt', blk('A', 'B')));
    assert.equal(bad.code, 1);
    assert.match(bad.err, /write failed for a\.txt: EPERM/);
    assert.equal(rd(d, 'a.txt'), 'A\n');
    assert.deepEqual(leftovers(d), []);
  });
});

describe('scripts arriving with CRLF line endings (a Windows shell)', () => {
  const crlf = (s) => s.replace(/\n/g, '\r\n');

  test('stdin script, LF target', () => {
    const d = mkcase();
    w(d, 'a.txt', 'one\ntwo\nthree\n');
    const r = run(d, [], crlf(sec('a.txt', blk('one\ntwo', 'ONE\nTWO'))));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'ONE\nTWO\nthree\n');
  });

  test('stdin script, CRLF target: the file keeps its CRLF and no stray CR appears', () => {
    const d = mkcase();
    w(d, 'a.txt', 'one\r\ntwo\r\nthree\r\n');
    const r = run(d, [], crlf(sec('a.txt', blk('one\ntwo', 'ONE\nTWO\nMORE'))));
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'ONE\r\nTWO\r\nMORE\r\nthree\r\n');
  });

  test('SEARCH modifiers, several files, (new) and (overwrite) blocks in one CRLF script, read with "-"', () => {
    const d = mkcase();
    w(d, 'a.txt', 'x\nx\ny\n');
    w(d, 'b.txt', 'old\n');
    const script = crlf(sec('a.txt', blk('x', 'z', 'all')) + sec('b.txt', blk('old', 'new'))
      + '=== c.txt (new)\n<<<<<<< SEARCH\n=======\nfresh\nfile\n>>>>>>> REPLACE\n'
      + '=== b2.txt (overwrite)\n<<<<<<< SEARCH\n=======\nover\n>>>>>>> REPLACE\n');
    w(d, 'b2.txt', 'before\n');
    const r = run(d, ['-'], script);
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'z\nz\ny\n');
    assert.equal(rd(d, 'b.txt'), 'new\n');
    assert.equal(rd(d, 'c.txt'), 'fresh\nfile\n');
    assert.equal(rd(d, 'b2.txt'), 'over\n');
  });

  test('JSON script with CRLF between its tokens', () => {
    const d = mkcase();
    w(d, 'a.txt', 'q\n');
    const r = run(d, [], '[\r\n  {"file": "a.txt",\r\n   "old": "q",\r\n   "new": "r"}\r\n]\r\n');
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'r\n');
  });

  test('blank lines inside the search text survive a CRLF script; a script file works like stdin', () => {
    const d = mkcase();
    w(d, 'a.txt', 'a\n\nb\n');
    w(d, 'script.txt', crlf(sec('a.txt', blk('a\n\nb', 'a\n\nB'))));
    const r = run(d, ['script.txt']);
    assert.equal(r.code, 0, r.all);
    assert.equal(rd(d, 'a.txt'), 'a\n\nB\n');
  });
});
