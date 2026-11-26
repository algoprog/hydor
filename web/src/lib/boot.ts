// The logo shown while the page loads (index.html #boot: HYDΩR, a stream of bright water running through its Ω). The
// moment the app has something of its own to show, the app is there in full under the logo, which no longer takes a
// click or a key; the logo swells a little and fades as its stream runs out and its Ω stands whole, while the page
// colour around it clears. With Reduce motion, it goes at once.

const CLEAR_MS = 420;
const FADE_MS = 360;
const WHOLE_MS = 460;

export function endBoot() {
  const boot = document.getElementById('boot');
  if (!boot || 'leaving' in boot.dataset) return;
  boot.dataset.leaving = '';
  boot.removeAttribute('role');
  boot.setAttribute('aria-hidden', 'true');
  boot.style.pointerEvents = 'none';
  const logo = boot.querySelector('svg');
  if (!logo || typeof boot.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return boot.remove();
  const gone = () => boot.remove();
  // The page colour, on a layer of its own beneath the logo so that each clears at its own pace. All but opaque from
  // now, so that the app paints beneath it in its first frame, a slow one, rather than when the fade starts.
  const sky = document.createElement('div');
  sky.style.cssText = `position: absolute; inset: 0; z-index: -1; opacity: 0.99; background: ${getComputedStyle(boot).backgroundColor}`;
  boot.prepend(sky);
  boot.style.background = 'none';
  // The fade starts once frames come quickly again (or soon in any case): Safari counts a slow frame in an animation,
  // skipping that much of it. A page opened out of sight has no frames: there the logo simply goes.
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
    // Whatever becomes of the fade, the logo never stays over the app.
    setTimeout(gone, CLEAR_MS + 1500);
    try {
      const fade = fadeOut(logo, sky);
      Promise.all(fade.map((a) => a.finished)).then(gone, gone);
      // Should the frame that first draws it be a slow one after all (the app's data arriving), the fade starts from its
      // beginning rather than part way: Safari's clock would have run through that frame.
      requestAnimationFrame(() => {
        for (const a of fade) if (Number(a.currentTime ?? 0) > 50) a.currentTime = 16;
      });
    } catch {
      gone();
    }
  };
  requestAnimationFrame(wait);
}

/** The page colour clearing, and the logo swelling a little as it fades, its stream running out: the animations. */
function fadeOut(logo: SVGSVGElement, sky: HTMLElement): Animation[] {
  const run = (el: Element, frames: Keyframe[], duration: number, easing: string) => el.animate(frames, { duration, easing, fill: 'forwards' });
  const out = [
    run(sky, [{ opacity: 0.99 }, { opacity: 0 }], CLEAR_MS, 'ease-out'),
    run(logo, [{ transform: 'none', opacity: 1 }, { transform: 'scale(1.06)', opacity: 0 }], FADE_MS, 'ease-in'),
  ];
  // The stream runs out (its glow too, a group of its own under the letters), and the Ω is whole again.
  for (const stream of logo.querySelectorAll('.boot-current')) out.push(run(stream, [{ opacity: 1 }, { opacity: 0 }], WHOLE_MS / 2, 'ease-out'));
  const omega = logo.querySelector('.boot-omega');
  if (omega) out.push(run(omega, [{ opacity: 0.3 }, { opacity: 1 }], WHOLE_MS, 'ease'));
  return out;
}
