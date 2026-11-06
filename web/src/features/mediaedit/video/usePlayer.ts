// The video editor's player: the video plays as the edit will make it, in the browser. It skips the parts cut out and
// stops at the end of the part kept, plays at the edit's speed (its sound in tune), as loud as the edit makes it (louder
// than it was, through the browser's sound), fades in and out, and plays the music under it from where it starts in the
// edited video. The clock follows it, for the playhead, the time and the words that show.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isKept, toEdited, type VideoRecipe } from '@shared/mediaedit-video';
import type { Clock } from './clock';
import { fadeAt } from './Stage';

export interface PlayerOptions {
  video: RefObject<HTMLVideoElement | null>;
  clock: Clock;
  parts: [number, number][];
  recipe: VideoRecipe;
  length: number;
  /** Where the browser plays the music from, when there is music. */
  musicUrl: string | null;
}

interface Sound {
  ctx: AudioContext;
  video: GainNode;
  music: GainNode;
}

/** How far before the end of a part kept the player goes on to the next (no frame of the part cut shows). */
const AHEAD = 0.03;

export function usePlayer(o: PlayerOptions) {
  const [playing, setPlaying] = useState(false);
  const opts = useRef(o);
  opts.current = o;
  const music = useRef<HTMLAudioElement | null>(null);
  const sound = useRef<Sound | null>(null);
  const raf = useRef(0);

  // The music's player, its source following the edit.
  useEffect(() => {
    if (!o.musicUrl) {
      music.current?.pause();
      return;
    }
    if (!music.current) {
      music.current = new Audio();
      music.current.preload = 'auto';
    }
    if (music.current.src !== new URL(o.musicUrl, location.href).href) music.current.src = o.musicUrl;
  }, [o.musicUrl]);

  /** The browser's sound for both, made at the first press of play (browsers start sound only then). */
  const ensureSound = useCallback(() => {
    if (sound.current || !o.video.current) return;
    try {
      const ctx = new AudioContext();
      const v = ctx.createGain();
      ctx.createMediaElementSource(o.video.current).connect(v).connect(ctx.destination);
      const m = ctx.createGain();
      if (!music.current) music.current = new Audio();
      ctx.createMediaElementSource(music.current).connect(m).connect(ctx.destination);
      sound.current = { ctx, video: v, music: m };
    } catch {
      // No sound through the browser: the players' own volume (up to as loud as they are).
    }
  }, [o.video]);

  const setLevels = (e: number) => {
    const { recipe: r, length } = opts.current;
    const fade = 1 - (r.fadeIn || r.fadeOut ? fadeAt(e, length, r) : 0);
    const vg = r.mute ? 0 : (r.volume ?? 1) * fade;
    const mg = (r.music?.volume ?? 1) * fade;
    const s = sound.current;
    const v = opts.current.video.current;
    if (s) {
      s.video.gain.value = vg;
      s.music.gain.value = mg;
    } else {
      if (v) v.volume = Math.min(1, vg);
      if (music.current) music.current.volume = Math.min(1, mg);
    }
  };

  /** The music where the edited video is (`e`): playing from there, or still before its start or after its end. */
  const syncMusic = (e: number, on: boolean) => {
    const a = music.current;
    const m = opts.current.recipe.music;
    if (!a || !m || !opts.current.musicUrl) return a?.pause();
    const at = e - (m.start ?? 0);
    if (!on || at < 0 || (a.duration && at >= a.duration)) return a.pause();
    if (a.paused) {
      a.currentTime = at;
      void a.play().catch(() => {});
    } else if (Math.abs(a.currentTime - at) > 0.25) a.currentTime = at;
  };

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    opts.current.video.current?.pause();
    music.current?.pause();
    setPlaying(false);
  }, []);

  const tick = useCallback(() => {
    const v = opts.current.video.current;
    if (!v) return;
    const { parts, clock, recipe } = opts.current;
    let t = v.currentTime;
    const last = parts[parts.length - 1];
    // Into a part cut out (or about to be): on to the next part kept; past the last, the end.
    if (!parts.some(([a, b]) => t >= a - 0.001 && t < b - AHEAD)) {
      const next = parts.find(([a]) => a > t + 0.0001);
      if (next) {
        v.currentTime = next[0];
        t = next[0];
      } else {
        stop();
        if (last) {
          v.currentTime = last[1];
          clock.set(last[1]);
        }
        return;
      }
    }
    clock.set(t);
    const e = toEdited(t, parts, recipe.speed ?? 1);
    setLevels(e);
    syncMusic(e, true);
    raf.current = requestAnimationFrame(tick);
  }, [stop]);

  const play = useCallback(async () => {
    const v = opts.current.video.current;
    const { parts, recipe } = opts.current;
    if (!v || !parts.length) return;
    ensureSound();
    void sound.current?.ctx.resume();
    v.playbackRate = recipe.speed ?? 1;
    v.preservesPitch = true;
    const t = v.currentTime;
    const last = parts[parts.length - 1];
    if (t >= last[1] - AHEAD || t < parts[0][0]) v.currentTime = parts[0][0];
    else if (!isKept(t, parts)) v.currentTime = parts.find(([a]) => a > t)?.[0] ?? parts[0][0];
    setLevels(toEdited(v.currentTime, parts, recipe.speed ?? 1));
    try {
      await v.play();
    } catch {
      return;
    }
    setPlaying(true);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  }, [ensureSound, tick]);

  const seek = useCallback((t: number) => {
    const v = opts.current.video.current;
    if (!v) return;
    v.currentTime = t;
    opts.current.clock.set(t);
    if (!v.paused) syncMusic(toEdited(t, opts.current.parts, opts.current.recipe.speed ?? 1), true);
  }, []);

  // The speed changed while it plays.
  useEffect(() => {
    const v = o.video.current;
    if (v) v.playbackRate = o.recipe.speed ?? 1;
  }, [o.recipe.speed, o.video]);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      music.current?.pause();
      void sound.current?.ctx.close().catch(() => {});
    },
    [],
  );

  return { playing, play, pause: stop, toggle: () => (playing ? stop() : void play()), seek };
}
