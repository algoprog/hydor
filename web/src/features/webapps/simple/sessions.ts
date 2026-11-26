// The conversations about a web app: whether its agent is at work or waiting, what they have cost when Hydor knows it,
// and carrying on with the newest one (a new one only when there is none).
import { useMemo } from 'react';
import type { SessionSummary } from '@shared/types';
import type { WebApp } from '@shared/webapps';
import { enc, post } from '../../../lib/api';
import { openSession } from '../../../lib/nav';
import { toastError, useSessions } from '../../../lib/store';
import { useAskAgent } from '../ask';

type App = Pick<WebApp, 'id' | 'folder' | 'project'>;

/** The app's own conversations, the newest first. */
export const appSessions = (all: SessionSummary[], app: App): SessionSummary[] =>
  all
    .filter((s) => !s.subagentOf && !s.archived && (s.extra?.webKind?.app === app.id || (!!app.project && s.extra?.space === app.project) || s.cwd === app.folder))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

export interface SessionFacts {
  working: boolean;
  /** The session that waits for an answer, if one does. */
  waiting: string | null;
  costUsd: number;
  latest: SessionSummary | null;
}

export function factsOf(list: SessionSummary[]): SessionFacts {
  const waiting = list.find((s) => (s.live?.pendingApprovals ?? 0) > 0);
  return {
    working: list.some((s) => s.live?.status === 'working' || s.live?.status === 'starting' || !!s.helpers),
    waiting: waiting?.key ?? null,
    costUsd: list.reduce((n, s) => n + (s.stats?.costUsd ?? 0), 0),
    latest: list[0] ?? null,
  };
}

export function useAppSessions(app: App): SessionFacts {
  const byKey = useSessions((s) => s.byKey);
  const list = useMemo(() => appSessions(Object.values(byKey), app), [byKey, app]);
  return useMemo(() => factsOf(list), [list]);
}

/**
 * Says something to the app's agent: in its newest conversation, which opens (`stay`: the page stays), or in a new one
 * in the app's project when it has none that can be written to.
 */
export function useContinue(app: App & Pick<WebApp, 'project'>): (text: string, stay?: boolean) => Promise<void> {
  const ask = useAskAgent(app);
  const facts = useAppSessions(app);
  return async (text, stay) => {
    const s = facts.latest;
    if (!s || s.external) return ask(text);
    try {
      await post(`/api/sessions/${enc(s.key)}/message`, { text });
      if (!stay) openSession(s.key);
    } catch (e) {
      toastError(e);
    }
  };
}
