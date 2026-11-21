// One note, whole: its text (to edit), who wrote it and when, how it is known, how often agents needed it, its end
// date, what it sums up (a topic or profile) and its history; to delete, restore or keep it. NoteDetails is all of that
// in place (a project's Memory tab reads it beside its list); NoteDialog holds it in a dialog (Settings → Memory).
import { useEffect, useState, type ReactNode } from 'react';
import { tr } from '../../i18n/runtime';
import { ArchiveRestore, Check, Pencil } from 'lucide-react';
import type { MemoryListEntry } from '@shared/memory';
import { isUserProfile } from '@shared/memory';
import { Button, cx, Dialog, useConfirm } from '../../components/ui';
import { api, del, patch, post } from '../../lib/api';
import { ago, tildify } from '../../lib/format';
import { toast, toastError, useApp } from '../../lib/store';
import { BASIS, BASIS_HINT, Children, dayOf, EndDate, GONE, HistoryList, notesCount, SessionLink, when } from './common';
import { EntryEditor } from './parts';
import { folderName, SOURCE, useMemory } from './state';

type Unfold = 'end' | 'children' | 'history' | null;

function Fact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-3">{name}</dt>
      <dd className="min-w-0 break-words text-fg-2">{children}</dd>
    </>
  );
}

/** A small link-like button at a fact's end. */
function Toggle({ children, onClick, alone }: { children: ReactNode; onClick: () => void; alone?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx(!alone && 'ml-2', 'text-fg-3 underline-offset-2 transition-colors hover:text-fg hover:underline')}>
      {children}
    </button>
  );
}

/** What the note view needs of its host: `entry` (null: nothing open), whether it is among the stale ones, and what to do when it changed or went. */
interface NoteViewProps {
  entry: MemoryListEntry | null;
  stale?: boolean;
  onClose: () => void;
  onChanged: () => void;
  /** In a project's Memory tab the note's place is the project: leave the Where fact out, and say the note's title above its text. */
  inPlace?: boolean;
  /** A note a topic sums up opens in the reader instead of showing as text. */
  onOpenNote?: (e: MemoryListEntry) => void;
}

/**
 * The note `entry` as its parts: `e` (the note read again since it opened, and whenever memory changes, so what an edit or an end
 * date changed shows at once), its text and facts (`body`), its actions (Delete, or Erase for good; Restore; Keep it) and the node
 * its confirm question needs. `onChanged` tells the list to load again; `onClose` is called once a delete, restore or keep went through.
 */
