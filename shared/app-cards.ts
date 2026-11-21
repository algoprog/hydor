// Cards in an app's answer: an answer field of type "ui" holds the data of one of the answer UIs agents show in a chat
// (shared/answer-ui: a comparison, an itinerary, a recipe…), and the pages draw it with the same view. This is the part
// that needs the catalog, which is large: it tells shared/apps.ts how to name and check a card when it is loaded (the
// server always loads it: server/apps/runs.ts), and says what a card's agent must hand in, and a card as text for what
// cannot draw it (a CSV cell, another agent's tool, a chat's agent). The pages load it only where a card is drawn or
// picked, never at once.
import { answerUi, type AnswerUiSpec } from './answer-ui/index.ts';
import { answerMarkdown, answerText } from './answer-ui/text.ts';
import { dataProblems } from './boards.ts';
import { fieldId, setCardRules, type AnswerField } from './apps.ts';

setCardRules({
  name: (ui) => answerUi(ui)?.id,
  check: (ui, data) => {
    const spec = answerUi(ui);
    return spec ? dataProblems(spec, data) : [`there is no card called “${ui}”`];
  },
});

/** The card a field shows, from the catalog. */
export const cardSpec = (ui: string | undefined): AnswerUiSpec | undefined => (ui ? answerUi(ui) : undefined);

/** A card's example data (a copy), as the gallery draws it: what the builder's preview shows before a run. */
export function cardExample(ui: string | undefined): Record<string, unknown> | undefined {
  const spec = cardSpec(ui);
  return spec ? (JSON.parse(JSON.stringify(spec.example)) as Record<string, unknown>) : undefined;
}

/** How long an example may be in what an agent is told: the shape says the rest. */
const EXAMPLE_MAX = 1800;

/**
 * What the agent that fills an app's card fields is told of them, after the list of fields: each card's type and a
 * short example, as find_ui gives them, and that its pictures must be real. Nothing when there is no card field.
 */
export function cardLines(fields: AnswerField[]): string[] {
  const cards = fields.filter((f) => f.type === 'ui');
  if (!cards.length) return [];
  const out = [
    'Each card field holds one JSON object: the data of the card that shows it, of the type below. In the types: md is Markdown, url a link, date YYYY-MM-DD, time HH:MM, tone "good", "warn", "bad", "info" or "neutral", and a field with ? may be left out; give numbers as numbers. Pictures (image) must be real: an address from a search, find_media or a page you read, or a file on this computer; never a guessed one. The example only shows the form: fill it with this run’s own content.',
  ];
  for (const f of cards) {
    const spec = cardSpec(f.ui);
    if (!spec) continue;
    const ex = JSON.stringify(spec.example);
    out.push(`${f.id}: the ${spec.id} card (${spec.title}). Its data:`, spec.shape.trim(), `Example: ${ex.length > EXAMPLE_MAX ? `${ex.slice(0, EXAMPLE_MAX)}… (cut)` : ex}`);
  }
  return out;
}

/** A card's data as text: plain (a CSV cell) or Markdown (what an agent reads). */
export function cardText(ui: string | undefined, data: unknown, how: 'text' | 'markdown' = 'text'): string {
  const spec = cardSpec(ui);
  if (how === 'markdown') return answerMarkdown(spec?.id ?? ui ?? '', data, spec?.title);
  return answerText(data, spec?.title);
}

/** A result with each card field as its text, for those who read it rather than draw it; the rest as it is. */
export function cardsAsText(answer: AnswerField[], result: Record<string, unknown> | null | undefined, how: 'text' | 'markdown' = 'markdown'): Record<string, unknown> | null {
  if (!result) return result ?? null;
  const cards = answer.filter((f) => f.type === 'ui' && result[f.id] && typeof result[f.id] === 'object');
  if (!cards.length) return result;
  return { ...result, ...Object.fromEntries(cards.map((f) => [f.id, cardText(f.ui, result[f.id], how)])) };
}

/** Answer fields for the cards of a reply, one each: their ids from the cards' names as the reply wrote them (compare, compare_2…). */
export function cardFields(blocks: { name: string; data: Record<string, unknown> }[], taken: string[] = []): AnswerField[] {
  const ids = [...taken];
  const out: AnswerField[] = [];
  for (const b of blocks) {
    const spec = cardSpec(b.name);
    if (!spec) continue;
    const id = fieldId(b.name || spec.id, ids);
    ids.push(id);
    const title = typeof b.data.title === 'string' && b.data.title.trim() ? b.data.title.trim().slice(0, 80) : spec.title;
    out.push({ id, label: title, type: 'ui', ui: spec.id, required: true });
  }
  return out;
}

/** What is wrong with the card fields of an answer as given (an agent's app_save, a page's save): a card with no name, or one the catalog does not have. */
export function cardFieldProblems(raw: unknown): string[] {
  const out: string[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    if (!x || typeof x !== 'object' || (x as { type?: unknown }).type !== 'ui') continue;
    const f = x as { id?: unknown; label?: unknown; ui?: unknown };
    const name = String(f.id ?? f.label ?? '?');
    if (typeof f.ui !== 'string' || !f.ui.trim()) out.push(`Answer field ${name}: a card needs ui, the name of the card that shows it (find_ui finds the one that fits)`);
    else if (!answerUi(f.ui)) out.push(`Answer field ${name}: there is no card called “${f.ui.slice(0, 40)}” (find_ui finds the one that fits)`);
  }
  return out;
}
