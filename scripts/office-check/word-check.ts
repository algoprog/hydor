// Documents as Word shows them, against the app's own pages: each sample document (word-samples.ts) is kept as a page
// of the Library, exported as Word (.docx) and as the app's PDF (which matches the editor's pages) by the app's own
// export, and the .docx is opened by LibreOffice (in Docker, standing in for Word) and made a PDF. Their pages are put
// side by side with where they differ; the .docx's parts are checked against ECMA-376's schemas and the package as
// Office checks it; the fonts LibreOffice drew with are listed (the document's own when they were embedded); and the
// .docx is read back as the app reads a Word file, to show what a round trip changes. README.md says how to run it.
import fs from 'node:fs';
import path from 'node:path';
import { closeCapture } from '../../server/capture/index.ts';
import { openDb } from '../../server/db.ts';
import { docFromFile, readDoc } from '../../server/pages/docs.ts';
import { exportPage } from '../../server/pages/export.ts';
import { createPage, initPages, pageSource } from '../../server/pages/store.ts';
import type { Block, Doc, Run } from '../../shared/docs.ts';
import { checkOpts, fetchSchemas, officePdf, packageProblems, pdfFonts, pdfPages, reportHtml, sideBySide, validateParts } from './word-excel-tools.ts';
import { samples } from './word-samples.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… (a scratch folder: the samples are kept there as pages).');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const argv = process.argv.slice(2);
const o = checkOpts(argv, 'word');
const only = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 ? new Set(argv[i + 1].split(',')) : null;
})();
await fetchSchemas(o);
const db = openDb(path.join(process.env.DATA_DIR, 'word-check.db'));
initPages(db);

/** What a document says, without what a round trip may rename: ids, pictures' bytes, comments' and suggestions' ids. */
function shape(d: Doc): unknown[] {
  const run = (r: Run) => {
    const { cm, ins, del, fmt, was, ...rest } = r;
    return { ...rest, ...(cm ? { cm: cm.length } : {}), ...(ins ? { ins: 1 } : {}), ...(del ? { del: 1 } : {}), ...(fmt ? { fmt: was ?? {} } : {}) };
  };
  return d.blocks.map((b: Block) => {
    const { id: _id, ins, del, ...rest } = b as Block & { ins?: string; del?: string };
    const x: Record<string, unknown> = { ...rest, ...(ins ? { ins: 1 } : {}), ...(del ? { del: 1 } : {}) };
    if (b.type === 'p' || b.type === 'li') x.runs = b.runs.map(run);
    if (b.type === 'table') x.rows = b.rows.map((r) => r.map((c) => ({ ...c, runs: c.runs.map(run) })));
    if (b.type === 'image') x.src = 'picture';
    return x;
  });
}

/** Where two values differ: each path (cols.2, runs.3.size) with what it was and what came back; tables' column shares within a twip's rounding count as the same. */
function diffs(a: unknown, b: unknown, at = ''): string[] {
  if (typeof a === 'number' && typeof b === 'number' && /cols\.\d+$/.test(at) && Math.abs(a - b) <= 0.00015) return [];
  if (a === b) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.flatMap((k) => diffs((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], at ? `${at}.${k}` : k));
  }
  return [`${at}: ${JSON.stringify(a)?.slice(0, 120)} → ${JSON.stringify(b)?.slice(0, 120)}`];
}

/** What a round trip through Word changed: the blocks that differ, and in what (their first few). */
function roundTrip(before: Doc, after: Doc): string[] {
  const a = shape(before);
  const b = shape(after);
  const out: string[] = [];
  if (a.length !== b.length) out.push(`${a.length} blocks became ${b.length}`);
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < 6; i++) {
    const d = diffs(a[i] ?? null, b[i] ?? null);
    if (d.length) out.push(`block ${i} (${(a[i] as { type?: string } | undefined)?.type ?? '-'}): ${d.slice(0, 4).join('; ')}`);
  }
  const other = (d: Doc) =>
    JSON.stringify({ page: d.page, font: d.font, size: d.size, header: d.header, footer: d.footer, titlePage: d.titlePage, comments: d.comments?.map((c) => [c.by, c.author, c.text, c.resolved, c.replies?.map((r) => [r.by, r.author, r.text])]) });
  if (other(before) !== other(after)) out.push(`the document's own: ${other(before).slice(0, 300)}\n      came back ${other(after).slice(0, 300)}`);
  return out;
}

