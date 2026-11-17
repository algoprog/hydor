// Checks what agents get of a wiki's areas: the one line of areas in their instructions (not for a model of a small
// context), the area named in the wiki lines given with a message and in memory_search's results, and the Memory
// tab's view grouped by area.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/wiki/areas/delivery-test.ts && DATA_DIR=/tmp/hydor-test-areas-delivery node dist/dev/delivery-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { kvSet, openDb } from '../../db.ts';
import type { Deps, RunCtx } from '../../features/types.ts';
import { progress } from '../../knowledge/indexer.ts';
import { docsOf } from '../../knowledge/store.ts';
import { memoryTools } from '../../memory/tools.ts';
import { createSpace } from '../../spaces/index.ts';
import { wikiBrowse } from '../browse-feature.ts';
import { wikiLines } from '../deliver.ts';
import { writeIndex } from '../digest/write.ts';
import { wiki } from '../index.ts';
import { ensureWikiKnowledge } from '../knowledge/index.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { emptyRegistry, registryText } from './registry.ts';
import { AREAS_LINE_MAX, areasLine } from './tend.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-areas-delivery-')));
const db = openDb(path.join(temp, 'test.db'));
kvSet(db, 'memory.meaning', '0');
setWikiSettings(db, { enabled: true, hubPath: path.join(temp, 'hub') });
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// A project whose wiki is in its own folder, with areas.
const folder = path.join(temp, 'shop');
const root = path.join(folder, 'wiki-memory');
fs.mkdirSync(path.join(root, 'wiki'), { recursive: true });
fs.mkdirSync(path.join(root, 'raw'), { recursive: true });
fs.writeFileSync(path.join(folder, 'AGENTS.md'), '# Shop\n\n- Wiki: `wiki-memory`\n');
const space = createSpace(db, { name: 'Shop', folder });
const put = (rel: string, title: string, summary: string, areas: string, body: string) => fs.writeFileSync(path.join(root, rel), `---\ntitle: ${JSON.stringify(title)}\nsummary: ${JSON.stringify(summary)}\nareas: [${areas}]\nupdated: 2026-11-10\n---\n\n# ${title}\n\n${body}\n`);
put('wiki/payments.md', 'Stripe payments', 'How the shop takes payments with Stripe webhooks and refunds', 'payments', 'Webhooks retry for three days; refunds go back to the card.');
put('wiki/refunds.md', 'Refund rules', 'When a refund is given', 'payments', 'A refund is given within 30 days.');
put('wiki/invoices.md', 'Invoices', 'How invoices are numbered', 'payments', 'Invoices are numbered by year.');
put('wiki/catalogue.md', 'Catalogue', 'Products by season', 'catalogue', 'The catalogue lists products by season.');
put('wiki/photos.md', 'Product photos', 'Photos from the studio', 'catalogue', 'Photos come from the studio.');
put('wiki/prices.md', 'Prices', 'How prices are set', 'catalogue, payments', 'Prices are set per season.');
put('wiki/shipping.md', 'Shipping', 'Carriers and costs', 'shipping', 'Parcels go with two carriers.');
put('wiki/returns.md', 'Returns', 'Sending things back', 'shipping', 'Returns are free within 14 days.');
put('wiki/packaging.md', 'Packaging', 'Boxes and paper', 'shipping', 'Boxes are recycled cardboard.');
put('wiki/plants.md', 'Office plants', 'Watering', 'other', 'The ficus is watered on Mondays.');
fs.mkdirSync(path.join(root, 'wiki', 'areas'));
fs.writeFileSync(path.join(root, 'wiki', 'areas', 'payments.md'), '---\nkind: hub\narea: payments\ntitle: "Payments"\nsummary: "Taking money"\nmembers:\n  - wiki/refunds.md 2026-11-10 00000000\n  - wiki/payments.md 2026-11-10 00000000\nupdated: 2026-11-10\n---\n\n# Payments\n\nTaking money.\n');
const r = emptyRegistry();
r.areas.unshift(
  { id: 'payments', name: 'Payments', about: 'Taking money, refunds and invoices', parent: null, aliases: [], createdAt: '', updatedAt: '' },
  { id: 'catalogue', name: 'Catalogue', about: 'What the shop sells', parent: null, aliases: [], createdAt: '', updatedAt: '' },
  { id: 'shipping', name: 'Shipping', about: 'Getting parcels out and back', parent: null, aliases: [], createdAt: '', updatedAt: '' },
);
fs.mkdirSync(path.join(root, '.structure'));
fs.writeFileSync(path.join(root, '.structure', 'areas.json'), registryText(r));
await writeIndex(root);

