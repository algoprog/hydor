// What the desktop app's window gives its page beyond what a browser does, and nothing more: the path on this computer
// of a file dropped on the page (Electron's webUtils.getPathForFile), so that the Library moves a file dragged in from
// Finder, Explorer or a file manager into its place instead of uploading a copy (web/src/features/pages/uploads.ts);
// and the notices the app shows as the system's own notifications (main.cjs): those the system did not show, for the
// page to show inside the app, the page a click on one opens, whether the system shows them, a test one, and the
// system's settings where you allow them (web/src/lib/notify.ts).
// Only the app's own pages, from the server on this computer (its loopback address), get it: a page of another machine
// the window shows (the Machines feature, /m/<id>/…, which this server forwards) is told apart by the page itself, and
// uploads as a browser does. The page runs isolated from this script (contextIsolation, sandbox): it sees one function.
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const own = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(location.origin);

if (own) {
  contextBridge.exposeInMainWorld('hydorDesktop', {
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
  });
}
