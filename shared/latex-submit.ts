// A paper before it goes out: the venues the LaTeX editor's Check before submitting knows (each with its page limit,
// whether the references count, whether reviewing is anonymous, the parts it requires, what its final version
// changes, and where its call for papers is), what the check finds (by group, each with how serious it is, where it
// is, and a safe fix or a request for the agent), and the venue a document's own class or style points to. Venues
// change their rules every year: the presets hold the latest known ones, and the dialog links to each call.

export type CheckGroup = 'refs' | 'anon' | 'format' | 'parts' | 'numbers';
export type CheckLevel = 'must' | 'check' | 'info';

export const CHECK_GROUPS: { id: CheckGroup; label: string }[] = [
  { id: 'refs', label: 'References' },
  { id: 'anon', label: 'Anonymity' },
  { id: 'format', label: 'Format' },
  { id: 'parts', label: 'Required parts' },
  { id: 'numbers', label: 'Numbers' },
];

export const LEVEL_LABEL: Record<CheckLevel, string> = { must: 'Must fix', check: 'Check it', info: 'For your information' };

/** A change to one of the document's files: the text at [from, to) (`was`, so it is not made when that changed since) becomes `text`. */
export interface CheckEdit {
  file: string;
  from: number;
  to: number;
  was: string;
  text: string;
}

export interface CheckFinding {
  /** The same for the same problem from one check to the next (not by its line, which moves). */
  id: string;
  group: CheckGroup;
  level: CheckLevel;
  /** What is wrong, in a line. */
  title: string;
  /** More: what the services said, what to do. */
  detail?: string;
  /** Where it is: a file of the document, its line, and the words it is on ([from, to) in the file's text). */
  file?: string;
  line?: number;
  from?: number;
  to?: number;
  /** The words at [from, to) when it was found: where it is found again once the text moved. */
  quote?: string;
  /** A safe change that fixes it, and what it puts in (a reference's entry) to look at first. */
  fix?: { label: string; edits: CheckEdit[]; shows?: string };
  /** Where there is no safe fix: what to ask the agent beside the editor. */
  ask?: string;
}

/** A check as it goes (GET /api/pages/tex/check/:id), and once it is done. */
export interface CheckState {
  id: string;
  venue: string;
  done: boolean;
  /** What it is doing now, in a few words. */
  stage?: string;
  findings: CheckFinding[];
  /** What could not be checked, and why (a service that did not answer, a program that is not installed). */
  notes: string[];
  /** The pages: in all, and those that count toward the venue's limit (when it has one). */
  pages?: { total: number; counted?: number; limit?: number };
  /** The references looked up online so far, of how many. */
  online?: { done: number; of: number };
  startedAt: number;
  endedAt?: number;
  error?: string;
}

/** The templates the check knows the anonymous and final versions of. */
export type PaperTemplate = 'acl' | 'acmart' | 'neurips' | 'iclr' | 'icml' | 'aaai' | 'ieeetran' | 'llncs';

/** A part a venue wants in the PDF: found by its heading (or a command or environment), and how serious its absence is. */
export interface VenuePart {
  id: string;
  /** Its name as the finding says it: "a Limitations section". */
  label: string;
  /** What finds it in the source, as a regular expression over the headings' titles (case not counted). */
  heading?: string;
  /** Or over the source without its comments (commands, environments). */
  source?: string;
  level: CheckLevel;
  /** Asked for in the final version only. */
  final?: boolean;
  /** One line on why, or where it goes. */
  why?: string;
}

export interface Venue {
  id: string;
  label: string;
  /** Its short name, in requests and comments: "ARR", "SIGIR". */
  short: string;
  group: string;
  /** Pages of content allowed at submission, and in the final version (none: no limit). */
  pages?: number;
  finalPages?: number;
  /** The references count toward the limit. */
  refsCount?: boolean;
  /** The most pages the references may take, and the most pages in all (content, references and appendices). */
  refsMax?: number;
  totalMax?: number;
  /** Headings after the main text that do not count toward the limit either: the count stops at the first of them. */
  freeHeadings?: string[];
  anonymous: boolean;
  template?: PaperTemplate;
  parts: VenuePart[];
  /** Where its call for papers is (the rules change each year). */
  call: string;
  /** Where its template's files are. */
  kit?: string;
  /** What its final version changes, for the agent asked to make it camera-ready. */
  final: string;
  /** What the limit leaves out, in words, under the picker. */
  note?: string;
}

