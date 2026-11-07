// The list of an editor's keyboard shortcuts (Ctrl+/ in each editor): its keys in groups (Text, Paragraphs, Moving
// around…), with a field to find one by what it does or by its keys. Keys are written the way this computer writes
// them (⌘ on a Mac). Two columns where there is room.
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { keyLabel } from './keys';

export interface ShortcutGroup {
  title: string;
  /** Each shortcut: its keys ("Ctrl+B", or several as "Ctrl+Z / Ctrl+Shift+Z") and what it does. */
  items: [keys: string, what: string][];
}

/** Keys as small caps, each key of a chord apart: "Ctrl+Shift+Z" → Ctrl Shift Z (⌘⇧Z on a Mac). */
function Keys({ keys }: { keys: string }) {
  const alts = keys.split(' / ');
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {alts.map((k, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-[11px] text-fg-3">or</span>}
          <kbd className="rounded-md border border-line-2 bg-bg-2 px-1.5 py-px font-mono text-[11.5px] whitespace-nowrap text-fg-2">{keyLabel(k)}</kbd>
        </span>
      ))}
    </span>
  );
}

export function ShortcutsDialog({ open, onClose, groups, part }: { open: boolean; onClose: () => void; groups: ShortcutGroup[]; part?: string }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const w = q.trim().toLocaleLowerCase();
    if (!w) return groups;
    return groups.map((g) => ({ ...g, items: g.items.filter(([k, what]) => `${k} ${keyLabel(k)} ${what} ${tr(what)}`.toLocaleLowerCase().includes(w)) })).filter((g) => g.items.length);
  }, [groups, q]);
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" width={760} part={part}>
      <div className="relative mb-3">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a shortcut"
          aria-label="Find a shortcut"
          spellCheck={false}
          className="h-9 w-full rounded-lg border border-line bg-bg pr-3 pl-8 text-[13.5px] text-fg outline-none placeholder:text-fg-3 focus:border-accent"
        />
      </div>
      {!shown.length && <div className="py-6 text-center text-[13px] text-fg-3">No shortcut has those words.</div>}
      <div className="gap-x-8 sm:columns-2">
        {shown.map((g) => (
          <section key={g.title} className="mb-4 break-inside-avoid">
            <h3 className="mb-1 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">{g.title}</h3>
            {g.items.map(([k, what]) => (
              <div key={`${k}${what}`} className="flex min-h-8 items-center gap-3 border-b border-line/60 py-1 text-[13px] last:border-b-0">
                <span className="min-w-0 flex-1 text-fg">{what}</span>
                <Keys keys={k} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </Dialog>
  );
}
