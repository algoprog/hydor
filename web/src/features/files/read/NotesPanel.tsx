// The Notes of a PDF open in Files' reader: every highlight by page (its words, or a picture of the area), its note to
// write in place, its colour; a click goes there. Its menu keeps them in a project's knowledge (as one document that
// follows every change, the project of the PDF's folder first) and saves them into the PDF as its own annotations.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Boxes, Check, Copy, Ellipsis, FileDown, Replace, Search, Sparkles, Trash2, X } from 'lucide-react';
import { HIGHLIGHT_COLORS, type HighlightColor, type PdfHighlight, type PdfNotesView } from '@shared/pdfnotes';
import type { SpaceView } from '@shared/spaces';
import { post } from '../../../lib/api';
import { basename } from '../../../lib/format';
import { go, showInFiles } from '../../../lib/nav';
import { toast, toastError, useToasts } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { cx, IconButton, MenuBack, MenuItem, MenuSep, Popover, Throbber, useIsMobile } from '../../../components/ui';
import { SpaceMark } from '../../spaces/parts';
import { useSpaces } from '../../spaces/state';
import { areaUrl, COLOR_NAMES, deepOf, notesText, rgbOf, TAB } from './notes';

/** Projects whose folders hold the file first, then the others as they come. */
function byFolder(spaces: SpaceView[], file: string): SpaceView[] {
  const holds = (s: SpaceView) => [s.folder, ...(s.folders ?? [])].some((f) => file.startsWith(f.replace(/[\\/]+$/, '') + '/') || file.startsWith(f.replace(/[\\/]+$/, '') + '\\'));
  return [...spaces.filter(holds), ...spaces.filter((s) => !holds(s))];
}

/** Up to this many projects show at once in the menu; more, and a field finds the one wanted. */
const SHOWN = 7;