const ABSTRACT: VenuePart = { id: 'abstract', label: 'an abstract', source: '\\\\begin\\s*\\{abstract\\}|\\\\abstract\\s*\\{', level: 'must' };
const LIMITATIONS: VenuePart = {
  id: 'limitations',
  label: 'a Limitations section',
  heading: '^limitations$',
  level: 'must',
  why: 'ACL venues desk-reject papers without a section called Limitations; it goes after the conclusion, before the references, and does not count toward the pages.',
};
const ccs = (level: CheckLevel, final: boolean, why: string): VenuePart[] => [
  { id: 'ccs', label: 'the ACM CCS concepts (\\ccsdesc)', source: '\\\\ccsdesc\\s*(\\[|\\{)|\\\\begin\\s*\\{CCSXML\\}', level, final, why },
  { id: 'keywords', label: 'keywords (\\keywords)', source: '\\\\keywords\\s*\\{', level, final, why },
];
/** A heading's words for each part some venues do not count toward the pages. */
const FREE = {
  limitations: 'limitations',
  ethics: 'ethic(s|al)( statement| considerations| implications)?|ethical considerations',
  impact: '(broader )?impact statement|broader impacts?',
  acks: 'acknowledge?ments?( and disclosure of funding)?',
  appendix: 'appendi(x|ces)|technical appendices( and supplementary material)?',
  checklist: '(neurips )?paper checklist',
  repro: 'reproducibility statement',
  ai: '(statement on |declaration of )?(ai|llm|large language model)s? (use|usage)( statement| disclosure)?|use of (ai|llms?|large language models)',
  genai: '(gen(erative)? ?ai) (usage )?disclosure',
};

const ARR = {
  group: 'Natural language processing',
  freeHeadings: [FREE.limitations, FREE.ethics, FREE.acks, FREE.appendix],
  anonymous: true,
  template: 'acl' as PaperTemplate,
  parts: [ABSTRACT, LIMITATIONS],
  call: 'https://aclrollingreview.org/cfp',
  kit: 'https://github.com/acl-org/acl-style-files',
  final:
    'switch the style to its final version (\\usepackage[final]{acl}, not [review]) so the authors show; put back the authors, their affiliations and e-mail addresses; put back the acknowledgements (where help from AI assistants with writing or code is described too); keep the Limitations section (it does not count toward the pages); the final version may use one more page of content than the review version',
  note: 'Not counted: references, the Limitations section, an ethics section, acknowledgements and appendices.',
};

const ACM_FINAL =
  'take anonymous (and review) out of the \\documentclass options of acmart; put back every author with \\author, \\affiliation and \\email; put back the acknowledgements (the acks environment); add the CCS concepts (\\ccsdesc, from dl.acm.org/ccs) and \\keywords if they are not there; fill in the rights block ACM sends after the rights form (\\setcopyright, \\acmDOI, \\acmISBN, \\acmConference, \\acmYear, \\copyrightyear) exactly as it comes';

