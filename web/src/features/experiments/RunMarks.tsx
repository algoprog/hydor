// What a run's page says of a run besides what it recorded: where it stands among the attempts at the same thing, and a
// line about it, written or changed in place.
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { NOTE_MAX, type RunChain, type RunRef } from '@shared/experiments';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, inputCls } from '../../components/ui';
import { runPath } from './api';
import { afterWords } from './runList';

/** "The 4th attempt: the 3rd ran out of memory", with a link to the one before; and on an earlier one, the one that took its place. */
export function ChainLine({ chain, machine }: { chain: RunChain; machine?: string | null }) {
  const open = (r: RunRef) => go(runPath({ id: r.id, ...(machine ? { machine: { id: machine, name: '' } } : {}) }));
  const link = 'min-w-0 max-w-full truncate text-left text-accent hover:underline';
  return (
    <div className="space-y-0.5 text-[13px] text-fg-2">
      {chain.previous && (
        <p className="flex flex-wrap items-center gap-x-2">
          <span>{afterWords(chain.attempt, chain.previous)}</span>
          <button type="button" onClick={() => open(chain.previous!)} className={link} translate="no">
            {chain.previous.name ?? chain.previous.id}
          </button>
        </p>
      )}
      {chain.next && (
        <p className="flex min-w-0 flex-wrap items-center gap-x-2">
          <span>Started again as</span>
          <button type="button" onClick={() => open(chain.next!)} className={link} translate="no">
            {chain.next.name ?? chain.next.id}
          </button>
        </p>
      )}
    </div>
  );
}

/** The line about a run: "Add a note", or the note itself, changed in place. An empty one takes it away. */
export function NoteLine({ note, by, onSave }: { note?: string; by?: 'user' | 'agent'; onSave: (note: string) => Promise<void> }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (text === null) return;
    if (text.trim() === (note ?? '')) return setText(null);
    setBusy(true);
    try {
      await onSave(text.trim());
      setText(null);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  if (text !== null)
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          autoFocus
          value={text}
          maxLength={NOTE_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setText(null)}
          aria-label="Note"
          placeholder="What a later reader should know"
          className={`${inputCls} h-8 w-full text-[13px] sm:w-[520px]`}
        />
        <Button size="sm" variant="primary" type="submit" disabled={busy}>
          Save
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setText(null)}>
          Cancel
        </Button>
      </form>
    );
  if (!note)
    return (
      <button type="button" onClick={() => setText('')} className="-ml-1 flex min-h-7 items-center gap-1 rounded-md px-1 text-[12.5px] text-fg-3 hover:text-fg-2">
        <Plus size={13} /> <span>Add a note</span>
      </button>
    );
  return (
    <button type="button" onClick={() => setText(note)} aria-label="Change the note" className="-ml-1 flex max-w-full items-start gap-2 rounded-md px-1 py-0.5 text-left text-[13px] leading-snug text-fg hover:bg-bg-1 sm:max-w-[820px]">
      <span className="min-w-0 break-words">
        {by === 'agent' && (
          <>
            <span className="text-fg-3">Agent’s note:</span>{' '}
          </>
        )}
        <span translate="no">{note}</span>
      </span>
      <Pencil size={13} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
    </button>
  );
}
