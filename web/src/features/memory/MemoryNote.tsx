// The note under a reply when memory changed in that turn: a chip ("Memory · 2 added, 1 updated") that
// opens to show each change, what it took out and put in, with undo, edit and delete. A turn's notes show
// as one chip, and an entry changed several times as one change, from what it said before to what it says
// after. Its menu turns memory off for the session, or opens Settings → Memory.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveRestore, Brain, ChevronRight, MoreHorizontal, Pencil, Settings2, Trash2, Undo2 } from 'lucide-react';
import type { SessionNote } from '@shared/features';
import { changeSummary, isUserProfile, type MemoryChange, type MemoryEntry, type MemoryNoteData } from '@shared/memory';
import { cx, IconButton, MenuItem, Popover } from '../../components/ui';
import { del, enc, patch, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError, useSessions } from '../../lib/store';
import { ChangeBadge, EntryEditor, SessionMemoryItem } from './parts';
import { fetchEntries, placeName, useMemory, useMemoryState } from './state';

/** A change as its note holds it: undone there by its index. */
interface Step {
  c: MemoryChange;
  noteId: string;
  index: number;
}

/** What one entry went through in the turn: `c` reads from before its first change to after its last. */
interface Row {
  c: MemoryChange;
  steps: Step[];
}

const MERGED = new Set<string>(['added', 'updated', 'deleted']);

function mergedChange(steps: Step[]): MemoryChange {
  const first = steps[0].c;
  const last = steps[steps.length - 1].c;
  if (steps.length === 1) return first;
  const undone = steps.every((s) => s.c.undone);
  if (last.action === 'deleted') return { ...last, undone };
  return { ...last, action: first.action === 'added' ? 'added' : 'updated', before: first.action === 'added' ? undefined : first.before, undone };
}

/** One row per entry, in the order they first changed. */
function rowsOf(notes: SessionNote[]): Row[] {
  const rows: Row[] = [];
  const byEntry = new Map<number, Row>();
  for (const n of notes)
    ((n.data as MemoryNoteData | null)?.changes ?? []).forEach((c, index) => {
      const step = { c, noteId: n.id, index };
      const merges = MERGED.has(c.action);
      const row = merges ? byEntry.get(c.entry) : undefined;
      if (row) row.steps.push(step);
      else {
        const r: Row = { c, steps: [step] };
        rows.push(r);
        if (merges) byEntry.set(c.entry, r);
      }
    });
  for (const r of rows) r.c = mergedChange(r.steps);
  return rows;
}

/** Words with the space after them, compared without it. */
const words = (s: string) => s.match(/^\s+|\S+\s*/g) ?? [];

/** What changed from `a` to `b`, word by word: runs kept (0), taken out (-1) and put in (1). */
function wordDiff(a: string, b: string): { t: string; op: -1 | 0 | 1 }[] {
  const A = words(a);
  const B = words(b);
  const same = (i: number, j: number) => A[i].trim() === B[j].trim();
  // Longest common run of words, from the end.
  const L = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = same(i, j) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { t: string; op: -1 | 0 | 1 }[] = [];
  const push = (t: string, op: -1 | 0 | 1) => {
    const last = out[out.length - 1];
    if (last?.op === op) last.t += t;
    else out.push({ t, op });
  };
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (same(i, j)) {
      push(B[j], 0);
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) push(A[i++], -1);
    else push(B[j++], 1);
  }
  while (i < A.length) push(A[i++], -1);
  while (j < B.length) push(B[j++], 1);
  return out;
}

/** `from` → `to` in one paragraph: what was taken out struck through, what was put in marked. Mostly rewritten, the old text shows on its own, shortened. */
function WordDiff({ from, to }: { from: string; to: string }) {
  const parts = useMemo(() => wordDiff(from, to), [from, to]);
  const kept = parts.reduce((n, p) => n + (p.op === 0 ? p.t.length : 0), 0);
  if (kept < 0.4 * Math.max(from.length, to.length))
    return (
      <>
        <div className="line-clamp-2 text-fg-3 line-through decoration-fg-3/60" title={from}>
          {from}
        </div>
        <div className="text-fg">{to}</div>
      </>
    );
  return (
    <div className="text-fg-2">
      {parts.map((p, i) =>
        p.op === 0 ? (
          <span key={i}>{p.t}</span>
        ) : p.op < 0 ? (
          <del key={i} className="text-fg-3 decoration-err/60">
            {p.t}
          </del>
        ) : (
          <ins key={i} className="rounded-[3px] bg-ok/15 text-fg no-underline">
            {p.t}
          </ins>
        ),
      )}
    </div>
  );
}

