// Settings → Connect other agents: tokens for this app's MCP server, so an agent elsewhere (Claude Code
// on a laptop, Codex, Cursor) can list, read, start and message sessions here. A token is shown once;
// the server keeps only its hash.
import { useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { api, del, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { toastError } from '../../lib/store';
import { CopyButton } from '../../components/Markdown';
import { Button, cx, Dialog, Throbber, IconButton, inputCls, Section, useConfirm } from '../../components/ui';

interface TokenView {
  id: string;
  name: string;
  createdAt: number;
  lastUsed?: number;
}

export function ConnectSettings() {
  const [list, setList] = useState<TokenView[] | null>(null);
  const [making, setMaking] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const load = () =>
    api<{ tokens: TokenView[] }>('/api/mcp/tokens')
      .then((r) => setList(r.tokens))
      .catch(toastError);
  useEffect(() => {
    load();
  }, []);
  const revoke = async (t: TokenView) => {
    if (!(await confirm({ title: `Revoke ${t.name}?`, body: 'Agents using it lose access at once.', confirm: 'Revoke', danger: true }))) return;
    await del(`/api/mcp/tokens/${t.id}`).catch(toastError);
    load();
  };
  return (
    <div className="space-y-4">
      <Section
        title="Tokens"
        sub="An agent with a token can start and steer sessions on this machine, as you can here."
        actions={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setMaking(true)}>
            New token
          </Button>
        }
      >
        {!list ? (
          <Throbber className="text-fg-3" />
        ) : !list.length ? (
          <p className="text-[13px] leading-relaxed text-fg-3">None yet. Make one for each agent or machine, so you can revoke them one at a time.</p>
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
      </Section>
      <Section title="What they can do">
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-fg-2">
          <li>list_sessions and read_session: find a session and catch up on it</li>
          <li>start_session: a new Claude Code or Codex session, in any folder, optionally in its own worktree</li>
          <li>send_message: steer a session (it queues while the agent works)</li>
          <li>list_models</li>
        </ul>
        <p className="mt-3 text-[12.5px] leading-relaxed text-fg-3">Sessions started here need nothing: they can already show pages in the conversation (charts, reports, mock-ups) with their show_html tool.</p>
      </Section>
      <NewToken open={making} onClose={() => setMaking(false)} onMade={load} />
      {confirmNode}
    </div>
  );
}

function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-fg-2">
        <span className="flex-1">{label}</span>
        <CopyButton text={text} />
      </div>
      <pre className="overflow-x-auto rounded-lg border border-line bg-code-bg px-3 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre text-fg-2">{text}</pre>
    </div>
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
      const r = await post<{ token: string }>('/api/mcp/tokens', { name });
      setToken(r.token);
      onMade();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const url = `${location.origin}/mcp`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={token ? 'Your token' : 'New token'}
      width={600}
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
          <span className="mb-1 block text-fg-2">Name it after where it goes</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && make()} placeholder="Claude Code on my laptop" className={inputCls} autoFocus />
        </label>
      ) : (
        <div className="space-y-3.5 text-[13px]">
          <p className="rounded-xl border border-warn/30 bg-warn/8 px-3 py-2 leading-relaxed">Copy it now: it is not shown again.</p>
          <Snippet label="Token" text={token} />
          <Snippet label="Claude Code" text={`claude mcp add --transport http hydor ${url} --header "Authorization: Bearer ${token}"`} />
          <Snippet label="Codex (~/.codex/config.toml, with HYDOR_TOKEN set to the token)" text={`[mcp_servers.hydor]\nurl = "${url}"\nbearer_token_env_var = "HYDOR_TOKEN"`} />
          <Snippet label="Other clients (JSON)" text={JSON.stringify({ mcpServers: { hydor: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2)} />
          <p className={cx('text-[12px] leading-relaxed text-fg-3')}>The address is this page’s: an agent on another machine needs to reach it the same way your browser does.</p>
        </div>
      )}
    </Dialog>
  );
}
