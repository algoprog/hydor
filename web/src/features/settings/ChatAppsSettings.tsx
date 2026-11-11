// Settings → Chat apps: your agents in a chat (server/telegram, server/chatapps). Telegram, Discord and Slack each
// take a bot or app of your own: its token (or tokens) goes to the server's vault and never comes back here; then each
// chat you link with a one-time code can start sessions, get their replies and answer what agents ask. One row each;
// the one you open shows its steps, or its chats, with the rest of its options behind one menu.
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearch } from 'wouter';
import { Copy, ExternalLink, Hash, Link2, MessageCircle, Send, Trash2, type LucideIcon } from 'lucide-react';
import { slackManifest, SLACK_MANIFEST } from '@shared/chat-apps';
import { api, del, put, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, cx, IconButton, inputCls, MenuItem, MenuSep, Switch, Throbber, useConfirm } from '../../components/ui';
import { EmptyRow, Group, MoreMenu, Notice, Row, Select, Stack } from './kit';
import { LOCALE } from '../../i18n/locale';

type AppId = 'telegram' | 'discord' | 'slack';

interface ChatView {
  connected: boolean;
  state: 'off' | 'connecting' | 'running' | 'error';
  error?: string;
  /** While connecting: why the last try did not get through (the service slow to answer, or not reached). */
  note?: string;
  warning?: string;
  bot?: { username: string; name?: string };
  chats: { id: string | number; name: string; at: number; kind?: 'dm' | 'channel' }[];
  notify: boolean;
  agent: 'claude' | 'codex';
  pairing?: { code: string; link?: string; until: number };
  invite?: string;
}

const APPS: { id: AppId; name: string; icon: LucideIcon; line: string }[] = [
  { id: 'telegram', name: 'Telegram', icon: Send, line: 'A bot of your own, made with @BotFather' },
  { id: 'discord', name: 'Discord', icon: MessageCircle, line: 'A bot of your own, made in the Developer Portal' },
  { id: 'slack', name: 'Slack', icon: Hash, line: 'An app of your own, made from a manifest' },
];

function Steps({ children }: { children: ReactNode[] }) {
  return (
    <ol className="space-y-1.5 text-[13px] leading-relaxed text-fg-2">
      {children.map((c, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg-2 text-[11.5px] text-fg-3">{i + 1}</span>
          <span className="min-w-0 flex-1">{c}</span>
        </li>
      ))}
    </ol>
  );
}

const linkedOn = (at: number) => new Date(at).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });

const ext = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
    {text}
    <ExternalLink size={11} />
  </a>
);

/** The bot as it is named in its app: @name in Telegram, name · workspace in Slack. */
const botLabel = (id: AppId, v: ChatView) => (!v.bot ? 'Connecting…' : id === 'telegram' ? `@${v.bot.username}` : v.bot.name ? `${v.bot.username} · ${v.bot.name}` : v.bot.username);
/** What is said of a bot that is connected, in a line. */
const statusOf = (id: AppId, v: ChatView) => (v.state === 'error' ? 'Needs attention' : `${v.state === 'running' ? botLabel(id, v) : 'Connecting…'}${v.chats.length ? ` · ${v.chats.length === 1 ? '1 chat' : `${v.chats.length} chats`}` : ''}`);

