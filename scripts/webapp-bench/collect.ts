// Judges what a run left and writes everything about the run in one file, `result.json` (or `result-change.json`), in the run's folder: who built it, what it cost (from
// run.json, which the driver filled in), the judge's lines, the size of the app, and whether it built and started.
//   node scripts/webapp-bench/collect.ts <run folder> [--port 4760] [--change]
// When the app also has a hydor.json, Hydor's contract checker is run on it too and its lines are kept apart (`hydor` in the result): they are not in the judge's score.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readJudgeJson } from './acceptance.ts';
import { type HydorGroup, hydorGroup, renderHydor } from './hydor.ts';
import { judge, render, type Result } from './judge.ts';
import { addedLines, appFiles, measure, type Size } from './measure.ts';
import { BRIEFS_DIR, type RunFile } from './prepare.ts';

export interface Collected {
  run: RunFile;
  judged: Result;
  size: Size;
  /** Hydor's contract checker on the app's hydor.json, apart from the score; absent when the app has none. */
  hydor?: HydorGroup;
  /** The build worked and the app started in production (two of the judge's lines). */
  started: boolean;
  /** For a change: how many files and lines of the app are new or changed since it was first built. */
  changed?: { files: number; lines: number };
}

export async function collect(runFolder: string, port: number, change: boolean): Promise<Collected> {
  const runFile = join(runFolder, change ? 'run-change.json' : 'run.json');
  if (!existsSync(runFile)) throw new Error(`there is no ${change ? 'run-change.json' : 'run.json'} in ${runFolder}: prepare the run first`);
  const run = JSON.parse(readFileSync(runFile, 'utf8')) as RunFile;
  const app = join(runFolder, change ? 'app-change' : 'app');
  const judged = await judge({ app, brief: join(BRIEFS_DIR, run.brief), port, change });
  const size = measure(app);
  const started = ['build', 'starts'].every((id) => judged.lines.find((l) => l.id === id)?.status === 'pass');
  const collected: Collected = { run, judged, size, started };
  const text = existsSync(join(app, 'judge.json')) ? readFileSync(join(app, 'judge.json'), 'utf8') : null;
  const read = readJudgeJson(text);
  const hydor = await hydorGroup(app, 'json' in read ? read.json : null, [port, Math.min(port + 4, 4769)]);
  if (hydor) collected.hydor = hydor;
  if (change && existsSync(join(runFolder, 'app'))) {
    let files = 0;
    let lines = 0;
    for (const file of appFiles(app)) {
      const rel = relative(app, file);
      const was = existsSync(join(runFolder, 'app', rel)) ? readFileSync(join(runFolder, 'app', rel), 'utf8') : '';
      const n = addedLines(was, readFileSync(file, 'utf8'));
      if (n > 0) {
        files++;
        lines += n;
      }
    }
    collected.changed = { files, lines };
  }
  writeFileSync(join(runFolder, change ? 'result-change.json' : 'result.json'), `${JSON.stringify(collected, null, 2)}\n`);
  return collected;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { port: { type: 'string' }, change: { type: 'boolean' } } });
  const run = positionals[0];
  if (!run || !existsSync(run)) {
    console.error('usage: node scripts/webapp-bench/collect.ts <run folder> [--port 4760] [--change]');
    return 2;
  }
  const c = await collect(resolve(run), Number(values.port ?? 4760), values.change === true);
  console.log(render(c.judged));
  if (c.hydor) console.log(`\n${renderHydor(c.hydor)}`);
  console.log(`\nsize: ${c.size.files} files, ${c.size.lines} lines; builds and starts: ${c.started ? 'yes' : 'no'}`);
  return c.judged.score.all ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) process.exit(await main());
