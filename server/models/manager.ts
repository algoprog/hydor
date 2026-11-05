// The models Console can use, and installing, running and removing them. It keeps agent.json current
// for the agent process and tells the browser as things change (a download's progress, a server
// coming up). A vLLM model starts when a session first uses it.
import fs from 'node:fs';
import path from 'node:path';
import type { AgentModel, HfInspect, LocalModel, ModelDownload, ModelEntry, ModelOption, ModelsState, VllmServer } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { isLocalAddress } from '../../shared/confidential.ts';
import { keyHint, loadConfig, MODELS_DIR, saveConfig, writeAgentModels, type Endpoint, type ModelsConfig } from './config.ts';
import * as hf from './hf.ts';
import { machine } from './machine.ts';
import { localPicks } from './picks.ts';
import { OPENROUTER_PICKS } from '../../shared/model-picks.ts';
import * as ollama from './ollama.ts';
import * as openrouter from './openrouter.ts';
import * as vllm from './vllm.ts';

type Download = ModelDownload & { abort: AbortController };

export class ModelManager {
  private cfg: ModelsConfig = loadConfig();
  private servers: VllmServer[] = vllm.loadServers().filter((s) => vllm.alive(s.pid));
  private downloads = new Map<string, Download>();
  private ollamaModels: (ModelEntry & { sizeBytes: number; remote?: boolean })[] = [];
  private ollamaVersion: string | null = null;
  private endpointModels = new Map<string, string[]>();
  private endpointContext = new Map<string, number>();
  private pinnedInfo = new Map<string, openrouter.OrModel>();
  private emitTimer: NodeJS.Timeout | null = null;

  constructor(private onChange: (s: ModelsState) => void) {
    // Servers from before a restart that are still running are watched again.
    for (const s of this.servers) this.watch(s);
    vllm.saveServers(this.servers);
    void this.refresh();
    setInterval(() => void this.refresh(), 60_000).unref();
  }

  /** Ollama's models, endpoints' models and the pinned OpenRouter models, then agent.json. */
  async refresh() {
    const c = this.cfg;
    this.ollamaVersion = await ollama.version(c.ollama.url);
    this.ollamaModels = this.ollamaVersion ? await ollama.models(c.ollama.url).catch(() => []) : [];
    for (const e of c.endpoints) {
      try {
        const r = await fetch(`${e.baseUrl.replace(/\/+$/, '')}/models`, { headers: e.apiKey ? { authorization: `Bearer ${e.apiKey}` } : {}, signal: AbortSignal.timeout(5000) });
        const d: any = await r.json();
        this.endpointModels.set(e.id, (d.data ?? []).map((m: any) => String(m.id)));
        // Their context, where the server says (vLLM's max_model_len, others' context_length).
        for (const m of d.data ?? []) {
          const n = Number(m.max_model_len ?? m.context_length ?? m.context_window ?? m.max_context_length);
          if (n > 0) this.endpointContext.set(`${e.id}/${m.id}`, n);
        }
      } catch {
        this.endpointModels.set(e.id, []);
      }
    }
    if (c.openrouter.pinned.length)
      try {
        const all = await openrouter.catalog();
        for (const id of c.openrouter.pinned) {
          const m = all.find((x) => x.id === `openrouter/${id}`);
          if (m) this.pinnedInfo.set(id, m);
        }
      } catch {}
    this.servers = this.servers.filter((s) => s.state === 'failed' || vllm.alive(s.pid));
    this.writeAgent();
    this.emit();
  }

  // ---- what the agent and the pickers see ----------------------------------------------------------

  /** OpenRouter's key is set (apps that need an OpenRouter model add it by themselves then). */
  hasOpenRouterKey(): boolean {
    return !!this.cfg.openrouter.apiKey;
  }

