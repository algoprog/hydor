// The short sheet that starts a web app: what it is for (an idea picked, something else, or an agent app that gets pages of its
// own), a name, a line on what it is for, Start. Start opens the App builder's conversation in a folder made for the app.
import { useEffect, useRef, useState } from 'react';
import type { WebKind } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { Button, cx, Dialog, inputCls, useMediaQuery } from '../../components/ui';
import { useStartBuilder } from '../apps/startBuilder';
import { KindArt } from './KindArt';
import { KindNeeds } from './Kinds';
import { planStart } from './start';

export function StartSheet({ kind, agent, onClose, before }: {
  kind: WebKind | null;
  /** The sheet of "Give it an app of its own": the agent app's name. */
  agent?: { name: string };
  /** For an agent app: its id once it is the person's own (a ready-made one is copied first). Null stops the start. */
  before?: () => Promise<string | null>;
  onClose: () => void;
}) {
  const start = useStartBuilder();
  const phone = useMediaQuery('(max-width: 639px)');
  const [name, setName] = useState(agent?.name ?? '');
  const [line, setLine] = useState('');
  const first = useRef<HTMLInputElement>(null);
  const starting = useRef(false);
  useEffect(() => {
    // On a phone the keyboard would cover the sheet: the person taps the field.
    if (!phone) first.current?.focus({ preventScroll: true });
  }, [phone]);
  const go_ = async () => {
    if (starting.current) return;
    starting.current = true;
    const id = agent && before ? await before() : null;
    if (agent && !id) {
      starting.current = false;
      return;
    }
    const plan = planStart({ kind, name, line, ...(agent && id ? { agent: { id, name: agent.name } } : {}) }, tr);
    start(plan.prompt, { webKind: plan.webKind }, { make: plan.make, placeholder: plan.placeholder });
    onClose();
  };
  const art = agent ? 'agent-app' : (kind?.id ?? 'other');
  return (
    <Dialog
      open
      onClose={onClose}
      title={agent ? tr('Give it an app of its own') : kind ? tr(kind.name) : tr('Something else')}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void go_()}>
            Start
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="aspect-[16/7] overflow-hidden rounded-xl border border-line bg-bg-2 max-sm:aspect-[16/9]">
          <KindArt id={art} />
        </div>
        <p className="text-[13.5px] leading-relaxed text-fg-2">
          {agent ? tr('An agent builds a web app whose pages start this app’s work, follow it and show what it finds. This app keeps its steps, and still runs here and in conversations.') : kind ? tr(kind.who) : tr('Say what you have in mind. The agent asks what it needs and shows you a sketch before anything is built.')}
        </p>
        {kind && <KindNeeds k={kind} />}
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium">
            {tr('Name of the app')}
            {!agent && <span className="ml-1.5 font-normal text-fg-3">{tr('you can change it later')}</span>}
          </span>
          <input ref={first} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} translate="no" onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void go_()} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium">
            {tr('What is it for?')}
            <span className="ml-1.5 font-normal text-fg-3">{tr('optional')}</span>
          </span>
          <textarea
            className={cx(inputCls, 'h-auto min-h-[76px] py-2 leading-snug')}
            rows={3}
            value={line}
            onChange={(e) => setLine(e.target.value)}
            maxLength={400}
            placeholder={agent ? tr('A line or two: who uses it and what they do there') : kind ? tr('A line or two: who uses it and what they do there') : tr('For example: a place where my clients can book me and pay')}
          />
        </label>
      </div>
    </Dialog>
  );
}
