// Videos agents make through OpenRouter, the settings image and video models take (asked for on a form before
// anything is made), and the images and videos kept in the Library: what it keeps of each, and the model that
// writes their titles and descriptions.

/** A setting an image or video model takes, as OpenRouter lists it: one of some values, a number in a range, or yes or no. */
export interface MediaParam {
  id: string;
  kind: 'enum' | 'range' | 'boolean';
  values?: string[];
  min?: number;
  max?: number;
}

/** An OpenRouter model that makes videos. */
export interface VideoModel {
  /** OpenRouter's id, e.g. "google/veo-3.1". */
  id: string;
  label: string;
  org?: string;
  description?: string;
  /** Listed on OpenRouter (ms). */
  created?: number;
  /** The lengths it makes, in seconds (none: it keeps the length of the video it is given). */
  durations: number[];
  resolutions: string[];
  aspects: string[];
  /** It can make sound with the picture. */
  audio: boolean;
  /** Pictures it can start (first_frame) or end (last_frame) on. */
  frames: ('first_frame' | 'last_frame')[];
  /** It changes a video you give it (an edit, a sharper copy) rather than making one from words. */
  videoIn: boolean;
  /** US dollars a second, the cheapest way it is sold (its lowest resolution, without sound), and the dearest. */
  perSecond?: number;
  perSecondMax?: number;
  /** OpenRouter's prices as it lists them, by SKU (dollars, or cents where the name says so). */
  skus?: Record<string, string>;
}

export interface VideosState {
  /** Agents get the generate_video tool. */
  enabled: boolean;
  /** The model picked, or '' for the app's choice. */
  model: string;
  /** The model it uses now (the one picked, or the app's choice). */
  using: string;
  usingInfo?: VideoModel;
  /** An OpenRouter key is set (Settings → Models). */
  keySet: boolean;
}

export type MediaKind = 'image' | 'video';

/** Where an image or video's title and description came from, or why they could not be written. */
export type CaptionStatus = 'pending' | 'done' | 'failed' | 'edited';

/** An image or video kept in the Library. */
export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  description: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  /** A video's length, in seconds. */
  duration?: number;
  /** What it was made from, and with which model, when an agent made it. */
  prompt?: string;
  model?: string;
  /** The session it was saved from. */
  sessionKey?: string;
  /** The space it is in (the Library shows each space's together); none when unset. */
  space?: string;
  /** The file it was saved from. */
  source?: string;
  caption: CaptionStatus;
  /** Why the title and description could not be written (caption "failed"). */
  captionError?: string;
  /** The model that wrote them, as Settings names it ("Gemini 3.5 Flash Lite, through OpenRouter"). */
  captionBy?: string;
  createdAt: number;
  updatedAt: number;
  /** Where the Library keeps its copy: a picture an agent can work from (generate_image's images). */
  file: string;
}

/** What news of the Library's media the pages hear ({ t: 'feature', id: 'media' }). */
export type MediaEvent = { what: 'media'; item?: MediaItem; removed?: string };

/**
 * Where the model that writes titles and descriptions is: the app's choice, a vision model in OpenRouter's
 * catalog, Claude through the Claude Code sign-in, or one of the models added in Settings → Models.
 */
export type CaptionProvider = 'auto' | 'openrouter' | 'claude' | 'ollama' | 'vllm' | 'endpoint';

export const CAPTION_PROVIDERS: CaptionProvider[] = ['auto', 'openrouter', 'claude', 'ollama', 'vllm', 'endpoint'];

export interface CaptionModelOption {
  /** The id to save: OpenRouter's ("google/gemini-3.5-flash-lite"), Claude's (haiku, sonnet, opus), or a model of Settings → Models ("ollama/qwen3-vl"). */
  id: string;
  label: string;
  detail?: string;
  /** It is known to see images (false: it may not; null: not known). */
  vision?: boolean | null;
}

export interface CaptionSettings {
  provider: CaptionProvider;
  /** The model picked for that provider ('' for its first). */
  model: string;
  /** The model that writes them now, as Settings names it; none when nothing can (no key, no model that sees images). */
  using?: { provider: Exclude<CaptionProvider, 'auto'>; model: string; label: string };
  /** Why nothing can write them now. */
  why?: string;
}

export interface MediaSettings {
  captions: CaptionSettings;
  /** ffmpeg is on this computer: videos get their frames, and pictures a small copy. */
  ffmpeg: boolean;
}

/** How a video's length reads: "8 s", "1:05". */
export const clipLength = (s?: number) => (s == null || !Number.isFinite(s) ? '' : s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
