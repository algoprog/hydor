// What new and changed documents and the project's work did to a project's memory lately (its wiki's recent updates): one
// update as a row (the document, or the session an update came from, which opens), the list's hook, which loads again
// when the wiki changes, and the note said when the project has more documents than its wiki reads.
import { useEffect, useState } from 'react';
import type { WikiDocuments, WikiUpdate } from '@shared/wiki';
import { api, enc } from '../../lib/api';
import { ago } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { tr } from '../../i18n/runtime';

/** How many of an update's articles show before "and 2 more". */
const FEW = 3;

/** One recent update: the document (or the session it was learned from), when, what it did to the wiki and the notes (or why it did nothing). */
export function UpdateRow({ u, onOpen }: { u: WikiUpdate; onOpen: (path: string) => void }) {
  const session = u.path.startsWith('session:') ? u.path.slice('session:'.length) : null;
  const commits = u.path.startsWith('commits:');
  /** The articles brought up to date after the project's code changed (their anchored files), and a folder's overview. */
  const code = u.path.startsWith('code:');
  const overview = u.path.startsWith('overview:');
  /** A reorganisation of the wiki's areas, and a fold or merge of articles. */
  const areas = u.path.startsWith('areas:');
  const merged = u.path.startsWith('merge:');
  /** A rebuild from the wiki's sources (one row with its progress), or an earlier wiki put back. */
  const rebuild = u.path.startsWith('rebuild:') || u.path.startsWith('restore:');
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
        ) : commits ? (
          <span className="min-w-0 flex-1 truncate text-[13.5px]">
            <span className="text-fg-3">Commits</span>:{' '}
            <span translate="no">{u.document.replace(/^Commits /, '')}</span>
          </span>
        ) : code ? (
          <span className="min-w-0 flex-1 truncate text-[13.5px]">
            <span className="text-fg-3">Code changes</span>
          </span>
        ) : overview ? (
          <span className="min-w-0 flex-1 truncate text-[13.5px]">
            <span className="text-fg-3">Overview</span>:{' '}
            <span translate="no">{u.document.replace(/^Overview: /, '')}</span>
          </span>
        ) : areas ? (
          <span className="min-w-0 flex-1 truncate text-[13.5px]" title={u.document}>
            <span className="text-fg-3">Areas</span>: <span translate="no">{u.document}</span>
          </span>
        ) : merged ? (
          <span className="min-w-0 flex-1 truncate text-[13.5px]" title={u.document}>
            <span className="text-fg-3">Merged</span>: <span translate="no">{u.document}</span>
          </span>
        ) : rebuild ? (
          <span className="min-w-0 flex-1 truncate text-[13.5px]" title={u.document}>
            <span className="text-fg-3">Rebuild</span>: <span translate="no">{u.document}</span>
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

/** Said when the project has more documents than its wiki reads: it reads the pinned, the most used and the newest; agents search all of them. */
export function DocumentsNote({ documents }: { documents?: WikiDocuments }) {
  if (!documents?.over) return null;
  return (
    <p className="text-[12.5px] leading-snug text-fg-3">
      {documents.limit > 0
        ? tr(`Its wiki reads ${documents.limit} of its ${documents.count} documents: the pinned, the most used and the newest. Agents search all of them.`)
        : tr(documents.count === 1 ? 'This project has 1 document, more than the 0 its wiki reads: agents search it instead of reading it into the wiki.' : `This project has ${documents.count} documents, more than the 0 its wiki reads: agents search them instead of reading them into the wiki.`)}
    </p>
  );
}
