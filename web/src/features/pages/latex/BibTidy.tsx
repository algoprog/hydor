// Tidy the bibliography (a .bib's bar, Tools → Tidy the bibliography): what to do is ticked (sort by key, merge
// duplicates, fix keys, fill missing fields from the entries' DOIs, take out what nothing cites, write every entry the
// same way); Look lists what would change (shared/latex-bibtidy.ts; doi.org asked for the fields, by the server), and
// Apply makes it one change to undo, with the document's citations following keys that changed.
import { useEffect, useState } from 'react';
import { ArrowDownAZ, CopyMinus, KeyRound, ListX, Sparkles, WandSparkles } from 'lucide-react';
import { citedKeys } from '@shared/latex-ai';
import type { BibEntry } from '@shared/latex-bib';
import { bibNeedsFill, fillEntry, tidyBib, type BibTidied, type BibTidyChange, type BibTidyOptions } from '@shared/latex-bibtidy';
import type { TexDoc } from '@shared/latex';
import { Button, Dialog, Throbber } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { toastError } from '../../../lib/store';
import { bibFill } from './api';

type Opts = Required<BibTidyOptions> & { fill: boolean };
const OPTIONS: [keyof Opts, string, string][] = [
  ['sort', 'Sort the entries by key', ''],
  ['duplicates', 'Merge duplicates', 'The same DOI, or the same title and year: one is kept, the citations of the others point at it'],
  ['keys', 'Fix keys', 'Characters BibTeX trips on, a key two entries share, and citations whose key differs from its entry’s in capitals'],
  ['fill', 'Fill missing fields from the DOIs', 'doi.org is asked for each entry with a DOI that lacks a venue, a year, pages…'],
  ['unused', 'Take out the entries nothing cites', 'None when the document cites them all with \\nocite{*}'],
  ['format', 'Write every entry the same way', 'One field a line, in the usual order'],
];
const ICON: Record<BibTidyChange['kind'], typeof ArrowDownAZ> = { sorted: ArrowDownAZ, removed: ListX, merged: CopyMinus, renamed: KeyRound, cite: KeyRound, filled: Sparkles, formatted: WandSparkles };

export function BibTidyDialog({ open, onClose, doc, bib, label, onApply }: { open: boolean; onClose: () => void; doc: TexDoc; bib: string; label: (n: string) => string; onApply: (text: string, renames: Record<string, string>) => void }) {
  const [o, setO] = useState<Opts>({ sort: true, duplicates: true, keys: true, fill: true, unused: true, format: false });
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<(BibTidied & { missing: string[] }) | null>(null);
  useEffect(() => {
    if (open) setGot(null);
  }, [open, bib]);
  const text = doc.files.find((f) => f.name === bib)?.text ?? '';
  const look = async () => {
    const cited = citedKeys([doc.main, ...doc.files.filter((f) => /\.(tex|ltx)$/i.test(f.name)).map((f) => f.text)]);
    let fill: Map<string, BibEntry> | undefined;
    let missing: string[] = [];
    if (o.fill) {
      const need = bibNeedsFill(text).slice(0, 60);
      if (need.length) {
        setBusy(true);
        try {
          const r = await bibFill(need.map((n) => n.doi));
          fill = new Map();
          for (const n of need) {
            const e = r.entries[n.doi] ? fillEntry(r.entries[n.doi]) : null;
            if (e) fill.set(n.key, e);
          }
          missing = r.missing;
        } catch (e) {
          toastError(e);
        } finally {
          setBusy(false);
        }
      }
    }
    setGot({ ...tidyBib(text, cited, o, fill), missing });
  };
  const changed = !!got && (got.text !== text || Object.keys(got.renames).length > 0);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        <span>
          {tr('Tidy')} <span translate="no">{label(bib)}</span>
        </span>
      }
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {got ? (
            <Button variant="primary" disabled={!changed} onClick={() => onApply(got.text, got.renames)}>
              {changed ? 'Apply' : 'Nothing to change'}
            </Button>
          ) : (
            <Button variant="primary" disabled={busy || !text.trim()} icon={busy ? <Throbber size={14} /> : undefined} onClick={() => void look()}>
              {busy ? 'Asking doi.org…' : 'Look'}
            </Button>
          )}
        </>
      }
    >
      {!got ? (
        <div className="space-y-2">
          {OPTIONS.map(([k, name, hint]) => (
            <label key={k} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 hover:bg-bg-2">
              <input type="checkbox" checked={o[k]} onChange={(e) => setO({ ...o, [k]: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
              <span className="min-w-0">
                <span className="block text-[13px] text-fg">{name}</span>
                {hint && <span className="block text-[12px] text-fg-3">{hint}</span>}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {!got.changes.length && <p className="text-[13px] text-fg-3">The bibliography is tidy already.</p>}
          {got.changes.map((c, i) => {
            const Icon = ICON[c.kind];
            return (
              <p key={i} className="flex items-start gap-2 text-[12.5px] leading-snug text-fg-2">
                <Icon size={14} className="mt-0.5 shrink-0 text-fg-3" />
                <span translate="no" className="min-w-0 break-words">
                  {c.what}
                </span>
              </p>
            );
          })}
          {got.missing.length > 0 && <p className="pt-1 text-[12px] text-fg-3">{tr(`doi.org had no record for ${got.missing.length} DOI${got.missing.length === 1 ? '' : 's'}.`)}</p>}
          {Object.keys(got.renames).length > 0 && <p className="pt-1 text-[12px] text-fg-3">The citations in the document follow the keys that changed.</p>}
        </div>
      )}
    </Dialog>
  );
}
