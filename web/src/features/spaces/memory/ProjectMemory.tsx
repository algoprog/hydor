// A project's Memory tab: everything its agents remember in one list (its notes, its wiki's articles, its own documents and its
// findings, newest first), narrowed by chips, searched in one box, and read in the pane beside it (in the list's place on a phone). Add
// puts in a note, files or a folder; ⋯ holds the wiki's jobs, the agents' prompts and the settings. Files dropped anywhere on the tab are
// added to the project's documents. On a computer it fills the window's height and the list and the reader scroll on their own; on a
// phone the whole tab scrolls (the search box and the chips go up with the list, so the list has the screen), its rows of chips are
// one line each that scrolls sideways, and an open item takes the list's place (the list is where it was when you come back).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Brain, Search, X } from 'lucide-react';
import type { MemoryListEntry } from '@shared/memory';
import { isUserProfile } from '@shared/memory';
import type { KnowledgeBase, KnowledgeState } from '@shared/knowledge';
import type { Space, SpaceView } from '@shared/spaces';
import { Button, cx, IconButton, inputCls, MenuItem, Popover, Throbber, useConfirm, useMediaQuery } from '../../../components/ui';
import { api, del, enc, patch, post } from '../../../lib/api';
import { openProject, type ProjectPart, type ProjectTab } from '../../../lib/nav';
import { tildify } from '../../../lib/format';
import { toastError, useApp } from '../../../lib/store';
import { entriesFromDrop, walkEntries, type PickedFile } from '../../../lib/upload';
import { tr } from '../../../i18n/runtime';
import { addFiles, DropFiles, MeaningHint, MeaningWait, useKnowledge } from '../../knowledge/parts';
import { useEntryList } from '../../memory/common';
import { VerdictPill } from '../../memory/Finding';
import { AddNoteDialog } from '../../memory/MemoryNotes';
import { useWikiSettings, type SpaceMemory } from '../../wiki/spaceMemory';
import { DocumentsNote, useWikiUpdates } from '../../wiki/WikiUpdates';
import { WikiJobProgress } from '../../wiki/WikiJobProgress';
import { useBuildOffer, useWikiJob } from '../../wiki/wikiJob';
import { SpaceMark } from '../parts';
import { useSpaces } from '../state';
import { docRow, FINDING_SUBS, groupOf, NOTE_SUBS, noteRow, notAFailure, ownBases, searchRows, sortRows, useDocs, useMemorySearch, wikiRows, type DocRef, type Row, type Sub } from './data';
import { AddFolder, AddMenu, MoreMenu, UpdatesDialog, useFilePicker } from './Menus';
import { DocReader, MemoryIntro, NoteReader, WikiPane } from './Readers';
import { FailedStrip, OfferStrip, WikiErrorStrip } from './Strips';
import { Chip, KindIcon, Loading, ScrollRow } from './ui';

/** The list shows this many rows, and as many more each time Show more is pressed. */
const PAGE = 100;
const WEEK = 7 * 86400_000;

/** One row of the list: its kind's icon, its title on one line (two on a phone, where the open item is not beside it), and what it is
 * under it. A finding's statement may take two, with its verdict, its age and whether the code under it changed. */
function ListRow({ r, on, wide, onClick }: { r: Row; on: boolean; wide: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-current={on || undefined} onClick={onClick} className={cx('flex w-full min-w-0 items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors', on ? 'bg-bg-2' : 'hover:bg-bg-1')}>
      <KindIcon kind={r.kind} />
      <span className="min-w-0 flex-1">
        <span translate="no" className={cx('text-[13.5px] leading-snug font-medium', r.verdict || !wide ? 'line-clamp-2 break-words' : 'block truncate')}>
          {r.title}
        </span>
        {r.verdict ? (
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-snug text-fg-3">
            <VerdictPill verdict={r.verdict} />
            <span>{r.meta}</span>
            {r.changed && <span className="text-warn">code changed since</span>}
          </span>
        ) : (
          <span translate={r.excerpt ? 'no' : undefined} className={cx('mt-px block text-[12px] leading-snug', r.bad ? 'text-err' : 'text-fg-3', r.excerpt ? 'line-clamp-2 break-words' : 'truncate')}>
            {r.meta}
          </span>
        )}
      </span>
    </button>
  );
}

