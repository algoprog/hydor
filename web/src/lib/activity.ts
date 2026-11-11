import type { SessionSummary } from '@shared/types';
import { tr } from '../i18n/runtime';

export interface Activity {
  /** app: run by this console; external: VS Code or a terminal. */
  kind: 'app' | 'external';
  status: 'starting' | 'working' | 'waiting' | 'idle' | 'stopping';
  client?: string;
  detail?: string;
  /** Background commands, agents and monitors still running. */
  background: number;
  /** Child sessions it started that are still running (starting, working or waiting, or kept working by helpers of their own). */
  helpers: number;
}

/** Whether (and how) a session is running right now, here or elsewhere. */
export function activityOf(s: SessionSummary | undefined | null): Activity | null {
  if (!s) return null;
  const l = s.live;
  const helpers = s.helpers ?? 0;
  if (l && l.status !== 'exited' && l.status !== 'error') return { kind: 'app', status: l.status, background: l.backgroundTasks?.length ?? 0, helpers };
  const e = s.external;
  if (e) return { kind: 'external', status: e.status, client: e.client, detail: e.detail, background: e.backgroundTasks?.length ?? 0, helpers };
  // Its own process has stopped between turns, but its child sessions still run: it is not done.
  if (helpers > 0) return { kind: 'app', status: 'idle', background: 0, helpers };
  return null;
}

/** A turn is running. */
export const isBusy = (a: Activity | null) => !!a && (a.status === 'working' || a.status === 'starting');

/**
 * Between turns, but background tasks or child sessions still run: the agent picks up again when they finish.
 * It takes your messages all the same: its own turn is over.
 */
export const inBackground = (a: Activity | null) => !!a && a.status === 'idle' && (a.background > 0 || a.helpers > 0);

/** Not done yet: a turn is running, or background tasks or child sessions are. */
export const isWorking = (a: Activity | null) => isBusy(a) || inBackground(a);

/** Between turns, as one short line for a list: "Working · 2 in background", "Working · 1 helper session", or both. */
export function backgroundLine(a: Activity): string {
  const where = a.kind === 'external' ? ` in ${a.client}` : '';
  if (a.background && a.helpers) return `Working${where} · ${a.background} in background, ${a.helpers} helper session${a.helpers === 1 ? '' : 's'}`;
  if (a.helpers) return `Working${where} · ${a.helpers} helper session${a.helpers === 1 ? '' : 's'}`;
  return `Working${where} · ${a.background} in background`;
}

export function activityLabel(a: Activity): string {
  const where = a.kind === 'external' ? ` in ${a.client}` : '';
  switch (a.status) {
    case 'working':
      return `Working${where}`;
    case 'starting':
      return 'Starting';
    case 'waiting':
      return a.kind === 'external' ? `Waiting for you${where}` : 'Waiting for you';
    case 'stopping':
      return 'Stopping';
    default:
      if (a.background && a.helpers) return `Working${where} · ${a.background} background task${a.background === 1 ? '' : 's'} and ${a.helpers} helper session${a.helpers === 1 ? '' : 's'} running`;
      if (a.helpers) return `Working${where} · ${a.helpers} helper session${a.helpers === 1 ? '' : 's'} running`;
      if (a.background) return `Working${where} · ${a.background} background task${a.background === 1 ? '' : 's'} running`;
      return a.kind === 'external' ? `Open${where}` : 'Running, idle';
  }
}

/**
 * Sessions open in VS Code or a terminal are detected by the server and can't be resumed
 * here (two writers on one transcript corrupt it). This only asks when the server knows
 * nothing yet but the transcript was written to seconds ago, i.e. a client that just started.
 */
export async function confirmResume(s: SessionSummary): Promise<boolean> {
  if (s.external) return false;
  const age = Date.now() - (s.updatedAt ?? 0);
  if (age > 15_000 || s.createdByApp) return true;
  // The browser's own dialog, which the page's translation does not reach.
  return window.confirm(
    tr(`This session was written to ${Math.max(1, Math.round(age / 1000))} s ago, maybe from VS Code or a terminal. Resuming it here while it runs elsewhere can corrupt its history. Resume anyway?`),
  );
}

/**
 * A Claude Code session open in VS Code or a terminal can be ended there and continued here.
 * Codex can't: one app-server process serves every thread in its window.
 */
export const canTakeOver = (s: SessionSummary) => !!s.external && s.agent === 'claude';

export function takeoverDialog(s: SessionSummary) {
  const e = s.external!;
  return {
    title: 'Continue in the browser?',
    body: `This ends the session in ${e.client} (process ${e.pid})${e.status === 'working' ? ', stopping what it is doing right now,' : ''} and resumes it here with its full history. ${e.client} will show it as ended; you can reopen it there later.`,
    confirm: 'Continue here',
  };
}
