/* hydor.app: the water behind the hero, the scripted demo, and the small animations. No libraries, no trackers. */
(() => {
  'use strict';

  if (location.hostname === 'www.hydor.app') {
    location.replace('https://hydor.app' + location.pathname + location.search + location.hash);
    return;
  }

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const still = () => !motion.matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const icon = (name) => `<svg class="ic"><use href="#i-${name}"/></svg>`;
  /** Calls back each time el comes into view (or goes), and tells whether it is on screen now. */
  const watch = (el, cb, opts) => new IntersectionObserver(([e]) => cb(e.isIntersecting), opts).observe(el);

  /* ---------- The water behind the hero (WebGL) ---------- */

  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uR;
uniform float uT;
uniform vec2 uM;
float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uR;
  vec2 p = (gl_FragCoord.xy - 0.5 * uR) / uR.y;
  float t = uT * 0.045;
  vec2 q = vec2(fbm(p * 1.25 + vec2(0.0, t)), fbm(p * 1.25 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p * 1.25 + 2.6 * q + vec2(1.7, 9.2) + 0.7 * t), fbm(p * 1.25 + 2.6 * q + vec2(8.3, 2.8) - 0.6 * t));
  float f = fbm(p * 1.25 + 2.4 * r);
  float lines = pow(1.0 - abs(sin(f * 9.0 + t * 3.0)), 14.0);
  vec3 a = vec3(0.369, 0.918, 0.831);
  vec3 b = vec3(0.220, 0.741, 0.973);
  vec3 c = vec3(0.376, 0.647, 0.980);
  vec3 col = mix(a, b, smoothstep(0.2, 0.8, q.y));
  col = mix(col, c, smoothstep(0.3, 0.9, r.x));
  vec2 m = (uM - 0.5 * uR) / uR.y;
  float halo = exp(-3.5 * length(p - m));
  float depth = smoothstep(-0.1, 1.0, uv.y);
  float glow = smoothstep(0.38, 1.0, f) * 0.62 + lines * 0.2 * smoothstep(0.3, 0.75, f) + halo * 0.1;
  gl_FragColor = vec4(col * glow * (0.3 + 0.7 * depth), 1.0);
}`;

  function water(canvas) {
    let gl;
    try {
      gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'low-power' });
    } catch {
      gl = null;
    }
    if (!gl) return canvas.remove(), null;
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const prog = gl.createProgram();
    try {
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}'));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    } catch {
      return canvas.remove(), null;
    }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, 'uR');
    const uT = gl.getUniformLocation(prog, 'uT');
    const uM = gl.getUniformLocation(prog, 'uM');

    // Half resolution: it is soft light, and it keeps laptops cool.
    let w = 1;
    let h = 1;
    const size = () => {
      const r = canvas.getBoundingClientRect();
      const k = Math.min(devicePixelRatio || 1, 2) * 0.5;
      w = Math.max(1, Math.round(r.width * k));
      h = Math.max(1, Math.round(r.height * k));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      kick();
    };
    let mx = 0.5;
    let my = 0.3;
    let tx = mx;
    let ty = my;
    addEventListener(
      'pointermove',
      (e) => {
        const r = canvas.getBoundingClientRect();
        tx = (e.clientX - r.left) / r.width;
        ty = (e.clientY - r.top) / r.height;
      },
      { passive: true },
    );
    let onScreen = true;
    let raf = 0;
    let last = 0;
    const t0 = performance.now() - 20000;
    const frame = (now) => {
      raf = 0;
      if (now - last > 15) {
        last = now;
        mx += (tx - mx) * 0.05;
        my += (ty - my) * 0.05;
        gl.uniform2f(uR, w, h);
        gl.uniform1f(uT, (still() ? 26000 : now - t0) / 1000);
        gl.uniform2f(uM, mx * w, (1 - my) * h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        canvas.classList.add('on');
      }
      if (onScreen && !document.hidden && !still()) raf = requestAnimationFrame(frame);
    };
    function kick() {
      if (!raf) raf = requestAnimationFrame(frame);
    }
    new ResizeObserver(size).observe(canvas);
    watch(canvas, (v) => {
      onScreen = v;
      if (v) kick();
    });
    document.addEventListener('visibilitychange', kick);
    motion.addEventListener?.('change', kick);
    size();
    return gl;
  }

  /* ---------- Which download to offer ---------- */

  const RELEASE = 'https://github.com/algoprog/hydor/releases/latest/download';
  const DMG = {
    arm: `${RELEASE}/Hydor-arm64-mac.dmg`,
    x64: `${RELEASE}/Hydor-x64-mac.dmg`,
  };
  const EXE = `${RELEASE}/Hydor-x64-win.exe`;
  /** The Linux app: the .deb (Ubuntu, Debian) or the AppImage (any other), for x64 or ARM. */
  const LINUX = (kind, arch) => `${RELEASE}/Hydor-${arch}-linux.${kind === 'deb' ? 'deb' : 'AppImage'}`;

  function platform() {
    const ua = navigator.userAgent;
    const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/iPhone|iPad|iPod|Android/i.test(ua) || (/Mac/i.test(p + ua) && navigator.maxTouchPoints > 1)) return 'phone';
    if (/Mac/i.test(p) || /Mac OS X/.test(ua)) return 'mac';
    if (/Win/i.test(p + ua)) return 'windows';
    if (/Linux|X11|CrOS/i.test(p + ua)) return 'linux';
    return 'other';
  }

  /** Apple silicon or Intel: Chromium says; elsewhere an Intel or AMD graphics chip gives an Intel Mac away. */
  async function macArch(gl) {
    try {
      const v = await navigator.userAgentData?.getHighEntropyValues?.(['architecture']);
      if (v?.architecture === 'x86') return 'x64';
      if (v?.architecture === 'arm') return 'arm';
    } catch {}
    try {
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? gl.getParameter(gl.RENDERER) : '');
      if (/Intel|AMD|Radeon|NVIDIA/i.test(gpu)) return 'x64';
    } catch {}
    return 'arm';
  }

  /**
   * A Linux computer's build: ARM or x64 (Chromium says; the user agent names aarch64), and the .deb where the user
   * agent names Ubuntu or Debian (Firefox there does), else the AppImage, which runs on any.
   */
  async function linuxBuild() {
    const ua = navigator.userAgent;
    let arch = /aarch64|arm64|armv8/i.test(ua) ? 'arm64' : 'x64';
    try {
      const v = await navigator.userAgentData?.getHighEntropyValues?.(['architecture']);
      if (v?.architecture === 'arm') arch = 'arm64';
      else if (v?.architecture === 'x86') arch = 'x64';
    } catch {}
    return { arch, kind: /Ubuntu|Debian|Mint|Pop!_OS|elementary/i.test(ua) ? 'deb' : 'appimage' };
  }

  function flash(sel) {
    const el = $(sel);
    if (!el) return;
    el.classList.remove('flash');
    setTimeout(() => el.classList.add('flash'), 450);
    setTimeout(() => el.classList.remove('flash'), 2400);
  }

  async function downloads(gl) {
    const where = platform();
    const arch = where === 'mac' ? await macArch(gl) : 'arm';
    const linux = where === 'linux' ? await linuxBuild() : null;
    const label = { mac: 'Download for Mac', windows: 'Download for Windows', linux: 'Download for Linux', phone: 'Get it for your computer', other: 'Get Hydor' }[where];
    const href = { mac: DMG[arch], windows: EXE, linux: linux && LINUX(linux.kind, linux.arch) }[where];
    for (const a of $$('[data-get]')) {
      $('[data-get-label]', a).textContent = label;
      a.href = href || '#download';
      if (!href) a.addEventListener('click', () => flash('#get-mac'));
    }
    const note = $('[data-get-note]');
    if (note) {
      const other = linux && (linux.kind === 'deb' ? 'appimage' : 'deb');
      const notes = {
        windows: 'Free and open source · Windows 10 or 11, with <a href="https://git-scm.com/download/win">Git for Windows</a> · <a href="#get-mac">Mac</a> · <a href="#get-linux">Linux</a>',
        linux:
          linux &&
          `Free and open source · ${linux.kind === 'deb' ? 'The .deb, for Ubuntu and Debian' : 'The AppImage, for any Linux'}, ${linux.arch === 'arm64' ? 'ARM' : 'x64'} · <a href="${LINUX(other, linux.arch)}">${other === 'deb' ? '.deb' : 'AppImage'}</a> · <a href="#get-server">Linux server</a>`,
        phone: 'Free and open source · It runs on a computer, and you use it from your phone',
      };
      if (where === 'mac' && arch === 'x64')
        note.innerHTML = `Free and open source · macOS 12 or newer, Intel · <a href="${DMG.arm}">Apple silicon</a> · <a href="#download">Windows and Linux</a>`;
      else if (notes[where]) note.innerHTML = notes[where];
    }
    if (where === 'mac' && arch === 'x64') {
      // The Intel button first and filled in on the Mac card.
      const arm = $('[data-mac="arm"]');
      const x64 = $('[data-mac="x64"]');
      if (arm && x64) {
        arm.classList.replace('btn-primary', 'btn-ghost');
        x64.classList.replace('btn-ghost', 'btn-primary');
        x64.parentNode.insertBefore(x64, arm);
      }
    }
    if (linux) {
      // The Linux card: this computer's processor, and its kind of build first and filled in.
      const deb = $('[data-linux="deb"]');
      const img = $('[data-linux="appimage"]');
      const fine = $('[data-linux-note]');
      if (deb && img) {
        deb.href = LINUX('deb', linux.arch);
        img.href = LINUX('appimage', linux.arch);
        if (linux.kind === 'appimage') {
          deb.classList.replace('btn-primary', 'btn-ghost');
          img.classList.replace('btn-ghost', 'btn-primary');
          img.parentNode.insertBefore(img, deb);
        }
      }
      if (fine && linux.arch === 'arm64')
        fine.innerHTML = `ARM. For x64: <a href="${LINUX('deb', 'x64')}">.deb</a> · <a href="${LINUX('appimage', 'x64')}">AppImage</a>. A system from 2022 or later: Ubuntu 22.04, Debian 12, Fedora 36.`;
    }
  }

  /* ---------- The header ---------- */

  function header() {
    const nav = $('[data-nav]');
    const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const btn = $('[data-menu]');
    const sheet = $('#nav-sheet');
    const set = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      sheet.hidden = !open;
      nav.classList.toggle('menu-open', open);
    };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    sheet.addEventListener('click', (e) => e.target.closest('a') && set(false));
    addEventListener('keydown', (e) => e.key === 'Escape' && set(false));
    // The wordmark in the bar comes in once the big one at the top of the page has gone by.
    const mark = $('[data-hero-mark]');
    if (mark) watch(mark, (v) => nav.classList.toggle('show-brand', !v), { rootMargin: `-${64}px 0px 0px 0px` });
    else nav.classList.add('show-brand');
  }

  /* ---------- Things that come in as you scroll ---------- */

  function reveals() {
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    $$('.reveal, [data-fill-on-view]').forEach((el) => io.observe(el));
  }

  /* ---------- The app's window in the hero: tilted back, flattening as you scroll ---------- */

  function stage() {
    const el = $('[data-tilt]');
    if (!el || still()) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const sp = clamp((innerHeight * 0.85 - r.top) / (innerHeight * 0.6));
      el.style.setProperty('--rx', `${((1 - sp) * 12).toFixed(2)}deg`);
      el.style.setProperty('--s', (0.96 + sp * 0.04).toFixed(3));
    };
    const queue = () => raf || (raf = requestAnimationFrame(apply));
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    apply();
  }

  /* ---------- The scripted demo ---------- */

  const DIFF = [
    [' ', 'export function total(items: Item[], discount = 0) {'],
    ['-', '  const lines = items.map((i) => round(i.price * (1 + TAX)));'],
    ['-', '  const subtotal = sum(lines);'],
    ['-', '  return subtotal - discount;'],
    ['+', '  const net = sum(items.map((i) => i.price)) - discount;'],
    ['+', '  return round(net * (1 + TAX));'],
    [' ', '}'],
  ];

  const SCENARIOS = {
    bug: {
      title: 'Fix the checkout tests',
      meta: '~/code/shop-api · main · Opus 5.5',
      chip: 'Coder · Opus 5.5 · High',
      steps: [
        ['user', "The checkout tests fail since yesterday's discount change. Find out why and fix it."],
        ['say', "I'll run the checkout tests first to see what fails."],
        ['tool', 'terminal', 'Ran 1 command, read 1 file', '2.4 s', 1300],
        ['say', "Two problems in <code>total()</code>: tax is added to each line before the discount, and every line is rounded on its own. I'll apply the discount first and round once, at the end."],
        ['diff', 'src/checkout/total.ts', 2, 3, DIFF],
        ['say', 'Running the whole suite to make sure nothing else broke.'],
        ['approve', 'Run a command', 'Run the whole test suite', '<span class="k">npm</span> <span class="v">test</span>', 'Always allow npm test'],
        ['tool', 'terminal', 'Ran the whole test suite <code>npm test</code>', '48 passed', 1900, 'ok'],
        ['say', '<b>Fixed.</b> The discount now comes off before tax, and the total is rounded once. Both checkout tests pass, and so do the other 46.'],
        ['done'],
      ],
    },
    research: {
      title: 'Find the best e-bike for a hilly commute',
      meta: '~/Hydor/Tasks/2026-11-04-e-bikes · Opus 5.5',
      chip: 'Researcher · Opus 5.5',
      steps: [
        ['user', 'Find the best e-bike under $2,000 for my hilly commute: 9 km each way, with two steep hills.'],
        ['say', "I'll look for recent reviews of commuter e-bikes that climb well, then compare the best few."],
        ['search', '“best commuter e-bike under $2,000 for steep hills”', '5 results'],
        ['tool', 'book', 'Read <span class="t-name">Velora Ridge E5 review</span>', '6.3 s', 1100],
        ['tool', 'book', 'Read <span class="t-name">The best electric bikes for hills, tested</span>', '6.6 s', 1100],
        ['file', 'e-bikes-compared.xlsx', 'Excel workbook · 17.6 KB', 'Five e-bikes side by side: price, motor, battery and how each did on the test climb'],
        ['say', "<b>The Velora Ridge E5 ($1,890) is the best fit for your commute.</b> Its mid-drive motor uses the bike's gears, so it keeps its pull on steep hills, where hub-motor bikes slow down."],
        [
          'table',
          ['', 'Price', 'Motor', 'On a 12% climb'],
          [
            ['Velora Ridge E5', '$1,890', '85 Nm mid-drive', '17–18 km/h'],
            ['Urbana Climb 2', '$1,749', '75 Nm mid-drive', '15 km/h'],
            ['Commuter Pro 3', '$1,599', '50 Nm hub', '11 km/h'],
          ],
        ],
        [
          'sources',
          [
            ['Velora Ridge E5 review', '#6fd39a'],
            ['The best electric bikes for hills, tested', '#f2b468'],
            ['Mid-drive or hub motor?', '#8aa8ff'],
          ],
        ],
        ['done'],
      ],
    },
    trip: {
      title: 'Plan 4 days in Lisbon',
      meta: '~/Hydor/Tasks/2026-11-04-lisbon-in-may · Opus 5.5',
      chip: 'General · Opus 5.5 · High',
      steps: [
        ['user', 'Plan 4 days in Lisbon, 11 to 14 May: two adults, mid-range hotels, lots of walking.'],
        ['say', "Your Trip planner app does just this. I'll run it with your dates."],
        ['app', 'Trip planner', 'Lisbon · 11–14 May · 2 adults'],
        ['tool', 'globe', 'Checked opening hours, events and travel times', '41 s', 1300],
        ['trip'],
        ['say', 'Here is your plan, checked against your dates. <b>Book the Sintra train and the Pena Palace tickets ahead</b>: May is busy.'],
        ['done'],
      ],
    },
  };

  const TRIP = `
    <div class="d-trip-tabs"><span>Your trip</span><span>Day by day</span><span class="on">Map</span><span>Book ahead</span><span>Budget</span></div>
    <div class="d-trip-body">
      <svg class="d-map" viewBox="0 0 320 200" role="img" aria-label="A map of Lisbon with each day's area">
        <defs><pattern id="streets" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(8)"><path d="M22 0H0V22" fill="none" stroke="rgba(255,255,255,.05)"/></pattern></defs>
        <rect width="320" height="200" fill="url(#streets)"/>
        <ellipse cx="128" cy="42" rx="30" ry="15" fill="rgba(74,222,128,.13)"/>
        <ellipse cx="248" cy="40" rx="24" ry="11" fill="rgba(74,222,128,.13)"/>
        <ellipse cx="148" cy="112" rx="20" ry="11" fill="rgba(74,222,128,.1)"/>
        <path d="M0 168C70 156 130 176 200 160S290 150 320 154V200H0Z" fill="#0f2a40"/>
        <text x="276" y="186" fill="rgba(255,255,255,.35)" font-size="10" font-style="italic">Tagus</text>
        <path class="route" d="M232 112C190 120 140 132 92 146C64 120 50 84 46 46"/>
        <g class="pin"><circle cx="232" cy="112" r="10" fill="#8aa8ff"/><text x="232" y="116" text-anchor="middle" font-size="11" font-weight="700" fill="#0b1226">1</text><text x="248" y="116" font-size="11" fill="#e9edf5">Alfama</text></g>
        <g class="pin"><circle cx="92" cy="146" r="10" fill="#8aa8ff"/><text x="92" y="150" text-anchor="middle" font-size="11" font-weight="700" fill="#0b1226">2</text><text x="108" y="150" font-size="11" fill="#e9edf5">Belém</text></g>
        <g class="pin"><circle cx="46" cy="46" r="10" fill="#8aa8ff"/><text x="46" y="50" text-anchor="middle" font-size="11" font-weight="700" fill="#0b1226">3</text><text x="62" y="50" font-size="11" fill="#e9edf5">Sintra</text></g>
        <g class="pin"><circle cx="214" cy="78" r="10" fill="#8aa8ff"/><text x="214" y="82" text-anchor="middle" font-size="11" font-weight="700" fill="#0b1226">4</text><text x="230" y="82" font-size="11" fill="#e9edf5">Graça</text></g>
      </svg>
      <ol class="d-days">
        <li><i>1</i><span><b>Tuesday 11 May</b>Alfama and the castle</span></li>
        <li><i>2</i><span><b>Wednesday 12 May</b>Belém by the river</span></li>
        <li><i>3</i><span><b>Thursday 13 May</b>A day in Sintra</span></li>
        <li><i>4</i><span><b>Friday 14 May</b>Viewpoints and fado</span></li>
      </ol>
    </div>`;

  function demo() {
    const root = $('[data-demo]');
    if (!root) return;
    const tabs = $$('[data-scenario]', root);
    const panel = $('#demo-panel');
    const win = $('.demo-window', root);
    const body = $('[data-demo-body]', root);
    const typed = $('[data-demo-typed]', root);
    const placeholder = typed.innerHTML;
    const send = $('.demo-send', root);
    const title = $('[data-demo-title]', root);
    const meta = $('[data-demo-meta]', root);
    const status = $('[data-demo-status]', root);
    const chip = $('[data-demo-assistant]', root);
    const feed = document.createElement('div');
    feed.className = 'demo-feed';
    body.append(feed);
    const cursor = document.createElement('div');
    cursor.className = 'demo-cursor';
    cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 2.5 19.5 12l-6.6 1.4L9.6 20z"/></svg>';
    win.append(cursor);

    // The newest line stays in view: the feed slides up as it grows, like a chat.
    const follow = () => {
      const over = feed.offsetHeight - body.clientHeight;
      feed.style.transform = over > 0 ? `translateY(${-over}px)` : '';
    };
    new ResizeObserver(follow).observe(feed);

    const CANCEL = {};
    let run = 0;
    let inView = false;
    let started = false;
    const wait = async (id, ms) => {
      if (id !== run) throw CANCEL;
      if (!still()) await sleep(ms);
      if (id !== run) throw CANCEL;
    };
    const setStatus = (state) => {
      status.dataset.state = state;
      status.textContent = { working: 'Working', needs: 'Needs you', ready: 'Ready' }[state];
    };
    const add = (cls, html) => {
      const el = document.createElement('div');
      el.className = `d-item ${cls}`;
      el.innerHTML = html;
      feed.append(el);
      return el;
    };

    /** Shows a reply word by word (a code span as one word), as it streams in the app. */
    const words = (el) => {
      const out = [];
      const walk = (node) => {
        for (const child of Array.from(node.childNodes)) {
          if (child.nodeType === 3) {
            const frag = document.createDocumentFragment();
            for (const part of child.textContent.split(/(\s+)/)) {
              if (!part) continue;
              if (/^\s+$/.test(part)) frag.append(part);
              else {
                const s = document.createElement('span');
                s.className = 'w';
                s.textContent = part;
                frag.append(s);
                out.push(s);
              }
            }
            child.replaceWith(frag);
          } else if (child.nodeName === 'CODE') {
            child.classList.add('w');
            out.push(child);
          } else if (child.nodeType === 1) walk(child);
        }
      };
      walk(el);
      return out;
    };

    async function stream(id, el) {
      for (const w of words(el)) {
        w.classList.add('on');
        await wait(id, 24);
      }
    }

    async function type(id, text) {
      typed.textContent = '';
      const span = document.createElement('span');
      const caret = document.createElement('i');
      caret.className = 'caret';
      typed.append(span, caret);
      if (still()) span.textContent = text;
      else
        for (let i = 1; i <= text.length; i++) {
          span.textContent = text.slice(0, i);
          await wait(id, 11 + Math.random() * 16);
        }
      await wait(id, 380);
      send.classList.add('press');
      await wait(id, 160);
      send.classList.remove('press');
      typed.innerHTML = placeholder;
    }

    async function point(id, target) {
      if (still()) return;
      const wr = win.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      if (!cursor.classList.contains('show')) {
        cursor.classList.add('instant');
        cursor.style.left = `${wr.width * 0.72}px`;
        cursor.style.top = `${wr.height - 30}px`;
        void cursor.offsetWidth;
        cursor.classList.remove('instant');
        cursor.classList.add('show');
        await wait(id, 60);
      }
      cursor.style.left = `${tr.left - wr.left + tr.width * 0.42}px`;
      cursor.style.top = `${tr.top - wr.top + tr.height * 0.5}px`;
      await wait(id, 950);
      cursor.classList.add('click');
      await wait(id, 140);
      cursor.classList.remove('click');
    }

    async function step(id, [kind, ...a]) {
      if (kind === 'user') {
        await type(id, a[0]);
        add('d-user', esc(a[0]));
        setStatus('working');
        await wait(id, 800);
      } else if (kind === 'say') {
        const el = add('d-say', a[0]);
        await stream(id, el);
        await wait(id, 500);
      } else if (kind === 'tool' || kind === 'search' || kind === 'app') {
        const [ic, label, done, ms, cls] =
          kind === 'search'
            ? ['globe', `<span>Searched the web</span><span class="t-name q">${esc(a[0])}</span>`, a[1], 1400]
            : kind === 'app'
              ? ['apps', `<span>Ran</span><span class="t-name">${a[0]}</span><span class="d-app-args">${a[1]}</span>`, 'Done', 1700]
              : [a[0], `<span class="t-name">${a[1]}</span>`, a[2], a[3], a[4]];
        const el = add(kind === 'app' ? 'd-app' : 'd-tool', `${icon(ic)}${label}<span class="t-meta"><i class="spin"></i></span>`);
        await wait(id, ms || 1100);
        $('.t-meta', el).textContent = done;
        if (cls) el.classList.add(cls);
        await wait(id, 320);
      } else if (kind === 'diff') {
        const [file, plus, minus, lines] = a;
        const el = add(
          'd-diff',
          `<div class="d-diff-head">${icon('sheet')}<span>Edited</span><span class="t-name">${file}</span><span class="t-meta"><b class="add">+${plus}</b><b class="del">−${minus}</b></span></div>` +
            `<pre>${lines.map(([k, t]) => `<span class="l pre${k === '+' ? ' a' : k === '-' ? ' d' : ''}">${esc(t)}</span>`).join('')}</pre>`,
        );
        for (const l of $$('.l', el)) {
          l.classList.remove('pre');
          await wait(id, 110);
        }
        await wait(id, 600);
      } else if (kind === 'approve') {
        setStatus('needs');
        const el = add(
          'd-approve',
          `<div class="d-approve-head">${icon('shield')}${a[0]}<span>waiting 0 s</span></div>` +
            `<pre><span class="c"># ${a[1]}</span>\n${a[2]}</pre>` +
            `<div class="d-btns"><span class="d-btn allow">Allow</span><span class="d-btn">${a[3]}</span><span class="d-btn deny">Deny…</span></div>`,
        );
        const clock = $('.d-approve-head span', el);
        let secs = 0;
        const tick = setInterval(() => (clock.textContent = `waiting ${++secs} s`), 1000);
        try {
          await wait(id, 1700);
          const allow = $('.allow', el);
          await point(id, allow);
          allow.classList.add('press');
          await wait(id, 220);
        } finally {
          clearInterval(tick);
          cursor.classList.remove('show');
        }
        el.classList.add('gone');
        await wait(id, 320);
        el.remove();
        setStatus('working');
      } else if (kind === 'file') {
        add('d-file', `<span class="d-file-ic">${icon('sheet')}</span><div><b>${a[0]}</b><span>${a[1]}</span><p>${a[2]}</p></div><span class="open">Open</span>`);
        await wait(id, 800);
      } else if (kind === 'table') {
        const [head, rows] = a;
        const el = add(
          'd-table',
          `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
            .map((r, i) => `<tr class="pre${i === 0 ? ' win' : ''}">${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`,
        );
        for (const tr of $$('tbody tr', el)) {
          tr.classList.remove('pre');
          await wait(id, 170);
        }
        await wait(id, 400);
      } else if (kind === 'sources') {
        add('d-sources', `<span>Sources</span>${a[0].map(([t, c], i) => `<span class="d-src"><i style="--c: ${c}"></i><b>${i + 1}</b>${t}</span>`).join('')}`);
        await wait(id, 600);
      } else if (kind === 'trip') {
        const el = add('d-trip', TRIP);
        await wait(id, 120);
        el.classList.add('draw');
        await wait(id, 2600);
      } else if (kind === 'done') setStatus('ready');
    }

    async function play(name, { auto = true } = {}) {
      const id = ++run;
      const sc = SCENARIOS[name];
      for (const t of tabs) {
        const on = t.dataset.scenario === name;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        t.style.setProperty('--p', '0');
      }
      panel.setAttribute('aria-labelledby', `tab-${name}`);
      const tab = tabs.find((t) => t.dataset.scenario === name);
      feed.textContent = '';
      feed.style.transform = '';
      cursor.classList.remove('show');
      typed.innerHTML = placeholder;
      title.textContent = sc.title;
      meta.textContent = sc.meta;
      chip.textContent = sc.chip;
      setStatus('ready');
      try {
        await wait(id, 500);
        for (let i = 0; i < sc.steps.length; i++) {
          await step(id, sc.steps[i]);
          tab.style.setProperty('--p', String((i + 1) / sc.steps.length));
        }
        if (still() || !auto) return;
        await wait(id, 6500);
        while (!inView || document.hidden) await wait(id, 500);
        const order = Object.keys(SCENARIOS);
        play(order[(order.indexOf(name) + 1) % order.length]);
      } catch (e) {
        if (e !== CANCEL) throw e;
      }
    }

    tabs.forEach((t, i) => {
      t.addEventListener('click', () => {
        started = true;
        play(t.dataset.scenario);
      });
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const next = tabs[(i + d + tabs.length) % tabs.length];
        next.focus();
        next.click();
      });
    });
    watch(
      win,
      (v) => {
        inView = v;
        if (v && !started) {
          started = true;
          play('bug');
        }
      },
      { threshold: 0.35 },
    );
  }

  /* ---------- Memory, found by what it means: a question with none of a note's words still finds it ---------- */

  function memory() {
    const mem = $('[data-mem]');
    if (mem) {
      const q = $('[data-mem-q]', mem);
      const notes = $$('li', mem);
      const asks = [
        ['what should I cook tonight?', 'food'],
        ['how do we take card payments?', 'work'],
        ['taxi or on foot to the castle?', 'trip'],
        ['which e-bike should I get?', 'style'],
      ];
      const hit = (k) => notes.forEach((n) => n.classList.toggle('hit', n.dataset.k === k));
      if (still()) {
        q.textContent = asks[0][0];
        hit(asks[0][1]);
      } else {
        let on = false;
        watch(mem, (v) => (on = v));
        (async () => {
          for (let k = 0; ; k++) {
            while (!on || document.hidden) await sleep(400);
            const [text, key] = asks[k % asks.length];
            hit('');
            for (let i = 1; i <= text.length; i++) {
              q.textContent = text.slice(0, i);
              await sleep(40 + Math.random() * 45);
            }
            await sleep(380);
            hit(key);
            await sleep(2800);
            for (let i = text.length; i >= 0; i -= 2) {
              q.textContent = text.slice(0, i);
              await sleep(12);
            }
          }
        })();
      }
    }
  }

  /* ---------- The phone: a notification comes in, you answer it or open the session ---------- */

  function phone() {
    const ph = $('[data-phone]');
    if (!ph) return;
    const [n1, n2] = [$('.note-1', ph), $('.note-2', ph)];
    const yes = $('.nb-yes', ph);
    const date = $('[data-lock-date]', ph);
    date.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    if (still()) {
      n1.classList.add('show');
      n2.classList.add('show');
      return;
    }
    let on = false;
    watch(ph, (v) => (on = v), { threshold: 0.3 });
    (async () => {
      for (let round = 0; ; round++) {
        while (!on || document.hidden) await sleep(400);
        ph.classList.remove('open');
        n1.classList.remove('show', 'done');
        n2.classList.remove('show');
        await sleep(1100);
        n2.classList.add('show');
        await sleep(1500);
        n1.classList.add('show');
        await sleep(2300);
        if (round % 2 === 0) {
          // Approve right on the notification.
          yes.classList.add('press');
          await sleep(220);
          yes.classList.remove('press');
          n1.classList.add('done');
          await sleep(3200);
        } else {
          // Or tap it, and the session opens where it waits for you.
          const card = $('.note-card', n1);
          card.classList.add('tap');
          await sleep(380);
          card.classList.remove('tap');
          ph.classList.add('open');
          await sleep(4600);
        }
      }
    })();
  }

  /* ---------- Copy buttons ---------- */

  function copies() {
    for (const b of $$('[data-copy]'))
      b.addEventListener('click', async () => {
        const code = $('code', b.closest('[data-copy-wrap]'));
        try {
          await navigator.clipboard.writeText(code.textContent);
        } catch {
          const r = document.createRange();
          r.selectNodeContents(code);
          const s = getSelection();
          s.removeAllRanges();
          s.addRange(r);
          document.execCommand('copy');
          s.removeAllRanges();
        }
        const label = $('span', b);
        b.classList.add('done');
        label.textContent = 'Copied';
        setTimeout(() => {
          b.classList.remove('done');
          label.textContent = 'Copy';
        }, 1800);
      });
  }

  /* ---------- The tour film ---------- */

  function tour() {
    const dlg = $('[data-tour-dialog]');
    const vid = $('[data-tour-video]');
    if (!dlg) return;
    for (const b of $$('[data-tour]'))
      b.addEventListener('click', () => {
        if (typeof dlg.showModal !== 'function') return void (location.href = 'media/hydor-tour.mp4');
        dlg.showModal();
        vid.play().catch(() => {});
      });
    $('[data-tour-close]').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
    dlg.addEventListener('close', () => vid.pause());
  }

  const gl = (() => {
    const c = $('[data-water]');
    return c ? water(c) : null;
  })();
  header();
  reveals();
  stage();
  demo();
  memory();
  phone();
  copies();
  tour();
  downloads(gl);
})();
