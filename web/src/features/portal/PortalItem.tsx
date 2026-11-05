// A document of a shared project, as the person at the link opens it. To read: its own page, made by the server, in
// the sandboxed frame every page shows in (a page's stored data read as it is; what it changes stays in this browser),
// with the comments beside it on a wide screen (over it on a phone) for documents and LaTeX documents: theirs under
// their name, the owner's under the owner's, a new one on words they copy from it or on the whole document. With Edit
// documents, documents, spreadsheets and slides (and LaTeX where the owner's computer allows) open in the Library's
// own editor instead, saved through the link; their comments are written there. Download makes its files (PDF, Word…).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, MessageSquare, MessageSquarePlus } from 'lucide-react';
import type { Comment } from '@shared/comments';
import { PORTAL_COMMENTS, type PortalItemView, type PortalView } from '@shared/share';
import { Button, cx, Dialog, IconButton, inputCls, MenuItem, Popover, Throbber, useConfirm, useIsMobile, useMediaQuery } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { ago } from '../../lib/format';
import { toast, toastError } from '../../lib/store';
import { CommentBox, CommentThread, isMine } from '../pages/common/Comments';
import { EDITORS } from '../pages/editors';
import { exportFile, type ExportFormat } from '../pages/exportFile';
import { EXPORTS } from '../pages/exports';
import { memoryStore, PageFrame, type Store } from '../pages/frame';
import { LinkError, papi } from './api';
import { kindOf } from './PortalPage';

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

export function PortalDocument({ v, id, onBack, onChanged }: { v: PortalView; id: string; onBack: () => void; onChanged: () => void }) {
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
    if (it) document.title = `${it.page.title} · ${v.project.name}`;
  }, [it?.page.title]);

  if (!it)
    return (
      <div className="flex h-full flex-col bg-bg">
        <Bar onBack={onBack} title={v.items.find((x) => x.id === id)?.title ?? ''} />
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[14px] text-fg-3">{err ?? <Throbber size={28} />}</div>
      </div>
    );
  return it.editable ? <EditView v={v} it={it} onBack={onBack} reload={load} onChanged={onChanged} dirty={dirty} /> : <ReadView it={it} onBack={onBack} />;
}

/** The top of a document: back to the project, its name, when it changed, and what goes at the end. */
function Bar({ onBack, title, sub, children }: { onBack: () => void; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 pt-[calc(var(--safe-top)+8px)] pb-2 sm:px-3">
      <IconButton label="All documents" onClick={onBack}>
        <ArrowLeft size={18} />
      </IconButton>
      <div className="ml-0.5 min-w-0 flex-1">
        <h1 translate="no" className="truncate text-[15px] font-semibold tracking-tight">
          {title}
        </h1>
        {sub && <div className="truncate text-[11.5px] text-fg-3">{sub}</div>}
      </div>
      {children}
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
    <>
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
    </>
  );
}

const subOf = (it: PortalItemView) => `${tr(kindOf(it.page).label)} · ${tr(`Changed ${ago(it.page.updatedAt)}`)}`;

/** To read: its own page, with its comments beside it (or over it on a phone). */
function ReadView({ it, onBack }: { it: PortalItemView; onBack: () => void }) {
  const store = useMemo(() => portalStore(it.page.id), [it.page.id]);
  const commented = !!it.page.kind && PORTAL_COMMENTS.includes(it.page.kind);
  const wide = useMediaQuery('(min-width: 1024px)');
  const [comments, setComments] = useState<Comment[]>(it.comments ?? []);
  const [open, setOpen] = useState(() => commented && wide);
  useEffect(() => setComments(it.comments ?? []), [it]);
  const waiting = comments.filter((c) => !c.resolved).length;
  const panel = <CommentsPanel id={it.page.id} comments={comments} onChange={setComments} />;
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <Bar onBack={onBack} title={it.page.title} sub={subOf(it)}>
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

/** The comments of a document: a new one (on the words they copy from it, or the whole document), and each thread to answer. */
function CommentsPanel({ id, comments, onChange }: { id: string; comments: Comment[]; onChange: (c: Comment[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const send = async (body: Record<string, unknown>) => {
    try {
      const r = await papi<{ comments: Comment[] }>(`/items/${encodeURIComponent(id)}/comments`, { body });
      onChange(r.comments);
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };
  const open = comments.filter((c) => !c.resolved);
  const done = comments.filter((c) => c.resolved);
  const thread = (c: Comment) => (
    <CommentThread
      key={c.id}
      comment={c}
      active={active === c.id}
      onFocus={() => setActive(c.id)}
      onReply={(text) => void send({ id: c.id, reply: text })}
      onResolve={(r) => void send({ id: c.id, resolved: r })}
      onEdit={isMine(c) ? (text) => void send({ id: c.id, text }) : undefined}
      onDelete={isMine(c) ? () => void send({ id: c.id, delete: true }) : undefined}
    />
  );
  return (
    <div className="space-y-2.5 p-3">
      {adding ? (
        <div className="space-y-2 rounded-xl border border-line bg-elevated p-2.5">
          <label className="block text-[12px] font-medium text-fg-3">
            On the words (copy them from the document, or leave this empty for the whole document)
            <input value={quote} onChange={(e) => setQuote(e.target.value)} placeholder={tr('The words it is about')} className={cx(inputCls, 'mt-1 h-8 text-[13px]')} />
          </label>
          <CommentBox
            autoFocus
            onSubmit={async (text) => {
              if (await send(quote.trim() ? { text, quote: quote.trim() } : { text })) {
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

/** With Edit documents: the Library's own editor, saved through the link (a newer version meanwhile is asked about). */
function EditView({ v, it, onBack, reload, onChanged, dirty }: { v: PortalView; it: PortalItemView; onBack: () => void; reload: () => Promise<void>; onChanged: () => void; dirty: React.MutableRefObject<boolean> }) {
  const phone = useIsMobile();
  const [confirm, confirmNode] = useConfirm();
  const Editor = it.page.kind ? EDITORS[it.page.kind] : undefined;
  const save = async (model: unknown) => {
    const body = { model, base: it.page.version };
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
  if (!Editor) return <ReadView it={it} onBack={onBack} />;
  const key = `${it.page.id}:${it.page.version}`;
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <Editor
        key={it.page.id}
        doc={{ key, title: it.page.title, model: it.model }}
        pageId={it.page.id}
        layout={phone ? 'sheet' : 'page'}
        onSave={save}
        onDirty={(d) => (dirty.current = d)}
        savedNote={tr(`${v.owner} sees what you save, under your name`)}
        lead={
          <>
            <IconButton label="All documents" onClick={onBack}>
              <ArrowLeft size={18} />
            </IconButton>
            <div className="ml-0.5 min-w-0">
              <h1 translate="no" className="truncate text-[15px] font-semibold tracking-tight">
                {it.page.title}
              </h1>
              <div className="truncate text-[11.5px] text-fg-3">{subOf(it)}</div>
            </div>
          </>
        }
        tail={<DownloadMenu it={it} />}
      />
      {confirmNode}
    </div>
  );
}
