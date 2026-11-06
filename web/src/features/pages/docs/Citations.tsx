// Citations and a bibliography (Insert → Citation, Insert → Bibliography), as Word's and Google Docs' are: a source
// found on the web by its DOI, its arXiv id or words of its title (the LaTeX editor's lookup: Crossref, arXiv,
// doi.org), or one of the document's sources, or one typed in; cited at the caret in the document's style (APA, MLA,
// Chicago or IEEE, which Citation style changes for every citation and the bibliography at once). A click on a
// citation opens its box: the part of each source cited ("p. 4"), a source taken out of it, or the citation deleted.
import { useEffect, useRef, useState } from 'react';
import { BookMarked, Plus, Search, Trash2, X } from 'lucide-react';
import { CITE_STYLE_NAMES, sourceFromBibtex, sourceKey, sourceLine } from '@shared/doc-cite';
import { citeItems, citeOf, CITE_STYLES, type CiteStyle, type Doc, type Source, type SourceKind } from '@shared/docs';
import { post } from '../../../lib/api';
import { toastError } from '../../../lib/store';
import { Button, cx, Dialog, inputCls, Segmented, Throbber } from '../../../components/ui';
import { Select } from '../studio/fields';

interface Found {
  key: string;
  bibtex: string;
  title: string;
  authors: string;
  year: string;
  venue: string;
}

/** A source made ready to go into the document: its key unique among its sources'. */
export function withSource(d: Doc, s: Source): { doc: Doc; key: string } {
  const same = d.sources?.find((x) => (s.doi && x.doi === s.doi) || (x.title.toLowerCase() === s.title.toLowerCase() && (x.year ?? '') === (s.year ?? '')));
  if (same) return { doc: d, key: same.id };
  const taken = (d.sources ?? []).map((x) => x.id);
  const key = taken.some((k) => k.toLowerCase() === s.id.toLowerCase()) || !/^[A-Za-z0-9_:.+/-]{1,80}$/.test(s.id) ? sourceKey(s, taken) : s.id;
  return { doc: { ...d, sources: [...(d.sources ?? []), { ...s, id: key }] }, key };
}

const KINDS: { value: SourceKind; label: string }[] = [
  { value: 'article', label: 'Journal article' },
  { value: 'book', label: 'Book' },
  { value: 'chapter', label: 'Chapter of a book' },
  { value: 'conference', label: 'Conference paper' },
  { value: 'web', label: 'Web page' },
  { value: 'report', label: 'Report' },
  { value: 'thesis', label: 'Thesis' },
  { value: 'other', label: 'Other' },
];

