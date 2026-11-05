// The views of the lab's apps (templates-lab.ts). The Annotation workbench's run page is where you label: one text at a
// time with big buttons and keys 1 to 9 (a small widget turns keys into clicks), the model's label shown only once you
// have given yours, the disagreements side by side, your agreement (worked out by a widget from the same code its
// Publish flow uses) and the set to download or publish. The Research sprint shows each hypothesis with its verdict,
// the runs and the report; the Sweep planner the best run, how much each setting mattered and a chart for each. The
// Weekly progress report and the Lab notebook open on their own page: this week's report with its copy and save
// buttons, and the notebook's entries, newest first, searchable by words and meaning. Their colours are the page
// kit's, so they look like part of the app in both themes; their words are translated as the app's are (uiTexts).
import type { AppUi } from '../../shared/app-ui.ts';
import { AGREE } from './templates-lab.ts';
import { CARD_CSS, CHIPS_CSS, HERO_CSS, STATS_CSS } from './views.ts';

/** A plain button that reads as a link, and a line of status beside a button. */
const LINK_CSS = String.raw`
.link { padding: 0; border: 0; background: none; color: var(--n-accent); font: inherit; font-size: 13px; cursor: pointer; }
.link:hover { text-decoration: underline; text-underline-offset: 3px; }
.st { font-size: 13px; color: var(--n-muted); }
.st.err { color: var(--n-err); }
.st.ok { color: var(--n-ok); }
a.st.ok { text-decoration: none; }
a.st.ok:hover { text-decoration: underline; }
`;

/** Lists of short lines under a small heading, as the reports and the notebook show them. */
const PARTS_CSS = String.raw`
.parts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 12px 22px; }
.parts h3 { margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--n-muted); }
.parts ul { margin: 0; padding-left: 18px; font-size: 14.5px; line-height: 1.5; }
.parts li { margin: 3px 0; }
`;

// ---- Annotation workbench ------------------------------------------------------------------------------------------

/** Keys for labelling: 1 to 9 press a label's button, S skips, Z (or ←) changes the last one, N writes a note; not while typing. */
const KEYS_WIDGET = String.raw`export default function (el, value, view) {
  let pending = '';
  let since = 0;
  const current = () => {
    const b = document.querySelector('[data-hotkey="1"]');
    return b ? b.getAttribute('data-id') || '' : '';
  };
  const on = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable]')) {
      if (e.key === 'Escape' && t.blur) t.blur();
      return;
    }
    let key = '';
    if (/^[1-9]$/.test(e.key)) key = e.key;
    else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowRight') key = 'skip';
    else if (e.key === 'z' || e.key === 'Z' || e.key === 'ArrowLeft' || e.key === 'Backspace') key = 'undo';
    else if (e.key === 'n' || e.key === 'N') key = 'note';
    if (!key) return;
    const b = document.querySelector('[data-hotkey="' + key + '"]');
    if (!b) return;
    e.preventDefault();
    if (key === 'note') return void b.focus();
    // The text just labelled stays on screen a moment, until the next one comes: a second key then waits for it.
    if (key !== 'undo' && pending && pending === current() && Date.now() - since < 2500) return;
    if (b.getAttribute('aria-busy') === 'true') return;
    pending = current();
    since = Date.now();
    b.click();
  };
  document.addEventListener('keydown', on);
  return () => document.removeEventListener('keydown', on);
}`;

/** The agreement between you and the model, worked out from the set's labelled texts: it tells the page (its numbers), and draws the confusion matrix. */
const AGREEMENT_WIDGET =
  AGREE +
  String.raw`const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export default function (el, items, view) {
  let labels = [];
  try {
    labels = JSON.parse(view.with.labels || '[]');
  } catch (e) {}
  const both = (Array.isArray(items) ? items : []).filter((x) => x && x.done === true && x.label && x.model);
  const a = agreement(both.map((x) => [String(x.label), String(x.model)]), (Array.isArray(labels) ? labels : []).map(String));
  const level = a.kappa === null ? 0 : ['', 'poor', 'slight', 'fair', 'moderate', 'substantial', 'almost perfect'].indexOf(strength(a.kappa));
  const was = view.state.agree || {};
  const now = { n: a.n, same: a.same, po: a.po, pe: a.pe, kappa: a.kappa === null ? null : Math.round(a.kappa * 100) / 100, level };
  if (JSON.stringify(was) !== JSON.stringify(now)) view.set('agree', now);
  if (!a.n) {
    el.innerHTML = '';
    return;
  }
  const most = Math.max(1, ...a.matrix.flat());
  const head = '<tr><th></th>' + a.labels.map((l) => '<th scope="col">' + esc(l) + '</th>').join('') + '<th scope="col" class="sum">Σ</th></tr>';
  const body = a.labels
    .map((l, i) => '<tr><th scope="row">' + esc(l) + '</th>' + a.matrix[i].map((n, j) => '<td class="' + (i === j ? 'diag' : 'off') + (n ? '' : ' zero') + '" style="--a:' + (n / most).toFixed(3) + '">' + n + '</td>').join('') + '<td class="sum">' + a.rows[i] + '</td></tr>')
    .join('');
  const foot = '<tr><th scope="row" class="sum">Σ</th>' + a.cols.map((n) => '<td class="sum">' + n + '</td>').join('') + '<td class="sum">' + a.n + '</td></tr>';
  el.innerHTML = '<div class="cm-wrap"><table class="cm"><thead>' + head + '</thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>';
}`;

