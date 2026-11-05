// What the Word and Excel checks (word-check.ts, excel-check.ts) share: LibreOffice in Docker as the stand-in for Office
// (a file converted to PDF there, without the network, as the user who runs the check), the pages of two PDFs drawn side
// by side with where they differ, the parts of an Office file validated against ECMA-376's schemas (Microsoft's own
// extensions taken out first, as an Office that does not know them reads past them), and the package checked as Office
// checks it before it "repairs" a file: every part with a content type, every relationship's part there, every id a part
// uses in its relationships. Node built-ins, Docker, and xmllint.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Zip } from '../../server/documents/zip.ts';

export interface CheckOpts {
  /** Where everything is written (mounted in the container as /work). */
  out: string;
  /** The schemas, unpacked into one folder (README.md says how). */
  schemas: string;
  /** The Docker image with LibreOffice and pdftoppm. */
  image: string;
  /** Pictures' resolution, in dots per inch. */
  dpi: number;
}

/** The options every check takes: --out, --schemas, --image, --dpi. */
export function checkOpts(argv: string[], name: string): CheckOpts {
  const get = (k: string, def: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  const out = path.resolve(get('out', `/tmp/office-check-${name}`));
  fs.mkdirSync(out, { recursive: true });
  return { out, schemas: path.resolve(get('schemas', '/tmp/office-check-schemas')), image: get('image', 'hydor-office-check'), dpi: Number(get('dpi', '60')) || 60 };
}

/** A command in the image: no network, as this user (so what it writes is theirs), the output folder as /work. */
function inImage(o: CheckOpts, name: string, cmd: string[], timeout = 180_000): { ok: boolean; out: string } {
  const uid = process.getuid?.() ?? 1000;
  const gid = process.getgid?.() ?? 1000;
  const r = spawnSync('docker', ['run', '--rm', '--name', `office-check-${name}-${process.pid}`, '--network', 'none', '--user', `${uid}:${gid}`, '-e', 'HOME=/tmp', '-v', `${o.out}:/work`, o.image, ...cmd], { encoding: 'utf8', timeout });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const inside = (o: CheckOpts, file: string) => `/work/${path.relative(o.out, file).split(path.sep).join('/')}`;

/** A file converted to PDF by LibreOffice (into `dir`, under the output folder); null when it could not be. */
export function officePdf(o: CheckOpts, file: string, dir: string): string | null {
  fs.mkdirSync(dir, { recursive: true });
  const r = inImage(o, 'soffice', ['soffice', '-env:UserInstallation=file:///tmp/lo', '--headless', '--convert-to', 'pdf', '--outdir', inside(o, dir), inside(o, file)]);
  const pdf = path.join(dir, path.basename(file).replace(/\.[^.]+$/, '.pdf'));
  if (!fs.existsSync(pdf)) {
    console.log(`  LibreOffice could not convert ${path.basename(file)}: ${r.out.trim().slice(0, 300)}`);
    return null;
  }
  return pdf;
}

/** The fonts a PDF draws with (pdffonts), without their subset tags: "Inter-Regular", "LiberationSans". */
export function pdfFonts(o: CheckOpts, pdf: string): string[] {
  const r = inImage(o, 'pdffonts', ['pdffonts', inside(o, pdf)]);
  return [
    ...new Set(
      r.out
        .split('\n')
        .slice(2)
        .map((l) => l.split(/\s+/)[0]?.replace(/^[A-Z]{6}\+/, ''))
        .filter((x): x is string => !!x),
    ),
  ];
}

/** A PDF's pages as pictures (PPM files, in order). */
export function pdfPages(o: CheckOpts, pdf: string, prefix: string): string[] {
  for (const f of fs.readdirSync(path.dirname(prefix))) if (f.startsWith(`${path.basename(prefix)}-`) && f.endsWith('.ppm')) fs.rmSync(path.join(path.dirname(prefix), f));
  inImage(o, 'pdftoppm', ['pdftoppm', '-r', String(o.dpi), inside(o, pdf), inside(o, prefix)]);
  return fs
    .readdirSync(path.dirname(prefix))
    .filter((f) => f.startsWith(`${path.basename(prefix)}-`) && f.endsWith('.ppm'))
    .sort((a, b) => Number(/-(\d+)\.ppm$/.exec(a)?.[1]) - Number(/-(\d+)\.ppm$/.exec(b)?.[1]))
    .map((f) => path.join(path.dirname(prefix), f));
}

interface Img {
  w: number;
  h: number;
  /** RGB, a row after another. */
  px: Buffer;
}

function readPpm(file: string): Img {
  const b = fs.readFileSync(file);
  // "P6", width, height, 255, each after white space, then the pixels.
  let i = 0;
  const fields: string[] = [];
  while (fields.length < 4) {
    while (/\s/.test(String.fromCharCode(b[i]))) i++;
    let s = '';
    while (!/\s/.test(String.fromCharCode(b[i]))) s += String.fromCharCode(b[i++]);
    fields.push(s);
  }
  i++;
  return { w: Number(fields[1]), h: Number(fields[2]), px: b.subarray(i) };
}

/** RGB pixels as a PNG file. */
function writePng(file: string, img: Img) {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = Buffer.alloc((img.w * 3 + 1) * img.h);
  for (let y = 0; y < img.h; y++) img.px.copy(rows, y * (img.w * 3 + 1) + 1, y * img.w * 3, (y + 1) * img.w * 3);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
}

/**
 * Page by page, the app's picture beside LibreOffice's and, third, where they differ: ink in both grey, only the app's
 * blue, only LibreOffice's red. Returns each page's share of ink that is not in both (0 the same, 1 nothing in common),
 * a page only one of them has counting 1.
 */
export function sideBySide(app: string[], office: string[], prefix: string): number[] {
  const out: number[] = [];
  for (let k = 0; k < Math.max(app.length, office.length); k++) {
    const a = app[k] ? readPpm(app[k]) : null;
    const b = office[k] ? readPpm(office[k]) : null;
    const w = Math.max(a?.w ?? 0, b?.w ?? 0);
    const h = Math.max(a?.h ?? 0, b?.h ?? 0);
    const gap = 8;
    const img: Img = { w: w * 3 + gap * 2, h, px: Buffer.alloc((w * 3 + gap * 2) * h * 3, 0x60) };
    const put = (x: number, y: number, r: number, g: number, bl: number) => {
      const i = (y * img.w + x) * 3;
      img.px[i] = r;
      img.px[i + 1] = g;
      img.px[i + 2] = bl;
    };
    const at = (m: Img | null, x: number, y: number): [number, number, number] => {
      if (!m || x >= m.w || y >= m.h) return [255, 255, 255];
      const i = (y * m.w + x) * 3;
      return [m.px[i], m.px[i + 1], m.px[i + 2]];
    };
    let both = 0;
    let one = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const pa = at(a, x, y);
        const pb = at(b, x, y);
        put(x, y, ...pa);
        put(w + gap + x, y, ...pb);
        const ia = pa[0] + pa[1] + pa[2] < 600;
        const ib = pb[0] + pb[1] + pb[2] < 600;
        if (ia && ib) both++;
        else if (ia || ib) one++;
        put(2 * (w + gap) + x, y, ...((ia && ib ? [90, 90, 90] : ia ? [40, 110, 255] : ib ? [230, 40, 40] : [255, 255, 255]) as [number, number, number]));
      }
    writePng(`${prefix}-${k + 1}.png`, img);
    out.push(!a || !b ? 1 : both + one ? Math.round((one / (both + one)) * 1000) / 1000 : 0);
  }
  return out;
}

// ---- the schemas -------------------------------------------------------------------------------------------------

const SCHEMA_OF: Record<string, string> = {
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main': 'wml.xsd',
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main': 'sml.xsd',
  'http://schemas.openxmlformats.org/drawingml/2006/main': 'dml-main.xsd',
  'http://schemas.openxmlformats.org/drawingml/2006/chart': 'dml-chart.xsd',
  'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing': 'dml-spreadsheetDrawing.xsd',
  'http://schemas.openxmlformats.org/package/2006/content-types': 'opc-contentTypes.xsd',
  'http://schemas.openxmlformats.org/package/2006/relationships': 'opc-relationships.xsd',
  'http://schemas.openxmlformats.org/package/2006/metadata/core-properties': 'opc-coreProperties.xsd',
  'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties': 'shared-documentPropertiesExtended.xsd',
  'urn:schemas-microsoft-com:vml': 'vml-main.xsd',
};

/** Where the schemas come from: ECMA-376's Transitional ones (Part 4) and the packages' (Part 2), and the W3C's and Dublin Core's they import. */
const ECMA = 'https://ecma-international.org/wp-content/uploads';
const SOURCES = {
  zips: [`${ECMA}/ECMA-376-4_5th_edition_december_2016.zip`, `${ECMA}/ECMA-376-2_5th_edition_december_2021.zip`],
  files: ['https://www.w3.org/2001/xml.xsd', ...['dc', 'dcterms', 'dcmitype'].map((n) => `https://www.dublincore.org/schemas/xmls/qdc/2003/04/02/${n}.xsd`)],
};

/** The schemas in `o.schemas`, fetched and unpacked there the first time (each .xsd of the zips inside the standard's zips). */
export async function fetchSchemas(o: CheckOpts) {
  if (fs.existsSync(path.join(o.schemas, 'wml.xsd'))) return;
  fs.mkdirSync(o.schemas, { recursive: true });
  const get = async (url: string) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(300_000) });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  };
  console.log(`Fetching the schemas into ${o.schemas}`);
  const unpack = (zip: Zip) => {
    for (const n of zip.names()) {
      if (n.endsWith('.zip') && /XMLSchema/i.test(n)) unpack(new Zip(zip.read(n, 64 * 1024 * 1024)!));
      else if (n.endsWith('.xsd')) fs.writeFileSync(path.join(o.schemas, path.basename(n)), zip.read(n)!);
    }
  };
  for (const url of SOURCES.zips) unpack(new Zip(await get(url)));
  for (const url of SOURCES.files) fs.writeFileSync(path.join(o.schemas, path.basename(url)), await get(url));
}

