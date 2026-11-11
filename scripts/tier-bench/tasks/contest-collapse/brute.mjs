// The most direct method, for small inputs: try every sequence of length N over 1..K, do the operation as the statement
// says until all elements are equal, and add up the number of operations. It takes about K^N times N steps.
export function score(S) {
  let steps = 0;
  while (S.some((v) => v !== S[0])) {
    // Element i (counting from the second) goes when it differs from the element before it in the sequence as it is now.
    S = S.filter((v, i) => i === 0 || S[i - 1] === v);
    steps++;
  }
  return steps;
}

/** The sum of the scores of all K^N sequences, modulo 998244353, as a string. */
export function bruteSolve(N, K) {
  const S = new Array(N).fill(1);
  let total = 0;
  for (;;) {
    total += score(S);
    let i = N - 1;
    while (i >= 0 && S[i] === K) S[i--] = 1;
    if (i < 0) break;
    S[i]++;
  }
  return String(total % 998244353);
}

export function solve(input) {
  const [N, K] = input.trim().split(/\s+/).map(Number);
  return bruteSolve(N, K) + '\n';
}
