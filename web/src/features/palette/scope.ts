// Where the search box looks (Search in, beside its field): everywhere, or only the places picked. Kept by the
// server for every device (server/find), and in this browser too, so the box opens that way at once; a change
// made on another device, or by an agent, arrives as the server's news.
import { create } from 'zustand';
import { findPlaces, type FindPlace } from '@shared/find';
import { api, put } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';

const KEY = 'wa.find.scope';

function saved(): FindPlace[] {
  try {
    return findPlaces(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export const useFindScope = create<{ places: FindPlace[] }>(() => ({ places: saved() }));

function keep(places: FindPlace[]) {
  if (places.join() === useFindScope.getState().places.join()) return;
  useFindScope.setState({ places });
  try {
    localStorage.setItem(KEY, JSON.stringify(places));
  } catch {}
}

let timer: ReturnType<typeof setTimeout> | undefined;
let waiting = false;
let sending = 0;
/** A pick is on its way to the server: what the server says meanwhile is older. */
const busy = () => waiting || sending > 0;

/** Looks only in these places (none: everywhere), here at once and on every device a moment later. */
export function setScope(places: FindPlace[]) {
  keep(findPlaces(places));
  waiting = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    waiting = false;
    sending++;
    put('/api/find/scope', { in: useFindScope.getState().places })
      .catch(() => {})
      .finally(() => sending--);
  }, 400);
}

let listening = false;
/** Reads what the server keeps (when the app starts), and follows its changes. */
export function loadScope() {
  if (!listening) {
    listening = true;
    onFeatureEvent('find', (e) => {
      const p = (e.data as { in?: unknown } | undefined)?.in;
      if (!busy() && Array.isArray(p)) keep(findPlaces(p));
    });
  }
  api<{ in: FindPlace[] }>('/api/find/scope')
    .then((r) => !busy() && keep(findPlaces(r.in)))
    .catch(() => {});
}
