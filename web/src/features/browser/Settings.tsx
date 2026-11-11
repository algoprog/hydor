// Settings → Browser: on or off, which Chromium (with a download when there is none), a window or not,
// keeping pages off this machine's network, screenshots for models that see images, site lists, and
// named profiles the user logs into by taking over.
import { useEffect, useRef, useState } from 'react';
import { Download, Globe, LogIn, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import type { BrowserSettings, BrowserSettingsState } from '@shared/browser';
import { api, del, enc, patch, post, put } from '../../lib/api';
import { bytes } from '../../lib/format';
import { live as socket } from '../../lib/ws';
import { toastError } from '../../lib/store';
import { Button, Dialog, inputCls, MenuItem, OptionRow, Picker, Switch, Throbber, useConfirm, useIsMobile } from '../../components/ui';
import { EmptyRow, Group, MoreMenu, Notice, Row, SectionActions, Stack } from '../settings/kit';
import { LiveView, type LiveViewApi } from './LiveView';
import { browserCall, listenBrowser, loadBrowser, useBrowser } from './store';

const lines = (v: string) =>
  v
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export function BrowserSettingsBody() {
  const [st, setSt] = useState<BrowserSettingsState | null>(null);
  const download = useBrowser((s) => s.download);
  const [allow, setAllow] = useState('');
  const [block, setBlock] = useState('');
  const [login, setLogin] = useState<{ id: string; name: string } | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const load = () =>
    api<BrowserSettingsState>('/api/browser/settings')
      .then((r) => {
        setSt(r);
        setAllow(r.settings.allow.join('\n'));
        setBlock(r.settings.block.join('\n'));
      })
      .catch(toastError);
  useEffect(() => {
    listenBrowser();
    void load();
  }, []);
  // A finished download shows up among the browsers.
  useEffect(() => {
    if (download?.state === 'done' || download?.state === 'failed') void load();
  }, [download?.state]);
  const s = st?.settings;
  const set = async (p: Partial<BrowserSettings>) => {
    try {
      setSt(await put<BrowserSettingsState>('/api/browser/settings', p));
    } catch (e) {
      toastError(e);
    }
  };
  const dl = download?.state === 'running' ? download : st?.download.state === 'running' ? st.download : null;
  const getChrome = async () => {
    try {
      setSt(await post<BrowserSettingsState>('/api/browser/download'));
    } catch (e) {
      toastError(e);
    }
  };
  const failed = st && (download ?? st.download).state === 'failed' ? (download ?? st.download).error : null;
  const sitesChanged = !!s && (allow !== s.allow.join('\n') || block !== s.block.join('\n'));
  const loading = (
    <div className="flex justify-center px-4 py-6">
      <Throbber className="text-fg-3" />
    </div>
  );
  const textarea = 'min-h-[88px] w-full resize-y rounded-[10px] border border-line-2 bg-bg-1 px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent/60';

  return (
    <Stack>
      <SectionActions>
        <span className="flex items-center gap-2.5">
          <span className="text-[13px] text-fg-2">A browser for agents</span>
          {st && s ? <Switch on={s.enabled} label="A browser for agents" disabled={!st.chrome} onChange={(v) => set({ enabled: v })} /> : <Throbber className="text-fg-3" />}
        </span>
      </SectionActions>

      {st?.noSandbox && (
        <Notice tone="warn">
          Chrome’s own sandbox is off: this system does not allow it. Pages still cannot reach this machine’s network, but keep profiles to the sites you need.
        </Notice>
      )}
      {failed && <Notice tone="err">The download failed: {failed}</Notice>}

      <Group title="Chromium">
        {!st ? (
          loading
        ) : (
          <Row
            icon={<Globe size={16} />}
            label={st.chrome ? (st.chrome.version ? `Version ${st.chrome.version}` : st.chrome.label) : 'None found on this machine'}
            hint={st.chrome ? st.chrome.label : 'Download Chrome for Testing (about 170 MB) into the app’s data folder'}
            info={st.chrome && <span translate="no" className="font-mono text-[12px] break-all">{st.chrome.path}</span>}
            control={
              <>
                {st.chromes.length > 1 && (
                  <Picker value={st.chrome?.label ?? 'Pick one'} title="Which Chromium" width={340}>
                    {(close) => (
                      <>
                        <OptionRow label="The best one found" hint="The system’s, else one downloaded here, else Playwright’s" selected={!s!.chrome} onClick={() => (close(), set({ chrome: '' }))} />
                        {st.chromes.map((c) => (
                          <OptionRow key={c.path} label={c.label} hint={[c.version, c.path].filter(Boolean).join(' · ')} selected={s!.chrome === c.path} onClick={() => (close(), set({ chrome: c.path }))} />
                        ))}
                      </>
                    )}
                  </Picker>
                )}
                {!st.chromes.some((c) => c.source === 'downloaded') && (
                  <Button size="sm" variant={st.chrome ? 'secondary' : 'primary'} icon={<Download size={14} />} disabled={!!dl} onClick={getChrome}>
                    {dl ? 'Downloading…' : 'Download Chrome'}
                  </Button>
                )}
              </>
            }
          >
            {dl && (
              <div>
                <div className="mb-1 flex justify-between text-[12px] text-fg-3">
                  <span>Chrome for Testing {dl.version ?? ''}</span>
                  <span className="tnum">
                    {bytes(dl.received ?? 0)}
                    {dl.total ? ` of ${bytes(dl.total)}` : ''}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg-3">
                  <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: dl.total ? `${Math.round(((dl.received ?? 0) / dl.total) * 100)}%` : '30%' }} />
                </div>
              </div>
            )}
          </Row>
        )}
      </Group>

      <Group>
        <Row
          label="Show a window"
          hint={st?.chrome?.shell ? 'Playwright’s headless shell cannot show one' : 'A window on this machine’s screen too'}
          info="Off: the browser runs out of sight and you watch it here. On: a window on this machine’s screen too."
          control={st && s ? <Switch on={!s.headless && !st.chrome?.shell} label="Show a window" disabled={!!st.chrome?.shell} onChange={(v) => set({ headless: !v })} /> : <Throbber className="text-fg-3" />}
        />
        <Row
          label="Keep pages off this machine and its network"
          hint="Routers, printers and this app stay out of reach"
          info="Pages cannot reach localhost or private addresses (routers, printers, this app), whether by WebSocket or by a name that changes its address: every connection goes through a checkpoint of the app’s. A session can still open its own dev server once you allow it."
          control={s ? <Switch on={s.blockPrivate} label="Keep pages off this machine and its network" onChange={(v) => set({ blockPrivate: v })} /> : <Throbber className="text-fg-3" />}
        />
        <Row
          label="Screenshots for models that see images"
          hint="The page with numbered boxes drawn on"
          info="Agents can look at the page with numbered boxes drawn on. Text-only models always get the page as text."
          control={s ? <Switch on={s.screenshots} label="Screenshots for models that see images" onChange={(v) => set({ screenshots: v })} /> : <Throbber className="text-fg-3" />}
        />
      </Group>

      <Group
        title="Sites"
        hint="For every session; each can add its own in its browser’s menu"
        info="One site per line, like example.com (its subdomains count too)."
        actions={
          sitesChanged && (
            <Button size="sm" variant="primary" onClick={() => set({ allow: lines(allow), block: lines(block) })}>
              Save sites
            </Button>
          )
        }
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">Only these sites</span>
            <textarea value={allow} onChange={(e) => setAllow(e.target.value)} disabled={!st} placeholder="Any site when empty" className={textarea} />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">Never these sites</span>
            <textarea value={block} onChange={(e) => setBlock(e.target.value)} disabled={!st} className={textarea} />
          </label>
        </div>
      </Group>

      <Profiles st={st} onChange={setSt} onLogin={setLogin} confirm={confirm} />
      {confirmNode}
      {login && <ProfileLogin profile={login} onClose={() => setLogin(null)} />}
    </Stack>
  );
}

