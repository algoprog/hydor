'use strict';
const http = require('node:http');
const { workOut } = require('./sums');
const { renderPage } = require('./page');

// Nothing is saved, so there is no database and no data folder to look after.
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 10_000;

function send(res, status, type, body, headers) {
  res.writeHead(status, {
    'Content-Type': `${type}; charset=utf-8`,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}
const json = (res, status, data, headers) => send(res, status, 'application/json', JSON.stringify(data), headers);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY) reject(Object.assign(new Error('That is too much to send.'), { status: 413 }));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

async function apiWorkOut(req, res) {
  const text = await readBody(req);
  let input;
  if ((req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) {
    input = Object.fromEntries(new URLSearchParams(text));
  } else {
    try {
      input = JSON.parse(text);
    } catch {
      input = null;
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return json(res, 400, { error: 'Please send the number of loaves and the loaf weight.' });
  }
  const outcome = workOut(input);
  if (!outcome.ok) return json(res, 400, { error: outcome.errors.map((e) => e.message).join(' ') });
  return json(res, 200, outcome.result);
}

const server = http.createServer(async (req, res) => {
  try {
    const q = req.url.indexOf('?');
    const path = q === -1 ? req.url : req.url.slice(0, q);
    const query = new URLSearchParams(q === -1 ? '' : req.url.slice(q + 1));

    if (path === '/api/work-out') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Send the numbers with POST.' }, { Allow: 'POST' });
      return await apiWorkOut(req, res);
    }
    if (path === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
      return send(res, 200, 'text/html', renderPage(query));
    }
    return send(res, 404, 'text/plain', 'There is nothing at this address.');
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) json(res, err.status || 500, { error: err.status ? err.message : 'Something went wrong.' });
  }
});

server.listen(PORT, HOST, () => console.log(`Dough Sums is on http://localhost:${PORT}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
