// The result of the last check of an app (contract-check.ts, as contract-run.ts keeps it), kept in Hydor's own folder for the
// app (<data>/webapps/<id>/checks.json) so the page shows it without running it again.
import fs from "node:fs";
import path from "node:path";
import type { WebAppChecks } from "../../shared/webapps.ts";

export const noChecks = (): WebAppChecks => ({ ran: false, at: null, summary: null, ok: null, lines: [] });

const fileOf = (root: string, app: string) => path.join(root, app, "checks.json");

export function saveChecks(root: string, app: string, c: WebAppChecks) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(app)) return;
  fs.mkdirSync(path.join(root, app), { recursive: true, mode: 0o700 });
  fs.writeFileSync(fileOf(root, app), JSON.stringify(c), { mode: 0o600 });
}

export function readChecks(root: string, app: string): WebAppChecks {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(app)) return noChecks();
  try {
    const c = JSON.parse(fs.readFileSync(fileOf(root, app), "utf8")) as WebAppChecks;
    return c && c.ran === true && Array.isArray(c.lines) ? c : noChecks();
  } catch {
    return noChecks();
  }
}
