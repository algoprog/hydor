// What the right pane of a project's Memory tab shows (the whole screen on a phone): a note, a topic or the project's profile, a wiki
// article, area, source or plan, a document, or, with nothing open, what the project's memory is. Each has its header: what it is,
// and a close × (on a phone, a ‹ Memory back button).
import { useState, type ReactNode } from 'react';
import { ChevronLeft, ExternalLink, X } from 'lucide-react';
import type { MemoryListEntry } from '@shared/memory';
import type { ProjectWikiView } from '@shared/wiki';
import { BASIS, shortDay } from '../../memory/common';
import { useNoteView } from '../../memory/NoteDialog';
import { WikiReader } from '../../wiki/WikiReader';
import { Button, IconButton, Switch, useConfirm } from '../../../components/ui';
import { del, enc, put } from '../../../lib/api';
import { ago, bytes, tildify } from '../../../lib/format';
import { openFile } from '../../../lib/nav';
import { toastError, useApp } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { baseName, wikiKindOf, type DocRef } from './data';
import { Pill } from './ui';

/** A reader's frame: its header (what it is, close) over what scrolls. */
function Frame({ wide, onClose, pills, children }: { wide: boolean; onClose: () => void; pills: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!wide && (
        <button type="button" onClick={onClose} className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2.5 text-[13.5px] font-medium text-fg-2 hover:text-fg">
          <ChevronLeft size={17} />
          Memory
        </button>
      )}
      <div className="flex shrink-0 items-center gap-1.5 px-4 pt-3 pb-1">
        {pills}
        <span className="flex-1" />
        {wide && (
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X size={15} />
          </IconButton>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-5">{children}</div>
    </div>
  );
}

const Fact = ({ name, children }: { name: string; children: ReactNode }) => (
  <>
    <dt className="text-fg-3">{name}</dt>
    <dd className="min-w-0 break-words text-fg-2">{children}</dd>
  </>
);

// ---- notes --------------------------------------------------------------------------------------------------------

/** A note, a topic or the project's profile: its text (to edit) and facts, Delete; a note a topic sums up opens here too. */
export function NoteReader({ entry, wide, onClose, onGone, onChanged, onOpenNote }: { entry: MemoryListEntry; wide: boolean; onClose: () => void; onGone: () => void; onChanged: () => void; onOpenNote: (e: MemoryListEntry) => void }) {
  const v = useNoteView({ entry, onClose: onGone, onChanged, inPlace: true, onOpenNote });
  const e = v.e ?? entry;
  const profile = e.kind === 'profile';
  return (
    <Frame
      wide={wide}
      onClose={onClose}
      pills={
        <>
          <Pill>{profile ? 'Project profile' : v.kind}</Pill>
          {e.basis && !profile && e.status === 'active' && <Pill tone={e.basis === 'inferred' ? 'warn' : 'ok'}><span className="first-letter:uppercase">{BASIS[e.basis]}</span></Pill>}
          {e.expiresAt && e.status === 'active' && <Pill>{tr(`Ends ${shortDay(e.expiresAt)}`)}</Pill>}
        </>
      }
    >
      {v.e ? (
        <>
          {v.body}
          <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">{v.actions}</div>
        </>
      ) : null}
      {v.confirmNode}
    </Frame>
  );
}

// ---- wiki ---------------------------------------------------------------------------------------------------------

const WIKI_KIND = { article: 'Article', hub: 'Area', source: 'Source', plan: 'Plan' } as const;

/** A wiki article, area hub, source or plan, read whole, with where it belongs above it. */
export function WikiPane({ id, path, view, version, wide, onOpen, onClose }: { id: string; path: string; view: ProjectWikiView | undefined; version: number; wide: boolean; onOpen: (path: string) => void; onClose: () => void }) {
  const kind = wikiKindOf(path) as keyof typeof WIKI_KIND;
  const item = [...(view?.articles ?? []), ...(view?.sources ?? []), ...(view?.plans ?? [])].find((i) => i.path === path);
  const area = kind === 'hub' ? view?.areas?.find((a) => a.hub === path) : view?.areas?.find((a) => a.articles.includes(path));
  const line = [tr('Wiki'), area?.name, item?.updated ? tr(`updated ${ago(item.updated)}`) : ''].filter(Boolean);
  return (
    <Frame wide={wide} onClose={onClose} pills={<Pill tone="ok">{WIKI_KIND[kind]}</Pill>}>
      <div translate="no" className="mb-3 text-[12px] text-fg-3">
        {line.join(' · ')}
      </div>
      <WikiReader id={id} path={path} version={version} onOpen={onOpen} />
    </Frame>
  );
}

// ---- documents ----------------------------------------------------------------------------------------------------

/** A document: where it is from, what was read of it, Open, whether the wiki reads it, and Remove for a file dropped into the base. */
export function DocReader({ r, wikiOn, wide, onClose, onChanged, onGone }: { r: DocRef; wikiOn: boolean; wide: boolean; onClose: () => void; onChanged: () => void; onGone: () => void }) {
  const { b, d } = r;
  const home = useApp((x) => x.boot?.home);
  const [ask, askNode] = useConfirm();
  const [busy, setBusy] = useState(false);
  const own = d.path.startsWith(`${b.filesDir}/`);
  const dir = d.path.slice(0, d.path.lastIndexOf('/')) || '/';
  const pin = async (on: boolean) => {
    setBusy(true);
    try {
      await put(`/api/knowledge/documents/${d.id}/wiki-pin`, { pin: on });
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await ask({ title: tr(`Remove ${d.title || baseName(d.path)}?`), body: tr('Agents stop finding it, and the copy Hydor kept of it is deleted.'), confirm: tr('Remove'), danger: true }))) return;
    try {
      await del(`/api/knowledge/${enc(b.id)}/docs/${d.id}`);
      onChanged();
      onGone();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Frame wide={wide} onClose={onClose} pills={<Pill tone="warn">Document</Pill>}>
      <h3 translate="no" className="text-[16px] leading-snug font-semibold break-words">
        {d.title || baseName(d.path)}
      </h3>
      <dl className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 border-t border-line pt-4 text-[13px] leading-snug">
        <Fact name="From">
          {own ? (
            'Files you added'
          ) : (
            <span translate="no" title={d.path}>
              {tildify(dir, home)}
            </span>
          )}
        </Fact>
        {(d.format || d.size > 0) && (
          <Fact name="Format">
            <span translate="no">{[d.format && d.format.toUpperCase(), d.size > 0 && bytes(d.size)].filter(Boolean).join(' · ')}</span>
          </Fact>
        )}
        <Fact name="Contents">
          {d.status === 'indexed' ? (
            d.passages === 1 ? (
              '1 passage'
            ) : (
              tr(`${d.passages} passages`)
            )
          ) : d.status === 'empty' ? (
            'No text'
          ) : (
            <span translate="no" className="text-err">
              {d.error || tr('Could not be read')}
            </span>
          )}
        </Fact>
        {d.indexedAt > 0 && <Fact name="Read">{ago(d.indexedAt)}</Fact>}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button size="sm" variant="secondary" icon={<ExternalLink size={14} />} onClick={() => openFile(d.path)}>
          Open
        </Button>
        {own && (
          <Button size="sm" variant="ghost" className="!text-err" onClick={() => void remove()}>
            Remove
          </Button>
        )}
      </div>
      {wikiOn && d.status === 'indexed' && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-line px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium">Read into wiki memory</div>
            <div className="text-[12.5px] leading-snug text-fg-3">The wiki always reads it, even when the project has more documents than its limit.</div>
          </div>
          <Switch on={!!d.wikiPin} label="Read into wiki memory" disabled={busy} onChange={(v) => void pin(v)} />
        </div>
      )}
      {askNode}
    </Frame>
  );
}

