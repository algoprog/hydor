// Any data, laid out as it is: what an answer UI shows when its name is unknown or its view fails. Text as Markdown, a
// picture's address as the picture, a list of objects as a table (or cards, when they are wide), a list of words as a
// list, an object as label and value rows. Also the data as plain text, for copying a UI.
import type { ReactNode } from 'react';
import { Card, isObj, KeyValues, Md, Pic, str } from './kit';

const PIC = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;
const humanize = (k: string) => (k.charAt(0).toUpperCase() + k.slice(1)).replace(/[_-]+/g, ' ');

function Value({ v, depth = 0 }: { v: unknown; depth?: number }): ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-fg-3">—</span>;
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'string') return /^https?:\/\//i.test(v) && PIC.test(v) ? <Pic src={v} className="h-24 w-36 rounded-lg" /> : <Md text={v} inline={v.length < 120} />;
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-fg-3">—</span>;
    if (v.every((x) => !isObj(x) && !Array.isArray(x)))
      return (
        <ul className="m-0 list-disc space-y-0.5 pl-5">
          {v.map((x, i) => (
            <li key={i}>
              <Value v={x} depth={depth + 1} />
            </li>
          ))}
        </ul>
      );
    const rows = v.filter(isObj);
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 8);
    const flat = rows.every((r) => Object.values(r).every((x) => !isObj(x) && !Array.isArray(x)));
    if (flat && keys.length <= 6)
      return (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-bg-1">
                {keys.map((k) => (
                  <th key={k} className="px-2.5 py-1.5 text-left font-medium whitespace-nowrap text-fg-3">
                    {humanize(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-line/70 align-top">
                  {keys.map((k) => (
                    <td key={k} className="px-2.5 py-1.5">
                      <Value v={r[k]} depth={depth + 1} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    return (
      <div className="grid gap-2">
        {v.map((x, i) => (
          <div key={i} className="rounded-lg border border-line p-3">
            <Value v={x} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (isObj(v)) {
    const entries = Object.entries(v).filter(([k]) => k !== 'ui');
    const simple = entries.filter(([, x]) => !isObj(x) && !Array.isArray(x) && !(typeof x === 'string' && x.length > 120));
    const rich = entries.filter((e) => !simple.includes(e));
    return (
      <div className="space-y-3">
        {simple.length > 0 && <KeyValues rows={simple.map(([k, x]) => ({ label: humanize(k), value: typeof x === 'boolean' ? (x ? '✓' : '✗') : str(x) || (x === null ? '—' : String(x)) }))} />}
        {rich.map(([k, x]) => (
          <div key={k}>
            <div className="mb-1 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">{humanize(k)}</div>
            <Value v={x} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  return String(v);
}

export function DataView({ data }: { data: unknown }) {
  const d = isObj(data) ? data : {};
  const title = str(d.title);
  const { title: _t, ...rest } = d;
  return (
    <Card>
      {title && <h3 className="aui-h3 mb-3">{title}</h3>}
      <Value v={rest} />
    </Card>
  );
}

/** The data as plain text: a title, then label: value lines, lists as points, nested parts indented. */
export function dataText(data: unknown, title?: string): string {
  const out: string[] = [];
  const walk = (v: unknown, pad: string, label?: string) => {
    const head = label ? `${pad}${humanize(label)}: ` : pad;
    if (v === null || v === undefined || v === '') return;
    if (!isObj(v) && !Array.isArray(v)) return void out.push(`${head}${typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)}`);
    if (Array.isArray(v)) {
      if (label) out.push(`${pad}${humanize(label)}:`);
      for (const x of v) {
        if (!isObj(x) && !Array.isArray(x)) out.push(`${pad}- ${String(x)}`);
        else if (isObj(x)) {
          const o = x as Record<string, unknown>;
          const nameKey = ['name', 'title', 'label', 'text', 'q'].find((k) => str(o[k]));
          out.push(`${pad}- ${nameKey ? str(o[nameKey]) : ''}`.trimEnd());
          for (const [k, y] of Object.entries(o)) if (k !== nameKey) walk(y, `${pad}  `, k);
        } else walk(x, `${pad}  `);
      }
      return;
    }
    if (label) out.push(`${pad}${humanize(label)}:`);
    for (const [k, y] of Object.entries(v)) if (k !== 'ui') walk(y, label ? `${pad}  ` : pad, k);
  };
  const d = isObj(data) ? data : {};
  out.push(str(d.title) || title || '');
  const { title: _t, ...rest } = d;
  walk(rest, '');
  return out.filter((l, i) => l || i).join('\n').trim();
}
