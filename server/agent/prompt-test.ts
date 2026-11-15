import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type Skill, promptParts, scaleParts, skillGroups, skillsFor, systemPrompt } from './prompt.ts';
import { offer } from './toolsearch.ts';
import { TOOLS, type Tool } from './tools.ts';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-prompt-'));
const empty = path.join(scratch, 'empty');
fs.mkdirSync(empty);

// 1. The parts of a request: the instructions first, the app's parts by their tags, the guides by the tools offered.
const options = {
  cwd: empty,
  mode: 'ask' as const,
  skills: [],
  small: false,
  tools: ['read_file', 'show_html'],
  app: {
    parts: [
      { id: 'memory', text: 'MEM' },
      { id: 'skillpack', text: 'RULE' },
      { id: 'formatting', text: 'FMT' },
    ],
    guides: [
      { tools: ['show_html'], text: 'GUIDE-PAGES' },
      { tools: ['generate_image'], text: 'GUIDE-PICTURES' },
    ],
  },
};
const parts = promptParts(options);
const textOf = (part: string) =>
  parts
    .filter((x) => x.part === part)
    .map((x) => x.text)
    .join('\n');
assert.equal(parts[0].part, 'instructions', 'the first part is the instructions');
assert.equal(textOf('memory'), 'MEM', 'the memory part has the memory text');
assert.ok(textOf('skills').includes('RULE'), 'the skillpack text is in the skills part');
assert.ok(textOf('features').includes('FMT'), 'the formatting text is in the features part');
const joined = parts.map((x) => x.text).join('\n\n');
assert.ok(joined.includes('GUIDE-PAGES'), 'the guide to show_html is included when show_html is offered');
assert.ok(!joined.includes('GUIDE-PICTURES'), 'the guide to generate_image is left out when generate_image is not offered');
const prefixed = promptParts({ ...options, tools: ['read_file', 'mcp__hydor__generate_image'] })
  .map((x) => x.text)
  .join('\n\n');
assert.ok(prefixed.includes('GUIDE-PICTURES'), 'a tool named with a server prefix counts as offered');
assert.equal(systemPrompt(options), parts.map((x) => x.text).join('\n\n'), 'systemPrompt is the parts joined by blank lines');

// 2. An older server sends one text: it lands in the features part.
const older = promptParts({ cwd: empty, mode: 'ask', skills: [], small: false, app: { text: 'OLD' } });
assert.ok(
  older.some((x) => x.part === 'features' && x.text === 'OLD'),
  'an older server’s text is in a features part',
);

// 3. The catalog of tools waiting in the search: names only for a small model, a line on each otherwise.
const catalogOf = (small: boolean) => promptParts({ cwd: empty, mode: 'ask', skills: [], small, catalog: 'a, b' }).find((x) => x.text.includes('find_tools'));
const smallCatalog = catalogOf(true);
const bigCatalog = catalogOf(false);
assert.ok(smallCatalog?.text.includes('by name only'), 'a small model’s catalog says the tools are by name only');
assert.ok(bigCatalog?.text.includes('not shown in full'), 'a larger model’s catalog says the tools are not shown in full');
assert.ok(smallCatalog?.text.includes('find_tools') && bigCatalog?.text.includes('find_tools'), 'both catalogs point to find_tools');
assert.equal(smallCatalog?.part, 'tools', 'the catalog is tagged tools');
assert.equal(bigCatalog?.part, 'tools', 'the catalog is tagged tools');

// 4. Skills: grouped by the project first, then the library's groups in their order; the instructions name them only.
const skills: Skill[] = [
  { name: 'pdf', description: 'Use when filling a PDF form.', file: '/x/pdf/SKILL.md', group: 'Documents' },
  { name: 'deploy', description: 'Use when shipping to servers.', file: '/x/deploy/SKILL.md', group: 'This project' },
  { name: 'research', description: 'Use when finding sources.', file: '/x/research/SKILL.md', group: 'Research and the web' },
];
// Order: "This project" and "Your own" first, then SKILL_CATEGORIES in their order (Documents comes before Research and the web).
assert.deepEqual(
  skillGroups(skills).map(([group]) => group),
  ['This project', 'Documents', 'Research and the web'],
  'skill groups: the project first, then the library groups in SKILL_CATEGORIES order',
);
const skillPart = promptParts({ cwd: empty, mode: 'ask', skills, small: false }).find((x) => x.part === 'skills')?.text ?? '';
assert.ok(skillPart.includes('- Documents: pdf'), 'the skills part lists the group and its skill names');
assert.ok(!skillPart.includes('Use when filling'), 'the skills part lists names only, not descriptions');
assert.equal(skillsFor(skills, 'fill a PDF form')[0].name, 'pdf', 'the skill for filling a PDF form is pdf');
assert.deepEqual(skillsFor(skills, 'zzqx'), [], 'a query matching no skill finds none');

