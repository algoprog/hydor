// Checking what people send. The pages and the /api addresses both come through here.
export class Refusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const refuse = (status, message) => {
  throw new Refusal(status, message);
};

export function text(value, label, { required = false, max = 200, lines = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') refuse(400, `${label} must be text.`);
  let clean = value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
  if (!lines) clean = clean.replace(/\s*\n\s*/g, ' ');
  if (required && !clean) refuse(400, `${label} is needed.`);
  if (clean.length > max) refuse(400, `${label} is too long (the most is ${max} characters).`);
  return clean;
}

export function day(value, label) {
  const clean = text(value, label, { required: true, max: 20 });
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (parts) {
    const [, y, m, d] = parts.map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (y >= 1900 && y <= 2200 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) return clean;
  }
  refuse(400, `${label} must be a real date, written like 2027-03-31.`);
}

export function yesNo(value, label) {
  if ([true, 1, 'true', 'yes', 'on', '1'].includes(value)) return true;
  if ([false, 0, 'false', 'no', 'off', '0'].includes(value)) return false;
  refuse(400, `${label} must be yes or no.`);
}

export function email(value) {
  const clean = text(value, 'Email', { required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(clean)) refuse(400, 'That does not look like an email address.');
  return clean;
}

export function role(value) {
  const clean = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (clean !== 'lead' && clean !== 'member') refuse(400, 'Choose a role: lead or member.');
  return clean;
}

// A row's number as it comes from an address or a form. Null when it is not one.
export function id(value) {
  const written = typeof value === 'number' ? String(value) : value;
  return typeof written === 'string' && /^[1-9]\d{0,14}$/.test(written) ? Number(written) : null;
}
