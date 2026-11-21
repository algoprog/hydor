// The Read later panel: the pages you set aside to read (Add this page at its top sets the page you are on aside, as a
// page's or a link's right-click menu does), newest first, with a search box. Each opens in a tab of your browser and can
// be marked as read or removed; the rows are the ones pages/BrowserLists.tsx draws. Private to you: agents never see the list.
import { useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import type { BrowserTab } from '@shared/browser';
import { Button, cx, inputCls } from '../../components/ui';
import { BrowserList } from '../pages/BrowserLists';
import { addLater, useLater } from './browsing';
import { Panel } from './Panel';

export function LaterPanel({ tab, onClose }: { tab?: BrowserTab; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  // The page you are on, when it can be set aside (only http and https pages can), and whether it waits on the list already.
  const page = tab && /^https?:/i.test(tab.url) ? tab : undefined;
  const waiting = useLater((s) => !!page && s.items.some((n) => n.url === page.url && n.readAt === undefined));
  const add = async () => {
    if (!page) return;
    setAdding(true);
    await addLater(page.url, page.title || page.url);
    setAdding(false);
  };
  return (
    <Panel
      title="Read later"
      onClose={onClose}
      actions={
        <Button size="sm" variant="ghost" icon={waiting ? <Check size={14} /> : <Plus size={14} />} disabled={!page || waiting || adding} onClick={() => void add()}>
          {waiting ? 'On your list' : 'Add this page'}
        </Button>
      }
    >
      <div className="relative border-b border-line p-3">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-6 -translate-y-1/2 text-fg-3" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your Read later list" aria-label="Search your Read later list" translate="no" className={cx(inputCls, 'h-9 pl-9 text-[13.5px]')} />
      </div>
      <div className="px-3 py-3">
        <BrowserList kind="later" q={q.trim()} />
      </div>
    </Panel>
  );
}
