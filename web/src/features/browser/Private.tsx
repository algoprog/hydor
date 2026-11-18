// What marks a private tab in the address bar: a purple "Private" chip at the start of the box, which opens what a
// private tab is and keeps (and a button that closes them all).
import { useRef, useState } from 'react';
import { VenetianMask } from 'lucide-react';
import { Button, cx, Popover } from '../../components/ui';
import { closePrivateTabs } from './browsing';

export function PrivateChip({ compact }: { compact?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={ref}
        aria-label="Private tab"
        title="Private tab"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx('ml-1 flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-codex/12 px-2 text-[12px] font-medium text-codex hover:bg-codex/20', open && 'bg-codex/20')}
      >
        <VenetianMask size={14} />
        {!compact && <span>Private</span>}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={330} title="Private tab">
        <div className="space-y-3 p-2.5">
          <div className="flex items-center gap-2 text-codex">
            <VenetianMask size={16} className="shrink-0" />
            <div className="text-[14px] font-medium">Private tab</div>
          </div>
          <p className="text-[12.5px] leading-snug text-fg-3">
            Pages you visit in private tabs aren’t kept in your history and don’t come back when the browser opens again. Their sign-ins, cookies and site data are kept apart from your other tabs and forgotten when you close the last private tab. Files you download and
            bookmarks you make are kept. Extensions don’t run in them, and agents never get them.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={() => {
              setOpen(false);
              void closePrivateTabs();
            }}
          >
            Close private tabs
          </Button>
        </div>
      </Popover>
    </>
  );
}
