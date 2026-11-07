// The views of the ready-made apps for everyday things (templates-more.ts): the answer as cards, charts (Plotly, from
// the answer's rows), maps (Leaflet and OpenStreetMap, places numbered) and timelines, in the page kit's colours so they
// look like part of the app in both themes and fit a phone. Their buttons tick things off (kept with the run), filter,
// copy, run the app again with one answer changed, or start another ready-made app on part of the answer. Their
// words are translated as the app's are (uiTexts).
import type { AppUi } from '../../shared/app-ui.ts';
import { CHIPS_CSS, HERO_CSS, PIC_CSS as PIC, STATS_CSS } from './views.ts';

// ---- what several share -----------------------------------------------------------------------------------------

/** A card (a button or a link fills its column like a box: sized by its words, a line kept whole would widen it). */
const CARD = String.raw`
& { height: 100%; }
.c { display: flex; flex-direction: column; gap: 6px; width: 100%; height: 100%; min-width: 0; box-sizing: border-box; padding: 13px 15px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); color: inherit; font: inherit; text-align: left; }
button.c:hover, a.c:hover { border-color: var(--n-accent); }
.c h3 { margin: 0; font-size: 15.5px; line-height: 1.35; }
.c p { margin: 0; font-size: 14px; line-height: 1.5; }
.muted { color: var(--n-muted); font-size: 13px; }
.tag { align-self: flex-start; padding: 1px 9px; border-radius: 999px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 12px; font-weight: 600; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: auto; padding-top: 8px; }
.b { padding: 3px 10px; border: 1px solid var(--n-line); border-radius: 999px; background: none; color: var(--n-muted); font: inherit; font-size: 12.5px; text-decoration: none; white-space: nowrap; }
.b:hover { color: var(--n-fg); border-color: var(--n-accent); }
.b.on { border-color: var(--n-accent); background: var(--n-accent-soft); color: var(--n-accent); }
`;

/** A row in a list: a mark on the left, the words, something on the right. */
const ROW = String.raw`
.r { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 10px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.r p { margin: 0; font-size: 14.5px; line-height: 1.4; }
.r small { display: block; color: var(--n-muted); font-size: 12.5px; }
.when { min-width: 52px; text-align: center; color: var(--n-muted); font-size: 12.5px; line-height: 1.3; }
.when b { display: block; color: var(--n-fg); font-size: 15px; }
.b { padding: 3px 10px; border: 1px solid var(--n-line); border-radius: 999px; background: none; color: var(--n-muted); font: inherit; font-size: 12.5px; text-decoration: none; white-space: nowrap; }
.b:hover { color: var(--n-fg); border-color: var(--n-accent); }
@media (max-width: 520px) { .r { grid-template-columns: auto 1fr; } .r > :last-child { grid-column: 2; justify-self: start; } }
`;

/** A mark on a card's picture when it has a video to play (a trailer): the picture goes in .shot, the mark is .play. */
const PLAY = String.raw`
.shot { position: relative; display: block; }
.play { position: absolute; right: 8px; bottom: 8px; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 999px; background: rgb(0 0 0 / 0.62); color: #fff; font-size: 12px; font-style: normal; padding-left: 2px; box-sizing: border-box; }
`;

/** Results as letters in coloured circles (W, D, L). */
const FORM = String.raw`
.form { display: inline-flex; gap: 4px; }
.f { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--n-soft); color: var(--n-muted); font-size: 12px; font-weight: 700; }
.f-w { background: var(--n-ok); color: var(--n-card); } .f-l { background: var(--n-err); color: var(--n-card); } .f-d { background: var(--n-warn); color: var(--n-card); }
`;

// ---- Weather outlook --------------------------------------------------------------------------------------------

const WEATHER: AppUi = {
  pages: [
    {
      id: 'forecast',
      title: 'Forecast',
      blocks: [
        { element: 'wx-now' },
        { title: 'Best days', element: 'wx-best', data: 'result.best', each: true, layout: 'row', if: 'result.best' },
        { title: 'Day by day', element: 'wx-day', data: 'result.days', each: true, layout: 'row', empty: 'No forecast' },
        { title: 'Highs and lows', element: 'plot', data: 'result.days', width: 'half', with: { kind: 'line', x: 'date', y: ['high', 'low'], height: 260 } },
        { title: 'Chance of rain, %', element: 'plot', data: 'result.days', width: 'half', with: { kind: 'bar', x: 'date', y: 'chance', height: 260 } },
      ],
    },
    {
      id: 'hours',
      title: 'Next 48 hours',
      if: 'result.hours',
      blocks: [
        { title: 'Temperature', element: 'plot', data: 'result.hours', with: { kind: 'line', x: 'time', y: 'temp', height: 240 } },
        { title: 'Chance of rain, %', element: 'plot', data: 'result.hours', with: { kind: 'bar', x: 'time', y: 'chance', height: 180 } },
        { element: 'wx-hour', data: 'result.hours', each: true, layout: 'row' },
      ],
    },
    { id: 'day', title: 'Day', tab: false, blocks: [{ element: 'wx-day-detail', data: 'page.item' }, { title: 'Hour by hour', element: 'plot', data: 'result.hours', where: { time: { contains: '{{page.item.date}}' } }, with: { kind: 'line', x: 'hour', y: 'temp', height: 220 } }] },
    {
      id: 'wear',
      title: 'What to wear',
      blocks: [
        { element: 'wx-wear', width: 'two-thirds' },
        { title: 'Where', element: 'map', data: 'result.at', width: 'third', with: { zoom: 10, height: 240 } },
      ],
    },
  ],
  elements: {
    'wx-now': {
      description: 'The place, the weather now and the days in a few numbers',
      html: String.raw`<header class="hero">
  <p class="kicker">Weather · next {{result.days|count}} days</p>
  <h1>{{result.place}}</h1>
  <div class="now">{{#result.now_icon}}<span class="ic">{{result.now_icon}}</span>{{/result.now_icon}}{{#result.now_temp}}<b>{{result.now_temp|number}}{{result.unit}}</b>{{/result.now_temp}}<span class="sky">{{result.now_sky}}{{#result.feels}} · feels like {{result.feels|number}}{{result.unit}}{{/result.feels}}</span></div>
  <div class="sum">{{result.summary|markdown}}</div>
  <div class="stats">
    <div class="stat"><b>{{result.dry}}</b><span>dry days</span></div>
    {{#result.days|sort:-high|first}}<div class="stat"><b>{{high|number}}{{result.unit}}</b><span>warmest, {{date|weekday}}</span></div>{{/result.days}}
    {{#result.days|sort:-rain|first}}<div class="stat"><b>{{rain|number}} {{result.rain_unit}}</b><span>wettest, {{date|weekday}}</span></div>{{/result.days}}
  </div>
  <div class="acts">
    {{^inputs.days|is:14 days}}<button type="button" class="n-btn" data-event="further">Look 14 days ahead</button>{{/inputs.days}}
    {{#inputs.units|is:Fahrenheit}}<button type="button" class="n-btn" data-event="units" data-v="Celsius">In °C</button>{{/inputs.units}}{{^inputs.units|is:Fahrenheit}}<button type="button" class="n-btn" data-event="units" data-v="Fahrenheit">In °F</button>{{/inputs.units}}
  </div>
</header>`,
      css:
        HERO_CSS +
        STATS_CSS +
        String.raw`
.now { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin: 6px 0 4px; }
.ic { font-size: 40px; line-height: 1; }
.now b { font-size: 40px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.sky { color: var(--n-muted); font-size: 15px; }
.sum { margin: 6px 0 14px; font-size: 15px; line-height: 1.55; } .sum p { margin: 0; }
.acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
`,
    },
    'wx-best': {
      description: 'One of the best days, and why',
      html: String.raw`<button type="button" class="bd" data-event="open_best"><b>{{date|weekday}}</b><span>{{why}}</span></button>`,
      css: String.raw`
.bd { display: flex; flex-direction: column; gap: 2px; max-width: 280px; padding: 9px 13px; border: 1px solid color-mix(in srgb, var(--n-ok) 40%, var(--n-line)); border-radius: var(--n-radius); background: color-mix(in srgb, var(--n-ok) 8%, var(--n-card)); color: inherit; font: inherit; text-align: left; }
.bd b { font-size: 14px; } .bd span { color: var(--n-muted); font-size: 13px; line-height: 1.4; }
`,
    },
    'wx-day': {
      description: 'A day in a tile: its sky, high and low, and the chance of rain; opens the day',
      html: String.raw`<button type="button" class="d" data-event="open_day"><span class="wd">{{date|weekday:short}}</span><span class="dn">{{date|shortdate}}</span><span class="ic" title="{{sky}}">{{icon}}</span><b>{{high|number}}°</b><span class="lo">{{low|number}}°</span><span class="rain">{{#chance}}💧 {{chance}}%{{/chance}}</span></button>`,
      css: String.raw`
.d { display: flex; flex-direction: column; align-items: center; gap: 1px; width: 74px; padding: 9px 4px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); color: inherit; font: inherit; }
.d:hover { border-color: var(--n-accent); }
.wd { font-weight: 600; font-size: 13px; } .dn { color: var(--n-muted); font-size: 11.5px; }
.ic { font-size: 26px; line-height: 1.25; } .d b { font-size: 16px; } .lo { color: var(--n-muted); font-size: 13px; }
.rain { min-height: 16px; color: var(--n-info); font-size: 11.5px; }
`,
    },
    'wx-hour': {
      description: 'An hour: its sky, temperature and chance of rain',
      html: String.raw`<div class="h"><span class="t">{{hour}}</span><span class="ic">{{icon}}</span><b>{{temp|number}}°</b><span class="p">{{#chance}}{{chance}}%{{/chance}}</span></div>`,
      css: String.raw`
.h { display: flex; flex-direction: column; align-items: center; width: 52px; padding: 6px 2px; border-radius: 10px; background: var(--n-soft); }
.t { color: var(--n-muted); font-size: 11.5px; } .ic { font-size: 19px; } .h b { font-size: 14px; } .p { min-height: 14px; color: var(--n-info); font-size: 11px; }
`,
    },
    'wx-day-detail': {
      description: 'One day on a page of its own',
      html: String.raw`<div class="dd">
  <p class="kicker">{{date|longdate}}</p>
  <h2>{{icon}} {{date|weekday}}: {{sky}}</h2>
  <div class="grid">
    <div><span>High and low</span><b>{{high|number}}° / {{low|number}}°</b></div>
    <div><span>Rain</span><b>{{rain|number}} {{result.rain_unit}}{{#chance}} · {{chance}}%{{/chance}}</b></div>
    <div><span>Wind</span><b>{{wind}} {{result.wind_unit}}</b></div>
    <div><span>UV index</span><b>{{uv|number}}</b></div>
    <div><span>Sunrise and sunset</span><b>{{sunrise}} · {{sunset}}</b></div>
    <div><span>Good to be out</span><b>{{score|number}} / 10</b></div>
  </div>
</div>`,
      css: String.raw`
.kicker { margin: 0; color: var(--n-accent); font-size: 12.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
h2 { margin: 4px 0 14px !important; font-size: 24px !important; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.grid div { padding: 11px 13px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.grid span { display: block; color: var(--n-muted); font-size: 12.5px; } .grid b { font-size: 16px; }
`,
    },
    'wx-wear': {
      description: 'What to wear or take, and what to watch out for',
      html: String.raw`<div class="w">
  {{#result.wear|count}}<h3>Wear or take</h3><ul class="wear">{{#result.wear}}<li>{{.}}</li>{{/result.wear}}</ul>{{/result.wear}}
  {{#result.alerts|count}}<h3>Watch out for</h3><ul class="alerts">{{#result.alerts}}<li>{{.}}</li>{{/result.alerts}}</ul>{{/result.alerts}}
  <div class="n-row"><button type="button" class="n-btn" data-event="copy">Copy the forecast</button><button type="button" class="n-btn" data-event="best_time">Best months to go</button></div>
</div>`,
      css: String.raw`
.w { padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
h3 { margin: 0 0 6px; font-size: 13px; color: var(--n-muted); }
ul { margin: 0 0 14px; padding: 0; list-style: none; display: grid; gap: 6px; }
li { position: relative; padding-left: 22px; font-size: 14.5px; line-height: 1.45; }
.wear li::before { content: "✓"; position: absolute; left: 0; color: var(--n-ok); font-weight: 700; }
.alerts li::before { content: "⚠"; position: absolute; left: 0; color: var(--n-warn); }
`,
    },
  },
  events: {
    open_day: [{ do: 'page', page: 'day', item: '{{item}}' }],
    open_best: [{ do: 'page', page: 'day', item: '{{result.days|where:date=$date|first}}' }],
    further: [{ do: 'again', confirm: 'Look 14 days ahead? It is a new run.', inputs: { days: '14 days' } }],
    units: [{ do: 'again', inputs: { units: '{{event.v}}' } }],
    copy: [{ do: 'copy', text: '{{result.place}}\n{{result.summary}}\n{{#result.days}}{{date}}: {{sky}}, {{high}}° / {{low}}°{{#chance}}, rain {{chance}}%{{/chance}}\n{{/result.days}}' }],
    best_time: [{ do: 'start', confirm: 'Find the best months to go to {{result.place}}? It is a run of its own.', app: 'tpl:best-time-to-visit', inputs: { place: '{{inputs.place}}', units: '{{inputs.units}}' } }],
  },
};

