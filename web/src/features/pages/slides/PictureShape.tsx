// A picture's shape and frame, in its Format panel (PowerPoint's Crop to Shape, Canva's frames): its box (square or
// rounded corners) or a shape it is cut to (a circle, an arch, a blob, a hexagon, a heart…), each drawn as the slide
// draws it; and a frame round it (an instant photo's card, a phone, a laptop, a browser window), the part made the
// shape of its frame with the picture whole in its screen. A circle makes the part square; one step to undo each.
import { useRef, useState } from 'react';
import { PICTURE_FRAMES, PICTURE_MASKS, type El, type ImageEl, type PictureFrame, type PictureMask } from '@shared/slides';
import { cx, Popover } from '../../../components/ui';
import { Select } from '../studio/fields';
import { Field } from './controls';
import { PICS, RT } from './rt';

type Shape = 'rect' | 'round' | PictureMask;

export const MASK_NAMES: Record<Shape, string> = {
  rect: 'Rectangle',
  round: 'Rounded corners',
  circle: 'Circle',
  ellipse: 'Ellipse',
  arch: 'Arch',
  blob: 'Blob',
  flower: 'Flower',
  hexagon: 'Hexagon',
  star: 'Star',
  heart: 'Heart',
  triangle: 'Triangle',
  diamond: 'Diamond',
  pentagon: 'Pentagon',
  octagon: 'Octagon',
};

export const FRAME_NAMES: Record<PictureFrame, string> = { polaroid: 'Instant photo', phone: 'Phone', laptop: 'Laptop', browser: 'Browser window' };

const SHAPES: Shape[] = ['rect', 'round', ...PICTURE_MASKS];

/** A shape as a small picture, its outline as the slide cuts it. */
function ShapeMark({ shape, size = 22 }: { shape: Shape; size?: number }) {
  const d = shape === 'rect' ? 'M2,4H22V20H2Z' : shape === 'round' ? 'M7,4H17Q22,4 22,9V15Q22,20 17,20H7Q2,20 2,15V9Q2,4 7,4Z' : RT.maskPath(shape, 20, shape === 'circle' ? 20 : 16);
  const shift = shape === 'rect' || shape === 'round' ? '' : shape === 'circle' ? 'translate(2,2)' : 'translate(2,4)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path d={d} transform={shift || undefined} fill="currentColor" fillOpacity={0.22} stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

const shapeOf = (el: ImageEl): Shape => el.mask ?? (el.radius ? 'round' : 'rect');

/** The size of a picture's own (its natural width over height), or null where it cannot be had. */
function naturalShape(src: string): Promise<number | null> {
  const sha = /^naget-asset:([a-f0-9]{16,64})$/.exec(src)?.[1];
  const url = sha ? PICS.asset!(sha) : /^https?:/.test(src) ? PICS.web!(src) : /^data:image\//.test(src) ? src : '';
  if (!url) return Promise.resolve(null);
  return new Promise((ok) => {
    const i = new Image();
    i.onload = () => ok(i.naturalWidth && i.naturalHeight ? i.naturalWidth / i.naturalHeight : null);
    i.onerror = () => ok(null);
    i.src = url;
  });
}

/**
 * A box for a frame, round its middle: its screen of the picture's own shape (`k`, its width over height) so it shows
 * whole; as tall as the box was for a phone, as wide for the others.
 */
export function frameBox(frame: PictureFrame, box: { x: number; y: number; w: number; h: number }, k: number): { x: number; y: number; w: number; h: number } {
  let w = Math.abs(box.w);
  let h = Math.abs(box.h);
  const byHeight = frame === 'phone';
  for (let i = 0; i < 16; i++) {
    const s = RT.framePlan(frame, w, h, false).screen;
    const now = s.w / Math.max(1, s.h);
    if (Math.abs(now - k) < 0.002) break;
    if (byHeight) w *= k / now;
    else h *= now / k;
  }
  w = Math.round(Math.max(40, Math.min(4000, w)));
  h = Math.round(Math.max(40, Math.min(4000, h)));
  return { x: Math.round(box.x + (box.w - w) / 2), y: Math.round(box.y + (box.h - h) / 2), w, h };
}

/** The picture's Shape and Frame rows. */
export function PictureShapeFields({ el, set }: { el: ImageEl; set: (patch: Partial<El>, key?: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const shape = shapeOf(el);
  const pickShape = (s: Shape) => {
    setOpen(false);
    const patch: Partial<ImageEl> = { mask: s === 'rect' || s === 'round' ? undefined : s, frame: undefined, radius: s === 'round' ? Math.round(Math.min(el.w, el.h) * 0.16) : undefined };
    // A circle is as wide as it is tall: the box made square round its middle.
    if (s === 'circle' && Math.abs(el.w - el.h) > 1) {
      const side = Math.round(Math.min(el.w, el.h));
      Object.assign(patch, { x: Math.round(el.x + (el.w - side) / 2), y: Math.round(el.y + (el.h - side) / 2), w: side, h: side });
    }
    set(patch as Partial<El>);
  };
  const pickFrame = async (f: string) => {
    if (!f) return set({ frame: undefined } as Partial<El>);
    const frame = f as PictureFrame;
    const k = el.crop ? null : await naturalShape(el.src);
    const box = frameBox(frame, el, k ?? (frame === 'phone' ? 9 / 19.5 : frame === 'polaroid' ? 1 : 16 / 10));
    set({ frame, mask: undefined, radius: undefined, ...box } as Partial<El>);
  };
  return (
    <>
      {!el.frame && (
        <Field label="Shape">
          <button
            ref={ref}
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={cx('flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-bg-1 px-2 text-left text-[12.5px] text-fg-2 hover:border-line-2', open && 'border-accent/60')}
          >
            <ShapeMark shape={shape} size={18} />
            <span className="min-w-0 flex-1 truncate">{MASK_NAMES[shape]}</span>
          </button>
          <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={258} title="Its shape">
            <div className="grid grid-cols-7 gap-1 p-1.5">
              {SHAPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  title={MASK_NAMES[s]}
                  aria-label={MASK_NAMES[s]}
                  aria-pressed={s === shape}
                  onClick={() => pickShape(s)}
                  className={cx('grid h-9 place-items-center rounded-lg text-accent hover:bg-bg-2', s === shape && 'bg-accent-soft')}
                >
                  <ShapeMark shape={s} />
                </button>
              ))}
            </div>
          </Popover>
        </Field>
      )}
      <Field label="Frame">
        <Select value={el.frame ?? ''} onChange={(v) => void pickFrame(v)} title="Its frame" options={[{ value: '', label: 'None' }, ...PICTURE_FRAMES.map((f) => ({ value: f, label: FRAME_NAMES[f] }))]} />
      </Field>
    </>
  );
}
