// An Office file in the file viewer: a PowerPoint deck as its slides look (read by the Library's importer and drawn as
// the Library's decks are), any file as LibreOffice lays out its pages (a PDF, made once per version of the file) when
// it is installed, or as the app reads it (text, sheets, slides' words). Phones start on the read view (a deck on its
// slides), which scrolls and zooms better there than a PDF in a frame; a switch shows the others.
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, LayoutPanelTop, Presentation } from 'lucide-react';
import { isDeckFile, type DeckPreview, type DocPreview } from '@shared/documents';
import { api, post } from '../../lib/api';
import { basename } from '../../lib/format';
import { mu } from '../../lib/machine';
import { Empty, Segmented, Throbber, useIsMobile } from '../../components/ui';
import { DocView, Notes } from './DocView';

// The slides runtime comes with the slides alone.
const DeckSlides = lazy(() => import('./DeckSlides').then((m) => ({ default: m.DeckSlides })));

type Mode = 'slides' | 'pages' | 'read';

const loading = (
  <div className="flex h-full items-center justify-center text-fg-3">
    <Throbber size={34} />
  </div>
);

export function OfficePreview({ path, mtime }: { path: string; mtime?: number }) {
  const mobile = useIsMobile();
  const deckFile = isDeckFile(path);
  const [data, setData] = useState<DocPreview | null>(null);
  const [error, setError] = useState('');
  const [deck, setDeck] = useState<DeckPreview | null>(null);
  const [deckError, setDeckError] = useState('');
  const [mode, setMode] = useState<Mode | null>(deckFile ? 'slides' : null);
  const [pdf, setPdf] = useState<{ url?: string; error?: string } | null>(null);
  // Which file the answers in flight are for: a reply for another file is dropped.
  const asked = useRef(0);
  const shownPath = useRef(path);

  useEffect(() => {
    let alive = true;
    asked.current++;
    // Another file opens on its own view (Text stays, if it was picked); the same one changed keeps the view it is on.
    if (shownPath.current !== path) {
      shownPath.current = path;
      setMode((m) => (deckFile ? (m === 'read' ? m : 'slides') : m === 'slides' ? null : m));
    }
    setData(null);
    setError('');
    setDeck(null);
    setDeckError('');
    setPdf(null);
    if (deckFile)
      api<DeckPreview>(`/api/documents/deck?path=${encodeURIComponent(path)}`)
        .then((d) => alive && setDeck(d))
        .catch((e) => {
          if (!alive) return;
          // Its words, then.
          setDeckError((e as Error).message);
          setMode((m) => (m === 'slides' ? 'read' : m));
        });
    else
      api<DocPreview>(`/api/documents/preview?path=${encodeURIComponent(path)}`)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setMode((m) => (m === 'pages' && !d.pages ? 'read' : (m ?? (d.pages && !mobile ? 'pages' : 'read'))));
        })
        .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, mtime]);

  // A deck's words, read once they are asked for.
  useEffect(() => {
    if (!deckFile || mode !== 'read' || data || error) return;
    const id = asked.current;
    api<DocPreview>(`/api/documents/preview?path=${encodeURIComponent(path)}`)
      .then((d) => id === asked.current && setData(d))
      .catch((e) => id === asked.current && setError((e as Error).message));
  }, [deckFile, mode, data, error, path]);

  const pagesHere = !!(deck?.pages || data?.pages);

  useEffect(() => {
    if (mode !== 'pages' || !pagesHere || pdf) return;
    const id = asked.current;
    setPdf({});
    post<{ url: string }>('/api/documents/pages', { path })
      .then((r) => id === asked.current && setPdf({ url: mu(r.url) }))
      .catch((e) => id === asked.current && setPdf({ error: (e as Error).message }));
  }, [mode, pagesHere, pdf, path]);

  const noPreview = (
    <Empty title="No preview for this file" icon={<FileText size={22} />}>
      {error.replace(/\.$/, '')}. Download it to open it on your device.
    </Empty>
  );
  if (error && !deckFile) return noPreview;
  if (!mode) return loading;
  const modes: { value: Mode; label: string; icon: ReactNode }[] = [
    ...(deckFile && !deckError ? [{ value: 'slides' as const, label: 'Slides', icon: <Presentation size={13} /> }] : []),
    ...(pagesHere ? [{ value: 'pages' as const, label: 'Pages', icon: <LayoutPanelTop size={13} /> }] : []),
    { value: 'read', label: 'Text', icon: <FileText size={13} /> },
  ];
  const notes = mode === 'slides' ? (deck?.notes ?? []) : mode === 'read' && data ? [...(deckError ? [`Its slides could not be drawn: ${deckError.replace(/\.$/, '')}.`] : []), ...data.doc.notes] : [];
  return (
    <div className="flex h-full min-h-0 flex-col">
      {modes.length > 1 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1.5">
          <Segmented size="sm" value={mode} onChange={setMode} options={modes} />
          <span className="min-w-0 truncate text-[12px] text-fg-3">{mode === 'slides' ? 'Its slides, as the app draws them' : mode === 'pages' ? 'As LibreOffice lays it out' : deckFile ? 'Its words and speaker notes' : 'Its text, sheets and slides'}</span>
        </div>
      )}
      <Notes notes={notes} />
      <div className="relative min-h-0 flex-1">
        {mode === 'slides' ? (
          deck ? (
            <Suspense fallback={loading}>
              <DeckSlides deck={deck.deck} />
            </Suspense>
          ) : (
            loading
          )
        ) : mode === 'read' ? (
          data ? (
            <DocView doc={data.doc} />
          ) : error ? (
            noPreview
          ) : (
            loading
          )
        ) : pdf?.url ? (
          <iframe key={pdf.url} src={pdf.url} title={basename(path)} className="h-full w-full border-0 bg-white" />
        ) : pdf?.error ? (
          <Empty title="LibreOffice could not lay it out" icon={<LayoutPanelTop size={22} />}>
            {pdf.error.replace(/\.$/, '')}. Its text is under Text.
          </Empty>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[13px] text-fg-3">
            <Throbber size={30} />
            Laying out the pages…
          </div>
        )}
      </div>
    </div>
  );
}
