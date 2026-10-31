// A second opinion's question and answer: what the reviewer is shown (the user's request, what the agent
// ran, the diff of the files it changed, its final reply) and how its findings are read back.
import type { Finding, OpinionNote, Severity } from '../../shared/opinion.ts';
import { mergedDiffs, type Turn } from './turns.ts';

export const OPINION_SYSTEM = [
  'You give an independent second opinion on work another AI agent did for a user. You did not do the work and have no stake in it.',
  '',
  'Check the work against what the user asked:',
  '- Missing: asked for but not done, or claimed but not actually done.',
  '- Wrong: bugs, broken logic, wrong facts or numbers, a misread request.',
  '- Risky: changes that could break something else, lose data or leak secrets.',
  '- Extra: changes nobody asked for that get in the way.',
  '',
  "The agent's final reply is a set of claims, not evidence: check them against the diff and the commands it ran.",
  'Rate each finding by what it means for the user: critical (wrong, broken or unsafe as it stands), important (fix it before relying on the work), minor (worth a look, fine to leave).',
  'Report only real problems you can point to, with the file and line where one applies. No style preferences, no padding. If the work holds up, say so.',
  'Only read: never change a file or run anything that changes something.',
  '',
  'Answer with one JSON object and nothing else:',
  '{"verdict": "looks_good" or "issues", "summary": "one or two sentences on how the work holds up", "findings": [{"severity": "critical" | "important" | "minor", "title": "a short line", "detail": "what is wrong, why it matters, how to fix it", "file": "path or null", "line": number or null}]}',
].join('\n');

export interface OpinionInput {
  /** Who did the work: "Claude Code", "Custom · Qwen3 Coder". */
  agent: string;
  turn: Turn;
  /** The user's earlier messages that set the scene (the first one, the one before this turn). */
  earlier?: string[];
  /** The session's folder, when the reviewer can open files there. */
  cwd?: string;
  /** Most characters the whole question may take (a small model's context). */
  maxChars?: number;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n… (${(s.length - n).toLocaleString('en-US')} more characters)` : s);

/** The question for the reviewer; `files` and `trimmed` say what of the diff it saw. */
export function buildOpinionPrompt(o: OpinionInput): { system: string; prompt: string; files: number; trimmed: boolean } {
  const t = o.turn;
  const max = Math.max(12_000, o.maxChars ?? 100_000);
  const head: string[] = ['## What the user asked', clip(t.prompt?.text.trim() || '(no text)', Math.min(8000, max / 8))];
  const earlier = (o.earlier ?? []).map((e) => e.trim()).filter(Boolean);
  if (earlier.length) head.push('', '## Earlier in the conversation, for context', ...earlier.map((e) => `- ${clip(e.replace(/\s+/g, ' '), 1500)}`));
  head.push('', `## What the agent (${o.agent}) ran`);
  if (t.commands.length) head.push(...t.commands.slice(-40).map((c) => `- ${c.title.replace(/\s+/g, ' ').slice(0, 200)}${c.failed ? '  (failed)' : ''}`));
  else head.push('No commands.');
  const tail = ['', "## The agent's final reply", clip(t.reply || '(no reply)', Math.min(20_000, max / 5)), '', '## Your task'];
  tail.push(
    `Check the work above against what the user asked.${o.cwd ? ` You are in the session's folder (${o.cwd}) and can open files there to check something specific.` : ''} Answer with the JSON object only.`,
  );
  const files = mergedDiffs(t.files);
  const body: string[] = ['', '## The files it changed'];
  let trimmed = false;
  if (!files.length) body.push('None: the work is the reply itself. Check its facts, its reasoning, and whether it does what was asked.');
  else {
    body.push(files.map((f) => `- ${f.path} (+${f.added} −${f.removed})`).join('\n'), '');
    let room = Math.max(4000, max - head.join('\n').length - tail.join('\n').length - 2000);
    const left: string[] = [];
    for (const f of files) {
      const block = `--- ${f.path}\n${f.diff || '(no diff recorded)'}\n`;
      if (block.length <= room) {
        body.push('```diff', block.trimEnd(), '```');
        room -= block.length;
      } else if (room > 2000) {
        body.push('```diff', `${block.slice(0, room - 200)}\n… (the rest of this file's diff was left out to fit)`, '```');
        room = 0;
        trimmed = true;
      } else left.push(f.path);
    }
    if (left.length) {
      trimmed = true;
      body.push(`The diffs of these files were left out to fit: ${left.join(', ')}.${o.cwd ? ' Open them yourself if they matter.' : ''}`);
    }
  }
  return { system: OPINION_SYSTEM, prompt: [...head, ...body, ...tail].join('\n'), files: files.length, trimmed };
}

