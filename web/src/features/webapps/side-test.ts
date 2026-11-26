// Which web app is beside a conversation is read from the conversation's own record: the app the newest web app call that worked was about, there
// again after the page is loaded again, unless the person closed that one (the next call is a new thing to show).
import assert from 'node:assert/strict';
import type { TimelineItem } from '@shared/types';
import { latestWebApp, webAppOf, webSideTarget } from './side.ts';

const A = '0123456789abcdef';
const B = 'fedcba9876543210';
const tool = (id: string, name: string, output: string, status = 'completed'): TimelineItem => ({ id, kind: 'tool', ts: 1, tool: { name, category: 'other', title: name, status, output } }) as unknown as TimelineItem;
const said = (id: string): TimelineItem => ({ id, kind: 'assistant', ts: 1, text: 'ok' }) as unknown as TimelineItem;

assert.equal(webAppOf(`Built.\n[web app ${A}]`), A);
assert.equal(webAppOf('no marker'), null);
assert.equal(webAppOf('[web app xyz]'), null);

assert.equal(latestWebApp(undefined), null);
assert.equal(latestWebApp([said('1')]), null);
// the newest call that worked, whichever tool, with or without the server's prefix
assert.deepEqual(latestWebApp([tool('1', 'webapp_new', `Made.\n[web app ${A}]`), said('2'), tool('3', 'mcp__hydor__webapp_run', `Built.\n[web app ${B}]`)]), { item: '3', app: B });
assert.deepEqual(latestWebApp([tool('1', 'webapp_check', `1 of 22 lines failed.\n[web app ${A}]`), tool('2', 'webapp_choose', '{"choice":"c0123"}')]), { item: '1', app: A }, 'a card has no app marker: the call before it stands');
// a call that failed shows nothing; a tool that is not one of the web app ones is not looked at
assert.deepEqual(latestWebApp([tool('1', 'webapp_run', `Built.\n[web app ${A}]`), tool('2', 'webapp_run', `The build failed.\n[web app ${B}]`, 'error')]), { item: '1', app: A });
assert.equal(latestWebApp([tool('1', 'Bash', `echo [web app ${A}]`)]), null);
assert.equal(latestWebApp([tool('1', 'find_apps', `[web app ${A}]`)]), null);

// opened by hand wins; else the record's app, unless that call's app was closed; a newer call is new again
assert.equal(webSideTarget(B, { item: '3', app: A }, '3'), B);
assert.equal(webSideTarget(undefined, { item: '3', app: A }, undefined), A, 'after a reload: from the record');
assert.equal(webSideTarget(undefined, { item: '3', app: A }, '3'), null, 'closed by the person');
assert.equal(webSideTarget(undefined, { item: '4', app: A }, '3'), A, 'a newer call opens it again');
assert.equal(webSideTarget(undefined, null, undefined), null);
console.log('side: ok');
