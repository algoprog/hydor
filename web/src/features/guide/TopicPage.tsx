// One topic of the guide: its icon, title and what it is about, a picture of that part of the app, then its
// sections as a list to open one by one (all of them with Open all), the questions to ask an agent about it, and
// the topics before and after. A link to a section (/guide/spaces#make-a-project, or one of its parts) opens it.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, Sparkles } from 'lucide-react';
import { headingsOf, type GuideTopic } from '@shared/guide';
import { openLightbox } from '../../components/Lightbox';
import { Markdown } from '../../components/Markdown';
import { cx } from '../../components/ui';
import { go } from '../../lib/nav';
import { mu } from '../../lib/machine';
import { activeBase } from '../../lib/theme';
import { useApp, useUI } from '../../lib/store';
import { openAsk } from './ask';
import { TopicIcon } from './AskBox';
import { ASK_SECTION, examplesOf } from './search';
import { GROUPS, lookOf, ordered } from './topics';

/** The text above the first section, and the picture in it (the first image). */
export function introOf(t: GuideTopic): { lead: string; figure: { src: string; alt: string } | null } {
  const at = t.body.search(/^## /m);
  const intro = (at >= 0 ? t.body.slice(0, at) : t.body).trim();
  const img = /^!\[([^\]]*)\]\(([^)\s]+)\)[ \t]*$/m.exec(intro);
  return { lead: img ? intro.replace(img[0], '').replace(/\n{3,}/g, '\n\n').trim() : intro, figure: img ? { alt: img[1], src: img[2] } : null };
}

/** For each section, the ids of the headings inside it; and the section each heading id is in. */
function anchorsOf(t: GuideTopic) {
  const inner = new Map<string, string[]>();
  const sectionOf = new Map<string, string>();
  let cur: string | null = null;
  headingsOf(t.body).forEach((h, i) => {
    const id = t.anchors[i];
    if (!id) return;
    if (h.level === 2) {
      cur = id;
      inner.set(id, []);
    } else if (cur) inner.get(cur)!.push(id);
    if (cur) sectionOf.set(id, cur);
  });
  return { inner, sectionOf };
}

/** The guide's pictures (docs/guide/images), in the theme's light or dark version. */
export function useImageUrl() {
  useUI((s) => `${s.theme}|${s.darkTheme}|${s.lightTheme}`);
  const version = useApp((s) => s.boot?.version ?? '');
  const light = activeBase() === 'light';
  return (src: string): string | null => {
    const name = /^(?:\.\/)?images\/([a-z0-9-]+\.(?:webp|png|jpg))$/.exec(src)?.[1];
    return name ? mu(`/api/guide/images/${name}?v=${encodeURIComponent(version)}${light ? '&theme=light' : ''}`) : null;
  };
}

function Figure({ src, alt }: { src: string; alt: string }) {
  const url = useImageUrl()(src);
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  // Taken at twice the size they show at: a phone's screen shows phone-sized, a window's as wide as the page.
  return (
    <figure className="mt-6 flex flex-col items-center">
      <button
        onClick={() => openLightbox([{ src: url, name: alt }])}
        className="block max-w-full cursor-zoom-in overflow-hidden rounded-2xl border border-line bg-bg-1 shadow-[var(--shadow)]"
        aria-label={`See it larger: ${alt}`}
      >
        {/* Only the 2x candidate, so it shows at half its pixels on every screen. */}
        <img srcSet={`${url} 2x`} alt={alt} className="block h-auto max-w-full" onError={() => setFailed(true)} />
      </button>
      {alt && <figcaption className="mt-2 px-2 text-center text-[12.5px] leading-snug text-fg-3">{alt}</figcaption>}
    </figure>
  );
}