const AGREEMENT_WIDGET_CSS = String.raw`
.cm-wrap { overflow-x: auto; }
.cm { border-collapse: separate; border-spacing: 4px; font-variant-numeric: tabular-nums; }
.cm th { padding: 6px 10px; font-size: 13px; font-weight: 600; color: var(--n-muted); text-align: center; white-space: nowrap; }
.cm tbody th { text-align: right; }
.cm td { min-width: 56px; padding: 12px 10px; border-radius: 10px; text-align: center; font-size: 16px; font-weight: 600; }
.cm td.diag { background: color-mix(in srgb, var(--n-ok) calc(10% + var(--a) * 45%), var(--n-card)); }
.cm td.off { background: color-mix(in srgb, var(--n-err) calc(6% + var(--a) * 40%), var(--n-card)); }
.cm td.zero { background: var(--n-soft); color: var(--n-muted); font-weight: 400; }
.cm .sum { background: none; color: var(--n-muted); font-size: 13px; font-weight: 500; }
`;

const ANNOTATE_UI: AppUi = {
  pages: [
    {
      id: 'label',
      title: 'Label',
      blocks: [
        { element: 'set-head' },
        { element: 'workbench', data: 'data.items', where: { sample: '{{run.id}}' }, sort: 'order', limit: 1000, empty: 'No texts in this set yet: they show here once the run has loaded them.' },
      ],
    },
    {
      id: 'disagree',
      title: 'Disagreements',
      blocks: [{ element: 'pair', data: 'data.items', where: { sample: '{{run.id}}', agree: false }, sort: 'order', limit: 1000, each: true, empty: 'No disagreements yet: when you and the model label a text differently, it shows here, side by side.' }],
    },
    {
      id: 'agreement',
      title: 'Agreement',
      blocks: [{ element: 'agreement', data: 'data.items', where: { sample: '{{run.id}}', done: true }, limit: 1000, empty: 'Nothing to compare yet: label some texts first.' }],
    },
    {
      id: 'export',
      title: 'Export',
      blocks: [{ element: 'export', data: 'data.items', where: { sample: '{{run.id}}', done: true }, limit: 1000 }],
    },
  ],
  elements: {
    'set-head': {
      description: 'The set: its name, its labels with their keys, and the guidelines to open',
      html: String.raw`<header class="hero">
  <p class="kicker">Annotation workbench</p>
  <h1>{{result.name|or:Your set}}</h1>
  <div class="chips">{{#result.labels}}<span class="chip"><kbd>{{@number}}</kbd>{{.}}</span>{{/result.labels}}</div>
  {{#result.guidelines}}<details class="guide"><summary>How to label</summary><div class="md">{{result.guidelines|markdown}}</div></details>{{/result.guidelines}}
</header>`,
      css:
        HERO_CSS +
        CHIPS_CSS +
        String.raw`
.chips { margin-top: 12px; }
kbd { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 5px; background: var(--n-soft); color: var(--n-muted); font: 600 11.5px var(--n-mono); }
.guide { margin-top: 12px; font-size: 14px; }
.guide summary { color: var(--n-accent); cursor: pointer; }
.md { margin-top: 8px; padding: 10px 14px; border-left: 3px solid var(--n-line); color: var(--n-fg); line-height: 1.55; }
.md > :first-child { margin-top: 0; } .md > :last-child { margin-bottom: 0; }
`,
    },
    workbench: {
      description: 'Labelling one text at a time: how far you are, the last one you labelled beside the model’s label, and the next text with a button (and a key) for each label',
      html: String.raw`<n-widget name="keys"></n-widget>
<div class="wb">
  <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="{{.|count}}" aria-valuenow="{{.|where:done=true|count}}"><span class="fill" style="width: calc({{.|where:done=true|count}} / {{.|count}} * 100%)"></span></div>
  <p class="nums"><b>{{.|where:done=true|count}}</b> of {{.|count}} labelled{{#.|where:done=true|count}} · you and the model agreed on <b>{{.|where:agree=true|count}}</b>{{/.}}</p>
  {{#.|where:done=true|sort:-updatedAt|first}}<div class="last {{#agree}}same{{/agree}}{{^agree}}differ{{/agree}}">
    <span class="what">Text {{n}}</span>
    <span>You: <b>{{label}}</b></span>
    <span>The model: <b>{{model|or:no label}}</b>{{#agree}} ✓{{/agree}}</span>
    {{^agree}}{{#reason}}<span class="why">“{{reason}}”</span>{{/reason}}{{/agree}}
    <button type="button" class="link" data-event="reopen" data-id="{{id}}" data-hotkey="undo">Change</button>
  </div>{{/.}}
  {{#.|where:done!=true|first}}<article class="item">
    <p class="meta">Text {{n}}{{#ref}} · {{ref}}{{/ref}}</p>
    <div class="text">{{text|lines}}</div>
    <div class="choices">{{#result.labels}}<button type="button" class="choice" data-event="label" data-id="{{id}}" data-label="{{.}}" data-model="{{model}}" data-hotkey="{{@number}}"><kbd>{{@number}}</kbd><span>{{.}}</span></button>{{/result.labels}}</div>
    <textarea class="note" rows="1" placeholder="A note on this one (optional)" aria-label="A note on this text" data-event="note" data-id="{{id}}" data-hotkey="note">{{notes}}</textarea>
    <p class="keys"><button type="button" class="link" data-event="skip" data-id="{{id}}" data-order="{{order}}" data-hotkey="skip">Skip for now</button><span>Keys 1 to {{result.labels|count}} label it; S skips it; Z changes the last one; N writes a note.</span></p>
  </article>{{/.}}
  {{^.|where:done!=true|first}}<div class="all"><b>All {{.|count}} are labelled.</b> See how you and the model compare under Agreement, look through the Disagreements, then download or publish the set under Export.</div>{{/.}}
</div>`,
      css: String.raw`
.wb { display: flex; flex-direction: column; gap: 14px; }
.progress { height: 8px; border-radius: 999px; background: var(--n-soft); overflow: hidden; }
.fill { display: block; height: 100%; border-radius: 999px; background: var(--n-accent); transition: width .25s ease; }
.nums { margin: -6px 0 0; color: var(--n-muted); font-size: 13.5px; }
.nums b { color: var(--n-fg); font-variant-numeric: tabular-nums; }
.last { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; padding: 10px 14px; border: 1px solid var(--n-line); border-left: 4px solid var(--n-ok); border-radius: var(--n-radius); background: var(--n-card); font-size: 14px; }
.last.differ { border-left-color: var(--n-warn); }
.last .what { color: var(--n-muted); font-size: 12.5px; }
.last .why { flex-basis: 100%; color: var(--n-muted); font-style: italic; }
.last .link { margin-left: auto; }
.item { padding: 20px 22px; border: 1px solid var(--n-line); border-radius: calc(var(--n-radius) + 4px); background: var(--n-card); }
.meta { margin: 0 0 10px; color: var(--n-muted); font-size: 12.5px; }
.text { max-height: 46vh; overflow-y: auto; font-size: 17px; line-height: 1.6; overflow-wrap: anywhere; }
.choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 8px; margin-top: 18px; }
.choice { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 10px 14px; border: 1px solid var(--n-line); border-radius: 12px; background: var(--n-bg); color: var(--n-fg); font: inherit; font-size: 15.5px; font-weight: 600; text-align: left; cursor: pointer; }
.choice:hover { border-color: var(--n-accent); background: var(--n-accent-soft); }
.choice:active { transform: translateY(1px); }
.choice span { overflow-wrap: anywhere; }
kbd { display: inline-grid; place-items: center; flex: none; min-width: 24px; height: 24px; padding: 0 5px; border-radius: 6px; background: var(--n-soft); color: var(--n-muted); font: 600 12.5px var(--n-mono); }
.note { display: block; box-sizing: border-box; width: 100%; margin-top: 12px; padding: 8px 10px; border: 1px solid var(--n-line); border-radius: 10px; background: var(--n-card); color: var(--n-fg); font: inherit; font-size: 14px; resize: vertical; }
.note:focus { outline: none; border-color: var(--n-accent); box-shadow: 0 0 0 3px var(--n-accent-soft); }
.keys { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; margin: 12px 0 0; color: var(--n-muted); font-size: 12.5px; }
.all { padding: 18px 20px; border: 1px dashed var(--n-line); border-radius: var(--n-radius); font-size: 14.5px; line-height: 1.55; }
@media (max-width: 520px) { .item { padding: 16px; } .text { font-size: 16px; } .keys span { display: none; } }
` + LINK_CSS,
    },
    pair: {
      description: 'A text you and the model labelled differently: your label and notes beside the model’s label and why',
      html: String.raw`<article class="pair">
  <p class="meta">Text {{n}}{{#ref}} · {{ref}}{{/ref}}</p>
  <div class="text">{{text|lines}}</div>
  <div class="sides">
    <div class="side you"><span class="who">You</span><b>{{label}}</b>{{#notes}}<p>{{notes}}</p>{{/notes}}</div>
    <div class="side model"><span class="who">The model</span><b>{{model|or:No label}}</b>{{#reason}}<p>{{reason}}</p>{{/reason}}</div>
  </div>
  <p class="acts"><button type="button" class="link" data-event="reopen" data-id="{{id}}">Label it again</button></p>
</article>`,
      css: String.raw`
.pair { padding: 16px 18px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.meta { margin: 0 0 8px; color: var(--n-muted); font-size: 12.5px; }
.text { font-size: 15px; line-height: 1.55; overflow-wrap: anywhere; }
.sides { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.side { padding: 10px 12px; border-radius: 10px; background: var(--n-soft); font-size: 14px; }
.side.you { box-shadow: inset 3px 0 0 var(--n-accent); }
.side.model { box-shadow: inset 3px 0 0 var(--n-warn); }
.who { display: block; margin-bottom: 2px; color: var(--n-muted); font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.side b { font-size: 15px; }
.side p { margin: 6px 0 0; color: var(--n-muted); line-height: 1.45; }
.acts { margin: 10px 0 0; }
@media (max-width: 520px) { .sides { grid-template-columns: 1fr; } }
` + LINK_CSS,
    },
    agreement: {
      description: 'How well you and the model agree: the share of texts you labelled the same, Cohen’s kappa and what chance alone would give, and the confusion matrix',
      html: String.raw`<div class="ag">
  <div class="stats">
    <div class="stat"><b>{{state.agree.po|percent|or:—}}</b><span>the same label, on {{state.agree.same|or:0}} of {{state.agree.n|or:0}} texts</span></div>
    <div class="stat"><b>{{state.agree.kappa|number|or:—}}</b><span>Cohen’s κ{{#state.agree.level|is:1}}: poor{{/state.agree.level}}{{#state.agree.level|is:2}}: slight{{/state.agree.level}}{{#state.agree.level|is:3}}: fair{{/state.agree.level}}{{#state.agree.level|is:4}}: moderate{{/state.agree.level}}{{#state.agree.level|is:5}}: substantial{{/state.agree.level}}{{#state.agree.level|is:6}}: almost perfect{{/state.agree.level}}</span></div>
    <div class="stat"><b>{{state.agree.pe|percent|or:—}}</b><span>what chance alone would give</span></div>
  </div>
  <h3 class="sub">Your labels down the side, the model’s across the top</h3>
  <n-widget name="agreement" value="{{.|json}}" labels="{{result.labels|json}}"></n-widget>
  <p class="note">The same label counts the texts you both labelled alike. Cohen’s κ is that agreement beyond what chance alone would give, from how often each of you gave each label: 1 is perfect agreement, 0 no better than chance; above 0.6 is usually taken as substantial, above 0.8 as almost perfect. Texts the model gave no label are left out.</p>
</div>`,
      css:
        STATS_CSS +
        String.raw`
.ag { display: flex; flex-direction: column; gap: 14px; }
.sub { margin: 4px 0 -4px; font-size: 13px; font-weight: 600; color: var(--n-muted); }
.note { margin: 0; max-width: 72ch; color: var(--n-muted); font-size: 13px; line-height: 1.5; }
`,
    },
    export: {
      description: 'The labelled texts to download as CSV or JSON lines, to publish as a dataset on Hugging Face with its card, or to remove',
      html: String.raw`<div class="ex">
  <section class="card">
    <h3>Download</h3>
    <p>The {{.|count}} texts you have labelled, each with your label, the model’s and why it gave it, and your notes.</p>
    <div class="row"><button type="button" class="n-btn" data-event="csv">CSV</button><button type="button" class="n-btn" data-event="jsonl">JSON lines</button></div>
  </section>
  <section class="card">
    <h3>Publish on Hugging Face</h3>
    <p>A dataset of its own on huggingface.co: the texts you labelled with your labels and the model’s, and a card that says how they were labelled and how well you and the model agreed.</p>
    <form class="pub" data-event="publish">
      <label class="n-field">Its name<input name="repo" required placeholder="your-name/my-labels" value="{{state.pub.result.repo}}"></label>
      <label class="n-field">Who sees it<select name="visibility"><option value="private">Only you (private)</option><option value="public">Everyone (public)</option></select></label>
      <div class="row">
        <button type="submit" class="n-btn n-primary">Publish</button>
        {{#state.pub.working}}<span class="st">Publishing…</span>{{/state.pub.working}}
        {{^state.pub.working}}{{#state.pub.error}}<span class="st err">{{state.pub.error}}</span>{{/state.pub.error}}{{#state.pub.result.url}}<a class="st ok" href="{{state.pub.result.url}}" target="_blank" rel="noopener noreferrer">Published: open it on Hugging Face ↗</a>{{/state.pub.result.url}}{{/state.pub.working}}
      </div>
    </form>
    <p class="hint">It needs your Hugging Face token, one that can write: the first time, add it on the app’s page, under its form, or in Keys as HF_TOKEN.</p>
  </section>
  <section class="card quiet">
    <h3>Remove the set</h3>
    <p>Its texts and your labels go; the run that loaded it stays.</p>
    <div class="row"><button type="button" class="n-btn" data-event="clear">Remove its texts</button>{{#state.cleared.working}}<span class="st">Removing…</span>{{/state.cleared.working}}</div>
  </section>
</div>`,
      css:
        CARD_CSS +
        String.raw`
.ex { display: grid; gap: 14px; }
.card p { margin: 0 0 12px; font-size: 14px; line-height: 1.5; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.pub { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 10px 12px; align-items: end; }
.pub .row { grid-column: 1 / -1; }
.pub .n-field { margin: 0; }
.hint { margin: 12px 0 0 !important; color: var(--n-muted); font-size: 12.5px !important; }
.quiet { background: none; }
@media (max-width: 520px) { .pub { grid-template-columns: 1fr; } }
` + LINK_CSS,
    },
  },
  widgets: {
    keys: { code: KEYS_WIDGET, height: '0px', description: 'Keys for labelling: 1 to 9 press a label’s button, S skips, Z changes the last one, N writes a note' },
    agreement: { code: AGREEMENT_WIDGET, css: AGREEMENT_WIDGET_CSS, height: '120px', description: 'The confusion matrix of your labels against the model’s, with the agreement worked out for the page' },
  },
  events: {
    label: [{ do: 'data', op: 'update', collection: 'items', id: '{{event.id}}', record: { label: '{{event.label}}', done: true, agree: '{{event.label|is:$event.model}}' } }],
    reopen: [{ do: 'data', op: 'update', collection: 'items', id: '{{event.id}}', record: { label: '', done: false, agree: '' } }],
    skip: [{ do: 'data', op: 'update', collection: 'items', id: '{{event.id}}', record: { order: '{{event.order|plus:100000}}' } }],
    note: [{ do: 'data', op: 'update', collection: 'items', id: '{{event.id}}', record: { notes: '{{event.value}}' } }],
    csv: [{ do: 'open', url: '/api/apps/{{app.id|url}}/data/items?where=%7B%22sample%22%3A%22{{run.id|url}}%22%2C%22done%22%3Atrue%7D&sort=n&format=csv&fields=n,ref,text,label,model,reason,agree,notes&name=labels-{{run.id|url}}' }],
    jsonl: [{ do: 'open', url: '/api/apps/{{app.id|url}}/data/items?where=%7B%22sample%22%3A%22{{run.id|url}}%22%2C%22done%22%3Atrue%7D&sort=n&format=jsonl&fields=n,ref,text,label,model,reason,agree,notes&name=labels-{{run.id|url}}' }],
    publish: [
      {
        do: 'run',
        flow: 'publish',
        inputs: { sample: '{{run.id}}', repo: '{{event.repo}}', private: '{{event.visibility|is:private}}', name: '{{result.name}}', source: '{{result.source}}', labels: '{{result.labels|join:, }}', guidelines: '{{result.guidelines}}' },
        as: 'pub',
      },
    ],
    clear: [{ do: 'run', confirm: 'Remove this set’s texts and your labels? It cannot be undone; download them first if you want to keep them.', flow: 'clear', inputs: { sample: '{{run.id}}' }, as: 'cleared' }],
  },
};

