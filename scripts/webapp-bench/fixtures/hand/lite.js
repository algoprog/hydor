// The part of Express that the reference apps use, on Node's own http module, so that the self-test needs no package from a registry (the apps' database is better-sqlite3,
// which this repository has). It does what Express 4 does for the calls the apps make: routes with :params in the order they were added (case does not matter, nor a slash at
// the end), middleware and error handlers, express.json and express.urlencoded (a body over its limit or not JSON is an error), express.static, and res.status, json, send,
// cookie, redirect and set. A reference app is meant to be what a builder would write with Express; this is only what lets it run here.
'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const querystring = require('node:querystring');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const plain = (o) => ({ ...o });

function compile(pattern) {
  const names = [];
  const source = pattern.replace(/[.+*?^${}()|[\]\\]/g, '\\$&').replace(/\/:(\w+)/g, (_m, name) => (names.push(name), '/([^/]+)'));
  const re = new RegExp(`^${source}/?$`, 'i');
  return (pathname) => {
    const m = re.exec(pathname);
    try {
      return m ? Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) : null;
    } catch {
      return null;
    }
  };
}

function reply(res) {
  res.status = (code) => ((res.statusCode = code), res);
  res.set = (name, value) => (res.setHeader(name, value), res);
  res.type = (type) => res.set('content-type', TYPES[`.${type}`] ?? type);
  res.send = (body) => {
    if (typeof body === 'string') {
      if (!res.getHeader('content-type')) res.set('content-type', 'text/html; charset=utf-8');
      return res.end(body);
    }
    if (Buffer.isBuffer(body)) return res.end(body);
    return res.json(body);
  };
  res.json = (body) => {
    if (!res.getHeader('content-type')) res.set('content-type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(body));
  };
  res.cookie = (name, value, o = {}) => {
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path ?? '/'}`];
    if (o.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(o.maxAge / 1000)}`, `Expires=${new Date(Date.now() + o.maxAge).toUTCString()}`);
    if (o.httpOnly) parts.push('HttpOnly');
    if (o.sameSite) parts.push(`SameSite=${o.sameSite[0].toUpperCase()}${o.sameSite.slice(1)}`);
    const have = res.getHeader('set-cookie');
    res.setHeader('set-cookie', [...(Array.isArray(have) ? have : have ? [have] : []), parts.join('; ')]);
    return res;
  };
  res.redirect = (url) => {
    res.statusCode = 302;
    res.setHeader('location', url);
    return res.end(`Found. Redirecting to ${url}`);
  };
}

function express() {
  const stack = [];
  // one layer for each function, so that a route's own middleware (needPerson) and its handler come one after the other
  const add = (method, pattern, fns) => {
    const match = pattern === null ? () => ({}) : compile(pattern);
    for (const fn of fns.flat()) stack.push({ method, match, fn });
  };
  const app = (req, res) => {
    reply(res);
    const url = new URL(req.url, 'http://localhost');
    req.path = url.pathname;
    req.query = plain(querystring.parse(url.search.slice(1)));
    req.body = {};
    let i = 0;
    const next = (err) => {
      while (i < stack.length) {
        const layer = stack[i++];
        if (layer.method && layer.method !== req.method && !(layer.method === 'GET' && req.method === 'HEAD')) continue;
        const params = layer.match(req.path);
        if (!params) continue;
        req.params = params;
        const fn = layer.fn;
        if (err ? fn.length !== 4 : fn.length === 4) continue;
        try {
          return err ? fn(err, req, res, next) : fn(req, res, next);
        } catch (e) {
          return next(e);
        }
      }
      if (err) {
        res.statusCode = err.status || err.statusCode || 500;
        return res.end(`<pre>${String(err.stack || err).replace(/</g, '&lt;')}</pre>`);
      }
      res.statusCode = 404;
      res.end(`<pre>Cannot ${req.method} ${req.path}</pre>`);
    };
    next();
  };
  app.disable = () => app;
  app.use = (...fns) => (typeof fns[0] === 'string' ? add(null, fns[0], fns.slice(1)) : add(null, null, fns), app);
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) app[m] = (pattern, ...fns) => (add(m.toUpperCase(), pattern, fns), app);
  app.listen = (...args) => http.createServer(app).listen(...args);
  return app;
}

/** Reads the body (at most `limit` bytes) when the request's type is one the parser takes; leaves `req.body` as it was otherwise. */
function parser(type, read, o = {}) {
  const limit = o.limit ? Number.parseInt(o.limit, 10) * (/kb$/i.test(o.limit) ? 1024 : 1) : 100 * 1024;
  return (req, _res, next) => {
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith(type)) return next();
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit && !failed) {
        failed = true;
        next(Object.assign(new Error('request entity too large'), { status: 413 }));
      } else if (!failed) chunks.push(c);
    });
    req.on('end', () => {
      if (failed) return;
      try {
        req.body = read(Buffer.concat(chunks).toString('utf8'));
        next();
      } catch (e) {
        next(Object.assign(e, { status: 400 }));
      }
    });
  };
}

express.json = (o) =>
  parser('application/json', (text) => {
    if (text.trim() === '') return {};
    const value = JSON.parse(text);
    if (typeof value !== 'object' || value === null) throw new SyntaxError('only an object or a list is taken');
    return value;
  }, o);
express.urlencoded = (o) => parser('application/x-www-form-urlencoded', (text) => plain(querystring.parse(text)), o);
express.static = (root) => (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const file = path.join(root, decodeURIComponent(req.path));
  if (!file.startsWith(path.resolve(root)) || path.basename(file).startsWith('.') || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
  res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
};

module.exports = express;