/** The schemas copied to where xmllint finds all they import without the network. */
function schemaDir(o: CheckOpts): string {
  const dir = path.join(o.out, 'schemas');
  if (fs.existsSync(path.join(dir, 'wml.xsd'))) return dir;
  if (!fs.existsSync(path.join(o.schemas, 'wml.xsd'))) throw new Error(`--schemas ${o.schemas}: no wml.xsd there (fetchSchemas puts them there)`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(o.schemas).filter((x) => x.endsWith('.xsd'))) {
    const s = fs
      .readFileSync(path.join(o.schemas, f), 'utf8')
      .replace(/<(xsd?):import\s+(?:id="xml"\s+)?namespace="http:\/\/www\.w3\.org\/XML\/1998\/namespace"\s*(?:schemaLocation="[^"]*")?\s*\/>/g, '<$1:import namespace="http://www.w3.org/XML/1998/namespace" schemaLocation="xml.xsd"/>')
      .replace(/schemaLocation="http:\/\/(?:www\.)?dublincore\.org\/schemas\/xmls\/qdc\/2003\/04\/02\/([a-z]+\.xsd)"/g, 'schemaLocation="$1"')
      .replace(/schemaLocation="http:\/\/www\.w3\.org\/2001\/03\/xml\.xsd"|schemaLocation="http:\/\/www\.w3\.org\/2001\/xml\.xsd"/g, 'schemaLocation="xml.xsd"');
    fs.writeFileSync(path.join(dir, f), s);
  }
  return dir;
}

interface Tag {
  /** The text of the tag, or of the words between tags. */
  raw: string;
  kind: 'open' | 'close' | 'empty' | 'text' | 'other';
  name?: string;
}

function tokens(xml: string): Tag[] {
  const out: Tag[] = [];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g;
  for (const m of xml.matchAll(re)) {
    const raw = m[0];
    if (raw.startsWith('<!--') || raw.startsWith('<?') || raw.startsWith('<![')) out.push({ raw, kind: 'other' });
    else if (raw.startsWith('</')) out.push({ raw, kind: 'close', name: raw.slice(2, -1).trim() });
    else if (raw.startsWith('<')) out.push({ raw, kind: raw.endsWith('/>') ? 'empty' : 'open', name: /^<([^\s/>]+)/.exec(raw)![1] });
    else out.push({ raw, kind: 'text' });
  }
  return out;
}

/**
 * A part as an Office that knows only the standard reads it (Markup Compatibility, ECMA-376 Part 3): the elements and
 * attributes of the namespaces it says may be ignored taken out, mc:AlternateContent as its Fallback. Returns the part
 * and the elements taken out (by name), to be checked apart.
 */
export function standardOnly(xml: string): { xml: string; ignored: string[] } {
  const rootTag = /<([A-Za-z_][\w.-]*:)?[A-Za-z_][\w.-]*\s[^>]*>/.exec(xml.replace(/<\?[\s\S]*?\?>/, ''))?.[0] ?? '';
  const prefixes = new Map<string, string>();
  for (const m of rootTag.matchAll(/xmlns:([\w.-]+)="([^"]*)"/g)) prefixes.set(m[1], m[2]);
  const mc = [...prefixes].find(([, ns]) => ns === 'http://schemas.openxmlformats.org/markup-compatibility/2006')?.[0];
  const ignorable = new Set(mc ? (new RegExp(`${mc}:Ignorable="([^"]*)"`).exec(rootTag)?.[1] ?? '').split(/\s+/).filter(Boolean) : []);
  const ignored: string[] = [];
  const out: string[] = [];
  const pre = (name: string) => (name.includes(':') ? name.slice(0, name.indexOf(':')) : '');
  let skip = 0;
  // Inside mc:AlternateContent: only its Fallback is kept.
  let alt = 0;
  let inFallback = false;
  for (const t of tokens(xml)) {
    if (skip) {
      if (t.kind === 'open') skip++;
      else if (t.kind === 'close') skip--;
      continue;
    }
    if (t.kind === 'open' || t.kind === 'empty') {
      const p = pre(t.name!);
      if (mc && p === mc) {
        const local = t.name!.slice(mc.length + 1);
        if (local === 'AlternateContent') {
          if (t.kind === 'open') alt++;
          continue;
        }
        if (local === 'Fallback') {
          if (t.kind === 'open') inFallback = true;
          continue;
        }
        if (local === 'Choice') {
          if (t.kind === 'open') skip = 1;
          continue;
        }
      }
      if (ignorable.has(p)) {
        ignored.push(t.name!);
        if (t.kind === 'open') skip = 1;
        continue;
      }
      // Its attributes of ignorable namespaces, and mc's, out.
      let raw = t.raw.replace(/\s([\w.-]+):([\w.-]+)="[^"]*"/g, (m, ap: string, an: string) => {
        if (ap === 'xmlns') return m;
        if (ignorable.has(ap) || ap === mc) {
          ignored.push(`@${ap}:${an}`);
          return '';
        }
        return m;
      });
      raw = raw.replace(/\s+(\/?>)$/, '$1');
      out.push(raw);
      continue;
    }
    if (t.kind === 'close' && mc && t.name === `${mc}:AlternateContent`) {
      alt = Math.max(0, alt - 1);
      continue;
    }
    if (t.kind === 'close' && mc && t.name === `${mc}:Fallback`) {
      inFallback = false;
      continue;
    }
    out.push(t.raw);
  }
  void inFallback;
  return { xml: out.join(''), ignored };
}

