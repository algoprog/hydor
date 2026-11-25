// The conversation's zoom (shared/zoom.ts): its steps, its keys, Ctrl and the wheel, and what an agent may set.
// OUTDIR=dist/dev node scripts/build-server.mjs shared/zoom-test.ts && node dist/dev/zoom-test.js
import assert from 'node:assert/strict';
import { cleanReport, deviceChange } from './device.ts';
import { CONV_ZOOMS, nearestZoom, stepZoom, validZoom, VIEW_ZOOMS, wheelStepper, zoomKey } from './zoom.ts';

// Up and down the steps, stopping at the ends; a level between two steps goes to the next one either way.
assert.deepEqual(CONV_ZOOMS.map((z) => Math.round(z * 100)), [67, 80, 90, 100, 110, 125, 150, 175, 200]);
assert.equal(stepZoom(1, 'in'), 1.1);
assert.equal(stepZoom(1.1, 'in'), 1.25);
assert.equal(stepZoom(1, 'out'), 0.9);
assert.equal(stepZoom(2, 'in'), 2);
assert.equal(stepZoom(0.67, 'out'), 0.67);
assert.equal(stepZoom(1.3, 'in'), 1.5);
assert.equal(stepZoom(1.3, 'out'), 1.25);
assert.equal(stepZoom(1.75, 'reset'), 1);
assert.equal(stepZoom(2, 'in', VIEW_ZOOMS), 2.5);
assert.equal(nearestZoom(1.4), 1.5);
assert.equal(nearestZoom(0.1), 0.67);
assert.equal(nearestZoom(9), 2);
assert.equal(validZoom(1.333), 1.33);
assert.equal(validZoom(5), 2);
assert.equal(validZoom(0.1), 0.67);
assert.equal(validZoom('1.5'), 1);
assert.equal(validZoom(undefined), 1);

// The keys: Ctrl or ⌘, with or without Shift, the number pad's too; not with Alt (AltGr types characters), not alone.
assert.equal(zoomKey({ key: '=', ctrlKey: true }), 'in');
assert.equal(zoomKey({ key: '+', ctrlKey: true }), 'in');
assert.equal(zoomKey({ key: '+', code: 'NumpadAdd', metaKey: true }), 'in');
assert.equal(zoomKey({ key: '-', ctrlKey: true }), 'out');
assert.equal(zoomKey({ key: '_', metaKey: true }), 'out');
assert.equal(zoomKey({ key: '-', code: 'NumpadSubtract', ctrlKey: true }), 'out');
assert.equal(zoomKey({ key: '0', code: 'Digit0', ctrlKey: true }), 'reset');
assert.equal(zoomKey({ key: 'à', code: 'Digit0', ctrlKey: true }), 'reset');
assert.equal(zoomKey({ key: '0', code: 'Numpad0', metaKey: true }), 'reset');
assert.equal(zoomKey({ key: '=' }), null);
assert.equal(zoomKey({ key: '=', ctrlKey: true, altKey: true }), null);
assert.equal(zoomKey({ key: 'f', code: 'KeyF', ctrlKey: true }), null);

// A mouse wheel's notch is a step each; a trackpad's small moves add up; turning back or pausing starts again.
const wheel = wheelStepper();
assert.equal(wheel(-100, 0, 0), 1);
assert.equal(wheel(-100, 0, 10), 1);
assert.equal(wheel(100, 0, 20), -1);
assert.equal(wheel(3, 1, 30), -1); // lines (Firefox's notch of three)
assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => wheel(-4, 0, 1000 + i * 16)), [0, 0, 1, 0, 0, 1]);
assert.deepEqual([wheel(-8, 0, 3000), wheel(8, 0, 3016), wheel(8, 0, 3032)], [0, 0, -1]);
assert.deepEqual([wheel(-8, 0, 4000), wheel(-8, 0, 4500)], [0, 0]);
assert.equal(wheel(0, 0, 5000), 0);

// What an agent may set on a device (PUT /device) and what a page reports: a percentage from 67 to 200.
assert.deepEqual(deviceChange({ zoom: 125 }), { set: { zoom: 125 }, bad: [] });
assert.deepEqual(deviceChange({ zoom: 67 }), { set: { zoom: 67 }, bad: [] });
assert.deepEqual(deviceChange({ zoom: 130.4 }), { set: { zoom: 130 }, bad: [] });
for (const bad of [66, 201, 1.5, '150', true, null]) assert.deepEqual(deviceChange({ zoom: bad }).bad, ['zoom'], String(bad));
assert.equal(cleanReport({ id: 'p-abcd', label: 'x', settings: { zoom: 150 } })!.settings.zoom, 150);
assert.equal(cleanReport({ id: 'p-abcd', label: 'x', settings: { zoom: 999 } })!.settings.zoom, undefined);

console.log('zoom ok');
