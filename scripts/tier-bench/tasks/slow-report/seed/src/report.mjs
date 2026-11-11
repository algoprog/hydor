// The sales report. A row is { date: 'YYYY-MM-DD', customer, sku, qty, unitPrice, region }.
// buildReport(rows) returns the whole report as one string: six sections, each a heading line and its lines.

const SKU_PATTERN = /^([A-Z]+-?)+[0-9]{2,}$/;

function isValidSku(sku) {
  return SKU_PATTERN.test(sku);
}

function revenueOf(row) {
  return row.qty * row.unitPrice;
}

function monthOf(row) {
  return row.date.slice(0, 7);
}

function sum(numbers) {
  let total = 0;
  for (const n of numbers) total += n;
  return total;
}

function money(n) {
  return n.toFixed(2);
}

function distinct(values) {
  const seen = [];
  for (const v of values) {
    if (!seen.includes(v)) seen.push(v);
  }
  return seen;
}

function section(heading, lines) {
  return [heading, ...lines].join('\n');
}

function customerSection(rows) {
  const names = distinct(rows.map((r) => r.customer));
  const totals = names.map((name) => ({
    name,
    revenue: sum(rows.filter((r) => r.customer === name).map(revenueOf)),
  }));
  totals.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'en'));
  return section(
    'Revenue by customer',
    totals.map((t) => t.name.padEnd(32) + money(t.revenue).padStart(14)),
  );
}

function monthSection(rows) {
  const months = distinct(rows.map(monthOf)).sort();
  const lines = [];
  for (const month of months) {
    const inMonth = rows.filter((r) => monthOf(r) === month);
    lines.push(`${month}  ${String(inMonth.length).padStart(7)}  ${money(sum(inMonth.map(revenueOf))).padStart(14)}`);
  }
  return section('Revenue by month', lines);
}

function skuSection(rows) {
  const skus = distinct(rows.map((r) => r.sku));
  const units = skus.map((sku) => ({
    sku,
    units: sum(rows.filter((r) => r.sku === sku).map((r) => r.qty)),
  }));
  units.sort((a, b) => b.units - a.units);
  return section(
    'Top SKUs by quantity',
    units.slice(0, 10).map((u) => u.sku.padEnd(34) + String(u.units).padStart(10)),
  );
}

function invalidSection(rows) {
  const invalidRows = rows.filter((r) => !isValidSku(r.sku));
  const firstFive = distinct(invalidRows.map((r) => r.sku)).slice(0, 5);
  return section('Invalid SKUs', [
    `Rows with an invalid SKU: ${invalidRows.length}`,
    ...firstFive.map((sku) => `  ${JSON.stringify(sku)}`),
  ]);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function regionSection(rows) {
  const regions = distinct(rows.map((r) => r.region)).sort((a, b) => a.localeCompare(b, 'en'));
  const lines = regions.map((region) => {
    const orders = rows.filter((r) => r.region === region).map(revenueOf);
    return region.padEnd(16) + money(median(orders)).padStart(12);
  });
  return section('Median order by region', lines);
}

function activeSection(rows) {
  const months = distinct(rows.map(monthOf));
  const names = distinct(rows.map((r) => r.customer));
  const active = names.filter((name) =>
    months.every((month) => rows.some((r) => r.customer === name && monthOf(r) === month)),
  );
  active.sort((a, b) => a.localeCompare(b, 'en'));
  return section('Customers active every month', active.map((name) => `  ${name}`));
}

export function buildReport(rows) {
  const sections = [
    customerSection(rows),
    monthSection(rows),
    skuSection(rows),
    invalidSection(rows),
    regionSection(rows),
    activeSection(rows),
  ];
  return sections.join('\n\n') + '\n';
}
