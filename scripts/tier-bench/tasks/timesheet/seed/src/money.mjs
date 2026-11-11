// Amounts of money: what tracked time earns at a project's hourly rate, and how an amount is shown.

const SYMBOLS = { EUR: '€', USD: '$', GBP: '£' };

// What one entry earns, in whole currency units and cents: minutes at a rate given in cents per hour.
export function entryAmount(minutes, rateCents) {
  return Number(((minutes / 60) * rateCents / 100).toFixed(2));
}

// What a project earns: the amounts of its entries added up.
export function projectAmount(entryMinutes, rateCents) {
  return entryMinutes.reduce((sum, minutes) => sum + entryAmount(minutes, rateCents), 0);
}

// "€1,234.56". Currencies without a symbol here show their code: "CHF 1,234.56".
export function formatAmount(amount, currency) {
  const [whole, cents] = amount.toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+$)/g, ',');
  const symbol = SYMBOLS[currency];
  return `${symbol ?? `${currency} `}${grouped}.${cents}`;
}
