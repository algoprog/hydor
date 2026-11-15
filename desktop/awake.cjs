// Keeping the computer awake while agents work and before scheduled tasks, for main.cjs. The server says when
// ({ type: 'awake', on }, server/awake.ts: Settings → General → Keep the computer awake) and the app holds one of
// Electron's power save blockers meanwhile, 'prevent-app-suspension': the computer does not go to sleep by itself (on
// a Mac an assertion against idle sleep, on Windows a power request that keeps the system running, on Linux an
// inhibitor asked of the desktop), but the screen may still turn off, and closing a laptop's lid still puts it to sleep.
// It lets go when the server says so, when the server exits (the next one says again) and when the app quits.
// server/desktop-awake-test.ts checks it with a stand-in for powerSaveBlocker.
'use strict';

/**
 * @param {object} o
 * @param {{ start(type: string): number, stop(id: number): unknown, isStarted(id: number): boolean }} o.powerSaveBlocker Electron's
 * @param {(...a: unknown[]) => void} [o.log] where it says what it did (main.cjs's trace)
 */
function createAwake({ powerSaveBlocker, log = () => {} }) {
  /** The blocker held now, by its id; null while the computer may sleep. */
  let id = null;

  const holding = () => {
    try {
      return id !== null && powerSaveBlocker.isStarted(id);
    } catch {
      return false;
    }
  };

  function hold(why) {
    if (holding()) return;
    try {
      id = powerSaveBlocker.start('prevent-app-suspension');
      log('keeps the computer awake', why || '');
    } catch (e) {
      id = null;
      log('could not keep the computer awake', String(e));
    }
  }

  function release(why) {
    if (id === null) return;
    try {
      if (powerSaveBlocker.isStarted(id)) powerSaveBlocker.stop(id);
    } catch {}
    id = null;
    log('lets the computer sleep', why || '');
  }

  return {
    /** The server's word: { type: 'awake', on, why }. */
    onMessage(m) {
      if (!m || typeof m !== 'object') return;
      if (m.on === true) hold(m.why);
      else release(m.why);
    },
    hold,
    release,
    holding,
  };
}

module.exports = { createAwake };
