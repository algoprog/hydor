// A session's notices (it finished, failed or needs you) as the system's own notifications, for main.cjs. The server
// sends each one ({ type: 'notice' }, server/desktop.ts) and the app shows it, even with its window closed; clicking it
// opens that session. None while the window is in front showing that session already. One the system does not show
// (not allowed in its settings) goes to the page in the window, which shows it inside the app (web/src/lib/notify.ts).
// A newer notice about a session takes the place of its older one. The last ones stay in Notification Center while the
// app keeps them (macOS takes a notification out when the app lets it go), and on a Mac those still there from before
// the app started open their session again when clicked. While the window is away (closed, hidden, minimised or behind
// another app), the app's icon counts the sessions with notices, whether the system shows them or keeps them quiet (Do
// Not Disturb, a Focus); the count goes when the window is in front again. server/desktop-notices-test.ts checks it
// with a stand-in for Electron's Notification.
'use strict';

/** How many sessions' notifications stay to click. */
const KEEP = 50;

/**
 * @param {object} o
 * @param {any} o.Notification Electron's
 * @param {boolean} o.mac
 * @param {() => string | null} o.front the path of the app's page the window shows while it is in front, else null
 * @param {(n: object) => void} o.inApp hands a notice to the window's page, to show inside the app
 * @param {(at: string) => void} o.open opens the window at a page of the app
 * @param {() => void} o.showApp opens the window
 * @param {(count: number) => void} [o.badge] puts the count on the app's icon (0: none)
 */
function createNotices({ Notification, mac, front, inApp, open, showApp, badge = () => {} }) {
  /** Whether the system shows the app's notifications: null before the first, then whether the last one showed. */
  let shows = null;
  /** What the system said when it did not show one ("Notifications are not allowed for this application"). */
  let error = '';
  /** The notification about each page a notice opens (its session's), oldest first. */
  const kept = new Map();
  /** Test notifications, kept until clicked or closed. */
  const tests = new Set();
  /** The pages (sessions) with notices since the window was last in front: the count on the app's icon. */
  const unseen = new Set();

  const seen = (ok, why = '') => {
    shows = ok;
    error = ok ? '' : String(why || '');
  };
  const letGo = (at, note) => {
    if (kept.get(at) === note) kept.delete(at);
  };
  /** Takes one away; one from before the app started (getHistory) goes only when asked by its id. */
  const dismiss = (note) => {
    try {
      note.close();
      if (mac && note.id && typeof Notification.remove === 'function') Notification.remove(note.id);
    } catch {}
  };
  const keep = (at, note) => {
    const old = kept.get(at);
    kept.delete(at);
    kept.set(at, note);
    if (old && old !== note) dismiss(old);
    for (const [k, n] of kept) {
      if (kept.size <= KEEP) break;
      kept.delete(k);
      dismiss(n);
    }
  };

  /** A notice from the server: { n (as the pages hear it), title, body, path (the page it opens) }. */
  function show(m) {
    if (!m || !m.n || typeof m.path !== 'string' || !m.path.startsWith('/')) return;
    const at = m.path;
    const shown = front();
    if (shown === at) return;
    if (shown === null && !unseen.has(at)) {
      unseen.add(at);
      try {
        badge(unseen.size);
      } catch {}
    }
    if (!Notification.isSupported()) return inApp(m.n);
    let note;
    try {
      // macOS stacks a session's notifications together in Notification Center.
      note = new Notification({ title: String(m.title || 'Hydor'), body: String(m.body || ''), ...(mac ? { groupId: at } : {}) });
    } catch (e) {
      seen(false, (e && e.message) || e);
      return inApp(m.n);
    }
    note.on('show', () => seen(true));
    note.on('failed', (_e, why) => {
      letGo(at, note);
      seen(false, why);
      inApp(m.n);
    });
    note.on('click', () => {
      letGo(at, note);
      open(at);
    });
    note.on('close', () => letGo(at, note));
    keep(at, note);
    note.show();
  }

  /**
   * macOS: the notifications still in Notification Center from before the app started open their session again when
   * clicked. Asking for them also has macOS ask, the first time, whether Hydor may show notifications, so that the
   * first notice does not wait on the answer.
   */
  function restore() {
    if (!mac || typeof Notification.getHistory !== 'function') return Promise.resolve();
    return Promise.resolve()
      .then(() => Notification.getHistory())
      .then(
        (list) => {
          for (const note of list || []) {
            const at = note.groupId;
            if (typeof at !== 'string' || !at.startsWith('/') || kept.has(at)) continue;
            kept.set(at, note);
            note.on('click', () => {
              letGo(at, note);
              open(at);
            });
            note.on('close', () => letGo(at, note));
          }
        },
        () => {},
      );
  }

  /** A notification to try them (Settings → Notifications): { ok, error } once the system showed it or said why not. */
  function test(t) {
    if (!Notification.isSupported()) return Promise.resolve({ ok: false, error: '' });
    return new Promise((resolve) => {
      const note = new Notification({ title: String((t && t.title) || 'Hydor'), body: String((t && t.body) || '') });
      tests.add(note);
      let timer = null;
      const done = (r) => {
        clearTimeout(timer);
        resolve(r);
      };
      // A system may say nothing either way (Linux).
      timer = setTimeout(() => done({ ok: shows !== false, error }), 10_000);
      note.on('show', () => {
        seen(true);
        done({ ok: true, error: '' });
      });
      note.on('failed', (_e, why) => {
        tests.delete(note);
        seen(false, why);
        done({ ok: false, error });
      });
      note.on('click', () => {
        tests.delete(note);
        showApp();
      });
      note.on('close', () => tests.delete(note));
      note.show();
    });
  }

  /** The window is in front: the count on the app's icon goes. */
  function inView() {
    if (!unseen.size) return;
    unseen.clear();
    try {
      badge(0);
    } catch {}
  }

  return { show, restore, test, inView, unseen: () => unseen.size, state: () => ({ shows, error }) };
}

module.exports = { createNotices, KEEP };
