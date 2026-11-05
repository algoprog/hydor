// The pre-submission check of a LaTeX paper (the editor's Tools → Check before submitting, and agents' latex_check):
// what a venue's reviewers and its desk would catch, found before they do.
//
// - References: every \cite against the bibliographies the paper reads (keys cited but not defined, entries never
//   cited, the same paper twice, fields missing), then each cited entry looked up online (latex-lookup.ts) and
//   compared: is it there at all, are its authors, year and venue right, has a preprint been published since. Each
//   such finding offers the entry as the services list it, under the same key, for Fix.
// - Anonymity, for anonymous venues: names the template shows (with the switch to its anonymous version as Fix), an
//   acknowledgements section, \thanks, links that name a person or a lab, "our previous work" with a citation, and
//   the PDF's own Author and Title fields.
// - Format: the pages that count against the venue's limit (from the PDF's text: up to where the references or the
//   parts the venue does not count begin), Type 3 fonts and fonts not embedded, the template changed (margins, fonts,
//   negative spaces, as hints), undefined references and citations, TODO marks, lines far into the margin.
// - Required parts: what the venue asks for (an abstract, ACL's Limitations, NeurIPS's checklist…).
// - Numbers: in each table, bold on the best value of its column (which way is better told by its header); a table
//   Experiments put there (% hydor:table <id>) worked out again from its runs, every number that changed flagged,
//   with Update the table; and the other tables' numbers looked for in the finished runs, as information.
//
// It runs as a job the editor follows (POST /api/pages/tex/check, then GET …/:id as it goes): what is quick first,
// then the typesetting and the PDF, then the references online. Nothing in the document is changed by the check.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import type { RunTool } from '../features/types.ts';
import { listRuns, recomputeTable, type RunQuery } from '../experiments/records.ts';
import { readSecret, touchSecret } from '../connections/vault.ts';
import { spaceById } from '../spaces/index.ts';
import { normalizeTex, TEX_MAIN, texFileText, texPlain, type TexDoc, type TexIssue } from '../../shared/latex.ts';
import { CHECK_GROUPS, LEVEL_LABEL, VENUES, venueSummary, venueWith, detectVenue, type CheckEdit, type CheckFinding, type CheckState, type Venue } from '../../shared/latex-submit.ts';
import type { ResultsTable, RunRecord } from '../../shared/experiments.ts';
import { openFile } from './filemodel.ts';
import { compileTex, readTex, texFolderOk, texPdfTool, type TexResult } from './latex.ts';
import { citedAsPreprint, differences, entryArxiv, entryDoi, entryFrom, Lookup, type PaperRecord } from './latex-lookup.ts';
import {
  betterOf,
  bibAuthors,
  bibField,
  bibitemsIn,
  bibliographyOf,
  blankSpans,
  cellNumber,
  citesIn,
  closeBrace,
  cleanTex,
  headingsIn,
  lineOf,
  lineSpan,
  parseBibFile,
  REQUIRED_FIELDS,
  scanTex,
  tabularsIn,
  templateMode,
  texSources,
  titleLikeness,
  type BibItem,
  type CellNumber,
  type Heading,
  type TabCell,
  type Tabular,
  type TemplateMode,
  type TexSource,
} from './latex-paper.ts';
import { mustPage, pageInfo, pageSource } from './store.ts';

const short = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

