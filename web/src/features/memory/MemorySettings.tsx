// Settings → Memory: memory on or off for all sessions, writing after each reply on or off, and every note
// kept so far by place (about you, each project, each session), searchable, with when each was written
// and changed and the session it came from; edit, delete and the history of changes. Export and clear all.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArchiveRestore, Brain, Download, Eraser, FolderGit2, History, MessageSquare, Pencil, Search, Trash2, TriangleAlert, UserRound } from 'lucide-react';
import type { MemoryHistoryRow, MemoryListEntry, MemoryScope } from '@shared/memory';
import { Button, cx, Empty, IconButton, inputCls, Section, Switch, Tabs, Throbber, useConfirm } from '../../components/ui';
import { api, del, patch, post, put } from '../../lib/api';
import { ago, tildify } from '../../lib/format';
import { mu } from '../../lib/machine';
import { go, sessionPath } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { EntryEditor } from './parts';
import { SOURCE, useMemory, useMemoryState } from './state';

type Filter = 'all' | MemoryScope | 'deleted';
type HistoryRow = MemoryHistoryRow & { sessionTitle?: string };

const ORDER: Record<MemoryScope, number> = { global: 0, repo: 1, session: 2 };
const ACTION: Record<MemoryHistoryRow['action'], string> = { added: 'Added', updated: 'Changed', deleted: 'Deleted', restored: 'Restored' };
const when = (t: number) => new Date(t).toLocaleString();

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
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

function Switches() {
  const st = useMemoryState();
  const set = (p: { enabled?: boolean; auto?: boolean }) =>
    put('/api/memory', p)
      .then(() => useMemory.getState().load())
      .catch(toastError);
  if (!st) return null;
  return (
    <Section>
      <div className="-my-2 divide-y divide-line">
        <Row label="Memory" hint="Agents start with what earlier sessions learned about you, your projects and the session they go on with. Off: they get none, and nothing is written.">
          <Switch on={st.enabled} label="Memory" onChange={(on) => void set({ enabled: on })} />
        </Row>
        <Row
          label="Write after each reply"
          hint="The helper model (Settings → Models) notes what is worth keeping after each reply; a note under the reply shows the changes. Off: agents still save notes when you ask them to."
        >
          <Switch on={st.enabled && st.auto} disabled={!st.enabled} label="Write after each reply" onChange={(on) => void set({ auto: on })} />
        </Row>
        {st.enabled && st.auto && st.lastError && (
          <div className="flex items-start gap-2 py-3 text-[12.5px] text-warn">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              The last update failed {ago(st.lastError.at)}: {st.lastError.message}
            </span>
          </div>
        )}
      </div>
    </Section>
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
        </li>
      ))}
    </ol>
  );
}

function EntryRow({ e, reload }: { e: MemoryListEntry; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [hist, setHist] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const deleted = e.status === 'deleted';
  const act = (p: Promise<unknown>) =>
    p
      .then(reload)
      .catch(toastError);
  return (
    <div className="px-3.5 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <EntryEditor
              text={e.text}
              onCancel={() => setEditing(false)}
              onSave={(text) =>
                patch(`/api/memory/entries/${e.id}`, { text })
                  .then(() => (setEditing(false), reload()))
                  .catch(toastError)
              }
            />
          ) : (
            <div className={cx('text-[13.5px] leading-snug break-words', deleted ? 'text-fg-3 line-through decoration-fg-3/60' : 'text-fg')}>{e.text}</div>
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
          </div>
        </div>
        {!editing && (
          <div className="-mt-1 -mr-1.5 flex shrink-0 items-center">
            <IconButton size="sm" label="History of changes" active={hist} onClick={() => setHist((h) => !h)}>
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
      {hist && <HistoryList id={e.id} />}
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
    else if (filter !== 'all') p.set('scope', filter);
    if (q.trim()) p.set('q', q.trim());
    api<{ entries: MemoryListEntry[] }>(`/api/memory/entries?${p}`)
      .then((r) => setList(r.entries))
      .catch(toastError);
  }, [filter, q]);
  useEffect(() => {
    const t = setTimeout(load, q ? 200 : 0);
    return () => clearTimeout(t);
  }, [load, version]);
  // By place: about you, then each project and each session, the latest changed first.
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
    useMemory
      .getState()
      .load()
      .catch(() => {});
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
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} placeholder="Search the notes" className={cx(inputCls, 'h-8.5 pl-8 text-[13.5px]')} />
        </div>
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          className="-mx-1 border-b border-line"
          options={[
            { value: 'all', label: 'All', count: total },
            { value: 'global', label: 'About you', count: c?.global },
            { value: 'repo', label: 'Projects', count: c?.repo },
            { value: 'session', label: 'Sessions', count: c?.session },
            { value: 'deleted', label: 'Deleted' },
          ]}
        />
        {!list ? (
          <div className="flex justify-center py-8">
            <Throbber className="text-fg-3" />
          </div>
        ) : !list.length ? (
          <Empty icon={<Brain size={20} />} title={q.trim() ? 'No notes match' : filter === 'deleted' ? 'Nothing deleted' : 'Nothing kept yet'}>
            {!q.trim() && filter !== 'deleted' && 'After each reply, what is worth remembering shows up here: about you, about each project, and where each session stands.'}
          </Empty>
        ) : (
          <div className="space-y-4 pt-1">
            {groups.map((g) => (
              <div key={`${g.scope}:${g.key}`}>
                <GroupHead g={g} />
                <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {g.entries.map((e) => (
                    <EntryRow key={e.id} e={e} reload={reload} />
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
