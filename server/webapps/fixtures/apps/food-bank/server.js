import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, PHOTO_DIR } from './src/db.js';
import * as rules from './src/rules.js';
import * as auth from './src/auth.js';
import * as views from './src/views.js';
import { readPhoto, savePhoto, deletePhoto, TYPES } from './src/photos.js';

const { Refusal } = rules;
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const STATIC = {
  '/style.css': 'text/css; charset=utf-8',
  '/app.js': 'text/javascript; charset=utf-8',
  '/icon.svg': 'image/svg+xml',
  '/manifest.webmanifest': 'application/manifest+json',
};

// Fixed messages, picked by a short word in the address after a form is saved.
const DONE = {
  added: 'Added.',
  saved: 'Saved.',
  removed: 'Removed.',
  counted: 'Number updated.',
  away: 'Marked as put away. If the count has changed, update it under Stock.',
  code: 'There is a new team code. The old one no longer works.',
  gone: 'Removed from the team. The team code has been changed too.',
  password: 'Password changed. Please sign in with the new one.',
};

/* ---------- plumbing ---------- */

function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...headers });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}
const json = (res, status, data, headers) => send(res, status, JSON.stringify(data), 'application/json; charset=utf-8', headers);

function redirect(res, to, headers = {}) {
  res.writeHead(303, { Location: to, 'Cache-Control': 'no-store', ...headers });
  res.end();
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 50 * 1024 * 1024) return req.destroy();
      // Over the limit we keep reading but keep nothing, so the person still gets the answer.
      if (size <= limit) chunks.push(c);
    });
    req.on('end', () => (size > limit ? reject(new Refusal('That is too big to send (photos at most 10 MB).', 413)) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
    req.on('close', () => reject(new Refusal('The upload was cut off.')));
  });
}

async function apiBody(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw new Refusal('Send the details as JSON.', 415);
  const text = (await readBody(req, 100_000)).toString('utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Refusal('That is not valid JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Refusal('Send one JSON object.');
  return data;
}

// Returns { fields, files } from either kind of HTML form. Only signed-in people may send big ones.
async function formBody(req, user) {
  const type = req.headers['content-type'] || '';
  const multipart = /^multipart\/form-data/i.test(type);
  const buffer = await readBody(req, multipart && user ? 12 * 1024 * 1024 : 100_000);
  const fields = {};
  const files = {};
  if (multipart) {
    let form;
    try {
      form = await new Response(buffer, { headers: { 'content-type': type } }).formData();
    } catch {
      throw new Refusal('That form could not be read.');
    }
    for (const [k, v] of form) (typeof v === 'string' ? fields : files)[k] = v;
  } else {
    for (const [k, v] of new URLSearchParams(buffer.toString('utf8'))) fields[k] = v;
  }
  return { fields, files };
}

function cookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
}

const secure = (req) => req.headers['x-forwarded-proto'] === 'https';
const sessionCookie = (req, value, maxAge) =>
  `session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`;
const signedInCookie = (req, user) => {
  const { token, maxAge } = auth.startSession(user.id);
  return { 'Set-Cookie': sessionCookie(req, token, maxAge) };
};
const publicUser = ({ id, name, email, role }) => ({ id, name, email, role });

// Another website must not be able to make a signed-in browser change things here.
function fromElsewhere(req) {
  const site = req.headers['sec-fetch-site'];
  if (site) return site !== 'same-origin' && site !== 'none';
  const origin = req.headers.origin;
  if (!origin || origin === 'null') return false;
  try {
    return new URL(origin).host !== (req.headers['x-forwarded-host'] || req.headers.host);
  } catch {
    return true;
  }
}

/* ---------- /api ---------- */

const KINDS = {
  stock: {
    list: rules.listStock, get: rules.getStock, add: rules.addStock, change: rules.changeStock,
    remove: (id) => deletePhoto(rules.removeStock(id).photo),
  },
  deliveries: {
    list: rules.listDeliveries, get: rules.getDelivery, add: rules.addDelivery, change: rules.changeDelivery,
    remove: (id) => rules.removeDelivery(id),
  },
};

