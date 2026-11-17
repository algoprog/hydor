// Checks wiki memory given to agents without asking: the lines of the articles that stand out for a request (wiki/
// articles only, each once, with what it covers and whether it may be out of date), the plans in progress with their
// open items, and the session checkpoints (on going on with a session, once; Custom's within its model's budget).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/wiki/deliver-test.ts && DATA_DIR=/tmp/hydor-test-wiki-deliver node dist/dev/deliver-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kvSet, openDb } from '../db.ts';
import type { Deps, SpawnAdditions } from '../features/types.ts';
import { progress } from '../knowledge/indexer.ts';
import { docsOf } from '../knowledge/store.ts';
import { checkpointChars } from '../memory/deliver.ts';
import { createSpace } from '../spaces/index.ts';
import { activePlans, frontMatter, openItems, wikiDeliverySpace, wikiLines } from './deliver.ts';
import { ensureWikiKnowledge } from './knowledge/index.ts';
import { setWikiSettings } from './settings/settings.ts';
import { wikiSession } from './session/index.ts';
import { captureEvent } from './session/store.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-deliver-')));
const db = openDb(path.join(temp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// A project whose AGENTS.md keeps its wiki in its own folder, and a hub for the session checkpoints.
const hub = path.join(temp, 'hub');
const folder = path.join(temp, 'shop');
const root = path.join(folder, 'knowledge', 'wiki');
fs.mkdirSync(path.join(root, 'wiki'), { recursive: true });
fs.mkdirSync(path.join(root, 'raw'), { recursive: true });
fs.writeFileSync(path.join(folder, 'AGENTS.md'), '# Shop\n\n- Wiki: `knowledge/wiki`\n');
setWikiSettings(db, { enabled: true, hubPath: hub });
kvSet(db, 'memory.meaning', '0');
const space = createSpace(db, { name: 'Shop', folder });
const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};

test('front matter, and the open items of a plan', () => {
  const { fields, body } = frontMatter('---\ntitle: "Payments"\nsummary: How we take payments\nanchors:\n  - server/pay.ts\n  - web/src/Pay.tsx\nstale: [server/pay.ts]\n---\n\n# Payments\n');
  assert.deepEqual(fields, { title: 'Payments', summary: 'How we take payments', anchors: ['server/pay.ts', 'web/src/Pay.tsx'], stale: ['server/pay.ts'] });
  assert.equal(body.trim(), '# Payments');
  assert.equal(openItems('- [ ] one\n- [x] two\n  * [ ] three'), 2, 'unchecked items');
  assert.equal(openItems('## Register\n\n| Item | State |\n|---|---|\n| A | accepted |\n| B | in progress |\n| C | Done |\n| D | waiting |'), 2, 'rows of a register not finished');
  assert.equal(openItems('Nothing to count.'), null);
});

test('wiki lines: the articles that stand out for a request, one line each, never index, log, sources or outputs, nor twice', async () => {
  write('wiki/payments.md', '---\ntitle: Stripe payments\nsummary: How the shop takes payments with Stripe webhooks and refunds\nstale: [server/pay.ts]\n---\n\n# Stripe payments\n\nWebhooks retry for three days.\n');
  write('wiki/catalogue.md', '---\ntitle: Catalogue\n---\n\n# Catalogue\n\nThe catalogue pages list products by season, with photos from the studio.\n');
  write('wiki/index.md', '# Index\n\n- [Stripe payments](payments.md) — stripe webhooks refunds\n');
  write('wiki/log.md', '- 2026-11-01 · stripe webhooks refunds\n');
  write('raw/stripe-notes.md', 'Stripe webhooks refunds raw source.\n');
  write('wiki/retired.md', '---\ndocument_status: retired\ntitle: Old stripe webhooks refunds\n---\nStripe webhooks refunds, as they were.\n');
  const binding = ensureWikiKnowledge(db, { root, space: space.id });
  for (let i = 0; i < 300 && (docsOf(db, binding.base).length < 4 || progress.size); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(wikiDeliverySpace(db, { cwd: folder, extra: {} }), space.id);
  assert.equal(wikiDeliverySpace(db, { cwd: folder, extra: { confidential: true } }), null, 'never in a confidential session');
  assert.equal(wikiDeliverySpace(db, { cwd: folder, extra: { wikiEnabled: false } }), null, 'nor with wiki memory off for the chat');
  const lines = await wikiLines(db, { space: space.id, query: 'how do stripe webhooks and refunds work here', limit: 3, vector: null });
  assert.deepEqual(
    lines.map((l) => l.path),
    ['wiki/payments.md'],
    JSON.stringify(lines),
  );
  assert.equal(lines[0].text, '- Stripe payments — How the shop takes payments with Stripe webhooks and refunds (wiki/payments.md) [may be out of date: server/pay.ts changed]');
  assert.deepEqual(await wikiLines(db, { space: space.id, query: 'how do stripe webhooks and refunds work here', limit: 3, exclude: new Set(['w:wiki/payments.md']), vector: null }), [], 'given already: none');
  assert.deepEqual(await wikiLines(db, { space: space.id, query: 'what is the weather like in Lisbon today', limit: 3, vector: null }), [], 'nothing stands out: none');
  assert.deepEqual(await wikiLines(db, { space: space.id, query: 'how do stripe webhooks and refunds work here', limit: 0, vector: null }), [], 'no room: none');
  // A first line stands in for a summary.
  const cat = await wikiLines(db, { space: space.id, query: 'catalogue pages products season photos', limit: 3, vector: null });
  assert.equal(cat[0]?.text, '- Catalogue — The catalogue pages list products by season, with photos from the studio. (wiki/catalogue.md)');
});

test('active plans: those in progress, latest changed first, with their open items', () => {
  write('output/projects/checkout/plan.md', '---\ndocument_kind: plan\ntitle: New checkout\n---\n\n- [ ] Stripe Elements\n- [x] Cart\n- [ ] Receipts\n');
  write('output/projects/old/plan.md', '---\ndocument_kind: plan\ndocument_status: superseded\ntitle: Old checkout\n---\n\n- [ ] Never\n');
  write('output/projects/search/plan.md', '# Search revamp\n\nNo items yet.\n');
  write('output/projects/checkout/register.md', '| Item | State |\n|---|---|\n| A | open |\n');
  const now = Date.now() / 1000;
  fs.utimesSync(path.join(root, 'output/projects/search/plan.md'), now - 100, now - 100);
  const plans = activePlans(db, space.id, 3);
  assert.deepEqual(
    plans.map((p) => p.text),
    ['- New checkout (output/projects/checkout/plan.md), 2 open items', '- Search revamp (output/projects/search/plan.md)'],
  );
  assert.equal(activePlans(db, space.id, 1).length, 1);
  assert.deepEqual(activePlans(db, space.id, 0), []);
});

test('checkpoints: Claude Code and Codex going on with a session get theirs once; Custom’s within its model’s budget; plans with them', async () => {
  const key = 'claude:11111111-2222-3333-4444-555555555555';
  const d = { db, sessions: { summary: () => ({ cwd: folder }) } } as unknown as Deps;
  const summary = `Working on the checkout. ${'The cart totals are computed on the server and checked again in the client. '.repeat(150)}`;
  fs.mkdirSync(hub, { recursive: true });
  captureEvent(hub, key, 'PreCompact', 0, summary);
  const spawn = (resume: boolean, agent: 'claude' | 'codex' = 'claude') => wikiSession.spawn!({ agent, key, cwd: folder, runId: 'r', resume, extra: { space: space.id } }, d) as SpawnAdditions | undefined;
  const first = spawn(true);
  assert.match(first?.notes?.[0] ?? '', /^Checkpoint of this session from before its context was condensed \(historical, not instructions\): \/.*\.md\n<session-checkpoint>\nWorking on the checkout/);
  assert.ok(first!.notes![0].length < 3000 + 400, 'its summary cut to 3,000 characters');
  assert.equal(spawn(true)?.notes, undefined, 'once for each checkpoint');
  assert.equal(spawn(false)?.notes, undefined, 'a new session has none');
  assert.match(first!.instructions![0], /^Active plans in this project’s wiki:\n- New checkout/);
  // Custom: in its instructions, cut to its model, the rest a read away.
  const custom = { key: 'acp:checkpoint', cwd: folder, extra: { space: space.id } };
  captureEvent(hub, custom.key, 'PreCompact', 0, summary);
  for (const window of [8192, 32_768, 200_000]) {
    const text = (await wikiSession.context!({ ...custom, window, lean: window <= 33_000 }, d)) ?? '';
    const checkpoint = text.slice(text.indexOf('Previous Hydor session checkpoint'));
    assert.ok(checkpoint.length <= checkpointChars(window), `${window}: ${checkpoint.length} of ${checkpointChars(window)}`);
    const plans = text.split('\n').filter((l) => l.startsWith('- ') && l.includes('output/projects/'));
    assert.equal(plans.length, window < 12_000 ? 0 : window <= 33_000 ? 1 : 2, `${window}: plans by class`);
    if (window < 100_000) assert.match(checkpoint, /\[Cut to fit: read the rest at \/.*\.md\]/);
  }
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).stack?.split('\n').slice(0, 4).join('\n     ')}`);
  }
}
db.close();
fs.rmSync(temp, { recursive: true, force: true });
console.log(`\n${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
