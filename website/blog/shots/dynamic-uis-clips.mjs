// Short clips of the app's answer UIs (the gallery at /answers) for the blog post on dynamic UIs: mp4 files with a poster
// each, recorded from the demo copy the guide's screenshot tool runs. Needs ffmpeg (libx264 and libwebp). Take them with
//
//   node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app --shots website/blog/shots/dynamic-uis-clips.mjs --themes dark --out website/src/img/blog/dynamic-uis [--only id1,id2]
//
// after building the app in a worktree as scripts/guide-shots/README.md says. Two kinds of clips:
//   stream-<ui>  a card drawing itself as its data streams in (the gallery's ▶ "Play as it streams"), from the click until
//                1.5 s after the replay has ended; the poster is the final state. The streamed text is saved in
//                /tmp/hydor-blog-dynui-out/stream-<ui>.json and the replay's start and end are printed.
//   use-<ui>     the card being used, with a pointer (headless Chromium shows none) that glides between the actions; the
//                poster is the first frame. Its timeline (time, what happened, what the card showed) is printed and saved
//                in /tmp/hydor-blog-dynui-out/use-<ui>.timeline.txt.
// Every clip is the card's box at its final size plus 12 px of the page around it, with nothing else of the gallery in it
// (the other UIs are hidden, so the card stays where it is). No picture from the web shows (the app's picture route is made
// to fail, so entries show without pictures); the map's tiles are OpenStreetMap's, loaded once before the replay.
//
// How it records: Page.captureScreenshot of the card's rectangle at device scale 2 as PNG, from three requests at once
// (one at a time is about 20 a second, three keep the page drawing about 45 a second while it moves). A frame the same as
// the one before is not kept; each frame is held until the next one. ffmpeg then puts them on a constant 30 fps grid, scales
// them with Lanczos to 1280 pixels wide and encodes H.264 (yuv420p, BT.709, faststart, no sound), raising the CRF from 24
// until the file is under 700 KB.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../../../scripts/guide-shots/cdp.mjs';

/** The desktop app's windows, with the Browser in the rail. */
export const desktop = true;

const TMP = '/tmp/hydor-blog-dynui-clips';
const KEEP = '/tmp/hydor-blog-dynui-out';
const PAD = 12;
const WIDTH = 1280;
const MAX_BYTES = 700 * 1024;
/** How long before a screenshot reaches us it was taken (its drawing and encoding), in ms. */
const LAG = 25;

// ---- the page -------------------------------------------------------------------------------------------------------

/** Before the page's own scripts: only the card's section stays, with nothing round it; a pointer that follows the mouse. */
const pageScript = (id, pointer) => `
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = '*{caret-color:transparent!important} section[id]:not(#${id}){display:none!important} section#${id}{border:0!important;padding-bottom:0!important}';
    document.head.appendChild(s);
  });
  if (!${pointer}) return;
  window.addEventListener('DOMContentLoaded', () => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:26px;pointer-events:none;z-index:2147483647;display:none;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.55))';
    el.innerHTML = '<svg width="18" height="26" viewBox="0 0 18 26"><path d="M2 1.8 L2 20.2 L6.6 16 L9.6 23.2 L13 21.8 L10 14.8 L16 14.6 Z" fill="#fff" stroke="#16181d" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    document.body.appendChild(el);
    document.addEventListener('mousemove', (e) => {
      el.style.display = 'block';
      el.style.transform = 'translate(' + (e.clientX - 2) + 'px,' + (e.clientY - 1.8) + 'px)';
    }, true);
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;left:' + (e.clientX - 15) + 'px;top:' + (e.clientY - 15) + 'px;width:30px;height:30px;border-radius:50%;pointer-events:none;z-index:2147483646;border:2.5px solid #fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.45),inset 0 0 0 1.5px rgba(0,0,0,.35)';
      document.body.appendChild(r);
      r.animate([{ transform: 'scale(.35)', opacity: 1 }, { transform: 'scale(1.35)', opacity: 0 }], { duration: 480, easing: 'ease-out' }).onfinish = () => r.remove();
    }, true);
  });
})();`;

