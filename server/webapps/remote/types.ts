// Launching an app to a server of the person's own, and running it there: the plain data the engine takes and gives.
// The engine knows an app only by its folder and its contract (hydor.json as read: shared/hydor-file.ts); it keeps nothing
// of its own but the hosts, in a folder the caller gives, and what it writes on the server.
import type { HydorFile } from "../../../shared/hydor-file.ts";

/** hydor.json as the engine takes it (as the reader gives it). */
export type RemoteContract = HydorFile;

/** Why something was refused, as a caller would answer it: bad input, nothing by that name, not now, or the server. */
export type RefusalKind = "input" | "missing" | "conflict" | "server";

/** Something the engine will not do, or could not: the message is a sentence for a person. */
export class Refused extends Error {
  readonly kind: RefusalKind;
  readonly details: string[];
  constructor(message: string, kind: RefusalKind = "conflict", details: string[] = []) {
    super(message);
    this.kind = kind;
    this.details = details;
  }
}

/** The steps of a launch. They do not change: a page can list them before anything runs. */
export const LAUNCH_STEPS = [
  { id: "check", title: "Check it: what its hydor.json says, and its pages" },
  { id: "host", title: "Reach the server and see what it has" },
  { id: "keys", title: "Find the keys the app needs" },
  { id: "address", title: "Check the address" },
  { id: "files", title: "Check the app's files for a server" },
  { id: "send", title: "Send the app's folder to the server" },
  { id: "build", title: "Build it there, beside the one running" },
  { id: "configure", title: "Write the server's files (Caddy, the keys)" },
  { id: "snapshot", title: "Back up what runs now (the way back)" },
  { id: "switch", title: "Switch to the new version" },
  { id: "ready", title: "Wait until it answers at its address" },
  { id: "smoke", title: "Look at it over https" },
  { id: "backup", title: "Make a backup and read it back" },
  { id: "record", title: "Write the launch down" },
] as const;
export type StepId = (typeof LAUNCH_STEPS)[number]["id"];

export type StepState = "waiting" | "running" | "passed" | "failed" | "skipped";

export interface Step {
  id: StepId;
  title: string;
  state: StepState;
  /** What it did or why it failed, in a sentence (no secret). */
  say?: string;
  details?: string[];
  ms?: number;
}

/** A line of the contract check, as the caller's check gives it (server/webapps/contract-check.ts's shape). */
export interface CheckLine {
  id: string;
  title: string;
  state: "passed" | "failed" | "note" | "notRun";
  text: string;
  hint?: string;
}

export interface CheckOutcome {
  lines: CheckLine[];
}

/** What a launch remembers of itself, on the server and for the caller to keep. No key and no value of a key. */
export interface RemoteRecord {
  /** 20261126-193012-3fa9c1d: when it was made, and a fingerprint of the source that was sent. */
  id: string;
  at: string;
  action: "launch" | "rollback";
  /** package.json's version, when the app has one. */
  version: string | null;
  image: string;
  /** `unfinished`: live, but no backup that reads back was made, so the launch does not count as done. */
  result: "live" | "failed" | "rolled-back" | "unfinished";
  downtimeSeconds: number | null;
  failedStep?: string;
  said?: string;
  /** Check lines that failed and were let through. */
  overrides: string[];
  backup: { id: string; verified: boolean } | null;
  host: string;
  address: string;
  commit?: string;
  by?: string;
  ms: number;
}

export interface LaunchOutcome {
  ok: boolean;
  result: RemoteRecord["result"];
  /** One or two sentences for the end. */
  summary: string;
  problems: string[];
  notes: string[];
  steps: Step[];
  id: string | null;
  image: string | null;
  version: string | null;
  address: string;
  /** Seconds in which nobody was answered while the version was replaced (null: nothing was running, or not measured). */
  downtimeSeconds: number | null;
  /** The previous version came back by itself. */
  previousBack: boolean;
  overrides: string[];
  backup: { id: string; verified: boolean } | null;
  /** Written on the server too; null when nothing was sent, so there is nothing to remember. */
  record: RemoteRecord | null;
}

export interface RemoteBackup {
  id: string;
  label: string | null;
  at: number;
  bytes: number;
  tables: Record<string, number>;
  files: number;
  /** The app was stopped while this was copied. */
  stopped?: boolean;
  /** Copied to storage elsewhere too. */
  elsewhere?: boolean;
}

export interface RemoteStatus {
  /** Answering at its real address (null: the server could not say). */
  up: boolean | null;
  say: string;
  address: string | null;
  version: string | null;
  /** The id of the launch that is live. */
  launch: string | null;
  since: number | null;
  restarts: number | null;
  lastLaunch: { id: string; at: number; result: string; downtimeSeconds: number | null } | null;
  lastBackup: { id: string; at: number; ageHours: number } | null;
  schedule: { at: string; keepDays: number } | null;
  disk: { freeGb: number | null; dataMb: number | null; say: string };
  /** Counted from the app's own log lines when they are JSON; null when they are not (`logSay` says so). */
  errors: number | null;
  requests: number | null;
  logSay: string;
  services: { name: string; up: boolean }[];
  /** What a person should look at. */
  problems: string[];
}
