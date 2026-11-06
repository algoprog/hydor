// Script tests for the editors' AI tools (studio): what each tool says it costs before anything is spent (Quick and
// Best, see-through pictures made by the tier's own model, another one or cut out here, the picture tools on this
// computer or OpenRouter, drawings, videos as a range), the words for what AI made, the kinds and shapes, a table's
// cells as CSV and what a piece of data holds, pictures' sizes inside pages, how long a video has taken, and the
// tools' opening and closing: one at a time, each answered once, a video still being made handed over. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/images/studio/studio-test.ts && node dist/dev/studio-test.js
import assert from 'node:assert/strict';
import type { TiersInfo } from '@shared/images';
import {
  aiInsteadButton,
  aspectOf,
  changePrice,
  csvOf,
  describeData,
  drawingKindOf,
  drawingPrice,
  drawingTier,
  elapsed,
  errorWords,
  insteadLine,
  madeWith,
  modelLabel,
  money,
  nearestAspect,
  needsKey,
  pageSize,
  picturePrice,
  pictureTier,
  plotSize,
  ratioOf,
  toolPrice,
  videoPrice,
} from './logic';
import { closeTool, letGo, openTool, useStudio, type StudioAsk } from './store';

/** What GET /api/images/tiers says, as the demo app saw it (OpenRouter's prices of 6 November 2026). */
const tiers = (o: { keySet?: boolean; local?: Partial<TiersInfo['local']>; cutout?: boolean; noSeeThrough?: boolean } = {}): TiersInfo => ({
  keySet: o.keySet ?? true,
  quick: {
    id: 'bytedance-seed/seedream-5-0-flash',
    label: 'Seedream 5.0 Flash',
    perImage: 0.0177,
    ...(o.noSeeThrough ? {} : { seeThrough: o.cutout ? { id: 'bytedance-seed/seedream-5-0-flash', label: 'Seedream 5.0 Flash', perImage: 0.0177, cutout: true } : { id: 'openai/gpt-image-1-mini', label: 'GPT Image 1 Mini', perImage: 0.0328 } }),
  },
  best: {
    id: 'bytedance-seed/seedream-5-0-pro',
    label: 'Seedream 5.0 Pro',
    perImage: 0.0441,
    ...(o.noSeeThrough ? {} : { seeThrough: o.cutout ? { id: 'bytedance-seed/seedream-5-0-pro', label: 'Seedream 5.0 Pro', perImage: 0.0441, cutout: true } : { id: 'openai/gpt-image-2.6-flare', label: 'GPT Image 2.6 Flare', perImage: 0.1229 } }),
  },
  vector: { id: 'recraft/recraft-v4.1-vector', label: 'Recraft V4.1 Vector', perImage: 0.0784 },
  transparent: { id: 'openai/gpt-image-2.6-flare', label: 'GPT Image 2.6 Flare', perImage: 0.1229 },
  writer: 'Claude',
  video: { id: 'bytedance/seedance-2.5', label: 'Seedance 2.5', perSecond: 0.1027 },
  local: { ready: false, installing: false, canInstall: true, sizeMb: 120, downloaded: [], loaded: [], ...o.local },
});

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('prices are written as the app writes them, and every button that spends names its price', () => {
  assert.equal(money(0.0441), '$0.044');
  assert.equal(money(0.1229), '$0.12');
  assert.equal(money(1.16), '$1.16');
  const p = picturePrice(tiers(), { tier: 'quick', count: 1 });
  assert.equal(p.line, 'About $0.018 with Seedream 5.0 Flash');
  assert.equal(p.button, 'Make it (about $0.018)');
  assert.equal(p.again, 'Make again (about $0.018)');
  const four = picturePrice(tiers(), { tier: 'best', count: 4 });
  assert.equal(four.line, 'About $0.18 for 4 with Seedream 5.0 Pro');
  assert.equal(four.button, 'Make them (about $0.18)');
  assert.equal(picturePrice(tiers(), { tier: 'best', count: 9 }).cost, 0.0441 * 4, 'no more than four');
  assert.equal(changePrice(tiers()).button, 'Change it (about $0.044)');
  assert.match(drawingPrice(tiers(), 'best').button, /^Draw it \(about \$0\.078\)$/);
  assert.equal(drawingPrice(tiers(), 'quick').cost, undefined, 'a Quick drawing is written, no picture model paid for');
  assert.equal(drawingPrice(tiers(), 'quick').line, 'Written by Claude: no picture model is paid for');
});