/** Opens the gallery with only this UI's card, drawn in full, and its box (CSS pixels). */
async function open(p, ctx, id, { pointer, settle = 1500, map } = {}) {
  // The pictures of the web (rights): the app's picture route fails, and cards show without them.
  await p.route(/\/api\/pages\/picture/, () => ({ status: 404, body: 'no pictures' }));
  await p.initScript(pageScript(id, pointer));
  await ctx.go('/answers', { settle });
  await p.waitFor(`!!document.querySelector('.aui[data-ui="${id}"]')`, { what: `the ${id} card` });
  // The map is a frame of its own (tiles loaded from the web, vector drawing): once nothing in the card changes between two
  // screenshots a second apart, everything is in.
  if (map) await p.waitFor(`!!document.querySelector('.aui[data-ui="${id}"] iframe')`, { timeout: 30_000, what: 'the map' });
  await p.idle();
  let box = await p.box(`.aui[data-ui="${id}"]`);
  let before = null;
  for (let i = 0; i < 30; i++) {
    box = await p.box(`.aui[data-ui="${id}"]`);
    const clip = clipOf(box);
    const { data } = await p.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 0.5 } });
    if (data === before) break;
    before = data;
    await sleep(1000);
  }
  return box;
}

/** The clip's rectangle in whole CSS pixels: the box plus PAD all round, taller when the card grows (`extra`). */
function clipOf(box, extra = 0) {
  const x = Math.floor(box.x - PAD);
  const y = Math.floor(box.y - PAD);
  return { x, y, width: Math.ceil(box.x + box.width + PAD) - x, height: Math.ceil(box.y + box.height + extra + PAD) - y };
}

// ---- recording ------------------------------------------------------------------------------------------------------

/** Takes screenshots of `clip` as fast as the page lets it; frames the same as the one before are not kept. */
async function record(p, dir, clip, workers = 3) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // The first screenshots of a page come out wrong (the whole window squeezed into the clip): take a few, one at a time, first.
  for (let i = 0; i < 4; i++) await p.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip: { ...clip, scale: 1 } });
  const frames = [];
  let last = null;
  let raw = 0;
  let stopping = false;
  const started = Date.now();
  const run = async () => {
    while (!stopping) {
      const r = await p.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip: { ...clip, scale: 1 } });
      const t = Date.now() - LAG;
      raw++;
      if (r.data === last) continue;
      last = r.data;
      const file = path.join(dir, `${String(frames.length).padStart(5, '0')}.png`);
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      frames.push({ t, file });
    }
  };
  const tasks = Array.from({ length: workers }, run);
  return {
    frames,
    /** Stops once the requests in flight are answered. */
    async stop() {
      stopping = true;
      await Promise.all(tasks);
      frames.sort((a, b) => a.t - b.t);
      return { frames, raw, seconds: (Date.now() - started) / 1000 };
    },
  };
}

