// Script tests for Hydor's own PDF code, on files other tools made (test-files/make.py says how): reading them
// (cross-reference tables and streams, object streams, an update already in the file, encryption with an empty user
// password, damaged cross-references), their words and where they are, their forms (every kind of field, with the
// words printed beside them), filling them (Greek too, Chinese where a font for it is found) so that this reader and
// poppler read the values back, a signature already in the file still valid after filling, writing on pages, pictures
// with their transparency, flattening, page operations, and pictures of pages. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/documents/pdf/pdf-test.ts && DATA_DIR=/tmp/hydor-test-pdf node dist/dev/pdf-test.js
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { APP_ROOT, config } from '../../config.ts';
import { which } from '../tools.ts';
import { PdfFile } from './file.ts';
import { fontsFor } from './fontset.ts';
import { editPages, extractPages, fillAndMark, fillPdf, findWords, FormError, pagePicture, pageText, PdfError, pdfInfo, splitPdf, stampImage, writeOnPdf } from './index.ts';
import { isStream } from './objects.ts';
import { pages } from './pages.ts';

if (!config.dataDir.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing real is touched.');
  process.exit(2);
}
fs.mkdirSync(config.dataDir, { recursive: true });

const DIR = path.join(APP_ROOT, 'server/documents/pdf/test-files');
const file = (n: string) => fs.readFileSync(path.join(DIR, n));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-pdf-test-'));
const poppler = which('pdftotext') && which('pdftoppm');
/** What poppler reads of a file: its text (fields' values included), or null without poppler. */
const popText = (pdf: Buffer): string | null => {
  if (!poppler) return null;
  const f = path.join(tmp, `p${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(f, pdf);
  return execFileSync('pdftotext', ['-q', f, '-'], { encoding: 'utf8' });
};
/** poppler draws every page without complaint. */
const popDraws = (pdf: Buffer) => {
  if (!poppler) return;
  const f = path.join(tmp, `d${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(f, pdf);
  const r = spawnSync('pdftoppm', ['-r', '10', '-png', f, path.join(tmp, 'pic')], { encoding: 'utf8' });
  assert.equal(r.status, 0, `pdftoppm draws it: ${r.stderr}`);
  // (hyperref's radio buttons lack their state in the TeX file itself: poppler says so of the original too.)
  const complaints = r.stderr.split('\n').filter((l) => l.trim() && !/Invalid or missing AS value/.test(l));
  assert.deepEqual(complaints, [], `pdftoppm draws it without complaint`);
};
const notes: string[] = [];
const execOk = (cmd: string) => !!which(cmd);

// ---- reading -----------------------------------------------------------------------------------------

const form = file('form.pdf');
const tex = file('tex-form.pdf');
const printed = file('printed-form.pdf');
{
  const f = new PdfFile(tex);
  assert.equal(f.xrefKind, 'stream', 'pdfTeX writes a cross-reference stream');
  assert.equal(pages(f).length, 1);
  assert.equal(new PdfFile(printed).xrefKind, 'table');
  assert.equal(new PdfFile(file('form-updated.pdf')).xrefKind, 'stream', 'pypdf’s update is a stream');
  const p = pages(new PdfFile(form))[0];
  assert.equal(Math.round(p.width), 595);
  assert.equal(Math.round(p.height), 842);
  for (const [n, r] of [
    ['form-rc4-40.pdf', 2],
    ['form-rc4-128.pdf', 3],
    ['form-aes128.pdf', 4],
    ['form-aes256.pdf', 6],
  ] as const) {
    const e = new PdfFile(file(n));
    assert.equal(e.crypt?.r, r, `${n}: revision ${r}`);
    assert.ok(
      pageText(file(n), 1).some((l) => l.text === 'Volunteer sign-up'),
      `${n} decrypts`,
    );
  }
  assert.throws(() => new PdfFile(file('form-locked.pdf')), /locked with a password/);
  assert.throws(() => new PdfFile(Buffer.from('<html>not a pdf</html>')), /not a PDF/);
}

// Words and where they are (poppler measures "Signature:" at x 60, y 494–507 on the form's first page).
{
  const hits = findWords(form, 'signature:');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].page, 1);
  assert.ok(Math.abs(hits[0].x - 60) < 1 && Math.abs(hits[0].y - 494) < 4 && hits[0].w > 40 && hits[0].w < 60, JSON.stringify(hits[0]));
  assert.equal(findWords(form, 'Contact name')[0]?.page, 2, 'on the second page');
  assert.equal(findWords(form, 'Contact name', 1).length, 0, 'only on the page asked about');
  assert.equal(findWords(printed, 'ΑΙΤΗΣΗ').length, 1, 'Greek, whatever its case and accents');
  assert.equal(findWords(tex, 'Full name').length, 1, 'TeX’s ligatures and kerning read as words');
  assert.equal(findWords(tex, 'Send me the newsletter').length, 1);
}

