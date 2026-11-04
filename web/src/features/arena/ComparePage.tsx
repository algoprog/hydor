// A match's answers side by side: each model's latest reply as it comes, and Keep this one. The kept one
// wins and stays; the others are archived (still there to look at). Usage → Arena shows the board.
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowUpRight, Check, Swords } from 'lucide-react';
import type { ArenaMatch, ArenaEntry } from '@shared/arena';
import type { TimelineItem } from '@shared/types';
import { AgentIcon } from '../../components/AgentIcon';
import { ReplyMarkdown } from '../../components/Markdown';
import { Badge, Button, cx, Throbber } from '../../components/ui';
import { activityOf, isBusy } from '../../lib/activity';
import { api, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go, openSession } from '../../lib/nav';
import { toastError, useSessions, useTimeline } from '../../lib/store';
import { live } from '../../lib/ws';
import { PageHeader } from '../layout/PageHeader';
import { useContenderName } from './names';

/** The latest turn's reply: the agent's texts after the last message of yours. */
function lastReply(items: TimelineItem[] | undefined): string {
  if (!items?.length) return '';
  let i = items.length - 1;
  while (i >= 0 && items[i].kind !== 'user') i--;
  return items
    .slice(i + 1)
    .filter((it): it is Extract<TimelineItem, { kind: 'assistant' }> => it.kind === 'assistant')
    .map((it) => it.text)
    .join('\n\n')
    .trim();
}

function Column({ e, m, onKeep }: { e: ArenaEntry; m: ArenaMatch; onKeep: () => void }) {
  const name = useContenderName();
  const s = useSessions((x) => x.byKey[e.key]);
  const items = useTimeline((x) => x.byKey[e.key]?.items);
  useEffect(() => {
    void useTimeline.getState().load(e.key);
    return live.sub(e.key);
  }, [e.key]);
  const reply = lastReply(items);
  const busy = isBusy(activityOf(s));
  const kept = m.winner === e.key;
  return (
    <section className={cx('flex min-h-0 min-w-0 flex-col rounded-xl border bg-panel', kept ? 'border-accent/60' : 'border-line')}>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <AgentIcon agent={e.agent} size={15} name={e.acpAgent === 'console' ? 'Custom' : s?.acpName} spinning={busy} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name(e)}</span>
        {kept ? <Badge tone="ok">Kept</Badge> : m.winner ? <Badge>Archived</Badge> : busy ? <span className="text-[11.5px] text-fg-3">working…</span> : null}
      </header>
      <div className="min-h-[160px] flex-1 overflow-y-auto px-3 py-2 md:max-h-[calc(100dvh-230px)]">
        {reply ? <ReplyMarkdown text={reply} /> : <div className="flex h-24 items-center justify-center text-fg-3">{busy || !items ? <Throbber size={20} /> : 'No answer yet'}</div>}
      </div>
      <footer className="flex items-center gap-2 border-t border-line px-3 py-2">
        {!m.winner && (
          <Button size="sm" icon={<Check size={14} />} disabled={!reply} onClick={onKeep}>
            Keep this one
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<ArrowUpRight size={14} />} onClick={() => openSession(e.key)}>
          {kept ? 'Go on here' : 'Open'}
        </Button>
      </footer>
    </section>
  );
}

export function ComparePage() {
  const [loc] = useLocation();
  const id = /^\/arena\/([a-z0-9]+)$/.exec(loc)?.[1] ?? '';
  const [m, setM] = useState<ArenaMatch | null>(null);
  const load = () => void api<ArenaMatch>(`/api/arena/${enc(id)}`).then(setM, toastError);
  useEffect(load, [id]);
  useFeatureEvent('arena', (e) => (e.data as { changed?: string })?.changed === id && load());
  const keep = async (key: string) => {
    try {
      setM(await post<ArenaMatch>(`/api/arena/${enc(id)}/winner`, { key }));
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Compare the answers"
        sub={m ? m.prompt.replace(/\s+/g, ' ').slice(0, 160) : 'Arena'}
        actions={
          <Button size="sm" variant="ghost" icon={<Swords size={14} />} onClick={() => go('/arena')}>
            <span className="max-sm:hidden">Which models win</span>
            <span className="sm:hidden">Board</span>
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!m ? (
          <div className="flex justify-center py-10 text-fg-3">
            <Throbber size={28} />
          </div>
        ) : (
          <div className={cx('mx-auto grid gap-3 px-3 py-4 sm:px-6', m.entries.length >= 3 ? 'max-w-[1500px] md:grid-cols-3' : 'max-w-[1100px] md:grid-cols-2')}>
            {m.entries.map((e) => (
              <Column key={e.key} e={e} m={m} onKeep={() => void keep(e.key)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
