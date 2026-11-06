// Design ideas for the slide on view, in the side panel, as PowerPoint Designer and Canva's Magic Design give them: the
// slide's own words, pictures and data laid out anew a few ways, each drawn small as the slide would look (POST
// /api/write/design-ideas). A click puts one on the slide in its place (one step to undo; another click, another one);
// More ideas asks for other ways. Ideas are for the slide as it was asked about: picked another, or changed since, the
// panel says so and asks again when told to.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Lightbulb, RefreshCw } from 'lucide-react';
import type { Deck, Slide } from '@shared/slides';
import type { IdeasAnswer } from '@shared/write';
import { api } from '../../../lib/api';
import { Button, cx, Throbber } from '../../../components/ui';
import { heightOf, W } from './ops';
import { SlideThumb } from './Thumb';

interface Asked {
  /** The slide the ideas are for, by its id, and how it was then. */
  slide: string;
  was: string;
  ideas: Slide[];
  names: string[];
  /** Every way shown so far (More ideas asks for others). */
  seen: string[];
  model?: string;
}

/** A slide as text, to tell whether it changed. */
const keyOf = (s: Slide | undefined) => (s ? JSON.stringify({ ...s, comments: undefined }) : '');

export function DesignIdeas({ deck, index, fonts, readOnly, onApply }: { deck: Deck; index: number; fonts: number; readOnly?: boolean; onApply: (s: Slide) => void }) {
  const slide = deck.slides[index];
  const [asked, setAsked] = useState<Asked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(268);
  const box = useRef<HTMLDivElement>(null);
  const ctl = useRef<AbortController | null>(null);
  const deckNow = useRef(deck);
  deckNow.current = deck;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(160, Math.floor(el.clientWidth))));
    ro.observe(el);
    setWidth(Math.max(160, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);
  const ask = async (more: boolean) => {
    const d = deckNow.current;
    const at = Math.min(index, d.slides.length - 1);
    const s = d.slides[at];
    if (!s) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    setError(null);
    const seen = more && asked?.slide === s.id ? asked.seen : [];
    try {
      const r = await api<IdeasAnswer>('/api/write/design-ideas', { method: 'POST', body: { deck: d, slide: at, count: 3, avoid: seen }, signal: c.signal });
      if (c.signal.aborted) return;
      setAsked({ slide: s.id, was: keyOf(s), ideas: r.ideas, names: r.names, seen: [...seen, ...r.ways], model: r.model });
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (ctl.current === c) setBusy(false);
    }
  };
  // Asked for as the panel opens; what is on its way stops when it closes.
  useEffect(() => {
    void ask(false);
    return () => ctl.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const at = asked ? deck.slides.findIndex((s) => s.id === asked.slide) : -1;
  const now = at >= 0 ? keyOf(deck.slides[at]) : '';
  const inUse = asked ? asked.ideas.findIndex((x) => keyOf(x) === now) : -1;
  // Picked another slide, or changed this one since (not by putting an idea on it): these ideas are not for it as it is.
  const other = !!asked && !busy && (at !== index || (now !== asked.was && inUse < 0));
  const shown = useMemo(() => (asked && at >= 0 ? asked.ideas.map((x) => ({ ...deck, slides: deck.slides.map((s, k) => (k === at ? x : s)) })) : []), [asked, at, deck]);
  // One column in the side panel; two or three side by side in a wider drawer (a phone, a narrow window).
  const cols = width >= 600 ? 3 : width >= 330 ? 2 : 1;
  const tw = Math.floor((width - (cols - 1) * 12) / cols);
  const h = Math.round((tw * heightOf(deck)) / W);
  const grid = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  return (
    <div className="px-3 py-3">
      <div ref={box} className="space-y-3">
        {other && (
          <div className="space-y-2 rounded-lg border border-line bg-bg-1 px-3 py-2.5 text-[12.5px] text-fg-2">
            <p>{at !== index ? `These ideas are for slide ${at + 1}.` : 'The slide changed since these ideas were drawn up.'}</p>
            <Button size="sm" variant="secondary" icon={<Lightbulb size={14} />} onClick={() => void ask(false)}>
              Ideas for this slide
            </Button>
          </div>
        )}
        {busy && (
          <>
            <p className="flex items-center gap-2 text-[12.5px] text-fg-3">
              <Throbber size={14} />
              Drawing up designs for this slide
            </p>
            <div style={grid} className="grid gap-3">
              {[0, 1, 2].map((k) => (
                <div key={k} style={{ height: h }} className="rounded-lg border border-line bg-bg-2" />
              ))}
            </div>
          </>
        )}
        {!busy && error && (
          <div className="space-y-2">
            <p className="text-[12.5px] text-err">{error}</p>
            <Button size="sm" variant="secondary" onClick={() => void ask(false)}>
              Try again
            </Button>
          </div>
        )}
        {!busy && asked && at >= 0 && (
          <div style={grid} className="grid gap-3">
            {asked.ideas.map((idea, k) => (
              <button
                key={`${asked.seen.join()}-${k}`}
                type="button"
                disabled={readOnly}
                onClick={() => onApply(idea)}
                title={readOnly ? undefined : 'Put this design on the slide'}
                className={cx('block w-full overflow-hidden rounded-lg border text-left transition-colors', k === inUse ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-2')}
              >
                <SlideThumb deck={shown[k]} index={at} slide={idea} theme={deck.theme} width={tw - 2} fonts={fonts} />
                <span className="flex items-center gap-1.5 border-t border-line px-2 py-1.5 text-[12px] text-fg-2">
                  <span className="min-w-0 flex-1 truncate">{asked.names[k]}</span>
                  {k === inUse && (
                    <span className="flex shrink-0 items-center gap-1 text-accent">
                      <Check size={13} />
                      On the slide
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
        {!busy && asked && !other && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void ask(true)}>
              More ideas
            </Button>
            {asked.model && <span className="min-w-0 flex-1 truncate text-right text-[11.5px] text-fg-3">By {asked.model}</span>}
          </div>
        )}
        {!busy && !asked && !error && !slide?.els.length && <p className="text-[12.5px] text-fg-3">Put words or pictures on the slide, and its design ideas lay them out.</p>}
      </div>
    </div>
  );
}