// ---- Best time to go --------------------------------------------------------------------------------------------

const BEST_TIME: AppUi = {
  pages: [
    {
      id: 'months',
      title: 'Month by month',
      blocks: [
        { element: 'bt-hero' },
        { title: 'How each month suits it (out of 100)', element: 'bt-strip', data: 'result.months' },
        { title: 'Highs and lows', element: 'plot', data: 'result.months', with: { kind: 'line', x: 'month', y: ['high', 'low'], height: 260 } },
        { title: 'Rainy days in the month', element: 'plot', data: 'result.months', width: 'half', with: { kind: 'bar', x: 'month', y: 'wet_days', height: 220 } },
        { title: 'Hours of sun a day', element: 'plot', data: 'result.months', width: 'half', with: { kind: 'bar', x: 'month', y: 'sun', height: 220 } },
      ],
    },
    {
      id: 'when',
      title: 'When to go',
      if: 'result.best',
      blocks: [
        { element: 'bt-month', data: 'result.best', each: true, layout: 'grid' },
        { element: 'bt-tips' },
      ],
    },
    { id: 'numbers', title: 'The numbers', blocks: [{ element: 'table', data: 'result.months', with: { columns: ['month', 'high', 'low', 'rain', 'wet_days', 'sun', 'snow_days', 'score'] } }] },
  ],
  elements: {
    'bt-hero': {
      description: 'The place with its picture across the top, what it is for, the best months and the summary; another kind of trip in a list',
      html: String.raw`<header class="hero">
  {{#result.picture|first}}<img class="ph" src="{{src}}" alt="{{result.place}}">{{/result.picture}}
  <p class="kicker">Best time to go · weather of {{result.years}}</p>
  <h1>{{result.place}}</h1>
  <label class="for">Best for
    <select data-event="for_what">
      <option value="City sightseeing"{{#inputs.for_what|is:City sightseeing}} selected{{/inputs.for_what}}>City sightseeing</option>
      <option value="Beach and sun"{{#inputs.for_what|is:Beach and sun}} selected{{/inputs.for_what}}>Beach and sun</option>
      <option value="Hiking"{{#inputs.for_what|is:Hiking}} selected{{/inputs.for_what}}>Hiking</option>
      <option value="Snow and skiing"{{#inputs.for_what|is:Snow and skiing}} selected{{/inputs.for_what}}>Snow and skiing</option>
      <option value="Escaping the heat"{{#inputs.for_what|is:Escaping the heat}} selected{{/inputs.for_what}}>Escaping the heat</option>
    </select>
  </label>
  {{#result.best|count}}<div class="best">{{#result.best}}<span>{{month}}</span>{{/result.best}}</div>{{/result.best}}
  <div class="sum">{{result.summary|markdown}}</div>
  <button type="button" class="n-btn" data-event="forecast">The forecast for the days ahead</button>
</header>`,
      css:
        HERO_CSS +
        String.raw`
.hero { overflow: hidden; }
.ph { display: block; width: calc(100% + 44px); max-width: none; height: clamp(150px, 26vw, 260px); margin: -20px -22px 16px; object-fit: cover; background: var(--n-soft); }
.for { display: inline-flex; align-items: center; gap: 8px; margin: 6px 0 10px; color: var(--n-muted); font-size: 13.5px; }
select { padding: 5px 8px; border: 1px solid var(--n-line); border-radius: 9px; background: var(--n-card); color: var(--n-fg); font: inherit; font-size: 14px; }
.best { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.best span { padding: 3px 12px; border-radius: 999px; background: var(--n-ok); color: var(--n-card); font-weight: 700; font-size: 14px; }
.sum { margin: 0 0 12px; font-size: 15px; line-height: 1.55; } .sum p { margin: 0; }
`,
    },
    'bt-strip': {
      description: 'The twelve months side by side, each as green as it suits the trip',
      html: String.raw`<div class="strip">{{#.}}<div class="m" style="--s: {{score}}%"><b>{{month}}</b><span>{{score}}</span></div>{{/.}}</div>`,
      css: String.raw`
.strip { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 4px; }
.m { display: flex; flex-direction: column; align-items: center; padding: 8px 0; border-radius: 8px; background: color-mix(in srgb, var(--n-ok) var(--s), var(--n-soft)); }
.m b { font-size: 12.5px; } .m span { font-size: 12px; opacity: .8; }
@media (max-width: 520px) { .strip { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
`,
    },
    'bt-month': {
      description: 'One of the best months, and why',
      html: String.raw`<div class="c"><span class="tag">{{@number}}</span><h3>{{month}}</h3><p>{{why}}</p></div>`,
      css: CARD,
    },
    'bt-tips': {
      description: 'The months to avoid, and tips for a visit',
      html: String.raw`<div class="t">{{#result.avoid|count}}<h3>Months to avoid</h3><ul>{{#result.avoid}}<li>{{.}}</li>{{/result.avoid}}</ul>{{/result.avoid}}{{#result.tips|count}}<h3>Tips</h3><ul>{{#result.tips}}<li>{{.}}</li>{{/result.tips}}</ul>{{/result.tips}}</div>`,
      css: String.raw`
.t { padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
h3 { margin: 0 0 6px; font-size: 13px; color: var(--n-muted); } ul { margin: 0 0 12px; padding-left: 20px; font-size: 14.5px; line-height: 1.5; }
`,
    },
  },
  events: {
    for_what: [{ do: 'again', confirm: 'Look again for this kind of trip? It is a new run.', inputs: { for_what: '{{event.value}}' } }],
    forecast: [{ do: 'start', app: 'tpl:weather-outlook', inputs: { place: '{{inputs.place}}', units: '{{inputs.units}}' } }],
  },
};

// ---- Team tracker -----------------------------------------------------------------------------------------------

const TEAM: AppUi = {
  pages: [
    {
      id: 'team',
      title: 'The team',
      blocks: [
        { element: 'tm-hero' },
        { element: 'tm-next', if: 'result.next_opponent' },
        { title: 'How it is doing', text: '{{result.summary}}', width: 'two-thirds' },
        { title: 'Latest results', element: 'tm-result', data: 'result.results', each: true, limit: 5, width: 'third', empty: 'No results found' },
      ],
    },
    {
      id: 'results',
      title: 'Results',
      if: 'result.results',
      blocks: [
        { title: 'Scored and conceded', element: 'plot', data: 'result.results', with: { kind: 'bar', x: 'date', y: ['scored', 'conceded'], height: 240 } },
        { element: 'tm-result', data: 'result.results', each: true },
      ],
    },
    { id: 'fixtures', title: 'Fixtures', if: 'result.fixtures', blocks: [{ element: 'tm-fixture', data: 'result.fixtures', each: true }] },
    { id: 'news', title: 'News', if: 'result.news', blocks: [{ element: 'tm-news', data: 'result.news', each: true, layout: 'grid' }] },
  ],
  elements: {
    'tm-hero': {
      description: 'The team: its badge, league and place in it, its form and record',
      html: String.raw`<header class="hero">
  <div class="top">{{#result.badge}}<img class="badge" src="{{result.badge}}" alt="">{{/result.badge}}<div><p class="kicker">{{result.sport}}{{#result.league}} · {{result.league}}{{/result.league}}</p><h1>{{result.team}}</h1>{{#result.position}}<p class="sub">{{result.position}}</p>{{/result.position}}</div></div>
  {{#result.form}}<div class="row"><span class="lab">Form</span><span class="form">{{#result.form|split: }}<span class="f f-{{.|lower}}">{{.}}</span>{{/result.form}}</span></div>{{/result.form}}
  <div class="stats">
    <div class="stat"><b>{{result.wins}}</b><span>won</span></div>
    <div class="stat"><b>{{result.draws}}</b><span>drawn</span></div>
    <div class="stat"><b>{{result.losses}}</b><span>lost</span></div>
  </div>
  <button type="button" class="n-btn again" data-event="refresh">Look again</button>
</header>`,
      css:
        HERO_CSS +
        STATS_CSS +
        FORM +
        String.raw`
.top { display: flex; align-items: center; gap: 14px; }
.badge { width: 64px; height: 64px; object-fit: contain; }
.row { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.lab { color: var(--n-muted); font-size: 13px; }
.again { margin-top: 14px; }
`,
    },
    'tm-next': {
      description: 'The next match: who, when and where, with a preview one click away',
      html: String.raw`<div class="nx">
  <div class="cd"><b>{{#result.next_days|is:0}}Today{{/result.next_days}}{{^result.next_days|is:0}}{{result.next_days}}{{/result.next_days}}</b><span>{{^result.next_days|is:0}}days to go{{/result.next_days}}</span></div>
  <div class="what"><p class="kicker">Next · {{result.next_competition}}</p><h3>{{#result.next_venue|is:Home}}vs {{/result.next_venue}}{{^result.next_venue|is:Home}}at {{/result.next_venue}}{{result.next_opponent}}</h3><p class="muted">{{result.next_date|date}}{{#result.next_time}} · {{result.next_time}}{{/result.next_time}}</p></div>
  <button type="button" class="n-btn n-primary" data-event="preview_next">Preview it</button>
</div>`,
      css: String.raw`
.nx { display: grid; grid-template-columns: auto 1fr auto; gap: 16px; align-items: center; padding: 14px 16px; border: 1px solid color-mix(in srgb, var(--n-accent) 40%, var(--n-line)); border-radius: var(--n-radius); background: var(--n-accent-soft); }
.cd { display: flex; flex-direction: column; align-items: center; min-width: 64px; } .cd b { font-size: 26px; line-height: 1.1; } .cd span { color: var(--n-muted); font-size: 12px; }
.kicker { margin: 0; color: var(--n-accent); font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
h3 { margin: 2px 0; font-size: 17px; } .muted { margin: 0; color: var(--n-muted); font-size: 13.5px; }
@media (max-width: 520px) { .nx { grid-template-columns: auto 1fr; } .nx .n-btn { grid-column: 1 / -1; } }
`,
    },
    'tm-result': {
      description: 'A result: when, against whom, the score and whether it was won',
      html: String.raw`<div class="r"><span class="f f-{{result|lower}}">{{result}}</span><p>{{#venue|is:Home}}vs{{/venue}}{{^venue|is:Home}}at{{/venue}} {{opponent}}<small>{{date|date}}{{#competition}} · {{competition}}{{/competition}}</small></p><b class="score">{{score}}</b></div>`,
      css: ROW + FORM + String.raw`.score { font-size: 16px; font-variant-numeric: tabular-nums; }`,
    },
    'tm-fixture': {
      description: 'A match to come: when, against whom, where; with its preview',
      html: String.raw`<div class="r"><div class="when"><b>{{date|day}}</b>{{date|month}}</div><p>{{#venue|is:Home}}vs{{/venue}}{{^venue|is:Home}}at{{/venue}} {{opponent}}<small>{{date|weekday}}{{#time}} · {{time}}{{/time}}{{#competition}} · {{competition}}{{/competition}}</small></p><button type="button" class="b" data-event="preview">Preview</button></div>`,
      css: ROW,
    },
    'tm-news': {
      description: 'A news story, with its source',
      html: String.raw`<a class="c" href="{{url}}" target="_blank" rel="noopener noreferrer"><span class="muted">{{source}}{{#date}} · {{date}}{{/date}}</span><h3>{{title}}</h3><p>{{gist}}</p></a>`,
      css: CARD + String.raw`a.c { text-decoration: none; }`,
    },
  },
  events: {
    refresh: [{ do: 'again', confirm: 'Look up the team again? It is a new run.', inputs: {} }],
    preview_next: [{ do: 'start', app: 'tpl:match-preview', inputs: { team: '{{result.team}}', opponent: '{{result.next_opponent}}', competition: '{{result.next_competition}}' } }],
    preview: [{ do: 'start', app: 'tpl:match-preview', inputs: { team: '{{result.team}}', opponent: '{{opponent}}', competition: '{{competition}}' } }],
  },
};

