// Preview: dev servers running on this machine (Vite, Next, a Python server…), opened in a browser on
// any device through the app's preview port (server/preview.ts).
import { useEffect, useState } from 'react';
import { ExternalLink, MonitorSmartphone, } from 'lucide-react';
import { api, post } from '../../lib/api';
import { tildify } from '../../lib/format';
import { toastError, useApp } from '../../lib/store';
import { Button, cx, Throbber, Empty, inputCls, Section } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { RefreshIcon } from '../../components/RefreshIcon';

interface DevServer {
  port: number;
  program: string;
  command: string;
  cwd?: string;
}

interface Info {
  servers: DevServer[];
  port: number | null;
  origin: string | null;
}

export function PreviewPage() {
  const home = useApp((s) => s.boot?.home);
  const [info, setInfo] = useState<Info | null>(null);
  const [reach, setReach] = useState<'checking' | 'yes' | 'no'>('checking');
  const [other, setOther] = useState('');
  const origin = info?.port ? (info.origin ?? `${location.protocol}//${location.hostname}:${info.port}`) : null;

  const load = () =>
    api<Info>('/api/preview')
      .then(setInfo)
      .catch(toastError);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!origin) return;
    setReach('checking');
    fetch(`${origin}/__ac/ping`, { mode: 'cors', cache: 'no-store' })
      .then((r) => setReach(r.ok ? 'yes' : 'no'))
      .catch(() => setReach('no'));
  }, [origin]);

  const open = async (port: number) => {
    // Open the tab now, while the click still counts, then send it on: pop-up blockers allow that.
    const w = window.open('about:blank', '_blank');
    try {
      const r = await post<{ token: string }>('/api/preview/link', { port });
      const url = `${origin}/__ac/open?t=${encodeURIComponent(r.token)}`;
      if (w) w.location.href = url;
      else location.href = url;
    } catch (e) {
      w?.close();
      toastError(e);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Preview"
        sub="Open a dev server running on this machine, from any device"
        actions={
          <Button size="sm" variant="ghost" icon={<RefreshIcon size={13} />} onClick={load}>
            Refresh
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[820px] space-y-4 px-3 py-5 sm:px-6">
          {!info ? (
            <div className="flex justify-center py-10 text-fg-3">
              <Throbber size={28} />
            </div>
          ) : !info.port ? (
            <Empty icon={<MonitorSmartphone size={22} />} title="Previews are off">
              The server was started with PREVIEW_PORT=0.
            </Empty>
          ) : (
            <>
              {reach === 'no' && (
                <div className="space-y-1.5 rounded-2xl border border-warn/30 bg-warn/8 px-4 py-3 text-[13px] leading-relaxed">
                  <div className="font-medium">This browser cannot reach the preview port ({origin}) from here.</div>
                  <div className="text-fg-2">
                    On the same network, or over a VPN such as Tailscale or WireGuard, port {info.port} of this machine works directly. Behind a tunnel or a proxy, give the port a hostname
                    of its own (for example preview.example.com → localhost:{info.port}) and start the server with PREVIEW_ORIGIN set to it.
                  </div>
                </div>
              )}
              <Section title="Running here" sub="Servers listening on this machine, with the folder they run in">
                {!info.servers.length ? (
                  <p className="text-[13px] text-fg-3">None found. Start one in a terminal or ask an agent to (npm run dev, say), and it shows here.</p>
                ) : (
                  <div className="-my-1 divide-y divide-line">
                    {info.servers.map((s) => (
                      <div key={s.port} className="flex items-center gap-3 py-2.5">
                        <span className="w-14 shrink-0 font-mono text-[13px] font-medium text-fg">:{s.port}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] text-fg-2">
                            {s.program}
                            {s.cwd && <span className="text-fg-3"> · {tildify(s.cwd, home)}</span>}
                          </div>
                          <div className="truncate font-mono text-[11.5px] text-fg-3" title={s.command}>
                            {s.command}
                          </div>
                        </div>
                        <Button size="sm" variant="secondary" icon={<ExternalLink size={13} />} onClick={() => open(s.port)}>
                          Open
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
              <form
                className="flex flex-wrap items-center gap-2 px-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const p = Number(other);
                  if (Number.isInteger(p) && p > 0 && p < 65536) open(p);
                }}
              >
                <span className="text-[13px] text-fg-3">Another port</span>
                <input value={other} onChange={(e) => setOther(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="3000" className={cx(inputCls, 'h-8 w-24 text-[13px]')} />
                <Button size="sm" variant="ghost" type="submit" disabled={!other}>
                  Open
                </Button>
              </form>
              <p className="px-1 text-[12px] leading-relaxed text-fg-3">
                Previews open on {origin} in a tab of their own, signed in for 12 hours. Hot reload works. The app’s own sign-in never reaches the dev server.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
