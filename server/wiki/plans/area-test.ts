// The plans area (output/projects/) belongs to the plan tools: wiki_write cannot create or change anything there,
// whatever the file is called or whether it has a header; execution evidence has its own folder (output/evidence/).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../db.ts';
import type { RunCtx } from '../../features/types.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { applyWikiChanges, readWiki } from '../core.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { wikiTools } from '../tools.ts';
import { claimsToBePlan, inEvidenceArea, inPlansArea } from './area.ts';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-plan-area-')));
const db = openDb(path.join(temp, 'app.db'));
try {
  const hub = path.join(temp, 'hub');
  fs.mkdirSync(path.join(hub, 'wiki'), { recursive: true });
  fs.mkdirSync(path.join(hub, 'raw'), { recursive: true });
  setWikiSettings(db, { hubPath: hub });
  const ctx = { key: 'test:area', runId: 'r', agent: 'codex', cwd: temp, deps: { db } } as unknown as RunCtx;
  const write = (p: string, content: string, expectedSha256: string | null = null) => wikiTools().find((t) => t.name === 'wiki_write')!.run({ path: p, content, expectedSha256 }, ctx);
  const header = '---\ndocument_kind: plan\n---\n# A plan\nWP-01: do it.\n';

  // ---- the path rule, however a path is written
  for (const p of ['output/projects/x/plan.md', 'output/projects/x/roadmap.md', 'output/projects/plan-v2.md', 'output/projects/x/plans.md', 'Output/Projects/x/notes.md', 'output\\projects\\x\\notes.md', './output/projects/x/notes.md', 'output//projects/x/notes.md', 'output/evidence/../projects/x/notes.md', 'output/other/x.md', 'output/notes.md', 'output']) assert.equal(inPlansArea(p), true, `${p} is in the plans area`);
  for (const p of ['output/evidence/x/done.md', 'wiki/a.md', 'index.md', 'raw/x.md', 'outputs/x.md']) assert.equal(inPlansArea(p), false, `${p} is not`);
  assert.equal(inEvidenceArea('output/evidence/x/done.md'), true);
  assert.equal(inEvidenceArea('output/evidence/x/../../projects/x.md'), false);
  assert.equal(inEvidenceArea('output/projects/x/evidence.md'), false);
  assert.equal(claimsToBePlan(header), true);
  assert.equal(claimsToBePlan('---\n"document_kind": \'plan\' # x\n---\nbody'), true);
  assert.equal(claimsToBePlan('# Plain\n'), false);

  // ---- wiki_write: nothing is created or changed in the plans area (no card, no snapshot, no revision)
  const refused = /plan tools|wiki_plan_adopt|cannot write there|Plans \(/;
  for (const p of ['output/projects/x/roadmap.md', 'output/projects/x/plan-v2.md', 'output/projects/x/plans.md', 'output/projects/x/notes.md', 'output/projects/x/y/z.md', 'Output/Projects/x/roadmap.md', 'output\\projects\\x\\roadmap.md', 'output/projects/x/../x/roadmap.md', 'output/evidence/../projects/x/roadmap.md', 'output/other/x/y.md']) {
    await assert.rejects(write(p, '# No frontmatter at all\n'), refused, `${p} with no header`);
    await assert.rejects(write(p, header), refused, `${p} with a plan header`);
  }
  assert.equal(fs.existsSync(path.join(hub, 'output', 'projects')), false, 'nothing was made');
  // An existing file there cannot be changed either (any name, with its hash).
  fs.mkdirSync(path.join(hub, 'output', 'projects', 'x'), { recursive: true });
  const old = '# Old roadmap\n';
  fs.writeFileSync(path.join(hub, 'output', 'projects', 'x', 'roadmap.md'), old);
  const sha = readWiki(hub, 'output/projects/x/roadmap.md').sha256;
  await assert.rejects(write('output/projects/x/roadmap.md', '# Changed\n', sha), refused);
  assert.equal(fs.readFileSync(path.join(hub, 'output', 'projects', 'x', 'roadmap.md'), 'utf8'), old);
  assert.equal(fs.existsSync(path.join(hub, 'output', 'projects', '.archive')), false, 'no snapshot either');
  // The store itself says no to a generic change, even if a tool forgot the rule.
  assert.throws(() => applyWikiChanges(hub, [{ path: 'output/projects/x/roadmap.md', content: '# Changed\n', expectedSha256: sha }]), /plan tools/);
  assert.equal(fs.readFileSync(path.join(hub, 'output', 'projects', 'x', 'roadmap.md'), 'utf8'), old);
  applyWikiChanges(hub, [{ path: 'output/projects/x/roadmap.md', content: '# By the plan workflow\n', expectedSha256: sha }], { plans: true });

  // ---- evidence has its own folder, and is never a plan
  await write('output/evidence/x/done.md', '# Done\nWP-01: implemented; acceptance pending.\n');
  assert.equal(fs.readFileSync(path.join(hub, 'output', 'evidence', 'x', 'done.md'), 'utf8'), '# Done\nWP-01: implemented; acceptance pending.\n');
  const have = readWiki(hub, 'output/evidence/x/done.md');
  await write('output/evidence/x/done.md', '# Done\nWP-01: accepted.\n', have.sha256);
  await assert.rejects(write('output/evidence/x/plan.md', header), /not written in output\/evidence/, 'a plan header in evidence is refused');

  // Explicitly identified registers remain protected even in ordinary wiki directories.
  const marked = '---\ndocument_kind: execution-register\n---\n# Progress\n- task: open\n';
  fs.writeFileSync(path.join(hub, 'wiki', 'dashboard.md'), marked);
  const markedHash = readWiki(hub, 'wiki/dashboard.md').sha256;
  setSessionExtra(db, ctx.key, { wikiFeatures: { execution: false } });
  await assert.rejects(write('wiki/dashboard.md', '# Removed marker\n', markedHash), /Execution control is off/);
  await assert.rejects(write('wiki/nachweise.md', '# Notes\n'), /Execution control is off/);
  await assert.rejects(write('wiki/custom.md', '---\ndocument_kind: evidence\n---\n# Progress\n'), /Execution control is off/);
  await assert.rejects(write('wiki/new-dashboard.md', '# Page\n\n## Umsetzungskontrolle\n\n- Open\n'), /Execution control is off/);
  assert.equal(fs.readFileSync(path.join(hub, 'wiki', 'dashboard.md'), 'utf8'), marked);
  await write('wiki/ordinary.md', '# An ordinary wiki article\n');
  setSessionExtra(db, ctx.key, { wikiFeatures: { execution: true } });
  await write('wiki/dashboard.md', marked.replace('open', 'done'), markedHash);
  assert.match(readWiki(hub, 'wiki/dashboard.md').content, /done/);
  console.log('Plans area tests passed');
} finally {
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
