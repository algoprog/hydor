// Reads the input and answers every query.
//
// A string T can be written exactly when, for every two positions i <= j, some starting string has the same two
// characters as T there. The table below records, for every pair of positions, which of the four combinations of
// characters the starting strings show; a query then looks up its own combination at every pair.
export function solve(input) {
  const tokens = input.split(/\s+/).filter(Boolean);
  const n = Number(tokens[0]);
  const m = Number(tokens[1]);
  const q = Number(tokens[2]);
  const starts = tokens.slice(3, 3 + n);
  const queries = tokens.slice(3 + n, 3 + n + q);

  // seen[i * m + j] has bit (2 * a + b) set when some starting string has character a at i and b at j (i <= j).
  const seen = new Uint8Array(m * m);
  const bits = new Uint8Array(m);
  for (const s of starts) {
    for (let i = 0; i < m; i++) bits[i] = s.charCodeAt(i) - 48;
    for (let i = 0; i < m; i++) {
      const row = i * m;
      const a2 = bits[i] * 2;
      for (let j = i; j < m; j++) seen[row + j] |= 1 << (a2 + bits[j]);
    }
  }

  const answers = [];
  for (const t of queries) {
    for (let i = 0; i < m; i++) bits[i] = t.charCodeAt(i) - 48;
    let ok = true;
    for (let i = 0; i < m && ok; i++) {
      const row = i * m;
      const a2 = bits[i] * 2;
      for (let j = i; j < m; j++) {
        if (((seen[row + j] >> (a2 + bits[j])) & 1) === 0) {
          ok = false;
          break;
        }
      }
    }
    answers.push(ok ? 'Yes' : 'No');
  }
  return answers.join('\n') + '\n';
}
