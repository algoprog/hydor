// Images, videos and audio through OpenRouter, shown in the conversation.
//
// generate_image, generate_video and generate_audio (on each session's own MCP server, while each is on in
// Settings → Images, video and audio) make them with the model picked there, the app's choice, or one the agent
// names, using the OpenRouter key from Settings → Models. Before they make anything they show the user a form
// with the settings the model takes (shape, resolution, quality, length, sound, voice…) and what it costs
// (settings.ts), unless the agent gave them all, the user answered it earlier in the session, or nobody is there
// to answer (a scheduled task, an app's run). What they make is saved in the session's folder (images/, videos/,
// audio/) and shown with the reply, where the user can keep it in the Library (server/media).
//   GET/PUT /api/images/settings   on or off, and the model (ImagesState)
//   GET     /api/images/models     OpenRouter's image models, by name, newest or cheapest first
//   GET/PUT /api/videos/settings   on or off, and the model (VideosState)
//   GET     /api/videos/models     OpenRouter's video models, by name, newest or cheapest first
//   GET/PUT /api/audio/settings    on or off, the music model and the voice and sound model (AudioState)
//   GET     /api/audio/models      OpenRouter's models that make music or speak, by name, newest or cheapest first
import fs from 'node:fs';
import path from 'node:path';
import type { ImageModel, ImagesState } from '../../shared/images.ts';
import type { AudioModel, AudioState, VideoModel, VideosState } from '../../shared/media.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Feature, RunCtx, RunTool } from '../features/types.ts';
import { inSession } from '../documents/index.ts';
import { fillForm } from '../guide/form.ts';
import { probe } from '../media/frames.ts';
import { loadConfig } from '../models/config.ts';
import { OPENROUTER_URL } from '../models/openrouter.ts';
import { appWords } from '../language/index.ts';
import { sessionExtra } from '../sessionExtra.ts';
import {
  audioCost,
  audioModels,
  cleanLyrics,
  describedInput,
  generateChatAudio,
  generateSpeech,
  musicPrompt,
  placeholderProblem,
  PREFERRED_MUSIC,
  PREFERRED_SPEECH,
  readAloud,
  readSamples,
  saveAudio,
  wavSeconds,
  withDetails,
  type AudioWish,
  type MadeAudio,
  type Turn,
} from './audio.ts';
import { generate, imageModels, PREFERRED, readReferences, saveImages, type Reference } from './openrouter.ts';
import {
  audioAnswers,
  audioDefaults,
  audioForm,
  audioMismatch,
  audioPriceLine,
  FORM,
  insteadLine,
  imageAnswers,
  imageDefaults,
  imageFits,
  imageForm,
  imageMismatch,
  money,
  pickedFor,
  pickedKey,
  priceLine,
  rememberPicked,
  videoAnswers,
  videoCost,
  videoDefaults,
  videoForm,
  videoMismatch,
  type AudioChoice,
  type AudioKind,
  type ImageChoice,
  type VideoChoice,
} from './settings.ts';
import { DONE, follow, followedJob, pollVideo, PREFERRED_VIDEO, submitVideo, videoModels, type Followed, type SavedVideo } from './video.ts';

interface Settings {
  enabled: boolean;
  model: string;
}

function settings(db: DB, what: 'images' | 'videos' = 'images'): Settings {
  try {
    const s = JSON.parse(kvGet(db, what) ?? '{}');
    return { enabled: s.enabled !== false, model: typeof s.model === 'string' ? s.model : '' };
  } catch {
    return { enabled: true, model: '' };
  }
}

const MODEL_ID = /^[\w.~:/-]{1,120}$/;

const models = () => imageModels(OPENROUTER_URL);
const vmodels = () => videoModels(OPENROUTER_URL);

/** The model in use: the one asked for, the one picked, or the first of the app's choices OpenRouter still lists. */
async function using(s: Settings, asked?: string): Promise<{ id: string; info?: ImageModel }> {
  const list = await models().catch(() => [] as ImageModel[]);
  const id = asked || s.model || PREFERRED.find((p) => list.some((m) => m.id === p)) || PREFERRED[0];
  return { id, info: list.find((m) => m.id === id) };
}

async function usingVideo(s: Settings, asked?: string): Promise<{ id: string; info?: VideoModel }> {
  const list = await vmodels().catch(() => [] as VideoModel[]);
  const id = asked || s.model || PREFERRED_VIDEO.find((p) => list.some((m) => m.id === p)) || PREFERRED_VIDEO[0];
  return { id, info: list.find((m) => m.id === id) };
}

async function state(db: DB): Promise<ImagesState> {
  const s = settings(db);
  const u = await using(s);
  return { enabled: s.enabled, model: s.model, using: u.id, usingInfo: u.info, keySet: !!loadConfig().openrouter.apiKey };
}

async function videoState(db: DB): Promise<VideosState> {
  const s = settings(db, 'videos');
  const u = await usingVideo(s);
  return { enabled: s.enabled, model: s.model, using: u.id, usingInfo: u.info, keySet: !!loadConfig().openrouter.apiKey };
}

const NO_KEY = (what: string) =>
  `${what} generation goes through OpenRouter, and no OpenRouter key is set. Tell the user to add one in Settings → Models → OpenRouter (keys come from https://openrouter.ai/keys); then try again.`;

const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Whether someone can answer a form in this run: not a scheduled task's or an app's run, and the session is in the app. */
function attended(ctx: RunCtx): boolean {
  if (!ctx.deps.sessions.adapterByRun(ctx.runId)) return false;
  try {
    const x = sessionExtra(ctx.deps.db, ctx.key);
    return !x.automations && !x.app;
  } catch {
    return true;
  }
}

/** The agent's ask: true always shows the form, false never; unset, once per model in a session, when it left something out. */
const askOf = (a: Record<string, any>): boolean | undefined => (a.ask === true || a.ask === 'true' ? true : a.ask === false || a.ask === 'false' ? false : undefined);

