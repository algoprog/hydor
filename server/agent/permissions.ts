// Whether a tool call goes ahead without asking the user: by the session's mode, the rules saved with
// "Always allow", and checks no rule overrides. Risky commands and files ask every time, in every mode.
// In the asking modes (Ask, Accept edits, Plan), so do files outside the session folder and files that
// hold keys or passwords, until the user allows that folder or file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { within, type Part } from './shell.ts';

export type AcpKind = 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'other';

export interface Ask {
  kind: AcpKind;
  title: string;
  rawInput: unknown;
  content?: unknown[];
  /** What "Always allow" saves for it: "edit", "mcp:<tool>". */
  key?: string;
  /** A command's parts: each runs when a rule covers it, or when it only looks around. */
  parts?: Part[];
  /** Files it reads or writes ('' for a write whose target is not known). */
  paths?: { path: string; write?: boolean }[];
  /** Why it asks every time, whatever the mode and the rules. */
  risk?: string;
  /** Why it could not be read with confidence: it asks, with no "Always allow". */
  opaque?: string;
}

export interface Verdict {
  ok: boolean;
  /** What "Always allow" saves; none: it is not offered. */
  save: string[];
  /** Why it asks, for the card's title. */
  why?: string;
}

const HOME = os.homedir();
const TEMP = [...new Set([os.tmpdir(), '/tmp', '/var/tmp'])];
/** The app's own data (its database, API keys, other conversations): the folder above models/agent.json. */
const APP_DATA = (() => {
  const models = process.env.NAGET_AGENT_MODELS ? path.dirname(process.env.NAGET_AGENT_MODELS) : '';
  return models ? (path.basename(models) === 'models' ? path.dirname(models) : models) : path.join(HOME, '.naget-agent');
})();

/** Files that hold keys and passwords. */
export function isSecret(p: string): boolean {
  if (!p) return false;
  const name = path.basename(p);
  if (/^\.env(\..+)?$/.test(name) && !/\.(example|sample|template|dist|defaults?)$/.test(name)) return true;
  if (/^(id_(rsa|dsa|ecdsa|ed25519)(_sk)?|.+\.(pem|key|p12|pfx|jks|keystore|kdbx)|\.netrc|\.npmrc|\.pypirc|\.git-credentials|\.pgpass|\.vault-token|credentials(\.json)?|\.htpasswd)$/.test(name)) return true;
  if (within(p, APP_DATA)) return true;
  const rel = within(p, HOME) ? path.relative(HOME, p) : '';
  return /^(\.ssh|\.aws|\.gnupg|\.azure|\.kube|\.docker|\.password-store|\.config\/(gcloud|gh)|\.claude\/\.credentials\.json|\.codex\/auth\.json)(\/|$)/.test(rel);
}

/** The folder a rule for this file covers: itself for a folder, else the one it is in. */
function folderOf(p: string): string {
  if (p.length > 1 && p.endsWith('/')) return p.replace(/\/+$/, '');
  return fs.statSync(p, { throwIfNoEntry: false })?.isDirectory() ? p : path.dirname(p);
}

/** A rule saved with "Always allow" that covers this part of a command: its words begin with the rule's. */
export function ruleCovers(allow: string[], part: Part): boolean {
  return allow.some((r) => {
    if (!r.startsWith('cmd:')) return false;
    const want = r.slice(4).split(' ').filter(Boolean);
    const starts = (ws: string[]) => want.length > 0 && want.every((w, k) => ws[k] === w);
    return starts(part.words) || starts(part.raw);
  });
}

/** Where a path really is: symlinks followed (for a file not made yet, its folder's). */
function real(p: string, depth = 0): string {
  const slash = p.length > 1 && p.endsWith('/') ? '/' : '';
  try {
    return fs.realpathSync(p) + slash;
  } catch {
    // A link to something that is not there (yet): where it points.
    if (depth < 8 && fs.lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink()) return real(path.resolve(path.dirname(p), fs.readlinkSync(p)), depth + 1);
    try {
      return path.join(fs.realpathSync(path.dirname(p)), path.basename(p)) + slash;
    } catch {
      return p;
    }
  }
}

