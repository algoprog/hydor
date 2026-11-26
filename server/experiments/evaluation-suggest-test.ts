// What New evaluation suggests protecting, from a command and a folder (evaluation-suggest.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/experiments/evaluation-suggest-test.ts && DATA_DIR=/tmp/hydor-test-suggest node dist/dev/evaluation-suggest-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { suggestProtected } from './evaluation-suggest.ts';

const top = fs.mkdtempSync(path.join(os.tmpdir(), 'suggest-'));
const root = path.join(top, 'project');
const write = (rel: string, body = 'x') => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
};
for (const f of ['eval.py', 'data/dev/qrels.tsv', 'data/dev/queries.tsv', 'src/metrics/score.py', 'pkg/run.py', 'configs/dev.yaml', 'results/out.json', 'a file.txt', '.venv/bin/python', 'node_modules/x/index.js']) write(f);
fs.writeFileSync(path.join(top, 'outside.txt'), 'x');

const is = async (command: string, want: string[], why: string) => assert.deepEqual(await suggestProtected(root, command), want, why);
try {
  await is('python eval.py --split dev --seed {seed}', ['eval.py'], 'a script, and neither options nor placeholders');
  await is('python eval.py --qrels data/dev/qrels.tsv', ['eval.py', 'data/dev/qrels.tsv', 'data/dev/'], 'a data file brings its folder');
  await is('python eval.py --queries=data/dev/queries.tsv --data data/dev', ['eval.py', 'data/dev/queries.tsv', 'data/dev/'], 'a value after =, and a folder once');
  await is('python src/metrics/score.py configs/dev.yaml', ['src/metrics/score.py', 'configs/dev.yaml', 'configs/'], 'a script brings no folder');
  await is('python eval.py --out results/out.json > results/out.json', ['eval.py'], 'what it writes is not suggested');
  await is('python eval.py --output-dir=results -o results/out.json 2>> results/out.json', ['eval.py'], 'nor in its other spellings');
  await is('cd src && python metrics/score.py', ['src/metrics/score.py'], 'a cd changes where names are read from');
  await is('python -m pkg.run --k 10', ['pkg/run.py'], 'a module');
  await is('.venv/bin/python eval.py node_modules/x/index.js', ['eval.py'], 'never an environment or installed packages');
  await is(`cat 'a file.txt' ../outside.txt ${path.join(top, 'outside.txt')} /etc/hostname . missing.py $HYDOR_HELD_OUT data/*/qrels.tsv`, ['a file.txt'], 'quotes; nothing outside, the folder itself, missing, variables or patterns');
  await is(`python ${path.join(root, 'eval.py')}`, ['eval.py'], 'a full path inside is named from the folder');
  assert.deepEqual(await suggestProtected(path.join(top, 'nowhere'), 'python eval.py'), [], 'no folder, nothing');
  console.log('evaluation suggestions: ok');
} finally {
  fs.rmSync(top, { recursive: true, force: true });
}