export function TopicPage({ topic, topics, onOpen }: { topic: GuideTopic; topics: GuideTopic[]; onOpen: (t: string, s?: string) => void }) {
  const look = lookOf(topic.id);
  const group = GROUPS.find((g) => g.id === look.group)!;
  const { lead, figure } = useMemo(() => introOf(topic), [topic]);
  const { inner, sectionOf } = useMemo(() => anchorsOf(topic), [topic]);
  const sections = topic.sections.filter((s) => s.id !== ASK_SECTION);
  const examples = useMemo(() => examplesOf(topic), [topic]);
  const imageUrl = useImageUrl();
  const hashSection = () => sectionOf.get(decodeURIComponent(location.hash.slice(1)));
  const [open, setOpen] = useState<Set<string>>(() => new Set([hashSection()].filter((x): x is string => !!x)));
  const scrollTo = useRef<string | null>(decodeURIComponent(location.hash.slice(1)) || null);
  const [, redraw] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  // A section or a part of one asked for by the address: open it, then bring it into view.
  useLayoutEffect(() => {
    const id = scrollTo.current;
    if (!id) return;
    scrollTo.current = null;
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  });
  useEffect(() => {
    const follow = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const sec = sectionOf.get(id);
      if (!sec) return;
      setOpen((o) => (o.has(sec) ? o : new Set(o).add(sec)));
      scrollTo.current = id;
      redraw((n) => n + 1);
    };
    const f = () => {
      requestAnimationFrame(follow);
    };
    window.addEventListener('hydor:hash', f);
    window.addEventListener('hashchange', f);
    // Find in the page (Ctrl+F) opens the section it finds words in.
    const el = list.current;
    const found = (e: Event) => {
      const sec = (e.target as HTMLElement).closest<HTMLElement>('[data-section]')?.dataset.section;
      if (sec) setOpen((o) => new Set(o).add(sec));
    };
    el?.addEventListener('beforematch', found);
    return () => {
      window.removeEventListener('hydor:hash', f);
      window.removeEventListener('hashchange', f);
      el?.removeEventListener('beforematch', found);
    };
  }, [sectionOf]);

  // A link to a section of this topic (#make-a-project) goes through the address, so its section opens.
  const onLink = (e: MouseEvent) => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href');
    if (!href?.startsWith('#')) return;
    e.preventDefault();
    e.stopPropagation();
    history.pushState(history.state, '', href);
    window.dispatchEvent(new Event('hydor:hash'));
  };

  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOpen = sections.length > 0 && sections.every((s) => open.has(s.id));

  const main = ordered(topics).filter((t) => lookOf(t.id).group !== 'more' || t.id === topic.id);
  const at = main.findIndex((t) => t.id === topic.id);
  const prev = at > 0 ? main[at - 1] : undefined;
  const next = at >= 0 ? main[at + 1] : undefined;

  return (
    <article className="mx-auto max-w-[820px] px-4 pb-20 sm:px-6" onClickCapture={onLink}>
      <header className="pt-6 sm:pt-9">
        <div className="flex items-center gap-1 text-[12.5px] text-fg-3">
          <button onClick={() => go('/guide')} className="rounded hover:text-fg">
            Help
          </button>
          <ChevronRight size={13} className="shrink-0" />
          <span className="truncate">{group.title}</span>
        </div>
        <div className="mt-3 flex items-center gap-3.5">
          <TopicIcon id={topic.id} size="lg" />
          <h2 className="min-w-0 text-[24px] leading-tight font-semibold tracking-tight sm:text-[28px]">{topic.title}</h2>
        </div>
        <Markdown text={lead} app resolveImage={imageUrl} className="guide guide-lead mt-4" />
        {figure && <Figure key={figure.src} src={figure.src} alt={figure.alt} />}
      </header>

      {sections.length > 0 && (
        <section className="mt-9">
          <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
            <h3 className="text-[13px] font-medium text-fg-3">{sections.length} sections</h3>
            <button onClick={() => setOpen(allOpen ? new Set() : new Set(sections.map((s) => s.id)))} className="rounded text-[12.5px] text-fg-3 hover:text-fg">
              {allOpen ? 'Close all' : 'Open all'}
            </button>
          </div>
          <div ref={list} className="overflow-hidden rounded-2xl border border-line bg-panel">
            {sections.map((s, i) => {
              const on = open.has(s.id);
              return (
                <div key={s.id} data-section={s.id} className={cx(i > 0 && 'border-t border-line')}>
                  <h3 id={s.id} className="scroll-mt-3">
                    <button
                      onClick={() => toggle(s.id)}
                      aria-expanded={on}
                      className={cx('flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-bg-1', on && 'bg-bg-1')}
                    >
                      <ChevronRight size={16} className={cx('shrink-0 text-fg-3', on && 'rotate-90')} />
                      <span className="min-w-0 flex-1 text-[15px] leading-snug font-medium">{s.title}</span>
                    </button>
                  </h3>
                  <div
                    ref={(el) => {
                      // Closed, it stays findable: Find in the page opens it (hidden="until-found").
                      if (!el) return;
                      if (on) el.removeAttribute('hidden');
                      else el.setAttribute('hidden', 'until-found');
                    }}
                  >
                    <div className="border-t border-line px-4 pt-4 pb-6 sm:pr-8 sm:pl-11">
                      <Markdown text={s.text} app headingIds={inner.get(s.id)} resolveImage={imageUrl} className="guide" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {examples.length > 0 && (
        <section id={ASK_SECTION} className="mt-9 scroll-mt-3 rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h3 className="text-[15px] font-semibold">Ask an agent</h3>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-3">Agents here know this guide, and can do these things for you. Pick one to change it before you ask, or ask in your own words.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {examples.map((ex) => (
              <button
                key={ex}
                onClick={() => openAsk({ draft: ex, topic: topic.id })}
                translate="no"
                className="rounded-xl bg-bg-1 px-3.5 py-2.5 text-left text-[13px] leading-snug text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
              >
                {ex}
              </button>
            ))}
          </div>
        </section>
      )}

      {(prev || next) && (
        <nav className="mt-9 grid gap-2.5 sm:grid-cols-2" aria-label="Other topics">
          {prev ? (
            <button onClick={() => onOpen(prev.id)} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left transition-colors hover:bg-bg-1">
              <ArrowLeft size={16} className="shrink-0 text-fg-3" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-fg-3">Previous</span>
                <span className="block truncate text-[14px] font-medium">{prev.title}</span>
              </span>
            </button>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next && (
            <button onClick={() => onOpen(next.id)} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-right transition-colors hover:bg-bg-1">
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-fg-3">Next</span>
                <span className="block truncate text-[14px] font-medium">{next.title}</span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-fg-3" />
            </button>
          )}
        </nav>
      )}
    </article>
  );
}
