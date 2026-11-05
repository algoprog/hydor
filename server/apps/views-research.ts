// The views of the ready-made apps for keeping up with a research field (templates-research.ts). The first five open
// on their own page (pages with on: "app", filled with their latest update, `last.result`), and the same elements show
// an earlier update on its run's page (filled with `result`). Paper radar's cards save a paper, cite it, dig into it or
// put it aside, kept in its records (a ready-made app's own page reads and changes what it keeps); Living related
// work's topics are its records, grouped by theme, with a section drafted on a click. Colours are the page kit's, so
// they look like part of the app in both themes, and they fit a phone; their words are translated as the app's are.
import type { AppUi } from '../../shared/app-ui.ts';
import { CHIPS_CSS, HERO_CSS, STATS_CSS } from './views.ts';

// ---- what several share -----------------------------------------------------------------------------------------

/** The groups' colours, as Explore's topics have them. */
const TONES = String.raw`
.t1 { --tc: var(--n-c1); } .t2 { --tc: var(--n-c2); } .t3 { --tc: var(--n-c3); } .t4 { --tc: var(--n-c4); } .t5 { --tc: var(--n-c5); } .t6 { --tc: var(--n-c6); }
`;

/** A paper as a card: where and when, its title (a link), its authors, a line or two on it, and its buttons. */
const PAPER_CSS = String.raw`
.pp { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; margin: 0; color: var(--n-muted); font-size: 12.5px; }
.pp h3, .pp h4 { margin: 0; font-size: 16px; line-height: 1.35; font-weight: 650; overflow-wrap: anywhere; }
.pp h4 { font-size: 15px; }
.pp h3 a, .pp h4 a { color: inherit; text-decoration: none; }
.pp h3 a:hover, .pp h4 a:hover { text-decoration: underline; text-decoration-color: var(--tc, var(--n-accent)); text-underline-offset: 3px; }
.by { margin: 0; color: var(--n-muted); font-size: 13px; line-height: 1.4; }
.tldr, .sum { margin: 0; font-size: 14.5px; line-height: 1.5; }
.why, .rel { margin: 0; padding-left: 10px; border-left: 2px solid var(--tc, var(--n-accent)); color: var(--n-muted); font-size: 13.5px; font-style: italic; line-height: 1.45; }
.acts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 4px 0 0; }
.b { padding: 3px 10px; border: 1px solid var(--n-line); border-radius: 999px; background: none; color: var(--n-muted); font: inherit; font-size: 12.5px; line-height: 1.5; text-decoration: none; white-space: nowrap; cursor: pointer; }
.b:hover { color: var(--n-fg); border-color: var(--n-accent); }
.b.on { border-color: var(--n-accent); background: var(--n-accent-soft); color: var(--n-accent); }
.b.quiet { border-color: transparent; }
.b.quiet:hover { border-color: var(--n-line); }
.new { padding: 0 7px; border-radius: 999px; background: var(--n-accent); color: var(--n-accent-fg); font-size: 11.5px; font-weight: 700; letter-spacing: .02em; }
.empty { margin: 8px 0; color: var(--n-muted); font-size: 14px; }
.note { margin: 10px 0 0; color: var(--n-muted); font-size: 12.5px; }
`;

/** A badge: a few words in a tint of their colour. */
const BADGE_CSS = String.raw`
.badge { display: inline-block; padding: 1px 9px; border-radius: 999px; background: var(--n-soft); color: var(--n-muted); font-size: 12px; font-weight: 650; white-space: nowrap; }
.badge.ok { background: color-mix(in srgb, var(--n-ok) 16%, var(--n-card)); color: var(--n-ok); }
.badge.warn { background: color-mix(in srgb, var(--n-warn) 18%, var(--n-card)); color: var(--n-warn); }
.badge.err { background: color-mix(in srgb, var(--n-err) 14%, var(--n-card)); color: var(--n-err); }
.badge.info { background: var(--n-accent-soft); color: var(--n-accent); }
`;

// ---- Paper radar ---------------------------------------------------------------------------------------------------
// The day's papers, by the project or topic each fits best: a card each, with Save (kept in the app's records, and
// leaned toward from then on), Cite (its BibTeX copied), PDF, Dig deeper (a Deep research report on it) and Not for me
// (put aside, and leaned away from). Whether a card is saved or put aside comes from the app's latest marks.

const RADAR = String.raw`<header class="hero">
  <p class="kicker">Paper radar{{#edition}} · {{edition|longdate}}{{/edition}}</p>
  <h1>{{headline|or:Your new papers}}</h1>
  <p class="sub">{{papers|count}} picked for you from {{fetched|number}} new papers{{#window}}, {{window}}{{/window}}.</p>
  {{#groups|count|over:1}}<nav class="chips" aria-label="Projects and topics">
    {{#state.group}}<button type="button" class="chip" data-event="group" data-name="">All</button>{{/state.group}}{{^state.group}}<span class="chip on">All</span>{{/state.group}}
    {{#groups}}<button type="button" class="chip t{{n}}{{#group|is:$state.group}} on{{/group}}" data-event="group" data-name="{{group}}"><i class="dot"></i>{{group}} <span class="ct">{{count}}</span></button>{{/groups}}
  </nav>{{/groups}}
</header>
{{#groups|where:group=$state.group}}<section class="grp t{{n}}">
  <header class="gh"><h2>{{group}}</h2>{{#about}}<p>{{about}}</p>{{/about}}</header>
  <div class="list">{{#papers|where:group=$group}}
    {{#data.marks|where:id=$key|where:mark=aside}}<p class="gone">Not for you: {{title}} <button type="button" class="b quiet" data-event="undo" data-key="{{key}}">Undo</button></p>{{/data.marks}}
    {{^data.marks|where:id=$key|where:mark=aside}}<article class="pp" data-key="{{key}}">
      <p class="meta"><span>{{where}}</span>{{#date}}<span>{{date|shortdate}}</span>{{/date}}{{#who}}<span class="who">You follow {{who}}</span>{{/who}}</p>
      <h3><a href="{{url}}" target="_blank" rel="noopener noreferrer">{{title}}</a></h3>
      <p class="by">{{authors}}</p>
      {{#tldr}}<p class="tldr">{{tldr}}</p>{{/tldr}}
      {{#why}}<p class="why">{{why}}</p>{{/why}}
      <p class="acts">
        {{#data.marks|where:id=$key|where:mark=saved}}<button type="button" class="b on" data-event="unsave" data-key="{{key}}" title="Saved: click to take it out">★ Saved</button>{{/data.marks}}{{^data.marks|where:id=$key|where:mark=saved}}<button type="button" class="b" data-event="save" data-key="{{key}}" data-title="{{title}}" data-authors="{{authors}}" data-date="{{date}}" data-where="{{where}}" data-url="{{url}}" data-tldr="{{tldr}}" data-abstract="{{abstract}}" data-bib="{{bibtex}}" data-group="{{group}}">☆ Save</button>{{/data.marks}}
        <button type="button" class="b" data-event="cite" data-bib="{{bibtex}}" title="Copy its BibTeX">Cite</button>
        {{#pdf}}<a class="b" href="{{pdf}}" target="_blank" rel="noopener noreferrer">PDF</a>{{/pdf}}
        <button type="button" class="b" data-event="dig" data-title="{{title}}" data-url="{{url}}" data-group="{{group}}">Dig deeper</button>
        <button type="button" class="b quiet" data-event="nope" data-key="{{key}}" data-title="{{title}}" data-abstract="{{abstract}}">Not for me</button>
      </p>
    </article>{{/data.marks}}
  {{/papers}}</div>
</section>{{/groups}}
{{^papers}}<p class="empty">Nothing new for you since the last update.</p>{{/papers}}
<p class="foot">From {{sources|or:arXiv}}. Saving a paper, or saying one is not for you, steers the next days’ picks.{{#note}} {{note}}.{{/note}}</p>`;

