// The one place where the sums are worked out. The page and /api/work-out both use it.

export class NotYourFile extends Error {}

const HEADINGS = ['date', 'item', 'quantity', 'price'];
const WANTED = 'The first line should be the headings date,item,quantity,price.';

/** Turn the file's bytes into text (UTF-8, UTF-16, or the older Windows kind some spreadsheets save). */
export function decode(bytes) {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    throw new NotYourFile('That is an Excel or Numbers workbook, not a CSV file. Save or export it as CSV and drop that in.');
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Split one line at its commas, minding double quotes. Returns null when the quotes do not add up. */
export function splitLine(line) {
  const parts = [];
  let i = 0;
  for (;;) {
    let start = i;
    while (line[start] === ' ' || line[start] === '\t') start++;
    if (line[start] === '"') {
      let value = '';
      let j = start + 1;
      for (;;) {
        if (j >= line.length) return null;
        if (line[j] === '"') {
          if (line[j + 1] === '"') { value += '"'; j += 2; continue; }
          j++;
          break;
        }
        value += line[j++];
      }
      while (line[j] === ' ' || line[j] === '\t') j++;
      if (j < line.length && line[j] !== ',') return null;
      parts.push(value);
      if (j >= line.length) return parts;
      i = j + 1;
    } else {
      const comma = line.indexOf(',', i);
      if (comma === -1) { parts.push(line.slice(i)); return parts; }
      parts.push(line.slice(i, comma));
      i = comma + 1;
    }
  }
}

function realDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(2000, 0, 1));
  date.setUTCFullYear(y, mo - 1, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Read one sale line. Returns { sale } or { why } (in words, why it cannot be read). */
function readSale(line) {
  const parts = splitLine(line);
  if (!parts) return { why: 'a double quote is not closed properly' };
  if (parts.length !== 4) return { why: `it has ${parts.length} part${parts.length === 1 ? '' : 's'} instead of 4` };
  const [date, name, quantity, price] = parts.map((p) => p.trim());
  if (!realDate(date)) return { why: 'the date is not a real date written like 2027-05-08' };
  if (!name) return { why: 'there is no candle name' };
  if (!/^[+-]?\d{1,6}$/.test(quantity)) return { why: 'the quantity is not a whole number' };
  if (!/^(\d{1,6}(\.\d*)?|\.\d+)$/.test(price)) return { why: 'the price is not a number such as 12.50' };
  // Money is added up in whole pence, so that no penny goes astray.
  const [pounds, fraction = ''] = price.split('.');
  const pence = Number(pounds || 0) * 100 + Number((fraction + '00').slice(0, 2)) + (Number(fraction[2] || 0) >= 5 ? 1 : 0);
  return { sale: { date, name, quantity: Number(quantity), pence } };
}

export function workOut(text) {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first === -1) throw new NotYourFile(`That file is empty. ${WANTED}`);
  const headings = splitLine(lines[first])?.map((h) => h.trim().toLowerCase());
  if (!headings || headings.length !== 4 || HEADINGS.some((h, i) => headings[i] !== h)) {
    throw new NotYourFile(`That does not look like your card reader file. ${WANTED}`);
  }

  let total = 0;
  let sold = 0;
  let refunds = 0;
  let sales = 0;
  const candles = new Map(); // kept in the order each candle first appears in the file
  const days = new Map();
  const skipped = [];

  for (let n = first + 1; n < lines.length; n++) {
    if (lines[n].trim() === '') continue;
    const { sale, why } = readSale(lines[n]);
    if (!sale) { skipped.push({ line: n + 1, why }); continue; }

    const amount = sale.quantity * sale.pence;
    sales++;
    total += amount;
    sold += sale.quantity;
    if (sale.quantity < 0) refunds++;
    days.set(sale.date, (days.get(sale.date) || 0) + amount);

    const key = sale.name.normalize('NFC').toLowerCase();
    if (!candles.has(key)) candles.set(key, { name: sale.name, quantity: 0 });
    candles.get(key).quantity += sale.quantity;
  }

  let best = null;
  for (const candle of candles.values()) {
    // Only a strictly bigger number takes over, so a tie goes to the one that came first.
    if (candle.quantity > 0 && (!best || candle.quantity > best.quantity)) best = candle;
  }

  return {
    totalTakings: total / 100,
    candlesSold: sold,
    bestSeller: best ? best.name : null,
    bestSellerQuantity: best ? best.quantity : 0,
    refunds,
    skippedLines: skipped.length,
    days: [...days.keys()].sort().map((date) => ({ date, takings: days.get(date) / 100 })),
    salesLines: sales,
    skipped,
  };
}
