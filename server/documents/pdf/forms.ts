// A PDF's form (AcroForm), read and filled. Reading gives each field its full name, kind (text, multi-line text,
// checkbox, radio buttons with their choices, list, dropdown, signature, button), options, value, where its boxes are
// (page, points from the top-left), and the words printed beside it, which say what a field named "f1_02[0]" is for.
// Filling sets the values and draws each changed field's appearance here, in fonts that hold its words, so every
// viewer shows them; flattening paints the fields into their pages and takes the form away. All as an incremental
// update: a form a signature allows filling stays signed. XFA forms (Adobe LiveCycle) are named; only their AcroForm
// part, when they have one, can be filled.
import { appearance, listContent, type Look, lookOf, markContent, textContent } from './appearance.ts';
import { PageEdits } from './edits.ts';
import type { PdfFile } from './file.ts';
import { FontBox, fontsFor } from './fontset.ts';
import { Dict, isDict, isRef, isStr, isStream, num, type Obj, Ref, textStr } from './objects.ts';
import { type Page, pages, shownRect } from './pages.ts';
import { fold, type Line, pageLines } from './text.ts';

export type FieldKind = 'text' | 'multiline' | 'checkbox' | 'radio' | 'list' | 'dropdown' | 'signature' | 'button';

export interface Widget {
  /** From 1; 0 when the widget is on no page. */
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** A checkbox's or radio button's value when this box is ticked. */
  on?: string;
}

export interface Field {
  name: string;
  kind: FieldKind;
  /** Text; true or false for a checkbox; the choice of radio buttons or a dropdown (null: none); a list's choices. */
  value: string | boolean | string[] | null;
  /** Radio buttons', dropdowns' and lists' choices: the value to give, and what shows when it differs. */
  options?: { value: string; label?: string }[];
  /** The words printed beside it on the page. */
  label?: string;
  /** Its tooltip (what Acrobat shows on hovering), often a better name. */
  tooltip?: string;
  readOnly?: boolean;
  required?: boolean;
  maxLength?: number;
  comb?: boolean;
  multiSelect?: boolean;
  /** A dropdown that also takes words of its own. */
  editable?: boolean;
  password?: boolean;
  /** A signature field that is signed. */
  signed?: boolean;
  /** Locked by a signature already in the file. */
  locked?: boolean;
  widgets: Widget[];
}

interface WidgetNode {
  ref: Ref;
  dict: Dict;
  page: Page | null;
  on: string | null;
  rect: number[];
}

interface Node {
  field: Field;
  /** The field's dictionaries: one, or several of the same name (some writers repeat a field per box). */
  refs: Ref[];
  dict: Dict;
  widgets: WidgetNode[];
  da: string;
  q: number;
  ff: number;
  /** Raw options: [export, shown] pairs. */
  opt: [string, string][];
}

export interface Form {
  fields: Field[];
  /** The file has an XFA form; `dynamic`: and no AcroForm fields to fill (only Adobe's apps can fill it). */
  xfa: boolean;
  dynamic: boolean;
  needAppearances: boolean;
}

const FLAG = { readOnly: 1, required: 2, multiline: 1 << 12, password: 1 << 13, radio: 1 << 15, push: 1 << 16, combo: 1 << 17, edit: 1 << 18, multiSelect: 1 << 21, comb: 1 << 24 };

const strOf = (o: Obj): string => (isStr(o) ? o.text() : typeof o === 'string' ? o : typeof o === 'number' ? String(o) : '');

/** The states a checkbox or radio widget can show (its appearance's keys) other than Off. */
function onStates(pdf: PdfFile, w: Dict): string[] {
  const ap = pdf.dictOf(w.get('AP') ?? null);
  const out = new Set<string>();
  for (const k of ['N', 'D']) {
    const sub = pdf.resolve(ap?.get(k) ?? null);
    if (isDict(sub)) for (const key of sub.keys()) if (key !== 'Off') out.add(key);
  }
  return [...out];
}

