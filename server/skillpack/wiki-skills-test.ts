// Verify that bundled wiki skills are discoverable and their example renders as execution status.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { APP_ROOT } from '../config.ts';
import { progressOf } from '../wiki/overview.ts';
import { librarySkills } from './library.ts';
import { matchTriggers } from './triggers.ts';

const names = ['wiki-memory', 'wiki-planning', 'wiki-contracts'];
const skills = librarySkills().filter((skill) => names.includes(skill.name));
assert.deepEqual(skills.map((skill) => skill.name).sort(), names.slice().sort());
const matched = (text: string) => matchTriggers(text, skills).map((match) => match.name);
assert.ok(matched('Bitte prüfe die Projektverträge im Projektwiki').includes('wiki-contracts'));
assert.ok(matched('Bitte aktualisiere die Umsetzungskontrolle im Projektwiki').includes('wiki-planning'));
assert.ok(matched('Please review lessons learned in wiki memory').includes('wiki-memory'));
assert.deepEqual(matched('Please plan a weekend trip'), []);

// The table shipped in the planning skill is interpreted by the actual project overview.
const guide = fs.readFileSync(path.join(APP_ROOT, 'skills/wiki-planning/SKILL.md'), 'utf8');
const entries = progressOf('output/evidence/example/register.md', guide);
assert.deepEqual(entries.map((entry) => entry.state), ['open', 'open', 'open']);
assert.deepEqual(entries.map((entry) => entry.title), ['Login · Implementation', 'Login · Deployment', 'Login · Acceptance']);
console.log('Wiki skills are discoverable and their example renders explicit status');
