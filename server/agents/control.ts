// Account-level operations: plan usage, model catalogs, sign-in, and thread maintenance.
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import * as pty from 'node-pty';
import type { AccountStatus, AgentUsage, LoginFlow, ModelOption, UsageWindow } from '../../shared/types.ts';
import { config, paths } from '../config.ts';
import { agentBaseEnv } from '../env.ts';
import { LineSplitter } from '../runner/frames.ts';
import { claudeModels } from './claude.ts';
import { ensureClaude } from '../clients.ts';
import { claimClaudeReset, claudeOauthAccount, claudeResets } from './claudeResets.ts';
import { codexEnv, codexModels } from './codex.ts';
import { RpcPeer } from './rpc.ts';

type Json = Record<string, any>;

const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

function execJson(cmd: string, args: string[], env: Record<string, string>, timeoutMs = 20_000): Promise<{ out: string; code: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { env, cwd: paths.probe, timeout: timeoutMs, maxBuffer: 4 << 20 }, (err, stdout) => {
      resolve({ out: String(stdout ?? ''), code: err ? ((err as any).code ?? 1) : 0 });
    });
  });
}

function windowLabel(mins: number | null | undefined): string {
  if (!mins) return 'Usage';
  if (mins === 300) return '5-hour window';
  if (mins === 10080) return 'Weekly';
  if (mins >= 40000 && mins <= 46000) return 'Monthly (30 days)';
  if (mins % 1440 === 0) return `${mins / 1440}-day window`;
  if (mins % 60 === 0) return `${mins / 60}-hour window`;
  return `${mins}-minute window`;
}

