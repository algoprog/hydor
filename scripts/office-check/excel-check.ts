// Workbooks as Excel shows them, against the app's own pages: each sample workbook (excel-samples.ts) is kept as a page
// of the Library, exported as Excel (.xlsx) and as the app's PDF by the app's own export, and the .xlsx is opened by
// LibreOffice (in Docker, standing in for Excel) and printed. Their pages are put side by side with where they differ;
// the .xlsx's parts are checked against ECMA-376's schemas, Microsoft's extensions by hand and the package as Office
// checks it; and the .xlsx is read back as the app reads an Excel file, to show what a round trip changes. README.md says
// how to run it.
import fs from 'node:fs';
import path from 'node:path';
import { closeCapture } from '../../server/capture/index.ts';
import { openDb } from '../../server/db.ts';
import { exportPage } from '../../server/pages/export.ts';
import { importBook, readBook } from '../../server/pages/sheets.ts';
import { createPage, initPages, pageSource } from '../../server/pages/store.ts';
import type { Workbook } from '../../shared/sheets.ts';
import { bookSamples } from './excel-samples.ts';
import { checkOpts, fetchSchemas, officePdf, packageProblems, pdfFonts, pdfPages, reportHtml, sideBySide, validateParts } from './word-excel-tools.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… (a scratch folder: the samples are kept there as pages).');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const argv = process.argv.slice(2);
const o = checkOpts(argv, 'excel');
const only = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 ? new Set(argv[i + 1].split(',')) : null;
})();
await fetchSchemas(o);
const db = openDb(path.join(process.env.DATA_DIR, 'excel-check.db'));
initPages(db);

/** A workbook without what a round trip may rename (ids), and with what the editor shows alike written alike: words in the middle of their row are where it puts unwrapped ones anyway. */
const shape = (b: Workbook): unknown =>
  JSON.parse(
    JSON.stringify(b, (k, v) => {
      if (k === 'id') return undefined;
      if (k === 's' && v && typeof v === 'object' && v.valign === 'middle' && !v.wrap) {
        const { valign: _v, ...rest } = v;
        return rest;
      }
      return v;
    }),
  );

/** Where two values differ: each path with what it was and what came back. */
function diffs(a: unknown, b: unknown, at = ''): string[] {
  if (a === b) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.flatMap((k) => diffs((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], at ? `${at}.${k}` : k));
  }
  return [`${at}: ${JSON.stringify(a)?.slice(0, 120)} → ${JSON.stringify(b)?.slice(0, 120)}`];
}

const rows: { name: string; note: string; pictures: string[] }[] = [];
const summary: string[] = [];
let bad = 0;
for (const s of bookSamples()) {
  if (only && !only.has(s.name)) continue;
  console.log(`${s.name}:`);
  const page = createPage(db, { title: s.title, kind: 'sheet', model: s.model, by: 'made' });
  const xlsx = (await exportPage(db, page.id, { format: 'xlsx' })).data;
  const pdf = (await exportPage(db, page.id, { format: 'pdf' })).data;
  const file = path.join(o.out, `${s.name}.xlsx`);
  const appPdf = path.join(o.out, 'app', `${s.name}.pdf`);
  fs.mkdirSync(path.dirname(appPdf), { recursive: true });
  fs.writeFileSync(file, xlsx);
  fs.writeFileSync(appPdf, pdf);
  const officeFile = officePdf(o, file, path.join(o.out, 'office'));
  const pics = path.join(o.out, 'pictures');
  fs.mkdirSync(pics, { recursive: true });
  const appPages = pdfPages(o, appPdf, path.join(pics, `${s.name}.app`));
  const officePages = officeFile ? pdfPages(o, officeFile, path.join(pics, `${s.name}.office`)) : [];
  const diff = sideBySide(appPages, officePages, path.join(pics, s.name));
  const fonts = officeFile ? pdfFonts(o, officeFile) : [];
  const parts = validateParts(o, xlsx, s.name);
  const invalid = parts.filter((p) => p.errors.length && !p.errors[0].startsWith('no schema'));
  const unchecked = parts.filter((p) => p.errors[0]?.startsWith('no schema'));
  const pkg = packageProblems(xlsx);
  const kept = readBook(pageSource(db, page.id)!.text);
  const back = importBook(xlsx, `${s.name}.xlsx`).book;
  const trip = diffs(shape(kept), shape(back)).slice(0, 12);
  const note = `pages: app ${appPages.length}, LibreOffice ${officePages.length}; differ ${diff.join(' ')}; fonts LibreOffice used: ${fonts.join(', ') || 'none'}`;
  console.log(`  ${note}`);
  for (const p of invalid) for (const e of p.errors.slice(0, 8)) console.log(`  SCHEMA ${p.part}: ${e}`);
  for (const p of unchecked) console.log(`  (by hand) ${p.part}`);
  for (const p of parts) if (p.ignored.length) console.log(`  extensions in ${p.part}: ${[...new Set(p.ignored)].join(' ')}`);
  for (const p of pkg) console.log(`  PACKAGE ${p}`);
  for (const t of trip) console.log(`  ROUND TRIP ${t}`);
  if (invalid.length || pkg.length) bad++;
  rows.push({ name: s.name, note, pictures: diff.map((_, k) => path.join(pics, `${s.name}-${k + 1}.png`)) });
  summary.push(
    `${s.name.padEnd(16)} pages ${String(appPages.length).padStart(2)} / ${String(officePages.length).padEnd(2)}  schema ${invalid.length ? 'FAIL' : 'ok  '}  package ${pkg.length ? 'FAIL' : 'ok  '}  round trip ${trip.length ? `${trip.length}${trip.length === 12 ? '+' : ''} change${trip.length === 1 ? '' : 's'}` : 'same'}`,
  );
}
reportHtml(path.join(o.out, 'excel.html'), 'Excel: the app’s pages and LibreOffice’s', rows);
console.log(`\n${summary.join('\n')}\n\nPictures: ${path.join(o.out, 'excel.html')}`);
closeCapture();
process.exit(bad ? 1 : 0);
