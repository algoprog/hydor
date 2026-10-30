// Output rules shared by the server, which keeps each cell's latest run, and the browser, which
// mirrors it from live messages: both apply the same messages the same way and end up equal.
import type { NbOutput } from './types.ts';

/** Longest text kept per stream output; older text is dropped from the front. */
export const STREAM_KEEP = 200_000;

/**
 * Carriage returns redraw a line (progress bars): later text overwrites earlier text on the
 * same line, as in a terminal. A trailing \r stays, so the next chunk still overwrites.
 */
export function collapseCarriageReturns(text: string): string {
  if (!text.includes('\r')) return text;
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line;
      const shown = line.split('\r').reduce((acc, seg) => seg + acc.slice(seg.length), '');
      return line.endsWith('\r') ? shown + '\r' : shown;
    })
    .join('\n');
}

function keepTail(text: string): string {
  if (text.length <= STREAM_KEEP) return text;
  const cut = text.indexOf('\n', text.length - STREAM_KEEP);
  return '[… earlier output trimmed …]\n' + text.slice(cut < 0 ? text.length - STREAM_KEEP : cut + 1);
}

/** Adds an output; text on the same stream joins the output before it, as Jupyter shows it. */
export function appendOutput(outputs: NbOutput[], o: NbOutput): NbOutput[] {
  const last = outputs[outputs.length - 1];
  if (o.output_type === 'stream' && last?.output_type === 'stream' && last.name === o.name) {
    return [...outputs.slice(0, -1), { ...last, text: keepTail(collapseCarriageReturns((last.text ?? '') + (o.text ?? ''))) }];
  }
  return [...outputs, o.output_type === 'stream' ? { ...o, text: keepTail(collapseCarriageReturns(o.text ?? '')) } : o];
}
