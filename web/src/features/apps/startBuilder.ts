// Starting a session with the App builder from the Apps pages, where the person has written what they want (the
// Describe box, "No app does that yet", Ask an agent to design it or to fix it): its page opens at once with their
// message, as the start page starts one, on the program, account and permissions they picked last, in a new task
// folder (an app built from scratch: in the folder of the web app made for it first). It thinks with its own tier (Best: the model Settings → Models → Tiers names for that program), as picking
// it on the start page does; a program without tiers keeps the model picked last. What was picked is left as it was.
// `more` is what the session is told besides (the kind of web app chosen on "What do you want to make?").
import type { SessionExtra } from '@shared/features';
import { tierProgram } from '@shared/tiers';
import { agentKey, lastAgent, startSettings } from '../../lib/start';
import { startSession } from '../../lib/starting';
import { post } from '../../lib/api';
import { toastError, useApp } from '../../lib/store';
import { useCatalog } from '../../components/AgentPickers';
import { useTierMap } from '../assistants/agentsState';
import { taskFolderFor } from '../assistants/start';
import { assistantIn, useAssistantsState } from '../assistants/state';

/** The built-in agent that makes apps (server/assistants/builtins.ts). */
export const APP_BUILDER = 'app-builder';

/**
 * What starts an App builder session with a message: `start(text)`. `plain`: an ordinary coding session (the agent as picked on the start page, no App
 * builder): a web app built from scratch. `make`: the web app of that name is made first, and the conversation works in its folder.
 */
export function useStartBuilder(): (prompt: string, extra?: SessionExtra, how?: { plain?: boolean; make?: string; placeholder?: boolean }) => void {
  const boot = useApp((s) => s.boot);
  const { agent, acp } = lastAgent();
  const cat = useCatalog(agent, acp ?? undefined);
  const tiers = useTierMap();
  const builder = assistantIn(useAssistantsState(), APP_BUILDER);
  return (prompt: string, more?: SessionExtra, how?: { plain?: boolean; make?: string; placeholder?: boolean }) => {
    const text = prompt.trim();
    if (!text) return;
    const run = startSettings().runs?.[agentKey(agent, acp)] ?? {};
    const prefs = cat?.prefs ?? {};
    // Its tier's model and effort for this program, else the model picked last (Codex's must be named: unnamed, it
    // takes config.toml's, which a ChatGPT sign-in may not allow).
    const prog = tierProgram(agent, acp ?? undefined);
    const pick = !how?.plain && builder?.tier && tiers && prog ? tiers[prog][builder.tier] : undefined;
    const model = pick?.model || ((run.model !== undefined ? run.model : prefs.model) ?? (agent === 'codex' ? (cat?.models.find((m) => m.isDefault)?.value ?? null) : null));
    const effort = pick?.model ? pick.effort : run.effort;
    // Permissions as picked last for this program, when it still offers them.
    const mode = run.mode && (!cat || cat.modes.some((m) => m.value === run.mode)) ? run.mode : (cat?.defaultMode ?? undefined);
    const account = (run.account !== undefined ? run.account : prefs.account) ?? '';
    const acct = boot?.accounts.some((a) => a.id === account && a.agent === agent) ? account : undefined;
    const acpName = agent === 'acp' ? boot?.acpAgents.find((a) => a.id === acp)?.name : undefined;
    // The app made first, once: a start that is tried again works in the same folder.
    let made: { id: string; folder: string } | null = null;
    const makeApp = async (name: string) => {
      if (made) return made;
      try {
        const r = await post<{ app: { id: string }; folder: string }>('/api/webapps/scratch', { name, ...(how?.placeholder ? { placeholder: true } : {}) });
        made = { id: r.app.id, folder: r.folder };
      } catch (e) {
        // Web apps are off here, or the folder could not be made: it is built as a project all the same, and said why.
        toastError(e);
      }
      return made;
    };
    startSession(
      { agent, acpName, title: text.slice(0, 300), text, atts: [], cwd: '' },
      async () => {
        const app = how?.make ? await makeApp(how.make) : null;
        const extra: SessionExtra = how?.plain ? { ...more } : { ...more, assistant: APP_BUILDER };
        return {
          agent,
          acpAgent: agent === 'acp' ? acp : undefined,
          prompt: text,
          model: model ?? undefined,
          effort: effort ?? undefined,
          mode: mode ?? undefined,
          account: acct,
          cwd: app?.folder ?? (await taskFolderFor(text)),
          extra: app && extra.webKind ? { ...extra, webKind: { ...extra.webKind, app: app.id } } : extra,
        };
      },
      // Should it not start, the start page's box gets the words back.
      { text, files: [], extra: {}, from: '' },
    );
  };
}
