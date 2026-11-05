// The signature pad: draw with a mouse, a finger or a pen (the line follows a pen's pressure, or the hand's speed),
// type your name in handwriting, or upload a photo of your signature (its paper made see-through). The pad is white
// as paper in either theme, so the ink shows as it will print. Its handle gives the finished picture, cropped to the
// ink, see-through around it (picture.ts).
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { Eraser, ImageUp, Undo2 } from 'lucide-react';
import type { SignatureKind } from '@shared/signatures';
import { Button, cx, IconButton, inputCls, Segmented, useIsMobile } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { drawStroke, drawTail, INKS, Nib, type Stroke } from './ink';
import { HAND_STYLES, loadHandwriting } from './handwriting';
import { pictureUrl, strokesPicture, typedPicture, uploadedPicture, type SignaturePicture } from './picture';

export interface PadHandle {
  /** The finished picture, or null when nothing is drawn, typed or uploaded yet. */
  picture(): Promise<SignaturePicture | null>;
}

type Way = 'draw' | 'type' | 'upload';

/** The pad's own units: its width is 1000 of them, whatever its size on screen. */
const UNITS = 1000;

/** Ink colour dots. */
function Inks({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {INKS.map((k) => (
        <button key={k.color} type="button" aria-label={k.label} title={k.label} aria-pressed={value === k.color} onClick={() => onChange(k.color)} className="flex h-9 w-9 items-center justify-center rounded-full max-md:h-11 max-md:w-11">
          {/* On white, as on paper: black shows in a dark theme too. */}
          <span className={cx('flex h-6 w-6 items-center justify-center rounded-full bg-white', value === k.color ? 'ring-2 ring-accent' : 'ring-1 ring-line-2')}>
            <span className="block h-4 w-4 rounded-full" style={{ background: k.color }} />
          </span>
        </button>
      ))}
    </div>
  );
}

