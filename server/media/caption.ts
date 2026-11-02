// The title and description of each image and video kept in the Library, written by a model that sees images:
// a picture is shown to it (a smaller copy), a video as ten of its frames on one picture (frames.ts), with what
// it was made from as a hint. Settings → Images and video picks the model and where it runs: the app's choice
// (a cheap vision model through OpenRouter when a key is set, else Claude Haiku through Claude Code), any
// vision model in OpenRouter's catalog, Claude through the Claude Code sign-in, or one of the models added in
// Settings → Models (Ollama, vLLM, an endpoint). Without one, the title and description come from the prompt.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LANGS } from '../../shared/i18n.ts';
import { CAPTION_PROVIDERS, type CaptionModelOption, type CaptionProvider, type CaptionSettings, type MediaItem } from '../../shared/media.ts';
import type { AgentModel } from '../../shared/types.ts';
import { chat } from '../agent/llm.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { HEADERS } from '../images/openrouter.ts';
import { userLang } from '../language/index.ts';
import { loadConfig } from '../models/config.ts';
import { catalog, OPENROUTER_URL, search } from '../models/openrouter.ts';
import { askClaudeAbout } from '../oneshot.ts';
import { frameGrid, still } from './frames.ts';
import { filesOf } from './store.ts';

const KEY = 'media.captions';

/** The app's choice through OpenRouter: the first it still lists. */
export const PREFERRED_CAPTION = ['google/gemini-3.5-flash-lite', 'google/gemini-3.1-flash-lite', 'google/gemini-2.5-flash-lite', 'anthropic/claude-haiku-5.5', 'openai/gpt-6-luna'];

const CLAUDE: CaptionModelOption[] = [
  { id: 'haiku', label: 'Claude Haiku', detail: 'Quick, and enough for a title', vision: true },
  { id: 'sonnet', label: 'Claude Sonnet', detail: 'Closer descriptions, slower', vision: true },
  { id: 'opus', label: 'Claude Opus', detail: 'The most careful, the slowest', vision: true },
];

const WHERE: Record<Exclude<CaptionProvider, 'auto'>, string> = { openrouter: 'through OpenRouter', claude: 'through Claude Code', ollama: 'with Ollama', vllm: 'with vLLM, on this machine', endpoint: 'through an endpoint' };

export function captionChoice(db: DB): { provider: CaptionProvider; model: string } {
  try {
    const s = JSON.parse(kvGet(db, KEY) ?? '{}');
    return { provider: CAPTION_PROVIDERS.includes(s.provider) ? s.provider : 'auto', model: typeof s.model === 'string' ? s.model : '' };
  } catch {
    return { provider: 'auto', model: '' };
  }
}

export function setCaptionChoice(db: DB, b: { provider?: unknown; model?: unknown }) {
  const provider = CAPTION_PROVIDERS.includes(b.provider as CaptionProvider) ? (b.provider as CaptionProvider) : null;
  if (!provider) throw new HttpError(400, `provider: one of ${CAPTION_PROVIDERS.join(', ')}`);
  const model = typeof b.model === 'string' ? b.model.trim().slice(0, 200) : '';
  if (model && !/^[\w.~:/@+-]{1,200}$/.test(model)) throw new HttpError(400, 'model: a model’s id');
  kvSet(db, KEY, JSON.stringify({ provider, model: provider === 'auto' ? '' : model }));
}

const localModels = (d: Pick<Deps, 'models'>, provider: 'ollama' | 'vllm' | 'endpoint'): AgentModel[] => {
  try {
    return d.models.agentModels().filter((m) => m.provider === provider);
  } catch {
    return [];
  }
};