const RADAR_CSS =
  HERO_CSS +
  CHIPS_CSS +
  PAPER_CSS +
  TONES +
  String.raw`
.hero { margin-bottom: 18px; }
.chips { margin-top: 14px; }
.chip .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tc, var(--n-accent)); }
.chip .ct { color: var(--n-muted); font-size: 12px; }
.grp { margin: 0 0 22px; padding-top: 12px; border-top: 3px solid var(--tc, var(--n-accent)); }
.gh { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; margin-bottom: 12px; }
.gh h2 { margin: 0; font-size: 19px; line-height: 1.25; }
.gh p { margin: 0; flex: 1 1 240px; color: var(--n-muted); font-size: 13px; }
.list { display: flex; flex-direction: column; gap: 10px; }
.who { color: var(--tc, var(--n-accent)); font-weight: 650; }
.gone { margin: 0; padding: 8px 14px; border: 1px dashed var(--n-line); border-radius: var(--n-radius); color: var(--n-muted); font-size: 13px; }
.foot { margin: 6px 0 0; padding-top: 12px; border-top: 1px solid var(--n-line); color: var(--n-muted); font-size: 12.5px; }
@media (max-width: 640px) {
  .chips { flex-wrap: nowrap; overflow-x: auto; margin: 14px -16px 0; padding: 0 16px 2px; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex: none; }
  .pp { padding: 12px 13px; }
}
`;

const PAPER_RADAR_UI: AppUi = {
  pages: [
    { id: 'today', title: 'Today', on: 'app', blocks: [{ element: 'radar', data: 'last.result' }] },
    {
      id: 'saved',
      title: 'Saved',
      on: 'app',
      blocks: [
        { element: 'saved-head', data: 'data.saved', sort: '-createdAt', limit: 300 },
        { element: 'saved-paper', data: 'data.saved', sort: '-createdAt', limit: 300, each: true, empty: 'Papers you save show here, newest first, ready to cite.' },
      ],
    },
    { id: 'papers', title: 'The papers', blocks: [{ element: 'radar', data: 'result' }] },
  ],
  elements: {
    radar: { description: 'The day’s papers: the line over them, the projects and topics to show one of, and a card for each paper under the one it fits', html: RADAR, css: RADAR_CSS },
    'saved-head': {
      description: 'How many papers are saved, and their BibTeX to copy all at once',
      html: String.raw`{{#item|count}}<div class="bar"><span>{{item|count}} saved, newest first</span><button type="button" class="n-btn" data-event="copy_all">Copy all as BibTeX</button></div>{{/item}}`,
      css: String.raw`.bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; color: var(--n-muted); font-size: 13.5px; }`,
    },
    'saved-paper': {
      description: 'A saved paper: where and when, its title, why it was picked, and buttons to cite it, add it to the Reading list, dig into it or take it out',
      html: String.raw`<article class="pp">
  <p class="meta">{{#group}}<span>{{group}}</span>{{/group}}{{#where}}<span>{{where}}</span>{{/where}}{{#date}}<span>{{date|shortdate}}</span>{{/date}}<span>saved {{createdAt|ago}}</span></p>
  <h3><a href="{{url}}" target="_blank" rel="noopener noreferrer">{{title}}</a></h3>
  <p class="by">{{authors}}</p>
  {{#tldr}}<p class="tldr">{{tldr}}</p>{{/tldr}}
  <p class="acts">
    <button type="button" class="b" data-event="cite" data-bib="{{bibtex}}" title="Copy its BibTeX">Cite</button>
    <button type="button" class="b" data-event="reading" data-title="{{title}}" data-url="{{url}}">Add to Reading list</button>
    <button type="button" class="b" data-event="dig" data-title="{{title}}" data-url="{{url}}" data-group="{{group}}">Dig deeper</button>
    <button type="button" class="b quiet" data-event="remove" data-key="{{id}}" data-title="{{title}}">Take it out</button>
  </p>
</article>`,
      css: PAPER_CSS,
    },
  },
  events: {
    group: [{ do: 'set', name: 'group', value: '{{event.name}}' }],
    save: [
      { do: 'data', op: 'add', collection: 'marks', record: { id: '{{event.key}}', key: '{{event.key}}', mark: 'saved', title: '{{event.title}}', abstract: '{{event.abstract}}' } },
      {
        do: 'data',
        op: 'add',
        collection: 'saved',
        record: { id: '{{event.key}}', key: '{{event.key}}', title: '{{event.title}}', authors: '{{event.authors}}', date: '{{event.date}}', where: '{{event.where}}', url: '{{event.url}}', tldr: '{{event.tldr}}', abstract: '{{event.abstract}}', bibtex: '{{event.bib}}', group: '{{event.group}}' },
      },
    ],
    unsave: [
      { do: 'data', op: 'remove', collection: 'marks', id: '{{event.key}}' },
      { do: 'data', op: 'remove', collection: 'saved', id: '{{event.key}}' },
    ],
    nope: [{ do: 'data', op: 'add', collection: 'marks', record: { id: '{{event.key}}', key: '{{event.key}}', mark: 'aside', title: '{{event.title}}', abstract: '{{event.abstract}}' } }],
    undo: [{ do: 'data', op: 'remove', collection: 'marks', id: '{{event.key}}' }],
    cite: [{ do: 'copy', text: '{{event.bib}}' }],
    copy_all: [{ do: 'copy', text: '{{#item}}{{bibtex}}\n\n{{/item}}' }],
    dig: [
      {
        do: 'start',
        confirm: 'Start a research report on “{{event.title}}”? It is a run of its own, of a few minutes.',
        app: 'tpl:deep-research',
        inputs: { topic: 'The paper “{{event.title}}” ({{event.url}}): what it does, how it compares with earlier work, and what it means for {{event.group}}', depth: 'Quick overview' },
      },
    ],
    reading: [{ do: 'start', confirm: 'Add “{{event.title}}” to your Reading list?', app: 'tpl:reading-list', inputs: { paper: '{{event.url}}' } }],
    remove: [
      { do: 'data', op: 'remove', collection: 'saved', id: '{{event.key}}', confirm: 'Take “{{event.title}}” out of your saved papers?' },
      { do: 'data', op: 'remove', collection: 'marks', id: '{{event.key}}' },
    ],
  },
};

