// The tools every session's agent has for signatures: ask_signature (a card where the user draws, types or uploads
// their signature and keeps it under a name; the agent hears only the name) and place_signature (a saved signature put
// into a Word file, a PDF, a picture or a document of the Library, once the user allows it on a card that shows where).
// Agents never see a signature's picture: the cards send it to the user's own routes, and the tools answer in words.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ASSET, normalizeDoc } from '../../shared/docs.ts';
import { defaultSignatureName, SIGNATURE_WIDTH_MM, signatureKind, signatureName, type SignatureCard, type SignaturePlaceCard, type SignatureView } from '../../shared/signatures.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import type { ApprovalAnswer } from '../agents/live.ts';
import { inSession } from '../documents/index.ts';
import type { RunCtx, RunTool, ToolOutput } from '../features/types.ts';
import { modeOf } from '../guide/api.ts';
import { putAsset } from '../pages/assets.ts';
import { addVersion, mustPage, pageModel } from '../pages/store.ts';
import { refreshThumbs } from '../pages/thumbs.ts';
import { placeInDoc } from './doc.ts';
import { placeInDocx } from './docx.ts';
import { pdfSpot, pdfTools, type Side } from './pdf.ts';
import { pictureView, readPicture, signPicture } from './picture.ts';
import { boxPicture, readPng, resize, writePng } from './png.ts';
import { findSignature, listSignatures, signatureImage, touchSignature } from './store.ts';

/** How long a card waits (under Codex's ten minutes for a tool call). */
const WAIT_MS = 570_000;

/** The card shown in the run's conversation, and the user's answer; or why there is none. */
export async function onCard(ctx: RunCtx, card: ApprovalRequest, check?: (a: ApprovalAnswer) => string | null): Promise<{ answer: ApprovalAnswer } | { why: 'nobody' | 'timeout' | 'withdrawn' }> {
  const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
  if (!adapter) return { why: 'nobody' };
  const limit = AbortSignal.timeout(WAIT_MS);
  const answer = await adapter.ask(card, { signal: ctx.signal ? AbortSignal.any([ctx.signal, limit]) : limit, check });
  if (!answer) return { why: limit.aborted ? 'timeout' : 'withdrawn' };
  return { answer };
}

/** A card of the app's own about a signature. */
export function signatureCard(o: { title: string; detail?: string; options: ApprovalRequest['options']; signature: SignatureCard }): ApprovalRequest {
  return { id: `sig-${crypto.randomBytes(6).toString('hex')}`, kind: 'other', title: o.title, detail: o.detail || undefined, prose: true, options: o.options, signature: o.signature, createdAt: Date.now() };
}

const kindWord = (s: Pick<SignatureView, 'kind'>) => (s.kind === 'initials' ? 'initials' : 'signature');

/** The saved signatures as an agent hears of them: by name and kind, never more. */
export function savedList(list: SignatureView[]): string {
  return list.map((s) => `“${s.name}” (${kindWord(s)}${s.until ? ', for today only' : ''})`).join(', ');
}

const NOT_CRYPTO = 'It is a picture of their signature, not a cryptographic digital signature.';