// ---- Research sprint -----------------------------------------------------------------------------------------------

const SPRINT_UI: AppUi = {
  pages: [
    {
      id: 'sprint',
      title: 'The sprint',
      blocks: [
        { element: 'sprint-hero' },
        { title: 'Hypotheses', element: 'hypothesis', data: 'result.hypotheses', each: true, layout: 'grid', empty: 'No hypotheses' },
      ],
    },
    {
      id: 'runs',
      title: 'Runs',
      if: 'result.runs',
      blocks: [
        { title: 'Each condition against the baseline', text: '{{result.results}}', if: 'result.results' },
        {
          title: 'Its runs',
          element: 'table',
          data: 'result.runs',
          with: {
            columns: [
              { id: 'name', label: 'Run' },
              { id: 'condition', label: 'Condition' },
              { id: 'hypothesis', label: 'Hypothesis' },
              { id: 'status', label: 'Status' },
              { id: 'value', label: 'The metric', type: 'number' },
            ],
          },
        },
      ],
    },
    {
      id: 'report',
      title: 'Report',
      if: 'result.report',
      blocks: [{ element: 'sprint-report' }],
    },
  ],
  elements: {
    'sprint-hero': {
      description: 'The question, how the sprint went, its branch, and the sprint in numbers',
      html: String.raw`<header class="hero">
  <p class="kicker">Research sprint</p>
  <h1>{{result.question|short:240}}</h1>
  <p class="sub">{{result.status}}</p>
  <div class="stats">
    <div class="stat"><b>{{result.hypotheses|count}}</b><span>hypotheses</span></div>
    <div class="stat"><b>{{result.hypotheses|where:mark=supported|count}}</b><span>supported</span></div>
    <div class="stat"><b>{{result.runs|count}}</b><span>runs</span></div>
    <div class="stat"><b>{{result.hours|number|or:0}}</b><span>GPU hours</span></div>
  </div>
  {{#result.branch}}<p class="branch"><span class="n-tag">{{result.branch}}</span>{{#result.worktree}}<code>{{result.worktree}}</code>{{/result.worktree}}</p>{{/result.branch}}
</header>`,
      css:
        HERO_CSS +
        STATS_CSS +
        String.raw`
.branch { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 14px 0 0; font-size: 13px; }
code { padding: 1px 6px; border-radius: 6px; background: var(--n-soft); font: 12.5px var(--n-mono); overflow-wrap: anywhere; }
`,
    },
    hypothesis: {
      description: 'A hypothesis, with its verdict, the evidence, and what would support it or count against it',
      html: String.raw`<article class="hyp {{mark}}">
  <div class="top"><span class="id">{{id}}</span><span class="verdict">{{#mark|is:supported}}Supported{{/mark}}{{#mark|is:refuted}}Not supported{{/mark}}{{#mark|is:unclear}}Unclear{{/mark}}{{#mark|is:untested}}Not tested{{/mark}}</span></div>
  <p class="h">{{hypothesis}}</p>
  {{#evidence}}<p class="ev">{{evidence}}</p>{{/evidence}}
  {{#confirm}}<p class="crit"><b>Supported if</b> {{confirm}}</p>{{/confirm}}
  {{#refute}}<p class="crit"><b>Against it</b> {{refute}}</p>{{/refute}}
</article>`,
      css: String.raw`
.hyp { display: flex; flex-direction: column; gap: 8px; height: 100%; box-sizing: border-box; padding: 14px 16px; border: 1px solid var(--n-line); border-top: 4px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.hyp.supported { border-top-color: var(--n-ok); } .hyp.refuted { border-top-color: var(--n-err); } .hyp.unclear { border-top-color: var(--n-warn); }
.top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.id { display: grid; place-items: center; min-width: 30px; height: 26px; padding: 0 6px; border-radius: 8px; background: var(--n-accent-soft); color: var(--n-accent); font-size: 13px; font-weight: 700; }
.verdict { padding: 2px 10px; border-radius: 999px; background: var(--n-soft); color: var(--n-muted); font-size: 12.5px; font-weight: 600; }
.supported .verdict { background: color-mix(in srgb, var(--n-ok) 16%, transparent); color: var(--n-ok); }
.refuted .verdict { background: color-mix(in srgb, var(--n-err) 14%, transparent); color: var(--n-err); }
.unclear .verdict { background: color-mix(in srgb, var(--n-warn) 16%, transparent); color: var(--n-warn); }
.h { margin: 0; font-size: 15.5px; font-weight: 600; line-height: 1.4; }
.ev { margin: 0; font-size: 14px; line-height: 1.5; }
.crit { margin: 0; color: var(--n-muted); font-size: 13px; line-height: 1.45; }
.crit b { color: var(--n-fg); font-weight: 600; }
`,
    },
    'sprint-report': {
      description: 'The report to read and copy, its notebook, and what to try next',
      html: String.raw`<article class="doc">
  <div class="tools"><span>{{result.status}}</span><span class="btns">{{#result.notebook}}<button type="button" class="n-btn" data-event="open_notebook">Open the notebook</button>{{/result.notebook}}<button type="button" class="n-btn" data-event="copy_report">Copy the report</button></span></div>
  <div class="body">{{result.report|markdown}}</div>
  {{#result.next|count}}<section class="next"><h3>What to try next</h3><ul>{{#result.next}}<li>{{.}}</li>{{/result.next}}</ul></section>{{/result.next}}
</article>`,
      css: String.raw`
.doc { padding: 22px 26px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--n-line); color: var(--n-muted); font-size: 13px; }
.btns { display: flex; flex-wrap: wrap; gap: 8px; }
.body { max-width: 72ch; font-size: 15.5px; line-height: 1.65; overflow-wrap: anywhere; }
.body h2 { font-size: 20px; margin: 4px 0 10px; } .body h3 { font-size: 16.5px; margin: 20px 0 8px; }
.body p { margin: 0 0 12px; } .body ul, .body ol { margin: 0 0 12px; padding-left: 22px; }
.body table { width: 100%; border-collapse: collapse; font-size: 14px; } .body th, .body td { padding: 6px 8px; border-bottom: 1px solid var(--n-line); text-align: left; }
.next { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--n-line); }
.next h3 { margin: 0 0 6px; font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--n-muted); }
.next ul { margin: 0; padding-left: 20px; line-height: 1.55; }
@media (max-width: 520px) { .doc { padding: 16px; } }
`,
    },
  },
  events: {
    open_notebook: [{ do: 'open', url: '{{result.notebook}}' }],
    copy_report: [{ do: 'copy', text: '{{result.report}}' }],
  },
};