  agentModels(): AgentModel[] {
    const c = this.cfg;
    const out: AgentModel[] = [];
    if (c.openrouter.apiKey)
      for (const id of c.openrouter.pinned) {
        const m = this.pinnedInfo.get(id);
        out.push({
          id: `openrouter/${id}`,
          label: m?.label ?? id,
          provider: 'openrouter',
          baseUrl: openrouter.OPENROUTER_URL,
          apiKey: c.openrouter.apiKey,
          model: id,
          contextLength: m?.contextLength,
          tools: m?.tools ?? 'native',
          vision: m?.vision,
          reasoning: m?.reasoning,
          maxOutput: m?.maxOutput,
          headers: { 'HTTP-Referer': 'https://github.com/algoprog/hydor', 'X-Title': 'Hydor' },
        });
      }
    // Models on this computer or your network (local): Ollama's at a local address, except its cloud models; vLLM's,
    // which run here; endpoints at a local address. What a confidential session may use (server/confidential).
    const ollamaHere = isLocalAddress(c.ollama.url);
    for (const { remote, ...m } of this.ollamaModels)
      out.push({ ...m, baseUrl: ollama.chatUrl(c.ollama.url), model: m.id.slice('ollama/'.length), tools: m.tools ?? 'text', ...(ollamaHere && !remote ? { local: true } : {}) });
    const v = vllm.findVllm(c.vllm.command);
    for (const r of hf.localRepos()) {
      if (!v || !r.arch || !v.archs.has(r.arch)) continue;
      const s = this.servers.find((x) => x.repo === r.repo && x.state !== 'failed');
      out.push({
        id: `vllm/${r.repo}`,
        label: r.repo.split('/')[1],
        provider: 'vllm',
        baseUrl: s ? `http://127.0.0.1:${s.port}/v1` : '',
        model: r.repo,
        contextLength: s?.maxLen ?? Math.min(r.contextLength ?? hf.LOCAL_CONTEXT, hf.LOCAL_CONTEXT),
        tools: (s ? s.parser : vllm.toolParser(r.modelType, v.parsers)) ? 'native' : templateTools(r.dir) ? 'template' : 'text',
        vision: r.vision,
        start: s?.state !== 'ready',
        local: true,
      });
    }
    for (const e of c.endpoints)
      for (const m of this.endpointModels.get(e.id) ?? [])
        out.push({
          id: `endpoint/${e.id}/${m}`,
          label: `${m} (${e.name})`,
          provider: 'endpoint',
          baseUrl: e.baseUrl.replace(/\/+$/, ''),
          apiKey: e.apiKey,
          model: m,
          tools: 'native',
          contextLength: this.endpointContext.get(`${e.id}/${m}`),
          ...(isLocalAddress(e.baseUrl) ? { local: true } : {}),
        });
    return out;
  }

  /**
   * The models a confidential session may use, the best first: those that take tools natively, then the larger,
   * then the longer context. `prefer` (the one picked last) leads when it is one of them.
   */
  localModels(prefer?: string | null): AgentModel[] {
    const size = new Map<string, number>();
    for (const m of this.ollamaModels) size.set(m.id, m.sizeBytes);
    for (const r of hf.localRepos()) size.set(`vllm/${r.repo}`, r.sizeBytes);
    return rankLocal(
      this.agentModels().filter((m) => m.local),
      (m) => size.get(m.id) ?? 0,
      prefer,
    );
  }

  /** The models for the pickers (no addresses or keys). */
  options(): ModelOption[] {
    const where = { openrouter: 'OpenRouter', ollama: 'Ollama', vllm: 'vLLM, on this machine', endpoint: 'Endpoint' };
    return this.agentModels().map((m) => ({
      value: m.id,
      label: m.label,
      description: [where[m.provider], m.contextLength ? `${Math.round(m.contextLength / 1000)}K context` : '', m.start ? 'starts when used' : ''].filter(Boolean).join(' · '),
      efforts: [],
      ...(m.local ? { local: true } : {}),
    }));
  }

  private writeAgent() {
    writeAgentModels(this.agentModels());
  }

