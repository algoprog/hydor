// The answer UIs for learning: their views, by name (shared/answer-ui/learn.ts has what each takes).
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleCheck,
  CirclePlay,
  Code2,
  Eraser,
  Eye,
  EyeOff,
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
  FlipVertical2,
  Folder,
  FolderOpen,
  GraduationCap,
  GripVertical,
  Languages,
  Lightbulb,
  Link2,
  MessageSquarePlus,
  MessageSquareText,
  Newspaper,
  Play,
  Quote,
  RotateCcw,
  ScrollText,
  Send,
  Shuffle,
  Square,
  Target,
  Wrench,
  X,
} from 'lucide-react';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { CodeBlock } from '../../Markdown';
import { normalizeMath } from '../../markdown-math';
import { cx } from '../../ui';
import { arr, Avatar, Btn, Card, Chip, Copy, fmtNum, Head, hostOf, isObj, Md, num, Pic, Ring, Section, Seg, seriesColor, SpeakBtn, str, textOf, useAsk, useKept, usePicOk, words, yes, type AnswerUiView, type Data } from '../kit';

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
  const hasImage = usePicOk(image);
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
        <div className={cx('grid gap-4', hasImage && '@lg:grid-cols-[minmax(0,1fr)_minmax(0,200px)]')}>
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

// ---- what the exercises share ------------------------------------------------------------------------------------------

