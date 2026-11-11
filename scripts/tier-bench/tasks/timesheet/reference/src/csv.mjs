// The CSV that export writes and import reads: one row per entry. RFC 4180 for what goes inside a row.
import { fail } from './errors.mjs';

export const HEADER = ['id', 'project', 'start', 'end', 'minutes', 'note'];

function formatField(text) {
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// Text for a list of rows (each a list of strings), every row ended by a line feed.
export function formatCsv(rows) {
  return rows.map((row) => `${row.map(formatField).join(',')}\n`).join('');
}

// The rows in some text, each a list of strings. Rows end with a line feed or CR LF, quoted fields may hold both,
// and a line with nothing on it is not a row.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false; // inside a quoted field
  let wasQuoted = false; // the field being read began with a quote
  let i = 0;
  const endField = () => {
    row.push(field);
    field = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"' && field === '' && !wasQuoted) {
      quoted = true;
      wasQuoted = true;
    } else if (c === ',') endField();
    else if (c === '\n') endRow();
    else if (c === '\r' && text[i + 1] === '\n') {
      i++;
      endRow();
    } else if (wasQuoted) fail('CSV: text after the closing quote of a field');
    else field += c;
    i++;
  }
  if (quoted) fail('CSV: a quoted field is never closed');
  if (field !== '' || row.length > 0 || wasQuoted) endRow();
  return rows;
}
