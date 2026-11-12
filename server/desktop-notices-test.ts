// Script tests for the desktop's notices (desktop/notices.cjs): a session's notice becomes a system notification
// unless the window shows that session, one about a session replaces its older one (and, on a Mac, takes the old one
// out of Notification Center), a failed one goes to the page in the window, a click opens its session, the last
// KEEP sessions stay, the notifications from before the app started open their session on a Mac, and the test
// notification in Settings reports what the system said; while the window is away the app's icon counts the sessions
// with notices, and the count goes once it is in front. Electron's Notification is a stand-in here. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/desktop-notices-test.ts && node dist/dev/desktop-notices-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

interface Options {
  title: string;
  body: string;
  groupId?: string;
}
interface Msg {
  n?: { key: string };
  title?: string;
  body?: string;
  path?: string;
}
interface Api {
  show(m: Msg): void;
  restore(): Promise<void>;
  test(t: { title?: string; body?: string }): Promise<{ ok: boolean; error: string }>;
  state(): { shows: boolean | null; error: string };
  inView(): void;
  unseen(): number;
}
type CreateNotices = (o: {
  Notification: typeof Note;
  mac: boolean;
  front: () => string | null;
  inApp: (n: object) => void;
  open: (at: string) => void;
  showApp: () => void;
  badge?: (count: number) => void;
}) => Api;

const { createNotices, KEEP } = createRequire(import.meta.url)('../../desktop/notices.cjs') as {
  createNotices: CreateNotices;
  KEEP: number;
};

/** What the stand-in system holds: whether it shows notifications, the ones made, the ids removed, the history. */
const sys = { supported: true, throwOnMake: false, made: [] as Note[], removed: [] as string[], history: [] as Note[], historyCalls: 0 };
let seq = 0;

/** Electron's Notification, as far as notices.cjs uses it. */
class Note extends EventEmitter {
  readonly id = `note-${++seq}`;
  readonly groupId: string | undefined;
  shown = 0;
  closed = 0;
  constructor(readonly options: Options) {
    super();
    if (sys.throwOnMake) throw new Error('the system refused');
    this.groupId = options.groupId;
    sys.made.push(this);
  }
  static isSupported(): boolean {
    return sys.supported;
  }
  static remove(id: string): void {
    sys.removed.push(id);
  }
  static getHistory(): Note[] {
    sys.historyCalls++;
    return sys.history;
  }
  show(): void {
    this.shown++;
  }
  close(): void {
    this.closed++;
    this.emit('close', {});
  }
}

/** A notification from before the app started, as the system keeps it (not one the app made now). */
function fromBefore(groupId: string): Note {
  const note = new Note({ title: 'Earlier', body: '', groupId });
  sys.made.pop();
  return note;
}

/** A fresh system and fresh spies for one test, and the module built on them. */
function setup(mac: boolean) {
  sys.supported = true;
  sys.throwOnMake = false;
  sys.made.length = 0;
  sys.removed.length = 0;
  sys.history.length = 0;
  sys.historyCalls = 0;
  const spies = { frontAt: null as string | null, inApp: [] as object[], opened: [] as string[], appShown: 0, badges: [] as number[] };
  const api = createNotices({
    Notification: Note,
    mac,
    badge: (n) => spies.badges.push(n),
    front: () => spies.frontAt,
    inApp: (n) => spies.inApp.push(n),
    open: (at) => spies.opened.push(at),
    showApp: () => {
      spies.appShown++;
    },
  });
  return { api, spies };
}

/** The notification made last. */
function last(): Note {
  const note = sys.made.at(-1);
  assert.ok(note, 'a notification was made');
  return note;
}

const notice = (key: string, path = `/s/${key}`): Msg => ({ n: { key }, title: 'T', body: 'B', path });

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void> | void) => tests.push([name, async () => fn()]);

