// Amounts of money: what tracked time earns at a project's hourly rate, and how an amount is shown.

const SYMBOLS = { EUR: '€', USD: '$', GBP: '£' };

// What minutes earn at a rate in cents per hour, in whole cents: rounded to the nearest, halves up, and only once,
// in whole numbers so that nothing is lost to floating point.
export function centsFor(minutes, rateCents) {
  return Math.floor((minutes * rateCents + 30) / 60);
}

// "€1,234.56" for 123456 cents. Currencies without a symbol here show their code: "CHF 1,234.56".
export function formatCents(cents, currency) {
  const whole = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+$)/g, ',');
  const symbol = SYMBOLS[currency];
  return `${symbol ?? `${currency} `}${whole}.${String(cents % 100).padStart(2, '0')}`;
}
