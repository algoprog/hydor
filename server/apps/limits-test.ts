// The rate limits that have a scope (the API keys' calls, a web app's function calls) are kept in Hydor's database: a restart of Hydor, which makes a new Limiter, does not
// start the minute, or a run's calls, again. The others stay in memory.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/limits-test.ts
//   mkdir -p /tmp/hydor-limits-x && DATA_DIR=/tmp/hydor-limits-x node dist/dev/limits-test.js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../db.ts";
import { Limiter, persistLimits } from "./limits.ts";

if (!process.env.DATA_DIR?.startsWith("/tmp/")) (console.error("Run with DATA_DIR=/tmp/… so nothing touches real data."), process.exit(2));
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR!, "limits-"));
const db = openDb(path.join(scratch, "test.db"));
let now = 1_000_000;
const mine = () => new Limiter(() => now, "api-key");

const memory = new Limiter(() => now);
persistLimits(db);

const a = mine();
for (let i = 0; i < 3; i++) assert.equal(a.take("k1", 3, 60_000), true);
assert.equal(a.take("k1", 3, 60_000), false, "the fourth in the minute is refused");
const restarted = mine();
assert.equal(restarted.take("k1", 3, 60_000), false, "a new Limiter (Hydor restarted) still has the minute's three");
assert.equal(restarted.count("k1", 60_000), 3);
assert.equal(restarted.wait("k1", 3, 60_000), 60_000, "and says how long to wait");
now += 30_000;
assert.equal(restarted.wait("k1", 3, 60_000), 30_000);
now += 31_000;
assert.equal(restarted.take("k1", 3, 60_000), true, "a minute later it goes again");
assert.equal(new Limiter(() => now, "web-functions").count("k1", 60_000), 0, "another scope counts apart");
restarted.add("calls:run1");
restarted.add("calls:run1");
assert.equal(mine().count("calls:run1", 7 * 86_400_000), 2, "a run's calls are counted across restarts");
restarted.undo("calls:run1");
assert.equal(mine().count("calls:run1", 7 * 86_400_000), 1, "undo gives back the last");
restarted.clear();
assert.equal(mine().count("k1", 60_000), 0);
assert.equal(memory.take("m", 1, 1000), true);
assert.equal(memory.take("m", 1, 1000), false, "a limiter with no scope keeps to memory");
assert.equal((db.prepare("select count(*) as n from rate_hits where name = 'm'").get() as { n: number }).n, 0, "and writes nothing to the database");
db.close();
fs.rmSync(scratch, { recursive: true, force: true });
console.log("11 checks passed.");
process.exit(0);
