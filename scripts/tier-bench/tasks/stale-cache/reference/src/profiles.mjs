// A cache in front of the profile database.
//
//   const profiles = createProfiles({ db });
//   await profiles.get('ann.lee@example.com');            // the profile, from the cache when it is fresh
//   await profiles.update('ann.lee@example.com', { name: 'Ann' });
//   profiles.stats();                                      // { hits, misses, loads }
//
// `db` has getProfile(id) and saveProfile(id, profile), both async. `ttlMs` is how long a profile that was read
// stays in the cache and `now` is the clock (milliseconds), so that tests can move time.
//
// A profile is read from the database at most once per TTL however many callers ask for it at the same time:
// callers that arrive while a read is under way share it.
export function createProfiles({ db, ttlMs = 300_000, now = Date.now }) {
  const cache = new Map(); // key -> { value, at }
  const loading = new Map(); // key -> the promise of the read that is under way
  const versions = new Map(); // key -> how many updates of it have finished
  let hits = 0;
  let misses = 0;
  let loads = 0;

  // Profiles are keyed by e-mail address, which people type with capitals and stray spaces.
  function key(id) {
    return String(id).trim().toLowerCase();
  }

  function fresh(entry) {
    return entry !== undefined && now() - entry.at < ttlMs;
  }

  function versionOf(k) {
    return versions.get(k) ?? 0;
  }

  // Starts a read from the database and keeps its promise for the callers that arrive meanwhile.
  // A read that began before an update of the same profile may still be showing the old one when it ends: it
  // answers the callers that were waiting for it but is not kept, and it does not touch a newer read's entry.
  function load(k, id) {
    loads++;
    const version = versionOf(k);
    const finish = () => {
      if (loading.get(k) === promise) loading.delete(k);
    };
    const promise = db.getProfile(id).then(
      (profile) => {
        finish();
        if (versionOf(k) === version) cache.set(k, { value: profile, at: now() });
        return profile;
      },
      (error) => {
        finish();
        throw error;
      },
    );
    loading.set(k, promise);
    return promise;
  }

  // The profile of `id`: from the cache while it is fresh, else from the database.
  async function get(id) {
    const k = key(id);
    const entry = cache.get(k);
    if (fresh(entry)) {
      hits++;
      return entry.value;
    }
    misses++;
    return loading.get(k) ?? load(k, id);
  }

  // Merges `changes` into the stored profile, saves it and makes sure the next get() sees it.
  // Resolves with the new profile.
  async function update(id, changes) {
    const k = key(id);
    const current = await db.getProfile(id);
    const next = { ...current, ...changes };
    try {
      await db.saveProfile(id, next);
    } finally {
      // Whatever was read before this point, cached or still under way, may not have the saved profile.
      versions.set(k, versionOf(k) + 1);
      cache.delete(k);
      loading.delete(k);
    }
    return next;
  }

  function stats() {
    return { hits, misses, loads };
  }

  return { get, update, stats };
}
