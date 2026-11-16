// Pin to a board, in an answer card's "…" (CardTools.tsx): the card's title (to change it first, if you like), then your
// boards, the one changed last first, or New board… named in place. The card's data is copied as it is now (POST
// /api/boards/pin; shared/boards.ts says what a card keeps); a toast says where it went, with Open.
import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutDashboard, Plus } from 'lucide-react';
import type { CardSource } from '@shared/boards';
import type { PageInfo } from '@shared/pages';
import { tr } from '../../i18n/runtime';
import { post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError, useSessions, useToasts } from '../../lib/store';
import { usePagesStore } from '../../features/pages/state';
import { Button, cx, inputCls, MenuBack, MenuItem, Throbber } from '../ui';

/** What a pin sends: the UI's name, its data as the block holds it, its title (the card's own, to change), and where it came from. */
export interface PinCard {
  ui: string;
  data: Record<string, unknown>;
  title: string;
  from?: CardSource;
}

/** The boards to pin to, the one changed last first. */
export function useBoards(): PageInfo[] | null {
  const pages = usePagesStore((s) => s.pages);
  useEffect(() => {
    if (!usePagesStore.getState().pages) usePagesStore.getState().loadPages().catch(() => {});
  }, []);
  return useMemo(() => (pages ? pages.filter((p) => p.kind === 'board').sort((a, b) => b.updatedAt - a.updatedAt) : null), [pages]);
}

/** Pins it, and says where it went with Open. Resolves with the board, or null when it did not go. */
export async function pinCard(card: PinCard, to: { board: string } | { title: string }): Promise<PageInfo | null> {
  try {
    const r = await post<{ page: PageInfo }>('/api/boards/pin', { ...to, card: { ui: card.ui, data: card.data, ...(card.title ? { title: card.title } : {}), from: card.from }, sessionKey: card.from?.session });
    void usePagesStore.getState().loadPages().catch(() => {});
    useToasts.getState().push('ok', tr(`Pinned to “${r.page.title}”`), { label: tr('Open'), run: () => go(`/pages/${r.page.id}`) });
    return r.page;
  } catch (e) {
    toastError(e);
    return null;
  }
}

/**
 * The pane in the card's "…" menu: its title, the boards, New board…. `onBack` goes back to the menu, `onDone` closes it
 * once the card is pinned.
 */
export function PinPane({ card, onBack, onDone }: { card: PinCard; onBack: () => void; onDone: () => void }) {
  const boards = useBoards();
  const [title, setTitle] = useState(card.title);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const nameBox = useRef<HTMLInputElement>(null);
  // The session's own name, for the card's "from" line (kept with it, for when the session is gone).
  const sessionTitle = useSessions((s) => (card.from?.session ? s.byKey[card.from.session]?.title : undefined));
  useEffect(() => {
    if (naming) requestAnimationFrame(() => nameBox.current?.focus());
  }, [naming]);
  const pin = async (to: { board: string } | { title: string }) => {
    if (busy) return;
    setBusy(true);
    const from = card.from ? { ...card.from, ...(sessionTitle && !card.from.title ? { title: sessionTitle } : {}) } : undefined;
    // Its own title unchanged is no title of its own: the board shows the card's.
    const own = title.trim() && title.trim() !== card.title ? title.trim() : '';
    const done = await pinCard({ ...card, title: own, from }, to);
    setBusy(false);
    if (done) onDone();
  };
  const makeNew = () => {
    const n = name.trim();
    if (n) void pin({ title: n });
  };
  return (
    <div className="w-full">
      <MenuBack onClick={onBack}>Pin to a board</MenuBack>
      <label className="block px-2.5 pt-1 pb-2">
        <span className="mb-1 block text-[11.5px] font-medium text-fg-3">Its title on the board</span>
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} translate="no" className={cx(inputCls, 'h-8.5 text-[13px]')} />
      </label>
      <div className="px-2.5 pb-1 text-[11.5px] font-medium text-fg-3">Pin it to</div>
      <div className="max-h-[min(40vh,260px)] overflow-y-auto">
        {boards === null ? (
          <div className="flex justify-center py-2 text-fg-3">
            <Throbber />
          </div>
        ) : (
          boards.map((b) => (
            <MenuItem key={b.id} icon={<LayoutDashboard size={15} />} disabled={busy} onClick={() => void pin({ board: b.id })}>
              <span translate="no">{b.title}</span>
            </MenuItem>
          ))
        )}
      </div>
      {naming ? (
        <div className="flex items-center gap-1.5 px-2.5 pt-1 pb-1.5">
          <input
            ref={nameBox}
            value={name}
            maxLength={120}
            placeholder={tr('Name of the new board')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) makeNew();
              if (e.key === 'Escape') (e.stopPropagation(), setNaming(false));
            }}
            translate="no"
            className={cx(inputCls, 'h-8.5 min-w-0 flex-1 text-[13px]')}
          />
          <Button size="sm" variant="primary" disabled={busy || !name.trim()} onClick={makeNew}>
            Pin it
          </Button>
        </div>
      ) : (
        <MenuItem icon={<Plus size={15} />} disabled={busy} onClick={() => setNaming(true)}>
          New board…
        </MenuItem>
      )}
    </div>
  );
}
