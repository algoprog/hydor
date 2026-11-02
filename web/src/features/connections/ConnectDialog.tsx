// Connecting one app: what it is and how it connects, then what it takes. Nothing (Connect), a key, a
// few fields, or a sign-in in the browser: a window on a computer, this tab on a phone, coming back
// to Settings → Connections either way.
import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronDown, CircleAlert, ExternalLink, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { CONNECTION_CATEGORIES, type CatalogApp, type CatalogField, type ConnectionView } from '@shared/connections';
import { api, ApiError, enc, post } from '../../lib/api';
import { toast } from '../../lib/store';
import { CopyButton } from '../../components/Markdown';
import { Badge, Button, cx, Dialog, inputCls, Throbber, useIsMobile } from '../../components/ui';
import { AppIcon, authLabel, serverLine, useConn } from './store';

/** Where a sign-in started in this tab goes on, after the browser comes back (phones). */
export const FLOW_KEY = 'naget-connections-flow';

export function SecretInput({ value, onChange, placeholder, autoFocus, onEnter }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; onEnter?: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        className={cx(inputCls, 'pr-10 font-mono text-[16px] sm:text-[13.5px]')}
      />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide' : 'Show'} className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg">
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

function FieldInput({ f, value, onChange, saved }: { f: CatalogField; value: string; onChange: (v: string) => void; saved?: boolean }) {
  const lines = /one per line/i.test(f.help ?? '');
  return (
    <label className="block text-[13px]">
      <span className="mb-1 flex items-baseline gap-2 text-fg-2">
        <span>{f.label}</span>
        {f.optional && <span className="text-[11.5px] text-fg-3">optional</span>}
        {f.url && (
          <a href={f.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
            Get one <ExternalLink size={11} />
          </a>
        )}
      </span>
      {f.secret ? (
        <SecretInput value={value} onChange={onChange} placeholder={saved ? 'Saved: leave empty to keep it' : f.placeholder} />
      ) : lines ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} rows={3} className={cx(inputCls, 'h-auto py-2 font-mono text-[16px] sm:text-[13px]')} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder ?? f.default} autoCapitalize="off" autoCorrect="off" spellCheck={false} className={cx(inputCls, 'text-[16px] sm:text-[14px]')} />
      )}
      {f.help && <span className="mt-1 block text-[12px] leading-snug text-fg-3">{f.help}</span>}
    </label>
  );
}

