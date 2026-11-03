// Apps as tools for other agents on the app's MCP server (/mcp, with a token from Settings → Connect
// other agents): each app that allows it, its form as the tool's input. A call runs the app and waits
// for the answer; a long run comes back with its id, for app_run_status.
import type { AppDef } from '../../shared/apps.ts';
import { isActive } from '../../shared/apps.ts';
import { featureDeps } from '../features/registry.ts';
import type { ToolOutput } from '../features/types.ts';
import { apiAnswer, checkDaily, waitSeconds } from './api.ts';
import { stepsOf } from './flow.ts';
import { isFlowRun, startRun, waitFor } from './runs.ts';
import { getRun, listApps } from './store.ts';

interface ExternalTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, any>) => Promise<string | ToolOutput>;
}

export const toolName = (slug: string) => `app_${slug.replace(/-/g, '_')}`.slice(0, 64);

function inputSchema(a: AppDef): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const f of a.fields) {
    const description = [f.label, f.help, f.placeholder && `For example: ${f.placeholder}`].filter(Boolean).join('. ');
    if (f.type === 'number') properties[f.id] = { type: 'number', description };
    else if (f.type === 'yesno') properties[f.id] = { type: 'boolean', description };
    else if (f.type === 'choice') properties[f.id] = { type: 'string', enum: f.options ?? [], description };
    else if (f.type === 'date') properties[f.id] = { type: 'string', description: `${description}. A date, YYYY-MM-DD.` };
    else if (f.type === 'file') properties[f.id] = { type: 'string', description: `${description}. The file's text, or the path of a file on this machine.` };
    else properties[f.id] = { type: 'string', description };
  }
  properties.wait = { type: 'number', description: 'Seconds to wait for the answer (default 120, at most 600). A longer run returns its id: then call app_run_status.' };
  return { type: 'object', properties, required: a.fields.filter((f) => f.required && f.type !== 'file').map((f) => f.id) };
}

const answerText = (r: NonNullable<ReturnType<typeof getRun>>) => {
  const { publicBase } = featureDeps();
  const out = apiAnswer(r, (key) => `${publicBase()}/s/${encodeURIComponent(key)}`, isFlowRun(r) ? stepsOf(r.id) : undefined);
  const note = isActive(r.status) ? `\n\nStill running: call app_run_status with run "${r.id}" for the answer.` : '';
  return `${JSON.stringify(out, null, 2)}${note}`;
};

/** The apps offered to other agents, as tools; and app_run_status when there is any. */
export function appMcpTools(): ExternalTool[] {
  let deps;
  try {
    deps = featureDeps();
  } catch {
    return [];
  }
  const { db } = deps;
  const list = listApps(db).filter((a) => a.mcp);
  if (!list.length) return [];
  const tools: ExternalTool[] = list.map((a) => ({
    name: toolName(a.slug),
    description: `${a.name}: ${a.description || 'an app in Hydor'} (Runs the app “${a.name}” in Hydor and returns its answer${a.answer.length ? `, with a result object of ${a.answer.map((f) => f.id).join(', ')}` : ''}.)`,
    inputSchema: inputSchema(a),
    async run(args) {
      const { wait, ...inputs } = args ?? {};
      checkDaily(db, a);
      const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'mcp', inputs });
      const done = await waitFor(r.id, waitSeconds(wait, 120) * 1000);
      return answerText(done ?? r);
    },
  }));
  tools.push({
    name: 'app_run_status',
    description: 'How an app run started from here is going, or its answer once done: waits up to `wait` seconds for it to finish.',
    inputSchema: { type: 'object', properties: { run: { type: 'string', description: 'The run id an app’s tool returned.' }, wait: { type: 'number', description: 'Seconds to wait (default 60, at most 600).' } }, required: ['run'] },
    async run(args) {
      const r = getRun(db, String(args.run ?? ''));
      if (!r || r.source !== 'mcp') throw new Error('No run with that id was started from here');
      const done = await waitFor(r.id, waitSeconds(args.wait, 60) * 1000);
      return answerText(done ?? r);
    },
  });
  return tools;
}
