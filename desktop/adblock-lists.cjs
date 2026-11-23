// The filter lists of the ad blocker (adblock.cjs), kept as files in the app's data folder: lists/<id>.txt is the list as it was
// fetched (its `!#include` lines already resolved), lists/<id>.json says when, from where, and when to fetch it again. Nothing here
// knows Electron or the blocker's engine, so a check can run it with a fetch of its own.
//
//   - A list has several addresses (mirrors of the same list, in order of preference): the first that answers is used. A
//     mirror that answers with a page instead of a list (a "not found" page, a captive portal) is not an answer.
//   - A list says when it wants to be fetched again, in its `! Expires: 8 hours` line (uBlock's quick fixes say that: its YouTube
//     fixes change daily; EasyList says 4 days). That is kept between 6 hours and 7 days, and 4 days when a list says nothing.
//     A fetch that finds the list unchanged (the server says so by its ETag or date, or the text is the same) only renews that.
//   - `!#include file` lines are put in place: the file is looked for next to the list (the same folder; a name with a slash or a
//     `..` is ignored), and a file that includes itself, or goes too deep, stops there. uBlock's own CDN copies come resolved already.
//   - Without a network, or when no mirror answers, the copy on disk stays in use (and is tried again by the hourly look).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const HOUR = 3600 * 1000;
const MIN_EXPIRES = 6 * HOUR;
const MAX_EXPIRES = 7 * 24 * HOUR;
const DEFAULT_EXPIRES = 4 * 24 * HOUR;
/** uBlock's resources (scriptlets and the stand-ins of $redirect) as Ghostery ships them; they change slowly. */
const RESOURCES_URL = 'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/resources.json';
const RESOURCES_EXPIRES = 7 * 24 * HOUR;
const FETCH_MS = 60_000;
const MAX_INCLUDE_DEPTH = 4;
/** How many lists are fetched at once. */
const PARALLEL = 5;

/** When a list wants to be fetched again, in ms: its `! Expires: 8 hours` (or days) line, between 6 hours and 7 days. */
function expiresOf(text) {
  // The line is in the list's header, so only its start is looked at.
  const m = /^!\s*Expires:\s*(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|d|day|days)?\b/im.exec(String(text).slice(0, 4096));
  if (!m) return DEFAULT_EXPIRES;
  const n = Number(m[1]);
  const unit = (m[2] || 'd').toLowerCase();
  const ms = n * (unit.startsWith('h') ? HOUR : 24 * HOUR);
  return Math.min(MAX_EXPIRES, Math.max(MIN_EXPIRES, Number.isFinite(ms) ? ms : DEFAULT_EXPIRES));
}

/** Whether what came back looks like a list and not a web page. */
const looksLikeList = (text) => text.trim().length > 0 && !/^\s*<(!doctype|html|head|body)\b/i.test(text.slice(0, 512));

const safeId = (id) => String(id).replace(/[^\w.-]/g, '_');

/**
 * @param {object} o
 * @param {string} o.dir                        where the files are kept (made when needed)
 * @param {(url: string, init?: object) => Promise<Response>} [o.fetch]   `fetch` (looked up at each request, so a check can replace it)
 * @param {() => number} [o.now]
 * @param {(...what: any[]) => void} [o.log]
 */
