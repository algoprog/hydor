// Chrome extensions in your own browsing: their buttons beside the address bar, and the panel that lists them, turns
// them on and off and adds more (from the Chrome Web Store, a folder, or the other browsers on this computer).
import { useEffect, useState } from 'react';
import { FolderOpen, Puzzle, Settings2, Trash2 } from 'lucide-react';
import type { BrowserExtension, ExtensionSource } from '@shared/browser';
import { del, enc, patch, post } from '../../lib/api';
import { mu } from '../../lib/machine';
import { toast, toastError } from '../../lib/store';
import { Button, cx, inputCls, Switch, Throbber } from '../../components/ui';
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
};
const partName = (p: string) => PARTS[p] ?? (/^(system|enterprise)\./.test(p) ? 'computer and organisation settings' : p);

/** The extensions' buttons in the top bar: those on, with a button of their own; a click opens the popup under it. */
export function ExtensionButtons() {
  const state = useExtensions((s) => s.state);
  const badges = useBadges((s) => s.byId);
  useEffect(() => {
    listenBadges();
    void loadExtensions();
  }, []);
  if (!state?.runs) return null;
  const list = state.extensions.filter((e) => e.enabled && e.action);
  if (!list.length) return null;
  const click = async (e: BrowserExtension, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const shown = await desktopBrowser()?.popup(e.id, { x: r.left, y: r.top, w: r.width, h: r.height }).catch(() => false);
    if (!shown && e.action?.popup) void newTab(extensionPage(e.id, e.action.popup));
  };
  return (
    <>
      {list.map((e) => {
        const b = badges[e.id];
        return (
          <button
            key={e.id}
            onClick={(ev) => void click(e, ev.currentTarget)}
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
    </>
  );
}

function ExtensionRow({ e, runs }: { e: BrowserExtension; runs: boolean }) {
  const set = async (p: { enabled?: boolean; agents?: boolean }) => {
    useExtensions.setState((s) => (s.state ? { state: { ...s.state, extensions: s.state.extensions.map((x) => (x.id === e.id ? { ...x, ...p } : x)) } } : s));
    try {
      await patch(`/api/browser/extensions/${enc(e.id)}`, p);
    } catch (err) {
      toastError(err);
    }
    await loadExtensions();
  };
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
