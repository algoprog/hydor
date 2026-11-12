// Checks for the symbols `hydor` draws: that every non-ASCII character in the terminal code's strings is one every terminal
// font draws well (a risky glyph cannot creep back), when plain ASCII is wanted (HYDOR_ASCII, TERM=linux, the locale, Windows),
// what `asciify` turns each symbol into (and leaves alone), that the widths stay right after it, and that the screen, the
// picker and the area commands' output draw it. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/glyphs-test.ts && DATA_DIR=/tmp/hydor-test-glyphs node dist/dev/glyphs-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pickerLines } from './picker.ts';
import { Screen } from './screen.ts';
import { asciify, asciiWanted, forTerminal, makePaint, strWidth, stripAnsi, truncate } from './term.ts';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

/** The symbols the terminal code may print: ones Menlo, SF Mono, Consolas, Cascadia, DejaVu Sans Mono and Ubuntu Mono all draw. */
const ALLOWED = new Set([...'●✓✗❯›◆•·…↑↓→←↵»○◦◇□', ...'─│╭╮╰╯├┤┼', ...'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏', ...'░█▪■Ω']);
/** Typographic punctuation, which every font has. */
const TYPOGRAPHIC = new Set([...'“”‘’—–−×']);

/**
 * The text of every string, template part and regular expression in a source file, its comments left out. A small scanner of its
 * own (TypeScript 7 has no compiler API for scripts): a `/` is a regular expression after an operator or a bracket, else a division.
 */
export function stringsOf(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  const template = () => {
    let t = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') (t += src[i + 1]), (i += 2);
      else if (c === '`') {
        i++;
        break;
      } else if (c === '$' && src[i + 1] === '{') {
        out.push(t);
        t = '';
        i += 2;
        code(true);
      } else (t += c), i++;
    }
    out.push(t);
  };
  const code = (inTemplate: boolean) => {
    let prev = '';
    let braces = 0;
    while (i < src.length) {
      const c = src[i];
      const d = src[i + 1];
      if (c === '/' && d === '/') {
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && d === '*') {
        const end = src.indexOf('*/', i + 2);
        i = end < 0 ? src.length : end + 2;
        continue;
      }
      if (c === "'" || c === '"') {
        let t = '';
        i++;
        while (i < src.length && src[i] !== c) {
          if (src[i] === '\\') (t += src[i + 1]), (i += 2);
          else t += src[i++];
        }
        i++;
        out.push(t);
        prev = 'a';
        continue;
      }
      if (c === '`') {
        i++;
        template();
        prev = 'a';
        continue;
      }
      if (c === '/' && !/[\w$)\]]/.test(prev)) {
        let t = '';
        let cls = false;
        i++;
        while (i < src.length && (src[i] !== '/' || cls)) {
          if (src[i] === '\\') (t += src[i + 1]), (i += 2);
          else {
            if (src[i] === '[') cls = true;
            else if (src[i] === ']') cls = false;
            t += src[i++];
          }
        }
        i++;
        out.push(t);
        prev = 'a';
        continue;
      }
      if (c === '{') braces++;
      if (c === '}') {
        if (inTemplate && braces === 0) return void i++;
        braces--;
      }
      if (!/\s/.test(c)) prev = c;
      i++;
    }
  };
  code(false);
  return out;
}

const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) return sources(f);
    return /\.ts$/.test(e.name) && !/-test\.ts$/.test(e.name) && e.name !== 'test-kit.ts' ? [f] : [];
  });

test('glyphs: the scanner reads strings, templates and regular expressions, and leaves comments and divisions', () => {
  const src = "const a = 'x\\'é'; // “ comment\nconst b = `t ${'in ✓'} t2 ${`deep ●`}`; /* ✗ */ const c = /[“]/.test(a) ? 6 / 2 / 1 : \"q//r\";";
  assert.deepEqual(stringsOf(src), ["x'é", 't ', 'in ✓', ' t2 ', 'deep ●', '', '[“]', 'q//r']);
});

