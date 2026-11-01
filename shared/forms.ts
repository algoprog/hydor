// Forms an MCP server asks the user to fill in partway through a call (MCP "elicitation"): a connected
// app, or one of Codex's own servers. The fields come from the JSON schema the server sends and show in
// an approval card as the same controls as a template's form (AppForm); the answers go back in the
// schema's own types.
import { readDate, readNumber, type AppField } from './apps.ts';

/** The form part of an approval card. */
export interface ApprovalForm {
  fields: AppField[];
  /** Instead of fields: a page the server asks the user to open themselves (URL mode). */
  url?: string;
}

type Json = Record<string, any>;

/** Each choice's label and the value the server wants back. */
function choices(p: Json): { labels: string[]; values: unknown[] } | null {
  const pick = (list: unknown[]) => list.filter((x): x is Json => !!x && typeof x === 'object' && 'const' in x);
  if (Array.isArray(p.enum)) return { values: p.enum, labels: p.enum.map((v: unknown, i: number) => String(Array.isArray(p.enumNames) && p.enumNames[i] != null ? p.enumNames[i] : v)) };
  const titled = Array.isArray(p.oneOf) ? pick(p.oneOf) : Array.isArray(p.anyOf) ? pick(p.anyOf) : [];
  if (titled.length) return { values: titled.map((x) => x.const), labels: titled.map((x) => String(x.title ?? x.const)) };
  return null;
}

/** The choices of a multiple-choice field (an array of strings from a list). */
const multiChoices = (p: Json) => (p.type === 'array' && p.items && typeof p.items === 'object' ? choices(p.items) : null);

const words = (id: string) => {
  const s = id.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : id;
};

const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, n) : undefined);

function range(p: Json): string | undefined {
  const lo = typeof p.minimum === 'number' ? p.minimum : undefined;
  const hi = typeof p.maximum === 'number' ? p.maximum : undefined;
  if (lo !== undefined && hi !== undefined) return `From ${lo} to ${hi}`;
  if (lo !== undefined) return `At least ${lo}`;
  if (hi !== undefined) return `At most ${hi}`;
  return undefined;
}

function fieldOf(id: string, p: Json, required: boolean): AppField {
  const base = { id, label: clip(p.title, 80) ?? words(id), required: required || undefined, help: clip(p.description, 240) };
  const many = multiChoices(p);
  if (many) {
    const defaults = Array.isArray(p.default) ? p.default.map((v: unknown) => many.labels[many.values.indexOf(v)]).filter(Boolean) : [];
    return { ...base, type: 'choice', multi: true, options: many.labels, default: defaults.length ? defaults.join('\n') : undefined };
  }
  const one = choices(p);
  if (one) {
    const at = one.values.indexOf(p.default);
    return { ...base, type: 'choice', options: one.labels, default: at >= 0 ? one.labels[at] : undefined };
  }
  if (p.type === 'boolean') return { ...base, type: 'yesno', default: p.default === true ? 'Yes' : 'No' };
  if (p.type === 'number' || p.type === 'integer') return { ...base, type: 'number', help: [base.help, range(p)].filter(Boolean).join(' · ') || undefined, default: typeof p.default === 'number' ? String(p.default) : undefined };
  const def = typeof p.default === 'string' ? p.default : undefined;
  if (p.format === 'date') return { ...base, type: 'date', default: def };
  const placeholder = p.format === 'email' ? 'name@example.com' : p.format === 'uri' ? 'https://' : p.format === 'date-time' ? 'YYYY-MM-DD HH:MM' : undefined;
  return { ...base, type: typeof p.maxLength === 'number' && p.maxLength >= 300 ? 'long' : 'text', placeholder, default: def };
}

/** The fields of a requested schema ({ type: "object", properties, required }), in its order. */
export function formFields(schema: unknown): AppField[] {
  const s = (schema && typeof schema === 'object' ? schema : {}) as Json;
  const props: Json = s.properties && typeof s.properties === 'object' ? s.properties : {};
  const required = new Set(Array.isArray(s.required) ? s.required.map(String) : []);
  return Object.entries(props)
    .filter(([, p]) => p && typeof p === 'object')
    .slice(0, 40)
    .map(([id, p]) => fieldOf(id, p as Json, required.has(id)));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The form's answers in the schema's types ({ name: "Ada", age: 36, subscribe: true, tags: ["a"] }), or
 * what to fix, by field. Fields left empty are left out (needed ones are an error).
 */
export function formContent(schema: unknown, values: Record<string, string>): { content: Record<string, unknown>; errors: Record<string, string> } {
  const s = (schema && typeof schema === 'object' ? schema : {}) as Json;
  const props: Json = s.properties && typeof s.properties === 'object' ? s.properties : {};
  const content: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of formFields(schema)) {
    const p: Json = props[f.id];
    const raw = String(values[f.id] ?? '').trim();
    if (f.type === 'yesno') {
      content[f.id] = raw === 'Yes';
      continue;
    }
    if (!raw) {
      if (f.required) errors[f.id] = 'Needed';
      continue;
    }
    if (f.multi) {
      const many = multiChoices(p)!;
      const picked = raw.split('\n').map((l) => many.values[many.labels.indexOf(l)]).filter((v) => v !== undefined);
      if (typeof p.minItems === 'number' && picked.length < p.minItems) errors[f.id] = `Pick at least ${p.minItems}`;
      else if (typeof p.maxItems === 'number' && picked.length > p.maxItems) errors[f.id] = `Pick at most ${p.maxItems}`;
      else content[f.id] = picked;
      continue;
    }
    if (f.type === 'choice') {
      const one = choices(p)!;
      const at = one.labels.indexOf(raw);
      if (at < 0) errors[f.id] = 'Pick one of the choices';
      else content[f.id] = one.values[at];
      continue;
    }
    if (f.type === 'number') {
      const n = readNumber(raw);
      if (n === null) errors[f.id] = 'A number, please';
      else if (p.type === 'integer' && !Number.isInteger(n)) errors[f.id] = 'A whole number, please';
      else if (typeof p.minimum === 'number' && n < p.minimum) errors[f.id] = `At least ${p.minimum}`;
      else if (typeof p.maximum === 'number' && n > p.maximum) errors[f.id] = `At most ${p.maximum}`;
      else content[f.id] = n;
      continue;
    }
    if (f.type === 'date') {
      const d = readDate(raw);
      if (!d || d.length !== 10) errors[f.id] = 'A date, please';
      else content[f.id] = d;
      continue;
    }
    if (typeof p.minLength === 'number' && raw.length < p.minLength) errors[f.id] = `At least ${p.minLength} characters`;
    else if (typeof p.maxLength === 'number' && raw.length > p.maxLength) errors[f.id] = `At most ${p.maxLength} characters`;
    else if (p.format === 'email' && !EMAIL.test(raw)) errors[f.id] = 'An email address, please';
    else if (p.format === 'uri' && !/^[a-z][a-z0-9+.-]*:\S+$/i.test(raw)) errors[f.id] = 'A full address, like https://example.com';
    else if (p.format === 'date-time' && !Number.isFinite(Date.parse(raw))) errors[f.id] = 'A date and time, please';
    else content[f.id] = p.format === 'date-time' ? new Date(Date.parse(raw)).toISOString() : raw;
  }
  return { content, errors };
}

/** What the form's initial values are: each field's default (a template form's own rule). */
export const formDefaults = (fields: AppField[]): Record<string, string> => Object.fromEntries(fields.map((f) => [f.id, f.default ?? (f.type === 'yesno' ? 'No' : '')]));
