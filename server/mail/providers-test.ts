// Script tests for finding an address's mail servers (providers.ts): the app's own table (with its hint and help link),
// Outlook.com and Microsoft 365 named as not possible, a domain's own autoconfig file, Mozilla's directory by the domain
// and by its mail server, a company domain hosted by Google, a guess, and servers typed by hand. No network: the lookups
// are given stand-ins. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/mail/providers-test.ts
//   DATA_DIR=/tmp/hydor-test-mail-providers node dist/dev/providers-test.js
import assert from 'node:assert/strict';
import { baseDomain, cleanServer, knownProvider, lookupServers, parseAutoconfig, PROVIDERS } from './providers.ts';

let passed = 0;
const ok = async (name: string, f: () => void | Promise<void>) => {
  await f();
  passed++;
  console.log(`ok - ${name}`);
};

/** Lookups that find nothing but what `files` holds (by address), and these mail servers. */
const deps = (files: Record<string, string> = {}, mx: Record<string, string[]> = {}) => {
  const asked: string[] = [];
  return {
    asked,
    fetch: async (url: string) => {
      asked.push(url);
      return files[url] ?? null;
    },
    mx: async (d: string) => mx[d] ?? [],
  };
};

const config = (imap: string, smtp: string, user = '%EMAILADDRESS%') => `<?xml version="1.0"?>
<clientConfig version="1.1"><emailProvider id="x">
  <incomingServer type="pop3"><hostname>pop.example.net</hostname><port>995</port><socketType>SSL</socketType></incomingServer>
  <incomingServer type="imap"><hostname>${imap}</hostname><port>143</port><socketType>STARTTLS</socketType><username>${user}</username><authentication>password-cleartext</authentication></incomingServer>
  <incomingServer type="imap"><hostname>${imap}</hostname><port>993</port><socketType>SSL</socketType><username>${user}</username><authentication>OAuth2</authentication><authentication>password-cleartext</authentication></incomingServer>
  <outgoingServer type="smtp"><hostname>${smtp}</hostname><port>587</port><socketType>STARTTLS</socketType><username>%EMAILADDRESS%</username><authentication>password-cleartext</authentication></outgoingServer>
</emailProvider></clientConfig>`;

