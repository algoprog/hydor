// The answer UIs for learning: their views, by name (shared/answer-ui/learn.ts has what each takes).
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleCheck,
  CirclePlay,
  Code2,
  Eye,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileCog,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  GraduationCap,
  Lightbulb,
  Link2,
  MessageSquarePlus,
  Newspaper,
  Quote,
  RotateCcw,
  ScrollText,
  Send,
  Shuffle,
  Wrench,
  X,
} from 'lucide-react';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { CodeBlock } from '../../Markdown';
import { cx } from '../../ui';
import { arr, Btn, Card, Chip, Copy, fmtNum, Head, hostOf, isObj, Md, num, Pic, Ring, Section, Seg, SpeakBtn, str, textOf, useAsk, useKept, words, yes, type AnswerUiView, type Data } from '../kit';

const LETTERS = 'ABCDEFGH';

interface Question {
  q: string;
  options: string[];
  answer: number[];
  explain: string;
  image: string;
}

/** The questions as far as they have come: an answer given as an index, several, or the right option's words. */
function questionsOf(data: Data): Question[] {
  return arr(data.questions)
    .filter(isObj)
    .map((x) => {
      const options = arr(x.options ?? x.choices).map((o) => textOf(o));
      const raw = Array.isArray(x.answer) ? x.answer : x.answer !== undefined ? [x.answer] : [];
      const answer = raw.map((a) => (typeof a === 'number' ? a : options.findIndex((o) => o.trim().toLowerCase() === str(a).trim().toLowerCase()))).filter((a) => a >= 0 && a < options.length);
      return { q: str(x.q ?? x.question), options, answer, explain: str(x.explain ?? x.explanation), image: str(x.image) };
    });
}

function QuestionCard({ q, index, total, picked, checked, onPick, onCheck, live }: { q: Question; index: number; total: number; picked: number[]; checked: boolean; onPick: (i: number) => void; onCheck: () => void; live: boolean }) {
  const multi = q.answer.length > 1;
  const right = checked && q.answer.length > 0 && picked.length === q.answer.length && picked.every((p) => q.answer.includes(p));
  return (
    <div>
      <div className="mb-1 text-[11.5px] font-medium text-fg-3">{tr('Question {0} of {1}').replace('{0}', String(index + 1)).replace('{1}', String(total))}</div>
      <Md text={q.q} className="text-[15px] font-medium text-fg" />
      {q.image && <Pic src={q.image} className="mt-2 aspect-video w-full max-w-md rounded-lg" />}
      {multi && !checked && <div className="mt-1 text-[12px] text-fg-3">{tr('More than one is right: pick all that are, then check.')}</div>}
      <div className="mt-3 grid gap-2">
        {q.options.map((o, i) => {
          const chosen = picked.includes(i);
          const correct = q.answer.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={checked || live}
              onClick={() => onPick(i)}
              className={cx(
                'flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-[14px] transition-colors',
                !checked && (chosen ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-2 hover:bg-bg-1'),
                checked && correct && 'border-ok/50 bg-ok/10',
                checked && chosen && !correct && 'border-err/50 bg-err/10',
                checked && !chosen && !correct && 'border-line opacity-70',
              )}
            >
              <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12px] font-semibold', checked && correct ? 'bg-ok text-white' : checked && chosen ? 'bg-err text-white' : chosen ? 'bg-accent text-accent-fg' : 'bg-bg-2 text-fg-3')}>
                {checked && correct ? <Check size={13} strokeWidth={3} /> : checked && chosen ? <X size={13} strokeWidth={3} /> : LETTERS[i] ?? i + 1}
              </span>
              <span className="min-w-0 pt-0.5">
                <Md text={o} inline />
              </span>
            </button>
          );
        })}
      </div>
      {multi && !checked && (
        <div className="mt-3">
          <Btn primary disabled={!picked.length || live} onClick={onCheck}>
            {tr('Check')}
          </Btn>
        </div>
      )}
      {checked && (
        <div className={cx('mt-3 rounded-lg px-3 py-2 text-[13.5px]', right ? 'bg-ok/10' : 'bg-bg-2')}>
          <div className={cx('font-semibold', right ? 'text-ok' : 'text-fg')}>{right ? tr('Right!') : tr('Not quite.')}</div>
          {q.explain && <Md text={q.explain} className="mt-0.5 text-fg-2" />}
        </div>
      )}
    </div>
  );
}