const toMs = (v: unknown): number | null => {
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

/** Used up: usage comes back when the last full window resets. */
function usedUp(windows: UsageWindow[]): AgentUsage['limited'] {
  const full = windows.filter((w) => (w.usedPercent ?? 0) >= 100);
  if (!full.length) return null;
  const w = full.reduce((a, b) => ((b.resetsAt ?? 0) > (a.resetsAt ?? 0) ? b : a));
  return { label: w.label, resetsAt: w.resetsAt ?? null };
}

export interface ResetOutcome {
  outcome: string;
  message: string;
}

const CODEX_OUTCOMES: Record<string, ResetOutcome> = {
  reset: { outcome: 'reset', message: 'Codex usage limits are reset.' },
  nothingToReset: { outcome: 'nothing_to_reset', message: 'Codex is not at a usage limit right now, so nothing was reset.' },
  noCredit: { outcome: 'no_credit', message: 'No limit resets are left.' },
  alreadyRedeemed: { outcome: 'already_used', message: 'That reset was already used.' },
};

// ---- Codex ---------------------------------------------------------------

/** A long-lived `codex app-server` for account and catalog calls (not tied to a thread). */
export class CodexControl extends EventEmitter {
  /** `extraEnv` points it at an added account (CODEX_HOME); none for the default one. */
  constructor(private extraEnv: Record<string, string> = {}) {
    super();
  }
  private proc: ChildProcess | null = null;
  private rpc: RpcPeer | null = null;
  private ready: Promise<void> | null = null;
  private modelsCache: { at: number; models: ModelOption[] } | null = null;
  flows = new Map<string, LoginFlow & { loginId?: string }>();
  lastUsage: AgentUsage | null = null;

  private ensure(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      const proc = spawn(config.codexBin, ['app-server'], { cwd: paths.probe, env: codexEnv({ ...agentBaseEnv(), ...this.extraEnv }), stdio: ['pipe', 'pipe', 'pipe'] });
      this.proc = proc;
      const rpc = new RpcPeer((o) => proc.stdin.write(JSON.stringify(o) + '\n'), `ctl-${crypto.randomBytes(3).toString('hex')}`);
      this.rpc = rpc;
      const lines = new LineSplitter();
      proc.stdout.on('data', (buf: Buffer) =>
        lines.push(buf, (line) => {
          let m: Json;
          try {
            m = JSON.parse(line);
          } catch {
            return;
          }
          if (rpc.settle(m)) return;
          if (m.id != null && m.method) rpc.respondError(m.id, -32601, 'not supported');
          else if (m.method) this.onNotification(m.method, m.params ?? {});
        }),
      );
      proc.stderr.on('data', () => {});
      proc.stdin.on('error', () => {});
      proc.on('exit', () => {
        rpc.failAll('codex app-server exited');
        this.proc = null;
        this.rpc = null;
        this.ready = null;
      });
      proc.on('error', (e) => reject(e));
      rpc
        .call('initialize', { clientInfo: { name: 'web_agent_control', title: 'Web Agent', version: config.version }, capabilities: { experimentalApi: true, requestAttestation: false } }, 60_000)
        .then(() => {
          rpc.notify('initialized');
          resolve();
        })
        .catch((e) => {
          this.ready = null;
          proc.kill();
          reject(e);
        });
    });
    return this.ready;
  }

  async call<T = any>(method: string, params: unknown, timeoutMs = 60_000): Promise<T> {
    await this.ensure();
    return this.rpc!.call<T>(method, params, timeoutMs);
  }

  private onNotification(method: string, p: Json) {
    if (method === 'account/login/completed') {
      for (const f of this.flows.values()) {
        if (f.loginId && (!p.loginId || p.loginId === f.loginId) && (f.state === 'waiting' || f.state === 'verifying')) {
          f.state = p.success ? 'done' : 'failed';
          f.error = p.success ? undefined : p.error ?? 'Sign-in failed';
          f.message = p.success ? 'Signed in to ChatGPT' : undefined;
          this.emit('flow', f);
        }
      }
      this.emit('account');
    } else if (method === 'account/rateLimits/updated') {
      this.emit('ratelimit', p.rateLimits);
    } else if (method === 'account/updated') {
      this.emit('account');
    }
  }

  async models(force = false): Promise<ModelOption[]> {
    if (!force && this.modelsCache && Date.now() - this.modelsCache.at < 10 * 60_000) return this.modelsCache.models;
    const r = await this.call('model/list', { includeHidden: false });
    const models = codexModels(r?.data);
    this.modelsCache = { at: Date.now(), models };
    return models;
  }

  async account(): Promise<AccountStatus> {
    try {
      const r = await this.call('account/read', {});
      const a = r?.account;
      if (!a) return { agent: 'codex', loggedIn: false, detail: r?.requiresOpenaiAuth ? 'Not signed in' : undefined };
      return { agent: 'codex', loggedIn: true, email: a.email ?? undefined, plan: a.planType ?? a.type, method: a.type === 'chatgpt' ? 'ChatGPT' : a.type };
    } catch (e) {
      return { agent: 'codex', loggedIn: false, error: (e as Error).message };
    }
  }

  async usage(): Promise<AgentUsage> {
    const fetchedAt = Date.now();
    try {
      const [acct, limits, usage] = await Promise.all([
        this.call('account/read', {}),
        this.call('account/rateLimits/read', null).catch(() => null),
        this.call('account/usage/read', null).catch(() => null),
      ]);
      const u: AgentUsage = {
        agent: 'codex',
        ok: true,
        fetchedAt,
        account: acct?.account ? { email: acct.account.email ?? undefined, plan: acct.account.planType ?? acct.account.type } : undefined,
        windows: [],
      };
      applyCodexLimits(u, limits);
      if (usage?.dailyUsageBuckets) u.daily = (usage.dailyUsageBuckets as Json[]).slice(-60).map((b) => ({ date: b.startDate, tokens: b.tokens }));
      if (usage?.summary?.lifetimeTokens) u.lifetimeTokens = usage.summary.lifetimeTokens;
      this.lastUsage = u;
      return u;
    } catch (e) {
      return { agent: 'codex', ok: false, error: (e as Error).message, fetchedAt, windows: [] };
    }
  }

  /** Spends a reset credit (the given one, or the backend's pick) to clear the usage limits now. */
  async useReset(creditId?: string): Promise<ResetOutcome> {
    const r = await this.call('account/rateLimitResetCredit/consume', { idempotencyKey: crypto.randomUUID(), creditId: creditId ?? null });
    return CODEX_OUTCOMES[String(r?.outcome)] ?? { outcome: 'error', message: 'Codex could not use the reset.' };
  }

  async startLogin(method: 'device' | 'browser'): Promise<LoginFlow> {
    const id = crypto.randomBytes(8).toString('hex');
    const flow: LoginFlow & { loginId?: string } = { id, agent: 'codex', method, state: 'starting' };
    this.flows.set(id, flow);
    const r = await this.call('account/login/start', method === 'device' ? { type: 'chatgptDeviceCode' } : { type: 'chatgpt' });
    flow.loginId = r.loginId;
    flow.state = 'waiting';
    if (r.type === 'chatgptDeviceCode') {
      flow.url = r.verificationUrl;
      flow.code = r.userCode;
      flow.message = 'Open the link, sign in, and enter the code.';
    } else {
      flow.url = r.authUrl;
      flow.needsInput = 'url';
      flow.message = 'Open the link and sign in. Your browser then fails to load a localhost page: copy that page’s full address and paste it here.';
    }
    return flow;
  }

  /** Browser flow: replay the localhost redirect the user's browser could not reach. */
  async submitRedirect(flowId: string, url: string): Promise<LoginFlow> {
    const flow = this.flows.get(flowId);
    if (!flow) throw new Error('Unknown sign-in');
    let u: URL;
    try {
      u = new URL(url.trim());
    } catch {
      throw new Error('That is not a URL');
    }
    if (!['localhost', '127.0.0.1'].includes(u.hostname) || u.protocol !== 'http:') throw new Error('Paste the http://localhost:… address your browser tried to open');
    flow.state = 'verifying';
    const target = `http://127.0.0.1:${u.port || 80}${u.pathname}${u.search}`;
    const res = await fetch(target, { redirect: 'manual' }).catch((e) => {
      throw new Error(`The local sign-in server did not answer (${(e as Error).message})`);
    });
    if (res.status >= 400) {
      flow.state = 'waiting';
      throw new Error(`Sign-in server answered ${res.status}`);
    }
    return flow;
  }

  async cancelLogin(flowId: string) {
    const flow = this.flows.get(flowId);
    if (!flow) return;
    if (flow.loginId) await this.call('account/login/cancel', { loginId: flow.loginId }).catch(() => {});
    flow.state = 'cancelled';
    this.emit('flow', flow);
  }

  async logout() {
    await this.call('account/logout', {});
    this.emit('account');
  }

  async deleteThread(threadId: string) {
    await this.call('thread/delete', { threadId });
  }

  async setThreadName(threadId: string, name: string) {
    await this.call('thread/name/set', { threadId, name });
  }

  shutdown() {
    this.proc?.kill();
  }

  /** A new Codex: the next call starts it (not while a sign-in waits on this one). */
  restart() {
    this.modelsCache = null;
    if (![...this.flows.values()].some((f) => f.state === 'waiting' || f.state === 'verifying')) this.shutdown();
  }
}

