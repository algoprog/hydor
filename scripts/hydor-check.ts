// The checker as a command: `node hydor-check.mjs` in an app's folder (or with the folder after it). `npm run webapps:checker` makes the
// single script from this file and server/webapps/contract-check.ts, with nothing it needs beyond Node.
import { checkContract, printLine } from "../server/webapps/contract-check.ts";

const HELP = `Checks that an app does what its hydor.json says.

  node hydor-check.mjs [folder] [--no-build] [--timeout seconds] [--json]

It builds the app, starts it on a port and data folder of its own with made-up keys and a stand-in
for Hydor's services, and tries each claim. It ends with 0 when nothing failed, 1 when something did.`;

const args = process.argv.slice(2);
let dir = ".";
let build = true;
let json = false;
let readyMs = 30_000;
let ports: [number, number] | undefined;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--help" || a === "-h") {
    console.log(HELP);
    process.exit(0);
  } else if (a === "--no-build") build = false;
  else if (a === "--json") json = true;
  else if (a === "--timeout" && Number(args[i + 1]) > 0) readyMs = Number(args[++i]) * 1000;
  else if (a === "--ports" && /^\d+-\d+$/.test(args[i + 1] ?? "")) ports = args[++i].split("-").map(Number) as [number, number];
  else if (!a.startsWith("-")) dir = a;
  else {
    console.error(`${a} is not something the check takes.\n\n${HELP}`);
    process.exit(2);
  }
}

const stop = new AbortController();
for (const s of ["SIGINT", "SIGTERM"] as const) process.once(s, () => stop.abort());
const result = await checkContract({ dir, build, readyMs, ports, signal: stop.signal, onLine: json ? undefined : (l) => console.log(printLine(l)) });
console.log(json ? JSON.stringify(result, null, 2) : `\n${result.summary}`);
process.exit(result.ok ? 0 : 1);