test('a notice the window does not show becomes a system notification with its title and body', async () => {
  const { api, spies } = setup(true);
  const m = notice('k1');
  api.show(m);
  assert.equal(sys.made.length, 1);
  const note = last();
  assert.deepEqual(note.options, { title: 'T', body: 'B', groupId: '/s/k1' });
  assert.equal(note.shown, 1);
  assert.deepEqual(spies.inApp, []);

  const plain = setup(false);
  plain.api.show(notice('k1'));
  assert.equal(sys.made.length, 1);
  assert.deepEqual(last().options, { title: 'T', body: 'B' });
  assert.equal('groupId' in last().options, false);
  assert.equal(last().shown, 1);
  assert.deepEqual(plain.spies.inApp, []);
});

test('no notification for the session the window is in front showing, but one for another session', async () => {
  const { api, spies } = setup(true);
  spies.frontAt = '/s/k1';
  api.show(notice('k1'));
  assert.equal(sys.made.length, 0);
  api.show(notice('k2'));
  assert.equal(sys.made.length, 1);
  assert.equal(last().groupId, '/s/k2');
  assert.deepEqual(spies.inApp, []);
});

test("while the window is away the app's icon counts the sessions with notices, each once, until it is in front", async () => {
  const { api, spies } = setup(true);
  api.show(notice('k1'));
  api.show(notice('k1'));
  api.show(notice('k2'));
  assert.deepEqual(spies.badges, [1, 2]);
  assert.equal(api.unseen(), 2);
  assert.equal(sys.made.length, 3);
  api.inView();
  assert.deepEqual(spies.badges, [1, 2, 0]);
  assert.equal(api.unseen(), 0);
  api.inView();
  assert.deepEqual(spies.badges, [1, 2, 0]);
  api.show(notice('k1'));
  assert.deepEqual(spies.badges, [1, 2, 0, 1]);
});

test("no count on the app's icon while the window is in front, whichever page it shows", async () => {
  const { api, spies } = setup(true);
  spies.frontAt = '/s/other';
  api.show(notice('k1'));
  spies.frontAt = '';
  api.show(notice('k2'));
  assert.deepEqual(spies.badges, []);
  assert.equal(sys.made.length, 2);
});

test("the count comes whether or not the system shows the notification", async () => {
  const { api, spies } = setup(true);
  sys.supported = false;
  api.show(notice('k1'));
  sys.supported = true;
  sys.throwOnMake = true;
  api.show(notice('k2'));
  assert.deepEqual(spies.badges, [1, 2]);
  assert.equal(spies.inApp.length, 2);
});

test('a message without a notice, without a path, or with a path not starting with a slash is ignored', async () => {
  const { api, spies } = setup(true);
  api.show({ title: 'T', body: 'B', path: '/s/k1' });
  api.show({ n: { key: 'k2' }, title: 'T', body: 'B' });
  api.show({ n: { key: 'k3' }, title: 'T', body: 'B', path: 's/k3' });
  assert.equal(sys.made.length, 0);
  assert.deepEqual(spies.inApp, []);
});

test('a newer notice about a session closes the older one, and on a Mac takes it out of Notification Center', async () => {
  const { api } = setup(true);
  api.show(notice('k1'));
  const first = last();
  api.show({ n: { key: 'k1b' }, title: 'Newer', body: 'B', path: '/s/k1' });
  const second = last();
  assert.notEqual(second, first);
  assert.equal(first.closed, 1);
  assert.deepEqual(sys.removed, [first.id]);
  assert.equal(second.shown, 1);
  assert.equal(second.closed, 0);
});

test('a notification the system fails to show goes to the window, and the state says why; a later show clears it', async () => {
  const { api, spies } = setup(true);
  assert.deepEqual(api.state(), { shows: null, error: '' });
  const n1 = notice('k1');
  api.show(n1);
  last().emit('failed', {}, 'Notifications are not allowed for this application');
  assert.equal(spies.inApp.length, 1);
  assert.equal(spies.inApp[0], n1.n);
  assert.deepEqual(api.state(), { shows: false, error: 'Notifications are not allowed for this application' });

  api.show(notice('k2'));
  last().emit('show', {});
  assert.deepEqual(api.state(), { shows: true, error: '' });
});

