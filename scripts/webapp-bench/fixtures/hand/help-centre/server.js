// Fenwick Help: a help centre. The owner writes articles (drafts first), anyone reads and searches the published ones; an article's address is made from its title once and never changes.
// Written by hand with Express's calls (lite.js has them) and SQLite.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const express = require('./lite.js');
const Database = require('better-sqlite3');

const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const secret = process.env.SESSION_SECRET;
if (!secret) throw new Error('SESSION_SECRET is not set');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'help.db'));
db.pragma('journal_mode = WAL');
const { personOf, needPerson, routes } = require('./auth.js')(db, secret, false);
db.exec(`CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', slug TEXT UNIQUE NOT NULL);`);

const CATEGORIES = ['Heating', 'Hot water', 'Payments', 'Appointments', 'Safety', 'Warranty'];
const STATUSES = ['draft', 'published'];
const slugify = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const words = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const text = (v, max) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);
const bad = (res, message) => res.status(400).json({ error: message });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const byTitle = (a, b) => (a.title.toLowerCase() < b.title.toLowerCase() ? -1 : a.title.toLowerCase() > b.title.toLowerCase() ? 1 : 0);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use((err, _req, res, next) => (err ? bad(res, 'That could not be read.') : next()));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
routes(app);

// ---- the articles: the owner writes, visitors read what is published
const shape = (r) => ({ id: String(r.id), title: r.title, text: r.text, category: r.category, status: r.status, slug: r.slug });
const isOwner = (req) => personOf(req)?.role === 'owner';

function read(body, current) {
  const title = text(body.title ?? current?.title, 200);
  const body_ = text(body.text ?? current?.text, 50_000);
  const category = body.category ?? current?.category;
  const status = body.status === undefined || body.status === null || body.status === '' ? (current?.status ?? 'draft') : body.status;
  if (!title) return { error: 'An article needs a title.' };
  if (!body_) return { error: 'An article needs its text.' };
  if (!CATEGORIES.includes(category)) return { error: `The group is one of ${CATEGORIES.join(', ')}.` };
  if (!STATUSES.includes(status)) return { error: 'The status is draft or published.' };
  return { value: [title, body_, category, status] };
}

app.get('/api/articles', (req, res) => {
  const rows = db.prepare(isOwner(req) ? 'SELECT * FROM articles ORDER BY id DESC' : "SELECT * FROM articles WHERE status = 'published' ORDER BY id DESC").all();
  res.json({ rows: rows.map(shape) });
});
app.post('/api/articles', needPerson, (req, res) => {
  if (req.person.role !== 'owner') return res.status(403).json({ error: 'Only the owner writes articles.' });
  const r = read(req.body);
  if (r.error) return bad(res, r.error);
  let slug = slugify(r.value[0]);
  if (db.prepare('SELECT 1 FROM articles WHERE slug = ?').get(slug)) slug = `${slug}-${Date.now().toString(36)}`;
  const info = db.prepare('INSERT INTO articles (title, text, category, status, slug) VALUES (?, ?, ?, ?, ?)').run(...r.value, slug);
  res.status(201).json({ id: String(info.lastInsertRowid) });
});
const visibleTo = (req) => {
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  return row && (row.status === 'published' || isOwner(req)) ? row : null;
};
app.get('/api/articles/:id', (req, res) => {
  const row = visibleTo(req);
  return row ? res.json(shape(row)) : res.status(404).json({ error: 'There is no such article.' });
});
app.patch('/api/articles/:id', needPerson, (req, res) => {
  if (req.person.role !== 'owner') return res.status(403).json({ error: 'Only the owner changes articles.' });
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'There is no such article.' });
  const r = read(req.body, row);
  if (r.error) return bad(res, r.error);
  // the address is made once, from the first title, and kept
  db.prepare('UPDATE articles SET title = ?, text = ?, category = ?, status = ? WHERE id = ?').run(...r.value, row.id);
  res.json(shape(db.prepare('SELECT * FROM articles WHERE id = ?').get(row.id)));
});
app.delete('/api/articles/:id', needPerson, (req, res) => {
  if (req.person.role !== 'owner') return res.status(403).json({ error: 'Only the owner removes articles.' });
  const info = db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
  return info.changes ? res.json({ removed: true }) : res.status(404).json({ error: 'There is no such article.' });
});

// ---- the public pages
const layout = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/style.css"></head><body><main><p><a href="/">Fenwick Help</a></p>${body}</main></body></html>`;
const published = () => db.prepare("SELECT * FROM articles WHERE status = 'published'").all();
const list = (rows) => (rows.length === 0 ? '<p>No articles found.</p>' : `<ul>${rows.map((r) => `<li><a href="/help/${r.slug}">${esc(r.title)}</a></li>`).join('')}</ul>`);

app.get('/', (_req, res) =>
  res.send(
    layout(
      'Fenwick Help',
      `<h1>Fenwick Help</h1><p>The help centre of our boiler servicing firm in Harrogate. Search for what you need, or pick a group.</p>
<form action="/search"><input name="q" aria-label="Search"> <button>Search</button></form>
<ul>${CATEGORIES.filter((c) => c !== 'Warranty').map((c) => `<li><a href="/help/category/${slugify(c)}">${esc(c)}</a></li>`).join('')}</ul>`,
    ),
  ),
);

app.get('/help/category/:category', (req, res) => {
  const category = CATEGORIES.find((c) => slugify(c) === req.params.category);
  if (!category) return res.status(404).send(layout('Not found', '<p>There is no such group.</p>'));
  res.send(layout(category, `<h1>${esc(category)}</h1>${list(published().filter((a) => a.category === category).sort(byTitle))}`));
});

app.get('/help/:slug', (req, res) => {
  const row = db.prepare("SELECT * FROM articles WHERE slug = ? AND status = 'published'").get(req.params.slug);
  if (!row) return res.status(404).send(layout('Not found', '<p>There is no such article.</p>'));
  res.send(layout(row.title, `<article><h1>${esc(row.title)}</h1><p>${esc(row.text)}</p></article>`));
});

app.get('/search', (req, res) => {
  const q = words(String(req.query.q || ''));
  const found = q.length === 0 ? [] : published().filter((a) => {
    const have = new Set(words(`${a.title} ${a.text}`));
    return q.every((w) => have.has(w));
  });
  const inTitle = (a) => q.every((w) => words(a.title).includes(w));
  const rows = [...found.filter(inTitle).sort(byTitle), ...found.filter((a) => !inTitle(a)).sort(byTitle)];
  res.send(layout('Search', `<h1>Search</h1><p>${rows.length} article${rows.length === 1 ? '' : 's'} found.</p>${list(rows)}`));
});

const server = app.listen(port, () => console.log(`listening on ${port}`));
const stop = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
