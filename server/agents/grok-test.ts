// Script tests for Grok Build's sign-in parsers: the link and code `grok login --device-auth` prints, and what `grok models`
// says of the sign-in. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/grok-test.ts && DATA_DIR=/tmp/hydor-test-grok node dist/dev/grok-test.js
import assert from 'node:assert/strict';
import { grokLoginPrompt, grokSignedIn } from './grok.ts';

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

console.log('grok-test: all passed');
