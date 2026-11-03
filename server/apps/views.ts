// The views of the ready-made apps (shared/app-ui.ts): how each one's answer looks, and what you can do there.
// Each has pages (tabs, and a detail page or two reached from them), elements of its own made for its answer, and
// events: going to a page with an item, ticking things off (kept with the run), running it again with a changed
// answer, starting another ready-made app on something in it, copying a part. Their colours are the page kit's,
// so they look like part of the app in both themes; their words are translated as the app's are (uiTexts).
import type { AppUi } from '../../shared/app-ui.ts';

// ---- what several share --------------------------------------------------------------------------------------------

/** A row of big numbers, each with a line under it. */
const STATS_CSS = String.raw`
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 100px), 1fr)); gap: 10px; }
.stat { padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.stat b { display: block; font-size: 22px; line-height: 1.2; letter-spacing: -.01em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
@media (max-width: 480px) { .stat { padding: 10px 12px; } .stat b { font-size: 18px; } }
.stat span { display: block; margin-top: 2px; color: var(--n-muted); font-size: 12.5px; }
`;

/** A card, and its heading. */
const CARD_CSS = String.raw`
.card { padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.card > h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--n-muted); }
`;

// ---- Trip planner ----------------------------------------------------------------------------------------------------

const TRIP: AppUi = {
  pages: [
    {
      id: 'trip',
      title: 'Your trip',
      blocks: [
        { element: 'trip-hero' },
        { element: 'pace-switch' },
        { title: 'The plan', text: '{{result.overview}}', width: 'two-thirds' },
        { title: 'Day by day', element: 'day-row', data: 'result.days', each: true, width: 'third', empty: 'No days planned' },
        { title: 'Good to know', element: 'tips', data: 'result.tips', if: 'result.tips' },
      ],
    },
    {
      id: 'days',
      title: 'Day by day',
      blocks: [{ element: 'day-card', data: 'result.days', each: true, empty: 'No days planned' }],
    },
    {
      id: 'day',
      title: 'Day',
      tab: false,
      blocks: [{ element: 'day-detail', data: 'page.item' }],
    },
    {
      id: 'book',
      title: 'Book ahead',
      if: 'result.book_ahead',
      blocks: [
        { title: 'What to book, and how far ahead', element: 'checklist', data: 'result.book_ahead' },
        { html: '<p class="n-muted" style="margin:0;font-size:13.5px">Tick each one off as you book it: the ticks stay with this plan.</p>' },
      ],
    },
    {
      id: 'budget',
      title: 'Budget',
      if: 'result.budget',
      blocks: [
        { element: 'budget-total', data: 'result.budget' },
        { title: 'Where the money goes', element: 'chart', data: 'result.budget', where: { item: { '!=': 'Total' } }, with: { label: 'item', value: 'estimate' } },
        { title: 'Each estimate', element: 'table', data: 'result.budget' },
      ],
    },
  ],
  elements: {
    'trip-hero': {
      description: 'Where and when, who goes, and the trip in three numbers',
      html: String.raw`<header class="hero">
  <p class="kicker">{{inputs.days}} days{{#inputs.travelers}} · {{inputs.travelers}}{{/inputs.travelers}}</p>
  <h1>{{inputs.destination}}</h1>
  <p class="when">{{inputs.start|date}}{{#result.days|last}} – {{date|date}}{{/result.days}}</p>
  <div class="stats">
    <div class="stat"><b>{{result.days|count}}</b><span>days planned</span></div>
    {{#result.budget|where:item=Total|first}}<div class="stat"><b>{{estimate|short:22}}</b><span>estimated in all</span></div>{{/result.budget}}
    <div class="stat"><b>{{result.book_ahead|count}}</b><span>to book ahead</span></div>
  </div>
</header>`,
      css: String.raw`
.hero { position: relative; overflow: hidden; padding: 22px 22px 18px; border-radius: calc(var(--n-radius) + 4px); background: linear-gradient(135deg, var(--n-accent-soft), transparent 70%), var(--n-card); border: 1px solid var(--n-line); }
.hero::after { content: "✈"; position: absolute; right: 18px; top: 10px; font-size: 64px; line-height: 1; opacity: .08; transform: rotate(-12deg); }
.kicker { margin: 0; color: var(--n-accent); font-size: 12.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
h1 { margin: 4px 0 2px !important; font-size: 30px !important; letter-spacing: -.02em; }
.when { margin: 0 0 16px; color: var(--n-muted); }
${STATS_CSS}
.stat { background: color-mix(in srgb, var(--n-card) 85%, transparent); }
`,
    },
    'pace-switch': {
      description: 'The pace it was planned at, and buttons that plan it again at another, or with one more day',
      html: String.raw`<div class="bar">
  <span class="label">Pace</span>
  <div class="seg" role="group">
    {{#inputs.pace|is:Relaxed}}<span class="on">Relaxed</span>{{/inputs.pace}}{{^inputs.pace|is:Relaxed}}<button type="button" data-event="pace" data-pace="Relaxed">Relaxed</button>{{/inputs.pace}}
    {{#inputs.pace|is:Balanced}}<span class="on">Balanced</span>{{/inputs.pace}}{{^inputs.pace|is:Balanced}}<button type="button" data-event="pace" data-pace="Balanced">Balanced</button>{{/inputs.pace}}
    {{#inputs.pace|is:Packed}}<span class="on">Packed</span>{{/inputs.pace}}{{^inputs.pace|is:Packed}}<button type="button" data-event="pace" data-pace="Packed">Packed</button>{{/inputs.pace}}
  </div>
  <button type="button" class="more" data-event="longer">+ One more day</button>
</div>`,
      css: String.raw`
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; }
.label { color: var(--n-muted); font-size: 13px; }
.seg { display: inline-flex; padding: 3px; border-radius: 11px; background: var(--n-soft); }
.seg > * { padding: 6px 12px; border: 0; border-radius: 8px; background: none; color: var(--n-muted); font: inherit; font-size: 13.5px; }
.seg button:hover { color: var(--n-fg); }
.seg .on { background: var(--n-card); color: var(--n-fg); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.12); }
.more { margin-left: auto; padding: 7px 12px; border: 1px dashed var(--n-line); border-radius: 10px; background: none; color: var(--n-fg); font: inherit; font-size: 13.5px; }
.more:hover { border-color: var(--n-accent); color: var(--n-accent); }
`,
    },
    'day-row': {
      description: 'A day in a line: its number, weekday and area; opens the day',
      html: String.raw`<button type="button" class="row" data-event="open_day">
  <span class="n">{{day}}</span>
  <span class="t"><b>{{date|weekday}}</b><small>{{date|shortdate}}</small></span>
  <span class="a">{{area|or:Free day}}</span>
  <span class="go" aria-hidden="true">›</span>
</button>`,
      css: String.raw`
.row { display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: "n t go" "n a go"; gap: 0 12px; align-items: center; width: 100%; padding: 10px 12px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); color: inherit; font: inherit; text-align: left; }
.row:hover { border-color: var(--n-accent); }
.n { grid-area: n; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--n-accent-soft); color: var(--n-accent); font-weight: 700; }
.t { grid-area: t; display: flex; gap: 8px; align-items: baseline; min-width: 0; }
.t small { color: var(--n-muted); font-size: 12.5px; }
.a { grid-area: a; color: var(--n-muted); font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.go { grid-area: go; color: var(--n-muted); font-size: 22px; }
`,
    },
    'day-card': {
      description: 'A day on the timeline: morning, afternoon and evening, each to tick off, with its map and the day on a page of its own',
      html: String.raw`<article class="day{{#@last}} last{{/@last}}">
  <div class="rail"><span class="dot">{{day}}</span></div>
  <div class="body">
    <header>
      <div><b>{{date|weekday}}</b> <span class="date">{{date|longdate}}</span></div>
      {{#area}}<span class="area">{{area}}</span>{{/area}}
    </header>
    <ol class="slots">
      <li class="{{#state.did.@key.morning}}did{{/state.did.@key.morning}}"><span class="when">☀︎ Morning</span><p>{{morning|or:Free}}</p><button type="button" class="tick" data-event="did" data-part="morning" title="Done">✓</button></li>
      <li class="{{#state.did.@key.afternoon}}did{{/state.did.@key.afternoon}}"><span class="when">◐ Afternoon</span><p>{{afternoon|or:Free}}</p><button type="button" class="tick" data-event="did" data-part="afternoon" title="Done">✓</button></li>
      <li class="{{#state.did.@key.evening}}did{{/state.did.@key.evening}}"><span class="when">☾ Evening</span><p>{{evening|or:Free}}</p><button type="button" class="tick" data-event="did" data-part="evening" title="Done">✓</button></li>
    </ol>
    <footer>
      <button type="button" class="link" data-event="open_day">The day on its own page</button>
      {{#area}}<a class="link" href="https://www.google.com/maps/search/?api=1&amp;query={{area|url}}%2C%20{{inputs.destination|url}}" target="_blank" rel="noopener noreferrer">Map of {{area}} ↗</a>{{/area}}
    </footer>
  </div>
</article>`,
      css: String.raw`
& { display: block; }
.day { display: grid; grid-template-columns: 40px 1fr; gap: 12px; }
.rail { position: relative; display: flex; justify-content: center; }
.rail::before { content: ""; position: absolute; top: 40px; bottom: -14px; left: 50%; width: 2px; transform: translateX(-50%); background: var(--n-line); }
.last .rail::before { display: none; }
.dot { position: relative; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--n-accent); color: var(--n-accent-fg); font-weight: 700; }
.body { min-width: 0; padding: 12px 14px 10px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; margin-bottom: 8px; }
.date { color: var(--n-muted); font-size: 13.5px; }
.area { padding: 2px 10px; border-radius: 999px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 12.5px; font-weight: 600; }
.slots { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.slots li { display: grid; grid-template-columns: 96px 1fr auto; gap: 10px; align-items: start; padding: 8px 0; border-top: 1px solid var(--n-line); }
.slots li:first-child { border-top: 0; }
.when { color: var(--n-muted); font-size: 12.5px; padding-top: 2px; white-space: nowrap; }
.slots p { margin: 0; font-size: 14.5px; line-height: 1.5; }
.tick { width: 28px; height: 28px; border: 1px solid var(--n-line); border-radius: 50%; background: none; color: transparent; font: inherit; font-size: 13px; }
.tick:hover { border-color: var(--n-ok); color: var(--n-ok); }
.did p { color: var(--n-muted); text-decoration: line-through; text-decoration-color: var(--n-line); }
.did .tick { border-color: var(--n-ok); background: var(--n-ok); color: var(--n-card); }
footer { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--n-line); }
.link { padding: 0; border: 0; background: none; color: var(--n-accent); font: inherit; font-size: 13.5px; text-decoration: none; }
.link:hover { text-decoration: underline; }
@media (max-width: 520px) { .slots li { grid-template-columns: 1fr auto; } .when { grid-column: 1 / -1; } }
`,
    },
    'day-detail': {
      description: 'One day on a page of its own: its three parts to tick off, its map, a copy of it, and research on its area',
      html: String.raw`<div class="detail">
  <p class="kicker">Day {{day}} of {{result.days|count}} · {{date|weekday}}, {{date|longdate}}</p>
  <h2>{{area|or:A free day}}</h2>
  <div class="parts">
    <section class="{{#state.did.@key.morning}}did{{/state.did.@key.morning}}">
      <h3>☀︎ Morning</h3><p>{{morning|or:Free}}</p>
      <button type="button" class="mark" data-event="did" data-part="morning">{{#state.did.@key.morning}}✓ Done{{/state.did.@key.morning}}{{^state.did.@key.morning}}Mark as done{{/state.did.@key.morning}}</button>
    </section>
    <section class="{{#state.did.@key.afternoon}}did{{/state.did.@key.afternoon}}">
      <h3>◐ Afternoon</h3><p>{{afternoon|or:Free}}</p>
      <button type="button" class="mark" data-event="did" data-part="afternoon">{{#state.did.@key.afternoon}}✓ Done{{/state.did.@key.afternoon}}{{^state.did.@key.afternoon}}Mark as done{{/state.did.@key.afternoon}}</button>
    </section>
    <section class="{{#state.did.@key.evening}}did{{/state.did.@key.evening}}">
      <h3>☾ Evening</h3><p>{{evening|or:Free}}</p>
      <button type="button" class="mark" data-event="did" data-part="evening">{{#state.did.@key.evening}}✓ Done{{/state.did.@key.evening}}{{^state.did.@key.evening}}Mark as done{{/state.did.@key.evening}}</button>
    </section>
  </div>
  <div class="n-row actions">
    {{#area}}<a class="n-btn" href="https://www.google.com/maps/search/?api=1&amp;query={{area|url}}%2C%20{{inputs.destination|url}}" target="_blank" rel="noopener noreferrer">Open the map ↗</a>{{/area}}
    <button type="button" class="n-btn" data-event="copy_day">Copy the day</button>
    {{#area}}<button type="button" class="n-btn" data-event="research_area">Research {{area}}</button>{{/area}}
  </div>
</div>`,
      css: String.raw`
.kicker { margin: 0; color: var(--n-accent); font-size: 12.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
h2 { margin: 4px 0 16px !important; font-size: 26px !important; letter-spacing: -.015em; }
.parts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
section { display: flex; flex-direction: column; padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
h3 { margin: 0 0 6px; font-size: 13px; color: var(--n-muted); font-weight: 600; }
section p { flex: 1; margin: 0 0 12px; font-size: 15px; line-height: 1.55; }
.mark { align-self: flex-start; padding: 6px 12px; border: 1px solid var(--n-line); border-radius: 999px; background: none; color: var(--n-fg); font: inherit; font-size: 13px; }
.did { border-color: color-mix(in srgb, var(--n-ok) 45%, var(--n-line)); }
.did p { color: var(--n-muted); }
.did .mark { border-color: var(--n-ok); background: var(--n-ok); color: var(--n-card); }
.actions { margin-top: 16px; }
`,
    },
    tips: {
      description: 'The tips, each in a line with a light',
      html: String.raw`<ul class="tips">{{#.}}<li><span aria-hidden="true">💡</span><p>{{.}}</p></li>{{/.}}</ul>`,
      css: String.raw`
.tips { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.tips li { display: flex; gap: 10px; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.tips p { margin: 0; font-size: 14px; line-height: 1.5; }
`,
    },
    'budget-total': {
      description: 'The total of the budget, large',
      html: String.raw`{{#.|where:item=Total|first}}<div class="total"><span>Estimated in all</span><b>{{estimate}}</b>{{#inputs.budget}}<small>Your budget: {{inputs.budget}}</small>{{/inputs.budget}}</div>{{/.}}`,
      css: String.raw`
.total { display: grid; gap: 2px; padding: 18px 20px; border-radius: var(--n-radius); background: var(--n-accent-soft); }
.total span { color: var(--n-accent); font-size: 12.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.total b { font-size: 28px; letter-spacing: -.02em; }
.total small { color: var(--n-muted); font-size: 13px; }
`,
    },
  },
  events: {
    open_day: [{ do: 'page', page: 'day', item: '{{item}}' }],
    did: [{ do: 'toggle', name: 'did.@key.{{event.part}}', keep: true }],
    pace: [{ do: 'again', confirm: 'Plan the trip again at a {{event.text}} pace? It is a new run, with your other answers as they were.', inputs: { pace: '{{event.pace}}' } }],
    longer: [{ do: 'again', confirm: 'Plan it again with one more day?', inputs: { days: '{{inputs.days|plus:1}}' } }],
    copy_day: [{ do: 'copy', text: 'Day {{day}}, {{date|weekday}} {{date|date}} · {{area}}\nMorning: {{morning}}\nAfternoon: {{afternoon}}\nEvening: {{evening}}' }],
    research_area: [{ do: 'start', confirm: 'Start a Deep research report on {{area}}? It is a run of its own, of a few minutes.', app: 'tpl:deep-research', inputs: { topic: 'What to see, eat and do in {{area}}, {{inputs.destination}}, on a visit in {{date|month}}', depth: 'Quick overview' } }],
  },
};