test('glyphs: every non-ASCII character in the terminal code\'s strings is on the allowed list', () => {
  const bad: string[] = [];
  const files = sources(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../server/tui'));
  assert.ok(files.length > 20, 'the terminal code is found');
  for (const f of files) {
    for (const text of stringsOf(fs.readFileSync(f, 'utf8'))) {
      for (const ch of text) {
        if (ch.charCodeAt(0) < 128 || ALLOWED.has(ch) || TYPOGRAPHIC.has(ch)) continue;
        bad.push(`${path.relative(process.cwd(), f)}: U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} ${ch} in "${text.slice(0, 50)}"`);
      }
    }
  }
  assert.deepEqual(bad, [], `A symbol outside the allowed list (add it to ALLOWED only if every terminal font draws it):\n${bad.join('\n')}`);
});

test('glyphs: the symbols that went are gone from the code', () => {
  const files = sources('server/tui').filter((f) => !f.includes(`${path.sep}areas${path.sep}`));
  const all = files.flatMap((f) => stringsOf(fs.readFileSync(f, 'utf8'))).join('\n');
  for (const g of '⎇⧗◌∴✉☐⊘') assert.ok(!all.includes(g), g);
});

// ---- when ASCII is wanted ---------------------------------------------------------------------------------

const tty = { isTTY: true };
const pipe = { isTTY: false };

test('asciiWanted: HYDOR_ASCII=1 forces it on and =0 off, even on a pipe', () => {
  assert.equal(asciiWanted({ HYDOR_ASCII: '1' }, 'linux', pipe), true);
  assert.equal(asciiWanted({ HYDOR_ASCII: '1', LANG: 'en_US.UTF-8' }, 'darwin', tty), true);
  assert.equal(asciiWanted({ HYDOR_ASCII: '0', TERM: 'linux' }, 'linux', tty), false);
  assert.equal(asciiWanted({ HYDOR_ASCII: '0', LANG: 'C' }, 'linux', tty), false);
});

test('asciiWanted: by itself for TERM=linux, a locale that is not UTF-8 on Linux and macOS, and Windows without a modern terminal; never on a pipe', () => {
  assert.equal(asciiWanted({ TERM: 'linux', LANG: 'en_US.UTF-8' }, 'linux', tty), true);
  assert.equal(asciiWanted({ TERM: 'linux' }, 'linux', pipe), false);
  assert.equal(asciiWanted({ LANG: 'C' }, 'linux', tty), true);
  assert.equal(asciiWanted({ LANG: 'POSIX' }, 'darwin', tty), true);
  assert.equal(asciiWanted({ LANG: 'en_US.ISO-8859-1' }, 'linux', tty), true);
  assert.equal(asciiWanted({ LANG: 'en_US.UTF-8' }, 'linux', tty), false);
  assert.equal(asciiWanted({ LANG: 'en_US.utf8' }, 'darwin', tty), false);
  assert.equal(asciiWanted({ LANG: 'C' }, 'linux', pipe), false);
  // The first of LC_ALL, LC_CTYPE, LANG that is set decides.
  assert.equal(asciiWanted({ LC_ALL: 'C', LANG: 'en_US.UTF-8' }, 'linux', tty), true);
  assert.equal(asciiWanted({ LC_ALL: 'en_US.UTF-8', LANG: 'C' }, 'linux', tty), false);
  assert.equal(asciiWanted({ LC_CTYPE: 'C', LANG: 'en_US.UTF-8' }, 'linux', tty), true);
  assert.equal(asciiWanted({ LC_ALL: '', LANG: 'en_US.UTF-8' }, 'linux', tty), false);
  // No locale at all: left as it is.
  assert.equal(asciiWanted({ TERM: 'xterm-256color' }, 'linux', tty), false);
  // Windows has no such locale, only a terminal that is modern or not.
  assert.equal(asciiWanted({ LANG: 'C' }, 'win32', tty), true);
  assert.equal(asciiWanted({}, 'win32', tty), true);
  for (const k of ['WT_SESSION', 'TERM_PROGRAM', 'ConEmuANSI', 'TERM']) assert.equal(asciiWanted({ [k]: 'x' }, 'win32', tty), false, k);
});

// ---- what each symbol becomes ---------------------------------------------------------------------------------

test('asciify: each of our symbols', () => {
  const map: Record<string, string> = {
    '“': '"', '”': '"', '‘': "'", '’': "'", '—': '-', '–': '-', '−': '-',
    '…': '...', '·': '-', '•': '*', '●': '*', '◆': '*', '○': 'o', '◦': '-', '◇': '-', '□': '[ ]',
    '✓': '+', '✗': 'x', '×': 'x', '›': '>', '❯': '>', '»': '>>', '→': '->', '←': '<-', '↑': '^', '↓': 'v', '↵': '/',
    '─': '-', '│': '|', '╭': '+', '╮': '+', '╰': '+', '╯': '+', '├': '+', '┤': '+', '┼': '+',
    '░': '.', '█': '#', '▪': '*', '■': '#', 'Ω': 'O',
  };
  for (const [from, to] of Object.entries(map)) assert.equal(asciify(from), to, from);
  assert.equal(asciify('HYDΩR'), 'HYDOR');
  assert.equal(asciify('⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'), '|/-\\|/-\\|/');
});

test('asciify: only our symbols; the agent\'s words, names and other languages stay as they are', () => {
  const same = 'Zażółć gęślą jaźń · naïve café 日本語 Ελληνικά 😀 ☑';
  assert.equal(asciify(same), same.replace('·', '-'));
  assert.equal(asciify('plain text'), 'plain text');
  assert.equal(asciify('“a” — b…'), '"a" - b...');
  assert.equal(asciify('\x1b[2m● done\x1b[22m'), '\x1b[2m* done\x1b[22m', 'escape codes are left alone');
});

test('asciify: widths stay right after it (the width of the mapped text is what counts)', () => {
  for (const s of ['╭─ HYDΩR 0.57.1 ───╮', '│ ~/web-agent on main │', '… and 3 more', '□ Name ✓ → ↑↓ ↵', '⠋ Working']) {
    const m = asciify(s);
    assert.ok(/^[\x20-\x7e]*$/.test(m), m);
    assert.equal(strWidth(m), m.length);
  }
  // A box line mapped is as wide as it was; the lines that grow ('…' to '...') are measured after.
  assert.equal(strWidth(asciify('╭─ HYDΩR 0.57.1 ───╮')), strWidth('╭─ HYDΩR 0.57.1 ───╮'));
  assert.equal(strWidth(asciify('wait…')), 7);
  assert.equal(strWidth(asciify(makePaint(true, 3).accent('● ok'))), 4);
  assert.deepEqual(forTerminal(['a…', '●'], true), ['a...', '*']);
  assert.deepEqual(forTerminal(['a…', '●'], false), ['a…', '●']);
});

// ---- where it is applied -----------------------------------------------------------------------------------

/** A stand-in for the terminal: what is written to it, and its size. */
function fakeOut(columns: number, rows = 24) {
  const chunks: string[] = [];
  return { out: { columns, rows, write: (s: string) => (chunks.push(s), true) } as unknown as NodeJS.WriteStream, text: () => chunks.join('') };
}

test('Screen: in ASCII mode printed lines and the region are drawn mapped, cut to the width after it', () => {
  const f = fakeOut(30);
  const screen = new Screen(f.out, true);
  screen.print(['╭─ HYDΩR ─╮', '“quoted” … ●']);
  screen.render(['› a long long long long long line…', '─'.repeat(40)], { row: 0, col: 2 });
  const t = f.text();
  assert.doesNotMatch(stripAnsi(t), /[^\x00-\x7f]/);
  assert.match(t, /\+- HYDOR -\+/);
  assert.match(t, /"quoted" \.\.\. \*/);
  for (const row of stripAnsi(t.split('\x1b[2K').slice(1).join('\n')).split(/\n|\x1b\[[0-9;?]*[A-Za-z]/)) assert.ok(strWidth(row) <= 29, row);
  assert.match(t, /\.\.\.\x1b\[0m/, 'a cut line ends in three dots');
});

test('Screen: not in ASCII mode nothing changes', () => {
  const f = fakeOut(40);
  const screen = new Screen(f.out);
  screen.print(['╭─ HYDΩR ─╮']);
  screen.render(['› …'], { row: 0, col: 2 });
  assert.match(f.text(), /╭─ HYDΩR ─╮/);
  assert.match(f.text(), /› …/);
});

test('pickerLines: ASCII mode maps the list and keeps it inside the width', () => {
  const p = makePaint(false);
  const items = [{ label: 'Plan “A”', value: 'a', hint: 'the first · of two' }, { label: 'Plan B', value: 'b' }];
  const lines = pickerLines({ items, filter: '', index: 0 }, 'Pick one', p, 30, 10, true);
  const all = lines.join('\n');
  assert.doesNotMatch(all, /[^\x00-\x7f]/);
  assert.match(all, /> Plan "A"/);
  assert.match(all, /^> type to filter/m);
  for (const l of lines) assert.ok(strWidth(l) <= 29, l);
  const uni = pickerLines({ items, filter: '', index: 0 }, 'Pick one', p, 30, 10, false).join('\n');
  assert.match(uni, /❯ Plan “A”/);
  assert.equal(truncate('x'.repeat(40), 10, '...').length, 10);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