// Damaged files: their objects found by a scan.
{
  const end = form.lastIndexOf('startxref');
  const bad = Buffer.concat([form.subarray(0, end), Buffer.from('startxref\n123\n%%EOF\n')]);
  const noXref = Buffer.concat([form.subarray(0, form.lastIndexOf('\nxref') + 1), Buffer.from('%%EOF\n')]);
  const junk = Buffer.concat([Buffer.from('From: a mailer\r\n\r\n'), form]);
  for (const [name, b] of [
    ['a wrong startxref', bad],
    ['no cross-references', noXref],
    ['bytes before the header', junk],
  ] as const) {
    const info = pdfInfo(b);
    assert.equal(info.pages.length, 2, name);
    assert.equal(info.form.fields.length, 9, name);
    const r = await fillPdf(b, { first_name: 'Fixed' });
    assert.equal(pdfInfo(r.data).form.fields.find((x) => x.name === 'first_name')?.value, 'Fixed', `${name}: filled`);
    if (poppler) assert.match(popText(r.data)!, /Fixed/, `${name}: poppler reads the filled file`);
  }
}

// ---- forms -------------------------------------------------------------------------------------------

{
  const fields = pdfInfo(form).form.fields;
  const by = (n: string) => fields.find((x) => x.name === n)!;
  assert.deepEqual(
    fields.map((x) => `${x.name}:${x.kind}`),
    ['first_name:text', 'last_name:text', 'age:text', 'notes:multiline', 'agree:checkbox', 'shift:radio', 'team:dropdown', 'skills:list', 'contact:text'],
  );
  assert.equal(by('first_name').label, 'First name:', 'the words printed beside it');
  assert.equal(by('first_name').tooltip, 'First name');
  assert.equal(by('agree').label, 'I agree to the terms', 'a checkbox’s words are after it');
  assert.equal(by('age').maxLength, 3);
  assert.deepEqual(by('shift').options, [
    { value: 'morning', label: 'Morning' },
    { value: 'afternoon', label: 'Afternoon' },
    { value: 'evening', label: 'Evening' },
  ]);
  assert.equal(by('shift').value, 'afternoon');
  assert.equal(by('team').value, 'Garden');
  assert.deepEqual(by('skills').value, ['Driving']);
  assert.ok(by('skills').multiSelect);
  assert.equal(by('contact').widgets[0].page, 2);
  const w = by('first_name').widgets[0];
  assert.deepEqual([w.page, w.x, w.y, w.w, w.h], [1, 160, 89.9, 200, 20], 'its box from the page’s top-left');
  // hyperref's radio buttons are fields of one name, their states escaped UTF-16: one field of three choices.
  const plan = pdfInfo(tex).form.fields.find((x) => x.name === 'plan')!;
  assert.equal(plan.kind, 'radio');
  assert.deepEqual(
    plan.options?.map((o) => `${o.value}=${o.label}`),
    ['basic=Basic', 'pro=Pro', 'team=Team'],
    'their words come before them',
  );
  assert.equal(plan.value, null, 'hyperref’s placeholder value is no choice');
  assert.equal(plan.label, 'Plan:');
  assert.equal(pdfInfo(tex).form.needAppearances, true);
}