/** A header over a view: a line in small capitals, a title, a line under it. */
const HERO_CSS = String.raw`
.hero { padding: 20px 22px 18px; border: 1px solid var(--n-line); border-radius: calc(var(--n-radius) + 4px); background: linear-gradient(135deg, var(--n-accent-soft), transparent 65%), var(--n-card); }
.kicker { margin: 0; color: var(--n-accent); font-size: 12.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.hero h1 { margin: 6px 0 4px !important; font-size: 24px !important; line-height: 1.25 !important; letter-spacing: -.015em; }
.sub { margin: 0; color: var(--n-muted); font-size: 14px; }
.hero .stats { margin-top: 16px; }
`;

/** Small rounded labels, and a row of them to pick one from (data-event on each). */
const CHIPS_CSS = String.raw`
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border: 1px solid var(--n-line); border-radius: 999px; background: var(--n-card); color: var(--n-muted); font: inherit; font-size: 13px; line-height: 1.3; }
button.chip:hover { color: var(--n-fg); border-color: var(--n-accent); }
.chip.on { border-color: var(--n-accent); background: var(--n-accent-soft); color: var(--n-accent); font-weight: 600; }
`;

// ---- Deep research report --------------------------------------------------------------------------------------------

const RESEARCH: AppUi = {
  pages: [
    {
      id: 'summary',
      title: 'Summary',
      blocks: [
        { element: 'research-hero' },
        { title: 'The answer', text: '{{result.summary}}', width: 'two-thirds' },
        { title: 'How sure it is', element: 'confidence', width: 'third', if: 'result.confidence' },
        { title: 'Key findings', element: 'finding', data: 'result.key_findings', each: true, empty: 'No findings' },
      ],
    },
    {
      id: 'report',
      title: 'Full report',
      if: 'result.report',
      blocks: [{ element: 'report' }],
    },
    {
      id: 'sources',
      title: 'Sources',
      if: 'result.sources',
      blocks: [
        { element: 'source-filter' },
        { element: 'source', data: 'result.sources', each: true, layout: 'grid', where: { publisher: '{{state.publisher}}' }, empty: 'No sources' },
      ],
    },
  ],
  elements: {
    'research-hero': {
      description: 'The question, and the report in numbers',
      html: String.raw`<header class="hero">
  <p class="kicker">Research report{{#inputs.depth}} · {{inputs.depth}}{{/inputs.depth}}</p>
  <h1>{{inputs.topic|short:220}}</h1>
  {{#inputs.focus}}<p class="sub">{{inputs.focus}}</p>{{/inputs.focus}}
  <div class="stats">
    <div class="stat"><b>{{result.sources|count}}</b><span>sources read</span></div>
    <div class="stat"><b>{{result.key_findings|count}}</b><span>key findings</span></div>
    <div class="stat"><b>{{result.sources|unique:publisher|count}}</b><span>publishers</span></div>
  </div>
</header>`,
      css: HERO_CSS + STATS_CSS,
    },
    confidence: {
      description: 'How sure the report is: high, medium or low, and why',
      html: String.raw`<div class="conf {{#result.confidence|has:high}}high{{/result.confidence}}{{#result.confidence|has:medium}}medium{{/result.confidence}}{{#result.confidence|has:low}}low{{/result.confidence}}">
  <div class="meter"><span></span><span></span><span></span></div>
  <p>{{result.confidence}}</p>
</div>`,
      css: String.raw`
.conf { padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.meter { display: flex; gap: 4px; margin-bottom: 10px; }
.meter span { flex: 1; height: 6px; border-radius: 999px; background: var(--n-soft); }
.low .meter span:nth-child(1) { background: var(--n-err); }
.medium .meter span:nth-child(-n+2) { background: var(--n-warn); }
.high .meter span { background: var(--n-ok); }
p { margin: 0; font-size: 14px; line-height: 1.5; }
`,
    },
    finding: {
      description: 'A key finding, numbered, with research of its own one click away',
      html: String.raw`<div class="finding">
  <span class="n">{{@number}}</span>
  <p>{{.}}</p>
  <button type="button" class="deeper" data-event="dig" title="A report of its own on this finding">Dig deeper</button>
</div>`,
      css: String.raw`
.finding { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.n { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 13px; font-weight: 700; }
p { margin: 2px 0 0; font-size: 15px; line-height: 1.5; }
.deeper { padding: 4px 10px; border: 1px solid var(--n-line); border-radius: 999px; background: none; color: var(--n-muted); font: inherit; font-size: 12.5px; white-space: nowrap; }
.deeper:hover { border-color: var(--n-accent); color: var(--n-accent); }
@media (max-width: 520px) { .finding { grid-template-columns: auto 1fr; } .deeper { grid-column: 2; justify-self: start; } }
`,
    },
    report: {
      description: 'The full report as an article to read, and to copy',
      html: String.raw`<article class="doc">
  <div class="tools"><span>{{result.sources|count}} sources · {{result.key_findings|count}} key findings</span><button type="button" class="n-btn" data-event="copy_report">Copy the report</button></div>
  <div class="body">{{result.report|markdown}}</div>
</article>`,
      css: String.raw`
.doc { padding: 22px 26px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--n-line); color: var(--n-muted); font-size: 13px; }
.body { max-width: 72ch; font-size: 15.5px; line-height: 1.65; overflow-wrap: anywhere; }
.body h2 { font-size: 21px; margin: 4px 0 10px; } .body h3 { font-size: 17px; margin: 22px 0 8px; } .body h4 { font-size: 15.5px; margin: 18px 0 6px; }
.body p { margin: 0 0 12px; } .body ul, .body ol { margin: 0 0 12px; padding-left: 22px; }
.body blockquote { margin: 0 0 12px; padding-left: 14px; border-left: 3px solid var(--n-line); color: var(--n-muted); }
.body table { width: 100%; border-collapse: collapse; font-size: 14px; } .body th, .body td { padding: 6px 8px; border-bottom: 1px solid var(--n-line); text-align: left; }
@media (max-width: 520px) { .doc { padding: 16px; } }
`,
    },
    'source-filter': {
      description: 'The publishers, to show only one’s sources',
      html: String.raw`<div class="chips">
  {{#state.publisher}}<button type="button" class="chip" data-event="publisher" data-name="">All sources</button>{{/state.publisher}}{{^state.publisher}}<span class="chip on">All sources</span>{{/state.publisher}}
  {{#result.sources|unique:publisher|take:12}}<button type="button" class="chip{{#.|is:$state.publisher}} on{{/.}}" data-event="publisher" data-name="{{.}}">{{.}}</button>{{/result.sources}}
</div>`,
      css: CHIPS_CSS,
    },
    source: {
      description: 'A source: its title, who published it and when, and its site',
      html: String.raw`<a class="src" href="{{url}}" target="_blank" rel="noopener noreferrer">
  <span class="pub">{{publisher|or:Unknown publisher}}{{#date}} · {{date}}{{/date}}</span>
  <span class="t">{{title|or:Untitled}}</span>
  <span class="host">{{url|host}} ↗</span>
</a>`,
      css: String.raw`
.src { display: flex; flex-direction: column; gap: 6px; height: 100%; box-sizing: border-box; padding: 13px 15px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); color: inherit; text-decoration: none; }
.src:hover { border-color: var(--n-accent); }
.pub { color: var(--n-muted); font-size: 12.5px; }
.t { flex: 1; font-size: 14.5px; font-weight: 600; line-height: 1.4; }
.host { color: var(--n-accent); font-size: 12.5px; }
`,
    },
  },
  events: {
    dig: [{ do: 'start', confirm: 'Start a report of its own on this finding? It is a run of its own, of a few minutes.', app: 'tpl:deep-research', inputs: { topic: '{{item}}', depth: 'Quick overview', audience: '{{inputs.audience}}' } }],
    copy_report: [{ do: 'copy', text: '{{result.report}}' }],
    publisher: [{ do: 'set', name: 'publisher', value: '{{event.name}}' }],
  },
};

