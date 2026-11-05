// The conversation's cards about signatures, among the agent's other approvals: one where you draw (or type, or upload)
// the signature an agent asked for and keep it under a name, saved here first so the answer the agent gets carries its
// id alone; and one showing where an agent would place one (the page and the spot, drawn), to allow once, allow for the
// rest of the session, or deny. They show at once, framed as the other approval cards are.
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { FileText, Signature } from 'lucide-react';
import { defaultSignatureName, signatureName, type PlaceSpot, type SignatureAskCard, type SignaturePlaceCard, type SignatureView } from '@shared/signatures';
import type { ApprovalRequest } from '@shared/types';
import { api, enc } from '../../lib/api';
import { basename, dirname, tildify } from '../../lib/format';
import { mu } from '../../lib/machine';
import { toast, toastError, useApp } from '../../lib/store';
import { Button, inputCls } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { Elapsed } from '../session/items';
import { SignaturePad, type PadHandle } from './Pad';

export interface CardProps {
  a: ApprovalRequest;
  sessionKey: string;
  id?: string;
  /** The machine the session is on, when the page shows another's (the inbox). */
  base?: string;
  onDone?: () => void;
}

/** The answer to the card, as the other approval cards send theirs. */
const answer = (p: CardProps, decision: string, form?: Record<string, string>) => api(`/api/sessions/${enc(p.sessionKey)}/approvals/${enc(p.a.id)}`, { method: 'POST', base: p.base, body: { decision, form } });

function Frame({ p, title, children }: { p: CardProps; title: string; children: ReactNode }) {
  return (
    <div id={p.id} className="my-2 overflow-hidden rounded-xl border border-warn/45 bg-panel shadow-[0_0_0_3px_color-mix(in_srgb,var(--warn)_10%,transparent)]">
      <div className="flex items-center gap-2 border-b border-line bg-warn/8 px-3 py-2">
        <Signature size={15} className="shrink-0 text-warn" />
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium">{title}</div>
        <span className="shrink-0 text-[11px] text-fg-3">
          waiting <Elapsed since={p.a.createdAt} />
        </span>
      </div>
      <div className="space-y-3 px-3 py-3">{children}</div>
    </div>
  );
}

