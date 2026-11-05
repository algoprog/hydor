// Ready-made apps for reading, writing and presenting papers: a reading list kept in step with Zotero (records and a page
// of its own to work in), a literature matrix kept as a spreadsheet of the Library, reproducing a paper's results, a
// review of your draft on a venue's own form, a rebuttal drafted point by point, a talk, a poster, a thread and a project
// page from a paper, and figures fit for the paper. A paper comes in one way everywhere: `paper` (a link, an arXiv id or a
// DOI, a title, or a PDF, a .tex file or a LaTeX project's folder on this computer) and, where it fits, `upload` (a file);
// read_paper finds it and reads it from an open copy (server/papers). Each step is the cheapest that does its part well:
// a program for what must come out exact (budgets, lengths, tables, differences), a model to read and write, a tool to
// find, read, keep and save, and an agent where a session's tools and judgement are needed (cloning code and running it,
// making slides and a poster from the paper's own figures, fixing plotting scripts). Their views are in views-papers.ts.
//
// The programs are JavaScript as the code steps show them: String.raw keeps their backslashes as written, so none of
// them uses a backtick or a template literal.
import type { AnswerField, AppTemplate } from '../../shared/apps.ts';
import { VENUE_NAMES, VENUES } from '../../shared/venues.ts';

type Draft = Omit<AppTemplate, 'agent' | 'tools' | 'limits'>;

/** An Ask a person step's rule: the form's yes/no says to ask, and someone is there (the form, a test, or a session whose agent ran it). */
const someoneThere = (field: string) => `{{${field}}} and {{run.source}} = web or {{${field}}} and {{run.source}} = test or {{${field}}} and {{run.source}} = session`;

// ---- what the programs share ----------------------------------------------------------------------------------

/** A value as a list: as it is, from the JSON an agent handed in, or from lines of text; rows: the objects in it. */
const LIST = String.raw`function list(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && /^\s*\[/.test(v)) {
    try {
      const x = JSON.parse(v);
      if (Array.isArray(x)) return x;
    } catch (e) {}
  }
  if (typeof v === 'string') return v.split('\n').map((l) => l.replace(/^\s*(?:[-*•]\s*|\d+[.)]\s+)/, '').trim()).filter(Boolean);
  return [];
}
function rows(v) {
  return list(v).filter((x) => x && typeof x === 'object' && !Array.isArray(x));
}
function obj(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string' && /^\s*\{/.test(v)) {
    try {
      return JSON.parse(v);
    } catch (e) {}
  }
  return {};
}
`;

/** A paper's text as a model step takes it: its parts, each a value of its own (at most 20,000 characters go in). */
const paperParts = (step: string, n = 5) =>
  Array.from({ length: n }, (_, i) => `{{${step}.data.parts[${i}]}}`).join('\n');

/** The fields of a paper as the Reading list keeps it. */
const PAPER_FIELDS: AnswerField[] = [
  { id: 'title', label: 'Title', type: 'text' },
  { id: 'authors', label: 'Authors', type: 'text' },
  { id: 'year', label: 'Year', type: 'number' },
  { id: 'venue', label: 'Venue', type: 'text' },
  { id: 'doi', label: 'DOI', type: 'text' },
  { id: 'arxiv', label: 'arXiv id', type: 'text' },
  { id: 'url', label: 'Link', type: 'url' },
  { id: 'pdf', label: 'PDF', type: 'text', description: 'A link to an open PDF, or the path of one on this computer' },
  { id: 'abstract', label: 'Abstract', type: 'text' },
  { id: 'bibtex', label: 'BibTeX', type: 'text' },
  { id: 'key', label: 'BibTeX key', type: 'text' },
  { id: 'tags', label: 'Tags', type: 'list' },
  { id: 'status', label: 'Status', type: 'text', description: 'To read, Reading or Read' },
  { id: 'notes', label: 'Notes', type: 'markdown' },
  { id: 'project', label: 'Project', type: 'text', description: 'One of your projects by its id, or the words given when they name none of them' },
  { id: 'project_name', label: 'Project’s name', type: 'text' },
  { id: 'added', label: 'Added', type: 'date' },
  { id: 'read_on', label: 'Read on', type: 'date' },
  { id: 'zotero_key', label: 'Zotero key', type: 'text' },
  { id: 'zotero_version', label: 'Zotero version', type: 'number' },
];

/** Each sync with Zotero: what it did, and the library's version it left, so the next one moves only what changed. */
const SYNC_FIELDS: AnswerField[] = [
  { id: 'service', label: 'Service', type: 'text' },
  { id: 'library', label: 'Library', type: 'text' },
  { id: 'version', label: 'Version', type: 'number' },
  { id: 'at', label: 'When', type: 'text' },
  { id: 'summary', label: 'What it did', type: 'text' },
  { id: 'added', label: 'New from Zotero', type: 'number' },
  { id: 'updated', label: 'Updated from it', type: 'number' },
  { id: 'sent', label: 'Sent to it', type: 'number' },
  { id: 'unlinked', label: 'Deleted there', type: 'number' },
];

// ---- the Reading list -----------------------------------------------------------------------------------------------

const READING_LIST: Draft = {
  id: 'reading-list',
  name: 'Reading list',
  icon: 'book-open',
  color: 'teal',
  category: 'Research',
  description: 'Papers per project with their PDF, BibTeX, tags, status and notes, kept in step with Zotero. Add one by its DOI, arXiv id, link or title, and it is looked up and filled in.',
  // Its page is the list itself: no editions to update.
  home: { editions: false },
  fields: [
    { id: 'paper', label: 'The paper', type: 'text', required: true, placeholder: 'e.g. 1706.03762, 10.1145/3397271.3401075, a link or a title', help: 'A DOI, an arXiv id, a link, its title, or a PDF on this computer' },
    { id: 'project', label: 'Project', type: 'text', placeholder: 'e.g. Dense retrieval survey' },
    { id: 'tags', label: 'Tags', type: 'text', placeholder: 'e.g. retrieval, to cite', help: 'Between commas' },
    { id: 'status', label: 'Status', type: 'choice', options: ['To read', 'Reading', 'Read'], default: 'To read' },
    { id: 'notes', label: 'Notes', type: 'long' },
  ],
  prompt: '',
  data: {
    papers: { fields: PAPER_FIELDS, description: 'Your papers: each with its record, BibTeX, tags, status, notes and project, and its Zotero key once it is in Zotero' },
    syncs: { fields: SYNC_FIELDS, description: 'Each sync with Zotero, and the library’s version it left' },
  },
  secrets: [
    {
      name: 'ZOTERO_API_KEY',
      label: 'Zotero API key',
      help: 'Make one at zotero.org/settings/keys: allow access to your library, and writing to it to send papers there.',
      url: 'https://www.zotero.org/settings/keys/new',
      domains: ['api.zotero.org'],
      header: 'Zotero-API-Key',
      flows: ['zotero'],
    },
    {
      name: 'ZOTERO_USER_ID',
      label: 'Zotero user ID',
      help: 'The number zotero.org/settings/keys gives for API calls; found from the key when you leave it out, or groups/<id> for a group’s library.',
      url: 'https://www.zotero.org/settings/keys',
      domains: ['api.zotero.org'],
      optional: true,
      flows: ['zotero'],
    },
  ],
  flow: {
    steps: [
      { id: 'look', title: 'Look it up', do: 'tool', tool: 'read_paper', with: { paper: '{{paper}}', text: false }, failed: 'skip' },
      {
        id: 'record',
        title: 'Make its record',
        do: 'code',
        language: 'javascript',
        with: { found: '{{look.data}}', paper: '{{paper}}', notes: '{{notes}}', status: '{{status}}' },
        code:
          LIST +
          String.raw`// The paper as the list keeps it: what the look-up found (its record and BibTeX), else the words given as its title;
// with the notes and status given.
const r = obj(input.found);
const given = String(input.paper || '').trim();
const looksLikeId = /^(https?:|doi:|10\.\d|arxiv|\d{4}\.\d{4})/i.test(given) || /^[~.]?\//.test(given);
const title = String(r.title || '').trim() || (looksLikeId ? '' : given);
if (!title) throw new Error(list(r.notes)[0] || 'Nothing was found for ' + given + ': give its title, a DOI or an arXiv id.');
const paper = {
  title,
  authors: list(r.authors).join(', '),
  year: Number(r.year) || null,
  venue: String(r.venue || ''),
  doi: String(r.doi || ''),
  arxiv: String(r.arxiv || ''),
  url: String(r.url || ''),
  pdf: String(r.pdf || ''),
  abstract: String(r.abstract || '').slice(0, 4000),
  bibtex: String(r.bibtex || ''),
  key: String(r.key || ''),
  notes: String(input.notes || '').trim(),
  status: input.status || 'To read',
};
const note = r.found ? '' : 'It was not found online, so it is kept with the title you gave and a BibTeX entry made from it: check the entry.';
return { papers: [paper], found: !!r.found, note };`,
        outputs: [
          { id: 'papers', label: 'The paper', type: 'table', columns: [{ id: 'title', label: 'Title', type: 'text' }, { id: 'doi', label: 'DOI', type: 'text' }, { id: 'arxiv', label: 'arXiv id', type: 'text' }] },
          { id: 'found', label: 'Found online', type: 'yesno' },
          { id: 'note', label: 'Note', type: 'text' },
        ],
        failed: 'agent',
      },
      { id: 'keep', title: 'Keep it in your list', do: 'tool', tool: 'reading_list', with: { op: 'keep', papers: '{{record.papers}}', project: '{{project}}', tags: '{{tags}}', status: '{{status}}' } },
      {
        id: 'answer',
        title: 'Say what was kept',
        do: 'code',
        language: 'javascript',
        with: { kept: '{{keep.data}}', note: '{{record.note}}' },
        code:
          LIST +
          String.raw`// The paper as the list has it now, whether it was new to it, and how many papers the list has.
const k = obj(input.kept);
const p = rows(k.papers)[0] || {};
return {
  title: String(p.title || ''),
  authors: String(p.authors || ''),
  year: Number(p.year) || null,
  venue: String(p.venue || ''),
  link: /^https?:\/\//.test(String(p.url || '')) ? p.url : null,
  bibtex: String(p.bibtex || ''),
  status: String(p.status || 'To read'),
  tags: list(p.tags),
  project: String(p.project_name || p.project || ''),
  added: Number(k.added) > 0,
  count: Number(k.count) || 0,
  note: Number(k.added) > 0 ? String(input.note || '') : 'It was in your list already: what it lacked is filled in, and your notes, tags and status stay as they were.',
};`,
        outputs: [
          { id: 'title', label: 'Title', type: 'text' },
          { id: 'authors', label: 'Authors', type: 'text' },
          { id: 'year', label: 'Year', type: 'number' },
          { id: 'venue', label: 'Venue', type: 'text' },
          { id: 'link', label: 'Link', type: 'url' },
          { id: 'bibtex', label: 'BibTeX', type: 'text' },
          { id: 'status', label: 'Status', type: 'text' },
          { id: 'tags', label: 'Tags', type: 'list' },
          { id: 'project', label: 'Project', type: 'text' },
          { id: 'added', label: 'New to the list', type: 'yesno' },
          { id: 'count', label: 'Papers in the list', type: 'number' },
          { id: 'note', label: 'Note', type: 'text' },
        ],
        failed: 'agent',
      },
    ],
    outputs: {
      title: '{{answer.title}}',
      authors: '{{answer.authors}}',
      year: '{{answer.year}}',
      venue: '{{answer.venue}}',
      link: '{{answer.link}}',
      bibtex: '{{answer.bibtex}}',
      status: '{{answer.status}}',
      tags: '{{answer.tags}}',
      project: '{{answer.project}}',
      added: '{{answer.added}}',
      count: '{{answer.count}}',
      note: '{{answer.note}}',
    },
  },
  flows: {
    import: {
      title: 'Import a .bib',
      inputs: [
        { id: 'bibtex', label: 'The .bib', type: 'long', help: 'Paste it' },
        { id: 'path', label: 'Or a .bib file on this computer', type: 'text', placeholder: '~/papers/refs.bib' },
        { id: 'project', label: 'Project', type: 'text' },
        { id: 'tags', label: 'Tags', type: 'text', help: 'Between commas' },
      ],
      steps: [
        { id: 'imported', title: 'Read the .bib', do: 'tool', tool: 'reading_list', with: { op: 'import', bibtex: '{{bibtex}}', path: '{{path}}', project: '{{project}}', tags: '{{tags}}' } },
        {
          id: 'said',
          title: 'Say what came in',
          do: 'code',
          language: 'javascript',
          with: { got: '{{imported.data}}' },
          code:
            LIST +
            String.raw`// What the import did, in a line: "34 added, 2 completed, 1 there already".
const g = obj(input.got);
const n = (x) => Number(x) || 0;
const parts = [];
if (n(g.added)) parts.push(n(g.added) + ' added');
if (n(g.updated)) parts.push(n(g.updated) + ' completed');
if (n(g.unchanged)) parts.push(n(g.unchanged) + ' there already');
const summary = (parts.join(', ') || 'Nothing new') + (n(g.skipped) ? ' (' + n(g.skipped) + ' without a title left out)' : '') + '.';
return { summary, added: n(g.added), updated: n(g.updated), unchanged: n(g.unchanged), count: n(g.count) };`,
          outputs: [
            { id: 'summary', label: 'What came in', type: 'text' },
            { id: 'added', label: 'Added', type: 'number' },
            { id: 'updated', label: 'Completed', type: 'number' },
            { id: 'unchanged', label: 'There already', type: 'number' },
            { id: 'count', label: 'Papers in the list', type: 'number' },
          ],
          failed: 'agent',
        },
      ],
      outputs: { summary: '{{said.summary}}', added: '{{said.added}}', updated: '{{said.updated}}', count: '{{said.count}}' },
    },
    export: {
      title: 'Export a .bib',
      inputs: [
        { id: 'status', label: 'Status', type: 'text' },
        { id: 'tag', label: 'Tag', type: 'text' },
        { id: 'project', label: 'Project', type: 'text' },
        { id: 'search', label: 'Words', type: 'text' },
      ],
      steps: [
        { id: 'exported', title: 'Write the .bib', do: 'tool', tool: 'reading_list', with: { op: 'export', status: '{{status}}', tag: '{{tag}}', project: '{{project}}', search: '{{search}}' } },
        {
          id: 'file',
          title: 'Hand it over',
          do: 'code',
          language: 'javascript',
          with: { got: '{{exported.data}}' },
          code:
            LIST +
            String.raw`// The .bib to download, its name, and how many papers it has.
const g = obj(input.got);
return { file: String(g.file || ''), name: String(g.name || 'reading-list.bib'), count: Number(g.count) || 0, bibtex: String(g.bibtex || '') };`,
          outputs: [
            { id: 'file', label: 'The file', type: 'text' },
            { id: 'name', label: 'Its name', type: 'text' },
            { id: 'count', label: 'Papers', type: 'number' },
            { id: 'bibtex', label: 'BibTeX', type: 'text' },
          ],
          failed: 'agent',
        },
      ],
      outputs: { file: '{{file.file}}', name: '{{file.name}}', count: '{{file.count}}', bibtex: '{{file.bibtex}}' },
    },
    zotero: {
      title: 'Sync with Zotero',
      steps: [
        { id: 'synced', title: 'Sync with Zotero', do: 'tool', tool: 'zotero_sync', with: { direction: 'both' } },
        {
          id: 'said',
          title: 'Say what it did',
          do: 'code',
          language: 'javascript',
          with: { got: '{{synced.data}}' },
          code:
            LIST +
            String.raw`// What the sync did, as the page shows it.
const g = obj(input.got);
const n = (x) => Number(x) || 0;
return { summary: String(g.summary || ''), added: n(g.added), updated: n(g.updated), sent: n(g.sent), unlinked: n(g.unlinked), failed: list(g.failed) };`,
          outputs: [
            { id: 'summary', label: 'What it did', type: 'text' },
            { id: 'added', label: 'New from Zotero', type: 'number' },
            { id: 'updated', label: 'Updated from it', type: 'number' },
            { id: 'sent', label: 'Sent to it', type: 'number' },
            { id: 'unlinked', label: 'Deleted there', type: 'number' },
            { id: 'failed', label: 'What went wrong', type: 'list' },
          ],
          failed: 'agent',
        },
      ],
      outputs: { summary: '{{said.summary}}', added: '{{said.added}}', sent: '{{said.sent}}', failed: '{{said.failed}}' },
    },
  },
  answer: [
    { id: 'title', label: 'Title', type: 'text', required: true },
    { id: 'authors', label: 'Authors', type: 'text' },
    { id: 'year', label: 'Year', type: 'number' },
    { id: 'venue', label: 'Venue', type: 'text' },
    { id: 'link', label: 'Link', type: 'url' },
    { id: 'bibtex', label: 'BibTeX', type: 'text' },
    { id: 'status', label: 'Status', type: 'text' },
    { id: 'tags', label: 'Tags', type: 'list' },
    { id: 'project', label: 'Project', type: 'text' },
    { id: 'added', label: 'New to the list', type: 'yesno' },
    { id: 'count', label: 'Papers in the list', type: 'number' },
    { id: 'note', label: 'Note', type: 'text' },
  ],
  examples: [
    { id: 'by-arxiv-id', name: 'A paper by its arXiv id', inputs: { paper: '1706.03762', project: 'Transformers', tags: 'architecture, to cite' }, checks: ['{{answer.title}} contains Attention', '{{answer.bibtex}} contains @'] },
    { id: 'by-doi', name: 'A paper by its DOI', inputs: { paper: '10.1145/3397271.3401075', status: 'Read' }, checks: ['{{answer.title}} contains ColBERT', '{{answer.count}} >= 1'] },
  ],
};