// ---- Compare products --------------------------------------------------------------------------------------------------

const COMPARE: AppUi = {
  pages: [
    {
      id: 'pick',
      title: 'The pick',
      blocks: [
        { element: 'winner' },
        { title: 'Also considered', element: 'contender', data: 'result.comparison', each: true, layout: 'grid', where: { product: { '!=': '{{result.pick}}' } } },
      ],
    },
    {
      id: 'side',
      title: 'Side by side',
      if: 'result.comparison',
      blocks: [{ element: 'product', data: 'result.comparison', each: true, layout: 'grid' }],
    },
    { id: 'product', title: 'Product', tab: false, blocks: [{ element: 'product-detail', data: 'page.item' }] },
    {
      id: 'watch',
      title: 'Watch out',
      if: 'result.watch_out',
      blocks: [{ element: 'warning', data: 'result.watch_out', each: true }],
    },
  ],
  elements: {
    winner: {
      description: 'The pick, its price and what it is best for, and why',
      html: String.raw`<section class="win">
  <p class="kicker">🏆 The pick</p>
  {{#result.pick}}<h1>{{result.pick}}</h1><p class="lead">{{result.recommendation}}</p>{{/result.pick}}{{^result.pick}}<h1>{{result.recommendation}}</h1>{{/result.pick}}
  {{#result.pick}}{{#result.comparison|where:product=$result.pick|first}}<div class="facts">{{#price}}<span class="price">{{price}}</span>{{/price}}{{#best_for}}<span class="for">Best for {{best_for}}</span>{{/best_for}}{{#link}}<a class="n-btn n-primary" href="{{link}}" target="_blank" rel="noopener noreferrer">See it ↗</a>{{/link}}</div>{{/result.comparison}}{{/result.pick}}
  <div class="why">{{result.why|markdown}}</div>
</section>`,
      css: String.raw`
.win { padding: 22px 24px; border: 1px solid color-mix(in srgb, var(--n-accent) 40%, var(--n-line)); border-radius: calc(var(--n-radius) + 4px); background: linear-gradient(135deg, var(--n-accent-soft), transparent 70%), var(--n-card); }
.kicker { margin: 0; color: var(--n-accent); font-size: 12.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
h1 { margin: 6px 0 12px !important; font-size: 26px !important; letter-spacing: -.015em; }
.lead { margin: -6px 0 14px; font-size: 16px; line-height: 1.5; }
.facts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
.price { padding: 4px 12px; border-radius: 999px; background: var(--n-card); border: 1px solid var(--n-line); font-weight: 600; }
.for { color: var(--n-muted); font-size: 14px; }
.facts .n-btn { margin-left: auto; }
.why { font-size: 15px; line-height: 1.6; }
.why p { margin: 0 0 10px; } .why p:last-child { margin: 0; }
`,
    },
    contender: {
      description: 'Another product it weighed, in a few words',
      html: String.raw`<button type="button" class="c" data-event="open_product">
  <b>{{product}}</b>
  <span class="price">{{price}}</span>
  {{#best_for}}<span class="for">Best for {{best_for}}</span>{{/best_for}}
</button>`,
      css: String.raw`
.c { display: flex; flex-direction: column; gap: 4px; width: 100%; height: 100%; padding: 13px 15px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); color: inherit; font: inherit; text-align: left; }
.c:hover { border-color: var(--n-accent); }
b { font-size: 15px; } .price { font-size: 14px; } .for { color: var(--n-muted); font-size: 13px; }
`,
    },
    product: {
      description: 'A product: price, strengths and weaknesses, what it is best for; the pick stands out',
      html: String.raw`<article class="p{{#product|is:$result.pick}} pick{{/product}}">
  {{#product|is:$result.pick}}<span class="badge">🏆 The pick</span>{{/product}}
  <h3>{{product}}</h3>
  <p class="price">{{price|or:No price found}}</p>
  <ul class="pros">{{#strengths|split}}<li>{{.}}</li>{{/strengths}}</ul>
  <ul class="cons">{{#weaknesses|split}}<li>{{.}}</li>{{/weaknesses}}</ul>
  {{#best_for}}<p class="for">Best for {{best_for}}</p>{{/best_for}}
  <div class="act"><button type="button" class="n-btn" data-event="open_product">More</button>{{#link}}<a class="n-btn" href="{{link}}" target="_blank" rel="noopener noreferrer">See it ↗</a>{{/link}}</div>
</article>`,
      css: String.raw`
& { height: 100%; }
.p { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; padding: 16px 16px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.pick { border-color: var(--n-accent); box-shadow: 0 0 0 3px var(--n-accent-soft); }
.badge { align-self: flex-start; margin-bottom: 8px; padding: 2px 10px; border-radius: 999px; background: var(--n-accent); color: var(--n-accent-fg); font-size: 12px; font-weight: 700; }
h3 { margin: 0; font-size: 16.5px; }
.price { margin: 4px 0 10px; font-weight: 600; }
ul { list-style: none; margin: 0 0 8px; padding: 0; font-size: 14px; line-height: 1.45; }
li { position: relative; padding-left: 20px; margin: 4px 0; }
.pros li::before { content: "✓"; position: absolute; left: 0; color: var(--n-ok); font-weight: 700; }
.cons li::before { content: "✕"; position: absolute; left: 0; color: var(--n-err); font-weight: 700; }
.for { margin: 4px 0 12px; color: var(--n-muted); font-size: 13.5px; }
.act { display: flex; gap: 8px; margin-top: auto; }
`,
    },
    'product-detail': {
      description: 'One product on a page of its own, with research on how it holds up',
      html: String.raw`<div class="d">
  <p class="kicker">{{#product|is:$result.pick}}🏆 The pick{{/product}}{{^product|is:$result.pick}}Also considered{{/product}}</p>
  <h2>{{product}}</h2>
  <p class="price">{{price|or:No price found}}{{#best_for}} · best for {{best_for}}{{/best_for}}</p>
  <div class="two">
    <section><h3>Strengths</h3><ul class="pros">{{#strengths|split}}<li>{{.}}</li>{{/strengths}}</ul></section>
    <section><h3>Weaknesses</h3><ul class="cons">{{#weaknesses|split}}<li>{{.}}</li>{{/weaknesses}}</ul></section>
  </div>
  <div class="n-row act">
    {{#link}}<a class="n-btn n-primary" href="{{link}}" target="_blank" rel="noopener noreferrer">See it ↗</a>{{/link}}
    <button type="button" class="n-btn" data-event="reliability">Research how it holds up</button>
  </div>
</div>`,
      css: String.raw`
.kicker { margin: 0; color: var(--n-accent); font-size: 12.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
h2 { margin: 4px 0 4px !important; font-size: 26px !important; }
.price { margin: 0 0 16px; color: var(--n-muted); }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
section { padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
h3 { margin: 0 0 8px; font-size: 13px; color: var(--n-muted); }
ul { list-style: none; margin: 0; padding: 0; font-size: 14.5px; line-height: 1.5; }
li { position: relative; padding-left: 20px; margin: 5px 0; }
.pros li::before { content: "✓"; position: absolute; left: 0; color: var(--n-ok); font-weight: 700; }
.cons li::before { content: "✕"; position: absolute; left: 0; color: var(--n-err); font-weight: 700; }
.act { margin-top: 16px; }
`,
    },
    warning: {
      description: 'Something to watch out for',
      html: String.raw`<div class="w"><span aria-hidden="true">⚠</span><p>{{.}}</p></div>`,
      css: String.raw`
.w { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--n-warn) 35%, var(--n-line)); border-radius: var(--n-radius); background: color-mix(in srgb, var(--n-warn) 8%, var(--n-card)); }
span { color: var(--n-warn); font-size: 17px; line-height: 1.3; }
p { margin: 0; font-size: 14.5px; line-height: 1.5; }
`,
    },
  },
  events: {
    open_product: [{ do: 'page', page: 'product', item: '{{item}}' }],
    reliability: [{ do: 'start', confirm: 'Start a research report on how {{product}} holds up over time? It is a run of its own, of a few minutes.', app: 'tpl:deep-research', inputs: { topic: 'How reliable is the {{product}} over time: common faults, returns, repairs and what long-term owners say', depth: 'Quick overview' } }],
  },
};

