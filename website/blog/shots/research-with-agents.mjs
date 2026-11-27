// The pictures of the blog post on research with agents (website/src/img/blog/research-with-agents/*.webp): real windows of
// the demo copy the guide's screenshot tool runs, dark theme only (the desktop app's look). The demo's dense retriever
// has its evaluation (Dev queries, nDCG@10: scorer and dev queries sealed, a baseline, three scores), a finished
// evolution of its reranking, three experiments and a project of its own, with a week of earlier scores (demo.mjs);
// prepare() gives that project the five findings the post shows (blogResearch in demo.mjs). The pictures: the
// evaluation's page (evaluation, and evaluation-phone on a phone), an evolution's page (evolution), the runs of one
// experiment (runs), New run with Tonight picked (new-run-tonight), the project's Memory tab on its Findings (findings)
// and its Research tab (research-tab, and research-tab-phone on a phone; what waits there is answered by run.mjs). Take them with
//
//   node scripts/guide-shots/run.mjs --root <built worktree> --shots website/blog/shots/research-with-agents.mjs --themes dark --out <your folder> [--only id1,id2]
//
// after building the app in a worktree as scripts/guide-shots/README.md says, and copy what is right into
// website/src/img/blog/research-with-agents/.
import { sleep } from '../../../scripts/guide-shots/cdp.mjs';
import { blogResearch } from '../../../scripts/guide-shots/demo.mjs';

/** The desktop app's windows, with the Browser in the rail. */
export const desktop = true;

export async function prepare(ctx) {
  return blogResearch(ctx);
}

/** The first button (or tab) whose text starts with these words, as a js: target. */
const button = (text) => `js:[...document.querySelectorAll('button, [role="button"], [role="radio"], [role="tab"]')].filter((b) => b.textContent.trim().startsWith(${JSON.stringify(text)})).pop()`;

/**
 * Read in the morning, whatever the time is: the page's browser takes a zone where it is about eight o'clock now (for
 * the pictures that show times and dates, so that they agree).
 */
async function morning(p) {
  const hours = ((8 - new Date().getUTCHours() + 36) % 24) - 12; // from UTC, between -12 and +11
  await p.timezone(''); // a second override is refused until the first (run.mjs's) is cleared
  await p.timezone(hours ? `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}` : 'Etc/GMT'); // Etc names have the sign reversed
}

/**
 * The project's Research tab, as on a first visit: the tab tells the app it was looked at, which would leave the next
 * picture with nothing new, so that call is answered here and never reaches the app.
 */
async function researchTab(p, ctx) {
  await p.route(/\/api\/projects\/[^/?]+\/research\/seen$/, () => ({ json: { seen: 0 } }));
  await morning(p);
  await ctx.go(`/projects/${ctx.researchProject}/research`, { settle: 3000 });
  await p.waitFor(`document.body.innerText.includes('Which training data') && document.body.innerText.includes('Hard negatives mined with BM25')`, { timeout: 20000 });
  await sleep(1500);
  await p.park();
}

export const SHOTS = [
  {
    // The evaluation's page: the number that counts, the seals, the three tiles, the chart of scores and the scores.
    id: 'evaluation',
    height: 900,
    async take(p, ctx) {
      await morning(p);
      await ctx.go(`/experiments?evaluation=${ctx.evaluation}`, { settle: 3000 });
      await p.waitFor(`document.body.innerText.includes('Latest score')`, { timeout: 20000 }).catch(() => {});
      await sleep(1500);
      await p.park();
      return p.shot(ctx.file);
    },
  },
  {
    // The same page on a phone.
    id: 'evaluation-phone',
    phone: true,
    width: 390,
    height: 844,
    async take(p, ctx) {
      await morning(p);
      await ctx.go(`/experiments?evaluation=${ctx.evaluation}`, { settle: 3000 });
      await p.waitFor(`document.body.innerText.includes('Latest score')`, { timeout: 20000 }).catch(() => {});
      await sleep(1500);
      await p.park();
      return p.shot(ctx.file);
    },
  },
  {
    // An evolution's page: the start, the best so far, the chart of tries and the list of what it tried.
    id: 'evolution',
    height: 900,
    async take(p, ctx) {
      await ctx.go(`/experiments?evolution=${ctx.evolution}`, { settle: 3000 });
      await p.waitFor(`document.body.innerText.includes('Best so far')`, { timeout: 20000 }).catch(() => {});
      await sleep(1500);
      await p.park();
      return p.shot(ctx.file);
    },
  },
  {
    // The runs of one experiment: three seeds each of the hard negatives retriever.
    id: 'runs',
    height: 640,
    async take(p, ctx) {
      await ctx.go('/experiments?e=dense-retriever-hardneg', { settle: 3000 });
      await sleep(1500);
      await p.park();
      return p.shot(ctx.file);
    },
  },
  {
    // New run, with Start on Tonight and the night's hours beside it.
    id: 'new-run-tonight',
    height: 900,
    async take(p, ctx) {
      await ctx.go('/experiments?e=dense-retriever-hardneg&new=1', { settle: 2500 });
      await p.waitFor(`document.body.innerText.includes('Tonight')`, { timeout: 20000 });
      // Its folder and command as a person would have filled them in (the demo's own folder is a scratch path).
      const field = (sel) => `js:${sel}`;
      await p.click(field(`document.querySelector('[role="dialog"] textarea')`), { wait: 200 });
      await p.type('python train.py --negatives hard --lr 2e-5 --seed {seed}');
      await p.click(field(`[...document.querySelectorAll('[role="dialog"] input')].find((i) => i.value.includes('guide-shots-demo'))`), { wait: 200 });
      await p.key('a', 'KeyA', 65, 2);
      await p.type('~/code/retriever');
      await p.click(button('Tonight'), { wait: 700 });
      await p.park();
      const d = await p.box('[role="dialog"]');
      return p.shot(ctx.file, { clip: { x: d.x - 24, y: d.y - 24, width: d.width + 48, height: d.height + 48 } });
    },
  },
  {
    // The project's Memory tab on its Findings chip, the first finding open in the pane on the right.
    id: 'findings',
    height: 860,
    async take(p, ctx) {
      await ctx.go(`/projects/${ctx.researchProject}/memory?part=findings`, { settle: 2500 });
      await p.waitFor(`document.body.innerText.includes('Hard negatives mined with BM25')`, { timeout: 20000 });
      await p.click(`js:[...document.querySelectorAll('main button, main [role="button"], main li')].filter((b) => b.textContent.includes('Hard negatives mined with BM25')).pop()`, { wait: 1200 });
      await p.park();
      return p.shot(ctx.file);
    },
  },
  {
    // The Research tab down to Running and waiting, in a window tall enough that nothing is scrolled.
    id: 'research-tab',
    height: 1400,
    async take(p, ctx) {
      await researchTab(p, ctx);
      return p.shot(ctx.file);
    },
  },
  {
    // Its top on a phone: what waits for the person and the first news.
    id: 'research-tab-phone',
    phone: true,
    width: 390,
    height: 844,
    async take(p, ctx) {
      await researchTab(p, ctx);
      return p.shot(ctx.file);
    },
  },
];