export function useNoteView({ entry, stale, onClose, onChanged, inPlace, onOpenNote }: NoteViewProps) {
  const home = useApp((s) => s.boot?.home);
  const version = useMemory((s) => s.version);
  /** The note as read again since it opened; until then, as the list had it. */
  const [fresh, setFresh] = useState<MemoryListEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [unfold, setUnfold] = useState<Unfold>(null);
  const [confirm, confirmNode] = useConfirm();
  const id = entry?.id;
  useEffect(() => {
    setEditing(false);
    setUnfold(null);
  }, [id]);
  const refresh = () => {
    if (id == null) return Promise.resolve();
    return api<{ entries: MemoryListEntry[] }>(`/api/memory/entries?ids=${id}`)
      .then((r) => (r.entries[0] ? setFresh(r.entries[0]) : onClose()))
      .catch(toastError);
  };
  useEffect(() => {
    void refresh();
  }, [id, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const e = fresh && fresh.id === id ? fresh : entry;
  if (!e) return { e: null, kind: 'Note', body: null, actions: null, confirmNode };

  const deleted = e.status === 'deleted';
  const kind = e.kind === 'topic' ? 'Topic' : isUserProfile(e) || e.kind === 'profile' ? 'Profile' : 'Note';
  const changed = e.updatedAt !== e.createdAt;
  const who = SOURCE[e.source];
  const done = (p: Promise<unknown>) => p.then(() => (onChanged(), onClose())).catch(toastError);
  const remove = () => done(del(`/api/memory/entries/${e.id}`).then(() => toast('Deleted. It stays under Deleted notes for 30 days.')));
  const erase = async () => {
    if (await confirm({ title: 'Erase this note for good?', body: 'It goes with its history, and cannot come back.', confirm: 'Erase', danger: true }))
      done(del(`/api/memory/entries/${e.id}?forever=1`));
  };
  const show = (k: Exclude<Unfold, null>) => setUnfold((u) => (u === k ? null : k));
  const afterEdit = () => {
    setEditing(false);
    setUnfold(null);
    onChanged();
    void refresh();
  };

  const where =
    e.scope === 'global' ? (
      'About you'
    ) : e.scope === 'repo' ? (
      <>
        <span translate="no">{folderName(e.scopeKey)}</span>
        <span translate="no" className="block text-[12px] text-fg-3">
          {tildify(e.scopeKey, home)}
        </span>
      </>
    ) : (
      <>
        A session: <SessionLink k={e.scopeKey} title={e.scopeLabel === GONE ? undefined : e.scopeLabel} />
      </>
    );

  const actions = (
    <>
      <Button size="sm" variant="ghost" onClick={() => void (deleted ? erase() : remove())} className={cx('mr-auto !text-err', !inPlace && '-ml-3')}>
        {deleted ? 'Erase for good' : 'Delete'}
      </Button>
      {deleted && (
        <Button size="sm" variant="secondary" icon={<ArchiveRestore size={14} />} onClick={() => done(post(`/api/memory/entries/${e.id}/restore`).then(() => toast('Restored')))}>
          Restore
        </Button>
      )}
      {stale && !deleted && (
        <Button size="sm" variant="secondary" icon={<Check size={14} />} onClick={() => done(post(`/api/memory/entries/${e.id}/keep`).then(() => toast('Kept')))}>
          Keep it
        </Button>
      )}
    </>
  );

  const body = (
    <>
      {inPlace && e.title && (
        <h3 translate="no" className="mb-1.5 text-[16px] leading-snug font-semibold break-words">
          {e.title}
        </h3>
      )}
      {editing ? (
        <EntryEditor
          text={e.text}
          max={e.kind === 'note' ? 500 : 800}
          onCancel={() => setEditing(false)}
          onSave={(text) => patch(`/api/memory/entries/${e.id}`, { text }).then(afterEdit).catch(toastError)}
        />
      ) : (
        <>
          <div translate="no" className={cx('text-[14px] leading-relaxed break-words whitespace-pre-line', deleted ? 'text-fg-2' : 'text-fg')}>
            {e.text}
          </div>
          {!deleted && (
            <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditing(true)} className="mt-2 -ml-2.5">
              Edit
            </Button>
          )}
        </>
      )}
      <dl className="mt-4 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 border-t border-line pt-4 text-[13px] leading-snug">
        {!inPlace && <Fact name="Where">{where}</Fact>}
        <Fact name="Written">
          <span title={changed ? `Added ${when(e.createdAt)}\nChanged ${when(e.updatedAt)}` : `Added ${when(e.createdAt)}`}>
            {deleted ? `Deleted ${ago(e.updatedAt)}` : changed ? `Changed ${ago(e.updatedAt)} by ${who}` : `Added ${ago(e.createdAt)} by ${who}`}
          </span>
          {e.session && !deleted && !(e.scope === 'session' && e.session === e.scopeKey) && (
            <>
              {' in '}
              <SessionLink k={e.session} title={e.sessionTitle} />
            </>
          )}
        </Fact>
        {e.basis && !deleted && (
          <Fact name="How it is known">
            <span title={BASIS_HINT[e.basis]} className={cx(e.basis === 'inferred' && 'text-fg')}>
              {BASIS[e.basis]}
            </span>
          </Fact>
        )}
        {e.drift && !deleted && (
          <Fact name="In the code">
            {tr(`${e.drift.paths.join(', ')} changed in the project since this was written (seen ${ago(e.drift.at)}). The next tidy-up checks it against the code.`)}
          </Fact>
        )}
        <Fact name="Needed by agents">
          {e.uses > 0 ? (
            <>
              <span>{e.uses === 1 ? 'Once' : `${e.uses} times`}</span>
              {e.usedAt ? <span>, last {ago(e.usedAt)}</span> : null}
            </>
          ) : (
            'Not yet'
          )}
        </Fact>
        <Fact name="Given to agents">
          {e.given > 0 ? (
            <>
              <span>{e.given === 1 ? 'Once' : `${e.given} times`}</span>
              {e.givenAt ? <span>, last {ago(e.givenAt)}</span> : null}
            </>
          ) : (
            'Not yet'
          )}
        </Fact>
        {!deleted && (
          <Fact name="End date">
            <span>{e.expiresAt ? dayOf(e.expiresAt) : 'None'}</span>
            <Toggle onClick={() => show('end')}>{unfold === 'end' ? 'Hide' : 'Change'}</Toggle>
            {unfold === 'end' && <EndDate e={e} onDone={afterEdit} />}
          </Fact>
        )}
        {e.kind !== 'note' && (
          <Fact name="Sums up">
            <span>{notesCount(e.covers ?? 0)}</span>
            <Toggle onClick={() => show('children')}>{unfold === 'children' ? 'Hide' : 'Show'}</Toggle>
            {unfold === 'children' && <Children id={e.id} onOpen={onOpenNote} />}
          </Fact>
        )}
        <Fact name="History">
          <Toggle alone onClick={() => show('history')}>
            {unfold === 'history' ? 'Hide' : 'Show'}
          </Toggle>
          {unfold === 'history' && <HistoryList id={e.id} />}
        </Fact>
      </dl>
    </>
  );
  return { e, kind, body, actions, confirmNode };
}

/** The note whole, in place: its text and facts, then Delete (and Restore or Keep it where they apply). */
export function NoteDetails(props: NoteViewProps) {
  const v = useNoteView(props);
  if (!v.e) return <>{v.confirmNode}</>;
  return (
    <>
      {v.body}
      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">{v.actions}</div>
      {v.confirmNode}
    </>
  );
}

/** The note `entry` (null: closed) in a dialog; `onChanged` tells the list to load again. */
export function NoteDialog({ entry, stale, onClose, onChanged }: { entry: MemoryListEntry | null; stale?: boolean; onClose: () => void; onChanged: () => void }) {
  const v = useNoteView({ entry, stale, onClose, onChanged });
  if (!v.e) return null;
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={v.kind}
        width={560}
        footer={
          <>
            {v.actions}
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </>
        }
      >
        {v.body}
      </Dialog>
      {v.confirmNode}
    </>
  );
}
