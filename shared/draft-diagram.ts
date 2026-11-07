// A diagram while an agent's save_diagram call streams in (page-drafts.ts says what drafts are for). A whole diagram
// said as nodes and edges (or pages of them) is laid out again as each node comes, so the diagram grows on the canvas
// as it is written; one given as the model shows its items as they come; Mermaid shows once what has come reads as a
// diagram; changes by id (change, add, remove, layout) show made on the version open as they come. The node being
// written is the agent's mark.
import { normalizeDiagram, type Diagram, type DiagramPage } from './diagram.ts';
import { applyDiagramEdits } from './diagram-edits.ts';
import { mermaidSpec } from './diagram-mermaid.ts';
import { LAYOUTS, specPage, type SpecOpts, type SpecPage } from './diagram-spec.ts';
import type { DraftMemo, Drafted } from './page-drafts.ts';
import type { PartialJson } from './partial-json.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Icons by name, once the editor has them (left out, icon shapes show as boxes until the saved version comes). */
let iconOf: SpecOpts['icon'];
export const setDraftIcons = (f: SpecOpts['icon']) => (iconOf = f);

const layoutOf = (v: unknown) => (typeof v === 'string' && (LAYOUTS as string[]).includes(v) ? (v as SpecPage['layout']) : undefined);

/** A page said in a call so far, as a spec: its nodes and edges (each as far as it has come), or its Mermaid. */
function specOf(x: Obj, i: number, last: Map<number, SpecPage>): SpecPage | null {
  if (typeof x.mermaid === 'string') {
    try {
      const s = { ...mermaidSpec(x.mermaid).page, ...(typeof x.name === 'string' ? { name: x.name } : {}), ...(layoutOf(x.layout) ? { layout: layoutOf(x.layout) } : {}) };
      last.set(i, s);
      return s;
    } catch {
      // Not yet a diagram (a line cut short): the last that read stays.
      return last.get(i) ?? null;
    }
  }
  const nodes = (Array.isArray(x.nodes) ? x.nodes : []).filter((n): n is Obj => isObj(n) && typeof n.id === 'string' && !!n.id);
  const edges = (Array.isArray(x.edges) ? x.edges : []).filter((e): e is Obj => isObj(e) && typeof e.from === 'string' && typeof e.to === 'string');
  return { name: typeof x.name === 'string' ? x.name : undefined, layout: layoutOf(x.layout) ?? layoutOf(x.direction), nodes: nodes as unknown as SpecPage['nodes'], edges: edges as unknown as SpecPage['edges'] };
}

const mermaidMemo = new WeakMap<DraftMemo, Map<number, SpecPage>>();

/** The version a save_diagram call so far writes over `base` (the version open; none for a new diagram). */
export function draftDiagram(base: Diagram | null, p: PartialJson, memo: DraftMemo): Drafted<Diagram> | null {
  const a = p.value;
  if (!isObj(a)) return null;
  const open = p.open ?? [];
  const last = mermaidMemo.get(memo) ?? new Map<number, SpecPage>();
  mermaidMemo.set(memo, last);
  const key = JSON.stringify(a);
  const made = memo.make<Drafted<Diagram> | null>(`diagram:${key}`, () => {
    // Changes by id, on the version open.
    if (base && ['change', 'add', 'remove', 'layout'].some((k) => a[k] !== undefined) && !a.nodes && !a.pages && !a.mermaid && !a.diagram) {
      const r = applyDiagramEdits(base, { change: Array.isArray(a.change) ? a.change : undefined, add: isObj(a.add) || Array.isArray(a.add) ? (a.add as never) : undefined, remove: Array.isArray(a.remove) ? a.remove : undefined, page: a.page as string | number | undefined, layout: layoutOf(a.layout) }, { icon: iconOf });
      const item = open[0] === 'change' && typeof open[1] === 'number' && isObj((a.change as unknown[])[open[1]]) ? String(((a.change as Obj[])[open[1]] as Obj).id ?? '') : undefined;
      return { model: r.diagram, mark: { kind: 'diagram', page: 0, ...(item ? { item } : {}) } };
    }
    // The model itself.
    if (isObj(a.diagram) || (Array.isArray(a.pages) && a.pages.some((x) => isObj(x) && Array.isArray(x.items)))) return { model: normalizeDiagram(a.diagram ?? { pages: a.pages }), mark: null };
    // Nodes and edges (or Mermaid), page by page, laid out as they come.
    const specs: SpecPage[] = [];
    if (Array.isArray(a.pages)) a.pages.forEach((x, i) => isObj(x) && specs.push(specOf(x, i, last) ?? { nodes: [], edges: [] }));
    else if (Array.isArray(a.nodes) || typeof a.mermaid === 'string') {
      const s = specOf(a, 0, last);
      if (s) specs.push(s);
    }
    if (!specs.length) return base ? { model: base, mark: null } : null;
    const pages: DiagramPage[] = specs.map((s, i) => specPage(s, { icon: iconOf, id: `p${i + 1}`, name: `Page ${i + 1}` }).page);
    const pi = open[0] === 'pages' && typeof open[1] === 'number' ? open[1] : 0;
    const nodesAt = open[0] === 'pages' ? open.slice(2) : open;
    const nodeList = open[0] === 'pages' ? ((a.pages as Obj[])[pi]?.nodes as Obj[] | undefined) : (a.nodes as Obj[] | undefined);
    const item = nodesAt[0] === 'nodes' && typeof nodesAt[1] === 'number' && nodeList && isObj(nodeList[nodesAt[1]]) ? String(nodeList[nodesAt[1]].id ?? '') : undefined;
    return { model: normalizeDiagram({ pages, grid: base?.grid ?? 10, sketch: a.sketch === true || undefined }), mark: { kind: 'diagram', page: pi, ...(item ? { item } : {}) } };
  });
  memo.turn();
  return made;
}
