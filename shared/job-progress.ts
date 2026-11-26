// How far a job has got, read from the end of its output, and how long it has left: the pure part of the Jobs section.
// The server (server/jobs) reads each job's output with these, and the page shows what they give; nothing here imports
// Node, so both use it. It reads what the tools people run print: tqdm bars, Keras batch lines and epochs, "step 12/40"
// counts, "[12/40]" brackets and percentages that say what they measure, and times left ("ETA 5m", "1:23 remaining").

export interface ProgressReading {
  /** 0..1, when the line gives one. */
  fraction?: number;
  /** As the job put it, short: "420/1000", "epoch 3/10", "42%". */
  text?: string;
  /** The time left the job printed, in ms. */
  leftMs?: number;
}

export interface ProgressSample {
  /** When it was read (ms since the epoch). */
  at: number;
  /** 0..1. */
  fraction: number;
}

/** Colour codes (CSI, OSC and charset switches) go, so they do not break the words they colour. */
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]/g;

/** The lines of a tail as they show on a screen: a line redrawn with \r keeps only its last drawing, and colour codes
 *  go. Each line is trimmed. */
function screenLines(tail: string): string[] {
  return tail.split('\n').map((raw) => raw.slice(raw.lastIndexOf('\r') + 1).replace(ANSI, '').trim());
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const toNum = (s: string): number => Number(s.replace(/,/g, ''));

/** done/total as a fraction; null when total is not positive or done is more than total (a reading that cannot be). */
function ratio(doneS: string, totalS: string): number | null {
  const done = toNum(doneS);
  const total = toNum(totalS);
  if (!(total > 0) || !(done >= 0) || done > total) return null;
  return done / total;
}

/** A percentage as a fraction; null above 100 or when it is not a number. */
function percent(s: string): number | null {
  const v = Number(s);
  if (!Number.isFinite(v) || v < 0 || v > 100) return null;
  return v / 100;
}

/** A duration as the text shows it: "1:23", "01:02:03", "5m 20s", "2h", "1h30m", "45 s". Groups: the whole duration. */
const DUR = '((?:\\d+:\\d{2}(?::\\d{2})?)|(?:\\d+\\s*(?:hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])\\s*)+)';
const ETA_RE = new RegExp(`\\bETA:?\\s*${DUR}`, 'i');
const LEFT_RE = new RegExp(`(?:^|[^\\w:.])${DUR}\\s*(?:left|remaining|to go)\\b`, 'i');
const TQDM_BAR = /(\d{1,3}(?:\.\d+)?)%\|[^|]*\|(?:\s*(\d[\d,]*)\s*\/\s*(\d[\d,]*))?/;
const TQDM_NOBAR = /(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s*\[[^\]<]*</;
const TQDM_LEFT = /\[[^\]<]*<\s*([^\],]*)/;
// The bar holds only = > . and spaces, so a date before a log level ("2026/11/26 [INFO]") is not read as a count.
const KERAS_BATCH = /(?:^|[^\d/])(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s*\[[=>.\s]*\]/;
const EPOCH = /\bepoch\s*(\d[\d,]*)\s*\/\s*(\d[\d,]*)/i;
const KEYWORD =
  /\b(step|epoch|iter|iteration|batch|file|item|page|chunk|shard|doc|document|row|record|sample|example|task|test|query|round|trial|run)s?\s*[:=#]?\s*(\d[\d,]*)\s*(?:\/|out\s+of\b|of\b)\s*(\d[\d,]*)/i;
const BRACKET = /^\s*[[(]\s*(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s*[\])]/;
const PERCENT = /(^|[^\d.])(\d{1,3}(?:\.\d+)?)\s?%/g;
const PERCENT_WORDS = /\b(progress|complete|completed|done|downloaded|processed|uploaded|indexed)\b/i;
const PERCENT_NOT = /\b(cpu|gpu|mem|memory|util|utilization|loss|acc|accuracy|disk|battery|vram)\b/i;

/** A duration in ms, or null when the text is not one. */
export function parseLeft(s: string): number | null {
  const t = s.trim();
  let m = /^(\d+):(\d{2}):(\d{2})$/.exec(t);
  if (m) return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000;
  m = /^(\d+):(\d{2})$/.exec(t);
  if (m) return (Number(m[1]) * 60 + Number(m[2])) * 1000;
  m = /^(?:(\d+)\s*(?:hours?|hrs?|h)\s*)?(?:(\d+)\s*(?:minutes?|mins?|m)\s*)?(?:(\d+)\s*(?:seconds?|secs?|s)\s*)?$/i.exec(t);
  if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) return null;
  return (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) * 1000;
}

/** The time left a line says ("ETA: 1:23", "ETA 5m 20s", "12 min left", "2:10 remaining"), in ms. */
function timeLeft(line: string): number | undefined {
  const m = ETA_RE.exec(line) ?? LEFT_RE.exec(line);
  const ms = m ? parseLeft(m[1] ?? '') : null;
  return ms ?? undefined;
}

/** The time left tqdm prints after "<" in its bracket ("[01:23<02:10, 5.04it/s]"); "<?" gives none. */
function tqdmLeft(line: string): number | undefined {
  const m = TQDM_LEFT.exec(line);
  const ms = m ? parseLeft(m[1] ?? '') : null;
  return ms ?? undefined;
}

function reading(fraction: number, text: string, leftMs?: number): ProgressReading {
  const r: ProgressReading = { fraction: clamp01(fraction), text };
  if (leftMs !== undefined) r.leftMs = leftMs;
  return r;
}

interface EpochLine {
  e: number;
  total: number;
  text: string;
}

/** An "Epoch e/E" line, when it makes sense (1 ≤ e ≤ E). */
function epochOf(line: string): EpochLine | null {
  const m = EPOCH.exec(line);
  if (!m) return null;
  const e = toNum(m[1] ?? '');
  const total = toNum(m[2] ?? '');
  if (!(total >= 1) || !(e >= 1) || e > total) return null;
  return { e, total, text: `epoch ${m[1]}/${m[2]}` };
}

/** A percentage that says what it measures (or stands first, or is a bar's), and that is not about a machine's load. */
function percentReading(line: string, left: number | undefined): ProgressReading | null {
  if (PERCENT_NOT.test(line)) return null;
  const words = PERCENT_WORDS.test(line);
  const re = new RegExp(PERCENT.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const numberAt = m.index + (m[1] ?? '').length;
    const end = m.index + m[0].length;
    const starts = /^[\s[(]*$/.test(line.slice(0, numberAt));
    const beforeBar = /^\s*\|/.test(line.slice(end));
    if (!(words || starts || beforeBar)) continue;
    const f = percent(m[2] ?? '');
    if (f !== null) return reading(f, `${m[2]}%`, left);
  }
  return null;
}

/** One line's reading, by the rules in order: custom, tqdm, Keras, Epoch, keyword counts, brackets, percentages. */
function readLine(line: string, epoch: EpochLine | null, custom: RegExp | null, total?: number): ProgressReading | null {
  if (custom) {
    const m = custom.exec(line);
    if (m) {
      const got = m.slice(1).filter((g): g is string => g !== undefined && /^\d[\d,]*(\.\d+)?$/.test(g));
      if (got.length === 1 && total) {
        // A count of what is done, out of the total the job was given.
        const f = ratio(got[0] ?? '', String(total));
        if (f !== null) return reading(f, `${got[0]}/${total}`, timeLeft(line));
      } else if (got.length === 1) {
        const f = percent(got[0] ?? '');
        if (f !== null) return reading(f, `${got[0]}%`, timeLeft(line));
      } else if (got.length >= 2) {
        const f = ratio(got[0] ?? '', got[1] ?? '');
        if (f !== null) return reading(f, `${got[0]}/${got[1]}`, timeLeft(line));
      }
    }
  }

  const bar = TQDM_BAR.exec(line);
  if (bar) {
    if (bar[2] !== undefined && bar[3] !== undefined) {
      const f = ratio(bar[2], bar[3]);
      if (f !== null) return reading(f, `${bar[2]}/${bar[3]}`, tqdmLeft(line));
    }
    const p = percent(bar[1] ?? '');
    if (p !== null) return reading(p, `${bar[1]}%`, tqdmLeft(line));
  }
  const nobar = TQDM_NOBAR.exec(line);
  if (nobar) {
    const f = ratio(nobar[1] ?? '', nobar[2] ?? '');
    if (f !== null) return reading(f, `${nobar[1]}/${nobar[2]}`, tqdmLeft(line));
  }

  // Keras: a batch line within an epoch. The time left it prints counts only when the batch is the whole job.
  const batch = KERAS_BATCH.exec(line);
  if (batch) {
    const b = ratio(batch[1] ?? '', batch[2] ?? '');
    if (b !== null) {
      if (epoch) return reading(((epoch.e - 1) + b) / epoch.total, epoch.text, epoch.total === 1 ? timeLeft(line) : undefined);
      return reading(b, `${batch[1]}/${batch[2]}`, timeLeft(line));
    }
  }
  const own = epochOf(line);
  if (own) return reading((own.e - 1) / own.total, own.text, own.total === 1 ? timeLeft(line) : undefined);

  const kw = KEYWORD.exec(line);
  if (kw) {
    const f = ratio(kw[2] ?? '', kw[3] ?? '');
    if (f !== null) return reading(f, `${(kw[1] ?? '').toLowerCase()} ${kw[2]}/${kw[3]}`, timeLeft(line));
  }

  const br = BRACKET.exec(line);
  if (br) {
    const f = ratio(br[1] ?? '', br[2] ?? '');
    if (f !== null) return reading(f, `${br[1]}/${br[2]}`, timeLeft(line));
  }

  return percentReading(line, timeLeft(line));
}

/** The newest "Epoch e/E" line among the lines (they come newest first). */
function newestEpoch(lines: string[]): EpochLine | null {
  for (const line of lines) {
    const e = epochOf(line);
    if (e) return e;
  }
  return null;
}

/** How far a job has got, from the end of its output: the newest of its last 50 non-empty lines that says a fraction.
 *  `custom` is a regex the job's own text may match (case-insensitive): two numbers are done and total, one is a
 *  percentage, or what is done out of `total` when one is given. A custom regex that does not compile is ignored. */
export function readProgress(tail: string, custom?: string, total?: number): ProgressReading | null {
  const lines = screenLines(tail).filter((l) => l !== '').slice(-50).reverse();
  let re: RegExp | null = null;
  if (custom?.trim()) {
    try {
      re = new RegExp(custom, 'i');
    } catch {
      re = null;
    }
  }
  const epoch = newestEpoch(lines);
  for (const line of lines) {
    const r = readLine(line, epoch, re, total && total > 0 ? total : undefined);
    if (r) return r;
  }
  return null;
}

/** Least-squares slope of fraction over time (per ms), or NaN when the times do not differ. */
function fitRate(points: ProgressSample[]): number {
  const n = points.length;
  if (n < 2) return NaN;
  const mx = points.reduce((s, p) => s + p.at, 0) / n;
  const my = points.reduce((s, p) => s + p.fraction, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    const dx = p.at - mx;
    sxy += dx * (p.fraction - my);
    sxx += dx * dx;
  }
  return sxx > 0 ? sxy / sxx : NaN;
}

/** When a job should end, from its progress samples (fraction 0..1 at each time). One sample, or samples all within 30 s
 *  of each other, give a low-confidence guess from the time so far; otherwise the rate of the last 10 minutes (at least
 *  the last two samples) gives the end, or the rate of the whole run when that rate is flat or falling. Confidence is
 *  high when at least 5 samples span 2 minutes and the rate of the first and second halves differ by less than 30%
 *  (of the larger one). The end is never before `now`. */
export function estimateEnd(
  samples: ProgressSample[],
  startedAt: number,
  now: number,
): { endsAt: number; confidence: 'high' | 'medium' | 'low' } | null {
  const s = samples.slice().sort((a, b) => a.at - b.at);
  const last = s[s.length - 1];
  if (!last || !(last.fraction > 0)) return null;
  if (last.fraction >= 1) return { endsAt: now, confidence: 'high' };
  const f = last.fraction;

  if (s[s.length - 1]!.at - s[0]!.at <= 30_000) {
    const elapsed = last.at - startedAt;
    // A reading in the first seconds says little: how long the job took to start weighs more than its pace.
    if (elapsed < 10_000) return null;
    return { endsAt: Math.max(now, Math.round(last.at + (elapsed * (1 - f)) / f)), confidence: 'low' };
  }

  let recent = s.filter((p) => p.at >= last.at - 600_000);
  if (recent.length < 2) recent = s.slice(-2);
  let rate = fitRate(recent);
  if (!(rate > 0)) {
    const elapsed = last.at - startedAt;
    if (elapsed <= 0) return null;
    rate = f / elapsed;
  }
  const endsAt = Math.max(now, Math.round(last.at + (1 - f) / rate));

  let confidence: 'high' | 'medium' = 'medium';
  const span = recent[recent.length - 1]!.at - recent[0]!.at;
  if (recent.length >= 5 && span >= 120_000) {
    const mid = Math.floor(recent.length / 2);
    const first = fitRate(recent.slice(0, mid));
    const second = fitRate(recent.slice(mid));
    if (first > 0 && second > 0 && Math.abs(first - second) < 0.3 * Math.max(first, second)) confidence = 'high';
  }
  return { endsAt, confidence };
}

/** Characters that make up a progress bar (and the spaces around it). */
const BAR_CHARS = new Set([...'█▏▎▍▌▋▊▉░▒▓#=>.-|_ ']);

function mostlyBar(line: string): boolean {
  const chars = [...line];
  const bar = chars.filter((c) => BAR_CHARS.has(c)).length;
  return bar * 2 > chars.length;
}

/** The last line of a tail that says something: not empty, not mostly a progress bar, cut to 300 characters. */
export function lastLine(tail: string): string | undefined {
  const lines = screenLines(tail);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? '';
    if (!line || mostlyBar(line)) continue;
    const chars = [...line];
    return chars.length > 300 ? `${chars.slice(0, 299).join('')}…` : line;
  }
  return undefined;
}

/** Commands that serve until they are stopped: dev servers, web and API servers, notebooks, model servers. */
const SERVER_COMMAND =
  /\b(?:vite(?!\s+build)(?:\s|$)|next\s+(?:dev|start)|nuxt\s+dev|astro\s+dev|webpack(?:-dev-server|\s+serve)|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview|watch)\b|python3?\s+-m\s+http\.server|http-server|uvicorn|gunicorn|hypercorn|flask\s+run|manage\.py\s+runserver|rails\s+s(?:erver)?\b|php\s+-S|jupyter[\s-](?:lab|notebook)|tensorboard|streamlit\s+run|ollama\s+serve|vllm\s+serve|llama-server|docker\s+compose\s+up(?![^|;&]*\s-d\b))/i;
/** Or one that names a port to listen on. */
const SERVER_PORT = /\s--port[=\s]\d+|\s-p\s\d{4,5}\b/;
/** A description an agent gave a server it started ("Start the dev server", "API server on port 8000"). */
const SERVER_WORDS = /\b(?:dev|web|api|http|https|preview|static|local|test|mock|proxy|file)\s+server\b|\bon\s+port\s+\d+|\bserv(?:e|es|ing)\b[^.]*\bport\b/i;

/** A background command that serves until it is stopped (a dev server, an API), by its command or, without one, by
 *  the description its agent gave it. A `job run` is never one: it ends. */
export function looksLikeServer(command?: string, description?: string): boolean {
  const c = command?.trim() ?? '';
  // What runs last decides (`npm run build && npm run preview` serves; `npm run dev & npm test` tests).
  const last = c.split(/[|;&]+/).map((x) => x.trim()).filter(Boolean).pop() ?? '';
  if (/^job\s+run\b/.test(c) || /\b(?:build|test|install)\b/i.test(last)) return false;
  if (c) return SERVER_COMMAND.test(last) || (SERVER_PORT.test(last) && !/\b(?:train|eval|benchmark)/i.test(last));
  return SERVER_WORDS.test(description ?? '');
}

/** What a command is, for "the same job ran before": its words without the wrappers that do not change what runs
 *  (variables set before it, nohup, nice, ionice, time, stdbuf, timeout, exec), without a trailing `&`, redirections or
 *  a `| tee`, with the spaces collapsed. Cut to 300 characters. */
export function commandSig(command: string): string {
  let s = command.replace(/\s+/g, ' ').trim();
  for (let prev = ''; prev !== s; ) {
    prev = s;
    // A trailing background `&` (not the end of `&&`).
    if (s.endsWith('&') && !s.endsWith('&&')) s = s.slice(0, -1).trimEnd();
    s = s.replace(/\s*\|\s*tee(?:\s+-a)?\s+\S+$/, '');
    s = s.replace(/\s*\d*>>?\s*\S+$/, '');
    s = s.replace(/^[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S*)\s+/, '');
    s = s.replace(/^(?:nohup|exec)\s+/, '');
    s = s.replace(/^time(?:\s+-p)?\s+/, '');
    s = s.replace(/^nice(?:\s+(?:-n\s*-?\d+|-\d+))?\s+/, '');
    s = s.replace(/^ionice(?:(?:\s+-[cn]\s*\d+)|(?:\s+-t))*\s+/, '');
    s = s.replace(/^stdbuf(?:\s+-[ioe]\S*)*\s+/, '');
    s = s.replace(/^timeout(?:\s+-[sk]\s*\S+)*\s+\S+\s+/, '');
    s = s.trim();
  }
  return s.slice(0, 300);
}
