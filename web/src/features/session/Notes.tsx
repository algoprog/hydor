// Notes the app added to a conversation (a memory update, a second opinion…): shown with the turn of
// the item each is anchored to, or at the end of the conversation when that item is not in it.
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

function NoteRow({ note, sessionKey }: { note: SessionNote; sessionKey: string }) {
  const View = noteView(note.kind);
  return View ? <View note={note} sessionKey={sessionKey} /> : null;
}

/** The notes anchored to any of `ids` (one turn's items). */
export function TurnNotes({ notes, ids, sessionKey }: { notes: SessionNote[]; ids: Set<string>; sessionKey: string }) {
  const mine = notes.filter((n) => n.anchor && ids.has(n.anchor));
  if (!mine.length) return null;
  return (
    <div className="space-y-1.5">
      {mine.map((n) => (
        <NoteRow key={n.id} note={n} sessionKey={sessionKey} />
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
  return (
    <div className="space-y-1.5">
      {loose.map((n) => (
        <NoteRow key={n.id} note={n} sessionKey={sessionKey} />
      ))}
    </div>
  );
}
