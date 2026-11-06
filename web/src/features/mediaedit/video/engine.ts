// The video editor's player: the timeline played in the browser as the edit will make it. Each clip, overlay and sound
// near the playhead has a media element of its own (made when needed, the far ones let go), played or held at the
// moment of its source the timeline is at: clips one after another, both of two in a transition, at their speed (their
// sound in tune, or not), backwards a frame at a time, a held frame still. The timeline's time follows the clip playing
// (so picture and sound stay together) or the clock between clips. Sound goes through the browser's mixer: each
// element's own level (its volume, fades, a transition's crossfade), then its track's (A1 the clips' sound, A2 music,
// A3 voice: level, pan, mute and solo), with a meter on each track and on the whole. J, K and L shuttle backwards and
// forwards at up to four times.
import { audioLength, clipSpans, heard, isStill, overlayLength, sourceAt, type ClipSpan, type VideoFactsOf, type VideoRecipe } from '@shared/mediaedit-video';
import type { Clock } from './clock';

type Bus = { gain: GainNode; pan: StereoPannerNode; meter: AnalyserNode };
export type TrackLevels = { a1: number; a2: number; a3: number; master: number };

/** How dark the fades make a moment of the timeline (0 clear, 1 black). */
export function fadeAt(t: number, length: number, r: Pick<VideoRecipe, 'fadeIn' | 'fadeOut'>): number {
  let dark = 0;
  if (r.fadeIn && t < r.fadeIn) dark = Math.max(dark, 1 - t / r.fadeIn);
  if (r.fadeOut && t > length - r.fadeOut) dark = Math.max(dark, 1 - (length - t) / r.fadeOut);
  return Math.min(1, Math.max(0, dark));
}

export class Engine {
  recipe: VideoRecipe = {};
  factsOf: VideoFactsOf = () => undefined;
  spans: ClipSpan[] = [];
  length = 0;
  playing = false;
  /** How fast and which way it plays (J and L: -4 to 4). */
  rate = 1;
  private clock: Clock;
  private urlOf: (src: string | undefined) => string;
  private media = new Map<string, HTMLMediaElement>();
  private used = new Map<string, number>();
  private images = new Map<string, HTMLImageElement>();
  private ctx: AudioContext | null = null;
  private buses: Record<'a1' | 'a2' | 'a3', Bus> | null = null;
  private master: { gain: GainNode; meter: AnalyserNode } | null = null;
  private gains = new Map<HTMLMediaElement, GainNode>();
  private raf = 0;
  private t0 = 0;
  private at0 = 0;
  private subs = new Set<() => void>();
  private frameSubs = new Set<() => void>();
  levels: TrackLevels = { a1: 0, a2: 0, a3: 0, master: 0 };
  private levelSubs = new Set<() => void>();
  private lastLevels = 0;

  constructor(clock: Clock, urlOf: (src: string | undefined) => string) {
    this.clock = clock;
    this.urlOf = urlOf;
  }

  // ---- what plays ---------------------------------------------------------------------------------------------------

  update(r: VideoRecipe, f: VideoFactsOf) {
    this.recipe = r;
    this.factsOf = f;
    const s = clipSpans(r.clips ?? [], f);
    this.spans = s.spans;
    this.length = s.length;
    // What is gone from the edit lets its element go.
    const ids = new Set([...(r.clips ?? []).flatMap((c) => [`c:${c.id}`, `s:${c.id}`]), ...(r.overlays ?? []).map((o) => `o:${o.id}`), ...(r.audio ?? []).map((a) => `a:${a.id}`)]);
    for (const [k, el] of this.media) if (!ids.has(k.split('|')[0])) this.drop(k, el);
    if (!this.playing) this.sync(this.clock.get(), false);
  }

