import { html } from './html.js';
import { CATEGORIES, LOW_BELOW, today } from './rules.js';

export const APP_NAME = 'Eastgate Food Bank';

const niceDay = (d) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
const niceMonth = (m) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${m}-01`));
const capital = (s) => s[0].toUpperCase() + s.slice(1);
const plural = (n, word, words = `${word}s`) => (n === 1 ? word : words);

export function page({ title, user, tab, body, notice, error }) {
  const link = (href, key, label) => html`<a href="${href}" ${tab === key ? html`aria-current="page"` : ''}>${label}</a>`;
  return String(html`<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#121714">
<title>${title ? `${title} · ` : ''}${APP_NAME}</title>
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<script src="/app.js" defer></script>
</head>
<body class="${user ? 'in' : 'out'}">
<header>
  <a class="brand" href="/">${APP_NAME}</a>
  ${user && html`<nav>${link('/', 'home', 'Home')}${link('/stock', 'stock', 'Stock')}${link('/deliveries', 'deliveries', 'Deliveries')}${link('/team', 'team', 'Team')}</nav>`}
</header>
<main>
  ${notice && html`<p class="notice" role="status">${notice}</p>`}
  ${error && html`<p class="error" role="alert">${error}</p>`}
  ${body}
</main>
</body>
</html>`);
}

/* ---------- signing in ---------- */

export const signInPage = ({ error, notice, email = '', first }) =>
  page({
    title: 'Sign in',
    error,
    notice,
    body: html`<h1>Sign in</h1>
<p>Keep track of what is in the store and what has come in.</p>
<form method="post" action="/sign-in" class="panel">
  <label>Email <input type="email" name="email" value="${email}" required autocomplete="username"></label>
  <label>Password <input type="password" name="password" required autocomplete="current-password"></label>
  <button>Sign in</button>
</form>
<p>New here? <a href="/sign-up">${first ? 'Set up the first account (coordinator)' : 'Make an account'}</a></p>
<p class="muted">Forgotten your password? Ask your coordinator for a new one.</p>`,
  });

export const signUpPage = ({ error, values = {}, first, needsCode }) =>
  page({
    title: 'Make an account',
    error,
    body: html`<h1>Make an account</h1>
<p>${first ? 'This is the first account, so it will be the coordinator’s.' : 'For Eastgate Food Bank volunteers.'}</p>
<form method="post" action="/sign-up" class="panel">
  <label>Your name <input name="name" value="${values.name}" required maxlength="80" autocomplete="name"></label>
  <label>Email <input type="email" name="email" value="${values.email}" required autocomplete="username"></label>
  <label>Password <span class="hint">at least 8 characters</span>
    <input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
  ${needsCode && html`<label>Team code <span class="hint">your coordinator has it</span>
    <input name="code" value="${values.code}" required autocomplete="off" autocapitalize="characters"></label>`}
  <button>Make my account</button>
</form>
<p>Already have one? <a href="/sign-in">Sign in</a></p>`,
  });

/* ---------- shared pieces ---------- */

function dateBadge(bestBefore) {
  if (!bestBefore) return '';
  const days = (Date.parse(bestBefore) - Date.parse(today())) / 86400000;
  if (days < 0) return html`<span class="badge bad">Past best-before: ${niceDay(bestBefore)}</span>`;
  if (days <= 14) return html`<span class="badge warn">Best before ${niceDay(bestBefore)} (soon)</span>`;
  return html`<span class="muted">Best before ${niceDay(bestBefore)}</span>`;
}

function stockCard(s, back) {
  const step = (by, label, aria) => html`<form method="post" action="/stock/${s.id}/adjust">
    <input type="hidden" name="by" value="${by}"><input type="hidden" name="back" value="${back}">
    <button class="step" aria-label="${aria} ${s.name}" ${by < 0 && s.quantity === 0 ? html`disabled` : ''}>${label}</button></form>`;
  return html`<li class="card" id="stock-${s.id}">
  ${s.photo
    ? html`<a href="${s.photo}"><img class="thumb" src="${s.photo}" alt="Photo of ${s.name}" loading="lazy"></a>`
    : html`<span class="thumb none" aria-hidden="true">${s.name[0].toUpperCase()}</span>`}
  <div class="what">
    <a class="title" href="/stock/${s.id}">${s.name}</a>
    <span class="muted">${capital(s.category)}</span>
    ${dateBadge(s.bestBefore)}
    ${s.runningLow && html`<span class="badge warn">Running low</span>`}
    ${s.notes && html`<span class="notes">${s.notes}</span>`}
  </div>
  <div class="count">
    ${step(-1, '−', 'One fewer')}
    <span><strong>${s.quantity}</strong><small>in store</small></span>
    ${step(1, '+', 'One more')}
  </div>
