// Help: the guide to every part of the app (docs/guide, from /api/guide). Wide screens: the topics in a menu
// beside the open one, one scroll for the page; phones: the topics as a list, a topic over it. A search field
// finds sections by their words; links in the guide open the place in the app they name.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { BookOpen, ChevronLeft, ChevronRight, CircleHelp, Search, X } from 'lucide-react';
import { matchItem, queryWords } from '@shared/find';
import { AGENT_TOPICS, plainText, type GuideTopic } from '@shared/guide';
import { Markdown } from '../../components/Markdown';
import { Button, cx, Empty, IconButton, Throbber, useIsMobile } from '../../components/ui';
import { go, goApp } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { PageHeader } from '../layout/PageHeader';
import { startTour } from '../tour/Tour';
import { loadGuide, useGuide } from './state';

/** The topic a path shows: /guide/<topic>. */
const topicOf = (loc: string) => (loc.startsWith('/guide/') ? decodeURIComponent(loc.slice(7).split('/')[0]) : null);

interface Found {
  topic: GuideTopic;
  id: string;
  title: string;
  snippet: string;
  score: number;
}

/** Sections that hold the words, best first. */
function search(topics: GuideTopic[], q: string): Found[] {
  const words = queryWords(q);
  if (!words.length) return [];
  const out: Found[] = [];
  for (const t of topics)
    for (const s of t.sections) {
      const text = plainText(s.text);
      const { score } = matchItem({ title: s.title, keywords: t.title, text }, words, q);
      if (score > 0) out.push({ topic: t, id: s.id, title: s.title, snippet: snippetOf(text, words), score });
    }
  return out.sort((a, b) => b.score - a.score).slice(0, 30);
}

/** A line of the text around the first word found. */
function snippetOf(text: string, words: string[]): string {
  const low = text.toLowerCase();
  const at = Math.max(0, Math.min(...words.map((w) => low.indexOf(w.toLowerCase())).filter((i) => i >= 0), text.length));
  const from = at > 60 ? text.lastIndexOf(' ', at - 50) + 1 : 0;
  const s = text.slice(from, from + 170);
  return `${from > 0 ? '…' : ''}${s}${from + 170 < text.length ? '…' : ''}`;
}

function SearchField({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder="Search the guide"
        className="h-9 w-full rounded-[10px] bg-bg-2 pr-9 pl-9 text-[13.5px] outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent/25"
      />
      {value && (
        <span className="absolute top-1/2 right-1 -translate-y-1/2">
          <IconButton label="Clear search" size="sm" onClick={() => onChange('')}>
            <X size={14} />
          </IconButton>
        </span>
      )}
    </div>
  );
}

function Results({ found, onOpen }: { found: Found[]; onOpen: (f: Found) => void }) {
  if (!found.length) return <p className="py-10 text-center text-[13.5px] text-fg-3">Nothing in the guide says that. Try other words, or ask an agent in any session.</p>;
  return (
    <div className="divide-y divide-line">
      {found.map((f) => (
        <button key={`${f.topic.id}#${f.id}`} onClick={() => onOpen(f)} className="block w-full rounded-lg px-2 py-3 text-left transition-colors hover:bg-bg-1">
          <span className="block text-[14px] font-medium text-fg">{f.title}</span>
          <span className="block text-[12px] text-fg-3">{f.topic.title}</span>
          <span translate="no" className="mt-1 line-clamp-2 text-[13px] leading-snug text-fg-2">
            {f.snippet}
          </span>
        </button>
      ))}
    </div>
  );
}

