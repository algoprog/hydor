// Track changes in the LaTeX editor's source, as Overleaf has it. While it is on, what is typed is marked as put in,
// and what is deleted leaves the text (as it leaves what TeX typesets) but stays shown where it was, struck through,
// as taken out; each with who and when. Typing on at the end of words just put in grows them; deleting words just put
// in takes them away with no trace; deleting next to words taken out joins them, in their order. Undo and Redo take
// the marks back with the text. Accepting a change forgets it; rejecting one puts the text back as it was (words put
// in go, words taken out come back), and both can be undone. The marks show in Visual mode too.
import { invertedEffects } from '@codemirror/commands';
import { Annotation, ChangeSet, Compartment, EditorState, Facet, StateEffect, StateField, Transaction, type ChangeDesc, type Extension, type Text } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { newChangeId } from '@shared/latex';
import { tr } from '../../../i18n/runtime';

/** A change in one file: words put in at [from, to), or words taken out (`text`) at `from`. */
export interface Tracked {
  id: string;
  kind: 'ins' | 'del';
  from: number;
  to: number;
  /** The words taken out (for words put in, the editor reads them from the text). */
  text: string;
  /** For words taken out, as the document keeps them: the characters before them, to find the place again. */
  before?: string;
  by: 'user' | 'agent';
  at: number;
}

/** Sets the changes (in the coordinates of the text the transaction leaves); undoing an edit sets them back. */
export const setTracked = StateEffect.define<Tracked[]>({ map: (v, m) => mapTracked(v, m) });
/** A change done here that is no edit to record: accepting or rejecting, or the text set from outside. */
export const untracked = Annotation.define<boolean>();
/** The changes set as the document has them, when the file's editor starts: nothing changed, nothing to tell. */
export const loaded = Annotation.define<boolean>();
const trackOn = Facet.define<boolean, boolean>({ combine: (v) => v.some(Boolean) });
const setActive = StateEffect.define<string | null>();

/** The changes where the text's edits move them: words put in keep their ends (what is typed beside them stays out). */
function mapTracked(list: Tracked[], m: ChangeDesc): Tracked[] {
  const out: Tracked[] = [];
  for (const c of list) {
    if (c.kind === 'ins') {
      const from = m.mapPos(c.from, 1);
      const to = m.mapPos(c.to, -1);
      if (to > from) out.push(from === c.from && to === c.to ? c : { ...c, from, to });
    } else {
      const at = m.mapPos(c.from, -1);
      out.push(at === c.from ? c : { ...c, from: at, to: at });
    }
  }
  return out;
}

/**
 * An edit recorded: the changes before it (`old`, in `start`'s coordinates) and the edit's own, in the new text's. What
 * is deleted outside words put in becomes words taken out (with those taken out already in that stretch, in their
 * order); what is typed becomes words put in, or grows the words put in it touches.
 */
