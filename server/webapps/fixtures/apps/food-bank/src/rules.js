// The rules of the food bank. The pages and the /api addresses both come here.
import { one, all, run } from './db.js';

export const CATEGORIES = ['tinned', 'fresh', 'dry goods', 'baby & household'];
export const LOW_BELOW = 10; // "running low" means fewer than this left
const TIME_ZONE = 'Europe/London';

export const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export class Refusal extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function text(value, label, { required = false, max = 200 } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new Refusal(`${label} must be words.`);
  const s = value.replace(/\r\n/g, '\n').trim();
  if (required && !s) throw new Refusal(`Please fill in ${label.toLowerCase()}.`);
  if (s.length > max) throw new Refusal(`${label} is too long (at most ${max} characters).`);
  return s;
}

function whole(value, label, min, max) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    throw new Refusal(`Please fill in ${label.toLowerCase()}.`);
  }
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isInteger(n)) throw new Refusal(`${label} must be a whole number.`);
  if (n < min) throw new Refusal(`${label} cannot be less than ${min}.`);
  if (n > max) throw new Refusal(`${label} is too big (at most ${max}).`);
  return n;
}

function day(value, label, required) {
  const s = text(value, label, { required, max: 10 });
  if (!s) return null;
  const real = /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);
  if (!real || s < '2000-01-01' || s > '2100-12-31') throw new Refusal(`${label} must be a real date, like 2026-03-31.`);
  return s;
}

function yesNo(value, label) {
  if ([true, 1, 'true', 'yes', 'on', '1'].includes(value)) return true;
  if ([false, 0, 'false', 'no', 'off', '0', '', null, undefined].includes(value)) return false;
  throw new Refusal(`${label} must be yes or no.`);
}

function rowId(value) {
  const s = String(value);
  return /^\d{1,15}$/.test(s) ? Number(s) : 0;
}

/* ---------- stock ---------- */

function checkStock(input) {
  const name = text(input.name, 'What it is', { required: true, max: 120 });
  const category = text(input.category, 'What sort of thing it is', { required: true }).toLowerCase();
  if (!CATEGORIES.includes(category)) {
    throw new Refusal(`What sort of thing it is must be one of: ${CATEGORIES.join(', ')}.`);
  }
  return {
    name,
    category,
    quantity: whole(input.quantity, 'How many', 0, 1000000),
    bestBefore: day(input.bestBefore, 'Best-before date', false),
    notes: text(input.notes, 'Notes', { max: 10000 }),
  };
}

const stockRow = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  quantity: r.quantity,
  bestBefore: r.best_before,
  notes: r.notes,
  photo: r.photo ? `/photos/${r.photo}` : null,
  runningLow: r.quantity < LOW_BELOW,
  version: r.version,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

export const listStock = () => all('SELECT * FROM stock WHERE removed = 0 ORDER BY name COLLATE NOCASE, id').map(stockRow);

export function getStock(id) {
  const r = one('SELECT * FROM stock WHERE id = ? AND removed = 0', rowId(id));
  if (!r) throw new Refusal('That item is not in the stock list. Someone may have removed it.', 404);
  return stockRow(r);
}

export function addStock(input, user, photo = null) {
  const v = checkStock(input);
  const { lastInsertRowid } = run(
    'INSERT INTO stock (name, category, quantity, best_before, notes, photo, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?)',
    v.name, v.category, v.quantity, v.bestBefore, v.notes, photo, new Date().toISOString(), user.name,
  );
  return getStock(lastInsertRowid);
}

// Fields that are not sent keep their value. photo: undefined keeps it, null takes it off.
export function changeStock(id, input, user, photo) {
  const old = getStock(id);
  checkVersion(input.version, old);
  const v = checkStock({ ...old, ...input });
  const file = photo === undefined ? old.photo?.slice('/photos/'.length) ?? null : photo;
  run(
    'UPDATE stock SET name=?, category=?, quantity=?, best_before=?, notes=?, photo=?, version=version+1, updated_at=?, updated_by=? WHERE id=?',
    v.name, v.category, v.quantity, v.bestBefore, v.notes, file, new Date().toISOString(), user.name, old.id,
  );
  return getStock(old.id);
}

