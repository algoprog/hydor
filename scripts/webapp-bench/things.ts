// The kinds of thing of a brief, bound to what a builder's judge.json says about them: which key each field has, how a value is written for it, and how a row is added, listed,
// read, changed and removed. Nothing here knows a framework: it sends JSON (or a form) to the addresses it was given and reads JSON back.
import { fold, slug } from './lib.ts';
import { type ThingDecl, type FieldDecl, type JudgeJson, declared, fieldDecl, nameFit, opOf, withId } from './acceptance.ts';
import type { Client, Reply } from './http.ts';
import { at, ok } from './http.ts';
import type { VField, VKind, VersusExpect } from './expect.ts';
import { type Row, resolveRow } from './expect-base.ts';

export interface BoundField {
  spec: VField;
  key: string;
  /** The words the app takes for a choice, as the builder listed them: the maker's word (folded) to the app's. */
  words?: Map<string, string>;
  wordList?: string[];
}

/** A field the app has that the brief does not name (one it asks for anyway): sent in every row with an ordinary value. */
export interface Extra {
  name: string;
  key: string;
  value: unknown;
}

export interface Bound {
  kind: VKind;
  name: string;
  decl: ThingDecl;
  /** Only the fields the app has: what judge.json maps. A field that may be had and is not mapped is not here, and nothing is sent for it or tried on it. */
  fields: Map<string, BoundField>;
  extras: Extra[];
  /** The fields the maker needs that judge.json does not map (said once, by judge-json). */
  missing: string[];
}

/** A choice's word compared by its letters and digits only, with "&" and "and" left out: "baby & household", "baby_household" and "baby and household" are one. */
export const cslug = (text: string): string => slug(text.replace(/&|\band\b/gi, ' '));

const wordsOf = (d: FieldDecl): { words?: Map<string, string>; wordList?: string[] } => {
  if (!d.choices) return {};
  if (Array.isArray(d.choices)) return { words: new Map(d.choices.map((w) => [cslug(w), w])), wordList: d.choices };
  return { words: new Map(Object.entries(d.choices).map(([maker, app]) => [cslug(maker), app])), wordList: Object.keys(d.choices) };
};

const same = (a: string, b: string) => slug(a) === slug(b);

