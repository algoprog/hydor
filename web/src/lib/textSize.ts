// The text size: how big reading text is on this device (Settings → General → Appearance → Text size). It is on <html>
// as data-text-size (default, large or larger) for the stylesheet's --n-text-scale, and public/theme-boot.js sets it
// before the first paint.
import { useUI, type TextSize } from './store';

export const TEXT_SIZES: TextSize[] = ['default', 'large', 'larger'];

const valid = (v: unknown): TextSize => (v === 'large' || v === 'larger' ? v : 'default');

function applyTextSize() {
  document.documentElement.dataset.textSize = valid(useUI.getState().textSize);
}

/** Keeps <html data-text-size> in step with the setting. */
export function startTextSize() {
  applyTextSize();
  let last = useUI.getState().textSize;
  useUI.subscribe((s) => {
    if (s.textSize === last) return;
    last = s.textSize;
    applyTextSize();
  });
}
