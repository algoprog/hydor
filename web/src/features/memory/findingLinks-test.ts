// Where a finding's evidence opens (findingLinks.ts), and the address of a project's Findings chip.
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/memory/findingLinks-test.ts && DATA_DIR=/tmp/hydor-test-finding-links node dist/dev/findingLinks-test.js
import assert from 'node:assert/strict';
import type { FindingEvidence } from '../../../../shared/findings.ts';
import { evidenceName, evidenceTarget } from './findingLinks.ts';

const root = '/work/retriever';
const to = (kind: FindingEvidence['kind'], ref: string) => evidenceTarget({ kind, ref }, root);

assert.deepEqual(to('run', 'x1'), { type: 'page', to: '/experiments/x1' });
assert.deepEqual(to('score', 'ev1/s2'), { type: 'page', to: '/experiments?evaluation=ev1&score=s2' });
assert.equal(to('score', '0.41'), null, 'a score without its evaluation is plain text');
assert.deepEqual(to('table', 't1'), { type: 'page', to: '/experiments?table=t1' });
assert.deepEqual(to('commit', 'a1b2c3d4'), { type: 'page', to: '/git?path=%2Fwork%2Fretriever&tab=history&c=a1b2c3d4' });
assert.deepEqual(to('commit', 'sprint/curriculum'), { type: 'page', to: '/git?path=%2Fwork%2Fretriever&tab=history' });
assert.deepEqual(to('file', 'train/negatives.py:12'), { type: 'file', path: '/work/retriever/train/negatives.py', line: 12 });
assert.deepEqual(to('file', './README.md'), { type: 'file', path: '/work/retriever/README.md' });
assert.deepEqual(to('file', '/elsewhere/a.py'), { type: 'file', path: '/elsewhere/a.py' });
assert.equal(to('file', '../secrets'), null);
assert.deepEqual(to('paper', 'https://arxiv.org/abs/2401.00001'), { type: 'web', href: 'https://arxiv.org/abs/2401.00001' });
assert.deepEqual(to('paper', 'arXiv:2401.00001v2'), { type: 'web', href: 'https://arxiv.org/abs/2401.00001v2' });
assert.deepEqual(to('paper', '10.1145/3539618.3591777'), { type: 'web', href: 'https://doi.org/10.1145/3539618.3591777' });
assert.equal(to('paper', 'javascript:alert(1)'), null, 'only the web’s addresses are links');
assert.deepEqual(to('session', 'claude:abc-1'), { type: 'page', to: '/s/claude%3Aabc-1' });
assert.equal(to('session', 'the one on Tuesday'), null);

assert.equal(evidenceName({ kind: 'run', ref: 'x1', label: 'bm25 · seed 1' }), 'bm25 · seed 1');
assert.equal(evidenceName({ kind: 'commit', ref: 'a1b2c3d4e5f6a7b8c9d0' }), 'a1b2c3d');
assert.equal(evidenceName({ kind: 'run', ref: 'x1' }), 'x1');
console.log('finding links ok');
