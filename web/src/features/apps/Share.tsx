// How an app is reached from outside: its API (keys made and revoked here, an example call), other
// agents through the app's MCP server, and the public page anyone with the link can use.
import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Globe, KeyRound, Plus, Trash2 } from 'lucide-react';
import type { AppDef, PublicSettings } from '@shared/apps';
import { madeForSessions } from '@shared/apps';
import { pagesFor } from '@shared/app-ui';
import { api, del, enc, post, put } from '../../lib/api';
import { machineBase } from '../../lib/machine';
import { timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { CodeBlock } from '../../components/Markdown';
import { Button, cx, Dialog, inputCls, Section, Switch, useConfirm } from '../../components/ui';
import { SessionsLine } from './About';
import { money, type AppDetail } from './api';

const origin = () => `${location.origin}${machineBase}`;

function Copyable({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[10px] border border-line-2 bg-bg-1 py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{text}</code>
      <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => {})}>
        Copy
      </Button>
    </div>
  );
}

function Num({ label, value, onChange, step = 1, prefix }: { label: string; value: number; onChange: (v: number) => void; step?: number; prefix?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12.5px] text-fg-3">{label}</span>
      <span className="relative block">
        {prefix && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13.5px] text-fg-3">{prefix}</span>}
        <input
          className={cx(inputCls, 'tnum', prefix && 'pl-6')}
          inputMode="decimal"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0 && n !== value) onChange(step < 1 ? n : Math.round(n));
            else setV(String(value));
          }}
        />
      </span>
    </label>
  );
}

