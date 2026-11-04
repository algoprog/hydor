// OUTDIR=dist/dev node scripts/build-server.mjs web/src/components/markdown-math-test.ts && node dist/dev/markdown-math-test.js
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { normalizeMath } from './markdown-math';

function render(text: string) {
  return renderToStaticMarkup(createElement(ReactMarkdown, {
    children: normalizeMath(text), remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex],
  }));
}

const tests: [string, () => void][] = [
  ['numeric inline maths keeps both delimiters, not a formula made of the prose between them', () => {
    const text = 'Each row sums to $1$. Masked positions receive weight $0$.';
    assert.equal(normalizeMath(text), text);
    const html = render(text);
    assert.equal((html.match(/class="katex"/g) ?? []).length, 2);
    assert.ok(!html.includes('katex-error'));
    assert.ok(html.includes('Masked positions receive weight'));
  }],
  ['integers, decimals, negative numbers, fractions and expressions are maths', () => {
    for (const math of ['0', '1', '42', '0.090', '-1', '1/2', '2^{10}', '5x + 3 = 0']) {
      assert.equal(normalizeMath(`Value $${math}$.`), `Value $${math}$.`);
      assert.ok(!render(`Value $${math}$.`).includes('katex-error'));
    }
  }],
  ['prices and price ranges stay money, even near maths', () => {
    for (const text of ['$5', '$4.70 per question', 'From $5 to $10', 'Costs $5 or $10.', 'Costs $5 and $10; $x$ is a variable.']) {
      assert.equal(normalizeMath(text), text.replace(/\$(?=\d)/g, '\\$'));
      assert.ok(!render(text).includes('katex-error'));
    }
  }],
  ['code, escaped dollars and display maths are left alone', () => {
    for (const text of ['`$1$`', '```tex\n$1$\n```', '~~~tex\n$1$\n~~~', '```tex\n$1$', '\\$5 and \\$10', '$$\n1 + 0\n$$']) {
      assert.equal(normalizeMath(text), text);
    }
  }],
  ['alternate delimiters still normalize, and notebooks never escape money', () => {
    assert.equal(normalizeMath(String.raw`Value \(1\).`), 'Value $1$.');
    assert.equal(normalizeMath('$5 and $10', false), '$5 and $10');
  }],
];
let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}`, e); }
}
assert.equal(failed, 0, `${failed} regression tests failed`);