/** The Notes menu: Keep in a project (and where they are kept), Save into the PDF, Copy all. */
export function NotesMenu({ path, hs, kept, onView, onFileSaved }: { path: string; hs: PdfHighlight[]; kept: PdfNotesView['kept']; onView: (v: PdfNotesView) => void; onFileSaved: (saved: { path: string; replaced: boolean }) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<'keep' | 'save' | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const spaces = useSpaces();
  const list = useMemo(() => (spaces ? byFolder(spaces, path) : []), [spaces, path]);
  const close = () => {
    setOpen(false);
    setSub(null);
    setQ('');
  };
  const keep = async (space: string | null) => {
    close();
    try {
      const v = await post<PdfNotesView>('/api/pdf-notes/keep', { path, space, from: TAB });
      onView(v);
      if (v.kept) {
        const id = v.kept.space;
        useToasts.getState().push('ok', `${tr('Kept in the knowledge of')} ${v.kept.spaceName ?? ''}`, { label: tr('Open'), run: () => go(`/projects/${id}/knowledge`) });
      } else toast(tr('No longer kept in the project'), 'ok');
    } catch (e) {
      toastError(e);
    }
  };
  const save = async (replace: boolean) => {
    close();
    setBusy(true);
    try {
      const r = await post<{ path: string; replaced: boolean; count: number; notes: string[] }>('/api/pdf-notes/save', { path, replace });
      if (r.replaced) toast(`${tr('Saved the highlights into')} ${basename(r.path)}`, 'ok');
      else useToasts.getState().push('ok', `${tr('Saved')} ${basename(r.path)}`, { label: tr('Open'), run: () => showInFiles(r.path) });
      for (const n of r.notes) toast(n, 'info');
      onFileSaved({ path: r.path, replaced: r.replaced });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const t = q.trim().toLowerCase();
  const shown = (t ? list.filter((s) => s.name.toLowerCase().includes(t)) : list).slice(0, SHOWN);
  const stem = basename(path).replace(/\.pdf$/i, '');
  return (
    <>
      <IconButton ref={ref} label="More" active={open} disabled={busy} onClick={() => (open ? close() : setOpen(true))}>
        {busy ? <Throbber size={15} /> : <Ellipsis size={16} />}
      </IconButton>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={268} title="Notes">
        {sub === 'keep' ? (
          <>
            <MenuBack onClick={() => setSub(null)}>Keep in a project</MenuBack>
            {!spaces ? (
              <div className="flex justify-center py-3 text-fg-3">
                <Throbber />
              </div>
            ) : (
              <>
                {list.length > SHOWN && (
                  <div className="relative mb-1">
                    <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
                    <input
                      autoFocus
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && shown[0] && void keep(shown[0].id)}
                      placeholder="Find a project"
                      aria-label="Find a project"
                      className="h-8.5 w-full rounded-lg bg-bg-2 pr-2.5 pl-8 text-[13px] outline-none placeholder:text-fg-3 max-sm:h-11 max-sm:text-[15px]"
                    />
                  </div>
                )}
                {shown.map((s) => (
                  <MenuItem key={s.id} icon={<SpaceMark s={s} size={15} />} checked={kept?.space === s.id} onClick={() => void keep(s.id)}>
                    <span translate="no">{s.name}</span>
                  </MenuItem>
                ))}
                {!list.length && <div className="px-2.5 py-1.5 text-[12.5px] text-fg-3">No projects yet: make one in Projects, then keep the notes in it.</div>}
                {t && !shown.length && <div className="px-2.5 py-1.5 text-[12.5px] text-fg-3">No project by that name</div>}
                {kept && (
                  <>
                    <MenuSep />
                    <MenuItem icon={<X size={14} />} onClick={() => void keep(null)}>
                      Stop keeping them there
                    </MenuItem>
                  </>
                )}
                <div className="px-2.5 pt-1 pb-1.5 text-[11.5px] leading-snug text-fg-3">One document of the highlights and notes goes into the project’s knowledge, and follows every change you make here.</div>
              </>
            )}
          </>
        ) : sub === 'save' ? (
          <>
            <MenuBack onClick={() => setSub(null)}>Save into the PDF</MenuBack>
            <MenuItem icon={<Copy size={14} />} onClick={() => void save(false)}>
              Save a copy beside it
            </MenuItem>
            <MenuItem icon={<Replace size={14} />} onClick={() => void save(true)}>
              Replace the file
            </MenuItem>
            <div className="px-2.5 pt-1 pb-1.5 text-[11.5px] leading-snug text-fg-3">
              The highlights become the PDF’s own, with their notes as comments, for other apps to show. A copy is named <span translate="no">“{stem} (highlighted).pdf”</span>. A replaced file’s old version goes to the Trash.
            </div>
          </>
        ) : (
          <>
            <MenuItem icon={<Boxes size={14} />} submenu hint={kept?.spaceName ? <span translate="no">{kept.spaceName}</span> : undefined} disabled={!hs.length && !kept} onClick={() => setSub('keep')}>
              Keep in a project
            </MenuItem>
            {kept && (
              <MenuItem icon={<BookOpen size={14} />} onClick={() => (close(), go(`/projects/${kept.space}/knowledge`))}>
                Open the project’s knowledge
              </MenuItem>
            )}
            <MenuItem icon={<FileDown size={14} />} submenu disabled={!hs.length} onClick={() => setSub('save')}>
              Save into the PDF
            </MenuItem>
            <MenuItem
              icon={<Copy size={14} />}
              disabled={!hs.length}
              onClick={() => {
                close();
                void navigator.clipboard.writeText(notesText(basename(path), hs)).then(
                  () => toast(tr('Copied the notes'), 'ok'),
                  () => toast(tr('The browser did not allow copying'), 'error'),
                );
              }}
            >
              Copy all
            </MenuItem>
          </>
        )}
      </Popover>
    </>
  );
}

/** A note, written in place: as tall as its words. */
function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  // News from elsewhere (another tab, an agent) shows unless it is being written here.
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);
  return (
    <textarea
      ref={ref}
      value={text}
      rows={1}
      translate="no"
      placeholder="Add a note"
      aria-label="Note"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') ref.current?.blur();
      }}
      className="block w-full resize-none bg-transparent px-3 py-1.5 text-[13px] leading-snug text-fg outline-none placeholder:text-fg-3 max-sm:text-[15px]"
    />
  );
}

