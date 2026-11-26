// Where everything stands on the map of attempts (RoundsMap.tsx draws it). Pure, so a test can read it (map-test.ts).
//
// Every round has a column of its own, left to right by its number, so no two boxes can meet. The start and the kept
// rounds (and the round at work, and the goal at the right end) are on a line: each goes on along the row of the round
// it started from, or, when that row has gone on already (Another way from here), starts a line of its own lower down.
// A round that was undone, or left as it is, hangs below the round it started from. Links run only where no box is:
// down the column of the round they leave, along a row that is empty that far, or in the gap above a row.
import { roundParents, type GoalState } from '@shared/goals';

export type MapKind = 'start' | 'kept' | 'undone' | 'stays' | 'working' | 'goal';

/** A box: a round (the start is round 0), the round at work, or the goal (its n is one past the last round's). */
export interface MapNode {
  n: number;
  kind: MapKind;
  col: number;
  row: number;
}

/**
 * How a link runs from the round another started from. along: straight on in the same row. branch: down, then into a
 * line of its own from its left. hang: down to the gap above its row, across, and into its top. rise: on from a round
 * left to the side, and up into the line again.
 */
export type MapShape = 'along' | 'branch' | 'hang' | 'rise';

export interface MapLink {
  /** Indexes into the nodes. */
  from: number;
  to: number;
  shape: MapShape;
  /** What it leads to: a kept round, one that was not kept, the round at work, the goal. */
  kind: 'kept' | 'dead' | 'working' | 'goal';
}

export interface MapLayout {
  nodes: MapNode[];
  links: MapLink[];
  cols: number;
  rows: number;
}

const onLine = (k: MapKind) => k !== 'undone' && k !== 'stays';

export function mapLayout(g: Pick<GoalState, 'rounds' | 'best' | 'round' | 'roundParent' | 'status'>): MapLayout {
  const rounds = [...g.rounds].sort((a, b) => a.n - b.n);
  const parents = roundParents(rounds);
  const want: { n: number; kind: MapKind; parent?: number }[] = rounds.map((r) => ({ n: r.n, kind: r.n === 0 ? 'start' : r.outcome === 'start' ? 'kept' : r.outcome, parent: parents.get(r.n) }));
  const last = rounds.at(-1)?.n ?? 0;
  const at = g.status === 'working' || g.status === 'checking' ? g.round : undefined;
  const running = at != null && at > last ? at : undefined;
  if (running != null) want.push({ n: running, kind: 'working', parent: g.roundParent ?? g.best ?? 0 });
  // The goal goes on from the round at work, else from where the files stand: the best so far.
  if (want.length) want.push({ n: (running ?? last) + 1, kind: 'goal', parent: running ?? g.best ?? 0 });

  const nodes: MapNode[] = [];
  const links: MapLink[] = [];
  const index = new Map<number, number>();
  /** By node, the round it started from (as an index), for finding the line a round left to the side came from. */
  const from: (number | undefined)[] = [];
  /** By row, the last column its middle is taken up to (a box, or a link running along it). */
  const used: number[] = [];
  /** By row, what runs in the gap above it: whose links (the column they leave) and how far. */
  const gap: ({ of: number; to: number } | undefined)[] = [];
  const taken = (row: number) => used[row] ?? -1;

  want.forEach((w, col) => {
    const pi = w.parent == null ? undefined : (index.get(w.parent) ?? (nodes.length ? 0 : undefined));
    const p = pi == null ? undefined : nodes[pi];
    let row = 0;
    if (p) {
      const line = onLine(w.kind);
      let shape: MapShape;
      // The kept round (or the start) the line of a round left to the side came from.
      let a = pi;
      while (a != null && !onLine(nodes[a].kind)) a = from[a];
      const anchor = a == null ? undefined : nodes[a];
      if (line === onLine(p.kind) && taken(p.row) === p.col) {
        row = p.row;
        shape = 'along';
      } else if (line && !onLine(p.kind) && anchor && anchor.row < p.row && taken(anchor.row) === anchor.col && taken(p.row) === p.col) {
        row = anchor.row;
        shape = 'rise';
        used[p.row] = col;
      } else if (line) {
        row = p.row + 1;
        // (As far as this round's own column counts too: a link rising into it runs along there.)
        while (taken(row) >= p.col) row++;
        shape = 'branch';
      } else {
        row = p.row + 1;
        // Beside the others that hang from the same round, else the first row with room.
        while (gap[row]?.of !== p.col && (taken(row) > p.col || (gap[row]?.to ?? -1) > p.col)) row++;
        gap[row] = { of: p.col, to: col };
        shape = 'hang';
      }
      links.push({ from: pi!, to: nodes.length, shape, kind: w.kind === 'goal' ? 'goal' : w.kind === 'working' ? 'working' : line ? 'kept' : 'dead' });
    }
    used[row] = Math.max(taken(row), col);
    index.set(w.n, nodes.length);
    from.push(pi);
    nodes.push({ n: w.n, kind: w.kind, col, row });
  });

  return { nodes, links, cols: nodes.length, rows: nodes.reduce((m, x) => Math.max(m, x.row + 1), 0) };
}

