// Script tests for cutting the address bar's list to fit (omniboxFit.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/browser/omniboxFit-test.ts && node dist/dev/omniboxFit-test.js
import { fitRows } from './omniboxFit';

let failed = 0;
let passed = 0;
const same = (a: unknown, b: unknown, what: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}\n  got  ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`);
  }
};

const page = (n: number) => ({ id: `h${n}`, kind: 'history' });
const search = (n: number) => ({ id: `s${n}`, kind: 'search' });
const typed = { id: 'typed', kind: 'search' };
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

const pages = [0, 1, 2, 3, 4, 5, 6, 7].map(page);
const searches = [0, 1, 2, 3, 4].map(search);
same(ids(fitRows([typed, ...pages.slice(0, 2), ...searches.slice(0, 2)], 9)), ['typed', 'h0', 'h1', 's0', 's1'], 'everything fits: nothing is cut');
// Pages come first and are the larger side: they lose their last ones, the engine's suggestions stay.
same(ids(fitRows([typed, ...pages, ...searches.slice(0, 3)], 7)), ['typed', 'h0', 'h1', 'h2', 's0', 's1', 's2'], 'the larger side is cut first');
same(ids(fitRows([typed, ...pages.slice(0, 3), ...searches], 7)), ['typed', 'h0', 'h1', 'h2', 's0', 's1', 's2'], 'the engine’s suggestions are the larger side: they are cut first');
same(ids(fitRows([typed, page(0), page(1), ...searches], 6)).filter((i) => i.startsWith('h')), ['h0', 'h1'], 'a side with two rows keeps them');
same(ids(fitRows([typed, ...pages, search(0), search(1)], 6)).filter((i) => i.startsWith('s')), ['s0', 's1'], 'two of the engine’s suggestions stay however many pages there are');
same(ids(fitRows([typed, ...pages], 5)), ['typed', 'h0', 'h1', 'h2', 'h3'], 'one source: it fills the room');
same(ids(fitRows([typed, page(0), page(1), search(0), search(1)], 3)).length, 3, 'where even two of each do not fit, the end goes');
same(ids(fitRows([typed, page(0), page(1), search(0), search(1)], 3)), ['typed', 'h0', 's0'], 'one of each stays when there is room for no more');

console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
