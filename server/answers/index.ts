// Answer UIs (shared/answer-ui): an agent shows part of its reply as a card, a table, a chart, a map, a gallery or a small
// tool, by writing a ```ui <name> block of JSON that the pages draw in place (web/src/components/answer); an answer with
// several parts may hold several, and a session as many as its answers need. Every agent hears how when it starts
// (server/formatting); this gives it find_ui, which finds the few UIs that fit what its answer shows, or each of its parts
// (search.ts: by words and by meaning), and says the data each takes, with an example, so it can fill them in.
import { ANSWER_UI_GROUPS, ANSWER_UIS, answerUi, type AnswerUiSpec } from '../../shared/answer-ui/index.ts';
import type { Feature, RunTool } from '../features/types.ts';
import { dataRoutes } from './data.ts';
import { findUis, UI_K, UI_MAX } from './search.ts';

/** How agents write any UI: said once at the top of what find_ui returns. */
export const HOW_TO_WRITE = [
  'To show one, write it in your reply where it should appear: a line ```ui <name>, its data as one JSON object, then a line ``` . It draws in place as you write.',
  'In the types: md is Markdown (bold, links, `code`, $maths$); image is a picture’s address from a search, find_media or a page you read (never a guessed one), or a path on this computer; url is a link; date is YYYY-MM-DD, time HH:MM, datetime YYYY-MM-DDTHH:MM; tone is "good", "warn", "bad", "info" or "neutral"; a field with ? may be left out. Give numbers as numbers. The example only shows the form: fill it with your own answer’s content.',
  'An answer with several parts may hold several blocks, each where it belongs, with a line of text between them. This holds for every answer in the conversation: in later turns use these UIs again without looking them up (the same UI again with its data brought up to date, too), and call find_ui again whenever an answer needs others.',
  'Keep a sentence or two of text with them, and do not repeat their content in words.',
].join(' ');

/**
 * How a card reads its numbers from a Library spreadsheet or a data file (shared/answer-ui/data-ref.ts): said once,
 * after the UIs, when find_ui gives one that can.
 */
export const REF_HOW = [
  'Reading numbers from a spreadsheet or a file: the UIs above that say "Or from a spreadsheet or a file" take, in place of their values, where the numbers are and what of them to show, and read them each time they are shown (a card pinned to a board stays current with its spreadsheet). Use it when the numbers live in a spreadsheet of the user’s Library or in a data file, when there are more than a few dozen rows, or for a card the user may pin and keep; type the values in for a few numbers of your own.',
  '- from: {"sheet": "Shop numbers", "range": "Sales"}: a Library spreadsheet by its name or id; range a tab’s name for all of it (rows added later are read too: best for a card to keep), whole columns ("Sales!A:D"), cells ("Sales!A1:D400": those alone) or a named range; the first tab unless set; the first row holds the headings. Or {"file": "data/sales.csv"}: a CSV, TSV, JSON, JSONL or GeoJSON file in the session’s folder (a path from it) or its project’s (a full path), up to 50 MB (JSON 20 MB) and 1,000,000 rows.',
  '- Columns by their headings, as they are or summed up: sum(Revenue), avg, median, count() (rows), count(Revenue) (filled cells), distinct (different values), min, max, first, last; "… as Label" names one. Grouped rows give a column that is not grouped by its first value.',
  "- where: a filter such as \"Region = 'EU' and Revenue > 1000\": = != < <= > >=, in ('A', 'B'), contains 'x', starts with, ends with, is empty, is not empty, between 1 and 5, and, or, not, brackets. Words go in single quotes and match in any case; a heading with spaces goes in [brackets]; dates written 2026-01-31 compare in order.",
  '- groupBy: a heading (or a list): a row for each of its values. sort: a heading or what the card shows, "-" first for the highest first ("-sum(Revenue)"). limit: how many rows.',
  'Read the headings first (get_page for a spreadsheet, the first lines of a file) so the names match. The card names its source and when it was read; a name that does not match shows in it as a plain message, so check the card drew.',
].join('\n');

