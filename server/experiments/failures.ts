// Where a failed run first went wrong, and whether it ran out of memory. The log is read once, line by line: the
// first line that says something went wrong (a Python traceback with its last line, or a line one of ERROR_PATTERNS
// knows), a few lines around it, and where out-of-memory lines are. A line that says it was dealt with (a warning,
// "retrying") does not count. Out of memory is only said when it holds: an out-of-memory line within the last 50
// lines, or one that is where it first went wrong with no other failure after it.
import fs from 'node:fs';
import type { FirstError, RunRecord } from '../../shared/experiments.ts';
import { oomText } from './metrics.ts';

/** An exception's class name ("ValueError: …"), a log's ERROR, "error:" at a line's start or after a program's name. Case counts: "val_error: 0.3" is a metric. */
const NAMED_ERROR = /\b[A-Z]\w*(Error|Exception)\b(?=:|\(| was\b| occurred\b|$)|\bERROR\b|(^|[\]:|]\s*)([Ee]rror|ERROR|[Ee]xception)\s*:(?!\s*[-+]?\d)|^(Error|Exception)\b(?!\s*(rate\b|[=:]\s*[-+]?\d))/;

/** What says something went wrong, beside a Python traceback and out of memory (metrics.ts oomText): the first to match names it. */
export const ERROR_PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'disk', re: /No space left on device/ },
  { kind: 'command', re: /\bcommand not found\b|^(ba)?sh: .*: not found$|: line \d+: .*: (No such file or directory|Permission denied)$/ },
  // A file that is not there: "python: can't open file …", "cat: data.csv: No such file or directory".
  { kind: 'file', re: /can't open file .*No such file|^[\w.\/-]+: [^:]+: No such file or directory$/ },
  { kind: 'segfault', re: /\bSegmentation fault\b|\bSIGSEGV\b/ },
  { kind: 'killed', re: /^Killed$|\bKilled process \d+|: line \d+:\s+\d+\s+Killed\b|\bSIGKILL\b/ },
  { kind: 'fatal', re: /\bFATAL\b|^fatal:|\bFatal Python error\b/ },
  // A step of the job that ended with another code than 0.
  { kind: 'exit', re: /\b(exited with|exit) (code|status):? +[1-9]\d*|\breturned (non-zero exit status|exit code) +[1-9]\d*|\bnon-zero exit status [1-9]|\bexitcode: +[1-9]/i },
  { kind: 'error', re: NAMED_ERROR },
];

/** A line that says the trouble was dealt with, or only warns. */
const HANDLED = /warning\b|\bwarn\b|\b(retrying|will retry|retry (in|with|after)|caught|recovered|recovering|falling back|skipping|skipped|ignoring|ignored|trying (again|a smaller)|reducing (the )?batch)\b/i;
/** Errors that only say another one happened. */
const WRAPPER = /ChildFailedError|CalledProcessError|DistBackendError.*exit|torch\.distributed\.elastic/;
/** Only lines with one of these words are looked at closely. */
const LOOK = /rror|xception|Traceback|[Mm]emory|illed|FATAL|fatal|space left|not found|egmentation|exit|SIG|No such|denied|alloc|ALLOC|ERR/;
const TRACEBACK = /^(\s*(?:\[[^\]]*\]:?\s*)?)Traceback \(most recent call last\):/;

const BEFORE = 2;
const AFTER = 3;
const LINE_MAX = 400;
/** Lines of a traceback kept: its first and its last ones. */
const HEAD = 4;
const TAIL = 8;
/** An out-of-memory line this near the end of a failed run is why it ended. */
export const NEAR_END = 50;

export interface LogScan {
  firstError?: FirstError;
  /** Out of memory, as the rule above has it. */
  oom: boolean;
  /** An out-of-memory line anywhere (that does not say it was dealt with). */
  oomLine?: string;
  lines: number;
}

interface Kept {
  n: number;
  offset: number;
  text: string;
}

/** A log read line by line. `feed` takes each line without its newline, with the byte it starts at. */
export class Scanner {
  private n = 0;
  private recent: Kept[] = [];
  private first: { line: number; text: string; from: number; offset: number; lines: string[]; kind: 'oom' | 'traceback' | 'other' } | null = null;
  private after = 0;
  private trace: { prefix: string; start: Kept; before: Kept[]; head: string[]; tail: string[]; skipped: number; chars: number } | null = null;
  private lastOom = 0;
  private oomText?: string;
  /** The last line that told of a failure other than out of memory. */
  private lastOther = 0;