// 5. Scaling the estimates of a request to the tokens the server counted.
assert.deepEqual(
  scaleParts({ instructions: 100, tools: 300, conversation: 100 }, 1000, 50),
  { instructions: 200, tools: 600, conversation: 250 },
  'estimates scale to the prompt tokens, and the reply joins the conversation',
);
assert.deepEqual(scaleParts({ instructions: 0, tools: 100 }, 100, 0), { tools: 100 }, 'a part of 0 is left out');
assert.deepEqual(scaleParts({ instructions: 10.4, tools: 20.6 }, 0, 0), { instructions: 10, tools: 21 }, 'with no prompt tokens the estimates are kept, rounded');

// 6. offer(): which tools are shown in full, and the catalog of the rest.
const fake = (name: string, description: string): Tool => ({ name, description, parameters: {}, kind: 'other', title: () => '', run: async () => ({ ok: true, output: '' }) });
const many: Tool[] = Array.from({ length: 30 }, (_, i) => fake(`t${i}`, `Does thing ${i}. More words.`));
const all: Tool[] = [...many, fake('show_html', 'Show a page.'), fake('web_search', 'Search the web.'), fake('read_file', 'Read a file.')];
const builtin = new Set(['read_file', 'find_tools']);
const names = (xs: Tool[]) => xs.map((t) => t.name);

const full = offer(all, { window: 131072, active: [], small: false, builtin });
assert.ok(names(full.visible).includes('show_html'), 'show_html is visible for a larger model');
assert.ok(names(full.visible).includes('web_search'), 'web_search is visible for a larger model');
assert.ok(names(full.deferred).includes('t0'), 't0 is deferred for a larger model');
assert.ok(full.catalog.includes('- t0: Does thing 0.'), 'the catalog gives each deferred tool a line with its summary');

const small = offer(all, { window: 32768, active: [], small: true, builtin });
assert.ok(!names(small.visible).includes('show_html'), 'show_html is deferred for a small model');
assert.ok(names(small.visible).includes('web_search'), 'web_search is visible for a small model');
assert.ok(small.catalog.includes('t0, t1'), 'the small model’s catalog is comma-separated names');
assert.ok(!small.catalog.includes('- t0:'), 'the small model’s catalog has no descriptions');

const active = offer(all, { window: 131072, active: ['t5'], small: false, builtin });
assert.ok(names(active.visible).includes('t5'), 'an active tool is visible');

// 7. The skill tool: loads a skill by name, finds skills by a query, and says when it cannot.
const skillTool = TOOLS.find((t) => t.name === 'skill');
assert.ok(skillTool, 'the skill tool is in TOOLS');
const pdfDir = path.join(scratch, 'pdf');
const researchDir = path.join(scratch, 'research');
fs.mkdirSync(pdfDir);
fs.mkdirSync(researchDir);
fs.writeFileSync(path.join(pdfDir, 'SKILL.md'), '---\nname: pdf\ndescription: Use when filling a PDF form.\n---\n\nPDF SKILL BODY\n');
fs.writeFileSync(path.join(researchDir, 'SKILL.md'), '---\nname: research\ndescription: Use when finding sources.\n---\n\nRESEARCH SKILL BODY\n');
const real: Skill[] = [
  { name: 'pdf', description: 'Use when filling a PDF form.', file: path.join(pdfDir, 'SKILL.md'), group: 'Documents' },
  { name: 'research', description: 'Use when finding sources.', file: path.join(researchDir, 'SKILL.md'), group: 'Research and the web' },
];
const ctx = { skills: real, cwd: scratch, signal: new AbortController().signal, maxOutput: 10000, dir: scratch, session: 'x' } as any;

const loaded = await skillTool!.run({ name: 'pdf' }, ctx);
assert.equal(loaded.ok, true, 'loading a skill by name succeeds');
assert.ok(loaded.output.includes('PDF SKILL BODY'), 'loading a skill gives its SKILL.md text');
assert.equal(skillTool!.title({ name: 'pdf' }), 'Skill pdf', 'the title of a skill load names the skill');

const found = await skillTool!.run({ query: 'PDF form' }, ctx);
assert.equal(found.ok, true, 'finding skills by a query succeeds');
assert.ok(found.output.includes('- pdf: Use when filling a PDF form.'), 'the query lists the skill with its description');
assert.equal(skillTool!.title({ query: 'PDF form' }), 'Find skills: PDF form', 'the title of a query names the query');

const missing = await skillTool!.run({ name: 'nope' }, ctx);
assert.equal(missing.ok, false, 'an unknown skill name fails');
assert.ok(missing.output.includes('No skill named nope'), 'an unknown skill name is said to have no skill');

const none = await skillTool!.run({}, ctx);
assert.equal(none.ok, false, 'asking for a skill with neither a name nor a query fails');

fs.rmSync(scratch, { recursive: true, force: true });
assert.equal(fs.existsSync(scratch), false, 'the scratch folders are removed');
console.log('Prompt, tool search and skill tests passed');