/** The rules for reading from a source, when any of these UIs can. */
const refHow = (specs: AnswerUiSpec[]) => (specs.some((s) => s.ref) ? [REF_HOW] : []);

/** How many parts of one answer find_ui looks for at once, and how many UIs it gives for each unless k says. */
export const MAX_QUERIES = 6;
const PART_K = 3;

/** A UI as find_ui gives it: its name and title, what it is for, its data's type and an example of it. */
export function describeUi(s: AnswerUiSpec, example = true): string {
  return [
    `## ${s.id}: ${s.title}`,
    s.use,
    'Data:',
    s.shape,
    ...(example ? ['Example:', `\`\`\`ui ${s.id}`, JSON.stringify(s.example), '```'] : []),
    ...(s.ref ? ['Or from a spreadsheet or a file (how: at the end), in place of its values:', s.ref.shape, ...(example ? ['Example:', `\`\`\`ui ${s.id}`, JSON.stringify(s.ref.example), '```'] : [])] : []),
  ].join('\n');
}

/** Every UI by name, group by group: what find_ui says when nothing matched, to pick from by name. */
export function allUiNames(): string {
  return ANSWER_UI_GROUPS.map((g) => {
    const list = ANSWER_UIS.filter((s) => s.group === g.id);
    return list.length ? `${g.label}: ${list.map((s) => `${s.id} (${s.title.toLowerCase()})`).join(', ')}` : '';
  })
    .filter(Boolean)
    .join('\n');
}