/** Finds each kind of the brief among the `things` of judge.json, and each field among the kind's `fields`. What is missing is said in sentences. */
export function bind(e: VersusExpect, j: JudgeJson): { bound: Map<string, Bound>; problems: string[] } {
  const bound = new Map<string, Bound>();
  const problems: string[] = [];
  for (const kind of e.kinds) {
    const found = declared(j.things, kind.id, kind.names);
    if (!found) {
      problems.push(`no entry in "things" for ${kind.id} (the maker's word for it; any of ${[kind.id, ...kind.names].slice(0, 6).join(', ')} is read)`);
      continue;
    }
    const decl = found.value;
    const fields = new Map<string, BoundField>();
    const taken = new Set<string>();
    const given = Object.entries(decl.fields ?? {});
    // a field is found by its own id first, then by any spelling the plan allows (the maker's own words are among them); a name is used for one field only
    for (const pass of [0, 1]) {
      for (const spec of kind.fields) {
        if (fields.has(spec.id)) continue;
        const hit = given.find(([name]) => !taken.has(name) && (pass === 0 ? same(name, spec.id) : nameFit(name, spec.id, spec.names) === 1000));
        if (!hit) continue;
        taken.add(hit[0]);
        const d = fieldDecl(hit[1])!;
        fields.set(spec.id, { spec, key: d.key, ...wordsOf(d) });
      }
    }
    // what is left is matched by a long spelling found inside the name ("what they would want to fire"): each name goes to the field it fits best, and to none when two fit it as well
    for (;;) {
      const options = given
        .filter(([name]) => !taken.has(name))
        .map(([name, d]) => {
          const fits = kind.fields.filter((s) => !fields.has(s.id)).map((s) => ({ s, fit: nameFit(name, s.id, s.names) })).filter((x) => x.fit > 0);
          const best = Math.max(0, ...fits.map((x) => x.fit));
          const top = fits.filter((x) => x.fit === best);
          return { name, d, best, spec: top.length === 1 ? top[0]!.s : undefined };
        })
        .filter((x) => x.spec)
        .sort((x, y) => y.best - x.best);
      const pick = options[0];
      if (!pick) break;
      taken.add(pick.name);
      const d = fieldDecl(pick.d)!;
      fields.set(pick.spec!.id, { spec: pick.spec!, key: d.key, ...wordsOf(d) });
    }
    const lacking = kind.fields.filter((f) => !fields.has(f.id) && !f.mayHave).map((f) => f.id);
    const at_ = `"${found.name}"`;
    const unmatched = given.map(([n]) => n).filter((n) => !taken.has(n));
    if (lacking.length > 0) {
      const spellings = (id: string) => [...new Set([id, ...(kind.fields.find((f) => f.id === id)?.names ?? [])])].slice(0, 8).join(', ');
      // one name left over and one field missing: still not guessed, but said, so that a reader sees at once that the list of names is what is at fault
      const one = lacking.length === 1 && unmatched.length === 1;
      problems.push(
        one
          ? `${at_}: your name "${unmatched[0]}" matches none of the maker's words and the field "${lacking[0]}" has no name: it may be the one, but the judge does not guess (the names it reads for ${lacking[0]} are ${spellings(lacking[0]!)}; use the maker's own words)`
          : `${at_} has no field for ${lacking.map((l) => `${l} (read as ${spellings(l)})`).join('; ')}; its "fields" has ${given.map(([n]) => n).join(', ') || 'none'}${unmatched.length ? `; of those nothing was found for ${unmatched.map((n) => `"${n}"`).join(', ')}` : ''}`,
      );
    }
    // a list of words the app gives for a field must have every word the maker used for it (the change request adds one)
    for (const [id, f] of fields) {
      const wanted = f.spec.choices ?? [];
      const lacks = f.words ? wanted.filter((w) => !f.words!.has(cslug(w))) : [];
      if (lacks.length > 0) problems.push(`${at_} gives a list of words for ${id} without ${lacks.map((w) => `"${w}"`).join(', ')}, which the maker uses`);
    }
    const group = kind.needOne ?? [];
    if (group.length > 0 && !group.some((id) => fields.has(id))) problems.push(`${at_} has no field for any of ${group.join(', ')}: the maker needs at least one of them`);
    if (!decl.list) problems.push(`${at_} has no "list" address`);
    if (!kind.readOnly && !decl.add) problems.push(`${at_} has no "add" address`);
    if (e.teams?.kinds.includes(kind.id) && !decl.teamKey) problems.push(`${at_} has no "teamKey": the key a team's id goes under when a row is added`);
    for (const op of kind.ops ?? []) if (!opOf(decl.one, op)) problems.push(`${at_} has no "one" address that can ${op} a row`);
    // what the app has that no field of the brief is: sent as it is, so that a row is not refused for something the judge did not know of
    const extras: Extra[] = given
      .filter(([name]) => !taken.has(name))
      .map(([name, d]) => ({ name, key: fieldDecl(d)!.key, value: fieldDecl(d)!.example ?? (/mail/i.test(`${name} ${fieldDecl(d)!.key}`) ? 'extra.judge@judge.test' : 'Judge') }));
    const entry: Bound = { kind, name: found.name, decl, fields, extras, missing: lacking };
    bound.set(kind.id, entry);
    continue;
  }
  return { bound, problems };
}

// ------------------------------------------------------------------------------------------------ values

export const SCALE = (j: JudgeJson): number => (j.money === 'cents' ? 100 : 1);

/** The JSON a row is sent as: each value the way the maker would write it, in the app's own keys. `raw` values are sent as they are (a bad value on purpose). */
export function bodyOf(b: Bound, row: Row, ids: Record<string, string[]>, j: JudgeJson, raw: Record<string, unknown> = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const x of b.extras) body[x.key] = x.value;
  for (const [id, f] of b.fields) {
    if (f.spec.readOnly) continue;
    if (id in raw) {
      body[f.key] = raw[id];
      continue;
    }
    const value = row[id];
    if (value === undefined) continue;
    switch (f.spec.kind) {
      case 'money':
        body[f.key] = typeof value === 'number' ? Math.round(value * SCALE(j) * 100) / 100 : value;
        break;
      case 'choice':
        body[f.key] = f.words?.get(cslug(String(value))) ?? value;
        break;
      case 'ref': {
        const m = /^@([\w-]+)\.(\d+)$/.exec(String(value));
        const target = m ? ids[m[1]!]?.[Number(m[2])] : undefined;
        if (target !== undefined) body[f.key] = target;
        break;
      }
      case 'file':
        break;
      default:
        // a field the maker gave no closed list for, which the app holds as a list of words anyway: the maker's word when the app has it, else the app's first
        body[f.key] = f.spec.open && f.wordList?.[0] ? (f.words?.get(cslug(String(value))) ?? f.words?.get(cslug(f.wordList[0])) ?? f.wordList[0]) : value;
    }
  }
  return body;
}

