// The apps pinned to the top of the Apps page, kept by the server so every device shows the same ones: what the page
// and an app's own page show, changed from either (Pin to the top, Unpin, a drag into another order), with news of a
// change made elsewhere (another device, an app deleted or uninstalled) followed here.
import { create } from 'zustand';
import { MAX_PINS } from '@shared/apps';
import { api, put } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { toast, toastError } from '../../lib/store';

/** The pinned apps' ids, in their order (yours by id, ready-made ones as "tpl:<id>"); null until known. */
export const usePins = create<{ ids: string[] | null }>(() => ({ ids: null }));

let loading = false;
/** Changes of this page on their way to the server: meanwhile, news of an earlier one would put back what it shows. */
let saving = 0;

/** The pins, asked for once (the Apps page's own load brings them too). */
export function loadPins() {
  if (usePins.getState().ids || loading) return;
  loading = true;
  api<{ ids: string[] }>('/api/apps/pins')
    .then((r) => usePins.setState({ ids: r.ids }))
    .catch(() => {})
    .finally(() => (loading = false));
}

/** The pins as the server just gave them (with the Apps page), unless a change made here is on its way. */
export function gotPins(ids: string[]) {
  if (!saving) usePins.setState({ ids });
}

/** Pins these apps, in this order: shown at once, and put back as they were if the server says no. */
export async function savePins(ids: string[]) {
  const before = usePins.getState().ids;
  usePins.setState({ ids });
  saving++;
  try {
    const r = await put<{ ids: string[] }>('/api/apps/pins', { ids });
    if (saving === 1) usePins.setState({ ids: r.ids });
  } catch (e) {
    if (saving === 1) usePins.setState({ ids: before });
    toastError(e);
  } finally {
    saving--;
  }
}

/** Pin to the top (after the ones pinned already), or Unpin. */
export function togglePin(id: string) {
  const ids = usePins.getState().ids ?? [];
  if (ids.includes(id)) return void savePins(ids.filter((x) => x !== id));
  if (ids.length >= MAX_PINS) return toast(`At most ${MAX_PINS} apps can be pinned: unpin one first`, 'error');
  void savePins([...ids, id]);
}

/** A pinned app one place earlier (-1) or later (1). */
export function movePin(id: string, by: -1 | 1) {
  const ids = [...(usePins.getState().ids ?? [])];
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  void savePins(ids);
}

// A change made elsewhere: another device, or an app deleted or uninstalled.
onFeatureEvent('apps', (e) => {
  const pins = (e.data as { pins?: unknown } | null)?.pins;
  if (Array.isArray(pins) && !saving) usePins.setState({ ids: pins.filter((x): x is string => typeof x === 'string') });
});