// ---- Sweep planner -------------------------------------------------------------------------------------------------

const SWEEP_UI: AppUi = {
  pages: [
    {
      id: 'results',
      title: 'Results',
      blocks: [
        { element: 'sweep-hero' },
        { title: 'What it found', text: '{{result.summary}}', width: 'two-thirds' },
        { title: 'What to try next', element: 'list', data: 'result.next', width: 'third', if: 'result.next' },
        { title: 'How much each setting mattered', element: 'mattered', data: 'result.mattered', each: true, empty: 'No setting could be compared' },
      ],
    },
    {
      id: 'settings',
      title: 'By setting',
      if: 'result.mattered',
      blocks: [{ element: 'setting-plot', data: 'result.mattered', each: true, layout: 'grid' }],
    },
    {
      id: 'runs',
      title: 'All runs',
      if: 'result.runs',
      blocks: [
        {
          element: 'table',
          data: 'result.runs',
          with: {
            columns: [
              { id: 'settings', label: 'Settings' },
              { id: 'value', label: 'The metric', type: 'number' },
              { id: 'status', label: 'Status' },
              { id: 'id', label: 'Run' },
            ],
          },
        },
      ],
    },
  ],
  elements: {
    'sweep-hero': {
      description: 'The best settings and their metric, and the sweep in numbers',
      html: String.raw`<header class="hero">
  <p class="kicker">The best run · {{inputs.metric}}, {{#inputs.better|is:Higher}}higher is better{{/inputs.better}}{{^inputs.better|is:Higher}}lower is better{{/inputs.better}}</p>
  <h1><span class="v">{{result.best_value|number}}</span> {{result.best}}</h1>
  <div class="stats">
    <div class="stat"><b>{{result.count}}</b><span>runs</span></div>
    <div class="stat"><b>{{result.stopped|or:0}}</b><span>stopped early</span></div>
    <div class="stat"><b>{{result.mattered|count}}</b><span>settings</span></div>
    <div class="stat"><b>{{result.hours|number|or:0}}</b><span>GPU hours planned</span></div>
  </div>
</header>`,
      css:
        HERO_CSS +
        STATS_CSS +
        String.raw`
h1 { overflow-wrap: anywhere; }
.v { padding: 0 8px; border-radius: 8px; background: var(--n-accent-soft); color: var(--n-accent); font-variant-numeric: tabular-nums; }
`,
    },
    mattered: {
      description: 'A setting: how much of the metric’s spread its values account for, its best value, and the metric for each value',
      html: String.raw`<div class="m">
  <div class="name"><b>{{setting}}</b><span>best at {{best}}</span></div>
  <div class="bar"><span style="width: {{effect|times:100}}%"></span></div>
  <div class="pct">{{effect|percent}}</div>
  <p class="means">{{means}}</p>
</div>`,
      css: String.raw`
.m { display: grid; grid-template-columns: minmax(110px, 28%) 1fr 56px; gap: 4px 14px; align-items: center; padding: 10px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.name { display: flex; flex-direction: column; min-width: 0; }
.name b { overflow: hidden; text-overflow: ellipsis; font-family: var(--n-mono); font-size: 14px; }
.name span { color: var(--n-muted); font-size: 12.5px; }
.bar { height: 10px; border-radius: 999px; background: var(--n-soft); overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: 999px; background: var(--n-accent); }
.pct { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.means { grid-column: 1 / -1; margin: 2px 0 0; color: var(--n-muted); font-size: 12.5px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
`,
    },
    'setting-plot': {
      description: 'A setting against the metric: a box for each of its values, from the runs that tried it',
      html: String.raw`<section class="sp">
  <h3><span class="k">{{setting}}</span><span>explains {{effect|percent}} of the spread · best at {{best}}</span></h3>
  <n-plot value="{{result.points|where:setting=$setting|json}}" kind="box" x="value" y="metric" series="value" height="260" y-label="{{inputs.metric}}"></n-plot>
</section>`,
      css: String.raw`
.sp { padding: 12px 14px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
h3 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0 0 6px; font-size: 14px; font-weight: 600; }
.k { font-family: var(--n-mono); }
h3 span:last-child { color: var(--n-muted); font-size: 12.5px; font-weight: 400; }
`,
    },
  },
};