  /** The element that plays a clip's or an overlay's video, made when first needed. */
  element(key: string, src: string | undefined, kind: 'video' | 'audio'): HTMLMediaElement {
    const full = `${key}|${src ?? ''}`;
    let el = this.media.get(full);
    if (!el) {
      el = document.createElement(kind);
      el.preload = 'auto';
      if (el instanceof HTMLVideoElement) el.playsInline = true;
      el.src = this.urlOf(src);
      const ping = () => this.frame();
      el.addEventListener('seeked', ping);
      el.addEventListener('loadeddata', ping);
      this.media.set(full, el);
      if (this.ctx) this.connect(el, key);
    }
    this.used.set(full, performance.now());
    return el;
  }

  /** A picture, loaded once. */
  image(src: string | undefined): HTMLImageElement {
    const key = src ?? '';
    let im = this.images.get(key);
    if (!im) {
      im = new Image();
      im.decoding = 'async';
      im.onload = () => this.frame();
      im.src = this.urlOf(src);
      this.images.set(key, im);
    }
    return im;
  }

  private drop(key: string, el: HTMLMediaElement) {
    el.pause();
    el.removeAttribute('src');
    el.load();
    this.gains.get(el)?.disconnect();
    this.gains.delete(el);
    this.media.delete(key);
    this.used.delete(key);
  }

  // ---- the browser's mixer ----------------------------------------------------------------------------------------

  private ensureSound() {
    if (this.ctx) return;
    try {
      const ctx = new AudioContext();
      const meter = () => {
        const a = ctx.createAnalyser();
        a.fftSize = 1024;
        return a;
      };
      const master = { gain: ctx.createGain(), meter: meter() };
      master.gain.connect(master.meter).connect(ctx.destination);
      const bus = (): Bus => {
        const b = { gain: ctx.createGain(), pan: ctx.createStereoPanner(), meter: meter() };
        b.gain.connect(b.pan).connect(b.meter).connect(master.gain);
        return b;
      };
      this.ctx = ctx;
      this.master = master;
      this.buses = { a1: bus(), a2: bus(), a3: bus() };
      for (const [k, el] of this.media) this.connect(el, k);
    } catch {
      // No mixer: the elements' own volume (up to as loud as they are).
    }
  }

  private connect(el: HTMLMediaElement, key: string) {
    if (!this.ctx || !this.buses || this.gains.has(el)) return;
    try {
      const g = this.ctx.createGain();
      this.ctx.createMediaElementSource(el).connect(g);
      const id = key.split('|')[0];
      const track = id.startsWith('a:') ? ((this.recipe.audio ?? []).find((a) => `a:${a.id}` === id)?.track === 'voice' ? 'a3' : 'a2') : 'a1';
      g.connect(id.startsWith('o:') ? this.ctx.createGain() : this.buses[track].gain);
      this.gains.set(el, g);
    } catch {}
  }

  private setGain(el: HTMLMediaElement, v: number) {
    const g = this.gains.get(el);
    if (g) g.gain.value = v;
    else el.volume = Math.max(0, Math.min(1, v));
  }

  // ---- time ---------------------------------------------------------------------------------------------------------

