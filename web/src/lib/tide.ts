// The logo's water rises once when a session finishes while the app is open (Wordmark with tide, in the sidebar and on
// the pages that carry the logo): the same rise, wave and drain as under the pointer, about 2.6 seconds.
import { useEffect, useState } from 'react';
import { activityOf, isWorking } from './activity';
import { motionOn } from './motion';
import { useSessions } from './store';

/** How long the tide's class stays on: the rise (1.1 s), a moment up, and the drain (0.8 s, after the class is gone). */
const UP_MS = 1800;

/** Whether the water is up now because a session just finished: a top-level session (not a subagent) that was working and now is ready or done. */
export function useTideOnFinish(enabled: boolean): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const off = useSessions.subscribe((now, before) => {
      if (now.byKey === before.byKey || !motionOn() || document.hidden) return;
      for (const [key, s] of Object.entries(now.byKey)) {
        const was = before.byKey[key];
        if (!was || was === s || s.subagentOf) continue;
        const a = activityOf(s);
        if (!isWorking(activityOf(was)) || isWorking(a) || a?.status === 'waiting' || a?.status === 'stopping') continue;
        setUp(true);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setUp(false), UP_MS);
        return;
      }
    });
    return () => (off(), window.clearTimeout(timer));
  }, [enabled]);
  return up;
}
