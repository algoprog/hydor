// What a proposed skill must not carry. Skills are plain files every agent reads at the start of its
// work, so a secret in one leaks to each of them, and text in one that tries to steer agents (ignore
// your instructions, hide this from the user, send the keys somewhere) would keep working on every
// session that loads it. Secrets stop a proposal; the rest is shown to the user on the card.
import type { ScanFinding } from '../../shared/skillpack.ts';

interface Rule {
  re: RegExp;
  what: string;
  /** For secrets: the matched value is a real-looking one, not a placeholder. */
  real?: (value: string) => boolean;
}

const PLACEHOLDER = /^(?:x+|\*+|\.+|<[^>]*>|\{[^}]*\}|\$\{?[\w.]+\}?|%[\w]+%|your[\w-]*|my[\w-]*|example[\w-]*|changeme|redacted|placeholder|secret|password|token|api[_-]?key|none|null|undefined|test|dummy|sample)$/i;

/** Mixed letters and digits, not a word or a placeholder: likely a real value. */
function realValue(v: string): boolean {
  const s = v.replace(/^['"]|['"]$/g, '');
  if (s.length < 10 || PLACEHOLDER.test(s) || /^(.)\1+$/.test(s) || /\s/.test(s)) return false;
  if (!/[a-z]/i.test(s) || !/\d/.test(s)) return false;
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h >= 3;
}

const SECRETS: Rule[] = [
  { re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/, what: 'a private key' },
  { re: /\bsk-ant-[\w-]{20,}/, what: 'an Anthropic API key' },
  { re: /\bsk-or-v1-[a-f0-9]{32,}/, what: 'an OpenRouter API key' },
  { re: /\bsk-(?:proj-|svcacct-|admin-)?[\w-]{20,}/, what: 'an API key (sk-…)', real: realValue },
  { re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, what: 'an AWS access key' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_\w{40,}/, what: 'a GitHub token' },
  { re: /\bglpat-[\w-]{20,}/, what: 'a GitLab token' },
  { re: /\bxox[abposr]-[\w-]{10,}/, what: 'a Slack token' },
  { re: /\bAIza[\w-]{35}\b/, what: 'a Google API key' },
  { re: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/, what: 'a Stripe key' },
  { re: /\bhf_[A-Za-z0-9]{30,}\b/, what: 'a Hugging Face token' },
  { re: /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/, what: 'a signed token (JWT)' },
  { re: /\bBearer\s+([\w.~+/-]{20,}=*)/, what: 'a bearer token', real: realValue },
  { re: /\b[a-z][\w+.-]*:\/\/[^\s:/@]+:([^\s@/]{4,})@/i, what: 'a password inside an address', real: (v) => !PLACEHOLDER.test(v) && !/^pass(word)?$/i.test(v) },
  {
    re: /\b(?:password|passwd|pwd|passphrase|secret|api[_-]?key|access[_-]?key|auth[_-]?token|token|client[_-]?secret)\b["']?\s*[:=]\s*["']?([^\s"'`,;]{8,})/i,
    what: 'a password or key written out',
    real: realValue,
  },
];

const INJECTION: Rule[] = [
  { re: /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|earlier|above|other|system|all)\b[^.\n]{0,20}\b(?:instructions?|rules|prompts?|guidelines|messages)\b/i, what: 'tells agents to ignore their instructions' },
  { re: /\byou are now\b|\bfrom now on,? you (?:are|will|must)\b|\bnew system prompt\b|<\/?system>|\[system\]|^#+\s*system\b/im, what: 'tries to replace who the agent is or its system prompt' },
  { re: /\b(?:do not|don['’]t|never)\s+(?:tell|inform|show|mention|let)\b[^.\n]{0,30}\b(?:the )?user\b|\bwithout (?:telling|asking|informing|showing) (?:the )?user\b|\bhide (?:this|it) from\b/i, what: 'tells agents to keep something from the user' },
  { re: /--dangerously-skip-permissions|\bbypassPermissions\b|approval_policy\s*=\s*["']?never|\b(?:always|automatically|auto-?)\s*(?:approve|allow|accept)\b|\bskip (?:the )?(?:approval|confirmation|permission)s?\b/i, what: 'tries to get around approvals' },
  { re: /\b(?:curl|wget|nc|ncat|Invoke-WebRequest|iwr)\b[^\n]*(?:\$\{?\w*(?:KEY|TOKEN|SECRET|PASS)\w*|~\/\.ssh|id_rsa|\.env\b|\/etc\/passwd|\.aws\/credentials|\.netrc)/i, what: 'sends keys or private files somewhere' },
  { re: /\b(?:send|post|upload|email|forward)\b[^.\n]{0,30}\b(?:api keys?|tokens?|credentials|secrets|passwords|private keys?|\.env)\b[^.\n]{0,30}\b(?:to|at)\b/i, what: 'asks agents to send credentials somewhere' },
  { re: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b|\biex\s*\(\s*(?:iwr|Invoke-WebRequest)/i, what: 'runs a script straight from the internet' },
  {
    re: /\b(?:write|edit|append|add|modify|overwrite|change|echo)\b[^\n]{0,60}(?:\.claude\/settings|\.codex\/config|CLAUDE\.md|AGENTS\.md|\.bashrc|\.zshrc|\.profile|authorized_keys|crontab)/i,
    what: 'changes agent settings or startup files',
  },
  { re: /\brm\s+-[a-z]*r[a-z]*f?\s+(?:\/(?:\s|$)|~\/?(?:\s|$)|\$HOME\b)|\bmkfs\b|\bdd\s+if=[^\n]*of=\/dev\//i, what: 'deletes or overwrites far outside a project' },
  { re: /<!--[^]*?\b(?:ignore|instruction|assistant|system|you must|do not tell)\b[^]*?-->/i, what: 'hides instructions in an HTML comment' },
];

/** Characters a reader cannot see that can carry hidden text: zero-width, direction overrides, tags. */
const HIDDEN = /[\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E\u2066-\u2069]|\uDB40[\uDC00-\uDC7F]/;

const mask = (s: string) => (s.length <= 8 ? '••••' : `${s.slice(0, 4)}••••${s.slice(-2)}`);

function excerpt(line: string, at: number, len: number, secret: string | null): string {
  let s = line;
  if (secret) s = s.split(secret).join(mask(secret));
  const start = Math.max(0, Math.min(at, s.length) - 40);
  const out = s.slice(start, start + Math.max(len, 60) + 80).trim();
  return `${start > 0 ? '…' : ''}${out}${start + Math.max(len, 60) + 80 < s.length ? '…' : ''}`.replace(HIDDEN, '⟨hidden⟩').slice(0, 200);
}

/** Secrets and steering text in a skill, line by line. */
export function scanSkill(text: string): ScanFinding[] {
  const out: ScanFinding[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const r of SECRETS) {
      const m = r.re.exec(line);
      if (!m) continue;
      const value = m[1] ?? m[0];
      if (r.real && !r.real(value)) continue;
      out.push({ kind: 'secret', what: r.what, line: i + 1, excerpt: excerpt(line, m.index, m[0].length, value) });
      break;
    }
    if (HIDDEN.test(line)) out.push({ kind: 'injection', what: 'has characters you cannot see', line: i + 1, excerpt: excerpt(line, line.search(HIDDEN), 1, null) });
  });
  // Instructions can run over a line break: these are looked for in the whole text.
  for (const r of INJECTION) {
    const re = new RegExp(r.re.source, r.re.flags.includes('g') ? r.re.flags : `${r.re.flags}g`);
    for (const m of text.matchAll(re)) {
      const line = text.slice(0, m.index).split('\n').length;
      if (out.some((f) => f.what === r.what && f.line === line)) continue;
      out.push({ kind: 'injection', what: r.what, line, excerpt: excerpt(lines[line - 1] ?? '', m.index - text.lastIndexOf('\n', m.index) - 1, m[0].length, null) });
      if (out.filter((f) => f.what === r.what).length >= 3) break;
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/** The findings that stop a save, in words for the agent or the user. */
export function secretsMessage(findings: ScanFinding[]): string | null {
  const s = findings.filter((f) => f.kind === 'secret');
  if (!s.length) return null;
  const where = s
    .slice(0, 3)
    .map((f) => `${f.what} on line ${f.line}`)
    .join('; ');
  return `This looks like it holds a secret (${where}). Skills are plain files every agent reads, so they must never hold keys or passwords: take it out, and say where the secret is kept instead (an environment variable, the app's vault, a file only the user can read).`;
}
