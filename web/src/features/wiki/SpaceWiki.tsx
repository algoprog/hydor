// A project's wiki memory, read only: its articles and sources, an article or source whole, and what new and changed
// documents and the project's work (a session an update came from opens) did to the project's memory lately. It comes from the project's view (spaceMemory.ts); the list of recent
// updates and an open article load again when the server says the wiki changed.
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { FileText } from 'lucide-react';
import type { ProjectWikiView, WikiDocuments, WikiItem, WikiUpdate } from '@shared/wiki';
import { Markdown } from '../../components/Markdown';
import { Button, Throbber } from '../../components/ui';
import { api, enc } from '../../lib/api';
import { ago, tildify } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { useApp } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { wikiDocument, wikiRelative } from './SpaceWikiPaths';
import { useWikiSettings } from './spaceMemory';

type WikiFile = { path: string; content: string; sha256: string };

/** How many of an update's articles show before "and 2 more". */
const FEW = 3;

/** One recent update: the document (or the session it was learned from), when, what it did to the wiki and the notes (or why it did nothing). */
function UpdateRow({ u, onOpen }: { u: WikiUpdate; onOpen: (path: string) => void }) {
  const session = u.path.startsWith('session:') ? u.path.slice('session:'.length) : null;
  const first = u.articles.slice(0, FEW);
  const more = u.articles.length - first.length;
  return (
    <li className="px-4 py-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        {session ? (
          <span className="min-w-0 flex-1 truncate text-[13.5px]">
            <span className="text-fg-3">Session</span>:{' '}
            <button type="button" translate="no" onClick={() => openSession(session)} className="text-accent hover:underline">
              {u.document}
            </button>
          </span>
        ) : (
          <span translate="no" className="min-w-0 flex-1 truncate text-[13.5px]" title={u.path}>
            {u.document}
          </span>
        )}
        <span className="shrink-0 text-[12px] text-fg-3" title={new Date(u.at).toLocaleString()}>
          {ago(u.at)}
        </span>
      </div>
      {u.error ? (
        <div translate="no" className="mt-0.5 text-[12.5px] leading-snug break-words text-fg-3">
          {u.error}
        </div>
      ) : (
        <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3">
          {first.length > 0 && (
            <>
              <span>Articles</span>:{' '}
              {first.map((p, i) => (
                <span key={p}>
                  {i > 0 && ', '}
                  <button type="button" translate="no" onClick={() => onOpen(p)} className="break-all text-accent hover:underline">
                    {p}
                  </button>
                </span>
              ))}
              {more > 0 && <span>{tr(` and ${more} more`)}</span>}
            </>
          )}
          {first.length > 0 && u.notes > 0 && ' · '}
          {u.notes > 0 && <span>{u.notes === 1 ? tr('1 note added') : tr(`${u.notes} notes added`)}</span>}
          {first.length === 0 && u.notes === 0 && <span>Nothing to add</span>}
        </div>
      )}
    </li>
  );
}

