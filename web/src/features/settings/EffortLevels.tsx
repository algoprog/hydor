import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ENDPOINT_EFFORTS, isEffortName, KNOWN_EFFORTS, orderEfforts } from '@shared/efforts';
import { Button, cx, inputCls, Popover } from '../../components/ui';

/**
 * The effort levels of an endpoint's model that reasons: the ones offered in the Effort menu. The known ones are ticked,
 * any other the endpoint takes is typed; one stays ticked at least. `onChange(null)` is low, medium and high again.
 */
export function EffortLevels({ model, levels, custom, onChange }: { model: string; levels: string[]; custom: boolean; onChange: (levels: string[] | null) => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const ref = useRef<HTMLButtonElement>(null);
  // What was just ticked, until the server's list says it too: a second tick builds on the first.
  const [draft, setDraft] = useState<string[] | null>(null);
  const said = levels.join();
  useEffect(() => setDraft(null), [said]);
  const now = draft ?? levels;
  const save = (next: string[] | null) => {
    setDraft(next ? orderEfforts(next) : ENDPOINT_EFFORTS);
    onChange(next);
  };
  const name = typed.trim().toLowerCase();
  const addable = isEffortName(name) && !now.includes(name) && now.length < 16;
  const add = () => {
    if (!addable) return;
    save([...now, name]);
    setTyped('');
  };
  return (
    <label className="flex items-center gap-2 text-[12px] whitespace-nowrap text-fg-3">
      <span>Effort levels</span>
      <button
        ref={ref}
        type="button"
        aria-label={`Effort levels: ${model}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx('inline-flex h-8 min-w-0 max-w-[16rem] items-center gap-1.5 rounded-lg bg-bg-2 pr-2 pl-3 text-[13px] text-fg ring-1 ring-line-2 transition-colors ring-inset hover:bg-bg-3', open && 'bg-bg-3')}
      >
        <span className="truncate" translate="no">
          {now.join(', ')}
        </span>
        <ChevronDown size={14} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={260} title="Effort levels">
        <div className="px-2.5 pt-1.5 pb-1 text-[12px] leading-snug whitespace-normal text-fg-3">Offered in the Effort menu. Tick the ones this model takes.</div>
        {orderEfforts([...KNOWN_EFFORTS, ...now]).map((v) => {
          const on = now.includes(v);
          return (
            <label key={v} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] text-fg transition-colors hover:bg-bg-2">
              <input type="checkbox" className="accent-[var(--accent)]" checked={on} disabled={on && now.length === 1} onChange={() => save(on ? now.filter((x) => x !== v) : [...now, v])} />
              <span translate="no">{v}</span>
            </label>
          );
        })}
        <form
          className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input className={cx(inputCls, 'h-8 min-w-0 flex-1 text-[13px]')} aria-label="Another level" placeholder="Another level" value={typed} maxLength={32} onChange={(e) => setTyped(e.target.value)} />
          <Button size="sm" variant="secondary" type="submit" disabled={!addable}>
            Add
          </Button>
        </form>
        {(custom || now.join() !== ENDPOINT_EFFORTS.join()) && (
          <button type="button" onClick={() => save(null)} className="w-full rounded-lg px-2.5 py-2 text-left text-[12.5px] text-accent transition-colors hover:bg-bg-2">
            Use low, medium and high
          </button>
        )}
      </Popover>
    </label>
  );
}