export function ShareTab({ detail, onChange }: { detail: AppDetail; onChange: () => void }) {
  const app = detail.app!;
  const [models, setModels] = useState<{ id: string; label: string; provider: string }[] | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [ask, confirmNode] = useConfirm();
  useEffect(() => {
    api<{ models: { id: string; label: string; provider: string }[] }>('/api/apps/models').then((r) => setModels(r.models), () => setModels([]));
  }, []);

  const save = async (p: { mcp?: boolean; public?: Partial<PublicSettings> }) => {
    try {
      const { id: _i, slug: _s, createdAt: _c, updatedAt: _u, public: pub, mcp, ...recipe } = app;
      await put<{ app: AppDef }>(`/api/apps/${enc(app.id)}`, { recipe, mcp: p.mcp ?? mcp, public: { ...pub, ...p.public } });
      onChange();
    } catch (e) {
      toastError(e);
    }
  };

  const makeKey = async () => {
    try {
      const r = await post<{ id: string; key: string }>(`/api/apps/${enc(app.id)}/keys`, { name: keyName.trim() || 'Key' });
      setNaming(false);
      setKeyName('');
      setMade(r.key);
      onChange();
    } catch (e) {
      toastError(e);
    }
  };

  // An example call: each question with its default, its example answer, or a plain value of its kind.
  const today = new Date().toISOString().slice(0, 10);
  const example = Object.fromEntries(
    app.fields
      .filter((f) => f.type !== 'file')
      .map((f) => [f.id, f.default || (f.type === 'date' ? today : f.type === 'number' ? 3 : f.type === 'yesno' ? 'Yes' : f.type === 'choice' ? f.options?.[0] : f.placeholder?.replace(/^e\.g\.\s*/i, '').split(/,? or /)[0]) || '…']),
  );
  const curl = `curl -X POST ${origin()}/api/apps/${app.slug}/run \\
  -H "Authorization: Bearer ${made ?? 'napp_…'}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ inputs: example, wait: 300 }, null, 2).replace(/'/g, "'\\''")}'`;
  const pub = app.public;
  const link = `${origin()}/a/${app.slug}`;

  return (
    <div className="mx-auto max-w-[860px] space-y-4 px-4 py-6 sm:px-6">
      <Section
        title="API"
        sub="Programs and scripts run the app with a key, and get its answer back."
        actions={
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setNaming(true)}>
            New key
          </Button>
        }
      >
        {made && (
          <div className="mb-3 rounded-xl border border-ok/40 bg-ok/10 p-3">
            <div className="mb-2 text-[13px] font-medium">Your new key. Copy it now: it is not shown again.</div>
            <Copyable text={made} />
          </div>
        )}
        {detail.keys?.length ? (
          <div className="mb-3 overflow-hidden rounded-xl border border-line">
            {detail.keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
                <KeyRound size={15} className="shrink-0 text-fg-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{k.name}</span>
                  <span className="block truncate font-mono text-[11.5px] text-fg-3">
                    {k.hint} · {k.lastUsed ? `used ${timeAgo(k.lastUsed)} ago` : 'not used yet'}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={13} />}
                  onClick={async () => {
                    if (!(await ask({ title: `Revoke ${k.name}?`, body: 'Programs using it stop working at once.', confirm: 'Revoke', danger: true }))) return;
                    del(`/api/apps/${enc(app.id)}/keys/${enc(k.id)}`).then(onChange, toastError);
                  }}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        ) : (
          !made && <div className="mb-3 text-[13px] text-fg-3">No keys yet. A key opens this app only, nothing else here.</div>
        )}
        <div className="mb-1.5 text-[12.5px] text-fg-3">
          Send the form’s answers; <code className="font-mono">wait</code> is how many seconds to wait for the answer (at most 900). It returns <code className="font-mono">status</code>, <code className="font-mono">result</code>, <code className="font-mono">reply</code> and{' '}
          <code className="font-mono">session</code>; a run still going can be asked about at <code className="font-mono">GET …/run/&lt;run&gt;?wait=60</code>. Behind a proxy that cuts long requests (Cloudflare’s is 100 seconds), wait less and ask again.
        </div>
        <CodeBlock code={curl} lang="bash" maxHeight={260} />
      </Section>

      <Section title="In your sessions">
        <SessionsLine
          s={{ sessions: madeForSessions(app), ownPage: !!app.screens?.main || pagesFor(app.ui, 'app').length > 0, block: app.block }}
          on={app.agents}
          onChange={(on) => put(`/api/apps/${enc(app.id)}/agents`, { on }).then(onChange, toastError)}
        />
      </Section>

      <Section title="Other agents" sub="Claude Code, Cursor or another agent connected to Naget Agent’s MCP server can run it as a tool.">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-[13.5px]">
            Offer it as the tool <code className="font-mono text-[12.5px]">app_{app.slug.replace(/-/g, '_')}</code>
            <div className="text-[12px] text-fg-3">
              The address and tokens are in{' '}
              <button type="button" className="text-accent hover:underline" onClick={() => go('/settings?s=connect')}>
                Settings → Connect other agents
              </button>
              .
            </div>
          </div>
          <Switch on={app.mcp} onChange={(on) => save({ mcp: on })} label="Offer to other agents" />
        </div>
      </Section>

      <Section title="Public page" sub="Anyone with the link fills the form and sees the answer: no sign-in, no access to anything else here.">
        <div className="flex items-center gap-3">
          <Globe size={17} className={cx('shrink-0', pub.on ? 'text-accent' : 'text-fg-3')} />
          <div className="min-w-0 flex-1 text-[13.5px]">{pub.on ? 'Open to anyone with the link' : 'Closed'}</div>
          <Switch
            on={pub.on}
            onChange={(on) => {
              if (on && !pub.model && !models?.[0]) return toast('Add a model for Custom first (Settings → Models): public runs use it', 'error');
              save({ public: { on, model: pub.model ?? models?.[0]?.id } });
            }}
            label="Public page"
          />
        </div>
        {pub.on && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <Copyable text={link} />
            </div>
            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg">
              <ExternalLink size={14} />
              Open
            </a>
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1 block text-[12.5px] text-fg-3">Model (one of Custom’s)</span>
            <select className={inputCls} value={pub.model ?? ''} onChange={(e) => save({ public: { model: e.target.value } })}>
              {!pub.model && <option value="">Pick a model…</option>}
              {(models ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.provider}
                </option>
              ))}
            </select>
            {models && !models.length && (
              <span className="mt-1 block text-[12px] text-fg-3">
                No models yet:{' '}
                <button type="button" className="text-accent hover:underline" onClick={() => go('/settings?s=models')}>
                  add one in Settings → Models
                </button>
                .
              </span>
            )}
          </label>
          <div className="flex items-end">
            <div className="flex h-9.5 w-full items-center gap-3 rounded-[10px] border border-line-2 bg-bg-1 px-3">
              <span className="min-w-0 flex-1 text-[13.5px]">Search and read the web</span>
              <Switch on={pub.web} onChange={(on) => save({ public: { web: on } })} label="Search and read the web" />
            </div>
          </div>
          <Num label="Runs per visitor, per hour" value={pub.perIpPerHour} onChange={(v) => save({ public: { perIpPerHour: v } })} />
          <Num label="Public runs a day" value={pub.runsPerDay} onChange={(v) => save({ public: { runsPerDay: v } })} />
          <Num label="Most they may spend a day" prefix="$" step={0.01} value={pub.spendPerDay} onChange={(v) => save({ public: { spendPerDay: v } })} />
          <div className="flex items-end pb-2 text-[12.5px] text-fg-3">
            Today: {detail.publicUsage?.runs ?? 0} run{detail.publicUsage?.runs === 1 ? '' : 's'}, {money(detail.publicUsage?.spent ?? 0)} of {money(pub.spendPerDay)}
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-fg-3">
          Public runs always use Custom with the model above, with no commands and no files, in a throwaway folder, with memory and connections off. They can use only the answer fields{pub.web ? ' and web search' : ''}. Visitors see their own runs only, never this app’s prompt or settings.
        </p>
      </Section>

      <Dialog
        open={naming}
        onClose={() => setNaming(false)}
        title="A new key"
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={makeKey}>
              Make the key
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="mb-1.5 block text-[13px] text-fg-2">What uses it (to tell keys apart)</span>
          <input className={inputCls} autoFocus value={keyName} placeholder="e.g. My shortcut, the weekly script" onChange={(e) => setKeyName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && makeKey()} />
        </label>
      </Dialog>
      {confirmNode}
    </div>
  );
}
