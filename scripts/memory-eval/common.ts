// Shared by the memory evaluation's scripts: where the copy of the database and the per-query files are, and the
// shapes of the test collection. Nothing here reads the live app's data: the copy is made by hand (README.md).
import os from 'node:os';
import path from 'node:path';

export const OUT = process.env.MEMORY_EVAL_OUT ?? '/tmp/memory-eval';
export const DB_COPY = process.env.MEMORY_EVAL_DB ?? path.join(OUT, 'copy.db');

/** Refuses the live data folder: this evaluation only ever reads a copy. */
export function assertCopy(file: string) {
  const live = path.join(os.homedir(), '.web-agent');
  if (path.resolve(file).startsWith(live + path.sep)) throw new Error('memory-eval works on a copy of the database, not on the live one');
}

import crypto from 'node:crypto';

/** What a query's vector is kept under: its text as the model gets it (cut to 2000 characters, as requestVector does). */
export const textKey = (text: string) => crypto.createHash('sha1').update(text.trim().slice(0, 2000)).digest('hex').slice(0, 16);

export interface Version {
  at: number;
  text: string;
}

export interface NoteRec {
  id: number;
  scope: 'global' | 'repo';
  scopeKey: string;
  kind: 'note' | 'topic';
  created: number;
  /** When it was deleted (Infinity: not). */
  deleted: number;
  /** Its texts over time, oldest first. */
  versions: Version[];
  children: number[];
}

export type Label = 'a' | 'b' | 'c';

export interface QueryRec {
  qid: number;
  /** An index of the session (the real key stays out of the files that may be shared). */
  session: number;
  /** 0 for the session's first message. */
  turn: number;
  ts: number;
  repo: string;
  text: string;
  /** Ids of the notes and topics that existed then, in the places the session sees. */
  pool: number[];
  /** Positives by source: a = found with recall later, b = changed later, c = named later in commands or files. */
  pos: Record<Label, number[]>;
  /** The part of b the agent itself did (remember, forget), not the learning pass. */
  bAgent: number[];
  /** Of a, the notes in the first five of a recall result (aTop), a stricter reading of "found". */
  aTop: number[];
  /** How many recall calls the agent made after this message. */
  recallCalls: number;
  hasTranscript: boolean;
}

export interface Collection {
  notes: Record<number, NoteRec>;
  queries: QueryRec[];
}

/** The text of a note as it was at a time. */
export function textAt(n: NoteRec, ts: number): string {
  let t = n.versions[0].text;
  for (const v of n.versions) if (v.at <= ts) t = v.text;
  return t;
}

/** The index of the version in force at a time. */
export function versionAt(n: NoteRec, ts: number): number {
  let i = 0;
  n.versions.forEach((v, j) => {
    if (v.at <= ts) i = j;
  });
  return i;
}

export const inPool = (n: NoteRec, ts: number) => n.created < ts && n.deleted > ts;