/** The frames from `t0` to `t1` (epoch ms) as an H.264 clip and a poster, 1280 px wide; returns the poster's size in bytes. */
function encode({ frames, clip, t0, t1, file, poster }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out = file.replace(/\.webp$/, '.mp4');
  const dir = path.dirname(frames[0].file);
  const w = WIDTH;
  const h = Math.round((WIDTH * clip.height) / clip.width / 2) * 2;
  // Each frame is held until the next; the first starts at t0 and the last ends at t1.
  const kept = frames.filter((f, i) => f.t < t1 && (frames[i + 1]?.t ?? Infinity) > t0);
  const lines = [];
  kept.forEach((f, i) => {
    const from = Math.max(f.t, t0);
    const to = Math.min(kept[i + 1]?.t ?? t1, t1);
    lines.push(`file '${f.file}'`, `duration ${((to - from) / 1000).toFixed(4)}`);
  });
  lines.push(`file '${kept.at(-1).file}'`);
  fs.writeFileSync(path.join(dir, 'list.txt'), lines.join('\n'));
  const vf = `fps=30,scale=${w}:${h}:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709,format=yuv420p`;
  let crf = 24;
  for (; ; crf += 2) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', vf, '-fps_mode', 'cfr', '-r', '30', '-t', ((t1 - t0) / 1000).toFixed(3), '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-crf', String(crf), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-an', '-movflags', '+faststart', out]);
    if (fs.statSync(out).size <= MAX_BYTES || crf >= 34) break;
  }
  const still = poster === 'first' ? kept[0].file : kept.at(-1).file;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', still, '-vf', `scale=${w}:${h}:flags=lanczos+accurate_rnd+full_chroma_int`, '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6', file]);
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:format=duration,size', '-of', 'json', out]).toString());
  const st = info.streams[0];
  console.log(`  ${path.basename(out)}: ${st.width}x${st.height}, ${Number(info.format.duration).toFixed(2)} s, ${st.r_frame_rate}, ${st.nb_frames} frames, ${Math.round(info.format.size / 1024)} KB (crf ${crf}); ${kept.length} distinct frames from the page`);
  return fs.statSync(file).size;
}

// ---- the stream clips -----------------------------------------------------------------------------------------------

/** A card drawing itself as its data streams in: from the click on ▶ until 1.5 s after the replay has ended. */
function streamShot(id, { height = 1800, map } = {}) {
  return {
    id: `stream-${id}`,
    height,
    async take(p, ctx) {
      const box = await open(p, ctx, id, { map });
      const clip = clipOf(box);
      const play = `section#${id} button[aria-label="Play as it streams"]`;
      // What the replay sends is the example's JSON as the gallery shows it under "Show the data".
      await p.click(`section#${id} button[aria-label="Show the data"]`, { wait: 400 });
      const text = JSON.stringify(JSON.parse(await p.eval(`document.querySelector('section#${id} pre')?.innerText ?? document.querySelector('section#${id} code')?.innerText`)));
      fs.mkdirSync(KEEP, { recursive: true });
      fs.writeFileSync(path.join(KEEP, `stream-${id}.json`), text);
      await p.click(`section#${id} button[aria-label="Show it"]`, { wait: 1200 });
      await p.waitFor(`!!document.querySelector('.aui[data-ui="${id}"]')`);
      await p.idle();
      // The times the replay starts and ends, by the page's own clock (the same as ours): the click, and the button given back.
      await p.eval(`(() => {
        const b = document.querySelector(${JSON.stringify(play)});
        window.__marks = {};
        b.addEventListener('click', () => (window.__marks.click = Date.now()), true);
        new MutationObserver(() => { if (b.disabled) window.__marks.start ??= Date.now(); else if (window.__marks.start) window.__marks.end ??= Date.now(); }).observe(b, { attributes: true, attributeFilter: ['disabled'] });
      })()`);
      await p.park();
      const dir = path.join(TMP, `stream-${id}`);
      const rec = await record(p, dir, clip);
      await sleep(500);
      await p.click(play, { wait: 0 });
      await p.waitFor('window.__marks.end', { timeout: 30_000, what: 'the end of the replay' });
      await sleep(1500);
      const { frames, raw, seconds } = await rec.stop();
      const m = await p.eval('window.__marks');
      const final = await p.box(`.aui[data-ui="${id}"]`);
      // The clip starts at the click; its first frame is the first one that no longer shows the finished card.
      const t0 = m.click;
      const t1 = m.end + 1500;
      const first = frames.findIndex((f) => f.t >= t0 - 40);
      const poster = encode({ frames: frames.slice(first), clip, t0, t1, file: ctx.file, poster: 'last' });
      const sec = (t) => ((t - t0) / 1000).toFixed(2);
      console.log(`  ${id}: replay starts ${sec(m.start)} s, ends ${sec(m.end)} s, clip ${((t1 - t0) / 1000).toFixed(2)} s; text ${text.length} characters; ${raw} screenshots in ${seconds.toFixed(1)} s (${(raw / seconds).toFixed(1)}/s), card ${Math.round(box.width)}x${Math.round(box.height)} then ${Math.round(final.width)}x${Math.round(final.height)}; first change ${((frames[first]?.t ?? NaN) - t0).toFixed(0)} ms after the click`);
      return poster;
    },
  };
}

