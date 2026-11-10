export function parseCsv(text, { delimiter = ',' } = {}) {
  const n = text.length;
  if (n === 0) return [];
  const rows = [];
  let row = [];
  let i = 0;
  for (;;) {
    let field = '';
    if (text[i] === '"') {
      i++;
      for (;;) {
        if (i >= n) throw new SyntaxError('quote left open');
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else field += text[i++];
      }
      const c = text[i];
      const atBreak = c === '\n' || (c === '\r' && text[i + 1] === '\n');
      if (i < n && c !== delimiter && !atBreak) throw new SyntaxError(`unexpected character after quote at ${i}`);
    } else {
      while (i < n && text[i] !== delimiter && text[i] !== '\n' && !(text[i] === '\r' && text[i + 1] === '\n')) field += text[i++];
    }
    row.push(field);
    if (i >= n) {
      rows.push(row);
      return rows;
    }
    if (text[i] === delimiter) {
      i++;
      continue;
    }
    i += text[i] === '\r' ? 2 : 1;
    rows.push(row);
    row = [];
    if (i >= n) return rows;
  }
}

export function toCsv(rows, { delimiter = ',' } = {}) {
  const field = (value) => {
    const s = value == null ? '' : String(value);
    return s.includes(delimiter) || /["\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return rows.map((row) => row.map(field).join(delimiter)).join('\r\n');
}
