# A dashboard page

A skeleton to save with `save_page` (or show once with `show_html`): number tiles with their change,
a line chart with labels at the line ends, a sorted bar chart with the top bar picked out, and a
detail table. It takes the app's theme from the page kit, redraws its charts when the app switches
between light and dark, and says when its data was last updated.

What to change: `TITLE`, `CURRENCY`, and `DATA` (the same shape, your numbers). For live data, set
`SOURCE` (below). Leave the rest as it is.

- `kpis`: `format` is `money`, `number` or `percent` (a share such as 0.034); `good` is `up` or `down`
  (for costs or returns, down is good); `dp` sets decimals.
- `trend.series` and `bars.items` take as many entries as you need; bars are sorted for you.
- Check that the numbers agree with each other (here the tiles, the October points and the bars all
  come to €18,420) before handing it over.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.6.1/dist/chart.umd.min.js"></script>
<style>
  .head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 16px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 14px 0; }
  .tile, .panel { background: var(--n-card); border: 1px solid var(--n-line); border-radius: var(--n-radius); padding: 12px 14px; }
  .tile .label { color: var(--n-muted); font-size: 13px; }
  .tile .value { font-size: 26px; font-weight: 650; line-height: 1.25; font-variant-numeric: tabular-nums; }
  .tile .delta { font-size: 13px; }
  .good { color: var(--n-ok); } .bad { color: var(--n-err); } .flat { color: var(--n-muted); }
  .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 12px; }
  .panel h2 { margin: 0 0 2px; font-size: 15px; }
  .panel p { margin: 0 0 8px; color: var(--n-muted); font-size: 13px; }
  .chart { position: relative; height: 240px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--n-line); }
  th.num, td.num { text-align: right; }
  #status { color: var(--n-warn); font-size: 13px; margin: 0; }
  #status:empty { display: none; }
</style>
</head>
<body class="n-page">
  <div class="head"><h1 id="title"></h1><span class="n-muted" id="updated"></span></div>
  <p id="status"></p>
  <div class="tiles" id="tiles"></div>
  <div class="panels">
    <section class="panel"><h2 id="trend-title"></h2><p id="trend-sub"></p><div class="chart"><canvas id="trend"></canvas></div></section>
    <section class="panel"><h2 id="bars-title"></h2><p id="bars-sub"></p><div class="chart"><canvas id="bars"></canvas></div></section>
  </div>
  <section class="panel" style="margin-top:12px"><h2 id="table-title"></h2><div class="n-scroll"><table id="table"></table></div></section>
<script>
// ---- Change these ----------------------------------------------------------------------------
const TITLE = "Shop sales";
const CURRENCY = "EUR";
const DATA = {
  updated: "2026-11-03T10:42:00",
  source: "the till export",
  compare: "vs September",
  kpis: [
    { label: "Revenue, October", value: 18420, prev: 16950, format: "money", good: "up" },
    { label: "Orders", value: 612, prev: 598, format: "number", good: "up" },
    { label: "Average order", value: 30.1, prev: 28.34, format: "money", dp: 2, good: "up" },
    { label: "Returns", value: 0.034, prev: 0.028, format: "percent", dp: 1, good: "down" },
  ],
  trend: {
    title: "Online overtook the shop in August",
    sub: "Revenue by month, 2026",
    format: "money",
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"],
    series: [
      { name: "Shop", values: [9100, 8800, 9400, 9300, 9000, 8700, 8200, 7900, 8100, 8500] },
      { name: "Online", values: [4200, 4500, 5100, 5600, 6300, 6900, 7600, 8300, 8850, 9920] },
    ],
  },
  bars: {
    title: "Coffee beans bring in the most",
    sub: "Revenue by product, October",
    format: "money",
    items: [
      { label: "Coffee beans", value: 6400 }, { label: "Tea", value: 3900 }, { label: "Gift boxes", value: 3100 },
      { label: "Cups and mugs", value: 2600 }, { label: "Chocolate", value: 2420 },
    ],
  },
  table: {
    title: "October by product",
    columns: ["Product", "Units", "Revenue"],
    formats: [null, "number", "money"],
    rows: [["Coffee beans", 320, 6400], ["Tea", 390, 3900], ["Gift boxes", 62, 3100], ["Cups and mugs", 208, 2600], ["Chocolate", 484, 2420]],
  },
};
// Live data (optional): a public address that lets pages fetch it (CORS). Never one that needs a key.
// map turns its answer into the shape of DATA. minutes: how old the kept copy may be before fetching again.
const SOURCE = null;
// ---- The rest stays as it is -------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const store = window.naget && window.naget.storage;
const charts = [];
let shown = null;