// ---- in pixels -------------------------------------------------------------------------------------------------------------

export const BOX = { w: 136, h: 60, gapX: 26, gapY: 24, pad: 8 };
/** How far from a box's middle the links that leave it downwards start: those to a line left of it, the hanging ones right. */
const OFF = 14;

export const boxAt = (n: Pick<MapNode, 'col' | 'row'>): { x: number; y: number } => ({ x: BOX.pad + n.col * (BOX.w + BOX.gapX), y: BOX.pad + n.row * (BOX.h + BOX.gapY) });

export const mapSize = (l: Pick<MapLayout, 'cols' | 'rows'>): { width: number; height: number } => ({
  width: BOX.pad * 2 + Math.max(0, l.cols * (BOX.w + BOX.gapX) - BOX.gapX),
  height: BOX.pad * 2 + Math.max(0, l.rows * (BOX.h + BOX.gapY) - BOX.gapY),
});

/** The corners a link goes through. */
export function linkPoints(l: Pick<MapLayout, 'nodes'>, k: MapLink): [number, number][] {
  const a = boxAt(l.nodes[k.from]);
  const b = boxAt(l.nodes[k.to]);
  const ax = a.x + BOX.w / 2;
  const ay = a.y + BOX.h / 2;
  const bx = b.x + BOX.w / 2;
  const by = b.y + BOX.h / 2;
  if (k.shape === 'along') return [[a.x + BOX.w, ay], [b.x, by]];
  if (k.shape === 'branch') return [[ax - OFF, a.y + BOX.h], [ax - OFF, by], [b.x, by]];
  if (k.shape === 'rise') return [[a.x + BOX.w, ay], [bx, ay], [bx, b.y + BOX.h]];
  const mid = b.y - BOX.gapY / 2;
  return [[ax + OFF, a.y + BOX.h], [ax + OFF, mid], [bx, mid], [bx, b.y]];
}

/** The link as an SVG path, its corners rounded. */
export function linkPath(points: [number, number][], radius = 8): string {
  const out = [`M${points[0][0]} ${points[0][1]}`];
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const toward = ([x2, y2]: [number, number]) => {
      const d = Math.hypot(x2 - x, y2 - y) || 1;
      const r = Math.min(radius, d / 2);
      return `${x + ((x2 - x) / d) * r} ${y + ((y2 - y) / d) * r}`;
    };
    out.push(`L${toward(points[i - 1])}`, `Q${x} ${y} ${toward(points[i + 1])}`);
  }
  const end = points[points.length - 1];
  out.push(`L${end[0]} ${end[1]}`);
  return out.join('');
}