const CLOSED = (what: string) => `The user closed the form: no ${what} was made, and nothing was spent. Ask them what they would like instead, if it is not clear.`;
const WITHDRAWN = (what: string) => `The form was withdrawn before the user answered: no ${what} was made.`;
const NO_ANSWER = (what: string) => `The user did not answer the form in time: no ${what} was made. Ask them in your reply whether to go ahead, and with what.`;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const int = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number.isFinite(Number(v)) ? Math.round(Number(v)) : undefined);
const bool = (v: unknown) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined);

// ---- generate_image ------------------------------------------------------------------------------------

function imageTool(db: DB): RunTool {
  return {
    name: 'generate_image',
    // It writes files and asks a service outside, at a cost.
    annotations: { readOnlyHint: false, openWorldHint: true },
    description: [
      'Make an image from a description, or change pictures the user has, with an image model through OpenRouter (the one picked in Settings → Images, video and audio, or the one model names).',
      'Before it makes anything, the user sees a short form in the conversation with the settings that model takes (shape, resolution, quality, how many) and what it costs, filled in with what you give: they change what they like and confirm, or close it, and then nothing is made.',
      'So give only the settings the user asked for and leave the rest to the form; it comes once per model in a session (later images use the same settings unless you give others; ask: true shows it again).',
      'Set ask: false only when the user said to choose for them or to go ahead without asking.',
      'The images are saved in the session’s folder (images/) and shown to the user with your reply, where they can keep them in their Library: do not repeat them or their paths.',
      'Describe what you want fully: subject, setting, style (photo, illustration, watercolour…), composition, colours, light, and any text',
      'to appear, word for word. To edit or combine pictures, give their paths in images and say what to change.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to make, or what to change in the given images.' },
        images: { type: 'array', items: { type: 'string' }, maxItems: 8, description: 'Paths of pictures to edit or take after (PNG, JPEG, WebP, GIF), up to 4 for most models.' },
        aspect_ratio: { type: 'string', description: 'The shape, if the user said: 1:1 square, 16:9 wide, 9:16 tall, 4:3, 3:4, 3:2, 2:3, 21:9 (what the model takes).' },
        resolution: { type: 'string', description: 'If the user said: 1K, 2K or 4K (sharper, slower and dearer), where the model offers a choice.' },
        quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high'], description: 'If the user said, for models with a quality setting.' },
        count: { type: 'integer', minimum: 1, maximum: 4, description: 'How many images, if the user said (models that make several).' },
        transparent: { type: 'boolean', description: 'A transparent background, for a logo or an icon (models that can).' },
        model: { type: 'string', description: 'OpenRouter’s id of another image model, only when the user asks for it ("black-forest-labs/flux.2-pro").' },
        name: { type: 'string', description: 'A short file name, without extension (default: from the prompt).' },
        ask: { type: 'boolean', description: 'true: show the settings form even if answered before; false: make it without the form.' },
      },
      required: ['prompt'],
    },
    async run(a, ctx) {
      const key = loadConfig().openrouter.apiKey;
      if (!key) return { isError: true, text: NO_KEY('Image') };
      const prompt = String(a.prompt ?? '').trim();
      if (!prompt) throw new Error('Say what to make in prompt.');
      const asked = str(a.model);
      if (asked && !MODEL_ID.test(asked)) throw new Error('model: an OpenRouter id, like black-forest-labs/flux.2-pro.');
      const refs = await readReferences((Array.isArray(a.images) ? a.images : []).map((p: unknown) => inSession(ctx.cwd, String(p))).slice(0, 8));
      const s = settings(db);
      const { id, info } = await using(s, asked);
      if (asked && !info && (await models().catch(() => [])).length) throw new Error(`OpenRouter has no image model ${asked}. The user can see the ones there are in Settings → Images, video and audio.`);
      if (refs.length && info && !info.edits) throw new Error(`${info.label} does not take pictures to work from. Describe the change in words, or the user can pick a model that edits pictures in Settings → Images, video and audio.`);
      if (info?.maxRefs && refs.length > info.maxRefs) throw new Error(`${info.label} takes at most ${info.maxRefs} pictures to work from.`);
      const given: ImageChoice = {
        ...(str(a.aspect_ratio) ? { aspect: str(a.aspect_ratio) } : {}),
        ...(str(a.resolution ?? a.size) ? { size: str(a.resolution ?? a.size)!.toUpperCase() } : {}),
        ...(str(a.quality) ? { quality: str(a.quality) } : {}),
        ...(int(a.count) ? { count: Math.max(1, Math.min(4, int(a.count)!)) } : {}),
        ...(bool(a.transparent) !== undefined ? { background: bool(a.transparent) ? 'transparent' : undefined } : {}),
      };
      const memo = pickedKey(ctx.key, 'image', id);
      let v: ImageChoice = { ...imageDefaults(info), ...pickedFor<ImageChoice>(memo), ...given };
      const tr = appWords(db);
      const fields = imageForm(info, v, tr);
      const left = Object.keys(fields).some((f) => !(f === 'transparent' ? 'background' in given : f in given));
      const ask = askOf(a);
      if ((ask === true || (ask === undefined && left && !pickedFor(memo))) && Object.keys(fields).length && attended(ctx)) {
        const r = await fillForm(ctx, {
          title: tr(refs.length ? FORM.imageChanged : FORM.image),
          message: [priceLine('image', info, id, tr), `> ${prompt.replace(/\s+/g, ' ').slice(0, 400)}`].join('\n\n'),
          schema: { properties: fields },
          submit: tr(FORM.submit),
        });
        if (!r.ok && r.why === 'declined') return CLOSED('image');
        if (!r.ok && r.why === 'timeout') return { isError: true, text: NO_ANSWER('image') };
        if (!r.ok && r.why === 'withdrawn') return { isError: true, text: WITHDRAWN('image') };
        if (r.ok) {
          v = imageAnswers(r.content, v);
          rememberPicked(memo, v);
        }
      } else {
        const wrong = imageMismatch(info, given);
        if (wrong) return { isError: true, text: wrong };
      }
      v = imageFits(info, v);
      const r = await generate({ base: OPENROUTER_URL, key, model: id, prompt, refs, aspect: v.aspect, size: v.size, quality: v.quality, background: v.background, count: v.count, textOut: info?.textOut });
      if (!r.images.length) return { isError: true, text: `${id} answered without an image${r.text ? `: “${r.text.slice(0, 600)}”` : '.'} Try describing it differently.` };
      const saved = await saveImages(r.images, path.join(ctx.cwd, 'images'), String(a.name ?? '').trim() || prompt);
      const lines = saved.map((f) => `${f.path} (${f.w && f.h ? `${f.w}×${f.h}, ` : ''}${size(f.bytes)})`);
      const how = [v.aspect, v.size, v.quality && v.quality !== 'auto' ? `${v.quality} quality` : '', v.background === 'transparent' ? 'transparent background' : ''].filter(Boolean).join(', ');
      return [
        `Made ${saved.length === 1 ? 'an image' : `${saved.length} images`} with ${id}${r.cost ? ` (${money(r.cost)})` : ''}${how ? `, ${how}` : ''}:`,
        ...lines,
        'The user sees it with your reply, a tap away from full size, download and keeping it in their Library: don’t repeat it or its path. To look at it yourself, open the file.',
        ...(r.text ? [`The model said: ${r.text.slice(0, 600)}`] : []),
      ].join('\n');
    },
  };
}

