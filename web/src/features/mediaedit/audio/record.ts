// Recording from the microphone, for a voice-over: the browser's own recorder (WebM or Ogg with Opus, MP4 on Safari),
// how loud it is now (for the clip that grows on its track as it records), and how long it has gone.
export interface Recorder {
  /** Stops: the recording, and how long it is (seconds). */
  stop(): Promise<{ blob: Blob; seconds: number }>;
  cancel(): void;
  /** How loud it is now, 0 to 1. */
  level(): number;
  seconds(): number;
}

/** Starts recording (asking for the microphone the first time). Throws, in words a person can act on. */
export async function startRecording(): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record from a microphone here (it needs a secure address: https, or this computer’s own)');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
  } catch (e) {
    throw new Error((e as Error).name === 'NotAllowedError' ? 'The microphone is not allowed for this page: allow it in the browser, then try again' : `The microphone could not be opened: ${(e as Error).message}`);
  }
  const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t));
  const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 128_000 } : undefined);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  const t0 = performance.now();
  rec.start(250);
  const close = () => {
    for (const t of stream.getTracks()) t.stop();
    void ctx.close().catch(() => {});
  };
  return {
    stop: () =>
      new Promise((resolve) => {
        const seconds = (performance.now() - t0) / 1000;
        rec.onstop = () => {
          close();
          resolve({ blob: new Blob(parts, { type: rec.mimeType || type || 'audio/webm' }), seconds });
        };
        rec.stop();
      }),
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
      close();
    },
    level: () => {
      an.getFloatTimeDomainData(buf);
      let m = 0;
      for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
      return m;
    },
    seconds: () => (performance.now() - t0) / 1000,
  };
}
