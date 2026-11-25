/* The style guide draft's figure: a sequence with fig.wait, a hand-made loop with fig.loop, buttons that say their
   state, and the final state at once under reduced motion. */
(() => {
  'use strict';

  const STEPS = ['Step 1: write the post.', 'Step 2: build it with --posts.', 'Step 3: look at it on a phone and on a desktop.', 'Step 4: fix what looks wrong.'];
  const SPEED = { slow: 1.6, normal: 1, fast: 0.55 };

  HydorBlog.figure('_style-guide-demo', (el, fig) => {
    const steps = [...el.querySelectorAll('.sg-steps li')];
    const dot = el.querySelector('.sg-dot');
    const read = el.querySelector('[data-readout]');
    const buttons = [...el.querySelectorAll('[data-speed]')];
    let speed = 'normal';
    let at = 0;

    const show = (i) => {
      at = i;
      steps.forEach((li, k) => {
        li.classList.toggle('done', k < i);
        li.classList.toggle('now', k === i);
      });
      dot.style.left = `${(i / (STEPS.length - 1)) * 100}%`;
      read.textContent = STEPS[i];
    };

    for (const b of buttons)
      b.addEventListener('click', () => {
        speed = b.dataset.speed;
        for (const o of buttons) o.setAttribute('aria-pressed', String(o === b));
      });

    // The track runs from the first step's middle to the last one's: the dot's left is a share of it.
    show(fig.reduced ? STEPS.length - 1 : 0);
    if (fig.reduced) {
      dot.style.transition = 'none';
      return;
    }

    // fig.loop: the dot breathes on every frame while the figure is on screen.
    fig.loop((dt, t) => {
      const s = 1 + 0.12 * Math.sin(t / 420);
      dot.style.scale = String(s);
    });

    // fig.wait: the sequence holds each step for a time that counts only while the figure is on screen.
    (async () => {
      while (true) {
        for (let i = 0; i < STEPS.length; i++) {
          show(i);
          await fig.wait(2000 * SPEED[speed]);
        }
        await fig.wait(1500 * SPEED[speed]);
      }
    })();
  });

  HydorBlog.figure('_style-guide-wide', () => {});
})();
