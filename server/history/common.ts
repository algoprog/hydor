import type { ActivityCounters, FileChange, SessionStats, TimelineItem, ToolInfo } from '../../shared/types.ts';

/** Raising an agent's version re-reads all of its transcripts from the start (Claude 6: background tasks; 13, Codex 8, ACP 2: the time each session worked). */
export const PARSE_VERSION = { claude: 13, codex: 8, acp: 2 } as const;

export function emptyCounters(): ActivityCounters {
  return {
    prompts: 0,
    turns: 0,
    messages: 0,
    toolCalls: 0,
    commands: 0,
    fileEdits: 0,
    linesAdded: 0,
    linesRemoved: 0,
    tokensIn: 0,
    tokensCached: 0,
    tokensOut: 0,
    genMs: 0,
  };
}

/** Per-hour activity (UTC epoch hours), so stats can be cut by any local day/week/month/year. */
export class ActivityLog {
  hours = new Map<number, ActivityCounters>();

  bump(ts: number | undefined, field: keyof ActivityCounters, n = 1) {
    if (!ts || !n) return;
    const h = Math.floor(ts / 3_600_000);
    let c = this.hours.get(h);
    if (!c) this.hours.set(h, (c = emptyCounters()));
    c[field] += n;
  }

  files(ts: number | undefined, changes: FileChange[] | undefined) {
    if (!changes?.length) return;
    this.bump(ts, 'fileEdits', changes.length);
    for (const f of changes) {
      this.bump(ts, 'linesAdded', f.added);
      this.bump(ts, 'linesRemoved', f.removed);
    }
  }
}

/** Kept per tool output in memory; the client gets a shorter preview first. */
export const MAX_OUTPUT = 256 * 1024;
export const MAX_DIFF = 512 * 1024;
export const PREVIEW_OUTPUT = 6 * 1024;
export const PREVIEW_DIFF = 24 * 1024;

export function emptyStats(): SessionStats {
  return {
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    commands: 0,
    backgroundCommands: 0,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    turns: 0,
    tokensIn: 0,
    tokensOut: 0,
    tokensCached: 0,
    genMs: 0,
    workMs: 0,
  };
}

/** Caps a single reply's measured generation time (ms) so an API stall or a long queue wait can't skew throughput. */
export const GEN_MS_CAP = 600_000;

export function clip(s: string | undefined | null, max: number): { text: string; truncated: boolean; bytes: number } {
  const text = s ?? '';
  if (text.length <= max) return { text, truncated: false, bytes: text.length };
  // Keep the head and the tail: errors usually sit at the end of a long output.
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return {
    text: `${text.slice(0, head)}\n\n… ${(text.length - max).toLocaleString('en-US')} characters omitted …\n\n${text.slice(-tail)}`,
    truncated: true,
    bytes: text.length,
  };
}

export function countDiff(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added++;
    else if (line.startsWith('-')) removed++;
  }
  return { added, removed };
}

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export function hunksToDiff(hunks: Hunk[]): string {
  const out: string[] = [];
  for (const h of hunks) {
    out.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
    for (const l of h.lines) out.push(l);
  }
  return out.join('\n');
}

/** Whole-file diff for a new or deleted file. */
export function wholeFileDiff(content: string, sign: '+' | '-'): string {
  const lines = content.replace(/\n$/, '').split('\n');
  if (content === '') return '';
  const head = sign === '+' ? `@@ -0,0 +1,${lines.length} @@` : `@@ -1,${lines.length} +0,0 @@`;
  return [head, ...lines.map((l) => sign + l)].join('\n');
}

/** A minimal line diff of two snippets (used for previews before a structured patch exists). */
export function snippetDiff(oldText: string, newText: string): string {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const out = [`@@ -1,${a.length} +1,${b.length} @@`];
  for (let i = 0; i < pre; i++) out.push(' ' + a[i]);
  for (let i = pre; i < a.length - suf; i++) out.push('-' + a[i]);
  for (let i = pre; i < b.length - suf; i++) out.push('+' + b[i]);
  for (let i = a.length - suf; i < a.length; i++) out.push(' ' + a[i]);
  return out.join('\n');
}

export function makeFileChange(path: string, op: FileChange['op'], diff: string, movePath?: string): FileChange {
  const { added, removed } = countDiff(diff);
  const c = clip(diff, MAX_DIFF);
  return { path, op, added, removed, diff: c.text, diffTruncated: c.truncated || undefined, movePath };
}

