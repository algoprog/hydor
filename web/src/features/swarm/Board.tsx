// A swarm's board: its members (what each is doing, a way in, Stop) and what they posted, newest first, with
// the findings and the questions a tap away. A campaign's board has its parts beside the posts instead: each
// part with how it stands and the member on it, and the members working now. It follows the posts as they come.
import { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Circle, CircleCheck, CircleDashed, CircleX, Square } from 'lucide-react';
import { partsTally, swarmMode, type CampaignPart, type PartStatus, type SwarmKind, type SwarmPost } from '@shared/swarm';
import type { SessionSummary } from '@shared/types';
import { AgentIcon } from '../../components/AgentIcon';
import { Markdown } from '../../components/Markdown';
import { Badge, Button, cx, Dialog, Segmented } from '../../components/ui';
import { activityOf, isBusy } from '../../lib/activity';
import { enc, post } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { toastError, useSessions } from '../../lib/store';
import { ActivityText, StatusDot } from '../sessions/SessionList';
import { loadBoard, useBoards } from './state';

const KIND: Record<SwarmKind, { label: string; tone: 'neutral' | 'ok' | 'err' | 'warn' | 'info' }> = {
  progress: { label: 'Progress', tone: 'neutral' },
  finding: { label: 'Finding', tone: 'ok' },
  question: { label: 'Question', tone: 'warn' },
  note: { label: 'Note', tone: 'info' },
  plan: { label: 'Plan', tone: 'info' },
  done: { label: 'Done', tone: 'ok' },
  failed: { label: 'Failed', tone: 'err' },
};

const PART: Record<PartStatus, { label: string; tone: 'neutral' | 'ok' | 'err' | 'info'; icon: typeof Circle; color: string }> = {
  waiting: { label: 'Waiting', tone: 'neutral', icon: CircleDashed, color: 'text-fg-3' },
  working: { label: 'Working', tone: 'info', icon: Circle, color: 'text-info' },
  done: { label: 'Done', tone: 'ok', icon: CircleCheck, color: 'text-ok' },
  failed: { label: 'Failed', tone: 'err', icon: CircleX, color: 'text-err' },
};

/** The members of a swarm, oldest first, as the sessions list knows them. */
export function useMembers(swarm: string): SessionSummary[] {
  const byKey = useSessions((x) => x.byKey);
  return Object.values(byKey)
    .filter((s) => s.extra?.parent === swarm)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.key.localeCompare(b.key));
}

export const stopSwarm = (swarm: string, member?: string) => post(`/api/swarm/${enc(swarm)}/stop`, member ? { member } : {}).catch(toastError);

function MemberRow({ s, stopped, onOpen }: { s: SessionSummary; stopped: boolean; onOpen: () => void }) {
  const a = activityOf(s);
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-bg-2">
      <span className="relative shrink-0">
        <AgentIcon agent={s.agent} name={s.acpName} size={15} spinning={isBusy(a)} />
        <StatusDot s={s} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-elevated" />
      </span>
      <span className="min-w-0 flex-1">
        <span translate="no" className="block truncate text-[13.5px] text-fg">
          {s.title}
        </span>
        <span className="flex min-w-0 text-[12px] text-fg-3">{a ? <ActivityText s={s} className="min-w-0" /> : <span>{stopped ? 'Stopped' : s.live?.error ? 'Stopped with an error' : 'Finished its turn'}</span>}</span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-fg-3" />
    </button>
  );
}

/** A part of a campaign: how it stands, the latest word on it, and its member a tap away. */
function PartRow({ p, member, onOpen }: { p: CampaignPart; member?: SessionSummary; onOpen?: () => void }) {
  const look = PART[p.status];
  const busy = !!member && isBusy(activityOf(member));
  const label = p.status === 'working' && p.tries ? 'Trying again' : p.status === 'failed' && p.tries > 1 ? `Failed ${p.tries} times` : look.label;
  const inside = (
    <>
      <look.icon size={15} className={cx('mt-0.5 shrink-0', look.color)} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span translate="no" className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg">
            {p.name}
          </span>
          <Badge tone={look.tone}>{label}</Badge>
        </span>
        {busy ? (
          <span className="mt-0.5 flex min-w-0 text-[12px] text-fg-3">
            <ActivityText s={member!} className="min-w-0" />
          </span>
        ) : p.note ? (
          <span translate="no" className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg-3">
            {p.note}
          </span>
        ) : null}
      </span>
      {onOpen && <ChevronRight size={15} className="mt-0.5 shrink-0 text-fg-3" />}
    </>
  );
  const row = 'flex w-full items-start gap-2.5 px-3 py-2 text-left';
  return onOpen ? (
    <button type="button" onClick={onOpen} className={cx(row, 'transition-colors hover:bg-bg-2')}>
      {inside}
    </button>
  ) : (
    <div className={row}>{inside}</div>
  );
}