// ---- Literature matrix --------------------------------------------------------------------------------------------------

const MATRIX_PAPERS: AnswerField['columns'] = [
  { id: 'n', label: 'Number', type: 'number' },
  { id: 'title', label: 'Paper', type: 'text' },
  { id: 'authors', label: 'Authors', type: 'text' },
  { id: 'year', label: 'Year', type: 'number' },
  { id: 'venue', label: 'Venue', type: 'text' },
  { id: 'link', label: 'Link', type: 'url' },
  { id: 'read', label: 'Read', type: 'yesno' },
  { id: 'source', label: 'Read from', type: 'text' },
  { id: 'gist', label: 'In a sentence', type: 'text' },
  { id: 'note', label: 'Note', type: 'text' },
];

const MATRIX_CELLS: AnswerField['columns'] = [
  { id: 'n', label: 'Paper number', type: 'number' },
  { id: 'column', label: 'Column', type: 'text' },
  { id: 'answer', label: 'What it says', type: 'text' },
  { id: 'where', label: 'Where', type: 'text' },
];

const LITERATURE_MATRIX: Draft = {
  id: 'literature-matrix',
  name: 'Literature matrix',
  icon: 'list-checks',
  color: 'indigo',
  category: 'Research',
  description: 'Papers become a spreadsheet in one go: task, data, method, metrics, results and limits for each, every cell citing its page, kept in your Library.',
  fields: [
    {
      id: 'papers',
      label: 'The papers',
      type: 'long',
      required: true,
      placeholder: 'One a line: a title, a DOI, an arXiv id, a link or a PDF on this computer; or “my reading list, tag: retrieval”',
      help: 'From your Reading list too: “my reading list” with a tag, a project or a status',
    },
    { id: 'columns', label: 'The columns', type: 'long', default: 'Task\nData\nMethod\nMetrics\nResults\nLimits', help: 'One a line: change them as you like' },
    { id: 'project', label: 'Project', type: 'text', placeholder: 'e.g. Dense retrieval survey', help: 'Its spreadsheet goes in this project of yours; with “my reading list”, its papers of this project' },
  ],
  prompt: '',
  flow: {
    steps: [
      {
        id: 'which',
        title: 'See which papers',
        do: 'code',
        language: 'javascript',
        with: { papers: '{{papers}}', columns: '{{columns}}', project: '{{project}}' },
        code: String.raw`// The papers asked for, each line one (a title, a DOI, an arXiv id, a link or a file), and those of the reading list
// a line asks for ("my reading list", with a tag, a project or a status, or the ids of its papers); and the columns.
const lines = String(input.papers || '').split('\n').map((l) => l.replace(/^\s*(?:[-*•]\s*|\d+[.)]\s+)/, '').trim()).filter(Boolean);
const own = [];
const q = { from: false, tag: '', project: '', status: '', ids: [] };
for (const l of lines) {
  const m = /^(?:my\s+|the\s+|your\s+|from\s+(?:my\s+|the\s+)?)?reading[\s-]*list\b[\s,:;-]*(.*)$/i.exec(l);
  if (!m) {
    own.push(l);
    continue;
  }
  q.from = true;
  let rest = m[1];
  const json = /\{[\s\S]*\}/.exec(rest);
  if (json) {
    try {
      q.ids = q.ids.concat(Object.keys(JSON.parse(json[0])));
    } catch (e) {}
    rest = rest.replace(json[0], ' ');
  }
  const tag = /\btag(?:ged)?\s*[:=]?\s*["“]?([^,;"”]+)/i.exec(rest);
  const project = /\bproject\s*[:=]?\s*["“]?([^,;"”]+)/i.exec(rest);
  const status = /\b(to read|reading|read)\b/i.exec(rest.replace(/\btag[\s\S]*$|\bproject[\s\S]*$/i, ''));
  if (tag) q.tag = tag[1].trim();
  if (project) q.project = project[1].trim();
  if (status) q.status = { 'to read': 'To read', reading: 'Reading', read: 'Read' }[status[1].toLowerCase()];
}
// "my reading list" alone, with a project given: that project's papers.
if (q.from && !q.tag && !q.project && !q.status && !q.ids.length) q.project = String(input.project || '').trim();
const cols = String(input.columns || '').split('\n').map((c) => c.replace(/^\s*(?:[-*•]\s*|\d+[.)]\s+)/, '').trim()).filter(Boolean);
const columns = (cols.length ? cols : ['Task', 'Data', 'Method', 'Metrics', 'Results', 'Limits']).filter((c, i, all) => all.indexOf(c) === i).slice(0, 12);
return { lines: own, from: q.from, tag: q.tag, list_project: q.project, status: q.status, ids: q.ids, columns };`,
        outputs: [
          { id: 'lines', label: 'Papers given', type: 'list' },
          { id: 'from', label: 'From the reading list', type: 'yesno' },
          { id: 'tag', label: 'Its tag', type: 'text' },
          { id: 'list_project', label: 'Its project', type: 'text' },
          { id: 'status', label: 'Its status', type: 'text' },
          { id: 'ids', label: 'Its papers', type: 'list' },
          { id: 'columns', label: 'Columns', type: 'list' },
        ],
        failed: 'agent',
      },
      {
        id: 'from_list',
        title: 'From your reading list?',
        do: 'decide',
        rule: '{{which.from}}',
        then: [{ id: 'listed', title: 'Find them in your reading list', do: 'tool', tool: 'reading_list', with: { op: 'find', tag: '{{which.tag}}', project: '{{which.list_project}}', status: '{{which.status}}', ids: '{{which.ids}}' } }],
      },
      {
        id: 'targets',
        title: 'List the papers to read',
        do: 'code',
        language: 'javascript',
        with: { lines: '{{which.lines}}', listed: '{{listed.data}}' },
        code:
          LIST +
          String.raw`// Each paper once, by what finds it best: a PDF it has, its arXiv id, its DOI, its link, else its title; thirty at most.
const items = [];
const seen = new Set();
const add = (label, paper, from) => {
  const k = String(paper).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!k || seen.has(k)) return;
  seen.add(k);
  items.push({ n: items.length + 1, label: String(label).slice(0, 300), paper: String(paper).slice(0, 2000), from });
};
for (const l of list(input.lines)) add(l, l, 'given');
for (const p of rows(obj(input.listed).papers)) {
  const pdf = String(p.pdf || '');
  const best = (/^(\/|~\/|https?:\/\/)/.test(pdf) && pdf) || (p.arxiv && 'arXiv:' + p.arxiv) || p.doi || p.url || p.title;
  add(p.title || best, best, 'list');
}
if (!items.length) throw new Error('No papers to read: give them one a line, or say which of your reading list (a tag or a project that has papers).');
const more = Math.max(0, items.length - 30);
return { items: items.slice(0, 30), count: Math.min(30, items.length), left: more };`,
        outputs: [
          {
            id: 'items',
            label: 'Papers',
            type: 'table',
            columns: [
              { id: 'n', label: 'Number', type: 'number' },
              { id: 'label', label: 'As given', type: 'text' },
              { id: 'paper', label: 'Found by', type: 'text' },
              { id: 'from', label: 'From', type: 'text' },
            ],
          },
          { id: 'count', label: 'How many', type: 'number' },
          { id: 'left', label: 'Left out', type: 'number' },
        ],
        failed: 'agent',
      },
      {
        id: 'read',
        title: 'Read each paper',
        do: 'repeat',
        over: '{{targets.items}}',
        atOnce: 3,
        as: 'p',
        collect: 'row',
        steps: [
          { id: 'got', title: 'Find and read it', do: 'tool', tool: 'read_paper', with: { paper: '{{p.paper}}', pages: true, max_chars: 90000 }, failed: 'skip' },
          {
            id: 'cells',
            title: 'Fill in its row',
            do: 'model',
            if: '{{got.data.parts}} is not empty',
            instructions: `Fill in one row of a literature matrix: for the paper below, answer each column in a sentence or two, with numbers exactly as the paper gives them (metrics with their datasets), and say where it says so: its page ("p. 4", from the [Page N] marks), else its section ("§3.2"). Where the paper does not say, answer "Not stated" and leave where empty. Only what this paper itself says, nothing from elsewhere.

The columns, in this order:
{{which.columns}}

The paper: {{got.data.title}}{{#got.data.year}} ({{got.data.year}}){{/got.data.year}}{{#got.data.venue}}, {{got.data.venue}}{{/got.data.venue}}
${paperParts('got')}`,
            outputs: [
              { id: 'cells', label: 'Its row', type: 'table', required: true, columns: [{ id: 'column', label: 'Column', type: 'text' }, { id: 'answer', label: 'What it says', type: 'text' }, { id: 'where', label: 'Where', type: 'text' }] },
              { id: 'gist', label: 'In a sentence', type: 'text', description: 'What the paper does and finds, in one sentence' },
            ],
            failed: 'skip',
          },
          {
            id: 'row',
            title: 'Keep its row',
            do: 'code',
            language: 'javascript',
            with: { p: '{{p}}', got: '{{got.data}}', cells: '{{cells.cells}}', gist: '{{cells.gist}}', columns: '{{which.columns}}' },
            code:
              LIST +
              String.raw`// The paper's row: its record, how it was read, and one cell for each column in their order.
const p = obj(input.p);
const g = obj(input.got);
const cols = list(input.columns).map(String);
const got = rows(input.cells);
const low = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const cells = cols.map((c, i) => {
  const x = got.find((y) => low(y.column) === low(c)) || (got.length === cols.length ? got[i] : null) || {};
  return { n: p.n, column: c, answer: String(x.answer || 'Not stated').trim(), where: String(x.where || '').trim() };
});
const read = list(g.parts).length > 0 && got.length > 0;
const link = /^https?:\/\//.test(String(g.url || '')) ? g.url : /^https?:\/\//.test(String(g.pdf || '')) ? g.pdf : null;
const why = list(g.notes).join(' ') || (g.found ? 'Its text could not be read.' : 'It was not found.');
return {
  n: p.n,
  title: String(g.title || p.label || p.paper),
  authors: list(g.authors).slice(0, 3).join(', ') + (list(g.authors).length > 3 ? ' et al.' : ''),
  year: Number(g.year) || null,
  venue: String(g.venue || ''),
  link,
  read,
  source: read ? String(g.source || '') : '',
  gist: String(input.gist || ''),
  note: read ? (g.source === 'its abstract only' ? 'From its abstract only: no open copy was found.' : '') : why,
  cells: read ? cells : [],
};`,
            outputs: [
              { id: 'n', label: 'Number', type: 'number' },
              { id: 'title', label: 'Paper', type: 'text' },
              { id: 'read', label: 'Read', type: 'yesno' },
              { id: 'cells', label: 'Its cells', type: 'table', columns: MATRIX_CELLS },
            ],
            failed: 'skip',
          },
        ],
      },
      {
        id: 'matrix',
        title: 'Put the matrix together',
        do: 'code',
        language: 'javascript',
        with: { rows: '{{read.items}}', items: '{{targets.items}}', columns: '{{which.columns}}', left: '{{targets.left}}', project: '{{project}}', today: '{{today}}' },
        code:
          LIST +
          String.raw`// The papers in their order, their cells one per column, those it could not read and why, and the spreadsheet: the
// matrix (a row a paper, each cell with where it is said) and the papers with how each was read.
const cols = list(input.columns).map(String);
const items = rows(input.items);
const got = list(input.rows);
const papers = items.map((it, i) => {
  const r = obj(got[i]);
  return { n: it.n, title: String(r.title || it.label), authors: String(r.authors || ''), year: r.year || null, venue: String(r.venue || ''), link: r.link || null, read: r.read === true, source: String(r.source || ''), gist: String(r.gist || ''), note: r.read === true ? String(r.note || '') : String(r.note || 'It could not be read.') };
});
const cells = [];
got.forEach((r) => rows(obj(r).cells).forEach((c) => cells.push({ n: Number(c.n), column: String(c.column), answer: String(c.answer), where: String(c.where || '') })));
const unread = papers.filter((p) => !p.read).map((p) => p.title + ': ' + p.note);
if (Number(input.left)) unread.push(Number(input.left) + ' more papers were left out: a matrix takes thirty at most.');
const text = (s) => (/^[=+@-]/.test(s) ? "'" + s : s);
const letter = (i) => String.fromCharCode(65 + (i % 26));
const head = ['Paper', 'Year'].concat(cols, ['Link']);
const body = papers
  .filter((p) => p.read)
  .map((p) => [text(p.title + (p.authors ? ' (' + p.authors + ')' : '')), p.year || null].concat(cols.map((c) => {
    const x = cells.find((y) => y.n === p.n && y.column === c);
    return x ? text(x.answer + (x.where ? ' [' + x.where + ']' : '')) : '';
  }), [p.link || '']));
const widths = { A: 280, B: 60 };
cols.forEach((c, i) => (widths[letter(i + 2)] = 240));
widths[letter(cols.length + 2)] = 200;
const last = letter(cols.length + 2);
const sheets = [
  { name: 'Matrix', rows: [head].concat(body), header: true, freeze: { rows: 1, cols: 1 }, widths, styles: body.length ? { ['A2:' + last + (body.length + 1)]: { wrap: true, valign: 'top' } } : {} },
  {
    name: 'Papers',
    rows: [['Paper', 'Authors', 'Year', 'Venue', 'Read from', 'Note', 'Link']].concat(papers.map((p) => [text(p.title), text(p.authors), p.year || null, text(p.venue), p.source, text(p.note), p.link || ''])),
    header: true,
    freeze: { rows: 1 },
    widths: { A: 320, B: 220, C: 60, D: 200, E: 160, F: 280, G: 220 },
  },
];
const title = 'Literature matrix' + (input.project ? ': ' + input.project : '') + ' (' + input.today + ')';
return { papers, cells, columns: cols, unread, sheets, title, count: papers.filter((p) => p.read).length };`,
        outputs: [
          { id: 'papers', label: 'Papers', type: 'table', columns: MATRIX_PAPERS },
          { id: 'cells', label: 'Cells', type: 'table', columns: MATRIX_CELLS },
          { id: 'columns', label: 'Columns', type: 'list' },
          { id: 'unread', label: 'Not read', type: 'list' },
          { id: 'sheets', label: 'The spreadsheet', type: 'list' },
          { id: 'title', label: 'Its title', type: 'text' },
          { id: 'count', label: 'Papers read', type: 'number' },
        ],
        failed: 'agent',
      },
      {
        id: 'synth',
        title: 'Write what they say together',
        do: 'model',
        if: '{{matrix.count}} > 1',
        instructions: `Here is a literature matrix: for each paper (by its number), what it says on each column, and where. Write a short synthesis across the papers, for a researcher: where they agree, where they disagree and why (data, metrics, method, settings), what is still open, and which papers stand out and for what. Cite papers by their numbers in brackets, like [3]. Plain words, in Markdown, about 250 words: no list of the papers.

The papers:
{{matrix.papers}}

The cells:
{{matrix.cells}}`,
        outputs: [{ id: 'synthesis', label: 'Across the papers', type: 'markdown', required: true }],
        failed: 'skip',
      },
      { id: 'save', title: 'Keep it in your Library', do: 'tool', tool: 'save_sheet', if: '{{matrix.count}} > 0', with: { title: '{{matrix.title}}', sheets: '{{matrix.sheets}}', project: '{{project}}' }, failed: 'skip' },
      {
        id: 'kept',
        title: 'Find its page',
        do: 'code',
        language: 'javascript',
        with: { saved: '{{save.text}}' },
        code: String.raw`// The Library's page the spreadsheet was kept as (its id), from what save_sheet said.
const m = /\(page ([A-Za-z0-9_-]+), version/.exec(String(input.saved || ''));
return { sheet: m ? m[1] : '', saved: !!m };`,
        outputs: [
          { id: 'sheet', label: 'Its page', type: 'text' },
          { id: 'saved', label: 'Kept', type: 'yesno' },
        ],
        failed: 'agent',
      },
    ],
    outputs: { papers: '{{matrix.papers}}', cells: '{{matrix.cells}}', columns: '{{matrix.columns}}', unread: '{{matrix.unread}}', synthesis: '{{synth.synthesis}}', sheet: '{{kept.sheet}}' },
  },
  answer: [
    { id: 'papers', label: 'Papers', type: 'table', required: true, columns: MATRIX_PAPERS },
    { id: 'cells', label: 'The matrix', type: 'table', columns: MATRIX_CELLS, description: 'One row per paper and column: what the paper says, and where' },
    { id: 'columns', label: 'Columns', type: 'list' },
    { id: 'unread', label: 'Not read', type: 'list', description: 'The papers it could not read, and why' },
    { id: 'synthesis', label: 'Across the papers', type: 'markdown' },
    { id: 'sheet', label: 'The spreadsheet', type: 'text', description: 'Its page in the Library' },
  ],
  examples: [
    { id: 'three-rerankers', name: 'Three rerankers', inputs: { papers: '1901.04085\n2003.06713\n10.1145/3397271.3401075', project: 'Reranking' }, checks: ['{{matrix.count}} >= 2', '{{answer.cells}} is not empty'] },
    { id: 'from-the-list', name: 'From your reading list', inputs: { papers: 'my reading list, tag: retrieval', columns: 'Task\nData\nResults' }, checks: ['{{answer.papers}} is not empty'] },
  ],
};

