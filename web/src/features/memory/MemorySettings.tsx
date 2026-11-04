// Settings → Memory: memory on or off for all sessions; search by meaning (set up on this computer, where it
// runs, how many notes have their vectors); how many notes agents start with; the nightly tidy-up (when it ran,
// each change it made, undoable, and running it now); your profile (every agent gets it, agents keep it current,
// you edit it, and how many words it may have: longer, the helper shortens it); and every note kept so far by
// place (about you, each project, then the sessions' together), searchable by words and meaning. Each note says who wrote it and when, how often agents needed it
// and its end date; its menu edits it, dates it, shows its history or what a summary sums up, and deletes it.
// You can add notes of your own. The notes no agent has needed for months come up to keep or delete, deleted
// ones stay 30 days to restore, and all of them can be exported or cleared. On a phone the menus are sheets.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArchiveRestore,
  Brain,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  FileJson,
  FileText,
  FolderGit2,
  History,
  Hourglass,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
  UserRound,
  X,
} from 'lucide-react';
import type { MemoryChange, MemoryHistoryRow, MemoryListEntry, MemoryScope, MemoryState } from '@shared/memory';
import { changeSummary, isUserProfile, PROFILE_WORDS_CHOICES, TOP_K_CHOICES, wordCount } from '@shared/memory';
import { Badge, Button, cx, Empty, IconButton, inputCls, MenuItem, MenuSep, OptionRow, Popover, Section, Segmented, SheetsOnPhone, Switch, Tabs, Throbber, useConfirm } from '../../components/ui';
import { api, del, patch, post, put } from '../../lib/api';
import { ago, tildify } from '../../lib/format';
import { mu } from '../../lib/machine';
import { go, sessionPath } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { ChangeBadge, EntryEditor } from './parts';
import { folderName, placeName, SOURCE, useMemory, useMemoryState } from './state';
import { LOCALE } from '../../i18n/locale';

/** What the list shows: every note, one kind of place, the notes no agent needed lately, or the deleted ones. */
type View = 'all' | MemoryScope | 'stale' | 'deleted';
type HistoryRow = MemoryHistoryRow & { sessionTitle?: string };

const ORDER: Record<MemoryScope, number> = { global: 0, repo: 1, session: 2 };
/** A place's profile first, then its topics, then its notes. */
const KIND_ORDER = { profile: 0, topic: 1, note: 2 } as const;
const ACTION: Record<MemoryHistoryRow['action'], string> = { added: 'Added', updated: 'Changed', deleted: 'Deleted', restored: 'Restored', expiry: 'End date' };
/** What the server calls a session no longer listed. */
const GONE = 'A session that is gone';
const when = (t: number) => new Date(t).toLocaleString(LOCALE);
const dayOf = (t: number) => new Date(t).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
/** A date input's value, and back: the end of that day, here. */
const inputDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const endOfDay = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
};
const reloadState = () =>
  useMemory
    .getState()
    .load()
    .catch(() => {});

/** A setting: its name and switch on one line, what it does under them, across the width a phone has. */
function Row({ label, hint, control, children }: { label: string; hint?: ReactNode; control: ReactNode; children?: ReactNode }) {
  return (
    <div className="py-3">
      <div className="flex min-h-6 items-center gap-3">
        <div className="min-w-0 flex-1 text-[13.5px] text-fg">{label}</div>
        {control}
      </div>
      {hint && <div className="mt-0.5 text-[12px] leading-snug text-fg-3 sm:pr-12">{hint}</div>}
      {children}
    </div>
  );
}

function SessionLink({ k, title }: { k: string; title?: string }) {
  return (
    <button onClick={() => go(sessionPath(k))} title={title ?? k} translate={title ? 'no' : undefined} className="inline max-w-[16rem] truncate align-bottom text-fg-2 underline-offset-2 hover:text-fg hover:underline">
      {title ?? 'a session that is gone'}
    </button>
  );
}

function Status({ icon, tone, children }: { icon: ReactNode; tone?: 'warn'; children: ReactNode }) {
  return <div className={cx('flex items-start gap-2 text-[12.5px] leading-snug', tone === 'warn' ? 'text-warn' : 'text-fg-2')}>{icon}<span className="min-w-0">{children}</span></div>;
}

