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
}

/** A tool's answer: text, and images for the agents that take them (a screenshot). */
export interface ToolOutput {
  text: string;
  images?: { data: string; mimeType: string }[];
  isError?: boolean;
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
}

/** An MCP server for an agent: at an address, or a command it starts. */
export type McpServerSpec =
  | { type: 'http'; url: string; headers?: Record<string, string> }
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> };

/** What a starting agent gets from the capabilities. */
export interface SpawnAdditions {
  /** Added to the agent's own instructions. */
  instructions?: string[];
  mcpServers?: Record<string, McpServerSpec>;
  env?: Record<string, string>;
  /** More arguments for the agent's command (Claude Code: --plugin-dir). */
  args?: string[];
  /** Folders of skills (<name>/SKILL.md) beside the agent's own (Codex: skills/extraRoots/set). */
  skillRoots?: string[];
  /** Tools it may not use (an assistant's limits), as Claude Code names them ("Bash", "mcp__server__tool"); Codex gets the MCP ones. */
  disallowedTools?: string[];
  /** Claude Code: only the MCP servers the app gives it (--strict-mcp-config), none of the user's own. */
  strictMcp?: boolean;
  /** Codex: more settings for its thread ({ web_search: "disabled" }). */
  codexConfig?: Record<string, unknown>;
}

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
  /** What an agent gets when it starts (or resumes). */
  spawn?(s: SpawnInfo, d: Deps): SpawnAdditions | undefined | Promise<SpawnAdditions | undefined>;
  /** Instructions for Custom, read afresh before each of its turns. */
  context?(s: { key: string; cwd: string; extra: SessionExtra }, d: Deps): string | null | undefined | Promise<string | null | undefined>;
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
  /** Once, when the server is up. */
  start?(d: Deps): void;
}
