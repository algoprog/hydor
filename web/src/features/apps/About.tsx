// An app before you install it, in plain terms: what it does, what it asks you, what you get back, how it works,
// and whether agents in your sessions can run it for you (shared/app-summary.ts says which). The card of an app
// from a file shows it above the technical details; a ready-made app that was uninstalled shows it on its page
// and in the dialog that installs it again. The same "Agents can use it" switch is on every installed app's page.
import { useState, type ReactNode } from 'react';
import { AppWindow, Bell, BookOpen, Bot, Brain, Code, Database, FileSearch, FileText, Globe, GitBranch, Hand, Image, Link2, MessagesSquare, Repeat, Sparkles, Split } from 'lucide-react';
import type { AppTemplate } from '@shared/apps';
import type { AppSummary, WorkKind } from '@shared/app-summary';
import { appSummary } from '@shared/app-summary';
import { enc, post, put } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, Switch, Throbber } from '../../components/ui';
import { appPath } from './api';
import { AppIcon } from './AppIcon';

/** The kinds of work, in words, with an icon each. */
const WORK: Record<Exclude<WorkKind, 'tool'>, { icon: ReactNode; text: string }> = {
  one: { icon: <Bot size={14} />, text: 'One agent does the whole task' },
  model: { icon: <Sparkles size={14} />, text: 'Asks a model for quick answers' },
  agent: { icon: <Bot size={14} />, text: 'An agent does the parts that need judgement' },
  code: { icon: <Code size={14} />, text: 'Small programs work out what must be exact' },
  parallel: { icon: <Split size={14} />, text: 'Does several things at once' },
  repeat: { icon: <Repeat size={14} />, text: 'Goes through items one by one' },
  decide: { icon: <GitBranch size={14} />, text: 'Makes choices along the way' },
  ask: { icon: <Hand size={14} />, text: 'Can stop to ask you' },
  app: { icon: <AppWindow size={14} />, text: 'Uses other apps' },
  data: { icon: <Database size={14} />, text: 'Keeps records between runs' },
};

/** The tools steps use, in words. */
const TOOLS: Record<string, { icon: ReactNode; text: string }> = {
  web_search: { icon: <Globe size={14} />, text: 'Searches the web' },
  read_page: { icon: <FileText size={14} />, text: 'Reads web pages' },
  read_document: { icon: <FileSearch size={14} />, text: 'Reads documents' },
  http_request: { icon: <Link2 size={14} />, text: 'Calls web addresses' },
  generate_image: { icon: <Image size={14} />, text: 'Makes pictures' },
  knowledge_search: { icon: <BookOpen size={14} />, text: 'Looks through your documents' },
  knowledge_read: { icon: <BookOpen size={14} />, text: 'Looks through your documents' },
  recall: { icon: <Brain size={14} />, text: 'Remembers what you told it' },
  notify_user: { icon: <Bell size={14} />, text: 'Sends you a notification' },
};

/** How it works, as lines: each kind of work once, the same words once. */
function howLines(s: AppSummary): { icon: ReactNode; text: string }[] {
  const out: { icon: ReactNode; text: string }[] = [];
  for (const h of s.how) {
    const line = h.kind === 'tool' ? (TOOLS[h.tool ?? ''] ?? { icon: <Sparkles size={14} />, text: `Uses ${h.tool}` }) : WORK[h.kind];
    if (!out.some((x) => x.text === line.text)) out.push(line);
  }
  return out.slice(0, 7);
}

