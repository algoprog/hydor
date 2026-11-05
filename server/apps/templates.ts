// The built-in templates the gallery shows beside your own apps. Each runs as it is (with the agent and model
// picked on its page) or starts an app of your own, and every one has answer fields, so its result comes back as a
// card or a table. The ten tasks work in steps, each the cheapest that does its part well: a model to plan, pull
// out and score; a tool to search the web or read a page or a document; a program for what must come out exact
// (sources ranked, dates worked out, minutes that add up, the tables of the result); an agent only where judgement
// or a session's tools are needed (a report written from what was found, the files of a web app). Repeat and At
// the same time do work side by side, Decide makes the real choices, and Ask a person waits only when someone is
// there to answer: when its form says so and the run comes from the form, a test or a session, never from the API, rows or a
// schedule. The programs run in a sandbox (bubblewrap); where it cannot run, an agent does their work. The blocks
// after them are small templates made to be steps of others.
import type { AnswerField, AppTemplate } from '../../shared/apps.ts';
import { cleanRecipe } from '../../shared/apps.ts';
import type { Step } from '../../shared/app-manifest.ts';
import { EXPLORE, EXPLORE_UI } from './explore.ts';
import { MORE } from './templates-more.ts';
import { PAPERS } from './templates-papers.ts';
import { VIEWS } from './views.ts';
import { MORE_VIEWS } from './views-more.ts';
import { PAPER_VIEWS } from './views-papers.ts';

type Draft = Omit<AppTemplate, 'agent' | 'tools' | 'limits'>;

/** An Ask a person step's rule: the form's yes/no says to ask, and someone is there (the form, a test, or a session whose agent ran it). */
const someoneThere = (field: string) => `{{${field}}} and {{run.source}} = web or {{${field}}} and {{run.source}} = test or {{${field}}} and {{run.source}} = session`;

// ---- what the programs share ----------------------------------------------------------------------------------
// The programs are JavaScript (or Python) as the code steps show them: String.raw keeps their backslashes as
// written, so none of them uses a backtick or a template literal.

/** A value as a list: as it is, from the JSON an agent that stood in for a step hands in, or from lines of text. */
const LIST = String.raw`function list(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && /^\s*\[/.test(v)) {
    try {
      const x = JSON.parse(v);
      if (Array.isArray(x)) return x;
    } catch (e) {}
  }
  if (typeof v === 'string') return v.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  return [];
}
function rows(v) {
  return list(v).filter((x) => x && typeof x === 'object' && !Array.isArray(x));
}
`;

/** A search's results, from its JSON or from the numbered list web_search writes; pages by site, and one key for the same page under small differences of address. */
const HITS = String.raw`// A search's results: from its JSON when it gave some, else from the numbered list it wrote ([1] the title, then
// the address with its date, then the snippet).
function hitsOf(r) {
  if (!r) return [];
  const ok = (h) => /^https?:\/\//.test(h.url);
  if (r.data && Array.isArray(r.data.results))
    return r.data.results.map((h, i) => ({ title: String(h.title || ''), url: String(h.url || ''), date: String(h.date || ''), snippet: String(h.snippet || h.description || ''), rank: i + 1 })).filter(ok);
  const out = [];
  let cur = null;
  for (const line of String(r.text || '').split('\n')) {
    const head = /^\[(\d+)\] (.*)$/.exec(line);
    if (head) {
      cur = { title: head[2].trim(), url: '', date: '', snippet: '', rank: Number(head[1]) };
      out.push(cur);
    } else if (!line.trim()) continue;
    else if (!cur || !/^\s/.test(line)) cur = null;
    else if (!cur.url) {
      const m = /^(\S+)(?: \((.*)\))?$/.exec(line.trim());
      cur.url = m ? m[1] : line.trim();
      for (const part of (m && m[2] ? m[2] : '').split(', ')) if (/^\d{4}(-\d{2}){0,2}$/.test(part)) cur.date = part;
    } else cur.snippet += (cur.snippet ? ' ' : '') + line.trim();
  }
  return out.filter(ok);
}
function siteOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}
// The same page under small differences of address: www, a slash at the end, tracking parameters, an anchor.
function keyOf(url) {
  try {
    const u = new URL(url);
    for (const k of Array.from(u.searchParams.keys())) if (/^(utm_|fbclid$|gclid$|ref$|mc_)/.test(k)) u.searchParams.delete(k);
    return (u.hostname.replace(/^(www|m)\./, '') + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
  } catch (e) {
    return String(url).toLowerCase();
  }
}
`;

/** How much a site counts as a source. */
const QUALITY = String.raw`// How much a site counts as a source: official and scholarly first, then established reporting; social media,
// shops and video least.
function quality(site) {
  if (/(^|\.)(gov|edu|int|mil)(\.[a-z]{2})?$|(^|\.)(gov|gouv|gob|go|ac|edu)\.[a-z]{2}$|(^|\.)(europa\.eu|who\.int|oecd\.org|worldbank\.org|imf\.org|un\.org|nature\.com|science\.org|sciencedirect\.com|springer\.com|wiley\.com|thelancet\.com|bmj\.com|nejm\.org|jamanetwork\.com|plos\.org|arxiv\.org|ssrn\.com|nber\.org|ieee\.org|acm\.org|iea\.org|ipcc\.ch|ourworldindata\.org)$/.test(site)) return 6;
  if (/(^|\.)(reuters\.com|apnews\.com|bbc\.co\.uk|bbc\.com|ft\.com|economist\.com|nytimes\.com|theguardian\.com|washingtonpost\.com|wsj\.com|bloomberg\.com|npr\.org|scientificamerican\.com|newscientist\.com|wikipedia\.org)$/.test(site)) return 3;
  if (/(^|\.)(pinterest\.[a-z.]+|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|quora\.com|youtube\.com|amazon\.[a-z.]+|ebay\.[a-z.]+|linkedin\.com)$/.test(site)) return -8;
  return 0;
}
`;

// ---- Deep research: its reading steps, the same for the first pages and for those found again ------------------

const FACTS: AnswerField[] = [
  { id: 'facts', label: 'Facts', type: 'list', description: 'One short sentence each, as the page states it' },
  { id: 'publisher', label: 'Publisher', type: 'text', description: 'Who published the page: the organisation, or the site' },
  { id: 'date', label: 'Date', type: 'text', description: 'When it was published, as precisely as known; empty when it is not' },
  { id: 'useful', label: 'Answers it', type: 'yesno', description: 'Whether the page says anything on the question' },
];

/** Reads each page of a list (its item `source`: a question, an address) and pulls out what it says on its question. */
const readPages = (page: string, facts: string): Step[] => [
  { id: page, title: 'Read the page', do: 'tool', tool: 'read_page', with: { url: '{{source.url}}', question: '{{source.question}}' }, failed: 'skip' },
  {
    id: facts,
    title: 'Pull out the facts',
    do: 'model',
    if: `{{${page}.text}} is not empty`,
    instructions: `Pull out of the page below what it says on this question, for a sourced report.

Question: {{source.question}}
The page: {{source.title}}, {{source.url}}{{#source.date}} (dated {{source.date}}){{/source.date}}

{{${page}.text}}

Give each fact as one short sentence, as the page states it: numbers, units, dates and names exactly, and who says so when the page quotes someone. Only what the page itself says, nothing from elsewhere. If it says nothing on the question, give no facts.`,
    outputs: FACTS,
  },
];

/** The Trip planner's days, each with its main sight's picture. */
const TRIP_DAYS: AnswerField['columns'] = [
  { id: 'day', label: 'Day', type: 'number' },
  { id: 'date', label: 'Date', type: 'date' },
  { id: 'area', label: 'Area', type: 'text' },
  { id: 'sight', label: 'Main sight', type: 'text' },
  { id: 'morning', label: 'Morning', type: 'text' },
  { id: 'afternoon', label: 'Afternoon', type: 'text' },
  { id: 'evening', label: 'Evening', type: 'text' },
  { id: 'picture', label: 'Picture', type: 'image' },
];

/** The Trip planner's days on its map. */
const TRIP_STOPS: AnswerField['columns'] = [
  { id: 'day', label: 'Day', type: 'number' },
  { id: 'date', label: 'Date', type: 'date' },
  { id: 'area', label: 'Area', type: 'text' },
  { id: 'lat', label: 'Latitude', type: 'number' },
  { id: 'lng', label: 'Longitude', type: 'number' },
];

/** The Weekly news digest's stories, each with its picture. */
const STORY_COLS: AnswerField['columns'] = [
  { id: 'topic', label: 'Topic', type: 'text' },
  { id: 'title', label: 'Story', type: 'text' },
  { id: 'summary', label: 'What happened', type: 'text' },
  { id: 'why', label: 'Why it matters', type: 'text' },
  { id: 'date', label: 'Date', type: 'date' },
  { id: 'source', label: 'Source', type: 'text' },
  { id: 'url', label: 'Link', type: 'url' },
  { id: 'picture', label: 'Picture', type: 'image' },
];