function DrawPad({ kind, color, setColor, onChange, take }: { kind: SignatureKind; color: string; setColor: (c: string) => void; onChange: (has: boolean) => void; take: (f: () => Promise<SignaturePicture | null>) => void }) {
  const mobile = useIsMobile();
  const host = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const [count, setCount] = useState(0);
  // The pointer drawing now, its stroke and how its width goes.
  const live = useRef<{ id: number; stroke: Stroke; nib: Nib; last: { x: number; y: number } } | null>(null);
  const size = useRef({ w: 1, h: 1, dpr: 1 });

  const redraw = () => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const k = (size.current.w / UNITS) * size.current.dpr;
    for (const s of strokes.current) drawStroke(ctx, s, k);
  };

  // The canvas as large as its box, sharp on any screen; what is drawn stays where it was across the pad.
  useLayoutEffect(() => {
    const el = host.current;
    const c = cv.current;
    if (!el || !c) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      size.current = { w: Math.max(1, r.width), h: Math.max(1, r.height), dpr };
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new ink colours the whole signature, as one pen would.
  useEffect(() => {
    if (!strokes.current.length) return;
    for (const s of strokes.current) s.color = color;
    redraw();
  }, [color]);

  useEffect(() => take(async () => (strokes.current.length ? strokesPicture(strokes.current) : null)), [take]);
  useEffect(() => onChange(false), [onChange]);

  const changed = () => {
    setCount(strokes.current.length);
    onChange(strokes.current.length > 0);
  };
  const undo = () => {
    strokes.current.pop();
    redraw();
    changed();
  };
  const clear = () => {
    strokes.current = [];
    redraw();
    changed();
  };

  const at = (e: { clientX: number; clientY: number }) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const add = (e: PointerEvent | React.PointerEvent, first = false) => {
    const l = live.current;
    if (!l) return;
    const ctx = cv.current!.getContext('2d')!;
    const k = (size.current.w / UNITS) * size.current.dpr;
    const toUnits = UNITS / size.current.w;
    const events = !first && 'getCoalescedEvents' in e && typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) {
      const p = at(ev);
      if (!first && Math.hypot(p.x - l.last.x, p.y - l.last.y) < 0.6) continue;
      const pressure = ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : null;
      const w = l.nib.width(p.x, p.y, ev.timeStamp, pressure);
      l.stroke.pts.push({ x: p.x * toUnits, y: p.y * toUnits, w: w * toUnits });
      l.last = p;
      drawTail(ctx, l.stroke, k);
    }
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (live.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const stroke: Stroke = { color, pts: [] };
    // The line's width in screen pixels: a little fuller on a tall pad.
    live.current = { id: e.pointerId, stroke, nib: new Nib(Math.min(3.6, Math.max(2.4, size.current.h / 62))), last: at(e) };
    strokes.current.push(stroke);
    add(e, true);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (live.current?.id === e.pointerId) add(e.nativeEvent);
  };
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const l = live.current;
    if (!l || l.id !== e.pointerId) return;
    live.current = null;
    const ctx = cv.current!.getContext('2d')!;
    drawTail(ctx, l.stroke, (size.current.w / UNITS) * size.current.dpr, true);
    changed();
  };

  return (
    <div className="space-y-1.5">
      <div ref={host} className={cx('relative w-full overflow-hidden rounded-xl bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-line-2', kind === 'initials' ? 'h-36' : mobile ? 'h-48' : 'h-44')}>
        {/* Where to sign: a line near the bottom, an × at its start. Not part of the picture. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-5 bottom-[26%] flex items-end gap-1.5 border-b border-dashed border-[#9ca3af]">
          <span className="-mb-0.5 text-[15px] leading-none text-[#9ca3af]">×</span>
        </div>
        {count === 0 && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[22%] text-center text-[13px] text-[#9ca3af]">
            {kind === 'initials' ? 'Draw your initials here' : 'Sign here'}
          </div>
        )}
        <canvas
          ref={cv}
          tabIndex={0}
          aria-label={kind === 'initials' ? 'Drawing area for your initials' : 'Drawing area for your signature'}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
              e.preventDefault();
              undo();
            }
          }}
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        />
      </div>
      <div className="flex items-center gap-1">
        <Inks value={color} onChange={setColor} />
        <div className="flex-1" />
        {/* On a phone, beside the inks, as icons of a finger's size. */}
        {mobile ? (
          <>
            <IconButton label="Undo" disabled={!count} onClick={undo} className="!h-11 !w-11">
              <Undo2 size={18} />
            </IconButton>
            <IconButton label="Clear" disabled={!count} onClick={clear} className="!h-11 !w-11">
              <Eraser size={18} />
            </IconButton>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} disabled={!count} onClick={undo}>
              Undo
            </Button>
            <Button size="sm" variant="ghost" icon={<Eraser size={14} />} disabled={!count} onClick={clear}>
              Clear
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function TypePad({ kind, color, setColor, name, onChange, take }: { kind: SignatureKind; color: string; setColor: (c: string) => void; name?: string; onChange: (has: boolean) => void; take: (f: () => Promise<SignaturePicture | null>) => void }) {
  const [text, setText] = useState(name ?? '');
  const [style, setStyle] = useState(HAND_STYLES[0].id);
  const [fonts, setFonts] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadHandwriting().then(() => alive && setFonts(true));
    return () => {
      alive = false;
    };
  }, []);
  const hand = HAND_STYLES.find((s) => s.id === style) ?? HAND_STYLES[0];
  useEffect(() => onChange(!!text.trim()), [text, onChange]);
  useEffect(() => take(async () => (text.trim() ? (await loadHandwriting(), typedPicture(text, hand, color)) : null)), [take, text, hand, color]);
  return (
    <div className="space-y-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        maxLength={60}
        placeholder={kind === 'initials' ? tr('Your initials') : tr('Your name')}
        aria-label={kind === 'initials' ? tr('Your initials') : tr('Your name')}
        translate="no"
        className={inputCls}
      />
      <div role="radiogroup" aria-label="Handwriting" className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {HAND_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={style === s.id}
            aria-label={s.label}
            title={s.label}
            onClick={() => setStyle(s.id)}
            className={cx('flex h-16 min-w-0 items-center justify-center overflow-hidden rounded-xl bg-white px-2 ring-1', style === s.id ? 'ring-2 ring-accent' : 'ring-line-2 hover:ring-fg-3')}
          >
            <span translate="no" className="truncate leading-normal" style={{ fontFamily: s.family, fontSize: 30 * s.scale, color, visibility: fonts ? 'visible' : 'hidden' }}>
              {text.trim() || (kind === 'initials' ? 'A.R.' : tr('Your name'))}
            </span>
          </button>
        ))}
      </div>
      <Inks value={color} onChange={setColor} />
    </div>
  );
}

