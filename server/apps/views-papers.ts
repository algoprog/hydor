// The views of the apps for papers (shared/app-ui.ts): the Reading list's own page (your papers to search, filter, mark
// and pick, a page for each, panels to add, import, export and sync), the literature matrix as a table, a reproduction
// beside the paper's numbers, reviews as cards with their scores, a rebuttal point by point, what a talk made, and
// figures before and after. Their colours are the page kit's, so they look like the rest of the app in both themes.
import type { AppUi } from '../../shared/app-ui.ts';
import { CHIPS_CSS, HERO_CSS, STATS_CSS } from './views.ts';

// ---- what several share --------------------------------------------------------------------------------------------

/** A panel that opens under a bar: its head with a close button, its fields in a grid, its foot with what it said. */
const PANEL_CSS = String.raw`
.panel { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 10px 12px; padding: 14px 16px 12px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.head { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.head h3 { margin: 0; font-size: 15px; }
.x { width: 30px; height: 30px; border: 0; border-radius: 8px; background: none; color: var(--n-muted); font: inherit; }
.x:hover { background: var(--n-soft); color: var(--n-fg); }
label { display: grid; gap: 4px; font-size: 12.5px; color: var(--n-muted); }
label.wide { grid-column: 1 / -1; }
input, select, textarea { min-width: 0; padding: 8px 10px; border: 1px solid var(--n-line); border-radius: 10px; background: var(--n-bg); color: var(--n-fg); font: inherit; font-size: 14.5px; outline: none; }
textarea { resize: vertical; font-family: var(--n-mono); font-size: 13px; }
input:focus, select:focus, textarea:focus { border-color: var(--n-accent); box-shadow: 0 0 0 3px var(--n-accent-soft); }
.foot { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 12px; }
.said { flex: 1; min-width: 0; font-size: 13.5px; }
.busy { color: var(--n-muted); }
.ok { color: var(--n-ok); }
.err { color: var(--n-err); }
.hint { grid-column: 1 / -1; margin: 0; color: var(--n-muted); font-size: 12.5px; line-height: 1.45; }
`;

/** A long text to read and copy (a report, a meta-review, a rebuttal). */
const DOC_CSS = String.raw`
.doc { padding: 20px 24px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--n-line); color: var(--n-muted); font-size: 13px; }
.body { max-width: 74ch; font-size: 15px; line-height: 1.65; overflow-wrap: anywhere; }
.body h2 { font-size: 19px; margin: 4px 0 10px; } .body h3 { font-size: 16.5px; margin: 20px 0 8px; } .body h4 { font-size: 15px; margin: 16px 0 6px; }
.body p { margin: 0 0 12px; } .body ul, .body ol { margin: 0 0 12px; padding-left: 22px; }
.body table { width: 100%; border-collapse: collapse; font-size: 13.5px; } .body th, .body td { padding: 6px 8px; border-bottom: 1px solid var(--n-line); text-align: left; vertical-align: top; }
.body pre { padding: 10px 12px; border-radius: 10px; background: var(--n-soft); font-size: 12.5px; overflow-x: auto; }
@media (max-width: 520px) { .doc { padding: 16px; } }
`;

/** A round number in a tile, before a line (a point's, a slide's). */
const NUM_CSS = String.raw`
.n { flex: none; display: grid; place-items: center; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 8px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 12.5px; font-weight: 700; }
`;

/** Three choices side by side, the one picked standing out (a paper's status). */
const SEG_CSS = String.raw`
.seg { display: inline-flex; padding: 3px; border-radius: 10px; background: var(--n-soft); }
.seg button { padding: 4px 10px; border: 0; border-radius: 7px; background: none; color: var(--n-muted); font: inherit; font-size: 12.5px; white-space: nowrap; }
.seg button:hover { color: var(--n-fg); }
.seg button.on { background: var(--n-card); color: var(--n-fg); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.12); }
`;

// ---- Reading list ----------------------------------------------------------------------------------------------------------

