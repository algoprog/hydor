// Animate every slide in one click, in the Animate tab, as Canva's Magic Animate: Subtle, Lively or Striking
// (shared/deck-animate.ts: the title first, then the words a row at a time, bullets one by one, numbers counting up
// and lines drawing in a web deck, pictures after, Morph between slides that share parts), or every animation taken
// off; one step to undo. Then the slide on view plays as the slideshow will play it, small, to see what it does.
import { useEffect, useRef, useState } from 'react';
import { Feather, Play, Sparkles, Zap } from 'lucide-react';
import { animateDeck, type AnimateStyle } from '@shared/deck-animate';
import type { Deck } from '@shared/slides';
import type { Show } from '@shared/slides-runtime';
import { toast } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { Button, cx } from '../../../components/ui';
import { Section } from './controls';
import { PICS, RT } from './rt';

const STYLES: { id: AnimateStyle; label: string; title: string; icon: typeof Zap }[] = [
  { id: 'subtle', label: 'Subtle', title: 'Things fade in, calm and quick', icon: Feather },
  { id: 'lively', label: 'Lively', title: 'Things rise and slide in, lines draw, numbers count up', icon: Sparkles },
  { id: 'bold', label: 'Striking', title: 'Things drop, pop and flip in; the slides turn as a cube', icon: Zap },
];

/**
 * The slide on view playing as the slideshow comes to it, small: from the slide before (its transition, Morph too),
 * then its animations (live parts as their posters).
 */
function Preview({ deck, index, run }: { deck: Deck; index: number; run: number }) {
  const host = useRef<HTMLDivElement>(null);
  const show = useRef<Show | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.textContent = '';
    const s = RT.show(el, deck, { mode: 'viewer', at: Math.max(0, index - 1), step: index > 0 ? 999 : 0, withHidden: true, keys: false, words: { prev: tr('Previous'), next: tr('Next') }, ...PICS });
    show.current = s;
    const t = window.setTimeout(() => (index > 0 ? s.next() : s.go(index, 0)), 350);
    return () => {
      window.clearTimeout(t);
      s.destroy();
      show.current = null;
    };
    // Played again each time it is asked for (and for another slide); the deck as it was then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, index]);
  return <div ref={host} aria-label="The slide, as it plays" className="pointer-events-none overflow-hidden rounded-lg [&_.ns-bar]:hidden! [&_.ns-stage]:rounded-lg" />;
}

export function AnimateEvery({ deck, index, change, readOnly }: { deck: Deck; index: number; change: (d: Deck | ((d: Deck) => Deck)) => void; readOnly?: boolean }) {
  const [run, setRun] = useState(0);
  const [last, setLast] = useState<AnimateStyle | null>(null);
  const apply = (style: AnimateStyle | 'none') => {
    change((d) => animateDeck(d, style));
    if (style === 'none') {
      setLast(null);
      toast('Every animation and transition is off', 'ok');
    } else {
      setLast(style);
      setRun((n) => n + 1);
    }
  };
  const has = deck.slides.some((s) => s.anims?.length || (s.transition && s.transition.fx !== 'none'));
  return (
    <Section title="Animate every slide">
      <p className="text-[12px] leading-snug text-fg-3">Each slide’s parts come in by themselves, the title first. It takes the place of the animations the slides have.</p>
      <div className="grid grid-cols-3 gap-1">
        {STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            title={s.title}
            disabled={readOnly}
            onClick={() => apply(s.id)}
            className={cx(
              'flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-[12px] leading-tight text-fg-2 transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-fg disabled:opacity-40',
              last === s.id ? 'border-accent/60 bg-accent-soft text-fg' : 'border-line',
            )}
          >
            <s.icon size={16} className="text-accent" />
            {s.label}
          </button>
        ))}
      </div>
      {has && (
        <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => apply('none')} className="h-7 px-2 text-fg-3">
          Take every animation off
        </Button>
      )}
      {last && (
        <div className="space-y-1.5 pt-1">
          <Preview deck={deck} index={index} run={run} />
          <Button size="sm" variant="ghost" icon={<Play size={13} />} onClick={() => setRun((n) => n + 1)} className="h-7 px-2">
            Play it again
          </Button>
        </div>
      )}
    </Section>
  );
}
