// Signing in to an HTTP MCP server for Custom (Settings → MCP servers): the flow connected apps use, in a small
// window (a phone stays in its tab); a client ID of your own when the server does not let apps register.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CircleAlert, LockKeyhole } from 'lucide-react';
import { api, ApiError, enc, post } from '../../lib/api';
import { toast } from '../../lib/store';
import { CopyButton } from '../../components/Markdown';
import { Button, cx, Dialog, inputCls, Throbber, useIsMobile } from '../../components/ui';
import { FLOW_KEY, SecretInput } from '../connections/ConnectDialog';

export interface SignInServer {
  name: string;
  url: string;
}

export function McpSignInDialog({ server, cwd, onClose, onDone }: { server: SignInServer | null; cwd: string; onClose: () => void; onDone: () => void }) {
  const mobile = useIsMobile();
  const [own, setOwn] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState<string | null>(null);
  const popup = useRef<Window | null>(null);

  useEffect(() => {
    setOwn(false);
    setClientId('');
    setClientSecret('');
    setBusy(false);
    setError('');
    setWaiting(null);
  }, [server?.name, server?.url]);

  // A sign-in in another window: its outcome, once the browser is back.
  useEffect(() => {
    if (!waiting || !server) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await api<{ result: { ok: boolean; error?: string } | null }>(`/api/connections/flows/${enc(waiting)}`).catch(() => null);
      if (stop) return;
      if (r?.result) {
        setWaiting(null);
        popup.current?.close();
        if (r.result.ok) {
          toast(`Signed in to ${server.name}`, 'ok');
          onDone();
          onClose();
        } else setError(r.result.error ?? 'Signing in did not finish');
        return;
      }
      timer = setTimeout(tick, 1500);
    };
    timer = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [waiting]);

  if (!server) return null;
  const callback = `${location.origin}/connections/callback`;
  const close = () => {
    popup.current?.close();
    setWaiting(null);
    onClose();
  };

  const signIn = async () => {
    setBusy(true);
    setError('');
    // A window opened now, inside the click, is not stopped as a pop-up.
    const w = mobile ? null : window.open('about:blank', 'naget-sign-in', 'popup,width=520,height=720');
    try {
      const r = await post<{ url?: string; flow?: string; open?: boolean }>('/api/setup/mcp/signin', { name: server.name, cwd, ...(own && clientId.trim() ? { clientId: clientId.trim(), clientSecret: clientSecret.trim() } : {}) });
      if (r.open) {
        w?.close();
        toast(`${server.name} needs no sign-in`, 'ok');
        onDone();
        onClose();
      } else if (r.url && r.flow) {
        if (w) {
          popup.current = w;
          w.location.href = r.url;
          setWaiting(r.flow);
        } else {
          sessionStorage.setItem(FLOW_KEY, r.flow);
          location.href = r.url;
        }
      }
    } catch (e) {
      w?.close();
      // The sign-in server does not let apps register by themselves: a client ID it is.
      if (e instanceof ApiError && e.status === 409) setOwn(true);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={close}
      width={520}
      title={`Sign in to ${server.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={signIn} disabled={busy || !!waiting}>
            {busy ? 'Opening…' : 'Sign in'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13.5px]">
        <div translate="no" className="rounded-xl border border-line bg-bg-1 px-3 py-2 font-mono text-[12.5px] break-all text-fg-2">
          {server.url}
        </div>
        <div className="rounded-xl border border-line">
          <button type="button" onClick={() => setOwn((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-fg-2">
            <span className="flex-1">Use your own client ID (optional)</span>
            <ChevronDown size={15} className={cx('text-fg-3 transition-transform', own && 'rotate-180')} />
          </button>
          {own && (
            <div className="space-y-3 border-t border-line px-3 pt-2.5 pb-3">
              <div>
                <div className="mb-1 text-[12px] text-fg-3">Callback address to give it</div>
                <div className="flex items-center gap-2 rounded-lg border border-line bg-code-bg px-2.5 py-1.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg-2">{callback}</code>
                  <CopyButton text={callback} />
                </div>
              </div>
              <label className="block text-[13px]">
                <span className="mb-1 block text-fg-2">Client ID</span>
                <input value={clientId} onChange={(e) => setClientId(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} className={cx(inputCls, 'font-mono text-[16px] sm:text-[13px]')} />
              </label>
              <label className="block text-[13px]">
                <span className="mb-1 block text-fg-2">Client secret</span>
                <SecretInput value={clientSecret} onChange={setClientSecret} placeholder="If it has one" />
              </label>
            </div>
          )}
        </div>
        {!waiting && (
          <p className="flex gap-2 text-[12.5px] leading-snug text-fg-3">
            <LockKeyhole size={14} className="mt-0.5 shrink-0" />
            {mobile ? 'You sign in on its own page, then come back here.' : 'You sign in in a small window.'} The tokens stay encrypted on this computer and renew by themselves; agents never see them.
          </p>
        )}
        {waiting && (
          <p className="flex items-center gap-2 rounded-xl bg-bg-2 px-3 py-2.5 text-[13px] text-fg-2">
            <Throbber /> Waiting for you to finish signing in…
          </p>
        )}
        {error && (
          <p className="flex gap-2 rounded-xl border border-err/30 bg-err/8 px-3 py-2 text-[12.5px] leading-snug text-err">
            <CircleAlert size={14} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