const READING_LIST: AppUi = {
  pages: [
    {
      id: 'list',
      title: 'Your papers',
      on: 'app',
      blocks: [
        { element: 'rl-head', data: 'data.papers', limit: 1000 },
        { element: 'rl-sync', data: 'data.syncs', sort: '-createdAt', limit: 1, if: 'data.syncs' },
        { element: 'rl-bar' },
        { element: 'rl-add', if: 'state.panel|is:add' },
        { element: 'rl-import', if: 'state.panel|is:import' },
        { element: 'rl-export', if: 'state.panel|is:export' },
        { element: 'rl-zotero', if: 'state.panel|is:zotero' },
        { element: 'rl-picked', if: 'state.picked' },
        {
          element: 'paper-row',
          data: 'data.papers',
          each: true,
          where: { status: '{{state.status}}', tags: '{{state.tag}}', project: '{{state.project}}' },
          sort: '-createdAt',
          limit: 500,
          with: { search: '{{state.q}}' },
          empty: 'No papers here yet: add one by its DOI, arXiv id, link or title, import a .bib, or sync with Zotero.',
        },
      ],
    },
    { id: 'paper', title: 'Paper', tab: false, on: 'app', blocks: [{ element: 'paper-page', data: 'data.papers', each: true, where: { id: '{{page.item.id}}' }, limit: 1, empty: 'This paper is no longer in your list.' }] },
    { id: 'projects', title: 'By project', on: 'app', blocks: [{ element: 'rl-projects', data: 'data.papers', limit: 1000 }] },
    {
      id: 'added',
      title: 'The paper',
      blocks: [
        { element: 'rl-added' },
        { title: 'Its BibTeX', element: 'rl-bib', if: 'result.bibtex' },
      ],
    },
  ],
  elements: {
    'rl-head': {
      description: 'Your reading list in numbers: papers to read, being read and read (each a filter), and projects',
      html: String.raw`<header class="hero">
  <p class="kicker">Reading list{{#state.project}} · {{state.project_name|or:$state.project}}{{/state.project}}</p>
  <h1>{{#.|count|is:1}}One paper{{/.}}{{^.|count|is:1}}{{.|count|number}} papers{{/.}}</h1>
  <p class="sub">{{^.}}Add a paper by its DOI, arXiv id, link or title, import a .bib, or sync with Zotero.{{/.}}{{#.|count}}Search them, mark what you have read, and pick some for a literature matrix.{{/.}}</p>
  <div class="stats">
    <button type="button" class="stat" data-event="status" data-status="To read"><b>{{.|where:status=To read|count}}</b><span>to read</span></button>
    <button type="button" class="stat" data-event="status" data-status="Reading"><b>{{.|where:status=Reading|count}}</b><span>reading</span></button>
    <button type="button" class="stat" data-event="status" data-status="Read"><b>{{.|where:status=Read|count}}</b><span>read</span></button>
    <div class="stat"><b>{{.|unique:project|count}}</b><span>projects</span></div>
  </div>
</header>`,
      css:
        HERO_CSS +
        STATS_CSS +
        String.raw`
button.stat { color: inherit; font: inherit; text-align: left; cursor: pointer; }
button.stat:hover { border-color: var(--n-accent); }
`,
    },
    'rl-sync': {
      description: 'The last sync with Zotero: when, and what it did',
      html: String.raw`{{#.|first}}<p class="sync"><span class="z" aria-hidden="true">Z</span><span class="t">{{#state.synced.working}}Syncing with Zotero…{{/state.synced.working}}{{^state.synced.working}}Zotero, {{at|ago}}: {{summary}}{{/state.synced.working}}</span><button type="button" class="again" data-event="sync">Sync again</button></p>{{/.}}`,
      css: String.raw`
.sync { display: flex; align-items: center; gap: 10px; margin: 0; padding: 8px 12px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); font-size: 13px; }
.z { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: #cc2936; color: #fff; font-size: 12px; font-weight: 700; }
.t { flex: 1; min-width: 0; color: var(--n-muted); }
.again { padding: 3px 10px; border: 1px solid var(--n-line); border-radius: 999px; background: none; color: var(--n-fg); font: inherit; font-size: 12.5px; white-space: nowrap; }
.again:hover { border-color: var(--n-accent); color: var(--n-accent); }
`,
    },
    'rl-bar': {
      description: 'A box to search the papers, their status to show, the tag and project shown, and Add with the rest behind More',
      html: String.raw`<div class="bar">
  <input type="search" class="find" data-event="find" value="{{state.q}}" placeholder="Search your papers" aria-label="Search your papers">
  <div class="chips" role="group" aria-label="Status">
    {{#state.status}}<button type="button" class="chip" data-event="status" data-status="">All</button>{{/state.status}}{{^state.status}}<span class="chip on">All</span>{{/state.status}}
    <button type="button" class="chip{{#state.status|is:To read}} on{{/state.status}}" data-event="status" data-status="To read">To read</button>
    <button type="button" class="chip{{#state.status|is:Reading}} on{{/state.status}}" data-event="status" data-status="Reading">Reading</button>
    <button type="button" class="chip{{#state.status|is:Read}} on{{/state.status}}" data-event="status" data-status="Read">Read</button>
    {{#state.tag}}<span class="chip on">#{{state.tag}}<button type="button" class="off" data-event="tag" data-tag="" aria-label="Every tag">✕</button></span>{{/state.tag}}
    {{#state.project}}<span class="chip on">{{state.project_name|or:$state.project}}<button type="button" class="off" data-event="project" data-project="" data-name="" aria-label="Every project">✕</button></span>{{/state.project}}
  </div>
  <div class="acts">
    <button type="button" class="n-btn n-primary" data-event="panel" data-panel="add">+ Add</button>
    <details class="more">
      <summary class="n-btn">More</summary>
      <div class="menu">
        <button type="button" data-event="panel" data-panel="import">Import a .bib</button>
        <button type="button" data-event="panel" data-panel="export">Export a .bib</button>
        <button type="button" data-event="panel" data-panel="zotero">Sync with Zotero</button>
      </div>
    </details>
  </div>
</div>`,
      css:
        CHIPS_CSS +
        String.raw`
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; }
.find { flex: 1 1 220px; min-width: 0; padding: 8px 12px; border: 1px solid var(--n-line); border-radius: 10px; background: var(--n-card); color: var(--n-fg); font: inherit; font-size: 14.5px; outline: none; }
.find:focus { border-color: var(--n-accent); box-shadow: 0 0 0 3px var(--n-accent-soft); }
.off { margin: 0 -4px 0 2px; padding: 0 2px; border: 0; background: none; color: inherit; font: inherit; font-size: 11px; }
.acts { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.more { position: relative; }
.more summary { list-style: none; cursor: pointer; }
.more summary::-webkit-details-marker { display: none; }
.menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 5; display: grid; min-width: 190px; padding: 5px; border: 1px solid var(--n-line); border-radius: 12px; background: var(--n-card); box-shadow: 0 8px 24px rgba(0,0,0,.14); }
.menu button { padding: 8px 10px; border: 0; border-radius: 8px; background: none; color: var(--n-fg); font: inherit; font-size: 14px; text-align: left; }
.menu button:hover { background: var(--n-soft); }
@media (max-width: 520px) { .acts { margin-left: 0; } }
`,
    },
    'rl-add': {
      description: 'Add a paper: its DOI, arXiv id, link or title, looked up and filled in with its BibTeX; and how that went',
      html: String.raw`<form class="panel" data-event="add">
  <div class="head"><h3>Add a paper</h3><button type="button" class="x" data-event="panel" data-panel="" aria-label="Close">✕</button></div>
  <label class="wide"><span>The paper</span><input name="paper" required placeholder="A DOI, an arXiv id, a link or its title"></label>
  <label><span>Project</span><input name="project" value="{{state.project_name}}" placeholder="e.g. Dense retrieval survey"></label>
  <label><span>Tags</span><input name="tags" value="{{state.tag}}" placeholder="Between commas"></label>
  <label><span>Status</span><select name="status"><option>To read</option><option>Reading</option><option>Read</option></select></label>
  <div class="foot">
    <span class="said">{{#state.added.working}}<span class="busy">Looking it up…</span>{{/state.added.working}}{{^state.added.working}}{{#state.added.result.title}}<span class="ok">✓ {{#state.added.result.added}}Added{{/state.added.result.added}}{{^state.added.result.added}}In your list already{{/state.added.result.added}}: {{state.added.result.title|short:90}}</span>{{/state.added.result.title}}{{#state.added.error}}<span class="err">{{state.added.error}}</span>{{/state.added.error}}{{/state.added.working}}</span>
    <button type="submit" class="n-btn n-primary">Add it</button>
  </div>
</form>`,
      css: PANEL_CSS,
    },
    'rl-import': {
      description: 'Import a .bib, pasted or from a file on this computer, into the list',
      html: String.raw`<form class="panel" data-event="import_bib">
  <div class="head"><h3>Import a .bib</h3><button type="button" class="x" data-event="panel" data-panel="" aria-label="Close">✕</button></div>
  <label class="wide"><span>Paste it</span><textarea name="bibtex" rows="6" placeholder="@inproceedings{…}"></textarea></label>
  <label class="wide"><span>Or a .bib file on this computer</span><input name="path" placeholder="~/papers/refs.bib"></label>
  <label><span>Project</span><input name="project" value="{{state.project_name}}"></label>
  <label><span>Tags</span><input name="tags" placeholder="Between commas"></label>
  <p class="hint">Papers you have already are completed with what they lack; your notes, tags and status stay as they are.</p>
  <div class="foot">
    <span class="said">{{#state.imported.working}}<span class="busy">Reading it…</span>{{/state.imported.working}}{{^state.imported.working}}{{#state.imported.result.summary}}<span class="ok">{{state.imported.result.summary}}</span>{{/state.imported.result.summary}}{{#state.imported.error}}<span class="err">{{state.imported.error}}</span>{{/state.imported.error}}{{/state.imported.working}}</span>
    <button type="submit" class="n-btn n-primary">Import</button>
  </div>
</form>`,
      css: PANEL_CSS,
    },
    'rl-export': {
      description: 'Export the papers shown, or all of them, as a .bib to download or copy',
      html: String.raw`<div class="panel">
  <div class="head"><h3>Export a .bib</h3><button type="button" class="x" data-event="panel" data-panel="" aria-label="Close">✕</button></div>
  <p class="hint">Every paper with its BibTeX, each under a key of its own: those shown now{{#state.status}}, {{state.status}}{{/state.status}}{{#state.tag}}, #{{state.tag}}{{/state.tag}}{{#state.project}}, {{state.project_name|or:$state.project}}{{/state.project}}{{#state.q}}, with “{{state.q}}”{{/state.q}}, or all of them.</p>
  <div class="foot">
    <span class="said">{{#state.exported.working}}<span class="busy">Writing it…</span>{{/state.exported.working}}{{^state.exported.working}}{{#state.exported.result.file}}<a class="n-btn n-primary" href="{{state.exported.result.file}}" target="_blank" rel="noopener noreferrer" download>↓ {{state.exported.result.name}}</a> <span class="ok">{{state.exported.result.count}} papers</span> <button type="button" class="n-btn" data-event="copy_export">Copy it</button>{{/state.exported.result.file}}{{#state.exported.error}}<span class="err">{{state.exported.error}}</span>{{/state.exported.error}}{{/state.exported.working}}</span>
    <button type="button" class="n-btn" data-event="export_all">All of them</button>
    <button type="button" class="n-btn n-primary" data-event="export_shown">Those shown</button>
  </div>
</div>`,
      css: PANEL_CSS,
    },
    'rl-zotero': {
      description: 'Sync with Zotero: what changed there comes in, what is only here goes there; and what the last sync did',
      html: String.raw`<div class="panel">
  <div class="head"><h3>Sync with Zotero</h3><button type="button" class="x" data-event="panel" data-panel="" aria-label="Close">✕</button></div>
  <p class="hint">What changed in your Zotero library since the last sync comes in: new papers are added, the ones here completed, matched by DOI, arXiv id or title. The papers only here go to Zotero. The first time, it asks for a Zotero key (zotero.org/settings/keys), which stays in your vault.</p>
  <div class="foot">
    <span class="said">{{#state.synced.working}}<span class="busy">Syncing…</span>{{/state.synced.working}}{{^state.synced.working}}{{#state.synced.result.summary}}<span class="ok">{{state.synced.result.summary}}</span>{{/state.synced.result.summary}}{{#state.synced.error}}<span class="err">{{state.synced.error}}</span>{{/state.synced.error}}{{/state.synced.working}}</span>
    <button type="button" class="n-btn n-primary" data-event="sync">Sync now</button>
  </div>
</div>`,
      css: PANEL_CSS,
    },
    'rl-picked': {
      description: 'The papers picked, to make a literature matrix of',
      html: String.raw`<div class="picked"><b>{{state.picked|count}} picked</b><span>Read side by side: task, data, method, metrics, results and limits, every cell citing its page.</span><button type="button" class="n-btn n-primary" data-event="matrix">Make a literature matrix</button><button type="button" class="n-btn" data-event="unpick">Clear</button></div>`,
      css: String.raw`
.picked { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 14px; border: 1px solid color-mix(in srgb, var(--n-accent) 40%, var(--n-line)); border-radius: var(--n-radius); background: var(--n-accent-soft); font-size: 13.5px; }
.picked span { flex: 1 1 220px; color: var(--n-muted); }
`,
    },
    'paper-row': {
      description: 'A paper in the list: picked or not, its title (opens its page), who, where and when, its project and tags (each a filter), and its status to change',
      html: String.raw`<article class="p{{#state.picked.@key}} picked{{/state.picked.@key}}">
  <button type="button" class="pick" data-event="pick" aria-label="Pick it" title="Pick it for a literature matrix">✓</button>
  <div class="body">
    <button type="button" class="t" data-event="open_paper">{{title}}</button>
    <p class="meta">{{authors|short:110}}{{#venue}} · {{venue}}{{/venue}}{{#year}} · {{year}}{{/year}}</p>
    <p class="tags">{{#project_name}}<button type="button" class="proj" data-event="project" data-project="{{project}}" data-name="{{project_name}}">{{project_name}}</button>{{/project_name}}{{#tags}}<button type="button" class="tag" data-event="tag" data-tag="{{.}}">#{{.}}</button>{{/tags}}</p>
  </div>
  <div class="seg" role="group" aria-label="Status">
    <button type="button" class="{{#status|is:To read}}on{{/status}}" data-event="to_read">To read</button>
    <button type="button" class="{{#status|is:Reading}}on{{/status}}" data-event="reading">Reading</button>
    <button type="button" class="{{#status|is:Read}}on{{/status}}" data-event="read">Read</button>
  </div>
</article>`,
      css:
        SEG_CSS +
        String.raw`
.p { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.picked { border-color: var(--n-accent); box-shadow: 0 0 0 3px var(--n-accent-soft); }
.pick { width: 24px; height: 24px; margin-top: 1px; border: 1.5px solid var(--n-line); border-radius: 7px; background: none; color: transparent; font: inherit; font-size: 12px; }
.pick:hover { border-color: var(--n-accent); color: var(--n-accent); }
.picked .pick { border-color: var(--n-accent); background: var(--n-accent); color: var(--n-accent-fg); }
.body { min-width: 0; }
.t { display: block; padding: 0; border: 0; background: none; color: var(--n-fg); font: inherit; font-size: 15px; font-weight: 600; line-height: 1.4; text-align: left; }
.t:hover { color: var(--n-accent); }
.meta { margin: 3px 0 0; color: var(--n-muted); font-size: 13px; line-height: 1.45; }
.tags { display: flex; flex-wrap: wrap; gap: 4px 6px; margin: 6px 0 0; }
.tags:empty { display: none; }
.proj, .tag { padding: 1px 8px; border: 0; border-radius: 999px; font: inherit; font-size: 12px; }
.proj { background: var(--n-accent-soft); color: var(--n-accent); font-weight: 600; }
.tag { background: var(--n-soft); color: var(--n-muted); }
.proj:hover, .tag:hover { color: var(--n-fg); }
@media (max-width: 620px) { .p { grid-template-columns: auto 1fr; } .seg { grid-column: 2; justify-self: start; } }
`,
    },
    'paper-page': {
      description: 'One paper on a page of its own: its record and links, its status, project, tags and notes to change, its abstract and its BibTeX to copy',
      html: String.raw`<article class="pp">
  <p class="kicker">{{status|or:To read}}{{#read_on}} · read {{read_on|longdate}}{{/read_on}}{{#added}} · added {{added|longdate}}{{/added}}</p>
  <h2>{{title}}</h2>
  {{#authors}}<p class="who">{{authors}}</p>{{/authors}}
  <p class="where">{{venue}}{{#year}}{{#venue}} · {{/venue}}{{year}}{{/year}}{{#doi}} · DOI {{doi}}{{/doi}}{{#arxiv}} · arXiv {{arxiv}}{{/arxiv}}</p>
  <div class="n-row acts">
    {{#url}}<a class="n-btn" href="{{url}}" target="_blank" rel="noopener noreferrer">Its page ↗</a>{{/url}}
    {{#pdf|has:http}}<a class="n-btn" href="{{pdf}}" target="_blank" rel="noopener noreferrer">The PDF ↗</a>{{/pdf}}{{^pdf|has:http}}{{#pdf}}<button type="button" class="n-btn" data-event="open_pdf">Open the PDF</button>{{/pdf}}{{/pdf}}
    <button type="button" class="n-btn" data-event="reproduce">Reproduce it</button>
  </div>
  <div class="seg" role="group" aria-label="Status">
    <button type="button" class="{{#status|is:To read}}on{{/status}}" data-event="to_read">To read</button>
    <button type="button" class="{{#status|is:Reading}}on{{/status}}" data-event="reading">Reading</button>
    <button type="button" class="{{#status|is:Read}}on{{/status}}" data-event="read">Read</button>
  </div>
  {{#abstract}}<section><h3>Abstract</h3><p class="abs">{{abstract}}</p></section>{{/abstract}}
  <section>
    <h3>Project and tags</h3>
    <form class="line" data-event="save_project"><input name="project" value="{{project_name|or:$project}}" placeholder="Its project" aria-label="Project"><button type="submit" class="n-btn">Save</button></form>
    <form class="line" data-event="save_tags"><input name="tags" value="{{tags|join:, }}" placeholder="Tags, between commas" aria-label="Tags"><button type="submit" class="n-btn">Save</button></form>
  </section>
  <section>
    <h3>Notes</h3>
    <form data-event="save_notes"><textarea name="notes" rows="6" placeholder="What it shows, what to take from it, what to cite it for">{{notes}}</textarea><div class="n-row"><button type="submit" class="n-btn n-primary">Save the notes</button></div></form>
  </section>
  {{#bibtex}}<section><h3>BibTeX</h3><pre>{{bibtex}}</pre><button type="button" class="n-btn" data-event="copy_bib">Copy the BibTeX</button></section>{{/bibtex}}
  <p class="end">{{#zotero_key}}<span>In Zotero</span>{{/zotero_key}}<button type="button" class="rm" data-event="remove">Remove it from the list</button></p>
</article>`,
      css:
        SEG_CSS +
        String.raw`
.kicker { margin: 0; color: var(--n-accent); font-size: 12.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
h2 { margin: 6px 0 6px !important; font-size: 24px !important; line-height: 1.25 !important; letter-spacing: -.015em; }
.who { margin: 0; font-size: 14.5px; }
.where { margin: 4px 0 14px; color: var(--n-muted); font-size: 13.5px; overflow-wrap: anywhere; }
.acts { margin-bottom: 14px; }
section { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--n-line); }
h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--n-muted); }
.abs { margin: 0; font-size: 14.5px; line-height: 1.6; }
.line { display: flex; gap: 8px; margin-bottom: 8px; }
input, textarea { flex: 1; min-width: 0; width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--n-line); border-radius: 10px; background: var(--n-card); color: var(--n-fg); font: inherit; font-size: 14.5px; outline: none; }
textarea { display: block; margin-bottom: 8px; resize: vertical; line-height: 1.55; }
input:focus, textarea:focus { border-color: var(--n-accent); box-shadow: 0 0 0 3px var(--n-accent-soft); }
pre { margin: 0 0 8px; padding: 10px 12px; border-radius: 10px; background: var(--n-soft); font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.end { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 20px 0 0; color: var(--n-muted); font-size: 12.5px; }
.rm { margin-left: auto; padding: 0; border: 0; background: none; color: var(--n-err); font: inherit; font-size: 13px; }
.rm:hover { text-decoration: underline; }
`,
    },
    'rl-projects': {
      description: 'Your projects, each with how many papers it has and how many are read; each shows its papers',
      html: String.raw`<div class="projects">{{#.|unique:project}}<button type="button" class="pr" data-event="project_go" data-project="{{.}}" data-name="{{#item|where:project=$.|first}}{{project_name|or:$project}}{{/item}}"><b>{{#item|where:project=$.|first}}{{project_name|or:$project}}{{/item}}</b><span>{{#item|where:project=$.|count|is:1}}One paper{{/item}}{{^item|where:project=$.|count|is:1}}{{item|where:project=$.|count}} papers{{/item}} · {{item|where:project=$.|where:status=Read|count}} read</span></button>{{/.}}</div>
{{^.|unique:project}}<p class="none">No projects yet: give a paper a project when you add it, or on its own page.</p>{{/.}}`,
      css: String.raw`
.projects { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 10px; }
.projects:empty { display: none; }
.pr { display: grid; gap: 4px; padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); color: inherit; font: inherit; text-align: left; }
.pr:hover { border-color: var(--n-accent); }
.pr b { font-size: 15px; }
.pr span { color: var(--n-muted); font-size: 13px; }
.none { margin: 0; color: var(--n-muted); font-size: 14px; }
`,
    },
    'rl-added': {
      description: 'The paper added (or found in the list already): its record, its status, project and tags, and the way to the list',
      html: String.raw`<article class="added">
  <p class="kicker">{{#result.added}}Added to your reading list{{/result.added}}{{^result.added}}In your reading list already{{/result.added}}</p>
  <h1>{{result.title}}</h1>
  {{#result.authors}}<p class="who">{{result.authors}}</p>{{/result.authors}}
  <p class="where">{{result.venue}}{{#result.year}}{{#result.venue}} · {{/result.venue}}{{result.year}}{{/result.year}}</p>
  <div class="chips"><span class="chip on">{{result.status}}</span>{{#result.project}}<span class="chip">{{result.project}}</span>{{/result.project}}{{#result.tags}}<span class="chip">#{{.}}</span>{{/result.tags}}</div>
  {{#result.note}}<p class="note">{{result.note}}</p>{{/result.note}}
  <div class="n-row acts">{{#result.link}}<a class="n-btn" href="{{result.link}}" target="_blank" rel="noopener noreferrer">Its page ↗</a>{{/result.link}}<button type="button" class="n-btn n-primary" data-event="open_list">Open your reading list</button><span class="count">{{result.count|number}} papers in it</span></div>
</article>`,
      css:
        HERO_CSS +
        CHIPS_CSS +
        String.raw`
.added { padding: 20px 22px 18px; border: 1px solid var(--n-line); border-radius: calc(var(--n-radius) + 4px); background: linear-gradient(135deg, var(--n-accent-soft), transparent 65%), var(--n-card); }
h1 { margin: 6px 0 6px !important; font-size: 22px !important; line-height: 1.3 !important; letter-spacing: -.01em; }
.who { margin: 0; font-size: 14.5px; }
.where { margin: 4px 0 12px; color: var(--n-muted); font-size: 13.5px; }
.note { margin: 12px 0 0; padding: 8px 12px; border-radius: 10px; background: var(--n-soft); color: var(--n-muted); font-size: 13.5px; }
.acts { margin-top: 14px; align-items: center; }
.count { color: var(--n-muted); font-size: 13px; }
`,
    },
    'rl-bib': {
      description: 'Its BibTeX, to copy',
      html: String.raw`<div class="bib"><pre>{{result.bibtex}}</pre><button type="button" class="n-btn" data-event="copy_result_bib">Copy the BibTeX</button></div>`,
      css: String.raw`
pre { margin: 0 0 8px; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
`,
    },
  },
  events: {
    find: [{ do: 'set', name: 'q', value: '{{event.value}}' }],
    status: [{ do: 'set', name: 'status', value: '{{event.status}}' }],
    tag: [{ do: 'set', name: 'tag', value: '{{event.tag}}' }],
    project: [
      { do: 'set', name: 'project', value: '{{event.project}}' },
      { do: 'set', name: 'project_name', value: '{{event.name}}' },
    ],
    project_go: [
      { do: 'set', name: 'project', value: '{{event.project}}' },
      { do: 'set', name: 'project_name', value: '{{event.name}}' },
      { do: 'page', page: 'list' },
    ],
    panel: [{ do: 'set', name: 'panel', value: '{{event.panel}}' }],
    add: [{ do: 'run', flow: 'run', inputs: { paper: '{{event.paper}}', project: '{{event.project}}', tags: '{{event.tags}}', status: '{{event.status}}' }, as: 'added' }],
    import_bib: [{ do: 'run', flow: 'import', inputs: { bibtex: '{{event.bibtex}}', path: '{{event.path}}', project: '{{event.project}}', tags: '{{event.tags}}' }, as: 'imported' }],
    export_shown: [{ do: 'run', flow: 'export', inputs: { status: '{{state.status}}', tag: '{{state.tag}}', project: '{{state.project}}', search: '{{state.q}}' }, as: 'exported' }],
    export_all: [{ do: 'run', flow: 'export', inputs: {}, as: 'exported' }],
    copy_export: [{ do: 'copy', text: '{{state.exported.result.bibtex}}' }],
    sync: [{ do: 'run', flow: 'zotero', as: 'synced' }],
    open_paper: [{ do: 'page', page: 'paper', item: '{{item}}' }],
    pick: [{ do: 'toggle', name: 'picked.@key' }],
    unpick: [{ do: 'set', name: 'picked', value: '' }],
    matrix: [
      {
        do: 'start',
        confirm: 'Make a literature matrix of the {{state.picked|count}} papers you picked? It reads each one and fills in a spreadsheet: a run of a few minutes.',
        app: 'tpl:literature-matrix',
        inputs: { papers: 'reading list: {{state.picked|json}}', project: '{{state.project_name}}' },
      },
    ],
    to_read: [{ do: 'data', op: 'update', collection: 'papers', id: '{{item.id}}', record: { status: 'To read', read_on: null } }],
    reading: [{ do: 'data', op: 'update', collection: 'papers', id: '{{item.id}}', record: { status: 'Reading', read_on: null } }],
    read: [{ do: 'data', op: 'update', collection: 'papers', id: '{{item.id}}', record: { status: 'Read', read_on: '{{today}}' } }],
    save_project: [{ do: 'data', op: 'update', collection: 'papers', id: '{{item.id}}', record: { project: '{{event.project}}', project_name: '{{event.project}}' } }],
    save_tags: [{ do: 'data', op: 'update', collection: 'papers', id: '{{item.id}}', record: { tags: '{{event.tags|split:,}}' } }],
    save_notes: [{ do: 'data', op: 'update', collection: 'papers', id: '{{item.id}}', record: { notes: '{{event.notes}}' } }],
    remove: [{ do: 'data', op: 'remove', collection: 'papers', id: '{{item.id}}', confirm: 'Remove “{{item.title}}” from your reading list?' }, { do: 'back' }],
    copy_bib: [{ do: 'copy', text: '{{item.bibtex}}' }],
    open_pdf: [{ do: 'open', url: '/file?path={{item.pdf|url}}' }],
    reproduce: [{ do: 'open', url: '/apps/tpl:reproduce-paper?in.paper={{#item.arxiv}}arXiv%3A{{item.arxiv|url}}{{/item.arxiv}}{{^item.arxiv}}{{#item.doi}}{{item.doi|url}}{{/item.doi}}{{^item.doi}}{{item.title|url}}{{/item.doi}}{{/item.arxiv}}' }],
    open_list: [{ do: 'open', url: '/apps/tpl:reading-list' }],
    copy_result_bib: [{ do: 'copy', text: '{{result.bibtex}}' }],
  },
};

