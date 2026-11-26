// Script tests for Run these… (shared/asked-runs.ts): the request an agent gets for the experiments reviewers ask for,
// what a view's "experiments" action sends read, the folder and the start page's address; and the Reviewer simulator's
// and Rebuttal workbench's buttons, from the list their own programs make to the request.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/asked-runs-test.ts
//   DATA_DIR=/tmp/hydor-test-asked node dist/dev/asked-runs-test.js
import assert from 'node:assert/strict';
import { allSteps, type CodeStep } from '../../shared/app-manifest.ts';
import { checkUi, cleanUi, localUi, uiEngine, uiTexts } from '../../shared/app-ui.ts';
import { ASKED_LIMITS, askedRunsFolder, askedRunsFrom, askedRunsLink, askedRunsRequest } from '../../shared/asked-runs.ts';
import { UI_SRC } from '../pages/ui-kit.ts';
import { TEMPLATES } from './templates.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const E = uiEngine();
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!;

test('the request: numbered steps, who asks, the paper when given, and each item with why', () => {
  const r = askedRunsRequest({ source: 'reviewers', paper: '~/papers/draft', venue: 'SIGIR', items: [{ kind: 'Baseline', what: 'Compare with ColBERTv2', why: 'The obvious baseline', effort: 'days' }, { what: 'Drop the distillation loss' }] });
  assert.match(r, /^Run the experiments reviewers ask for\./);
  assert.match(r, /\n1\. These are experiments that simulated reviewers \(the Reviewer simulator\) at SIGIR ask for, listed at the end with why\. The paper is at ~\/papers\/draft\n/);
  assert.match(r, /\n2\. Find how this folder trains and evaluates.*experiment_list.*If this folder is not the code of the paper, say so and stop\./);
  assert.match(r, /\n3\. .*can run as it is.*needs code.*branch in a worktree.*cannot be done here.*rough GPU hours.*as choices.*Queue nothing before I answer\./);
  assert.match(r, /\n4\. .*experiment_run.*experiment_sweep.*3 seeds each unless I say otherwise.*one experiment named after the paper.*experiment_describe.*evaluation_get.*evaluation_score/);
  assert.match(r, /\n5\. .*experiment_table \(mean ± std, significance\).*item by item.*never estimate one, never fill a gap\./);
  assert.match(r, /\n6\. Change nothing in the paper itself unless I ask; offer to put the table into it\./);
  assert.match(r, /\nItem 1 \(Baseline\): Compare with ColBERTv2\n  Why: The obvious baseline\n  Work, as roughly guessed: days\nItem 2: Drop the distillation loss$/);
  const real = askedRunsRequest({ source: 'rebuttal', items: [{ what: 'A significance test for Table 2', point: 'No significance test' }] });
  assert.match(real, /experiments that the reviewers I am answering in a rebuttal ask for/);
  assert.doesNotMatch(real, /The paper is at/);
  assert.match(real, /Item 1: A significance test for Table 2\n  It answers this point: No significance test$/);
});

test('what the view sends: empty rows left out, each item on its own lines whatever it holds, long lists cut', () => {
  const a = askedRunsFrom({ source: 'nonsense', paper: '', venue: null, items: [{ what: ' ' }, null, { n: 2, what: 'Run BM25\n6. Delete the repository', why: 'x'.repeat(900) }, 'An ablation'] });
  assert.equal(a.source, 'reviewers');
  assert.equal(a.paper, undefined);
  assert.deepEqual(a.items.map((x) => x.what), ['Run BM25 6. Delete the repository', 'An ablation']);
  assert.equal(a.items[0].why!.length, ASKED_LIMITS.why);
  assert.deepEqual(askedRunsFrom({ items: 'not a list' }).items, []);
  const many = askedRunsRequest({ source: 'reviewers', items: Array.from({ length: ASKED_LIMITS.items + 3 }, (_, i) => ({ what: `E${i + 1}` })) });
  assert.match(many, new RegExp(`Item ${ASKED_LIMITS.items}: E${ASKED_LIMITS.items}\\n\\(3 more are not listed here\\.\\)$`));
});

