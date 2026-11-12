// How an app with steps works, at a glance beside its form: its steps in order, each with its kind's icon and how
// it runs (once for each item, several at once, side by side), and a way to its graph in the builder.
import { Network } from 'lucide-react';
import type { Flow, Step } from '@shared/app-manifest';
import { titleOf } from '@shared/app-manifest';
import { tr } from '../../i18n/runtime';
import { ICON, KIND_COLOR } from './stepKinds';

/** How a step runs, in a few words, when that is more than once. */
function how(s: Step): string | null {
  if (s.do === 'parallel') return tr(`${s.branches.length} side by side`);
  if (s.do === 'repeat') {
    const each = s.over !== undefined ? tr('for each') : tr('until it holds');
    return (s.atOnce ?? 1) > 1 ? tr(`${each}, ${s.atOnce} at once`) : each;
  }
  if (s.do === 'decide') return tr('one way or the other');
  return null;
}

/** How it works, as a short list for the side of an app's page: its steps in order, at most `max` of them. */
export function FlowList({ flow, onGraph, own, max = 7 }: { flow: Flow; onGraph: () => void; own?: boolean; max?: number }) {
  const shown = flow.steps.slice(0, max);
  const more = flow.steps.length - shown.length;
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 py-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="flex-1 text-[13px] font-semibold">How it works</h3>
        <button type="button" onClick={onGraph} className="flex items-center gap-1 text-[12.5px] text-fg-3 hover:text-fg">
          <Network size={13} />
          As a graph
        </button>
      </div>
      <ol className="relative space-y-2 before:absolute before:top-3 before:bottom-3 before:left-[11px] before:w-px before:bg-line">
        {shown.map((s) => {
          const Icon = ICON[s.do];
          const extra = how(s);
          return (
            <li key={s.id} className="relative flex items-start gap-2.5">
              <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line bg-panel">
                <Icon size={13} style={{ color: KIND_COLOR[s.do] }} />
              </span>
              <span className="min-w-0 pt-0.5 text-[13px] leading-snug">
                <span translate={own ? 'no' : undefined}>{titleOf(s)}</span>
                {extra && <span className="ml-1.5 text-[11.5px] text-fg-3">{extra}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {more > 0 && <div className="mt-2 pl-[34px] text-[12px] text-fg-3">{tr(`and ${more} more`)}</div>}
    </section>
  );
}
