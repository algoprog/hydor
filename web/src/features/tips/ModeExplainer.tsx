// The first time someone picks a mode that costs several times what one agent does (shared/tips.ts COSTLY_MODES),
// a short explanation comes before it is on: what it does, what it is worth it for, what it is not, and what it
// costs. Use it, and it is on and never explained again (on any device); Cancel leaves things as they were, and it
// comes again next time. It comes whether tips are on or not: it is about what the user pays, not a tour.
import { useEffect, useState, type ReactNode } from 'react';
import { Sparkles, Ban, Coins, Info } from 'lucide-react';
import type { CostlyMode } from '@shared/tips';
import { Button, Dialog } from '../../components/ui';
import { loadTips, modeExplained, useTips } from './state';

interface ModeText {
  name: string;
  does: string;
  good: string;
  not: string;
  cost: string;
}

const TEXT: Record<CostlyMode, ModeText> = {
  swarm: {
    name: 'Swarm',
    does: 'A lead agent and several members work on the same problem at once, each from its own angle, and share what they find on a board. The lead checks their work and answers you.',
    good: 'Hard problems with no clear way in: a stubborn bug, a design with several possible answers, a question that gains from very different approaches.',
    not: 'Simple or routine tasks: a question, a quick fix, a short edit, a document. One agent does those as well, for a fraction of the cost.',
    cost: 'Every member is a whole agent of its own, so a swarm usually costs several times what one agent does and uses up your plan’s limits that much faster. A spending cap keeps it in hand.',
  },
  campaign: {
    name: 'Campaign',
    does: 'A lead agent splits one big change into parts, and members make the parts at once, each in a worktree of its own. The lead checks each part and brings them together.',
    good: 'A large change spread over many files or modules of a git repository: a migration, a rename across the code, the same fix in many places.',
    not: 'A change to a few files, or work that is not code in a repository. One agent is quicker there and costs much less.',
    cost: 'Every part is made by a whole agent of its own, so a campaign usually costs several times what one agent does and uses up your plan’s limits that much faster. A spending cap keeps it in hand.',
  },
  research: {
    name: 'Deep research',
    does: 'The agent splits your question into parts, sends a researcher after each, digs into what they leave open, has the key claims checked against two sources, and writes a report with every source cited.',
    good: 'Questions that need many sources found and weighed: a market, a technical comparison, an overview of a field, a decision with a lot riding on it.',
    not: 'A fact, a quick lookup, or anything one or two searches answer. With it off, the agent still searches the web whenever it needs to.',
    cost: 'Several researchers and up to the number of searches you set: often ten times or more what one answer costs. A spending cap keeps it in hand.',
  },
  arena: {
    name: 'Arena',
    does: 'Your message goes to one or two more models as well, each in a session of its own, so you can compare their answers side by side and keep the best one.',
    good: 'Finding out which model does a kind of work best, or a task where a second take is worth paying for.',
    not: 'Everyday tasks: each extra model is a whole extra session doing the same work.',
    cost: 'Two or three times what one session costs, one share for each model.',
  },
};

function Part({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 py-1.5">
      <span className="mt-0.5 shrink-0 text-fg-3">{icon}</span>
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-fg-2">{title}</div>
        <div className="text-[13px] leading-snug text-fg">{children}</div>
      </div>
    </div>
  );
}

/**
 * `ask(mode, use)`: runs `use` at once when the mode was explained already; else shows its explanation, and runs
 * `use` only once the user chooses to use it. Render `dialog` where the hook is used.
 */
export function useCostlyMode(): { ask: (mode: CostlyMode, use: () => void) => void; dialog: ReactNode } {
  const loaded = useTips((x) => x.loaded);
  const [pending, setPending] = useState<{ mode: CostlyMode; use: () => void } | null>(null);
  useEffect(() => {
    if (!loaded) loadTips();
  }, [loaded]);
  const ask = (mode: CostlyMode, use: () => void) => {
    if (useTips.getState().explained.includes(mode)) use();
    else setPending({ mode, use });
  };
  const t = pending ? TEXT[pending.mode] : null;
  const close = () => setPending(null);
  const dialog = (
    <Dialog
      open={!!pending}
      onClose={close}
      title={t ? `Before you use ${t.name}` : ''}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!pending) return;
              modeExplained(pending.mode);
              pending.use();
              close();
            }}
          >
            {t ? `Use ${t.name}` : 'Use it'}
          </Button>
        </>
      }
    >
      {t && (
        <div className="-mt-1">
          <Part icon={<Info size={15} />} title="What it does">
            {t.does}
          </Part>
          <Part icon={<Sparkles size={15} />} title="Worth it for">
            {t.good}
          </Part>
          <Part icon={<Ban size={15} />} title="Not worth it for">
            {t.not}
          </Part>
          <Part icon={<Coins size={15} />} title="What it costs">
            {t.cost}
          </Part>
          <p className="mt-2 text-[12px] text-fg-3">This shows once. You can turn it off again at any time.</p>
        </div>
      )}
    </Dialog>
  );
  return { ask, dialog };
}
