// Pin, unpin, archive, unarchive and snooze, each undoable for a few seconds: from its toast, or with
// Ctrl+Z. Settling a session (finished work out of the way) is here too.
import type { SessionSummary } from '@shared/types';
import { enc, post } from './api';
import { toastError, useSessions, useToasts } from './store';
import { LOCALE } from '../i18n/locale';

type Flags = { pinned?: boolean; archived?: boolean; snoozedUntil?: number | null };

let last: { at: number; undo: () => void } | null = null;

function apply(key: string, f: Flags) {
  const cur = useSessions.getState().byKey[key];
  if (cur) useSessions.getState().upsert([{ ...cur, ...f, snoozedUntil: 'snoozedUntil' in f ? (f.snoozedUntil ?? undefined) : cur.snoozedUntil }]);
  post(`/api/sessions/${enc(key)}/flags`, { ...f, snoozedUntil: 'snoozedUntil' in f ? (f.snoozedUntil ?? null) : undefined }).catch(toastError);
}

/** "3:00 PM", "Tomorrow 9:00 AM", "Mon 9:00 AM", "Nov 4, 9:00 AM". */
export function whenLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(d) - day(now)) / 86400_000);
  if (days === 0) return time;
  if (days === 1) return `tomorrow ${time}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString(LOCALE, { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' })}, ${time}`;
}

/** Finished work out of the way: the agent process stops and the session counts as read. */
export async function settle(s: SessionSummary) {
  try {
    await post(`/api/sessions/${enc(s.key)}/settle`);
    useToasts.getState().push('ok', `Settled · ${s.title}`);
  } catch (e) {
    toastError(e);
  }
}

export function setFlags(s: SessionSummary, f: Flags) {
  const before: Flags = {};
  if (f.pinned !== undefined) before.pinned = !!s.pinned;
  if (f.archived !== undefined) before.archived = !!s.archived;
  if (f.snoozedUntil !== undefined) before.snoozedUntil = s.snoozedUntil ?? null;
  apply(s.key, f.snoozedUntil === null ? { ...f, snoozedUntil: undefined } : f);
  const what =
    f.snoozedUntil !== undefined
      ? f.snoozedUntil
        ? `Snoozed until ${whenLabel(f.snoozedUntil)}`
        : 'Back from snooze'
      : f.archived !== undefined
        ? f.archived
          ? 'Archived'
          : 'Unarchived'
        : f.pinned
          ? 'Pinned'
          : 'Unpinned';
  const undo = () => apply(s.key, before);
  last = { at: Date.now(), undo };
  useToasts.getState().push('info', `${what} · ${s.title}`, { label: 'Undo', run: undo });
}

/** Undoes the last pin or archive change if it was made in the last 8 seconds. */
export function undoLast(): boolean {
  if (!last || Date.now() - last.at > 8000) return false;
  const u = last;
  last = null;
  u.undo();
  return true;
}
