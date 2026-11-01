// Usage → Arena: which models win on your own tasks, by their rating over the matches you decided (each
// answer you kept beat the others in its match), and the matches lately, decided or still open.
import { useCallback, useEffect, useState } from 'react';
import { Swords } from 'lucide-react';
import type { ArenaState } from '@shared/arena';
import { AgentIcon } from '../../components/AgentIcon';
import { Badge, Empty, Throbber } from '../../components/ui';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { useContenderName } from './names';

export function ArenaBoard() {
  const [st, setSt] = useState<ArenaState | null>(null);
  const name = useContenderName();
  const load = useCallback(() => void api<ArenaState>('/api/arena').then(setSt, toastError), []);
  useEffect(load, [load]);
  useFeatureEvent('arena', load);
  if (!st)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  if (!st.matches.length)
    return (
      <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-6">
        <Empty icon={<Swords size={22} />} title="No matches yet">
          On the start page, Options → Arena sends your prompt to one or two more models as well. Keep the best answer, and over time this shows which models win on your own tasks.
        </Empty>
      </div>
    );
  const decided = st.matches.filter((m) => m.winner).length;
  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6 sm:px-6">
      <section>
        <h2 className="mb-2 text-[13px] font-semibold">Which models win on your tasks</h2>
        {st.board.length ? (
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-bg-1 text-left text-[12px] text-fg-3">
                <tr>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-medium">Rating</th>
                  <th className="px-3 py-2 text-right font-medium">Kept</th>
                  <th className="px-3 py-2 text-right font-medium max-sm:hidden">Win rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {st.board.map((s, i) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="tnum w-4 shrink-0 text-fg-3">{i + 1}</span>
                        <AgentIcon agent={s.agent} size={14} name={s.acpAgent === 'console' ? 'Custom' : undefined} />
                        <span className="min-w-0 truncate">{name(s)}</span>
                      </span>
                    </td>
                    <td className="tnum px-3 py-2 text-right font-medium">{s.rating}</td>
                    <td className="tnum px-3 py-2 text-right text-fg-2">
                      {s.wins} of {s.played}
                    </td>
                    <td className="tnum px-3 py-2 text-right text-fg-2 max-sm:hidden">{s.played ? `${Math.round((s.wins / s.played) * 100)}%` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-[13px] text-fg-3">Keep an answer in a match to start the board.</div>
        )}
        <div className="mt-1.5 text-[12px] text-fg-3">
          From {decided} match{decided === 1 ? '' : 'es'} you decided: the answer you kept beat the others in its match (an Elo rating, from 1000).
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-[13px] font-semibold">Matches</h2>
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {st.matches.map((m) => {
            const w = m.entries.find((e) => e.key === m.winner);
            return (
              <button key={m.id} type="button" onClick={() => go(`/arena/${m.id}`)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{m.prompt || 'A match'}</span>
                  <span className="block truncate text-[12px] text-fg-3">
                    {m.entries.map((e) => name(e)).join(' vs ')} · {timeAgo(m.createdAt)}
                  </span>
                </span>
                {w ? <Badge tone="ok">{name(w).split(' · ').pop()}</Badge> : <Badge>Open</Badge>}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
