// The agent's work in a web app's conversation with Technical details off: folded into one quiet line (the strip above the
// message box says what is being done), with no tool, command or file in sight until the person asks to see it.
import { ChevronRight } from 'lucide-react';
import { Throbber } from '../../../components/ui';

export function QuietWork({ live, status, empty, onShow }: { live?: boolean; /** How the turn ended, once it has. */ status?: string; /** Nothing to show yet. */ empty?: boolean; onShow: () => void }) {
  const stopped = status === 'failed' ? 'It did not finish' : status === 'interrupted' ? 'Stopped' : '';
  return (
    <div className="flex min-h-9 items-center gap-2.5 px-2 text-[13px] text-fg-3" data-quiet-work>
      {live && <Throbber size={14} />}
      {live && empty && <span>Working on it</span>}
      {!live && stopped && <span>{stopped}</span>}
      {!empty && (
        <button type="button" onClick={onShow} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 hover:text-fg-2">
          Show the work
          <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}
