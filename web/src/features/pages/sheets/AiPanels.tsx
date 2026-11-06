// Two panels beside the grid. Analyze the data: what the table holds, column by column, with charts and pivot tables
// to put in at a click (found here, for nothing), and questions about it answered by the helper model, with more ideas.
// Clean up the data: what is untidy in the table (shared/sheet-clean.ts), each with a Fix, one step to undo.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Check, Eye, Sparkles, Table2, Wand2 } from 'lucide-react';
import type { AnalyzeAnswer, AnalyzeIdea } from '@shared/sheet-ai';
import type { CleanIssue } from '@shared/sheet-clean';
import { colName, formatValue, isDateFmt, rangeName, refName, type Calc, type Rect, type Sheet } from '@shared/sheets';
import { Button, cx, inputCls, Throbber } from '../../../components/ui';
import { CostLine, askAi } from './AiTools';
import { SidePanel } from './Panel';
import { tableText } from './ai';

/** A column of the table, as the panel and the helper model see it: its letter, header, kind and what it holds over all its rows. */
export interface ColumnInfo {
  c: number;
  letter: string;
  name: string;
  kind: 'number' | 'date' | 'words' | 'checks' | 'empty';
  /** How many different words (for words). */
  distinct: number;
  about: string;
}

/** What each column of a table holds (its first row a header when `header`). */
export function columnsOf(sh: Sheet, calc: Calc, si: number, x: Rect, header: boolean): ColumnInfo[] {
  const out: ColumnInfo[] = [];
  const r0 = header ? x.r1 + 1 : x.r1;
  for (let c = x.c1; c <= x.c2 && out.length < 60; c++) {
    const h = header ? calc.value(si, x.r1, c) : null;
    const name = typeof h === 'string' && h.trim() ? h.trim() : `Column ${colName(c)}`;
    const nums: number[] = [];
    const words = new Map<string, number>();
    let checks = 0;
    let ticked = 0;
    let dates = 0;
    for (let r = r0; r <= x.r2; r++) {
      const v = calc.value(si, r, c);
      if (typeof v === 'number') {
        nums.push(v);
        if (isDateFmt(sh.cells[refName(r, c)]?.s?.fmt)) dates++;
      } else if (typeof v === 'boolean') {
        checks++;
        if (v) ticked++;
      } else if (typeof v === 'string' && v.trim()) words.set(v.trim(), (words.get(v.trim()) ?? 0) + 1);
    }
    const fmt = (n: number) => formatValue(Math.round(n * 100) / 100, sh.cells[refName(r0, c)]?.s);
    let kind: ColumnInfo['kind'] = 'empty';
    let about = 'empty';
    if (nums.length && nums.length >= words.size) {
      const sum = nums.reduce((a, b) => a + b, 0);
      const lo = Math.min(...nums);
      const hi = Math.max(...nums);
      if (dates >= nums.length / 2) {
        kind = 'date';
        about = `dates: ${nums.length} values, from ${fmt(lo)} to ${fmt(hi)}`;
      } else {
        kind = 'number';
        about = `numbers: ${nums.length} values, sum ${fmt(sum)}, from ${fmt(lo)} to ${fmt(hi)}, mean ${fmt(sum / nums.length)}`;
      }
    } else if (words.size) {
      kind = 'words';
      const top = [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      about = `words: ${[...words.values()].reduce((a, b) => a + b, 0)} values, ${words.size} different (most: ${top.map(([w, n]) => `“${w.slice(0, 30)}” ×${n}`).join(', ')})`;
    } else if (checks) {
      kind = 'checks';
      about = `TRUE or FALSE: ${ticked} of ${checks} TRUE`;
    }
    out.push({ c, letter: colName(c), name, kind, distinct: words.size, about });
  }
  return out;
}

/** Ideas found here for nothing: a chart and a pivot table of a number column by a column of categories, a line over dates, two numbers against each other. */
function localIdeas(cols: ColumnInfo[]): AnalyzeIdea[] {
  const out: AnalyzeIdea[] = [];
  const nums = cols.filter((c) => c.kind === 'number');
  const cats = cols.filter((c) => c.kind === 'words' && c.distinct >= 2 && c.distinct <= 30);
  const dates = cols.filter((c) => c.kind === 'date');
  if (cats[0] && nums[0]) {
    out.push({ kind: 'chart', title: `${nums[0].name} by ${cats[0].name}`, why: 'A column chart of the table’s rows.', chart: 'column', x: cats[0].letter, ys: [nums[0].letter] });
    out.push({ kind: 'pivot', title: `Total ${nums[0].name} for each ${cats[0].name}`, why: 'A pivot table on a sheet of its own, made of formulas that keep up with the table.', by: cats[0].letter, values: [{ col: nums[0].letter, fn: 'sum' }, { col: nums[0].letter, fn: 'count' }] });
  }
  if (dates[0] && nums[0]) out.push({ kind: 'chart', title: `${nums[0].name} over time`, why: 'A line chart over the dates.', chart: 'line', x: dates[0].letter, ys: nums.slice(0, 3).map((n) => n.letter) });
  if (nums.length >= 2) out.push({ kind: 'chart', title: `${nums[1].name} against ${nums[0].name}`, why: 'A scatter chart: does one move with the other?', chart: 'scatter', x: nums[0].letter, ys: [nums[1].letter] });
  if (cats[0] && nums[0] && cats[1]) out.push({ kind: 'pivot', title: `${nums[0].name} by ${cats[0].name} and ${cats[1].name}`, why: 'A pivot table with the second column across.', by: cats[0].letter, across: cats[1].letter, values: [{ col: nums[0].letter, fn: 'sum' }] });
  return out.slice(0, 4);
}

const ICON = { chart: <BarChart3 size={14} />, pivot: <Table2 size={14} />, formula: <Wand2 size={14} /> };

export function AnalyzePanel({
  sheet,
  calc,
  si,
  block,
  header,
  narrow,
  onIdea,
  onClose,
}: {
  sheet: Sheet;
  calc: Calc;
  si: number;
  block: Rect;
  header: boolean;
  narrow: boolean;
  onIdea: (idea: AnalyzeIdea) => void;
  onClose: () => void;
}) {
  const cols = useMemo(() => columnsOf(sheet, calc, si, block, header), [sheet, calc, si, block, header]);
  const ideas = useMemo(() => localIdeas(cols), [cols]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<AnalyzeAnswer | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Set<string>>(new Set());
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);
  const ask = async (question: string) => {
    stop.current?.abort();
    const c = (stop.current = new AbortController());
    setBusy(true);
    setError('');
    try {
      const table = tableText(sheet, calc, si, block, 80);
      setGot(await askAi<AnalyzeAnswer>('/api/write/sheet-analyze', { question, sheet: sheet.name, range: rangeName(block), table, columns: cols.map((x) => ({ letter: x.letter, name: x.name, about: x.about })) }, c.signal));
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (stop.current === c) setBusy(false);
    }
  };
  const card = (idea: AnalyzeIdea, i: number, from: string) => {
    const id = `${from}${i}`;
    return (
      <div key={id} className="rounded-lg border border-line bg-bg p-2.5">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 text-fg-3">{ICON[idea.kind]}</span>
          <div className="min-w-0 flex-1">
            <div translate="no" className="text-[13px] font-medium leading-snug">
              {idea.title}
            </div>
            {idea.why && <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{idea.why}</div>}
            {idea.kind === 'formula' && (
              <div translate="no" className="mt-1 font-mono text-[11.5px] break-all text-fg-2">
                {idea.formula}
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant={done.has(id) ? 'ghost' : 'secondary'}
            icon={done.has(id) ? <Check size={13} /> : undefined}
            onClick={() => {
              onIdea(idea);
              setDone(new Set([...done, id]));
            }}
          >
            {done.has(id) ? 'Inserted' : 'Insert'}
          </Button>
        </div>
      </div>
    );
  };
  return (
    <SidePanel title="Analyze the data" narrow={narrow} onClose={onClose}>
      <div className="space-y-3 p-3.5">
        <div className="text-[12.5px] text-fg-3">
          The table {rangeName(block)}: {block.r2 - block.r1 + (header ? 0 : 1)} rows, {cols.length} columns
        </div>
        <div className="space-y-1">
          {cols.map((c) => (
            <div key={c.c} className="text-[12px] leading-snug">
              <span translate="no" className="font-medium">
                {c.name}
              </span>{' '}
              <span className="text-fg-3">({c.letter})</span> <span className="text-fg-3">{c.about.replace(/^[^:]+: /, '')}</span>
            </div>
          ))}
        </div>
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) void ask(q.trim());
          }}
        >
          <div className="flex gap-1.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Which month sold most?" aria-label="Ask about the data" className={cx(inputCls, 'h-8.5 min-w-0 flex-1 text-[13px]')} />
            <Button size="sm" variant="primary" type="submit" disabled={!q.trim() || busy} icon={busy ? <Throbber size={13} /> : <Sparkles size={14} />}>
              Ask
            </Button>
          </div>
          <CostLine />
        </form>
        {error && <div className="text-[12.5px] text-err">{error}</div>}
        {got && (
          <div className="space-y-2">
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{got.answer}</div>
            {got.ideas.map((idea, i) => card(idea, i, 'ai'))}
          </div>
        )}
        {ideas.length > 0 && (
          <div className="space-y-2">
            <div className="text-[12px] font-medium text-fg-3">Ideas</div>
            {ideas.map((idea, i) => card(idea, i, 'own'))}
          </div>
        )}
        {!got && (
          <Button size="sm" variant="ghost" icon={busy ? <Throbber size={13} /> : <Sparkles size={14} />} disabled={busy} onClick={() => void ask('')}>
            What stands out, and more ideas with AI
          </Button>
        )}
      </div>
    </SidePanel>
  );
}

