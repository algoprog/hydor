// Layers' blend modes, as Photoshop and the web's compositing (W3C Compositing and Blending) define them: how a layer's
// colour mixes with what is under it (Normal, Multiply, Screen, Overlay, Darken, Lighten, Colour dodge, Colour burn,
// Soft light, Hard light, Difference, Exclusion, Hue, Saturation, Colour, Luminosity), then laid over it as much as it
// covers. The picture editor in the browser lets the canvas do this (the same formulas, `op`); the server and the tests
// do it here, pixel by pixel.

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'soft-light' | 'hard-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

/** The modes in Photoshop's order, with the canvas's name for each (`op`). */
export const BLEND_MODES: { id: BlendMode; label: string; op: GlobalCompositeOperation }[] = [
  { id: 'normal', label: 'Normal', op: 'source-over' },
  { id: 'darken', label: 'Darken', op: 'darken' },
  { id: 'multiply', label: 'Multiply', op: 'multiply' },
  { id: 'color-burn', label: 'Colour burn', op: 'color-burn' },
  { id: 'lighten', label: 'Lighten', op: 'lighten' },
  { id: 'screen', label: 'Screen', op: 'screen' },
  { id: 'color-dodge', label: 'Colour dodge', op: 'color-dodge' },
  { id: 'overlay', label: 'Overlay', op: 'overlay' },
  { id: 'soft-light', label: 'Soft light', op: 'soft-light' },
  { id: 'hard-light', label: 'Hard light', op: 'hard-light' },
  { id: 'difference', label: 'Difference', op: 'difference' },
  { id: 'exclusion', label: 'Exclusion', op: 'exclusion' },
  { id: 'hue', label: 'Hue', op: 'hue' },
  { id: 'saturation', label: 'Saturation', op: 'saturation' },
  { id: 'color', label: 'Colour', op: 'color' },
  { id: 'luminosity', label: 'Luminosity', op: 'luminosity' },
];

export const isBlendMode = (v: unknown): v is BlendMode => BLEND_MODES.some((m) => m.id === v);
export const blendOp = (m: BlendMode | undefined): GlobalCompositeOperation => BLEND_MODES.find((x) => x.id === m)?.op ?? 'source-over';

/** One channel of a separable mode: what is under (`b`) and the layer (`s`), each 0 to 1. */
export function blendChannel(m: BlendMode, b: number, s: number): number {
  switch (m) {
    case 'multiply':
      return b * s;
    case 'screen':
      return b + s - b * s;
    case 'overlay':
      return blendChannel('hard-light', s, b);
    case 'darken':
      return Math.min(b, s);
    case 'lighten':
      return Math.max(b, s);
    case 'color-dodge':
      return b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s));
    case 'color-burn':
      return b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
    case 'hard-light':
      return s <= 0.5 ? b * 2 * s : blendChannel('screen', b, 2 * s - 1);
    case 'soft-light': {
      if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
      const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
      return b + (2 * s - 1) * (d - b);
    }
    case 'difference':
      return Math.abs(b - s);
    case 'exclusion':
      return b + s - 2 * b * s;
    default:
      return s;
  }
}

type RGB = [number, number, number];
const lum = (c: RGB) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
function clipColor(c: RGB): RGB {
  const l = lum(c);
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  let out: RGB = [...c];
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n)) as RGB;
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as RGB;
  return out;
}
const setLum = (c: RGB, l: number): RGB => {
  const d = l - lum(c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
};
const sat = (c: RGB) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
function setSat(c: RGB, s: number): RGB {
  const idx = [0, 1, 2].sort((a, b) => c[a] - c[b]);
  const [mn, md, mx] = idx;
  const out: RGB = [0, 0, 0];
  if (c[mx] > c[mn]) {
    out[md] = ((c[md] - c[mn]) * s) / (c[mx] - c[mn]);
    out[mx] = s;
  }
  return out;
}

/** A pixel's colour blended (each 0 to 1): what is under it (`b`) and the layer's (`s`). */
export function blendColor(m: BlendMode, b: RGB, s: RGB): RGB {
  switch (m) {
    case 'hue':
      return setLum(setSat(s, sat(b)), lum(b));
    case 'saturation':
      return setLum(setSat(b, sat(s)), lum(b));
    case 'color':
      return setLum(s, lum(b));
    case 'luminosity':
      return setLum(b, lum(s));
    default:
      return [blendChannel(m, b[0], s[0]), blendChannel(m, b[1], s[1]), blendChannel(m, b[2], s[2])];
  }
}

/**
 * A layer's pixels laid over what is under them, in place (RGBA, 0 to 255, both `w` × `h`): blended where both are
 * there, the layer's own colour where nothing is under it, as much as the layer covers (its alpha × `opacity`).
 */
export function blendPixels(under: Uint8ClampedArray, layer: Uint8ClampedArray | Uint8Array, mode: BlendMode, opacity = 1): void {
  for (let i = 0; i < under.length; i += 4) {
    const as = (layer[i + 3] / 255) * opacity;
    if (as <= 0) continue;
    const ab = under[i + 3] / 255;
    const b: RGB = [under[i] / 255, under[i + 1] / 255, under[i + 2] / 255];
    const s: RGB = [layer[i] / 255, layer[i + 1] / 255, layer[i + 2] / 255];
    const mixed = mode === 'normal' ? s : blendColor(mode, b, s);
    const ao = as + ab * (1 - as);
    for (let c = 0; c < 3; c++) {
      // W3C: the layer's colour mixed with the blend as far as there is something under it, then laid over.
      const cs = (1 - ab) * s[c] + ab * mixed[c];
      const co = (as * cs + ab * b[c] * (1 - as)) / ao;
      under[i + c] = Math.round(Math.min(1, Math.max(0, co)) * 255);
    }
    under[i + 3] = Math.round(ao * 255);
  }
}
