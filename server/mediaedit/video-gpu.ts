// Videos made on the graphics card: which hardware encoders this ffmpeg has (NVIDIA's NVENC, VA-API on a /dev/dri
// render node, Intel's Quick Sync, Apple's VideoToolbox, AMD's AMF, Windows' Media Foundation), each tried once with a
// tiny test encode the first time a video is made (never when the app starts), the best that works used for MP4 and
// MOV (H.264, H.265, AV1), with the card decoding too where that is safe (NVIDIA, Apple). The filters stay on the
// processor; only the frames' last step goes to the card. One that fails a real edit is not used again until the app
// starts again, and that edit is made again on the processor at once (video.ts). Settings → Images, video and audio →
// "Use the graphics card for videos" turns it off; HYDOR_VIDEO_GPU=off does too, for good (tests, a shared machine).
//
// What is tried is behind GpuProbe, so tests give their own and never touch a graphics card.
//
// Routes, signed in:
//   GET  /api/videos/gpu         GpuState: the setting, and what was found
//   PUT  /api/videos/gpu         { mode: 'auto' | 'off' } → GpuState
//   POST /api/videos/gpu/check   tries the graphics card again now → GpuState
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import type { VideoCodec, VideoQuality } from '../../shared/mediaedit-video.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import type { Deps } from '../features/types.ts';
import { ffmpegTools } from '../media/frames.ts';

export type HwApi = 'nvenc' | 'vaapi' | 'qsv' | 'videotoolbox' | 'amf' | 'mf';
export type GpuMode = 'auto' | 'off';

/** Each way of a graphics card's, as people know it. */
export const HW_NAMES: Record<HwApi, string> = {
  nvenc: 'NVENC',
  vaapi: 'VA-API',
  qsv: 'Quick Sync',
  videotoolbox: 'VideoToolbox',
  amf: 'AMF',
  mf: 'Media Foundation',
};

/** The encoders of each way, by codec. */
export const HW_ENCODERS: Record<HwApi, Partial<Record<VideoCodec, string>>> = {
  nvenc: { h264: 'h264_nvenc', h265: 'hevc_nvenc', av1: 'av1_nvenc' },
  vaapi: { h264: 'h264_vaapi', h265: 'hevc_vaapi', av1: 'av1_vaapi' },
  qsv: { h264: 'h264_qsv', h265: 'hevc_qsv', av1: 'av1_qsv' },
  videotoolbox: { h264: 'h264_videotoolbox', h265: 'hevc_videotoolbox' },
  amf: { h264: 'h264_amf', h265: 'hevc_amf', av1: 'av1_amf' },
  mf: { h264: 'h264_mf', h265: 'hevc_mf' },
};

/** The ways to try on this kind of computer, the best first. */
export function hwOrder(platform: NodeJS.Platform): HwApi[] {
  if (platform === 'darwin') return ['videotoolbox'];
  if (platform === 'win32') return ['nvenc', 'amf', 'qsv', 'mf'];
  return ['nvenc', 'vaapi', 'qsv'];
}

/** A graphics card found to make videos: its way, its name, and the encoders that passed their test. */
export interface GpuFound {
  api: HwApi;
  /** "NVIDIA GeForce RTX 4090", or the maker's name. */
  name: string;
  /** As Settings and the editor show it: "NVIDIA GeForce RTX 4090 · NVENC". */
  label: string;
  encoders: Partial<Record<VideoCodec, string>>;
  /** VA-API's render node (/dev/dri/renderD128). */
  device?: string;
}

/** What Settings shows (GET /api/videos/gpu). */
export interface GpuState {
  mode: GpuMode;
  /** Turned off for good on this computer (HYDOR_VIDEO_GPU=off). */
  forcedOff?: boolean;
  /** Whether the card was tried yet (the first video made tries it). */
  checked: boolean;
  /** Being tried now. */
  checking?: boolean;
  found: GpuFound | null;
  /** Encoders that failed an edit since the app started: not used again until it starts again. */
  broken?: string[];
}

/** How the card is tried; tests give their own. */
export interface GpuProbe {
  /** The encoders this ffmpeg has. */
  encoders(bin: string): Promise<Set<string>>;
  /** The /dev/dri render nodes (Linux). */
  renderNodes(): string[];
  /** A tiny encode with this encoder: whether it worked. */
  test(bin: string, api: HwApi, encoder: string, device?: string): Promise<boolean>;
  /** The card's name, or null. */
  name(api: HwApi, device?: string): Promise<string | null>;
}

