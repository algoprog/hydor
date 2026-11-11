// The checker's own data: ten small datasets for correctness (their expected reports come from the seed's original
// buildReport, which finishes on them) and three of 300,000 rows for speed. Everything is made from fixed seeds.

export const HEADINGS = ['Revenue by customer', 'Revenue by month', 'Top SKUs by quantity', 'Invalid SKUs', 'Median order by region', 'Customers active every month'];

// A small seeded PRNG (mulberry32).
export function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = (list) => list[Math.floor(next() * list.length)];
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  return { next, int, pick, shuffle };
}

const pad2 = (n) => String(n).padStart(2, '0');
// Month number k counted from March 2024: 0 is 2024-03, 10 is 2025-01.
const monthText = (k) => `${2024 + Math.floor((2 + k) / 12)}-${pad2(((2 + k) % 12) + 1)}`;

// Entries { month, customer, sku, qty, price, region } become rows in date order, in a mixed order within a day.
function assemble(r, entries) {
  r.shuffle(entries);
  const dated = entries.map((e) => ({ e, day: r.int(1, 28) }));
  dated.sort((a, b) => a.e.month - b.e.month || a.day - b.day);
  return dated.map(({ e, day }) => ({ date: `${monthText(e.month)}-${pad2(day)}`, customer: e.customer, sku: e.sku, qty: e.qty, unitPrice: e.price, region: e.region }));
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const word = (r, n) => Array.from({ length: n }, () => LETTERS[r.int(0, 25)]).join('');
const REGIONS = ['North', 'South', 'East', 'West', 'Île-de-France', 'Åland', 'Zürich', 'Örebro', 'north'];
const ordinarySkus = (r, n) => Array.from({ length: n }, () => `${word(r, r.int(2, 5))}${r.next() < 0.3 ? `-${word(r, r.int(1, 3))}` : ''}${r.int(10, 9999)}`);

// ---------- correctness datasets ----------

// Customers whose revenue is the same in groups of twenty, so only the collation of the names orders them.
function names() {
  const r = prng(101);
  const customers = [
    'Émile Roux', 'emile roux', 'Emile Roux', 'EMILE ROUX', 'Zoë Lee', 'Zoe Lee', 'Zoë Lee', 'Åsa Berg', 'Asa Berg', 'Åsa Berg', 'Ölund AB', 'Olund AB', 'Ørsted A/S', 'Orsted A/S',
    'Ångström Labs', 'Aaron Smith', 'Æble Co', 'Ärlig Ltd', 'Zulu Mining', 'Ünal Kaya', 'Unal Kaya', 'Ñandú SA', 'Nandu SA', 'Çelik Metal', 'Celik Metal', 'Zürich Re', 'Zurich Re', 'O’Brien & Sons',
    "O'Brien & Sons", 'OBrien and Sons', 'O-Brien', 'McDonald Ltd', 'mcdonald ltd', 'Mc Donald Ltd', 'van der Berg', 'Van der Berg', 'Vanderberg', 'de la Cruz', 'De la Cruz', 'Dela Cruz', 'Łukasz Nowak',
    'Lukasz Nowak', 'Ibáñez', 'Ibanez', '(Acme)', '[Acme]', '_acme', '-acme', '10442', '2', '10', 'Acme 2', 'Acme 10', 'acme  corp', ' Leading space', 'Trailing space ', '123 Holdings', 'Zoë', 'zoë', 'ZOË',
  ];
  const skus = ordinarySkus(r, 30);
  const entries = [];
  customers.forEach((customer, j) => {
    const count = 12 * (1 + (j % 3));
    for (let k = 0; k < count; k++) entries.push({ month: (k + j) % 12, customer, sku: r.pick(skus), qty: 2, price: 7.5, region: r.pick(REGIONS) });
  });
  return assemble(r, entries);
}

// SKUs sold in equal quantities, among them old all-digit ones, with the top ten cutting a group of ties in two.
function skuTies() {
  const r = prng(202);
  const plain = ordinarySkus(r, 40);
  // Four SKUs of 60 units, fourteen of 40 (five of them all digits), then the rest with 15 each.
  const plan = [];
  plain.slice(0, 4).forEach((sku) => plan.push([sku, 60]));
  [...plain.slice(4, 13), '10442', '7', '300', '12', '9'].forEach((sku) => plan.push([sku, 40]));
  [...plain.slice(13, 33), '88120', '00123', '4521', '100'].forEach((sku) => plan.push([sku, 15]));
  const customers = Array.from({ length: 90 }, (_, i) => `Customer ${i + 1}`);
  const entries = [];
  for (const [sku, units] of plan) {
    for (let k = 0; k < units; k++) entries.push({ month: r.int(0, 11), customer: r.pick(customers), sku, qty: 1, price: r.int(1000, 30000) / 1000, region: r.pick(REGIONS) });
  }
  return assemble(r, entries);
}

// Rows around a few special SKUs: each appears a different number of times, so a wrong ruling shows in the count.
function skuEdges(seed, special, extraRows) {
  const r = prng(seed);
  const plain = ordinarySkus(r, 25);
  const customers = Array.from({ length: 60 }, (_, i) => `Customer ${i + 1}`);
  const entries = [];
  const add = (sku) => entries.push({ month: r.int(0, 11), customer: r.pick(customers), sku, qty: r.int(1, 9), price: r.int(500, 25000) / 1000, region: r.pick(REGIONS) });
  for (let i = 0; i < extraRows; i++) add(r.pick(plain));
  special.forEach((sku, i) => {
    for (let k = 0; k < 2 + i; k++) add(sku);
  });
  return assemble(r, entries);
}

function hyphens() {
  const valid = ['AB-12', 'A-B-12', 'AB-CD-1234', 'ABC-12', 'XY-ZW-QR-007', 'Q-99', 'M-N-100'];
  const invalid = ['AB--12', 'AB-12-34', '-AB12', 'AB-', 'AB-1', 'A--B12', 'AB-C--D12', 'AB---12', 'A-B-', '-12', '--12', '12-34', 'AB-12-', 'AB-C-D-9'];
  const special = [];
  for (let i = 0; i < Math.max(valid.length, invalid.length); i++) {
    if (i < invalid.length) special.push(invalid[i]);
    if (i < valid.length) special.push(valid[i]);
  }
  return skuEdges(303, special, 1200);
}

function lettersAndDigits() {
  const special = [
    'A1', 'A12', 'ab12', 'Ab12', 'AB1c', 'ÄB12', 'ABÖ12', 'AB12', 'AB１２', 'AB١٢', 'AÅ12', 'ΑΒ12', 'AB_12', 'AB.12', 'AB 12', 'AB12A', '1234', '12AB', '', 'AB012', 'A00', 'AB1234567890', 'Z99',
    'ZZ9', 'É12', 'ab-12', 'Ab-CD12', 'AB-cd-12',
  ];
  return skuEdges(404, special, 1000);
}

function whitespaceAndLong() {
  const special = [
    'AB12 ', ' AB12', 'AB12\n', 'AB12\t', 'AB 12', ' ', ' AB12', 'AB12 ', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-1234', 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCD-1234', `${'A'.repeat(200)}12`, `${'A'.repeat(18)}-`,
    `${'AB-'.repeat(7)}1`, 'ABCDEFGHIJKLMNOPQRST-1234 ', 'ABCDEFGHIJKLMNOPQRS-12\n', `${'AB-'.repeat(9)}99`, 'AB12\r\n', '\tAB12',
  ];
  return skuEdges(505, special, 1000);
}

// Sums and medians that land exactly on a half cent: how they print depends on the order of the additions and on
// which values are added.
function money() {
  const r = prng(606);
  const entries = [];
  const skus = ordinarySkus(r, 20);
  // Customers whose total, in thousandths, ends in 5.
  for (let c = 0; c < 120; c++) {
    const customer = `Cust ${String(c + 1).padStart(3, '0')}`;
    const count = r.int(16, 30);
    const rows = [];
    let total = 0;
    for (let k = 0; k < count - 1; k++) {
      const qty = r.int(1, 5);
      const price = r.int(100, 9999);
      total += qty * price;
      rows.push({ qty, price });
    }
    const last = r.int(100, 9999);
    rows.push({ qty: 1, price: last + ((((5 - ((total + last) % 10)) % 10) + 10) % 10) });
    rows.forEach((row, k) => entries.push({ month: k % 12, customer, sku: r.pick(skus), qty: row.qty, price: row.price / 1000, region: 'Bulk' }));
  }
  // Regions of two orders whose mean ends in 5 at the third decimal of a cent.
  for (let z = 0; z < 30; z++) {
    const a = r.int(500, 50000);
    let b = r.int(500, 50000);
    b += (((10 - ((a + b) % 20)) % 20) + 20) % 20;
    for (const v of [a, b]) entries.push({ month: r.int(0, 11), customer: `Zone buyer ${z + 1}`, sku: r.pick(skus), qty: 1, price: v / 1000, region: `Zone ${String(z + 1).padStart(2, '0')}` });
  }
  return assemble(r, entries);
}

// Names that mean something to a plain JavaScript object.
function specialKeys() {
  const r = prng(707);
  const keys = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'length'];
  const customers = [...keys, ...Array.from({ length: 15 }, (_, i) => `Normal ${i + 1}`)];
  const skus = [...keys, ...ordinarySkus(r, 6)];
  const regions = [...keys.slice(0, 3), 'North', 'South'];
  const entries = [];
  for (let i = 0; i < 700; i++) entries.push({ month: i % 12, customer: customers[i % customers.length], sku: skus[(i * 7) % skus.length], qty: 1 + (i % 3), price: 2.5, region: regions[i % regions.length] });
  return assemble(r, entries);
}

