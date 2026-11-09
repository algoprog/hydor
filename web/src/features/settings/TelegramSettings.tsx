// Settings → Telegram: your agents in a Telegram chat (server/telegram). A bot of your own, made with @BotFather: its
// token goes to the server's vault and never comes back here; then each chat you link with a one-time code can start
// sessions, get their replies and answer what agents ask.
import { useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, Link2, Send, Trash2 } from 'lucide-react';
import { api, del, put, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, IconButton, inputCls, Section, Segmented, Switch, Throbber, useConfirm } from '../../components/ui';
import { LOCALE } from '../../i18n/locale';

interface TelegramView {
  connected: boolean;
  state: 'off' | 'running' | 'error';
  error?: string;
  bot?: { username: string; name: string };
  chats: { id: number; name: string; at: number }[];
  notify: boolean;
  agent: 'claude' | 'codex';
  pairing?: { code: string; link?: string; until: number };
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-[200px] flex-1">
        <div className="text-[13.5px] text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function TelegramSettings() {
  const [v, setV] = useState<TelegramView | null>(null);
  const [token, setToken] = useState('');
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const load = () => api<TelegramView>('/api/telegram').then(setV).catch(toastError);
  useEffect(() => {
    load();
  }, []);
  // While a code is out, the page looks for the chat it links (and the bot's name, a moment after it connects).
  const waiting = !!v?.pairing || (v?.connected && !v.bot && v.state !== 'error');
  const chats = v?.chats.length ?? 0;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => {
      api<TelegramView>('/api/telegram')
        .then((n) => {
          if (n.chats.length > chats) toast(`Linked ${n.chats[n.chats.length - 1].name}`, 'ok');
          setV(n);
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, [waiting, chats]);

  const change = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      setV(await put<TelegramView>('/api/telegram', body));
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const connect = async () => {
    if (await change({ token: token.trim() })) (setToken(''), setChanging(false));
  };
  const remove = async () => {
    if (
      !(await confirm({
        title: 'Remove the bot?',
        body: 'Hydor stops answering in Telegram, and the chats linked to it are unlinked. The bot itself stays yours in Telegram.',
        confirm: 'Remove',
        danger: true,
      }))
    )
      return;
    await change({ token: null });
  };
  const pair = () => post<TelegramView>('/api/telegram/pair').then(setV).catch(toastError);
  const unlink = async (c: TelegramView['chats'][number]) => {
    if (!(await confirm({ title: `Unlink ${c.name}?`, body: 'That chat can no longer use your agents, until you link it again.', confirm: 'Unlink', danger: true }))) return;
    setV(await del<TelegramView>(`/api/telegram/chats/${c.id}`).catch((e) => (toastError(e), v)));
  };

  if (!v) return <Throbber className="text-fg-3" />;
  const tokenBox = (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className={`${inputCls} min-w-[260px] flex-1 font-mono text-[12.5px]`}
        placeholder="123456789:AA…"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && token.trim() && connect()}
        autoComplete="off"
        spellCheck={false}
      />
      <Button variant="primary" disabled={busy || !token.trim()} onClick={connect}>
        {v.connected ? 'Change' : 'Connect'}
      </Button>
    </div>
  );
  return (
    <div className="space-y-4">
      <Section title="Bot" sub="A Telegram bot of your own that only the chats you link can use. Hydor asks Telegram for messages itself, so it needs no address on the internet.">
        {!v.connected ? (
          <div className="space-y-3 py-2">
            <p className="text-[13px] leading-relaxed text-fg-2">Make a bot in Telegram with @BotFather: send it /newbot and give the bot a name, then paste the token it gives you here.</p>
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline">
              <ExternalLink size={13} />
              Open @BotFather
            </a>
            {tokenBox}
          </div>
        ) : (
          <>
            <Row
              label={v.bot ? `@${v.bot.username}` : 'Connecting…'}
              hint={v.state === 'error' ? <span className="text-err">{v.error}</span> : v.state === 'running' ? 'Listening for messages' : 'Starting'}
            >
              <div className="flex items-center gap-1">
                {v.bot && (
                  <a href={`https://t.me/${v.bot.username}`} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-fg-3 hover:bg-bg-2 hover:text-fg" title="Open in Telegram">
                    <ExternalLink size={14} />
                  </a>
                )}
                <Button size="sm" variant="ghost" onClick={() => setChanging((c) => !c)}>
                  Change token
                </Button>
                <IconButton label="Remove the bot" size="sm" onClick={remove}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </Row>
            {changing && <div className="pb-3">{tokenBox}</div>}
          </>
        )}
      </Section>
      {v.connected && (
        <Section
          title="Your chats"
          sub="Each can start sessions, gets their replies, and answers what agents ask."
          actions={
            <Button size="sm" variant="secondary" icon={<Link2 size={14} />} onClick={pair}>
              Link a chat
            </Button>
          }
        >
          {v.pairing && (
            <div className="my-2 space-y-2 rounded-lg border border-line bg-bg-2 p-3 text-[13px] leading-relaxed text-fg-2">
              {v.pairing.link && (
                <a href={v.pairing.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-accent hover:underline">
                  <ExternalLink size={13} />
                  Open in Telegram
                </a>
              )}
              <div>
                {v.pairing.link ? 'Press Start in the chat it opens. Or send the bot this code:' : 'Send the bot this code:'}{' '}
                <span className="font-mono text-[14px] font-semibold tracking-wider text-fg">{v.pairing.code}</span>
              </div>
              <div className="text-[12px] text-fg-3">Good for ten minutes, once. Waiting for it…</div>
            </div>
          )}
          {!v.chats.length ? (
            !v.pairing && <p className="py-2 text-[13px] text-fg-3">None yet. Link the chat you will use: Link a chat gives it a code.</p>
          ) : (
            <div className="-my-1 divide-y divide-line">
              {v.chats.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2.5">
                  <Send size={15} className="shrink-0 text-fg-3" />
                  <div className="min-w-0 flex-1">
                    <div translate="no" className="truncate text-[13.5px] text-fg">
                      {c.name}
                    </div>
                    <div className="text-[12px] text-fg-3">Linked {new Date(c.at).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  </div>
                  <IconButton label="Unlink" size="sm" onClick={() => unlink(c)}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
      {v.connected && (
        <Section>
          <Row label="New sessions use" hint="The agent a message starts, when the chat is in no session">
            <Segmented
              size="sm"
              value={v.agent}
              onChange={(agent) => change({ agent })}
              options={[
                { value: 'claude', label: 'Claude Code' },
                { value: 'codex', label: 'Codex' },
              ]}
            />
          </Row>
          <Row label="Notices from every session" hint="When any session finishes, fails or needs you, not only the ones a chat started">
            <Switch on={v.notify} onChange={(notify) => change({ notify })} label="Notices from every session" />
          </Row>
        </Section>
      )}
      {confirmNode}
    </div>
  );
}
