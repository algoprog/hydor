// Help: the guide to every part of the app (docs/guide, from /api/guide). Its first page asks what you need (a
// box that finds sections as you type and asks an agent on Enter) and shows the topics by group; a topic shows
// its sections to open one by one. An agent's answer shows in a panel beside the guide on wide screens, over it
// elsewhere. Links in the guide open the place in the app they name.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { BookOpen, ChevronLeft, Signpost, Sparkles } from 'lucide-react';
import { Button, cx, Empty, IconButton, Throbber, useIsMobile, useMediaQuery } from '../../components/ui';
import { go, goApp } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { PageHeader } from '../layout/PageHeader';
import { startTour } from '../tour/Tour';
import { closeAsk, openAsk, reopenAsk, useAsk } from './ask';
import { AskBox } from './AskBox';
import { AskPanel } from './AskPanel';
import { HelpHome } from './HelpHome';
import { examplesOf } from './search';
import { loadGuide, useGuide } from './state';
import { TopicPage } from './TopicPage';

/** The topic a path shows: /guide/<topic>. */
const topicOf = (loc: string) => (loc.startsWith('/guide/') ? decodeURIComponent(loc.slice(7).split('/')[0]) : null);

export function GuidePage() {
  const [loc] = useLocation();
  const mobile = useIsMobile();
  const wide = useMediaQuery('(min-width: 1280px)');
  const topics = useGuide((s) => s.topics);
  const ask = useAsk();
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    loadGuide().catch(toastError);
  }, []);
  const id = topicOf(loc);
  const topic = topics?.find((t) => t.id === id) ?? null;

  // Another page opens at its top; one with a section in its address scrolls to it by itself.
  useLayoutEffect(() => {
    if (!location.hash && scroller.current) scroller.current.scrollTop = 0;
  }, [loc, !!topics]); // eslint-disable-line react-hooks/exhaustive-deps

  // On a phone the answer covers the guide: a link followed from it shows the guide again.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else if (mobile) closeAsk();
  }, [loc]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (t: string, s?: string) => goApp(`/guide/${encodeURIComponent(t)}${s ? `#${encodeURIComponent(s)}` : ''}`);
  const examples = useMemo(() => {
    const t = topics?.find((x) => x.id === ask.topic);
    return t ? examplesOf(t) : [];
  }, [topics, ask.topic]);
  const showAsk = () => (ask.key || ask.pending ? reopenAsk() : openAsk({ topic: topic?.id }));

  const content = !topics ? (
    <div className="flex justify-center py-16 text-fg-3">
      <Throbber />
    </div>
  ) : !topics.length ? (
    <Empty icon={<BookOpen size={22} />} title="No guide in this copy">
      The guide comes with the app, in its docs/guide folder.
    </Empty>
  ) : topic ? (
    <TopicPage key={topic.id} topic={topic} topics={topics} onOpen={open} />
  ) : id ? (
    <Empty icon={<BookOpen size={22} />} title="No such topic">
      <Button size="sm" onClick={() => go('/guide')}>
        See all topics
      </Button>
    </Empty>
  ) : (
    <HelpHome topics={topics} onOpen={open} />
  );

  const home = (
    <button onClick={() => go('/guide')} disabled={!topic} className="rounded-md text-left enabled:hover:text-fg-2">
      Help
    </button>
  );
  const header = mobile ? (
    <PageHeader
      title={
        topic ? (
          <button onClick={() => go('/guide')} className="-ml-1 flex items-center gap-0.5 rounded-md text-left" aria-label="All topics">
            <ChevronLeft size={18} className="shrink-0 text-fg-3" />
            Help
          </button>
        ) : (
          'Help'
        )
      }
      actions={
        <>
          {!topic && (
            <IconButton label="Take the tour" onClick={() => startTour()}>
              <Signpost size={18} />
            </IconButton>
          )}
          {!ask.open && (
            <IconButton label="Ask an agent" onClick={showAsk}>
              <Sparkles size={18} />
            </IconButton>
          )}
        </>
      }
    />
  ) : (
    <PageHeader
      title={home}
      sub={topic ? undefined : 'The guide to every part of Naget Agent'}
      actions={
        <>
          {topic ? (
            <AskBox topics={topics} onOpen={open} topic={topic.id} className="w-64" />
          ) : (
            <Button size="sm" variant="ghost" icon={<Signpost size={14} />} onClick={() => startTour()}>
              Take the tour
            </Button>
          )}
          {!(ask.open && wide) && (
            <Button size="sm" variant={topic ? 'ghost' : 'secondary'} icon={<Sparkles size={14} />} onClick={showAsk}>
              Ask an agent
            </Button>
          )}
        </>
      }
    />
  );

  const panel = ask.open && <AskPanel examples={examples} />;
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          {content}
        </div>
      </div>
      {panel && wide && !mobile && <aside className="w-[420px] shrink-0 border-l border-line">{panel}</aside>}
      {panel &&
        !(wide && !mobile) &&
        // Over the whole app, so the sidebar's group headings stay behind it.
        createPortal(
          <div className={cx('fixed z-40 bg-bg', mobile ? 'inset-0 pt-[var(--safe-top)]' : 'top-0 right-0 bottom-0 w-[min(440px,100vw)] border-l border-line shadow-[var(--shadow-lg)]')}>{panel}</div>,
          document.body,
        )}
    </div>
  );
}