// ---- Weekly progress report ------------------------------------------------------------------------------------------

const REPORT_HEAD = String.raw`<header class="hero">
  <p class="kicker">Weekly report · {{week}}{{#audience|is:Your advisor}} · for your advisor{{/audience}}{{#audience|is:Your team}} · for your team{{/audience}}{{#audience|is:A manager}} · for a manager{{/audience}}</p>
  <h1>{{title}}</h1>
  {{#summary}}<p class="lead">{{summary}}</p>{{/summary}}
  {{#stats|count}}<p class="nums">{{#stats}}<span><b>{{count}}</b> {{#what|is:Sessions}}sessions{{/what}}{{#what|is:Commits}}commits{{/what}}{{#what|is:Experiment runs}}experiment runs{{/what}}{{#what|is:Made in the Library}}made in the Library{{/what}}{{#what|is:Papers read}}papers read{{/what}}</span>{{/stats}}</p>{{/stats}}
  <div class="acts">
    <button type="button" class="n-btn" data-event="copy_md">Copy as Markdown</button>
    <button type="button" class="n-btn" data-event="copy_email">Copy as an email</button>
    <button type="button" class="n-btn" data-event="save">Save as a document</button>
    {{#state.saved.working}}<span class="st">Saving…</span>{{/state.saved.working}}
    {{^state.saved.working}}{{#state.saved.result.page}}<button type="button" class="link" data-event="open_doc" data-url="{{state.saved.result.page}}">Saved: open the document</button>{{/state.saved.result.page}}{{#state.saved.error}}<span class="st err">{{state.saved.error}}</span>{{/state.saved.error}}{{/state.saved.working}}
  </div>
</header>`;

