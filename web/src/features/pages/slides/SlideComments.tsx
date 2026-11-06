// The comments of a deck, in the slides editor's side panel (its Comments tab), as PowerPoint's and Google Slides'
// comments pane has them: every slide's threads in the slides' order, each on a part of its slide (named above it; a
// click there picks the part) or on the whole slide, with Reply, Resolve (or Reopen), Edit and Delete (the shared
// CommentThread); Comment adds one on the part picked, or on the slide, in the field at the top. Resolved ones show when
// asked for. What people and agents wrote is shown as written, never translated.
import { useState } from 'react';
import { MessageSquarePlus, Sparkles } from 'lucide-react';
import { newCommentId } from '@shared/comments';
import { plainText, slideTitle, type Deck, type El, type SlideComment } from '@shared/slides';
import { Button, cx } from '../../../components/ui';
import { CommentBox, CommentThread } from '../common/Comments';
import { findEl, setSlide } from './ops';

type Change = (d: Deck | ((d: Deck) => Deck), key?: string) => void;

/** What a part is, in a word the app's language translates. */
const KIND: Record<El['type'], string> = { text: 'Text box', shape: 'Shape', image: 'Picture', line: 'Line', table: 'Table', chart: 'Chart', icon: 'Icon', math: 'Equation', video: 'Video', code: 'Code', html: 'Custom code', embed: 'Web page', quiz: 'Quiz', score: 'Quiz score', scene3d: '3D', qr: 'QR code', group: 'Group' };

/** A part's own words to know it by (its name, its words, a chart's title…), as written. */
function wordsOf(e: El): string {
  if (e.name) return e.name;
  if (e.type === 'text' || e.type === 'shape') return plainText(e.paras).replace(/\s+/g, ' ').trim();
  if (e.type === 'chart') return e.title ?? '';
  if (e.type === 'math') return e.tex;
  if (e.type === 'icon') return e.icon.replace(/-/g, ' ');
  return '';
}

/** The part a comment is on, as a line above it: its kind (translated) and its own words (as written). */
function OnPart({ e, onClick }: { e: El; onClick?: () => void }) {
  const w = wordsOf(e);
  return (
    <button type="button" onClick={onClick} className="flex max-w-full min-w-0 items-center gap-1 text-left text-[11.5px] text-fg-3 hover:text-fg-2">
      <span className="shrink-0">{KIND[e.type]}</span>
      {w && (
        <span translate="no" className="min-w-0 truncate">
          · {w}
        </span>
      )}
    </button>
  );
}

/** A slide's comments changed by `f` (none left: the slide keeps no list). */
export const setComments = (d: Deck, i: number, f: (cs: SlideComment[]) => SlideComment[]): Deck =>
  setSlide(d, i, (s) => {
    const cs = f(s.comments ?? []);
    const { comments: _c, ...rest } = s;
    return cs.length ? { ...rest, comments: cs } : rest;
  });

