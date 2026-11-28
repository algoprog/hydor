// A project kept in sync with its copy on another machine (Space.sync, shared/transfer.ts): its state in a line (on the
// project's page and its card on the Projects page) and a small panel under it with what happened (the files changed
// on both sides, both kept), Sync now (Sync anyway when removals are held back) and Stop syncing. The machine that
// keeps the link runs the rounds; on the other, the panel only stops the syncing there. Sync now and Stop syncing are
// also in the project's menu (ProjectMenu.tsx).
import { useRef, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import type { Space } from '@shared/spaces';
import type { ProjectSyncMark } from '@shared/transfer';
import { Button, cx, Popover } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import { del, enc, post, put } from '../../lib/api';
import { ago } from '../../lib/format';
import { useMachines } from '../../lib/machines';
import { toastError } from '../../lib/store';
import { loadSpaces } from './state';

/** This server keeps the link of a project's sync (the one that can sync it now). */
export function useKeepsLink(m: ProjectSyncMark | undefined): boolean {
  const id = useMachines((s) => s.self?.id);
  return !!m && !!id && m.by.id === id;
}

/** The state in a line: "In sync with GPU box · 2m ago", "Syncing…", "Waiting for GPU box", what holds it, the error. */
export function syncLine(m: ProjectSyncMark, full = false): string {
  const name = m.peer.name;
  switch (m.state) {
    case 'syncing':
      return tr('Syncing…');
    case 'waiting':
      return tr(`Waiting for ${name}`);
    case 'held':
      return full && m.error ? tr(`Held: ${m.error}`) : tr('Held back');
    case 'error':
      return full && m.error ? m.error : tr('Not syncing');
    default:
      return m.at ? tr(`In sync with ${name} · ${ago(m.at)}`) : tr(`In sync with ${name}`);
  }
}

/** Starts a round now (the keeper only); `force` lets held removals through. */
export async function syncNow(m: ProjectSyncMark, force = false) {
  try {
    await post(`/api/machines/projects/links/${enc(m.link)}/sync`, force ? { force: true } : {});
  } catch (e) {
    toastError(e);
  }
}

/** Stops syncing: on the machine that keeps the link, through it (both copies stay as they are); elsewhere, the mark here is cleared. */
export async function stopSync(s: Pick<Space, 'id'>, m: ProjectSyncMark, keeper: boolean) {
  try {
    if (keeper) await del(`/api/machines/projects/links/${enc(m.link)}`);
    else {
      // On a machine that does not keep the link: its own mark cleared (the keeper sees it gone and ends the link).
      await put(`/api/projects/${enc(s.id)}/sync/mark`, { mark: null });
    }
  } catch (e) {
    toastError(e);
  }
  loadSpaces();
}

const TONE: Record<ProjectSyncMark['state'], string> = { ok: 'text-ok', syncing: 'text-fg-3', waiting: 'text-fg-3', held: 'text-warn', error: 'text-err' };

/** The mark's state as a small button (an icon and the line) that opens its panel. `card`: on a card, where a click is not a click on the card. */
export function SyncBadge({ s, className }: { s: Space; className?: string }) {
  const m = s.sync;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const keeper = useKeepsLink(m);
  if (!m) return null;
  const when = (t: number) => new Date(t).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <span className={cx('inline-flex min-w-0', className)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={syncLine(m, true)}
        aria-expanded={open}
        className="inline-flex min-w-0 items-center gap-1.5 rounded-md py-0.5 text-[12px] text-fg-3 transition-colors hover:text-fg"
      >
        {m.state === 'ok' ? <Check size={12} className={cx('shrink-0', TONE.ok)} strokeWidth={2.5} /> : <RefreshCw size={12} className={cx('shrink-0', TONE[m.state], m.state === 'syncing' && 'animate-spin')} />}
        <span translate="no" className={cx('min-w-0 truncate', m.state === 'held' && 'text-warn', m.state === 'error' && 'text-err')}>
          {syncLine(m)}
        </span>
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={340} title={tr('Kept in sync')}>
        <div className="space-y-3 px-3 py-2.5 text-[13px]">
          <div>
            <div className={cx('font-medium', m.state === 'held' && 'text-warn', m.state === 'error' && 'text-err')} translate="no">
              {syncLine(m)}
            </div>
            {(m.state === 'held' || m.state === 'error' || m.state === 'waiting') && m.error && (
              <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3" translate="no">
                {m.error}
              </div>
            )}
            <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3">
              <span translate="no">{tr(`Its copy: ${m.peer.projectName} on ${m.peer.name}`)}</span>
            </div>
          </div>
          {!!m.conflicts?.length && (
            <div>
              <div className="mb-1 text-[12px] font-medium text-fg-3">Changed on both</div>
              <ul className="max-h-40 space-y-1.5 overflow-y-auto" translate="no">
                {m.conflicts.map((c, i) => (
                  <li key={i} className="text-[12.5px] leading-snug text-fg-2">
                    {c.path} · {tr('both kept as')} {c.copy}
                    <span className="text-fg-3"> · {when(c.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => void stopSync(s, m, keeper).then(() => setOpen(false))}>
              Stop syncing
            </Button>
            {keeper && (
              <Button size="sm" variant="secondary" disabled={m.state === 'syncing'} onClick={() => (setOpen(false), void syncNow(m, m.state === 'held'))}>
                {m.state === 'held' ? 'Sync anyway' : 'Sync now'}
              </Button>
            )}
          </div>
        </div>
      </Popover>
    </span>
  );
}

/** "Copied from laptop · 27 Nov": where a project came from, and when. */
export function cameLine(c: NonNullable<Space['came']>): string {
  const at = new Date(c.at).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  // Shown while it is not kept in sync (the header says that): one that was, once, is a copy from there.
  return c.how === 'move' ? tr(`Moved from ${c.from} · ${at}`) : tr(`Copied from ${c.from} · ${at}`);
}
