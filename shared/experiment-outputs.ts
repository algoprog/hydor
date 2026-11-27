// Where a command writes, and which checkpoint it goes on from, are not its settings: --out outputs/lr0.03/result.json
// says nothing of how a run differs from another. So they are not read as a new run's settings, and they are left out
// when commands and settings are compared (a results table's rows, attempts at one thing, the pages). A flag of this
// kind is only left out when its value reads as a place: --save_steps 500, --log_level info, --pred_len 96 and
// --checkpoint resnet50 are settings.

/** A flag whose value the command writes to: -o…, --out…, --save…, --log…, and their kin. */
export const OUTPUT_FLAG = /^(-o[\w.-]*|--(?:out|save|log|result|dump|report|write|pred|export|checkpoint|ckpt)[\w.-]*)(?:=(.*))?$/s;

/** A flag that names the checkpoint to go on from (or to score). */
const CHECKPOINT = /^(?:ckpt|checkpoint|resume)/i;
const RESUME_FLAG = /^--resume[\w.-]*$/;

const PLAIN = /^(?:[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?|true|false|none|null)$/i;
const FILE_END = /\.(json|jsonl|ndjson|pt|pth|ckpt|bin|safetensors|log|txt|csv|tsv|npy|npz|pkl|pickle|h5|hdf5|md|tex|yaml|yml|out|run|trec|parquet|db|png|pdf|svg|html)$/i;
/** Names that say their value is a place, so that a bare word ("--out results") is one too. */
const PLACE_NAME = /^(?:out|outputs?|results?|save|logs?)$|(?:dir|path|file|folder|prefix)$/i;
/** Names that say their value is a measure's name, slash or not ("--save_metric eval/mrr"). */
const MEASURE_NAME = /(?:metric|monitor|criterion|key|best)$/i;

/** Whether `flag` (with its dashes) given `value` names a place written to, or a checkpoint's. */
function isPlace(flag: string, value: string): boolean {
  if (!OUTPUT_FLAG.test(flag) && !RESUME_FLAG.test(flag)) return false;
  const name = flag.replace(/^-+/, '');
  if (!value || PLAIN.test(value) || MEASURE_NAME.test(name)) return false;
  return /[\\/]/.test(value) || /^[.~$]/.test(value) || FILE_END.test(value) || PLACE_NAME.test(name);
}

/**
 * Whether a setting (by the name of the --flag it was read from) only says where the run writes or what checkpoint it
 * goes on from. `swept`: it is a sweep's run, whose checkpoint settings are what it varies, not what it writes.
 */
export function isOutputSetting(name: string, value: unknown, swept = false): boolean {
  if (typeof value !== 'string' || (swept && CHECKPOINT.test(name))) return false;
  return isPlace(`--${name}`, value);
}

/** Whether a sweep run varies (or was given) a checkpoint: then its checkpoint flags tell its runs apart. */
export const sweptCheckpoint = (r: { sweep?: string; params?: Record<string, unknown> }) => !!r.sweep && Object.keys(r.params ?? {}).some((k) => CHECKPOINT.test(k));

interface Token {
  start: number;
  end: number;
  /** The word as a shell reads it (quotes taken off), or the operator. */
  word: string;
  op: boolean;
}

/** A command's words and operators with where each is in its text. */
function tokens(command: string): Token[] {
  const out: Token[] = [];
  let word = '';
  let from = -1;
  let quote: string | null = null;
  const end = (at: number) => {
    if (from >= 0) out.push({ start: from, end: at, word, op: false });
    word = '';
    from = -1;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += c;
      continue;
    }
    // A line carried on: no part of a word.
    if (c === '\\' && command[i + 1] === '\n') {
      i++;
      continue;
    }
    const op = /^(?:&>>?|>>|>&|>\||>|<|\|\||\||&&|&|;|\(|\)|\n)/.exec(command.slice(i, i + 3))?.[0];
    if (op) {
      end(i);
      out.push({ start: i, end: i + op.length, word: op, op: true });
      i += op.length - 1;
    } else if (/\s/.test(c)) end(i);
    else {
      if (from < 0) from = i;
      if (c === "'" || c === '"') quote = c;
      else if (c === '\\' && i + 1 < command.length) word += command[++i];
      else word += c;
    }
  }
  end(command.length);
  return out;
}

interface Place {
  start: number;
  end: number;
  /** The files or folders it names there. */
  paths: string[];
  /** It is a checkpoint flag's. */
  checkpoint?: string;
}

/** The parts of a command that only say where it writes (output flags, redirections, tee), and its checkpoint flags. */
function placesIn(command: string): Place[] {
  const all = tokens(command);
  const found: Place[] = [];
  for (let i = 0; i < all.length; i++) {
    const t = all[i];
    const next = all[i + 1];
    if (t.op && t.word.includes('>')) {
      // With the file number before it (2> errors.txt).
      const before = all[i - 1];
      const start = before && !before.op && before.end === t.start && /^\d+$/.test(before.word) ? before.start : t.start;
      // (2>&1 names no file.)
      const file = next && !next.op && !(t.word === '>&' && /^(\d+|-)$/.test(next.word));
      found.push({ start, end: next && !next.op ? next.end : t.end, paths: file ? [next.word] : [] });
      if (next && !next.op) i++;
    } else if (t.op && t.word === '|' && next && !next.op && /(^|\/)tee$/.test(next.word)) {
      let j = i + 1;
      while (all[j + 1] && !all[j + 1].op) j++;
      found.push({ start: t.start, end: all[j].end, paths: all.slice(i + 2, j + 1).flatMap((x) => (x.word.startsWith('-') ? [] : [x.word])) });
      i = j;
    } else if (!t.op && t.word.startsWith('-')) {
      const pair = /^([^=]*)=(.*)$/s.exec(t.word);
      const flag = pair ? pair[1] : t.word;
      const value = pair ? pair[2] : next && !next.op && !next.word.startsWith('-') ? next.word : undefined;
      if (value === undefined || !isPlace(flag, value)) continue;
      const checkpoint = CHECKPOINT.test(flag.replace(/^-+/, '')) ? value : undefined;
      found.push({ start: t.start, end: pair ? t.end : next!.end, paths: [value], ...(checkpoint !== undefined ? { checkpoint } : {}) });
      if (!pair) i++;
    }
  }
  return found;
}

/**
 * A command without what only says where it writes: what is left is what makes two commands different. With
 * `keepCheckpoints`, its checkpoint flags stay (a sweep over checkpoints).
 */
export function withoutOutputs(command: string, o: { keepCheckpoints?: boolean } = {}): string {
  let out = '';
  let at = 0;
  for (const p of placesIn(command)) {
    if (o.keepCheckpoints && p.checkpoint !== undefined) continue;
    out += command.slice(at, p.start).replace(/[ \t]+$/, '');
    at = p.end;
  }
  return (out + command.slice(at)).trim();
}

/** The paths a command names as what it writes, and its checkpoints. */
export const outputPaths = (command: string) => placesIn(command).flatMap((p) => p.paths);

/** The checkpoint paths a command names (--ckpt, --checkpoint, --resume). */
export const checkpointsIn = (command: string) => placesIn(command).flatMap((p) => (p.checkpoint === undefined ? [] : [p.checkpoint]));
