// Chrome extensions in your own browsing: their buttons beside the address bar, and the panel that lists them, turns
// them on and off and adds more (from the Chrome Web Store, a folder, or the other browsers on this computer).
import { useEffect, useRef, useState } from 'react';
import { FolderOpen, MoreVertical, Pin, PinOff, Power, Puzzle, Settings2, Trash2 } from 'lucide-react';
import type { BrowserExtension, ExtensionSource } from '@shared/browser';
import { del, enc, patch, post } from '../../lib/api';
import { mu } from '../../lib/machine';
import { toast, toastError } from '../../lib/store';
import { Button, cx, IconButton, inputCls, MenuItem, MenuLabel, MenuSep, Popover, Switch, Throbber, useConfirm } from '../../components/ui';
import { addFromStore, chooseFolder, desktopBrowser, extensionPage, listenBadges, loadExtensions, newTab, useBadges, useExtensions } from './browsing';
import { Note, Panel } from './Panel';

/** An extension's icon, or a puzzle piece when it has none. */
function Icon({ e, size }: { e: Pick<BrowserExtension, 'id' | 'icon'>; size: number }) {
  const [bad, setBad] = useState(false);
  if (!e.icon || bad) return <Puzzle size={size - 4} className="text-fg-3" />;
  return <img src={mu(`/api/browser/extensions/${enc(e.id)}/icon`)} alt="" width={size} height={size} className="rounded-[4px] object-contain" onError={() => setBad(true)} />;
}

/** The permissions an extension asks for that this browser lacks, in plain words. */
const PARTS: Record<string, string> = {
  declarativeNetRequest: 'blocking or changing requests',
  declarativeNetRequestWithHostAccess: 'blocking or changing requests',
  declarativeNetRequestFeedback: 'blocking or changing requests',
  offscreen: 'background pages',
  sidePanel: 'the side panel',
  identity: 'signing in with an account',
  cookies: 'cookies',
  history: 'history',
  bookmarks: 'bookmarks',
  downloads: 'downloads',
  tts: 'speech',
  ttsEngine: 'speech',
  proxy: 'proxy settings',
  debugger: 'debugging pages',
  nativeMessaging: 'programs on your computer',
  tabGroups: 'tab groups',
  topSites: 'top sites',
  sessions: 'recently closed tabs',
  readingList: 'the reading list',
  search: 'searching from the extension',
  fontSettings: 'font settings',
  privacy: 'privacy settings',
  contentSettings: 'site settings',
  pageCapture: 'saving pages',
  desktopCapture: 'screen capture',
  tabCapture: 'tab capture',
  gcm: 'push messages',
  webNavigation: 'watching page loads',
  declarativeContent: 'page actions',
  printing: 'printing',
  browsingData: 'clearing browsing data',
};
const partName = (p: string) => PARTS[p] ?? (/^(system|enterprise)\./.test(p) ? 'computer and organisation settings' : p);

/** Changes an extension's switches at once in the page, then on the server, and reads the list again (a failure shows and the list is put right). */
async function patchExtension(id: string, p: { enabled?: boolean; agents?: boolean; pinned?: boolean }) {
  useExtensions.setState((s) => (s.state ? { state: { ...s.state, extensions: s.state.extensions.map((x) => (x.id === id ? { ...x, ...p } : x)) } } : s));
  try {
    await patch(`/api/browser/extensions/${enc(id)}`, p);
  } catch (err) {
    toastError(err);
  }
  await loadExtensions();
}

/** An extension's icon with the badge it has set (a count, say), as on the toolbar. */
function IconWithBadge({ e, size, badge }: { e: Pick<BrowserExtension, 'id' | 'icon'>; size: number; badge?: { text?: string; color?: string } }) {
  return (
    <span className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <Icon e={e} size={size} />
      {badge?.text && (
        <span className="pointer-events-none absolute -right-1 -bottom-1 max-w-8 truncate rounded px-[3px] text-[9px] leading-[12px] font-semibold text-white" style={{ background: badge.color || 'var(--accent)' }}>
          {badge.text}
        </span>
      )}
    </span>
  );
}

/**
 * The extensions' buttons in the top bar: those that are on, have a button and are pinned (a click opens the popup under
 * it, a right-click has its menu), then Extensions, a puzzle piece whose menu has every one that is on to use, pin or
 * unpin. `onManage` opens the Extensions panel.
 */
