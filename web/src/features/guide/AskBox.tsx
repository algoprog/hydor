// Help's question box: what you type finds sections of the guide at once, and Enter (or Ask) puts the question
// to an agent instead. The big one on Help's first page lists what it finds below it; the small one in a topic's
// header drops a short list.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, CornerDownLeft, Search, Sparkles, X } from 'lucide-react';
import type { GuideTopic } from '@shared/guide';
import { cx, IconButton, useIsMobile, useOutside } from '../../components/ui';
import { toastError } from '../../lib/store';
import { askAgent, useAskRun } from './ask';
import { searchGuide, type Found } from './search';
import { lookOf, tintOf } from './topics';

export function TopicIcon({ id, size = 'md', className }: { id: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = lookOf(id).icon;
  const tint = tintOf(id);
  const box = size === 'lg' ? 'h-12 w-12 rounded-[14px]' : size === 'md' ? 'h-9 w-9 rounded-[11px]' : 'h-7 w-7 rounded-lg';
  return (
    <span className={cx('flex shrink-0 items-center justify-center', box, className)} style={{ color: tint, background: `color-mix(in srgb, ${tint} 14%, transparent)` }}>
      <Icon size={size === 'lg' ? 24 : size === 'md' ? 18 : 15} strokeWidth={1.9} />
    </span>
  );
}

function ResultRow({ f, on, onPick, onHover }: { f: Found; on: boolean; onPick: () => void; onHover: () => void }) {
  return (
    <button
      onClick={onPick}
      onMouseMove={onHover}
      className={cx('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', on ? 'bg-bg-2' : 'hover:bg-bg-1')}
    >
      <TopicIcon id={f.topic.id} size="sm" className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{f.title}</span>
          <span className="hidden max-w-[40%] truncate text-[11.5px] text-fg-3 @lg:block">{f.topic.title}</span>
        </span>
        {/* Narrow, the topic goes before the words found. */}
        <span translate="no" className="mt-0.5 line-clamp-1 text-[12.5px] leading-snug text-fg-3">
          <span className="@lg:hidden">{f.topic.title} · </span>
          {f.snippet}
        </span>
      </span>
    </button>
  );
}

/**
 * The box. `hero`: Help's first page, the results in the page under it; else a field for a header, the results
 * in a list that drops from it. `topic`: the topic being read, which a question may be about.
 */
export function AskBox({
  topics,
  onOpen,
  hero,
  topic,
  value,
  onValue,
  className,
}: {
  topics: GuideTopic[] | null;
  onOpen: (topic: string, section?: string) => void;
  hero?: boolean;
  topic?: string;
  /** The text, when the page sets it too (a question picked below the box). */
  value?: string;
  onValue?: (v: string) => void;
  className?: string;
}) {
  const mobile = useIsMobile();
  const [own, setOwn] = useState('');
  const q = value ?? own;
  const setQ = (v: string) => (onValue ? onValue(v) : setOwn(v));
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState(false);
  const run = useAskRun();
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useOutside([wrap], () => setOpen(false), open && !hero);
  // A few, so the list fits under the box: the best four, with asking an agent above them.
  const found = useMemo(() => (topics && q.trim() ? searchGuide(topics, q, 4) : []), [topics, q]);
  useEffect(() => setSel(0), [q]);
  // A question picked below the box: it shows what the guide has, ready to ask.
  useEffect(() => {
    if (value !== undefined && value) input.current?.focus();
  }, [value]);

  const ask = () => {
    const text = q.trim();
    if (!text) return;
    askAgent(text, run, topic).catch(toastError);
    setQ('');
    setOpen(false);
    input.current?.blur();
  };
  const pick = (f: Found) => {
    setQ('');
    setOpen(false);
    onOpen(f.topic.id, f.id);
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setSel((s) => Math.max(0, Math.min(found.length, s + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (sel > 0 && found[sel - 1]) pick(found[sel - 1]);
      else ask();
    } else if (e.key === 'Escape') {
      if (q) setQ('');
      else input.current?.blur();
      setOpen(false);
    }
  };

  const showing = !!q.trim() && (hero || open);
  const list = (
    <div className={cx('@container p-1.5', !hero && 'max-h-[min(70vh,460px)] overflow-y-auto')}>
      <button
        onClick={ask}
        onMouseMove={() => setSel(0)}
        className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', sel === 0 ? 'bg-accent-soft' : 'hover:bg-bg-1')}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <Sparkles size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-fg">Ask an agent</span>
          <span translate="no" className="block truncate text-[12.5px] text-fg-3">
            “{q.trim()}”
          </span>
        </span>
        {!mobile && (
          <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-fg-3">
            <CornerDownLeft size={13} /> Enter
          </span>
        )}
      </button>
      {found.length > 0 ? (
        <>
          <div className="px-3 pt-3 pb-1 text-[11.5px] font-medium text-fg-3">In the guide</div>
          {found.map((f, i) => (
            <ResultRow key={`${f.topic.id}#${f.id}`} f={f} on={sel === i + 1} onPick={() => pick(f)} onHover={() => setSel(i + 1)} />
          ))}
        </>
      ) : (
        <p className="px-3 pt-3 pb-2 text-[13px] text-fg-3">Nothing in the guide uses those words. An agent can still answer: press Enter.</p>
      )}
    </div>
  );

  return (
    <div ref={wrap} data-tip={hero ? 'ask' : undefined} className={cx('relative', className)}>
      <div
        className={cx(
          'flex items-center gap-2 border bg-panel transition-colors focus-within:border-accent/50',
          hero ? 'h-14 rounded-[18px] border-line-2 pr-2 pl-4 shadow-[0_8px_30px_rgba(0,0,0,0.10)]' : 'h-9 rounded-[10px] border-transparent bg-bg-2 pr-1 pl-3',
        )}
      >
        <Search size={hero ? 18 : 15} className="shrink-0 text-fg-3" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={key}
          enterKeyHint="send"
          placeholder={hero && !mobile ? 'Ask a question, or search the guide' : 'Ask or search'}
          aria-label="Ask a question, or search the guide"
          className={cx('min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3', hero ? 'text-[16px]' : 'text-[13.5px]')}
        />
        {q && (
          <IconButton label="Clear" size="sm" onClick={() => (setQ(''), input.current?.focus())}>
            <X size={14} />
          </IconButton>
        )}
        {hero && (
          <button
            onClick={ask}
            disabled={!q.trim()}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-[13.5px] font-medium text-accent-fg transition-opacity disabled:opacity-40"
          >
            {mobile ? <ArrowUp size={17} /> : <Sparkles size={15} />}
            {!mobile && 'Ask'}
          </button>
        )}
      </div>
      {showing &&
        (hero ? (
          <div className="mt-3 rounded-[18px] border border-line bg-panel">{list}</div>
        ) : (
          <div className="absolute top-full right-0 z-30 mt-2 w-[min(440px,calc(100vw-24px))] rounded-2xl border border-line bg-elevated shadow-[var(--shadow-lg)]">{list}</div>
        ))}
    </div>
  );
}
