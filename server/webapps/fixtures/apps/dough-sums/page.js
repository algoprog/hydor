'use strict';
const { FIELDS, workOut } = require('./sums');

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STYLE = `
:root{color-scheme:light dark;
  --bg:#f6eedf;--card:#fffaf0;--ink:#33241a;--soft:#6b5443;--line:#d9c4a3;
  --crust:#8f4a1d;--on-crust:#fff8ec;--bad-bg:#fbe3d6;--bad:#8c2408}
@media (prefers-color-scheme:dark){:root{
  --bg:#1d1611;--card:#2a2019;--ink:#f6ead6;--soft:#cdb89a;--line:#55412f;
  --crust:#e8ad6a;--on-crust:#24160a;--bad-bg:#48201a;--bad:#ffc9b8}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:1.125rem/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:32rem;margin:0 auto;padding:1rem 1rem 3rem}
h1{font-family:Georgia,"Times New Roman",serif;font-size:2.4rem;margin:.4rem 0 0;color:var(--crust)}
h2{font-size:1.35rem;margin:0 0 .5rem}
p{margin:.4rem 0}
.soft{color:var(--soft)}
.card{background:var(--card);border:2px solid var(--line);border-radius:1rem;padding:1rem;margin-top:1rem}
label{display:block;font-weight:700;margin:.9rem 0 .3rem}
label:first-of-type{margin-top:0}
.row{display:flex;gap:.5rem;align-items:stretch}
input{flex:1;min-width:0;width:100%;height:3.75rem;font:inherit;font-size:1.75rem;font-weight:700;text-align:center;
  color:var(--ink);background:var(--bg);border:2px solid var(--line);border-radius:.75rem}
input[aria-invalid=true]{border-color:var(--bad);border-width:3px}
.step{flex:0 0 4rem;font:inherit;font-size:2rem;font-weight:700;color:var(--crust);background:var(--bg);
  border:2px solid var(--line);border-radius:.75rem;touch-action:manipulation;cursor:pointer}
fieldset{border:0;border-top:2px dashed var(--line);margin:1.25rem 0 0;padding:.75rem 0 0;min-width:0}
legend{font-weight:700;padding:0 .5rem 0 0}
.three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem}
.three label{margin:.4rem 0 .3rem}
.go{display:block;width:100%;min-height:4.25rem;margin-top:1.25rem;font:inherit;font-size:1.5rem;font-weight:700;
  color:var(--on-crust);background:var(--crust);border:0;border-radius:.9rem;touch-action:manipulation;cursor:pointer}
:focus-visible{outline:4px solid var(--crust);outline-offset:2px}
#answer{scroll-margin-top:.5rem}
dl{margin:.5rem 0 0}
dl div{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;padding:.55rem 0;border-bottom:2px solid var(--line)}
dt{font-size:1.5rem;font-weight:700}
dd{margin:0;font-size:2.6rem;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
dd small{font-size:1.4rem;font-weight:700;color:var(--soft)}
dl .total{border-bottom:0}
.total dt{font-size:1.15rem;color:var(--soft)}
.total dd{font-size:1.7rem}
.bad{background:var(--bad-bg);border-color:var(--bad);color:var(--bad);font-weight:700}
.stale-note{display:none;font-weight:700;font-size:1.3rem}
.stale .stale-note{display:block}
.stale .fresh{display:none}
`;

// Extras only: everything works without this script.
const SCRIPT = `
(function () {
  var form = document.getElementById('sums');
  var inputs = Array.prototype.slice.call(form.querySelectorAll('input'));
  var answer = document.getElementById('answer');

  // Never leave old weights on show beside new numbers.
  function check() {
    if (!answer) return;
    answer.classList.toggle('stale', inputs.some(function (i) { return i.value !== i.defaultValue; }));
  }
  form.addEventListener('input', check);
  window.addEventListener('pageshow', check);

  Array.prototype.forEach.call(document.querySelectorAll('.step'), function (b) {
    b.hidden = false;
    b.addEventListener('click', function () {
      var i = document.getElementById(b.dataset.for);
      var by = Number(b.dataset.by);
      var min = Number(i.dataset.min), max = Number(i.dataset.max);
      var now = Number(i.value);
      var next = i.value.trim() === '' || !isFinite(now) ? Number(i.dataset.start) : Math.round(now) + by;
      i.value = Math.min(max, Math.max(min, next));
      check();
    });
  });
})();
`;