const REPORT_HEAD_CSS =
  HERO_CSS +
  LINK_CSS +
  String.raw`
.lead { margin: 8px 0 0; max-width: 68ch; font-size: 15.5px; line-height: 1.55; }
.nums { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 12px 0 0; color: var(--n-muted); font-size: 13px; }
.nums b { color: var(--n-fg); font-variant-numeric: tabular-nums; }
.acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin-top: 16px; }
`;

const REPORT_BODY = String.raw`<div class="parts">
  {{#done|count}}<section><h3>Done</h3><ul>{{#done}}<li>{{.}}</li>{{/done}}</ul></section>{{/done}}
  {{#results|count}}<section><h3>Results</h3><ul>{{#results}}<li>{{.}}</li>{{/results}}</ul></section>{{/results}}
  {{#problems|count}}<section class="warn"><h3>Problems and blockers</h3><ul>{{#problems}}<li>{{.}}</li>{{/problems}}</ul></section>{{/problems}}
  {{#next|count}}<section><h3>Next week</h3><ul>{{#next}}<li>{{.}}</li>{{/next}}</ul></section>{{/next}}
  {{#questions|count}}<section><h3>Questions</h3><ul>{{#questions}}<li>{{.}}</li>{{/questions}}</ul></section>{{/questions}}
</div>`;

