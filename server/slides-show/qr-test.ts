// Script tests for the QR code encoder (shared/qr.ts): codes compared module by module with ones an independent
// encoder made (segno 1.6, its padding set to the standard's: it adds a whole zero byte when the bits already end on
// one) at each level and mode, with a mask forced, in versions from 1 to 40 (the alignment patterns' odd version 32
// among them), codes a reader (OpenCV's) read back when this was written; the format and version bits read back from
// the code; the size it picks, when it raises the level, what it refuses; and the SVG picture holding nothing but the
// code.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/slides-show/qr-test.ts
//   DATA_DIR=/tmp/hydor-test-qr node dist/dev/qr-test.js
import { createHash } from 'node:crypto';
import { qrCode, qrPath, qrSvg, type QrCode, type QrLevel } from '../../shared/qr.ts';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const rows = (c: QrCode) => c.modules.map((row) => row.map((d) => (d ? '1' : '0')).join(''));
const hash = (c: QrCode) => createHash('sha256').update(rows(c).join('\n')).digest('hex').slice(0, 24);

// ---- the standard's own example: 01234567 at version 1, level M, mask 2 ----
{
  const c = qrCode('01234567', { level: 'M', mask: 2, boost: false });
  const want = [
    '#######..#.##.#######',
    '#.....#..####.#.....#',
    '#.###.#.#.....#.###.#',
    '#.###.#.##....#.###.#',
    '#.###.#.#.###.#.###.#',
    '#.....#.#...#.#.....#',
    '#######.#.#.#.#######',
    '........#..##........',
    '#.#####..#..#.#####..',
    '...#.#.##.#.#..#.##..',
    '..#...##.#.#.#..#####',
    '....#....#.....####..',
    '...######..#.#..#....',
    '........#.#####..##..',
    '#######..##.#.##.....',
    '#.....#.#.#####...#.#',
    '#.###.#.#...#..#.##..',
    '#.###.#.##..#..#.....',
    '#.###.#.#.##.#..#.#..',
    '#.....#........##.##.',
    '#######.####.#..#.#..',
  ];
  ok(c.version === 1 && c.size === 21 && c.mode === 'numeric' && c.level === 'M' && c.mask === 2, `01234567: version 1, numeric, M, mask 2 (${c.version}, ${c.mode}, ${c.level}, ${c.mask})`);
  const got = c.modules.map((row) => row.map((d) => (d ? '#' : '.')).join(''));
  ok(got.join('\n') === want.join('\n'), 'the 01234567 code is the one the reference made, module by module');
}

// ---- known codes, by their modules' hash (row by row, 1 dark, 0 light) ----
const X300 = 'x'.repeat(300);
const DIGITS = '1234567890'.repeat(40);
const CAPS = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG 0123456789 $%*+-./:'.repeat(20);
const KNOWN: [string, QrLevel, number | undefined, number, number, QrLevel, QrCode['mode'], string][] = [
  // text, level asked, smallest version, mask → version, level, mode, hash
  ['HELLO WORLD', 'Q', 1, 6, 1, 'Q', 'alphanumeric', '453d0cc77a27d60d29801fcf'],
  ['https://hydor.app/remote/abc123', 'M', undefined, 0, 3, 'M', 'byte', '8cec3572688a86b0be0fd06e'],
  ['https://hydor.app/remote/abc123', 'M', undefined, 3, 3, 'M', 'byte', '821effb80bf4aa799f10dfdc'],
  ['https://hydor.app/remote/abc123', 'M', undefined, 7, 3, 'M', 'byte', '22c372f1a465cf98450ce9af'],
  ['https://hydor.app/remote/abc123', 'L', undefined, 5, 2, 'L', 'byte', '82d1a48e9920c2fa5f8b208e'],
  ['Καλημέρα, 你好! café', 'L', undefined, 1, 2, 'L', 'byte', '038d269e7e103141f35afd2d'],
  ['Καλημέρα, 你好! café', 'H', undefined, 4, 4, 'H', 'byte', 'f7fb572cb37a2d26a974f3e9'],
  [X300, 'H', undefined, 2, 18, 'H', 'byte', 'b147f601ac9a821a2b8e5f10'],
  [DIGITS, 'M', undefined, 6, 9, 'M', 'numeric', '7bbbb0f598288daec9ff8d39'],
  [CAPS, 'Q', undefined, 1, 28, 'Q', 'alphanumeric', '2e07cd4bb7f7df233b2f5a18'],
  ['a'.repeat(1000), 'L', undefined, 3, 22, 'L', 'byte', 'a6df7559787809c8b2c0d383'],
  ['b'.repeat(1270), 'H', undefined, 0, 40, 'H', 'byte', '63889a3a50fa06579629b92c'],
  ['short', 'M', 7, 2, 7, 'M', 'byte', '1a953972e8fdc39247eb4105'],
  ['', 'M', undefined, 4, 1, 'M', 'byte', '1cf832fe3e42ad2da1fed2a8'],
  ['v32 ' + 'q'.repeat(1300), 'M', 32, 5, 32, 'M', 'byte', '4c27aebd9fcc9f9c26370f0a'],
];
for (const [text, level, minVersion, mask, version, gotLevel, mode, sha] of KNOWN) {
  const c = qrCode(text, { level, minVersion, mask, boost: false });
  const what = `${JSON.stringify(text.slice(0, 24))} at ${level}, mask ${mask}`;
  ok(c.version === version && c.level === gotLevel && c.mode === mode && c.mask === mask, `${what}: version ${version}, ${gotLevel}, ${mode} (${c.version}, ${c.level}, ${c.mode}, ${c.mask})`);
  ok(c.size === version * 4 + 17 && c.modules.length === c.size && c.modules.every((r) => r.length === c.size), `${what}: ${version * 4 + 17} modules a side`);
  ok(hash(c) === sha, `${what}: the same code as the reference's (${hash(c)})`);
}