export function CleanPanel({ issues, narrow, onFix, onShow, onClose }: { issues: CleanIssue[]; narrow: boolean; onFix: (list: CleanIssue[]) => void; onShow: (issue: CleanIssue) => void; onClose: () => void }) {
  return (
    <SidePanel
      title="Clean up the data"
      narrow={narrow}
      onClose={onClose}
      footer={
        issues.length > 1 ? (
          <Button size="sm" variant="primary" onClick={() => onFix(issues)}>
            Fix all
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-2 p-3.5">
        {!issues.length && (
          <div className="flex items-center gap-2 text-[13px] text-fg-2">
            <Check size={15} className="text-ok" /> Nothing to clean up in this table.
          </div>
        )}
        {issues.map((it) => (
          <div key={it.id} className="rounded-lg border border-line bg-bg p-2.5">
            <div translate="no" className="text-[13px] font-medium leading-snug">
              {it.title}
            </div>
            <div translate="no" className="mt-0.5 text-[12px] leading-snug text-fg-3">
              {it.detail}
            </div>
            <div className="mt-2 flex justify-end gap-1.5">
              {it.cells.length > 0 && (
                <Button size="sm" variant="ghost" icon={<Eye size={13} />} onClick={() => onShow(it)}>
                  Show
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => onFix([it])}>
                Fix
              </Button>
            </div>
          </div>
        ))}
      </div>
    </SidePanel>
  );
}
