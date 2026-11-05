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

// ---- nbformat ------------------------------------------------------------------------------------
// A notebook as nbformat 4 keeps it, written the way nbformat itself writes it, so that a notebook read and saved
// unchanged stays the same file: keys sorted, an indent of one space, and every multi-line string (a cell's source,
// a stream's text, text-like output data) as a list of lines. The notebook page (web) and the Library (server) both
// write notebooks with it.

type Json = Record<string, any>;

/** Python's str.splitlines(keepends=True), which nbformat uses for multi-line strings. */
export function splitLines(s: string): string[] {
  const out: string[] = [];
  const re = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/g;
  let at = 0;
  for (let m: RegExpExecArray | null; (m = re.exec(s)); ) {
    out.push(s.slice(at, re.lastIndex));
    at = re.lastIndex;
  }
  if (at < s.length) out.push(s.slice(at));
  return out;
}

/** A multi-line string as nbformat may hold it (a string, or a list of lines) as one string. */
export const joinLines = (v: unknown): string => (Array.isArray(v) ? v.map(String).join('') : typeof v === 'string' ? v : '');

/** Output data kept as lines: text, scripts and SVG; pictures stay one base64 string, JSON stays JSON. */
export const splitMime = (mime: string) => mime.startsWith('text/') || mime === 'application/javascript' || mime === 'image/svg+xml';

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Json)[k])]));
  return v;
}

/** An output as nbformat writes it (what only a live run has, `transient`, left out). */
export function outputJson(o: Json): Json {
  const { transient: _transient, ...out } = o;
  if (out.output_type === 'stream') out.text = splitLines(joinLines(out.text));
  if (out.data && typeof out.data === 'object') {
    out.data = Object.fromEntries(
      Object.entries(out.data as Json).map(([k, v]) => {
        // A list of lines (as a file has it) is one text again first; JSON data stays as it is.
        const s = Array.isArray(v) && !k.includes('json') ? joinLines(v) : v;
        return [k, typeof s === 'string' && splitMime(k) ? splitLines(s) : s];
      }),
    );
  }
  if (out.output_type === 'display_data' || out.output_type === 'execute_result') out.metadata ??= {};
  return out;
}

/** The notebook's file text: sources and outputs may come as strings or as lists of lines. */
export function notebookText(nb: Json): string {
  const cells = (Array.isArray(nb.cells) ? nb.cells : []).map((c: Json) => {
    const out: Json = { ...c, source: splitLines(joinLines(c.source)) };
    if (Array.isArray(c.outputs)) out.outputs = c.outputs.map(outputJson);
    return out;
  });
  return JSON.stringify(sortKeys({ ...nb, cells }), null, 1) + '\n';
}

/** Python 3 through ipykernel: what a new notebook asks for until a kernel says otherwise. */
export const PYTHON_NOTEBOOK = { kernelspec: { display_name: 'Python 3 (ipykernel)', language: 'python', name: 'python3' }, language_info: { name: 'python' } };

/** A cell id as nbformat 4.5 wants them: short, of letters, digits, - and _. */
export const CELL_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function newCellId(): string {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** A new notebook: its title as a heading (when it has one) and an empty code cell. */
export function newNotebookJson(title = ''): Json {
  const t = title.trim();
  return {
    cells: [
      ...(t ? [{ cell_type: 'markdown', id: newCellId(), metadata: {}, source: `# ${t}` }] : []),
      { cell_type: 'code', execution_count: null, id: newCellId(), metadata: {}, outputs: [], source: '' },
    ],
    metadata: structuredClone(PYTHON_NOTEBOOK),
    nbformat: 4,
    nbformat_minor: 5,
  };
}
