const esc = (s) => s.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
const escClassChar = (c) => (/[\\\]\[^]/.test(c) ? '\\' + c : c);

export function globToRegExp(pattern) {
  if (typeof pattern !== 'string') throw new TypeError('pattern must be a string');
  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      let n = 1;
      while (pattern[i + n] === '*') n++;
      if (n === 1) {
        re += '[^/]*';
        i += 1;
      } else if (pattern[i + n] === '/') {
        re += '(?:[^]*/)?';
        i += n + 1;
      } else {
        re += '[^]*';
        i += n;
      }
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else if (c === '[') {
      const negated = pattern[i + 1] === '!';
      const start = i + (negated ? 2 : 1);
      const close = pattern.indexOf(']', start);
      if (close > start) {
        const body = pattern.slice(start, close);
        const cls = [...body].map((ch, k) => (ch === '-' ? (k > 0 && k < body.length - 1 ? '-' : '\\-') : escClassChar(ch))).join('');
        re += negated ? `[^${cls}/]` : `[${cls}]`;
        i = close + 1;
      } else {
        re += '\\[';
        i += 1;
      }
    } else if (c === '{') {
      const close = pattern.indexOf('}', i + 1);
      if (close < 0) {
        re += '\\{';
        i += 1;
      } else {
        re += '(?:' + pattern.slice(i + 1, close).split(',').map(esc).join('|') + ')';
        i = close + 1;
      }
    } else {
      re += esc(c);
      i += 1;
    }
  }
  return new RegExp(`^${re}$`);
}

export function matches(pattern, path) {
  if (typeof path !== 'string') throw new TypeError('path must be a string');
  return globToRegExp(pattern).test(path);
}
