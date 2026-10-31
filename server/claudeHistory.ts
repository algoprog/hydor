// Claude Code deletes its conversations after 30 days unless its settings say otherwise
// (cleanupPeriodDays). The app can ask it to keep them, so old sessions stay listed and openable.
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './auth.ts';
import { config } from './config.ts';

const KEEP_DAYS = 36500;
const settingsFile = () => path.join(path.dirname(config.claudeProjectsDir), 'settings.json');

export function claudeRetention(): { days: number; keep: boolean } {
  try {
    const d = Number(JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).cleanupPeriodDays);
    if (Number.isFinite(d) && d > 0) return { days: d, keep: d >= 3650 };
  } catch {}
  return { days: 30, keep: false };
}

/** Keeps Claude Code's conversations (or goes back to its default of 30 days). */
export function setClaudeRetention(keep: boolean) {
  let file = settingsFile();
  let settings: Record<string, unknown> = {};
  let mode = 0o644;
  try {
    // A settings file kept elsewhere (a dotfiles link) is changed where it lives.
    file = fs.realpathSync(file);
    mode = fs.statSync(file).mode & 0o777;
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new HttpError(500, `Could not read ${file}: fix it by hand first`);
  }
  if (keep) settings.cleanupPeriodDays = KEEP_DAYS;
  else delete settings.cleanupPeriodDays;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', { mode });
  fs.renameSync(tmp, file);
}
