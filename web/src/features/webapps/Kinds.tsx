// The kinds of web app, as cards to pick from: each a drawing of the first screen such an app usually has, a name, one sentence
// on who it is for and what it usually needs. They are ideas to start from, not templates. Used by the page "What do you want to
// make?" (Make.tsx) and by the card an agent puts in a conversation when the kind is not known (KindsCard.tsx).
import { Check } from 'lucide-react';
import type { WebKind } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { cx } from '../../components/ui';
import { KindArt } from './KindArt';

/** What such an app usually needs, in a line. */
export function KindNeeds({ k }: { k: WebKind }) {
  return (
    <p className="text-[12.5px] leading-snug text-fg-3">
      <span className="font-medium text-fg-2">{tr('Usually needs')}: </span>
      {k.needs.map((n) => tr(n)).join(' · ')}
    </p>
  );
}

/** The card's shell: a button when it can be picked, `selected` marks the one picked. */
function Tile({ art, onPick, selected, compact, children }: { art: string; onPick: () => void; selected?: boolean; compact?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cx(
        'group flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-panel text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent',
        selected ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-2 hover:bg-bg-1',
      )}
      data-kind={art}
    >
      <span className={cx('relative block w-full shrink-0 overflow-hidden border-b border-line bg-bg-2', compact ? 'aspect-[16/8] max-sm:aspect-[16/9]' : 'aspect-[16/10] max-sm:aspect-[16/9]')}>
        <KindArt id={art} />
        {selected && (
          <span className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-accent text-accent-fg shadow">
            <Check size={14} strokeWidth={2.4} />
          </span>
        )}
      </span>
      <span className={cx('flex min-w-0 flex-1 flex-col gap-2', compact ? 'p-3' : 'p-4')}>{children}</span>
    </button>
  );
}

export function KindTile({ k, onPick, selected, hint, compact }: { k: WebKind; onPick: () => void; selected?: boolean; hint?: string; compact?: boolean }) {
  return (
    <Tile art={k.id} onPick={onPick} selected={selected} compact={compact}>
      <span className="block">
        {hint && <span className="mb-0.5 block text-[11.5px] font-medium text-accent">{hint}</span>}
        <span className={cx('block font-semibold tracking-tight text-pretty', compact ? 'text-[14px]' : 'text-[15.5px]')}>{tr(k.name)}</span>
        <span className={cx('mt-0.5 block leading-snug text-pretty text-fg-2', compact ? 'text-[12.5px]' : 'text-[13.5px]')}>{tr(k.who)}</span>
      </span>
      <span className="mt-auto block pt-1">
        <KindNeeds k={k} />
      </span>
    </Tile>
  );
}

/** "Something else": the last card. */
export function OtherTile({ onPick, selected, compact }: { onPick: () => void; selected?: boolean; compact?: boolean }) {
  return (
    <Tile art="other" onPick={onPick} selected={selected} compact={compact}>
      <span className="block">
        <span className={cx('block font-semibold tracking-tight', compact ? 'text-[14px]' : 'text-[15.5px]')}>{tr('Something else')}</span>
        <span className={cx('mt-0.5 block leading-snug text-pretty text-fg-2', compact ? 'text-[12.5px]' : 'text-[13.5px]')}>{tr('Say what you have in mind, in your own words. The agent asks what it needs.')}</span>
      </span>
    </Tile>
  );
}