// Customers active in every month, in only some, and in two months with many rows each.
function activity() {
  const r = prng(808);
  const months = 14;
  const always = ['Marta Åkesson', 'marta akesson', 'Ölund AB', 'Zoë Lee', 'Zoe Lee', 'Émile Roux', 'ANA', 'Ana'];
  const skus = ordinarySkus(r, 15);
  const entries = [];
  const add = (month, customer, qty = r.int(1, 6)) => entries.push({ month, customer, sku: r.pick(skus), qty, price: r.int(500, 20000) / 1000, region: r.pick(REGIONS) });
  for (const customer of always) for (let m = 0; m < months; m++) if (m === 6) { if (customer.length % 3 !== 0) add(m, customer); } else for (let k = 0; k < 1 + r.int(0, 2); k++) add(m, customer);
  for (let c = 0; c < 40; c++) {
    const customer = `Seasonal ${c + 1}`;
    const skip = r.int(0, months - 1);
    for (let m = 0; m < months; m++) if (m !== skip) for (let k = 0; k < 2; k++) add(m, customer);
  }
  // Many rows, but in two months only.
  for (let k = 0; k < 60; k++) add(k % 2 ? 3 : 9, 'Busy twice');
  for (let k = 0; k < 14; k++) add(k % months, 'Zed Every Month');
  return assemble(r, entries);
}