// ---- Match preview ----------------------------------------------------------------------------------------------

const MATCH: AppUi = {
  pages: [
    {
      id: 'preview',
      title: 'Preview',
      blocks: [
        { element: 'mp-hero' },
        { element: 'mp-odds', if: 'result.chances' },
        { title: 'What to expect', text: '{{result.summary}}', width: 'two-thirds' },
        { title: 'What to watch', element: 'list', data: 'result.keys', width: 'third', if: 'result.keys' },
      ],
    },
    {
      id: 'form',
      title: 'Form and meetings',
      blocks: [
        { element: 'mp-form' },
        { title: 'Who won their last meetings', element: 'plot', data: 'result.tally', width: 'half', if: 'result.meetings', with: { kind: 'donut', x: 'who', y: 'wins', height: 240 } },
        { title: 'Last meetings', element: 'table', data: 'result.meetings', width: 'half', if: 'result.meetings' },
      ],
    },
    { id: 'news', title: 'Team news', blocks: [{ element: 'mp-news' }] },
  ],
  elements: {
    'mp-hero': {
      description: 'The two teams, when and where they meet, and the likely result',
      html: String.raw`<header class="hero">
  <p class="kicker">{{result.competition|or:Match preview}}{{#result.when}} · {{result.when}}{{/result.when}}</p>
  <div class="vs">
    <div class="t">{{#result.team_badge}}<img src="{{result.team_badge}}" alt="">{{/result.team_badge}}<b>{{result.team}}</b></div>
    <span class="x">vs</span>
    <div class="t">{{#result.opponent_badge}}<img src="{{result.opponent_badge}}" alt="">{{/result.opponent_badge}}<b>{{result.opponent}}</b></div>
  </div>
  {{#result.venue}}<p class="sub">{{result.venue}}</p>{{/result.venue}}
  {{#result.prediction}}<p class="pred">Prediction: <b>{{result.prediction}}</b></p>{{/result.prediction}}
</header>`,
      css:
        HERO_CSS +
        String.raw`
.vs { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; margin: 12px 0 8px; text-align: center; }
.t { display: flex; flex-direction: column; align-items: center; gap: 6px; } .t img { width: 64px; height: 64px; object-fit: contain; } .t b { font-size: 18px; }
.x { color: var(--n-muted); font-size: 14px; font-weight: 600; text-transform: uppercase; }
.sub { text-align: center; } .pred { margin: 10px 0 0; text-align: center; font-size: 15px; }
`,
    },
    'mp-odds': {
      description: 'The chances of each result, as one bar',
      html: String.raw`<div class="odds">
  <div class="bar">{{#result.team_pct}}<span class="a" style="flex: {{result.team_pct}}">{{result.team_pct}}%</span>{{/result.team_pct}}{{#result.draw_pct}}<span class="d" style="flex: {{result.draw_pct}}">{{result.draw_pct}}%</span>{{/result.draw_pct}}{{#result.opponent_pct}}<span class="b" style="flex: {{result.opponent_pct}}">{{result.opponent_pct}}%</span>{{/result.opponent_pct}}</div>
  <div class="keys"><span><i class="a"></i>{{result.team}} wins</span>{{#result.draw_pct}}<span><i class="d"></i>Draw</span>{{/result.draw_pct}}<span><i class="b"></i>{{result.opponent}} wins</span></div>
</div>`,
      css: String.raw`
.bar { display: flex; gap: 3px; height: 34px; border-radius: 10px; overflow: hidden; }
.bar span { display: grid; place-items: center; min-width: 40px; color: var(--n-card); font-size: 13px; font-weight: 700; }
.a { background: var(--n-accent); } .d { background: var(--n-muted); } .b { background: var(--n-warn); }
.keys { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; color: var(--n-muted); font-size: 13px; }
.keys i { display: inline-block; width: 10px; height: 10px; margin-right: 6px; border-radius: 3px; }
`,
    },
    'mp-form': {
      description: 'Each team’s last five results',
      html: String.raw`<div class="two">
  <div class="side"><b>{{result.team}}</b>{{#result.team_form}}<span class="form">{{#result.team_form|split: }}<span class="f f-{{.|lower}}">{{.}}</span>{{/result.team_form}}</span>{{/result.team_form}}{{^result.team_form}}<span class="muted">Not found</span>{{/result.team_form}}</div>
  <div class="side"><b>{{result.opponent}}</b>{{#result.opponent_form}}<span class="form">{{#result.opponent_form|split: }}<span class="f f-{{.|lower}}">{{.}}</span>{{/result.opponent_form}}</span>{{/result.opponent_form}}{{^result.opponent_form}}<span class="muted">Not found</span>{{/result.opponent_form}}</div>
</div>`,
      css:
        FORM +
        String.raw`
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.side { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.muted { color: var(--n-muted); font-size: 13px; }
`,
    },
    'mp-news': {
      description: 'Each side’s team news, to copy, with the team’s tracker one click away',
      html: String.raw`<div class="two">
  <section><h3>{{result.team}}</h3>{{#result.team_news|count}}<ul>{{#result.team_news}}<li>{{.}}</li>{{/result.team_news}}</ul>{{/result.team_news}}{{^result.team_news}}<p class="muted">No news found</p>{{/result.team_news}}</section>
  <section><h3>{{result.opponent}}</h3>{{#result.opponent_news|count}}<ul>{{#result.opponent_news}}<li>{{.}}</li>{{/result.opponent_news}}</ul>{{/result.opponent_news}}{{^result.opponent_news}}<p class="muted">No news found</p>{{/result.opponent_news}}</section>
</div>
<div class="n-row acts"><button type="button" class="n-btn" data-event="copy">Copy the preview</button><button type="button" class="n-btn" data-event="track">Follow {{result.team}}</button></div>`,
      css: String.raw`
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
section { padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
h3 { margin: 0 0 8px; font-size: 15px; } ul { margin: 0; padding-left: 18px; font-size: 14.5px; line-height: 1.5; } .muted { margin: 0; color: var(--n-muted); font-size: 13.5px; }
.acts { margin-top: 12px; }
`,
    },
  },
  events: {
    copy: [{ do: 'copy', text: '{{result.team}} vs {{result.opponent}}{{#result.when}}, {{result.when}}{{/result.when}}\n{{result.summary}}\n{{#result.prediction}}Prediction: {{result.prediction}}{{/result.prediction}}' }],
    track: [{ do: 'start', app: 'tpl:team-tracker', inputs: { team: '{{result.team}}', sport: '{{inputs.competition}}' } }],
  },
};

// ---- Cook with what you have ------------------------------------------------------------------------------------

