// A document, as the person at a link opens it: one of a shared project's, or the one thing shared with them alone (a
// document, slides, a spreadsheet, a LaTeX document, a notebook, a page or a design). To read: its own page, made by
// the server, in the sandboxed frame every page shows in (a page's stored data read as it is; what it changes stays in
// this browser), with its comments beside it on a wide screen (over it on a phone), every kind's but a notebook's:
// theirs under their name, the owner's under the owner's, a new one on words they copy from it (or the whole of it), on
// a slide, or on a spreadsheet's cell. With Edit, documents, spreadsheets, slides, pages and designs (and LaTeX where
// the owner's computer allows) open in the Library's own editor instead, saved through the link; their comments are
// written there. Download makes its files (PDF, Word…). Alone (one thing shared), there is no way back to a project:
// its top has who they are instead.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Download, MessageSquare, MessageSquarePlus } from 'lucide-react';
import type { Comment } from '@shared/comments';
import { kindKey, PORTAL_COMMENTS, type PortalComment, type PortalItemView, type PortalView } from '@shared/share';
import { Logo } from '../../components/Logo';
import { Button, cx, Dialog, IconButton, inputCls, MenuItem, Popover, SheetsOnPhone, Throbber, useConfirm, useIsMobile, useMediaQuery } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { ago } from '../../lib/format';
import { toast, toastError } from '../../lib/store';
import { CommentBox, CommentThread, isMine } from '../pages/common/Comments';
import { EDITORS } from '../pages/editors';
import { exportFile, type ExportFormat } from '../pages/exportFile';
import { EXPORTS } from '../pages/exports';
import { memoryStore, PageFrame, type Store } from '../pages/frame';
import { LinkError, papi } from './api';
import { kindOf, Me } from './PortalPage';

// A page of HTML (or a design) is edited in the Studio, loaded only when one is.
const Studio = lazy(() => import('../pages/studio/Studio').then((m) => ({ default: m.Studio })));

/** A shared page's stored data: read from the server as it is; what the page changes is kept here only, while it is open. */
function portalStore(id: string): Store {
  const mine = memoryStore();
  const gone = new Set<string>();
  const real = (op: 'get' | 'keys', key?: string) => papi<{ value: unknown }>(`/items/${id}/storage`, { body: { op, key } }).then((r) => r.value ?? null);
  return async (c) => {
    if (c.op === 'keys') {
      const keys = new Set([...((await real('keys')) as string[]), ...((await mine(c)) as string[])]);
      return [...keys].filter((k) => !gone.has(k));
    }
    if (c.op === 'get') return gone.has(c.key!) ? null : ((await mine({ op: 'keys' })) as string[]).includes(c.key!) ? mine(c) : real('get', c.key);
    if (c.op === 'remove') gone.add(c.key!);
    else gone.delete(c.key!);
    return mine(c);
  };
}

/** `onBack`: back to the project's documents; none when this is the one thing shared (its top then shows who they are). */
export function PortalDocument({ v, id, onBack, onChanged }: { v: PortalView; id: string; onBack?: () => void; onChanged: () => void }) {
  const [it, setIt] = useState<PortalItemView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const dirty = useRef(false);
  const load = useCallback(
    () =>
      papi<PortalItemView>(`/items/${encodeURIComponent(id)}`).then(
        (r) => {
          setIt(r);
          setErr(null);
        },
        (e) => setErr((e as Error).message),
      ),
    [id],
  );
  useEffect(() => {
    setIt(null);
    void load();
  }, [load]);
  // A newer version (the portal's list hears of it): read again, unless something is being changed here.
  const listed = v.items.find((x) => x.id === id)?.version;
  useEffect(() => {
    if (it && listed && listed !== it.page.version && !dirty.current) void load();
  }, [listed]);
  useEffect(() => {
    if (it) document.title = `${it.page.title} · ${v.project?.name ?? 'Hydor'}`;
  }, [it?.page.title]);

  if (!it)
    return (
      <div className="flex h-full flex-col bg-bg">
        <Bar v={v} onBack={onBack} title={v.items.find((x) => x.id === id)?.title ?? ''} />
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[14px] text-fg-3">{err ?? <Throbber size={28} />}</div>
      </div>
    );
  return it.editable ? <EditView v={v} it={it} onBack={onBack} reload={load} onChanged={onChanged} dirty={dirty} /> : <ReadView v={v} it={it} onBack={onBack} onChanged={onChanged} />;
}

