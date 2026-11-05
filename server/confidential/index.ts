// Confidential sessions (shared/confidential.ts), enforced here and not only in the pages. A session started with
// Options → Confidential runs on Custom with a model on this computer or your private network, and nothing of it
// leaves this computer:
// - Starting one (sessions.create calls confidentialStart): Custom only, a local model (the best one installed when
//   none is named), memory off, no swarm, deep research or arena. A child of one is confidential too.
// - Each message (beforeSend) is refused while its model is not local, or not there; so is a switch to a model
//   elsewhere, a hand-off to another agent, and turning it off or memory on (it stays as it started).
// - Tools (allowTool): only those that work here (files, documents, the Library, knowledge bases, reading memory,
//   child sessions, the guide). Every other one is off, tools added later too, until they are named here.
// - Custom is told so (context), and its process (HYDOR_CONFIDENTIAL) leaves out its web_fetch and every MCP server
//   but the app's own, uses local models alone, and runs commands in the sandbox without network
//   (server/agent/sandbox.ts), or asks before each one where that cannot run.
// - Nothing is sent out about it: titles come from a local helper model or the first words, a child's long reply is
//   summed up the same way, Auto mode's checks and image descriptions use local models only, notices leave out its
//   words, share links can't be made, and agents in other sessions or elsewhere (app_api, /mcp) don't see it.
import { CONFIDENTIAL_EXTRA, firstWordsTitle, isConfidential } from '../../shared/confidential.ts';
import type { SessionExtra } from '../../shared/features.ts';
import type { AgentModel, NotifyEvent } from '../../shared/types.ts';
import { sandboxAvailable } from '../agent/sandbox.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { featureDeps } from '../features/registry.ts';
import type { Deps, Feature, RunCtx } from '../features/types.ts';
import { helper, helperSees, localHelper } from '../helper.ts';
import type { CreateOpts } from '../sessions.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { cleanTitle, TITLE_SYSTEM, wantsTitle } from '../titles.ts';

/** Whether the session with this key is confidential. */
export const confidentialKey = (db: DB, key: string | null | undefined): boolean => !!key && isConfidential(sessionExtra(db, key));

/** Runs started confidential, known before their session's settings are stored (a new session's first tool list). */
const runs = new Set<string>();

/** Whether a run of an agent is confidential. */
export const confidentialRun = (ctx: Pick<RunCtx, 'runId' | 'key' | 'deps'>): boolean => runs.has(ctx.runId) || confidentialKey(ctx.deps.db, ctx.key);

/**
 * The app's tools a confidential session keeps: they read and write on this computer, or show something in the
 * conversation. Every other tool is off in it (web search and pages, the browser, the screen, connected apps and
 * the vault, pictures, videos and sound, publishing, apps and app_api, scheduled tasks, saving to memory or to
 * skills, screenshots of pages and exports (a browser that would load what a page points to), second opinions,
 * experiments' runs…), and so is any tool added later until it is named here.
 */
export const CONFIDENTIAL_TOOLS = new Set([
  // Files and documents, read here.
  'read_document',
  'present_files',
  // The Library, on this computer.
  'show_html',
  'save_page',
  'get_page',
  'save_doc',
  'save_sheet',
  'save_slides',
  'save_latex',
  'save_notebook',
  // Knowledge bases, and memory to read (nothing new is saved).
  'knowledge_search',
  'knowledge_read',
  'knowledge_list',
  'recall',
  'search_sessions',
  'read_session',
  // Child sessions, confidential too.
  'start_child_session',
  'child_sessions',
  'message_child',
  // The app's guide, a form in the conversation, a notice (without the session's words).
  'app_guide',
  'ask_form',
  'notify_user',
  // A scheduled run's own report, and runs of experiments already made (reading, stopping).
  'list_tasks',
  'report_outcome',
  'task_notes',
  'experiment_list',
  'experiment_get',
  'experiment_table',
  'experiment_wait',
  'experiment_stop',
]);

