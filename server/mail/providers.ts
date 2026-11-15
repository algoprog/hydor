// Which servers an address's mail is on: the well-known providers from a small table (with how to make an app
// password there), else what the provider publishes for mail programs (Mozilla's autoconfig: the domain's own
// file, then Mozilla's public directory of providers, then the directory again by the domain's mail server, which
// finds a company domain hosted by Google or Fastmail), else a guess the sign-in test confirms. Only the domain
// leaves this computer for a lookup, never the address. Outlook.com and Microsoft 365 are named as not possible:
// Microsoft turned app passwords off for them.
import dns from 'node:dns/promises';
import { isLoopback, MAIL_PORTS, type MailLookup, type MailProviderInfo, type MailSecurity, type MailServer } from '../../shared/mail.ts';
import { assertPublic, decodeEntities } from '../web/fetch.ts';

export interface Provider extends MailProviderInfo {
  domains: string[];
  /** Mail servers (MX) that mean a company domain is hosted here. */
  mx?: RegExp;
  imap: MailServer;
  smtp: MailServer;
  /** What to sign in with when it is not the whole address. */
  username?: 'local';
  smtpUsername?: 'local';
  /** Its SMTP server keeps a copy of what is sent in the Sent folder by itself (so the app does not add another). */
  savesSent?: boolean;
}

const tls = (host: string, port = 993): MailServer => ({ host, port, security: 'tls' });
const starttls = (host: string, port = 587): MailServer => ({ host, port, security: 'starttls' });