function fmt(v, format, dp) {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  if (format === "money") return new Intl.NumberFormat(undefined, { style: "currency", currency: CURRENCY, minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 }).format(v);
  if (format === "percent") return new Intl.NumberFormat(undefined, { style: "percent", minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 }).format(v);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: dp ?? 2 }).format(v);
}
function compact(v, format) {
  if (format === "percent") return fmt(v, "percent");
  const o = { notation: "compact", maximumSignificantDigits: 3 };
  if (format === "money") Object.assign(o, { style: "currency", currency: CURRENCY });
  return new Intl.NumberFormat(undefined, o).format(v);
}
const when = (t) => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
function fade(c, alpha) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (!m) return c;
  const n = parseInt(m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1], 16);
  return "rgba(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ", " + alpha + ")";
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

function tiles(d) {
  const box = $("tiles");
  box.textContent = "";
  for (const k of d.kpis) {
    const t = el("div", "tile");
    t.append(el("div", "label", k.label), el("div", "value", fmt(k.value, k.format, k.dp)));
    if (typeof k.prev === "number") {
      const diff = k.value - k.prev;
      const rel = k.format === "percent" ? null : k.prev ? diff / Math.abs(k.prev) : null;
      const better = diff === 0 ? "flat" : (diff > 0) === (k.good !== "down") ? "good" : "bad";
      const size = k.format === "percent" ? Math.abs(diff * 100).toFixed(1) + " pts" : rel === null ? fmt(Math.abs(diff), k.format, k.dp) : fmt(Math.abs(rel), "percent", 1);
      t.append(el("div", "delta " + better, (diff > 0 ? "▲ " : diff < 0 ? "▼ " : "") + size + " " + (d.compare || "")));
    }
    box.append(t);
  }
}

// Labels drawn on the chart itself: series names at line ends, values at bar ends.
const endLabels = {
  id: "endLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = "12px " + css("--n-font");
    ctx.textBaseline = "middle";
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      if (chart.config.type === "line") {
        const p = meta.data[meta.data.length - 1];
        ctx.fillStyle = ds.borderColor;
        ctx.fillText(ds.label, p.x + 6, p.y);
      } else {
        meta.data.forEach((bar, j) => {
          ctx.fillStyle = css("--n-fg");
          ctx.fillText(compact(ds.data[j], ds.valueFormat), bar.x + 6, bar.y);
        });
      }
    });
    ctx.restore();
  },
};

function drawCharts(d) {
  charts.splice(0).forEach((c) => c.destroy());
  if (!window.Chart) {
    $("status").textContent = "The chart library could not load (offline?); the numbers above and below are still right.";
    return;
  }
  const muted = css("--n-muted"), line = css("--n-line"), font = css("--n-font");
  Chart.defaults.color = muted;
  Chart.defaults.font.family = font;
  const series = ["--n-c1", "--n-c2", "--n-c3", "--n-c4", "--n-c5", "--n-c6"].map(css);
  const axis = (format, beginAtZero) => ({ beginAtZero, grid: { color: line }, border: { display: false }, ticks: { callback: (v) => compact(v, format) } });

  $("trend-title").textContent = d.trend.title;
  $("trend-sub").textContent = d.trend.sub;
  charts.push(new Chart($("trend"), {
    type: "line",
    data: { labels: d.trend.labels, datasets: d.trend.series.map((s, i) => ({ label: s.name, data: s.values, borderColor: series[i % 6], backgroundColor: series[i % 6], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.25 })) },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { right: 60 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + fmt(c.parsed.y, d.trend.format) } } },
      scales: { x: { grid: { display: false } }, y: axis(d.trend.format, true) },
    },
    plugins: [endLabels],
  }));

  const items = [...d.bars.items].sort((a, b) => b.value - a.value);
  $("bars-title").textContent = d.bars.title;
  $("bars-sub").textContent = d.bars.sub;
  charts.push(new Chart($("bars"), {
    type: "bar",
    data: { labels: items.map((x) => x.label), datasets: [{ label: d.bars.sub, data: items.map((x) => x.value), backgroundColor: items.map((_, i) => (i === 0 ? series[0] : fade(muted, 0.45))), borderRadius: 4, barPercentage: 0.7, valueFormat: d.bars.format }] },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      layout: { padding: { right: 56 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt(c.parsed.x, d.bars.format) } } },
      scales: { x: axis(d.bars.format, true), y: { grid: { display: false }, border: { display: false } } },
    },
    plugins: [endLabels],
  }));
}