/** Search by meaning: its switch, where it runs, and how it is doing. */
function Meaning({ st, set }: { st: MemoryState; set: (p: Record<string, unknown>) => void }) {
  const m = st.meaning;
  const busy = m.status === 'setting-up' || m.status === 'starting';
  // While it sets up or loads, look again every few seconds.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(reloadState, 3000);
    return () => clearInterval(t);
  }, [busy]);
  return (
    <Row
      label="Search by meaning"
      hint="Finds notes by what they mean, not only their words, with a model that runs on this computer. Setting it up takes about 2 GB, once (6 GB with an NVIDIA GPU)."
      control={<Switch on={st.enabled && m.on} disabled={!st.enabled} label="Search by meaning" onChange={(on) => set({ meaning: on })} />}
    >
      {st.enabled && m.on && (
        <div className="mt-2.5 space-y-2.5">
          {m.status === 'failed' ? (
            <Status icon={<TriangleAlert size={14} className="mt-0.5 shrink-0" />} tone="warn">
              {m.detail ?? 'It stopped.'}{' '}
              <button onClick={() => set({ retry: true })} className="inline-flex items-center gap-1 font-medium text-fg-2 underline-offset-2 hover:underline">
                <RotateCw size={12} /> Try again
              </button>
            </Status>
          ) : (
            <Status icon={busy ? <Throbber className="mt-0.5 shrink-0" /> : <Check size={14} className="mt-0.5 shrink-0 text-ok" />}>
              {m.detail ?? (busy ? 'Getting ready' : 'Ready')}
              {m.total > 0 && !busy && (
                <>
                  {' '}
                  · {m.embedded === m.total ? `all ${m.total} notes` : `${m.embedded} of ${m.total} notes`} found by meaning{m.embedded < m.total && ' (the rest soon)'}
                </>
              )}
            </Status>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" title="Automatic: on a GPU with room when there is one. CPU only: the GPUs stay free for other work.">
            <span className="text-[12.5px] text-fg-2">Where it runs</span>
            <Segmented
              size="sm"
              value={m.where}
              onChange={(v) => set({ device: v })}
              options={[
                { value: 'auto', label: 'Automatic' },
                { value: 'cpu', label: 'CPU only' },
              ]}
            />
          </div>
        </div>
      )}
    </Row>
  );
}

function Switches() {
  const st = useMemoryState();
  const set = (p: Record<string, unknown>) =>
    put('/api/memory', p)
      .then(reloadState)
      .catch(toastError);
  if (!st) return null;
  return (
    <Section>
      <div className="-my-2 divide-y divide-line">
        <Row
          label="Memory"
          hint={st.enabled ? 'Agents start with what earlier sessions kept about you and your projects, and save what they learn.' : 'Off: agents get no notes and save nothing new. Your notes stay.'}
          control={<Switch on={st.enabled} label="Memory" onChange={(on) => set({ enabled: on })} />}
        />
        <Meaning st={st} set={set} />
        <Row
          label="Notes each agent starts with"
          hint="Besides your profile: the notes about you and the project that bear most on what you ask, found by their words and, with search by meaning on, by what they mean; then the latest. Agents look up the rest when they need it."
          control={<Segmented size="sm" value={String(st.topK)} options={TOP_K_CHOICES.map((k) => ({ value: String(k), label: String(k) }))} onChange={(v) => set({ topK: Number(v) })} />}
        />
        <Row
          label="Tidy up each night"
          hint="The helper model merges notes that say the same thing and sums related ones up. It reads notes only, never conversations."
          control={<Switch on={st.enabled && st.tidyOn} disabled={!st.enabled} label="Tidy up each night" onChange={(on) => set({ tidy: on })} />}
        >
          {st.enabled && <Tidy st={st} />}
        </Row>
      </div>
    </Section>
  );
}

/** The latest tidy-up: when, what it changed (each undoable), and running one now. */
function Tidy({ st }: { st: MemoryState }) {
  const r = st.tidy;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!r?.running) return;
    const t = setInterval(reloadState, 3000);
    return () => clearInterval(t);
  }, [r?.running]);
  const now = () =>
    post('/api/memory/tidy')
      .then(() => (toast('Tidying up: this takes a minute or two'), reloadState()))
      .catch(toastError);
  const undo = (i: number) =>
    post('/api/memory/tidy/undo', { index: i })
      .then(reloadState)
      .catch(toastError);
  const live = r?.changes.filter((c) => !c.undone).length ?? 0;
  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[200px] flex-1 text-[12.5px] leading-snug text-fg-2">
          {!r ? (
            'Not tidied up yet.'
          ) : r.running ? (
            <span className="inline-flex items-center gap-1.5">
              <Throbber /> Tidying up…
            </span>
          ) : (
            <>
              Last tidied up <span title={when(r.at)}>{ago(r.at)}</span>
              {r.error ? (
                <span className="text-warn">: {r.error}</span>
              ) : r.changesAt ? (
                <>
                  : nothing to change. Before that, <span title={when(r.changesAt)}>{ago(r.changesAt)}</span>: <Counts changes={r.changes} />.
                </>
              ) : r.changes.length ? (
                <>
                  : <Counts changes={r.changes} />.
                </>
              ) : (
                `: nothing to change (${r.checked} note${r.checked === 1 ? '' : 's'} looked at).`
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {r && r.changes.length > 0 && (
            <Button size="sm" variant="ghost" icon={<ChevronRight size={14} className={cx('transition-transform', open && 'rotate-90')} />} onClick={() => setOpen((o) => !o)}>
              {open ? 'Hide' : `What changed (${live})`}
            </Button>
          )}
          <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} disabled={r?.running} onClick={() => void now()}>
            Tidy up now
          </Button>
        </div>
      </div>
      {open && r && (
        <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {r.changes.map((c, i) => (
            <TidyChange key={`${c.entry}-${i}`} c={c} onUndo={() => void undo(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** "2 added, 1 removed": each count a piece of its own, so each is translated. */
function Counts({ changes }: { changes: MemoryChange[] }) {
  return changeSummary(changes)
    .split(', ')
    .map((p, i) => (
      <Fragment key={i}>
        {i > 0 && ', '}
        <span>{p}</span>
      </Fragment>
    ));
}

function TidyChange({ c, onUndo }: { c: MemoryChange; onUndo: () => void }) {
  return (
    <div className={cx('px-3.5 py-2.5', c.undone && 'opacity-60')}>
      <div className="flex min-h-7 items-center gap-2">
        <ChangeBadge c={c} />
        {c.kind && c.kind !== 'note' && <Badge>{c.kind === 'topic' ? 'Topic' : 'Profile'}</Badge>}
        <span className="min-w-0 truncate text-[12px] text-fg-3">
          {placeName(c.scope, c.scopeKey)}
          {c.why && ` · ${c.why}`}
        </span>
        <span className="flex-1" />
        {!c.undone && (
          <IconButton size="sm" label="Undo this change" onClick={onUndo}>
            <Undo2 size={14} />
          </IconButton>
        )}
      </div>
      <div className="mt-1 space-y-0.5 text-[13.5px] leading-snug break-words">
        {c.before && c.action !== 'expiry' && <div className="text-fg-3 line-through decoration-fg-3/60">{c.before}</div>}
        {c.after && <div className="text-fg">{c.after}</div>}
        {c.action === 'expiry' && c.expiresAt && <div className="text-[12px] text-fg-3">Until {dayOf(c.expiresAt)}</div>}
      </div>
    </div>
  );
}

/** What opens under a note from its menu: what it is, and a way to close it. */
function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="mt-2.5 rounded-lg bg-bg-1 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[12px] font-medium text-fg-2">{title}</span>
        <IconButton size="sm" label="Close" onClick={onClose} className="-my-1 -mr-2">
          <X size={14} />
        </IconButton>
      </div>
      {children}
    </div>
  );
}

function HistoryList({ id }: { id: number }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const version = useMemory((s) => s.version);
  useEffect(() => {
    api<{ history: HistoryRow[] }>(`/api/memory/entries/${id}/history`)
      .then((r) => setRows(r.history))
      .catch(toastError);
  }, [id, version]);
  if (!rows) return <Throbber className="mt-2 text-fg-3" />;
  return (
    <ol className="mt-1.5 space-y-2 border-l-2 border-line pl-3">
      {rows.map((h) => (
        <li key={h.id} className="text-[12px] leading-snug text-fg-3">
          <div>
            <span className="font-medium text-fg-2">{ACTION[h.action]}</span> <span title={when(h.at)}>{ago(h.at)}</span> by {SOURCE[h.source]}
            {h.session && (
              <>
                {' '}
                in <SessionLink k={h.session} title={h.sessionTitle} />
              </>
            )}
            {h.why && <> · {h.why}</>}
          </div>
          {h.action === 'updated' && (
            <div className="mt-0.5 break-words">
              <span className="line-through decoration-fg-3/60">{h.before}</span> → <span className="text-fg-2">{h.after}</span>
            </div>
          )}
          {h.action === 'expiry' && <div className="mt-0.5">{h.after ? `Until ${dayOf(Date.parse(h.after))}` : 'Taken away'}</div>}
        </li>
      ))}
    </ol>
  );
}

/** What a topic or profile sums up. */
function Children({ id }: { id: number }) {
  const [list, setList] = useState<MemoryListEntry[] | null>(null);
  const version = useMemory((s) => s.version);
  useEffect(() => {
    api<{ entries: MemoryListEntry[] }>(`/api/memory/entries/${id}/children`)
      .then((r) => setList(r.entries))
      .catch(toastError);
  }, [id, version]);
  if (!list) return <Throbber className="mt-2 text-fg-3" />;
  if (!list.length) return <div className="mt-1.5 text-[12px] text-fg-3">It sums up no notes kept now.</div>;
  return (
    <ul className="mt-1.5 space-y-1 border-l-2 border-line pl-3 text-[12.5px] leading-snug">
      {list.map((e) => (
        <li key={e.id} translate="no" className={cx('break-words', e.status === 'deleted' ? 'text-fg-3 line-through decoration-fg-3/60' : 'text-fg-2')}>
          {e.text}
        </li>
      ))}
    </ul>
  );
}

/** Sets or takes away an entry's end date. */
function EndDate({ e, onDone }: { e: MemoryListEntry; onDone: () => void }) {
  const [v, setV] = useState(e.expiresAt ? inputDay(e.expiresAt) : inputDay(Date.now() + 7 * 86400_000));
  const save = (expiresAt: number | null) =>
    patch(`/api/memory/entries/${e.id}`, { expiresAt })
      .then(onDone)
      .catch(toastError);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-fg-3">True until</span>
      <input type="date" value={v} min={inputDay(Date.now() + 86400_000)} onChange={(x) => setV(x.target.value)} className={cx(inputCls, 'h-8 w-auto text-[13px]')} />
      <Button size="sm" variant="primary" disabled={!v} onClick={() => void save(endOfDay(v))}>
        Save
      </Button>
      {e.expiresAt && (
        <Button size="sm" variant="ghost" onClick={() => void save(null)}>
          No end date
        </Button>
      )}
    </div>
  );
}

/** The line under a note: who wrote it and when, where it came from, how often agents needed it, its end date.
 * Each fact is an element of its own, so each is translated whole. */
function NoteFacts({ e, inSessions }: { e: MemoryListEntry; inSessions: boolean }) {
  const deleted = e.status === 'deleted';
  const changed = e.updatedAt !== e.createdAt;
  const who = SOURCE[e.source];
  const facts: ReactNode[] = [];
  if (inSessions) facts.push(<SessionLink k={e.scopeKey} title={e.scopeLabel === GONE ? undefined : e.scopeLabel} />);
  facts.push(
    <span>
      <span title={changed ? `Added ${when(e.createdAt)}\nChanged ${when(e.updatedAt)}` : `Added ${when(e.createdAt)}`}>
        {deleted ? `Deleted ${ago(e.updatedAt)}` : changed ? `Changed ${ago(e.updatedAt)} by ${who}` : `Added ${ago(e.createdAt)} by ${who}`}
      </span>
      {e.session && !deleted && !(inSessions && e.session === e.scopeKey) && (
        <>
          {' in '}
          <SessionLink k={e.session} title={e.sessionTitle} />
        </>
      )}
    </span>,
  );
  if (e.kind !== 'note') facts.push(<span>{e.covers === 1 ? 'sums up 1 note' : `sums up ${e.covers ?? 0} notes`}</span>);
  if (e.uses > 0) facts.push(<span title={e.usedAt ? `Last needed ${ago(e.usedAt)}` : undefined}>{e.uses === 1 ? 'needed once' : `needed ${e.uses} times`}</span>);
  if (e.expiresAt && !deleted) facts.push(<span className="text-fg-2">{`until ${dayOf(e.expiresAt)}`}</span>);
  return (
    <div className="mt-1 text-[12px] leading-snug text-fg-3">
      {facts.map((f, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          {f}
        </Fragment>
      ))}
    </div>
  );
}

/** A note: its text and facts, its menu, and what that opens under it. */
function EntryRow({ e, view, reload, inSessions }: { e: MemoryListEntry; view: View; reload: () => void; inSessions: boolean }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<'history' | 'children' | 'end' | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [confirm, confirmNode] = useConfirm();
  const deleted = e.status === 'deleted';
  const stale = view === 'stale';
  const show = (k: 'history' | 'children' | 'end') => {
    setMenu(false);
    setOpen((o) => (o === k ? null : k));
  };
  const act = (p: Promise<unknown>) =>
    p
      .then(reload)
      .catch(toastError);
  const remove = () => {
    setMenu(false);
    act(del(`/api/memory/entries/${e.id}`).then(() => toast('Deleted. It stays under Deleted notes for 30 days.')));
  };
  const erase = async () => {
    setMenu(false);
    if (await confirm({ title: 'Erase this note for good?', body: 'It goes with its history, and cannot come back.', confirm: 'Erase', danger: true })) act(del(`/api/memory/entries/${e.id}?forever=1`));
  };
  return (
    <div className="px-3.5 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <EntryEditor
              text={e.text}
              max={e.kind === 'note' ? 500 : 800}
              onCancel={() => setEditing(false)}
              onSave={(text) =>
                patch(`/api/memory/entries/${e.id}`, { text })
                  .then(() => (setEditing(false), reload()))
                  .catch(toastError)
              }
            />
          ) : (
            <>
              <div className={cx('text-[13.5px] leading-snug break-words', deleted ? 'text-fg-3 line-through decoration-fg-3/60' : 'text-fg')}>
                {e.kind !== 'note' && (
                  <Badge tone="info" className="mr-1.5 align-[1px]">
                    {e.kind === 'topic' ? 'Topic' : isUserProfile(e) ? 'Your profile' : 'Profile'}
                  </Badge>
                )}
                <span translate="no" className={isUserProfile(e) ? 'whitespace-pre-line' : undefined}>
                  {e.text}
                </span>
              </div>
              <NoteFacts e={e} inSessions={inSessions} />
            </>
          )}
        </div>
        {!editing && (
          <>
            <IconButton ref={menuRef} size="sm" label="Note menu" active={menu} onClick={() => setMenu((m) => !m)} className="-mt-1 -mr-1.5">
              <MoreHorizontal size={16} />
            </IconButton>
            <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={240} title={<span translate="no">{e.text}</span>}>
              {!deleted && (
                <>
                  <MenuItem icon={<Pencil size={14} />} onClick={() => (setMenu(false), setOpen(null), setEditing(true))}>
                    Edit
                  </MenuItem>
                  <MenuItem icon={<CalendarClock size={14} />} hint={e.expiresAt ? dayOf(e.expiresAt) : undefined} checked={open === 'end'} onClick={() => show('end')}>
                    End date
                  </MenuItem>
                  {e.kind !== 'note' && (
                    <MenuItem icon={<Layers size={14} />} checked={open === 'children'} onClick={() => show('children')}>
                      What it sums up
                    </MenuItem>
                  )}
                </>
              )}
              <MenuItem icon={<History size={14} />} checked={open === 'history'} onClick={() => show('history')}>
                History of changes
              </MenuItem>
              <MenuSep />
              {deleted ? (
                <MenuItem danger icon={<Trash2 size={14} />} onClick={() => void erase()}>
                  Erase for good
                </MenuItem>
              ) : (
                <MenuItem danger icon={<Trash2 size={14} />} onClick={remove}>
                  Delete
                </MenuItem>
              )}
            </Popover>
          </>
        )}
      </div>
      {/* The view's own question, answered here: keep or delete a note no agent needed; bring a deleted one back. */}
      {!editing && (stale || deleted) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {deleted ? (
            <Button size="sm" variant="secondary" icon={<ArchiveRestore size={14} />} onClick={() => act(post(`/api/memory/entries/${e.id}/restore`).then(() => toast('Restored')))}>
              Restore
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" icon={<Check size={14} />} onClick={() => act(post(`/api/memory/entries/${e.id}/keep`).then(() => toast('Kept')))}>
                Keep it
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={remove}>
                Delete
              </Button>
            </>
          )}
        </div>
      )}
      {open === 'history' && (
        <Panel title="History of changes" onClose={() => setOpen(null)}>
          <HistoryList id={e.id} />
        </Panel>
      )}
      {open === 'children' && (
        <Panel title="What it sums up" onClose={() => setOpen(null)}>
          <Children id={e.id} />
        </Panel>
      )}
      {open === 'end' && (
        <Panel title="End date" onClose={() => setOpen(null)}>
          <EndDate e={e} onDone={() => (setOpen(null), reload())} />
        </Panel>
      )}
      {confirmNode}
    </div>
  );
}

interface Group {
  scope: MemoryScope;
  /** The project's folder; empty about you, and for the sessions' notes, which show together. */
  key: string;
  entries: MemoryListEntry[];
}

function GroupHead({ g }: { g: Group }) {
  const home = useApp((s) => s.boot?.home);
  const Icon = g.scope === 'global' ? UserRound : g.scope === 'repo' ? FolderGit2 : MessageSquare;
  return (
    <div className="flex min-w-0 items-center gap-2 px-1 pb-1.5">
      <Icon size={14} className="shrink-0 text-fg-3" />
      {g.scope === 'repo' ? (
        <>
          <span translate="no" className="shrink-0 text-[13px] font-medium">
            {g.entries[0].scopeLabel}
          </span>
          <span translate="no" className="min-w-0 truncate font-mono text-[11.5px] text-fg-3">
            {tildify(g.key, home)}
          </span>
        </>
      ) : (
        <span className="text-[13px] font-medium">{g.scope === 'global' ? 'About you' : 'Sessions'}</span>
      )}
      <span className="ml-auto shrink-0 pl-2 text-[12px] text-fg-3">{g.entries.length}</span>
    </div>
  );
}

interface Place {
  scope: 'global' | 'repo';
  key: string;
}

/** A note of your own: about you, or about one of the projects memory has notes for. */
function AddNote({ onDone }: { onDone: (saved?: MemoryScope) => void }) {
  const home = useApp((s) => s.boot?.home);
  const [projects, setProjects] = useState<string[]>([]);
  const [place, setPlace] = useState<Place>({ scope: 'global', key: '' });
  const [pick, setPick] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    api<{ entries: MemoryListEntry[] }>('/api/memory/entries?scope=repo')
      .then((r) => setProjects([...new Set(r.entries.map((e) => e.scopeKey))]))
      .catch(() => {});
  }, []);
  const choose = (p: Place) => {
    setPlace(p);
    setPick(false);
  };
  const where = projects.length ? (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setPick((o) => !o)}
        title="Where it belongs"
        className={cx('inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', pick && 'bg-bg-2 text-fg')}
      >
        {place.scope === 'global' ? <UserRound size={14} className="shrink-0" /> : <FolderGit2 size={14} className="shrink-0" />}
        {place.scope === 'global' ? <span className="truncate">About you</span> : <span translate="no" className="truncate">{folderName(place.key)}</span>}
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>
      <Popover anchor={ref} open={pick} onClose={() => setPick(false)} width={290} title="Where it belongs">
        <OptionRow icon={<UserRound size={14} />} label="About you" hint="Every session gets it" selected={place.scope === 'global'} onClick={() => choose({ scope: 'global', key: '' })} />
        {projects.map((k) => (
          <OptionRow key={k} icon={<FolderGit2 size={14} />} label={<span translate="no">{folderName(k)}</span>} hint={tildify(k, home)} selected={place.key === k} onClick={() => choose({ scope: 'repo', key: k })} />
        ))}
      </Popover>
    </>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-1 text-[12.5px] text-fg-3">
      <UserRound size={14} /> About you
    </span>
  );
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <EntryEditor
        text=""
        placeholder="What should agents remember? Say, “I prefer short answers”."
        extra={where}
        onCancel={() => onDone()}
        onSave={(text) =>
          post('/api/memory/entries', { text, scope: place.scope, ...(place.key ? { key: place.key } : {}) })
            .then(() => (toast('Note saved'), onDone(place.scope)))
            .catch(toastError)
        }
      />
    </div>
  );
}

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
          {over ? `${n.toLocaleString(LOCALE)} of ${limit.toLocaleString(LOCALE)} words: once saved, the helper model shortens it to fit` : `${n.toLocaleString(LOCALE)} of ${limit.toLocaleString(LOCALE)} words`}
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

