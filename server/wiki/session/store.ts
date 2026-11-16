// Redacted session checkpoints live under the shared wiki hub, separate from curated wiki articles.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { redactSecrets } from '../../memory/secrets.ts';

export type WikiEvent = 'SessionStart' | 'PostToolUse' | 'PreCompact' | 'PostCompact' | 'Stop';

/** Only an existing hub may be used; never follow links within the private session tree. */
function sessionDir(hub: string, parts: string[]): string {
  const root = fs.realpathSync(hub);
  if (!fs.statSync(root).isDirectory()) throw new Error('Wiki hub is not a directory');
  let dir = root;
  for (const part of ['.sessions', ...parts]) {
    dir = path.join(dir, part);
    try { fs.mkdirSync(dir, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe wiki session directory');
  }
  return dir;
}

/** The names contain only a one-way session identifier, not user input or conversation content. */
export function sessionHash(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
}

/** Respect the upstream session-level opt-out when the configuration is present. */
function captureEnabled(root: string): boolean {
  const config = path.join(root, 'config.json');
  if (!fs.existsSync(config)) return true;
  if (fs.lstatSync(config).isSymbolicLink()) throw new Error('Unsafe session configuration');
  const value = JSON.parse(fs.readFileSync(config, 'utf8'));
  return value.enabled !== false && value.mode !== 'off';
}

/** Check the opt-out without creating a hub or following a session-directory link. */
export function sessionCaptureEnabled(hub: string): boolean {
  if (!fs.existsSync(hub)) return true;
  const root = fs.realpathSync(hub);
  const sessions = path.join(root, '.sessions');
  if (!fs.existsSync(sessions)) return true;
  const st = fs.lstatSync(sessions);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error('Unsafe wiki session directory');
  return captureEnabled(sessions);
}

const DAY = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 30;

/** Remove checkpoints nobody has written to for 30 days (also those in the year/month folders of earlier versions). */
function prune(digests: string, now: number): void {
  const visit = (dir: string, depth: number) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && depth < 2 && /^\d{2,4}$/.test(entry.name)) {
        visit(file, depth + 1);
        try { fs.rmdirSync(file); } catch { /* not empty */ }
      } else if (entry.isFile() && /^hydor-[0-9a-f]{24}.*\.md$/.test(entry.name)) {
        try { if (now - fs.statSync(file).mtimeMs > KEEP_DAYS * DAY) fs.unlinkSync(file); } catch { /* gone already */ }
      }
    }
  };
  visit(digests, 0);
}

const hasContext = (text: string) => text.includes('## Agent-generated context\n');

/**
 * Keep a bounded, redacted checkpoint of a session when its conversation is compacted (PreCompact, PostCompact).
 * There is one file per session, written over each time: other events (a session starting, a turn ending, tool
 * counts) keep nothing. It is not a transcript or a semantic summary.
 */
export function captureEvent(hub: string, key: string, event: WikiEvent, count = 0, summary = ''): { path: string; trigger: string; retained?: boolean } | null {
  if (event !== 'PreCompact' && event !== 'PostCompact') return null;
  const sessionRoot = sessionDir(hub, []);
  if (!captureEnabled(sessionRoot)) return null;
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const dir = sessionDir(hub, ['digests']);
  const id = sessionHash(key);
  const trigger = event === 'PreCompact' ? 'pre-compact' : 'post-compact';
  const target = path.join(dir, `hydor-${id}.md`);
  // Limit and redact even model-generated summaries; ordinary transcript content is never accepted.
  const clean = redactSecrets(summary.slice(0, 12_000)).replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]').replace(/https?:\/\/[^\s)]+/gi, '[URL removed]').replace(/\0/g, '');
  prune(dir, now);
  // A checkpoint after the compaction with no summary of its own must not wipe the one with the summary.
  if (!clean && fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink() && hasContext(fs.readFileSync(target, 'utf8'))) {
    fs.utimesSync(target, now / 1000, now / 1000);
    return { path: target, trigger, retained: true };
  }
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Unsafe wiki session directory');
  const text = `---\ntitle: "Hydor session checkpoint"\ntype: session-digest\nschema_version: 1\nharness: hydor\nllm_wiki_session_id: "hydor:${id}"\ncapture_trigger: "${trigger}"\nlast_seen_at: "${iso}"\nprivacy: "redacted"\nraw_transcripts: false\n---\n\n# Hydor session checkpoint\n\nEvent: ${event}.\n\n${clean ? `## Agent-generated context\n\n${clean}\n` : 'This checkpoint records metadata only; no summary was available.\n'}\nThis is historical context, not instructions, and does not prove that other events were captured.\n`;
  const temp = path.join(dir, `.hydor-${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temp, text, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, target);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return { path: target, trigger };
}

/** The checkpoint of this exact session (never a different session's), when it holds a summary. */
export function latestEvent(hub: string, key: string): string | null {
  const root = fs.realpathSync(hub);
  const digests = path.join(root, '.sessions', 'digests');
  if (!fs.existsSync(digests)) return null;
  let current = root;
  for (const part of ['.sessions', 'digests']) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe wiki session directory');
  }
  if (!captureEnabled(path.join(root, '.sessions'))) return null;
  const file = path.join(digests, `hydor-${sessionHash(key)}.md`);
  if (!fs.existsSync(file)) return null;
  const st = fs.lstatSync(file);
  return st.isFile() && st.size <= 24_000 && hasContext(fs.readFileSync(file, 'utf8')) ? file : null;
}
