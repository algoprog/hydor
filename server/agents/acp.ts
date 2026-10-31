// Agents that speak the Agent Client Protocol (agentclientprotocol.com): Gemini CLI, OpenCode, Qwen
// Code, Goose and others, each started as `<command> <args>` and driven over JSON-RPC on stdio.
//
// The app is the ACP client. It opens a session (session/new, or session/load to continue one when the
// agent can), sends prompts (session/prompt, which returns when the turn ends), answers permission
// requests from the approval cards, and reads and writes files for the agent when asked. Every update
// the agent sends goes into the session's transcript (server/history/acp.ts reads it back), since ACP
// agents keep none the app can read.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AcpAgentDef, ApprovalOption, ModelOption } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { APP_ROOT, config } from '../config.ts';
import { AGENT_FILE, MODELS_DIR } from '../models/config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { acpText } from '../history/acp.ts';
import type { Runner } from '../runner/client.ts';
import { LiveAdapter, type ApprovalAnswer, type ImageInput, type LiveConfig } from './live.ts';
import { RpcPeer } from './rpc.ts';

type Json = Record<string, any>;

export const ACP_DIR = path.join(config.dataDir, 'acp');

/** Agents known to speak ACP, as they are usually installed; any of them can be changed, others added. */
export const ACP_PRESETS: AcpAgentDef[] = [
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', args: ['--experimental-acp'], hint: 'npm install -g @google/gemini-cli' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode', args: ['acp'], hint: 'npm install -g opencode-ai' },
  { id: 'qwen', name: 'Qwen Code', command: 'qwen', args: ['--experimental-acp'], hint: 'npm install -g @qwen-code/qwen-code' },
  { id: 'goose', name: 'Goose', command: 'goose', args: ['acp'], hint: 'block.github.io/goose' },
  { id: 'kimi', name: 'Kimi CLI', command: 'kimi', args: ['--acp'], hint: 'github.com/MoonshotAI/kimi-cli' },
  { id: 'auggie', name: 'Auggie', command: 'auggie', args: ['--acp'], hint: 'npm install -g @augmentcode/auggie' },
];

// ---- the list of agents ---------------------------------------------------------------------------

/** Console, the app's own agent (server/agent): any model from Settings → Models. */
export const CONSOLE_ID = 'console';
const consoleDef = (): AcpAgentDef => ({
  id: CONSOLE_ID,
  name: 'Console',
  command: process.execPath,
  args: [path.join(APP_ROOT, 'dist/server/agent.js')],
  env: { AGENT_CONSOLE_MODELS: AGENT_FILE, AGENT_CONSOLE_STATE: path.join(MODELS_DIR, 'sessions') },
  hint: 'Built in: models from OpenRouter, Ollama and vLLM, in Settings → Models',
  builtin: true,
});

export function acpAgents(db: DB): AcpAgentDef[] {
  let mine: AcpAgentDef[] = [];
  try {
    mine = JSON.parse(kvGet(db, 'acp_agents') ?? '[]');
  } catch {}
  return [consoleDef(), ...mine.filter((a) => a.id !== CONSOLE_ID)];
}

const ownAgents = (db: DB) => acpAgents(db).filter((a) => !a.builtin);

export function acpAgent(db: DB, id: string | undefined): AcpAgentDef {
  const a = acpAgents(db).find((x) => x.id === id);
  if (!a) throw new HttpError(404, 'That agent is not in Settings → More agents');
  return a;
}

