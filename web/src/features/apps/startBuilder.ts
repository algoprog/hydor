// Starting a session with the App builder from the Apps pages, where the person has written what they want (the
// Describe box, "No app does that yet", Ask an agent to design it or to fix it): its page opens at once with their
// message, as the start page starts one, on the program, account and permissions they picked last, in a new task
// folder. It thinks with its own tier (Best: the model Settings → Models → Tiers names for that program), as picking
// it on the start page does; a program without tiers keeps the model picked last. What was picked is left as it was.
import { tierProgram } from '@shared/tiers';
import { agentKey, lastAgent, startSettings } from '../../lib/start';
import { startSession } from '../../lib/starting';
import { useApp } from '../../lib/store';
import { useCatalog } from '../../components/AgentPickers';
import { useTierMap } from '../assistants/agentsState';
import { taskFolderFor } from '../assistants/start';
import { assistantIn, useAssistantsState } from '../assistants/state';

/** The built-in agent that makes apps (server/assistants/builtins.ts). */
export const APP_BUILDER = 'app-builder';

/** What starts an App builder session with a message: `start(text)`. */
export function useStartBuilder(): (prompt: string) => void {
  const boot = useApp((s) => s.boot);
  const { agent, acp } = lastAgent();
  const cat = useCatalog(agent, acp ?? undefined);
  const tiers = useTierMap();
  const builder = assistantIn(useAssistantsState(), APP_BUILDER);
  return (prompt: string) => {
    const text = prompt.trim();
    if (!text) return;
    const run = startSettings().runs?.[agentKey(agent, acp)] ?? {};
    const prefs = cat?.prefs ?? {};
    // Its tier's model and effort for this program, else the model picked last (Codex's must be named: unnamed, it
    // takes config.toml's, which a ChatGPT sign-in may not allow).
    const prog = tierProgram(agent, acp ?? undefined);
    const pick = builder?.tier && tiers && prog ? tiers[prog][builder.tier] : undefined;
    const model = pick?.model || ((run.model !== undefined ? run.model : prefs.model) ?? (agent === 'codex' ? (cat?.models.find((m) => m.isDefault)?.value ?? null) : null));
    const effort = pick?.model ? pick.effort : run.effort;
    // Permissions as picked last for this program, when it still offers them.
    const mode = run.mode && (!cat || cat.modes.some((m) => m.value === run.mode)) ? run.mode : (cat?.defaultMode ?? undefined);
    const account = (run.account !== undefined ? run.account : prefs.account) ?? '';
    const acct = boot?.accounts.some((a) => a.id === account && a.agent === agent) ? account : undefined;
    const acpName = agent === 'acp' ? boot?.acpAgents.find((a) => a.id === acp)?.name : undefined;
    startSession(
      { agent, acpName, title: text.slice(0, 300), text, atts: [], cwd: '' },
      async () => ({
        agent,
        acpAgent: agent === 'acp' ? acp : undefined,
        prompt: text,
        model: model ?? undefined,
        effort: effort ?? undefined,
        mode: mode ?? undefined,
        account: acct,
        cwd: await taskFolderFor(text),
        extra: { assistant: APP_BUILDER },
      }),
      // Should it not start, the start page's box gets the words back.
      { text, files: [], extra: {}, from: '' },
    );
  };
}