export function recordEdit(old: Tracked[], changes: ChangeSet, start: Text, by: 'user' | 'agent', at: number): Tracked[] {
  const absorbed = new Set<string>();
  const dels: { pos: number; text: string }[] = [];
  const grow: { id: string; from: number; to: number }[] = [];
  const fresh: Tracked[] = [];
  changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    if (toA > fromA) {
      const marks = old.filter((c) => c.kind === 'del' && c.from >= fromA && c.from <= toA && !absorbed.has(c.id)).sort((a, b) => a.from - b.from);
      const ins = old.filter((c) => c.kind === 'ins' && c.to > fromA && c.from < toA);
      const cuts = [...new Set([fromA, toA, ...ins.flatMap((c) => [c.from, c.to]), ...marks.map((c) => c.from)].filter((x) => x >= fromA && x <= toA))].sort((a, b) => a - b);
      let text = '';
      let mi = 0;
      const marksAt = (p: number) => {
        for (; mi < marks.length && marks[mi].from <= p; mi++) {
          text += marks[mi].text;
          absorbed.add(marks[mi].id);
        }
      };
      for (let i = 0; i < cuts.length - 1; i++) {
        const [a, b] = [cuts[i], cuts[i + 1]];
        marksAt(a);
        // Words just put in that are deleted again leave no trace.
        if (!ins.some((c) => c.from <= a && b <= c.to)) text += start.sliceString(a, b);
      }
      marksAt(toA);
      if (text) dels.push({ pos: fromA, text });
    }
    if (inserted.length) {
      const touched = old.find((c) => c.kind === 'ins' && c.by === by && c.from <= fromA && toA <= c.to);
      if (touched) grow.push({ id: touched.id, from: fromB, to: toB });
      else fresh.push({ id: newChangeId(), kind: 'ins', from: fromB, to: toB, text: '', by, at });
    }
  });
  const out = mapTracked(
    old.filter((c) => !absorbed.has(c.id)),
    changes,
  ).map((c) => {
    const g = grow.filter((x) => x.id === c.id);
    return g.length ? { ...c, from: Math.min(c.from, ...g.map((x) => x.from)), to: Math.max(c.to, ...g.map((x) => x.to)) } : c;
  });
  for (const d of dels) {
    const pos = changes.mapPos(d.pos, -1);
    out.push({ id: newChangeId(), kind: 'del', from: pos, to: pos, text: d.text, by, at });
  }
  out.push(...fresh);
  // Words taken out are shown before what was typed in their place.
  return out.sort((a, b) => a.from - b.from || (a.kind === b.kind ? 0 : a.kind === 'del' ? -1 : 1));
}

export const trackField = StateField.define<Tracked[]>({
  create: () => [],
  update(list, t) {
    let next: Tracked[] | null = null;
    for (const e of t.effects) if (e.is(setTracked)) next = e.value;
    return next ?? (t.docChanged ? mapTracked(list, t.changes) : list);
  },
});

const activeField = StateField.define<string | null>({
  create: () => null,
  update(v, t) {
    for (const e of t.effects) if (e.is(setActive)) v = e.value;
    return v;
  },
});

/** Who made a change and how long ago, for its marks' tips (the editor's own words are not translated as the page is). */
function tip(c: Tracked): string {
  const s = Math.max(0, (Date.now() - c.at) / 1000);
  const when = s < 60 ? tr('just now') : s < 3600 ? tr(`${Math.floor(s / 60)} min ago`) : s < 86400 ? tr(`${Math.floor(s / 3600)} h ago`) : new Date(c.at).toLocaleDateString();
  const what = c.kind === 'ins' ? (c.by === 'agent' ? 'Put in by an agent' : 'Put in by you') : c.by === 'agent' ? 'Taken out by an agent' : 'Taken out by you';
  return `${tr(what)} · ${when}`;
}

