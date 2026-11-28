// Script tests for the machines that use this one and are connected to it (server/machine-clients.ts): what a connecting
// machine is called and whether it takes projects, calls and their replies, an error reply keeping its status and words, a
// call that is not answered in time, calls ending when their socket closes, a machine that connects again replacing its old
// socket (the old one closing later takes nothing away), and frames from a socket that is not the registered one or that do
// not parse being ignored. Sockets are stand-ins. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/machine-clients-test.ts
//   node dist/dev/machine-clients-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { MachineClients } from './machine-clients.ts';
import { RemoteError, Unreachable } from './spaces/transfer/endpoints.ts';

/** A socket as the registry uses it: it sends, it says what it hears, and it closes. */
class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: any[] = [];
  send(s: string) {
    this.sent.push(JSON.parse(s));
  }
  hear(frame: unknown) {
    this.emit('message', typeof frame === 'string' ? frame : JSON.stringify(frame));
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  get ws() {
    return this as unknown as WebSocket;
  }
}

const ID = 'a1b2c3d4e5f60718';
const hello = { tokenId: 't1', tokenName: 'My laptop', id: ID, host: 'laptop.local', version: '0.121.0', can: ['send'] };
const tick = () => new Promise((r) => setTimeout(r, 5));

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

test('list and get: the ref, the name, whether it takes projects', async () => {
  const c = new MachineClients();
  const a = new FakeSocket();
  c.add(a.ws, hello);
  assert.deepEqual(c.list().map((x) => ({ ref: x.ref, name: x.name, host: x.host, version: x.version, takes: x.takes })), [{ ref: `c:${ID}`, name: 'My laptop', host: 'laptop.local', version: '0.121.0', takes: true }]);
  assert.equal(c.get(`c:${ID}`)?.name, 'My laptop');
  assert.equal(c.get('c:nothing'), undefined);
  // An older Hydor says nothing about itself: it is known by its token, and takes nothing.
  const old = new FakeSocket();
  c.add(old.ws, { tokenId: 't2', tokenName: 'Old Mac' });
  assert.deepEqual(c.get('c:token-t2'), { ref: 'c:token-t2', name: 'Old Mac', takes: false, since: c.get('c:token-t2')!.since });
  // An id that is not an id is none; a machine without 'send' takes none; long words are cut.
  c.add(new FakeSocket().ws, { tokenId: 't3', tokenName: 'X', id: '../../etc', can: ['send'] });
  assert.equal(c.get('c:token-t3')?.takes, false);
  c.add(new FakeSocket().ws, { tokenId: 't4', tokenName: 'Y', id: 'ffffffff', host: 'h'.repeat(200), version: 'v'.repeat(50), can: [] });
  const y = c.get('c:ffffffff')!;
  assert.equal(y.takes, false);
  assert.equal(y.host!.length, 80);
  assert.equal(y.version!.length, 20);
});

test('events: changed and back on add, changed and gone on close', async () => {
  const c = new MachineClients();
  const seen: string[] = [];
  for (const e of ['changed', 'back', 'gone']) c.on(e, (ref?: string) => seen.push(ref ? `${e}:${ref}` : e));
  const a = new FakeSocket();
  c.add(a.ws, hello);
  a.close();
  assert.deepEqual(seen, ['changed', `back:c:${ID}`, 'changed', `gone:c:${ID}`]);
  assert.deepEqual(c.list(), []);
});

test('call and reply: the value comes back, ids do not mix', async () => {
  const c = new MachineClients();
  const a = new FakeSocket();
  c.add(a.ws, hello);
  const p1 = c.call(`c:${ID}`, 'info', {}, 1000);
  const p2 = c.call(`c:${ID}`, 'place', { name: 'x' }, 1000);
  assert.equal(a.sent.length, 2);
  assert.deepEqual(a.sent[0], { t: 'call', id: a.sent[0].id, op: 'info', args: {} });
  assert.deepEqual(a.sent[1].args, { name: 'x' });
  assert.notEqual(a.sent[0].id, a.sent[1].id);
  a.hear({ t: 'reply', id: a.sent[1].id, ok: true, value: { folder: '/home/x/y' } });
  a.hear({ t: 'reply', id: a.sent[0].id, ok: true, value: { host: 'laptop' } });
  assert.deepEqual(await p2, { folder: '/home/x/y' });
  assert.deepEqual(await p1, { host: 'laptop' });
});

test('an error reply is a RemoteError with its status and words', async () => {
  const c = new MachineClients();
  const a = new FakeSocket();
  c.add(a.ws, hello);
  const p = c.call(`c:${ID}`, 'send', {}, 1000);
  a.hear({ t: 'reply', id: a.sent[0].id, ok: false, status: 409, error: 'There are files at /home/x already' });
  await assert.rejects(p, (e: unknown) => e instanceof RemoteError && e.status === 409 && e.message === 'There are files at /home/x already');
});

