// What changes each time? (Changes.tsx), as changes to the app: the request a draft came from, in pieces, each
// question's words marked. Making a question's words fixed again takes it out of the form and puts its words back where
// the task used it; asking other words each time makes a new question and puts it in the task where they were.
import type { AppRecipe } from '@shared/apps';
import { fieldId } from '@shared/apps';

/** One piece of the request: words that stay, or the words a question's answer takes the place of. */
export type DraftPart = { text: string; field?: string };

/** The pieces with words that stay next to each other as one, and none empty. */
export function tidyParts(parts: DraftPart[]): DraftPart[] {
  return parts.reduce<DraftPart[]>((out, p) => {
    if (!p.text) return out;
    const prev = out[out.length - 1];
    if (prev && !prev.field && !p.field) prev.text += p.text;
    else out.push({ ...p });
    return out;
  }, []);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every text in a value (the task, a flow's steps), changed by `f`. */
function mapTexts<T>(v: T, f: (s: string) => string): T {
  if (typeof v === 'string') return f(v) as T;
  if (Array.isArray(v)) return v.map((x) => mapTexts(x, f)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapTexts(x, f)])) as T;
  return v;
}

/** The words a flow's steps say (what each is asked, a tool's inputs), changed by `f`; ids, kinds and tools' names stay. */
function mapStepTexts<T>(v: T, f: (s: string) => string): T {
  if (Array.isArray(v)) return v.map((x) => mapStepTexts(x, f)) as T;
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'instructions' || k === 'question' ? (typeof x === 'string' ? f(x) : x) : k === 'with' ? mapTexts(x, f) : mapStepTexts(x, f)])) as T;
  return v;
}

/** A text with a question's place given its words: {{id}} (and {{inputs.id}}) as them, what shows only when it is empty gone. */
function fill(text: string, id: string, words: string): string {
  const e = esc(id);
  return text
    .replace(new RegExp(`\\{\\{\\s*\\^\\s*${e}\\s*\\}\\}[\\s\\S]*?\\{\\{\\s*\\/\\s*${e}\\s*\\}\\}`, 'g'), '')
    .replace(new RegExp(`\\{\\{\\s*[#/]\\s*${e}\\s*\\}\\}`, 'g'), '')
    .replace(new RegExp(`\\{\\{\\s*(?:inputs\\.)?${e}\\s*\\}\\}`, 'g'), () => words);
}

/** The question of the piece at `i` no longer asked: its words fixed in the task, the question out of the form and its examples. */
export function fixWords(recipe: AppRecipe, parts: DraftPart[], i: number): { recipe: AppRecipe; parts: DraftPart[] } {
  const p = parts[i];
  if (!p?.field) return { recipe, parts };
  const id = p.field;
  const next: AppRecipe = {
    ...recipe,
    fields: recipe.fields.filter((f) => f.id !== id),
    prompt: fill(recipe.prompt, id, p.text),
    ...(recipe.flow ? { flow: mapTexts(recipe.flow, (s) => fill(s, id, p.text)) } : {}),
    ...(recipe.examples ? { examples: recipe.examples.map((x) => ({ ...x, inputs: Object.fromEntries(Object.entries(x.inputs).filter(([k]) => k !== id)) })) } : {}),
  };
  return { recipe: next, parts: tidyParts(parts.map((x, j) => (j === i ? { text: x.text } : x))) };
}

/**
 * The words from `start` to `end` of the piece at `i` asked each time: a new short question named by them (its example
 * answer, and the first example's, those words), its {{id}} in the task where they were (or after it, when the task says
 * them another way).
 */
export function askEachTime(recipe: AppRecipe, parts: DraftPart[], i: number, start: number, end: number): { recipe: AppRecipe; parts: DraftPart[]; id: string } | null {
  const p = parts[i];
  if (!p || p.field) return null;
  const raw = p.text.slice(start, end);
  const words = raw.trim();
  if (!words) return null;
  const from = start + raw.indexOf(words);
  const to = from + words.length;
  const label = (words.charAt(0).toUpperCase() + words.slice(1)).replace(/\s+/g, ' ').slice(0, 80);
  const id = fieldId(words, recipe.fields.map((f) => f.id));
  const ref = `{{${id}}}`;
  // Where the task says those words, the question's answer goes; the first time in the task, every time in steps.
  const at = recipe.prompt.toLowerCase().indexOf(words.toLowerCase());
  const prompt = at >= 0 ? recipe.prompt.slice(0, at) + ref + recipe.prompt.slice(at + words.length) : recipe.prompt.trim() ? `${recipe.prompt}\n\nIn place of “${words}”: ${ref}` : recipe.prompt;
  const flow = recipe.flow ? mapStepTexts(recipe.flow, (s) => s.replace(new RegExp(esc(words), 'gi'), ref)) : undefined;
  const [first, ...rest] = recipe.examples ?? [];
  const next: AppRecipe = {
    ...recipe,
    fields: [...recipe.fields, { id, label, type: 'text', placeholder: words.slice(0, 160) }],
    prompt,
    ...(flow ? { flow } : {}),
    ...(first ? { examples: [{ ...first, inputs: { ...first.inputs, [id]: words } }, ...rest] } : {}),
  };
  const split: DraftPart[] = [{ text: p.text.slice(0, from) }, { field: id, text: words }, { text: p.text.slice(to) }];
  return { recipe: next, parts: tidyParts([...parts.slice(0, i), ...split, ...parts.slice(i + 1)]), id };
}
