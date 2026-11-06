// The other ways to present, beside the slideshow and the presenter's view (Present's menu, and Slide → More ways to
// present): Play the narration (where a slide has one), Rehearse with coach, and Record a video (where the browser can,
// never on a phone); and what each opens.
import { Circle, Timer, Volume2 } from 'lucide-react';
import type { Deck } from '@shared/slides';
import { MenuItem, MenuSep } from '../../../components/ui';
import { Coach } from './Coach';
import { Slideshow } from './Present';
import { canRecordShow, Recorder } from './Record';

export type ShowHow = 'narrate' | 'coach' | 'record';

/** Whether a deck has a slide shown with a narration (Play the narration is offered). */
export const narrated = (d: Deck) => d.slides.some((s) => s.narration && !s.hidden);

/** Present's menu's other ways, after a line. */
export function PresentMoreItems({ deck, onPick }: { deck: Deck; onPick: (how: ShowHow) => void }) {
  return (
    <>
      <MenuSep />
      {narrated(deck) && (
        <MenuItem icon={<Volume2 size={14} />} onClick={() => onPick('narrate')}>
          Play the narration
        </MenuItem>
      )}
      <MenuItem icon={<Timer size={14} />} onClick={() => onPick('coach')}>
        Rehearse with coach
      </MenuItem>
      {canRecordShow() && (
        <MenuItem icon={<Circle size={13} />} onClick={() => onPick('record')}>
          Record a video
        </MenuItem>
      )}
    </>
  );
}

/** The menu bar's (Slide → More ways to present): the same, as its items. */
export function presentMoreMenu(deck: Deck, pick: (how: ShowHow) => void) {
  return [
    narrated(deck) && { label: 'Play the narration', icon: <Volume2 size={14} />, also: 'narration voice over audio narrated', run: () => pick('narrate') },
    { label: 'Rehearse with coach', icon: <Timer size={14} />, also: 'rehearse practise practice coach speaker pace filler timings', run: () => pick('coach') },
    canRecordShow() && { label: 'Record a video', icon: <Circle size={13} />, also: 'record video screen recording camera', run: () => pick('record') },
  ];
}

/** What one of them opens, over everything. */
export function ShowAs({ how, deck, from, pageId, title, change, onClose }: { how: ShowHow; deck: Deck; from: number; pageId?: string; title?: string; change: (f: (d: Deck) => Deck) => void; onClose: () => void }) {
  if (how === 'narrate') return <Slideshow deck={deck} from={from} pageId={pageId} title={title} narrate onClose={onClose} />;
  if (how === 'coach') return <Coach deck={deck} from={from} pageId={pageId} title={title} change={change} onClose={onClose} />;
  return <Recorder deck={deck} from={from} pageId={pageId} title={title} onClose={onClose} />;
}
