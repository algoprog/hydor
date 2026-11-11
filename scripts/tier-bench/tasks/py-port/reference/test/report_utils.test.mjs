import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checksum, format_money, iso_week_dates, parse_quantity, round_to, split_amount, summarize, title_name, to_json, top_n, wrap_text,
} from '../src/report_utils.mjs';

// The expected values below are what the Python version gives (legacy/report_utils.py).

test('split_amount floors like Python and handles refunds, no parts and negative parts', () => {
  assert.deepEqual(split_amount(1000, 3), [334, 333, 333]);
  assert.deepEqual(split_amount(-7, 2), [-3, -4]);
  assert.deepEqual(split_amount(-1, 3), [0, 0, -1]);
  assert.deepEqual(split_amount(0, 2), [0, 0]);
  assert.deepEqual(split_amount(5, -1), []);
  assert.throws(() => split_amount(5, 0));
});

test('round_to rounds the exact binary value, half to even', () => {
  assert.equal(round_to(3.14159), 3.14);
  assert.equal(round_to(2.5, 0), 2);
  assert.equal(round_to(3.5, 0), 4);
  assert.equal(round_to(0.125, 2), 0.12);
  assert.equal(round_to(0.375, 2), 0.38);
  assert.equal(round_to(2.675, 2), 2.67);
  assert.equal(round_to(1.005, 2), 1);
  assert.equal(round_to(1250, -2), 1200);
  assert.equal(round_to(1350, -2), 1400);
  assert.equal(round_to(7), 7);
});

test('format_money', () => {
  assert.equal(format_money(123456), '$1,234.56');
  assert.equal(format_money(-5, 'EUR'), '-€0.05');
  assert.equal(format_money(1234567, 'JPY'), '¥1,234,567');
  assert.equal(format_money(250000, 'CHF'), '2,500.00 CHF');
  assert.equal(format_money(0), '$0.00');
});

test('title_name follows str.title(): digits and apostrophes end a word, other white space is not a separator', () => {
  assert.equal(title_name('  grace   hopper '), 'Grace Hopper');
  assert.equal(title_name("o'neil d'artagnan's"), "O'Neil D'Artagnan'S");
  assert.equal(title_name('3rd avenue apt 4b'), '3Rd Avenue Apt 4B');
  assert.equal(title_name('mcDONALD anne-marie'), 'Mcdonald Anne-Marie');
  assert.equal(title_name('élodie ÇELIK straße'), 'Élodie Çelik Straße');
  assert.equal(title_name('ß'), 'Ss');
  assert.equal(title_name('﻿john smith'), '﻿John Smith');
  assert.equal(title_name('ada lovelace　x'), 'Ada Lovelace X');
});

test('wrap_text breaks like textwrap.wrap', () => {
  assert.deepEqual(wrap_text('the quick brown fox jumps over the lazy dog', 20), ['the quick brown fox', 'jumps over the lazy', 'dog']);
  assert.deepEqual(wrap_text('a well-known state-of-the-art e-mail', 12), ['a well-known', 'state-of-', 'the-art', 'e-mail']);
  assert.deepEqual(wrap_text('supercalifragilistic word', 8), ['supercal', 'ifragili', 'stic', 'word']);
  assert.deepEqual(wrap_text('a\tb', 20), ['a       b']);
  assert.deepEqual(wrap_text('  ', 5), []);
  assert.throws(() => wrap_text('x', 0));
});

test('parse_quantity accepts what int() accepts and nothing else', () => {
  assert.equal(parse_quantity(' 42 '), 42);
  assert.equal(parse_quantity('+7'), 7);
  assert.equal(parse_quantity('1_000'), 1000);
  assert.equal(parse_quantity('٤٢'), 42);
  assert.equal(parse_quantity('１２'), 12);
  assert.equal(parse_quantity('-0'), 0);
  for (const bad of ['', '1.0', '1e3', '0x10', '1__0', '_1', '1_', '--1', '+ 1', '12a', '½', '²']) assert.throws(() => parse_quantity(bad), undefined, bad);
});

test('checksum uses big integers and code points', () => {
  assert.equal(checksum(''), '0000000000000000');
  assert.equal(checksum('abc'), '00005838bb130ef2');
  assert.equal(checksum('a😀b'), checksum('a\u{1f600}b'));
  assert.notEqual(checksum('😀'), checksum('😀'.slice(0, 1) + 'x'));
  assert.equal(checksum('x'.repeat(50)).length, 16);
});

test('top_n sorts like Python: stable on ties, code point order, negative n slices', () => {
  const rows = [{ id: 1, v: 3 }, { id: 2, v: 5 }, { id: 3, v: 3 }, { id: 4, v: 5 }];
  assert.deepEqual(top_n(rows, 'v', 3).map((r) => r.id), [2, 4, 1]);
  assert.deepEqual(top_n(rows, 'v', -1).map((r) => r.id), [2, 4, 1]);
  assert.deepEqual(top_n(rows, 'v', 0), []);
  assert.deepEqual(top_n(rows, 'v', 10).length, 4);
  assert.deepEqual(top_n([{ v: '\u{1f600}' }, { v: 'Ａ' }], 'v', 2).map((r) => r.v), ['\u{1f600}', 'Ａ']);
  assert.throws(() => top_n([{ v: 1 }, { w: 2 }], 'v', 2));
  assert.throws(() => top_n([{ v: 1 }, { v: 'a' }], 'v', 2));
  assert.deepEqual(top_n([{ v: 'only' }], 'v', 1), [{ v: 'only' }]);
});

test('summarize sums exactly and prints floats like repr()', () => {
  assert.equal(summarize([1, 2, 4]), 'n=3 mean=2.3333333333333335 min=1.0 max=4.0');
  assert.equal(summarize(Array(10).fill(0.1)), 'n=10 mean=0.1 min=0.1 max=0.1');
  assert.equal(summarize([1e16, 1, -1e16]), 'n=3 mean=0.3333333333333333 min=-1e+16 max=1e+16');
  assert.equal(summarize([1e-5, 1.5e-7]), 'n=2 mean=5.0750000000000005e-06 min=1.5e-07 max=1e-05');
  assert.throws(() => summarize([]));
});

test('to_json matches json.dumps with sort_keys', () => {
  assert.equal(to_json({ b: 1, a: [1, 2] }), '{"a": [1, 2], "b": 1}');
  assert.equal(to_json('é😀\x7f'), '"\\u00e9\\ud83d\\ude00\\u007f"');
  assert.equal(to_json([1e-5, 0.1, null, true]), '[1e-05, 0.1, null, true]');
  assert.equal(to_json({ '\u{1f600}': 1, 'Ａ': 2 }), '{"\\uff21": 2, "\\ud83d\\ude00": 1}');
  assert.equal(to_json({ 10: 1, 9: 2 }), '{"10": 1, "9": 2}');
  assert.equal(to_json({}), '{}');
});

test('iso_week_dates follows date.fromisocalendar', () => {
  assert.deepEqual(iso_week_dates('2025-W07')[0], '2025-02-10');
  assert.equal(iso_week_dates('2026-W01')[0], '2025-12-29');
  assert.equal(iso_week_dates('2020-W53')[6], '2021-01-03');
  assert.equal(iso_week_dates('0001-W01')[0], '0001-01-01');
  assert.deepEqual(iso_week_dates(' 2025-W7'), iso_week_dates('2025-W07'));
  for (const bad of ['2021-W53', '2025-W00', '2025-W54', '2025-w07', '2025-07', '2025-W07-1', '0000-W01', '9999-W52']) assert.throws(() => iso_week_dates(bad), undefined, bad);
});
