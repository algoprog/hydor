// OUTDIR=dist/dev node scripts/build-server.mjs web/src/components/file-refs-test.ts && node dist/dev/file-refs-test.js
import assert from 'node:assert/strict';
import { fileRef, filePathsIn, resolveFrom } from './file-refs';

const cwd = '/home/me/proj';
const home = '/home/me';
const known = ['/old/report.tex', '/a/b/report.tex', '/a/b/data.csv'];
const o = { cwd, home, known };

const tests: [string, () => void][] = [
  ['absolute paths are as they are, with or without a line', () => {
    assert.deepEqual(fileRef('/etc/hosts.conf', o), { path: '/etc/hosts.conf' });
    assert.deepEqual(fileRef('/src/app.ts:42', o), { path: '/src/app.ts', line: 42 });
    assert.deepEqual(fileRef('/src/app.ts:42:7', o), { path: '/src/app.ts', line: 42 });
    assert.deepEqual(fileRef('/src/app.ts:42-50', o), { path: '/src/app.ts', line: 42 });
    assert.deepEqual(fileRef('/src/app.ts#L9', o), { path: '/src/app.ts', line: 9 });
    assert.deepEqual(fileRef('C:\\Users\\me\\a.docx', o), { path: 'C:\\Users\\me\\a.docx' });
  }],
  ['~/ is from home, and nothing without one', () => {
    assert.deepEqual(fileRef('~/notes/a.md', o), { path: '/home/me/notes/a.md' });
    assert.equal(fileRef('~/a.md', { cwd }), null);
  }],
  ['a bare name is the last known file that ends with it, on a segment boundary', () => {
    assert.deepEqual(fileRef('report.tex', o), { path: '/a/b/report.tex' });
    assert.deepEqual(fileRef('b/report.tex', o), { path: '/a/b/report.tex' });
    assert.deepEqual(fileRef('data.csv:3', o), { path: '/a/b/data.csv', line: 3 });
    assert.equal(fileRef('port.tex', o), null);
    assert.equal(fileRef('eport.tex', o), null);
  }],
  ['a bare name the conversation never touched is no link', () => {
    assert.equal(fileRef('notes.md', o), null);
    assert.equal(fileRef('example.com', o), null);
  }],
  ['a relative path with a slash is from the folder, worked out', () => {
    assert.deepEqual(fileRef('docs/report.pdf', o), { path: '/home/me/proj/docs/report.pdf' });
    assert.deepEqual(fileRef('./x.md', o), { path: '/home/me/proj/x.md' });
    assert.deepEqual(fileRef('../x.md', o), { path: '/home/me/x.md' });
    assert.deepEqual(fileRef('src/../lib/a.ts:5', o), { path: '/home/me/proj/lib/a.ts', line: 5 });
    assert.equal(fileRef('docs/report.pdf', { known }), null);
  }],
  ['things that are not files', () => {
    for (const t of ['v1.2.3', '0.61.3', 'foo.bar()', 'e.g.', 'i.e.', 'https://x/y.pdf', 'http://example.com/a.html', 'mailto:a@b.com', 'file:///a/b.txt', '//host/x.pdf', 'a b.txt', 'a.b c', '1.5', 'x.', '.', '..', 'a/b/', 'a//b.txt', 'localhost:3000/a.js', 'github.com/x/y.go', 'example.com/page.html', 'foo.bar(1)', 'a.b.12345678901', '']) {
      assert.equal(fileRef(t, o), null, t);
    }
    // ...but a file the conversation has is a file whatever it looks like
    assert.deepEqual(fileRef('b/report.tex', { known: ['/a/b/report.tex'] }), { path: '/a/b/report.tex' });
  }],
  ['paths in plain text', () => {
    const t = 'Open /home/me/a.pdf, then ~/b/c.md. (see /x/y.txt:12) "/q/r.csv" and C:\\d\\e.docx!';
    assert.deepEqual(
      filePathsIn(t).map((s) => [t.slice(s.start, s.end), s.path, s.line]),
      [
        ['/home/me/a.pdf', '/home/me/a.pdf', undefined],
        ['~/b/c.md', '~/b/c.md', undefined],
        ['/x/y.txt:12', '/x/y.txt', 12],
        ['/q/r.csv', '/q/r.csv', undefined],
        ['C:\\d\\e.docx', 'C:\\d\\e.docx', undefined],
      ],
    );
  }],
  ['plain text: no web addresses, no folders, no versions, no fractions', () => {
    for (const t of ['https://example.com/a/b.pdf', 'see http://x.org/y.html now', 'the /api/health route', 'use /usr/bin/python3', 'a/b.txt', 'and/or 1/2.5', 'at /v1.2.3', 'ends with /a/b.', 'x//host/a.pdf', 'mail me@x.com/a.txt']) {
      assert.deepEqual(filePathsIn(t), [], t);
    }
  }],
  ['plain text: the start of the text, trailing punctuation, several in a row', () => {
    assert.deepEqual(filePathsIn('/a/b.txt'), [{ start: 0, end: 8, path: '/a/b.txt', line: undefined }]);
    // a run with a character no path has (here ;) is no path
    const t = '/a.md;/b.md /c.md? /d.md';
    assert.deepEqual(filePathsIn(t).map((s) => t.slice(s.start, s.end)), ['/c.md', '/d.md']);
    assert.deepEqual(filePathsIn('[/a/b.txt]').map((s) => s.path), ['/a/b.txt']);
  }],
  ['resolveFrom', () => {
    assert.equal(resolveFrom('/a/b', '../c/./d.txt'), '/a/c/d.txt');
    assert.equal(resolveFrom('/a', '../../x.md'), '/x.md');
    assert.equal(resolveFrom('C:\\a\\b', '..\\c.txt'), 'C:\\a\\c.txt');
  }],
];

let n = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    n++;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
}
console.log(`${n} passed`);
