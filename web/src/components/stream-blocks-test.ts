// OUTDIR=dist/dev node scripts/build-server.mjs web/src/components/stream-blocks-test.ts && node dist/dev/stream-blocks-test.js
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { streamBlocks } from './stream-blocks';

const cases: [string, string, string[]][] = [
  ['paragraphs', 'a\n\nb\n\nc', ['a\n', 'b\n', 'c']],
  ['a code block keeps its blank lines', 'x\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\ny', ['x\n', '```js\nconst a = 1;\n\nconst b = 2;\n```\n', 'y']],
  ['a code block still coming', 'x\n\n```py\nprint(1)\n\nprint(2)', ['x\n', '```py\nprint(1)\n\nprint(2)']],
  ['a loose list stays one list', '1. a\n\n2. b\n\n3. c\n\nAfter', ['1. a\n\n2. b\n\n3. c\n', 'After']],
  ['an item goes on, indented', '- item\n\n  more of the item\n\nNext', ['- item\n\n  more of the item\n', 'Next']],
  ['display maths keeps its blank lines', 'Text\n\n$$\na = 1\n\nb = 2\n$$\n\nEnd', ['Text\n', '$$\na = 1\n\nb = 2\n$$\n', 'End']],
  ['a quote', '> a\n>\n> b\n\nc', ['> a\n>\n> b\n', 'c']],
  ['code in a list item', '- step:\n\n  ```sh\n  ls\n\n  pwd\n  ```\n\nDone', ['- step:\n\n  ```sh\n  ls\n\n  pwd\n  ```\n', 'Done']],
  ['a longer fence holds a shorter one', '````md\n```js\nx\n```\n\nstill inside\n````\n\nout', ['````md\n```js\nx\n```\n\nstill inside\n````\n', 'out']],
  ['blank lines first and several between', '\n\na\n\n\n\nb', ['\n\na\n\n\n', 'b']],
];
let n = 0;
for (const [what, src, want] of cases) {
  const got = streamBlocks(src);
  assert.deepEqual(got, want, what);
  assert.equal(got.join('\n'), src, `${what}: the blocks are the text again`);
  n++;
}

// Drawn block by block, a reply reads as drawn whole.
const draw = (text: string) =>
  renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, [remarkMath, { singleDollarTextMath: true }]] as any, rehypePlugins: [rehypeKatex] as any }, text))
    .replace(/>\s+</g, '><')
    .trim();
const replies = [
  '# Plan\n\nFirst, a paragraph with **bold**, `code` and a [link](https://example.com).\n\n- one\n- two\n\n1. first\n\n2. second\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> a quote\n> on two lines\n\n```ts\nconst x = 1;\n\nconsole.log(x);\n```\n\nMaths $e^{i\\pi} + 1 = 0$ and\n\n$$\n\\int_0^1 x\\,dx = \\tfrac12\n$$\n\nThe end.',
  'Steps:\n\n1. Build it\n\n   ```bash\n   npm run build\n   ```\n\n2. Ship it\n\nThen check `/api/health`.\n\n---\n\nSources:\n\n1. [A](https://a.example)\n2. [B](https://b.example)',
];
for (const r of replies) {
  assert.equal(streamBlocks(r).map(draw).join(''), draw(r));
  n++;
}
console.log(`${n} passed`);