const FRIDGE: AppUi = {
  pages: [
    {
      id: 'recipes',
      title: 'Recipes',
      blocks: [
        { element: 'fr-hero' },
        { element: 'fr-card', data: 'result.recipes', each: true, layout: 'grid', empty: 'No recipe uses these' },
      ],
    },
    {
      id: 'recipe',
      title: 'Recipe',
      tab: false,
      blocks: [
        { element: 'fr-detail', data: 'page.item' },
        { title: 'How long each step takes', element: 'fr-strip', data: 'result.steps', where: { recipe: '{{page.item.name}}' } },
        { title: 'Steps', element: 'fr-step', data: 'result.steps', each: true, where: { recipe: '{{page.item.name}}' }, width: 'two-thirds' },
        { title: 'Ingredients', element: 'fr-ing', data: 'result.ingredients', each: true, where: { recipe: '{{page.item.name}}' }, width: 'third' },
        { element: 'video', data: 'page.item.video' },
      ],
    },
    { id: 'buy', title: 'What to buy', if: 'result.shopping', blocks: [{ title: 'What the first three need that you lack', element: 'checklist', data: 'result.shopping' }, { element: 'fr-copy' }] },
  ],
  elements: {
    'fr-hero': {
      description: 'What you have, and what came of it',
      html: String.raw`<header class="hero">
  <p class="kicker">Cook with what you have{{^inputs.diet|is:Anything}} · {{inputs.diet}}{{/inputs.diet}}{{^inputs.time|is:Any}} · {{inputs.time}}{{/inputs.time}}</p>
  <h1>{{result.summary}}</h1>
  <p class="sub">{{inputs.have|short:160}}</p>
  {{#result.tip}}<p class="tip">💡 {{result.tip}}</p>{{/result.tip}}
  {{^inputs.time|is:Under 30 minutes}}<button type="button" class="n-btn" data-event="quicker">Something quicker</button>{{/inputs.time}}
</header>`,
      css: HERO_CSS + String.raw`.hero h1 { font-size: 20px !important; } .tip { margin: 12px 0; font-size: 14px; } .n-btn { margin-top: 12px; }`,
    },
    'fr-card': {
      description: 'A recipe: its photo, what it uses of yours and what is missing, how long it takes',
      html: String.raw`<button type="button" class="c" data-event="open">
  {{#picture}}<img class="pic" src="{{picture}}" alt="" loading="lazy">{{/picture}}
  <h3>{{name}}</h3>
  <p class="muted">{{area}}{{#minutes}} · {{minutes}} min{{/minutes}}{{#difficulty}} · {{difficulty}}{{/difficulty}}{{^fits}} · longer than you have{{/fits}}</p>
  <p><b class="ok">Uses {{uses}} of yours</b>{{#missing}} · <span class="miss">needs {{missing}} more</span>{{/missing}}</p>
  {{#missing_list}}<p class="muted">{{missing_list|short:90}}</p>{{/missing_list}}
</button>`,
      css: CARD + PIC + String.raw`.ok { color: var(--n-ok); } .miss { color: var(--n-warn); }`,
    },
    'fr-detail': {
      description: 'A recipe on a page of its own: its photo, what it uses and needs, a link to it, a copy of its steps',
      html: String.raw`<div class="dt">
  {{#picture}}<img class="pic" src="{{picture}}" alt="">{{/picture}}
  <div><p class="kicker">{{area}}{{#minutes}} · {{minutes}} min{{/minutes}}{{#difficulty}} · {{difficulty}}{{/difficulty}}</p><h2>{{name}}</h2>
  <p><b>Uses of yours:</b> {{uses_list|or:nothing}}</p>{{#missing_list}}<p><b>You would need:</b> {{missing_list}}</p>{{/missing_list}}
  <div class="n-row">{{#link}}<a class="n-btn" href="{{link}}" target="_blank" rel="noopener noreferrer">The recipe ↗</a>{{/link}}<button type="button" class="n-btn" data-event="copy_recipe">Copy the steps</button></div></div>
</div>`,
      css:
        PIC +
        String.raw`
.dt { display: grid; grid-template-columns: minmax(0, 240px) 1fr; gap: 18px; align-items: start; }
.kicker { margin: 0; color: var(--n-accent); font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
h2 { margin: 4px 0 10px !important; font-size: 24px !important; } p { margin: 0 0 8px; font-size: 14.5px; line-height: 1.5; }
@media (max-width: 560px) { .dt { grid-template-columns: 1fr; } }
`,
    },
    'fr-strip': {
      description: 'The recipe as one strip, each step as wide as its minutes',
      html: String.raw`<div class="strip">{{#.}}<span class="seg c{{@number}}" style="flex: {{minutes|or:1}}" title="{{minutes}} min · {{step}}">{{minutes}}′</span>{{/.}}</div><div class="scale"><span>0′</span><span>{{.|sum:minutes}}′</span></div>`,
      css: String.raw`
.strip { display: flex; gap: 3px; height: 30px; }
.seg { display: grid; place-items: center; min-width: 22px; border-radius: 7px; background: var(--n-c1); color: var(--n-bg); font-size: 12px; overflow: hidden; }
.c2, .c8 { background: var(--n-c2); } .c3, .c9 { background: var(--n-c3); } .c4, .c10 { background: var(--n-c4); } .c5, .c11 { background: var(--n-c5); } .c6, .c12 { background: var(--n-c6); }
.scale { display: flex; justify-content: space-between; margin-top: 4px; color: var(--n-muted); font-size: 12px; }
`,
    },
    'fr-step': {
      description: 'A step, numbered, with its minutes; ticked off as you cook',
      html: String.raw`<div class="st{{#state.done.@key}} done{{/state.done.@key}}"><button type="button" class="tick" data-event="done" title="Done">✓</button><p>{{step}}</p><span class="min">{{#minutes}}{{minutes}} min{{/minutes}}</span></div>`,
      css: String.raw`
.st { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 10px 12px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.tick { width: 26px; height: 26px; border: 1.5px solid var(--n-line); border-radius: 8px; background: none; color: transparent; font: inherit; font-size: 13px; }
.done .tick { border-color: var(--n-ok); background: var(--n-ok); color: var(--n-card); } .done p { color: var(--n-muted); text-decoration: line-through; }
p { margin: 2px 0 0; font-size: 14.5px; line-height: 1.5; } .min { color: var(--n-muted); font-size: 12.5px; white-space: nowrap; }
`,
    },
    'fr-ing': {
      description: 'An ingredient and its amount, marked when you have it',
      html: String.raw`<span class="i{{#have}} have{{/have}}">{{#have}}✓ {{/have}}{{item}}{{#amount}} <small>{{amount}}</small>{{/amount}}</span>`,
      css: String.raw`.i { display: inline-block; padding: 4px 10px; border: 1px solid var(--n-line); border-radius: 999px; font-size: 13.5px; } .have { border-color: color-mix(in srgb, var(--n-ok) 50%, var(--n-line)); color: var(--n-ok); } small { color: var(--n-muted); }`,
    },
    'fr-copy': {
      description: 'Copies what to buy',
      html: String.raw`<button type="button" class="n-btn" data-event="copy_list">Copy the list</button>`,
    },
  },
  events: {
    open: [{ do: 'page', page: 'recipe', item: '{{item}}' }],
    done: [{ do: 'toggle', name: 'done.@key', keep: true }],
    quicker: [{ do: 'again', confirm: 'Look for recipes under 30 minutes? It is a new run.', inputs: { time: 'Under 30 minutes' } }],
    copy_recipe: [{ do: 'copy', text: '{{name}}\n{{#result.steps|where:recipe=$name}}{{n}}. {{step}}{{#minutes}} ({{minutes}} min){{/minutes}}\n{{/result.steps}}' }],
    copy_list: [{ do: 'copy', text: '{{result.shopping|join:\n}}' }],
  },
};

// ---- Meal plan and shopping list --------------------------------------------------------------------------------

const MEALS: AppUi = {
  pages: [
    { id: 'week', title: 'The week', blocks: [{ element: 'ml-hero' }, { element: 'ml-day', data: 'result.days', each: true, layout: 'grid', empty: 'No dinners planned' }] },
    { id: 'dinner', title: 'Dinner', tab: false, blocks: [{ element: 'ml-detail', data: 'page.item' }, { element: 'video', data: 'page.item.video' }] },
    {
      id: 'list',
      title: 'Shopping list',
      if: 'result.shopping',
      blocks: [
        { element: 'ml-aisles' },
        { element: 'ml-item', data: 'result.shopping', each: true, where: { aisle: '{{state.aisle}}' } },
      ],
    },
    { id: 'tips', title: 'Tips', if: 'result.tips', blocks: [{ title: 'The week', text: '{{result.overview}}' }, { title: 'Tips', element: 'list', data: 'result.tips' }] },
  ],
  elements: {
    'ml-hero': {
      description: 'The week in numbers',
      html: String.raw`<header class="hero">
  <p class="kicker">Meal plan · for {{inputs.people}}{{^inputs.diet|is:Anything}} · {{inputs.diet}}{{/inputs.diet}}</p>
  <h1>{{result.overview}}</h1>
  <div class="stats">
    <div class="stat"><b>{{result.days|count}}</b><span>dinners</span></div>
    <div class="stat"><b>{{result.shopping|where:staple!=true|count}}</b><span>things to buy</span></div>
    <div class="stat"><b>{{result.days|unique:area|count}}</b><span>cuisines</span></div>
  </div>
  <button type="button" class="n-btn again" data-event="again">Plan another week</button>
</header>`,
      css: HERO_CSS + STATS_CSS + String.raw`.hero h1 { font-size: 20px !important; } .again { margin-top: 14px; }`,
    },
    'ml-day': {
      description: 'A dinner on its day, with its photo',
      html: String.raw`<button type="button" class="c" data-event="open">{{#picture}}<img class="pic" src="{{picture}}" alt="" loading="lazy">{{/picture}}<span class="tag">{{date|weekday}}</span><h3>{{meal}}</h3><p class="muted">{{area}}{{#category}} · {{category}}{{/category}}</p>{{#why}}<p>{{why}}</p>{{/why}}</button>`,
      css: CARD + PIC,
    },
    'ml-detail': {
      description: 'A dinner on a page of its own: what goes in it and how to make it',
      html: String.raw`<div class="dt">
  <p class="kicker">{{date|weekday}}, {{date|longdate}} · {{area}}</p><h2>{{meal}}</h2>
  <div class="two">
    <section><h3>Ingredients</h3><p>{{ingredients|lines}}</p></section>
    <section><h3>Method</h3><p>{{method|lines}}</p>{{#link}}<a class="n-btn" href="{{link}}" target="_blank" rel="noopener noreferrer">The recipe ↗</a>{{/link}}</section>
  </div>
</div>`,
      css: String.raw`
.kicker { margin: 0; color: var(--n-accent); font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
h2 { margin: 4px 0 12px !important; font-size: 24px !important; }
.two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 12px; }
section { padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
h3 { margin: 0 0 8px; font-size: 13px; color: var(--n-muted); } p { margin: 0 0 10px; font-size: 14.5px; line-height: 1.55; }
@media (max-width: 600px) { .two { grid-template-columns: 1fr; } }
`,
    },
    'ml-aisles': {
      description: 'The aisles, to show one’s things; a copy of the list',
      html: String.raw`<div class="bar"><div class="chips">
  {{#state.aisle}}<button type="button" class="chip" data-event="aisle" data-name="">All aisles</button>{{/state.aisle}}{{^state.aisle}}<span class="chip on">All aisles</span>{{/state.aisle}}
  {{#result.shopping|unique:aisle}}<button type="button" class="chip{{#.|is:$state.aisle}} on{{/.}}" data-event="aisle" data-name="{{.}}">{{.}}</button>{{/result.shopping}}
</div><button type="button" class="n-btn" data-event="copy_list">Copy the list</button></div>`,
      css: CHIPS_CSS + String.raw`.bar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; }`,
    },
    'ml-item': {
      description: 'A thing to buy: how much, for which dinners; ticked off as you shop',
      html: String.raw`<div class="it{{#state.got.@key}} got{{/state.got.@key}}{{#staple}} staple{{/staple}}"><button type="button" class="tick" data-event="got" title="Got it">✓</button><p>{{item}}{{#amount}} <b>{{amount}}</b>{{/amount}}<small>{{aisle}} · {{meals|short:80}}{{#staple}} · probably in the cupboard{{/staple}}</small></p></div>`,
      css: String.raw`
.it { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; padding: 9px 12px; border-bottom: 1px solid var(--n-line); }
.tick { width: 24px; height: 24px; border: 1.5px solid var(--n-line); border-radius: 7px; background: none; color: transparent; font: inherit; font-size: 12px; }
.got .tick { border-color: var(--n-ok); background: var(--n-ok); color: var(--n-card); } .got p { color: var(--n-muted); text-decoration: line-through; }
.staple { opacity: .7; } p { margin: 1px 0 0; font-size: 14.5px; } small { display: block; color: var(--n-muted); font-size: 12.5px; }
`,
    },
  },
  events: {
    open: [{ do: 'page', page: 'dinner', item: '{{item}}' }],
    aisle: [{ do: 'set', name: 'aisle', value: '{{event.name}}' }],
    got: [{ do: 'toggle', name: 'got.@key', keep: true }],
    copy_list: [{ do: 'copy', text: '{{#result.shopping|where:staple!=true}}- {{item}}{{#amount}} ({{amount}}){{/amount}}\n{{/result.shopping}}' }],
    again: [{ do: 'again', confirm: 'Plan another week with the same answers? It is a new run.', inputs: {} }],
  },
};

// ---- Gift ideas -------------------------------------------------------------------------------------------------