function Profiles({ st, onChange, onLogin, confirm }: { st: BrowserSettingsState | null; onChange: (s: BrowserSettingsState) => void; onLogin: (p: { id: string; name: string }) => void; confirm: ReturnType<typeof useConfirm>[0] }) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const add = async () => {
    try {
      const r = await post<BrowserSettingsState & { profile: { id: string; name: string } }>('/api/browser/profiles', { name });
      onChange(r);
      setName('');
      setAdding(false);
      onLogin(r.profile);
    } catch (e) {
      toastError(e);
    }
  };
  const rename = async (id: string, old: string) => {
    const n = window.prompt('A new name for the profile', old)?.trim();
    if (!n || n === old) return;
    try {
      onChange(await patch<BrowserSettingsState>(`/api/browser/profiles/${enc(id)}`, { name: n }));
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async (id: string, n: string) => {
    if (!(await confirm({ title: `Delete ${n}?`, body: 'Its logins and everything the browser kept for it go too.', confirm: 'Delete', danger: true }))) return;
    try {
      onChange(await del<BrowserSettingsState>(`/api/browser/profiles/${enc(id)}`));
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Group
      title="Profiles"
      hint="Keep logins between sessions"
      info="Log in once here (you drive the browser), then pick the profile in a session’s browser menu. Your own Chrome profile is never used."
      actions={
        <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
          New profile
        </Button>
      }
    >
      {!st ? (
        <div className="flex justify-center px-4 py-6">
          <Throbber className="text-fg-3" />
        </div>
      ) : st.profiles.length === 0 ? (
        <EmptyRow>No profiles yet: each session’s browser starts fresh, logged in nowhere.</EmptyRow>
      ) : (
        st.profiles.map((p) => (
          <Row
            key={p.id}
            icon={<UserRound size={16} />}
            label={<span translate="no">{p.name}</span>}
            control={
              <>
                <Button size="sm" variant="secondary" icon={<LogIn size={14} />} onClick={() => onLogin(p)}>
                  Log in to sites
                </Button>
                <MoreMenu label={p.name} width={180}>
                  {(close) => (
                    <>
                      <MenuItem icon={<Pencil size={14} />} onClick={() => (close(), void rename(p.id, p.name))}>
                        Rename
                      </MenuItem>
                      <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (close(), void remove(p.id, p.name))}>
                        Delete
                      </MenuItem>
                    </>
                  )}
                </MoreMenu>
              </>
            }
          />
        ))
      )}
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="New profile"
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!name.trim()} onClick={add}>
              Add
            </Button>
          </>
        }
      >
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && void add()} placeholder="Name, like Work or Shopping" className={inputCls} />
      </Dialog>
    </Group>
  );
}

