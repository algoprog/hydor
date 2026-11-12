// Script tests for a file's line endings (lineends.ts): which ending a text has, the text as the editor holds it, and
// back as the file holds it. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/files/lineends-test.ts && node dist/dev/lineends-test.js
import { detectEol, forDisk, forEditor } from './lineends';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

ok(detectEol('a\nb\nc') === 'lf', 'plain LF');
ok(detectEol('a\r\nb\r\nc\r\n') === 'crlf', 'plain CRLF');
ok(detectEol('no line ends') === 'lf', 'no line ends is LF');
ok(detectEol('') === 'lf', 'empty is LF');
ok(detectEol('a\r\nb\nc\r\n') === 'crlf', 'mostly CRLF');
ok(detectEol('a\r\nb\nc\nd\n') === 'lf', 'mostly LF');
ok(detectEol('a\r\nb\nc') === 'crlf', 'a tie goes to CRLF');
ok(detectEol('\nx') === 'lf', 'a leading lone LF');

const crlf = 'one\r\ntwo\r\n\r\nthree\r\n';
ok(forEditor(crlf) === 'one\ntwo\n\nthree\n', 'CRLF read as LF');
ok(forEditor('a\nb') === 'a\nb', 'LF stays');
ok(forDisk(forEditor(crlf), 'crlf') === crlf, 'CRLF survives a round trip');
ok(forDisk('a\nb\n', 'lf') === 'a\nb\n', 'LF written as it is');
ok(forDisk('a\r\nb\n', 'crlf') === 'a\r\nb\r\n', 'no doubled returns');
ok(forDisk('x', 'crlf') === 'x', 'no line end, nothing to add');
ok(forDisk(forEditor('a\r\nb\nc\r\n'), 'crlf') === 'a\r\nb\r\nc\r\n', 'a mixed file is made the same throughout');

console.log(failed ? `${failed} failed, ${passed} passed` : `All ${passed} checks passed`);
process.exit(failed ? 1 : 0);