/** The topics, for wide screens' menu: the open one shows its sections. */
function Contents({ topics, current, onOpen }: { topics: GuideTopic[]; current: GuideTopic | null; onOpen: (t: string, s?: string) => void }) {
  const main = topics.filter((t) => !AGENT_TOPICS.includes(t.id));
  const more = topics.filter((t) => AGENT_TOPICS.includes(t.id));
  const row = (t: GuideTopic) => {
    const on = t.id === current?.id;
    return (
      <div key={t.id}>
        <button
          onClick={() => onOpen(t.id)}
          aria-current={on ? 'page' : undefined}
          className={cx('flex min-h-8 w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13.5px] leading-snug transition-colors', on ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2 hover:bg-bg-1 hover:text-fg')}
        >
          {t.title}
        </button>
        {on && t.sections.length > 1 && (
          <div className="my-1 ml-2.5 border-l border-line pl-2">
            {t.sections.map((s) => (
              <button key={s.id} onClick={() => onOpen(t.id, s.id)} className="block w-full truncate rounded-md px-2 py-1 text-left text-[12.5px] text-fg-3 transition-colors hover:bg-bg-1 hover:text-fg">
                {s.title}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };
  return (
    <nav className="sticky top-0 max-h-[calc(100dvh-56px)] w-[240px] shrink-0 overflow-y-auto py-6" aria-label="Guide topics">
      <button
        onClick={() => go('/guide')}
        className={cx('mb-1 flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13.5px] transition-colors', !current ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2 hover:bg-bg-1 hover:text-fg')}
      >
        <BookOpen size={15} className="shrink-0 text-fg-3" />
        Contents
      </button>
      {main.map(row)}
      {more.length > 0 && (
        <>
          <div className="px-2.5 pt-4 pb-1 text-[11.5px] font-medium text-fg-3">For agents and developers</div>
          {more.map(row)}
        </>
      )}
    </nav>
  );
}

/** Every topic as a card: what the guide holds. */
function Overview({ topics, onOpen }: { topics: GuideTopic[]; onOpen: (t: string) => void }) {
  const main = topics.filter((t) => !AGENT_TOPICS.includes(t.id));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-panel px-4 py-3.5">
        <CircleHelp size={20} className="shrink-0 text-accent" />
        <p className="min-w-[220px] flex-1 text-[13.5px] leading-relaxed text-fg-2">
          Every part of the app, explained. You can also ask any agent here how to do something, or have it change a setting or set something up for you.
        </p>
        <Button size="sm" onClick={() => startTour()}>
          Take the tour
        </Button>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {main.map((t) => (
          <button key={t.id} onClick={() => onOpen(t.id)} className="flex flex-col items-start justify-start rounded-xl border border-line bg-panel px-3.5 py-3 text-left transition-colors hover:border-line-2 hover:bg-bg-1">
            <span className="text-[14px] font-medium text-fg">{t.title}</span>
            <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3">{t.summary}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TopicView({ topic, next, onOpen }: { topic: GuideTopic; next?: GuideTopic; onOpen: (t: string) => void }) {
  return (
    <article>
      <h2 className="mb-3 text-[22px] font-semibold tracking-tight">{topic.title}</h2>
      <Markdown text={topic.body} app className="guide !text-[14px] !leading-relaxed" />
      {next && (
        <button onClick={() => onOpen(next.id)} className="mt-10 flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:bg-bg-1">
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] text-fg-3">Next</span>
            <span className="block truncate text-[14px] font-medium">{next.title}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-fg-3" />
        </button>
      )}
    </article>
  );
}

export function GuidePage() {
  const [loc] = useLocation();
  const mobile = useIsMobile();
  const topics = useGuide((s) => s.topics);
  const [q, setQ] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    loadGuide().catch(toastError);
  }, []);
  const id = topicOf(loc);
  const topic = topics?.find((t) => t.id === id) ?? null;
  const at = topic && topics ? topics.indexOf(topic) : -1;
  const next = at >= 0 ? topics!.slice(at + 1).find((t) => !AGENT_TOPICS.includes(t.id) || AGENT_TOPICS.includes(topic!.id)) : undefined;
  const found = useMemo(() => (topics && q.trim() ? search(topics, q) : null), [topics, q]);

  // A topic opens at its top, or at the section its link names (#make-a-space).
  const toAnchor = () => {
    const h = decodeURIComponent(location.hash.slice(1));
    const el = h ? document.getElementById(h) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else if (scroller.current) scroller.current.scrollTop = 0;
  };
  useLayoutEffect(() => {
    if (topics) toAnchor();
  }, [loc, topics]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = () => requestAnimationFrame(toAnchor);
    window.addEventListener('naget:hash', f);
    return () => window.removeEventListener('naget:hash', f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (t: string, s?: string) => {
    setQ('');
    goApp(`/guide/${encodeURIComponent(t)}${s ? `#${encodeURIComponent(s)}` : ''}`);
  };
  const pick = (f: Found) => open(f.topic.id, f.id);

  const content = !topics ? (
    <div className="flex justify-center py-16 text-fg-3">
      <Throbber />
    </div>
  ) : !topics.length ? (
    <Empty icon={<BookOpen size={22} />} title="No guide in this copy">
      The guide comes with the app, in its docs/guide folder.
    </Empty>
  ) : found ? (
    <Results found={found} onOpen={pick} />
  ) : topic ? (
    <TopicView key={topic.id} topic={topic} next={next} onOpen={open} />
  ) : id ? (
    <Empty icon={<BookOpen size={22} />} title="No such topic">
      <Button size="sm" onClick={() => go('/guide')}>
        See all topics
      </Button>
    </Empty>
  ) : (
    <Overview topics={topics} onOpen={open} />
  );

  if (mobile) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title={
            topic && !found ? (
              <button onClick={() => go('/guide')} className="-ml-1 flex max-w-full items-center gap-0.5 rounded-md text-left" aria-label="All topics">
                <ChevronLeft size={18} className="shrink-0 text-fg-3" />
                <span className="truncate">{topic.title}</span>
              </button>
            ) : (
              'Help'
            )
          }
        />
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 px-4 pt-3 pb-10">
            <SearchField value={q} onChange={setQ} />
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Help"
        sub="The guide to every part of Naget Agent"
        actions={
          <>
            <SearchField value={q} onChange={setQ} className="w-64" />
            <Button size="sm" variant="ghost" icon={<CircleHelp size={14} />} onClick={() => startTour()}>
              Tour
            </Button>
          </>
        }
      />
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1180px] items-start gap-9 px-4">
          {topics && topics.length > 0 && <Contents topics={topics} current={found ? null : topic} onOpen={open} />}
          <div className="max-w-[780px] min-w-0 flex-1 pt-6 pb-16">{content}</div>
        </div>
      </div>
    </div>
  );
}
