// Claude Code deletes its conversations after 30 days unless its settings say otherwise
// (cleanupPeriodDays). The app tells it to keep them, in every Claude Code config that does not say
// how long (the default one and each added account's), so old sessions stay listed and openable; the app
// also keeps its own link to each (indexer/kept.ts). Deleting old sessions is the app's own setting
// (server/keep).
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './auth.ts';
import { agentRoots, config } from './config.ts';

const KEEP_DAYS = 36500;
const settingsFile = () => path.join(path.dirname(config.claudeProjectsDir), 'settings.json');

/** Each Claude Code config that does not say how long to keep conversations is told to keep them. */
export function keepClaudeHistoryByDefault() {
  for (const projects of agentRoots.claudeProjects) {
    const file = path.join(path.dirname(projects), 'settings.json');
    try {
      let settings: Record<string, unknown> = {};
      try {
        settings = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        // A settings file that does not read as JSON is left as it is.
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') continue;
        // No config folder at all: Claude Code is not set up there.
        if (!fs.existsSync(path.dirname(file))) continue;
      }
      if (settings.cleanupPeriodDays === undefined) writeSettings(file, (x) => (x.cleanupPeriodDays = KEEP_DAYS));
    } catch (e) {
      console.warn(`[history] could not tell Claude Code to keep its conversations (${file}): ${(e as Error).message}`);
    }
  }
}

export function claudeRetention(): { days: number; keep: boolean } {
  try {
    const d = Number(JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).cleanupPeriodDays);
    if (Number.isFinite(d) && d > 0) return { days: d, keep: d >= 3650 };
  } catch {}
  return { days: 30, keep: false };
}

/** Keeps Claude Code's conversations (or goes back to its default of 30 days). */
export function setClaudeRetention(keep: boolean) {
  writeSettings(settingsFile(), (s) => {
    if (keep) s.cleanupPeriodDays = KEEP_DAYS;
    else delete s.cleanupPeriodDays;
  });
}

/** Changes a Claude Code settings file in place (where it really lives, keeping its mode), all at once. */
function writeSettings(at: string, change: (s: Record<string, unknown>) => void) {
  let file = at;
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
  change(settings);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', { mode });
  fs.renameSync(tmp, file);
}