/** One highlight in the list. */
function Item({
  h,
  path,
  mtime,
  selected,
  canAsk,
  onGo,
  onNote,
  onColor,
  onAsk,
  onRemove,
}: {
  h: PdfHighlight;
  path: string;
  mtime: number;
  selected: boolean;
  canAsk: boolean;
  onGo: () => void;
  onNote: (v: string) => void;
  onColor: (c: HighlightColor) => void;
  onAsk: () => void;
  onRemove: () => void;
}) {
  const mobile = useIsMobile();
  const r = h.rects[0];
  const thumbW = 240;
  const thumbH = r ? Math.min(150, (thumbW * r.h) / Math.max(1, r.w)) : 0;
  return (
    <div className={cx('group mx-2 mb-1.5 rounded-xl border bg-panel', selected ? 'border-accent/60' : 'border-line')}>
      <button type="button" onClick={onGo} className="flex w-full items-start gap-2.5 px-3 pt-2.5 pb-0.5 text-left" title={tr('Show it on the page')}>
        <span className="mt-[3px] h-3.5 w-1 shrink-0 rounded-full" style={{ background: deepOf(h.color) }} aria-label={COLOR_NAMES[h.color]} />
        {h.kind === 'area' && r ? (
          <img src={areaUrl(path, h.page, r, thumbW * 2, mtime)} alt={h.text ?? ''} className="rounded-md border border-line bg-white object-contain" style={{ width: Math.min(thumbW, (thumbH * r.w) / Math.max(1, r.h)), height: thumbH }} />
        ) : (
          <span translate="no" className="line-clamp-4 min-w-0 flex-1 text-[13px] leading-snug text-fg-2">
            {h.text}
          </span>
        )}
      </button>
      {h.lost && <div className="px-3 pt-1 text-[11.5px] leading-snug text-warn">The file changed, and these words are not in it now: it stays where it was.</div>}
      <NoteField value={h.note ?? ''} onChange={onNote} />
      <div className={cx('flex items-center gap-0.5 px-1.5 pb-1.5', !mobile && !selected && 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100')}>
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={COLOR_NAMES[c]}
            aria-pressed={h.color === c}
            title={COLOR_NAMES[c]}
            onClick={() => onColor(c)}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-bg-2"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full ring-1 ring-black/10" style={{ background: rgbOf(c) }}>
              {h.color === c && <Check size={10} strokeWidth={3} className="text-black/70" />}
            </span>
          </button>
        ))}
        <span className="flex-1" />
        {canAsk && (
          <IconButton label="Ask about it" size="sm" onClick={onAsk}>
            <Sparkles size={14} className="text-accent" />
          </IconButton>
        )}
        <IconButton label="Delete" size="sm" onClick={onRemove}>
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}

/**
 * The list. `selected`: the highlight picked on the pages; `onGo` goes to one; `onChange` keeps a highlight's new note
 * or colour; `onView` takes in what the server says after a menu's change; `onFileSaved`: the PDF was written.
 */
export function NotesList({
  path,
  mtime,
  hs,
  kept,
  selected,
  canAsk,
  header,
  onGo,
  onChange,
  onRemove,
  onAsk,
  onView,
  onFileSaved,
  onClose,
}: {
  path: string;
  mtime: number;
  hs: PdfHighlight[];
  kept: PdfNotesView['kept'];
  selected: string | null;
  canAsk: boolean;
  /** Its own title bar (beside the pages); a sheet on a phone has its own, with the menu in it. */
  header: boolean;
  onGo: (h: PdfHighlight) => void;
  onChange: (h: PdfHighlight, patch: Partial<PdfHighlight>, later?: boolean) => void;
  onRemove: (h: PdfHighlight) => void;
  onAsk: (h: PdfHighlight) => void;
  onView: (v: PdfNotesView) => void;
  onFileSaved: (saved: { path: string; replaced: boolean }) => void;
  onClose?: () => void;
}) {
  const pages = useMemo(() => {
    const out: [number, PdfHighlight[]][] = [];
    for (const h of hs) {
      const last = out[out.length - 1];
      if (last && last[0] === h.page) last[1].push(h);
      else out.push([h.page, [h]]);
    }
    return out;
  }, [hs]);
  const menu = <NotesMenu path={path} hs={hs} kept={kept} onView={onView} onFileSaved={onFileSaved} />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {header ? (
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pr-1.5 pl-3.5">
          <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold">
            Notes {hs.length > 0 && <span className="tnum font-normal text-fg-3">{hs.length}</span>}
          </h2>
          {menu}
          {onClose && (
            <IconButton label="Close" onClick={onClose}>
              <X size={16} />
            </IconButton>
          )}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
        {!hs.length ? (
          <div className="px-4 py-6 text-[13px] leading-relaxed text-fg-3">No highlights yet. Select words on a page, or drag a box around a figure or an equation with Select an area (Alt and drag, on a computer).</div>
        ) : (
          pages.map(([n, list]) => (
            <div key={n}>
              <div className="px-4 pt-3 pb-1.5 text-[11.5px] font-medium text-fg-3">Page {n}</div>
              {list.map((h) => (
                <Item
                  key={h.id}
                  h={h}
                  path={path}
                  mtime={mtime}
                  selected={selected === h.id}
                  canAsk={canAsk}
                  onGo={() => onGo(h)}
                  onNote={(v) => onChange(h, { note: v }, true)}
                  onColor={(c) => onChange(h, { color: c })}
                  onAsk={() => onAsk(h)}
                  onRemove={() => onRemove(h)}
                />
              ))}
            </div>
          ))
        )}
        {kept && (
          <button type="button" onClick={() => go(`/projects/${kept.space}/knowledge`)} className="mx-4 mt-3 flex items-start gap-2 text-left text-[12px] leading-snug text-fg-3 hover:text-fg-2">
            <BookOpen size={13} className="mt-0.5 shrink-0" />
            <span>
              Kept in the knowledge of <span translate="no">{kept.spaceName ?? '…'}</span>, and updated as you change them.
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