async function api(req, res, parts, user, address) {
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const [, name, id, extra] = parts;
  const notAllowed = () => json(res, 405, { error: 'That cannot be done at this address.' });

  if (name === 'sign-up' || name === 'sign-in') {
    if (method !== 'POST' || id) return notAllowed();
    const who = await auth[name === 'sign-up' ? 'signUp' : 'signIn'](await apiBody(req), address);
    return json(res, name === 'sign-up' ? 201 : 200, publicUser(who), signedInCookie(req, who));
  }
  if (!user) return json(res, 401, { error: 'Please sign in first.' });
  if (name === 'sign-out' && method === 'POST') {
    auth.endSession(cookie(req, 'session'));
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }
  if (name === 'summary' && !id && method === 'GET') return json(res, 200, rules.summary());
  if (name === 'team' && !extra) {
    if (!id && method === 'GET') return json(res, 200, { rows: auth.team() });
    if (id && method === 'DELETE') {
      auth.removeVolunteer(user, id);
      return json(res, 200, { ok: true });
    }
    return notAllowed();
  }
  const kind = Object.hasOwn(KINDS, name) ? KINDS[name] : null;
  if (!kind || extra) return json(res, 404, { error: 'There is nothing at this address.' });
  if (!id) {
    if (method === 'GET') return json(res, 200, { rows: kind.list() });
    if (method === 'POST') {
      return json(res, 201, kind.add(await apiBody(req), user));
    }
    return notAllowed();
  }
  if (method === 'GET') return json(res, 200, kind.get(id));
  if (method === 'PATCH' || method === 'PUT') return json(res, 200, kind.change(id, await apiBody(req), user));
  if (method === 'DELETE') {
    kind.remove(id);
    return json(res, 200, { ok: true });
  }
  return notAllowed();
}

/* ---------- pages ---------- */

// Where to return after a button: only our own list pages.
const safeBack = (back, fallback) => (/^\/(stock|deliveries)?(\?[\w=&%+.-]*)?$/.test(back ?? '') ? back : fallback);
const done = (to, word) => `${to}${to.includes('?') ? '&' : '?'}done=${word}`;
const withoutDone = (url) => {
  const params = new URLSearchParams(url.search);
  params.delete('done');
  return url.pathname + (params.size ? `?${params}` : '');
};

async function signInOrUp(req, res, url, address) {
  const up = url.pathname === '/sign-up';
  const view = (extra) =>
    up
      ? views.signUpPage({ first: !auth.hasUsers(), needsCode: auth.needsTeamCode(), ...extra })
      : views.signInPage({ first: !auth.hasUsers(), ...extra });
  if (req.method !== 'POST') {
    return send(res, 200, view({ notice: url.searchParams.get('done') === 'password' ? DONE.password : undefined }));
  }
  const { fields } = await formBody(req);
  try {
    const user = await auth[up ? 'signUp' : 'signIn'](fields, address);
    return redirect(res, '/', signedInCookie(req, user));
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    return send(res, e.status, view({ error: e.message, values: fields, email: fields.email }));
  }
}