/** Insert → Citation: find a source, pick one of the document's, or type one in; `onCite` puts the citation in. */
export function CiteDialog({ open, doc, onClose, onCite, onStyle }: { open: boolean; doc: Doc; onClose: () => void; onCite: (s: Source | string) => void; onStyle: (c: CiteStyle) => void }) {
  const [tab, setTab] = useState<'find' | 'mine' | 'type'>('find');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found[] | null>(null);
  const [typed, setTyped] = useState({ kind: 'article' as SourceKind, title: '', authors: '', year: '', in: '', volume: '', issue: '', pages: '', publisher: '', link: '' });
  const stop = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!open) return;
    setTab(doc.sources?.length ? 'mine' : 'find');
    setFound(null);
    setQ('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const find = async () => {
    const query = q.trim();
    if (!query) return;
    setBusy(true);
    try {
      const r = await post<{ entries: Found[] }>('/api/pages/tex/reference', { query });
      setFound(r.entries);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const cite = (s: Source | string) => {
    onCite(s);
    onClose();
  };
  const typedSource = (): Source | null => {
    const title = typed.title.trim();
    if (!title) return null;
    const authors = typed.authors
      .split(/;|\s+and\s+/)
      .map((a) => a.trim())
      .filter(Boolean)
      .map((a) => (a.includes(',') ? { family: a.split(',')[0].trim(), given: a.split(',').slice(1).join(',').trim() || undefined } : { family: a.split(' ').pop()!, given: a.split(' ').slice(0, -1).join(' ') || undefined }));
    const link = typed.link.trim();
    const doi = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/\S+)$/i.exec(link)?.[1];
    const s: Source = { id: '', kind: typed.kind, title, ...(authors.length ? { authors: authors.map((a) => (a.given ? a : { family: a.family })) } : {}) };
    for (const k of ['year', 'in', 'volume', 'issue', 'pages', 'publisher'] as const) if (typed[k].trim()) s[k] = typed[k].trim();
    if (doi) s.doi = doi;
    else if (/^https?:\/\/\S+$/i.test(link)) s.url = link;
    return { ...s, id: sourceKey(s, (doc.sources ?? []).map((x) => x.id)) };
  };
  const field = (k: keyof typeof typed, label: string, ph?: string) => (
    <label className="block space-y-1">
      <span className="text-[12px] text-fg-3">{label}</span>
      <input value={typed[k]} onChange={(ev) => setTyped({ ...typed, [k]: ev.target.value })} placeholder={ph} className={inputCls} />
    </label>
  );
  return (
    <Dialog open={open} onClose={() => (stop.current?.abort(), onClose())} title="Insert a citation" width={560}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'find', label: 'Find it' },
              { value: 'mine', label: `In this document${doc.sources?.length ? ` (${doc.sources.length})` : ''}` },
              { value: 'type', label: 'Type it in' },
            ]}
          />
          <div className="ml-auto w-[190px]">
            <Select value={doc.cite ?? 'apa'} title="Citation style" onChange={(v) => onStyle(v as CiteStyle)} options={CITE_STYLES.map((c) => ({ value: c, label: CITE_STYLE_NAMES[c] }))} />
          </div>
        </div>
        {tab === 'find' && (
          <>
            <form
              className="flex gap-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                void find();
              }}
            >
              <input autoFocus value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="A DOI, an arXiv id, or words of its title or authors" aria-label="What to find" className={inputCls} />
              <Button type="submit" variant="primary" icon={busy ? <Throbber size={14} /> : <Search size={14} />} disabled={!q.trim() || busy}>
                Find
              </Button>
            </form>
            <p className="text-[11.5px] text-fg-3">Looked up in Crossref, arXiv and doi.org: only what you type here is sent.</p>
            {found && !found.length && <p className="text-[13px] text-fg-3">Nothing was found. Try other words, or type it in.</p>}
            <div className="max-h-[46vh] space-y-1 overflow-y-auto">
              {found?.map((f) => (
                <div key={f.bibtex} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-2">
                  <div translate="no" className="min-w-0 flex-1">
                    <div className="text-[13px] leading-snug font-medium text-fg">{f.title}</div>
                    <div className="truncate text-[12px] text-fg-3">{[f.authors, f.year, f.venue].filter(Boolean).join(' · ')}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const s = sourceFromBibtex(f.bibtex);
                      if (s) cite(s);
                    }}
                  >
                    Cite
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === 'mine' &&
          (doc.sources?.length ? (
            <div className="max-h-[52vh] space-y-1 overflow-y-auto">
              {doc.sources.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-2">
                  <BookMarked size={14} className="shrink-0 text-fg-3" />
                  <span translate="no" className="min-w-0 flex-1 truncate text-[13px] text-fg">
                    {sourceLine(s)}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => cite(s.id)}>
                    Cite
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-fg-3">This document cites nothing yet: find a source, or type one in.</p>
          ))}
        {tab === 'type' && (
          <form
            className="space-y-2.5"
            onSubmit={(ev) => {
              ev.preventDefault();
              const s = typedSource();
              if (s) cite(s);
            }}
          >
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block space-y-1">
                <span className="text-[12px] text-fg-3">Kind</span>
                <Select value={typed.kind} title="Kind" onChange={(v) => setTyped({ ...typed, kind: v as SourceKind })} options={KINDS} />
              </label>
              {field('year', 'Year', '2024')}
            </div>
            {field('title', 'Title')}
            {field('authors', 'Authors', 'Family, Given; Family, Given')}
            {field('in', typed.kind === 'web' ? 'Website' : typed.kind === 'book' ? 'Series (if any)' : 'Journal, book or conference')}
            <div className="grid grid-cols-3 gap-2.5">
              {field('volume', 'Volume')}
              {field('issue', 'Issue')}
              {field('pages', 'Pages', '12–34')}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {field('publisher', typed.kind === 'thesis' ? 'University' : 'Publisher')}
              {field('link', 'DOI or address', '10.1000/xyz or https://…')}
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={!typed.title.trim()}>
                Cite it
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}

/** A citation's box: what part of each source it cites, a source taken out, another added, or the citation deleted. */
export function CiteBox({ t, doc, onChange, onAdd, onRemove }: { t: string; doc: Doc; onChange: (t: string) => void; onAdd: () => void; onRemove: () => void }) {
  const [items, setItems] = useState(() => citeItems(t));
  const src = new Map((doc.sources ?? []).map((s) => [s.id, s]));
  const done = (list = items) => (list.length ? onChange(citeOf(list)) : onRemove());
  return (
    <div className="space-y-2 p-2" data-keeps-editing onKeyDown={(ev) => ev.stopPropagation()}>
      {items.map((x, k) => (
        <div key={x.key} className="flex items-center gap-2">
          <span translate="no" className="min-w-0 flex-1 truncate text-[12.5px] text-fg" title={src.get(x.key)?.title}>
            {src.get(x.key) ? sourceLine(src.get(x.key)!) : x.key}
          </span>
          <input
            value={x.loc ?? ''}
            onChange={(ev) => setItems(items.map((y, j) => (j === k ? { ...y, loc: ev.target.value || undefined } : y)))}
            onKeyDown={(ev) => ev.key === 'Enter' && (ev.preventDefault(), done())}
            placeholder="p. 4"
            aria-label="The part cited"
            className={cx(inputCls, 'h-7 w-[72px] px-2 text-[12.5px]')}
          />
          <button type="button" title="Take it out of the citation" aria-label="Take it out of the citation" onClick={() => setItems(items.filter((_, j) => j !== k))} className="flex h-7 w-7 items-center justify-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg">
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={onAdd}>
            Another source
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={onRemove}>
            Delete
          </Button>
        </div>
        <Button size="sm" variant="primary" onClick={() => done()}>
          Done
        </Button>
      </div>
    </div>
  );
}
