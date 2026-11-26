// What people read. Every page is complete HTML from the server; the app works with scripts turned off.
import { html } from './html.js';
import { KINDS } from './records.js';

const TIME_ZONE = 'Europe/London';
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
export const niceDay = (day) => new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${day}T00:00:00Z`));

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function layout({ title, user, section, notice, error, content }) {
  const link = (href, label, key) =>
    html`<a href="${href}"${section === key ? html` aria-current="page"` : ''}>${label}</a>`;
  return html`<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${title} · Kestrel Crews</title>
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <script src="/app.js" defer></script>
</head>
<body>
  <header>
    <div class="bar">
      <a class="brand" href="${user ? '/home' : '/'}"><img src="/icon.svg" alt="" width="28" height="28"> Kestrel Crews</a>
      ${user
        ? html`<form method="post" action="/sign-out" class="who"><span>${user.name}</span><button class="quiet">Sign out</button></form>`
        : ''}
    </div>
    ${user ? html`<nav>${link('/home', 'Home', 'home')}${link('/customers', 'Customers', 'customers')}${link('/jobs', 'Jobs', 'jobs')}${link('/notes', 'Notes', 'notes')}${link('/crews', 'Crews', 'crews')}</nav>` : ''}
  </header>
  <main>
    ${notice ? html`<p class="notice" role="status">${notice}</p>` : ''}
    ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    ${content}
  </main>
</body>
</html>`.toString();
}

export function welcome() {
  return html`<section class="narrow">
    <h1>Kestrel Crews</h1>
    <p>Each crew’s customers, jobs and notes, seen only by the people in that crew.</p>
    <p class="actions"><a class="button" href="/sign-up">Make an account</a> <a class="button quiet" href="/sign-in">Sign in</a></p>
  </section>`;
}

export function signForm({ kind, next, values = {} }) {
  const up = kind === 'sign-up';
  const query = next ? `?next=${encodeURIComponent(next)}` : '';
  return html`<section class="narrow">
    <h1>${up ? 'Make an account' : 'Sign in'}</h1>
    <form method="post" action="/${kind}" class="card">
      ${next ? html`<input type="hidden" name="next" value="${next}">` : ''}
      ${up ? html`<label>Your name <input name="name" required maxlength="100" autocomplete="name" value="${values.name}"></label>` : ''}
      <label>Email <input name="email" type="email" required maxlength="254" autocomplete="email" value="${values.email}"></label>
      <label>Password ${up ? html`<small>at least 8 characters</small>` : ''}
        <input name="password" type="password" required ${up ? html`minlength="8" autocomplete="new-password"` : html`autocomplete="current-password"`} maxlength="200"></label>
      <button>${up ? 'Make my account' : 'Sign in'}</button>
    </form>
    <p>${up
      ? html`Already have an account? <a href="/sign-in${query}">Sign in</a>`
      : html`No account yet? <a href="/sign-up${query}">Make one</a>`}</p>
  </section>`;
}

function newCrewForm(values = {}) {
  return html`<form method="post" action="/crews" class="card">
    <label>Crew name <input name="name" required maxlength="100" value="${values.name}"></label>
    <button>Create crew</button>
    <small>You will be its lead.</small>
  </form>`;
}

const noCrew = () => html`<section class="narrow">
  <h1>Start a crew</h1>
  <p>You are not in a crew yet. Create one below, or, if someone has sent you an invitation link, open that link.</p>
  ${newCrewForm()}