function UploadPad({ onChange, take }: { onChange: (has: boolean) => void; take: (f: () => Promise<SignaturePicture | null>) => void }) {
  const [pic, setPic] = useState<SignaturePicture | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  useEffect(() => take(async () => pic), [take, pic]);
  useEffect(() => onChange(false), [onChange]);
  const use = async (f: File | null | undefined) => {
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      const p = await uploadedPicture(f);
      if (!p) setError(tr('No signature was found in that picture: try one with dark ink on plain paper.'));
      setPic(p);
      onChange(!!p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const choose = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/heic';
    input.onchange = () => void use(input.files?.[0]);
    input.click();
  };
  return (
    <div className="space-y-1.5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void use([...e.dataTransfer.files].find((f) => f.type.startsWith('image/')));
        }}
        className={cx(
          'flex h-44 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl p-3 ring-1',
          pic ? 'bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#ffffff_0%_50%)] [background-size:14px_14px] ring-line-2' : 'border-2 border-dashed border-line-2 ring-transparent',
          over && 'border-accent',
        )}
      >
        {pic ? (
          <img src={pictureUrl(pic)} alt="Your signature, its paper made see-through" className="max-h-full max-w-full object-contain" />
        ) : (
          <>
            <Button size="sm" variant="secondary" icon={<ImageUp size={14} />} disabled={busy} onClick={choose} className="max-md:h-10">
              {busy ? 'Reading the picture' : 'Choose a picture'}
            </Button>
            <p className="max-w-[340px] text-center text-[12.5px] leading-snug text-fg-3">A photo or scan of your signature on plain paper; its paper is made see-through. Or drop one here.</p>
          </>
        )}
      </div>
      {pic && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" icon={<ImageUp size={14} />} disabled={busy} onClick={choose} className="max-md:h-10">
            Choose another
          </Button>
        </div>
      )}
      {error && <p className="text-[12.5px] text-err">{error}</p>}
    </div>
  );
}

/**
 * The pad: Draw, Type or Upload. `onChange` says whether there is a signature to keep yet; the handle (`ref`) gives its
 * picture. `name`: what Type starts with.
 */
export function SignaturePad({ kind, name, onChange, ref }: { kind: SignatureKind; name?: string; onChange?: (has: boolean) => void; ref?: Ref<PadHandle> }) {
  const [way, setWay] = useState<Way>('draw');
  const [color, setColor] = useState(INKS[0].color);
  const taker = useRef<(() => Promise<SignaturePicture | null>) | null>(null);
  const take = useRef((f: () => Promise<SignaturePicture | null>) => {
    taker.current = f;
  }).current;
  const tell = useRef(onChange);
  tell.current = onChange;
  const has = useRef((v: boolean) => tell.current?.(v)).current;
  useImperativeHandle(ref, () => ({ picture: () => taker.current?.() ?? Promise.resolve(null) }), []);
  return (
    <div className="space-y-2">
      <Segmented
        size="sm"
        value={way}
        onChange={setWay}
        options={[
          { value: 'draw', label: 'Draw it' },
          { value: 'type', label: kind === 'initials' ? 'Type your initials' : 'Type your name' },
          { value: 'upload', label: 'Upload a picture' },
        ]}
      />
      {/* As tall whichever way is open, so the dialog around it keeps its place. */}
      <div className={kind === 'initials' ? 'min-h-[11.5rem]' : 'min-h-[14rem]'}>
        {way === 'draw' && <DrawPad kind={kind} color={color} setColor={setColor} onChange={has} take={take} />}
        {way === 'type' && <TypePad kind={kind} color={color} setColor={setColor} name={name} onChange={has} take={take} />}
        {way === 'upload' && <UploadPad onChange={has} take={take} />}
      </div>
    </div>
  );
}
