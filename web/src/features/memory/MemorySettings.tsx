// Settings → Memory: memory on or off for all sessions; search by meaning (set up on this computer, where it
// runs, how many notes have their vectors); the nightly tidy-up (when it ran, each change it made, undoable,
// and running it now); and every note kept so far by place (about you, each project, each session),
// searchable by words and meaning, with its kind, end date, when it was written, changed and last needed,
// and the session it came from: edit, end dates, delete, the history of changes, what a summary sums up, and
// the notes no agent has needed for months, to keep or remove. Export and clear all.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArchiveRestore, Brain, CalendarClock, Check, ChevronRight, Download, Eraser, FolderGit2, History, Layers, MessageSquare, Pencil, RotateCw, Search, Sparkles, Trash2, TriangleAlert, Undo2, UserRound } from 'lucide-react';
import type { MemoryChange, MemoryHistoryRow, MemoryListEntry, MemoryScope, MemoryState } from '@shared/memory';
import { changeSummary } from '@shared/memory';
import { Badge, Button, cx, Empty, IconButton, inputCls, Section, Segmented, Switch, Tabs, Throbber, useConfirm } from '../../components/ui';
import { api, del, patch, post, put } from '../../lib/api';
import { ago, tildify } from '../../lib/format';
import { mu } from '../../lib/machine';
import { go, sessionPath } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { ChangeBadge, EntryEditor } from './parts';
import { placeName, SOURCE, useMemory, useMemoryState } from './state';

type Filter = 'all' | MemoryScope | 'stale' | 'deleted';
type HistoryRow = MemoryHistoryRow & { sessionTitle?: string };

const ORDER: Record<MemoryScope, number> = { global: 0, repo: 1, session: 2 };
const ACTION: Record<MemoryHistoryRow['action'], string> = { added: 'Added', updated: 'Changed', deleted: 'Deleted', restored: 'Restored', expiry: 'End date' };
const when = (t: number) => new Date(t).toLocaleString();
const dayOf = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
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

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-[200px] flex-1">
        <div className="text-[13.5px] text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function SessionLink({ k, title }: { k: string; title?: string }) {
  return (
    <button onClick={() => go(sessionPath(k))} title={title ?? k} className="inline max-w-[16rem] truncate align-bottom text-fg-2 underline-offset-2 hover:text-fg hover:underline">
      {title ?? 'a session that is gone'}
    </button>
  );
}

