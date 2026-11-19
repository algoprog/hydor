// The machines this server uses (Settings → Machines), for the switcher and notices. Always asked of
// this server itself, whichever machine the page shows.
import { create } from 'zustand';
import type { MachineNews, MachineStatus, MachineView } from '@shared/types';
import { api } from './api';
import { machineId } from './machine';

interface Self {
  host: string;
  version: string;
  /** What its sessions come to, for a page of another machine (missing from an older server). */
  status?: MachineStatus;
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

/**
 * What happened on the machines this page does not show (this server too, on another machine's pages): sessions that
 * finished since you last looked there, and sessions waiting on you. Each field of a status is optional: an older
 * server leaves out what it does not know.
 */
export function elsewhere(self: Self | null, list: MachineView[]): { finished: number; waiting: number } {
  const others: (MachineStatus | undefined)[] = list.filter((m) => m.id !== machineId).map((m) => m.status);
  if (machineId) others.push(self?.status);
  let finished = 0;
  let waiting = 0;
  for (const s of others) {
    finished += s?.finished ?? 0;
    waiting += s?.waiting ?? 0;
  }
  return { finished, waiting };
}

/** The sessions of a machine's news, for its line in the switcher. */
export const newsOfMachine = (s: MachineStatus | undefined): MachineNews[] => s?.news ?? [];
