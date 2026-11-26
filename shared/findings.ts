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

// ---- which numbers are measured results -------------------------------------------------------------
// A number in what was learned must come from a run, a score or a table (or be what a paper in the evidence reports),
// so it matters which digits are such a number. Digits that are part of a name or an identifier (BM25, nDCG@10,
// TREC-3, k1, a DOI, an arXiv id, a commit, a version), years and dates, counts of things ("3 seeds", "60 queries",
// "seed 2") and ordinals ("2nd") are not. Anything else is: when in doubt, it is asked for its run.

/** Whole stretches that name something: taken out before the numbers are read. */
const IDENTIFIERS: RegExp[] = [
  // Addresses, DOIs and arXiv ids.
  /\b(?:https?:\/\/|www\.)\S+/gi,
  /\b(?:doi:\s*)?10\.\d{4,9}\/\S+/gi,
  /\barxiv\s*:?\s*(?:\d{4}\.\d{4,5}|[a-z-]+\/\d{7})(?:v\d+)?/gi,
  /(?<![\d.])(?:0[7-9]|1\d|2\d)(?:0[1-9]|1[0-2])\.\d{5}(?:v\d+)?(?![\d%]|\.\d)/g,
  // A commit's hash: hex digits with both letters and figures.
  /(?<![\p{L}\p{N}])(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,64}(?![\p{L}\p{N}])/gu,
  // Dates, versions and numbered references.
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}\b(?![.,]\d|%)/g,
  /\b\d+\.\d+\.\d+(?:\.\d+)*\b/g,
  /\b(?:[Vv]ersion|[Vv]er\.)\s*v?\d+(?:\.\d+)*/g,
  /\[\d+(?:\s*[,–-]\s*\d+)*\]/g,
  // A thing named by its number: "seed 2", "seeds 1-3", "epoch 10", "Table 4", "top 10".
  /\b(?:seeds?|folds?|epoch|step|run|query|queries|layers?|tables?|figures?|fig\.|sections?|pages?|appendix|chapters?|equations?|eq\.|top)\s+#?\d+(?:(?:\s*[-–]\s*|\s*,\s*|\s+(?:and|to)\s+)\d+)*(?![\p{L}\p{N}%]|[.,]\d|\s*(?:%|×|(?:times|percent|points?|pp|ms)\b))/giu,
];

/** What a number may count: "3 seeds", "60 synthetic dev queries". */
const COUNTED =
  /^(?:seeds?|runs?|quer(?:y|ies)|documents?|docs?|examples?|samples?|folds?|datasets?|collections?|corpora|corpus|models?|epochs?|steps?|iterations?|layers?|passages?|topics?|questions?|papers?|tries|try|trials?|settings?|variants?|baselines?|tasks?|languages?|users?|judges?|annotators?|turns?|sessions?|shards?|gpus?|cpus?|machines?|methods?|systems?|splits?|batch(?:es)?|tokens?|words?|pages?|rows?|files?|terms?|candidates?|judg(?:e)?ments?|classes|class|labels?|categor(?:y|ies)|metrics?|experiments?|configs?|configurations?|parameters?|features?|benchmarks?|authors?|stages?|heads?)$/i;
/** A word that ends the count's reach: after one of these the number is not counting what follows. */
const NOT_BETWEEN =
  /^(?:on|of|in|at|by|over|for|to|than|with|from|per|and|or|the|a|an|is|was|are|were|more|less|fewer|better|worse|higher|lower|faster|slower|times|x|ms|s|sec|secs|seconds?|minutes?|hours?|days?|percent|percentage|points?|pp|[kmgt]i?b)$/i;
const UNIT = /^\s*(?:%|×|(?:x|ms|s|sec|seconds?|minutes?|hours?|percent|points?|pp|times|[kmgt]i?b)\b)/i;

/** Is the whole number before this text a count of things? */
function counts(after: string): boolean {
  // "3 of 5 datasets": what the 5 counts, the 3 counts too.
  const rest = after.replace(/^\s+(?:of|out of)\s+(?:the\s+)?\d+/i, '');
  for (const word of (/^(?:[ \t-]+\p{L}[\p{L}'’-]*){0,4}/u.exec(rest)?.[0] ?? '').split(/[ \t-]+/).filter(Boolean)) {
    if (COUNTED.test(word)) return true;
    if (NOT_BETWEEN.test(word)) return false;
  }
  return false;
}

/** The numbers a text gives as measured results (a measure, a gain, a share), as they are written, each once. */
export function measuredNumbers(text: string): string[] {
  let t = String(text ?? '');
  for (const re of IDENTIFIERS) t = t.replace(re, ' ; ');
  const out: string[] = [];
  for (const m of t.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const n = m[0];
    const before = t.slice(0, m.index);
    const after = t.slice(m.index + n.length);
    // Part of a name: BM25, nDCG@10, H2, GPT-4, v1.2, #12, "3D", "8B", "5-fold".
    if (/[\p{L}\p{N}_@#]$/u.test(before) || /[\p{L}\p{N}][-./]$/u.test(before)) continue;
    if (/^(?:st|nd|rd|th)\b/.test(after)) continue;
    const whole = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(n);
    if (whole && /^(?:[DB]\b|-(?:fold|stage|gram|shot|way|layer|hop|dim|dimensional|head|class|turn)\b)/.test(after)) continue;
    const sign = /(?:^|[^\p{L}\p{N}])([+−±-])$/u.exec(before)?.[1] ?? '';
    const unit = UNIT.exec(after)?.[0].trim() ?? '';
    if (!sign && !unit && /^(?:19|20)\d\d$/.test(n)) continue;
    if (!sign && whole && counts(after)) continue;
    const written = `${sign}${n}${unit === '%' ? '%' : ''}`;
    if (!out.includes(written)) out.push(written);
  }
  return out;
}

/** Does a text give a measured number (see measuredNumbers)? */
export const holdsNumber = (t: string) => measuredNumbers(t).length > 0;

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
