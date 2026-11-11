// The definition itself, for small inputs: write every string the operation can make until nothing new appears, then
// look each query up. The new string D is forced, since each of its characters must equal at least two of the three
// characters above it, which is the majority of them. So the operation is D = (A & B) | (A & C) | (B & C) on the
// strings read as binary numbers. Strings of up to 30 characters are kept as numbers and longer ones as BigInts, but
// the number of strings made grows as fast as 2^M, so this is only for small M.
export function bruteSolve(input) {
  const tokens = input.split(/\s+/).filter(Boolean);
  const n = Number(tokens[0]);
  const m = Number(tokens[1]);
  const q = Number(tokens[2]);
  const big = m > 30;
  const parse = (s) => (big ? BigInt('0b' + s) : parseInt(s, 2));
  const starts = tokens.slice(3, 3 + n).map(parse);
  const queries = tokens.slice(3 + n, 3 + n + q).map(parse);

  const known = new Set(starts);
  const list = [...known];
  // A triple is combined when its newest member is reached, so each triple is tried once.
  for (let t = 0; t < list.length; t++) {
    const c = list[t];
    for (let a = 0; a <= t; a++) {
      const x = list[a];
      for (let b = 0; b <= a; b++) {
        const y = list[b];
        const d = (c & x) | (c & y) | (x & y);
        if (!known.has(d)) {
          known.add(d);
          list.push(d);
        }
      }
    }
  }
  return queries.map((t) => (known.has(t) ? 'Yes' : 'No')).join('\n') + '\n';
}

// As a program: node brute.mjs < input
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const { readFileSync } = await import('node:fs');
  process.stdout.write(bruteSolve(readFileSync(0, 'utf8')));
}
