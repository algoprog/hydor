// The note under a reply when memory changed in that turn: a chip ("Memory · 2 added, 1 updated") that
// opens to show each change, before and after, with undo, edit and delete. Its menu turns memory off
// for the session, or opens Settings → Memory.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArchiveRestore, Brain, ChevronRight, MoreHorizontal, Pencil, Settings2, Trash2, Undo2 } from 'lucide-react';
import type { SessionNote } from '@shared/features';
import { changeSummary, type MemoryChange, type MemoryEntry, type MemoryNoteData } from '@shared/memory';
import { cx, IconButton, MenuItem, Popover } from '../../components/ui';
import { del, enc, patch, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError, useSessions } from '../../lib/store';
import { ChangeBadge, EntryEditor, SessionMemoryItem } from './parts';
import { fetchEntries, placeName, useMemory, useMemoryState } from './state';

/** `entry` is what it says now: undefined while loading, null when it was erased (cleared from Settings). */
function ChangeRow({ c, i, noteId, entry, here, reload }: { c: MemoryChange; i: number; noteId: string; entry?: MemoryEntry | null; here: string; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const active = entry?.status === 'active';
  const gone = entry?.status === 'deleted';
  const erased = entry === null;
  // What it says now, when that differs from what this turn wrote.
  const now = active && c.after && entry.text !== c.after ? entry.text : null;
  const act = (p: Promise<unknown>) =>
    p
      .then(reload)
      .catch(toastError);
  return (
    <div className={cx('px-4 py-2.5', c.undone && 'opacity-60')}>
      <div className="flex min-h-7 items-center gap-2">
        <ChangeBadge c={c} />
        <span className="min-w-0 truncate text-[12px] text-fg-3">
          {placeName(c.scope, c.scopeKey, here)}
          {c.source === 'agent' && ' · saved by the agent'}
        </span>
        <span className="flex-1" />
        {!c.undone && !editing && !erased && (
          <div className="-my-1 flex shrink-0 items-center">
            <IconButton size="sm" label="Undo this change" onClick={() => act(post(`/api/memory/notes/${enc(noteId)}/undo`, { index: i }))}>
              <Undo2 size={14} />
            </IconButton>
            {active && (
              <IconButton size="sm" label="Edit" onClick={() => setEditing(true)}>
                <Pencil size={14} />
              </IconButton>
            )}
            {active && (
              <IconButton size="sm" label="Delete" onClick={() => act(del(`/api/memory/entries/${c.entry}`))}>
                <Trash2 size={14} />
              </IconButton>
            )}
            {gone && c.action !== 'deleted' && (
              <IconButton size="sm" label="Restore" onClick={() => act(post(`/api/memory/entries/${c.entry}/restore`))}>
                <ArchiveRestore size={14} />
              </IconButton>
            )}
          </div>
        )}
      </div>
      {editing && entry ? (
        <div className="mt-1.5">
          <EntryEditor
            text={entry.text}
            onCancel={() => setEditing(false)}
            onSave={(text) =>
              patch(`/api/memory/entries/${c.entry}`, { text })
                .then(() => (setEditing(false), reload()))
                .catch(toastError)
            }
          />
        </div>
      ) : (
        <div className="mt-1 space-y-0.5 text-[13.5px] leading-snug break-words">
          {c.before && <div className="text-fg-3 line-through decoration-fg-3/60">{c.before}</div>}
          {c.after && <div className={cx('text-fg', gone && !c.undone && 'text-fg-3 line-through decoration-fg-3/60')}>{c.after}</div>}
          {now && (
            <div className="text-fg">
              <span className="text-[12px] text-fg-3">Now: </span>
              {now}
            </div>
          )}
        </div>
      )}
      {(c.why || erased || (gone && c.action !== 'deleted' && !c.undone)) && (
        <div className="mt-0.5 text-[12px] text-fg-3">{[c.why, erased ? 'No longer kept' : gone && c.action !== 'deleted' && !c.undone ? 'Deleted since' : ''].filter(Boolean).join(' · ')}</div>
      )}
    </div>
  );
}

export function MemoryNote({ note, sessionKey }: { note: SessionNote; sessionKey: string }) {
  const changes = (note.data as MemoryNoteData | null)?.changes ?? [];
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [live, setLive] = useState<Map<number, MemoryEntry> | null>(null);
  const state = useMemoryState();
  const version = useMemory((s) => s.version);
  const on = useSessions((s) => s.byKey[sessionKey]?.extra?.memory) !== false;
  const ids = changes.map((c) => c.entry).join(',');
  const reload = useCallback(() => {
    fetchEntries(ids ? ids.split(',').map(Number) : [])
      .then(setLive)
      .catch(() => {});
  }, [ids]);
  // While open, what each entry says now (it may have been edited or deleted since).
  useEffect(() => {
    if (open) reload();
  }, [open, reload, version, note.data]);
  if (!changes.length) return null;
  const summary = changeSummary(changes);
  if (!open)
    return (
      <div className="mt-3">
        <button
          onClick={() => setOpen(true)}
          aria-expanded={false}
          title="What memory kept from this turn"
          className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
        >
          <Brain size={13} className="shrink-0 text-fg-3" />
          <span className="truncate">Memory · {summary}</span>
          <ChevronRight size={13} className="shrink-0 text-fg-3" />
        </button>
      </div>
    );
  return (
    <div className="anim-in mt-3 overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-1 py-1 pr-1.5 pl-2">
        <button onClick={() => setOpen(false)} aria-expanded className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-bg-2">
          <Brain size={15} className="shrink-0 text-fg-3" />
          <span className="shrink-0 font-medium">Memory</span>
          <span className="truncate text-fg-3">{summary}</span>
          <ChevronRight size={14} className="ml-auto shrink-0 rotate-90 text-fg-3" />
        </button>
        <IconButton ref={menuRef} size="sm" label="Memory options" onClick={() => setMenu((m) => !m)}>
          <MoreHorizontal size={16} />
        </IconButton>
        <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={270}>
          <SessionMemoryItem sessionKey={sessionKey} on={on} allOff={!!state && !state.enabled} close={() => setMenu(false)} />
          <MenuItem icon={<Settings2 size={15} />} onClick={() => (setMenu(false), go('/settings?s=memory'))}>
            All memory…
          </MenuItem>
        </Popover>
      </div>
      <div className="divide-y divide-line border-t border-line">
        {changes.map((c, i) => (
          <ChangeRow key={`${c.entry}-${i}`} c={c} i={i} noteId={note.id} entry={live ? (live.get(c.entry) ?? null) : undefined} here={sessionKey} reload={reload} />
        ))}
      </div>
    </div>
  );
}
