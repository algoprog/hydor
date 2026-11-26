// A web app's page with Technical details off: one page, no tabs, and only what a person acts on. The state in one short
// line, what needs them only when something does, the app itself large, the things to try (folded to their count once all
// work), one box to say what should be different, and two buttons (put it online or share it; undo the last change). The
// strip shows only while something is being made, and the checks only say a word when all is fine. Drawn from what it is
// given (Home.tsx reads it), so a script can draw it and read every word.
import { useState, type ReactNode, type RefObject } from 'react';
import { Check, ChevronDown, CircleAlert, ExternalLink, Globe, MousePointerClick, Send, Share2, Undo2, X } from 'lucide-react';
import type { TryItem } from '@shared/webapps';
import { tr } from '../../../i18n/runtime';
import { Button, cx, inputCls, Throbber } from '../../../components/ui';
import type { CheckedLine, State, StripState, Tone } from './plain';
import { StripView } from './StripView';

export const CARD = 'rounded-2xl border border-line bg-panel p-4';
const DOT: Record<Tone, string> = { ok: 'bg-ok', idle: 'bg-fg-4', busy: 'bg-accent animate-pulse', err: 'bg-err' };

export interface Need {
  id: string;
  title: string;
  line?: string;
  button: string;
  go: () => void;
  /** A second, quieter answer ("Not now"). */
  other?: { label: string; go: () => void };
  /** Something is wrong, not only wanted. */
  bad?: boolean;
}

/** One sentence on the app's state, with what is wrong and what can be done. */
export function StateLine({ state, technical }: { state: State; technical?: boolean }) {
  return (
    <div data-state-line data-tone={state.tone}>
      <p className="flex items-start gap-2 text-[15px] leading-snug font-semibold">
        <span aria-hidden className={cx('mt-[7px] size-2.5 shrink-0 rounded-full', DOT[state.tone])} />
        <span translate="no" className="min-w-0 break-words">
          {state.text}
        </span>
      </p>
      {state.next && (
        <p translate="no" className="mt-1 pl-[18px] text-[13.5px] leading-snug text-fg-2">
          {state.next}
        </p>
      )}
      {technical && state.reason && (
        <p translate="no" className="mt-1 pl-[18px] font-mono text-[12px] leading-snug break-words text-fg-3">
          {state.reason}
        </p>
      )}
    </div>
  );
}

