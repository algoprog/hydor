// Footnotes in the editor, as Word and Google Docs show them: on pages, each page's notes at its foot (under a short
// line, the page's words ending over them: paging.ts keeps their room), numbered as their marks come; without pages, at
// the end of the document. A note's words are changed in a small box at its mark (or by a click on the note itself),
// with bold, italic and links as anywhere (Ctrl+B, Ctrl+I); Insert → Footnote (Ctrl+Alt+F) puts a mark at the caret
// and opens the box for its words.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { htmlRuns, notesHtml, runsHtml, type Block, type Doc, type DocRefs, type Run } from '@shared/docs';
import { Button } from '../../../components/ui';
import { GAP, type Layout, type NoteRoom } from './paging';

/** The line over a page's notes and the room around it, in the paper's pixels. */
const SEP = 16;

/** The notes' room on pages: which notes each block brings to its page (those whose first mark is in it), and how tall each is drawn at the text's width. */
export function noteRoom(doc: Doc, css: { width: number }): NoteRoom | null {
  if (!doc.notes?.length) return null;
  const first = new Map<string, string>();
  const take = (b: Block, runs: Run[]) => {
    for (const r of runs) if (r.fn && !first.has(r.t)) first.set(r.t, b.id);
  };
  for (const b of doc.blocks) {
    if (b.type === 'p' || b.type === 'li') take(b, b.runs);
    else if (b.type === 'table') for (const row of b.rows) for (const c of row) take(b, c.runs);
  }
  const byBlock = new Map<string, string[]>();
  for (const [id, b] of first) byBlock.set(b, [...(byBlock.get(b) ?? []), id]);
  return { ids: (b) => byBlock.get(b.id) ?? [], height: (id) => measure(doc, id, css.width), sep: SEP };
}

const sizes = new Map<string, number>();
let box: HTMLDivElement | null = null;

/** A note's height as drawn at the foot of a page (its words at `width`), measured once for its words. */
function measure(doc: Doc, id: string, width: number): number {
  const n = doc.notes?.find((x) => x.id === id);
  if (!n) return 0;
  const key = `${width}|${doc.font}|${doc.size}|${JSON.stringify(n.runs)}`;
  const known = sizes.get(key);
  if (known !== undefined) return known;
  if (!box) {
    box = document.createElement('div');
    box.className = 'nd-ed nd-doc';
    box.setAttribute('aria-hidden', 'true');
    document.body.appendChild(box);
  }
  box.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;width:${width}px;min-height:0;padding:0;margin:0;background:none`;
  box.innerHTML = notesHtml(doc, { note: () => 1, text: () => '', label: () => null, bib: () => [] }, { ids: [id] });
  const h = box.firstElementChild?.getBoundingClientRect().height ?? 0;
  if (sizes.size > 2000) sizes.clear();
  sizes.set(key, h);
  return h;
}

/** Each page's notes at its foot, over the sheets (in the paper's pixels, shown at the page's zoom). */
export function PageNotes({ layout, zoom, doc, refs, textW, onOpen }: { layout: Layout; zoom: number; doc: Doc; refs: DocRefs; textW: number; onOpen: (id: string, at: DOMRect) => void }) {
  if (!layout.notes.size) return null;
  const step = layout.pageH + GAP;
  return (
    <div className="nd-ed nd-doc pointer-events-none absolute top-0 left-0" style={{ zoom, width: 0, minHeight: 0, padding: 0, background: 'none' }}>
      {[...layout.notes].map(([p, n]) => (
        <div
          key={p}
          data-keeps-editing
          className="pointer-events-auto absolute"
          style={{ left: layout.margin, width: textW, top: p * step + layout.pageH - layout.margin - n.h }}
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={(ev) => {
            const el = (ev.target as HTMLElement).closest('[data-note]') as HTMLElement | null;
            if (el?.dataset.note) onOpen(el.dataset.note, el.getBoundingClientRect());
          }}
        >
          <div style={{ height: SEP, paddingTop: SEP / 2 - 1 }}>
            <div style={{ width: '33%', borderTop: '1px solid #c8ccd1' }} />
          </div>
          <div className="cursor-pointer" translate="no" dangerouslySetInnerHTML={{ __html: notesHtml(doc, refs, { ids: n.ids }) }} />
        </div>
      ))}
    </div>
  );
}

/** Without pages (a phone, a narrow window): the notes at the end of the document. */
export function EndNotes({ doc, refs, onOpen }: { doc: Doc; refs: DocRefs; onOpen: (id: string, at: DOMRect) => void }) {
  const ids = (doc.notes ?? []).map((n) => n.id).filter((id) => refs.note(id) > 0).sort((a, b) => refs.note(a) - refs.note(b));
  if (!ids.length) return null;
  return (
    <div className="nd-ed nd-doc" style={{ minHeight: 0, paddingTop: 0, paddingBottom: 32, background: '#fff' }} data-keeps-editing>
      <div style={{ width: '33%', borderTop: '1px solid #c8ccd1', margin: '0 0 8px' }} />
      <div
        className="cursor-pointer"
        translate="no"
        onMouseDown={(ev) => ev.preventDefault()}
        onClick={(ev) => {
          const el = (ev.target as HTMLElement).closest('[data-note]') as HTMLElement | null;
          if (el?.dataset.note) onOpen(el.dataset.note, el.getBoundingClientRect());
        }}
        dangerouslySetInnerHTML={{ __html: notesHtml(doc, refs, { ids }) }}
      />
    </div>
  );
}

/** A footnote's words, changed: bold, italic and underline with their keys, Enter when done (Shift+Enter a new line), Esc to leave them. */
export function NoteBox({ runs, number, onDone, onCancel, onRemove }: { runs: Run[]; number: number; onDone: (runs: Run[]) => void; onCancel: () => void; onRemove: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = runs.length ? runsHtml(runs, { view: true }).replace(/ target="_blank" rel="noopener noreferrer"/g, '') : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  }, []);
  const done = () => onDone(htmlRuns(ref.current?.innerHTML ?? '').filter((r) => !r.fn));
  return (
    <div className="space-y-2 p-2" data-keeps-editing>
      <div className="flex items-start gap-2">
        <span className="mt-[3px] w-5 shrink-0 text-right text-[11px] font-semibold text-fg-3 tabular-nums">{number || ''}</span>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="The footnote's words"
          aria-multiline
          translate="no"
          onKeyDown={(ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter' && !ev.shiftKey) {
              ev.preventDefault();
              done();
            } else if (ev.key === 'Escape') {
              ev.preventDefault();
              onCancel();
            }
          }}
          onPaste={(ev) => {
            // Words alone, as the box keeps them.
            ev.preventDefault();
            document.execCommand('insertText', false, ev.clipboardData.getData('text/plain'));
          }}
          data-ph="The footnote's words"
          className="min-h-[52px] min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[13px] leading-relaxed whitespace-pre-wrap text-fg outline-none focus:border-accent empty:before:text-fg-3 empty:before:content-[attr(data-ph)]"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={onRemove}>
          Delete the footnote
        </Button>
        <Button size="sm" variant="primary" onClick={done}>
          Done
        </Button>
      </div>
    </div>
  );
}
