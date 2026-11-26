// The page checks (pagechecks/) on the throwaway copy the contract check has running: signed in as Hydor says it for
// "signIn": "hydor", or, for an app with accounts of its own, as a test person made the way its hydor.json says
// ("accounts"). When signed-in pages cannot be seen, that is said and never passed over.
import crypto from "node:crypto";
import type { AccountRequest, HydorFile } from "../../shared/hydor-file.ts";
import { checkPages, type PageChecks, type SignedIn } from "./pagechecks/index.ts";
import { ask } from "./pagechecks/probes.ts";
import { PERSON_HEADER } from "./sign.ts";

export interface PagesRun {
  result: PageChecks;
  /** Why signed-in pages were not looked at, in a sentence. */
  signedIn?: string;
}

export interface PagesAsked {
  port: number;
  file: HydorFile;
  /** The made-up values the copy was given: looked for in what a browser gets. */
  hidden: { name: string; value: string }[];
  /** The headers that sign a request in as the checker's owner (signIn "hydor"). */
  person: () => Record<string, string>;
  chosenBrowser?: string;
  signal?: AbortSignal;
  onStep?: (what: string) => void;
}

const NOT_SEEN = "Signed-in pages were not looked at";

/** The body of an account request with the test person's details in it. */
const filled = (r: AccountRequest, words: Record<string, string>) => Object.fromEntries(Object.entries(r.body).map(([k, v]) => [k, typeof v === "string" ? v.replace(/\{(name|email|password)\}/g, (_, w: string) => words[w]) : v]));

/** Signs a test person up and in, in the throwaway copy: their cookie, or why there is none. */
async function testPerson(origin: string, accounts: NonNullable<HydorFile["accounts"]>, signal?: AbortSignal): Promise<{ signedIn: SignedIn } | { why: string }> {
  const word = crypto.randomBytes(6).toString("hex");
  const words = { name: "Test Person", email: `test.person.${word}@example.test`, password: `Hydor-check-${crypto.randomBytes(9).toString("base64url")}-7` };
  const jar = new Map<string, string>();
  let set: string[] = [];
  let home: string | undefined;
  const send = async (r: AccountRequest) => {
    const fields = filled(r, words);
    const form = r.send === "form";
    const got = await ask(new URL(r.path, origin), {
      method: r.method,
      headers: {
        "content-type": form ? "application/x-www-form-urlencoded" : "application/json",
        accept: form ? "text/html,*/*" : "application/json",
        origin,
        "sec-fetch-site": "same-origin",
        ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      },
      body: form ? new URLSearchParams(Object.entries(fields).map(([k, v]) => [k, String(v)])).toString() : JSON.stringify(fields),
      signal,
    });
    const cookies = ([] as string[]).concat(got.headers["set-cookie"] ?? []);
    for (const c of cookies) {
      const m = /^\s*([^=;\s]+)=([^;]*)/.exec(c);
      if (m) m[2] ? jar.set(m[1], m[2]) : jar.delete(m[1]);
    }
    if (cookies.length) set = cookies;
    const to = got.headers.location;
    if (got.status >= 300 && got.status < 400 && to) {
      const next = new URL(to, origin);
      if (next.origin === origin) home = next.pathname + next.search;
    }
    return got.status;
  };
  try {
    const up = await send(accounts.signUp);
    if (up >= 400) return { why: `the test sign-up (${accounts.signUp.method} ${accounts.signUp.path}) was answered ${up}` };
    const signedUp = jar.size > 0;
    const into = await send(accounts.signIn);
    // Some apps refuse a sign-in from someone the sign-up has signed in already.
    if (into >= 400 && !signedUp) return { why: `the test sign-in (${accounts.signIn.method} ${accounts.signIn.path}) was answered ${into}` };
  } catch (e) {
    return { why: `the test sign-up or sign-in was not answered (${(e as Error).message.split("\n")[0]})` };
  }
  if (!jar.size) return { why: "signing the test person in set no cookie" };
  return { signedIn: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), setCookies: set, ...(home ? { home } : {}) } };
}

export async function runPages(o: PagesAsked): Promise<PagesRun> {
  const origin = `http://localhost:${o.port}`;
  const hydor = o.file.signIn === "hydor";
  let signedIn: SignedIn | undefined;
  let why: string | undefined;
  if (hydor) signedIn = { headers: () => ({ [PERSON_HEADER]: o.person()[PERSON_HEADER] }), home: o.file.private };
  else if (o.file.accounts) {
    o.onStep?.("Making a test person");
    const made = await testPerson(origin, o.file.accounts, o.signal);
    if ("signedIn" in made) signedIn = made.signedIn;
    else why = made.why;
  }
  const result = await checkPages({
    address: origin,
    // Its data is the check's own and is thrown away: forms are posted to it.
    throwaway: true,
    secrets: o.hidden,
    chosenBrowser: o.chosenBrowser,
    signal: o.signal,
    onStep: o.onStep,
    ...(hydor && o.file.private === "/" ? { signedOut: false } : {}),
    ...(signedIn ? { signedIn } : {}),
  });
  let said: string | undefined;
  if (why) said = `${NOT_SEEN}: ${why}.`;
  else if (result.signIn === "failed") said = `${NOT_SEEN}: the app did not accept ${hydor ? "Hydor's sign-in" : "the test person's sign-in"} on its pages.`;
  else if (!signedIn && result.asksSignIn) said = `${NOT_SEEN}: hydor.json does not say how to make a test person (“accounts”), so only what a visitor sees was checked.`;
  return { result, ...(said ? { signedIn: said } : {}) };
}