function Part({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-bg-1/60 px-4 py-3', className)}>
      <h3 className="mb-2 text-[12.5px] font-semibold tracking-wide text-fg-3 uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** What agents in sessions make of it: a switch when it is made for them (and the switch is offered), else why not. */
export function SessionsLine({ s, on, onChange, busy }: { s: Pick<AppSummary, 'sessions' | 'ownPage'> & { block?: boolean }; on?: boolean; onChange?: (on: boolean) => void; busy?: boolean }) {
  if (!s.sessions) return <p className="text-[13px] leading-snug text-fg-3">{s.block ? 'A building block for other apps’ steps: agents don’t run it in sessions.' : 'Made to be used on its own page: agents don’t run it in sessions.'}</p>;
  return (
    <div className="flex items-start gap-3">
      <MessagesSquare size={16} className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">Agents can use it</div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-fg-3">Ask for what it does in any session: the agent runs it there and shows its answer, asking you first for anything missing.</p>
      </div>
      {onChange && <Switch on={!!on} onChange={onChange} label="Agents can use it" disabled={busy} className="mt-0.5 shrink-0" />}
    </div>
  );
}

/**
 * An app in plain terms: its face and what it does, what it asks you (the optional questions marked), what you
 * get back, how it works, and whether agents may run it in your sessions (with the switch when `onAgents` is given).
 */
export function AppAbout({
  name,
  description,
  icon,
  color,
  category,
  origin,
  summary,
  translate,
  agents,
  onAgents,
  block,
}: {
  name: string;
  description: string;
  icon: string;
  color: string;
  category?: string;
  /** Where it comes from, as a chip: "Ready-made", "From a file". */
  origin?: string;
  summary: AppSummary;
  /** A ready-made app's words are the app's own (translated); a file's are its author's. */
  translate?: boolean;
  agents?: boolean;
  onAgents?: (on: boolean) => void;
  block?: boolean;
}) {
  const own = translate ? undefined : 'no';
  const how = howLines(summary);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <AppIcon icon={icon} color={color} size={56} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[19px] leading-tight font-semibold tracking-tight" translate={own}>
            {name}
          </div>
          {description && (
            <p className="mt-1 text-[14px] leading-relaxed text-fg-2" translate={own}>
              {description}
            </p>
          )}
          {(origin || category) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {origin && <span className="rounded-full bg-bg-2 px-2.5 py-0.5 text-[12px] text-fg-2">{origin}</span>}
              {category && (
                <span className="rounded-full bg-bg-2 px-2.5 py-0.5 text-[12px] text-fg-2" translate={own}>
                  {category}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Part title="What it asks you">
          {summary.asks.length ? (
            <ul className="space-y-1">
              {summary.asks.map((a) => (
                <li key={a.label} className="flex min-w-0 items-baseline gap-2 text-[13.5px]">
                  <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-fg-3" />
                  <span className="min-w-0 truncate" translate={own}>
                    {a.label}
                  </span>
                  {a.optional && <span className="shrink-0 text-[12px] text-fg-3">optional</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-fg-3">Nothing: it just runs.</p>
          )}
        </Part>
        <Part title="What you get">
          {summary.gets.length ? (
            <>
              <ol className="space-y-1">
                {summary.gets.map((g, i) => (
                  <li key={g} className="flex min-w-0 items-center gap-2 text-[13.5px]">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-accent/12 text-[11px] font-semibold text-accent">{i + 1}</span>
                    <span className="min-w-0 truncate" translate={own}>
                      {g}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[12px] text-fg-3">{summary.inView ? 'In a view of its own, page by page' : 'As a card you can copy or download'}</p>
            </>
          ) : (
            <p className="text-[13.5px] text-fg-3">{summary.ownPage ? 'A page of its own, where you use it' : 'The agent’s reply'}</p>
          )}
        </Part>
      </div>
      {how.length > 0 && (
        <Part title="How it works">
          <ul className="flex flex-wrap gap-1.5">
            {how.map((h) => (
              <li key={h.text} className="inline-flex items-center gap-1.5 rounded-full bg-bg-2 px-2.5 py-1 text-[12.5px] text-fg-2">
                <span className="text-fg-3">{h.icon}</span>
                {h.text}
              </li>
            ))}
          </ul>
          {summary.steps > 0 && <p className="mt-2 text-[12px] text-fg-3">{`In ${summary.steps} steps`}</p>}
        </Part>
      )}
      <div className="rounded-2xl border border-line px-4 py-3">
        <SessionsLine s={{ ...summary, block }} on={agents} onChange={onAgents} />
      </div>
    </div>
  );
}

/** The "Agents can use it" card on an installed app's page: the switch, saved at once. */
export function AgentsCard({ id, made, on, block, ownPage, onChange }: { id: string; made: boolean; on: boolean; block?: boolean; ownPage?: boolean; onChange: (on: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const flip = async (next: boolean) => {
    setBusy(true);
    try {
      const r = await put<{ agents: boolean }>(`/api/apps/${enc(id)}/agents`, { on: next });
      onChange(r.agents);
      toast(r.agents ? 'Agents can run it in your sessions' : 'Agents won’t run it in your sessions', 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 py-3.5">
      <h3 className="mb-2 text-[13px] font-semibold">In your sessions</h3>
      <SessionsLine s={{ sessions: made, ownPage: !!ownPage, block }} on={on} onChange={flip} busy={busy} />
    </section>
  );
}

/** Installs a ready-made app again, after showing what it is; then opens it. */
export function InstallReadyDialog({ t, open, onClose }: { t: AppTemplate; open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [agents, setAgents] = useState(true);
  const summary = appSummary(t);
  const install = async () => {
    setBusy(true);
    try {
      await post(`/api/apps/${enc(`tpl:${t.id}`)}/install`);
      if (!agents && summary.sessions) await put(`/api/apps/${enc(`tpl:${t.id}`)}/agents`, { on: false });
      toast('Installed', 'ok');
      onClose();
      go(appPath(`tpl:${t.id}`));
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
      title="Install this app?"
      width={600}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={install} disabled={busy} icon={busy ? <Throbber /> : undefined}>
            Install
          </Button>
        </>
      }
    >
      <AppAbout name={t.name} description={t.description} icon={t.icon} color={t.color} category={t.category} origin="Ready-made" summary={summary} translate agents={agents} onAgents={setAgents} block={t.block} />
    </Dialog>
  );
}
