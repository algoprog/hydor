const VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const isNumeric = (id) => /^\d+$/.test(id);

export function parse(text) {
  if (typeof text !== 'string') throw new RangeError('version must be a string');
  const m = VERSION.exec(text);
  if (!m) throw new RangeError(`not a version: ${JSON.stringify(text)}`);
  const prerelease = m[4] === undefined ? [] : m[4].split('.');
  for (const id of prerelease) if (isNumeric(id) && id.length > 1 && id[0] === '0') throw new RangeError(`leading zero in ${id}`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease };
}

function compareIds(a, b) {
  const an = isNumeric(a);
  const bn = isNumeric(b);
  if (an && bn) {
    if (a.length !== b.length) return a.length < b.length ? -1 : 1;
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (an) return -1;
  if (bn) return 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

function cmp(x, y) {
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  const pa = x.prerelease;
  const pb = y.prerelease;
  if (!pa.length && !pb.length) return 0;
  if (!pa.length) return 1;
  if (!pb.length) return -1;
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const c = compareIds(pa[i], pb[i]);
    if (c) return c;
  }
  return pa.length === pb.length ? 0 : pa.length < pb.length ? -1 : 1;
}

export function compare(a, b) {
  return cmp(parse(a), parse(b));
}

const release = (major, minor, patch) => ({ major, minor, patch, prerelease: [] });

function holds(op, c, v) {
  switch (op) {
    case '':
      return cmp(v, c) === 0;
    case '>=':
      return cmp(v, c) >= 0;
    case '<':
      return cmp(v, c) < 0;
    case '~':
      return cmp(v, c) >= 0 && cmp(v, release(c.major, c.minor + 1, 0)) < 0;
    default: {
      const upper = c.major > 0 ? release(c.major + 1, 0, 0) : c.minor > 0 ? release(0, c.minor + 1, 0) : release(0, 0, c.patch + 1);
      return cmp(v, c) >= 0 && cmp(v, upper) < 0;
    }
  }
}

export function satisfies(version, range) {
  const v = parse(version);
  if (typeof range !== 'string') throw new RangeError('range must be a string');
  const tokens = range.split(' ').filter(Boolean);
  if (!tokens.length) throw new RangeError('empty range');
  const comparators = tokens.map((t) => {
    const m = /^(>=|<|\^|~)?([^]*)$/.exec(t);
    return { op: m[1] ?? '', version: parse(m[2]) };
  });
  if (!comparators.every((c) => holds(c.op, c.version, v))) return false;
  if (v.prerelease.length) {
    return comparators.some((c) => c.version.prerelease.length && c.version.major === v.major && c.version.minor === v.minor && c.version.patch === v.patch);
  }
  return true;
}