function walk(pdf: PdfFile, list: Page[], annotPage: Map<number, Page>): Node[] {
  const af = pdf.dictOf(pdf.catalog().get('AcroForm') ?? null);
  if (!af) return [];
  const formDA = strOf(pdf.resolve(af.get('DA') ?? null));
  const formQ = pdf.numOf(af.get('Q'), 0);
  const out: Node[] = [];
  const seen = new Set<number>();
  const visit = (ref: Obj, parent: string, inh: Map<string, Obj>, depth: number) => {
    if (!isRef(ref) || seen.has(ref.num) || depth > 32 || out.length > 5000) return;
    seen.add(ref.num);
    const d = pdf.dictOf(ref);
    if (!d) return;
    const t = d.get('T');
    const part = t !== undefined ? strOf(pdf.resolve(t)) : null;
    const name = part === null ? parent : parent ? `${parent}.${part}` : part;
    const mine = new Map(inh);
    for (const k of ['FT', 'Ff', 'V', 'DV', 'DA', 'Q', 'MaxLen', 'Opt', 'TU']) if (d.has(k)) mine.set(k, d.get(k)!);
    const kids = pdf.arrayOf(d.get('Kids') ?? null);
    const fieldKids = kids.filter((k) => {
      const kd = pdf.dictOf(k);
      return kd && (kd.has('T') || (kd.has('Kids') && !kd.has('Rect')));
    });
    if (fieldKids.length) {
      for (const k of fieldKids) visit(k, name, mine, depth + 1);
      return;
    }
    const widgets: WidgetNode[] = [];
    const wl: Obj[] = kids.length ? kids : d.has('Rect') || d.get('Subtype') === 'Widget' ? [ref] : [];
    for (const w of wl) {
      if (!isRef(w)) continue;
      seen.add(w.num);
      const wd = pdf.dictOf(w);
      if (!wd) continue;
      let page = annotPage.get(w.num) ?? null;
      const p = wd.get('P');
      if (!page && isRef(p)) page = list.find((pg) => pg.ref.num === p.num) ?? null;
      const rect = pdf.arrayOf(wd.get('Rect') ?? null).map((x) => pdf.numOf(x, 0));
      const on = onStates(pdf, wd)[0] ?? null;
      widgets.push({ ref: w, dict: wd, page, on, rect: rect.length === 4 ? [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])] : [0, 0, 0, 0] });
    }
    const ft = pdf.resolve(mine.get('FT') ?? null);
    const ff = pdf.numOf(mine.get('Ff') ?? null, 0);
    const kind: FieldKind | null =
      ft === 'Tx' ? (ff & FLAG.multiline ? 'multiline' : 'text') : ft === 'Btn' ? (ff & FLAG.push ? 'button' : ff & FLAG.radio ? 'radio' : 'checkbox') : ft === 'Ch' ? (ff & FLAG.combo ? 'dropdown' : 'list') : ft === 'Sig' ? 'signature' : null;
    if (!kind || !name) return;
    const opt: [string, string][] = pdf.arrayOf(mine.get('Opt') ?? null).map((o) => {
      const x = pdf.resolve(o);
      if (Array.isArray(x)) return [strOf(pdf.resolve(x[0])), strOf(pdf.resolve(x[1] ?? x[0]))];
      return [strOf(x), strOf(x)];
    });
    const v = pdf.resolve(mine.get('V') ?? null);
    let value: Field['value'] = null;
    let options: Field['options'];
    if (kind === 'text' || kind === 'multiline') value = isStream(v) ? pdf.streamData(v).toString('utf8') : strOf(v);
    else if (kind === 'checkbox') {
      value = typeof v === 'string' ? v !== 'Off' && (!widgets.length || widgets.some((w) => w.on === v)) : false;
      // A box with no recorded value shows its state.
      if (v === null && widgets.some((w) => w.dict.get('AS') !== undefined && w.dict.get('AS') !== 'Off')) value = true;
    } else if (kind === 'radio') {
      const states = widgets.map((w) => w.on);
      options = [];
      widgets.forEach((w, i) => {
        if (!w.on) return;
        // With /Opt the states are numbers standing for its entries.
        const exp = opt[i]?.[0] ?? (opt.length && /^\d+$/.test(w.on) ? opt[Number(w.on)]?.[0] : undefined) ?? stateText(w.on);
        if (!options!.some((o) => o.value === exp)) options!.push({ value: exp });
      });
      if (typeof v === 'string' && v !== 'Off') {
        const i = states.indexOf(v);
        // A value that is none of the boxes' states (a writer's placeholder) means none is chosen.
        if (i >= 0) value = opt[i]?.[0] ?? (opt.length && /^\d+$/.test(v) ? opt[Number(v)]?.[0] : undefined) ?? stateText(v);
      } else if (v === null) {
        const lit = widgets.find((w) => w.on && w.dict.get('AS') === w.on);
        if (lit) value = stateText(lit.on!);
      }
    } else if (kind === 'list' || kind === 'dropdown') {
      options = opt.map(([e, s]) => (s && s !== e ? { value: e, label: s } : { value: e }));
      if (Array.isArray(v)) value = v.map((x) => strOf(pdf.resolve(x)));
      else value = v === null ? (kind === 'list' ? [] : null) : strOf(v);
      if (kind === 'list' && typeof value === 'string') value = value ? [value] : [];
    }
    const field: Field = {
      name,
      kind,
      value,
      ...(options ? { options } : {}),
      ...(mine.has('TU') ? { tooltip: strOf(pdf.resolve(mine.get('TU')!)) } : {}),
      ...(ff & FLAG.readOnly ? { readOnly: true } : {}),
      ...(ff & FLAG.required ? { required: true } : {}),
      ...(mine.has('MaxLen') ? { maxLength: pdf.numOf(mine.get('MaxLen'), 0) } : {}),
      ...(ff & FLAG.comb && kind === 'text' ? { comb: true } : {}),
      ...(ff & FLAG.multiSelect && kind === 'list' ? { multiSelect: true } : {}),
      ...(ff & FLAG.edit && kind === 'dropdown' ? { editable: true } : {}),
      ...(ff & FLAG.password && (kind === 'text' || kind === 'multiline') ? { password: true } : {}),
      ...(kind === 'signature' && isDict(v) ? { signed: true } : {}),
      widgets: widgets.map((w) => {
        const r = w.page ? shownRect(w.page, w.rect) : { x: 0, y: 0, w: 0, h: 0 };
        const o: Widget = { page: w.page?.index ?? 0, x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) };
        if ((kind === 'radio' || kind === 'checkbox') && w.on) o.on = stateText(w.on);
        return o;
      }),
    };
    const da = strOf(pdf.resolve(mine.get('DA') ?? null)) || formDA || '/Helv 0 Tf 0 g';
    out.push({ field, refs: [ref], dict: d, widgets, da, q: pdf.numOf(mine.get('Q') ?? null, formQ), ff, opt });
  };
  for (const f of pdf.arrayOf(af.get('Fields') ?? null)) visit(f, '', new Map(), 0);
  // Widgets on pages that the form's list of fields leaves out (some writers forget them): their topmost field.
  for (const p of list)
    for (const a of pdf.arrayOf(p.dict.get('Annots') ?? null)) {
      if (!isRef(a) || seen.has(a.num)) continue;
      const ad = pdf.dictOf(a);
      if (!ad || ad.get('Subtype') !== 'Widget') continue;
      let top: Ref = a;
      for (let i = 0; i < 32; i++) {
        const par = pdf.dictOf(top)?.get('Parent');
        if (!isRef(par) || seen.has(par.num)) break;
        top = par;
      }
      visit(top, parentName(pdf, top), inheritedFrom(pdf, top), 0);
    }
  // Fields of the same name and kind are one field with several boxes.
  const merged: Node[] = [];
  for (const n of out) {
    const same = merged.find((m) => m.field.name === n.field.name && m.field.kind === n.field.kind);
    if (!same) {
      merged.push(n);
      continue;
    }
    same.refs.push(...n.refs.filter((r) => !same.refs.some((x) => x.num === r.num)));
    same.widgets.push(...n.widgets);
    same.field.widgets.push(...n.field.widgets);
    if (same.field.kind === 'radio' && n.field.options) {
      for (const o of n.field.options) if (!same.field.options!.some((x) => x.value === o.value)) same.field.options!.push(o);
    }
    if ((same.field.value === null || same.field.value === false) && n.field.value !== null && n.field.value !== false) same.field.value = n.field.value;
  }
  return merged;
}

