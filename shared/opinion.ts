// Second opinion: another company's model checks one turn's work against what was asked.

export type Severity = 'critical' | 'important' | 'minor';

export interface Finding {
  severity: Severity;
  title: string;
  /** What is wrong, why it matters, how to fix it. */
  detail?: string;
  file?: string;
  line?: number;
}

/** A note of kind "opinion", under the turn it checks. */
export interface OpinionNote {
  status: 'running' | 'done' | 'failed';
  /** "claude", "codex", or one of Custom's model ids. */
  reviewer: string;
  reviewerLabel: string;
  /** The turn it checks: the id of the message that began it. */
  turn: string;
  /** The start of that message, for the card. */
  request?: string;
  startedAt: number;
  endedAt?: number;
  verdict?: 'good' | 'issues' | 'unclear';
  summary?: string;
  findings?: Finding[];
  error?: string;
  /** Files the turn changed (the reviewer saw their diff), and whether some of it was left out to fit. */
  files?: number;
  trimmed?: boolean;
}

export interface Reviewer {
  id: string;
  label: string;
  detail?: string;
}

/** What the dialog offers: reviewers from other companies (the suggested one first), and recent finished turns. */
export interface OpinionOptions {
  reviewers: Reviewer[];
  turns: { id: string; text: string; at?: number; files: number }[];
}

export const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', important: 'Important', minor: 'Minor' };

/** Findings as a message for the agent that did the work (all of them, or the ones picked). */
export function findingsMessage(reviewer: string, findings: Finding[]): string {
  const lines = findings.map((f, i) => `${i + 1}. [${SEVERITY_LABEL[f.severity]}] ${f.title}${f.file ? ` (${f.file}${f.line ? `:${f.line}` : ''})` : ''}${f.detail ? `\n   ${f.detail.replace(/\n/g, '\n   ')}` : ''}`);
  return `A second opinion from ${reviewer} on your last turn's work:\n\n${lines.join('\n')}\n\nCheck each point against the work; fix what holds up, and say which you leave and why.`;
}
