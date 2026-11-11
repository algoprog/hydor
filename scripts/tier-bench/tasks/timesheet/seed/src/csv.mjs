// The CSV that export writes and import reads: one row per entry.

export const HEADER = ['id', 'project', 'start', 'end', 'minutes', 'note'];

// Text for a list of rows (each a list of strings), every row ended by a line feed.
export function formatCsv(rows) {
  return rows.map((row) => `${row.join(',')}\n`).join('');
}

// The rows in some text, each a list of strings.
export function parseCsv(text) {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split(','));
}
