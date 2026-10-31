// Checks for the release notes (CHANGELOG.md, shown in the app): the version in package.json has its notes,
// first; the versions go newest first, each with a date and a line that sums it up; and the reading of them.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/releases/releases-test.ts && node dist/dev/releases-test.js
import assert from 'node:assert/strict';
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
