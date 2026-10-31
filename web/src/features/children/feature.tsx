// Child sessions: an agent hands parts of a job to new sessions (any agent or model here), and their
// replies come back to it. A card for each in the parent's conversation, children folded under their
// parent in the sidebar, a line in a child pointing back to its parent, and Settings → Child sessions.
import { useEffect, useState } from 'react';
import { CornerDownRight, Minus, Network, Plus } from 'lucide-react';
import { MAX_RUNNING_LIMIT, type ChildSettings } from '@shared/children';
import type { SessionSummary } from '@shared/types';
import { IconButton, Section } from '../../components/ui';
import { api, put } from '../../lib/api';
import { openSession } from '../../lib/nav';
import { toastError, useSessions } from '../../lib/store';
import type { WebFeature } from '../registry';
import { ChildCard } from './ChildCard';

/** In a child session, above the message box: where its replies go. */
function ParentDock({ s }: { s: SessionSummary }) {
  const parent = typeof s.extra?.parent === 'string' ? s.extra.parent : undefined;
  const p = useSessions((x) => (parent ? x.byKey[parent] : undefined));
  if (!parent) return null;
  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-1.5 text-[12.5px] sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]">
      <CornerDownRight size={14} className="shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1 truncate text-fg-2">
        Child of <span className="text-fg">{p?.title ?? 'another session'}</span>
        <span className="max-sm:hidden">: its replies go back there</span>
      </span>
      {p && (
        <button type="button" onClick={() => openSession(parent)} className="shrink-0 font-medium text-accent hover:underline">
          Open parent
        </button>
      )}
    </div>
  );
}

function ChildSettingsBody() {
  const [st, setSt] = useState<ChildSettings | null>(null);
  useEffect(() => {
    api<ChildSettings>('/api/children/settings')
      .then(setSt)
      .catch(() => {});
  }, []);
  const set = (n: number) =>
    put<ChildSettings>('/api/children/settings', { maxRunning: n })
      .then(setSt)
      .catch(toastError);
  return (
    <Section title="Child sessions" sub="An agent can hand parts of a job to new sessions, with any agent or model here. They work at the same time, and each one's reply comes back to it.">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-1">
        <div className="min-w-[200px] flex-1">
          <div className="text-[13.5px] text-fg">Working at once, per session</div>
          <div className="mt-0.5 text-[12px] leading-snug text-fg-3">The agent waits for one to finish before it starts more.</div>
        </div>
        {st && (
          <div className="flex items-center gap-1 rounded-[10px] bg-bg-2 p-0.5">
            <IconButton size="sm" label="Fewer" disabled={st.maxRunning <= 1} onClick={() => set(st.maxRunning - 1)}>
              <Minus size={14} />
            </IconButton>
            <span className="tnum w-6 text-center text-[13.5px] font-medium">{st.maxRunning}</span>
            <IconButton size="sm" label="More" disabled={st.maxRunning >= MAX_RUNNING_LIMIT} onClick={() => set(st.maxRunning + 1)}>
              <Plus size={14} />
            </IconButton>
          </div>
        )}
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] leading-snug text-fg-3">
        <li>One level: a child session cannot start children of its own.</li>
        <li>A child never gets a freer mode than the session that started it.</li>
        <li>A session with a spending cap gives each child a share of what is left, and its cap covers them all.</li>
      </ul>
    </Section>
  );
}

export const childrenFeature: WebFeature = {
  id: 'children',
  noteViews: { child: ChildCard },
  SessionDock: ParentDock,
  settings: [{ id: 'children', label: 'Child sessions', icon: Network, sub: 'Agents handing parts of a job to other agents', Body: ChildSettingsBody }],
};
