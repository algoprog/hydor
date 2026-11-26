// Script tests for how the Jobs page sorts by tags (tags.ts): a tag's colour, the filter (tag, untagged, words), the
// end of what is left, the chips and their order, the groups of the work in hand and the days of what finished. Build
// and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/jobs/tags-test.ts && node dist/dev/tags-test.js
import assert from 'node:assert/strict';
import type { JobEntry, JobsList } from '@shared/jobs';
import { byDay, filterList, filtering, firstTag, groupAtWork, matches, sharedSession, startOfDay, tagChips, tagTone } from './tags';

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = new Date(2026, 4, 14, 15, 0).getTime();
let n = 0;
const job = (more: Partial<JobEntry> = {}): JobEntry => ({ id: `job:j-${++n}`, kind: 'job', state: 'running', name: 'Build the index', ...more });
const queued = (more: Partial<JobEntry> = {}) => job({ state: 'queued', ...more });
const ended = (endedAt: number, more: Partial<JobEntry> = {}) => job({ state: 'done', endedAt, ...more });
const est = (left: number) => ({ endsAt: NOW + left, source: 'agent' as const, confidence: 'low' as const });
const list = (more: Partial<JobsList> = {}): JobsList => ({ running: [], queued: [], servers: [], ended: [], at: NOW, ...more });

// ---- the session a group's work shares
{
  const a = { key: 'claude:a', title: 'Faster product search' };
  const b = { key: 'claude:b', title: 'Apple Pay at checkout' };
  assert.deepEqual(sharedSession({ tag: 'x', running: [job({ session: a })], queued: [queued({ session: a })] }), a, 'all of it from one session');
  assert.equal(sharedSession({ tag: 'x', running: [job({ session: a })], queued: [queued({ session: b })] }), undefined, 'two sessions');
  assert.equal(sharedSession({ tag: 'x', running: [job({ session: a }), job()], queued: [] }), undefined, 'one of it from none');
  assert.equal(sharedSession({ tag: 'x', running: [], queued: [] }), undefined);
}

// ---- colours
{
  assert.equal(tagTone('checkout'), tagTone('checkout'), 'the same each time');
  const tones = new Set(['checkout', 'search-index', 'thesis', 'word-suggest', 'intent-data', 'docs', 'ranker', 'demo', 'a', 'b'].map(tagTone));
  assert.ok(tones.size > 3, 'different names spread over the colours');
  for (const t of tones) assert.match(t, /^var\(--viz-[1-8]\)$/);
  assert.match(tagTone(''), /^var\(--viz-[1-8]\)$/);
}

// ---- the filter
{
  assert.equal(firstTag(job()), null);
  assert.equal(firstTag(job({ tags: [] })), null);
  assert.equal(firstTag(job({ tags: ['a', 'b'] })), 'a');

  const j = job({ name: 'Download the Passages', command: 'python fetch.py --set msmarco', tags: ['search-index', 'data'], session: { key: 'k', title: 'Faster product search', project: { id: 'p', name: 'Shop website' } } });
  assert.ok(matches(j, {}));
  assert.ok(matches(j, { tag: 'search-index' }));
  assert.ok(!matches(j, { tag: 'data' }), 'filtered under its first tag only');
  assert.ok(!matches(j, { untagged: true }));
  assert.ok(matches(job(), { untagged: true }));
  assert.ok(!matches(job(), { tag: 'data' }));
  for (const q of ['passages', 'MSMARCO', 'product search', 'shop web', 'data', ' index ']) assert.ok(matches(j, { query: q }), q);
  assert.ok(!matches(j, { query: 'reranker' }));
  assert.ok(!matches(j, { tag: 'search-index', query: 'reranker' }), 'both must hold');
  assert.ok(matches(j, { query: '   ' }));
  assert.ok(!filtering({}));
  assert.ok(!filtering({ query: '  ' }));
  assert.ok(filtering({ untagged: true }) && filtering({ tag: 'a' }) && filtering({ query: 'a' }));
}

// ---- the list filtered, and the end of what is left
{
  const all = list({
    running: [job({ tags: ['a'], estimate: est(HOUR) }), job({ tags: ['b'] }), job({ tags: ['a'], kind: 'subagent' })],
    queued: [queued({ tags: ['a'], estimate: est(2 * HOUR) })],
    servers: [job({ tags: ['b'], kind: 'server' })],
    ended: [ended(NOW - MIN, { tags: ['a'] }), ended(NOW - MIN)],
    tags: [{ name: 'a', uses: 1, lastAt: NOW }],
  });
  const a = filterList(all, { tag: 'a' });
  assert.deepEqual([a.running.length, a.queued.length, a.servers.length, a.ended.length], [2, 1, 0, 1]);
  assert.equal(a.allDoneAt, NOW + 2 * HOUR, 'the subagent has no estimate and does not count');
  assert.equal(a.tags, all.tags);
  assert.equal(filterList(all, {}).allDoneAt, undefined, 'one running job has no estimate');
  assert.equal(filterList(all, { tag: 'b' }).allDoneAt, undefined);
  assert.equal(filterList(all, { tag: 'b' }).servers.length, 1);
  assert.equal(filterList(all, { untagged: true }).ended.length, 1);
  assert.equal(filterList(all, { untagged: true }).allDoneAt, undefined, 'nothing at work');
  assert.equal(filterList(list({ running: [job({ estimate: est(-MIN) }), job({ estimate: est(HOUR) })] }), {}).allDoneAt, undefined, 'one past its estimate');
  assert.equal(filterList(list({ running: [job({ kind: 'hydor-subagent' })] }), {}).allDoneAt, undefined, 'only subagents');
  // An older server's list has no servers.
  assert.deepEqual(filterList({ ...list(), servers: undefined as never }, {}).servers, []);
}

