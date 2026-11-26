// The judge's small parts, without any app: what a page says as a person reads it, numbers found in words, the days a plan writes, the numbers a plan expects, and lines counted
// as new (`node --test scripts/webapp-bench/*.test.ts`). The whole judge is proved by selftest.ts.
import { describe, expect, it } from './unit.ts';
import { expectedNumber, resolveDay, type NumberSpec } from './expect-base.ts';
import { countNumber, fold, hasPhrase, numberTokens, sameName, singular, slug, visibleText } from './lib.ts';
import { addedLines } from './measure.ts';

describe('what a person reads', () => {
  it('drops scripts and tags and writes entities out', () => {
    expect(visibleText('<title>Pip&#x27;s &amp; Co</title><script>var x = "hidden";</script><p>Hello&nbsp;<b>there</b> &pound;18</p>')).toBe("Pip's & Co Hello there £18");
  });
  it('finds a phrase through accents, quotes, dashes and a space after a sign', () => {
    expect(hasPhrase('Mara Lindqvist teaches geography', 'mara LINDQVIST')).toBe(true);
    expect(hasPhrase('Kovač Translations', 'Kovac Translations')).toBe(true);
    expect(hasPhrase('it’s £ 18 a shelf', "it's £18")).toBe(true);
    expect(hasPhrase('every second Thursday', 'every other Thursday')).toBe(false);
    expect(fold('A – B')).toBe('a - b');
  });
  it('matches names with their plural and spelling', () => {
    expect(sameName('Best before', 'bestBefore')).toBe(true);
    expect(sameName('deliveries', 'delivery')).toBe(true);
    expect(sameName('classes', 'class')).toBe(true);
    expect(sameName('stock', 'stocks')).toBe(true);
    expect(sameName('lessons', 'pupils')).toBe(false);
    expect(slug('Baby & household')).toBe('babyhousehold');
    expect(singular('glass')).toBe('glass');
  });
});

describe('numbers in words', () => {
  const values = (text: string) => numberTokens(text).map((t) => [t.value, t.decimals]);
  it('reads money and thousands the way a page writes them', () => {
    expect(values('Owed €1,300.00 and £68.25')).toEqual([[1300, 2], [68.25, 2]]);
    expect(values('4.050 words, 16,3 on average, 2026-11-24')).toEqual([[4050, 0], [16.3, 1], [2026, 0], [11, 0], [24, 0]]);
    expect(values('1 234 567')).toEqual([[1, 0], [234, 0], [567, 0]]);
    expect(values('1,234,567.5')).toEqual([[1234567.5, 1]]);
  });
  it('counts a number as found when it is shown rounded to the digits it shows', () => {
    const tokens = numberTokens('Owed €73 and 16.3 on average and 4');
    expect(countNumber(tokens, 72.5, false)).toBe(1);
    expect(countNumber(tokens, 16.33, false)).toBe(1);
    expect(countNumber(tokens, 16.9, false)).toBe(0);
    expect(countNumber(tokens, 4, false)).toBe(1);
  });
});

describe('days and numbers a plan writes', () => {
  const now = new Date(Date.UTC(2026, 10, 24, 15, 0, 0));
  it('turns a written day into a real one', () => {
    expect(resolveDay('$today', now)).toBe('2026-11-24');
    expect(resolveDay('$today+9', now)).toBe('2026-12-03');
    expect(resolveDay('$thisMonth:12', now)).toBe('2026-11-12');
    expect(resolveDay('$lastMonth:20', now)).toBe('2026-10-20');
    expect(resolveDay('$lastMonth:20', new Date(Date.UTC(2027, 0, 5)))).toBe('2026-12-20');
    expect(resolveDay('plain', now)).toBe('plain');
    expect(() => resolveDay('$someday', now)).toThrow();
  });
  it('works out a count with a condition, a sum this month and an average', () => {
    const kind = { id: 'jobs', names: [], fields: [{ id: 'fee', names: [], kind: 'money' as const, required: true }, { id: 'on', names: [], kind: 'day' as const, required: false }, { id: 'paid', names: [], kind: 'yesno' as const, required: false }] };
    const rows = [{ fee: 10, on: '2026-11-03', paid: true }, { fee: 20.5, on: '2026-10-30' }, { fee: 5, on: '2026-11-20' }];
    const spec = (s: Partial<NumberSpec>): NumberSpec => ({ id: 'n', of: 'jobs', agg: 'count', say: '', ...s });
    expect(expectedNumber(spec({ where: [{ field: 'paid', eq: false }] }), kind, rows, now)).toBe(2);
    expect(expectedNumber(spec({ agg: 'sum', field: 'fee', where: [{ field: 'on', thisMonth: true }] }), kind, rows, now)).toBe(15);
    expect(expectedNumber(spec({ agg: 'avg', field: 'fee' }), kind, rows, now)).toBeCloseTo(11.8333, 3);
    // a yes/no that was never given is no, not empty; a day that was never given is empty
    expect(expectedNumber(spec({ where: [{ field: 'paid', empty: true }] }), kind, rows, now)).toBe(0);
    expect(expectedNumber(spec({ where: [{ field: 'on', empty: true }] }), kind, [...rows, { fee: 1 }], now)).toBe(1);
  });
});

describe('lines the builder wrote', () => {
  it('counts the lines that are in the app and not in what it was before', () => {
    expect(addedLines('a\nb\n\nc\n', 'a\n  b  \nd\ne\n')).toBe(2);
    expect(addedLines('', 'x\ny\n')).toBe(2);
    expect(addedLines('x\nx\n', 'x\nx\nx\n')).toBe(1);
  });
});
