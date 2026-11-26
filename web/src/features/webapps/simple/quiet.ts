// Which conversations are shown the quiet way: one started to make or change a web app, with Technical details off. A
// conversation that is about other things as well (a project's own, say) is left as it is.
import type { SessionSummary } from '@shared/types';
import { useSessions, useUI } from '../../../lib/store';

export const isWebConversation = (s: Pick<SessionSummary, 'extra' | 'subagentOf'> | undefined): boolean => !!s?.extra?.webKind && !s.subagentOf;

export function useQuietWork(sessionKey: string): boolean {
  const technical = useUI((s) => s.technicalDetails);
  const web = useSessions((s) => isWebConversation(s.byKey[sessionKey]));
  return web && !technical;
}
