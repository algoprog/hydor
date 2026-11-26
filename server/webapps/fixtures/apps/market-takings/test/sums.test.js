import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workOut, decode, NotYourFile } from '../sums.js';

const head = 'date,item,quantity,price\n';

test('the example weekend', () => {
  const r = workOut(readFileSync(new URL('../example-weekend.csv', import.meta.url), 'utf8'));
  // 25 + 18 + 29.97 + 50 - 18 + 15.75
  assert.equal(r.totalTakings, 120.72);
  assert.equal(r.candlesSold, 10);
  assert.equal(r.bestSeller, 'Fig & Cedar');
  assert.equal(r.refunds, 1);
  assert.equal(r.skippedLines, 1);
  assert.deepEqual(r.days, [{ date: '2027-05-08', takings: 72.97 }, { date: '2027-05-09', takings: 47.75 }]);
});

test('a tie goes to the candle first in the file, and days are earliest first', () => {
  const r = workOut(`${head}2027-05-09,B,2,1\n2027-05-08, a ,1,1\n2027-05-08,A,1,1\n`);
  assert.equal(r.bestSeller, 'B');
  assert.deepEqual(r.days.map((d) => d.date), ['2027-05-08', '2027-05-09']);
});

test('lines that cannot be read are left out and counted', () => {
  const bad = ['2027-05-08,A,1', '2027-05-08,A,1,1,1', '2027-05-08,A,1.5,1', '2027-05-08,A,1,abc', '2027-05-08,A,1,-1',
    '2027-02-30,A,1,1', '08/05/2027,A,1,1', '2027-05-08,  ,1,1', '2027-05-08,"A,1,1', '2027-05-08,A,,1'];
  const r = workOut(`${head}${bad.join('\n')}\n   \n2028-02-29,A,1,0.10\n2028-02-29,A,2,0.10\n`);
  assert.equal(r.skippedLines, bad.length);
  assert.equal(r.totalTakings, 0.3);
  assert.equal(r.candlesSold, 3);
});

test('Windows line ends, a byte order mark, quotes and older accents', () => {
  const r = workOut(decode(Buffer.from('﻿Date,Item,Quantity,Price\r\n2027-05-08,"The ""Big"" one, tall",1,5\r\n')));
  assert.equal(r.bestSeller, 'The "Big" one, tall');
  const old = workOut(decode(Buffer.from(`${head}2027-05-08,Crème,1,5\n`, 'latin1')));
  assert.equal(old.bestSeller, 'Crème');
});

test('only refunds: money comes off and there is no best seller', () => {
  const r = workOut(`${head}2027-05-08,A,-2,3.50\n`);
  assert.equal(r.totalTakings, -7);
  assert.equal(r.candlesSold, -2);
  assert.equal(r.bestSeller, null);
});

test('a file that is not hers is refused', () => {
  for (const text of ['', '\n\n', 'a,b,c,d\n1,2,3,4', '2027-05-08,A,1,1', 'date,item,quantity\n']) {
    assert.throws(() => workOut(text), NotYourFile);
  }
  assert.throws(() => decode(Buffer.from('PK\u0003\u0004rest')), NotYourFile);
});
