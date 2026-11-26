// What an evaluation might protect, as suggested from its command: the files of its folder that the command names (the
// script it runs, a data file it reads), the folders it points at, and the folder a named data file is in. Only names
// inside the folder, and never what the command writes. New evaluation offers them under "What must not change".
import fs from 'node:fs';
import path from 'node:path';

/** Suggested at most. */
const MOST = 20;
/** A program the command runs, rather than data it reads: its folder is not suggested with it. */
const SCRIPT = /\.(py|sh|bash|zsh|js|mjs|cjs|ts|rb|r|jl|pl|awk|php|lua)$/i;
/** An option that names what the command writes: sealing that would stop the next score. */
const WRITES = /^(-o|--?(out|output|out[-_]?(dir|file|path)|output[-_]?(dir|file|path)|log|log[-_]?(file|dir|path)|save|save[-_]?(dir|to|path)|results?|results?[-_]?(file|dir|path)|report|dump|write[-_]?to))=?$/i;
/** Folders that are never part of a scorer. */
const NOT_THESE = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__']);

const TOKEN = /"((?:\\.|[^"\\])*)"|'([^']*)'|(&&|\|\||>>|[;|&<>()\n])|([^\s"';&|<>()]+)/g;

interface Word {
  text: string;
  /** An operator of the shell, not a word. */
  op?: boolean;
}

const words = (command: string): Word[] => [...command.matchAll(TOKEN)].map((m) => (m[3] !== undefined ? { text: m[3], op: true } : { text: m[1] ?? m[2] ?? m[4] }));

/** `rel` from the folder, or null when `p` is the folder itself, outside it, or in a folder that is never sealed. */
function within(root: string, p: string): string | null {
  const rel = path.relative(root, p);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  return parts.some((s) => NOT_THESE.has(s)) ? null : parts.join('/');
}

const statOf = (p: string) => fs.promises.stat(p).catch(() => null);

export async function suggestProtected(cwd: string, command: string): Promise<string[]> {
  const root = path.resolve(cwd);
  if (!(await statOf(root))?.isDirectory()) return [];
  const files: string[] = [];
  const folders: string[] = [];
  const list = words(command.slice(0, 20_000));
  let base = root;
  let start = true;
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (w.op) {
      // What follows ">" is written, not read.
      if (w.text === '>' || w.text === '>>') i++;
      else start = true;
      continue;
    }
    const first = start;
    start = false;
    if (first && w.text === 'cd' && list[i + 1] && !list[i + 1].op) {
      const to = path.resolve(base, list[++i].text);
      if (to === root || within(root, to)) base = to;
      continue;
    }
    if (WRITES.test(w.text)) {
      i++;
      continue;
    }
    let value = w.text;
    const eq = /^(-[^=]*)=(.*)$/s.exec(value);
    if (eq) {
      if (WRITES.test(eq[1])) {
        // --out="a b": the value is the next word.
        if (!eq[2]) i++;
        continue;
      }
      value = eq[2];
    }
    // python -m package.module
    const prev = list[i - 1];
    const module = prev && !prev.op && prev.text === '-m' && /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(value) ? value.replace(/\./g, '/') : null;
    const tried = module ? [`${module}.py`, module] : [value];
    // Options, placeholders, variables and patterns name no one file.
    if (!value || value.startsWith('-') || value.length > 500 || /[{}$*?\n]/.test(value)) continue;
    for (const name of tried) {
      const full = path.resolve(base, name);
      const rel = within(root, full);
      if (!rel) continue;
      const st = await statOf(full);
      if (st?.isDirectory()) folders.push(`${rel}/`);
      else if (st?.isFile()) {
        files.push(rel);
        // A data file's folder usually holds the rest of what it is scored against.
        const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
        if (dir && !SCRIPT.test(rel)) folders.push(dir);
      } else continue;
      break;
    }
    if (files.length + folders.length >= MOST * 2) break;
  }
  return [...new Set([...files, ...folders])].slice(0, MOST);
}