export function applyCodexLimits(u: AgentUsage, limits: Json | null) {
  if (!limits) return;
  const snaps: Json[] = limits.rateLimitsByLimitId ? Object.values(limits.rateLimitsByLimitId) : limits.rateLimits ? [limits.rateLimits] : [];
  const windows: UsageWindow[] = [];
  const multi = snaps.length > 1;
  for (const s of snaps) {
    const prefix = multi ? `${s.limitName ?? s.limitId ?? 'Codex'} · ` : '';
    for (const [k, w] of [
      ['primary', s.primary],
      ['secondary', s.secondary],
    ] as const) {
      if (!w) continue;
      windows.push({
        id: `${s.limitId ?? 'codex'}:${k}`,
        label: prefix + windowLabel(w.windowDurationMins),
        usedPercent: typeof w.usedPercent === 'number' ? w.usedPercent : null,
        resetsAt: toMs(w.resetsAt),
        windowMinutes: w.windowDurationMins ?? null,
        severity: s.rateLimitReachedType ? 'critical' : undefined,
      });
    }
    if (s.credits && !u.credits) u.credits = { balance: s.credits.balance ?? undefined, unlimited: !!s.credits.unlimited, hasCredits: !!s.credits.hasCredits };
    if (s.planType && u.account && !u.account.plan) u.account.plan = s.planType;
  }
  u.windows = windows;
  // The backend says when usage is used up; percentages alone can lag.
  const reached = snaps.some((s) => s.rateLimitReachedType) || limits.ordinaryUsageAllowed === false;
  u.limited = usedUp(windows) ?? (reached ? { label: windows[0]?.label ?? 'Usage', resetsAt: windows.reduce((t, w) => Math.max(t, w.resetsAt ?? 0), 0) || null } : null);
  const rc = limits.rateLimitResetCredits;
  if (rc) {
    const items = ((rc.credits ?? []) as Json[])
      .filter((c) => c.status === 'available')
      .map((c) => ({ id: String(c.id), title: c.title ?? 'Limit reset', detail: c.description ?? undefined, expiresAt: toMs(c.expiresAt) ?? undefined, usableNow: true }))
      .sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
    u.resetCredits = { available: Number(rc.availableCount ?? items.length), items };
  }
}

