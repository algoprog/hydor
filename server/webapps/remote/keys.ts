// The keys an app's hydor.json names, and where their values come from on a server. A value comes from the caller (a map by
// name), goes to the server over the connection's standard input into a file there that only its owner can read, and is
// never written in the app's folder, the image, the compose file, a script's text, a log or the record. A key marked
// `from: "made"` and the app's secret (`env.secret`) are made on the server the first time and kept there.
import { Refused, type RemoteContract } from "./types.ts";

/** Keys for the backups' copy elsewhere: they go to the backup service only; the app never sees them. */
export const STORAGE_KEYS = ["BACKUP_S3_ENDPOINT", "BACKUP_S3_BUCKET", "BACKUP_S3_REGION", "BACKUP_S3_PREFIX", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY"] as const;
const STORAGE_NEEDED = ["BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY"];

/** Names whose values say where something is and are no secret: not masked, or a bucket named like the app would hide it everywhere. */
const NOT_SECRET = /(^|_)(PREFIX|BUCKET|REGION|ENDPOINT|HOST|USER|USERNAME)$/;
export const secretValues = (values: Record<string, string>): string[] =>
  Object.entries(values)
    .filter(([name]) => !NOT_SECRET.test(name))
    .map(([, v]) => v);

export interface KeyState {
  name: string;
  /** hydor.json's `from`: a provider, `you` or `made`. */
  from: string;
  why: string;
  optional: boolean;
  /**
   * given: a value comes with this launch; server: the server has it already; made: it will be made there; missing: it has
   * to be asked for; unset: optional, and there is none.
   */
  state: "given" | "server" | "made" | "missing" | "unset";
}

/** Each key the app needs on a server, and where it stands. `onServer`: the names the server already holds. */
export function keyStates(contract: RemoteContract, given: Record<string, string>, onServer: ReadonlySet<string> = new Set()): KeyState[] {
  const listed = contract.keys.map((k) => ({ name: k.name, from: k.from, why: k.why, optional: !!k.optional }));
  const secret = contract.env.secret;
  if (secret && !listed.some((k) => k.name === secret)) listed.push({ name: secret, from: "made", why: "The app's own secret (it signs sessions and the like).", optional: false });
  return listed.map((k) => ({
    ...k,
    state: given[k.name] ? "given" : onServer.has(k.name) ? "server" : k.from.toLowerCase() === "made" ? "made" : k.optional ? "unset" : "missing",
  }));
}

export interface Given {
  /** For the app (app.env on the server). */
  app: Record<string, string>;
  /** For the backup service alone (backup.env). */
  storage: Record<string, string>;
  /** Given by the caller and not named by hydor.json: not sent. */
  unused: string[];
}

const oneLine = (name: string, value: string) => {
  if (/[\r\n\0]/.test(value)) throw new Refused(`The value of ${name} has a line break in it: a key is one line.`, "input");
};

/** The values that go to the server: those hydor.json names, and the storage's. */
export function gatherValues(contract: RemoteContract, keys: Record<string, string> = {}, storage: Record<string, string> = {}): Given {
  const names = new Set(keyStates(contract, {}).map((k) => k.name));
  const out: Given = { app: {}, storage: {}, unused: [] };
  for (const [name, value] of Object.entries(keys)) {
    if (!value) continue;
    if (!names.has(name)) {
      out.unused.push(name);
      continue;
    }
    oneLine(name, value);
    out.app[name] = value;
  }
  const chosen = Object.entries(storage).filter(([, v]) => v);
  for (const [name, value] of chosen) {
    if (!(STORAGE_KEYS as readonly string[]).includes(name)) throw new Refused(`${name} is not one of the storage's keys (${STORAGE_KEYS.join(", ")}).`, "input");
    oneLine(name, value);
    out.storage[name] = value;
  }
  if (chosen.length) {
    const lacking = STORAGE_NEEDED.filter((n) => !out.storage[n]);
    if (lacking.length) throw new Refused(`The copy of backups to storage elsewhere also needs ${lacking.join(", ")}.`, "input");
  }
  return out;
}

/**
 * How a value is written in the file compose reads (`env_file`): plain when it is plain, else in single quotes (compose
 * keeps those as they are), else in double quotes with $ " and \ escaped.
 */
export function envLine(name: string, value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]*$/.test(value)) return `${name}=${value}`;
  if (!value.includes("'")) return `${name}='${value}'`;
  return `${name}="${value.replace(/[\\"$]/g, (c) => `\\${c}`)}"`;
}

/** The value a line of an env file holds (the inverse of `envLine`, for masking what the server holds). */
export function envValue(line: string): { name: string; value: string } | null {
  const i = line.indexOf("=");
  if (i <= 0) return null;
  const name = line.slice(0, i);
  let value = line.slice(i + 1);
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
  else if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\([\\"$])/g, "$1");
  return { name, value };
}

/** A text with every value of the keys replaced, for anything printed or kept. Longest first, so one that holds another is covered whole. */
export function mask(text: string, secrets: Iterable<string>): string {
  let out = text;
  for (const s of [...secrets].filter((v) => v.length >= 4).sort((a, b) => b.length - a.length)) out = out.split(s).join("«hidden»");
  return out
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 «hidden»")
    .replace(/\b((?:[A-Z][A-Z0-9]*_)*(?:SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY_ID|PRIVATE_KEY|DATABASE_URL)[A-Z0-9_]*)=(?!«)\S+/g, "$1=«hidden»")
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/g, "$1«hidden»@");
}
