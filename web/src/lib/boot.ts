// The logo shown while the page loads (index.html #boot: HYDΩR, its Ω filling with water). The moment the app has
// something of its own to show, the app is there in full under the logo, which no longer takes a click or a key, and
// the logo goes home. With the app's own wordmark in sight (the sidebar's, the sign-in page's: Wordmark `landing`), it
// shrinks into its place as the water drains from its Ω, while the page colour around it clears; with none in sight (a
// phone, whose sidebar is shut), it swells a little and clears with it. With Reduce motion, it goes at once.

const FLIGHT_MS = 500;
const CLEAR_MS = 420;
const DRAIN_MS = 460;

export function endBoot() {
  const boot = document.getElementById('boot');
  if (!boot || 'leaving' in boot.dataset) return;
  boot.dataset.leaving = '';
  boot.removeAttribute('role');
  boot.setAttribute('aria-hidden', 'true');
  boot.style.pointerEvents = 'none';
  const logo = boot.querySelector('svg');
  if (!logo || typeof boot.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return boot.remove();
  const gone = () => {
    document.documentElement.classList.remove('boot-landing');
    boot.remove();
  };
  // The page colour, on a layer of its own beneath the logo so that it can clear while the logo stays whole. All but
  // opaque from now, so that the app paints beneath it in its first frame, a slow one, rather than when the logo moves.
  const sky = document.createElement('div');
  sky.style.cssText = `position: absolute; inset: 0; z-index: -1; opacity: 0.99; background: ${getComputedStyle(boot).backgroundColor}`;
  boot.prepend(sky);
  boot.style.background = 'none';
  // The logo sets off once frames come quickly again (or soon in any case): Safari counts a slow frame in the motion,
  // skipping that much of it. A page opened out of sight has no frames: there it simply goes.
  const unseen = setTimeout(gone, 3000);
  const began = performance.now();
  let last = began;
  let frames = 0;
  const wait = (now: number) => {
    const quick = now - last < 50;
    last = now;
    if (!boot.isConnected) return clearTimeout(unseen);
    if (!((++frames >= 2 && quick) || now - began > 500)) return void requestAnimationFrame(wait);
    clearTimeout(unseen);
    // Whatever becomes of the motion, the logo never stays over the app.
    setTimeout(gone, FLIGHT_MS + 1500);
    try {
      const motion = goHome(logo, sky);
      Promise.all(motion.map((a) => a.finished)).then(gone, gone);
      // Should the frame that first draws it be a slow one after all (the app's data arriving), the motion starts
      // from its beginning rather than part way: Safari's clock would have run through that frame.
      requestAnimationFrame(() => {
        for (const a of motion) if (Number(a.currentTime ?? 0) > 50) a.currentTime = 16;
      });
    } catch {
      gone();
    }
  };
  requestAnimationFrame(wait);
}

/** Sets the logo off, and the page colour around it clearing: the animations, which end with it home. */
function goHome(logo: SVGSVGElement, sky: HTMLElement): Animation[] {
  const run = (el: Element, frames: Keyframe[], duration: number, easing: string) => el.animate(frames, { duration, easing, fill: 'forwards' });
  const out = [run(sky, [{ opacity: 0.99 }, { opacity: 0 }], CLEAR_MS, 'ease-out')];
  // The water drains from where it has risen to, its waves held still, and the Ω is whole: as the app's own is at rest.
  const water = logo.querySelector<SVGGElement>('.boot-fill');
  if (water) {
    const level = getComputedStyle(water).transform;
    water.style.animation = 'none';
    for (const g of water.querySelectorAll<SVGGElement>('g')) g.style.animationPlayState = 'paused';
    out.push(run(water, [{ transform: level }, { transform: 'translateY(112px)' }], DRAIN_MS, 'cubic-bezier(0.55, 0, 0.75, 0.25)'));
  }
  const omega = logo.querySelector('.boot-omega');
  if (omega) out.push(run(omega, [{ opacity: 0.3 }, { opacity: 1 }], DRAIN_MS, 'ease'));
  const home = landing();
  if (home) {
    const a = logo.getBoundingClientRect();
    const b = home.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    // The wordmark it lands on waits for it (index.html), and shows in the frame the logo goes.
    document.documentElement.classList.add('boot-landing');
    out.push(run(logo, [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${b.width / a.width})` }], FLIGHT_MS, 'cubic-bezier(0.4, 0, 0.2, 1)'));
  } else {
    out.push(run(logo, [{ transform: 'none', opacity: 1 }, { transform: 'scale(1.06)', opacity: 0 }], CLEAR_MS - 60, 'ease-in'));
  }
  return out;
}

/** The app's own wordmark the logo lands on (Wordmark `landing`), when one is in sight. */
function landing(): Element | null {
  for (const el of document.querySelectorAll('svg[data-landing]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight) return el;
  }
  return null;
}