export function findUiTool(): RunTool {
  return {
    name: 'find_ui',
    annotations: { readOnlyHint: true },
    description: [
      `Finds the app's answer UIs that fit what your answer shows, among ${ANSWER_UIS.length} (cards, comparison tables, charts, maps, recipes, forecasts, itineraries, timelines, quizzes, calculators, galleries, product grids, code and more), each with the data it takes and an example, so you can show your answer in one: a \`\`\`ui <name> block of JSON in your reply, drawn in place in the app's look.`,
      `Give query: what the answer shows, in a few words with a synonym or two ("compare three laptops by price and battery", "weather forecast for the week", "places to eat on a map"). It searches by words and by meaning; you get the best ${UI_K} (k for more or fewer).`,
      `For an answer with several parts that each want a UI of their own, give queries instead, one for each part (["day-by-day trip itinerary", "weather forecast", "packing list"], up to ${MAX_QUERIES}): you get the best ${PART_K} for each. Give names to get the UIs you already know you want by name (["comparison", "follow-ups"]), with or without queries for the other parts.`,
      'Call it in any turn of the conversation, as often as answers need: a part of an answer that is something to look at, compare, choose from, follow, try or practise reads better in a UI than in prose. Plain conversation, short answers and code changes stay text.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the answer shows, in a few words.' },
        queries: { type: 'array', items: { type: 'string' }, description: `The parts of one answer that each want a UI, a few words each (up to ${MAX_QUERIES}).` },
        k: { type: 'number', description: `How many to get (1 to ${UI_MAX}; ${UI_K} for a query, ${PART_K} for each of queries, unless set).` },
        names: { type: 'array', items: { type: 'string' }, description: 'UIs to get by name (the ones you know you want), alone or beside query or queries.' },
      },
    },
    async run(args, ctx) {
      const names = Array.isArray(args.names) ? args.names.map(String).filter((n) => n.trim()) : [];
      const named = [...new Map(names.map((n) => answerUi(n)).filter((s): s is AnswerUiSpec => !!s).map((s) => [s.id, s])).values()].slice(0, UI_MAX);
      const unknown = names.filter((n) => !answerUi(n));
      const multi = Array.isArray(args.queries);
      const parts = [...new Set([...(multi ? args.queries : []), ...(typeof args.query === 'string' ? [args.query] : [])].map((q) => String(q ?? '').trim()).filter(Boolean))].slice(0, MAX_QUERIES);
      if (names.length && !parts.length) {
        if (!named.length) return { text: `No answer UI is called ${unknown.map((n) => `“${n}”`).join(', ')}. The UIs:\n${allUiNames()}`, isError: true };
        return [HOW_TO_WRITE, unknown.length ? `(No UI is called ${unknown.map((n) => `“${n}”`).join(', ')}.)` : '', ...named.map((s) => describeUi(s)), ...refHow(named)].filter(Boolean).join('\n\n');
      }
      // The UIs named come first, each with its example; what the queries find comes after them, each UI described once.
      const taken = new Set(named.map((s) => s.id));
      const room = UI_MAX - named.length;
      const first = [unknown.length ? `(No UI is called ${unknown.map((n) => `“${n}”`).join(', ')}.)` : '', ...named.map((s) => describeUi(s))].filter(Boolean);
      const namedHead = named.length ? `The UIs you named (${named.map((s) => s.id).join(', ')}), then the` : 'The';
      // Several parts of one answer: the best few for each, each UI described once.
      if (parts.length > 1 || (parts.length === 1 && multi)) {
        const kp = Math.max(1, Math.min(UI_MAX, Math.round(Number(args.k)) || PART_K));
        const each = await Promise.all(parts.map(async (q) => ({ q, found: (await findUis(ctx.deps.db, q, kp)).found })));
        // Each part's best first, then each part's second…: at most UI_MAX, each once; an example only for a part's best.
        const order: { spec: AnswerUiSpec; best: boolean }[] = [];
        for (let r = 0; r < kp; r++) for (const e of each) if (e.found[r] && !taken.has(e.found[r].spec.id) && !order.some((o) => o.spec.id === e.found[r].spec.id)) order.push({ spec: e.found[r].spec, best: r === 0 });
        const shown = order.slice(0, room);
        if (!shown.length && !named.length) return `No answer UI matched any of ${parts.map((q) => `“${q}”`).join(', ')}: answer in text, or call find_ui with other words, or by name. The UIs, by group:\n${allUiNames()}`;
        const lines = each.map((e) => `- “${e.q}”: ${e.found.length ? e.found.map((f) => f.spec.id).join(', ') : 'none fits: text'}`);
        const head = `${namedHead} answer UIs for each part of your answer, best first (each described once below; an example for each part's best, names gives the others' examples). Use the one that fits each part best, or text where none does.\n${lines.join('\n')}`;
        return [head, HOW_TO_WRITE, ...first, ...shown.map((o) => describeUi(o.spec, o.best)), ...refHow([...named, ...shown.map((o) => o.spec)])].join('\n\n');
      }
      const query = parts[0] ?? '';
      if (!query) return { text: 'Give query (what your answer shows, in a few words), queries (one for each part) or names.', isError: true };
      const k = Math.max(1, Math.min(UI_MAX, Math.round(Number(args.k)) || UI_K));
      const found = (await findUis(ctx.deps.db, query, Math.min(UI_MAX, k + named.length))).found.filter((f) => !taken.has(f.spec.id)).slice(0, Math.min(k, room));
      if (!found.length && !named.length) return `No answer UI matched “${query}”: answer in text, or call find_ui with other words, or by name. The UIs, by group:\n${allUiNames()}`;
      const head = `${namedHead} answer UIs that fit “${query}”, best first (${found.length} of ${ANSWER_UIS.length}). Use the one that fits best, or none if none does; find_ui again with other words finds others.`;
      return [head, HOW_TO_WRITE, ...first, ...found.map((f) => describeUi(f.spec)), ...refHow([...named, ...found.map((f) => f.spec)])].join('\n\n');
    },
  };
}

export const answers: Feature = {
  id: 'answers',
  // Cards that read their data from a Library spreadsheet or a data file (data.ts).
  routes: dataRoutes,
  tools: () => [findUiTool()],
};
