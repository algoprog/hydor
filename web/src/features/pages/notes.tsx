// The note a changed page leaves in the conversation: the user changed it in the editor, and the agent
// hears of it with their next message (then: it did). A click opens the page again.
import { PenLine } from 'lucide-react';
import type { SessionNote } from '@shared/features';
import type { PageEditNote } from '@shared/pages';
import { openFile } from '../../lib/nav';
import { editPage } from '../session/HtmlPage';

export function PageEditNoteView({ note, sessionKey }: { note: SessionNote; sessionKey: string }) {
  const d = note.data as PageEditNote;
  const open = () => (d.pageId ? editPage(sessionKey, { kind: 'page', id: d.pageId }) : d.path ? openFile(d.path) : undefined);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={open}
        title={d.told ? 'The agent saw your changes with your message' : 'The agent sees your changes with your next message'}
        className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
      >
        <PenLine size={13} className="shrink-0 text-fg-3" />
        <span className="truncate">
          You changed <span translate="no">“{d.title}”</span>
          {d.version > 1 ? ` (version ${d.version})` : ''} · {d.told ? 'the agent saw it' : 'the agent sees it with your next message'}
        </span>
      </button>
    </div>
  );
}
