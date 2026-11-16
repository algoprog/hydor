// Wiki links stay within the selected wiki, and common source frontmatter stays usable.
import assert from 'node:assert/strict';
import { wikiDocument, wikiRelative } from './SpaceWikiPaths.ts';

assert.equal(wikiRelative('wiki/concepts/topic.md', '../references/source.md#part'), 'wiki/references/source.md');
assert.equal(wikiRelative('wiki/concepts/topic.md', '../../raw/papers/source.md'), 'raw/papers/source.md');
assert.equal(wikiRelative('wiki/topic.md', '../../../outside.md'), null);
assert.equal(wikiRelative('wiki/topic.md', '%2Foutside.md'), null);
assert.equal(wikiRelative('wiki/topic.md', 'https://example.com/page.md'), null);
assert.equal(wikiRelative('wiki/topic.md', '/absolute/path.md'), null);
assert.equal(wikiRelative('wiki/topic.md', '#section'), null);
assert.deepEqual(wikiDocument('---\ntitle: Example\nsources:\n  - raw/a.md\n  - "raw/b.md"\ntags: [test]\n---\n# Article'), { body: '# Article', sources: ['raw/a.md', 'raw/b.md'] });
assert.deepEqual(wikiDocument('---\nsources: [raw/a.md, "raw/b.md"]\n---\nText'), { body: 'Text', sources: ['raw/a.md', 'raw/b.md'] });
assert.deepEqual(wikiDocument('# Plain'), { body: '# Plain', sources: [] });
process.stdout.write('Wiki view path and source tests passed\n');