/** What a field found by its widget inherits from its parents. */
function inheritedFrom(pdf: PdfFile, r: Ref): Map<string, Obj> {
  const m = new Map<string, Obj>();
  let cur = pdf.dictOf(r)?.get('Parent');
  for (let i = 0; i < 32 && isRef(cur); i++) {
    const d = pdf.dictOf(cur);
    if (!d) break;
    for (const k of ['FT', 'Ff', 'V', 'DV', 'DA', 'Q', 'MaxLen', 'Opt', 'TU']) if (!m.has(k) && d.has(k)) m.set(k, d.get(k)!);
    cur = d.get('Parent');
  }
  return m;
}

/** The full name of a field's parents, for a field found by its widget. */
function parentName(pdf: PdfFile, r: Ref): string {
  const parts: string[] = [];
  let cur = pdf.dictOf(r)?.get('Parent');
  for (let i = 0; i < 32 && isRef(cur); i++) {
    const d = pdf.dictOf(cur);
    const t = d?.get('T');
    if (t !== undefined) parts.unshift(strOf(pdf.resolve(t)));
    cur = d?.get('Parent');
  }
  return parts.join('.');
}

/** A state's name as words: some writers put UTF-16 into names as backslash escapes ("\\376\\377\\000b…"). */
export function stateText(name: string): string {
  if (!/\\[0-7]{3}/.test(name)) return name;
  const bytes: number[] = [];
  for (let i = 0; i < name.length; i++) {
    const m = /^\\([0-7]{3})/.exec(name.slice(i));
    if (m) {
      bytes.push(parseInt(m[1], 8));
      i += 3;
    } else bytes.push(name.charCodeAt(i) & 0xff);
  }
  const b = Buffer.from(bytes);
  if (b[0] === 0xfe && b[1] === 0xff) {
    const u = Buffer.from(b.subarray(2, 2 + ((b.length - 2) & ~1)));
    u.swap16();
    return u.toString('utf16le');
  }
  return b.toString('latin1');
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Which annotation is on which page. */
function annotPages(pdf: PdfFile, list: Page[]): Map<number, Page> {
  const m = new Map<number, Page>();
  for (const p of list) for (const a of pdf.arrayOf(p.dict.get('Annots') ?? null)) if (isRef(a) && !m.has(a.num)) m.set(a.num, p);
  return m;
}

// ---- labels ---------------------------------------------------------------------------------------

interface Word {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  size: number;
}

function wordsOf(ls: Line[]): Word[] {
  const out: Word[] = [];
  for (const l of ls) {
    let cur: Word | null = null;
    [...l.text].forEach((ch, i) => {
      const g = l.map[i];
      if (ch === ' ' || g < 0) {
        if (cur) out.push(cur);
        cur = null;
        return;
      }
      const gl = l.glyphs[g];
      if (!cur) cur = { text: '', x0: gl.x0, y0: gl.y0, x1: gl.x1, y1: gl.y1, size: gl.size };
      cur.text += ch;
      cur.x0 = Math.min(cur.x0, gl.x0);
      cur.x1 = Math.max(cur.x1, gl.x1);
      cur.y0 = Math.min(cur.y0, gl.y0);
      cur.y1 = Math.max(cur.y1, gl.y1);
    });
    if (cur) out.push(cur);
  }
  return out;
}

/** The words printed beside a field's box: left of it (right of a tick box), else just above it. */
function labelFor(words: Word[], b: Widget, kind: FieldKind, others: Widget[]): string | undefined {
  const midY = b.y + b.h / 2;
  const sameRow = (w: Word) => w.y0 < b.y + b.h && w.y1 > b.y && Math.abs((w.y0 + w.y1) / 2 - midY) < Math.max(b.h, w.y1 - w.y0) * 0.75;
  const join = (ws: Word[]) =>
    ws
      .map((w) => w.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  const between = (x0: number, x1: number) => others.some((o) => o !== b && o.page === b.page && Math.abs(o.y + o.h / 2 - midY) < b.h && o.x > x0 && o.x + o.w < x1);
  if (kind === 'checkbox' || kind === 'radio') {
    const right = words.filter((w) => sameRow(w) && w.x0 >= b.x + b.w - 2).sort((a, c) => a.x0 - c.x0);
    if (right.length && right[0].x0 - (b.x + b.w) < 60 && !between(b.x + b.w, right[0].x0)) {
      const take = [right[0]];
      for (const w of right.slice(1)) {
        const prev = take[take.length - 1];
        if (w.x0 - prev.x1 > 1.2 * w.size || between(prev.x1, w.x0) || take.length >= 10) break;
        take.push(w);
      }
      return join(take);
    }
  }
  const left = words.filter((w) => sameRow(w) && w.x1 <= b.x + 3).sort((a, c) => c.x1 - a.x1);
  if (left.length && b.x - left[0].x1 < 220 && !between(left[0].x1, b.x)) {
    const take = [left[0]];
    for (const w of left.slice(1)) {
      const prev = take[0];
      if (prev.x0 - w.x1 > 1.2 * w.size || take.length >= 10) break;
      take.unshift(w);
    }
    return join(take);
  }
  const above = words.filter((w) => w.y1 <= b.y + 2 && b.y - w.y1 < Math.max(14, b.h * 1.2) && w.x1 > b.x - 4 && w.x0 < b.x + b.w).sort((a, c) => c.y1 - a.y1 || a.x0 - c.x0);
  if (above.length) {
    const row = above.filter((w) => Math.abs(w.y1 - above[0].y1) < above[0].size * 0.5).sort((a, c) => a.x0 - c.x0);
    return join(row.slice(0, 12));
  }
  return undefined;
}

/** The nearest word on a box's row, before it or after it, and its gap. */
function nearWord(words: Word[], b: Widget, side: 'left' | 'right'): { word: Word; gap: number } | null {
  const midY = b.y + b.h / 2;
  const row = words.filter((w) => w.y0 < b.y + b.h && w.y1 > b.y && Math.abs((w.y0 + w.y1) / 2 - midY) < Math.max(b.h, w.y1 - w.y0) * 0.75);
  const w = side === 'right' ? row.filter((x) => x.x0 >= b.x + b.w - 2).sort((a, c) => a.x0 - c.x0)[0] : row.filter((x) => x.x1 <= b.x + 2).sort((a, c) => c.x1 - a.x1)[0];
  return w ? { word: w, gap: side === 'right' ? w.x0 - (b.x + b.w) : b.x - w.x1 } : null;
}

/**
 * Which side of their buttons a radio group's words are printed on: before them when every button has words just
 * before it and not every one has words just after (the last button then has none), else after them.
 */
function choiceSide(words: Word[], boxes: Widget[]): 'left' | 'right' {
  const near = (b: Widget, side: 'left' | 'right') => (nearWord(words, b, side)?.gap ?? Infinity) < 30;
  return boxes.length > 1 && boxes.every((b) => near(b, 'left')) && !boxes.every((b) => near(b, 'right')) ? 'left' : 'right';
}

// ---- reading ----------------------------------------------------------------------------------------

/** The form's fields, with labels; `nodes` for filling. */
export function readFormNodes(pdf: PdfFile): { form: Form; nodes: Node[]; list: Page[] } {
  const list = pages(pdf);
  const af = pdf.dictOf(pdf.catalog().get('AcroForm') ?? null);
  const nodes = walk(pdf, list, annotPages(pdf, list));
  const xfa = !!af && af.has('XFA');
  // Labels, page by page.
  const all = nodes.flatMap((n) => n.field.widgets);
  const byPage = new Map<number, Word[]>();
  for (const n of nodes) {
    const w = n.field.widgets[0];
    if (!w || !w.page) continue;
    let words = byPage.get(w.page);
    if (!words) {
      const pg = list[w.page - 1];
      words = pg ? wordsOf(pageLines(pdf, pg)) : [];
      byPage.set(w.page, words);
    }
    const l = labelFor(words, w, n.field.kind, all);
    if (l && l.length <= 120) n.field.label = l;
    // Radio buttons: each choice's own words.
    if (n.field.kind === 'radio' && n.field.options) {
      const side = choiceSide(byPage.get(w.page) ?? [], n.field.widgets);
      n.field.widgets.forEach((wd) => {
        const ws = byPage.get(wd.page) ?? [];
        const lab = side === 'left' ? nearWord(ws, wd, 'left')?.word.text.replace(/:$/, '') : labelFor(ws, wd, 'radio', all);
        const opt = n.field.options!.find((o) => o.value === wd.on || o.value === n.opt[n.field.widgets.indexOf(wd)]?.[0]);
        if (lab && opt && lab !== opt.value && lab.length <= 60) opt.label = lab;
      });
      // The field's own label is to its left, not one choice's words (left of the first choice's words, when they come first).
      const lw = n.field.widgets.slice().sort((a, b) => a.x - b.x)[0];
      if (lw) {
        const ws = byPage.get(lw.page) ?? [];
        const first = side === 'left' ? nearWord(ws, lw, 'left')?.word : null;
        n.field.label = labelFor(ws, first ? { page: lw.page, x: first.x0, y: lw.y, w: first.x1 - first.x0, h: lw.h } : lw, 'text', all);
      }
    }
  }
  const locked = lockedFields(pdf, nodes);
  for (const n of nodes) if (locked.has(n.field.name)) n.field.locked = true;
  return { form: { fields: nodes.map((n) => n.field), xfa, dynamic: xfa && !nodes.length, needAppearances: af?.get('NeedAppearances') === true }, nodes, list };
}

export function readForm(pdf: PdfFile): Form {
  return readFormNodes(pdf).form;
}

/** Fields that signatures already in the file lock (their /Lock, or the signature's FieldMDP). */
function lockedFields(pdf: PdfFile, nodes: Node[]): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    if (n.field.kind !== 'signature' || !n.field.signed) continue;
    const lock = pdf.dictOf(n.dict.get('Lock') ?? null);
    const sig = pdf.dictOf(n.dict.get('V') ?? null);
    const params = [lock, ...pdf.arrayOf(sig?.get('Reference') ?? null).map((r) => pdf.dictOf(pdf.dictOf(r)?.get('TransformParams') ?? null))].filter((x): x is Dict => !!x);
    for (const p of params) {
      const action = p.get('Action');
      const named = pdf.arrayOf(p.get('Fields') ?? null).map((f) => strOf(pdf.resolve(f)));
      for (const m of nodes) {
        if (m === n) continue;
        const nm = m.field.name;
        const hit = named.some((f) => nm === f || nm.startsWith(`${f}.`));
        if (action === 'All' || (action === 'Include' && hit) || (action === 'Exclude' && !hit)) out.add(nm);
      }
    }
  }
  return out;
}