// ---- Citation alerts ------------------------------------------------------------------------------------------------
// Who cited you since the last check, by your paper: how each cites you (builds on, compares with, disputes, mentions),
// the sentence that does, the mention of your paper marked, and the citing paper. Then your papers with their counts.

const CITE_HEAD = String.raw`<header class="hero">
  <p class="kicker">Citation alerts{{#checked}} · {{checked|longdate}}{{/checked}}</p>
  <h1>{{headline}}</h1>
  <p class="sub">{{name}}{{#where}} · {{where}}{{/where}}</p>
  <div class="stats">
    <div class="stat"><b>{{fresh|number}}</b><span>new this time</span></div>
    <div class="stat"><b>{{total|number}}</b><span>citations in all</span></div>
    {{#hindex}}<div class="stat"><b>{{hindex}}</b><span>h-index</span></div>{{/hindex}}
  </div>
  {{#citations|count}}<nav class="chips" aria-label="How they cite you">
    {{#state.kind}}<button type="button" class="chip" data-event="kind" data-name="">All</button>{{/state.kind}}{{^state.kind}}<span class="chip on">All</span>{{/state.kind}}
    {{#citations|unique:kind}}<button type="button" class="chip{{#.|is:$state.kind}} on{{/.}}" data-event="kind" data-name="{{.}}">{{.}}</button>{{/citations}}
  </nav>{{/citations}}
</header>`;

const CITE_NEWS = String.raw`{{#papers}}{{#new}}<section class="mine">
  <h2><span class="lbl">Your paper</span>{{title}}</h2>
  <div class="list">{{#citations|where:mine=$key|where:kind=$state.kind}}<article class="cite k-{{kind|slug}}">
    <p class="top">{{#kind}}<span class="badge kb">{{kind}}</span>{{/kind}}{{#influential}}<span class="badge info">Builds on it heavily</span>{{/influential}}{{#gist}}<span class="gist">{{gist}}</span>{{/gist}}</p>
    {{#mark}}<blockquote>{{pre}}<mark>{{mark}}</mark>{{post}}</blockquote>{{/mark}}{{^mark}}{{#pre}}<blockquote>{{pre}}</blockquote>{{/pre}}{{/mark}}
    <p class="who"><a href="{{url}}" target="_blank" rel="noopener noreferrer">{{title}}</a></p>
    <p class="by">{{authors}}{{#venue}} · {{venue}}{{/venue}}{{#year}} · {{year}}{{/year}}</p>
    {{#pre}}<p class="acts"><button type="button" class="b" data-event="copy_quote" data-quote="{{pre}}{{mark}}{{post}}" data-title="{{title}}" data-authors="{{authors}}">Copy the sentence</button></p>{{/pre}}
  </article>{{/citations}}</div>
</section>{{/new}}{{/papers}}
{{^citations}}<p class="empty">No new citations since the last check.</p>{{/citations}}
{{#note}}<p class="note">{{note}}</p>{{/note}}
<p class="note">From {{source|or:Semantic Scholar}}. A citing paper with no sentence is one its service has not read in full.</p>`;

const CITE_CSS =
  PAPER_CSS +
  BADGE_CSS +
  String.raw`
.mine { margin: 0 0 22px; }
.mine h2 { margin: 0 0 10px; font-size: 17px; line-height: 1.35; }
.lbl { display: block; margin-bottom: 2px; color: var(--n-muted); font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.list { display: flex; flex-direction: column; gap: 10px; }
.cite { padding: 13px 15px; border: 1px solid var(--n-line); border-left: 3px solid var(--kc, var(--n-line)); border-radius: var(--n-radius); background: var(--n-card); }
.k-builds-on { --kc: var(--n-ok); } .k-compares-with { --kc: var(--n-info); } .k-disputes { --kc: var(--n-err); } .k-mentions { --kc: var(--n-line); }
.top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 0 0 8px; }
.kb { background: color-mix(in srgb, var(--kc, var(--n-muted)) 16%, var(--n-card)); color: var(--kc, var(--n-muted)); }
.k-mentions .kb { color: var(--n-muted); background: var(--n-soft); }
.gist { color: var(--n-muted); font-size: 13px; }
blockquote { margin: 0 0 8px; padding-left: 12px; border-left: 2px solid var(--n-line); font-size: 14.5px; line-height: 1.55; }
mark { padding: 0 2px; border-radius: 3px; background: color-mix(in srgb, var(--n-warn) 30%, transparent); color: inherit; }
.who { margin: 0; font-size: 14.5px; font-weight: 600; line-height: 1.4; }
.who a { color: inherit; }
`;

const MY_PAPERS = String.raw`<div class="mp">{{#papers}}<a class="row" href="{{url}}" target="_blank" rel="noopener noreferrer">
  <span class="t"><b>{{title}}</b><small>{{#venue}}{{venue}} · {{/venue}}{{year}}</small></span>
  <span class="n"><b>{{cited|number}}</b><small>citations</small></span>
  {{#new}}<span class="new">+{{new}}</span>{{/new}}
</a>{{/papers}}</div>
{{^papers}}<p class="empty">No papers of yours were found yet.</p>{{/papers}}`;

const MY_PAPERS_CSS =
  PAPER_CSS +
  String.raw`
.mp { display: flex; flex-direction: column; gap: 8px; }
.row { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; padding: 10px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); color: inherit; text-decoration: none; }
.row:hover { border-color: var(--n-accent); }
.t b { display: block; font-size: 14.5px; line-height: 1.4; font-weight: 600; }
.t small, .n small { color: var(--n-muted); font-size: 12.5px; }
.n { text-align: right; } .n b { display: block; font-size: 17px; font-variant-numeric: tabular-nums; }
@media (max-width: 520px) { .row { grid-template-columns: 1fr auto; } .row .new { grid-column: 2; justify-self: end; } }
`;

const CITATION_ALERTS_UI: AppUi = {
  pages: [
    { id: 'news', title: 'New', on: 'app', blocks: [{ element: 'cite-head', data: 'last.result' }, { element: 'cite-news', data: 'last.result' }] },
    { id: 'mine', title: 'Your papers', on: 'app', blocks: [{ element: 'my-papers', data: 'last.result' }] },
    { id: 'cited', title: 'New citations', blocks: [{ element: 'cite-head', data: 'result' }, { element: 'cite-news', data: 'result' }] },
    { id: 'papers', title: 'Your papers', blocks: [{ element: 'my-papers', data: 'result' }] },
  ],
  elements: {
    'cite-head': { description: 'You, your citations in numbers, and the ways they cite you to show one of', html: CITE_HEAD, css: HERO_CSS + STATS_CSS + CHIPS_CSS + String.raw`.chips { margin-top: 14px; }` },
    'cite-news': { description: 'The new citations by your paper: how each cites you, its sentence with your paper marked, and the citing paper', html: CITE_NEWS, css: CITE_CSS },
    'my-papers': { description: 'Your papers, with their citations and how many are new', html: MY_PAPERS, css: MY_PAPERS_CSS },
  },
  events: {
    kind: [{ do: 'set', name: 'kind', value: '{{event.name}}' }],
    copy_quote: [{ do: 'copy', text: '“{{event.quote}}” ({{event.authors}}, {{event.title}})' }],
  },
};

