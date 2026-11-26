// A finding: one thing a project tried and what came of it, kept as a memory note of its own kind with its evidence,
// dead ends included. Its note's text is written from it (findingText), so search by words and by meaning finds it as
// it finds any note.

/** How it came out. "open": stated, not tested yet. */
export type FindingVerdict = 'supported' | 'refuted' | 'unclear' | 'open';
export const FINDING_VERDICTS: FindingVerdict[] = ['supported', 'refuted', 'unclear', 'open'];
/** The verdict in a word. */
export const VERDICT_WORD: Record<FindingVerdict, string> = { supported: 'Supported', refuted: 'Refuted', unclear: 'Unclear', open: 'Open' };

export type EvidenceKind = 'run' | 'score' | 'table' | 'commit' | 'file' | 'paper' | 'session';
export const EVIDENCE_KINDS: EvidenceKind[] = ['run', 'score', 'table', 'commit', 'file', 'paper', 'session'];
/** The kinds a number in what was learned may come from. */
export const NUMBER_EVIDENCE: EvidenceKind[] = ['run', 'score', 'table'];

export interface FindingEvidence {
  kind: EvidenceKind;
  /** A run's id; a score as "<evaluation id>/<score id>"; a table's id; a commit; a file in the project; a paper's address; a session's key. */
  ref: string;
  label?: string;
}

export interface FindingData {
  verdict: FindingVerdict;
  /** The hypothesis or claim, one sentence. */
  statement: string;
  /** What came of it, one or two sentences: the numbers, where it holds, why it failed. */
  learned?: string;
  evidence: FindingEvidence[];
  /** The finding this one took the place of: it stays in the history, out of the list. */
  replaces?: number;
  /** An app's run recorded it (a research sprint), rather than an agent in a session. */
  run?: { id: string; app?: string };
}

export const MAX_EVIDENCE = 12;
export const MAX_STATEMENT = 300;
export const MAX_LEARNED = 450;
export const MAX_REF = 300;
export const MAX_LABEL = 80;

/**
 * A finding's note text: its verdict in a word, the statement, what was learned. At most 800 characters, as a topic
 * (the parts' own limits keep it within that).
 */
export const findingText = (f: Pick<FindingData, 'verdict' | 'statement' | 'learned'>): string => `${VERDICT_WORD[f.verdict]}: ${f.statement}${f.learned ? ` — ${f.learned}` : ''}`;

/**
 * Does a text give a number (a measure, a count, a share)? Digits that are part of a name do not: BM25, nDCG@10, H2,
 * GPT-4, v1.2, #12.
 */
export const holdsNumber = (t: string) => /(?<![\p{L}\p{N}_@#])(?<![\p{L}\p{N}][-.])\p{N}/u.test(t);

/** A finding as stored or sent, kept to its shape; null when it is not one. */
export function findingOf(v: unknown): FindingData | null {
  const f = v as Partial<FindingData> | null;
  if (!f || typeof f.statement !== 'string' || !FINDING_VERDICTS.includes(f.verdict as FindingVerdict)) return null;
  const evidence = (Array.isArray(f.evidence) ? f.evidence : [])
    .filter((e): e is FindingEvidence => !!e && EVIDENCE_KINDS.includes(e.kind) && typeof e.ref === 'string' && !!e.ref)
    .map((e) => ({ kind: e.kind, ref: e.ref, ...(typeof e.label === 'string' && e.label ? { label: e.label } : {}) }));
  return {
    verdict: f.verdict as FindingVerdict,
    statement: f.statement,
    ...(typeof f.learned === 'string' && f.learned ? { learned: f.learned } : {}),
    evidence,
    ...(Number.isInteger(f.replaces) ? { replaces: f.replaces } : {}),
    ...(f.run && typeof f.run.id === 'string' ? { run: { id: f.run.id, ...(typeof f.run.app === 'string' ? { app: f.run.app } : {}) } } : {}),
  };
}
