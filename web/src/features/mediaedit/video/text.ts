// A title or caption drawn as a picture, as large as it is on the edited video: the editor shows that picture over the
// video and sends it with the edit, so the video comes out with the words exactly as they were seen (in any language
// the browser has letters for), laid on by ffmpeg where they were put.
import type { VideoText } from '@shared/mediaedit-video';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif';

/** A colour as the canvas takes it, from "#rrggbb" or "#rrggbbaa". */
function cssColor(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 8) return `#${h.slice(0, 6)}`;
  const n = parseInt(h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${(parseInt(h.slice(6, 8), 16) / 255).toFixed(3)})`;
}

/** The words drawn at the size of the edited picture (`w`×`h` pixels): a canvas just big enough for them. */
export function drawText(t: VideoText, w: number, h: number): HTMLCanvasElement {
  const px = Math.max(8, Math.round(t.size * h));
  const font = `${t.bold ? 700 : 600} ${px}px ${FONT}`;
  const lines = t.text.split('\n');
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = font;
  const widths = lines.map((l) => g.measureText(l || ' ').width);
  const line = Math.round(px * 1.25);
  const padX = Math.round(px * (t.background ? 0.45 : 0.2));
  const padY = Math.round(px * (t.background ? 0.25 : 0.15));
  c.width = Math.min(Math.max(...widths) + padX * 2, w * 2);
  c.height = Math.min(lines.length * line + padY * 2, h * 2);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (t.background) {
    g.fillStyle = cssColor(t.background);
    g.beginPath();
    g.roundRect(0, 0, c.width, c.height, Math.round(px * 0.28));
    g.fill();
  } else {
    // A soft shadow keeps light words readable on a light picture.
    g.shadowColor = 'rgba(0, 0, 0, 0.55)';
    g.shadowBlur = Math.max(2, px / 10);
    g.shadowOffsetY = Math.max(1, px / 24);
  }
  g.fillStyle = cssColor(t.color);
  lines.forEach((l, i) => g.fillText(l, c.width / 2, padY + line * i + line / 2));
  return c;
}

/** The words as a PNG (a data: address), for the edit. */
export const textPng = (t: VideoText, w: number, h: number) => drawText(t, w, h).toDataURL('image/png');
