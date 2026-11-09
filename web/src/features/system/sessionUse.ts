// What each live session's programs use (GET /api/sessions/resources, server/resources.ts): System → Monitor's
// Sessions, a session's Info, and Settings → General → Limit each session. Looked at again every few seconds while open.
import { useEffect, useState } from 'react';
import type { Agent } from '@shared/types';
import { api } from '../../lib/api';

export interface SessionLimits {
  memoryMb?: number;
  cpus?: number;
}

export interface SessionUse {
  key: string;
  title: string;
  agent?: Agent;
  /** Share of one processor (100 = a core busy); null on the first look. */
  cpu: number | null;
  /** Resident memory of its programs, in bytes. */
  memory: number;
  /** How many programs. */
  procs: number;
  /** The limits it runs under (those set when its agent started). */
  limits?: SessionLimits;
  /** Programs the kernel stopped for going over its memory. */
  stopped?: number;
}

export interface SessionResources {
  sessions: SessionUse[];
  limits: SessionLimits;
  support: { ok: boolean; why?: string };
  /** Whether this computer's programs can be measured (Linux, a Mac). */
  measured: boolean;
}

export const MEMORY_CHOICES = [2048, 4096, 8192, 16384];
export const CPU_CHOICES = [1, 2, 4, 8];

/** The sessions' use, looked at every 3 s while `on`. */
export function useSessionResources(on = true): SessionResources | null {
  const [r, setR] = useState<SessionResources | null>(null);
  useEffect(() => {
    if (!on) return;
    let stop = false;
    const look = () =>
      api<SessionResources>('/api/sessions/resources')
        .then((x) => !stop && setR(x))
        .catch(() => {});
    look();
    const t = setInterval(look, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [on]);
  return r;
}

/** "At most 4 GB and 2 processors", or nothing without limits. */
export function limitsText(l?: SessionLimits): string {
  if (!l || (!l.memoryMb && !l.cpus)) return '';
  const gb = l.memoryMb ? l.memoryMb / 1024 : 0;
  const n = l.cpus ?? 0;
  if (gb && n) return `At most ${gb} GB and ${n} processor${n === 1 ? '' : 's'}`;
  if (gb) return `At most ${gb} GB`;
  return `At most ${n} processor${n === 1 ? '' : 's'}`;
}
