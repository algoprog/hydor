// Recordings come out of the browser as WebM/Opus (Chrome, Firefox) or MP4/AAC (Safari), which
// whisper.cpp cannot read by itself. The browser decodes what it recorded and sends 16 kHz mono WAV
// instead, so the server needs no ffmpeg; when decoding fails, the recording goes as it is.

const RATE = 16000;

/** The recording as 16 kHz mono WAV, or null when this browser cannot decode it. */
export async function toWav(blob: Blob): Promise<Blob | null> {
  try {
    const Ctx: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx || typeof OfflineAudioContext === 'undefined') return null;
    const ctx = new Ctx();
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    } finally {
      void ctx.close?.().catch(() => {});
    }
    // Rendering into one channel at 16 kHz mixes the channels down and resamples.
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    return encode((await off.startRendering()).getChannelData(0));
  } catch {
    return null;
  }
}

/** 16-bit PCM WAV. */
function encode(samples: Float32Array): Blob {
  const b = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => b.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  b.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, 1, true);
  b.setUint32(24, RATE, true);
  b.setUint32(28, RATE * 2, true);
  b.setUint16(32, 2, true);
  b.setUint16(34, 16, true);
  text(36, 'data');
  b.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    b.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([b.buffer], { type: 'audio/wav' });
}