/** Git's own files: its settings and hooks run commands the next time git runs. */
const gitInternal = (p: string) => /(^|\/)\.git(\/|$)/.test(p);

/**
 * Whether `r` goes ahead, and if not, what "Always allow" would save. `readable` are folders read freely:
 * the session's own (long output, pages it fetched) and the skills' (their reference files).
 */
export function decide(r: Ask, o: { mode: string; allow: string[]; cwd: string; readable?: string[] }): Verdict {
  if (r.risk) return { ok: false, save: [], why: `asks every time: it ${r.risk}` };
  if (o.mode === 'full') return { ok: true, save: [] };
  const need: string[] = [];
  const add = (k: string) => void (need.includes(k) || need.push(k));
  let why: string | undefined;
  const cwd = real(o.cwd);
  const readable = (o.readable ?? []).map(real);
  const temp = TEMP.map(real);
  for (const p of r.paths ?? []) {
    if (!p.path) {
      if (p.write) add('write:?');
      why ??= 'it writes a file it cannot name in advance';
      continue;
    }
    // Checked where it really is: a link inside the folder to a file outside it is outside.
    const at = real(p.path);
    if (readable.some((d) => within(at, d)) && (!p.write || within(at, readable[0]))) continue;
    if (isSecret(p.path) || isSecret(at) || (p.write && gitInternal(at))) {
      if (!o.allow.includes(`secret:${p.path}`)) {
        add(`secret:${p.path}`);
        why ??= gitInternal(at) && !isSecret(at) ? 'it changes git’s own settings or hooks' : `${p.write ? 'it changes' : 'it reads'} a file that holds keys or passwords`;
      }
      continue;
    }
    if (within(at, cwd) || temp.some((t) => within(at, t))) continue;
    const covered = o.allow.some((a) => (a.startsWith('write:') || (!p.write && a.startsWith('read:'))) && within(at, real(a.slice(a.indexOf(':') + 1))));
    if (covered) continue;
    add(`${p.write ? 'write' : 'read'}:${folderOf(at)}`);
    why ??= p.write ? 'it changes files outside the session folder' : 'it reads outside the session folder';
  }
  if (r.parts) {
    for (const part of r.parts) if (!part.safe && (part.inline || !ruleCovers(o.allow, part))) add(`cmd:${part.key}`);
  } else if (r.kind === 'edit') {
    if (o.mode !== 'edits' && !o.allow.includes('edit')) add('edit');
  } else if (r.key && !o.allow.includes(r.key)) add(r.key);
  if (r.opaque) return { ok: false, save: [], why: why ?? 'it could not be read with confidence' };
  if (!need.length) return { ok: true, save: [] };
  // No rule can cover code given inline, or a file whose name is not known in advance.
  const always = !(r.parts ?? []).some((p) => p.inline && !p.safe) && !need.includes('write:?');
  return { ok: false, save: always ? need : [], why };
}

const short = (p: string) => (within(p, HOME) && p !== HOME ? `~${p.slice(HOME.length)}` : p);

/** The "Always allow" button: what it will let through from now on. */
export function alwaysLabel(save: string[]): string {
  if (save.length === 1 && save[0] === 'edit') return 'Allow all edits';
  const what = save.map((k) => {
    const at = k.indexOf(':');
    const kind = at < 0 ? k : k.slice(0, at);
    const v = k.slice(at + 1);
    if (kind === 'cmd') return v === 'find-delete' ? 'find … -delete' : `${v} …`;
    if (kind === 'read') return `reading in ${short(v)}`;
    if (kind === 'write') return `changes in ${short(v)}`;
    if (kind === 'secret') return short(v);
    if (kind === 'mcp') return v.replace(/^mcp__/, '').replace('__', ': ');
    if (kind === 'edit') return 'all edits';
    return k;
  });
  const text = what.join(', ');
  return `Always allow ${text.length > 72 ? `${text.slice(0, 70)}…` : text}`;
}
