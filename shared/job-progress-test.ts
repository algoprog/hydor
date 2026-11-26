// Script tests for how far a job has got, read from its output, and how long it has left (shared/job-progress.ts):
// the progress rules in order, the custom regex, the window of lines, estimates from samples, the last line that says
// something, a command's signature and durations in words. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs shared/job-progress-test.ts
//   DATA_DIR=/tmp/hydor-test-job-progress node dist/dev/job-progress-test.js
import assert from 'node:assert/strict';
import { commandSig, estimateEnd, lastLine, looksLikeServer, parseLeft, readProgress } from './job-progress.ts';

// tqdm: a bar with counts, with the time left after "<" in its bracket; h:mm:ss too; "<?" gives no time left.
assert.deepEqual(readProgress('42%|█████     | 420/1000 [01:23<02:10, 5.04it/s]'), { fraction: 0.42, text: '420/1000', leftMs: 130000 });
assert.deepEqual(readProgress('50%|█████     | 500/1000 [00:10<1:02:03, 1it/s]'), { fraction: 0.5, text: '500/1000', leftMs: 3723000 });
assert.deepEqual(readProgress('420/1000 [01:23<02:10, 5.04it/s]'), { fraction: 0.42, text: '420/1000', leftMs: 130000 });
assert.deepEqual(readProgress('420/1000 [01:23<?, 5.04it/s]'), { fraction: 0.42, text: '420/1000' });
assert.deepEqual(readProgress('42%|███       |'), { fraction: 0.42, text: '42%' }, 'a bar with only a percentage');

// Keras: a batch line is a fraction of its epoch; with an Epoch line the epochs count; the time left only when the batch
// is the whole job (no epoch line, or one epoch).
const nearly = (r: ReturnType<typeof readProgress>, fraction: number) => assert.ok(r && Math.abs((r.fraction ?? NaN) - fraction) < 1e-9, `fraction ${r?.fraction} is not ${fraction}`);
const keras = readProgress('Epoch 3/10\n123/500 [====>.....] - ETA: 1:23')!;
nearly(keras, 0.2246);
assert.equal(keras.text, 'epoch 3/10');
assert.equal(keras.leftMs, undefined, 'a time left inside several epochs is not the job\'s');
assert.deepEqual(readProgress('Epoch 1/1\n50/100 [===] - ETA 5m 20s'), { fraction: 0.5, text: 'epoch 1/1', leftMs: 320000 });
assert.deepEqual(readProgress('123/500 [====>.....] - ETA: 1:23'), { fraction: 0.246, text: '123/500', leftMs: 83000 });
assert.deepEqual(readProgress('Epoch 3/10 - loss: 0.31'), { fraction: 0.2, text: 'epoch 3/10' }, 'an epoch line alone is the epochs before it');

// Keyword counts, with commas and "of".
assert.deepEqual(readProgress('step 1,200/5,000'), { fraction: 0.24, text: 'step 1,200/5,000' });
assert.deepEqual(readProgress('files 1,200 of 5,000'), { fraction: 0.24, text: 'file 1,200/5,000' });
assert.deepEqual(readProgress('step 3 out of 10'), { fraction: 0.3, text: 'step 3/10' });
assert.deepEqual(readProgress('step 3 of 10 ETA 5m 20s'), { fraction: 0.3, text: 'step 3/10', leftMs: 320000 }, 'a time left on the same line');
assert.equal(readProgress('step 20/10'), null, 'done above total is refused');
assert.equal(readProgress('step 0/0'), null, 'a total of zero is refused');

// Bracketed counts, at the start of a line.
assert.deepEqual(readProgress('[12/40] copying'), { fraction: 0.3, text: '12/40' });
assert.deepEqual(readProgress('(12/40)'), { fraction: 0.3, text: '12/40' });

// Percentages: only when the line says what they measure, or they stand first, or a bar follows.
assert.deepEqual(readProgress('Downloaded 42%'), { fraction: 0.42, text: '42%' });
assert.deepEqual(readProgress('Progress: 42.5%'), { fraction: 0.425, text: '42.5%' });
assert.deepEqual(readProgress('[ 30% ] ready'), { fraction: 0.3, text: '30%' }, 'a percentage that starts the line');
assert.equal(readProgress('GPU util 95%'), null, 'a machine\'s load is not progress');
assert.equal(readProgress('loss 0.3 42%'), null, 'a percentage that says nothing is not progress');
assert.equal(readProgress('accuracy 99%'), null);
assert.equal(readProgress('150% done'), null, 'above 100 is refused');
assert.deepEqual(readProgress('100% complete'), { fraction: 1, text: '100%' });