export function NeedsView({ needs }: { needs: Need[] }) {
  if (!needs.length) return null;
  return (
    <section className="rounded-2xl border border-warn/45 bg-warn/5 p-4" data-needs aria-label={tr('Needs you')}>
      <h2 className="text-[13px] font-semibold text-warn">Needs you</h2>
      <ul className="mt-2 divide-y divide-line">
        {needs.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0" data-need={n.id}>
            <div className="min-w-0 flex-1 basis-44">
              <div translate="no" className="text-[14px] leading-snug font-medium">
                {n.title}
              </div>
              {n.line && (
                <div translate="no" className="mt-0.5 text-[13px] leading-snug text-fg-2">
                  {n.line}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {n.other && (
                <Button size="sm" variant="ghost" onClick={n.other.go}>
                  <span translate="no">{n.other.label}</span>
                </Button>
              )}
              <Button size="sm" variant="primary" onClick={n.go}>
                <span translate="no">{n.button}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ActionsProps {
  online: boolean;
  /** The newest saved step, as "Undo the last change" says it (null: nothing to undo). */
  undo: { message: string; isUndo: boolean } | null;
  undoing?: boolean;
  onChange: (what: string) => void;
  onOnline: () => void;
  onUndo: () => void;
  boxRef?: RefObject<HTMLTextAreaElement | null>;
}

/** The box "What should be different?" and the two other actions. Which change would be undone is said when it is pressed. */
export function ActionsView({ online, undo, undoing, onChange, onOnline, onUndo, boxRef }: ActionsProps) {
  const [what, setWhat] = useState('');
  const send = () => {
    if (!what.trim()) return;
    onChange(what.trim());
    setWhat('');
  };
  return (
    <section className={CARD} data-actions>
      <textarea
        ref={boxRef}
        className={cx(inputCls, 'h-auto min-h-[68px] resize-none py-2 leading-snug')}
        rows={2}
        value={what}
        onChange={(e) => setWhat(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={tr('What should be different?')}
      />
      {what.trim() && (
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="primary" icon={<Send size={13} />} onClick={send}>
            Change it
          </Button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" className="flex-1 justify-center" icon={online ? <Share2 size={15} /> : <Globe size={15} />} onClick={onOnline} data-action={online ? 'share' : 'online'}>
          {online ? 'Share it' : 'Put it online'}
        </Button>
        {undo && (
          <Button variant="ghost" className="flex-1 justify-center" icon={undoing ? <Throbber size={13} /> : <Undo2 size={15} />} disabled={undoing} onClick={onUndo} data-action="undo">
            Undo the last change
          </Button>
        )}
      </div>
    </section>
  );
}

export interface TryProps {
  items: TryItem[];
  onWorks: (id: string) => void;
  /** Sends what is wrong to the agent; `part`: the part of the page pointed at, in words. */
  onWrong: (id: string, what: string) => void;
  /** Pointing at a part of the app beside (absent: there is nothing to point at here). */
  point?: { on: boolean; picked: string; toggle: () => void };
  /** Which item's box is open (a test or a picture sets it; else the person's taps do). */
  openId?: string;
}

/** The things to try, each with Works and Something is wrong. */
export function TryView({ items, onWorks, onWrong, point, openId }: TryProps) {
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const [what, setWhat] = useState('');
  const [shown, setShown] = useState(false);
  if (!items.length) return null;
  const done = items.filter((i) => i.result === 'works' && !i.again).length;
  // All tried and working: one line, which opens the list again.
  const all = done === items.length;
  const close = () => {
    setOpen(null);
    setWhat('');
    if (point?.on) point.toggle();
  };
  return (
    <section className={CARD} data-try>
      {all ? (
        <button type="button" aria-expanded={shown} onClick={() => setShown((v) => !v)} className="flex w-full items-center gap-2 text-left" data-try-folded>
          <Check size={15} className="shrink-0 text-ok" />
          <span className="tnum min-w-0 flex-1 text-[14px] font-medium">{tr(`${done} of ${items.length} work`)}</span>
          <ChevronDown size={14} className={cx('text-fg-3 transition-transform', !shown && '-rotate-90')} />
        </button>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[14px] font-semibold">Try it</h2>
          <span className="tnum text-[12px] text-fg-3">{tr(`${done} of ${items.length} work`)}</span>
        </div>
      )}
      <ul className={cx('mt-1 divide-y divide-line', all && !shown && 'hidden')} hidden={all && !shown}>
        {items.map((i) => {
          const works = i.result === 'works' && !i.again;
          const sent = i.result === 'wrong' && !i.again;
          return (
            <li key={i.id} className="py-3 last:pb-0" data-try-item={i.id} data-result={i.again ? 'again' : (i.result ?? 'none')}>
              <p className="flex items-start gap-2 text-[13.5px] leading-snug">
                {works ? <Check size={15} className="mt-px shrink-0 text-ok" /> : sent ? <CircleAlert size={15} className="mt-px shrink-0 text-warn" /> : <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-full border-[1.5px] border-fg-3/70" />}
                <span translate="no" className={cx('min-w-0 break-words', works && 'text-fg-3')}>
                  {i.text}
                </span>
              </p>
              {i.again && <p className="mt-1 pl-[23px] text-[12.5px] leading-snug text-fg-3">Changed since you tried it: try it again.</p>}
              {sent && <p className="mt-1 pl-[23px] text-[12.5px] leading-snug text-fg-3">Sent to the agent. Try it again when it says it is fixed.</p>}
              {!works && open !== i.id && (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-[23px]">
                  <Button size="sm" variant="secondary" icon={<Check size={13} />} onClick={() => onWorks(i.id)}>
                    Works
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => (setOpen(i.id), setWhat(''))}>
                    Something is wrong
                  </Button>
                </div>
              )}
              {open === i.id && (
                <form
                  className="mt-2 space-y-2 pl-[23px]"
                  data-wrong
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!what.trim()) return;
                    onWrong(i.id, what.trim());
                    close();
                  }}
                >
                  <textarea className={cx(inputCls, 'h-auto min-h-[64px] resize-none py-2 leading-snug')} rows={2} value={what} onChange={(e) => setWhat(e.target.value)} placeholder={tr('What happened?')} aria-label={tr('What happened?')} />
                  {point && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" variant={point.on ? 'primary' : 'secondary'} aria-pressed={point.on} icon={<MousePointerClick size={13} />} onClick={point.toggle}>
                        {point.on ? 'Now tap the part in the app' : 'Point at the part'}
                      </Button>
                      {point.picked && (
                        <span translate="no" className="max-w-full truncate rounded-full bg-accent-soft px-2.5 py-1 text-[12px] text-accent">
                          {point.picked}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex justify-end gap-1.5">
                    <Button type="button" size="sm" variant="ghost" icon={<X size={13} />} onClick={close}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" variant="primary" icon={<Send size={13} />} disabled={!what.trim()}>
                      Send it
                    </Button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface CheckedProps {
  line: CheckedLine;
  /** Fix them was pressed and no check has ended since. */
  fixing: boolean;
  onFix: () => void;
  onAgain?: () => void;
  /** The technical lines, shown with Technical details on. */
  details?: ReactNode;
}

/** "Checked: all fine", or "2 things to fix" with Fix them and the list folded under it. */
export function CheckedView({ line, fixing, onFix, onAgain, details }: CheckedProps) {
  const [open, setOpen] = useState(false);
  const bad = line.state === 'fix';
  // Nothing to act on: a word, not a card.
  if (line.state === 'ok' && !fixing && !details)
    return (
      <p className="flex items-center gap-1.5 px-1 text-[12.5px] text-fg-3" data-checked="ok">
        <Check size={13} className="shrink-0 text-ok" />
        <span translate="no">{line.text}</span>
      </p>
    );
  return (
    <section className={cx(CARD, bad && 'border-warn/45')} data-checked={line.state}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex min-w-0 flex-1 basis-44 items-center gap-2 text-[14px] font-medium">
          {line.state === 'checking' || fixing ? <Throbber size={14} /> : line.state === 'ok' ? <Check size={16} className="shrink-0 text-ok" /> : bad || line.state === 'stuck' ? <CircleAlert size={16} className="shrink-0 text-warn" /> : <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-fg-4" />}
          <span translate="no">{fixing && bad ? (line.problems.length === 1 ? tr('The agent is fixing 1 thing') : tr(`The agent is fixing ${line.problems.length} things`)) : line.text}</span>
        </p>
        {bad && !fixing && (
          <Button size="sm" variant="primary" onClick={onFix} data-action="fix">
            Fix them
          </Button>
        )}
        {onAgain && (line.state === 'none' || line.state === 'stuck') && (
          <Button size="sm" variant="secondary" onClick={onAgain}>
            Check it
          </Button>
        )}
      </div>
      {bad && (
        <div className="mt-2">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-lg py-0.5 text-[13px] font-medium text-fg-2 hover:text-fg">
            <ChevronDown size={14} className={cx('text-fg-3 transition-transform', !open && '-rotate-90')} />
            What they are
          </button>
          {open && (
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] leading-snug text-fg-2">
              {line.problems.map((p) => (
                <li key={p} translate="no">
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {details}
    </section>
  );
}

export interface HomeProps {
  state: State;
  strip: StripState;
  needs: Need[];
  actions: ActionsProps;
  tryIt: TryProps;
  checked: CheckedProps;
  /** The app itself (a preview of it), or what stands in its place. */
  preview: ReactNode;
  onOpen?: () => void;
}

export function HomeView({ state, strip, needs, actions, tryIt, checked, preview, onOpen }: HomeProps) {
  const failing = checked.line.state === 'fix';
  return (
    <div className="mx-auto max-w-[1240px] space-y-4 px-4 py-4 sm:px-6 sm:py-5" data-simple="home">
      {/* While something is being made; after that the state's line says where it stands. */}
      {(strip.busy || !strip.done && strip.at < 3) && <StripView strip={strip} bare />}
      <StateLine state={state} />
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr] lg:items-start">
        {(needs.length > 0 || failing) && (
          <div className="order-1 space-y-4 lg:col-start-2 lg:row-start-1">
            <NeedsView needs={needs} />
            {failing && <CheckedView {...checked} />}
          </div>
        )}
        <section className="order-2 overflow-hidden rounded-2xl border border-line bg-panel lg:col-start-1 lg:row-span-2 lg:row-start-1" data-app-itself>
          {onOpen && (
            <div className="flex items-center justify-end border-b border-line px-3 py-1.5">
              <Button size="sm" variant="ghost" icon={<ExternalLink size={13} />} onClick={onOpen} data-action="open">
                Open
              </Button>
            </div>
          )}
          <div className="h-[340px] sm:h-[460px] lg:h-[min(68vh,720px)]">{preview}</div>
        </section>
        <div className={cx('order-3 space-y-4 lg:col-start-2', needs.length > 0 || failing ? 'lg:row-start-2' : 'lg:row-span-2 lg:row-start-1')}>
          <TryView {...tryIt} />
          <ActionsView {...actions} />
          {!failing && <CheckedView {...checked} />}
        </div>
      </div>
    </div>
  );
}
