// Script test for scrollForTab (tabs.ts): a chosen tab is brought into view in a strip that scrolls sideways, and a tab already in view
// does not move the strip. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/webapps/tabs-test.ts && node dist/dev/tabs-test.js
import assert from 'node:assert/strict';
import { scrollForTab } from './tabs';

const strip = (scrollLeft: number) => ({ scrollLeft, clientWidth: 350, scrollWidth: 1200 });

// In view: stays.
assert.equal(scrollForTab(strip(0), { offsetLeft: 20, offsetWidth: 100 }), 0);
assert.equal(scrollForTab(strip(100), { offsetLeft: 200, offsetWidth: 100 }), 100);
// To the right of the strip's view: scrolled just far enough, with room.
assert.equal(scrollForTab(strip(0), { offsetLeft: 1000, offsetWidth: 150 }), 812);
// The last tab: no further than the strip goes.
assert.equal(scrollForTab(strip(0), { offsetLeft: 1050, offsetWidth: 150 }), 850);
// To the left of the view: back to it, with room.
assert.equal(scrollForTab(strip(700), { offsetLeft: 300, offsetWidth: 90 }), 288);
assert.equal(scrollForTab(strip(700), { offsetLeft: 0, offsetWidth: 90 }), 0);
// A strip that does not scroll stays at 0.
assert.equal(scrollForTab({ scrollLeft: 0, clientWidth: 600, scrollWidth: 600 }, { offsetLeft: 500, offsetWidth: 90 }), 0);
console.log('ok - a chosen tab is brought into view in a strip of tabs');
