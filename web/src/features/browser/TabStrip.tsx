// The tabs of your own browser: a strip above the address bar (a dropdown on a phone).
import { useRef, useState } from 'react';
import { ChevronDown, Globe, Plus, X } from 'lucide-react';
import type { BrowserTab, BrowserView } from '@shared/browser';
import { cx, IconButton, Popover, Throbber } from '../../components/ui';
import { closeTab, newTab, switchTab, tabName } from './browsing';

/** A page's icon, or a globe while it has none (or it did not load). */
export function Favicon({ tab, size = 14 }: { tab: BrowserTab; size?: number }) {
  const [bad, setBad] = useState<string>();
  if (tab.loading) return <Throbber size={size} className="shrink-0" />;
  if (!tab.favicon || bad === tab.favicon) return <Globe size={size} className="shrink-0 text-fg-3" />;
  return <img src={tab.favicon} alt="" width={size} height={size} className="shrink-0 rounded-[3px]" onError={() => setBad(tab.favicon)} />;
}

export function TabStrip({ view }: { view: BrowserView }) {
  return (
    <div role="tablist" className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto bg-bg-1 px-2 pt-1 [&::-webkit-scrollbar]:hidden">
      {view.tabs.map((t) => (
        <div
          key={t.id}
          role="tab"
          aria-selected={t.active}
          tabIndex={0}
          title={t.title || t.url}
          onClick={() => !t.active && void switchTab(t.id)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), void switchTab(t.id))}
          // A middle click closes it, as in other browsers.
          onMouseDown={(e) => e.button === 1 && e.preventDefault()}
          onAuxClick={(e) => e.button === 1 && (e.preventDefault(), void closeTab(t.id))}
          className={cx(
            'group flex h-8 max-w-[220px] min-w-[44px] flex-1 basis-[180px] cursor-default items-center gap-2 rounded-t-[10px] pr-1 pl-2.5 text-[12.5px] transition-colors select-none',
            t.active ? 'bg-bg text-fg' : 'text-fg-2 hover:bg-bg-2 hover:text-fg',
          )}
        >
          <Favicon tab={t} />
          <span translate="no" className="min-w-0 flex-1 truncate">
            {tabName(t)}
          </span>
          <button
            aria-label="Close tab"
            title="Close tab"
            onClick={(e) => (e.stopPropagation(), void closeTab(t.id))}
            className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-fg-3 hover:bg-bg-3 hover:text-fg', !t.active && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button aria-label="New tab" title="New tab" onClick={() => void newTab()} className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-bg-2 hover:text-fg">
        <Plus size={16} />
      </button>
    </div>
  );
}

/** On a phone: the open tab's name, and a list of the tabs under it. */
export function TabMenu({ view }: { view: BrowserView }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={ref}
        aria-label="Tabs"
        title="Tabs"
        onClick={() => setOpen((o) => !o)}
        className={cx('flex h-8.5 shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] text-fg-2 hover:bg-bg-2', open && 'bg-bg-2')}
      >
        <span className="tnum flex h-5 min-w-5 items-center justify-center rounded-md border border-fg-3 px-1 text-[11px] font-medium">{view.tabs.length}</span>
        <ChevronDown size={13} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={300} title="Tabs">
        <div className="max-h-[60vh] overflow-y-auto">
          {view.tabs.map((t) => (
            <div key={t.id} className={cx('flex items-center gap-1 rounded-lg pr-1 pl-2.5', t.active && 'bg-bg-2')}>
              <button
                onClick={() => {
                  void switchTab(t.id);
                  setOpen(false);
                }}
                className="flex h-9 min-w-0 flex-1 items-center gap-2.5 text-left text-[13.5px]"
              >
                <Favicon tab={t} />
                <span translate="no" className="min-w-0 flex-1 truncate">
                  {tabName(t)}
                </span>
              </button>
              <IconButton label="Close tab" size="sm" onClick={() => void closeTab(t.id)}>
                <X size={14} />
              </IconButton>
            </div>
          ))}
          <button
            onClick={() => {
              void newTab();
              setOpen(false);
            }}
            className="mt-0.5 flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] hover:bg-bg-2"
          >
            <Plus size={14} className="text-fg-3" />
            New tab
          </button>
        </div>
      </Popover>
    </>
  );
}