// ---- Literature matrix -----------------------------------------------------------------------------------------------------

const MATRIX: AppUi = {
  pages: [
    {
      id: 'matrix',
      title: 'The matrix',
      blocks: [
        { element: 'mx-hero' },
        { element: 'mx-table', if: 'result.cells' },
        { title: 'Not read', element: 'mx-unread', if: 'result.unread' },
        { element: 'mx-more' },
      ],
    },
    { id: 'papers', title: 'Papers', blocks: [{ element: 'mx-paper', data: 'result.papers', each: true, layout: 'grid', empty: 'No papers' }] },
    { id: 'synthesis', title: 'Across the papers', if: 'result.synthesis', blocks: [{ element: 'mx-synthesis' }] },
  ],
  elements: {
    'mx-hero': {
      description: 'The matrix in numbers, with the way to its spreadsheet in the Library and a copy as a table',
      html: String.raw`<header class="hero">
  <p class="kicker">Literature matrix{{#inputs.project}} · {{inputs.project}}{{/inputs.project}}</p>
  <h1>{{result.papers|where:read=true|count}} papers side by side</h1>
  <p class="sub">Each cell says where the paper says it: its page, else its section.</p>
  <div class="stats">
    <div class="stat"><b>{{result.papers|where:read=true|count}}</b><span>papers read</span></div>
    <div class="stat"><b>{{result.columns|count}}</b><span>columns</span></div>
    <div class="stat"><b>{{result.papers|where:read=false|count}}</b><span>not read</span></div>
  </div>
  <div class="n-row acts">{{#result.sheet}}<button type="button" class="n-btn n-primary" data-event="open_sheet">Open in the Library</button>{{/result.sheet}}<button type="button" class="n-btn" data-event="copy_table">Copy as a table</button></div>
  {{^result.sheet}}<p class="warn">It could not be kept in your Library this time: copy it as a table instead.</p>{{/result.sheet}}
</header>`,
      css:
        HERO_CSS +
        STATS_CSS +
        String.raw`
.acts { margin-top: 14px; }
.warn { margin: 10px 0 0; color: var(--n-warn); font-size: 13px; }
`,
    },
    'mx-table': {
      description: 'The matrix: a row for each paper read, a column for each thing compared, each cell with where it is said',
      html: String.raw`<div class="wrap"><table class="mx">
  <thead><tr><th class="paper">Paper</th>{{#result.columns}}<th>{{.}}</th>{{/result.columns}}</tr></thead>
  <tbody>{{#result.papers|where:read=true}}<tr><th class="paper"><span class="no">{{n}}</span><b>{{title}}</b><small>{{authors|short:48}}{{#year}} · {{year}}{{/year}}</small></th>{{#result.cells|where:n=$n}}<td>{{answer}}{{#where}}<span class="at">{{where}}</span>{{/where}}</td>{{/result.cells}}</tr>{{/result.papers}}</tbody>
</table></div>`,
      css: String.raw`
.wrap { overflow-x: auto; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.mx { border-collapse: separate; border-spacing: 0; min-width: 100%; font-size: 13.5px; line-height: 1.45; }
.mx th, .mx td { padding: 10px 12px; border-bottom: 1px solid var(--n-line); text-align: left; vertical-align: top; }
.mx thead th { position: sticky; top: 0; background: var(--n-soft); color: var(--n-muted); font-size: 12px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; }
.mx td { min-width: 200px; max-width: 320px; }
.mx th.paper { position: sticky; left: 0; z-index: 1; min-width: 200px; max-width: 260px; background: var(--n-card); border-right: 1px solid var(--n-line); }
.mx thead th.paper { z-index: 2; background: var(--n-soft); }
.no { display: inline-grid; place-items: center; min-width: 20px; height: 20px; margin-right: 6px; border-radius: 6px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 11.5px; font-weight: 700; }
.mx th.paper b { font-size: 13.5px; line-height: 1.35; }
.mx th.paper small { display: block; margin-top: 3px; color: var(--n-muted); font-size: 12px; font-weight: 400; }
.at { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 6px; background: var(--n-soft); color: var(--n-accent); font-size: 11.5px; white-space: nowrap; }
.mx tbody tr:last-child > * { border-bottom: 0; }
`,
    },
    'mx-unread': {
      description: 'The papers it could not read, and why',
      html: String.raw`<ul class="un">{{#result.unread}}<li>{{.}}</li>{{/result.unread}}</ul>`,
      css: String.raw`
.un { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.un li { padding: 9px 12px; border: 1px solid color-mix(in srgb, var(--n-warn) 35%, var(--n-line)); border-radius: var(--n-radius); background: color-mix(in srgb, var(--n-warn) 8%, var(--n-card)); font-size: 13.5px; line-height: 1.45; }
`,
    },
    'mx-more': {
      description: 'A column to add: the matrix made again with it',
      html: String.raw`<form class="more" data-event="more_column"><label for="mx-col">Another column</label><input id="mx-col" name="column" required placeholder="e.g. Code released?"><button type="submit" class="n-btn">Make it again with it</button></form>`,
      css: String.raw`
.more { display: grid; grid-template-columns: 1fr auto; gap: 8px 10px; align-items: end; padding: 12px 14px; border: 1px dashed var(--n-line); border-radius: var(--n-radius); }
label { grid-column: 1 / -1; font-size: 13.5px; font-weight: 600; }
input { min-width: 0; padding: 8px 10px; border: 1px solid var(--n-line); border-radius: 10px; background: var(--n-card); color: var(--n-fg); font: inherit; font-size: 14.5px; outline: none; }
input:focus { border-color: var(--n-accent); }
`,
    },
    'mx-paper': {
      description: 'A paper of the matrix: who, where and when, what it does in a sentence, and how it was read',
      html: String.raw`<article class="pc{{^read}} unread{{/read}}">
  <p class="top"><span class="no">{{n}}</span>{{#read}}<span class="src">{{source|or:Read}}</span>{{/read}}{{^read}}<span class="src bad">Not read</span>{{/read}}</p>
  <h3>{{title}}</h3>
  <p class="meta">{{authors}}{{#venue}} · {{venue}}{{/venue}}{{#year}} · {{year}}{{/year}}</p>
  {{#gist}}<p class="gist">{{gist}}</p>{{/gist}}
  {{#note}}<p class="note">{{note}}</p>{{/note}}
  {{#link}}<a class="link" href="{{link}}" target="_blank" rel="noopener noreferrer">{{link|host}} ↗</a>{{/link}}
</article>`,
      css: String.raw`
& { height: 100%; }
.pc { display: flex; flex-direction: column; gap: 6px; height: 100%; box-sizing: border-box; padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.unread { border-style: dashed; }
.top { display: flex; align-items: center; gap: 8px; margin: 0; }
.no { display: grid; place-items: center; min-width: 22px; height: 22px; border-radius: 7px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 12px; font-weight: 700; }
.src { color: var(--n-muted); font-size: 12px; }
.bad { color: var(--n-warn); }
h3 { margin: 0; font-size: 15px; line-height: 1.4; }
.meta { margin: 0; color: var(--n-muted); font-size: 13px; }
.gist { margin: 2px 0 0; font-size: 14px; line-height: 1.5; }
.note { margin: 0; color: var(--n-muted); font-size: 12.5px; }
.link { margin-top: auto; color: var(--n-accent); font-size: 12.5px; text-decoration: none; }
`,
    },
    'mx-synthesis': {
      description: 'What the papers say together: where they agree and disagree, and what is still open',
      html: String.raw`<article class="doc"><div class="tools"><span>Across {{result.papers|where:read=true|count}} papers</span><button type="button" class="n-btn" data-event="copy_synthesis">Copy it</button></div><div class="body">{{result.synthesis|markdown}}</div></article>`,
      css: DOC_CSS,
    },
  },
  events: {
    open_sheet: [{ do: 'open', url: '/pages/{{result.sheet}}' }],
    copy_table: [
      {
        do: 'copy',
        text: '| Paper |{{#result.columns}} {{.}} |{{/result.columns}}\n|---|{{#result.columns}}---|{{/result.columns}}\n{{#result.papers|where:read=true}}| {{title}} ({{year}}) |{{#result.cells|where:n=$n}} {{answer}}{{#where}} ({{where}}){{/where}} |{{/result.cells}}\n{{/result.papers}}',
      },
    ],
    copy_synthesis: [{ do: 'copy', text: '{{result.synthesis}}' }],
    more_column: [{ do: 'again', confirm: 'Make the matrix again with “{{event.column}}” as a column too? It reads the papers again: a new run.', inputs: { columns: '{{inputs.columns}}\n{{event.column}}' } }],
  },
};

