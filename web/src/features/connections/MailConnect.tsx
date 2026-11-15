// Email in Apps → Connected apps: the mail accounts connected (test, change, remove) and the form to add one with
// its address and an app password. The servers fill in by themselves from the address (the app's own list of
// providers, else what the provider publishes), with fields to type them by hand as a last resort; the provider's
// hint says how to make an app password there. Signing in is checked before anything is saved.
import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronDown, CircleAlert, CircleCheck, ExternalLink, Info, LockKeyhole, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { CONNECTION_CATEGORIES, type CatalogApp, type ConnectionView } from '@shared/connections';
import { MAIL_ADDRESS, MAIL_PORTS, MAIL_SECURITY_TEXT, type MailAccountView, type MailLookup, type MailSecurity, type MailServer } from '@shared/mail';
import { api, del, enc, patch, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { toast, toastError } from '../../lib/store';
import { Badge, Button, cx, Dialog, inputCls, Throbber, useConfirm } from '../../components/ui';
import { SecretInput } from './ConnectDialog';
import { AppIcon, useConn } from './store';

const blankServer = (kind: 'imap' | 'smtp'): MailServer => ({ host: '', port: MAIL_PORTS[kind].tls, security: 'tls' });

function ServerFields({ kind, value, onChange }: { kind: 'imap' | 'smtp'; value: MailServer; onChange: (s: MailServer) => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_8.5rem] items-end gap-2">
      <label className="block text-[12.5px]">
        <span className="mb-1 block text-fg-2">{kind === 'imap' ? 'Incoming server (IMAP)' : 'Outgoing server (SMTP)'}</span>
        <input value={value.host} onChange={(e) => onChange({ ...value, host: e.target.value.trim() })} placeholder={`${kind}.example.com`} autoCapitalize="off" autoCorrect="off" spellCheck={false} className={cx(inputCls, 'text-[16px] sm:text-[13.5px]')} />
      </label>
      <label className="block text-[12.5px]">
        <span className="mb-1 block text-fg-2">Port</span>
        <input type="number" min={1} max={65535} value={value.port} onChange={(e) => onChange({ ...value, port: Number(e.target.value) || MAIL_PORTS[kind][value.security] })} className={cx(inputCls, 'text-[16px] sm:text-[13.5px]')} />
      </label>
      <label className="block text-[12.5px]">
        <span className="mb-1 block text-fg-2">Security</span>
        <select value={value.security} onChange={(e) => {
          const security = e.target.value as MailSecurity;
          onChange({ ...value, security, port: MAIL_PORTS[kind][security] });
        }} className={cx(inputCls, 'text-[16px] sm:text-[13.5px]')}>
          {(['tls', 'starttls', 'none'] as MailSecurity[]).map((s) => (
            <option key={s} value={s}>
              {MAIL_SECURITY_TEXT[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Where the servers came from, and the provider's hint for an app password. */
function LookupNote({ lookup }: { lookup: MailLookup }) {
  if (lookup.blocked)
    return (
      <p className="flex gap-2 rounded-xl border border-err/30 bg-err/8 px-3 py-2 text-[12.5px] leading-snug text-fg-2">
        <CircleAlert size={14} className="mt-0.5 shrink-0 text-err" />
        {lookup.blocked}
      </p>
    );
  const servers = lookup.imap && lookup.smtp ? `${lookup.imap.host}, ${lookup.smtp.host}` : '';
  return (
    <div className="space-y-1.5 rounded-xl border border-line bg-bg-1 px-3 py-2.5 text-[12.5px] leading-snug">
      <div className="flex flex-wrap items-baseline gap-x-2 text-fg-2">
        {lookup.provider ? <span className="font-medium text-fg">{lookup.provider.name}</span> : null}
        {lookup.source === 'guess' ? (
          <span>No settings published for {lookup.domain}: trying {servers}. Change them below if your provider names others.</span>
        ) : lookup.source === 'none' ? (
          <span>No servers found for {lookup.domain}: enter them below.</span>
        ) : (
          <span className="font-mono text-[11.5px] text-fg-3" translate="no">
            {servers}
          </span>
        )}
      </div>
      {lookup.provider && (
        <div className="flex gap-2 text-fg-2">
          <Info size={14} className="mt-0.5 shrink-0 text-info" />
          <span>
            {lookup.provider.hint}{' '}
            <a href={lookup.provider.help} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-accent hover:underline">
              How to make one <ExternalLink size={11} />
            </a>
          </span>
        </div>
      )}
    </div>
  );
}

/** Adds an account, or changes one (`account`). */
function AccountForm({ account, onDone, onCancel }: { account?: MailAccountView; onDone: () => void; onCancel?: () => void }) {
  const [address, setAddress] = useState(account?.address ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(account?.name ?? '');
  const [lookup, setLookup] = useState<MailLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [manual, setManual] = useState(false);
  const [imap, setImap] = useState<MailServer>(account?.imap ?? blankServer('imap'));
  const [smtp, setSmtp] = useState<MailServer>(account?.smtp ?? blankServer('smtp'));
  const [username, setUsername] = useState(account?.username ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const asked = useRef('');

  // The servers for the address, a moment after it is typed.
  useEffect(() => {
    const a = address.trim().toLowerCase();
    if (!MAIL_ADDRESS.test(a) || (account && a === account.address)) return setLookup(null);
    const t = setTimeout(async () => {
      asked.current = a;
      setLooking(true);
      try {
        const r = await api<MailLookup>(`/api/mail/lookup?address=${enc(a)}`);
        if (asked.current !== a) return;
        setLookup(r);
        if (r.imap) setImap(r.imap);
        if (r.smtp) setSmtp(r.smtp);
        setUsername(r.username ?? a);
        if (r.source === 'none' && !r.blocked) setManual(true);
      } catch {
        setLookup(null);
      } finally {
        if (asked.current === a) setLooking(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [address]);

  const blocked = !!lookup?.blocked;
  const canGo = !busy && !looking && !blocked && MAIL_ADDRESS.test(address.trim()) && (!!account || !!password.trim()) && (!manual || (imap.host && smtp.host));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body = {
        address: address.trim(),
        ...(password.trim() ? { password } : {}),
        name: name.trim(),
        ...(manual ? { imap, smtp, username: username.trim() } : {}),
      };
      if (account) await patch(`/api/mail/accounts/${enc(account.id)}`, body);
      else await post('/api/mail/accounts', body);
      toast(`${address.trim()} is ${account ? 'saved' : 'connected'}`, 'ok');
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-[13px]">
        <span className="mb-1 block text-fg-2">Email address</span>
        <input type="email" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@example.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoFocus={!account} className={cx(inputCls, 'text-[16px] sm:text-[14px]')} translate="no" />
      </label>
      {looking && (
        <p className="flex items-center gap-2 text-[12.5px] text-fg-3">
          <Throbber /> Finding its mail servers…
        </p>
      )}
      {lookup && !looking && <LookupNote lookup={lookup} />}
      {!blocked && (
        <>
          <label className="block text-[13px]">
            <span className="mb-1 block text-fg-2">App password</span>
            <SecretInput value={password} onChange={setPassword} placeholder={account ? `Saved (${account.hint}): leave empty to keep it` : 'Paste the app password'} onEnter={() => canGo && submit()} />
            <span className="mt-1 block text-[12px] leading-snug text-fg-3">A password made for mail programs in your account’s security settings, not the one you sign in with on the web.</span>
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 flex items-baseline gap-2 text-fg-2">
              Your name <span className="text-[11.5px] text-fg-3">optional</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown on the mail you send" className={cx(inputCls, 'text-[16px] sm:text-[14px]')} translate="no" />
          </label>
          <div className="rounded-xl border border-line">
            <button type="button" onClick={() => setManual((m) => !m)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-fg-2">
              <span className="flex-1">Servers and user name (filled in for you; change them only if you must)</span>
              <ChevronDown size={15} className={cx('text-fg-3 transition-transform', manual && 'rotate-180')} />
            </button>
            {manual && (
              <div className="space-y-3 border-t border-line px-3 pt-2.5 pb-3">
                <ServerFields kind="imap" value={imap} onChange={setImap} />
                <ServerFields kind="smtp" value={smtp} onChange={setSmtp} />
                <label className="block text-[12.5px]">
                  <span className="mb-1 block text-fg-2">User name</span>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={address || 'Usually your whole address'} autoCapitalize="off" autoCorrect="off" spellCheck={false} className={cx(inputCls, 'text-[16px] sm:text-[13.5px]')} translate="no" />
                </label>
              </div>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="flex gap-2 rounded-xl border border-err/30 bg-err/8 px-3 py-2 text-[12.5px] leading-snug text-err">
          <CircleAlert size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button variant="primary" onClick={submit} disabled={!canGo} icon={busy ? <Throbber /> : undefined}>
          {busy ? 'Signing in…' : account ? 'Save' : 'Connect'}
        </Button>
      </div>
    </div>
  );
}

function AccountRow({ a, onChanged }: { a: MailAccountView; onChanged: () => void }) {
  const [testing, setTesting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const test = async () => {
    setTesting(true);
    try {
      const r = await post<{ ok: boolean; error?: string }>(`/api/mail/accounts/${enc(a.id)}/test`);
      if (r.ok) toast(`${a.address} works`, 'ok');
      else toast(`${a.address}: ${r.error}`, 'error');
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setTesting(false);
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: `Remove ${a.address}?`, body: 'Its app password is deleted here, and agents and watchers can no longer use it. Nothing in the mailbox changes.', confirm: 'Remove', danger: true }))) return;
    await del(`/api/mail/accounts/${enc(a.id)}`).catch(toastError);
    onChanged();
  };
  const ok = a.status === 'ok';
  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium" translate="no">
            {a.name ? `${a.name} <${a.address}>` : a.address}
          </div>
          <div className={cx('mt-0.5 flex items-start gap-1.5 text-[12px] leading-snug', ok ? 'text-fg-3' : a.status === 'error' ? 'text-err' : 'text-fg-3')}>
            {ok ? <CircleCheck size={13} className="mt-px shrink-0 text-ok" /> : a.status === 'error' ? <CircleAlert size={13} className="mt-px shrink-0" /> : null}
            <span className="min-w-0 break-words">
              {ok ? `Working${a.testedAt ? `, checked ${ago(a.testedAt)}` : ''}` : a.status === 'error' ? `Not working: ${a.error ?? ''}` : 'Not tested yet'}
              <span className="text-fg-3" translate="no">
                {' · '}
                {a.imap.host}
              </span>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={test} disabled={testing} icon={testing ? <Throbber /> : <RefreshCw size={13} />}>
            Test
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>
            Change
          </Button>
          <Button size="sm" variant="ghost" className="px-2 text-fg-3 hover:text-err" onClick={remove} icon={<Trash2 size={13} />} aria-label={`Remove ${a.address}`} title="Remove" />
        </div>
      </div>
      {editing && (
        <div className="mt-3 rounded-xl border border-line p-3">
          <AccountForm
            account={a}
            onCancel={() => setEditing(false)}
            onDone={() => {
              setEditing(false);
              onChanged();
            }}
          />
        </div>
      )}
      {confirmNode}
    </div>
  );
}

/** The Email connection's dialog: its accounts, and the form to add one. */
export function MailConnectDialog({ app, open, onClose, onConnected }: { app: CatalogApp; open: boolean; onClose: () => void; onConnected?: (c: ConnectionView) => void }) {
  const [accounts, setAccounts] = useState<MailAccountView[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = async () => {
    try {
      const r = await api<{ accounts: MailAccountView[] }>('/api/mail/accounts');
      setAccounts(r.accounts);
      return r.accounts;
    } catch (e) {
      toastError(e);
      return [];
    }
  };
  useEffect(() => {
    if (!open) return;
    setAdding(false);
    void load();
  }, [open]);
  const changed = async () => {
    await load();
    await useConn.getState().load();
  };
  const added = async () => {
    setAdding(false);
    await changed();
    const c = useConn.getState().connections?.find((x) => x.id === app.id);
    if (c) onConnected?.(c);
  };
  const showForm = adding || (accounts !== null && !accounts.length);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={600}
      title={
        <span className="flex items-center gap-3">
          <AppIcon app={app} size={30} />
          <span className="truncate">{app.name}</span>
        </span>
      }
    >
      <div className="space-y-4 text-[13.5px]">
        <p className="leading-relaxed text-fg-2">{app.description}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{CONNECTION_CATEGORIES[app.category]}</Badge>
          <Badge tone="info">Address and app password</Badge>
          <span className="inline-flex items-center gap-1 text-[11.5px] text-fg-3">
            <BadgeCheck size={13} className="text-ok" /> Built into Hydor
          </span>
        </div>
        <div className="rounded-xl border border-line bg-bg-1 px-3 py-2 text-[12.5px] leading-relaxed text-fg-3">
          <div className="flex gap-2">
            <span className="w-14 shrink-0">Agents</span>
            <span className="text-fg-2">
              Every agent gets its tools as the MCP server “{app.id}”: search, read, sort, draft and send. Scheduled tasks can watch for new email.
            </span>
          </div>
        </div>
        {app.notes && <p className="rounded-xl border border-warn/30 bg-warn/8 px-3 py-2 text-[12.5px] leading-relaxed text-fg-2">{app.notes}</p>}
        {accounts === null ? (
          <Throbber className="text-fg-3" />
        ) : (
          <>
            {accounts.length > 0 && (
              <div>
                <div className="mb-1 text-[12.5px] font-medium text-fg-2">Your mail accounts</div>
                <div className="divide-y divide-line">
                  {accounts.map((a) => (
                    <AccountRow key={a.id} a={a} onChanged={changed} />
                  ))}
                </div>
              </div>
            )}
            {showForm ? (
              <div className={cx(accounts.length > 0 && 'rounded-xl border border-line p-3')}>
                {accounts.length > 0 && <div className="mb-2 text-[12.5px] font-medium text-fg-2">Another account</div>}
                <AccountForm onDone={added} onCancel={accounts.length ? () => setAdding(false) : onClose} />
              </div>
            ) : (
              <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
                Add another account
              </Button>
            )}
          </>
        )}
        <p className="flex gap-2 text-[12.5px] leading-snug text-fg-3">
          <LockKeyhole size={14} className="mt-0.5 shrink-0" />
          The app password stays encrypted on this computer; agents never see it. Hydor signs in to read and to send before it saves anything.
        </p>
      </div>
    </Dialog>
  );
}