  feed(raw: string, offset: number): void {
    const redraws = raw.includes('\r') ? raw.split('\r').filter((x) => x.length) : null;
    const clean = (redraws ? (redraws.pop() ?? '') : raw).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    const text = clean.length > LINE_MAX ? `${clean.slice(0, LINE_MAX)}…` : clean;
    const k: Kept = { n: ++this.n, offset, text };
    if (this.first && this.after > 0) {
      this.first.lines.push(text);
      this.after--;
    }
    if (this.trace) this.inTrace(k);
    else this.outside(k);
    this.recent.push(k);
    if (this.recent.length > BEFORE) this.recent.shift();
  }

  private outside(k: Kept) {
    if (!LOOK.test(k.text)) return;
    const t = TRACEBACK.exec(k.text);
    if (t) {
      this.trace = { prefix: t[1].trimStart(), start: k, before: [...this.recent], head: [k.text], tail: [], skipped: 0, chars: 0 };
      return;
    }
    if (HANDLED.test(k.text)) return;
    // "Killed" alone says a signal ended it, not why: it is no sign of memory by itself.
    const oom = oomText(k.text) && k.text.trim() !== 'Killed';
    const hit = oom ? null : ERROR_PATTERNS.find((p) => p.re.test(k.text));
    if (!oom && !hit) return;
    this.note(k.n, k.text, oom);
    if (!this.first) {
      this.first = { line: k.n, text: k.text.trim(), from: this.recent[0]?.n ?? k.n, offset: this.recent[0]?.offset ?? k.offset, lines: [...this.recent.map((x) => x.text), k.text], kind: oom ? 'oom' : 'other' };
      this.after = AFTER;
    }
  }

  private note(n: number, text: string, oom: boolean) {
    if (oom) {
      this.lastOom = n;
      this.oomText = text.trim().slice(0, 300);
    } else if (!WRAPPER.test(text) && !/\bexit|Killed|SIGKILL/i.test(text)) this.lastOther = n;
  }

  /** Inside a traceback: its frames are indented (or caret lines); the first line that is not ends it. */
  private inTrace(k: Kept) {
    const t = this.trace!;
    const body = t.prefix && k.text.startsWith(t.prefix) ? k.text.slice(t.prefix.length) : k.text;
    const frame = /^\s/.test(body) || !body.trim() || /^(During handling|The above exception|Traceback )/.test(body);
    if (t.head.length < HEAD) t.head.push(k.text);
    else {
      t.tail.push(k.text);
      if (t.tail.length > TAIL) {
        t.tail.shift();
        t.skipped++;
      }
    }
    // A traceback that never ends in a line of its own (cut off) is closed after a while.
    if (frame && ++t.chars < 400) return;
    this.endTrace(k, body.trim());
  }

  private endTrace(last: Kept, said: string) {
    const t = this.trace!;
    this.trace = null;
    const oom = oomText(said);
    // A traceback logged and dealt with ("retrying") on its last line does not count.
    if (HANDLED.test(said) && !/Warning:/.test(said)) return;
    this.note(last.n, said, oom);
    if (this.first) return;
    const lines = [...t.before.map((x) => x.text), ...t.head, ...(t.skipped ? [`… ${t.skipped} more lines of the traceback …`] : []), ...t.tail];
    this.first = { line: t.start.n, text: said, from: t.before[0]?.n ?? t.start.n, offset: t.before[0]?.offset ?? t.start.offset, lines, kind: oom ? 'oom' : 'traceback' };
    this.after = AFTER - 1;
  }

  end(): LogScan {
    if (this.trace) this.endTrace(this.recent[this.recent.length - 1] ?? this.trace.start, (this.trace.tail.at(-1) ?? this.trace.head.at(-1) ?? '').trim());
    const f = this.first;
    const oom = !!this.lastOom && (this.n - this.lastOom < NEAR_END || (f?.kind === 'oom' && this.lastOther <= this.lastOom));
    return {
      ...(f ? { firstError: { line: f.line, text: f.text, lines: f.lines, from: f.from, offset: f.offset } } : {}),
      oom,
      ...(this.oomText ? { oomLine: this.oomText } : {}),
      lines: this.n,
    };
  }
}

