// Videos and audio agents make through OpenRouter, the settings image and video models take (asked for on a form
// before anything is made), and the images, videos and audio kept in the Library: what it keeps of each, and the
// model that writes their titles and descriptions.

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

/**
 * An OpenRouter model that makes sound: music (Google's Lyria, through a chat completion that streams it), or
 * voices and sounds (its speech API: models that read words aloud, and ones like Seed Audio that take a
 * description of the voice, of sound effects or of ambience; OpenAI's gpt-audio voices, through a chat).
 */
export interface AudioModel {
  /** OpenRouter's id, e.g. "google/lyria-3-pro-preview". */
  id: string;
  label: string;
  org?: string;
  description?: string;
  /** Listed on OpenRouter (ms). */
  created?: number;
  /** What it makes: songs and music, or speech (and sounds, for a model that takes a description). */
  kind: 'music' | 'speech';
  /** How it is asked: OpenRouter's speech API (which answers with the sound itself), or a streamed chat completion. */
  via: 'speech' | 'chat';
  /** It takes a description of what to make (the voice and its delivery, sound effects, ambience) rather than reading the words aloud as they are. */
  prompted?: boolean;
  /** The voices it speaks in, by id (none: its own, or the one it is told about or given a sample of). */
  voices?: string[];
  /** It speaks in a voice copied from short samples of someone speaking, and how many it takes at once (when OpenRouter says). */
  cloning?: boolean;
  maxSamples?: number;
  /** It takes directions for the delivery (tone, pace, emotion). */
  instructions?: boolean;
  /** It voices a conversation, each turn in its own voice. */
  multiSpeaker?: boolean;
  /** The files it can make (a WAV comes from its raw sound). */
  formats: ('mp3' | 'wav')[];
  /** The longest it makes, in seconds, when known (Lyria 3 Clip 30, Lyria 3 Pro about 180, Seed Audio 120). */
  maxSeconds?: number;
  /** US dollars: a song (or clip), a second of sound made, a character read, a token in and out (speech sold by the token). */
  perSong?: number;
  perSecond?: number;
  perChar?: number;
  perToken?: { input: number; output: number };
  /** About what a minute of speech costs, whichever way it is sold (to compare voice models). */
  perMinute?: number;
  /** It costs nothing. */
  free?: boolean;
}

export interface AudioState {
  /** Agents get the generate_audio tool. */
  enabled: boolean;
  /** The music model picked, and the voice and sound model; '' for the app's choice. */
  music: string;
  speech: string;
  /** The models it uses now (the ones picked, or the app's choice). */
  usingMusic: string;
  usingSpeech: string;
  musicInfo?: AudioModel;
  speechInfo?: AudioModel;
  /** An OpenRouter key is set (Settings → Models). */
  keySet: boolean;
}

export type MediaKind = 'image' | 'video' | 'audio';

/** Where an item's title and description came from, or why they could not be written. */
export type CaptionStatus = 'pending' | 'done' | 'failed' | 'edited';

/** An image, video or audio kept in the Library. */
export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  description: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  /** A video's or a sound's length, in seconds. */
  duration?: number;
  /** A sound's shape, to draw it by: how loud each of its parts is, from 0 to 1 (with ffmpeg). */
  peaks?: number[];
  /** The words sung or spoken in a sound: a song's lyrics, the script read aloud. */
  lyrics?: string;
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
  /** ffmpeg is on this computer: videos get their frames, pictures a small copy, and sounds their length and shape. */
  ffmpeg: boolean;
}

/** How a video's or a sound's length reads: "8 s", "1:05". */
export const clipLength = (s?: number) => (s == null || !Number.isFinite(s) ? '' : s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