// ---- the models -----------------------------------------------------------------------------------------

/** Where a model that is not local runs, in a few words. */
const elsewhere = (m: AgentModel) => (m.provider === 'openrouter' ? 'through OpenRouter' : m.provider === 'ollama' ? 'on Ollama’s cloud or another computer' : `at ${m.label.replace(/^.*\((.+)\)$/, '$1')}, outside your network`);

export const NO_LOCAL_MODEL = 'There is no model on this computer to run a confidential session. Install one in Settings → Models: the ones suggested for this computer install with one click.';

/** A model a confidential session may use now: one of Custom's, on this computer or your network. Throws why not. */
export function localModel(d: Pick<Deps, 'models'>, id: string | null | undefined): AgentModel {
  const all = d.models.agentModels();
  if (!id) {
    const best = d.models.localModels()[0];
    if (best) return best;
    throw new HttpError(409, NO_LOCAL_MODEL);
  }
  const m = all.find((x) => x.id === id);
  if (!m) throw new HttpError(409, `The model ${id} is not available now (is its server running?). A confidential session uses only models on this computer: start it again, or pick another one there.`);
  if (!m.local) throw new HttpError(409, `${m.label} runs ${elsewhere(m)}, and a confidential session uses only models on this computer or your own network. Pick one of those.`);
  return m;
}

// ---- starting, sending, switching --------------------------------------------------------------------

const OFF_AT_START: Record<'swarm' | 'research' | 'arena', string> = {
  swarm: 'Swarm is off in a confidential session: start it without one.',
  research: 'Deep research searches the web, so it is off in a confidential session.',
  arena: 'The arena sends your message to other models, so it is off in a confidential session.',
};

/**
 * A new session, before it starts: unchanged unless it is confidential, or the child of a confidential session
 * (then it is confidential too). It must run on Custom with a local model (the best one when none is named), with
 * memory off and without a swarm, a deep research or the arena. Throws why it can't start.
 */
export function confidentialStart(db: DB, o: CreateOpts, deps?: Pick<Deps, 'models'>): CreateOpts {
  const parent = typeof o.extra?.parent === 'string' ? o.extra.parent : undefined;
  const inherited = confidentialKey(db, parent);
  if (!isConfidential(o.extra) && !inherited) return o;
  // A child's replies go to its parent: a confidential one only to a confidential parent.
  if (parent && !inherited) throw new HttpError(400, 'A confidential session can’t be the child of one that isn’t: its replies would go there.');
  const d = deps ?? featureDeps();
  if (o.agent !== 'acp' || o.acpAgent !== CONSOLE_ID)
    throw new HttpError(
      400,
      inherited
        ? 'A child of a confidential session runs on this computer too: start it on Custom (agent "custom") with a model on this computer.'
        : 'A confidential session runs on Custom, the app’s own agent, with a model on this computer: pick Custom as the agent.',
    );
  for (const k of ['swarm', 'research', 'arena'] as const) if (o.extra?.[k]) throw new HttpError(400, OFF_AT_START[k]);
  const model = localModel(d, o.model || null);
  return { ...o, model: model.id, extra: { ...o.extra, ...CONFIDENTIAL_EXTRA } };
}

/** A confidential session's model may change only to another local one, and not to the agent's own default. */
export function checkModelSwitch(db: DB, key: string, model: string | null | undefined, deps?: Pick<Deps, 'models'>) {
  if (model === undefined || !confidentialKey(db, key)) return;
  if (!model) throw new HttpError(400, 'A confidential session keeps a model on this computer: pick one of those.');
  localModel(deps ?? featureDeps(), model);
}

/** A confidential session's conversation stays with its model: it can't be handed to another agent. */
export function checkHandoff(db: DB, key: string) {
  if (confidentialKey(db, key))
    throw new HttpError(400, 'A confidential session can’t continue in another agent: its conversation stays on this computer. Fork it to try another direction, or start a new session.');
}