/** Experiments' records as the check reads them (the tests put a stand-in in their place). */
interface Records {
  listRuns: (db: DB, q?: RunQuery) => RunRecord[] | Promise<RunRecord[]>;
  recomputeTable: (db: DB, id: string) => ResultsTable | null | Promise<ResultsTable | null>;
}
let records: Records = { listRuns, recomputeTable };
export function useRecords(r: Partial<Records>) {
  records = { ...records, ...r };
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface CheckInput {
  doc: TexDoc;
  venue: Venue;
  /** The project (space) whose runs the numbers are traced to. */
  project?: string | null;
  /** A file's document: the folder it is typeset in (and whose runs count). */
  folder?: string;
  /** An earlier typesetting to start from. */
  base?: string;
}

interface Ctx {
  db: DB;
  doc: TexDoc;
  venue: Venue;
  sources: TexSource[];
  mode: TemplateMode;
  headings: Heading[];
  add: (f: CheckFinding) => void;
  note: (s: string) => void;
}

/** A finding's place: a file, the words [from, to) in it, and their line. */
function place(doc: TexDoc, file: string, from: number, to = from): Pick<CheckFinding, 'file' | 'line' | 'from' | 'to' | 'quote'> {
  const text = texFileText(doc, file) ?? '';
  const end = Math.max(from, to);
  return { file, line: lineOf(text, from), from, to: end, quote: text.slice(from, Math.min(end, from + 300)) };
}

/** A whole line's place. */
function linePlace(doc: TexDoc, file: string, line: number): Pick<CheckFinding, 'file' | 'line' | 'from' | 'to' | 'quote'> {
  const text = texFileText(doc, file) ?? '';
  let at = 0;
  for (let i = 1; i < line && at >= 0; i++) {
    const nl = text.indexOf('\n', at);
    if (nl < 0) break;
    at = nl + 1;
  }
  const sp = lineSpan(text, at);
  const lead = text.slice(sp.from, sp.to).length - text.slice(sp.from, sp.to).trimStart().length;
  return { file, line, from: sp.from + lead, to: sp.to, quote: text.slice(sp.from + lead, Math.min(sp.to, sp.from + lead + 300)) };
}

/** Where a document-wide finding goes: on main.tex's \documentclass. */
function topPlace(doc: TexDoc): Pick<CheckFinding, 'file' | 'line' | 'from' | 'to' | 'quote'> {
  const m = /\\documentclass[^\n]*/.exec(cleanTex(doc.main));
  return m ? place(doc, TEX_MAIN, m.index, m.index + m[0].length) : { file: TEX_MAIN, line: 1, from: 0, to: 0 };
}

// ---- references, as the paper has them ----------------------------------------------------------------------------

interface Bibs {
  /** The entries the paper cites, as the bibliographies have them. */
  cited: BibItem[];
  texts: Map<string, string>;
}

function checkReferences(c: Ctx): Bibs {
  const { doc, add } = c;
  const bib = bibliographyOf(doc, c.sources);
  const { uses, all } = citesIn(c.sources);
  const texts = new Map<string, string>();
  if (!uses.length && !bib.named.length) return { cited: [], texts };
  for (const n of bib.named.filter((x) => !doc.files.some((f) => f.name === x))) {
    add({
      id: `refs:nobib:${n}`,
      group: 'refs',
      level: 'must',
      title: `The bibliography ${n} is not in the document`,
      detail: 'The paper reads it, but the document has no file of that name: every citation from it shows as “?”.',
      ...bibPlace(c),
      ask: `The paper reads the bibliography ${n}, which the document does not have: add it (with entries for every key the paper cites), or point \\bibliography at the right file.`,
    });
  }
  // Every entry of every bibliography it reads.
  const entries: BibItem[] = [];
  for (const name of bib.files) {
    const text = texFileText(doc, name) ?? '';
    texts.set(name, text);
    const parsed = parseBibFile(name, text);
    entries.push(...parsed.entries);
    for (const p of parsed.problems.slice(0, 5))
      add({
        id: `refs:read:${name}:${short(p.message)}`,
        group: 'refs',
        level: 'must',
        title: `BibTeX cannot read ${name} here`,
        detail: `${p.message}. The entries after it may be lost.`,
        ...linePlace(doc, name, p.line),
        ask: `Fix ${name} around line ${p.line}: ${p.message}.`,
      });
  }
  const byKey = new Map<string, BibItem>();
  const byLower = new Map<string, BibItem>();
  for (const e of entries) {
    const had = byLower.get(e.key.toLowerCase());
    if (had) {
      add({
        id: `refs:twice-key:${e.key.toLowerCase()}`,
        group: 'refs',
        level: 'must',
        title: `The key “${e.key}” is in the bibliography twice`,
        detail: `${had.file} line ${had.line} and ${e.file} line ${e.line}: BibTeX keeps the first and stops at the second.`,
        ...place(doc, e.file, e.from, e.from + Math.min(e.to - e.from, (texts.get(e.file) ?? '').indexOf('\n', e.from) - e.from)),
        ask: `The key “${e.key}” has two entries (${had.file} line ${had.line} and ${e.file} line ${e.line}): keep the right one and remove or rename the other.`,
      });
      continue;
    }
    byKey.set(e.key, e);
    byLower.set(e.key.toLowerCase(), e);
  }
  const items = new Set(bibitemsIn(c.sources).map((b) => b.key));
  // Each key cited, once, where it is first cited.
  const first = new Map<string, (typeof uses)[number]>();
  const count = new Map<string, number>();
  for (const u of uses) {
    if (!first.has(u.key)) first.set(u.key, u);
    count.set(u.key, (count.get(u.key) ?? 0) + 1);
  }
  // \nocite{*}: every entry is in the references, and is checked.
  const cited: BibItem[] = all ? [...byKey.values()] : [];
  const bibs = bib.files.length ? bib.files.join(', ') : '';
  for (const [key, u] of first) {
    const e = byKey.get(key);
    if (e) {
      if (!all) cited.push(e);
      continue;
    }
    if (items.has(key)) continue;
    const near = byLower.get(key.toLowerCase());
    if (near) {
      add({
        id: `refs:case:${key}`,
        group: 'refs',
        level: 'must',
        title: `“${key}” is cited, but its entry's key is “${near.key}”`,
        detail: 'BibTeX tells keys apart by their capitals here: it does not find it.',
        ...place(doc, u.file, u.from, u.to),
        fix: { label: 'Use the entry’s key', edits: uses.filter((x) => x.key === key).map((x) => ({ file: x.file, from: x.from, to: x.to, was: key, text: near.key })) },
      });
      if (!all && !cited.includes(near)) cited.push(near);
      continue;
    }
    add({
      id: `refs:undefined:${key}`,
      group: 'refs',
      level: 'must',
      title: `“${key}” is cited, but no entry has that key`,
      detail: `${count.get(key)! > 1 ? `Cited ${count.get(key)} times. ` : ''}${bibs ? `It is not in ${bibs}` : 'The document has no bibliography'}: it shows as “?” in the PDF.`,
      ...place(doc, u.file, u.from, u.to),
      ask: `The paper cites “${key}” (${u.file}, line ${u.line}), which ${bibs ? `is not in ${bibs}` : 'no bibliography has'}: find the paper it means online and add its BibTeX entry${bibs ? ` to ${bib.files[0]}` : ''} under that key.`,
    });
  }
  // Entries no \cite names (\nocite{*} names them all).
  if (!all)
    for (const name of bib.files) {
      const never = entries.filter((e) => e.file === name && byKey.get(e.key) === e && !first.has(e.key) && ![...first.keys()].some((k) => k.toLowerCase() === e.key.toLowerCase()));
      if (!never.length) continue;
      add({
        id: `refs:uncited:${name}`,
        group: 'refs',
        level: 'info',
        title: `${plural(never.length, 'entry', 'entries')} in ${name} ${never.length === 1 ? 'is' : 'are'} never cited`,
        detail: `They do not show in the references: ${never
          .slice(0, 25)
          .map((e) => e.key)
          .join(', ')}${never.length > 25 ? ` and ${never.length - 25} more` : ''}.`,
        ...place(doc, name, never[0].from, never[0].from + never[0].key.length + never[0].type.length + 2),
      });
    }
  // The same paper under two keys.
  const seen = new Map<string, BibItem>();
  const told = new Set<string>();
  for (const e of cited) {
    const doi = entryDoi(e);
    const ax = entryArxiv(e);
    const title = bibField(e, 'title');
    const fam = bibAuthors(bibField(e, 'author')).families[0] ?? '';
    const ids = [
      doi && `doi:${doi}`,
      ax && `arxiv:${ax}`,
      title.length > 12 &&
        `title:${texPlain(title)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '')}:${fam}`,
    ].filter(Boolean) as string[];
    for (const id of ids) {
      const other = seen.get(id);
      if (other && other.key !== e.key && !told.has(`${other.key}|${e.key}`)) {
        told.add(`${other.key}|${e.key}`);
        add({
          id: `refs:twice:${other.key}:${e.key}`,
          group: 'refs',
          level: 'check',
          title: `The same paper is cited as “${other.key}” and “${e.key}”`,
          detail: `${id.startsWith('title') ? 'The same title and first author' : `The same ${id.startsWith('doi') ? 'DOI' : 'arXiv id'}`}: it is listed twice in the references.`,
          ...place(doc, e.file, e.from, e.from + e.type.length + e.key.length + 2),
          ask: `“${other.key}” and “${e.key}” are the same paper: keep “${other.key}”, change every \\cite of “${e.key}” to “${other.key}”, and take the entry “${e.key}” out of ${e.file}.`,
        });
      }
      if (!other) seen.set(id, e);
    }
  }
  // Fields BibTeX's styles need.
  const byKeyAll = new Map(entries.map((e) => [e.key.toLowerCase(), e]));
  for (const e of cited) {
    const need = REQUIRED_FIELDS[e.type];
    if (!need) continue;
    const parent = bibField(e, 'crossref') ? byKeyAll.get(bibField(e, 'crossref').toLowerCase()) : undefined;
    const has = (n: string) => !!bibField(e, n).trim() || (!!parent && !!bibField(parent, n).trim());
    const missing = need.filter((alts) => !alts.some(has)).map((alts) => alts[0]);
    if (!missing.length) continue;
    add({
      id: `refs:fields:${e.key}`,
      group: 'refs',
      level: 'check',
      title: `“${e.key}” has no ${missing.join(', ')}`,
      detail: `A @${e.type} entry needs ${missing.length === 1 ? 'it' : 'them'}: its reference shows without ${missing.length === 1 ? 'it' : 'them'}.`,
      ...place(doc, e.file, e.from, e.from + e.type.length + e.key.length + 2),
      ask: `The bibliography entry “${e.key}” (${e.file}, line ${e.line}) has no ${missing.join(', ')}: look the paper up and fill ${missing.length === 1 ? 'it' : 'them'} in.`,
    });
  }
  return { cited, texts };
}

// ---- references, as the services have them ------------------------------------------------------------------------

/** How long the online part may take in all. */
const ONLINE_BUDGET_MS = 180_000;
const MAX_ONLINE = 300;

async function checkReferencesOnline(c: Ctx, bibs: Bibs, lookup: Lookup, progress: (done: number, of: number) => void, signal: AbortSignal, existing: (id: string) => CheckFinding | undefined) {
  const list = bibs.cited.slice(0, MAX_ONLINE);
  if (bibs.cited.length > MAX_ONLINE) c.note(`Only the first ${MAX_ONLINE} cited references were looked up online.`);
  if (!list.length) return;
  const t0 = Date.now();
  progress(0, list.length);
  const ax = await lookup.byArxiv(list.map(entryArxiv).filter((x): x is string => !!x));
  // Every preprint's published version asked for at once, where a service can.
  await lookup.prefetchPublished(
    list
      .filter(citedAsPreprint)
      .map(entryArxiv)
      .filter((x): x is string => !!x && !!ax.get(x)),
  );
  let done = 0;
  let late = 0;
  const one = async (e: BibItem) => {
    if (signal.aborted) return;
    if (Date.now() - t0 > ONLINE_BUDGET_MS) {
      late++;
      return;
    }
    const text = bibs.texts.get(e.file) ?? '';
    // The entry's first line (@type{key,): where its findings are shown and commented.
    const nl = text.indexOf('\n', e.from);
    const headTo = nl > e.from && nl < e.to ? nl : e.to;
    const head = { file: e.file, line: e.line, from: e.from, to: headTo, quote: text.slice(e.from, headTo) };
    const was = text.slice(e.from, e.to);
    const fix = (rec: PaperRecord, published: boolean) => {
      const next = entryFrom(text, e, rec, published);
      return next.trim() === was.trim() ? undefined : { label: published ? 'Cite the published version' : 'Fix', edits: [{ file: e.file, from: e.from, to: e.to, was, text: next }], shows: next };
    };
    const tell = (rec: PaperRecord) => {
      const diffs = differences(e, rec);
      const f = fix(rec, false);
      // An entry missing fields: the record fills them in.
      const missing = existing(`refs:fields:${e.key}`);
      if (missing && !missing.fix && f) {
        missing.fix = f;
        missing.ask = undefined;
      }
      if (!diffs.length) return;
      c.add({
        id: `refs:differs:${e.key}`,
        group: 'refs',
        level: 'check',
        title: `“${e.key}”: ${diffs[0].text}`,
        detail:
          `${
            diffs.length > 1
              ? `Also, ${diffs
                  .slice(1)
                  .map((d) => d.text)
                  .join('; ')}. `
              : ''
          }${f ? 'Fix puts in the entry as listed there, under the same key.' : ''}`.trim() || undefined,
        ...head,
        fix: f,
        ask: f ? undefined : `Check the bibliography entry “${e.key}” (${e.file}, line ${e.line}) against the paper itself: ${diffs.map((d) => d.text).join('; ')}.`,
      });
    };
    const preprint = async (rec: PaperRecord) => {
      if (!citedAsPreprint(e)) return;
      const pub = await lookup.published(rec);
      if (!pub) return;
      const f = fix(pub, true);
      c.add({
        id: `refs:published:${e.key}`,
        group: 'refs',
        level: 'check',
        title: `“${e.key}” has been published since, in ${clip(pub.venue ?? 'a journal or proceedings', 90)}${pub.year ? ` (${pub.year})` : ''}`,
        detail: 'It is cited as a preprint. Reviewers expect the published version where there is one.',
        ...head,
        fix: f,
      });
    };
    const doi = entryDoi(e);
    const id = entryArxiv(e);
    if (doi && !/^10\.48550\//.test(doi)) {
      const rec = await lookup.byDoi(doi);
      if (rec === null)
        c.add({
          id: `refs:nodoi:${e.key}`,
          group: 'refs',
          level: 'check',
          title: `“${e.key}”: no paper has the DOI ${doi}, as far as the services know`,
          detail: 'Crossref, DataCite and doi.org do not know it. It may be mistyped, or not registered yet: check it.',
          ...head,
          ask: `The DOI of the bibliography entry “${e.key}” (${doi}) is known nowhere: find the paper's real DOI and correct it (or take the doi field out).`,
        });
      else if (rec?.title) {
        tell(rec);
        if (rec.kind === 'preprint') await preprint(rec);
      }
    } else if (id) {
      const rec = ax.get(id);
      if (rec === null)
        c.add({
          id: `refs:noarxiv:${e.key}`,
          group: 'refs',
          level: 'check',
          title: `“${e.key}”: arXiv has no paper ${id}`,
          detail: 'Its arXiv id may be mistyped: check it.',
          ...head,
          ask: `arXiv has no paper ${id}, which the bibliography entry “${e.key}” names: find the paper's real arXiv id and correct it.`,
        });
      else if (rec) {
        tell(rec);
        await preprint(rec);
      }
    } else if (bibField(e, 'title')) {
      const first = bibAuthors(bibField(e, 'author')).families[0];
      const found = await lookup.byTitle(bibField(e, 'title'), first);
      const best = found.find((r) => titleLikeness(r.title, bibField(e, 'title')) >= 0.85);
      // Software, data sets, web pages and the like are rarely in these services.
      const scholarly = /^(article|inproceedings|conference|incollection|inbook|book|phdthesis|mastersthesis|techreport|proceedings)$/.test(e.type);
      if (!best && scholarly && lookup.answering('crossref', 'openalex'))
        c.add({
          id: `refs:notfound:${e.key}`,
          group: 'refs',
          level: 'check',
          title: `“${e.key}” was not found by its title`,
          detail: 'Crossref, OpenAlex and DBLP list no paper with about this title. It may not exist, or be listed under other words: check it.',
          ...head,
          ask: `The bibliography entry “${e.key}” (“${clip(texPlain(bibField(e, 'title')), 100)}”) could not be found by its title in Crossref, OpenAlex or DBLP: check that the paper exists and that its details are right.`,
        });
      else if (best) {
        tell(best);
        if (best.kind === 'preprint') await preprint(best);
      }
    }
    done++;
    progress(done, list.length);
  };
  // A few at a time: each service keeps its own pace.
  const queue = [...list];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        try {
          await one(e);
        } catch (err) {
          if (signal.aborted) return;
          console.error(`[pages] the reference check of ${e.key} failed: ${(err as Error).message}`);
        }
      }
    }),
  );
  if (late) c.note(`${plural(late, 'reference was', 'references were')} not looked up online: the check took its three minutes.`);
}

