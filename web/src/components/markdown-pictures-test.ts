// OUTDIR=dist/dev node scripts/build-server.mjs web/src/components/markdown-pictures-test.ts && node dist/dev/markdown-pictures-test.js
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { groupPictures, picturesOnly, replyPictureRefs } from './markdown-pictures';

const render = (text: string, group = true) =>
  renderToStaticMarkup(createElement(ReactMarkdown, { children: text, remarkPlugins: [remarkGfm], rehypePlugins: group ? [groupPictures] : [] } as any));
const grids = (html: string) => [...html.matchAll(/<div class="md-pics" data-n="(\d+)">/g)].map((m) => Number(m[1]));
const imgs = (html: string) => (html.match(/<img /g) ?? []).length;

const tests: [string, () => void][] = [
  ['pictures on paragraphs of their own become one grid', () => {
    const html = render('![a](/a.png)\n\n![b](/b.png "B")\n\n![c](/c.png)');
    assert.deepEqual(grids(html), [3]);
    assert.equal(imgs(html), 3);
    assert.equal((html.match(/data-grid="true"/g) ?? []).length, 3);
    assert.ok(!html.includes('<p>'));
  }],
  ['one paragraph of only pictures, with line breaks between', () => {
    const html = render('![a](/a.png)\n![b](/b.png)');
    assert.deepEqual(grids(html), [2]);
    assert.ok(!html.includes('<p>'));
  }],
  ['a single picture stays as it is', () => {
    const html = render('![a](/a.png)');
    assert.deepEqual(grids(html), []);
    assert.equal(html, render('![a](/a.png)', false));
  }],
  ['a paragraph of pictures and words stays as it is', () => {
    const text = 'See ![a](/a.png) and ![b](/b.png)\n\n![c](/c.png)';
    assert.equal(render(text), render(text, false));
    assert.deepEqual(grids(render('![a](/a.png)\n\n![b](/b.png) caption')), []);
  }],
  ['a line of words splits the runs', () => {
    const html = render('![a](/a.png)\n\n![b](/b.png)\n\n**Next**\n\n![c](/c.png)\n\n![d](/d.png)\n\n![e](/e.png)');
    assert.deepEqual(grids(html), [2, 3]);
    assert.ok(html.includes('<p><strong>Next</strong></p>'));
  }],
  ['a picture that is a link keeps its link, inside the grid', () => {
    const html = render('[![a](/a.png)](https://x.example)\n\n![b](/b.png)');
    assert.deepEqual(grids(html), [2]);
    assert.ok(html.includes('<a href="https://x.example"><img'));
  }],
  ['pictures in a list item or a quote are grouped there, code is left alone', () => {
    assert.deepEqual(grids(render('> ![a](/a.png)\n>\n> ![b](/b.png)')), [2]);
    assert.deepEqual(grids(render('```\n![a](/a.png)\n\n![b](/b.png)\n```')), []);
  }],
  ['picturesOnly', () => {
    assert.ok(picturesOnly('![a](/a.png)'));
    assert.ok(picturesOnly('![a](/a.png "t") ![b](<my file.png>)'));
    assert.ok(picturesOnly('[![a](/a.png)](https://x.example)'));
    assert.ok(!picturesOnly('![a](/a.png) words'));
    assert.ok(!picturesOnly('- ![a](/a.png)'));
    assert.ok(!picturesOnly('![a](/a.p'));
    assert.ok(!picturesOnly('text'));
  }],
  ['the reply\'s pictures in order, with titles, <addresses> and no code', () => {
    const text = [
      '![one](/a.png)',
      '',
      'Text ![two **b**](docs/b.png "Second") and ![](<my pic.png>) and `![code](/no.png)`',
      '',
      '```md',
      '![fenced](/no2.png)',
      '```',
      '',
      '[![three](/c.png)](https://x.example) ![esc \\] ](/d\\(1\\).png) ![four](https://x.example/é.png \'T\')',
    ].join('\n');
    assert.deepEqual(replyPictureRefs(text), [
      { src: '/a.png', alt: 'one', title: '' },
      { src: 'docs/b.png', alt: 'two **b**', title: 'Second' },
      { src: 'my%20pic.png', alt: '', title: '' },
      { src: '/c.png', alt: 'three', title: '' },
      { src: '/d(1).png', alt: 'esc ]', title: '' },
      { src: 'https://x.example/%C3%A9.png', alt: 'four', title: 'T' },
    ]);
  }],
];
let n = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    n++;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
}
console.log(`${n} passed`);
