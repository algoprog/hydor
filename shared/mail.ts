// Email: mail accounts connected with an address and an app password (IMAP to read, SMTP to send), as the
// connection "email" in Apps → Connected apps. What the server and the pages share. The password never
// travels in any of these: only a masked hint.

/** How a mail server is reached: TLS from the start (993, 465), STARTTLS (143, 587), or plain (only on this computer). */
export type MailSecurity = 'tls' | 'starttls' | 'none';

export interface MailServer {
  host: string;
  port: number;
  security: MailSecurity;
}

/** A provider the app knows: its servers, and how to make an app password there. */
export interface MailProviderInfo {
  id: string;
  name: string;
  /** One line: how to make an app password (or what else the sign-in needs). */
  hint: string;
  /** The provider's own help page for it. */
  help: string;
}

/** What the connect form fills in from an address. */
export interface MailLookup {
  /** The address's domain. */
  domain: string;
  provider?: MailProviderInfo;
  imap?: MailServer;
  smtp?: MailServer;
  /** The user name to sign in with, when it is not the whole address (iCloud: the part before the @ for IMAP). */
  username?: string;
  /** The user name for sending, when it differs from the one for reading. */
  smtpUsername?: string;
  /**
   * Where the servers came from: the app's own list, the provider's published settings (autoconfig), or a guess
   * (imap.<domain>, smtp.<domain>) for the sign-in test to confirm; none when nothing was found.
   */
  source: 'known' | 'autoconfig' | 'guess' | 'none';
  /** It cannot connect this way, and why, in a sentence (Outlook.com and Microsoft 365 turned app passwords off). */
  blocked?: string;
}

export type MailAccountStatus = 'ok' | 'untested' | 'error';

/** A connected mail account, as the pages show it. */
export interface MailAccountView {
  id: string;
  address: string;
  /** The name mail is sent with ("Alex Kim"). */
  name?: string;
  username: string;
  /** For sending, when it differs from `username`. */
  smtpUsername?: string;
  imap: MailServer;
  smtp: MailServer;
  provider?: string;
  status: MailAccountStatus;
  error?: string;
  /** The password, masked ("…mnop"). */
  hint: string;
  testedAt?: number;
  createdAt: number;
}

/** A folder, for the watcher's form. */
export interface MailFolderView {
  path: string;
  name: string;
  /** \Inbox, \Sent, \Drafts, \Trash, \Junk, \Archive, \All, \Flagged. */
  specialUse?: string;
}

export const MAIL_SECURITY_TEXT: Record<MailSecurity, string> = { tls: 'SSL/TLS', starttls: 'STARTTLS', none: 'None (this computer only)' };

/** The usual port for each way of reaching a server. */
export const MAIL_PORTS: Record<'imap' | 'smtp', Record<MailSecurity, number>> = {
  imap: { tls: 993, starttls: 143, none: 143 },
  smtp: { tls: 465, starttls: 587, none: 25 },
};

/** An email address as people type it, checked loosely: one @, a dot in the domain, no spaces. */
export const MAIL_ADDRESS = /^[^\s@<>()",;:]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** Hosts that are this computer: a plain connection is allowed there (a local bridge such as Proton Mail Bridge). */
export const isLoopback = (host: string) => /^(127\.\d+\.\d+\.\d+|localhost|::1|\[::1\])$/i.test(host.trim());
