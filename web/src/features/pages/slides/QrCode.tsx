// QR codes on slides (Canva's QR code app): Insert → QR code asks for a link or any words and its colours, drawn as it
// will be (by the app's own encoder, shared/qr.ts), and puts it on the slide; its Format panel changes its words and
// colours. A phone's camera reads it; dark squares on a light ground read best.
import { useEffect, useMemo, useState } from 'react';
import { qrCode, qrPath } from '@shared/qr';
import { cssColor, newId, qrPart, type Deck, type El, type QrEl, type Theme } from '@shared/slides';
import { Button, cx, Dialog, inputCls } from '../../../components/ui';
import { ColorButton, Field, Section } from './controls';
import { heightOf, W } from './ops';

/** A code drawn small, as the slide draws it: its squares, a quiet margin of two round them. */
function QrMark({ text, color, bg, theme, size }: { text: string; color?: string; bg?: string; theme: Theme; size: number }) {
  const code = useMemo(() => {
    try {
      return text ? qrCode(text, { level: 'M' }) : null;
    } catch {
      return null;
    }
  }, [text]);
  if (!code) return <div style={{ width: size, height: size }} className="rounded-lg border border-dashed border-line-2" />;
  const light = cssColor(bg ?? '#ffffff', theme, '#ffffff');
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${code.size + 4} ${code.size + 4}`} shapeRendering="crispEdges" aria-hidden className="rounded-md border border-line">
      {light !== 'transparent' && <rect x={-2} y={-2} width={code.size + 4} height={code.size + 4} fill={light} />}
      <path d={qrPath(code)} fill={cssColor(color ?? '#000000', theme, '#000000')} />
    </svg>
  );
}

/** Its colours: the squares', the ground's (or none). */
function QrColours({ color, bg, theme, onChange }: { color?: string; bg?: string; theme: Theme; onChange: (p: { color?: string; bg?: string }) => void }) {
  return (
    <Field label="Colours">
      <ColorButton value={color ?? '#000000'} theme={theme} onChange={(c) => onChange({ color: c === '#000000' ? undefined : c })} label="Its squares" />
      <ColorButton value={bg === 'transparent' ? undefined : (bg ?? '#ffffff')} none="See-through" theme={theme} onChange={(c) => onChange({ bg: c === undefined ? 'transparent' : c === '#ffffff' ? undefined : c })} label="Its ground" />
    </Field>
  );
}

/** Insert → QR code. */
export function QrDialog({ open, deck, onClose, onInsert }: { open: boolean; deck: Deck; onClose: () => void; onInsert: (el: QrEl) => void }) {
  const [text, setText] = useState('');
  const [look, setLook] = useState<{ color?: string; bg?: string }>({});
  useEffect(() => {
    if (open) {
      setText('');
      setLook({});
    }
  }, [open]);
  const words = text.trim();
  const made = words ? qrPart(words) : null;
  const put = () => {
    if (!made) return;
    const side = 240;
    onInsert({ id: newId(), type: 'qr', x: Math.round((W - side) / 2), y: Math.round((heightOf(deck) - side) / 2), w: side, h: side, ...made, ...look });
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="A QR code"
      width={460}
      footer={
        <Button size="sm" variant="primary" disabled={!made} onClick={put}>
          Insert it
        </Button>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          put();
        }}
      >
        <p className="text-[12.5px] text-fg-3">A link (or any words) that a phone’s camera reads: your site, a form, a video, your contact details.</p>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…" aria-label="A link or any words" translate="no" maxLength={1000} className={inputCls} />
        {words && !made && <p className="text-[12px] text-err">That is too long for a QR code: a shorter link.</p>}
        <div className="flex items-center gap-4">
          <QrMark text={made ? words : ''} color={look.color} bg={look.bg} theme={deck.theme} size={132} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <QrColours color={look.color} bg={look.bg} theme={deck.theme} onChange={(p) => setLook((l) => ({ ...l, ...p }))} />
            <p className="text-[11.5px] leading-snug text-fg-3">Dark squares on a light ground read best.</p>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/** A QR code's Format panel: its words, its colours. */
export function QrLook({ el, theme, set }: { el: QrEl; theme: Theme; set: (patch: Partial<El>, key?: string) => void }) {
  const [text, setText] = useState(el.text);
  useEffect(() => setText(el.text), [el.id, el.text]);
  const bad = !!text.trim() && !qrPart(text.trim());
  return (
    <Section title="QR code">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const made = qrPart(e.target.value.trim());
          if (made) set(made as Partial<El>, 'qr');
        }}
        onKeyDown={(e) => e.stopPropagation()}
        rows={2}
        maxLength={1000}
        aria-label="Its link or words"
        placeholder="https://…"
        translate="no"
        className={cx('w-full min-w-0 resize-y rounded-lg border bg-bg-1 px-2 py-1.5 text-[12.5px] outline-none focus:border-accent/60', bad ? 'border-err' : 'border-line')}
      />
      {bad && <p className="text-[11.5px] text-err">Too long for a QR code.</p>}
      <QrColours color={el.color} bg={el.bg} theme={theme} onChange={(p) => set(p as Partial<El>)} />
      <p className="text-[11.5px] leading-snug text-fg-3">A phone’s camera reads it; in PowerPoint it is a picture of it.</p>
    </Section>
  );
}
