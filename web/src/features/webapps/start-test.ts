// How a new web app is started (start.ts): the first message, what the session is told, and the name of the app made.
import assert from 'node:assert/strict';
import { planStart } from './start';

const kind = { id: 'booking', name: 'Booking and scheduling', who: '', needs: [] };
let p = planStart({ kind, name: ' Bike service ', line: 'People book a repair.' });
assert.equal(p.prompt, 'Make me a web app: Bike service (Booking and scheduling). People book a repair.');
assert.deepEqual(p.webKind, { kind: 'booking', name: 'Bike service', line: 'People book a repair.' });
assert.equal(p.make, 'Bike service');
p = planStart({ kind, name: '', line: '' });
assert.equal(p.prompt, 'Make me a web app: Booking and scheduling.');
assert.deepEqual(p.webKind, { kind: 'booking' });
p = planStart({ kind: null, name: '', line: 'A list of my plants.' });
assert.equal(p.prompt, 'Make me a web app: A list of my plants.');
assert.deepEqual([p.make, p.placeholder], ['My app', true]);
assert.equal(planStart({ kind, name: '', line: 'People book a repair.' }).prompt, 'Make me a web app (Booking and scheduling): People book a repair.');
assert.equal(planStart({ kind, name: 'Bike service', line: '' }).placeholder, undefined);
assert.deepEqual(p.webKind, { line: 'A list of my plants.' });
p = planStart({ kind: null, agent: { id: 'abc', name: 'Trip planner' }, name: 'Trips', line: '' });
assert.equal(p.prompt, 'Make a web app of its own for the agent app “Trip planner”: Trips.');
assert.deepEqual(p.webKind, { agentApp: 'abc', name: 'Trips' });
assert.equal(p.make, 'Trips');
console.log('ok - how a new web app is started: the message, what the session is told, the name of the app');
