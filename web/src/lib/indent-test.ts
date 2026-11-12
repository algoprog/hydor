// Script tests for reading a file's indentation (indent.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/lib/indent-test.ts && node dist/dev/indent-test.js
import { DEFAULT_INDENT, detectIndent } from './indent';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

const eq = (a: { kind: string; size: number }, kind: string, size: number) => a.kind === kind && a.size === size;

ok(detectIndent('') === DEFAULT_INDENT, 'nothing to go by');
ok(eq(detectIndent('a\nb\nc'), 'spaces', 2), 'no indented lines');
ok(eq(detectIndent('def f():\n    x = 1\n    if x:\n        y = 2\n'), 'spaces', 4), 'four spaces');
ok(eq(detectIndent('{\n  "a": {\n    "b": 1\n  }\n}\n'), 'spaces', 2), 'two spaces');
ok(eq(detectIndent('func() {\n\tx := 1\n\tif x {\n\t\ty := 2\n\t}\n}\n'), 'tabs', 4), 'tabs');
ok(eq(detectIndent('a:\n        b\n        c\n'), 'spaces', 8), 'eight spaces');
ok(eq(detectIndent('/**\n * doc\n */\nfunction f() {\n    return 1;\n}\n'), 'spaces', 4), 'a doc comment does not count');
ok(eq(detectIndent('a\n\n\n    b\n   \n    c\n'), 'spaces', 4), 'blank lines do not count');
ok(eq(detectIndent('x\n\ty\n  z\n\tw\n'), 'tabs', 4), 'more tabs than spaces');

console.log(failed ? `${failed} failed, ${passed} passed` : `All ${passed} checks passed`);
process.exit(failed ? 1 : 0);
