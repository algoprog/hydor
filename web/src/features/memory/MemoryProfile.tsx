// Settings → Memory → Your profile: what every agent gets about you at the start of a session. Agents keep it
// current and you edit it; longer than its words, the helper model shortens it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { History, Pencil, RotateCw, Trash2 } from 'lucide-react';
import { wordCount } from '@shared/memory';
import { Button, cx, Dialog, inputCls, MenuItem, MenuSep, Throbber, useConfirm } from '../../components/ui';
import { post, put } from '../../lib/api';
import { ago } from '../../lib/format';
import { toast, toastError } from '../../lib/store';
import { EmptyRow, Group, MoreMenu, Notice } from '../settings/kit';
import { LOCALE } from '../../i18n/locale';
import { HistoryList, reloadState, SessionLink, when } from './common';
import { SOURCE, useMemoryState } from './state';

/**
 * Writes the profile: lines kept (Enter starts one; Ctrl+Enter or ⌘+Enter saves, Escape cancels), its words counted
 * against how many it may have. Longer is saved as written, and the helper shortens it to fit.
 */
function ProfileEditor({ text, limit, onSave, onCancel }: { text: string; limit: number; onSave: (text: string) => Promise<unknown>; onCancel: () => void }) {
  const [v, setV] = useState(text);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  // Grows with its text, up to most of the screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, Math.round(window.innerHeight * 0.6))}px`;
  }, [v]);
  const n = wordCount(v);
  const over = n > limit;
  const save = async () => {
    if (busy || v.trim() === text.trim()) return;
    setBusy(true);
    try {
      await onSave(v.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <textarea
        ref={ref}
        value={v}
        rows={6}
        placeholder="Who you are and what you do, what you use, how you like answers, what to avoid. Say, “Data analyst in Lisbon; works in Python and SQL. Short answers, the conclusion first.”"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          }
        }}
        className={cx(inputCls, 'h-auto resize-none py-2 text-[13.5px] leading-relaxed')}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className={cx('tnum mr-auto min-w-0 text-[12px] leading-snug', over ? 'text-warn' : 'text-fg-3')}>
          {over
            ? `${n.toLocaleString(LOCALE)} of ${limit.toLocaleString(LOCALE)} words: once saved, the helper model shortens it to fit`
            : `${n.toLocaleString(LOCALE)} of ${limit.toLocaleString(LOCALE)} words`}
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={busy || v.trim() === text.trim()} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}

/** The profile's text, about six lines of it, the rest behind "Show all". */
function ClampedText({ text }: { text: string }) {
  const [whole, setWhole] = useState(false);
  const [long, setLong] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Whether it is longer than the six lines: measured while it is clamped.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !whole) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [text, whole]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => !whole && setLong(el.scrollHeight > el.clientHeight + 1);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [whole]);
  return (
    <div>
      <div ref={ref} translate="no" className={cx('text-[13.5px] leading-relaxed break-words whitespace-pre-line text-fg', !whole && 'line-clamp-6')}>
        {text}
      </div>
      {(long || whole) && (
        <button type="button" onClick={() => setWhole((w) => !w)} className="mt-1 text-[12.5px] text-fg-3 underline-offset-2 transition-colors hover:text-fg hover:underline">
          {whole ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  );
}

export function ProfileGroup() {
  const st = useMemoryState();
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const running = !!st?.profileFit?.running;
  // While the helper shortens it, look again every few seconds.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reloadState, 3000);
    return () => clearInterval(t);
  }, [running]);
  const p = st?.profile ?? null;
  const limit = st?.profileWords ?? 0;
  const num = (x: number) => x.toLocaleString(LOCALE);
  const n = p ? wordCount(p.text) : 0;
  const fit = st?.profileFit;
  const save = (text: string) =>
    put<{ fitting: boolean }>('/api/memory/profile', { text })
      .then((r) => {
        setEditing(false);
        toast(r.fitting ? `Saved. It is longer than ${num(limit)} words, so the helper model is shortening it to fit.` : 'Profile saved');
        reloadState();
      })
      .catch(toastError);
  const clear = async () => {
    if (await confirm({ title: 'Clear your profile?', body: 'Agents stop getting it. It stays under Deleted notes for 30 days, to restore.', confirm: 'Clear', danger: true }))
      put('/api/memory/profile', { text: '' })
        .then(() => (toast('Profile cleared'), reloadState()))
        .catch(toastError);
  };
  const retry = () => post('/api/memory/profile/fit').then(reloadState).catch(toastError);
  const who = p ? SOURCE[p.source] : '';
  const startEditing = () => setEditing(true);

  return (
    <Group
      title="Your profile"
      info="Every agent gets it at the start of a session while memory is on. Agents keep it current from what you tell them, and each change shows under their reply, with undo."
      actions={
        st &&
        !editing && (
          <>
            <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={startEditing}>
              {p ? 'Edit' : 'Write it'}
            </Button>
            {p && (
              <MoreMenu label="Profile menu">
                {(close) => (
                  <>
                    <MenuItem
                      icon={<History size={14} />}
                      onClick={() => {
                        close();
                        setHistory(true);
                      }}
                    >
                      History of changes
                    </MenuItem>
                    <MenuSep />
                    <MenuItem
                      danger
                      icon={<Trash2 size={14} />}
                      onClick={() => {
                        close();
                        void clear();
                      }}
                    >
                      Clear profile
                    </MenuItem>
                  </>
                )}
              </MoreMenu>
            )}
          </>
        )
      }
    >
      {!st ? (
        <div className="flex justify-center py-5">
          <Throbber className="text-fg-3" />
        </div>
      ) : editing ? (
        <div className="px-4 py-3">
          <ProfileEditor text={p?.text ?? ''} limit={limit} onSave={save} onCancel={() => setEditing(false)} />
        </div>
      ) : p ? (
        <div className="px-4 py-3">
          <ClampedText text={p.text} />
          <div className="tnum mt-2 text-[12px] leading-snug text-fg-3">
            <span className={cx(n > limit && 'text-warn')}>{`${num(n)} of ${num(limit)} words`}</span>
            {' · '}
            <span title={when(p.updatedAt)}>{p.updatedAt !== p.createdAt ? `Changed ${ago(p.updatedAt)} by ${who}` : `Written ${ago(p.createdAt)} by ${who}`}</span>
            {p.session && (
              <>
                {' in '}
                <SessionLink k={p.session} title={p.sessionTitle} />
              </>
            )}
          </div>
        </div>
      ) : (
        <EmptyRow
          action={
            <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={startEditing}>
              Write it
            </Button>
          }
        >
          No profile yet. Agents start one when they learn something lasting about you.
        </EmptyRow>
      )}
      {st && fit?.running ? (
        <Notice icon={<Throbber />} className="!rounded-t-none !rounded-b-[11px] !ring-0">
          {`Shortening it to fit ${num(limit)} words…`}
        </Notice>
      ) : (
        st &&
        fit?.error &&
        n > limit && (
          <Notice
            tone="warn"
            className="!rounded-t-none !rounded-b-[11px]"
            action={
              <Button size="sm" variant="secondary" icon={<RotateCw size={13} />} onClick={() => void retry()}>
                Try again
              </Button>
            }
          >
            {`It is longer than ${num(limit)} words, and shortening it failed: ${fit.error}`}
          </Notice>
        )
      )}
      <Dialog open={history && !!p} onClose={() => setHistory(false)} title="Profile history" width={560}>
        {p && <HistoryList id={p.id} />}
      </Dialog>
      {confirmNode}
    </Group>
  );
}