// ---- New-model watch ------------------------------------------------------------------------------------------------
// The new models: those that beat your best first, then the new ones, those being evaluated, the done ones with their
// scores; each with what its card says, its size, licence and downloads. A page on your evaluation says what runs.

const NM_HEAD = String.raw`<header class="hero">
  <p class="kicker">New-model watch{{#task}} · {{task}}{{/task}}</p>
  <h1>{{headline}}</h1>
  <p class="sub">{{listed|number}} models listed{{#young}}, {{young}} too new to judge yet{{/young}}{{#copies}}, {{copies}} copies in other formats left out{{/copies}}{{#later}}, {{later}} left for the next update{{/later}}.</p>
  <div class="stats">
    <div class="stat"><b>{{fresh|number}}</b><span>new this time</span></div>
    <div class="stat"><b>{{models|where:state=beats|count}}</b><span>beat your best</span></div>
    <div class="stat"><b>{{models|where:state=evaluating|count}}</b><span>being evaluated</span></div>
    {{#best}}<div class="stat"><b>{{best}}</b><span>your best{{#metric}}, {{metric}}{{/metric}}</span></div>{{/best}}
  </div>
  {{#models|count}}<nav class="chips" aria-label="Show">
    {{#state.show}}<button type="button" class="chip" data-event="show" data-name="">All</button>{{/state.show}}{{^state.show}}<span class="chip on">All</span>{{/state.show}}
    {{#models|unique:state}}<button type="button" class="chip{{#.|is:$state.show}} on{{/.}}" data-event="show" data-name="{{.}}">{{.}}</button>{{/models}}
  </nav>{{/models}}
  {{#note}}<p class="note">{{note}}</p>{{/note}}
</header>`;

const NM_MODEL = String.raw`<article class="pp s-{{state|slug}}">
  <p class="meta"><span class="badge st">{{state}}</span>{{#fresh}}<span class="new">New</span>{{/fresh}}<span>{{maker}}</span>{{#created}}<span>out {{created|ago}}</span>{{/created}}</p>
  <h3><a href="{{url}}" target="_blank" rel="noopener noreferrer">{{model}}</a></h3>
  {{#what}}<p class="tldr">{{what}}</p>{{/what}}
  <p class="facts">{{#size}}<span>{{size|number}}M parameters</span>{{/size}}{{#licence}}<span>{{licence}}</span>{{/licence}}<span>{{downloads|number}} downloads</span>{{#likes}}<span>{{likes}} likes</span>{{/likes}}</p>
  {{#score}}<p class="score">Score <b>{{score}}</b>{{#state|is:beats}} · better than your best{{/state}}</p>{{/score}}
  {{#note}}<p class="by">{{note}}</p>{{/note}}
  <p class="acts"><a class="b" href="{{url}}" target="_blank" rel="noopener noreferrer">Its page</a><button type="button" class="b" data-event="copy_name" data-name="{{model}}">Copy its name</button></p>
</article>`;

const NM_MODEL_CSS =
  PAPER_CSS +
  BADGE_CSS +
  String.raw`
& { height: 100%; } .pp { height: 100%; box-sizing: border-box; }
.s-beats { border-color: color-mix(in srgb, var(--n-ok) 55%, var(--n-line)); }
.s-beats .st { background: color-mix(in srgb, var(--n-ok) 16%, var(--n-card)); color: var(--n-ok); }
.s-evaluating .st, .s-new .st { background: var(--n-accent-soft); color: var(--n-accent); }
.s-failed .st { background: color-mix(in srgb, var(--n-err) 14%, var(--n-card)); color: var(--n-err); }
.facts { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; color: var(--n-muted); font-size: 12.5px; }
.score { margin: 0; font-size: 14px; } .score b { font-size: 16px; font-variant-numeric: tabular-nums; }
.pp h3 { font-size: 15px; font-family: var(--n-mono); font-weight: 600; }
`;

const NM_EVAL = String.raw`<div class="card">
  <h3>Your evaluation</h3>
  {{#last.inputs.command}}
  <p>Each new model worth trying runs <code>{{last.inputs.command}}</code>{{#last.inputs.folder}} in <code>{{last.inputs.folder}}</code>{{/last.inputs.folder}}, with <code>{model}</code> its name, on a GPU of yours, as an experiment in the group “New-model watch”.</p>
  {{#last.inputs.metric}}<p>It reads <b>{{last.inputs.metric}}</b> from what the run prints ({{last.inputs.better|lower}} is better){{#last.inputs.best}}, and Experiments tells you when a model does better than {{last.inputs.best}}{{/last.inputs.best}}.</p>{{/last.inputs.metric}}
  <p class="acts"><button type="button" class="n-btn" data-event="experiments">Open Experiments</button></p>
  {{/last.inputs.command}}
  {{^last.inputs.command}}<p>No evaluation is set, so it only lists the new models. Give it a command in its settings (the sliders at the top), with <code>{model}</code> where the model's name goes, and each new model worth trying runs on your own data.</p>{{/last.inputs.command}}
  <p class="m">It watches <b>{{last.result.task}}</b> models{{#last.inputs.words}} named {{last.inputs.words}}{{/last.inputs.words}}, judging each once it is {{last.inputs.days}} days old by its downloads (at least {{last.inputs.downloads}}){{#last.inputs.licence}}, with a licence among {{last.inputs.licence}}{{/last.inputs.licence}}{{#last.inputs.size}}, at most {{last.inputs.size}} parameters{{/last.inputs.size}}.</p>
</div>`;

