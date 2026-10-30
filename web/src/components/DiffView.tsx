import { memo, useMemo, useState } from 'react';
import { compact } from '../lib/format';

interface Row {
  kind: 'ctx' | 'add' | 'del' | 'hunk';
  old?: number;
  new?: number;
  text: string;
  words?: [number, number];
}

function parse(diff: string): Row[] {
  const rows: Row[] = [];
  let o = 0;
  let n = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/.exec(line);
      o = m ? Number(m[1]) : o;
      n = m ? Number(m[2]) : n;
      rows.push({ kind: 'hunk', text: m?.[3]?.trim() ? `${line.slice(0, line.indexOf('@@', 2) + 2)}  ${m[3].trim()}` : line });
    } else if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git') || line.startsWith('index ')) {
      continue;
    } else if (line.startsWith('+')) rows.push({ kind: 'add', new: n++, text: line.slice(1) });
    else if (line.startsWith('-')) rows.push({ kind: 'del', old: o++, text: line.slice(1) });
    else if (line.startsWith('\\')) continue;
    else if (line.length || rows.length) rows.push({ kind: 'ctx', old: o++, new: n++, text: line.startsWith(' ') ? line.slice(1) : line });
  }
  while (rows.length && rows[rows.length - 1].kind === 'ctx' && !rows[rows.length - 1].text) rows.pop();
  // Word-level emphasis for a deletion directly followed by an addition.
  for (let i = 0; i < rows.length - 1; i++) {
    let j = i;
    while (j < rows.length && rows[j].kind === 'del') j++;
    const dels = j - i;
    let k = j;
    while (k < rows.length && rows[k].kind === 'add') k++;
    const adds = k - j;
    if (dels > 0 && dels === adds && dels <= 8) {
      for (let x = 0; x < dels; x++) mark(rows[i + x], rows[j + x]);
      i = k - 1;
    } else if (dels > 0) i = j - 1;
  }
  return rows;
}

function mark(a: Row, b: Row) {
  const s = a.text;
  const t = b.text;
  if (s.length > 1000 || t.length > 1000) return;
  let p = 0;
  while (p < s.length && p < t.length && s[p] === t[p]) p++;
  let q = 0;
  while (q < s.length - p && q < t.length - p && s[s.length - 1 - q] === t[t.length - 1 - q]) q++;
  if (p === 0 && q === 0) return;
  if (s.length - q > p) a.words = [p, s.length - q];
  if (t.length - q > p) b.words = [p, t.length - q];
}

function Line({ r }: { r: Row }) {
  if (!r.words) return <>{r.text || ' '}</>;
  const [a, b] = r.words;
  return (
    <>
      {r.text.slice(0, a)}
      <mark className={r.kind === 'add' ? 'word-add' : 'word-del'}>{r.text.slice(a, b)}</mark>
      {r.text.slice(b)}
    </>
  );
}

const LIMIT = 1500;

export const DiffView = memo(function DiffView({ diff, className }: { diff: string; className?: string }) {
  const rows = useMemo(() => parse(diff), [diff]);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, LIMIT);
  if (!rows.length) return <div className="px-3 py-2 text-[12px] text-fg-3">No line changes</div>;
  return (
    <div className={className}>
      <div className="diff">
        <table>
          <tbody>
            {shown.map((r, i) =>
              r.kind === 'hunk' ? (
                <tr key={i} className="hunk">
                  <td colSpan={4}>&nbsp;{r.text}</td>
                </tr>
              ) : (
                <tr key={i} className={r.kind === 'ctx' ? '' : r.kind}>
                  <td className="ln">{r.old ?? ''}</td>
                  <td className="ln">{r.new ?? ''}</td>
                  <td className="sign">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}</td>
                  <td>
                    <Line r={r} />
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {rows.length > LIMIT && !all && (
        <button onClick={() => setAll(true)} className="w-full border-t border-line py-1 text-[11.5px] text-fg-3 hover:bg-bg-3 hover:text-fg">
          Show all {rows.length.toLocaleString()} lines
        </button>
      )}
    </div>
  );
});

/** +12 −3 line counts. `compact` shortens big numbers (15.7K, 1.2M); the exact ones are in the tooltip. */
export function DiffStat({ added, removed, className, compact: short }: { added: number; removed: number; className?: string; compact?: boolean }) {
  if (!added && !removed) return null;
  const fmt = (n: number) => (short && n >= 1000 ? compact(n) : n.toLocaleString());
  return (
    <span
      className={`tnum inline-flex shrink-0 items-center gap-1 font-mono text-[11.5px] ${className ?? ''}`}
      title={`${added.toLocaleString()} lines added, ${removed.toLocaleString()} removed`}
    >
      {added > 0 && <span className="text-add">+{fmt(added)}</span>}
      {removed > 0 && <span className="text-del">−{fmt(removed)}</span>}
    </span>
  );
}