// ---- anonymity -------------------------------------------------------------------------------------------------------

/** The spans of \author{…} (and ICML's, AAAI's author blocks) in a source's clean text. */
function authorBlocks(src: TexSource): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const m of src.clean.matchAll(/\\(author|affiliations?|icmlauthor|icmlaffiliation|email|institute)\s*(?:\[[^\]]*\]\s*)?(?=\{)/g)) {
    const open = m.index! + m[0].length;
    const end = closeBrace(src.clean, open);
    if (end > 0) out.push({ from: m.index!, to: end });
  }
  return out;
}

const LINK_PERSONAL = /github\.io\b|~[a-z]|\/people\/|\/~|\bpeople\.|\bhomepages?\.|\busers\.|sites\.google\.com\/view|scholar\.google|linkedin\.com\/in\/|orcid\.org\/|(?:twitter|x)\.com\/[A-Za-z0-9_]+/i;
const LINK_REPO = /(?:github\.com|gitlab\.com|bitbucket\.org|huggingface\.co|codeberg\.org)\/(?!anonymous|orgs\/)[A-Za-z0-9_.-]+/i;
const LINK_SAFE = /anonymous\.4open\.science|openreview\.net|arxiv\.org|doi\.org|aclanthology\.org/i;

function checkAnonymity(c: Ctx, info: Record<string, string> | null) {
  const { doc, venue, mode, add } = c;
  if (!venue.anonymous) return;
  const main = c.sources[0];
  const blocks = authorBlocks(main);
  const named = blocks.filter((b) => /^\\author/.test(main.clean.slice(b.from, b.to)));
  const names = named
    .map((b) =>
      texPlain(
        main.text
          .slice(b.from, b.to)
          .replace(/^\\author\s*(\[[^\]]*\])?\s*\{/, '')
          .replace(/\}$/, ''),
      ),
    )
    .join(' ')
    .trim();
  const realNames = !!names && !/\banonymous\b|\banon\b|\bblind\b|\bwithheld\b/i.test(names);
  // The authors.
  if (mode.anonymous === false) {
    add({
      id: 'anon:template',
      group: 'anon',
      level: 'must',
      title: 'Your names will show: the template is in its final version',
      detail: `${venue.short || 'This venue'} reviews anonymously. The template hides the authors with ${mode.how}.`,
      ...(mode.toAnonymous?.[0] ? place(doc, TEX_MAIN, mode.toAnonymous[0].from, mode.toAnonymous[0].to) : topPlace(doc)),
      fix: mode.toAnonymous ? { label: 'Make it anonymous', edits: mode.toAnonymous } : undefined,
      ask: mode.toAnonymous ? undefined : 'Switch the template to its anonymous review version, so the authors do not show.',
    });
  } else if (mode.anonymous === null && realNames && named[0]) {
    add({
      id: 'anon:author',
      group: 'anon',
      level: 'must',
      title: '\\author names the authors',
      detail: `${venue.short || 'This venue'} reviews anonymously, and this template has no anonymous version of its own: write “Anonymous” in their place for the review.`,
      ...place(doc, TEX_MAIN, named[0].from, Math.min(named[0].to, named[0].from + 200)),
      ask: 'Make the paper anonymous for review: write “Anonymous author(s)” in \\author in place of the names and affiliations, keeping the real ones in a comment for the final version.',
    });
  }
  for (const src of c.sources) {
    // \thanks: on the title, or with the authors where the template does not hide them.
    const blocksHere = src === main ? blocks : authorBlocks(src);
    for (const m of [...src.clean.matchAll(/\\thanks\s*(?=\{)/g)].slice(0, 4)) {
      const inAuthors = blocksHere.some((b) => m.index! > b.from && m.index! < b.to);
      if (inAuthors && mode.anonymous) continue;
      const end = closeBrace(src.clean, m.index! + m[0].length);
      add({
        id: `anon:thanks:${short(src.text.slice(m.index!, end))}`,
        group: 'anon',
        level: 'check',
        title: 'A \\thanks note may name you or your funding',
        detail: 'Its words show in the anonymous version: keep them for the final version.',
        ...place(doc, src.name, m.index!, end > 0 ? end : m.index! + 7),
        ask: `Take the \\thanks note at ${src.name} line ${lineOf(src.text, m.index!)} out of the anonymous version (keep it in a comment for the final version).`,
      });
    }
    // Links that name a person or a lab: personal pages, and repositories the paper calls its own.
    const plain = blankSpans(src.text, [...src.scan.comments, ...src.scan.commentEnvs, ...src.scan.iffalse]);
    let links = 0;
    for (const m of plain.matchAll(/(?:https?:\/\/|www\.)[^\s{}\\%]+|\b(?:github\.com|gitlab\.com|huggingface\.co)\/[^\s{}\\%]+/gi)) {
      if (links >= 6) break;
      const url = m[0].replace(/[.,;:)\]]+$/, '');
      if (LINK_SAFE.test(url)) continue;
      // The words before it in its own sentence say whether it is the paper's own.
      const before = (
        plain
          .slice(Math.max(0, m.index! - 220), m.index!)
          .split(/[.!?]\s+|\n\s*\n/)
          .pop() ?? ''
      ).toLowerCase();
      const own = /\b(our|code|available|release[sd]?|implementation|repository|project page|demo|models? (are|is) at)\b/.test(before);
      if (!(LINK_PERSONAL.test(url) || (LINK_REPO.test(url) && own))) continue;
      links++;
      add({
        id: `anon:link:${short(url)}`,
        group: 'anon',
        level: 'check',
        title: `This link may name you: ${clip(url, 70)}`,
        detail: 'If it is yours, it gives you away. Link to an anonymous copy for the review (anonymous.4open.science makes one of a GitHub repository), and put this one back in the final version.',
        ...place(doc, src.name, m.index!, m.index! + url.length),
        ask: `The link ${url} (${src.name} line ${lineOf(src.text, m.index!)}) may name the authors in the anonymous version: replace it with “(link withheld for review)” and keep it in a comment for the final version.`,
      });
    }
    // "Our previous work [12]": a citation that says who wrote it.
    for (const m of src.clean.matchAll(
      /\b(?:in\s+)?our\s+(?:own\s+)?(?:previous|prior|earlier|recent|past|preliminary|former)\s+(?:work|paper|study|studies|research|publications?|version|approach|method|model|system|results?)\b|\bwe\s+(?:have\s+)?(?:previously|earlier|recently)\s+(?:showed|shown|proposed|introduced|presented|developed|demonstrated|described|reported)\b|\bas\s+we\s+(?:showed|have shown|proposed|described|reported)\s+in\b/gi,
    )) {
      const around = src.clean.slice(Math.max(0, m.index! - 60), m.index! + m[0].length + 160);
      const sentenceEnd = around.indexOf('. ', 60 + m[0].length);
      if (!/\\[A-Za-z]*cite/.test(sentenceEnd > 0 ? around.slice(0, sentenceEnd) : around)) continue;
      add({
        id: `anon:own:${short(src.text.slice(m.index!, m.index! + m[0].length + 40))}`,
        group: 'anon',
        level: 'check',
        title: `“${m[0].trim()}” with a citation says who you are`,
        detail: 'Reviewers can look up who wrote the cited paper. Write about it in the third person (“Smith et al. (2023) showed…”), as about anyone’s work.',
        ...place(doc, src.name, m.index!, m.index! + m[0].length),
        ask: `Rewrite “${m[0].trim()}” (${src.name} line ${lineOf(src.text, m.index!)}) in the third person for the anonymous review, so it does not say the cited work is the authors' own.`,
      });
    }
  }
  // Acknowledgements (the templates that hide them in the anonymous version aside).
  for (const h of c.headings.filter((x) => /acknowledge?ments?/i.test(x.title))) {
    if (h.kind === 'environment' && mode.anonymous && (mode.template === 'acmart' || mode.template === 'neurips')) continue;
    const src = c.sources.find((s) => s.name === h.file)!;
    const fix = commentOut(src, h);
    add({
      id: `anon:acks:${h.file}`,
      group: 'anon',
      level: 'must',
      title: 'An acknowledgements section is in the anonymous version',
      detail: 'It names people, grants and places: leave it out until the final version.',
      ...place(doc, h.file, h.from, h.to),
      fix: fix ? { label: 'Comment it out', edits: [fix] } : undefined,
      ask: fix ? undefined : 'Comment out the acknowledgements for the anonymous review, keeping them for the final version.',
    });
  }
  // The PDF's own fields.
  if (info) {
    const author = (info.Author ?? '').trim();
    if (author && !/^anonymous/i.test(author)) {
      const set = findPdfAuthor(c);
      add({
        id: 'anon:pdfauthor',
        group: 'anon',
        level: 'must',
        title: `The PDF says who wrote it: its Author field is “${clip(author, 60)}”`,
        detail: 'Anyone can read it in the PDF’s properties.',
        ...(set ? place(doc, set.file, set.from, set.to) : topPlace(doc)),
        fix: set ? { label: 'Clear it', edits: [set] } : undefined,
        ask: set ? undefined : 'Clear the PDF’s Author field for the anonymous review: \\hypersetup{pdfauthor={}}.',
      });
    }
    const title = (info.Title ?? '').trim();
    const fams = names ? bibAuthors(names.replace(/,/g, ' and ')).families.filter((f) => f.length > 2) : [];
    if (title && (fams.some((f) => title.toLowerCase().includes(f)) || /\.tex\b|[\\/]|_v\d/i.test(title)))
      add({
        id: 'anon:pdftitle',
        group: 'anon',
        level: 'check',
        title: `The PDF's Title field may name you: “${clip(title, 60)}”`,
        detail: 'Anyone can read it in the PDF’s properties. Give it the paper’s title (\\hypersetup{pdftitle={…}}).',
        ...topPlace(doc),
        ask: 'Set the PDF’s Title field to the paper’s title only: \\hypersetup{pdftitle={…}}.',
      });
  }
}