export function ExtensionButtons({ onManage }: { onManage: () => void }) {
  const state = useExtensions((s) => s.state);
  const badges = useBadges((s) => s.byId);
  const [ask, confirmNode] = useConfirm();
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState<string | null>(null);
  const [ctx, setCtx] = useState<string | null>(null);
  const puzzle = useRef<HTMLButtonElement>(null);
  const moreAnchor = useRef<HTMLElement | null>(null);
  const ctxAnchor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    listenBadges();
    void loadExtensions();
  }, []);
  if (!state?.runs) return null;
  const on = state.extensions.filter((e) => e.enabled);
  if (!on.length) return null;
  const pinned = on.filter((e) => e.action && e.pinned);
  const sorted = [...on].sort((a, b) => a.name.localeCompare(b.name));
  const find = (id: string | null) => on.find((e) => e.id === id);

  /** What a click on an extension's button does: its popup opens at `at`, in a tab where the app cannot show it. */
  const use = async (e: BrowserExtension, at: DOMRect) => {
    if (!e.action) return;
    const shown = await desktopBrowser()?.popup(e.id, { x: at.left, y: at.top, w: at.width, h: at.height }).catch(() => false);
    if (shown) return;
    if (e.action.popup) void newTab(extensionPage(e.id, e.action.popup));
    else toastError(new Error(`${e.name} isn’t running in this browser`));
  };
  const options = (e: BrowserExtension) => void newTab(extensionPage(e.id, e.options!));
  const remove = async (e: BrowserExtension) => {
    const ok = await ask({ title: `Remove ${e.name}?`, body: 'Its files are deleted from Hydor. A folder you added yourself stays where it is.', confirm: 'Remove', danger: true });
    if (!ok) return;
    try {
      await del(`/api/browser/extensions/${enc(e.id)}`);
    } catch (err) {
      toastError(err);
    }
    await loadExtensions();
  };

  const moreFor = find(more);
  const ctxFor = find(ctx);
  return (
    <>
      {pinned.map((e) => {
        const b = badges[e.id];
        return (
          <button
            key={e.id}
            onClick={(ev) => void use(e, ev.currentTarget.getBoundingClientRect())}
            onContextMenu={(ev) => {
              ev.preventDefault();
              ctxAnchor.current = ev.currentTarget;
              setMenu(false);
              setCtx(e.id);
            }}
            title={b?.title || e.action?.title || e.name}
            aria-label={e.action?.title || e.name}
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-bg-2"
          >
            <Icon e={e} size={20} />
            {b?.text && (
              <span className="pointer-events-none absolute right-0 bottom-0 max-w-8 truncate rounded px-[3px] text-[9px] leading-[12px] font-semibold text-white" style={{ background: b.color || 'var(--accent)' }}>
                {b.text}
              </span>
            )}
          </button>
        );
      })}
      <button
        ref={puzzle}
        onClick={() => setMenu((o) => !o)}
        title="Extensions"
        aria-label="Extensions"
        aria-haspopup="menu"
        aria-expanded={menu}
        className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-bg-2 hover:text-fg', menu && 'bg-bg-2 text-fg')}
      >
        <Puzzle size={18} />
      </button>

      <Popover anchor={puzzle} open={menu} onClose={() => setMenu(false)} align="end" width={320} title="Extensions">
        <MenuLabel>Extensions</MenuLabel>
        {sorted.map((e) => {
          const b = badges[e.id];
          const name = (
            <>
              <IconWithBadge e={e} size={20} badge={b} />
              <span translate="no" className="min-w-0 flex-1 truncate">
                {e.name}
              </span>
            </>
          );
          const rowCls = 'flex h-8.5 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px]';
          return (
            <div key={e.id} className="flex items-center gap-0.5">
              {e.action ? (
                <button
                  className={cx(rowCls, 'hover:bg-bg-2')}
                  title={b?.title || e.action.title || undefined}
                  onClick={() => {
                    const at = puzzle.current!.getBoundingClientRect();
                    setMenu(false);
                    void use(e, at);
                  }}
                >
                  {name}
                </button>
              ) : e.options ? (
                <button
                  className={cx(rowCls, 'hover:bg-bg-2')}
                  onClick={() => {
                    setMenu(false);
                    options(e);
                  }}
                >
                  {name}
                </button>
              ) : (
                <div className={cx(rowCls, 'text-fg-2')}>{name}</div>
              )}
              {e.action && (
                <IconButton
                  size="sm"
                  label={e.pinned ? 'Unpin from toolbar' : 'Pin to toolbar'}
                  aria-pressed={e.pinned}
                  onClick={() => void patchExtension(e.id, { pinned: !e.pinned })}
                >
                  <Pin size={15} className={e.pinned ? 'text-accent' : 'text-fg-3'} fill={e.pinned ? 'currentColor' : 'none'} />
                </IconButton>
              )}
              <IconButton
                size="sm"
                label={`More for ${e.name}`}
                aria-haspopup="menu"
                onClick={(ev) => {
                  moreAnchor.current = ev.currentTarget;
                  setMore(e.id);
                }}
              >
                <MoreVertical size={15} />
              </IconButton>
            </div>
          );
        })}
        <MenuSep />
        <MenuItem
          icon={<Settings2 size={14} />}
          onClick={() => {
            setMenu(false);
            onManage();
          }}
        >
          Manage extensions
        </MenuItem>
      </Popover>

      <Popover anchor={moreAnchor} open={!!moreFor} onClose={() => setMore(null)} align="end" width={200}>
        {moreFor && (
          <>
            {moreFor.options && (
              <MenuItem
                icon={<Settings2 size={14} />}
                onClick={() => {
                  setMore(null);
                  setMenu(false);
                  options(moreFor);
                }}
              >
                Options
              </MenuItem>
            )}
            <MenuItem
              icon={<Power size={14} />}
              onClick={() => {
                setMore(null);
                void patchExtension(moreFor.id, { enabled: false });
              }}
            >
              Turn off
            </MenuItem>
            <MenuItem
              icon={<Trash2 size={14} />}
              danger
              onClick={() => {
                setMore(null);
                void remove(moreFor);
              }}
            >
              Remove
            </MenuItem>
          </>
        )}
      </Popover>

      <Popover anchor={ctxAnchor} open={!!ctxFor} onClose={() => setCtx(null)} width={220}>
        {ctxFor && (
          <>
            <MenuLabel>
              <span translate="no" className="block truncate">
                {ctxFor.name}
              </span>
            </MenuLabel>
            {ctxFor.options && (
              <MenuItem
                icon={<Settings2 size={14} />}
                onClick={() => {
                  setCtx(null);
                  options(ctxFor);
                }}
              >
                Options
              </MenuItem>
            )}
            <MenuItem
              icon={<PinOff size={14} />}
              onClick={() => {
                setCtx(null);
                void patchExtension(ctxFor.id, { pinned: false });
              }}
            >
              Unpin
            </MenuItem>
            <MenuItem
              icon={<Trash2 size={14} />}
              danger
              onClick={() => {
                setCtx(null);
                void remove(ctxFor);
              }}
            >
              Remove
            </MenuItem>
            <MenuSep />
            <MenuItem
              icon={<Puzzle size={14} />}
              onClick={() => {
                setCtx(null);
                onManage();
              }}
            >
              Manage extensions
            </MenuItem>
          </>
        )}
      </Popover>
      {confirmNode}
    </>
  );
}