/** Merges a live `account/rateLimits/updated` snapshot into the last usage report. */
export function mergeCodexSnapshot(u: AgentUsage | null, snap: Json): AgentUsage | null {
  if (!u) return null;
  const next: AgentUsage = { ...u, fetchedAt: Date.now() };
  const byId: Json = {};
  for (const w of u.windows) byId[w.id] = w;
  applyCodexLimits(next, { rateLimitsByLimitId: { [snap.limitId ?? 'codex']: snap }, rateLimitResetCredits: null });
  next.resetCredits = u.resetCredits;
  // Keep windows of other limits the snapshot did not mention.
  const seen = new Set(next.windows.map((w) => w.id));
  next.windows = [...next.windows, ...u.windows.filter((w) => !seen.has(w.id))];
  next.limited = next.limited ?? usedUp(next.windows);
  return next;
}

// ---- Claude --------------------------------------------------------------

export class ClaudeControl extends EventEmitter {
  /** `extraEnv` points it at an added account (CLAUDE_CONFIG_DIR); none for the default one. */
  constructor(private extraEnv: Record<string, string> = {}) {
    super();
  }
  private env = () => ({ ...agentBaseEnv(), ...this.extraEnv });
  private initCache: { at: number; init: Json } | null = null;
  private usageCache: AgentUsage | null = null;
  private inflight: Promise<{ init: Json | null; usage: Json | null }> | null = null;
  flows = new Map<string, LoginFlow & { term?: pty.IPty; buf?: string }>();

  /** Runs a throwaway stream-json CLI: initialize (models, account) then get_usage. No model turn. */
  private probe(): Promise<{ init: Json | null; usage: Json | null }> {
    if (this.inflight) return this.inflight;
    this.inflight = new Promise((resolve) => {
      const proc = spawn(
        config.claudeBin,
        ['--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json', '--strict-mcp-config', '--permission-prompt-tool', 'stdio'],
        { cwd: paths.probe, env: this.env(), stdio: ['pipe', 'pipe', 'ignore'] },
      );
      let init: Json | null = null;
      let usage: Json | null = null;
      const done = () => {
        clearTimeout(timer);
        try {
          proc.stdin.end();
        } catch {}
        setTimeout(() => proc.kill('SIGTERM'), 1500);
        this.inflight = null;
        resolve({ init, usage });
      };
      const timer = setTimeout(done, 45_000);
      const lines = new LineSplitter();
      proc.stdout.on('data', (buf: Buffer) =>
        lines.push(buf, (line) => {
          let m: Json;
          try {
            m = JSON.parse(line);
          } catch {
            return;
          }
          if (m.type !== 'control_response') return;
          const r = m.response ?? {};
          if (r.request_id === 'init') {
            init = r.subtype === 'success' ? r.response : null;
            proc.stdin.write(JSON.stringify({ type: 'control_request', request_id: 'usage', request: { subtype: 'get_usage', skip_behaviors: true } }) + '\n');
          } else if (r.request_id === 'usage') {
            usage = r.subtype === 'success' ? r.response : null;
            done();
          }
        }),
      );
      proc.stdin.on('error', () => {});
      proc.on('error', () => done());
      proc.on('exit', () => {
        if (this.inflight) done();
      });
      proc.stdin.write(JSON.stringify({ type: 'control_request', request_id: 'init', request: { subtype: 'initialize' } }) + '\n');
    });
    return this.inflight;
  }