</section>`;

export function home({ crews, rows }) {
  if (!crews.length) return noCrew();
  const now = today();
  const open = rows.jobs.filter((job) => !job.done);
  const late = open.filter((job) => job.day < now);
  const count = (kind, crewId, test = () => true) => rows[kind].filter((r) => r.crew === crewId && test(r)).length;
  const stat = (n, label, href) => html`<a class="stat" href="${href}"><strong>${n}</strong> <span>${label}</span></a>`;
  const jobList = (jobs) => html`<ul class="rows">${jobs.map((job) => html`<li${job.day < now ? html` class="late"` : ''}>
    <a href="/jobs/${job.id}">${job.title}</a>
    <span class="meta">${niceDay(job.day)}${job.day < now ? ' · overdue' : job.day === now ? ' · today' : ''} <span class="tag">${job.crewName}</span></span>
  </li>`)}</ul>`;
  const coming = open.filter((job) => job.day >= now);
  return html`<h1>Home</h1>
    <div class="stats">
      ${stat(rows.customers.length, 'Customers', '/customers')}
      ${stat(open.length, 'Jobs to do', '/jobs')}
      ${stat(late.length, 'Overdue jobs', '/jobs')}
      ${stat(rows.jobs.length - open.length, 'Jobs done', '/jobs')}
      ${stat(rows.notes.length, 'Notes', '/notes')}
    </div>
    ${late.length ? html`<h2>Overdue</h2>${jobList(late)}` : ''}
    <h2>Coming up</h2>
    ${coming.length ? jobList(coming.slice(0, 10)) : html`<p class="empty">No jobs coming up.</p>`}
    ${coming.length > 10 ? html`<p><a href="/jobs">See all jobs</a></p>` : ''}
    <h2>Your crews</h2>
    <ul class="rows">${crews.map((crew) => html`<li>
      <a href="/crews/${crew.id}">${crew.name}</a>
      <span class="meta">You are ${crew.role === 'lead' ? 'a lead' : 'a member'} · ${plural(count('customers', crew.id), 'customer')} · ${plural(count('jobs', crew.id, (j) => !j.done), 'job')} to do · ${plural(count('notes', crew.id), 'note')}</span>
    </li>`)}</ul>`;
}

function inputFor(field, value) {
  const required = field.required ? html` required` : '';
  if (field.type === 'yesno') {
    return html`<label class="check"><input type="checkbox" name="${field.key}" value="true"${value === true || value === 'true' ? html` checked` : ''}> ${field.label}</label>`;
  }
  const label = html`${field.label}${field.required ? '' : html` <small>optional</small>`}`;
  if (field.type === 'long') {
    // The newline straight after <textarea> is dropped by browsers, so one is added.
    return html`<label>${label}<textarea name="${field.key}" rows="4" maxlength="${field.max}">
