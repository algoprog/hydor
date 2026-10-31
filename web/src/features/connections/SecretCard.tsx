// The card an agent's request_secret shows in the conversation: the person pastes the key, it goes
// straight to the vault (never into the conversation), and the agent hears that it is there.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CircleCheck, KeyRound, LockKeyhole } from 'lucide-react';
import { cleanDomains, secretName, type SecretRequestView, type SecretView } from '@shared/connections';
import type { ToolItem } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { useFeatureEvent } from '../../lib/featureEvents';
import { Button, cx, inputCls, Throbber } from '../../components/ui';
import { SecretInput } from './ConnectDialog';

export function SecretCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const input = (item.tool.input ?? {}) as { name?: string; why?: string; domains?: unknown };
  const name = secretName(String(input.name ?? ''));
  const [data, setData] = useState<{ request: SecretRequestView | null; secret: SecretView | null } | null>(null);
  const [value, setValue] = useState('');
  const [hosts, setHosts] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  const load = useCallback(() => {
    if (!name) return;
    api<{ request: SecretRequestView | null; secret: SecretView | null }>(`/api/connections/requests?key=${enc(sessionKey)}&name=${enc(name)}`)
      .then(setData)
      .catch(() => setData({ request: null, secret: null }));
  }, [sessionKey, name]);
  useEffect(load, [load, item.tool.status]);
  useFeatureEvent('connections', (e) => (!e.key || e.key === sessionKey) && load());
  const r = data?.request;
  useEffect(() => {
    if (r && hosts === null) setHosts(r.domains.join(', '));
  }, [r, hosts]);

  if (!name) return null;
  const shell = (body: ReactNode, tone?: 'ok' | 'muted') => (
    <div className={cx('tl-item my-1.5 rounded-2xl border px-3.5 py-3', tone === 'ok' ? 'border-ok/25 bg-ok/6' : tone === 'muted' ? 'border-line bg-bg-1' : 'border-accent/35 bg-accent-soft')}>{body}</div>
  );
  if (!data || (!r && (item.tool.status === 'running' || item.tool.status === 'pending')))
    return shell(
      <div className="flex items-center gap-2 text-[13px] text-fg-3">
        <Throbber /> Asking for {name}…
      </div>,
      'muted',
    );
  // The agent asked for a key that is already there (it was told so): nothing to do here.
  if (!r)
    return data.secret
      ? shell(
          <div className="flex items-center gap-2 text-[13px] text-fg-2">
            <KeyRound size={14} className="shrink-0 text-fg-3" />
            <span>
              <span className="font-mono">{name}</span> is in the vault
            </span>
          </div>,
          'muted',
        )
      : null;

  const save = async () => {
    setBusy(true);
    try {
      await post(`/api/connections/requests/${enc(r.id)}`, { value, domains: hosts ?? r.domains });
      setValue('');
      setAgain(false);
      load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const dismiss = async () => {
    setBusy(true);
    await post(`/api/connections/requests/${enc(r.id)}/dismiss`).catch(toastError);
    setBusy(false);
    load();
  };

  if (r.state === 'saved' && !again)
    return shell(
      <div className="flex items-start gap-2 text-[13px] leading-snug text-fg-2">
        <CircleCheck size={15} className="mt-px shrink-0 text-ok" />
        <span className="min-w-0">
          <span className="font-mono">{name}</span> is saved in the vault{r.hint ? <span className="font-mono text-fg-3"> {r.hint}</span> : null}
          {data.secret?.domains.length ? <span className="text-fg-3">, for {data.secret.domains.join(', ')}</span> : null}. The agent was told; it never sees the value.
        </span>
      </div>,
      'ok',
    );
  if (r.state === 'dismissed' && !again)
    return shell(
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-fg-3">
        <span>
          You did not give <span className="font-mono">{name}</span>.
        </span>
        <Button size="sm" variant="ghost" onClick={() => setAgain(true)}>
          Enter it after all
        </Button>
      </div>,
      'muted',
    );

  const parsed = cleanDomains(hosts ?? '');
  return shell(
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-fg">
          <KeyRound size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">The agent asks for a key</div>
          <div className="font-mono text-[13px] break-all text-fg">{name}</div>
          {r.why && <div className="mt-0.5 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">{r.why}</div>}
        </div>
      </div>
      <SecretInput value={value} onChange={setValue} placeholder={r.exists ? `Replaces ${r.hint ?? 'the saved one'}` : 'Paste it here'} onEnter={() => value.trim() && !busy && save()} />
      <label className="block text-[12.5px]">
        <span className="mb-1 block text-fg-3">Only sent to</span>
        <input value={hosts ?? ''} onChange={(e) => setHosts(e.target.value)} placeholder="api.example.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={cx(inputCls, 'h-8.5 font-mono text-[16px] sm:text-[12.5px]')} />
        {!parsed.length && <span className="mt-1 block text-warn">Add the host it is for, or agents cannot use it.</span>}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={!value.trim() || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save to the vault'}
        </Button>
        {r.state === 'pending' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={dismiss}>
            Not now
          </Button>
        )}
        <span className="flex min-w-0 basis-full items-start gap-1.5 text-[11.5px] leading-snug text-fg-3 sm:basis-auto sm:flex-1 sm:justify-end">
          <LockKeyhole size={12} className="mt-px shrink-0" />
          Straight to the encrypted vault; the agent never sees it.
        </span>
      </div>
    </div>,
  );
}
