// Solves every test case of the input and returns the Yes/No lines.
//
// Method: an interval that contains another one forces every position outside the inner one to be 0, and then adds
// nothing, so it is dropped (and those positions are banned). The intervals left have both ends increasing. A position
// that can still hold a 1 lies in a consecutive run of them, u..v, and putting a 1 there adds 1 to the sum of each of
// those. Seen as an edge from u to v + 1 in a graph on the gaps between the intervals, every interval has sum 2
// exactly when two edge-disjoint paths run from the first node to the last one, so two augmenting paths of a
// unit-capacity flow decide the answer.

const MAXN = 500005;
const maxLbyR = new Int32Array(MAXN); // the largest left end among intervals ending at r
const minLbyR = new Int32Array(MAXN); // the smallest left end among intervals ending at r
const maxRbyL = new Int32Array(MAXN); // the largest right end among intervals starting at l
const minRbyL = new Int32Array(MAXN); // the smallest right end among intervals starting at l
const sufMinL = new Int32Array(MAXN); // the smallest left end among intervals ending at r or later
const prefMaxR = new Int32Array(MAXN); // the largest right end among intervals starting at l or earlier
const minRightAfter = new Int32Array(MAXN);
const keptL = new Int32Array(MAXN);
const keptR = new Int32Array(MAXN);
const edgeTo = new Int32Array(2 * MAXN);
const edgeCap = new Int8Array(2 * MAXN);
const edgeNext = new Int32Array(2 * MAXN);
const head = new Int32Array(MAXN);
const viaEdge = new Int32Array(MAXN);
const queue = new Int32Array(MAXN);

export function solve(input) {
  let pos = 0;
  const nextInt = () => {
    let c = input.charCodeAt(pos);
    while (c < 48 || c > 57) c = input.charCodeAt(++pos);
    let v = 0;
    while (c >= 48 && c <= 57) {
      v = v * 10 + (c - 48);
      c = input.charCodeAt(++pos);
    }
    return v;
  };
  const t = nextInt();
  const out = new Array(t);
  for (let tc = 0; tc < t; tc++) {
    const n = nextInt();
    const m = nextInt();
    for (let i = 0; i <= n + 1; i++) {
      maxLbyR[i] = 0;
      minLbyR[i] = n + 1;
      maxRbyL[i] = 0;
      minRbyL[i] = n + 1;
    }
    for (let i = 0; i < m; i++) {
      const l = nextInt();
      const r = nextInt();
      if (l > maxLbyR[r]) maxLbyR[r] = l;
      if (l < minLbyR[r]) minLbyR[r] = l;
      if (r > maxRbyL[l]) maxRbyL[l] = r;
      if (r < minRbyL[l]) minRbyL[l] = r;
    }
    out[tc] = decide(n) ? 'Yes' : 'No';
  }
  return out.join('\n') + '\n';
}

function decide(n) {
  sufMinL[n + 1] = n + 1;
  for (let x = n; x >= 1; x--) sufMinL[x] = Math.min(sufMinL[x + 1], minLbyR[x]);
  prefMaxR[0] = 0;
  for (let x = 1; x <= n; x++) prefMaxR[x] = Math.max(prefMaxR[x - 1], maxRbyL[x]);

  // Keep the intervals that contain no other one. For each left end only the shortest interval can stay, and going
  // from the right, an interval stays when every interval starting after it ends after it does.
  let k = 0;
  let lowestEnd = n + 1;
  for (let l = n; l >= 1; l--) {
    const r = minRbyL[l];
    if (r > n) continue;
    if (r < lowestEnd) {
      keptL[k] = l;
      keptR[k] = r;
      k++;
      lowestEnd = r;
    }
  }
  // The kept intervals are in decreasing order; put them in increasing order.
  for (let i = 0, j = k - 1; i < j; i++, j--) {
    const a = keptL[i];
    keptL[i] = keptL[j];
    keptL[j] = a;
    const b = keptR[i];
    keptR[i] = keptR[j];
    keptR[j] = b;
  }

  // Edges: for each position p that is not banned and lies in some kept interval, an edge u -> v where u is the first
  // kept interval ending at p or later, and v - 1 the last one starting at p or earlier.
  for (let i = 0; i <= k; i++) head[i] = -1;
  let edges = 0;
  const addEdge = (a, b) => {
    edgeTo[edges] = b;
    edgeCap[edges] = 1;
    edgeNext[edges] = head[a];
    head[a] = edges++;
    edgeTo[edges] = a;
    edgeCap[edges] = 0;
    edgeNext[edges] = head[b];
    head[b] = edges++;
  };
  // minRightAfter[p]: the smallest right end among intervals whose left end is after p (n + 1 when none).
  minRightAfter[n] = n + 1;
  for (let p = n - 1; p >= 1; p--) minRightAfter[p] = Math.min(minRightAfter[p + 1], minRbyL[p + 1]);
  let maxLeft = 0; // the largest left end among intervals ending before p
  let u = 0;
  let v = 0;
  for (let p = 1; p <= n; p++) {
    if (p >= 2 && maxLbyR[p - 1] > maxLeft) maxLeft = maxLbyR[p - 1];
    // A position is banned when an interval holds it together with a whole other interval on one side of it.
    if (maxLeft >= 1 && prefMaxR[maxLeft] >= p) continue;
    const mr = minRightAfter[p];
    if (mr <= n && sufMinL[mr] <= p) continue;
    while (u < k && keptR[u] < p) u++;
    while (v < k && keptL[v] <= p) v++;
    if (u < v) addEdge(u, v);
  }

  for (let round = 0; round < 2; round++) if (!augment(k)) return false;
  return true;
}

// One breadth-first search for a path from node 0 to node k through edges with capacity left; uses it up.
function augment(k) {
  for (let i = 0; i <= k; i++) viaEdge[i] = -2;
  viaEdge[0] = -1;
  let qh = 0;
  let qt = 0;
  queue[qt++] = 0;
  while (qh < qt && viaEdge[k] === -2) {
    const a = queue[qh++];
    for (let e = head[a]; e !== -1; e = edgeNext[e]) {
      const b = edgeTo[e];
      if (edgeCap[e] > 0 && viaEdge[b] === -2) {
        viaEdge[b] = e;
        queue[qt++] = b;
      }
    }
  }
  if (viaEdge[k] === -2) return false;
  for (let b = k; b !== 0; ) {
    const e = viaEdge[b];
    edgeCap[e]--;
    edgeCap[e ^ 1]++;
    b = edgeTo[e ^ 1];
  }
  return true;
}