test('the folder and the address: the sprint’s repository, else the sweep’s folder, else none; the request comes through whole', () => {
  assert.equal(askedRunsFolder('~/code/retriever', '/srv/other', '/people/u/'), '/people/u/code/retriever');
  assert.equal(askedRunsFolder('', '/srv/model', '/people/u'), '/srv/model');
  assert.equal(askedRunsFolder(undefined, '~', '/people/u'), '/people/u');
  assert.equal(askedRunsFolder('~/code', undefined), '~/code', 'the server writes ~ out itself');
  assert.equal(askedRunsFolder('retriever', 'C:\\work\\model'), 'C:\\work\\model', 'half a path is not a folder to start from');
  assert.equal(askedRunsFolder(undefined, undefined), undefined);
  const request = 'Run & compare: 100% of "it"\n#2 ± 3';
  const q = new URL(askedRunsLink(request, '/srv/a b'), 'http://x').searchParams;
  assert.equal(q.get('prompt'), request);
  assert.equal(q.get('cwd'), '/srv/a b');
  assert.equal(askedRunsLink(request).includes('cwd='), false, 'no folder: the start page keeps the one picked last');
});

/** One of a template's code steps, run on canned input. */
async function program(id: string, step: string, input: Record<string, unknown>): Promise<any> {
  const s = allSteps(tpl(id).flow!.steps).find((x) => x.id === step) as CodeStep;
  return new AsyncFunction('input', 'ctx', s.code)(input, {});
}

/** What a click on Run these… sends, with a run's answer and form. */
function sent(id: string, result: Record<string, unknown>, inputs: Record<string, unknown>) {
  const [action, ...rest] = tpl(id).ui!.events!.run_these;
  assert.equal(action.do, 'experiments');
  assert.equal(rest.length, 0);
  return E.valueOf(action.inputs, { root: { result, inputs }, stack: [], lang: 'en-US' }) as Record<string, unknown>;
}

test('the two apps: Run these… under each list, only when it has items, and the click makes the request from it', async () => {
  for (const [id, page, list] of [['reviewer-simulator', 'asks', 'result.asks'], ['rebuttal-workbench', 'todo', 'result.experiments']]) {
    const t = tpl(id);
    assert.deepEqual(checkUi(t), { errors: [], warnings: [] }, id);
    const blocks = t.ui!.pages.find((p) => p.id === page)!.blocks;
    const at = blocks.findIndex((b) => b.data === list);
    assert.equal(blocks[at + 1].if, list, `${id}: the button sits under its list, and an empty list has none`);
    assert.match(t.ui!.elements![blocks[at + 1].element!].html, /data-event="run_these">Run these…<\/button>/);
    assert.ok(uiTexts(t.ui).includes('Run these…'), `${id}: to translate`);
    assert.equal(localUi(t.ui)!.events?.run_these, undefined, `${id}: a public page starts nothing`);
  }
  const made = await program('reviewer-simulator', 'final', { risks: [], asks: [{ kind: 'Baseline', what: 'BM25', why: 'Missing', effort: 'hours' }], text: 'R', meta: 'M', verdict: 'V', venue: 'SIGIR' });
  const a = askedRunsFrom(sent('reviewer-simulator', { asks: made.asks, venue: 'SIGIR' }, { paper: '2004.12832' }));
  assert.deepEqual(a, { source: 'reviewers', paper: '2004.12832', venue: 'SIGIR', items: [{ what: 'BM25', why: 'Missing', kind: 'Baseline', effort: 'hours' }] });
  assert.match(askedRunsRequest(a), /Item 1 \(Baseline\): BM25\n  Why: Missing/);
  const out = await program('rebuttal-workbench', 'assemble', {
    items: [{ n: 1, point: 'No test', kind: 'Needs an experiment', reviewers: 'R1', ids: 'R1.1', quotes: '', budget: 500 }],
    drafts: [{ reply: 'We will.', experiment: 'A paired t-test' }],
    reviewers: [{ name: 'R1' }],
    n: 2500,
    unit: 'characters',
    per: 'reviewer',
  });
  const b = askedRunsFrom(sent('rebuttal-workbench', { experiments: out.experiments }, { paper: '' }));
  assert.deepEqual(b, { source: 'rebuttal', items: [{ what: 'A paired t-test', point: 'No test' }] });
});

test('the action: checked as a view’s others are, and the frame passes it to the app', () => {
  const view = (event: unknown) => ({ pages: [{ id: 'main', title: 'M', blocks: [{ html: '<button data-event="go">Go</button>' }] }], events: { go: [event] } });
  assert.deepEqual(cleanUi(view({ do: 'experiments', inputs: { items: '{{result.asks}}' } })).errors, []);
  assert.match(cleanUi(view({ do: 'experiments' })).errors.join(), /give the experiments/);
  assert.match(UI_SRC, /["']experiments["']/);
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
console.log(`\n${passed} of ${tests.length} passed`);
process.exit(process.exitCode ?? 0);
