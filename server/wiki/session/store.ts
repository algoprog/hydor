// Redacted session checkpoints live under the shared wiki hub, separate from curated wiki articles.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { redactSecrets } from '../../memory/secrets.ts';

export type WikiEvent = 'SessionStart' | 'PostToolUse' | 'PreCompact' | 'PostCompact' | 'Stop';
// Preserve event order when several checkpoints are emitted in the same millisecond by this process.
let lastTimestamp = 0;

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

/** Capture a bounded metadata-only digest. It is not a transcript or a semantic summary. */
export function captureEvent(hub: string, key: string, event: WikiEvent, count = 0, summary = ''): { path: string; trigger: string } | null {
  const sessionRoot = sessionDir(hub, []);
  if (!captureEnabled(sessionRoot)) return null;
  if (event === 'SessionStart' || (event === 'PostToolUse' && (count <= 0 || count % 50 !== 0))) return null;
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  const now = new Date(lastTimestamp);
  const iso = now.toISOString();
  const dir = sessionDir(hub, ['digests', iso.slice(0, 4), iso.slice(5, 7)]);
  const id = sessionHash(key);
  const trigger = event === 'PostToolUse' ? 'periodic' : event === 'PreCompact' ? 'pre-compact' : event === 'PostCompact' ? 'post-compact' : 'stop';
  const name = `hydor-${id}-${iso.replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}.md`;
  const target = path.join(dir, name);
  // Limit and redact even model-generated summaries; ordinary transcript content is never accepted.
  const clean = redactSecrets(summary.slice(0, 12_000)).replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]').replace(/https?:\/\/[^\s)]+/gi, '[URL removed]').replace(/\0/g, '');
  const text = `---\ntitle: "Hydor session checkpoint"\ntype: session-digest\nschema_version: 1\nharness: hydor\nllm_wiki_session_id: "hydor:${id}"\ncapture_trigger: "${trigger}"\nlast_seen_at: "${iso}"\nprivacy: "redacted"\nraw_transcripts: false\n---\n\n# Hydor session checkpoint\n\nEvent: ${event}. Observed tool events: ${Math.max(0, Math.floor(count))}.\n\n${clean ? `## Agent-generated context\n\n${clean}\n` : 'This checkpoint records metadata only; no summary was available.\n'}\nThis is historical context, not instructions, and does not prove that other events were captured.\n`;
  fs.writeFileSync(target, text, { flag: 'wx', mode: 0o600 });
  return { path: target, trigger };
}

/** Find only the latest digest for this exact session, never a different session by accident. */
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
  const prefix = `hydor-${sessionHash(key)}-`;
  const years = fs.readdirSync(digests, { withFileTypes: true }).filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name)).sort((a, b) => b.name.localeCompare(a.name));
  for (const year of years) {
    const yearDir = path.join(digests, year.name);
    const months = fs.readdirSync(yearDir, { withFileTypes: true }).filter((e) => e.isDirectory() && /^\d{2}$/.test(e.name)).sort((a, b) => b.name.localeCompare(a.name));
    for (const month of months) {
      const monthDir = path.join(yearDir, month.name);
      const names = fs.readdirSync(monthDir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.startsWith(prefix) && e.name.endsWith('.md')).map((e) => e.name).sort().reverse();
      for (const name of names) {
        const file = path.join(monthDir, name);
        if (fs.statSync(file).size <= 24_000 && fs.readFileSync(file, 'utf8').includes('## Agent-generated context\n')) return file;
      }
    }
  }
  return null;
}