// ---- Reproduce a paper ----------------------------------------------------------------------------------------------------

const REPRODUCE: AppUi = {
  pages: [
    {
      id: 'result',
      title: 'Did it reproduce?',
      blocks: [
        { element: 'rp-hero' },
        { title: 'The paper’s numbers and ours', element: 'rp-table', if: 'result.results' },
        { title: 'The setting, as the paper gives it', text: '{{result.setting}}', if: 'result.setting' },
      ],
    },
    {
      id: 'took',
      title: 'What it took',
      if: 'result.steps',
      blocks: [
        { element: 'rp-steps' },
        { title: 'Changes and fixes', element: 'rp-fixes', if: 'result.fixes' },
      ],
    },
    { id: 'report', title: 'Report', if: 'result.report', blocks: [{ element: 'rp-report' }] },
  ],
  elements: {
    'rp-hero': {
      description: 'Whether it reproduced, in a word and in numbers, with its code, where the work is and its runs in Experiments',
      html: String.raw`<header class="hero {{#result.matched}}yes{{/result.matched}}{{^result.matched}}no{{/result.matched}}">
  <p class="kicker">Reproduction{{#result.paper}} · {{result.paper|short:90}}{{/result.paper}}</p>
  <h1><span class="mark" aria-hidden="true">{{#result.matched}}✓{{/result.matched}}{{^result.matched}}≈{{/result.matched}}</span>{{result.verdict}}</h1>
  {{#result.summary}}<p class="sub">{{result.summary}}</p>{{/result.summary}}
  <div class="stats">
    <div class="stat"><b>{{result.results|where:close=true|count}} of {{result.results|count}}</b><span>numbers close to the paper’s</span></div>
    <div class="stat"><b>{{result.hours|or:—}}</b><span>hours</span></div>
    <div class="stat"><b>{{result.fixes|count}}</b><span>changes and fixes</span></div>
  </div>
  <p class="where">{{#result.repo}}<a href="{{result.repo}}" target="_blank" rel="noopener noreferrer">{{result.repo|host}} ↗</a>{{/result.repo}}{{#result.folder}}<span>{{result.folder}}</span><button type="button" class="n-btn" data-event="open_folder">Open the folder</button>{{/result.folder}}</p>
  {{#result.runs|first}}<p class="where">{{#result.runs|count|is:1}}<button type="button" class="n-btn" data-event="open_run" data-run="{{result.runs|first}}">Open its run in Experiments</button>{{/result.runs}}{{^result.runs|count|is:1}}<span>Its runs in Experiments</span>{{#result.runs}}<button type="button" class="n-btn" data-event="open_run" data-run="{{.}}">Run {{@number}}</button>{{/result.runs}}{{/result.runs}}</p>{{/result.runs}}
  {{^result.matched}}<div class="n-row"><button type="button" class="n-btn" data-event="again">Try again</button></div>{{/result.matched}}
</header>`,
      css:
        HERO_CSS +
        STATS_CSS +
        String.raw`
.mark { display: inline-grid; place-items: center; width: 30px; height: 30px; margin-right: 10px; border-radius: 9px; vertical-align: 2px; font-size: 17px; }
.yes .mark { background: color-mix(in srgb, var(--n-ok) 18%, var(--n-card)); color: var(--n-ok); }
.no .mark { background: color-mix(in srgb, var(--n-warn) 18%, var(--n-card)); color: var(--n-warn); }
.where { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 14px 0 0; color: var(--n-muted); font-size: 13px; overflow-wrap: anywhere; }
.where a { color: var(--n-accent); text-decoration: none; }
.n-row { margin-top: 12px; }
`,
    },
    'rp-table': {
      description: 'Each number beside the paper’s, with the difference: close ones in green, the others in amber',
      html: String.raw`<div class="wrap"><table class="cmp">
  <thead><tr><th>Metric</th><th>Setting</th><th class="num">The paper</th><th class="num">Ours</th><th class="num">Difference</th></tr></thead>
  <tbody>{{#result.results}}<tr class="{{#close}}ok{{/close}}{{^close}}off{{/close}}"><td><b>{{metric}}</b></td><td>{{setting}}</td><td class="num">{{paper|number|or:—}}</td><td class="num">{{ours|number|or:—}}</td><td class="num diff">{{#difference|over:0}}+{{/difference}}{{difference|number|or:—}}</td></tr>{{#note}}<tr class="note"><td colspan="5">{{note}}</td></tr>{{/note}}{{/result.results}}</tbody>
</table></div>`,
      css: String.raw`
.wrap { overflow-x: auto; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.cmp { width: 100%; border-collapse: collapse; font-size: 14px; }
.cmp th, .cmp td { padding: 9px 12px; border-bottom: 1px solid var(--n-line); text-align: left; vertical-align: top; }
.cmp thead th { background: var(--n-soft); color: var(--n-muted); font-size: 12px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; }
.num { text-align: right !important; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ok .diff { color: var(--n-ok); font-weight: 600; }
.off .diff { color: var(--n-warn); font-weight: 600; }
.note td { padding-top: 0; color: var(--n-muted); font-size: 12.5px; }
tbody tr:last-child td { border-bottom: 0; }
`,
    },
    'rp-steps': {
      description: 'What it did, step by step, with the minutes each took',
      html: String.raw`<ol class="steps">{{#result.steps}}<li class="{{^ok}}bad{{/ok}}"><span class="dot">{{n}}</span><div class="what"><p>{{step}}</p>{{#note}}<small>{{note}}</small>{{/note}}</div><span class="min">{{#minutes}}{{minutes|number}} min{{/minutes}}</span></li>{{/result.steps}}</ol>
<p class="total">{{#result.hours}}{{result.hours|number}} hours in all{{/result.hours}}</p>`,
      css: String.raw`
.steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.steps li { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 10px 12px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.dot { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--n-accent-soft); color: var(--n-accent); font-size: 12px; font-weight: 700; }
.bad .dot { background: color-mix(in srgb, var(--n-warn) 18%, var(--n-card)); color: var(--n-warn); }
.what p { margin: 2px 0 0; font-size: 14.5px; line-height: 1.45; }
.what small { display: block; margin-top: 3px; color: var(--n-muted); font-size: 12.5px; }
.min { color: var(--n-muted); font-size: 12.5px; white-space: nowrap; padding-top: 4px; }
.total { margin: 10px 0 0; color: var(--n-muted); font-size: 13px; }
`,
    },
    'rp-fixes': {
      description: 'Every change it made to their code or settings, and why',
      html: String.raw`<ul class="fx">{{#result.fixes}}<li><span aria-hidden="true">🔧</span><p>{{.}}</p></li>{{/result.fixes}}</ul>`,
      css: String.raw`
.fx { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.fx li { display: flex; gap: 10px; padding: 10px 12px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.fx p { margin: 0; font-size: 14px; line-height: 1.5; }
`,
    },
    'rp-report': {
      description: 'REPRODUCTION.md, to read and to copy',
      html: String.raw`<article class="doc"><div class="tools"><span>REPRODUCTION.md{{#result.folder}} · {{result.folder}}{{/result.folder}}</span><button type="button" class="n-btn" data-event="copy_report">Copy the report</button></div><div class="body">{{result.report|markdown}}</div></article>`,
      css: DOC_CSS,
    },
  },
  events: {
    copy_report: [{ do: 'copy', text: '{{result.report}}' }],
    open_folder: [{ do: 'open', url: '/files?dir={{result.folder|url}}' }],
    open_run: [{ do: 'open', url: '/system/experiments/{{event.run|url}}' }],
    again: [{ do: 'again', confirm: 'Try it again with the same answers? It is a new run, which starts from the work folder as it is.' }],
  },
};

