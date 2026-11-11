import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfiles } from '../src/profiles.mjs';

const ID = 'ann.lee@example.com';

// A database that counts its reads, with a clock the tests can move.
function setup() {
  const rows = new Map([[ID, { email: ID, name: 'Ann Lee', bio: 'Likes boats.' }]]);
  const clock = { t: 0 };
  const db = {
    reads: 0,
    async getProfile(id) {
      db.reads++;
      await new Promise((resolve) => setImmediate(resolve));
      return { ...rows.get(id.trim().toLowerCase()) };
    },
    async saveProfile(id, profile) {
      await new Promise((resolve) => setImmediate(resolve));
      rows.set(id.trim().toLowerCase(), { ...profile });
    },
  };
  const profiles = createProfiles({ db, ttlMs: 1000, now: () => clock.t });
  return { rows, clock, db, profiles };
}

test('a second get within the TTL comes from the cache', async () => {
  const { db, profiles } = setup();
  assert.equal((await profiles.get(ID)).name, 'Ann Lee');
  assert.equal((await profiles.get(ID)).name, 'Ann Lee');
  assert.equal(db.reads, 1);
  assert.deepEqual(profiles.stats(), { hits: 1, misses: 1, loads: 1 });
});

test('concurrent gets share one read', async () => {
  const { db, profiles } = setup();
  const all = await Promise.all(Array.from({ length: 20 }, () => profiles.get(ID)));
  assert.equal(db.reads, 1);
  assert.ok(all.every((p) => p.name === 'Ann Lee'));
});

test('a profile is read again after the TTL', async () => {
  const { rows, clock, db, profiles } = setup();
  await profiles.get(ID);
  rows.set(ID, { ...rows.get(ID), name: 'Ann' });
  clock.t = 999;
  assert.equal((await profiles.get(ID)).name, 'Ann Lee');
  clock.t = 1001;
  assert.equal((await profiles.get(ID)).name, 'Ann');
  assert.equal(db.reads, 2);
});

test('update, then get, shows the new profile', async () => {
  const { db, profiles } = setup();
  await profiles.get(ID);
  const saved = await profiles.update(ID, { name: 'Ann L.' });
  assert.equal(saved.name, 'Ann L.');
  assert.equal(saved.bio, 'Likes boats.');
  assert.equal((await profiles.get(ID)).name, 'Ann L.');
  assert.equal(db.reads, 3);
});