/** The models to pick from for a provider: OpenRouter's vision models (by words), Claude's, or those added in Settings → Models. */
export async function captionModels(d: Pick<Deps, 'models'>, provider: CaptionProvider, q = ''): Promise<CaptionModelOption[]> {
  switch (provider) {
    case 'openrouter': {
      const list = await search({ q, vision: true, sort: q.trim() ? 'match' : 'new' }, 60);
      return list.map((m) => ({
        id: m.id.replace(/^openrouter\//, ''),
        label: m.label,
        detail: [m.org, m.price ? `$${m.price.input < 1 ? m.price.input.toPrecision(2) : m.price.input.toFixed(2)} / $${m.price.output < 1 ? m.price.output.toPrecision(2) : m.price.output.toFixed(2)} a million tokens` : ''].filter(Boolean).join(' · '),
        vision: true,
      }));
    }
    case 'claude':
      return CLAUDE;
    case 'ollama':
    case 'vllm':
    case 'endpoint':
      // An endpoint does not say whether its models see images: they are offered all the same.
      return localModels(d, provider)
        .filter((m) => provider === 'endpoint' || m.vision)
        .map((m) => ({ id: m.id, label: m.label, detail: m.start ? 'Starts when used' : undefined, vision: provider === 'endpoint' ? null : true }));
    default:
      return [];
  }
}

interface Writer {
  provider: Exclude<CaptionProvider, 'auto'>;
  model: string;
  label: string;
  /** The model's answer about the picture at `file`. */
  ask(system: string, prompt: string, file: string, signal: AbortSignal): Promise<string>;
}

const claudeOk = () => {
  try {
    return path.isAbsolute(config.claudeBin) ? fs.existsSync(config.claudeBin) : true;
  } catch {
    return false;
  }
};

function viaChat(m: AgentModel, provider: Writer['provider'], d: Pick<Deps, 'models'>): Writer {
  return {
    provider,
    model: m.id,
    label: `${m.label}, ${WHERE[provider]}`,
    async ask(system, prompt, file, signal) {
      let model = m;
      if (model.start) model = await d.models.ensure(model.id);
      const data = (await fs.promises.readFile(file)).toString('base64');
      const r = await chat(model, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${data}` } }] },
        ],
        signal,
        onText: () => {},
        onReasoning: () => {},
        maxTokens: 600,
      });
      return r.text;
    },
  };
}

function openrouterModel(id: string, label: string, key: string): AgentModel {
  return { id: `openrouter/${id}`, label, provider: 'openrouter', baseUrl: OPENROUTER_URL, apiKey: key, model: id, tools: 'text', vision: true, headers: HEADERS };
}

/** The model that writes them now, or why there is none. */
export async function captionWriter(db: DB, d: Pick<Deps, 'models'>): Promise<Writer | { why: string }> {
  const c = captionChoice(db);
  const key = loadConfig().openrouter.apiKey;
  const claude = (model: string): Writer => {
    const o = CLAUDE.find((x) => x.id === model) ?? CLAUDE[0];
    return { provider: 'claude', model: o.id, label: `${o.label}, ${WHERE.claude}`, ask: (system, prompt, file) => askClaudeAbout({ system, prompt: `${prompt}\n\nThe picture: ${file}`, model: o.id as 'haiku', files: [file] }) };
  };
  const openrouter = async (model: string): Promise<Writer | { why: string }> => {
    if (!key) return { why: 'No OpenRouter key is set (Settings → Models → OpenRouter).' };
    const list = await catalog().catch(() => []);
    const id = model || PREFERRED_CAPTION.find((p) => list.some((m) => m.id === `openrouter/${p}` && m.vision)) || PREFERRED_CAPTION[0];
    const info = list.find((m) => m.id === `openrouter/${id}`);
    if (list.length && !info) return { why: `OpenRouter no longer has ${id}: pick another model.` };
    if (info && !info.vision) return { why: `${info.label} does not see images: pick one that does.` };
    return viaChat(openrouterModel(id, info?.label ?? id, key), 'openrouter', d);
  };
  switch (c.provider) {
    case 'auto':
      if (key) return openrouter('');
      if (claudeOk()) return claude('haiku');
      return { why: 'No model that sees images: add an OpenRouter key, or pick one in Settings → Images and video.' };
    case 'openrouter':
      return openrouter(c.model);
    case 'claude':
      return claude(c.model);
    default: {
      const list = localModels(d, c.provider);
      const m = list.find((x) => x.id === c.model) ?? (c.model ? undefined : list.find((x) => c.provider === 'endpoint' || x.vision));
      if (!m) return { why: c.model ? `${c.model} is no longer in Settings → Models: pick another model.` : `No model ${WHERE[c.provider]} sees images.` };
      return viaChat(m, c.provider, d);
    }
  }
}

export async function captionSettings(db: DB, d: Pick<Deps, 'models'>): Promise<CaptionSettings> {
  const c = captionChoice(db);
  const w = await captionWriter(db, d).catch((e) => ({ why: String((e as Error).message ?? e) }));
  return { ...c, ...('why' in w ? { why: w.why } : { using: { provider: w.provider, model: w.model, label: w.label } }) };
}

// ---- writing them -----------------------------------------------------------------------------------------

/** "Red paper boat, drifting on a pond. Calm…" → a title from the words it was made from, or from its file's name. */
export function titleFrom(m: Pick<MediaItem, 'prompt' | 'kind'> & { name?: string }): string {
  const words = (m.prompt ?? '').replace(/\s+/g, ' ').trim();
  if (words) {
    const first = words.split(/(?<=[.!?;:])\s|,\s|\s[-–—]\s/)[0].replace(/[.!?;:,]+$/, '');
    const cut = first.length > 60 ? `${first.slice(0, 57).replace(/\s+\S*$/, '')}…` : first;
    return cut.charAt(0).toUpperCase() + cut.slice(1);
  }
  const base = (m.name ?? '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : m.kind === 'video' ? 'Video' : 'Image';
}

/** The first JSON object in a model's answer, with its title and description cleaned up. */
export function readCaption(raw: string): { title: string; description: string } | null {
  const s = raw.replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const j = JSON.parse(s.slice(a, b + 1));
    const title = String(j.title ?? '')
      .replace(/^["'“‘«]+|["'”’»]+$/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\.$/, '')
      .trim()
      .slice(0, 120);
    const description = String(j.description ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);
    return title ? { title, description } : null;
  } catch {
    return null;
  }
}

const SYSTEM = [
  'You write the title and description of a picture or a video someone keeps in their media library, from what you see in it.',
  'Say what it shows: the subject, the setting, the style and the mood, and for a video what happens and how things move.',
  'The title: at most 8 words, no quotes and no full stop at the end. The description: 1 to 3 plain sentences, at most 60 words, without starting "This image" or "This video".',
  'Answer with JSON only: {"title": "…", "description": "…"}.',
].join(' ');

/** The picture the model sees: a video's frames, or a smaller copy of an image (made in `tmp`). */
async function pictureOf(m: MediaItem, tmp: string): Promise<string | null> {
  const f = filesOf(m);
  if (m.kind === 'video') {
    if (!fs.existsSync(f.frames)) await frameGrid(f.file, f.frames, { duration: m.duration, width: m.width, height: m.height });
    return fs.existsSync(f.frames) ? f.frames : null;
  }
  const small = path.join(tmp, 'picture.jpg');
  if (await still(f.file, small, { width: 1024 })) return small;
  // Without ffmpeg: the file itself, if it is small enough to send.
  return /^image\/(png|jpeg|webp|gif)$/.test(m.mime) && m.bytes < 5 * 1024 * 1024 ? f.file : null;
}

/** Writes an item's title and description: what the model says, else from its prompt. */
export async function writeCaption(db: DB, d: Pick<Deps, 'models'>, m: MediaItem): Promise<{ title: string; description: string; by?: string; error?: string }> {
  const fallback = { title: titleFrom({ ...m, name: m.source ? path.basename(m.source) : undefined }), description: (m.prompt ?? '').replace(/\s+/g, ' ').trim().slice(0, 600) };
  const w = await captionWriter(db, d).catch((e) => ({ why: String((e as Error).message ?? e) }));
  if ('why' in w) return { ...fallback, error: w.why };
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'naget-caption-'));
  try {
    const pic = await pictureOf(m, tmp);
    if (!pic) return { ...fallback, error: m.kind === 'video' ? 'ffmpeg is not on this computer, so the video’s frames could not be taken.' : 'The picture could not be read.' };
    const lang = userLang(db);
    const prompt = [
      m.kind === 'video'
        ? `This picture shows 10 frames of a ${m.duration ? `${Math.round(m.duration)}-second ` : ''}video, in order: left to right, then top to bottom. Write the video's title and description.`
        : 'Write the title and description of this picture.',
      m.prompt ? `It was made from these words, which may help with names and intent; still describe what you see: "${m.prompt.replace(/\s+/g, ' ').slice(0, 800)}"` : '',
      lang !== 'en' ? `Write them in ${LANGS.find((l) => l.id === lang)?.english ?? 'English'}.` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const raw = await w.ask(SYSTEM, prompt, pic, AbortSignal.timeout(180_000));
    const c = readCaption(raw);
    if (!c) return { ...fallback, by: w.label, error: `${w.label} did not answer with a title and a description.` };
    return { ...c, by: w.label };
  } catch (e) {
    return { ...fallback, by: w.label, error: String((e as Error).message ?? e).slice(0, 300) };
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }
}
