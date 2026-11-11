// The definition itself: try every arrangement of the heights 1..N and count those whose visible counts are C_1 .. C_{N-1}.
// Only for small N (about 10 or less). solve(input) is as in the task; visible(H, x) is the count from position x + 0.5.
const MOD = 998244353;

// The buildings visible from position x + 0.5 (x from 1 to N - 1): those to the left and those to the right that no
// taller building hides, found by walking away from the position and counting each new tallest.
export function visible(H, x) {
  let count = 0;
  let tallest = 0;
  for (let i = x; i >= 1; i--) {
    if (H[i] > tallest) {
      tallest = H[i];
      count++;
    }
  }
  tallest = 0;
  for (let i = x + 1; i < H.length; i++) {
    if (H[i] > tallest) {
      tallest = H[i];
      count++;
    }
  }
  return count;
}

export function solve(input) {
  const tokens = input.split(/\s+/).filter(Boolean).map(Number);
  const N = tokens[0];
  const C = [0, ...tokens.slice(1, N)];
  // H is 1-based: H[1..N]. Every arrangement is visited by choosing the height of position 1, then 2, and so on.
  const H = new Array(N + 1).fill(0);
  const used = new Array(N + 1).fill(false);
  let count = 0;
  const place = (pos) => {
    if (pos > N) {
      for (let x = 1; x < N; x++) if (visible(H, x) !== C[x]) return;
      count++;
      return;
    }
    for (let h = 1; h <= N; h++) {
      if (used[h]) continue;
      used[h] = true;
      H[pos] = h;
      place(pos + 1);
      used[h] = false;
    }
  };
  place(1);
  return `${count % MOD}\n`;
}
