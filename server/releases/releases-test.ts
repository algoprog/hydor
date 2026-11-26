// Checks for the release notes (CHANGELOG.md, shown in the app): the version in package.json has its notes,
// first; the versions go newest first, each with a date and a line that sums it up; and the reading of them. Also what a
// release needs to build on every system: no two files whose names differ only by upper and lower case.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/releases/releases-test.ts && node dist/dev/releases-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { compareVersions, parseReleases } from '../../shared/releases.ts';
import { APP_ROOT } from '../config.ts';
import { CHANGELOG, releases } from './index.ts';

let passed = 0;
const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('the version running has its notes, first; the rest go back in order, each dated and summed up', () => {
  const version = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')).version;
  const r = releases();
  assert.equal(r.current, version);
  assert.equal(r.releases[0]?.version, version, `CHANGELOG.md has no notes for ${version} at its top: add them when you change the version`);
  r.releases.forEach((x, i) => {
    assert.ok(x.date, `${x.version} has a date`);
    assert.ok(x.summary.length > 10 && !x.summary.startsWith('-'), `${x.version} starts with a line that sums it up`);
    if (i) assert.ok(compareVersions(r.releases[i - 1].version, x.version) > 0, `${r.releases[i - 1].version} comes before ${x.version}`);
  });
  assert.ok(fs.existsSync(CHANGELOG));
});

test('reading them: headings, dates, the first paragraph, versions compared as numbers', () => {
  const md = '# Release notes\n\nIntro.\n\n## 0.10.0 · 1 May 2027\n\nBig one,\nover two lines.\n\n- a\n- b\n\n## 0.9.2\n\nSmall.\n';
  const r = parseReleases(md);
  assert.deepEqual(
    r.map((x) => [x.version, x.date, x.summary]),
    [
      ['0.10.0', '1 May 2027', 'Big one, over two lines.'],
      ['0.9.2', undefined, 'Small.'],
    ],
  );
  assert.match(r[0].notes, /- a\n- b$/);
  assert.ok(compareVersions('0.10.0', '0.9.2') > 0 && compareVersions('0.6.1', '0.6.1') === 0 && compareVersions('0.6.0', '0.6.1') < 0);
});

test('no two files differ only by upper and lower case: a Mac and Windows read one for the other, and the desktop apps do not build', () => {
  let files: string[];
  try {
    files = execFileSync('git', ['ls-files'], { cwd: APP_ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean);
  } catch {
    return; // not a checkout: nothing to list
  }
  // An import names a module without its ending, so Side.tsx and side.ts are one name to it where case is ignored.
  const ending = /\.(tsx?|mts|cts|jsx?|mjs|cjs)$/;
  const byName = new Map<string, string>();
  const alike: string[] = [];
  for (const f of files) {
    const name = ending.test(f) ? f.replace(ending, '') : `${f}\u0000`;
    const was = byName.get(name.toLowerCase());
    if (was !== undefined && was !== name) alike.push(`${was.replace('\u0000', '')} and ${f}`);
    else byName.set(name.toLowerCase(), name);
  }
  assert.deepEqual(alike, [], 'rename one of each pair');
});

for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