function AskCard({ p, ask }: { p: CardProps; ask: SignatureAskCard }) {
  const [name, setName] = useState(ask.name);
  const [keep, setKeep] = useState(true);
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const pad = useRef<PadHandle>(null);
  const onHas = useCallback((v: boolean) => setHas(v), []);
  const save = async () => {
    setBusy(true);
    try {
      const picture = await pad.current?.picture();
      if (!picture) {
        toast(tr('Draw, type or upload a signature first'), 'error');
        setBusy(false);
        return;
      }
      // Kept here first: the agent's answer names it, and never carries the picture.
      const r = await api<{ signature: SignatureView }>('/api/signatures', {
        method: 'POST',
        base: p.base,
        body: { name: signatureName(name) || tr(defaultSignatureName(ask.kind)), kind: ask.kind, image: picture.png, keep },
      });
      await answer(p, 'accept', { signature: r.signature.id });
      p.onDone?.();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  const decline = async () => {
    setBusy(true);
    try {
      await answer(p, 'decline');
      p.onDone?.();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Frame p={p} title={ask.kind === 'initials' ? 'Your initials, please' : 'Your signature, please'}>
      {ask.why && (
        <p className="text-[13.5px] leading-relaxed" translate="no">
          {ask.why}
        </p>
      )}
      <SignaturePad kind={ask.kind} ref={pad} onChange={onHas} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-[13px] text-fg-2">
          <span className="shrink-0">Save it as</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label={tr('Name')} translate="no" className={`${inputCls} h-8.5 min-w-0 flex-1`} />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-2 max-md:min-h-11">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Keep it for later
        </label>
      </div>
      <p className="text-[12px] leading-snug text-fg-3">{keep ? 'Kept, encrypted, in Settings → App → Signatures.' : 'Kept for a day, then it goes.'} The agent never sees it: it hears only its name, and asks you before placing it anywhere.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy || !has} onClick={() => void save()}>
          {busy ? 'Saving' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decline()}>
          Not now
        </Button>
      </div>
    </Frame>
  );
}

/** Where it goes, in words the app's dictionaries translate (the words named are the document's own). */
function spotWords(s: PlaceSpot, page?: number, pages?: number): ReactNode {
  const quote = (w: string) => <span translate="no">“{w}”</span>;
  const which = s.kind === 'words' && s.nth && s.of ? ` (${s.nth} of ${s.of})` : '';
  const at =
    s.kind === 'end' ? (
      'At the end of the document'
    ) : s.kind === 'cell' ? (
      `In table ${s.table}, row ${s.row}, column ${s.column}`
    ) : s.kind === 'point' ? (
      `${Math.round(s.x * 100)}% across and ${Math.round(s.y * 100)}% down`
    ) : (
      <>
        {s.how === 'replace' ? 'In place of' : s.how === 'after' ? (s.table ? 'After the table with' : 'Right after') : s.how === 'right' ? 'Right after' : s.how === 'left' ? 'Before' : s.how === 'above' ? 'Above' : 'Below'} {quote(s.words)}
        {which}
      </>
    );
  return page && pages ? (
    <>
      {`Page ${page} of ${pages}`} · {at}
    </>
  ) : (
    at
  );
}

function PlaceCard({ p, place }: { p: CardProps; place: SignaturePlaceCard }) {
  const home = useApp((s) => s.boot?.home);
  const [busy, setBusy] = useState(false);
  const src = (path: string) => (p.base !== undefined ? p.base + path : mu(path));
  const decide = async (decision: string) => {
    setBusy(true);
    try {
      await answer(p, decision);
      p.onDone?.();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  const t = place.target;
  const kind = place.signature.kind;
  return (
    <Frame p={p} title={kind === 'initials' ? `Place your initials “${place.signature.name}”?` : `Place your signature “${place.signature.name}”?`}>
      <div className="flex min-w-0 items-start gap-2">
        <FileText size={15} className="mt-0.5 shrink-0 text-fg-3" />
        <div className="min-w-0 flex-1 text-[13px] leading-snug">
          <div className="truncate font-medium" translate="no">
            {t.page ? t.page.title : basename(t.path ?? '')}
          </div>
          <div className="truncate text-[12px] text-fg-3">
            {t.page ? (
              'A document of your Library: it gets a new version'
            ) : (
              <>
                <span translate="no">{tildify(dirname(t.path ?? ''), home)}</span>
                {' · '}
                {place.replace ? (
                  'Written over the file'
                ) : (
                  <>
                    {'A signed copy beside it: '}
                    <span translate="no">{basename(place.out ?? '')}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="text-[13px] font-medium">{spotWords(place.spot, place.page, place.pages)}</div>
      {place.picture ? (
        <div className="flex justify-center overflow-hidden rounded-lg bg-white ring-1 ring-line-2">
          <img src={src(place.picture)} alt="The page as it will be signed" className="max-h-[min(60vh,560px)] w-auto max-w-full object-contain" />
        </div>
      ) : (
        place.text && (
          // The words around the spot, the signature among them, on white as on paper.
          <div className="rounded-lg bg-white px-3 py-3 font-serif text-[14px] leading-relaxed break-words text-[#1f2328] ring-1 ring-line-2" translate="no">
            {place.text.before}
            <img src={src(`/api/signatures/${enc(place.signature.id)}/image`)} alt="" className="mx-1 inline-block h-10 align-bottom" style={{ maxWidth: '45%' }} />
            {place.text.after}
          </div>
        )
      )}
      {/* Each sentence an element of its own, so each is translated whole. */}
      <p className="text-[12px] leading-snug text-fg-3">
        {place.text?.float && <span>In front of the words, as if signed on the line, moving nothing.</span>}
        {place.text?.float && ' '}
        {place.widthMm ? <span>{`${place.widthMm} mm wide.`}</span> : null}
        {place.widthMm ? ' ' : null}
        <span>A picture of your signature, not a cryptographic digital signature.</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void decide('accept')}>
          Allow
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void decide('session')}>
          Allow for this session
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decide('deny')}>
          Deny
        </Button>
      </div>
    </Frame>
  );
}

/** A card about a signature: the pad an agent asked for, or where it would place one. */
export function SignatureApproval(p: CardProps) {
  const s = p.a.signature;
  if (s?.ask) return <AskCard p={p} ask={s.ask} />;
  if (s?.place) return <PlaceCard p={p} place={s.place} />;
  return null;
}