// ---- the chips
{
  const c = tagChips(
    list({
      running: [job({ tags: ['one'] }), job({ tags: ['two'] }), job({ tags: ['two', 'one'] }), job()],
      queued: [queued({ tags: ['one'] }), queued({ tags: ['one'] }), queued({ tags: ['beta'] }), queued({ tags: ['alpha'] })],
      servers: [job({ tags: ['server-only'], kind: 'server' })],
      ended: [ended(NOW - MIN, { tags: ['new'] }), ended(NOW - HOUR, { tags: ['old'] }), ended(NOW - 2 * HOUR, { tags: ['new'] }), ended(NOW - HOUR, { tags: ['two'] }), ended(NOW)],
    }),
  );
  assert.deepEqual(
    c.tags.map((t) => t.name),
    ['one', 'two', 'alpha', 'beta', 'new', 'old', 'server-only'],
    'most at work first (a tie by the newest end, then by name), then by the last end',
  );
  assert.deepEqual(c.tags[0], { name: 'one', atWork: 3, total: 3, lastAt: 0 });
  assert.deepEqual(c.tags[1], { name: 'two', atWork: 2, total: 3, lastAt: NOW - HOUR }, 'a second tag adds no chip of its own to its job');
  assert.deepEqual(c.tags[4], { name: 'new', atWork: 0, total: 2, lastAt: NOW - MIN });
  assert.deepEqual(c.untagged, { atWork: 1, total: 2 });
  assert.deepEqual(tagChips(list()), { tags: [], untagged: { atWork: 0, total: 0 } });
}

// ---- the groups of the work in hand
{
  const first = job({ tags: ['big'], estimate: est(HOUR) });
  const second = job({ tags: ['big'], estimate: est(30 * MIN) });
  const waiting = queued({ tags: ['big'], estimate: est(2 * HOUR) });
  const g = groupAtWork(
    [job(), job(), job(), first, second, job({ tags: ['small'] }), job({ tags: ['bee'] }), job({ tags: ['ant'] }), job({ tags: ['ant'], kind: 'subagent' })],
    [waiting, queued({ tags: ['bee'] }), queued({ tags: ['later'] })],
    NOW,
  );
  assert.deepEqual(
    g.map((x) => x.tag),
    ['big', 'ant', 'bee', 'small', 'later', null],
    'most running, then most queued, then name; no tag last however many it has',
  );
  assert.deepEqual([g[0].running, g[0].queued], [[first, second], [waiting]], 'in the order given');
  assert.equal(g[0].doneAt, NOW + 2 * HOUR);
  assert.equal(g[1].doneAt, undefined, 'a job without an estimate');
  assert.equal(g[5].doneAt, undefined);
  assert.deepEqual(groupAtWork([job({ tags: ['a'], estimate: est(HOUR) }), job({ tags: ['a'], kind: 'subagent' })], [], NOW)[0].doneAt, NOW + HOUR);
  assert.deepEqual(
    groupAtWork([], [queued({ tags: ['b'] }), queued({ tags: ['a'] })], NOW).map((x) => x.tag),
    ['a', 'b'],
    'a tie goes by name',
  );
  assert.deepEqual(groupAtWork([], [], NOW), []);
}

// ---- the days of what finished
{
  const at = (day: number, hour: number) => new Date(2026, 4, day, hour).getTime();
  const days = byDay([ended(at(14, 14)), ended(at(14, 0)), ended(at(13, 23)), ended(at(12, 9)), ended(at(12, 8))], NOW);
  assert.deepEqual(
    days.map((d) => [d.label, d.jobs.length, new Date(d.day).getDate()]),
    [
      ['today', 2, 14],
      ['yesterday', 1, 13],
      ['date', 2, 12],
    ],
  );
  assert.equal(days[0].day, startOfDay(NOW));
  assert.equal(new Date(days[0].day).getHours(), 0);
  // The night the clocks go forward (where they do): yesterday is still the day before.
  assert.equal(byDay([ended(new Date(2026, 2, 8, 12).getTime())], new Date(2026, 2, 9, 0, 30).getTime())[0].label, 'yesterday');
  // A clock a little behind the server's: an end just over midnight counts as today.
  assert.equal(byDay([ended(at(15, 0))], NOW)[0].label, 'today');
  assert.equal(byDay([job({ state: 'cancelled', queuedAt: at(13, 10) })], NOW)[0].label, 'yesterday', 'no end: when it was queued');
  assert.deepEqual(byDay([], NOW), []);
}

console.log('ok');