/** Your profile: what every agent gets at the start of a session, kept current by agents and by you, and how long it may be. */
function Profile() {
  const st = useMemoryState();
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [confirm, confirmNode] = useConfirm();
  const running = !!st?.profileFit?.running;
  // While the helper shortens it, look again every few seconds.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reloadState, 3000);
    return () => clearInterval(t);
  }, [running]);
  if (!st) return null;
  const p = st.profile;
  const limit = st.profileWords;
  const num = (x: number) => x.toLocaleString(LOCALE);
  const n = p ? wordCount(p.text) : 0;
  const fit = st.profileFit;
  const save = (text: string) =>
    put<{ fitting: boolean }>('/api/memory/profile', { text })
      .then((r) => {
        setEditing(false);
        toast(r.fitting ? `Saved. It is longer than ${num(limit)} words, so the helper model is shortening it to fit.` : 'Profile saved');
        reloadState();
      })
      .catch(toastError);
  const clear = async () => {
    setMenu(false);
    if (await confirm({ title: 'Clear your profile?', body: 'Agents stop getting it. It stays under Deleted notes for 30 days, to restore.', confirm: 'Clear', danger: true }))
      put('/api/memory/profile', { text: '' })
        .then(() => (toast('Profile cleared'), reloadState()))
        .catch(toastError);
  };
  const retry = () =>
    post('/api/memory/profile/fit')
      .then(reloadState)
      .catch(toastError);
  const who = p ? SOURCE[p.source] : '';
  return (
    <Section
      title="Your profile"
      sub="Every agent gets it at the start of a session while memory is on. Agents keep it current from what you tell them, and each change shows under their reply, with undo."
      actions={
        !editing && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => (setEditing(true), setHistory(false))}>
              {p ? 'Edit' : 'Write it'}
            </Button>
            {p && (
              <>
                <IconButton ref={menuRef} size="sm" label="Profile menu" active={menu} onClick={() => setMenu((m) => !m)}>
                  <MoreHorizontal size={16} />
                </IconButton>
                <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={240} title="Your profile">
                  <MenuItem icon={<History size={14} />} checked={history} onClick={() => (setMenu(false), setHistory((h) => !h))}>
                    History of changes
                  </MenuItem>
                  <MenuSep />
                  <MenuItem danger icon={<Trash2 size={14} />} onClick={() => void clear()}>
                    Clear profile
                  </MenuItem>
                </Popover>
              </>
            )}
          </div>
        )
      }
    >
      {editing ? (
        <ProfileEditor text={p?.text ?? ''} limit={limit} onSave={save} onCancel={() => setEditing(false)} />
      ) : p ? (
        <div translate="no" className="max-h-[22rem] overflow-y-auto rounded-xl bg-bg-1 px-3.5 py-2.5 text-[13.5px] leading-relaxed break-words whitespace-pre-line text-fg">
          {p.text}
        </div>
      ) : (
        <p className="text-[12.5px] leading-snug text-fg-3">No profile yet. Agents start one when they learn something lasting about you, or you can write it yourself.</p>
      )}
      {fit?.running ? (
        <div className="mt-2.5">
          <Status icon={<Throbber className="mt-0.5 shrink-0" />}>{`Shortening it to fit ${num(limit)} words…`}</Status>
        </div>
      ) : (
        fit?.error &&
        n > limit && (
          <div className="mt-2.5">
            <Status icon={<TriangleAlert size={14} className="mt-0.5 shrink-0" />} tone="warn">
              {`It is longer than ${num(limit)} words, and shortening it failed: ${fit.error}`}{' '}
              <button onClick={() => void retry()} className="inline-flex items-center gap-1 font-medium text-fg-2 underline-offset-2 hover:underline">
                <RotateCw size={12} /> Try again
              </button>
            </Status>
          </div>
        )
      )}
      {history && p && (
        <Panel title="History of changes" onClose={() => setHistory(false)}>
          <HistoryList id={p.id} />
        </Panel>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[180px] flex-1 text-[12px] leading-snug text-fg-3">
          {p && (
            <>
              <span className={cx('tnum', n > limit && 'text-warn')}>{`${num(n)} of ${num(limit)} words`}</span>
              {' · '}
              <span title={when(p.updatedAt)}>{p.updatedAt !== p.createdAt ? `Changed ${ago(p.updatedAt)} by ${who}` : `Written ${ago(p.createdAt)} by ${who}`}</span>
              {p.session && (
                <>
                  {' in '}
                  <SessionLink k={p.session} title={p.sessionTitle} />
                </>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2" title="The most words your profile may have. Agents keep it within this; longer, the helper model shortens it.">
          <span className="text-[12.5px] text-fg-2">Profile length</span>
          <Segmented size="sm" value={String(limit)} options={PROFILE_WORDS_CHOICES.map((w) => ({ value: String(w), label: num(w) }))} onChange={(v) => put('/api/memory', { profileWords: Number(v) }).then(reloadState).catch(toastError)} />
        </div>
      </div>
      {confirmNode}
    </Section>
  );
}

/** Notes as a readable list, or as data with each note's history. */
function ExportMenu() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const get = (format: 'md' | 'json') => {
    setOpen(false);
    location.href = mu(`/api/memory/export?format=${format}`);
  };
  return (
    <>
      <Button ref={ref} size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => setOpen((o) => !o)}>
        Export
      </Button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={260} title="Export">
        <MenuItem icon={<FileText size={14} />} hint="A list to read" onClick={() => get('md')}>
          Markdown
        </MenuItem>
        <MenuItem icon={<FileJson size={14} />} hint="With histories" onClick={() => get('json')}>
          JSON
        </MenuItem>
      </Popover>
    </>
  );
}

function Notes() {
  const st = useMemoryState();
  const version = useMemory((s) => s.version);
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [list, setList] = useState<{ entries: MemoryListEntry[]; searched: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const query = view === 'stale' ? '' : q.trim();
  // Only the latest request's answer shows (an earlier one can arrive after it).
  const latest = useRef(0);
  const load = useCallback(() => {
    const n = ++latest.current;
    const p = new URLSearchParams();
    if (view === 'deleted') p.set('status', 'deleted');
    else if (view === 'stale') p.set('stale', '1');
    else if (view !== 'all') p.set('scope', view);
    if (query) p.set('q', query);
    api<{ entries: MemoryListEntry[] }>(`/api/memory/entries?${p}`)
      .then((r) => n === latest.current && setList({ entries: r.entries, searched: !!query }))
      .catch(toastError);
  }, [view, query]);
  useEffect(() => {
    const t = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, version]);
  // By place: about you, then each project, then the sessions'. A search keeps its order (the best first).
  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const e of list?.entries ?? []) {
      // Your profile has a section of its own (a cleared one shows among the deleted, to restore).
      if (isUserProfile(e) && e.status === 'active') continue;
      const key = e.scope === 'repo' ? e.scopeKey : '';
      const k = `${e.scope}\u0000${key}`;
      if (!m.has(k)) m.set(k, { scope: e.scope, key, entries: [] });
      m.get(k)!.entries.push(e);
    }
    const out = [...m.values()].sort((a, b) => ORDER[a.scope] - ORDER[b.scope]);
    if (!list?.searched) for (const g of out) g.entries.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    return out;
  }, [list]);
  const reload = () => {
    load();
    reloadState();
  };
  const c = st?.counts;
  const total = c ? c.global + c.repo + c.session : 0;
  const main = view !== 'stale' && view !== 'deleted';
  const clear = async () => {
    const ok = await confirm({
      title: 'Clear all memory?',
      body: 'Every note about you, your projects and your sessions goes, with its history. This cannot be undone; export first to keep a copy.',
      confirm: 'Clear all',
      danger: true,
    });
    if (!ok) return;
    del<{ cleared: number }>('/api/memory', { confirm: 'all' })
      .then((r) => (toast(`Cleared ${r.cleared} note${r.cleared === 1 ? '' : 's'}`), reload()))
      .catch(toastError);
  };
  const search = (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        placeholder={st?.meaning.status === 'ready' ? 'Search the notes, by words or meaning' : 'Search the notes'}
        className={cx(inputCls, 'h-9 pl-8 text-[13.5px]')}
      />
    </div>
  );
  // The counts beside the tabs only where there is room for them; the groups count their notes too.
  const count = (n?: number) => !!n && <span className="tnum hidden rounded-md bg-bg-2 px-1.5 text-[11.5px] font-normal text-fg-3 @md:inline">{n}</span>;
  return (
    // On a phone the notes sit on the page itself, so a note has the screen's width.
    <section className="@container sm:rounded-2xl sm:border sm:border-line sm:bg-panel sm:px-5 sm:pt-4 sm:pb-4">
      <header className="px-1 sm:px-0">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 text-[14.5px] font-semibold">Notes</h2>
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} disabled={adding} onClick={() => setAdding(true)} className="-my-1">
            Add a note
          </Button>
        </div>
        <div className="text-[12.5px] text-fg-3">{c ? `${total} kept: ${c.global} about you, ${c.repo} in projects, ${c.session} in sessions` : ' '}</div>
      </header>
      <div className="mt-3 space-y-3">
        {st && !st.enabled && (
          <div className="flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2 text-[12.5px] leading-snug text-warn">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>Memory is off: agents don’t get these notes, and save no new ones.</span>
          </div>
        )}
        {adding && (
          <AddNote
            onDone={(saved) => {
              setAdding(false);
              if (!saved) return;
              // Where the new note shows.
              setQ('');
              if (view !== saved) setView('all');
              reload();
            }}
          />
        )}
        {main ? (
          <>
            {search}
            <Tabs<View>
              value={view}
              onChange={setView}
              className="-mx-1 border-b border-line"
              options={[
                {
                  value: 'all',
                  label: (
                    <>
                      <span>All</span>
                      {count(total)}
                    </>
                  ),
                },
                {
                  value: 'global',
                  label: (
                    <>
                      <span>About you</span>
                      {count(c?.global)}
                    </>
                  ),
                },
                {
                  value: 'repo',
                  label: (
                    <>
                      <span>Projects</span>
                      {count(c?.repo)}
                    </>
                  ),
                },
                {
                  value: 'session',
                  label: (
                    <>
                      <span>Sessions</span>
                      {count(c?.session)}
                    </>
                  ),
                },
              ]}
            />
            {view !== 'session' && !query && !!st?.stale && (
              <button onClick={() => setView('stale')} className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-bg-1 px-3 py-2.5 text-left transition-colors hover:bg-bg-2">
                <Hourglass size={15} className="shrink-0 text-fg-3" />
                <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg-2">{st.stale === 1 ? 'One note no agent has needed for four months' : `${st.stale} notes no agent has needed for four months`}</span>
                <span className="flex shrink-0 items-center gap-0.5 text-[12.5px] font-medium text-fg">
                  Review <ChevronRight size={14} />
                </span>
              </button>
            )}
          </>
        ) : (
          <>
            <div>
              <button onClick={() => setView('all')} className="-ml-0.5 inline-flex items-center gap-0.5 rounded-md text-[12.5px] text-fg-3 transition-colors hover:text-fg">
                <ChevronLeft size={14} /> All notes
              </button>
              <h3 className="mt-1 text-[13.5px] font-medium">{view === 'deleted' ? 'Deleted notes' : 'Not needed lately'}</h3>
              <p className="mt-0.5 text-[12.5px] leading-snug text-fg-3">
                {view === 'deleted'
                  ? 'Deleted notes stay here for 30 days, then go for good.'
                  : 'No agent has needed these for four months: not changed, not found, not given as bearing on a request. Keep what still matters; delete the rest.'}
              </p>
            </div>
            {view === 'deleted' && search}
          </>
        )}
        {!list ? (
          <div className="flex justify-center py-8">
            <Throbber className="text-fg-3" />
          </div>
        ) : !list.entries.length ? (
          <Empty icon={<Brain size={20} />} title={query ? 'No notes match' : view === 'deleted' ? 'Nothing deleted' : view === 'stale' ? 'Every note was needed lately' : 'Nothing kept yet'}>
            {!query && main && 'Notes show up here when you ask an agent to remember something, or it learns something lasting about you or a project.'}
          </Empty>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={`${g.scope}:${g.key}`}>
                <GroupHead g={g} />
                <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
                  {g.entries.map((e) => (
                    <EntryRow key={e.id} e={e} view={view} reload={reload} inSessions={g.scope === 'session'} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {main && (
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-line pt-3">
            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setView('deleted')} className="-ml-2">
              Deleted notes
            </Button>
            <span className="flex-1" />
            <ExportMenu />
            <Button size="sm" variant="ghost" icon={<Eraser size={14} />} disabled={!total} onClick={() => void clear()} className="-mr-2 !text-err">
              Clear all…
            </Button>
          </div>
        )}
      </div>
      {confirmNode}
    </section>
  );
}

export function MemorySettings() {
  return (
    // Menus open as sheets from the bottom on a phone.
    <SheetsOnPhone.Provider value>
      <div className="space-y-4">
        <Switches />
        <Profile />
        <Notes />
      </div>
    </SheetsOnPhone.Provider>
  );
}