/** The venues, in the order the picker shows them (rules as of their latest call: November 2026). */
export const VENUES: Venue[] = [
  { id: 'arr-long', label: 'ACL Rolling Review, long paper', short: 'ARR', pages: 8, finalPages: 9, ...ARR },
  { id: 'arr-short', label: 'ACL Rolling Review, short paper', short: 'ARR', pages: 4, finalPages: 5, ...ARR },
  { id: 'emnlp-long', label: 'EMNLP (through ARR), long paper', short: 'EMNLP', pages: 8, finalPages: 9, ...ARR, note: `ARR’s rules. ${ARR.note}` },
  { id: 'emnlp-short', label: 'EMNLP (through ARR), short paper', short: 'EMNLP', pages: 4, finalPages: 5, ...ARR, note: `ARR’s rules. ${ARR.note}` },
  { id: 'naacl-long', label: 'NAACL (through ARR), long paper', short: 'NAACL', pages: 8, finalPages: 9, ...ARR, note: `ARR’s rules. ${ARR.note}` },
  { id: 'naacl-short', label: 'NAACL (through ARR), short paper', short: 'NAACL', pages: 4, finalPages: 5, ...ARR, note: `ARR’s rules. ${ARR.note}` },
  {
    id: 'sigir-full',
    label: 'SIGIR, full paper',
    short: 'SIGIR',
    group: 'Information retrieval, data and the web',
    pages: 9,
    finalPages: 10,
    anonymous: true,
    template: 'acmart',
    parts: [ABSTRACT, ...ccs('must', false, 'SIGIR asks for them in the paper it reviews.')],
    call: 'https://sigir2027.org/pages/submit-full.html',
    kit: 'https://www.acm.org/publications/proceedings-template',
    final: ACM_FINAL,
    note: 'Not counted: references only (appendices and acknowledgements count).',
  },
  {
    id: 'sigir-short',
    label: 'SIGIR, short paper',
    short: 'SIGIR',
    group: 'Information retrieval, data and the web',
    pages: 4,
    anonymous: true,
    template: 'acmart',
    parts: [ABSTRACT, ...ccs('check', false, 'SIGIR asked for them in the papers it reviewed last year.')],
    call: 'https://sigir2027.org/pages/submit-short.html',
    kit: 'https://www.acm.org/publications/proceedings-template',
    final: ACM_FINAL,
    note: 'Not counted: references only (last year’s rules: this year’s call was not out yet).',
  },
  {
    id: 'cikm',
    label: 'CIKM, full paper',
    short: 'CIKM',
    group: 'Information retrieval, data and the web',
    pages: 10,
    finalPages: 10,
    refsMax: 2,
    freeHeadings: [FREE.genai],
    anonymous: true,
    template: 'acmart',
    parts: [
      ABSTRACT,
      { id: 'genai', label: 'a GenAI Usage Disclosure section', heading: FREE.genai, level: 'must', why: 'CIKM asks every paper for one, after the main text and appendices, just before the references; it does not count toward the pages.' },
      ...ccs('check', true, 'ACM asks for them in the final version.'),
    ],
    call: 'https://cikm2026.diag.uniroma1.it/full-research-papers/',
    kit: 'https://www.acm.org/publications/proceedings-template',
    final: `${ACM_FINAL}; keep the GenAI Usage Disclosure section`,
    note: 'Appendices count. Not counted: references (up to two pages) and the GenAI disclosure.',
  },
  {
    id: 'wsdm',
    label: 'WSDM',
    short: 'WSDM',
    group: 'Information retrieval, data and the web',
    pages: 9,
    finalPages: 9,
    freeHeadings: [FREE.ethics],
    anonymous: true,
    template: 'acmart',
    parts: [
      ABSTRACT,
      { id: 'ethics', label: 'a section on ethical considerations', heading: FREE.ethics, level: 'check', why: 'WSDM asks papers to include one, before the references; it does not count toward the pages.' },
      ...ccs('check', true, 'ACM asks for them in the final version.'),
    ],
    call: 'https://wsdm-conference.org/2027/cffp.html',
    kit: 'https://www.acm.org/publications/proceedings-template',
    final: ACM_FINAL,
    note: 'Appendices count. Not counted: references and the section on ethical considerations.',
  },
  {
    id: 'www',
    label: 'TheWebConf (WWW), research track',
    short: 'TheWebConf',
    group: 'Information retrieval, data and the web',
    pages: 8,
    finalPages: 8,
    totalMax: 12,
    freeHeadings: [FREE.appendix],
    anonymous: true,
    template: 'acmart',
    parts: [ABSTRACT, ...ccs('check', true, 'ACM asks for them in the final version.')],
    call: 'https://www2027.thewebconf.org/research-track-papers/',
    kit: 'https://www.acm.org/publications/proceedings-template',
    final: `${ACM_FINAL}; the final version is at most 12 pages, 8 of them content`,
    note: 'Not counted: references and an appendix, but all of it in 12 pages. The first page must say how the work bears on the Web and the track.',
  },
  {
    id: 'kdd',
    label: 'KDD, research track',
    short: 'KDD',
    group: 'Information retrieval, data and the web',
    pages: 8,
    finalPages: 9,
    freeHeadings: [FREE.appendix],
    anonymous: true,
    template: 'acmart',
    parts: [ABSTRACT, ...ccs('check', true, 'ACM asks for them in the final version.')],
    call: 'https://kdd2027.kdd.org/research-track-call-for-papers/',
    kit: 'https://www.acm.org/publications/proceedings-template',
    final: `${ACM_FINAL}; the final version has 9 pages of content, and references and appendices on at most 3 more`,
    note: 'Not counted: references and appendices.',
  },
  {
    id: 'neurips',
    label: 'NeurIPS',
    short: 'NeurIPS',
    group: 'Machine learning and AI',
    pages: 9,
    finalPages: 10,
    freeHeadings: [FREE.acks, FREE.checklist, FREE.appendix],
    anonymous: true,
    template: 'neurips',
    parts: [
      ABSTRACT,
      {
        id: 'checklist',
        label: 'the NeurIPS Paper Checklist',
        heading: FREE.checklist,
        source: '\\\\answer(Yes|No|NA)\\b',
        level: 'must',
        why: 'Papers without it are desk-rejected; it goes after the references and appendices, and does not count toward the pages.',
      },
    ],
    call: 'https://neurips.cc/Conferences/2026/CallForPapers',
    kit: 'https://neurips.cc/Conferences/2026/CallForPapers',
    final:
      'switch the style to its final version (\\usepackage[main, final]{neurips_…}) so the authors show; put back the authors and affiliations; put back the acknowledgements with the disclosure of funding and competing interests (the ack environment); the final version may use one more page of content; keep the checklist',
    note: 'Not counted: references, acknowledgements, the checklist and appendices. The PDF may be 50 MB at most.',
  },
  {
    id: 'iclr',
    label: 'ICLR',
    short: 'ICLR',
    group: 'Machine learning and AI',
    pages: 9,
    finalPages: 10,
    freeHeadings: [FREE.ethics, FREE.repro, FREE.ai, FREE.acks, FREE.appendix],
    anonymous: true,
    template: 'iclr',
    parts: [
      ABSTRACT,
      { id: 'ai', label: 'an AI use statement', heading: FREE.ai, level: 'must', why: 'ICLR asks every paper to say how AI was used; it goes after the main text and does not count toward the pages.' },
      { id: 'ethics', label: 'an ethics statement', heading: FREE.ethics, level: 'info', why: 'ICLR recommends one (a page at most), after the main text; it does not count toward the pages.' },
      { id: 'repro', label: 'a reproducibility statement', heading: FREE.repro, level: 'info', why: 'ICLR recommends one, after the main text; it does not count toward the pages.' },
    ],
    call: 'https://iclr.cc/Conferences/2027/CallForPapers',
    kit: 'https://github.com/ICLR/Master-Template',
    final:
      'turn on the final version with \\iclrfinalcopy (uncomment it, before \\begin{document}) so the authors show and the line numbers go; put back the authors and affiliations; put back the acknowledgements; the final version may use one more page of content',
    note: 'Not counted: references, appendices, the ethics, reproducibility and AI use statements, and acknowledgements.',
  },
  {
    id: 'icml',
    label: 'ICML',
    short: 'ICML',
    group: 'Machine learning and AI',
    pages: 8,
    finalPages: 9,
    freeHeadings: [FREE.impact, FREE.acks, FREE.appendix],
    anonymous: true,
    template: 'icml',
    parts: [ABSTRACT, { id: 'impact', label: 'an Impact Statement', heading: FREE.impact, level: 'must', why: 'ICML asks every paper for one (unnumbered), at the end before the references; it does not count toward the pages.' }],
    call: 'https://icml.cc/Conferences/2026/CallForPapers',
    kit: 'https://icml.cc/Conferences/2026/AuthorInstructions',
    final:
      'turn on the final version (\\usepackage[accepted]{icml…}) so the authors show; put back the authors and affiliations (\\icmlauthor, \\icmlaffiliation, \\icmlcorrespondingauthor); put back the acknowledgements; the final version may use one more page of content; keep the Impact Statement',
    note: 'Last year’s rules (this year’s call was not out yet). Not counted: references, the Impact Statement, acknowledgements and appendices.',
  },
  {
    id: 'aaai',
    label: 'AAAI',
    short: 'AAAI',
    group: 'Machine learning and AI',
    pages: 7,
    finalPages: 7,
    refsMax: 2,
    anonymous: true,
    template: 'aaai',
    parts: [ABSTRACT],
    call: 'https://aaai.org/conference/aaai/',
    kit: 'https://aaai.org/authorkit27/',
    final:
      'take the submission option out of the AAAI style (\\usepackage{aaai…} without [submission]) so the authors show; put back the authors and their affiliations (\\author and \\affiliations); put back the acknowledgements, with the references on up to two pages after the seven of content; more pages can be bought, as AAAI says',
    note: 'Not counted: references, on up to two more pages. Appendices go in a separate file; the reproducibility checklist goes in the submission form. pdfLaTeX only.',
  },
  {
    id: 'ieee',
    label: 'An IEEE journal',
    short: 'IEEE',
    group: 'Journals',
    anonymous: false,
    template: 'ieeetran',
    parts: [ABSTRACT, { id: 'index', label: 'Index Terms (the IEEEkeywords environment)', source: '\\\\begin\\s*\\{IEEEkeywords\\}', level: 'must', why: 'IEEE asks every article for them, as the last part of the abstract.' }],
    call: 'https://journals.ieeeauthorcenter.ieee.org/',
    kit: 'https://www.ieee.org/conferences/publishing/templates.html',
    final: 'use IEEEtran in its journal mode (compsoc for the Computer Society’s journals); put the authors’ biographies and photos (IEEEbiography) at the end if the journal asks; follow the journal’s page limit; fill in the copyright notice IEEE sends',
    note: 'Each journal sets its own limit (often 12 pages, references included). Most review single-blind: pick Other with Anonymous for one that does not.',
  },
  {
    id: 'acm',
    label: 'An ACM journal',
    short: 'ACM',
    group: 'Journals',
    anonymous: false,
    template: 'acmart',
    parts: [ABSTRACT, ...ccs('must', false, 'ACM asks for them in every article over two pages.')],
    call: 'https://www.acm.org/publications/authors/submissions',
    kit: 'https://www.acm.org/publications/proceedings-template',
    final: 'use acmart’s journal format (acmsmall, or what the journal says) without review; put back the authors; keep the CCS concepts and keywords; fill in the rights block ACM sends after the rights form',
    note: 'Each journal says how long. Most review single-blind: pick Other with Anonymous for one that does not.',
  },
  {
    id: 'other',
    label: 'Other',
    short: '',
    group: 'Other',
    anonymous: false,
    parts: [ABSTRACT],
    call: '',
    final: 'switch the template to its final version so the authors show; put back the authors, their affiliations and the acknowledgements; follow the venue’s instructions for the final version',
  },
];

