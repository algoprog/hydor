// Which conversations of a project are worth reading into its wiki. Every conversation gets a score from what the
// indexed text shows (SQL and a few patterns only, no model call): commits made in it, corrections by the user,
// failures fixed, and its length. A busy project has more conversations than a pass may read: the ones with the
// most signal go first, the latest first when they tie.
import type { DB } from '../../db.ts';
import { ownWords } from '../../memory/learn.ts';

export interface Signal {
  /** Commands that ran `git commit` or `git merge`. */
  commits: number;
  /** Messages of the user that start as a correction. */
  corrections: number;
  /** Times a failure the agent reported was followed by a later reply saying it was fixed or passing. */
  fixes: number;
  /** Messages of the user. */
  turns: number;
  score: number;
}

/** What each kind of signal weighs, and how many of it count (so one long session cannot drown the others). */
const WEIGHT = { commits: 3, corrections: 2, fixes: 2, turn: 0.25 };
const CAP = { commits: 5, corrections: 5, fixes: 3, turns: 20 };

const COMMIT = /(?:^|[\s;&|(])git\s+(?:-\S+\s+(?:\S+\s+)?)*(?:commit|merge)\b/;
/** A message that starts as a correction ("no, …", "that's wrong", "not what I asked", "instead…", "actually…", "don't…"). */
export const CORRECTION = /^[\s"'“(*_-]*(?:no\b[\s,.!:;-]|nope\b|that(?:'|’)?s (?:wrong|not|incorrect)|that is (?:wrong|not|incorrect)|not what i|instead\b|actually\b|don(?:'|’)?t\b|do not\b|wrong\b)/i;
const FAILURE = /\b(?:errors?|failed|failing|failures?|exceptions?|crash(?:ed|es)?|broke(?:n)?|regress(?:ed|ion))\b/i;
const FIXED = /\b(?:fixed|passes|passing|passed|all (?:the )?tests (?:pass|are green)|now works|works now|resolved|green)\b/i;

/** The signal of a session's text after `since` (a time in ms). */
export function conversationSignal(db: DB, key: string, since: number): Signal {
  let commits = 0;
  for (const r of db.prepare("select text from chunk_text where key = ? and kind = 'command' and coalesce(ts, 0) > ? and (text like '%git commit%' or text like '%git merge%')").all(key, since) as { text: string }[]) if (COMMIT.test(r.text)) commits++;
  let corrections = 0;
  let turns = 0;
  for (const r of db.prepare("select substr(text, 1, 1500) as text from chunk_text where key = ? and kind = 'user' and coalesce(ts, 0) > ?").all(key, since) as { text: string }[]) {
    const own = ownWords(r.text);
    if (!own) continue;
    turns++;
    if (CORRECTION.test(own)) corrections++;
  }
  // A failure reported, then (in a later reply) that it is fixed: counted once for each such pair.
  let fixes = 0;
  let failing = false;
  for (const r of db.prepare("select substr(text, 1, 3000) as text from chunk_text where key = ? and kind = 'assistant' and coalesce(ts, 0) > ? order by id limit 600").all(key, since) as { text: string }[]) {
    if (failing && FIXED.test(r.text)) {
      fixes++;
      failing = false;
    }
    if (FAILURE.test(r.text)) failing = true;
  }
  const score = Math.min(commits, CAP.commits) * WEIGHT.commits + Math.min(corrections, CAP.corrections) * WEIGHT.corrections + Math.min(fixes, CAP.fixes) * WEIGHT.fixes + Math.min(turns, CAP.turns) * WEIGHT.turn;
  return { commits, corrections, fixes, turns, score };
}

/** When the session last had a message of the user or a reply of the agent (0 when it has none). */
export function lastActivity(db: DB, key: string): number {
  return (db.prepare("select coalesce(max(ts), 0) as ts from chunk_text where key = ? and kind in ('user', 'assistant')").get(key) as { ts: number }).ts;
}
