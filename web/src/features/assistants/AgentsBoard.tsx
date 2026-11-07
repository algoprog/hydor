// A project's Agents tab: the agents that work in it, as a team. Each row says what starts an agent (you, its
// schedules) and which agents it hands work to, below it; a click on one shows it beside the board. Agents that
// work everywhere are offered here too, listed under the board.
import { useState } from 'react';
import { makeAgentFor } from '../spaces/parts';
import { ArrowRight, CalendarClock, MessageSquare, MessageSquarePlus, Plus, Sparkles } from 'lucide-react';
import type { AgentActivity, Assistant } from '@shared/assistants';
import type { Space } from '@shared/spaces';
import { tierLabel } from '@shared/tiers';
import { enc } from '../../lib/api';
import { money, untilText } from '../../lib/format';
import { go } from '../../lib/nav';
import { Button, cx, Throbber } from '../../components/ui';
import { statusOf, toolsText, useAgentActivity, whenText } from './agentsState';
import { AssistantIcon } from './icons';
import { useAssistantsState } from './state';

function Node({ a, act, on, onPick }: { a: Assistant; act?: AgentActivity; on: boolean; onPick: () => void }) {
  const st = statusOf(a, act);
  return (
    <button
      type="button"
      onClick={onPick}
      className={cx(
        'relative flex max-w-full min-w-0 flex-col items-center gap-1 rounded-xl border bg-panel px-2.5 pt-2.5 pb-2 text-center transition-colors',
        on ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-line-2',
      )}
    >
      {st.tone !== 'idle' && (
        <span title={st.label} className={cx('absolute top-2 right-2 h-[7px] w-[7px] rounded-full', st.tone === 'work' ? 'animate-pulse bg-info' : st.tone === 'need' ? 'bg-warn' : 'bg-err')} />
      )}
      <AssistantIcon icon={a.icon} size={14} />
      <span translate="no" className="text-[13px] leading-tight font-semibold break-words">
        {a.name}
      </span>
      <span className="rounded-full bg-accent-soft px-2 py-px text-[11.5px] text-fg-2">{tierLabel(a.tier)}</span>
    </button>
  );
}

/** One agent and those it hands work to, under it, joined by lines. */
function Team({ lead, kids, act, pick, picked }: { lead: Assistant; kids: Assistant[]; act: Record<string, AgentActivity> | null; pick: (id: string) => void; picked: string | null }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className={cx('relative', kids.length && "after:absolute after:top-full after:left-1/2 after:h-[15px] after:border-l-[1.5px] after:border-fg-4 after:content-['']")}>
        <Node a={lead} act={act?.[lead.id]} on={picked === lead.id} onPick={() => pick(lead.id)} />
      </div>
      {kids.length > 0 && (
        <>
          <div className="mt-[30px] flex w-full">
            {kids.map((k, i) => (
              <div
                key={k.id}
                className={cx(
                  'relative flex min-w-0 flex-1 justify-center px-1',
                  "before:absolute before:-top-[15px] before:left-1/2 before:h-[15px] before:border-l-[1.5px] before:border-fg-4 before:content-['']",
                  kids.length > 1 && "after:absolute after:-top-[15px] after:border-t-[1.5px] after:border-fg-4 after:content-['']",
                  kids.length > 1 && (i === 0 ? 'after:right-0 after:left-1/2' : i === kids.length - 1 ? 'after:right-1/2 after:left-0' : 'after:right-0 after:left-0'),
                )}
              >
                <Node a={k} act={act?.[k.id]} on={picked === k.id} onPick={() => pick(k.id)} />
              </div>
            ))}
          </div>
          <div className="mt-2 text-center text-[11.5px] text-fg-3">
            <span translate="no">{lead.name}</span> hands work to {kids.length === 1 ? 'this agent' : `these ${kids.length}`}
          </div>
        </>
      )}
    </div>
  );
}

function Detail({ a, act, all, space }: { a: Assistant; act?: AgentActivity; all: Assistant[]; space: Space }) {
  const askedBy = all.filter((x) => x.canAsk?.includes(a.id)).map((x) => x.name);
  const rows: [string, string][] = [
    ['Works in', a.projects?.length ? (a.projects.length === 1 ? space.name : `${space.name} and ${a.projects.length - 1} more`) : 'Everywhere'],
    ['Thinks with', tierLabel(a.tier)],
    ['May', toolsText(a)],
    ...(askedBy.length ? [['Asked by', askedBy.join(', ')] as [string, string]] : []),
    ['This month', act ? `${act.monthSessions === 1 ? '1 session' : `${act.monthSessions} sessions`} · ${money(act.monthUsd)}${a.budgetUsd ? ` of ${money(a.budgetUsd)}` : ''}` : '…'],
  ];
  return (
    <div>
      <div className="flex items-start gap-3">
        <AssistantIcon icon={a.icon} size={15} />
        <div className="min-w-0 flex-1">
          <div translate="no" className="text-[15px] font-semibold break-words">
            {a.name}
          </div>
          <div translate="no" className="text-[13px] leading-snug text-fg-2">
            {a.description}
          </div>
        </div>
      </div>
      <dl className="my-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-3">{k}</dt>
            <dd className="m-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" icon={<MessageSquarePlus size={14} />} onClick={() => go(`/?assistant=${enc(a.id)}&space=${enc(space.id)}`)}>
          Start a session
        </Button>
        <Button size="sm" variant="ghost" onClick={() => go(`/agents/${enc(a.id)}`)}>
          Open
          <ArrowRight size={13} className="ml-1" />
        </Button>
      </div>
    </div>
  );
}

