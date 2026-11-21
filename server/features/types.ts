// What a capability of the app (search, browser, memory, assistants…) can add to the server: routes,
// tools on each session's own MCP server, what an agent gets when it starts, instructions for Custom,
// and work after a turn ends. server/features/index.ts lists them; registry.ts calls them.
import type { FastifyInstance } from 'fastify';
import type { SessionExtra } from '../../shared/features.ts';
import type { InboxItem } from '../../shared/inbox.ts';
import type { Agent, ServerEvent } from '../../shared/types.ts';
import type { DB } from '../db.ts';
import type { ModelManager } from '../models/manager.ts';
import type { Scheduler } from '../scheduler.ts';
import type { SessionManager } from '../sessions.ts';

export interface Deps {
  app: FastifyInstance;
  db: DB;
  sessions: SessionManager;
  scheduler: Scheduler;
  models: ModelManager;
  /** To every open page. */
  broadcast(e: ServerEvent): void;
  /** To the pages showing one session. */
  toSubscribers(key: string, e: ServerEvent): void;
  /** This app's address as the user reaches it, for links (no trailing slash). */
  publicBase(): string;
}

/** One run of a session's agent, as the tools of its own MCP server see it. */
export interface RunCtx {
  runId: string;
  key: string;
  agent: Agent;
  /** The ACP agent's id; Custom's is "console". */
  acpAgent?: string;
  cwd: string;
  deps: Deps;
  /** Aborted when the agent gives up on the call (its request closed): a card waiting on the user goes. */
  signal?: AbortSignal;
  /** Where a notice about this work opens and what it is called, when that is not its session (a template run's tool step). */
  notice?: { url: string; title: string };
  /** An app's step calls the tool, not an agent: the tools made for steps alone are there too (user_profile). */
  step?: boolean;
}

/** A tool's answer: text, and images for the agents that take them (a screenshot). */
export interface ToolOutput {
  text: string;
  images?: { data: string; mimeType: string }[];
  isError?: boolean;
  /** Why it failed, as the service said it, for an app's flow to try again or say what it missed (server/apps/sturdy.ts); agents get only the text. */
  failure?: ToolFailure;
}

/** A failed call as the tool knows it: what the service answered, how long it asked to wait, or what kind of failure it was. */
export interface ToolFailure {
  /** The HTTP status it answered with. */
  status?: number;
  /** How long it asked to be left alone (Retry-After, a search provider resting), in milliseconds. */
  waitMs?: number;
  /**
   * timeout: no answer in time; dropped: the connection broke; unreachable: it could not be reached; nohost: there is no
   * such address (its name is not known: trying again does not help); botwall: a page that
   * keeps programs out; key: a key it needs is not in the vault (`key` names it); limit, down: a search service limiting
   * requests or failing; refused: the request itself was refused (an address or argument it may not have).
   */
  kind?: 'timeout' | 'dropped' | 'unreachable' | 'nohost' | 'botwall' | 'key' | 'limit' | 'down' | 'refused';
  key?: string;
}

/**
 * A tool on a session's own MCP server: every agent the app runs (Claude Code, Codex, Custom and ACP
 * agents that take MCP over HTTP) has it, without asking the user. A tool that needs the user's say
 * shows a card in the conversation itself and answers the agent when the user has decided.
 */
export interface RunTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** MCP's hints: a tool that only reads (`readOnlyHint`) may run beside other reads, and in Plan mode. */
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean };
  run(args: Record<string, any>, ctx: RunCtx): Promise<string | ToolOutput>;
}

export interface SpawnInfo {
  agent: Agent;
  acpAgent?: string;
  /** Known up front for Claude Code and ACP agents; a new Codex thread gets its key once started. */
  key?: string;
  cwd: string;
  runId: string;
  resume: boolean;
  extra: SessionExtra;
  /** The first message, when a new session starts with one (memory puts what bears on it first). */
  prompt?: string;
  /** The model it starts with, when one is named (none: the program's own default). */
  model?: string;
  /** Custom with a model of a small context (32k tokens or less): give only what such a model needs. */
  lean?: boolean;
}

/** An MCP server for an agent: at an address, or a command it starts. */
export type McpServerSpec =
  | { type: 'http'; url: string; headers?: Record<string, string> }
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> };

/** Instructions that matter only once one of these tools (by their names on the app's own server) is in use. */
export interface ToolGuide {
  tools: string[];
  text: string;
}

