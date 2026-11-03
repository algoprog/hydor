// Beside a session's conversation, on a wide screen: the page an agent is writing, as it comes, then the
// page itself to use, edit and save. Pages shown in the conversation (show_html), saved pages (save_page)
// and HTML files an agent writes (Write) open here; when the user saves a change, the agent hears of it
// with their next message. It opens by itself when an agent starts writing a page in the session on
// screen (unless that was turned off), and from the cards in the conversation.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { AppWindow, ChevronDown, Download, Ellipsis, ExternalLink, FileCode2, FolderOpen, X } from 'lucide-react';
import type { PageInfo } from '@shared/pages';
import type { SessionSummary, TimelineItem, ToolInfo, ToolItem } from '@shared/types';
import { api, enc, post, put } from '../../lib/api';
import { composeInsert } from '../../lib/featureEvents';
import { basename, tildify } from '../../lib/format';
import { go, showInFiles } from '../../lib/nav';
import { toast, toastError, useApp, useLive, useTimeline } from '../../lib/store';
import { nagetTool } from '../registry';
import { cx, IconButton, MenuItem, MenuSep, Popover, Switch, useConfirm, useIsMobile, useMediaQuery } from '../../components/ui';
import { memoryStore, pageFile, pageStore, type Store } from './frame';
import { CANVAS_MEDIA, onDraftStart, onScreen, savedPageOf, savedRef, useCanvas, useDrafts, usePagesStore, type CanvasTarget } from './state';
import { Studio, type StudioDoc } from './studio/Studio';
import { exportFile } from './exportFile';
import { EXPORTS } from './exports';
import { EDITORS } from './editors';
import type { ModelDoc } from './kinds';
import type { Deck } from '@shared/slides';
import { usePicks } from '../session/HtmlPage';
import { ReviewPane, shotsOfTurn } from '../shots/Review';

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`);

// ---- which calls are pages --------------------------------------------------------------------------

export type PageCall = 'show_html' | 'save_page' | 'file';

/** A call that makes a page, and which kind. */
export function pageCall(t: ToolInfo | undefined): PageCall | null {
  if (!t) return null;
  const bare = nagetTool(t.name);
  if (bare === 'show_html' || bare === 'save_page') return bare;
  // A deck, a document or a spreadsheet is a saved page too, opened by its id.
  if (bare === 'save_slides' || bare === 'save_doc' || bare === 'save_sheet' || bare === 'save_latex') return 'save_page';
  const p = (t.input as { file_path?: unknown } | undefined)?.file_path;
  return t.name === 'Write' && typeof p === 'string' && /\.html?$/i.test(p) ? 'file' : null;
}

/** The page calls of a session, in order: those in its conversation and those still coming. */
function usePageItems(key: string): ToolItem[] {
  const items = useTimeline((x) => x.byKey[key]?.items);
  const overlay = useLive((x) => x.byKey[key]?.overlay);
  return useMemo(() => {
    const seen = new Set<string>();
    const out: ToolItem[] = [];
    for (const list of [items ?? [], overlay?.items ?? []] as TimelineItem[][])
      for (const it of list)
        if (it.kind === 'tool' && !seen.has(it.id) && pageCall(it.tool)) {
          seen.add(it.id);
          out.push(it);
        }
    return out;
  }, [items, overlay]);
}

/** Which page a call shows: a saved page by its id and an HTML file by its path (saved again, it is the same), else the call itself. */
const pageKey = (it: ToolItem): string => {
  const k = pageCall(it.tool);
  const path = (it.tool.input as { file_path?: unknown } | undefined)?.file_path;
  return (k === 'save_page' && savedPageOf(it.tool)) || (k === 'file' && typeof path === 'string' ? `file:${path}` : it.id);
};

/** A call that came to nothing: it failed, was declined, or was stopped. */
const cameToNothing = (it: ToolItem) => it.tool.status === 'error' || it.tool.status === 'declined' || it.tool.status === 'interrupted';

const titleOf = (it: ToolItem | undefined, kind: PageCall | null): string => {
  const input = (it?.tool.input ?? {}) as { title?: unknown; file_path?: unknown };
  if (kind === 'file') return basename(String(input.file_path ?? 'page.html'));
  return typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'Page';
};

// The storage of a page shown in the conversation lasts while the app is open, wherever it shows.
const shownStores = new Map<string, ReturnType<typeof memoryStore>>();
export function shownStore(itemId: string) {
  let s = shownStores.get(itemId);
  if (!s) shownStores.set(itemId, (s = memoryStore()));
  return s;
}

// ---- opening it by itself -------------------------------------------------------------------------------

onDraftStart((key) => {
  const c = useCanvas.getState();
  if (!c.auto || !matchMedia(CANVAS_MEDIA).matches || !onScreen(key)) return;
  const cur = c.open[key];
  // A page already open with unsaved changes stays.
  if (cur && dirty.has(key)) return;
  const d = useDrafts.getState().byKey[key];
  const id = d ? Object.values(d).filter((x) => !x.done).sort((a, b) => b.startedAt - a.startedAt)[0]?.id : undefined;
  if (id) c.show(key, { kind: 'item', id });
});

/** Sessions whose panel holds changes not saved yet. */
const dirty = new Set<string>();

/** Opens a page call beside the conversation, when the screen is wide enough; false when it is not. */
export function showBeside(key: string, t: CanvasTarget): boolean {
  if (!matchMedia(CANVAS_MEDIA).matches) return false;
  useCanvas.getState().show(key, t);
  return true;
}

// ---- what the panel shows ---------------------------------------------------------------------------------

interface Loaded {
  doc: StudioDoc;
  /** Another kind (a deck, a document, a spreadsheet), edited in its own editor instead. */
  kind?: NonNullable<PageInfo['kind']>;
  model?: ModelDoc<unknown>;
  saveModel?: (model: unknown, force?: boolean) => Promise<boolean>;
  /** What the second line under the title says. */
  sub: string;
  /** Saves; a saved page refuses (409) when a newer version came meanwhile, unless `force`. */
  save: (html: string, force?: boolean) => Promise<boolean>;
  /** Where it lives: a saved page or a file. */
  pageId?: string;
  path?: string;
}

function useLoaded(key: string, target: CanvasTarget, item: ToolItem | undefined, kind: PageCall | null): { loaded: Loaded | null; error: string | null } {
  const home = useApp((x) => x.boot?.home);
  const kept = usePagesStore((x) => (target.kind === 'item' ? x.kept[key]?.[target.id] : undefined));
  const keptMap = usePagesStore((x) => x.kept[key]);
  const pagesVersion = usePagesStore((x) => x.pages);
  const draft = useDrafts((x) => (target.kind === 'item' ? x.byKey[key]?.[target.id] : undefined));
  const [page, setPage] = useState<{ info: PageInfo; html?: string; model?: unknown } | null>(null);
  const [file, setFile] = useState<{ content: string; mtime: number; base: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!keptMap) usePagesStore.getState().loadKept(key).catch(() => {});
  }, [key, !keptMap]);

  // The saved page it is (save_page's, a kept one, or one opened by id).
  const pageId = target.kind === 'page' ? target.id : kind === 'save_page' ? savedRef(item?.tool.output)?.id : kind === 'show_html' ? kept : undefined;
  const loadPage = () => {
    if (!pageId) return;
    api<{ page: PageInfo; html?: string; model?: unknown }>(`/api/pages/${enc(pageId)}`)
      .then((r) => {
        setPage({ info: r.page, html: r.html, model: r.model });
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  };
  useEffect(() => {
    setPage(null);
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);
  // An agent's newer version (or a rename) shows when Pages says it changed.
  useEffect(() => {
    if (pageId && page) loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesVersion]);

  // An HTML file: read once the agent finished writing it.
  const path = kind === 'file' ? String((item?.tool.input as { file_path?: unknown })?.file_path ?? draft?.path ?? '') : '';
  const fileDone = kind === 'file' && !!item && item.tool.status !== 'running' && item.tool.status !== 'pending';
  const loadFile = async () => {
    try {
      const [f, v] = await Promise.all([api<{ content: string | null; mtime: number; binary?: boolean; tooLarge?: boolean }>(`/api/fs/read?path=${enc(path)}`), post<{ url: string }>('/api/fs/view-link', { path })]);
      if (f.content == null) throw new Error(f.tooLarge ? 'The file is too large to edit here' : 'Not a text file');
      setFile({ content: f.content, mtime: f.mtime, base: `${location.origin}${v.url.slice(0, v.url.lastIndexOf('/') + 1)}` });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    setFile(null);
    if (path && fileDone) void loadFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, fileDone]);

  const loaded = useMemo((): Loaded | null => {
    if (pageId) {
      if (!page) return null;
      const id = page.info.id;
      return {
        pageId: id,
        doc: { key: `page:${id}:${page.info.version}`, title: page.info.title, html: page.html ?? '', store: pageStore(id) },
        ...(page.info.kind && page.model !== undefined
          ? {
              kind: page.info.kind,
              model: { key: `page:${id}:${page.info.version}`, title: page.info.title, model: page.model },
              saveModel: async (model: unknown, force?: boolean) => {
                await post(`/api/pages/${enc(id)}/versions`, { model, base: page.info.version, sessionKey: key, force: !!force });
                toast('Saved. The agent sees your changes with your next message.', 'ok');
                loadPage();
                return true;
              },
            }
          : {}),
        sub: `${page.info.kind === 'slides' ? 'Slides in the Library' : page.info.kind === 'doc' ? 'A document in the Library' : page.info.kind === 'sheet' ? 'A spreadsheet in the Library' : page.info.kind === 'tex' ? 'LaTeX in the Library' : 'In the Library'} · version ${page.info.version}`,
        save: async (html, force) => {
          await post(`/api/pages/${enc(id)}/versions`, { html, base: page.info.version, sessionKey: key, force: !!force });
          toast('Saved. The agent sees your changes with your next message.', 'ok');
          loadPage();
          return true;
        },
      };
    }
    if (kind === 'show_html' && item) {
      const input = (item.tool.input ?? {}) as { html?: unknown; title?: unknown };
      const html = typeof input.html === 'string' ? input.html : draft?.done ? draft.text : '';
      if (!html) return null;
      const store: Store = shownStore(item.id);
      return {
        doc: { key: `item:${item.id}`, title: titleOf(item, kind), html, store },
        sub: 'Shown in the conversation',
        save: async (edited) => {
          const r = await post<{ page: PageInfo }>('/api/pages', { title: titleOf(item, kind), html, sessionKey: key, item: item.id, data: shownStore(item.id).dump(), edited });
          usePagesStore.getState().setKept(key, item.id, r.page.id);
          toast('Kept in the Library with your changes. The agent sees them with your next message.', 'ok');
          return true;
        },
      };
    }
    if (kind === 'file' && file) {
      return {
        path,
        doc: { key: `file:${path}:${file.mtime}`, title: basename(path), html: file.content, base: file.base, store: shownStore(`file:${path}`) },
        sub: tildify(path, home),
        save: async (html) => {
          const r = await put<{ mtime: number }>('/api/fs/write', { path, content: html, expectedMtime: file.mtime });
          await post('/api/pages/file-edit', { sessionKey: key, path, before: file.content, after: html }).catch(() => {});
          setFile({ ...file, content: html, mtime: r.mtime });
          toast('Saved. The agent sees your changes with your next message.', 'ok');
          return true;
        },
      };
    }
    return null;
  }, [pageId, page, kind, item, draft?.done, draft?.text, file, path, key, home]);
  return { loaded, error };
}

/**
 * A page of a session to use, edit and save: beside the conversation (`panel`), or over everything on a
 * phone or a narrow window (`sheet`, `page`).
 */
export function SessionPage({ sessionKey: key, target, layout, onClose }: { sessionKey: string; target: CanvasTarget; layout: 'panel' | 'sheet' | 'page'; onClose: () => void }) {
  const items = usePageItems(key);
  const item = target.kind === 'item' ? items.find((i) => i.id === target.id) : undefined;
  const draft = useDrafts((x) => (target.kind === 'item' ? x.byKey[key]?.[target.id] : undefined));
  const kind: PageCall | null = target.kind === 'page' ? 'save_page' : (pageCall(item?.tool) ?? (draft ? draft.tool : null));
  const { loaded, error } = useLoaded(key, target, item, kind);
  // The pages to switch to, newest first: a page saved several times once, at its newest save that saved it.
  const picks = useMemo(() => {
    const newest = items.slice().reverse();
    const seen = new Set<string>();
    const out: ToolItem[] = [];
    for (const it of newest) {
      const k = pageKey(it);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(cameToNothing(it) ? (newest.find((x) => pageKey(x) === k && !cameToNothing(x)) ?? it) : it);
    }
    return out;
  }, [items]);
  const shownKey = target.kind === 'page' ? target.id : item ? pageKey(item) : target.id;
  const auto = useCanvas((x) => x.auto);
  const [menu, setMenu] = useState<'more' | 'pick' | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const onPick = usePicks(key, false);
  const writing = !!draft && !draft.done;
  const title = loaded?.doc.title ?? draft?.title ?? (draft?.path ? basename(draft.path) : undefined) ?? titleOf(item, kind);

  useEffect(() => {
    // Pages being written right now, when the panel opens mid-way.
    useDrafts.getState().load(key).catch(() => {});
  }, [key]);

  const download = () => {
    const html = loaded?.doc.html ?? draft?.text ?? '';
    // A page takes the kit along; an HTML file goes as it is.
    const url = URL.createObjectURL(new Blob([kind === 'file' ? html : pageFile(html)], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = kind === 'file' ? title : `${title.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'page'}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const lead = (
    <>
      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', writing ? 'bg-busy/12 text-busy' : 'bg-accent-soft text-accent')}>
        {kind === 'file' ? <FileCode2 size={16} /> : <AppWindow size={16} />}
      </span>
      <button ref={pickRef} type="button" onClick={() => picks.length > 1 && setMenu(menu === 'pick' ? null : 'pick')} className={cx('min-w-0 text-left', picks.length > 1 && 'cursor-pointer')}>
        <span className="flex min-w-0 items-center gap-1">
          <span translate="no" className="truncate text-[13.5px] font-medium text-fg">
            {title}
          </span>
          {picks.length > 1 && <ChevronDown size={13} className="shrink-0 text-fg-3" />}
        </span>
        <span className="flex items-center gap-1.5 truncate text-[11.5px] text-fg-3">
          {writing && <span className="breathe h-1.5 w-1.5 shrink-0 rounded-full bg-busy" />}
          {writing ? `Writing · ${kb(draft!.text.length)}` : (loaded?.sub ?? (error ? error : ' '))}
        </span>
      </button>
    </>
  );
  const tail = (
    <>
      <IconButton ref={moreRef} label="More" size="sm" active={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}>
        <Ellipsis size={15} />
      </IconButton>
      <IconButton label="Close" size="sm" onClick={onClose}>
        <X size={15} />
      </IconButton>
      <Popover anchor={moreRef} open={menu === 'more'} onClose={() => setMenu(null)} align="end" width={250}>
        {loaded?.pageId && (
          <MenuItem icon={<ExternalLink size={14} />} onClick={() => (setMenu(null), go(`/pages/${loaded.pageId}`))}>
            Open in the Library
          </MenuItem>
        )}
        {loaded?.path && (
          <MenuItem icon={<FolderOpen size={14} />} onClick={() => (setMenu(null), showInFiles(loaded.path!))}>
            Show in Files
          </MenuItem>
        )}
        {loaded?.pageId ? (
          EXPORTS(loaded.kind).map((x) => (
            <MenuItem key={x.format} icon={x.icon} onClick={() => (setMenu(null), void exportFile(loaded.pageId!, x.format, { deck: loaded.kind === 'slides' ? (loaded.model?.model as Deck) : undefined }).catch(toastError))}>
              {`Download as ${x.label}`}
            </MenuItem>
          ))
        ) : (
          <MenuItem icon={<Download size={14} />} onClick={() => (setMenu(null), download())}>
            Save as a file
          </MenuItem>
        )}
        {layout === 'panel' && (
          <>
            <MenuSep />
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-fg-2">
              <span className="min-w-0 flex-1">Open pages here as they are written</span>
              <Switch label="Open pages here as they are written" on={auto} onChange={(v) => useCanvas.getState().setAuto(v)} />
            </div>
          </>
        )}
      </Popover>
      <Popover anchor={pickRef} open={menu === 'pick'} onClose={() => setMenu(null)} width={300}>
        <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-medium text-fg-3">Pages in this conversation</div>
        {picks.slice(0, 9).map((it) => {
            const k = pageCall(it.tool);
            return (
              <MenuItem
                key={it.id}
                icon={k === 'file' ? <FileCode2 size={14} /> : <AppWindow size={14} />}
                onClick={() => {
                  setMenu(null);
                  if (layout === 'panel') useCanvas.getState().show(key, { kind: 'item', id: it.id });
                  else openOver(key, { kind: 'item', id: it.id });
                }}
              >
                <span translate="no" className={cx('truncate', pageKey(it) === shownKey && 'font-semibold')}>
                  {titleOf(it, k)}
                </span>
              </MenuItem>
            );
          })}
      </Popover>
    </>
  );

  const [isDirty, setDirty] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  // A newer version saved meanwhile (the agent's, say): asked before yours goes on top of it.
  const save = async (html: string) => {
    if (!loaded) return false;
    try {
      return await loaded.save(html);
    } catch (e) {
      if ((e as { status?: number }).status !== 409) throw e;
      if (!(await confirm({ title: 'A newer version is there', body: 'The page was saved again while you changed it (by the agent, say). Save yours on top? The other stays among its versions.', confirm: 'Save on top' }))) return false;
      return loaded.save(html, true);
    }
  };
  useEffect(() => {
    if (isDirty) dirty.add(key);
    else dirty.delete(key);
    return () => void dirty.delete(key);
  }, [isDirty, key]);

  const Editor = loaded?.kind ? EDITORS[loaded.kind] : undefined;
  if (loaded?.kind && loaded.model && loaded.saveModel && Editor) {
    const saveModel = loaded.saveModel;
    return (
      <>
        {confirmNode}
        <Editor
          doc={loaded.model}
          pageId={loaded.pageId!}
          layout={layout}
          onSave={async (model: unknown) => {
            try {
              return await saveModel(model);
            } catch (e) {
              if ((e as { status?: number }).status !== 409) throw e;
              if (!(await confirm({ title: 'A newer version is there', body: 'It was saved again while you changed it (by the agent, say). Save yours on top? The other stays among its versions.', confirm: 'Save on top' })))
                return false;
              return saveModel(model, true);
            }
          }}
          onDirty={setDirty}
          lead={lead}
          tail={tail}
          savedNote="the agent sees your changes with your next message"
          onAsk={(text) => {
            composeInsert(text, key);
            if (layout === 'sheet') onClose();
          }}
        />
      </>
    );
  }

  return (
    <>
    {confirmNode}
    <Studio
      doc={loaded?.doc ?? null}
      draft={draft ? { text: draft.text, done: draft.done } : null}
      layout={layout}
      onSave={loaded ? save : undefined}
      onPick={onPick}
      onDirty={setDirty}
      lead={lead}
      tail={tail}
      initialMode={target.edit ? 'edit' : undefined}
      saveLabel={kind === 'show_html' && !loaded?.pageId ? 'Keep with changes' : 'Save'}
      savedNote="the agent sees your changes with your next message"
      onAsk={(text) => {
        composeInsert(text, key);
        // Over everything on a phone: the message box is under it.
        if (layout === 'sheet') onClose();
      }}
    />
    </>
  );
}

