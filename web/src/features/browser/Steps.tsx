// The browser's steps in the conversation: what the agent did in a line, with a small picture of the
// page after it (its answer starts "Browser step N"), opening to the picture and the full answer.
import { memo, useState } from 'react';
import { ChevronRight, Globe, Hand, XCircle } from 'lucide-react';
import type { ToolItem } from '@shared/types';
import { cx } from '../../components/ui';
import { enc } from '../../lib/api';
import { mu } from '../../lib/machine';
import { ToolDetail } from '../session/items';
import { nagetTool } from '../registry';
import { hostOf } from './store';

type Args = Record<string, any>;

const name = (e: Args) => (e.text ? `“${String(e.text).slice(0, 40)}”` : e.id !== undefined ? `[${e.id}]` : '');

function stepsLine(steps: unknown): string {
  const list = Array.isArray(steps) ? (steps as Args[]) : [];
  if (!list.length) return 'Acted on the page';
  const verbs = list.map((s) => {
    const a = String(s.action ?? Object.keys(s)[0] ?? '');
    const id = s.id ?? (typeof s[a] === 'number' ? s[a] : undefined);
    switch (a) {
      case 'click':
      case 'double_click':
        return `click [${id}]`;
      case 'type':
        return `type ${s.text !== undefined ? `“${String(s.text).slice(0, 24)}”` : ''} in [${id}]`;
      case 'select':
        return `choose “${String(s.option ?? '').slice(0, 24)}”`;
      case 'scroll':
        return `scroll ${s.direction ?? s.scroll ?? 'down'}`;
      case 'keys':
        return `press ${s.keys ?? s.text ?? ''}`;
      case 'hover':
        return `point at [${id}]`;
      case 'back':
        return 'go back';
      case 'wait':
        return 'wait';
      default:
        return a;
    }
  });
  const text = verbs.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What the steps did, from the answer's numbered lines ("Clicked [10] button "Add to cart"."). */
function didLine(output?: string): string | null {
  const lines = [...(output ?? '').slice(0, 3000).matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1].replace(/\.$/, ''));
  return lines.length ? lines.join(' · ') : null;
}

/** The step in a line: what it did when its answer says, else what the agent asked for. */
function summary(tool: string, a: Args, running: boolean, output?: string): string {
  switch (tool) {
    case 'browser_open':
      return `${running ? 'Opening' : 'Opened'} ${hostOf(normal(String(a.url ?? ''))) || String(a.url ?? '')}`;
    case 'browser_act':
      return (!running && didLine(output)) || stepsLine(a.steps ?? (a.action ? [a] : []));
    case 'browser_read': {
      const k = String(a.kind ?? 'state');
      if (k === 'screenshot') return running ? 'Looking at the page' : 'Looked at the page';
      if (k === 'extract') return `Read the page for ${a.question ? `“${String(a.question).slice(0, 60)}”` : 'an answer'}`;
      if (k === 'find') return `Looked for ${name({ text: a.text ?? a.query })} on the page`;
      if (k === 'text') return `Read the page’s text${a.part > 1 ? `, part ${a.part}` : ''}`;
      return running ? 'Reading the page' : 'Read the page';
    }
    case 'browser_tabs':
      return a.action === 'switch' ? `Switched to tab ${a.tab}` : a.action === 'close' ? 'Closed a tab' : 'Listed the tabs';
    case 'browser_upload':
      return `Attached ${String(a.path ?? (Array.isArray(a.paths) ? a.paths.join(', ') : 'a file'))}`;
    case 'browser_ask_user':
      return `Asked you: ${String(a.reason ?? '')}`;
    default:
      return tool;
  }
}

const normal = (u: string) => (/^[a-z]+:/i.test(u) ? u : `https://${u}`);

export const BrowserStep = memo(function BrowserStep({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const [open, setOpen] = useState(false);
  const [noPic, setNoPic] = useState(false);
  const tool = nagetTool(t.name) ?? t.name;
  const running = t.status === 'running' || t.status === 'pending';
  const n = /Browser step (\d+)/.exec((t.output ?? '').slice(0, 400))?.[1];
  const pic = n && !noPic ? mu(`/api/browser/sessions/${enc(sessionKey)}/steps/${n}`) : null;
  const failed = t.status === 'error' || /^(Not opened|That is not|Could not)/m.test((t.output ?? '').slice(0, 200));
  const Icon = tool === 'browser_ask_user' ? Hand : Globe;
  return (
    <div className="tl-item">
      <button onClick={() => setOpen((o) => !o)} className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}>
        <Icon size={14} className={cx('shrink-0', failed ? 'text-err' : running ? 'text-busy' : 'text-fg-3')} />
        <span className={cx('min-w-0 flex-1 truncate text-[13px]', running ? 'shine' : 'text-fg-2')}>{summary(tool, (t.input ?? {}) as Args, running, t.output)}</span>
        {pic && <img src={pic} alt="" loading="lazy" onError={() => setNoPic(true)} className="h-7 w-11 shrink-0 rounded border border-line object-cover object-top" />}
        {failed && <XCircle size={14} className="shrink-0 text-err" />}
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100', open && 'rotate-90 opacity-100')} />
      </button>
      {open && (
        <div>
          {pic && (
            <div className="pt-1.5 pl-7">
              <img src={pic} alt="The page after this step" className="max-h-[220px] max-w-full rounded-lg border border-line" />
            </div>
          )}
          <ToolDetail t={t} item={item} sessionKey={sessionKey} />
        </div>
      )}
    </div>
  );
});
