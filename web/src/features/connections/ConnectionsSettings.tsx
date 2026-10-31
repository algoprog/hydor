// Settings → Connections: the marketplace (search, categories, featured apps), the connected apps
// (status, test, on or off for every session, their tools, disconnect) and the keys in the vault.
import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, ChevronDown, CircleAlert, CircleCheck, ExternalLink, GitPullRequest, PlugZap, RefreshCw, Search, Store, Unplug } from 'lucide-react';
import { CONNECTION_CATEGORIES, type CatalogApp, type ConnectionCategory, type ConnectionView } from '@shared/connections';
import { api, del, enc, patch, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { useFeatureEvent } from '../../lib/featureEvents';
import { Badge, Button, cx, Empty, inputCls, Section, Switch, Tabs, Throbber, useConfirm } from '../../components/ui';
import { ConnectDialog, FLOW_KEY } from './ConnectDialog';
import { Keys } from './Keys';
import { AppIcon, authLabel, REPO_CATALOG, useConn } from './store';

type Tab = 'market' | 'connected' | 'keys';

/** The browser came back from signing in (?flow=…): says how it went, then tidies the address. */
function useSignInReturn(onDone: () => void) {
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const flow = q.get('flow');
    if (!flow) return;
    // In the small sign-in window: the page that opened it is told, and this window closes.
    if (window.opener && window.name === 'naget-sign-in') {
      try {
        window.opener.postMessage({ type: 'naget-connections-flow', flow }, location.origin);
      } catch {}
      window.close();
    }
    sessionStorage.removeItem(FLOW_KEY);
    q.delete('flow');
    go(`/settings?${q}`, true);
    api<{ result: { app: string; name: string; ok: boolean; error?: string } | null }>(`/api/connections/flows/${enc(flow)}`)
      .then((r) => {
        if (!r.result) return;
        const name = r.result.name;
        if (r.result.ok) toast(`${name} is connected`, 'ok');
        else toast(`${name}: ${r.result.error ?? 'signing in did not finish'}`, 'error');
        onDone();
      })
      .catch(() => {});
  }, []);
}

function AppCard({ app, connected, onOpen, big }: { app: CatalogApp; connected?: ConnectionView; onOpen: () => void; big?: boolean }) {
  return (
    <button
      onClick={onOpen}
      className={cx(
        'group flex w-full min-w-0 gap-3 rounded-2xl border border-line bg-panel text-left transition-colors hover:border-line-2 hover:bg-bg-1 active:bg-bg-2',
        big ? 'w-[248px] shrink-0 flex-col p-3.5 sm:w-[260px]' : 'items-start p-3',
      )}
    >
      <div className={cx('flex min-w-0 gap-3', big ? 'items-center' : 'contents')}>
        <AppIcon app={app} size={big ? 40 : 36} />
        {big && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-semibold">{app.name}</div>
            <div className="text-[11.5px] text-fg-3">{CONNECTION_CATEGORIES[app.category]}</div>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!big && (
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-medium">{app.name}</span>
            {app.verified && <BadgeCheck size={13} className="shrink-0 text-fg-3" aria-label="Checked" />}
          </div>
        )}
        <div className={cx('text-[12.5px] leading-snug text-fg-3', big ? 'line-clamp-3 min-h-[3.9em]' : 'mt-0.5 line-clamp-2')}>{app.description}</div>
        <div className="mt-2 flex items-center gap-1.5">
          {connected ? (
            <Badge tone={connected.status === 'ok' || connected.status === 'untested' ? 'ok' : 'warn'}>{connected.status === 'signin' ? 'Sign in again' : 'Connected'}</Badge>
          ) : (
            <span className="inline-flex h-6 items-center rounded-lg bg-bg-2 px-2 text-[12px] font-medium text-fg-2 transition-colors group-hover:bg-accent group-hover:text-accent-fg">Connect</span>
          )}
          <span className="truncate text-[11.5px] text-fg-3">{authLabel(app)}</span>
          {!app.verified && <Badge tone="warn">not checked</Badge>}
        </div>
      </div>
    </button>
  );
}

