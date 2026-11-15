// OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/session/ending-test.ts && node dist/dev/ending-test.js
import assert from 'node:assert/strict';
import type { FileChange, TimelineItem } from '@shared/types';
import { endingLabel, sessionEnd } from './ending';

let n = 0;
const id = () => `i${++n}`;
const user = (text = 'Do it', meta?: 'queued' | 'slash' | 'note' | 'command-output'): TimelineItem => ({ kind: 'user', id: id(), seq: 0, text, ...(meta ? { meta } : {}) });
const said = (text = 'Done it'): TimelineItem => ({ kind: 'assistant', id: id(), seq: 0, text });
const turn = (status: string): TimelineItem => ({ kind: 'turn', id: id(), seq: 0, status, durationMs: 5000 });
const err = (text = 'API Error: 500'): TimelineItem => ({ kind: 'system', id: id(), seq: 0, level: 'error', text });
const edit = (files: Partial<FileChange>[], status = 'completed'): TimelineItem => ({
  kind: 'tool',
  id: id(),
  seq: 0,
  tool: { id: id(), name: 'Edit', category: 'edit', status, title: 'Edit', files: files.map((f) => ({ path: '/p/a', op: 'edit', added: 1, removed: 0, ...f })) },
} as TimelineItem);

// Nothing to tell yet: today's wording stays.
assert.equal(sessionEnd([]), null);
assert.equal(sessionEnd([said('Hello')]), null);

// The last turn finished: Done.
assert.deepEqual(sessionEnd([user(), said(), turn('completed')]), { ended: 'done', made: 0, changed: 0 });
assert.equal(endingLabel(sessionEnd([user(), said(), turn('completed')])!), 'Done');

// You stopped it: Stopped. It ended with an error: Failed.
assert.equal(sessionEnd([user(), said(), turn('completed'), user(), turn('interrupted')])!.ended, 'stopped');
assert.equal(sessionEnd([user(), turn('failed')])!.ended, 'failed');
assert.equal(endingLabel(sessionEnd([user(), turn('failed')])!), 'Failed');
assert.equal(endingLabel(sessionEnd([user(), edit([{}]), turn('interrupted')])!), 'Stopped', 'no files on a stop');

// A turn that "completed" on an error it could not get past failed; an error the agent got past did not.
assert.equal(sessionEnd([user(), said(), err(), turn('completed')])!.ended, 'failed');
assert.equal(sessionEnd([user(), err(), said(), turn('completed')])!.ended, 'done');
// A note from another session is not the work's error.
assert.equal(sessionEnd([user(), said(), { ...err(), peer: true } as TimelineItem, turn('completed')])!.ended, 'done');

// A message whose turn never ended (the agent was stopped while it worked): Stopped. A slash command's echo or a note
// after the turn is not one.
assert.equal(sessionEnd([user(), said(), turn('completed'), user('And then?'), said('Working on')])!.ended, 'stopped');
assert.equal(sessionEnd([user(), said(), turn('completed'), user('/model', 'slash')])!.ended, 'done');
assert.equal(sessionEnd([user(), said(), turn('completed'), user('note', 'note')])!.ended, 'done');

// Files: made (new) and changed (there before), each once; a failed or declined edit, or a deletion, is none.
const files = [
  user(),
  edit([{ path: '/p/new.md', op: 'create' }]),
  edit([{ path: '/p/new.md', op: 'edit' }]),
  edit([{ path: '/p/old.ts', op: 'edit' }]),
  edit([{ path: '/p/old.ts', op: 'write' }]),
  edit([{ path: '/p/x.ts', op: 'edit' }], 'error'),
  edit([{ path: '/p/y.ts', op: 'edit' }], 'declined'),
  edit([{ path: '/p/gone.ts', op: 'delete' }]),
  said(),
  turn('completed'),
];
assert.deepEqual(sessionEnd(files), { ended: 'done', made: 1, changed: 1 });
assert.equal(endingLabel(sessionEnd(files)!), 'Done · 2 files changed', 'made and changed together count as changed');
assert.equal(endingLabel(sessionEnd([user(), edit([{ path: '/p/a.md', op: 'create' }, { path: '/p/b.md', op: 'create' }]), turn('completed')])!), 'Done · 2 files made');
assert.equal(endingLabel(sessionEnd([user(), edit([{ path: '/p/a.md', op: 'create' }]), turn('completed')])!), 'Done · 1 file made');
assert.equal(endingLabel(sessionEnd([user(), edit([{ path: '/p/a.ts' }]), turn('completed')])!), 'Done · 1 file changed');
assert.equal(endingLabel(sessionEnd([user(), edit([{ path: '/p/a.ts' }, { path: '/p/b.ts' }, { path: '/p/c.ts' }]), turn('completed')])!), 'Done · 3 files changed');
// A file moved counts at its new place, once.
assert.deepEqual(sessionEnd([user(), edit([{ path: '/p/a.ts', op: 'move', movePath: '/p/b.ts' }]), edit([{ path: '/p/b.ts' }]), turn('completed')]), { ended: 'done', made: 0, changed: 1 });

console.log('ending: ok');
