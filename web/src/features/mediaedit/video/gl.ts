// A clip or an overlay drawn as the edit will make it, in WebGL 2: the part of its frame that shows (turned, mirrored,
// cropped, zoomed: an affine map from the canvas to the frame), denoised and sharpened as ffmpeg's hqdn3d and unsharp
// (5×5) do, coloured by the same 3D table the server writes for ffmpeg's lut3d (shared/video-grade.ts), sampled the
// same way (trilinear), its vignette as ffmpeg's vignette computes it, its grain, and for an overlay the colour keyed
// out as ffmpeg's colorkey does. A line can split it into before (left) and after (right). Without WebGL 2, a 2D canvas
// does what the browser's filters can (brightness, contrast, saturation).
import { gradeHasColour, gradeLut, grainStrength, LUT_SIZE, sharpenAmount, vignetteAngle, type VideoGrade } from '@shared/video-grade';

/** How the canvas maps onto the source: canvas (u, v) in 0–1 to the source's (s, t) in 0–1: s = a·u + c·v + e, t = b·u + d·v + f. */
export type UvMap = [number, number, number, number, number, number];

export interface DrawOptions {
  grade?: VideoGrade;
  /** A colour taken out (an overlay's green screen). */
  key?: { color: string; similarity: number; blend: number };
  /** Where before turns into after, 0–1 across (none: all after). */
  split?: number;
  /** For the grain: a new pattern each frame. */
  time?: number;
}

const VS = `#version 300 es
in vec2 p;
out vec2 v;
void main() { v = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 v;
out vec4 o;
uniform sampler2D src;
uniform sampler3D lut;
uniform bool useLut;
uniform vec2 texel;
uniform vec2 outSize;
uniform mat3 uvm;
uniform float sharpen, denoise, vignette, grain, time, split;
uniform bool keyed;
uniform vec3 keyc;
uniform float keySim, keyBlend;
float hash(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = (uvm * vec3(v, 1.0)).xy;
  vec4 c0 = texture(src, uv);
  vec3 c = c0.rgb;
  bool after = v.x >= split;
  if (after && (sharpen > 0.0 || denoise > 0.0)) {
    vec3 sum = vec3(0.0);
    for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++) sum += texture(src, uv + vec2(float(dx), float(dy)) * texel).rgb;
    vec3 blur = sum / 25.0;
    if (denoise > 0.0) c = mix(c, blur, denoise);
    if (sharpen > 0.0) c = c + (c - blur) * sharpen;
  }
  if (after && useLut) c = texture(lut, clamp(c, 0.0, 1.0) * (${LUT_SIZE - 1}.0 / ${LUT_SIZE}.0) + 0.5 / ${LUT_SIZE}.0).rgb;
  if (after && vignette > 0.0) {
    vec2 d = (v - 0.5) * outSize;
    float dn = length(d) / length(outSize * 0.5);
    float f = dn > 1.0 ? 0.0 : pow(cos(vignette * dn), 4.0);
    c *= f;
  }
  if (after && grain > 0.0) c += (hash(floor(v * outSize) + time) - 0.5) * 2.0 * grain / 255.0;
  float a = c0.a;
  if (keyed) {
    vec3 d = c0.rgb - keyc;
    float diff = sqrt(dot(d, d) / 3.0);
    a *= keyBlend > 0.0001 ? clamp((diff - keySim) / keyBlend, 0.0, 1.0) : (diff > keySim ? 1.0 : 0.0);
  }
  o = vec4(clamp(c, 0.0, 1.0) * a, a);
}`;