  /** A new Claude Code: its models and commands are read again from the next probe. */
  restart() {
    this.initCache = null;
  }

  /** Slash commands and skills, from the same initialize reply as the models. */
  async commands(): Promise<{ name: string; description?: string; argumentHint?: string }[]> {
    await this.models();
    const list: Json[] = Array.isArray(this.initCache?.init?.commands) ? this.initCache!.init.commands : [];
    return list.map((c) => ({ name: String(c.name), description: c.description ? String(c.description) : undefined, argumentHint: c.argumentHint ? String(c.argumentHint) : undefined }));
  }

  async models(): Promise<ModelOption[]> {
    if (!this.initCache || Date.now() - this.initCache.at > 60 * 60_000) {
      const { init, usage } = await this.probe();
      if (init) this.initCache = { at: Date.now(), init };
      if (usage) this.usageCache = this.report(usage);
    }
    return claudeModels(this.initCache?.init);
  }

  /** A usage report from fresh numbers; resets and the account carry over from the last one. */
  private report(raw: Json): AgentUsage {
    const prev = this.usageCache;
    const u = claudeUsage(raw, this.initCache?.init ?? null);
    if (!u.account?.email) {
      const a = claudeOauthAccount(this.extraEnv.CLAUDE_CONFIG_DIR);
      u.account = { ...u.account, email: a?.emailAddress ?? prev?.account?.email, org: u.account?.org ?? a?.organizationName ?? prev?.account?.org };
    }
    u.resetCredits = prev?.resetCredits;
    return u;
  }

  /** Usage from a live session (cheaper) or a probe. */
  async usage(fromLive?: () => Promise<Json | null>): Promise<AgentUsage> {
    const fetchedAt = Date.now();
    try {
      let raw = fromLive ? await fromLive().catch(() => null) : null;
      if (!raw) {
        const { init, usage } = await this.probe();
        if (init) this.initCache = { at: Date.now(), init };
        raw = usage;
      }
      if (!raw) throw new Error('Claude Code did not report usage (signed out?)');
      const prev = this.usageCache;
      const u = this.report(raw);
      try {
        const r = await claudeResets(() => this.probe(), this.extraEnv.CLAUDE_CONFIG_DIR);
        u.resetCredits = r && { available: r.available, items: r.items, nextAvailableAt: r.nextAvailableAt, cooldownUntil: r.cooldownUntil };
        if (r?.atLimit && !u.limited) u.limited = prev?.limited ?? { label: 'Usage limit', resetsAt: null };
      } catch {} // keep the resets from the last read
      this.usageCache = u;
      return u;
    } catch (e) {
      return { agent: 'claude', ok: false, error: (e as Error).message, fetchedAt, windows: this.usageCache?.windows ?? [] };
    }
  }

  get lastUsage() {
    return this.usageCache;
  }

  /** Applies a live `rate_limit_event` to the cached report. */
  applyRateLimit(info: Json): AgentUsage | null {
    const u = this.usageCache;
    if (!u || !info) return null;
    const win = info.unifiedWindows ?? {};
    const windows = u.windows.map((w) => {
      const src = w.id === 'session' ? win.five_hour : w.id === 'weekly_all' ? win.seven_day : undefined;
      if (!src || typeof src.utilization !== 'number') return w;
      return { ...w, usedPercent: Math.round(src.utilization * 1000) / 10, resetsAt: toMs(src.resetsAt) ?? w.resetsAt };
    });
    // Rejected: that limit is used up until it resets. Allowed again: usage is back.
    const limited =
      info.status === 'rejected'
        ? { label: RATE_LIMIT_LABELS[info.rateLimitType] ?? 'Usage limit', resetsAt: toMs(info.resetsAt) }
        : info.status === 'allowed' || info.status === 'allowed_warning'
          ? usedUp(windows)
          : u.limited;
    this.usageCache = { ...u, windows, limited, fetchedAt: Date.now() };
    return this.usageCache;
  }