// Filling every kind of field; values read back here and by poppler; the bytes that were there stay as they were.
{
  const greek = 'Παπαδοπούλου';
  let chinese = '';
  try {
    await fontsFor('李明');
    chinese = ' 李明';
  } catch {
    notes.push('no font with Chinese characters here or online: Chinese filling not tested');
  }
  const r = await fillPdf(form, {
    first_name: 'Μαρία',
    'Last name': greek + chinese,
    age: 34,
    notes: 'Allergic to peanuts.\nCan drive on weekends; this line is long enough to wrap inside the box.',
    agree: true,
    shift: 'Evening',
    team: 'front desk',
    skills: ['Cooking', 'First aid'],
    contact: 'Γιώργος',
  });
  assert.deepEqual(r.filled, ['first_name', 'last_name', 'age', 'notes', 'agree', 'shift', 'team', 'skills', 'contact'], 'by name, label or tooltip');
  assert.ok(r.data.subarray(0, form.length).equals(form), 'an incremental update: every byte that was there stays');
  const back = pdfInfo(r.data).form.fields;
  const v = (n: string) => back.find((x) => x.name === n)!.value;
  assert.equal(v('first_name'), 'Μαρία');
  assert.equal(v('last_name'), greek + chinese);
  assert.equal(v('age'), '34');
  assert.equal(v('agree'), true);
  assert.equal(v('shift'), 'evening');
  assert.equal(v('team'), 'Front desk');
  assert.deepEqual(v('skills'), ['Cooking', 'First aid']);
  const pop = popText(r.data);
  if (pop !== null) {
    for (const s of ['Μαρία', greek, 'Γιώργος', 'Front desk', 'Allergic to peanuts.', ...(chinese ? ['李明'] : [])]) assert.ok(pop.includes(s), `poppler shows ${s}`);
    popDraws(r.data);
  }
  const emb = execOk('pdffonts') ? execFileSync('pdffonts', [path.join(tmp, write('fonts.pdf', r.data))], { encoding: 'utf8' }) : '';
  if (emb) assert.match(emb, /LiberationSans\s+CID TrueType\s+Identity-H\s+yes yes yes/, 'the app’s font, embedded as a subset with its ToUnicode map');
  // Wrong values say why, and nothing is filled.
  await assert.rejects(fillPdf(form, { age: '12345', team: 'Moon', shift: 'night', nope: 'x', agree: 'perhaps' }), (e: Error) => {
    assert.ok(e instanceof FormError);
    for (const s of ['"age" takes at most 3 characters', '"team" is a dropdown of', '"shift" is a choice of', '"nope": no such field', '"agree" is a checkbox']) assert.ok(e.message.includes(s), `${s} in ${e.message}`);
    return true;
  });
  await assert.rejects(fillPdf(printed, { name: 'x' }), /no form fields/);
}

// A signed form: filled after the signature, which still covers exactly what it covered.
{
  const signed = file('form-signed.pdf');
  const range = (b: Buffer) => /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(b.toString('latin1'))!.slice(1).map(Number);
  const before = range(signed);
  assert.equal(before[2] + before[3], signed.length, 'the signature covers the whole file it was made on');
  const r = await fillPdf(signed, { first_name: 'Ana', agree: true, shift: 'morning' });
  assert.ok(r.data.subarray(0, signed.length).equals(signed), 'the signed bytes are untouched');
  assert.deepEqual(range(r.data), before);
  assert.ok(r.notes.some((n) => /signature stays valid/.test(n)));
  if (which('pdfsig')) {
    // (Its own certificate store is not needed to check the signature itself: -nocert.)
    const out = spawnSync('pdfsig', ['-nocert', path.join(tmp, write('signed-filled.pdf', r.data))], { encoding: 'utf8' }).stdout;
    assert.match(out, /Signature Validation: Signature is Valid/, 'pdfsig: still valid');
  }
  const sig = pdfInfo(signed).form.fields.find((x) => x.kind === 'signature')!;
  assert.ok(sig.signed);
  await assert.rejects(fillPdf(signed, { Approval: 'x' }), /signature field/);
}

// Encrypted with an empty user password: what is added is encrypted the same way, and read back by both readers.
for (const n of ['form-rc4-40.pdf', 'form-rc4-128.pdf', 'form-aes128.pdf', 'form-aes256.pdf']) {
  const r = await fillPdf(file(n), { first_name: 'Ελένη', agree: true });
  assert.equal(new PdfFile(r.data).crypt?.r, new PdfFile(file(n)).crypt?.r);
  assert.equal(pdfInfo(r.data).form.fields[0].value, 'Ελένη', `${n}: read back`);
  const pop = popText(r.data);
  if (pop !== null) assert.ok(pop.includes('Ελένη'), `${n}: poppler decrypts what was added`);
}

// A form of TeX's: a cross-reference stream updated by one; the viewer's own appearances replaced by ours.
{
  const r = await fillPdf(tex, { fullname: 'Νίκος Παππάς', newsletter: true, plan: 'Pro', country: 'Cyprus', langs: 'Greek' });
  const f = new PdfFile(r.data);
  assert.equal(f.xrefKind, 'stream');
  assert.equal(f.dictOf(f.catalog().get('AcroForm'))?.get('NeedAppearances'), undefined, 'viewers now show our appearances');
  const back = pdfInfo(r.data).form.fields;
  assert.equal(back.find((x) => x.name === 'plan')?.value, 'pro');
  assert.equal(back.find((x) => x.name === 'newsletter')?.value, true);
  popDraws(r.data);
}