/** An answer as a learner's is compared: without case, accents or extra spaces, curly quotes as straight ones. */
const loose = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[‘’ʼ´`]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
/** The same with its accents kept: to tell an answer that is right but for its accents. */
const strict = (s: string) =>
  s
    .normalize('NFC')
    .replace(/[‘’ʼ´`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

/** A text's number (FNV-1a): for an order that looks shuffled and is the same every time. */
function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * 0 … n−1 in an order that looks shuffled: the same each time for one `seed`, and never the order given (n > 1). By each
 * place's own number, so while the list streams in the ones that come slot in and the others keep their order.
 */
function shuffled(n: number, seed: string): number[] {
  const out = Array.from({ length: n }, (_, i) => i).sort((a, b) => hashOf(`${seed}#${a}`) - hashOf(`${seed}#${b}`) || a - b);
  if (n > 1 && out.every((v, i) => v === i)) out.push(out.shift()!);
  return out;
}

/** Markdown as a short line of plain text, for what goes to the message box. */
function plainOf(s: string, max = 80): string {
  const t = s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Fills {0}, {1}… of words the app says. */
const fill = (s: string, ...v: (string | number)[]) => v.reduce<string>((out, x, i) => out.replace(`{${i}}`, String(x)), s);

/** Right or wrong, as a small round mark. */
function Mark({ ok, className }: { ok: boolean; className?: string }) {
  return (
    <span role="img" aria-label={ok ? tr('Right') : tr('Wrong')} className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full', ok ? 'bg-ok/15 text-ok' : 'bg-err/15 text-err', className)}>
      {ok ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
    </span>
  );
}

/** Where an exercise ends: the score on a ring, what it means, and what to do next. */
function Outcome({ score, total, text, children }: { score: number; total: number; text: string; children: ReactNode }) {
  const share = total ? score / total : 0;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-bg-1 p-3.5">
      <Ring value={score} max={total || 1} size={56} stroke={5} tone={share >= 0.7 ? 'good' : share >= 0.4 ? 'warn' : 'bad'}>
        <span className="text-[13.5px] font-semibold tabular-nums">{`${score}/${total}`}</span>
      </Ring>
      <div className="min-w-[150px] flex-1 font-semibold">{text}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** Where an exercise's item will be, while the reply still writes them: in the order they come they would give the answer away. */
const Pending = ({ className }: { className?: string }) => <span className={cx('block h-2.5 rounded-full bg-bg-3', className)} aria-hidden />;

/** A title for what goes to the message box: “Photosynthesis”: … */
const headOf = (data: Data) => (str(data.title).trim() ? `“${str(data.title).trim()}”: ` : '');

// ---- fill in the blanks ------------------------------------------------------------------------------------------------

/** The text's Markdown with each [[answer|another]] made a link to its box, and each blank's accepted answers. */
function clozeOf(text: string, done: boolean): { md: string; blanks: string[][] } {
  let t = text;
  // While it streams, a blank still being written is left out: its answer would show.
  if (!done) {
    const open = t.lastIndexOf('[[');
    if (open >= 0 && !t.includes(']]', open)) t = t.slice(0, open);
    t = t.replace(/\[$/, '');
  }
  const blanks: string[][] = [];
  const md = t.replace(/\[\[([^[\]\n]+?)\]\]/g, (whole, inner: string) => {
    const answers = inner
      .split('|')
      .map((a) => a.trim())
      .filter(Boolean);
    if (!answers.length) return whole;
    blanks.push(answers);
    return `[_](#aui-blank-${blanks.length - 1})`;
  });
  return { md, blanks };
}

const isRight = (value: string, answers: string[]) => !!value.trim() && answers.some((a) => loose(a) === loose(value));

interface ClozeState {
  blanks: string[][];
  values: Record<number, string>;
  /** Filled by tapping words of the bank (else typed). */
  bank: boolean;
  checked: boolean;
  shown: boolean;
  /** Answers may be given: the block is whole and not checked yet. */
  live: boolean;
  /** The blank a tapped word goes to. */
  active: number;
  type: (i: number, v: string) => void;
  tapBlank: (i: number) => void;
  check: () => void;
}

const ClozeCtx = createContext<ClozeState | null>(null);

/** A blank in the text: a box to type in, a slot a word of the bank goes to, or once checked the answer marked. */
function BlankBox({ i }: { i: number }) {
  const c = useContext(ClozeCtx);
  if (!c) return null;
  const answers = c.blanks[i] ?? [];
  const value = c.values[i] ?? '';
  const label = fill(tr('Blank {0}'), i + 1);
  if (c.checked) {
    const right = isRight(value, answers);
    // Right but for its accents: the spelling is shown beside it.
    const spelling = right && !answers.some((a) => strict(a) === strict(value));
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-1">
        <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 leading-[1.65] font-medium', right ? 'border-ok/45 bg-ok/10' : 'border-err/45 bg-err/10')}>
          {right ? <Check size={12} strokeWidth={3} className="shrink-0 text-ok" aria-label={tr('Right')} /> : <X size={12} strokeWidth={3} className="shrink-0 text-err" aria-label={tr('Wrong')} />}
          <span className={cx(!right && c.shown && value.trim() && 'text-fg-3 line-through')}>{value.trim() || '—'}</span>
        </span>
        {((!right && c.shown) || spelling) && <span className="font-semibold text-ok">{answers[0]}</span>}
      </span>
    );
  }
  if (c.bank)
    return (
      <button
        type="button"
        disabled={!c.live}
        onClick={() => c.tapBlank(i)}
        aria-label={value ? `${label}: ${value}` : label}
        title={value && c.live ? tr('Tap to take the word out') : undefined}
        className={cx(
          'mx-0.5 inline-flex h-7 min-w-[68px] items-center justify-center rounded-md border px-2 align-baseline text-[14px] leading-none font-medium transition-colors',
          value ? 'border-line-2 bg-bg-2 text-fg hover:border-err/50' : 'border-dashed border-line-2 bg-bg-1 text-fg-3',
          c.live && c.active === i && 'border-solid border-accent ring-2 ring-accent/25',
        )}
      >
        {value || '\u00a0'}
      </button>
    );
  return (
    <input
      data-blank={i}
      value={value}
      disabled={!c.live}
      onChange={(e) => c.type(i, e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const next = e.currentTarget.closest('.aui-card')?.querySelector<HTMLInputElement>(`input[data-blank="${i + 1}"]`);
        if (next) next.focus();
        else c.check();
      }}
      aria-label={label}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      className="mx-0.5 h-7 rounded-md border border-line-2 bg-bg-1 px-1.5 text-center align-baseline text-[14px] font-medium text-fg transition-colors outline-none focus:border-accent focus:bg-panel disabled:opacity-60"
      style={{ width: `${Math.min(24, Math.max(7, [...value].length + 2))}ch` }}
    />
  );
}

const mdRemark = [remarkGfm, [remarkMath, { singleDollarTextMath: true }]] as any;
const mdRehype = [[rehypeKatex, { throwOnError: false, strict: 'ignore', output: 'html' }]] as any;
/** The text's links, with the blanks' boxes drawn in place of theirs. */
const clozeParts = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => {
    const m = /^#aui-blank-(\d+)$/.exec(href ?? '');
    if (m) return <BlankBox i={Number(m[1])} />;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
} as any;

function FillBlanks({ data, done }: { data: Data; done: boolean }) {
  const text = str(data.text ?? data.passage ?? data.body);
  const cloze = useMemo(() => clozeOf(text, done), [text, done]);
  const n = cloze.blanks.length;
  const given = words(data.words ?? data.bank ?? data.word_bank);
  // The bank, in alphabetical order, with any answer it lacks (once whole), so every blank can be filled from it.
  const bank = useMemo(() => {
    if (!given.length) return [] as string[];
    const list = [...given];
    if (done) {
      const left = new Map<string, number>();
      for (const w of list) left.set(loose(w), (left.get(loose(w)) ?? 0) + 1);
      for (const b of cloze.blanks) {
        const hit = b.find((a) => (left.get(loose(a)) ?? 0) > 0);
        if (hit) left.set(loose(hit), left.get(loose(hit))! - 1);
        else list.push(b[0]);
      }
    }
    return list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [given.join('\u0000'), cloze.blanks, done]);
  const hints = arr(data.hints ?? (data.hint ? [data.hint] : []))
    .map((h) => textOf(h))
    .filter(Boolean);
  const [kept, setKept] = useKept<Record<number, string>>('blanks', {});
  const [checked, setChecked] = useKept<boolean>('checked', false);
  const [shown, setShown] = useKept<boolean>('shown', false);
  const [hintsOpen, setHintsOpen] = useKept<number>('hints', 0);
  const [active, setActive] = useState(0);
  const ask = useAsk();
  const values = useMemo(() => {
    const out: Record<number, string> = {};
    if (isObj(kept)) for (let i = 0; i < n; i++) if (typeof kept[i] === 'string') out[i] = kept[i];
    return out;
  }, [kept, n]);
  const isChecked = done && n > 0 && !!checked;
  const live = done && !isChecked;
  const valueOf = (i: number) => (values[i] ?? '').trim();
  const right = (i: number) => isRight(values[i] ?? '', cloze.blanks[i] ?? []);
  const score = cloze.blanks.filter((_, i) => right(i)).length;
  const filled = cloze.blanks.filter((_, i) => valueOf(i)).length;
  const act = Math.min(Math.max(0, active), Math.max(0, n - 1));
  /** The first empty blank from `from` on, round to the start; -1 when all are filled. */
  const emptyFrom = (vals: Record<number, string>, from: number) => {
    for (let k = 0; k < n; k++) {
      const j = (from + k) % n;
      if (!(vals[j] ?? '').trim()) return j;
    }
    return -1;
  };
  const check = () => {
    if (!live || !filled) return;
    setChecked(true);
    setShown(false);
  };
  const ctx: ClozeState = {
    blanks: cloze.blanks,
    values,
    bank: bank.length > 0,
    checked: isChecked,
    shown: isChecked && !!shown,
    live,
    active: act,
    type: (i, v) => setKept({ ...values, [i]: v }),
    tapBlank: (i) => {
      if (!live) return;
      if (valueOf(i)) setKept({ ...values, [i]: '' });
      setActive(i);
    },
    check,
  };
  // Which words of the bank are in a blank (a word given twice is used up twice).
  const used = useMemo(() => {
    const inBlanks = new Map<string, number>();
    for (let i = 0; i < n; i++) if ((values[i] ?? '').trim()) inBlanks.set(loose(values[i]), (inBlanks.get(loose(values[i])) ?? 0) + 1);
    return bank.map((w) => {
      const k = loose(w);
      const c = inBlanks.get(k) ?? 0;
      if (!c) return false;
      inBlanks.set(k, c - 1);
      return true;
    });
  }, [bank, values, n]);
  const tapWord = (w: string) => {
    if (!live || !n) return;
    const at = !valueOf(act) ? act : emptyFrom(values, act) >= 0 ? emptyFrom(values, act) : act;
    const next = { ...values, [at]: w };
    setKept(next);
    const after = emptyFrom(next, (at + 1) % n);
    setActive(after >= 0 ? after : at);
  };
  const retry = () => {
    setKept(Object.fromEntries(Object.entries(values).filter(([k]) => right(Number(k)))));
    setChecked(false);
    setShown(false);
    setActive(Math.max(0, cloze.blanks.findIndex((_, i) => !right(i))));
  };
  const restart = () => {
    setKept({});
    setChecked(false);
    setShown(false);
    setHintsOpen(0);
    setActive(0);
  };
  const send = () => {
    const missed = cloze.blanks.map((b, i) => ({ b, v: valueOf(i), ok: right(i) })).filter((x) => !x.ok);
    ask(`${headOf(data)}${fill(tr('I got {0} of {1} blanks right.'), score, n)}${missed.length ? ` ${tr('My mistakes:')} ${missed.map((x) => `${x.v || '—'} → ${x.b[0]}`).join('; ')}` : ''}`);
  };
  const body = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={mdRemark} rehypePlugins={mdRehype} components={clozeParts}>
        {normalizeMath(cloze.md, true)}
      </ReactMarkdown>
    ),
    [cloze.md],
  );
  const hintCount = Math.min(Math.max(0, num(hintsOpen) ?? 0), hints.length);
  const prompt = str(data.prompt ?? data.instructions);
  return (
    <Card>
      <Head title={data.title} aside={n > 1 && !isChecked && filled > 0 ? <span className="text-[12px] text-fg-3 tabular-nums">{`${filled}/${n}`}</span> : undefined} />
      {prompt && <Md text={prompt} className="-mt-1 mb-3 text-[13.5px] text-fg-2" />}
      {cloze.md.trim() && (
        <ClozeCtx.Provider value={ctx}>
          <div className="aui-md text-[15px] leading-[2.2]">{body}</div>
        </ClozeCtx.Provider>
      )}
      {done && bank.length > 0 && !isChecked && (
        <div className="mt-3 flex flex-wrap gap-1.5 rounded-xl bg-bg-1 p-2.5" role="group" aria-label={tr('Words to use')}>
          {bank.map((w, k) => (
            <button
              key={k}
              type="button"
              disabled={!live || used[k]}
              onClick={() => tapWord(w)}
              className={cx(
                'rounded-lg border px-2.5 py-1 text-[13.5px] font-medium transition-colors',
                used[k] ? 'border-dashed border-line-2 bg-transparent text-fg-3 opacity-50' : 'border-line-2 bg-panel text-fg hover:border-accent hover:bg-accent-soft',
              )}
            >
              {w}
            </button>
          ))}
        </div>
      )}
      {hints.length > 0 && (hintCount > 0 || (done && !isChecked)) && (
        <div className="mt-3 space-y-1.5">
          {hints.slice(0, hintCount).map((h, k) => (
            <div key={k} className="flex gap-2 text-[13px] text-fg-2">
              <Lightbulb size={14} className="mt-[3px] shrink-0 text-accent" />
              <Md text={h} className="min-w-0" />
            </div>
          ))}
          {done && !isChecked && hintCount < hints.length && (
            <button type="button" onClick={() => setHintsOpen(hintCount + 1)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-fg-3 transition-colors hover:text-fg">
              <Lightbulb size={13} />
              {hintCount ? tr('Another hint') : tr('Show a hint')}
            </button>
          )}
        </div>
      )}
      {n > 0 && !isChecked && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Btn primary icon={<Check size={14} />} disabled={!live || !filled} onClick={check}>
            {tr('Check')}
          </Btn>
          {live && filled > 0 && (
            <Btn icon={<Eraser size={13} />} onClick={restart}>
              {tr('Clear')}
            </Btn>
          )}
        </div>
      )}
      {isChecked && (
        <Outcome score={score} total={n} text={score === n ? tr('All right. Well done!') : fill(tr('{0} of {1} right'), score, n)}>
          <Btn icon={<RotateCcw size={13} />} onClick={score < n ? retry : restart}>
            {score < n ? tr('Try again') : tr('Start over')}
          </Btn>
          {score < n && (
            <Btn icon={shown ? <EyeOff size={13} /> : <Eye size={13} />} onClick={() => setShown(!shown)}>
              {shown ? tr('Hide the answers') : tr('Show the answers')}
            </Btn>
          )}
          <Btn primary icon={<Send size={13} />} onClick={send}>
            {tr('Send my result')}
          </Btn>
        </Outcome>
      )}
    </Card>
  );
}

// ---- match the pairs ---------------------------------------------------------------------------------------------------

function pairsOf(data: Data): { left: string; right: string }[] {
  const out: { left: string; right: string }[] = [];
  for (const p of arr(data.pairs ?? data.items)) {
    if (Array.isArray(p)) out.push({ left: str(p[0]), right: str(p[1]) });
    else if (isObj(p)) out.push({ left: str(p.left ?? p.term ?? p.word ?? p.prompt ?? p.a), right: str(p.right ?? p.match ?? p.meaning ?? p.definition ?? p.answer ?? p.b) });
  }
  return out.filter((p) => p.left || p.right);
}

/** A pair's colour, by its left item: the palette's eight hues in their order, then a quiet one (the numbers tell them apart). */
const pairHue = (l: number) => (l < 8 ? seriesColor(l) : 'var(--fg-3)');

function MatchCell({ text, badge, hue, selected, live, mark, onClick }: { text: string; badge: ReactNode; hue: string | null; selected: boolean; live: boolean; mark?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={!live}
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'flex min-h-[44px] w-full min-w-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-[14px] leading-snug transition-colors',
        selected ? 'border-accent bg-accent-soft ring-2 ring-accent/30' : !hue && 'border-line',
        live && !selected && !hue && 'hover:border-line-2 hover:bg-bg-1',
      )}
      style={hue && !selected ? { background: `color-mix(in srgb, ${hue} 12%, transparent)`, borderColor: `color-mix(in srgb, ${hue} 60%, transparent)` } : undefined}
    >
      <span
        className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full px-1 text-[11.5px] font-semibold text-fg tabular-nums"
        style={{ boxShadow: hue ? `inset 0 0 0 2px ${hue}` : 'inset 0 0 0 1.5px var(--line-2)' }}
      >
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <Md text={text} inline />
      </span>
      {mark}
    </button>
  );
}

function Matching({ data, done }: { data: Data; done: boolean }) {
  const pairs = pairsOf(data).filter((p) => p.left && (p.right || !done));
  const n = pairs.length;
  const seed = `${str(data.title)}|${str(data.prompt)}`;
  const order = useMemo(() => shuffled(n, seed), [n, seed]);
  const [made, setMade] = useKept<Record<number, number>>('pairs', {});
  const [checked, setChecked] = useKept<boolean>('checked', false);
  const [shown, setShown] = useKept<boolean>('shown', false);
  const [sel, setSel] = useState<{ side: 'l' | 'r'; i: number } | null>(null);
  const ask = useAsk();
  // The pairs made that still fit the data: a left item to a right one, each at most once.
  const links = useMemo(() => {
    const out = new Map<number, number>();
    const taken = new Set<number>();
    if (isObj(made))
      for (const [k, v] of Object.entries(made)) {
        const l = Number(k);
        if (Number.isInteger(l) && l >= 0 && l < n && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n && !taken.has(v)) {
          out.set(l, v);
          taken.add(v);
        }
      }
    return out;
  }, [made, n]);
  const partner = new Map([...links].map(([l, r]) => [r, l]));
  const isChecked = done && n > 0 && !!checked;
  const isShown = isChecked && !!shown;
  const live = done && !isChecked;
  const good = (l: number) => links.has(l) && loose(pairs[links.get(l)!].right) === loose(pairs[l].right);
  const score = pairs.filter((_, l) => good(l)).length;
  const tap = (side: 'l' | 'r', i: number) => {
    if (!live) return;
    if (sel && sel.side === side && sel.i === i) return setSel(null);
    if (sel && sel.side !== side) {
      const l = side === 'l' ? i : sel.i;
      const r = side === 'r' ? i : sel.i;
      const next: Record<number, number> = {};
      for (const [a, b] of links) if (a !== l && b !== r) next[a] = b;
      // The same two again: taken apart.
      if (links.get(l) !== r) next[l] = r;
      setMade(next);
      setSel(null);
      return;
    }
    setSel({ side, i });
  };
  const retry = () => {
    setMade(Object.fromEntries([...links].filter(([l]) => good(l))));
    setChecked(false);
    setShown(false);
  };
  const restart = () => {
    setMade({});
    setChecked(false);
    setShown(false);
    setSel(null);
  };
  const send = () => {
    const wrong = pairs.map((p, l) => ({ p, l })).filter(({ l }) => !good(l));
    ask(
      `${headOf(data)}${fill(tr('I matched {0} of {1} pairs right.'), score, n)}${wrong.length ? ` ${tr('My mistakes:')} ${wrong.map(({ p, l }) => `${plainOf(p.left, 50)} → ${links.has(l) ? plainOf(pairs[links.get(l)!].right, 50) : '—'}`).join('; ')}` : ''}`,
    );
  };
  const columns = arr(data.columns ?? data.headings).map((c) => textOf(c));
  const prompt = str(data.prompt ?? data.instructions);
  return (
    <Card>
      <Head title={data.title} aside={n > 1 && !isChecked && links.size > 0 ? <span className="text-[12px] text-fg-3 tabular-nums">{`${links.size}/${n}`}</span> : undefined} />
      {prompt && <Md text={prompt} className="-mt-1 mb-3 text-[13.5px] text-fg-2" />}
      {n > 0 && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-2 @md:gap-x-4">
          {(columns[0] || columns[1]) && (
            <>
              <div className="aui-h4 px-1">{columns[0]}</div>
              <div className="aui-h4 px-1">{columns[1]}</div>
            </>
          )}
          {pairs.map((p, row) => {
            // Shown: each row a right pair, the left as the user matched it marked. Else the right side shuffled.
            const r = isShown ? row : order[row];
            const l = isShown ? partner.get(row) : partner.get(r);
            const rightHue = isShown ? pairHue(row) : l !== undefined ? pairHue(l) : null;
            return (
              <div key={row} className="contents">
                <MatchCell
                  text={p.left}
                  badge={row + 1}
                  hue={isShown || links.has(row) ? pairHue(row) : null}
                  selected={sel?.side === 'l' && sel.i === row}
                  live={live}
                  mark={isChecked ? <Mark ok={good(row)} /> : undefined}
                  onClick={() => tap('l', row)}
                />
                {done ? (
                  <MatchCell
                    text={pairs[r]?.right ?? ''}
                    badge={isShown ? row + 1 : l !== undefined ? l + 1 : ''}
                    hue={rightHue}
                    selected={sel?.side === 'r' && sel.i === r}
                    live={live}
                    onClick={() => tap('r', r)}
                  />
                ) : (
                  <div className="flex min-h-[44px] items-center rounded-xl border border-line px-3">
                    <Pending className="w-1/2" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {live && n > 1 && !links.size && !sel && <div className="mt-2.5 text-[12.5px] text-fg-3">{tr('Tap one on each side to pair them.')}</div>}
      {n > 0 && !isChecked && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Btn primary icon={<Check size={14} />} disabled={!live || !links.size} onClick={() => (setChecked(true), setShown(false), setSel(null))}>
            {tr('Check')}
          </Btn>
          {live && links.size > 0 && (
            <Btn icon={<Eraser size={13} />} onClick={restart}>
              {tr('Clear')}
            </Btn>
          )}
        </div>
      )}
      {isChecked && (
        <Outcome score={score} total={n} text={score === n ? tr('All right. Well done!') : fill(tr('{0} of {1} right'), score, n)}>
          <Btn icon={<RotateCcw size={13} />} onClick={score < n ? retry : restart}>
            {score < n ? tr('Try again') : tr('Start over')}
          </Btn>
          {score < n && (
            <Btn icon={shown ? <EyeOff size={13} /> : <Eye size={13} />} onClick={() => setShown(!shown)}>
              {shown ? tr('Hide the answers') : tr('Show the answers')}
            </Btn>
          )}
          <Btn primary icon={<Send size={13} />} onClick={send}>
            {tr('Send my result')}
          </Btn>
        </Outcome>
      )}
    </Card>
  );
}

// ---- put in order --------------------------------------------------------------------------------------------------------

function orderItemsOf(data: Data): { text: string; note: string }[] {
  return arr(data.items ?? data.steps ?? data.events)
    .map((x) => (isObj(x) ? { text: str(x.text ?? x.title ?? x.name ?? x.label), note: str(x.note ?? x.detail ?? x.date ?? x.value) } : { text: str(x), note: '' }))
    .filter((x) => x.text);
}

function Ordering({ data, done }: { data: Data; done: boolean }) {
  const items = orderItemsOf(data);
  const n = items.length;
  const seed = `${str(data.title)}|${str(data.prompt)}`;
  const start = useMemo(() => shuffled(n, seed), [n, seed]);
  const [kept, setKept] = useKept<number[] | null>('order', null);
  const [checked, setChecked] = useKept<boolean>('checked', false);
  const [shown, setShown] = useKept<boolean>('shown', false);
  const [dragging, setDragging] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const ask = useAsk();
  const order = Array.isArray(kept) && kept.length === n && new Set(kept).size === n && kept.every((i) => Number.isInteger(i) && i >= 0 && i < n) ? kept : start;
  const isChecked = done && n > 0 && !!checked;
  const isShown = isChecked && !!shown;
  const live = done && !isChecked;
  const inPlace = (pos: number) => loose(items[order[pos]].text) === loose(items[pos].text);
  const score = order.filter((_, p) => inPlace(p)).length;
  const move = (item: number, to: number) => {
    const from = order.indexOf(item);
    const t = Math.max(0, Math.min(n - 1, to));
    if (from < 0 || t === from) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(t, 0, item);
    setKept(next);
  };
  /** Moves an item and keeps the focus on it (its row is moved in the page, which can take the focus away). */
  const moveKeep = (item: number, to: number) => {
    move(item, to);
    requestAnimationFrame(() => rows.current[item]?.focus());
  };
  const onKey = (e: KeyboardEvent<HTMLLIElement>, item: number, pos: number) => {
    if (!live || e.target !== e.currentTarget) return;
    const to = e.key === 'ArrowUp' ? pos - 1 : e.key === 'ArrowDown' ? pos + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (to === null) return;
    e.preventDefault();
    moveKeep(item, to);
  };
  // Dragging by the grip: the item goes where the pointer is among the others' middles. The list holds the pointer, not
  // the row: a row moved in the page would lose it.
  const onGripDown = (e: ReactPointerEvent<HTMLSpanElement>, item: number) => {
    if (!live || e.button > 0 || !listRef.current) return;
    e.preventDefault();
    listRef.current.setPointerCapture(e.pointerId);
    setDragging(item);
  };
  const onDragMove = (e: ReactPointerEvent<HTMLOListElement>) => {
    if (dragging === null || !listRef.current) return;
    const from = order.indexOf(dragging);
    let to = 0;
    [...listRef.current.children].forEach((li, k) => {
      if (k === from) return;
      const b = li.getBoundingClientRect();
      if (e.clientY > b.top + b.height / 2) to++;
    });
    if (to !== from) move(dragging, to);
  };
  const endDrag = () => setDragging(null);
  const retry = () => {
    setChecked(false);
    setShown(false);
  };
  const restart = () => {
    setKept(null);
    setChecked(false);
    setShown(false);
  };
  const send = () =>
    ask(`${headOf(data)}${fill(tr('I put {0} of {1} in the right place.'), score, n)} ${tr('My order:')} ${order.map((it, p) => `${p + 1}. ${plainOf(items[it].text, 60)}`).join('; ')}`);
  const ends = arr(data.ends ?? data.labels).map((x) => textOf(x));
  const prompt = str(data.prompt ?? data.instructions);
  const shownList = isShown ? items.map((_, i) => i) : order;
  return (
    <Card>
      <Head title={data.title} />
      {prompt && <Md text={prompt} className="-mt-1 mb-3 text-[13.5px] text-fg-2" />}
      {n > 0 && ends[0] && (
        <div className="mb-1.5 flex items-center gap-1 px-1 text-[12px] font-medium text-fg-3">
          <ArrowUp size={13} />
          {ends[0]}
        </div>
      )}
      <ol ref={listRef} onPointerMove={onDragMove} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} className="m-0 list-none space-y-1.5 p-0">
        {shownList.map((item, pos) => {
          const it = items[item];
          // Shown: the right order, each marked by whether the user had it there.
          const ok = isChecked ? inPlace(pos) : null;
          return (
            <li
              key={item}
              ref={(el) => {
                rows.current[item] = el;
              }}
              tabIndex={live ? 0 : undefined}
              onKeyDown={(e) => onKey(e, item, pos)}
              aria-label={live ? `${pos + 1}. ${plainOf(it.text)}. ${tr('Move it with the arrow keys.')}` : undefined}
              className={cx(
                'flex items-center gap-2 rounded-xl border py-1.5 pr-1.5 pl-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                dragging === item ? 'border-accent bg-accent-soft shadow-sm' : ok === true ? 'border-ok/40 bg-ok/8' : ok === false ? 'border-err/40 bg-err/8' : 'border-line bg-panel',
              )}
            >
              <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12px] font-semibold tabular-nums', ok === true ? 'bg-ok/15 text-ok' : ok === false ? 'bg-err/15 text-err' : 'bg-bg-2 text-fg-3')}>{pos + 1}</span>
              {live && (
                <span
                  onPointerDown={(e) => onGripDown(e, item)}
                  className={cx('-mx-1 grid h-8 w-6 shrink-0 touch-none place-items-center rounded text-fg-3 hover:text-fg', dragging === item ? 'cursor-grabbing' : 'cursor-grab')}
                  aria-hidden
                >
                  <GripVertical size={15} />
                </span>
              )}
              <div className="min-w-0 flex-1 py-0.5 text-[14px] leading-snug">
                {done ? <Md text={it.text} inline /> : <Pending className="my-1.5 w-3/5" />}
                {isShown && it.note && <Md text={it.note} className="mt-0.5 text-[12.5px] text-fg-3" />}
              </div>
              {live && (
                <span className="flex shrink-0">
                  <button type="button" disabled={pos === 0} onClick={() => moveKeep(item, pos - 1)} aria-label={tr('Move up')} title={tr('Move up')} className="grid h-7 w-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg disabled:opacity-30">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" disabled={pos === n - 1} onClick={() => moveKeep(item, pos + 1)} aria-label={tr('Move down')} title={tr('Move down')} className="grid h-7 w-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg disabled:opacity-30">
                    <ArrowDown size={14} />
                  </button>
                </span>
              )}
              {ok !== null && <Mark ok={ok} className="mr-1" />}
            </li>
          );
        })}
      </ol>
      {n > 0 && ends[1] && (
        <div className="mt-1.5 flex items-center gap-1 px-1 text-[12px] font-medium text-fg-3">
          <ArrowDown size={13} />
          {ends[1]}
        </div>
      )}
      {n > 1 && !isChecked && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Btn primary icon={<Check size={14} />} disabled={!live} onClick={() => (setChecked(true), setShown(false))}>
            {tr('Check')}
          </Btn>
          {live && <span className="text-[12px] text-fg-3">{tr('Drag them, or use the arrows.')}</span>}
        </div>
      )}
      {isChecked && (
        <Outcome score={score} total={n} text={score === n ? tr('All in order. Well done!') : fill(tr('{0} of {1} in the right place'), score, n)}>
          <Btn icon={<RotateCcw size={13} />} onClick={score < n ? retry : restart}>
            {score < n ? tr('Try again') : tr('Start over')}
          </Btn>
          {score < n && (
            <Btn icon={shown ? <EyeOff size={13} /> : <Eye size={13} />} onClick={() => setShown(!shown)}>
              {shown ? tr('Hide the order') : tr('Show the order')}
            </Btn>
          )}
          <Btn primary icon={<Send size={13} />} onClick={send}>
            {tr('Send my result')}
          </Btn>
        </Outcome>
      )}
    </Card>
  );
}

// ---- a verb's conjugation ----------------------------------------------------------------------------------------------

interface Tense {
  name: string;
  forms: { person: string; form: string; irregular: boolean }[];
}

function tensesOf(data: Data): Tense[] {
  // Tenses given as a list, or as an object of name → forms.
  const given = isObj(data.tenses) ? Object.entries(data.tenses).map(([name, forms]) => ({ name, forms })) : arr(data.tenses);
  return given
    .filter(isObj)
    .map((t) => {
      const raw = t.forms ?? t.rows;
      // Forms given as a list, or as an object of person → form.
      const list = isObj(raw) ? Object.entries(raw).map(([person, form]) => ({ person, form })) : arr(raw);
      return {
        name: str(t.name ?? t.tense ?? t.title),
        forms: list
          .map((f) => (isObj(f) ? { person: str(f.person ?? f.pronoun ?? f.subject), form: str(f.form ?? f.text ?? f.value), irregular: yes(f.irregular) } : { person: '', form: str(f), irregular: false }))
          .filter((f) => f.form || f.person),
      };
    })
    .filter((t) => t.name || t.forms.length);
}

type FormMark = 'shown' | 'known' | 'again';

function Conjugation({ data, done }: { data: Data; done: boolean }) {
  const tenses = tensesOf(data);
  const code = langCode(data.language ?? data.lang);
  const name = langName(data.language ?? data.lang);
  const verb = str(data.verb ?? data.infinitive ?? data.title);
  const meaning = str(data.translation ?? data.meaning);
  const kind = str(data.kind ?? data.type);
  const notes = arr(data.notes).map((x) => textOf(x)).filter(Boolean);
  const [tab, setTab] = useKept<number>('tense', 0);
  const [mode, setMode] = useKept<'table' | 'practice'>('mode', 'table');
  const [marks, setMarks] = useKept<Record<string, FormMark>>('marks', {});
  const ask = useAsk();
  const at = Math.min(Math.max(0, num(tab) ?? 0), Math.max(0, tenses.length - 1));
  const tense = tenses[at];
  const practice = done && mode === 'practice';
  const markOf = (r: number): FormMark | undefined => (isObj(marks) ? marks[`${at}:${r}`] : undefined);
  const setMark = (r: number, m: FormMark | null) =>
    setMarks((x) => {
      const next = { ...(isObj(x) ? x : {}) };
      if (m) next[`${at}:${r}`] = m;
      else delete next[`${at}:${r}`];
      return next;
    });
  const forms = tense?.forms ?? [];
  const known = forms.filter((_, r) => markOf(r) === 'known').length;
  const marked = forms.filter((_, r) => markOf(r) === 'known' || markOf(r) === 'again').length;
  const finished = practice && forms.length > 0 && marked === forms.length;
  const hideAgain = () =>
    setMarks((x) => Object.fromEntries(Object.entries(isObj(x) ? x : {}).filter(([k]) => !k.startsWith(`${at}:`))) as Record<string, FormMark>);
  const send = () => {
    const again = forms.filter((_, r) => markOf(r) === 'again');
    ask(`${fill(tr('Practising “{0}” ({1}): I knew {2} of {3} forms.'), verb, tense?.name ?? '', known, forms.length)}${again.length ? ` ${tr('Not yet:')} ${again.map((f) => `${f.person} ${f.form}`.trim()).join(', ')}` : ''}`);
  };
  const six = forms.length === 6;
  const anyIrregular = forms.some((f) => f.irregular);
  if (!verb && !tenses.length) return <Card>{null}</Card>;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h3 lang={code || undefined} className="aui-h3 text-[21px]">
              {verb}
            </h3>
            {done && verb && <SpeakBtn text={verb} lang={code || undefined} />}
          </div>
          {(meaning || name || kind) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              {meaning && <span className="text-fg-2">{meaning}</span>}
              {name && <span className="text-fg-3">{name}</span>}
              {kind && <Chip>{kind}</Chip>}
            </div>
          )}
        </div>
        {done && forms.length > 0 && (
          <Seg
            size="sm"
            options={[
              { value: 'table', label: tr('Table') },
              { value: 'practice', label: tr('Practice') },
            ]}
            value={mode === 'practice' ? 'practice' : 'table'}
            onChange={(v) => setMode(v)}
          />
        )}
      </div>
      {tenses.length > 1 && (
        <div className="mb-2">
          <Seg options={tenses.map((t, i) => ({ value: i, label: t.name || String(i + 1) }))} value={at} onChange={(v) => done && setTab(v)} />
        </div>
      )}
      {practice && !finished && <div className="mb-1 text-[12.5px] text-fg-3">{tr('Say each form, then tap to check it.')}</div>}
      {forms.length > 0 && (
        <div className={cx('grid', six && '@xl:grid-flow-col @xl:grid-cols-2 @xl:grid-rows-3 @xl:gap-x-6')}>
          {forms.map((f, r) => {
            const m = markOf(r);
            const hidden = practice && !m;
            return (
              <div key={r} className="flex min-h-[44px] min-w-0 items-center gap-3 border-b border-line/70 py-1.5">
                <span lang={code || undefined} className="w-[40%] shrink-0 text-[13px] leading-snug text-fg-3">
                  {f.person}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  {hidden ? (
                    <button type="button" onClick={() => setMark(r, 'shown')} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-line-2 px-2 py-0.5 text-[12.5px] font-medium text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
                      <Eye size={13} />
                      {tr('Show')}
                    </button>
                  ) : (
                    <span lang={code || undefined} className={cx('min-w-0 text-[15.5px] font-semibold', f.irregular ? 'text-accent' : 'text-fg')}>
                      {f.form}
                    </span>
                  )}
                  {practice && m === 'shown' && (
                    <span className="ml-auto flex shrink-0 gap-1">
                      <button type="button" onClick={() => setMark(r, 'again')} title={tr('Not yet')} aria-label={tr('Not yet')} className="grid h-7 w-7 place-items-center rounded-md border border-line text-warn transition-colors hover:bg-warn/10">
                        <RotateCcw size={13} />
                      </button>
                      <button type="button" onClick={() => setMark(r, 'known')} title={tr('I knew it')} aria-label={tr('I knew it')} className="grid h-7 w-7 place-items-center rounded-md border border-line text-ok transition-colors hover:bg-ok/10">
                        <Check size={14} strokeWidth={2.5} />
                      </button>
                    </span>
                  )}
                  {practice && (m === 'known' || m === 'again') && (
                    <button type="button" onClick={() => setMark(r, 'shown')} title={tr('Undo')} aria-label={`${m === 'known' ? tr('I knew it') : tr('Not yet')}: ${tr('Undo')}`} className={cx('ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full', m === 'known' ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn')}>
                      {m === 'known' ? <Check size={12} strokeWidth={3} /> : <RotateCcw size={11} strokeWidth={2.5} />}
                    </button>
                  )}
                </span>
                {done && f.form && !hidden && <SpeakBtn text={f.form} lang={code || undefined} />}
              </div>
            );
          })}
        </div>
      )}
      {anyIrregular && (
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-fg-3">
          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
          {tr('Irregular')}
        </div>
      )}
      {practice && marked > 0 && !finished && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-fg-3">
          <span className="tabular-nums">{fill(tr('{0} of {1} known'), known, forms.length)}</span>
          <button type="button" onClick={hideAgain} className="inline-flex items-center gap-1 font-medium transition-colors hover:text-fg">
            <RotateCcw size={12} />
            {tr('Hide them again')}
          </button>
        </div>
      )}
      {finished && (
        <Outcome score={known} total={forms.length} text={known === forms.length ? tr('You knew them all!') : fill(tr('{0} of {1} known'), known, forms.length)}>
          <Btn icon={<RotateCcw size={13} />} onClick={hideAgain}>
            {tr('Hide them again')}
          </Btn>
          <Btn primary icon={<Send size={13} />} onClick={send}>
            {tr('Send my result')}
          </Btn>
        </Outcome>
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

// ---- a dialogue ----------------------------------------------------------------------------------------------------------

interface Line {
  speaker: string;
  text: string;
  phonetic: string;
  translation: string;
  note: string;
}

function Dialogue({ data, done }: { data: Data; done: boolean }) {
  const lines: Line[] = arr(data.lines ?? data.turns ?? data.messages)
    .filter(isObj)
    .map((l) => ({ speaker: str(l.speaker ?? l.name ?? l.who ?? l.from), text: str(l.text ?? l.line ?? l.says), phonetic: str(l.phonetic ?? l.reading ?? l.romanization ?? l.pronunciation), translation: str(l.translation ?? l.meaning), note: str(l.note) }))
    .filter((l) => l.text);
  const declared = arr(data.speakers)
    .map((s) => (isObj(s) ? { name: str(s.name), side: str(s.side) } : { name: str(s), side: '' }))
    .filter((s) => s.name);
  const names = [...new Set([...declared.map((s) => s.name), ...lines.map((l) => l.speaker).filter(Boolean)])];
  const sideOf = (who: string): 'left' | 'right' => {
    const d = declared.find((s) => s.name === who);
    if (d?.side === 'left' || d?.side === 'right') return d.side;
    return names.indexOf(who) === 1 ? 'right' : 'left';
  };
  const code = langCode(data.language ?? data.lang);
  const [showTr, setShowTr] = useKept<boolean>('translations', true);
  const [kept, setRole] = useKept<string>('role', '');
  const [seen, setSeen] = useKept<Record<number, boolean>>('seen', {});
  const [playing, setPlaying] = useState<number | null>(null);
  const ask = useAsk();
  const role = done && names.includes(str(kept)) ? str(kept) : '';
  const seenNow = isObj(seen) ? seen : {};
  const hiddenAt = (k: number) => !!role && lines[k]?.speaker === role && !seenNow[k];
  const reveal = (k: number) => setSeen((s) => ({ ...(isObj(s) ? s : {}), [k]: true }));
  const anyTr = lines.some((l) => l.translation);
  // Playing them all, in turn: each run has a number, and a stop (or a new run) makes the old one's callbacks do nothing.
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watch = useRef<ReturnType<typeof setInterval> | null>(null);
  // The line being said, held: a browser may drop an utterance nothing holds before it ends.
  const utter = useRef<SpeechSynthesisUtterance | null>(null);
  const hiddenRef = useRef(hiddenAt);
  hiddenRef.current = hiddenAt;
  const clearTimers = () => {
    if (timer.current) clearTimeout(timer.current);
    if (watch.current) clearInterval(watch.current);
    timer.current = null;
    watch.current = null;
  };
  const stop = () => {
    run.current++;
    clearTimers();
    utter.current = null;
    setPlaying(null);
  };
  useEffect(
    () => () => {
      run.current++;
      if (timer.current) clearTimeout(timer.current);
      if (watch.current) clearInterval(watch.current);
    },
    [],
  );
  const playAll = () => {
    if (!canSpeak || !lines.length) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    clearTimers();
    const me = ++run.current;
    const base = code.toLowerCase().split('-')[0];
    const voices = base ? synth.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(base)) : [];
    const step = (k: number) => {
      if (run.current !== me) return;
      if (k >= lines.length) return stop();
      setPlaying(k);
      const line = lines[k];
      const say = () => {
        if (run.current !== me) return;
        const u = new SpeechSynthesisUtterance(line.text);
        if (code) u.lang = code;
        // Each speaker a voice of their own where the device has several, else a pitch of their own.
        const who = Math.max(0, names.indexOf(line.speaker));
        if (voices.length) u.voice = voices[who % voices.length];
        if (voices.length < 2) u.pitch = [1, 0.8, 1.2, 0.9][who % 4];
        let over = false;
        const after = () => {
          if (over || run.current !== me) return;
          over = true;
          if (watch.current) clearInterval(watch.current);
          timer.current = setTimeout(() => {
            if (run.current !== me) return;
            // Something else spoke over it (another listen button): this run stops there.
            if (synth.speaking || synth.pending) return stop();
            step(k + 1);
          }, 280);
        };
        u.onend = after;
        u.onerror = () => {
          if (over || run.current !== me) return;
          over = true;
          stop();
        };
        utter.current = u;
        synth.speak(u);
        // Some browsers never say an utterance ended: once nothing speaks (or nothing started), it has.
        const since = Date.now();
        let heard = false;
        if (watch.current) clearInterval(watch.current);
        watch.current = setInterval(() => {
          if (synth.speaking) heard = true;
          else if (heard || Date.now() - since > 4000) after();
        }, 400);
      };
      // The user's own part: time to say the line, then it shows and is said.
      if (hiddenRef.current(k)) {
        timer.current = setTimeout(() => {
          if (run.current !== me) return;
          reveal(k);
          say();
        }, 1800 + 70 * [...line.text].length);
      } else say();
    };
    step(0);
  };
  const others = names.filter((x) => x !== role);
  const mine = role ? lines.map((l, k) => ({ l, k })).filter(({ l }) => l.speaker === role) : [];
  const mineSeen = mine.filter(({ k }) => seenNow[k]).length;
  const scene = str(data.scene ?? data.context ?? data.setting);
  const sub = [langName(data.language ?? data.lang), lines.length > 1 ? fill(tr('{0} lines'), lines.length) : ''].filter(Boolean).join(' · ');
  return (
    <Card>
      <Head title={data.title} sub={str(data.title) ? sub : ''} />
      {scene && <Md text={scene} className="-mt-1 mb-3 text-[13px] text-fg-3 italic" />}
      {done && lines.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {canSpeak && (
            <SmallButton on={playing !== null} onClick={() => (playing !== null ? (window.speechSynthesis.cancel(), stop()) : playAll())} icon={playing !== null ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" />}>
              {playing !== null ? tr('Stop') : tr('Play all')}
            </SmallButton>
          )}
          {anyTr && (
            <SmallButton on={!!showTr} onClick={() => setShowTr(!showTr)} icon={<Languages size={13} />}>
              {tr('Translations')}
            </SmallButton>
          )}
          {names.length > 1 && (
            <span className="ml-auto flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-[12px] text-fg-3">{tr('Your part')}</span>
              <Seg size="sm" options={[{ value: '', label: tr('None') }, ...names.map((x) => ({ value: x, label: x }))]} value={role} onChange={(v) => (setRole(v), setSeen({}))} />
            </span>
          )}
        </div>
      )}
      <ol className="m-0 list-none space-y-1 p-0">
        {lines.map((l, k) => {
          const right = sideOf(l.speaker) === 'right';
          const first = k === 0 || lines[k - 1].speaker !== l.speaker;
          const hidden = hiddenAt(k);
          return (
            <li key={k} className={cx('flex items-start gap-2', right && 'flex-row-reverse', first && k > 0 && 'pt-2')}>
              {first ? <Avatar name={l.speaker || '?'} className="mt-[18px] h-7 w-7 text-[10.5px]" /> : <span className="w-7 shrink-0" aria-hidden />}
              <div className={cx('flex max-w-[86%] min-w-0 flex-col @md:max-w-[78%]', right ? 'items-end' : 'items-start')}>
                {first && l.speaker && <div className="mb-0.5 px-1 text-[11.5px] font-medium text-fg-3">{l.speaker}</div>}
                {hidden ? (
                  <button
                    type="button"
                    onClick={() => reveal(k)}
                    className={cx('max-w-full rounded-2xl border border-dashed border-accent/50 px-3 py-2 text-left transition-colors hover:bg-accent-soft', right ? 'rounded-tr-md' : 'rounded-tl-md', playing === k && 'ring-2 ring-accent/60')}
                  >
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-accent">
                      <Eye size={13} />
                      {tr('Your line: say it, then tap to check')}
                    </span>
                    {!!showTr && l.translation && <span className="mt-0.5 block text-[13.5px] text-fg-2">{l.translation}</span>}
                  </button>
                ) : (
                  <div className={cx('max-w-full rounded-2xl px-3 py-2', right ? 'rounded-tr-md bg-accent-soft' : 'rounded-tl-md bg-bg-2', playing === k && 'ring-2 ring-accent/60')}>
                    <div className="flex items-start gap-1">
                      <span lang={code || undefined} className="min-w-0 pt-px text-[15px] leading-snug">
                        {l.text}
                      </span>
                      {done && <SpeakBtn text={l.text} lang={code || undefined} className="-my-0.5 -mr-1.5 h-6 w-6" />}
                    </div>
                    {l.phonetic && <div className="mt-0.5 text-[12.5px] text-fg-3 italic">{l.phonetic}</div>}
                    {!!showTr && l.translation && <div className="mt-1 border-t border-fg/10 pt-1 text-[13px] text-fg-2">{l.translation}</div>}
                  </div>
                )}
                {l.note && !hidden && (
                  <div className="mt-1 flex max-w-full gap-1.5 px-1 text-[12.5px] text-fg-3">
                    <Lightbulb size={13} className="mt-[3px] shrink-0" />
                    <Md text={l.note} inline className="min-w-0" />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {role && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Btn
            primary
            icon={<MessageSquarePlus size={13} />}
            onClick={() => ask(`${headOf(data)}${fill(tr('Let’s act it out: I’m {0} and you’re {1}. Say one line at a time, wait for mine, and correct my mistakes.'), role, others.join(', '))}`)}
          >
            {tr('Act it out with me')}
          </Btn>
          {mineSeen > 0 && (
            <Btn icon={<RotateCcw size={13} />} onClick={() => setSeen({})}>
              {tr('Hide them again')}
            </Btn>
          )}
          <span className="text-[12.5px] text-fg-3 tabular-nums">{fill(tr('{0} of {1} checked'), mineSeen, mine.length)}</span>
        </div>
      )}
    </Card>
  );
}

// ---- a grading rubric ------------------------------------------------------------------------------------------------------

interface Criterion {
  name: string;
  weight: number;
  levels: { label: string; points: number; description: string }[];
  selected: number | null;
  comment: string;
}

function criteriaOf(data: Data): Criterion[] {
  return arr(data.criteria ?? data.rows)
    .filter(isObj)
    .map((c) => {
      const levels = arr(c.levels ?? c.scale)
        .map((l) => (isObj(l) ? { label: str(l.label ?? l.name ?? l.level), points: num(l.points ?? l.score ?? l.value) ?? 0, description: str(l.description ?? l.text ?? l.descriptor) } : { label: str(l), points: 0, description: '' }))
        .filter((l) => l.label || l.description);
      // The level given: by its index, or by its label.
      const raw = c.selected ?? c.level ?? c.given;
      const byIndex = num(raw);
      const sel = byIndex !== null ? byIndex : typeof raw === 'string' ? levels.findIndex((l) => loose(l.label) === loose(raw)) : -1;
      return {
        name: str(c.name ?? c.criterion ?? c.title),
        weight: Math.max(0, num(c.weight) ?? 1),
        levels,
        selected: Number.isInteger(sel) && sel >= 0 && sel < levels.length ? sel : null,
        comment: str(c.comment ?? c.feedback ?? c.note),
      };
    })
    .filter((c) => c.name || c.levels.length);
}

function Rubric({ data, done }: { data: Data; done: boolean }) {
  const criteria = criteriaOf(data);
  const [picks, setPicks] = useKept<Record<number, number | null>>('picks', {});
  const ask = useAsk();
  const picked = isObj(picks) ? picks : {};
  /** The level of a row: the user's pick (none when they took it away), else the one given. */
  const levelOf = (i: number): number | null => {
    const c = criteria[i];
    if (done && i in picked) {
      const p = picked[i];
      return typeof p === 'number' && Number.isInteger(p) && p >= 0 && p < c.levels.length ? p : null;
    }
    return c.selected;
  };
  const pick = (i: number, j: number) => {
    if (!done) return;
    setPicks((x) => ({ ...(isObj(x) ? x : {}), [i]: levelOf(i) === j ? null : j }));
  };
  const rows = criteria.map((c, i) => {
    const lv = levelOf(i);
    const top = c.levels.length ? Math.max(...c.levels.map((l) => l.points)) : 0;
    return { c, lv, max: top * c.weight, earned: lv === null ? null : c.levels[lv].points * c.weight };
  });
  const graded = rows.filter((r) => r.earned !== null);
  const total = graded.reduce((s, r) => s + (r.earned ?? 0), 0);
  const max = rows.reduce((s, r) => s + r.max, 0);
  const gradedMax = graded.reduce((s, r) => s + r.max, 0);
  const share = gradedMax > 0 ? total / gradedMax : null;
  const percent = share === null ? null : Math.round(share * 1000) / 10;
  const grade = (() => {
    if (percent === null || graded.length < rows.length) return '';
    const bands = arr(data.grades ?? data.bands)
      .filter(isObj)
      .map((g) => ({ min: num(g.min ?? g.from) ?? 0, label: str(g.label ?? g.grade) }))
      .filter((g) => g.label)
      .sort((a, b) => b.min - a.min);
    return bands.find((b) => percent >= b.min)?.label ?? '';
  })();
  const changed = done && rows.some((r, i) => r.lv !== criteria[i].selected);
  const anyPicked = rows.some((r) => r.lv !== null);
  const pts = (n: number) => fmtNum(n, { maximumFractionDigits: 1 });
  const summary = () =>
    [
      str(data.title),
      ...rows.map((r) => `${r.c.name}${r.c.weight !== 1 ? ` (×${pts(r.c.weight)})` : ''}: ${r.lv === null ? '—' : `${r.c.levels[r.lv].label}, ${pts(r.earned ?? 0)}/${pts(r.max)}`}`),
      `${tr('Total')}: ${pts(total)}/${pts(graded.length < rows.length ? gradedMax : max)}${percent !== null ? ` (${pts(percent)}%)` : ''}${grade ? ` · ${grade}` : ''}`,
    ]
      .filter(Boolean)
      .join('\n');
  return (
    <Card>
      <Head
        title={data.title}
        aside={
          changed ? (
            <SmallButton onClick={() => setPicks({})} icon={<RotateCcw size={12} />}>
              {tr('Reset')}
            </SmallButton>
          ) : undefined
        }
      />
      <div className="divide-y divide-line/70">
        {rows.map(({ c, lv, max: rowMax, earned }, i) => (
          <div key={i} className="py-3 first:pt-0 @2xl:grid @2xl:grid-cols-[148px_minmax(0,1fr)] @2xl:gap-x-4">
            <div className="mb-2 flex items-baseline justify-between gap-3 @2xl:mb-0 @2xl:block">
              <div className="min-w-0">
                <div className="text-[14px] leading-snug font-semibold">{c.name}</div>
                {c.weight !== 1 && <div className="text-[12px] text-fg-3">{fill(tr('Counts ×{0}'), pts(c.weight))}</div>}
              </div>
              <div className="shrink-0 text-[13px] font-medium tabular-nums @2xl:mt-1">
                <span className={earned === null ? 'text-fg-3' : 'text-fg'}>{earned === null ? '–' : pts(earned)}</span>
                <span className="text-fg-3">/{pts(rowMax)}</span>
              </div>
            </div>
            <div className="grid gap-1.5 @sm:grid-cols-2 @xl:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ '--n': Math.max(1, c.levels.length) } as CSSProperties}>
              {c.levels.map((l, j) => {
                const on = lv === j;
                return (
                  <button
                    key={j}
                    type="button"
                    disabled={!done}
                    onClick={() => pick(i, j)}
                    aria-pressed={on}
                    className={cx('flex min-w-0 flex-col rounded-lg border px-2.5 py-2 text-left transition-colors', on ? 'border-accent bg-accent-soft' : 'border-line', done && !on && 'hover:border-line-2 hover:bg-bg-1')}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cx('inline-flex min-w-0 items-center gap-1 text-[12.5px] font-semibold', on ? 'text-accent' : 'text-fg')}>
                        {on && <Check size={12} strokeWidth={3} className="shrink-0 self-center" />}
                        <span className="truncate">{l.label}</span>
                      </span>
                      <span className="shrink-0 text-[12px] text-fg-3 tabular-nums">{pts(l.points)}</span>
                    </span>
                    {l.description && <Md text={l.description} inline className="mt-0.5 block text-[12.5px] leading-snug text-fg-2" />}
                  </button>
                );
              })}
            </div>
            {c.comment && (
              <div className="mt-2 flex gap-1.5 text-[13px] text-fg-2 @2xl:col-start-2">
                <MessageSquareText size={14} className="mt-[3px] shrink-0 text-fg-3" />
                <Md text={c.comment} inline className="min-w-0" />
              </div>
            )}
          </div>
        ))}
      </div>
      {rows.length > 0 && max > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-bg-1 p-3.5">
          <Ring value={total} max={gradedMax || 1} size={60} stroke={5}>
            <span className="text-[13px] font-semibold tabular-nums">{percent === null ? '–' : `${pts(percent)}%`}</span>
          </Ring>
          <div className="min-w-[150px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold tabular-nums">{fill(tr('{0} of {1} points'), pts(total), pts(graded.length < rows.length ? gradedMax : max))}</span>
              {grade && (
                <Chip tone="accent" className="text-[12.5px]">
                  {grade}
                </Chip>
              )}
            </div>
            <div className="text-[12.5px] text-fg-3">
              {graded.length < rows.length ? fill(tr('{0} of {1} rows graded: pick a level in each.'), graded.length, rows.length) : done ? tr('Pick another level in a row to grade it yourself.') : ''}
              {done && anyPicked && (
                <>
                  {' '}
                  <button type="button" onClick={() => setPicks(Object.fromEntries(criteria.map((_, i) => [i, null])))} className="inline-flex items-center gap-1 font-medium text-fg-2 underline-offset-2 transition-colors hover:text-fg hover:underline">
                    <Eraser size={11} />
                    {tr('Clear the levels')}
                  </button>
                </>
              )}
            </div>
          </div>
          {done && (
            <div className="flex items-center gap-1.5">
              <Copy text={summary} label={tr('Copy as text')} />
              <Btn primary icon={<Send size={13} />} onClick={() => ask(`${tr('My grading with the rubric:')}\n${summary()}`)}>
                {tr('Send')}
              </Btn>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ---- a chess board ----------------------------------------------------------------------------------------------------------

/** The pieces' glyphs: the solid ones for both sides (filled in each side's colour), drawn as text, never as emoji. */
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const PIECE_FONT = "'DejaVu Sans','Segoe UI Symbol','Noto Sans Symbols 2','Noto Sans Symbols2','Apple Symbols','Arial Unicode MS',FreeSerif,serif";
const SQ = 45;
/** Arrows' colours, by the names analysts give them. */
const ARROW_HUE: Record<string, string> = { green: 'var(--viz-6)', red: 'var(--viz-8)', blue: 'var(--viz-1)', yellow: 'var(--viz-4)', orange: 'var(--viz-2)' };
/** The squares, in the app's accent: a light and a dark that keep their order in both themes. */
const LIGHT_SQ = 'color-mix(in srgb, var(--accent) 16%, light-dark(#f4f0e6, #c4c8d0))';
const DARK_SQ = 'color-mix(in srgb, var(--accent) 50%, light-dark(#c9bfa9, #5a6070))';
const LIGHT_SQ_FALLBACK = 'color-mix(in srgb, var(--accent) 16%, #e9e5dc)';
const DARK_SQ_FALLBACK = 'color-mix(in srgb, var(--accent) 50%, #a39b8b)';

interface ChessPos {
  /** The 64 squares from a8 to h1, rank by rank: a piece's FEN letter or nothing. */
  squares: (string | null)[];
  turn: 'w' | 'b' | '';
  moveNo: number | null;
}

/** A position from FEN, as far as it reads: what is missing is empty. */
function readFen(fen: string): ChessPos {
  const parts = fen.trim().split(/\s+/);
  const ranks = (parts[0] ?? '').split('/');
  const squares: (string | null)[] = Array(64).fill(null);
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of ranks[r] ?? '') {
      if (f > 7) break;
      if (ch >= '1' && ch <= '8') f += Number(ch);
      else if (/^[prnbqk]$/i.test(ch)) squares[r * 8 + f++] = ch;
    }
  }
  return { squares, turn: parts[1] === 'w' || parts[1] === 'b' ? parts[1] : '', moveNo: num(parts[5]) };
}

/** A square's place from its name ("e2"), or null. */
function squareAt(name: unknown): number | null {
  const m = /^\s*([a-h])([1-8])\s*$/i.exec(str(name));
  return m ? (8 - Number(m[2])) * 8 + (m[1].toLowerCase().charCodeAt(0) - 97) : null;
}

/** A move as written, without its number and marks, to compare with a guess: "13. Rxd7!" and "rd7" are the same move. */
function moveKey(s: string): string {
  let t = s
    .replace(/^\s*\d+\s*(\.+|…)\s*/, '')
    .replace(/[+#!?]/g, '')
    .replace(/e\.p\./gi, '')
    .replace(/[\sx:=]/g, '')
    .replace(/0/g, 'O');
  if (/^o-o/i.test(t)) t = t.toUpperCase();
  else if (/^[nrqk]/.test(t)) t = t[0].toUpperCase() + t.slice(1);
  return t;
}

/** An arrow from one square's middle to another's, as one outline: its shaft and its head. */
function arrowPath(x1: number, y1: number, x2: number, y2: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const px = -uy;
  const py = ux;
  const w = 4.5;
  const hw = 11;
  const hl = Math.min(18, len * 0.6);
  const ex = x2 - ux * 4;
  const ey = y2 - uy * 4;
  const bx = ex - ux * hl;
  const by = ey - uy * hl;
  const p = (x: number, y: number) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  return `M${p(x1 + px * w, y1 + py * w)}L${p(bx + px * w, by + py * w)}L${p(bx + px * hw, by + py * hw)}L${p(ex, ey)}L${p(bx - px * hw, by - py * hw)}L${p(bx - px * w, by - py * w)}L${p(x1 - px * w, y1 - py * w)}Z`;
}

function ChessBoard({ pos, flipped, marked, arrows, label }: { pos: ChessPos; flipped: boolean; marked: number[]; arrows: { from: number; to: number; hue: string }[]; label: string }) {
  const at = (i: number) => {
    const r = Math.floor(i / 8);
    const f = i % 8;
    return { x: (flipped ? 7 - f : f) * SQ, y: (flipped ? 7 - r : r) * SQ, light: (r + f) % 2 === 0 };
  };
  const fillOf = (light: boolean) => ({ fill: light ? LIGHT_SQ_FALLBACK : DARK_SQ_FALLBACK, style: { fill: light ? LIGHT_SQ : DARK_SQ } });
  return (
    <svg viewBox={`0 0 ${SQ * 8} ${SQ * 8}`} className="block h-auto w-full rounded-lg select-none" role="img" aria-label={label}>
      {Array.from({ length: 64 }, (_, i) => {
        const s = at(i);
        return <rect key={i} x={s.x} y={s.y} width={SQ} height={SQ} {...fillOf(s.light)} />;
      })}
      {marked.map((i) => {
        const s = at(i);
        return <rect key={`m${i}`} x={s.x} y={s.y} width={SQ} height={SQ} style={{ fill: 'color-mix(in srgb, var(--viz-4) 48%, transparent)' }} />;
      })}
      {Array.from({ length: 8 }, (_, c) => {
        // Files along the bottom edge, ranks along the left, each in the other square colour.
        const file = flipped ? 7 - c : c;
        const rank = flipped ? c + 1 : 8 - c;
        const bottomLight = ((flipped ? 0 : 7) + file) % 2 === 0;
        const leftLight = (8 - rank + (flipped ? 7 : 0)) % 2 === 0;
        return (
          <g key={`c${c}`} fontSize={9} fontWeight={650} style={{ fontFamily: 'var(--font-sans)' }}>
            <text x={c * SQ + SQ - 3} y={SQ * 8 - 3.5} textAnchor="end" {...fillOf(!bottomLight)}>
              {String.fromCharCode(97 + file)}
            </text>
            <text x={3} y={c * SQ + 10.5} {...fillOf(!leftLight)}>
              {rank}
            </text>
          </g>
        );
      })}
      {pos.squares.map((p, i) => {
        if (!p) return null;
        const s = at(i);
        const white = p === p.toUpperCase();
        return (
          <text
            key={`p${i}`}
            x={s.x + SQ / 2}
            y={s.y + SQ / 2 + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={37}
            fill={white ? '#fbfaf6' : '#22201c'}
            stroke={white ? '#22201c' : '#22201c'}
            strokeWidth={white ? 1.6 : 0.6}
            strokeLinejoin="round"
            paintOrder="stroke"
            style={{ fontFamily: PIECE_FONT }}
          >
            {`${GLYPH[p.toLowerCase()]}︎`}
          </text>
        );
      })}
      {arrows.map((a, k) => {
        const s = at(a.from);
        const e = at(a.to);
        return <path key={`a${k}`} d={arrowPath(s.x + SQ / 2, s.y + SQ / 2, e.x + SQ / 2, e.y + SQ / 2)} style={{ fill: a.hue }} opacity={0.82} />;
      })}
    </svg>
  );
}

/** A button with only an icon, of the size of kit's Btn. */
function IconBtn({ icon, title, onClick, disabled }: { icon: ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-panel text-fg transition-colors hover:bg-bg-2 disabled:pointer-events-none disabled:opacity-50"
    >
      {icon}
    </button>
  );
}

/** A side's name and its colour, by the board. */
function ChessPlayer({ name, white, toMove }: { name: string; white: boolean; toMove: boolean }) {
  if (!name) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 py-1.5 text-[13px]">
      <span className={cx('h-3 w-3 shrink-0 rounded-sm border border-line-2', white ? 'bg-[#fbfaf6]' : 'bg-[#22201c]')} aria-hidden />
      <span className="min-w-0 truncate font-medium">{name}</span>
      {toMove && <span className="shrink-0 text-[11.5px] text-fg-3">{tr('to move')}</span>}
    </div>
  );
}

function Chess({ data, done }: { data: Data; done: boolean }) {
  const positions = arr(data.positions ?? data.moves ?? (data.fen ? [{ fen: data.fen }] : []))
    .map((p) => (isObj(p) ? p : { fen: str(p) }))
    .filter((p) => str(p.fen).trim());
  const n = positions.length;
  const boards = useMemo(() => positions.map((p) => readFen(str(p.fen))), [JSON.stringify(positions.map((p) => str(p.fen)))]); // eslint-disable-line react-hooks/exhaustive-deps
  const [atKept, setAt] = useKept<number>('at', 0);
  const [flip, setFlip] = useKept<boolean>('flip', false);
  const [guessing, setGuessing] = useKept<boolean>('guess', false);
  const [guesses, setGuesses] = useKept<Record<number, { said: string; right: boolean } | null>>('guesses', {});
  const [said, setSaid] = useState('');
  const ask = useAsk();
  const at = done ? Math.min(Math.max(0, num(atKept) ?? 0), Math.max(0, n - 1)) : 0;
  const flipped = (str(data.orientation).toLowerCase() === 'black') !== !!flip;
  const pos = positions[at];
  const board = boards[at];
  const guess = done && !!guessing && n > 1;
  const results = isObj(guesses) ? guesses : {};
  // What each move is called in the list: "13. Rxd7!", then "Rxd7" for Black's reply to it.
  const labels = useMemo(() => {
    let last: { no: number; white: boolean } | null = null;
    return positions.map((p, k) => {
      const raw = str(p.move ?? p.san).trim();
      if (!raw) return { full: '', short: '' };
      const m = /^\s*(\d+)\s*(\.\.\.|…|\.)\s*(.*)$/.exec(raw);
      const b = boards[k];
      const white = m ? m[2] === '.' : b?.turn === 'b';
      const no = m ? Number(m[1]) : b?.moveNo != null ? (b.turn === 'w' ? b.moveNo - 1 : b.moveNo) : null;
      const bare = m ? m[3] : raw;
      const full = no === null || (!m && !b?.turn) ? raw : white ? `${no}. ${bare}` : `${no}…${bare}`;
      const short = !white && last && last.white && last.no === no ? bare : full;
      last = no === null ? null : { no, white };
      return { full, short };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards, JSON.stringify(positions.map((p) => str(p.move ?? p.san)))]);
  const go = (k: number) => {
    if (!done) return;
    setAt(Math.max(0, Math.min(n - 1, k)));
    setSaid('');
  };
  // The squares marked: those given, else the ones the move changed (from the position before).
  const marked = useMemo(() => {
    const given = arr(pos?.highlight ?? pos?.squares)
      .map(squareAt)
      .filter((x): x is number => x !== null);
    if (given.length || !pos || !(at > 0) || !boards[at - 1] || !str(pos.move).trim()) return given;
    const prev = boards[at - 1].squares;
    const now = boards[at].squares;
    const diff = now.map((p, i) => (p !== prev[i] ? i : -1)).filter((i) => i >= 0);
    return diff.length <= 4 ? diff : [];
  }, [pos, at, boards]);
  // A position still being written may have an arrow without its colour yet: arrows show once it is whole.
  const arrows = arr(done || at < n - 1 ? pos?.arrows : [])
    .filter(isObj)
    .map((a) => ({ from: squareAt(a.from), to: squareAt(a.to), hue: ARROW_HUE[str(a.color ?? a.colour).toLowerCase()] ?? ARROW_HUE.green }))
    .filter((a): a is { from: number; to: number; hue: string } => a.from !== null && a.to !== null && a.from !== a.to);
  // Guessing: the next move is what to find, from the position on the board.
  const next = at + 1 < n ? at + 1 : -1;
  const nextMove = next >= 0 ? str(positions[next].move ?? positions[next].san).trim() : '';
  const mover = board?.turn === 'w' ? 'w' : board?.turn === 'b' ? 'b' : boards[next]?.turn === 'w' ? 'b' : boards[next]?.turn === 'b' ? 'w' : '';
  const tried = Object.entries(results).filter(([k, v]) => Number(k) < n && v !== undefined);
  const rightCount = tried.filter(([, v]) => v && v.right).length;
  const checkGuess = (give: boolean) => {
    if (next < 0 || !nextMove) return;
    const right = !give && !!said.trim() && moveKey(said) === moveKey(nextMove);
    setGuesses((g) => ({ ...(isObj(g) ? g : {}), [next]: give ? null : { said: said.trim(), right } }));
    go(next);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!done || (e.target as HTMLElement).closest('input, textarea')) return;
    const k = e.key === 'ArrowLeft' ? at - 1 : e.key === 'ArrowRight' ? at + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (k === null || (guess && k > at)) return;
    e.preventDefault();
    go(k);
  };
  const result = results[at];
  const label = labels[at]?.full ?? '';
  const comment = str(pos?.comment ?? pos?.note);
  const turnText = board?.turn === 'w' ? tr('White to move') : board?.turn === 'b' ? tr('Black to move') : '';
  const top = flipped ? { name: str(data.white), white: true } : { name: str(data.black), white: false };
  const bottom = flipped ? { name: str(data.black), white: false } : { name: str(data.white), white: true };
  const ended = guess && next < 0 && tried.length > 0;
  return (
    <Card>
      <Head
        title={data.title}
        sub={data.event}
        aside={
          done && n > 0 ? (
            <SmallButton onClick={() => setFlip(!flip)} icon={<FlipVertical2 size={13} />}>
              {tr('Flip')}
            </SmallButton>
          ) : undefined
        }
      />
      {n > 0 && board && (
        <div role="group" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-4 focus-visible:ring-offset-panel" tabIndex={done ? 0 : undefined} onKeyDown={onKey} aria-label={tr('Chess board')}>
          <div className="grid gap-x-5 gap-y-3 @xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <div className="mx-auto w-full max-w-[420px] min-w-0">
              <ChessPlayer name={top.name} white={top.white} toMove={(board.turn === 'w') === top.white && !!board.turn} />
              <ChessBoard pos={board} flipped={flipped} marked={marked} arrows={arrows} label={`${tr('Chess board')}${label ? `: ${label}` : ''}`} />
              <ChessPlayer name={bottom.name} white={bottom.white} toMove={(board.turn === 'w') === bottom.white && !!board.turn} />
            </div>
            <div className="flex min-w-0 flex-col">
              {labels.some((l) => l.full) && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {labels.map((l, k) =>
                    l.full ? (
                      <button
                        key={k}
                        type="button"
                        disabled={!done || (guess && k > at)}
                        onClick={() => go(k)}
                        className={cx(
                          'rounded-md px-1.5 py-0.5 font-mono text-[12.5px] transition-colors hover:bg-bg-2',
                          k === at ? 'bg-accent text-accent-fg hover:bg-accent' : guess && results[k] ? (results[k]!.right ? 'text-ok' : 'text-err') : 'text-fg-2 hover:text-fg',
                        )}
                      >
                        {guess && k > at ? '…' : l.short}
                      </button>
                    ) : null,
                  )}
                </div>
              )}
              <div className="min-h-[3.5rem] rounded-xl bg-bg-1 px-3.5 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  {label && <span className="font-mono text-[16px] font-semibold">{label}</span>}
                  {turnText && <span className="text-[12.5px] text-fg-3">{turnText}</span>}
                </div>
                {guess && result !== undefined && (
                  <div className={cx('mt-1 text-[13px] font-medium', result?.right ? 'text-ok' : 'text-fg-2')}>
                    {result === null ? tr('Shown, not guessed.') : result.right ? tr('Right!') : fill(tr('You said {0}.'), result.said)}
                  </div>
                )}
                {comment && <Md text={comment} className="mt-1 text-[13.5px] text-fg-2" />}
              </div>
              {guess && next >= 0 && nextMove && (
                <div className="mt-3 rounded-xl border border-accent/40 px-3.5 py-3">
                  <div className="mb-2 text-[13px] font-semibold">{mover === 'b' ? tr('What did Black play?') : mover === 'w' ? tr('What did White play?') : tr('Your move')}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={said}
                      onChange={(e) => setSaid(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && said.trim()) {
                          e.preventDefault();
                          checkGuess(false);
                        }
                      }}
                      placeholder="Nf3"
                      aria-label={tr('Your move')}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className="h-8 w-28 rounded-lg border border-line-2 bg-bg-1 px-2.5 font-mono text-[14px] text-fg outline-none focus:border-accent focus:bg-panel"
                    />
                    <Btn primary icon={<Check size={14} />} disabled={!said.trim()} onClick={() => checkGuess(false)}>
                      {tr('Check')}
                    </Btn>
                    <Btn onClick={() => checkGuess(true)}>{tr('Show the move')}</Btn>
                  </div>
                </div>
              )}
              {ended && (
                <Outcome score={rightCount} total={tried.length} text={fill(tr('{0} of {1} moves guessed'), rightCount, tried.length)}>
                  <Btn icon={<RotateCcw size={13} />} onClick={() => (setGuesses({}), go(0))}>
                    {tr('Start over')}
                  </Btn>
                  <Btn primary icon={<Send size={13} />} onClick={() => ask(`${headOf(data)}${fill(tr('I guessed {0} of {1} moves.'), rightCount, tried.length)}`)}>
                    {tr('Send my result')}
                  </Btn>
                </Outcome>
              )}
              {n > 1 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <IconBtn icon={<ChevronFirst size={15} />} disabled={!done || at === 0} onClick={() => go(0)} title={tr('First')} />
                  <IconBtn icon={<ChevronLeft size={15} />} disabled={!done || at === 0} onClick={() => go(at - 1)} title={tr('Previous')} />
                  <span className="min-w-[52px] text-center text-[12.5px] text-fg-3 tabular-nums">{`${at + 1} / ${n}`}</span>
                  <IconBtn icon={<ChevronRight size={15} />} disabled={!done || at >= n - 1 || guess} onClick={() => go(at + 1)} title={tr('Next')} />
                  <IconBtn icon={<ChevronLast size={15} />} disabled={!done || at >= n - 1 || guess} onClick={() => go(n - 1)} title={tr('Last')} />
                  {done && (
                    <SmallButton on={guess} onClick={() => (setGuessing(!guessing), setSaid(''))} icon={<Target size={13} />}>
                      {tr('Guess the moves')}
                    </SmallButton>
                  )}
                </div>
              )}
              {done && n > 0 && (
                <div className="mt-3">
                  <SmallButton
                    onClick={() => ask(`${headOf(data)}${label ? `${fill(tr('After {0}'), label)} ` : ''}(FEN ${str(pos?.fen).trim()}): `)}
                    icon={<MessageSquarePlus size={13} />}
                  >
                    {tr('Ask about this position')}
                  </SmallButton>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
  'fill-blanks': FillBlanks,
  matching: Matching,
  ordering: Ordering,
  conjugation: Conjugation,
  dialogue: Dialogue,
  rubric: Rubric,
  chess: Chess,
};
