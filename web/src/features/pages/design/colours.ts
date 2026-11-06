// A picture's colours, read on this device (nothing is sent anywhere): for a brand kit and a design's new colours.

/** The colours of a picture: a few, the most present first, read here (nothing is sent anywhere). */
export async function coloursOf(src: string, k = 6): Promise<string[]> {
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => fail(new Error('That picture could not be read'));
    i.src = src;
  });
  const c = document.createElement('canvas');
  const s = Math.min(1, 96 / Math.max(img.naturalWidth, img.naturalHeight));
  c.width = Math.max(1, Math.round(img.naturalWidth * s));
  c.height = Math.max(1, Math.round(img.naturalHeight * s));
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const px: number[][] = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
  if (!px.length) return [];
  // k-means, from spread-out starting points.
  let cs = Array.from({ length: k }, (_, j) => px[Math.floor(((j + 0.5) / k) * px.length)]);
  let counts = cs.map(() => 0);
  for (let it = 0; it < 12; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      let best = 0;
      let bd = Infinity;
      cs.forEach((q, j) => {
        const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (dd < bd) {
          bd = dd;
          best = j;
        }
      });
      sum[best][0] += p[0];
      sum[best][1] += p[1];
      sum[best][2] += p[2];
      sum[best][3]++;
    }
    cs = sum.map((s2, j) => (s2[3] ? [s2[0] / s2[3], s2[1] / s2[3], s2[2] / s2[3]] : cs[j]));
    counts = sum.map((s2) => s2[3]);
  }
  const hex = (p: number[]) => `#${p.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const out = cs.map((p, j) => ({ c: hex(p), n: counts[j] })).sort((a, b) => b.n - a.n);
  // Colours nearly alike count once.
  const kept: string[] = [];
  for (const o of out) {
    const [r, g2, b] = [1, 3, 5].map((i) => parseInt(o.c.slice(i, i + 2), 16));
    if (kept.every((x) => {
      const [r2, g3, b2] = [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
      return Math.abs(r - r2) + Math.abs(g2 - g3) + Math.abs(b - b2) > 48;
    }))
      kept.push(o.c);
  }
  return kept;
}