function PostRow({ p, name }: { p: SwarmPost; name: (key: string) => string }) {
  const k = KIND[p.kind] ?? KIND.note;
  return (
    <div className="py-2.5">
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
        {/* A member by its title (theirs, as written); the lead by the word for it. */}
        <span translate={p.from === p.swarm ? undefined : 'no'} className="min-w-0 truncate font-medium text-fg-2">
          {name(p.from)}
        </span>
        {p.to && (
          <>
            <ArrowRight size={11} className="shrink-0" />
            <span translate={p.to === p.swarm ? undefined : 'no'} className="min-w-0 truncate">
              {name(p.to)}
            </span>
          </>
        )}
        <Badge tone={k.tone}>{k.label}</Badge>
        {p.part && (
          <span translate="no" className="min-w-0 truncate font-mono text-[11.5px]">
            {p.part}
          </span>
        )}
        <span className="ml-auto shrink-0 pl-2">{timeAgo(p.at)}</span>
      </div>
      <Markdown text={p.text} breaks className="mt-1 text-[13.5px] leading-relaxed" />
      {p.parts?.length ? (
        <p translate="no" className="mt-1 line-clamp-3 font-mono text-[11.5px] leading-relaxed text-fg-3">
          {p.parts.join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

/** The posts, newest first, with the findings and the questions a tap away. */
function Posts({ swarm, name }: { swarm: string; name: (key: string) => string }) {
  const b = useBoards((x) => x.byKey[swarm]);
  const [filter, setFilter] = useState<'all' | 'finding' | 'question'>('all');
  const posts = (b?.posts ?? []).filter((p) => filter === 'all' || p.kind === filter).reverse();
  return (
    <section className="min-w-0">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-[12.5px] font-medium text-fg-3">Posts{b ? ` · ${b.posts.length}` : ''}</h3>
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'finding', label: 'Findings' },
            { value: 'question', label: 'Questions' },
          ]}
        />
      </div>
      {posts.length ? (
        <div className="divide-y divide-line">
          {posts.map((p) => (
            <PostRow key={p.id} p={p} name={name} />
          ))}
        </div>
      ) : (
        <p className="py-3 text-[12.5px] text-fg-3">{!b ? 'Loading…' : filter === 'all' ? 'Nothing posted yet. Members post what they try and find as they go.' : 'None of these yet.'}</p>
      )}
    </section>
  );
}

export function BoardDialog({ swarm, open, onClose }: { swarm: string; open: boolean; onClose: () => void }) {
  const b = useBoards((x) => x.byKey[swarm]);
  const byKey = useSessions((x) => x.byKey);
  const members = useMembers(swarm);
  const campaign = (b?.mode ?? swarmMode(byKey[swarm]?.extra)) === 'campaign';
  useEffect(() => {
    if (open) loadBoard(swarm);
  }, [open, swarm]);
  const working = members.filter((m) => isBusy(activityOf(m)));
  const name = (k: string) => (k === swarm ? 'Lead' : (byKey[k]?.title ?? 'Member'));
  const go = (k: string) => {
    onClose();
    openSession(k);
  };
  const stopAll = working.length > 0 && (
    <Button size="sm" variant="ghost" icon={<Square size={12} />} onClick={() => stopSwarm(swarm)}>
      Stop all
    </Button>
  );
  const openLead = (
    <button type="button" onClick={() => go(swarm)} className="mt-1.5 text-[12.5px] font-medium text-accent hover:underline">
      Open the lead
    </button>
  );

  if (campaign) {
    const parts = b?.parts ?? [];
    const n = partsTally(parts);
    return (
      <Dialog open={open} onClose={onClose} title="Campaign board" width={900}>
        <div className="grid grid-cols-1 gap-5 pb-2 md:grid-cols-2 md:gap-6">
          <div className="min-w-0 space-y-5">
            <section>
              <div className="mb-1.5 flex items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg-3">
                  {!parts.length ? 'Parts' : n.failed ? `Parts · ${n.done} of ${n.total} done · ${n.failed} failed` : `Parts · ${n.done} of ${n.total} done`}
                </h3>
                {stopAll}
              </div>
              {parts.length ? (
                <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {parts.map((p) => (
                    <PartRow key={p.name} p={p} member={p.member ? byKey[p.member] : undefined} onOpen={p.member && byKey[p.member] ? () => go(p.member!) : undefined} />
                  ))}
                </div>
              ) : (
                <p className="text-[12.5px] text-fg-3">{!b ? 'Loading…' : 'None yet: the lead posts its plan once it has split the change into parts.'}</p>
              )}
            </section>
            {working.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-[12.5px] font-medium text-fg-3">{b ? `Working now · ${working.length} of ${b.size} at most` : `Working now · ${working.length}`}</h3>
                <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {working.map((m) => (
                    <MemberRow key={m.key} s={m} stopped={!!b?.stopped.includes(m.key)} onOpen={() => go(m.key)} />
                  ))}
                </div>
              </section>
            )}
            {openLead}
          </div>
          <Posts swarm={swarm} name={name} />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title="Swarm board" width={680}>
      <div className="space-y-5 pb-2">
        <section>
          <div className="mb-1.5 flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg-3">
              Members{b ? ` · ${working.length} working, ${b.size} at most` : ''}
            </h3>
            {stopAll}
          </div>
          {members.length ? (
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {members.map((m) => (
                <MemberRow key={m.key} s={m} stopped={!!b?.stopped.includes(m.key)} onOpen={() => go(m.key)} />
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-fg-3">None yet: the lead starts them once it has chosen its angles.</p>
          )}
          {openLead}
        </section>
        <Posts swarm={swarm} name={name} />
      </div>
    </Dialog>
  );
}