test('a call that is not answered in time says so, and a late reply is ignored', async () => {
  const c = new MachineClients();
  const a = new FakeSocket();
  c.add(a.ws, hello);
  const p = c.call(`c:${ID}`, 'info', {}, 20);
  await assert.rejects(p, (e: unknown) => e instanceof Unreachable && e.message === 'My laptop did not answer in time');
  a.hear({ t: 'reply', id: a.sent[0].id, ok: true, value: 1 });
});

test('a call to a machine that is not connected is refused at once', async () => {
  const c = new MachineClients();
  await assert.rejects(c.call('c:nobody', 'info', {}, 1000), (e: unknown) => e instanceof Unreachable && /not connected/.test((e as Error).message));
});

test('closing ends the pending calls, naming the machine', async () => {
  const c = new MachineClients();
  const a = new FakeSocket();
  c.add(a.ws, hello);
  const p = c.call(`c:${ID}`, 'info', {}, 5000);
  a.close();
  await assert.rejects(p, (e: unknown) => e instanceof Unreachable && e.message === 'My laptop is not connected now');
});

test('the same machine connecting again replaces the old socket; the old one closing later changes nothing', async () => {
  const c = new MachineClients();
  const gone: string[] = [];
  c.on('gone', (ref: string) => gone.push(ref));
  const oldSock = new FakeSocket();
  c.add(oldSock.ws, hello);
  const pending = c.call(`c:${ID}`, 'info', {}, 5000);
  const fresh = new FakeSocket();
  c.add(fresh.ws, hello);
  assert.equal(c.list().length, 1);
  // Calls now go to the new socket.
  const p = c.call(`c:${ID}`, 'info', {}, 1000);
  assert.equal(fresh.sent.length, 1);
  assert.equal(oldSock.sent.length, 1);
  // The old socket closes: its own pending call ends, the machine stays listed, nothing says it is gone.
  oldSock.close();
  await assert.rejects(pending, Unreachable);
  assert.equal(c.list().length, 1);
  assert.deepEqual(gone, []);
  fresh.hear({ t: 'reply', id: fresh.sent[0].id, ok: true, value: 'fine' });
  assert.equal(await p, 'fine');
  fresh.close();
  assert.deepEqual(gone, [`c:${ID}`]);
  assert.deepEqual(c.list(), []);
});

test('transfer frames are passed on, from the registered socket only, and only when they have the shape', async () => {
  const c = new MachineClients();
  const got: any[] = [];
  c.on('transfer', (ref: string, handoff: string, t: any) => got.push([ref, handoff, t.id, t.state]));
  const a = new FakeSocket();
  c.add(a.ws, hello);
  const t = { id: 'abc', state: 'sending', done: { files: 1, bytes: 10 }, total: { files: 2, bytes: 20 } };
  a.hear({ t: 'transfer', handoff: 'h1', transfer: t });
  // Not parseable, not an object, a wrong shape, no handoff id: nothing.
  a.hear('not json');
  a.hear('[1,2]');
  a.hear('null');
  a.hear({ t: 'transfer', handoff: 'h2', transfer: { id: 'abc', state: 'weird', done: t.done, total: t.total } });
  a.hear({ t: 'transfer', handoff: 'h3', transfer: { id: 'abc', state: 'done' } });
  a.hear({ t: 'transfer', transfer: t });
  a.hear({ t: 'reply', id: 'x', ok: true });
  a.hear({ t: 'sub', key: 'whatever' });
  assert.deepEqual(got, [[`c:${ID}`, 'h1', 'abc', 'sending']]);
  // An old socket that was replaced is not the registered one any more.
  const fresh = new FakeSocket();
  c.add(fresh.ws, hello);
  a.hear({ t: 'transfer', handoff: 'h4', transfer: t });
  assert.equal(got.length, 1);
  fresh.hear({ t: 'transfer', handoff: 'h5', transfer: t });
  assert.equal(got.length, 2);
  // A socket that was never added says nothing to anyone (a browser's does not reach the registry at all).
  const stranger = new FakeSocket();
  stranger.hear({ t: 'transfer', handoff: 'h6', transfer: t });
  assert.equal(got.length, 2);
});

test('a reply from another machine’s socket does not answer a call', async () => {
  const c = new MachineClients();
  const a = new FakeSocket();
  const b = new FakeSocket();
  c.add(a.ws, hello);
  c.add(b.ws, { tokenId: 't9', tokenName: 'Other', id: 'deadbeef' });
  const p = c.call(`c:${ID}`, 'info', {}, 40);
  b.hear({ t: 'reply', id: a.sent[0].id, ok: true, value: 'forged' });
  await assert.rejects(p, /did not answer in time/);
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    await tick();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exit(1);
  }
}
console.log(`${passed}/${tests.length} machine-clients tests passed`);
process.exit(0);
