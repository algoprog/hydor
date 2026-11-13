// OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/session/outline-test.ts && node dist/dev/outline-test.js
import assert from 'node:assert/strict';
import type { TimelineItem } from '@shared/types';
import { noteLike, noteTitle, partsOf, runsOf, type Run } from './outline';

// A note in a few words: what it says it does next, else its sentence that introduces the step.
const titles: [string, string][] = [
  ["I'll take the before pictures with the demo copy first.", 'Take the before pictures with the demo copy first'],
  ["The demo copy has no app runs, so I'll check what the app tools can render. `app_screen` may show an app's view with real run data:", 'Check what the app tools can render'],
  ["`app_screen` is for building an app's screens, not looking at them. Finding the API route that lists app runs, to get the data from your Game finder run:", 'Finding the API route that lists app runs'],
  ["`GET /api/apps` would return all 37 full recipes, too large to read here. To see which apps you've actually run, I'll count runs per app directly in the live database, read-only:", 'Count runs per app directly in the live database, read-only'],
  ['First, the shared instruction for model steps:', 'The shared instruction for model steps'],
  ["Now the video still in the media kit, so each game's card shows its trailer's first frame before it plays:", 'The video still in the media kit'],
  ["Two problems in `total()`: tax is added to each line before the discount, and every line is rounded on its own. I'll apply the discount first and round once, at the end.", 'Apply the discount first and round once, at the end'],
  ['Both checkout tests should pass now. Running the whole suite to make sure nothing else broke.', 'Running the whole suite to make sure nothing else broke'],
  ["I'll look for recent reviews of commuter e-bikes that climb well, then compare the best few.", 'Look for recent reviews of commuter e-bikes that climb well'],
  ['Here is a short list of places that fit:', 'Here is a short list of places that fit'],
  ['Let me look at the logs.', 'Look at the logs'],
  ["**Checking the build** The build failed on the server's types.", 'Checking the build'],
  ['OK, the tests pass.', 'The tests pass'],
  ['Nothing else uses it. Good.', 'Nothing else uses it'],
  ['Θα τρέξω πρώτα τα τεστ.', 'Θα τρέξω πρώτα τα τεστ'],
  ['先运行测试，看看哪里失败。然后修复。', '先运行测试，看看哪里失败'],
  ['', ''],
];
for (const [note, want] of titles) assert.equal(noteTitle(note), want, note);

// Short notes stay in the outline while the agent works; what reads as a reply does not.
assert.equal(noteLike('Now the video still in the media kit:'), true);
assert.equal(noteLike("I'll run the tests first."), true);
assert.equal(noteLike('Done.\n\nThe tests pass now.'), false);
assert.equal(noteLike('Here is what changed:\n- the total\n- the tests'), false);
assert.equal(noteLike('| a | b |\n|---|---|'), false);
assert.equal(noteLike('x'.repeat(400)), false);
assert.equal(noteLike('```ui recipe\n{}\n```'), false);
// A tag in code is words: the note stays one.
assert.equal(noteLike('Now stopping them through `/stop/<search_id>`:'), true);
assert.equal(noteLike('It renders <details> blocks.'), false);

// Parts: a note opens one; notes in a row are one; a thought goes with the note after it; steps before any note are a part.
let n = 0;
const note = (text: string): TimelineItem => ({ kind: 'assistant', id: `a${++n}`, seq: n, text });
const tool = (name = 'Bash'): TimelineItem => ({ kind: 'tool', id: `t${++n}`, seq: n, tool: { name, title: name, category: 'command', status: 'completed' } }) as unknown as TimelineItem;
const thought = (): TimelineItem => ({ kind: 'thinking', id: `h${++n}`, seq: n, text: 'hmm', durationMs: 5000 });
{
  const w = [tool(), tool(), note('one'), tool(), thought(), note('two'), note('two more'), tool(), tool(), thought()];
  const p = partsOf(w);
  assert.deepEqual(
    p.map((x) => [x.notes.map((y) => (y as { text: string }).text), x.items.map((y) => y.kind)]),
    [
      [[], ['tool', 'tool']],
      [['one'], ['tool']],
      [['two', 'two more'], ['thinking', 'tool', 'tool', 'thinking']],
    ],
  );
  // A part keeps its id as it grows: the thought before its note.
  assert.equal(p[2].id, w[4].id);
  assert.equal(p[0].id, w[0].id);
}
{
  // A thought at the very start, then a note: one part, the thought first.
  const w = [thought(), note('start'), tool()];
  const p = partsOf(w);
  assert.equal(p.length, 1);
  assert.equal(p[0].id, w[0].id);
  assert.deepEqual(
    p[0].items.map((y) => y.kind),
    ['thinking', 'tool'],
  );
}
assert.deepEqual(partsOf([]), []);

// Runs: what reads as a reply shows in its place, between the work before and after it; short notes stay in the work.
const shape = (rs: Run[]) => rs.map((r) => (r.kind === 'said' ? `said:${r.item.id}` : `work:${r.items.map((i) => i.id).join(',')}`));
{
  // Your question, its answer (a table), a step to record it, and a closing line after it (that is the reply, not here).
  const answer = note('Settled:\n\n| Model | Size |\n|---|---|\n| crawl | small |\n\nRecording it in the plan:');
  const w = [thought(), answer, tool()];
  const r = runsOf(w);
  assert.deepEqual(shape(r), [`work:${w[0].id}`, `said:${answer.id}`, `work:${w[2].id}`]);
  // A stretch is named by its first item, so it keeps its name as it grows.
  assert.equal(r[2].id, w[2].id);
}
{
  // Short notes between steps stay in the outline, as before.
  const w = [note('Let me check the logs.'), tool(), note('Found it. Fixing the parser:'), tool()];
  assert.deepEqual(shape(runsOf(w)), [`work:${w.map((i) => i.id).join(',')}`]);
}
{
  // A long report mid-turn, then more work, then another report: each in its place.
  const a = note('x'.repeat(400));
  const b = note('Done.\n\nThe tests pass now.');
  const w = [tool(), a, tool(), tool(), b, tool()];
  assert.deepEqual(shape(runsOf(w)), [`work:${w[0].id}`, `said:${a.id}`, `work:${w[2].id},${w[3].id}`, `said:${b.id}`, `work:${w[5].id}`]);
}
{
  // The answer first, before any step (a message you sent while the agent worked, answered before it went on).
  const a = note('Yes. The context filter is its own model:\n- one\n- two');
  const w = [a, tool()];
  assert.deepEqual(shape(runsOf(w)), [`said:${a.id}`, `work:${w[1].id}`]);
}
assert.deepEqual(runsOf([]), []);

console.log('outline: ok');
