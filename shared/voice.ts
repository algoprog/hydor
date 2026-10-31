// Voice: speaking to the message box, and replies read aloud. What the server and the pages share about
// recognizing speech on the server: whisper.cpp on this machine (downloaded only when turned on), or
// any OpenAI-compatible transcription service.

/** whisper.cpp's models by size: a bigger one hears better and takes longer. */
export type WhisperSize = 'tiny' | 'base' | 'small' | 'medium';

export const WHISPER_MODELS: { size: WhisperSize; label: string; bytes: number; note: string }[] = [
  { size: 'tiny', label: 'Tiny', bytes: 77_691_713, note: 'The fastest; it mishears a word now and then.' },
  { size: 'base', label: 'Base', bytes: 147_951_465, note: 'Quick, and good enough for most dictation.' },
  { size: 'small', label: 'Small', bytes: 487_601_967, note: 'Hears better; a few seconds per sentence on a CPU.' },
  { size: 'medium', label: 'Medium', bytes: 1_533_763_059, note: 'Hears best; slow without a fast CPU.' },
];

/** Where the server turns speech into text: nowhere, here with whisper.cpp, or at a service. */
export type VoiceEngine = 'off' | 'local' | 'endpoint';

/** A download (or build) under way. */
export interface VoiceProgress {
  /** Getting whisper.cpp, building it from its source (when no ready-made copy runs here), or getting the model. */
  step: 'program' | 'build' | 'model';
  doneBytes: number;
  /** 0 while not known. */
  totalBytes: number;
  /** A build's progress, 0 to 100. */
  percent?: number;
  detail?: string;
}

export interface VoiceState {
  engine: VoiceEngine;
  /** Recordings can be turned into text now. */
  ready: boolean;
  local: {
    size: WhisperSize;
    /** The English-only model: a little better in English, no other language. */
    english: boolean;
    status: 'off' | 'installing' | 'ready' | 'failed';
    progress?: VoiceProgress;
    error?: string;
    /** whisper.cpp: a ready-made copy the app downloaded, one it built here, or your own. */
    program?: { version?: string; source: 'prebuilt' | 'built' | 'yours'; sizeBytes: number };
    /** Models on this machine. */
    models: { size: WhisperSize; english: boolean; sizeBytes: number }[];
    /** What turning it on downloads now, in bytes (0 when everything is here). */
    needBytes: number;
  };
  endpoint?: { url: string; model: string; keyHint?: string };
  /** ffmpeg is here, to read recordings the browser could not turn into WAV. */
  ffmpeg: boolean;
}

export interface VoicePatch {
  engine?: VoiceEngine;
  size?: WhisperSize;
  english?: boolean;
  /** An OpenAI-compatible service; `apiKey` null removes the key, undefined keeps it. */
  endpoint?: { url: string; model?: string; apiKey?: string | null };
}

/** Whisper's code for a language the browser names ("pt-BR" → "pt"); '' when it is not one. */
export function whisperLang(tag: string): string {
  const base = tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  const alias: Record<string, string> = { nb: 'no', iw: 'he', fil: 'tl', jv: 'jw', in: 'id' };
  const code = alias[base] ?? base;
  return /^[a-z]{2,3}$/.test(code) ? code : '';
}