${value}</textarea></label>`;
  }
  if (field.type === 'date') return html`<label>${label}<input type="date" name="${field.key}" value="${value}"${required}></label>`;
  return html`<label>${label}<input name="${field.key}" value="${value}" maxlength="${field.max}"${required}></label>`;
}

function row(kind, item, showCrew, back) {
  const crewTag = showCrew ? html` <span class="tag">${item.crewName}</span>` : '';
  const edit = html`<a class="edit" href="/${kind}/${item.id}">Edit<span class="hidden"> ${item.name ?? item.title}</span></a>`;
  if (kind === 'customers') {
    return html`<li><div><strong>${item.name}</strong>${crewTag}
      ${item.address ? html`<p class="long">${item.address}</p>` : ''}</div>${edit}</li>`;
  }
  if (kind === 'notes') {
    return html`<li><div><strong>${item.title}</strong>${crewTag}
      ${item.note ? html`<p class="long">${item.note}</p>` : ''}</div>${edit}</li>`;
  }
  const late = !item.done && item.day < today();
  return html`<li class="${item.done ? 'done' : late ? 'late' : ''}">
    <div><strong>${item.title}</strong>${crewTag}
      <p class="meta">${niceDay(item.day)} · ${item.done ? 'Done' : late ? 'Overdue' : 'To do'}</p></div>
    <div class="row-actions">
      <form method="post" action="/jobs/${item.id}/done">
        <input type="hidden" name="done" value="${item.done ? 'false' : 'true'}">
        <input type="hidden" name="back" value="${back}">
        <button class="quiet">${item.done ? 'Not done' : 'Mark done'}<span class="hidden">: ${item.title}</span></button>
      </form>${edit}
    </div></li>`;
}

export function listPage({ kind, crews, crewId, items, values, failed }) {
  if (!crews.length) return noCrew();
  const { title, one, fields } = KINDS[kind];
  const chosen = values?.crew !== undefined ? Number(values.crew) : crewId ?? (crews.length === 1 ? crews[0].id : null);
  const back = crewId ? `/${kind}?crew=${crewId}` : `/${kind}`;
  const chip = (href, label, on) => html`<a class="chip" href="${href}"${on ? html` aria-current="true"` : ''}>${label}</a>`;
  return html`<h1>${title}</h1>
    ${crews.length > 1 ? html`<p class="chips">${chip(`/${kind}`, 'All my crews', !crewId)}${crews.map((c) => chip(`/${kind}?crew=${c.id}`, c.name, c.id === crewId))}</p>` : ''}
    <details class="add"${failed || !items.length ? html` open` : ''}>
      <summary>Add a ${one}</summary>
      <form method="post" action="/${kind}" class="card">
        <input type="hidden" name="back" value="${back}">
        <label>Crew<select name="crew" required>
          ${chosen ? '' : html`<option value="">Choose a crew…</option>`}
          ${crews.map((c) => html`<option value="${c.id}"${c.id === chosen ? html` selected` : ''}>${c.name}</option>`)}
        </select></label>
        ${fields.filter((f) => f.type !== 'yesno').map((f) => inputFor(f, values?.[f.key]))}
        <button>Add ${one}</button>
      </form>
    </details>
    ${items.length
      ? html`<p class="meta">${plural(items.length, one)}</p><ul class="rows">${items.map((item) => row(kind, item, crews.length > 1, back))}</ul>`
      : html`<p class="empty">No ${title.toLowerCase()} yet.</p>`}`;
}

export function editPage({ kind, item, values }) {
  const { one, fields, title } = KINDS[kind];
  return html`<section class="narrow">
    <p><a href="/${kind}">← ${title}</a></p>
    <h1>Change ${one}</h1>
    <p class="meta">Crew: <span class="tag">${item.crewName}</span></p>
    <form method="post" action="/${kind}/${item.id}" class="card">
      ${fields.map((f) => inputFor(f, values ? values[f.key] : item[f.key]))}
      <button>Save changes</button>
    </form>
    ${item.canRemove ? html`<details class="danger">
      <summary>Delete this ${one}</summary>
      <form method="post" action="/${kind}/${item.id}/delete"><p>This cannot be undone.</p><button class="red">Yes, delete it</button></form>
    </details>` : ''}
  </section>`;
}

export function crewsPage({ crews, values }) {
  return html`<h1>Crews</h1>
    ${crews.length
      ? html`<ul class="rows">${crews.map((c) => html`<li><a href="/crews/${c.id}">${c.name}</a><span class="meta">You are ${c.role === 'lead' ? 'a lead' : 'a member'}</span></li>`)}</ul>`
      : html`<p class="empty">You are not in a crew yet. Create one below, or open an invitation link someone has sent you.</p>`}
    <h2>Start another crew</h2>
    ${newCrewForm(values)}`;
}

export function crewPage({ crew, user, members, invitations, link, values = {} }) {
  const lead = crew.role === 'lead';
  const leads = members.filter((m) => m.role === 'lead').length;
  return html`<p><a href="/crews">← Crews</a></p>
    <h1>${crew.name}</h1>
    <p class="meta">You are ${lead ? 'a lead' : 'a member'} of this crew.</p>
    <p class="chips"><a class="chip" href="/customers?crew=${crew.id}">Customers</a><a class="chip" href="/jobs?crew=${crew.id}">Jobs</a><a class="chip" href="/notes?crew=${crew.id}">Notes</a></p>

    <h2>People (${members.length})</h2>
    <ul class="rows">${members.map((m) => html`<li>
      <div><strong>${m.name}</strong>${m.id === user.id ? ' (you)' : ''} <span class="tag">${m.role}</span><p class="meta">${m.email}</p></div>
      ${lead && !(m.role === 'lead' && leads === 1) ? html`<details class="danger">
        <summary>${m.id === user.id ? 'Leave' : 'Take out'}<span class="hidden"> ${m.name}</span></summary>
        <form method="post" action="/crews/${crew.id}/remove">
          <input type="hidden" name="user" value="${m.id}">
          <p>${m.id === user.id ? 'You' : m.name} will lose access to this crew at once.</p>
          <button class="red">Yes, ${m.id === user.id ? 'leave this crew' : 'take them out'}</button>
        </form>
      </details>` : ''}
    </li>`)}</ul>

    ${lead ? html`
    <h2>Invite someone</h2>
    ${link ? html`<div class="card highlight">
      <p><strong>Invitation made for ${link.email}.</strong> Send them this link (by text or email; the app does not send it for you):</p>
      <p class="link"><input readonly value="${link.url}" aria-label="Invitation link" data-select> <button type="button" class="quiet" data-copy="${link.url}" hidden>Copy</button></p>
    </div>` : ''}
    <form method="post" action="/crews/${crew.id}/invite" class="card">
      <label>Their email <input name="email" type="email" required maxlength="254" value="${values.email}" autocomplete="off"></label>
      <label>They join as<select name="role">
        <option value="member">Member: adds and changes customers, jobs and notes</option>
        <option value="lead"${values.role === 'lead' ? html` selected` : ''}>Lead: can also invite and take out people</option>
      </select></label>
      <button>Make invitation link</button>
      <small>The link works once, and only for an account with that email.</small>
    </form>

    ${invitations.length ? html`<h2>Links not used yet</h2>
    <ul class="rows">${invitations.map((i) => html`<li>
      <div class="grow"><strong>${i.email}</strong> <span class="tag">${i.role}</span>
        <p class="link"><input readonly value="${i.url}" aria-label="Invitation link for ${i.email}" data-select> <button type="button" class="quiet" data-copy="${i.url}" hidden>Copy</button></p></div>
      <form method="post" action="/crews/${crew.id}/invitations/${i.id}/cancel"><button class="quiet">Cancel link<span class="hidden"> for ${i.email}</span></button></form>
    </li>`)}</ul>` : ''}

    <h2>Crew name</h2>
    <form method="post" action="/crews/${crew.id}/rename" class="card">
      <label>Name <input name="name" required maxlength="100" value="${crew.name}"></label>
      <button class="quiet">Rename</button>
    </form>` : ''}`;
}

export function invitePage({ token, user, invitation, problem }) {
  const next = encodeURIComponent(`/invite/${token}`);
  if (!user) {
    return html`<section class="narrow">
      <h1>You have been invited to a crew</h1>
      <p>To join, make an account (or sign in) with the email address the invitation was made for. You will come back to this page.</p>
      <p class="actions"><a class="button" href="/sign-up?next=${next}">Make an account</a> <a class="button quiet" href="/sign-in?next=${next}">Sign in</a></p>
    </section>`;
  }
  if (problem) {
    return html`<section class="narrow">
      <h1>This link cannot be used</h1>
      <p class="error" role="alert">${problem}</p>
      <p>You are signed in as ${user.email}.</p>
      <p class="actions"><a class="button" href="/home">Go to Home</a></p>
      <form method="post" action="/sign-out"><input type="hidden" name="next" value="/invite/${token}"><button class="quiet">Sign in with another account</button></form>
    </section>`;
  }
  return html`<section class="narrow">
    <h1>Join ${invitation.name}</h1>
    <p>You are invited as ${invitation.role === 'lead' ? 'a lead' : 'a member'}. You are signed in as ${user.email}.</p>
    <form method="post" action="/invite/${token}"><button>Join this crew</button></form>
  </section>`;
}

export const messagePage = (title, message) => html`<section class="narrow">
  <h1>${title}</h1><p>${message}</p><p><a href="/home">Go to Home</a></p></section>`;
