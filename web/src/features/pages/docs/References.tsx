// Cross-references, bookmarks and captions (Insert → Cross-reference, Insert → Bookmark, Insert → Caption), as Word's:
// a cross-reference points to a numbered picture, table or equation, a heading or a bookmark and shows what it is
// called ("Figure 2", the heading's words), kept up to date as things move and are numbered again; a bookmark names a
// paragraph for links and cross-references; a table's or an equation's caption and its number.
import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Hash, Heading, Search, Trash2 } from 'lucide-react';
import { captionWords, docHeadings, runsText, type Doc } from '@shared/docs';
import type { Refs } from '@shared/doc-refs';
import { Button, Dialog, inputCls, Switch } from '../../../components/ui';

export interface Target {
  id: string;
  kind: 'numbered' | 'heading' | 'bookmark';
  /** What it shows ("Figure 2", the heading's words, the bookmark's name), and more of it to know it by. */
  label: string;
  more?: string;
  level?: number;
}

/** What cross-references and links may point to: numbered pictures, tables and equations, headings, bookmarks. */
export function targetsOf(doc: Doc, refs: Refs): Target[] {
  const out: Target[] = [];
  for (const b of doc.blocks) {
    if ((b.type === 'image' || b.type === 'table') && b.label) out.push({ id: b.id, kind: 'numbered', label: refs.label(b.id) ?? b.label, more: b.caption });
    else if (b.type === 'math' && b.label) out.push({ id: b.id, kind: 'numbered', label: refs.label(b.id) ?? b.label, more: b.tex.slice(0, 60) });
  }
  for (const h of docHeadings(doc)) if (h.level) out.push({ id: h.id, kind: 'heading', label: h.text, level: h.level });
  for (const b of doc.blocks) if ((b.type === 'p' || b.type === 'li') && b.bm) out.push({ id: b.id, kind: 'bookmark', label: b.bm, more: runsText(b.runs).slice(0, 80) });
  return out;
}

const ICON = { numbered: <Hash size={14} />, heading: <Heading size={14} />, bookmark: <Bookmark size={14} /> };

/** Insert → Cross-reference (and a click on one, to point it elsewhere): a list of what it may point to, to pick from. */
export function XrefDialog({ open, doc, refs, title = 'Cross-reference', onPick, onRemove, onClose }: { open: boolean; doc: Doc; refs: Refs; title?: string; onPick: (id: string) => void; onRemove?: () => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) setQ('');
  }, [open]);
  const all = useMemo(() => (open ? targetsOf(doc, refs) : []), [open, doc, refs]);
  const list = all.filter((t) => !q.trim() || `${t.label} ${t.more ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const groups: [Target['kind'], string][] = [
    ['numbered', 'Figures, tables and equations'],
    ['heading', 'Headings'],
    ['bookmark', 'Bookmarks'],
  ];
  return (
    <Dialog open={open} onClose={onClose} title={title} width={480} footer={onRemove ? <Button variant="ghost" icon={<Trash2 size={14} />} onClick={onRemove}>Delete the cross-reference</Button> : undefined}>
      <div className="space-y-2">
        <div className="relative">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a figure, a table, a heading…" aria-label="Find" className={`${inputCls} pl-8`} />
        </div>
        {!all.length && <p className="text-[12.5px] leading-relaxed text-fg-3">Nothing to point to yet: number a picture’s or a table’s caption (Insert → Caption), add headings, or put a bookmark on a paragraph (Insert → Bookmark).</p>}
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {groups.map(([k, name]) => {
            const items = list.filter((t) => t.kind === k);
            if (!items.length) return null;
            return (
              <div key={k}>
                <div className="px-1 pb-0.5 text-[11.5px] font-medium text-fg-3">{name}</div>
                {items.map((t) => (
                  <button key={t.id} type="button" onClick={() => onPick(t.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-bg-2" style={{ paddingLeft: 8 + Math.max(0, (t.level ?? 1) - 1) * 12 }}>
                    <span className="shrink-0 text-fg-3">{ICON[t.kind]}</span>
                    <span translate="no" className="min-w-0 flex-1 truncate text-[13px] text-fg">
                      {t.label}
                      {t.more && <span className="text-fg-3"> · {t.more}</span>}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}

/** A name for a bookmark (Insert → Bookmark), or none. */
export function BookmarkBox({ name, onDone, onRemove }: { name: string; onDone: (name: string) => void; onRemove?: () => void }) {
  const [v, setV] = useState(name);
  return (
    <form
      className="space-y-2 p-2"
      data-keeps-editing
      onKeyDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        onDone(v.trim());
      }}
    >
      <p className="text-[12px] text-fg-3">The paragraph’s name, for links and cross-references to it.</p>
      <input autoFocus value={v} onChange={(e) => setV(e.target.value.slice(0, 80))} placeholder="Methods" aria-label="The bookmark’s name" className={inputCls} />
      <div className="flex justify-between gap-2">
        {onRemove ? (
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} type="button" onClick={onRemove}>
            Remove the bookmark
          </Button>
        ) : (
          <span />
        )}
        <Button size="sm" variant="primary" type="submit" disabled={!v.trim()}>
          Done
        </Button>
      </div>
    </form>
  );
}

/** A table's or an equation's caption: its words (an equation has none) and whether it is numbered ("Table 2", "(3)"). */
export function CaptionBox({ caption, numbered, label, words = true, onDone }: { caption: string; numbered: boolean; label: string; words?: boolean; onDone: (v: { caption: string; numbered: boolean }) => void }) {
  const [v, setV] = useState(caption);
  const [n, setN] = useState(numbered);
  return (
    <form
      className="space-y-2.5 p-2"
      data-keeps-editing
      onKeyDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        onDone({ caption: v.trim(), numbered: n });
      }}
    >
      {words && <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="What it shows" aria-label="The caption" translate="no" className={inputCls} />}
      <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-fg">
        <Switch on={n} onChange={setN} label="Numbered" />
        <span>
          Numbered <span className="text-fg-3">({label} 1, 2, 3…)</span>
        </span>
      </label>
      <div className="flex justify-end">
        <Button size="sm" variant="primary" type="submit">
          Done
        </Button>
      </div>
    </form>
  );
}

export { captionWords };