/** What a certifying signature allows: 1 no changes, 2 filling and signing, 3 also annotations; null when none. */
export function certified(pdf: PdfFile): number | null {
  const perms = pdf.dictOf(pdf.catalog().get('Perms') ?? null);
  const sig = pdf.dictOf(perms?.get('DocMDP') ?? null);
  if (!sig) return null;
  for (const r of pdf.arrayOf(sig.get('Reference') ?? null)) {
    const rd = pdf.dictOf(r);
    if (rd?.get('TransformMethod') === 'DocMDP') return pdf.numOf(pdf.dictOf(rd.get('TransformParams') ?? null)?.get('P'), 2);
  }
  return 2;
}

// ---- filling ----------------------------------------------------------------------------------------

export type FillValue = string | number | boolean | string[] | null;

export class FormError extends Error {}

/** A field by the name given: its full name, else its last part, its label or its tooltip when only one field has it. */
function findNode(nodes: Node[], key: string): Node | null {
  const exact = nodes.find((n) => n.field.name === key);
  if (exact) return exact;
  const k = fold(key).trim();
  const tries: ((n: Node) => string | undefined)[] = [(n) => n.field.name, (n) => n.field.name.split('.').pop(), (n) => n.field.tooltip, (n) => n.field.label];
  for (const t of tries) {
    const hits = nodes.filter((n) => {
      const v = t(n);
      return (
        v !== undefined &&
        fold(v)
          .trim()
          .replace(/[:\s]+$/, '') === k.replace(/[:\s]+$/, '')
      );
    });
    if (hits.length === 1) return hits[0];
  }
  return null;
}

