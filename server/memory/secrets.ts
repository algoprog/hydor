// What never goes into memory. Secrets: what looks like a key, a token, a password or a card number is
// taken out of what the helper reads, and a note that still carries one is not saved. And text written
// to steer an agent ("ignore the previous instructions…"). The helper is told the same; these patterns
// catch what it misses.

/** Shapes of well-known keys and tokens: each is a secret wherever it appears. */
const SHAPES: [string, RegExp][] = [
  ['a private key', /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/],
  ['an API key', /\bsk-(?:ant-|proj-|or-v1-|live-|test-)?[A-Za-z0-9_-]{20,}/],
  ['a payment API key', /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/],
  ['an AWS key', /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{16}\b/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['a GitLab token', /\bglpat-[A-Za-z0-9_-]{20,}/],
  ['a Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['a Google API key', /\bAIza[0-9A-Za-z_-]{35}/],
  ['a Hugging Face token', /\bhf_[A-Za-z0-9]{30,}/],
  ['an npm token', /\bnpm_[A-Za-z0-9]{36}/],
  ['an access token', /\bac_[A-Za-z0-9_-]{32}\b/],
  ['a web token', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['a bearer token', /\b(?:Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{20,}/],
  ['a password in an address', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i],
];

/**
 * "password = …", "OPENAI_API_KEY: …", "my password is …": a credential named, then given. The name
 * may have a prefix ("DB_", "access") and a suffix after a separator ("_FILE"), not "tokenizer".
 */
const NAMED =
  /\b(?:[a-z0-9_-]*(?:password|passwd|passphrase|passcode|secret|token|api[_ -]?key|access[_ -]?key|private[_ -]?key|client[_ -]?secret)(?:[_-][a-z0-9]+)*|pin(?: code)?)["']?\s*(?:[:=]|\bis\b|\bwas\b)\s*["']?([^\s"'`,;]{4,})/gi;

/** Long random-looking strings: mixed case and digits with little repetition. */
const RANDOM = /[A-Za-z0-9+/_=-]{32,}/g;

/** Card numbers: 13 to 19 digits, maybe in groups. */
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;

/** A value that reads like a credential rather than a word ("is stored", "is read from the env"). */
function credentialLike(v: string): boolean {
  if (/^[<{$[(]|^\*+$|^x{3,}$|\.{3}|your|example|placeholder|redacted|removed/i.test(v)) return false;
  return v.length >= 6 && (/\d/.test(v) || /[^A-Za-z0-9]/.test(v) || (/[a-z]/.test(v) && /[A-Z]/.test(v)));
}

function entropy(s: string): number {
  const n = new Map<string, number>();
  for (const c of s) n.set(c, (n.get(c) ?? 0) + 1);
  let h = 0;
  for (const k of n.values()) h -= (k / s.length) * Math.log2(k / s.length);
  return h;
}

function randomLike(s: string): boolean {
  const count = (re: RegExp) => (s.match(re) ?? []).length;
  return count(/[A-Z]/g) >= 3 && count(/[a-z]/g) >= 3 && count(/\d/g) >= 3 && entropy(s) >= 4.2;
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

/** Where secrets are in the text: [start, end, what] for each. */
function findSecrets(text: string): [number, number, string][] {
  const out: [number, number, string][] = [];
  for (const [what, re] of SHAPES) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of text.matchAll(g)) out.push([m.index!, m.index! + m[0].length, what]);
  }
  for (const m of text.matchAll(NAMED)) {
    if (!credentialLike(m[1])) continue;
    const end = m.index! + m[0].length;
    out.push([end - m[1].length, end, 'a password or key']);
  }
  for (const m of text.matchAll(RANDOM)) if (randomLike(m[0])) out.push([m.index!, m.index! + m[0].length, 'a key or token']);
  for (const m of text.matchAll(CARD)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 13 && luhn(digits)) out.push([m.index!, m.index! + m[0].length, 'a card number']);
  }
  return out;
}

/**
 * Text written to steer an agent ("ignore the previous instructions", "you are now…") is not a note
 * about anyone: kept, it would reach every later session's instructions.
 */
const STEERING =
  /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all|any|your|system)\b[^.\n]{0,20}\b(?:instructions?|prompts?|rules?|directions?)\b|\bsystem prompt\b|\byou are now\b|\bnew instructions?\s*:/i;

export const steeringIn = (text: string) => STEERING.test(text);

/** What kind of secret the text holds ("an API key"), or null when it seems to hold none. */
export function secretIn(text: string): string | null {
  return findSecrets(text)[0]?.[2] ?? null;
}

/** The text with every secret in it replaced by "[secret removed]". */
export function redactSecrets(text: string): string {
  const spans = findSecrets(text).sort((a, b) => a[0] - b[0]);
  if (!spans.length) return text;
  let out = '';
  let at = 0;
  for (const [s, e] of spans) {
    if (e <= at) continue;
    out += text.slice(at, Math.max(at, s)) + '[secret removed]';
    at = e;
  }
  return out + text.slice(at);
}