const REPORT_BODY_CSS =
  PARTS_CSS +
  String.raw`
.parts { padding: 18px 20px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
.warn h3 { color: var(--n-warn); }
`;

/** The report's blocks, from its answer (`result`, a run's page) or its latest run's (`last.result`, the app's own page). */
const report = (from: string) => [
  { element: 'report-head', data: from },
  { element: 'report-body', data: from },
];

const WEEKLY_UI: AppUi = {
  pages: [
    // The app's own page: this week's report (the page lists the earlier weeks under it).
    { id: 'home', title: 'This week', on: 'app', blocks: report('last.result') },
    // A week's own page (a run's).
    { id: 'report', title: 'The report', blocks: report('result') },
  ],
  elements: {
    'report-head': { description: 'The week, its title and summary, the week in numbers, and the buttons to copy it or save it as a document', html: REPORT_HEAD, css: REPORT_HEAD_CSS },
    'report-body': { description: 'What got done, the results, problems and blockers, next week’s plan and questions to ask', html: REPORT_BODY, css: REPORT_BODY_CSS },
  },
  events: {
    copy_md: [{ do: 'copy', text: '{{item.markdown}}' }],
    copy_email: [{ do: 'copy', text: 'Subject: {{item.subject}}\n\n{{item.email}}' }],
    save: [{ do: 'run', flow: 'save', inputs: { title: '{{item.title}} ({{item.week}})', markdown: '{{item.markdown}}' }, as: 'saved' }],
    open_doc: [{ do: 'open', url: '{{event.url}}' }],
  },
};

// ---- Lab notebook ----------------------------------------------------------------------------------------------------

const ENTRY = String.raw`<article class="entry">
  <header>
    <time class="date" datetime="{{date}}"><b>{{date|day}}</b><span>{{date|month}} {{date|year}}</span></time>
    <div class="head"><p class="wd">{{date|weekday}}</p><h2>{{title}}</h2>{{#summary}}<p class="sum">{{summary}}</p>{{/summary}}</div>
  </header>
  <div class="parts">
    {{#tried|count}}<section><h3>Tried</h3><ul>{{#tried}}<li>{{.}}</li>{{/tried}}</ul></section>{{/tried}}
    {{#found|count}}<section><h3>Found</h3><ul>{{#found}}<li>{{.}}</li>{{/found}}</ul></section>{{/found}}
    {{#decided|count}}<section><h3>Decided</h3><ul>{{#decided}}<li>{{.}}</li>{{/decided}}</ul></section>{{/decided}}
    {{#open|count}}<section><h3>Open questions</h3><ul>{{#open}}<li>{{.}}</li>{{/open}}</ul></section>{{/open}}
  </div>
  {{#links|count}}<p class="links">{{#links}}{{#url}}<a href="{{url}}" class="lk {{kind|slug}}" data-event="go" data-url="{{url}}">{{title}}</a>{{/url}}{{^url}}<span class="lk {{kind|slug}}">{{title}}</span>{{/url}}{{/links}}</p>{{/links}}
  {{#link}}<footer><button type="button" class="link" data-event="copy_link">Copy its link</button></footer>{{/link}}
</article>`;