// ---- Document Q&A --------------------------------------------------------------------------------------------------------

const DOCUMENT_QA: AppUi = {
  pages: [
    {
      id: 'answers',
      title: 'Answers',
      blocks: [
        { element: 'qa-search' },
        { element: 'qa', data: 'result.answers', each: true, where: { question: { contains: '{{state.q}}' } }, empty: 'No answer has those words' },
        { element: 'ask-more' },
      ],
    },
    { id: 'summary', title: 'The document', if: 'result.summary', blocks: [{ title: 'What it is about', text: '{{result.summary}}' }] },
  ],
  elements: {
    'qa-search': {
      description: 'A box to find an answer by its question’s words',
      html: String.raw`<div class="top"><span>{{result.answers|count}} answers{{#inputs.document}} from {{inputs.document}}{{/inputs.document}}</span><input type="search" placeholder="Find a question" data-event="find" value="{{state.q}}"></div>`,
      css: String.raw`
.top { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; color: var(--n-muted); font-size: 13.5px; }
input { min-width: 0; flex: 0 1 260px; padding: 8px 12px; border: 1px solid var(--n-line); border-radius: 10px; background: var(--n-card); color: var(--n-fg); font: inherit; font-size: 14.5px; outline: none; }
input:focus { border-color: var(--n-accent); box-shadow: 0 0 0 3px var(--n-accent-soft); }
`,
    },
    qa: {
      description: 'A question, its answer, and the passage it rests on with where it is',
      html: String.raw`<article class="qa">
  <h3><span class="q">Q</span>{{question}}</h3>
  <p class="a">{{answer|or:The document does not say.}}</p>
  {{#quote}}<blockquote>“{{quote}}”{{#location}}<cite>{{location}}</cite>{{/location}}</blockquote>{{/quote}}
  <button type="button" class="copy" data-event="copy_answer">Copy</button>
</article>`,
      css: String.raw`
.qa { position: relative; padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
h3 { display: flex; gap: 10px; margin: 0 56px 8px 0; font-size: 15.5px; line-height: 1.4; }
.q { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--n-accent); color: var(--n-accent-fg); font-size: 12px; }
.a { margin: 0 0 10px 32px; font-size: 15px; line-height: 1.55; }
blockquote { margin: 0 0 0 32px; padding: 10px 12px; border-left: 3px solid var(--n-accent); border-radius: 0 10px 10px 0; background: var(--n-soft); color: var(--n-muted); font-size: 14px; font-style: italic; line-height: 1.5; }
cite { display: block; margin-top: 6px; font-style: normal; font-size: 12.5px; color: var(--n-accent); }
.copy { position: absolute; top: 12px; right: 12px; padding: 3px 9px; border: 1px solid var(--n-line); border-radius: 999px; background: none; color: var(--n-muted); font: inherit; font-size: 12px; }
.copy:hover { color: var(--n-fg); }
@media (max-width: 520px) { .a, blockquote { margin-left: 0; } }
`,
    },
    'ask-more': {
      description: 'A box to ask more questions of the same document: a new run',
      html: String.raw`<form class="more" data-event="ask_more">
  <label for="more-q">Ask more about this document</label>
  <textarea id="more-q" name="questions" rows="2" placeholder="One question a line" required></textarea>
  <button type="submit" class="n-btn n-primary">Ask</button>
</form>`,
      css: String.raw`
.more { display: grid; grid-template-columns: 1fr auto; gap: 8px 10px; align-items: end; padding: 14px 16px; border: 1px dashed var(--n-line); border-radius: var(--n-radius); }
label { grid-column: 1 / -1; font-size: 13.5px; font-weight: 600; }
textarea { min-width: 0; padding: 8px 10px; border: 1px solid var(--n-line); border-radius: 10px; background: var(--n-card); color: var(--n-fg); font: inherit; font-size: 15px; resize: vertical; outline: none; }
textarea:focus { border-color: var(--n-accent); }
`,
    },
  },
  events: {
    find: [{ do: 'set', name: 'q', value: '{{event.value}}' }],
    copy_answer: [{ do: 'copy', text: '{{question}}\n{{answer}}{{#quote}}\n“{{quote}}” ({{location}}){{/quote}}' }],
    ask_more: [{ do: 'again', inputs: { questions: '{{event.questions}}' } }],
  },
};

