// The Rewrite menu of the editors' text toolbars, as Canva's Magic Write: the words picked made shorter, longer,
// simpler, more formal or friendlier, their spelling and grammar fixed, translated, or rewritten as the user says, by
// the helper model (POST /api/write/rewrite). The answer takes their place, looking as they did, one step to undo. In
// the slides: the words selected while a text box is changed in place, else all of the box picked; in documents, the
// words picked (as a suggestion while suggesting). A list or a field opens in the menu's place, never a menu over it.
import { useRef, useState, type RefObject } from 'react';
import { ChevronDown, ChevronRight, Languages, PencilLine, WandSparkles } from 'lucide-react';
import { plainText, slideTitle, type Deck, type El, type TextEl } from '@shared/slides';
import { REWRITE_LABELS, WRITE_LANGS, cleanLang, type RewriteAnswer, type RewriteHow } from '@shared/write';
import { post } from '../../../lib/api';
import { toast, toastError } from '../../../lib/store';
import { Button, cx, inputCls, MenuBack, MenuItem, MenuSep, Popover, Throbber } from '../../../components/ui';
import { findEl, setEls } from './ops';
import type { CanvasHandle } from './SlideCanvas';
import { emptyRange, rangeText, replaceRange, wholeRange, type ParaRange } from './rewriteText';

/** Words to rewrite, and how the new ones go in their place. */
export interface RewriteTarget {
  /** The words, a paragraph a line. */
  text: string;
  /** Words around them, for the sense ("a slide titled “Q3”"). */
  context?: string;
  /** Puts the new words in their place; false when the words changed meanwhile (then nothing is done). */
  put(text: string): boolean;
}

const QUICK: RewriteHow[] = ['shorter', 'longer', 'simpler', 'formal', 'friendly', 'fix'];