// Colour codes and lines redrawn with a carriage return.
assert.deepEqual(readProgress('\x1b[32mDownloaded 42%\x1b[0m'), { fraction: 0.42, text: '42%' });
assert.deepEqual(readProgress('step 1/10\rstep 7/10'), { fraction: 0.7, text: 'step 7/10' }, 'a redrawn line keeps its last drawing');

// The newest line that says a fraction wins; only the last 50 non-empty lines are read.
assert.deepEqual(readProgress('step 1/10\nstep 4/10'), { fraction: 0.4, text: 'step 4/10' });
assert.deepEqual(readProgress(['step 1/10', ...Array(49).fill('hi')].join('\n')), { fraction: 0.1, text: 'step 1/10' });
assert.equal(readProgress(['step 1/10', ...Array(50).fill('hi')].join('\n')), null, 'the 51st line from the end is not read');
assert.equal(readProgress(''), null);
assert.equal(readProgress('just words'), null);

// A time left alone is nothing without a fraction on its line; the line above still gives its own.
assert.equal(readProgress('ETA 5m'), null);
assert.deepEqual(readProgress('step 3/10 12 min left'), { fraction: 0.3, text: 'step 3/10', leftMs: 720000 });
assert.deepEqual(readProgress('step 1/2\n2:10 remaining'), { fraction: 0.5, text: 'step 1/2' });

// A custom regex: two numbers are done and total, one is a percentage; it comes before the built-in rules; a bad one
// is ignored; a count above its total is refused.
assert.deepEqual(readProgress('Fetched 3 of 12 chunks', 'fetched (\\d+) of (\\d+)'), { fraction: 0.25, text: '3/12' });
assert.deepEqual(readProgress('upload at 60 pct', 'at (\\d+) pct'), { fraction: 0.6, text: '60%' });
assert.deepEqual(readProgress('frame 5/40 step 1/10', 'frame (\\d+)/(\\d+)'), { fraction: 0.125, text: '5/40' });
assert.deepEqual(readProgress('step 1/4', '('), { fraction: 0.25, text: 'step 1/4' }, 'an invalid custom regex is ignored');
assert.equal(readProgress('fetched 9 of 4', 'fetched (\\d+) of (\\d+)'), null);

// Estimates from samples.
const MIN = 60_000;
assert.equal(estimateEnd([], 0, 0), null, 'no samples');
assert.equal(estimateEnd([{ at: MIN, fraction: 0 }], 0, MIN), null, 'nothing done yet');
assert.deepEqual(estimateEnd([{ at: 5, fraction: 1 }], 0, 9), { endsAt: 9, confidence: 'high' }, 'finished');
assert.deepEqual(estimateEnd([{ at: 100_000, fraction: 0.25 }], 0, 100_000), { endsAt: 400_000, confidence: 'low' }, 'one sample: elapsed × (1 − f) / f');
assert.equal(estimateEnd([{ at: 2_000, fraction: 0.025 }], 1_000, 2_000), null, 'one reading in the first seconds says nothing yet');
assert.equal(estimateEnd([{ at: 0, fraction: 0.5 }], 0, 0), null, 'no time has passed since the start');
assert.deepEqual(estimateEnd([{ at: 100_000, fraction: 0.25 }], 0, 500_000), { endsAt: 500_000, confidence: 'low' }, 'never before now');
assert.deepEqual(estimateEnd([{ at: 100_000, fraction: 0.2 }, { at: 110_000, fraction: 0.25 }], 0, 110_000), { endsAt: 440_000, confidence: 'low' }, 'samples within 30 s of each other use the last');

const steady = Array.from({ length: 12 }, (_, k) => ({ at: (k + 1) * MIN, fraction: ((k + 1) * MIN) / 1_200_000 }));
assert.deepEqual(estimateEnd(steady, 0, 12 * MIN), { endsAt: 1_200_000, confidence: 'high' }, 'steady progress over the last 10 minutes');
const unsteady = [0.01, 0.02, 0.03, 0.1, 0.2, 0.3].map((fraction, k) => ({ at: (k + 1) * MIN, fraction }));
assert.equal(estimateEnd(unsteady, 0, 6 * MIN)?.confidence, 'medium', 'the rate speeds up: not steady');
assert.deepEqual(estimateEnd([{ at: 100_000, fraction: 0.5 }, { at: 200_000, fraction: 0.5 }], 0, 200_000), { endsAt: 400_000, confidence: 'medium' }, 'a flat rate falls back to the whole run');
assert.deepEqual(estimateEnd([{ at: 200_000, fraction: 0.4 }, { at: 100_000, fraction: 0.5 }], 0, 200_000), { endsAt: 500_000, confidence: 'medium' }, 'a falling rate falls back too, and the samples are sorted');

