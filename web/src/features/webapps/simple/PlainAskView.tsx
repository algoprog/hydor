// The body of a plain permission card: the sentence, and the thing itself behind a button.
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cx } from '../../../components/ui';
import type { PlainAsk } from './plainAsk';

export function PlainAskView({ ask, open, onToggle, children }: { ask: PlainAsk; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="space-y-2" data-plain-ask>
      <p translate="no" className="text-[14px] leading-snug font-medium">
        {ask.sentence}
      </p>
      <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex min-h-8 items-center gap-1 text-[12.5px] text-fg-3 hover:text-fg-2">
        <ChevronRight size={13} className={cx('transition-transform', open && 'rotate-90')} />
        {ask.show}
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}
