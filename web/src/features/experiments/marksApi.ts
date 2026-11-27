// Stars, notes and archiving, as the page asks for them: one run, or several at once (each machine asked for its own).
import { useExperimentMarks } from './marksStore';
import { api, enc } from '../../lib/api';
import type { RunRecord } from '@shared/experiments';
import { baseOf } from './api';

const on = (machine?: string) => (machine ? { base: baseOf(machine)! } : {});

/** Changes one run's note, star or archiving. */
export async function markRun(r: Pick<RunRecord, 'id' | 'machine'>, body: { note?: string; starred?: boolean; archived?: boolean }): Promise<RunRecord> {
  const x = await api<{ run: RunRecord }>(`/api/experiments/runs/${enc(r.id)}`, { method: 'PATCH', body, ...on(r.machine?.id) });
  useExperimentMarks.getState().changed();
  return x.run;
}

/** Runs by the machine that keeps them ('' this computer). */
export function byMachine(runs: Pick<RunRecord, 'id' | 'machine'>[]): [string, string[]][] {
  const m = new Map<string, string[]>();
  for (const r of runs) m.set(r.machine?.id ?? '', [...(m.get(r.machine?.id ?? '') ?? []), r.id]);
  return [...m];
}

/** Stars, archives or stops several runs. What was left (not archived while going) and what failed to stop. */
export async function markMany(runs: Pick<RunRecord, 'id' | 'machine'>[], body: { starred?: boolean; archived?: boolean; stop?: boolean }): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  try {
    for (const [machine, ids] of byMachine(runs)) {
      for (let i = 0; i < ids.length; i += 500) {
        const x = await api<{ failed?: { error: string }[] }>('/api/experiments/runs/bulk', { method: 'POST', body: { ids: ids.slice(i, i + 500), ...body }, ...on(machine) });
        failed.push(...(x.failed ?? []).map((f) => f.error));
      }
    }
  } finally {
    useExperimentMarks.getState().changed();
  }
  return { failed };
}