const GIFTS: AppUi = {
  pages: [
    {
      id: 'ideas',
      title: 'Ideas',
      blocks: [
        { element: 'gf-hero' },
        { element: 'gf-kinds' },
        { element: 'gf-card', data: 'result.ideas', each: true, layout: 'grid', where: { kind: '{{state.kind}}' }, empty: 'No ideas' },
      ],
    },
    {
      id: 'prices',
      title: 'By price',
      if: 'result.ideas',
      blocks: [
        { title: 'Price ranges', element: 'plot', data: 'result.ideas', with: { kind: 'hbar', x: 'idea', y: ['low', 'high'], height: 320 } },
        { element: 'table', data: 'result.ideas', with: { columns: ['idea', 'kind', 'low', 'high', 'example', 'price', 'shop'] } },
      ],
    },
  ],
  elements: {
    'gf-hero': {
      description: 'Who it is for, and the thinking behind the ideas',
      html: String.raw`<header class="hero"><p class="kicker">Gift ideas{{#inputs.occasion}} · {{inputs.occasion}}{{/inputs.occasion}}{{#inputs.budget}} · {{inputs.budget}}{{/inputs.budget}}</p><h1>{{inputs.who|short:140}}</h1><p class="sub">{{result.summary}}</p></header>`,
      css: HERO_CSS,
    },
    'gf-kinds': {
      description: 'The kinds of gift, to show one kind',
      html: String.raw`<div class="chips">{{#state.kind}}<button type="button" class="chip" data-event="kind" data-name="">All</button>{{/state.kind}}{{^state.kind}}<span class="chip on">All</span>{{/state.kind}}{{#result.ideas|unique:kind}}<button type="button" class="chip{{#.|is:$state.kind}} on{{/.}}" data-event="kind" data-name="{{.}}">{{.}}</button>{{/result.ideas}}</div>`,
      css: CHIPS_CSS,
    },
    'gf-card': {
      description: 'An idea: its picture, why it suits them, its price, one to buy, a star to keep it',
      html: String.raw`<div class="c{{^fits}} over{{/fits}}">
  {{#picture}}<img class="pic" src="{{picture}}" alt="" loading="lazy">{{/picture}}
  <span class="tag">{{kind}}</span><h3>{{idea}}</h3><p>{{why}}</p>
  <p class="muted">{{#low}}{{result.currency}}{{low|number}}–{{high|number}}{{/low}}{{^fits}} · over the budget{{/fits}}</p>
  {{#example}}<p class="ex">{{example}}{{#price}} · <b>{{result.currency}}{{price|number}}</b>{{/price}}{{#shop}} · {{shop}}{{/shop}}</p>{{/example}}
  <div class="foot">{{#link}}<a class="b" href="{{link}}" target="_blank" rel="noopener noreferrer">See it ↗</a>{{/link}}<button type="button" class="b{{#state.star.@key}} on{{/state.star.@key}}" data-event="star">{{#state.star.@key}}★ Kept{{/state.star.@key}}{{^state.star.@key}}☆ Keep{{/state.star.@key}}</button><button type="button" class="b" data-event="more">More like this</button></div>
</div>`,
      css: CARD + PIC + String.raw`.over { opacity: .75; } .ex { padding: 8px 10px; border-radius: 9px; background: var(--n-soft); font-size: 13.5px !important; }`,
    },
  },
  events: {
    kind: [{ do: 'set', name: 'kind', value: '{{event.name}}' }],
    star: [{ do: 'toggle', name: 'star.@key', keep: true }],
    more: [{ do: 'again', confirm: 'Find more ideas like “{{idea}}”? It is a new run.', inputs: { who: '{{inputs.who}}\nMore ideas like: {{idea}}' } }],
  },
};

// ---- What to watch ----------------------------------------------------------------------------------------------

const WATCH: AppUi = {
  pages: [
    { id: 'tonight', title: 'Tonight', blocks: [{ element: 'wt-hero' }, { element: 'wt-card', data: 'result.picks', each: true, layout: 'grid', empty: 'Nothing found' }] },
    { id: 'pick', title: 'Pick', tab: false, blocks: [{ element: 'wt-detail', data: 'page.item' }, { element: 'video', data: 'page.item.video' }] },
    {
      id: 'all',
      title: 'Side by side',
      if: 'result.picks',
      blocks: [
        { title: 'How long each is, in minutes', element: 'plot', data: 'result.picks', with: { kind: 'hbar', x: 'title', y: 'minutes', height: 260 } },
        { element: 'table', data: 'result.picks', with: { columns: ['title', 'year', 'kind', 'genre', 'minutes', 'rating', 'where'] } },
      ],
    },
  ],
  elements: {
    'wt-hero': {
      description: 'Tonight’s pick, and why',
      html: String.raw`<header class="hero"><p class="kicker">Tonight{{#inputs.services}} · {{inputs.services}}{{/inputs.services}}</p><h1>{{result.tonight}}</h1><p class="sub">In the mood for {{inputs.mood|short:120}}</p></header>`,
      css: HERO_CSS + String.raw`.hero h1 { font-size: 21px !important; }`,
    },
    'wt-card': {
      description: 'A film or show: its picture (with a mark when it has a trailer), where it streams, how long, why it fits',
      html: String.raw`<button type="button" class="c" data-event="open">
  {{#picture}}<span class="shot"><img class="pic" src="{{picture}}" alt="" loading="lazy">{{#video}}<i class="play" aria-label="Trailer">▶</i>{{/video}}</span>{{/picture}}
  <span class="tag">{{kind}}{{#year}} · {{year}}{{/year}}</span><h3>{{title}}</h3>
  <p class="muted">{{genre}}{{#minutes}} · {{minutes}} min{{/minutes}}{{#rating}} · ★ {{rating}}{{/rating}}</p>
  <p>{{why}}</p>
  {{#where}}<p class="where{{#on_yours}} yours{{/on_yours}}">▶ {{where}}</p>{{/where}}
</button>`,
      css: CARD + PIC + PLAY + String.raw`.where { font-size: 13px !important; color: var(--n-muted); } .yours { color: var(--n-ok) !important; font-weight: 600; }`,
    },
    'wt-detail': {
      description: 'One pick on a page of its own, with a link to more and a way to rule it out (its trailer plays below)',
      html: String.raw`<div class="dt">{{#picture}}<img class="pic tall" src="{{picture}}" alt="">{{/picture}}<div>
  <p class="kicker">{{kind}}{{#year}} · {{year}}{{/year}} · {{genre}}</p><h2>{{title}}</h2>
  <p>{{why}}</p>{{#where}}<p><b>Where to watch:</b> {{where}}</p>{{/where}}
  <div class="n-row">{{#link}}<a class="n-btn" href="{{link}}" target="_blank" rel="noopener noreferrer">More about it ↗</a>{{/link}}<button type="button" class="n-btn" data-event="other">Seen it: pick again</button></div>
</div></div>`,
      css:
        PIC +
        String.raw`
.dt { display: grid; grid-template-columns: minmax(0, 200px) 1fr; gap: 18px; align-items: start; }
.kicker { margin: 0; color: var(--n-accent); font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
h2 { margin: 4px 0 10px !important; font-size: 24px !important; } p { margin: 0 0 10px; font-size: 15px; line-height: 1.5; }
@media (max-width: 560px) { .dt { grid-template-columns: 1fr; } }
`,
    },
  },
  events: {
    open: [{ do: 'page', page: 'pick', item: '{{item}}' }],
    other: [{ do: 'again', confirm: 'Pick again without “{{title}}”? It is a new run.', inputs: { seen: '{{inputs.seen}}\n{{title}}' } }],
  },
};

// ---- Game finder ------------------------------------------------------------------------------------------------

const GAMES: AppUi = {
  pages: [
    { id: 'games', title: 'Games', blocks: [{ element: 'gm-hero' }, { element: 'gm-card', data: 'result.games', each: true, layout: 'grid', empty: 'No games found' }] },
    { id: 'game', title: 'Game', tab: false, blocks: [{ element: 'gm-detail', data: 'page.item' }, { element: 'video', data: 'page.item.video' }] },
    {
      id: 'prices',
      title: 'Prices',
      if: 'result.games|sum:price',
      blocks: [
        { title: 'Best price now, and lowest ever ($)', element: 'plot', data: 'result.games', with: { kind: 'bar', x: 'title', y: ['price', 'lowest'], height: 260 } },
        { element: 'table', data: 'result.games', with: { columns: ['title', 'price', 'lowest', 'store'] } },
      ],
    },
    { id: 'time', title: 'Time to finish', if: 'result.games|sum:hours', blocks: [{ title: 'Hours for the main part', element: 'plot', data: 'result.games', with: { kind: 'hbar', x: 'title', y: 'hours', height: 280 } }] },
  ],
  elements: {
    'gm-hero': {
      description: 'What you like, and the picks in a line',
      html: String.raw`<header class="hero"><p class="kicker">Game finder · {{inputs.platform}}{{^inputs.when|is:Out now}} · {{inputs.when}}{{/inputs.when}}{{^inputs.budget|is:Any price}} · {{inputs.budget}}{{/inputs.budget}}</p><p class="lead">{{result.summary}}</p>{{#inputs.likes}}<p class="sub">{{inputs.likes|short:140}}</p>{{/inputs.likes}}</header>`,
      // The summary names every pick: a lead to read, not a headline.
      css: HERO_CSS + String.raw`.lead { margin: 8px 0 4px; font-size: 16.5px; font-weight: 500; line-height: 1.5; }`,
    },
    'gm-card': {
      description: 'A game: its picture (with a mark when it has a trailer), when it comes out or why it fits, how long it takes and its price',
      html: String.raw`<button type="button" class="c" data-event="open">
  {{#picture}}<span class="shot"><img class="pic" src="{{picture}}" alt="" loading="lazy">{{#video}}<i class="play" aria-label="Trailer">▶</i>{{/video}}</span>{{/picture}}
  <span class="tags"><span class="tag">{{genre}}</span>{{#coming}}<span class="tag soon">{{#out}}Coming {{out}}{{/out}}{{^out}}Coming soon{{/out}}</span>{{/coming}}</span><h3>{{title}}{{#year}} <small>{{year}}</small>{{/year}}</h3>
  <p>{{why}}</p>
  <p class="muted">{{platforms}}{{#hours}} · about {{hours}} h{{/hours}}</p>
  <p class="price">{{#free}}<b>Free to play</b>{{/free}}{{^free}}{{#price}}<b>&#36;{{price}}</b> at {{store}}{{#lowest}} · lowest ever &#36;{{lowest}}{{/lowest}}{{/price}}{{/free}}</p>
</button>`,
      css:
        CARD +
        PIC +
        PLAY +
        String.raw`small { color: var(--n-muted); font-weight: 400; } .price { font-size: 13.5px !important; } .price:empty { display: none; } .price b { color: var(--n-ok); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; } .tag { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .tag.soon { background: none; box-shadow: inset 0 0 0 1px var(--n-accent); }
.pic { object-position: center top; }`,
    },
    'gm-detail': {
      description: 'A game on a page of its own, with when it comes out, its deal and a search for more like it (its trailer plays below)',
      html: String.raw`<div class="dt">{{#picture}}<img class="pic" src="{{picture}}" alt="">{{/picture}}
  <p class="kicker">{{genre}}{{#year}} · {{year}}{{/year}}{{#coming}}{{#out}} · coming {{out}}{{/out}}{{^out}} · coming soon{{/out}}{{/coming}}</p><h2>{{title}}</h2><p>{{why}}</p>
  <p class="muted">Plays on {{platforms}}{{#hours}} · about {{hours}} hours{{/hours}}</p>
  <div class="n-row">{{#deal}}<a class="n-btn n-primary" href="{{deal}}" target="_blank" rel="noopener noreferrer">&#36;{{price}} at {{store}} ↗</a>{{/deal}}<button type="button" class="n-btn" data-event="more">More like this</button></div>
</div>`,
      css: PIC + String.raw`.dt { max-width: 640px; } .dt .pic { width: auto; max-width: 100%; height: auto; max-height: 440px; aspect-ratio: auto; object-fit: contain; } .kicker { margin: 12px 0 0; color: var(--n-accent); font-size: 12.5px; font-weight: 600; text-transform: uppercase; } h2 { margin: 4px 0 8px !important; font-size: 24px !important; } p { font-size: 15px; line-height: 1.5; } .muted { color: var(--n-muted); font-size: 14px; }`,
    },
  },
  events: {
    open: [{ do: 'page', page: 'game', item: '{{item}}' }],
    more: [{ do: 'again', confirm: 'Find more games like “{{title}}”? It is a new run.', inputs: { likes: 'Games like {{title}}' } }],
  },
};

