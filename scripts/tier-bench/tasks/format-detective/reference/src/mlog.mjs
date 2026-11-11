// Reads an .mlog file (the old metrics collector's format) and returns what mlog-dump printed for it.
// Every number is built with ordinary arithmetic, never with 32-bit bit operations: times and values go up to 2^53.

const MAX_VARINT_BYTES = 8;

// The CRC-32 of the zlib family (IEEE 802.3), table driven.
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(bytes, end) {
  let c = 0xffffffff;
  for (let i = 0; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A reader over a byte array that refuses to read past its end.
class Reader {
  constructor(bytes, pos, end) {
    this.bytes = bytes;
    this.pos = pos;
    this.end = end;
  }

  get done() {
    return this.pos >= this.end;
  }

  byte() {
    if (this.pos >= this.end) throw new Error('truncated file');
    return this.bytes[this.pos++];
  }

  take(n) {
    if (this.pos + n > this.end) throw new Error('truncated field');
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  // Unsigned LEB128, low 7 bits first, as a Number (it never reaches 2^53).
  varint() {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < MAX_VARINT_BYTES; i++) {
      if (this.pos >= this.end) throw new Error('truncated varint');
      const b = this.bytes[this.pos++];
      value += (b & 0x7f) * scale;
      if (b < 0x80) {
        if (value > Number.MAX_SAFE_INTEGER) throw new Error('varint too large');
        return value;
      }
      scale *= 128;
    }
    throw new Error('varint too long');
  }

  // A signed value stored as a zigzag varint: 0, -1, 1, -2, 2 ... are 0, 1, 2, 3, 4 ...
  zigzag() {
    const n = this.varint();
    return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
  }
}

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
function text(bytes) {
  try {
    return utf8.decode(bytes);
  } catch {
    throw new Error('invalid UTF-8');
  }
}

// Expands the PackBits stream in bytes[pos..end) into exactly `length` bytes.
function unpack(bytes, pos, end, length) {
  const out = new Uint8Array(length);
  let o = 0;
  while (pos < end) {
    const h = bytes[pos++];
    if (h === 0x80) continue;
    if (h < 0x80) {
      const n = h + 1;
      if (pos + n > end) throw new Error('truncated field');
      if (o + n > length) throw new Error('decompressed length mismatch');
      out.set(bytes.subarray(pos, pos + n), o);
      pos += n;
      o += n;
    } else {
      const n = 257 - h;
      if (pos >= end) throw new Error('truncated field');
      if (o + n > length) throw new Error('decompressed length mismatch');
      out.fill(bytes[pos++], o, o + n);
      o += n;
    }
  }
  if (o !== length) throw new Error('decompressed length mismatch');
  return out;
}

export function decode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 6) throw new Error('truncated file');
  if (bytes[0] !== 0x4d || bytes[1] !== 0x4c || bytes[2] !== 0x4f || bytes[3] !== 0x47) throw new Error('bad magic');
  const version = bytes[4];
  if (version !== 1 && version !== 2) throw new Error(`unsupported version ${version}`);
  const flags = bytes[5];
  if (flags & ~0b111) throw new Error('unknown flags');
  const hasTable = (flags & 1) !== 0;
  const compressed = (flags & 2) !== 0;
  const hasCrc = (flags & 4) !== 0;
  if (compressed && version === 1) throw new Error('compression needs version 2');

  let end = bytes.length;
  if (hasCrc) {
    if (end < 6 + 4) throw new Error('truncated file');
    end -= 4;
    const stored = (bytes[end] | (bytes[end + 1] << 8) | (bytes[end + 2] << 16) | (bytes[end + 3] << 24)) >>> 0;
    if (crc32(bytes, end) !== stored) throw new Error('checksum mismatch');
  }

  const head = new Reader(bytes, 6, end);
  let strings = null;
  if (hasTable) {
    const count = head.varint();
    strings = [];
    for (let i = 0; i < count; i++) strings.push(text(head.take(head.varint())));
  }

  let body = head;
  if (compressed) {
    const length = head.varint();
    const raw = unpack(bytes, head.pos, end, length);
    body = new Reader(raw, 0, raw.length);
  }

  const out = { version, samples: [], events: [], gaps: [] };
  const view = new DataView(body.bytes.buffer, body.bytes.byteOffset, body.bytes.byteLength);
  let t = 0;
  let delta = 0;
  while (!body.done) {
    const tag = body.byte();
    const kind = tag >> 6;
    const metric = tag & 63;
    if (kind === 3) throw new Error('unknown record kind 3');
    if (kind === 2) {
      const duration = body.varint();
      out.gaps.push([t, t + duration]);
      t += duration;
      delta = 0;
      continue;
    }
    delta += body.zigzag();
    t += delta;
    if (kind === 1) {
      let s;
      if (strings) {
        const index = body.varint();
        if (index >= strings.length) throw new Error(`string index ${index} out of range`);
        s = strings[index];
      } else {
        s = text(body.take(body.varint()));
      }
      out.events.push([t, metric, s]);
      continue;
    }
    let value;
    const type = version === 1 ? 0 : body.byte();
    if (type === 0) value = body.zigzag();
    else if (type === 1) value = view.getFloat64(body.take(8).byteOffset - body.bytes.byteOffset, true);
    else if (type === 2) value = view.getFloat32(body.take(4).byteOffset - body.bytes.byteOffset, true);
    else if (type === 3) value = null;
    else throw new Error(`unknown value type ${type}`);
    out.samples.push([t, metric, value]);
  }
  return out;
}