function table(d) {
  const t = $("table");
  t.textContent = "";
  $("table-title").textContent = d.table.title;
  const head = el("tr");
  d.table.columns.forEach((c, i) => head.append(el("th", d.table.formats[i] ? "num" : "", c)));
  t.append(el("thead"), el("tbody"));
  t.tHead.append(head);
  for (const r of d.table.rows) {
    const tr = el("tr");
    r.forEach((v, i) => tr.append(el("td", d.table.formats[i] ? "num" : "", d.table.formats[i] ? fmt(v, d.table.formats[i]) : String(v))));
    t.tBodies[0].append(tr);
  }
}

function render(d, at) {
  shown = d;
  document.title = TITLE;
  $("title").textContent = TITLE;
  $("updated").textContent = "Updated " + when(at || d.updated) + (d.source ? " · from " + d.source : "");
  tiles(d);
  table(d);
  drawCharts(d);
}

async function load() {
  if (!SOURCE) return render(DATA);
  let kept = null;
  try { kept = store ? await store.get("cache") : null; } catch (e) { kept = null; }
  if (kept) render(kept.data, kept.at);
  if (kept && Date.now() - kept.at < SOURCE.minutes * 60000) return;
  try {
    const r = await fetch(SOURCE.url, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status + " " + r.statusText);
    const data = SOURCE.map(await r.json());
    const at = Date.now();
    render(data, at);
    $("status").textContent = "";
    if (store) await store.set("cache", { at, data });
  } catch (e) {
    $("status").textContent = "Couldn't load new data (" + e.message + ")" + (kept ? "; showing what was loaded " + when(kept.at) + "." : ".");
    if (!kept && !shown) render(DATA);
  }
}

// The app switches light and dark by changing an attribute on <html>: redraw with the new colours.
new MutationObserver(() => shown && drawCharts(shown)).observe(document.documentElement, { attributes: true, attributeFilter: ["data-n-theme"] });
load();
if (SOURCE) setInterval(load, Math.max(5, SOURCE.minutes) * 60000);
</script>
</body>
</html>
```

## Live data: an example

Open-Meteo's forecast needs no key and lets pages fetch it. With this `SOURCE` (and a `TITLE` such as
"London weather"), the same page becomes a seven-day weather dashboard that refreshes itself every
30 minutes and shows the last good copy, with a note, when the network is down. Swap in another
public source the same way: fetch it once yourself first, look at its answer, then write `map`.

With a `SOURCE`, `DATA` is what shows before the first fetch has ever worked: put the result of
your own first fetch there (run through `map`), so the page is never empty or wrong.

```js
const SOURCE = {
  url: "https://api.open-meteo.com/v1/forecast?latitude=51.51&longitude=-0.13&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto",
  minutes: 30,
  map: (j) => {
    const days = j.daily.time.map((t) => new Date(t + "T12:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric" }));
    const max = j.daily.temperature_2m_max, min = j.daily.temperature_2m_min, rain = j.daily.precipitation_sum;
    return {
      source: "Open-Meteo",
      kpis: [
        { label: "Highest today, °C", value: max[0], format: "number", dp: 1 },
        { label: "Lowest today, °C", value: min[0], format: "number", dp: 1 },
        { label: "Rain today, mm", value: rain[0], format: "number", dp: 1 },
      ],
      trend: { title: "The week ahead", sub: "Highest and lowest, °C", format: "number", labels: days, series: [{ name: "High", values: max }, { name: "Low", values: min }] },
      bars: { title: "Wettest days first", sub: "Rain, mm", format: "number", items: days.map((d, i) => ({ label: d, value: rain[i] })) },
      table: { title: "By day", columns: ["Day", "High °C", "Low °C", "Rain mm"], formats: [null, "number", "number", "number"], rows: days.map((d, i) => [d, max[i], min[i], rain[i]]) },
    };
  },
};
```

With `CURRENCY` unused here, `format: "number"` everywhere. For data that needs a key, do not fetch
from the page: have a scheduled task fetch it with `http_request` and save the page again with the
new numbers in `DATA`.
