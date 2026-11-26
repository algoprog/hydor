// What the Jobs page and its count on the rail read: GET /api/jobs, again at each change the server tells ({ t: 'jobs' },
// handed on as the 'jobs' news by lib/store) and, while the page is open and visible, every five seconds for its clocks
// and estimates.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { JobCounts, JobsList } from '@shared/jobs';
import { api } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { useApp } from '../../lib/store';

interface JobsState {
  list: JobsList | null;
  /** How far the server's clock is ahead of this device's (ms): the clocks count by the server's. */
  skew: number;
  /** Why the last read failed; the list read before it stays. */
  error: string | null;
  counts: JobCounts | null;
}

export const useJobs = create<JobsState>(() => ({ list: null, skew: 0, error: null, counts: null }));

/** How many ended jobs to read when the page asks for all of them. */
const ALL_ENDED = 1000;

/** Whether the page shows every ended job. */
let wantAll = false;
let reading: Promise<void> | null = null;
let again = false;

async function read() {
  try {
    const list = await api<JobsList>(`/api/jobs${wantAll ? `?ended=${ALL_ENDED}` : ''}`);
    useJobs.setState({ list, skew: list.at ? list.at - Date.now() : 0, error: null, counts: { running: list.running.length, queued: list.queued.length } });
  } catch (e) {
    useJobs.setState({ error: (e as Error).message });
  }
}

/** Reads the list; asked again while it reads, it reads once more after, so what changed meanwhile shows. */
export function loadJobs(): Promise<void> {
  if (reading) {
    again = true;
    return reading;
  }
  reading = (async () => {
    do {
      again = false;
      await read();
    } while (again);
    reading = null;
  })();
  return reading;
}

/** Only the counts, for the rail while the page is not open. */
async function loadCounts() {
  try {
    const l = await api<JobsList>('/api/jobs?ended=0');
    useJobs.setState({ counts: { running: l.running.length, queued: l.queued.length } });
  } catch {}
}

onFeatureEvent('jobs', (e) => {
  const c = e.data as Partial<JobCounts> | null;
  if (typeof c?.running === 'number') useJobs.setState({ counts: { running: c.running, queued: c.queued ?? 0 } });
});

/** How many jobs run, for the rail's badge: read once the app is connected (and again after it lost the server). */
export function useRunningCount(): number {
  const connected = useApp((s) => s.connected);
  const running = useJobs((s) => s.counts?.running ?? 0);
  useEffect(() => {
    if (connected) void loadCounts();
  }, [connected]);
  return running;
}

/** Keeps the list read while the page is open. `all`: every ended job, not only the latest. */
export function useJobsLive(all: boolean) {
  useEffect(() => {
    wantAll = all;
    const visible = () => document.visibilityState === 'visible';
    const load = () => visible() && void loadJobs();
    void loadJobs();
    const timer = window.setInterval(load, 5000);
    document.addEventListener('visibilitychange', load);
    const off = onFeatureEvent('jobs', () => void loadJobs());
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
      off();
    };
  }, [all]);
}

/** The server's time now, anew every second. */
export function useNow(): number {
  const skew = useJobs((s) => s.skew);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now + skew;
}