export function correctnessDatasets() {
  return [
    { label: 'names that tie on revenue (accents, case, Scandinavian letters, punctuation)', rows: names() },
    { label: 'SKUs tied on quantity, with old all-digit SKUs', rows: skuTies() },
    { label: 'SKUs with hyphens in odd places', rows: hyphens() },
    { label: 'SKUs with odd letters, digits and lengths', rows: lettersAndDigits() },
    { label: 'SKUs with spaces and line ends, and long ones', rows: whitespaceAndLong() },
    { label: 'sums and medians that land on half a cent', rows: money() },
    { label: 'names that are special to plain objects', rows: specialKeys() },
    { label: 'customers active in every month or not', rows: activity() },
    { label: 'no rows at all', rows: [] },
    { label: 'one row', rows: [{ date: '2025-06-30', customer: 'Solo Buyer', sku: 'AB-12', qty: 3, unitPrice: 1.459, region: 'North' }] },
  ];
}

// ---------- speed datasets ----------

const FIRST = ['Alice', 'Bruno', 'Chloé', 'David', 'Elena', 'Farid', 'Greta', 'Hugo', 'Ines', 'Jonas', 'Katya', 'Liam', 'Maya', 'Noah', 'Olga', 'Pablo', 'Quentin', 'Rosa', 'Sven', 'Åsa', 'Émile', 'Zoë', 'Örjan'];
const LAST = ['Andersson', 'Bernard', 'Carvalho', 'Dubois', 'Eriksen', 'Fontaine', 'Garcia', 'Hansen', 'Ivanov', 'Jensen', 'Kowalski', 'Larsen', 'Moreau', 'Nielsen', 'Olsen', 'Petit', 'Quinn', 'Rossi', 'Schmidt', 'Tanaka', 'Roux', 'Lee', 'Berg'];