function Quiz({ data, done }: { data: Data; done: boolean }) {
  const qs = questionsOf(data);
  const [picked, setPicked] = useKept<Record<number, number[]>>('picked', {});
  const [checked, setChecked] = useKept<Record<number, boolean>>('checked', {});
  const [at, setAt] = useKept<number>('at', 0);
  const [scored, setScored] = useKept<boolean>('scored', false);
  const ask = useAsk();
  const all = str(data.mode) === 'all';
  const total = qs.length;
  const answered = qs.filter((_, i) => checked[i]).length;
  const score = qs.filter((q, i) => checked[i] && q.answer.length && (picked[i] ?? []).length === q.answer.length && (picked[i] ?? []).every((p) => q.answer.includes(p))).length;
  const finished = done && total > 0 && answered === total;
  const pick = (qi: number, i: number) => {
    const q = qs[qi];
    if (q.answer.length > 1) setPicked((p) => ({ ...p, [qi]: (p[qi] ?? []).includes(i) ? (p[qi] ?? []).filter((x) => x !== i) : [...(p[qi] ?? []), i] }));
    else {
      setPicked((p) => ({ ...p, [qi]: [i] }));
      setChecked((c) => ({ ...c, [qi]: true }));
    }
  };
  const reset = () => {
    setPicked({});
    setChecked({});
    setAt(0);
    setScored(false);
  };
  const send = () => {
    const missed = qs.map((q, i) => ({ q, i })).filter(({ q, i }) => !(q.answer.length && (picked[i] ?? []).length === q.answer.length && (picked[i] ?? []).every((p) => q.answer.includes(p))));
    ask(`${tr('I scored {0} out of {1} on the quiz.').replace('{0}', String(score)).replace('{1}', String(total))}${missed.length ? ` ${tr('I missed:')} ${missed.map(({ q, i }) => `${i + 1}. ${q.q.replace(/\s+/g, ' ').slice(0, 120)}`).join('; ')}` : ''}`);
  };
  const cur = Math.min(Math.max(0, num(at) ?? 0), Math.max(0, total - 1));
  const summary = finished && (
    <div className="flex flex-wrap items-center gap-4 rounded-xl bg-bg-1 p-4">
      <Ring value={score} max={total} size={64} tone={score / total >= 0.7 ? 'good' : score / total >= 0.4 ? 'warn' : 'bad'}>
        <span className="text-[15px] font-semibold tabular-nums">
          {score}/{total}
        </span>
      </Ring>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{score === total ? tr('All right. Well done!') : tr('{0} of {1} right').replace('{0}', String(score)).replace('{1}', String(total))}</div>
        <div className="text-[12.5px] text-fg-3">{tr('Send your score to talk through what you missed.')}</div>
      </div>
      <div className="flex gap-2">
        <Btn icon={<RotateCcw size={13} />} onClick={reset}>
          {tr('Try again')}
        </Btn>
        <Btn primary icon={<Send size={13} />} onClick={send}>
          {tr('Send my score')}
        </Btn>
      </div>
    </div>
  );
  return (
    <Card>
      <Head title={data.title} aside={total > 1 ? <span className="text-[12px] text-fg-3 tabular-nums">{`${answered}/${total}`}</span> : undefined} />
      {all ? (
        <div className="space-y-6">
          {qs.map((q, i) => (
            <QuestionCard key={i} q={q} index={i} total={total} picked={picked[i] ?? []} checked={!!checked[i]} onPick={(o) => pick(i, o)} onCheck={() => setChecked((c) => ({ ...c, [i]: true }))} live={!done} />
          ))}
          {summary}
        </div>
      ) : finished && scored ? (
        <div className="space-y-4">
          {summary}
          <div className="flex flex-wrap gap-1.5">
            {qs.map((q, i) => {
              const ok = q.answer.length && (picked[i] ?? []).length === q.answer.length && (picked[i] ?? []).every((p) => q.answer.includes(p));
              return (
                <button key={i} type="button" onClick={() => (setScored(false), setAt(i))} className={cx('grid h-7 w-7 place-items-center rounded-md text-[12px] font-semibold', ok ? 'bg-ok/15 text-ok' : 'bg-err/15 text-err')} title={q.q}>
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      ) : total > 0 ? (
        <>
          <QuestionCard q={qs[cur]} index={cur} total={total} picked={picked[cur] ?? []} checked={!!checked[cur]} onPick={(o) => pick(cur, o)} onCheck={() => setChecked((c) => ({ ...c, [cur]: true }))} live={!done} />
          <div className="mt-4 flex items-center justify-between gap-2">
            <Btn icon={<ChevronLeft size={14} />} disabled={cur === 0} onClick={() => setAt(cur - 1)} title={tr('Previous')} />
            <div className="flex gap-1">
              {qs.map((_, i) => (
                <button key={i} type="button" onClick={() => setAt(i)} aria-label={tr('Question {0}').replace('{0}', String(i + 1))} className={cx('h-1.5 rounded-full transition-all', i === cur ? 'w-5 bg-accent' : checked[i] ? 'w-1.5 bg-fg-3' : 'w-1.5 bg-bg-3')} />
              ))}
            </div>
            {cur < total - 1 ? (
              <Btn primary={!!checked[cur]} onClick={() => setAt(cur + 1)}>
                {tr('Next')}
                <ChevronRight size={14} className="-mr-1" />
              </Btn>
            ) : (
              <Btn primary disabled={!finished} onClick={() => setScored(true)}>
                {tr('See my score')}
              </Btn>
            )}
          </div>
        </>
      ) : null}
    </Card>
  );
}

// ---- small parts these views share ------------------------------------------------------------------------------------

/** A link that looks like a small button (a paper's PDF, its code). */
function LinkButton({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[12px] font-medium text-fg transition-colors hover:bg-bg-2">
      {icon}
      {children}
    </a>
  );
}

/** A small button of the same look, for what opens or folds in place. */
function SmallButton({ onClick, icon, children, on, disabled, title }: { onClick: () => void; icon?: ReactNode; children?: ReactNode; on?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={on}
      className={cx(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        on ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line bg-panel text-fg hover:bg-bg-2',
        !children && 'w-7 justify-center px-0',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** Languages by their English names, for agents that write "Greek" where a code ("el") is wanted. */
const LANGS: Record<string, string> = {
  english: 'en', greek: 'el', japanese: 'ja', chinese: 'zh', mandarin: 'zh', cantonese: 'yue', spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt',
  russian: 'ru', korean: 'ko', arabic: 'ar', hindi: 'hi', turkish: 'tr', dutch: 'nl', swedish: 'sv', norwegian: 'no', danish: 'da', finnish: 'fi', polish: 'pl', czech: 'cs',
  ukrainian: 'uk', hebrew: 'he', thai: 'th', vietnamese: 'vi', indonesian: 'id', malay: 'ms', persian: 'fa', farsi: 'fa', romanian: 'ro', hungarian: 'hu', bulgarian: 'bg',
  serbian: 'sr', croatian: 'hr', catalan: 'ca', irish: 'ga', welsh: 'cy', latin: 'la', swahili: 'sw', tagalog: 'tl', filipino: 'fil', bengali: 'bn', urdu: 'ur', tamil: 'ta',
};

/** A language's code ("el", "ja-JP"), from a code or an English name; empty when it is neither. */
function langCode(v: unknown): string {
  const s = str(v).trim();
  const named = LANGS[s.toLowerCase()];
  if (named) return named;
  return /^[a-z]{2,3}([-_][a-z0-9]{2,8})*$/i.test(s) ? s.replace(/_/g, '-') : '';
}

/** A language's name in the app's language ("Greek", "Ελληνικά"), from its code or name as given. */
function langName(v: unknown): string {
  const s = str(v).trim();
  const code = langCode(s);
  if (code)
    try {
      const name = new Intl.DisplayNames([LOCALE ?? navigator.language ?? 'en'], { type: 'language' }).of(code);
      if (name && name.toLowerCase() !== code.toLowerCase()) return name.charAt(0).toLocaleUpperCase() + name.slice(1);
    } catch {}
  return s;
}

// ---- flashcards ------------------------------------------------------------------------------------------------------

interface FlashCard {
  front: string;
  back: string;
  hint: string;
  image: string;
}

type CardMark = 'known' | 'again';

function Flashcards({ data, done }: { data: Data; done: boolean }) {
  const cards: FlashCard[] = arr(data.cards ?? data.items)
    .map((c) => (isObj(c) ? { front: str(c.front ?? c.term ?? c.question ?? c.q), back: str(c.back ?? c.definition ?? c.answer ?? c.a), hint: str(c.hint), image: str(c.image) } : { front: str(c), back: '', hint: '', image: '' }))
    .filter((c) => c.front || c.back);
  const n = cards.length;
  // The deck's order (shuffled, or only the cards to see again), where in it the user is, and what they marked.
  const [order, setOrder] = useKept<number[] | null>('order', null);
  const [pos, setPos] = useKept<number>('pos', 0);
  const [marks, setMarks] = useKept<Record<number, CardMark>>('marks', {});
  const [flipped, setFlipped] = useState(false);
  const [hint, setHint] = useState(false);
  const list = useMemo(() => {
    const kept = Array.isArray(order) ? order.filter((i) => Number.isInteger(i) && i >= 0 && i < n) : [];
    return kept.length ? kept : Array.from({ length: n }, (_, i) => i);
  }, [order, n]);
  const at = Math.min(Math.max(0, num(pos) ?? 0), list.length);
  const finished = done && n > 0 && at >= list.length;
  const cur = Math.min(at, Math.max(0, list.length - 1));
  const card = cards[list[cur]];
  const known = cards.filter((_, i) => marks[i] === 'known').length;
  const again = cards.map((_, i) => i).filter((i) => marks[i] === 'again');
  const go = (p: number) => {
    setPos(Math.max(0, Math.min(list.length, p)));
    setFlipped(false);
    setHint(false);
  };
  const mark = (m: CardMark) => {
    setMarks((x) => ({ ...x, [list[cur]]: m }));
    go(cur + 1);
  };
  const restart = (next: number[] | null, clear: boolean) => {
    setOrder(next);
    if (clear) setMarks({});
    go(0);
  };
  const shuffle = () => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    restart(a, false);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!done) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setFlipped((f) => !f);
    } else if (e.key === 'ArrowRight' && cur < list.length - 1) go(cur + 1);
    else if (e.key === 'ArrowLeft' && cur > 0) go(cur - 1);
  };
  return (
    <Card>
      <Head
        title={data.title}
        aside={
          n > 0 && known + again.length > 0 ? (
            <span className="flex items-center gap-3 text-[12px] font-medium tabular-nums">
              <span className="inline-flex items-center gap-1 text-ok" title={tr('Known')}>
                <Check size={13} strokeWidth={2.5} />
                {known}
              </span>
              <span className="inline-flex items-center gap-1 text-warn" title={tr('To see again')}>
                <RotateCcw size={12} strokeWidth={2.5} />
                {again.length}
              </span>
            </span>
          ) : undefined
        }
      />
      {n > 1 && (
        <div className="mb-3 flex gap-1" aria-hidden>
          {list.map((i, k) => (
            <span key={k} className={cx('h-1 min-w-0 flex-1 rounded-full', k === cur && !finished ? 'bg-accent' : marks[i] === 'known' ? 'bg-ok/70' : marks[i] === 'again' ? 'bg-warn/70' : 'bg-bg-3')} />
          ))}
        </div>
      )}
      {finished ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-bg-1 p-4">
          <Ring value={known} max={n} size={64} tone={known / n >= 0.7 ? 'good' : known / n >= 0.4 ? 'warn' : 'bad'}>
            <span className="text-[14px] font-semibold tabular-nums">{`${known}/${n}`}</span>
          </Ring>
          <div className="min-w-[160px] flex-1">
            <div className="font-semibold">{known === n ? tr('You know them all!') : tr('{0} of {1} known').replace('{0}', String(known)).replace('{1}', String(n))}</div>
            <div className="text-[12.5px] text-fg-3">{again.length ? tr('Go over the ones to see again, or start over.') : tr('Shuffle them and go once more to be sure.')}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn icon={<ChevronLeft size={14} />} onClick={() => go(list.length - 1)} title={tr('Previous')} />
            {again.length > 0 && (
              <Btn primary icon={<RotateCcw size={13} />} onClick={() => restart(again, false)}>
                {tr('Go over {0} again').replace('{0}', String(again.length))}
              </Btn>
            )}
            <Btn icon={<Shuffle size={13} />} onClick={() => (setMarks({}), shuffle())}>
              {tr('Start over')}
            </Btn>
          </div>
        </div>
      ) : card ? (
        <>
          <div
            role="button"
            tabIndex={done ? 0 : -1}
            aria-label={flipped ? tr('Show the question') : tr('Show the answer')}
            onClick={() => done && setFlipped((f) => !f)}
            onKeyDown={onKey}
            className={cx(
              'relative flex min-h-[208px] flex-col items-center justify-center rounded-2xl border px-5 pt-10 pb-8 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              done && 'cursor-pointer',
              flipped ? 'border-accent/40 bg-accent-soft/40' : 'border-line bg-bg-1 hover:border-line-2',
            )}
          >
            <span className="absolute top-3 left-4 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">{flipped ? tr('Answer') : tr('Question')}</span>
            <span className="absolute top-3 right-4 text-[11.5px] text-fg-3 tabular-nums">{`${cur + 1} / ${list.length}`}</span>
            {!flipped && card.image && <Pic src={card.image} alt="" fit="contain" zoom={false} className="mb-3 h-32 w-full max-w-[260px] rounded-lg bg-transparent" />}
            <Md text={flipped ? card.back || '—' : card.front} className={cx('max-w-full', flipped ? 'text-[15px] leading-relaxed' : 'text-[19px] leading-snug font-semibold')} />
            {!flipped &&
              card.hint &&
              done &&
              (hint ? (
                <Md text={card.hint} className="mt-3 text-[13px] text-fg-3" />
              ) : (
                <button type="button" onClick={(e) => (e.stopPropagation(), setHint(true))} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-fg-3 transition-colors hover:text-fg">
                  <Lightbulb size={13} />
                  {tr('Show a hint')}
                </button>
              ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Btn icon={<ChevronLeft size={14} />} disabled={!done || cur === 0} onClick={() => go(cur - 1)} title={tr('Previous')} />
            <div className="flex flex-wrap justify-center gap-2">
              {flipped ? (
                <>
                  <Btn icon={<RotateCcw size={13} />} disabled={!done} onClick={() => mark('again')}>
                    {tr('Again')}
                  </Btn>
                  <Btn primary icon={<Check size={13} />} disabled={!done} onClick={() => mark('known')}>
                    {tr('I knew it')}
                  </Btn>
                </>
              ) : (
                <Btn primary icon={<Eye size={13} />} disabled={!done} onClick={() => setFlipped(true)}>
                  {tr('Show the answer')}
                </Btn>
              )}
            </div>
            <Btn icon={<ChevronRight size={14} />} disabled={!done || cur >= list.length - 1} onClick={() => go(cur + 1)} title={tr('Next')} />
          </div>
          {done && n > 1 && (
            <div className="mt-2.5 flex items-center justify-between gap-3 text-[12px] text-fg-3">
              <button type="button" onClick={shuffle} className="inline-flex items-center gap-1 transition-colors hover:text-fg">
                <Shuffle size={12} />
                {tr('Shuffle')}
              </button>
              {(Object.keys(marks).length > 0 || order) && (
                <button type="button" onClick={() => restart(null, true)} className="inline-flex items-center gap-1 transition-colors hover:text-fg">
                  <RotateCcw size={12} />
                  {tr('Start over')}
                </button>
              )}
            </div>
          )}
        </>
      ) : null}
    </Card>
  );
}

// ---- a worked solution -------------------------------------------------------------------------------------------------

/** LaTeX as agents write it, without the $ or \[ \] they may put around it. */
const bareMath = (s: string) =>
  s
    .trim()
    .replace(/^\$\$?|\$\$?$/g, '')
    .replace(/^\\\[|\\\]$/g, '')
    .trim();

function Solution({ data, done }: { data: Data; done: boolean }) {
  const steps = arr(data.steps)
    .map((s) => (isObj(s) ? { text: str(s.text ?? s.step ?? s.title ?? s.explain), math: bareMath(str(s.math ?? s.latex ?? s.formula)), note: str(s.note ?? s.why) } : { text: str(s), math: '', note: '' }))
    .filter((s) => s.text || s.math);
  const given = arr(data.given).map((g) => textOf(g)).filter(Boolean);
  const [mode, setMode] = useKept<'all' | 'steps' | ''>('mode', '');
  const [shown, setShown] = useKept<number>('shown', 1);
  const stepwise = (mode || (str(data.reveal).toLowerCase() === 'steps' ? 'steps' : 'all')) === 'steps';
  const count = stepwise ? Math.min(steps.length, Math.max(1, num(shown) ?? 1)) : steps.length;
  const whole = !stepwise || count >= steps.length;
  const answer = str(data.answer ?? data.result);
  const problem = str(data.problem ?? data.question);
  return (
    <Card>
      {str(data.title) && <Head title={data.title} />}
      {problem && (
        <Section title={tr('Problem')}>
          <Md text={problem} className="text-[15px] leading-relaxed" />
        </Section>
      )}
      {(given.length > 0 || str(data.find)) && (
        <div className="mt-3 grid gap-3 rounded-xl bg-bg-1 px-3.5 py-3 text-[13.5px] @md:grid-cols-2">
          {given.length > 0 && (
            <div className="min-w-0">
              <div className="aui-h4 mb-1">{tr('Given')}</div>
              <ul className="m-0 list-none space-y-0.5 p-0">
                {given.map((g, i) => (
                  <li key={i}>
                    <Md text={g} inline />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {str(data.find) && (
            <div className="min-w-0">
              <div className="aui-h4 mb-1">{tr('Find')}</div>
              <Md text={data.find} inline />
            </div>
          )}
        </div>
      )}
      {steps.length > 0 && (
        <Section
          className="mt-5"
          title={tr('Solution')}
          aside={
            done && steps.length > 1 ? (
              <Seg
                size="sm"
                options={[
                  { value: 'all', label: tr('All at once') },
                  { value: 'steps', label: tr('Step by step') },
                ]}
                value={stepwise ? 'steps' : 'all'}
                onChange={(v) => {
                  setMode(v);
                  if (v === 'steps') setShown(1);
                }}
              />
            ) : undefined
          }
        >
          <ol className="m-0 list-none p-0">
            {steps.slice(0, count).map((s, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < count - 1 && <span className="absolute top-7 bottom-1 left-3 w-px bg-line" aria-hidden />}
                <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">{i + 1}</span>
                <div className="min-w-0 flex-1 pt-0.5">
                  {s.text && <Md text={s.text} className="text-[14px] leading-relaxed" />}
                  {s.math && (
                    <div className="mt-1.5 overflow-x-auto rounded-lg bg-bg-1 px-3 py-0.5">
                      <Md text={`$$${s.math}$$`} />
                    </div>
                  )}
                  {s.note && (
                    <div className="mt-1.5 flex gap-1.5 text-[12.5px] text-fg-3">
                      <Lightbulb size={13} className="mt-[3px] shrink-0" />
                      <Md text={s.note} inline />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {!whole && (
            <div className="mt-3 flex flex-wrap items-center gap-2 pl-9">
              <Btn primary icon={<ChevronDown size={14} />} disabled={!done} onClick={() => setShown(count + 1)}>
                {tr('Next step')}
              </Btn>
              <Btn disabled={!done} onClick={() => setShown(steps.length)}>
                {tr('Show all')}
              </Btn>
              <span className="text-[12px] text-fg-3 tabular-nums">{tr('Step {0} of {1}').replace('{0}', String(count)).replace('{1}', String(steps.length))}</span>
            </div>
          )}
        </Section>
      )}
      {answer && whole && (
        <div className="mt-5 rounded-xl border-2 border-accent/45 bg-accent-soft/40 px-4 py-3">
          <div className="mb-0.5 text-[11.5px] font-semibold tracking-wide text-accent uppercase">{tr('Answer')}</div>
          <Md text={answer} className="text-[15.5px] font-medium" />
        </div>
      )}
      {str(data.check) && whole && (
        <div className="mt-3 flex gap-2 text-[13px] text-fg-2">
          <CircleCheck size={15} className="mt-0.5 shrink-0 text-ok" />
          <div className="min-w-0">
            <span className="font-medium text-fg">{tr('Check')}: </span>
            <Md text={data.check} inline />
          </div>
        </div>
      )}
    </Card>
  );
}

// ---- an explainer ----------------------------------------------------------------------------------------------------

function Explainer({ data, done }: { data: Data; done: boolean }) {
  const levels = arr(data.levels ?? data.explanations)
    .map((l, i) => (isObj(l) ? { label: str(l.label ?? l.level ?? l.name) || String(i + 1), text: str(l.text ?? l.explanation) } : { label: String(i + 1), text: str(l) }))
    .filter((l) => l.text);
  const [level, setLevel] = useKept<number>('level', 0);
  const at = Math.min(Math.max(0, num(level) ?? 0), Math.max(0, levels.length - 1));
  const terms = arr(data.key_terms ?? data.terms)
    .filter(isObj)
    .map((t) => ({ term: str(t.term ?? t.name), meaning: str(t.meaning ?? t.definition) }))
    .filter((t) => t.term);
  const image = str(data.image);
  const topic = str(data.topic ?? data.title);
  return (
    <Card>
      <Head title={topic} />
      {levels.length > 1 && (
        <div className="mb-3">
          <Seg options={levels.map((l, i) => ({ value: i, label: l.label }))} value={at} onChange={(v) => done && setLevel(v)} />
        </div>
      )}
      {(levels.length > 0 || image) && (
        <div className={cx('grid gap-4', image && '@lg:grid-cols-[minmax(0,1fr)_minmax(0,200px)]')}>
          {levels[at] && <Md text={levels[at].text} className="text-[14.5px] leading-relaxed" />}
          {image && <Pic src={image} alt={topic} fit="contain" className="aspect-[4/3] w-full self-start rounded-lg bg-bg-1" />}
        </div>
      )}
      {str(data.analogy) && (
        <div className="mt-4 flex gap-3 rounded-xl bg-bg-1 px-3.5 py-3">
          <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0">
            <div className="aui-h4 mb-0.5">{tr('Think of it like this')}</div>
            <Md text={data.analogy} className="text-[13.5px] text-fg-2" />
          </div>
        </div>
      )}
      {terms.length > 0 && (
        <Section title={tr('Key terms')} className="mt-4">
          <dl className="m-0 grid gap-x-4 gap-y-2 text-[13.5px] @md:grid-cols-[max-content_minmax(0,1fr)]">
            {terms.map((t, i) => (
              <div key={i} className="contents">
                <dt className="font-semibold">{t.term}</dt>
                <dd className="m-0 -mt-1.5 text-fg-2 @md:mt-0">
                  <Md text={t.meaning} inline />
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </Card>
  );
}

// ---- vocabulary ------------------------------------------------------------------------------------------------------

function Vocabulary({ data, done }: { data: Data; done: boolean }) {
  const list = arr(data.words ?? data.items)
    .map((w) => (isObj(w) ? w : { word: str(w) }))
    .map((w) => ({
      word: str(w.word ?? w.term ?? w.text),
      translation: str(w.translation ?? w.meaning ?? w.definition),
      phonetic: str(w.phonetic ?? w.pronunciation ?? w.reading),
      pos: str(w.pos ?? w.part_of_speech),
      example: str(w.example),
      exampleTr: str(w.example_translation ?? w.exampleTranslation),
      image: str(w.image),
    }))
    .filter((w) => w.word);
  const code = langCode(data.language ?? data.lang);
  const name = langName(data.language ?? data.lang);
  const [mode, setMode] = useKept<'list' | 'practice'>('mode', 'list');
  const [seen, setSeen] = useKept<Record<number, boolean>>('seen', {});
  const practice = done && mode === 'practice';
  const anyPic = list.some((w) => w.image);
  const revealed = list.filter((_, i) => seen[i]).length;
  const sub = [name, list.length > 1 ? tr('{0} words').replace('{0}', String(list.length)) : ''].filter(Boolean).join(' · ');
  return (
    <Card>
      <Head
        title={str(data.title) || name}
        sub={str(data.title) ? sub : list.length > 1 ? tr('{0} words').replace('{0}', String(list.length)) : ''}
        aside={
          done && list.length > 0 ? (
            <Seg
              size="sm"
              options={[
                { value: 'list', label: tr('List') },
                { value: 'practice', label: tr('Practice') },
              ]}
              value={mode === 'practice' ? 'practice' : 'list'}
              onChange={(v) => (setMode(v), setSeen({}))}
            />
          ) : undefined
        }
      />
      {practice && <div className="-mt-1 mb-2 text-[12.5px] text-fg-3">{tr('Say what each word means, then tap to check.')}</div>}
      <ul className="m-0 list-none p-0">
        {list.map((w, i) => {
          const hidden = practice && !seen[i];
          return (
            <li key={i} className="flex gap-3 border-b border-line/70 py-3 first:pt-1 last:border-b-0 last:pb-0">
              {anyPic && <Pic src={w.image} alt={w.word} className="h-14 w-14 shrink-0 rounded-lg" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span lang={code || undefined} className="text-[18px] leading-tight font-semibold">
                    {w.word}
                  </span>
                  {done && <SpeakBtn text={w.word} lang={code || undefined} className="-my-1" />}
                  {w.phonetic && <span className="text-[13px] text-fg-3">{w.phonetic}</span>}
                  {w.pos && <Chip className="ml-auto">{w.pos}</Chip>}
                </div>
                <div className="mt-1 text-[14px]">
                  {hidden ? (
                    <button type="button" onClick={() => setSeen((s) => ({ ...s, [i]: true }))} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-line-2 px-2 py-0.5 text-[12.5px] font-medium text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
                      <Eye size={13} />
                      {tr('Show the meaning')}
                    </button>
                  ) : (
                    <span className="text-fg-2">{w.translation}</span>
                  )}
                </div>
                {w.example && (
                  <div className="mt-2 rounded-lg bg-bg-1 px-2.5 py-1.5 text-[13px]">
                    <div className="flex items-start gap-1">
                      <span lang={code || undefined} className="min-w-0 flex-1 pt-0.5">
                        {w.example}
                      </span>
                      {done && <SpeakBtn text={w.example} lang={code || undefined} className="-my-0.5 -mr-1" />}
                    </div>
                    {w.exampleTr && !hidden && <div className="text-fg-3">{w.exampleTr}</div>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {practice && list.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-fg-3">
          <span className="tabular-nums">{tr('{0} of {1} checked').replace('{0}', String(revealed)).replace('{1}', String(list.length))}</span>
          {revealed > 0 && (
            <button type="button" onClick={() => setSeen({})} className="inline-flex items-center gap-1 font-medium transition-colors hover:text-fg">
              <RotateCcw size={12} />
              {tr('Hide them again')}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

// ---- a translation ---------------------------------------------------------------------------------------------------

function TextPane({ label, code, text, done, accent, chip }: { label: string; code: string; text: string; done: boolean; accent?: boolean; chip?: string }) {
  return (
    <div className={cx('flex min-w-0 flex-col rounded-xl border px-3.5 pt-2.5 pb-3.5', accent ? 'border-accent/35 bg-accent-soft/35' : 'border-line bg-bg-1')}>
      <div className="mb-1 flex min-h-7 items-center gap-2">
        <span className="min-w-0 truncate text-[12px] font-semibold text-fg-3">{label}</span>
        {done && text && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <SpeakBtn text={text} lang={code || undefined} />
            <Copy text={text} />
          </span>
        )}
      </div>
      <p lang={code || undefined} className="m-0 text-[15.5px] leading-relaxed whitespace-pre-wrap">
        {text}
      </p>
      {chip && (
        <div className="mt-2.5">
          <Chip tone="accent">{chip}</Chip>
        </div>
      )}
    </div>
  );
}

function Translation({ data, done }: { data: Data; done: boolean }) {
  const from = langCode(data.from);
  const to = langCode(data.to);
  const source = str(data.source ?? data.text ?? data.original);
  const target = str(data.translation ?? data.target ?? data.translated);
  const alternatives = arr(data.alternatives)
    .map((a) => (isObj(a) ? { text: str(a.text), note: str(a.note) } : { text: str(a), note: '' }))
    .filter((a) => a.text);
  const notes = arr(data.notes).map((x) => textOf(x)).filter(Boolean);
  return (
    <Card>
      {(source || target) && (
        <div className="grid gap-2.5 @lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <TextPane label={langName(data.from) || tr('Original')} code={from} text={source} done={done} />
          <div className="hidden place-items-center text-fg-3 @lg:grid" aria-hidden>
            <ArrowRight size={16} />
          </div>
          <TextPane label={langName(data.to) || tr('Translation')} code={to} text={target} done={done} accent chip={str(data.formality)} />
        </div>
      )}
      {str(data.literal) && (
        <div className="mt-3 text-[13px]">
          <span className="aui-h4 mr-2">{tr('Word for word')}</span>
          <span className="text-fg-2">{str(data.literal)}</span>
        </div>
      )}
      {alternatives.length > 0 && (
        <Section title={tr('Other ways to say it')} className="mt-4">
          <ul className="m-0 list-none space-y-1.5 p-0">
            {alternatives.map((a, i) => (
              <li key={i} className="rounded-lg border border-line px-3 py-2">
                <div className="flex items-start gap-1">
                  <span lang={to || undefined} className="min-w-0 flex-1 pt-0.5 text-[14px]">
                    {a.text}
                  </span>
                  {done && (
                    <span className="-my-0.5 flex shrink-0 items-center gap-0.5">
                      <SpeakBtn text={a.text} lang={to || undefined} />
                      <Copy text={a.text} />
                    </span>
                  )}
                </div>
                {a.note && <Md text={a.note} className="mt-0.5 text-[12.5px] text-fg-3" />}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {notes.length > 0 && (
        <Section title={tr('Notes')} className="mt-4">
          <ul className="m-0 list-disc space-y-1 pl-5 text-[13.5px] text-fg-2">
            {notes.map((x, i) => (
              <li key={i}>
                <Md text={x} inline />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Card>
  );
}

// ---- research papers -------------------------------------------------------------------------------------------------

function PaperItem({ p, done }: { p: Data; done: boolean }) {
  const [open, setOpen] = useState<'' | 'abstract' | 'bibtex'>('');
  const title = str(p.title);
  const authors = words(p.authors);
  const shownAuthors = authors.length > 6 ? `${authors.slice(0, 5).join(', ')} ${tr('and {0} more').replace('{0}', String(authors.length - 5))}` : authors.join(', ');
  const venue = [str(p.venue), str(p.year)].filter(Boolean).join(' ');
  const cites = num(p.citations ?? p.cited_by);
  const url = str(p.url ?? p.link) || (str(p.doi) ? `https://doi.org/${str(p.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}` : '');
  const findings = arr(p.findings ?? p.results).map((f) => textOf(f)).filter(Boolean);
  const tags = words(p.tags);
  const abstract = str(p.abstract);
  const bibtex = str(p.bibtex).trim();
  const ask = useAsk();
  return (
    <article className="px-4 py-4 @lg:px-5">
      <h4 className="m-0 text-[15px] leading-snug font-semibold">
        {/^https?:\/\//i.test(url) ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-fg hover:text-accent hover:underline">
            {title}
          </a>
        ) : (
          title
        )}
      </h4>
      {shownAuthors && (
        <div className="mt-0.5 text-[12.5px] text-fg-2" title={authors.length > 6 ? authors.join(', ') : undefined}>
          {shownAuthors}
        </div>
      )}
      {(venue || cites !== null) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-3">
          {venue && (
            <span className="inline-flex items-center gap-1 font-medium text-fg-2">
              <BookOpen size={12} className="text-fg-3" />
              {venue}
            </span>
          )}
          {cites !== null && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Quote size={11} />
              {tr('{0} citations').replace('{0}', fmtNum(cites))}
            </span>
          )}
        </div>
      )}
      {str(p.tldr) && (
        <div className="mt-2.5 flex items-start gap-2 text-[13.5px]">
          <span className="mt-[3px] shrink-0 rounded bg-accent-soft px-1.5 text-[10.5px] leading-[17px] font-semibold whitespace-nowrap text-accent">{tr('In short')}</span>
          <Md text={p.tldr} inline className="min-w-0" />
        </div>
      )}
      {findings.length > 0 && (
        <ul className="m-0 mt-2 list-none space-y-1 p-0 text-[13px] text-fg-2">
          {findings.map((f, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-fg-3/70" />
              <Md text={f} inline className="min-w-0" />
            </li>
          ))}
        </ul>
      )}
      {tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <Chip key={i}>{t}</Chip>
          ))}
        </div>
      )}
      {(str(p.pdf) || str(p.code) || abstract || bibtex) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {/^https?:\/\//i.test(str(p.pdf)) && (
            <LinkButton href={str(p.pdf)} icon={<FileText size={13} />}>
              PDF
            </LinkButton>
          )}
          {/^https?:\/\//i.test(str(p.code)) && (
            <LinkButton href={str(p.code)} icon={<Code2 size={13} />}>
              {tr('Code')}
            </LinkButton>
          )}
          {abstract && (
            <SmallButton on={open === 'abstract'} disabled={!done} onClick={() => setOpen((o) => (o === 'abstract' ? '' : 'abstract'))} icon={<ChevronDown size={13} className={cx('transition-transform', open === 'abstract' && 'rotate-180')} />}>
              {tr('Abstract')}
            </SmallButton>
          )}
          {bibtex && (
            <SmallButton on={open === 'bibtex'} disabled={!done} onClick={() => setOpen((o) => (o === 'bibtex' ? '' : 'bibtex'))} icon={<Quote size={12} />}>
              BibTeX
            </SmallButton>
          )}
          {done && title && (
            <SmallButton onClick={() => ask(tr('Tell me more about the paper “{0}”.').replace('{0}', title))} icon={<MessageSquarePlus size={13} />}>
              {tr('Ask about it')}
            </SmallButton>
          )}
        </div>
      )}
      {open === 'abstract' && abstract && <Md text={abstract} className="mt-3 rounded-xl bg-bg-1 px-3.5 py-3 text-[13px] leading-relaxed text-fg-2" />}
      {open === 'bibtex' && bibtex && (
        <div className="mt-3">
          <CodeBlock code={bibtex} lang="bibtex" maxHeight={260} />
        </div>
      )}
    </article>
  );
}

function Papers({ data, done }: { data: Data; done: boolean }) {
  const papers = arr(data.papers ?? data.items)
    .filter(isObj)
    .filter((p) => str(p.title));
  if (!papers.length && !str(data.title)) return <Card>{null}</Card>;
  return (
    <Card pad={false} className="overflow-hidden">
      {str(data.title) && <Head title={data.title} className="mb-0 px-4 pt-4 @lg:px-5" />}
      <div className="divide-y divide-line/70">
        {papers.map((p, i) => (
          <PaperItem key={i} p={p} done={done} />
        ))}
      </div>
    </Card>
  );
}

// ---- a tree ------------------------------------------------------------------------------------------------------------

interface TreeNode {
  name: string;
  note: string;
  icon: string;
  /** Its children; null for a leaf (an empty list is a folder with nothing in it). */
  kids: TreeNode[] | null;
}

function treeNode(v: unknown, depth = 0): TreeNode | null {
  if (depth > 16) return null;
  if (typeof v === 'string' || typeof v === 'number') return str(v) ? { name: str(v), note: '', icon: '', kids: null } : null;
  if (!isObj(v)) return null;
  const raw = v.children ?? v.items ?? v.nodes;
  const kids = Array.isArray(raw) ? arr(raw).map((c) => treeNode(c, depth + 1)).filter((c): c is TreeNode => !!c) : null;
  const name = str(v.name ?? v.title ?? v.label ?? v.text);
  if (!name && !kids?.length) return null;
  return { name, note: str(v.note ?? v.description ?? v.role), icon: str(v.icon), kids };
}

const CODE_EXT = /^(py|ts|tsx|js|jsx|mjs|cjs|rs|go|java|kt|kts|scala|c|h|cc|cpp|hpp|cs|rb|php|swift|m|mm|r|jl|lua|pl|dart|ex|exs|erl|hs|ml|clj|vue|svelte|astro|html|htm|css|scss|sass|less|sql|ipynb|wasm|zig|nim|proto|graphql)$/;
const DATA_EXT = /^(json|jsonl|ndjson|geojson)$/;
const CONF_EXT = /^(yaml|yml|toml|ini|cfg|conf|env|lock|xml|plist|properties|editorconfig|gitignore|dockerignore|dockerfile|makefile)$/;
const SHEET_EXT = /^(csv|tsv|xls|xlsx|ods|parquet|arrow|feather)$/;
const IMAGE_EXT = /^(png|jpe?g|gif|svg|webp|avif|ico|bmp|tiff?|heic)$/;
const ARCHIVE_EXT = /^(zip|tar|gz|tgz|bz2|xz|7z|rar|zst|whl|jar)$/;
const AUDIO_EXT = /^(mp3|wav|ogg|flac|m4a|aac|opus)$/;
const VIDEO_EXT = /^(mp4|mov|webm|mkv|avi|m4v)$/;
const SHELL_EXT = /^(sh|bash|zsh|fish|ps1|bat|cmd)$/;

/** A file's icon, from its name. */
function fileIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  const ext = (/\.([a-z0-9]+)$/.exec(n)?.[1] ?? (/^(dockerfile|makefile)$/.test(n) ? n : '')) || '';
  if (CODE_EXT.test(ext)) return FileCode;
  if (DATA_EXT.test(ext)) return FileJson;
  if (CONF_EXT.test(ext) || n.startsWith('.')) return FileCog;
  if (SHEET_EXT.test(ext)) return FileSpreadsheet;
  if (IMAGE_EXT.test(ext)) return FileImage;
  if (ARCHIVE_EXT.test(ext)) return FileArchive;
  if (AUDIO_EXT.test(ext)) return FileAudio;
  if (VIDEO_EXT.test(ext)) return FileVideo;
  if (SHELL_EXT.test(ext)) return FileTerminal;
  if (/^(md|mdx|txt|rst|pdf|docx?|odt|rtf|tex|org)$/.test(ext) || /^(readme|license|changelog|notice)/.test(n)) return FileText;
  return File;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase() ?? '')
    .join('');

function TreeRow({ node, path, depth, number, kind, isOpen, toggle, done }: { node: TreeNode; path: string; depth: number; number: string; kind: string; isOpen: (path: string, depth: number) => boolean; toggle: (path: string, depth: number) => void; done: boolean }) {
  const folder = node.kids !== null;
  const hasKids = !!node.kids?.length;
  const open = hasKids && isOpen(path, depth);
  const files = kind === 'files';
  const FolderIcon = open ? FolderOpen : Folder;
  const Icon = files ? (folder ? FolderIcon : fileIcon(node.name)) : null;
  return (
    <li role="treeitem" aria-expanded={hasKids ? open : undefined} aria-selected={false}>
      <div className="flex min-w-0 items-start gap-1.5 rounded-md py-[3px] pr-2 hover:bg-bg-1" style={{ paddingLeft: depth * 18 + 2 }}>
        {hasKids ? (
          <button type="button" disabled={!done} onClick={() => toggle(path, depth)} aria-label={open ? tr('Fold') : tr('Unfold')} className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded text-fg-3 transition-colors hover:text-fg">
            <ChevronRight size={13} className={cx('transition-transform', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        {node.icon ? (
          <span className="mt-px w-4 shrink-0 text-center text-[13px] leading-[18px]" aria-hidden>
            {node.icon}
          </span>
        ) : Icon ? (
          <Icon size={15} className={cx('mt-[2px] shrink-0', folder ? 'text-accent' : 'text-fg-3')} aria-hidden />
        ) : kind === 'org' ? (
          <span className="mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-accent-soft text-[9px] font-semibold text-accent" aria-hidden>
            {initials(node.name)}
          </span>
        ) : kind === 'outline' ? (
          <span className="mt-px shrink-0 text-[12px] leading-[18px] font-medium text-fg-3 tabular-nums">{number}</span>
        ) : (
          <span className={cx('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', depth === 0 ? 'bg-accent' : 'bg-fg-3/60')} aria-hidden />
        )}
        <span className="min-w-0 leading-[20px]">
          <span className={cx(files ? 'font-mono text-[12.5px]' : 'text-[13.5px]', (folder || depth === 0) && !files ? 'font-semibold' : folder ? 'font-medium' : '')}>{node.name}</span>
          {node.note && (
            <span className="text-[12.5px] text-fg-3">
              {files ? '  ' : ' · '}
              <Md text={node.note} inline />
            </span>
          )}
        </span>
      </div>
      {open && (
        <ul role="group" className="relative m-0 list-none p-0">
          <span className="absolute top-0 bottom-1 w-px bg-line" style={{ left: depth * 18 + 9 }} aria-hidden />
          {node.kids!.map((c, i) => (
            <TreeRow key={i} node={c} path={`${path}.${i}`} depth={depth + 1} number={`${number}.${i + 1}`} kind={kind} isOpen={isOpen} toggle={toggle} done={done} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Tree({ data, done }: { data: Data; done: boolean }) {
  const kind = str(data.kind).toLowerCase();
  const given = data.root ?? data.nodes ?? data.items ?? data.tree;
  const roots = (Array.isArray(given) ? arr(given) : given !== undefined ? [given] : []).map((n) => treeNode(n)).filter((n): n is TreeNode => !!n);
  const [opened, setOpened] = useKept<Record<string, boolean>>('open', {});
  // Folders with children, by path, and how many nodes there are: a small tree starts all open, a big one two levels deep.
  const { folders, total } = useMemo(() => {
    const out: { path: string; depth: number }[] = [];
    let count = 0;
    const walk = (list: TreeNode[], prefix: string, depth: number) =>
      list.forEach((nd, i) => {
        count++;
        const path = prefix ? `${prefix}.${i}` : String(i);
        if (nd.kids?.length) {
          out.push({ path, depth });
          walk(nd.kids, path, depth + 1);
        }
      });
    walk(roots, '', 0);
    return { folders: out, total: count };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data.root ?? data.nodes ?? data.items ?? data.tree ?? null)]);
  const isOpen = (path: string, depth: number) => opened[path] ?? (total <= 60 || depth < 2);
  const toggle = (path: string, depth: number) => setOpened((o) => ({ ...o, [path]: !(o[path] ?? (total <= 60 || depth < 2)) }));
  // Folding all keeps a single root open, so its first level still shows.
  const setAll = (open: boolean) => setOpened(Object.fromEntries(folders.map((f) => [f.path, open || (f.depth === 0 && roots.length === 1)])));
  const foldable = done && folders.length > 1;
  const allOpen = folders.every((f) => isOpen(f.path, f.depth));
  return (
    <Card>
      <Head
        title={data.title}
        aside={
          foldable ? (
            allOpen ? (
              <SmallButton onClick={() => setAll(false)} icon={<ChevronsDownUp size={13} />}>
                {tr('Fold all')}
              </SmallButton>
            ) : (
              <SmallButton onClick={() => setAll(true)} icon={<ChevronsUpDown size={13} />}>
                {tr('Unfold all')}
              </SmallButton>
            )
          ) : undefined
        }
      />
      <ul role="tree" className="m-0 -mx-1 list-none overflow-x-auto p-0">
        {roots.map((nd, i) => (
          <TreeRow key={i} node={nd} path={String(i)} depth={0} number={String(i + 1)} kind={kind} isOpen={isOpen} toggle={toggle} done={done} />
        ))}
      </ul>
    </Card>
  );
}

// ---- resources to learn from -------------------------------------------------------------------------------------------

const LINK_KINDS: Record<string, { icon: LucideIcon; label: () => string }> = {
  article: { icon: Newspaper, label: () => tr('Article') },
  video: { icon: CirclePlay, label: () => tr('Video') },
  course: { icon: GraduationCap, label: () => tr('Course') },
  tool: { icon: Wrench, label: () => tr('Tool') },
  docs: { icon: BookMarked, label: () => tr('Docs') },
  book: { icon: BookOpen, label: () => tr('Book') },
  repo: { icon: Code2, label: () => tr('Code') },
  paper: { icon: ScrollText, label: () => tr('Paper') },
};

function Links({ data, done }: { data: Data; done: boolean }) {
  const links = arr(data.links ?? data.items ?? data.resources)
    .filter(isObj)
    .map((l) => ({
      title: str(l.title ?? l.name),
      url: str(l.url ?? l.link ?? l.href),
      description: str(l.description ?? l.note),
      kind: str(l.kind ?? l.type).toLowerCase(),
      free: l.free === undefined || l.free === null ? null : typeof l.free === 'string' ? (/^(paid|no|false)$/i.test(l.free.trim()) ? false : yes(l.free) ? true : null) : !!l.free,
      level: str(l.level),
    }))
    .filter((l) => l.title || l.url);
  const kinds = [...new Set(links.map((l) => l.kind).filter(Boolean))];
  const [filter, setFilter] = useKept<string>('kind', '');
  const on = done && kinds.includes(filter) ? filter : '';
  const shown = on ? links.filter((l) => l.kind === on) : links;
  return (
    <Card>
      <Head title={data.title} />
      {done && kinds.length > 1 && links.length > 3 && (
        <div className="-mt-0.5 mb-2.5 flex flex-wrap gap-1.5">
          {['', ...kinds].map((k) => (
            <button
              key={k || 'all'}
              type="button"
              onClick={() => setFilter(k)}
              className={cx('rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors', on === k ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line text-fg-2 hover:bg-bg-2')}
            >
              {k ? (LINK_KINDS[k]?.label() ?? k) : tr('All')}
              <span className="ml-1 text-fg-3 tabular-nums">{k ? links.filter((l) => l.kind === k).length : links.length}</span>
            </button>
          ))}
        </div>
      )}
      <ul className="m-0 -mx-2 list-none space-y-0.5 p-0">
        {shown.map((l, i) => {
          const K = LINK_KINDS[l.kind];
          const Icon = K?.icon ?? Link2;
          const site = hostOf(l.url);
          return (
            <li key={i} className="flex gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-bg-1">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-2 text-fg-2" title={K?.label() ?? l.kind}>
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {/^https?:\/\//i.test(l.url) ? (
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-fg hover:text-accent hover:underline">
                      {l.title || site}
                    </a>
                  ) : (
                    <span className="font-semibold">{l.title}</span>
                  )}
                  {site && <span className="text-[12px] text-fg-3">{site}</span>}
                </div>
                {l.description && <Md text={l.description} className="mt-0.5 text-[13px] text-fg-2" />}
                {(K || l.level || l.free !== null) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {K && <Chip>{K.label()}</Chip>}
                    {l.level && <Chip tone="info">{l.level}</Chip>}
                    {l.free === true && <Chip tone="good">{tr('Free')}</Chip>}
                    {l.free === false && <Chip>{tr('Paid')}</Chip>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export const LEARN_UIS: Record<string, AnswerUiView> = {
  quiz: Quiz,
  flashcards: Flashcards,
  solution: Solution,
  explainer: Explainer,
  vocabulary: Vocabulary,
  translation: Translation,
  paper: Papers,
  tree: Tree,
  links: Links,
};
