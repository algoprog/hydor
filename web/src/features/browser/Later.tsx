// The Read later panel: the pages you set aside to read (from the Browser's menu, or a page's or a link's right-click
// menu), newest first, with a search box. Each opens in a tab of your browser and can be marked as read or removed;
// the rows are the ones pages/BrowserLists.tsx draws. Private to you: agents never see the list.
import { useState } from 'react';
import { Search } from 'lucide-react';
import { cx, inputCls } from '../../components/ui';
import { BrowserList } from '../pages/BrowserLists';
import { Panel } from './Panel';

export function LaterPanel({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  return (
    <Panel title="Read later" onClose={onClose}>
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