/** A log's text, read as a whole (the tests; scanLog reads a file in pieces). */
export function scanText(text: string): LogScan {
  const s = new Scanner();
  let offset = 0;
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const l of lines) {
    s.feed(l, offset);
    offset += Buffer.byteLength(l) + 1;
  }
  return s.end();
}

/** The longest line kept while it is put together from pieces. */
const CARRY_MAX = 64 * 1024;

/** A log file read in pieces (so a large one holds nothing else up). A file that is not there is an empty one. */
export async function scanLog(file: string): Promise<LogScan> {
  const s = new Scanner();
  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(file, 'r');
    const buf = Buffer.alloc(1 << 20);
    let carry: Buffer = Buffer.alloc(0);
    let start = 0;
    let pos = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buf, 0, buf.length, pos);
      if (!bytesRead) break;
      const chunk = carry.length ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
      let from = 0;
      for (let at = chunk.indexOf(10, from); at >= 0; at = chunk.indexOf(10, from)) {
        s.feed(chunk.subarray(from, at).toString('utf8'), start);
        start += at - from + 1;
        from = at + 1;
      }
      carry = Buffer.from(chunk.subarray(from));
      if (carry.length > CARRY_MAX) {
        s.feed(carry.subarray(0, LINE_MAX * 4).toString('utf8'), start);
        start += carry.length;
        carry = Buffer.alloc(0);
      }
      pos += bytesRead;
    }
    if (carry.length) s.feed(carry.toString('utf8'), start);
  } catch {
    // No log: nothing to say of it.
  } finally {
    await handle?.close().catch(() => {});
  }
  return s.end();
}

// ---- out of memory, said with what is known ------------------------------------------------------------------------

/** Whether an out-of-memory line is about GPU memory. */
const ON_GPU = /CUDA|cuda|CUBLAS|\bGPU\b|on device|ResourceExhausted/;

const gbWords = (v: number) => String(Math.round(v * 10) / 10);

/**
 * "It ran out of memory", and on a GPU what the samples know: which one, what the run had reached of how much, and
 * what other programs held there when it started.
 */
export function oomWords(r: Pick<RunRecord, 'gpuIds' | 'peak' | 'gpuTotalGb' | 'others' | 'memoryLimitGb'>, line: string | undefined, killed: boolean): string {
  const base = `It ran out of memory${killed ? ' (it was killed: exit code 137)' : ''}`;
  const ids = r.gpuIds ?? [];
  if (!ids.length || !line || !ON_GPU.test(line)) {
    // The computer's own memory, when it was near all of it.
    const ram = r.peak?.ramGb;
    return killed && ram && r.memoryLimitGb && ram >= 0.9 * r.memoryLimitGb ? `${base}: it had reached ${gbWords(ram)} of ${gbWords(r.memoryLimitGb)} GB of memory` : base;
  }
  // PyTorch counts the GPUs it was given from 0; else the fullest one.
  const named = /\bGPU (\d+)\b/.exec(line);
  let i = named && Number(named[1]) < ids.length ? Number(named[1]) : -1;
  if (i < 0) {
    const full = (k: number) => ((r.peak?.gpuMemGb[k] ?? 0) + (r.others?.start?.[k] ?? 0)) / (r.gpuTotalGb?.[k] || 1);
    i = ids.reduce((best, _, k) => (full(k) > full(best) ? k : best), 0);
  }
  const reached = r.peak?.gpuMemGb[i];
  const total = r.gpuTotalGb?.[i];
  const other = r.others?.start?.[i];
  const parts = [
    reached && total ? `it had reached ${gbWords(reached)} of ${gbWords(total)} GB` : '',
    other !== undefined && other >= 0.5 ? `another program held ${gbWords(other)} GB there when it started` : '',
  ].filter(Boolean);
  return `It ran out of memory on GPU ${ids[i]}${parts.length ? `: ${parts.join(', and ')}` : ''}`;
}

/** Why a run killed with exit code 137 and nothing to say it was memory is said to have ended. */
export const KILLED_WHY = 'It was killed (exit code 137): by the system or by someone, perhaps for memory';

/** Whether memory was very likely what the kernel killed it for, from the samples. */
export const memoryNearLimit = (r: Pick<RunRecord, 'peak' | 'memoryLimitGb' | 'memoryLow'>) => !!r.memoryLow || (!!r.peak?.ramGb && !!r.memoryLimitGb && r.peak.ramGb >= 0.9 * r.memoryLimitGb);
