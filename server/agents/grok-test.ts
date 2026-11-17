// Script tests for Grok Build's sign-in parsers: the link and code `grok login --device-auth` prints, and what `grok models`
// says of the sign-in. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/grok-test.ts && DATA_DIR=/tmp/hydor-test-grok node dist/dev/grok-test.js
import assert from 'node:assert/strict';
import { grokBilling, grokLoginPrompt, grokSignedIn, grokUsage } from './grok.ts';

const LOGIN = `To sign in, open this URL in your browser:

  https://accounts.x.ai/oauth2/device?user_code=S6NR-VBPF

  (Could not open browser automatically — open the URL above manually.)

Confirm this code in your browser:

  S6NR-VBPF

\x1b[90mOnly continue with a code you requested. Don't share it with anyone.\x1b[0m

Waiting for authorization...
`;

// The link and the code, from the whole output, with colours.
assert.deepEqual(grokLoginPrompt(LOGIN), { url: 'https://accounts.x.ai/oauth2/device?user_code=S6NR-VBPF', code: 'S6NR-VBPF' });
// Output that arrives in pieces: the link first, the code later.
const head = LOGIN.slice(0, LOGIN.indexOf('Confirm'));
assert.deepEqual(grokLoginPrompt(head), { url: 'https://accounts.x.ai/oauth2/device?user_code=S6NR-VBPF', code: 'S6NR-VBPF' }, 'the code the link carries');
assert.deepEqual(
  grokLoginPrompt('To sign in, open this URL in your browser:\n\n  https://accounts.x.ai/oauth2/device\n'),
  { url: 'https://accounts.x.ai/oauth2/device', code: undefined },
  'a link with no code yet',
);
assert.deepEqual(grokLoginPrompt('Confirm this code in your browser:\n\n  ABCD-1234\n'), { url: undefined, code: 'ABCD-1234' });
assert.deepEqual(
  grokLoginPrompt('\x1b[1mhttps://accounts.x.ai/oauth2/device?user_code=AAAA-BBBB\x1b[0m.\n'),
  { url: 'https://accounts.x.ai/oauth2/device?user_code=AAAA-BBBB', code: 'AAAA-BBBB' },
  'colours and a closing full stop are not part of it',
);
assert.deepEqual(grokLoginPrompt(''), { url: undefined, code: undefined });
assert.deepEqual(grokLoginPrompt('Waiting for authorization...'), { url: undefined, code: undefined });

// `grok models`: signed out, signed in (its first line), and anything else.
assert.deepEqual(grokSignedIn('You are not authenticated.\n\nDefault model: grok-4.6\n'), { loggedIn: false });
assert.deepEqual(grokSignedIn('\n\nYou are not authenticated.\n'), { loggedIn: false }, 'blank lines first');
assert.deepEqual(grokSignedIn('\x1b[33mYou are not authenticated.\x1b[0m\n'), { loggedIn: false });
assert.deepEqual(grokSignedIn('You are logged in with SuperGrok (alex@example.com).\n\nDefault model: grok-4.6\n'), {
  loggedIn: true,
  detail: 'SuperGrok (alex@example.com)',
  email: 'alex@example.com',
});
assert.deepEqual(grokSignedIn('You are logged in with an API key.\n'), { loggedIn: true, detail: 'an API key', email: undefined });
assert.deepEqual(grokSignedIn('You are logged in with\n'), null, 'no detail: not the format seen, so not a sign-in either');
assert.equal(grokSignedIn('Default model: grok-4.6\n'), null, 'neither said');
assert.equal(grokSignedIn(''), null);
assert.equal(grokSignedIn('\n  \n'), null);

// Plan usage. These answers are MADE UP (nobody has read a signed-in `_x.ai/billing` answer yet); they are plausible shapes
// the mapping must cope with, so that it can be made exact once a real one is seen.
const T = (iso: string) => Date.parse(iso);

