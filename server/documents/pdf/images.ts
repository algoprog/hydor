// Pictures as PDF image objects: a PNG decoded here (every colour type and bit depth, palettes, interlacing, and its
// transparency, from an alpha channel or a tRNS chunk, kept as a soft mask so a signature's paper stays see-through),
// or a JPEG passed through as it is (DCT), its size and colour space read from its header.
import zlib from 'node:zlib';
import { unfilterRow } from './filters.ts';
import { dict, type Obj, Ref, Stream } from './objects.ts';

export interface Picture {
  width: number;
  height: number;
  /** The image object to draw, with its soft mask beside it when it has transparency. */
  write(add: (o: Obj) => Ref): Ref;
}

/** A PNG or JPEG as a picture for a PDF; throws for anything else. */
export function picture(data: Buffer): Picture {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return png(data);
  if (data[0] === 0xff && data[1] === 0xd8) return jpeg(data);
  throw new Error('The picture must be a PNG or a JPEG.');
}

function jpeg(data: Buffer): Picture {
  let p = 2;
  let width = 0;
  let height = 0;
  let comps = 3;
  let adobe = false;
  while (p + 4 <= data.length) {
    if (data[p] !== 0xff) {
      p++;
      continue;
    }
    const marker = data[p + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      p += 2;
      continue;
    }
    const len = data.readUInt16BE(p + 2);
    if (marker === 0xee && data.toString('latin1', p + 4, p + 9) === 'Adobe') adobe = true;
    // Start of frame: baseline, extended, progressive and the others that hold the size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      height = data.readUInt16BE(p + 5);
      width = data.readUInt16BE(p + 7);
      comps = data[p + 9];
      break;
    }
    p += 2 + len;
  }
  if (!width || !height) throw new Error('The JPEG picture could not be read.');
  return {
    width,
    height,
    write: (add) =>
      add(
        new Stream(
          dict({
            Type: 'XObject',
            Subtype: 'Image',
            Width: width,
            Height: height,
            ColorSpace: comps === 1 ? 'DeviceGray' : comps === 4 ? 'DeviceCMYK' : 'DeviceRGB',
            BitsPerComponent: 8,
            Filter: 'DCTDecode',
            // Adobe's CMYK JPEGs store their colours inverted.
            Decode: comps === 4 && adobe ? [1, 0, 1, 0, 1, 0, 1, 0] : undefined,
          }),
          data,
        ),
      ),
  };
}

/** A decoded PNG: its colour (RGB or grey, 8 bits) and its alpha when any pixel is not opaque. */
export function decodePng(data: Buffer): { width: number; height: number; gray: boolean; color: Buffer; alpha: Buffer | null } {
  let p = 8;
  let width = 0;
  let height = 0;
  let depth = 8;
  let type = 6;
  let interlace = 0;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (p + 8 <= data.length) {
    const len = data.readUInt32BE(p);
    const kind = data.toString('latin1', p + 4, p + 8);
    const body = data.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      interlace = body[12];
    } else if (kind === 'PLTE') palette = body;
    else if (kind === 'tRNS') trns = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (!width || !height || width * height > 40_000_000) throw new Error('The PNG picture could not be read, or is too large.');
  const channels = type === 0 ? 1 : type === 2 ? 3 : type === 3 ? 1 : type === 4 ? 2 : 4;
  const bpp = Math.max(1, Math.ceil((channels * depth) / 8));
  const raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: 512 * 1024 * 1024 });
  const gray = type === 0 || type === 4;
  const color = Buffer.alloc(width * height * (gray ? 1 : 3));
  const alpha = Buffer.alloc(width * height, 255);
  let anyAlpha = false;
  const sample = (row: Buffer, x: number, c: number): number => {
    if (depth === 8) return row[x * channels + c];
    if (depth === 16) return row[(x * channels + c) * 2];
    // 1, 2 or 4 bits: one channel (grey or a palette index).
    const per = 8 / depth;
    const byte = row[Math.floor(x / per)];
    const shift = 8 - depth * ((x % per) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const scale = (v: number) => (depth >= 8 ? v : Math.round((v * 255) / ((1 << depth) - 1)));
  const put = (x: number, y: number, row: Buffer) => {
    const i = y * width + x;
    if (type === 3) {
      const k = sample(row, x, 0);
      if (palette) {
        color[i * 3] = palette[k * 3] ?? 0;
        color[i * 3 + 1] = palette[k * 3 + 1] ?? 0;
        color[i * 3 + 2] = palette[k * 3 + 2] ?? 0;
      }
      if (trns && k < trns.length) {
        alpha[i] = trns[k];
        if (trns[k] < 255) anyAlpha = true;
      }
      return;
    }
    if (gray) {
      const v = sample(row, x, 0);
      color[i] = scale(v);
      if (type === 4) alpha[i] = sample(row, x, 1);
      else if (trns && trns.length >= 2 && v === (depth === 16 ? trns[0] : trns.readUInt16BE(0))) alpha[i] = 0;
    } else {
      const r = sample(row, x, 0);
      const g = sample(row, x, 1);
      const b = sample(row, x, 2);
      color[i * 3] = r;
      color[i * 3 + 1] = g;
      color[i * 3 + 2] = b;
      if (type === 6) alpha[i] = sample(row, x, 3);
      else if (trns && trns.length >= 6) {
        const tr = depth === 16 ? [trns[0], trns[2], trns[4]] : [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)];
        if (r === tr[0] && g === tr[1] && b === tr[2]) alpha[i] = 0;
      }
    }
    if (alpha[i] < 255) anyAlpha = true;
  };
  // Adam7's passes when interlaced, else one pass of every pixel.
  const passes = interlace
    ? [
        [0, 0, 8, 8],
        [4, 0, 8, 8],
        [0, 4, 4, 8],
        [2, 0, 4, 4],
        [0, 2, 2, 4],
        [1, 0, 2, 2],
        [0, 1, 1, 2],
      ]
    : [[0, 0, 1, 1]];
  let off = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((width - x0) / dx);
    const ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const rowLen = Math.ceil((pw * channels * depth) / 8);
    let prev = Buffer.alloc(rowLen);
    for (let r = 0; r < ph; r++) {
      if (off + 1 + rowLen > raw.length) break;
      const ft = raw[off];
      const row = Buffer.from(raw.subarray(off + 1, off + 1 + rowLen));
      unfilterRow(ft, row, prev, bpp);
      off += 1 + rowLen;
      for (let c = 0; c < pw; c++) put(x0 + c * dx, y0 + r * dy, row);
      prev = row;
    }
  }
  return { width, height, gray, color, alpha: anyAlpha ? alpha : null };
}

function png(data: Buffer): Picture {
  const img = decodePng(data);
  return {
    width: img.width,
    height: img.height,
    write: (add) => {
      const smask = img.alpha ? add(new Stream(dict({ Type: 'XObject', Subtype: 'Image', Width: img.width, Height: img.height, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'FlateDecode' }), zlib.deflateSync(img.alpha))) : undefined;
      return add(
        new Stream(
          dict({
            Type: 'XObject',
            Subtype: 'Image',
            Width: img.width,
            Height: img.height,
            ColorSpace: img.gray ? 'DeviceGray' : 'DeviceRGB',
            BitsPerComponent: 8,
            Filter: 'FlateDecode',
            SMask: smask,
          }),
          zlib.deflateSync(img.color),
        ),
      );
    },
  };
}
