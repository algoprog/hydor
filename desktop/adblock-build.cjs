// How the ad blocker's engine is made from its lists (adblock.cjs calls it). Making an engine from ~200,000 rules takes a few
// seconds of the processor, which in the app's main process would freeze every window, so `buildEngine` runs in a worker thread:
// adblock.cjs gives the worker this function's own source text (`workerSource`), which is why it must not use anything outside
// itself but what it is given and Node's own modules. A check calls it in the same process.
//
// What it does, and why:
//   - Each list is parsed on its own and the results are put into one engine (as Ghostery's own merge does): an `!#if` a list
//     never closes cannot reach into the next list.
//   - Preprocessor lines (`!#if env_chromium … !#else … !#endif`) are evaluated for a Chromium that runs uBlock's lists without
//     its HTML filtering (the tokens in `input.env`): Firefox-only rules (some of uBlock's YouTube fixes) stay out.
//   - uBlock honours its `trusted-*` scriptlets (they can set cookies and storage and click for you) only from its own lists, and
//     so does this: the lines of the others that call one are dropped (`input.lists[i].trusted`).
//   - The engine keeps one set of excluded rules by their ids, so a rule that a list has inside a branch that does not apply (a
//     Firefox-only one) and another list, or the same list, has where it does apply, would be left out of both. Those are put
//     back (measured with the default lists: 2 of the 629 excluded rules).
//   - The privacy lists (EasyPrivacy, uBlock's privacy list) tell trackers from ads: the ids of their blocking rules, and the hosts
//     of those that are a whole host (`||host^`), are kept apart (`trackerIds`, `trackerHosts`), since the optimizer fuses rules
//     of the engine into new ones whose ids are not the lists' (the host is the way back for those).
//   - The result is the engine as bytes (`FiltersEngine.serialize`), for the main process to load with `deserialize`.
'use strict';

/**
 * @param {object} lib      @ghostery/adblocker (its CommonJS build)
 * @param {{ lists: { id: string, file: string, trusted: boolean, privacy: boolean }[], resources: string | null, env: [string, boolean][], config: object }} input
 *        `file`s are the saved lists; `resources` is uBlock's resources file (or null)
 * @returns {{ bytes: Uint8Array, rules: number, trackerIds: number[], trackerHosts: string[], ms: number }}
 */
function buildEngine(lib, input) {
  const fs = require('node:fs');
  const started = Date.now();
  const config = new lib.Config(input.config);
  const network = new Map();
  const cosmetic = new Map();
  const conditions = new Map();
  const trackerIds = new Set();
  const trackerHosts = new Set();
  const env = new Map(input.env);
  /** Ids of rules that apply somewhere: outside any `!#if`, or inside one whose condition holds. */
  const applies = new Set();
  for (const list of input.lists) {
    let text = fs.readFileSync(list.file, 'utf8');
    if (!list.trusted) text = text.split('\n').filter((line) => !/#\??#\+js\(\s*trusted-/.test(line)).join('\n');
    const parsed = lib.parseFilters(text, config);
    for (const f of parsed.networkFilters) {
      const id = f.getId();
      network.set(id, f);
      if (list.privacy && !f.isException() && !f.isCSP()) {
        trackerIds.add(id);
        // Only a rule for a whole host says that host is a tracker (`||host^`, not `||host/path`).
        if (f.isHostnameAnchor() && f.hostname && !f.filter) trackerHosts.add(f.hostname);
      }
    }
    for (const f of parsed.cosmeticFilters) cosmetic.set(f.getId(), f);
    const inBranch = new Set();
    for (const p of parsed.preprocessors) {
      const holds = lib.evaluatePreprocessor(p.condition, env);
      for (const id of p.filterIDs) {
        inBranch.add(id);
        if (holds) applies.add(id);
      }
    }
    for (const f of parsed.networkFilters) if (!inBranch.has(f.getId())) applies.add(f.getId());
    for (const f of parsed.cosmeticFilters) if (!inBranch.has(f.getId())) applies.add(f.getId());
    for (const p of parsed.preprocessors) {
      const had = conditions.get(p.condition);
      if (had) for (const id of p.filterIDs) had.filterIDs.add(id);
      else conditions.set(p.condition, new lib.Preprocessor({ condition: p.condition, filterIDs: new Set(p.filterIDs) }));
    }
  }
  const engine = new lib.FiltersEngine({ networkFilters: [...network.values()], cosmeticFilters: [...cosmetic.values()], preprocessors: [...conditions.values()], config });
  engine.updateEnv(env);
  for (const id of applies) engine.preprocessors.excluded.delete(id);
  if (input.resources) {
    const raw = fs.readFileSync(input.resources, 'utf8');
    engine.updateResources(raw, String(raw.length));
  }
  let rules = 0;
  for (const f of network.values()) if (!engine.isFilterExcluded(f)) rules++;
  for (const f of cosmetic.values()) if (!engine.isFilterExcluded(f)) rules++;
  // Only those of the rules in use are trackers.
  const ids = [...trackerIds].filter((id) => network.has(id) && !engine.isFilterExcluded(network.get(id)));
  return { bytes: engine.serialize(), rules, trackerIds: ids, trackerHosts: [...trackerHosts], ms: Date.now() - started };
}

/** What the worker runs: the function above, for the package at `workerData.libPath` and `workerData.input`. */
const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const buildEngine = (${buildEngine.toString()});
try {
  const r = buildEngine(require(workerData.libPath), workerData.input);
  parentPort.postMessage({ ok: true, ...r }, [r.bytes.buffer]);
} catch (e) {
  parentPort.postMessage({ ok: false, error: String((e && e.stack) || e) });
}
`;

/** uBlock's tokens for a Chromium running its lists without HTML filtering (what `!#if` lines ask about). */
const ENV = [
  ['env_chromium', true],
  ['cap_user_stylesheet', true],
  ['ext_ublock', true],
  ['env_firefox', false],
  ['env_mobile', false],
  ['env_safari', false],
  ['env_edge', false],
  ['env_mv3', false],
  ['env_legacy', false],
  ['cap_html_filtering', false],
  ['cap_ipaddress', false],
  ['ext_ubol', false],
  ['ext_devbuild', false],
  ['adguard', false],
];

/** The engine's settings. HTML filtering is off: it needs the response body, which the browser's request hooks do not give. */
const CONFIG = {
  loadCosmeticFilters: true,
  loadNetworkFilters: true,
  loadExtendedSelectors: true,
  loadPreprocessors: true,
  enableMutationObserver: true,
  loadCSPFilters: true,
  loadGenericCosmeticsFilters: true,
  enableHtmlFiltering: false,
};

module.exports = { buildEngine, workerSource, ENV, CONFIG };