/** The panel's left edge: drag it to make the panel wider or narrower. */
/** The panel's left edge, dragged to resize it (pages and templates beside a conversation share its width). */
export function Grip() {
  const start = (e: React.PointerEvent) => {
    const box = (e.currentTarget.parentElement?.parentElement as HTMLElement | null)?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const move = (ev: PointerEvent) => useCanvas.getState().setWidth((box.right - ev.clientX) / box.width);
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };
  return <div onPointerDown={start} title="Drag to resize" className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-accent/30" />;
}

/** The panel beside the conversation, when it shows something and the screen is wide enough. */
export function CanvasSide({ s }: { s: SessionSummary }) {
  const target = useCanvas((x) => x.open[s.key]);
  const width = useCanvas((x) => x.width);
  const wide = useMediaQuery(CANVAS_MEDIA);
  if (!target || !wide) return null;
  const close = () => useCanvas.getState().close(s.key);
  return (
    <aside style={{ width: `${width * 100}%` }} className="relative flex min-h-0 shrink-0 flex-col border-l border-line">
      <Grip />
      {target.kind === 'review' ? (
        <ReviewBeside sessionKey={s.key} id={target.id} onClose={close} />
      ) : (
        <SessionPage key={`${target.kind}:${target.id}:${target.edit ? 'edit' : ''}`} sessionKey={s.key} target={target} layout="panel" onClose={close} />
      )}
    </aside>
  );
}

