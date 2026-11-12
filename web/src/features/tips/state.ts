// The tips' state as the server keeps it (server/tips): on or off, and which were shown, the same on every device.
// Changes made here show at once and go to the server one after another; what another device or an agent changes
// arrives as the server's news. Another machine's pages use this server's, as they do the tour.
import { create } from 'zustand';
import { isCostlyMode, isTipId, type CostlyMode, type TipId, type TipsState } from '@shared/tips';
import { api, put } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { ownLive } from '../../lib/ws';

export const useTips = create<TipsState & { loaded: boolean }>(() => ({ on: true, seen: [], tour: 0, explained: [], loaded: false }));

/** Changes on their way to the server: what it says meanwhile is older. */
let sending = 0;
let queue: Promise<unknown> = Promise.resolve();

function heard(v: unknown, mine = false) {
  if (sending && !mine) return;
  const s = v as Partial<TipsState> | undefined;
  if (!s || typeof s.on !== 'boolean' || !Array.isArray(s.seen)) return;
  const explained = Array.isArray(s.explained) ? s.explained.filter(isCostlyMode) : [];
  useTips.setState({ on: s.on, seen: s.seen.filter(isTipId), tour: Math.max(Number(s.tour) || 0, useTips.getState().tour), explained, loaded: true });
}

function send(body: { on?: boolean; seen?: TipId[]; explained?: CostlyMode[] }) {
  sending++;
  queue = queue
    .then(() => put<TipsState>('/api/tips', body))
    .then(
      (r) => sending === 1 && heard(r, true),
      () => {},
    )
    .finally(() => sending--);
}

let listening = false;
/** Reads what the server keeps, and follows its changes. */
export function loadTips() {
  if (!listening) {
    listening = true;
    // On another machine's pages this server's news comes on its own socket; the shown machine's is not ours.
    if (ownLive) ownLive.on((e) => e.t === 'feature' && e.id === 'tips' && heard(e.data));
    else onFeatureEvent('tips', (e) => heard(e.data));
  }
  api<TipsState>('/api/tips').then(
    (r) => heard(r),
    () => {},
  );
}

/** A tip was shown: it does not come again, here or on another device. */
export function tipSeen(id: TipId) {
  const s = useTips.getState();
  if (!s.seen.includes(id)) useTips.setState({ seen: [...s.seen, id] });
  send({ seen: [id] });
}

/** A costly mode was explained: its explanation does not come again, here or on another device. */
export function modeExplained(mode: CostlyMode) {
  const s = useTips.getState();
  if (!s.explained.includes(mode)) useTips.setState({ explained: [...s.explained, mode] });
  send({ explained: [mode] });
}

/** Turns the tips on or off, on every device. */
export function setTipsOn(on: boolean) {
  useTips.setState({ on });
  send({ on });
}

/** The welcome tour was finished, closed or skipped (at this version): tips may come now, or, given, are turned on or off. */
export function tourDone(version: number, tips?: boolean) {
  useTips.setState((s) => ({ tour: Math.max(s.tour, version) }));
  if (tips !== undefined) setTipsOn(tips);
}
