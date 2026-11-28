// Script tests for when an account's usage comes back (limits.ts): backAt, the last of its used-up limits to reset, and
// firstBack, the account among several whose usage comes back first, for the limit notice when every account is at its
// limit. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/usage/limits-test.ts && node dist/dev/limits-test.js
import assert from 'node:assert/strict';
import type { AgentUsage, UsageWindow } from '@shared/types';
import { backAt, firstBack } from './limits';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;

/** A reading of an account taken at NOW: its limit (when one holds) and its windows. */
const usage = (limited: AgentUsage['limited'] = null, windows: UsageWindow[] = [], ok = true): AgentUsage => ({ agent: 'claude', ok, fetchedAt: NOW, windows, limited });
const full = (resetsAt: number | null, usedPercent = 100): UsageWindow => ({ id: `w${resetsAt}`, label: 'Weekly', usedPercent, resetsAt });
const limit = (resetsAt: number | null) => ({ label: 'Session', resetsAt });

const backTests: [string, () => void][] = [
  [
    'backAt is null for no reading, or one that is not ok',
    () => {
      assert.equal(backAt(null), null);
      assert.equal(backAt(undefined), null);
      assert.equal(backAt(usage(limit(NOW + HOUR), [], false)), null, 'a failed reading says nothing');
    },
  ],
  [
    'backAt is the limit reset when only the limit holds',
    () => {
      assert.equal(backAt(usage(limit(NOW + 3 * HOUR))), NOW + 3 * HOUR);
    },
  ],
  [
    'backAt is the later reset when a full window outlasts the limit',
    () => {
      assert.equal(backAt(usage(limit(NOW + HOUR), [full(NOW + 2 * DAY)])), NOW + 2 * DAY, 'the window resets last');
      assert.equal(backAt(usage(limit(NOW + 2 * DAY), [full(NOW + HOUR)])), NOW + 2 * DAY, 'and the limit when it resets last');
    },
  ],
  [
    'backAt is null when a time that holds the account back is unknown',
    () => {
      assert.equal(backAt(usage(limit(null))), null, 'a limit with no reset time');
      assert.equal(backAt(usage(limit(NOW + HOUR), [full(null)])), null, 'a full window with no reset time');
    },
  ],
  [
    'backAt is null with no limit and no full window (a window at 80% is not full)',
    () => {
      assert.equal(backAt(usage(null)), null);
      assert.equal(backAt(usage(null, [full(NOW + HOUR, 80)])), null);
    },
  ],
];

const firstTests: [string, () => void][] = [
  [
    'firstBack gives the account whose usage comes back first, and when',
    () => {
      const pool = [
        { name: 'Main', u: usage(limit(NOW + 5 * DAY)) },
        { name: 'Work', u: usage(limit(NOW + 3 * HOUR)) },
        { name: 'Work 3', u: usage(limit(null)) },
      ];
      assert.deepEqual(firstBack(pool, NOW), { name: 'Work', at: NOW + 3 * HOUR });
    },
  ],
  [
    'firstBack skips an account whose time is not after now',
    () => {
      const pool = [
        { name: 'Old', u: usage(limit(NOW - HOUR)) },
        { name: 'Work', u: usage(limit(NOW + 4 * HOUR)) },
      ];
      assert.deepEqual(firstBack(pool, NOW), { name: 'Work', at: NOW + 4 * HOUR });
      assert.equal(firstBack([pool[0]], NOW), null, 'the only one is in the past');
    },
  ],
  [
    'firstBack is null when no account says when its usage comes back',
    () => {
      assert.equal(firstBack([{ name: 'Main', u: usage(limit(null)) }, { name: 'Work', u: null }], NOW), null);
      assert.equal(firstBack([], NOW), null);
    },
  ],
];

let passed = 0;
for (const [name, fn] of [...backTests, ...firstTests]) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${backTests.length + firstTests.length} passed`);
