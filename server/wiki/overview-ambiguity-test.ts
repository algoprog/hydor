// Regression checks for source-bound wiki progress, ambiguity and bounded display.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { browseWiki } from './browse.ts';
import { progressOf, wikiOverview } from './overview.ts';

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

/** Each case uses a disposable wiki and reads it through the real active-content browser. */
function withWiki(run: (put: (relative: string, content: string) => void, overview: () => ReturnType<typeof wikiOverview>) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-overview-ambiguity-'));
  const put = (relative: string, content: string) => {
    const file = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const overview = () => {
    const listing = browseWiki(root);
    return wikiOverview(root, listing.articles, listing.plans);
  };
  try { run(put, overview); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

/** A status register with an explicit, stable work-item identifier. */
const register = (id: string, status = 'Offen') => `| ID | Status |\n|---|---|\n| ${id} | ${status} |\n`;

/** Construct an evidence file with an exact number of distinct status rows. */
const many = (prefix: string, count: number) => `| ID | Status |\n|---|---|\n${Array.from({ length: count }, (_, index) => `| ${prefix}-${index + 1} | Offen |`).join('\n')}\n`;

test('fenced examples are not execution evidence', () => withWiki((put, overview) => {
  put('output/projects/example/plan.md', '# Plan\n\n```md\n## Umsetzungskontrolle\n- [x] Example is not evidence\n```\n');
  put('output/evidence/real/nachweise.md', '# Evidence\n\n~~~md\n| ID | Status |\n|---|---|\n| WI-FAKE-1 | Abgeschlossen |\n~~~\n\n| ID | Status |\n|---|---|\n| WI-REAL-1 | Offen |\n');
  const entries = overview().progress;
  assert.ok(!entries.some((entry) => entry.title.includes('Example') || entry.workItemId === 'WI-FAKE-1'));
  assert.equal(entries.find((entry) => entry.workItemId === 'WI-REAL-1')?.state, 'open');
}));

test('fenced plan examples cannot supply a task description', () => withWiki((put, overview) => {
  put('output/projects/example/plan.md', '# Plan\n\n```md\n- WI-01: Example, not the real task.\n```\n');
  put('output/projects/example/nachweise.md', register('WI-01'));
  assert.equal(overview().progress.find((entry) => entry.workItemId === 'WI-01')?.description, undefined);
}));

test('nested initiatives resolve their own plan, not the parent plan', () => withWiki((put, overview) => {
  put('output/projects/outer/plan.md', '# Parent\n- WI-01: Parent task.\n');
  put('output/projects/outer/nested/plan.md', '# Child\n- WI-01: Child task.\n');
  put('output/projects/outer/nested/nachweise.md', register('WI-01'));
  const entry = overview().progress.find((item) => item.path === 'output/projects/outer/nested/nachweise.md');
  assert.equal(entry?.description, 'Child task.');
  assert.equal(entry?.descriptionPath, 'output/projects/outer/nested/plan.md');
}));

test('differently cased initiative names are not joined on case-sensitive filesystems', () => withWiki((put, overview) => {
  put('output/projects/Foo/plan.md', '# Foo\n- WI-01: Wrong case task.\n');
  // Different roots allow this case even on a case-insensitive development filesystem.
  put('output/evidence/foo/nachweise.md', `[Plan](../../projects/Foo/plan.md)\n\n${register('WI-01')}`);
  const entry = overview().progress.find((item) => item.path.endsWith('/nachweise.md'));
  assert.equal(entry?.description, undefined);
}));

test('separate evidence requires an explicit matching plan link', () => withWiki((put, overview) => {
  put('output/projects/alpha/plan.md', '# Alpha\n- WI-01: Alpha task.\n');
  put('output/projects/beta/plan.md', '# Beta\n- WI-01: Beta task.\n');
  put('output/evidence/alpha/no-link.md', register('WI-01'));
  put('output/evidence/alpha/matching.md', `[Plan](../../projects/alpha/plan.md)\n\n${register('WI-01')}`);
  put('output/evidence/alpha/foreign.md', `[Plan](../../projects/beta/plan.md)\n\n${register('WI-01')}`);
  const entries = overview().progress;
  assert.equal(entries.find((item) => item.path.endsWith('/no-link.md'))?.description, undefined);
  assert.equal(entries.find((item) => item.path.endsWith('/matching.md'))?.description, 'Alpha task.');
  assert.equal(entries.find((item) => item.path.endsWith('/foreign.md'))?.description, undefined);
}));

test('a document-marked retired plan or evidence never supplies overview content', () => withWiki((put, overview) => {
  put('output/projects/old/plan.md', '---\ndocument_status: archived\n---\n# Old\n- WI-01: Retired description.\n');
  put('output/projects/old/nachweise.md', register('WI-01'));
  put('output/projects/old/status-archived.md', `---\ndocument_status: retired\n---\n${register('WI-RETIRED-1', 'Abgeschlossen')}`);
  const entries = overview().progress;
  assert.equal(entries.find((entry) => entry.workItemId === 'WI-01')?.description, undefined);
  assert.ok(!entries.some((entry) => entry.workItemId === 'WI-RETIRED-1'));
}));

test('contradictions apply to the same work item and stage despite different task titles', () => withWiki((put, overview) => {
  put('output/projects/conflicts/nachweise.md', '| ID | Aufgabe | Umsetzung | Abnahme |\n|---|---|---|---|\n| WI-01 | Login | Abgeschlossen | Offen |\n| WI-01 | Authentifizierung | Offen | Offen |\n');
  const entries = overview().progress.filter((entry) => entry.workItemId === 'WI-01');
  const implementation = entries.filter((entry) => entry.title.includes('Umsetzung'));
  const acceptance = entries.filter((entry) => entry.title.includes('Abnahme'));
  assert.ok(implementation.length && implementation.every((entry) => entry.state === 'unknown'));
  assert.ok(acceptance.length && acceptance.every((entry) => entry.state === 'open'));
}));

test('synonymous stage names across registers conflict without mixing acceptance', () => withWiki((put, overview) => {
  // Two status sources describe the same phase in different supported languages.
  put('output/projects/same/nachweise.md', '| ID | Umsetzung | Abnahme |\n|---|---|---|\n| WI-01 | Abgeschlossen | Offen |\n');
  put('output/projects/same/status-extra.md', '| ID | Implementation |\n|---|---|\n| WI-01 | Offen |\n');
  const entries = overview().progress.filter((entry) => entry.workItemId === 'WI-01');
  assert.equal(entries.find((entry) => entry.title.includes('Umsetzung'))?.state, 'unknown');
  assert.equal(entries.find((entry) => entry.title.includes('Implementation'))?.state, 'unknown');
  assert.equal(entries.find((entry) => entry.title.includes('Abnahme'))?.state, 'open');
}));

test('identical work-item IDs in distinct initiatives remain independent', () => withWiki((put, overview) => {
  put('output/projects/alpha/nachweise.md', register('WI-01', 'Abgeschlossen'));
  put('output/projects/beta/nachweise.md', register('WI-01', 'Offen'));
  const entries = overview().progress.filter((entry) => entry.workItemId === 'WI-01');
  assert.equal(entries.find((entry) => entry.path.includes('/alpha/'))?.state, 'done');
  assert.equal(entries.find((entry) => entry.path.includes('/beta/'))?.state, 'open');
}));

test('unknown statuses preserve their exact source value', () => {
  const entries = progressOf('output/evidence/a/nachweise.md', register('WI-01', 'Dev 0.1.49 ausgeliefert'));
  assert.deepEqual([entries[0].state, entries[0].label], ['unknown', 'Dev 0.1.49 ausgeliefert']);
});

test('per-document truncation is reported only when a 201st status exists', () => {
  withWiki((put, overview) => {
    put('output/evidence/single/nachweise.md', many('A', 200));
    const view = overview();
    assert.equal(view.progress.length, 200);
    assert.equal(view.progressTruncated, false);
  });
  withWiki((put, overview) => {
    put('output/evidence/single/nachweise.md', many('A', 201));
    const view = overview();
    assert.equal(view.progress.length, 200);
    assert.equal(view.progressTruncated, true);
  });
});

test('a contradiction after the per-document display limit cannot appear settled', () => withWiki((put, overview) => {
  // The 201st source row conflicts with a visible row, even though it is beyond the display limit.
  const middle = Array.from({ length: 199 }, (_, index) => `| OTHER-${index + 1} | Offen |`).join('\n');
  put('output/projects/long/nachweise.md', `| ID | Status |\n|---|---|\n| WI-01 | Abgeschlossen |\n${middle}\n| WI-01 | Offen |\n`);
  const view = overview();
  assert.equal(view.progressTruncated, true);
  assert.equal(view.progress.find((entry) => entry.workItemId === 'WI-01')?.state, 'unknown');
}));

test('a contradiction after the total display limit cannot appear settled', () => withWiki((put, overview) => {
  // A later file can contradict a visible status even when only the first 500 entries are shown.
  const other = Array.from({ length: 199 }, (_, index) => `| A-${index + 1} | Offen |`).join('\n');
  put('output/projects/long/nachweise.md', `| ID | Status |\n|---|---|\n| WI-01 | Abgeschlossen |\n${other}\n`);
  put('output/projects/long/status-b.md', many('B', 200));
  put('output/projects/long/status-c.md', `${many('C', 100)}| WI-01 | Offen |\n`);
  const view = overview();
  assert.equal(view.progress.length, 500);
  assert.equal(view.progressTruncated, true);
  assert.equal(view.progress.find((entry) => entry.workItemId === 'WI-01')?.state, 'unknown');
}));

test('total truncation is reported only when a 501st status exists', () => {
  for (const extra of [100, 101]) withWiki((put, overview) => {
    put('output/evidence/first/nachweise.md', many('A', 200));
    put('output/evidence/second/nachweise.md', many('B', 200));
    put('output/evidence/third/nachweise.md', many('C', extra));
    const view = overview();
    assert.equal(view.progress.length, 500);
    assert.equal(view.progressTruncated, extra === 101);
  });
});

let passed = 0;
for (const [name, run] of tests) {
  try { run(); passed++; console.log(`ok - ${name}`); }
  catch (error) { console.error(`not ok - ${name}\n${(error as Error).stack}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);
