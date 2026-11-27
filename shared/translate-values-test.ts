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

// A text of several sentences (a goal's reason joins its parts with ". "): each sentence on its own, and only when every one is
// known, so a text is never half in one language; a pattern with a value after a colon does not take the next sentence in.
const g = translator({
  'It broke a rule of yours: {0}': '它违反了你的一条规则：{0}',
  'It was not undone: {0}': '它没有被撤销：{0}',
  'another session (“{0}”) was working in the folder': '另一个会话（“{0}”）曾在该文件夹中工作',
  '{0} stopped holding': '{0} 不再成立',
  'Your rules could not be checked this round': '这一轮无法检查你的规则',
  'Stopped by you.': '已被你停止。',
  'into your {0}': '到你的{0}',
  'Closer: {0} → {1}': '更接近：{0} → {1}',
});
// Both sentences known: translated one by one, also a sentence the app wrote without its full stop, and a value that is a phrase of the app's own.
assert.equal(g('It broke a rule of yours: “No new dependencies”. It was not undone: another session (“Fix the login”) was working in the folder'), '它违反了你的一条规则：“No new dependencies”。它没有被撤销：另一个会话（“Fix the login”）曾在该文件夹中工作');
assert.equal(g('Tests pass stopped holding. Your rules could not be checked this round'), 'Tests pass 不再成立。这一轮无法检查你的规则');
assert.equal(g('Stopped by you. Stopped by you.'), '已被你停止。已被你停止。');
// One of them unknown (a model's words): the pattern as before, nothing is made half of two.
assert.equal(g('It broke a rule of yours: “X”. The agent wrote a poem about the weather.'), '它违反了你的一条规则：“X”. The agent wrote a poem about the weather.');
// A weak pattern ("into your {0}") never takes one sentence of a text in.
assert.equal(g('Sorted 3 bookmarks into your folders. Stopped by you.'), null);

// Why a run waits: the clauses a value joins with "; " each translated, and only when every one is; a sentence's full stop
// stays at its end, also where the translation puts a pattern's last value elsewhere.
const r = translator({
  'Waiting for 1 GPU that is free: {0}': 'Wartet auf 1 freie GPU: {0}',
  'only GPU {0} has that now': 'nur GPU {0} hat das jetzt',
  'your other runs hold GPU {0}': 'deine anderen Läufe belegen GPU {0}',
  'The first run has waited {0}': 'Der erste Lauf hat {0} gewartet',
  'Stopped by you.': 'Von dir gestoppt.',
});
assert.equal(r('Waiting for 1 GPU that is free: only GPU 2 has that now; your other runs hold GPU 0. Stopped by you.'), 'Wartet auf 1 freie GPU: nur GPU 2 hat das jetzt; deine anderen Läufe belegen GPU 0. Von dir gestoppt.');
assert.equal(r('Waiting for 1 GPU that is free: only GPU 2 has that now; something new'), 'Wartet auf 1 freie GPU: only GPU 2 has that now; something new');
assert.equal(r('The first run has waited 2 h. Stopped by you.'), 'Der erste Lauf hat 2 h gewartet. Von dir gestoppt.');

// A sentence that ends in a bracket keeps its full stop after it, and Chinese and Japanese end theirs with "。", also
// after a name or a number; one with its stop inside the bracket or quote gets no second one.
const s = translator({
  'Waiting for a run to end ({0} at most at once)': 'Wartet darauf, dass ein Lauf endet (höchstens {0} gleichzeitig)',
  'Waiting for a run on {0} to end': '正在等待 {0} 上的运行结束',
  'The log of this run says “{0}”': 'Das Log dieses Laufs sagt „{0}“',
  'Stopped by you.': 'Von dir gestoppt.',
  'Stopped by you': '已被你停止',
});
assert.equal(s('Waiting for a run to end (12 at most at once). Stopped by you.'), 'Wartet darauf, dass ein Lauf endet (höchstens 12 gleichzeitig). Von dir gestoppt.');
assert.equal(s('Waiting for a run on GPU 1 to end. Waiting for a run on GPU 2 to end.'), '正在等待 GPU 1 上的运行结束。正在等待 GPU 2 上的运行结束。');
assert.equal(translator({ 'Your program holds GPU {0}': '你的程序占用着 GPU {0}', 'Stopped by you': '已被你停止' })('Your program holds GPU 1. Stopped by you.'), '你的程序占用着 GPU 1。已被你停止。');
assert.equal(s('The log of this run says “out of memory.”. Stopped by you.'), 'Das Log dieses Laufs sagt „out of memory.“ Von dir gestoppt.');

// A day more than a week away: the month in the reader's language, only with a day's number before it. Two patterns that
// differ in their first letter alone: the one written as the string is, so a German noun is not lowered.
const d = translator({ '{0}:{1} on {2}': '{2} um {0}:{1}', '{0} December': '{0}. Dezember', 'About {0}': 'Etwa {0}', 'Round {0} of {1}': 'Runde {0} von {1}', 'round {0} of {1}': 'Runde {0} von {1}' });
assert.equal(d('About 14:20 on 5 December'), 'Etwa 5. Dezember um 14:20');
assert.equal(d('Sales in December'), null);
// "About <clock>" ends a waiting run's reason: a sentence of it however short, and only a time of day.
const c = translator({ 'About {0}': 'Über {0}', 'About {0}:{1}': 'Etwa {0}:{1}', 'About {0}:{1} on {2}': 'Etwa am {2} um {0}:{1}', Saturday: 'Samstag', 'Waiting for a GPU: {0}': 'Wartet auf eine GPU: {0}', 'none is free now': 'derzeit ist keine frei' });
assert.equal(c('Waiting for a GPU: none is free now. About 14:20'), 'Wartet auf eine GPU: derzeit ist keine frei. Etwa 14:20');
assert.equal(c('Waiting for a GPU: none is free now. About 14:20 on Saturday'), 'Wartet auf eine GPU: derzeit ist keine frei. Etwa am Samstag um 14:20');
assert.equal(c('About the ratio 3:1'), 'Über the ratio 3:1');
const las = translator({ 'starts about {0}': 'empieza hacia {0}', 'starts about {0}:{1}': 'empieza hacia las {0}:{1}' });
assert.equal(las('starts about 14:20'), 'empieza hacia las 14:20');
assert.equal(las('starts about 5 June'), 'empieza hacia 5 June');
// A quoted line of another program's, with full stops of its own, stays whole and as it was.
const q = translator({ 'The cluster did not accept it': 'Der Cluster hat ihn nicht angenommen', 'The cluster said: “{0}”': 'Der Cluster meldet: „{0}“' });
assert.equal(q('The cluster did not accept it. The cluster said: “sbatch: error: Unspecified error. Try again.”'), 'Der Cluster hat ihn nicht angenommen. Der Cluster meldet: „sbatch: error: Unspecified error. Try again.“');
assert.equal(d('round 5 of 12'), 'Runde 5 von 12');
assert.equal(d('Round 5 of 12'), 'Runde 5 von 12');
console.log('Values in sentences: technical and small-letter words left alone, the app’s words translated');
