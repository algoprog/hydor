'use strict';
// One session's webRequest, shared by the ad blocker and the extensions.
//
// Electron keeps one handler for each webRequest event and session, and while a session has any handler of the app's,
// its pages' requests skip Chromium's own extension webRequest: an extension's chrome.webRequest listeners hear nothing
// (and its declarativeNetRequest rules do nothing). Measured with Electron 45.2.1: with the ad blocker on, a test
// extension listening to every request got none. So the ad blocker (adblock.cjs) puts its handlers here, through a stand-in
// for the session (`facade`), and while it has any, the extensions (extensions.cjs) are told of the requests from here
// too (`observe`, for the events they `want`). While the blocker has none (it is off), nothing of the extensions' goes on
// the session, and Chromium's own path serves them.
//
//   const hub = hubOf(ses);
//   blocker.enableBlockingInSession(hub.facade);   // webRequest.onBeforeRequest(filter, fn)… and the preload calls
//   const stop = hub.observe((event, details) => …); hub.want('extensions', new Set(['onSendHeaders']));

const EVENTS = ['onBeforeRequest', 'onBeforeSendHeaders', 'onSendHeaders', 'onHeadersReceived', 'onResponseStarted', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred'];
/** The events whose handlers answer (cancel, redirect, change headers): a callback comes with them. */
const ANSWERED = new Set(['onBeforeRequest', 'onBeforeSendHeaders', 'onHeadersReceived']);
const hubs = new WeakMap();

function hubOf(ses) {
  let h = hubs.get(ses);
  if (!h) hubs.set(ses, (h = makeHub(ses)));
  return h;
}

function makeHub(ses) {
  const handlers = new Map(); // event -> the blocker's handler
  const observers = new Set();
  const wanted = new Map(); // owner -> the events it wants
  const installed = new Set();

  const wants = (name) => [...wanted.values()].some((s) => s.has(name));

  function refresh() {
    const taken = handlers.size > 0;
    for (const name of EVENTS) {
      const need = handlers.has(name) || (taken && observers.size > 0 && wants(name));
      if (need === installed.has(name)) continue;
      try {
        if (need) {
          ses.webRequest[name]({ urls: ['<all_urls>'] }, ANSWERED.has(name) ? (d, cb) => handle(name, d, cb) : (d) => handle(name, d));
          installed.add(name);
        } else {
          ses.webRequest[name](null);
          installed.delete(name);
        }
      } catch {
        // a session that is going away
      }
    }
  }

  function handle(name, details, cb) {
    for (const fn of observers)
      try {
        fn(name, details);
      } catch {
        // an observer never holds up a request
      }
    const h = handlers.get(name);
    if (!cb) {
      if (h) h(details);
      return;
    }
    if (!h) return void cb({});
    let answered = false;
    const once = (r) => {
      if (answered) return;
      answered = true;
      cb(r || {});
    };
    try {
      h(details, once);
    } catch {
      once({});
    }
  }

  // Electron's webRequest calls: (filter, listener), (listener), or null to take the handler off.
  const webRequest = {};
  for (const name of EVENTS)
    webRequest[name] = (a, b) => {
      const fn = typeof a === 'function' ? a : typeof b === 'function' ? b : null;
      if (fn) handlers.set(name, fn);
      else handlers.delete(name);
      refresh();
    };
  const facade = {
    webRequest,
    registerPreloadScript: (o) => ses.registerPreloadScript(o),
    unregisterPreloadScript: (id) => ses.unregisterPreloadScript(id),
  };

  return {
    facade,
    /** fn(event, details) for each request event of the session the observers want, while the app has the session's requests. */
    observe(fn) {
      observers.add(fn);
      refresh();
      return () => {
        observers.delete(fn);
        refresh();
      };
    },
    /** The events an observer wants (Electron's names), all at once; an empty set or none takes them back. */
    want(owner, names) {
      if (names && names.size) wanted.set(owner, new Set(names));
      else wanted.delete(owner);
      refresh();
    },
    /** Whether the session's requests go through the app's handlers (and so skip Chromium's extension webRequest). */
    taken: () => handlers.size > 0,
  };
}

module.exports = { hubOf, EVENTS };