// ---- Meeting notes to actions --------------------------------------------------------------------------------------------

const MEETING: AppUi = {
  pages: [
    {
      id: 'overview',
      title: 'Overview',
      blocks: [
        { element: 'meeting-hero' },
        { title: 'Summary', text: '{{result.summary}}', width: 'two-thirds' },
        { title: 'Decided', element: 'decision', data: 'result.decisions', each: true, width: 'third', empty: 'Nothing was decided' },
      ],
    },
    {
      id: 'actions',
      title: 'Actions',
      if: 'result.actions',
      blocks: [
        { element: 'action-bar' },
        { element: 'action', data: 'result.actions', each: true, where: { owner: '{{state.owner}}' }, sort: 'due' },
      ],
    },
    { id: 'email', title: 'Follow-up email', if: 'result.email', blocks: [{ element: 'email' }] },
    { id: 'open', title: 'Still open', if: 'result.open_questions', blocks: [{ title: 'Questions for next time', element: 'checklist', data: 'result.open_questions' }] },
  ],
  elements: {
    'meeting-hero': {
      description: 'The meeting, its day and who came, in numbers',
      html: String.raw`<header class="hero">
  <p class="kicker">Meeting{{#inputs.date}} · {{inputs.date|longdate}}{{/inputs.date}}</p>
  <h1>{{inputs.meeting|or:Meeting notes}}</h1>
  {{#inputs.attendees}}<div class="people">{{#inputs.attendees|split:,}}<span class="who"><i>{{.|initials}}</i>{{.}}</span>{{/inputs.attendees}}</div>{{/inputs.attendees}}
  <div class="stats">
    <div class="stat"><b>{{result.decisions|count}}</b><span>decisions</span></div>
    <div class="stat"><b>{{result.actions|count}}</b><span>actions</span></div>
    <div class="stat"><b>{{result.open_questions|count}}</b><span>still open</span></div>
  </div>
</header>`,
      css: HERO_CSS + STATS_CSS + String.raw`
.people { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.who { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 3px; border-radius: 999px; background: var(--n-card); border: 1px solid var(--n-line); font-size: 13px; }
.who i { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--n-accent-soft); color: var(--n-accent); font-size: 10.5px; font-style: normal; font-weight: 700; }
`,
    },
    decision: {
      description: 'A decision, with a check',
      html: String.raw`<div class="d"><span>✓</span><p>{{.}}</p></div>`,
      css: String.raw`
.d { display: flex; gap: 10px; padding: 10px 12px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
span { color: var(--n-ok); font-weight: 700; }
p { margin: 0; font-size: 14.5px; line-height: 1.45; }
`,
    },
    'action-bar': {
      description: 'How many are done, and whose to show',
      html: String.raw`<div class="bar">
  <div class="progress"><b>{{state.done|count}} of {{result.actions|count}} done</b><span class="track"><span style="width: calc({{state.done|count}} / {{result.actions|count}} * 100%)"></span></span></div>
  <div class="chips">
    {{#state.owner}}<button type="button" class="chip" data-event="owner" data-name="">Everyone</button>{{/state.owner}}{{^state.owner}}<span class="chip on">Everyone</span>{{/state.owner}}
    {{#result.actions|unique:owner}}<button type="button" class="chip{{#.|is:$state.owner}} on{{/.}}" data-event="owner" data-name="{{.}}">{{.}}</button>{{/result.actions}}
  </div>
</div>`,
      css: CHIPS_CSS + String.raw`
.bar { display: grid; gap: 12px; }
.progress { display: grid; gap: 6px; font-size: 14px; }
.track { height: 8px; border-radius: 999px; background: var(--n-soft); overflow: hidden; }
.track span { display: block; height: 100%; border-radius: 999px; background: var(--n-ok); }
`,
    },
    action: {
      description: 'An action: what, who and by when, to tick off',
      html: String.raw`<div class="a{{#state.done.@key}} done{{/state.done.@key}}">
  <button type="button" class="tick" data-event="done" title="Done">✓</button>
  <div class="body"><p class="task">{{task}}</p>{{#notes}}<p class="notes">{{notes}}</p>{{/notes}}</div>
  <div class="meta">{{#owner}}<span class="who"><i>{{owner|initials}}</i>{{owner}}</span>{{/owner}}{{#due}}<span class="due">{{due|shortdate}}</span>{{/due}}</div>
</div>`,
      css: String.raw`
.a { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.tick { width: 26px; height: 26px; border: 1.5px solid var(--n-line); border-radius: 8px; background: none; color: transparent; font: inherit; font-size: 13px; }
.tick:hover { border-color: var(--n-ok); color: var(--n-ok); }
.done .tick { border-color: var(--n-ok); background: var(--n-ok); color: var(--n-card); }
.task { margin: 2px 0 0; font-size: 15px; line-height: 1.45; }
.done .task { color: var(--n-muted); text-decoration: line-through; text-decoration-color: var(--n-line); }
.notes { margin: 4px 0 0; color: var(--n-muted); font-size: 13.5px; }
.meta { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.who { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; white-space: nowrap; }
.who i { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--n-accent-soft); color: var(--n-accent); font-size: 10.5px; font-style: normal; font-weight: 700; }
.due { padding: 2px 8px; border-radius: 999px; background: var(--n-soft); color: var(--n-muted); font-size: 12px; white-space: nowrap; }
@media (max-width: 520px) { .a { grid-template-columns: auto 1fr; } .meta { grid-column: 2; flex-direction: row; align-items: center; } }
`,
    },
    email: {
      description: 'The follow-up email, as it would be sent, to copy',
      html: String.raw`<div class="mail">
  <div class="head"><span class="k">Subject</span><span>Follow-up{{#inputs.meeting}}: {{inputs.meeting}}{{/inputs.meeting}}</span></div>
  {{#inputs.attendees}}<div class="head"><span class="k">To</span><span>{{inputs.attendees}}</span></div>{{/inputs.attendees}}
  <div class="body">{{result.email|markdown}}</div>
  <div class="foot"><button type="button" class="n-btn n-primary" data-event="copy_email">Copy the email</button></div>
</div>`,
      css: String.raw`
.mail { overflow: hidden; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.head { display: flex; gap: 12px; padding: 9px 16px; border-bottom: 1px solid var(--n-line); font-size: 14px; }
.k { width: 60px; flex: none; color: var(--n-muted); }
.body { padding: 16px; font-size: 15px; line-height: 1.6; }
.body p { margin: 0 0 10px; }
.foot { padding: 0 16px 16px; }
`,
    },
  },
  events: {
    done: [{ do: 'toggle', name: 'done.@key', keep: true }],
    owner: [{ do: 'set', name: 'owner', value: '{{event.name}}' }],
    copy_email: [{ do: 'copy', text: '{{result.email}}' }],
  },
};

