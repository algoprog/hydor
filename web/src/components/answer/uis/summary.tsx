// The answer UIs that sum things up or lay out notes: their views, by name (shared/answer-ui/summary.ts has what each takes).
import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Info, Lightbulb, MessageSquareWarning, OctagonAlert, Search, X } from 'lucide-react';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../ui';
import { arr, Card, Chip, fmtDate, Head, isObj, KeyValues, LinkOut, Md, num, Pic, Section, SpeakBtn, str, textOf, TONE_FILL, toneOf, useKept, words, type AnswerUiView, type Data, type Tone } from '../kit';

/** A colour mixed into the panel's (or another): a tinted background or border that reads in both themes. */
const mix = (color: string, pct: number, base = 'var(--panel)') => `color-mix(in srgb, ${color} ${pct}%, ${base})`;

const CONFIDENCE: Record<string, { label: () => string; tone: 'good' | 'warn' | 'bad' }> = {
  high: { label: () => tr('High confidence'), tone: 'good' },
  medium: { label: () => tr('Medium confidence'), tone: 'warn' },
  low: { label: () => tr('Low confidence'), tone: 'bad' },
};

function KeyPoints({ data }: { data: Data }) {
  const points = arr(data.points);
  const conf = CONFIDENCE[str(data.confidence).toLowerCase()];
  return (
    <Card>
      {str(data.verdict) && <Md text={data.verdict} className="aui-lead" />}
      {points.length > 0 && (
        <ul className={cx('m-0 list-none space-y-2.5 p-0', str(data.verdict) && 'mt-3.5 border-t border-line pt-3.5')}>
          {points.map((p, i) => {
            const icon = isObj(p) ? str(p.icon) : '';
            const detail = isObj(p) ? p.detail : '';
            return (
              <li key={i} className="flex gap-3">
                <span className={cx('mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px]', icon ? 'bg-bg-2' : 'bg-accent-soft text-accent')}>{icon || <Check size={13} strokeWidth={2.5} />}</span>
                <div className="min-w-0 pt-0.5">
                  <Md text={textOf(p, 'text', 'point', 'title')} inline className="font-medium text-fg" />
                  {str(detail) && <Md text={detail} className="mt-0.5 text-[13px] text-fg-3" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(str(data.caveat) || conf) && (
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {str(data.caveat) && (
            <div className="flex min-w-0 flex-1 gap-2 rounded-lg bg-bg-2 px-3 py-2 text-[13px] text-fg-2">
              <Info size={14} className="mt-0.5 shrink-0 text-fg-3" />
              <Md text={data.caveat} inline />
            </div>
          )}
          {conf && <Chip tone={conf.tone}>{conf.label()}</Chip>}
        </div>
      )}
    </Card>
  );
}

// ---- a callout -----------------------------------------------------------------------------------------------------------

type CalloutKind = 'note' | 'tip' | 'important' | 'warning' | 'danger' | 'success';

const CALLOUT: Record<CalloutKind, { tone: Tone; icon: LucideIcon; label: () => string }> = {
  note: { tone: 'info', icon: Info, label: () => tr('Note') },
  tip: { tone: 'good', icon: Lightbulb, label: () => tr('Tip') },
  important: { tone: 'accent', icon: MessageSquareWarning, label: () => tr('Important') },
  warning: { tone: 'warn', icon: AlertTriangle, label: () => tr('Warning') },
  danger: { tone: 'bad', icon: OctagonAlert, label: () => tr('Danger') },
  success: { tone: 'good', icon: CheckCircle2, label: () => tr('Success') },
};

/** The kind a callout's tone names, from the words agents use for one ("caution", "info", "error"…). */
function calloutKind(v: unknown): CalloutKind {
  const s = str(v).trim().toLowerCase();
  if (s in CALLOUT) return s as CalloutKind;
  if (/^(info|information|fyi|aside|remark)$/.test(s)) return 'note';
  if (/^(hint|idea|advice|pro tip|suggestion)$/.test(s)) return 'tip';
  if (/^(key|attention|notice|remember|highlight)$/.test(s)) return 'important';
  if (/^(caution|careful|warn|alert|heads up|heads-up)$/.test(s)) return 'warning';
  if (/^(error|critical|stop|severe|fatal|bad)$/.test(s)) return 'danger';
  if (/^(ok|good|done|check|passed|complete|completed|yes)$/.test(s)) return 'success';
  const t = toneOf(s);
  return t === 'good' ? 'success' : t === 'warn' ? 'warning' : t === 'bad' ? 'danger' : t === 'accent' ? 'important' : 'note';
}

function Callout({ data }: { data: Data }) {
  const kind = CALLOUT[calloutKind(data.tone ?? data.kind ?? data.type)];
  const fill = TONE_FILL[kind.tone];
  const text = data.text ?? data.body ?? data.content;
  const Icon = kind.icon;
  return (
    <div className="aui-card flex gap-3 px-4 py-3.5" style={{ background: mix(fill, 7), borderColor: mix(fill, 30, 'var(--line)') }}>
      <Icon size={18} className="mt-[2px] shrink-0" style={{ color: fill }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="leading-snug font-semibold" style={{ color: fill }}>
          {str(data.title) || kind.label()}
        </div>
        {str(text) && <Md text={text} className="mt-1 text-[14px] text-fg" />}
      </div>
    </div>
  );
}

// ---- a fact sheet --------------------------------------------------------------------------------------------------------

/** Facts given as a list of { label, value, note }, or as one object of label: value. */
function factRows(v: unknown): { label: unknown; value: unknown; note?: unknown }[] {
  if (isObj(v)) return Object.entries(v).map(([label, value]) => ({ label, value: isObj(value) ? textOf(value, 'value', 'text') : value }));
  return arr(v).map((f) => (isObj(f) ? { label: textOf(f, 'label', 'name', 'key'), value: f.value ?? f.text, note: f.note } : { label: '', value: f }));
}

function FactSheet({ data }: { data: Data }) {
  const facts = factRows(data.facts);
  const sections = arr(data.sections)
    .filter(isObj)
    .map((s) => ({ title: textOf(s, 'title', 'name'), facts: factRows(s.facts ?? s.items) }))
    .filter((s) => s.title || s.facts.length);
  const links = arr(data.links)
    .map((l) => (isObj(l) ? { label: textOf(l, 'label', 'title', 'name'), url: str(l.url ?? l.href) } : { label: '', url: str(l) }))
    .filter((l) => /^https?:\/\//i.test(l.url));
  const image = str(data.image);
  return (
    <Card>
      <div className="flex flex-col gap-4 @lg:flex-row-reverse @lg:items-start">
        {image && <Pic src={image} alt={str(data.title)} fit="contain" className="max-h-56 min-h-24 w-full shrink-0 rounded-xl bg-bg-1 @lg:w-[40%] @lg:max-w-[240px]" />}
        <div className="min-w-0 flex-1">
          <Head title={data.title} sub={data.subtitle} className="mb-2" />
          {str(data.summary) && <Md text={data.summary} className="text-[13.5px] text-fg-2" />}
        </div>
      </div>
      <KeyValues rows={facts} className="mt-3" />
      {sections.length > 0 && (
        <div className={cx('mt-4 grid gap-x-6 gap-y-4', sections.length > 1 && '@xl:grid-cols-2')}>
          {sections.map((s, i) => (
            <Section key={i} title={s.title}>
              <KeyValues rows={s.facts} />
            </Section>
          ))}
        </div>
      )}
      {links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[13px]">
          {links.map((l, i) => (
            <LinkOut key={i} url={l.url}>
              {l.label || undefined}
            </LinkOut>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---- a definition --------------------------------------------------------------------------------------------------------

/** A line of words a sense lists (synonyms, antonyms), after their label. */
function WordLine({ label, list }: { label: string; list: string[] }) {
  if (!list.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[12.5px]">
      <span className="text-fg-3">{label}</span>
      {list.map((w, i) => (
        <span key={i} className="rounded-md border border-line px-1.5 py-px text-fg-2">
          {w}
        </span>
      ))}
    </div>
  );
}

function Definition({ data, done }: { data: Data; done: boolean }) {
  const term = str(data.term ?? data.word);
  const senses = arr(data.senses ?? data.meanings ?? data.definitions).map((s) => (isObj(s) ? s : { meaning: s }));
  // Senses of one part of speech in a row sit under it.
  const groups: { pos: string; senses: Data[] }[] = [];
  for (const s of senses) {
    const pos = str(s.pos ?? s.part_of_speech ?? s.partOfSpeech).trim();
    const last = groups[groups.length - 1];
    if (last && last.pos === pos) last.senses.push(s);
    else groups.push({ pos, senses: [s] });
  }
  const forms = words(data.forms);
  const related = words(data.related);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {term && <h3 className="m-0 text-[26px] leading-tight font-semibold tracking-tight">{term}</h3>}
        {str(data.phonetic) && <span className="text-[15px] text-fg-3">{str(data.phonetic)}</span>}
        {term && done && <SpeakBtn text={term} lang={str(data.lang) || undefined} />}
      </div>
      {groups.length > 0 && (
        <div className="mt-3 space-y-4">
          {groups.map((g, gi) => (
            <section key={gi} className="min-w-0">
              {g.pos && <div className="mb-1.5 text-[13px] font-semibold text-accent italic">{g.pos}</div>}
              <ol className="m-0 list-none space-y-3 p-0">
                {g.senses.map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    {g.senses.length > 1 && <span className="mt-px w-3.5 shrink-0 text-right text-[13px] font-semibold text-fg-3 tabular-nums">{i + 1}</span>}
                    <div className="min-w-0 flex-1">
                      <Md text={s.meaning ?? s.definition ?? s.text} className="text-[14.5px]" />
                      {words(s.examples ?? s.example).map((e, k) => (
                        <p key={k} className="m-0 mt-1 border-l-2 border-line pl-2.5 text-[13.5px] text-fg-2 italic">
                          {e}
                        </p>
                      ))}
                      <WordLine label={tr('Similar')} list={words(s.synonyms)} />
                      <WordLine label={tr('Opposite')} list={words(s.antonyms)} />
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      {str(data.origin) && (
        <Section title={tr('Origin')} className="mt-4 border-t border-line pt-3">
          <Md text={data.origin} className="text-[13.5px] text-fg-2" />
        </Section>
      )}
      {(forms.length > 0 || related.length > 0) && (
        <div className={cx('mt-3 space-y-1 text-[13px]', !str(data.origin) && 'border-t border-line pt-3')}>
          {forms.length > 0 && (
            <div>
              <span className="text-fg-3">{tr('Other forms')}: </span>
              <span className="text-fg-2">{forms.join(', ')}</span>
            </div>
          )}
          {related.length > 0 && (
            <div>
              <span className="text-fg-3">{tr('Related')}: </span>
              <span className="text-fg-2">{related.join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ---- a glossary ----------------------------------------------------------------------------------------------------------

/** The letter a term files under: its first letter without accents, "#" for a digit or a sign. */
const initial = (s: string) => {
  const c = s.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toLocaleUpperCase();
  return /\p{L}/u.test(c) ? c : '#';
};

function Glossary({ data, done }: { data: Data; done: boolean }) {
  const all = arr(data.terms ?? data.items ?? data.words)
    .map((t) => (isObj(t) ? { term: textOf(t, 'term', 'name', 'word', 'title'), meaning: t.meaning ?? t.definition ?? t.text ?? t.description, tag: textOf(t, 'tag', 'category', 'topic') } : { term: '', meaning: '', tag: '' }))
    .filter((t) => t.term);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const tags = [...new Set(all.map((t) => t.tag).filter(Boolean))];
  const many = all.length >= 9;
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = all.filter((t) => (!tag || t.tag === tag) && (!needle || `${t.term} ${str(t.meaning)} ${t.tag}`.toLowerCase().includes(needle)));
    if (many && done) out = [...out].sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base', numeric: true }));
    return out;
  }, [all, q, tag, many, done]);
  const tools = done && (all.length >= 6 || tags.length > 1);
  return (
    <Card>
      <Head title={data.title} aside={all.length > 1 ? <span className="text-[12px] text-fg-3 tabular-nums">{list.length === all.length ? all.length : `${list.length} / ${all.length}`}</span> : undefined} />
      {tools && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {all.length >= 6 && (
            <label className="relative min-w-[150px] flex-1">
              <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Filter')} className="h-8 w-full rounded-lg border border-line bg-bg-1 pr-2 pl-8 text-[13px] outline-none focus:border-accent" />
            </label>
          )}
          {tags.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {['', ...tags].map((t) => (
                <button
                  key={t || '*'}
                  type="button"
                  onClick={() => setTag(t)}
                  className={cx('rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors', tag === t ? 'border-accent bg-accent-soft text-accent' : 'border-line text-fg-2 hover:bg-bg-2')}
                >
                  {t || tr('All')}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {list.length > 0 ? (
        <dl className="m-0">
          {list.map((t, i) => {
            const letter = many ? initial(t.term) : '';
            const first = many && (i === 0 || initial(list[i - 1].term) !== letter);
            return (
              <div key={`${t.term}:${i}`} className={cx('grid gap-x-2 py-2', many ? 'grid-cols-[1.25rem_minmax(0,1fr)]' : 'grid-cols-1', i > 0 && (first ? 'border-t border-line' : 'border-t border-line/50'))}>
                {many && <span className="text-[13px] leading-snug font-semibold text-accent">{first ? letter : ''}</span>}
                <div className="grid min-w-0 items-start gap-x-4 gap-y-0.5 @lg:grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)]">
                  <dt className="min-w-0 leading-snug font-semibold text-fg">
                    {t.term}
                    {t.tag && tags.length > 1 && <span className="block text-[11.5px] font-normal text-fg-3">{t.tag}</span>}
                  </dt>
                  <dd className="m-0 min-w-0 text-[13.5px] text-fg-2">
                    <Md text={t.meaning} />
                  </dd>
                </div>
              </div>
            );
          })}
        </dl>
      ) : all.length > 0 ? (
        <div className="py-6 text-center text-[13px] text-fg-3">{tr('No term matches.')}</div>
      ) : null}
    </Card>
  );
}

// ---- an FAQ ----------------------------------------------------------------------------------------------------------

function Faq({ data, done }: { data: Data; done: boolean }) {
  const items = arr(data.items ?? data.questions ?? data.faq)
    .map((x) => (isObj(x) ? { q: textOf(x, 'q', 'question', 'title'), a: x.a ?? x.answer ?? x.text } : { q: '', a: '' }))
    .filter((x) => x.q);
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  const allOpen = items.length > 0 && items.every((_, i) => open[i]);
  const head = !!str(data.title) || (done && items.length >= 4);
  return (
    <Card pad={false} className="overflow-hidden">
      {head && (
        <Head
          title={data.title}
          className="mb-0 px-4 pt-3.5 pb-2.5 @lg:px-5"
          aside={
            done && items.length >= 4 ? (
              <button type="button" onClick={() => setOpen(allOpen ? {} : Object.fromEntries(items.map((_, i) => [i, true])))} className="text-[12.5px] font-medium text-fg-3 transition-colors hover:text-fg">
                {allOpen ? tr('Close all') : tr('Open all')}
              </button>
            ) : undefined
          }
        />
      )}
      {items.map((it, i) => {
        const on = !!open[i];
        return (
          <div key={i} className={cx((head || i > 0) && 'border-t border-line')}>
            <button type="button" aria-expanded={on} onClick={() => done && setOpen((o) => ({ ...o, [i]: !on }))} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-1/70 @lg:px-5">
              <span className="min-w-0 flex-1 text-[14.5px] font-medium text-fg">
                <Md text={it.q} inline />
              </span>
              <ChevronDown size={16} className={cx('mt-0.5 shrink-0 text-fg-3 transition-transform', on && 'rotate-180')} />
            </button>
            {on && str(it.a) && (
              <div className="-mt-1 px-4 pb-3.5 @lg:px-5">
                <Md text={it.a} className="text-[13.5px] text-fg-2" />
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

// ---- tabs -------------------------------------------------------------------------------------------------------------

function Tabs({ data, done }: { data: Data; done: boolean }) {
  const tabs = arr(data.tabs ?? data.items)
    .filter(isObj)
    .map((t, i) => ({ label: textOf(t, 'label', 'title', 'name') || String(i + 1), icon: str(t.icon), content: t.content ?? t.text ?? t.body }));
  const [at, setAt] = useKept<number>('tab', 0);
  const shown = done ? Math.min(Math.max(0, num(at) ?? 0), Math.max(0, tabs.length - 1)) : 0;
  if (!tabs.length && !str(data.title)) return <Card>{null}</Card>;
  return (
    <Card pad={false} className="overflow-hidden">
      {str(data.title) && <Head title={data.title} className="mb-0 px-4 pt-4 pb-1 @lg:px-5" />}
      {tabs.length > 0 && (
        <div role="tablist" className="flex gap-0.5 overflow-x-auto border-b border-line px-2 @lg:px-3">
          {tabs.map((t, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === shown}
              onClick={() => done && setAt(i)}
              className={cx('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[13.5px] font-medium whitespace-nowrap transition-colors', i === shown ? 'border-accent text-fg' : 'border-transparent text-fg-3 hover:text-fg')}
            >
              {t.icon && <span aria-hidden>{t.icon}</span>}
              {t.label}
            </button>
          ))}
        </div>
      )}
      {str(tabs[shown]?.content) && (
        <div role="tabpanel" className="px-4 py-3.5 @lg:px-5 @lg:py-4">
          <Md text={tabs[shown].content} className="text-[14px]" />
        </div>
      )}
    </Card>
  );
}

// ---- columns ----------------------------------------------------------------------------------------------------------

function Columns({ data }: { data: Data }) {
  const cols = arr(data.columns ?? data.items)
    .map((c) => (isObj(c) ? c : { content: c }))
    .slice(0, 4);
  const n = cols.length;
  const grid = n >= 4 ? '@lg:grid-cols-2 @2xl:grid-cols-4' : n === 3 ? '@xl:grid-cols-3' : n === 2 ? '@md:grid-cols-2' : '';
  return (
    <Card>
      <Head title={data.title} />
      {n > 0 && (
        <div className={cx('grid gap-3', grid)}>
          {cols.map((c, i) => {
            const tone = str(c.tone) ? toneOf(c.tone) : 'neutral';
            const fill = TONE_FILL[tone];
            const icon = str(c.icon);
            const list = c.content ?? c.items ?? c.points ?? c.text;
            const body = Array.isArray(list) ? arr(list).map((x) => `- ${textOf(x)}`).join('\n') : list;
            return (
              <div key={i} className="min-w-0 rounded-xl border p-3.5" style={tone === 'neutral' ? { background: 'var(--bg-1)', borderColor: 'var(--line)' } : { background: mix(fill, 6), borderColor: mix(fill, 28, 'var(--line)') }}>
                {(str(c.title) || icon || tone === 'good' || tone === 'bad') && (
                  <div className="mb-2 flex items-center gap-2">
                    {icon ? (
                      <span className="text-[15px] leading-none" aria-hidden>
                        {icon}
                      </span>
                    ) : tone === 'good' || tone === 'bad' ? (
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white" style={{ background: fill }} aria-hidden>
                        {tone === 'good' ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                      </span>
                    ) : null}
                    <span className="font-semibold" style={tone !== 'neutral' ? { color: fill } : undefined}>
                      {str(c.title)}
                    </span>
                  </div>
                )}
                <Md text={body} className="text-[13.5px] text-fg-2" />
              </div>
            );
          })}
        </div>
      )}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- a quote ----------------------------------------------------------------------------------------------------------

/** A date as a quote is dated: a day, a month, or a year (or any words) as given. */
function whenText(v: unknown): string {
  const s = str(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return fmtDate(s, 'medium');
  if (/^\d{4}-\d{2}$/.test(s)) return fmtDate(s, 'monthYear');
  return s;
}

function QuoteView({ data }: { data: Data }) {
  const text = data.text ?? data.quote;
  const author = str(data.author ?? data.by ?? data.name);
  const source = str(data.source);
  const url = str(data.url);
  const when = whenText(data.date ?? data.year);
  const where = [source, when].filter(Boolean);
  return (
    <Card className="relative">
      <div className="flex gap-3">
        <span className="-mt-1 shrink-0 font-serif text-[46px] leading-none text-accent select-none" aria-hidden>
          “
        </span>
        <div className="min-w-0 flex-1 pt-1">
          {str(text) && <Md text={text} className="font-serif text-[18.5px] leading-relaxed text-fg @lg:text-[20px]" />}
          {(author || str(data.role) || where.length > 0 || url) && (
            <div className="mt-4 flex items-center gap-3">
              {str(data.image) && <Pic src={data.image} alt={author} className="h-11 w-11 shrink-0 rounded-full" />}
              <div className="min-w-0 text-[13px] leading-snug">
                {author && <div className="font-semibold text-fg">{author}</div>}
                {str(data.role) && <div className="text-fg-3">{str(data.role)}</div>}
                {(where.length > 0 || url) && (
                  <div className="text-fg-3">
                    {url ? (
                      <LinkOut url={url} className="text-[13px]">
                        {source || undefined}
                      </LinkOut>
                    ) : (
                      source
                    )}
                    {when && (
                      <>
                        {source || url ? ', ' : ''}
                        <span className="whitespace-nowrap">{when}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---- cards ------------------------------------------------------------------------------------------------------------

function CardTitle({ c }: { c: Data }) {
  const title = textOf(c, 'title', 'name', 'label');
  return str(c.url) ? (
    <LinkOut url={c.url} className="font-semibold text-fg">
      {title}
    </LinkOut>
  ) : (
    <span className="font-semibold text-fg">{title}</span>
  );
}

function Cards({ data }: { data: Data }) {
  const cards = arr(data.cards ?? data.items).map((c) => (isObj(c) ? c : { title: str(c) }));
  const list = str(data.layout).toLowerCase() === 'list';
  const pics = cards.map((c) => c.image).filter((p) => str(p));
  const anyPic = pics.length > 0;
  if (list)
    return (
      <Card pad={false} className="overflow-hidden">
        {str(data.title) && <Head title={data.title} className="mb-0 px-4 pt-4 pb-1 @lg:px-5" />}
        <ul className="m-0 list-none p-0">
          {cards.map((c, i) => (
            <li key={i} className={cx('flex min-w-0 gap-3 px-4 py-3 @lg:px-5', (i > 0 || str(data.title)) && 'border-t border-line/70')}>
              {anyPic && <Pic src={c.image} alt={textOf(c, 'title', 'name')} group={pics} className="h-16 w-20 shrink-0 rounded-lg" />}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <CardTitle c={c} />
                  {str(c.tag) && <Chip>{str(c.tag)}</Chip>}
                </div>
                {str(c.meta) && <div className="mt-0.5 text-[12px] text-fg-3">{str(c.meta)}</div>}
                {str(c.text ?? c.description) && <Md text={c.text ?? c.description} className="mt-1 text-[13px] text-fg-2" />}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    );
  return (
    <div className="min-w-0">
      {str(data.title) && <h3 className="aui-h3 mb-2.5">{str(data.title)}</h3>}
      <div className="grid gap-3 @md:grid-cols-2 @2xl:grid-cols-3">
        {cards.map((c, i) => (
          <div key={i} className="aui-card flex min-w-0 flex-col overflow-hidden">
            {anyPic && <Pic src={c.image} alt={textOf(c, 'title', 'name')} group={pics} className="aspect-[16/10] w-full rounded-none" />}
            <div className="flex min-w-0 flex-1 flex-col p-3.5">
              {(str(c.tag) || str(c.meta)) && (
                <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  {str(c.tag) && <Chip tone="accent">{str(c.tag)}</Chip>}
                  {str(c.meta) && <span className="text-[12px] text-fg-3">{str(c.meta)}</span>}
                </div>
              )}
              <CardTitle c={c} />
              {str(c.text ?? c.description) && <Md text={c.text ?? c.description} className="mt-1 text-[13px] text-fg-2" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const SUMMARY_UIS: Record<string, AnswerUiView> = {
  'key-points': KeyPoints,
  callout: Callout,
  'fact-sheet': FactSheet,
  definition: Definition,
  glossary: Glossary,
  faq: Faq,
  tabs: Tabs,
  columns: Columns,
  quote: QuoteView,
  cards: Cards,
};
