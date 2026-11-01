// The history's graph, drawn from each commit's parents. Commits come newest first, each before its parents
// (git log --date-order). Lanes are columns: each holds the commit it waits for next. A commit takes the
// lane waiting for it (the leftmost, when several do: branches meeting at their fork) or a free one; its first
// parent carries on in that lane, and a merge's other parents get lanes of their own. Each row is drawn on
// its own (lines from the top edge into the dot, from the dot to the bottom edge, and lanes passing by), so
// rows of one height stack into the whole picture, and the next page carries on where the last ended.
import { memo } from 'react';

export interface GraphRow {
  /** The commit's lane. */
  col: number;
  color: number;
  /** Lines coming down into the dot, from these lanes at the row's top. */
  up: { from: number; color: number }[];
  /** Lines leaving the dot for these lanes at the row's bottom (its parents). */
  down: { to: number; color: number }[];
  /** Lanes going past, top to bottom. */
  pass: { lane: number; color: number }[];
  /** Lanes the row spans. */
  width: number;
}

export function layout(commits: { hash: string; parents: string[] }[]): GraphRow[] {
  const lanes: (string | null)[] = [];
  const colors: number[] = [];
  let next = 0;
  const free = () => {
    const i = lanes.indexOf(null);
    if (i >= 0) return i;
    lanes.push(null);
    colors.push(0);
    return lanes.length - 1;
  };
  const rows: GraphRow[] = [];
  for (const c of commits) {
    const waiting: number[] = [];
    lanes.forEach((h, i) => h === c.hash && waiting.push(i));
    let col = waiting[0];
    if (col === undefined) {
      col = free();
      colors[col] = next++;
    }
    const color = colors[col];
    const before = [...lanes];
    const up = waiting.map((i) => ({ from: i, color: colors[i] }));
    // Lanes that met here end here.
    for (const i of waiting) if (i !== col) lanes[i] = null;
    const down: GraphRow['down'] = [];
    const [first, ...others] = c.parents;
    if (!first) lanes[col] = null;
    else {
      // The first parent carries on in this lane, unless another lane waits for it already: then this one joins it.
      const there = lanes.findIndex((h, i) => h === first && i !== col);
      if (there >= 0) {
        lanes[col] = null;
        down.push({ to: there, color });
      } else {
        lanes[col] = first;
        down.push({ to: col, color });
      }
      for (const p of others) {
        let j = lanes.indexOf(p);
        if (j < 0) {
          j = free();
          lanes[j] = p;
          colors[j] = next++;
        }
        down.push({ to: j, color: colors[j] });
      }
    }
    const pass: GraphRow['pass'] = [];
    for (let i = 0; i < before.length; i++) if (before[i] && before[i] !== c.hash && lanes[i] === before[i]) pass.push({ lane: i, color: colors[i] });
    const width = Math.max(before.length, lanes.length, col + 1);
    while (lanes.length && lanes[lanes.length - 1] === null) {
      lanes.pop();
      colors.pop();
    }
    rows.push({ col, color, up, down, pass, width });
  }
  return rows;
}

// Theme colours, so the lanes suit dark and light themes alike.
const PALETTE = ['var(--accent)', 'var(--info)', 'var(--ok)', 'var(--claude)', 'var(--codex)', 'var(--warn)'];
export const laneColor = (n: number) => PALETTE[n % PALETTE.length];

/** Lane width in pixels; the graph shows at most `max` lanes (more are cut off at its edge). */
export const LANE = 14;

/**
 * One row of the graph, `height` pixels tall. The dot: filled for a commit the remote has, a ring for one only
 * here (`local`), larger for HEAD.
 */
export const GraphCell = memo(function GraphCell({ row, height, lanes, local, head, merge }: { row: GraphRow; height: number; lanes: number; local?: boolean; head?: boolean; merge?: boolean }) {
  const w = Math.max(1, lanes) * LANE + 6;
  const x = (i: number) => 4 + i * LANE + LANE / 2;
  const mid = height / 2;
  const cx0 = x(row.col);
  const curve = (x1: number, y1: number, x2: number, y2: number) => (x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`);
  const r = head ? 5 : merge ? 3.5 : 4.5;
  return (
    <svg width={w} height={height} className="shrink-0 overflow-hidden" aria-hidden>
      {row.pass.map((p) => (
        <path key={`p${p.lane}`} d={`M${x(p.lane)} 0V${height}`} stroke={laneColor(p.color)} strokeWidth={2} fill="none" strokeOpacity={0.75} />
      ))}
      {/* Lines meet the dot at its edge, so a ring stays empty inside. */}
      {row.up.map((u) => (
        <path key={`u${u.from}`} d={curve(x(u.from), 0, cx0, mid - r)} stroke={laneColor(u.color)} strokeWidth={2} fill="none" strokeOpacity={0.75} />
      ))}
      {row.down.map((d) => (
        <path key={`d${d.to}`} d={curve(cx0, mid + r, x(d.to), height)} stroke={laneColor(d.color)} strokeWidth={2} fill="none" strokeOpacity={0.75} />
      ))}
      <circle cx={cx0} cy={mid} r={local ? r - 1 : r} fill={local ? 'none' : laneColor(row.color)} stroke={laneColor(row.color)} strokeWidth={local ? 2 : 0} />
      {head && !local && <circle cx={cx0} cy={mid} r={r + 2.5} fill="none" stroke={laneColor(row.color)} strokeWidth={1.5} strokeOpacity={0.6} />}
    </svg>
  );
});