// ---- Reviewer simulator ----------------------------------------------------------------------------------------------------

const REVIEWS: AppUi = {
  pages: [
    {
      id: 'reviews',
      title: 'The reviews',
      blocks: [
        { element: 'rv-hero' },
        { element: 'rv-card', data: 'result.reviews', each: true, empty: 'No reviews' },
      ],
    },
    {
      id: 'meta',
      title: 'Meta-review',
      if: 'result.meta',
      blocks: [
        { element: 'rv-meta' },
        { title: 'What could sink it, the most dangerous first', element: 'rv-risk', data: 'result.risks', each: true, if: 'result.risks' },
      ],
    },
    { id: 'asks', title: 'Baselines and ablations', if: 'result.asks', blocks: [{ element: 'rv-ask', data: 'result.asks', each: true }] },
    {
      id: 'fix',
      title: 'Before you submit',
      if: 'result.checklist',
      blocks: [
        { title: 'Before you submit', element: 'checklist', data: 'result.checklist' },
        { element: 'rv-answer' },
      ],
    },
  ],
  elements: {
    'rv-hero': {
      description: 'The venue, the likely outcome, and the reviews in numbers',
      html: String.raw`<header class="hero">
  <p class="kicker">Simulated reviews · {{result.venue}}</p>
  <h1>{{result.verdict}}</h1>
  {{#result.title}}<p class="sub">{{result.title}}</p>{{/result.title}}
  <div class="stats">
    <div class="stat"><b>{{result.reviews|count}}</b><span>reviewers</span></div>
    <div class="stat"><b>{{result.average|percent|or:—}}</b><span>of the overall scale, on average</span></div>
    <div class="stat"><b>{{result.risks|where:likelihood=High|count}}</b><span>dangerous weaknesses</span></div>
    <div class="stat"><b>{{result.asks|count}}</b><span>baselines and ablations to add</span></div>
  </div>
  <p class="hint">Reviews written by a model on the venue’s form as of 2025, to find weak spots before real reviewers do: not a forecast of the decision.</p>
</header>`,
      css:
        HERO_CSS +
        STATS_CSS +
        String.raw`
.hint { margin: 12px 0 0; color: var(--n-muted); font-size: 12.5px; }
`,
    },
    'rv-card': {
      description: 'A review: who wrote it and from what angle, its scores, its summary, strengths, weaknesses and questions',
      html: String.raw`<article class="rv">
  <header><span class="who">R{{n}}</span><div class="name"><b>{{reviewer}}</b><small>{{expertise}}</small></div>{{#overall}}<div class="ov"><b>{{overall}}</b><span>overall</span></div>{{/overall}}</header>
  <div class="scores">{{#result.scores|where:n=$n}}{{^label|is:Confidence}}<span class="sc"><i>{{label}}</i><b>{{score}}</b><small>of {{max}}</small></span>{{/label}}{{/result.scores}}{{#confidence}}<span class="sc conf"><i>Confidence</i><b>{{confidence}}</b></span>{{/confidence}}</div>
  <p class="sum">{{summary}}</p>
  {{#recommendation}}<p class="rec">{{recommendation}}</p>{{/recommendation}}
  <div class="cols">
    <section><h4>Strengths</h4><p class="lines">{{strengths|lines}}</p></section>
    <section><h4>Weaknesses</h4><p class="lines">{{weaknesses|lines}}</p></section>
  </div>
  {{#questions}}<section><h4>Questions</h4><p class="lines">{{questions|lines}}</p></section>{{/questions}}
</article>`,
      css: String.raw`
.rv { padding: 16px 18px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
header { display: flex; align-items: center; gap: 12px; }
.who { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--n-accent); color: var(--n-accent-fg); font-weight: 700; }
.name { flex: 1; min-width: 0; }
.name b { display: block; font-size: 15px; }
.name small { color: var(--n-muted); font-size: 12.5px; }
.ov { text-align: right; }
.ov b { display: block; font-size: 20px; font-variant-numeric: tabular-nums; }
.ov span { color: var(--n-muted); font-size: 11.5px; }
.scores { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 10px; }
.sc { display: inline-flex; align-items: baseline; gap: 5px; padding: 3px 10px; border-radius: 999px; background: var(--n-soft); font-size: 12.5px; }
.sc i { color: var(--n-muted); font-style: normal; }
.sc small { color: var(--n-muted); font-size: 11.5px; }
.conf { background: none; border: 1px solid var(--n-line); }
.sum { margin: 0 0 8px; font-size: 14.5px; line-height: 1.55; }
.rec { margin: 0 0 10px; padding-left: 10px; border-left: 3px solid var(--n-accent); font-size: 14px; font-weight: 600; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 10px 16px; }
section { margin-top: 6px; }
h4 { margin: 0 0 4px; color: var(--n-muted); font-size: 12px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; }
.lines { margin: 0; font-size: 13.5px; line-height: 1.55; }
`,
    },
    'rv-meta': {
      description: 'The area chair’s meta-review, to read and to copy',
      html: String.raw`<article class="doc"><div class="tools"><span>The area chair · {{result.venue}}</span><span class="n-row"><button type="button" class="n-btn" data-event="copy_meta">Copy it</button><button type="button" class="n-btn" data-event="copy_reviews">Copy every review</button></span></div><div class="body">{{result.meta|markdown}}</div></article>`,
      css: DOC_CSS,
    },
    'rv-risk': {
      description: 'A weakness that could sink the paper: why, how likely, and what fixes it',
      html: String.raw`<div class="risk {{likelihood|slug}}"><span class="rank">{{n}}</span><div class="w"><p class="what">{{weakness}}</p><p class="why">{{why}}</p>{{#fix}}<p class="fix"><b>What fixes it:</b> {{fix}}</p>{{/fix}}</div><span class="lk">{{likelihood}}</span></div>`,
      css: String.raw`
.risk { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 12px 14px; border: 1px solid var(--n-line); border-left-width: 4px; border-radius: var(--n-radius); background: var(--n-card); }
.high { border-left-color: var(--n-err); } .medium { border-left-color: var(--n-warn); } .low { border-left-color: var(--n-ok); }
.rank { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; background: var(--n-soft); font-size: 12px; font-weight: 700; }
.what { margin: 1px 0 4px; font-size: 14.5px; font-weight: 600; line-height: 1.45; }
.why, .fix { margin: 0 0 4px; color: var(--n-muted); font-size: 13.5px; line-height: 1.5; }
.fix b { color: var(--n-fg); font-weight: 600; }
.lk { padding: 2px 9px; border-radius: 999px; background: var(--n-soft); font-size: 12px; font-weight: 600; white-space: nowrap; }
.high .lk { background: color-mix(in srgb, var(--n-err) 14%, var(--n-card)); color: var(--n-err); }
.medium .lk { background: color-mix(in srgb, var(--n-warn) 16%, var(--n-card)); color: var(--n-warn); }
@media (max-width: 520px) { .risk { grid-template-columns: auto 1fr; } .lk { grid-column: 2; justify-self: start; } }
`,
    },
    'rv-ask': {
      description: 'A baseline, ablation or analysis reviewers will ask for: what, why, and the effort it takes',
      html: String.raw`<div class="ask"><span class="rank">{{n}}</span><div><p class="what"><span class="kind">{{kind}}</span>{{what}}</p><p class="why">{{why}}</p></div>{{#effort}}<span class="eff">{{effort}}</span>{{/effort}}</div>`,
      css: String.raw`
.ask { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.rank { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 12px; font-weight: 700; }
.what { margin: 1px 0 4px; font-size: 14.5px; line-height: 1.45; }
.kind { margin-right: 8px; padding: 1px 8px; border-radius: 999px; background: var(--n-soft); color: var(--n-muted); font-size: 11.5px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; }
.why { margin: 0; color: var(--n-muted); font-size: 13.5px; line-height: 1.5; }
.eff { color: var(--n-muted); font-size: 12.5px; white-space: nowrap; }
@media (max-width: 520px) { .ask { grid-template-columns: auto 1fr; } .eff { grid-column: 2; } }
`,
    },
    'rv-answer': {
      description: 'The way to rehearse the rebuttal: the Rebuttal workbench, started with these reviews',
      html: String.raw`<div class="answer"><div><b>Rehearse your rebuttal</b><span>The Rebuttal workbench groups these reviews’ points, drafts a reply to each within the limit, and lists the experiments to run.</span></div><button type="button" class="n-btn n-primary" data-event="answer_reviews">Answer these reviews</button></div>`,
      css: String.raw`
.answer { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 14px 16px; border: 1px dashed var(--n-line); border-radius: var(--n-radius); }
.answer div { flex: 1 1 260px; display: grid; gap: 2px; }
.answer span { color: var(--n-muted); font-size: 13.5px; }
`,
    },
  },
  events: {
    copy_meta: [{ do: 'copy', text: '{{result.verdict}}\n\n{{result.meta}}' }],
    copy_reviews: [{ do: 'copy', text: '{{result.reviews_text}}' }],
    answer_reviews: [
      {
        do: 'start',
        confirm: 'Start the Rebuttal workbench with these reviews? It drafts a reply to each point: a run of its own, of a few minutes.',
        app: 'tpl:rebuttal-workbench',
        inputs: { reviews: '{{result.reviews_text}}', paper: '{{inputs.paper}}' },
      },
    ],
  },
};