function Status({ icon, tone, children }: { icon: ReactNode; tone?: 'warn'; children: ReactNode }) {
  return <div className={cx('flex items-start gap-2 pb-3 text-[12.5px] leading-snug', tone === 'warn' ? 'text-warn' : 'text-fg-3')}>{icon}<span className="min-w-0">{children}</span></div>;
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
    <>
      <Row
        label="Search by meaning"
        hint="Finds notes by what they mean, not only their words, in nine languages, with LightOn's mDenseOn model on this computer. Sets up PyTorch once (about 1 GB, or 5 GB with an NVIDIA GPU) and the model (1.2 GB). On a CPU it starts only when needed and stops after a few idle minutes."
      >
        <Switch on={st.enabled && m.on} disabled={!st.enabled} label="Search by meaning" onChange={(on) => set({ meaning: on })} />
      </Row>
      {st.enabled && m.on && (
        <>
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3">
            <div className="min-w-[200px] flex-1 text-[12px] leading-snug text-fg-3">Where it runs: on a GPU with room when there is one, or keep it on the CPU to leave the GPUs to other work.</div>
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
        </>
      )}
    </>
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
        <Row label="Memory" hint="Agents start with what earlier sessions kept about you, your projects and the session they go on with, and save notes when you ask or they learn something lasting. Off: they get none, and nothing is written.">
          <Switch on={st.enabled} label="Memory" onChange={(on) => set({ enabled: on })} />
        </Row>
        <div>
          <Meaning st={st} set={set} />
        </div>
        <Row label="Tidy up each night" hint="The helper model (Settings → Models) merges notes that say the same thing and dates the ones true only for a while. Once a place's notes no longer fit what agents get, it sums related ones up in topics and a short profile. It reads notes only, never conversations.">
          <Switch on={st.enabled && st.tidyOn} disabled={!st.enabled} label="Tidy up each night" onChange={(on) => set({ tidy: on })} />
        </Row>
        {st.enabled && <Tidy st={st} />}
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
    <div className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[200px] flex-1 text-[12.5px] leading-snug text-fg-3">
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
                  : nothing to change. Before that, <span title={when(r.changesAt)}>{ago(r.changesAt)}</span>: {changeSummary(r.changes)}.
                </>
              ) : r.changes.length ? (
                `: ${changeSummary(r.changes)}.`
              ) : (
                `: nothing to change (${r.checked} note${r.checked === 1 ? '' : 's'} looked at).`
              )}
            </>
          )}
        </div>
        {r && r.changes.length > 0 && (
          <Button size="sm" variant="ghost" icon={<ChevronRight size={14} className={cx('transition-transform', open && 'rotate-90')} />} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide' : `What changed (${live})`}
          </Button>
        )}
        <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} disabled={r?.running} onClick={() => void now()}>
          Tidy up now
        </Button>
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
    <ol className="mt-2 space-y-2 border-l-2 border-line pl-3">
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
  if (!list.length) return <div className="mt-2 text-[12px] text-fg-3">It sums up no notes kept now.</div>;
  return (
    <ul className="mt-2 space-y-1 border-l-2 border-line pl-3 text-[12.5px] leading-snug">
      {list.map((e) => (
        <li key={e.id} className={cx('break-words', e.status === 'deleted' ? 'text-fg-3 line-through decoration-fg-3/60' : 'text-fg-2')}>
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
    <div className="mt-2 flex flex-wrap items-center gap-2">
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
      <Button size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
}

function EntryRow({ e, reload, stale }: { e: MemoryListEntry; reload: () => void; stale?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<'history' | 'children' | 'end' | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const deleted = e.status === 'deleted';
  const toggle = (k: 'history' | 'children' | 'end') => setOpen((o) => (o === k ? null : k));
  const act = (p: Promise<unknown>) =>
    p
      .then(reload)
      .catch(toastError);
  return (
    <div className="px-3.5 py-2.5">
      {/* On a phone the buttons go under the note, so its text keeps the width. */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
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
            <div className={cx('text-[13.5px] leading-snug break-words', deleted ? 'text-fg-3 line-through decoration-fg-3/60' : 'text-fg')}>
              {e.kind !== 'note' && (
                <Badge tone="info" className="mr-1.5 align-[1px]">
                  {e.kind === 'topic' ? 'Topic' : 'Profile'}
                </Badge>
              )}
              {e.text}
            </div>
          )}
          <div className="mt-1 text-[12px] leading-snug text-fg-3">
            <span title={when(e.createdAt)}>Added {ago(e.createdAt)}</span>
            {e.updatedAt !== e.createdAt && (
              <span title={when(e.updatedAt)}>
                {' '}
                · {deleted ? 'deleted' : 'changed'} {ago(e.updatedAt)}
              </span>
            )}{' '}
            · by {SOURCE[e.source]}
            {e.session && (
              <>
                {' '}
                in <SessionLink k={e.session} title={e.sessionTitle} />
              </>
            )}
            {e.kind !== 'note' && ` · sums up ${e.covers ?? 0} note${e.covers === 1 ? '' : 's'}`}
            {e.uses > 0 && (
              <span title={e.usedAt ? when(e.usedAt) : undefined}>
                {' '}
                · needed {e.uses === 1 ? 'once' : `${e.uses} times`}
                {e.usedAt && `, last ${ago(e.usedAt)}`}
              </span>
            )}
            {e.expiresAt && !deleted && <span className="text-fg-2"> · until {dayOf(e.expiresAt)}</span>}
          </div>
        </div>
        {!editing && (
          <div className="-mr-1.5 -mb-1 flex shrink-0 items-center self-end sm:-mt-1 sm:mb-0 sm:self-auto">
            {e.kind !== 'note' && (
              <IconButton size="sm" label="What it sums up" active={open === 'children'} onClick={() => toggle('children')}>
                <Layers size={14} />
              </IconButton>
            )}
            <IconButton size="sm" label="History of changes" active={open === 'history'} onClick={() => toggle('history')}>
              <History size={14} />
            </IconButton>
            {deleted ? (
              <>
                <IconButton size="sm" label="Restore" onClick={() => act(post(`/api/memory/entries/${e.id}/restore`))}>
                  <ArchiveRestore size={14} />
                </IconButton>
                <IconButton
                  size="sm"
                  label="Erase for good"
                  onClick={async () => {
                    if (await confirm({ title: 'Erase this note for good?', body: 'It goes with its history, and cannot come back.', confirm: 'Erase', danger: true }))
                      act(del(`/api/memory/entries/${e.id}?forever=1`));
                  }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </>
            ) : (
              <>
                {stale && (
                  <IconButton size="sm" label="Keep it" onClick={() => act(post(`/api/memory/entries/${e.id}/keep`).then(() => toast('Kept')))}>
                    <Check size={14} />
                  </IconButton>
                )}
                <IconButton size="sm" label="End date" active={open === 'end'} onClick={() => toggle('end')}>
                  <CalendarClock size={14} />
                </IconButton>
                <IconButton size="sm" label="Edit" onClick={() => setEditing(true)}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton size="sm" label="Delete" onClick={() => act(del(`/api/memory/entries/${e.id}`).then(() => toast('Deleted. It stays under Deleted for 30 days.')))}>
                  <Trash2 size={14} />
                </IconButton>
              </>
            )}
          </div>
        )}
      </div>
      {open === 'history' && <HistoryList id={e.id} />}
      {open === 'children' && <Children id={e.id} />}
      {open === 'end' && <EndDate e={e} onDone={() => (setOpen(null), reload())} />}
      {confirmNode}
    </div>
  );
}

interface Group {
  scope: MemoryScope;
  key: string;
  entries: MemoryListEntry[];
}

function GroupHead({ g }: { g: Group }) {
  const home = useApp((s) => s.boot?.home);
  const e0 = g.entries[0];
  const Icon = g.scope === 'global' ? UserRound : g.scope === 'repo' ? FolderGit2 : MessageSquare;
  return (
    <div className="flex min-w-0 items-center gap-2 px-1 pb-1.5">
      <Icon size={14} className="shrink-0 text-fg-3" />
      {g.scope === 'session' ? (
        <button onClick={() => go(sessionPath(g.key))} className="min-w-0 truncate text-left text-[13px] font-medium hover:underline" title="Open the session">
          {e0.scopeLabel}
        </button>
      ) : (
        <span className="shrink-0 text-[13px] font-medium">{e0.scopeLabel}</span>
      )}
      {g.scope === 'repo' && <span className="min-w-0 truncate font-mono text-[11.5px] text-fg-3">{tildify(g.key, home)}</span>}
      <span className="ml-auto shrink-0 pl-2 text-[12px] text-fg-3">{g.entries.length}</span>
    </div>
  );
}

function Entries() {
  const st = useMemoryState();
  const version = useMemory((s) => s.version);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [list, setList] = useState<MemoryListEntry[] | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (filter === 'deleted') p.set('status', 'deleted');
    else if (filter === 'stale') p.set('stale', '1');
    else if (filter !== 'all') p.set('scope', filter);
    if (q.trim() && filter !== 'stale') p.set('q', q.trim());
    api<{ entries: MemoryListEntry[] }>(`/api/memory/entries?${p}`)
      .then((r) => setList(r.entries))
      .catch(toastError);
  }, [filter, q]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, version]);
  // By place: about you, then each project and each session. A search keeps its order (the best first).
  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const e of list ?? []) {
      const k = `${e.scope}\u0000${e.scopeKey}`;
      if (!m.has(k)) m.set(k, { scope: e.scope, key: e.scopeKey, entries: [] });
      m.get(k)!.entries.push(e);
    }
    return [...m.values()].sort((a, b) => ORDER[a.scope] - ORDER[b.scope]);
  }, [list]);
  const reload = () => {
    load();
    reloadState();
  };
  const c = st?.counts;
  const total = c ? c.global + c.repo + c.session : 0;
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
  return (
    <Section
      title="Notes"
      sub={c ? `${total} kept: ${c.global} about you, ${c.repo} in projects, ${c.session} in sessions` : ' '}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => (location.href = mu('/api/memory/export?format=json'))}>
            JSON
          </Button>
          <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => (location.href = mu('/api/memory/export?format=md'))}>
            Markdown
          </Button>
          <Button size="sm" variant="secondary" icon={<Eraser size={14} />} disabled={!total} onClick={() => void clear()} className="!text-err">
            Clear all…
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {filter !== 'stale' && (
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQ('')}
              placeholder={st?.meaning.status === 'ready' ? 'Search the notes, by words or meaning' : 'Search the notes'}
              className={cx(inputCls, 'h-8.5 pl-8 text-[13.5px]')}
            />
          </div>
        )}
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          className="-mx-1 border-b border-line"
          options={[
            { value: 'all', label: 'All', count: total },
            { value: 'global', label: 'About you', count: c?.global },
            { value: 'repo', label: 'Projects', count: c?.repo },
            { value: 'session', label: 'Sessions', count: c?.session },
            ...(st?.stale ? [{ value: 'stale' as const, label: 'Not needed lately', count: st.stale }] : []),
            { value: 'deleted', label: 'Deleted' },
          ]}
        />
        {filter === 'stale' && (
          <div className="text-[12.5px] leading-snug text-fg-3">No agent has needed these for four months: not changed, not found, not given as bearing on a request. Keep what still matters (✓); delete the rest.</div>
        )}
        {!list ? (
          <div className="flex justify-center py-8">
            <Throbber className="text-fg-3" />
          </div>
        ) : !list.length ? (
          <Empty icon={<Brain size={20} />} title={q.trim() ? 'No notes match' : filter === 'deleted' ? 'Nothing deleted' : filter === 'stale' ? 'Every note was needed lately' : 'Nothing kept yet'}>
            {!q.trim() && filter !== 'deleted' && filter !== 'stale' && 'Notes show up here when you ask an agent to remember something, or it learns something lasting about you or a project.'}
          </Empty>
        ) : (
          <div className="space-y-4 pt-1">
            {groups.map((g) => (
              <div key={`${g.scope}:${g.key}`}>
                <GroupHead g={g} />
                <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {g.entries.map((e) => (
                    <EntryRow key={e.id} e={e} reload={reload} stale={filter === 'stale'} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {confirmNode}
    </Section>
  );
}

export function MemorySettings() {
  return (
    <div className="space-y-4">
      <Switches />
      <Entries />
    </div>
  );
}