class Taken extends WidgetType {
  constructor(
    readonly c: Tracked,
    readonly active: boolean,
  ) {
    super();
  }
  eq(o: Taken) {
    return o.c.id === this.c.id && o.c.text === this.c.text && o.active === this.active;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = this.active ? 'cm-tex-del cm-tex-change-active' : 'cm-tex-del';
    const t = this.c.text.replace(/\n/g, '↵');
    el.textContent = t.length > 120 ? `${t.slice(0, 60)}…${t.slice(-40)}` : t;
    el.title = tip(this.c);
    el.dataset.change = this.c.id;
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

const marks = EditorView.decorations.compute([trackField, activeField], (state) => {
  const list = state.field(trackField);
  const active = state.field(activeField);
  if (!list.length) return Decoration.none;
  const len = state.doc.length;
  const ranges = list
    .filter((c) => c.from <= len && c.to <= len)
    .map((c) =>
      c.kind === 'ins'
        ? Decoration.mark({ class: c.id === active ? 'cm-tex-ins cm-tex-change-active' : 'cm-tex-ins', attributes: { title: tip(c), 'data-change': c.id } }).range(c.from, c.to)
        : Decoration.widget({ widget: new Taken(c, c.id === active), side: -1 }).range(c.from),
    );
  return Decoration.set(ranges, true) as DecorationSet;
});

const theme = EditorView.baseTheme({
  '.cm-tex-ins': { backgroundColor: 'color-mix(in srgb, var(--ok, #22a06b) 16%, transparent)', borderBottom: '2px solid color-mix(in srgb, var(--ok, #22a06b) 70%, transparent)' },
  '.cm-tex-del': {
    color: 'var(--err, #d1453b)',
    textDecoration: 'line-through',
    backgroundColor: 'color-mix(in srgb, var(--err, #d1453b) 12%, transparent)',
    borderRadius: '2px',
    padding: '0 1px',
    margin: '0 1px',
  },
  '.cm-tex-change-active': { outline: '2px solid color-mix(in srgb, var(--accent) 65%, transparent)', outlineOffset: '1px' },
});

/** Records the edits made while it is on; the history keeps the marks before each edit, for Undo. */
const recorder = [
  EditorState.transactionExtender.of((t) => {
    if (!t.docChanged || !t.startState.facet(trackOn) || t.annotation(untracked) || t.isUserEvent('undo') || t.isUserEvent('redo')) return null;
    return { effects: setTracked.of(recordEdit(t.startState.field(trackField), t.changes, t.startState.doc, 'user', Date.now())) };
  }),
  invertedEffects.of((t) => {
    const was = t.startState.field(trackField, false);
    return was !== undefined && was !== t.state.field(trackField) ? [setTracked.of(was)] : [];
  }),
];

/** The extension, and what the editor does with it. */
export function trackChanges(): { extension: Extension; on: (v: EditorView, on: boolean) => void } {
  const c = new Compartment();
  return {
    extension: [trackField, activeField, marks, theme, recorder, c.of(trackOn.of(false))],
    on: (v, on) => v.dispatch({ effects: c.reconfigure(trackOn.of(on)) }),
  };
}

/** The changes as they are now: words put in with their words, words taken out with the characters before them. */
export const trackedNow = (state: EditorState): Tracked[] => state.field(trackField).map((c) => (c.kind === 'ins' ? { ...c, text: state.sliceDoc(c.from, c.to) } : { ...c, before: state.sliceDoc(Math.max(0, c.from - 40), c.from) || undefined }));

/** Sets the changes from the document (when the file's editor starts): not an edit, nothing to undo. */
export function loadTracked(v: EditorView, list: Tracked[]) {
  const len = v.state.doc.length;
  v.dispatch({ effects: setTracked.of(list.filter((c) => c.from <= len && c.to <= len)), annotations: [untracked.of(true), loaded.of(true), Transaction.addToHistory.of(false)] });
}

/** Accepts changes: their marks go, the text stays (undoable). */
export function acceptTracked(v: EditorView, ids: string[]) {
  const list = v.state.field(trackField);
  const next = list.filter((c) => !ids.includes(c.id));
  if (next.length !== list.length) v.dispatch({ effects: setTracked.of(next), annotations: untracked.of(true) });
}

/** Rejects changes: words put in go, words taken out come back where they were (undoable). */
export function rejectTracked(v: EditorView, ids: string[]) {
  const list = v.state.field(trackField);
  const gone = list.filter((c) => ids.includes(c.id));
  if (!gone.length) return;
  const changes = ChangeSet.of(
    gone.map((c) => (c.kind === 'ins' ? { from: c.from, to: c.to } : { from: c.from, insert: c.text })),
    v.state.doc.length,
  );
  // The others, where the text's new shape puts them: words taken out stay before what comes back at their place.
  const left = list.filter((c) => !ids.includes(c.id));
  v.dispatch({ changes, effects: setTracked.of(mapTracked(left, changes)), annotations: untracked.of(true), userEvent: 'input' });
}

/** Marks a change as the one picked (in the list beside the source). */
export const pickTracked = (v: EditorView, id: string | null) => v.dispatch({ effects: setActive.of(id) });
