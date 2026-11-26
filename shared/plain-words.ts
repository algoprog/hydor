// The words of web apps for a person who does not code (Technical details off): one glossary that the pages and the
// agent share (webapp_get and the session's first instructions give it to the agent), and the list of what a simple page
// may never say. web/src/features/webapps/plain-words-test.ts draws every simple page and card with realistic data and
// fails when one of these shows.

/** What a programmer would call it, and what the person is told. */
export const GLOSSARY: readonly (readonly [technical: string, plain: string])[] = [
  ['commit', 'saved step'],
  ['revert, rollback', 'undo'],
  ['launch, deploy', 'put it online'],
  ['environment, place', 'where it runs'],
  ['server, host, VPS', 'a server you rent'],
  ['API key, secret, STRIPE_SECRET_KEY', 'a key from Stripe, and what it is for'],
  ['contract check, tests', 'the app’s own checks'],
  ['database, tables', 'what it keeps'],
];

/**
 * Names a provider writes on its own pages and a person has to find there. Quoted (“…”) they may be said as they are;
 * unquoted, the same words count as any other.
 */
export const PROVIDER_LABELS: readonly string[] = [
  'SSH keys',
  'SSH Keys',
  'New SSH Key',
  'Add Public SSH Key',
  'SSH Key',
  'SSH Public Key',
  'Public IPv4',
  'API Tokens',
  'API Access',
  'Edit zone DNS',
  'API token (Edit zone DNS)',
  'DNS only',
  'Console',
  'API Key',
  'Secret Key',
  // As DigitalOcean, Cloudflare and Porkbun write them (server/webapps/services.json).
  'Create Droplet',
  'Authentication',
  'Password',
  'Additional Options',
  'Startup scripts',
  'Choose a datacenter region',
  'Choose an image',
  'Ubuntu',
  'Choose a Droplet Plan',
  'Basic',
  'Add SSH Key',
  'Public Key',
  'Key Name',
  'Web Console',
  'DNS',
  'Records',
  'Add record',
  'Proxy status',
  'Domain Management',
  'Details',
  'DNS Records',
  'Add Record',
  'A - Address record',
  'IPv4 address',
];

/** English words that are written with hyphens: anything else of that shape is taken for an id. */
const HYPHENATED = new Set(['sign-in', 'sign-ins', 'sign-up', 'sign-out', 'built-in', 'day-by-day', 'step-by-step', 'one-off', 'up-to-date', 'read-only', 'third-party', 'e-mail', 'e-mails', 'check-in', 'follow-up', 'opt-in', 'set-up', 'drop-off', 'pick-up', 'to-do', 'one-to-one', 'full-time', 'part-time', 'real-time', 'well-known', 'long-term', 'self-service', 'twenty-four', 'drag-and-drop', 'made-up']);

/** What a simple page never says, with the name the test gives it. */
export const BANNED: readonly { name: string; pattern: RegExp }[] = [
  { name: 'hydor.json', pattern: /hydor\.json/i },
  { name: 'a signal’s name', pattern: /\bSIG[A-Z]{3,}\b/ },
  { name: 'port', pattern: /\bports?\b/i },
  { name: 'commit', pattern: /\bcommit(s|ted|ting)?\b/i },
  { name: 'env', pattern: /\benv\b|\benvironment variables?\b|\.env\b/i },
  { name: 'npm or node', pattern: /\b(npm|npx|pnpm|yarn|node(\.js)?)\b/i },
  { name: 'Docker', pattern: /\b(docker|containers?)\b/i },
  { name: 'SSH', pattern: /\bssh\b/i },
  { name: 'git', pattern: /\b(git|repository|repo)\b/i },
  { name: 'a variable’s name', pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/ },
  { name: 'a command', pattern: /(^|\s)(--[a-z][a-z-]+\b|\$ )/ },
  { name: 'a file’s name', pattern: /\b[\w-]+\.(json|mjs|cjs|jsx?|tsx?|py|md|ya?ml|toml|sql|db|sqlite|sh|env|log|css|html)\b/i },
  { name: 'a path', pattern: /(^|[\s“"'(=:])(~|\.{1,2})?\/[A-Za-z0-9_.][\w.-]*|\b[\w.-]+\/[\w.-]+\/[\w.-]+/ },
  { name: 'a stack trace or a log line', pattern: /\bat [\w$.<>]+ \(|\bError:|\bTraceback\b|\b[A-Z]{3,5}ERR[A-Z]*\b|\bENOENT\b|\bexit code\b/ },
  { name: 'a fingerprint', pattern: /\bfingerprints?\b|SHA256:/i },
  { name: 'a technical word', pattern: /\b(HTTP|HTTPS|JSON|SQLite|SQL|stdout|stderr|sandbox|proxy|endpoint|CLI|localhost)\b/i },
];

/** The loopback addresses are looked for before web addresses are taken out of the words. */
const LOOPBACK = /\b127\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b0\.0\.0\.0\b|\blocalhost\b/i;
const KEBAB = /(?<![\w.@/-])[a-z]+(?:-[a-z0-9]+)+(?![\w@-]|\.[a-z])/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What of the banned list these words hold, each with the first place it shows (none: they are plain). */
export function bannedIn(text: string): { name: string; found: string }[] {
  const out: { name: string; found: string }[] = [];
  let t = text;
  for (const l of PROVIDER_LABELS) t = t.replace(new RegExp(`“${escape(l)}”`, 'g'), '“…”');
  const local = LOOPBACK.exec(t);
  if (local) out.push({ name: 'an address of this computer', found: local[0] });
  // A web address and a mail address are the person's own to read.
  t = t.replace(/\bhttps?:\/\/\S+/gi, ' ').replace(/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, ' ');
  for (const b of BANNED) {
    const m = b.pattern.exec(t);
    if (m) out.push({ name: b.name, found: m[0].trim() });
  }
  for (const m of t.matchAll(KEBAB)) {
    if (HYPHENATED.has(m[0].toLowerCase())) continue;
    out.push({ name: 'an id', found: m[0] });
    break;
  }
  return out;
}

/** What an agent is told of how to speak, by the person's switch. */
export function speakingNote(technical: boolean): string {
  if (technical) return 'How to speak: this person has Technical details on. You may name files, commands, saved steps and settings.';
  return `How to speak: this person has Technical details off and may not program. In everything they read (replies, cards, questions, saved steps, things to try) use plain words: ${GLOSSARY.map(([a, b]) => `“${b}” (not ${a})`).join(', ')}. Never name a file, a command, a variable, a library or an error’s text, and never ask them to decide anything technical. Give every command you run a description of one such sentence saying what it is for (“Install what the app needs”): they may be asked to allow it by that sentence alone.`;
}
