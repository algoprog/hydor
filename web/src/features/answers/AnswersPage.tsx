// The gallery of answer UIs (/answers): every card, table, chart, map and small tool agents can show an answer in, by
// group, each drawn with its example as a reply would show it. Find one by its words; open its data (what an agent
// writes); play it as it streams into a reply. Loaded with the UIs themselves, the first time it opens.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Braces, Play, Search, Shapes, X } from 'lucide-react';
import { ANSWER_UI_GROUPS, ANSWER_UIS, type AnswerUiGroup, type AnswerUiSpec } from '@shared/answer-ui';
import { matchItem, queryWords } from '@shared/find';
import { tr } from '../../i18n/runtime';
import { AnswerDemo } from '../../components/answer/AnswerUi';
import { CodeBlock } from '../../components/Markdown';
import { cx } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';

/** Plays a UI's data as an agent writes it: a few characters at a time, then whole. */
function useReplay(text: string) {
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    if (at === null) return;
    if (at >= text.length) {
      const t = setTimeout(() => setAt(null), 50);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setAt((x) => (x === null ? null : Math.min(text.length, x + Math.max(6, Math.round(text.length / 90))))), 45);
    return () => clearTimeout(t);
  }, [at, text]);
  return { playing: at !== null, shown: at === null ? text : text.slice(0, at), play: () => setAt(0) };
}

function Item({ spec }: { spec: AnswerUiSpec }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [data, setData] = useState(false);
  const compact = useMemo(() => JSON.stringify(spec.example), [spec]);
  const pretty = useMemo(() => JSON.stringify(spec.example, null, 2), [spec]);
  const replay = useReplay(compact);
  // Each replay starts afresh, as a new reply would: nothing ticked or answered before carries over.
  const [round, setRound] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <section id={spec.id} className="scroll-mt-28 border-b border-line py-7 last:border-b-0">
      <header className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15.5px] font-semibold tracking-tight">{tr(spec.title)}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-fg-3">{tr(spec.use)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <code className="mr-1 hidden rounded-md bg-bg-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-2 sm:inline" translate="no">
            ui {spec.id}
          </code>
          <button type="button" onClick={() => (setData(false), setRound((r) => r + 1), replay.play())} disabled={replay.playing} title={tr('Play as it streams')} aria-label={tr('Play as it streams')} className="grid h-7 w-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg disabled:opacity-40">
            <Play size={14} />
          </button>
          <button type="button" onClick={() => setData((d) => !d)} title={data ? tr('Show it') : tr('Show the data')} aria-label={data ? tr('Show it') : tr('Show the data')} className={cx('grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-bg-2 hover:text-fg', data ? 'bg-bg-2 text-fg' : 'text-fg-3')}>
            {data ? <Shapes size={14} /> : <Braces size={14} />}
          </button>
        </div>
      </header>
      <div ref={ref} style={seen ? undefined : { minHeight: 220 }}>
        {seen && (data ? <CodeBlock code={pretty} lang="json" /> : <AnswerDemo key={round} name={spec.id} code={replay.shown} done={!replay.playing} />)}
      </div>
    </section>
  );
}

export default function AnswersPage() {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<AnswerUiGroup | 'all'>('all');
  const groups = useMemo(() => ANSWER_UI_GROUPS.filter((g) => ANSWER_UIS.some((s) => s.group === g.id)), []);
  const list = useMemo(() => {
    const inGroup = ANSWER_UIS.filter((s) => group === 'all' || s.group === group);
    const ws = queryWords(q);
    if (!ws.length) return inGroup;
    return inGroup
      .map((s) => ({ s, m: matchItem({ title: `${s.title} ${tr(s.title)}`, keywords: `${s.id.replace(/-/g, ' ')} ${s.keywords}`, text: `${s.use} ${tr(s.use)}` }, ws, q) }))
      .filter((x) => x.m.score > 0)
      .sort((a, b) => b.m.score - a.m.score)
      .map((x) => x.s);
  }, [q, group]);
  // A link to one (/answers#recipe) opens at it.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 80);
  }, []);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={tr('Answer UIs')} sub={tr('{0} cards, charts, maps and small tools agents show their answers in').replace('{0}', String(ANSWER_UIS.length))} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[820px] px-4 pt-5 pb-16 sm:px-6">
          <p className="mb-4 text-[13.5px] leading-relaxed text-fg-2">
            {tr('When an answer reads better as something to look at or use, an agent shows it in one of these, filled with its own content, as the reply comes. It picks one only when it helps: other answers stay text. Ask for one in plain words too: “compare them in a table”, “put them on a map”, “quiz me on it”.')}
          </p>
          <div className="sticky top-0 z-10 -mx-4 bg-bg/95 px-4 pt-1 pb-3 backdrop-blur sm:-mx-6 sm:px-6">
            <label className="relative block">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Find a UI: recipe, map, compare, quiz…')} className="h-9 w-full rounded-xl border border-line bg-panel pr-9 pl-9 text-[14px] outline-none focus:border-accent" />
              {q && (
                <button type="button" onClick={() => setQ('')} aria-label={tr('Clear')} className="absolute top-1/2 right-2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg">
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
              {[{ id: 'all' as const, label: 'All' }, ...groups].map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroup(g.id)}
                  className={cx('shrink-0 rounded-full border px-2.5 py-1 text-[12.5px] font-medium whitespace-nowrap transition-colors', group === g.id ? 'border-accent bg-accent-soft text-accent' : 'border-line text-fg-2 hover:bg-bg-2')}
                >
                  {tr(g.label)}
                  <span className="ml-1 text-fg-3">{g.id === 'all' ? ANSWER_UIS.length : ANSWER_UIS.filter((s) => s.group === g.id).length}</span>
                </button>
              ))}
            </div>
          </div>
          {list.length ? list.map((s) => <Item key={s.id} spec={s} />) : <div className="py-16 text-center text-[13.5px] text-fg-3">{tr('No UI matches that.')}</div>}
        </div>
      </div>
    </div>
  );
}