export function AgentsBoard({ space }: { space: Space }) {
  const st = useAssistantsState();
  const act = useAgentActivity();
  const [picked, setPicked] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  if (!st) return <Throbber className="mx-auto my-10 text-fg-3" />;
  const all = st.assistants;
  const here = all.filter((a) => !a.builtin && a.projects?.includes(space.id));
  // Your own first, then the built-in ones.
  const everywhere = all.filter((a) => !a.projects?.length).sort((x, y) => Number(!!x.builtin) - Number(!!y.builtin));
  const byId = new Map(here.map((a) => [a.id, a]));
  const kidsOf = (a: Assistant) => (a.canAsk ?? []).map((id) => byId.get(id) ?? all.find((x) => x.id === id && !x.projects?.length)).filter((x): x is Assistant => !!x);
  const asked = new Set(here.flatMap((a) => kidsOf(a).map((k) => k.id)));
  // A row for each agent that hands work on, runs by itself, or that none of the others asks.
  const leads = here.filter((a) => kidsOf(a).length || act?.[a.id]?.schedules.length || !asked.has(a.id));
  const sel = picked ? all.find((a) => a.id === picked) : undefined;
  const newHere = () => go(`/agents?new=1&project=${enc(space.id)}`);
  return (
    <div data-i18n="agents" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-[13px] text-fg-3">The agents that work only in this project: what starts each one, and whom it hands work to</span>
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={newHere}>
          New agent here
        </Button>
      </div>
      {!here.length ? (
        <div className="rounded-2xl border border-dashed border-line-2 px-5 py-8 text-center">
          <div className="text-[14px] font-semibold">No agents of this project yet</div>
          <div className="mx-auto mt-1 max-w-[520px] text-[13px] text-fg-3">
            An agent made for this project works in its folder, with its knowledge, memory and skills, and is offered only here. Agents that work everywhere are offered here too.
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              variant="primary"
              icon={making ? <Throbber size={13} /> : <Sparkles size={14} />}
              disabled={making}
              onClick={() => {
                setMaking(true);
                void makeAgentFor(space).finally(() => setMaking(false));
              }}
            >
              {making ? 'Making it…' : 'Make one for this project'}
            </Button>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={newHere}>
              New agent here
            </Button>
          </div>
          <div className="mt-2 text-[12px] text-fg-3">Make one for this project drafts it from what the project says about itself, or uses the template for its kind.</div>
        </div>
      ) : (
        <div className={cx('grid gap-4', sel && 'lg:grid-cols-[minmax(0,1fr)_300px]')}>
          <div className="space-y-3">
            {leads.map((a) => {
              const a1 = act?.[a.id];
              return (
                <div key={a.id} className="grid items-center gap-3 rounded-2xl border border-line bg-bg-2/40 p-3.5 sm:grid-cols-[minmax(120px,1fr)_minmax(0,2.6fr)]">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="text-[11px] font-medium tracking-wide text-fg-3 uppercase">Starts when</div>
                    <div className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1 text-[12.5px]">
                      <MessageSquare size={13} className="shrink-0 text-fg-3" />
                      You ask
                    </div>
                    {(a1?.schedules ?? []).map((s) => (
                      <div key={s.id} className={cx('flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1 text-[12.5px]', !s.enabled && 'opacity-60')}>
                        <CalendarClock size={13} className="shrink-0 text-fg-3" />
                        <span className="min-w-0 break-words">
                          {whenText(s.schedule)}
                          {s.enabled ? s.nextAt ? <span className="text-fg-3"> · next {untilText(s.nextAt)}</span> : null : <span className="text-fg-3"> · paused</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Team lead={a} kids={kidsOf(a)} act={act} pick={(id) => setPicked(id === picked ? null : id)} picked={picked} />
                </div>
              );
            })}
          </div>
          {sel && (
            <div className="rounded-2xl border border-line bg-panel p-4 lg:self-start">
              <Detail a={sel} act={act?.[sel.id]} all={all} space={space} />
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-fg-3">
        <span>Also offered here, from Everywhere:</span>
        {everywhere.slice(0, 8).map((a) => (
          <button key={a.id} type="button" onClick={() => go(`/agents/${enc(a.id)}`)} translate="no" className="rounded-md border border-line bg-bg-2 px-1.5 py-px text-fg-2 hover:text-fg">
            {a.name}
          </button>
        ))}
        {everywhere.length > 8 && <span>+ {everywhere.length - 8}</span>}
      </div>
    </div>
  );
}
