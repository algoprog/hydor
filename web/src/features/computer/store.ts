// Computer use as the pages know it: Settings → Computer use's state, and the session whose agent is using the
// computer now (the server's news, { t: 'feature', id: 'computer' }).
import { create } from 'zustand';
import type { ComputerActive, ComputerEvent, ComputerState } from '@shared/computer';
import { api, post } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { toastError } from '../../lib/store';

export const useComputer = create<{ state: ComputerState | null; active: ComputerActive | null }>(() => ({ state: null, active: null }));

let listening = false;
/** Hears the server's news, once for the whole app, and reads the state once. */
export function listenComputer() {
  if (listening) return;
  listening = true;
  onFeatureEvent('computer', (e) => {
    const d = e.data as ComputerEvent;
    if (d.type === 'active') useComputer.setState((s) => ({ active: d.active, state: s.state ? { ...s.state, active: d.active } : s.state }));
  });
  void loadComputer();
}

export async function loadComputer() {
  try {
    const state = await api<ComputerState>('/api/computer');
    useComputer.setState({ state, active: state.active });
  } catch {}
}

/** Stop: agents no longer use the computer until you allow it again. */
export async function stopComputer() {
  try {
    const state = await post<ComputerState>('/api/computer/stop');
    useComputer.setState({ state, active: null });
  } catch (e) {
    toastError(e);
  }
}
