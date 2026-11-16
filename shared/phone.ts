// Settings → App → Use on your phone, as the server (server/phone) answers GET /api/phone and the page reads it.

export type TsState = 'missing' | 'not-running' | 'signed-out' | 'stopped' | 'needs-approval' | 'too-old' | 'ready';

/** Tailscale on this computer. */
export interface TsStatus {
  state: TsState;
  /** The command found. */
  path?: string;
  version?: string;
  /** Serve's command line: 'new' from Tailscale 1.52, 'old' from 1.38, 'none' before. */
  syntax?: 'new' | 'old' | 'none';
  /** This machine's full name on the tailnet, without the last dot: laptop.tail1234.ts.net. */
  dnsName?: string;
  /** Its short name: laptop. */
  machine?: string;
  /** The tailnet's name, as Tailscale shows it. */
  tailnet?: string;
  /** HTTPS certificates can be had for this machine's name (MagicDNS and HTTPS Certificates are on in the tailnet). */
  https?: boolean;
  /** The sign-in under way, when Tailscale gave one. */
  loginUrl?: string;
  /** What Tailscale said, when it said something unexpected. */
  detail?: string;
}

export interface PhoneState {
  tailscale: TsStatus;
  /** The app published on the tailnet, at this address. servedHere: this page did it (false: it was done by hand, and taken on). */
  serving: { url: string; port: number; servedHere: boolean; funnel: boolean; at?: number } | null;
  /** Something else published at the usual HTTPS port (443): what, and the next port that is free. */
  taken: { port: number; target: string; free: number | null } | null;
  /** The address is among the ones the server accepts requests from. */
  accepted: boolean;
  /** This server's port, which Serve points at. */
  port: number;
  platform: 'mac' | 'windows' | 'linux';
  /** The command that makes this user Tailscale's operator on Linux, with their name. */
  operatorCommand: string;
  /** Tailscale's download page. */
  download: string;
}

/** Why Serve it or Stop serving did not happen: in an error reply's `problem`, beside its sentence in `error`. */
export interface PhoneProblem {
  kind: 'enable' | 'operator' | 'port-taken' | 'failed' | 'not-ready' | 'stop-failed';
  /** The page that turns Serve and HTTPS on, or the download page. */
  link?: string;
  /** The command to run once (the operator's). */
  command?: string;
  /** The free port to serve on instead. */
  port?: number;
}

/** Where phones land when they scan the address: this section, which walks them through the rest. */
export const PHONE_PATH = '/settings?s=phone';
