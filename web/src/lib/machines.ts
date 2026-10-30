// The machines this server uses (Settings → Machines), for the switcher and notices. Always asked of
// this server itself, whichever machine the page shows.
import { create } from 'zustand';
import type { MachineView } from '@shared/types';
import { api } from './api';

interface Self {
  host: string;
  version: string;
}

interface MachinesState {
  self: Self | null;
  list: MachineView[];
  loaded: boolean;
  load: () => Promise<void>;
}

export const useMachines = create<MachinesState>((set) => ({
  self: null,
  list: [],
  loaded: false,
  load: async () => {
    const r = await api<{ self: Self; machines: MachineView[] }>('/api/machines');
    set({ self: r.self, list: r.machines, loaded: true });
  },
}));

/** This server's own machine, by its name. */
export const ownName = () => useMachines.getState().self?.host ?? 'the main machine';
