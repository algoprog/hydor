// Check accessibility, in the side panel, as PowerPoint's checker: what makes the deck hard for some people to see,
// read or follow (shared/deck-check.ts), slide by slide, kept up to date as the deck changes. Each says what is wrong,
// goes to it (its slide, the part picked), and where it can be put right for the user, Fix does it (one step to undo);
// a picture without a description gets one written by AI (the model that describes the Library's pictures), to read
// and change in its Format panel. Fix the ones it can puts every fixable one right at once.
import { useMemo, useState } from 'react';
import { AArrowUp, Accessibility as AccessIcon, Contrast, Heading, ImageOff, ListOrdered, Table2, VolumeX, WandSparkles } from 'lucide-react';
import { checkDeck, fixAll, fixIssue, type DeckIssue, type IssueKind } from '@shared/deck-check';
import { everyEl, plainText, slideTitle, type Deck, type El } from '@shared/slides';
import type { DescribeAnswer } from '@shared/write';
import { post } from '../../../lib/api';
import { toast, toastError } from '../../../lib/store';
import { Button, cx, Throbber } from '../../../components/ui';
import { setEls } from './ops';

const ICONS: Record<IssueKind, typeof Contrast> = { alt: ImageOff, small: AArrowUp, contrast: Contrast, title: Heading, order: ListOrdered, autoplay: VolumeX, header: Table2 };

/** A slide's own words, for a picture's description to be in their language and to follow their sense. */
const slideWords = (d: Deck, i: number) =>
  everyEl(d.slides[i]?.els ?? [])
    .map((e) => (e.type === 'text' || e.type === 'shape' ? plainText(e.paras) : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);

const keyOf = (x: DeckIssue) => `${x.slide}|${x.kind}|${x.el ?? ''}`;

export function AccessibilityPanel({ deck, index, readOnly, change, onGo }: { deck: Deck; index: number; readOnly?: boolean; change: (d: Deck | ((d: Deck) => Deck)) => void; onGo: (slide: number, el?: string) => void }) {
  const issues = useMemo(() => checkDeck(deck), [deck]);
  const [describing, setDescribing] = useState<Set<string>>(new Set());
  const fixable = issues.filter((x) => x.fix).length;
  const bySlide = useMemo(() => {
    const out = new Map<number, DeckIssue[]>();
    for (const x of issues) out.set(x.slide, [...(out.get(x.slide) ?? []), x]);
    return [...out.entries()];
  }, [issues]);
  const fix = (x: DeckIssue) => change((d) => fixIssue(d, { ...x, ...(checkDeck(d).find((y) => keyOf(y) === keyOf(x)) ?? {}) }));
  const fixEvery = () => {
    let fixed = 0;
    change((d) => {
      const r = fixAll(d);
      fixed = r.fixed;
      return r.deck;
    });
    toast(fixed === 1 ? '1 put right' : `${fixed} put right`, 'ok');
  };
  const describe = async (x: DeckIssue) => {
    if (!x.src || !x.el) return;
    const k = keyOf(x);
    setDescribing((s) => new Set(s).add(k));
    try {
      const sid = deck.slides[x.slide]?.id;
      const r = await post<DescribeAnswer>('/api/write/describe', { src: x.src, context: slideWords(deck, x.slide) });
      change((d) => {
        const i = d.slides.findIndex((s) => s.id === sid);
        return i < 0 ? d : setEls(d, i, [x.el!], (e) => (e.type === 'image' ? ({ ...e, alt: r.alt } as El) : e));
      });
      toast(`Described: “${r.alt}”`, 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setDescribing((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  };
  return (
    <div className="space-y-3 px-3 py-3">
      <div className="flex items-start gap-2">
        <AccessIcon size={16} className="mt-0.5 shrink-0 text-fg-3" />
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg-2">
          {issues.length
            ? issues.length === 1
              ? '1 thing to look at, so everyone can see, read and follow the slides.'
              : `${issues.length} things to look at, so everyone can see, read and follow the slides.`
            : 'Nothing to put right: everyone can see, read and follow these slides.'}
        </p>
      </div>
      {fixable > 1 && !readOnly && (
        <Button size="sm" variant="secondary" icon={<WandSparkles size={14} />} onClick={fixEvery}>
          {`Fix the ${fixable} it can`}
        </Button>
      )}
      {bySlide.map(([i, list]) => (
        <section key={i} className="space-y-1.5">
          <button type="button" onClick={() => onGo(i)} className={cx('flex w-full min-w-0 items-baseline gap-1.5 text-left text-[12px] font-semibold tracking-wide uppercase', i === index ? 'text-fg' : 'text-fg-2 hover:text-fg')}>
            <span className="shrink-0">{`Slide ${i + 1}`}</span>
            {slideTitle(deck.slides[i]) && (
              <span translate="no" className="min-w-0 truncate font-normal tracking-normal normal-case text-fg-3">
                {slideTitle(deck.slides[i])}
              </span>
            )}
          </button>
          {list.map((x) => {
            const Icon = ICONS[x.kind];
            const k = keyOf(x);
            return (
              <div key={k} className="rounded-lg border border-line px-2.5 py-2">
                <div className="flex gap-2">
                  <Icon size={15} className="mt-0.5 shrink-0 text-warn" />
                  <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg">{x.what}</p>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[23px]">
                  <Button size="sm" variant="ghost" onClick={() => onGo(x.slide, x.el)} className="h-7 px-2">
                    Go to
                  </Button>
                  {x.fix && !readOnly && (
                    <Button size="sm" variant="secondary" onClick={() => fix(x)} className="h-7 px-2.5">
                      {x.fix}
                    </Button>
                  )}
                  {x.kind === 'alt' && x.src && !readOnly && (
                    <Button size="sm" variant="secondary" icon={describing.has(k) ? <Throbber size={13} /> : <WandSparkles size={13} />} disabled={describing.has(k)} onClick={() => void describe(x)} className="h-7 px-2.5">
                      Describe it with AI
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