export const venueById = (id: unknown): Venue => VENUES.find((v) => v.id === id) ?? VENUES[VENUES.length - 1];

/** Other's own rules, as the dialog sets them. */
export interface OtherRules {
  pages?: number;
  anonymous?: boolean;
}

/** A venue with Other's rules put in. */
export function venueWith(id: unknown, other?: OtherRules): Venue {
  const v = venueById(id);
  if (v.id !== 'other' || !other) return v;
  const pages = typeof other.pages === 'number' && other.pages > 0 && other.pages < 200 ? Math.round(other.pages) : undefined;
  return { ...v, pages, finalPages: pages, anonymous: !!other.anonymous };
}

/** What a venue asks, in a line under the picker. */
export function venueSummary(v: Venue): string {
  const parts: string[] = [];
  if (v.pages) parts.push(`${v.pages} pages${v.refsCount ? ' with the references' : ' before the references'}${v.finalPages && v.finalPages !== v.pages ? ` (${v.finalPages} in the final version)` : ''}`);
  else parts.push('no page limit');
  parts.push(v.anonymous ? 'anonymous' : 'not anonymous');
  const must = v.parts.filter((p) => p.level === 'must' && !p.final && p.id !== 'abstract');
  if (must.length) parts.push(`${must.map((p) => p.label).join(' and ')} required`);
  return parts.join(' · ');
}

