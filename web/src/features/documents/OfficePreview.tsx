// An Office file in the file viewer: as LibreOffice lays out its pages (a PDF, made once per version
// of the file) when it is installed, or as the app reads it (text, sheets, slides). Phones start on
// the read view, which scrolls and zooms better there than a PDF in a frame; a switch shows the other.
import { useEffect, useRef, useState } from 'react';
import { FileText, LayoutPanelTop } from 'lucide-react';
import type { DocPreview } from '@shared/documents';
import { api, post } from '../../lib/api';
import { basename } from '../../lib/format';
import { mu } from '../../lib/machine';
import { Empty, Segmented, Throbber, useIsMobile } from '../../components/ui';
import { DocView, Notes } from './DocView';

export function OfficePreview({ path, mtime }: { path: string; mtime?: number }) {
  const mobile = useIsMobile();
  const [data, setData] = useState<DocPreview | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'pages' | 'read' | null>(null);
  const [pdf, setPdf] = useState<{ url?: string; error?: string } | null>(null);
  // Which file the answers in flight are for: a reply for another file is dropped.
  const asked = useRef(0);

  useEffect(() => {
    let alive = true;
    asked.current++;
    setData(null);
    setError('');
    setPdf(null);
    api<DocPreview>(`/api/documents/preview?path=${encodeURIComponent(path)}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setMode((m) => m ?? (d.pages && !mobile ? 'pages' : 'read'));
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, mtime]);

  useEffect(() => {
    if (mode !== 'pages' || !data?.pages || pdf) return;
    const id = asked.current;
    setPdf({});
    post<{ url: string }>('/api/documents/pages', { path })
      .then((r) => id === asked.current && setPdf({ url: mu(r.url) }))
      .catch((e) => id === asked.current && setPdf({ error: (e as Error).message }));
  }, [mode, data, pdf, path]);

  if (error)
    return (
      <Empty title="No preview for this file" icon={<FileText size={22} />}>
        {error.replace(/\.$/, '')}. Download it to open it on your device.
      </Empty>
    );
  if (!data || !mode)
    return (
      <div className="flex h-full items-center justify-center text-fg-3">
        <Throbber size={34} />
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      {data.pages && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1.5">
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'pages', label: 'Pages', icon: <LayoutPanelTop size={13} /> },
              { value: 'read', label: 'Text', icon: <FileText size={13} /> },
            ]}
          />
          <span className="min-w-0 truncate text-[12px] text-fg-3">{mode === 'pages' ? 'As LibreOffice lays it out' : 'Its text, sheets and slides'}</span>
        </div>
      )}
      {mode === 'read' && <Notes notes={data.doc.notes} />}
      <div className="relative min-h-0 flex-1">
        {mode === 'read' ? (
          <DocView doc={data.doc} />
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