// ---- Rebuttal workbench ----------------------------------------------------------------------------------------------------

const REBUTTAL: AppUi = {
  pages: [
    {
      id: 'points',
      title: 'Points',
      blocks: [
        { element: 'rb-hero' },
        { element: 'rb-kinds' },
        { element: 'rb-point', data: 'result.points', each: true, where: { kind: '{{state.kind}}' }, empty: 'No point of that kind' },
      ],
    },
    {
      id: 'todo',
      title: 'To do',
      blocks: [
        { title: 'Experiments to run', element: 'rb-exp', data: 'result.experiments', each: true, empty: 'No experiment to run: every point is answered in words.' },
        { title: 'Changes to make in the paper', element: 'rb-change', data: 'result.changes', each: true, empty: 'No change to the paper.' },
        { html: '<p class="n-muted" style="margin:0;font-size:13.5px">Tick each one off as it is done: the ticks stay with this rebuttal.</p>' },
      ],
    },
    {
      id: 'whole',
      title: 'Whole rebuttal',
      if: 'result.rebuttal',
      blocks: [
        { element: 'rb-lengths', if: 'result.reviewers' },
        { element: 'rb-whole' },
      ],
    },
  ],
  elements: {
    'rb-hero': {
      description: 'The rebuttal in a line, and its points by kind',
      html: String.raw`<header class="hero">
  <p class="kicker">Rebuttal · {{result.limit}}</p>
  <h1>{{result.summary}}</h1>
  <div class="stats">
    <div class="stat"><b>{{result.points|where:kind=Misread|count}}</b><span>misread</span></div>
    <div class="stat"><b>{{result.points|where:kind=Needs an experiment|count}}</b><span>need an experiment</span></div>
    <div class="stat"><b>{{result.points|where:kind=Needs words|count}}</b><span>need words</span></div>
    <div class="stat"><b>{{result.experiments|count}}</b><span>experiments to run</span></div>
  </div>
</header>`,
      css: HERO_CSS + STATS_CSS,
    },
    'rb-kinds': {
      description: 'The kinds of point, to show one kind',
      html: String.raw`<div class="chips">
  {{#state.kind}}<button type="button" class="chip" data-event="kind" data-kind="">All points</button>{{/state.kind}}{{^state.kind}}<span class="chip on">All points</span>{{/state.kind}}
  <button type="button" class="chip{{#state.kind|is:Misread}} on{{/state.kind}}" data-event="kind" data-kind="Misread">Misread</button>
  <button type="button" class="chip{{#state.kind|is:Needs an experiment}} on{{/state.kind}}" data-event="kind" data-kind="Needs an experiment">Need an experiment</button>
  <button type="button" class="chip{{#state.kind|is:Needs words}} on{{/state.kind}}" data-event="kind" data-kind="Needs words">Need words</button>
  <button type="button" class="chip{{#state.kind|is:Minor}} on{{/state.kind}}" data-event="kind" data-kind="Minor">Minor</button>
</div>`,
      css: CHIPS_CSS,
    },
    'rb-point': {
      description: 'A point: its kind, who raised it in their own words, the draft reply with its length against its share of the limit, and Copy',
      html: String.raw`<article class="pt">
  <header><span class="n">{{n}}</span><span class="kind {{kind|slug}}">{{kind}}</span><span class="who">{{reviewers}}</span></header>
  <h3>{{point}}</h3>
  <blockquote class="lines">{{quotes|lines}}</blockquote>
  <div class="reply"><p class="lines">{{reply|lines}}</p></div>
  <footer>
    <span class="len{{#length|over:$budget}} over{{/length}}"><span class="track"><span style="width: min(100%, calc({{length}} / {{budget}} * 100%))"></span></span>{{length|number}} of {{budget|number}} {{result.unit}}</span>
    {{#cites}}<span class="cites">Cites {{cites}}</span>{{/cites}}
    <button type="button" class="n-btn" data-event="copy_reply">Copy</button>
  </footer>
</article>`,
      css:
        NUM_CSS +
        String.raw`
.pt { padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.kind { padding: 2px 9px; border-radius: 999px; background: var(--n-soft); font-size: 12px; font-weight: 600; }
.misread { background: color-mix(in srgb, var(--n-info) 16%, var(--n-card)); color: var(--n-info); }
.needs-an-experiment { background: color-mix(in srgb, var(--n-warn) 16%, var(--n-card)); color: var(--n-warn); }
.needs-words { background: var(--n-accent-soft); color: var(--n-accent); }
.who { margin-left: auto; color: var(--n-muted); font-size: 12.5px; }
h3 { margin: 10px 0 8px; font-size: 15px; line-height: 1.45; }
blockquote { margin: 0 0 10px; padding: 8px 12px; border-left: 3px solid var(--n-line); border-radius: 0 10px 10px 0; background: var(--n-soft); color: var(--n-muted); font-size: 13.5px; font-style: italic; line-height: 1.5; }
.reply p { margin: 0; font-size: 14.5px; line-height: 1.6; }
footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--n-line); color: var(--n-muted); font-size: 12.5px; }
.len { display: inline-flex; align-items: center; gap: 8px; }
.track { width: 90px; height: 6px; border-radius: 999px; background: var(--n-soft); overflow: hidden; }
.track span { display: block; height: 100%; border-radius: 999px; background: var(--n-ok); }
.over { color: var(--n-err); }
.over .track span { background: var(--n-err); }
.cites { flex: 1; min-width: 0; }
footer .n-btn { margin-left: auto; }
`,
    },
    'rb-exp': {
      description: 'An experiment to run, for which point, to tick off when done',
      html: String.raw`<div class="todo{{#state.exp.@key}} done{{/state.exp.@key}}"><button type="button" class="tick" data-event="exp_done" title="Done">✓</button><div><p>{{what}}</p><small>For point {{n}}: {{point}}</small></div></div>`,
      css: String.raw`
.todo { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.tick { width: 26px; height: 26px; border: 1.5px solid var(--n-line); border-radius: 8px; background: none; color: transparent; font: inherit; font-size: 13px; }
.tick:hover { border-color: var(--n-ok); color: var(--n-ok); }
.done .tick { border-color: var(--n-ok); background: var(--n-ok); color: var(--n-card); }
p { margin: 2px 0 0; font-size: 14.5px; line-height: 1.45; }
.done p { color: var(--n-muted); text-decoration: line-through; text-decoration-color: var(--n-line); }
small { display: block; margin-top: 3px; color: var(--n-muted); font-size: 12.5px; }
`,
    },
    'rb-change': {
      description: 'A change to make in the paper, for which point, to tick off when done',
      html: String.raw`<div class="todo{{#state.chg.@key}} done{{/state.chg.@key}}"><button type="button" class="tick" data-event="change_done" title="Done">✓</button><div><p>{{what}}</p><small>For point {{n}}: {{point}}</small></div></div>`,
      css: String.raw`
.todo { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.tick { width: 26px; height: 26px; border: 1.5px solid var(--n-line); border-radius: 8px; background: none; color: transparent; font: inherit; font-size: 13px; }
.tick:hover { border-color: var(--n-ok); color: var(--n-ok); }
.done .tick { border-color: var(--n-ok); background: var(--n-ok); color: var(--n-card); }
p { margin: 2px 0 0; font-size: 14.5px; line-height: 1.45; }
.done p { color: var(--n-muted); text-decoration: line-through; text-decoration-color: var(--n-line); }
small { display: block; margin-top: 3px; color: var(--n-muted); font-size: 12.5px; }
`,
    },
    'rb-lengths': {
      description: 'Each reviewer’s reply against the limit',
      html: String.raw`<div class="wrap"><table class="lens"><thead><tr><th>Reply to</th><th class="num">Points</th><th class="num">Length</th><th class="num">Limit</th></tr></thead><tbody>{{#result.reviewers}}<tr class="{{#over}}over{{/over}}"><td>{{reviewer}}</td><td class="num">{{points}}</td><td class="num">{{length|number}}</td><td class="num">{{limit|number|or:—}}{{#over}} · over{{/over}}</td></tr>{{/result.reviewers}}</tbody></table></div>
<p class="total">{{result.total|number}} {{result.unit}} in all · the limit: {{result.limit}}</p>`,
      css: String.raw`
.wrap { overflow-x: auto; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.lens { width: 100%; border-collapse: collapse; font-size: 14px; }
.lens th, .lens td { padding: 8px 12px; border-bottom: 1px solid var(--n-line); text-align: left; }
.lens thead th { background: var(--n-soft); color: var(--n-muted); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; }
.num { text-align: right !important; font-variant-numeric: tabular-nums; }
.over td { color: var(--n-err); }
tbody tr:last-child td { border-bottom: 0; }
.total { margin: 8px 0 0; color: var(--n-muted); font-size: 13px; }
`,
    },
    'rb-whole': {
      description: 'The whole rebuttal, reviewer by reviewer, to copy',
      html: String.raw`<article class="doc"><div class="tools"><span>{{result.total|number}} {{result.unit}}</span><button type="button" class="n-btn n-primary" data-event="copy_all">Copy the whole rebuttal</button></div><div class="body">{{result.rebuttal|markdown}}</div></article>`,
      css: DOC_CSS,
    },
  },
  events: {
    kind: [{ do: 'set', name: 'kind', value: '{{event.kind}}' }],
    copy_reply: [{ do: 'copy', text: '{{reply}}' }],
    exp_done: [{ do: 'toggle', name: 'exp.@key', keep: true }],
    change_done: [{ do: 'toggle', name: 'chg.@key', keep: true }],
    copy_all: [{ do: 'copy', text: '{{result.rebuttal}}' }],
  },
};

