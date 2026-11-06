// What a page of the Library shows besides itself: the band of a page locked (so it doesn't change by accident), the
// pages that link to it (its backlinks), and how many words it has.
import { useEffect, useState, type RefObject } from 'react';
import { Lock } from 'lucide-react';
import type { PageInfo } from '@shared/pages';
import { api, enc, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { Button, MenuItem, Popover, Throbber } from '../../components/ui';

/** Locks or unlocks a page: locked, it makes no new version until it is unlocked. */
export const lockPage = (id: string, locked: boolean) => post<{ page: PageInfo }>(`/api/pages/${enc(id)}/lock`, { locked });

export function LockBand({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-bg-1 px-3 py-2 text-[12.5px] sm:px-5">
      <Lock size={14} className="shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1 text-fg-2">Locked, so it doesn’t change by accident: it can be used, and its databases still take rows.</span>
      <Button size="sm" variant="ghost" onClick={onUnlock} className="h-7">
        Unlock
      </Button>
    </div>
  );
}

/** How many words a page's HTML shows, and about how long it takes to read. */
export function pageWords(html: string): { words: number; chars: number; minutes: number } {
  const d = new DOMParser().parseFromString(html, 'text/html');
  for (const x of d.querySelectorAll('script,style,template,noscript')) x.remove();
  const text = (d.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  // (words of scripts written without spaces count by their characters)
  const cjk = (text.match(/[぀-ヿ㐀-鿿가-힯]/g) ?? []).length;
  const words = (text.replace(/[぀-ヿ㐀-鿿가-힯]/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length + cjk;
  return { words, chars: text.length, minutes: Math.max(1, Math.round(words / 230)) };
}

/** The pages that link to this one, each opening at its place. */
export function BacklinksPopover({ pageId, anchor, open, onClose }: { pageId: string; anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void }) {
  const [list, setList] = useState<{ id: string; title: string; icon?: string }[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setList(null);
    api<{ pages: { id: string; title: string; icon?: string }[] }>(`/api/pages/${enc(pageId)}/backlinks`).then(
      (r) => setList(r.pages),
      () => setList([]),
    );
  }, [open, pageId]);
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align="end" width={280} title="Linked from">
      <div className="px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-fg-3">The pages that link to this one</div>
      {list === null ? (
        <div className="flex justify-center py-3 text-fg-3">
          <Throbber size={16} />
        </div>
      ) : list.length ? (
        list.map((p) => (
          <MenuItem key={p.id} icon={<span className="text-[14px] leading-none">{p.icon || '📄'}</span>} onClick={() => (onClose(), go(`/pages/${p.id}`))}>
            <span translate="no">{p.title}</span>
          </MenuItem>
        ))
      ) : (
        <p className="px-2.5 pb-2.5 text-[12.5px] text-fg-3">No page links here yet. Type @ in another page to link to it.</p>
      )}
    </Popover>
  );
}