// The last line that says something: not a progress bar, cut to 300 characters.
assert.equal(lastLine('ready\n██████████ 100%\n░░░░░░░░'), 'ready');
assert.equal(lastLine('hello\r\nworld'), 'world');
assert.equal(lastLine('a\rb'), 'b');
assert.equal(lastLine('step 1/2\n\x1b[31mERROR\x1b[0m\n'), 'ERROR');
assert.equal(lastLine('---- ===='), undefined, 'only a bar');
assert.equal(lastLine(''), undefined);
const long = lastLine('x'.repeat(400))!;
assert.equal([...long].length, 300);
assert.ok(long.endsWith('…') && long.startsWith('x'.repeat(299)));

// A command's signature: its words without the wrappers that do not change what runs, and without the redirections.
assert.equal(commandSig('nohup nice -n 10 python train.py > log.txt 2>&1 &'), 'python train.py');
assert.equal(commandSig('CUDA_VISIBLE_DEVICES= python x.py'), 'python x.py');
assert.equal(commandSig('FOO=1 BAR=\'a b\' cmd arg'), 'cmd arg');
assert.equal(commandSig('ionice -c3 -n7 timeout 2h stdbuf -oL make build | tee -a build.log'), 'make build');
assert.equal(commandSig('exec  sleep   5'), 'sleep 5');
assert.equal(commandSig('time -p make'), 'make');
assert.equal(commandSig('nice -7 ./run'), './run');
assert.equal(commandSig('timeout -s KILL 10m ./job.sh >> out.txt'), './job.sh');
assert.equal(commandSig('stdbuf -o0 python -u x.py'), 'python -u x.py');
assert.equal(commandSig('make && echo ok > out.log'), 'make && echo ok');
assert.equal(commandSig('echo hi 2>/dev/null &'), 'echo hi');
assert.equal(commandSig('  python   a.py  '), 'python a.py');
assert.equal(commandSig('x'.repeat(400)).length, 300);

// Durations in words and digits.
assert.equal(parseLeft('1:23'), 83_000);
assert.equal(parseLeft('01:02:03'), 3_723_000);
assert.equal(parseLeft('5m 20s'), 320_000);
assert.equal(parseLeft('2h'), 7_200_000);
assert.equal(parseLeft('1h30m'), 5_400_000);
assert.equal(parseLeft('45s'), 45_000);
assert.equal(parseLeft('12 min'), 720_000);
assert.equal(parseLeft('2 hours 5 minutes'), 7_500_000);
assert.equal(parseLeft('0:00'), 0);
assert.equal(parseLeft(''), null);
assert.equal(parseLeft('abc'), null);
assert.equal(parseLeft('90'), null, 'a bare number is not a duration');
assert.equal(parseLeft('1:2'), null);

// Servers: by their command, else by the description their agent gave them; a job, a build or a test never is one.
assert.equal(looksLikeServer('npm run dev -- --host 127.0.0.1'), true);
assert.equal(looksLikeServer('cd web && npx vite --port 5173'), true);
assert.equal(looksLikeServer('python -m http.server 8000'), true);
assert.equal(looksLikeServer('uvicorn app:app --reload'), true);
assert.equal(looksLikeServer('node dist/server/index.js --port 8799'), true);
assert.equal(looksLikeServer('npx vite build'), false);
assert.equal(looksLikeServer('npm test'), false);
assert.equal(looksLikeServer('npm run build && npm run preview'), true);
assert.equal(looksLikeServer('python train.py --epochs 50'), false);
assert.equal(looksLikeServer('python train.py --port 29500'), false, 'a training run that names a port for its workers');
assert.equal(looksLikeServer("job run --name 'Index' -- npm run dev"), false);
assert.equal(looksLikeServer(undefined, 'Start the dev server'), true);
assert.equal(looksLikeServer(undefined, 'Serve the docs on port 4000'), true);
assert.equal(looksLikeServer(undefined, 'Build the web index'), false);

// A count without its total, out of the total the job was given.
assert.deepEqual(readProgress('google: 177600 written, 102 failed', 'google: (\\d+) written', 200000), { fraction: 0.888, text: '177600/200000' });
assert.equal(readProgress('google: 177600 written', 'google: (\\d+) written')?.fraction, undefined, 'without a total, one group is a percent, and 177600 is none');

// A date before a log level is not a count.
assert.equal(readProgress('2026/11/26 [INFO] loading the model'), null);

console.log('job-progress: ok');