// ---- generate_video ------------------------------------------------------------------------------------

/** How long one call waits for its video: under Codex's ten minutes for a tool call, the form included. */
const WAIT_MS = 560_000;
const MAX_VIDEO_IN = 40 * 1024 * 1024;

const VIDEO_MIME: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };

async function readVideo(file: string): Promise<{ mime: string; data: Buffer }> {
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new Error(`No such video: ${file}`);
  const mime = VIDEO_MIME[path.extname(file).slice(1).toLowerCase()];
  if (!mime) throw new Error(`${path.basename(file)} is not an MP4, WebM or MOV video.`);
  if (st.size > MAX_VIDEO_IN) throw new Error(`${path.basename(file)} is over 40 MB: make it shorter or smaller first.`);
  return { mime, data: await fs.promises.readFile(file) };
}

const oneImage = async (cwd: string, p: unknown): Promise<Reference | undefined> => (str(p) ? (await readReferences([inSession(cwd, str(p)!)]))[0] : undefined);

/** The answer for videos that were made: their paths, sizes and lengths, as the conversation's card reads them. */
async function madeText(model: string, files: SavedVideo[], cost: number | undefined, how: string): Promise<string> {
  const lines: string[] = [];
  for (const f of files) {
    const p = await probe(f.path).catch(() => null);
    const bits = [p?.width && p.height ? `${p.width}×${p.height}` : '', p?.duration ? `${Math.round(p.duration * 10) / 10} s` : '', size(f.bytes)].filter(Boolean);
    lines.push(`${f.path} (${bits.join(', ')})`);
  }
  return [
    `Made ${files.length === 1 ? 'a video' : `${files.length} videos`} with ${model}${cost ? ` (${money(cost)})` : ''}${how ? `, ${how}` : ''}:`,
    ...lines,
    'The user sees it with your reply, where they can play it, download it and keep it in their Library: don’t repeat it or its path.',
  ].join('\n');
}