function input(key, values, bad, extra) {
  const f = FIELDS[key];
  const value = values[key] !== undefined ? values[key] : f.usual !== undefined ? f.usual : '';
  const invalid = bad.has(key) ? ' aria-invalid="true" aria-describedby="problem"' : '';
  return `<input id="${key}" name="${key}" type="text" inputmode="${f.whole ? 'numeric' : 'decimal'}" autocomplete="off" enterkeyhint="go" value="${esc(value)}"${invalid}${extra || ''}>`;
}

function stepper(key, values, bad, by, start, what) {
  const f = FIELDS[key];
  const button = (n, sign, word) =>
    `<button type="button" class="step" hidden data-for="${key}" data-by="${n}" aria-label="${word} ${what}">${sign}</button>`;
  return `<div class="row">${button(-by, '−', 'Less:')}${input(
    key,
    values,
    bad,
    ` data-min="${f.min}" data-max="${f.max}" data-start="${start}"`
  )}${button(by, '+', 'More:')}</div>`;
}

function line(label, number, cls) {
  return `<div${cls ? ` class="${cls}"` : ''}><dt>${label}</dt><dd>${number} <small>g</small></dd></div>`;
}

function answerBlock(outcome) {
  if (!outcome) return '';
  if (!outcome.ok) {
    return `<section id="answer" class="card bad" role="alert">
<div class="fresh" id="problem">${outcome.errors.map((e) => `<p>${esc(e.message)}</p>`).join('')}</div>
<p class="stale-note">Now tap “Work it out”.</p>
</section>`;
  }
  const { used, result, starterBrings } = outcome;
  const loaves = used.loaves === 1 ? '1 loaf' : `${used.loaves} loaves`;
  return `<section id="answer" class="card" aria-live="polite">
<p class="stale-note">You have changed the numbers. Tap “Work it out” for the new weights.</p>
<div class="fresh">
<h2>Weigh out</h2>
<p class="soft">${loaves} of ${used.loafWeight} g · water ${used.water}% · salt ${used.salt}% · starter ${used.starter}%</p>
<dl>
${line('Flour', result.flour)}
${line('Water', result.water)}
${line('Salt', result.salt.toFixed(1))}
${line('Starter', result.starter)}
${line('Total dough', result.totalDough, 'total')}
</dl>
${
  used.starter > 0
    ? `<p class="soft">Your starter is already counted. It brings about ${starterBrings}&nbsp;g of flour and ${starterBrings}&nbsp;g of water, which have been taken off the flour and water above.</p>`
    : ''
}
</div>
</section>`;
}

/** query: a URLSearchParams. Sums are only done once something has been sent. */
function renderPage(query) {
  const values = {};
  let sent = false;
  for (const key of Object.keys(FIELDS)) {
    if (query.has(key)) {
      values[key] = query.get(key);
      sent = true;
    }
  }
  const outcome = sent ? workOut(values) : null;
  const bad = new Set(outcome && !outcome.ok ? outcome.errors.map((e) => e.field) : []);

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="apple-mobile-web-app-title" content="Dough Sums">
<meta name="theme-color" content="#f6eedf" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1d1611" media="(prefers-color-scheme: dark)">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8D%9E%3C/text%3E%3C/svg%3E">
<title>Dough Sums</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>Dough Sums</h1>
<p class="soft">How much flour, water, salt and starter to weigh out.</p>
<form id="sums" class="card" action="/#answer" method="get" novalidate>
<label for="loaves">Loaves (how many)</label>
${stepper('loaves', values, bad, 1, 1, 'loaves')}
<label for="loafWeight">Loaf weight (grams each)</label>
${stepper('loafWeight', values, bad, 50, 800, 'loaf weight')}
<fieldset>
<legend>Percent of the flour</legend>
<div class="three">
<div><label for="water">Water %</label>${input('water', values, bad, ' placeholder="72"')}</div>
<div><label for="salt">Salt %</label>${input('salt', values, bad, ' placeholder="2"')}</div>
<div><label for="starter">Starter %</label>${input('starter', values, bad, ' placeholder="20"')}</div>
</div>
<p class="soft">Usually 72, 2 and 20. Starter is half flour, half water.</p>
</fieldset>
<button class="go" type="submit">Work it out</button>
</form>
${answerBlock(outcome)}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

module.exports = { renderPage };
