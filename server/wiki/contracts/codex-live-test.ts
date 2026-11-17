// Opt-in integration: a real Codex process calls Hydor's MCP contract tools with a local synthetic model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import Fastify from 'fastify';
import type { ApprovalRequest } from '../../../shared/types.ts';
import { openDb } from '../../db.ts';
import type { Deps } from '../../features/types.ts';
import { registerFeatures } from '../../features/registry.ts';
import { mcpRoutes, runToken } from '../../mcp.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { createSpace } from '../../spaces/index.ts';
import { wiki } from '../index.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { previewContract } from './tools.ts';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-contract-codex-')));
const project = path.join(temp, 'project'), root = path.join(project, '.wiki'), codexHome = path.join(temp, 'codex-home');
for (const folder of [path.join(root, 'wiki'), codexHome]) fs.mkdirSync(folder, { recursive: true });
const source = '# Synthetic source\nAlways cite the original source.\n';
fs.writeFileSync(path.join(root, 'wiki', 'source.md'), source);
const db = openDb(path.join(temp, 'test.db'));
const app = Fastify();
const runId = 'contract-e2e', key = 'codex:synthetic-contract';
const input = { slug: 'citations', title: 'Citations', scope: 'Research', origin: 'Synthetic user request', sourcePath: 'wiki/source.md' };
const expected = previewContract(root, input);
const seen: string[] = [];
const cards: ApprovalRequest[] = [];
let modelCalls = 0;
let modelError = '';
let offered: string[] = [];
let child: ReturnType<typeof spawn> | undefined;
const model = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const request = JSON.parse(body) as { tools?: { name?: string; tools?: { name?: string }[] }[]; input?: unknown };
      offered = (request.tools ?? []).map((tool) => String(tool.name ?? ''));
      const namespace = request.tools?.find((tool) => tool.name === 'mcp__hydor');
      const name = (suffix: string) => namespace?.tools?.find((tool) => tool.name === suffix)?.name;
      modelCalls++;
      let item: Record<string, unknown>;
      if (modelCalls <= 2) {
        const toolName = name(modelCalls === 1 ? 'wiki_contract_preview' : 'wiki_contract_adopt');
        if (!toolName) throw new Error('Expected contract tool was not offered to the real agent');
        const args = modelCalls === 1 ? input : { ...input, sha256: expected.sha256 };
        if (modelCalls === 2 && !JSON.stringify(request.input).includes(expected.sha256)) throw new Error('The preview was not returned to the agent');
        item = { id: `fc_${modelCalls}`, type: 'function_call', call_id: `call_${modelCalls}`, namespace: 'mcp__hydor', name: toolName, arguments: JSON.stringify(args), status: 'completed' };
      } else {
        item = { id: 'msg_final', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Synthetic contract reviewed.', annotations: [] }] };
      }
      const events = [
        { type: 'response.created', response: { id: `resp_${modelCalls}` } },
        { type: 'response.output_item.added', output_index: 0, item },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: `resp_${modelCalls}`, status: 'completed', output: [item], usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } },
      ];
      const data = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
      res.writeHead(200, { 'content-type': 'text/event-stream', 'content-length': Buffer.byteLength(data) });
      res.end(data);
    } catch (error) { modelError = String(error); res.writeHead(500); res.end(modelError); }
  });
});

try {
  setWikiSettings(db, { enabled: true, projectWikis: 'folder', projectPath: '.wiki', gitIgnore: false });
  const space = createSpace(db, { name: 'Synthetic project', folder: project });
  setSessionExtra(db, key, { space: space.id });
  const adapter = {
    callStarted: () => {},
    ask: async (card: ApprovalRequest) => {
      cards.push(card);
      // The test's simulated user accepts only after inspecting the exact previewed content.
      assert.ok(card.detail?.includes(expected.content.trimEnd()));
      assert.equal(fs.existsSync(path.join(root, 'wiki/contracts/citations.md')), false);
      return { decision: 'accept', form: { confirmed: 'Yes' } };
    },
  };
  const sessions = { liveByRun: (id: string) => id === runId ? { key, agent: 'codex', cwd: project } : null, adapterByRun: () => adapter };
  const deps = { app, db, sessions, broadcast: () => {} } as unknown as Deps;
  registerFeatures([wiki], deps);
  mcpRoutes(app, db, sessions as never, () => '');
  app.addHook('preHandler', async (req) => {
    const rpc = req.body as { method?: string; params?: { name?: string } } | undefined;
    if (rpc?.method === 'tools/call') seen.push(String(rpc.params?.name));
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
  const appPort = (app.server.address() as { port: number }).port, modelPort = (model.address() as { port: number }).port;
  fs.writeFileSync(path.join(codexHome, 'config.toml'), `model="gpt-5"\nmodel_provider="mock"\nweb_search="disabled"\n[features]\nplugins=false\n[model_providers.mock]\nname="Local synthetic model"\nbase_url="http://127.0.0.1:${modelPort}/v1"\nwire_api="responses"\nrequires_openai_auth=false\nrequest_max_retries=0\nstream_max_retries=0\n[mcp_servers.hydor]\nurl="http://127.0.0.1:${appPort}/mcp/run/${runToken(runId)}"\n`);
  const env = Object.fromEntries(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].filter((name) => process.env[name] !== undefined).map((name) => [name, process.env[name]!])) as Record<string, string>;
  // No real account, user workspace or external model provider is passed to the subprocess.
  Object.assign(env, { HOME: temp, USERPROFILE: temp, CODEX_HOME: codexHome });
  // The fixed local model can call only the two synthetic MCP actions; Full access tests the app's own approval card.
  child = spawn(process.env.CODEX_BIN ?? 'codex', ['exec', '--skip-git-repo-check', '--sandbox', 'danger-full-access', '-c', 'approval_policy="never"', '--json', '-C', project, 'Review the synthetic citation requirement.'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout!.on('data', (data) => { output = (output + data).slice(-30_000); });
  child.stderr!.on('data', (data) => { output = (output + data).slice(-30_000); });
  const status = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => { child?.kill(); reject(new Error('Codex contract integration timed out')); }, 90_000);
    child!.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child!.once('close', (code) => { clearTimeout(timeout); resolve(code); });
  });
  assert.equal(status, 0, `${output}\nModel error: ${modelError}\nOffered: ${offered.join(', ')}`);
  assert.deepEqual(seen.filter((name) => name.startsWith('wiki_contract_')), ['wiki_contract_preview', 'wiki_contract_adopt'], `${output}\nModel calls: ${modelCalls}`);
  assert.equal(cards.length, 1);
  assert.equal(fs.readFileSync(path.join(root, 'wiki/contracts/citations.md'), 'utf8'), expected.content);
  console.log('Real Codex used Hydor MCP to preview and adopt a synthetic contract after a simulated user approval');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill();
  app.server.closeAllConnections(); await app.close();
  model.closeAllConnections(); await new Promise<void>((resolve) => model.close(() => resolve()));
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