</li>`;
}

function deliveryCard(d, back) {
  return html`<li class="card delivery" id="delivery-${d.id}">
  <div class="what">
    <a class="title" href="/deliveries/${d.id}">${d.item}</a>
    <span>${d.kilos} kg from ${d.from}</span>
    <span class="muted">Arrived ${niceDay(d.arrived)}${d.itemRemoved ? ' · item no longer in stock list' : ''}</span>
    ${d.putAway ? html`<span class="badge ok">Put away</span>` : html`<span class="badge warn">Not put away yet</span>`}
  </div>
  ${!d.putAway && html`<form method="post" action="/deliveries/${d.id}/put-away">
    <input type="hidden" name="back" value="${back}"><button>Mark put away</button></form>`}
</li>`;
}

/* ---------- home ---------- */

export function homePage({ user, sum, low, waiting, notice }) {
  return page({
    user,
    tab: 'home',
    notice,
    body: html`<h1>Hello, ${user.name}</h1>
<section class="tiles">
  <a class="tile ${sum.runningLow ? 'warn' : ''}" href="/stock?show=low">
    <strong>${sum.runningLow}</strong> <span>${plural(sum.runningLow, 'thing')} running low</span>
    <small>fewer than ${LOW_BELOW} left</small></a>
  <a class="tile" href="/deliveries?show=month">
    <strong>${sum.kilosThisMonth}</strong> <span>kilos taken in this month</span>
    <small>${niceMonth(sum.month)}</small></a>
  <a class="tile ${sum.notPutAway ? 'warn' : ''}" href="/deliveries?show=waiting">
    <strong>${sum.notPutAway}</strong> <span>${plural(sum.notPutAway, 'delivery', 'deliveries')} not put away</span>
    <small>still waiting</small></a>
</section>
<p class="actions"><a class="button" href="/deliveries/new">Record a delivery</a> <a class="button second" href="/stock/new">Add to stock</a></p>
<h2>Waiting to be put away</h2>
${waiting.length ? html`<ul class="cards">${waiting.map((d) => deliveryCard(d, '/'))}</ul>` : html`<p class="muted">Nothing is waiting.</p>`}
<h2>Running low</h2>
${low.length ? html`<ul class="cards">${low.map((s) => stockCard(s, '/'))}</ul>` : html`<p class="muted">Nothing is running low.</p>`}`,
  });
}

/* ---------- stock ---------- */

export function stockPage({ user, rows, q, category, show, back, notice, error }) {
  return page({
    title: 'Stock',
    user,
    tab: 'stock',
    notice,
    error,
    body: html`<div class="heading"><h1>Stock</h1><a class="button" href="/stock/new">Add to stock</a></div>
<form method="get" action="/stock" class="filters">
  <input type="search" name="q" value="${q}" placeholder="Search the stock" aria-label="Search the stock">
  <select name="category" aria-label="What sort of thing"><option value="">All sorts</option>
    ${CATEGORIES.map((c) => html`<option value="${c}" ${c === category ? html`selected` : ''}>${capital(c)}</option>`)}</select>
  <select name="show" aria-label="Which items"><option value="">Everything</option>
    <option value="low" ${show === 'low' ? html`selected` : ''}>Running low only</option></select>
  <button class="second">Show</button>
