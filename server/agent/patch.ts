// Patches in the format Codex models are trained on (*** Begin Patch … *** End Patch, with Add, Delete
// and Update File sections and @@ hunks of context lines), and plain unified diffs (--- a/x, +++ b/x,
// @@ -1,3 +1,4 @@). Hunks are found by their context, loosely when spaces or quotes differ. A patch applies
// whole or not at all, after one approval for every file it changes.
import fs from 'node:fs';
import path from 'node:path';
import { riskyWrite } from './shell.ts';
import type { Tool } from './tools.ts';
import { diffContent, relPath, resolvePath } from './util.ts';

type Line = { op: ' ' | '-' | '+'; text: string };
interface Hunk {
  /** Lines named after @@ that come before the change (a function or class), to find the place. */
  anchors: string[];
  lines: Line[];
  /** The change is at the end of the file. */
  eof: boolean;
  /** Where a unified diff says it starts (1-based), as a hint. */
  at?: number;
}
export type FileOp = { kind: 'add'; path: string; text: string } | { kind: 'delete'; path: string } | { kind: 'update'; path: string; to?: string; hunks: Hunk[] };

const stripAB = (p: string) => p.trim().replace(/^"(.*)"$/, '$1').replace(/^[ab]\//, '').replace(/\t.*$/, '');

/** The file operations in a patch (Codex's format or a unified diff). */
export function parsePatch(src: string): { ops: FileOp[]; error?: string } {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const ops: FileOp[] = [];
  let cur: FileOp | null = null;
  // The hunk being read (kept in an object so the checks below see its changes).
  const at: { hunk: Hunk | null } = { hunk: null };
  const newHunk = (): Hunk | null => {
    if (cur?.kind !== 'update') return null;
    if (!at.hunk || at.hunk.lines.length) {
      at.hunk = { anchors: [], lines: [], eof: false };
      cur.hunks.push(at.hunk);
    }
    return at.hunk;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m: RegExpExecArray | null;
    if (/^\*\*\* (Begin|End) Patch\s*$/.test(l)) {
      if (l.includes('End')) break;
      continue;
    }
    if ((m = /^\*\*\* Add File:\s*(.+)$/.exec(l))) {
      ops.push((cur = { kind: 'add', path: m[1].trim(), text: '' }));
      at.hunk = null;
      continue;
    }
    if ((m = /^\*\*\* Delete File:\s*(.+)$/.exec(l))) {
      ops.push((cur = { kind: 'delete', path: m[1].trim() }));
      at.hunk = null;
      continue;
    }
    if ((m = /^\*\*\* Update File:\s*(.+)$/.exec(l))) {
      ops.push((cur = { kind: 'update', path: m[1].trim(), hunks: [] }));
      at.hunk = null;
      continue;
    }
    if ((m = /^\*\*\* Move to:\s*(.+)$/.exec(l)) && cur?.kind === 'update') {
      cur.to = m[1].trim();
      continue;
    }
    if (/^\*\*\* End of File\s*$/.test(l)) {
      if (at.hunk) at.hunk.eof = true;
      continue;
    }
    // A unified diff: --- a/x then +++ b/x.
    if (l.startsWith('--- ') && lines[i + 1]?.startsWith('+++ ')) {
      const from = stripAB(l.slice(4));
      const to = stripAB(lines[i + 1].slice(4));
      i++;
      if (to === '/dev/null') ops.push((cur = { kind: 'delete', path: from }));
      else if (from === '/dev/null') ops.push((cur = { kind: 'add', path: to, text: '' }));
      else ops.push((cur = { kind: 'update', path: from, ...(to !== from ? { to } : {}), hunks: [] }));
      at.hunk = null;
      continue;
    }
    if (/^(diff --git |index [0-9a-f]+\.\.|new file mode|deleted file mode|similarity index|rename (from|to) |old mode|new mode)/.test(l)) continue;
    if (!cur) continue;
    if (cur.kind === 'add') {
      if (l.startsWith('@@')) continue;
      cur.text += `${l.startsWith('+') ? l.slice(1) : l}\n`;
      continue;
    }
    if (cur.kind === 'delete') continue;
    if (l.startsWith('@@')) {
      const h = newHunk()!;
      const u = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@\s?(.*)$/.exec(l);
      if (u) h.at = Number(u[1]);
      const anchor = (u ? u[2] : l.slice(2).replace(/@@\s*$/, '')).trim();
      if (anchor) h.anchors.push(anchor);
      continue;
    }
    if (l.startsWith('\\')) continue;
    const h = at.hunk ?? newHunk()!;
    if (l.startsWith('+')) h.lines.push({ op: '+', text: l.slice(1) });
    else if (l.startsWith('-')) h.lines.push({ op: '-', text: l.slice(1) });
    else h.lines.push({ op: ' ', text: l.startsWith(' ') ? l.slice(1) : l });
  }
  // Blank lines after the last change of a hunk are usually the patch's own spacing.
  for (const op of ops)
    if (op.kind === 'update') {
      for (const h of op.hunks) while (h.lines.length && h.lines[h.lines.length - 1].op === ' ' && !h.lines[h.lines.length - 1].text.trim()) h.lines.pop();
      op.hunks = op.hunks.filter((h) => h.lines.length);
    } else if (op.kind === 'add') op.text = op.text.replace(/\n+$/, '\n');
  if (!ops.length) return { ops, error: 'No file sections found: start each with "*** Update File: <path>", "*** Add File: <path>" or "*** Delete File: <path>".' };
  const empty = ops.find((o) => o.kind === 'update' && !o.hunks.length && !o.to);
  if (empty) return { ops, error: `The section for ${empty.path} has no changes: give its lines with - and + (and context lines starting with a space).` };
  return { ops };
}

const loose = [
  (s: string) => s,
  (s: string) => s.trimEnd(),
  (s: string) => s.trim(),
  (s: string) =>
    s
      .trim()
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[‐-―−]/g, '-')
      .replace(/[  -​　]/g, ' ')
      .replace(/\s+/g, ' '),
];

