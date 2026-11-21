// One wiki article, source or plan read in place: the file loads again when the wiki changed (without blinking), its Markdown shows
// without the frontmatter, links to other files of the wiki open here (any other relative link is blocked, so it cannot leave the
// wiki), and its sources come under it. The project's Memory tab shows it beside its list.
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Markdown } from '../../components/Markdown';
import { Throbber } from '../../components/ui';
import { api, enc } from '../../lib/api';
import { wikiDocument, wikiRelative } from './SpaceWikiPaths';

type WikiFile = { path: string; content: string; sha256: string };

export function WikiReader({ id, path, version, onOpen }: { id: string; path: string; version: number; onOpen: (path: string) => void }) {
  const [file, setFile] = useState<WikiFile | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const shown = useRef<string | null>(null);
  // The open article loads again when the wiki changed (without blinking); another one loads at once.
  useEffect(() => {
    let active = true;
    if (shown.current !== path) {
      shown.current = path;
      setFile(null);
      setLoading(true);
    }
    setError('');
    api<WikiFile>(`/api/projects/${enc(id)}/wiki/file?path=${enc(path)}`)
      .then(
        (r) => active && setFile(r),
        (e) => active && setError((e as Error).message),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, path, version]);
  const openLink = (e: MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as Element).closest('a');
    if (!anchor || !file || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = anchor.getAttribute('href') ?? '';
    const target = wikiRelative(file.path, href);
    if (target) {
      e.preventDefault();
      onOpen(target);
    }
    // Do not let invalid relative links escape the wiki through normal browser navigation.
    else if (href && !/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) e.preventDefault();
  };
  const doc = file ? wikiDocument(file.content) : null;
  return (
    <div>
      {loading && <Throbber />}
      {error && (
        <div role="alert" translate="no" className="rounded-xl border border-line bg-panel p-4 text-[13px]">
          {error}
        </div>
      )}
      {file && doc && (
        <>
          <div onClick={openLink}>
            <Markdown text={doc.body} className="break-words text-[14px]" />
          </div>
          {doc.sources.length > 0 && (
            <section className="mt-6 border-t border-line pt-4">
              <h3 className="mb-2 text-[13px] font-semibold">Sources</h3>
              <div className="space-y-1">
                {doc.sources.map((source) => {
                  const target = wikiRelative('index.md', source);
                  return target ? (
                    <button key={source} type="button" translate="no" className="block break-all text-left text-[13px] text-accent hover:underline" onClick={() => onOpen(target)}>
                      {source}
                    </button>
                  ) : /^https?:\/\//i.test(source) ? (
                    <a key={source} href={source} target="_blank" rel="noopener noreferrer" translate="no" className="block break-all text-[13px] text-accent hover:underline">
                      {source}
                    </a>
                  ) : (
                    <span key={source} translate="no" className="block break-all text-[13px] text-fg-3">
                      {source}
                    </span>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