const rows: { name: string; note: string; pictures: string[] }[] = [];
const summary: string[] = [];
let bad = 0;
for (const s of samples()) {
  if (only && !only.has(s.name)) continue;
  console.log(`${s.name}:`);
  const page = createPage(db, { title: s.title, kind: 'doc', model: s.model, by: 'made' });
  const docx = (await exportPage(db, page.id, { format: 'docx' })).data;
  const pdf = (await exportPage(db, page.id, { format: 'pdf' })).data;
  const docxFile = path.join(o.out, `${s.name}.docx`);
  const appPdf = path.join(o.out, 'app', `${s.name}.pdf`);
  fs.mkdirSync(path.dirname(appPdf), { recursive: true });
  fs.writeFileSync(docxFile, docx);
  fs.writeFileSync(appPdf, pdf);
  const officeFile = officePdf(o, docxFile, path.join(o.out, 'office'));
  const pics = path.join(o.out, 'pictures');
  fs.mkdirSync(pics, { recursive: true });
  const appPages = pdfPages(o, appPdf, path.join(pics, `${s.name}.app`));
  const officePages = officeFile ? pdfPages(o, officeFile, path.join(pics, `${s.name}.office`)) : [];
  const diffs = sideBySide(appPages, officePages, path.join(pics, s.name));
  const fonts = officeFile ? pdfFonts(o, officeFile) : [];
  const parts = validateParts(o, docx, s.name);
  const invalid = parts.filter((p) => p.errors.length && !p.errors[0].startsWith('no schema'));
  const unchecked = parts.filter((p) => p.errors[0]?.startsWith('no schema'));
  const pkg = packageProblems(docx);
  const kept = readDoc(pageSource(db, page.id)!.text);
  const trip = roundTrip(kept, docFromFile(docx, `${s.name}.docx`));
  const note = `pages: app ${appPages.length}, LibreOffice ${officePages.length}; differ ${diffs.join(' ')}; fonts LibreOffice used: ${fonts.join(', ') || 'none'}`;
  console.log(`  ${note}`);
  for (const p of invalid) for (const e of p.errors.slice(0, 8)) console.log(`  SCHEMA ${p.part}: ${e}`);
  for (const p of unchecked) console.log(`  (by hand) ${p.part}`);
  for (const p of parts) if (p.ignored.length) console.log(`  extensions in ${p.part}: ${[...new Set(p.ignored)].join(' ')}`);
  for (const p of pkg) console.log(`  PACKAGE ${p}`);
  for (const t of trip) console.log(`  ROUND TRIP ${t}`);
  if (invalid.length || pkg.length) bad++;
  rows.push({ name: s.name, note, pictures: diffs.map((_, k) => path.join(pics, `${s.name}-${k + 1}.png`)) });
  summary.push(
    `${s.name.padEnd(18)} pages ${String(appPages.length).padStart(2)} / ${String(officePages.length).padEnd(2)}  schema ${invalid.length ? 'FAIL' : 'ok  '}  package ${pkg.length ? 'FAIL' : 'ok  '}  round trip ${trip.length ? `${trip.length} change${trip.length === 1 ? '' : 's'}` : 'same'}`,
  );
}
reportHtml(path.join(o.out, 'word.html'), 'Word: the app’s pages and LibreOffice’s', rows);
console.log(`\n${summary.join('\n')}\n\nPictures: ${path.join(o.out, 'word.html')}`);
closeCapture();
process.exit(bad ? 1 : 0);