// ---- the format and version bits read back ----
const BITS: Record<QrLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };
const formatCode = (level: QrLevel, mask: number) => {
  const d = (BITS[level] << 3) | mask;
  let r = d;
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  return ((d << 10) | r) ^ 0x5412;
};
const at = (c: QrCode, x: number, y: number) => (c.modules[y][x] ? 1 : 0);
const readFormat = (c: QrCode) => {
  let a = 0;
  let b = 0;
  // Around the top left finder, bit 0 first; and split under the top right and beside the bottom left.
  const first = [
    [8, 0],
    [8, 1],
    [8, 2],
    [8, 3],
    [8, 4],
    [8, 5],
    [8, 7],
    [8, 8],
    [7, 8],
    [5, 8],
    [4, 8],
    [3, 8],
    [2, 8],
    [1, 8],
    [0, 8],
  ];
  first.forEach(([x, y], i) => (a |= at(c, x, y) << i));
  for (let i = 0; i < 8; i++) b |= at(c, c.size - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) b |= at(c, 8, c.size - 15 + i) << i;
  return [a, b];
};
for (const level of ['L', 'M', 'Q', 'H'] as QrLevel[])
  for (let mask = 0; mask < 8; mask++) {
    const c = qrCode('https://hydor.app/remote/abc123', { level, mask, boost: false });
    const [a, b] = readFormat(c);
    ok(a === formatCode(level, mask) && b === a, `${level}, mask ${mask}: both copies of the format bits say so`);
    ok(at(c, 8, c.size - 8) === 1, `${level}, mask ${mask}: the dark module beside the bottom left finder`);
  }
for (const v of [7, 12, 21, 32, 40]) {
  const c = qrCode('v', { minVersion: v });
  let a = 0;
  let b = 0;
  for (let i = 0; i < 18; i++) {
    a |= at(c, c.size - 11 + (i % 3), Math.floor(i / 3)) << i;
    b |= at(c, Math.floor(i / 3), c.size - 11 + (i % 3)) << i;
  }
  let r = a >>> 12;
  for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
  ok(a >>> 12 === v && ((v << 12) | r) === a && b === a, `version ${v}: both copies of the version bits say ${v} (${a >>> 12})`);
}
ok(rows(qrCode('v', { minVersion: 6 })).length === 41, 'version 6 has no version bits to place, and is 41 modules a side');