// ---- nothing open -------------------------------------------------------------------------------------------------

/** What the project's memory is, for someone new: shown while nothing is open (on a computer). */
export function MemoryIntro({ name, articles, documents }: { name: string; articles: number | null; documents: number }) {
  const num = (n: number) => <span className="tnum">{n.toLocaleString()}</span>;
  const who = (
    <span translate="no" className="font-medium text-fg">
      {name}
    </span>
  );
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-[420px] text-[13.5px] leading-relaxed text-fg-3">
        <p className="text-fg-2">
          {articles && documents ? (
            <>Agents in {who} start with its profile and its notes, and read its {num(articles)} wiki articles and {num(documents)} documents when a task needs them.</>
          ) : articles ? (
            <>Agents in {who} start with its profile and its notes, and read its {num(articles)} wiki articles when a task needs them.</>
          ) : documents ? (
            <>Agents in {who} start with its profile and its notes, and read its {num(documents)} documents when a task needs them.</>
          ) : (
            <>Agents in {who} start with its profile and its notes.</>
          )}
        </p>
        <ul className="mt-3 space-y-1.5">
          <li>
            <span className="font-medium text-fg-2">Notes</span>: short facts agents start with.
          </li>
          <li>
            {articles == null ? (
              'Wiki memory is off for this project.'
            ) : (
              <>
                <span className="font-medium text-fg-2">Wiki</span>: articles agents keep as they work.
              </>
            )}
          </li>
          <li>
            <span className="font-medium text-fg-2">Documents</span>: your files, which agents search and cite.
          </li>
        </ul>
      </div>
    </div>
  );
}