/** The start of a document's top: back to the project, or (shared alone) the app's mark. */
function Lead({ v, onBack, title, sub }: { v: PortalView; onBack?: () => void; title: string; sub?: string }) {
  return (
    <>
      {onBack ? (
        <IconButton label="All documents" onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center" title={tr(`Shared with you by ${v.owner}, from Hydor`)}>
          <Logo size={24} />
        </span>
      )}
      <div className="ml-0.5 min-w-0 flex-1">
        <h1 translate="no" className="truncate text-[15px] font-semibold tracking-tight">
          {title}
        </h1>
        {sub && <div className="truncate text-[11.5px] text-fg-3">{sub}</div>}
      </div>
    </>
  );
}

/** The top of a document: back to the project (or the app's mark), its name, when it changed, and what goes at the end. */
function Bar({ v, onBack, title, sub, children }: { v: PortalView; onBack?: () => void; title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 pt-[calc(var(--safe-top)+8px)] pb-2 sm:px-3">
      <Lead v={v} onBack={onBack} title={title} sub={sub} />
      {children}
      {!onBack && <Me v={v} />}
    </header>
  );
}

/** Its files to download: the kinds it exports as. */
function DownloadMenu({ it }: { it: PortalItemView }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const phone = useIsMobile();
  const get = async (f: ExportFormat) => {
    setOpen(false);
    try {
      await exportFile(it.page.id, f);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <SheetsOnPhone.Provider value>
      {phone ? (
        <IconButton ref={ref} label="Download" active={open} onClick={() => setOpen((o) => !o)}>
          <Download size={16} />
        </IconButton>
      ) : (
        <Button ref={ref} size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => setOpen((o) => !o)} className={cx(open && 'bg-bg-3')}>
          Download
        </Button>
      )}
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={240} title="Download">
        {EXPORTS(it.page.kind).map((x) => (
          <MenuItem key={x.format} icon={x.icon} onClick={() => void get(x.format)}>
            {x.label}
          </MenuItem>
        ))}
      </Popover>
    </SheetsOnPhone.Provider>
  );
}

const subOf = (it: PortalItemView, v: PortalView) => `${tr(kindOf(it.page).label)} · ${v.project ? tr(`Changed ${ago(it.page.updatedAt)}`) : tr(`Shared with you by ${v.owner}`)}`;

/** To read: its own page, with its comments beside it (or over it on a phone). */
function ReadView({ v, it, onBack, onChanged }: { v: PortalView; it: PortalItemView; onBack?: () => void; onChanged: () => void }) {
  const store = useMemo(() => portalStore(it.page.id), [it.page.id]);
  const commented = PORTAL_COMMENTS.includes(kindKey(it.page.kind));
  const wide = useMediaQuery('(min-width: 1024px)');
  const [comments, setComments] = useState<PortalComment[]>(it.comments ?? []);
  const [open, setOpen] = useState(() => commented && wide);
  useEffect(() => setComments(it.comments ?? []), [it]);
  const waiting = comments.filter((c) => !c.resolved).length;
  const panel = (
    <CommentsPanel
      it={it}
      comments={comments}
      onChange={(c) => {
        setComments(c);
        onChanged();
      }}
      inset={wide}
    />
  );
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <Bar v={v} onBack={onBack} title={it.page.title} sub={subOf(it, v)}>
        <DownloadMenu it={it} />
        {commented && (
          <Button size="sm" variant={open ? 'secondary' : 'subtle'} icon={<MessageSquare size={14} />} onClick={() => setOpen((o) => !o)} className={cx(open && 'bg-bg-3')} aria-label={tr('Comments')}>
            <span className="max-sm:hidden">Comments</span>
            {waiting > 0 && <span className="tnum rounded-md bg-bg-2 px-1.5 text-[11.5px] text-fg-3">{waiting}</span>}
          </Button>
        )}
      </Bar>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <PageFrame key={`${it.page.id}:${it.page.version}`} html={it.html ?? ''} store={store} title={it.page.title} fill className="absolute inset-0 h-full w-full" />
        </div>
        {commented && wide && open && <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-line bg-panel">{panel}</aside>}
      </div>
      {commented && !wide && (
        <Dialog open={open} onClose={() => setOpen(false)} title="Comments" width={520}>
          {panel}
        </Dialog>
      )}
    </div>
  );
}