const NEW_MODEL_WATCH_UI: AppUi = {
  pages: [
    {
      id: 'models',
      title: 'Models',
      on: 'app',
      blocks: [
        { element: 'nm-head', data: 'last.result' },
        { element: 'nm-model', data: 'last.result.models', where: { state: '{{state.show}}' }, each: true, layout: 'grid', empty: 'No model of that kind yet.' },
      ],
    },
    { id: 'evaluation', title: 'Your evaluation', on: 'app', blocks: [{ element: 'nm-eval' }] },
    {
      id: 'found',
      title: 'Models',
      blocks: [
        { element: 'nm-head', data: 'result' },
        { element: 'nm-model', data: 'result.models', where: { state: '{{state.show}}' }, each: true, layout: 'grid', empty: 'No model of that kind.' },
      ],
    },
  ],
  elements: {
    'nm-head': { description: 'What is new in a line, in numbers, and the states to show one of', html: NM_HEAD, css: HERO_CSS + STATS_CSS + CHIPS_CSS + String.raw`.chips { margin-top: 14px; } .note { margin: 10px 0 0; color: var(--n-muted); font-size: 12.5px; }` },
    'nm-model': { description: 'A model: where it stands, what its card says, its size, licence and downloads, and its score', html: NM_MODEL, css: NM_MODEL_CSS },
    'nm-eval': {
      description: 'What runs on each new model, and what it watches',
      html: NM_EVAL,
      css: String.raw`.card { padding: 16px 18px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); } .card h3 { margin: 0 0 8px; font-size: 16px; } .card p { margin: 0 0 10px; font-size: 14.5px; line-height: 1.55; } .card code { font-family: var(--n-mono); font-size: 13px; overflow-wrap: anywhere; } .m { color: var(--n-muted); font-size: 13.5px !important; } .acts { margin-top: 4px; }`,
    },
  },
  events: {
    show: [{ do: 'set', name: 'show', value: '{{event.name}}' }],
    copy_name: [{ do: 'copy', text: '{{event.name}}' }],
    experiments: [{ do: 'open', url: '/system/experiments' }],
  },
};

// ---- Deadline radar -------------------------------------------------------------------------------------------------
// The deadlines ahead as a timeline in your time zone: each with its day and time where you are, how long is left (as you
// look at it), what the call gives (its zone), where the conference is, and its call's page limit and template. The past
// ones folded under it; the venues on a page of their own.

const DL_HEAD = String.raw`<header class="hero">
  <p class="kicker">Deadline radar · your time zone, {{zone}}</p>
  <h1>{{#deadlines|where:next=true|first}}{{venue}} {{year}}: {{label}}, {{day|longdate}}{{/deadlines}}{{^deadlines|where:next=true}}{{headline}}{{/deadlines}}</h1>
  <p class="sub">{{#ahead|is:1}}One deadline ahead{{/ahead}}{{^ahead|is:1}}{{ahead|number}} deadlines ahead{{/ahead}}{{#today}}, checked {{today|longdate}}{{/today}}.</p>
  {{#venues|count|over:1}}<nav class="chips" aria-label="Venues">
    {{#state.venue}}<button type="button" class="chip" data-event="venue" data-name="">All</button>{{/state.venue}}{{^state.venue}}<span class="chip on">All</span>{{/state.venue}}
    {{#venues}}<button type="button" class="chip{{#venue|is:$state.venue}} on{{/venue}}" data-event="venue" data-name="{{venue}}">{{venue}}</button>{{/venues}}
  </nav>{{/venues}}
  {{#reminded|count}}<div class="sent"><b>Reminders sent today</b><ul>{{#reminded}}<li>{{.}}</li>{{/reminded}}</ul></div>{{/reminded}}
  <p class="acts"><button type="button" class="b" data-event="copy_all">Copy the deadlines</button></p>
</header>`;

const DL_ROW = String.raw`<div class="dl{{#next}} next{{/next}} k-{{kind|slug}}">
  <div class="day"><b>{{day|day}}</b><span>{{day|month}}</span><small>{{time}}</small></div>
  <div class="what">
    <p class="v"><strong>{{venue}} {{year}}</strong><span class="lbl">{{label}}</span></p>
    <p class="m">{{day|weekday}}, {{day|longdate}} at {{time}} your time · {{given}}</p>
    {{#place}}<p class="m">{{place}}{{#dates}} · {{dates}}{{/dates}}</p>{{/place}}
    <p class="links">{{#link}}<a href="{{link}}" target="_blank" rel="noopener noreferrer">Call for papers ↗</a>{{/link}}{{#template}}<a href="{{template}}" target="_blank" rel="noopener noreferrer">Template ↗</a>{{/template}}{{#pages}}<span class="pg">{{pages}}</span>{{/pages}}</p>
  </div>
  <div class="left"><span class="pill">{{utc|ago}}</span></div>
</div>`;

const DL_ROW_CSS = String.raw`
.dl { display: grid; grid-template-columns: 58px 1fr auto; gap: 14px; align-items: start; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.dl.next { border-color: color-mix(in srgb, var(--n-accent) 55%, var(--n-line)); box-shadow: inset 3px 0 0 var(--n-accent); }
.day { display: flex; flex-direction: column; align-items: center; padding: 6px 0; border-radius: 10px; background: var(--n-soft); line-height: 1.15; }
.day b { font-size: 21px; font-variant-numeric: tabular-nums; } .day span { font-size: 12px; font-weight: 650; text-transform: uppercase; color: var(--n-muted); } .day small { margin-top: 2px; font-size: 11.5px; color: var(--n-muted); font-variant-numeric: tabular-nums; }
.what { min-width: 0; }
.v { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; margin: 0 0 3px; font-size: 15px; }
.lbl { color: var(--n-fg); }
.k-abstract .lbl, .k-paper .lbl { font-weight: 650; }
.k-notification .lbl, .k-camera-ready .lbl, .k-rebuttal .lbl, .k-other .lbl, .k-supplementary .lbl { color: var(--n-muted); }
.m { margin: 0 0 2px; color: var(--n-muted); font-size: 12.5px; line-height: 1.45; }
.links { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin: 6px 0 0; font-size: 13px; }
.links a { color: var(--n-accent); text-decoration: none; } .links a:hover { text-decoration: underline; }
.pg { padding: 1px 8px; border-radius: 999px; background: var(--n-soft); color: var(--n-muted); font-size: 12px; }
.pill { display: inline-block; padding: 3px 10px; border-radius: 999px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 12.5px; font-weight: 650; white-space: nowrap; }
@media (max-width: 560px) { .dl { grid-template-columns: 52px 1fr; } .left { grid-column: 2; } }
`;

const DL_PAST = String.raw`{{#deadlines|where:past=true|count}}<div class="past">
  {{#state.past}}<button type="button" class="b" data-event="past">Hide the past ones</button>
  <div class="rows">{{#deadlines|where:past=true|where:venue=$state.venue}}<p class="row"><span class="d">{{day|shortdate}}, {{time}}</span><span><b>{{venue}} {{year}}</b> · {{label}}</span></p>{{/deadlines}}</div>{{/state.past}}
  {{^state.past}}<button type="button" class="b" data-event="past">Show the past ones ({{deadlines|where:past=true|count}})</button>{{/state.past}}
</div>{{/deadlines}}`;

const DL_VENUE = String.raw`<div class="v">
  <h3>{{venue}}</h3>
  {{#name}}<p class="full">{{name}}</p>{{/name}}
  {{#rank}}<p class="rank">{{rank}}</p>{{/rank}}
  {{#next}}<p class="next">Next: <b>{{next}}</b>{{#day}}, {{day|date}}{{/day}}</p>{{/next}}{{^next}}<p class="next">No deadline ahead yet</p>{{/next}}
  {{#link}}<a href="{{link}}" target="_blank" rel="noopener noreferrer">Its site ↗</a>{{/link}}
</div>`;