// ---- Cover letter ---------------------------------------------------------------------------------------------------------

const COVER: AppUi = {
  pages: [
    {
      id: 'letter',
      title: 'The letter',
      blocks: [{ element: 'tone-switch' }, { element: 'letter' }],
    },
    {
      id: 'fit',
      title: 'Why you fit',
      if: 'result.matched',
      blocks: [{ element: 'match', data: 'result.matched', each: true }],
    },
    {
      id: 'gaps',
      title: 'Gaps to prepare for',
      if: 'result.gaps',
      blocks: [
        { html: '<p class="n-muted" style="margin:0;font-size:14px">What the job asks for that your background does not show yet, and how to answer for it in an interview. Tick each one off as you prepare.</p>' },
        { element: 'checklist', data: 'result.gaps' },
      ],
    },
  ],
  elements: {
    'tone-switch': {
      description: 'Its tone and length, with buttons to write it again another way',
      html: String.raw`<div class="bar">
  <span class="label">Tone</span>
  <div class="seg">
    {{#inputs.tone|is:Warm}}<span class="on">Warm</span>{{/inputs.tone}}{{^inputs.tone|is:Warm}}<button type="button" data-event="tone" data-v="Warm">Warm</button>{{/inputs.tone}}
    {{#inputs.tone|is:Confident}}<span class="on">Confident</span>{{/inputs.tone}}{{^inputs.tone|is:Confident}}<button type="button" data-event="tone" data-v="Confident">Confident</button>{{/inputs.tone}}
    {{#inputs.tone|is:Formal}}<span class="on">Formal</span>{{/inputs.tone}}{{^inputs.tone|is:Formal}}<button type="button" data-event="tone" data-v="Formal">Formal</button>{{/inputs.tone}}
  </div>
  <span class="label">Length</span>
  <div class="seg">
    {{#inputs.length|is:Short}}<span class="on">Short</span>{{/inputs.length}}{{^inputs.length|is:Short}}<button type="button" data-event="length" data-v="Short">Short</button>{{/inputs.length}}
    {{#inputs.length|is:Standard}}<span class="on">Standard</span>{{/inputs.length}}{{^inputs.length|is:Standard}}<button type="button" data-event="length" data-v="Standard">Standard</button>{{/inputs.length}}
  </div>
</div>`,
      css: String.raw`
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.label { color: var(--n-muted); font-size: 13px; }
.seg { display: inline-flex; padding: 3px; border-radius: 11px; background: var(--n-soft); margin-right: 8px; }
.seg > * { padding: 6px 12px; border: 0; border-radius: 8px; background: none; color: var(--n-muted); font: inherit; font-size: 13.5px; }
.seg button:hover { color: var(--n-fg); }
.seg .on { background: var(--n-card); color: var(--n-fg); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.12); }
`,
    },
    letter: {
      description: 'The letter on a page, with its subject line, to copy',
      html: String.raw`<div class="paper">
  {{#result.subject}}<p class="subject"><span>Subject</span>{{result.subject}}</p>{{/result.subject}}
  <div class="body">{{result.letter|markdown}}</div>
  <div class="n-row act"><button type="button" class="n-btn n-primary" data-event="copy_letter">Copy the letter</button>{{#result.subject}}<button type="button" class="n-btn" data-event="copy_subject">Copy the subject</button>{{/result.subject}}</div>
</div>`,
      css: String.raw`
.paper { max-width: 720px; margin: 0 auto; padding: 34px 40px 26px; border: 1px solid var(--n-line); border-radius: 6px; background: var(--n-card); box-shadow: 0 1px 0 var(--n-line), 0 10px 30px -18px rgba(0,0,0,.35); }
.subject { margin: 0 0 18px; padding-bottom: 12px; border-bottom: 1px solid var(--n-line); font-weight: 600; }
.subject span { display: block; margin-bottom: 2px; color: var(--n-muted); font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: .04em; }
.body { font-family: Georgia, "Iowan Old Style", "Times New Roman", serif; font-size: 16px; line-height: 1.7; }
.body p { margin: 0 0 14px; }
.act { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--n-line); }
@media (max-width: 520px) { .paper { padding: 20px 18px; } }
`,
    },
    match: {
      description: 'What the job asks for, and the evidence for it from your background',
      html: String.raw`<div class="m">
  <div class="req"><span class="k">The job asks for</span>{{requirement}}</div>
  <span class="arrow" aria-hidden="true">→</span>
  <div class="ev"><span class="k">You show it with</span>{{evidence|or:Nothing yet}}</div>
</div>`,
      css: String.raw`
.m { display: grid; grid-template-columns: 1fr auto 1.3fr; gap: 12px; align-items: stretch; }
.req, .ev { padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); font-size: 14.5px; line-height: 1.5; }
.ev { border-color: color-mix(in srgb, var(--n-ok) 35%, var(--n-line)); }
.k { display: block; margin-bottom: 4px; color: var(--n-muted); font-size: 12px; }
.arrow { align-self: center; color: var(--n-accent); font-size: 18px; }
@media (max-width: 560px) { .m { grid-template-columns: 1fr; } .arrow { justify-self: center; transform: rotate(90deg); } }
`,
    },
  },
  events: {
    tone: [{ do: 'again', confirm: 'Write the letter again in a {{event.text}} tone? It is a new run.', inputs: { tone: '{{event.v}}' } }],
    length: [{ do: 'again', confirm: 'Write the letter again, {{event.text}}? It is a new run.', inputs: { length: '{{event.v}}' } }],
    copy_letter: [{ do: 'copy', text: '{{result.letter}}' }],
    copy_subject: [{ do: 'copy', text: '{{result.subject}}' }],
  },
};

// ---- Lesson plan ------------------------------------------------------------------------------------------------------------

const LESSON: AppUi = {
  pages: [
    {
      id: 'overview',
      title: 'Overview',
      blocks: [
        { element: 'lesson-hero' },
        { title: 'By the end, learners can', element: 'objective', data: 'result.objectives', each: true, width: 'half' },
        { title: 'Materials to get ready', element: 'checklist', data: 'result.materials', width: 'half', if: 'result.materials' },
      ],
    },
    {
      id: 'timeline',
      title: 'Timeline',
      if: 'result.timeline',
      blocks: [
        { element: 'time-strip', data: 'result.timeline' },
        { element: 'activity', data: 'result.timeline', each: true },
      ],
    },
    {
      id: 'support',
      title: 'Support and checks',
      blocks: [
        { title: 'Support and stretch', text: '{{result.differentiation}}', width: 'half', if: 'result.differentiation' },
        { title: 'Checking understanding', text: '{{result.assessment}}', width: 'half', if: 'result.assessment' },
      ],
    },
    { id: 'plan', title: 'Whole plan', if: 'result.plan', blocks: [{ element: 'plan-doc' }] },
  ],
  elements: {
    'lesson-hero': {
      description: 'The lesson, for whom and how long',
      html: String.raw`<header class="hero">
  <p class="kicker">Lesson plan{{#inputs.setting}} · {{inputs.setting}}{{/inputs.setting}}</p>
  <h1>{{inputs.topic}}</h1>
  <p class="sub">{{inputs.learners}}</p>
  <div class="stats">
    <div class="stat"><b>{{inputs.minutes}} min</b><span>in all</span></div>
    <div class="stat"><b>{{result.timeline|count}}</b><span>activities</span></div>
    <div class="stat"><b>{{result.objectives|count}}</b><span>objectives</span></div>
  </div>
</header>`,
      css: HERO_CSS + STATS_CSS,
    },
    objective: {
      description: 'An objective, numbered',
      html: String.raw`<div class="o"><span>{{@number}}</span><p>{{.}}</p></div>`,
      css: String.raw`
.o { display: flex; gap: 12px; align-items: flex-start; padding: 11px 13px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
span { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--n-accent); color: var(--n-accent-fg); font-size: 12.5px; font-weight: 700; }
p { margin: 1px 0 0; font-size: 14.5px; line-height: 1.45; }
`,
    },
    'time-strip': {
      description: 'The lesson as one strip, each activity as wide as its minutes',
      html: String.raw`<div class="strip">{{#.}}<span class="seg c{{@number}}" style="flex: {{minutes}}" title="{{minutes}} min · {{activity}}"><b>{{minutes}}′</b></span>{{/.}}</div>
<div class="scale"><span>0′</span><span>{{.|sum:minutes}}′</span></div>`,
      css: String.raw`
.strip { display: flex; gap: 3px; height: 34px; }
.seg { display: grid; place-items: center; min-width: 22px; border-radius: 7px; background: var(--n-c1); color: var(--n-bg); font-size: 12px; overflow: hidden; }
.c2, .c8 { background: var(--n-c2); } .c3, .c9 { background: var(--n-c3); } .c4, .c10 { background: var(--n-c4); } .c5, .c11 { background: var(--n-c5); } .c6, .c12 { background: var(--n-c6); }
.scale { display: flex; justify-content: space-between; margin-top: 4px; color: var(--n-muted); font-size: 12px; }
`,
    },
    activity: {
      description: 'An activity: how long, what the teacher does and what the learners do',
      html: String.raw`<div class="act">
  <div class="time"><b>{{minutes}}</b><span>min</span></div>
  <div class="body">
    <h3>{{activity}}</h3>
    <div class="two"><p><span class="k">Teacher</span>{{teacher}}</p><p><span class="k">Learners</span>{{learners}}</p></div>
  </div>
</div>`,
      css: String.raw`
.act { display: grid; grid-template-columns: 64px 1fr; gap: 14px; padding: 13px 15px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.time { display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 10px; background: var(--n-accent-soft); color: var(--n-accent); }
.time b { font-size: 20px; line-height: 1.1; } .time span { font-size: 11.5px; }
h3 { margin: 0 0 8px; font-size: 15.5px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
p { margin: 0; font-size: 14px; line-height: 1.5; }
.k { display: block; color: var(--n-muted); font-size: 12px; }
@media (max-width: 560px) { .two { grid-template-columns: 1fr; } }
`,
    },
    'plan-doc': {
      description: 'The whole plan, to print or copy',
      html: String.raw`<article class="doc"><div class="tools"><button type="button" class="n-btn" data-event="copy_plan">Copy the plan</button></div>{{result.plan|markdown}}</article>`,
      css: String.raw`
.doc { padding: 22px 26px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); font-size: 15px; line-height: 1.6; }
.tools { display: flex; justify-content: flex-end; margin-bottom: 6px; }
h2, h3, h4 { margin: 18px 0 8px; } p { margin: 0 0 10px; }
`,
    },
  },
  events: {
    copy_plan: [{ do: 'copy', text: '{{result.plan}}' }],
  },
};

