// A notebook page's link to its kernel: finding one already running for the notebook, following it
// live, and the kernel actions.
import { useEffect, useState, type Dispatch } from 'react';
import type { CellRun, KernelEnv, KernelInfo, SetupResult } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { live } from '../../lib/ws';
import type { Action } from './model';

export const kernelApi = {
  start: (notebook: string, env?: string) => post<KernelInfo>('/api/kernels', { notebook, env }),
  snapshot: (id: string) => api<{ kernel: KernelInfo; runs: CellRun[] }>(`/api/kernels/${id}`),
  execute: (id: string, cells: { cellId: string; code: string }[]) => post<{ seqs: number[] }>(`/api/kernels/${id}/execute`, { cells }),
  interrupt: (id: string) => post(`/api/kernels/${id}/interrupt`),
  restart: (id: string) => post<KernelInfo>(`/api/kernels/${id}/restart`),
  shutdown: (id: string) => post(`/api/kernels/${id}/shutdown`),
  input: (id: string, cellId: string, value: string) => post(`/api/kernels/${id}/input`, { cellId, value }),
  complete: (id: string, code: string, cursor: number) => post<{ matches: string[]; start: number; end: number }>(`/api/kernels/${id}/complete`, { code, cursor }),
  envs: (notebook: string) => api<{ envs: KernelEnv[]; suggested?: string }>(`/api/kernels/envs?notebook=${enc(notebook)}`),
  install: (env: string, notebook: string) => post<SetupResult>('/api/kernels/envs/install', { env, notebook }),
};

/** The notebook's kernel, kept current; its run updates go to `dispatch`. */
export function useKernel(path: string, dispatch: Dispatch<Action>, since: () => number) {
  const [kernel, setKernel] = useState<KernelInfo | null>(null);

  // A kernel may have been running for this notebook while the page was closed.
  useEffect(() => {
    let alive = true;
    setKernel(null);
    api<{ kernels: KernelInfo[] }>('/api/kernels')
      .then((r) => alive && setKernel(r.kernels.find((k) => k.notebook === path) ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);

  const id = kernel?.id;
  useEffect(() => {
    if (!id) return;
    const off = live.on((e) => {
      if (e.t !== 'kernel' || e.id !== id) return;
      const op = e.e;
      if (op.op === 'kernel') setKernel(op.kernel);
      else if (op.op === 'gone') setKernel(null);
      else {
        if (op.op === 'snapshot') setKernel(op.kernel);
        dispatch({ type: 'kernel', op, since: since() });
      }
    });
    const unsub = live.sub(`kernel:${id}`);
    return () => {
      off();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return { kernel, setKernel };
}

/** Kernels count cursor positions in code points; the editor counts UTF-16 units. */
export const toCodePoints = (s: string, i: number) => [...s.slice(0, i)].length;
export function fromCodePoints(s: string, cp: number): number {
  let i = 0;
  for (let n = 0; n < cp && i < s.length; n++) i += (s.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
  return i;
}
