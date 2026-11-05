// Insert → Signature in a document: your saved signatures to pick from (one tap puts it in), or the pad to draw one
// there, keeping it for later a tick away. What goes in is a picture of the signature, where the caret is; the editor
// sizes it for a signature line, and it is resized like any picture.
import { useCallback, useRef, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { defaultSignatureName, signatureName, type SignatureKind, type SignatureView } from '@shared/signatures';
import { enc, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, inputCls, Segmented, Throbber } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { SignaturePad, type PadHandle } from './Pad';
import { pictureUrl } from './picture';
import { saveSignature, useSignatures } from './saved';
import { SignatureTile } from './SignatureSettings';

/** What goes into the document: the picture as the document keeps it, and whether it is a signature or initials. */
export interface Inserted {
  src: string;
  kind: SignatureKind;
}

/** A saved signature put into a document: kept as one of the document's pictures. */
export const signatureAsset = (s: Pick<SignatureView, 'id' | 'kind'>) => post<{ src: string }>(`/api/signatures/${enc(s.id)}/asset`).then((r): Inserted => ({ src: r.src, kind: s.kind }));

export function InsertSignature({ open, onClose, onInsert }: { open: boolean; onClose: () => void; onInsert: (p: Inserted) => void }) {
  const [list] = useSignatures();
  const [drawing, setDrawing] = useState(false);
  const [kind, setKind] = useState<SignatureKind>('signature');
  const [keep, setKeep] = useState(false);
  const [name, setName] = useState('');
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const pad = useRef<PadHandle>(null);
  const onHas = useCallback((v: boolean) => setHas(v), []);
  // With none saved, the pad is all there is.
  const pads = drawing || (list !== null && list.length === 0);

  const pick = async (s: SignatureView) => {
    setBusy(true);
    try {
      onInsert(await signatureAsset(s));
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const insertDrawn = async () => {
    setBusy(true);
    try {
      const picture = await pad.current?.picture();
      if (!picture) {
        toast(tr('Draw, type or upload a signature first'), 'error');
        return;
      }
      if (keep) {
        const s = await saveSignature({ name: signatureName(name) || tr(defaultSignatureName(kind)), kind, picture });
        onInsert(await signatureAsset(s));
      } else {
        const r = await post<{ src: string }>('/api/pages/assets', { data: pictureUrl(picture) });
        onInsert({ src: r.src, kind });
      }
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
      title="Insert a signature"
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
            <Button variant="primary" disabled={busy || !has} onClick={() => void insertDrawn()}>
              {busy ? 'Inserting' : 'Insert'}
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
          <p className="text-[13px] text-fg-3">Pick one to put it where the caret is.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => void pick(s)}
                className="group flex min-w-0 flex-col gap-1.5 rounded-xl p-1.5 text-left hover:bg-bg-2 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none disabled:opacity-60"
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