// ---- Weekly news digest -------------------------------------------------------------------------------------------------------

const NEWS: AppUi = {
  pages: [
    {
      id: 'stories',
      title: 'Stories',
      blocks: [
        { element: 'news-hero' },
        { element: 'topic-filter' },
        { element: 'story', data: 'result.stories', each: true, layout: 'grid', where: { topic: '{{state.topic}}' }, sort: '-date', empty: 'No stories this week' },
      ],
    },
    { id: 'digest', title: 'The digest', if: 'result.digest', blocks: [{ element: 'digest' }] },
  ],
  elements: {
    'news-hero': {
      description: 'The week in a headline',
      html: String.raw`<header class="hero">
  <p class="kicker">This week{{#inputs.region}} · {{inputs.region}}{{/inputs.region}} · {{result.stories|count}} stories</p>
  <h1>{{result.headline|or:Your week in news}}</h1>
</header>`,
      css: HERO_CSS,
    },
    'topic-filter': {
      description: 'The topics, to show only one’s stories',
      html: String.raw`<div class="chips">
  {{#state.topic}}<button type="button" class="chip" data-event="topic" data-name="">All topics</button>{{/state.topic}}{{^state.topic}}<span class="chip on">All topics</span>{{/state.topic}}
  {{#result.stories|unique:topic}}<button type="button" class="chip{{#.|is:$state.topic}} on{{/.}}" data-event="topic" data-name="{{.}}">{{.}}</button>{{/result.stories}}
</div>`,
      css: CHIPS_CSS,
    },
    story: {
      description: 'A story: its topic and day, what happened and why it matters, its source, to mark read or research',
      html: String.raw`<article class="s{{#state.read.@key}} read{{/state.read.@key}}">
  <div class="top"><span class="topic">{{topic}}</span>{{#date}}<span class="when">{{date|shortdate}}</span>{{/date}}</div>
  <h3><a href="{{url}}" target="_blank" rel="noopener noreferrer">{{title}}</a></h3>
  <p class="sum">{{summary}}</p>
  {{#why}}<p class="why"><b>Why it matters</b> {{why}}</p>{{/why}}
  <div class="foot">
    <span class="src">{{source|or:$url}}</span>
    <button type="button" class="b" data-event="read">{{#state.read.@key}}✓ Read{{/state.read.@key}}{{^state.read.@key}}Mark read{{/state.read.@key}}</button>
    <button type="button" class="b" data-event="research">Research</button>
  </div>
</article>`,
      css: String.raw`
& { height: 100%; }
.s { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.read { opacity: .62; }
.top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 12.5px; }
.topic { padding: 1px 9px; border-radius: 999px; background: var(--n-accent-soft); color: var(--n-accent); font-weight: 600; }
.when { color: var(--n-muted); }
h3 { margin: 0 0 6px; font-size: 16px; line-height: 1.35; }
h3 a { color: inherit; text-decoration: none; } h3 a:hover { color: var(--n-accent); }
.sum { margin: 0 0 8px; font-size: 14px; line-height: 1.5; }
.why { margin: 0 0 10px; padding: 8px 10px; border-radius: 9px; background: var(--n-soft); font-size: 13.5px; line-height: 1.45; }
.why b { display: block; margin-bottom: 2px; font-size: 12px; color: var(--n-muted); }
.foot { display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--n-line); }
.src { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--n-muted); font-size: 12.5px; }
.b { padding: 3px 10px; border: 1px solid var(--n-line); border-radius: 999px; background: none; color: var(--n-muted); font: inherit; font-size: 12.5px; white-space: nowrap; }
.b:hover { color: var(--n-fg); border-color: var(--n-accent); }
`,
    },
    digest: {
      description: 'The digest to read, and to copy',
      html: String.raw`<article class="doc"><div class="tools"><button type="button" class="n-btn" data-event="copy_digest">Copy the digest</button></div><div class="body">{{result.digest|markdown}}</div></article>`,
      css: String.raw`
.doc { padding: 22px 26px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.tools { display: flex; justify-content: flex-end; margin-bottom: 6px; }
.body { max-width: 72ch; font-size: 15.5px; line-height: 1.65; }
.body h2, .body h3 { margin: 18px 0 8px; } .body p { margin: 0 0 12px; }
`,
    },
  },
  events: {
    topic: [{ do: 'set', name: 'topic', value: '{{event.name}}' }],
    read: [{ do: 'toggle', name: 'read.@key', keep: true }],
    research: [{ do: 'start', confirm: 'Start a research report on “{{title}}”? It is a run of its own, of a few minutes.', app: 'tpl:deep-research', inputs: { topic: '{{title}}: what happened, why it matters and what comes next', depth: 'Quick overview' } }],
    copy_digest: [{ do: 'copy', text: '{{result.digest}}' }],
  },
};

// ---- Explain a contract ---------------------------------------------------------------------------------------------------------

