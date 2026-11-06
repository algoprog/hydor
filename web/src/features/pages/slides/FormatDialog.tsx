// Before a deck is made PowerPoint compatible: what PowerPoint cannot keep of it, slide by slide (and the deck's own,
// such as the progress bar), each with what it becomes: a picture of it, text boxes, the nearest effect PowerPoint
// has ("Typewriter → Appear"), or nothing. Make it compatible, or Cancel. Going back to the web format needs no
// asking: nothing is lost that way.
import { useMemo } from 'react';
import { richFeatures, toPowerPoint, type AnimFx, type Deck, type RichFeature, type TransitionFx } from '@shared/slides';
import { Button, Dialog } from '../../../components/ui';
import { featuresBySlide, findEl, partName } from './ops';
import { FX_NAMES, TR_NAMES } from './names';

/** What it was and what it becomes, for an effect or a transition: "Typewriter → Appear". */
function fromTo(f: RichFeature): string | null {
  if (f.kind === 'effect' && f.from && f.to) return `${FX_NAMES[f.from as AnimFx] ?? f.from} → ${FX_NAMES[f.to as AnimFx] ?? f.to}`;
  if (f.kind === 'transition' && f.from && f.to) return `${TR_NAMES[f.from as TransitionFx] ?? f.from} → ${TR_NAMES[f.to as TransitionFx] ?? f.to}`;
  return null;
}

export function FormatDialog({ open, deck, onClose, onConfirm }: { open: boolean; deck: Deck; onClose: () => void; onConfirm: (next: Deck) => void }) {
  const got = useMemo(() => (open ? { after: toPowerPoint(deck), slides: featuresBySlide(richFeatures(deck)) } : null), [open, deck]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Make it PowerPoint compatible?"
      width={500}
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
            <div className="space-y-3 rounded-xl border border-line bg-bg-1 px-3 py-2.5">
              {got.slides.map(({ slide, items }) => {
                const s = slide > 0 ? deck.slides[slide - 1] : undefined;
                return (
                  <div key={slide}>
                    <div className="text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">{slide > 0 ? `Slide ${slide}` : 'The whole deck'}</div>
                    <ul className="mt-1 space-y-1.5">
                      {items.map((f, i) => {
                        const el = s && f.el ? findEl(s.els, f.el) : undefined;
                        const how = fromTo(f);
                        return (
                          <li key={`${f.kind}:${f.el ?? ''}:${i}`} className="text-[13px] leading-snug">
                            <div className="text-fg">{f.what}</div>
                            {(el || how) && (
                              <div className="flex min-w-0 gap-1.5 text-[12px] text-fg-3">
                                {el && (
                                  <span translate="no" className="min-w-0 truncate">
                                    {partName(el)}
                                  </span>
                                )}
                                {el && how && <span>·</span>}
                                {how && <span className="shrink-0">{how}</span>}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="text-[12.5px] text-fg-3">Undo brings them back. Made for → The web (in the Theme tab) later gives the web format again, without them.</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
