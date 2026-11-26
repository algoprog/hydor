// The header Hydor puts on every request it passes to a web app, to say who is there. The app has no sign-in of its
// own inside Hydor: it trusts this one header, which only Hydor can make, because only Hydor and that app know the
// app's secret. Format (the builders' page, hydor-contract.md, says it): base64url(JSON {id, name, email?, role, teamId?, exp})
// + "." + base64url(HMAC-SHA256 of that first part, keyed with the secret as text). `exp` is in seconds since 1970.
import crypto from "node:crypto";

export const PERSON_HEADER = "x-hydor-person";

export type PersonRole = "owner" | "admin" | "member" | "guest";

/** Who is using the app. */
export interface Person {
  id: string;
  name: string;
  email?: string;
  role: PersonRole;
  teamId?: string;
}

/** The header's value for `person`, good for `ttlSeconds` (a minute: a fresh one is signed for each request). */
export function signPerson(
  person: Person,
  secret: string,
  ttlSeconds = 60,
): string {
  const body: Record<string, unknown> = {
    id: person.id,
    name: person.name,
    role: person.role,
  };
  if (person.email !== undefined) body.email = person.email;
  if (person.teamId !== undefined) body.teamId = person.teamId;
  body.exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify(body), "utf8").toString(
    "base64url",
  );
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

/** What checking a header found: the person it names, or why it is not one Hydor made for this app (and has not run out). */
export type PersonCheck = { ok: true; person: Person; exp: number } | { ok: false; why: "malformed" | "signature" | "expired" };

/**
 * Reads a header's value as `signPerson` made it, with the app's secret: the signature has to match (compared in constant
 * time) and `exp` must not be past by more than `graceSeconds` (a web app forwards the header a moment after it got it, so a
 * run started with it may arrive just after it ran out). Anything else is not a person.
 */
export function verifyPerson(value: unknown, secret: string, graceSeconds = 0, now = Date.now()): PersonCheck {
  if (typeof value !== "string" || value.length > 4096) return { ok: false, why: "malformed" };
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, why: "malformed" };
  const want = crypto.createHmac("sha256", secret).update(parts[0]).digest();
  let got: Buffer;
  try {
    got = Buffer.from(parts[1], "base64url");
  } catch {
    return { ok: false, why: "malformed" };
  }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return { ok: false, why: "signature" };
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return { ok: false, why: "malformed" };
  }
  const line = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v);
  const roles = ["owner", "admin", "member", "guest"];
  if (!body || typeof body !== "object" || !line(body.id, 120) || !line(body.name, 80) || !roles.includes(body.role as string) || typeof body.exp !== "number") return { ok: false, why: "malformed" };
  if (body.exp * 1000 + graceSeconds * 1000 < now) return { ok: false, why: "expired" };
  const person: Person = { id: body.id as string, name: body.name as string, role: body.role as PersonRole };
  if (line(body.email, 200)) person.email = body.email as string;
  if (line(body.teamId, 120)) person.teamId = body.teamId as string;
  return { ok: true, person, exp: body.exp };
}