/** Parses the apply_patch envelope (*** Begin Patch … *** End Patch). */
export function parseApplyPatch(patch: string): FileChange[] {
  const files: FileChange[] = [];
  let cur: { path: string; op: FileChange['op']; lines: string[]; movePath?: string } | null = null;
  const flush = () => {
    if (!cur) return;
    const body = cur.op === 'create' ? cur.lines.map((l) => (l.startsWith('+') ? l : '+' + l)) : cur.lines;
    files.push(makeFileChange(cur.path, cur.op, body.join('\n'), cur.movePath));
    cur = null;
  };
  for (const line of patch.split('\n')) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\*\*\* (Add|Update|Delete) File: (.+)$/))) {
      flush();
      const op = m[1] === 'Add' ? 'create' : m[1] === 'Delete' ? 'delete' : 'edit';
      cur = { path: m[2].trim(), op, lines: [] };
    } else if ((m = line.match(/^\*\*\* Move to: (.+)$/)) && cur) {
      cur.movePath = m[1].trim();
      cur.op = 'move';
    } else if (line.startsWith('*** End Patch') || line.startsWith('*** Begin Patch') || line.startsWith('*** End of File')) {
      continue;
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  flush();
  return files;
}

const WRAPPER_TAGS = ['system-reminder', 'ide_selection', 'ide_opened_file', 'ide_diagnostics', 'user-prompt-submit-hook'];

/** Removes harness-injected wrappers from user text. Returns the cleaned text and whether anything was removed. */
export function stripWrappers(text: string): { text: string; stripped: boolean } {
  let out = text;
  let stripped = false;
  for (const tag of WRAPPER_TAGS) {
    const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g');
    if (re.test(out)) {
      stripped = true;
      out = out.replace(re, '');
    }
  }
  // IDE extensions prepend context blocks such as <external_codex_apps_open_page>.
  const ext = /<(external_[a-z_]+)>[\s\S]*?<\/\1>/g;
  if (ext.test(out)) {
    stripped = true;
    out = out.replace(ext, '');
  }
  return { text: out.trim(), stripped };
}

export function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

export function firstLine(s: string, max = 160): string {
  const line = s.split('\n').find((l) => l.trim()) ?? '';
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

export function parseTs(v: unknown): number | undefined {
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

/** Search text extracted while parsing (only collected by the indexer). */
export interface Chunk {
  kind: 'user' | 'assistant' | 'command' | 'file';
  ts?: number;
  text: string;
}

/** A short copy of an item for the first page sent to the browser. */
export function previewItem(item: TimelineItem): TimelineItem {
  if (item.kind !== 'tool') {
    if ((item.kind === 'assistant' || item.kind === 'user') && item.text.length > 200_000) {
      return { ...item, text: clip(item.text, 200_000).text };
    }
    return item;
  }
  const t = item.tool;
  let tool: ToolInfo = t;
  if (t.output && t.output.length > PREVIEW_OUTPUT) {
    const c = clip(t.output, PREVIEW_OUTPUT);
    tool = { ...tool, output: c.text, truncated: true, outputBytes: t.outputBytes ?? t.output.length };
  }
  if (t.files?.some((f) => (f.diff?.length ?? 0) > PREVIEW_DIFF)) {
    tool = {
      ...tool,
      truncated: true,
      files: t.files.map((f) =>
        (f.diff?.length ?? 0) > PREVIEW_DIFF ? { ...f, diff: clip(f.diff, PREVIEW_DIFF).text, diffTruncated: true } : f,
      ),
    };
  }
  // A page an agent showed (show_html) is the content itself: it goes whole.
  if (t.input && typeof t.input === 'object' && !t.name.endsWith('__show_html')) {
    const s = JSON.stringify(t.input);
    if (s.length > PREVIEW_OUTPUT) {
      tool = { ...tool, input: { _preview: clip(s, PREVIEW_OUTPUT).text }, truncated: true };
    }
  }
  return tool === t ? item : { ...item, tool };
}

/** Accumulates per-file line counts so `filesChanged` counts unique paths. */
export function addFileStats(
  files: Record<string, [number, number]>,
  stats: SessionStats,
  changes: FileChange[] | undefined,
) {
  if (!changes) return;
  for (const f of changes) {
    const cur = files[f.path] ?? [0, 0];
    cur[0] += f.added;
    cur[1] += f.removed;
    files[f.path] = cur;
    stats.linesAdded += f.added;
    stats.linesRemoved += f.removed;
  }
  stats.filesChanged = Object.keys(files).length;
}