// ---- the use clips --------------------------------------------------------------------------------------------------

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** The pointer: where it is, and how it moves and clicks with real mouse events. */
function pointerOf(p, start, pace = 1) {
  const st = { x: start.x, y: start.y };
  const move = (x, y, buttons = 0) => p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: buttons ? 'left' : 'none', buttons });
  const api = {
    st,
    /** To (x, y) in `ms`, in steps of 1/60 s along a gentle arc, easing in and out. */
    async glide(x, y, ms, { buttons = 0, arc = 0.05, easing = ease } = {}) {
      const from = { ...st };
      const dx = x - from.x;
      const dy = y - from.y;
      const n = Math.max(1, Math.round(ms / (1000 / 60)));
      const t0 = performance.now();
      for (let i = 1; i <= n; i++) {
        const wait = t0 + (i * ms) / n - performance.now();
        if (wait > 0) await sleep(wait);
        const k = easing(i / n);
        const bend = Math.sin(Math.PI * k) * arc;
        st.x = from.x + dx * k - dy * bend;
        st.y = from.y + dy * k + dx * bend;
        await move(st.x, st.y, buttons);
      }
      st.x = x;
      st.y = y;
    },
    /** Over a target (a selector or a point; the middle of the element, or `at` of its width and height) in a time that suits the distance. */
    async to(target, { at = [0.5, 0.5], ms } = {}) {
      const pt = Array.isArray(target) ? { x: target[0], y: target[1] } : await centre(p, target, at);
      const dist = Math.hypot(pt.x - st.x, pt.y - st.y);
      await api.glide(pt.x, pt.y, ms ?? Math.min(1100, 380 + dist * 1.1) * pace);
      return pt;
    },
    /** Glides to a target and clicks it. */
    async click(target, opts = {}) {
      const pt = await api.to(target, opts);
      await sleep(130);
      await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', buttons: 1, clickCount: 1 });
      await sleep(95);
      await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', buttons: 0, clickCount: 1 });
      return pt;
    },
    /** Presses on a slider's thumb at `from`, drags it through `values` (each taking `ms`), lets go. */
    async drag(slider, values, ms) {
      const at = async (v) => {
        const b = await p.box(slider);
        const r = await p.eval(`(() => { const e = document.querySelector(${JSON.stringify(slider)}); return { min: +e.min, max: +e.max }; })()`);
        // The thumb is 16 px wide and travels the rest of the track.
        return { x: b.x + 8 + ((v - r.min) / (r.max - r.min)) * (b.width - 16), y: b.y + b.height / 2 };
      };
      const first = await at(values[0]);
      await api.glide(first.x, first.y, Math.min(1100, 380 + Math.hypot(first.x - st.x, first.y - st.y) * 1.1) * pace);
      await sleep(150);
      await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: first.x, y: first.y, button: 'left', buttons: 1, clickCount: 1 });
      await sleep(180);
      for (const v of values.slice(1)) {
        const pt = await at(v);
        await api.glide(pt.x, pt.y, ms, { buttons: 1, arc: 0, easing: (k) => k * k * (3 - 2 * k) });
        await sleep(160);
      }
      await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: st.x, y: st.y, button: 'left', buttons: 0, clickCount: 1 });
    },
    /** Keys one at a time. */
    async type(text, gap = 260) {
      for (const ch of text) {
        const code = /\d/.test(ch) ? `Digit${ch}` : /[a-z]/i.test(ch) ? `Key${ch.toUpperCase()}` : ch === '.' ? 'Period' : ch === '-' ? 'Minus' : ch;
        const vk = ch.toUpperCase().charCodeAt(0);
        await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk });
        await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk });
        await sleep(gap);
      }
    },
  };
  return api;
}