/** The source without its comments, roughly (a % no backslash escapes, to the line's end): enough to read a preamble. */
const preamble = (main: string) =>
  main
    .slice(0, 60_000)
    .split('\n')
    .map((l) => l.replace(/(^|[^\\])%.*$/, '$1'))
    .join('\n');

/** The venue a document's class, style and ACM conference lines point to, or null. */
export function detectVenue(main: string): string | null {
  const s = preamble(main);
  const pkg = (re: string) => new RegExp(`\\\\usepackage\\s*(\\[[^\\]]*\\])?\\s*\\{[^}]*\\b(${re})\\b[^}]*\\}`).test(s);
  if (pkg('acl|acl\\d{4}|naaclhlt\\d{4}|emnlp\\d{4}')) return /\\usepackage\s*(\[[^\]]*\])?\s*\{\s*(emnlp)/i.test(s) ? 'emnlp-long' : /\{\s*naacl/i.test(s) ? 'naacl-long' : 'arr-long';
  if (pkg('neurips_\\d{4}|nips_\\d{4}')) return 'neurips';
  if (pkg('iclr\\d{4}_conference')) return 'iclr';
  if (pkg('icml\\d{4}')) return 'icml';
  if (pkg('aaai\\d{2,4}')) return 'aaai';
  const cls = /\\documentclass\s*(\[[^\]]*\])?\s*\{\s*([^}\s]+)\s*\}/.exec(s);
  if (cls?.[2] === 'IEEEtran') return 'ieee';
  if (cls?.[2] === 'acmart') {
    const opts = cls[1] ?? '';
    const conf = /\\acm(Conference|BookTitle|Booktitle)\s*(\[[^\]]*\])?\s*\{([^}]*)\}/.exec(s)?.[3] ?? '';
    if (/\bSIGIR\b/i.test(conf)) return /short/i.test(s.slice(0, 4000)) ? 'sigir-short' : 'sigir-full';
    if (/\bCIKM\b/i.test(conf)) return 'cikm';
    if (/\bWSDM\b/i.test(conf)) return 'wsdm';
    if (/\bWWW\b|Web Conference|TheWebConf/i.test(conf)) return 'www';
    if (/\bKDD\b/i.test(conf)) return 'kdd';
    if (/acmsmall|acmlarge|acmtog/.test(opts)) return 'acm';
    return null;
  }
  return null;
}