/** `entry` is what it says now: undefined while loading, null when it was erased (cleared from Settings). */
function ChangeRow({ row, entry, here, reload }: { row: Row; entry?: MemoryEntry | null; here: string; reload: () => void }) {
  const { c, steps } = row;
  const [editing, setEditing] = useState(false);
  const [showNow, setShowNow] = useState(false);
  const active = entry?.status === 'active';
  const gone = entry?.status === 'deleted';
  const erased = entry === null;
  // What it says now, when that differs from what this turn wrote.
  const now = active && c.after && entry.text !== c.after ? entry.text : null;
  const act = (p: Promise<unknown>) =>
    p
      .then(reload)
      .catch(toastError);
  // Newest first: each puts back what the change before it had written.
  const undo = async () => {
    for (const s of [...steps].reverse()) if (!s.c.undone) await post(`/api/memory/notes/${enc(s.noteId)}/undo`, { index: s.index });
  };
  const struck = gone && !c.undone && c.action !== 'deleted';
  // Your profile is edited, and cleared, in Settings → Memory: there it has room for its lines.
  const profile = isUserProfile(c);
  return (
    <div className={cx('px-4 py-2.5', c.undone && 'opacity-60')}>
      <div className="flex min-h-7 items-center gap-2">
        <ChangeBadge c={c} />
        <span className="min-w-0 truncate text-[12px] text-fg-3">
          {profile ? 'Your profile' : placeName(c.scope, c.scopeKey, here)}
          {c.source === 'agent' && ' · saved by the agent'}
          {steps.length > 1 && ` · ${steps.length} changes`}
        </span>
        <span className="flex-1" />
        {!c.undone && !editing && !erased && (
          <div className="-my-1 flex shrink-0 items-center">
            <IconButton size="sm" label={steps.length > 1 ? 'Undo these changes' : 'Undo this change'} onClick={() => act(undo())}>
              <Undo2 size={14} />
            </IconButton>
            {active && (
              <IconButton size="sm" label="Edit" onClick={() => (profile ? go('/settings?s=memory&find=Your%20profile') : setEditing(true))}>
                <Pencil size={14} />
              </IconButton>
            )}
            {active && !profile && (
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
        <div className="mt-1 text-[13.5px] leading-snug break-words">
          <div translate="no" className={profile ? 'whitespace-pre-line' : undefined}>
            {struck ? (
              <div className="text-fg-3 line-through decoration-fg-3/60">{c.after}</div>
            ) : c.before && c.after ? (
              <WordDiff from={c.before} to={c.after} />
            ) : c.after ? (
              <div className="text-fg">{c.after}</div>
            ) : (
              c.before && <div className="text-fg-3 line-through decoration-fg-3/60">{c.before}</div>
            )}
          </div>
          {now && (
            <>
              <button onClick={() => setShowNow((v) => !v)} aria-expanded={showNow} className="mt-1.5 inline-flex items-center gap-1 rounded-md text-[12px] text-fg-3 transition-colors hover:text-fg">
                <ChevronRight size={12} className={cx('transition-transform', showNow && 'rotate-90')} />
                Changed again since
              </button>
              {showNow && (
                <div translate="no" className="mt-1 border-l-2 border-line pl-2.5">
                  <WordDiff from={c.after!} to={now} />
                </div>
              )}
            </>
          )}
        </div>
      )}
      {(c.why || erased || struck) && <div className="mt-1 text-[12px] text-fg-3">{[c.why, erased ? 'No longer kept' : struck ? 'Deleted since' : ''].filter(Boolean).join(' · ')}</div>}
    </div>
  );
}

/** The same array while its items are the same (the turn's notes are grouped afresh on every render). */
function useSameItems<T>(list: T[]): T[] {
  const ref = useRef(list);
  if (list.length !== ref.current.length || list.some((x, i) => x !== ref.current[i])) ref.current = list;
  return ref.current;
}

export function MemoryNote({ note, sessionKey, more }: { note: SessionNote; sessionKey: string; more?: SessionNote[] }) {
  const notes = useSameItems(more?.length ? [note, ...more] : [note]);
  const rows = useMemo(() => rowsOf(notes), [notes]);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [live, setLive] = useState<Map<number, MemoryEntry> | null>(null);
  const state = useMemoryState();
  const version = useMemory((s) => s.version);
  const on = useSessions((s) => s.byKey[sessionKey]?.extra?.memory) !== false;
  const ids = rows.map((r) => r.c.entry).join(',');
  const reload = useCallback(() => {
    fetchEntries(ids ? ids.split(',').map(Number) : [])
      .then(setLive)
      .catch(() => {});
  }, [ids]);
  // While open, what each entry says now (it may have been edited or deleted since).
  useEffect(() => {
    if (open) reload();
  }, [open, reload, version, notes]);
  if (!rows.length) return null;
  // One entry changed again and again reads "1 updated, 8 times"; with several, each says how often.
  const summary = changeSummary(rows.map((r) => r.c)) + (rows.length === 1 && rows[0].steps.length > 1 ? `, ${rows[0].steps.length} times` : '');
  if (!open)
    return (
      <div className="mt-3">
        <button
          onClick={() => setOpen(true)}
          aria-expanded={false}
          data-tip="memory-note"
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
    <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-panel">
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
            All memory
          </MenuItem>
        </Popover>
      </div>
      <div className="divide-y divide-line border-t border-line">
        {rows.map((r) => (
          <ChangeRow key={`${r.steps[0].noteId}-${r.steps[0].index}`} row={r} entry={live ? (live.get(r.c.entry) ?? null) : undefined} here={sessionKey} reload={reload} />
        ))}
      </div>
    </div>
  );
}

// A turn's memory notes show as one.
MemoryNote.many = true;
