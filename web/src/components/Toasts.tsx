// Short messages at the bottom of the screen. A session that finished, failed or needs you gets a
// small card like its row in the sidebar: its name on one line, the status and a hint of the reply
// under it; the card opens the session. A toast under the pointer stays until the pointer leaves. Above them, the
// Mac app's new version about to install (UpdateNotice).
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { noticeLine } from '@shared/notice';
import { useToasts, type Toast, type ToastNotice } from '../lib/store';
import { AgentIcon } from './AgentIcon';
import { UpdateNotice } from './UpdateNotice';
import { cx } from './ui';

const TONE: Record<ToastNotice['kind'], { dot: string; text: string }> = {
  done: { dot: 'bg-ok', text: 'text-ok' },
  waiting: { dot: 'bg-warn', text: 'text-warn' },
  failed: { dot: 'bg-err', text: 'text-err' },
};

function NoticeCard({ t, n }: { t: Toast; n: ToastNotice }) {
  const dismiss = useToasts((s) => s.dismiss);
  const { status, detail } = noticeLine(n);
  const tone = TONE[n.kind];
  return (
    <div className="relative">
      <button
        onClick={() => {
          n.open();
          dismiss(t.id);
        }}
        className="flex w-full items-start gap-3 rounded-xl py-2.5 pr-9 pl-3.5 text-left transition-colors hover:bg-bg-2"
      >
        <span className="relative mt-[3px] shrink-0">
          <AgentIcon agent={n.agent} size={15} />
          <span className={cx('absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-2 ring-elevated', tone.dot)} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-fg">{n.title}</span>
          <span className={cx('mt-0.5 block text-[12.5px] text-fg-3', n.kind === 'failed' ? 'line-clamp-2' : 'truncate')}>
            <span className={cx('font-medium', tone.text)}>{status}</span>
            {n.machine && <> · on {n.machine}</>}
            {detail && <> · {detail}</>}
          </span>
        </span>
      </button>
      <button onClick={() => dismiss(t.id)} className="absolute top-2 right-2 rounded-md p-1 text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg" aria-label="Dismiss">
        <X size={13} />
      </button>
    </div>
  );
}

export function Toasts() {
  const list = useToasts((s) => s.list);
  const dismiss = useToasts((s) => s.dismiss);
  const hold = useToasts((s) => s.hold);
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+var(--safe-bottom))] z-[60] flex flex-col items-center gap-2 px-3 md:bottom-16 md:items-end md:px-5">
      <UpdateNotice />
      {list.map((t) => (
        <div
          key={t.id}
          role="status"
          onPointerEnter={() => hold(t.id, true)}
          onPointerLeave={() => hold(t.id, false)}
          className={cx(
            'rounded-xl border bg-elevated text-fg shadow-lg',
            t.leaving ? 'anim-out pointer-events-none' : 'anim-pop pointer-events-auto',
            t.notice ? 'w-[min(92vw,340px)] border-line' : 'flex max-w-[min(92vw,420px)] items-start gap-2.5 px-3.5 py-2.5 text-[13.5px]',
            !t.notice && (t.level === 'error' ? 'border-err/35' : 'border-line'),
          )}
        >
          {t.notice ? (
            <NoticeCard t={t} n={t.notice} />
          ) : (
            <>
              <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', t.level === 'error' ? 'bg-err' : t.level === 'ok' ? 'bg-ok' : 'bg-info')} />
              <span className="min-w-0 flex-1 break-words">
                {t.text}
                {t.detail && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-fg-3">{t.detail}</span>}
              </span>
              {t.action && (
                <button
                  className="shrink-0 rounded-md px-1.5 text-[13px] font-medium text-accent hover:bg-accent/10"
                  onClick={() => {
                    t.action!.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button className="text-fg-3 hover:text-fg" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X size={14} />
              </button>
            </>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
