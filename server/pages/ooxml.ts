// What Word and PowerPoint files are made of, for the exports (docx.ts, pptx.ts): a zip of XML parts, made in
// memory (each part deflated, its sizes known up front, names in UTF-8), and the small XML helpers they share.
// Node built-ins only.
import zlib from 'node:zlib';

export interface ZipPart {
  name: string;
  data: Buffer | string;
}

/** DOS date and time of `d`, as zip headers keep them. */
function dosTime(d: Date): { date: number; time: number } {
  return {
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  };
}

/** The parts as one .zip, in their order ([Content_Types].xml first, as Office writes it). */
export function zipParts(parts: ZipPart[], when = new Date()): Buffer {
  const { date, time } = dosTime(when);
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const p of parts) {
    const name = Buffer.from(p.name, 'utf8');
    const raw = typeof p.data === 'string' ? Buffer.from(p.data, 'utf8') : p.data;
    const crc = zlib.crc32(raw) >>> 0;
    // Pictures are packed already: stored, they open faster and lose nothing.
    const packed = /\.(png|jpe?g|gif|webp)$/i.test(p.name) ? null : zlib.deflateRawSync(raw, { level: 6 });
    const data = packed && packed.length < raw.length ? packed : raw;
    const method = data === raw ? 0 : 8;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x800, 6);
    head.writeUInt16LE(method, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    local.push(head, name, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += head.length + name.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cdBuf, end]);
}

/** Text for XML: escaped, and without the characters XML 1.0 cannot hold. */
export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
    .replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** The relationships of a part: [id, type (the last part of its schema address, or a whole one), target, external]. */
export function relsXml(rels: [string, string, string, boolean?][]): string {
  const base = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels
    .map(([id, type, target, ext]) => `<Relationship Id="${id}" Type="${type.includes('://') ? type : base + type}" Target="${esc(target)}"${ext ? ' TargetMode="External"' : ''}/>`)
    .join('')}</Relationships>`;
}

/** docProps/core.xml: the title and who made it. */
export function coreXml(title: string, when = new Date()): string {
  const t = when.toISOString().replace(/\.\d+Z$/, 'Z');
  return `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>Hydor</dc:creator><cp:lastModifiedBy>Hydor</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${t}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${t}</dcterms:modified></cp:coreProperties>`;
}

/** A picture's size in pixels, read from its first bytes (PNG, JPEG, GIF, WebP); null when it is none of those. */
export function imageSize(b: Buffer): { w: number; h: number; type: 'png' | 'jpeg' | 'gif' | 'webp' } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: 'png' };
  if (b.length > 10 && b.toString('latin1', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8), type: 'gif' };
  if (b.length > 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const kind = b.toString('latin1', 12, 16);
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, type: 'webp' };
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1, type: 'webp' };
    }
    if (kind === 'VP8X') return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1, type: 'webp' };
    return null;
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      // Start of frame (baseline, progressive…), not the huffman (c4), arithmetic (cc) or JPEG-LS (c8) markers.
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), type: 'jpeg' };
      i += 2 + len;
    }
  }
  return null;
}
