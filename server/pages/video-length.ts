// How long a video is, read from its own bytes: an MP4 or a QuickTime film by its movie header (moov → mvhd: its
// time scale and duration), a WebM or Matroska film by its segment's information (its timecode scale and duration).
// PowerPoint keeps a trimmed video's end as the time cut off its end, which needs the length; null when it cannot be read.

/** A video's length in seconds, or null when its bytes do not say. */
export function videoSeconds(b: Buffer): number | null {
  if (b.length < 16) return null;
  if (b.readUInt32BE(0) === 0x1a45dfa3) return matroskaSeconds(b);
  return mp4Seconds(b);
}

/** The movie header's duration over its time scale, from the top-level boxes (the movie's box may come after its data). */
function mp4Seconds(b: Buffer): number | null {
  const box = (from: number, to: number, type: string): { at: number; end: number } | null => {
    for (let i = from; i + 8 <= to;) {
      let size = b.readUInt32BE(i);
      let head = 8;
      if (size === 1) {
        if (i + 16 > to) return null;
        size = Number(b.readBigUInt64BE(i + 8));
        head = 16;
      } else if (size === 0) size = to - i;
      if (size < head || i + size > to) return null;
      if (b.toString('latin1', i + 4, i + 8) === type) return { at: i + head, end: i + size };
      i += size;
    }
    return null;
  };
  const moov = box(0, b.length, 'moov');
  const mvhd = moov ? box(moov.at, moov.end, 'mvhd') : null;
  if (!mvhd || mvhd.at + 32 > mvhd.end) return null;
  const v1 = b[mvhd.at] === 1;
  const scale = b.readUInt32BE(mvhd.at + (v1 ? 20 : 12));
  const dur = v1 ? Number(b.readBigUInt64BE(mvhd.at + 24)) : b.readUInt32BE(mvhd.at + 16);
  return scale > 0 && dur > 0 && dur !== 0xffffffff ? dur / scale : null;
}

/** A Matroska element's id (its marker bits kept) or size (taken off), and how many bytes it took. */
function vint(b: Buffer, i: number, id: boolean): { v: number; n: number; unknown?: boolean } | null {
  if (i >= b.length) return null;
  const first = b[i];
  let n = 1;
  while (n <= 8 && !(first & (0x80 >> (n - 1)))) n++;
  if (n > 8 || i + n > b.length) return null;
  let v = id ? first : first & (0xff >> n);
  let ones = v === 0xff >> n;
  for (let k = 1; k < n; k++) {
    v = v * 256 + b[i + k];
    if (b[i + k] !== 0xff) ones = false;
  }
  return { v, n, ...(id ? {} : ones ? { unknown: true } : {}) };
}

/** The segment's Info: its TimecodeScale (nanoseconds a tick; a million when not said) and Duration (in ticks, a float). */
function matroskaSeconds(b: Buffer): number | null {
  const SEGMENT = 0x18538067;
  const INFO = 0x1549a966;
  const SCALE = 0x2ad7b1;
  const DURATION = 0x4489;
  const walk = (from: number, to: number, want: number): { at: number; end: number } | null => {
    for (let i = from; i < to;) {
      const id = vint(b, i, true);
      const size = id && vint(b, i + id.n, false);
      if (!id || !size) return null;
      const at = i + id.n + size.n;
      const end = size.unknown ? to : Math.min(to, at + size.v);
      if (id.v === want) return { at, end };
      if (size.unknown) return null;
      i = at + size.v;
    }
    return null;
  };
  const head = walk(0, b.length, 0x1a45dfa3);
  if (!head) return null;
  const seg = walk(head.end, b.length, SEGMENT);
  const info = seg ? walk(seg.at, seg.end, INFO) : null;
  if (!info) return null;
  let scale = 1_000_000;
  let ticks: number | null = null;
  for (let i = info.at; i < info.end;) {
    const id = vint(b, i, true);
    const size = id && vint(b, i + id.n, false);
    if (!id || !size || size.unknown) break;
    const at = i + id.n + size.n;
    if (at + size.v > info.end) break;
    if (id.v === SCALE && size.v >= 1 && size.v <= 8) scale = b.readUIntBE(at, Math.min(6, size.v));
    if (id.v === DURATION) ticks = size.v === 4 ? b.readFloatBE(at) : size.v === 8 ? b.readDoubleBE(at) : null;
    i = at + size.v;
  }
  return ticks !== null && ticks > 0 && scale > 0 ? (ticks * scale) / 1e9 : null;
}