const ENTRY_CSS =
  PARTS_CSS +
  LINK_CSS +
  String.raw`
.entry { padding: 18px 20px; border: 1px solid var(--n-line); border-radius: var(--n-radius); background: var(--n-card); }
header { display: grid; grid-template-columns: 64px 1fr; gap: 16px; margin-bottom: 14px; }
.date { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 64px; border-radius: 14px; background: var(--n-accent-soft); color: var(--n-accent); }
.date b { font-size: 24px; line-height: 1; }
.date span { margin-top: 3px; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.wd { margin: 0; color: var(--n-muted); font-size: 12.5px; }
h2 { margin: 2px 0 4px; font-size: 18px; line-height: 1.3; }
.sum { margin: 0; font-size: 14.5px; line-height: 1.5; }
.links { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 0; }
.lk { max-width: 100%; overflow: hidden; padding: 3px 10px; border: 1px solid var(--n-line); border-radius: 999px; color: var(--n-muted); font-size: 12.5px; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
a.lk { color: var(--n-fg); }
a.lk:hover { border-color: var(--n-accent); color: var(--n-accent); }
.lk.commit, .lk.file { font-family: var(--n-mono); font-size: 12px; }
footer { margin-top: 12px; }
@media (max-width: 520px) { header { grid-template-columns: 52px 1fr; gap: 12px; } .date { height: 52px; } .date b { font-size: 20px; } }
`;

const NOTEBOOK_UI: AppUi = {
  pages: [
    {
      id: 'notebook',
      title: 'Lab notebook',
      on: 'app',
      blocks: [
        { element: 'notebook-head' },
        {
          title: 'Found for “{{state.q}}”',
          element: 'entry',
          data: 'state.found.result.entries',
          each: true,
          if: 'state.q',
          empty: '{{#state.found.working}}Searching…{{/state.found.working}}{{^state.found.working}}Nothing in the notebook matches that.{{/state.found.working}}',
        },
        { element: 'entry', data: 'data.entries', sort: '-date', limit: 400, each: true, if: '!state.q', empty: 'No entries yet. Each evening it writes the day’s entry when you worked that day; Update writes today’s now.' },
      ],
    },
    {
      id: 'entry',
      title: 'The entry',
      blocks: [
        { element: 'entry', data: 'result', if: 'result.kept' },
        { text: 'Nothing was done on {{result.day}}, so the notebook has no entry for it.', if: '!result.kept' },
      ],
    },
  ],
  elements: {
    'notebook-head': {
      description: 'A search of the notebook, by words and meaning, and a form to write an earlier day',
      html: String.raw`<div class="nh">
  <form class="search" data-event="find" role="search">
    <input type="search" name="q" value="{{state.q}}" placeholder="Search the notebook, by words or meaning" aria-label="Search the notebook">
    <button type="submit" class="n-btn">Search</button>
    {{#state.q}}<button type="button" class="link" data-event="all">All entries</button>{{/state.q}}
  </form>
  <details class="earlier"><summary>Write an earlier day</summary>
    <form class="row" data-event="earlier">
      <input type="date" name="date" required max="{{today}}" aria-label="The day">
      <button type="submit" class="n-btn">Write it</button>
      {{#state.early.working}}<span class="st">Writing…</span>{{/state.early.working}}
      {{^state.early.working}}{{#state.early.error}}<span class="st err">{{state.early.error}}</span>{{/state.early.error}}{{#state.early.result.title}}<span class="st ok">{{state.early.result.title}}</span>{{/state.early.result.title}}{{/state.early.working}}
    </form>
  </details>
</div>`,
      css:
        LINK_CSS +
        String.raw`
.nh { display: flex; flex-direction: column; gap: 10px; }
.search, .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
input { box-sizing: border-box; height: 36px; padding: 0 12px; border: 1px solid var(--n-line); border-radius: 10px; background: var(--n-card); color: var(--n-fg); font: inherit; font-size: 15px; }
input[type=search] { flex: 1 1 260px; min-width: 0; }
input:focus { outline: none; border-color: var(--n-accent); box-shadow: 0 0 0 3px var(--n-accent-soft); }
.earlier summary { color: var(--n-accent); font-size: 13.5px; cursor: pointer; }
.earlier .row { margin-top: 8px; }
`,
    },
    entry: { description: 'A day’s entry: its date, title and summary, what was tried, found and decided, open questions, its links, and its own link to copy', html: ENTRY, css: ENTRY_CSS },
  },
  events: {
    find: [
      { do: 'set', name: 'q', value: '{{event.q}}' },
      { do: 'run', flow: 'search', inputs: { question: '{{event.q}}' }, as: 'found' },
    ],
    all: [
      { do: 'set', name: 'q', value: '' },
      { do: 'set', name: 'found', value: '' },
    ],
    earlier: [{ do: 'run', flow: 'earlier', inputs: { date: '{{event.date}}', projects: '{{last.inputs.projects}}' }, as: 'early' }],
    copy_link: [{ do: 'copy', text: '{{item.link}}' }],
    go: [{ do: 'open', url: '{{event.url}}' }],
  },
};

export const LAB_VIEWS: Record<string, AppUi> = {
  'annotation-workbench': ANNOTATE_UI,
  'research-sprint': SPRINT_UI,
  'sweep-planner': SWEEP_UI,
  'weekly-report': WEEKLY_UI,
  'lab-notebook': NOTEBOOK_UI,
};
