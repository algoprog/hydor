// Notes the app added to a conversation (a memory update, a second opinion…): shown with the turn of
// the item each is anchored to, or at the end of the conversation when that item is not in it. Several
// of a kind in one turn can show as one (memory's: one chip, not one per update). Chips (commits, memory) share one
// row under the reply with the chip of the files it changed; cards show above or below that row.
import { useEffect } from 'react';
import type { SessionNote } from '@shared/features';
import { useNotes } from '../../lib/notes';
import { noteView } from '../registry';

const EMPTY: SessionNote[] = [];

/** Loads a session's notes while it is open. */
export function useSessionNotes(key: string): SessionNote[] {
  useEffect(() => {
    useNotes
      .getState()
      .load(key)
      .catch(() => {});
  }, [key]);
  return useNotes((s) => s.byKey[key] ?? EMPTY);
}

export interface NoteGroup {
  note: SessionNote;
  more: SessionNote[];
}

const isChip = (n: SessionNote) => !!noteView(n.kind)?.chip;
const late = (n: SessionNote) => !!noteView(n.kind)?.afterChanges;

/** The notes in the order they show; a kind whose view shows several (`many`) shows once, where its first note is, with the rest. */
function grouped(notes: SessionNote[]): NoteGroup[] {
  const out: NoteGroup[] = [];
  const firsts = new Map<string, NoteGroup>();
  for (const n of notes) {
    const many = !!noteView(n.kind)?.many;
    const first = many ? firsts.get(n.kind) : undefined;
    if (first) first.more.push(n);
    else {
      const g = { note: n, more: [] };
      out.push(g);
      if (many) firsts.set(n.kind, g);
    }
  }
  return out;
}

function NoteRow({ note, more, sessionKey }: { note: SessionNote; more: SessionNote[]; sessionKey: string }) {
  const View = noteView(note.kind);
  return View ? <View note={note} more={more.length ? more : undefined} sessionKey={sessionKey} /> : null;
}

/** The chips among the notes anchored to any of `ids` (one turn's items): those that go `afterChanges` (its commits) last. */
export function turnChips(notes: SessionNote[], ids: Set<string>): NoteGroup[] {
  const mine = notes.filter((n) => n.anchor && ids.has(n.anchor) && isChip(n));
  return grouped([...mine.filter((n) => !late(n)), ...mine.filter(late)]);
}

/** Chips, each straight in the row it is put in (what one opens goes below that row). */
export function NoteChips({ groups, sessionKey }: { groups: NoteGroup[]; sessionKey: string }) {
  return (
    <>
      {groups.map((g) => (
        <NoteRow key={g.note.id} note={g.note} more={g.more} sessionKey={sessionKey} />
      ))}
    </>
  );
}

/** The cards among the notes anchored to any of `ids` (one turn's items): those above the row under its reply, or with `after` those below. */
export function TurnNotes({ notes, ids, sessionKey, after = false }: { notes: SessionNote[]; ids: Set<string>; sessionKey: string; after?: boolean }) {
  const mine = notes.filter((n) => n.anchor && ids.has(n.anchor) && !isChip(n) && late(n) === after);
  if (!mine.length) return null;
  return (
    <div className="space-y-1.5">
      {grouped(mine).map((g) => (
        <NoteRow key={g.note.id} note={g.note} more={g.more} sessionKey={sessionKey} />
      ))}
    </div>
  );
}

/**
 * Notes with no anchor, or (once the whole conversation is loaded) one it does not show: at its end.
 * While older turns are still unloaded, a note anchored in them waits for its turn to load.
 */
export function LooseNotes({ notes, known, sessionKey, complete }: { notes: SessionNote[]; known: Set<string>; sessionKey: string; complete: boolean }) {
  const loose = notes.filter((n) => !n.anchor || (complete && !known.has(n.anchor)));
  if (!loose.length) return null;
  const chips = grouped(loose.filter(isChip));
  return (
    <div className="space-y-1.5">
      {grouped(loose.filter((n) => !isChip(n))).map((g) => (
        <NoteRow key={g.note.id} note={g.note} more={g.more} sessionKey={sessionKey} />
      ))}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <NoteChips groups={chips} sessionKey={sessionKey} />
        </div>
      )}
    </div>
  );
}