/** Before and after screenshots of a web app the agent changed, beside the conversation, with the reply's other screens. */
function ReviewBeside({ sessionKey, id, onClose }: { sessionKey: string; id: string; onClose: () => void }) {
  const items = useTimeline((x) => x.byKey[sessionKey]?.items);
  const overlay = useLive((x) => x.byKey[sessionKey]?.overlay);
  const shots = useMemo(() => {
    const seen = new Set<string>();
    const all = [...(items ?? []), ...(overlay?.items ?? [])].filter((i) => !seen.has(i.id) && !!seen.add(i.id));
    return shotsOfTurn(all, id);
  }, [items, overlay, id]);
  return <ReviewPane sessionKey={sessionKey} items={shots} id={id} onClose={onClose} />;
}

/** Whether a session shows something beside its conversation now. */
export function useCanvasOpen(key: string): boolean {
  const open = !!useCanvas((x) => x.open[key]);
  const wide = useMediaQuery(CANVAS_MEDIA);
  return open && wide;
}
export const closeCanvas = (key: string) => useCanvas.getState().close(key);

// ---- over everything, on a phone or a narrow window ---------------------------------------------------------

const useOver = create<{ at: { key: string; target: CanvasTarget } | null }>(() => ({ at: null }));
/** Opens a page of a session over everything (where there is no room beside the conversation). */
export const openOver = (key: string, target: CanvasTarget) => useOver.setState({ at: { key, target } });

/** A page opened over everything, if one is: mounted once by the pages feature. */
export function PageOver() {
  const at = useOver((x) => x.at);
  const mobile = useIsMobile();
  if (!at) return null;
  const close = () => useOver.setState({ at: null });
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-bg pt-[var(--safe-top)]">
      <SessionPage key={`${at.key}:${at.target.kind}:${at.target.id}`} sessionKey={at.key} target={at.target} layout={mobile ? 'sheet' : 'page'} onClose={close} />
    </div>,
    document.body,
  );
}