// ---- Quiz on any topic ------------------------------------------------------------------------------------------

/** An answer to pick (before one is picked), or the answer as it turned out (after). */
const option = (k: string) =>
  String.raw`{{^state.pick.@key}}<button type="button" class="o" data-event="pick" data-v="${k}"><i>${k}</i>{{${k.toLowerCase()}}}</button>{{/state.pick.@key}}{{#state.pick.@key}}<div class="o{{#answer|is:${k}}} right{{/answer}}{{#state.pick.@key|is:${k}}} picked{{/state.pick.@key}}"><i>${k}</i>{{${k.toLowerCase()}}}</div>{{/state.pick.@key}}`;

const QUIZ: AppUi = {
  pages: [
    {
      id: 'play',
      title: 'Play the quiz',
      blocks: [
        { element: 'qz-score' },
        { element: 'qz-question', data: 'result.questions', each: true, empty: 'No questions' },
        { element: 'qz-end' },
      ],
    },
    { id: 'answers', title: 'Answers', blocks: [{ element: 'qz-answer', data: 'result.questions', each: true }] },
    { id: 'about', title: 'About the topic', blocks: [{ element: 'qz-about' }] },
  ],
  elements: {
    'qz-score': {
      description: 'The topic, and the score so far',
      html: String.raw`<header class="hero">
  <p class="kicker">Quiz · {{inputs.level}}</p><h1>{{inputs.topic}}</h1>
  <div class="score"><b>{{state.right|count}}</b><span>right of {{result.questions|count}}</span><span class="track"><span style="width: calc({{state.pick|count}} / {{result.questions|count}} * 100%)"></span></span><span class="muted">{{state.pick|count}} answered</span></div>
</header>`,
      css:
        HERO_CSS +
        String.raw`
.score { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: 10px; }
.score b { font-size: 32px; line-height: 1; } .muted { color: var(--n-muted); font-size: 13px; }
.track { flex: 1 1 140px; height: 8px; border-radius: 999px; background: var(--n-soft); overflow: hidden; } .track span { display: block; height: 100%; background: var(--n-ok); }
`,
    },
    'qz-question': {
      description: 'A question with its four answers; once one is picked, which was right and why',
      html: String.raw`<article class="q">
  <p class="n">Question {{n}}</p><h3>{{question}}</h3>
  <div class="opts">${option('A')}${option('B')}${option('C')}${option('D')}</div>
  {{#state.pick.@key}}<p class="why">{{#state.right.@key}}<b class="ok">✓ Right.</b>{{/state.right.@key}}{{^state.right.@key}}<b class="no">✗ It’s {{answer}}.</b>{{/state.right.@key}} {{explain}}</p>{{/state.pick.@key}}
</article>`,
      css: String.raw`
.q { padding: 14px 16px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.n { margin: 0; color: var(--n-muted); font-size: 12.5px; } h3 { margin: 2px 0 12px; font-size: 16.5px; line-height: 1.4; }
.opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
.o { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--n-line); border-radius: 10px; background: none; color: inherit; font: inherit; font-size: 14.5px; text-align: left; }
button.o:hover { border-color: var(--n-accent); background: var(--n-accent-soft); }
.o i { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 50%; background: var(--n-soft); font-style: normal; font-size: 12px; font-weight: 700; }
.right { border-color: var(--n-ok); background: color-mix(in srgb, var(--n-ok) 12%, var(--n-card)); } .right i { background: var(--n-ok); color: var(--n-card); }
.picked:not(.right) { border-color: var(--n-err); background: color-mix(in srgb, var(--n-err) 10%, var(--n-card)); } .picked:not(.right) i { background: var(--n-err); color: var(--n-card); }
.why { margin: 12px 0 0; font-size: 14.5px; line-height: 1.5; } .ok { color: var(--n-ok); } .no { color: var(--n-err); }
`,
    },
    'qz-end': {
      description: 'Start over, or play a harder or longer quiz',
      html: String.raw`<div class="end"><p>You got <b>{{state.right|count}}</b> of {{result.questions|count}} right.</p><div class="n-row"><button type="button" class="n-btn" data-event="reset">Start over</button>{{^inputs.level|is:Hard}}<button type="button" class="n-btn" data-event="harder">A harder one</button>{{/inputs.level}}<button type="button" class="n-btn" data-event="another">New questions</button></div></div>`,
      css: String.raw`.end { padding: 14px 16px; border: 1px dashed var(--n-line); border-radius: var(--n-radius); text-align: center; } .end p { margin: 0 0 10px; font-size: 15px; } .n-row { justify-content: center; }`,
    },
    'qz-answer': {
      description: 'A question with its right answer and why',
      html: String.raw`<div class="a"><span class="n">{{n}}</span><div><p class="q">{{question}}</p><p><b>{{answer}}.</b> {{#answer|is:A}}{{a}}{{/answer}}{{#answer|is:B}}{{b}}{{/answer}}{{#answer|is:C}}{{c}}{{/answer}}{{#answer|is:D}}{{d}}{{/answer}}{{#explain}} · <span class="muted">{{explain}}</span>{{/explain}}</p></div></div>`,
      css: String.raw`
.a { display: grid; grid-template-columns: auto 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--n-line); }
.n { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 13px; font-weight: 700; }
p { margin: 0 0 4px; font-size: 14.5px; line-height: 1.5; } .q { font-weight: 600; } .muted { color: var(--n-muted); }
`,
    },
    'qz-about': {
      description: 'The topic in two sentences, where to read more, and a copy of the quiz',
      html: String.raw`<div class="ab"><p>{{result.intro}}</p>{{#result.source}}<p><a href="{{result.source}}" target="_blank" rel="noopener noreferrer">{{result.title|or:Read more}} ↗</a></p>{{/result.source}}<button type="button" class="n-btn" data-event="copy">Copy the quiz</button></div>`,
      css: String.raw`.ab { padding: 16px 18px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); } p { margin: 0 0 12px; font-size: 15px; line-height: 1.6; } a { color: var(--n-accent); }`,
    },
  },
  events: {
    pick: [
      { do: 'set', name: 'pick.@key', value: '{{event.v}}', keep: true },
      { do: 'set', name: 'right.@key', value: '{{answer|is:$event.v}}', keep: true },
    ],
    reset: [
      { do: 'set', confirm: 'Clear your answers and start over?', name: 'pick', value: null, keep: true },
      { do: 'set', name: 'right', value: null, keep: true },
    ],
    harder: [{ do: 'again', confirm: 'Make a harder quiz on this topic? It is a new run.', inputs: { level: 'Hard' } }],
    another: [{ do: 'again', confirm: 'Make new questions on this topic? It is a new run.', inputs: {} }],
    copy: [{ do: 'copy', text: '{{inputs.topic}}\n{{#result.questions}}{{n}}. {{question}}\nA. {{a}}  B. {{b}}  C. {{c}}  D. {{d}}\n{{/result.questions}}\nAnswers: {{#result.questions}}{{n}} {{answer}}  {{/result.questions}}' }],
  },
};

// ---- Book finder ------------------------------------------------------------------------------------------------

const BOOKS: AppUi = {
  pages: [
    { id: 'shelf', title: 'Your shelf', blocks: [{ element: 'bk-hero' }, { element: 'bk-card', data: 'result.books', each: true, layout: 'grid', empty: 'No books found' }] },
    { id: 'book', title: 'Book', tab: false, blocks: [{ element: 'bk-detail', data: 'page.item' }] },
    { id: 'list', title: 'Reading list', blocks: [{ element: 'bk-row', data: 'result.books', each: true }] },
  ],
  elements: {
    'bk-hero': {
      description: 'What you asked for, and the thread through the books',
      html: String.raw`<header class="hero"><p class="kicker">Book finder{{^inputs.kind|is:Either}} · {{inputs.kind}}{{/inputs.kind}}</p><h1>{{result.summary}}</h1><p class="sub">From: {{inputs.likes|short:140}}</p></header>`,
      css: HERO_CSS + String.raw`.hero h1 { font-size: 21px !important; }`,
    },
    'bk-card': {
      description: 'A book: its cover, author, year and why you may like it',
      html: String.raw`<button type="button" class="c" data-event="open">{{#cover}}<img class="pic tall" src="{{cover}}" alt="" loading="lazy">{{/cover}}{{^cover}}<div class="nocover"><b>{{title|short:60}}</b></div>{{/cover}}<h3>{{title}}</h3><p class="muted">{{author}}{{#year}} · {{year}}{{/year}}{{#pages}} · {{pages}} pages{{/pages}}</p>{{#rating}}<p class="stars">★ {{rating}}</p>{{/rating}}</button>`,
      css: CARD + PIC + String.raw`.nocover { display: grid; place-items: center; aspect-ratio: 2 / 3; padding: 12px; border-radius: 8px; background: linear-gradient(160deg, var(--n-accent-soft), var(--n-soft)); text-align: center; font-size: 14px; } .stars { color: var(--n-warn); font-size: 13px !important; }`,
    },
    'bk-detail': {
      description: 'A book on a page of its own: why, what it is about, a link to it',
      html: String.raw`<div class="dt">{{#cover}}<img class="pic tall" src="{{cover}}" alt="">{{/cover}}<div>
  <p class="kicker">{{genre}}{{#year}} · {{year}}{{/year}}{{#pages}} · {{pages}} pages{{/pages}}</p><h2>{{title}}</h2><p class="by">{{author}}</p>
  <p>{{why}}</p>{{#subjects}}<p class="muted">About: {{subjects}}</p>{{/subjects}}
  <div class="n-row">{{#link}}<a class="n-btn" href="{{link}}" target="_blank" rel="noopener noreferrer">At Open Library ↗</a>{{/link}}<button type="button" class="n-btn" data-event="more">More like this</button></div>
</div></div>`,
      css:
        PIC +
        String.raw`
.dt { display: grid; grid-template-columns: minmax(0, 180px) 1fr; gap: 18px; align-items: start; }
.kicker { margin: 0; color: var(--n-accent); font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
h2 { margin: 4px 0 2px !important; font-size: 24px !important; } .by { margin: 0 0 12px; color: var(--n-muted); }
p { margin: 0 0 10px; font-size: 15px; line-height: 1.5; } .muted { color: var(--n-muted); font-size: 13.5px; }
@media (max-width: 520px) { .dt { grid-template-columns: 1fr; } }
`,
    },
    'bk-row': {
      description: 'A book on the list, to mark as one to read or as read',
      html: String.raw`<div class="r"><span class="mk">{{#state.read.@key}}✓{{/state.read.@key}}{{^state.read.@key}}{{@number}}{{/state.read.@key}}</span><p>{{title}}<small>{{author}}{{#year}} · {{year}}{{/year}}</small></p><button type="button" class="b" data-event="read">{{#state.read.@key}}Read{{/state.read.@key}}{{^state.read.@key}}Mark read{{/state.read.@key}}</button></div>`,
      css: ROW + String.raw`.mk { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 13px; font-weight: 700; }`,
    },
  },
  events: {
    open: [{ do: 'page', page: 'book', item: '{{item}}' }],
    read: [{ do: 'toggle', name: 'read.@key', keep: true }],
    more: [{ do: 'again', confirm: 'Find more books like “{{title}}”? It is a new run.', inputs: { likes: '{{title}} by {{author}}' } }],
  },
};