/** Where hyperref is told the PDF's author (\hypersetup or its options): that value emptied. */
function findPdfAuthor(c: Ctx): CheckEdit | null {
  for (const s of c.sources) {
    const m = /pdfauthor\s*=\s*/.exec(s.clean);
    if (!m) continue;
    const at = m.index + m[0].length;
    const end = s.clean[at] === '{' ? closeBrace(s.clean, at) : at + (/^[^,}\]]*/.exec(s.clean.slice(at))?.[0].length ?? 0);
    if (end <= at) continue;
    return { file: s.name, from: at, to: end, was: s.text.slice(at, end), text: '{}' };
  }
  return null;
}

/** A section commented out line by line, to where the next heading (or the bibliography, or the end) begins; an environment to its end. */
function commentOut(src: TexSource, h: Heading): CheckEdit | null {
  const text = src.text;
  const from = lineSpan(text, h.from).from;
  let to: number;
  if (h.kind === 'environment') {
    const env = /\\begin\s*\{([^}]+)\}/.exec(text.slice(h.from))?.[1];
    if (!env) return null;
    const end = new RegExp(`\\\\end\\s*\\{${env}\\}`).exec(src.clean.slice(h.to));
    if (!end) return null;
    to = lineSpan(text, h.to + end.index).to;
  } else {
    const re = /\\(part|chapter|section|subsection|bibliography|printbibliography|appendix|begin\s*\{thebibliography\}|end\s*\{document\})\b/g;
    re.lastIndex = h.to;
    let m = re.exec(src.clean);
    // A subsection inside it stays inside it.
    while (m && /^\\subsection/.test(m[0]) && h.kind === 'section') m = re.exec(src.clean);
    to = m ? lineSpan(text, m.index).from - 1 : text.length;
    if (to < from) return null;
  }
  const was = text.slice(from, to);
  if (!was.trim()) return null;
  return { file: src.name, from, to, was, text: was.replace(/^/gm, '% ') };
}

// ---- required parts ---------------------------------------------------------------------------------------------------

function checkParts(c: Ctx) {
  const { venue, add, doc } = c;
  const all = c.sources.map((s) => s.clean).join('\n');
  for (const p of venue.parts) {
    if (p.final) continue;
    const byHeading = p.heading ? c.headings.some((h) => new RegExp(p.heading!, 'i').test(h.title.trim())) : false;
    const bySource = p.source ? new RegExp(p.source).test(all) : false;
    if (byHeading || bySource) continue;
    add({
      id: `parts:${p.id}`,
      group: 'parts',
      level: p.level,
      title: `It has no ${p.label.replace(/^(a|an|the) /, '')}`,
      detail: p.why,
      ...topPlace(doc),
      ask: `Add ${p.label} to the paper, as ${venue.short || 'the venue'} asks${p.why ? ` (${p.why.replace(/\.$/, '')})` : ''}.`,
    });
  }
  // NeurIPS's checklist with answers still to give.
  const todo = c.sources.flatMap((s) => [...s.clean.matchAll(/\\answerTODO\b/g)].map((m) => ({ s, at: m.index! })));
  if (todo.length)
    add({
      id: 'parts:checklist-todo',
      group: 'parts',
      level: 'must',
      title: `${plural(todo.length, 'question')} of the checklist ${todo.length === 1 ? 'is' : 'are'} still TODO`,
      detail: 'Each needs an answer (\\answerYes, \\answerNo or \\answerNA) and a line of justification.',
      ...place(doc, todo[0].s.name, todo[0].at, todo[0].at + 11),
      ask: 'Answer the checklist questions still marked \\answerTODO, each with a short justification, from what the paper says.',
    });
}

// ---- format -------------------------------------------------------------------------------------------------------

/** A line of the PDF's text is this heading (its number aside). */
function headingLine(line: string, re: RegExp): boolean {
  const t = line
    .trim()
    .replace(/^((\d+|[A-Z])(\.\d+)*\.?|[IVXL]+\.)\s+/, '')
    .trim();
  return t.length > 0 && t.length < 90 && re.test(t);
}

/**
 * The PDF's pages: in all, and those that count. The count ends where the references begin, or at `end` (the title of
 * the first heading after the main text that the venue does not count, as the source has it: Limitations, an
 * appendix's first section), its last line of that title before the references.
 */
export function pagesOf(pdfText: string, o: { end?: string | null; refsCount?: boolean } = {}): { total: number; counted: number; refsAt?: number; endAt?: number; heading?: string } {
  const pages = pdfText.split('\f');
  while (pages.length > 1 && !pages[pages.length - 1].trim()) pages.pop();
  const total = pages.length;
  // Lines on several pages are running heads and feet ("Under review as a conference paper…"): not text above a heading.
  const seen = new Map<string, number>();
  for (const pg of pages)
    for (const l of new Set(
      pg
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    ))
      seen.set(l, (seen.get(l) ?? 0) + 1);
  const running = (l: string) => (seen.get(l.trim()) ?? 0) > 1 && total > 1;
  const refs = /^(references|bibliography|works cited|literature cited|references and notes)$/i;
  const words = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const endWords = o.end ? words(o.end) : '';
  /** The page a heading's line ends the count at: the page before, when nothing but a running head is above it. */
  const countAt = (p: number, lines: string[], i: number) => (lines.slice(0, i).filter((l) => !running(l) && l.trim().split(/\s+/).length >= 4).length === 0 && p > 0 ? p : p + 1);
  let refsAt: number | undefined;
  let refsCount: number | undefined;
  let endAt: number | undefined;
  let heading: string | undefined;
  for (let p = 0; p < total && refsAt === undefined; p++) {
    const lines = pages[p].split('\n').filter((l) => l.trim());
    for (let i = 0; i < lines.length; i++) {
      if (headingLine(lines[i], refs)) {
        refsAt = p + 1;
        refsCount = countAt(p, lines, i);
        break;
      }
      // The last line with the end heading's title before the references (a subsection of the same name earlier aside).
      if (endWords && p + i > 0) {
        const t = lines[i].trim().replace(/^((\d+|[A-Z])(\.\d+)*\.?|[IVXL]+\.)\s+/, '');
        if (t.length < 120 && words(t) === endWords) {
          endAt = countAt(p, lines, i);
          heading = lines[i].trim();
        }
      }
    }
  }
  if (endAt === undefined && refsCount !== undefined) {
    endAt = refsCount;
    heading = 'References';
  }
  return { total, counted: !o.refsCount && endAt !== undefined ? endAt : total, refsAt, endAt, heading };
}

/**
 * The title of the heading the venue's count ends at, from the source: of the top headings just before the
 * bibliography, the first of the run the venue does not count (Limitations, an ethics statement, acknowledgements…,
 * and an appendix's sections where appendices are not counted). Null when the main text runs up to the references.
 */
export function countEnd(sources: TexSource[], headings: Heading[], venue: Pick<Venue, 'freeHeadings'>): string | null {
  if (!venue.freeHeadings?.length) return null;
  const free = new RegExp(`^(${venue.freeHeadings.join('|')})$`, 'i');
  const appendixFree = free.test('appendix');
  const order = new Map(sources.map((x, i) => [x.name, i]));
  const at = (file: string, pos: number) => (order.get(file) ?? 0) * 1e9 + pos;
  // Where the bibliography is.
  let bib = Infinity;
  for (const x of sources) {
    const m = /\\(bibliography|printbibliography)\b|\\begin\s*\{thebibliography\}/.exec(x.clean);
    if (m) bib = Math.min(bib, at(x.name, m.index));
  }
  const top = headings.some((h) => h.kind === 'chapter') ? 'chapter' : 'section';
  const list = headings.filter((h) => h.kind === top || h.kind === 'environment' || h.kind === 'appendix').sort((a, b) => at(a.file, a.from) - at(b.file, b.from));
  const appendix = list.find((h) => h.kind === 'appendix');
  const before = list.filter((h) => at(h.file, h.from) < bib);
  let first: Heading | null = null;
  for (let i = before.length - 1; i >= 0; i--) {
    const h = before[i];
    const inAppendix = appendixFree && !!appendix && at(h.file, h.from) >= at(appendix.file, appendix.from);
    if (!(free.test(h.title.trim()) || inAppendix)) break;
    first = h;
  }
  if (!first) return null;
  // The appendix itself has no title in the PDF: its first section has.
  if (first.kind === 'appendix') return before.find((h) => at(h.file, h.from) > at(first!.file, first!.from) && h.kind === top)?.title ?? null;
  return first.title;
}