/** The table of a grade's colour as bytes for a 3D texture (RGBA, 33 a side), made once for each grade. */
const lutBytes = new Map<string, Uint8Array>();
function lutFor(g: VideoGrade): Uint8Array {
  const { vignette: _v, sharpen: _s, denoise: _d, grain: _g, ...colour } = g;
  const key = JSON.stringify(colour);
  let b = lutBytes.get(key);
  if (!b) {
    const f = gradeLut(colour);
    b = new Uint8Array((f.length / 3) * 4);
    for (let i = 0, j = 0; i < f.length; i += 3, j += 4) {
      b[j] = Math.round(f[i] * 255);
      b[j + 1] = Math.round(f[i + 1] * 255);
      b[j + 2] = Math.round(f[i + 2] * 255);
      b[j + 3] = 255;
    }
    lutBytes.set(key, b);
    if (lutBytes.size > 40) lutBytes.delete(lutBytes.keys().next().value!);
  }
  return b;
}

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** A canvas that draws one source as the edit makes it. */
export class GradeCanvas {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null;
  private g2: CanvasRenderingContext2D | null = null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private lut: WebGLTexture | null = null;
  private lutKey = '';
  private u: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true, antialias: false });
    if (this.gl) this.setUp(this.gl);
    else this.g2 = canvas.getContext('2d');
  }

  /** Whether it draws with WebGL 2 (the colour exactly as made), or the browser's filters. */
  get exact() {
    return !!this.gl;
  }

  private setUp(gl: WebGL2RenderingContext) {
    const sh = (type: number, text: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, text);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'program');
    this.prog = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['src', 'lut', 'useLut', 'texel', 'outSize', 'uvm', 'sharpen', 'denoise', 'vignette', 'grain', 'time', 'split', 'keyed', 'keyc', 'keySim', 'keyBlend']) this.u[n] = gl.getUniformLocation(p, n);
    this.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.lut = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lut);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.src, 0);
    gl.uniform1i(this.u.lut, 1);
  }

  /** Draws `source` (`sw`×`sh`) through `uv` at the canvas's size. */
  draw(source: TexImageSource, sw: number, sh: number, uv: UvMap, o: DrawOptions = {}): void {
    const { canvas } = this;
    const gl = this.gl;
    if (!gl) return this.draw2d(source, sw, sh, uv, o);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      return;
    }
    const g = o.grade;
    const colour = !!g && gradeHasColour(g);
    if (colour) {
      const bytes = lutFor(g!);
      const key = JSON.stringify(g);
      if (key !== this.lutKey) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_3D, this.lut);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, LUT_SIZE, LUT_SIZE, LUT_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        this.lutKey = key;
      }
    }
    // The canvas's own pixels stand for the clip's frame as it shows: the effects measure in them.
    const scale = Math.max(1e-6, Math.hypot(uv[0] * sw, uv[1] * sh) / canvas.width);
    gl.uniform1i(this.u.useLut, colour ? 1 : 0);
    gl.uniform2f(this.u.texel, 1 / sw, 1 / sh);
    gl.uniform2f(this.u.outSize, canvas.width * scale, canvas.height * scale);
    gl.uniformMatrix3fv(this.u.uvm, false, [uv[0], uv[1], 0, uv[2], uv[3], 0, uv[4], uv[5], 1]);
    gl.uniform1f(this.u.sharpen, g?.sharpen ? sharpenAmount(g.sharpen) : 0);
    gl.uniform1f(this.u.denoise, g?.denoise ? g.denoise * 0.6 : 0);
    gl.uniform1f(this.u.vignette, g?.vignette ? vignetteAngle(g.vignette) : 0);
    gl.uniform1f(this.u.grain, g?.grain ? grainStrength(g.grain) : 0);
    gl.uniform1f(this.u.time, (o.time ?? 0) % 97);
    gl.uniform1f(this.u.split, o.split ?? 0);
    gl.uniform1i(this.u.keyed, o.key ? 1 : 0);
    if (o.key) {
      gl.uniform3fv(this.u.keyc, hex(o.key.color));
      gl.uniform1f(this.u.keySim, o.key.similarity);
      gl.uniform1f(this.u.keyBlend, o.key.blend);
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Without WebGL 2: the part shown, with what the browser's filters can do of the colour. */
  private draw2d(source: TexImageSource, sw: number, sh: number, uv: UvMap, o: DrawOptions) {
    const g2 = this.g2;
    if (!g2) return;
    const { width: W, height: H } = this.canvas;
    const g = o.grade;
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.clearRect(0, 0, W, H);
    // The inverse of the map: from the source's pixels to the canvas's.
    const a = uv[0] * sw;
    const b = uv[1] * sh;
    const c = uv[2] * sw;
    const d = uv[3] * sh;
    const e = uv[4] * sw;
    const f = uv[5] * sh;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-9) return;
    const ia = d / det;
    const ib = -b / det;
    const ic = -c / det;
    const id = a / det;
    g2.filter = g ? `brightness(${1 + 0.6 * (g.brightness ?? 0) + 0.5 * (g.exposure ?? 0)}) contrast(${1 + 0.6 * (g.contrast ?? 0)}) saturate(${1 + (g.saturation ?? 0)})` : 'none';
    g2.setTransform(ia * W, ib * H, ic * W, id * H, -(ia * e + ic * f) * W, -(ib * e + id * f) * H);
    g2.drawImage(source as CanvasImageSource, 0, 0, sw, sh);
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.filter = 'none';
  }

  dispose() {
    const gl = this.gl;
    if (!gl) return;
    gl.deleteTexture(this.tex);
    gl.deleteTexture(this.lut);
    gl.deleteProgram(this.prog);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/**
 * The map for a frame `w`×`h` turned and mirrored (its upright frame), of which the window `win` (in upright pixels)
 * shows on the canvas.
 */
export function uvMap(w: number, h: number, t: { rotate?: number; flipH?: boolean; flipV?: boolean }, win: { x: number; y: number; w: number; h: number }): UvMap {
  // A point of the upright frame back in the frame as given (as shared's originalPoint).
  const up = t.rotate === 90 || t.rotate === 270 ? { w: h, h: w } : { w, h };
  const back = (px: number, py: number): [number, number] => {
    if (t.flipH) px = up.w - px;
    if (t.flipV) py = up.h - py;
    const [x, y] = t.rotate === 90 ? [py, h - px] : t.rotate === 180 ? [w - px, h - py] : t.rotate === 270 ? [w - py, px] : [px, py];
    return [x / w, y / h];
  };
  const p00 = back(win.x, win.y);
  const p10 = back(win.x + win.w, win.y);
  const p01 = back(win.x, win.y + win.h);
  return [p10[0] - p00[0], p10[1] - p00[1], p01[0] - p00[0], p01[1] - p00[1], p00[0], p00[1]];
}