// Flattening: the values painted into the page, the form gone.
{
  const r = await fillPdf(form, { first_name: 'Flat', agree: true }, { flatten: true });
  assert.equal(pdfInfo(r.data).form.fields.length, 0);
  assert.ok(
    pageText(r.data, 1).some((l) => l.text.includes('Flat')),
    'the value is the page’s own text now',
  );
  popDraws(r.data);
}

// An XFA form with no AcroForm fields cannot be filled here.
{
  const f = new PdfFile(form);
  const af = f.catalog().get('AcroForm')!;
  const d = f.edit(af as never);
  d.set('XFA', []);
  d.set('Fields', []);
  // A dynamic XFA form has no widgets on its pages either.
  for (const p of pages(f)) f.edit(p.ref).delete('Annots');
  await assert.rejects(fillPdf(f.saveUpdate(), { first_name: 'x' }), /XFA form/);
}

// ---- writing on pages -------------------------------------------------------------------------------

// A signature-like picture: blue ink on a see-through background.
const png = (() => {
  const W = 120;
  const H = 40;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const on = Math.abs(y - (20 + Math.sin(x / 8) * 12)) < 2;
      const i = y * (W * 4 + 1) + 1 + x * 4;
      raw[i + 2] = 160;
      raw[i + 3] = on ? 255 : 0;
    }
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const chunk = (t: string, d: Buffer) => {
    const td = Buffer.concat([Buffer.from(t), d]);
    let c = 0xffffffff;
    for (const b of td) c = crcT[(c ^ b) & 0xff] ^ (c >>> 8);
    const out = Buffer.alloc(12 + d.length);
    out.writeUInt32BE(d.length);
    td.copy(out, 4);
    out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + d.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();

{
  const at = findWords(printed, 'Signature:')[0];
  const out = stampImage(printed, { page: 1, x: at.x + at.w + 4, y: at.y - 20, w: 120, h: 40 }, png);
  assert.ok(out.subarray(0, printed.length).equals(printed), 'stamped in an update');
  const f = new PdfFile(out);
  const imgs = f
    .objectNumbers()
    .map((n) => f.getObj(n))
    .filter((o) => isStream(o) && o.dict.get('Subtype') === 'Image');
  assert.equal(imgs.length, 2, 'the picture and its soft mask');
  assert.ok(
    imgs.some((o) => isStream(o) && o.dict.has('SMask')),
    'its transparency kept',
  );
  popDraws(out);
  assert.throws(() => stampImage(printed, { page: 4, x: 0, y: 0, w: 10, h: 10 }, png), /no page 4/);
}

{
  const r = await writeOnPdf(printed, [
    { type: 'text', page: 1, near: { words: 'Full name:' }, text: 'Ελένη Παπαδάκη' },
    { type: 'text', page: 1, x: 300, y: 160, text: 'A note that wraps inside the width given to it.', width: 120, size: 9, color: '#555' },
    { type: 'check', page: 1, near: { words: 'Plan:' } },
    { type: 'highlight', page: 1, near: { words: 'Application form' } },
    { type: 'comment', page: 1, x: 450, y: 40, text: 'Please check the address.' },
    { type: 'whiteout', page: 1, near: { words: 'Size:' } },
    { type: 'image', page: 1, near: { words: 'Signature:' }, w: 100, data: png },
    { type: 'line', page: 1, x1: 57, y1: 320, x2: 300, y2: 320, color: 'red' },
  ]);
  const label = findWords(printed, 'Full name:')[0];
  const t = r.placed[0];
  assert.ok(t.x > label.x + label.w && t.x < label.x + label.w + 8, 'written after the label');
  assert.ok(Math.abs(t.y + t.h * 0.75 - (label.y + label.h * 0.78)) < 3, 'on the label’s baseline');
  const lines = pageText(r.data, 1);
  assert.ok(
    lines.some((l) => l.text.includes('Full name: Ελένη Παπαδάκη')),
    'read back as one line with its label',
  );
  assert.ok(lines.filter((l) => l.text.includes('wraps') || l.text.includes('given')).length >= 2, 'wrapped');
  const f = new PdfFile(r.data);
  const kinds = f.arrayOf(pages(f)[0].dict.get('Annots')).map((a) => f.dictOf(a)?.get('Subtype'));
  assert.deepEqual(kinds, ['Highlight', 'Text'], 'highlights and comments are annotations');
  assert.ok(r.notes.some((n) => /Nothing was redacted/.test(n)));
  popDraws(r.data);
  await assert.rejects(writeOnPdf(printed, [{ type: 'text', page: 1, near: { words: 'Passport number' }, text: 'x' }]), /"Passport number" is not on page 1/);
  await assert.rejects(writeOnPdf(printed, [{ type: 'text', page: 1, x: 900, y: 10, text: 'x' }]), /off page 1/);
}

// Fill & sign in one update: fields, a text box and a signature.
{
  const r = await fillAndMark(form, { first_name: 'Ana' }, [
    { type: 'image', page: 1, x: 140, y: 470, w: 120, h: 40, data: png },
    { type: 'text', page: 1, x: 380, y: 480, text: '5 Nov 2026' },
  ]);
  assert.ok(r.data.subarray(0, form.length).equals(form));
  assert.equal(pdfInfo(r.data).form.fields[0].value, 'Ana');
  assert.ok(pageText(r.data, 1).some((l) => l.text.includes('5 Nov 2026')));
}

// ---- page operations --------------------------------------------------------------------------------

{
  const r = editPages(tex, [
    { op: 'insert', after: 1, count: 2, size: [612, 792] },
    { op: 'rotate', pages: [1], angle: 90 },
    { op: 'merge', file: form, after: 3 },
    { op: 'move', pages: [5], to: 1 },
    { op: 'delete', pages: [3] },
  ]);
  // Before: tex · blank · blank · form 1 · form 2 → form 2 · tex(turned) · blank · blank · form 1 → without the first blank.
  const info = pdfInfo(r.data);
  assert.equal(r.pages, 4);
  assert.deepEqual(
    info.pages.map((p) => p.rotate),
    [0, 90, 0, 0],
  );
  assert.deepEqual(info.pages[2], { width: 612, height: 792, rotate: 0 }, 'a blank page of the size asked');
  const names = info.form.fields.map((x) => `${x.name}@${x.widgets.map((w) => w.page).join(',')}`);
  assert.ok(names.includes('contact@1') && names.includes('fullname@2') && names.includes('first_name@4'), names.join(' '));
  popDraws(r.data);
  // The same form merged twice: its fields keep apart under new names.
  const twice = editPages(form, [{ op: 'merge', file: form }]);
  const tn = pdfInfo(twice.data).form.fields.map((x) => x.name);
  assert.ok(tn.includes('first_name') && tn.includes('first_name_2'), tn.join(' '));
  // A rewritten file drops its signatures, and says so.
  const s = editPages(file('form-signed.pdf'), [{ op: 'delete', pages: [2] }]);
  assert.match(s.notes.join(' '), /digital signature/);
  assert.ok(!pdfInfo(s.data).form.fields.find((x) => x.kind === 'signature')?.signed);
  // Encrypted stays encrypted, the same way.
  const e = editPages(file('form-aes256.pdf'), [{ op: 'move', pages: [2], to: 1 }]);
  assert.equal(new PdfFile(e.data).crypt?.r, 6);
  assert.equal(pdfInfo(e.data).form.fields.find((x) => x.name === 'contact')?.widgets[0].page, 1);
  if (poppler) assert.match(popText(e.data)!, /Contact name/);
  // Some pages alone; a file split in two.
  assert.equal(pdfInfo(extractPages(form, [2]).data).pages.length, 1);
  assert.equal(
    pdfInfo(extractPages(form, [2]).data)
      .form.fields.map((x) => x.name)
      .join(),
    'contact',
    'only the fields of the pages taken',
  );
  assert.equal(splitPdf(form, { every: 1 }).length, 2);
  assert.throws(() => editPages(form, [{ op: 'delete', pages: [1, 2] }]), /every page/);
  assert.throws(() => editPages(form, [{ op: 'rotate', pages: [7], angle: 90 }]), PdfError);
}

// ---- pictures of pages ------------------------------------------------------------------------------

if (poppler) {
  const pic = await pagePicture(form, 1, { width: 300 });
  assert.ok(pic.subarray(1, 4).toString() === 'PNG' && pic.readUInt32BE(16) === 300, 'a PNG 300 pixels wide');
  const bare = await pagePicture(form, 1, { width: 300, fields: false });
  assert.ok(!bare.equals(pic), 'without the fields drawn');
} else notes.push('poppler is not installed: pictures of pages not tested');

function write(name: string, data: Buffer) {
  fs.writeFileSync(path.join(tmp, name), data);
  return name;
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`pdf: reading, words, forms, filling, signatures, encryption, writing, page operations and pictures passed${notes.length ? ` (${notes.join('; ')})` : ''}`);