// 1. Nested, snake case, money in cents, a billing cycle beside the usage, pay as you go.
const a = grokUsage({
  billing_config: { tier: 'SUPER_GROK_PLUS', credit_balance_cents: 1250, pay_as_you_go: { enabled: true, spending_cap_cents: 5000, used_cents: 1200 }, auto_topup: { enabled: false, threshold_cents: 500, amount_cents: 2000, max_per_month: 3 } },
  cycle: { start: '2026-11-10T00:00:00Z', end: '2026-11-17T00:00:00Z' },
  usage: { used_cents: 300, limit_cents: 1000, last_updated: '2026-11-12T10:00:00Z' },
});
assert.equal(a.agent, 'grok');
assert.equal(a.ok, true);
assert.equal(a.account?.plan, 'SuperGrok Plus');
assert.equal(a.windows.length, 1);
assert.deepEqual(a.windows[0], { id: 'weekly', label: 'Weekly', usedPercent: 30, resetsAt: T('2026-11-17T00:00:00Z'), windowMinutes: 10080 });
assert.deepEqual(a.credits, { balance: '12.5', hasCredits: true });
assert.deepEqual(a.extra, { enabled: true, monthlyLimit: 50, used: 12, utilization: 24, currency: 'USD' });
assert.equal(a.limited, undefined);

// 2. Flat, camel case, a percentage and epoch seconds, dollars as strings, a limit reached.
const b = grokUsage({ plan: 'SuperGrok Heavy', weeklyUsagePercent: 100, weeklyResetsAt: 1763337600, creditsBalance: '0.00', payAsYouGoEnabled: false });
assert.equal(b.account?.plan, 'SuperGrok Heavy');
assert.deepEqual(b.windows, [{ id: 'weekly', label: 'Weekly', usedPercent: 100, resetsAt: 1763337600_000, windowMinutes: 10080 }]);
assert.deepEqual(b.credits, { balance: '0', hasCredits: false });
assert.deepEqual(b.extra, { enabled: false, monthlyLimit: null, used: null, utilization: null, currency: 'USD' });
assert.deepEqual(b.limited, { label: 'Weekly limit', resetsAt: 1763337600_000 });

// 3. Wrapped numbers and protobuf timestamps, a period of seven days, a ratio, and a plan run by a team.
const c = grokUsage({
  subscription: { name: 'SuperGrok' },
  period_usage: { period: { start: { seconds: '1762732800' }, end: { seconds: '1763337600' } }, used: { val: '3' }, limit: { val: '40' } },
  managed_by_team: true,
});
assert.equal(c.account?.plan, 'SuperGrok');
assert.deepEqual(c.windows, [{ id: 'weekly', label: 'Weekly', usedPercent: 7.5, resetsAt: 1763337600_000, windowMinutes: 10080 }]);
assert.equal(c.note, 'Usage limits are managed by your team.');
assert.equal(grokUsage({ usage: { utilization: 0.42, period_end: '2026-12-01T00:00:00Z', period_start: '2026-11-01T00:00:00Z' } }).windows[0].usedPercent, 42);
assert.equal(grokUsage({ usage: { utilization: 0.42, period_end: '2026-12-01T00:00:00Z', period_start: '2026-11-01T00:00:00Z' } }).windows[0].label, 'Monthly');

// A flag that says the credit limit was reached, with no window at all; and nothing to read.
assert.deepEqual(grokUsage({ credits: { balance: 0 }, credit_limit_reached: true }).limited, { label: 'Credit limit', resetsAt: null });
const none = grokUsage({});
assert.deepEqual([none.ok, none.windows, none.credits, none.extra, none.limited, none.account], [true, [], undefined, undefined, undefined, undefined]);

// What the agent answers signed out, and the other errors.
const out = grokBilling({ error: { code: -32000, message: 'Authentication required', data: 'Authentication required to fetch billing data' } });
assert.deepEqual(out, { error: "Sign in to see Grok's plan usage.", keep: false });
assert.deepEqual(grokBilling({ error: { code: -32601, message: 'Method not found' } }), { error: 'This version of Grok Build does not report plan usage. Update it in Settings → Agents.', keep: false });
assert.deepEqual(grokBilling({ error: { code: -32603, message: 'Internal error' } }), { error: 'Grok Build could not read the plan usage: Internal error', keep: true });
assert.equal('usage' in grokBilling({ result: { plan: 'SuperGrok', usage: { used: 1, limit: 4 } } }), true);

console.log('grok-test: all passed');