/** What a starting agent gets from the capabilities. */
export interface SpawnAdditions {
  /** Added to the agent's own instructions. Keep them the same from one session to the next where they can be (what
   * bears on one request alone goes in `notes`), so the provider's cache of them holds across sessions. */
  instructions?: string[];
  /** With the first message after the agent starts, once, ahead of it in a <system-reminder>: what bears on that
   * request alone (memory's notes for it, the skills that fit it, what the project's folder holds now). */
  notes?: string[];
  /**
   * Instructions about some of the capability's tools alone: how and when to use them. Every agent gets them with its
   * instructions, except Custom, which gets one only while one of its `tools` is offered to the model in full: tools
   * waiting in its catalog cost a line each until find_tools brings them in, and their instructions come with them.
   * Rules that hold whatever tools are in use (keys and passwords, how replies look) stay in `instructions`.
   */
  guides?: ToolGuide[];
  mcpServers?: Record<string, McpServerSpec>;
  env?: Record<string, string>;
  /** More arguments for the agent's command (Claude Code: --plugin-dir). */
  args?: string[];
  /** Folders of skills (<name>/SKILL.md) beside the agent's own (Codex: skills/extraRoots/set). */
  skillRoots?: string[];
  /** Tools it may not use (an assistant's limits), as Claude Code names them ("Bash", "mcp__server__tool"); Codex gets the MCP ones. */
  disallowedTools?: string[];
  /**
   * Tools it may use without its program asking first, as Claude Code names them ("mcp__server__tool"): a connected
   * account's tools on Ask first, whose calls Hydor holds for the person's OK in the Outbox anyway.
   */
  allowedTools?: string[];
  /** Claude Code: only the MCP servers the app gives it (--strict-mcp-config), none of the user's own. */
  strictMcp?: boolean;
  /**
   * Claude Code: only these of its built-in tools (--tools; [] for none), so one a later version adds stays off too. When
   * several capabilities say, only the tools all of them name.
   */
  builtinTools?: string[] | null;
  /** Codex: more settings for its thread ({ web_search: "disabled" }). */
  codexConfig?: Record<string, unknown>;
}

/** All the capabilities give a starting agent together: the tools' guides are in its instructions by then. */
export type GivenAdditions = Required<Omit<SpawnAdditions, 'guides'>>;

export interface TurnInfo {
  key: string;
  agent: Agent;
  cwd?: string;
  /** idle: the turn finished; error: it stopped with an error. */
  status: 'idle' | 'error';
  startedAt: number;
  endedAt: number;
  /** Run by VS Code or a terminal, not by this app. */
  external: boolean;
}

export interface Feature {
  id: string;
  /** Routes; those under /api/ need the sign-in like all others. */
  routes?(d: Deps): void;
  /** Tools on each session's own MCP server. */
  tools?(ctx: RunCtx): RunTool[];
  /** Whether a run may have a tool of its own MCP server, any capability's (an app's run gets only those it allows). */
  allowTool?(name: string, ctx: RunCtx): boolean;
  /**
   * Just before a tool of the session's own server runs, any capability's: `refuse` answers the agent in its
   * place (a budget spent), `note` is added to what it returns (how much of the budget is left).
   */
  aroundTool?(name: string, ctx: RunCtx): { refuse?: string; note?: string } | null | undefined;
  /** What an agent gets when it starts (or resumes). */
  spawn?(s: SpawnInfo, d: Deps): SpawnAdditions | undefined | Promise<SpawnAdditions | undefined>;
  /**
   * Instructions for Custom, read before each of its turns. `epoch` counts the times its conversation was
   * condensed: what may change from turn to turn (memory) keeps the same text within one, so the instructions
   * stay as the provider cached them. `query`: the message that starts the turn, when Custom sent it.
   */
  context?(s: { key: string; cwd: string; extra: SessionExtra; epoch?: number; lean?: boolean; window?: number; query?: string }, d: Deps): string | null | undefined | Promise<string | null | undefined>;
  /**
   * What Custom should hear with the user's message that starts a turn (`query`), inside that message rather than in
   * its instructions, so those stay as the provider cached them: memory newly relevant to it. Asked once per turn,
   * after every capability's `context`. `window`: its model's context in tokens; `lean`, a small one.
   */
  turnNotes?(s: { key: string; cwd: string; extra: SessionExtra; window?: number; lean?: boolean; query: string }, d: Deps): string | null | undefined | Promise<string | null | undefined>;
  /** A turn ended (every session counts, also ones run outside the app). */
  turnEnd?(t: TurnInfo, d: Deps): void | Promise<void>;
  /** Told of every event sent to the pages: a session changed, a capability's list changed… */
  event?(e: ServerEvent, d: Deps): void;
  /** Cleans what any of the app's tools return before an agent sees it (known secret values masked). */
  scrub?(text: string): string;
  /** What waits on the user here (a browser that needs them, a key asked for): for the inbox. */
  inbox?(d: Deps): InboxItem[];
  /** A message is about to go to a session's agent: throw an HttpError to refuse it. */
  beforeSend?(key: string, d: Deps): void | Promise<void>;
  /**
   * What the agent should hear with the user's next message (the user changed a page): it goes ahead of
   * the message in a <system-reminder>, which the conversation does not show. Asked once per message.
   */
  beforeMessage?(key: string, d: Deps): string | null | undefined;
  /**
   * What the agent should hear about the user's message itself (one of their apps does what it asks), ahead of it
   * with beforeMessage's notes. Asked once per message, the first one of a session too.
   */
  aboutMessage?(text: string, key: string, d: Deps): string | null | undefined | Promise<string | null | undefined>;
  /** Once, when the server is up. */
  start?(d: Deps): void;
}
