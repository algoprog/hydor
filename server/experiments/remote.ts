// Other machines running Hydor (Settings → Machines): a job sent to one ("m:<id>") is kept there, with its agent on
// call and its notices (which this server passes on, as it does all of that machine's), and followed from here
// through a copy of its record. The Experiments page lists every connected machine's runs too, each marked with
// where it runs; reading and stopping go through that machine.
import type { MachineView } from '../../shared/types.ts';
import type { RunRecord } from '../../shared/experiments.ts';

/** A run as another machine's API gives it. */
export type RemoteRun = RunRecord;

export interface MachineLink {
  name: string;
  call<T>(method: string, p: string, timeoutMs?: number, body?: unknown): Promise<T>;
}

/** What this module needs of server/machines.ts (set once the server has made it). */
export interface MachinesLike {
  list(): MachineView[];
  get(id: string): { def: { name: string }; call<T>(method: string, p: string, timeoutMs?: number, body?: unknown): Promise<T> };
}

let machines: MachinesLike | null = null;

export function useMachines(m: MachinesLike) {
  machines = m;
}

/** A machine of Settings → Machines, by its id (null when there is none). */
export function remoteMachine(id: string): MachineLink | null {
  if (!machines) return null;
  try {
    const m = machines.get(id);
    return { name: m.def.name, call: (method, p, timeoutMs, body) => m.call(method, p, timeoutMs, body) };
  } catch {
    return null;
  }
}

/** The machines connected now. */
export function connectedMachines(): MachineView[] {
  return machines?.list().filter((m) => m.status.state === 'online') ?? [];
}

/**
 * Every connected machine's runs, newest first, each marked with its machine (those that do not answer in a few
 * seconds, or have no Experiments, are left out). `skip`: runs already copied here (by their id there).
 */
export async function machinesRuns(query: string, skip: Set<string>): Promise<RunRecord[]> {
  const out: RunRecord[] = [];
  await Promise.all(
    connectedMachines().map(async (mv) => {
      const m = remoteMachine(mv.id);
      if (!m) return;
      try {
        const r = await m.call<{ runs: RunRecord[] }>('GET', `/api/experiments/runs${query ? `?${query}` : ''}`, 6000);
        for (const run of r.runs ?? []) if (!skip.has(run.id) && !run.remote && !run.machine) out.push({ ...run, machine: { id: mv.id, name: mv.name } });
      } catch {}
    }),
  );
  return out;
}
