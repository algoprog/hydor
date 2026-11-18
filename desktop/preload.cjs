// What the desktop app's window gives its page beyond what a browser does, and nothing more: the path on this computer
// of a file dropped on the page (Electron's webUtils.getPathForFile), so that the Library moves a file dragged in from
// Finder, Explorer or a file manager into its place instead of uploading a copy (web/src/features/pages/uploads.ts);
// and the notices the app shows as the system's own notifications (main.cjs): those the system did not show, for the
// page to show inside the app, the page a click on one opens, whether the system shows them, a test one, and the
// system's settings where you allow them (web/src/lib/notify.ts); and `reveal`, a file or folder shown in the system's file
// manager (desktop/reveal.cjs, web/src/lib/reveal.ts).
// Only the app's own pages, from the server on this computer (its loopback address), get it: a page of another machine
// the window shows (the Machines feature, /m/<id>/…, which this server forwards) is told apart by the page itself, and
// uploads as a browser does. The page runs isolated from this script (contextIsolation, sandbox): it sees these functions.
//
// `browser` (desktop/browser.cjs): the app's own browser. Your own tabs are real pages the window shows where the page asks
// (show, hide, focus); an agent's tab is drawn off screen, and its frames come here (watch), and your clicks and keys go
// back to it as real input (input, edit). popup and onBadge are the extensions' toolbar, onKey the shortcuts a page you
// use would otherwise keep to itself, showFile the system's file manager. What people expect of a browser for your own tabs:
// find (with its match count), zoom, print, mute, openExternal (the default browser), onTabState (a tab's sound, zoom,
// blocked ads and full screen as they change), onCommand (what the right-click menu asks of the app: ask an agent about
// the selection, bookmark the page), and onMenu and menuPick (the page draws that menu itself, in the app's own look).
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const own = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(location.origin);

/** Listens to a channel for one caller; the function it returns removes exactly that listener. */
function listen(channel, fn) {
  const h = (_e, v) => fn(v);
  ipcRenderer.on(channel, h);
  return () => void ipcRenderer.removeListener(channel, h);
}

/** Who draws your tabs' right-click menus in this page: one message listener for all, and the main process hears of the first and the last. */
const menuListeners = new Set();
if (own) {
  ipcRenderer.on('hydor:browser-menu', (_e, m) => {
    for (const fn of [...menuListeners]) {
      try {
        fn(m);
      } catch {}
    }
  });
}

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
    /** Shows a file or folder of this computer, selected in the system's file manager (Finder, File Explorer, the desktop's); whether it could (false: not there, or not a place on this computer). */
    reveal: (path) => ipcRenderer.invoke('hydor:reveal', String(path)),
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
      /** A picture of one of your tabs as it is now (a JPEG data URL, the size of its place) for where it is taken away for a moment; null when it is not shown. */
      still: (target) => ipcRenderer.invoke('hydor:browser-still', String(target)),
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
      onBadge: (fn) => listen('hydor:browser-badge', fn),
      /**
       * The shortcuts your own tabs keep from their pages: Ctrl or ⌘ with T, W, L, R, F, P, D, H, J and 1 to 9, Ctrl+Tab and
       * Ctrl+Shift+Tab, Ctrl or ⌘+Shift+T and Shift+Delete, F5, Alt with the arrows (⌘ with [ and ] on a Mac). Zoom is the app's own.
       */
      onKey: (fn) => listen('hydor:browser-key', fn),
      /** Find in one of your tabs ({ forward, findNext, matchCase }): { matches, active }; empty text stops it; null when it is not one of your tabs here. */
      find: (target, text, opts) => ipcRenderer.invoke('hydor:browser-find', { target: String(target), text: String(text || ''), opts: opts && typeof opts === 'object' ? { forward: opts.forward !== false, findNext: !!opts.findNext, matchCase: !!opts.matchCase } : {} }),
      /** Zoom ('in', 'out', 'reset', in Chrome's steps from 25 to 500 %): the factor after, 1 being 100 %. */
      zoom: (target, op) => ipcRenderer.invoke('hydor:browser-zoom', { target: String(target), op: String(op) }),
      /** The system's print dialog for the page. */
      print: (target) => ipcRenderer.invoke('hydor:browser-print', String(target)),
      /** Mutes or unmutes a tab. */
      mute: (target, muted) => ipcRenderer.invoke('hydor:browser-mute', { target: String(target), muted: !!muted }),
      /** An http or https address in the computer's default browser; whether it could. */
      openExternal: (url) => ipcRenderer.invoke('hydor:browser-open-external', String(url)),
      /** A tab's news as it changes ({ target, audible?, muted?, zoom?, blocked?, fullscreen? }); everything of a tab comes when it is shown. */
      onTabState: (fn) => listen('hydor:browser-tab-state', fn),
      /** What the right-click menu asks of the app: { cmd: 'ask', text, url } (ask an agent about the selection), { cmd: 'bookmark', url, title }, { cmd: 'later', url, title } (read later), { cmd: 'save-image' | 'ask-image', path, name, url, title } (a picture read into a file of this computer: keep it in the Library, or ask about it), { cmd: 'picture-failed', message }, { cmd: 'highlight', target, url, title } (mark the selection in that tab), { cmd: 'unhighlight', id, url }. */
      onCommand: (fn) => listen('hydor:browser-command', fn),
      /**
       * The right-click menu of one of your tabs, for this page to draw in the app's own look: { target, menu, x, y (the
       * point, in this page's pixels), items: [{ id, label, enabled, args? } or { type: 'separator' }], still (a picture of
       * the tab as it is, for its place while the menu lies over it) }. While anything listens, the system's menu does not show.
       */
      onMenu: (fn) => {
        menuListeners.add(fn);
        if (menuListeners.size === 1) ipcRenderer.send('hydor:browser-menus', true);
        return () => {
          if (!menuListeners.delete(fn) || menuListeners.size) return;
          ipcRenderer.send('hydor:browser-menus', false);
        };
      },
      /** What was picked in that menu (an item's id; null: it closed with nothing picked); whether it was done. */
      menuPick: (target, menu, item) => ipcRenderer.invoke('hydor:browser-menu-pick', { target: String(target), menu: Number(menu), item: item === null || item === undefined ? null : String(item) }),
      /** Shows a downloaded file in the system's file manager (a file in your home folder). */
      showFile: (path) => ipcRenderer.invoke('hydor:browser-show-file', String(path)),
    },
  });
}