test('the areas line: top-level areas with their articles, Other last, at most 400 characters', () => {
  assert.equal(areasLine(root), 'Wiki areas: Payments (4) · Catalogue (3) · Shipping (3) · Other (1)');
  const many = emptyRegistry();
  for (let i = 0; i < 40; i++) many.areas.unshift({ id: `a${i}`, name: `A rather long area name ${i}`, about: '', parent: null, aliases: [], createdAt: '', updatedAt: '' });
  const other = path.join(temp, 'many');
  fs.mkdirSync(path.join(other, 'wiki'), { recursive: true });
  fs.mkdirSync(path.join(other, '.structure'));
  for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(other, 'wiki', `x${i}.md`), `---\ntitle: X${i}\nareas: [a${i}]\n---\n\n# X\n`);
  fs.writeFileSync(path.join(other, '.structure', 'areas.json'), registryText(many));
  const line = areasLine(other)!;
  assert.ok(line.length <= AREAS_LINE_MAX && line.endsWith(' …'), line);
  assert.equal(areasLine(path.join(temp, 'hub')), null, 'no areas: no line');
});

test('a starting agent gets the line, and the hint about index.md and hubs; not with a model of a small context', async () => {
  const deps = { db } as unknown as Deps;
  const info = { agent: 'claude' as const, key: 'claude:s1', cwd: folder, runId: 'r1', resume: false, extra: { space: space.id } };
  const full = (await wiki.spawn!(info, deps))!;
  assert.ok(full.instructions!.includes('Wiki areas: Payments (4) · Catalogue (3) · Shipping (3) · Other (1)'));
  assert.match(full.instructions![0], /index\.md, which lists the articles by area \(wiki\/areas\/<area>\.md is an area’s hub: what it covers, its key facts and its articles\)/);
  assert.match(full.instructions![0], /wiki_search/, 'and the flexible search beside it');
  const lean = (await wiki.spawn!({ ...info, key: 'custom:s2', lean: true }, deps))!;
  assert.ok(!lean.instructions!.some((x) => x.startsWith('Wiki areas:')));
});

test('the wiki lines and memory_search name an article’s area; hubs are searchable, Other is named too', async () => {
  const binding = ensureWikiKnowledge(db, { root, space: space.id });
  for (let i = 0; i < 400 && (docsOf(db, binding.base).length < 12 || progress.size); i++) await new Promise((res) => setTimeout(res, 25));
  const lines = await wikiLines(db, { space: space.id, query: 'how do stripe webhooks and refunds work here', limit: 3, vector: null });
  assert.equal(lines[0]?.text, '- Stripe payments — How the shop takes payments with Stripe webhooks and refunds (Payments · wiki/payments.md)', JSON.stringify(lines));
  const ctx = { runId: 'r', key: 'claude:me', agent: 'claude', cwd: folder, deps: { db, broadcast() {}, sessions: { summary: () => null } } } as unknown as RunCtx;
  db.prepare("insert into sessions (key, agent, id, path, title, cwd, updated_at) values ('claude:me', 'claude', 'me', '', 'Me', ?, ?)").run(folder, Date.now());
  const search = memoryTools(ctx).find((t) => t.name === 'memory_search')!;
  const out = String(await search.run({ query: 'stripe webhooks refunds', kinds: ['wiki'] }, ctx));
  assert.match(out, /- Stripe payments — How the shop takes payments with Stripe webhooks and refunds \(Shop · Payments · wiki\/payments\.md\)/, out);
  const plants = String(await search.run({ query: 'ficus watered mondays', kinds: ['wiki'] }, ctx));
  assert.match(plants, /\(Shop · Other · wiki\/plants\.md\)/, plants);
});

test('the Memory tab: the articles grouped by area, each with its hub, Other last; hubs not listed as articles', async () => {
  const app = Fastify();
  wikiBrowse.routes!({ app, db } as unknown as Deps);
  const view = (await app.inject({ method: 'GET', url: `/api/projects/${space.id}/wiki` })).json();
  assert.equal(view.status, 'ready');
  assert.deepEqual(
    view.areas.map((a: { id: string; hub?: string; articles: string[] }) => [a.id, a.hub ?? null, a.articles]),
    [
      ['payments', 'wiki/areas/payments.md', ['wiki/refunds.md', 'wiki/payments.md', 'wiki/invoices.md', 'wiki/prices.md']],
      ['catalogue', null, ['wiki/catalogue.md', 'wiki/prices.md', 'wiki/photos.md']],
      ['shipping', null, ['wiki/packaging.md', 'wiki/returns.md', 'wiki/shipping.md']],
      ['other', null, ['wiki/plants.md']],
    ],
    'the hub’s reading order first, then by title',
  );
  assert.ok(!view.articles.some((a: { path: string }) => a.path.startsWith('wiki/areas/')));
  // A redirect opens where it went.
  fs.writeFileSync(path.join(root, 'wiki', 'old-payments.md'), '---\ntitle: "Old payments"\nredirect: wiki/payments.md\n---\n\n# Old payments\n\nMerged.\n');
  const file = (await app.inject({ method: 'GET', url: `/api/projects/${space.id}/wiki/file?path=wiki/old-payments.md` })).json();
  assert.equal(file.path, 'wiki/payments.md');
  assert.equal(file.redirectedFrom, 'wiki/old-payments.md');
  const again = (await app.inject({ method: 'GET', url: `/api/projects/${space.id}/wiki` })).json();
  assert.ok(!again.articles.some((a: { path: string }) => a.path === 'wiki/old-payments.md'), 'a redirect is not listed');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`not ok - ${name}`);
    console.error(e);
    process.exitCode = 1;
    break;
  }
}
fs.rmSync(temp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit();
