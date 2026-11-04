// The sidebar's orders, as you drag them: its tools, and the groups of your projects and folders among the sessions.
// Kept by the server for every device (server/sidebar), and in this browser too, so the sidebar opens in it at once.
// A change made on another device, or by an agent, arrives as the server's news. Another machine's pages show this
// server's order, as they do its themes.
import { create } from 'zustand';
import { placeOrder, toolOrder, type SidebarTool } from '@shared/sidebar';
import { api, put } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { toastError } from '../../lib/store';
import { ownLive } from '../../lib/ws';

const KEY = 'wa.sidebar.tools';
const PLACES_KEY = 'wa.sidebar.places';

function saved<T>(key: string, read: (v: unknown) => T): T {
  try {
    return read(JSON.parse(localStorage.getItem(key) ?? '[]'));
  } catch {
    return read([]);
  }
}

/** The tools first to last, and the projects' and folders' groups as dragged ("space:<id>", "dir:<folder>"). */
export const useToolOrder = create<{ tools: SidebarTool[]; places: string[] }>(() => ({ tools: saved(KEY, toolOrder), places: saved(PLACES_KEY, placeOrder) }));

function keep(tools: SidebarTool[]) {
  if (tools.join() === useToolOrder.getState().tools.join()) return;
  useToolOrder.setState({ tools });
  try {
    localStorage.setItem(KEY, JSON.stringify(tools));
  } catch {}
}

function keepPlaces(places: string[]) {
  if (places.join('\n') === useToolOrder.getState().places.join('\n')) return;
  useToolOrder.setState({ places });
  try {
    localStorage.setItem(PLACES_KEY, JSON.stringify(places));
  } catch {}
}

/** Orders still on their way to the server (they go one after another): what it says meanwhile is older. */
let sending = 0;
let queue: Promise<unknown> = Promise.resolve();
/** Changes made here: a read that set out before one is older than it. */
let changes = 0;

/** Shows the tools in this order (every tool, first to last; [] the usual order), here at once and on every device a moment later. */
export function setToolOrder(tools: readonly string[]) {
  keep(toolOrder(tools));
  changes++;
  sending++;
  queue = queue
    .then(() => put('/api/sidebar', { tools: useToolOrder.getState().tools }))
    .catch(toastError)
    .finally(() => sending--);
}

/** Shows the projects' and folders' groups in this order (first to last), here at once and on every device a moment later. */
export function setPlaceOrder(places: readonly string[]) {
  keepPlaces(placeOrder(places));
  changes++;
  sending++;
  queue = queue
    .then(() => put('/api/sidebar', { places: useToolOrder.getState().places }))
    .catch(toastError)
    .finally(() => sending--);
}

function heard(v: unknown) {
  if (sending) return;
  const { tools, places } = (v ?? {}) as { tools?: unknown; places?: unknown };
  if (Array.isArray(tools)) keep(toolOrder(tools));
  if (Array.isArray(places)) keepPlaces(placeOrder(places));
}

let listening = false;
/** Reads what the server keeps, and follows its changes. */
export function loadToolOrder() {
  if (!listening) {
    listening = true;
    // On another machine's pages this server's news comes on its own socket; the shown machine's is not ours.
    if (ownLive) ownLive.on((e) => e.t === 'feature' && e.id === 'sidebar' && heard(e.data));
    else onFeatureEvent('sidebar', (e) => heard(e.data));
  }
  const at = changes;
  api<{ tools: SidebarTool[]; places?: string[] }>('/api/sidebar')
    .then((r) => at === changes && heard(r))
    .catch(() => {});
}
