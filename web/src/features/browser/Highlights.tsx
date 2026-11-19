// Your highlights on web pages (marked in the page from its right-click menu: Highlight). The Browser's panel lists those of
// the page you are on, each to show on the page, copy, add a note to, or delete, and to ask an agent about together; the
// Highlights list of pages/BrowserLists.tsx uses the same rows for all of them. Private to you: agents never see
// them, except when you press Ask an agent about these, which sends that page's highlights, quoted, to a new session.
import { useEffect, useRef, useState } from 'react';
import { Copy, Crosshair, ExternalLink, Highlighter, Pencil, Sparkles, Trash2 } from 'lucide-react';
import type { BrowserTab } from '@shared/browser';
import type { PageHighlight } from '@shared/highlights';
import { highlightsAsk } from '@shared/highlight-asks';
import { toast, toastError } from '../../lib/store';
import { Button, cx, IconButton, Throbber } from '../../components/ui';
import { askAgent, deleteHighlight, noteHighlight, showHighlight, usePageHighlights } from './browsing';
import { Note, Panel } from './Panel';

/** The yellow the marks have on the page, for the bar beside a highlight's words. */
const YELLOW = 'border-[#ffd60a]/70';

/** Starts a session about a page's highlights (the agent the start page last had) and opens it. */
export const askAboutHighlights = (page: { url: string; title: string }, highlights: Pick<PageHighlight, 'text' | 'note'>[]) => askAgent(highlightsAsk(page, highlights));

const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Copied', 'ok'), toastError);

/**
 * One highlight: its words, its note (written here), and what can be done to it. `open` names the first button, which
 * shows the words on their page in your Browser (or does `onOpen`); `onChange` and `onGone` hear of a new note and of a delete.
 */
export function HighlightRow({ h, open = 'Show on the page', onOpen, onChange, onGone }: { h: PageHighlight; open?: string; onOpen?: (h: PageHighlight) => void; onChange?: (h: PageHighlight) => void; onGone?: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(h.note);
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) ta.current?.focus();
  }, [editing]);
  const save = async () => {
    setBusy(true);
    const r = await noteHighlight(h.id, draft);
    setBusy(false);
    if (r) {
      setEditing(false);
      onChange?.(r);
    }
  };
  return (
    <div className="group px-4 py-3">
      <blockquote translate="no" className={cx('border-l-[3px] pl-3 text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg', YELLOW)}>
        {h.text}
      </blockquote>
      {editing ? (
        <div className="mt-2">
          <textarea
            ref={ta}
            value={draft}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void save();
              else if (e.key === 'Escape') (setDraft(h.note), setEditing(false));
            }}
            aria-label="Note"
            placeholder="A note on these words"
            translate="no"
            className="w-full resize-y rounded-lg border border-line-2 bg-bg-2 px-2.5 py-2 text-[13px] outline-none focus:border-accent/50"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => (setDraft(h.note), setEditing(false))}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        h.note && (
          <p translate="no" className="mt-1.5 pl-[15px] text-[12.5px] leading-snug whitespace-pre-wrap text-fg-2">
            {h.note}
          </p>
        )
      )}
      <div className="mt-1.5 flex items-center gap-0.5 pl-[9px]">
        <IconButton label={open} size="sm" onClick={() => (onOpen ? onOpen(h) : void showHighlight(h.id))}>
          {open === 'Show on the page' ? <Crosshair size={14} /> : <ExternalLink size={14} />}
        </IconButton>
        <IconButton label="Copy" size="sm" onClick={() => void copy(h.text)}>
          <Copy size={14} />
        </IconButton>
        <IconButton label={h.note ? 'Edit the note' : 'Add a note'} size="sm" active={editing} onClick={() => (setDraft(h.note), setEditing((e) => !e))}>
          <Pencil size={14} />
        </IconButton>
        <IconButton label="Delete" size="sm" onClick={() => void deleteHighlight(h.id).then((ok) => ok && onGone?.(h.id))}>
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}

/** The highlights of the page in this tab. */
export function HighlightsPanel({ tab, onClose }: { tab?: BrowserTab; onClose: () => void }) {
  const list = usePageHighlights(tab?.url);
  const title = tab?.title || tab?.url || '';
  return (
    <Panel
      title="Highlights"
      onClose={onClose}
      actions={
        !!list?.length && (
          <Button size="sm" variant="ghost" icon={<Sparkles size={14} />} onClick={() => tab && void askAboutHighlights({ url: tab.url, title }, list)}>
            Ask an agent about these
          </Button>
        )
      }
    >
      {list === null && tab && /^(https?|file):/i.test(tab.url) ? (
        <div className="flex justify-center py-8 text-fg-3">
          <Throbber size={24} />
        </div>
      ) : !list?.length ? (
        <div className="px-4 py-6 text-center">
          <Highlighter size={22} className="mx-auto text-fg-3" />
          <p className="mt-2 text-[13.5px] font-medium">No highlights on this page</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-fg-3">Select some words, right-click and choose Highlight. They are marked again each time you open the page, and only you can see them.</p>
        </div>
      ) : (
        <>
          <div translate="no" className="truncate px-4 pt-3 text-[12px] text-fg-3">
            {title}
          </div>
          <div className="divide-y divide-line">
            {list.map((h) => (
              <HighlightRow key={h.id} h={h} />
            ))}
          </div>
          <Note>Your highlights stay on this computer. Agents only see them when you ask about them.</Note>
        </>
      )}
    </Panel>
  );
}
