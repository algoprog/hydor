// A web app for the tests: a folder with a hydor.json and a server of the test's own (`node .output/server/index.mjs`),
// signed in by Hydor's header, ready at /api/health.
import fs from "node:fs";
import path from "node:path";

export function writeTestApp(dir: string, server: string, more: Record<string, unknown> = {}): string {
  fs.mkdirSync(path.join(dir, ".output", "server"), { recursive: true });
  const file = { start: "node .output/server/index.mjs", env: { port: "PORT", data: "DATA_DIR", url: "APP_URL", secret: "APP_SECRET" }, ready: "/api/health", signIn: "hydor", ...more };
  fs.writeFileSync(path.join(dir, "hydor.json"), JSON.stringify(file));
  fs.writeFileSync(path.join(dir, ".output", "server", "index.mjs"), server);
  return dir;
}
