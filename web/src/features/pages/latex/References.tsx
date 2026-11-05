// References from the web for a LaTeX document (Insert → Reference, and Find a reference in a bibliography's tab):
// paste a DOI, an arXiv id or its address, or type words of a title or its authors; the server fetches the BibTeX
// (doi.org, arXiv, Crossref's search) and lists what it found, each with its title, authors, year and where it
// appeared, and its BibTeX to look at. Cite adds it to the bibliography and cites it where the cursor is; Add puts it
// in the bibliography only. Where it goes is said under the list (a refs.bib is made when the document has none).
import { useEffect, useRef, useState } from 'react';
import { BookPlus, Code2, Quote, Search } from 'lucide-react';
import type { TexReference } from '@shared/latex-bib';
import { Button, cx, Dialog, inputCls, Throbber } from '../../../components/ui';
import { findReferences } from './api';

export function ReferencesDialog({
  open,
  onClose,
  onPick,
  bib,
  fresh,
  canCite,
}: {
  open: boolean;
  onClose: () => void;
  /** An entry picked: added to the bibliography, and cited at the cursor when `cite`. */
  onPick: (e: TexReference, cite: boolean) => void;
  /** The bibliography the entries go in, and whether it is made for them. */
  bib: string;
  fresh: boolean;
  /** Whether Cite is offered (not from a bibliography's own tab). */
  canCite: boolean;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<TexReference[] | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const ask = useRef(0);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setAdded(new Set());
  }, [open]);

  const find = async () => {
    const query = q.trim();
    if (!query) return;
    const n = ++ask.current;
    setBusy(true);
    setError(null);
    try {
      const r = await findReferences(query);
      if (n !== ask.current) return;
      setFound(r.entries);
      setShown(null);
    } catch (e) {
      if (n === ask.current) {
        setError((e as Error).message);
        setFound(null);
      }
    } finally {
      if (n === ask.current) setBusy(false);
    }
  };

  const pick = (e: TexReference, cite: boolean) => {
    onPick(e, cite);
    setAdded((s) => new Set(s).add(e.bibtex));
    if (cite) onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add a reference" width={720}>
      <div className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
          className="flex gap-2"
        >
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="A DOI, an arXiv id or address, or words of the title or authors" aria-label="What to find" spellCheck={false} className={cx(inputCls, 'pl-9')} />
          </div>
          <Button type="submit" variant="primary" disabled={!q.trim() || busy}>
            {busy ? <Throbber className="h-4 w-4" /> : 'Find'}
          </Button>
        </form>
        {error && <p className="rounded-lg bg-err/10 px-3 py-2 text-[13px] text-err">{error}</p>}
        {found && !found.length && !error && <p className="py-4 text-center text-[13px] text-fg-3">Nothing was found for that. Try the DOI, or other words of the title.</p>}
        {!found && !error && (
          <p className="text-[12.5px] leading-relaxed text-fg-3">
            For example <span className="font-mono text-fg-2">10.1093/comjnl/27.2.97</span>, <span className="font-mono text-fg-2">arXiv:1706.03762</span> or <span className="text-fg-2">attention is all you need</span>. The BibTeX comes from doi.org,
            arXiv and Crossref; only what you type here is sent.
          </p>
        )}
        {found && found.length > 0 && (
          <ul className="max-h-[min(52vh,440px)] divide-y divide-line overflow-y-auto overscroll-contain rounded-xl border border-line">
            {found.map((e) => {
              const isAdded = added.has(e.bibtex);
              return (
                <li key={e.bibtex} className="px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <div translate="no" className="min-w-0 flex-1">
                      <div className="text-[13.5px] leading-snug font-medium text-fg">{e.title}</div>
                      <div className="mt-0.5 text-[12.5px] leading-snug text-fg-2">
                        {[e.authors, e.year].filter(Boolean).join(' · ')}
                        {e.venue && <span className="text-fg-3"> · {e.venue}</span>}
                      </div>
                      <div className="mt-0.5 font-mono text-[11.5px] text-fg-3">{e.key}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      <button
                        type="button"
                        title="Its BibTeX"
                        aria-label="Its BibTeX"
                        aria-pressed={shown === e.bibtex}
                        onClick={() => setShown(shown === e.bibtex ? null : e.bibtex)}
                        className={cx('flex h-8 w-8 items-center justify-center rounded-lg transition-colors', shown === e.bibtex ? 'bg-bg-2 text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}
                      >
                        <Code2 size={15} />
                      </button>
                      <Button size="sm" variant={canCite ? 'ghost' : 'secondary'} icon={<BookPlus size={14} />} disabled={isAdded} onClick={() => pick(e, false)}>
                        {isAdded ? 'Added' : 'Add'}
                      </Button>
                      {canCite && (
                        <Button size="sm" variant="primary" icon={<Quote size={14} />} onClick={() => pick(e, true)}>
                          Cite
                        </Button>
                      )}
                    </div>
                  </div>
                  {shown === e.bibtex && (
                    <pre translate="no" className="mt-2 overflow-x-auto rounded-lg bg-bg-2 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-fg-2">
                      {e.bibtex}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[12px] text-fg-3">
          {canCite ? 'Cite adds it to the bibliography and cites it where the cursor is; Add only adds it.' : 'Add puts it in this bibliography.'} It goes in{' '}
          <span translate="no" className="font-mono text-fg-2">
            {bib}
          </span>
          {fresh ? ' (a new file)' : ''}, under a key no other entry has.
        </p>
      </div>
    </Dialog>
  );
}