// ---- sizes, levels and what fits ----
const fitsAt = (text: string, level: QrLevel) => {
  try {
    return qrCode(text, { level, boost: false }).version;
  } catch {
    return 0;
  }
};
// The standard's capacities: bytes at versions 1 and 40, digits and capitals at version 1, level L.
for (const [level, v1, v40] of [
  ['L', 17, 2953],
  ['M', 14, 2331],
  ['Q', 11, 1663],
  ['H', 7, 1273],
] as [QrLevel, number, number][]) {
  ok(fitsAt('a'.repeat(v1), level) === 1 && fitsAt('a'.repeat(v1 + 1), level) === 2, `${level}: ${v1} bytes fit version 1, one more needs version 2`);
  ok(fitsAt('a'.repeat(v40), level) === 40 && fitsAt('a'.repeat(v40 + 1), level) === 0, `${level}: ${v40} bytes fit version 40, one more fits none`);
}
ok(fitsAt('1'.repeat(41), 'L') === 1 && fitsAt('1'.repeat(42), 'L') === 2, '41 digits fit version 1 at L');
ok(fitsAt('A'.repeat(25), 'L') === 1 && fitsAt('A'.repeat(26), 'L') === 2, '25 capitals fit version 1 at L');
ok(qrCode('Ab').mode === 'byte' && qrCode('AB').mode === 'alphanumeric' && qrCode('12').mode === 'numeric' && qrCode('é').mode === 'byte', 'the mode is the most compact one the whole text can use');
let threw = '';
try {
  qrCode('a'.repeat(3000), { level: 'L' });
} catch (e) {
  threw = (e as Error).message;
}
ok(threw === 'Too long for a QR code', `a text too long for any version is refused (${threw})`);
{
  const boosted = qrCode('HELLO WORLD');
  const kept = qrCode('HELLO WORLD', { boost: false });
  ok(boosted.version === 1 && boosted.level === 'Q' && kept.level === 'M', `the level rises while the text fits the same size (M → ${boosted.level}), not when asked not to`);
  ok(qrCode('https://hydor.app/remote/abc123', { level: 'L' }).level === 'L', 'the level stays where the next one would need a bigger code');
  ok(qrCode('x', { level: 'H' }).level === 'H' && qrCode('x', { level: 'Z' as QrLevel }).level !== 'L', 'H stays H; an unknown level is M (raised from there)');
  ok(qrCode('x', { minVersion: 99 }).version === 40 && qrCode('x', { minVersion: -3 }).version === 1, 'the smallest version asked is kept within 1 to 40');
}
{
  // The mask the encoder picks is one of the eight, and the same each time.
  const a = qrCode('https://dev.naget.com/remote/k3x9q2');
  const b = qrCode('https://dev.naget.com/remote/k3x9q2');
  ok(a.mask >= 0 && a.mask < 8 && hash(a) === hash(b), `a picked mask (${a.mask}) is the same every time`);
  ok(hash(qrCode('https://dev.naget.com/remote/k3x9q2', { mask: a.mask })) === hash(a), 'and the same code as that mask forced');
}

// ---- the picture ----
{
  const c = qrCode('https://hydor.app');
  const path = qrPath(c);
  const dark = c.modules.flat().filter(Boolean).length;
  const area = [...path.matchAll(/h(\d+)v1h-\1z/g)].reduce((s, m) => s + Number(m[1]), 0);
  ok(area === dark, `the path covers each dark module once (${area} of ${dark}), runs along a row joined`);
  const svg = qrSvg(c, { dark: '#123456', light: 'rgb(250, 250, 240)', width: 200 });
  ok(
    svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ') && svg.includes('fill="#123456"') && svg.includes('fill="rgb(250, 250, 240)"') && svg.includes('width="200"'),
    'the picture has its colours, a quiet zone of 4 and the width asked',
  );
  const evil = qrSvg(c, { dark: '"/><script>alert(1)</script>', light: 'url(https://x.example/a.png)' });
  ok(!/script|url\(|x\.example/.test(evil) && evil.includes('fill="#000000"') && evil.includes('fill="#ffffff"'), 'colours that are not colours are left at black on white');
  ok(
    (evil.match(/<(\w+)/g) ?? []).every((t) => ['<svg', '<rect', '<path'].includes(t)),
    'the picture holds an svg, a rectangle and a path, nothing else',
  );
  ok(!qrSvg(c, { light: 'transparent' }).includes('<rect'), 'a see-through background draws no rectangle');
  ok(qrSvg(c, { quiet: 0 }).includes(`viewBox="0 0 ${c.size} ${c.size}"`), 'no quiet zone when asked for none');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