/** What new and changed documents and the project's work did lately (at most 20), and how many documents the project holds against the most its wiki reads; they load again when the wiki changes. */
export function useWikiUpdates(id: string, active: boolean, version: number): { updates: WikiUpdate[]; documents?: WikiDocuments } {
  const [state, setState] = useState<{ updates: WikiUpdate[]; documents?: WikiDocuments }>({ updates: [] });
  useEffect(() => {
    setState({ updates: [] });
    if (!active) return;
    let live = true;
    api<{ updates: WikiUpdate[]; documents?: WikiDocuments }>(`/api/projects/${enc(id)}/wiki/updates`).then(
      (r) => live && setState({ updates: Array.isArray(r.updates) ? r.updates.slice(0, 20) : [], documents: r.documents }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [id, active, version]);
  return state;
}

/** Said when the project has more documents than its wiki reads: they stay for agents to search. */
export function DocumentsNote({ documents }: { documents?: WikiDocuments }) {
  if (!documents?.over) return null;
  return (
    <p className="text-[12.5px] leading-snug text-fg-3">
      {tr(documents.count === 1 ? `This project has 1 document, more than the ${documents.limit} its wiki reads: agents search them instead of reading them into the wiki.` : `This project has ${documents.count} documents, more than the ${documents.limit} its wiki reads: agents search them instead of reading them into the wiki.`)}
    </p>
  );
}

/** The same note on its own (the Documents part), when the project's wiki memory is on. */
export function DocumentsNoteOf({ id, on, version }: { id: string; on: boolean; version: number }) {
  return <DocumentsNote documents={useWikiUpdates(id, on, version).documents} />;
}

export function SpaceWiki({ id, view, version }: { id: string; view: ProjectWikiView | undefined; version: number }) {
  const home = useApp((s) => s.boot?.home);
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<WikiFile | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const shown = useRef<string | null>(null);
  useEffect(() => {
    setSelected(null);
    setFile(null);
    setError('');
  }, [id]);
  // The open article loads again when the wiki changed (without blinking); another one loads at once.
  useEffect(() => {
    if (!selected) {
      shown.current = null;
      setFile(null);
      return;
    }
    let active = true;
    if (shown.current !== selected) {
      shown.current = selected;
      setFile(null);
      setLoading(true);
    }
    setError('');
    api<WikiFile>(`/api/projects/${enc(id)}/wiki/file?path=${enc(selected)}`)
      .then(
        (r) => active && setFile(r),
        (e) => active && setError((e as Error).message),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, selected, version]);
  const on = view?.on !== false && view?.status !== 'off';
  const { updates, documents } = useWikiUpdates(id, !!view && on, version);
  const fromDocuments = useWikiSettings()?.fromDocuments !== false;
  const openLink = (e: MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as Element).closest('a');
    if (!anchor || !file || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = anchor.getAttribute('href') ?? '';
    const target = wikiRelative(file.path, href);
    if (target) {
      e.preventDefault();
      setSelected(target);
    }
    // Do not let invalid relative links escape the wiki through normal browser navigation.
    else if (href && !/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) e.preventDefault();
  };
  const doc = file ? wikiDocument(file.content) : null;
  const list = (items: WikiItem[], label: 'articles' | 'sources') =>
    items.length ? (
      <section>
        <h3 className="mb-2 text-[12px] font-semibold text-fg-3">{label === 'articles' ? 'Articles' : 'Sources'}</h3>
        <div className="space-y-1">
          {items.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => setSelected(item.path)}
              className={`flex w-full min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-bg-2 ${selected === item.path ? 'bg-bg-2 font-semibold' : ''}`}
            >
              <FileText size={15} className="mt-0.5 shrink-0" />
              <span translate="no" className="min-w-0 break-words" title={item.path}>
                {item.title || item.path}
              </span>
            </button>
          ))}
        </div>
      </section>
    ) : null;
  const ready = view?.status === 'ready' && (view.articles?.length || view.sources?.length);
  return (
    <div className="space-y-4">
      {!view && <Throbber />}
      {view && !on && (
        <p className="text-[13px] text-fg-3">
          Wiki memory is off for this project.{' '}
          <button type="button" onClick={() => go(`/projects/${id}/settings`)} className="text-accent hover:underline">
            Open its Settings
          </button>
        </p>
      )}
      {view && on && view.status === 'error' && (
        <p role="alert" className="text-[13px] text-fg-3">
          {view.error ? <span translate="no">{view.error}</span> : 'The project’s wiki memory could not be opened.'}
        </p>
      )}
      {view && on && view.status !== 'error' && !ready && <p className="text-[13px] text-fg-3">Nothing here yet. Agents add to it as they work, and new documents update it.</p>}
      {view && on && view.root && (
        <p className="text-[12px] break-all text-fg-3">
          <span>Folder</span>: <span translate="no">{tildify(view.root, home)}</span>
        </p>
      )}
      {error && (
        <div role="alert" translate="no" className="rounded-xl border border-line bg-panel p-4 text-[13px]">
          {error}
        </div>
      )}
      {view && on && ready && (
        <>
          {view.truncated && <p className="text-[12px] text-fg-3">The list is limited; some files are not shown.</p>}
          <div className="grid gap-4 md:grid-cols-[minmax(180px,260px)_minmax(0,1fr)]">
            <aside className="max-h-72 space-y-4 overflow-auto rounded-xl border border-line bg-panel p-3 md:max-h-[70vh]">
              {list(view.articles ?? [], 'articles')}
              {list(view.sources ?? [], 'sources')}
            </aside>
            <section className="min-w-0 rounded-xl border border-line bg-panel p-4 sm:p-6">
              {loading && <Throbber />}
              {!selected && <p className="text-[13px] text-fg-3">Select an article or source to read it.</p>}
              {file && doc && (
                <>
                  <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
                    <span className="min-w-0 flex-1 break-all" translate="no">
                      {file.path}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                      Close
                    </Button>
                  </div>
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
                            <button key={source} type="button" translate="no" className="block break-all text-left text-[13px] text-accent hover:underline" onClick={() => setSelected(target)}>
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
            </section>
          </div>
        </>
      )}
      {view && on && fromDocuments && <DocumentsNote documents={documents} />}
      {view && on && updates.length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold">Recent updates</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
            {updates.map((u) => (
              <UpdateRow key={u.id} u={u} onOpen={setSelected} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