function run(bin: string, args: string[], timeout: number): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) =>
    execFile(bin, args, { timeout, maxBuffer: 8 << 20, env: agentBaseEnv(), windowsHide: true }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout ?? ''}${stderr ?? ''}` })),
  );
}

/** The arguments a test encode or a real one needs before its inputs, for a way of the card's. */
export function hwInit(api: HwApi, device?: string): string[] {
  if (api === 'vaapi' && device) return ['-init_hw_device', `vaapi=va:${device}`, '-filter_hw_device', 'va'];
  return [];
}

/** The frames' last step for a way: VA-API takes them on the card (nv12, uploaded); the others take them from memory. */
export function hwTail(api: HwApi): { pix: string; upload: boolean } {
  if (api === 'vaapi') return { pix: 'nv12', upload: true };
  if (api === 'qsv' || api === 'mf' || api === 'videotoolbox') return { pix: 'nv12', upload: false };
  return { pix: 'yuv420p', upload: false };
}

/** The decoding the card does for a video input, where that is safe: frames come back to memory for the filters. */
export function hwDecode(api: HwApi): string[] {
  if (api === 'nvenc') return ['-hwaccel', 'cuda'];
  if (api === 'videotoolbox') return ['-hwaccel', 'videotoolbox'];
  return [];
}

const VENDORS: Record<string, string> = { '0x8086': 'Intel graphics', '0x1002': 'AMD graphics', '0x10de': 'NVIDIA graphics' };

export const realProbe: GpuProbe = {
  async encoders(bin) {
    const r = await run(bin, ['-hide_banner', '-encoders'], 20_000);
    return new Set(
      r.out
        .split('\n')
        .map((l) => /^\s*V\S*\s+(\S+)/.exec(l)?.[1])
        .filter((x): x is string => !!x),
    );
  },
  renderNodes() {
    try {
      return fs
        .readdirSync('/dev/dri')
        .filter((n) => /^renderD\d+$/.test(n))
        .sort()
        .map((n) => `/dev/dri/${n}`);
    } catch {
      return [];
    }
  },
  async test(bin, api, encoder, device) {
    const tail = hwTail(api);
    const vf = tail.upload ? `format=${tail.pix},hwupload` : `format=${tail.pix}`;
    const args = ['-hide_banner', '-nostdin', '-v', 'error', ...hwInit(api, device), '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=30:d=0.5', '-vf', vf, '-frames:v', '10', '-c:v', encoder, '-f', 'null', '-'];
    return (await run(bin, args, 20_000)).ok;
  },
  async name(api, device) {
    if (api === 'nvenc') {
      const r = await run('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], 8000);
      const n = r.ok ? r.out.split('\n')[0]?.trim() : '';
      return n ? (/^nvidia/i.test(n) ? n : `NVIDIA ${n}`) : 'NVIDIA graphics';
    }
    if (api === 'vaapi' && device) {
      try {
        const v = fs.readFileSync(`/sys/class/drm/${device.split('/').pop()}/device/vendor`, 'utf8').trim();
        return VENDORS[v] ?? 'Graphics card';
      } catch {
        return 'Graphics card';
      }
    }
    if (api === 'qsv') return 'Intel graphics';
    if (api === 'amf') return 'AMD graphics';
    if (api === 'videotoolbox') return 'Apple graphics';
    return 'Graphics card';
  },
};

let probe: GpuProbe = realProbe;
/** Tests try their own card. */
export function setGpuProbe(p: GpuProbe | null) {
  probe = p ?? realProbe;
  forgetGpu();
}

let checked: { bin: string; found: GpuFound | null } | null = null;
let checking: Promise<GpuFound | null> | null = null;
const broken = new Set<string>();

/** Tries the card again on the next ask (tests; Check again). */
export function forgetGpu() {
  checked = null;
  checking = null;
  broken.clear();
}

/** Whether HYDOR_VIDEO_GPU turns it off on this computer. */
const forcedOff = () => /^(?:off|0|no|false|cpu)$/i.test(process.env.HYDOR_VIDEO_GPU ?? '');

/** The setting: Automatic (the card when it works) or Off. */
export function gpuMode(db: DB): GpuMode {
  if (forcedOff()) return 'off';
  try {
    return JSON.parse(kvGet(db, 'videoGpu') ?? '{}').mode === 'off' ? 'off' : 'auto';
  } catch {
    return 'auto';
  }
}

/** Tries each way this ffmpeg has, the best first: the first whose test encode works is the card used. */
async function tryCard(bin: string): Promise<GpuFound | null> {
  const have = await probe.encoders(bin);
  for (const api of hwOrder(process.platform)) {
    const encs = Object.entries(HW_ENCODERS[api]).filter(([, e]) => have.has(e!)) as [VideoCodec, string][];
    if (!encs.length) continue;
    const device = api === 'vaapi' ? probe.renderNodes()[0] : undefined;
    if (api === 'vaapi' && !device) continue;
    const works: Partial<Record<VideoCodec, string>> = {};
    // H.264 first: a card that cannot make it is not tried for the others.
    for (const [codec, enc] of encs.sort(([a], [b]) => (a === 'h264' ? -1 : b === 'h264' ? 1 : 0))) {
      if (await probe.test(bin, api, enc, device)) works[codec] = enc;
      else if (codec === 'h264') break;
    }
    if (!Object.keys(works).length) continue;
    const name = (await probe.name(api, device).catch(() => null)) || 'Graphics card';
    return { api, name, label: `${name} · ${HW_NAMES[api]}`, encoders: works, ...(device ? { device } : {}) };
  }
  return null;
}

/** The card found for this ffmpeg, tried the first time it is asked for (and again after Check again). */
export async function gpuFound(bin: string): Promise<GpuFound | null> {
  if (checked?.bin === bin) return checked.found;
  if (!checking)
    checking = tryCard(bin)
      .catch(() => null)
      .then((found) => {
        checked = { bin, found };
        checking = null;
        return found;
      });
  return checking;
}

/** The card's encoder to make `codec` with, or null: the processor makes it (off, none found, or it failed before). */
export async function gpuEncoder(db: DB, bin: string, codec: VideoCodec): Promise<(GpuFound & { encoder: string }) | null> {
  if (gpuMode(db) === 'off') return null;
  const found = await gpuFound(bin);
  const encoder = found?.encoders[codec];
  return found && encoder && !broken.has(encoder) ? { ...found, encoder } : null;
}

/** An encoder that failed a real edit: the processor makes the rest until the app starts again. */
export const markBroken = (encoder: string) => void broken.add(encoder);

export function gpuState(db: DB): GpuState {
  return {
    mode: gpuMode(db),
    ...(forcedOff() ? { forcedOff: true } : {}),
    checked: !!checked,
    ...(checking ? { checking: true } : {}),
    found: checked?.found ?? null,
    ...(broken.size ? { broken: [...broken] } : {}),
  };
}

// ---- how each encoder is asked for quality --------------------------------------------------------------------------

/** Constant quality for each quality and codec, as each family of encoders counts it (lower is better). */
const CQ: Record<string, Record<VideoQuality, number>> = {
  x264: { small: 26, standard: 21, high: 18 },
  x265: { small: 30, standard: 26, high: 22 },
  svtav1: { small: 42, standard: 34, high: 27 },
  aom: { small: 40, standard: 32, high: 26 },
  nvenc_h264: { small: 28, standard: 23, high: 19 },
  nvenc_h265: { small: 30, standard: 25, high: 21 },
  nvenc_av1: { small: 36, standard: 30, high: 24 },
  vaapi: { small: 30, standard: 24, high: 20 },
  qsv: { small: 30, standard: 24, high: 20 },
  amf: { small: 30, standard: 24, high: 20 },
  vp9: { small: 40, standard: 33, high: 28 },
};

/** Bits a pixel a frame, for the encoders asked for a bitrate (H.265 and AV1 need about two thirds of it). */
const BPP: Record<VideoQuality, number> = { small: 0.06, standard: 0.1, high: 0.16 };

/** A bitrate for `w`×`h` at `fps`, as ffmpeg takes it ("6200k"). */
export function bitrate(w: number, h: number, fps: number, q: VideoQuality, codec: VideoCodec): string {
  const k = codec === 'h264' ? 1 : 0.65;
  return `${Math.max(300, Math.round((w * h * Math.min(60, fps) * BPP[q] * k) / 1000))}k`;
}

/** The arguments that set the encoder and its quality, after -c:v. */
export function encoderArgs(encoder: string, o: { quality: VideoQuality; codec: VideoCodec; w: number; h: number; fps: number }): string[] {
  const q = o.quality;
  if (encoder === 'libx264') return ['-preset', q === 'high' ? 'medium' : 'veryfast', '-crf', String(CQ.x264[q])];
  if (encoder === 'libx265') return ['-preset', q === 'high' ? 'medium' : 'fast', '-crf', String(CQ.x265[q]), '-tag:v', 'hvc1', '-x265-params', 'log-level=error'];
  if (encoder === 'libsvtav1') return ['-preset', q === 'high' ? '6' : q === 'standard' ? '8' : '10', '-crf', String(CQ.svtav1[q])];
  if (encoder === 'libaom-av1') return ['-cpu-used', q === 'high' ? '4' : '6', '-row-mt', '1', '-b:v', '0', '-crf', String(CQ.aom[q])];
  if (encoder === 'librav1e') return ['-speed', q === 'high' ? '6' : '8', '-qp', q === 'high' ? '80' : q === 'standard' ? '110' : '140'];
  if (encoder === 'libopenh264') return ['-b:v', bitrate(o.w, o.h, o.fps, q, 'h264')];
  if (encoder === 'libvpx-vp9') return q === 'high' ? ['-b:v', '0', '-crf', String(CQ.vp9[q]), '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1'] : ['-b:v', '0', '-crf', String(CQ.vp9[q]), '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1'];
  if (encoder === 'libvpx') return ['-b:v', bitrate(o.w, o.h, o.fps, q, 'h264'), '-crf', '10', '-deadline', 'realtime', '-cpu-used', '8'];
  if (encoder.endsWith('_nvenc')) {
    const cq = CQ[`nvenc_${o.codec}`]?.[q] ?? 23;
    return ['-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', String(cq), '-b:v', '0', '-spatial-aq', '1', '-aq-strength', '8', ...(o.codec === 'h265' ? ['-tag:v', 'hvc1'] : [])];
  }
  if (encoder.endsWith('_vaapi')) return ['-qp', String(CQ.vaapi[q] + (o.codec === 'h264' ? 0 : 2)), ...(o.codec === 'h265' ? ['-tag:v', 'hvc1'] : [])];
  if (encoder.endsWith('_qsv')) return ['-preset', 'medium', '-global_quality', String(CQ.qsv[q] + (o.codec === 'h264' ? 0 : 2)), ...(o.codec === 'h265' ? ['-tag:v', 'hvc1'] : [])];
  if (encoder.endsWith('_amf')) {
    const qp = String(CQ.amf[q] + (o.codec === 'h264' ? 0 : 2));
    return ['-quality', 'quality', '-rc', 'cqp', '-qp_i', qp, '-qp_p', qp, ...(o.codec === 'h264' ? ['-qp_b', qp] : []), ...(o.codec === 'h265' ? ['-tag:v', 'hvc1'] : [])];
  }
  if (encoder.endsWith('_videotoolbox')) return ['-b:v', bitrate(o.w, o.h, o.fps, q, o.codec), ...(o.codec === 'h265' ? ['-tag:v', 'hvc1'] : [])];
  if (encoder.endsWith('_mf')) return ['-b:v', bitrate(o.w, o.h, o.fps, q, o.codec), '-rate_control', 'quality'];
  return ['-b:v', bitrate(o.w, o.h, o.fps, q, o.codec)];
}

// ---- routes -------------------------------------------------------------------------------------------------------

export function gpuRoutes(d: Deps) {
  const { app, db } = d;
  app.get('/api/videos/gpu', async () => gpuState(db));
  app.put('/api/videos/gpu', async (req) => {
    const mode = (req.body as { mode?: unknown } | undefined)?.mode;
    if (mode !== 'auto' && mode !== 'off') throw new HttpError(400, 'mode: "auto" (the graphics card when there is one that works) or "off" (the processor)');
    kvSet(db, 'videoGpu', JSON.stringify({ mode }));
    return gpuState(db);
  });
  app.post('/api/videos/gpu/check', async () => {
    if (forcedOff()) return gpuState(db);
    const tools = await ffmpegTools();
    if (!tools) throw new HttpError(400, 'Video editing needs ffmpeg: set up the picture tools in Settings → Images, video and audio, or install ffmpeg');
    checked = null;
    broken.clear();
    await gpuFound(tools.ffmpeg);
    return gpuState(db);
  });
}
