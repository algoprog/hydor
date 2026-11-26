// Which of a web app's two sides is calling Hydor: the launched version, or the one being changed (Preview, the development server, an app that is not launched yet).
//
// Hydor knows which it starts as which (the launched side is hosted as `<id>_live`: hydor-launch.ts), and it marks the key it gives the launched one: the key the app would have anyway, and after it
// a proof made from a secret that only Hydor holds. No app is given that secret, only a finished proof for its own key, and only the launched process is given that. So a call counts as the launched
// version only when it carries the proof, and every other call counts as the app being made: nothing an app says of itself (its hydor.json, a header, a field) is asked.
// The marked key opens what the plain one opens (appOfKey and webCaller read past the mark): an app only passes its key on, so the app needs to know nothing of this.
// As with every key of an app, this holds between processes that cannot read each other's environment, which is what bubblewrap gives; where Hydor runs apps without it, they can.
import crypto from "node:crypto";
import { LAUNCHED_MARK, plainKey } from "../apps/store.ts";
import { kvGet, kvSet, type DB } from "../db.ts";

const KEPT = "webapps.launchedKeySecret";

function hydorsSecret(db: DB): string {
  let s = kvGet(db, KEPT);
  if (!s) kvSet(db, KEPT, (s = crypto.randomBytes(32).toString("hex")));
  return s;
}

/** The key the launched version of web app `webId` is started with: `key`, marked. */
export function launchedKey(db: DB, webId: string, key: string): string {
  const plain = plainKey(key);
  return `${plain}~live.${crypto.createHmac("sha256", hydorsSecret(db)).update(`launched\0${webId}\0${plain}`).digest("base64url")}`;
}

/** Whether a call's key carries the launched version's mark, made by this Hydor for this web app and this key. */
export function isLaunchedKey(db: DB, webId: string, bearer: string): boolean {
  if (!LAUNCHED_MARK.test(bearer)) return false;
  const a = Buffer.from(bearer);
  const b = Buffer.from(launchedKey(db, webId, bearer));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