// ---- What's on --------------------------------------------------------------------------------------------------

const WHATS_ON: AppUi = {
  pages: [
    { id: 'days', title: 'By day', blocks: [{ element: 'wo-hero' }, { element: 'wo-day', data: 'result.days', each: true, empty: 'Nothing found on those days' }] },
    {
      id: 'map',
      title: 'Map',
      if: 'result.events',
      blocks: [
        { element: 'map', data: 'result.events', with: { label: 'name', popup: 'venue', numbered: true, height: 420, empty: 'No venue was found on the map' } },
        { element: 'wo-row', data: 'result.events', each: true },
      ],
    },
    { id: 'kinds', title: 'By kind', if: 'result.events', blocks: [{ element: 'wo-kinds' }, { element: 'wo-row', data: 'result.events', each: true, where: { kind: '{{state.kind}}' } }] },
  ],
  elements: {
    'wo-hero': {
      description: 'The city and the days, in numbers',
      html: String.raw`<header class="hero"><p class="kicker">What’s on · {{result.when}}</p><h1>{{result.city}}</h1><p class="sub">{{result.summary}}</p>
  <div class="stats"><div class="stat"><b>{{result.events|count}}</b><span>things to do</span></div><div class="stat"><b>{{result.events|unique:kind|count}}</b><span>kinds</span></div></div>
  <button type="button" class="n-btn copy" data-event="copy">Copy the list</button></header>`,
      css: HERO_CSS + STATS_CSS + String.raw`.copy { margin-top: 14px; }`,
    },
    'wo-day': {
      description: 'A day: its weather, and what is on, each with its picture',
      html: String.raw`<section class="day">
  <header><b>{{date|weekday}}</b><span class="muted">{{date|longdate}}</span>{{#high}}<span class="wx">{{icon}} {{high}}° / {{low}}°{{#chance}} · 💧 {{chance}}%{{/chance}}</span>{{/high}}</header>
  {{#result.events|where:date=$date}}<div class="ev"><span class="t">{{time|or:All day}}</span><p><b>{{name}}</b><small>{{venue}}{{#price}} · {{price}}{{/price}}</small>{{#why}}<small>{{why}}</small>{{/why}}</p><span class="end">{{#picture}}<img class="th" src="{{picture}}" alt="" loading="lazy">{{/picture}}{{#url}}<a class="go" href="{{url}}" target="_blank" rel="noopener noreferrer">↗</a>{{/url}}</span></div>{{/result.events}}
  {{^result.events|where:date=$date}}<p class="muted none">Nothing found for this day</p>{{/result.events}}
</section>`,
      css: String.raw`
.day { padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin-bottom: 6px; } header b { font-size: 16px; }
.muted { color: var(--n-muted); font-size: 13px; } .wx { margin-left: auto; font-size: 13.5px; }
.ev { display: grid; grid-template-columns: 64px 1fr auto; gap: 10px; padding: 8px 0; border-top: 1px solid var(--n-line); }
.t { color: var(--n-accent); font-size: 13px; font-weight: 600; } p { margin: 0; font-size: 14.5px; } small { display: block; color: var(--n-muted); font-size: 12.5px; }
.end { display: flex; align-items: flex-start; gap: 10px; }
.th { display: block; width: 76px; height: 54px; object-fit: cover; border-radius: 8px; background: var(--n-soft); }
@media (max-width: 520px) { .ev { grid-template-columns: 52px 1fr auto; } .th { width: 56px; height: 42px; } }
.go { color: var(--n-accent); text-decoration: none; } .none { margin: 6px 0 0; }
`,
    },
    'wo-row': {
      description: 'A thing to do in a line, with its picture, to mark as going',
      html: String.raw`<div class="r"><div class="when"><b>{{date|day}}</b>{{date|month}}</div><p>{{#picture}}<img class="th" src="{{picture}}" alt="" loading="lazy">{{/picture}}{{name}}<small>{{kind}} · {{time|or:All day}} · {{venue}}{{#price}} · {{price}}{{/price}}</small></p><button type="button" class="b{{#state.going.@key}} on{{/state.going.@key}}" data-event="going">{{#state.going.@key}}✓ Going{{/state.going.@key}}{{^state.going.@key}}Going?{{/state.going.@key}}</button></div>`,
      css: ROW + String.raw`.on { border-color: var(--n-ok); color: var(--n-ok); }
.th { float: right; width: 64px; height: 44px; margin: 0 0 0 10px; object-fit: cover; border-radius: 7px; background: var(--n-soft); }`,
    },
    'wo-kinds': {
      description: 'The kinds of thing to do, to show one kind',
      html: String.raw`<div class="chips">{{#state.kind}}<button type="button" class="chip" data-event="kind" data-name="">All</button>{{/state.kind}}{{^state.kind}}<span class="chip on">All</span>{{/state.kind}}{{#result.events|unique:kind}}<button type="button" class="chip{{#.|is:$state.kind}} on{{/.}}" data-event="kind" data-name="{{.}}">{{.}}</button>{{/result.events}}</div>`,
      css: CHIPS_CSS,
    },
  },
  events: {
    kind: [{ do: 'set', name: 'kind', value: '{{event.name}}' }],
    going: [{ do: 'toggle', name: 'going.@key', keep: true }],
    copy: [{ do: 'copy', text: '{{result.city}}, {{result.when}}\n{{#result.events}}{{date}} {{time}}: {{name}}, {{venue}}{{#price}} ({{price}}){{/price}}\n{{/result.events}}' }],
  },
};

// ---- Savings plan -----------------------------------------------------------------------------------------------

const SAVINGS: AppUi = {
  pages: [
    {
      id: 'plan',
      title: 'The plan',
      blocks: [
        { element: 'sv-hero' },
        { title: 'How it grows', element: 'plot', data: 'result.rows', with: { kind: 'area', x: 'month', y: ['balance', 'put_in'], height: 280 } },
        { title: 'If you save more or less', element: 'sv-case', data: 'result.scenarios', each: true, layout: 'grid' },
      ],
    },
    { id: 'months', title: 'Month by month', if: 'result.rows', blocks: [{ title: 'Milestones', element: 'sv-mile', data: 'result.milestones', each: true, layout: 'row' }, { element: 'table', data: 'result.rows' }] },
    { id: 'tips', title: 'Tips', if: 'result.tips', blocks: [{ text: '{{result.summary}}' }, { element: 'checklist', data: 'result.tips' }] },
  ],
  elements: {
    'sv-hero': {
      description: 'The goal, and what it takes each month',
      html: String.raw`<header class="hero">
  <p class="kicker">Savings plan{{#inputs.goal}} · {{inputs.goal}}{{/inputs.goal}}</p>
  <h1>{{inputs.currency}}{{inputs.target|number}} by {{inputs.by|longdate}}</h1>
  <div class="stats">
    <div class="stat"><b>{{inputs.currency}}{{result.needed|number}}</b><span>it takes a month</span></div>
    <div class="stat"><b>{{result.months}}</b><span>months to go</span></div>
    <div class="stat"><b>{{result.reach|or:—}}</b><span>goal reached</span></div>
  </div>
  <div class="sum">{{result.summary|markdown}}</div>
  {{#inputs.monthly}}<div class="n-row"><button type="button" class="n-btn" data-event="more">Save 50 more a month</button><button type="button" class="n-btn" data-event="less">Save 50 less</button></div>{{/inputs.monthly}}
</header>`,
      css: HERO_CSS + STATS_CSS + String.raw`.sum { margin: 14px 0 0; font-size: 15px; line-height: 1.55; } .sum p { margin: 0 0 8px; } .n-row { margin-top: 10px; }`,
    },
    'sv-case': {
      description: 'Saving more or less: what it puts aside, and when it gets there',
      html: String.raw`<div class="c"><span class="tag">{{plan}}</span><h3>{{inputs.currency}}{{monthly|number}} a month</h3><p class="muted">{{#reach}}Goal reached {{reach}}{{/reach}}{{^reach}}Does not get there{{/reach}}</p></div>`,
      css: CARD,
    },
    'sv-mile': {
      description: 'A milestone: a share of the goal, and the month it is passed',
      html: String.raw`<div class="m"><b>{{pct}}%</b><span>{{month|or:—}}</span></div>`,
      css: String.raw`.m { display: flex; flex-direction: column; align-items: center; min-width: 84px; padding: 10px; border-radius: var(--n-radius); background: var(--n-accent-soft); } b { color: var(--n-accent); font-size: 18px; } span { font-size: 13px; }`,
    },
  },
  events: {
    more: [{ do: 'again', inputs: { monthly: '{{inputs.monthly|plus:50}}' } }],
    less: [{ do: 'again', inputs: { monthly: '{{inputs.monthly|plus:-50}}' } }],
  },
};

// ---- Chart my data ----------------------------------------------------------------------------------------------

const CHARTS: AppUi = {
  pages: [
    { id: 'charts', title: 'Charts', blocks: [{ element: 'ch-hero' }, { element: 'ch-chart', data: 'result.charts', each: true, empty: 'No chart could be drawn' }] },
    { id: 'shows', title: 'What the data shows', blocks: [{ text: '{{result.summary}}' }, { element: 'ch-find', data: 'result.findings', each: true }] },
    { id: 'data', title: 'The data', blocks: [{ title: 'Its columns', element: 'table', data: 'result.columns' }, { element: 'ch-ask' }] },
  ],
  elements: {
    'ch-hero': {
      description: 'The data in a line',
      html: String.raw`<header class="hero"><p class="kicker">Chart my data · {{result.rows}} rows · {{result.columns|count}} columns</p><h1>{{inputs.question|or:Your data in charts}}</h1><div class="sum">{{result.summary|markdown}}</div></header>`,
      css: HERO_CSS + String.raw`.hero h1 { font-size: 21px !important; } .sum { margin-top: 8px; font-size: 15px; line-height: 1.55; } .sum p { margin: 0; }`,
    },
    'ch-chart': {
      description: 'A chart of the data, of the kind that suits it',
      html: String.raw`<figure class="ch"><figcaption>{{title}}</figcaption><n-plot value="{{result.points|where:chart=$n|json}}" kind="{{kind}}" x="x" y="y" series="series" height="320"></n-plot><p class="axes">{{x_label}} · {{y_label}}</p></figure>`,
      css: String.raw`.ch { margin: 0; padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); } figcaption { font-weight: 600; font-size: 15px; } .axes { margin: 4px 0 0; color: var(--n-muted); font-size: 12.5px; }`,
    },
    'ch-find': {
      description: 'A finding, numbered, to copy',
      html: String.raw`<div class="f"><span>{{@number}}</span><p>{{.}}</p><button type="button" class="cp" data-event="copy">Copy</button></div>`,
      css: String.raw`.f { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 11px 13px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); } span { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--n-accent); color: var(--n-accent-fg); font-size: 12.5px; font-weight: 700; } p { margin: 1px 0 0; font-size: 14.5px; line-height: 1.5; } .cp { padding: 2px 9px; border: 1px solid var(--n-line); border-radius: 999px; background: none; color: var(--n-muted); font: inherit; font-size: 12px; }`,
    },
    'ch-ask': {
      description: 'Asks another question of the same data: a new run',
      html: String.raw`<form class="ask" data-event="ask_again"><label for="ch-q">Ask another question of this data</label><input id="ch-q" name="question" placeholder="e.g. Which region grew fastest?" required><button type="submit" class="n-btn n-primary">Chart it</button></form>`,
      css: String.raw`.ask { display: grid; grid-template-columns: 1fr auto; gap: 8px 10px; padding: 14px 16px; border: 1px dashed var(--n-line); border-radius: var(--n-radius); } label { grid-column: 1 / -1; font-size: 13.5px; font-weight: 600; } input { min-width: 0; padding: 8px 10px; border: 1px solid var(--n-line); border-radius: 10px; background: var(--n-card); color: var(--n-fg); font: inherit; }`,
    },
  },
  events: {
    copy: [{ do: 'copy', text: '{{item}}' }],
    ask_again: [{ do: 'again', inputs: { question: '{{event.question}}' } }],
  },
};

