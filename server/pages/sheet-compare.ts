// What changed between two versions of a spreadsheet, in words, for an agent (page_action compare): the same comparison
// the editor's Compare shows (shared/sheet-diff.ts), as the counts and each tab's changes, cell by cell.
import { refName } from '../../shared/sheets.ts';
import type { BookDiff, CellChange, OtherPart } from '../../shared/sheet-diff.ts';

const OTHER_WORDS: Record<OtherPart, string> = {
  charts: 'charts',
  merges: 'merged cells',
  filter: 'the filter',
  conditional: 'conditional formatting',
  validation: 'data validation',
  freeze: 'frozen rows or columns',
  protect: 'protected ranges',
  groups: 'grouped rows or columns',
  tabColor: 'the tab colour',
  hidden: 'whether the tab is hidden',
  board: 'the Kanban board',
  pivot: 'the pivot table',
  print: 'print setup',
};

/** What changed, in words (page_action compare): the counts, then each tab's changes, at most `max` lines of cells in all. */
export function diffText(d: BookDiff, max = 150): string {
  const x = d.totals;
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const counts = [
    x.cells && `${n(x.cells, 'cell')} changed${x.cellTabs > 1 ? ` on ${x.cellTabs} tabs` : ''}`,
    x.rowsAdded && `${n(x.rowsAdded, 'row')} added`,
    x.rowsRemoved && `${n(x.rowsRemoved, 'row')} removed`,
    x.rowsMoved && `${n(x.rowsMoved, 'row')} moved`,
    x.colsAdded && `${n(x.colsAdded, 'column')} added`,
    x.colsRemoved && `${n(x.colsRemoved, 'column')} removed`,
    x.tabsAdded && `${n(x.tabsAdded, 'tab')} added`,
    x.tabsRemoved && `${n(x.tabsRemoved, 'tab')} removed`,
    x.tabsRenamed && `${n(x.tabsRenamed, 'tab')} renamed`,
    d.names && 'the named ranges changed',
  ].filter(Boolean);
  if (!counts.length) return x.tabs ? 'Only other parts of the tabs changed.' : 'Nothing changed.';
  const out = [`${counts.join('; ')}.`];
  let left = max;
  const cellLine = (c: CellChange) => {
    const at = refName(c.r, c.c);
    const was = c.br !== c.r || c.bc !== c.c ? ` (was ${refName(c.br, c.bc)})` : '';
    if (c.kind === 'formula') {
      const shows = c.before.shown !== c.after.shown ? `, showing ${c.before.shown || 'nothing'} → ${c.after.shown || 'nothing'}` : '';
      return `${at}${was}: ${c.before.input || 'empty'} → ${c.after.input || 'empty'}${shows}${c.look ? '; its look changed too' : ''}`;
    }
    if (c.kind === 'value') return `${at}${was}: ${c.before.shown || 'empty'} → ${c.after.shown || 'empty'}${c.look ? '; its look changed too' : ''}`;
    if (c.kind === 'format') return `${at}${was}: number format only, showing ${c.before.shown} → ${c.after.shown}`;
    return `${at}${was}: ${c.kind === 'style' ? 'its look only' : 'its note or link only'}`;
  };
  for (const t of d.tabs) {
    if (!t.changed) continue;
    if (t.status !== 'kept') {
      out.push(`Tab “${t.name}”: ${t.status}.`);
      continue;
    }
    const parts: string[] = [];
    if (t.was) parts.push(`renamed from “${t.was}”`);
    if (t.cols.added.length) parts.push(`columns added: ${t.cols.added.map((c) => refName(0, c).replace(/1$/, '')).join(', ')}`);
    if (t.cols.removed.length) parts.push(`columns removed: ${t.cols.removed.map((c) => refName(0, c).replace(/1$/, '')).join(', ')} (as they were lettered before)`);
    if (t.rows.added.length) parts.push(`rows added: ${t.rows.added.map((r) => r + 1).join(', ')}`);
    if (t.rows.removed.length) parts.push(`rows removed: ${t.rows.removed.map((r) => r + 1).join(', ')} (as they were numbered before)`);
    if (t.rows.moved.length) parts.push(`${n(t.rows.moved.length, 'row')} moved (put in another order)`);
    if (t.other.length) parts.push(`also changed: ${t.other.map((o) => OTHER_WORDS[o]).join(', ')}`);
    parts.push(t.rule.by === 'key' ? `rows lined up by the key column ${refName(0, t.rule.col).replace(/1$/, '')}` : 'rows lined up by what they hold');
    out.push(`Tab “${t.name}”: ${parts.join('; ')}.`);
    const shown = t.cells.slice(0, Math.max(0, left));
    left -= shown.length;
    for (const c of shown) out.push(`- ${cellLine(c)}`);
    if (shown.length < t.cells.length) out.push(`- … and ${n(t.cells.length - shown.length, 'more cell')}.`);
    if (t.results.length) out.push(`- ${n(t.results.length, 'formula')} gave other results with them (${t.results.slice(0, 5).map((r) => `${refName(r.r, r.c)} ${r.before} → ${r.after}`).join('; ')}${t.results.length > 5 ? '; …' : ''}).`);
  }
  return out.join('\n');
}