// ---- reading the answer --------------------------------------------------------------------------

const SEVERITY: Record<string, Severity> = {
  critical: 'critical',
  blocker: 'critical',
  severe: 'critical',
  high: 'critical',
  important: 'important',
  major: 'important',
  medium: 'important',
  moderate: 'important',
  minor: 'minor',
  low: 'minor',
  nit: 'minor',
  nitpick: 'minor',
  trivial: 'minor',
  suggestion: 'minor',
};
const RANK: Record<Severity, number> = { critical: 0, important: 1, minor: 2 };

const str = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t && t.toLowerCase() !== 'null' && t.toLowerCase() !== 'none' ? t : undefined;
};

/** The first JSON object in a reply: in a ```json block, or from its first { to its last }. */
function jsonIn(text: string): Record<string, any> | null {
  const tries = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) {
    try {
      const v = JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch {}
  }
  return null;
}

function finding(x: unknown): Finding | null {
  if (!x || typeof x !== 'object') return null;
  const f = x as Record<string, unknown>;
  const title = str(f.title) ?? str(f.issue) ?? str(f.summary) ?? str(f.description);
  if (!title) return null;
  let file = str(f.file) ?? str(f.path) ?? str(f.location);
  let line = Number(f.line ?? f.lineNumber);
  const at = file ? /^(.*?):(\d+)(?:[:-]\d+)?$/.exec(file) : null;
  if (at) {
    file = at[1];
    if (!(line > 0)) line = Number(at[2]);
  }
  const detail = str(f.detail) ?? str(f.details) ?? str(f.explanation) ?? (str(f.title) ? str(f.description) : undefined);
  const out: Finding = { severity: SEVERITY[String(f.severity ?? f.level ?? f.priority ?? '').trim().toLowerCase()] ?? 'important', title: title.length > 240 ? `${title.slice(0, 239)}…` : title };
  if (detail && detail !== title) out.detail = detail.slice(0, 4000);
  if (file) out.file = file;
  if (Number.isInteger(line) && line > 0) out.line = line;
  return out;
}

/** "Critical: …", "- [Important] …", "**Minor** — …" in a reply that is not JSON. */
function lineFinding(l: string): Finding | null {
  const m = /^\s*(?:[-*•]|\d+[.)])?\s*(?:\*\*|\[|\()?\s*(critical|important|minor)\s*(?:\*\*|\]|\))?\s*[:\-–—]?\s*(.{3,})$/i.exec(l);
  if (!m) return null;
  const rest = m[2].replace(/^\*\*\s*/, '').trim();
  const at = /\(?`?([\w./-]+\.\w+):(\d+)`?\)?/.exec(rest);
  return { severity: m[1].toLowerCase() as Severity, title: rest.slice(0, 240), ...(at ? { file: at[1], line: Number(at[2]) } : {}) };
}

/** The reviewer's answer as findings, worst first. "Looks good" when nothing critical or important came up. */
export function parseOpinion(raw: string): Pick<OpinionNote, 'verdict' | 'summary' | 'findings'> {
  const text = raw.trim();
  const obj = jsonIn(text);
  let findings: Finding[];
  let summary: string | undefined;
  if (obj) {
    findings = (Array.isArray(obj.findings) ? obj.findings : Array.isArray(obj.issues) ? obj.issues : []).map(finding).filter((f: Finding | null): f is Finding => !!f);
    summary = str(obj.summary);
  } else {
    findings = text.split('\n').map(lineFinding).filter((f): f is Finding => !!f);
    if (!findings.length && !/\b(looks? good|lgtm|no (issues|problems|findings))\b/i.test(text)) return { verdict: 'unclear', summary: text.slice(0, 3000) || 'The reviewer gave no answer.', findings: [] };
    summary = findings.length ? undefined : text.split('\n').find((l) => l.trim())?.trim().slice(0, 600);
  }
  findings.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  return { verdict: findings.some((f) => f.severity !== 'minor') ? 'issues' : 'good', summary, findings };
}