/** Where `want` is in `lines` (from `from` on), strictest match first; the nearest to `hint`, or the last one for the end of the file. */
function seek(lines: string[], want: string[], from: number, eof: boolean, hint?: number): number {
  for (const norm of loose) {
    const w = want.map(norm);
    const hits: number[] = [];
    for (let i = from; i + w.length <= lines.length; i++) {
      let k = 0;
      while (k < w.length && norm(lines[i + k]) === w[k]) k++;
      if (k === w.length) hits.push(i);
    }
    if (!hits.length) continue;
    if (eof) return hits[hits.length - 1];
    if (hint) return hits.reduce((a, b) => (Math.abs(b - (hint - 1)) < Math.abs(a - (hint - 1)) ? b : a));
    return hits[0];
  }
  return -1;
}

/** The file's text with the hunks applied, or why one did not fit. */
export function applyHunks(text: string, hunks: Hunk[], name: string): { text: string } | { error: string } {
  const crlf = text.includes('\r\n');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const finalNewline = lines.length > 1 && lines[lines.length - 1] === '';
  if (finalNewline) lines.pop();
  let cursor = 0;
  for (const [k, h] of hunks.entries()) {
    for (const a of h.anchors) {
      const at = seek(lines, [a], cursor, false);
      if (at >= 0) cursor = at + 1;
    }
    let old = h.lines.filter((l) => l.op !== '+').map((l) => l.text);
    let neu = h.lines.filter((l) => l.op !== '-').map((l) => l.text);
    let at = old.length ? seek(lines, old, cursor, h.eof, h.at) : h.eof || !h.anchors.length ? lines.length : cursor;
    if (at < 0) at = seek(lines, old, 0, h.eof, h.at);
    if (at < 0) {
      // Blank context lines at its edges that the file does not have.
      const trim = (ls: string[]) => {
        let a = 0;
        let b = ls.length;
        while (a < b && !ls[a].trim()) a++;
        while (b > a && !ls[b - 1].trim()) b--;
        return [a, b] as const;
      };
      const [oa, ob] = trim(old);
      const [na, nb] = trim(neu);
      if (ob > oa) {
        old = old.slice(oa, ob);
        neu = neu.slice(na, nb);
        at = seek(lines, old, 0, h.eof, h.at);
      }
    }
    if (at < 0) {
      const first = old.find((l) => l.trim())?.trim() ?? '';
      const near = first ? lines.findIndex((l) => l.includes(first.slice(0, 40))) : -1;
      const show = near >= 0 ? `\nThe file has, around line ${near + 1}:\n${lines.slice(Math.max(0, near - 2), near + 6).join('\n')}` : '';
      return { error: `Hunk ${k + 1} for ${name} does not match the file: these lines (context and -) were not found:\n${old.join('\n')}${show}\nRead the file again and send the patch with its current lines.` };
    }
    lines.splice(at, old.length, ...neu);
    cursor = at + neu.length;
  }
  let out = lines.join('\n') + (finalNewline || !text ? '\n' : '');
  if (crlf) out = out.replace(/\n/g, '\r\n');
  return { text: out };
}

