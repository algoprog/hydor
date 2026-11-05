// What the desktop app's window gives its page beyond what a browser does, and nothing more: the path on this computer
// of a file dropped on the page (Electron's webUtils.getPathForFile), so that the Library moves a file dragged in from
// Finder, Explorer or a file manager into its place instead of uploading a copy (web/src/features/pages/uploads.ts).
// Only the app's own pages, from the server on this computer (its loopback address), get it: a page of another machine
// the window shows (the Machines feature, /m/<id>/…, which this server forwards) is told apart by the page itself, and
// uploads as a browser does. The page runs isolated from this script (contextIsolation, sandbox): it sees one function.
'use strict';
const { contextBridge, webUtils } = require('electron');

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
  });
}