export const PROVIDERS: Provider[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    domains: ['gmail.com', 'googlemail.com'],
    mx: /(^|\.)(google\.com|googlemail\.com)$/,
    imap: tls('imap.gmail.com'),
    smtp: tls('smtp.gmail.com', 465),
    savesSent: true,
    hint: 'Gmail needs an app password: turn on 2-Step Verification in your Google Account, then make one under Security → App passwords and paste its 16 letters here. Work or school accounts need their admin to allow it.',
    help: 'https://support.google.com/accounts/answer/185833',
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    mx: /(^|\.)icloud\.com$/,
    imap: tls('imap.mail.me.com'),
    smtp: starttls('smtp.mail.me.com'),
    username: 'local',
    hint: 'iCloud needs an app-specific password: sign in at account.apple.com, open Sign-In and Security → App-Specific Passwords, and make one (two-factor authentication must be on).',
    help: 'https://support.apple.com/en-us/102654',
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    domains: ['fastmail.com', 'fastmail.fm', 'fastmail.net', 'fastmail.org', 'fastmail.us', 'fastmail.uk', 'sent.com', 'messagingengine.com'],
    mx: /(^|\.)messagingengine\.com$/,
    imap: tls('imap.fastmail.com'),
    smtp: tls('smtp.fastmail.com', 465),
    hint: 'Fastmail needs an app password: Settings → Privacy & Security → Manage app passwords, then New app password with access to mail (IMAP and SMTP).',
    help: 'https://www.fastmail.help/hc/en-us/articles/360058752854-App-passwords',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    domains: ['yahoo.com', 'ymail.com', 'rocketmail.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it', 'yahoo.ca', 'yahoo.com.au', 'yahoo.co.jp', 'yahoo.co.in', 'yahoo.gr'],
    mx: /(^|\.)yahoodns\.net$/,
    imap: tls('imap.mail.yahoo.com'),
    smtp: tls('smtp.mail.yahoo.com', 465),
    hint: 'Yahoo needs an app password: Account Info → Account Security → Generate app password (or Manage app passwords).',
    help: 'https://help.yahoo.com/kb/SLN15241.html',
  },
  {
    id: 'aol',
    name: 'AOL Mail',
    domains: ['aol.com', 'aim.com'],
    imap: tls('imap.aol.com'),
    smtp: tls('smtp.aol.com', 465),
    hint: 'AOL needs an app password: Account Info → Account Security → Generate app password.',
    help: 'https://help.aol.com/articles/Create-and-manage-app-password',
  },
  {
    id: 'gmx-com',
    name: 'GMX',
    domains: ['gmx.com', 'gmx.us', 'gmx.co.uk', 'gmx.fr', 'gmx.es'],
    imap: tls('imap.gmx.com'),
    smtp: starttls('mail.gmx.com'),
    hint: 'GMX: turn on POP3 & IMAP in your mailbox’s settings first; with two-factor authentication on, make an application-specific password and use it here.',
    help: 'https://support.gmx.com/pop-imap/imap/index.html',
  },
  {
    id: 'gmx',
    name: 'GMX',
    domains: ['gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch'],
    imap: tls('imap.gmx.net'),
    smtp: starttls('mail.gmx.net'),
    hint: 'GMX: turn on POP3 & IMAP in your mailbox’s settings first; with two-factor authentication on, make an application-specific password and use it here.',
    help: 'https://hilfe.gmx.net/pop-imap/imap/index.html',
  },
  {
    id: 'webde',
    name: 'WEB.DE',
    domains: ['web.de'],
    imap: tls('imap.web.de'),
    smtp: starttls('smtp.web.de'),
    hint: 'WEB.DE: turn on POP3 & IMAP in your mailbox’s settings first; with two-factor authentication on, make an application-specific password and use it here.',
    help: 'https://hilfe.web.de/pop-imap/imap/index.html',
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    domains: ['zoho.com', 'zohomail.com'],
    mx: /(^|\.)zoho\.com$/,
    imap: tls('imap.zoho.com'),
    smtp: tls('smtp.zoho.com', 465),
    hint: 'Zoho: turn on IMAP access in Mail Settings; with two-factor authentication on, make an app-specific password in your Zoho account’s security settings.',
    help: 'https://www.zoho.com/mail/help/imap-access.html',
  },
  {
    id: 'zoho-eu',
    name: 'Zoho Mail (EU)',
    domains: ['zohomail.eu', 'zoho.eu'],
    mx: /(^|\.)zoho\.eu$/,
    imap: tls('imap.zoho.eu'),
    smtp: tls('smtp.zoho.eu', 465),
    hint: 'Zoho: turn on IMAP access in Mail Settings; with two-factor authentication on, make an app-specific password in your Zoho account’s security settings.',
    help: 'https://www.zoho.com/mail/help/imap-access.html',
  },
  {
    id: 'yandex',
    name: 'Yandex Mail',
    domains: ['yandex.com', 'yandex.ru', 'ya.ru'],
    imap: tls('imap.yandex.com'),
    smtp: tls('smtp.yandex.com', 465),
    hint: 'Yandex needs an app password for mail: Yandex ID → Security → App passwords → Mail.',
    help: 'https://yandex.com/support/id/en/authorization/app-passwords.html',
  },
  {
    id: 'posteo',
    name: 'Posteo',
    domains: ['posteo.de', 'posteo.net', 'posteo.eu', 'posteo.at', 'posteo.ch', 'posteo.org', 'posteo.uk', 'posteo.com'],
    imap: tls('posteo.de'),
    smtp: starttls('posteo.de'),
    hint: 'Posteo: sign in with your Posteo address and its password (or an app password, if you made one).',
    help: 'https://posteo.de/en/help/how-do-i-set-up-posteo-in-an-email-client-pop3-imap-and-smtp',
  },
  {
    id: 'mailbox-org',
    name: 'mailbox.org',
    domains: ['mailbox.org'],
    imap: tls('imap.mailbox.org'),
    smtp: tls('smtp.mailbox.org', 465),
    hint: 'mailbox.org: sign in with your address and its password; with two-factor authentication on, use an app password from the settings.',
    help: 'https://kb.mailbox.org/en/private/faq/',
  },
  {
    id: 'proton',
    name: 'Proton Mail (with Proton Mail Bridge)',
    domains: ['proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me'],
    mx: /(^|\.)protonmail\.ch$/,
    imap: { host: '127.0.0.1', port: 1143, security: 'starttls' },
    smtp: { host: '127.0.0.1', port: 1025, security: 'starttls' },
    hint: 'Proton Mail works through Proton Mail Bridge (a paid plan): install it and sign in on this computer, then paste the password Bridge shows for this address (not your Proton password).',
    help: 'https://proton.me/support/protonmail-bridge-install',
  },
];

/** Microsoft's own mail: Outlook.com accounts, and Microsoft 365 by its mail servers. */
const MICROSOFT_DOMAINS = /^(outlook|hotmail|live|msn|windowslive|passport)\.[a-z.]{2,8}$/;
const MICROSOFT_MX = /(^|\.)(outlook\.com|office365\.us|hotmail\.com)$/;
export const MICROSOFT_BLOCKED =
  'Outlook.com, Hotmail and Microsoft 365 can’t connect this way: Microsoft turned off app passwords for them, so they need a Microsoft sign-in, which Hydor does not have yet.';

