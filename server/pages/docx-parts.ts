// The parts of a document's Word file for what documents gained beside their words, written and read as Word keeps
// them: footnotes (word/footnotes.xml, each a note with its number's mark), citations and the bibliography (Word's own:
// CITATION and BIBLIOGRAPHY fields over the sources in the file's bibliography part, customXml/item1.xml, which Word's
// References tab manages), cross-references (REF fields to bookmarks), numbered captions (SEQ fields), a watermark (a
// shape behind the words in the header, as Word's Design → Watermark makes one) and the page's colour.
import { XML_HEAD, esc } from './ooxml.ts';
import { all, att, isEl, kid, kids, parseXml, patt, type El } from '../documents/xml.ts';
import type { CiteStyle, Person, Source, SourceKind } from '../../shared/docs.ts';

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const B_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/bibliography';

/** A field Word works out (its instruction), showing `result` (runs' XML) until it does. */
export const fieldXml = (instr: string, result: string, rPr = '') =>
  `<w:r>${rPr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rPr}<w:instrText xml:space="preserve"> ${esc(instr)} </w:instrText></w:r><w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r>${result}<w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r>`;

/** A bookmark's name, as Word allows one: a letter or _ first, then letters, digits and _, 40 at most. */
export const bookmarkName = (id: string) => `_Ref_${id.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 40);

/** A SEQ field's name for a caption's label ("Figure", "Table"): no spaces. */
export const seqName = (label: string) => label.replace(/[^\p{L}\p{N}_]+/gu, '_').slice(0, 40) || 'Figure';

/** Words wrapped in a bookmark (the id unique in the file). */
export const bookmarked = (n: number, name: string, inner: string) => `<w:bookmarkStart w:id="${n}" w:name="${esc(name)}"/>${inner}<w:bookmarkEnd w:id="${n}"/>`;

// ---- footnotes ---------------------------------------------------------------------------------------------------------

/** word/footnotes.xml: Word's two separators, then each note (its paragraphs' runs, its number's mark first). */
export function footnotesXml(notes: { n: number; runs: string }[]): string {
  const sep = (id: number, type: string, mark: string) => `<w:footnote w:type="${type}" w:id="${id}"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r>${mark}</w:r></w:p></w:footnote>`;
  const body = notes.map(
    (x) =>
      `<w:footnote w:id="${x.n}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>${x.runs}</w:p></w:footnote>`,
  );
  return `${XML_HEAD}<w:footnotes xmlns:w="${W_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${sep(-1, 'separator', '<w:separator/>')}${sep(0, 'continuationSeparator', '<w:continuationSeparator/>')}${body.join('')}</w:footnotes>`;
}

/** A footnote's mark among the words. */
export const footnoteRefXml = (n: number) => `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${n}"/></w:r>`;

/** The styles footnotes and the bibliography use (sizes in half-points; `muted`, the notes' colour). */
export const notesStylesXml = (half: (pt: number) => number, S: number, color: string) =>
  `<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:spacing w:before="0" w:after="60" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:color w:val="${color}"/><w:sz w:val="${half(S * 0.82)}"/><w:szCs w:val="${half(S * 0.82)}"/></w:rPr></w:style>` +
  `<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Bibliography"><w:name w:val="Bibliography"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="37"/><w:unhideWhenUsed/><w:pPr><w:ind w:left="720" w:hanging="720"/></w:pPr></w:style>`;

// ---- citations and their sources ------------------------------------------------------------------------------------------

const KIND_OUT: Record<SourceKind, string> = { article: 'JournalArticle', book: 'Book', chapter: 'BookSection', conference: 'ConferenceProceedings', thesis: 'Report', report: 'Report', web: 'InternetSite', other: 'Misc' };
const KIND_IN: Record<string, SourceKind> = {
  JournalArticle: 'article',
  ArticleInAPeriodical: 'article',
  Book: 'book',
  BookSection: 'chapter',
  ConferenceProceedings: 'conference',
  Report: 'report',
  InternetSite: 'web',
  DocumentFromInternetSite: 'web',
  ElectronicSource: 'web',
  Misc: 'other',
};
const STYLE_OUT: Record<CiteStyle, [string, string]> = {
  apa: ['\\APASixthEditionOfficeOnline.xsl', 'APA'],
  mla: ['\\MLASeventhEditionOfficeOnline.xsl', 'MLA'],
  chicago: ['\\Chicago.XSL', 'Chicago'],
  ieee: ['\\IEEE2006OfficeOnline.xsl', 'IEEE'],
};

const tag = (name: string, v: string | undefined) => (v ? `<b:${name}>${esc(v)}</b:${name}>` : '');
const names = (list: Person[] | undefined, role: string) =>
  list?.length ? `<b:${role}><b:NameList>${list.map((p) => `<b:Person><b:Last>${esc(p.family)}</b:Last>${p.given ? `<b:First>${esc(p.given)}</b:First>` : ''}</b:Person>`).join('')}</b:NameList></b:${role}>` : '';