export function ConnectDialog({ app, open, onClose, onConnected }: { app: CatalogApp | null; open: boolean; onClose: () => void; onConnected?: (c: ConnectionView) => void }) {
  const mobile = useIsMobile();
  const conn = useConn((s) => s.connections?.find((c) => c.id === app?.id));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [key, setKey] = useState('');
  const [own, setOwn] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState<string | null>(null);
  const popup = useRef<Window | null>(null);

  useEffect(() => {
    if (!open || !app) return;
    setFields(Object.fromEntries((app.fields ?? []).filter((f) => !f.secret).map((f) => [f.name, conn?.fields[f.name] ?? f.default ?? ''])));
    setKey('');
    setClientId('');
    setClientSecret('');
    setError('');
    setWaiting(null);
    setOwn(app.auth.type === 'oauth' && !!app.auth.help);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, app?.id]);

  // A sign-in in another window: its outcome, once the browser is back.
  useEffect(() => {
    if (!waiting) return;
    let stop = false;
    const tick = async () => {
      const r = await api<{ result: { ok: boolean; error?: string } | null }>(`/api/connections/flows/${enc(waiting)}`).catch(() => null);
      if (stop) return;
      if (r?.result) {
        setWaiting(null);
        popup.current?.close();
        if (r.result.ok) {
          toast(`${app?.name} is connected`, 'ok');
          await useConn.getState().load();
          const c = useConn.getState().connections?.find((x) => x.id === app?.id);
          if (c) onConnected?.(c);
          onClose();
        } else setError(r.result.error ?? 'Signing in did not finish');
        return;
      }
      setTimeout(tick, 1500);
    };
    const t = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [waiting, app?.id]);

  if (!app) return null;
  const a = app;
  const oauth = a.auth.type === 'oauth';
  const remoteKey = a.auth.type === 'api_key' && a.server.transport !== 'stdio';
  const plainFields = a.fields ?? [];
  const callback = `${location.origin}/connections/callback`;

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await post<{ connection: ConnectionView }>(`/api/connections/${enc(a.id)}`, { fields, ...(remoteKey ? { key } : {}), test: a.server.transport === 'stdio' });
      toast(`${a.name} is connected${a.server.transport === 'stdio' ? ': testing it in the background' : ''}`, 'ok');
      await useConn.getState().load();
      onConnected?.(r.connection);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    setBusy(true);
    setError('');
    // A window opened now, inside the click, is not stopped as a pop-up; a phone stays in this tab.
    const w = mobile ? null : window.open('about:blank', 'naget-sign-in', 'popup,width=520,height=720');
    try {
      const r = await post<{ url?: string; flow?: string; connection?: ConnectionView }>(`/api/connections/${enc(a.id)}/oauth`, { fields, ...(own && clientId.trim() ? { clientId: clientId.trim(), clientSecret: clientSecret.trim() } : {}) });
      if (r.connection) {
        w?.close();
        toast(`${a.name} is connected`, 'ok');
        await useConn.getState().load();
        onConnected?.(r.connection);
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
      // The sign-in server will not register apps by itself: a client ID it is.
      if (e instanceof ApiError && e.status === 409) setOwn(true);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canGo = !busy && !waiting && (!remoteKey || key.trim() || conn?.hint) && plainFields.every((f) => f.optional || f.secret || fields[f.name]?.trim());

  return (
    <Dialog
      open={open}
      onClose={() => (popup.current?.close(), onClose())}
      width={560}
      title={
        <span className="flex items-center gap-3">
          <AppIcon app={a} size={30} />
          <span className="truncate">{a.name}</span>
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {oauth ? (
            <Button variant="primary" onClick={signIn} disabled={!canGo}>
              {busy ? 'Opening…' : conn ? 'Sign in again' : `Sign in to ${a.name.split(/[:(]/)[0].trim()}`}
            </Button>
          ) : (
            <Button variant="primary" onClick={connect} disabled={!canGo}>
              {busy ? 'Connecting…' : conn ? 'Save' : 'Connect'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-[13.5px]">
        <p className="leading-relaxed text-fg-2">{a.description}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{CONNECTION_CATEGORIES[a.category]}</Badge>
          <Badge tone="info">{authLabel(a)}</Badge>
          {a.verified ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-fg-3" title={`Checked by ${a.verified.by}`}>
              <BadgeCheck size={13} className="text-ok" /> Checked {a.verified.date}
            </span>
          ) : (
            <Badge tone="warn">Address not checked yet</Badge>
          )}
          <span className="flex-1" />
          <a href={a.homepage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg">
            Website <ExternalLink size={11} />
          </a>
          {a.docs && (
            <a href={a.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg">
              Docs <ExternalLink size={11} />
            </a>
          )}
        </div>
        <div className="rounded-xl border border-line bg-bg-1 px-3 py-2 text-[12.5px] leading-relaxed text-fg-3">
          <div className="flex gap-2">
            <span className="w-14 shrink-0">{a.server.transport === 'stdio' ? 'Runs' : 'Server'}</span>
            <span className="min-w-0 font-mono break-all text-fg-2">{serverLine(a)}</span>
          </div>
          <div className="flex gap-2">
            <span className="w-14 shrink-0">Agents</span>
            <span className="text-fg-2">Every agent gets its tools as the MCP server “{a.id}”; you can turn it off per session.</span>
          </div>
        </div>
        {a.notes && <p className="rounded-xl border border-warn/30 bg-warn/8 px-3 py-2 text-[12.5px] leading-relaxed text-fg-2">{a.notes}</p>}

        {plainFields.map((f) => (
          <FieldInput key={f.name} f={f} value={fields[f.name] ?? ''} saved={!!conn?.secretFields.includes(f.name)} onChange={(v) => setFields((x) => ({ ...x, [f.name]: v }))} />
        ))}

        {remoteKey && a.auth.type === 'api_key' && (
          <label className="block text-[13px]">
            <span className="mb-1 flex items-baseline gap-2 text-fg-2">
              <span>Key</span>
              {a.auth.url && (
                <a href={a.auth.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
                  Get a key <ExternalLink size={11} />
                </a>
              )}
            </span>
            <SecretInput value={key} onChange={setKey} placeholder={conn?.hint ? `Saved (${conn.hint}): leave empty to keep it` : 'Paste the key'} onEnter={() => canGo && connect()} />
            {a.auth.help && <span className="mt-1 block text-[12px] leading-snug text-fg-3">{a.auth.help}</span>}
          </label>
        )}
        {a.server.transport === 'stdio' && a.auth.type === 'api_key' && a.auth.help && <p className="text-[12.5px] leading-snug text-fg-3">{a.auth.help}</p>}

        {oauth && (
          <div className="rounded-xl border border-line">
            <button type="button" onClick={() => setOwn((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-fg-2">
              <span className="flex-1">{a.auth.type === 'oauth' && a.auth.help ? 'Your own client ID (this service needs one)' : 'Use your own client ID (optional)'}</span>
              <ChevronDown size={15} className={cx('text-fg-3 transition-transform', own && 'rotate-180')} />
            </button>
            {own && (
              <div className="space-y-3 border-t border-line px-3 pt-2.5 pb-3">
                {a.auth.type === 'oauth' && a.auth.help && <p className="text-[12.5px] leading-snug text-fg-3">{a.auth.help}</p>}
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
        )}

        {oauth && !waiting && (
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
