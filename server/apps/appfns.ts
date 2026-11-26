// An app's own functions as its agents' tools: what the apps side knows of them. The functions are those of the web app that this
// agent app is the flows half of (server/webapps/flows-functions.ts reads its functions.json and calls them); here are only the
// names an agent sees, the allow-list entries a recipe uses to say which functions a run may call, and the place where the web
// side hooks in, so that server/apps never imports server/webapps.
import type { RunCtx, RunTool } from '../features/types.ts';
import type { RunRecord } from './store.ts';

/** What a recipe's `tools` list says to allow one of the app's functions: `fn:<name>`, or `fn:*` for every function that only reads. */
export const FN_ENTRY = 'fn:';
/** What an agent sees in front of a function's name: no tool of Hydor's own starts so, so a function can never be taken for one. */
export const FN_TOOL = 'appfn_';
/** The longest function name Hydor offers (a tool's whole name must stay under what agents accept: 64 letters with the server's name in front). */
export const MAX_FN_NAME = 40;
/** What a function's name may be. */
export const FN_NAME = /^[a-z][a-z0-9_]{1,63}$/;

export const toolNameOf = (fn: string) => `${FN_TOOL}${fn}`;
export const isFunctionTool = (tool: string) => tool.startsWith(FN_TOOL);
export const fnOfTool = (tool: string) => (isFunctionTool(tool) ? tool.slice(FN_TOOL.length) : null);

/**
 * Whether a run's allow-list lets it call a function. Only a list that says so does: `null` (every tool of Hydor's own) does not reach into
 * the app's functions, so a new link offers none until the maker allows them. `fn:*` allows the functions that only read; one that changes
 * what the app keeps (`writes`) has to be named (`fn:<name>`).
 */
export function fnAllowed(tools: readonly string[] | null | undefined, name: string, writes: boolean): boolean {
  if (!tools) return false;
  return tools.includes(`${FN_ENTRY}${name}`) || tools.includes(`${FN_ENTRY}${name}${FN_FREE}`) || (!writes && tools.includes(`${FN_ENTRY}*`));
}

/** What an entry ends with when its function is allowed without asking the person first (`fn:<name>!`: only a function that changes things asks at all). */
export const FN_FREE = '!';

/** Whether a function that is allowed asks the person on a card the first time a run calls it: one that changes what the app keeps does, unless its entry says it need not (`fn:<name>!`). */
export function fnAsks(tools: readonly string[] | null | undefined, name: string, writes: boolean): boolean {
  return writes && !(tools ?? []).includes(`${FN_ENTRY}${name}${FN_FREE}`);
}

/** The function entries of an allow-list. */
export const fnEntries = (tools: readonly string[] | null | undefined): string[] => (tools ?? []).filter((t) => t.startsWith(FN_ENTRY));

/** Whether a recipe lets any run of it call a function, anywhere: its tools, or the tools of one of its agent steps, or a tool step that names one. */
export function recipeWantsFunctions(recipe: { tools: readonly string[] | null; flow?: unknown; flows?: Record<string, { steps?: unknown }> }): boolean {
  if (fnEntries(recipe.tools).length) return true;
  const walk = (steps: unknown): boolean =>
    Array.isArray(steps) &&
    steps.some((s: Record<string, unknown>) => {
      if (!s || typeof s !== 'object') return false;
      if (fnEntries(Array.isArray(s.tools) ? (s.tools as string[]) : null).length) return true;
      if (s.do === 'tool' && typeof s.tool === 'string' && s.tool.startsWith(FN_ENTRY)) return true;
      return ['steps', 'then', 'else', 'each', 'body'].some((k) => walk((s as Record<string, unknown>)[k]));
    });
  return walk((recipe.flow as { steps?: unknown } | undefined)?.steps) || Object.values(recipe.flows ?? {}).some((f) => walk(f.steps));
}

/** What the web side gives the apps side (set once by server/webapps/flows.ts). */
export interface RunFunctions {
  /**
   * A run starts (not an agent step's own run: it goes by its parent's): when its app is the flows half of a web app and its recipe lets it use
   * the app's functions, the functions are read, the app is started and kept awake for the run, and what is not as it should be is noted on the run.
   * Returns the run as it is after.
   */
  begin(run: RunRecord): RunRecord;
  /** The tools of one run's session: the functions it may call, as they were when the run began. */
  tools(ctx: Pick<RunCtx, 'runId' | 'key'>, run: RunRecord): RunTool[];
  /** One function as a tool step calls it (`fn:<name>`): its name as a tool of the run's own server (it goes through the same tools every call does), or why it cannot, in a sentence. */
  stepTool(run: RunRecord, entry: string): { name: string } | { problem: string };
  /** Whether this run's allow-list lets its session have the tool `name` (a function's, by its name for agents). */
  allows(name: string, run: RunRecord): boolean;
  /** A run ended. */
  end(run: RunRecord): void;
}

let hooks: RunFunctions | null = null;
export const useRunFunctions = (f: RunFunctions | null) => (hooks = f);
export const runFunctions = () => hooks;

/**
 * Where a run of an agent app that has an app of its own is shown in that app: its name and the address inside it (the row the run was kept as when it was
 * kept, else the app's home). Set once by server/webapps; none for an app with no web half.
 */
export interface OpenApp {
  of(run: RunRecord): { id: string; name: string; path: string; row: boolean } | null;
}
let opener: OpenApp | null = null;
export const useOpenApp = (o: OpenApp | null) => (opener = o);
export const openAppOf = (run: RunRecord) => {
  try {
    return opener?.of(run) ?? null;
  } catch {
    return null;
  }
};