// "One more" / "one fewer": added to whatever the number is now, so two people tapping do not undo each other.
export function adjustStock(id, delta, user) {
  const old = getStock(id);
  const by = whole(delta, 'The change', -1000000, 1000000);
  run(
    'UPDATE stock SET quantity = MIN(1000000, MAX(0, quantity + ?)), version=version+1, updated_at=?, updated_by=? WHERE id=?',
    by, new Date().toISOString(), user.name, old.id,
  );
  return getStock(old.id);
}

export function removeStock(id) {
  const old = getStock(id);
  run('UPDATE stock SET removed = 1, photo = NULL WHERE id = ?', old.id);
  return old;
}

// If the form was opened before someone else saved, say so instead of overwriting their work.
function checkVersion(sent, row) {
  if (sent === undefined || sent === null || sent === '') return;
  if (Number(sent) !== row.version) {
    throw new Refusal(`${row.updatedBy} changed this while you had it open, so nothing was saved. Look at how it is now and make your change again.`, 409);
  }
}

/* ---------- deliveries ---------- */

function checkDelivery(input, currentStockId) {
  if (input.stockId === undefined || input.stockId === null || input.stockId === '') {
    throw new Refusal('Please pick which stock item came.');
  }
  const stockId = rowId(input.stockId);
  const item = one('SELECT id, removed FROM stock WHERE id = ?', stockId);
  if (!item || (item.removed && item.id !== currentStockId)) throw new Refusal('Please pick an item from the stock list.');
  return {
    stockId,
    from: text(input.from, 'Who it came from', { required: true, max: 120 }),
    arrived: day(input.arrived, 'The day it arrived', true),
    kilos: whole(input.kilos, 'Kilos', 1, 100000),
    putAway: yesNo(input.putAway, 'Put away'),
  };
}

const deliverySelect = `SELECT d.*, s.name AS item, s.removed AS item_removed
  FROM deliveries d JOIN stock s ON s.id = d.stock_id`;

const deliveryRow = (r) => ({
  id: r.id,
  stockId: r.stock_id,
  item: r.item,
  itemRemoved: Boolean(r.item_removed),
  from: r.supplier,
  arrived: r.arrived,
  kilos: r.kilos,
  putAway: Boolean(r.put_away),
  version: r.version,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

export const listDeliveries = () => all(`${deliverySelect} ORDER BY d.arrived DESC, d.id DESC`).map(deliveryRow);

export function getDelivery(id) {
  const r = one(`${deliverySelect} WHERE d.id = ?`, rowId(id));
  if (!r) throw new Refusal('That delivery is not here. Someone may have removed it.', 404);
  return deliveryRow(r);
}

export function addDelivery(input, user) {
  const v = checkDelivery(input);
  const { lastInsertRowid } = run(
    'INSERT INTO deliveries (stock_id, supplier, arrived, kilos, put_away, updated_at, updated_by) VALUES (?,?,?,?,?,?,?)',
    v.stockId, v.from, v.arrived, v.kilos, Number(v.putAway), new Date().toISOString(), user.name,
  );
  return getDelivery(lastInsertRowid);
}

export function changeDelivery(id, input, user) {
  const old = getDelivery(id);
  checkVersion(input.version, old);
  const v = checkDelivery({ ...old, ...input }, old.stockId);
  run(
    'UPDATE deliveries SET stock_id=?, supplier=?, arrived=?, kilos=?, put_away=?, version=version+1, updated_at=?, updated_by=? WHERE id=?',
    v.stockId, v.from, v.arrived, v.kilos, Number(v.putAway), new Date().toISOString(), user.name, old.id,
  );
  return getDelivery(old.id);
}

export function removeDelivery(id) {
  const old = getDelivery(id);
  run('DELETE FROM deliveries WHERE id = ?', old.id);
  return old;
}

export const suppliers = () =>
  all('SELECT DISTINCT supplier FROM deliveries ORDER BY supplier COLLATE NOCASE').map((r) => r.supplier);

/* ---------- the three numbers on the home page ---------- */

export function summary() {
  const month = today().slice(0, 7);
  return {
    month,
    runningLow: one('SELECT COUNT(*) AS n FROM stock WHERE removed = 0 AND quantity < ?', LOW_BELOW).n,
    kilosThisMonth: one('SELECT COALESCE(SUM(kilos), 0) AS n FROM deliveries WHERE substr(arrived, 1, 7) = ?', month).n,
    notPutAway: one('SELECT COUNT(*) AS n FROM deliveries WHERE put_away = 0').n,
  };
}
