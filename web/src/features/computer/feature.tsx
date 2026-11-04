// Computer use in the desktop apps (Mac, Windows, Linux): agents see the computer's screen and use its mouse and
// keyboard. Its steps in the conversation (with the screen after each), a line above the message box while this
// session's agent is at the computer (with Stop), and Settings → Computer use.
import { useEffect } from 'react';
import { MousePointerClick } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import type { WebFeature } from '../registry';
import { ComputerSettings } from './Settings';
import { ComputerStep } from './Steps';
import { listenComputer, stopComputer, useComputer } from './store';

const USING = { mac: 'The agent is using your Mac', windows: 'The agent is using your PC', linux: 'The agent is using your computer' } as const;

/** Above the message box while this session's agent is using the computer. */
function ComputerDock({ s }: { s: SessionSummary }) {
  useEffect(() => listenComputer(), []);
  const here = useComputer((x) => x.active?.key === s.key);
  const system = useComputer((x) => x.state?.system);
  if (!here) return null;
  return (
    <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl border border-line bg-bg-1 px-3 py-1.5 text-[12.5px] sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]">
      <MousePointerClick size={14} className="shrink-0 text-busy" />
      <span className="min-w-0 flex-1 truncate text-fg-2">{USING[system ?? 'mac']}</span>
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
  settings: [{ id: 'computer', label: 'Computer use', icon: MousePointerClick, sub: 'Agents see your screen and use the mouse and keyboard, in the desktop app', Body: ComputerSettings }],
};
