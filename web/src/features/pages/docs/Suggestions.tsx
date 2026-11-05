// A suggested change as Google Docs shows one beside the page (and in the panel of comments on a narrow screen): who
// suggested it and when, what it does in a few words (the words it adds, in its colour; those it takes out, struck; the
// look it changes; the paragraphs it breaks or joins; the blocks it adds or takes out), Accept and Reject, and replies
// under it as a comment has. The words people wrote are shown as written, never translated.
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Change } from '@shared/doc-changes';
import type { Suggestion } from '@shared/docs';
import { cx, IconButton } from '../../../components/ui';
import { CommentBox, Who } from '../common/Comments';
import { LOCALE } from '../../../i18n/locale';

/** The look's changes, in words. */
const LOOK_WORDS: Record<string, string> = {
  b: 'Bold',
  i: 'Italic',
  u: 'Underline',
  s: 'Strikethrough',
  code: 'Code',
  sup: 'Superscript',
  sub: 'Subscript',
  color: 'Text colour',
  hl: 'Highlight',
  size: 'Size',
  font: 'Font',
  link: 'Link',
};

/** Blocks of their own added or taken out, in words (whole phrases: they are translated as one). */
const BLOCK_ADDED: Record<string, string> = { table: 'A table added', image: 'A picture added', hr: 'A line across added', pagebreak: 'A page break added', toc: 'A table of contents added', math: 'An equation added' };
const BLOCK_REMOVED: Record<string, string> = { table: 'A table taken out', image: 'A picture taken out', hr: 'A line across taken out', pagebreak: 'A page break taken out', toc: 'A table of contents taken out', math: 'An equation taken out' };

/** How long ago, in a few words (as a comment's). */
function ago(at: number): string {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = new Date(at);
  return d.toLocaleDateString(LOCALE, d.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * What a change does, line by line (Delete: “words”, Add: “words”, Format: Bold…), in the colour of who suggested it;
 * for a comparison (`past`), what changed (Taken out: “words”, Added: “words”), what was taken out in `removedColor`.
 */
export function ChangeLines({ c, color, removedColor, past }: { c: Change; color: string; removedColor?: string; past?: boolean }) {
  const quote = (t: string, del?: boolean) => (
    <span translate="no" className={cx('break-words', del && 'line-through')} style={{ color: del ? (removedColor ?? color) : color }}>
      “{t.replace(/\n/g, ' ↵ ')}”
    </span>
  );
  const lines: React.ReactNode[] = [];
  if (c.removed)
    lines.push(
      <div key="d">
        {c.removed.trim() ? (
          <>
            <span className="text-fg-3">{past ? 'Taken out:' : 'Delete:'}</span> {quote(c.removed, true)}
          </>
        ) : (
          <span className="text-fg-3">{past ? 'A space or a line break taken out' : 'Delete a space or a line break'}</span>
        )}
      </div>,
    );
  if (c.added)
    lines.push(
      <div key="a">
        {c.added.trim() ? (
          <>
            <span className="text-fg-3">{past ? 'Added:' : 'Add:'}</span> {quote(c.added)}
          </>
        ) : (
          <span className="text-fg-3">{past ? 'A space or a line break added' : 'Add a space or a line break'}</span>
        )}
      </div>,
    );
  if (c.looks.length) lines.push(<div key="f" className="text-fg-3">{`Format: ${c.looks.map((k) => LOOK_WORDS[k] ?? k).join(', ')}`}</div>);
  if (c.paras.added) lines.push(<div key="pa" className="text-fg-3">{c.paras.added === 1 ? 'A new paragraph' : `${c.paras.added} new paragraphs`}</div>);
  if (c.paras.removed) lines.push(<div key="pr" className="text-fg-3">{c.paras.removed === 1 ? 'A paragraph taken out' : `${c.paras.removed} paragraphs taken out`}</div>);
  if (c.breaks.added) lines.push(<div key="ba" className="text-fg-3">{c.breaks.added === 1 ? 'A paragraph broken in two' : `${c.breaks.added} paragraphs broken in two`}</div>);
  if (c.breaks.removed) lines.push(<div key="br" className="text-fg-3">{c.breaks.removed === 1 ? 'Two paragraphs joined' : `${c.breaks.removed + 1} paragraphs joined`}</div>);
  c.blocks.added.forEach((k, i) => lines.push(<div key={`+${i}`} className="text-fg-3">{BLOCK_ADDED[k] ?? k}</div>));
  c.blocks.removed.forEach((k, i) => lines.push(<div key={`-${i}`} className="text-fg-3">{BLOCK_REMOVED[k] ?? k}</div>));
  return <div className="space-y-0.5 text-[13px] leading-snug">{lines}</div>;
}

export function SuggestionCard({
  change,
  sg,
  color,
  active,
  readOnly,
  onFocus,
  onAccept,
  onReject,
  onReply,
}: {
  change: Change;
  sg: Suggestion | undefined;
  color: string;
  active?: boolean;
  readOnly?: boolean;
  onFocus?: () => void;
  onAccept: () => void;
  onReject: () => void;
  onReply: (text: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  useEffect(() => {
    if (!active) setReplying(false);
  }, [active]);
  return (
    <div
      onClick={onFocus}
      className={cx('rounded-xl border bg-elevated p-2.5 text-[13px] transition-shadow', active ? 'border-accent/60 shadow-lg' : 'border-line hover:border-line-2', onFocus && 'cursor-pointer')}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center gap-2">
        <Who by={sg?.by ?? 'user'} author={sg?.author} />
        {sg && <span className="shrink-0 text-[11.5px] text-fg-3">{ago(sg.at)}</span>}
        <span className="flex-1" />
        {!readOnly && (
          <>
            <IconButton
              label="Accept"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onAccept();
              }}
            >
              <Check size={15} />
            </IconButton>
            <IconButton
              label="Reject"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
            >
              <X size={15} />
            </IconButton>
          </>
        )}
      </div>
      <div className="mt-1.5">
        <ChangeLines c={change} color={color} />
      </div>
      {sg?.replies?.map((r) => (
        <div key={r.id} className="mt-2.5 border-t border-line/70 pt-2">
          <div className="flex items-center gap-2">
            <Who by={r.by} author={r.author} />
            <span className="shrink-0 text-[11.5px] text-fg-3">{ago(r.at)}</span>
          </div>
          <div translate="no" className="mt-1 whitespace-pre-wrap break-words text-fg">
            {r.text}
          </div>
        </div>
      ))}
      {!readOnly && sg && (
        <div className="mt-2">
          {replying || active ? (
            <CommentBox placeholder="Reply" submit="Reply" autoFocus={replying} onSubmit={(t) => onReply(t)} onCancel={() => setReplying(false)} />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFocus?.();
                setReplying(true);
              }}
              className="text-[12.5px] text-fg-3 hover:text-fg"
            >
              Reply
            </button>
          )}
        </div>
      )}
    </div>
  );
}