  /** Claims a reset grant (the CLI's /rate-limit-options). */
  useReset(id: string): Promise<ResetOutcome> {
    return claimClaudeReset(id, () => this.probe(), this.extraEnv.CLAUDE_CONFIG_DIR);
  }

  async account(): Promise<AccountStatus> {
    const { out } = await execJson(config.claudeBin, ['auth', 'status'], this.env());
    try {
      const j = JSON.parse(out);
      return {
        agent: 'claude',
        loggedIn: !!j.loggedIn,
        email: j.email ?? undefined,
        plan: j.subscriptionType ?? undefined,
        method: j.authMethod ?? undefined,
        detail: j.orgName ?? undefined,
      };
    } catch {
      return { agent: 'claude', loggedIn: false, error: out.trim().slice(0, 300) || 'Could not read Claude Code sign-in status' };
    }
  }

  /** `claude auth login` in a pseudo-terminal: show its URL, then type the code the user pastes. */
  async startLogin(method: 'claudeai' | 'console'): Promise<LoginFlow> {
    // Signing in needs Claude Code: installed now when it is not here.
    await ensureClaude();
    for (const f of this.flows.values()) if (f.term && (f.state === 'waiting' || f.state === 'starting')) this.cancelLogin(f.id);
    const id = crypto.randomBytes(8).toString('hex');
    const flow: LoginFlow & { term?: pty.IPty; buf?: string } = { id, agent: 'claude', method, state: 'starting', buf: '' };
    this.flows.set(id, flow);
    const term = pty.spawn(config.claudeBin, ['auth', 'login', method === 'console' ? '--console' : '--claudeai'], {
      name: 'xterm-256color',
      cols: 400,
      rows: 40,
      cwd: paths.probe,
      env: { ...this.env(), BROWSER: 'true' },
    });
    flow.term = term;
    term.onData((d) => {
      flow.buf = (flow.buf ?? '') + d;
      if (flow.buf.length > 200_000) flow.buf = flow.buf.slice(-100_000);
      if (!flow.url) {
        const osc = flow.buf.match(/\x1b\]8;;(https:\/\/[^\x07\x1b]+)/);
        const plain = flow.buf.replace(ANSI, '').match(/https:\/\/\S*oauth\/authorize\S*/);
        const url = osc?.[1] ?? plain?.[0];
        if (url) {
          flow.url = url;
          flow.state = 'waiting';
          flow.needsInput = 'code';
          flow.message = 'Open the link, approve access, then paste the code shown on the page.';
          this.emit('flow', flow);
        }
      }
      const text = flow.buf.replace(ANSI, '');
      if (flow.state === 'verifying' && /(invalid|expired|error|failed)/i.test(text.slice(-400)) && !/success/i.test(text.slice(-400))) {
        flow.error = text.slice(-300).trim().split('\n').pop();
      }
    });
    term.onExit(({ exitCode }) => {
      flow.term = undefined;
      if (flow.state === 'cancelled') return;
      flow.state = exitCode === 0 ? 'done' : 'failed';
      if (exitCode === 0) flow.message = 'Signed in to Claude';
      else flow.error = flow.error ?? (flow.buf ?? '').replace(ANSI, '').trim().split('\n').slice(-3).join(' ').slice(0, 300);
      this.initCache = null;
      this.usageCache = null;
      this.emit('flow', flow);
      this.emit('account');
    });
    // Wait briefly for the URL so the first response already has it.
    for (let i = 0; i < 60 && !flow.url && flow.term; i++) await new Promise((r) => setTimeout(r, 100));
    return flow;
  }

  submitCode(flowId: string, code: string): LoginFlow {
    const flow = this.flows.get(flowId);
    if (!flow?.term) throw new Error('This sign-in is no longer running');
    const clean = code.trim();
    if (!clean || clean.length > 2000) throw new Error('Paste the code from the page');
    flow.state = 'verifying';
    flow.needsInput = undefined;
    flow.term.write(clean + '\r');
    this.emit('flow', flow);
    return flow;
  }

  cancelLogin(flowId: string) {
    const flow = this.flows.get(flowId);
    if (!flow) return;
    flow.state = 'cancelled';
    flow.term?.kill();
    flow.term = undefined;
    this.emit('flow', flow);
  }

  async logout() {
    await execJson(config.claudeBin, ['auth', 'logout'], this.env());
    this.initCache = null;
    this.usageCache = null;
    this.emit('account');
  }
}