// kind 1: skewed and realistic; 2: ties everywhere (revenue, SKU units) and many old all-digit SKUs; 3: names that
// differ only in case and accents, prices to three decimals with returns.
export function speedRows(kind) {
  const r = prng(9000 + kind);
  const n = 300000;
  const customers = [];
  for (let i = 0; customers.length < 4000 + 700 * kind; i++) {
    const f = FIRST[i % FIRST.length];
    const l = LAST[Math.floor(i / FIRST.length) % LAST.length];
    const k = Math.floor(i / (FIRST.length * LAST.length));
    const base = `${f} ${l}${k ? ` ${k}` : ''}`;
    customers.push(kind === 3 ? (i % 3 === 0 ? base.toLowerCase() : i % 3 === 1 ? base.normalize('NFD') : base) : base);
  }
  r.shuffle(customers);
  const plain = ordinarySkus(r, 500);
  const digits = ['10442', '7', '300', '12', '9', '88120', '4521', '100', '5', '81', '2', '65', '1000', '23'];
  // 40 SKUs that sell the same number of units each, the old all-digit ones among them (kind 2).
  const tied = [];
  for (let k = 0, d = 0; tied.length < 40; k++) tied.push(k % 3 === 1 && d < digits.length ? digits[d++] : plain[k]);
  const months = 12 + kind * 2;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const month = Math.floor((i / n) * months);
    const customer = kind === 2 ? customers[Math.floor(r.next() * r.next() * customers.length)] : customers[Math.floor(r.next() ** 2 * customers.length)];
    let sku;
    let qty;
    let price;
    if (i % 20000 === 19999 - kind * 1000) {
      // One of the very long invalid SKUs: the original regular expression never finishes on these.
      sku = `${word(r, 30 + (i % 5))}-`;
      qty = r.int(1, 9);
      price = r.int(500, 9000) / 1000;
    } else if (kind === 2) {
      // Every hundred rows, the first 40 SKUs sell one unit each.
      const slot = i % 100;
      sku = slot < 40 ? tied[slot] : plain[40 + (slot % 460)];
      qty = 1;
      price = r.pick([1, 2.5, 5]);
    } else {
      const roll = r.next();
      sku = roll < 0.02 ? r.pick(digits) : roll < 0.04 ? r.pick(['ab12', 'A1', 'AB--12', 'AB12 ', '', 'ABC-', 'N/A']) : plain[Math.floor(r.next() ** 2.2 * plain.length)];
      qty = r.next() < (kind === 3 ? 0.03 : 0.01) ? -r.int(1, 3) : r.int(1, 20);
      price = kind === 3 ? r.int(100, 60000) / 1000 : r.next() < 0.2 ? r.int(1200, 1900) / 1000 : 1 + (sku.length % 7) * 3.5;
    }
    rows.push({ date: `${monthText(month)}-${pad2(r.int(1, 28))}`, customer, sku, qty, unitPrice: price, region: r.pick(REGIONS) });
  }
  return rows;
}