/** The Rewrite button and its menu; `target` is asked for the words as it is pressed (null: none are picked). */
export function RewriteButton({ target, label = true, disabled }: { target: () => RewriteTarget | null; label?: boolean; disabled?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'main' | 'langs' | 'lang' | 'ask'>('main');
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState('');
  const picked = useRef<RewriteTarget | null>(null);
  const close = () => {
    setOpen(false);
    setView('main');
    setWords('');
  };
  const start = () => {
    if (busy) return;
    if (open) return close();
    const t = target();
    if (!t || !t.text.trim()) return toast('Pick some words to rewrite');
    picked.current = t;
    setOpen(true);
  };
  const run = async (how: RewriteHow, extra: { lang?: string; ask?: string } = {}) => {
    const t = picked.current;
    close();
    if (!t) return;
    setBusy(true);
    try {
      const r = await post<RewriteAnswer>('/api/write/rewrite', { text: t.text, how, context: t.context, ...extra });
      if (!t.put(r.text)) toast('The words changed while they were rewritten, so they were left as they are');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const lang = cleanLang(words);
  return (
    <>
      <button
        ref={ref}
        type="button"
        title={busy ? 'Rewriting the words' : 'Rewrite the words picked with AI'}
        aria-label="Rewrite"
        aria-expanded={open}
        disabled={disabled}
        data-keeps-editing
        onMouseDown={(e) => e.preventDefault()}
        onClick={start}
        className={cx('flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent', open && 'bg-bg-2')}
      >
        {busy ? <Throbber size={14} /> : <WandSparkles size={15} />}
        {label && <span>{busy ? 'Rewriting' : 'Rewrite'}</span>}
        {!busy && <ChevronDown size={12} className="text-fg-3" />}
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={252} title="Rewrite">
        <div data-keeps-editing onMouseDown={(e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.preventDefault()}>
          {view === 'main' && (
            <>
              {QUICK.map((h) => (
                <MenuItem key={h} onClick={() => void run(h)}>
                  {REWRITE_LABELS[h]}
                </MenuItem>
              ))}
              <MenuSep />
              <MenuItem icon={<Languages size={14} />} submenu onClick={() => setView('langs')}>
                {REWRITE_LABELS.translate}
              </MenuItem>
              <MenuItem icon={<PencilLine size={14} />} submenu onClick={() => setView('ask')}>
                {REWRITE_LABELS.ask}
              </MenuItem>
            </>
          )}
          {view === 'langs' && (
            <>
              <MenuBack onClick={() => setView('main')}>{REWRITE_LABELS.translate}</MenuBack>
              {WRITE_LANGS.map((l) => (
                <MenuItem key={l} onClick={() => void run('translate', { lang: l })}>
                  {l}
                </MenuItem>
              ))}
              <MenuSep />
              <MenuItem icon={<ChevronRight size={14} />} onClick={() => setView('lang')}>
                Another language
              </MenuItem>
            </>
          )}
          {(view === 'lang' || view === 'ask') && (
            <>
              <MenuBack onClick={() => setView(view === 'lang' ? 'langs' : 'main')}>{view === 'lang' ? 'Another language' : REWRITE_LABELS.ask}</MenuBack>
              <form
                className="space-y-2 px-1.5 pt-1 pb-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (view === 'lang' && lang) void run('translate', { lang });
                  else if (view === 'ask' && words.trim()) void run('ask', { ask: words.trim() });
                }}
              >
                <input
                  autoFocus
                  value={words}
                  onChange={(e) => setWords(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={view === 'lang' ? 'Swahili, Hebrew, Thai…' : 'Make it more exciting'}
                  aria-label={view === 'lang' ? 'The language' : 'How to rewrite it'}
                  className={inputCls}
                />
                <div className="flex justify-end">
                  <Button size="sm" variant="primary" type="submit" disabled={view === 'lang' ? !lang : !words.trim()}>
                    {view === 'lang' ? 'Translate' : 'Rewrite'}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </Popover>
    </>
  );
}

// ---- in the slides ------------------------------------------------------------------------------------------------

type TextPart = Extract<El, { type: 'text' | 'shape' }>;

/** Where a place in a text box's words is: its paragraph, and how many characters into it. */
function placeIn(box: HTMLElement, node: Node, offset: number): { p: number; o: number } {
  const paras = Array.from(box.querySelectorAll<HTMLElement>(':scope > .ns-p'));
  const len = (el: HTMLElement | undefined) => (el?.textContent ?? '').replace(/​/g, '').length;
  if (node === box) return offset >= paras.length ? { p: Math.max(0, paras.length - 1), o: len(paras[paras.length - 1]) } : { p: offset, o: 0 };
  const p = paras.findIndex((x) => x.contains(node));
  if (p < 0) return { p: 0, o: 0 };
  const r = document.createRange();
  r.selectNodeContents(paras[p]);
  r.setEnd(node, offset);
  return { p, o: r.toString().replace(/​/g, '').length };
}

/** The words selected in the box being changed in place, as a range of its paragraphs (null: none are). */
function selectedRange(box: HTMLElement): ParaRange | null {
  const s = window.getSelection();
  if (!s?.rangeCount || s.isCollapsed) return null;
  const r = s.getRangeAt(0);
  if (!box.contains(r.startContainer) || !box.contains(r.endContainer)) return null;
  const a = placeIn(box, r.startContainer, r.startOffset);
  const b = placeIn(box, r.endContainer, r.endOffset);
  return { p0: a.p, o0: a.o, p1: b.p, o1: b.o };
}

interface SlidesText {
  deck: Deck;
  index: number;
  els: TextPart[];
  editing: boolean;
  canvas: RefObject<CanvasHandle | null>;
  change: (d: Deck | ((d: Deck) => Deck), key?: string) => void;
}

/** The words to rewrite in a slide: those selected in the box being changed in place, else all of the one box picked. */
export function slidesTarget({ deck, index, els, editing, canvas, change }: SlidesText): RewriteTarget | null {
  if (els.length !== 1) return null;
  const el = els[0];
  const slide = deck.slides[index];
  let paras = el.paras;
  let range: ParaRange | null = null;
  if (editing) {
    const got = canvas.current?.readText();
    if (got?.id === el.id) paras = got.paras;
    const box = canvas.current?.editBox();
    if (box) range = selectedRange(box);
  }
  const r = range && !emptyRange(range) ? range : wholeRange(paras);
  const text = rangeText(paras, r, el);
  if (!text.trim()) return null;
  const title = slideTitle(slide);
  const context = el.role === 'title' ? 'the title of a slide' : title ? `a slide titled “${title}”` : 'a slide';
  const sid = slide.id;
  return {
    text,
    context,
    put(next) {
      // Words being changed in place are kept first (their own step to undo), then the new ones go in.
      if (editing) canvas.current?.stopEditing();
      let done = false;
      change((d) => {
        const i = d.slides.findIndex((s) => s.id === sid);
        const e = i >= 0 ? findEl(d.slides[i].els, el.id) : undefined;
        if (!e || (e.type !== 'text' && e.type !== 'shape') || rangeText(e.paras, r, e) !== text) return d;
        done = true;
        return setEls(d, i, [el.id], (x) => ({ ...x, paras: replaceRange((x as TextEl).paras, r, next, x as TextEl) }) as El);
      });
      return done;
    },
  };
}

/** Whether a part has words to rewrite. */
export const hasWords = (e: El) => (e.type === 'text' || e.type === 'shape') && plainText(e.paras).trim().length > 0;