/** The XML parts of an Office file and, for each, what the schemas say is wrong (empty when nothing is); extensions as they were found. */
export function validateParts(o: CheckOpts, file: Buffer, label: string): { part: string; errors: string[]; ignored: string[] }[] {
  const dir = schemaDir(o);
  const zip = new Zip(file);
  const tmp = path.join(o.out, 'validate', label);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const out: { part: string; errors: string[]; ignored: string[] }[] = [];
  for (const name of zip.names()) {
    if (!/\.(xml|rels|vml)$/i.test(name)) continue;
    const xml = zip.text(name) ?? '';
    const { xml: std, ignored } = standardOnly(xml);
    const root = /<([\w.-]+:)?([\w.-]+)[\s>]/.exec(std.replace(/<\?[\s\S]*?\?>/, '').replace(/<!--[\s\S]*?-->/g, ''));
    const ns = root ? (new RegExp(`xmlns${root[1] ? `:${root[1].slice(0, -1)}` : ''}="([^"]*)"`).exec(std)?.[1] ?? '') : '';
    const xsd = SCHEMA_OF[ns];
    if (!xsd) {
      out.push({ part: name, errors: [`no schema for its root (${root?.[2] ?? '?'} in ${ns || 'no namespace'}): checked by hand`], ignored });
      continue;
    }
    const f = path.join(tmp, name.replace(/[^\w.-]+/g, '_'));
    fs.writeFileSync(f, std);
    const r = spawnSync(process.env.XMLLINT ?? 'xmllint', ['--noout', '--nonet', '--schema', path.join(dir, xsd), f], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const errors = (r.stderr ?? '')
      .split('\n')
      .filter((l) => l.trim() && !/ validates$/.test(l))
      .map((l) => l.replace(`${f}:`, 'line ').replace(/\{[^}]*\}/g, ''));
    out.push({ part: name, errors: r.status === 0 ? [] : errors.length ? errors : [`xmllint failed (${r.status})`], ignored });
  }
  return out;
}

