// What a function of a web app is about to be given, read from its input schema: each input as a label and a value for the card that asks
// before a function changes what the app keeps (in a run and in a session), instead of the JSON the agent sent. The label is the property's
// title, else its name made readable (note_text, noteText → Note text); a long value is cut and marked long, for the card to fold; the input as
// it was sent comes along for whoever wants to read that.

export interface Fact {
  label: string;
  value: string;
  /** Long or on several lines: the card folds it. */
  long?: boolean;
}

type Json = Record<string, unknown>;
const rec = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

/** A property's name as words: note_text, note-text and noteText all say "Note text". */
export function readable(name: string): string {
  const t = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : name;
}

const FOLD_AT = 140;
const SHOWN = 1200;
const MAX_FACTS = 12;

/** One value in words: a yes or no, a number as it is, a list of plain values joined, anything else as compact JSON. */
export function valueText(v: unknown): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean")) return v.map(valueText).join(", ");
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return "";
  }
}

/** The inputs as labels (a last one with no label says how many more there are) and values: the schema's properties in its order first, then any the schema does not name. Empty ones are left out. */
export function inputFacts(schema: unknown, input: unknown): Fact[] {
  const given = rec(input);
  const props = rec(rec(schema).properties);
  const names = [...Object.keys(props).filter((k) => k in given), ...Object.keys(given).filter((k) => !(k in props))];
  const out: Fact[] = [];
  for (const k of names) {
    const v = given[k];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    if (out.length === MAX_FACTS) {
      out.push({ label: "", value: `…and ${names.length - names.indexOf(k)} more` });
      break;
    }
    const title = rec(props[k]).title;
    const text = valueText(v).trim();
    const long = text.length > FOLD_AT || text.includes("\n");
    out.push({ label: typeof title === "string" && title.trim() ? title.trim().slice(0, 60) : readable(k).slice(0, 60), value: text.length > SHOWN ? `${text.slice(0, SHOWN - 1).trimEnd()}…` : text, ...(long ? { long: true } : {}) });
  }
  return out;
}

/** The input as it was sent, for the card's "as it was sent". */
export function rawInput(input: unknown, max = 3000): string {
  let s = "";
  try {
    s = JSON.stringify(input, null, 2) ?? "";
  } catch {}
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