/** Adds or replaces an agent (by id; a new id from the name when none is given). */
export function saveAcpAgent(db: DB, d: Partial<AcpAgentDef>): AcpAgentDef {
  const name = String(d.name ?? '').trim().slice(0, 40);
  const command = String(d.command ?? '').trim();
  if (!name || !command) throw new HttpError(400, 'Give the agent a name and the command that starts it');
  const args = Array.isArray(d.args) ? d.args.map(String).filter((a) => a.length) : [];
  const env = d.env && typeof d.env === 'object' ? Object.fromEntries(Object.entries(d.env).filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)).map(([k, v]) => [k, String(v)])) : undefined;
  const id = d.id && /^[a-z0-9-]{1,40}$/.test(d.id) ? d.id : `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'agent'}-${crypto.randomBytes(2).toString('hex')}`;
  if (id === CONSOLE_ID) throw new HttpError(400, 'Console is built in');
  const def: AcpAgentDef = { id, name, command, args, env };
  kvSet(db, 'acp_agents', JSON.stringify([...ownAgents(db).filter((a) => a.id !== id), def]));
  return def;
}

export function removeAcpAgent(db: DB, id: string) {
  if (id === CONSOLE_ID) throw new HttpError(400, 'Console is built in');
  kvSet(db, 'acp_agents', JSON.stringify(ownAgents(db).filter((a) => a.id !== id)));
}

/** The command's full path when it is installed (on PATH or given as a path). */
export function findCommand(cmd: string, env: Record<string, string> = process.env as Record<string, string>): string | null {
  if (cmd.includes('/')) return fs.existsSync(cmd) ? cmd : null;
  for (const dir of (env.PATH ?? '').split(':').filter(Boolean)) {
    const p = path.join(dir, cmd);
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {}
  }
  return null;
}

export const acpTranscriptPath = (id: string) => path.join(ACP_DIR, `${id}.jsonl`);

/** The agent's own id for a session, from its transcript (to continue it). */
export function acpSessionOf(file: string): string | undefined {
  try {
    let found: string | undefined;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('"acpSession"')) continue;
      try {
        found = JSON.parse(line).acpSession ?? found;
      } catch {}
    }
    return found;
  } catch {
    return undefined;
  }
}

// ---- a running session ----------------------------------------------------------------------------

export interface AcpOpts {
  cwd: string;
  /** The app's id for the session (its transcript is <id>.jsonl). */
  id: string;
  def: AcpAgentDef;
  /** Continue this ACP session (session/load), when the agent can. */
  acpSession?: string;
  transcript: string;
  mode?: string;
  model?: string;
  /** This app's MCP address for the session (show_html), for agents that take HTTP MCP servers. */
  pageServer?: string;
}

export class AcpLive extends LiveAdapter {
  readonly agent = 'acp' as const;
  rpc: RpcPeer;
  private acpSession?: string;
  private caps: Json = {};
  private loading = false;
  private prompting = false;
  private permissions = new Map<string, { rpcId: string | number; options: Json[] }>();
  /** Lines the agent printed in this run so far; each transcript entry notes how many were handled. */
  private ln = 0;
  private caught: { handled: number; answered: Set<string> } | null = null;
  /** What the agent offers, for the pickers. */
  modes: { id: string; name: string; description?: string }[] = [];
  models: ModelOption[] = [];

  constructor(
    runner: Runner,
    private o: AcpOpts,
  ) {
    super(runner);
    this.sessionId = o.id;
    this.transcriptPath = o.transcript;
    this.acpSession = o.acpSession;
    this.state.model = o.model;
    this.state.mode = o.mode;
    this.rpc = new RpcPeer((m) => runner.writeLine(m), `ac-${crypto.randomBytes(3).toString('hex')}`);
    runner.on('line', (line: string, replay: boolean) => this.onLine(line, replay));
  }

  private record(e: Json) {
    fs.appendFileSync(this.o.transcript, JSON.stringify({ ...e, ts: Date.now(), ln: this.ln }) + '\n');
    this.touch();
    this.emit('activity');
  }