/** The address of a ready-made app's page with its paper filled in (the plan's contract with the apps that take a paper). */
export const paperAppPath = (app: string, paper: string) => `/apps/tpl:${encodeURIComponent(app)}?in.paper=${encodeURIComponent(paper)}`;

/** The ready-made apps the LaTeX editor's Tools → Your paper opens, with what each is given: the PDF, or the project's folder. */
export const PAPER_APPS: { id: string; label: string; takes: 'pdf' | 'folder' }[] = [
  { id: 'reviewer-simulator', label: 'Review it as reviewers would', takes: 'pdf' },
  { id: 'rebuttal-workbench', label: 'Answer reviews', takes: 'pdf' },
  { id: 'paper-to-talk', label: 'Make a talk, poster and thread', takes: 'folder' },
];

// ---- the arXiv package ---------------------------------------------------------------------------------------------

export interface ArxivOptions {
  /** Comments out (arXiv publishes the source as it is sent). */
  strip: boolean;
  /** \iffalse … \fi blocks out too. */
  iffalse: boolean;
  /** Only the files the paper uses. */
  unused: boolean;
  /** The .bbl of the last typesetting in, the .bib out. */
  bbl: boolean;
  /** \pdfoutput=1 first (arXiv's old way of telling pdfLaTeX). */
  pdfoutput: boolean;
  /** \input and \include written into main.tex. */
  flatten: boolean;
}

/** What the arXiv package's dialog offers, in its order, and what each starts as. */
export const ARXIV_OPTIONS: { id: keyof ArxivOptions; label: string; hint: string; on: boolean }[] = [
  { id: 'strip', label: 'Take out the comments', hint: 'arXiv publishes the source as you send it. \\% and comments in verbatim text, listings and addresses stay.', on: true },
  { id: 'iffalse', label: 'Take out \\iffalse … \\fi blocks too', hint: 'Text you switched off that way.', on: false },
  { id: 'unused', label: 'Only the files the paper uses', hint: 'The pictures \\includegraphics shows, the files it reads, its own styles and classes.', on: true },
  { id: 'bbl', label: 'Add the .bbl and leave the .bib out', hint: 'The bibliography as it was typeset here. Untick to send the .bib and let arXiv run BibTeX.', on: true },
  { id: 'flatten', label: 'Put \\input and \\include files into main.tex', hint: 'One file instead of several.', on: false },
  { id: 'pdfoutput', label: 'Put \\pdfoutput=1 first', hint: 'Only for arXiv’s old submission system: now you pick pdfLaTeX when you submit.', on: false },
];

export const ARXIV_DEFAULTS = Object.fromEntries(ARXIV_OPTIONS.map((o) => [o.id, o.on])) as unknown as ArxivOptions;

/** What a package holds, what was left out on the way, and how it typeset (POST /api/pages/tex/arxiv). */
export interface ArxivPackage {
  /** Its download: GET /api/pages/tex/arxiv/<token>. */
  token: string;
  name: string;
  /** The .zip's size, and its files' sizes unpacked. */
  bytes: number;
  files: { name: string; bytes: number }[];
  /** What was taken out or left out, in words. */
  removed: string[];
  renamed: [from: string, to: string][];
  compiled: { ok: boolean; pages: number; errors: { file?: string; line?: number; message: string }[]; missing?: string };
  /** What to know before uploading it. */
  warnings: string[];
}