async function centre(p, target, at) {
  await p.waitFor(`!!(${target.startsWith('js:') ? target.slice(3) : `document.querySelector(${JSON.stringify(target)})`})`, { what: target });
  const b = await p.box(target);
  return { x: b.x + b.width * at[0], y: b.y + b.height * at[1] };
}

/**
 * A card being used: 0.6 s of stillness, `act(io)` (the pointer, `io.mark(what)` for the timeline), 1.2 s of stillness.
 * `state()` says what the card shows, for the timeline. `grow` is how much taller than when drawn the card gets.
 */
function useShot(id, { file = id, height = 1800, grow = 0, pace = 1, rest, state, act }) {
  return {
    id: `use-${file}`,
    height,
    async take(p, ctx) {
      const box = await open(p, ctx, id, { pointer: true });
      const clip = clipOf(box, grow);
      const mouse = pointerOf(p, rest(box), pace);
      // The pointer shows from its first move.
      await mouse.glide(mouse.st.x + 0.5, mouse.st.y, 16);
      const dir = path.join(TMP, `use-${file}`);
      const rec = await record(p, dir, clip);
      await sleep(80);
      const timeline = [];
      let top = box.height;
      const mark = async (what) => {
        const t = Date.now();
        const b = await p.box(`.aui[data-ui="${id}"]`);
        top = Math.max(top, b.height);
        timeline.push({ t, what, shows: await state(p) });
      };
      await sleep(600);
      await mark('still');
      await act({ p, mouse, mark, box });
      await sleep(1200);
      await mark('end');
      const { frames, raw, seconds } = await rec.stop();
      const t0 = frames[0].t;
      const t1 = timeline.at(-1).t;
      const lines = timeline.map((x) => `${((x.t - t0) / 1000).toFixed(1).padStart(5)} s  ${x.what}${x.shows ? `  [${x.shows}]` : ''}`);
      fs.mkdirSync(KEEP, { recursive: true });
      fs.writeFileSync(path.join(KEEP, `use-${file}.timeline.txt`), `${lines.join('\n')}\n`);
      console.log(lines.map((l) => `  ${l}`).join('\n'));
      const grown = clip.y + clip.height - PAD - (box.y + top);
      console.log(`  ${id}: card ${Math.round(box.width)}x${Math.round(box.height)} when drawn, up to ${Math.round(top)} tall (room left under it: ${grown.toFixed(0)} px); ${raw} screenshots in ${seconds.toFixed(1)} s (${(raw / seconds).toFixed(1)}/s)`);
      if (grown < 0) console.warn(`  ${id}: the card grew past the clip by ${-grown.toFixed(0)} px: raise grow`);
      return encode({ frames, clip, t0, t1, file: ctx.file, poster: 'first' });
    },
  };
}

/** What the recipe shows: the servings, the first amounts and the timer. */
const recipeState = (p) =>
  p.eval(`(() => {
    const c = document.querySelector('.aui[data-ui="recipe"]');
    const sv = [...c.querySelectorAll('span')].find((e) => /^\\d+ servings?$/.test(e.textContent.trim()))?.textContent.trim();
    const amounts = [...c.querySelectorAll('li')].slice(0, 3).map((l) => l.textContent.trim().replace(/\\s+/g, ' ')).join(' | ');
    const timer = [...c.querySelectorAll('span')].find((e) => /^\\d+(:\\d\\d| min)$/.test(e.textContent.trim()) && e.querySelector('button'))?.textContent.trim();
    return sv + '; ' + amounts + (timer ? '; timer ' + timer : '');
  })()`);