/** What a fork or an edit of a session keeps of its settings: a confidential one stays confidential. */
export function carriedExtra(db: DB, key: string): SessionExtra | undefined {
  return confidentialKey(db, key) ? { ...CONFIDENTIAL_EXTRA } : undefined;
}

/**
 * A change to a session's settings (PATCH /api/sessions/:key/extra) is refused when it would turn Confidential on or
 * off after the start, or bring memory, a swarm, a deep research or the arena to a confidential session.
 */
export function checkExtraChange(db: DB, key: string, patch: Record<string, unknown>) {
  const now = confidentialKey(db, key);
  if ('confidential' in patch && (patch.confidential === true) !== now)
    throw new HttpError(
      400,
      now
        ? 'A confidential session stays confidential, so that what was said stays on this computer. Start a new session for work that may leave it.'
        : 'A session is confidential from its start: start a new one with Options → Confidential.',
    );
  if (!now) return;
  if ('memory' in patch && patch.memory !== false) throw new HttpError(400, 'Memory stays off in a confidential session: nothing it says is kept for other sessions.');
  for (const k of ['swarm', 'research', 'arena'] as const) if (patch[k]) throw new HttpError(400, OFF_AT_START[k]);
}

// ---- what is said about it ---------------------------------------------------------------------------------

/**
 * A title for a confidential session that starts with `request`: from the helper model when it runs on this
 * computer, else (or when it gives none) the request's first words. Never from a model elsewhere.
 */
export async function confidentialTitle(db: DB, request: string, ask: typeof helper = helper): Promise<string | null> {
  const text = request.trim().slice(0, 4000);
  const words = firstWordsTitle(text);
  const model = localHelper(db);
  if (!model || !wantsTitle(text)) return words;
  try {
    return cleanTitle(await ask(db, { system: TITLE_SYSTEM, prompt: `<message>\n${text}\n</message>`, maxTokens: 40, timeoutMs: 60_000, model })) ?? words;
  } catch {
    return words;
  }
}

/**
 * The model that may sum up or check a confidential session's words: the helper model when it runs here, else the
 * session's own (local) model, else none. `sees`: one that looks at images (the session's own is no use then).
 */
export function privateHelper(d: Pick<Deps, 'db' | 'sessions'>, key: string, o: { sees?: boolean } = {}): string | null {
  const h = localHelper(d.db);
  if (h && (!o.sees || helperSees(d.db, h))) return h;
  if (o.sees) return null;
  const s = d.sessions.summary(key);
  return s?.live?.model ?? s?.model ?? null;
}

const NOTICE: Record<NotifyEvent['kind'], string> = { done: 'Finished', waiting: 'Needs you', failed: 'Failed' };

/**
 * A notice about a session, as it may leave this computer (a push to a phone goes through its maker's service) or
 * show on a screen: a confidential session's says only that a confidential session finished, needs you or failed,
 * without its title, words or what it asks.
 */
export function privateNotice(db: DB, n: NotifyEvent): NotifyEvent {
  if (!confidentialKey(db, n.key)) return n;
  const { approval: _a, ...rest } = n;
  return { ...rest, title: 'A confidential session', body: NOTICE[n.kind] };
}

// ---- other agents --------------------------------------------------------------------------------------------

const SESSION_KEY = /(?:claude|codex|acp):[A-Za-z0-9._-]{4,80}/g;

/** The confidential sessions an address names (a path or query of the app's API), if any. */
export function confidentialIn(db: DB, url: string): string[] {
  let u = url;
  try {
    u = decodeURIComponent(url);
  } catch {}
  return [...new Set(u.match(SESSION_KEY) ?? [])].filter((k) => confidentialKey(db, k));
}

export const NOT_FROM_HERE = 'That session is confidential: agents in other sessions can’t read or change it.';