// ---- A topic as a timeline --------------------------------------------------------------------------------------

const TIMELINE: AppUi = {
  pages: [
    {
      id: 'timeline',
      title: 'The timeline',
      blocks: [
        { element: 'tl-hero' },
        { element: 'tl-kinds' },
        { element: 'tl-event', data: 'result.events', each: true, where: { kind: '{{state.kind}}' }, empty: 'No moments' },
      ],
    },
    { id: 'chart', title: 'On a chart', if: 'result.figure', blocks: [{ element: 'tl-chart' }, { title: 'Eras', element: 'tl-eras', data: 'result.eras', if: 'result.eras' }] },
  ],
  elements: {
    'tl-hero': {
      description: 'The topic, its span and the story in short',
      html: String.raw`<header class="hero"><p class="kicker">Timeline · {{result.span}} · {{result.events|count}} moments</p><h1>{{inputs.topic}}</h1><div class="sum">{{result.summary|markdown}}</div>
  <div class="n-row">{{#result.source}}<a class="n-btn" href="{{result.source}}" target="_blank" rel="noopener noreferrer">{{result.title|or:Read more}} ↗</a>{{/result.source}}<button type="button" class="n-btn" data-event="quiz">Quiz me on it</button></div></header>`,
      css: HERO_CSS + String.raw`.sum { margin: 8px 0 12px; font-size: 15px; line-height: 1.6; } .sum p { margin: 0 0 8px; }`,
    },
    'tl-kinds': {
      description: 'The strands of the story, to show one',
      html: String.raw`<div class="chips">{{#state.kind}}<button type="button" class="chip" data-event="kind" data-name="">All</button>{{/state.kind}}{{^state.kind}}<span class="chip on">All</span>{{/state.kind}}{{#result.events|unique:kind}}<button type="button" class="chip{{#.|is:$state.kind}} on{{/.}}" data-event="kind" data-name="{{.}}">{{.}}</button>{{/result.events}}</div>`,
      css: CHIPS_CSS,
    },
    'tl-event': {
      description: 'A moment on the line: when, what, why it mattered; turning points stand out',
      html: String.raw`<div class="ev i{{importance}}{{#@last}} last{{/@last}}"><div class="rail"><span class="dot"></span></div><div class="body"><p class="when">{{date}}{{#era}} · {{era}}{{/era}}</p><h3>{{title}}</h3><p>{{what}}</p><span class="kind">{{kind}}</span></div></div>`,
      css: String.raw`
.ev { display: grid; grid-template-columns: 24px 1fr; gap: 12px; }
.rail { position: relative; display: flex; justify-content: center; }
.rail::before { content: ""; position: absolute; top: 18px; bottom: -14px; width: 2px; background: var(--n-line); } .last .rail::before { display: none; }
.dot { position: relative; width: 12px; height: 12px; margin-top: 6px; border-radius: 50%; background: var(--n-card); border: 3px solid var(--n-accent); }
.i3 .dot { width: 16px; height: 16px; margin-top: 4px; background: var(--n-accent); }
.body { padding: 0 0 16px; } .when { margin: 0; color: var(--n-accent); font-size: 13px; font-weight: 600; }
h3 { margin: 2px 0 4px; font-size: 16px; } .i3 h3 { font-size: 17.5px; } p { margin: 0 0 6px; font-size: 14.5px; line-height: 1.5; }
.kind { color: var(--n-muted); font-size: 12px; }
`,
    },
    'tl-chart': {
      description: 'The moments on a chart, by year and strand; turning points bigger',
      html: String.raw`<n-plot value="{{result.figure}}" height="380"></n-plot>`,
    },
    'tl-eras': {
      description: 'The eras, side by side',
      html: String.raw`<div class="eras">{{#.}}<div class="era"><b>{{name}}</b><span>{{from}}{{#to}}–{{to}}{{/to}}</span></div>{{/.}}</div>`,
      css: String.raw`.eras { display: flex; flex-wrap: wrap; gap: 8px; } .era { display: flex; flex-direction: column; padding: 9px 13px; border-radius: var(--n-radius); background: var(--n-accent-soft); } b { font-size: 14px; } span { color: var(--n-muted); font-size: 12.5px; }`,
    },
  },
  events: {
    kind: [{ do: 'set', name: 'kind', value: '{{event.name}}' }],
    quiz: [{ do: 'start', app: 'tpl:quiz', inputs: { topic: '{{inputs.topic}}' } }],
  },
};

// ---- Explore a place --------------------------------------------------------------------------------------------

const PLACES: AppUi = {
  pages: [
    {
      id: 'walk',
      title: 'The walk',
      blocks: [
        { element: 'pl-hero' },
        { element: 'map', data: 'result.places', where: { pick: 'true' }, with: { label: 'name', popup: 'about', numbered: true, line: true, height: 420 } },
        { element: 'pl-stop', data: 'result.places', each: true, where: { pick: 'true' }, empty: 'No stops picked' },
      ],
    },
    {
      id: 'around',
      title: 'Everything around',
      if: 'result.places',
      blocks: [
        { element: 'map', data: 'result.places', where: { kind: '{{state.kind}}' }, with: { label: 'name', popup: 'about', height: 360 } },
        { element: 'pl-kinds' },
        { element: 'pl-card', data: 'result.places', each: true, layout: 'grid', where: { kind: '{{state.kind}}' } },
      ],
    },
  ],
  elements: {
    'pl-hero': {
      description: 'The place, what it is like, and the walk in numbers',
      html: String.raw`<header class="hero"><p class="kicker">Explore · {{inputs.radius}}</p><h1>{{result.place}}</h1><div class="sum">{{result.summary|markdown}}</div>
  <div class="stats"><div class="stat"><b>{{result.stops}}</b><span>stops</span></div><div class="stat"><b>{{result.walk|number}} km</b><span>to walk them</span></div><div class="stat"><b>{{result.places|count}}</b><span>places around</span></div></div>
  <div class="n-row"><button type="button" class="n-btn" data-event="copy">Copy the walk</button><button type="button" class="n-btn" data-event="weather">The weather there</button></div></header>`,
      css: HERO_CSS + STATS_CSS + String.raw`.sum { margin: 8px 0 12px; font-size: 15px; line-height: 1.55; } .sum p { margin: 0; } .n-row { margin-top: 12px; }`,
    },
    'pl-stop': {
      description: 'A stop of the walk: its picture, why go, how far; ticked off when seen',
      html: String.raw`<div class="s{{#state.seen.@key}} seen{{/state.seen.@key}}"><span class="n">{{n}}</span>{{#picture}}<img src="{{picture}}" alt="" loading="lazy">{{/picture}}<div class="body"><h3>{{name}}</h3><p class="muted">{{kind}}{{#about}} · {{about}}{{/about}} · {{km}} km</p><p>{{why}}</p><div class="foot">{{#link}}<a class="b" href="{{link}}" target="_blank" rel="noopener noreferrer">About it ↗</a>{{/link}}<button type="button" class="b" data-event="seen">{{#state.seen.@key}}✓ Seen{{/state.seen.@key}}{{^state.seen.@key}}Mark seen{{/state.seen.@key}}</button></div></div></div>`,
      css: String.raw`
.s { display: grid; grid-template-columns: auto 96px 1fr; gap: 12px; align-items: start; padding: 12px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.seen { opacity: .65; } .n { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--n-accent); color: var(--n-accent-fg); font-weight: 700; font-size: 13px; }
img { width: 96px; height: 72px; object-fit: cover; border-radius: 8px; background: var(--n-soft); }
h3 { margin: 0 0 2px; font-size: 15.5px; } p { margin: 0 0 6px; font-size: 14px; line-height: 1.45; } .muted { color: var(--n-muted); font-size: 12.5px; }
.foot { display: flex; flex-wrap: wrap; gap: 8px; }
.b { padding: 3px 10px; border: 1px solid var(--n-line); border-radius: 999px; background: none; color: var(--n-muted); font: inherit; font-size: 12.5px; text-decoration: none; }
@media (max-width: 520px) { .s { grid-template-columns: auto 1fr; } img { display: none; } }
`,
    },
    'pl-kinds': {
      description: 'The kinds of place, to show one kind',
      html: String.raw`<div class="chips">{{#state.kind}}<button type="button" class="chip" data-event="kind" data-name="">All</button>{{/state.kind}}{{^state.kind}}<span class="chip on">All</span>{{/state.kind}}{{#result.places|unique:kind}}<button type="button" class="chip{{#.|is:$state.kind}} on{{/.}}" data-event="kind" data-name="{{.}}">{{.}}</button>{{/result.places}}</div>`,
      css: CHIPS_CSS,
    },
    'pl-card': {
      description: 'A place around: its picture, what it is, how far',
      html: String.raw`<a class="c" href="{{link}}" target="_blank" rel="noopener noreferrer">{{#picture}}<img class="pic" src="{{picture}}" alt="" loading="lazy">{{/picture}}<span class="tag">{{kind}}</span><h3>{{name}}</h3><p class="muted">{{about}}{{#km}} · {{km}} km{{/km}}</p></a>`,
      css: CARD + PIC + String.raw`a.c { text-decoration: none; }`,
    },
  },
  events: {
    kind: [{ do: 'set', name: 'kind', value: '{{event.name}}' }],
    seen: [{ do: 'toggle', name: 'seen.@key', keep: true }],
    copy: [{ do: 'copy', text: '{{result.place}}: a walk of {{result.walk}} km\n{{#result.places|where:pick=true}}{{n}}. {{name}}: {{why}}\n{{/result.places}}' }],
    weather: [{ do: 'start', app: 'tpl:weather-outlook', inputs: { place: '{{inputs.place}}' } }],
  },
};

/** Each of these ready-made apps' view, by its id. */
export const MORE_VIEWS: Record<string, AppUi> = {
  'weather-outlook': WEATHER,
  'best-time-to-visit': BEST_TIME,
  'team-tracker': TEAM,
  'match-preview': MATCH,
  'fridge-recipes': FRIDGE,
  'meal-planner': MEALS,
  'gift-ideas': GIFTS,
  'what-to-watch': WATCH,
  'game-finder': GAMES,
  quiz: QUIZ,
  'book-finder': BOOKS,
  'whats-on': WHATS_ON,
  'savings-plan': SAVINGS,
  'chart-my-data': CHARTS,
  'topic-timeline': TIMELINE,
  'place-explorer': PLACES,
};
