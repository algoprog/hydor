// Makes the samples (seed/samples/) and the hidden files (hidden.json.gz) for format-detective, and holds the writer of
// the .mlog format that the reference decoder (reference/src/mlog.mjs) reads. The format is never shown to the agent.
// Run: node gen.mjs   (it also checks that every feature the hidden files use is in the samples at least twice)
//
// The format: "MLOG", a version byte (1 or 2), a flags byte (bit 0 string table, bit 1 compressed body (version 2),
// bit 2 CRC-32 trailer), then the string table if flagged, then the body, then the CRC (little-endian, over every byte
// before it). A body is records; a compressed body is its length as a varint and then PackBits. A record's first byte
// is kind (top two bits: 0 sample, 1 event, 2 gap, 3 refused) and metric (low six bits). Samples and events carry their
// time as a zigzag delta-of-delta against one clock that every record shares (a gap adds its duration and resets the
// delta to 0). Version 1 values are zigzag varints; version 2 values start with a type byte (0 zigzag varint,
// 1 float64, 2 float32, 3 null). Events carry a string table index (varint) or, with no table, a length and UTF-8.
// Expected outputs are made from the records before they are written, never by decoding the bytes.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- random numbers

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const chance = (rng, p) => rng() < p;
function shuffle(rng, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- features seen while writing one file

let FEAT = null;
const feat = (name) => FEAT?.add(name);

// ---------------------------------------------------------------- the primitives

const MAX = Number.MAX_SAFE_INTEGER;

function varint(n) {
  if (!Number.isInteger(n) || n < 0 || n > MAX) throw new Error(`varint out of range: ${n}`);
  const out = [];
  while (n >= 128) {
    out.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  feat(`varint${out.length}`);
  return out;
}
const zigzag = (n) => varint(n >= 0 ? 2 * n : -2 * n - 1);
const utf8 = (s) => [...Buffer.from(s, 'utf8')];
function f64(v) {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(v);
  return [...b];
}
function f32(v) {
  const b = Buffer.alloc(4);
  b.writeFloatLE(v);
  return [...b];
}

const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// PackBits with a random mix of literal runs, repeat runs and no-ops. Options: noop (chance of a -128 before a run),
// minRun (shortest repeat run, 2 or 3), literalMax and repMax (longest runs, up to 128), shorten (chance of cutting a run).
function packbits(bytes, rng, o = {}) {
  const { noop = 0, minRun = 2, literalMax = 128, repMax = 128, shorten = 0.15 } = o;
  const out = [];
  const runAt = (i) => {
    let r = 1;
    while (i + r < bytes.length && bytes[i + r] === bytes[i] && r < 128) r++;
    return r;
  };
  const maybeNoop = () => {
    if (chance(rng, noop)) {
      out.push(0x80);
      feat('pb-noop');
    }
  };
  let i = 0;
  while (i < bytes.length) {
    maybeNoop();
    let r = Math.min(runAt(i), repMax);
    if (r >= minRun) {
      if (r > minRun && chance(rng, shorten)) r = ri(rng, minRun, r);
      out.push((257 - r) & 255, bytes[i]);
      feat(r === 128 ? 'pb-rep128' : r === 2 ? 'pb-rep2' : 'pb-rep');
      i += r;
    } else {
      const limit = chance(rng, shorten) ? (chance(rng, 0.25) ? 1 : ri(rng, 1, literalMax)) : literalMax;
      let j = i + 1;
      while (j < bytes.length && j - i < limit && runAt(j) < 3) j++;
      out.push(j - i - 1, ...bytes.slice(i, j));
      feat(j - i === 128 ? 'pb-lit128' : j - i === 1 ? 'pb-lit1' : 'pb-lit');
      i = j;
    }
  }
  if (o.trailingNoop || (bytes.length === 0 && chance(rng, noop))) {
    out.push(0x80);
    feat('pb-noop');
  }
  return out;
}

// ---------------------------------------------------------------- records and the body writer

const S = (T, m, v, vt = 'i') => ({ k: 's', T, m, v: vt === 'f' ? Math.fround(v) : vt === 'n' ? null : v, vt });
const E = (T, m, text) => ({ k: 'e', T, m, text });
const G = (dur) => ({ k: 'g', dur });
const RAW = (bytes) => ({ k: 'raw', bytes });

class Body {
  constructor(version, table) {
    this.version = version;
    this.table = table;
    this.bytes = [];
    this.t = 0;
    this.delta = 0;
  }

  time(T) {
    const dd = T - this.t - this.delta;
    this.bytes.push(...zigzag(dd));
    feat(dd < 0 ? 'dd-neg' : dd > 0 ? 'dd-pos' : 'dd-zero');
    this.delta = T - this.t;
    if (this.delta < 0) feat('time-back');
    this.t = T;
  }

  add(r) {
    if (r.k === 'raw') {
      this.bytes.push(...(typeof r.bytes === 'function' ? r.bytes(this) : r.bytes));
    } else if (r.k === 'g') {
      this.bytes.push(0x80, ...varint(r.dur));
      this.t += r.dur;
      this.delta = 0;
      feat('gap');
    } else if (r.k === 's') {
      this.bytes.push(r.m);
      if (r.m === 63) feat('metric63');
      if (r.m === 0) feat('metric0');
      this.time(r.T);
      if (this.version === 1) {
        if (r.vt !== 'i') throw new Error('version 1 has integers only');
        this.bytes.push(...zigzag(r.v));
      } else if (r.vt === 'i') this.bytes.push(0, ...zigzag(r.v));
      else if (r.vt === 'd') {
        this.bytes.push(1, ...f64(r.v));
        const a = Math.abs(r.v);
        if (a !== 0 && a < 2.2250738585072014e-308) feat('f64-subnormal');
        if (a > 1e300) feat('f64-huge');
      } else if (r.vt === 'f') {
        this.bytes.push(2, ...f32(r.v));
        const a = Math.abs(r.v);
        if (a !== 0 && a < 1.1754943508222875e-38) feat('f32-subnormal');
        if (String(r.v).length >= 12) feat('f32-inexact');
      } else this.bytes.push(3);
      if (this.version === 2) feat(`vt-${r.vt}`);
      if (typeof r.v === 'number' && r.v < 0) feat('neg-value');
    } else {
      this.bytes.push(0x40 | r.m);
      this.time(r.T);
      if (/[^\x00-\x7f]/.test(r.text)) feat('unicode');
      if (/[\u{10000}-\u{10ffff}]/u.test(r.text)) feat('astral');
      if (r.text.startsWith('﻿')) feat('bom');
      if (r.text.includes('\0')) feat('nul');
      if (r.text === '') feat('empty-text');
      const raw = utf8(r.text);
      if (raw.length >= 128) feat('long-text');
      if (this.table) this.bytes.push(...varint(this.table.get(r.text)));
      else this.bytes.push(...varint(raw.length), ...raw);
    }
  }
}

// What mlog-dump printed, made from the records.
function expectedOutput(version, records) {
  const out = { version, samples: [], events: [], gaps: [] };
  let cur = 0;
  for (const r of records) {
    if (r.k === 's') {
      out.samples.push([r.T, r.m, r.v]);
      cur = r.T;
    } else if (r.k === 'e') {
      out.events.push([r.T, r.m, r.text]);
      cur = r.T;
    } else if (r.k === 'g') {
      out.gaps.push([cur, cur + r.dur]);
      cur += r.dur;
    }
  }
  return out;
}

// ---------------------------------------------------------------- one file
// spec: version, strings, compress, crc (flags), records, rng; extraStrings (table entries nobody uses); pack (PackBits
// options); and for the files that must be refused: magic, versionByte, flagsByte (replace the header's), declenDelta,
// crcFlip ('body' or 'trailer'), cut (bytes dropped from the end), badTable (bytes replacing the first used string),
// rawFile (the bytes as they are), refuse (the message mlog-dump gave) and kind (what is wrong, for the coverage report).

function buildFile(spec) {
  const feats = new Set();
  FEAT = feats;
  try {
    const { version, records, rng } = spec;
    const flags = (spec.strings ? 1 : 0) | (spec.compress ? 2 : 0) | (spec.crc ? 4 : 0);
    let bytes;
    if (spec.rawFile) bytes = [...spec.rawFile];
    else {
      let table = null;
      let tableList = [];
      if (spec.strings) {
        const used = [...new Set(records.filter((r) => r.k === 'e').map((r) => r.text))];
        tableList = shuffle(rng, [...used, ...(spec.extraStrings ?? [])]);
        table = new Map();
        tableList.forEach((s, i) => {
          if (!table.has(s)) table.set(s, i);
        });
      }
      const body = new Body(version, table);
      for (const r of records) body.add(r);
      let stored = body.bytes;
      if (spec.compress) {
        stored = [...varint(body.bytes.length + (spec.declenDelta ?? 0)), ...packbits(body.bytes, rng, spec.pack)];
      }
      if (body.bytes.length === 0) feat('empty-body');
      bytes = [...Buffer.from(spec.magic ?? 'MLOG', 'latin1'), spec.versionByte ?? version, spec.flagsByte ?? flags];
      if (spec.strings) {
        bytes.push(...varint(tableList.length));
        if (tableList.length > 127) feat('table>127');
        let firstEvent = spec.badTable ? tableList.indexOf(records.find((r) => r.k === 'e').text) : -1;
        tableList.forEach((s, i) => {
          const raw = i === firstEvent ? spec.badTable : utf8(s);
          if (!spec.badTable && raw.length >= 128) feat('long-text');
          bytes.push(...varint(raw.length), ...raw);
        });
      }
      bytes.push(...stored);
    }
    if (spec.crc || (spec.flagsByte ?? 0) & 4) {
      const c = crc32(bytes);
      bytes.push(c & 255, (c >>> 8) & 255, (c >>> 16) & 255, (c >>> 24) & 255);
    }
    if (spec.crcFlip === 'body') bytes[bytes.length - 5] ^= 0x10;
    if (spec.crcFlip === 'trailer') bytes[bytes.length - 1] ^= 0x01;
    if (spec.cut) bytes.length -= spec.cut;
    const refused = spec.refuse !== undefined;
    return {
      bytes: Buffer.from(bytes),
      feats,
      refuse: spec.refuse,
      kind: spec.kind,
      expect: refused ? null : expectedOutput(version, records),
      flags: refused ? null : `v${version}${spec.strings ? 'S' : ''}${spec.compress ? 'C' : ''}${spec.crc ? 'R' : ''}`,
    };
  } finally {
    FEAT = null;
  }
}

// ---------------------------------------------------------------- realistic files, as the collector wrote them

const TEXTS = {
  ascii: ['restart', 'disk full', 'gc pause', 'config reloaded', 'sensor offline', 'probe ok', 'fan fault', 'link down', 'link up', 'calibrated'],
  unicode: ['Überlast', '温度过高', 'Αποτυχία δικτύου', 'fire 🔥 alarm', 'naïve retry', 'тревога', 'café ☕ closed', 'señal débil', '🚧 maintenance 🚧', 'é combining', 'zero\u0000byte'],
  bom: ['﻿start', '﻿restart ☃', 'ok', '﻿', 'ready'],
};
const longText = (rng) => {
  const word = pick(rng, ['replica lag exceeded threshold; ', 'sensor reading out of range, retrying; ', 'ленивая репликация задержана; ']);
  return word.repeat(ri(rng, 4, 12)).trim();
};
function makeText(rng, kind, vocab) {
  if (kind !== 'host' && chance(rng, 0.06)) return '';
  if (kind === 'host') return `node-${ri(rng, 0, vocab - 1)}.rack-${ri(rng, 1, 9)}`;
  if (kind === 'long') return chance(rng, 0.6) ? longText(rng) : pick(rng, TEXTS.ascii);
  if (kind === 'mixed') return pick(rng, chance(rng, 0.5) ? TEXTS.ascii : TEXTS.unicode);
  if (kind === 'bom-unicode') return pick(rng, chance(rng, 0.5) ? TEXTS.bom : TEXTS.unicode);
  return pick(rng, TEXTS[kind] ?? TEXTS.ascii);
}

const BASE = { s: 1.7e9, ms: 1.7e12, t100us: 1.7e13, us: 1.7e15, rel: 0 };
const PERIOD = { s: [10, 60], ms: [100, 60000], t100us: [1000, 600000], us: [100000, 60000000], rel: [1, 50] };

// o: version, n (records wanted), unit, metrics (how many) or metricIds, kinds (value kinds), eventP, gapP, backP,
// jitter, text, vocab, idle, extremes, gapEvery
function genRecords(rng, o) {
  const unit = o.unit ?? 'ms';
  const [p0, p1] = PERIOD[unit];
  const period = ri(rng, p0, p1);
  const jitter = o.jitter ?? Math.floor(period / 8);
  const v2 = o.version === 2;
  const kindsAll = v2 ? ['counter', 'gauge', 'f64', 'f32', 'nullable', 'mixed'] : ['counter', 'gauge'];
  const ids = o.metricIds ?? shuffle(rng, [...Array(64).keys()]).slice(0, o.metrics ?? ri(rng, 1, 6));
  const metrics = ids.map((id) => {
    const kind = o.idle ? 'idle' : pick(rng, o.kinds ?? kindsAll);
    const base = ri(rng, -500, 5000) + rng();
    return { id, kind, base, scale: pick(rng, [0.5, 3, 40, 1e4]), n: kind === 'counter' ? ri(rng, 0, 2 ** ri(rng, 1, 44)) : ri(rng, -300, 300) };
  });
  const value = (m) => {
    const noise = (rng() - 0.5) * m.scale;
    switch (m.kind) {
      case 'idle':
        return [0, 'i'];
      case 'counter':
        m.n += ri(rng, 0, 2 ** ri(rng, 0, 20));
        return [m.n, 'i'];
      case 'gauge':
        m.n += ri(rng, -20, 20);
        return [m.n, 'i'];
      case 'f64':
        return [m.base + noise, 'd'];
      case 'f32':
        return [Math.fround(m.base + noise), 'f'];
      case 'nullable':
        return chance(rng, 0.2) ? [null, 'n'] : [m.base + noise, 'd'];
      default: {
        const t = pick(rng, ['i', 'd', 'f', 'n']);
        if (t === 'i') return [ri(rng, -100000, 100000), 'i'];
        if (t === 'n') return [null, 'n'];
        return [t === 'f' ? Math.fround(m.base + noise) : m.base + noise, t];
      }
    }
  };
  const records = [];
  let T = Math.floor(BASE[unit] * (1 + rng() * 0.1)) + ri(rng, 0, 999);
  let cur = 0;
  const target = o.n;
  while (records.length < target) {
    T += period + ri(rng, -jitter, jitter);
    if (o.backP && chance(rng, o.backP)) T -= ri(rng, 1, Math.max(1, Math.ceil(period * 1.5)));
    const chosen = metrics.filter(() => o.idle || chance(rng, 0.8));
    for (const m of chance(rng, 0.1) || chosen.length === 0 ? [pick(rng, metrics)] : chosen) {
      const [v, vt] = value(m);
      records.push(S(T, m.id, v, vt));
      cur = T;
    }
    if (o.eventP && chance(rng, o.eventP)) {
      const ET = T + ri(rng, 0, Math.floor(period / 4));
      records.push(E(ET, ri(rng, 0, 63), makeText(rng, o.text ?? 'ascii', o.vocab ?? 100)));
      cur = ET;
    }
    if (o.gapEvery || (o.gapP && chance(rng, o.gapP))) {
      const dur = o.gapEvery ? ri(rng, 1, period * 3) : ri(rng, period, period * ri(rng, 2, 200));
      records.push(G(dur));
      cur += dur;
      T = cur;
    }
  }
  if (o.emptyEvent) records.push(E(Math.max(T, cur) + 1, 7, ''));
  if (o.extremes) {
    // special values, at the end of the file so that the rest stays ordinary
    let t2 = Math.max(T, cur) + period;
    const x = [
      [1.401298464324817e-45, 'f'],
      [1e-40, 'f'],
      [-3.4028234663852886e38, 'f'],
      [5e-324, 'd'],
      [-2.2250738585072014e-308, 'd'],
      [1.7976931348623157e308, 'd'],
      [0.1, 'f'],
      [1 / 3, 'd'],
      [2 ** 52 - 1, 'i'],
      [-(2 ** 52), 'i'],
    ];
    for (const [v, vt] of x) records.push(S((t2 += period), 63, v, vt));
  }
  return records;
}

// A realistic file: records from genRecords, written with the flags given.
function real(seed, version, fl, o, extra = {}) {
  const rng = prng(seed);
  const records = genRecords(rng, { version, ...o });
  return buildFile({ version, strings: fl.strings, compress: fl.compress, crc: fl.crc, records, rng, pack: o.pack, ...extra });
}

// ---------------------------------------------------------------- the samples

// A small valid file to damage: refused samples and hidden files are made from one of these.
function base(seed, version, fl, extra = {}, o = {}) {
  return real(seed, version, fl, { n: 14, unit: 'ms', eventP: 0.3, ...o }, extra);
}
const withRaw = (seed, version, fl, raws, extra = {}, o = {}) => {
  const rng = prng(seed);
  const records = [...genRecords(rng, { version, n: 12, unit: 's', eventP: 0.3, ...o }), ...raws.map(RAW)];
  return buildFile({ version, strings: fl.strings, compress: fl.compress, crc: fl.crc, records, rng, ...extra });
};

const sampleSpecs = [
  // good files
  () => real(101, 1, {}, { unit: 's', metrics: 3, n: 30 }),
  () => real(102, 1, {}, { unit: 'ms', metrics: 2, n: 40, eventP: 0.25, text: 'mixed', gapP: 0.08, backP: 0.15 }),
  () => real(103, 1, { strings: 1 }, { unit: 's', n: 50, eventP: 0.3, text: 'bom-unicode', gapP: 0.05, emptyEvent: true }),
  () => real(104, 1, { crc: 1 }, { unit: 'us', metrics: 4, n: 40, gapP: 0.05 }),
  () => real(105, 1, { strings: 1, crc: 1 }, { unit: 't100us', n: 60, backP: 0.1, gapP: 0.1, eventP: 0.2, text: 'mixed' }),
  () => buildFile({ version: 1, records: [], rng: prng(106) }),
  () => real(107, 2, {}, { unit: 'ms', metrics: 6, n: 60, eventP: 0.1, kinds: ['counter', 'gauge', 'f64', 'f32', 'nullable', 'mixed'] }),
  () => real(108, 2, {}, { unit: 'us', n: 40, extremes: true, metrics: 3 }),
  () => real(109, 2, { strings: 1 }, { unit: 'ms', n: 160, eventP: 0.9, text: 'host', vocab: 200, metrics: 2 }, { extraStrings: [...Array(130).keys()].map((i) => `pad ${i}`) }),
  () => real(110, 2, { compress: 1 }, { unit: 'ms', idle: true, n: 400, jitter: 0, metricIds: [0] }),
  () => real(111, 2, { compress: 1, crc: 1 }, { unit: 'ms', metrics: 5, n: 150, gapP: 0.05, eventP: 0.1, text: 'unicode' }, { pack: { noop: 0.3, shorten: 0.4 } }),
  () => real(112, 2, { compress: 1, strings: 1, crc: 1 }, { unit: 's', n: 80, text: 'bom-unicode', eventP: 0.4 }, { pack: { noop: 0.08 } }),
  () => real(113, 2, { compress: 1, strings: 1 }, { unit: 'ms', n: 60, eventP: 0.4, text: 'long' }, { pack: { shorten: 0.5, minRun: 3, noop: 0.05 } }),
  () => real(114, 2, { crc: 1 }, { unit: 'ms', n: 50, metricIds: [63, 0, 31], text: 'unicode', eventP: 0.1 }),
  () => buildFile({ version: 2, compress: 1, records: [], rng: prng(115) }),
  () => buildFile({ version: 2, crc: 1, records: [], rng: prng(116) }),
  () => real(117, 2, { strings: 1 }, { unit: 'ms', n: 40, gapEvery: true, eventP: 0.3, emptyEvent: true }),
  () => real(118, 2, { compress: 1 }, { unit: 'us', n: 200, kinds: ['f32', 'f64'], metrics: 3, extremes: true }, { pack: { shorten: 0.4 } }),
  () => real(119, 2, { compress: 1, crc: 1 }, { unit: 'ms', idle: true, n: 600, jitter: 0, metricIds: [0], pack: undefined }, { pack: { noop: 0.3 } }),
  () => real(120, 2, { strings: 1, compress: 1 }, { unit: 's', n: 150, eventP: 0.9, text: 'host', vocab: 150, metrics: 2 }, { extraStrings: [...Array(125).keys()].map((i) => `reserve ${i}`) }),
  () => {
    const rng = prng(122);
    const records = [...genRecords(rng, { version: 2, n: 20, unit: 'ms', eventP: 0.6, text: 'long' })];
    records.push(G(2 ** 40 + 12345), S(1.7e12 + 2 ** 40 + 9e6, 5, 42), G(7), G(70000));
    return buildFile({ version: 2, records, rng });
  },
  // refused files
  () => base(201, 1, { crc: 1 }, { crcFlip: 'body', refuse: 'checksum mismatch', kind: 'crc' }),
  () => base(202, 2, { compress: 1, crc: 1 }, { crcFlip: 'trailer', refuse: 'checksum mismatch', kind: 'crc' }),
  () => withRaw(203, 2, {}, [[5, 0xe8]], { refuse: 'truncated varint', kind: 'truncated' }),
  () => withRaw(204, 2, { crc: 1 }, [[9, 0, 1, 1, 2, 3, 4, 5]], { refuse: 'truncated value', kind: 'truncated' }),
  () => withRaw(205, 1, { strings: 1 }, [[0xc0 | 7, 0, 0]], { refuse: 'unknown record kind 3', kind: 'kind3' }),
  () => withRaw(206, 2, { compress: 1, crc: 1 }, [[0xff]], { refuse: 'unknown record kind 3', kind: 'kind3' }),
  () => withRaw(207, 2, { strings: 1 }, [(b) => [0x41, 0, ...varint(b.table.size)]], { refuse: 'string index out of range', kind: 'index' }, { eventP: 0.6 }),
  () => withRaw(208, 1, { strings: 1, crc: 1 }, [[0x42, 0, ...varint(1000)]], { refuse: 'string index out of range', kind: 'index' }, { eventP: 0.6 }),
  () => base(209, 2, {}, { flagsByte: 0x08, refuse: 'unknown flag bits', kind: 'flags' }),
  () => base(210, 1, { crc: 1 }, { flagsByte: 0x84, refuse: 'unknown flag bits', kind: 'flags' }),
  () => base(211, 2, { strings: 1 }, { versionByte: 3, refuse: 'unsupported version 3', kind: 'version' }),
  () => base(212, 1, {}, { versionByte: 0, refuse: 'unsupported version 0', kind: 'version' }),
  () => base(213, 1, { compress: 1 }, { refuse: 'compressed body needs version 2', kind: 'v1-compress' }),
  () => base(214, 2, { compress: 1 }, { declenDelta: 3, refuse: 'decompressed length mismatch', kind: 'declen' }),
  () => base(215, 2, { compress: 1, crc: 1 }, { declenDelta: -2, refuse: 'decompressed length mismatch', kind: 'declen' }),
  () => base(216, 2, {}, { magic: 'MLOP', refuse: 'bad magic', kind: 'magic' }),
  () => withRaw(217, 1, {}, [[0x41, 0, 3, 0xff, 0x41, 0x42]], { refuse: 'invalid UTF-8', kind: 'utf8' }),
  () => buildFile({ version: 2, strings: 1, rng: prng(219), badTable: [0x61, 0xff, 0x62], records: [E(1, 1, 'abc'), S(2, 1, 5), E(3, 2, 'other')], refuse: 'invalid UTF-8', kind: 'utf8' }),
  () => withRaw(218, 2, {}, [[0, 0, 7, 0]], { refuse: 'unknown value type 7', kind: 'value-type' }),
];

const WORDS = ['warehouse', 'harbor', 'lantern', 'meadow', 'quartz', 'tundra', 'orchard', 'granite', 'compass', 'willow', 'ember', 'canyon', 'saddle', 'marble', 'thicket', 'beacon', 'pasture', 'cobalt', 'glacier', 'anvil', 'juniper', 'kestrel', 'monsoon', 'nutmeg', 'oasis', 'pebble', 'ridge', 'sparrow', 'trellis', 'umber', 'velvet', 'walnut', 'yarrow', 'zephyr', 'bramble', 'cedar', 'dune', 'fjord', 'gable', 'hollow'];

function makeSamples() {
  const rng = prng(31337);
  const order = shuffle(rng, sampleSpecs.map((_, i) => i));
  const words = shuffle(rng, WORDS);
  return order.map((specIndex, i) => ({ name: `${String(i + 1).padStart(2, '0')}-${words[i]}`, ...sampleSpecs[specIndex]() }));
}

// ---------------------------------------------------------------- the hidden files

function makeHidden() {
  const out = [];
  const add = (group, f) => out.push({ group, ...f });
  const rng = prng(9001);

  // realistic ones, with the features mixed as in the samples
  for (let i = 0; i < 36; i++) {
    const r = prng(5000 + i);
    const version = chance(r, 0.4) ? 1 : 2;
    const fl = { strings: chance(r, 0.5), compress: version === 2 && chance(r, 0.5), crc: chance(r, 0.5) };
    const size = i < 7 ? ri(r, 0, 30) : i < 24 ? ri(r, 30, 300) : i < 30 ? ri(r, 300, 800) : ri(r, 1000, 2000);
    const o = {
      n: size,
      unit: pick(r, ['s', 'ms', 'ms', 't100us', 'us', 'rel']),
      metrics: ri(r, 1, 8),
      eventP: pick(r, [0, 0.05, 0.3]),
      gapP: pick(r, [0, 0, 0.02, 0.1]),
      backP: pick(r, [0, 0, 0.05]),
      text: pick(r, ['ascii', 'unicode', 'mixed', 'bom-unicode', 'long', 'host']),
      vocab: pick(r, [10, 60, 140, 300]),
      pack: { noop: pick(r, [0, 0.03, 0.1, 0.2]), minRun: pick(r, [2, 3]), shorten: pick(r, [0.05, 0.3]) },
    };
    add('realistic', real(5000 + i, version, fl, o, { pack: o.pack }));
  }

  // PackBits
  add('packbits', real(6001, 2, { compress: 1 }, { unit: 'ms', idle: true, n: 1500, jitter: 0, metricIds: [0] }));
  add('packbits', real(6002, 2, { compress: 1, crc: 1 }, { unit: 'ms', idle: true, n: 3000, jitter: 0, metricIds: [0] }));
  add('packbits', real(6003, 2, { compress: 1 }, { unit: 'us', n: 800, kinds: ['f64', 'f32'], metrics: 4 }));
  add('packbits', real(6004, 2, { compress: 1 }, { unit: 'ms', n: 300, metrics: 3 }, { pack: { noop: 0.5 } }));
  add('packbits', real(6005, 2, { compress: 1, crc: 1 }, { unit: 'ms', n: 300, metrics: 3 }, { pack: { literalMax: 1, repMax: 2, shorten: 0 } }));
  add('packbits', real(6006, 2, { compress: 1, strings: 1 }, { unit: 's', n: 400, metrics: 3, eventP: 0.2, text: 'mixed' }, { pack: { minRun: 3, shorten: 0, noop: 0.05 } }));
  add('packbits', real(6007, 2, { compress: 1 }, { unit: 's', n: 500, idle: true, jitter: 0, metricIds: [0], eventP: 0 }, { pack: { repMax: 127, noop: 0.1 } }));
  add('packbits', buildFile({ version: 2, compress: 1, crc: 1, records: [], rng: prng(6008), pack: { noop: 1, trailingNoop: true } }));
  add('packbits', buildFile({ version: 2, compress: 1, records: [], rng: prng(6009), pack: { noop: 1 } }));
  add('packbits', buildFile({ version: 2, crc: 1, records: [], rng: prng(6010) }));
  add('packbits', buildFile({ version: 1, strings: 1, crc: 1, records: [], rng: prng(6011), extraStrings: ['unused', '', '温度'] }));
  add('packbits', (() => {
    // a body that is exactly 128 and 129 literal bytes, then exactly 128 zeros
    const rng2 = prng(6012);
    const records = [];
    for (let i = 0; i < 40; i++) records.push(S(1000 + i * 17 + ri(rng2, 0, 9), ri(rng2, 1, 63), ri(rng2, 100000, 9000000)));
    for (let i = 0; i < 31; i++) records.push(S(2000 + i, 0, 0));
    return buildFile({ version: 2, compress: 1, crc: 1, records, rng: rng2, pack: { shorten: 0 } });
  })());

  // big numbers: 7- and 8-byte varints, and the edges of what fits
  add('big', real(6101, 2, { crc: 1 }, { unit: 't100us', n: 120, kinds: ['counter'], metrics: 3 }));
  add('big', real(6102, 1, {}, { unit: 'us', n: 100, kinds: ['counter'], metrics: 3 }));
  add('big', buildFile({
    version: 2,
    rng: prng(6103),
    records: [S(2 ** 52 - 1, 5, 2 ** 52 - 1), S(2 ** 52, 6, -(2 ** 52)), S(2 ** 52 + 1000, 7, 2 ** 50 + 1), S(2 ** 52 - 5000, 8, -(2 ** 49) - 3), G(2 ** 50 + 7), E(2 ** 52 + 2 ** 50 + 9000, 3, 'late')],
  }));
  add('big', buildFile({ version: 1, rng: prng(6104), records: [S(1.7e15, 1, 2 ** 52 - 1), S(1.7e15 + 1, 1, -(2 ** 52)), S(1.7e15 + 2, 1, 2 ** 31), S(1.7e15 + 3, 1, -(2 ** 31) - 1), S(1.7e15 + 4, 1, 2 ** 32), S(1.7e15 + 5, 1, 2 ** 35 + 3)] }));
  add('big', buildFile({ version: 1, crc: 1, rng: prng(6105), records: [S(-5, 0, 0), S(-3, 1, -1), S(-1000000, 2, 1), S(4294967295, 63, 4294967295), S(4294967296 * 3, 63, -4294967296), S(2 ** 31, 62, 2 ** 31 - 1), S(2 ** 31 + 1, 62, -(2 ** 31))] }));
  add('big', buildFile({ version: 2, rng: prng(6106), records: [S(0, 0, 0), S(0, 0, 0), S(0, 0, 0), S(1, 0, 0), S(2, 0, 0), S(10, 0, 0), S(10, 0, 0), S(5, 0, 0), S(-5, 0, 0)] }));

  // metrics 0 to 63, and every value type with its edge values
  add('values', buildFile({ version: 2, crc: 1, rng: prng(6201), records: [...Array(64).keys()].map((m) => S(1700000000000 + m * 3, m, m * 1.5, 'd')) }));
  add('values', buildFile({ version: 1, rng: prng(6202), records: [...Array(64).keys()].map((m) => S(1000 + m, 63 - m, m * 1000 - 20000)) }));
  add('values', buildFile({ version: 2, rng: prng(6203), records: [E(5, 63, 'x'), E(6, 0, 'y'), E(7, 33, 'z')], strings: 1 }));
  add('values', buildFile({
    version: 2,
    rng: prng(6204),
    records: [S(10, 63, 1.401298464324817e-45, 'f'), S(20, 63, 1e-40, 'f'), S(30, 63, 1.1754943508222875e-38, 'f'), S(40, 63, 3.4028234663852886e38, 'f'), S(50, 63, -1.401298464324817e-45, 'f'), S(60, 63, 0.1, 'f'), S(70, 63, 16777217, 'f'), S(80, 63, 0, 'f'), S(90, 1, 3.14159265358979, 'f')],
  }));
  add('values', buildFile({
    version: 2,
    rng: prng(6205),
    records: [S(10, 62, 5e-324, 'd'), S(20, 62, 2.2250738585072014e-308, 'd'), S(30, 62, 1.7976931348623157e308, 'd'), S(40, 62, -5e-324, 'd'), S(50, 62, 0.1, 'd'), S(60, 62, 1 / 3, 'd'), S(70, 62, 123456789.12345679, 'd'), S(80, 62, 3, 'd'), S(90, 62, -1e21, 'd'), S(100, 62, 1e-7, 'd')],
  }));
  add('values', buildFile({ version: 2, crc: 1, rng: prng(6206), records: [...Array(30).keys()].map((i) => S(100 + i * 5, i % 4, null, 'n')) }));
  add('values', buildFile({ version: 2, rng: prng(6207), records: [S(1, 1, 7), S(2, 1, 7, 'd'), S(3, 1, 7, 'f'), S(4, 1, null, 'n'), S(5, 1, -7), S(6, 1, -7.5, 'd'), S(7, 1, -7.5, 'f'), S(8, 1, 0), S(9, 1, 0, 'd')] }));

  // gaps
  add('gaps', real(6301, 2, { compress: 1 }, { unit: 'ms', n: 120, gapEvery: true, metrics: 2 }));
  add('gaps', real(6302, 1, {}, { unit: 's', n: 80, gapEvery: true, metrics: 1 }));
  add('gaps', buildFile({ version: 2, rng: prng(6303), records: [G(5), G(0 + 1), S(100, 1, 1), G(2 ** 45), E(2 ** 45 + 300, 2, 'back'), G(3)], strings: 1 }));
  add('gaps', buildFile({ version: 1, rng: prng(6304), records: [G(1000), G(2000), G(3000)] }));
  add('gaps', buildFile({ version: 2, crc: 1, compress: 1, rng: prng(6305), records: [S(10, 1, 1), S(20, 1, 2), G(100), S(130, 1, 3), S(140, 1, 4), G(1), S(142, 1, 5), S(143, 1, 6), S(144, 1, 7)] }));

  // time
  add('time', real(6401, 2, {}, { unit: 'ms', n: 200, backP: 0.3, metrics: 2 }));
  add('time', buildFile({ version: 1, rng: prng(6402), records: [S(-100, 1, 1), S(-90, 1, 2), S(-90, 2, 3), S(-300, 1, 4), S(-299, 1, 5), S(0, 1, 6), S(1000000, 1, 7)] }));
  add('time', real(6403, 1, { crc: 1 }, { unit: 'rel', n: 300, metrics: 5 }));
  add('time', real(6404, 2, { strings: 1 }, { unit: 'ms', n: 200, eventP: 1, metrics: 1, jitter: 0 }));

  // text
  add('text', real(6501, 2, { strings: 1 }, { unit: 's', n: 400, eventP: 0.9, text: 'host', vocab: 300, metrics: 1 }));
  add('text', real(6502, 1, { strings: 1, crc: 1 }, { unit: 's', n: 300, eventP: 0.9, text: 'host', vocab: 130, metrics: 1 }, { extraStrings: ['never used', '', 'ünused'] }));
  add('text', real(6503, 1, {}, { unit: 's', n: 100, eventP: 0.8, text: 'long', metrics: 1 }));
  add('text', buildFile({
    version: 2,
    strings: 1,
    crc: 1,
    rng: prng(6504),
    extraStrings: ['x'.repeat(200), 'y'.repeat(16384), '', ''],
    records: [E(1, 1, 'z'.repeat(20000)), E(2, 2, ''), E(3, 3, 'x'.repeat(200)), E(4, 4, ''), E(5, 5, 'y'.repeat(16384)), E(6, 6, 'z'.repeat(20000)), S(7, 1, 1)],
  }));
  add('text', buildFile({ version: 1, rng: prng(6505), records: [E(1, 1, 'q'.repeat(127)), E(2, 2, 'q'.repeat(128)), E(3, 3, 'é'.repeat(64)), E(4, 4, 'é'.repeat(63)), E(5, 5, '😀'.repeat(40)), E(6, 6, '')] }));
  add('text', buildFile({
    version: 2,
    compress: 1,
    strings: 1,
    rng: prng(6506),
    records: [E(1, 1, '﻿bom first'), E(2, 2, 'inner ﻿ bom'), E(3, 3, '👨‍👩‍👧‍👦 family'), E(4, 4, 'a\u0000b'), E(5, 5, '  line sep'), E(6, 6, '\u{10ffff}'), E(7, 7, '퟿�'), E(8, 8, '"quoted" \\ back\nslash\t')],
  }));
  add('text', buildFile({ version: 1, rng: prng(6507), records: [E(1, 1, '﻿'), E(2, 2, '\u0000'), E(3, 3, 'ok')] }));

  // single kinds of record
  add('kinds', real(6601, 2, {}, { unit: 'ms', n: 100, eventP: 0.1, metrics: 1 }));
  add('kinds', buildFile({ version: 2, strings: 1, rng: prng(6602), records: [...Array(60).keys()].map((i) => E(1000 + i * 10 + (i % 3), i % 64, `event ${i % 7}`)) }));
  add('kinds', buildFile({ version: 2, rng: prng(6603), records: [...Array(60).keys()].map((i) => S(1000 + i * 10 + (i % 3), i % 64, i * i - 500)) }));

  // refused files
  const rf = (n, fn) => add('refused', fn(n));
  rf(1, () => base(7001, 1, { crc: 1 }, { crcFlip: 'trailer', refuse: 'checksum mismatch', kind: 'crc' }));
  rf(2, () => base(7002, 2, { crc: 1, strings: 1 }, { crcFlip: 'body', refuse: 'checksum mismatch', kind: 'crc' }, { n: 300 }));
  rf(3, () => base(7003, 2, { crc: 1, compress: 1 }, { crcFlip: 'body', refuse: 'checksum mismatch', kind: 'crc' }, { n: 200 }));
  rf(4, () => withRaw(7004, 2, { crc: 1 }, [[0, 0x80, 0x80, 0x80]], { refuse: 'truncated varint', kind: 'truncated' }));
  rf(8, () => withRaw(7008, 1, {}, [[0x41, 0, 10, 0x61, 0x62, 0x63]], { refuse: 'truncated text', kind: 'truncated' }));
  rf(11, () => base(7011, 2, {}, { rawFile: Buffer.from('MLOG\x02'), refuse: 'truncated file', kind: 'truncated' }));
  rf(16, () => base(7016, 2, { compress: 1 }, { rawFile: Buffer.from([0x4d, 0x4c, 0x4f, 0x47, 2, 2, 30, 19, 1, 2, 3]), refuse: 'truncated packbits', kind: 'truncated' }));
  rf(18, () => base(7018, 2, { crc: 1 }, { rawFile: Buffer.from([0x4d, 0x4c, 0x4f, 0x47, 2, 4, 1, 2]), refuse: 'truncated file', kind: 'truncated' }));
  rf(20, () => withRaw(7020, 1, {}, [[0xc3, 0, 0]], { refuse: 'unknown record kind 3', kind: 'kind3' }, { n: 300 }));
  rf(22, () => ({ ...buildFile({ version: 2, rng: prng(7022), records: [S(1, 1, 1), RAW([0xff]), S(2, 1, 2)], refuse: 'unknown record kind 3', kind: 'kind3' }) }));
  rf(23, () => buildFile({ version: 1, rng: prng(7023), records: [S(5, 1, 1), RAW([0xc1, 2, 2]), S(7, 1, 3), S(8, 1, 3)], refuse: 'unknown record kind 3', kind: 'kind3' }));
  rf(24, () => withRaw(7024, 1, { strings: 1 }, [(b) => [0x41, 0, ...varint(b.table.size + 1)]], { refuse: 'string index out of range', kind: 'index' }, { eventP: 0.6 }));
  rf(25, () => buildFile({ version: 2, strings: 1, rng: prng(7025), records: [E(1, 1, 'a'), E(2, 1, 'b'), RAW([0x41, 2, 2])], refuse: 'string index out of range', kind: 'index' }));
  rf(26, () => buildFile({ version: 2, strings: 1, crc: 1, compress: 1, rng: prng(7026), records: [S(1, 1, 1), RAW([0x41, 2, 0])], refuse: 'string index out of range', kind: 'index' }));
  rf(27, () => base(7027, 2, {}, { flagsByte: 0x10, refuse: 'unknown flag bits', kind: 'flags' }));
  rf(28, () => base(7028, 2, { crc: 1 }, { flagsByte: 0xff, refuse: 'unknown flag bits', kind: 'flags' }));
  rf(30, () => base(7030, 2, { compress: 1 }, { flagsByte: 0x0a, refuse: 'unknown flag bits', kind: 'flags' }));
  rf(31, () => base(7031, 1, {}, { versionByte: 2 + 253, refuse: 'unsupported version 255', kind: 'version' }));
  rf(32, () => base(7032, 2, { crc: 1 }, { versionByte: 3, refuse: 'unsupported version 3', kind: 'version' }));
  rf(33, () => base(7033, 2, {}, { versionByte: 0, refuse: 'unsupported version 0', kind: 'version' }));
  rf(35, () => base(7035, 1, { compress: 1, crc: 1 }, { refuse: 'compressed body needs version 2', kind: 'v1-compress' }));
  rf(37, () => base(7037, 2, { compress: 1 }, { declenDelta: 1, refuse: 'decompressed length mismatch', kind: 'declen' }, { n: 100 }));
  rf(38, () => base(7038, 2, { compress: 1, crc: 1 }, { declenDelta: -1, refuse: 'decompressed length mismatch', kind: 'declen' }, { n: 100 }));
  rf(41, () => base(7041, 2, { compress: 1 }, { rawFile: Buffer.from([0x4d, 0x4c, 0x4f, 0x47, 2, 2, 0, 0x80, 0x80, 0x00, 0x41]), refuse: 'decompressed length mismatch', kind: 'declen' }));
  rf(42, () => base(7042, 2, {}, { magic: 'mlog', refuse: 'bad magic', kind: 'magic' }));
  rf(44, () => withRaw(7044, 2, {}, [[0x40, 0, 2, 0xc0, 0x80]], { refuse: 'invalid UTF-8', kind: 'utf8' }));
  rf(46, () => withRaw(7046, 2, { compress: 1 }, [[0x40, 0, 2, 0xe2, 0x82]], { refuse: 'invalid UTF-8', kind: 'utf8' }));
  rf(49, () => buildFile({ version: 2, strings: 1, rng: prng(7049), badTable: [0x61, 0xff, 0x62], records: [E(1, 1, 'abc'), E(2, 1, 'abc'), E(3, 2, 'other')], refuse: 'invalid UTF-8', kind: 'utf8' }));
  rf(51, () => withRaw(7051, 2, {}, [[0, 0, 4, 0]], { refuse: 'unknown value type 4', kind: 'value-type' }));
  rf(52, () => withRaw(7052, 2, { compress: 1, crc: 1 }, [[0, 0, 255, 0]], { refuse: 'unknown value type 255', kind: 'value-type' }));
  void rng;
  return out;
}

// ---------------------------------------------------------------- JSON like mlog-dump's

function dump(out) {
  const row = (a) => '  ' + JSON.stringify(a).replace(/﻿/g, '\\ufeff');
  const sec = (k, a) => (a.length ? `"${k}": [\n${a.map(row).join(',\n')}\n]` : `"${k}": []`);
  return `{\n"version": ${out.version},\n${sec('samples', out.samples)},\n${sec('events', out.events)},\n${sec('gaps', out.gaps)}\n}\n`;
}

// ---------------------------------------------------------------- main

const samples = makeSamples();
const hidden = makeHidden();

// the coverage rule: every feature a hidden file uses is in at least two sample files
const count = (files) => {
  const c = new Map();
  for (const f of files) for (const k of f.feats) c.set(k, (c.get(k) ?? 0) + 1);
  return c;
};
const goodSamples = samples.filter((f) => f.refuse === undefined);
const sampleCount = count(goodSamples);
const hiddenCount = count(hidden.filter((f) => f.refuse === undefined));
const kindCount = (files) => {
  const c = new Map();
  for (const f of files) if (f.refuse !== undefined) c.set(f.kind, (c.get(f.kind) ?? 0) + 1);
  return c;
};
const sk = kindCount(samples);
const hk = kindCount(hidden);
let problems = 0;
for (const [k, n] of hiddenCount) {
  if ((sampleCount.get(k) ?? 0) < 2) {
    console.error(`feature ${k}: ${n} hidden files, ${sampleCount.get(k) ?? 0} samples`);
    problems++;
  }
}
const ONCE_IS_ENOUGH = new Set(['magic', 'v1-compress', 'value-type']);
for (const [k, n] of hk) {
  if ((sk.get(k) ?? 0) < (ONCE_IS_ENOUGH.has(k) ? 1 : 2)) {
    console.error(`refusal ${k}: ${n} hidden files, ${sk.get(k) ?? 0} samples`);
    problems++;
  }
}
const samplesDir = path.join(here, 'seed', 'samples');
fs.rmSync(samplesDir, { recursive: true, force: true });
fs.mkdirSync(samplesDir, { recursive: true });
for (const f of samples) {
  fs.writeFileSync(path.join(samplesDir, `${f.name}.mlog`), f.bytes);
  if (f.refuse === undefined) fs.writeFileSync(path.join(samplesDir, `${f.name}.json`), dump(f.expect));
  else fs.writeFileSync(path.join(samplesDir, `${f.name}.err`), `${f.refuse}\n`);
}
const records = hidden.map((f, i) => ({
  name: `${String(i + 1).padStart(3, '0')}-${f.group}${f.kind ? `-${f.kind}` : ''}`,
  mlog: f.bytes.toString('base64'),
  ...(f.refuse === undefined ? { expect: f.expect } : { refused: true }),
}));
fs.writeFileSync(path.join(here, 'hidden.json.gz'), zlib.gzipSync(Buffer.from(JSON.stringify(records)), { level: 9 }));

const sorted = (m) => [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => `${k}:${n}`).join(' ');
console.log(`samples: ${samples.length} (${goodSamples.length} good, ${samples.length - goodSamples.length} refused), hidden: ${hidden.length} (${records.filter((r) => r.refused).length} refused)`);
console.log('sample features:', sorted(sampleCount));
console.log('hidden features:', sorted(hiddenCount));
console.log('refusal kinds, samples:', sorted(sk), ' hidden:', sorted(hk));
console.log('sample flag combos:', sorted(count(goodSamples.map((f) => ({ feats: new Set([f.flags]) })))));
if (problems) {
  console.error(`${problems} coverage problems`);
  process.exit(1);
}
