// Makes sales rows like ours, as JSON lines on stdout: node scripts/make-data.mjs [rows] [seed] > file.jsonl
// The same arguments always give the same file. Rows come in date order, over 12 to 18 months.

const count = Number(process.argv[2] ?? 2000);
const seed = Number(process.argv[3] ?? 7);

// A small seeded random number generator (mulberry32).
function prng(s) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = prng(seed);
const int = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
const pick = (list) => list[Math.floor(random() * list.length)];
// Favours the start of a list, the way a few customers and products make most of the sales.
const pickSkewed = (list) => list[Math.floor(random() ** 2.2 * list.length)];

const FIRST = ['Alice', 'Bruno', 'Chloé', 'David', 'Elena', 'Farid', 'Greta', 'Hugo', 'Ines', 'Jonas', 'Katya', 'Liam', 'Maya', 'Noah', 'Olga', 'Pablo', 'Quentin', 'Rosa', 'Sven', 'Tariq'];
const LAST = ['Andersson', 'Bernard', 'Carvalho', 'Dubois', 'Eriksen', 'Fontaine', 'Garcia', 'Hansen', 'Ivanov', 'Jensen', 'Kowalski', 'Larsen', 'Moreau', 'Nielsen', 'Olsen', 'Petit', 'Quinn', 'Rossi', 'Schmidt', 'Tanaka'];
const SPECIAL = ['Émile Roux', 'emile roux', 'Emile Roux', 'Zoë Lee', 'Zoe Lee', 'Åsa Berg', 'Asa Berg', 'Ölund AB', 'Olund AB', "O'Brien & Sons", 'OBrien and Sons', 'McDonald Ltd', 'mcdonald ltd'];

const customers = [...SPECIAL];
for (let i = 0; customers.length < 4000; i++) {
  const suffix = i % 7 === 0 ? ` ${['AB', 'GmbH', 'SARL', 'Ltd'][i % 4]}` : '';
  customers.push(`${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}${suffix}${i >= 400 ? ` ${Math.floor(i / 400)}` : ''}`);
}
// Mix the order, so the first names in the list are not always the biggest customers.
for (let i = customers.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [customers[i], customers[j]] = [customers[j], customers[i]];
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const word = (n) => Array.from({ length: n }, () => LETTERS[int(0, 25)]).join('');
const validSkus = [];
for (let i = 0; i < 600; i++) {
  const hyphen = random() < 0.3 ? `-${word(int(1, 3))}` : '';
  validSkus.push(`${word(int(2, 5))}${hyphen}${random() < 0.5 ? '-' : ''}${int(10, 9999)}`);
}
// SKUs from the old system are all digits, or are not SKUs at all.
const legacySkus = ['10442', '7', '300', '12', '88120', '00123', '4521', '9'];
const invalidSkus = ['ab12', 'A1', 'AB--12', 'AB12 ', 'N/A', '', 'ABC-', 'X-1'];
const basePrice = new Map(validSkus.map((sku) => [sku, int(500, 60000) / 1000]));

const REGIONS = ['North', 'South', 'East', 'West', 'Île-de-France', 'Åland', 'Zürich', 'Örebro'];
const months = int(12, 18);

function skuAndPrice(i) {
  // Now and then a very long invalid SKU shows up in the big files (the old system pads codes).
  if (i % 20000 === 19999) {
    const long = word(int(30, 34)) + '-';
    return [long, int(500, 60000) / 1000];
  }
  const roll = random();
  if (roll < 0.015) return [pick(legacySkus), int(100, 9000) / 1000];
  if (roll < 0.03) return [pick(invalidSkus), int(100, 9000) / 1000];
  const sku = pickSkewed(validSkus);
  // Some products are priced per litre, to three decimals.
  const price = random() < 0.2 ? int(1200, 1900) / 1000 : basePrice.get(sku);
  return [sku, price];
}

const out = [];
for (let i = 0; i < count; i++) {
  const month = Math.floor((i / count) * months);
  const year = 2024 + Math.floor(month / 12);
  const date = `${year}-${String((month % 12) + 1).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;
  const [sku, unitPrice] = skuAndPrice(i);
  const qty = random() < 0.01 ? -int(1, 3) : int(1, 20);
  out.push(JSON.stringify({ date, customer: pickSkewed(customers), sku, qty, unitPrice, region: pick(REGIONS) }));
}
process.stdout.write(out.join('\n') + '\n');