/** Waits for a job until `until`: the made videos' answer, or how to wait again. */
async function await_(f: Followed, until: number, how: string, signal?: AbortSignal): Promise<string | { isError: true; text: string }> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<'late'>((res) => {
    timer = setTimeout(() => res('late'), Math.max(0, until - Date.now()));
    signal?.addEventListener('abort', () => res('late'), { once: true });
  });
  try {
    const r = await Promise.race([f.done, late]);
    if (r === 'late') {
      const mins = Math.round((Date.now() - f.startedAt) / 60_000);
      return `The video is still being made (job ${f.id}, ${f.status.replace('_', ' ')}, ${mins < 1 ? 'under a minute' : `${mins} min`} so far); the app keeps it going and saves it when it is done. Call generate_video with job: "${f.id}" to wait for it again; the user sees it once you do.`;
    }
    return await madeText(f.model, r.files, r.cost, how);
  } catch (e) {
    return { isError: true, text: String((e as Error).message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

function videoTool(db: DB): RunTool {
  return {
    name: 'generate_video',
    annotations: { readOnlyHint: false, openWorldHint: true },
    description: [
      'Make a short video from a description, and if wanted from pictures to start or end on (first_frame, last_frame) or to follow (references), with a video model through OpenRouter (the one picked in Settings → Images, video and audio, or the one model names).',
      'Videos cost far more than images (cents to dollars a second) and take a minute to several to make.',
      'Before it makes anything, the user sees a short form in the conversation with the settings that model takes (length, shape, resolution, sound) and what it costs, filled in with what you give: they change what they like and confirm, or close it, and then nothing is made.',
      'So give only the settings the user asked for and leave the rest to the form; it comes once per model in a session (ask: true shows it again). Set ask: false only when the user said to choose for them or to go ahead without asking.',
      'It waits for the video, up to about nine minutes; if it is not ready by then, you get its job id: call again with job to wait for it (nothing more is spent).',
      'The video is saved in the session’s folder (videos/) and shown to the user with your reply, where they can play it and keep it in their Library: do not repeat it or its path.',
      'Describe the scene, what moves and how, the camera, the style and the light, and any sound or words spoken, word for word.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What the video shows and how it moves.' },
        duration: { type: 'integer', minimum: 1, description: 'Its length in seconds, if the user said (the lengths the model makes).' },
        aspect_ratio: { type: 'string', description: 'Its shape, if the user said: 16:9 wide, 9:16 tall, 1:1 square…' },
        resolution: { type: 'string', description: 'If the user said: 480p, 720p, 1080p, 4K (what the model makes).' },
        audio: { type: 'boolean', description: 'Sound with it (voices, music, noises), if the user said; models that make sound.' },
        first_frame: { type: 'string', description: 'The path of a picture for the video to start on.' },
        last_frame: { type: 'string', description: 'The path of a picture for it to end on (models that take one).' },
        references: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Paths of pictures for it to follow (a character, a product, a style), not as frames.' },
        video: { type: 'string', description: 'The path of a video to change (MP4, WebM or MOV, up to 40 MB), for models that edit, extend or sharpen videos.' },
        model: { type: 'string', description: 'OpenRouter’s id of another video model, only when the user asks for it ("google/veo-3.1").' },
        name: { type: 'string', description: 'A short file name, without extension (default: from the prompt).' },
        ask: { type: 'boolean', description: 'true: show the settings form even if answered before; false: make it without the form.' },
        job: { type: 'string', description: 'A job id from an earlier call that was still being made: waits for that video instead.' },
      },
    },
    async run(a, ctx) {
      const started = Date.now();
      const until = started + WAIT_MS;
      const key = loadConfig().openrouter.apiKey;
      if (!key) return { isError: true, text: NO_KEY('Video') };
      const dir = path.join(ctx.cwd, 'videos');
      const job = str(a.job);
      if (job) {
        if (!/^[\w.-]{4,120}$/.test(job)) throw new Error('job: the id an earlier call gave.');
        let f = followedJob(job);
        if (!f) {
          // The app restarted since: ask OpenRouter where it is.
          const j = await pollVideo(OPENROUTER_URL, key, job);
          f = follow({ base: OPENROUTER_URL, key, job: j, model: 'the model', session: ctx.key, dir, name: str(a.name) ?? 'video' });
        }
        return await_(f, until, '', ctx.signal);
      }
      const prompt = String(a.prompt ?? '').trim();
      const asked = str(a.model);
      if (asked && !MODEL_ID.test(asked)) throw new Error('model: an OpenRouter id, like google/veo-3.1.');
      const s = settings(db, 'videos');
      const { id, info } = await usingVideo(s, asked);
      if (asked && !info && (await vmodels().catch(() => [])).length) throw new Error(`OpenRouter has no video model ${asked}. The user can see the ones there are in Settings → Images, video and audio.`);
      const first = await oneImage(ctx.cwd, a.first_frame);
      const last = await oneImage(ctx.cwd, a.last_frame);
      const refs = await readReferences((Array.isArray(a.references) ? a.references : []).map((p: unknown) => inSession(ctx.cwd, String(p))).slice(0, 4));
      const video = str(a.video) ? await readVideo(inSession(ctx.cwd, str(a.video)!)) : undefined;
      if (!prompt && !first && !video) throw new Error('Say what the video shows in prompt.');
      if (info) {
        if (info.videoIn && !video) return { isError: true, text: `${info.label} changes a video it is given: give its path in video, or leave model out to make one from words.` };
        if (first && !info.frames.includes('first_frame')) return { isError: true, text: `${info.label} does not start from a picture: leave first_frame out, or pick a model that does.` };
        if (last && !info.frames.includes('last_frame')) return { isError: true, text: `${info.label} does not end on a picture: leave last_frame out.` };
      }
      const given: VideoChoice = {
        ...(int(a.duration) ? { duration: int(a.duration) } : {}),
        ...(str(a.aspect_ratio) ? { aspect: str(a.aspect_ratio) } : {}),
        ...(str(a.resolution) ? { resolution: /^\d+p?$/i.test(str(a.resolution)!) ? `${parseInt(str(a.resolution)!, 10)}p` : str(a.resolution)!.toUpperCase() } : {}),
        ...(bool(a.audio) !== undefined ? { audio: bool(a.audio) } : {}),
      };
      const memo = pickedKey(ctx.key, 'video', id);
      let v: VideoChoice = { ...videoDefaults(info), ...pickedFor<VideoChoice>(memo), ...given };
      // A picture to start from sets the shape for most models.
      if (first && !given.aspect && v.aspect && info?.aspects.length) delete v.aspect;
      const tr = appWords(db);
      const fields = videoForm(info, v, tr);
      if (first && !given.aspect) delete fields.aspect;
      const left = Object.keys(fields).some((f) => !(f in given));
      const ask = askOf(a);
      if ((ask === true || (ask === undefined && left && !pickedFor(memo))) && Object.keys(fields).length && attended(ctx)) {
        const cost = videoCost(info, v);
        const r = await fillForm(ctx, {
          title: tr(video ? FORM.videoChanged : FORM.video),
          message: [priceLine('video', info, id, tr, cost), ...(prompt ? [`> ${prompt.replace(/\s+/g, ' ').slice(0, 400)}`] : [])].join('\n\n'),
          schema: { properties: fields },
          submit: tr(FORM.submit),
          waitMs: Math.max(60_000, until - Date.now() - 120_000),
        });
        if (!r.ok && r.why === 'declined') return CLOSED('video');
        if (!r.ok && r.why === 'timeout') return { isError: true, text: NO_ANSWER('video') };
        if (!r.ok && r.why === 'withdrawn') return { isError: true, text: WITHDRAWN('video') };
        if (r.ok) {
          v = videoAnswers(r.content, v);
          rememberPicked(memo, v);
        }
      } else {
        const wrong = videoMismatch(info, given);
        if (wrong) return { isError: true, text: wrong };
      }
      const submitted = await submitVideo(OPENROUTER_URL, key, {
        model: id,
        prompt,
        ...(info?.videoIn ? {} : { duration: v.duration, aspect: v.aspect }),
        resolution: v.resolution,
        ...(info?.audio || v.audio === false ? { audio: v.audio } : {}),
        first,
        last,
        refs,
        video,
      });
      if (DONE.has(submitted.status) && submitted.status !== 'completed') return { isError: true, text: submitted.error ? `The video was not made: ${submitted.error}` : `The video was not made (${submitted.status}).` };
      const f = follow({ base: OPENROUTER_URL, key, job: submitted, model: id, session: ctx.key, dir, name: str(a.name) ?? (prompt || 'video') });
      const how = [v.duration ? `${v.duration} s` : '', v.aspect, v.resolution, v.audio === false ? 'no sound' : v.audio ? 'with sound' : ''].filter(Boolean).join(', ');
      return await_(f, until, how, ctx.signal);
    },
  };
}

// ---- generate_audio ------------------------------------------------------------------------------------

interface AudioSettings {
  enabled: boolean;
  /** The music model picked, and the voice and sound model; '' for the app's choice. */
  music: string;
  speech: string;
}

function audioSettings(db: DB): AudioSettings {
  try {
    const s = JSON.parse(kvGet(db, 'audio') ?? '{}');
    return { enabled: s.enabled !== false, music: typeof s.music === 'string' ? s.music : '', speech: typeof s.speech === 'string' ? s.speech : '' };
  } catch {
    return { enabled: true, music: '', speech: '' };
  }
}

const amodels = () => audioModels(OPENROUTER_URL);

/** The model for music, or for voices and sounds: the one asked for, the one picked, or the first of the app's choices OpenRouter still lists. */
async function usingAudio(s: AudioSettings, role: 'music' | 'speech', asked?: string): Promise<{ id: string; info?: AudioModel }> {
  const list = await amodels().catch(() => [] as AudioModel[]);
  const pref = role === 'music' ? PREFERRED_MUSIC : PREFERRED_SPEECH;
  const id = asked || (role === 'music' ? s.music : s.speech) || pref.find((p) => list.some((m) => m.id === p)) || pref[0];
  return { id, info: list.find((m) => m.id === id) };
}

async function audioState(db: DB): Promise<AudioState> {
  const s = audioSettings(db);
  const [music, speech] = await Promise.all([usingAudio(s, 'music'), usingAudio(s, 'speech')]);
  // Whether the voice model copies voices, from its endpoints.
  if (speech.info?.via === 'speech') await withDetails(OPENROUTER_URL, [speech.info]).catch(() => {});
  return { enabled: s.enabled, music: s.music, speech: s.speech, usingMusic: music.id, usingSpeech: speech.id, musicInfo: music.info, speechInfo: speech.info, keySet: !!loadConfig().openrouter.apiKey };
}

const AUDIO_KINDS: AudioKind[] = ['music', 'speech', 'sound'];

/** Why a model cannot make what is asked: music, sounds (a model that takes a description), copied voices, conversations. */
function cannot(m: AudioModel, kind: AudioKind, o: { samples: number; turns: boolean }): string | null {
  if (kind === 'music' && m.kind !== 'music' && !m.prompted) return `${m.label} does not make music`;
  if (kind === 'speech' && m.kind === 'music') return `${m.label} makes music, not speech`;
  if (kind === 'sound' && !m.prompted) return `${m.label} only reads words aloud`;
  if (o.samples && m.cloning === false) return `${m.label} does not speak in a voice from samples`;
  if (o.samples > 1 && m.cloning && (m.maxSamples ?? 1) < o.samples) return `${m.label} takes one voice sample at a time`;
  if (o.turns && !m.multiSpeaker && !m.prompted) return `${m.label} voices one speaker at a time`;
  return null;
}

/** A conversation's turns as the agent gave them: each with its words, and a voice and a manner if given. */
function readTurns(v: unknown): Turn[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error('turns: a list of { text, voice?, instructions? }.');
  if (v.length > 40) throw new Error('turns: at most 40 in one go.');
  return v.map((t, i) => {
    const text = typeof t === 'string' ? t.trim() : String(t?.text ?? '').trim();
    if (!text) throw new Error(`turns[${i}]: its words go in text.`);
    return { text, ...(str(t?.voice) ? { voice: str(t.voice) } : {}), ...(str(t?.instructions) ? { instructions: str(t.instructions) } : {}) };
  });
}

/** How long one call may take, the form included (under Codex's ten minutes for a tool call). */
const AUDIO_WAIT_MS = 560_000;
/** How long the model may take: a whole song with Lyria 3 Pro takes a minute or two; speech and sounds less. */
const MUSIC_MS = 300_000;
const SPEECH_MS = 240_000;

const AUDIO_WORD: Record<AudioKind, string> = { music: 'music', speech: 'speech', sound: 'sound' };

function audioTool(db: DB): RunTool {
  return {
    name: 'generate_audio',
    // It writes a file and asks a service outside, at a cost.
    annotations: { readOnlyHint: false, openWorldHint: true },
    description: [
      'Make sound through OpenRouter: music (songs with vocals or instrumentals, jingles, loops, background music), speech (narration, voice-overs, announcements, dialogue, in a described voice or one copied from 1–3 short recordings the user has), or sound effects and ambience.',
      'kind picks the model: music uses the music model picked in Settings → Images, video and audio (the app’s choice is Google’s Lyria: Lyria 3 Pro makes songs of up to about 3 minutes, Lyria 3 Clip 30-second clips), speech and sound the voice and sound model (the app’s choice is ByteDance’s Seed Audio, up to 2 minutes), or model names another.',
      'Before it makes anything, the user sees a short form in the conversation with the model, the settings it takes (singing or not, length, voice, file) and what it costs, filled in with what you give: they change what they like and confirm, or close it, and then nothing is made.',
      'So give only the settings the user asked for and leave the rest to the form; it comes once per model in a session (ask: true shows it again). Set ask: false only when the user said to choose for them or to go ahead without asking.',
      'music: in prompt, the genre, mood, instruments, tempo (BPM), key, the singer’s voice and the structure (timestamps like "[0:00 - 0:15] Intro: soft piano" place things); the lyrics in lyrics, with [Verse] and [Chorus] tags, or instrumental: true; without either the model writes its own lyrics. Write the prompt in the language the song should be sung in.',
      'speech: the exact words in prompt (or a conversation in turns), and how they are said in instructions: the voice, age, accent, tone, pace and emotion. Seed Audio reads prompt as a description, so there you may also write the whole scene with the spoken lines in quotes (‘A calm, deep male narrator: "Welcome to the museum." Soft rain in the background.’). voice: one of the model’s own voices by id, where it has them (a wrong one gets you the list). voice_samples: recordings of the voice to speak in (only a voice the user may use); with several, write who says what with @Audio1, @Audio2, @Audio3.',
      'sound: describe the sound and what happens when ("Heavy rain on a tin roof, thunder rolling in at the end, no voices"), and its duration.',
      'It is saved in the session’s folder (audio/) and the user hears it with your reply, in a player where they can download it and keep it in their Library: do not repeat it or its path. You cannot hear it: speak of it as what you asked for.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: AUDIO_KINDS, description: 'music: a song or a piece of music; speech: words said aloud; sound: sound effects or ambience.' },
        prompt: {
          type: 'string',
          description: 'music: the piece described; speech: the exact words to say (or, for Seed Audio, a whole description with the spoken lines in quotes); sound: the sound described.',
        },
        lyrics: { type: 'string', description: 'The words of the song, with [Verse], [Chorus]… tags (music).' },
        instrumental: { type: 'boolean', description: 'Music without singing.' },
        duration: { type: 'integer', minimum: 1, maximum: 300, description: 'About how long, in seconds, if the user said: a song (Lyria 3 Pro: up to about 180; Lyria 3 Clip always makes 30) or a sound (Seed Audio: up to 120). Speech is as long as its words.' },
        instructions: { type: 'string', description: 'How the words are said (speech): the voice, age, accent, tone, pace and emotion ("a warm, elderly British man, slowly, with a smile").' },
        voice: { type: 'string', description: 'One of the voice model’s own voices, by id ("george", "Kore"), where it has them.' },
        turns: {
          type: 'array',
          maxItems: 40,
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'What this speaker says.' },
              voice: { type: 'string', description: 'Their voice: one of the model’s voices, or for Seed Audio a description ("A young woman") or @Audio1.' },
              instructions: { type: 'string', description: 'How they say it.' },
            },
            required: ['text'],
          },
          description: 'A conversation, a turn each (speech), for models that voice several speakers (Gemini TTS, Fish Audio, Seed Audio).',
        },
        voice_samples: { type: 'array', items: { type: 'string' }, maxItems: 3, description: 'Paths of 1–3 recordings of a voice to speak in (WAV, MP3, M4A, OGG or FLAC, up to 30 MB; the first 30 seconds of each count), for models that copy voices (Seed Audio).' },
        format: { type: 'string', enum: ['mp3', 'wav'], description: 'The file, if the user said: mp3 (smaller) or wav (uncompressed).' },
        model: { type: 'string', description: 'OpenRouter’s id of another audio model, only when the user asks for it ("elevenlabs/eleven-v3", "google/lyria-3-clip-preview").' },
        name: { type: 'string', description: 'A short file name, without extension (default: from the prompt).' },
        ask: { type: 'boolean', description: 'true: show the settings form even if answered before; false: make it without the form.' },
      },
      required: ['kind'],
    },
    async run(a, ctx) {
      const until = Date.now() + AUDIO_WAIT_MS;
      const key = loadConfig().openrouter.apiKey;
      if (!key) return { isError: true, text: NO_KEY('Audio') };
      const kind = AUDIO_KINDS.find((k) => k === a.kind);
      if (!kind) throw new Error('kind: music, speech or sound.');
      const prompt = String(a.prompt ?? '').trim();
      const turns = readTurns(a.turns);
      if (turns.length && kind !== 'speech') throw new Error('turns are for speech: a conversation to voice.');
      if (!prompt && !turns.length) throw new Error(kind === 'speech' ? 'Give the words to say in prompt, or a conversation in turns.' : `Describe the ${kind} in prompt.`);
      const asked = str(a.model);
      if (asked && !MODEL_ID.test(asked)) throw new Error('model: an OpenRouter id, like elevenlabs/eleven-v3.');
      const samplePaths: string[] = (Array.isArray(a.voice_samples) ? a.voice_samples : []).map((p: unknown) => inSession(ctx.cwd, String(p)));
      if (samplePaths.length && kind !== 'speech') throw new Error('voice_samples are for speech: the voice to say the words in.');
      if (samplePaths.length > 3) throw new Error('Give at most 3 voice samples.');
      const s = audioSettings(db);
      const role = kind === 'music' ? 'music' : 'speech';
      let { id, info } = await usingAudio(s, role, asked);
      const list = await amodels().catch(() => [] as AudioModel[]);
      if (asked && !info && list.length) throw new Error(`OpenRouter has no audio model ${asked}. The user can see the ones there are in Settings → Images, video and audio.`);
      const need = { samples: samplePaths.length, turns: turns.length > 0 };
      if (info?.via === 'speech' && need.samples) await withDetails(OPENROUTER_URL, [info]).catch(() => {});
      let why = info ? cannot(info, kind, need) : null;
      // What the model picked cannot do, another of the app's choices may: sounds, copied voices, conversations.
      let instead: string | undefined;
      if (why && !asked && info) {
        const pool = [...(kind === 'music' ? PREFERRED_MUSIC : []), ...PREFERRED_SPEECH].map((p) => list.find((m) => m.id === p)).filter((m): m is AudioModel => !!m);
        if (need.samples) await withDetails(OPENROUTER_URL, pool.filter((m) => m.via === 'speech')).catch(() => {});
        const alt = pool.find((m) => !cannot(m, kind, need));
        if (alt) {
          instead = info.label;
          id = alt.id;
          info = alt;
          why = null;
        }
      }
      if (why) return { isError: true, text: `${why}: ${asked ? 'leave model out, or name one that can' : 'name one that can in model, or the user can pick one in Settings → Images, video and audio'}.` };
      const samples = await readSamples(samplePaths);
      const prompted = !!info?.prompted;
      // A voice by its id, in whatever case it was written; for a model that takes a description, the words describe it.
      const voiceAsked = str(a.voice);
      const voiceId = voiceAsked ? info?.voices?.find((x) => x.toLowerCase() === voiceAsked.toLowerCase()) : undefined;
      // A voice the model does not list (Fish Audio takes any of its own) goes as given, for it to say whether it has it.
      const voiceOk = !!voiceAsked && !prompted;
      const lyrics = str(a.lyrics);
      const instrumental = bool(a.instrumental);
      const given: AudioChoice = {
        ...(a.format === 'mp3' || a.format === 'wav' ? { format: a.format } : {}),
        ...(voiceOk && !samples.length && !turns.length ? { voice: voiceId ?? voiceAsked } : {}),
        ...(instrumental !== undefined ? { instrumental } : lyrics ? { instrumental: false } : {}),
        ...(int(a.duration) ? { seconds: Math.max(1, int(a.duration)!) } : {}),
      };
      const memo = pickedKey(ctx.key, 'audio', id);
      const before = pickedFor<AudioChoice>(memo);
      let v: AudioChoice = { ...audioDefaults(info, kind), ...(before?.format ? { format: before.format } : {}), ...(before?.voice ? { voice: before.voice } : {}), ...given };
      // A length goes into what the model is asked only when the agent gave one or the user confirmed one on the form.
      let timed = given.seconds !== undefined;
      const instructions = [prompted && voiceAsked ? voiceAsked : '', str(a.instructions) ?? ''].filter(Boolean).join(', ') || undefined;
      /** What to make; `priced`: for the form's price, with the length it shows. */
      const wish = (c: AudioChoice, priced = false): AudioWish => ({
        kind,
        prompt,
        ...(lyrics ? { lyrics } : {}),
        instrumental: c.instrumental,
        instructions,
        ...(turns.length ? { turns } : {}),
        ...(c.seconds && (timed || priced) ? { seconds: c.seconds } : {}),
        samples: samples.length,
      });
      const tr = appWords(db);
      const fields = audioForm(info, kind, v, tr, { voices: !samples.length && !prompted });
      const left = Object.keys(fields).some((f) => !(f in given));
      const ask = askOf(a);
      if ((ask === true || (ask === undefined && left && !before)) && Object.keys(fields).length && attended(ctx)) {
        const what = prompt || turns.map((t) => t.text).join(' ');
        const r = await fillForm(ctx, {
          title: tr(FORM[kind]),
          message: [
            audioPriceLine(info, id, tr, audioCost(info, wish(v, true))),
            ...(instead && info ? [insteadLine(instead, info.label, tr)] : []),
            `> ${what.replace(/\s+/g, ' ').slice(0, 400)}`,
          ].join('\n\n'),
          schema: { properties: fields },
          submit: tr(FORM.submit),
          waitMs: Math.max(60_000, until - Date.now() - (kind === 'music' ? MUSIC_MS : SPEECH_MS)),
        });
        if (!r.ok && r.why === 'declined') return CLOSED(AUDIO_WORD[kind]);
        if (!r.ok && r.why === 'timeout') return { isError: true, text: NO_ANSWER(AUDIO_WORD[kind]) };
        if (!r.ok && r.why === 'withdrawn') return { isError: true, text: WITHDRAWN(AUDIO_WORD[kind]) };
        if (r.ok) {
          v = audioAnswers(r.content, v, fields);
          if ('seconds' in fields) timed = typeof r.content.seconds === 'number';
          rememberPicked(memo, { format: v.format, ...(v.voice ? { voice: v.voice } : {}) });
        }
      } else {
        const wrong = audioMismatch(info, given);
        if (wrong) return { isError: true, text: wrong };
      }
      if (info && v.format && !info.formats.includes(v.format)) v.format = info.formats[0];
      const w = wish(v);
      const via = info?.via ?? (role === 'music' ? 'chat' : 'speech');
      // What the model is sent.
      let input: string | Turn[] = prompt;
      if (via === 'speech') {
        if (prompted) {
          input = describedInput(w);
          const bad = placeholderProblem(input, samples.length);
          if (bad) return { isError: true, text: bad };
          if (input.length > 3000) return { isError: true, text: `${info?.label ?? id} takes at most 3,000 characters at once (this is ${input.length}): make it in parts.` };
        } else if (kind === 'music') input = musicPrompt(w);
        else if (turns.length) {
          const voices = info?.voices ?? [];
          const off = turns.find((t) => t.voice && voices.length && !voices.some((x) => x.toLowerCase() === t.voice!.toLowerCase()));
          if (off) return { isError: true, text: `${info?.label ?? id} has no voice “${off.voice}”: give each turn one of ${voices.slice(0, 40).join(', ')}.` };
          input = turns.map((t) => ({ text: t.text, ...(t.voice ? { voice: voices.find((x) => x.toLowerCase() === t.voice!.toLowerCase()) ?? t.voice } : {}), ...(t.instructions ? { instructions: t.instructions } : {}) }));
        } else input = prompt.replace(/@Audio\d+\s*/g, '').trim();
      }
      const limit = kind === 'music' ? MUSIC_MS : SPEECH_MS;
      const timeout = AbortSignal.timeout(limit);
      const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
      let made: MadeAudio;
      try {
        made =
          via === 'speech'
            ? await generateSpeech({
                base: OPENROUTER_URL,
                key,
                model: id,
                input,
                ...(!prompted && !samples.length && v.voice ? { voice: v.voice } : {}),
                ...(!prompted && info?.instructions && w.instructions ? { instructions: w.instructions } : {}),
                format: v.format === 'wav' ? 'pcm' : 'mp3',
                samples,
                signal,
              })
            : await generateChatAudio({
                base: OPENROUTER_URL,
                key,
                model: id,
                ...(info?.kind === 'speech' ? { prompt: prompt || turns.map((t) => t.text).join('\n'), system: readAloud(w.instructions), voice: v.voice } : { prompt: musicPrompt(w) }),
                format: v.format ?? 'mp3',
                signal,
              });
      } catch (e) {
        if (timeout.aborted) return { isError: true, text: `${id} took over ${Math.round(limit / 60_000)} minutes, so it was stopped: nothing was saved. Try again, or ask for something shorter.` };
        if (ctx.signal?.aborted) return { isError: true, text: `Stopped before the ${AUDIO_WORD[kind]} was made.` };
        return { isError: true, text: `The ${AUDIO_WORD[kind]} was not made: ${String((e as Error).message ?? e)}` };
      }
      const saved = await saveAudio(made, path.join(ctx.cwd, 'audio'), str(a.name) ?? (prompt || turns[0]?.text || kind));
      const p = await probe(saved.path).catch(() => null);
      const secs = p?.duration ?? wavSeconds(made.data);
      const cost = made.cost ?? audioCost(info, w, secs);
      const words = made.words && kind === 'music' ? cleanLyrics(made.words) : undefined;
      const what = kind === 'music' ? (v.instrumental ? 'a piece of music' : 'a song') : kind === 'sound' ? 'a sound' : turns.length ? 'a conversation' : 'a voice-over';
      const how = [
        kind === 'speech' && v.voice && !prompted && !samples.length && !turns.length ? `voice ${v.voice}` : '',
        samples.length ? `in the voice of ${samples.map((x) => x.name).join(', ')}` : '',
        kind === 'music' && v.instrumental ? 'instrumental' : '',
      ]
        .filter(Boolean)
        .join(', ');
      return [
        `Made ${what} with ${id}${cost === undefined ? '' : cost ? ` (${made.cost ? '' : 'about '}${money(cost)})` : ' (free)'}${how ? `, ${how}` : ''}:`,
        `${saved.path} (${[secs ? `${Math.round(secs * 10) / 10} s` : '', size(saved.bytes)].filter(Boolean).join(', ')})`,
        ...(instead && info ? [`${instead} cannot make this, so ${info.label} made it.`] : []),
        'The user hears it with your reply, in a player where they can download it and keep it in their Library: don’t repeat it or its path. You cannot listen to it: speak of it as what you asked for.',
        ...(words ? [/^[[{]/.test(words) ? `Notes from the model:\n${words.slice(0, 2000)}` : `Lyrics:\n${words.slice(0, 2000)}`] : []),
      ].join('\n');
    },
  };
}