await ok('every provider in the table has servers, a hint and an https help page', () => {
  const ids = new Set<string>();
  for (const p of PROVIDERS) {
    assert.ok(!ids.has(p.id), `${p.id} twice`);
    ids.add(p.id);
    assert.ok(p.domains.length && p.imap.host && p.smtp.host, p.id);
    assert.ok(p.hint.length > 20 && p.hint.length < 300, `${p.id}'s hint is one line`);
    assert.match(p.help, /^https:\/\//, p.id);
  }
});

await ok('Gmail comes from the table, without asking anyone', async () => {
  const d = deps();
  const r = await lookupServers('Alex.Kim@gmail.com', d);
  assert.equal(r.source, 'known');
  assert.equal(r.provider?.name, 'Gmail');
  assert.deepEqual(r.imap, { host: 'imap.gmail.com', port: 993, security: 'tls' });
  assert.deepEqual(r.smtp, { host: 'smtp.gmail.com', port: 465, security: 'tls' });
  assert.match(r.provider!.hint, /app password/i);
  assert.match(r.provider!.help, /support\.google\.com/);
  assert.equal(d.asked.length, 0);
});

await ok('iCloud signs in to read with the part before the @, to send with the whole address', async () => {
  const r = await lookupServers('alex@icloud.com', deps());
  assert.equal(r.username, 'alex');
  assert.equal(r.smtpUsername, 'alex@icloud.com');
  assert.equal(r.smtp?.security, 'starttls');
});

await ok('Outlook.com, Hotmail and Microsoft 365 are named as not possible', async () => {
  for (const a of ['me@outlook.com', 'me@hotmail.co.uk', 'me@live.com', 'me@msn.com']) {
    const r = await lookupServers(a, deps());
    assert.match(r.blocked ?? '', /Microsoft/, a);
    assert.equal(r.imap, undefined);
  }
  const r = await lookupServers('me@contoso.org', deps({}, { 'contoso.org': ['contoso-org.mail.protection.outlook.com'] }));
  assert.match(r.blocked ?? '', /Microsoft 365/);
});

await ok('a domain’s own autoconfig file comes first, TLS from the start preferred, placeholders filled', async () => {
  const d = deps({ 'https://autoconfig.example.org/mail/config-v1.1.xml': config('imap.example.org', 'smtp.example.org', '%EMAILLOCALPART%') });
  const r = await lookupServers('kim@example.org', d);
  assert.equal(r.source, 'autoconfig');
  assert.deepEqual(r.imap, { host: 'imap.example.org', port: 993, security: 'tls' });
  assert.deepEqual(r.smtp, { host: 'smtp.example.org', port: 587, security: 'starttls' });
  assert.equal(r.username, 'kim');
  assert.equal(r.smtpUsername, 'kim@example.org');
  assert.equal(d.asked.length, 1);
  assert.ok(!d.asked[0].includes('kim'), 'the address itself is never sent');
});

await ok('then Mozilla’s directory by the domain', async () => {
  const d = deps({ 'https://autoconfig.thunderbird.net/v1.1/smallisp.net': config('mail.smallisp.net', 'mail.smallisp.net') });
  const r = await lookupServers('a@smallisp.net', d);
  assert.equal(r.imap?.host, 'mail.smallisp.net');
  assert.equal(r.username, undefined, 'the whole address is the user name');
  assert.deepEqual(d.asked, [
    'https://autoconfig.smallisp.net/mail/config-v1.1.xml',
    'https://smallisp.net/.well-known/autoconfig/mail/config-v1.1.xml',
    'https://autoconfig.thunderbird.net/v1.1/smallisp.net',
  ]);
});

await ok('a company domain whose mail goes to Google is Gmail, with its hint', async () => {
  const r = await lookupServers('team@acme.io', deps({}, { 'acme.io': ['aspmx.l.google.com', 'alt1.aspmx.l.google.com'] }));
  assert.equal(r.provider?.id, 'gmail');
  assert.equal(r.imap?.host, 'imap.gmail.com');
  assert.equal(r.domain, 'acme.io');
});

await ok('a domain whose mail server is in the directory under its own name', async () => {
  const d = deps({ 'https://autoconfig.thunderbird.net/v1.1/hostingco.de': config('imap.hostingco.de', 'smtp.hostingco.de') }, { 'shop.de': ['mx01.hostingco.de'] });
  const r = await lookupServers('info@shop.de', d);
  assert.equal(r.imap?.host, 'imap.hostingco.de');
  assert.equal(r.domain, 'shop.de');
});

await ok('nothing found: a guess for the sign-in test to confirm', async () => {
  const r = await lookupServers('me@unknown-domain.example', deps());
  assert.equal(r.source, 'guess');
  assert.equal(r.imap?.host, 'imap.unknown-domain.example');
  assert.equal(r.smtp?.host, 'smtp.unknown-domain.example');
});

await ok('an autoconfig file with OAuth only, or without SMTP, is not used', () => {
  const oauthOnly = config('imap.x.com', 'smtp.x.com').replace(/password-cleartext/g, 'OAuth2');
  assert.equal(parseAutoconfig(oauthOnly, 'a@x.com'), null);
  assert.equal(parseAutoconfig(config('imap.x.com', 'smtp.x.com').replace(/<outgoingServer[\s\S]*<\/outgoingServer>/, ''), 'a@x.com'), null);
});

await ok('servers typed by hand: names and ports checked, no plain connection off this computer', () => {
  assert.deepEqual(cleanServer({ host: 'Mail.Example.COM', security: 'starttls' }, 'smtp'), { host: 'mail.example.com', port: 587, security: 'starttls' });
  assert.deepEqual(cleanServer({ host: '127.0.0.1', port: 1143, security: 'none' }, 'imap'), { host: '127.0.0.1', port: 1143, security: 'none' });
  assert.throws(() => cleanServer({ host: 'mail.example.com', security: 'none' }, 'imap'), /only allowed to this computer/);
  assert.throws(() => cleanServer({ host: 'not a host' }, 'imap'), /server’s name/);
  assert.throws(() => cleanServer({ host: 'x.com', port: 70000 }, 'imap'), /port/);
});

await ok('the table and the base of a mail server’s name', () => {
  assert.equal(knownProvider('fastmail.com')?.name, 'Fastmail');
  assert.equal(knownProvider('example.com'), undefined);
  assert.equal(baseDomain('aspmx.l.google.com'), 'google.com');
  assert.equal(baseDomain('mx1.mail.example.co.uk'), 'example.co.uk');
});

console.log(`\n${passed} passed`);