/** Whether what a list or a read gives for a field is what was sent, as the maker wrote it. */
export function sameValue(f: BoundField, got: unknown, wanted: unknown, ids: Record<string, string[]>, j: JudgeJson): boolean {
  if (f.spec.kind === 'file') return true;
  if (f.spec.open && f.wordList) return got !== undefined && got !== null;
  switch (f.spec.kind) {
    case 'integer':
    case 'number':
      return Number(got) === Number(wanted);
    case 'money':
      return Math.abs(Number(got) / SCALE(j) - Number(wanted)) < 0.005;
    case 'yesno':
      return (got === true || got === 1 || got === 'true') === (wanted === true);
    case 'day':
      return typeof got === 'string' && got.slice(0, 10) === wanted;
    case 'choice':
      return typeof got === 'string' && (cslug(got) === cslug(String(wanted)) || f.words?.get(cslug(String(wanted))) === got);
    case 'ref': {
      const m = /^@([\w-]+)\.(\d+)$/.exec(String(wanted));
      const target = m ? ids[m[1]!]?.[Number(m[2])] : undefined;
      const id = typeof got === 'object' && got !== null ? (got as any).id : got;
      return target !== undefined && String(id) === String(target);
    }
    default:
      return typeof got === 'string' && fold(got) === fold(String(wanted));
  }
}

// ------------------------------------------------------------------------------------------------ talking to the app about a kind

/** The rows of a list's answer: the array the builder named, the answer itself when it is one, or the one array in an object. */
export function rowsOf(reply: Reply, path: string | undefined): any[] | null {
  if (!ok(reply) || reply.json === null) return null;
  if (path !== undefined) {
    const found = at(reply.json, path);
    return Array.isArray(found) ? found : null;
  }
  if (Array.isArray(reply.json)) return reply.json;
  if (typeof reply.json !== 'object') return null;
  for (const key of ['rows', 'items', 'entries', 'data', 'results', 'list', 'records']) if (Array.isArray(reply.json[key])) return reply.json[key];
  const arrays = Object.values(reply.json).filter(Array.isArray);
  return arrays.length === 1 ? (arrays[0] as any[]) : null;
}

export const idOf = (b: Bound, row: any): string | undefined => {
  const v = at(row, b.decl.idKey ?? 'id');
  return v === undefined || v === null ? undefined : String(v);
};

export async function list(who: Client, b: Bound): Promise<{ reply: Reply; rows: any[] | null }> {
  const reply = await who.call('GET', b.decl.list!.path);
  return { reply, rows: rowsOf(reply, b.decl.list!.rows) };
}

/** Adds a row: the answer, and the id the app gave it (from the answer, else found by the marker in the list). */
export async function add(who: Client, b: Bound, body: Record<string, unknown>): Promise<{ reply: Reply; id: string | undefined }> {
  const a = b.decl.add!;
  const reply = await who.call(a.method ?? 'POST', a.path, { send: a.send ?? 'json', fields: body });
  let id: string | undefined;
  if (ok(reply) && reply.json) {
    const own = idOf(b, reply.json);
    id = own ?? idOf(b, reply.json.row ?? reply.json.data ?? reply.json.item ?? reply.json.entry ?? {});
  }
  return { reply, id };
}

/** The addresses at which one row may be reached: the one the builder gave, and the list's own address with the id after it. */
export const addressesOf = (b: Bound, id: string): string[] => [...new Set([...(b.decl.one ? [withId(b.decl.one.path, id)] : []), `${b.decl.list!.path.replace(/\?.*$/, '').replace(/\/$/, '')}/${encodeURIComponent(id)}`])];

export async function readOne(who: Client, b: Bound, id: string): Promise<Reply | null> {
  const op = opOf(b.decl.one, 'read');
  return op ? who.call(op.method, withId(op.path, id)) : null;
}

export async function change(who: Client, b: Bound, id: string, body: Record<string, unknown>): Promise<Reply> {
  const op = opOf(b.decl.one, 'change')!;
  return who.call(op.method, withId(op.path, id), { send: 'json', fields: body });
}

export async function remove(who: Client, b: Bound, id: string): Promise<Reply | null> {
  const op = opOf(b.decl.one, 'remove');
  return op ? who.call(op.method, withId(op.path, id)) : null;
}

/** The field a row is found again by: a text of the app's own that is not open (a name, a title), the first a person would call the row's name; an email only when there is nothing else. Only fields the app has. */
export function markerField(b: Bound, skip?: string): string | undefined {
  const texts = [...b.fields.values()].filter((f) => f.spec.kind === 'text' && !f.spec.open && f.spec.id !== skip);
  return (texts.find((f) => !f.spec.email) ?? texts[0])?.spec.id;
}

/** A word to look for in what is said, to know whether a row is there: the value of the row's marker field. */
export function markerOf(b: Bound, row: Row): string | undefined {
  const id = markerField(b);
  const v = id ? row[id] : undefined;
  return typeof v === 'string' && v.length >= 5 ? v : undefined;
}

export { resolveRow };
