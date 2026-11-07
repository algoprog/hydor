// Answer UIs (shared/answer-ui): an agent shows part of its reply as a card, a table, a chart, a map, a gallery or a small
// tool, by writing a ```ui <name> block of JSON that the pages draw in place (web/src/components/answer); an answer with
// several parts may hold several, and a session as many as its answers need. Every agent hears how when it starts
// (server/formatting); this gives it find_ui, which finds the few UIs that fit what its answer shows, or each of its parts
// (search.ts: by words and by meaning), and says the data each takes, with an example, so it can fill them in.
import { ANSWER_UI_GROUPS, ANSWER_UIS, answerUi, type AnswerUiSpec } from '../../shared/answer-ui/index.ts';
import type { Feature, RunTool } from '../features/types.ts';
import { findUis, UI_K, UI_MAX } from './search.ts';

/** How agents write any UI: said once at the top of what find_ui returns. */
export const HOW_TO_WRITE = [
  'To show one, write it in your reply where it should appear: a line ```ui <name>, its data as one JSON object, then a line ``` . It draws in place as you write.',
  'In the types: md is Markdown (bold, links, `code`, $maths$); image is a picture’s address from a search, find_media or a page you read (never a guessed one), or a path on this computer; url is a link; date is YYYY-MM-DD, time HH:MM, datetime YYYY-MM-DDTHH:MM; tone is "good", "warn", "bad", "info" or "neutral"; a field with ? may be left out. Give numbers as numbers. The example only shows the form: fill it with your own answer’s content.',
  'An answer with several parts may hold several blocks, each where it belongs, with a line of text between them. This holds for every answer in the conversation: in later turns use these UIs again without looking them up (the same UI again with its data brought up to date, too), and call find_ui again whenever an answer needs others.',
  'Keep a sentence or two of text with them, and do not repeat their content in words.',
].join(' ');

/** How many parts of one answer find_ui looks for at once, and how many UIs it gives for each unless k says. */
export const MAX_QUERIES = 6;
const PART_K = 3;

/** A UI as find_ui gives it: its name and title, what it is for, its data's type and an example of it. */
export function describeUi(s: AnswerUiSpec, example = true): string {
  return [`## ${s.id}: ${s.title}`, s.use, 'Data:', s.shape, ...(example ? ['Example:', `\`\`\`ui ${s.id}`, JSON.stringify(s.example), '```'] : [])].join('\n');
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
      `For an answer with several parts that each want a UI of their own, give queries instead, one for each part (["day-by-day trip itinerary", "weather forecast", "packing list"], up to ${MAX_QUERIES}): you get the best ${PART_K} for each. Or give names to get those UIs by name.`,
      'Call it in any turn of the conversation, as often as answers need. Use UIs only where they make the answer clearly better than text; plain conversation, short answers, explanations and code changes stay text.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the answer shows, in a few words.' },
        queries: { type: 'array', items: { type: 'string' }, description: `The parts of one answer that each want a UI, a few words each (up to ${MAX_QUERIES}).` },
        k: { type: 'number', description: `How many to get (1 to ${UI_MAX}; ${UI_K} for a query, ${PART_K} for each of queries, unless set).` },
        names: { type: 'array', items: { type: 'string' }, description: 'UIs to get by name instead (from an earlier find_ui).' },
      },
    },
    async run(args, ctx) {
      const names = Array.isArray(args.names) ? args.names.map(String).filter((n) => n.trim()) : [];
      if (names.length) {
        const specs = [...new Map(names.map((n) => answerUi(n)).filter((s): s is AnswerUiSpec => !!s).map((s) => [s.id, s])).values()].slice(0, UI_MAX);
        const unknown = names.filter((n) => !answerUi(n));
        if (!specs.length) return { text: `No answer UI is called ${unknown.map((n) => `“${n}”`).join(', ')}. The UIs:\n${allUiNames()}`, isError: true };
        return [HOW_TO_WRITE, unknown.length ? `(No UI is called ${unknown.map((n) => `“${n}”`).join(', ')}.)` : '', ...specs.map((s) => describeUi(s))].filter(Boolean).join('\n\n');
      }
      // Several parts of one answer: the best few for each, each UI described once.
      const parts = [...new Set([...(Array.isArray(args.queries) ? args.queries : []), ...(Array.isArray(args.queries) && typeof args.query === 'string' ? [args.query] : [])].map((q) => String(q ?? '').trim()).filter(Boolean))].slice(0, MAX_QUERIES);
      if (parts.length > 1 || (parts.length === 1 && Array.isArray(args.queries))) {
        const kp = Math.max(1, Math.min(UI_MAX, Math.round(Number(args.k)) || PART_K));
        const each = await Promise.all(parts.map(async (q) => ({ q, found: (await findUis(ctx.deps.db, q, kp)).found })));
        // Each part's best first, then each part's second…: at most UI_MAX, each once; an example only for a part's best.
        const order: { spec: AnswerUiSpec; best: boolean }[] = [];
        for (let r = 0; r < kp; r++) for (const e of each) if (e.found[r] && !order.some((o) => o.spec.id === e.found[r].spec.id)) order.push({ spec: e.found[r].spec, best: r === 0 });
        const shown = order.slice(0, UI_MAX);
        if (!shown.length) return `No answer UI matched any of ${parts.map((q) => `“${q}”`).join(', ')}: answer in text, or call find_ui with other words, or by name. The UIs, by group:\n${allUiNames()}`;
        const lines = each.map((e) => `- “${e.q}”: ${e.found.length ? e.found.map((f) => f.spec.id).join(', ') : 'none fits: text'}`);
        const head = `The answer UIs for each part of your answer, best first (each described once below; an example for each part's best, names gives the others' examples). Use the one that fits each part best, or text where none does.\n${lines.join('\n')}`;
        return [head, HOW_TO_WRITE, ...shown.map((o) => describeUi(o.spec, o.best))].join('\n\n');
      }
      const query = String(parts[0] ?? args.query ?? '').trim();
      if (!query) return { text: 'Give query (what your answer shows, in a few words), queries (one for each part) or names.', isError: true };
      const k = Math.max(1, Math.min(UI_MAX, Math.round(Number(args.k)) || UI_K));
      const { found } = await findUis(ctx.deps.db, query, k);
      if (!found.length) return `No answer UI matched “${query}”: answer in text, or call find_ui with other words, or by name. The UIs, by group:\n${allUiNames()}`;
      const head = `The answer UIs that fit “${query}”, best first (${found.length} of ${ANSWER_UIS.length}). Use the one that fits best, or none if none does; find_ui again with other words finds others.`;
      return [head, HOW_TO_WRITE, ...found.map((f) => describeUi(f.spec))].join('\n\n');
    },
  };
}

export const answers: Feature = {
  id: 'answers',
  tools: () => [findUiTool()],
};