// ---- Reproduce a paper ---------------------------------------------------------------------------------------------------

const REPRO_RESULTS: AnswerField['columns'] = [
  { id: 'metric', label: 'Metric', type: 'text' },
  { id: 'setting', label: 'Setting', type: 'text' },
  { id: 'paper', label: 'The paper', type: 'number' },
  { id: 'ours', label: 'Ours', type: 'number' },
  { id: 'difference', label: 'Difference', type: 'number' },
  { id: 'close', label: 'Close enough', type: 'yesno' },
  { id: 'note', label: 'Note', type: 'text' },
];

const REPRO_STEPS: AnswerField['columns'] = [
  { id: 'n', label: 'Step', type: 'number' },
  { id: 'step', label: 'What', type: 'text' },
  { id: 'minutes', label: 'Minutes', type: 'number' },
  { id: 'ok', label: 'Went well', type: 'yesno' },
  { id: 'note', label: 'Note', type: 'text' },
];

const REPRODUCE: Draft = {
  id: 'reproduce-paper',
  name: 'Reproduce a paper',
  icon: 'code',
  color: 'slate',
  category: 'Research',
  description: 'Clones its code, builds the environment, fetches the checkpoints, runs its evaluation and compares the numbers with its table, and reports what it took.',
  fields: [
    { id: 'paper', label: 'The paper', type: 'text', required: true, placeholder: 'e.g. 2104.08663, a DOI, a link or a title', help: 'A link, an arXiv id, a DOI, a title, or a PDF on this computer' },
    { id: 'upload', label: 'Or upload it', type: 'file', help: 'Its PDF' },
    { id: 'code', label: 'Its code', type: 'text', placeholder: 'e.g. https://github.com/beir-cellar/beir', help: 'A link or a folder on this computer; looked for when you leave it empty' },
    { id: 'target', label: 'What to reproduce', type: 'long', required: true, placeholder: 'e.g. Table 2, the BM25 + monoT5 row on MS MARCO dev' },
    { id: 'limits', label: 'Limits', type: 'text', default: 'At most 4 hours, 100 GB of disk and 1 GPU', help: 'Time, disk and GPUs it may use' },
    { id: 'folder', label: 'Where to work', type: 'text', placeholder: '~/repro', help: 'A folder on this computer; a new one for this run when empty' },
  ],
  prompt: '',
  flow: {
    steps: [
      { id: 'paper_read', title: 'Read the paper', do: 'tool', tool: 'read_paper', with: { paper: '{{paper}}', upload: '{{upload}}', pages: true, max_chars: 150000 }, failed: 'skip' },
      {
        id: 'hints',
        title: 'Look for its code in it',
        do: 'code',
        language: 'javascript',
        with: { read: '{{paper_read.data}}', code: '{{code}}', paper: '{{paper}}' },
        code:
          LIST +
          String.raw`// The code the paper points to (GitHub, GitLab, Hugging Face links in its text), the one given first; and words to
// search for it with when it names none.
const r = obj(input.read);
const text = list(r.parts).join('\n');
const given = String(input.code || '').trim();
const found = [];
for (const m of text.matchAll(/https?:\/\/(?:www\.)?(github\.com|gitlab\.com|bitbucket\.org)\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/gi)) {
  const u = m[0].replace(/[.,;)\]]+$/, '').replace(/\.git$/, '');
  if (!found.includes(u)) found.push(u);
}
const hf = [];
for (const m of text.matchAll(/https?:\/\/huggingface\.co\/(?:datasets\/)?[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/gi)) if (!hf.includes(m[0])) hf.push(m[0]);
// A link near "code", "available" or "github" in the text comes first.
const near = (u) => {
  const at = text.indexOf(u);
  const around = text.slice(Math.max(0, at - 200), at).toLowerCase();
  return /code|implementation|available|release|github|repository/.test(around) ? 0 : 1;
};
found.sort((a, b) => near(a) - near(b));
const title = String(r.title || input.paper || '');
const words = title.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 2).slice(0, 8).join(' ');
return { repo: given || found[0] || '', candidates: found.slice(0, 6), hf: hf.slice(0, 6), title, query: encodeURIComponent(words + ' in:name,description,readme'), words };`,
        outputs: [
          { id: 'repo', label: 'Its code', type: 'text' },
          { id: 'candidates', label: 'Links in the paper', type: 'list' },
          { id: 'hf', label: 'Hugging Face links', type: 'list' },
          { id: 'title', label: 'Its title', type: 'text' },
          { id: 'query', label: 'A search for it', type: 'text' },
          { id: 'words', label: 'Words of its title', type: 'text' },
        ],
        failed: 'agent',
      },
      {
        id: 'find',
        title: 'No code named?',
        do: 'decide',
        rule: '{{hints.repo}} is empty',
        then: [
          {
            id: 'search',
            title: 'Search for its code',
            do: 'parallel',
            branches: [
              [{ id: 'github', title: 'Search GitHub', do: 'tool', tool: 'http_request', with: { url: 'https://api.github.com/search/repositories?per_page=8&q={{hints.query}}', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Hydor' } }, failed: 'skip' }],
              [{ id: 'web', title: 'Search the web', do: 'tool', tool: 'web_search', with: { query: '"{{hints.title}}" code github', k: 8 }, failed: 'skip' }],
            ],
          },
          {
            id: 'pick',
            title: 'Pick its repository',
            do: 'code',
            language: 'javascript',
            with: { github: '{{github.text}}', web: '{{web.text}}', words: '{{hints.words}}' },
            code: String.raw`// The repository most likely the paper's: its name and description share the title's words, then its stars.
const words = String(input.words || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
const cands = [];
const gh = String(input.github || '');
const body = gh.indexOf('\n\n') >= 0 ? gh.slice(gh.indexOf('\n\n') + 2) : gh;
try {
  for (const it of JSON.parse(body).items || []) cands.push({ url: it.html_url, text: (it.full_name + ' ' + (it.description || '')).toLowerCase(), stars: Number(it.stargazers_count) || 0 });
} catch (e) {}
for (const m of String(input.web || '').matchAll(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g)) if (!cands.some((c) => c.url.toLowerCase() === m[0].toLowerCase())) cands.push({ url: m[0], text: m[0].toLowerCase(), stars: 0 });
const score = (c) => words.filter((w) => c.text.includes(w)).length * 10 + Math.log10(1 + c.stars);
cands.sort((a, b) => score(b) - score(a));
const best = cands[0] && score(cands[0]) >= 10 ? cands[0].url : '';
return { repo: best, others: cands.slice(0, 5).map((c) => c.url) };`,
            outputs: [
              { id: 'repo', label: 'Its repository', type: 'text' },
              { id: 'others', label: 'Others found', type: 'list' },
            ],
            failed: 'agent',
          },
        ],
      },
      {
        id: 'plan',
        title: 'Work out the exact setting',
        do: 'model',
        instructions: `From the paper below, work out exactly what must be reproduced: {{target}}

For it: the dataset and split, the model and its checkpoint, the settings (hyperparameters, seeds, hardware the paper names), and each number to match as the paper reports it (metric, which row and column, the value exactly as printed, and where: its page or table). Say "not stated" for what the paper leaves out rather than guessing.

The paper: {{hints.title}}
${paperParts('paper_read')}`,
        outputs: [
          { id: 'setting', label: 'The setting', type: 'markdown', required: true },
          {
            id: 'expected',
            label: 'Numbers to match',
            type: 'table',
            required: true,
            columns: [{ id: 'metric', label: 'Metric', type: 'text' }, { id: 'setting', label: 'Row and column', type: 'text' }, { id: 'value', label: 'The paper’s', type: 'number' }, { id: 'where', label: 'Where', type: 'text' }],
          },
          { id: 'data', label: 'Data it needs', type: 'list' },
          { id: 'checkpoints', label: 'Checkpoints it needs', type: 'list' },
        ],
      },
      {
        id: 'work',
        title: 'Set it up and run it',
        do: 'agent',
        instructions: `Reproduce a result of a paper, following the reproduce-paper skill: find the code and the exact setting, make a clean environment as the repository says (venv, conda or Docker), get the data and the checkpoints, run it on a small slice first, then the real run. Never use a GPU another run holds. Write down every change you make to their code or settings, and why.

The paper: {{hints.title}}{{#paper_read.data.url}} ({{paper_read.data.url}}){{/paper_read.data.url}}{{#paper_read.data.pdf}}
Its PDF: {{paper_read.data.pdf}}{{/paper_read.data.pdf}}
What to reproduce: {{target}}
Its code: {{#hints.repo}}{{hints.repo}}{{/hints.repo}}{{^hints.repo}}{{#pick.repo}}{{pick.repo}} (found by a search: check it is the paper's){{/pick.repo}}{{^pick.repo}}not found yet: look on the paper's pages, its authors' pages, GitHub and Hugging Face{{/pick.repo}}{{/hints.repo}}
{{#hints.hf}}Hugging Face links in the paper:
{{hints.hf}}
{{/hints.hf}}Limits: {{limits}}. Stop and report when a limit would be passed.
Work in {{#folder}}{{folder}}{{/folder}}{{^folder}}this run's folder{{/folder}}.

The exact setting, as the paper gives it:
{{plan.setting}}

The numbers to match:
{{plan.expected}}

The real run: when it needs no GPU and ends within about half an hour, run it here and hand in its numbers. Otherwise, when you have experiment_run (Experiments), start it there and do not wait for it: experiment_run with command, cwd (the work folder), name, gpus (within the limits), hours (the most it may take) and tags (["reproduce", the paper's arXiv id or a short name]); it answers at once with the run's id. Hand in those ids as runs, with wait_hours (how long to wait for them at most, within the limits) and read (where their numbers will be: a file, or the lines of the log that have them). The app then waits for them to end, and an agent finishes from there with your notes. Without experiment_run, run it yourself in the background (nohup, its output to a log in the work folder), look at it every few minutes (sleep between) until it ends, and hand in its numbers.

Before you hand in, write REPRODUCTION.md in the work folder: what you ran, the numbers side by side with the paper's, every change and fix, the time it took, and what is still different and why (with runs still going: what you have so far, the runs' ids, and what is left to do). Hand in the numbers you got for each one above, in the same order (none while its runs go on), the steps you took with their minutes, the fixes, the hours so far, the report's text, the folder and the repository.`,
        outputs: [
          { id: 'verdict', label: 'Verdict', type: 'text', description: 'Reproduced, Close, Not reproduced, or Could not run, with the reason in a sentence; empty while its runs go on in Experiments' },
          { id: 'results', label: 'Numbers', type: 'table', columns: [{ id: 'metric', label: 'Metric', type: 'text' }, { id: 'setting', label: 'Row and column', type: 'text' }, { id: 'paper', label: 'The paper’s', type: 'number' }, { id: 'ours', label: 'Ours', type: 'number' }, { id: 'note', label: 'Note', type: 'text' }] },
          { id: 'runs', label: 'Runs still going', type: 'list', description: 'The ids experiment_run gave, for the runs still going in Experiments; empty when it ran here' },
          { id: 'wait_hours', label: 'Hours to wait for them', type: 'number' },
          { id: 'read', label: 'Where their numbers will be', type: 'text' },
          { id: 'steps', label: 'What it took', type: 'table', columns: [{ id: 'step', label: 'What', type: 'text' }, { id: 'minutes', label: 'Minutes', type: 'number' }, { id: 'ok', label: 'Went well', type: 'yesno' }, { id: 'note', label: 'Note', type: 'text' }] },
          { id: 'fixes', label: 'Changes and fixes', type: 'list' },
          { id: 'hours', label: 'Hours so far', type: 'number' },
          { id: 'report', label: 'REPRODUCTION.md', type: 'markdown', required: true },
          { id: 'folder', label: 'Work folder', type: 'text' },
          { id: 'repo', label: 'Repository', type: 'url' },
        ],
      },
      {
        id: 'later',
        title: 'Runs still going?',
        do: 'decide',
        rule: '{{work.runs}} is not empty',
        then: [
          { id: 'waited', title: 'Wait for its runs', do: 'tool', tool: 'experiment_wait', with: { ids: '{{work.runs}}', hours: '{{work.wait_hours}}' }, failed: 'skip' },
          {
            id: 'finish',
            title: 'Finish it',
            do: 'agent',
            instructions: `Finish reproducing a result of a paper, following the reproduce-paper skill: another agent set it up and started its runs in Experiments, and the app waited for them to end (or for the time it may take to run out). Read each run with experiment_get (its status, its metrics and the end of its log); if one has not ended, look again every ten minutes (sleep between), within the limits. Take the numbers from where the notes say, compare them with the paper's, and finish REPRODUCTION.md in the work folder.

The paper: {{hints.title}}
What to reproduce: {{target}}
Limits: {{limits}}
The work folder: {{work.folder}}
Its runs: {{work.runs}}
{{#waited.data}}How they ended:
{{waited.data}}
{{/waited.data}}Where their numbers will be: {{work.read}}

The numbers to match:
{{plan.expected}}

The notes so far (REPRODUCTION.md):
{{work.report}}

Hand in the numbers you got for each one above, in the same order, the verdict, the steps you took after the runs (with their minutes), the fixes you made, and the whole report as it now stands in REPRODUCTION.md.`,
            outputs: [
              { id: 'verdict', label: 'Verdict', type: 'text', required: true, description: 'Reproduced, Close, Not reproduced, or Could not run, with the reason in a sentence' },
              { id: 'results', label: 'Numbers', type: 'table', required: true, columns: [{ id: 'metric', label: 'Metric', type: 'text' }, { id: 'setting', label: 'Row and column', type: 'text' }, { id: 'paper', label: 'The paper’s', type: 'number' }, { id: 'ours', label: 'Ours', type: 'number' }, { id: 'note', label: 'Note', type: 'text' }] },
              { id: 'steps', label: 'What it took after the runs', type: 'table', columns: [{ id: 'step', label: 'What', type: 'text' }, { id: 'minutes', label: 'Minutes', type: 'number' }, { id: 'ok', label: 'Went well', type: 'yesno' }, { id: 'note', label: 'Note', type: 'text' }] },
              { id: 'fixes', label: 'Changes and fixes', type: 'list' },
              { id: 'report', label: 'REPRODUCTION.md', type: 'markdown', required: true },
            ],
            failed: 'skip',
          },
        ],
      },
      {
        id: 'compare',
        title: 'Compare the numbers',
        do: 'code',
        language: 'javascript',
        with: {
          results: '{{work.results}}',
          after: '{{finish.results}}',
          verdict: '{{work.verdict}}',
          final: '{{finish.verdict}}',
          steps: '{{work.steps}}',
          later: '{{finish.steps}}',
          fixes: '{{work.fixes}}',
          more: '{{finish.fixes}}',
          hours: '{{work.hours}}',
          report: '{{work.report}}',
          finished: '{{finish.report}}',
          runs: '{{work.runs}}',
          waited: '{{waited.data}}',
        },
        code:
          LIST +
          String.raw`// Each number beside the paper's, the difference, and whether it is close enough: within half a point on a 0-100 scale
// (0.005 on a 0-1 scale), within 2% for larger numbers (times, counts); reproduced when all are. With runs that went on in
// Experiments, the numbers and the report are those of the agent that finished it, and the runs' time counts in the hours.
const later = rows(input.after).length > 0;
const results = rows(later ? input.after : input.results).map((x) => {
  const paper = typeof x.paper === 'number' ? x.paper : Number(x.paper);
  const ours = typeof x.ours === 'number' ? x.ours : Number(x.ours);
  const both = isFinite(paper) && isFinite(ours) && x.paper !== null && x.ours !== null;
  const diff = both ? Math.round((ours - paper) * 10000) / 10000 : null;
  const tol = Math.abs(paper) <= 1 && Math.abs(ours) <= 1 ? 0.005 : Math.abs(paper) <= 100 ? 0.5 : Math.abs(paper) * 0.02;
  return { metric: String(x.metric || ''), setting: String(x.setting || ''), paper: both || isFinite(paper) ? paper : null, ours: isFinite(ours) && x.ours !== null ? ours : null, difference: diff, close: both ? Math.abs(diff) <= tol : false, note: String(x.note || '') };
});
const close = results.filter((x) => x.close).length;
const matched = results.length > 0 && close === results.length;
// The runs in Experiments: from the first start to the last end.
const ran = rows(obj(input.waited).runs);
const starts = ran.map((r) => Number(r.startedAt)).filter((t) => t > 0);
const ends = ran.map((r) => Number(r.endedAt)).filter((t) => t > 0);
const runMinutes = starts.length && ends.length ? Math.max(0, Math.round((Math.max.apply(null, ends) - Math.min.apply(null, starts)) / 60000)) : null;
const ids = list(input.runs).map(String).filter(Boolean);
const all = rows(input.steps).concat(ids.length ? [{ step: 'Ran in Experiments (' + ids.length + (ids.length === 1 ? ' run' : ' runs') + ')', minutes: runMinutes, ok: ran.length ? ran.every((r) => r.status === 'done') : true, note: ran.map((r) => (r.name || r.id) + ': ' + r.status).join(', ') }] : []).concat(rows(input.later));
const steps = all.map((s, i) => ({ n: i + 1, step: String(s.step || ''), minutes: Number(s.minutes) || null, ok: s.ok !== false, note: String(s.note || '') }));
const hours = Math.round(((Number(input.hours) || 0) + (runMinutes || 0) / 60 + rows(input.later).reduce((t, s) => t + (Number(s.minutes) || 0), 0) / 60) * 10) / 10;
const fixes = list(input.fixes).concat(list(input.more)).map(String).filter((f, i, a) => f && a.indexOf(f) === i);
const verdict = String(input.final || input.verdict || (matched ? 'Reproduced' : results.length ? 'Not reproduced' : 'Could not run'));
const summary = results.length ? close + ' of ' + results.length + ' numbers within reach of the paper’s' + (matched ? ': reproduced.' : '.') : 'No numbers came out to compare.';
return { results, matched, summary, steps, verdict, fixes, hours: hours || null, report: String(input.finished || input.report || ''), runs: ids };`,
        outputs: [
          { id: 'results', label: 'Numbers', type: 'table', columns: REPRO_RESULTS },
          { id: 'matched', label: 'Reproduced', type: 'yesno' },
          { id: 'summary', label: 'In short', type: 'text' },
          { id: 'steps', label: 'What it took', type: 'table', columns: REPRO_STEPS },
          { id: 'verdict', label: 'Verdict', type: 'text' },
          { id: 'fixes', label: 'Changes and fixes', type: 'list' },
          { id: 'hours', label: 'Hours in all', type: 'number' },
          { id: 'report', label: 'Report', type: 'markdown' },
          { id: 'runs', label: 'Its runs in Experiments', type: 'list' },
        ],
        failed: 'agent',
      },
    ],
    outputs: {
      verdict: '{{compare.verdict}}',
      matched: '{{compare.matched}}',
      summary: '{{compare.summary}}',
      paper: '{{hints.title}}',
      results: '{{compare.results}}',
      setting: '{{plan.setting}}',
      steps: '{{compare.steps}}',
      fixes: '{{compare.fixes}}',
      hours: '{{compare.hours}}',
      report: '{{compare.report}}',
      folder: '{{work.folder}}',
      repo: '{{work.repo}}',
      runs: '{{compare.runs}}',
    },
  },
  answer: [
    { id: 'verdict', label: 'Verdict', type: 'text', required: true },
    { id: 'matched', label: 'Reproduced', type: 'yesno' },
    { id: 'summary', label: 'In short', type: 'text' },
    { id: 'paper', label: 'The paper', type: 'text' },
    { id: 'results', label: 'The numbers', type: 'table', required: true, columns: REPRO_RESULTS },
    { id: 'setting', label: 'The setting', type: 'markdown' },
    { id: 'steps', label: 'What it took', type: 'table', columns: REPRO_STEPS },
    { id: 'fixes', label: 'Changes and fixes', type: 'list' },
    { id: 'hours', label: 'Hours in all', type: 'number' },
    { id: 'report', label: 'Report', type: 'markdown', required: true },
    { id: 'folder', label: 'Work folder', type: 'text' },
    { id: 'repo', label: 'Repository', type: 'url' },
    { id: 'runs', label: 'Its runs in Experiments', type: 'list' },
  ],
  examples: [
    { id: 'dpr-nq', name: 'BM25 on BEIR’s SciFact', inputs: { paper: '2104.08663', target: 'Table 2: BM25 nDCG@10 on SciFact', limits: 'At most 1 hour, 20 GB of disk, no GPU' }, checks: ['{{answer.results}} is not empty', '{{answer.report}} is not empty'] },
    { id: 'colbert-msmarco', name: 'ColBERT on MS MARCO dev', inputs: { paper: '10.1145/3397271.3401075', code: 'https://github.com/stanford-futuredata/ColBERT', target: 'Table 1: ColBERT re-ranking MRR@10 on MS MARCO dev', limits: 'At most 4 hours, 100 GB of disk and 1 GPU' }, checks: ['{{answer.verdict}} is not empty'] },
  ],
};

// ---- Reviewer simulator ------------------------------------------------------------------------------------------------

/** The reviewers a panel draws from, in order: the method's expert, the area's, a sceptical empiricist, then two more. */
const REVIEWERS = [
  { name: 'The method’s expert', expertise: 'Knows this kind of method in depth', angle: 'Check the method itself: is it sound, are its assumptions stated and reasonable, is it really new next to the closest methods, and do the claims follow from it?' },
  { name: 'The area’s expert', expertise: 'Knows the field and its literature', angle: 'Check the place of the paper in its field: the related work it misses, the baselines and benchmarks the area expects, and whether the problem and the gain matter.' },
  { name: 'A sceptical empiricist', expertise: 'Reads the experiments first', angle: 'Check the evidence: are the baselines strong and tuned as fairly as the method, are there significance tests, seeds and variance, ablations that show where the gain comes from, leaks between training and test data, and results that are cherry-picked?' },
  { name: 'A careful reader from a neighbouring field', expertise: 'Reads it as a newcomer would', angle: 'Check the writing: is the motivation clear, is it self-contained, are the figures and tables readable, and are terms defined before they are used?' },
  { name: 'A reproducibility reviewer', expertise: 'Checks what others need to build on it', angle: 'Check what is released and stated: code, data, checkpoints, settings and compute to reproduce it, the limitations, and the possible harms.' },
];

const REVIEW_COLS: AnswerField['columns'] = [
  { id: 'n', label: 'Reviewer', type: 'number' },
  { id: 'reviewer', label: 'Who', type: 'text' },
  { id: 'expertise', label: 'Expertise', type: 'text' },
  { id: 'recommendation', label: 'Recommendation', type: 'text' },
  { id: 'overall', label: 'Overall', type: 'text' },
  { id: 'confidence', label: 'Confidence', type: 'text' },
  { id: 'summary', label: 'Summary', type: 'text' },
  { id: 'strengths', label: 'Strengths', type: 'text' },
  { id: 'weaknesses', label: 'Weaknesses', type: 'text' },
  { id: 'questions', label: 'Questions', type: 'text' },
];

const SCORE_COLS: AnswerField['columns'] = [
  { id: 'n', label: 'Reviewer', type: 'number' },
  { id: 'label', label: 'Score', type: 'text' },
  { id: 'score', label: 'Given', type: 'number' },
  { id: 'min', label: 'Lowest', type: 'number' },
  { id: 'max', label: 'Highest', type: 'number' },
];

const RISK_COLS: AnswerField['columns'] = [
  { id: 'n', label: 'Rank', type: 'number' },
  { id: 'weakness', label: 'Weakness', type: 'text' },
  { id: 'why', label: 'Why it could sink the paper', type: 'text' },
  { id: 'likelihood', label: 'How likely', type: 'text' },
  { id: 'fix', label: 'What fixes it', type: 'text' },
];

const ASK_COLS: AnswerField['columns'] = [
  { id: 'n', label: 'Rank', type: 'number' },
  { id: 'kind', label: 'Kind', type: 'text' },
  { id: 'what', label: 'What', type: 'text' },
  { id: 'why', label: 'Why reviewers will ask', type: 'text' },
  { id: 'effort', label: 'Effort', type: 'text' },
];

const REVIEWER_SIMULATOR: Draft = {
  id: 'reviewer-simulator',
  name: 'Reviewer simulator',
  icon: 'scale',
  color: 'amber',
  category: 'Writing',
  description: 'Reviews your draft on the venue’s own form and scores, and lists the baselines and ablations reviewers will ask for, the most dangerous first.',
  fields: [
    { id: 'paper', label: 'Your paper', type: 'text', required: true, placeholder: 'e.g. ~/papers/draft/main.pdf, or the LaTeX project’s folder', help: 'A PDF, a .tex file or a LaTeX project’s folder on this computer, or a link' },
    { id: 'upload', label: 'Or upload it', type: 'file', help: 'Its PDF' },
    { id: 'venue', label: 'The venue', type: 'choice', options: VENUE_NAMES, default: 'ACL Rolling Review', help: 'Each on its own review form (as of 2025: forms change a little each year)' },
    { id: 'reviewers', label: 'How many reviewers', type: 'number', default: '3', help: '1 to 5' },
    { id: 'focus', label: 'Anything to focus on', type: 'long', placeholder: 'e.g. whether the baselines are strong enough' },
  ],
  prompt: '',
  flow: {
    steps: [
      { id: 'paper_read', title: 'Read your paper', do: 'tool', tool: 'read_paper', with: { paper: '{{paper}}', upload: '{{upload}}', max_chars: 90000 } },
      {
        id: 'panel',
        title: 'Seat the reviewers',
        do: 'code',
        language: 'javascript',
        with: { venue: '{{venue}}', reviewers: '{{reviewers}}', read: '{{paper_read.data}}' },
        code:
          LIST +
          'const FORMS = ' +
          JSON.stringify(VENUES) +
          ';\nconst REVIEWERS = ' +
          JSON.stringify(REVIEWERS) +
          ';\n' +
          String.raw`// The venue's form (its fields and scores, in words for the reviewers) and the reviewers, each with an angle of their own.
const r = obj(input.read);
if (!list(r.parts).length) throw new Error('Your paper could not be read' + (list(r.notes).length ? ': ' + list(r.notes).join(' ') : '.'));
const form = FORMS.find((f) => f.name.toLowerCase() === String(input.venue || '').toLowerCase()) || FORMS[FORMS.length - 1];
const n = Math.max(1, Math.min(5, Math.round(Number(input.reviewers) || 3)));
const reviewers = REVIEWERS.slice(0, n).map((x, i) => ({ n: i + 1, name: x.name, expertise: x.expertise, angle: x.angle }));
const text =
  'The form’s fields, to write:\n' +
  form.fields.map((f) => '- ' + f.id + ' (' + f.label + '): ' + f.ask).join('\n') +
  '\n\nIts scores, to give (each by its id):\n' +
  form.scores.map((s) => '- ' + s.id + ' (' + s.label + ', ' + s.min + ' to ' + s.max + '): ' + s.meaning).join('\n') +
  '\n\nWhat reviewers at ' + form.name + ' weigh most: ' + form.weighs + '.';
return { venue: form.name, form: text, overall: form.overall, scales: form.scores.map((s) => ({ id: s.id, label: s.label, min: s.min, max: s.max })), reviewers, title: String(r.title || 'Your paper') };`,
        outputs: [
          { id: 'venue', label: 'Venue', type: 'text' },
          { id: 'form', label: 'Its form', type: 'markdown' },
          { id: 'overall', label: 'Its overall score', type: 'text' },
          { id: 'scales', label: 'Its scores', type: 'table', columns: [{ id: 'id', label: 'Id', type: 'text' }, { id: 'label', label: 'Score', type: 'text' }, { id: 'min', label: 'Lowest', type: 'number' }, { id: 'max', label: 'Highest', type: 'number' }] },
          { id: 'reviewers', label: 'Reviewers', type: 'table', columns: [{ id: 'n', label: 'Number', type: 'number' }, { id: 'name', label: 'Who', type: 'text' }, { id: 'expertise', label: 'Expertise', type: 'text' }, { id: 'angle', label: 'Their angle', type: 'text' }] },
          { id: 'title', label: 'Its title', type: 'text' },
        ],
        failed: 'agent',
      },
      {
        id: 'review',
        title: 'Each reviewer reviews it',
        do: 'repeat',
        over: '{{panel.reviewers}}',
        atOnce: 3,
        as: 'r',
        collect: 'one',
        steps: [
          {
            id: 'one',
            title: 'Fill in the review form',
            do: 'model',
            instructions: `You are reviewer {{r.n}} of a paper submitted to {{panel.venue}}: {{r.name}} ({{r.expertise}}). {{r.angle}}

Review it as a careful, fair and demanding reviewer at {{panel.venue}} would: specific (name the section, table, figure or page), honest about what is good, and clear about what would change your mind. Judge the paper as it is, not a better one it could have been. {{#focus}}The authors asked reviewers to look closely at: {{focus}}{{/focus}}

{{panel.form}}

Then, besides the form: its strengths and weaknesses (each weakness with how serious it is, Major or Minor, and its kind: Baselines, Ablations, Evaluation, Novelty, Soundness, Clarity, Related work or Reproducibility), the questions you would ask the authors, what is missing that reviewers will ask for (each a Baseline, an Ablation, an Analysis, a Dataset or a Citation: what exactly, and why), and your recommendation in a few words.

The paper: {{panel.title}}
${paperParts('paper_read')}`,
            outputs: [
              { id: 'summary', label: 'Summary', type: 'text', required: true },
              { id: 'fields', label: 'The form’s fields', type: 'table', required: true, columns: [{ id: 'id', label: 'Field', type: 'text' }, { id: 'text', label: 'What you wrote', type: 'text' }] },
              { id: 'scores', label: 'Scores', type: 'table', required: true, columns: [{ id: 'id', label: 'Score', type: 'text' }, { id: 'score', label: 'Given', type: 'number' }] },
              { id: 'strengths', label: 'Strengths', type: 'list' },
              { id: 'weaknesses', label: 'Weaknesses', type: 'table', columns: [{ id: 'point', label: 'Weakness', type: 'text' }, { id: 'severity', label: 'Major or Minor', type: 'text' }, { id: 'kind', label: 'Kind', type: 'text' }] },
              { id: 'questions', label: 'Questions', type: 'list' },
              { id: 'missing', label: 'Missing', type: 'table', columns: [{ id: 'kind', label: 'Kind', type: 'text' }, { id: 'what', label: 'What', type: 'text' }, { id: 'why', label: 'Why', type: 'text' }] },
              { id: 'recommendation', label: 'Recommendation', type: 'text' },
            ],
          },
        ],
      },
      {
        id: 'bundle',
        title: 'Lay the reviews side by side',
        do: 'code',
        language: 'javascript',
        with: { reviews: '{{review.items}}', reviewers: '{{panel.reviewers}}', scales: '{{panel.scales}}', overall: '{{panel.overall}}', venue: '{{panel.venue}}' },
        code:
          LIST +
          String.raw`// Each review as the area chair reads it, its scores on the form's scales, and the average of the overall score.
const who = rows(input.reviewers);
const scales = rows(input.scales);
const got = list(input.reviews);
const cards = [];
const scores = [];
const parts = [];
let sum = 0;
let k = 0;
who.forEach((w, i) => {
  const r = obj(got[i]);
  const sc = rows(r.scores);
  const pick = (id) => sc.find((s) => String(s.id).toLowerCase() === id);
  for (const s of scales) {
    const x = pick(s.id);
    const v = x ? Math.max(s.min, Math.min(s.max, Number(x.score))) : null;
    if (v !== null && isFinite(v)) scores.push({ n: w.n, label: s.label, score: v, min: s.min, max: s.max });
  }
  const ov = scales.find((s) => s.id === input.overall);
  const ovs = ov ? scores.find((s) => s.n === w.n && s.label === ov.label) : null;
  if (ovs) {
    sum += (ovs.score - ovs.min) / (ovs.max - ovs.min);
    k++;
  }
  const conf = scores.find((s) => s.n === w.n && s.label === 'Confidence');
  const weak = rows(r.weaknesses);
  const bullets = (xs) => xs.map((x) => '• ' + x).join('\n');
  cards.push({
    n: w.n,
    reviewer: w.name,
    expertise: w.expertise,
    recommendation: String(r.recommendation || ''),
    overall: ovs ? ovs.score + ' / ' + ovs.max : '',
    confidence: conf ? conf.score + ' / ' + conf.max : '',
    summary: String(r.summary || ''),
    strengths: bullets(list(r.strengths).map(String)),
    weaknesses: bullets(weak.map((x) => x.point + (x.severity ? ' (' + x.severity + ')' : ''))),
    questions: bullets(list(r.questions).map(String)),
  });
  parts.push(
    '## Reviewer ' + w.n + ' (' + w.name + ')' + (ovs ? ': ' + ov.label + ' ' + ovs.score + ' of ' + ovs.max : '') + '\n\n' +
      rows(r.fields).map((f) => '**' + f.id + '**\n' + f.text).join('\n\n') +
      (weak.length ? '\n\n**Weaknesses**\n' + weak.map((x, j) => 'W' + (j + 1) + '. ' + x.point + ' [' + (x.severity || 'Minor') + ', ' + (x.kind || 'Other') + ']').join('\n') : '') +
      (list(r.questions).length ? '\n\n**Questions**\n' + list(r.questions).map((q, j) => 'Q' + (j + 1) + '. ' + q).join('\n') : '') +
      (rows(r.missing).length ? '\n\n**Missing**\n' + rows(r.missing).map((m) => '- ' + m.kind + ': ' + m.what + ' (' + m.why + ')').join('\n') : ''),
  );
});
const average = k ? Math.round((sum / k) * 100) / 100 : null;
return { cards, scores, text: parts.join('\n\n'), average };`,
        outputs: [
          { id: 'cards', label: 'Reviews', type: 'table', columns: REVIEW_COLS },
          { id: 'scores', label: 'Scores', type: 'table', columns: SCORE_COLS },
          { id: 'text', label: 'The reviews as text', type: 'markdown' },
          { id: 'average', label: 'Average overall, 0 to 1', type: 'number' },
        ],
        failed: 'agent',
      },
      {
        id: 'meta',
        title: 'Write the meta-review',
        do: 'model',
        instructions: `You are the area chair at {{panel.venue}} for the paper "{{panel.title}}". Here are its reviews. Write the meta-review, then what the authors must do before they submit:

- verdict: the likely outcome in a few words ("Borderline: weak reject", "Accept with minor changes").
- meta: the meta-review in Markdown, as an area chair writes it: the consensus, the disagreements and who is right, and what decided it.
- risks: the weaknesses ranked by how likely each is to sink the paper, the most dangerous first: what it is, why it could sink it, how likely (High, Medium or Low), and what fixes it.
- asks: the baselines, ablations and analyses reviewers will ask for, the most dangerous first: its kind (Baseline, Ablation, Analysis, Dataset or Citation), what exactly, why reviewers will ask, and the effort (hours, days or weeks).
- checklist: what to fix before submitting, one short line each, in the order to do them.

{{bundle.text}}`,
        outputs: [
          { id: 'verdict', label: 'Verdict', type: 'text', required: true },
          { id: 'meta', label: 'Meta-review', type: 'markdown', required: true },
          { id: 'risks', label: 'What could sink it', type: 'table', required: true, columns: [{ id: 'weakness', label: 'Weakness', type: 'text' }, { id: 'why', label: 'Why', type: 'text' }, { id: 'likelihood', label: 'How likely', type: 'text' }, { id: 'fix', label: 'What fixes it', type: 'text' }] },
          { id: 'asks', label: 'What reviewers will ask for', type: 'table', required: true, columns: [{ id: 'kind', label: 'Kind', type: 'text' }, { id: 'what', label: 'What', type: 'text' }, { id: 'why', label: 'Why', type: 'text' }, { id: 'effort', label: 'Effort', type: 'text' }] },
          { id: 'checklist', label: 'Before you submit', type: 'list', required: true },
        ],
      },
      {
        id: 'final',
        title: 'Rank what to do',
        do: 'code',
        language: 'javascript',
        with: { risks: '{{meta.risks}}', asks: '{{meta.asks}}', text: '{{bundle.text}}', meta: '{{meta.meta}}', verdict: '{{meta.verdict}}', venue: '{{panel.venue}}' },
        code:
          LIST +
          String.raw`// The weaknesses by how likely each sinks the paper (High, then Medium, then Low, as ranked within each), the asks as
// ranked, numbered; and every review with the meta-review as one text, for answering them.
const rank = { high: 0, medium: 1, low: 2 };
const risks = rows(input.risks)
  .map((x, i) => ({ x, i, r: rank[String(x.likelihood || '').trim().toLowerCase()] ?? 1 }))
  .sort((a, b) => a.r - b.r || a.i - b.i)
  .map((y, i) => ({ n: i + 1, weakness: String(y.x.weakness || ''), why: String(y.x.why || ''), likelihood: String(y.x.likelihood || 'Medium'), fix: String(y.x.fix || '') }));
const asks = rows(input.asks).map((x, i) => ({ n: i + 1, kind: String(x.kind || ''), what: String(x.what || ''), why: String(x.why || ''), effort: String(x.effort || '') }));
const reviews = '# Reviews (' + input.venue + ', simulated)\n\n' + String(input.text || '') + '\n\n## Meta-review\n\n' + String(input.verdict || '') + '\n\n' + String(input.meta || '');
return { risks, asks, reviews };`,
        outputs: [
          { id: 'risks', label: 'What could sink it', type: 'table', columns: RISK_COLS },
          { id: 'asks', label: 'What reviewers will ask for', type: 'table', columns: ASK_COLS },
          { id: 'reviews', label: 'The reviews as text', type: 'markdown' },
        ],
        failed: 'agent',
      },
    ],
    outputs: {
      verdict: '{{meta.verdict}}',
      venue: '{{panel.venue}}',
      title: '{{panel.title}}',
      average: '{{bundle.average}}',
      reviews: '{{bundle.cards}}',
      scores: '{{bundle.scores}}',
      meta: '{{meta.meta}}',
      risks: '{{final.risks}}',
      asks: '{{final.asks}}',
      checklist: '{{meta.checklist}}',
      reviews_text: '{{final.reviews}}',
    },
  },
  answer: [
    { id: 'verdict', label: 'Verdict', type: 'text', required: true },
    { id: 'venue', label: 'Venue', type: 'text' },
    { id: 'title', label: 'The paper', type: 'text' },
    { id: 'average', label: 'Average overall, 0 to 1', type: 'number' },
    { id: 'reviews', label: 'Reviews', type: 'table', required: true, columns: REVIEW_COLS },
    { id: 'scores', label: 'Scores', type: 'table', columns: SCORE_COLS },
    { id: 'meta', label: 'Meta-review', type: 'markdown', required: true },
    { id: 'risks', label: 'What could sink it', type: 'table', columns: RISK_COLS },
    { id: 'asks', label: 'Baselines and ablations to add', type: 'table', columns: ASK_COLS },
    { id: 'checklist', label: 'Before you submit', type: 'list' },
    { id: 'reviews_text', label: 'The reviews as text', type: 'markdown' },
  ],
  examples: [
    { id: 'colbert-at-sigir', name: 'A retrieval paper at SIGIR', inputs: { paper: 'https://arxiv.org/abs/2004.12832', venue: 'SIGIR', reviewers: '3' }, checks: ['{{answer.reviews}} is not empty', '{{answer.asks}} is not empty', '{{answer.meta}} is not empty'] },
    { id: 'two-at-iclr', name: 'Two reviewers at ICLR, on the baselines', inputs: { paper: '1706.03762', venue: 'ICLR', reviewers: '2', focus: 'whether the baselines are strong enough' }, checks: ['{{answer.checklist}} is not empty'] },
  ],
};

// ---- Rebuttal workbench ------------------------------------------------------------------------------------------------

const POINT_COLS: AnswerField['columns'] = [
  { id: 'n', label: 'Point', type: 'number' },
  { id: 'point', label: 'What they say', type: 'text' },
  { id: 'kind', label: 'Kind', type: 'text' },
  { id: 'reviewers', label: 'Raised by', type: 'text' },
  { id: 'quotes', label: 'Their words', type: 'text' },
  { id: 'reply', label: 'Your reply', type: 'text' },
  { id: 'length', label: 'Length', type: 'number' },
  { id: 'budget', label: 'Its share of the limit', type: 'number' },
  { id: 'cites', label: 'Cites', type: 'text' },
];

const TODO_COLS: AnswerField['columns'] = [
  { id: 'n', label: 'Point', type: 'number' },
  { id: 'what', label: 'What', type: 'text' },
  { id: 'point', label: 'For', type: 'text' },
];

const REBUTTAL: Draft = {
  id: 'rebuttal-workbench',
  name: 'Rebuttal workbench',
  icon: 'message-square',
  color: 'violet',
  category: 'Writing',
  description: 'The reviews’ points grouped across reviewers and sorted (misread, needs an experiment, needs words), replies drafted within the limit, and the experiments and changes to tick off.',
  fields: [
    { id: 'reviews', label: 'The reviews', type: 'long', required: true, placeholder: 'Paste them all, each with its reviewer (Reviewer 1, R2, Reviewer xYz1…)' },
    { id: 'paper', label: 'Your paper', type: 'text', placeholder: 'e.g. ~/papers/draft/main.pdf', help: 'A PDF, a .tex file or a LaTeX project’s folder, or a link: to cite its sections' },
    { id: 'upload', label: 'Or upload it', type: 'file' },
    { id: 'limit', label: 'The limit', type: 'text', default: '2,500 characters per reviewer', help: 'As the venue sets it: characters or words, per reviewer, per point or in all' },
    { id: 'tone', label: 'Tone', type: 'choice', options: ['Courteous and firm', 'Warm and grateful', 'Brief and to the point'], default: 'Courteous and firm' },
  ],
  prompt: '',
  flow: {
    steps: [
      {
        id: 'split',
        title: 'Split the reviews',
        do: 'code',
        language: 'javascript',
        with: { reviews: '{{reviews}}', limit: '{{limit}}' },
        code: String.raw`// The reviews, each with who wrote it: split where one begins ("Reviewer 2", "R2:", "Review #3", "Official Review of
// Submission 12 by Reviewer xYz1", "Meta-review"), else one review. And the limit as the venue sets it.
const text = String(input.reviews || '').replace(/\r\n?/g, '\n').trim();
const heads = [
  /^\s*(?:#{1,4}\s*)?(?:\*\*)?\s*official\s+review\s+of\s+.*?\bby\s+(?:reviewer\s+)?([A-Za-z0-9]{1,12})\b.*$/i,
  /^\s*(?:#{1,4}\s*)?(?:\*\*)?\s*(meta[- ]?review(?:er)?)\b.*$/i,
  /^\s*(?:#{1,4}\s*)?(?:\*\*)?\s*(?:[Oo]fficial\s+)?(?:REVIEW(?:ER)?|[Rr]eview(?:er)?)\s*(?:#|[Nn]o\.?|[Nn]umber)?\s*(\d{1,2}|[A-Za-z]*\d[A-Za-z0-9]*|[A-Z][A-Za-z0-9]{2,7})\s*(?:\*\*)?\s*(?:[:.)-]\s*(.*))?$/,
  /^\s*(?:\*\*)?\s*R\s?(\d{1,2})\s*(?:\*\*)?\s*[:.)-]\s*(.*)$/,
];
const reviewers = [];
let cur = null;
for (const line of text.split('\n')) {
  let hit = null;
  for (const re of heads) {
    const m = re.exec(line);
    if (m && line.length < 160) {
      hit = m;
      break;
    }
  }
  if (hit) {
    const raw = hit[1];
    const name = /^meta/i.test(raw) ? 'Meta' : /^\d+$/.test(raw) ? 'R' + raw : raw;
    cur = reviewers.find((r) => r.name === name) || null;
    if (!cur) {
      cur = { name, text: '' };
      reviewers.push(cur);
    }
    if (hit[2] && hit[2].trim()) cur.text += hit[2].trim() + '\n';
    continue;
  }
  if (!cur) {
    cur = { name: 'R1', text: '' };
    reviewers.push(cur);
  }
  cur.text += line + '\n';
}
const kept = reviewers.map((r, i) => ({ n: i + 1, name: r.name, text: r.text.trim() })).filter((r) => r.text.length > 20);
if (!kept.length) throw new Error('No review was found in what you pasted.');
// The limit: a number, characters or words (a page is about 3,500 characters), per reviewer, per point or in all.
const lim = String(input.limit || '').toLowerCase().replace(/(\d),(\d)/g, '$1$2');
const num = /(\d+(?:\.\d+)?)\s*(k\b)?/.exec(lim);
let n = num ? Number(num[1]) * (num[2] ? 1000 : 1) : 2500;
let unit = /word/.test(lim) ? 'words' : 'characters';
if (/page/.test(lim)) {
  n = Math.round(n * 3500);
  unit = 'characters';
}
const per = /in all|total|overall|whole|altogether|entire/.test(lim) ? 'all' : /point|question|comment|concern/.test(lim) ? 'point' : 'reviewer';
const said = n.toLocaleString('en-US') + ' ' + unit + (per === 'all' ? ' in all' : per === 'point' ? ' per point' : ' per reviewer');
return { reviewers: kept, n, unit, per, limit: said };`,
        outputs: [
          { id: 'reviewers', label: 'Reviews', type: 'table', columns: [{ id: 'n', label: 'Number', type: 'number' }, { id: 'name', label: 'Reviewer', type: 'text' }, { id: 'text', label: 'Review', type: 'text' }] },
          { id: 'n', label: 'The limit', type: 'number' },
          { id: 'unit', label: 'Counted in', type: 'text' },
          { id: 'per', label: 'For each', type: 'text' },
          { id: 'limit', label: 'The limit, in words', type: 'text' },
        ],
        failed: 'agent',
      },
      {
        id: 'has_paper',
        title: 'Is the paper here?',
        do: 'decide',
        rule: '{{paper}} is not empty or {{upload}} is not empty',
        then: [{ id: 'paper_read', title: 'Read your paper', do: 'tool', tool: 'read_paper', with: { paper: '{{paper}}', upload: '{{upload}}', max_chars: 150000 }, failed: 'skip' }],
      },
      {
        id: 'points',
        title: 'Pull out each reviewer’s points',
        do: 'repeat',
        over: '{{split.reviewers}}',
        atOnce: 3,
        as: 'rv',
        collect: 'pull',
        steps: [
          {
            id: 'pull',
            title: 'Pull out the points',
            do: 'model',
            instructions: `Pull out every point this reviewer makes that the authors should answer in their rebuttal: each concern, criticism, question or request, in the order the review makes them. For each:
- point: the concern in one plain sentence;
- quote: the reviewer's own words for it, copied exactly (one or two sentences);
- kind: "Misread" when the paper already answers it and the reviewer missed or misread it, "Needs an experiment" when only a new result or analysis can answer it, "Needs words" when a clarification, a justification, a discussion or a citation answers it, "Minor" for typos and small fixes of presentation;
- severity: Major or Minor.
{{#paper_read.data.sections}}
What the paper has, to tell what it already says: its sections are {{paper_read.data.sections}}. Its abstract: {{paper_read.data.abstract}}
{{/paper_read.data.sections}}
Reviewer {{rv.name}}:
{{rv.text}}`,
            outputs: [
              { id: 'points', label: 'Points', type: 'table', required: true, columns: [{ id: 'point', label: 'Point', type: 'text' }, { id: 'quote', label: 'Their words', type: 'text' }, { id: 'kind', label: 'Kind', type: 'text' }, { id: 'severity', label: 'Severity', type: 'text' }] },
            ],
          },
        ],
      },
      {
        id: 'numbered',
        title: 'Number the points',
        do: 'code',
        language: 'javascript',
        with: { got: '{{points.items}}', reviewers: '{{split.reviewers}}' },
        code:
          LIST +
          String.raw`// Every point with an id of its own (R1.2: reviewer R1's second), and all of them as lines to group.
const who = rows(input.reviewers);
const got = list(input.got);
const items = [];
who.forEach((w, i) => rows(obj(got[i]).points).forEach((p, j) => items.push({ id: w.name + '.' + (j + 1), reviewer: w.name, point: String(p.point || ''), quote: String(p.quote || ''), kind: String(p.kind || 'Needs words'), severity: String(p.severity || 'Minor') })));
if (!items.length) throw new Error('No points were found in the reviews.');
const text = items.map((p) => p.id + ' [' + p.kind + ', ' + p.severity + '] ' + p.point + ' — “' + p.quote.slice(0, 300) + '”').join('\n');
return { items, text, count: items.length };`,
        outputs: [
          {
            id: 'items',
            label: 'Points',
            type: 'table',
            columns: [
              { id: 'id', label: 'Id', type: 'text' },
              { id: 'reviewer', label: 'Reviewer', type: 'text' },
              { id: 'point', label: 'Point', type: 'text' },
              { id: 'quote', label: 'Their words', type: 'text' },
              { id: 'kind', label: 'Kind', type: 'text' },
              { id: 'severity', label: 'Severity', type: 'text' },
            ],
          },
          { id: 'text', label: 'As lines', type: 'markdown' },
          { id: 'count', label: 'How many', type: 'number' },
        ],
        failed: 'agent',
      },
      {
        id: 'merged',
        title: 'Merge the same points',
        do: 'model',
        instructions: `Here are the points reviewers made on a paper, each with its id. Group the points that make the same point (the same concern, even in other words), across reviewers and within a review; a point unlike any other is a group of its own, and every id goes in exactly one group. For each group:
- point: the shared concern in one plain sentence;
- kind: Misread, Needs an experiment, Needs words or Minor (when its points differ, the one that asks most of the authors);
- ids: its points' ids, between commas;
- priority: 1 for the group most likely to decide the outcome, then 2, 3…: major concerns several reviewers share first, minor ones last.

{{numbered.text}}`,
        outputs: [
          { id: 'groups', label: 'Groups', type: 'table', required: true, columns: [{ id: 'point', label: 'Point', type: 'text' }, { id: 'kind', label: 'Kind', type: 'text' }, { id: 'ids', label: 'Ids', type: 'text' }, { id: 'priority', label: 'Priority', type: 'number' }] },
        ],
      },
      {
        id: 'context',
        title: 'Find what the paper says on each',
        do: 'code',
        language: 'javascript',
        with: { groups: '{{merged.groups}}', items: '{{numbered.items}}', parts: '{{paper_read.data.parts}}', n: '{{split.n}}', unit: '{{split.unit}}', per: '{{split.per}}', reviewers: '{{split.reviewers}}' },
        code:
          LIST +
          String.raw`// Each group of points with its reviewers and their words, its share of the limit, and the passages of the paper that
// share the most telling words with it (with their section or page), to cite. A point no group took is a group of its own.
const items = rows(input.items);
const used = new Set();
const groups = rows(input.groups).map((g) => {
  const ids = String(g.ids || '').split(/[,\s;]+/).filter((id) => items.some((p) => p.id === id) && !used.has(id));
  ids.forEach((id) => used.add(id));
  return { point: String(g.point || ''), kind: String(g.kind || 'Needs words'), priority: Number(g.priority) || 99, ids };
});
for (const p of items) if (!used.has(p.id)) groups.push({ point: p.point, kind: p.kind, priority: 100, ids: [p.id] });
const kept = groups.filter((g) => g.ids.length).sort((a, b) => a.priority - b.priority);
// The paper in passages, each with where it is.
const passages = [];
let where = '';
for (const part of list(input.parts).map(String)) {
  for (const para of part.split(/\n{2,}/)) {
    const h = /^(?:#{1,4}\s+(.+)|\[Page (\d+)\]|\\(?:sub)*section\*?\{([^}]+)\}|(\d+(?:\.\d+)*\s+[A-Z][^\n]{2,60}))$/m.exec(para);
    if (h) where = h[1] || (h[2] ? 'p. ' + h[2] : '') || h[3] || h[4] || where;
    if (para.trim().length > 80) passages.push({ where, text: para.trim().slice(0, 1500) });
  }
}
const STOP = new Set('the a an and or of to in on for with by at from as is are was were be been it its this that these those what which who how does do did can could should would will not no you we they our your their there than then so if about into also only any each other all more most some such paper authors reviewer'.split(' '));
const words = (t) => (String(t).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2 && !STOP.has(w));
const df = {};
const docs = passages.map((p) => words(p.text));
for (const d of docs) for (const w of new Set(d)) df[w] = (df[w] || 0) + 1;
const N = docs.length || 1;
const near = (q) => {
  const qs = new Set(words(q));
  return passages
    .map((p, i) => ({ p, s: docs[i].reduce((a, w) => a + (qs.has(w) ? Math.log(1 + N / df[w]) : 0), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map((x) => '[' + (x.p.where || 'the paper') + '] ' + x.p.text)
    .join('\n\n')
    .slice(0, 6000);
};
// Its share of the limit: a reviewer's limit shared among their points, the whole among all, or the limit itself.
const n = Number(input.n) || 2500;
const count = {};
for (const g of kept) for (const r of new Set(g.ids.map((id) => id.split('.')[0]))) count[r] = (count[r] || 0) + 1;
const out = kept.map((g, i) => {
  const who = [...new Set(g.ids.map((id) => id.split('.')[0]))];
  const share = input.per === 'point' ? n : input.per === 'all' ? Math.floor((n * 0.92) / kept.length) : Math.min(...who.map((r) => Math.floor((n * 0.92) / count[r])));
  const quotes = g.ids.map((id) => {
    const p = items.find((x) => x.id === id);
    return id.split('.')[0] + ': “' + p.quote + '”';
  });
  return { n: i + 1, point: g.point, kind: g.kind, reviewers: who.join(', '), ids: g.ids.join(', '), quotes: quotes.join('\n'), budget: Math.max(input.unit === 'words' ? 40 : 250, share), unit: input.unit === 'words' ? 'words' : 'characters', passages: near(g.point + ' ' + quotes.join(' ')) };
});
return { items: out, count: out.length };`,
        outputs: [
          {
            id: 'items',
            label: 'Points to answer',
            type: 'table',
            columns: [
              { id: 'n', label: 'Point', type: 'number' },
              { id: 'point', label: 'What they say', type: 'text' },
              { id: 'kind', label: 'Kind', type: 'text' },
              { id: 'reviewers', label: 'Raised by', type: 'text' },
              { id: 'ids', label: 'Their points', type: 'text' },
              { id: 'quotes', label: 'Their words', type: 'text' },
              { id: 'budget', label: 'Its share of the limit', type: 'number' },
              { id: 'unit', label: 'Counted in', type: 'text' },
              { id: 'passages', label: 'From the paper', type: 'text' },
            ],
          },
          { id: 'count', label: 'How many', type: 'number' },
        ],
        failed: 'agent',
      },
      {
        id: 'drafts',
        title: 'Draft each reply',
        do: 'repeat',
        over: '{{context.items}}',
        atOnce: 3,
        as: 'g',
        collect: 'reply',
        steps: [
          {
            id: 'reply',
            title: 'Draft the reply',
            do: 'model',
            instructions: `Draft the authors' reply to one point of their paper's reviews, for the rebuttal. Tone: {{tone}}. At most {{g.budget}} {{g.unit}}, and shorter is better: answer the substance first, with no thanks unless it comes naturally.
- If the paper already answers it (a misreading), say where (its section or page, from the passages below), quote it if that is short, and offer to make it clearer.
- If it needs an experiment, say what you will run (or have run) and why it answers the point, with the results as [placeholders] to fill in. Never invent results.
- If it needs words, give the clarification or the justification, and say what you will add to the paper and where.
- Cite the paper as "§3.2", "Table 2" or "p. 5", from the passages.
Then: kind (Misread, Needs an experiment, Needs words or Minor, as the reply turned out), what it cites, the experiment to run (if any) and the change to make in the paper (if any), each in a line.

The point: {{g.point}}
Raised by: {{g.reviewers}}
Their words:
{{g.quotes}}
{{#g.passages}}
From the paper:
{{g.passages}}{{/g.passages}}`,
            outputs: [
              { id: 'reply', label: 'Reply', type: 'text', required: true },
              { id: 'kind', label: 'Kind', type: 'text' },
              { id: 'cites', label: 'Cites', type: 'list' },
              { id: 'experiment', label: 'Experiment to run', type: 'text' },
              { id: 'change', label: 'Change to make', type: 'text' },
            ],
            failed: 'skip',
          },
        ],
      },
      {
        id: 'assemble',
        title: 'Put the rebuttal together',
        do: 'code',
        language: 'javascript',
        with: { items: '{{context.items}}', drafts: '{{drafts.items}}', reviewers: '{{split.reviewers}}', n: '{{split.n}}', unit: '{{split.unit}}', per: '{{split.per}}', limit: '{{split.limit}}' },
        code:
          LIST +
          String.raw`// Each point with its draft and its length against its share; the experiments and changes to do; each reviewer's reply
// (their points' replies, in their order) against the limit; and the whole rebuttal, to copy.
const items = rows(input.items);
const drafts = list(input.drafts);
const words = input.unit === 'words';
const size = (t) => (words ? (String(t).match(/\S+/g) || []).length : String(t).length);
const points = items.map((it, i) => {
  const d = obj(drafts[i]);
  const reply = String(d.reply || '');
  return { n: it.n, point: it.point, kind: String(d.kind || it.kind), reviewers: it.reviewers, ids: it.ids, quotes: it.quotes, reply, length: size(reply), budget: Number(it.budget) || 0, cites: list(d.cites).join(', '), experiment: String(d.experiment || '').trim(), change: String(d.change || '').trim() };
});
const none = /^(none|n\/a|no|nothing|-)?\.?$/i;
const experiments = points.filter((p) => p.experiment && !none.test(p.experiment)).map((p) => ({ n: p.n, what: p.experiment, point: p.point }));
const changes = points.filter((p) => p.change && !none.test(p.change)).map((p) => ({ n: p.n, what: p.change, point: p.point }));
const n = Number(input.n) || 0;
const per = rows(input.reviewers)
  .filter((r) => r.name !== 'Meta')
  .map((r) => {
    const mine = points.filter((p) => p.ids.split(', ').some((id) => id.split('.')[0] === r.name));
    const text = mine.map((p, j) => '**' + (j + 1) + '. ' + p.point + '**\n' + p.reply).join('\n\n');
    return { reviewer: r.name, points: mine.length, text, length: size(text) };
  });
const rebuttal = input.per === 'all' || per.length < 2 ? points.map((p) => '**' + p.n + '. ' + p.point + '** (' + p.reviewers + ')\n' + p.reply).join('\n\n') : per.map((r) => '## Response to ' + r.reviewer + '\n\n' + r.text).join('\n\n');
const total = size(rebuttal);
const reviewers = per.map((r) => ({ reviewer: r.reviewer, points: r.points, length: r.length, limit: input.per === 'reviewer' ? n : null, over: input.per === 'reviewer' && n > 0 && r.length > n }));
const by = (k) => points.filter((p) => p.kind === k).length;
const summary = points.length + ' points from ' + per.length + ' reviewer' + (per.length === 1 ? '' : 's') + ': ' + [[by('Misread'), 'misread'], [by('Needs an experiment'), 'need an experiment'], [by('Needs words'), 'need words'], [by('Minor'), 'minor']].filter((x) => x[0]).map((x) => x[0] + ' ' + x[1]).join(', ') + '.';
return { points: points.map(({ ids, experiment, change, ...p }) => p), experiments, changes, rebuttal, reviewers, summary, total, over: input.per === 'all' && n > 0 && total > n };`,
        outputs: [
          { id: 'points', label: 'Points', type: 'table', columns: POINT_COLS },
          { id: 'experiments', label: 'Experiments to run', type: 'table', columns: TODO_COLS },
          { id: 'changes', label: 'Changes to make', type: 'table', columns: TODO_COLS },
          { id: 'rebuttal', label: 'The whole rebuttal', type: 'markdown' },
          {
            id: 'reviewers',
            label: 'Each reviewer’s reply',
            type: 'table',
            columns: [{ id: 'reviewer', label: 'Reviewer', type: 'text' }, { id: 'points', label: 'Points', type: 'number' }, { id: 'length', label: 'Length', type: 'number' }, { id: 'limit', label: 'Limit', type: 'number' }, { id: 'over', label: 'Over the limit', type: 'yesno' }],
          },
          { id: 'summary', label: 'In short', type: 'text' },
          { id: 'total', label: 'Length in all', type: 'number' },
          { id: 'over', label: 'Over the limit in all', type: 'yesno' },
        ],
        failed: 'agent',
      },
    ],
    outputs: {
      summary: '{{assemble.summary}}',
      points: '{{assemble.points}}',
      experiments: '{{assemble.experiments}}',
      changes: '{{assemble.changes}}',
      rebuttal: '{{assemble.rebuttal}}',
      reviewers: '{{assemble.reviewers}}',
      total: '{{assemble.total}}',
      limit: '{{split.limit}}',
      unit: '{{split.unit}}',
    },
  },
  answer: [
    { id: 'summary', label: 'In short', type: 'text', required: true },
    { id: 'points', label: 'Points and replies', type: 'table', required: true, columns: POINT_COLS },
    { id: 'experiments', label: 'Experiments to run', type: 'table', columns: TODO_COLS },
    { id: 'changes', label: 'Changes to make', type: 'table', columns: TODO_COLS },
    { id: 'rebuttal', label: 'The whole rebuttal', type: 'markdown', required: true },
    {
      id: 'reviewers',
      label: 'Each reviewer’s reply',
      type: 'table',
      columns: [{ id: 'reviewer', label: 'Reviewer', type: 'text' }, { id: 'points', label: 'Points', type: 'number' }, { id: 'length', label: 'Length', type: 'number' }, { id: 'limit', label: 'Limit', type: 'number' }, { id: 'over', label: 'Over the limit', type: 'yesno' }],
    },
    { id: 'total', label: 'Length in all', type: 'number' },
    { id: 'limit', label: 'The limit', type: 'text' },
    { id: 'unit', label: 'Counted in', type: 'text' },
  ],
  examples: [
    {
      id: 'two-reviewers',
      name: 'Two reviews, one shared point',
      inputs: {
        reviews:
          'Reviewer 1\nThe paper does not compare with ColBERTv2, which is the obvious baseline. The ablation of the distillation loss is missing. Table 3 is hard to read.\n\nReviewer 2\nI am not convinced the gains hold without a comparison to ColBERTv2. How are the hyperparameters tuned? Section 4.2 should say which split is used.',
        limit: '2,500 characters per reviewer',
      },
      checks: ['{{answer.points}} is not empty', '{{numbered.count}} >= 4', '{{answer.rebuttal}} contains Response to'],
    },
    {
      id: 'in-all',
      name: 'One limit for the whole rebuttal',
      inputs: { reviews: 'R1: The method is not novel: it is a small change to prior work. The experiments use one dataset only.\nR2: Please add a significance test for Table 2.', limit: '4000 characters in all', tone: 'Brief and to the point' },
      checks: ['{{answer.points}} is not empty', '{{answer.total}} > 0'],
    },
  ],
};

// ---- Paper to talk, poster and thread ---------------------------------------------------------------------------------------

const TALK_COLS: AnswerField['columns'] = [
  { id: 'n', label: 'Slide', type: 'number' },
  { id: 'title', label: 'Title', type: 'text' },
  { id: 'minutes', label: 'Minutes', type: 'number' },
  { id: 'points', label: 'Points', type: 'text' },
  { id: 'figure', label: 'Figure', type: 'text' },
  { id: 'equation', label: 'Equation', type: 'text' },
  { id: 'notes', label: 'What to say', type: 'text' },
];

const MADE_COLS: AnswerField['columns'] = [
  { id: 'what', label: 'What', type: 'text' },
  { id: 'title', label: 'Title', type: 'text' },
  { id: 'page', label: 'Its page', type: 'text' },
  { id: 'note', label: 'Note', type: 'text' },
];

/** What an agent that makes something for the Library hands in. */
const MADE_OUT: AnswerField[] = [
  { id: 'page', label: 'Its page', type: 'text', required: true, description: 'The id save_slides, save_latex or save_page gave it' },
  { id: 'title', label: 'Its title', type: 'text' },
  { id: 'note', label: 'Note', type: 'text', description: 'Anything to check or finish, in a sentence' },
];

const TALK_SOURCE = `The paper: {{check.title}}{{#check.folder}}
Its LaTeX source, with its figures: {{check.folder}}{{#check.main}} (main file {{check.main}}){{/check.main}}{{/check.folder}}{{#paper_read.data.sourceUrl}}
Its LaTeX source on arXiv, with its figures: {{paper_read.data.sourceUrl}} (a .tar.gz){{/paper_read.data.sourceUrl}}{{#paper_read.data.pdf}}
Its PDF: {{paper_read.data.pdf}}{{/paper_read.data.pdf}}
{{#check.figures}}Its figures:
{{check.figures}}
{{/check.figures}}`;

const PAPER_TO_TALK: Draft = {
  id: 'paper-to-talk',
  name: 'Paper to talk, poster and thread',
  icon: 'graduation-cap',
  color: 'pink',
  category: 'Writing',
  description: 'Slides from your paper with its real figures and equations, timed, with notes; an A0 poster; a thread for X, Bluesky and LinkedIn; and a project page.',
  fields: [
    { id: 'paper', label: 'Your paper', type: 'text', required: true, placeholder: 'e.g. ~/papers/colbert (its LaTeX project), a PDF or a link', help: 'Its LaTeX project’s folder is best, for its figures; or a .tex file, a PDF, an arXiv id or a link' },
    { id: 'upload', label: 'Or upload it', type: 'file' },
    { id: 'minutes', label: 'The talk’s length, in minutes', type: 'number', default: '15' },
    { id: 'audience', label: 'Audience', type: 'choice', options: ['Researchers in the field', 'Researchers in other fields', 'A general audience'], default: 'Researchers in the field' },
    { id: 'slides', label: 'Slides', type: 'yesno', default: 'Yes' },
    { id: 'poster', label: 'An A0 poster', type: 'yesno', default: 'Yes' },
    { id: 'thread', label: 'A thread (X, Bluesky, LinkedIn)', type: 'yesno', default: 'Yes' },
    { id: 'page', label: 'A project page', type: 'yesno', default: 'No' },
    { id: 'project', label: 'Project', type: 'text', placeholder: 'e.g. ColBERT', help: 'What it makes goes in this project of yours in the Library' },
  ],
  prompt: '',
  flow: {
    steps: [
      { id: 'paper_read', title: 'Read your paper', do: 'tool', tool: 'read_paper', with: { paper: '{{paper}}', upload: '{{upload}}', max_chars: 120000 } },
      {
        id: 'check',
        title: 'Gather its figures',
        do: 'code',
        language: 'javascript',
        with: { read: '{{paper_read.data}}' },
        code:
          LIST +
          String.raw`// The paper, its figures (each file with its caption), and where its source is.
const r = obj(input.read);
if (!list(r.parts).length) throw new Error('Your paper could not be read' + (list(r.notes).length ? ': ' + list(r.notes).join(' ') : '.'));
const figures = rows(r.figures).map((f) => '- ' + f.file + (f.label ? ' (' + f.label + ')' : '') + ': ' + String(f.caption || '').slice(0, 300));
return { title: String(r.title || 'Your paper'), authors: list(r.authors).join(', '), figures: figures.join('\n'), count: figures.length, folder: String(r.folder || ''), main: String(r.main || '') };`,
        outputs: [
          { id: 'title', label: 'Title', type: 'text' },
          { id: 'authors', label: 'Authors', type: 'text' },
          { id: 'figures', label: 'Its figures', type: 'markdown' },
          { id: 'count', label: 'Figures', type: 'number' },
          { id: 'folder', label: 'Its source', type: 'text' },
          { id: 'main', label: 'Its main file', type: 'text' },
        ],
        failed: 'agent',
      },
      {
        id: 'plan',
        title: 'Plan the talk',
        do: 'model',
        instructions: `Plan a {{minutes}}-minute talk on this paper, for {{audience}}: the slides in order, about one a minute. Open with the problem and why it matters, end with the take-away; one idea per slide. For each slide: its title; its minutes (all of them adding up to {{minutes}}); its points (three at most, a few words each, between semicolons); the figure it shows (one of the paper's figures below, by its file exactly, or nothing); an equation in LaTeX when it needs one; and what to say, in two to four sentences. Also the talk's message in one sentence, and an opening line that hooks.

${'{{#check.figures}}'}The paper's figures:
{{check.figures}}
{{/check.figures}}
The paper: {{check.title}}
${paperParts('paper_read')}`,
        outputs: [
          {
            id: 'slides',
            label: 'Slides',
            type: 'table',
            required: true,
            columns: [
              { id: 'title', label: 'Title', type: 'text' },
              { id: 'minutes', label: 'Minutes', type: 'number' },
              { id: 'points', label: 'Points', type: 'text' },
              { id: 'figure', label: 'Figure', type: 'text' },
              { id: 'equation', label: 'Equation', type: 'text' },
              { id: 'notes', label: 'What to say', type: 'text' },
            ],
          },
          { id: 'message', label: 'Its message', type: 'text', required: true },
          { id: 'hook', label: 'An opening line', type: 'text' },
        ],
      },
      {
        id: 'timing',
        title: 'Time the slides',
        do: 'code',
        language: 'javascript',
        with: { slides: '{{plan.slides}}', minutes: '{{minutes}}' },
        code:
          LIST +
          String.raw`// The slides' minutes made to add up to the talk's length (in half minutes, none under half a minute), numbered.
const want = Math.max(1, Number(input.minutes) || 15);
const slides = rows(input.slides);
if (!slides.length) throw new Error('The plan came back without slides');
const raw = slides.map((s) => Math.max(0.25, Number(s.minutes) || want / slides.length));
const sum = raw.reduce((a, b) => a + b, 0);
let mins = raw.map((m) => Math.max(0.5, Math.round(((m * want) / sum) * 2) / 2));
// What rounding added or took goes to the longest slides, half a minute at a time.
let diff = Math.round((want - mins.reduce((a, b) => a + b, 0)) * 2) / 2;
for (let k = 0; diff !== 0 && k < 200; k++) {
  const order = mins.map((m, i) => i).sort((a, b) => mins[b] - mins[a]);
  const i = diff > 0 ? order[0] : order.find((j) => mins[j] > 0.5);
  if (i === undefined) break;
  mins[i] += diff > 0 ? 0.5 : -0.5;
  diff += diff > 0 ? -0.5 : 0.5;
}
const out = slides.map((s, i) => ({ n: i + 1, title: String(s.title || ''), minutes: mins[i], points: String(s.points || ''), figure: String(s.figure || ''), equation: String(s.equation || ''), notes: String(s.notes || '') }));
return { slides: out, total: mins.reduce((a, b) => a + b, 0) };`,
        outputs: [
          { id: 'slides', label: 'Slides', type: 'table', columns: TALK_COLS },
          { id: 'total', label: 'Minutes in all', type: 'number' },
        ],
        failed: 'agent',
      },
      {
        id: 'make',
        title: 'Make them',
        do: 'parallel',
        branches: [
          [
            {
              id: 'slides_made',
              title: 'Make the slides',
              do: 'agent',
              if: '{{slides}}',
              instructions: `Make the slides of a {{minutes}}-minute talk on a paper with save_slides, following the plan below (the presentations skill says what makes slides good). One slide per row of the plan: its title, its points, its figure as a picture, its equation in LaTeX, and what to say as the speaker's notes (with its minutes). A title slide first (the paper's title and its authors: {{check.authors}}), the take-away last. Use the paper's own figures: a PDF or EPS figure becomes a PNG first (pdftoppm -png -r 200 -singlefile figure.pdf figure); from arXiv, download and unpack its source to get them. Keep the slides calm: few words, large figures. {{#project}}Keep it in the project “{{project}}” (save_slides with project).{{/project}} Hand in the page id save_slides gave it, its title, and anything to check.

${TALK_SOURCE}
The plan ({{audience}}; its message: {{plan.message}}):
{{timing.slides}}`,
              outputs: MADE_OUT,
            },
          ],
          [
            {
              id: 'poster_made',
              title: 'Make the poster',
              do: 'agent',
              if: '{{poster}}',
              instructions: `Make an A0 portrait poster of a paper as a LaTeX document of the Library, with save_latex: tikzposter (\\documentclass[25pt, a0paper, portrait]{tikzposter}), or another poster class this computer's TeX has. Its title, authors and their places at the top; then the problem, the idea, the method (with its key equation), the main results (the paper's own figures and its main table) and the take-away, in its own words, shortened for a poster: large type, little text, figures first. Put the paper's figures in as its pictures (save_latex takes them by path); from arXiv, download and unpack its source to get them. Fix what keeps it from typesetting until it does. {{#project}}Keep it in the project “{{project}}” (save_latex with project).{{/project}} Hand in the page id save_latex gave it, its title, and anything to check.

${TALK_SOURCE}
Its message: {{plan.message}}
The paper:
${paperParts('paper_read', 3)}`,
              outputs: MADE_OUT,
            },
          ],
          [
            {
              id: 'thread_made',
              title: 'Write the thread',
              do: 'model',
              if: '{{thread}}',
              instructions: `Write posts announcing this paper, as its authors would, following what works on each platform: the hook in the first line (the finding, with a number if there is a strong one, never "excited to share"), one idea per post, plain words, the link to the paper at the end, two or three hashtags people in the field follow at most, and no emoji unless they help.
- x: a thread for X of 4 to 7 posts, each at most 270 characters, the first one standing on its own; say in brackets which figure goes with a post when one should ("[Figure 2]").
- bluesky: the same thread for Bluesky, each post at most 290 characters.
- linkedin: one post for LinkedIn, 150 to 250 words: the problem, what you found, why it matters, and the link.

The paper: {{check.title}} ({{check.authors}}){{#paper_read.data.url}}, {{paper_read.data.url}}{{/paper_read.data.url}}
Its message: {{plan.message}}
{{#check.figures}}Its figures:
{{check.figures}}
{{/check.figures}}
${paperParts('paper_read', 2)}`,
              outputs: [
                { id: 'x', label: 'Thread for X', type: 'list', required: true },
                { id: 'bluesky', label: 'Thread for Bluesky', type: 'list', required: true },
                { id: 'linkedin', label: 'Post for LinkedIn', type: 'markdown', required: true },
              ],
            },
          ],
          [
            {
              id: 'page_made',
              title: 'Make the project page',
              do: 'agent',
              if: '{{page}}',
              instructions: `Make the paper's project page with save_page, ready to publish (the user publishes it from the Library): its title, its authors and their places, links (the paper, its code and data when the paper names them), a teaser figure from the paper, the abstract, the key results (a figure and the main table, in HTML), and its BibTeX to copy, in the app's own look as save_page says. Pictures: the paper's figures, as PNG (pdftoppm -png -r 200 -singlefile figure.pdf figure), put in the page as data: addresses or as addresses on the web. {{#project}}Keep it in the project “{{project}}” (save_page with project).{{/project}} Hand in the page id save_page gave it, its title, and anything to check.

${TALK_SOURCE}
{{#paper_read.data.bibtex}}Its BibTeX:
{{paper_read.data.bibtex}}
{{/paper_read.data.bibtex}}Its message: {{plan.message}}
${paperParts('paper_read', 2)}`,
              outputs: MADE_OUT,
            },
          ],
        ],
      },
      {
        id: 'made',
        title: 'List what was made',
        do: 'code',
        language: 'javascript',
        with: { slides: '{{slides_made}}', poster: '{{poster_made}}', page: '{{page_made}}', title: '{{check.title}}', total: '{{timing.total}}', thread: '{{thread_made.x}}' },
        code:
          LIST +
          String.raw`// What was made, each with its page in the Library, and the talk in a line.
const made = [];
const add = (what, v) => {
  const x = obj(v);
  if (x.page) made.push({ what, title: String(x.title || what), page: String(x.page).replace(/^.*\/pages\//, ''), note: String(x.note || '') });
};
add('Slides', input.slides);
add('Poster', input.poster);
add('Project page', input.page);
const parts = made.map((m) => m.what.toLowerCase());
if (list(input.thread).length) parts.push('a thread');
const summary = parts.length ? 'For “' + input.title + '”: ' + parts.join(', ').replace(/, ([^,]*)$/, ' and $1') + (input.total ? ', for a talk of ' + input.total + ' minutes.' : '.') : 'Nothing was made: tick what you want on the form.';
return { made, summary: summary.charAt(0).toUpperCase() + summary.slice(1) };`,
        outputs: [
          { id: 'made', label: 'What was made', type: 'table', columns: MADE_COLS },
          { id: 'summary', label: 'In short', type: 'text' },
        ],
        failed: 'agent',
      },
    ],
    outputs: {
      summary: '{{made.summary}}',
      title: '{{check.title}}',
      made: '{{made.made}}',
      talk: '{{timing.slides}}',
      message: '{{plan.message}}',
      hook: '{{plan.hook}}',
      x: '{{thread_made.x}}',
      bluesky: '{{thread_made.bluesky}}',
      linkedin: '{{thread_made.linkedin}}',
    },
  },
  answer: [
    { id: 'summary', label: 'In short', type: 'text', required: true },
    { id: 'title', label: 'The paper', type: 'text' },
    { id: 'made', label: 'What was made', type: 'table', columns: MADE_COLS },
    { id: 'talk', label: 'The talk', type: 'table', required: true, columns: TALK_COLS },
    { id: 'message', label: 'Its message', type: 'text' },
    { id: 'hook', label: 'An opening line', type: 'text' },
    { id: 'x', label: 'Thread for X', type: 'list' },
    { id: 'bluesky', label: 'Thread for Bluesky', type: 'list' },
    { id: 'linkedin', label: 'Post for LinkedIn', type: 'markdown' },
  ],
  examples: [
    { id: 'a-short-talk', name: 'A 10-minute talk and a thread', inputs: { paper: '2004.12832', minutes: '10', slides: 'Yes', poster: 'No', thread: 'Yes', page: 'No' }, checks: ['{{timing.total}} = 10', '{{answer.x}} is not empty', '{{answer.made}} is not empty'] },
    { id: 'thread-only', name: 'Only the thread', inputs: { paper: '1706.03762', audience: 'A general audience', slides: 'No', poster: 'No', thread: 'Yes', page: 'No' }, checks: ['{{answer.linkedin}} is not empty', '{{answer.talk}} is not empty'] },
  ],
};

// ---- Figure doctor -----------------------------------------------------------------------------------------------------------

const FIGURE_COLS: AnswerField['columns'] = [
  { id: 'name', label: 'Figure', type: 'text' },
  { id: 'before', label: 'Before', type: 'image' },
  { id: 'after', label: 'After', type: 'image' },
  { id: 'file', label: 'Its PDF', type: 'text' },
  { id: 'notes', label: 'What changed', type: 'text' },
];

/** The venues' templates: a column's and the page's width, in inches, and the font their text is set in. */
const FIGURE_VENUES: Record<string, { one: number; two: number; font: string }> = {
  'ACL, EMNLP, NAACL': { one: 3.03, two: 6.3, font: 'Times' },
  'ACM (SIGIR, KDD, CIKM, WSDM, TheWebConf)': { one: 3.33, two: 7.0, font: 'Linux Libertine' },
  IEEE: { one: 3.49, two: 7.14, font: 'Times' },
  ICML: { one: 3.25, two: 6.75, font: 'Times' },
  'NeurIPS, ICLR': { one: 5.5, two: 5.5, font: 'Times' },
  'Springer LNCS': { one: 4.8, two: 4.8, font: 'Computer Modern' },
};

const FIGURE_DOCTOR: Draft = {
  id: 'figure-doctor',
  name: 'Figure doctor',
  icon: 'chart',
  color: 'cyan',
  category: 'Writing',
  description: 'Plots fit for the paper: the column’s width, the paper’s font, colours colour-blind readers tell apart, vector PDFs with their fonts embedded, and one style file for them all.',
  fields: [
    { id: 'plots', label: 'Your plotting code', type: 'text', required: true, placeholder: 'e.g. ~/papers/colbert/plots', help: 'A script, a notebook or a folder of them on this computer (matplotlib, seaborn)' },
    { id: 'venue', label: 'The venue’s template', type: 'choice', options: [...Object.keys(FIGURE_VENUES), 'Other (give the width)'], default: 'ACL, EMNLP, NAACL' },
    { id: 'span', label: 'Width', type: 'choice', options: ['One column', 'Both columns'], default: 'One column' },
    { id: 'inches', label: 'Or the width in inches', type: 'number', help: 'For another template: its \\columnwidth (or \\textwidth) in inches' },
    { id: 'font', label: 'The paper’s font', type: 'choice', options: ['As the template', 'Times', 'Computer Modern', 'Linux Libertine', 'Helvetica'], default: 'As the template' },
  ],
  prompt: '',
  flow: {
    steps: [
      {
        id: 'setup',
        title: 'Work out the style',
        do: 'code',
        language: 'javascript',
        with: { venue: '{{venue}}', span: '{{span}}', inches: '{{inches}}', font: '{{font}}' },
        code:
          'const VENUES = ' +
          JSON.stringify(FIGURE_VENUES) +
          ';\n' +
          String.raw`// The figures' size from the column (or the page) they fill, the paper's font at the sizes a caption is set in, a
// palette colour-blind readers tell apart (Okabe and Ito's), and vector PDFs with TrueType fonts (no Type 3): one
// .mplstyle for every figure of the paper.
const v = VENUES[input.venue] || null;
const full = /both/i.test(String(input.span || ''));
const given = Number(input.inches);
const width = given > 0 ? Math.min(12, given) : v ? (full ? v.two : v.one) : 3.33;
const height = Math.round(width * (full ? 0.36 : 0.62) * 100) / 100;
const font = input.font && input.font !== 'As the template' ? input.font : v ? v.font : 'Times';
const FAMILY = {
  Times: ['serif', 'font.serif : Times New Roman, Times, Nimbus Roman, TeX Gyre Termes, DejaVu Serif', 'mathtext.fontset : stix'],
  'Computer Modern': ['serif', 'font.serif : CMU Serif, Latin Modern Roman, cmr10, DejaVu Serif', 'mathtext.fontset : cm\naxes.formatter.use_mathtext : True'],
  'Linux Libertine': ['serif', 'font.serif : Linux Libertine O, Libertinus Serif, Linux Libertine, DejaVu Serif', 'mathtext.fontset : stix'],
  Helvetica: ['sans-serif', 'font.sans-serif : Helvetica, Arial, Nimbus Sans, TeX Gyre Heros, DejaVu Sans', 'mathtext.fontset : stixsans'],
}[font] || ['serif', 'font.serif : Times New Roman, Times, Nimbus Roman, DejaVu Serif', 'mathtext.fontset : stix'];
const size = width > 5 ? 9 : 8;
const palette = ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9', '#F0E442', '#000000'];
const style = [
  '# One style for every figure of the paper: ' + (v ? input.venue : 'a width of ' + width + ' in') + ', ' + (full ? 'both columns' : 'one column') + ', ' + font + '.',
  '# Use it in each script: plt.style.use("paper.mplstyle"); for a figure of another width, figsize=(w, h) in inches.',
  'figure.figsize : ' + width + ', ' + height,
  'figure.dpi : 150',
  'figure.constrained_layout.use : True',
  'savefig.format : pdf',
  'savefig.bbox : tight',
  'savefig.pad_inches : 0.02',
  'pdf.fonttype : 42',
  'ps.fonttype : 42',
  'font.family : ' + FAMILY[0],
  FAMILY[1],
  FAMILY[2],
  'font.size : ' + size,
  'axes.titlesize : ' + size,
  'axes.labelsize : ' + size,
  'xtick.labelsize : ' + (size - 1),
  'ytick.labelsize : ' + (size - 1),
  'legend.fontsize : ' + (size - 1),
  'legend.frameon : False',
  'axes.spines.top : False',
  'axes.spines.right : False',
  'axes.linewidth : 0.6',
  'xtick.major.width : 0.6',
  'ytick.major.width : 0.6',
  'lines.linewidth : 1.2',
  'lines.markersize : 3.5',
  'grid.linewidth : 0.4',
  'grid.alpha : 0.4',
  "axes.prop_cycle : cycler('color', [" + palette.map((c) => "'" + c.slice(1) + "'").join(', ') + '])',
].join('\n');
const said = width + ' in' + (given > 0 ? '' : v ? ' (' + (full ? 'both columns' : 'one column') + ' of ' + input.venue + ')' : '') + ', ' + font + ' at ' + size + ' pt';
return { width, height, font, size, style, palette, said };`,
        outputs: [
          { id: 'width', label: 'Width, in inches', type: 'number' },
          { id: 'height', label: 'Height, in inches', type: 'number' },
          { id: 'font', label: 'Font', type: 'text' },
          { id: 'size', label: 'Size, in points', type: 'number' },
          { id: 'style', label: 'The style file', type: 'text' },
          { id: 'palette', label: 'Colours', type: 'list' },
          { id: 'said', label: 'In a line', type: 'text' },
        ],
        failed: 'agent',
      },
      {
        id: 'fix',
        title: 'Fix the figures',
        do: 'agent',
        instructions: `Make a paper's figures fit for print, following the figures-for-papers skill. The plotting code: {{plots}} (a script, a notebook or a folder of them).

1. Keep the originals: before changing anything, copy each script or notebook beside itself (name.orig.py, name.orig.ipynb), and render each figure as it is now to a PNG (pdftoppm -png -r 150 -singlefile, or savefig to PNG) for "before".
2. Write this style file as paper.mplstyle next to them, and have every script use it (plt.style.use with its path), taking out the sizes, fonts and colours they set themselves:
{{setup.style}}
3. Sizes: {{setup.said}}. Each figure as wide as that ({{setup.width}} in), its height as its content needs (about {{setup.height}} in for one plot); text in the figure no smaller than {{setup.size}} pt less one.
4. Colours from the palette, in its order; a line or marker style besides colour where series must be told apart in grey.
5. Save each as a vector PDF (no PNG for plots; rasterize only a huge scatter, with rasterized=True), then check its fonts with pdffonts: all embedded, none of Type 3. Fix what is not.
6. Run them (with the environment they need; say so if their data is not here), and render each new PDF to a PNG for "after".

Hand in each figure: its name, its before and after pictures (the PNGs' paths), its new PDF's path and what changed; the changes in all; what pdffonts said; the path of paper.mplstyle; and a short summary.`,
        outputs: [
          { id: 'figures', label: 'Figures', type: 'table', required: true, columns: FIGURE_COLS },
          { id: 'changes', label: 'What changed', type: 'list', required: true },
          { id: 'fonts', label: 'The fonts check', type: 'text' },
          { id: 'style_file', label: 'The style file’s path', type: 'text' },
          { id: 'summary', label: 'Summary', type: 'markdown', required: true },
        ],
      },
    ],
    outputs: { summary: '{{fix.summary}}', figures: '{{fix.figures}}', style: '{{setup.style}}', style_file: '{{fix.style_file}}', changes: '{{fix.changes}}', fonts: '{{fix.fonts}}', width: '{{setup.said}}', palette: '{{setup.palette}}' },
  },
  answer: [
    { id: 'summary', label: 'Summary', type: 'markdown', required: true },
    { id: 'figures', label: 'Before and after', type: 'table', required: true, columns: FIGURE_COLS },
    { id: 'style', label: 'The style file', type: 'text' },
    { id: 'style_file', label: 'Where it is', type: 'text' },
    { id: 'changes', label: 'What changed', type: 'list' },
    { id: 'fonts', label: 'The fonts check', type: 'text' },
    { id: 'width', label: 'Size and font', type: 'text' },
    { id: 'palette', label: 'Colours', type: 'list' },
  ],
  examples: [
    { id: 'acl-one-column', name: 'ACL, one column', inputs: { plots: '~/papers/draft/plots', venue: 'ACL, EMNLP, NAACL', span: 'One column' }, checks: ['{{setup.width}} = 3.03', '{{answer.figures}} is not empty'] },
    { id: 'acm-full-width', name: 'ACM, the full width, Libertine', inputs: { plots: '~/papers/draft/plot_results.py', venue: 'ACM (SIGIR, KDD, CIKM, WSDM, TheWebConf)', span: 'Both columns' }, checks: ['{{setup.width}} = 7', '{{setup.font}} = Linux Libertine'] },
  ],
};

/** The apps for papers, in the order the Apps page lists them: reading, then writing and presenting. */
export const PAPERS: Draft[] = [READING_LIST, LITERATURE_MATRIX, REPRODUCE, REVIEWER_SIMULATOR, REBUTTAL, PAPER_TO_TALK, FIGURE_DOCTOR];