// ---- the routes ---------------------------------------------------------------------------------------------

const searchWords = (q: unknown) =>
  String(q ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

export const images: Feature = {
  id: 'images',
  routes({ app, db }) {
    app.get('/api/images/settings', async () => state(db));
    app.put('/api/images/settings', async (req) => {
      const b = (req.body ?? {}) as { enabled?: unknown; model?: unknown };
      const s = settings(db);
      if (typeof b.enabled === 'boolean') s.enabled = b.enabled;
      if (typeof b.model === 'string' && (b.model === '' || MODEL_ID.test(b.model))) s.model = b.model;
      kvSet(db, 'images', JSON.stringify(s));
      return state(db);
    });
    app.get('/api/images/models', async (req) => {
      const q = req.query as Record<string, string>;
      const words = searchWords(q.q);
      const list = (await models()).filter((m) => words.every((w) => `${m.id} ${m.label} ${m.org ?? ''}`.toLowerCase().includes(w)));
      const newer = (x: ImageModel, y: ImageModel) => (y.created ?? 0) - (x.created ?? 0);
      list.sort(q.sort === 'price' ? (x, y) => (x.perImage ?? Infinity) - (y.perImage ?? Infinity) || newer(x, y) : newer);
      return { models: list.slice(0, 100) };
    });
    app.get('/api/videos/settings', async () => videoState(db));
    app.put('/api/videos/settings', async (req) => {
      const b = (req.body ?? {}) as { enabled?: unknown; model?: unknown };
      const s = settings(db, 'videos');
      if (typeof b.enabled === 'boolean') s.enabled = b.enabled;
      if (typeof b.model === 'string' && (b.model === '' || MODEL_ID.test(b.model))) s.model = b.model;
      kvSet(db, 'videos', JSON.stringify(s));
      return videoState(db);
    });
    app.get('/api/videos/models', async (req) => {
      const q = req.query as Record<string, string>;
      const words = searchWords(q.q);
      const list = (await vmodels()).filter((m) => words.every((w) => `${m.id} ${m.label} ${m.org ?? ''}`.toLowerCase().includes(w)));
      const newer = (x: VideoModel, y: VideoModel) => (y.created ?? 0) - (x.created ?? 0);
      list.sort(q.sort === 'price' ? (x, y) => (x.perSecond ?? Infinity) - (y.perSecond ?? Infinity) || newer(x, y) : newer);
      return { models: list.slice(0, 100) };
    });
    app.get('/api/audio/settings', async () => audioState(db));
    app.put('/api/audio/settings', async (req) => {
      const b = (req.body ?? {}) as { enabled?: unknown; music?: unknown; speech?: unknown };
      const s = audioSettings(db);
      if (typeof b.enabled === 'boolean') s.enabled = b.enabled;
      if (typeof b.music === 'string' && (b.music === '' || MODEL_ID.test(b.music))) s.music = b.music;
      if (typeof b.speech === 'string' && (b.speech === '' || MODEL_ID.test(b.speech))) s.speech = b.speech;
      kvSet(db, 'audio', JSON.stringify(s));
      return audioState(db);
    });
    app.get('/api/audio/models', async (req) => {
      const q = req.query as Record<string, string>;
      const kind = q.kind === 'music' || q.kind === 'speech' ? q.kind : undefined;
      const words = searchWords(q.q);
      const list = (await amodels()).filter((m) => (!kind || m.kind === kind) && words.every((w) => `${m.id} ${m.label} ${m.org ?? ''}`.toLowerCase().includes(w)));
      // Which voice models copy voices, from their endpoints (asked once, kept for hours).
      await withDetails(OPENROUTER_URL, list).catch(() => {});
      const newer = (x: AudioModel, y: AudioModel) => (y.created ?? 0) - (x.created ?? 0);
      // Cheapest: a song for music; a minute of speech for voices, however each is sold.
      const price = (m: AudioModel) => (m.free ? 0 : (m.perSong ?? m.perMinute ?? Infinity));
      list.sort(q.sort === 'price' ? (x, y) => price(x) - price(y) || newer(x, y) : newer);
      return { models: list.slice(0, 100) };
    });
  },
  tools: ({ deps }) => [
    ...(settings(deps.db).enabled ? [imageTool(deps.db)] : []),
    ...(settings(deps.db, 'videos').enabled ? [videoTool(deps.db)] : []),
    ...(audioSettings(deps.db).enabled ? [audioTool(deps.db)] : []),
  ],
};