  /** Holds every element at the moment `t` of the timeline; while playing, playing what shows. */
  private sync(t: number, play: boolean) {
    const r = this.recipe;
    const f = this.factsOf;
    const clips = r.clips ?? [];
    const fwd = play && this.rate > 0;
    const dark = fadeAt(t, this.length, r);
    const a1 = heard(r, 'a1');
    clips.forEach((c, i) => {
      const s = this.spans[i];
      if (!s) return;
      const facts = f(c.src);
      if (c.picture || facts?.picture) return;
      const active = t >= s.start - 1e-6 && t < s.end - 1e-6;
      const soon = !active && s.start > t && s.start - t < 2;
      if (!active && !soon && !this.media.has(`c:${c.id}|${c.src ?? ''}`)) return;
      const el = this.element(`c:${c.id}`, c.src, 'video') as HTMLVideoElement;
      const sound = c.sound ? this.element(`s:${c.id}`, c.sound, 'audio') : null;
      const u = active ? t - s.start : 0;
      const want = sourceAt(c, facts, u);
      el.muted = !!c.sound || !!c.mute;
      for (const m of sound ? [el, sound] : [el]) {
        if (!active) {
          if (!m.paused) m.pause();
          if (soon && !m.seeking && Math.abs(m.currentTime - want) > 0.08) m.currentTime = want;
          continue;
        }
        const moving = fwd && !isStill(c) && !c.reverse;
        if (moving) {
          m.playbackRate = (c.speed ?? 1) * this.rate;
          (m as HTMLMediaElement & { preservesPitch: boolean }).preservesPitch = c.keepPitch !== false;
          if (m.paused) {
            m.currentTime = want;
            void m.play().catch(() => {});
          } else if (Math.abs(m.currentTime - want) > 0.3) m.currentTime = want;
        } else {
          if (!m.paused) m.pause();
          if (!m.seeking && Math.abs(m.currentTime - want) > (play ? 0.06 : 0.001)) m.currentTime = want;
        }
      }
      // The sound: its volume, a transition's crossfade, the fades of the whole.
      let level = c.mute || !a1 || !fwd ? 0 : (c.volume ?? 1) * (1 - dark);
      if (active && s.tin && u < s.tin) level *= u / s.tin;
      if (active && s.tout && u > s.length - s.tout) level *= (s.length - u) / s.tout;
      this.setGain(el, c.sound ? 0 : level);
      if (sound) this.setGain(sound, level);
    });
    for (const o of r.overlays ?? []) {
      const facts = f(o.src);
      if (o.picture || facts?.picture) continue;
      const len = overlayLength(o, facts);
      const active = t >= o.start && t < o.start + len;
      const soon = !active && o.start > t && o.start - t < 2;
      if (!active && !soon && !this.media.has(`o:${o.id}|${o.src}`)) continue;
      const el = this.element(`o:${o.id}`, o.src, 'video') as HTMLVideoElement;
      el.muted = true;
      const want = (o.trim?.[0] ?? 0) + (active ? t - o.start : 0);
      if (active && fwd) {
        el.playbackRate = this.rate;
        if (el.paused) {
          el.currentTime = want;
          void el.play().catch(() => {});
        } else if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - want) > 0.05) el.currentTime = want;
      }
    }
    for (const a of r.audio ?? []) {
      const facts = f(a.src);
      const len = audioLength(a, facts);
      const active = t >= a.start && t < a.start + len;
      if (!active && !(a.start > t && a.start - t < 2) && !this.media.has(`a:${a.id}|${a.src}`)) continue;
      const el = this.element(`a:${a.id}`, a.src, 'audio');
      const u = active ? t - a.start : 0;
      const want = (a.trim?.[0] ?? 0) + u;
      if (active && fwd) {
        el.playbackRate = this.rate;
        if (el.paused) {
          el.currentTime = want;
          void el.play().catch(() => {});
        } else if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - want) > 0.05) el.currentTime = want;
      }
      let level = (a.volume ?? 1) * (1 - dark);
      if (a.fadeIn && u < a.fadeIn) level *= u / a.fadeIn;
      if (a.fadeOut && u > len - a.fadeOut) level *= Math.max(0, (len - u) / a.fadeOut);
      this.setGain(el, level);
    }
    // The tracks' levels, pans, mutes and solos.
    if (this.buses) {
      for (const k of ['a1', 'a2', 'a3'] as const) {
        const m = r.tracks?.[k];
        this.buses[k].gain.gain.value = heard(r, k) ? (m?.volume ?? 1) : 0;
        this.buses[k].pan.pan.value = m?.pan ?? 0;
      }
    }
    // Let go of elements not used for a while, beyond a few.
    if (this.media.size > 10) {
      const old = [...this.used].sort((x, y) => x[1] - y[1]).slice(0, this.media.size - 10);
      for (const [k] of old) {
        const el = this.media.get(k);
        if (el && el.paused) this.drop(k, el);
      }
    }
  }

  /** The clip that leads the time while it plays: one playing forwards at its own pace, not near its end. */
  private leadTime(): number | null {
    if (this.rate !== 1) return null;
    const clips = this.recipe.clips ?? [];
    const t = this.clock.get();
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const s = this.spans[i];
      if (!s || t < s.start || t >= s.end || isStill(c) || c.reverse || this.factsOf(c.src)?.picture) continue;
      const el = this.media.get(`c:${c.id}|${c.src ?? ''}`);
      const [a, b] = c.trim ?? [0, this.factsOf(c.src)?.duration ?? 0];
      if (!el || el.paused || el.readyState < 2 || el.ended || el.currentTime >= b - 0.02) return null;
      return s.start + (el.currentTime - a) / (c.speed ?? 1);
    }
    return null;
  }

  private tick = () => {
    const now = performance.now();
    let t = this.at0 + ((now - this.t0) / 1000) * this.rate;
    const lead = this.leadTime();
    if (lead !== null && Math.abs(lead - t) < 0.5) {
      t = lead;
      this.at0 = t;
      this.t0 = now;
    }
    if (t >= this.length || t < 0) {
      t = Math.max(0, Math.min(this.length, t));
      this.clock.set(t);
      this.pause();
      return;
    }
    this.clock.set(t);
    this.sync(t, true);
    this.frame();
    this.meter(now);
    this.raf = requestAnimationFrame(this.tick);
  };

  play(rate = 1) {
    this.ensureSound();
    void this.ctx?.resume();
    this.rate = rate;
    let t = this.clock.get();
    if (rate > 0 && t >= this.length - 0.02) t = 0;
    this.at0 = t;
    this.t0 = performance.now();
    if (!this.playing) {
      this.playing = true;
      this.emit();
    }
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    cancelAnimationFrame(this.raf);
    for (const el of this.media.values()) if (!el.paused) el.pause();
    if (this.playing) {
      this.playing = false;
      this.rate = 1;
      this.emit();
    }
    this.levels = { a1: 0, a2: 0, a3: 0, master: 0 };
    for (const f of this.levelSubs) f();
    this.sync(this.clock.get(), false);
    this.frame();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  /** J (backwards) or L (forwards): faster each press, up to four times; K stops. */
  shuttle(dir: -1 | 1) {
    if (!this.playing || Math.sign(this.rate) !== dir) return this.play(dir);
    const next = Math.max(-4, Math.min(4, this.rate * 2));
    this.at0 = this.clock.get();
    this.t0 = performance.now();
    this.rate = next;
    this.emit();
  }

  seek(t: number) {
    const x = Math.max(0, Math.min(this.length, t));
    this.clock.set(x);
    this.at0 = x;
    this.t0 = performance.now();
    this.sync(x, this.playing);
    this.frame();
  }

  // ---- meters and listeners -----------------------------------------------------------------------------------------

  private meter(now: number) {
    if (!this.buses || !this.master || now - this.lastLevels < 60) return;
    this.lastLevels = now;
    const buf = new Float32Array(1024);
    const rms = (a: AnalyserNode) => {
      a.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return Math.sqrt(s / buf.length);
    };
    this.levels = { a1: rms(this.buses.a1.meter), a2: rms(this.buses.a2.meter), a3: rms(this.buses.a3.meter), master: rms(this.master.meter) };
    for (const f of this.levelSubs) f();
  }

  /** Hears when it starts or stops playing (for the play button). */
  subscribe = (f: () => void) => {
    this.subs.add(f);
    return () => void this.subs.delete(f);
  };
  /** Hears each new frame to draw (playing, or a seek arrived). */
  onFrame = (f: () => void) => {
    this.frameSubs.add(f);
    return () => void this.frameSubs.delete(f);
  };
  /** Hears the meters (about fifteen times a second while it plays). */
  onLevels = (f: () => void) => {
    this.levelSubs.add(f);
    return () => void this.levelSubs.delete(f);
  };
  private emit() {
    for (const f of this.subs) f();
  }
  frame() {
    for (const f of this.frameSubs) f();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const [k, el] of [...this.media]) this.drop(k, el);
    void this.ctx?.close().catch(() => {});
  }
}

/** Whether a fraction of a decibel scale: a level (0–1 and more) as dB, for the meters. */
export const toDb = (v: number) => (v <= 0.00001 ? -100 : 20 * Math.log10(v));
