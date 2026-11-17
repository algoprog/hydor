// A status overview must not invent successful or failed work.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { browseWiki } from './browse.ts';
import { progressOf, wikiOverview } from './overview.ts';

assert.equal(progressOf('output/evidence/a/x.md', '- [x] Implemented')[0].state, 'done');
assert.equal(progressOf('output/evidence/a/x.md', '- [ ] Acceptance')[0].state, 'open');
assert.equal(progressOf('output/evidence/a/x.md', '- Delivery: blocked')[0].state, 'blocked');
assert.equal(progressOf('output/evidence/a/x.md', '# Evidence\nUnclear state')[0].state, 'unknown');
// Markdown examples are not evidence.
assert.equal(progressOf('output/evidence/a/x.md', '```md\n- [x] Example only\n```')[0].state, 'unknown');
const table = progressOf('output/projects/a/nachweise.md', '| ID | Implementierung | Auslieferung | Abnahme |\n|---|---|---|---|\n| WI-1 | abgeschlossen | Dev ausgeliefert | offen |');
assert.deepEqual(table.map((v) => v.state), ['done', 'unknown', 'open']);
assert.match(table[1].title, /Auslieferung/);
const singleStatus = progressOf('output/projects/a/nachweise.md', '| Aufgabe | Stand | Nachweis |\n|---|---|---|\n| WI-1 | Abgeschlossen | Beleg |\n| WI-2 | Offen | Ausstehend |');
assert.deepEqual(singleStatus.map((v) => v.state), ['done', 'open']);
// The table keeps task and description from the source and never fabricates missing details.
const described = progressOf('output/projects/a/nachweise.md', '| ID | Aufgabe | Beschreibung | Status |\n|---|---|---|---|\n| WI-1 | Login | Anmeldung auf Mobilgeräten prüfen | blockiert |\n| WI-2 | Freigabe |  | offen |');
assert.equal(described[0].title, 'Login');
assert.equal(described[0].description, 'Anmeldung auf Mobilgeräten prüfen');
assert.equal(described[0].state, 'blocked');
assert.equal(described[1].description, undefined);


// Existing registers under wiki/ are displayed directly, while unrelated checklists stay out.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-overview-'));
try {
  fs.mkdirSync(path.join(root, 'wiki'), { recursive: true });
  fs.writeFileSync(path.join(root, 'wiki', 'nachweise.md'), '# Evidence\n- [x] Implemented\n- [ ] Accepted\n');
  fs.writeFileSync(path.join(root, 'wiki', 'notes.md'), '# Notes\n- [x] Ordinary checklist\n');
  fs.mkdirSync(path.join(root, 'wiki', 'references'));
  fs.writeFileSync(path.join(root, 'wiki', 'references', 'projektbeschreibung-und-vertraege.md'), '# Existing contracts\n');
  fs.writeFileSync(path.join(root, 'wiki', 'references', 'projektverträge.md'), '# Existing contracts\n');
  fs.writeFileSync(path.join(root, 'wiki', 'references', 'planungsvorlage.md'), '# Plan template\n');
  const listing = browseWiki(root);
  const overview = wikiOverview(root, listing.articles, listing.plans);
  assert.deepEqual(overview.progress.map((v) => [v.path, v.state]), [['wiki/nachweise.md', 'done'], ['wiki/nachweise.md', 'open']]);
  // Existing contract-like documents are discoverable without implying prior approval.
  assert.deepEqual(overview.contractCandidates.map((v) => v.path).sort(), ['wiki/references/projektbeschreibung-und-vertraege.md', 'wiki/references/projektverträge.md'].sort());
  assert.equal(overview.contracts.length, 0);
  assert.deepEqual(overview.templates.map((v) => v.path), ['wiki/references/planungsvorlage.md']);
  // Descriptions may come directly from the matching plan without copying task status.
  const initiative = path.join(root, 'output/projects/backfill');
  fs.mkdirSync(initiative, { recursive: true });
  fs.writeFileSync(path.join(initiative, 'plan.md'), '# Plan\n```md\n- BF-01: Beispiel, kein Planinhalt.\n```\n- BF-01: Quellen und Freigaben prüfen.\n- BF-02: Erste Beschreibung.\n- BF-02: Abweichende Beschreibung.\n');
  fs.writeFileSync(path.join(initiative, 'nachweise.md'), '| Aufgabe | Stand | Nachweis |\n|---|---|---|\n| BF-01 | Abgeschlossen | Belegt |\n| BF-02 | Offen | Ausstehend |');
  const listed = browseWiki(root);
  const joined = wikiOverview(root, listed.articles, listed.plans).progress;
  const one = joined.find((entry) => entry.workItemId === 'BF-01');
  const duplicate = joined.find((entry) => entry.workItemId === 'BF-02');
  assert.deepEqual([one?.description, one?.descriptionPath, one?.state], ['Quellen und Freigaben prüfen.', 'output/projects/backfill/plan.md', 'done']);
  assert.equal(duplicate?.description, undefined);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('Wiki progress displays explicit states only');