function ExtensionRow({ e, runs }: { e: BrowserExtension; runs: boolean }) {
  const set = (p: { enabled?: boolean; agents?: boolean; pinned?: boolean }) => patchExtension(e.id, p);
  const remove = async () => {
    try {
      await del(`/api/browser/extensions/${enc(e.id)}`);
    } catch (err) {
      toastError(err);
    }
    await loadExtensions();
  };
  return (
    <div className={cx('border-b border-line px-4 py-3', !e.enabled && 'opacity-80')}>
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-2">
          <Icon e={e} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <div translate="no" className="truncate text-[13.5px] font-medium">
            {e.name}
          </div>
          <div translate="no" className="text-[12px] text-fg-3">
            {e.version}
          </div>
        </div>
        <Switch on={e.enabled} onChange={(enabled) => void set({ enabled })} label={e.enabled ? `Turn off ${e.name}` : `Turn on ${e.name}`} />
      </div>
      {e.description && (
        <div translate="no" className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3">
          {e.description}
        </div>
      )}
      {!!e.unsupported?.length && <div className="mt-1.5 text-[12px] leading-snug text-fg-3">Some parts may not work here: {[...new Set(e.unsupported.map(partName))].join(', ')}</div>}
      <label className="mt-2.5 flex items-center gap-2.5 text-[12.5px] text-fg-2">
        <Switch on={e.agents} onChange={(agents) => void set({ agents })} label="Also in agents’ browsers" className="scale-90" />
        Also in agents’ browsers
      </label>
      {e.enabled && e.action && (
        <label className="mt-2 flex items-center gap-2.5 text-[12.5px] text-fg-2">
          <Switch on={e.pinned} onChange={(pinned) => void set({ pinned })} label="Pin to toolbar" className="scale-90" />
          Pin to toolbar
        </label>
      )}
      <div className="mt-2.5 flex gap-2">
        {e.options && runs && (
          <Button size="sm" icon={<Settings2 size={14} />} onClick={() => void newTab(extensionPage(e.id, e.options!))}>
            Options
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => void remove()}>
          Remove
        </Button>
      </div>
    </div>
  );
}

export function ExtensionsPanel({ onClose }: { onClose: () => void }) {
  const state = useExtensions((s) => s.state);
  useEffect(() => void loadExtensions(), []);
  return (
    <Panel title="Extensions" onClose={onClose}>
      {!state ? (
        <div className="flex justify-center py-10">
          <Throbber size={24} />
        </div>
      ) : (
        <>
          {!state.runs && <Note>Extensions run in the desktop app’s own browser. They are kept here and run there.</Note>}
          {state.extensions.map((e) => (
            <ExtensionRow key={e.id} e={e} runs={state.runs} />
          ))}
          {!state.extensions.length && <Note>No extensions yet. Add one below.</Note>}
          <AddExtension sources={state.sources} />
        </>
      )}
    </Panel>
  );
}

function AddExtension({ sources }: { sources: ExtensionSource[] }) {
  const [store, setStore] = useState('');
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pick = chooseFolder();
  const run = async (what: string, fn: () => Promise<boolean | void>) => {
    setBusy(what);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  const addFolder = (path: string) =>
    run('folder', async () => {
      try {
        await post('/api/browser/extensions/folder', { path });
        await loadExtensions();
        setFolder('');
        toast('Extension added', 'info');
      } catch (e) {
        toastError(e);
      }
    });
  const left = sources.filter((s) => !s.have);
  const bring = () =>
    run('import', async () => {
      try {
        await post('/api/browser/extensions/import', { ids: [...picked] });
        setPicked(new Set());
        await loadExtensions();
        toast('Extensions brought in', 'info');
      } catch (e) {
        toastError(e);
      }
    });

  return (
    <div className="pb-4">
      <div className="px-4 pt-4 pb-1.5 text-[11.5px] font-medium text-fg-3">From the Chrome Web Store</div>
      <div className="flex gap-2 px-4">
        <input
          value={store}
          onChange={(e) => setStore(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && store.trim() && void run('store', async () => void ((await addFromStore(store)) && setStore('')))}
          placeholder="Paste a link or an id"
          aria-label="Extension link or id"
          className={cx(inputCls, 'h-8.5 min-w-0 flex-1 text-[13px]')}
        />
        <Button size="sm" variant="primary" disabled={!store.trim() || busy !== null} onClick={() => void run('store', async () => void ((await addFromStore(store)) && setStore('')))}>
          {busy === 'store' ? 'Adding…' : 'Add'}
        </Button>
      </div>

      <div className="px-4 pt-4 pb-1.5 text-[11.5px] font-medium text-fg-3">From a folder</div>
      {pick ? (
        <div className="px-4">
          <Button
            size="sm"
            icon={<FolderOpen size={14} />}
            disabled={busy !== null}
            onClick={async () => {
              const dir = await pick('');
              if (dir) void addFolder(dir);
            }}
          >
            Choose a folder
          </Button>
        </div>
      ) : (
        <div className="flex gap-2 px-4">
          <input value={folder} onChange={(e) => setFolder(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && folder.trim() && void addFolder(folder.trim())} placeholder="Path of the folder" aria-label="Path of the folder" className={cx(inputCls, 'h-8.5 min-w-0 flex-1 font-mono text-[12.5px]')} />
          <Button size="sm" disabled={!folder.trim() || busy !== null} onClick={() => void addFolder(folder.trim())}>
            Add
          </Button>
        </div>
      )}

      {sources.length > 0 && (
        <>
          <div className="px-4 pt-4 pb-1.5 text-[11.5px] font-medium text-fg-3">From your other browsers</div>
          {sources.map((s) => (
            <label key={s.id} className={cx('flex items-center gap-2.5 px-4 py-1.5 text-[13px]', s.have ? 'text-fg-3' : 'cursor-pointer hover:bg-bg-2')}>
              <input
                type="checkbox"
                disabled={s.have}
                checked={s.have || picked.has(s.id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? new Set([...p, s.id]) : new Set([...p].filter((x) => x !== s.id))))}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                <span translate="no" className="block truncate">
                  {s.name} <span className="text-fg-3">{s.version}</span>
                </span>
                <span className="block truncate text-[12px] text-fg-3">
                  <span translate="no">
                    {s.browser}
                    {s.profile ? ` · ${s.profile}` : ''}
                  </span>
                  {s.have ? ' · Already here' : !s.enabled ? ' · Off there' : ''}
                </span>
              </span>
            </label>
          ))}
          <div className="px-4 pt-2">
            <Button size="sm" variant="primary" disabled={!picked.size || !left.length || busy !== null} onClick={() => void bring()}>
              {busy === 'import' ? 'Bringing in…' : 'Bring in'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