const CONTRACT: AppUi = {
  pages: [
    {
      id: 'short',
      title: 'In short',
      blocks: [
        { element: 'contract-hero' },
        { title: 'What it says', text: '{{result.summary}}', width: 'two-thirds' },
        { title: 'Ask before you sign', element: 'questions', width: 'third', if: 'result.questions' },
      ],
    },
    {
      id: 'flags',
      title: 'Red flags',
      if: 'result.red_flags',
      blocks: [
        { element: 'severity-filter' },
        { element: 'flag', data: 'result.red_flags', each: true, where: { severity: '{{state.severity}}' } },
      ],
    },
    { id: 'terms', title: 'Key terms', if: 'result.terms', blocks: [{ element: 'term', data: 'result.terms', each: true, layout: 'grid' }] },
    { id: 'dates', title: 'Dates', if: 'result.dates', blocks: [{ element: 'when', data: 'result.dates', each: true }] },
  ],
  elements: {
    'contract-hero': {
      description: 'The contract in numbers: its red flags by how serious, its dates, its questions',
      html: String.raw`<header class="hero">
  <p class="kicker">Contract{{#inputs.side}} · read for {{inputs.side}}{{/inputs.side}}</p>
  <h1>{{inputs.contract|or:The agreement}}</h1>
  <div class="stats">
    <div class="stat high"><b>{{result.red_flags|where:severity=High|count}}</b><span>serious red flags</span></div>
    <div class="stat"><b>{{result.red_flags|count}}</b><span>red flags in all</span></div>
    <div class="stat"><b>{{result.dates|count}}</b><span>dates to keep</span></div>
    <div class="stat"><b>{{result.questions|count}}</b><span>questions to ask</span></div>
  </div>
</header>`,
      css: HERO_CSS + STATS_CSS + String.raw`.stat.high b { color: var(--n-err); }`,
    },
    questions: {
      description: 'The questions to ask, to copy',
      html: String.raw`<div class="qs"><ol>{{#result.questions}}<li>{{.}}</li>{{/result.questions}}</ol><button type="button" class="n-btn" data-event="copy_questions">Copy the questions</button></div>`,
      css: String.raw`
.qs { padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
ol { margin: 0 0 12px; padding-left: 20px; font-size: 14.5px; line-height: 1.5; } li { margin: 5px 0; }
`,
    },
    'severity-filter': {
      description: 'How serious, to show only those',
      html: String.raw`<div class="chips">
  {{#state.severity}}<button type="button" class="chip" data-event="severity" data-name="">All</button>{{/state.severity}}{{^state.severity}}<span class="chip on">All</span>{{/state.severity}}
  <button type="button" class="chip sev-high{{#state.severity|is:High}} on{{/state.severity}}" data-event="severity" data-name="High">● High · {{result.red_flags|where:severity=High|count}}</button>
  <button type="button" class="chip sev-medium{{#state.severity|is:Medium}} on{{/state.severity}}" data-event="severity" data-name="Medium">● Medium · {{result.red_flags|where:severity=Medium|count}}</button>
  <button type="button" class="chip sev-low{{#state.severity|is:Low}} on{{/state.severity}}" data-event="severity" data-name="Low">● Low · {{result.red_flags|where:severity=Low|count}}</button>
</div>`,
      css: CHIPS_CSS + String.raw`.sev-high { color: var(--n-err); } .sev-medium { color: var(--n-warn); } .sev-low { color: var(--n-info); }`,
    },
    flag: {
      description: 'A red flag, as serious as it is: the clause, what is wrong, and what to ask',
      html: String.raw`<article class="f sev-{{severity|slug}}">
  <div class="top"><span class="sev">{{severity}}</span>{{#clause}}<span class="clause">{{clause}}</span>{{/clause}}</div>
  <p class="issue">{{issue}}</p>
  {{#ask}}<p class="ask"><b>Ask</b> {{ask}}</p>{{/ask}}
</article>`,
      css: String.raw`
.f { --c: var(--n-info); padding: 13px 15px 13px 18px; border: 1px solid var(--n-line); border-left: 4px solid var(--c); border-radius: var(--n-radius); background: var(--n-card); }
.sev-high { --c: var(--n-err); } .sev-medium { --c: var(--n-warn); }
.top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 6px; }
.sev { padding: 1px 9px; border-radius: 999px; background: color-mix(in srgb, var(--c) 15%, transparent); color: var(--c); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
.clause { color: var(--n-muted); font-size: 13px; }
.issue { margin: 0 0 8px; font-size: 15px; line-height: 1.5; }
.ask { margin: 0; padding: 8px 10px; border-radius: 9px; background: var(--n-soft); font-size: 14px; line-height: 1.45; }
.ask b { color: var(--n-accent); }
`,
    },
    term: {
      description: 'A term and what it means, with its clause',
      html: String.raw`<div class="t"><h3>{{term}}</h3><p>{{meaning}}</p>{{#clause}}<span>{{clause}}</span>{{/clause}}</div>`,
      css: String.raw`
& { height: 100%; }
.t { height: 100%; box-sizing: border-box; padding: 13px 15px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
h3 { margin: 0 0 6px; font-size: 15px; } p { margin: 0 0 8px; font-size: 14px; line-height: 1.5; }
span { color: var(--n-muted); font-size: 12.5px; }
`,
    },
    when: {
      description: 'A date to keep, on a line',
      html: String.raw`<div class="w{{#@last}} last{{/@last}}"><span class="dot"></span><div><b>{{when}}</b><p>{{what}}</p></div></div>`,
      css: String.raw`
.w { position: relative; display: grid; grid-template-columns: 18px 1fr; gap: 12px; padding-bottom: 6px; }
.w::before { content: ""; position: absolute; left: 8px; top: 16px; bottom: -12px; width: 2px; background: var(--n-line); }
.last::before { display: none; }
.dot { width: 14px; height: 14px; margin-top: 3px; border-radius: 50%; background: var(--n-accent); box-shadow: 0 0 0 4px var(--n-accent-soft); }
b { font-size: 15px; } p { margin: 2px 0 0; color: var(--n-muted); font-size: 14px; line-height: 1.5; }
`,
    },
  },
  events: {
    severity: [{ do: 'set', name: 'severity', value: '{{event.name}}' }],
    copy_questions: [{ do: 'copy', text: '{{result.questions}}' }],
  },
};

// ---- Build a small web app -------------------------------------------------------------------------------------------------------

const WEB_APP: AppUi = {
  pages: [
    {
      id: 'built',
      title: 'What was built',
      blocks: [
        { element: 'built-hero' },
        { title: 'How to open it', element: 'open-it', if: 'result.how_to_open' },
        { title: 'Its files', element: 'file', data: 'result.files', each: true, layout: 'row', if: 'result.files' },
        { title: 'What it does', text: '{{result.summary}}' },
        { element: 'change-it' },
      ],
    },
    { id: 'next', title: 'Next steps', if: 'result.next', blocks: [{ title: 'Ideas for what comes next', element: 'checklist', data: 'result.next' }] },
  ],
  elements: {
    'built-hero': {
      description: 'The idea that was built',
      html: String.raw`<header class="hero"><p class="kicker">A small web app{{#inputs.users}} · for {{inputs.users}}{{/inputs.users}}</p><h1>{{inputs.idea|short:160}}</h1></header>`,
      css: HERO_CSS,
    },
    'open-it': {
      description: 'How to open it, as a line to copy',
      html: String.raw`<div class="o"><code>{{result.how_to_open}}</code><button type="button" class="n-btn" data-event="copy_open">Copy</button></div>`,
      css: String.raw`
.o { display: flex; gap: 10px; align-items: center; padding: 10px 10px 10px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-soft); }
code { flex: 1; min-width: 0; overflow-wrap: anywhere; font-family: var(--n-mono); font-size: 13.5px; }
`,
    },
    file: {
      description: 'One of its files, with a mark for its kind',
      html: String.raw`<span class="file ext-{{.|split:.|last|lower}}"><i>{{.|split:.|last|upper|short:4}}</i>{{.|split:/|last}}</span>`,
      css: String.raw`
.file { display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px 5px 5px; border: 1px solid var(--n-line); border-radius: 10px; background: var(--n-card); font-family: var(--n-mono); font-size: 13px; }
i { display: grid; place-items: center; min-width: 30px; height: 22px; padding: 0 4px; box-sizing: border-box; border-radius: 6px; background: var(--n-soft); color: var(--n-muted); font-size: 10px; font-style: normal; font-weight: 700; }
.ext-html i { background: color-mix(in srgb, var(--n-c4) 22%, transparent); color: var(--n-c4); }
.ext-css i { background: color-mix(in srgb, var(--n-c2) 22%, transparent); color: var(--n-c2); }
.ext-js i { background: color-mix(in srgb, var(--n-c1) 22%, transparent); color: var(--n-c1); }
`,
    },
    'change-it': {
      description: 'A box to build it again with a change: a new run',
      html: String.raw`<form class="ch" data-event="change">
  <label for="ch-x">Build it again with a change</label>
  <textarea id="ch-x" name="change" rows="2" placeholder="e.g. Add a dark theme, and let me export the list" required></textarea>
  <button type="submit" class="n-btn n-primary">Build again</button>
</form>`,
      css: String.raw`
.ch { display: grid; grid-template-columns: 1fr auto; gap: 8px 10px; align-items: end; padding: 14px 16px; border: 1px dashed var(--n-line); border-radius: var(--n-radius); }
label { grid-column: 1 / -1; font-size: 13.5px; font-weight: 600; }
textarea { min-width: 0; padding: 8px 10px; border: 1px solid var(--n-line); border-radius: 10px; background: var(--n-card); color: var(--n-fg); font: inherit; font-size: 15px; resize: vertical; outline: none; }
textarea:focus { border-color: var(--n-accent); }
`,
    },
  },
  events: {
    copy_open: [{ do: 'copy', text: '{{result.how_to_open}}' }],
    change: [{ do: 'again', confirm: 'Build it again with this change? It is a new run.', inputs: { features: '{{inputs.features}}\n{{event.change}}' } }],
  },
};

/** Each ready-made app's view, by its id. */
export const VIEWS: Record<string, AppUi> = {
  'deep-research': RESEARCH,
  'trip-planner': TRIP,
  'compare-products': COMPARE,
  'document-qa': DOCUMENT_QA,
  'meeting-actions': MEETING,
  'cover-letter': COVER,
  'lesson-plan': LESSON,
  'news-digest': NEWS,
  'explain-contract': CONTRACT,
  'small-web-app': WEB_APP,
};
