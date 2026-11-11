// The direct method, for small inputs: follow the operations themselves. Start from the given sequence, and for each
// k keep the set of every distinct sequence that k operations can give (each one is made from the set before by one
// more operation); the answer for k is the size of that set.
export function solve(input) {
  const tokens = input.split(/\s+/).filter(Boolean).map(Number);
  const n = tokens[0];
  const k = tokens[1];
  const x = [...tokens.slice(2, 2 + n), 0];
  let level = new Set([x.join(',')]);
  const answers = [];
  for (let step = 1; step <= k; step++) {
    const next = new Set();
    for (const key of level) {
      const seq = key.split(',').map(Number);
      for (let i = 0; i < n; i++) {
        if (seq[i] < 1) continue;
        seq[i] -= 1;
        seq[i + 1] += 2;
        next.add(seq.join(','));
        seq[i] += 1;
        seq[i + 1] -= 2;
      }
    }
    level = next;
    answers.push(level.size);
  }
  return answers.join(' ') + '\n';
}