/** A profile's own browser, driven by the user to log in to sites; closing it keeps the logins. */
function ProfileLogin({ profile, onClose }: { profile: { id: string; name: string }; onClose: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const mobile = useIsMobile();
  const live = useRef<LiveViewApi>(null);
  const view = useBrowser((s) => (key ? s.views[key] : undefined));
  useEffect(() => {
    listenBrowser();
  }, []);
  // Its frames and state go to the pages that follow its key, as a session's do to the session's pages.
  useEffect(() => (key ? socket.sub(key) : undefined), [key]);
  const start = async () => {
    try {
      const r = await post<{ key: string }>(`/api/browser/profiles/${enc(profile.id)}/open`, { url });
      setKey(r.key);
      await loadBrowser(r.key);
    } catch (e) {
      toastError(e);
    }
  };
  const go = async () => {
    if (!key) return start();
    await browserCall(key, '/navigate', { url });
  };
  const close = async () => {
    if (key) await browserCall(key, '/close');
    onClose();
  };
  return (
    <Dialog open onClose={close} title={`Log in to sites · ${profile.name}`} width={mobile ? 520 : 1000}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && url.trim() && void go()} placeholder="A site to log in to, like github.com/login" className={inputCls} />
          <Button variant="primary" disabled={!url.trim()} onClick={go}>
            Open
          </Button>
        </div>
        {key && view?.open ? (
          <>
            <LiveView ref={live} k={key} view={view} driving maxH={mobile ? '55dvh' : '62vh'} className="rounded-lg border border-line" />
            {mobile && (
              <Button size="sm" variant="secondary" onClick={() => live.current?.keyboard()}>
                Keyboard
              </Button>
            )}
            <p className="text-[12.5px] text-fg-3">Click and type in the page as in any browser. The logins stay in this profile when you close this.</p>
          </>
        ) : (
          <p className="text-[13px] text-fg-3">Open a site, log in, and close this when done. Sessions that use the profile are logged in there too.</p>
        )}
      </div>
    </Dialog>
  );
}
