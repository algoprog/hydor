// Script tests for the document editor's AI that writes with you (doc-ai.ts), the helper model a stand-in: Write with
// AI's prompt and its answer made clean, proofreading's and every paragraph's answers read back by paragraph (one
// that lost a thing of its own, ⟦1⟧, left out), the next words of a sentence, and a question answered with the
// paragraphs it rests on. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/write/doc-ai-test.ts
//   DATA_DIR=/tmp/hydor-test-doc-ai node dist/dev/doc-ai-test.js
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import { askDocPrompt, citedParagraphs, cleanAnswer, cleanCompletion, composePrompt, docAiRoutes, readNumbered, setDocAiForTests } from './doc-ai.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string, extra?: unknown) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}${extra !== undefined ? ` :: ${JSON.stringify(extra).slice(0, 500)}` : ''}`);
  }
};

const items = [
  { id: 'a', text: 'Ther are two ways.' },
  { id: 'b', text: 'As ⟦1⟧ shows, it work.' },
  { id: 'c', text: 'Fine as it is.' },
];

ok(cleanAnswer('Here is a paragraph:\n\n```markdown\n## Hi\n\nWords.\n```') === '## Hi\n\nWords.', 'an answer without its fence and its line before');
const p = composePrompt({ kind: 'continue', before: 'We met at noon.', title: 'Notes' });
ok(p.includes('“Notes”') && p.includes('We met at noon.') && /Continue writing/.test(p), "continue writing's prompt", p);
ok(composePrompt({ kind: 'table', ask: 'planets and their moons' }).includes('Make a table (Markdown, with a header row) of: planets and their moons'), 'a table of…');
ok(composePrompt({ kind: 'explain', words: 'stochastic gradient descent' }).includes('The words picked:\n<<<\nstochastic gradient descent'), 'words picked, to explain');

const fixed = readNumbered('[1] There are two ways.\nWhy: Spelling: “Ther”\n[2] As ⟦1⟧ shows, it works.\nWhy: Grammar\n[3] Fine.\n[9] Nothing', items);
ok(fixed.length === 3 && fixed[0].text === 'There are two ways.' && fixed[0].why === 'Spelling: “Ther”' && fixed[1].why === 'Grammar', 'paragraphs read back by their numbers, each with why', fixed);
ok(readNumbered('[2] As shows, it works.', items).length === 0, 'one that lost its mark is left out');
ok(readNumbered('[1] Line one ↵ line two', items)[0].text === 'Line one\nline two', 'a line break comes back');

ok(cleanCompletion(' and then we left. And more', 'We waited') === ' and then we left.', 'a suggestion ends with its sentence');
ok(cleanCompletion('We waited for hours', 'We waited') === ' for hours', 'what the text says already is not said again');
ok(cleanCompletion(' for hours', 'We waited ') === 'for hours', 'no second space');

const paras = [
  { id: 'x1', text: 'The budget is 10k.' },
  { id: 'x2', text: 'It ends in May.' },
  { id: 'x3', text: 'Ask Maria.' },
];
ok(askDocPrompt({ question: 'When?', paragraphs: paras, history: [] }).includes('[P2] It ends in May.'), 'paragraphs numbered for a question');
ok(JSON.stringify(citedParagraphs('It ends in May [P2]. Costs [P1, P3] and [P1–P2].', paras)) === JSON.stringify(['x2', 'x1', 'x3']), 'the paragraphs an answer cites', citedParagraphs('It ends in May [P2]. Costs [P1, P3] and [P1–P2].', paras));

// The routes, with the stand-in.
const db = openDb(path.join(process.env.DATA_DIR, 'test.db'));
const app = Fastify();
docAiRoutes(app, db);
await app.ready();
let asked = '';
setDocAiForTests(async (q) => {
  asked = q.prompt;
  if (/proofread/i.test(q.system)) return '[1] There are two ways.\nWhy: Spelling';
  if (/Smart Compose/.test(q.system)) return 'We waited for hours.';
  if (/questions about a document/.test(q.system)) return 'It ends in May [P2].';
  if (/Translate/.test(q.system)) return '[1] Hay dos maneras.\n[2] Como ⟦1⟧ muestra, funciona.\n[3] Bien.';
  return 'Sure, here it is:\n\n## Conclusion\n\nAll good.';
});
const post = async (url: string, payload: unknown) => {
  const r = await app.inject({ method: 'POST', url, payload: payload as object });
  return { status: r.statusCode, body: r.json() as Record<string, any> };
};
const c = await post('/api/write/compose', { kind: 'conclusion', before: 'Words.', title: 'T' });
ok(c.status === 200 && c.body.markdown === '## Conclusion\n\nAll good.' && c.body.model === 'the test helper', 'compose', c.body);
ok((await post('/api/write/compose', { kind: 'write' })).status === 400, 'write needs what to write');
const pr = await post('/api/write/proofread', { items });
ok(pr.status === 200 && pr.body.items.length === 1 && pr.body.items[0].id === 'a', 'proofread', pr.body);
const tr = await post('/api/write/paragraphs', { how: 'translate', lang: 'Spanish', items });
ok(tr.status === 200 && tr.body.items.length === 3 && tr.body.items[1].text.includes('⟦1⟧'), 'translate', tr.body);
ok((await post('/api/write/paragraphs', { how: 'tone', items })).status === 400, 'a tone is needed');
const co = await post('/api/write/complete', { before: 'We waited' });
ok(co.body.text === ' for hours.', 'complete', co.body);
const q = await post('/api/write/ask-doc', { question: 'When does it end?', paragraphs: paras });
ok(q.status === 200 && q.body.answer === 'It ends in May [P2].' && q.body.cites[0] === 'x2' && asked.includes('The question: When does it end?'), 'ask about the document', q.body);
await app.close();

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