export function publicFlow(f: LoginFlow): LoginFlow {
  const { id, agent, method, state, url, code, needsInput, message, error } = f;
  return { id, agent, method, state, url, code, needsInput, message, error };
}

const LIMIT_LABELS: Record<string, string> = {
  session: 'Current session (5 h)',
  weekly_all: 'Weekly · all models',
};

const RATE_LIMIT_LABELS: Record<string, string> = {
  five_hour: LIMIT_LABELS.session,
  seven_day: LIMIT_LABELS.weekly_all,
  seven_day_opus: 'Weekly · Opus',
  seven_day_sonnet: 'Weekly · Sonnet',
};

export function claudeUsage(raw: Json, init: Json | null): AgentUsage {
  const rl: Json = raw.rate_limits ?? {};
  const windows: UsageWindow[] = [];
  if (Array.isArray(rl.limits) && rl.limits.length) {
    for (const l of rl.limits as Json[]) {
      const scope = l.scope?.model?.display_name ?? l.scope?.surface?.display_name;
      windows.push({
        id: l.kind === 'weekly_scoped' ? `weekly_${String(scope ?? 'scoped').toLowerCase()}` : String(l.kind),
        label: LIMIT_LABELS[l.kind] ?? (l.kind === 'weekly_scoped' ? `Weekly · ${scope ?? 'model'} only` : String(l.kind).replace(/_/g, ' ')),
        usedPercent: typeof l.percent === 'number' ? l.percent : null,
        resetsAt: toMs(l.resets_at),
        severity: l.severity,
        active: !!l.is_active,
        windowMinutes: l.group === 'session' ? 300 : l.group === 'weekly' ? 10080 : null,
      });
    }
  } else {
    const add = (id: string, label: string, w: Json | null | undefined, mins: number) => {
      if (w && typeof w.utilization === 'number') windows.push({ id, label, usedPercent: w.utilization, resetsAt: toMs(w.resets_at), windowMinutes: mins });
    };
    add('session', LIMIT_LABELS.session, rl.five_hour, 300);
    add('weekly_all', LIMIT_LABELS.weekly_all, rl.seven_day, 10080);
    add('weekly_opus', 'Weekly · Opus only', rl.seven_day_opus, 10080);
    add('weekly_sonnet', 'Weekly · Sonnet only', rl.seven_day_sonnet, 10080);
  }
  const ex: Json | null = rl.extra_usage ?? null;
  const acct = init?.account ?? {};
  return {
    agent: 'claude',
    ok: true,
    fetchedAt: Date.now(),
    account: { email: acct.email, plan: acct.subscriptionType ?? raw.subscription_type ?? undefined, org: acct.organization },
    windows,
    extra: ex
      ? {
          enabled: !!ex.is_enabled,
          monthlyLimit: ex.monthly_limit ?? null,
          used: ex.used_credits ?? null,
          utilization: ex.utilization ?? null,
          currency: ex.currency ?? null,
          note: ex.is_enabled ? undefined : ex.user_disabled ? 'Extra usage is turned off' : ex.disabled_reason ?? 'Extra usage is not enabled',
        }
      : null,
    breakdown: Array.isArray(rl.seven_day_breakdown?.rows) ? rl.seven_day_breakdown.rows.map((r: Json) => ({ label: r.display_name, percent: r.percent })) : undefined,
    limited: usedUp(windows),
  };
}

export function ensureProbeDir() {
  fs.mkdirSync(paths.probe, { recursive: true });
}
