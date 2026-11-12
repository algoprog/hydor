// Confidential sessions: everything stays on this computer (server/confidential enforces it). On the start page, a
// switch under Options, with one line under it; in a confidential session, a lock by its title (and in the sidebar)
// that says what is on and off, the message box's border in a calm tint, and once a line above the box.
import { useRef, useState } from 'react';
import { Lock, X } from 'lucide-react';
import type { SessionExtra } from '@shared/features';
import { isConfidential } from '@shared/confidential';
import type { SessionSummary } from '@shared/types';
import { go } from '../../lib/nav';
import { cx, Popover, SettingChip, Switch } from '../../components/ui';
import { toast } from '../../lib/store';
import type { WebFeature } from '../registry';
import { useConfidentialInfo } from './state';

/** Its words, one per line, so each translates as one. */
const LINE = 'Only models on this computer. Nothing leaves it.';

/**
 * On the start page, under Options: Confidential on or off, kept for the next start like memory. On, the agent becomes
 * Custom with the best model on this computer (the start page does that), and Swarm, Deep research and the arena go off.
 */
function StartOption({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const info = useConfidentialInfo();
  const on = isConfidential(value);
  const none = on && info && !info.models.length;
  return (
    <div>
      <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-bg-2 max-sm:min-h-11" title={LINE}>
        <Lock size={14} className={cx('shrink-0', on ? 'text-ok' : 'text-fg-3')} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] text-fg-2 max-sm:text-[14.5px]">Confidential</span>
          <span className="block text-[11.5px] leading-snug text-fg-3">{LINE}</span>
        </span>
        <Switch
          on={on}
          label="Confidential: only models on this computer"
          onChange={(v) => onChange(v ? { confidential: true, swarm: undefined, research: undefined, arena: undefined } : { confidential: undefined })}
        />
      </label>
      {none && (
        <div className="mx-2.5 mb-1.5 rounded-lg bg-warn/10 px-2.5 py-2 text-[12px] leading-snug text-fg-2">
          There is no model on this computer yet.{' '}
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => go('/settings?s=models')}>
            Settings → Models
          </button>{' '}
          installs the ones suggested for it with one click.
        </div>
      )}
      {on && info && !info.sandbox && <div className="mx-2.5 mb-1.5 text-[11.5px] leading-snug text-fg-3">Commands can’t be cut off from the network on this computer, so each one asks you first.</div>}
    </div>
  );
}

/** The lock by a confidential session's title: a click says what is on and off. */
export function ConfidentialLock({ s }: { s: SessionSummary }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const info = useConfidentialInfo();
  if (!isConfidential(s.extra)) return null;
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Confidential: what this means"
        title="Confidential: only models on this computer, nothing leaves it"
        className={cx('inline-flex h-6 shrink-0 items-center justify-center rounded-md px-1 text-ok transition-colors hover:bg-bg-2', open && 'bg-bg-2')}
      >
        <Lock size={14} strokeWidth={2.2} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={320} title="Confidential">
        <div className="space-y-2 px-2.5 py-2 text-[12.5px] leading-snug text-fg-2">
          <div className="flex items-center gap-2 text-[13.5px] font-medium text-fg">
            <Lock size={14} className="text-ok" /> Confidential
          </div>
          <p>This session stays on this computer: its model runs here, and nothing from it is sent anywhere.</p>
          <p>
            <span className="font-medium text-fg">On:</span> the files in its folder, documents, the Library, knowledge bases, memory notes to read, and subagents, which are confidential too.
          </p>
          <p>
            <span className="font-medium text-fg">Off:</span> web search and web pages, the browser, connected apps and keys, apps, publishing, scheduled tasks, models elsewhere, and saving to memory.
          </p>
          <p>{info && !info.sandbox ? 'Commands can’t be cut off from the network on this computer, so each one asks you first.' : 'Commands run without network.'}</p>
          <p>
            {info?.helper ? 'Its title comes from the helper model on this computer.' : 'Its title is its first words.'} Notifications don’t name it, and it can’t be shared or handed to another
            agent.
          </p>
          <p className="text-fg-3">It stays confidential, so what was said stays here. For work that may leave this computer, start a new session.</p>
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => (setOpen(false), go('/guide/sessions#keep-a-session-confidential'))}>
            How confidential sessions work
          </button>
        </div>
      </Popover>
    </>
  );
}

const SEEN = 'wa.confidential.seen';

/** Above a confidential session's message box, until you close it once (on this device): what it means, in a line. */
function Dock({ s }: { s: SessionSummary }) {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(SEEN) === '1';
    } catch {
      return false;
    }
  });
  if (seen || !isConfidential(s.extra)) return null;
  const close = () => {
    setSeen(true);
    try {
      localStorage.setItem(SEEN, '1');
    } catch {}
  };
  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/5 px-3 py-1.5 text-[12.5px] sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]">
      <Lock size={14} className="shrink-0 text-ok" />
      <span className="min-w-0 flex-1 text-fg-2">Confidential: only models on this computer, no internet, nothing leaves it.</span>
      <button type="button" onClick={close} className="shrink-0 rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-fg" aria-label="Close" title="Close">
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * In a session's options (the message box's chip): whether it is confidential. That is set when a session starts and
 * stays, so a click says how to get the other.
 */
function SessionOption({ s }: { s: SessionSummary }) {
  const on = isConfidential(s.extra);
  return (
    <SettingChip
      label="Confidential"
      icon={<Lock size={14} className={on ? 'text-ok' : undefined} />}
      value={on ? 'On' : 'Off'}
      on={on}
      title="Set when a session starts, and kept"
      onClick={() =>
        toast(
          on
            ? 'This session stays confidential, so what was said stays on this computer. Start a new session for work that may leave it.'
            : 'A session is confidential from its start: start a new one with Options → Confidential.',
        )
      }
    />
  );
}

export const confidentialFeature: WebFeature = {
  id: 'confidential',
  SessionOptions: SessionOption,
  StartOptions: StartOption,
  SessionDock: Dock,
};
