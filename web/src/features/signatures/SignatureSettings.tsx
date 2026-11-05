// Settings → App → Signatures: the signatures you keep (a signature, initials), each shown as it will print, with
// what you can do with them: draw a new one, rename one, draw one again, keep one you gave an agent for now only, or
// delete it. Also the dialog that draws a signature and keeps it, which other parts of the app open too.
import { useCallback, useRef, useState } from 'react';
import { Ellipsis, Pencil, PenLine, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { defaultSignatureName, signatureName, type SignatureKind, type SignatureView } from '@shared/signatures';
import { del, enc, patch } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, Dialog, IconButton, inputCls, MenuItem, MenuSep, Popover, Section, Segmented, Throbber, useConfirm } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import { SignaturePad, type PadHandle } from './Pad';
import { saveSignature, signatureSrc, useSignatures } from './saved';

/** A saved signature's picture on white, as on paper. */
export function SignatureTile({ s, className }: { s: Pick<SignatureView, 'id' | 'updatedAt' | 'name'>; className?: string }) {
  return (
    <span className={`flex items-center justify-center overflow-hidden rounded-lg bg-white p-1 ring-1 ring-line-2 ${className ?? 'h-12 w-28'}`}>
      <img src={signatureSrc(s)} alt={s.name} translate="no" draggable={false} className="max-h-full max-w-full object-contain" />
    </span>
  );
}

/**
 * Draws a signature and keeps it: a new one (`kind` to start with), or one drawn again (`redraw`), or only renamed
 * (`rename`). `onSaved` gets it once kept.
 */
export function SignatureDialog({
  open,
  onClose,
  onSaved,
  redraw,
  rename,
  kind: startKind = 'signature',
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (s: SignatureView) => void;
  redraw?: SignatureView;
  rename?: SignatureView;
  kind?: SignatureKind;
}) {
  const [kind, setKind] = useState<SignatureKind>(redraw?.kind ?? startKind);
  const [name, setName] = useState(rename?.name ?? redraw?.name ?? '');
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const pad = useRef<PadHandle>(null);
  const onHas = useCallback((v: boolean) => setHas(v), []);
  const finalName = signatureName(name) || tr(defaultSignatureName(kind));
  const save = async () => {
    setBusy(true);
    try {
      if (rename) {
        const r = await patch<{ signature: SignatureView }>(`/api/signatures/${enc(rename.id)}`, { name: finalName });
        onSaved?.(r.signature);
        onClose();
        return;
      }
      const picture = await pad.current?.picture();
      if (!picture) {
        toast(tr('Draw, type or upload a signature first'), 'error');
        return;
      }
      const s = redraw ? (await patch<{ signature: SignatureView }>(`/api/signatures/${enc(redraw.id)}`, { image: picture.png, name: finalName })).signature : await saveSignature({ name: finalName, kind, picture });
      toast(s.kind === 'initials' ? tr('Saved your initials') : tr('Saved your signature'), 'ok');
      onSaved?.(s);
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
      title={rename ? 'Rename' : redraw ? 'Draw it again' : 'New signature'}
      width={rename ? 400 : 600}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || (!rename && !has)} onClick={() => void save()}>
            {busy ? 'Saving' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!rename && !redraw && (
          <Segmented
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'signature', label: 'Signature' },
              { value: 'initials', label: 'Initials' },
            ]}
          />
        )}
        {!rename && <SignaturePad key={kind} ref={pad} kind={kind} onChange={onHas} />}
        <label className="block">
          <span className="mb-1 block text-[13px] text-fg-2">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && rename && void save()}
            maxLength={60}
            placeholder={tr(defaultSignatureName(kind))}
            translate="no"
            autoFocus={!!rename}
            className={inputCls}
          />
        </label>
      </div>
    </Dialog>
  );
}

function Row({ s, onRename, onRedraw, onDelete, onKeep }: { s: SignatureView; onRename: () => void; onRedraw: () => void; onDelete: () => void; onKeep: () => void }) {
  const [menu, setMenu] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const run = (f: () => void) => () => {
    setMenu(false);
    f();
  };
  const date = (t: number) => new Date(t).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
  const note = s.until ? `Kept until ${new Date(s.until).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : s.usedAt ? `Last placed ${date(s.usedAt)}` : `Added ${date(s.createdAt)}`;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <SignatureTile s={s} className="h-12 w-28 shrink-0 max-md:w-24" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] text-fg" translate="no">
          {s.name}
        </div>
        <div className="truncate text-[12px] text-fg-3">
          {s.kind === 'initials' ? 'Initials' : 'Signature'} · {note}
        </div>
      </div>
      {s.until && (
        <Button size="sm" variant="secondary" onClick={onKeep}>
          Keep it
        </Button>
      )}
      <IconButton ref={more} label="More" active={menu} onClick={() => setMenu((m) => !m)}>
        <Ellipsis size={16} />
      </IconButton>
      <Popover anchor={more} open={menu} onClose={() => setMenu(false)} align="end" width={220}>
        <MenuItem icon={<Pencil size={14} />} onClick={run(onRename)}>
          Rename
        </MenuItem>
        <MenuItem icon={<RefreshCw size={14} />} onClick={run(onRedraw)}>
          Draw it again
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<Trash2 size={14} />} danger onClick={run(onDelete)}>
          Delete
        </MenuItem>
      </Popover>
    </div>
  );
}

export function SignatureSettings() {
  const [list, reload] = useSignatures();
  const [edit, setEdit] = useState<{ mode: 'new' } | { mode: 'redraw' | 'rename'; s: SignatureView } | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const remove = async (s: SignatureView) => {
    const ok = await confirm({
      title: `Delete “${s.name}”?`,
      body: 'Documents and files it is in already keep it; agents can no longer place it.',
      confirm: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await del(`/api/signatures/${enc(s.id)}`).catch(toastError);
    reload();
  };
  const keep = async (s: SignatureView) => {
    await patch(`/api/signatures/${enc(s.id)}`, { keep: true }).catch(toastError);
    reload();
  };
  return (
    <div className="space-y-4">
      <Section
        title="Your signatures"
        actions={
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ mode: 'new' })}>
            New signature
          </Button>
        }
      >
        {list === null ? (
          <Throbber className="text-fg-3" />
        ) : list.length === 0 ? (
          <div className="flex items-center gap-3 py-1">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-2 text-fg-3">
              <PenLine size={18} />
            </span>
            <p className="text-[13px] leading-relaxed text-fg-3">
              None yet. Draw your signature or your initials once, with a mouse, a finger or a pen, or type your name in handwriting; then put it into a document with <b>Insert → Signature</b>, or let an agent place it for you.
            </p>
          </div>
        ) : (
          <div className="-my-1 divide-y divide-line">
            {list.map((s) => (
              <Row key={s.id} s={s} onRename={() => setEdit({ mode: 'rename', s })} onRedraw={() => setEdit({ mode: 'redraw', s })} onDelete={() => void remove(s)} onKeep={() => void keep(s)} />
            ))}
          </div>
        )}
      </Section>
      <p className="px-1 text-[12.5px] leading-relaxed text-fg-3">
        A signature here is a picture of your signature, as ink on paper is: it shows that you signed, but it is not a cryptographic digital signature, which proves who signed a file and that nothing in it changed since. Agents never see it: they
        place it by its name, and only once you allow each placement on a card.
      </p>
      {edit && <SignatureDialog open onClose={() => setEdit(null)} onSaved={reload} redraw={edit.mode === 'redraw' ? edit.s : undefined} rename={edit.mode === 'rename' ? edit.s : undefined} />}
      {confirmNode}
    </div>
  );
}
