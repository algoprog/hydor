// Makes skills/web-app-builder/references/hydor-check.mjs: the checker of an app's hydor.json as one script with nothing it needs beyond
// Node, so a builder can run it in the app's folder without Hydor. Run `npm run webapps:checker` after changing the checker,
// the reader (shared/hydor-file.ts) or how an app is started (server/webapps/run-app.ts); contract-check-test.ts fails while it is stale.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = "skills/web-app-builder/references/hydor-check.mjs";
const HEAD = "#!/usr/bin/env node\n// Checks that an app does what its hydor.json says. Needs Node 22 and nothing else: node hydor-check.mjs [folder]\n// Made from Hydor's own checker by `npm run webapps:checker`; do not edit it here. AGPL-3.0, as Hydor is.";

/** The script's text. */
export async function checkerScript() {
  const r = await build({ absWorkingDir: root, entryPoints: ["scripts/hydor-check.ts"], bundle: true, platform: "node", format: "esm", target: "node22", write: false, packages: "external", legalComments: "none", logLevel: "silent", banner: { js: HEAD } });
  return r.outputFiles[0].text;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(path.join(root, OUT), await checkerScript(), { mode: 0o755 });
  console.log(`wrote ${OUT}`);
}