// Microsoft's extensions the exports write, checked by hand against [MS-DOCX] and [MS-XLSX] (no schema of the standard has
// them): each element's attributes and values as Office writes them.
const LIGATURES =
  /^(none|standard|contextual|historical|discretional|standardContextual|standardHistorical|contextualHistorical|standardDiscretional|contextualDiscretional|historicalDiscretional|standardContextualHistorical|standardContextualDiscretional|standardHistoricalDiscretional|contextualHistoricalDiscretional|all)$/;
const LONG_HEX = (v: string) => /^[0-9A-F]{8}$/.test(v) && parseInt(v, 16) < 0x80000000;

/** What Microsoft's extensions in a part get wrong: their attributes, values and where they are. */
export function extensionProblems(part: string, xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/w14:(paraId|textId)="([^"]*)"/g)) if (!LONG_HEX(m[2])) out.push(`${part}: w14:${m[1]}="${m[2]}" is not 8 hex digits below 80000000`);
  for (const m of xml.matchAll(/<w14:ligatures w14:val="([^"]*)"\/>/g)) if (!LIGATURES.test(m[1])) out.push(`${part}: w14:ligatures "${m[1]}"`);
  for (const m of xml.matchAll(/<w14:ligatures[^>]*>/g)) {
    const before = xml.slice(0, m.index);
    if (before.lastIndexOf('<w:rPr>') < before.lastIndexOf('</w:rPr>')) out.push(`${part}: w14:ligatures outside run properties`);
  }
  for (const m of xml.matchAll(/<w14:checkbox>([\s\S]*?)<\/w14:checkbox>/g)) {
    const kids = [...m[1].matchAll(/<w14:(\w+)/g)].map((k) => k[1]).join(',');
    if (!/^(checked,)?(checkedState,)?(uncheckedState)?$/.test(kids)) out.push(`${part}: w14:checkbox holds ${kids}`);
    for (const s of m[1].matchAll(/<w14:(checked|unchecked)State ([^>]*)\/>/g)) if (!/w14:val="[0-9A-F]{4}"/.test(s[2]) || !/w14:font="[^"]+"/.test(s[2])) out.push(`${part}: w14:${s[1]}State ${s[2]}`);
    if (!/<w14:checked w14:val="[01]"\/>/.test(m[1])) out.push(`${part}: w14:checked is not 0 or 1`);
  }
  for (const m of xml.matchAll(/<w15:commentEx ([^>]*)\/>/g)) {
    const a = m[1];
    if (!/^w15:paraId="[0-9A-F]{8}"( w15:paraIdParent="[0-9A-F]{8}")?( w15:done="[01]")?$/.test(a)) out.push(`${part}: w15:commentEx ${a}`);
  }
  return out;
}

