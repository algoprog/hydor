// What the desktop app's window gives its page beyond what a browser does, and nothing more: the path on this computer
// of a file dropped on the page (Electron's webUtils.getPathForFile), so that the Library moves a file dragged in from
// Finder, Explorer or a file manager into its place instead of uploading a copy (web/src/features/pages/uploads.ts);
// and the notices the app shows as the system's own notifications (main.cjs): those the system did not show, for the
// page to show inside the app, the page a click on one opens, whether the system shows them, a test one, and the
// system's settings where you allow them (web/src/lib/notify.ts).
// Only the app's own pages, from the server on this computer (its loopback address), get it: a page of another machine
// the window shows (the Machines feature, /m/<id>/…, which this server forwards) is told apart by the page itself, and
// uploads as a browser does. The page runs isolated from this script (contextIsolation, sandbox): it sees these functions.
//
// `browser` (desktop/browser.cjs): the app's own browser. Your own tabs are real pages the window shows where the page asks
// (show, hide, focus); an agent's tab is drawn off screen, and its frames come here (watch), and your clicks and keys go
// back to it as real input (input, edit). popup and onBadge are the extensions' toolbar, onKey the shortcuts a page you
// use would otherwise keep to itself, showFile the system's file manager.
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const own = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(location.origin);

/** Who watches which agent's tab in this page: one message listener for all, and the main process hears of the first and the last. */
const watchers = new Map();
if (own) {
  ipcRenderer.on('hydor:browser-frame', (_e, f) => {
    const set = watchers.get(f && f.target);
    if (!set) return;
    // A copy the page owns (the bytes arrive as a view of a larger buffer).
    const jpeg = f.jpeg.buffer.slice(f.jpeg.byteOffset, f.jpeg.byteOffset + f.jpeg.byteLength);
    for (const w of [...set]) {
      try {
        w.onFrame({ jpeg, w: f.w, h: f.h });
      } catch {}
    }
    ipcRenderer.send('hydor:browser-frame-ack', f.target);
  });
  ipcRenderer.on('hydor:browser-cursor', (_e, c) => {
    for (const w of [...(watchers.get(c && c.target) || [])]) {
      try {
        if (w.onCursor) w.onCursor(String(c.cursor));
      } catch {}
    }
  });
}
const rectOf = (r) => ({ x: Number(r && r.x) || 0, y: Number(r && r.y) || 0, w: Number(r && r.w) || 0, h: Number(r && r.h) || 0 });

if (own) {
  contextBridge.exposeInMainWorld('hydorDesktop', {
    /** Choose a local folder through the operating system's dialog. */
    chooseFolder: (current) => ipcRenderer.invoke('hydor:choose-folder', String(current || '')),
    /** A dropped file's path on this computer, or '' (a file made in the page, or one the system gave no path for). */
    pathOf: (file) => {
      try {
        return webUtils.getPathForFile(file) || '';
      } catch {
        return '';
      }
    },
    /**
     * The app shows each notice (a session finished, failed or needs you) as the system's own notification: `show` gets
     * those the system did not show, to show inside the app, and `open` the page of the app a click on one opens.
     */
    onNotices: (show, open) => {
      ipcRenderer.on('hydor:notice', (_e, n) => show(n));
      ipcRenderer.on('hydor:open', (_e, at) => open(String(at)));
    },
    /** Whether the system shows them: { shows: null (none yet), true or false, error: what it said when it did not }. */
    notices: () => ipcRenderer.invoke('hydor:notices'),
    /** A notification to try them: { ok, error } once the system showed it or said why not. */
    testNotice: (title, body) => ipcRenderer.invoke('hydor:notice-test', { title: String(title), body: String(body) }),
    /** Opens the system's settings where you allow the app's notifications (a Mac's, Windows'): whether it could. */
    noticeSettings: () => ipcRenderer.invoke('hydor:notice-settings'),
    browser: {
      /** Your own tab's page over this place of the window (CSS pixels of this page); false when it is not one of the app's own tabs. */
      show: (target, rect) => ipcRenderer.invoke('hydor:browser-show', { target: String(target), rect: rectOf(rect) }),
      /** Takes a page away (all of them without a target). */
      hide: (target) => ipcRenderer.invoke('hydor:browser-hide', target ? String(target) : null),
      focus: (target) => ipcRenderer.invoke('hydor:browser-focus', String(target)),
      /**
       * An agent's tab as frames: onFrame({ jpeg: ArrayBuffer, w, h }) about 30 a second, one at once (w, h the page's size in
       * CSS pixels), onCursor(css cursor). Resolves to a function that stops them, or null when it is not an agent's tab here.
       */
      watch: async (target, onFrame, onCursor) => {
        target = String(target);
        const ok = await ipcRenderer.invoke('hydor:browser-watch', { target, on: true });
        if (!ok) return null;
        const w = { onFrame, onCursor };
        let set = watchers.get(target);
        if (!set) watchers.set(target, (set = new Set()));
        set.add(w);
        // The listener is up: the first frame and the cursor may come.
        ipcRenderer.send('hydor:browser-frame-ack', target);
        return () => {
          if (!set.delete(w) || set.size) return;
          watchers.delete(target);
          void ipcRenderer.invoke('hydor:browser-watch', { target, on: false }).catch(() => {});
        };
      },
      /** Your clicks, wheel, keys and text (shared/browser.ts BrowserInput) as real input; the server hears that you drive that tab. */
      input: (target, events) => ipcRenderer.invoke('hydor:browser-input', { target: String(target), events }),
      edit: (target, op) => ipcRenderer.invoke('hydor:browser-edit', { target: String(target), op: String(op) }),
      /** An extension's toolbar popup, opened under this place. */
      popup: (extensionId, rect) => ipcRenderer.invoke('hydor:browser-popup', { extension: String(extensionId), rect: rectOf(rect) }),
      /** An extension's badge or title changed. */
      onBadge: (fn) => void ipcRenderer.on('hydor:browser-badge', (_e, b) => fn(b)),
      /** The shortcuts your own tabs keep from their pages (Ctrl or ⌘ with T, W, L, R, F; F5; Alt with the arrows). */
      onKey: (fn) => void ipcRenderer.on('hydor:browser-key', (_e, k) => fn(k)),
      /** Shows a downloaded file in the system's file manager (a file in your home folder). */
      showFile: (path) => ipcRenderer.invoke('hydor:browser-show-file', String(path)),
    },
  });
}
