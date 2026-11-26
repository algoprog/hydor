// What stands above the message box of a conversation about a web app (Dock.tsx reads it).
import { Check, CircleAlert, ListChecks } from 'lucide-react';
import { tr } from '../../../i18n/runtime';
import { Button, Throbber } from '../../../components/ui';
import type { CheckedLine, StripState } from './plain';
import { StripView } from './StripView';

export function DockView({ strip, cost, line, fixing, onFix, tried, onApp }: { strip: StripState; cost?: number; line: CheckedLine | null; fixing: boolean; onFix: () => void; tried: { done: number; of: number } | null; onApp: () => void }) {
  return (
    <div className="mx-3 mb-2 rounded-xl border border-line bg-bg-1 px-3 py-2.5 sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]" data-web-dock>
      <StripView strip={strip} cost={cost} compact />
      {(line || tried) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-2 text-[13px]">
          {line && (
            <span className="flex min-w-0 items-center gap-1.5" data-dock-checked={line.state}>
              {fixing ? <Throbber size={13} /> : line.state === 'ok' ? <Check size={14} className="shrink-0 text-ok" /> : <CircleAlert size={14} className="shrink-0 text-warn" />}
              <span translate="no">{fixing && line.state === 'fix' ? tr('The agent is fixing them') : line.text}</span>
              {line.state === 'fix' && !fixing && (
                <Button size="sm" variant="secondary" className="ml-1 h-7" onClick={onFix}>
                  Fix them
                </Button>
              )}
            </span>
          )}
          <span className="flex-1" />
          {tried && (
            <Button size="sm" variant="ghost" className="h-7" icon={<ListChecks size={13} />} onClick={onApp}>
              <span translate="no">{tr(`Try it: ${tried.done} of ${tried.of} work`)}</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