const T: Draft[] = [
  {
    id: 'deep-research',
    name: 'Deep research report',
    icon: 'telescope',
    color: 'violet',
    category: 'Research',
    description: 'A sourced report on any question: the web searched, facts cross-checked, every claim cited.',
    fields: [
      { id: 'topic', label: 'What should be researched?', type: 'long', required: true, placeholder: 'e.g. How well do heat pumps work in cold climates, and what do they cost to run compared with gas?' },
      { id: 'focus', label: 'Focus on, or leave out', type: 'text', placeholder: 'e.g. Only studies from the last five years' },
      { id: 'depth', label: 'Depth', type: 'choice', options: ['Quick overview', 'Thorough', 'Exhaustive'], default: 'Thorough' },
      { id: 'audience', label: 'Written for', type: 'choice', options: ['Anyone', 'Experts', 'Decision makers'], default: 'Anyone' },
      { id: 'review', label: 'Let me check the questions first', type: 'yesno', help: 'The run waits for you to keep or change the questions it will research' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'budget',
          title: 'Set how deep it goes',
          do: 'code',
          language: 'javascript',
          with: { depth: '{{depth}}' },
          code: String.raw`// How far the research goes at each depth: the questions it asks, the results each search brings, the pages it
// reads, the sources (from different sites) each question needs, and about how long the report is.
const depths = {
  'Quick overview': { questions: 3, results: 6, pages: 4, need: 1, words: 400 },
  Thorough: { questions: 5, results: 8, pages: 8, need: 2, words: 1200 },
  Exhaustive: { questions: 6, results: 10, pages: 10, need: 2, words: 2000 },
};
return depths[input.depth] || depths.Thorough;`,
          outputs: [
            { id: 'questions', label: 'Questions', type: 'number' },
            { id: 'results', label: 'Results for each search', type: 'number' },
            { id: 'pages', label: 'Pages to read', type: 'number' },
            { id: 'need', label: 'Sources each question needs', type: 'number' },
            { id: 'words', label: 'Words', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'plan',
          title: 'Plan the questions',
          do: 'model',
          instructions: `Plan web research on the topic below. Break it into exactly {{budget.questions}} questions a careful researcher would need answered to cover it, the most important first. For each, write a web search query likely to find primary sources (official statistics, papers, filings, documentation) or recent, reputable reporting, and a second query in other words.

Topic: {{topic}}
{{#focus}}Focus on, or leave out: {{focus}}
{{/focus}}Written for: {{audience}}
Today is {{today}}: put a year in a query when recency matters.`,
          outputs: [
            {
              id: 'questions',
              label: 'Questions',
              type: 'table',
              required: true,
              columns: [{ id: 'question', label: 'Question', type: 'text' }, { id: 'query', label: 'Search', type: 'text' }, { id: 'other', label: 'In other words', type: 'text' }],
            },
          ],
        },
        { id: 'asked', title: 'The questions alone', do: 'value', of: '{{plan.questions}}', op: 'pick', arg: 'question' },
        {
          id: 'check_plan',
          title: 'Check the questions',
          do: 'ask',
          if: someoneThere('review'),
          question: 'The research will answer these questions:\n\n{{asked.value}}\n\nKeep them, or write the ones you want instead.',
          fields: [{ id: 'questions', label: 'Your questions instead, one per line', type: 'long', help: 'Leave it empty to research the questions above' }],
          waitHours: 24,
          failed: 'skip',
        },
        {
          id: 'queries',
          title: 'List the searches',
          do: 'code',
          language: 'javascript',
          with: { planned: '{{plan.questions}}', mine: '{{check_plan.questions}}', most: '{{budget.questions}}' },
          code:
            LIST +
            String.raw`// The questions to research: those written in answer to the check, when there are some, else the plan's; each
// with its search, and another in other words for when the first finds too little.
const mine = list(input.mine).map(String).filter(Boolean).slice(0, 8);
const planned = rows(input.planned).filter((x) => x.question).slice(0, Math.max(1, Number(input.most) || 5));
const chosen = mine.length ? mine.map((q) => ({ question: q, query: q, other: q + ' evidence' })) : planned;
const items = chosen.map((x, i) => {
  const question = String(x.question).trim();
  const query = String(x.query || question).trim();
  return { q: i, question, query, other: String(x.other || '').trim() || question };
});
if (!items.length) throw new Error('The plan came back without questions');
return { items, count: items.length };`,
          outputs: [
            {
              id: 'items',
              label: 'Searches',
              type: 'table',
              columns: [
                { id: 'q', label: 'Question number', type: 'number' },
                { id: 'question', label: 'Question', type: 'text' },
                { id: 'query', label: 'Search', type: 'text' },
                { id: 'other', label: 'In other words', type: 'text' },
              ],
            },
            { id: 'count', label: 'How many', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'search',
          title: 'Search the web',
          do: 'repeat',
          over: '{{queries.items}}',
          atOnce: 3,
          as: 'question',
          steps: [{ id: 'find', title: 'Search for it', do: 'tool', tool: 'web_search', with: { query: '{{question.query}}', k: '{{budget.results}}' }, failed: 'skip' }],
        },
        {
          id: 'rank',
          title: 'Rank the sources',
          do: 'code',
          language: 'javascript',
          with: { searches: '{{search.items}}', questions: '{{queries.items}}', pages: '{{budget.pages}}', today: '{{today}}' },
          code:
            LIST +
            HITS +
            QUALITY +
            String.raw`// Every result once (a page more than one search found counts more), scored by its place in the results, the kind
// of site and how recent it is; then taken in turns, a question at a time and at most two from one site, so each
// question gets its share of the pages to read.
const questions = rows(input.questions);
const searches = list(input.searches);
const year = Number(String(input.today || '').slice(0, 4)) || new Date().getFullYear();
const pages = new Map();
searches.forEach((s, i) => {
  const q = questions[i] ? questions[i].q : i;
  for (const h of hitsOf(s)) {
    const k = keyOf(h.url);
    const p = pages.get(k) || { url: h.url, title: h.title || siteOf(h.url), site: siteOf(h.url), date: h.date, snippet: h.snippet, at: {}, times: 0 };
    p.times++;
    if (!(q in p.at) || h.rank < p.at[q]) p.at[q] = h.rank;
    p.date = p.date || h.date;
    p.snippet = p.snippet || h.snippet;
    pages.set(k, p);
  }
});
const score = (p, q) => {
  const y = Number(String(p.date || '').slice(0, 4));
  return Math.max(1, 11 - p.at[q]) + quality(p.site) + 2 * (p.times - 1) + (/\.pdf($|[?#])/i.test(p.url) ? 1 : 0) + (y ? (y >= year - 2 ? 2 : y < year - 8 ? -2 : 0) : 0);
};
const ranked = questions.map((x) => [...pages.values()].filter((p) => x.q in p.at && score(p, x.q) > 0).sort((a, b) => score(b, x.q) - score(a, x.q)));
const want = Math.max(1, Number(input.pages) || 8);
const items = [];
const taken = new Set();
const perSite = {};
for (let turn = 0; items.length < want && turn < want; turn++) {
  let more = false;
  questions.forEach((x, i) => {
    if (items.length >= want) return;
    const p = ranked[i].find((c) => !taken.has(keyOf(c.url)) && (perSite[c.site] || 0) < 2);
    if (!p) return;
    more = true;
    taken.add(keyOf(p.url));
    perSite[p.site] = (perSite[p.site] || 0) + 1;
    items.push({ q: x.q, question: x.question, url: p.url, title: p.title, site: p.site, date: p.date || '', snippet: String(p.snippet || '').slice(0, 300) });
  });
  if (!more) break;
}
return { items, count: pages.size };`,
          outputs: [
            {
              id: 'items',
              label: 'Pages to read',
              type: 'table',
              columns: [
                { id: 'q', label: 'Question number', type: 'number' },
                { id: 'question', label: 'Question', type: 'text' },
                { id: 'url', label: 'Link', type: 'url' },
                { id: 'title', label: 'Title', type: 'text' },
                { id: 'site', label: 'Site', type: 'text' },
                { id: 'date', label: 'Date', type: 'text' },
                { id: 'snippet', label: 'Snippet', type: 'text' },
              ],
            },
            { id: 'count', label: 'Results found', type: 'number' },
          ],
          failed: 'agent',
        },
        { id: 'read', title: 'Read the best pages', do: 'repeat', over: '{{rank.items}}', atOnce: 4, as: 'source', collect: 'facts', steps: readPages('page', 'facts') },
        {
          id: 'coverage',
          title: 'Check what is answered',
          do: 'code',
          language: 'javascript',
          with: { questions: '{{queries.items}}', pages: '{{rank.items}}', reads: '{{read.items}}', need: '{{budget.need}}' },
          code:
            LIST +
            String.raw`// Which questions the pages answered, and from how many different sites; those short of the sources the depth asks
// for are searched again, in other words.
const questions = rows(input.questions);
const pages = rows(input.pages);
const reads = list(input.reads);
const need = Math.max(1, Number(input.need) || 1);
const sites = {};
pages.forEach((p, i) => {
  const r = reads[i] || {};
  if (list(r.facts).length && r.useful !== false) (sites[p.q] = sites[p.q] || new Set()).add(p.site);
});
const items = questions.filter((x) => !sites[x.q] || sites[x.q].size < need).map((x) => ({ q: x.q, question: x.question, query: x.other || x.query }));
return { items, count: items.length, answered: questions.length - items.length };`,
          outputs: [
            {
              id: 'items',
              label: 'Short of sources',
              type: 'table',
              columns: [{ id: 'q', label: 'Question number', type: 'number' }, { id: 'question', label: 'Question', type: 'text' }, { id: 'query', label: 'Search', type: 'text' }],
            },
            { id: 'count', label: 'How many', type: 'number' },
            { id: 'answered', label: 'Answered', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'more',
          title: 'Any question short of sources?',
          do: 'decide',
          rule: '{{coverage.count}} > 0',
          then: [
            {
              id: 'search_more',
              title: 'Search again for those',
              do: 'repeat',
              over: '{{coverage.items}}',
              atOnce: 3,
              as: 'gap',
              steps: [{ id: 'find_more', title: 'Search in other words', do: 'tool', tool: 'web_search', with: { query: '{{gap.query}}', k: '{{budget.results}}' }, failed: 'skip' }],
            },
            {
              id: 'pick_more',
              title: 'Pick new pages',
              do: 'code',
              language: 'javascript',
              with: { searches: '{{search_more.items}}', questions: '{{coverage.items}}', read: '{{rank.items}}', pages: '{{budget.pages}}' },
              code:
                LIST +
                HITS +
                QUALITY +
                String.raw`// The best pages the new searches found that were not read already: one for each question, then a second, up to
// half as many pages as the first reading.
const gaps = rows(input.questions);
const searches = list(input.searches);
const read = new Set(rows(input.read).map((p) => keyOf(p.url)));
const most = Math.max(1, Math.ceil((Number(input.pages) || 8) / 2));
const ranked = gaps.map((g, i) =>
  hitsOf(searches[i])
    .filter((h) => quality(siteOf(h.url)) > -5)
    .sort((a, b) => quality(siteOf(b.url)) - b.rank - (quality(siteOf(a.url)) - a.rank)),
);
const items = [];
for (let turn = 0; turn < 2; turn++)
  gaps.forEach((g, i) => {
    const h = ranked[i].find((x) => !read.has(keyOf(x.url)));
    if (!h || items.length >= most) return;
    read.add(keyOf(h.url));
    items.push({ q: g.q, question: g.question, url: h.url, title: h.title || siteOf(h.url), site: siteOf(h.url), date: h.date || '', snippet: String(h.snippet || '').slice(0, 300) });
  });
return { items, count: items.length };`,
              outputs: [
                {
                  id: 'items',
                  label: 'Pages to read',
                  type: 'table',
                  columns: [
                    { id: 'q', label: 'Question number', type: 'number' },
                    { id: 'question', label: 'Question', type: 'text' },
                    { id: 'url', label: 'Link', type: 'url' },
                    { id: 'title', label: 'Title', type: 'text' },
                    { id: 'site', label: 'Site', type: 'text' },
                    { id: 'date', label: 'Date', type: 'text' },
                  ],
                },
                { id: 'count', label: 'How many', type: 'number' },
              ],
              failed: 'agent',
            },
            { id: 'read_more', title: 'Read them', do: 'repeat', over: '{{pick_more.items}}', atOnce: 4, as: 'source', collect: 'facts_more', steps: readPages('page_more', 'facts_more') },
          ],
        },
        {
          id: 'evidence',
          title: 'Number the sources',
          do: 'code',
          language: 'javascript',
          with: { questions: '{{queries.items}}', pages: '{{rank.items}}', reads: '{{read.items}}', more_pages: '{{pick_more.items}}', more_reads: '{{read_more.items}}' },
          code:
            LIST +
            String.raw`// One numbered list of the pages that gave facts, and the facts under each question with the numbers of their sources.
const questions = rows(input.questions);
const pairs = [];
for (const [pages, reads] of [[input.pages, input.reads], [input.more_pages, input.more_reads]]) {
  const r = list(reads);
  rows(pages).forEach((p, i) => pairs.push({ page: p, read: r[i] || {} }));
}
const sources = [];
const under = {};
for (const { page, read } of pairs) {
  const facts = list(read.facts).map(String).filter(Boolean);
  if (!facts.length || read.useful === false) continue;
  let n = sources.findIndex((s) => s.url === page.url) + 1;
  if (!n) {
    sources.push({ title: page.title || page.site, publisher: read.publisher || page.site, date: read.date || page.date || '', url: page.url });
    n = sources.length;
  }
  const at = under[page.q] || (under[page.q] = []);
  for (const f of facts) at.push('- ' + f + ' [' + n + ']');
}
const evidence = questions.map((x, i) => '### ' + (i + 1) + '. ' + x.question + '\n' + ((under[x.q] || []).join('\n') || '- Nothing found on this yet.')).join('\n\n');
const listed = sources.map((s, i) => '[' + (i + 1) + '] ' + s.title + ' (' + [s.publisher, s.date].filter(Boolean).join(', ') + ') ' + s.url).join('\n');
const open = questions.filter((x) => !(under[x.q] || []).length).map((x) => x.question);
return { evidence, list: listed, sources, open, count: sources.length };`,
          outputs: [
            { id: 'evidence', label: 'Evidence', type: 'markdown' },
            { id: 'list', label: 'Sources in a list', type: 'markdown' },
            {
              id: 'sources',
              label: 'Sources',
              type: 'table',
              columns: [{ id: 'title', label: 'Title', type: 'text' }, { id: 'publisher', label: 'Publisher', type: 'text' }, { id: 'date', label: 'Date', type: 'text' }, { id: 'url', label: 'Link', type: 'url' }],
            },
            { id: 'open', label: 'Still open', type: 'list' },
            { id: 'count', label: 'How many sources', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'write',
          title: 'Write the report',
          do: 'agent',
          instructions: `Write a research report on the topic below from the evidence gathered for it: under each question, the facts pulled from the pages that were read, each with the number of its source.

Topic: {{topic}}
{{#focus}}Focus on, or leave out: {{focus}}
{{/focus}}Written for: {{audience}}
Length: about {{budget.words}} words. Today is {{today}}.

Evidence:
{{evidence.evidence}}

Sources:
{{evidence.list}}
{{#evidence.open}}
Nothing was found yet on these questions; search the web and read for them yourself if you can:
{{evidence.open}}
{{/evidence.open}}
How to write it:
- Rely on the evidence, and check a source yourself when a fact looks doubtful or two sources disagree; say which is more credible and why.
- Cite the sources by their numbers in brackets, like [3], after the claims they support. A page you read yourself takes the next number after the list and goes in extra_sources, in that order.
- The report, in Markdown: the answer in three to five sentences, then one section per question, then "Open questions": what stays uncertain, disputed or unknown. Don't add a list of sources: it is added after.
- Be concrete (numbers, dates, names) and leave out filler.`,
          outputs: [
            { id: 'summary', label: 'Summary', type: 'markdown', required: true, description: 'The answer in three to five sentences, with citations' },
            { id: 'key_findings', label: 'Key findings', type: 'list', required: true, description: 'The most important findings, one sentence each, with citations' },
            { id: 'report', label: 'Report', type: 'markdown', required: true, description: 'The full report in Markdown, with numbered citations and no list of sources' },
            { id: 'confidence', label: 'Confidence', type: 'text', description: 'High, medium or low, with the reason in one sentence' },
            {
              id: 'extra_sources',
              label: 'Sources you added',
              type: 'table',
              description: 'Pages you read yourself and cite, numbered after the list, in that order',
              columns: [{ id: 'title', label: 'Title', type: 'text' }, { id: 'publisher', label: 'Publisher', type: 'text' }, { id: 'date', label: 'Date', type: 'text' }, { id: 'url', label: 'Link', type: 'url' }],
            },
          ],
        },
        {
          id: 'finish',
          title: 'Number the citations',
          do: 'code',
          language: 'javascript',
          with: { report: '{{write.report}}', summary: '{{write.summary}}', findings: '{{write.key_findings}}', sources: '{{evidence.sources}}', extra: '{{write.extra_sources}}' },
          code:
            LIST +
            String.raw`// The sources numbered in the order the report first cites them, its citations renumbered to match, and their
// list added at its end; the sources it cites make the table (all of them, when it cites none).
const sources = rows(input.sources).concat(rows(input.extra));
const report = String(input.report || '');
const summary = String(input.summary || '');
const findings = list(input.findings).map(String);
const cite = /(\s?)\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;
const numbers = (t) => {
  const out = [];
  for (const part of t.split(',')) {
    const r = part.split(/[–-]/).map((x) => Number(x.trim()));
    if (r.length === 2 && r[0] && r[1] >= r[0] && r[1] - r[0] < 20) for (let n = r[0]; n <= r[1]; n++) out.push(n);
    else if (r[0]) out.push(r[0]);
  }
  return out;
};
const order = [];
const to = {};
for (const t of [report, summary, ...findings]) for (const m of t.matchAll(cite)) for (const n of numbers(m[2])) if (sources[n - 1] && !(n in to)) to[n] = order.push(n);
const renumber = (t) =>
  t.replace(cite, (all, space, g) => {
    const ns = [...new Set(numbers(g).map((n) => to[n]).filter(Boolean))].sort((a, b) => a - b);
    return ns.length ? space + '[' + ns.join(', ') + ']' : '';
  });
const used = order.length ? order.map((n) => sources[n - 1]) : sources;
const line = (s, i) => i + 1 + '. ' + [s.title, s.publisher, s.date].filter(Boolean).join(', ') + (s.url ? ' — ' + s.url : '');
return {
  report: renumber(report).trim() + (used.length ? '\n\n## Sources\n\n' + used.map(line).join('\n') : ''),
  summary: renumber(summary),
  key_findings: findings.map(renumber),
  sources: used.map((s) => ({ title: s.title || '', publisher: s.publisher || '', date: s.date || '', url: /^https?:\/\/\S+$/.test(String(s.url || '')) ? s.url : null })),
};`,
          outputs: [
            { id: 'report', label: 'Report', type: 'markdown' },
            { id: 'summary', label: 'Summary', type: 'markdown' },
            { id: 'key_findings', label: 'Key findings', type: 'list' },
            {
              id: 'sources',
              label: 'Sources',
              type: 'table',
              columns: [{ id: 'title', label: 'Title', type: 'text' }, { id: 'publisher', label: 'Publisher', type: 'text' }, { id: 'date', label: 'Date', type: 'text' }, { id: 'url', label: 'Link', type: 'url' }],
            },
          ],
          failed: 'agent',
        },
      ],
      outputs: { summary: '{{finish.summary}}', key_findings: '{{finish.key_findings}}', report: '{{finish.report}}', sources: '{{finish.sources}}', confidence: '{{write.confidence}}' },
    },
    answer: [
      { id: 'summary', label: 'Summary', type: 'markdown', required: true, description: 'The answer in three to five sentences' },
      { id: 'key_findings', label: 'Key findings', type: 'list', required: true, description: 'The most important findings, one sentence each' },
      { id: 'report', label: 'Report', type: 'markdown', required: true, description: 'The full report in Markdown, with numbered citations' },
      {
        id: 'sources',
        label: 'Sources',
        type: 'table',
        required: true,
        columns: [
          { id: 'title', label: 'Title', type: 'text' },
          { id: 'publisher', label: 'Publisher', type: 'text' },
          { id: 'date', label: 'Date', type: 'text', description: 'When it was published, as precisely as known' },
          { id: 'url', label: 'Link', type: 'url' },
        ],
      },
      { id: 'confidence', label: 'Confidence', type: 'text', description: 'High, medium or low, with the reason in one sentence' },
    ],
    examples: [
      { id: 'heat-pumps', name: 'Heat pumps in the cold', inputs: { topic: 'How well do heat pumps work in cold climates, and what do they cost to run compared with gas?', depth: 'Quick overview' }, checks: ['{{answer.sources}} is not empty', '{{answer.report}} contains ['] },
    ],
  },
  {
    id: 'trip-planner',
    name: 'Trip planner',
    icon: 'plane',
    color: 'indigo',
    category: 'Planning',
    description: 'A day-by-day plan checked against your dates: opening hours, events, travel times, budget and what to book.',
    fields: [
      { id: 'destination', label: 'Where to', type: 'text', required: true, placeholder: 'e.g. Lisbon, or the west coast of Ireland' },
      { id: 'start', label: 'First day', type: 'date', required: true },
      { id: 'days', label: 'How many days', type: 'number', required: true, default: '4' },
      { id: 'travelers', label: 'Who’s going', type: 'text', placeholder: 'e.g. Two adults and a six-year-old' },
      { id: 'budget', label: 'Budget', type: 'text', placeholder: 'e.g. About €1,500 without flights' },
      { id: 'interests', label: 'What you enjoy', type: 'long', placeholder: 'Food markets, easy hikes, museums, no nightlife…' },
      { id: 'pace', label: 'Pace', type: 'choice', options: ['Relaxed', 'Balanced', 'Packed'], default: 'Balanced' },
      { id: 'choose', label: 'Let me choose before it plans', type: 'yesno', help: 'The run waits for you to say where to stay and what must be in the plan' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'calendar',
          title: 'Work out the dates',
          do: 'code',
          language: 'javascript',
          with: { start: '{{start}}', days: '{{days}}', today: '{{today}}' },
          code: String.raw`// The days of the trip, each with its date and weekday (three weeks at most), the months it falls in, and how many
// days from today it starts.
const start = new Date(String(input.start || '').slice(0, 10) + 'T00:00:00Z');
if (isNaN(start.getTime())) throw new Error('The first day should be a date, like 2026-11-20');
const count = Math.min(21, Math.max(1, Math.round(Number(input.days) || 1)));
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dates = [];
for (let i = 0; i < count; i++) {
  const d = new Date(start.getTime() + i * 86400000);
  dates.push({ day: i + 1, date: d.toISOString().slice(0, 10), weekday: WEEKDAYS[d.getUTCDay()] });
}
const today = new Date(String(input.today || '').slice(0, 10) + 'T00:00:00Z');
const months = [...new Set(dates.map((d) => MONTHS[Number(d.date.slice(5, 7)) - 1]))];
return {
  dates,
  first: dates[0].date,
  last: dates[count - 1].date,
  count,
  month: months.join(' and '),
  year: start.getUTCFullYear(),
  away: isNaN(today.getTime()) ? null : Math.round((start.getTime() - today.getTime()) / 86400000),
};`,
          outputs: [
            { id: 'dates', label: 'The days', type: 'table', columns: [{ id: 'day', label: 'Day', type: 'number' }, { id: 'date', label: 'Date', type: 'date' }, { id: 'weekday', label: 'Weekday', type: 'text' }] },
            { id: 'first', label: 'First day', type: 'date' },
            { id: 'last', label: 'Last day', type: 'date' },
            { id: 'count', label: 'Days', type: 'number' },
            { id: 'month', label: 'Months', type: 'text' },
            { id: 'year', label: 'Year', type: 'number' },
            { id: 'away', label: 'Days from today', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'research',
          title: 'Look into the trip',
          do: 'parallel',
          branches: [
            [
              { id: 'events_search', title: 'Search for events', do: 'tool', tool: 'web_search', with: { query: 'events festivals concerts {{destination}} {{calendar.month}} {{calendar.year}}', k: 8 }, failed: 'skip' },
              { id: 'holidays_search', title: 'Search for holidays and closures', do: 'tool', tool: 'web_search', with: { query: 'public holidays closures {{destination}} {{calendar.month}} {{calendar.year}}', k: 6 }, failed: 'skip' },
              {
                id: 'whats_on',
                title: 'What is on',
                do: 'model',
                instructions: `From the search results below, list what is on in {{destination}} between {{calendar.first}} and {{calendar.last}}: events and festivals, public holidays, and closures or works that affect visitors. Only what falls within those dates, each with its date as the results give it; leave out what you cannot place in them.

Events:
{{events_search.text}}

Holidays and closures:
{{holidays_search.text}}`,
                outputs: [
                  {
                    id: 'events',
                    label: 'Events',
                    type: 'table',
                    columns: [{ id: 'name', label: 'Event', type: 'text' }, { id: 'date', label: 'When', type: 'text' }, { id: 'where', label: 'Where', type: 'text' }, { id: 'note', label: 'Note', type: 'text' }],
                  },
                  { id: 'holidays', label: 'Public holidays', type: 'list' },
                  { id: 'closures', label: 'Closures', type: 'list' },
                ],
              },
            ],
            [
              { id: 'climate_search', title: 'Search for the usual weather', do: 'tool', tool: 'web_search', with: { query: '{{destination}} weather in {{calendar.month}} average temperature rainfall', k: 6 }, failed: 'skip' },
              {
                id: 'soon',
                title: 'Soon enough for a forecast?',
                do: 'decide',
                rule: '{{calendar.away}} <= 10',
                then: [{ id: 'forecast_search', title: 'Search for the forecast', do: 'tool', tool: 'web_search', with: { query: '{{destination}} weather forecast {{calendar.first}}', k: 5 }, failed: 'skip' }],
              },
              {
                id: 'weather',
                title: 'The weather to expect',
                do: 'model',
                instructions: `Say what weather to expect in {{destination}} from {{calendar.first}} to {{calendar.last}}, from the results below{{#forecast_search.text}} (a forecast first, where it reaches those days, else the usual weather){{/forecast_search.text}}.

The usual weather:
{{climate_search.text}}
{{#forecast_search.text}}
The forecast:
{{forecast_search.text}}
{{/forecast_search.text}}`,
                outputs: [
                  { id: 'summary', label: 'In short', type: 'text', description: 'The weather in a sentence or two' },
                  { id: 'temperatures', label: 'Temperatures', type: 'text', description: 'Highs and lows, with the unit' },
                  { id: 'rain', label: 'Rain', type: 'text' },
                  { id: 'pack', label: 'What to pack', type: 'list' },
                ],
              },
            ],
            [
              { id: 'sights_search', title: 'Search for what to see', do: 'tool', tool: 'web_search', with: { query: 'best things to do in {{destination}} opening hours tickets', k: 8 }, failed: 'skip' },
              { id: 'areas_search', title: 'Search for where to stay', do: 'tool', tool: 'web_search', with: { query: 'best areas neighbourhoods to stay in {{destination}}', k: 6 }, failed: 'skip' },
              {
                id: 'places',
                title: 'Where to go and stay',
                do: 'model',
                instructions: `From the search results below, pick the areas worth staying in and the places worth a visit in {{destination}}, for these travelers.
{{#travelers}}Travelers: {{travelers}}
{{/travelers}}{{#interests}}What they enjoy: {{interests}}
{{/interests}}Pace: {{pace}}

For each place, its area, its opening days and hours as the results give them (say not found otherwise), and whether to book ahead.

What to see:
{{sights_search.text}}

Where to stay:
{{areas_search.text}}`,
                outputs: [
                  {
                    id: 'areas',
                    label: 'Areas to stay in',
                    type: 'table',
                    columns: [{ id: 'area', label: 'Area', type: 'text' }, { id: 'why', label: 'Why', type: 'text' }, { id: 'good_for', label: 'Good for', type: 'text' }],
                  },
                  {
                    id: 'sights',
                    label: 'Places to visit',
                    type: 'table',
                    columns: [{ id: 'name', label: 'Place', type: 'text' }, { id: 'area', label: 'Area', type: 'text' }, { id: 'hours', label: 'Open', type: 'text' }, { id: 'book', label: 'Book ahead', type: 'text' }],
                  },
                ],
              },
            ],
            [
              { id: 'transport_search', title: 'Search for getting around', do: 'tool', tool: 'web_search', with: { query: '{{destination}} public transport pass from the airport to the centre', k: 6 }, failed: 'skip' },
              {
                id: 'transport',
                title: 'Getting there and around',
                do: 'model',
                instructions: `From the search results below, say how visitors get from the airport or the main station into {{destination}}, how they get around (passes, tickets, what they cost), and the local currency.

{{transport_search.text}}`,
                outputs: [
                  { id: 'arrival', label: 'Getting in', type: 'text' },
                  { id: 'around', label: 'Getting around', type: 'text' },
                  { id: 'currency', label: 'Currency', type: 'text', description: 'The local currency’s code, like EUR' },
                ],
              },
            ],
          ],
        },
        {
          id: 'choices',
          title: 'Ask what you would like',
          do: 'ask',
          if: someoneThere('choose'),
          question: 'This is what the research found for {{destination}}, {{calendar.first}} to {{calendar.last}}.\n\nAreas to stay in:\n{{places.areas}}\n\nWhat is on:\n{{whats_on.events}}\n\nWeather: {{weather.summary}}\n\nSay what you would like, or leave it all empty for the plan to choose.',
          fields: [
            { id: 'stay', label: 'Where you’d like to stay', type: 'text' },
            { id: 'must', label: 'Must be in the plan', type: 'long' },
            { id: 'skip', label: 'Leave out', type: 'long' },
          ],
          waitHours: 24,
          failed: 'skip',
        },
        {
          id: 'plan',
          title: 'Plan the days',
          do: 'agent',
          instructions: `Plan a {{calendar.count}}-day trip to {{destination}}, from {{calendar.first}} to {{calendar.last}}, from the research below. Check on the web what it leaves open about the places you put in the plan (their opening days and hours on those dates, what to book), and keep to what you find.

The days:
{{calendar.dates}}

{{#travelers}}Travelers: {{travelers}}
{{/travelers}}{{#budget}}Budget: {{budget}}
{{/budget}}{{#interests}}What they enjoy: {{interests}}
{{/interests}}Pace: {{pace}}
{{#choices.stay}}Where they want to stay: {{choices.stay}}
{{/choices.stay}}{{#choices.must}}Must be in the plan: {{choices.must}}
{{/choices.must}}{{#choices.skip}}Leave out: {{choices.skip}}
{{/choices.skip}}
What is on:
{{whats_on.events}}
Public holidays: {{whats_on.holidays}}
Closures: {{whats_on.closures}}

Weather: {{weather.summary}} {{weather.temperatures}} {{weather.rain}}

Areas to stay in:
{{places.areas}}

Places to visit:
{{places.sights}}

Getting in: {{transport.arrival}}
Getting around: {{transport.around}}

How to plan:
- Keep each day to one or two areas, so the distances are short; give rough travel times and how to get around (on foot, transit, car).
- Put each place on a day it is open: mind each date's weekday, the holidays and the closures.
- Plan the meals too: a specific place or a good area to eat, within the budget.
- Match the pace: relaxed means two or three things a day with time to wander; packed fits more in. Suit it to the travelers (children, mobility, interests).
- Say what should be booked ahead, and how far ahead.
- Estimate the costs in the local currency as numbers (a low and a high for each item); the total is added up after.
- Give each day's area its latitude and longitude (its centre, as a map gives them), for the trip's map.
- Name each day's main sight by its own name (or its area, on a day without one), for the day's picture.
Hand in one row of the itinerary per day, in order.`,
          outputs: [
            { id: 'overview', label: 'Overview', type: 'markdown', required: true, description: 'The trip in a few sentences: the idea of the plan, where to stay, the weather to expect' },
            {
              id: 'itinerary',
              label: 'Day by day',
              type: 'table',
              required: true,
              columns: [
                { id: 'day', label: 'Day', type: 'number' },
                { id: 'area', label: 'Area', type: 'text' },
                { id: 'sight', label: 'Main sight', type: 'text', description: 'By its own name, for the day’s picture' },
                { id: 'morning', label: 'Morning', type: 'text' },
                { id: 'afternoon', label: 'Afternoon', type: 'text' },
                { id: 'evening', label: 'Evening', type: 'text' },
                { id: 'lat', label: 'Latitude', type: 'number', description: 'Of the day’s area' },
                { id: 'lng', label: 'Longitude', type: 'number', description: 'Of the day’s area' },
              ],
            },
            { id: 'book_ahead', label: 'Book ahead', type: 'list', description: 'What to book, and how far ahead' },
            {
              id: 'costs',
              label: 'Costs',
              type: 'table',
              description: 'Each item with a low and a high estimate, in the local currency',
              columns: [{ id: 'item', label: 'Item', type: 'text' }, { id: 'low', label: 'Low', type: 'number' }, { id: 'high', label: 'High', type: 'number' }, { id: 'note', label: 'Note', type: 'text' }],
            },
            { id: 'currency', label: 'Currency', type: 'text', description: 'The local currency’s code, like EUR' },
            { id: 'home', label: 'Travelers’ currency', type: 'text', description: 'The travelers’ own currency’s code, only when the budget is clearly in a different one' },
            { id: 'rate', label: 'Rate', type: 'number', description: 'What one of the local currency is worth in the travelers’ own, when that is given' },
            { id: 'tips', label: 'Tips', type: 'list', description: 'Getting in from the airport or station, transport passes, money, safety, and what to pack for the weather' },
          ],
        },
        { id: 'media', title: 'Find a picture for each day', do: 'tool', tool: 'find_media', with: { items: '{{plan.itinerary}}', name: 'sight', kind: 'in {{destination}}' }, failed: 'skip' },
        {
          id: 'assemble',
          title: 'Put the plan together',
          do: 'code',
          language: 'javascript',
          with: { dates: '{{calendar.dates}}', itinerary: '{{plan.itinerary}}', media: '{{media.data}}', costs: '{{plan.costs}}', currency: '{{plan.currency}}', home: '{{plan.home}}', rate: '{{plan.rate}}' },
          code:
            LIST +
            String.raw`// The day-by-day table on the trip's own dates, each day with its main sight's picture, and the budget with its total
// added up (in the travelers' own currency too, when the plan gives a rate).
const dates = rows(input.dates);
// The pictures came in the order of the itinerary's rows, as it was handed in.
const all = list(input.itinerary);
const plan = rows(all);
const media = list(input.media && input.media.items);
// A day's picture when it is a photo: a drawing (a map of where it is, a flag, a crest) is left out.
const pictureOf = (r) => {
  const m = media[all.indexOf(r)];
  const src = m && typeof m === 'object' ? String(m.picture || '') : '';
  let file = '';
  try {
    file = decodeURIComponent(new URL(src).pathname.split('/').pop());
  } catch (e) {}
  const drawn = /\.svg\b|(^|[_\-\s(])(map|maps|locator|location|flag|coat_of_arms|emblem|seal|dimos)([_\-\s.)]|$)/i.test(file);
  return file && !drawn && /^https?:\/\/\S+$/.test(src) ? src : null;
};
const days = dates.map((d, i) => {
  const r = plan.find((x) => Number(x.day) === Number(d.day)) || plan[i] || {};
  return { day: d.day, date: d.date, area: r.area || '', sight: r.sight || '', morning: r.morning || '', afternoon: r.afternoon || '', evening: r.evening || '', picture: pictureOf(r) };
});
const num = (v) => {
  const n = Number(String(v === null || v === undefined ? '' : v).replace(/[^\d.\-]/g, ''));
  return isFinite(n) ? n : 0;
};
const money = (n, c) => Math.round(n).toLocaleString('en-US') + (c ? ' ' + c : '');
const range = (a, b, c) => (b > a ? money(a, '') + '–' + money(b, c) : money(a, c));
const cur = String(input.currency || '').trim();
let low = 0;
let high = 0;
const budget = rows(input.costs)
  .filter((c) => c.item)
  .map((c) => {
    const a = num(c.low);
    const b = Math.max(num(c.high), a);
    low += a;
    high += b;
    return { item: String(c.item), estimate: range(a, b, cur) + (c.note ? ' (' + c.note + ')' : '') };
  });
const rate = num(input.rate);
const home = String(input.home || '').trim();
if (budget.length) budget.push({ item: 'Total', estimate: range(low, high, cur) + (rate > 0 && home && home !== cur ? ' (about ' + range(low * rate, high * rate, home) + ')' : '') });
// The days' areas on the map: those with a place on Earth, none far (over 400 km) from the others' middle.
const at = days.map((d, i) => {
  const r = plan.find((x) => Number(x.day) === Number(d.day)) || plan[i] || {};
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  return { day: d.day, date: d.date, area: d.area, lat, lng };
}).filter((s) => r0(s.lat, 90) && r0(s.lng, 180));
function r0(v, most) {
  return v !== 0 && isFinite(v) && Math.abs(v) <= most;
}
const mid = (k) => at.map((s) => s[k]).sort((a, b) => a - b)[Math.floor(at.length / 2)];
const far = (s) => Math.hypot((s.lat - mid('lat')) * 111, (s.lng - mid('lng')) * 111 * Math.cos((s.lat * Math.PI) / 180)) > 400;
return { days, budget, stops: at.filter((s) => !far(s)) };`,
          outputs: [
            { id: 'days', label: 'Day by day', type: 'table', columns: TRIP_DAYS },
            { id: 'budget', label: 'Budget', type: 'table', columns: [{ id: 'item', label: 'Item', type: 'text' }, { id: 'estimate', label: 'Estimate', type: 'text' }] },
            { id: 'stops', label: 'On the map', type: 'table', columns: TRIP_STOPS },
          ],
          failed: 'agent',
        },
      ],
      outputs: { overview: '{{plan.overview}}', days: '{{assemble.days}}', book_ahead: '{{plan.book_ahead}}', budget: '{{assemble.budget}}', tips: '{{plan.tips}}', stops: '{{assemble.stops}}' },
    },
    answer: [
      { id: 'overview', label: 'Overview', type: 'markdown', required: true, description: 'The trip in a few sentences: the idea of the plan, where to stay, the weather to expect' },
      { id: 'days', label: 'Day by day', type: 'table', required: true, columns: TRIP_DAYS },
      { id: 'book_ahead', label: 'Book ahead', type: 'list', description: 'What to book, and how far ahead' },
      {
        id: 'budget',
        label: 'Budget',
        type: 'table',
        columns: [
          { id: 'item', label: 'Item', type: 'text' },
          { id: 'estimate', label: 'Estimate', type: 'text' },
        ],
      },
      { id: 'tips', label: 'Tips', type: 'list' },
      { id: 'stops', label: 'On the map', type: 'table', description: 'Each day’s area, with where it is', columns: TRIP_STOPS },
    ],
    examples: [
      { id: 'lisbon-in-spring', name: 'Lisbon in spring', inputs: { destination: 'Lisbon', start: '2027-04-12', days: 4, travelers: 'Two adults', interests: 'Food markets, viewpoints, tiles' }, checks: ['{{answer.days}} is not empty', '{{answer.budget}} is not empty', '{{media.data.pictures}} > 0'] },
      { id: 'a-family-trip', name: 'A relaxed family trip', inputs: { destination: 'Copenhagen', start: '2027-07-05', days: 3, travelers: 'Two adults and a six-year-old', pace: 'Relaxed' }, checks: ['{{calendar.count}} = 3'] },
    ],
  },
  {
    id: 'compare-products',
    name: 'Compare products',
    icon: 'scale',
    color: 'orange',
    category: 'Shopping',
    description: 'Current prices, independent reviews and known problems, weighed against what matters to you, with a clear pick.',
    fields: [
      { id: 'products', label: 'What to compare', type: 'long', required: true, placeholder: 'Name the products, one per line, or describe what you need: e.g. a quiet dishwasher under $900' },
      { id: 'needs', label: 'What matters to you', type: 'long', required: true, placeholder: 'e.g. Quiet, reliable, fits a 60 cm space, enough for a family of four' },
      { id: 'budget', label: 'Budget', type: 'text' },
      { id: 'region', label: 'Where you’ll buy', type: 'text', placeholder: 'e.g. Germany, or online in the US' },
      { id: 'choose', label: 'Let me pick which ones to compare', type: 'yesno', help: 'When you describe a need, the run waits for you to pick from the options it finds' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'understand',
          title: 'Understand what you need',
          do: 'model',
          instructions: `Someone wants help choosing between products. Read what they wrote.

What to compare: {{products}}
What matters to them: {{needs}}
{{#budget}}Budget: {{budget}}
{{/budget}}{{#region}}Buying in: {{region}}
{{/region}}
Say whether they named the products to compare, or described a need instead. List the products they named, each as exactly as they can be told apart (brand and model), and say what kind of product they are in a word or two (headphones, a dishwasher), for their pictures. Turn what matters to them into three to six criteria, each weighted from 1 (nice to have) to 5 (a must), with what a good score looks like. If they described a need, write a web search query to find the strongest current options for it; today is {{today}}, so put the year in it.`,
          outputs: [
            { id: 'named', label: 'Products named', type: 'yesno', required: true },
            { id: 'products', label: 'Products', type: 'list' },
            { id: 'kind', label: 'What they are', type: 'text', description: 'The kind of product, in a word or two' },
            {
              id: 'criteria',
              label: 'Criteria',
              type: 'table',
              required: true,
              columns: [{ id: 'criterion', label: 'Criterion', type: 'text' }, { id: 'weight', label: 'Weight', type: 'number' }, { id: 'good', label: 'What good looks like', type: 'text' }],
            },
            { id: 'query', label: 'Search for options', type: 'text' },
          ],
        },
        {
          id: 'find',
          title: 'A need, not products?',
          do: 'decide',
          rule: '{{understand.named}} = no',
          then: [
            { id: 'options_search', title: 'Search for the options', do: 'tool', tool: 'web_search', with: { query: '{{understand.query}}', k: 10 }, failed: 'agent' },
            {
              id: 'options',
              title: 'Pick the strongest options',
              do: 'model',
              instructions: `From the search results below, pick the three to five strongest options on sale now for this need, each as brand and model, preferring those independent reviews rate well. Leave out models that have been replaced.

The need: {{products}}
What matters: {{needs}}
{{#budget}}Budget: {{budget}}
{{/budget}}
{{options_search.text}}`,
              outputs: [
                { id: 'products', label: 'Products', type: 'list', required: true },
                { id: 'why', label: 'Why each', type: 'table', columns: [{ id: 'product', label: 'Product', type: 'text' }, { id: 'why', label: 'Why', type: 'text' }] },
              ],
            },
            {
              id: 'pick',
              title: 'Ask which to compare',
              do: 'ask',
              if: someoneThere('choose'),
              question: 'These look like the strongest options for you:\n\n{{options.why}}\n\nWhich should be compared?',
              fields: [{ id: 'products', label: 'The ones to compare, one per line', type: 'long', help: 'Leave it empty to compare them all' }],
              waitHours: 24,
              failed: 'skip',
            },
          ],
        },
        {
          id: 'shortlist',
          title: 'The products to compare',
          do: 'code',
          language: 'javascript',
          with: { named: '{{understand.named}}', products: '{{understand.products}}', options: '{{options.products}}', picked: '{{pick.products}}', text: '{{products}}' },
          code:
            LIST +
            String.raw`// The products to compare: those named, or those picked from the options found (all of them, when none were
// picked); each once, five at most.
const named = input.named === true || /^(yes|true)$/i.test(String(input.named));
let items = named ? list(input.products) : list(input.picked).length ? list(input.picked) : list(input.options);
if (!items.length) items = list(input.text);
const seen = new Set();
items = items
  .map((x) => String(x).trim())
  .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
  .slice(0, 5);
if (!items.length) throw new Error('There is nothing to compare: name the products, or describe what you need');
return { items, count: items.length };`,
          outputs: [
            { id: 'items', label: 'Products', type: 'list' },
            { id: 'count', label: 'How many', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'each',
          title: 'Look into each one',
          do: 'repeat',
          over: '{{shortlist.items}}',
          atOnce: 3,
          as: 'product',
          collect: 'facts',
          steps: [
            { id: 'prices', title: 'Search for prices', do: 'tool', tool: 'web_search', with: { query: '{{product}} price{{#region}} {{region}}{{/region}}', k: 8 }, failed: 'skip' },
            { id: 'reviews', title: 'Search for reviews', do: 'tool', tool: 'web_search', with: { query: '{{product}} review long-term reliability problems', k: 8 }, failed: 'skip' },
            {
              id: 'best',
              title: 'Pick an independent review',
              do: 'code',
              language: 'javascript',
              with: { product: '{{product}}', reviews: '{{reviews}}', prices: '{{prices}}' },
              code:
                HITS +
                String.raw`// The most independent review among the results (testers' and owners' reports before shops, and before the
// maker's own site), and the price results as lines.
const brand = String(input.product || '').toLowerCase().split(/\s+/)[0] || '';
const SHOPS = /(^|\.)(amazon|ebay|walmart|bestbuy|target|argos|currys|johnlewis|mediamarkt|saturn|otto|fnac|darty|boulanger|elgiganten|bol|coolblue|newegg|bhphotovideo|costco|homedepot|lowes|aliexpress|temu|idealo|pricerunner)\.[a-z.]+$/;
const TESTERS = /(^|\.)(rtings\.com|which\.co\.uk|consumerreports\.org|nytimes\.com|techradar\.com|tomsguide\.com|cnet\.com|theverge\.com|engadget\.com|pcmag\.com|notebookcheck\.net|dpreview\.com|soundguys\.com|whathifi\.com|choice\.com\.au|test\.de|tweakers\.net|quechoisir\.org|consumentenbond\.nl|goodhousekeeping\.com|reviewed\.com)$/;
const score = (h) => {
  const s = siteOf(h.url);
  return (TESTERS.test(s) ? 10 : 0) - (SHOPS.test(s) ? 8 : 0) - (brand.length > 2 && s.includes(brand) ? 6 : 0) - h.rank;
};
const best = hitsOf(input.reviews).sort((a, b) => score(b) - score(a))[0];
const shops = hitsOf(input.prices)
  .slice(0, 8)
  .map((h) => '- ' + h.title + ' (' + siteOf(h.url) + ', ' + h.url + ')' + (h.snippet ? ': ' + h.snippet : ''))
  .join('\n');
return { url: best ? best.url : '', title: best ? best.title : '', shops };`,
              outputs: [{ id: 'url', label: 'Review', type: 'url' }, { id: 'title', label: 'Its title', type: 'text' }, { id: 'shops', label: 'Prices found', type: 'markdown' }],
              failed: 'skip',
            },
            {
              id: 'review',
              title: 'Read the review',
              do: 'tool',
              tool: 'read_page',
              if: '{{best.url}} is not empty',
              with: { url: '{{best.url}}', question: 'Strengths, weaknesses, reliability and known problems of {{product}}' },
              failed: 'skip',
            },
            {
              id: 'facts',
              title: 'Sum it up and score it',
              do: 'model',
              instructions: `Sum up {{product}} for someone choosing, from the results below: today is {{today}}. Prefer independent testers and long-term owners to the maker's claims, and say when something could not be confirmed.

What matters to them, with weights:
{{understand.criteria}}

Prices{{#region}} in {{region}}{{/region}}:
{{best.shops}}

{{#review.text}}A review ({{best.url}}):
{{review.text}}

{{/review.text}}Other reviews:
{{reviews.text}}

- price: the current price from a real shop or the maker, with the shop and today's date, or "not found".
- link: the address of the shop or the maker's page that price comes from, as written in the results.
- scores: each criterion above, scored from 1 (poor) to 5 (excellent) for this product, with why in a few words.`,
              outputs: [
                { id: 'product', label: 'Product', type: 'text', required: true },
                { id: 'price', label: 'Price', type: 'text' },
                { id: 'link', label: 'Link', type: 'text' },
                { id: 'strengths', label: 'Strengths', type: 'text' },
                { id: 'weaknesses', label: 'Weaknesses', type: 'text' },
                { id: 'problems', label: 'Known problems', type: 'text' },
                { id: 'status', label: 'Still sold', type: 'text', description: 'On sale now, or replaced by a newer model (which)' },
                { id: 'best_for', label: 'Best for', type: 'text' },
                {
                  id: 'scores',
                  label: 'Scores',
                  type: 'table',
                  columns: [{ id: 'criterion', label: 'Criterion', type: 'text' }, { id: 'score', label: 'Score', type: 'number' }, { id: 'why', label: 'Why', type: 'text' }],
                },
              ],
            },
          ],
        },
        { id: 'media', title: 'Find their pictures', do: 'tool', tool: 'find_media', with: { items: '{{each.items}}', name: 'product', page: 'link', kind: '{{understand.kind}}' }, failed: 'skip' },
        {
          id: 'score',
          title: 'Weigh them up',
          do: 'code',
          language: 'javascript',
          with: { criteria: '{{understand.criteria}}', facts: '{{each.items}}', products: '{{shortlist.items}}', media: '{{media.data}}' },
          code:
            LIST +
            String.raw`// Each product's score against what matters (out of 100, by the criteria's weights), the pick and a runner-up for
// another priority (cheaper, when one nearly as good is), and the table to compare them by, best first, each with its
// picture.
const criteria = rows(input.criteria).filter((c) => c.criterion);
const facts = list(input.facts);
const names = list(input.products);
const media = list(input.media && input.media.items);
const priceOf = (t) => {
  const m = /\d[\d.,]*/.exec(String(t || ''));
  if (!m) return null;
  let s = m[0].replace(/[.,]$/, '');
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) s = dot > comma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  else if (comma >= 0) s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) && n > 0 ? n : null;
};
const weight = (c) => Math.max(1, Math.min(5, Number(c.weight) || 3));
const all = names.map((name, i) => {
  const f = facts[i] && typeof facts[i] === 'object' ? facts[i] : {};
  const given = rows(f.scores);
  let got = 0;
  let most = 0;
  const cells = criteria.map((c, j) => {
    const s = given.find((x) => String(x.criterion || '').toLowerCase() === String(c.criterion).toLowerCase()) || given[j] || {};
    const v = Math.max(0, Math.min(5, Number(s.score) || 0));
    got += weight(c) * v;
    most += weight(c) * 5;
    return v;
  });
  return { product: String(f.product || name), total: most ? Math.round((1000 * got) / most) / 10 : 0, cells, price: priceOf(f.price), f, m: media[i] && typeof media[i] === 'object' ? media[i] : {} };
});
const ranked = all.slice().sort((a, b) => b.total - a.total || (a.price || Infinity) - (b.price || Infinity));
const top = ranked[0];
const next = ranked[1];
const cheaper = ranked.slice(1).filter((r) => r.price && top && top.price && r.price < top.price && r.total >= top.total - 15).sort((a, b) => a.price - b.price)[0];
const runner = cheaper || next;
const cell = (t) => String(t).replace(/\|/g, '/');
const matrix = [
  '| Product | ' + criteria.map((c) => cell(c.criterion) + ' (×' + weight(c) + ')').join(' | ') + ' | Score |',
  '|' + ' --- |'.repeat(criteria.length + 2),
  ...ranked.map((r) => '| ' + cell(r.product) + ' | ' + r.cells.join(' | ') + ' | ' + r.total + ' |'),
].join('\n');
const link = (v) => {
  const s = String(v || '').trim();
  return /^https?:\/\/\S+$/.test(s) ? s : null;
};
const comparison = ranked.map((r) => ({
  product: r.product,
  score: r.total,
  price: r.f.price || '',
  strengths: r.f.strengths || '',
  weaknesses: [r.f.weaknesses, r.f.problems ? 'Known problems: ' + r.f.problems : ''].filter(Boolean).join(' '),
  best_for: r.f.best_for || '',
  link: link(r.f.link),
  picture: link(r.m.picture),
}));
return {
  matrix,
  pick: top ? top.product : '',
  runner_up: runner && runner !== top ? runner.product : '',
  runner_up_why: runner === cheaper && cheaper ? 'cheaper, and nearly as good' : 'the next best overall',
  close: !!(top && next && top.total - next.total < 5),
  comparison,
};`,
          outputs: [
            { id: 'matrix', label: 'Scores', type: 'markdown' },
            { id: 'pick', label: 'Best score', type: 'text' },
            { id: 'runner_up', label: 'Runner-up', type: 'text' },
            { id: 'runner_up_why', label: 'Why the runner-up', type: 'text' },
            { id: 'close', label: 'Close call', type: 'yesno' },
            {
              id: 'comparison',
              label: 'Comparison',
              type: 'table',
              columns: [
                { id: 'product', label: 'Product', type: 'text' },
                { id: 'score', label: 'Score', type: 'number', description: 'Out of 100, by what matters to you' },
                { id: 'price', label: 'Price', type: 'text' },
                { id: 'strengths', label: 'Strengths', type: 'text' },
                { id: 'weaknesses', label: 'Weaknesses', type: 'text' },
                { id: 'best_for', label: 'Best for', type: 'text' },
                { id: 'link', label: 'Link', type: 'url' },
                { id: 'picture', label: 'Picture', type: 'image' },
              ],
            },
          ],
          failed: 'agent',
        },
        {
          id: 'verdict',
          title: 'Make the call',
          do: 'model',
          instructions: `Recommend one of these products to someone who cares about the criteria below, with a runner-up for a different priority (cheaper, or better at one thing). Be honest when the differences are small, and say what could not be confirmed.

What matters to them: {{needs}}
{{#budget}}Budget: {{budget}}
{{/budget}}Criteria and their weights:
{{understand.criteria}}

Scores out of 100, weighted by what matters:
{{score.matrix}}

The scores put {{score.pick}} first{{#score.runner_up}}, and {{score.runner_up}} as the runner-up ({{score.runner_up_why}}){{/score.runner_up}}.{{#score.close}} The top two are within five points of each other.{{/score.close}}

What was found about each:
{{score.comparison}}`,
          outputs: [
            { id: 'recommendation', label: 'Recommendation', type: 'text', required: true, description: 'The pick, in one sentence' },
            { id: 'pick', label: 'The pick', type: 'text', required: true, description: 'The product recommended: its name exactly as it is written in the list above' },
            { id: 'why', label: 'Why', type: 'markdown', required: true, description: 'The reasoning, against what matters to the user, and the runner-up' },
            { id: 'watch_out', label: 'Watch out for', type: 'list', description: 'Known problems, models about to be replaced, prices that vary' },
          ],
        },
      ],
      outputs: { recommendation: '{{verdict.recommendation}}', pick: '{{verdict.pick}}', why: '{{verdict.why}}', comparison: '{{score.comparison}}', watch_out: '{{verdict.watch_out}}' },
    },
    answer: [
      { id: 'recommendation', label: 'Recommendation', type: 'text', required: true, description: 'The pick, in one sentence' },
      { id: 'pick', label: 'The pick', type: 'text', description: 'The product recommended, by its name as the comparison lists it' },
      { id: 'why', label: 'Why', type: 'markdown', required: true, description: 'The reasoning, against what matters to the user, and the runner-up' },
      {
        id: 'comparison',
        label: 'Comparison',
        type: 'table',
        required: true,
        columns: [
          { id: 'product', label: 'Product', type: 'text' },
          { id: 'score', label: 'Score', type: 'number', description: 'Out of 100, by what matters to you' },
          { id: 'price', label: 'Price', type: 'text' },
          { id: 'strengths', label: 'Strengths', type: 'text' },
          { id: 'weaknesses', label: 'Weaknesses', type: 'text' },
          { id: 'best_for', label: 'Best for', type: 'text' },
          { id: 'link', label: 'Link', type: 'url' },
          { id: 'picture', label: 'Picture', type: 'image' },
        ],
      },
      { id: 'watch_out', label: 'Watch out for', type: 'list' },
    ],
    examples: [
      { id: 'named-products', name: 'Two named headphones', inputs: { products: 'Sony WH-1000XM5\nBose QuietComfort Ultra', needs: 'Noise cancelling on flights, comfort, battery', budget: '$400' }, checks: ['{{answer.comparison}} is not empty', '{{answer.pick}} is not empty', '{{media.data.pictures}} > 0'] },
      { id: 'a-need', name: 'A need, not products', inputs: { products: 'A quiet dishwasher under €900', needs: 'Quiet, reliable, fits 60 cm', region: 'Germany' }, checks: ['{{understand.named}} = no', '{{answer.comparison}} is not empty'] },
    ],
  },
  {
    id: 'document-qa',
    name: 'Document Q&A',
    icon: 'file-search',
    color: 'teal',
    category: 'Work',
    description: 'Answers from a document you give it, each with the exact passage and where it is.',
    fields: [
      { id: 'document', label: 'Document', type: 'file', required: true, help: 'A PDF, Word document, spreadsheet or text file' },
      { id: 'questions', label: 'Your questions', type: 'long', required: true, placeholder: 'One per line' },
    ],
    prompt: '',
    flow: {
      steps: [
        { id: 'read', title: 'Read the document', do: 'tool', tool: 'read_document', with: { path: '{{document}}', limit: 1000 }, failed: 'agent' },
        {
          id: 'rest',
          title: 'Plan the rest of it',
          do: 'code',
          language: 'javascript',
          with: { first: '{{read.text}}', per: 1000 },
          code: String.raw`// Where each of the parts after the first starts, when the document is longer than one read (the first part says
// how many lines it has); fifteen parts at most.
const head = /lines (\d+)\D+(\d+) of (\d+)/.exec(String(input.first || '').split('\n')[0]);
const per = Math.max(100, Number(input.per) || 1000);
const items = [];
if (head) for (let at = Number(head[2]) + 1; at <= Number(head[3]) && items.length < 15; at += per) items.push({ offset: at });
return { items, count: items.length, lines: head ? Number(head[3]) : null };`,
          outputs: [
            { id: 'items', label: 'Parts', type: 'table', columns: [{ id: 'offset', label: 'From line', type: 'number' }] },
            { id: 'count', label: 'How many', type: 'number' },
            { id: 'lines', label: 'Lines', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'more',
          title: 'Read the rest',
          do: 'repeat',
          over: '{{rest.items}}',
          atOnce: 3,
          as: 'part',
          steps: [{ id: 'part_text', title: 'Read a part', do: 'tool', tool: 'read_document', with: { path: '{{document}}', offset: '{{part.offset}}', limit: 1000 }, failed: 'skip' }],
        },
        {
          id: 'passages',
          title: 'Find the passages for each question',
          do: 'code',
          language: 'javascript',
          with: { first: '{{read.text}}', rest: '{{more.items}}', questions: '{{questions}}' },
          code:
            LIST +
            String.raw`// The document in passages of about a thousand characters, each with where it is (its page, sheet, slide or
// section, and its lines); and for each question the passages that share the most telling words with it, in the
// document's order (all of them, for a short document).
const texts = [input.first, ...list(input.rest).map((r) => r && r.text)].filter(Boolean).map(String);
const lines = [];
const seen = new Set();
for (const t of texts)
  for (const l of t.split('\n')) {
    const m = /^\s*(\d+)\t(.*)$/.exec(l);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      lines.push({ n: Number(m[1]), text: m[2] });
    }
  }
if (!lines.length) texts.join('\n').split('\n').forEach((text, i) => lines.push({ n: i + 1, text }));
lines.sort((a, b) => a.n - b.n);
const passages = [];
let page = '';
let section = '';
let cur = null;
const flush = () => {
  if (cur && cur.text.trim()) passages.push(cur);
  cur = null;
};
for (const l of lines) {
  const h = /^#{1,6}\s+(.*)$/.exec(l.text);
  if (h) {
    flush();
    const t = h[1].trim();
    if (/^(Page|Slide) \d+/.test(t)) page = t.toLowerCase().replace(/:.*$/, '');
    else if (/^Sheet: /.test(t)) page = 'sheet ' + t.slice(7);
    else section = t;
  }
  if (!cur) cur = { from: l.n, to: l.n, page, section, text: '' };
  cur.text += (cur.text ? '\n' : '') + l.text;
  cur.to = l.n;
  if ((cur.text.length > 1000 && !l.text.trim()) || cur.text.length > 1600) flush();
}
flush();
const where = (p) => [p.page, p.section ? '“' + p.section.slice(0, 60) + '”' : '', 'lines ' + p.from + (p.to > p.from ? '–' + p.to : '')].filter(Boolean).join(', ');
const show = (p) => '[' + where(p) + ']\n' + p.text;
let questions = String(input.questions || '').split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
if (questions.length === 1 && (questions[0].match(/\?/g) || []).length > 1) questions = questions[0].split(/(?<=\?)\s+/).filter(Boolean);
questions = questions.slice(0, 15);
const STOP = new Set('the a an and or of to in on for with by at from as is are was were be been it its this that these those what which who whom whose when where why how does do did can could should would will shall may might must not no yes you we they he she them our your their there here than then so if about into over under also only any each other all more most some such'.split(' '));
const words = (t) => (String(t).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, '') || w);
const docs = passages.map((p) => words(p.section + ' ' + p.text));
const df = {};
for (const d of docs) for (const w of new Set(d)) df[w] = (df[w] || 0) + 1;
const N = docs.length || 1;
const avg = docs.reduce((a, d) => a + d.length, 0) / N || 1;
const score = (q, i) => {
  const tf = {};
  for (const w of docs[i]) tf[w] = (tf[w] || 0) + 1;
  let s = 0;
  for (const w of new Set(q)) if (tf[w]) s += (Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5)) * tf[w] * 2.2) / (tf[w] + 1.2 * (0.25 + (0.75 * docs[i].length) / avg));
  return s;
};
const short = passages.reduce((a, p) => a + p.text.length, 0) <= 8000;
const items = questions.map((question) => {
  const q = words(question);
  const best = short ? passages.map((p, i) => i) : passages.map((p, i) => ({ i, s: score(q, i) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 5).map((x) => x.i).sort((a, b) => a - b);
  return { question, context: best.map((i) => show(passages[i])).join('\n\n') || '(No part of the document shares words with this question.)' };
});
const step = Math.max(1, Math.floor(passages.length / 6));
const sample = passages.filter((p, i) => i < 3 || i % step === 0).slice(0, 9);
const heads = [...new Set(passages.map((p) => p.section).filter(Boolean))].slice(0, 40);
const outline = (heads.length ? 'Its sections: ' + heads.join('; ') + '\n\n' : '') + sample.map(show).join('\n\n');
return { items, outline, count: passages.length };`,
          outputs: [
            { id: 'items', label: 'Questions with their passages', type: 'table', columns: [{ id: 'question', label: 'Question', type: 'text' }, { id: 'context', label: 'Passages', type: 'text' }] },
            { id: 'outline', label: 'Outline', type: 'markdown' },
            { id: 'count', label: 'Passages', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'both',
          title: 'Answer, and sum it up',
          do: 'parallel',
          branches: [
            [
              {
                id: 'answer',
                title: 'Answer each question',
                do: 'repeat',
                over: '{{passages.items}}',
                atOnce: 3,
                as: 'q',
                collect: 'one',
                steps: [
                  {
                    id: 'one',
                    title: 'Answer it from the passages',
                    do: 'model',
                    instructions: `Answer the question from these parts of a document alone, plainly and briefly. Quote the sentence or passage the answer rests on word for word, as it is written, and say where it is (its page, section or clause, and lines, as given in brackets before each part). If these parts do not answer it, say so (found: false) and leave the quote empty; don't fill the gap with outside knowledge or guesses.

Question: {{q.question}}

Parts of the document:
{{q.context}}`,
                    outputs: [
                      { id: 'answer', label: 'Answer', type: 'text', required: true },
                      { id: 'quote', label: 'Quote', type: 'text' },
                      { id: 'location', label: 'Where', type: 'text' },
                      { id: 'found', label: 'Answered', type: 'yesno', required: true },
                    ],
                    failed: 'skip',
                  },
                ],
              },
            ],
            [
              {
                id: 'about',
                title: 'Sum up the document',
                do: 'model',
                instructions: `Say briefly what this document is (its kind, who it is from or for, its date if it gives one) and what its main points are, from its sections and the parts of it below. Plain words, a short paragraph and a few points.

{{passages.outline}}`,
                outputs: [{ id: 'summary', label: 'About the document', type: 'markdown', required: true }],
              },
            ],
          ],
        },
        {
          id: 'tally',
          title: 'See what is answered',
          do: 'code',
          language: 'javascript',
          with: { questions: '{{passages.items}}', answers: '{{answer.items}}' },
          code:
            LIST +
            String.raw`// The answers in the questions' order, and the questions the passages did not answer.
const questions = rows(input.questions);
const got = list(input.answers);
const answers = questions.map((q, i) => {
  const a = got[i] && typeof got[i] === 'object' ? got[i] : {};
  return { question: q.question, answer: a.answer || '', quote: a.quote || '', location: a.location || '', found: a.found === true };
});
const items = answers.filter((a) => !a.found).map((a) => a.question);
return { answers, items, count: items.length };`,
          outputs: [
            {
              id: 'answers',
              label: 'Answers',
              type: 'table',
              columns: [
                { id: 'question', label: 'Question', type: 'text' },
                { id: 'answer', label: 'Answer', type: 'text' },
                { id: 'quote', label: 'Quote', type: 'text' },
                { id: 'location', label: 'Where', type: 'text' },
                { id: 'found', label: 'Answered', type: 'yesno' },
              ],
            },
            { id: 'items', label: 'Not answered', type: 'list' },
            { id: 'count', label: 'How many', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'again',
          title: 'Any question not answered?',
          do: 'decide',
          rule: '{{tally.count}} > 0',
          then: [
            {
              id: 'look',
              title: 'Look through all of it',
              do: 'agent',
              instructions: `Some questions about the document {{document}} were not answered from the passages picked for them by their words. Read the whole document (all pages, tables and appendices) and answer each from it alone: plainly and briefly, quoting the passage the answer rests on word for word, and saying where it is (page, section or clause). If the document does not answer one, say so; don't fill the gap with outside knowledge or guesses.

The questions:
{{tally.items}}`,
              outputs: [
                {
                  id: 'answers',
                  label: 'Answers',
                  type: 'table',
                  required: true,
                  columns: [
                    { id: 'question', label: 'Question', type: 'text' },
                    { id: 'answer', label: 'Answer', type: 'text' },
                    { id: 'quote', label: 'Quote', type: 'text' },
                    { id: 'location', label: 'Where', type: 'text' },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'final',
          title: 'Put the answers together',
          do: 'code',
          language: 'javascript',
          with: { answers: '{{tally.answers}}', missing: '{{tally.items}}', again: '{{look.answers}}' },
          code:
            LIST +
            String.raw`// The answers, in the questions' order: the agent's for those it looked for again, each found by the words of its
// question (or by its place, when the agent answered them all).
const again = rows(input.again);
const missing = list(input.missing).map(String);
const words = (t) => new Set(String(t || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
const like = (a, b) => {
  const x = words(a);
  const y = words(b);
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n / Math.max(1, x.size, y.size);
};
const used = new Set();
const theirs = (question) => {
  let best = 0;
  let at = -1;
  again.forEach((x, j) => {
    const s = like(x.question, question);
    if (!used.has(j) && s > best) [best, at] = [s, j];
  });
  if (at < 0 || best < 0.5) at = again.length === missing.length && !used.has(missing.indexOf(question)) ? missing.indexOf(question) : -1;
  if (at < 0) return null;
  used.add(at);
  return again[at];
};
const answers = rows(input.answers).map((r) => {
  if (r.found) return { question: r.question, answer: r.answer, quote: r.quote, location: r.location };
  const a = theirs(r.question);
  if (a) return { question: r.question, answer: a.answer || '', quote: a.quote || '', location: a.location || '' };
  return { question: r.question, answer: r.answer || 'The document does not say.', quote: '', location: '' };
});
return { answers };`,
          outputs: [
            {
              id: 'answers',
              label: 'Answers',
              type: 'table',
              columns: [
                { id: 'question', label: 'Question', type: 'text' },
                { id: 'answer', label: 'Answer', type: 'text' },
                { id: 'quote', label: 'Quote', type: 'text' },
                { id: 'location', label: 'Where', type: 'text' },
              ],
            },
          ],
          failed: 'agent',
        },
      ],
      outputs: { answers: '{{final.answers}}', summary: '{{about.summary}}' },
    },
    answer: [
      {
        id: 'answers',
        label: 'Answers',
        type: 'table',
        required: true,
        columns: [
          { id: 'question', label: 'Question', type: 'text' },
          { id: 'answer', label: 'Answer', type: 'text' },
          { id: 'quote', label: 'Quote', type: 'text' },
          { id: 'location', label: 'Where', type: 'text' },
        ],
      },
      { id: 'summary', label: 'About the document', type: 'markdown', required: true },
    ],
    examples: [
      { id: 'a-lease', name: 'Questions on a lease', inputs: { document: 'lease.pdf', questions: 'When does the lease end?\nHow much notice do I need to give?' }, checks: ['{{answer.answers}} is not empty'] },
    ],
  },
  {
    id: 'meeting-actions',
    name: 'Meeting notes to actions',
    icon: 'list-checks',
    color: 'green',
    category: 'Work',
    description: 'Decisions, action items with owners and dates, open questions, and a follow-up email, from raw notes.',
    fields: [
      { id: 'notes', label: 'Notes or transcript', type: 'long', required: true, placeholder: 'Paste them here' },
      { id: 'meeting', label: 'Meeting', type: 'text', placeholder: 'e.g. Weekly product sync' },
      { id: 'date', label: 'Date', type: 'date' },
      { id: 'attendees', label: 'Who was there', type: 'text' },
      { id: 'ask_owners', label: 'Ask me who takes what nobody took', type: 'yesno', help: 'The run waits for you to name owners for the actions the notes leave without one' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'parts',
          title: 'Split the notes',
          do: 'code',
          language: 'javascript',
          with: { notes: '{{notes}}' },
          code: String.raw`// The notes in parts a model reads whole (about 12,000 characters each), split between lines; short notes are one part.
const parts = [];
let cur = '';
const add = (piece) => {
  if (cur && cur.length + piece.length + 1 > 12000) {
    parts.push(cur);
    cur = '';
  }
  cur += (cur ? '\n' : '') + piece;
};
for (const l of String(input.notes || '').replace(/\r\n/g, '\n').split('\n')) for (let i = 0; i < Math.max(1, l.length); i += 12000) add(l.slice(i, i + 12000));
if (cur.trim()) parts.push(cur);
return { items: parts.map((text, i) => ({ where: parts.length > 1 ? ' (part ' + (i + 1) + ' of ' + parts.length + ')' : '', text })), count: parts.length };`,
          outputs: [
            { id: 'items', label: 'Parts', type: 'table', columns: [{ id: 'where', label: 'Which part', type: 'text' }, { id: 'text', label: 'Text', type: 'text' }] },
            { id: 'count', label: 'How many', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'extract',
          title: 'Pull out what was decided',
          do: 'repeat',
          over: '{{parts.items}}',
          atOnce: 3,
          as: 'part',
          steps: [
            {
              id: 'pull',
              title: 'Read a part',
              do: 'model',
              instructions: `Turn these meeting notes{{part.where}} into decisions and actions. Be faithful to the notes: add nothing that was not said.
{{#meeting}}Meeting: {{meeting}}
{{/meeting}}{{#attendees}}Attendees: {{attendees}}
{{/attendees}}
{{part.text}}

- summary: what this part of the meeting covered, in a few sentences.
- decisions: each decision that was made, one sentence each.
- actions: each action item: the task; who owns it, only when the notes say or clearly imply who (otherwise leave it empty); when it is due, in the notes' own words ("next Friday", "by the 15th"), or empty when they don't say; and notes.
- open_questions: the open questions, and anything left unresolved.`,
              outputs: [
                { id: 'summary', label: 'Summary', type: 'markdown' },
                { id: 'decisions', label: 'Decisions', type: 'list' },
                {
                  id: 'actions',
                  label: 'Actions',
                  type: 'table',
                  columns: [
                    { id: 'task', label: 'Task', type: 'text' },
                    { id: 'owner', label: 'Owner', type: 'text' },
                    { id: 'when', label: 'When, as said', type: 'text' },
                    { id: 'notes', label: 'Notes', type: 'text' },
                  ],
                },
                { id: 'open_questions', label: 'Open questions', type: 'list' },
              ],
            },
          ],
        },
        {
          id: 'due',
          title: 'Work out the due dates',
          do: 'code',
          language: 'python',
          with: { parts: '{{extract.items}}', date: '{{date}}', today: '{{today}}' },
          code: String.raw`# Brings the parts' findings together, each once, and turns when each action is due, in the notes' own words, into a
# date: counted from the meeting's date, or from today when it has none. "Friday" or "by Friday" is the coming one,
# "next Friday" the one in the week after; words it cannot read stay in the action's notes.
import json
import re
from datetime import date, timedelta

def items(v):
    if isinstance(v, str) and v.strip().startswith('['):
        try:
            v = json.loads(v)
        except ValueError:
            return []
    return v if isinstance(v, list) else []

def key(t):
    return re.sub(r'\W+', ' ', str(t or '').lower()).strip()

try:
    base = date.fromisoformat(str(input.get('date') or input.get('today') or '')[:10])
except ValueError:
    base = date.today()

WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
NUMBERS = {'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10}

def month_end(d):
    return date(d.year + d.month // 12, d.month % 12 + 1, 1) - timedelta(days=1)

def add_months(d, n):
    y, m = divmod(d.month - 1 + n, 12)
    first = date(d.year + y, m + 1, 1)
    return min(first + timedelta(days=d.day - 1), month_end(first))

def due(words):
    t = ' ' + str(words or '').lower() + ' '
    if not t.strip():
        return None
    m = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', t)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    if re.search(r'\b(today|tonight|end of (the )?day|eod)\b', t):
        return base
    if 'tomorrow' in t:
        return base + timedelta(days=1)
    m = re.search(r'\bin (\d+|' + '|'.join(NUMBERS) + r') (day|week|month)s?\b', t)
    if m:
        n = int(m.group(1)) if m.group(1).isdigit() else NUMBERS[m.group(1)]
        if m.group(2) == 'day':
            return base + timedelta(days=n)
        if m.group(2) == 'week':
            return base + timedelta(weeks=n)
        return add_months(base, n)
    if re.search(r'\bnext week\b', t):
        return base + timedelta(days=7 - base.weekday())
    if re.search(r'\b(end of (the )?week|this week)\b', t):
        return base + timedelta(days=(4 - base.weekday()) % 7)
    if re.search(r'\bnext month\b', t):
        return month_end(base) + timedelta(days=1)
    if re.search(r'\b(end of (the )?month|this month)\b', t):
        return month_end(base)
    for i, name in enumerate(WEEKDAYS):
        m = re.search(r'\b(next )?' + name[:3] + '(' + name[3:] + r')?\b', t)
        if m:
            if m.group(1):
                return base + timedelta(days=7 - base.weekday() + i)
            return base + timedelta(days=(i - base.weekday()) % 7 or 7)
    names = '|'.join(MONTHS)
    m = re.search(r'\b(\d{1,2})(?:st|nd|rd|th)?(?: of)? (' + names + r')[a-z]*\b', t) or re.search(r'\b(' + names + r')[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?\b', t)
    if m:
        a, b = m.group(1), m.group(2)
        day, month = (int(a), b) if a.isdigit() else (int(b), a)
        try:
            d = date(base.year, MONTHS.index(month[:3]) + 1, day)
            return d if d >= base - timedelta(days=31) else date(base.year + 1, d.month, d.day)
        except ValueError:
            return None
    m = re.search(r'\b(?:the )?(\d{1,2})(?:st|nd|rd|th)\b', t)
    if m:
        try:
            d = base.replace(day=int(m.group(1)))
            return d if d >= base else (month_end(base) + timedelta(days=1)).replace(day=int(m.group(1)))
        except ValueError:
            return None
    return None

NOBODY = {'', 'unknown', 'tbd', 'tba', 'n/a', 'none', 'nobody', 'unassigned', '-', '?'}
seen = set()
summaries, decisions, actions, questions = [], [], [], []
for p in items(input.get('parts')):
    if not isinstance(p, dict):
        continue
    if p.get('summary'):
        summaries.append(str(p['summary']).strip())
    for d in items(p.get('decisions')):
        if key(d) and ('d' + key(d)) not in seen:
            seen.add('d' + key(d))
            decisions.append(str(d).strip())
    for q in items(p.get('open_questions')):
        if key(q) and ('q' + key(q)) not in seen:
            seen.add('q' + key(q))
            questions.append(str(q).strip())
    for a in items(p.get('actions')):
        if not isinstance(a, dict) or not key(a.get('task')) or ('a' + key(a.get('task'))) in seen:
            continue
        seen.add('a' + key(a.get('task')))
        said = str(a.get('when') or '').strip()
        when = due(said)
        owner = str(a.get('owner') or '').strip()
        notes = str(a.get('notes') or '').strip()
        if said and not when:
            notes = (notes + ' ' if notes else '') + '(Due: ' + said + ')'
        actions.append({'task': str(a['task']).strip(), 'owner': '' if owner.lower() in NOBODY else owner, 'due': when.isoformat() if when else None, 'notes': notes})
nobody = [a['task'] for a in actions if not a['owner']]
return {'summary': '\n\n'.join(summaries), 'decisions': decisions, 'actions': actions, 'open_questions': questions, 'unowned': len(nobody), 'nobody': nobody, 'from': base.isoformat()}`,
          outputs: [
            { id: 'summary', label: 'What was covered', type: 'markdown' },
            { id: 'decisions', label: 'Decisions', type: 'list' },
            {
              id: 'actions',
              label: 'Actions',
              type: 'table',
              columns: [{ id: 'task', label: 'Task', type: 'text' }, { id: 'owner', label: 'Owner', type: 'text' }, { id: 'due', label: 'Due', type: 'date' }, { id: 'notes', label: 'Notes', type: 'text' }],
            },
            { id: 'open_questions', label: 'Open questions', type: 'list' },
            { id: 'unowned', label: 'Without an owner', type: 'number' },
            { id: 'nobody', label: 'Actions nobody took', type: 'list' },
            { id: 'from', label: 'Dates counted from', type: 'date' },
          ],
          failed: 'agent',
        },
        {
          id: 'owners',
          title: 'Any action without an owner?',
          do: 'decide',
          rule: '{{due.unowned}} > 0',
          then: [
            {
              id: 'who',
              title: 'Ask who takes them',
              do: 'ask',
              if: someoneThere('ask_owners'),
              question: 'Nobody took these actions in the notes:\n\n{{due.nobody}}\n\nWho takes each? One name a line, in the same order (an empty line leaves it open).',
              fields: [{ id: 'owners', label: 'Owners, one a line', type: 'long' }],
              waitHours: 24,
              failed: 'skip',
            },
          ],
        },
        {
          id: 'assign',
          title: 'Put the owners in',
          do: 'code',
          language: 'javascript',
          with: { actions: '{{due.actions}}', owners: '{{who.owners}}' },
          code:
            LIST +
            String.raw`// The owners named in answer to the question, put on the actions nobody took, in the same order.
const names = String(input.owners || '').split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim());
let n = 0;
const actions = rows(input.actions).map((a) => (a.owner ? a : { ...a, owner: names[n++] || '' }));
return { actions, open: actions.filter((a) => !a.owner).map((a) => a.task) };`,
          outputs: [
            {
              id: 'actions',
              label: 'Actions',
              type: 'table',
              columns: [{ id: 'task', label: 'Task', type: 'text' }, { id: 'owner', label: 'Owner', type: 'text' }, { id: 'due', label: 'Due', type: 'date' }, { id: 'notes', label: 'Notes', type: 'text' }],
            },
            { id: 'open', label: 'Still without an owner', type: 'list' },
          ],
          failed: 'agent',
        },
        {
          id: 'write_up',
          title: 'Write it up',
          do: 'model',
          instructions: `Write up this meeting from what was pulled out of its notes: a summary of a few sentences, and a short, friendly follow-up email to the attendees with the decisions, the actions (who does what, by when) and the open questions{{#assign.open}}, asking who takes the actions still without an owner{{/assign.open}}. Plain words, nothing that is not below, in the language of the notes.
{{#meeting}}Meeting: {{meeting}}
{{/meeting}}{{#date}}Date: {{date}}
{{/date}}{{#attendees}}Attendees: {{attendees}}
{{/attendees}}
What it covered:
{{due.summary}}

Decisions:
{{due.decisions}}

Actions:
{{assign.actions}}

Open questions:
{{due.open_questions}}`,
          outputs: [
            { id: 'summary', label: 'Summary', type: 'markdown', required: true },
            { id: 'email', label: 'Follow-up email', type: 'markdown', required: true, description: 'With its subject line first' },
          ],
        },
      ],
      outputs: { summary: '{{write_up.summary}}', decisions: '{{due.decisions}}', actions: '{{assign.actions}}', open_questions: '{{due.open_questions}}', email: '{{write_up.email}}' },
    },
    answer: [
      { id: 'summary', label: 'Summary', type: 'markdown', required: true },
      { id: 'decisions', label: 'Decisions', type: 'list' },
      {
        id: 'actions',
        label: 'Actions',
        type: 'table',
        required: true,
        columns: [
          { id: 'task', label: 'Task', type: 'text' },
          { id: 'owner', label: 'Owner', type: 'text' },
          { id: 'due', label: 'Due', type: 'date' },
          { id: 'notes', label: 'Notes', type: 'text' },
        ],
      },
      { id: 'open_questions', label: 'Open questions', type: 'list' },
      { id: 'email', label: 'Follow-up email', type: 'markdown' },
    ],
    examples: [
      { id: 'weekly-sync', name: 'A weekly sync', inputs: { notes: 'Ana: launch moves to the 20th. Ben will update the pricing page by Friday. We agreed to drop the beta badge. Open: who talks to legal?', meeting: 'Weekly product sync', date: '2026-11-02', attendees: 'Ana, Ben, Chris' }, checks: ['{{answer.actions}} is not empty', '{{answer.decisions}} is not empty'] },
    ],
  },
  {
    id: 'cover-letter',
    name: 'Cover letter',
    icon: 'pen-line',
    color: 'pink',
    category: 'Writing',
    description: 'A letter for one job, built on real evidence from your background, with the gaps named honestly.',
    fields: [
      { id: 'job', label: 'The job', type: 'long', required: true, placeholder: 'Paste the posting, or its address' },
      { id: 'background', label: 'Your background', type: 'long', required: true, placeholder: 'Paste your CV, or a few lines about your experience' },
      { id: 'company', label: 'What you know about the company', type: 'long' },
      { id: 'tone', label: 'Tone', type: 'choice', options: ['Warm', 'Confident', 'Formal'], default: 'Confident' },
      { id: 'length', label: 'Length', type: 'choice', options: ['Short', 'Standard'], default: 'Standard', help: 'Short is about 200 words, standard about 350' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'source',
          title: 'An address, or the posting?',
          do: 'code',
          language: 'javascript',
          with: { job: '{{job}}', length: '{{length}}' },
          code: String.raw`// Whether the job is given as an address to read or pasted as text, and how many words the letter should have.
const t = String(input.job || '').trim();
const m = /^(https?:\/\/\S+)$/.exec(t) || (t.length < 400 ? /(https?:\/\/[^\s<>"]+)/.exec(t) : null);
return { url: m ? m[1] : '', text: m ? '' : t, words: input.length === 'Short' ? 200 : 350 };`,
          outputs: [
            { id: 'url', label: 'Address', type: 'url' },
            { id: 'text', label: 'The posting', type: 'markdown' },
            { id: 'words', label: 'Words', type: 'number' },
          ],
          failed: 'agent',
        },
        { id: 'posting', title: 'Read the posting', do: 'tool', tool: 'read_page', if: '{{source.url}} is not empty', with: { url: '{{source.url}}' }, failed: 'agent' },
        {
          id: 'role',
          title: 'What the job asks for',
          do: 'model',
          instructions: `Read this job posting and pull out what a cover letter for it needs.

{{source.text}}{{posting.text}}

- company and role: as the posting names them.
- requirements: the requirements that matter most for this role, most important first (at most six), each in a few words, with how much it matters (a must, a strong plus, nice to have).
- about: what the posting says about the company, its mission or the team, in two sentences.`,
          outputs: [
            { id: 'company', label: 'Company', type: 'text' },
            { id: 'role', label: 'Role', type: 'text' },
            {
              id: 'requirements',
              label: 'Requirements',
              type: 'table',
              required: true,
              columns: [{ id: 'requirement', label: 'Requirement', type: 'text' }, { id: 'weight', label: 'How much it matters', type: 'text' }],
            },
            { id: 'about', label: 'About the company', type: 'text' },
          ],
        },
        {
          id: 'together',
          title: 'The company, and your evidence',
          do: 'parallel',
          branches: [
            [
              { id: 'news', title: 'Look the company up', do: 'tool', tool: 'web_search', if: '{{role.company}} is not empty', with: { query: '{{role.company}} news {{today}}', k: 6 }, failed: 'skip' },
              {
                id: 'angle',
                title: 'Why the role matters now',
                do: 'model',
                instructions: `Say in one or two sentences what {{role.company}} does, and something recent that shows why the role of {{role.role}} matters to it now. Only what the sources below say; leave recent empty when they show nothing recent.

From the posting: {{role.about}}
{{#company}}What the applicant knows: {{company}}
{{/company}}{{#news.text}}
Recent results:
{{news.text}}
{{/news.text}}`,
                outputs: [{ id: 'angle', label: 'Why it matters', type: 'text' }, { id: 'recent', label: 'Something recent', type: 'text', description: 'What happened, with its date and source' }],
              },
            ],
            [
              {
                id: 'match',
                title: 'Match your evidence',
                do: 'model',
                instructions: `Match the job's requirements to evidence in the applicant's background. For each requirement, the most concrete evidence for it: what they did, with numbers where there are some, in their own facts. Never invent or stretch experience: a requirement the background does not show goes under gaps, with how to address it in an interview.

Requirements:
{{role.requirements}}

Background:
{{background}}`,
                outputs: [
                  { id: 'matched', label: 'How you match', type: 'table', required: true, columns: [{ id: 'requirement', label: 'Requirement', type: 'text' }, { id: 'evidence', label: 'Your evidence', type: 'text' }] },
                  { id: 'gaps', label: 'Gaps', type: 'list', description: 'Requirements the background does not show, and how to address each in an interview' },
                  { id: 'name', label: 'Name', type: 'text', description: 'The applicant’s name, when the background gives it' },
                ],
              },
            ],
          ],
        },
        {
          id: 'write',
          title: 'Write the letter',
          do: 'model',
          instructions: `Write a cover letter for the role of {{role.role}} at {{role.company}}. Tone: {{tone}}. About {{source.words}} words.

- An opening specific to this company and role (not "I am writing to express my interest"){{#angle.angle}}, drawing on why it matters now: {{angle.angle}}{{/angle.angle}}.
- One or two paragraphs of evidence: the three or four strongest matches below, with their numbers. Claim nothing else of the background.
- A short close that asks for a conversation.
- Plain words, active voice, no clichés.{{#match.name}} Sign it {{match.name}}.{{/match.name}}{{^match.name}} End with "Kind regards," and no name.{{/match.name}}
Also an email subject line.

How the applicant matches:
{{match.matched}}`,
          outputs: [
            { id: 'letter', label: 'Letter', type: 'markdown', required: true },
            { id: 'subject', label: 'Email subject line', type: 'text' },
          ],
        },
        {
          id: 'polish',
          title: 'Check it, and revise until it passes',
          do: 'code',
          language: 'javascript',
          with: { letter: '{{write.letter}}', words: '{{source.words}}', company: '{{role.company}}' },
          code: String.raw`// Checks the letter (its length, an opening of its own, no clichés or placeholders, the company named) and has a model
// revise it until it passes, twice at most.
const target = Number(input.words) || 350;
const company = String(input.company || '').trim();
const CLICHES = ['i am writing to express', 'i am writing to apply', 'to whom it may concern', 'dear sir or madam', 'team player', 'hard-working', 'hardworking', 'go-getter', 'think outside the box', 'hit the ground running', 'passionate about', 'synergy', 'results-driven', 'self-starter', 'perfect fit'];
const problems = (letter) => {
  const out = [];
  const words = letter.split(/\s+/).filter(Boolean).length;
  if (words < target * 0.8 || words > target * 1.2) out.push('It is ' + words + ' words long: make it about ' + target + '.');
  const low = letter.toLowerCase();
  for (const c of CLICHES) if (low.includes(c)) out.push('Say it without "' + c + '".');
  if (/\[[^\]\n]{2,40}\]|\{\{|lorem ipsum/i.test(letter)) out.push('Fill in or take out the placeholders in brackets.');
  if (company && !low.includes(company.toLowerCase())) out.push('Name the company, ' + company + '.');
  return out;
};
let letter = String(input.letter || '');
let left = problems(letter);
let rounds = 0;
while (left.length && rounds < 2) {
  rounds++;
  const r = await ctx.model('Revise this cover letter to fix the problems listed, and change nothing else: keep its facts, its tone and its structure.\n\nProblems:\n{{problems}}\n\nThe letter:\n{{letter}}', {
    with: { problems: left.map((p) => '- ' + p).join('\n'), letter },
    outputs: { letter: 'long' },
    title: 'Revise the letter',
  });
  if (r && r.letter) letter = String(r.letter);
  left = problems(letter);
}
return { letter, rounds, left };`,
          outputs: [
            { id: 'letter', label: 'Letter', type: 'markdown' },
            { id: 'rounds', label: 'Revisions', type: 'number' },
            { id: 'left', label: 'Still to fix', type: 'list' },
          ],
          failed: 'agent',
        },
      ],
      outputs: { letter: '{{polish.letter}}', subject: '{{write.subject}}', matched: '{{match.matched}}', gaps: '{{match.gaps}}' },
    },
    answer: [
      { id: 'letter', label: 'Letter', type: 'markdown', required: true },
      { id: 'subject', label: 'Email subject line', type: 'text' },
      {
        id: 'matched',
        label: 'How you match',
        type: 'table',
        columns: [
          { id: 'requirement', label: 'Requirement', type: 'text' },
          { id: 'evidence', label: 'Your evidence', type: 'text' },
        ],
      },
      { id: 'gaps', label: 'Gaps', type: 'list', description: 'Requirements the background does not show, and how to address each in an interview' },
    ],
    examples: [
      { id: 'a-data-analyst', name: 'A data analyst role', inputs: { job: 'Data analyst at Acme: SQL, Python, dashboards in Tableau, explaining findings to managers.', background: 'Three years in marketing analytics: weekly SQL reports, a Python churn model that cut churn 8%, Looker dashboards for 40 people.', tone: 'Confident', length: 'Short' }, checks: ['{{polish.left}} is empty', '{{answer.letter}} contains Acme'] },
    ],
  },
  {
    id: 'lesson-plan',
    name: 'Lesson plan',
    icon: 'graduation-cap',
    color: 'amber',
    category: 'Learning',
    description: 'A timed lesson planned back from its goals: activities, checks for understanding, support and stretch.',
    fields: [
      { id: 'topic', label: 'Topic', type: 'text', required: true },
      { id: 'learners', label: 'Learners', type: 'text', required: true, placeholder: 'e.g. Year 7, or adult beginners' },
      { id: 'minutes', label: 'Length in minutes', type: 'number', required: true, default: '50' },
      { id: 'goals', label: 'What they should be able to do afterwards', type: 'long' },
      { id: 'setting', label: 'Setting', type: 'choice', options: ['Classroom', 'Online', 'One-to-one', 'Home school'], default: 'Classroom' },
      { id: 'materials', label: 'What you have to work with', type: 'text', placeholder: 'e.g. A projector, mini whiteboards, no devices' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'aims',
          title: 'Plan back from the goals',
          do: 'model',
          instructions: `Plan the aims of a {{minutes}}-minute lesson on {{topic}} for {{learners}}. Setting: {{setting}}.
{{#goals}}By the end, they should be able to: {{goals}}
{{/goals}}
- objectives: two or three learning objectives, each something a learner can show, not "understand".
- success: the success criteria: how you will know they got there.
- misconceptions: the misconceptions to expect, and how to address each.
- facts: the facts the lesson rests on that should be checked before teaching them (dates, figures, science, definitions): four at most, each a short statement; none when the topic rests on no such facts.`,
          outputs: [
            { id: 'objectives', label: 'Objectives', type: 'list', required: true },
            { id: 'success', label: 'Success criteria', type: 'list' },
            { id: 'misconceptions', label: 'Misconceptions', type: 'list' },
            { id: 'facts', label: 'Facts to check', type: 'list' },
          ],
        },
        {
          id: 'check',
          title: 'Check the facts',
          do: 'repeat',
          if: '{{aims.facts}} is not empty',
          over: '{{aims.facts}}',
          atOnce: 3,
          as: 'fact',
          collect: 'verdict',
          steps: [
            { id: 'look_up', title: 'Look it up', do: 'tool', tool: 'web_search', with: { query: '{{fact}}', k: 5 }, failed: 'skip' },
            {
              id: 'verdict',
              title: 'Right or not?',
              do: 'model',
              instructions: `Is this statement right, by the search results below? If it is wrong, or needs care when taught, give it as it should be taught.

The statement: {{fact}}

{{look_up.text}}`,
              outputs: [
                { id: 'fact', label: 'Fact', type: 'text' },
                { id: 'right', label: 'Right', type: 'yesno' },
                { id: 'correct', label: 'As it should be taught', type: 'text' },
                { id: 'source', label: 'Source', type: 'text', description: 'The page that says so: its title and address' },
              ],
            },
          ],
        },
        {
          id: 'shape',
          title: 'Share out the minutes',
          do: 'code',
          language: 'python',
          with: { minutes: '{{minutes}}', setting: '{{setting}}' },
          code: String.raw`# The lesson's parts and their minutes, adding up to exactly its length: a hook, teaching, guided and independent
# practice, and a wrap-up with a check; a short break in a lesson over 75 minutes. One-to-one lessons give more time to
# guided practice, online ones to checking in.
total = max(10, min(480, int(round(float(input.get('minutes') or 50)))))
shares = {
    'One-to-one': [10, 20, 35, 20, 15],
    'Online': [10, 20, 25, 25, 20],
}.get(input.get('setting'), [10, 25, 25, 25, 15])
names = ['Hook', 'Teaching', 'Guided practice', 'Independent practice', 'Wrap-up and check']
pause = 0 if total <= 75 else 5 if total <= 120 else 10
left = total - pause
exact = [left * s / 100 for s in shares]
minutes = [int(x) for x in exact]
# The minutes rounding left over go to the parts that lost the most, until they add up.
for i in sorted(range(5), key=lambda i: exact[i] - minutes[i], reverse=True)[: left - sum(minutes)]:
    minutes[i] += 1
parts = [[n, m] for n, m in zip(names, minutes)]
if pause:
    parts.insert(3, ['Break', pause])
phases, at = [], 0
for name, m in parts:
    phases.append({'phase': name, 'minutes': m, 'start': at, 'end': at + m})
    at += m
return {'phases': phases, 'total': at}`,
          outputs: [
            {
              id: 'phases',
              label: 'Parts of the lesson',
              type: 'table',
              columns: [
                { id: 'phase', label: 'Part', type: 'text' },
                { id: 'minutes', label: 'Minutes', type: 'number' },
                { id: 'start', label: 'From minute', type: 'number' },
                { id: 'end', label: 'To minute', type: 'number' },
              ],
            },
            { id: 'total', label: 'Minutes in all', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'activities',
          title: 'Plan the activities',
          do: 'model',
          instructions: `Plan the activities of a {{minutes}}-minute lesson on {{topic}} for {{learners}}. Setting: {{setting}}.
{{#materials}}Available: {{materials}}
{{/materials}}
Objectives:
{{aims.objectives}}

Success criteria:
{{aims.success}}

Misconceptions to expect:
{{aims.misconceptions}}
{{#check.items}}
The facts, as checked (teach them as they should be taught):
{{check.items}}
{{/check.items}}
Its parts, with their minutes (keep to them):
{{shape.phases}}

- timeline: one row per part, in order: its minutes, the activity, what the teacher does and what the learners do.
- materials: every material needed.
- handouts: the worksheets, examples and questions, written out in full.
- differentiation: support for those who struggle, and a stretch for those who are ahead.
- assessment: how understanding is checked along the way, and the check at the end.
Keep it practical and pitched to the learners' age and level.`,
          outputs: [
            {
              id: 'timeline',
              label: 'Timeline',
              type: 'table',
              required: true,
              columns: [
                { id: 'minutes', label: 'Minutes', type: 'number' },
                { id: 'activity', label: 'Activity', type: 'text' },
                { id: 'teacher', label: 'Teacher', type: 'text' },
                { id: 'learners', label: 'Learners', type: 'text' },
              ],
            },
            { id: 'materials', label: 'Materials', type: 'list' },
            { id: 'handouts', label: 'Handouts', type: 'markdown' },
            { id: 'differentiation', label: 'Support and stretch', type: 'markdown' },
            { id: 'assessment', label: 'Checking understanding', type: 'markdown' },
          ],
        },
        {
          id: 'fit',
          title: 'Time it, and lay out the plan',
          do: 'code',
          language: 'javascript',
          with: {
            phases: '{{shape.phases}}',
            timeline: '{{activities.timeline}}',
            minutes: '{{shape.total}}',
            topic: '{{topic}}',
            learners: '{{learners}}',
            setting: '{{setting}}',
            objectives: '{{aims.objectives}}',
            success: '{{aims.success}}',
            misconceptions: '{{aims.misconceptions}}',
            facts: '{{check.items}}',
            materials: '{{activities.materials}}',
            handouts: '{{activities.handouts}}',
            differentiation: '{{activities.differentiation}}',
            assessment: '{{activities.assessment}}',
          },
          code:
            LIST +
            String.raw`// The timeline on the minutes of the lesson's parts, so that it adds up to the lesson's length (rows that do not
// match the parts keep their own minutes, scaled to fit), and the whole plan in Markdown, ready to print.
const phases = rows(input.phases);
const plan = rows(input.timeline);
const total = Number(input.minutes) || phases.reduce((a, p) => a + (Number(p.minutes) || 0), 0);
let minutes;
if (plan.length === phases.length) minutes = phases.map((p) => Number(p.minutes) || 0);
else {
  const own = plan.map((r) => Math.max(1, Number(r.minutes) || 1));
  const sum = own.reduce((a, b) => a + b, 0);
  const exact = own.map((m) => (m * total) / sum);
  minutes = exact.map(Math.floor);
  const order = exact.map((x, i) => i).sort((a, b) => exact[b] - minutes[b] - (exact[a] - minutes[a]));
  for (let i = 0; minutes.reduce((a, b) => a + b, 0) < total; i++) minutes[order[i % order.length]]++;
}
const timeline = plan.map((r, i) => ({ minutes: minutes[i], activity: r.activity || '', teacher: r.teacher || '', learners: r.learners || '' }));
const cell = (t) => String(t || '').replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ');
const points = (v) => list(v).map((x) => '- ' + String(x)).join('\n');
let at = 0;
const table = ['| Time | Activity | Teacher | Learners |', '| --- | --- | --- | --- |'].concat(timeline.map((r) => '| ' + at + '–' + (at += r.minutes) + ' min | ' + cell(r.activity) + ' | ' + cell(r.teacher) + ' | ' + cell(r.learners) + ' |')).join('\n');
const facts = rows(input.facts).filter((f) => f.correct || f.fact).map((f) => '- ' + (f.correct || f.fact) + (f.source ? ' (' + f.source + ')' : '')).join('\n');
// Headings inside a part sit under its own.
const part = (title, body) => (String(body || '').trim() ? '## ' + title + '\n\n' + String(body).trim().replace(/^#{1,2}\s/gm, '### ') : '');
const out = [
  '# ' + input.topic + ': a ' + total + '-minute lesson',
  'For ' + input.learners + ' · ' + input.setting,
  part('Objectives', points(input.objectives)),
  part('Success criteria', points(input.success)),
  part('Timeline', table),
  part('Materials', points(input.materials)),
  part('Handouts', input.handouts),
  part('Misconceptions to expect', points(input.misconceptions)),
  part('Support and stretch', input.differentiation),
  part('Checking understanding', input.assessment),
  part('Facts, as checked', facts),
];
return { timeline, plan: out.filter(Boolean).join('\n\n'), minutes: at };`,
          outputs: [
            {
              id: 'timeline',
              label: 'Timeline',
              type: 'table',
              columns: [
                { id: 'minutes', label: 'Minutes', type: 'number' },
                { id: 'activity', label: 'Activity', type: 'text' },
                { id: 'teacher', label: 'Teacher', type: 'text' },
                { id: 'learners', label: 'Learners', type: 'text' },
              ],
            },
            { id: 'plan', label: 'Full plan', type: 'markdown' },
            { id: 'minutes', label: 'Minutes in all', type: 'number' },
          ],
          failed: 'agent',
        },
      ],
      outputs: {
        objectives: '{{aims.objectives}}',
        timeline: '{{fit.timeline}}',
        materials: '{{activities.materials}}',
        differentiation: '{{activities.differentiation}}',
        assessment: '{{activities.assessment}}',
        plan: '{{fit.plan}}',
      },
    },
    answer: [
      { id: 'objectives', label: 'Objectives', type: 'list', required: true },
      {
        id: 'timeline',
        label: 'Timeline',
        type: 'table',
        required: true,
        columns: [
          { id: 'minutes', label: 'Minutes', type: 'number' },
          { id: 'activity', label: 'Activity', type: 'text' },
          { id: 'teacher', label: 'Teacher', type: 'text' },
          { id: 'learners', label: 'Learners', type: 'text' },
        ],
      },
      { id: 'materials', label: 'Materials', type: 'list' },
      { id: 'differentiation', label: 'Support and stretch', type: 'markdown' },
      { id: 'assessment', label: 'Checking understanding', type: 'markdown' },
      { id: 'plan', label: 'Full plan', type: 'markdown', required: true, description: 'The whole plan, ready to print' },
    ],
    examples: [
      { id: 'photosynthesis', name: 'Photosynthesis, Year 8', inputs: { topic: 'Photosynthesis', learners: 'Year 8', minutes: 50, setting: 'Classroom' }, checks: ['{{fit.minutes}} = 50', '{{answer.timeline}} is not empty'] },
    ],
  },
  {
    id: 'news-digest',
    name: 'Weekly news digest',
    icon: 'newspaper',
    color: 'blue',
    category: 'Research',
    description: 'The past week on the topics you follow: original reporting only, duplicates merged, why each story matters.',
    fields: [
      { id: 'topics', label: 'Topics', type: 'long', required: true, placeholder: 'One per line, e.g. battery technology, EU AI rules, our competitors Acme and Globex' },
      { id: 'region', label: 'Region or language', type: 'text' },
      { id: 'skip', label: 'Leave out', type: 'text', placeholder: 'Subjects or sources to skip' },
      { id: 'length', label: 'Length', type: 'choice', options: ['Brief', 'Standard', 'Detailed'], default: 'Standard' },
    ],
    prompt: '',
    flow: {
      steps: [
        { id: 'since', title: 'A week ago', do: 'value', of: '{{today}}', op: 'date', arg: '-7' },
        {
          id: 'topic_list',
          title: 'List the topics',
          do: 'code',
          language: 'javascript',
          with: { topics: '{{topics}}', region: '{{region}}', length: '{{length}}' },
          code: String.raw`// The topics (one a line, or between commas on one line), eight at most, each a search (with the region, when one is
// given), and how many stories the digest's length has room for.
let topics = String(input.topics || '').split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
if (topics.length === 1 && topics[0].includes(',')) topics = topics[0].split(',').map((t) => t.trim()).filter(Boolean);
topics = topics.slice(0, 8);
if (!topics.length) throw new Error('Give the topics to follow, one a line');
const region = String(input.region || '').trim();
return { items: topics.map((topic) => ({ topic, query: region ? topic + ' ' + region : topic })), stories: { Brief: 4, Standard: 8, Detailed: 15 }[input.length] || 8, count: topics.length };`,
          outputs: [
            { id: 'items', label: 'Topics', type: 'table', columns: [{ id: 'topic', label: 'Topic', type: 'text' }, { id: 'query', label: 'Search', type: 'text' }] },
            { id: 'stories', label: 'Room for stories', type: 'number' },
            { id: 'count', label: 'How many', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'search',
          title: 'Search the week’s news',
          do: 'repeat',
          over: '{{topic_list.items}}',
          atOnce: 3,
          as: 'topic',
          steps: [{ id: 'news', title: 'Search the news', do: 'tool', tool: 'web_search', with: { query: '{{topic.query}}', from: '{{since.value}}', to: '{{today}}', categories: ['news'], k: 12 }, failed: 'skip' }],
        },
        {
          id: 'group',
          title: 'Merge the same stories',
          do: 'code',
          language: 'javascript',
          with: { searches: '{{search.items}}', topics: '{{topic_list.items}}', since: '{{since.value}}', today: '{{today}}', skip: '{{skip}}', stories: '{{topic_list.stories}}' },
          code:
            LIST +
            HITS +
            String.raw`// Every result once; of the past week, when it is dated; none from what to leave out; the same story told by several
// outlets as one, its original reporting first (wires, official sources, the company's own news) and aggregators last;
// then the biggest stories of each topic, in turns, as many as the digest has room for and a few more in case some
// cannot be read.
const topics = rows(input.topics);
const searches = list(input.searches);
const since = String(input.since || '');
const today = String(input.today || '');
const skip = String(input.skip || '').toLowerCase().split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
const ORIGINAL = /(^|\.)(reuters\.com|apnews\.com|afp\.com|bloomberg\.com|ft\.com|wsj\.com|nytimes\.com|bbc\.co\.uk|bbc\.com|theguardian\.com|europa\.eu|prnewswire\.com|businesswire\.com|globenewswire\.com)$|(^|\.)(gov|int)(\.[a-z]{2})?$|(^|\.)gov\.[a-z]{2}$/;
const AGGREGATOR = /(^|\.)(msn\.com|yahoo\.com|news\.google\.com|flipboard\.com|newsbreak\.com|ground\.news|inkl\.com|headtopics\.com|newsnow\.co\.uk|biztoc\.com|muckrack\.com)$/;
const STOP = new Set('the and for with from that this its are was were has have had will new says said after over into amid about than more'.split(' '));
const words = (t) => new Set((String(t).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2 && !STOP.has(w)));
const like = (a, b) => {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / Math.max(1, Math.min(a.size, b.size));
};
const seen = new Set();
const groups = [];
searches.forEach((s, i) => {
  const topic = topics[i] ? topics[i].topic : '';
  for (const h of hitsOf(s)) {
    const site = siteOf(h.url);
    const day = String(h.date || '').slice(0, 10);
    if (seen.has(keyOf(h.url))) continue;
    seen.add(keyOf(h.url));
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && ((since && day < since) || (today && day > today))) continue;
    const text = (h.title + ' ' + site).toLowerCase();
    if (skip.some((w) => text.includes(w))) continue;
    const w = words(h.title);
    const item = { title: h.title, url: h.url, site, date: h.date || '', rank: h.rank, original: ORIGINAL.test(site) ? 1 : 0, aggregator: AGGREGATOR.test(site) ? 1 : 0 };
    const g = groups.find((x) => x.topic === topic && like(w, x.words) >= 0.5);
    if (g) g.items.push(item);
    else groups.push({ topic, words: w, items: [item] });
  }
});
const lead = (g) => g.items.slice().sort((a, b) => b.original - a.original || a.aggregator - b.aggregator || a.rank - b.rank)[0];
const room = Math.max(1, Number(input.stories) || 8);
const per = topics.map((t) => groups.filter((g) => g.topic === t.topic).sort((a, b) => b.items.length - a.items.length || lead(a).rank - lead(b).rank));
const items = [];
for (let turn = 0; items.length < Math.ceil(room * 1.5) && per.some((p) => p.length > turn); turn++)
  per.forEach((p, i) => {
    const g = p[turn];
    if (!g || items.length >= Math.ceil(room * 1.5)) return;
    const l = lead(g);
    items.push({ topic: topics[i].topic, title: l.title, url: l.url, site: l.site, date: l.date, coverage: g.items.length });
  });
const quiet = topics.filter((t, i) => !per[i].length).map((t) => t.topic);
return { items, quiet, count: items.length };`,
          outputs: [
            {
              id: 'items',
              label: 'Stories to read',
              type: 'table',
              columns: [
                { id: 'topic', label: 'Topic', type: 'text' },
                { id: 'title', label: 'Story', type: 'text' },
                { id: 'url', label: 'Link', type: 'url' },
                { id: 'site', label: 'Site', type: 'text' },
                { id: 'date', label: 'Date', type: 'text' },
                { id: 'coverage', label: 'Outlets', type: 'number' },
              ],
            },
            { id: 'quiet', label: 'Quiet topics', type: 'list' },
            { id: 'count', label: 'How many', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'read',
          title: 'Read the stories',
          do: 'repeat',
          over: '{{group.items}}',
          atOnce: 4,
          as: 'story',
          collect: 'gist',
          steps: [
            { id: 'article', title: 'Read the article', do: 'tool', tool: 'read_page', with: { url: '{{story.url}}', question: 'What happened, when, and why it matters' }, failed: 'skip' },
            {
              id: 'gist',
              title: 'Sum it up',
              do: 'model',
              if: '{{article.text}} is not empty',
              instructions: `Sum up this news story for a weekly digest on {{story.topic}}.

The article: {{story.title}}, {{story.url}} ({{story.site}}{{#story.date}}, {{story.date}}{{/story.date}})

{{article.text}}

- what: what happened, in two or three sentences, with the names, numbers and dates the article gives.
- why: why it matters, in a sentence.
- date: the day it happened or was published, as the article says (YYYY-MM-DD).
- this_week: whether it happened between {{since.value}} and {{today}}.
- original: whether this is original reporting or a primary source (an announcement, a filing, a paper), rather than a rewrite of someone else's story.
- source: who published it.`,
              outputs: [
                { id: 'what', label: 'What happened', type: 'text' },
                { id: 'why', label: 'Why it matters', type: 'text' },
                { id: 'date', label: 'Date', type: 'text' },
                { id: 'this_week', label: 'This week', type: 'yesno' },
                { id: 'original', label: 'Original reporting', type: 'yesno' },
                { id: 'source', label: 'Source', type: 'text' },
              ],
            },
          ],
        },
        {
          id: 'select',
          title: 'Choose the stories',
          do: 'code',
          language: 'javascript',
          with: { candidates: '{{group.items}}', reads: '{{read.items}}', quiet: '{{group.quiet}}', topics: '{{topic_list.items}}', since: '{{since.value}}', today: '{{today}}', stories: '{{topic_list.stories}}' },
          code:
            LIST +
            String.raw`// The stories that held up (read, and of the past week), original reporting and the most covered first, in turns
// across the topics until the digest is full, with their dates and links checked; a topic without one says so.
const since = String(input.since || '');
const today = String(input.today || '');
const room = Math.max(1, Number(input.stories) || 8);
const reads = list(input.reads);
const day = (v) => (/\d{4}-\d{2}-\d{2}/.exec(String(v || '')) || [''])[0];
const link = (v) => (/^https?:\/\/\S+$/.test(String(v || '').trim()) ? String(v).trim() : null);
const kept = [];
rows(input.candidates).forEach((c, i) => {
  const r = reads[i] && typeof reads[i] === 'object' ? reads[i] : {};
  if (!r.what || r.this_week === false) return;
  const d = day(r.date) || day(c.date);
  if (d && ((since && d < since) || (today && d > today))) return;
  kept.push({ topic: c.topic, title: c.title, summary: r.what, why: r.why || '', date: d || null, source: r.source || c.site || '', url: link(c.url), weight: (r.original === false ? 0 : 100) + (Number(c.coverage) || 1) });
});
const topics = rows(input.topics).map((t) => t.topic);
const per = topics.map((t) => kept.filter((s) => s.topic === t).sort((a, b) => b.weight - a.weight));
const chosen = [];
for (let turn = 0; chosen.length < room && per.some((p) => p.length > turn); turn++) per.forEach((p) => p[turn] && chosen.length < room && chosen.push(p[turn]));
const stories = topics.flatMap((t) => chosen.filter((s) => s.topic === t)).map(({ weight, ...s }) => s);
const quiet = topics.filter((t) => !stories.some((s) => s.topic === t));
const NONE = 'No real news this week';
const none = quiet.map((topic) => ({ topic, title: NONE, summary: '', why: '', date: null, source: '', url: null }));
// The real stories, by their headlines and pages, for their pictures (in the same order, before the quiet topics).
const look = stories.map((s) => ({ name: s.title, page: s.url }));
return { stories: stories.concat(none), count: stories.length, quiet, look };`,
          outputs: [
            {
              id: 'stories',
              label: 'Stories',
              type: 'table',
              columns: [
                { id: 'topic', label: 'Topic', type: 'text' },
                { id: 'title', label: 'Story', type: 'text' },
                { id: 'summary', label: 'What happened', type: 'text' },
                { id: 'why', label: 'Why it matters', type: 'text' },
                { id: 'date', label: 'Date', type: 'date' },
                { id: 'source', label: 'Source', type: 'text' },
                { id: 'url', label: 'Link', type: 'url' },
              ],
            },
            { id: 'count', label: 'How many', type: 'number' },
            { id: 'quiet', label: 'Quiet topics', type: 'list' },
            { id: 'look', label: 'Their pictures to find', type: 'table', columns: [{ id: 'name', label: 'Story', type: 'text' }, { id: 'page', label: 'Its page', type: 'url' }] },
          ],
          failed: 'agent',
        },
        { id: 'media', title: 'Find their pictures', do: 'tool', tool: 'find_media', if: '{{select.look}} is not empty', with: { items: '{{select.look}}', name: 'name', page: 'page', kind: 'news' }, failed: 'skip' },
        {
          id: 'pictures',
          title: 'Put each picture with its story',
          do: 'code',
          language: 'javascript',
          with: { stories: '{{select.stories}}', media: '{{media.data}}' },
          code:
            LIST +
            String.raw`// Each story with the picture its own page shows (or a page with the same story, when its own has none), where one
// was found.
const media = list(input.media && input.media.items);
const link = (v) => (/^https?:\/\/\S+$/.test(String(v || '').trim()) ? String(v).trim() : null);
const stories = rows(input.stories).map((s, i) => ({ ...s, picture: link(media[i] && typeof media[i] === 'object' ? media[i].picture : null) }));
return { stories };`,
          outputs: [{ id: 'stories', label: 'Stories', type: 'table', columns: STORY_COLS }],
          failed: 'agent',
        },
        {
          id: 'write',
          title: 'Write the digest',
          do: 'model',
          instructions: `Write a weekly news digest for the week ending {{today}} from the stories below: the week in one sentence (headline), then the digest in Markdown: every story below, by topic, each with what happened and why it matters in a few sentences, and its source, linked.{{#select.quiet}} Say plainly which topics had no real news this week rather than padding them: {{select.quiet}}.{{/select.quiet}}
{{#region}}Region or language: {{region}}
{{/region}}
{{select.stories}}`,
          outputs: [
            { id: 'headline', label: 'The week in a sentence', type: 'text', required: true },
            { id: 'digest', label: 'Digest', type: 'markdown', required: true, description: 'The whole digest, ready to read' },
          ],
        },
      ],
      outputs: { headline: '{{write.headline}}', stories: '{{pictures.stories}}', digest: '{{write.digest}}' },
    },
    answer: [
      { id: 'headline', label: 'The week in a sentence', type: 'text', required: true },
      { id: 'stories', label: 'Stories', type: 'table', required: true, columns: STORY_COLS },
      { id: 'digest', label: 'Digest', type: 'markdown', required: true, description: 'The whole digest, ready to read' },
    ],
    examples: [
      { id: 'batteries-and-ai-rules', name: 'Batteries and AI rules', inputs: { topics: 'battery technology\nEU AI rules', length: 'Brief' }, checks: ['{{answer.stories}} is not empty', '{{answer.digest}} is not empty', '{{media.data.pictures}} > 0'] },
    ],
  },
  {
    id: 'explain-contract',
    name: 'Explain a contract',
    icon: 'scroll-text',
    color: 'slate',
    category: 'Work',
    description: 'What an agreement really says, in plain words: key terms, dates, what is unusual, and what to ask before signing.',
    fields: [
      { id: 'contract', label: 'The contract', type: 'file', help: 'A PDF, Word document or text file' },
      { id: 'text', label: 'Or paste it here', type: 'long' },
      { id: 'side', label: 'Your side', type: 'text', placeholder: 'e.g. The tenant, the freelancer, the buyer' },
      { id: 'concerns', label: 'Anything you’re worried about', type: 'long' },
    ],
    prompt: '',
    flow: {
      steps: [
        { id: 'read', title: 'Read the file', do: 'tool', tool: 'read_document', if: '{{contract}} is not empty', with: { path: '{{contract}}', limit: 5000 }, failed: 'agent' },
        {
          id: 'clauses',
          title: 'Split it into its clauses',
          do: 'code',
          language: 'javascript',
          with: { file: '{{read.text}}', pasted: '{{text}}' },
          code: String.raw`// The contract's text (from the file, or as pasted) in parts of whole clauses that a model reads at once (about
// 10,000 characters each, ten at most), and its opening, which says who the parties are.
const fromFile = String(input.file || '')
  .split('\n')
  .filter((l) => !/ · lines \d+\D\d+ of \d+$/.test(l) && !/^… \(\d+ more lines/.test(l))
  .map((l) => (/^\s*\d+\t/.test(l) ? l.replace(/^\s*\d+\t/, '') : l))
  .join('\n')
  .trim();
const text = fromFile || String(input.pasted || '').trim();
if (!text) throw new Error('Attach the contract, or paste its text');
const HEAD = /^\s*(?:(?:section|clause|article|schedule|appendix|annex|exhibit|part)\s+[\dIVXLC]+|\d{1,2}(?:\.\d{1,2})*[.)]?\s+\S)/i;
const blocks = [];
let cur = '';
for (const l of text.split('\n')) {
  if (HEAD.test(l) && cur.trim()) {
    blocks.push(cur);
    cur = '';
  }
  cur += (cur ? '\n' : '') + l;
}
if (cur.trim()) blocks.push(cur);
const parts = [];
let part = '';
for (const b of blocks) {
  if (part && part.length + b.length > 10000) {
    parts.push(part);
    part = '';
  }
  if (b.length > 10000) for (let i = 0; i < b.length; i += 10000) parts.push(b.slice(i, i + 10000));
  else part += (part ? '\n' : '') + b;
}
if (part.trim()) parts.push(part);
const kept = parts.slice(0, 10);
return { items: kept.map((t, i) => ({ part: i + 1, of: kept.length, text: t })), opening: text.slice(0, 6000), whole: text, count: kept.length, cut: parts.length > kept.length };`,
          outputs: [
            { id: 'items', label: 'Parts', type: 'table', columns: [{ id: 'part', label: 'Part', type: 'number' }, { id: 'of', label: 'Of', type: 'number' }, { id: 'text', label: 'Text', type: 'text' }] },
            { id: 'opening', label: 'Its opening', type: 'markdown' },
            { id: 'whole', label: 'The whole text', type: 'markdown' },
            { id: 'count', label: 'Parts', type: 'number' },
            { id: 'cut', label: 'Too long to read whole', type: 'yesno' },
          ],
          failed: 'agent',
        },
        {
          id: 'both',
          title: 'Read it through',
          do: 'parallel',
          branches: [
            [
              {
                id: 'overview',
                title: 'What kind of agreement',
                do: 'model',
                instructions: `From the opening of this contract below, say what kind of agreement it is, who the parties are, and what each one gives and gets, in a few sentences.{{#side}} The reader is {{side}}.{{/side}}

{{clauses.opening}}`,
                outputs: [{ id: 'kind', label: 'Kind of agreement', type: 'text' }, { id: 'parties', label: 'Parties', type: 'list' }, { id: 'gives_gets', label: 'Who gives and gets what', type: 'markdown' }],
              },
            ],
            [
              {
                id: 'read_parts',
                title: 'Go through its parts',
                do: 'repeat',
                over: '{{clauses.items}}',
                atOnce: 4,
                as: 'part',
                collect: 'part_terms',
                steps: [
                  {
                    id: 'part_terms',
                    title: 'Read a part',
                    do: 'model',
                    instructions: `Read this part ({{part.part}} of {{part.of}}) of a contract for {{#side}}{{side}}{{/side}}{{^side}}one of its parties{{/side}}, who is not a lawyer, and pull out what matters.

{{part.text}}

- terms: the terms that matter in it: how long it runs and how it renews; money (amounts, when, penalties, increases); ending it (notice, fees); liability and indemnities; confidentiality; intellectual property; non-compete or exclusivity; how disputes are settled; anything else that binds. For each, its topic (term, money, ending, liability, confidentiality, ip, exclusivity, disputes or other), the term in a few words, what it means in practice for the reader, and its clause number.
- dates: every date or deadline, and what happens then, with its clause.
- flags: anything unusual, one-sided or risky compared with what is typical for this kind of agreement: the clause, the issue (quote the exact words where they matter), how serious it is (high, medium or low), and what to ask to change.`,
                    outputs: [
                      {
                        id: 'terms',
                        label: 'Terms',
                        type: 'table',
                        columns: [
                          { id: 'topic', label: 'Topic', type: 'text' },
                          { id: 'term', label: 'Term', type: 'text' },
                          { id: 'meaning', label: 'What it means for you', type: 'text' },
                          { id: 'clause', label: 'Clause', type: 'text' },
                        ],
                      },
                      {
                        id: 'dates',
                        label: 'Dates',
                        type: 'table',
                        columns: [{ id: 'when', label: 'When', type: 'text' }, { id: 'what', label: 'What happens', type: 'text' }, { id: 'clause', label: 'Clause', type: 'text' }],
                      },
                      {
                        id: 'flags',
                        label: 'Watch out',
                        type: 'table',
                        columns: [
                          { id: 'clause', label: 'Clause', type: 'text' },
                          { id: 'issue', label: 'Issue', type: 'text' },
                          { id: 'severity', label: 'How serious', type: 'text' },
                          { id: 'ask', label: 'What to ask for', type: 'text' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          ],
        },
        {
          id: 'merge',
          title: 'Bring it together',
          do: 'code',
          language: 'javascript',
          with: { parts: '{{read_parts.items}}' },
          code:
            LIST +
            String.raw`// All the parts' findings in one: each term once, by topic in the usual order and then by clause; the dates in
// order (those with a day first); what to watch out for, the most serious first; and the usual topics it says nothing on.
const TOPICS = ['term', 'money', 'ending', 'liability', 'confidentiality', 'ip', 'exclusivity', 'disputes', 'other'];
const NAMES = { term: 'How long it runs and how it renews', money: 'Money', ending: 'Ending it', liability: 'Liability and indemnities', confidentiality: 'Confidentiality', ip: 'Intellectual property', disputes: 'How disputes are settled' };
const key = (t) => String(t || '').toLowerCase().replace(/\W+/g, ' ').trim();
const WORDS = [
  ['ending', /terminat|notice|cancel/],
  ['ip', /intellect|copyright|licen/],
  ['exclusivity', /compet|exclusiv/],
  ['liability', /liab|indemn|insur/],
  ['confidentiality', /confiden|privacy/],
  ['disputes', /disput|arbitra|court|governing/],
  ['money', /pay|fee|price|rent|cost|money/],
  ['term', /durat|renew|length|period/],
];
const topicOf = (t) => {
  const k = key(t.topic);
  return TOPICS.includes(k) ? k : (WORDS.find(([, re]) => re.test(k)) || ['other'])[0];
};
const clause = (c) => (String(c || '').match(/\d+/g) || ['9999']).slice(0, 3).map((n) => n.padStart(4, '0')).join('.');
const level = (s) => (/high|serious|severe/i.test(String(s)) ? 0 : /med/i.test(String(s)) ? 1 : 2);
const seen = new Set();
const once = (k) => !seen.has(k) && !!seen.add(k);
const terms = [];
const dates = [];
const flags = [];
for (const p of list(input.parts)) {
  if (!p || typeof p !== 'object') continue;
  for (const t of rows(p.terms)) if (t.term && once('t' + key(t.term) + clause(t.clause))) terms.push(t);
  for (const d of rows(p.dates)) if (d.when && once('d' + key(d.when) + key(d.what))) dates.push(d);
  for (const f of rows(p.flags)) if (f.issue && once('f' + key(f.issue))) flags.push(f);
}
terms.sort((a, b) => TOPICS.indexOf(topicOf(a)) - TOPICS.indexOf(topicOf(b)) || clause(a.clause).localeCompare(clause(b.clause)));
const iso = (d) => (/\d{4}-\d{2}-\d{2}/.exec(String(d.when)) || [''])[0];
dates.sort((a, b) => (iso(a) ? 0 : 1) - (iso(b) ? 0 : 1) || iso(a).localeCompare(iso(b)) || clause(a.clause).localeCompare(clause(b.clause)));
flags.sort((a, b) => level(a.severity) - level(b.severity) || clause(a.clause).localeCompare(clause(b.clause)));
return {
  terms: terms.map((t) => ({ term: t.term, meaning: t.meaning || '', clause: t.clause || '' })),
  dates: dates.map((d) => ({ when: d.when, what: (d.what || '') + (d.clause ? ' (clause ' + d.clause + ')' : '') })),
  flags: flags.map((f) => ({ clause: f.clause || '', issue: f.issue, severity: ['High', 'Medium', 'Low'][level(f.severity)], ask: f.ask || '' })),
  high: flags.filter((f) => level(f.severity) === 0).length,
  missing: Object.keys(NAMES).filter((t) => !terms.some((x) => topicOf(x) === t)).map((t) => NAMES[t]),
};`,
          outputs: [
            {
              id: 'terms',
              label: 'Key terms',
              type: 'table',
              columns: [{ id: 'term', label: 'Term', type: 'text' }, { id: 'meaning', label: 'What it means for you', type: 'text' }, { id: 'clause', label: 'Clause', type: 'text' }],
            },
            { id: 'dates', label: 'Dates and deadlines', type: 'table', columns: [{ id: 'when', label: 'When', type: 'text' }, { id: 'what', label: 'What happens', type: 'text' }] },
            {
              id: 'flags',
              label: 'Watch out',
              type: 'table',
              columns: [
                { id: 'clause', label: 'Clause', type: 'text' },
                { id: 'issue', label: 'Issue', type: 'text' },
                { id: 'severity', label: 'How serious', type: 'text' },
                { id: 'ask', label: 'What to ask for', type: 'text' },
              ],
            },
            { id: 'high', label: 'Serious', type: 'number' },
            { id: 'missing', label: 'Says nothing on', type: 'list' },
          ],
          failed: 'agent',
        },
        {
          id: 'serious',
          title: 'Anything serious?',
          do: 'decide',
          rule: '{{merge.high}} > 0',
          then: [
            {
              id: 'second_look',
              title: 'Take a second look',
              do: 'agent',
              instructions: `Some clauses of a contract look serious for {{#side}}{{side}}{{/side}}{{^side}}the reader{{/side}}, who is not a lawyer. Take a second look at each serious one: what is typical for this kind of agreement ({{overview.kind}}), whether such a clause usually holds where it applies (search the web where the law or common practice matters), how serious it really is, and what to ask for instead. Quote the contract's exact words.{{#concerns}} What the reader is worried about: {{concerns}}{{/concerns}}

What to watch out for, as the first reading found it:
{{merge.flags}}

{{#contract}}The contract is in the file {{contract}}: read it there.{{/contract}}{{^contract}}The contract:
{{clauses.whole}}{{/contract}}

Hand in the whole list of what to watch out for: the serious ones as you now see them, and the others as they are or as you would change them.`,
              outputs: [
                {
                  id: 'flags',
                  label: 'Watch out',
                  type: 'table',
                  required: true,
                  columns: [
                    { id: 'clause', label: 'Clause', type: 'text' },
                    { id: 'issue', label: 'Issue', type: 'text' },
                    { id: 'severity', label: 'How serious', type: 'text' },
                    { id: 'ask', label: 'What to ask for', type: 'text' },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'flags',
          title: 'What to watch out for',
          do: 'code',
          language: 'javascript',
          with: { found: '{{merge.flags}}', again: '{{second_look.flags}}' },
          code:
            LIST +
            String.raw`// What to watch out for: the second look's list when it took one, else as the parts found it.
const again = rows(input.again).filter((f) => f.issue);
return { red_flags: again.length ? again : rows(input.found) };`,
          outputs: [
            {
              id: 'red_flags',
              label: 'Watch out',
              type: 'table',
              columns: [
                { id: 'clause', label: 'Clause', type: 'text' },
                { id: 'issue', label: 'Issue', type: 'text' },
                { id: 'severity', label: 'How serious', type: 'text' },
                { id: 'ask', label: 'What to ask for', type: 'text' },
              ],
            },
          ],
          failed: 'agent',
        },
        {
          id: 'explain',
          title: 'Explain it in plain words',
          do: 'model',
          instructions: `Explain this contract in plain words to {{#side}}{{side}}{{/side}}{{^side}}one of its parties{{/side}}, who is not a lawyer, from what was found in it below.

- summary: in short: what kind of agreement it is, who the parties are and what each gives and gets; the three or four points that matter most for the reader in practice; what is unusual or risky. Be clear about what is uncertain, and end with: this is an explanation, not legal advice; for anything serious, have a lawyer check it.
- questions: questions to ask the other side before signing.
{{#concerns}}
What the reader is worried about (answer it): {{concerns}}
{{/concerns}}
Kind: {{overview.kind}}
Parties: {{overview.parties}}
Who gives and gets what: {{overview.gives_gets}}

Key terms:
{{merge.terms}}

Dates and deadlines:
{{merge.dates}}

What to watch out for:
{{flags.red_flags}}
{{#merge.missing}}
It says nothing on: {{merge.missing}}
{{/merge.missing}}{{#clauses.cut}}
The contract was too long to read whole: only its first part was gone through.
{{/clauses.cut}}`,
          outputs: [
            { id: 'summary', label: 'In short', type: 'markdown', required: true },
            { id: 'questions', label: 'Questions to ask', type: 'list' },
          ],
        },
      ],
      outputs: { summary: '{{explain.summary}}', terms: '{{merge.terms}}', dates: '{{merge.dates}}', red_flags: '{{flags.red_flags}}', questions: '{{explain.questions}}' },
    },
    answer: [
      { id: 'summary', label: 'In short', type: 'markdown', required: true },
      {
        id: 'terms',
        label: 'Key terms',
        type: 'table',
        required: true,
        columns: [
          { id: 'term', label: 'Term', type: 'text' },
          { id: 'meaning', label: 'What it means for you', type: 'text' },
          { id: 'clause', label: 'Clause', type: 'text' },
        ],
      },
      {
        id: 'dates',
        label: 'Dates and deadlines',
        type: 'table',
        columns: [
          { id: 'when', label: 'When', type: 'text' },
          { id: 'what', label: 'What happens', type: 'text' },
        ],
      },
      {
        id: 'red_flags',
        label: 'Watch out',
        type: 'table',
        columns: [
          { id: 'clause', label: 'Clause', type: 'text' },
          { id: 'issue', label: 'Issue', type: 'text' },
          { id: 'severity', label: 'How serious', type: 'text' },
          { id: 'ask', label: 'What to ask for', type: 'text' },
        ],
      },
      { id: 'questions', label: 'Questions to ask', type: 'list' },
    ],
    examples: [
      { id: 'a-freelance-contract', name: 'A freelance contract', inputs: { text: '1. Term. This agreement runs for 12 months and renews automatically unless either party gives 90 days notice.\n2. Fees. The client pays within 60 days of invoice.\n3. IP. All work, including prior tools, belongs to the client.', side: 'The freelancer' }, checks: ['{{answer.red_flags}} is not empty', '{{answer.terms}} is not empty'] },
    ],
  },
  {
    id: 'small-web-app',
    name: 'Build a small web app',
    icon: 'app-window',
    color: 'cyan',
    category: 'Build',
    description: 'A working app from a description: plain HTML, CSS and JavaScript that opens from a file, tested before it is handed over.',
    fields: [
      { id: 'idea', label: 'What should it do?', type: 'long', required: true, placeholder: 'e.g. A tracker for my plants: when I watered each one, and which are due' },
      { id: 'users', label: 'Who it’s for', type: 'text' },
      { id: 'features', label: 'Must-haves', type: 'long' },
      { id: 'style', label: 'Look and feel', type: 'text', placeholder: 'e.g. Calm and minimal, big buttons for a phone' },
      { id: 'review', label: 'Let me check the plan before it is built', type: 'yesno', help: 'The run waits for you to keep or change its screens and features' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'spec',
          title: 'Plan the app',
          do: 'model',
          instructions: `Plan a small web app before it is built: plain HTML, CSS and JavaScript that opens straight from index.html, with no build step and nothing loaded from other sites, keeping its data in the browser (localStorage) with a way to export it to a file and import it back.

What it should do: {{idea}}
{{#users}}Who it's for: {{users}}
{{/users}}{{#features}}Must-haves:
{{features}}
{{/features}}{{#style}}Look and feel: {{style}}
{{/style}}
- name: a short name for it.
- screens: its screens or views, one a line: what each shows, and what you can do there.
- data: what it keeps: its records and their fields.
- features: its features, the must-haves first.
- checks: what to try to know it works, one check a line: every feature, with no data and with a lot, at a phone's width, in dark mode, with the keyboard only.
- later: ideas for a next version, left out of this one.`,
          outputs: [
            { id: 'name', label: 'Name', type: 'text', required: true },
            { id: 'screens', label: 'Screens', type: 'list', required: true },
            { id: 'data', label: 'What it keeps', type: 'markdown' },
            { id: 'features', label: 'Features', type: 'list', required: true },
            { id: 'checks', label: 'Checks', type: 'list', required: true },
            { id: 'later', label: 'Ideas for later', type: 'list' },
          ],
        },
        {
          id: 'approve',
          title: 'Check the plan',
          do: 'ask',
          if: someoneThere('review'),
          question: 'This is the plan for {{spec.name}}.\n\nIts screens:\n{{spec.screens}}\n\nIts features:\n{{spec.features}}\n\nShould it be built like this, or with changes?',
          fields: [{ id: 'changes', label: 'What to change', type: 'long', help: 'Leave it empty to build it as planned' }],
          waitHours: 24,
          failed: 'skip',
        },
        {
          id: 'build',
          title: 'Build it',
          do: 'agent',
          instructions: `Build this small web app in this folder.

{{spec.name}}: {{idea}}
{{#users}}Who it's for: {{users}}
{{/users}}{{#style}}Look and feel: {{style}}
{{/style}}
Its screens:
{{spec.screens}}

What it keeps:
{{spec.data}}

Its features:
{{spec.features}}
{{#approve.changes}}
Changes asked for: {{approve.changes}}
{{/approve.changes}}
Requirements:
- A static app that opens straight from index.html: plain HTML, CSS and JavaScript in a few files (index.html, style.css, app.js), no build step, nothing loaded from other sites.
- Works well on a phone and on a computer, in light and dark mode, and with the keyboard.
- Keeps its data in the browser (localStorage), with a way to export it to a file and import it back.
- Clear, friendly wording, sensible empty states, and no placeholder text left in.
- A README.md that says what the app does and how to open it.
Try it as you go. It is tested after you, against these checks:
{{spec.checks}}`,
          outputs: [
            { id: 'files', label: 'Files', type: 'list', required: true },
            { id: 'how_to_open', label: 'How to open it', type: 'text', required: true },
            { id: 'summary', label: 'What was built', type: 'markdown', required: true },
          ],
        },
        {
          id: 'test',
          title: 'Test it',
          do: 'agent',
          instructions: `Test the web app in this folder as its users would, against these checks:
{{spec.checks}}

Open index.html in a browser (serve the folder, with python3 -m http.server, if it does not work from a file) and try each check: with no data and with a lot, at a phone's width, in dark mode, with the keyboard only. Read the code too, for errors the screen does not show. Change nothing: write what fails to CHECK.md in this folder, one problem a line with how to see it (leave it empty when all passes), and hand in whether it passes, the problems, and the app's files as they are.`,
          outputs: [
            { id: 'passes', label: 'Passes', type: 'yesno', required: true },
            { id: 'problems', label: 'Problems', type: 'list' },
            { id: 'files', label: 'Files', type: 'list' },
          ],
        },
        {
          id: 'fix',
          title: 'Fix it until it passes',
          do: 'repeat',
          if: '{{test.passes}} = no',
          until: '{{retest.passes}}',
          max: 2,
          steps: [
            {
              id: 'repair',
              title: 'Fix the problems',
              do: 'agent',
              instructions: 'The web app in this folder failed some of its checks. Read CHECK.md (what the last test found) and fix every problem in it, changing nothing that works. Keep to plain HTML, CSS and JavaScript, with no build step and nothing loaded from other sites. Hand in the files you changed.',
              outputs: [{ id: 'changed', label: 'Files changed', type: 'list' }],
            },
            {
              id: 'retest',
              title: 'Test it again',
              do: 'agent',
              instructions: `Test the web app in this folder again, against these checks:
{{spec.checks}}

Open index.html in a browser (serve the folder, with python3 -m http.server, if it does not work from a file) and try each check: with no data and with a lot, at a phone's width, in dark mode, with the keyboard only. Read the code too, for errors the screen does not show. Change nothing: write what fails to CHECK.md in this folder, in place of what it said, one problem a line with how to see it (leave it empty when all passes), and hand in whether it passes, the problems, and the app's files as they are.`,
              outputs: [{ id: 'passes', label: 'Passes', type: 'yesno', required: true }, { id: 'problems', label: 'Problems', type: 'list' }, { id: 'files', label: 'Files', type: 'list' }],
            },
          ],
        },
        {
          id: 'wrap',
          title: 'Hand it over',
          do: 'code',
          language: 'javascript',
          with: { summary: '{{build.summary}}', files: '{{build.files}}', test: '{{test}}', fixed: '{{fix.last}}', rounds: '{{fix.count}}', later: '{{spec.later}}' },
          code:
            LIST +
            String.raw`// What was built and how its testing went, its files as they are now, and the ideas for next: what is still open first.
const last = input.fixed && typeof input.fixed === 'object' && Object.keys(input.fixed).length ? input.fixed : input.test || {};
const passes = last.passes === true || /^(yes|true)$/i.test(String(last.passes));
const problems = list(last.problems).map(String).filter(Boolean);
const files = [...new Set(list(input.files).concat(list(last.files)).map((f) => String(f).trim()).filter(Boolean))];
const rounds = Number(input.rounds) || 0;
const fixes = rounds ? ', after ' + rounds + (rounds === 1 ? ' round' : ' rounds') + ' of fixes' : '';
const tested = passes
  ? 'Tested against its checks' + fixes + ': everything passed.'
  : 'Tested against its checks' + fixes + ': ' + problems.length + (problems.length === 1 ? ' problem is' : ' problems are') + ' still open (first among the ideas for next, and in CHECK.md).';
return { summary: String(input.summary || '').trim() + '\n\n' + tested, files, next: problems.map((p) => 'Fix: ' + p).concat(list(input.later).map(String)), passes };`,
          outputs: [
            { id: 'summary', label: 'What was built', type: 'markdown' },
            { id: 'files', label: 'Files', type: 'list' },
            { id: 'next', label: 'Ideas for next', type: 'list' },
            { id: 'passes', label: 'Passes', type: 'yesno' },
          ],
          failed: 'agent',
        },
      ],
      outputs: { summary: '{{wrap.summary}}', files: '{{wrap.files}}', how_to_open: '{{build.how_to_open}}', next: '{{wrap.next}}' },
    },
    answer: [
      { id: 'summary', label: 'What was built', type: 'markdown', required: true },
      { id: 'files', label: 'Files', type: 'list', required: true },
      { id: 'how_to_open', label: 'How to open it', type: 'text', required: true },
      { id: 'next', label: 'Ideas for next', type: 'list' },
    ],
    examples: [
      { id: 'plant-tracker', name: 'A plant tracker', inputs: { idea: 'A tracker for my plants: when I watered each one, and which are due', style: 'Calm and minimal, big buttons for a phone' }, checks: ['{{answer.files}} contains index.html'] },
    ],
  },
  // Blocks: small templates made to be steps of others (Add a step offers them), each a few cheap steps.
  {
    id: 'sum-up-page',
    name: 'Sum up a page',
    icon: 'file-search',
    color: 'teal',
    category: 'Blocks',
    block: true,
    description: 'Reads the page at a link and sums it up: a step for other apps, or on its own.',
    fields: [
      { id: 'url', label: 'Link', type: 'text', required: true, placeholder: 'https://…' },
      { id: 'length', label: 'How long', type: 'choice', options: ['A line', 'A paragraph', 'Key points'], default: 'A paragraph' },
    ],
    prompt: '',
    flow: {
      steps: [
        { id: 'read', title: 'Read the page', do: 'tool', tool: 'read_page', with: { url: '{{url}}' }, failed: 'agent' },
        { id: 'sum', title: 'Sum it up', do: 'model', instructions: 'Sum up the page below as {{length}}, in plain words: what it says, leaving out menus, ads and links. Give its title too.\n\n{{read.text}}', outputs: [{ id: 'title', label: 'Title', type: 'text' }, { id: 'summary', label: 'Summary', type: 'markdown', required: true }] },
      ],
    },
    answer: [
      { id: 'title', label: 'Title', type: 'text' },
      { id: 'summary', label: 'Summary', type: 'markdown', required: true },
    ],
  },
  {
    id: 'translate',
    name: 'Translate',
    icon: 'languages',
    color: 'indigo',
    category: 'Blocks',
    block: true,
    description: 'Puts a text into another language, keeping its meaning, names and layout.',
    fields: [
      { id: 'text', label: 'The text', type: 'long', required: true },
      { id: 'language', label: 'Into', type: 'text', required: true, placeholder: 'e.g. French' },
      { id: 'tone', label: 'Tone', type: 'choice', options: ['As it is', 'Plainer', 'More formal'], default: 'As it is' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'put',
          title: 'Translate it',
          do: 'model',
          instructions: 'Translate the text below into {{language}}. Keep its meaning, names, numbers and layout (lists, headings, line breaks); tone: {{tone}}. Give only the translation.\n\n{{text}}',
          outputs: [{ id: 'translation', label: 'Translation', type: 'markdown', required: true }],
        },
      ],
    },
    answer: [{ id: 'translation', label: 'Translation', type: 'markdown', required: true }],
  },
  {
    id: 'web-answer',
    name: 'Answer from the web',
    icon: 'globe',
    color: 'blue',
    category: 'Blocks',
    block: true,
    description: 'Searches the web for a question and answers it in a few lines, with the links it used.',
    fields: [{ id: 'question', label: 'The question', type: 'long', required: true, placeholder: 'e.g. What is the population of Lisbon?' }],
    prompt: '',
    flow: {
      steps: [
        { id: 'search', title: 'Search the web', do: 'tool', tool: 'web_search', with: { query: '{{question}}' }, failed: 'agent' },
        {
          id: 'answer',
          title: 'Answer it',
          do: 'model',
          instructions: 'Answer the question from the search results below, in a few plain lines. Say where they disagree or do not say, and do not add what they do not hold. Give the links you used.\n\nQuestion: {{question}}\n\nResults:\n{{search.text}}',
          outputs: [
            { id: 'answer', label: 'Answer', type: 'markdown', required: true },
            { id: 'sources', label: 'Sources', type: 'list' },
          ],
        },
      ],
    },
    answer: [
      { id: 'answer', label: 'Answer', type: 'markdown', required: true },
      { id: 'sources', label: 'Sources', type: 'list' },
    ],
  },
  {
    id: 'sort-into-kinds',
    name: 'Sort into kinds',
    icon: 'list-checks',
    color: 'amber',
    category: 'Blocks',
    block: true,
    description: 'Says which of your kinds a text is (a bug or a question, say), and why in a sentence.',
    fields: [
      { id: 'text', label: 'The text', type: 'long', required: true },
      { id: 'kinds', label: 'The kinds', type: 'text', required: true, placeholder: 'e.g. bug, question, sales, other' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'sort',
          title: 'Sort it',
          do: 'model',
          instructions: 'Which one of these kinds is the text below: {{kinds}}? Give the kind word for word as written there, and why in one sentence.\n\n{{text}}',
          outputs: [
            { id: 'kind', label: 'Kind', type: 'text', required: true },
            { id: 'why', label: 'Why', type: 'text' },
          ],
        },
      ],
    },
    answer: [
      { id: 'kind', label: 'Kind', type: 'text', required: true },
      { id: 'why', label: 'Why', type: 'text' },
    ],
  },
  {
    id: 'pull-out-facts',
    name: 'Pull out the facts',
    icon: 'scroll-text',
    color: 'green',
    category: 'Blocks',
    block: true,
    description: 'Lists the facts in a text that you ask for (names, dates, amounts…), each as it is written.',
    fields: [
      { id: 'text', label: 'The text', type: 'long', required: true },
      { id: 'what', label: 'Which facts', type: 'text', placeholder: 'e.g. names, dates and amounts' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'pull',
          title: 'Pull them out',
          do: 'model',
          instructions: 'From the text below, list {{#what}}these facts: {{what}}{{/what}}{{^what}}the facts that matter{{/what}}. One short line each, as the text has it; nothing it does not say.\n\n{{text}}',
          outputs: [{ id: 'facts', label: 'Facts', type: 'list', required: true }],
        },
      ],
    },
    answer: [{ id: 'facts', label: 'Facts', type: 'list', required: true }],
  },
];

/**
 * The templates, tidied like any recipe: the ten tasks above, Explore (a magazine made for you, opened on its own
 * page: explore.ts), the apps for everyday things (the weather, sports, food, films and games, plans, charts:
 * templates-more.ts), the apps for papers (reading, writing and presenting them: templates-papers.ts), then the
 * blocks. They run with Claude Code unless their page picks another agent.
 */
const ALL: Draft[] = [...T.filter((t) => !t.block), EXPLORE, ...MORE, ...PAPERS, ...T.filter((t) => t.block)];
const UIS = { ...VIEWS, ...MORE_VIEWS, ...PAPER_VIEWS, [EXPLORE.id]: EXPLORE_UI };
export const TEMPLATES: AppTemplate[] = ALL.map((t) => ({ ...cleanRecipe({ ...t, agent: 'claude', tools: null, limits: {}, ...(UIS[t.id] ? { ui: UIS[t.id] } : {}) }), id: t.id }));

export const templateById = (id: string): AppTemplate | null => TEMPLATES.find((t) => t.id === id) ?? null;