const TRUE = new Set(['true', 'yes', 'on', 'x', '1', 'checked', 'ticked', 'y', 'ναι', '是']);
const FALSE = new Set(['false', 'no', 'off', '0', 'unchecked', '', 'n', 'όχι', '否']);

/** An option by its value or its label, compared without case or accents. */
function pickOption(n: Node, v: string): string | null {
  const opts = n.field.options ?? [];
  const exact = opts.find((o) => o.value === v || o.label === v);
  if (exact) return exact.value;
  const k = fold(v).trim();
  const hit = opts.filter((o) => fold(o.value).trim() === k || (o.label !== undefined && fold(o.label).trim() === k));
  return hit.length >= 1 ? hit[0].value : null;
}

/** What a value is checked into for its field, or why it cannot be. */
function checkValue(n: Node, raw: FillValue): { ok: true; value: string | boolean | string[] | null } | { ok: false; why: string } {
  const f = n.field;
  const show = (o: { value: string; label?: string }) => (o.label ? `"${o.value}" (${o.label})` : `"${o.value}"`);
  switch (f.kind) {
    case 'text':
    case 'multiline': {
      const s = raw === null ? '' : Array.isArray(raw) ? raw.join(', ') : String(raw);
      if (f.maxLength && [...s].length > f.maxLength) return { ok: false, why: `takes at most ${f.maxLength} characters (got ${[...s].length})` };
      return { ok: true, value: s };
    }
    case 'checkbox': {
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      const s = String(raw ?? '').trim();
      if (n.widgets.some((w) => w.on === s || (w.on !== null && stateText(w.on) === s))) return { ok: true, value: true };
      if (TRUE.has(s.toLowerCase())) return { ok: true, value: true };
      if (FALSE.has(s.toLowerCase())) return { ok: true, value: false };
      return { ok: false, why: 'is a checkbox: give true or false' };
    }
    case 'radio': {
      if (raw === null || raw === false || raw === '') return { ok: true, value: null };
      const v = pickOption(n, String(raw));
      if (v === null) return { ok: false, why: `is a choice of ${(f.options ?? []).map(show).join(', ')}` };
      return { ok: true, value: v };
    }
    case 'dropdown': {
      if (raw === null || raw === '') return { ok: true, value: null };
      const s = Array.isArray(raw) ? String(raw[0] ?? '') : String(raw);
      const v = pickOption(n, s);
      if (v === null && !f.editable) return { ok: false, why: `is a dropdown of ${(f.options ?? []).map(show).join(', ')}` };
      return { ok: true, value: v ?? s };
    }
    case 'list': {
      const list =
        raw === null
          ? []
          : Array.isArray(raw)
            ? raw.map(String)
            : String(raw)
                .split(/\s*[;\n]\s*/)
                .filter(Boolean);
      if (list.length > 1 && !f.multiSelect) return { ok: false, why: 'takes one choice only' };
      const out: string[] = [];
      for (const s of list) {
        const v = pickOption(n, s);
        if (v === null) return { ok: false, why: `is a list of ${(f.options ?? []).map(show).join(', ')}` };
        out.push(v);
      }
      return { ok: true, value: out };
    }
    case 'signature':
      return { ok: false, why: 'is a signature field: a signature is placed there as a picture (the signature tool, or Fill & sign in Files), not typed' };
    default:
      return { ok: false, why: 'is a button, not something to fill' };
  }
}

