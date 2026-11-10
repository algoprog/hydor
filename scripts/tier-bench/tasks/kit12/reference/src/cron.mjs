const RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
const DAY = 86400000;

function parseField(src, [min, max]) {
  const values = new Set();
  for (const item of src.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(item);
    if (!m) throw new RangeError(`cannot read ${JSON.stringify(item)}`);
    const step = m[2] === undefined ? 1 : Number(m[2]);
    if (step < 1) throw new RangeError('step must be positive');
    let lo;
    let hi;
    if (m[1] === '*') [lo, hi] = [min, max];
    else if (m[1].includes('-')) [lo, hi] = m[1].split('-').map(Number);
    else if (m[2] !== undefined) throw new RangeError('a step needs * or a range');
    else lo = hi = Number(m[1]);
    if (lo < min || hi > max || lo > hi) throw new RangeError(`out of range: ${item}`);
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values;
}

export function nextRun(expression, from) {
  if (typeof expression !== 'string') throw new RangeError('expression must be a string');
  const parts = expression.split(' ').filter(Boolean);
  if (parts.length !== 5) throw new RangeError('a cron expression has five fields');
  const [minutes, hours, doms, months, dows] = parts.map((p, i) => parseField(p, RANGES[i]));
  const domRestricted = parts[2] !== '*';
  const dowRestricted = parts[4] !== '*';
  if (!(from instanceof Date)) throw new TypeError('from must be a Date');
  if (Number.isNaN(from.getTime())) throw new RangeError('from is an invalid Date');

  const start = Math.floor(from.getTime() / 60000) * 60000 + 60000;
  const limitDate = new Date(from.getTime());
  limitDate.setUTCFullYear(limitDate.getUTCFullYear() + 8);
  const limit = limitDate.getTime();

  const dayOk = (d) => {
    if (!months.has(d.getUTCMonth() + 1)) return false;
    const domOk = doms.has(d.getUTCDate());
    const dowOk = dows.has(d.getUTCDay());
    if (domRestricted && dowRestricted) return domOk || dowOk;
    if (domRestricted) return domOk;
    if (dowRestricted) return dowOk;
    return true;
  };

  const first = new Date(start);
  for (let day = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()); day <= limit; day += DAY) {
    if (!dayOk(new Date(day))) continue;
    for (let h = 0; h < 24; h++) {
      if (!hours.has(h)) continue;
      for (let min = 0; min < 60; min++) {
        const t = day + (h * 60 + min) * 60000;
        if (t >= start && minutes.has(min)) {
          if (t > limit) throw new RangeError('no match within eight years');
          return new Date(t);
        }
      }
    }
  }
  throw new RangeError('no match within eight years');
}