const ASK_SIGNATURE: RunTool = {
  name: 'ask_signature',
  description: [
    'Ask the user for their signature (or initials) on a card in the conversation, to place it into a document or file with place_signature.',
    'They draw it with a mouse, a finger or a pen, type their name in handwriting, or upload a photo of it, and keep it under a name, for later or for today only.',
    'You never see it: you hear only that it is saved, and its name. The call waits while they draw (up to nine minutes).',
    'If one of the kind asked for is saved already, you get their names instead of a card: use one of those, unless the user wants a new one (new: true).',
    'A drawn signature is a picture of a signature, not a cryptographic digital signature: say so if the user seems to expect one.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['signature', 'initials'], description: 'A full signature (the default) or initials.' },
      name: { type: 'string', description: 'What to keep it as, which the user can change: "Signature", "Initials", "Work signature".' },
      why: { type: 'string', description: 'One sentence for the user: what it will sign ("The rental agreement, on page 3").' },
      new: { type: 'boolean', description: 'Ask for a new one even though one of that kind is saved.' },
    },
  },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const kind = signatureKind(a.kind);
    const saved = listSignatures(db).filter((s) => s.kind === kind);
    if (saved.length && a.new !== true)
      return `The user has ${saved.length > 1 ? 'these' : 'this'} saved already: ${savedList(saved)}. Place one by name with place_signature (they allow each placement on a card). To have them draw another, call ask_signature with new: true.`;
    const want = signatureName(a.name) || defaultSignatureName(kind);
    // A name no saved signature has, for the card to start with.
    let name = want;
    for (let i = 2; findSignature(db, name); i++) name = `${want} ${i}`;
    const why = typeof a.why === 'string' ? a.why.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
    const card = signatureCard({
      title: kind === 'initials' ? 'Your initials, please' : 'Your signature, please',
      detail: why,
      options: [
        { id: 'accept', label: 'Save', style: 'primary' },
        { id: 'decline', label: 'Not now' },
      ],
      signature: { ask: { kind, name, ...(why ? { why } : {}) } },
    });
    // The card keeps the signature itself, then answers with its id alone.
    const r = await onCard(ctx, card, (x) => (x.decision === 'accept' && !findSignature(db, String(x.form?.signature ?? '')) ? 'Draw your signature and save it first' : null));
    if ('why' in r) {
      if (r.why === 'nobody') return { text: 'Nobody can draw it now (the session is not running in the app). Ask the user to draw one in Settings → App → Signatures.', isError: true };
      if (r.why === 'timeout') return { text: 'The user did not answer in time, so the card was withdrawn. Ask again when they are back.', isError: true };
      return { text: 'The card was withdrawn before the user answered.', isError: true };
    }
    if (r.answer.decision !== 'accept') return 'The user chose not to give a signature now. Go on without it, or ask in words what they would like instead.';
    const s = findSignature(db, String(r.answer.form?.signature ?? ''))!;
    return `The user saved their ${kindWord(s)} as “${s.name}”${s.until ? ', for today only (it goes in a day unless they keep it in Settings → App → Signatures)' : ''}. You never see it: place it by that name with place_signature, and the user allows each placement on a card. ${NOT_CRYPTO}`;
  },
};

// ---- placing one ------------------------------------------------------------------------------------------------

/** Signatures the user allowed an agent to place for the rest of a session (until the app restarts): its key and the signature's id. */
const allowed = new Set<string>();

/** Pictures of pages as they would be signed, for the card that asks (the app's own pages load them; agents' tools are refused). */
const previews = new Map<string, { png: Buffer; at: number }>();

/** Keeps a picture for a card a while: its address. */
function putPreview(png: Buffer): string {
  for (const [k, v] of previews) if (Date.now() - v.at > 30 * 60_000) previews.delete(k);
  const token = crypto.randomBytes(18).toString('base64url');
  previews.set(token, { png, at: Date.now() });
  return `/api/signatures/previews/${token}`;
}

export const previewPicture = (token: string): Buffer | null => previews.get(token)?.png ?? null;

/** A picture no wider than `max` pixels (a page drawn large, for a card or an agent to look at). */
function smaller(png: Buffer, max: number): Buffer {
  const img = readPng(png);
  return img.width <= max ? png : writePng(resize(img, max, Math.max(1, Math.round((img.height * max) / img.width))), { alpha: false });
}

/** "contract (signed).pdf" beside the file, or "(signed 2)"… when that is taken. */
function signedCopy(file: string): string {
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  for (let n = 1; ; n++) {
    const f = path.join(path.dirname(file), `${base} (signed${n > 1 ? ` ${n}` : ''})${ext}`);
    if (!fs.existsSync(f)) return f;
  }
}

