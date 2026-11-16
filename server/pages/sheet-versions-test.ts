// Script tests for a spreadsheet's versions as its Compare uses them: an agent's save compared with the version before
// it (what the turn's See what changed shows), and Put back the version before, through the route the editor calls:
// a new version on top, the same as the old one (nothing lost: the agent's version stays among the versions). Build
// and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/sheet-versions-test.ts
//   DATA_DIR=/tmp/hydor-test-sheet-versions node dist/dev/sheet-versions-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { normalizeBook, type Workbook } from '../../shared/sheets.ts';
import { diffBooks } from '../../shared/sheet-diff.ts';
import { addVersion, createPage } from './store.ts';
import { pages } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-sheet-versions-')));
const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify();
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const deps = { app, db, sessions: { deliverOrQueue: async () => {} }, broadcast() {}, toSubscribers() {}, publicBase: () => 'https://naget.example' } as unknown as Deps;
pages.routes!(deps);
await app.ready();
const req = async (method: 'GET' | 'POST', url: string) => {
  const r = await app.inject({ method, url });
  return { status: r.statusCode, json: () => JSON.parse(r.body) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const modelOf = async (id: string, v: number) => (await req('GET', `/api/pages/${id}/versions/${v}?model=1`)).json().model as Workbook;

const first = normalizeBook({
  sheets: [{ id: 'b', name: 'Budget', rows: [['Item', 'Amount'], ['Rent', 1000], ['Food', 300], ['Total', '=SUM(B2:B3)']] }],
});
const page = createPage(db, { title: 'Budget', kind: 'sheet', model: first, by: 'made' });
// The agent's turn: a row put in, a figure changed, a tab added.
const second = normalizeBook({
  sheets: [
    { id: 'b', name: 'Budget', rows: [['Item', 'Amount'], ['Rent', 1100], ['Food', 300], ['Travel', 250], ['Total', '=SUM(B2:B4)']] },
    { id: 'n', name: 'Notes', rows: [['Checked']] },
  ],
});
const saved = addVersion(db, page.id, { model: second, by: 'agent', turn: 'claude:s1#t1' });
ok(saved.version === 2, 'the agent’s save is version 2');

// What the turn changed: version 1 against version 2.
const v1 = await modelOf(page.id, 1);
const v2 = await modelOf(page.id, 2);
const d = diffBooks(v1, v2);
ok(d.totals.cells === 2 && d.totals.rowsAdded === 1 && d.totals.tabsAdded === 1, `what the agent changed: two cells, a row, a tab (${JSON.stringify(d.totals)})`);
ok(d.tabs[0].cells[0]?.before.shown === '1000' && d.tabs[0].cells[0]?.after.shown === '1100', 'the figure, before and after');
// The total taken over the new last row is the agent's own change (a row put in under a range does not grow it).
ok(d.tabs[0].cells[1]?.kind === 'formula' && d.tabs[0].cells[1].before.input === '=SUM(B2:B3)' && d.tabs[0].cells[1].after.input === '=SUM(B2:B4)', 'the total’s formula, widened by the agent');

// Put back the version before: a new version, the same as version 1; version 2 is still there.
const r = await req('POST', `/api/pages/${page.id}/versions/1/restore`);
ok(r.status === 200 && r.json().page.version === 3, `put back as a new version (${r.status}, v${r.json().page?.version})`);
const v3 = await modelOf(page.id, 3);
ok(diffBooks(v1, v3).same, 'the new version is the same as the one put back');
ok(JSON.stringify(v3) === JSON.stringify(v1), 'to the byte');
const list = (await req('GET', `/api/pages/${page.id}`)).json().versions as { version: number; by: string }[];
ok(list.map((v) => v.version).join() === '3,2,1' && list[0].by === 'restore', `nothing is lost: versions ${list.map((v) => `${v.version}:${v.by}`).join(', ')}`);
ok(!diffBooks(v3, await modelOf(page.id, 2)).same, 'the agent’s version can still be compared with it');

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