/** The file's bibliography part (customXml/item1.xml): every source, by its key as Word's tag. */
export function sourcesXml(sources: Source[], style: CiteStyle): string {
  const [sel, name] = STYLE_OUT[style];
  const one = (s: Source) =>
    `<b:Source><b:Tag>${esc(s.id)}</b:Tag><b:SourceType>${KIND_OUT[s.kind]}</b:SourceType>` +
    `<b:Author>${names(s.authors, 'Author')}${names(s.editors, 'Editor')}</b:Author>` +
    tag('Title', s.title) +
    tag(s.kind === 'article' ? 'JournalName' : s.kind === 'chapter' ? 'BookTitle' : s.kind === 'conference' ? 'ConferenceName' : s.kind === 'web' ? 'InternetSiteTitle' : 'Comments', s.in) +
    tag('Year', s.year) +
    tag('Volume', s.volume) +
    tag('Issue', s.issue) +
    tag('Pages', s.pages) +
    tag(s.kind === 'thesis' || s.kind === 'report' ? 'Institution' : 'Publisher', s.publisher) +
    tag('DOI', s.doi) +
    tag('URL', s.url ?? (s.doi ? `https://doi.org/${s.doi}` : undefined)) +
    (s.kind === 'thesis' ? '<b:ThesisType>Doctoral dissertation</b:ThesisType>' : '') +
    (s.accessed ? `${tag('YearAccessed', s.accessed.slice(0, 4))}${tag('MonthAccessed', s.accessed.slice(5, 7))}${tag('DayAccessed', s.accessed.slice(8, 10))}` : '') +
    '</b:Source>';
  return `${XML_HEAD}<b:Sources xmlns:b="${B_NS}" xmlns="${B_NS}" SelectedStyle="${sel}" StyleName="${name}" Version="6">${sources.map(one).join('')}</b:Sources>`;
}

/** The bibliography part's properties (Word finds it by this). */
export const sourcesPropsXml = () =>
  `${XML_HEAD}<ds:datastoreItem ds:itemID="{8B2F7A8E-5C1D-4F2A-9E1B-3D6C7A0B4E21}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${B_NS}"/></ds:schemaRefs></ds:datastoreItem>`;

/** A citation as Word keeps one: a CITATION field (its sources by their tags, the first's page), in a citation's box. */
export function citationXml(items: { key: string; loc?: string }[], result: string, n: number): string {
  const [first, ...more] = items;
  const loc = first.loc ? ` \\p ${first.loc.replace(/^(pp?\.|pages?)\s*/i, '').replace(/[\\"]/g, '')}` : '';
  const instr = `CITATION ${first.key} \\l 1033${loc}${more.map((x) => ` \\m ${x.key}`).join('')}`;
  return `<w:sdt><w:sdtPr><w:id w:val="${-900000 - n}"/><w:citation/></w:sdtPr><w:sdtContent>${fieldXml(instr, result)}</w:sdtContent></w:sdt>`;
}

/** Sources from a Word file's bibliography part (Word's own, or this app's): null when the part is none. */
export function sourcesFromXml(xml: string): Source[] | null {
  let root: El;
  try {
    root = parseXml(xml).root;
  } catch {
    return null;
  }
  if (root.n !== 'Sources') return null;
  const text = (el: El | undefined) => (el ? el.c.map((x) => (typeof x === 'string' ? x : isEl(x) ? text(x) : '')).join('').trim() : '');
  const people = (el: El | undefined): Person[] =>
    all(el, 'Person').flatMap((p) => {
      const family = text(kid(p, 'Last'));
      const given = [text(kid(p, 'First')), text(kid(p, 'Middle'))].filter(Boolean).join(' ');
      return family ? [given ? { family, given } : { family }] : [];
    });
  const out: Source[] = [];
  for (const s of kids(root, 'Source')) {
    const id = text(kid(s, 'Tag'));
    const title = text(kid(s, 'Title'));
    if (!id || !title) continue;
    const kind = KIND_IN[text(kid(s, 'SourceType'))] ?? 'other';
    const au = kid(s, 'Author');
    const src: Source = { id, kind: text(kid(s, 'ThesisType')) ? 'thesis' : kind, title };
    const authors = people(kid(au, 'Author'));
    if (authors.length) src.authors = authors;
    else {
      // An organisation as the author: a name of its own.
      const corp = text(kid(kid(au, 'Author'), 'Corporate'));
      if (corp) src.authors = [{ family: corp }];
    }
    const editors = people(kid(au, 'Editor'));
    if (editors.length) src.editors = editors;
    const where = text(kid(s, 'JournalName')) || text(kid(s, 'BookTitle')) || text(kid(s, 'ConferenceName')) || text(kid(s, 'InternetSiteTitle')) || text(kid(s, 'PeriodicalTitle'));
    if (where) src.in = where;
    for (const [k, n] of [
      ['year', 'Year'],
      ['volume', 'Volume'],
      ['issue', 'Issue'],
      ['pages', 'Pages'],
    ] as const) {
      const v = text(kid(s, n));
      if (v) src[k] = v;
    }
    const pub = text(kid(s, 'Publisher')) || text(kid(s, 'Institution'));
    if (pub) src.publisher = pub;
    const doi = text(kid(s, 'DOI')).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    if (/^10\.\d{4,9}\/\S+$/.test(doi)) src.doi = doi;
    const url = text(kid(s, 'URL'));
    if (/^https?:\/\/\S+$/i.test(url) && !(src.doi && url.includes(src.doi))) src.url = url;
    const y = text(kid(s, 'YearAccessed'));
    if (y) src.accessed = [y, text(kid(s, 'MonthAccessed')), text(kid(s, 'DayAccessed'))].filter(Boolean).join('-');
    out.push(src);
  }
  return out;
}