const DEADLINE_RADAR_UI: AppUi = {
  pages: [
    {
      id: 'timeline',
      title: 'Timeline',
      on: 'app',
      blocks: [
        { element: 'dl-head', data: 'last.result' },
        { element: 'dl-row', data: 'last.result.deadlines', where: { past: false, venue: '{{state.venue}}' }, each: true, empty: 'No deadline ahead in your venues.' },
        { element: 'dl-past', data: 'last.result' },
      ],
    },
    { id: 'venues', title: 'Venues', on: 'app', blocks: [{ element: 'dl-venue', data: 'last.result.venues', each: true, layout: 'grid', empty: 'No venue found yet.' }, { element: 'dl-missing', data: 'last.result' }] },
    {
      id: 'deadlines',
      title: 'Timeline',
      blocks: [
        { element: 'dl-head', data: 'result' },
        { element: 'dl-row', data: 'result.deadlines', where: { past: false, venue: '{{state.venue}}' }, each: true, empty: 'No deadline ahead in your venues.' },
        { element: 'dl-past', data: 'result' },
      ],
    },
    { id: 'found', title: 'Venues', blocks: [{ element: 'dl-venue', data: 'result.venues', each: true, layout: 'grid', empty: 'No venue found.' }, { element: 'dl-missing', data: 'result' }] },
  ],
  elements: {
    'dl-head': {
      description: 'The next deadline in a line, your time zone, the venues to show one of, and the reminders sent',
      html: DL_HEAD,
      css:
        HERO_CSS +
        CHIPS_CSS +
        PAPER_CSS +
        String.raw`.chips { margin-top: 14px; } .sent { margin-top: 12px; padding: 10px 12px; border-radius: var(--n-radius); background: color-mix(in srgb, var(--n-warn) 12%, var(--n-card)); font-size: 13.5px; } .sent ul { margin: 4px 0 0; padding-left: 18px; } .hero .acts { margin-top: 12px; }`,
    },
    'dl-row': { description: 'A deadline: its day and time where you are, what is due, as the call gives it, where the conference is, its call and template, and how long is left', html: DL_ROW, css: DL_ROW_CSS },
    'dl-past': {
      description: 'The deadlines past, folded until you open them',
      html: DL_PAST,
      css:
        PAPER_CSS +
        String.raw`.past { margin-top: 6px; } .rows { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; } .row { display: flex; flex-wrap: wrap; gap: 2px 12px; margin: 0; color: var(--n-muted); font-size: 13px; } .d { min-width: 120px; font-variant-numeric: tabular-nums; }`,
    },
    'dl-venue': {
      description: 'A venue: its name in full, its rank, its next deadline and its site',
      html: DL_VENUE,
      css: String.raw`& { height: 100%; } .v { height: 100%; box-sizing: border-box; padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); } .v h3 { margin: 0 0 4px; font-size: 17px; } .v p { margin: 0 0 4px; font-size: 13.5px; line-height: 1.45; } .full, .rank { color: var(--n-muted); } .v a { color: var(--n-accent); font-size: 13px; text-decoration: none; }`,
    },
    'dl-missing': {
      description: 'The venues neither list knows, and what to try',
      html: String.raw`{{#missing|count}}<p class="miss">Not in the lists: <b>{{missing|join}}</b>. Try the name the conference goes by (NeurIPS, KDD, The Web Conference), or its short name as ccfddl and ai-deadlines keep it.</p>{{/missing}}`,
      css: String.raw`.miss { margin: 8px 0 0; padding: 10px 12px; border: 1px dashed var(--n-line); border-radius: var(--n-radius); color: var(--n-muted); font-size: 13.5px; line-height: 1.5; }`,
    },
  },
  events: {
    venue: [{ do: 'set', name: 'venue', value: '{{event.name}}' }],
    past: [{ do: 'toggle', name: 'past' }],
    copy_all: [{ do: 'copy', text: '{{#deadlines|where:past=false}}{{venue}} {{year}}, {{label}}: {{day}} {{time}} ({{given}})\n{{/deadlines}}' }],
  },
};

// ---- Living related work --------------------------------------------------------------------------------------------
// Each topic's papers, from its records, theme by theme, the newest first, those added by the latest update marked New;
// a topic's section drafted in LaTeX, and its BibTeX, on a click (each a run of one of its flows, shown when done).

const LRW_HEAD = String.raw`<header class="hero">
  <p class="kicker">Living related work{{#updated}} · updated {{updated|longdate}}{{/updated}}</p>
  <h1>{{headline}}</h1>
  <div class="stats">
    <div class="stat"><b>{{topics|count}}</b><span>topics</span></div>
    <div class="stat"><b>{{topics|sum:count}}</b><span>papers</span></div>
    <div class="stat"><b>{{fresh|number}}</b><span>new this time</span></div>
  </div>
  {{#note}}<p class="note">{{note}}</p>{{/note}}
</header>`;

/** A kept paper, as both its pages show it: whether the latest update added it, where and when, what it does and how it relates. */
const lrwPaper = (latest: string) => String.raw`<article class="pp">
    <p class="meta">{{#added|is:$${latest}}}<span class="new">New</span>{{/added}}{{#venue}}<span>{{venue}}</span>{{/venue}}{{#year}}<span>{{year}}</span>{{/year}}</p>
    <h4><a href="{{url}}" target="_blank" rel="noopener noreferrer">{{title}}</a></h4>
    <p class="by">{{authors}}</p>
    {{#summary}}<p class="sum">{{summary}}</p>{{/summary}}
    {{#relation}}<p class="rel">{{relation}}</p>{{/relation}}
    <p class="acts"><code class="key">{{citekey}}</code><button type="button" class="b" data-event="cite_one" data-bib="{{bibtex}}">BibTeX</button><button type="button" class="b quiet" data-event="hide" data-id="{{id}}" data-title="{{title}}">Not related</button></p>
  </article>`;