export const info = (p: Provider): MailProviderInfo => ({ id: p.id, name: p.name, hint: p.hint, help: p.help });

export const providerById = (id: string | undefined) => PROVIDERS.find((p) => p.id === id);

export function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1).trim().toLowerCase().replace(/\.$/, '') : '';
}

const localOf = (address: string) => address.slice(0, address.lastIndexOf('@'));

function fromProvider(p: Provider, address: string, domain: string, source: MailLookup['source'] = 'known'): MailLookup {
  return {
    domain,
    provider: info(p),
    imap: p.imap,
    smtp: p.smtp,
    ...(p.username === 'local' ? { username: localOf(address) } : {}),
    ...(p.smtpUsername === 'local' ? { smtpUsername: localOf(address) } : p.username === 'local' ? { smtpUsername: address } : {}),
    source,
  };
}

/** The provider an address's domain belongs to, from the table alone (no lookup). */
export function knownProvider(domain: string): Provider | undefined {
  return PROVIDERS.find((p) => p.domains.includes(domain));
}

// ---- autoconfig ---------------------------------------------------------------------------------------

type Fetcher = (url: string) => Promise<string | null>;

/** A file from the web, or null; only public addresses (each redirect checked too), small, in a few seconds. */
const fetchConfig: Fetcher = async (url) => {
  try {
    const signal = AbortSignal.timeout(6000);
    let u = new URL(url);
    for (let hop = 0; hop < 4; hop++) {
      if (u.protocol !== 'https:') return null;
      await assertPublic(u);
      const r = await fetch(u, { redirect: 'manual', signal, headers: { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5', 'user-agent': 'Hydor mail setup' } });
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        u = new URL(loc, u);
        continue;
      }
      if (!r.ok) return null;
      const text = await r.text();
      return text.length > 200_000 ? null : text;
    }
    return null;
  } catch {
    return null;
  }
};

const securityOf = (s: string): MailSecurity | null => (/^(ssl|tls)$/i.test(s.trim()) ? 'tls' : /^starttls$/i.test(s.trim()) ? 'starttls' : null);

/** The first server of a type in a Mozilla autoconfig file that takes a password over an encrypted connection. */
function pick(xml: string, tag: 'incomingServer' | 'outgoingServer', type: 'imap' | 'smtp', address: string, domain: string): (MailServer & { username?: string }) | null {
  const blocks = xml.match(new RegExp(`<${tag}\\s+type=["']${type}["'][^>]*>[\\s\\S]*?</${tag}>`, 'gi')) ?? [];
  const fill = (s: string) => s.replace(/%EMAILADDRESS%/g, address).replace(/%EMAILLOCALPART%/g, localOf(address)).replace(/%EMAILDOMAIN%/g, domain);
  const val = (b: string, t: string) => decodeEntities(new RegExp(`<${t}>\\s*([^<]*?)\\s*</${t}>`, 'i').exec(b)?.[1] ?? '');
  const ranked = blocks
    .map((b) => {
      const security = securityOf(val(b, 'socketType'));
      const auths = [...b.matchAll(/<authentication>\s*([^<]*?)\s*<\/authentication>/gi)].map((m) => m[1].toLowerCase());
      const host = fill(val(b, 'hostname')).toLowerCase();
      const port = Number(val(b, 'port'));
      const username = fill(val(b, 'username'));
      const ok = security && host && /^[a-z0-9.-]+$/.test(host) && port > 0 && port < 65536 && (!auths.length || auths.some((a) => /password-cleartext|plain|password-encrypted/.test(a)));
      return ok ? { host, port, security: security!, ...(username && username !== address ? { username } : {}) } : null;
    })
    .filter((x): x is MailServer & { username?: string } => !!x);
  // TLS from the start before STARTTLS, as mail programs prefer.
  return ranked.find((s) => s.security === 'tls') ?? ranked[0] ?? null;
}

/** The servers in an autoconfig file, when it has both an IMAP and an SMTP server. */
export function parseAutoconfig(xml: string, address: string): MailLookup | null {
  const domain = domainOf(address);
  const imap = pick(xml, 'incomingServer', 'imap', address, domain);
  const smtp = pick(xml, 'outgoingServer', 'smtp', address, domain);
  if (!imap || !smtp) return null;
  const strip = ({ host, port, security }: MailServer) => ({ host, port, security });
  return {
    domain,
    imap: strip(imap),
    smtp: strip(smtp),
    ...(imap.username ? { username: imap.username } : {}),
    ...(smtp.username && smtp.username !== imap.username ? { smtpUsername: smtp.username } : imap.username ? { smtpUsername: address } : {}),
    source: 'autoconfig',
  };
}

/** The registrable part of a host, roughly ("aspmx.l.google.com" → "google.com"; two-letter country domains keep one more). */
export function baseDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const two = parts.slice(-2);
  return (two[1].length === 2 && ['co', 'com', 'net', 'org', 'ac', 'gov', 'or', 'ne'].includes(two[0]) ? parts.slice(-3) : two).join('.');
}

export interface LookupDeps {
  fetch?: Fetcher;
  mx?: (domain: string) => Promise<string[]>;
}

const resolveMx = async (domain: string) => (await dns.resolveMx(domain).catch(() => [])).sort((a, b) => a.priority - b.priority).map((m) => m.exchange.toLowerCase());

/**
 * The servers for an address: the table, the domain's own autoconfig, Mozilla's directory (by the domain, then by
 * its mail server), the table again by its mail server (a company domain at Google, Fastmail, iCloud or Zoho), else a guess.
 */
export async function lookupServers(address: string, deps: LookupDeps = {}): Promise<MailLookup> {
  const get = deps.fetch ?? fetchConfig;
  const mxOf = deps.mx ?? resolveMx;
  const domain = domainOf(address);
  if (!domain) return { domain, source: 'none' };
  if (MICROSOFT_DOMAINS.test(domain)) return { domain, source: 'none', blocked: MICROSOFT_BLOCKED };
  const known = knownProvider(domain);
  if (known) return fromProvider(known, address, domain);
  // The domain's own published settings.
  for (const url of [`https://autoconfig.${domain}/mail/config-v1.1.xml`, `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`]) {
    const xml = await get(url);
    const r = xml ? parseAutoconfig(xml, address) : null;
    if (r) return r;
  }
  const ispdb = async (d: string) => {
    const xml = await get(`https://autoconfig.thunderbird.net/v1.1/${encodeURIComponent(d)}`);
    return xml ? parseAutoconfig(xml, address) : null;
  };
  const byDomain = await ispdb(domain);
  if (byDomain) return byDomain;
  // Where the domain's mail goes: a company domain hosted by a provider.
  const mx = await mxOf(domain);
  const first = mx[0];
  if (first) {
    if (mx.some((h) => MICROSOFT_MX.test(h))) return { domain, source: 'none', blocked: MICROSOFT_BLOCKED };
    const hosted = PROVIDERS.find((p) => p.mx && mx.some((h) => p.mx!.test(h)));
    if (hosted) return { ...fromProvider(hosted, address, domain), source: 'autoconfig' };
    const base = baseDomain(first);
    if (base && base !== domain) {
      const byMx = await ispdb(base);
      if (byMx) return { ...byMx, domain };
    }
  }
  // A guess, for the sign-in test to confirm.
  return { domain, imap: { host: `imap.${domain}`, port: 993, security: 'tls' }, smtp: { host: `smtp.${domain}`, port: 465, security: 'tls' }, source: 'guess' };
}

/** A server typed by hand, checked: a host name, a port, and a way in (plain only to this computer). */
export function cleanServer(v: unknown, kind: 'imap' | 'smtp'): MailServer {
  const o = (v ?? {}) as Record<string, unknown>;
  const host = String(o.host ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!host || host.length > 253 || !/^(\[?[0-9a-f:.]+\]?|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)$/.test(host)) throw new Error(`Give the ${kind === 'imap' ? 'incoming (IMAP)' : 'outgoing (SMTP)'} server’s name, like ${kind}.example.com`);
  const security: MailSecurity = o.security === 'starttls' || o.security === 'none' ? o.security : 'tls';
  if (security === 'none' && !isLoopback(host)) throw new Error('A connection without encryption is only allowed to this computer (a local bridge). Choose SSL/TLS or STARTTLS.');
  const port = Math.round(Number(o.port) || MAIL_PORTS[kind][security]);
  if (port < 1 || port > 65535) throw new Error('A port is a number from 1 to 65535');
  return { host, port, security };
}