export function SlideComments({
  deck,
  index,
  readOnly,
  adding,
  onAdd,
  onAdded,
  change,
  active,
  onActive,
  onGo,
  onAsk,
}: {
  deck: Deck;
  /** The slide on view. */
  index: number;
  readOnly?: boolean;
  /** A comment being written: on a part of the slide on view, or on the slide (el: none). */
  adding: { el?: string } | null;
  /** Comment: on what is picked, or on the slide. */
  onAdd: () => void;
  /** The comment being written was added (its id), or dropped (null). */
  onAdded: (id: string | null) => void;
  change: Change;
  /** The thread picked (its mark on the slide raised, its reply field open). */
  active: string | null;
  onActive: (id: string | null) => void;
  /** To a slide, and the part a comment is on picked. */
  onGo: (slide: number, el?: string) => void;
  onAsk?: (text: string) => void;
}) {
  const [resolved, setResolved] = useState(false);
  const all = deck.slides.flatMap((s, i) => (s.comments ?? []).map((c) => ({ c, i })));
  const open = all.filter((x) => !x.c.resolved).length;
  const done = all.length - open;
  const shown = all.filter((x) => resolved || !x.c.resolved);
  const slides = [...new Set(shown.map((x) => x.i))];
  const on = adding?.el ? findEl(deck.slides[index]?.els ?? [], adding.el) : undefined;
  const edit = (i: number, id: string, f: (c: SlideComment) => SlideComment | null) =>
    change(
      (d) =>
        setComments(d, i, (cs) =>
          cs.flatMap((c) => {
            if (c.id !== id) return [c];
            const next = f(c);
            return next ? [next] : [];
          }),
        ),
      `comment:${id}`,
    );
  return (
    <div className="space-y-3 px-3 py-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="secondary" icon={<MessageSquarePlus size={14} />} onClick={onAdd} disabled={!!adding}>
            Comment
          </Button>
          {open > 0 && onAsk && (
            <Button size="sm" variant="ghost" icon={<Sparkles size={14} />} className="max-w-full min-w-0" title="Ask the agent to answer the comments" onClick={() => onAsk('Answer the comments on the slides: make the changes they ask for, and reply to each. ')}>
              <span className="min-w-0 truncate">Ask the agent to answer the comments</span>
            </Button>
          )}
        </div>
      )}
      {adding && (
        <div className="space-y-1.5 rounded-xl border border-accent/50 bg-elevated p-2.5">
          {on ? <OnPart e={on} /> : <div className="text-[11.5px] text-fg-3">On the whole slide</div>}
          <CommentBox
            autoFocus
            onSubmit={(text) => {
              const id = newCommentId();
              const c: SlideComment = { id, by: 'user', text, at: Date.now(), ...(on ? { el: on.id } : {}) };
              change((d) => setComments(d, index, (cs) => [...cs, c]));
              onAdded(id);
            }}
            onCancel={() => onAdded(null)}
          />
        </div>
      )}
      {!all.length && !adding && <p className="text-[12.5px] leading-relaxed text-fg-3">No comments yet. Pick a part of a slide (or nothing, for the whole slide), then Comment, or Insert → Comment (Ctrl+Alt+M).</p>}
      {done > 0 && (
        <button type="button" onClick={() => setResolved((r) => !r)} className="text-[12px] text-fg-3 hover:text-fg">
          {resolved ? 'Hide resolved comments' : 'Show resolved comments'}
          {!resolved && <span className="tabular-nums"> ({done})</span>}
        </button>
      )}
      {slides.map((i) => {
        const s = deck.slides[i];
        const title = slideTitle(s);
        return (
          <section key={s.id} className="space-y-1.5">
            <button type="button" onClick={() => onGo(i)} className={cx('flex w-full min-w-0 items-center gap-1 text-left text-[12px] font-semibold', i === index ? 'text-fg' : 'text-fg-2 hover:text-fg')}>
              <span className="shrink-0">{`Slide ${i + 1}`}</span>
              {title && (
                <span translate="no" className="min-w-0 truncate font-normal text-fg-3">
                  · {title}
                </span>
              )}
            </button>
            {shown
              .filter((x) => x.i === i)
              .map(({ c }) => {
                const part = c.el ? findEl(s.els, c.el) : undefined;
                return (
                  <div key={c.id} className="space-y-1">
                    {part && <OnPart e={part} onClick={() => onGo(i, part.id)} />}
                    <CommentThread
                      comment={c}
                      active={active === c.id}
                      readOnly={readOnly}
                      onFocus={() => {
                        onActive(c.id);
                        onGo(i, c.el);
                      }}
                      onReply={(text) => edit(i, c.id, (x) => ({ ...x, replies: [...(x.replies ?? []), { id: newCommentId(), by: 'user', text, at: Date.now() }] }))}
                      onResolve={(r) => edit(i, c.id, (x) => (r ? { ...x, resolved: true } : (({ resolved: _r, ...rest }) => rest)(x)))}
                      onEdit={(text) => edit(i, c.id, (x) => ({ ...x, text }))}
                      onDelete={() => edit(i, c.id, () => null)}
                    />
                  </div>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}
