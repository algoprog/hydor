// Computer use in the Mac app: agents see the Mac's screen and use its mouse and keyboard. Its steps in the
// conversation (with the screen after each), a line above the message box while this session's agent is at the Mac
// (with Stop), and Settings → Computer use.
import { useEffect } from 'react';
import { MousePointerClick } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import type { WebFeature } from '../registry';
import { ComputerSettings } from './Settings';
import { ComputerStep } from './Steps';
import { listenComputer, stopComputer, useComputer } from './store';

/** Above the message box while this session's agent is using the Mac. */
function ComputerDock({ s }: { s: SessionSummary }) {
  useEffect(() => listenComputer(), []);
  const here = useComputer((x) => x.active?.key === s.key);
  if (!here) return null;
  return (
    <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl border border-line bg-bg-1 px-3 py-1.5 text-[12.5px] sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]">
      <MousePointerClick size={14} className="shrink-0 text-busy" />
      <span className="min-w-0 flex-1 truncate text-fg-2">The agent is using your Mac</span>
      <button type="button" onClick={() => void stopComputer()} className="shrink-0 font-medium text-err hover:underline">
        Stop
      </button>
    </div>
  );
}

const step = { place: 'work' as const, Row: ComputerStep };

export const computerFeature: WebFeature = {
  id: 'computer',
  toolViews: { computer_screenshot: step, computer_act: step },
  SessionDock: ComputerDock,
  settings: [{ id: 'computer', label: 'Computer use', icon: MousePointerClick, sub: 'Agents see your Mac’s screen and use its mouse and keyboard, in the Mac app', Body: ComputerSettings }],
};