const markKind = (pdf: PdfFile, w: Dict): 'check' | 'cross' | 'circle' | 'square' | 'diamond' => {
  const ca = strOf(pdf.resolve(pdf.dictOf(w.get('MK') ?? null)?.get('CA') ?? null));
  return ca === '8' || ca === 'x' ? 'cross' : ca === 'l' ? 'circle' : ca === 'n' ? 'square' : ca === 'u' ? 'diamond' : 'check';
};

export interface FillOptions {
  /** Paint the fields into their pages and take the form away. */
  flatten?: boolean;
}

/**
 * Fills fields by name (the full name, else a name only one field has as its last part, label or tooltip) and draws
 * their appearances; changes are made to `pdf`, to be saved with saveUpdate. Throws a FormError naming every value
 * that cannot go in, before changing anything.
 */
export async function fillForm(pdf: PdfFile, values: Record<string, FillValue>, o: FillOptions = {}): Promise<{ filled: string[]; notes: string[] }> {
  const { form, nodes } = readFormNodes(pdf);
  const notes: string[] = [];
  const perms = pdf.permissions();
  if (perms && !perms.fillForms) throw new FormError('The file’s owner protected it against filling its form (it is encrypted with permissions that do not allow it).');
  const mdp = certified(pdf);
  if (mdp === 1) throw new FormError('The file is certified with a digital signature that allows no changes at all: filling it would break that.');
  if (form.dynamic)
    throw new FormError('This is an XFA form (made with Adobe LiveCycle Designer): its fields live in a form only Adobe Acrobat and Reader can fill, so they cannot be filled here. Write on its pages instead, or fill it in Acrobat Reader.');
  if (!nodes.length && Object.keys(values).length) throw new FormError('This PDF has no form fields. To fill in a form that is only printed lines and boxes, write the words on the page where they go instead.');
  const plan: { n: Node; value: string | boolean | string[] | null }[] = [];
  const problems: string[] = [];
  for (const [key, raw] of Object.entries(values)) {
    const n = findNode(nodes, key);
    if (!n) {
      const k = fold(key);
      const near = nodes
        .map((m) => m.field)
        .filter((f) => fold(f.name).includes(k) || k.includes(fold(f.name.split('.').pop() ?? '')) || (f.label && fold(f.label).includes(k)))
        .slice(0, 4)
        .map((f) => `"${f.name}"`);
      problems.push(`"${key}": no such field${near.length ? ` (did you mean ${near.join(', ')}?)` : ''}`);
      continue;
    }
    if (n.field.readOnly) {
      problems.push(`"${n.field.name}" is read-only`);
      continue;
    }
    if (n.field.locked) {
      problems.push(`"${n.field.name}" is locked by a signature already in the file`);
      continue;
    }
    const c = checkValue(n, raw);
    if (!c.ok) problems.push(`"${n.field.name}" ${c.why}`);
    else plan.push({ n, value: c.value });
  }
  if (problems.length) throw new FormError(`Nothing was filled: ${problems.join('; ')}.`);
  // Every word to be drawn, for fonts that have all its characters.
  const texts: string[] = [];
  for (const { n, value } of plan) {
    if (typeof value === 'string') texts.push(n.field.kind === 'dropdown' ? (n.opt.find((x) => x[0] === value)?.[1] ?? value) : value);
    if (n.field.kind === 'list') texts.push(...n.opt.map((x) => x[1]));
  }
  const fonts = new FontBox(pdf, await fontsFor(texts.join('\n')));
  const add = (x: Obj) => pdf.add(x);
  for (const { n, value } of plan) setField(pdf, n, value, fonts, add);
  // Viewers told to make appearances themselves would draw over these with fonts that may lack the words.
  const af = pdf.catalog().get('AcroForm');
  if (form.needAppearances || form.xfa) {
    const target = isRef(af) ? pdf.edit(af) : null;
    if (target) {
      if (form.needAppearances) {
        // Fields left as they were need their own appearances once viewers stop making them.
        const done = new Set(plan.map((p) => p.n));
        for (const n of nodes) if (!done.has(n) && n.field.kind !== 'signature' && n.field.kind !== 'button' && missingAppearance(pdf, n)) setField(pdf, n, n.field.value, fonts, add, true);
        target.delete('NeedAppearances');
      }
      if (form.xfa) {
        target.delete('XFA');
        notes.push('The file also had an XFA form (Adobe LiveCycle), which Acrobat would have shown instead of these fields: it was taken out, so every viewer shows what was filled.');
      }
    }
  }
  if (o.flatten) flatten(pdf, nodes);
  fonts.finish();
  if (pdf.signed() && !o.flatten) notes.push('The file’s digital signature stays valid: the fields were filled in an update after it, as signed forms allow.');
  return { filled: plan.map((p) => p.n.field.name), notes };
}

