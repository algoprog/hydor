// Market Day Sums. Nothing is written to disk and nothing about a file is logged.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { page } from './page.js';
import { decode, workOut, NotYourFile } from './sums.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BYTES = 5 * 1024 * 1024;

const asset = (name, type) => [`/${name}`, { type, body: readFileSync(new URL(`./public/${name}`, import.meta.url)) }];
const assets = new Map([
  asset('style.css', 'text/css; charset=utf-8'),
  asset('drop.js', 'text/javascript; charset=utf-8'),
  asset('icon.svg', 'image/svg+xml'),
]);

class Refusal extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(res, status, type, body, extra = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    ...extra,
  });
  res.end(body);
}
const html = (res, status, data) => send(res, status, 'text/html; charset=utf-8', page(data));
const json = (res, status, data) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(data));

/** Read the whole request into memory, refusing anything far bigger than a weekend of sales. */
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= MAX_BYTES) chunks.push(chunk); // beyond the limit it is read and thrown away
  }
  if (size > MAX_BYTES) throw new Refusal(413, 'That file is too big. A weekend of sales should be well under 5 MB.');
  return Buffer.concat(chunks);
}

/** The file that was sent: as a part named "file" of a form, or as the whole body in plain text. */
async function readFile(req) {
  const type = req.headers['content-type'] || '';
  const body = await readBody(req);
  if (/^text\/(plain|csv)\b/i.test(type)) return { bytes: body, name: '' };
  if (!/^multipart\/form-data\b/i.test(type)) throw new Refusal(415, 'Please send your CSV file.');
  let form;
  try {
    form = await new Response(body, { headers: { 'content-type': type } }).formData();
  } catch {
    throw new Refusal(400, 'The file did not arrive properly. Please try again.');
  }
  const file = form.get('file');
  if (!file || typeof file === 'string' || (!file.name && file.size === 0)) throw new Refusal(400, 'Please choose your file first.');
  return { bytes: Buffer.from(await file.arrayBuffer()), name: file.name };
}

async function sums(req) {
  const { bytes, name } = await readFile(req);
  return { result: workOut(decode(bytes)), fileName: name };
}

async function handle(req, res) {
  const path = (req.url || '/').split('?')[0];
  const reading = req.method === 'GET' || req.method === 'HEAD';

  if (path === '/' && reading) return html(res, 200);
  if (assets.has(path) && reading) {
    const { type, body } = assets.get(path);
    return send(res, 200, type, body);
  }
  if ((path === '/' || path === '/api/work-out') && req.method === 'POST') {
    const asJson = path !== '/';
    try {
      const data = await sums(req);
      return asJson ? json(res, 200, data.result) : html(res, 200, data);
    } catch (err) {
      const status = err instanceof Refusal ? err.status : err instanceof NotYourFile ? 422 : 500;
      if (status === 500) console.error('Could not work out a file:', err.name);
      const message = status === 500 ? 'Something went wrong while adding up. Please try again.' : err.message;
      return asJson ? json(res, status, { error: message }) : html(res, status, { error: message });
    }
  }
  if (path === '/api/work-out') return json(res, 405, { error: 'Send your file to this address with POST.' });
  if (reading) return send(res, 404, 'text/plain; charset=utf-8', 'There is no such page. Market Day Sums is at /');
  return json(res, 404, { error: 'There is no such address.' });
}

const server = createServer((req, res) => {
  handle(req, res).catch(() => {
    // The browser went away part way through, or something unforeseen: end this request only.
    res.destroy();
  });
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Try: PORT=${PORT + 1} npm start` : err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Market Day Sums is ready: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
