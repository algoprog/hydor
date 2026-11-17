// Values inside a sentence: the app's own words are translated in it, but a technical word (a mode, a parameter, a file
// or field name, a project's folder) or a word in small letters that only matches a capitalised entry is left as it is.
// The Chinese "hybrid" of a search mode once came out as "混合办公" ("hybrid working"), another screen's label.
import assert from 'node:assert/strict';
import { translator } from './translate.ts';

const t = translator({
  'Searched this project’s wiki ({0}) for “{1}”': '已在此项目的 wiki 中（{0}）搜索“{1}”',
  'Mode: {0}': '模式：{0}',
  'Used on {0}': '用于{0}',
  'Days: {0}': '日期：{0}',
  '{0} ago': '{0} 前',
  'Added {0}': '添加于 {0}',
  Hybrid: '混合办公',
  Articles: '文章',
  Ready: '就绪',
  working: '工作中',
  'this machine': '这台机器',
  Sun: '周日',
  Wed: '周三',
});

// The reported case: a search mode in small letters is not the capitalised label of another screen.
assert.equal(t('Mode: hybrid'), '模式：hybrid');
assert.equal(t('Searched this project’s wiki (articles, hybrid) for “release”'), '已在此项目的 wiki 中（articles, hybrid）搜索“release”');

// The app's words still go into their sentences: as the dictionary writes them, or capitalised from a small-letter entry.
assert.equal(t('Mode: Hybrid'), '模式：混合办公');
assert.equal(t('Mode: Ready'), '模式：就绪');
assert.equal(t('Mode: Working'), '模式：工作中');
assert.equal(t('Mode: working'), '模式：工作中');
assert.equal(t('Used on this machine'), '用于这台机器');
assert.equal(t('Days: Sun, Wed'), '日期：周日, 周三');
assert.equal(t('Added 3m ago'), '添加于 3m 前');

// Technical values are never one of the app's phrases, even when the dictionary holds the same text.
const u = translator({ 'Mode: {0}': '模式：{0}', 'Days: {0}': '日期：{0}', search_mode: 'X', 'notes/Sage.md': 'Y', 'Sage.md': 'Y', wikiSearch: 'Z', 'web-agent': 'W', '--resume': 'R', Sun: '周日', Wed: '周三' });
for (const v of ['search_mode', 'notes/Sage.md', 'Sage.md', 'wikiSearch', 'web-agent', '--resume']) assert.equal(u(`Mode: ${v}`), `模式：${v}`, v);
// A list is the app's words only when every item is one.
assert.equal(u('Days: Sun, wikiSearch'), '日期：Sun, wikiSearch');
assert.equal(u('Days: Sun, Wed'), '日期：周日, 周三');

// Whole strings are unchanged: a text that is an entry, in either case of its first letter, is still translated.
assert.equal(t('Hybrid'), '混合办公');
assert.equal(t('ready'), '就绪');
console.log('Values in sentences: technical and small-letter words left alone, the app’s words translated');
