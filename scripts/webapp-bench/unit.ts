// What the unit tests (`*.test.ts`) use, so that they need nothing but Node: node:test for describe and it, and the few checks of an `expect` written on node:assert (the same
// calls as the test libraries have, `expect(value, message).toBe(...)`, so that a test reads the way people expect). Run them with `node --test scripts/webapp-bench/` (README.md).
import assert from 'node:assert/strict';
import { after, describe, it as nodeIt } from 'node:test';

export { describe };
/** Runs after the last test of the file (or of the `describe` it is in). */
export const afterAll = after;

/** A test; the third argument is how long it may take in milliseconds (a test that starts an app needs more than the default). */
export function it(name: string, fn: () => unknown, timeoutMs?: number): void {
  nodeIt(name, timeoutMs ? { timeout: timeoutMs } : {}, fn as () => Promise<void>);
}

function checks(actual: unknown, message: string | undefined, negate: boolean) {
  const holds = (ok: boolean, why: string) => assert.ok(negate ? !ok : ok, `${message ? `${message}\n` : ''}${negate ? 'did not expect' : 'expected'} ${why}`);
  const show = (v: unknown) => (typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v, (_k, x) => (x === undefined ? '[undefined]' : x)) ?? String(v));
  return {
    toBe: (want: unknown) => holds(Object.is(actual, want), `${show(actual)} to be ${show(want)}`),
    toEqual: (want: unknown) => {
      let same = true;
      try {
        assert.deepStrictEqual(actual, want);
      } catch {
        same = false;
      }
      holds(same, `${show(actual)} to equal ${show(want)}`);
    },
    toContain: (part: unknown) => holds(typeof actual === 'string' ? actual.includes(String(part)) : Array.isArray(actual) && actual.includes(part), `${show(actual)} to contain ${show(part)}`),
    toMatch: (pattern: RegExp) => holds(typeof actual === 'string' && pattern.test(actual), `${show(actual)} to match ${pattern}`),
    toHaveLength: (n: number) => holds((actual as { length?: number } | null)?.length === n, `${show(actual)} to have length ${n}`),
    toBeNull: () => holds(actual === null, `${show(actual)} to be null`),
    toBeUndefined: () => holds(actual === undefined, `${show(actual)} to be undefined`),
    toBeCloseTo: (want: number, digits = 2) => holds(typeof actual === 'number' && Math.abs(actual - want) < 10 ** -digits / 2, `${show(actual)} to be close to ${want} (${digits} digits)`),
    toBeGreaterThan: (n: number) => holds(typeof actual === 'number' && actual > n, `${show(actual)} to be greater than ${n}`),
    toBeGreaterThanOrEqual: (n: number) => holds(typeof actual === 'number' && actual >= n, `${show(actual)} to be at least ${n}`),
    toBeLessThanOrEqual: (n: number) => holds(typeof actual === 'number' && actual <= n, `${show(actual)} to be at most ${n}`),
    toHaveProperty: (key: string) => holds(typeof actual === 'object' && actual !== null && key in actual, `${show(actual)} to have the property ${key}`),
    toMatchObject: (part: Record<string, unknown>) =>
      holds(typeof actual === 'object' && actual !== null && Object.entries(part).every(([k, v]) => Object.is((actual as Record<string, unknown>)[k], v)), `${show(actual)} to hold ${show(part)}`),
    toThrow: () => {
      let threw = false;
      try {
        (actual as () => unknown)();
      } catch {
        threw = true;
      }
      holds(threw, 'the call to throw');
    },
  };
}

export function expect(actual: unknown, message?: string) {
  return { ...checks(actual, message, false), not: checks(actual, message, true) };
}
