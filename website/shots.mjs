// The website's pictures of the app (website/src/img/app-*.webp, trip-app.webp and library-slides.webp): whole windows
// of the demo copy the guide's screenshot tool runs, all the same size (1280×800, saved 1600 pixels wide), and a phone's
// screen. The Trip planner's answer and the slides are the README's (prepare adds their run and deck), and so are the newer
// pictures' shot lists (readme-shots.mjs: app-apps-make, app-suggest, app-experiments, app-boards, app-goals, app-bring-in,
// app-cards, app-browser). Take them with
//
//   node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app --shots website/shots.mjs --themes dark --out website/src/img
//
// after building the app in a worktree as scripts/guide-shots/README.md says.
import { sleep } from '../scripts/guide-shots/cdp.mjs';
import { appsMakeShot, bringInShot, boardShot, browserShot, cardsShot, deckShot, experimentsShot, goalShot, suggestShot, tripShot } from '../scripts/guide-shots/readme-shots.mjs';

export { prepare } from '../scripts/guide-shots/readme-shots.mjs';

/** The desktop app's windows, with the Browser in the rail (a phone's screen stays a phone's). */
export const desktop = true;

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
  tripShot('trip-app'),
  deckShot('library-slides'),
  // Making your own app by describing it: the App builder's sketch of it.
  appsMakeShot('app-apps-make'),
  // Word suggestions: the grey rest of the word and the next one, in a session's message box.
  suggestShot('app-suggest'),
  // System → Experiments: a sweep's six runs on their charts.
  experimentsShot('app-experiments'),
  // A board with cards pinned from replies (numbers, a chart, the forecast, a checklist, a split).
  boardShot('app-boards'),
  // A session working towards a goal, its rounds open.
  goalShot('app-goals'),
  // Settings → Memory → Bring in, a ChatGPT export read into notes to pick.
  bringInShot('app-bring-in'),
  // A reply as cards: a comparison table, a chart and key numbers.
  cardsShot('app-cards'),
  // The desktop app's own Browser page, with an article open and tabs in a group.
  browserShot('app-browser'),
];
