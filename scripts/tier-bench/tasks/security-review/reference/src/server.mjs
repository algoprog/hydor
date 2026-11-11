// The HTTP server: finds the route of a request, checks who is asking and sends the answer.
// Run with `node src/server.mjs`; PORT (default 3000) and DATA_DIR (default ./data) come from the environment.
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deleteUser, listUsers, requireAdmin, setRole, stats } from './admin.mjs';
import { Store } from './db.mjs';
import * as files from './files.mjs';
import { createShare, shareDownload, sharePage } from './share.mjs';
import { loadSecret, revoke, verify } from './tokens.mjs';
import { changePassword, confirmReset, ensureAdmin, logIn, profile, requestReset, signUp, updateProfile, updateSettings } from './users.mjs';
import { HttpError, MAX_UPLOAD, readBody, readJson } from './util.mjs';

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendEmpty(res) {
  res.writeHead(204);
  res.end();
}

function sendFile(res, name, data) {
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': data.length,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
  res.end(data);
}

function sendHtml(res, html) {
  const body = Buffer.from(html);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
  res.end(body);
}

// The account a request is made by, from its "Authorization: Bearer <token>" header.
function authenticate(ctx) {
  const match = /^Bearer (.+)$/.exec(ctx.req.headers.authorization ?? '');
  const session = match && verify(ctx.store, ctx.secret, match[1]);
  const user = session && ctx.store.userById(session.userId);
  if (!user) throw new HttpError(401, 'log in first');
  ctx.session = session;
  return user;
}

const routes = [
  ['GET', '/health', ({ res }) => sendJson(res, 200, { ok: true })],

  ['POST', '/signup', async (c) => {
    const user = await signUp(c.store, await readJson(c.req));
    sendJson(c.res, 201, { id: user.id, name: user.name });
  }],
  ['POST', '/login', async (c) => sendJson(c.res, 200, await logIn(c.store, c.secret, await readJson(c.req)))],
  ['POST', '/logout', (c) => {
    authenticate(c);
    revoke(c.store, c.session.id);
    sendEmpty(c.res);
  }],
  ['POST', '/reset', async (c) => {
    requestReset(c.store, await readJson(c.req));
    c.res.writeHead(202);
    c.res.end();
  }],
  ['POST', '/reset/confirm', async (c) => {
    await confirmReset(c.store, await readJson(c.req));
    sendEmpty(c.res);
  }],

  ['GET', '/me', (c) => sendJson(c.res, 200, profile(authenticate(c)))],
  ['PATCH', '/me', async (c) => sendJson(c.res, 200, updateProfile(c.store, authenticate(c), await readJson(c.req)))],
  ['POST', '/me/password', async (c) => {
    const user = authenticate(c);
    sendJson(c.res, 200, await changePassword(c.store, c.secret, user, await readJson(c.req)));
  }],
  ['GET', '/me/settings', (c) => sendJson(c.res, 200, authenticate(c).settings)],
  ['PUT', '/me/settings', async (c) => {
    const user = authenticate(c);
    sendJson(c.res, 200, updateSettings(c.store, user, await readJson(c.req)));
  }],

  ['GET', '/files', (c) => sendJson(c.res, 200, files.list(c.store, authenticate(c)))],
  ['POST', '/files', async (c) => {
    const user = authenticate(c);
    const data = await readBody(c.req, MAX_UPLOAD);
    sendJson(c.res, 201, files.upload(c.store, user, c.query.get('name'), data));
  }],
  ['GET', '/files/by-id/:id', (c) => {
    const user = authenticate(c);
    const file = files.downloadById(c.store, user, c.params.id);
    sendFile(c.res, file.name, file.data);
  }],
  ['GET', '/files/:name', (c) => {
    const file = files.download(c.store, authenticate(c), c.params.name);
    sendFile(c.res, file.name, file.data);
  }],
  ['DELETE', '/files/:name', (c) => {
    files.remove(c.store, authenticate(c), c.params.name);
    sendEmpty(c.res);
  }],
  ['POST', '/files/:name/share', (c) => sendJson(c.res, 201, createShare(c.store, authenticate(c), c.params.name))],

  ['GET', '/s/:token', (c) => sendHtml(c.res, sharePage(c.store, c.params.token))],
  ['GET', '/s/:token/download', (c) => {
    const file = shareDownload(c.store, c.params.token);
    sendFile(c.res, file.name, file.data);
  }],

  ['GET', '/admin/users', (c) => {
    requireAdmin(authenticate(c));
    sendJson(c.res, 200, listUsers(c.store));
  }],
  ['GET', '/admin/stats', (c) => {
    requireAdmin(authenticate(c));
    sendJson(c.res, 200, stats(c.store));
  }],
  ['POST', '/admin/users/:id/role', async (c) => {
    requireAdmin(authenticate(c));
    sendJson(c.res, 200, setRole(c.store, c.params.id, (await readJson(c.req)).role));
  }],
  ['DELETE', '/admin/users/:id', (c) => {
    const admin = authenticate(c);
    requireAdmin(admin);
    deleteUser(c.store, admin, c.params.id);
    sendEmpty(c.res);
  }],
].map(([method, pattern, handler]) => ({ method, parts: pattern.split('/').filter(Boolean), handler }));

function decode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new HttpError(400, 'the address is not valid');
  }
}

function findRoute(method, parts) {
  for (const route of routes) {
    if (route.method !== method || route.parts.length !== parts.length) continue;
    const params = {};
    const matches = route.parts.every((part, i) => {
      if (!part.startsWith(':')) return part === parts[i];
      params[part.slice(1)] = parts[i];
      return true;
    });
    if (matches) return { handler: route.handler, params };
  }
  return null;
}

export async function createApp({ dataDir, adminPassword }) {
  const store = new Store(dataDir);
  const secret = loadSecret(dataDir);
  await ensureAdmin(store, adminPassword);
  return http.createServer(async (req, res) => {
    try {
      const url = req.url ?? '/';
      const cut = url.indexOf('?');
      const pathname = cut < 0 ? url : url.slice(0, cut);
      const query = new URLSearchParams(cut < 0 ? '' : url.slice(cut + 1));
      const parts = pathname.split('/').filter(Boolean).map(decode);
      const route = findRoute(req.method, parts);
      if (!route) throw new HttpError(404, 'no such page');
      await route.handler({ req, res, store, secret, query, params: route.params });
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      if (res.headersSent) {
        res.end();
        return;
      }
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 413) res.setHeader('Connection', 'close');
      sendJson(res, status, { error: err instanceof HttpError ? err.message : 'something went wrong' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 3000);
  const server = await createApp({ dataDir: path.resolve(process.env.DATA_DIR ?? 'data'), adminPassword: process.env.ADMIN_PASSWORD });
  server.listen(port, () => console.log(`listening on port ${server.address().port}`));
}