</form>
<p class="muted">${rows.length} ${plural(rows.length, 'item')}${q || category || show ? html` shown · <a href="/stock">show all</a>` : ''}</p>
${rows.length ? html`<ul class="cards">${rows.map((s) => stockCard(s, back))}</ul>` : html`<p>Nothing here yet.</p>`}`,
  });
}

export function stockForm({ user, item, values, error, notice, then }) {
  const v = values;
  return page({
    title: item ? item.name : 'Add to stock',
    user,
    tab: 'stock',
    error,
    notice,
    body: html`<h1>${item ? item.name : 'Add to stock'}</h1>
${item && html`<p class="muted">Last changed by ${item.updatedBy}, ${niceDay(item.updatedAt.slice(0, 10))}.</p>`}
${item?.photo && html`<p><img class="photo" src="${item.photo}" alt="Photo of ${item.name}"></p>`}
<form method="post" action="${item ? `/stock/${item.id}` : '/stock'}" enctype="multipart/form-data" class="panel">
  ${item && html`<input type="hidden" name="version" value="${item.version}">`}
  ${then && html`<input type="hidden" name="then" value="${then}">`}
  <label>What it is <input name="name" value="${v.name}" required maxlength="120"></label>
  <label>What sort of thing it is
    <select name="category" required><option value="">Choose…</option>
      ${CATEGORIES.map((c) => html`<option value="${c}" ${c === v.category ? html`selected` : ''}>${capital(c)}</option>`)}</select></label>
  <label>How many we have <input type="number" name="quantity" value="${v.quantity}" required min="0" step="1" inputmode="numeric"></label>
  <label>Best-before date <span class="hint">leave empty if it has none</span>
    <input type="date" name="bestBefore" value="${v.bestBefore}"></label>
  <label>${item?.photo ? 'New photo' : 'Photo'} <span class="hint">optional, so people recognise it</span>
    <input type="file" name="photo" accept="image/*" data-shrink></label>
  ${item?.photo && html`<label class="check"><input type="checkbox" name="removePhoto" value="yes"> Take the photo off</label>`}
  <label>Notes <span class="hint">optional</span> <textarea name="notes" rows="5" maxlength="10000">${v.notes}</textarea></label>
  <button>${item ? 'Save changes' : 'Add to stock'}</button>
</form>
${item && html`<details class="danger"><summary>Remove from stock…</summary>
  <p>This takes “${item.name}” off the stock list for everyone. Deliveries already recorded are kept.</p>
  <form method="post" action="/stock/${item.id}/delete"><button class="bad">Yes, remove it</button></form></details>`}`,
  });
}

/* ---------- deliveries ---------- */

export function deliveriesPage({ user, rows, show, month, back, notice, error }) {
  const tab = (key, label) =>
    html`<a href="/deliveries${key ? `?show=${key}` : ''}" ${show === key ? html`aria-current="true"` : ''}>${label}</a>`;
  const kilos = rows.reduce((sum, d) => sum + d.kilos, 0);
  return page({
    title: 'Deliveries',
    user,
    tab: 'deliveries',
    notice,
    error,
    body: html`<div class="heading"><h1>Deliveries</h1><a class="button" href="/deliveries/new">Record a delivery</a></div>
<p class="switch">${tab('', 'All')}${tab('waiting', 'Not put away')}${tab('month', niceMonth(month))}</p>
<p class="muted">${rows.length} ${plural(rows.length, 'delivery', 'deliveries')}, ${kilos} kg</p>
${rows.length ? html`<ul class="cards">${rows.map((d) => deliveryCard(d, back))}</ul>` : html`<p>Nothing here yet.</p>`}`,
  });
}

export function deliveryForm({ user, delivery, values, stock, suppliers, error, notice }) {
  const v = values;
  // A delivery of an item since removed from stock can still be edited and keep it.
  const choices = [...stock];
  if (delivery?.itemRemoved) choices.push({ id: delivery.stockId, name: `${delivery.item} (removed from stock)`, category: '' });
  const checked = [true, 'yes', 'on', 'true'].includes(v.putAway);
  return page({
    title: delivery ? 'Delivery' : 'Record a delivery',
    user,
    tab: 'deliveries',
    error,
    notice,
    body: html`<h1>${delivery ? 'Delivery' : 'Record a delivery'}</h1>