// ---- Paper to talk, poster and thread -----------------------------------------------------------------------------------

const TALK: AppUi = {
  pages: [
    {
      id: 'made',
      title: 'What was made',
      blocks: [
        { element: 'tk-hero' },
        { element: 'tk-made', data: 'result.made', each: true, layout: 'grid', empty: 'Nothing was made in your Library this time.' },
      ],
    },
    {
      id: 'talk',
      title: 'The talk',
      if: 'result.talk',
      blocks: [
        { element: 'tk-strip' },
        { element: 'tk-slide', data: 'result.talk', each: true },
      ],
    },
    {
      id: 'thread',
      title: 'Thread',
      if: 'result.x',
      blocks: [
        { element: 'tk-platforms' },
        { element: 'tk-post', data: 'result.x', each: true, if: '!state.platform' },
        { element: 'tk-post', data: 'result.bluesky', each: true, if: 'state.platform|is:Bluesky' },
        { element: 'tk-linkedin', if: 'state.platform|is:LinkedIn' },
      ],
    },
  ],
  elements: {
    'tk-hero': {
      description: 'The paper, the talk’s message and opening line, and what was made in numbers',
      html: String.raw`<header class="hero">
  <p class="kicker">{{inputs.minutes}}-minute talk · {{inputs.audience}}</p>
  <h1>{{result.title}}</h1>
  {{#result.message}}<p class="sub">{{result.message}}</p>{{/result.message}}
  {{#result.hook}}<p class="hook">“{{result.hook}}”</p>{{/result.hook}}
  <div class="stats">
    <div class="stat"><b>{{result.talk|count}}</b><span>slides</span></div>
    <div class="stat"><b>{{result.made|count}}</b><span>made in your Library</span></div>
    <div class="stat"><b>{{result.x|count}}</b><span>posts in the thread</span></div>
  </div>
</header>`,
      css:
        HERO_CSS +
        STATS_CSS +
        String.raw`
.hook { margin: 10px 0 0; font-size: 15px; font-style: italic; }
`,
    },
    'tk-made': {
      description: 'A thing made in the Library (slides, a poster, a project page), with the way to it',
      html: String.raw`<article class="made">
  <span class="ic" aria-hidden="true">{{#what|is:Slides}}▭{{/what}}{{#what|is:Poster}}▯{{/what}}{{#what|is:Project page}}◫{{/what}}</span>
  <p class="what">{{what}}</p>
  <h3>{{title}}</h3>
  {{#note}}<p class="note">{{note}}</p>{{/note}}
  <button type="button" class="n-btn n-primary" data-event="open_made">Open it</button>
</article>`,
      css: String.raw`
& { height: 100%; }
.made { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; height: 100%; box-sizing: border-box; padding: 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.ic { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 22px; }
.what { margin: 4px 0 0; color: var(--n-accent); font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
h3 { margin: 0; font-size: 15.5px; line-height: 1.4; }
.note { margin: 0; color: var(--n-muted); font-size: 13px; line-height: 1.45; }
.made .n-btn { margin-top: auto; }
`,
    },
    'tk-strip': {
      description: 'The talk as one strip, each slide as wide as its minutes',
      html: String.raw`<div class="strip">{{#result.talk}}<span style="flex: {{minutes}}" title="{{title}} · {{minutes}} min">{{n}}</span>{{/result.talk}}</div><p class="sum">{{result.talk|count}} slides · {{result.talk|sum:minutes}} minutes</p>`,
      css: String.raw`
.strip { display: flex; gap: 3px; height: 34px; }
.strip span { display: grid; place-items: center; min-width: 18px; border-radius: 6px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 12px; font-weight: 700; }
.strip span:nth-child(odd) { background: color-mix(in srgb, var(--n-accent) 26%, var(--n-card)); }
.sum { margin: 8px 0 0; color: var(--n-muted); font-size: 13px; }
`,
    },
    'tk-slide': {
      description: 'A slide of the talk: its minutes, title, points, figure, equation and what to say',
      html: String.raw`<article class="sl"><div class="no"><b>{{n}}</b><small>{{minutes}} min</small></div><div class="c"><h3>{{title}}</h3>{{#points}}<p class="pts">{{points}}</p>{{/points}}{{#figure}}<p class="fig">Figure: <code>{{figure}}</code></p>{{/figure}}{{#equation}}<p class="eq"><code>{{equation}}</code></p>{{/equation}}{{#notes}}<p class="notes">{{notes}}</p>{{/notes}}</div></article>`,
      css: String.raw`
.sl { display: grid; grid-template-columns: 56px 1fr; gap: 12px; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.no { display: grid; justify-items: center; align-content: start; gap: 2px; }
.no b { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--n-accent); color: var(--n-accent-fg); }
.no small { color: var(--n-muted); font-size: 11.5px; }
.c { min-width: 0; }
h3 { margin: 4px 0 6px; font-size: 15.5px; }
.pts { margin: 0 0 6px; font-size: 14px; }
.fig, .eq { margin: 0 0 6px; color: var(--n-muted); font-size: 12.5px; overflow-wrap: anywhere; }
.notes { margin: 0; padding: 8px 10px; border-radius: 10px; background: var(--n-soft); font-size: 13.5px; line-height: 1.55; }
`,
    },
    'tk-platforms': {
      description: 'The platforms, to show one’s posts, and the whole thread to copy',
      html: String.raw`<div class="bar"><div class="chips">
  {{#state.platform}}<button type="button" class="chip" data-event="platform" data-platform="">X</button>{{/state.platform}}{{^state.platform}}<span class="chip on">X</span>{{/state.platform}}
  <button type="button" class="chip{{#state.platform|is:Bluesky}} on{{/state.platform}}" data-event="platform" data-platform="Bluesky">Bluesky</button>
  <button type="button" class="chip{{#state.platform|is:LinkedIn}} on{{/state.platform}}" data-event="platform" data-platform="LinkedIn">LinkedIn</button>
</div>
{{^state.platform}}<button type="button" class="n-btn" data-event="copy_x">Copy the thread</button>{{/state.platform}}{{#state.platform|is:Bluesky}}<button type="button" class="n-btn" data-event="copy_bluesky">Copy the thread</button>{{/state.platform}}</div>`,
      css:
        CHIPS_CSS +
        String.raw`
.bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
`,
    },
    'tk-post': {
      description: 'A post of the thread, numbered, to copy',
      html: String.raw`<div class="post"><span class="n">{{@number}}/{{@count}}</span><p>{{.}}</p><button type="button" class="n-btn" data-event="copy_post">Copy</button></div>`,
      css:
        NUM_CSS +
        String.raw`
.post { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
p { margin: 2px 0 0; font-size: 14.5px; line-height: 1.55; white-space: pre-wrap; }
@media (max-width: 520px) { .post { grid-template-columns: auto 1fr; } .post .n-btn { grid-column: 2; justify-self: start; } }
`,
    },
    'tk-linkedin': {
      description: 'The post for LinkedIn, to copy',
      html: String.raw`<article class="doc"><div class="tools"><span>For LinkedIn</span><button type="button" class="n-btn" data-event="copy_linkedin">Copy the post</button></div><div class="body">{{result.linkedin|markdown}}</div></article>`,
      css: DOC_CSS,
    },
  },
  events: {
    open_made: [{ do: 'open', url: '/pages/{{page}}' }],
    platform: [{ do: 'set', name: 'platform', value: '{{event.platform}}' }],
    copy_post: [{ do: 'copy', text: '{{item}}' }],
    copy_x: [{ do: 'copy', text: '{{#result.x}}{{.}}\n\n{{/result.x}}' }],
    copy_bluesky: [{ do: 'copy', text: '{{#result.bluesky}}{{.}}\n\n{{/result.bluesky}}' }],
    copy_linkedin: [{ do: 'copy', text: '{{result.linkedin}}' }],
  },
};