/** Writes a file whole or not at all (a copy beside it, then put in its place). */
async function writeWhole(dest: string, data: Buffer) {
  const tmp = `${dest}.${crypto.randomBytes(4).toString('hex')}.part`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, dest);
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** What placing it means for one kind of target: what the card shows, what an agent sees first, and the writing. */
interface Plan {
  card: Omit<SignaturePlaceCard, 'signature'>;
  /** The page as it will be, for the card (made only when a card shows): its address. */
  picture?: () => Promise<string>;
  look(): Promise<ToolOutput>;
  write(): Promise<string>;
}

/** Words an agent named, or nothing when it named none. */
const wordsOf = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

const SIDES: Side[] = ['right', 'left', 'above', 'below'];

const PLACE_SIGNATURE: RunTool = {
  name: 'place_signature',
  description: [
    'Place one of the user’s saved signatures (by its name) into a Word file (.docx), a PDF, a PNG picture, or a document of their Library (page_id), as a picture of it.',
    'Each placement asks the user first, on a card that shows where it goes (the page as it will look, or the words around the spot): they allow it once, allow that signature for the rest of the session, or deny it. You never see the signature itself.',
    'Look first: with look: true nothing is written and nobody is asked: a PDF or a picture comes back as a picture of the page with a box where the signature would go (call it with page alone to see a page and choose a spot); a Word file or a document as the words around the spot. Adjust and look again until it is right.',
    'Where, in a Word file or a document: placeholder (words it takes the place of, like {{signature}}), after (words it goes right after, like "Signature:"; in a Word file it then floats in front of the text, so a line of underscores stays where it is), cell (a Word table’s cell), or none of them (the end). In a PDF: near (words found on the page, signed right after them or above, below, before them by side) or x and y; in a picture, x and y.',
    'Files get a signed copy beside them, “name (signed).pdf”, unless replace: true. If no signature is saved, ask for one with ask_signature.',
    'It is a picture of the user’s signature, as ink on paper is: not a cryptographic digital signature (it proves nothing about who signed or that the file did not change since). Say so if the user seems to expect one.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      signature: { type: 'string', description: 'The saved signature’s name (ask_signature or the error tells you the names). Left out: the only one saved.' },
      file: { type: 'string', description: 'A .docx, .pdf or .png file: in the session’s folder (relative paths start there), or absolute.' },
      page_id: { type: 'string', description: 'Instead of file: a document of the Library (get_page lists them); it gets a new version.' },
      placeholder: { type: 'string', description: 'Word files and documents: words it takes the place of, like "{{signature}}".' },
      after: { type: 'string', description: 'Word files and documents: words it goes right after, like "Signature:" (any case; spaces as one).' },
      cell: {
        type: 'object',
        description: 'Word files: a table’s cell, from 1; it goes at the end of the cell’s words. A merged cell counts once.',
        properties: { table: { type: 'number' }, row: { type: 'number' }, column: { type: 'number' } },
        required: ['table', 'row', 'column'],
      },
      occurrence: { type: 'number', description: 'Which of the places with those words, from 1 (the default); -1 the last.' },
      float: { type: 'boolean', description: 'Word files: in front of the text, moving nothing (the default with after), or false: in the line, as a letter is (the default otherwise).' },
      page: { type: 'number', description: 'A PDF’s page, from 1 (by default the page near finds the words on, else the last one).' },
      near: { type: 'string', description: 'A PDF: words on the page to sign beside, like "Signature" or "Signed by the tenant".' },
      side: { type: 'string', enum: SIDES, description: 'A PDF: where beside the words: right after them on their line (the default), above, below, or left (before them).' },
      x: { type: 'number', description: 'A PDF or a picture: where the signature starts, as a share of the page’s width from its left (0–1).' },
      y: { type: 'number', description: 'A PDF or a picture: the line it sits on, as a share of the page’s height from its top (0–1); its tails reach a little below.' },
      width_mm: { type: 'number', description: 'Its width on paper in millimetres (a signature 50 by default, initials 20).' },
      width: { type: 'number', description: 'A picture: its width as a share of the picture’s width (default 0.3).' },
      replace: { type: 'boolean', description: 'Write over the file instead of a signed copy beside it.' },
      look: { type: 'boolean', description: 'Only show where it would go: nothing is written, and the user is not asked.' },
    },
  },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const saved = listSignatures(db);
    const want = typeof a.signature === 'string' ? a.signature.trim() : '';
    const sig = want ? findSignature(db, want) : saved.length === 1 ? saved[0] : null;
    if (!sig) {
      const names = saved.length ? `Saved: ${savedList(saved)}.` : 'None is saved yet.';
      return { isError: true, text: want ? `There is no saved signature named “${want}”. ${names} Ask the user for one with ask_signature.` : `Name the signature to place. ${names}${saved.length ? '' : ' Ask the user for one with ask_signature.'}` };
    }
    const pic = (await signatureImage(db, sig.id))!;
    const widthMm = Math.min(200, Math.max(5, num(a.width_mm) ?? SIGNATURE_WIDTH_MM[sig.kind]));
    const look = a.look === true;
    const replace = a.replace === true;
    const occurrence = num(a.occurrence);
    const what = sig.kind === 'initials' ? 'initials' : 'signature';
    const marker = `⟦${what} here⟧`;
    const words = (before: string, after: string) => `“${before}${marker}${after}”`;
    let plan: Plan;
    try {
      if (typeof a.page_id === 'string' && a.page_id.trim()) {
        // A document of the Library: a picture block, in a new version.
        const id = a.page_id.trim();
        const page = mustPage(db, id);
        if (page.kind !== 'doc') throw new Error(`Page ${id} is not a document: only documents of the Library (and Word files, PDFs and PNG pictures) can be signed.`);
        const doc = normalizeDoc(pageModel(db, id));
        const spot = { placeholder: wordsOf(a.placeholder), after: wordsOf(a.after), cell: a.cell, occurrence };
        const alt = sig.kind === 'initials' ? 'Initials' : 'Signature';
        const r = placeInDoc(doc, `${ASSET}${'0'.repeat(40)}`, spot, { widthMm, alt });
        plan = {
          card: { target: { kind: 'doc', page: { id, title: page.title } }, spot: r.spot, widthMm, text: { before: r.before, after: r.after } },
          look: async () => ({ text: `“${page.title}” (page ${id}): it would go ${r.where}, on the left, ${widthMm} mm wide: ${words(r.before, r.after)}.` }),
          write: async () => {
            const done = placeInDoc(normalizeDoc(pageModel(db, id)), `${ASSET}${putAsset(db, pic.png)}`, spot, { widthMm, alt });
            const p = addVersion(db, id, { model: done.doc, by: 'agent' });
            ctx.deps.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
            refreshThumbs(ctx.deps, [id]);
            return `Placed “${sig.name}” in the document “${p.title}” (page ${id}, version ${p.version}), ${done.where}. The user sees it in the Library at once.`;
          },
        };
      } else if (typeof a.file === 'string' && a.file.trim()) {
        const file = inSession(ctx.cwd, a.file);
        const st = await fs.promises.stat(file).catch(() => null);
        if (!st?.isFile()) throw new Error(`No such file: ${file}`);
        const ext = path.extname(file).toLowerCase();
        const buf = await fs.promises.readFile(file);
        const out = replace ? file : signedCopy(file);
        /** The file as it was planned on: written only if it has not changed while the user decided. */
        const unchanged = async () => {
          const now = await fs.promises.stat(file).catch(() => null);
          if (!now || now.mtimeMs !== st.mtimeMs || now.size !== st.size) throw new Error(`${path.basename(file)} changed while the user decided, so nothing was written: look again and place it again.`);
        };
        if (ext === '.docx' || ext === '.docm') {
          const spot = {
            placeholder: wordsOf(a.placeholder),
            after: wordsOf(a.after),
            cell: a.cell && typeof a.cell === 'object' ? (a.cell as { table: number; row: number; column: number }) : undefined,
            occurrence,
          };
          const r = placeInDocx(buf, pic.png, pic, spot, { widthMm, float: typeof a.float === 'boolean' ? a.float : undefined, name: sig.kind === 'initials' ? 'Initials' : 'Signature' });
          plan = {
            card: { target: { kind: 'docx', path: file }, spot: r.spot, out, replace, widthMm, text: { before: r.before, after: r.after, float: r.float } },
            look: async () => ({ text: `${path.basename(file)}: it would go ${r.where}, ${r.float ? 'in front of the text (moving nothing)' : 'in the line'}, ${widthMm} mm wide: ${words(r.before, r.after)}.` }),
            write: async () => {
              await unchanged();
              await writeWhole(out, r.docx);
              return `Placed “${sig.name}” ${r.where} in ${out}${replace ? '' : ' (a signed copy beside the file)'}.`;
            },
          };
        } else if (ext === '.pdf') {
          const t = await pdfTools();
          const x = num(a.x);
          const y = num(a.y);
          const near = typeof a.near === 'string' && a.near.trim() ? a.near.trim() : undefined;
          const side = SIDES.includes(a.side) ? (a.side as Side) : undefined;
          const pageNo = num(a.page);
          // Looking at a page before choosing a spot.
          if (look && !near && (x === undefined || y === undefined)) {
            const sizes = t.pages(buf);
            const p = pageNo ?? sizes.length;
            if (!Number.isInteger(p) || p < 1 || p > sizes.length) throw new Error(`The PDF has ${sizes.length} page${sizes.length === 1 ? '' : 's'}: page is from 1 to ${sizes.length}`);
            const shot = smaller(await t.pagePicture(buf, p), 1100);
            return {
              text: `${path.basename(file)}, page ${p} of ${sizes.length} (${Math.round(sizes[p - 1].w)} × ${Math.round(sizes[p - 1].h)} points). Choose a spot as x and y, shares of the page from its top-left (the line the signature sits on), or near: words on the page; then look again.`,
              images: [{ data: shot.toString('base64'), mimeType: 'image/png' }],
            };
          }
          const r = pdfSpot(t, buf, pic, { page: pageNo, near, side, x, y, occurrence, widthMm });
          plan = {
            card: { target: { kind: 'pdf', path: file }, spot: r.spot, page: r.at.page, pages: r.pages, out, replace, widthMm },
            picture: async () => putPreview(smaller(await t.pagePicture(t.stampImage(buf, r.at, pic.png), r.at.page), 1000)),
            look: async () => {
              const boxed = t.stampImage(buf, r.at, writePng(boxPicture(r.at.w * 4, r.at.h * 4)));
              const shot = smaller(await t.pagePicture(boxed, r.at.page), 1100);
              const sizes = t.pages(buf)[r.at.page - 1];
              return {
                text: `${path.basename(file)}: it would go on ${r.where}, ${widthMm} mm wide: the blue box on the page below. Its top-left corner is ${(r.at.x / sizes.w).toFixed(3)} across and ${(r.at.y / sizes.h).toFixed(3)} down, as shares of the page.`,
                images: [{ data: shot.toString('base64'), mimeType: 'image/png' }],
              };
            },
            write: async () => {
              await unchanged();
              await writeWhole(out, t.stampImage(buf, r.at, pic.png));
              return `Placed “${sig.name}” on ${r.where} in ${out}${replace ? '' : ' (a signed copy beside the file)'}, added to the PDF without changing what was in it.`;
            },
          };
        } else if (ext === '.png') {
          const base = readPicture(buf);
          const sigPx = readPng(pic.png);
          const x = num(a.x);
          const y = num(a.y);
          if (x === undefined || y === undefined) {
            if (look)
              return {
                text: `${path.basename(file)} (${base.width} × ${base.height} pixels). Choose where the signature sits as x and y, shares of the picture from its top-left, then look again.`,
                images: [{ data: smaller(buf, 1100).toString('base64'), mimeType: 'image/png' }],
              };
            throw new Error('Say where on the picture: x and y, as shares of its width and height from its top-left (look: true shows it first).');
          }
          const spot = { x, y, width: Math.min(1, Math.max(0.02, num(a.width) ?? 0.3)) };
          plan = {
            card: { target: { kind: 'png', path: file }, spot: { kind: 'point', x, y }, out, replace },
            picture: async () => putPreview(pictureView(base, sigPx, spot, { max: 1000 })),
            look: async () => ({ text: `${path.basename(file)}: the blue box shows where it would go.`, images: [{ data: pictureView(base, sigPx, spot, { box: true }).toString('base64'), mimeType: 'image/png' }] }),
            write: async () => {
              await unchanged();
              await writeWhole(out, signPicture(base, sigPx, spot));
              return `Placed “${sig.name}” in ${out}${replace ? '' : ' (a signed copy beside the picture)'}, ${Math.round(x * 100)}% across and ${Math.round(y * 100)}% down.`;
            },
          };
        } else throw new Error(`${path.basename(file)} is not a kind of file this signs: Word files (.docx), PDFs and PNG pictures. Save it as one of those first (LibreOffice: soffice --convert-to docx).`);
      } else throw new Error('Give file (a .docx, .pdf or .png file) or page_id (a document of the Library).');
    } catch (e) {
      return { isError: true, text: (e as Error).message };
    }
    if (look) return plan.look();
    if (modeOf(ctx) === 'read-only') return { isError: true, text: 'This session only reads now (Plan mode): look with look: true; the user places it once they leave Plan mode.' };

    // The user's OK first, unless they allowed this signature for the rest of the session.
    const key = `${ctx.key}\n${sig.id}`;
    if (!allowed.has(key)) {
      try {
        if (plan.picture) plan.card.picture = await plan.picture();
      } catch (e) {
        return { isError: true, text: `The page could not be shown to the user, so nothing was written: ${(e as Error).message}` };
      }
      const card = signatureCard({
        title: sig.kind === 'initials' ? `Place your initials “${sig.name}”?` : `Place your signature “${sig.name}”?`,
        options: [
          { id: 'accept', label: 'Allow', style: 'primary' },
          { id: 'session', label: 'Allow for this session' },
          { id: 'deny', label: 'Deny', style: 'danger' },
        ],
        signature: { place: { signature: { id: sig.id, name: sig.name, kind: sig.kind }, ...plan.card } },
      });
      const r = await onCard(ctx, card);
      if ('why' in r) {
        if (r.why === 'nobody') return { isError: true, text: 'Nobody can allow it now (the session is not running in the app), so nothing was written.' };
        if (r.why === 'timeout') return { isError: true, text: 'The user did not answer in time, so the card was withdrawn and nothing was written.' };
        return { isError: true, text: 'The card was withdrawn before the user answered; nothing was written.' };
      }
      if (r.answer.decision !== 'accept' && r.answer.decision !== 'session') return 'The user did not allow placing it, so nothing was written. Ask them what they would like instead.';
      if (r.answer.decision === 'session') allowed.add(key);
    }
    try {
      const done = await plan.write();
      touchSignature(db, sig.id);
      ctx.deps.broadcast({ t: 'feature', id: 'signatures', data: { changed: 'signatures' } });
      return `${done} ${NOT_CRYPTO.replace('their', 'the user’s')} Hand a file over with present_files.`;
    } catch (e) {
      return { isError: true, text: (e as Error).message };
    }
  },
};

export const signatureTools = (_ctx: RunCtx): RunTool[] => [ASK_SIGNATURE, PLACE_SIGNATURE];
