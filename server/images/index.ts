// Image generation through OpenRouter, shown in the conversation.
//
// generate_image (on each session's own MCP server, while it is on in Settings → Images) makes images
// with the image model picked there, or the app's choice, using the OpenRouter key from Settings →
// Models; they are saved into the session's folder (images/) and shown with the reply.
//   GET/PUT /api/images/settings   on or off, and the model (ImagesState)
//   GET     /api/images/models     OpenRouter's image models, by name, newest or cheapest first
import path from 'node:path';
import type { ImageModel, ImagesState } from '../../shared/images.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Feature, RunTool } from '../features/types.ts';
import { inSession } from '../documents/index.ts';
import { loadConfig } from '../models/config.ts';
import { OPENROUTER_URL } from '../models/openrouter.ts';
import { ASPECTS, generate, imageModels, PREFERRED, readReferences, saveImages, SIZES } from './openrouter.ts';

interface Settings {
  enabled: boolean;
  model: string;
}

function settings(db: DB): Settings {
  try {
    const s = JSON.parse(kvGet(db, 'images') ?? '{}');
    return { enabled: s.enabled !== false, model: typeof s.model === 'string' ? s.model : '' };
  } catch {
    return { enabled: true, model: '' };
  }
}

const models = () => imageModels(OPENROUTER_URL);

/** The model in use: the one picked, or the first of the app's choices OpenRouter still lists. */
async function using(s: Settings): Promise<{ id: string; info?: ImageModel }> {
  const list = await models().catch(() => [] as ImageModel[]);
  const id = s.model || PREFERRED.find((p) => list.some((m) => m.id === p)) || PREFERRED[0];
  return { id, info: list.find((m) => m.id === id) };
}

async function state(db: DB): Promise<ImagesState> {
  const s = settings(db);
  const u = await using(s);
  return { enabled: s.enabled, model: s.model, using: u.id, usingInfo: u.info, keySet: !!loadConfig().openrouter.apiKey };
}

const NO_KEY =
  'Image generation goes through OpenRouter, and no OpenRouter key is set. Tell the user to add one in Settings → Models → OpenRouter (keys come from https://openrouter.ai/keys); then try again.';

const money = (n: number) => (n >= 0.995 ? `$${n.toFixed(2)}` : `$${n.toPrecision(2).replace(/0+$/, '')}`);
const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function tool(db: DB): RunTool {
  return {
    name: 'generate_image',
    // It writes files and asks a service outside, at a cost.
    annotations: { readOnlyHint: false, openWorldHint: true },
    description: [
      'Make an image from a description, or change pictures the user has, with an image model through OpenRouter (picked in Settings → Images).',
      'The images are saved in the session’s folder (images/) and shown to the user with your reply, so do not repeat them or their paths.',
      'Describe what you want fully: subject, setting, style (photo, illustration, watercolour…), composition, colours, light, and any text',
      'to appear, word for word. To edit or combine pictures, give their paths in images and say what to change.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to make, or what to change in the given images.' },
        images: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Paths of pictures to edit or take after (PNG, JPEG, WebP, GIF), up to 4.' },
        aspect_ratio: { type: 'string', enum: ASPECTS, description: 'The shape: 1:1 square (the default), 16:9 wide, 9:16 tall, and others.' },
        size: { type: 'string', enum: SIZES, description: 'Resolution, where the model offers a choice: 1K (the default), 2K or 4K (slower and dearer).' },
        name: { type: 'string', description: 'A short file name, without extension (default: from the prompt).' },
      },
      required: ['prompt'],
    },
    async run(a, ctx) {
      const key = loadConfig().openrouter.apiKey;
      if (!key) return { isError: true, text: NO_KEY };
      const prompt = String(a.prompt ?? '').trim();
      if (!prompt) throw new Error('Say what to make in prompt.');
      const refs = await readReferences((Array.isArray(a.images) ? a.images : []).map((p: unknown) => inSession(ctx.cwd, String(p))));
      const s = settings(db);
      const { id, info } = await using(s);
      if (refs.length && info && !info.edits) throw new Error(`${info.label} does not take pictures to work from. Describe the change in words, or the user can pick a model that edits pictures in Settings → Images.`);
      const r = await generate({ base: OPENROUTER_URL, key, model: id, prompt, refs, aspect: a.aspect_ratio, size: a.size, textOut: info?.textOut });
      if (!r.images.length) return { isError: true, text: `${id} answered without an image${r.text ? `: “${r.text.slice(0, 600)}”` : '.'} Try describing it differently.` };
      const saved = await saveImages(r.images, path.join(ctx.cwd, 'images'), String(a.name ?? '').trim() || prompt);
      const lines = saved.map((f) => `${f.path} (${f.w && f.h ? `${f.w}×${f.h}, ` : ''}${size(f.bytes)})`);
      return [
        `Made ${saved.length === 1 ? 'an image' : `${saved.length} images`} with ${id}${r.cost ? ` (${money(r.cost)})` : ''}:`,
        ...lines,
        'The user sees it with your reply, a tap away from full size and download: don’t repeat it or its path. To look at it yourself, open the file.',
        ...(r.text ? [`The model said: ${r.text.slice(0, 600)}`] : []),
      ].join('\n');
    },
  };
}

export const images: Feature = {
  id: 'images',
  routes({ app, db }) {
    app.get('/api/images/settings', async () => state(db));
    app.put('/api/images/settings', async (req) => {
      const b = (req.body ?? {}) as { enabled?: unknown; model?: unknown };
      const s = settings(db);
      if (typeof b.enabled === 'boolean') s.enabled = b.enabled;
      if (typeof b.model === 'string' && /^[\w.~:/-]{0,120}$/.test(b.model)) s.model = b.model;
      kvSet(db, 'images', JSON.stringify(s));
      return state(db);
    });
    app.get('/api/images/models', async (req) => {
      const q = req.query as Record<string, string>;
      const words = String(q.q ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const list = (await models()).filter((m) => words.every((w) => `${m.id} ${m.label} ${m.org ?? ''}`.toLowerCase().includes(w)));
      const newer = (x: ImageModel, y: ImageModel) => (y.created ?? 0) - (x.created ?? 0);
      list.sort(q.sort === 'price' ? (x, y) => (x.perImage ?? Infinity) - (y.perImage ?? Infinity) || newer(x, y) : newer);
      return { models: list.slice(0, 100) };
    });
  },
  tools: ({ deps }) => (settings(deps.db).enabled ? [tool(deps.db)] : []),
};
