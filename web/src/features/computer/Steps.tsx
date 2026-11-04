// Computer steps in the conversation: what the agent did on the computer in a line, with a small picture of the screen
// after it (its answer starts "Computer step N"); the picture opens large, the line opens the full answer.
import { memo, useState } from 'react';
import { ChevronRight, Monitor, MousePointerClick, XCircle } from 'lucide-react';
import type { ToolItem } from '@shared/types';
import { openLightbox } from '../../components/Lightbox';
import { cx } from '../../components/ui';
import { enc } from '../../lib/api';
import { mu } from '../../lib/machine';
import { ToolDetail } from '../session/items';
import { nagetTool } from '../registry';

type Args = Record<string, any>;
const pt = (c: unknown) => (Array.isArray(c) && c.length === 2 ? ` at ${Math.round(Number(c[0]))}, ${Math.round(Number(c[1]))}` : '');
const clip = (s: unknown, n = 32) => {
  const t = String(s ?? '').replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** One action as asked, in a few words. */
function actionLine(a: Args): string {
  switch (String(a.action ?? '')) {
    case 'left_click':
    case 'click':
      return `Click${pt(a.coordinate)}`;
    case 'double_click':
      return `Double-click${pt(a.coordinate)}`;
    case 'triple_click':
      return `Triple-click${pt(a.coordinate)}`;
    case 'right_click':
      return `Right-click${pt(a.coordinate)}`;
    case 'middle_click':
      return `Middle-click${pt(a.coordinate)}`;
    case 'mouse_move':
      return `Point${pt(a.coordinate)}`;
    case 'left_click_drag':
      return 'Drag';
    case 'scroll':
      return `Scroll ${a.scroll_direction ?? 'down'}`;
    case 'type':
      return `Type “${clip(a.text)}”`;
    case 'key':
      return `Press ${clip(a.text, 24)}`;
    case 'hold_key':
      return `Hold ${clip(a.text, 24)}`;
    case 'wait':
      return 'Wait';
    case 'cursor_position':
      return 'Find the pointer';
    case 'open_app':
      return `Open ${clip(a.app ?? a.text, 40)}`;
    default:
      return String(a.action ?? 'Act');
  }
}

/** What the step did, from the answer's numbered lines ("1. Clicked at (640, 400)."), else what was asked. */
function summary(tool: string, a: Args, running: boolean, output?: string): string {
  if (tool === 'computer_screenshot') return running ? 'Looking at the screen' : 'Looked at the screen';
  const did = [...(output ?? '').slice(0, 3000).matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1].replace(/\.$/, ''));
  if (!running && did.length) return did.join(' · ');
  const steps: Args[] = Array.isArray(a.steps) ? a.steps : [a];
  return steps.map(actionLine).join(', ');
}

export const ComputerStep = memo(function ComputerStep({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const [open, setOpen] = useState(false);
  const [noPic, setNoPic] = useState(false);
  const tool = nagetTool(t.name) ?? t.name;
  const running = t.status === 'running' || t.status === 'pending';
  const n = /Computer step (\d+)/.exec((t.output ?? '').slice(0, 200))?.[1];
  const pic = n && !noPic ? mu(`/api/computer/sessions/${enc(sessionKey)}/steps/${n}`) : null;
  const failed = t.status === 'error' || (!n && !running && !!t.output);
  const Icon = tool === 'computer_screenshot' ? Monitor : MousePointerClick;
  const enlarge = () => pic && openLightbox([{ src: pic, name: summary(tool, (t.input ?? {}) as Args, false, t.output) }]);
  return (
    <div className="tl-item">
      <div className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-bg-2', open && 'bg-bg-2')}>
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <Icon size={14} className={cx('shrink-0', failed ? 'text-err' : running ? 'text-busy' : 'text-fg-3')} />
          <span className={cx('min-w-0 flex-1 truncate text-[13px]', running ? 'shine' : 'text-fg-2')}>{summary(tool, (t.input ?? {}) as Args, running, t.output)}</span>
        </button>
        {pic && (
          <button onClick={enlarge} className="shrink-0 cursor-zoom-in" aria-label="Show the screen larger">
            <img src={pic} alt="" loading="lazy" onError={() => setNoPic(true)} className="h-7 w-11 rounded border border-line object-cover object-top" />
          </button>
        )}
        {failed && <XCircle size={14} className="shrink-0 text-err" />}
        <ChevronRight size={14} onClick={() => setOpen((o) => !o)} className={cx('shrink-0 cursor-pointer text-fg-3 opacity-0 transition group-hover:opacity-100', open && 'rotate-90 opacity-100')} />
      </div>
      {open && (
        <div>
          {pic && (
            <div className="pt-1.5 pl-7">
              <button onClick={enlarge} className="cursor-zoom-in">
                <img src={pic} alt="The screen after this step" className="max-h-[260px] max-w-full rounded-lg border border-line" />
              </button>
            </div>
          )}
          <ToolDetail t={t} item={item} sessionKey={sessionKey} />
        </div>
      )}
    </div>
  );
});
