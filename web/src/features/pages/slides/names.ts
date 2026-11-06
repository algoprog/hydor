// What the editor calls the effects and transitions (PowerPoint's and the web format's), in words the app's
// language translates: the side panel's lists and the dialog of what PowerPoint cannot keep.
import type { AnimFx, TransitionFx } from '@shared/slides';

export const FX_NAMES: Record<AnimFx, string> = {
  appear: 'Appear',
  fade: 'Fade',
  fly: 'Fly',
  float: 'Float',
  zoom: 'Zoom',
  wipe: 'Wipe',
  bounce: 'Bounce',
  pulse: 'Pulse',
  spin: 'Spin',
  grow: 'Grow',
  shake: 'Shake',
  blur: 'Blur',
  rise: 'Rise',
  drop: 'Drop in',
  flip: 'Flip over',
  swing: 'Swing',
  roll: 'Roll in',
  pop: 'Pop in',
  typewriter: 'Typewriter',
  draw: 'Draw the lines',
  count: 'Count up',
  glow: 'Glow',
  wiggle: 'Wiggle',
  heartbeat: 'Heartbeat',
  jello: 'Jelly wobble',
  flash: 'Flash',
  bob: 'Bob up and down',
  confetti: 'Confetti burst',
};

export const TR_NAMES: Record<TransitionFx, string> = { none: 'None', fade: 'Fade', push: 'Push in', wipe: 'Wipe', cover: 'Cover', zoom: 'Zoom', split: 'Split', morph: 'Morph', cube: 'Cube', flip: 'Flip over', dissolve: 'Dissolve', circle: 'Circle', blinds: 'Blinds', glitch: 'Glitch' };
