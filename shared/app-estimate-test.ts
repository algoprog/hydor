// Script tests for the rough estimate of a run (shared/app-estimate.ts): from its steps, by kind and tier, through
// repeats, branches side by side and ways to decide; from its finished runs once it has some; and in words. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs shared/app-estimate-test.ts
//   DATA_DIR=/tmp/hydor-test-app-estimate node dist/dev/app-estimate-test.js
import assert from 'node:assert/strict';
import type { Step } from './app-manifest.ts';
import { costText, estimateRun, estimateText, timeText } from './app-estimate.ts';

const flow = (...steps: Step[]) => ({ prompt: '', flow: { steps } });
const tool: Step = { id: 'read', do: 'tool', tool: 'read_page', with: { url: 'https://example.org' } } as Step;
const model: Step = { id: 'sum', do: 'model', instructions: 'Sum it up' };
const agent = (tier?: 'quick' | 'standard' | 'best' | 'max'): Step => ({ id: `a${tier ?? ''}`, do: 'agent', instructions: 'Do it', ...(tier ? { tier } : {}) });

// Nothing to do yet: nothing to say.
assert.equal(estimateRun({ prompt: '' }), null);
assert.equal(estimateRun({ prompt: '  ', flow: { steps: [] } }), null);

// A one-task app is one agent, on the app's tier (none: as Standard).
assert.deepEqual(estimateRun({ prompt: 'Plan a trip' }), { seconds: [60, 180], usd: [0.1, 0.4], from: 'steps' });
assert.deepEqual(estimateRun({ prompt: 'Plan a trip', tier: 'quick' })?.seconds, [30, 60]);
assert.deepEqual(estimateRun({ prompt: 'Plan a trip', tier: 'best' })?.usd, [0.5, 2]);

// Tools and code are free and quick; a model step is a few seconds and next to nothing.
const cheap = estimateRun(flow(tool, { id: 'calc', do: 'code', language: 'javascript', code: 'return {}' } as Step, model))!;
assert.deepEqual(cheap.seconds, [4, 14]);
assert.ok(cheap.usd[1] > 0 && cheap.usd[1] <= 0.01, 'a model step costs next to nothing');

// An agent step by its own tier, else the app's; one with a model by name and no tier counts as Standard.
assert.deepEqual(estimateRun({ prompt: '', tier: 'best', flow: { steps: [agent()] } })?.seconds, [180, 360]);
assert.deepEqual(estimateRun({ prompt: '', tier: 'best', flow: { steps: [agent('quick')] } })?.seconds, [30, 60]);
assert.deepEqual(estimateRun({ prompt: '', tier: 'best', flow: { steps: [{ ...agent(), model: 'some-model' } as Step] } })?.seconds, [60, 180]);

// A repeat: its most rounds (5 unless set) a few at a time for time, every round for cost.
const each = estimateRun(flow({ id: 'loop', do: 'repeat', over: '{{read.items}}', steps: [agent('quick')] } as Step))!;
assert.deepEqual(each.seconds, [150, 300]);
assert.deepEqual(each.usd.map((x) => Math.round(x * 100) / 100), [0.05, 0.25]);
const fast = estimateRun(flow({ id: 'loop', do: 'repeat', over: '{{read.items}}', max: 6, atOnce: 3, steps: [agent('quick')] } as Step))!;
assert.deepEqual(fast.seconds, [60, 120], 'six rounds, three at once: two rounds long');
assert.deepEqual(fast.usd.map((x) => Math.round(x * 100) / 100), [0.06, 0.3], 'all six paid for');

// Side by side: as long as the longest branch, the cost of all.
const side = estimateRun(flow({ id: 'both', do: 'parallel', branches: [[agent('quick')], [agent('standard')], [tool]] } as Step))!;
assert.deepEqual(side.seconds, [60, 180]);
assert.deepEqual(side.usd.map((x) => Math.round(x * 100) / 100), [0.11, 0.45]);

// One way or the other: the cheaper way's least to the dearer one's most; a question in words adds a model's answer.
const way = estimateRun(flow({ id: 'd', do: 'decide', rule: '{{x}} > 1', then: [agent('best')], else: [tool] } as Step))!;
assert.deepEqual(way.seconds, [1, 360]);
assert.deepEqual(way.usd, [0, 2]);
assert.ok(estimateRun(flow({ id: 'd', do: 'decide', ask: 'Is it long?', then: [tool] } as Step))!.usd[1] > 0);

// Asking a person waits for them.
assert.equal(estimateRun(flow({ id: 'ok', do: 'ask', question: 'Go on?' } as Step, tool))!.waits, true);

// Finished runs: their middle values win over the guess.
const ran = estimateRun({ prompt: 'Plan a trip' }, [
  { seconds: 40, costUsd: 0.12 },
  { seconds: 90, costUsd: 0.3 },
  { seconds: 50, costUsd: 0.2 },
])!;
assert.deepEqual(ran, { seconds: [50, 50], usd: [0.2, 0.2], from: 'runs', runs: 3 });
// Runs that said only what they cost keep the steps' time.
assert.deepEqual(estimateRun({ prompt: 'Plan a trip' }, [{ costUsd: 0.1 }, { costUsd: 0.3 }])!.seconds, [60, 180]);
assert.deepEqual(estimateRun({ prompt: 'Plan a trip' }, [{ costUsd: 0.1 }, { costUsd: 0.3 }])!.usd, [0.2, 0.2]);

// In words.
assert.equal(timeText([40, 40]), '40 s');
assert.equal(timeText([60, 180]), '1–3 min');
assert.equal(timeText([30, 60]), '30–60 s');
assert.equal(timeText([45, 180]), '45 s–3 min');
assert.equal(timeText([4, 14]), '4–14 s');
assert.equal(costText([0.1, 0.4]), '$0.10–0.40');
assert.equal(costText([0.5, 2]), '$0.50–2');
assert.equal(costText([0.2, 0.2]), '$0.20');
assert.equal(costText([0, 0]), 'nothing');
assert.equal(costText([0.001, 0.008]), 'under a cent');
assert.equal(costText([0.001, 0.4]), '$0–0.40');
assert.equal(estimateText(estimateRun({ prompt: 'Plan a trip' })!), 'A run takes about 1–3 min and costs about $0.10–0.40 (a rough guess from its steps).');
assert.equal(estimateText(ran), 'A run takes about 50 s and costs about $0.20 (the middle of its last 3 finished runs).');
assert.match(estimateText(estimateRun(flow(tool))!), /costs nothing/);
assert.match(estimateText(estimateRun(flow({ id: 'ok', do: 'ask', question: 'Go on?' } as Step))!), /a person takes to answer/);

console.log('app-estimate: ok');
