// What the ad blocker has blocked, kept on this computer (<adblock folder>/stats.json) for the Browser's statistics page. Only
// counts: how many ads and trackers on each day (the last 400 days), the hosts blocked most, the sites where most was blocked,
// and a rough guess of the data that saved. A private tab counts in the totals and the days only: no host and no site of its is
// kept, so the file says nothing of where you went privately.
//
// The file is written a little after a change (at most every 30 seconds) and when the app closes. `site` is the top page's host
// without `www.`; days are local dates (YYYY-MM-DD). When the host and site tables pass 1,000 entries they are cut to the 500
// biggest, so the file stays small however long it runs.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const FLUSH_MS = 30_000;
const KEEP_DAYS = 400;
const SHOW_DAYS = 30;
const PRUNE_AT = 1000;
const PRUNE_TO = 500;

/**
 * What a blocked request would have weighed, on average, by what it was (Electron's resourceType): a guess for "data saved", not a
 * measurement (the request never goes out, so its size is not known).
 */
const BYTES = { script: 25_000, subFrame: 60_000, image: 12_000, media: 250_000, stylesheet: 10_000, font: 30_000, xhr: 3_000, ping: 500, other: 5_000 };
const bytesOf = (type) => BYTES[type] ?? BYTES.other;

const pad = (n) => String(n).padStart(2, '0');
/** A local date as YYYY-MM-DD. */
const dayOf = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * @param {object} o
 * @param {string} o.file
 * @param {(...what: any[]) => void} [o.log]
 * @param {() => number} [o.now]
 * @param {boolean} [o.timers]   write after a while by itself (off for checks, which call flush)
 */
function createStats({ file, log = () => {}, now = Date.now, timers = true }) {
  let s = fresh();
  function fresh() {
    return { since: 0, ads: 0, trackers: 0, bytes: 0, days: {}, hosts: {}, sites: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw && typeof raw === 'object') s = { ...fresh(), ...raw };
  } catch {
    // none yet, or one that cannot be read: it starts over
  }
  let dirty = false;
  let timer = null;

  function schedule() {
    dirty = true;
    if (!timers || timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, FLUSH_MS);
    timer.unref?.();
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    dirty = false;
    try {
      // Days older than the kept ones are dropped as it is written.
      const oldest = dayOf(now() - KEEP_DAYS * 24 * 3600 * 1000);
      for (const d of Object.keys(s.days)) if (d < oldest) delete s.days[d];
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(s));
      fs.renameSync(tmp, file);
    } catch (e) {
      dirty = true;
      log('the ad blocker’s statistics could not be saved', String((e && e.message) || e));
    }
  }

  /** Keeps the biggest PRUNE_TO of a table once it holds more than PRUNE_AT. */
  function prune(table, count) {
    const keys = Object.keys(table);
    if (keys.length <= PRUNE_AT) return;
    keys.sort((a, b) => count(table[b]) - count(table[a]));
    for (const k of keys.slice(PRUNE_TO)) delete table[k];
  }

  const top = (table, n, shape) =>
    Object.entries(table)
      .sort((a, b) => (shape.count(b[1]) - shape.count(a[1])) || (a[0] < b[0] ? -1 : 1))
      .slice(0, n)
      .map(([k, v]) => shape.out(k, v));

  return {
    /** One blocked request: { kind: 'ad' | 'tracker', host, site, type, private }. */
    record({ kind, host, site, type, private: isPrivate = false }) {
      const k = kind === 'tracker' ? 'trackers' : 'ads';
      const t = now();
      if (!s.since) s.since = t;
      s[k]++;
      s.bytes += bytesOf(type);
      const day = (s.days[dayOf(t)] ||= { ads: 0, trackers: 0 });
      day[k]++;
      if (!isPrivate) {
        if (host) {
          const h = (s.hosts[host] ||= { count: 0, kind: kind === 'tracker' ? 'tracker' : 'ad' });
          h.count++;
          prune(s.hosts, (v) => v.count);
        }
        if (site) {
          s.sites[site] = (s.sites[site] || 0) + 1;
          prune(s.sites, (v) => v);
        }
      }
      schedule();
    },
    /** The statistics page's numbers (shared/browser.ts AdblockStats); `lists` is the blocker's status(). */
    summary(lists = { updatedAt: null, rules: 0, ids: [], updating: false }) {
      const days = [];
      const base = new Date(now());
      for (let i = SHOW_DAYS - 1; i >= 0; i--) {
        // Local calendar days (not 24-hour steps, which skip or repeat one where the clocks change).
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
        const key = dayOf(d.getTime());
        const v = s.days[key];
        days.push({ day: key, ads: v ? v.ads : 0, trackers: v ? v.trackers : 0 });
      }
      return {
        since: s.since || now(),
        total: { ads: s.ads, trackers: s.trackers },
        bytes: s.bytes,
        days,
        hosts: top(s.hosts, 20, { count: (v) => v.count, out: (host, v) => ({ host, count: v.count, kind: v.kind }) }),
        sites: top(s.sites, 20, { count: (v) => v, out: (site, count) => ({ site, count }) }),
        lists,
      };
    },
    /** What was blocked on one site (0 when none: a private tab's pages leave nothing). */
    siteTotal: (site) => (site && s.sites[site]) || 0,
    /** Starts counting again from nothing. */
    reset() {
      s = fresh();
      s.since = now();
      schedule();
    },
    /** Forgets the sites (clearing the history does that); the totals, days and hosts stay. */
    forgetSites() {
      s.sites = {};
      schedule();
    },
    flush,
    close() {
      flush();
    },
  };
}

module.exports = { createStats, bytesOf, dayOf, BYTES };