/** Whether a checkbox's or radio button's widget has real pictures for being on and off. */
function hasStates(pdf: PdfFile, w: Dict, on: string): boolean {
  const nd = pdf.resolve(pdf.dictOf(w.get('AP') ?? null)?.get('N') ?? null);
  return isDict(nd) && isStream(pdf.resolve(nd.get(on) ?? null)) && isStream(pdf.resolve(nd.get('Off') ?? null));
}

/** A field whose look was left to the viewer: a value without an appearance, or a box without its states' pictures. */
function missingAppearance(pdf: PdfFile, n: Node): boolean {
  if (n.field.kind === 'checkbox' || n.field.kind === 'radio') return n.widgets.some((w) => !hasStates(pdf, w.dict, w.on ?? 'Yes'));
  const v = n.field.value;
  if (v === null || v === false || v === '' || (Array.isArray(v) && !v.length)) return false;
  return n.widgets.some((w) => !isStream(pdf.resolve(pdf.dictOf(w.dict.get('AP') ?? null)?.get('N') ?? null)));
}

function setField(pdf: PdfFile, n: Node, value: string | boolean | string[] | null, fonts: FontBox, add: (o: Obj) => Ref, keepValue = false) {
  const f = n.field;
  // The value goes in every dictionary of the field (pdf.edit gives the same copy for the same object).
  const fds = n.refs.map((r) => pdf.edit(r));
  const fd = {
    set: (k: string, v: Obj) => fds.forEach((d) => d.set(k, v)),
    delete: (k: string) => fds.forEach((d) => d.delete(k)),
    get: (k: string) => fds[0].get(k),
  };
  const widget = (w: WidgetNode) => pdf.edit(w.ref);
  const size = (w: WidgetNode) => ({ w: w.rect[2] - w.rect[0], h: w.rect[3] - w.rect[1] });
  const look = (w: WidgetNode): Look => lookOf(pdf, w.dict, strOf(pdf.resolve(w.dict.get('DA') ?? null)) || n.da, w.dict.has('Q') ? pdf.numOf(w.dict.get('Q'), n.q) : n.q);
  if (f.kind === 'text' || f.kind === 'multiline') {
    const s = typeof value === 'string' ? value : '';
    if (!keepValue) {
      fd.set('V', textStr(s));
      fd.delete('RV');
    }
    for (const w of n.widgets) {
      const { w: ww, h } = size(w);
      const l = look(w);
      const ap = appearance(add, fonts, ww, h, l.rot, (bw, bh) => textContent(fonts, bw, bh, l, s, { multiline: f.kind === 'multiline', comb: f.comb ? f.maxLength : undefined, password: f.password }));
      const wd = widget(w);
      wd.set('AP', new Dict([['N', ap]]));
    }
    f.value = s;
  } else if (f.kind === 'dropdown') {
    const v = typeof value === 'string' ? value : null;
    if (!keepValue) {
      if (v === null) fd.delete('V');
      else fd.set('V', textStr(v));
    }
    const idx = n.opt.findIndex((x) => x[0] === v);
    if (idx >= 0) fd.set('I', [idx]);
    else fd.delete('I');
    const shown = idx >= 0 ? n.opt[idx][1] : (v ?? '');
    for (const w of n.widgets) {
      const { w: ww, h } = size(w);
      const l = look(w);
      const ap = appearance(add, fonts, ww, h, l.rot, (bw, bh) => textContent(fonts, bw, bh, l, shown));
      widget(w).set('AP', new Dict([['N', ap]]));
    }
    f.value = v;
  } else if (f.kind === 'list') {
    const vs = Array.isArray(value) ? value : [];
    if (!keepValue) {
      if (!vs.length) fd.delete('V');
      else fd.set('V', vs.length === 1 ? textStr(vs[0]) : vs.map((x) => textStr(x)));
    }
    const chosen = new Set(vs.map((x) => n.opt.findIndex((o) => o[0] === x)).filter((i) => i >= 0));
    if (chosen.size)
      fd.set(
        'I',
        [...chosen].sort((a, b) => a - b),
      );
    else fd.delete('I');
    for (const w of n.widgets) {
      const { w: ww, h } = size(w);
      const l = look(w);
      const first = chosen.size ? Math.min(...chosen) : 0;
      const rows = Math.max(1, Math.floor((h - 2 * l.bw) / ((l.size || 12) * 1.15)));
      const top = first >= rows ? first - rows + 1 : pdf.numOf(fd.get('TI'), 0) > first ? first : Math.min(pdf.numOf(fd.get('TI'), 0), Math.max(0, n.opt.length - rows));
      if (top) fd.set('TI', top);
      const ap = appearance(add, fonts, ww, h, l.rot, (bw, bh) =>
        listContent(
          fonts,
          bw,
          bh,
          l,
          n.opt.map((x) => x[1]),
          chosen,
          top,
        ),
      );
      widget(w).set('AP', new Dict([['N', ap]]));
    }
    f.value = vs;
  } else if (f.kind === 'checkbox' || f.kind === 'radio') {
    // The state that is on: the checkbox's own, or the radio button whose choice it is.
    let state: string | null = null;
    if (f.kind === 'checkbox') state = value === true ? (n.widgets.find((w) => w.on)?.on ?? 'Yes') : null;
    else if (typeof value === 'string') {
      const i = n.widgets.findIndex((w, k) => w.on === value || (w.on !== null && stateText(w.on) === value) || n.opt[k]?.[0] === value || (n.opt.length && w.on && /^\d+$/.test(w.on) && n.opt[Number(w.on)]?.[0] === value));
      state = i >= 0 ? (n.widgets[i].on ?? value) : value;
    }
    if (!keepValue) fd.set('V', state ?? 'Off');
    for (const w of n.widgets) {
      const wd = widget(w);
      const on = w.on ?? (f.kind === 'checkbox' ? 'Yes' : null);
      const lit = state !== null && on === state;
      wd.set('AS', lit ? on! : 'Off');
      // A box with no picture for one of its states (or an empty one) gets ours for both.
      if (on && !hasStates(pdf, wd, on)) {
        const { w: ww, h } = size(w);
        const l = look(w);
        // Radio buttons show a dot unless their caption asks for a tick, cross, square or diamond.
        const ca = strOf(pdf.resolve(pdf.dictOf(w.dict.get('MK') ?? null)?.get('CA') ?? null));
        const kind = f.kind === 'radio' && !['4', '8', 'n', 'u'].includes(ca) ? 'circle' : markKind(pdf, w.dict);
        const onAp = appearance(add, null, ww, h, l.rot, (bw, bh) => markContent(bw, bh, l, kind, true));
        const offAp = appearance(add, null, ww, h, l.rot, (bw, bh) => markContent(bw, bh, l, kind, false));
        wd.set(
          'AP',
          new Dict([
            [
              'N',
              new Dict([
                [on, onAp],
                ['Off', offAp],
              ]),
            ],
          ]),
        );
      }
    }
    f.value = f.kind === 'checkbox' ? state !== null : state === null ? null : (value as string);
  }
}