/** A patch run through the shell, as Codex models do (apply_patch <<'EOF' … EOF): the patch's text. */
export function shellPatch(command: string): string | null {
  const t = command.trim();
  if (!/^(apply_patch|applypatch)\b/.test(t) && !/^cat\s+<<-?\s*['"]?\w+['"]?\s*\|\s*(apply_patch|applypatch)\b/.test(t)) return null;
  const a = t.indexOf('*** Begin Patch');
  if (a < 0) return null;
  const b = t.lastIndexOf('*** End Patch');
  return t.slice(a, b < 0 ? undefined : b + 13);
}

export const APPLY_PATCH: Tool = {
  name: 'apply_patch',
  kind: 'edit',
  writes: true,
  description: [
    'Change files with a patch: update, add, delete or move several files in one call. The format:',
    '*** Begin Patch',
    '*** Update File: src/app.py',
    '@@ def greet():',
    '-    print("Hi")',
    '+    print("Hello")',
    '*** Add File: notes/todo.txt',
    '+first line',
    '*** Delete File: old.txt',
    '*** End Patch',
    'Changed lines start with - or +, unchanged context lines with a space: give about 3 lines of context around each change, and an @@ line naming the function or class when the context alone could match in several places. Unified diffs (--- a/x, +++ b/x, @@ -1,3 +1,4 @@) work too.',
  ].join('\n'),
  parameters: { type: 'object', properties: { patch: { type: 'string', description: 'The whole patch, from *** Begin Patch to *** End Patch' } }, required: ['patch'] },
  title: (a) => {
    const files = (parsePatch(String(a.patch ?? '')).ops ?? []).map((o) => o.path);
    return files.length ? `Patch ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` and ${files.length - 3} more` : ''}` : 'Patch';
  },
  path: (a) => parsePatch(String(a.patch ?? '')).ops[0]?.path,
  async run(a, ctx) {
    const { ops, error } = parsePatch(String(a.patch ?? ''));
    if (error) return { ok: false, output: `The patch was not applied. ${error}` };
    // Everything is worked out first, so the patch applies whole or not at all.
    const changes: { path: string; old: string | null; text: string | null; from?: string }[] = [];
    for (const op of ops) {
      const p = resolvePath(ctx.cwd, op.path);
      const exists = fs.existsSync(p);
      if (op.kind === 'add') changes.push({ path: p, old: exists ? fs.readFileSync(p, 'utf8') : null, text: op.text });
      else if (!exists) return { ok: false, output: `The patch was not applied: ${p} does not exist${op.kind === 'update' ? ' (to create it, use "*** Add File:")' : ''}.` };
      else if (op.kind === 'delete') changes.push({ path: p, old: fs.readFileSync(p, 'utf8'), text: null });
      else {
        const old = fs.readFileSync(p, 'utf8');
        const r = op.hunks.length ? applyHunks(old, op.hunks, op.path) : { text: old };
        if ('error' in r) return { ok: false, output: `The patch was not applied (no file was changed). ${r.error}` };
        if (op.to) {
          const to = resolvePath(ctx.cwd, op.to);
          changes.push({ path: to, old: fs.existsSync(to) ? fs.readFileSync(to, 'utf8') : null, text: r.text, from: p });
          changes.push({ path: p, old, text: null });
        } else changes.push({ path: p, old, text: r.text });
      }
    }
    const content = changes.flatMap((c) => diffContent(c.path, c.old, c.text ?? ''));
    const names = changes.map((c) => relPath(ctx.cwd, c.path));
    const risk = changes.map((c) => riskyWrite(c.path, ctx.cwd)).find(Boolean);
    const ok = await ctx.ask({ kind: 'edit', title: `Patch ${names.join(', ')}`, key: 'edit', rawInput: { files: names }, content, paths: changes.map((c) => ({ path: c.path, write: true })), risk });
    if (!ok) return { ok: false, output: 'The user declined this change.' };
    for (const c of changes) {
      ctx.seen?.read.add(c.path);
      if (c.text == null) fs.rmSync(c.path, { force: true });
      else {
        fs.mkdirSync(path.dirname(c.path), { recursive: true });
        fs.writeFileSync(c.path, c.text);
      }
    }
    const said = changes.map((c) => {
      const n = relPath(ctx.cwd, c.path);
      if (c.text == null) return `deleted ${n}`;
      if (c.old == null) return `${c.from ? `moved to` : 'added'} ${n}`;
      const before = c.old.split('\n').length;
      const after = c.text.split('\n').length;
      return `updated ${n} (${after - before >= 0 ? '+' : ''}${after - before} lines)`;
    });
    return { ok: true, output: `Patch applied: ${said.join(', ')}.`, content };
  },
};