function createListStore({ dir, fetch: fetchImpl, now = Date.now, log = () => {} }) {
  const listsDir = path.join(dir, 'lists');
  const get = (url, init = {}) => (fetchImpl || ((...a) => globalThis.fetch(...a)))(url, { ...init, signal: AbortSignal.timeout(FETCH_MS) });
  const metaCache = new Map();

  const textFile = (id) => path.join(listsDir, `${safeId(id)}.txt`);
  const metaFile = (id) => path.join(listsDir, `${safeId(id)}.json`);

  function write(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  }

  /** What is kept about a list (null when it was never fetched, or its copy is gone). */
  function info(id) {
    if (metaCache.has(id)) return metaCache.get(id);
    let m = null;
    try {
      m = JSON.parse(fs.readFileSync(metaFile(id), 'utf8'));
      if (!fs.existsSync(textFile(id))) m = null;
    } catch {
      m = null;
    }
    metaCache.set(id, m);
    return m;
  }

  /** Whether a list is missing or says it should be fetched again. */
  const due = (id) => {
    const m = info(id);
    return !m || now() >= m.fetchedAt + m.expires;
  };

  /** The text of a list's address with its includes in place; throws when a part cannot be had. */
  async function fetchText(url, depth, seen) {
    const res = await get(url);
    if (!res.ok) throw new Error(`${res.status} from ${url}`);
    return resolve(url, (await res.text()).replace(/\r\n?/g, '\n'), depth, seen);
  }

  async function resolve(url, text, depth, seen) {
    if (!/^!#include[ \t]/m.test(text)) return text;
    const out = [];
    for (const line of text.split('\n')) {
      const m = /^!#include[ \t]+(\S+)/.exec(line);
      if (!m) {
        out.push(line);
        continue;
      }
      const file = m[1];
      // Next to the list only, and each file once on the way down (a file that includes itself would never end).
      if (/[\\/]|\.\./.test(file) || depth >= MAX_INCLUDE_DEPTH) continue;
      const next = new URL(file, url).href;
      if (seen.has(next)) continue;
      out.push(await fetchText(next, depth + 1, new Set([...seen, next])));
    }
    return out.join('\n');
  }

  /**
   * Fetches a list from the first of its addresses that answers and keeps it. 'fetched' (new text), 'unchanged' (the same text
   * again: only its dates are renewed), or 'failed' (the copy on disk, if there is one, stays).
   * @param {{ id: string, urls: string[] }} list
   */
  async function refresh(list) {
    const had = info(list.id);
    let lastError = '';
    for (const url of list.urls || []) {
      try {
        // The server may say nothing changed (ETag, date): then nothing comes at all.
        const cond = {};
        // (not for a list with includes: a file it includes may change though its own text does not)
        if (had && had.url === url && !had.includes) {
          if (had.etag) cond['if-none-match'] = had.etag;
          else if (had.lastModified) cond['if-modified-since'] = had.lastModified;
        }
        const res = await get(url, Object.keys(cond).length ? { headers: cond } : {});
        const t = now();
        if (res.status === 304 && had) {
          write(metaFile(list.id), JSON.stringify({ ...had, fetchedAt: t }));
          metaCache.delete(list.id);
          return 'unchanged';
        }
        if (!res.ok) throw new Error(`${res.status} from ${url}`);
        const raw = (await res.text()).replace(/\r\n?/g, '\n');
        if (!looksLikeList(raw)) throw new Error(`${url} did not answer with a list`);
        const text = await resolve(url, raw, 0, new Set([url]));
        const includes = /^!#include[ \t]/m.test(raw);
        const hash = crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
        const meta = {
          id: list.id,
          url,
          fetchedAt: t,
          expires: expiresOf(text),
          etag: res.headers.get('etag') || undefined,
          lastModified: res.headers.get('last-modified') || undefined,
          hash,
          includes: includes || undefined,
          bytes: Buffer.byteLength(text),
        };
        const same = had && had.hash === hash;
        if (!same) write(textFile(list.id), text);
        write(metaFile(list.id), JSON.stringify(meta));
        metaCache.delete(list.id);
        return same ? 'unchanged' : 'fetched';
      } catch (e) {
        lastError = String((e && e.message) || e);
      }
    }
    log('a filter list could not be fetched', list.id, lastError);
    return 'failed';
  }

  /**
   * Fetches the lists that are due (all of them with `force`), a few at a time. { fetched, unchanged, failed } are the ids of each
   * kind; `fetched` is what changed, so the engine is made again only when it is not empty.
   */
  async function sync(lists, { force = false } = {}) {
    const todo = lists.filter((l) => force || due(l.id));
    const result = { fetched: [], unchanged: [], failed: [] };
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const l = todo[next++];
        result[await refresh(l)].push(l.id);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
    return result;
  }

  // ---- uBlock's resources: one file, fetched like a list that expires in a week ----------------------------------------------

  const resFile = path.join(dir, 'resources.json');
  const resMeta = path.join(dir, 'resources.meta.json');
  const resources = {
    file: resFile,
    info() {
      try {
        const m = JSON.parse(fs.readFileSync(resMeta, 'utf8'));
        return fs.existsSync(resFile) ? m : null;
      } catch {
        return null;
      }
    },
    due() {
      const m = resources.info();
      return !m || now() >= m.fetchedAt + RESOURCES_EXPIRES;
    },
    /** 'fetched', 'unchanged' or 'failed'. */
    async refresh(url = RESOURCES_URL) {
      try {
        const res = await get(url);
        if (!res.ok) throw new Error(`${res.status} from ${url}`);
        const text = await res.text();
        JSON.parse(text);
        const had = resources.info();
        const hash = crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
        if (!had || had.hash !== hash) write(resFile, text);
        write(resMeta, JSON.stringify({ fetchedAt: now(), hash }));
        return had && had.hash === hash ? 'unchanged' : 'fetched';
      } catch (e) {
        log('uBlock’s resources could not be fetched', String((e && e.message) || e));
        return 'failed';
      }
    },
  };

  return {
    dir,
    info,
    due,
    textFile,
    refresh,
    sync,
    resources,
    /** The ids kept on disk but not in `keep`: their files are removed (a list the settings no longer use). */
    prune(keep) {
      const want = new Set(keep.map((id) => safeId(id)));
      let names = [];
      try {
        names = fs.readdirSync(listsDir);
      } catch {}
      for (const n of names) {
        const id = n.replace(/\.(txt|json)$/, '');
        if (!want.has(id)) fs.rmSync(path.join(listsDir, n), { force: true });
      }
    },
  };
}

module.exports = { createListStore, expiresOf, looksLikeList, MIN_EXPIRES, MAX_EXPIRES, DEFAULT_EXPIRES, RESOURCES_URL };