${delivery && html`<p class="muted">Last changed by ${delivery.updatedBy}, ${niceDay(delivery.updatedAt.slice(0, 10))}.</p>`}
${!choices.length
  ? html`<p>First put the thing that came on the stock list (you can enter 0 for how many).</p>
     <p><a class="button" href="/stock/new?then=delivery">Add to stock</a></p>`
  : html`<form method="post" action="${delivery ? `/deliveries/${delivery.id}` : '/deliveries'}" class="panel">
  ${delivery && html`<input type="hidden" name="version" value="${delivery.version}">`}
  <label>Which stock item came
    <select name="stockId" required><option value="">Choose…</option>
      ${choices.map((s) => html`<option value="${s.id}" ${String(s.id) === String(v.stockId) ? html`selected` : ''}>${s.name}${s.category ? ` (${s.category})` : ''}</option>`)}</select></label>
  ${!delivery && html`<p class="hint">Not in the list? <a href="/stock/new?then=delivery">Add it to stock first</a>.</p>`}
  <label>Who it came from <input name="from" value="${v.from}" required maxlength="120" list="suppliers" autocomplete="off"></label>
  <datalist id="suppliers">${suppliers.map((s) => html`<option value="${s}"></option>`)}</datalist>
  <label>The day it arrived <input type="date" name="arrived" value="${v.arrived}" required></label>
  <label>Kilos <span class="hint">whole kilos</span>
    <input type="number" name="kilos" value="${v.kilos}" required min="1" step="1" inputmode="numeric"></label>
  <label class="check"><input type="checkbox" name="putAway" value="yes" ${checked ? html`checked` : ''}> It has been put away</label>
  <button>${delivery ? 'Save changes' : 'Record delivery'}</button>
</form>`}
${delivery && html`<details class="danger"><summary>Delete this delivery…</summary>
  <p>It will be gone for everyone, and its kilos will no longer be counted.</p>
  <form method="post" action="/deliveries/${delivery.id}/delete"><button class="bad">Yes, delete it</button></form></details>`}`,
  });
}

/* ---------- team ---------- */

export function teamPage({ user, people, code, reset, notice, error }) {
  const boss = user.role === 'coordinator';
  return page({
    title: 'Team',
    user,
    tab: 'team',
    notice,
    error,
    body: html`<h1>Team</h1>
${reset && html`<p class="notice" role="status">New password for ${reset.name}: <strong class="code">${reset.password}</strong><br>Tell them now; it will not be shown again.</p>`}
${boss && html`<section class="panel"><h2>Team code</h2>
  <p>Volunteers need this to make an account. Share it only with your team.</p>
  <p><strong class="code">${code}</strong></p>
  <form method="post" action="/team/new-code"><button class="second">Make a new code</button></form></section>`}
<ul class="cards">${people.map((p) => html`<li class="card person">
  <div class="what"><span class="title">${p.name}${p.id === user.id ? ' (you)' : ''}</span>
    <span class="muted">${p.email} · ${p.role}</span></div>
  ${boss && p.role !== 'coordinator' && html`<details><summary>Manage</summary>
    <form method="post" action="/team/${p.id}/reset"><button class="second">Give a new password</button></form>
    <form method="post" action="/team/${p.id}/remove"><button class="bad">Remove ${p.name}</button></form>
    <p class="hint">Removing someone also changes the team code.</p></details>`}
</li>`)}</ul>
<details class="panel"><summary>Change my password</summary>
  <form method="post" action="/password">
    <label>Current password <input type="password" name="current" required autocomplete="current-password"></label>
    <label>New password <span class="hint">at least 8 characters</span>
      <input type="password" name="next" required minlength="8" autocomplete="new-password"></label>
    <button>Change password</button></form></details>
<form method="post" action="/sign-out"><button class="second">Sign out</button></form>`,
  });
}

export const messagePage = ({ user, title, message }) =>
  page({ title, user, body: html`<h1>${title}</h1><p>${message}</p><p><a href="/">Go to the home page</a></p>` });