/** What a CITATION field cites: its sources' tags, and the first one's page (\p). */
export function citationOf(instr: string): { key: string; loc?: string }[] {
  const m = /^\s*CITATION\s+(\S+)([\s\S]*)$/i.exec(instr);
  if (!m) return [];
  const out: { key: string; loc?: string }[] = [{ key: m[1] }];
  const page = /\\p\s+("[^"]*"|\S+)/.exec(m[2]);
  if (page) out[0].loc = `p. ${page[1].replace(/"/g, '')}`;
  for (const x of m[2].matchAll(/\\m\s+(\S+)/g)) out.push({ key: x[1] });
  return out;
}

// ---- a watermark ---------------------------------------------------------------------------------------------------------

/** VML's shape types for words along a path and a picture (Word draws its watermarks with them). */
const TEXT_TYPE =
  '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/><v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>';
const PICTURE_TYPE =
  '<v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f"><v:stroke joinstyle="miter"/><v:formulas><v:f eqn="if lineDrawn pixelLineWidth 0"/><v:f eqn="sum @0 1 0"/><v:f eqn="sum 0 0 @1"/><v:f eqn="prod @2 1 2"/><v:f eqn="prod @3 21600 pixelWidth"/><v:f eqn="prod @3 21600 pixelHeight"/><v:f eqn="sum @0 0 1"/><v:f eqn="prod @6 1 2"/><v:f eqn="prod @7 21600 pixelWidth"/><v:f eqn="sum @8 21600 0"/><v:f eqn="prod @7 21600 pixelHeight"/><v:f eqn="sum @10 21600 0"/></v:formulas><v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/><o:lock v:ext="edit" aspectratio="t"/></v:shapetype>';

/** A watermark across the middle of the page, as a run of the header (`textW`: the text's width in points; a picture by its relationship's id and size in points). */
export function watermarkRun(o: { text?: string; pic?: { rid: string; w: number; h: number } }, textW: number): string {
  const pos = 'position:absolute;margin-left:0;margin-top:0;z-index:-251657216;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin';
  if (o.pic) {
    const k = Math.min(1, (textW * 0.6) / o.pic.w);
    return `<w:r><w:rPr><w:noProof/></w:rPr><w:pict>${PICTURE_TYPE}<v:shape id="WordPictureWatermark1" o:spid="_x0000_s2050" type="#_x0000_t75" style="${pos};width:${Math.round(o.pic.w * k)}pt;height:${Math.round(o.pic.h * k)}pt" o:allowincell="f"><v:imagedata r:id="${o.pic.rid}" o:title="" gain="19661f" blacklevel="22938f"/></v:shape></w:pict></w:r>`;
  }
  const text = (o.text ?? '').slice(0, 60);
  const w = Math.round(Math.min(textW, Math.max(120, text.length * 60)));
  const h = Math.round(w / Math.max(2.2, text.length * 0.62));
  return `<w:r><w:rPr><w:noProof/></w:rPr><w:pict>${TEXT_TYPE}<v:shape id="PowerPlusWaterMarkObject1" o:spid="_x0000_s2049" type="#_x0000_t136" style="${pos};width:${w}pt;height:${h}pt;rotation:315" o:allowincell="f" fillcolor="silver" stroked="f"><v:fill opacity=".5"/><v:textpath style="font-family:&quot;Arial&quot;;font-size:1pt" string="${esc(text)}"/></v:shape></w:pict></w:r>`;
}

/** A Word file's watermark, from a header part: its words, or its picture's relationship id. */
export function watermarkOf(xml: string): { text?: string; rid?: string } | null {
  const root = parseXml(xml).root;
  for (const sh of all(root, 'shape')) {
    const id = `${att(sh, 'id') ?? ''}`;
    const tp = kid(sh, 'textpath');
    if (tp && /watermark/i.test(id)) {
      const s = (att(tp, 'string') ?? '').trim();
      if (s) return { text: s.slice(0, 60) };
    }
    const img = kid(sh, 'imagedata');
    if (img && /watermark/i.test(id)) {
      const rid = patt(img, 'id');
      if (rid) return { rid };
    }
  }
  return null;
}
