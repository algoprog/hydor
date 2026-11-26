// Asking the agent from a web app's pages: a session starts in the app's own project (its folder, its web developer agent) with the
// message already written, as other pages start one (a page's "Ask the agent", a document's "Turn it into"). The page opens at once.
import type { WebApp } from '@shared/webapps';
import { useAskRun } from '../guide/ask';
import { startMaking } from '../pages/types/start';
import { useSpaces } from '../spaces/state';

/** `ask(message)` starts the session for `app`: in its project when it has one (it should), else in a new task folder. */
export function useAskAgent(app: Pick<WebApp, 'project' | 'folder'>): (message: string) => void {
  const run = useAskRun();
  const spaces = useSpaces();
  return (message: string) => {
    const text = message.trim();
    if (!text) return;
    const sp = app.project ? spaces?.find((s) => s.id === app.project) : undefined;
    startMaking(run, { prompt: text, space: sp ?? null });
  };
}
