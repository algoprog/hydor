// How an app with steps works, at a glance on its page: its steps in order, each with its kind's icon and how it
// runs (once for each item, several at once, side by side), and a way to its graph in the builder.
import { ChevronRight, Network } from 'lucide-react';
import type { Flow, Step } from '@shared/app-manifest';
import { titleOf } from '@shared/app-manifest';
import { tr } from '../../i18n/runtime';
import { ICON, KIND_COLOR } from './GraphEditor';

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

/** `own`: one of yours, whose step titles stay as you wrote them in every language. */
export function FlowStrip({ flow, onGraph, own }: { flow: Flow; onGraph: () => void; own?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-1 text-[12.5px] font-medium text-fg-2">How it works</span>
        <button type="button" onClick={onGraph} className="flex items-center gap-1 text-[12.5px] text-fg-3 hover:text-fg">
          <Network size={13} />
          See it as a graph
        </button>
      </div>
      <ol className="flex items-center gap-1 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
        {flow.steps.map((s, i) => {
          const Icon = ICON[s.do];
          const extra = how(s);
          return (
            <li key={s.id} className="flex shrink-0 items-center gap-1">
              {i > 0 && <ChevronRight size={13} className="shrink-0 text-fg-3" />}
              <span className="flex items-center gap-1.5 rounded-lg border border-line bg-bg-1 px-2 py-1 text-[12.5px]" title={extra ?? undefined}>
                <Icon size={13} style={{ color: KIND_COLOR[s.do] }} className="shrink-0" />
                <span translate={own ? 'no' : undefined}>{titleOf(s)}</span>
                {extra && <span className="text-[11.5px] text-fg-3">{extra}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