test('a see-through picture is priced as the tier makes it: its own model, another, or cut out here; with nothing to make it, it is not offered', () => {
  const other = picturePrice(tiers(), { tier: 'quick', count: 1, transparent: true });
  assert.equal(other.line, 'About $0.033 with GPT Image 1 Mini');
  const here = picturePrice(tiers({ cutout: true }), { tier: 'quick', count: 2, transparent: true });
  assert.equal(here.line, 'About $0.035 for 2 with Seedream 5.0 Flash, their backgrounds then taken out on this computer for nothing');
  const none = picturePrice(tiers({ noSeeThrough: true }), { tier: 'best', count: 1, transparent: true });
  assert.equal(none.blocked, true);
  assert.match(none.line, /set up the picture tools/);
  assert.equal(picturePrice(tiers({ noSeeThrough: true }), { tier: 'best', count: 1 }).blocked, undefined, 'an opaque picture is still made');
});

test('taking a background out or erasing: free here (the first use downloads its model), else through OpenRouter, priced', () => {
  const first = toolPrice(tiers({ local: { ready: true } }), 'cutout', 'local');
  assert.equal(first.cost, 0);
  assert.equal(first.button, 'Remove the background (free)');
  assert.match(first.line, /downloads its model \(about 190 MB\)/);
  const again = toolPrice(tiers({ local: { ready: true, downloaded: ['erase'] } }), 'erase', 'local');
  assert.equal(again.line, 'On this computer, for nothing, and the picture stays here.');
  assert.equal(again.button, 'Erase it (free)');
  // A cutout through OpenRouter goes to Best's maker of see-through pictures; erasing to Best itself.
  assert.equal(toolPrice(tiers(), 'cutout', 'cloud').line, 'Through OpenRouter: about $0.12 with GPT Image 2.6 Flare');
  assert.equal(toolPrice(tiers(), 'erase', 'cloud').button, 'Erase it (about $0.044)');
  assert.equal(insteadLine(tiers(), 'cutout'), 'Use OpenRouter instead: about $0.12');
  assert.equal(aiInsteadButton(tiers(), 'erase'), 'Do it with AI instead (about $0.044)');
  // Best's see-through pictures cut out here: a cutout through OpenRouter is the model that makes them.
  assert.equal(insteadLine(tiers({ cutout: true }), 'cutout'), 'Use OpenRouter instead: about $0.12');
});

test('videos say plainly that they cost more, as a range from the cheapest way to the dearest, and the button names the most', () => {
  const v = videoPrice(tiers(), 5, 0.232);
  assert.equal(v.line, 'About $0.51 to $1.16 for 5 seconds with Seedance 2.5. Videos cost far more than pictures.');
  assert.equal(v.button, 'Make the video (about $1.16)');
  assert.equal(videoPrice(tiers(), 8).line, 'About $0.82 for 8 seconds with Seedance 2.5. Videos cost far more than pictures.');
  const unpriced = tiers();
  unpriced.video = { id: 'x/y', label: 'Y' };
  assert.equal(videoPrice(unpriced, 5).button, 'Make the video');
});

test('what AI made says so, by the model’s name; the tiers name the ones they know', () => {
  assert.equal(madeWith(tiers(), 'openai/gpt-image-2.6-flare', 0.1229), 'Made with GPT Image 2.6 Flare, $0.12');
  assert.equal(madeWith(tiers(), 'bytedance-seed/seedream-5-0-pro'), 'Made with Seedream 5.0 Pro');
  assert.equal(modelLabel(tiers(), 'google/nano-banana-9'), 'nano-banana-9');
  assert.equal(modelLabel(null, undefined), 'OpenRouter');
  assert.equal(needsKey('Add an OpenRouter key in Settings → Models'), true);
  assert.equal(needsKey('That picture is over 12 MB'), false);
  assert.equal(errorWords(new TypeError('Failed to fetch')), 'The app could not be reached: check the connection, then try again.');
  assert.equal(errorWords(new Error('That picture is over 12 MB')), 'That picture is over 12 MB');
});

test('Auto picks Quick for simple pictures and Best for scenes, words and changes; drawings go Best for illustrations', () => {
  assert.equal(pictureTier('auto', { prompt: 'A paper plane', kind: 'icon' }), 'quick');
  assert.equal(pictureTier('auto', { prompt: 'A portrait of a baker in her shop, morning light', kind: 'photo' }), 'best');
  assert.equal(pictureTier('auto', { prompt: 'Soft blue waves', kind: 'background' }), 'quick');
  assert.equal(pictureTier('auto', { prompt: 'Soft blue waves', refs: 1 }), 'best', 'a picture to follow');
  assert.equal(pictureTier('best', { prompt: 'A dot' }), 'best', 'as picked');
  assert.equal(drawingTier('auto', { prompt: 'A lightbulb', kind: 'icon' }), 'quick');
  assert.equal(drawingTier('auto', { prompt: 'A city at night', kind: 'illustration' }), 'best');
  assert.equal(drawingKindOf('background'), 'pattern');
  assert.equal(drawingKindOf('photo'), 'illustration');
  assert.equal(drawingKindOf('logo'), 'logo');
});

