#!/usr/bin/env node
// Documents how lib/sym/grammars/ was made: copies the five prebuilt grammars out of an unpacked copy of the npm
// package `tree-sitter-wasms` and rewrites SOURCE.txt with their checksums. Only needed to change the pinned version;
// nothing here is needed to run sym or its tests.
// usage: vendor-grammars.mjs DIR   where DIR is the package's folder, e.g. an `npm install tree-sitter-wasms@0.1.13`
//        done in an empty scratch folder: DIR = <scratch>/node_modules/tree-sitter-wasms
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];
if (!SRC) { console.error('usage: vendor-grammars.mjs DIR_OF_THE_tree-sitter-wasms_PACKAGE'); process.exit(2); }
const DST = path.join(HERE, '..', 'grammars');
const pkg = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8'));
const runtime = /^web-tree-sitter@\S+/.exec(fs.readFileSync(path.join(HERE, '..', 'vendor', 'web-tree-sitter', 'SOURCE.txt'), 'utf8'))?.[0];
const lines = [`Grammars vendored from tree-sitter-wasms@${pkg.version} (loaded by ${runtime}; language ABI 14).`,
  'Regenerate with: node lib/sym/dev/vendor-grammars.mjs DIR (see the top of that file)', ''];
for (const l of ['typescript', 'tsx', 'javascript', 'python', 'rust']) {
  const f = `tree-sitter-${l}.wasm`;
  fs.copyFileSync(path.join(SRC, 'out', f), path.join(DST, f));
  lines.push(`${crypto.createHash('sha256').update(fs.readFileSync(path.join(DST, f))).digest('hex')}  ${f}`);
}
fs.writeFileSync(path.join(DST, 'SOURCE.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