const LRW_TOPICS = String.raw`{{#last.result.topics|count|over:1}}<nav class="chips" aria-label="Topics">
  {{#state.topic}}<button type="button" class="chip" data-event="topic" data-name="">All topics</button>{{/state.topic}}{{^state.topic}}<span class="chip on">All topics</span>{{/state.topic}}
  {{#last.result.topics}}<button type="button" class="chip{{#topic|is:$state.topic}} on{{/topic}}" data-event="topic" data-name="{{topic}}">{{topic}}</button>{{/last.result.topics}}
</nav>{{/last.result.topics}}
{{#last.result.topics|where:topic=$state.topic}}<section class="topic">
  <header class="th">
    <div><h2>{{topic}}</h2><p class="m">{{#count|is:1}}1 paper{{/count}}{{^count|is:1}}{{count}} papers{{/count}}{{#new}} · {{new}} new{{/new}}{{#themes}} · {{themes}}{{/themes}}</p></div>
    <p class="acts"><button type="button" class="n-btn" data-event="draft" data-topic="{{topic}}">Draft the related work</button><button type="button" class="b" data-event="bib" data-topic="{{topic}}">Export BibTeX</button></p>
  </header>
  {{#state.drafting|is:$topic}}<div class="out">
    {{#state.draft.working}}<p class="m">Writing the related work: a few minutes. It goes on if you leave this page.</p>{{/state.draft.working}}
    {{#state.draft.error}}<p class="err">{{state.draft.error}}</p>{{/state.draft.error}}
    {{#state.draft.result.latex}}<div class="oh"><b>The related work, in LaTeX</b><span><button type="button" class="b" data-event="copy_latex">Copy the LaTeX</button><button type="button" class="b" data-event="copy_draft_bib">Copy the .bib</button></span></div><pre>{{state.draft.result.latex}}</pre>{{/state.draft.result.latex}}
  </div>{{/state.drafting}}
  {{#state.bibbing|is:$topic}}<div class="out">
    {{#state.bib.working}}<p class="m">Gathering its BibTeX…</p>{{/state.bib.working}}
    {{#state.bib.result.bib}}<div class="oh"><b>{{state.bib.result.count}} entries</b><span><button type="button" class="b" data-event="copy_bib">Copy the .bib</button></span></div><pre>{{state.bib.result.bib}}</pre>{{/state.bib.result.bib}}
  </div>{{/state.bibbing}}
  {{#item|where:topic=$topic|unique:theme}}<h3 class="theme">{{.}}</h3>
  <div class="papers">{{#item|where:topic=$topic|where:theme=$.}}${lrwPaper('last.result.updated')}{{/item}}</div>{{/item}}
  {{^item|where:topic=$topic}}<p class="empty">No papers on it yet: they come with the next update.</p>{{/item}}
</section>{{/last.result.topics}}`;

const LRW_CSS =
  CHIPS_CSS +
  PAPER_CSS +
  String.raw`
.chips { margin: 2px 0 16px; }
.topic { margin: 0 0 26px; }
.th { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 8px 16px; padding-bottom: 10px; border-bottom: 2px solid var(--n-fg); }
.th h2 { margin: 0; font-size: 21px; line-height: 1.25; }
.m { margin: 2px 0 0; color: var(--n-muted); font-size: 13px; }
.th .acts { margin: 0; }
.theme { margin: 18px 0 8px; font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--n-accent); }
.papers { display: flex; flex-direction: column; gap: 8px; }
.key { padding: 1px 6px; border-radius: 6px; background: var(--n-soft); font-family: var(--n-mono); font-size: 12px; }
.out { margin-top: 12px; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-soft); }
.oh { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; margin-bottom: 8px; font-size: 13.5px; }
.oh span { display: flex; gap: 6px; }
pre { margin: 0; max-height: 360px; overflow: auto; white-space: pre-wrap; font-family: var(--n-mono); font-size: 12.5px; line-height: 1.5; }
.err { margin: 0; color: var(--n-err); font-size: 13.5px; }
@media (max-width: 640px) {
  .chips { flex-wrap: nowrap; overflow-x: auto; margin: 2px -16px 16px; padding: 0 16px 2px; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex: none; }
}
`;

const LIVING_RELATED_WORK_UI: AppUi = {
  pages: [
    {
      id: 'work',
      title: 'Related work',
      on: 'app',
      blocks: [
        { element: 'lrw-head', data: 'last.result' },
        { element: 'lrw-topics', data: 'data.papers', where: { hidden: { '!=': true } }, sort: '-added', limit: 1000 },
      ],
    },
    { id: 'new', title: 'New this time', on: 'app', blocks: [{ element: 'lrw-new', data: 'data.papers', where: { added: '{{last.result.updated}}' }, sort: 'topic', limit: 300, each: true, empty: 'Nothing new since the last update.' }] },
    {
      id: 'update',
      title: 'This update',
      blocks: [
        { element: 'lrw-head', data: 'result' },
        { element: 'lrw-new', data: 'data.papers', where: { added: '{{result.updated}}' }, sort: 'topic', limit: 300, each: true, empty: 'This update added no papers.' },
      ],
    },
  ],
  elements: {
    'lrw-head': { description: 'When it was updated, what is new in a line, and the topics in numbers', html: LRW_HEAD, css: HERO_CSS + STATS_CSS + String.raw`.note { margin: 10px 0 0; color: var(--n-muted); font-size: 12.5px; }` },
    'lrw-topics': { description: 'Each topic: its papers by theme, the new ones marked, and buttons to draft its related work and export its BibTeX', html: LRW_TOPICS, css: LRW_CSS },
    'lrw-new': {
      description: 'A paper an update added, with its topic',
      html: String.raw`<div class="nw"><p class="tp">{{topic}} · {{theme}}</p>${lrwPaper('added')}</div>`,
      css: PAPER_CSS + String.raw`.tp { margin: 0 0 6px; color: var(--n-accent); font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; } .key { padding: 1px 6px; border-radius: 6px; background: var(--n-soft); font-family: var(--n-mono); font-size: 12px; }`,
    },
  },
  events: {
    topic: [{ do: 'set', name: 'topic', value: '{{event.name}}' }],
    draft: [
      { do: 'set', name: 'drafting', value: '{{event.topic}}' },
      { do: 'run', flow: 'draft', inputs: { topic: '{{event.topic}}' }, as: 'draft' },
    ],
    bib: [
      { do: 'set', name: 'bibbing', value: '{{event.topic}}' },
      { do: 'run', flow: 'bib', inputs: { topic: '{{event.topic}}' }, as: 'bib' },
    ],
    copy_latex: [{ do: 'copy', text: '{{state.draft.result.latex}}' }],
    copy_draft_bib: [{ do: 'copy', text: '{{state.draft.result.bib}}' }],
    copy_bib: [{ do: 'copy', text: '{{state.bib.result.bib}}' }],
    cite_one: [{ do: 'copy', text: '{{event.bib}}' }],
    hide: [{ do: 'data', op: 'update', collection: 'papers', id: '{{event.id}}', record: { hidden: true }, confirm: 'Take “{{event.title}}” out of this topic? It will not come back.' }],
  },
};

// ---- Gap finder -----------------------------------------------------------------------------------------------------
// The ideas, new ones first: each with whether it was done before (and the closest work, linked), what it crosses, the
// first experiment and what it takes on your compute, with Plan it (the Research sprint app, its question filled in).