  private emit() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      void this.state().then(this.onChange, () => {});
    }, 400);
  }

  async state(): Promise<ModelsState> {
    const c = this.cfg;
    const m = await machine(MODELS_DIR);
    const v = vllm.findVllm(c.vllm.command);
    const local: LocalModel[] = hf.localRepos().map((r) => {
      const s = this.servers.find((x) => x.repo === r.repo);
      return {
        id: `vllm/${r.repo}`,
        repo: r.repo,
        runtime: 'vllm',
        sizeBytes: r.sizeBytes,
        arch: r.arch,
        vision: r.vision,
        supported: v ? (r.arch ? v.archs.has(r.arch) : false) : null,
        reason: v && r.arch && !v.archs.has(r.arch) ? `vLLM ${v.version} does not run ${r.arch} yet` : !v ? 'vLLM is not installed here' : undefined,
        server: s ? { state: s.state, port: s.port, gpu: s.gpu, ...(s.gpus ? { gpus: s.gpus } : {}), error: s.error, startedAt: s.startedAt, util: s.util, maxLen: s.maxLen } : undefined,
        installedAt: r.downloadedAt,
      };
    });
    for (const o of this.ollamaModels) local.push({ id: o.id, repo: o.label, runtime: 'ollama', sizeBytes: o.sizeBytes, detail: o.detail, vision: o.vision, supported: true });
    return {
      openrouter: {
        keyHint: keyHint(c.openrouter.apiKey),
        pinned: c.openrouter.pinned.map((id) => {
          const p = this.pinnedInfo.get(id);
          return p ?? { id: `openrouter/${id}`, label: id, provider: 'openrouter' as const, detail: id };
        }),
      },
      ollama: { url: c.ollama.url, version: this.ollamaVersion ?? undefined },
      vllm: { command: c.vllm.command, path: v?.path, version: v?.version },
      endpoints: c.endpoints.map((e) => ({ id: e.id, name: e.name, baseUrl: e.baseUrl, keyHint: keyHint(e.apiKey), models: this.endpointModels.get(e.id) ?? [] })),
      hfTokenHint: keyHint(c.hfToken),
      local,
      downloads: [...this.downloads.values()].map(({ abort: _a, ...d }) => d),
      machine: m,
      storage: { usedBytes: local.reduce((a, l) => a + l.sizeBytes, 0), freeBytes: m.diskFreeBytes },
    };
  }

  // ---- settings ------------------------------------------------------------------------------------

  async configure(p: {
    openrouterKey?: string | null;
    pin?: string;
    unpin?: string;
    ollamaUrl?: string;
    vllmCommand?: string | null;
    hfToken?: string | null;
    endpoint?: Partial<Endpoint> & { remove?: boolean };
  }) {
    const c = this.cfg;
    if (p.openrouterKey !== undefined) c.openrouter.apiKey = p.openrouterKey?.trim() || undefined;
    if (p.pin) {
      const id = p.pin.replace(/^openrouter\//, '');
      if (!c.openrouter.pinned.includes(id)) c.openrouter.pinned.push(id);
    }
    if (p.unpin) c.openrouter.pinned = c.openrouter.pinned.filter((id) => id !== p.unpin!.replace(/^openrouter\//, ''));
    if (p.ollamaUrl !== undefined) {
      if (!/^https?:\/\/\S+$/.test(p.ollamaUrl.trim())) throw new HttpError(400, 'Give Ollama’s address, like http://127.0.0.1:11434');
      c.ollama.url = p.ollamaUrl.trim();
    }
    if (p.vllmCommand !== undefined) c.vllm.command = p.vllmCommand?.trim() || undefined;
    if (p.hfToken !== undefined) c.hfToken = p.hfToken?.trim() || undefined;
    if (p.endpoint) {
      const e = p.endpoint;
      if (e.remove) c.endpoints = c.endpoints.filter((x) => x.id !== e.id);
      else {
        if (!e.name?.trim() || !/^https?:\/\/\S+$/.test(e.baseUrl?.trim() ?? '')) throw new HttpError(400, 'Give the endpoint a name and its address (…/v1)');
        const id = e.id ?? (e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'endpoint');
        const prev = c.endpoints.find((x) => x.id === id);
        c.endpoints = [...c.endpoints.filter((x) => x.id !== id), { id, name: e.name.trim(), baseUrl: e.baseUrl!.trim(), apiKey: e.apiKey === undefined ? prev?.apiKey : e.apiKey || undefined }];
      }
    }
    saveConfig(c);
    await this.refresh();
    return this.state();
  }

  search = (o: openrouter.OrQuery) => openrouter.search(o);

  /** The OpenRouter models suggested for Custom (text), in their order, each with why: those OpenRouter still lists. */
  async openRouterPicks() {
    const all = await openrouter.catalog();
    return OPENROUTER_PICKS.filter((p) => p.role === 'text').flatMap((p) => {
      const m = all.find((x) => x.id === `openrouter/${p.id}`);
      return m ? [{ ...m, note: p.note }] : [];
    });
  }

  /** Models on Hugging Face, each with a first guess of how it runs on this machine. */
  async searchHf(o: hf.HfQuery) {
    return hf.search(o, { token: this.cfg.hfToken, machine: await machine(MODELS_DIR) });
  }

  /** The models suggested for this computer (shared/model-picks.ts), as they are for it. */
  async picks() {
    const v = vllm.findVllm(this.cfg.vllm.command);
    const st = await this.state();
    return localPicks({ machine: await machine(MODELS_DIR), token: this.cfg.hfToken, runtimes: { vllm: v ? { archs: v.archs } : null, ollama: !!this.ollamaVersion }, local: st.local, downloads: st.downloads });
  }

  async inspect(input: string): Promise<HfInspect> {
    const v = vllm.findVllm(this.cfg.vllm.command);
    return hf.inspect(input, { token: this.cfg.hfToken, machine: await machine(MODELS_DIR), vllmArchs: v?.archs ?? null });
  }

  // ---- installing and removing ---------------------------------------------------------------------

  /** Downloads a model for vLLM (its safetensors), or has Ollama pull one (GGUF from Hugging Face included). */
  async install(o: { repo?: string; ollama?: string }) {
    const target = o.ollama ? 'ollama' : 'vllm';
    const name = o.ollama ?? hf.parseRepo(o.repo ?? '');
    if (!name) throw new HttpError(400, 'Which model?');
    const key = `${target}:${name}`;
    if (this.downloads.get(key)?.status === 'running') throw new HttpError(409, 'It is downloading already');
    if (target === 'ollama' && !this.ollamaVersion) throw new HttpError(400, `Ollama is not running at ${this.cfg.ollama.url}`);
    const info = target === 'vllm' ? await this.inspect(name) : null;
    if (info && info.kind !== 'safetensors') throw new HttpError(400, 'vLLM needs safetensors weights; this repository has none (a GGUF one installs with Ollama)');
    const d: Download = { key, name, target, doneBytes: 0, totalBytes: info?.downloadBytes ?? 0, status: 'running', startedAt: Date.now(), abort: new AbortController() };
    this.downloads.set(key, d);
    this.emit();
    const progress = (done: number, total: number, detail?: string) => {
      d.doneBytes = done;
      d.totalBytes = total || d.totalBytes;
      d.detail = detail;
      this.emit();
    };
    const work =
      target === 'ollama'
        ? ollama.pull(this.cfg.ollama.url, name, progress, d.abort.signal)
        : hf.download(name, { token: this.cfg.hfToken, info: info!, progress, signal: d.abort.signal });
    work
      .then(() => {
        d.status = 'done';
        // A finished download leaves the list after a while.
        setTimeout(() => this.downloads.get(key) === d && (this.downloads.delete(key), this.emit()), 60_000).unref();
      })
      .catch((e) => {
        d.status = d.abort.signal.aborted ? 'cancelled' : 'failed';
        d.error = (e as Error).message;
      })
      .finally(() => void this.refresh());
  }

  cancel(key: string) {
    const d = this.downloads.get(key);
    if (d?.status === 'running') d.abort.abort();
    else if (d) this.downloads.delete(key);
    this.emit();
  }

  async uninstall(id: string) {
    if (id.startsWith('ollama/')) await ollama.remove(this.cfg.ollama.url, id.slice('ollama/'.length));
    else if (id.startsWith('vllm/')) {
      const repo = id.slice('vllm/'.length);
      this.stop(repo);
      hf.removeRepo(repo);
    } else throw new HttpError(400, 'Only models on this machine can be removed');
    await this.refresh();
  }

  // ---- vLLM servers --------------------------------------------------------------------------------

  async start(repo: string, o: { gpu?: number; maxLen?: number } = {}): Promise<VllmServer> {
    const running = this.servers.find((s) => s.repo === repo && s.state !== 'failed');
    if (running) return running;
    const v = vllm.findVllm(this.cfg.vllm.command);
    if (!v) throw new HttpError(400, 'vLLM is not installed here (pip install vllm), or set its command in Settings → Models');
    const r = hf.localRepos().find((x) => x.repo === repo);
    if (!r) throw new HttpError(404, 'That model is not downloaded');
    if (!r.arch || !v.archs.has(r.arch)) throw new HttpError(400, `vLLM ${v.version} does not run ${r.arch ?? 'this architecture'} yet`);
    const weightsBytes = fs
      .readdirSync(r.dir)
      .filter((f) => f.endsWith('.safetensors'))
      .reduce((a, f) => a + fs.statSync(path.join(r.dir, f)).size, 0);
    this.servers = this.servers.filter((s) => s.repo !== repo);
    const s = await vllm.startServer(v, { repo, dir: r.dir, machine: await machine(MODELS_DIR), weightsBytes, customCode: r.customCode, ...o });
    this.servers.push(s);
    vllm.saveServers(this.servers);
    this.watch(s);
    this.writeAgent();
    this.emit();
    return s;
  }

  stop(repo: string) {
    for (const s of this.servers.filter((x) => x.repo === repo)) vllm.stopServer(s);
    this.servers = this.servers.filter((x) => x.repo !== repo);
    vllm.saveServers(this.servers);
    this.writeAgent();
    this.emit();
  }

  /** Follows a starting server until it answers (ready) or its process ends (failed, with the log's reason). */
  private watch(s: VllmServer) {
    const t = setInterval(async () => {
      if (!this.servers.includes(s)) return clearInterval(t);
      if (await vllm.ready(s)) {
        if (s.state !== 'ready') {
          s.state = 'ready';
          vllm.saveServers(this.servers);
          this.writeAgent();
          this.emit();
        }
      } else if (!vllm.alive(s.pid)) {
        clearInterval(t);
        s.state = 'failed';
        s.error = vllm.logTail(s) || 'vLLM stopped';
        vllm.saveServers(this.servers);
        this.writeAgent();
        this.emit();
      }
    }, 2000);
    t.unref();
  }

  /** A model ready to take requests: a vLLM model's server is started and awaited. */
  async ensure(id: string): Promise<AgentModel> {
    let m = this.agentModels().find((x) => x.id === id);
    if (!m) throw new HttpError(404, `${id} is not among the models in Settings → Models`);
    if (m.provider !== 'vllm') return m;
    const s = await this.start(m.model);
    const until = Date.now() + 15 * 60_000;
    while (s.state === 'starting' && Date.now() < until) await new Promise((r) => setTimeout(r, 1000));
    if (s.state !== 'ready') throw new HttpError(500, `vLLM did not start ${m.model}: ${s.error ?? 'it took too long'}`);
    m = this.agentModels().find((x) => x.id === id)!;
    return m;
  }
}

const TOOL_RANK = { native: 3, template: 2, text: 1 } as const;

/** Local models, the best first (see localModels); `sizeOf` gives a model's size in bytes (0 when not known). */
export function rankLocal(models: AgentModel[], sizeOf: (m: AgentModel) => number, prefer?: string | null): AgentModel[] {
  const ranked = [...models].sort((a, b) => TOOL_RANK[b.tools] - TOOL_RANK[a.tools] || sizeOf(b) - sizeOf(a) || (b.contextLength ?? 0) - (a.contextLength ?? 0));
  const i = prefer ? ranked.findIndex((m) => m.id === prefer) : -1;
  return i > 0 ? [ranked[i], ...ranked.slice(0, i), ...ranked.slice(i + 1)] : ranked;
}

/** Whether a model's chat template lays out tools (so it can be shown them in its own format). */
function templateTools(dir: string): boolean {
  for (const f of ['chat_template.jinja', 'chat_template.json', 'tokenizer_config.json'])
    try {
      if (/\btools\b/.test(fs.readFileSync(path.join(dir, f), 'utf8'))) return true;
    } catch {}
  return false;
}

