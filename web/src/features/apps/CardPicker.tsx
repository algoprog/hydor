// The cards an app's answer field can be (the builder's Answer tab → A card…): the catalog of answer UIs as the gallery
// (/answers) has it, to pick one from: a search box, the groups, and each card drawn small with its example. Loaded
// with the cards' catalog and views, the first time it opens.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ANSWER_UI_GROUPS, ANSWER_UIS, type AnswerUiGroup, type AnswerUiSpec } from '@shared/answer-ui';
import { matchItem, queryWords } from '@shared/find';
import { tr } from '../../i18n/runtime';
import { AnswerDemo } from '../../components/answer/AnswerUi';
import { cx, Dialog } from '../../components/ui';

/** One card to pick: its name, what it is for, and its example drawn small once it scrolls near. */
function Tile({ spec, current, onPick }: { spec: AnswerUiSpec; current: boolean; onPick: (s: AnswerUiSpec) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: '300px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={current}
      onClick={() => onPick(spec)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(spec))}
      className={cx('flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-panel text-left transition-colors outline-none focus-visible:border-accent', current ? 'border-accent' : 'border-line hover:border-accent/60')}
    >
      <div className="px-3 pt-2.5 pb-2">
        <div className="text-[13.5px] font-semibold">{tr(spec.title)}</div>
        <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg-3">{tr(spec.use)}</div>
      </div>
      {/* Only to look at: what is in it cannot be clicked or reached with the keyboard. */}
      <div ref={ref} inert className="pointer-events-none relative h-[150px] overflow-hidden border-t border-line bg-bg-1 px-2">
        {seen && (
          <div style={{ zoom: 0.55 }}>
            <AnswerDemo name={spec.id} data={spec.example} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-bg-1 to-transparent" />
      </div>
    </div>
  );
}

export default function CardPicker({ current, onPick, onClose }: { current?: string; onPick: (s: AnswerUiSpec) => void; onClose: () => void }) {
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
  return (
    <Dialog open onClose={onClose} title="Pick a card" width={820}>
      <div className="sticky -top-3 z-10 -mx-5 -mt-3 bg-elevated px-5 pt-3 pb-3">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Find a UI: recipe, map, compare, quiz…')} className="h-9 w-full rounded-xl border border-line bg-panel pr-9 pl-9 text-[14px] outline-none focus:border-accent" />
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
            </button>
          ))}
        </div>
      </div>
      {list.length ? (
        <div className="grid gap-3 pb-2 sm:grid-cols-2">
          {list.map((s) => (
            <Tile key={s.id} spec={s} current={s.id === current} onPick={onPick} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-[13.5px] text-fg-3">{tr('No UI matches that.')}</div>
      )}
    </Dialog>
  );
}
