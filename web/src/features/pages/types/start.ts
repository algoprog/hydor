// Starting the session that makes something new from the gallery (New's kind or words, Turn it into), as the start page
// starts one: its page opens at once with the short line while the server starts the agent and model picked last, in
// the project it goes in (its folder and assistant) or a new task folder, told in full what to make (`extra.make`; a
// LaTeX document or a notebook, which the gallery has no kinds of, by its message alone).
import type { MakeExtra } from '@shared/content-asks';
import { startSession } from '../../../lib/starting';
import { useApp } from '../../../lib/store';
import { taskFolderFor } from '../../assistants/start';
import type { AskRun } from '../../guide/ask';

/**
 * Starts the session that makes something new (New's kind, Turn it into): its page opens at once with the short line
 * while the server starts the agent picked last, in the project given (its folder and assistant) or a new task folder.
 * Should it not start, the start page's box gets the line back (what it was asked to make stays out of it).
 */
export function startMaking(run: AskRun, o: { prompt: string; make?: MakeExtra; space?: { id: string; folder: string; assistant?: string } | null }) {
  const sp = o.space ?? null;
  const acpName = run.agent === 'acp' ? useApp.getState().boot?.acpAgents.find((a) => a.id === run.acp)?.name : undefined;
  startSession(
    { agent: run.agent, acpName, title: o.prompt.slice(0, 300), text: o.prompt, atts: [], cwd: sp?.folder ?? '' },
    async () => ({
      agent: run.agent,
      acpAgent: run.agent === 'acp' ? run.acp : undefined,
      prompt: o.prompt,
      model: run.model ?? undefined,
      account: run.account,
      cwd: sp ? sp.folder : await taskFolderFor(o.prompt),
      extra: { ...(o.make ? { make: o.make } : {}), ...(sp ? { space: sp.id, ...(sp.assistant ? { assistant: sp.assistant } : {}) } : {}) },
    }),
    { text: o.prompt, files: [], extra: {}, from: '' },
  );
}