/** pdffonts' table: each font's name, type and whether it is embedded. */
export function fontsOf(out: string): { name: string; type: string; emb: boolean }[] {
  const lines = out.split('\n');
  const d = lines.findIndex((l) => /^-{5,}/.test(l));
  if (d < 0) return [];
  const cols = [...lines[d].matchAll(/-+/g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  if (cols.length < 4) return [];
  return lines
    .slice(d + 1)
    .filter((l) => l.trim() && !/^(Syntax|Internal|I\/O)? ?(Error|Warning)/.test(l))
    .map((l) => ({ name: l.slice(cols[0][0], cols[0][1]).trim(), type: l.slice(cols[1][0], cols[1][1]).trim(), emb: l.slice(cols[3][0], cols[3][1]).trim() === 'yes' }))
    .filter((f) => f.type);
}

/** pdfinfo's fields. */
export function infoOf(out: string): Record<string, string> {
  const o: Record<string, string> = {};
  // A field may be empty: its value never runs on to the next line.
  for (const m of out.matchAll(/^([A-Za-z][A-Za-z ]*?):[ \t]*(.*)$/gm)) o[m[1]] = m[2].trim();
  return o;
}

/** Where the bibliography is printed in the source (for the page limit's finding). */
function bibPlace(c: Ctx): Pick<CheckFinding, 'file' | 'line' | 'from' | 'to' | 'quote'> {
  for (const s of c.sources) {
    const m = /\\(bibliography|printbibliography)\b[^\n]*|\\begin\s*\{thebibliography\}/.exec(s.clean);
    if (m) return place(c.doc, s.name, m.index, m.index + m[0].length);
  }
  return topPlace(c.doc);
}

function checkFormatText(c: Ctx) {
  const { doc, add, mode } = c;
  // TODO marks left in.
  const disabled = c.sources.some((s) => /\\usepackage\s*\[[^\]]*\bdisable\b[^\]]*\]\s*\{todonotes\}/.test(s.clean));
  let todos = 0;
  for (const s of c.sources) {
    // In the text only: the preamble defines such commands, and definitions elsewhere are not marks.
    const body = s.name === TEX_MAIN ? Math.max(0, s.clean.search(/\\begin\s*\{document\}/)) : 0;
    for (const m of s.clean.matchAll(/\\(todo|TODO|fixme|FIXME|xxx|XXX)\b\*?|\bTODO\b|\bFIXME\b|\bXXX\b|\bTBD\b/g)) {
      if (m.index! < body) continue;
      if (/\\(new|renew|provide)command\*?\s*\{?\s*$|\\def\s*$|\\let\s*$/.test(s.clean.slice(Math.max(0, m.index! - 40), m.index!))) continue;
      todos++;
      if (todos > 15) continue;
      const isCmd = m[0].startsWith('\\');
      let end = m.index! + m[0].length;
      let fix: CheckFinding['fix'];
      if (isCmd) {
        // \todo[…]{…}: the whole command, to take out.
        let k = end;
        while (s.clean[k] === ' ') k++;
        if (s.clean[k] === '[') {
          const close = s.clean.indexOf(']', k);
          if (close > 0) k = close + 1;
        }
        const e = closeBrace(s.clean, k);
        if (e > 0) {
          end = e;
          fix = { label: 'Take it out', edits: [{ file: s.name, from: m.index!, to: end, was: s.text.slice(m.index!, end), text: '' }] };
        }
      }
      add({
        id: `format:todo:${s.name}:${short(s.text.slice(m.index!, Math.min(s.text.length, end + 30)))}`,
        group: 'format',
        level: isCmd && disabled ? 'check' : 'must',
        title: isCmd ? `A ${m[0]} note is left in` : `“${m[0]}” is left in the text`,
        detail: isCmd ? (disabled ? 'todonotes is loaded with disable, so it does not show; still, take it out before you send the source anywhere.' : 'It shows in the PDF.') : 'It reads as unfinished work.',
        ...place(doc, s.name, m.index!, Math.min(end, m.index! + 200)),
        fix,
        ask: fix ? undefined : `Finish or take out what is marked “${m[0]}” at ${s.name} line ${lineOf(s.text, m.index!)}.`,
      });
    }
  }
  if (todos > 15) add({ id: 'format:todo-more', group: 'format', level: 'must', title: `${todos - 15} more TODO marks are left in`, detail: 'Search the source for TODO, XXX and \\todo.', ...topPlace(doc) });
  // The template changed (as hints: some changes are allowed).
  if (!mode.template) return;
  const ownFonts = mode.template !== 'llncs';
  for (const s of c.sources) {
    const pre = s.name === TEX_MAIN ? s.clean.slice(0, Math.max(0, s.clean.search(/\\begin\s*\{document\}/))) : '';
    const hint = (id: string, re: RegExp, title: string, detail: string, text: string) => {
      const m = re.exec(text);
      if (!m) return;
      add({ id: `format:${id}:${s.name}`, group: 'format', level: 'check', title, detail, ...place(doc, s.name, m.index, m.index + m[0].length) });
    };
    if (ownFonts)
      hint(
        'fonts',
        /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\b(times|mathptmx|newtxtext|newtxmath|txfonts|helvet|palatino|mathpazo|lmodern|charter|fourier)\b[^}]*\}/,
        'A font package changes the template’s fonts',
        'The venue’s template sets the fonts; loading another can break its rules (and its own may already load it).',
        pre,
      );
    hint(
      'layout',
      /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\bgeometry\b[^}]*\}|\\geometry\s*\{|\\(setlength|addtolength)\s*\{?\\(textwidth|textheight|oddsidemargin|evensidemargin|topmargin|headheight|headsep|footskip|columnsep|marginparwidth|voffset|hoffset)\b/,
      'The page’s layout is changed',
      'The venue’s template sets the margins and the text area: changing them can get a paper desk-rejected.',
      s.name === TEX_MAIN ? s.clean : '',
    );
    hint(
      'spacing',
      /\\renewcommand\s*\{?\\baselinestretch|\\linespread\s*\{|\\setstretch\s*\{|\\titlespacing\b|\\captionsetup\s*(\[[^\]]*\])?\s*\{[^}]*skip/,
      'The spacing of lines, headings or captions is changed',
      'Squeezing space past what the template sets is a reason some venues give for a desk rejection.',
      s.clean,
    );
    const neg = [...s.clean.matchAll(/\\vspace\*?\s*\{\s*-\s*[\d.]/g)];
    if (neg.length)
      add({
        id: `format:vspace:${s.name}`,
        group: 'format',
        level: 'check',
        title: `${plural(neg.length, 'negative \\vspace', 'negative \\vspaces')} in ${s.name}`,
        detail: `They pull text into the template's spaces (lines ${neg
          .slice(0, 6)
          .map((m) => lineOf(s.text, m.index!))
          .join(', ')}${neg.length > 6 ? '…' : ''}). A few are common; many look like squeezing.`,
        ...place(doc, s.name, neg[0].index!, neg[0].index! + neg[0][0].length),
      });
  }
}

async function checkFormatPdf(c: Ctx, r: TexResult, set: (s: Partial<CheckState>) => void, undefinedKeys: Set<string>): Promise<Record<string, string> | null> {
  const { doc, add, venue } = c;
  if (r.errors.length) {
    const e = r.errors[0];
    add({
      id: 'format:errors',
      group: 'format',
      level: 'must',
      title: `It does not typeset without errors (${r.errors.length})`,
      detail: `${e.file ? `${e.file}${e.line ? `:${e.line}` : ''}: ` : ''}${e.message}${e.hint ? ` ${e.hint}` : ''}`,
      ...(e.file && e.line && texFileText(doc, e.file) !== null ? linePlace(doc, e.file, e.line) : topPlace(doc)),
      ask: `Fix the errors LaTeX reports (${r.errors
        .slice(0, 6)
        .map((x) => `${x.file ? `${x.file}${x.line ? `:${x.line}` : ''}: ` : ''}${x.message}`)
        .join('; ')}).`,
    });
  }
  // References and citations TeX could not resolve.
  const undefinedRefs = new Map<string, TexIssue>();
  for (const w of r.warnings) {
    const m = /^Undefined (reference|citation) (\S+)/.exec(w.message) ?? /^No entry (\S+) in the bibliography/.exec(w.message);
    if (!m) continue;
    const key = m.length === 3 ? `${m[1]}:${m[2]}` : `citation:${m[1]}`;
    if (key.startsWith('citation:') && undefinedKeys.has(key.slice(9))) continue;
    if (!undefinedRefs.has(key)) undefinedRefs.set(key, w);
  }
  let n = 0;
  for (const [key, w] of undefinedRefs) {
    if (++n > 12) break;
    const [kind, name] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    add({
      id: `format:undefined:${key}`,
      group: 'format',
      level: 'must',
      title: kind === 'reference' ? `\\ref{${name}} names no \\label: it shows as ??` : `The citation “${name}” is not resolved: it shows as ?`,
      detail: w.message,
      ...(w.file && w.line && texFileText(doc, w.file) !== null ? linePlace(doc, w.file, w.line) : topPlace(doc)),
      ask: kind === 'reference' ? `\\ref{${name}} names no \\label: add the label where it belongs, or fix the reference.` : `The citation “${name}” is not resolved: add its entry to the bibliography, or fix the key.`,
    });
  }
  // Lines far into the margin.
  let over = 0;
  for (const w of r.warnings) {
    const m = /sticks out into the margin by (\d+)pt/.exec(w.message);
    if (!m || Number(m[1]) < 5 || !w.file || !w.line || texFileText(doc, w.file) === null) continue;
    if (++over > 8) break;
    add({
      id: `format:overfull:${w.file}:${short(`${w.line}:${m[1]}`)}`,
      group: 'format',
      level: 'check',
      title: `A line sticks out into the margin by ${m[1]}pt`,
      detail: 'Reviewers notice it in print. Rewording the line, or a hyphenation hint (\\-), mends it.',
      ...linePlace(doc, w.file, w.line),
    });
  }
  if (!r.pdf) return null;
  set({ stage: 'Reading the PDF' });
  const [text, fonts, infoOut] = await Promise.all([texPdfTool(r.key, 'pdftotext'), texPdfTool(r.key, 'pdffonts'), texPdfTool(r.key, 'pdfinfo')]);
  if (text === null || fonts === null || infoOut === null) c.note('Poppler’s tools (pdftotext, pdffonts, pdfinfo) are not all installed here, so some of the PDF was not checked (Debian or Ubuntu: sudo apt install poppler-utils).');
  if (text !== null) {
    const p = pagesOf(text, { end: countEnd(c.sources, c.headings, venue), refsCount: venue.refsCount });
    set({ pages: { total: p.total, counted: venue.pages ? p.counted : undefined, limit: venue.pages } });
    if (venue.pages && p.counted > venue.pages) {
      const before = venue.refsCount ? 'in all' : p.heading && !/^references|bibliography/i.test(p.heading.replace(/^[\d.]+\s*/, '')) ? `before “${clip(p.heading, 40)}”` : 'before the references';
      add({
        id: 'format:pages',
        group: 'format',
        level: 'must',
        title: `It runs to ${p.counted} pages ${before}; ${venue.short || 'the venue'} allows ${venue.pages}`,
        detail: [venue.note, p.endAt === undefined ? 'No references heading was found in the PDF, so every page is counted.' : ''].filter(Boolean).join(' '),
        ...bibPlace(c),
        ask: `Shorten the paper to ${venue.pages} pages ${before} (it runs to ${p.counted}): tighten the writing, figures and tables, without changing the template's fonts, margins or spacing.`,
      });
    }
    if (venue.refsMax && p.refsAt !== undefined) {
      const refsPages = p.total - p.refsAt + 1;
      if (refsPages > venue.refsMax) add({ id: 'format:refspages', group: 'format', level: 'check', title: `The references take ${refsPages} pages; ${venue.short} allows ${venue.refsMax}`, detail: venue.note, ...bibPlace(c) });
    }
    if (venue.totalMax && p.total > venue.totalMax) add({ id: 'format:total', group: 'format', level: 'must', title: `It has ${p.total} pages in all; ${venue.short} allows ${venue.totalMax}`, detail: venue.note, ...bibPlace(c) });
    const qq = (text.match(/\?\?/g) ?? []).length;
    if (qq && !undefinedRefs.size) add({ id: 'format:qq', group: 'format', level: 'check', title: `“??” shows ${plural(qq, 'time')} in the PDF`, detail: 'An unresolved reference shows so: typeset again, or look for the \\ref.', ...topPlace(doc) });
  }
  if (fonts !== null) {
    const list = fontsOf(fonts);
    const t3 = [...new Set(list.filter((f) => /Type 3/.test(f.type)).map((f) => f.name || '(no name)'))];
    const notEmb = [...new Set(list.filter((f) => !f.emb && !/Type 3/.test(f.type)).map((f) => f.name || '(no name)'))];
    if (t3.length)
      add({
        id: 'format:type3',
        group: 'format',
        level: venue.id === 'other' ? 'check' : 'must',
        title: `${plural(t3.length, 'Type 3 font')} in the PDF`,
        detail: `${t3.slice(0, 5).join(', ')}${t3.length > 5 ? '…' : ''}. Bitmap fonts look poor and are refused by IEEE’s and ACM’s checks. They come from figures saved as PDF by matplotlib (set pdf.fonttype to 42) or from \\usepackage[T1]{fontenc} without vector fonts (add \\usepackage{lmodern}).`,
        ...topPlace(doc),
        ask: 'The PDF has Type 3 (bitmap) fonts: find where they come from (figures saved by matplotlib without pdf.fonttype 42, or T1 fonts without lmodern or cm-super) and make every font Type 1 or TrueType.',
      });
    if (notEmb.length)
      add({
        id: 'format:embed',
        group: 'format',
        level: 'must',
        title: `${plural(notEmb.length, 'font is', 'fonts are')} not embedded in the PDF`,
        detail: `${notEmb.slice(0, 5).join(', ')}${notEmb.length > 5 ? '…' : ''}. Venues ask for every font embedded, so the paper prints the same everywhere; they usually come from a figure.`,
        ...topPlace(doc),
        ask: 'Some fonts are not embedded in the PDF: find the figures they come from and save those with their fonts embedded.',
      });
  }
  // AAAI's style typesets with pdfLaTeX only.
  if (venue.template === 'aaai' && doc.engine !== 'pdflatex')
    add({ id: 'format:engine', group: 'format', level: 'must', title: `AAAI's style needs pdfLaTeX; this is typeset with ${doc.engine === 'xelatex' ? 'XeLaTeX' : 'LuaLaTeX'}`, detail: 'Pick pdfLaTeX in Tools → Typeset with.', ...topPlace(doc) });
  return infoOut === null ? null : infoOf(infoOut);
}

// ---- numbers ------------------------------------------------------------------------------------------------------------

interface Grid {
  head: number;
  header: string[];
  rows: { cells: { cell: TabCell; n: CellNumber | null }[]; ruled: boolean; label: string }[];
}

/** A table's header rows (those before the numbers start), each column's header words, and its rows with their numbers. */
export function gridOf(t: Tabular): Grid {
  const rows = t.rows.map((r) => ({ cells: r.cells.map((cell) => ({ cell, n: cell.span === 1 ? cellNumber(cell) : null })), ruled: r.ruled, label: texPlain(r.cells[0]?.raw ?? '') }));
  let head = 0;
  for (; head < rows.length; head++) {
    const cells = rows[head].cells.filter((x) => x.cell.col > 0 && x.cell.raw);
    const nums = cells.filter((x) => x.n);
    if (cells.length && nums.length >= Math.max(1, cells.length / 2)) break;
  }
  const width = Math.max(0, ...t.rows.map((r) => r.cells.reduce((m, x) => Math.max(m, x.col + x.span), 0)));
  const header = Array.from({ length: width }, () => '');
  for (const r of rows.slice(0, head)) for (const { cell } of r.cells) for (let k = cell.col; k < cell.col + cell.span && k < width; k++) header[k] = `${header[k]} ${cell.raw}`.trim();
  return { head, header, rows };
}

/** The problems with bold in a set of cells: those bold that are not the best, and the best not bold (when any is). */
function boldProblems(cells: { cell: TabCell; n: CellNumber }[], better: 'max' | 'min') {
  if (cells.length < 2 || !cells.some((x) => x.n.bold)) return [];
  const best = better === 'max' ? Math.max(...cells.map((x) => x.n.value)) : Math.min(...cells.map((x) => x.n.value));
  const isBest = (x: (typeof cells)[number]) => Math.abs(x.n.value - best) < 1e-9;
  // Of values tied for the best, one in bold is enough.
  const bestBold = cells.some((x) => x.n.bold && isBest(x));
  return cells.filter((x) => (x.n.bold && !isBest(x)) || (!x.n.bold && isBest(x) && !bestBold)).map((x) => ({ ...x, best, wrong: x.n.bold }));
}

/** Bold taken off a cell, or put on: the cell's text with it, when that can be done safely. */
function boldEdit(file: string, text: string, x: { cell: TabCell; n: CellNumber }, on: boolean, math: boolean): CheckEdit | null {
  const was = text.slice(x.cell.from, x.cell.to);
  if (on) {
    if (/^\$[^$]*\$$/.test(was)) return { file, from: x.cell.from, to: x.cell.to, was, text: `$\\mathbf{${was.slice(1, -1)}}$` };
    if (/[{}\\$]/.test(was.replace(/\\%|\\pm|\$\\pm\$|\$\^\{?\\?(dagger|ddagger|\*)\}?\$|\\dag/g, ''))) return null;
    return { file, from: x.cell.from, to: x.cell.to, was, text: math ? `$\\mathbf{${was}}$` : `\\textbf{${was}}` };
  }
  const m = /^\\textbf\s*\{([\s\S]*)\}$/.exec(was) ?? /^\{\\bf(?:series)?\s+([\s\S]*)\}$/.exec(was) ?? /^\\mathbf\s*\{([\s\S]*)\}$/.exec(was);
  if (m && closeBrace(was, was.indexOf('{')) === was.length) return { file, from: x.cell.from, to: x.cell.to, was, text: m[1] };
  const mm = /^\$\\(?:mathbf|bm|boldsymbol)\s*\{([\s\S]*)\}\$$/.exec(was);
  if (mm) return { file, from: x.cell.from, to: x.cell.to, was, text: `$${mm[1]}$` };
  return null;
}

function checkBold(c: Ctx, src: TexSource, t: Tabular) {
  const g = gridOf(t);
  const data = g.rows.slice(g.head);
  if (!data.length) return;
  const width = g.header.length;
  const issues: { col: number; problems: ReturnType<typeof boldProblems>; better: ReturnType<typeof betterOf> }[] = [];
  for (let col = 1; col < width; col++) {
    const at = (rows: typeof data) => rows.flatMap((r) => r.cells.filter((x) => x.cell.col === col && x.n).map((x) => ({ cell: x.cell, n: x.n! })));
    const better = betterOf(g.header[col]);
    const whole = boldProblems(at(data), better.better);
    if (!whole.length) continue;
    // Bold on the best of each block (rows between full rules) is fine too.
    const blocks: (typeof data)[] = [];
    for (const r of data) {
      if (!blocks.length || (r.ruled && blocks[blocks.length - 1].length)) blocks.push([]);
      blocks[blocks.length - 1].push(r);
    }
    const perBlock = blocks.flatMap((b) => boldProblems(at(b), better.better));
    if (!perBlock.length) continue;
    issues.push({ col, problems: perBlock.length < whole.length ? perBlock : whole, better });
  }
  if (!issues.length) return;
  // A table with its metrics in rows: bold on the best of each row.
  const byRow = data.every((r) => {
    const cells = r.cells.filter((x) => x.cell.col > 0 && x.n).map((x) => ({ cell: x.cell, n: x.n! }));
    return !boldProblems(cells, betterOf(r.label).better).length;
  });
  if (byRow && data.some((r) => r.cells.some((x) => x.n?.bold))) return;
  const name = (col: number) => clip(texPlain(g.header[col]) || `column ${col + 1}`, 30);
  const lines: string[] = [];
  for (const i of issues)
    for (const p of i.problems.filter((x) => x.wrong).slice(0, 2)) {
      const best = i.problems.find((x) => !x.wrong) ?? null;
      const row = data.find((r) => r.cells.some((x) => x.cell === best?.cell));
      lines.push(`in “${name(i.col)}”, ${p.n.value.toFixed(p.n.digits)} is bold, but ${best ? `${best.n.value.toFixed(best.n.digits)} (${clip(row?.label || 'another row', 30)})` : p.best} is ${i.better.better === 'max' ? 'higher' : 'lower'}`);
    }
  for (const i of issues) if (!i.problems.some((x) => x.wrong)) lines.push(`in “${name(i.col)}”, the best value (${i.problems[0].best}) is not bold`);
  const unsure = issues.filter((i) => !i.better.sure).map((i) => name(i.col));
  // Bold on several different values of a column may mean something else here (better than a baseline, say).
  const several = issues.some((i) => new Set(data.flatMap((r) => r.cells.filter((x) => x.cell.col === i.col && x.n?.bold).map((x) => x.n!.value))).size > 1);
  // Fix: bold moved to the best values, where every cell can be changed safely.
  const text = src.text;
  const mathStyle = t.rows.some((r) => r.cells.some((x) => /\\mathbf/.test(x.raw)));
  const edits: CheckEdit[] = [];
  let safe = true;
  for (const i of issues)
    for (const p of i.problems) {
      const e = boldEdit(src.name, text, p, !p.wrong, mathStyle && !p.wrong);
      if (!e) safe = false;
      else edits.push(e);
    }
  c.add({
    id: `numbers:bold:${src.name}:${short(text.slice(t.from, Math.min(t.to, t.from + 400)))}`,
    group: 'numbers',
    level: unsure.length || several ? 'check' : 'must',
    title: `Bold does not mark the best values in the table at line ${t.line}`,
    detail: `${lines.slice(0, 4).join('; ')}${lines.length > 4 ? '; …' : ''}.${unsure.length ? ` Taken as higher is better for ${unsure.join(', ')}: ${unsure.length === 1 ? 'its header does' : 'their headers do'} not say which way is better.` : ''}${several ? ' Bold is on several values of a column: if it means something else here, leave it.' : ''}`,
    ...place(c.doc, src.name, t.from, t.from + 20),
    fix: safe && edits.length ? { label: 'Move the bold', edits } : undefined,
    ask: safe && edits.length ? undefined : `In the table at ${src.name} line ${t.line}, put the best value of each column in bold (and only it): ${lines.slice(0, 4).join('; ')}.`,
  });
}

/** A table Experiments put in the paper, worked out again from its runs: each number that changed since. */
async function checkMarked(c: Ctx, src: TexSource, t: Tabular) {
  let rt: ResultsTable | null = null;
  try {
    rt = await records.recomputeTable(c.db, t.marker!);
  } catch (e) {
    c.note(`The table at ${src.name} line ${t.line} could not be worked out again: ${(e as Error).message}`);
    return;
  }
  if (!rt) {
    c.add({
      id: `numbers:gone:${t.marker}`,
      group: 'numbers',
      level: 'info',
      title: `The table at line ${t.line} came from Experiments, which no longer has it`,
      detail: `Table ${t.marker}: its runs are gone, so its numbers could not be worked out again.`,
      ...place(c.doc, src.name, t.from, t.from + 20),
    });
    return;
  }
  const scan = scanTex(rt.latex);
  const theirs = tabularsIn({ name: src.name, text: rt.latex, clean: cleanTex(rt.latex, scan), scan })[0];
  if (!theirs) return;
  const a = gridOf(t);
  const b = gridOf(theirs);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const aRows = a.rows.slice(a.head);
  const bRows = b.rows.slice(b.head);
  const changed: string[] = [];
  let count = 0;
  aRows.forEach((r, i) => {
    const other = bRows.find((x) => norm(x.label) && norm(x.label) === norm(r.label)) ?? (aRows.length === bRows.length ? bRows[i] : undefined);
    if (!other) {
      count++;
      changed.push(`the row “${clip(r.label, 30)}” is no longer in it`);
      return;
    }
    for (const x of r.cells) {
      const y = other.cells.find((z) => z.cell.col === x.cell.col);
      if (!x.n || !y?.n) continue;
      const now = Math.round(y.n.value * 10 ** x.n.digits) / 10 ** x.n.digits;
      const head = clip(texPlain(a.header[x.cell.col] ?? '') || `column ${x.cell.col + 1}`, 24);
      if (Math.abs(now - x.n.value) > 1e-9) {
        count++;
        changed.push(`“${clip(r.label, 24)}”, ${head}: ${x.n.value.toFixed(x.n.digits)} in the paper, ${now.toFixed(x.n.digits)} now`);
      } else if (x.n.marked !== y.n.marked) {
        count++;
        changed.push(`“${clip(r.label, 24)}”, ${head}: its significance mark is ${y.n.marked ? 'missing' : 'no longer earned'}`);
      }
    }
  });
  if (bRows.length > aRows.length) {
    count++;
    changed.push(`its runs now give ${plural(bRows.length - aRows.length, 'more row')}`);
  }
  if (!count) return;
  const was = src.text.slice(t.from, t.to);
  const next = rt.latex.slice(theirs.from, theirs.to);
  c.add({
    id: `numbers:stale:${t.marker}`,
    group: 'numbers',
    level: 'must',
    title: `${plural(count, 'number', 'numbers')} in the table at line ${t.line} ${count === 1 ? 'is' : 'are'} not what its runs give now`,
    detail: `${changed.slice(0, 5).join('; ')}${changed.length > 5 ? '; …' : ''}. Experiments worked it out again from its runs (table ${t.marker}).`,
    ...place(c.doc, src.name, t.from, t.from + 20),
    fix: { label: 'Update the table', edits: [{ file: src.name, from: t.from, to: t.to, was, text: next }], shows: next },
  });
}

/** The finished runs the paper's numbers may come from: its project's, and those started in its folders. */
async function runsFor(db: DB, input: CheckInput): Promise<{ runs: RunRecord[]; where: string }> {
  const out = new Map<string, RunRecord>();
  const add = (list: RunRecord[]) => list.forEach((r) => out.set(r.id, r));
  const space = input.project ? spaceById(db, input.project) : null;
  try {
    if (space) {
      add(await records.listRuns(db, { project: space.id, status: ['done'], limit: 1000 }));
      for (const f of [space.folder, ...(space.folders ?? [])]) if (f) add(await records.listRuns(db, { cwd: f, status: ['done'], limit: 1000 }));
      return { runs: [...out.values()], where: `the project “${space.name}”` };
    }
    if (input.folder) {
      add(await records.listRuns(db, { cwd: input.folder, status: ['done'], limit: 1000 }));
      return { runs: [...out.values()], where: 'its folder' };
    }
    add(await records.listRuns(db, { status: ['done'], limit: 1000 }));
  } catch {}
  return { runs: [...out.values()], where: 'all of Experiments' };
}

async function checkNumbers(c: Ctx, input: CheckInput) {
  const tables = c.sources.flatMap((s) => tabularsIn(s).map((t) => ({ s, t })));
  if (!tables.length) return;
  for (const { s, t } of tables) {
    if (t.marker) await checkMarked(c, s, t);
    else checkBold(c, s, t);
  }
  // The other tables' numbers, looked for in the finished runs, as the table rounds them.
  const others = tables.filter(({ t }) => !t.marker).map(({ s, t }) => ({ s, t, nums: gridOf(t).rows.flatMap((r) => r.cells.map((x) => x.n).filter((n): n is CellNumber => !!n)) }));
  const withNums = others.filter((o) => o.nums.length >= 3);
  if (!withNums.length) return;
  const { runs, where } = await runsFor(c.db, input);
  const values = runs.flatMap((r) => [...Object.values(r.metrics?.last ?? {}), ...Object.values(r.metrics?.best ?? {})]).filter((v) => Number.isFinite(v));
  if (!values.length) {
    c.add({
      id: 'numbers:noruns',
      group: 'numbers',
      level: 'info',
      title: `Experiments has no finished runs for ${where === 'all of Experiments' ? 'you yet' : where}`,
      detail: 'So the tables’ numbers were not traced to runs. Runs started with Experiments (System → Experiments, or experiment_run) are traced from then on.',
      ...place(c.doc, withNums[0].s.name, withNums[0].t.from, withNums[0].t.from + 20),
    });
    return;
  }
  const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
  for (const o of withNums) {
    const traced = o.nums.filter((n) => values.some((v) => Math.abs(round(v, n.digits) - n.value) < 1e-9 || Math.abs(round(v * 100, n.digits) - n.value) < 1e-9)).length;
    c.add({
      id: `numbers:traced:${o.s.name}:${short(o.s.text.slice(o.t.from, Math.min(o.t.to, o.t.from + 400)))}`,
      group: 'numbers',
      level: 'info',
      title: `${traced} of the ${o.nums.length} numbers in the table at line ${o.t.line} match finished runs`,
      detail: `Looked for in the runs of ${where}, rounded as the table rounds them (and as percentages).${traced < o.nums.length ? ' The others may come from elsewhere: a paper, another tool, a run not in Experiments.' : ''}`,
      ...place(c.doc, o.s.name, o.t.from, o.t.from + 20),
    });
  }
}

// ---- the check, as a job --------------------------------------------------------------------------------------------

/** Runs the whole check into `st` (its findings as they come); `changed` after each step. */
export async function runCheck(db: DB, input: CheckInput, st: CheckState, o: { signal: AbortSignal; fetch?: typeof fetch; changed?: () => void }): Promise<void> {
  const { doc, venue } = input;
  const set = (s: Partial<CheckState>) => {
    Object.assign(st, s);
    o.changed?.();
  };
  const byId = new Map<string, CheckFinding>();
  const notes = new Set<string>();
  const c: Ctx = {
    db,
    doc,
    venue,
    sources: [],
    mode: { template: null, anonymous: null },
    headings: [],
    add: (f) => {
      if (byId.has(f.id)) return;
      byId.set(f.id, f);
      st.findings.push(f);
      o.changed?.();
    },
    note: (s) => {
      if (notes.has(s)) return;
      notes.add(s);
      st.notes.push(s);
    },
  };
  set({ stage: 'Reading the paper' });
  c.sources = texSources(doc);
  c.mode = templateMode(doc.main, c.sources[0].clean);
  c.headings = texHeadings(c);
  const bibs = checkReferences(c);
  checkParts(c);
  checkFormatText(c);
  await checkNumbers(c, input);
  if (o.signal.aborted) return;
  set({ stage: 'Typesetting' });
  const r = await compileTex(db, doc, { base: input.base, folder: input.folder });
  let info: Record<string, string> | null = null;
  if (r.missing) c.note(`It could not be typeset here (${r.missing.split('.')[0]}), so its pages, fonts and the PDF’s own fields were not checked.`);
  else {
    const undefinedKeys = new Set(st.findings.filter((f) => f.id.startsWith('refs:undefined:') || f.id.startsWith('refs:case:')).map((f) => f.id.split(':').slice(2).join(':')));
    info = await checkFormatPdf(c, r, set, undefinedKeys);
  }
  checkAnonymity(c, info);
  if (o.signal.aborted) return;
  if (bibs.cited.length) {
    set({ stage: 'Checking the references online', online: { done: 0, of: bibs.cited.length } });
    const lookup = new Lookup({
      db,
      fetch: o.fetch,
      signal: o.signal,
      keys: o.fetch ? {} : { openalex: serviceKey(db, 'OPENALEX_API_KEY', 'api.openalex.org'), semanticscholar: serviceKey(db, 'SEMANTIC_SCHOLAR_API_KEY', 'api.semanticscholar.org') },
    });
    await checkReferencesOnline(
      c,
      bibs,
      lookup,
      (done, of) => set({ online: { done, of } }),
      o.signal,
      (id) => byId.get(id),
    );
    for (const n of lookup.notes) c.note(n);
  }
  set({ stage: undefined });
}

/**
 * The user's key for a service, from Keys where it may go to that service's host (its domains say so), else from the
 * server's environment; none when there is neither.
 */
function serviceKey(db: DB, name: string, host: string): string | undefined {
  try {
    const s = readSecret(db, name);
    if (s && s.view.domains.some((d) => host === d || host.endsWith(`.${d}`))) {
      touchSecret(db, name);
      return s.value;
    }
  } catch {}
  return process.env[name] || undefined;
}

/** The headings the check reads (the document's, through texSources). */
const texHeadings = (c: Ctx) => headingsIn(c.sources);

interface Job {
  state: CheckState;
  ctrl: AbortController;
  /** Which document it checks (a newer check of the same one stops it). */
  of: string;
  at: number;
}

const jobs = new Map<string, Job>();

/** Starts a check; its state is filled in as it goes. */
export function startCheck(db: DB, input: CheckInput, of: string, o: { fetch?: typeof fetch } = {}): CheckState {
  for (const [id, j] of jobs) {
    if (j.of === of && !j.state.done) j.ctrl.abort();
    if (Date.now() - j.at > 30 * 60_000) jobs.delete(id);
  }
  const id = crypto.randomBytes(8).toString('hex');
  const state: CheckState = { id, venue: input.venue.id, done: false, stage: 'Reading the paper', findings: [], notes: [], startedAt: Date.now() };
  const ctrl = new AbortController();
  jobs.set(id, { state, ctrl, of, at: Date.now() });
  runCheck(db, input, state, { signal: ctrl.signal, fetch: o.fetch })
    .catch((e) => {
      if (!ctrl.signal.aborted) state.error = (e as Error).message;
    })
    .finally(() => {
      state.done = true;
      state.stage = undefined;
      state.endedAt = Date.now();
    });
  return state;
}

export const checkJob = (id: string): CheckState | null => jobs.get(id)?.state ?? null;

/** Waits for a check to end (for agents). */
export async function finishedCheck(id: string, timeoutMs = 300_000): Promise<CheckState> {
  const t0 = Date.now();
  for (;;) {
    const s = checkJob(id);
    if (!s) throw new Error('The check was lost.');
    if (s.done || Date.now() - t0 > timeoutMs) return s;
    await new Promise((ok) => setTimeout(ok, 400));
  }
}

/** The document a request names (the editor's model), checked. */
function docOf(model: unknown): TexDoc {
  try {
    return normalizeTex(model);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}

// ---- for agents -----------------------------------------------------------------------------------------------------

/** A check written out for an agent: what it found, by group, with where and what to do. */
export function checkText(st: CheckState, title: string, venue: Venue): string {
  const out: string[] = [];
  const by = (l: string) => st.findings.filter((f) => f.level === l).length;
  out.push(`Checked “${title}” for ${venue.id === 'other' ? 'no venue in particular' : venue.label} (${venueSummary(venue)}).`);
  if (st.pages) out.push(`Pages: ${st.pages.total} in all${st.pages.counted !== undefined ? `, ${st.pages.counted} counted against the limit of ${st.pages.limit}` : ''}.`);
  out.push(st.findings.length ? `${by('must')} to fix, ${by('check')} to check, ${by('info')} for information.` : 'It found nothing to fix.');
  for (const g of CHECK_GROUPS) {
    const list = st.findings.filter((f) => f.group === g.id);
    if (!list.length) continue;
    out.push(`\n${g.label}:`);
    for (const f of list) {
      const where = f.file ? ` (${f.file}${f.line ? `:${f.line}` : ''})` : '';
      out.push(`- [${LEVEL_LABEL[f.level].toLowerCase()}]${where} ${f.title}.${f.detail ? ` ${f.detail}` : ''}`);
      if (f.fix?.shows) out.push(`  As listed online:\n${f.fix.shows.replace(/^/gm, '    ')}`);
      else if (f.fix) out.push(`  A safe fix: ${f.fix.label.toLowerCase()} (${f.fix.edits.length} change${f.fix.edits.length === 1 ? '' : 's'}).`);
    }
  }
  if (st.notes.length) out.push(`\nNot checked: ${st.notes.join(' ')}`);
  if (st.error) out.push(`\nThe check stopped: ${st.error}`);
  out.push('\nFix what applies with save_latex (or in the files), then check again. Online lookups can be wrong too: never change a reference on their word alone where the paper itself says otherwise.');
  return out.join('\n');
}

/** A folder's main LaTeX file: the one that starts a document, by the usual names first. */
function mainIn(dir: string): string | null {
  const PREFER = ['main.tex', 'paper.tex', 'thesis.tex', 'ms.tex', 'manuscript.tex', 'article.tex', 'report.tex'];
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => /\.(tex|ltx)$/i.test(n) && !n.startsWith('.'));
  } catch {
    return null;
  }
  const rank = (n: string) => (PREFER.includes(n.toLowerCase()) ? PREFER.indexOf(n.toLowerCase()) : PREFER.length);
  names.sort((a, b) => rank(a) - rank(b));
  for (const n of names) {
    const t = fs.readFileSync(path.join(dir, n), 'utf8').slice(0, 200_000);
    if (/\\documentclass/.test(t) && /\\begin\s*\{document\}/.test(t)) return path.join(dir, n);
  }
  return null;
}

export const LATEX_CHECK: RunTool = {
  name: 'latex_check',
  annotations: { readOnlyHint: true, openWorldHint: true },
  description: [
    'Check a LaTeX paper before it is submitted, as the LaTeX editor’s Tools → Check before submitting does, and get what it finds:',
    'references (every \\cite against the .bib: keys cited but not defined, entries never cited, the same paper twice, missing fields; each cited entry looked up online in Crossref, arXiv, OpenAlex, Semantic Scholar and DBLP: does it exist, are its authors, year and venue right, has a preprint been published since, with the entry as listed online);',
    'anonymity for anonymous venues (names the template shows, acknowledgements, \\thanks, links naming a person or lab, “our previous work” with a citation, the PDF’s Author field);',
    'format (pages counted against the venue’s limit, Type 3 and unembedded fonts, the template’s layout changed, undefined references, TODO marks, overfull lines);',
    'the parts the venue requires (ACL’s Limitations, the NeurIPS checklist, ICML’s Impact Statement…); and numbers (bold on each column’s best value, tables Experiments made worked out again from their runs, other tables traced to finished runs).',
    'Give doc (a LaTeX document of the Library) or path (a .tex file or a LaTeX project folder), and venue. It changes nothing: fix what it finds yourself (save_latex for a Library document). It takes up to a few minutes with many references.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      doc: { type: 'string', description: 'A LaTeX document of the Library: its id (get_page lists them).' },
      path: { type: 'string', description: 'Or a .tex file, or a LaTeX project’s folder, on this computer (from the session’s folder, or absolute).' },
      venue: {
        type: 'string',
        enum: VENUES.map((v) => v.id),
        description: `Where it goes (its rules: page limit, anonymity, required parts). Left out: the one its class or style points to, else other. ${VENUES.filter((v) => v.id !== 'other')
          .map((v) => `${v.id}: ${v.label}`)
          .join('; ')}.`,
      },
    },
  },
  async run(a, ctx) {
    const db = ctx.deps.db;
    let doc: TexDoc;
    let title: string;
    let input: Omit<CheckInput, 'doc' | 'venue'> = {};
    let of: string;
    if (typeof a.doc === 'string' && a.doc.trim()) {
      const p = mustPage(db, a.doc.trim());
      if (p.kind !== 'tex') throw new Error(`Page ${p.id} is not a LaTeX document.`);
      doc = readTex(pageSource(db, p.id)!.text);
      title = p.title;
      input = { project: p.space ?? null };
      of = `page:${p.id}`;
    } else if (typeof a.path === 'string' && a.path.trim()) {
      const raw = a.path.trim();
      const full = raw === '~' || raw.startsWith('~/') ? path.join(process.env.HOME ?? '', raw.slice(1)) : path.resolve(ctx.cwd || config.defaultCwd, raw);
      const st = fs.statSync(full, { throwIfNoEntry: false });
      if (!st) throw new Error(`There is no ${full}.`);
      const file = st.isDirectory() ? mainIn(full) : full;
      if (!file) throw new Error(`${full} has no .tex file that starts a document (\\documentclass … \\begin{document}).`);
      const opened = await openFile(db, file);
      doc = opened.model as TexDoc;
      title = path.basename(file);
      const folder = opened.tex?.folder;
      input = { folder: folder && opened.tex?.inFolder && texFolderOk(folder) ? folder : undefined };
      of = `file:${file}`;
    } else throw new Error('Give doc (a LaTeX document of the Library) or path (a .tex file or a project folder).');
    const venueId = typeof a.venue === 'string' && a.venue ? a.venue : (detectVenue(doc.main) ?? 'other');
    const venue = venueWith(venueId);
    const st = startCheck(db, { doc, venue, ...input }, of);
    const done = await finishedCheck(st.id);
    return checkText(done, title, venue);
  },
};