export const SHOTS = [
  // The post shows the weather card; streamShot('comparison') and streamShot('places', { map: true }) record the same of those two.
  streamShot('weather'),
  useShot('recipe', {
    rest: (b) => ({ x: b.x + b.width - 70, y: b.y + 90 }),
    state: recipeState,
    async act({ p, mouse, mark }) {
      const more = `.aui[data-ui="recipe"] button[aria-label="More servings"]`;
      await mouse.click(more);
      await mark('More servings');
      await sleep(1100);
      await mouse.click(more);
      await mark('More servings');
      await sleep(1300);
      await mouse.click(`.aui[data-ui="recipe"] button[aria-label="Start the timer"]`);
      await mark('Start the timer');
      await sleep(2500);
      await mark('timer counting');
    },
  }),
  useShot('decision-matrix', {
    file: 'decision',
    rest: (b) => ({ x: b.x + b.width - 170, y: b.y + 14 }),
    state: (p) =>
      p.eval(`(() => {
        const c = document.querySelector('.aui[data-ui="decision-matrix"]');
        const w = [...c.querySelectorAll('input[type=range]')].map((e) => e.value).join(',');
        const rows = [...c.querySelectorAll('[class*="space-y-1"] > div')].map((r) => r.textContent.trim().replace(/\\s+/g, ' ')).join(' > ');
        return 'weights ' + w + '; ' + rows;
      })()`),
    async act({ mouse, mark }) {
      const slider = (name) => `.aui[data-ui="decision-matrix"] input[type=range][aria-label="How much it matters: ${name}"]`;
      await mouse.drag(slider('Overlap with New York hours'), [4, 0], 2400);
      await mark('Overlap with New York hours dragged from 4 to 0');
      await sleep(1300);
      await mouse.drag(slider('Cost of living'), [5, 1], 2400);
      await mark('Cost of living dragged from 5 to 1');
    },
  }),
  useShot('practice', {
    grow: 175,
    pace: 0.75,
    rest: (b) => ({ x: b.x + b.width - 120, y: b.y + 120 }),
    state: (p) =>
      p.eval(`(() => {
        const c = document.querySelector('.aui[data-ui="practice"]');
        const t = c.innerText.replace(/\\s+/g, ' ');
        const m = (re) => (re.exec(t) ?? [''])[0];
        return [m(/Problem \\d of \\d/), 'answer "' + (c.querySelector('input[aria-label="Your answer"]')?.value ?? '') + '"', m(/Right!|Not quite\\./), m(/Hint \\d of \\d/), m(/\\d of \\d right/)].filter(Boolean).join('; ');
      })()`),
    async act({ mouse, mark }) {
      const card = '.aui[data-ui="practice"]';
      const input = `${card} input[aria-label="Your answer"]`;
      const button = (text) => `js:[...document.querySelectorAll('${card} button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})`;
      await mouse.click(input);
      await mouse.type('60', 200);
      await mark('typed 60');
      await sleep(350);
      await mouse.click(button('Check'));
      await mark('Check');
      await sleep(900);
      await mouse.click(button('Next'));
      await mark('Next');
      await sleep(450);
      await mouse.click(input);
      await mouse.type('5', 200);
      await mark('typed 5');
      await sleep(350);
      await mouse.click(button('Check'));
      await mark('Check');
      await sleep(800);
      await mouse.click(button('Show a hint'));
      await mark('Show a hint');
    },
  }),
  useShot('graph', {
    pace: 0.75,
    rest: (b) => ({ x: b.x + b.width - 60, y: b.y + 30 }),
    state: (p) => p.eval(`[...document.querySelectorAll('.aui[data-ui="graph"] input[type=range]')].map((e) => e.getAttribute('aria-label').split(' ')[0] + e.getAttribute('aria-label').replace(/^.*?(\\b[Kmr]\\b).*$/, ' $1') + ' = ' + e.value).join(', ')`),
    async act({ mouse, mark }) {
      const slider = (label) => `.aui[data-ui="graph"] input[type=range][aria-label^="${label}"]`;
      await mouse.drag(slider('Final height'), [250, 270, 261], 650);
      await mark('K dragged 250 up to 270 and back to 261');
      await sleep(350);
      await mouse.drag(slider('Half-grown'), [38, 31, 34], 650);
      await mark('m dragged 38 down to 31 and back to 34');
      await sleep(350);
      await mouse.drag(slider('Growth rate'), [0.08, 0.096, 0.088], 650);
      await mark('r dragged 0.08 up to 0.096 and back to 0.088');
    },
  }),
];