/**
 * The package as Office checks it: every part has a content type, each relationship's part is there and its id is
 * once, and every relationship id a part names is in its relationships. Returns what is wrong.
 */
export function packageProblems(file: Buffer): string[] {
  const zip = new Zip(file);
  const names = new Set(zip.names());
  const problems: string[] = [];
  const types = zip.text('[Content_Types].xml') ?? '';
  const defaults = new Set([...types.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1].toLowerCase()));
  const overrides = new Set([...types.matchAll(/<Override PartName="([^"]+)"/g)].map((m) => m[1].replace(/^\//, '')));
  for (const n of names) {
    if (n === '[Content_Types].xml' || n.endsWith('/')) continue;
    const ext = n.slice(n.lastIndexOf('.') + 1).toLowerCase();
    if (!overrides.has(n) && !defaults.has(ext)) problems.push(`${n} has no content type`);
  }
  for (const o of overrides) if (!names.has(o)) problems.push(`[Content_Types].xml names ${o}, which is not there`);
  for (const n of names) if (/\.(xml|rels)$/.test(n)) problems.push(...extensionProblems(n, zip.text(n) ?? ''));
  // A comment thread's entries name the comments' last paragraphs.
  const ex = zip.text('word/commentsExtended.xml');
  if (ex) {
    const paras = new Set([...(zip.text('word/comments.xml') ?? '').matchAll(/w14:paraId="([0-9A-F]{8})"/g)].map((m) => m[1]));
    for (const m of ex.matchAll(/w15:paraId(?:Parent)?="([0-9A-F]{8})"/g)) if (!paras.has(m[1])) problems.push(`word/commentsExtended.xml names paragraph ${m[1]}, which no comment has`);
  }
  for (const r of [...names].filter((n) => n.endsWith('.rels'))) {
    const xml = zip.text(r) ?? '';
    const owner = r.replace(/_rels\/([^/]+)\.rels$/, '$1').replace(/^_rels\/\.rels$/, '');
    const base = owner.includes('/') ? owner.slice(0, owner.lastIndexOf('/') + 1) : '';
    const ids = new Set<string>();
    for (const m of xml.matchAll(/<Relationship\s([^>]*)\/>/g)) {
      const id = /\bId="([^"]+)"/.exec(m[1])?.[1] ?? '';
      const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1] ?? '';
      if (ids.has(id)) problems.push(`${r}: ${id} twice`);
      ids.add(id);
      if (/TargetMode="External"/.test(m[1])) continue;
      const to = path.posix.normalize(target.startsWith('/') ? target.slice(1) : base + target);
      if (!names.has(to)) problems.push(`${r}: ${id} leads to ${to}, which is not there`);
    }
    if (owner && names.has(owner)) {
      const text = zip.text(owner) ?? '';
      for (const m of text.matchAll(/\br:(?:id|embed|link|pict|href)="([^"]*)"/g)) if (!ids.has(m[1])) problems.push(`${owner}: names ${m[1]}, not in its relationships`);
    }
  }
  return problems;
}

/** A program's output (for tools the check needs on this computer), or null when it is not there. */
export function have(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

/** The page of pictures to look through: each file's pages, the app's beside LibreOffice's and where they differ. */
export function reportHtml(file: string, title: string, rows: { name: string; note: string; pictures: string[] }[]) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const body = rows.map((r) => `<h2>${esc(r.name)}</h2><p>${esc(r.note)}</p>${r.pictures.map((p) => `<p><img src="${esc(path.relative(path.dirname(file), p))}" style="max-width:100%"></p>`).join('')}`).join('\n');
  fs.writeFileSync(
    file,
    `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px system-ui;margin:24px;background:#eee}img{border:1px solid #999}</style><h1>${esc(title)}</h1><p>Each row: the app's PDF, LibreOffice's, and where they differ (grey in both, blue only the app's, red only LibreOffice's).</p>${body}`,
  );
}