test('shapes: named ones, the nearest a model makes, a plot’s pixels, a picture’s size inside a page', () => {
  assert.equal(ratioOf('16:9'), 16 / 9);
  assert.equal(ratioOf('nonsense'), 1);
  assert.equal(aspectOf(1920, 1080), '16:9');
  assert.equal(aspectOf(1000, 1000), '1:1');
  assert.equal(aspectOf(1003, 997), '1:1', 'near enough to a common one');
  assert.equal(aspectOf(700, 300), '21:9', 'the same shape by its common name');
  assert.equal(aspectOf(500, 300), '5:3');
  assert.equal(nearestAspect('21:9', ['1:1', '16:9', '9:16']), '16:9');
  assert.equal(nearestAspect(undefined, ['4:3']), '4:3');
  assert.equal(nearestAspect('3:2', []), '3:2');
  assert.deepEqual(plotSize('16:9', 720), { w: 720, h: 405 });
  assert.deepEqual(pageSize(4000, 3000), { w: 1600, h: 1200 });
  assert.deepEqual(pageSize(800, 600), { w: 800, h: 600 }, 'never larger than it is');
});

test('a table’s cells as CSV, and what a piece of data holds', () => {
  assert.equal(
    csvOf([
      ['Month', '2025', 'Note'],
      ['Jan', '12', 'cold, "quiet"'],
    ]),
    'Month,2025,Note\nJan,12,"cold, ""quiet"""',
  );
  assert.equal(describeData('Month,2025,2026\nJan,12,15\nFeb,14,19'), '3 rows, 3 columns');
  assert.equal(describeData('a\tb\n1\t2'), '2 rows, 2 columns');
  assert.equal(describeData('"x, y",z\n1,2'), '2 rows, 2 columns', 'a quoted comma is one cell');
  assert.equal(describeData('[{"a":1,"b":2},{"a":3,"b":4}]'), '2 rows, 2 columns');
  assert.equal(describeData('{"series":[[1,2,3]]}'), '1 row, 3 columns');
  assert.equal(describeData('{oops'), 'Data that is not valid JSON');
  assert.equal(describeData('   '), null);
  assert.equal(elapsed(40_000), '40 s');
  assert.equal(elapsed(80_000), '1 min 20 s');
  assert.equal(elapsed(12 * 60_000 + 5000), '12 min');
});

test('one tool at a time: a second one closes the first having made nothing, and each answers once', async () => {
  const first = openTool<Extract<StudioAsk, { tool: 'picture' }>>('picture', { kind: 'icon' });
  const n1 = useStudio.getState().ask!.n;
  const second = openTool<Extract<StudioAsk, { tool: 'drawing' }>>('drawing', {});
  assert.equal(await first, null, 'the first heard it made nothing');
  const n2 = useStudio.getState().ask!.n;
  assert.equal(useStudio.getState().ask?.tool, 'drawing');
  closeTool(n1, { src: 'naget-asset:old', w: 1, h: 1, mime: 'image/png' });
  assert.equal(useStudio.getState().ask?.n, n2, 'an old one closing changes nothing');
  const made = { src: 'naget-asset:abc', w: 10, h: 10, mime: 'image/svg+xml', svg: '<svg/>' };
  closeTool(n2, made);
  assert.deepEqual(await second, made);
  assert.equal(useStudio.getState().ask, null);
});

test('a video being made is handed over when its dialog closes; other tools are not', async () => {
  const pic = openTool<Extract<StudioAsk, { tool: 'picture' }>>('picture', {});
  assert.equal(letGo(useStudio.getState().ask!.n), null, 'a picture is not handed over');
  closeTool(useStudio.getState().ask!.n, null);
  assert.equal(await pic, null);
  const video = openTool<Extract<StudioAsk, { tool: 'video' }>>('video', { aspect: '16:9' });
  const done = letGo(useStudio.getState().ask!.n);
  assert.ok(done, 'the one waiting is handed over');
  assert.equal(useStudio.getState().ask, null, 'and the dialog is gone');
  done!({ src: 'naget-video:abc', poster: 'naget-asset:def' });
  assert.deepEqual(await video, { src: 'naget-video:abc', poster: 'naget-asset:def' });
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').join('\n     ')}`);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