async function pages(req, res, url, parts, user, address) {
  const get = req.method === 'GET' || req.method === 'HEAD';
  const post = req.method === 'POST';
  const [first, second, third, fourth] = parts;
  const q = url.searchParams;
  const notice = Object.hasOwn(DONE, q.get('done') ?? '') ? DONE[q.get('done')] : undefined;
  const notFound = () => send(res, 404, views.messagePage({ user, title: 'Not found', message: 'There is nothing at this address.' }));

  if ((url.pathname === '/sign-in' || url.pathname === '/sign-up') && (get || post)) {
    if (get && user) return redirect(res, '/');
    return signInOrUp(req, res, url, address);
  }
  if (!user) return redirect(res, '/sign-in');
  if (fourth) return notFound();

  if (url.pathname === '/sign-out' && post) {
    auth.endSession(cookie(req, 'session'));
    return redirect(res, '/sign-in', { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if ((url.pathname === '/' || url.pathname === '/home') && get) {
    return send(res, 200, views.homePage({
      user,
      notice,
      sum: rules.summary(),
      low: rules.listStock().filter((s) => s.runningLow),
      waiting: rules.listDeliveries().filter((d) => !d.putAway).reverse(), // oldest first
    }));
  }

  if (first === 'photos' && second && !third && get) {
    const file = path.basename(second);
    const type = TYPES[file.split('.').pop()];
    const full = path.join(PHOTO_DIR, file);
    if (!type || !fs.existsSync(full)) return notFound();
    return send(res, 200, fs.readFileSync(full), type, { 'Cache-Control': 'private, max-age=86400' });
  }

  if (first === 'stock') return stockRoutes();
  if (first === 'deliveries') return deliveryRoutes();
  if (first === 'team' || first === 'password') return teamRoutes();
  return notFound();

  async function stockRoutes() {
    const form = (extra) => views.stockForm({ user, notice, ...extra });
    if (!second && get) {
      const search = (q.get('q') || '').trim().toLowerCase();
      const category = q.get('category') || '';
      const show = q.get('show') === 'low' ? 'low' : '';
      const rows = rules.listStock().filter(
        (s) =>
          (!search || `${s.name}\n${s.notes}`.toLowerCase().includes(search)) &&
          (!category || s.category === category) &&
          (!show || s.runningLow),
      );
      return send(res, 200, views.stockPage({ user, rows, q: q.get('q') || '', category, show, back: withoutDone(url), notice }));
    }
    if (second === 'new' && !third && get) {
      return send(res, 200, form({ values: {}, then: q.get('then') === 'delivery' ? 'delivery' : '' }));
    }
    if (second && !third && get) {
      const item = rules.getStock(second);
      return send(res, 200, form({ item, values: item }));
    }
    if (!third && post) {
      // Add (no second part) or change.
      const { fields, files } = await formBody(req, user);
      let photo;
      try {
        photo = await readPhoto(files.photo);
        const old = second ? rules.getStock(second) : null;
        if (photo) savePhoto(photo);
        let row;
        try {
          if (old) {
            const picture = photo ? photo.name : fields.removePhoto ? null : undefined;
            row = rules.changeStock(second, fields, user, picture);
            if (picture !== undefined) deletePhoto(old.photo);
          } else {
            row = rules.addStock(fields, user, photo?.name ?? null);
          }
        } catch (e) {
          if (photo) deletePhoto(photo.name);
          throw e;
        }
        if (fields.then === 'delivery') return redirect(res, `/deliveries/new?item=${row.id}&done=added`);
        return redirect(res, done('/stock', old ? 'saved' : 'added'));
      } catch (e) {
        if (!(e instanceof Refusal) || e.status === 404) throw e;
        const item = second ? rules.getStock(second) : null;
        const values = e.status === 409 ? item : fields;
        const message = files.photo?.size ? `${e.message} Please choose the photo again.` : e.message;
        return send(res, e.status, form({ item, values, error: message, notice: undefined, then: fields.then === 'delivery' ? 'delivery' : '' }));
      }
    }
    if (third === 'adjust' && post) {
      const { fields } = await formBody(req, user);
      const item = rules.adjustStock(second, fields.by, user);
      return redirect(res, `${done(safeBack(fields.back, '/stock'), 'counted')}#stock-${item.id}`);
    }
    if (third === 'delete' && post) {
      deletePhoto(rules.removeStock(second).photo);
      return redirect(res, done('/stock', 'removed'));
    }
    return notFound();
  }

  async function deliveryRoutes() {
    const form = (extra) =>
      views.deliveryForm({ user, notice, stock: rules.listStock(), suppliers: rules.suppliers(), ...extra });
    if (!second && get) {
      const month = rules.today().slice(0, 7);
      const show = ['waiting', 'month'].includes(q.get('show')) ? q.get('show') : '';
      const rows = rules.listDeliveries().filter(
        (d) => (show !== 'waiting' || !d.putAway) && (show !== 'month' || d.arrived.startsWith(month)),
      );
      return send(res, 200, views.deliveriesPage({ user, rows, show, month, back: withoutDone(url), notice }));
    }
    if (second === 'new' && !third && get) {
      return send(res, 200, form({ values: { arrived: rules.today(), stockId: q.get('item') || '' } }));
    }
    if (second && !third && get) {
      const delivery = rules.getDelivery(second);
      return send(res, 200, form({ delivery, values: delivery }));
    }
    if (!third && post) {
      const { fields } = await formBody(req, user);
      // An unticked box is not sent at all, which here means "no".
      const input = { ...fields, putAway: fields.putAway ?? 'no' };
      try {
        if (second) rules.changeDelivery(second, input, user);
        else rules.addDelivery(input, user);
        return redirect(res, done('/deliveries', second ? 'saved' : 'added'));
      } catch (e) {
        if (!(e instanceof Refusal) || e.status === 404) throw e;
        const delivery = second ? rules.getDelivery(second) : null;
        return send(res, e.status, form({ delivery, values: e.status === 409 ? delivery : input, error: e.message, notice: undefined }));
      }
    }
    if (third === 'put-away' && post) {
      const { fields } = await formBody(req, user);
      rules.changeDelivery(second, { putAway: true }, user);
      return redirect(res, done(safeBack(fields.back, '/deliveries'), 'away'));
    }
    if (third === 'delete' && post) {
      rules.removeDelivery(second);
      return redirect(res, done('/deliveries', 'removed'));
    }
    return notFound();
  }

  async function teamRoutes() {
    const view = (extra) =>
      views.teamPage({
        user,
        people: auth.team(),
        code: user.role === 'coordinator' ? auth.teamCode() : null,
        notice,
        ...extra,
      });
    if (url.pathname === '/team' && get) return send(res, 200, view({}));
    if (!post) return notFound();
    const { fields } = await formBody(req, user);
    try {
      if (url.pathname === '/password') {
        await auth.changePassword(user, fields.current, fields.next);
        return redirect(res, '/sign-in?done=password', { 'Set-Cookie': sessionCookie(req, '', 0) });
      }
      if (second === 'new-code' && !third) {
        if (user.role !== 'coordinator') throw new Refusal('Only the coordinator can do that.', 403);
        auth.newTeamCode();
        return redirect(res, done('/team', 'code'));
      }
      if (third === 'remove') {
        auth.removeVolunteer(user, second);
        return redirect(res, done('/team', 'gone'));
      }
      if (third === 'reset') {
        const reset = await auth.resetPassword(user, second);
        return send(res, 200, view({ reset }));
      }
      return notFound();
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      return send(res, e.status, view({ error: e.message, notice: undefined }));
    }
  }
}

/* ---------- the server ---------- */

async function handle(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

  let url;
  let parts;
  try {
    url = new URL(`http://app${req.url}`);
    parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return send(res, 400, 'Bad address', 'text/plain');
  }
  const isApi = parts[0] === 'api';
  let user;
  try {
    if (Object.hasOwn(STATIC, url.pathname) && (req.method === 'GET' || req.method === 'HEAD')) {
      return send(res, 200, fs.readFileSync(path.join(PUBLIC, url.pathname)), STATIC[url.pathname], { 'Cache-Control': 'no-cache' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD' && fromElsewhere(req)) {
      throw new Refusal('That request came from another website, so it was refused.', 403);
    }
    user = auth.userFor(cookie(req, 'session'));
    const address = req.socket.remoteAddress;
    if (isApi) await api(req, res, parts, user, address);
    else await pages(req, res, url, parts, user, address);
  } catch (e) {
    const known = e instanceof Refusal;
    if (!known) console.error(e);
    if (res.headersSent) return res.end();
    const status = known ? e.status : 500;
    const message = known ? e.message : 'Something went wrong. Please try again.';
    if (isApi) return json(res, status, { error: message });
    send(res, status, views.messagePage({ user, title: 'Sorry', message }));
  }
}

const server = http.createServer(handle);
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

server.listen(port, host, () => {
  console.log(`${views.APP_NAME} is running.`);
  console.log(`On this computer:  http://localhost:${port}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets) {
      if (n.family === 'IPv4' && !n.internal) console.log(`On the same Wi-Fi: http://${n.address}:${port}`);
    }
  }
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    server.closeIdleConnections();
    // Give anything half done a moment, then close.
    setTimeout(() => server.closeAllConnections(), 3000).unref();
  });
}