/** Where a comment is, in a few words: its slide, its cell, or the words of a page it is on (the words it quotes show in it). */
function whereOf(c: PortalComment): string {
  if (c.slide) return tr(`Slide ${c.slide}`);
  if (c.cell) return c.sheet ? `${c.sheet} · ${c.cell}` : c.cell;
  return c.on && !c.quote ? `“${c.on.length > 70 ? `${c.on.slice(0, 69)}…` : c.on}”` : '';
}

/**
 * The comments of a document: a new one (on the words they copy from it or the whole of it; on a slide; on a cell of a
 * sheet), and each thread to answer.
 */
function CommentsPanel({ it, comments, onChange, inset }: { it: PortalItemView; comments: PortalComment[]; onChange: (c: PortalComment[]) => void; inset?: boolean }) {
  const id = it.page.id;
  const kind = it.page.kind;
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState('');
  const [slide, setSlide] = useState(1);
  const [sheet, setSheet] = useState(it.sheets?.[0]?.id ?? '');
  const [cell, setCell] = useState('A1');
  const [active, setActive] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const send = async (body: Record<string, unknown>) => {
    try {
      const r = await papi<{ comments: PortalComment[] }>(`/items/${encodeURIComponent(id)}/comments`, { body });
      onChange(r.comments);
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };
  const placeOf = () => (kind === 'slides' ? { slide } : kind === 'sheet' ? { sheet, cell: cell.trim() } : quote.trim() ? { quote: quote.trim() } : {});
  const open = comments.filter((c) => !c.resolved);
  const done = comments.filter((c) => c.resolved);
  const thread = (c: PortalComment) => (
    <div key={c.id} className="space-y-1">
      {whereOf(c) && (
        <div translate="no" className="truncate px-1 text-[11.5px] text-fg-3">
          {whereOf(c)}
        </div>
      )}
      <CommentThread
        comment={c as Comment}
        active={active === c.id}
        onFocus={() => setActive(c.id)}
        onReply={(text) => void send({ id: c.id, reply: text })}
        onResolve={(r) => void send({ id: c.id, resolved: r })}
        onEdit={isMine(c) ? (text) => void send({ id: c.id, text }) : undefined}
        onDelete={isMine(c) ? () => void send({ id: c.id, delete: true }) : undefined}
      />
    </div>
  );
  return (
    // Its own padding beside the page; a sheet on a phone has its own.
    <div className={cx('space-y-2.5', inset ? 'p-3' : 'pb-2')}>
      {adding ? (
        <div className="space-y-2 rounded-xl border border-line bg-elevated p-2.5">
          {kind === 'slides' ? (
            <label className="block text-[12px] font-medium text-fg-3">
              On the slide
              <select value={slide} onChange={(e) => setSlide(Number(e.target.value))} className={cx(inputCls, 'mt-1 h-8 text-[13px]')}>
                {(it.slides ?? []).map((t, i) => (
                  <option key={i} value={i + 1}>
                    {t ? `${i + 1}. ${t}` : tr(`Slide ${i + 1}`)}
                  </option>
                ))}
              </select>
            </label>
          ) : kind === 'sheet' ? (
            <div className="flex gap-2">
              {(it.sheets?.length ?? 0) > 1 && (
                <label className="block min-w-0 flex-1 text-[12px] font-medium text-fg-3">
                  On the sheet
                  <select value={sheet} onChange={(e) => setSheet(e.target.value)} className={cx(inputCls, 'mt-1 h-8 text-[13px]')}>
                    {it.sheets!.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block w-28 shrink-0 text-[12px] font-medium text-fg-3">
                On the cell
                <input value={cell} onChange={(e) => setCell(e.target.value.toUpperCase())} placeholder="B4" maxLength={10} className={cx(inputCls, 'mt-1 h-8 font-mono text-[13px]')} />
              </label>
            </div>
          ) : (
            <label className="block text-[12px] font-medium text-fg-3">
              On the words (optional)
              <input value={quote} onChange={(e) => setQuote(e.target.value)} placeholder={tr(kind === 'tex' ? 'Paste them from the document, or leave this empty' : 'Paste them from it, or leave this empty')} className={cx(inputCls, 'mt-1 h-8 text-[13px]')} />
            </label>
          )}
          <CommentBox
            autoFocus
            onSubmit={async (text) => {
              if (await send({ text, ...placeOf() })) {
                setAdding(false);
                setQuote('');
              }
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <Button size="sm" variant="secondary" icon={<MessageSquarePlus size={14} />} onClick={() => setAdding(true)} className="w-full justify-center">
          Add a comment
        </Button>
      )}
      {open.map(thread)}
      {!open.length && !adding && <div className="px-1 py-3 text-center text-[13px] text-fg-3">{done.length ? 'Every comment is resolved.' : 'No comments yet.'}</div>}
      {done.length > 0 && (
        <button type="button" onClick={() => setResolved((x) => !x)} className="px-1 text-[12.5px] text-fg-3 hover:text-fg">
          {resolved ? 'Hide the resolved ones' : tr(`Show ${done.length} resolved`)}
        </button>
      )}
      {resolved && done.map(thread)}
    </div>
  );
}

/** With Edit: the Library's own editor (a page of HTML's or a design's: the Studio), saved through the link (a newer version meanwhile is asked about). */
function EditView({ v, it, onBack, reload, onChanged, dirty }: { v: PortalView; it: PortalItemView; onBack?: () => void; reload: () => Promise<void>; onChanged: () => void; dirty: React.MutableRefObject<boolean> }) {
  const phone = useIsMobile();
  const [confirm, confirmNode] = useConfirm();
  const store = useMemo(() => portalStore(it.page.id), [it.page.id]);
  const html = !it.page.kind;
  const Editor = it.page.kind ? EDITORS[it.page.kind] : undefined;
  const save = async (what: { model: unknown } | { html: string }) => {
    const body = { ...what, base: it.page.version };
    try {
      await papi(`/items/${encodeURIComponent(it.page.id)}/versions`, { body });
    } catch (e) {
      if (!(e instanceof LinkError) || e.status !== 409) throw e;
      if (!(await confirm({ title: 'A newer version is there', body: 'It was saved again while you changed it. Save yours on top? The other stays among its versions.', confirm: 'Save on top' }))) return false;
      await papi(`/items/${encodeURIComponent(it.page.id)}/versions`, { body: { ...body, force: true } });
    }
    dirty.current = false;
    toast('Saved', 'ok');
    await reload();
    onChanged();
    return true;
  };
  if (!Editor && !html) return <ReadView v={v} it={it} onBack={onBack} onChanged={onChanged} />;
  const key = `${it.page.id}:${it.page.version}`;
  const lead = <Lead v={v} onBack={onBack} title={it.page.title} sub={subOf(it, v)} />;
  const tail = (
    <>
      <DownloadMenu it={it} />
      {!onBack && <Me v={v} />}
    </>
  );
  const note = tr(`${v.owner} sees what you save, under your name`);
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      {html ? (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-fg-3">
              <Throbber size={28} />
            </div>
          }
        >
          <Studio
            key={it.page.id}
            doc={{ key, title: it.page.title, html: it.html ?? '', store }}
            layout={phone ? 'sheet' : 'page'}
            onSave={(h) => save({ html: h })}
            onDirty={(d) => (dirty.current = d)}
            savedNote={note}
            lead={lead}
            tail={tail}
            pageId={it.page.id}
          />
        </Suspense>
      ) : (
        Editor && (
          <Editor
            key={it.page.id}
            doc={{ key, title: it.page.title, model: it.model }}
            pageId={it.page.id}
            layout={phone ? 'sheet' : 'page'}
            onSave={(model: unknown) => save({ model })}
            onDirty={(d: boolean) => (dirty.current = d)}
            savedNote={note}
            lead={lead}
            tail={tail}
          />
        )
      )}
      {confirmNode}
    </div>
  );
}
