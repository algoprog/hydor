// Fill & sign's signature: one of your saved signatures (a tap places it on the page), or one drawn, typed or uploaded
// on the signature pad, kept for later when you tick it, as Insert → Signature does in documents. What goes on the page
// is a picture of the signature; the PDF gets it when you save (a saved one is read by the server, never sent back).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { defaultSignatureName, signatureName, type SignatureKind } from '@shared/signatures';
import { Button, cx, Dialog, inputCls, Segmented, Throbber } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { toast, toastError } from '../../../lib/store';
import { SignaturePad, type PadHandle } from '../../signatures/Pad';
import { pictureUrl } from '../../signatures/picture';
import { saveSignature, signatureSrc, useSignatures } from '../../signatures/saved';
import { SignatureTile } from '../../signatures/SignatureSettings';

/** A signature to place: a saved one (by id) or one drawn now (its PNG), what shows it, and its size in pixels. */
export interface ChosenSignature {
  id?: string;
  png?: string;
  src: string;
  width: number;
  height: number;
  kind: SignatureKind;
}

export function PlaceSignature({ open, onClose, onPlace }: { open: boolean; onClose: () => void; onPlace: (s: ChosenSignature) => void }) {
  const [list] = useSignatures();
  const [drawing, setDrawing] = useState(false);
  const [kind, setKind] = useState<SignatureKind>('signature');
  const [keep, setKeep] = useState(false);
  const [name, setName] = useState('');
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const pad = useRef<PadHandle>(null);
  const onHas = useCallback((v: boolean) => setHas(v), []);
  useEffect(() => {
    if (open) setDrawing(false);
  }, [open]);
  // With none saved, the pad is all there is.
  const pads = drawing || (list !== null && list.length === 0);

  const placeDrawn = async () => {
    setBusy(true);
    try {
      const picture = await pad.current?.picture();
      if (!picture) {
        toast(tr('Draw, type or upload a signature first'), 'error');
        return;
      }
      if (keep) {
        const s = await saveSignature({ name: signatureName(name) || tr(defaultSignatureName(kind)), kind, picture });
        onPlace({ id: s.id, src: signatureSrc(s), width: s.width, height: s.height, kind: s.kind });
      } else onPlace({ png: picture.png, src: pictureUrl(picture), width: picture.width, height: picture.height, kind });
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a signature"
      width={600}
      footer={
        pads ? (
          <>
            {list && list.length > 0 && (
              <Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => setDrawing(false)} className="mr-auto">
                Your signatures
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy || !has} onClick={() => void placeDrawn()}>
              {busy ? 'Placing' : 'Place it'}
            </Button>
          </>
        ) : undefined
      }
    >
      {list === null ? (
        <div className="flex h-40 items-center justify-center text-fg-3">
          <Throbber size={28} />
        </div>
      ) : !pads ? (
        <div className="space-y-2 pb-2">
          <p className="text-[13px] text-fg-3">Pick one to place it on the page, then drag it where it goes.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onPlace({ id: s.id, src: signatureSrc(s), width: s.width, height: s.height, kind: s.kind });
                  onClose();
                }}
                className="group flex min-w-0 flex-col gap-1.5 rounded-xl p-1.5 text-left hover:bg-bg-2 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
              >
                <SignatureTile s={s} className="h-20 w-full group-hover:ring-fg-3" />
                <span className="truncate px-0.5 text-[12.5px] text-fg-2" translate="no">
                  {s.name}
                </span>
              </button>
            ))}
            <button type="button" onClick={() => setDrawing(true)} className="flex min-w-0 flex-col gap-1.5 rounded-xl p-1.5 text-left hover:bg-bg-2 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none">
              <span className="flex h-20 w-full items-center justify-center rounded-lg border-2 border-dashed border-line-2 text-fg-3">
                <Plus size={20} />
              </span>
              <span className="truncate px-0.5 text-[12.5px] text-fg-2">Draw a new one</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Segmented
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'signature', label: 'Signature' },
              { value: 'initials', label: 'Initials' },
            ]}
          />
          <SignaturePad key={kind} ref={pad} kind={kind} onChange={onHas} />
          <div className="flex min-h-9.5 flex-wrap items-center gap-x-3 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-2 max-md:min-h-11">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Keep it for later
            </label>
            {keep && <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={tr(defaultSignatureName(kind))} aria-label={tr('Name')} translate="no" className={cx(inputCls, 'min-w-0 flex-1 basis-48')} />}
          </div>
        </div>
      )}
    </Dialog>
  );
}