/** What is in the list's place when it has no rows: a few words, and what to do. */
function Blank({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center px-6 py-8 text-center">
      {icon && <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-[14px] bg-bg-2 text-fg-2">{icon}</span>}
      <div className="text-[14px] font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-[380px] text-[13px] leading-relaxed text-fg-3">{children}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** `open`: a note (a finding) to show open, as the Research tab asks for it. */
export function ProjectMemory({ s, memory, part, onPart, onTab, view, open }: { s: Space; memory: SpaceMemory; part: ProjectPart; onPart: (p: ProjectPart) => void; onTab: (t: ProjectTab) => void; view?: SpaceView; open?: number }) {
  const home = useApp((x) => x.boot?.home);
  const wide = useMediaQuery('(min-width: 640px)');
  const spaces = useSpaces();
  const [st, loadKb] = useKnowledge();
  const bases = ownBases(st, s.id);
  const { docs, reload: reloadDocs } = useDocs(bases);
  const notesList = useEntryList({ scope: 'repo', key: memory.key ?? '' }, { enabled: !!memory.key });
  const notes = useMemo(() => notesList.list?.filter((e) => !(isUserProfile(e) && e.status === 'active')) ?? null, [notesList.list]);
  const wiki = memory.wiki;
  const wikiOn = !!wiki && wiki.on !== false && wiki.status !== 'off';
  const articles = wikiOn ? (wiki?.articles ?? []) : [];
  const { updates, documents: limit } = useWikiUpdates(s.id, wikiOn, memory.version);
  const [job, refreshJob] = useWikiJob(s.id, wikiOn, memory.version);
  const offer = useBuildOffer(s.id, wikiOn, job);
  const fromDocuments = useWikiSettings()?.fromDocuments !== false;
  const [confirm, confirmNode] = useConfirm();

  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'new' | 'az'>('new');
  const [sortMenu, setSortMenu] = useState(false);
  const sortRef = useRef<HTMLButtonElement>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [hint, setHint] = useState<MemoryListEntry | null>(null);
  const [limitRows, setLimitRows] = useState(PAGE);
  const [adding, setAdding] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [over, setOver] = useState(false);
  const { result, busy } = useMemorySearch(s.id, q);
  const searching = !!q.trim() && !!result;


  // On a phone the tab scrolls as a whole: where the list was when an item opened (in its place), to go back to when it closes.
  const scroller = useRef<HTMLDivElement>(null);
  const listTop = useRef(0);
  useLayoutEffect(() => {
    if (!wide && !sel && scroller.current) scroller.current.scrollTop = listTop.current;
  }, [sel, wide]);

  // Another project, or another kind of chip, starts afresh.
  useEffect(() => {
    setSel(null);
    setQ('');
    listTop.current = 0;
  }, [s.id]);
  useEffect(() => setSub(null), [part, s.id]);
  useEffect(() => setLimitRows(PAGE), [part, sub, q, sort, s.id]);

  // ---- what there is ----
  const noteRows = useMemo(() => notes?.map((e) => noteRow(e)) ?? null, [notes]);
  const docRows = useMemo(() => docs?.map(docRow) ?? null, [docs]);
  const notesLoading = noteRows === null;
  const wikiLoading = !wiki;
  const docsLoading = docRows === null;
  const now = Date.now();
  const noteSubs = NOTE_SUBS.filter((x) => notes?.some((e) => x.test(e, now)));
  const wikiSubs = [...(wiki?.areas ?? []).map((a) => ({ id: a.id, label: a.name, count: a.articles.length, user: true })), ...(wiki?.sources?.length ? [{ id: 'sources', label: tr('Sources'), count: wiki.sources.length, user: false }] : []), ...(wiki?.plans?.length ? [{ id: 'plans', label: tr('Plans'), count: wiki.plans.length, user: false }] : [])];
  const findingSubs = FINDING_SUBS.map((x) => ({ id: x.id as string, label: x.label(), count: notes?.filter(x.test).length ?? 0 })).filter((x) => x.count);
  const subs: { id: string; label: string; count?: number; user?: boolean }[] = part === 'notes' ? noteSubs.map((x) => ({ id: x.id, label: x.label() })) : part === 'wiki' && wikiOn ? wikiSubs : part === 'findings' ? findingSubs : [];
  const activeSub = subs.some((x) => x.id === sub) ? sub : null;

  const found = useMemo(() => (searching && result ? searchRows(result) : null), [searching, result]);
  const rows = useMemo<Row[]>(() => {
    const pick = (r: Row) => part === 'all' || groupOf(r.kind) === part;
    if (found) return found.filter(pick);
    let list: Row[] = [];
    if (part === 'all' || part === 'notes') {
      let n = (noteRows ?? []).filter((r) => groupOf(r.kind) === 'notes');
      const rule = part === 'notes' ? NOTE_SUBS.find((x) => x.id === activeSub) : undefined;
      if (rule) n = n.filter((r) => r.note && rule.test(r.note, now));
      list = list.concat(n);
    }
    if (part === 'all' || part === 'findings') list = list.concat((noteRows ?? []).filter((r) => groupOf(r.kind) === 'findings' && (part !== 'findings' || !activeSub || r.verdict === activeSub)));
    if (part === 'all' || part === 'wiki') list = list.concat(wikiRows(wiki, part === 'wiki' ? activeSub : null));
    if (part === 'all' || part === 'documents') list = list.concat(docRows ?? []);
    return sortRows(list, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, part, noteRows, wiki, docRows, activeSub, sort]);

  const counts = {
    notes: found ? found.filter((r) => groupOf(r.kind) === 'notes').length : noteRows?.filter((r) => groupOf(r.kind) === 'notes').length,
    findings: found ? found.filter((r) => groupOf(r.kind) === 'findings').length : noteRows?.filter((r) => groupOf(r.kind) === 'findings').length,
    wiki: found ? found.filter((r) => groupOf(r.kind) === 'wiki').length : wikiOn ? articles.length : undefined,
    documents: found ? found.filter((r) => groupOf(r.kind) === 'documents').length : docRows?.length,
  };
  const all = (counts.notes ?? 0) + (counts.wiki ?? 0) + (counts.documents ?? 0) + (counts.findings ?? 0);
  const total = found ? found.length : all;
  const loaded = !notesLoading && !wikiLoading && !docsLoading;
  const nothing = loaded && !found && all === 0;
  const wantsNotes = part === 'all' || part === 'notes' || part === 'findings';
  const wantsWiki = part === 'all' || part === 'wiki';
  const wantsDocs = part === 'all' || part === 'documents';
  const pending = !found && ((wantsNotes && notesLoading) || (wantsWiki && wikiLoading) || (wantsDocs && docsLoading));

  // ---- adding ----
  /** The project's own base of documents (made when it has none). */
  const ownBase = async (): Promise<KnowledgeBase> => {
    const fresh = await api<KnowledgeState>('/api/knowledge');
    return ownBases(fresh, s.id)?.[0] ?? post<KnowledgeBase>('/api/knowledge', { name: s.name, space: s.id });
  };
  const addPicked = async (picked: PickedFile[]) => {
    if (!picked.length) return;
    try {
      await addFiles(await ownBase(), picked);
      loadKb();
    } catch (e) {
      toastError(e);
    }
  };
  const addFolder = async (path: string) => {
    try {
      const b = await ownBase();
      await post(`/api/knowledge/${enc(b.id)}/folders`, { path });
      loadKb();
    } catch (e) {
      toastError(e);
    }
  };
  const [filesInput, pickFiles] = useFilePicker((p) => void addPicked(p));
  const readAgain = () => void Promise.all((bases ?? []).map((b) => post(`/api/knowledge/${enc(b.id)}/scan`))).catch(toastError);
  const stopFolder = async (b: KnowledgeBase, sid: string, name: string) => {
    if (!(await confirm({ title: tr(`Stop reading ${name}?`), body: tr('Agents no longer search its documents. The folder itself stays as it is.'), confirm: tr('Stop reading') }))) return;
    try {
      await del(`/api/knowledge/${enc(b.id)}/sources/${enc(sid)}`);
      loadKb();
    } catch (e) {
      toastError(e);
    }
  };
  const turnOn = async () => {
    try {
      await patch(`/api/projects/${enc(s.id)}`, { wikiMemory: true });
      memory.reload();
    } catch (e) {
      toastError(e);
    }
  };

  // ---- the reader ----
  const select = (key: string | null) => {
    if (!wide && key && !sel && scroller.current) listTop.current = scroller.current.scrollTop;
    setSel(key);
  };
  const openWiki = (path: string) => select(`w:${path}`);
  useEffect(() => {
    if (open) select(`n:${open}`);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  /** After a note went (or a document): the next row opens on a computer, the list shows on a phone. */
  const gone = (key: string) => {
    const i = rows.findIndex((r) => r.key === key);
    const next = rows[i + 1] ?? rows[i - 1];
    select(wide && next ? next.key : null);
  };
  const noteOf = (id: number): MemoryListEntry | null => notes?.find((e) => e.id === id) ?? result?.notes.find((e) => e.id === id) ?? (hint?.id === id ? hint : null);
  const docOf = (key: string): DocRef | null => {
    const [, base, id] = /^d:([^:]+):(\d+)$/.exec(key) ?? [];
    if (!base) return null;
    const hit = docs?.find((r) => r.b.id === base && r.d.id === Number(id));
    if (hit) return hit;
    const h = result?.documents.find((x) => x.base === base && x.docId === Number(id));
    const b = bases?.find((x) => x.id === base);
    return h && b ? { b, d: { id: h.docId, base: h.base, path: h.path, title: h.title, format: '', size: 0, passages: 0, status: 'indexed', indexedAt: 0 } } : null;
  };
  // What was open and is gone (a note deleted elsewhere, a document removed) closes.
  useEffect(() => {
    if (!sel) return;
    if (sel.startsWith('n:') && notes && !noteOf(Number(sel.slice(2)))) setSel(null);
    if (sel.startsWith('d:') && docs && !docOf(sel)) setSel(null);
  }, [sel, notes, docs]); // eslint-disable-line react-hooks/exhaustive-deps

  const reader = (() => {
    if (!sel) return null;
    const close = () => select(null);
    if (sel.startsWith('n:')) {
      const e = noteOf(Number(sel.slice(2)));
      return e ? (
        <NoteReader
          key={sel}
          entry={e}
          wide={wide}
          onClose={close}
          onGone={() => gone(sel)}
          onChanged={() => notesList.load()}
          onOpenNote={(c) => {
            setHint(c);
            select(`n:${c.id}`);
          }}
        />
      ) : (
        <Loading>Loading…</Loading>
      );
    }
    if (sel.startsWith('w:')) return <WikiPane key={sel} id={s.id} path={sel.slice(2)} view={wiki} version={memory.version} wide={wide} onOpen={openWiki} onClose={close} />;
    const r = docOf(sel);
    return r ? <DocReader key={sel} r={r} wikiOn={wikiOn} wide={wide} onClose={close} onChanged={() => (reloadDocs(), loadKb())} onGone={() => gone(sel)} /> : <Loading>Loading…</Loading>;
  })();

  // ---- the strips ----
  const failed = updates.filter((u) => !notAFailure(u) && Date.now() - u.at < WEEK);
  const members = (s.members ?? []).map((id) => spaces?.find((x) => x.id === id)).filter((x): x is SpaceView => !!x);
  const folders = (bases ?? []).flatMap((b) => b.sources.filter((x) => x.kind === 'folder').map((x) => ({ b, x })));

  // ---- the body ----
  const shown = rows.slice(0, limitRows);
  const empty = (() => {
    if (found || pending) return null;
    if (nothing && part === 'all')
      return (
        <Blank
          icon={<Brain size={19} />}
          title="Nothing remembered yet"
          action={
            <>
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add a note
              </Button>
              <Button onClick={pickFiles}>Add files</Button>
            </>
          }
        >
          Agents add notes as they work. You can add notes and files too, and the wiki grows from them.
        </Blank>
      );
    if (rows.length) return null;
    if (part === 'wiki' && wiki && !wikiOn)
      return (
        <Blank title="Wiki memory is off for this project." action={<Button variant="primary" onClick={() => void turnOn()}>Turn it on</Button>} />
      );
    if (part === 'wiki' && wikiOn && !activeSub) return <Blank title="Nothing here yet.">Agents add to the wiki as they work, and new documents update it.</Blank>;
    if (part === 'notes' && !activeSub && (counts.notes ?? 0) === 0)
      return (
        <Blank title="No notes yet" action={<Button variant="primary" onClick={() => setAdding(true)}>Add a note</Button>}>
          Short facts agents start with in this project.
        </Blank>
      );
    if (part === 'findings' && !activeSub && (counts.findings ?? 0) === 0) return <Blank title="No findings yet">What the project tried and what came of it, dead ends included: agents record findings as they work.</Blank>;
    if (part === 'documents' && (counts.documents ?? 0) === 0)
      return (
        <div className="mx-auto flex h-full max-w-[520px] flex-col justify-center gap-3 px-6 py-8">
          <DropFiles big onFiles={(p) => void addPicked(p)} />
          <div className="text-center">
            <AddFolder onPick={(p) => void addFolder(p)}>Add a folder to keep up to date</AddFolder>
          </div>
        </div>
      );
    return <Blank title="Nothing here." />;
  })();

  const kindChip = (k: ProjectPart, label: string, count?: number) => (
    <Chip key={k} on={part === k} count={count} onClick={() => onPart(k)}>
      {label}
    </Chip>
  );

  // On a phone an open item takes the list's place.
  if (!wide && sel && reader)
    return (
      <div className="h-full px-3 pt-4 pb-3">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel">{reader}</div>
      </div>
    );

  return (
    <div
      ref={scroller}
      className={cx('relative flex h-full min-h-0 flex-col gap-2.5', !wide && 'overflow-y-auto overscroll-y-contain px-3 pt-4 pb-3 *:shrink-0')}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        // A drop zone in the list (it has handled the event already) takes its own.
        setOver(!e.defaultPrevented);
        e.preventDefault();
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!e.dataTransfer.types.includes('Files') || e.defaultPrevented) return;
        e.preventDefault();
        // Entries are readable only during the drop.
        const entries = entriesFromDrop(e.dataTransfer);
        void walkEntries(entries).then((r) => addPicked(r.files), toastError);
      }}
    >
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && q && (e.preventDefault(), e.stopPropagation(), setQ(''))}
            placeholder={wide ? 'Search notes, wiki, documents and findings' : 'Search memory'}
            aria-label="Search notes, wiki, documents and findings"
            className={cx(inputCls, 'pr-9 pl-9')}
          />
          {busy ? (
            <Throbber size={15} className="absolute top-1/2 right-3 -translate-y-1/2 text-fg-3" />
          ) : (
            q && (
              <IconButton label="Clear" size="sm" className="absolute top-1/2 right-1.5 -translate-y-1/2" onClick={() => setQ('')}>
                <X size={14} />
              </IconButton>
            )
          )}
        </div>
        <AddMenu onNote={() => setAdding(true)} onFiles={(p) => void addPicked(p)} onFolder={(p) => void addFolder(p)} />
        <MoreMenu s={s} memory={memory} wikiOn={wikiOn} job={job} offer={offer} refresh={refreshJob} hasDocs={!!bases?.length} onUpdates={() => setUpdatesOpen(true)} onSettings={() => onTab('settings')} onRead={readAgain} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ScrollRow show={[s.id, part, counts.notes, counts.wiki, counts.documents, counts.findings].join()} className={cx('flex-1', wide ? '-mx-1 px-1' : '-ml-3 pl-3')}>
          {kindChip('all', 'All', loaded || found ? total : undefined)}
          {kindChip('notes', 'Notes', counts.notes)}
          {kindChip('wiki', 'Wiki', counts.wiki)}
          {kindChip('documents', 'Documents', counts.documents)}
          {kindChip('findings', 'Findings', counts.findings)}
        </ScrollRow>
        {!found && (
          <>
            <button ref={sortRef} type="button" aria-haspopup="menu" aria-expanded={sortMenu} aria-label={sort === 'new' ? 'Newest first' : 'A to Z'} onClick={() => setSortMenu((o) => !o)} className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[12px] text-fg-3 hover:bg-bg-2 hover:text-fg">
              <span className="max-sm:hidden">{sort === 'new' ? 'Newest first' : 'A to Z'}</span>
              <ArrowUpDown size={12} />
            </button>
            <Popover anchor={sortRef} open={sortMenu} onClose={() => setSortMenu(false)} align="end" width={190}>
              <MenuItem
                checked={sort === 'new'}
                onClick={() => {
                  setSort('new');
                  setSortMenu(false);
                }}
              >
                Newest first
              </MenuItem>
              <MenuItem
                checked={sort === 'az'}
                onClick={() => {
                  setSort('az');
                  setSortMenu(false);
                }}
              >
                A to Z
              </MenuItem>
            </Popover>
          </>
        )}
      </div>

      {(part === 'notes' || part === 'wiki' || part === 'findings') &&
        subs.length > 0 &&
        (() => {
          const list = subs.map((x) => (
            <Chip key={x.id} small on={activeSub === x.id} count={x.count} onClick={() => setSub(activeSub === x.id ? null : x.id)}>
              {x.user ? <span translate="no">{x.label}</span> : x.label}
            </Chip>
          ));
          // A wiki's areas can be many: on a phone they are one line that scrolls sideways, not rows that fill the screen.
          return wide ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{list}</div> : <ScrollRow show={`${part}:${activeSub ?? ''}`} className="-mx-3 shrink-0 px-3">{list}</ScrollRow>;
        })()}

      {part === 'documents' && !found && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-fg-3">
          {folders.map(({ b, x }) => (
            <span key={x.id} className="flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-bg-2 pr-1 pl-2.5 text-fg-2" title={x.path}>
              <span translate="no" className="min-w-0 truncate">
                {tildify(x.path, home)}
              </span>
              <button type="button" aria-label={tr(`Stop reading ${x.name}`)} onClick={() => void stopFolder(b, x.id, x.name)} className="rounded-full p-0.5 text-fg-3 hover:bg-bg-3 hover:text-fg">
                <X size={12} />
              </button>
            </span>
          ))}
          <AddFolder className="!h-7 !px-2 text-[12.5px]" onPick={(p) => void addFolder(p)}>
            Add a folder
          </AddFolder>
          {members.length > 0 && (
            <>
              <span className="ml-1">Also searched:</span>
              {members.map((m) => (
                <button key={m.id} type="button" onClick={() => openProject(m.id, 'memory', { part: 'documents' })} className="flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-bg-2 pr-2.5 pl-1.5 text-fg-2 hover:bg-bg-3">
                  <SpaceMark s={m} size={15} />
                  <span translate="no" className="min-w-0 truncate">
                    {m.name}
                  </span>
                  <span className="tnum text-fg-3">{m.docs}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
      {part === 'documents' && wikiOn && fromDocuments && limit?.over && <DocumentsNote documents={limit} />}

      {wikiOn && <WikiJobProgress project={s.id} variant="bar" shared={[job, refreshJob]} />}
      {wikiOn && <OfferStrip id={s.id} offer={offer} job={job} onStarted={refreshJob} />}
      {wikiOn && wiki?.status === 'error' && <WikiErrorStrip error={wiki.error} />}
      {wikiOn && <FailedStrip count={failed.length} first={failed[0]?.error ?? ''} onSee={() => setUpdatesOpen(true)} />}
      {st && !!bases?.length && <MeaningWait st={st} bases={bases} />}
      {found && !result?.meaning && <MeaningHint />}

      <div className={cx('flex gap-3', wide ? 'min-h-0 flex-1' : 'flex-[1_0_auto]')}>
        <div className={cx('flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel', wide ? 'w-[clamp(250px,40%,360px)] shrink-0' : 'flex-1', empty && wide && 'flex-1')}>
          <div className={wide ? 'min-h-0 flex-1 overflow-y-auto' : 'flex flex-1 flex-col'}>
            {empty ? (
              empty
            ) : (
              <div className="space-y-0.5 p-1.5">
                {found && !rows.length ? (
                  <Blank title={tr(`Nothing in this project’s memory matches “${q.trim()}”.`)} />
                ) : (
                  shown.map((r) => <ListRow key={r.id} r={r} on={r.key === sel} wide={wide} onClick={() => select(r.key)} />)
                )}
                {rows.length > limitRows && (
                  <div className="p-1.5">
                    <Button size="sm" variant="ghost" className="w-full" onClick={() => setLimitRows((n) => n + PAGE)}>
                      Show more
                    </Button>
                  </div>
                )}
                {!found && wantsWiki && wiki?.truncated && <p className="px-2.5 py-1.5 text-[12px] text-fg-3">The list is limited; some files are not shown.</p>}
                {pending && <Loading>{notesLoading && wantsNotes ? (part === 'findings' ? 'Loading findings…' : 'Loading notes…') : wikiLoading && wantsWiki ? 'Loading wiki…' : 'Loading documents…'}</Loading>}
              </div>
            )}
          </div>
        </div>
        {wide && !(empty && !sel) && (
          <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-panel">
            {reader ?? <MemoryIntro name={s.name} articles={wikiOn ? articles.length : null} documents={docRows?.length ?? view?.docs ?? 0} findings={counts.findings ?? 0} />}
          </div>
        )}
      </div>

      {over && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-bg/80 text-[14px] font-medium text-accent backdrop-blur-[1px]">
          Drop files or a folder to add them to this project’s documents
        </div>
      )}
      {filesInput}
      {adding && memory.key && <AddNoteDialog open initial={{ kind: 'repo', key: memory.key }} onClose={() => setAdding(false)} onSaved={() => notesList.load()} />}
      {updatesOpen && <UpdatesDialog updates={updates} onClose={() => setUpdatesOpen(false)} onOpen={(p) => (onPart('all'), openWiki(p))} />}
      {confirmNode}
    </div>
  );
}
