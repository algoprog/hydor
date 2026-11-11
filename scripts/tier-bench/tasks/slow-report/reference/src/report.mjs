// The sales report. A row is { date: 'YYYY-MM-DD', customer, sku, qty, unitPrice, region }.
// buildReport(rows) returns the whole report as one string: six sections, each a heading line and its lines.
//
// One pass over the rows builds every total in Maps. A Map keeps its keys in the order they were first added, which
// is the order of first appearance in the data that the report's ties rely on (a plain object would put keys that
// are whole numbers, such as the old system's SKUs "10442" and "7", first). Every sum adds in row order, as before,
// because floating-point sums change with the order of the additions.

// The same texts as /^([A-Z]+-?)+[0-9]{2,}$/ accepts: capital letters in runs, a run may be followed by one hyphen,
// then at least two digits. Written without nested repetition, so it cannot backtrack catastrophically.
const SKU_PATTERN = /^[A-Z]+(?:-[A-Z]+)*-?[0-9]{2,}$/;

const collator = new Intl.Collator('en');
const byName = (a, b) => collator.compare(a, b);

const money = (n) => n.toFixed(2);

function section(heading, lines) {
  return [heading, ...lines].join('\n');
}

function add(map, key, amount) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function buildReport(rows) {
  const customerRevenue = new Map();
  const customerMonths = new Map(); // customer -> Set of months
  const months = new Map(); // month -> { count, revenue }
  const skuUnits = new Map();
  const orders = new Map(); // region -> every order's value
  const invalid = { rows: 0, firstFive: [], seen: new Set() };

  for (const row of rows) {
    const revenue = row.qty * row.unitPrice;
    const month = row.date.slice(0, 7);

    add(customerRevenue, row.customer, revenue);

    let seenMonths = customerMonths.get(row.customer);
    if (!seenMonths) customerMonths.set(row.customer, (seenMonths = new Set()));
    seenMonths.add(month);

    let m = months.get(month);
    if (!m) months.set(month, (m = { count: 0, revenue: 0 }));
    m.count++;
    m.revenue += revenue;

    add(skuUnits, row.sku, row.qty);

    let list = orders.get(row.region);
    if (!list) orders.set(row.region, (list = []));
    list.push(revenue);

    if (!SKU_PATTERN.test(row.sku)) {
      invalid.rows++;
      if (invalid.firstFive.length < 5 && !invalid.seen.has(row.sku)) {
        invalid.seen.add(row.sku);
        invalid.firstFive.push(row.sku);
      }
    }
  }

  // Array.prototype.sort is stable, so ties the comparison cannot tell apart stay in order of first appearance.
  const customers = [...customerRevenue].sort((a, b) => b[1] - a[1] || byName(a[0], b[0]));
  const customerLines = customers.map(([name, revenue]) => name.padEnd(32) + money(revenue).padStart(14));

  const monthLines = [...months.keys()].sort().map((month) => {
    const { count, revenue } = months.get(month);
    return `${month}  ${String(count).padStart(7)}  ${money(revenue).padStart(14)}`;
  });

  const topSkus = [...skuUnits].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const skuLines = topSkus.map(([sku, units]) => sku.padEnd(34) + String(units).padStart(10));

  const invalidLines = [`Rows with an invalid SKU: ${invalid.rows}`, ...invalid.firstFive.map((sku) => `  ${JSON.stringify(sku)}`)];

  const regionLines = [...orders.keys()].sort(byName).map((region) => {
    const values = orders.get(region).sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    const median = values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    return region.padEnd(16) + money(median).padStart(12);
  });

  const activeLines = [...customerMonths]
    .filter(([, seen]) => seen.size === months.size)
    .map(([name]) => name)
    .sort(byName)
    .map((name) => `  ${name}`);

  return (
    [
      section('Revenue by customer', customerLines),
      section('Revenue by month', monthLines),
      section('Top SKUs by quantity', skuLines),
      section('Invalid SKUs', invalidLines),
      section('Median order by region', regionLines),
      section('Customers active every month', activeLines),
    ].join('\n\n') + '\n'
  );
}
