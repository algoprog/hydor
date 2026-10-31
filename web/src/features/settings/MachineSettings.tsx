// Settings → Machines: other machines running Naget Agent that this app shows (each under /m/<id>/,
// reached over SSH or by URL), and the access tokens other machines use to reach the machine shown.
import { useEffect, useState } from 'react';
import { ArrowUpRight, KeyRound, Plus, Trash2 } from 'lucide-react';
import type { MachineView } from '@shared/types';
import { api, del, patch, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { machineId, machinePath } from '../../lib/machine';
import { useMachines } from '../../lib/machines';
import { toastError, useApp } from '../../lib/store';
import { CopyButton } from '../../components/Markdown';
import { Button, cx, Dialog, Throbber, IconButton, inputCls, Section, Segmented, useConfirm } from '../../components/ui';
import { MACHINE_DOT, machineLine } from '../machines/MachineSwitcher';
import { RefreshIcon } from '../../components/RefreshIcon';

const CLI = 'node dist/server/cli.js access-token';

export function MachineSettings() {
  const list = useMachines((s) => s.list);
  const self = useMachines((s) => s.self);
  const loaded = useMachines((s) => s.loaded);
  const [edit, setEdit] = useState<Partial<MachineView> | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const reload = () => useMachines.getState().load().catch(toastError);
  useEffect(() => {
    reload();
  }, []);
  const remove = async (m: MachineView) => {
    if (!(await confirm({ title: `Remove ${m.name}?`, body: 'Its sessions stay on that machine; this app stops showing them.', confirm: 'Remove', danger: true }))) return;
    await del(`/api/machines/${m.id}`).catch(toastError);
    reload();
  };
  return (
    <div className="space-y-4">
      <Section
        title="Machines"
        sub="Each keeps its own sessions, files and sign-ins; the sidebar switches between them."
        actions={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setEdit({ via: 'ssh', port: 8790 })}>
            Add a machine
          </Button>
        }
      >
        {!loaded ? (
          <Throbber className="text-fg-3" />
        ) : (
          <div className="-my-1 divide-y divide-line">
            <div className="flex items-center gap-3 py-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-ok" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">{self?.host ?? 'This machine'}</div>
                <div className="truncate text-[12px] text-fg-3">This server{self?.version ? ` · ${self.version}` : ''}</div>
              </div>
              {machineId && (
                <Button size="sm" variant="ghost" icon={<ArrowUpRight size={13} />} onClick={() => (location.href = '/')}>
                  Open
                </Button>
              )}
            </div>
            {list.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className={cx('h-2 w-2 shrink-0 rounded-full', MACHINE_DOT[m.status.state])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{m.name}</div>
                  <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
                    <span className="truncate font-mono text-[11.5px]">{m.via === 'ssh' ? `ssh ${m.ssh}${m.port && m.port !== 8790 ? ` · port ${m.port}` : ''}` : m.url}</span>
                    <span className="shrink-0">·</span>
                    <span className={cx('shrink-0', m.status.state === 'offline' ? 'text-err' : m.status.waiting ? 'text-warn' : '')}>{machineLine(m)}</span>
                    {m.status.state === 'online' && m.status.version && <span className="shrink-0">· {m.status.version}</span>}
                  </div>
                  {m.status.state === 'offline' && m.status.error && <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{m.status.error}</div>}
                </div>
                <div className="flex items-center gap-1">
                  {m.status.state === 'offline' && (
                    <IconButton label="Try again now" size="sm" onClick={() => post(`/api/machines/${m.id}/reconnect`).catch(toastError)}>
                      <RefreshIcon size={14} />
                    </IconButton>
                  )}
                  {m.id !== machineId && (
                    <Button size="sm" variant="ghost" icon={<ArrowUpRight size={13} />} onClick={() => (location.href = machinePath(m.id))}>
                      Open
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEdit(m)}>
                    Edit
                  </Button>
                  <IconButton label="Remove" size="sm" onClick={() => remove(m)}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
        {loaded && !list.length && (
          <p className="mt-3 text-[13px] leading-relaxed text-fg-3">
            None yet. Install Naget Agent on the other machine, make an access token there, then add it here: the sidebar then switches between machines, and notices from all of
            them reach you.
          </p>
        )}
      </Section>
      <AccessTokens />
      <EditMachine value={edit} onClose={() => setEdit(null)} onSaved={reload} />
      {confirmNode}
    </div>
  );
}

function EditMachine({ value, onClose, onSaved }: { value: Partial<MachineView> | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [via, setVia] = useState<'ssh' | 'url'>('ssh');
  const [ssh, setSsh] = useState('');
  const [port, setPort] = useState('8790');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!value?.id;
  useEffect(() => {
    if (!value) return;
    setName(value.name ?? '');
    setVia(value.via ?? 'ssh');
    setSsh(value.ssh ?? '');
    setPort(String(value.port ?? 8790));
    setUrl(value.url ?? '');
    setToken('');
    setError(null);
  }, [value]);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { name, via, ssh: via === 'ssh' ? ssh : undefined, port: via === 'ssh' ? Number(port) : undefined, url: via === 'url' ? url : undefined, token: token || undefined };
      if (editing) await patch(`/api/machines/${value!.id}`, body);
      else await post('/api/machines', body);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = name.trim() && (via === 'ssh' ? ssh.trim() : url.trim()) && (editing || token.trim());
  return (
    <Dialog
      open={!!value}
      onClose={onClose}
      title={editing ? `Edit ${value?.name}` : 'Add a machine'}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !ready}>
            {busy ? 'Connecting…' : editing ? 'Save' : 'Connect'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5 text-[13px]">
        <label className="block">
          <span className="mb-1 block text-fg-2">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="GPU box" className={inputCls} autoFocus />
        </label>
        <div>
          <span className="mb-1 block text-fg-2">Reach it</span>
          <Segmented
            size="sm"
            value={via}
            onChange={setVia}
            options={[
              { value: 'ssh', label: 'Over SSH' },
              { value: 'url', label: 'By its address' },
            ]}
          />
        </div>
        {via === 'ssh' ? (
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <label className="block">
              <span className="mb-1 block text-fg-2">SSH host</span>
              <input value={ssh} onChange={(e) => setSsh(e.target.value)} placeholder="gpu-box or chris@10.0.0.5" spellCheck={false} className={cx(inputCls, 'font-mono text-[12.5px]')} />
            </label>
            <label className="block">
              <span className="mb-1 block text-fg-2">Its port</span>
              <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={cx(inputCls, 'font-mono text-[12.5px]')} />
            </label>
            <p className="col-span-2 -mt-1 leading-relaxed text-fg-3">
              With this server’s SSH keys and ~/.ssh/config (a key without a passphrase). Naget Agent there keeps listening on 127.0.0.1 only: nothing else to open.
            </p>
          </div>
        ) : (
          <label className="block">
            <span className="mb-1 block text-fg-2">Address</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://100.64.0.5:8790" spellCheck={false} className={cx(inputCls, 'font-mono text-[12.5px]')} />
            <span className="mt-1 block leading-relaxed text-fg-3">On a VPN such as Tailscale or WireGuard, or behind HTTPS. Naget Agent there must listen where this server reaches it (its HOST setting).</span>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-fg-2">Access token</span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
            type="password"
            autoComplete="off"
            placeholder={editing ? 'Leave empty to keep the one it has' : 'acm_…'}
            className={cx(inputCls, 'font-mono text-[12.5px]')}
          />
          <span className="mt-1 block leading-relaxed text-fg-3">
            Make it on that machine: in its Settings → Machines, or run <code className="rounded bg-bg-2 px-1 font-mono text-[11.5px]">{CLI}</code> in its Naget Agent folder.
          </span>
        </label>
        {error && <p className="rounded-lg bg-err/10 px-3 py-2 leading-relaxed text-err">{error}</p>}
      </div>
    </Dialog>
  );
}

interface TokenView {
  id: string;
  name: string;
  createdAt: number;
  lastUsed?: number;
}

/** Tokens of the machine this page shows, for other machines to reach it. */
function AccessTokens() {
  const host = useApp((s) => s.boot?.host);
  const [list, setList] = useState<TokenView[] | null>(null);
  const [making, setMaking] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const load = () =>
    api<{ tokens: TokenView[] }>('/api/access-tokens')
      .then((r) => setList(r.tokens))
      .catch(toastError);
  useEffect(() => {
    load();
  }, []);
  const revoke = async (t: TokenView) => {
    if (!(await confirm({ title: `Revoke ${t.name}?`, body: 'The machine using it loses access at once.', confirm: 'Revoke', danger: true }))) return;
    await del(`/api/access-tokens/${t.id}`).catch(toastError);
    load();
  };
  return (
    <Section
      title={machineId && host ? `Access to ${host}` : 'Access from other machines'}
      sub="Another Naget Agent with one of these tokens can do all you can here, running commands included. Make one for each machine that connects."
      actions={
        <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setMaking(true)}>
          New token
        </Button>
      }
    >
      {!list ? (
        <Throbber className="text-fg-3" />
      ) : !list.length ? (
        <p className="text-[13px] leading-relaxed text-fg-3">None yet.</p>
      ) : (
        <div className="-my-1 divide-y divide-line">
          {list.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5">
              <KeyRound size={15} className="shrink-0 text-fg-3" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px]">{t.name}</div>
                <div className="text-[12px] text-fg-3">
                  Made {ago(t.createdAt)} · {t.lastUsed ? `used ${ago(t.lastUsed)}` : 'not used yet'}
                </div>
              </div>
              <IconButton label="Revoke" size="sm" onClick={() => revoke(t)}>
                <Trash2 size={14} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <NewToken open={making} onClose={() => setMaking(false)} onMade={load} />
      {confirmNode}
    </Section>
  );
}

function NewToken({ open, onClose, onMade }: { open: boolean; onClose: () => void; onMade: () => void }) {
  const [name, setName] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) (setName(''), setToken(null));
  }, [open]);
  const make = async () => {
    setBusy(true);
    try {
      const r = await post<{ token: string }>('/api/access-tokens', { name });
      setToken(r.token);
      onMade();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={token ? 'Your access token' : 'New access token'}
      width={520}
      footer={
        token ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={make} disabled={busy || !name.trim()}>
              {busy ? 'Making…' : 'Make token'}
            </Button>
          </>
        )
      }
    >
      {!token ? (
        <label className="block text-[13px]">
          <span className="mb-1 block text-fg-2">Which machine will use it?</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && make()}
            placeholder="My laptop"
            className={inputCls}
            autoFocus
          />
        </label>
      ) : (
        <div className="space-y-3 text-[13px]">
          <p className="leading-relaxed text-fg-2">Paste it into the other machine’s Settings → Machines. It is shown only now.</p>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-code-bg px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{token}</code>
            <CopyButton text={token} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