  /** Starts the protocol and opens the session: a new one, or the old one again when the agent can load it. */
  async boot(resume: boolean): Promise<void> {
    this.record({ t: 'run', run: this.runner.meta.runId });
    const init = await this.rpc.call(
      'initialize',
      { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false }, clientInfo: { name: 'agent-console', title: 'Agent Console', version: config.version } },
      60_000,
    );
    this.caps = init?.agentCapabilities ?? {};
    const mcpServers = this.o.pageServer && this.caps.mcpCapabilities?.http ? [{ type: 'http', name: 'agent-console', url: this.o.pageServer, headers: [] }] : [];
    const auth = (e: unknown) => {
      const m = (e as Error).message;
      // Signing in happens in the agent's own CLI (in a terminal), once.
      if (/auth/i.test(m) || (e as { code?: number }).code === -32000)
        throw new HttpError(401, `${this.o.def.name} is not signed in. Run ${this.o.def.command} once in a terminal and sign in there, then try again.`);
      throw e;
    };
    if (resume && this.acpSession && this.caps.loadSession) {
      // The agent replays the conversation as updates: the transcript has it already.
      this.loading = true;
      try {
        const r = await this.rpc.call('session/load', { sessionId: this.acpSession, cwd: this.o.cwd, mcpServers }, 120_000).catch(auth);
        this.offers(r);
      } finally {
        this.loading = false;
      }
    } else {
      if (resume && this.acpSession) this.record({ t: 'note', text: `${this.o.def.name} cannot reopen earlier sessions: it starts afresh here, without the conversation above.` });
      const r = await this.rpc.call('session/new', { cwd: this.o.cwd, mcpServers }, 120_000).catch(auth);
      this.acpSession = String(r?.sessionId ?? '');
      if (!this.acpSession) throw new Error('The agent did not open a session');
      this.record({ t: 'session', acpSession: this.acpSession });
      this.offers(r);
    }
    if (this.o.mode && this.modes.some((m) => m.id === this.o.mode)) await this.setMode(this.o.mode).catch(() => {});
    if (this.o.model && this.models.some((m) => m.value === this.o.model)) await this.setModel(this.o.model).catch(() => {});
    this.state.status = 'idle';
    this.changed();
  }

  /** Reconnected after the server restarted: the session is open; a turn still going shows as working until it ends. */
  restored() {
    this.catchUp();
    // Requests asked again during the replay keep it waiting for you.
    this.state.status = this.approvals.size ? 'waiting' : this.prompting ? 'working' : 'idle';
    this.changed();
  }

  /**
   * After a restart the runner replays all the agent printed in this run. The transcript says how far
   * that was handled (and which of the agent's requests were answered) and whether a turn is open.
   */
  private catchUp() {
    if (this.caught) return this.caught;
    const run = `{"t":"run","run":${JSON.stringify(this.runner.meta.runId)}`;
    let prompted = 0;
    let ended = 0;
    let inRun = false;
    let handled = 0;
    let answered = new Set<string>();
    let all = new Set<string>();
    try {
      fs.readFileSync(this.o.transcript, 'utf8')
        .split('\n')
        .forEach((l, i) => {
          if (l.startsWith('{"t":"prompt"')) prompted = i + 1;
          else if (l.startsWith('{"t":"end"')) ended = i + 1;
          else if (l.startsWith('{"t":"run"')) {
            inRun = l.startsWith(run);
            if (inRun) answered = new Set();
          } else if (l.startsWith('{"t":"rpc"')) {
            const id = /"id":"([^"]*)"/.exec(l)?.[1];
            if (id != null) (inRun ? answered : all).add(id);
          }
          if (inRun) handled = Math.max(handled, Number(/"ln":(\d+)\}$/.exec(l)?.[1] ?? 0));
        });
    } catch {}
    this.prompting = prompted > ended;
    // A transcript from before runs were noted: take all of it as handled.
    this.caught = handled || answered.size ? { handled, answered } : { handled: Infinity, answered: all };
    return this.caught;
  }

  /** Modes and models the agent offers for the session. */
  private offers(r: Json | null | undefined) {
    if (Array.isArray(r?.modes?.availableModes)) {
      this.modes = r!.modes.availableModes.map((m: Json) => ({ id: String(m.id), name: String(m.name ?? m.id), description: m.description ?? undefined }));
      if (r!.modes.currentModeId) this.state.mode = String(r!.modes.currentModeId);
    }
    if (Array.isArray(r?.models?.availableModels)) {
      this.models = r!.models.availableModels.map((m: Json) => ({ value: String(m.modelId), label: String(m.name ?? m.modelId), description: m.description ?? undefined, efforts: [] }));
      if (r!.models.currentModelId) this.state.model = String(r!.models.currentModelId);
    }
  }

  private onLine(line: string, replay: boolean) {
    this.ln++;
    let m: Json;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    // Replayed lines the app handled before the restart are skipped, except the agent's requests it had
    // not answered yet: those are asked again. Lines printed while the server was down are new.
    if (replay) {
      const c = this.catchUp();
      if (this.ln <= c.handled) {
        if (m.id != null && m.method && !c.answered.has(String(m.id))) this.onRequest(m);
        return;
      }
    }
    this.touch();
    if (this.rpc.settle(m)) return;
    if (m.id != null && m.method) return void this.onRequest(m);
    if (m.method === 'session/update') {
      const u = m.params?.update;
      if (!u || this.loading) return;
      this.record({ t: 'update', u });
      if (u.sessionUpdate === 'current_mode_update' && u.currentModeId) {
        this.state.mode = String(u.currentModeId);
        this.changed();
      }
      return;
    }
    // The answer to a prompt sent before the server restarted (its call is gone): the turn ended.
    if (m.id != null && m.result && 'stopReason' in m.result && this.prompting) this.turnEnded({ stopReason: m.result.stopReason });
  }

  /** Answers a request from the agent, and notes that it was answered (for a restart). */
  private reply(id: string | number, result: unknown, error?: string, code = -32002) {
    if (error) this.rpc.respondError(id, code, error);
    else this.rpc.respond(id, result);
    this.record({ t: 'rpc', id: String(id) });
  }

  private onRequest(m: Json) {
    const p: Json = m.params ?? {};
    switch (m.method) {
      case 'session/request_permission': {
        const tc: Json = p.toolCall ?? {};
        const id = String(m.id);
        const options: Json[] = Array.isArray(p.options) ? p.options : [];
        this.permissions.set(id, { rpcId: m.id, options });
        const detail = tc.rawInput?.command ? (Array.isArray(tc.rawInput.command) ? tc.rawInput.command.join(' ') : String(tc.rawInput.command)) : acpText(tc.content) || (tc.rawInput ? JSON.stringify(tc.rawInput, null, 2) : '');
        this.approvals.set(id, {
          id,
          itemId: tc.toolCallId,
          kind: tc.kind === 'execute' ? 'command' : tc.kind === 'edit' || tc.kind === 'delete' || tc.kind === 'move' ? 'file' : 'other',
          title: String(tc.title ?? 'The agent asks to go ahead'),
          detail: detail.slice(0, 4000),
          options: options.map(
            (o): ApprovalOption => ({ id: String(o.optionId), label: String(o.name ?? o.optionId), style: String(o.kind).startsWith('reject') ? 'danger' : o.kind === 'allow_once' ? 'primary' : 'default' }),
          ),
          createdAt: Date.now(),
        });
        this.state.status = 'waiting';
        this.changed();
        return;
      }
      case 'fs/read_text_file': {
        try {
          let text = fs.readFileSync(String(p.path), 'utf8');
          if (p.line || p.limit) {
            const lines = text.split('\n');
            const from = Math.max(0, (Number(p.line) || 1) - 1);
            text = lines.slice(from, p.limit ? from + Number(p.limit) : undefined).join('\n');
          }
          this.reply(m.id, { content: text });
        } catch (e) {
          this.reply(m.id, null, (e as Error).message);
        }
        return;
      }
      case 'fs/write_text_file': {
        try {
          fs.mkdirSync(path.dirname(String(p.path)), { recursive: true });
          fs.writeFileSync(String(p.path), String(p.content ?? ''));
          this.reply(m.id, null);
        } catch (e) {
          this.reply(m.id, null, (e as Error).message);
        }
        return;
      }
      default:
        this.reply(m.id, null, `${m.method} is not supported by this client`, -32601);
    }
  }

  async sendMessage(text: string, images: ImageInput[]): Promise<void> {
    if (!this.acpSession) throw new HttpError(409, 'The agent is still starting');
    if (this.prompting) throw new HttpError(409, 'The agent takes one message at a time: send it when this turn ends');
    const id = `u${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
    this.record({ t: 'prompt', id, text, images: images.length || undefined });
    const prompt: Json[] = [];
    if (text) prompt.push({ type: 'text', text });
    if (this.caps.promptCapabilities?.image) for (const img of images) prompt.push({ type: 'image', mimeType: img.mediaType, data: img.data });
    this.prompting = true;
    this.state.status = 'working';
    this.state.turnStartedAt = Date.now();
    this.state.error = undefined;
    this.changed();
    // The call returns when the turn ends, however long that takes.
    this.rpc
      .call('session/prompt', { sessionId: this.acpSession, prompt }, 7 * 24 * 3600_000)
      .then((r) => this.turnEnded({ stopReason: r?.stopReason ?? 'end_turn' }))
      .catch((e) => this.turnEnded({ error: (e as Error).message }));
  }

  private turnEnded(r: { stopReason?: string; error?: string }) {
    if (!this.prompting) return;
    this.prompting = false;
    // Requests the agent left open end with the turn.
    for (const p of this.permissions.values()) this.reply(p.rpcId, { outcome: { outcome: 'cancelled' } });
    this.record({ t: 'end', ...r });
    this.approvals.clear();
    this.permissions.clear();
    // An agent that stopped keeps its exited state (and why).
    if (!this.exited) {
      this.state.status = 'idle';
      if (r.error) this.state.error = r.error;
    }
    this.changed();
    this.emit('result');
  }

  async interrupt(): Promise<void> {
    if (!this.acpSession) return;
    this.rpc.notify('session/cancel', { sessionId: this.acpSession });
    // Open permission requests end as cancelled, as the protocol asks.
    for (const [id, p] of this.permissions) {
      this.reply(p.rpcId, { outcome: { outcome: 'cancelled' } });
      this.approvals.delete(id);
    }
    this.permissions.clear();
    this.changed();
  }

  async answer(approvalId: string, a: ApprovalAnswer): Promise<void> {
    const p = this.permissions.get(approvalId);
    if (!p) throw new HttpError(404, 'This request was already answered');
    const pick = p.options.find((o) => String(o.optionId) === a.decision);
    this.reply(p.rpcId, pick ? { outcome: { outcome: 'selected', optionId: pick.optionId } } : { outcome: { outcome: 'cancelled' } });
    this.permissions.delete(approvalId);
    this.approvals.delete(approvalId);
    if (this.state.status === 'waiting' && !this.approvals.size) this.state.status = 'working';
    this.changed();
  }

  private async setMode(modeId: string) {
    await this.rpc.call('session/set_mode', { sessionId: this.acpSession, modeId }, 15_000);
    this.state.mode = modeId;
  }

  private async setModel(modelId: string) {
    await this.rpc.call('session/set_model', { sessionId: this.acpSession, modelId }, 15_000);
    this.state.model = modelId;
    this.record({ t: 'model', model: modelId });
  }

  async configure(cfg: LiveConfig): Promise<void> {
    if (cfg.mode) await this.setMode(cfg.mode).catch((e) => Promise.reject(new HttpError(400, (e as Error).message)));
    if (cfg.model) await this.setModel(cfg.model).catch((e) => Promise.reject(new HttpError(400, (e as Error).message)));
    this.changed();
  }

  async stopTask(): Promise<void> {}

  async rename(title: string): Promise<void> {
    this.record({ t: 'title', title });
  }

  protected onExited() {
    this.rpc.failAll('The agent stopped');
    // A turn whose call was lost to a restart ends here too.
    this.turnEnded({ error: 'The agent stopped' });
  }
}