function Panel({ id, v, setV }: { id: AppId; v: ChatView; setV: (v: ChatView) => void }) {
  const [fields, setFields] = useState({ token: '', appToken: '' });
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const name = APPS.find((a) => a.id === id)!.name;
  const slack = id === 'slack';

  const change = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      setV(await put<ChatView>(`/api/${id}`, body));
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const ready = slack ? fields.token.trim() && fields.appToken.trim() : fields.token.trim();
  const connect = async () => {
    const body = slack ? { botToken: fields.token.trim(), appToken: fields.appToken.trim() } : { token: fields.token.trim() };
    if (await change(body)) (setFields({ token: '', appToken: '' }), setChanging(false));
  };
  const remove = async () => {
    if (
      !(await confirm({
        title: `Disconnect ${name}?`,
        body: slack ? `Hydor stops answering in ${name}, and the chats linked to it are unlinked. The app itself stays yours in ${name}.` : `Hydor stops answering in ${name}, and the chats linked to it are unlinked. The bot itself stays yours in ${name}.`,
        confirm: 'Disconnect',
        danger: true,
      }))
    )
      return;
    await change({ token: null });
  };
  const pair = () => post<ChatView>(`/api/${id}/pair`).then(setV).catch(toastError);
  const unlink = async (c: ChatView['chats'][number]) => {
    if (!(await confirm({ title: `Unlink ${c.name}?`, body: 'That chat can no longer use your agents, until you link it again.', confirm: 'Unlink', danger: true }))) return;
    setV(await del<ChatView>(`/api/${id}/chats/${encodeURIComponent(String(c.id))}`).catch((e) => (toastError(e), v)));
  };

  const box = (value: string, set: (s: string) => void, placeholder: string) => (
    <input
      className={`${inputCls} min-w-[240px] flex-1 font-mono text-[12.5px]`}
      placeholder={placeholder}
      value={value}
      onChange={(e) => set(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && ready && connect()}
      autoComplete="off"
      spellCheck={false}
      type="password"
    />
  );
  const tokenBox = (
    <div className="flex flex-wrap items-center gap-2">
      {slack && box(fields.token, (token) => setFields((f) => ({ ...f, token })), 'Bot token: xoxb-…')}
      {slack && box(fields.appToken, (appToken) => setFields((f) => ({ ...f, appToken })), 'App-level token: xapp-…')}
      {!slack && box(fields.token, (token) => setFields((f) => ({ ...f, token })), id === 'telegram' ? '123456789:AA…' : 'Bot token')}
      <Button variant="primary" disabled={busy || !ready} onClick={connect}>
        {v.connected ? 'Change' : 'Connect'}
      </Button>
    </div>
  );
  const copyManifest = () => navigator.clipboard.writeText(slackManifest()).then(() => toast('Copied the manifest', 'ok'), toastError);

  if (!v.connected) {
    return (
      <div className="space-y-3 px-4 py-4">
        {id === 'telegram' && (
          <>
            <Steps>{['In Telegram, open @BotFather, send it /newbot and give the bot a name.', 'Paste the token it gives you here.']}</Steps>
            {ext('https://t.me/BotFather', 'Open @BotFather')}
          </>
        )}
        {id === 'discord' && (
          <>
            <Steps>
              {[
                'In the Developer Portal, make a New Application.',
                'Under Bot, press Reset Token and copy it, and turn on Message Content Intent.',
                'Paste the token here. Then add the bot to a server of yours (it asks for View Channels, Send Messages and Read Message History).',
              ]}
            </Steps>
            {ext('https://discord.com/developers/applications', 'Open the Developer Portal')}
          </>
        )}
        {slack && (
          <>
            <Steps>
              {[
                'Choose Create New App → From a manifest, pick your workspace and paste the manifest.',
                'Under Basic Information → App-Level Tokens, generate one with the connections:write scope.',
                'Under Install App, install it to your workspace and copy the Bot User OAuth Token.',
                'Paste both tokens here.',
              ]}
            </Steps>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              {ext('https://api.slack.com/apps', 'Open Slack’s apps')}
              <button onClick={copyManifest} className="inline-flex items-center gap-1 text-accent hover:underline">
                <Copy size={11} />
                Copy manifest
              </button>
            </div>
            <p className="text-[12.5px] leading-snug text-fg-3">{`The manifest turns on Socket Mode and asks for these scopes: ${SLACK_MANIFEST.oauth_config.scopes.bot.join(', ')}.`}</p>
          </>
        )}
        {tokenBox}
        {confirmNode}
      </div>
    );
  }

  const invite = id === 'discord' ? v.invite ?? undefined : undefined;
  const pairText =
    id === 'telegram'
      ? v.pairing?.link
        ? 'Press Start in the chat it opens. Or send the bot this code:'
        : 'Send the bot this code:'
      : id === 'discord'
        ? 'Send the bot this code in a direct message, or mention it with the code in a channel:'
        : 'Send the app this code in a direct message, or mention it with the code in a channel:';
  return (
    <>
      <Row
        label={v.state === 'error' ? 'Not connected' : v.state === 'running' ? 'Listening for messages' : 'Connecting…'}
        hint={v.state === 'error' ? <span className="text-err">{v.error}</span> : v.state !== 'running' && v.note ? `${name} has not answered yet (${v.note}). Hydor keeps trying, and connects by itself when it does.` : undefined}
        control={
          <>
            {id === 'telegram' && v.bot && (
              <a href={`https://t.me/${v.bot.username}`} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-fg-3 hover:bg-bg-2 hover:text-fg" title="Open in Telegram">
                <ExternalLink size={14} />
              </a>
            )}
            <MoreMenu width={220}>
              {(close) => (
                <>
                  <MenuItem onClick={() => (close(), setChanging((c) => !c))}>{slack ? 'Change tokens' : 'Change token'}</MenuItem>
                  <MenuSep />
                  <MenuItem danger icon={<Trash2 size={14} />} onClick={() => (close(), remove())}>
                    Disconnect
                  </MenuItem>
                </>
              )}
            </MoreMenu>
          </>
        }
      >
        {changing && tokenBox}
      </Row>
      {v.warning && (
        <div className="px-4 py-3">
          <Notice tone="warn">{v.warning}</Notice>
        </div>
      )}
      <Row icon={<Link2 size={16} />} label="Link a chat" hint="Lets a chat use your agents, with a code that works once" onClick={pair}>
        {v.pairing && (
          <Notice icon={<Link2 size={15} />}>
            <div className="space-y-1.5 leading-relaxed">
              {v.pairing.link && (
                <a href={v.pairing.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-accent hover:underline">
                  <ExternalLink size={13} />
                  Open in Telegram
                </a>
              )}
              <div>
                {pairText} <span className="font-mono text-[14px] font-semibold tracking-wider text-fg">{v.pairing.code}</span>
              </div>
              <div className="text-[12px] text-fg-3">Good for ten minutes, once. Waiting for it…</div>
            </div>
          </Notice>
        )}
      </Row>
      {v.chats.map((c) => (
        <Row
          key={String(c.id)}
          icon={<MessageCircle size={16} />}
          label={<span translate="no">{c.name}</span>}
          hint={c.kind === 'channel' ? `In a channel · linked ${linkedOn(c.at)}` : `Linked ${linkedOn(c.at)}`}
          control={
            <IconButton label="Unlink" size="sm" onClick={() => unlink(c)}>
              <Trash2 size={14} />
            </IconButton>
          }
        />
      ))}
      {!v.chats.length && !v.pairing && (
        <EmptyRow>None yet. Link the chat you will use: Link a chat gives it a code.</EmptyRow>
      )}
      {invite && <Row icon={<ExternalLink size={16} />} label="Add the bot to a server" hint="Discord only lets you message a bot you share a server with" onClick={() => window.open(invite, '_blank', 'noreferrer')} />}
      {slack && <Row icon={<Copy size={16} />} label="Copy manifest" hint="The app’s manifest, to paste when you create it" onClick={copyManifest} />}
      <Row
        label="New sessions use"
        hint="The agent a message starts when the chat is in no session"
        control={<Select<'claude' | 'codex'> label="New sessions use" width={200} value={v.agent} onChange={(agent) => void change({ agent })} options={[{ value: 'claude', label: 'Claude Code' }, { value: 'codex', label: 'Codex' }]} />}
      />
      <Row
        label="Notices from every session"
        hint="Not only those of the sessions a chat started"
        control={<Switch on={v.notify} label="Notices from every session" onChange={(notify) => void change({ notify })} />}
      />
      {confirmNode}
    </>
  );
}

export function ChatAppsSettings() {
  const [views, setViews] = useState<Partial<Record<AppId, ChatView>>>({});
  const [open, setOpen] = useState<AppId | null>(null);
  const first = useRef(true);
  const search = new URLSearchParams(useSearch());
  const load = (id: AppId) => api<ChatView>(`/api/${id}`).then((v) => setViews((all) => ({ ...all, [id]: v })), toastError);
  useEffect(() => {
    APPS.forEach((a) => load(a.id));
  }, []);
  // Where a link points: ?s=telegram (the old address), or the words of an option (Link a chat) for the app that is open.
  const asked = [search.get('s'), search.get('find')].map((w) => APPS.find((a) => a.id === w?.toLowerCase() || a.name.toLowerCase() === w?.toLowerCase())).find(Boolean)?.id;
  useEffect(() => {
    if (!first.current || Object.keys(views).length < APPS.length) return;
    first.current = false;
    setOpen(asked ?? APPS.find((a) => views[a.id]?.connected)?.id ?? null);
  }, [views, asked]);

  // While a code is out, the page looks for the chat it links; and until a bot listens, for how its connecting goes
  // (it connects by itself once its service answers, and an error can clear by itself too).
  const waiting = APPS.filter((a) => views[a.id]?.pairing || (views[a.id]?.connected && (views[a.id]?.state !== 'running' || !views[a.id]?.bot))).map((a) => a.id);
  const chats = waiting.map((id) => views[id]!.chats.length).join();
  useEffect(() => {
    if (!waiting.length) return;
    const t = setInterval(() => {
      for (const id of waiting)
        api<ChatView>(`/api/${id}`)
          .then((n) => {
            setViews((all) => {
              if (n.chats.length > (all[id]?.chats.length ?? 0)) toast(`Linked ${n.chats[n.chats.length - 1].name}`, 'ok');
              return { ...all, [id]: n };
            });
          })
          .catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, [waiting.join(), chats]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Stack>
      <Group title="Bots" info="Hydor asks for messages itself, so none of them needs an address on the internet. Only the chats you link with a code can use your agents.">
        {APPS.map((a) => {
          const v = views[a.id];
          const on = open === a.id;
          return (
            <Fragment key={a.id}>
              <Row
                icon={<a.icon size={16} />}
                label={a.name}
                hint={v ? <span className={cx(v.state === 'error' && 'text-err')}>{v.connected ? <span translate="no">{statusOf(a.id, v)}</span> : a.line}</span> : a.line}
                control={v ? !v.connected && !on ? 'Set up' : undefined : <Throbber className="text-fg-3" />}
                onClick={v ? () => setOpen(on ? null : a.id) : undefined}
              />
              {v && on && (
                <div className="divide-y divide-line bg-bg-1/60">
                  <Panel id={a.id} v={v} setV={(n) => setViews((all) => ({ ...all, [a.id]: n }))} />
                </div>
              )}
            </Fragment>
          );
        })}
      </Group>
    </Stack>
  );
}
