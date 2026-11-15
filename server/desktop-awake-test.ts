// Script test for keeping the computer awake in the desktop apps (desktop/awake.cjs): the server's word holds one
// 'prevent-app-suspension' blocker (never a second while it holds one, nor 'prevent-display-sleep', which would keep the
// screen on), lets it go, starts a new one when the system dropped the old, and says when the system refused; main.cjs
// lets go when the server exits and when the app quits. Electron's powerSaveBlocker is a stand-in here. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/desktop-awake-test.ts && node dist/dev/desktop-awake-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Awake {
  onMessage(m: unknown): void;
  hold(why?: string): void;
  release(why?: string): void;
  holding(): boolean;
}
const require = createRequire(import.meta.url);
const { createAwake } = require('../../desktop/awake.cjs') as { createAwake: (o: { powerSaveBlocker: Blocker; log?: (...a: unknown[]) => void }) => Awake };

/** Electron's powerSaveBlocker, as far as awake.cjs uses it. */
class Blocker {
  next = 1;
  started = new Map<number, string>();
  calls: string[] = [];
  refuse = false;
  start(type: string): number {
    this.calls.push(`start ${type}`);
    if (this.refuse) throw new Error('the system refused');
    const id = this.next++;
    this.started.set(id, type);
    return id;
  }
  stop(id: number): boolean {
    this.calls.push(`stop ${id}`);
    return this.started.delete(id);
  }
  isStarted(id: number): boolean {
    return this.started.has(id);
  }
}

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('on holds one blocker that lets the screen turn off; off lets it go', () => {
  const b = new Blocker();
  const said: unknown[][] = [];
  const a = createAwake({ powerSaveBlocker: b, log: (...w) => said.push(w) });
  assert.equal(a.holding(), false);
  a.onMessage({ type: 'awake', on: true, why: '1 at work' });
  assert.deepEqual(b.calls, ['start prevent-app-suspension']);
  assert.equal(a.holding(), true);
  a.onMessage({ type: 'awake', on: true, why: '2 at work' });
  assert.equal(b.started.size, 1, 'never a second one');
  a.onMessage({ type: 'awake', on: false, why: 'nothing needs it' });
  assert.deepEqual(b.calls, ['start prevent-app-suspension', 'stop 1']);
  assert.equal(a.holding(), false);
  a.onMessage({ type: 'awake', on: false });
  assert.equal(b.calls.length, 2, 'nothing to let go twice');
  assert.deepEqual(said, [
    ['keeps the computer awake', '1 at work'],
    ['lets the computer sleep', 'nothing needs it'],
  ]);
});

test('the server stopping, or the app quitting, lets it go', () => {
  const b = new Blocker();
  const a = createAwake({ powerSaveBlocker: b });
  a.onMessage({ type: 'awake', on: true });
  a.release('the server stopped');
  assert.equal(b.started.size, 0);
  a.release('the app quits');
  assert.deepEqual(b.calls, ['start prevent-app-suspension', 'stop 1']);
});

test('one the system dropped is started again; one it refused is said and not held', () => {
  const b = new Blocker();
  const said: unknown[][] = [];
  const a = createAwake({ powerSaveBlocker: b, log: (...w) => said.push(w) });
  a.onMessage({ type: 'awake', on: true });
  b.started.clear();
  assert.equal(a.holding(), false);
  a.onMessage({ type: 'awake', on: true });
  assert.equal(b.started.size, 1);
  a.release();
  b.refuse = true;
  a.onMessage({ type: 'awake', on: true });
  assert.equal(a.holding(), false);
  assert.match(String(said.at(-1)?.[0]), /could not keep the computer awake/);
  a.onMessage(null);
  a.onMessage('awake');
});

test('main.cjs hears the server, lets go as its server exits and as it quits, and packs awake.cjs', () => {
  const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../desktop');
  const main = fs.readFileSync(path.join(desktop, 'main.cjs'), 'utf8');
  assert.match(main, /m\.type === 'awake'\) \{\s*awake\.onMessage\(m\)/);
  assert.match(main, /child\.on\('exit', [\s\S]{0,300}awake\.release\('the server stopped'\)/);
  assert.match(main, /app\.on\('will-quit', [\s\S]{0,200}awake\.release\('the app quits'\)/);
  const builder = fs.readFileSync(path.join(desktop, 'electron-builder.cjs'), 'utf8');
  assert.match(builder, /files: \[[^\]]*'awake\.cjs'/, 'packed with the app');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
  }
}
console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
