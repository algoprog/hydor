// Answer UIs (shared/answer-ui): an agent shows part of its reply as a card, a table, a chart, a map, a gallery or a small
// tool, by writing a ```ui <name> block of JSON that the pages draw in place (web/src/components/answer). Every agent hears
// how when it starts (server/formatting); this gives it find_ui, which finds the few UIs that fit what its answer shows
// (search.ts: by words and by meaning) and says the data each takes, with an example, so it can fill one in.
import { ANSWER_UI_GROUPS, ANSWER_UIS, answerUi, type AnswerUiSpec } from '../../shared/answer-ui/index.ts';
import type { Feature, RunTool } from '../features/types.ts';
import { findUis, UI_K, UI_MAX } from './search.ts';

/** How agents write any UI: said once at the top of what find_ui returns. */
export const HOW_TO_WRITE = [
  'To show one, write it in your reply where it should appear: a line ```ui <name>, its data as one JSON object, then a line ``` . It draws in place as you write.',
  'In the types: md is Markdown (bold, links, `code`, $maths$); image is a picture’s address from a search, find_media or a page you read (never a guessed one), or a path on this computer; url is a link; date is YYYY-MM-DD, time HH:MM, datetime YYYY-MM-DDTHH:MM; tone is "good", "warn", "bad", "info" or "neutral"; a field with ? may be left out. Give numbers as numbers. The example only shows the form: fill it with your own answer’s content.',
  'Keep a sentence or two of text with it, and do not repeat its content in words.',
].join(' ');

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
      `Give query: what the answer shows, in a few words with a synonym or two ("compare three laptops by price and battery", "weather forecast for the week", "places to eat on a map"). It searches by words and by meaning; you get the best ${UI_K} (k for more or fewer). Or give names to get those UIs by name.`,
      'Use one only when it makes the answer clearly better than text; plain conversation, short answers, explanations and code changes stay text.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the answer shows, in a few words.' },
        k: { type: 'number', description: `How many to get (1 to ${UI_MAX}; ${UI_K} unless set).` },
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
      const query = String(args.query ?? '').trim();
      if (!query) return { text: 'Give query (what your answer shows, in a few words) or names.', isError: true };
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