// ---- routes ---------------------------------------------------------------------------------------------------------

/**
 * The editor's check, signed in:
 *   POST /api/pages/tex/check { model, venue, other?, page?, folder?, base? } — starts one: its first state ({ id, … })
 *   GET  /api/pages/tex/check/:id — how it goes: { done, stage, findings, notes, pages, online }
 *   POST /api/pages/tex/check/:id/stop — stops it
 */
export function checkRoutes(app: FastifyInstance, db: DB) {
  app.post('/api/pages/tex/check', { bodyLimit: 24 * 1024 * 1024 }, async (req) => {
    const b = (req.body ?? {}) as { model?: unknown; venue?: unknown; other?: { pages?: unknown; anonymous?: unknown }; page?: unknown; folder?: unknown; base?: unknown };
    const doc = docOf(b.model);
    const venue = venueWith(b.venue, b.other ? { pages: Number(b.other.pages) || undefined, anonymous: b.other.anonymous === true } : undefined);
    const page = typeof b.page === 'string' && b.page ? pageInfo(db, b.page) : null;
    const folder = typeof b.folder === 'string' && b.folder ? path.resolve(b.folder) : undefined;
    const state = startCheck(db, { doc, venue, project: page?.space ?? null, folder: folder && texFolderOk(folder) ? folder : undefined, base: typeof b.base === 'string' ? b.base : undefined }, page ? `page:${page.id}` : `file:${folder ?? 'none'}`);
    return state;
  });
  app.get('/api/pages/tex/check/:id', async (req) => {
    const s = checkJob((req.params as { id: string }).id);
    if (!s) throw new HttpError(404, 'That check is no longer kept: run it again.');
    return s;
  });
  app.post('/api/pages/tex/check/:id/stop', async (req) => {
    const j = jobs.get((req.params as { id: string }).id);
    j?.ctrl.abort();
    return { ok: true };
  });
}