const GAP_HEAD = String.raw`<header class="hero">
  <p class="kicker">Gap finder · {{area}}</p>
  <h1>{{headline}}</h1>
  <p class="sub">From your papers and {{month|number}} of this month’s{{#compute}}, sized to {{compute}}{{/compute}}.</p>
  <div class="stats">
    <div class="stat"><b>{{ideas|where:verdict=new|count}}</b><span>new</span></div>
    <div class="stat"><b>{{ideas|where:verdict=partly done|count}}</b><span>partly done</span></div>
    <div class="stat"><b>{{ideas|where:fits=fits|count}}</b><span>fit your compute</span></div>
  </div>
  <nav class="chips" aria-label="Show">
    {{#state.verdict}}<button type="button" class="chip" data-event="verdict" data-name="">All</button>{{/state.verdict}}{{^state.verdict}}<span class="chip on">All</span>{{/state.verdict}}
    {{#ideas|unique:verdict}}<button type="button" class="chip{{#.|is:$state.verdict}} on{{/.}}" data-event="verdict" data-name="{{.}}">{{.}}</button>{{/ideas}}
  </nav>
</header>`;

const GAP_IDEA = String.raw`<article class="idea v-{{verdict|slug}}">
  <p class="top"><span class="badge vb">{{verdict}}</span><span class="badge f-{{fits|slug}}">{{fits}}</span>{{#crosses}}<span class="x">{{crosses}}</span>{{/crosses}}</p>
  <h3>{{title}}</h3>
  <p class="body">{{idea}}</p>
  {{#why}}<p class="why">{{why}}</p>{{/why}}
  {{#closest}}<p class="near">Closest work: {{#closest_url}}<a href="{{closest_url}}" target="_blank" rel="noopener noreferrer">{{closest}}</a>{{/closest_url}}{{^closest_url}}{{closest}}{{/closest_url}}</p>{{/closest}}
  <div class="exp"><b>The first experiment</b><p>{{first}}</p>{{#cost}}<p class="cost">{{cost}}</p>{{/cost}}</div>
  <p class="acts">
    <button type="button" class="n-btn n-primary" data-event="plan" data-question="{{title}}: {{idea}} First experiment: {{first}}">Plan it</button>
    <button type="button" class="b" data-event="dig" data-title="{{title}}" data-idea="{{idea}}">Dig deeper</button>
    <button type="button" class="b" data-event="copy_idea" data-text="{{title}}. {{idea}} Closest work: {{closest}}. First experiment: {{first}} ({{cost}})">Copy</button>
  </p>
</article>`;

const GAP_IDEA_CSS =
  PAPER_CSS +
  BADGE_CSS +
  String.raw`
.idea { display: flex; flex-direction: column; gap: 8px; padding: 15px 17px; border: 1px solid var(--n-line); border-left: 3px solid var(--vc, var(--n-line)); border-radius: var(--n-radius); background: var(--n-card); }
.v-new { --vc: var(--n-ok); } .v-partly-done { --vc: var(--n-warn); } .v-done { --vc: var(--n-err); }
.top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin: 0; }
.vb { background: color-mix(in srgb, var(--vc, var(--n-muted)) 16%, var(--n-card)); color: var(--vc, var(--n-muted)); }
.f-fits { background: color-mix(in srgb, var(--n-ok) 14%, var(--n-card)); color: var(--n-ok); }
.f-tight { background: color-mix(in srgb, var(--n-warn) 16%, var(--n-card)); color: var(--n-warn); }
.f-too-big { background: color-mix(in srgb, var(--n-err) 14%, var(--n-card)); color: var(--n-err); }
.x { color: var(--n-muted); font-size: 12.5px; }
.idea h3 { margin: 0; font-size: 17px; line-height: 1.3; }
.body { margin: 0; font-size: 14.5px; line-height: 1.55; }
.near { margin: 0; font-size: 13.5px; } .near a { color: var(--n-accent); }
.exp { padding: 10px 12px; border-radius: 10px; background: var(--n-soft); }
.exp b { display: block; margin-bottom: 2px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--n-muted); }
.exp p { margin: 0; font-size: 14px; line-height: 1.5; } .exp .cost { margin-top: 4px; color: var(--n-muted); font-size: 13px; }
`;

const GAP_READ = String.raw`<div class="cols">
  <section><h3>Your papers</h3><ol>{{#mine}}<li>{{#url}}<a href="{{url}}" target="_blank" rel="noopener noreferrer">{{title}}</a>{{/url}}{{^url}}{{title}}{{/url}}{{#year}} <small>{{year}}</small>{{/year}}</li>{{/mine}}</ol></section>
  <section><h3>This month’s, nearest to them</h3><ol>{{#recent}}<li>{{#url}}<a href="{{url}}" target="_blank" rel="noopener noreferrer">{{title}}</a>{{/url}}{{^url}}{{title}}{{/url}}{{#date}} <small>{{date|shortdate}}</small>{{/date}}</li>{{/recent}}</ol></section>
</div>`;

const GAP_FINDER_UI: AppUi = {
  pages: [
    {
      id: 'ideas',
      title: 'Ideas',
      blocks: [
        { element: 'gap-head', data: 'result' },
        { element: 'gap-idea', data: 'result.ideas', where: { verdict: '{{state.verdict}}' }, each: true, empty: 'No idea of that kind.' },
      ],
    },
    { id: 'read', title: 'What it crossed', blocks: [{ element: 'gap-read', data: 'result' }] },
  ],
  elements: {
    'gap-head': { description: 'The area and the compute, the ideas in numbers, and their verdicts to show one of', html: GAP_HEAD, css: HERO_CSS + STATS_CSS + CHIPS_CSS + String.raw`.chips { margin-top: 14px; }` },
    'gap-idea': { description: 'An idea: whether it was done before and the closest work, what it crosses, the first experiment and what it takes', html: GAP_IDEA, css: GAP_IDEA_CSS },
    'gap-read': {
      description: 'Your papers and this month’s it crossed them with, each a link',
      html: GAP_READ,
      css: String.raw`.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 18px; } h3 { margin: 0 0 8px; font-size: 14px; } ol { margin: 0; padding-left: 20px; } li { margin: 0 0 6px; font-size: 14px; line-height: 1.45; } a { color: var(--n-fg); } small { color: var(--n-muted); }`,
    },
  },
  events: {
    verdict: [{ do: 'set', name: 'verdict', value: '{{event.name}}' }],
    plan: [{ do: 'open', url: '/apps/tpl:research-sprint?in.question={{event.question|url}}' }],
    dig: [{ do: 'start', confirm: 'Start a research report on the work done near “{{event.title}}”? It is a run of its own, of a few minutes.', app: 'tpl:deep-research', inputs: { topic: 'What has been done on this research idea, and what is left open: {{event.title}}. {{event.idea}}', depth: 'Thorough', audience: 'Experts' } }],
    copy_idea: [{ do: 'copy', text: '{{event.text}}' }],
  },
};

/** The views of the apps in templates-research.ts, by their ids. */
export const RESEARCH_VIEWS: Record<string, AppUi> = {
  'paper-radar': PAPER_RADAR_UI,
  'citation-alerts': CITATION_ALERTS_UI,
  'new-model-watch': NEW_MODEL_WATCH_UI,
  'deadline-radar': DEADLINE_RADAR_UI,
  'living-related-work': LIVING_RELATED_WORK_UI,
  'gap-finder': GAP_FINDER_UI,
};
