// What a change an agent asks to make would be given, as labels and values (a web app's function and its inputs, read from the function's own
// description of them), under the words that say what it does. A long value is folded to a few lines; "Show it as it was sent" gives the input
// the agent wrote, as it was.
import { useState } from 'react';
import { tr } from '../../i18n/runtime';
import { cx } from '../../components/ui';

export interface Fact {
  label: string;
  value: string;
  long?: boolean;
}

/** Folds past this many characters when the person has not opened it (also past three lines: the clamp does that). */
const FOLD_AT = 140;

function Value({ f }: { f: Fact }) {
  const [open, setOpen] = useState(false);
  const folds = !!f.long && (f.value.length > FOLD_AT || f.value.includes('\n'));
  return (
    <dd className="min-w-0 flex-1 text-fg">
      <span translate="no" className={cx('break-words whitespace-pre-wrap', folds && !open ? 'line-clamp-3' : 'block')}>
        {f.value}
      </span>
      {folds && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-0.5 text-[12px] text-accent hover:underline">
          {open ? tr('Show less') : tr('Show all')}
        </button>
      )}
    </dd>
  );
}

export function ApprovalFacts({ facts, raw }: { facts: Fact[]; raw?: string }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] font-medium text-fg-3">{tr('What it would be given')}</div>
      <dl className="space-y-1.5 rounded-lg border border-line bg-bg-1 px-3 py-2.5 text-[13px] leading-snug">
        {facts.map((f, i) =>
          f.label ? (
            <div key={i} className="flex gap-3 max-sm:flex-col max-sm:gap-0.5">
              <dt className="w-[7.5rem] shrink-0 text-fg-3 max-sm:w-auto" translate="no">
                {f.label}
              </dt>
              <Value f={f} />
            </div>
          ) : (
            <div key={i} className="text-[12.5px] text-fg-3" translate="no">
              {f.value}
            </div>
          ),
        )}
      </dl>
      {raw && (
        <div>
          <button type="button" onClick={() => setShowRaw((o) => !o)} aria-expanded={showRaw} className="text-[12px] text-accent hover:underline">
            {showRaw ? tr('Hide it as it was sent') : tr('Show it as it was sent')}
          </button>
          {showRaw && (
            <pre translate="no" className="term-out mt-1.5 max-h-56 overflow-auto rounded-lg border border-line px-3 py-2">
              {raw}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
