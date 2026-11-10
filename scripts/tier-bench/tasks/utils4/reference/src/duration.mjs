const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

export function parseDuration(text) {
  if (typeof text !== 'string') throw new RangeError('duration must be a string');
  const s = text.trim();
  if (s === '') throw new RangeError('empty duration');
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const term = /\s*(\d+(?:\.\d+)?)\s*([A-Za-z]+)\s*/y;
  let total = 0;
  let pos = 0;
  while (pos < s.length) {
    term.lastIndex = pos;
    const m = term.exec(s);
    if (!m) throw new RangeError(`cannot read a duration at "${s.slice(pos)}"`);
    const unit = UNITS[m[2].toLowerCase()];
    if (unit === undefined) throw new RangeError(`unknown unit "${m[2]}"`);
    total += Number(m[1]) * unit;
    pos = term.lastIndex;
  }
  return Math.round(total);
}

export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) throw new RangeError('invalid duration');
  let rest = Math.round(ms);
  if (rest === 0) return '0ms';
  const parts = [];
  for (const [name, size] of [['d', 86400000], ['h', 3600000], ['m', 60000], ['s', 1000], ['ms', 1]]) {
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n > 0) parts.push(`${n}${name}`);
  }
  return parts.join(' ');
}
