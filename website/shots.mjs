// The website's pictures of the app (website/src/img/app-*.webp): whole windows of the demo copy the guide's
// screenshot tool runs, all the same size (1280×800, saved 1600 pixels wide), and a phone's screen. Take them with
//
//   node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app --shots website/shots.mjs --themes dark --out website/src/img
//
// after building the app in a worktree as scripts/guide-shots/README.md says.
import { sleep } from '../scripts/guide-shots/cdp.mjs';

const session = (ctx, name) => `/s/${encodeURIComponent(ctx.sessions[name].key)}`;

/** The whole window on a page (a path, or a function of the demo's context for a session's), with `typed` in its
 * message box when given. */
const whole = (id, where, { settle = 2000, width, height, phone, typed } = {}) => ({
  id,
  width,
  height,
  phone,
  async take(p, ctx) {
    await ctx.go(typeof where === 'function' ? where(ctx) : where, { settle });
    if (typed) {
      await p.click('textarea');
      await p.type(typed);
    }
    await p.park();
    await sleep(600);
    return p.shot(ctx.file, { maxWidth: phone ? 780 : 1600 });
  },
});

export const SHOTS = [
  whole('app-start', '/', { typed: 'Plan a 4-day trip to Lisbon in May: two adults, mid-range hotels, lots of walking.' }),
  whole('app-session', (ctx) => session(ctx, 'checkout'), { settle: 2500 }),
  whole('app-research', (ctx) => session(ctx, 'ebike'), { settle: 2500 }),
  whole('app-tasks', '/settings?s=tasks'),
  whole('app-phone', (ctx) => session(ctx, 'checkout'), { settle: 2500, width: 390, height: 844, phone: true }),
];
