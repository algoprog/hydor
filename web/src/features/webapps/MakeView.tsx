// The start of a new web app: the box, the sentences that fill it, the ideas as things to tap, and Start. Drawn from what it
// is given (Make.tsx reads it), so a script can draw it and read every word.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import type { WebKind } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { Button, cx, inputCls } from '../../components/ui';
import { KindArt } from './KindArt';
import { KindNeeds } from './Kinds';

export const EXAMPLE_SENTENCES = [
  'A page where my clients book a time with me, and I see who is coming.',
  'A list of our customers and their jobs that my team can use on their phones.',
  'A members’ page for my club: events, who is coming and who has paid.',
];

export function MakeView({ kinds, technical, focus, onStart, after }: { kinds: WebKind[]; technical?: boolean; focus?: boolean; onStart: (o: { kind: WebKind | null; name: string; line: string }) => void; after?: ReactNode }) {
  const [line, setLine] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WebKind | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focus) box.current?.focus({ preventScroll: true });
  }, [focus]);
  const can = !!line.trim() || !!kind;
  const start = () => can && onStart({ kind, name, line });
  return (
    <div className="space-y-8" data-make>
      <section>
        <h2 className="text-center text-[26px] font-semibold tracking-tight text-balance sm:text-[32px]">What do you want to make?</h2>
        <div className="mt-5 rounded-2xl border border-line-2 bg-panel p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
          <textarea
            ref={box}
            value={line}
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                start();
              }
            }}
            rows={4}
            maxLength={400}
            aria-label={tr('What do you want to make?')}
            placeholder={tr('Say it in your own words: who uses it, and what they do there.')}
            className="block w-full resize-none bg-transparent px-3 py-2 text-[16px] leading-relaxed outline-none placeholder:text-fg-3"
          />
          <div className="flex flex-wrap items-center gap-2 px-1 pb-1">
            {kind && (
              <button type="button" onClick={() => setKind(null)} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-[13px] font-medium text-accent" data-picked-idea>
                <span translate="no">{tr(kind.name)}</span>
                <X size={13} aria-label={tr('Remove')} />
              </button>
            )}
            <span className="flex-1" />
            <Button variant="primary" disabled={!can} onClick={start} icon={<ArrowRight size={15} />} data-action="start">
              Start
            </Button>
          </div>
        </div>
        {technical && (
          <label className="mt-3 block">
            <span className="mb-1 block text-[13px] font-medium">
              Name of the app<span className="ml-1.5 font-normal text-fg-3">optional: the agent suggests one</span>
            </span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} translate="no" />
          </label>
        )}
        <ul className="mt-3 flex flex-col gap-1.5 sm:items-center" aria-label={tr('For example')}>
          {EXAMPLE_SENTENCES.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => (setLine(tr(s)), box.current?.focus())} className="min-h-8 rounded-2xl border border-line px-3 py-1 text-left text-[13px] leading-snug text-fg-2 hover:border-line-2 hover:bg-bg-1 hover:text-fg" data-example>
                {s}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={tr('Ideas for a web app')}>
        <h3 className="mb-2 text-[13px] font-medium text-fg-3">Or start from an idea</h3>
        <div className={cx('grid gap-2.5', technical ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4')}>
          {kinds.map((k) => {
            const on = kind?.id === k.id;
            return (
              <button
                key={k.id}
                type="button"
                aria-pressed={on}
                onClick={() => (setKind(on ? null : k), !on && box.current?.focus({ preventScroll: false }))}
                className={cx('flex min-w-0 flex-col overflow-hidden rounded-xl border bg-panel text-left transition-colors', on ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-2 hover:bg-bg-1')}
                data-kind={k.id}
              >
                <span className="relative block aspect-[16/8] w-full overflow-hidden border-b border-line bg-bg-2">
                  <KindArt id={k.id} />
                  {on && (
                    <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-accent text-accent-fg">
                      <Check size={12} strokeWidth={2.4} />
                    </span>
                  )}
                </span>
                <span className="flex flex-1 flex-col gap-1 px-2.5 py-2">
                  <span translate="no" className="text-[13px] leading-snug font-medium">
                    {tr(k.name)}
                  </span>
                  {technical && (
                    <>
                      <span translate="no" className="text-[12.5px] leading-snug text-fg-2">
                        {tr(k.who)}
                      </span>
                      <KindNeeds k={k} />
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      {after}
    </div>
  );
}