test('a click on a notification opens its session', async () => {
  const { api, spies } = setup(true);
  api.show(notice('k1'));
  last().emit('click', {});
  assert.deepEqual(spies.opened, ['/s/k1']);
});

test('where the system does not support notifications, the window gets the notice and none is made', async () => {
  const { api, spies } = setup(true);
  sys.supported = false;
  const m = notice('k1');
  api.show(m);
  assert.equal(sys.made.length, 0);
  assert.equal(spies.inApp.length, 1);
  assert.equal(spies.inApp[0], m.n);
});

test('past KEEP sessions, the oldest session notification is closed and the rest stay', async () => {
  const { api } = setup(false);
  assert.equal(KEEP, 50);
  for (let i = 0; i <= KEEP; i++) api.show(notice(`k${i}`, `/s/k${i}`));
  assert.equal(sys.made.length, KEEP + 1);
  assert.equal(sys.made[0].closed, 1);
  for (const note of sys.made.slice(1)) assert.equal(note.closed, 0);
});

test('restore on a Mac: the notifications from before open their session on click', async () => {
  const { api, spies } = setup(true);
  const old = fromBefore('/s/old');
  const bare = fromBefore('');
  sys.history.push(old, bare);
  await api.restore();
  assert.equal(sys.historyCalls, 1);

  old.emit('click', {});
  assert.deepEqual(spies.opened, ['/s/old']);
  assert.equal(bare.listenerCount('click'), 0);
});

test('restore on a Mac: a new notice about that session takes the one from before away', async () => {
  const { api } = setup(true);
  const old = fromBefore('/s/old');
  sys.history.push(old);
  await api.restore();

  // close() leaves one from before in Notification Center: it goes by its id.
  api.show(notice('old', '/s/old'));
  assert.equal(old.closed, 1);
  assert.deepEqual(sys.removed, [old.id]);
  assert.equal(last().shown, 1);
});

test('a notification the system will not even make goes to the window', () => {
  const { api, spies } = setup(true);
  sys.throwOnMake = true;
  const m = notice('k1', '/s/k1');
  api.show(m);
  assert.deepEqual(spies.inApp, [m.n]);
});

test('restore off a Mac does not ask the system for its history', async () => {
  const { api } = setup(false);
  await api.restore();
  assert.equal(sys.historyCalls, 0);
});

test('test() shows a notification with the given title and body, and resolves when the system shows it', async () => {
  const { api } = setup(true);
  const pending = api.test({ title: 'Hydor', body: 'Works' });
  assert.equal(sys.made.length, 1);
  assert.deepEqual(last().options, { title: 'Hydor', body: 'Works' });
  last().emit('show', {});
  assert.deepEqual(await pending, { ok: true, error: '' });
});

test('test() resolves with what the system said when it fails to show it', async () => {
  const { api } = setup(true);
  const pending = api.test({ title: 'Hydor', body: 'Works' });
  last().emit('failed', {}, 'Notifications are turned off');
  assert.deepEqual(await pending, { ok: false, error: 'Notifications are turned off' });
});

test('clicking a test notification opens the window', async () => {
  const { api, spies } = setup(true);
  const pending = api.test({ title: 'Hydor', body: 'Works' });
  last().emit('show', {});
  await pending;
  last().emit('click', {});
  assert.equal(spies.appShown, 1);
});

test('test() where notifications are not supported resolves not ok, with no error, and makes none', async () => {
  const { api } = setup(true);
  sys.supported = false;
  assert.deepEqual(await api.test({ title: 'Hydor', body: 'Works' }), { ok: false, error: '' });
  assert.equal(sys.made.length, 0);
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').join('\n     ')}`);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
