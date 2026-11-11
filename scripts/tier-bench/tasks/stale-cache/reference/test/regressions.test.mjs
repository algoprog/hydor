import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfiles } from '../src/profiles.mjs';
import { renderProfilePage } from '../src/pages.mjs';

const flush = async () => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
};

// A database whose calls wait until the test lets them finish. A read sees the profile as it was when it started.
function setup() {
  const rows = new Map([['ann.lee@example.com', { email: 'ann.lee@example.com', name: 'Ann Lee', bio: '' }]]);
  const norm = (id) => id.trim().toLowerCase();
  const reads = [];
  const saves = [];
  const db = {
    getProfile(id) {
      const seen = { ...rows.get(norm(id)) };
      return new Promise((resolve, reject) => reads.push({ resolve: () => resolve({ ...seen }), reject }));
    },
    saveProfile(id, profile) {
      return new Promise((resolve, reject) =>
        saves.push({ resolve: () => (rows.set(norm(id), { ...profile }), resolve()), reject }),
      );
    },
  };
  const profiles = createProfiles({ db, ttlMs: 1000, now: () => 0 });
  // Runs an update to the end, letting its own read and save through.
  async function update(id, changes) {
    const done = profiles.update(id, changes);
    await flush();
    reads.pop().resolve();
    await flush();
    saves.pop().resolve();
    return done;
  }
  return { rows, reads, saves, profiles, update };
}

test('a read that began before an update does not fill the cache with the old profile', async () => {
  const { reads, profiles, update } = setup();
  const old = profiles.get('ann.lee@example.com');
  await flush();
  const oldRead = reads.pop();
  await update('ann.lee@example.com', { name: 'Ann' });
  const fresh = profiles.get('ann.lee@example.com');
  await flush();
  assert.equal(reads.length, 1, 'a get after the update starts its own read');
  reads.pop().resolve();
  assert.equal((await fresh).name, 'Ann');
  oldRead.resolve();
  assert.equal((await old).name, 'Ann Lee');
  assert.equal((await profiles.get('ann.lee@example.com')).name, 'Ann');
});

test('an old read finishing does not break the sharing of a newer one', async () => {
  const { reads, profiles, update } = setup();
  const old = profiles.get('ann.lee@example.com');
  await flush();
  const oldRead = reads.pop();
  await update('ann.lee@example.com', { name: 'Ann' });
  const first = profiles.get('ann.lee@example.com');
  await flush();
  oldRead.resolve();
  await old;
  const second = profiles.get('ann.lee@example.com');
  await flush();
  assert.equal(reads.length, 1);
  reads.pop().resolve();
  assert.equal((await first).name, 'Ann');
  assert.equal((await second).name, 'Ann');
});

test('update drops the entry however the address is written', async () => {
  const { reads, profiles, update } = setup();
  const first = profiles.get('Ann.Lee@Example.com');
  await flush();
  reads.pop().resolve();
  await first;
  await update('ann.lee@example.com', { name: 'Ann' });
  const again = profiles.get(' ANN.LEE@example.com ');
  await flush();
  reads.pop().resolve();
  assert.equal((await again).name, 'Ann');
});

test('a failed read is not kept', async () => {
  const { reads, profiles } = setup();
  const failing = [profiles.get('ann.lee@example.com'), profiles.get('ann.lee@example.com')];
  const rejected = Promise.allSettled(failing);
  await flush();
  assert.equal(reads.length, 1);
  reads.pop().reject(new Error('db hiccup'));
  assert.ok((await rejected).every((r) => r.status === 'rejected'));
  const next = profiles.get('ann.lee@example.com');
  await flush();
  reads.pop().resolve();
  assert.equal((await next).name, 'Ann Lee');
});

test('a page leaves the cached profile alone', async () => {
  const { reads, profiles } = setup();
  const render = () => renderProfilePage(profiles, ' Ann.Lee@example.com', 'ann.lee@example.com');
  const first = render();
  await flush();
  reads.pop().resolve();
  assert.equal((await first).match(/\(you\)/g).length, 1);
  assert.equal((await render()).match(/\(you\)/g).length, 1);
  assert.equal((await profiles.get('ann.lee@example.com')).name, 'Ann Lee');
  assert.ok(!(await renderProfilePage(profiles, 'bob@example.com', 'ann.lee@example.com')).includes('(you)'));
});
