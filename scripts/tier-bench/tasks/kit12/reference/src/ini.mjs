function parseValue(rest, lineNo) {
  if (rest[0] !== '"') return rest;
  let value = '';
  for (let k = 1; k < rest.length; k++) {
    const c = rest[k];
    if (c === '"') {
      if (k !== rest.length - 1) throw new SyntaxError(`line ${lineNo}: text after the closing quote`);
      return value;
    }
    if (c === '\\') {
      const next = rest[++k];
      if (next === 'n') value += '\n';
      else if (next === '"' || next === '\\') value += next;
      else throw new SyntaxError(`line ${lineNo}: bad escape`);
    } else {
      value += c;
    }
  }
  throw new SyntaxError(`line ${lineNo}: missing closing quote`);
}

export function parseIni(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const out = {};
  let section = '';
  const open = (name) => {
    if (!Object.hasOwn(out, name)) out[name] = {};
  };
  text.split('\n').forEach((raw, index) => {
    const lineNo = index + 1;
    const line = raw.trim();
    if (line === '' || line[0] === ';' || line[0] === '#') return;
    if (line[0] === '[') {
      const name = line.endsWith(']') ? line.slice(1, -1).trim() : '';
      if (!name || /[[\]]/.test(name)) throw new SyntaxError(`line ${lineNo}: bad section header`);
      section = name;
      open(section);
      return;
    }
    const eq = line.indexOf('=');
    const key = eq < 0 ? '' : line.slice(0, eq).trim();
    if (!key) throw new SyntaxError(`line ${lineNo}: not a section, a key or a comment`);
    const value = parseValue(line.slice(eq + 1).trim(), lineNo);
    open(section);
    out[section][key] = value;
  });
  return out;
}

const badKey = (k) => k === '' || /[=\n\r]/.test(k) || k !== k.trim() || /^[;#[]/.test(k);
const badSection = (s) => s === '' || /[[\]\n\r]/.test(s) || s !== s.trim();

function formatValue(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (s === '') return '';
  if (s !== s.trim() || s.includes('\n') || s[0] === '"') return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  return s;
}

export function stringifyIni(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) throw new TypeError('obj must be an object');
  const lines = [];
  const names = Object.keys(obj);
  for (const name of ['', ...names.filter((n) => n !== '')]) {
    if (!Object.hasOwn(obj, name)) continue;
    const section = obj[name];
    if (section === null || typeof section !== 'object' || Array.isArray(section)) throw new TypeError(`section ${name} must be an object`);
    if (name !== '') {
      if (badSection(name)) throw new RangeError(`bad section name: ${JSON.stringify(name)}`);
      lines.push(`[${name}]`);
    }
    for (const key of Object.keys(section)) {
      if (badKey(key)) throw new RangeError(`bad key: ${JSON.stringify(key)}`);
      const value = formatValue(section[key]);
      lines.push(value === '' ? `${key} =` : `${key} = ${value}`);
    }
  }
  return lines.length ? lines.join('\n') + '\n' : '';
}
