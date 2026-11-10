// How well Automatic tells a hard problem from the rest: asks the helper model (Settings → Models → Helper model) to
// size up each request in requests.json, as a session's start does, and says how often it agrees with the labels, how
// long it took, and how often the helper could not answer in time (which a start reads as "not hard").
// Build it, then run it with the data folder of the app whose helper model and accounts it should use:
//   OUTDIR=dist/dev node scripts/build-server.mjs scripts/tier-bench/size.ts
//   DATA_DIR=/tmp/hydor-bench/data node dist/dev/size.js [--account <id>] [--json]
// --account: ask through that added account alone (on Automatic the helper is Claude's Haiku through Claude Code).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountEnv, accountPool, syncRoots } from '../../server/accounts.ts';
import { sizeRequest, SIZE_MS } from '../../server/assistants/auto.ts';
import { ensureDirs } from '../../server/config.ts';
import { openDb } from '../../server/db.ts';
import { setOneShotAccounts } from '../../server/oneshot.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
// Built into dist/dev, the requests stay beside the source.
const file = [path.join(here, 'requests.json'), path.resolve(here, '../../scripts/tier-bench/requests.json')].find((f) => fs.existsSync(f))!;
const { requests } = JSON.parse(fs.readFileSync(file, 'utf8')) as { requests: { hard: boolean; text: string }[] };
const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

ensureDirs();
const db = openDb();
syncRoots(db);
const only = flag('account');
// As the server does: each signed-in account in turn; or the one named.
setOneShotAccounts((agent) => (only ? [only] : accountPool(db, agent)).map((id) => accountEnv(db, agent, id)));

const rows: { hard: boolean; said: boolean; why?: string; error?: string; ms: number; text: string }[] = [];
// A few at a time: each is one short call.
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < requests.length) {
      const r = requests[next++];
      const t = Date.now();
      const s = await sizeRequest(db, r.text);
      rows.push({ hard: r.hard, said: s.hard, why: s.why, error: s.error, ms: Date.now() - t, text: r.text });
    }
  }),
);
const answered = rows.filter((r) => !r.error);
const n = (f: (r: (typeof rows)[number]) => boolean) => answered.filter(f).length;
const times = answered.map((r) => r.ms).sort((a, b) => a - b);
const out = {
  requests: rows.length,
  answered: answered.length,
  noAnswer: rows.filter((r) => r.error).map((r) => r.error),
  agree: n((r) => r.hard === r.said),
  hardFound: `${n((r) => r.hard && r.said)} of ${n((r) => r.hard)}`,
  plainKept: `${n((r) => !r.hard && !r.said)} of ${n((r) => !r.hard)}`,
  medianMs: times[Math.floor(times.length / 2)] ?? null,
  slowestMs: times.at(-1) ?? null,
  limitMs: SIZE_MS,
  wrong: answered.filter((r) => r.hard !== r.said).map((r) => ({ hard: r.hard, said: r.said, why: r.why, text: r.text.slice(0, 110) })),
};
if (process.argv.includes('--json')) console.log(JSON.stringify({ ...out, rows }, null, 2));
else {
  if (out.answered < out.requests) console.log(`The helper model gave no answer for ${out.requests - out.answered} of ${out.requests} requests (a start would read those as not hard): ${[...new Set(out.noAnswer)].join('; ').slice(0, 400)}`);
  if (out.answered) {
    console.log(`${out.agree} of ${out.answered} sized up as labelled: hard problems found ${out.hardFound}, plain requests kept on Best ${out.plainKept}.`);
    console.log(`The helper model answered in ${out.medianMs} ms (median), ${out.slowestMs} ms at most; a start waits ${out.limitMs} ms at most.`);
    for (const w of out.wrong) console.log(`- ${w.hard ? 'missed a hard one' : `called a plain one hard (${w.why})`}: ${w.text}`);
  }
}
process.exit(out.answered ? 0 : 1);