function Marketplace({ onOpen }: { onOpen: (a: CatalogApp) => void }) {
  const apps = useConn((s) => s.apps);
  const connections = useConn((s) => s.connections);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ConnectionCategory | 'all'>('all');
  const byId = useMemo(() => new Map((connections ?? []).map((c) => [c.id, c])), [connections]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of apps ?? []) m.set(a.category, (m.get(a.category) ?? 0) + 1);
    return m;
  }, [apps]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (apps ?? []).filter((a) => {
      if (cat !== 'all' && a.category !== cat) return false;
      const hay = `${a.name} ${a.description} ${a.keywords?.join(' ') ?? ''} ${CONNECTION_CATEGORIES[a.category]} ${a.id}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [apps, q, cat]);
  if (!apps) return <Throbber className="text-fg-3" />;
  const featured = !q && cat === 'all' ? apps.filter((a) => a.featured) : [];
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${apps.length} apps: mail, Notion, invoices…`} className={cx(inputCls, 'pl-9 text-[16px] sm:text-[14px]')} type="search" />
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        {(['all', ...Object.keys(CONNECTION_CATEGORIES)] as const)
          .filter((c) => c === 'all' || counts.get(c))
          .map((c) => (
            <button
              key={c}
              onClick={() => setCat(c as ConnectionCategory | 'all')}
              className={cx(
                'h-7.5 shrink-0 rounded-full border px-3 text-[12.5px] whitespace-nowrap transition-colors',
                cat === c ? 'border-fg bg-fg text-bg' : 'border-line bg-panel text-fg-2 hover:border-line-2 hover:text-fg',
              )}
            >
              {c === 'all' ? 'All' : CONNECTION_CATEGORIES[c as ConnectionCategory]}
              <span className={cx('ml-1.5 tnum text-[11px]', cat === c ? 'opacity-70' : 'text-fg-3')}>{c === 'all' ? apps.length : counts.get(c)}</span>
            </button>
          ))}
      </div>
      {featured.length > 0 && (
        <div>
          <div className="mb-2 text-[12.5px] font-medium text-fg-3">Featured</div>
          <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            {featured.map((a) => (
              <div key={a.id} className="snap-start">
                <AppCard app={a} connected={byId.get(a.id)} onOpen={() => onOpen(a)} big />
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        {featured.length > 0 && <div className="mb-2 text-[12.5px] font-medium text-fg-3">All apps</div>}
        {shown.length ? (
          <div className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
            {shown.map((a) => (
              <AppCard key={a.id} app={a} connected={byId.get(a.id)} onOpen={() => onOpen(a)} />
            ))}
          </div>
        ) : (
          <Empty icon={<Search size={20} />} title="No app matches">
            Try other words, or add it to the catalog yourself (below).
          </Empty>
        )}
      </div>
      <div className="flex gap-3 rounded-2xl border border-dashed border-line-2 px-4 py-3.5 text-[13px] leading-relaxed text-fg-2">
        <GitPullRequest size={17} className="mt-0.5 shrink-0 text-fg-3" />
        <div>
          Missing an app? Anyone can add one: a small JSON file in the <code className="rounded bg-bg-2 px-1 font-mono text-[12px]">catalog/</code> folder of Naget Agent’s repository, sent as a pull request.{' '}
          <a href={REPO_CATALOG} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
            How to add one <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
}

function statusLine(c: ConnectionView): { text: string; tone: 'ok' | 'warn' | 'err' | 'muted' } {
  const tools = c.tools ? `${c.tools.filter((t) => t.on).length} of ${c.tools.length} tools on` : '';
  if (c.status === 'signin') return { text: 'Needs signing in again', tone: 'warn' };
  if (c.status === 'error') return { text: c.error ? `Not working: ${c.error}` : 'Not working', tone: 'err' };
  if (c.status === 'untested') return { text: 'Not tested yet', tone: 'muted' };
  return { text: [`Working${c.testedAt ? `, checked ${ago(c.testedAt)}` : ''}`, tools].filter(Boolean).join(' · '), tone: 'ok' };
}

function ConnectedApp({ c, onReconnect }: { c: ConnectionView; onReconnect: () => void }) {
  const [testing, setTesting] = useState(false);
  const [tools, setTools] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const st = statusLine(c);
  const test = async () => {
    setTesting(true);
    try {
      const r = await post<{ ok: boolean; tools?: number; error?: string }>(`/api/connections/${enc(c.id)}/test`);
      if (r.ok) toast(`${c.name} works: ${r.tools} tools`, 'ok');
      else toast(`${c.name}: ${r.error}`, 'error');
      await useConn.getState().load();
    } catch (e) {
      toastError(e);
    } finally {
      setTesting(false);
    }
  };
  const set = async (p: { enabled?: boolean; tools?: Record<string, boolean> }) => {
    await patch(`/api/connections/${enc(c.id)}`, p).catch(toastError);
    await useConn.getState().load();
  };
  const disconnect = async () => {
    if (!(await confirm({ title: `Disconnect ${c.name}?`, body: 'Its sign-in or key is deleted here, and agents stop getting its tools.', confirm: 'Disconnect', danger: true }))) return;
    await del(`/api/connections/${enc(c.id)}`).catch(toastError);
    await useConn.getState().load();
  };
  return (
    <div className="py-3.5">
      <div className="flex items-start gap-3">
        <AppIcon app={c.app} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="text-[14px] font-medium">{c.name}</span>
            {c.hint && <span className="font-mono text-[11.5px] text-fg-3">{c.hint}</span>}
          </div>
          <div className={cx('mt-0.5 flex items-start gap-1.5 text-[12.5px] leading-snug', st.tone === 'ok' ? 'text-fg-3' : st.tone === 'warn' ? 'text-warn' : st.tone === 'err' ? 'text-err' : 'text-fg-3')}>
            {st.tone === 'ok' ? <CircleCheck size={13} className="mt-px shrink-0 text-ok" /> : st.tone === 'muted' ? null : <CircleAlert size={13} className="mt-px shrink-0" />}
            <span className="min-w-0 break-words">{st.text}</span>
          </div>
          {c.catalogChanged && (
            <div className="mt-1 text-[12px] leading-snug text-warn">
              The catalog has a new address or sign-in for it. It keeps using the old one until you{' '}
              <button onClick={onReconnect} className="underline underline-offset-2">
                connect again
              </button>
              .
            </div>
          )}
        </div>
        <label className="flex shrink-0 items-center gap-2 pt-0.5 text-[12px] text-fg-3">
          <span className="hidden sm:inline">Every session</span>
          <Switch on={c.enabled} onChange={(on) => set({ enabled: on })} label={c.enabled ? `${c.name} is on for every session` : `${c.name} is off unless a session turns it on`} />
        </label>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:pl-12">
        <Button size="sm" variant="secondary" onClick={test} disabled={testing} icon={testing ? <Throbber /> : <RefreshCw size={13} />}>
          {testing ? 'Testing…' : 'Test'}
        </Button>
        {c.tools && c.tools.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setTools((t) => !t)} icon={<ChevronDown size={14} className={cx('transition-transform', tools && 'rotate-180')} />}>
            Tools
          </Button>
        )}
        {(c.status === 'signin' || c.app.fields?.length || c.app.auth.type !== 'none') && (
          <Button size="sm" variant="ghost" onClick={onReconnect}>
            {c.status === 'signin' ? 'Sign in again' : c.app.auth.type === 'oauth' ? 'Sign in again' : 'Change'}
          </Button>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" className="px-2 text-fg-3 hover:text-err sm:px-3" onClick={disconnect} icon={<Unplug size={13} />} aria-label={`Disconnect ${c.name}`} title="Disconnect">
          <span className="hidden sm:inline">Disconnect</span>
        </Button>
      </div>
      {tools && c.tools && (
        <div className="mt-2.5 divide-y divide-line rounded-xl border border-line sm:ml-12">
          {c.tools.map((t) => (
            <label key={t.name} className="flex cursor-pointer items-start gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12.5px] break-all">{t.name}</div>
                {t.description && <div className="line-clamp-2 text-[12px] leading-snug text-fg-3">{t.description}</div>}
              </div>
              <Switch on={t.on} onChange={(on) => set({ tools: { [t.name]: on } })} label={`${t.name} ${t.on ? 'on' : 'off'}`} />
            </label>
          ))}
        </div>
      )}
      {confirmNode}
    </div>
  );
}

function Connected({ onBrowse, onReconnect }: { onBrowse: () => void; onReconnect: (a: CatalogApp) => void }) {
  const connections = useConn((s) => s.connections);
  const apps = useConn((s) => s.apps);
  if (!connections) return <Throbber className="text-fg-3" />;
  if (!connections.length)
    return (
      <Section>
        <Empty icon={<PlugZap size={20} />} title="Nothing connected yet">
          <p>Connect an app once, and every agent can use it: Claude Code, Codex, other agents and Custom.</p>
          <Button className="mt-3" variant="primary" size="sm" icon={<Store size={14} />} onClick={onBrowse}>
            Browse the marketplace
          </Button>
        </Empty>
      </Section>
    );
  return (
    <Section title="Connected apps" sub="Every agent gets the ones that are on. A session can turn an app off (or on) for itself from its menu.">
      <div className="-my-3.5 divide-y divide-line">
        {connections.map((c) => (
          <ConnectedApp key={c.id} c={c} onReconnect={() => onReconnect(apps?.find((a) => a.id === c.id) ?? c.app)} />
        ))}
      </div>
    </Section>
  );
}

export function ConnectionsSettings() {
  const connections = useConn((s) => s.connections);
  const secrets = useConn((s) => s.secrets);
  const [tab, setTab] = useState<Tab | null>(null);
  const [open, setOpen] = useState<CatalogApp | null>(null);
  useEffect(() => {
    void useConn.getState().loadCatalog();
    void useConn.getState().load();
  }, []);
  // The first look: what is connected, or the marketplace when nothing is.
  useEffect(() => {
    if (tab === null && connections) setTab(connections.length ? 'connected' : 'market');
  }, [connections, tab]);
  useFeatureEvent('connections', (e) => {
    const d = e.data as { changed?: string };
    if (d?.changed === 'apps' || d?.changed === 'secrets') void useConn.getState().load();
  });
  // A sign-in that finished in another window, told by that window.
  useEffect(() => {
    const m = (e: MessageEvent) => e.origin === location.origin && e.data?.type === 'naget-connections-flow' && void useConn.getState().load();
    window.addEventListener('message', m);
    return () => window.removeEventListener('message', m);
  }, []);
  useSignInReturn(() => {
    void useConn.getState().load();
    setTab('connected');
  });
  const current = tab ?? 'market';
  return (
    <div className="space-y-4">
      <Tabs
        value={current}
        onChange={setTab}
        className="-mt-1 border-b border-line"
        options={[
          { value: 'market', label: 'Marketplace' },
          { value: 'connected', label: 'Connected', count: connections?.length },
          { value: 'keys', label: 'Keys', count: secrets?.length },
        ]}
      />
      {current === 'market' && <Marketplace onOpen={setOpen} />}
      {current === 'connected' && <Connected onBrowse={() => setTab('market')} onReconnect={setOpen} />}
      {current === 'keys' && <Keys />}
      <ConnectDialog app={open} open={!!open} onClose={() => setOpen(null)} onConnected={() => setTab('connected')} />
    </div>
  );
}
