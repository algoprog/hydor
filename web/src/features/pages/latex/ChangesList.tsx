// The tracked changes of a LaTeX document, at the top of the panel beside the source (above the comments): whether
// Track changes is on, how many changes wait, Accept all and Reject all, then those of the file in view in the order
// they come, each with who made it and when, the words put in or taken out, and Accept and Reject. A click on one goes
// to it in the source; the other files' changes are a click away. The words are shown as written, never translated.
import { Check, Minus, Plus, X } from 'lucide-react';
import type { TexChange } from '@shared/latex';
import { Button, cx, IconButton } from '../../../components/ui';
import { ago, Who } from '../common/Comments';

export function ChangesList({
  changes,
  file,
  label,
  track,
  active,
  readOnly,
  onPick,
  onAccept,
  onReject,
  onAll,
  onOpenFile,
}: {
  /** The document's changes, every file's. */
  changes: TexChange[];
  /** The file in view. */
  file: string;
  /** A file's name as the tabs show it. */
  label: (name: string) => string;
  /** Track changes is on. */
  track: boolean;
  active: string | null;
  readOnly?: boolean;
  onPick: (c: TexChange) => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  /** Every change of the document accepted (true) or rejected (false). */
  onAll: (accept: boolean) => void;
  onOpenFile: (name: string) => void;
}) {
  if (!changes.length && !track) return null;
  const here = changes.filter((c) => c.file === file).sort((a, b) => a.from - b.from);
  const elsewhere = new Map<string, number>();
  for (const c of changes) if (c.file !== file) elsewhere.set(c.file, (elsewhere.get(c.file) ?? 0) + 1);
  const n = changes.length;
  return (
    <div className="space-y-2 border-b border-line pb-2">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 px-1">
        <span className="text-[12.5px] font-medium whitespace-nowrap text-fg-2">{n ? `${n} change${n === 1 ? '' : 's'}` : 'No changes yet'}</span>
        {n > 0 && !readOnly && (
          <span className="ml-auto flex items-center">
            <Button size="sm" variant="ghost" onClick={() => onAll(true)} className="h-7 px-2 text-[12px]">
              Accept all
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAll(false)} className="h-7 px-2 text-[12px]">
              Reject all
            </Button>
          </span>
        )}
      </div>
      {track && (
        <p className="flex items-center gap-1.5 px-1 text-[12px] leading-snug text-fg-3">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
          Track changes is on: what you type and delete is marked here.
        </p>
      )}
      {here.map((c) => (
        <div
          key={c.id}
          role="button"
          tabIndex={0}
          onClick={() => onPick(c)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(c))}
          className={cx('cursor-pointer rounded-xl border bg-elevated p-2.5 transition-colors', c.id === active ? 'border-accent/60' : 'border-line hover:border-line-2')}
        >
          <div className="flex items-center gap-1.5">
            <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', c.kind === 'ins' ? 'bg-ok/15 text-ok' : 'bg-err/15 text-err')}>{c.kind === 'ins' ? <Plus size={12} /> : <Minus size={12} />}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-fg-3">
              <span className="inline-flex align-middle">
                <Who by={c.by} />
              </span>{' '}
              · {ago(c.at)}
            </span>
            {!readOnly && (
              <>
                <IconButton
                  label="Accept"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAccept(c.id);
                  }}
                >
                  <Check size={14} />
                </IconButton>
                <IconButton
                  label="Reject"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject(c.id);
                  }}
                >
                  <X size={14} />
                </IconButton>
              </>
            )}
          </div>
          <div translate="no" className={cx('mt-1.5 line-clamp-3 font-mono text-[12px] leading-snug break-words whitespace-pre-wrap', c.kind === 'ins' ? 'text-ok' : 'text-err line-through')}>
            {c.text.length > 300 ? `${c.text.slice(0, 300)}…` : c.text}
          </div>
        </div>
      ))}
      {elsewhere.size > 0 && (
        <div className="space-y-1">
          {[...elsewhere].map(([name, k]) => (
            <button key={name} type="button" onClick={() => onOpenFile(name)} className="block w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg">
              {`${k} change${k === 1 ? '' : 's'} in `}
              <span translate="no" className="font-mono">
                {label(name)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
