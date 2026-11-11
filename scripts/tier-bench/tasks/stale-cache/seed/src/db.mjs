// An in-memory stand-in for the profile database. Profiles are keyed by e-mail address; the database ignores
// capitals and stray spaces in the address. Every call takes a little while, like a real query over the network.
const delay = () => new Promise((resolve) => setTimeout(resolve, 1 + Math.random() * 20));
const norm = (id) => String(id).trim().toLowerCase();

export function createDb(initial = []) {
  const rows = new Map(initial.map((profile) => [norm(profile.email), { ...profile }]));

  return {
    // Resolves with a copy of the stored profile, or null when there is none.
    async getProfile(id) {
      const row = rows.get(norm(id));
      await delay();
      return row ? { ...row } : null;
    },

    // Stores the profile as it is given, replacing what was there.
    async saveProfile(id, profile) {
      await delay();
      rows.set(norm(id), { ...profile });
    },
  };
}
