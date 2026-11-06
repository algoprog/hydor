// Before a deck is made PowerPoint compatible: what PowerPoint cannot keep of it, slide by slide, and what each
// becomes (a picture of it, the nearest effect PowerPoint has, or nothing), with Make it compatible or Cancel.
// Going back to the web format needs no asking: nothing is lost that way.
import { useMemo } from 'react';
import { richFeatures, toPowerPoint, type Deck } from '@shared/slides';
import { Button, Dialog } from '../../../components/ui';
import { becomes, featuresBySlide } from './ops';

const BECOMES: Record<NonNullable<ReturnType<typeof becomes>>, string> = {
  picture: 'Becomes a picture of it',
  nearest: 'Becomes the nearest PowerPoint has',
  gone: 'Left out',
};

export function FormatDialog({ open, deck, onClose, onConfirm }: { open: boolean; deck: Deck; onClose: () => void; onConfirm: (next: Deck) => void }) {
  const got = useMemo(() => {
    if (!open) return null;
    const after = toPowerPoint(deck);
    return { after, slides: featuresBySlide(richFeatures(deck)), deck };
  }, [open, deck]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Make it PowerPoint compatible?"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" autoFocus onClick={() => got && onConfirm(got.after)}>
            Make it compatible
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13.5px] leading-relaxed text-fg-2">
        <p>The deck keeps to what PowerPoint has, so its PowerPoint file opens the same in PowerPoint, Keynote and Google Slides. While it is on, the web format’s parts and effects are not offered.</p>
        {got && !got.slides.length && <p>Nothing in it changes.</p>}
        {got && got.slides.length > 0 && (
          <>
            <p>What PowerPoint can’t keep changes:</p>
            <div className="space-y-2.5 rounded-xl border border-line bg-bg-1 px-3 py-2.5">
              {got.slides.map(({ slide, items }) => (
                <div key={slide}>
                  <div className="text-[12px] font-semibold tracking-wide text-fg-3 uppercase">{`Slide ${slide}`}</div>
                  <ul className="mt-0.5 space-y-0.5">
                    {items.map((f, i) => {
                      const how = becomes(got.deck, got.after, f);
                      return (
                        <li key={`${f.el ?? ''}${i}`} className="flex gap-2 text-[13px]">
                          <span className="min-w-0 flex-1 text-fg">{f.what}</span>
                          {how && <span className="shrink-0 text-right text-fg-3">{BECOMES[how]}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <p className="text-[12.5px] text-fg-3">Undo brings them back. Unticking File → PowerPoint compatible gives the web format again, without what was changed.</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
