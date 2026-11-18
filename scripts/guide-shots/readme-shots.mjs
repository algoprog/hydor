// The README's pictures of the app (docs/media/readme-*.webp): whole windows of the demo copy, like the website's,
// before readme-frame.py gives them a window's rounded corners and puts the phone over its dimmed window. Take them with
//
//   node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app --shots scripts/guide-shots/readme-shots.mjs --themes dark --out /tmp/readme-shots
//   python3 scripts/guide-shots/readme-frame.py /tmp/readme-shots docs/media
//
// readme-answers.webp (the Trip planner's answer) and readme-library.webp (slides in the Library's editor) show
// content the demo does not have (a planned trip with its map, a deck of slides): they are taken from an app with
// such a run and deck, not from the demo.
import { sleep } from './cdp.mjs';

const session = (ctx, name) => `/s/${encodeURIComponent(ctx.sessions[name].key)}`;

/** The whole window on a page (a path, or a function of the demo's context), saved 1600 pixels wide, or a phone's screen. */
const whole = (id, where, { settle = 2500, width, height, phone } = {}) => ({
  id,
  width,
  height,
  phone,
  async take(p, ctx) {
    await ctx.go(typeof where === 'function' ? where(ctx) : where, { settle });
    await p.park();
    await sleep(600);
    return p.shot(ctx.file, { maxWidth: phone ? 780 : 1600 });
  },
});

export const SHOTS = [
  whole('readme-agents', (ctx) => session(ctx, 'checkout')),
  whole('readme-phone-screen', (ctx) => session(ctx, 'checkout'), { width: 390, height: 844, phone: true }),
  whole('readme-memory', '/settings?s=memory'),
  whole('readme-automation', '/settings?s=tasks'),
];
