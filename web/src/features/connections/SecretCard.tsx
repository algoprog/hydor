// The card an agent's request_secret shows in the conversation: the person pastes a key, or fills in a
// sign-in of several fields, and it goes straight to the vault (never into the conversation); details the
// agent marked as not secret go to it as typed. The agent hears that the keys are there.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CircleCheck, KeyRound, LockKeyhole } from 'lucide-react';
import { cleanDomains, secretName, type SecretField, type SecretRequestView, type SecretView } from '@shared/connections';
import type { ToolItem } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { useFeatureEvent } from '../../lib/featureEvents';
import { Button, cx, inputCls, Switch, Throbber } from '../../components/ui';
import { SecretInput } from './ConnectDialog';
import { OpenRouterKeyCard, OPENROUTER_REQUEST } from './OpenRouterKeyCard';

function FieldInput({ f, value, onChange, saved, onEnter }: { f: SecretField; value: string; onChange: (v: string) => void; saved?: string; onEnter: () => void }) {
  if (f.type === 'password') return <SecretInput value={value} onChange={onChange} placeholder={saved ? `Saved ${saved}: leave empty to keep it` : undefined} onEnter={onEnter} />;
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter()}
      type={f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : 'text'}
      inputMode={f.type === 'number' ? 'numeric' : f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : undefined}
      placeholder={saved ? 'Saved: leave empty to keep it' : undefined}
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      data-1p-ignore
      className={cx(inputCls, 'text-[16px] sm:text-[13.5px]')}
    />
  );
}

export function SecretCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const input = (item.tool.input ?? {}) as { name?: string; why?: string; domains?: unknown };
  const name = secretName(String(input.name ?? ''));
  const [data, setData] = useState<{ request: SecretRequestView | null; secret: SecretView | null } | null>(null);
  const [value, setValue] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [hosts, setHosts] = useState<string | null>(null);
  const [commands, setCommands] = useState<boolean | null>(null);
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
    if (r && commands === null) setCommands(!!(r.commands || r.commandsOn));
  }, [r, hosts, commands]);

  if (!name) return null;
  // The OpenRouter key goes to Settings → Models, not the vault: its own card.
  if (name === OPENROUTER_REQUEST) return <OpenRouterKeyCard sessionKey={sessionKey} always />;
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

  const fields = r.fields ?? [];
  const signIn = fields.length > 0;
  // A saved key the agent wants for commands: its value may stay as it is.
  const allowOnly = !signIn && r.exists && !!r.commands;
  const askCommands = !!(r.commands || r.commandsOn);
  const keys = fields.filter((f) => f.secret).map((f) => f.key);

  const save = async () => {
    setBusy(true);
    try {
      await post(`/api/connections/requests/${enc(r.id)}`, {
        ...(signIn ? { values } : { value }),
        domains: hosts ?? r.domains,
        ...(askCommands ? { commands: !!commands } : {}),
      });
      setValue('');
      setValues({});
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

  if (r.state === 'saved' && !again) {
    const saved = signIn ? keys.filter((k) => r.have?.[k]) : [name];
    const told = fields.filter((f) => !f.secret).map((f) => f.label);
    return shell(
      <div className="flex items-start gap-2 text-[13px] leading-snug text-fg-2">
        <CircleCheck size={15} className="mt-px shrink-0 text-ok" />
        {signIn ? (
          <span className="min-w-0">
            Saved in the vault: <span className="font-mono break-all">{saved.join(', ')}</span>
            {r.domains.length ? <span className="text-fg-3">, for {r.domains.join(', ')}</span> : null}. {saved.length > 1 ? 'The agent was told; it never sees the values.' : 'The agent was told; it never sees the value.'}
            {told.length > 0 && (
              <span className="text-fg-3">
                {' '}
                It got these as you typed them: <span translate="no">{told.join(', ')}</span>.
              </span>
            )}
          </span>
        ) : (
          <span className="min-w-0">
            <span className="font-mono">{name}</span> is saved in the vault{r.hint ? <span className="font-mono text-fg-3"> {r.hint}</span> : null}
            {data.secret?.domains.length ? <span className="text-fg-3">, for {data.secret.domains.join(', ')}</span> : null}. The agent was told; it never sees the value.
          </span>
        )}
      </div>,
      'ok',
    );
  }
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
  const ready = signIn
    ? fields.every((f) => f.optional || (f.secret && r.have?.[f.key]) || (values[f.key] ?? '').trim())
    : !!value.trim() || (allowOnly && commands !== !!r.commandsOn);
  const go = () => ready && !busy && save();
  return shell(
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-fg">
          <KeyRound size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">{signIn ? 'The agent asks for a sign-in' : allowOnly ? 'The agent asks to use a key in commands' : 'The agent asks for a key'}</div>
          <div className="font-mono text-[13px] break-all text-fg">{name}</div>
          {r.why && (
            <div translate="no" className="mt-0.5 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">
              {r.why}
            </div>
          )}
        </div>
      </div>
      {signIn ? (
        <div className="space-y-2.5">
          {fields.map((f) => (
            <label key={f.key} className="block text-[12.5px]">
              <span className="mb-1 flex flex-wrap items-baseline gap-x-2 text-fg-2">
                <span translate="no">{f.label}</span>
                {f.optional && <span className="text-[11.5px] text-fg-3">optional</span>}
                {!f.secret && <span className="ml-auto text-[11.5px] text-fg-3">The agent sees this one</span>}
              </span>
              <FieldInput f={f} value={values[f.key] ?? ''} onChange={(v) => setValues((x) => ({ ...x, [f.key]: v }))} saved={r.have?.[f.key]} onEnter={go} />
              {f.help && (
                <span translate="no" className="mt-1 block text-[12px] leading-snug text-fg-3">
                  {f.help}
                </span>
              )}
            </label>
          ))}
        </div>
      ) : (
        <SecretInput value={value} onChange={setValue} placeholder={allowOnly ? `Saved ${r.hint ?? ''}: leave empty to keep it` : r.exists ? `Replaces ${r.hint ?? 'the saved one'}` : 'Paste it here'} onEnter={go} />
      )}
      <label className="block text-[12.5px]">
        <span className="mb-1 block text-fg-3">Only sent to</span>
        <input value={hosts ?? ''} onChange={(e) => setHosts(e.target.value)} placeholder="api.example.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={cx(inputCls, 'h-8.5 font-mono text-[16px] sm:text-[12.5px]')} />
        {!parsed.length && !commands && <span className="mt-1 block text-warn">Add the host it is for, or agents cannot use it.</span>}
      </label>
      {askCommands && (
        <div className="flex items-start gap-2.5 text-[12.5px]">
          <Switch on={!!commands} onChange={setCommands} label={signIn ? 'Commands on this computer may use them' : 'Commands on this computer may use it'} className="mt-px" />
          <span className="min-w-0 leading-snug">
            <span className="block text-fg-2">{signIn ? 'Commands on this computer may use them' : 'Commands on this computer may use it'}</span>
            <span className="block text-fg-3">You are asked before a command runs with it, unless the session has full access.</span>
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={!ready || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save to the vault'}
        </Button>
        {r.state === 'pending' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={dismiss}>
            Not now
          </Button>
        )}
        <span className="flex min-w-0 basis-full items-start gap-1.5 text-[11.5px] leading-snug text-fg-3 sm:basis-auto sm:flex-1 sm:justify-end">
          <LockKeyhole size={12} className="mt-px shrink-0" />
          {signIn ? 'Secrets go straight to the encrypted vault; the agent never sees them.' : 'Straight to the encrypted vault; the agent never sees it.'}
        </span>
      </div>
    </div>,
  );
}
