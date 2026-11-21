// A question the goal has open for you. Which way next: ways to tick (several may be, in the order to follow them), with the
// agent's own pick marked, a way of your own, a note for the agent, and a clock after which it goes on with its pick. A
// check only you can confirm: It holds or Not yet. Something only you can give: a note, and Send.
import { useEffect, useState, type ReactNode } from 'react';
import { Check, MessageCircleQuestion, Timer } from 'lucide-react';
import type { GoalQuestion, GoalState } from '@shared/goals';
import { Badge, Button, cx, inputCls } from '../../components/ui';
import { useAct } from './state';
import { clockTick, clockWords, goLabel } from './words';

/** The time now, moving on as the clock's words need it to; nothing moves without a clock. */
function useNow(until: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until == null) return;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      if (until > n) t = setTimeout(tick, clockTick(until, n));
    };
    tick();
    return () => clearTimeout(t);
  }, [until]);
  return now;
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function Shell({ q, tone, children, right }: { q: GoalQuestion; tone: 'accent' | 'warn'; children: ReactNode; right?: ReactNode }) {
  return (
    <div
      role="group"
      aria-label="A question from the goal"
      className={cx(
        'anim-pop overflow-hidden rounded-xl border bg-panel',
        tone === 'warn' ? 'border-warn/45 shadow-[0_0_0_3px_color-mix(in_srgb,var(--warn)_10%,transparent)]' : 'border-accent/45 shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_10%,transparent)]',
      )}
    >
      <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5', tone === 'warn' ? 'bg-warn/8' : 'bg-accent-soft')}>
        <MessageCircleQuestion size={15} className={cx('shrink-0', tone === 'warn' ? 'text-warn' : 'text-accent')} />
        <span translate="no" className="min-w-[min(100%,200px)] flex-1 text-[14px] font-semibold leading-snug">
          {q.question}
        </span>
        {right}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Note({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <>
      <label className="mt-3 mb-1 block text-[12px] text-fg-3">A note for the agent (optional)</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} aria-label="A note for the agent" placeholder={placeholder} className={cx(inputCls, 'h-auto min-h-0 py-2 text-[13.5px] leading-snug')} />
    </>
  );
}

function Context({ q }: { q: GoalQuestion }) {
  return q.context ? (
    <p translate="no" className="text-[13.5px] leading-relaxed text-fg-2">
      {q.context}
    </p>
  ) : null;
}

/** Which way next: tick the ways to follow, add one of your own, give a note. */
function Ways({ g, q }: { g: GoalState; q: GoalQuestion }) {
  const [run, busy] = useAct(g.key);
  // The agent's own pick starts ticked; the order of ticking is the order to follow.
  const [ticked, setTicked] = useState<number[]>(q.ways[q.pick] ? [q.pick] : []);
  const [otherText, setOtherText] = useState('');
  const [note, setNote] = useState('');
  const now = useNow(q.expiresAt);
  const other = q.ways.length;
  // Without ways to number (only "Something else"), no keys and no numbers.
  const numbered = other > 0;
  const toggle = (i: number) => setTicked((t) => (t.includes(i) ? t.filter((x) => x !== i) : [...t, i]));
  const otherOn = ticked.includes(other);
  const count = ticked.filter((i) => i < other).length + (otherOn && otherText.trim() ? 1 : 0);
  // Number keys tick a way while focus is not in a field.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      // Not a key held down, not while a dialog is open over the card, and not in a field.
      if (!numbered || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector('[aria-modal="true"]')) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= other + 1) toggle(n - 1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [other, numbered]);
  const go = (ways: number[], text?: string) => void run({ action: 'answer', ways, ...(text ? { other: text } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
  const clock = (
    <span className="ml-auto flex shrink-0 items-center gap-2 text-[12.5px] text-fg-3">
      <Timer size={13} className="shrink-0" />
      <span>{clockWords(q.expiresAt, now)}</span>
      {q.expiresAt != null && (
        <button type="button" disabled={busy} onClick={() => void run({ action: 'wait' })} className="font-medium text-accent hover:underline disabled:opacity-50">
          Wait for me
        </button>
      )}
    </span>
  );
  return (
    <Shell q={q} tone="accent" right={clock}>
      <Context q={q} />
      <div role="group" aria-label="Ways to go" className="mt-3 space-y-2">
        {q.ways.map((w, i) => {
          const on = ticked.includes(i);
          const order = ticked.indexOf(i) + 1;
          return (
            <button
              key={i}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(i)}
              className={cx('flex w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors sm:flex-row sm:gap-3', on ? 'border-accent/70 bg-accent-soft' : 'border-line hover:border-line-2 hover:bg-bg-2')}
            >
              <span className="flex min-w-0 flex-1 items-start gap-2.5">
                <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold', on ? 'bg-accent text-accent-fg' : 'border border-line-2')}>
                  {on && (ticked.length > 1 ? order : <Check size={11} strokeWidth={3.5} />)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {numbered && <span className="text-[12px] text-fg-3 tnum">{i + 1}</span>}
                    <span translate="no" className="text-[14px] font-semibold">
                      {w.name}
                    </span>
                    {i === q.pick && <Badge>Its pick</Badge>}
                  </span>
                  {w.why && (
                    <span translate="no" className="mt-0.5 block text-[13px] leading-snug text-fg-2">
                      {w.why}
                    </span>
                  )}
                  {w.expects && (
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-3">
                      Expects <span translate="no">{w.expects}</span>
                    </span>
                  )}
                </span>
              </span>
              {w.cost && (
                <span translate="no" className="shrink-0 pl-[26px] text-[12.5px] text-fg-3 sm:max-w-[34%] sm:pl-0 sm:text-right">
                  {w.cost}
                </span>
              )}
            </button>
          );
        })}
        <div className={cx('rounded-xl border px-3 py-2.5 transition-colors', otherOn ? 'border-accent/70 bg-accent-soft' : 'border-line')}>
          <button type="button" role="checkbox" aria-checked={otherOn} onClick={() => toggle(other)} className="flex w-full items-center gap-2.5 text-left">
            <span className={cx('flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold', otherOn ? 'bg-accent text-accent-fg' : 'border border-line-2')}>
              {otherOn && (ticked.length > 1 ? ticked.indexOf(other) + 1 : <Check size={11} strokeWidth={3.5} />)}
            </span>
            {numbered && <span className="text-[12px] text-fg-3 tnum">{other + 1}</span>}
            <span className={cx('text-[13.5px]', otherOn ? 'font-medium' : 'text-fg-2')}>Something else: say which way</span>
          </button>
          {otherOn && <input autoFocus value={otherText} onChange={(e) => setOtherText(e.target.value)} aria-label="Which way" className={cx(inputCls, 'mt-2 !h-8 !text-[13px]')} />}
        </div>
      </div>
      <Note value={note} onChange={setNote} />
      {q.why && (
        <p className="mt-2.5 text-[12.5px] leading-snug text-fg-3">
          Why it asks: <span translate="no">{q.why}</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={busy || count === 0}
          onClick={() =>
            go(
              ticked.filter((i) => i < other),
              otherOn ? otherText.trim() : undefined,
            )
          }
        >
          {goLabel(count)}
        </Button>
        <Button size="sm" disabled={busy || !q.ways[q.pick]} onClick={() => go([q.pick])}>
          Only its pick
        </Button>
        {numbered && <span className="ml-auto text-[12px] text-fg-3 max-sm:hidden">{`Keys 1 to ${other + 1} tick a way`}</span>}
      </div>
    </Shell>
  );
}

/** A check only you can confirm: does it hold? */
function Yours({ g, q }: { g: GoalState; q: GoalQuestion }) {
  const [run, busy] = useAct(g.key);
  const [note, setNote] = useState('');
  const say = (way: number) => void run({ action: 'answer', ways: [way], ...(note.trim() ? { note: note.trim() } : {}) });
  return (
    <Shell q={q} tone="accent">
      <Context q={q} />
      <Note value={note} onChange={setNote} placeholder="What you saw, or what still is not right" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={busy} onClick={() => say(0)}>
          It holds
        </Button>
        <Button size="sm" disabled={busy} onClick={() => say(1)}>
          Not yet
        </Button>
        <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-fg-3">
          <Timer size={13} /> waits for you
        </span>
      </div>
    </Shell>
  );
}

/** Something only you can give: say it, and it goes on. */
function Blocked({ g, q }: { g: GoalState; q: GoalQuestion }) {
  const [run, busy] = useAct(g.key);
  const [note, setNote] = useState('');
  return (
    <Shell q={q} tone="warn">
      <Context q={q} />
      <Note value={note} onChange={setNote} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={busy || !note.trim()} onClick={() => void run({ action: 'answer', ways: [], note: note.trim() })}>
          Send
        </Button>
        <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-fg-3">
          <Timer size={13} /> waits for you
        </span>
      </div>
    </Shell>
  );
}

export function Question({ g }: { g: GoalState }) {
  const q = g.question;
  if (!q) return null;
  // A new question starts from its own state (the pick ticked, an empty note).
  return q.kind === 'yours' ? <Yours key={q.id} g={g} q={q} /> : q.kind === 'blocked' ? <Blocked key={q.id} g={g} q={q} /> : <Ways key={q.id} g={g} q={q} />;
}