/** Paints every field's appearance into its page and takes the fields and the form away. */
function flatten(pdf: PdfFile, nodes: Node[]) {
  const edits = new PageEdits(pdf);
  for (const n of nodes) {
    for (const w of n.widgets) {
      if (!w.page) continue;
      const wd = pdf.dictOf(w.ref) ?? w.dict;
      const flags = pdf.numOf(wd.get('F'), 0);
      const e = edits.page(w.page);
      e.remove.add(w.ref.num);
      if (flags & 2 || flags & 32) continue;
      const apd = pdf.dictOf(wd.get('AP') ?? null);
      let ap = apd?.get('N') ?? null;
      const nd = pdf.resolve(ap);
      if (isDict(nd) && !isStream(nd)) {
        const as = wd.get('AS');
        ap = typeof as === 'string' ? (nd.get(as) ?? null) : null;
      }
      const s = pdf.resolve(ap);
      if (!isStream(s) || !isRef(ap)) continue;
      const bbox = pdf.arrayOf(s.dict.get('BBox') ?? null).map((x) => pdf.numOf(x, 0));
      if (bbox.length !== 4) continue;
      const m = pdf.arrayOf(s.dict.get('Matrix') ?? null).map((x) => pdf.numOf(x, 0));
      const mat = m.length === 6 ? m : [1, 0, 0, 1, 0, 0];
      // The box the appearance takes once its own matrix is applied, then fitted to the widget's rectangle.
      const pts = [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[1]],
        [bbox[0], bbox[3]],
        [bbox[2], bbox[3]],
      ].map(([x, y]) => [mat[0] * x + mat[2] * y + mat[4], mat[1] * x + mat[3] * y + mat[5]]);
      const bx0 = Math.min(...pts.map((p) => p[0]));
      const by0 = Math.min(...pts.map((p) => p[1]));
      const bx1 = Math.max(...pts.map((p) => p[0]));
      const by1 = Math.max(...pts.map((p) => p[1]));
      const r = w.rect;
      const sx = bx1 - bx0 ? (r[2] - r[0]) / (bx1 - bx0) : 1;
      const sy = by1 - by0 ? (r[3] - r[1]) / (by1 - by0) : 1;
      // Appearances must be form XObjects to be painted with Do.
      if (s.dict.get('Subtype') !== 'Form') {
        const sd = pdf.edit(ap);
        sd.set('Type', 'XObject');
        sd.set('Subtype', 'Form');
      }
      const name = e.resource('XObject', ap);
      // The page's drawing is in display space: undo that for this one, which is placed in user space.
      const inv = invertOps(w.page);
      e.ops.push(`q ${inv} cm ${num(sx)} 0 0 ${num(sy)} ${num(r[0] - bx0 * sx)} ${num(r[1] - by0 * sy)} cm /${name} Do Q`);
    }
  }
  edits.finish();
  const af = pdf.catalog().get('AcroForm');
  if (isRef(af)) {
    const d = pdf.edit(af);
    d.set('Fields', []);
    d.delete('NeedAppearances');
    d.delete('XFA');
    d.delete('SigFlags');
  } else {
    const root = pdf.trailer.get('Root');
    if (isRef(root)) pdf.edit(root).delete('AcroForm');
  }
}

/** The matrix back from a page's display space to its user space, as cm operands. */
function invertOps(p: Page): string {
  const m = p.toUser;
  const det = m[0] * m[3] - m[1] * m[2] || 1;
  const inv = [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
  return inv.map(num).join(' ');
}
