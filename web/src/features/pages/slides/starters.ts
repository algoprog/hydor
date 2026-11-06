// Ready-made pages to start a custom code part from: each small, working as it is, and drawn in the deck's colours
// and fonts (the CSS variables the slide gives its frame: --n-bg, --n-fg, --n-accent, --n-c1 to --n-c6, --n-font…).
// The first is what a new custom code part starts as.

export interface Starter {
  id: string;
  /** Its name in the editor's list. */
  label: string;
  html: string;
  /** It takes clicks in the slideshow (it has something to press). */
  interactive: boolean;
}

const counter = `<main>
  <p>Clicked <b id="count">0</b> times</p>
  <button id="add">Click me</button>
</main>
<style>
  html, body { margin: 0; height: 100%; }
  body { display: grid; place-items: center; font: 600 40px var(--n-font); color: var(--n-fg); }
  main { text-align: center; }
  p { margin: 0 0 20px; }
  b { color: var(--n-accent); }
  button { font: inherit; font-size: 30px; padding: 14px 36px; border: 0; border-radius: 999px; background: var(--n-accent); color: var(--n-accent-fg); cursor: pointer; }
  button:active { transform: scale(0.96); }
</style>
<script>
  let n = 0;
  const shown = document.getElementById('count');
  document.getElementById('add').onclick = () => (shown.textContent = ++n);
</script>`;

const timer = `<main>
  <div id="time">5:00</div>
  <button id="go">Start</button>
  <button id="reset">Again</button>
</main>
<style>
  html, body { margin: 0; height: 100%; }
  body { display: grid; place-items: center; font: 600 32px var(--n-font); color: var(--n-fg); }
  main { text-align: center; }
  #time { font-size: 150px; line-height: 1.1; color: var(--n-head); font-variant-numeric: tabular-nums; }
  #time.over { color: var(--n-accent); }
  button { font: inherit; font-size: 26px; margin: 16px 6px 0; padding: 10px 28px; border: 0; border-radius: 999px; background: var(--n-soft); color: var(--n-fg); cursor: pointer; }
  #go { background: var(--n-accent); color: var(--n-accent-fg); }
</style>
<script>
  const minutes = 5;
  let left = minutes * 60;
  let timer = null;
  const time = document.getElementById('time');
  const go = document.getElementById('go');
  const show = () => {
    time.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    time.classList.toggle('over', left === 0);
  };
  const stop = () => { clearInterval(timer); timer = null; go.textContent = 'Start'; };
  go.onclick = () => {
    if (timer) return stop();
    go.textContent = 'Pause';
    timer = setInterval(() => { left = Math.max(0, left - 1); show(); if (!left) stop(); }, 1000);
  };
  document.getElementById('reset').onclick = () => { stop(); left = minutes * 60; show(); };
</script>`;

const balls = `<canvas id="c"></canvas>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
<script>
  const c = document.getElementById('c');
  const g = c.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const colours = [1, 2, 3, 4, 5, 6].map((i) => css.getPropertyValue('--n-c' + i).trim() || '#4f7cff');
  let w = 0, h = 0;
  const size = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
  size();
  addEventListener('resize', size);
  const balls = Array.from({ length: 14 }, (_, i) => ({ x: Math.random() * w, y: Math.random() * h, r: 18 + Math.random() * 30, dx: (Math.random() - 0.5) * 6, dy: (Math.random() - 0.5) * 6, c: colours[i % colours.length] }));
  const frame = () => {
    g.clearRect(0, 0, w, h);
    for (const b of balls) {
      b.x += b.dx; b.y += b.dy;
      if (b.x < b.r || b.x > w - b.r) b.dx *= -1;
      if (b.y < b.r || b.y > h - b.r) b.dy *= -1;
      g.fillStyle = b.c;
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill();
    }
    requestAnimationFrame(frame);
  };
  frame();
</script>`;

const bars = `<div class="chart">
  <div style="--v: 45%; --c: var(--n-c1)"><span>Mon</span></div>
  <div style="--v: 70%; --c: var(--n-c2)"><span>Tue</span></div>
  <div style="--v: 55%; --c: var(--n-c3)"><span>Wed</span></div>
  <div style="--v: 90%; --c: var(--n-c4)"><span>Thu</span></div>
  <div style="--v: 65%; --c: var(--n-c5)"><span>Fri</span></div>
</div>
<style>
  html, body { margin: 0; height: 100%; }
  .chart { box-sizing: border-box; height: 100%; display: flex; align-items: flex-end; gap: 5%; padding: 4% 6% 12%; }
  .chart div { position: relative; flex: 1; height: var(--v); background: var(--c); border-radius: 14px 14px 0 0; animation: grow 1.4s cubic-bezier(.2, .8, .2, 1) both; }
  .chart div:nth-child(2) { animation-delay: .12s; }
  .chart div:nth-child(3) { animation-delay: .24s; }
  .chart div:nth-child(4) { animation-delay: .36s; }
  .chart div:nth-child(5) { animation-delay: .48s; }
  span { position: absolute; top: 100%; left: 0; right: 0; margin-top: 12px; text-align: center; font: 26px var(--n-font); color: var(--n-muted); }
  @keyframes grow { from { height: 0; } }
</style>`;

export const STARTERS: Starter[] = [
  { id: 'counter', label: 'A button that counts', html: counter, interactive: true },
  { id: 'timer', label: 'A countdown timer', html: timer, interactive: true },
  { id: 'balls', label: 'Bouncing balls', html: balls, interactive: false },
  { id: 'bars', label: 'Bars that grow', html: bars, interactive: false },
];
