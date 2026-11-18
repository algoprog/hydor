// What the tabs of your own browser share: their site icons, the speaker of one that plays sound, and the dropdown that
// lists them on a phone (on a computer the tab column does, TabColumn).
import { useRef, useState } from 'react';
import { ChevronDown, Globe, Plus, VenetianMask, Volume2, VolumeX, X } from 'lucide-react';
import type { BrowserTab, BrowserView } from '@shared/browser';
import { cx, IconButton, Popover, Throbber } from '../../components/ui';
import { closePrivateTabs, closeTab, desktopBrowser, newTab, switchTab, tabName, useTabState } from './browsing';

/** The site a tab is on (as the app's site icon route takes it), or '' for a page with no host to ask about. */
export function hostOfTab(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : '';
  } catch {
    return '';
  }
}

/**
 * A page's site icon (from the app's own icon route: the page's own icon address is not one the app's pages may load),
 * or a globe while it has none (or it did not load).
 */
export function Favicon({ tab, size = 14 }: { tab: BrowserTab; size?: number }) {
  const icon = tab.loading ? <Throbber size={size} className="shrink-0" /> : <SiteIcon url={tab.url} size={size} />;
  if (!tab.private) return icon;
  // A private tab: a small purple mask at the icon's corner.
  return (
    <span className="relative flex shrink-0" title="Private tab">
      {icon}
      <span aria-hidden className="absolute -right-1 -bottom-1 flex h-[11px] w-[11px] items-center justify-center rounded-full bg-sidebar text-codex ring-1 ring-sidebar">
        <VenetianMask size={9} strokeWidth={2.5} />
      </span>
    </span>
  );
}

/** The icon of the site an address is on (a globe when it has none). */
export function SiteIcon({ url, size = 14 }: { url: string; size?: number }) {
  const [bad, setBad] = useState<string>();
  const host = hostOfTab(url);
  if (!host || bad === host) return <Globe size={size} className="shrink-0 text-fg-3" />;
  return <img src={`/api/site-icon/${encodeURIComponent(host)}`} alt="" width={size} height={size} className="shrink-0 rounded-[3px]" onError={() => setBad(host)} />;
}

/** A speaker on a tab that plays sound (or that you muted): a click mutes it or lets it be heard. */
export function Speaker({ tab }: { tab: BrowserTab }) {
  const st = useTabState((s) => s.byTab[tab.id]);
  if (!desktopBrowser() || (!st?.audible && !st?.muted)) return null;
  const muted = !!st.muted;
  const label = muted ? 'Unmute this tab' : 'Mute this tab';
  return (
    <button
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        useTabState.setState((s) => ({ byTab: { ...s.byTab, [tab.id]: { ...s.byTab[tab.id], muted: !muted } } }));
        void desktopBrowser()?.mute(tab.id, !muted);
      }}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-fg-3 hover:bg-bg-3 hover:text-fg"
    >
      {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
    </button>
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
            <div key={t.id} className={cx('flex items-center gap-1 rounded-lg pr-1 pl-2.5', t.private && !t.active && 'bg-codex/5', t.active && (t.private ? 'bg-codex/10' : 'bg-bg-2'))}>
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
          <button
            onClick={() => {
              void newTab(undefined, { private: true });
              setOpen(false);
            }}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] hover:bg-bg-2"
          >
            <VenetianMask size={14} className="text-codex" />
            New private tab
          </button>
          {view.tabs.some((t) => t.private) && (
            <button
              onClick={() => {
                void closePrivateTabs();
                setOpen(false);
              }}
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] hover:bg-bg-2"
            >
              <X size={14} className="text-codex" />
              Close private tabs
            </button>
          )}
        </div>
      </Popover>
    </>
  );
}