/**
 * What the app's API gave an agent outside a confidential session, without confidential sessions: items of a list
 * that are one (or belong to one, by their key or session) are left out, whatever their depth.
 */
export function withoutConfidential<T>(db: DB, json: T): T {
  const seen = new Map<string, boolean>();
  const conf = (k: unknown) => {
    if (typeof k !== 'string' || !/^(claude|codex|acp):/.test(k)) return false;
    let v = seen.get(k);
    if (v === undefined) seen.set(k, (v = confidentialKey(db, k)));
    return v;
  };
  const mine = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x) && ['key', 'sessionKey', 'session_key', 'parent'].some((f) => conf((x as Record<string, unknown>)[f]));
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.filter((y) => !mine(y)).map(walk);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, v]) => [k, walk(v)]));
    return x;
  };
  return walk(json) as T;
}

// ---- what Custom is told -----------------------------------------------------------------------------------

/** Custom's instructions in a confidential session; `cut`: its commands run without network here. */
export function confidentialInstructions(cut: boolean): string {
  return [
    '# A confidential session',
    'The user started this session as confidential: nothing of it may leave this computer. You run on a model here, and the app keeps it so:',
    '- Off here: web search and reading web pages, the browser and the screen, connected apps and their keys, apps and changes to the app (app_api), making pictures, videos or sound, publishing, scheduled tasks, other models (second opinions, hand-offs), and saving to memory or to skills. Child sessions you start run here too, on a local model.',
    cut
      ? '- Your commands run without network: they can’t download, install from the internet, push, send or reach any service. Use what is on this computer.'
      : '- Commands can’t be cut off from the network on this computer, so the user approves each one: don’t run commands that use the network (downloads, installs from the internet, pushes, calls to services).',
    '- Still yours: the files in the folder, documents (read here), the Library, knowledge bases, and memory notes to read (nothing new is saved).',
    '- Pages you show or save load nothing from the web here: put their scripts, styles and data inside them, with no libraries from a CDN.',
    'Don’t look for ways around this. When the task needs the internet or another service, say what and why, and leave it to the user: they can start a session without Confidential for that part, with only what may be shared.',
  ].join('\n');
}

// ---- the capability ---------------------------------------------------------------------------------------------

export const confidential: Feature = {
  id: 'confidential',

  allowTool: (name, ctx) => CONFIDENTIAL_TOOLS.has(name) || !confidentialRun(ctx),

  spawn(s) {
    if (!isConfidential(s.extra)) return undefined;
    runs.add(s.runId);
    if (runs.size > 5000) runs.delete(runs.values().next().value!);
    // Custom's process: local models only, no web_fetch, no servers but the app's own, commands without network.
    return { env: { HYDOR_CONFIDENTIAL: '1' } };
  },

  context(s) {
    return isConfidential(s.extra) ? confidentialInstructions(!!sandboxAvailable()) : null;
  },

  async beforeSend(key, d) {
    if (!confidentialKey(d.db, key)) return;
    const s = d.sessions.summary(key);
    if (!s) return;
    if (s.agent !== 'acp' || s.acpAgent !== CONSOLE_ID) throw new HttpError(409, 'Only Custom runs a confidential session, with a model on this computer: start a new confidential session.');
    localModel(d, s.live?.model ?? s.model ?? s.prefs?.model ?? null);
  },

  routes(d) {
    /**
     * What a confidential session can use here: the local models, the best first (`prefer`, the one picked last,
     * leads when it is one), whether commands can be cut off from the network, and whether the helper model runs
     * here (else titles come from the first words).
     */
    d.app.get('/api/confidential', async (req) => {
      const prefer = String((req.query as Record<string, string>).prefer ?? '') || null;
      return { models: d.models.localModels(prefer).map((m) => m.id), sandbox: !!sandboxAvailable(), helper: !!localHelper(d.db) };
    });
  },
};
