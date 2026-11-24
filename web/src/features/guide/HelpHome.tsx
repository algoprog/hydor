// Help's first page: a box to ask a question or search the guide, questions people often ask, and every topic as
// a card in its group (not while the column beside it lists them: then the box and the questions are the page).
import { useState } from 'react';
import type { GuideTopic } from '@shared/guide';
import { cx, useIsMobile } from '../../components/ui';
import { AskBox, TopicIcon } from './AskBox';
import { Highlights } from './Highlights';
import { GROUPS, lookOf, POPULAR, rankOf } from './topics';

function TopicCard({ t, onOpen }: { t: GuideTopic; onOpen: (t: string) => void }) {
  const blurb = lookOf(t.id).blurb;
  return (
    <button onClick={() => onOpen(t.id)} className="flex items-start gap-3 rounded-2xl border border-line bg-panel p-3.5 text-left transition-colors hover:border-line-2 hover:bg-bg-1">
      <TopicIcon id={t.id} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-snug font-medium text-fg">{t.title}</span>
        {/* The line under it is the app's own words; the topic's summary, in the page's language, where there is none. */}
        {blurb ? (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-3">{blurb}</span>
        ) : (
          <span translate="no" className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3">
            {t.summary}
          </span>
        )}
      </span>
    </button>
  );
}

export function HelpHome({ topics, onOpen, column, listed }: { topics: GuideTopic[]; onOpen: (t: string, s?: string) => void; column?: boolean; listed?: boolean }) {
  const mobile = useIsMobile();
  const [q, setQ] = useState('');
  const groups = GROUPS.map((g) => ({ ...g, topics: topics.filter((t) => lookOf(t.id).group === g.id).sort((a, b) => rankOf(a.id) - rankOf(b.id)) })).filter((g) => g.topics.length);
  return (
    <div className="@container mx-auto max-w-[980px] px-4 pb-16 sm:px-6">
      <section className={cx('pb-2', listed ? 'pt-[14vh]' : column ? 'pt-8' : 'pt-7 sm:pt-12')}>
        <h2 className="text-center text-[25px] font-semibold tracking-tight sm:text-[30px]">How can we help?</h2>
        <p className="mx-auto mt-2 max-w-[540px] text-center text-[14px] leading-relaxed text-fg-2 sm:text-[14.5px]">
          Search the guide, or ask an agent. It answers from the guide, and can change a setting or set something up for you.
        </p>
        <AskBox hero topics={topics} onOpen={onOpen} value={q} onValue={setQ} className="mx-auto mt-6 max-w-[680px]" />
        {!q.trim() && (
          <div className="mx-auto mt-4 flex max-w-[720px] flex-wrap justify-center gap-2">
            {(mobile ? POPULAR.slice(0, 3) : POPULAR).map((p) => (
              <button
                key={p}
                onClick={() => setQ(p)}
                className="rounded-full border border-line bg-panel px-3 py-1.5 text-[12.5px] text-fg-2 transition-colors hover:border-line-2 hover:bg-bg-1 hover:text-fg"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Not while something is typed in the box: its results come then, as the questions go. */}
      <Highlights className={cx('mt-9', q.trim() && 'hidden')} />

      {!listed &&
        groups
          .filter((g) => g.id !== 'more')
          .map((g) => (
            <section key={g.id} className="mt-9">
              <h3 className="mb-3 px-1 text-[14px] font-semibold text-fg-2">{g.title}</h3>
              <div className="grid gap-2.5 @lg:grid-cols-2 @3xl:grid-cols-3">
                {g.topics.map((t) => (
                  <TopicCard key={t.id} t={t} onOpen={onOpen} />
                ))}
              </div>
            </section>
          ))}

      {!listed && groups.some((g) => g.id === 'more') && (
        <section className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-1 pt-5 text-[13px] text-fg-3">
          <span>For developers and agents:</span>
          {groups
            .find((g) => g.id === 'more')!
            .topics.map((t) => (
              <button key={t.id} onClick={() => onOpen(t.id)} className="flex items-center gap-1.5 rounded text-fg-2 hover:text-fg">
                <TopicIcon id={t.id} size="sm" />
                {t.title}
              </button>
            ))}
        </section>
      )}
    </div>
  );
}
