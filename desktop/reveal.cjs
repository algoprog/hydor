// Shows a file or a folder of this computer in the system's file manager (Finder, File Explorer, the desktop's file
// manager), selected in the folder that holds it: what the app's "Show in Finder / File Explorer / folder" items ask for
// (web/src/lib/reveal.ts, through `window.hydorDesktop.reveal` in preload.cjs). It never opens or runs anything.
// Only the app's own pages on this computer ask (main.cjs's fromThisMachine: not a page of another machine, whose paths
// are not this computer's), for an absolute path that is there, anywhere on this computer, not a network path.
'use strict';
const { ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {object} o
 * @param {(e: import('electron').IpcMainInvokeEvent) => boolean} o.fromOwnPage  whether a message is from a page of the app on this computer
 * @param {(real: string) => void} [o.show]  what shows the item (the system's; a test's own)
 */
function createReveal({ fromOwnPage, show = (real) => shell.showItemInFolder(real) }) {
  /** Whether the file or folder was shown (false: refused, or not there). */
  function reveal(e, target) {
    if (!fromOwnPage(e) || typeof target !== 'string' || !target || !path.isAbsolute(target)) return false;
    // A Windows network path (\\server\share, //server/share) is another computer's, and opening it reaches out to it.
    if (/^[\\/]{2}/.test(target)) return false;
    try {
      const real = fs.realpathSync.native(target);
      if (/^[\\/]{2}/.test(real) && !/^[\\/]{2}[?.][\\/][A-Za-z]:/.test(real)) return false;
      fs.statSync(real);
      show(real);
      return true;
    } catch {
      return false;
    }
  }
  return {
    reveal,
    registerIpc() {
      ipcMain.handle('hydor:reveal', (e, target) => reveal(e, target));
    },
  };
}

module.exports = { createReveal };
