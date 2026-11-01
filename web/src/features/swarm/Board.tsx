// A swarm's board: its members (what each is doing, a way in, Stop) and what they posted, newest first, with
// the findings and the questions a tap away. It follows the posts as they come.
import { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Square } from 'lucide-react';
import type { SwarmKind, SwarmPost } from '@shared/swarm';
import type { SessionSummary } from '@shared/types';
import { AgentIcon } from '../../components/AgentIcon';
import { Markdown } from '../../components/Markdown';
import { Badge, Button, Dialog, Segmented } from '../../components/ui';
import { activityOf, isBusy } from '../../lib/activity';
import { enc, post } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { toastError, useSessions } from '../../lib/store';
import { ActivityText, StatusDot } from '../sessions/SessionList';
import { loadBoard, useBoards } from './state';

const KIND: Record<SwarmKind, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'info' }> = {
  progress: { label: 'Progress', tone: 'neutral' },
  finding: { label: 'Finding', tone: 'ok' },
  question: { label: 'Question', tone: 'warn' },
  note: { label: 'Note', tone: 'info' },
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
        <span className="block truncate text-[13.5px] text-fg">{s.title}</span>
        <span className="flex min-w-0 text-[12px] text-fg-3">{a ? <ActivityText s={s} className="min-w-0" /> : <span>{stopped ? 'Stopped' : s.live?.error ? 'Stopped with an error' : 'Finished its turn'}</span>}</span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-fg-3" />
    </button>
  );
}

function PostRow({ p, name }: { p: SwarmPost; name: (key: string) => string }) {
  const k = KIND[p.kind] ?? KIND.note;
  return (
    <div className="py-2.5">
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
        <span className="min-w-0 truncate font-medium text-fg-2">{name(p.from)}</span>
        {p.to && (
          <>
            <ArrowRight size={11} className="shrink-0" />
            <span className="min-w-0 truncate">{name(p.to)}</span>
          </>
        )}
        <Badge tone={k.tone}>{k.label}</Badge>
        <span className="ml-auto shrink-0 pl-2">{timeAgo(p.at)}</span>
      </div>
      <Markdown text={p.text} breaks className="mt-1 text-[13.5px] leading-relaxed" />
    </div>
  );
}

export function BoardDialog({ swarm, open, onClose }: { swarm: string; open: boolean; onClose: () => void }) {
  const b = useBoards((x) => x.byKey[swarm]);
  const byKey = useSessions((x) => x.byKey);
  const members = useMembers(swarm);
  const [filter, setFilter] = useState<'all' | 'finding' | 'question'>('all');
  useEffect(() => {
    if (open) loadBoard(swarm);
  }, [open, swarm]);
  const working = members.filter((m) => isBusy(activityOf(m)));
  const name = (k: string) => (k === swarm ? 'Lead' : (byKey[k]?.title ?? 'Member'));
  const posts = (b?.posts ?? []).filter((p) => filter === 'all' || p.kind === filter).reverse();
  const go = (k: string) => {
    onClose();
    openSession(k);
  };
  return (
    <Dialog open={open} onClose={onClose} title="Swarm board" width={680}>
      <div className="space-y-5 pb-2">
        <section>
          <div className="mb-1.5 flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg-3">
              Members{b ? ` · ${working.length} working, ${b.size} at most` : ''}
            </h3>
            {working.length > 0 && (
              <Button size="sm" variant="ghost" icon={<Square size={12} />} onClick={() => stopSwarm(swarm)}>
                Stop all
              </Button>
            )}
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
          <button type="button" onClick={() => go(swarm)} className="mt-1.5 text-[12.5px] font-medium text-accent hover:underline">
            Open the lead
          </button>
        </section>
        <section>
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
      </div>
    </Dialog>
  );
}