// ---- Figure doctor -----------------------------------------------------------------------------------------------------------

const FIGURES: AppUi = {
  pages: [
    {
      id: 'figures',
      title: 'Before and after',
      blocks: [
        { element: 'fg-hero' },
        { element: 'fg-pair', data: 'result.figures', each: true, empty: 'No figures' },
      ],
    },
    { id: 'style', title: 'Style file', if: 'result.style', blocks: [{ element: 'fg-style' }] },
    {
      id: 'changes',
      title: 'What changed',
      if: 'result.changes',
      blocks: [
        { title: 'What changed', element: 'list', data: 'result.changes' },
        { title: 'The fonts', element: 'fg-fonts', if: 'result.fonts' },
      ],
    },
  ],
  elements: {
    'fg-hero': {
      description: 'The figures’ size and font, their colours, and what was done',
      html: String.raw`<header class="hero">
  <p class="kicker">Figures for the paper</p>
  <h1>{{result.figures|count}} figures, fit for print</h1>
  {{#result.width}}<p class="sub">{{result.width}}</p>{{/result.width}}
  {{#result.palette}}<div class="sw">{{#result.palette}}<span style="background: {{.}}" title="{{.}}"></span>{{/result.palette}}</div>{{/result.palette}}
  <div class="sum">{{result.summary|markdown}}</div>
</header>`,
      css:
        HERO_CSS +
        String.raw`
.sw { display: flex; gap: 6px; margin: 12px 0 4px; }
.sw span { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--n-line); }
.sum { margin-top: 10px; font-size: 14.5px; line-height: 1.6; }
.sum p { margin: 0 0 8px; }
`,
    },
    'fg-pair': {
      description: 'A figure before and after, side by side, with its PDF and what changed',
      html: String.raw`<article class="pair">
  <h3>{{name}}</h3>
  <div class="two">
    <figure><figcaption>Before</figcaption>{{#before}}<img src="{{before}}" alt="{{name}}, before" loading="lazy" data-n-zoom>{{/before}}{{^before}}<p class="none">No picture</p>{{/before}}</figure>
    <figure><figcaption>After</figcaption>{{#after}}<img src="{{after}}" alt="{{name}}, after" loading="lazy" data-n-zoom>{{/after}}{{^after}}<p class="none">No picture</p>{{/after}}</figure>
  </div>
  {{#notes}}<p class="notes">{{notes}}</p>{{/notes}}
  {{#file}}<p class="file"><code>{{file}}</code><button type="button" class="link" data-event="open_pdf">Open the PDF</button></p>{{/file}}
</article>`,
      css: String.raw`
.pair { padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
h3 { margin: 0 0 10px; font-size: 15px; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 12px; }
figure { margin: 0; }
figcaption { margin-bottom: 6px; color: var(--n-muted); font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
img { display: block; width: 100%; height: auto; border: 1px solid var(--n-line); border-radius: 10px; background: #fff; cursor: zoom-in; }
.none { display: grid; place-items: center; height: 120px; margin: 0; border: 1px dashed var(--n-line); border-radius: 10px; color: var(--n-muted); font-size: 13px; }
.notes { margin: 10px 0 0; font-size: 14px; line-height: 1.5; }
.file { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 0; color: var(--n-muted); font-size: 12.5px; overflow-wrap: anywhere; }
.link { padding: 0; border: 0; background: none; color: var(--n-accent); font: inherit; }
.link:hover { text-decoration: underline; }
`,
    },
    'fg-style': {
      description: 'The style file every figure uses, to copy, and how to use it',
      html: String.raw`<div class="code"><div class="tools"><span>paper.mplstyle{{#result.style_file}} · {{result.style_file}}{{/result.style_file}}</span><button type="button" class="n-btn" data-event="copy_style">Copy it</button></div><pre>{{result.style}}</pre><p class="how">In each script: <code>plt.style.use("paper.mplstyle")</code>, then <code>fig.savefig("name.pdf")</code>: vector, with its fonts embedded.</p></div>`,
      css: String.raw`
.code { padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; color: var(--n-muted); font-size: 13px; overflow-wrap: anywhere; }
pre { margin: 0; padding: 12px 14px; border-radius: 10px; background: var(--n-soft); font-size: 12.5px; line-height: 1.55; overflow-x: auto; }
.how { margin: 10px 0 0; color: var(--n-muted); font-size: 13px; }
`,
    },
    'fg-fonts': {
      description: 'What the fonts check said',
      html: String.raw`<p class="fonts">{{result.fonts}}</p>`,
      css: String.raw`
.fonts { margin: 0; padding: 10px 12px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
`,
    },
  },
  events: {
    open_pdf: [{ do: 'open', url: '/file?path={{item.file|url}}' }],
    copy_style: [{ do: 'copy', text: '{{result.style}}' }],
  },
};

/** The paper apps' views, by template id. */
export const PAPER_VIEWS: Record<string, AppUi> = {
  'reading-list': READING_LIST,
  'literature-matrix': MATRIX,
  'reproduce-paper': REPRODUCE,
  'reviewer-simulator': REVIEWS,
  'rebuttal-workbench': REBUTTAL,
  'paper-to-talk': TALK,
  'figure-doctor': FIGURES,
};
