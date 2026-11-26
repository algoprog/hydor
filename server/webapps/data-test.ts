// Checks for what a web app's page shows of its data (data.ts and the two routes in index.ts): the tables of the app's own SQLite
// file and their rows page by page, read only; limits on the page's size and a cell's length; names that are only ever the ones
// the file lists; values of password and token columns not sent; and a file that is not the app's own (a name that leaves the data
// folder, a link or a hard link to another file, something that is not a database) refused. Port 4338. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/data-test.ts
//   mkdir -p /tmp/hydor-webapps-data-y && DATA_DIR=/tmp/hydor-webapps-data-y node dist/dev/data-test.js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import Fastify from "fastify";
import type { WebAppDataPage, WebAppDataTables } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import { kvSet, openDb } from "../db.ts";
import type { Deps } from "../features/types.ts";
import { DATA_CELL_MAX, DATA_MAX_LIMIT } from "./data.ts";
import { createWebapps } from "./index.ts";

if (!process.env.DATA_DIR?.startsWith("/tmp/")) {
  console.error("Run with DATA_DIR=/tmp/… so nothing touches real data.");
  process.exit(2);
}
const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR, "webapp-data-"));
const PORT = 4338;

let passed = 0;
const step = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};

async function instance(port: number) {
  const dataDir = path.join(scratch, port ? "on" : "off", "hydor-data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = openDb(path.join(scratch, port ? "on" : "off", "test.db"));
  kvSet(db, "sharing:owner", "Dana");
  const app = Fastify();
  app.setErrorHandler((err: Error, _req, reply) => {
    const status = err instanceof HttpError ? err.status : 500;
    reply.code(status).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
  });
  const deps = { app, db, sessions: null as never, scheduler: null as never, models: null as never, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => "http://test.local" } as Deps;
  const feature = createWebapps({ dataDir, port, origin: "", domain: "", idleMs: 600_000, sandbox: true, ports: [4335, 4337], startTimeoutMs: 20_000 });
  feature.routes!(deps);
  await app.ready();
  feature.start!(deps);
  await feature.ready;
  const call = async <T = any>(method: string, url: string, body?: unknown) => {
    const r = await app.inject({ method: method as "GET", url, headers: body !== undefined ? { "content-type": "application/json" } : {}, payload: body === undefined ? undefined : JSON.stringify(body) });
    let json: any = null;
    try {
      json = r.json();
    } catch {}
    return { status: r.statusCode, json: json as T };
  };
  const stop = async () => {
    await feature.stop!(null as never);
    await app.close();
    db.close();
  };
  return { dataDir, call, stop };
}

/** A web app's folder, and the app registered. */
async function register(i: Awaited<ReturnType<typeof instance>>, name: string) {
  const dir = path.join(scratch, "apps", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "hydor.json"), JSON.stringify({ name, start: "node server.mjs", env: { port: "PORT", data: "DATA_DIR" }, ready: "/", signIn: "own", database: { file: "app.db", sqlite: true } }));
  const r = await i.call<{ app: { id: string } }>("POST", "/api/webapps", { folder: dir });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const id = r.json.app.id;
  const data = path.join(i.dataDir, "webapps", id, "data");
  fs.mkdirSync(data, { recursive: true });
  return { id, data, dir };
}

const failures: unknown[] = [];
try {
  await step("web apps off: both data routes say so", async () => {
    const off = await instance(0);
    for (const url of ["/api/webapps/abc/data", "/api/webapps/abc/data/notes"]) {
      const r = await off.call<{ error: string; off: boolean }>("GET", url);
      assert.equal(r.status, 400, url);
      assert.match(r.json.error, /Web apps are off on this computer/);
      assert.equal(r.json.off, true);
    }
    await off.stop();
  });

  const on = await instance(PORT);
  const app = await register(on, "notes");
  const outside = path.join(scratch, "outside.db");
  {
    // A database that is not the app's: what a link out of the data folder would lead to.
    const o = new Database(outside);
    o.exec("create table secrets (k text, v text); insert into secrets values ('hydor', 'the real data')");
    o.close();
  }

  await step("an app that has not run has no database yet: no tables, and a table is not found", async () => {
    const r = await on.call<WebAppDataTables>("GET", `/api/webapps/${app.id}/data`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { file: "app.db", exists: false, tables: [] });
    assert.equal((await on.call("GET", `/api/webapps/${app.id}/data/notes`)).status, 404);
    // An empty file (just made) is the same.
    fs.writeFileSync(path.join(app.data, "app.db"), "");
    assert.equal((await on.call<WebAppDataTables>("GET", `/api/webapps/${app.id}/data`)).json.exists, false);
    fs.rmSync(path.join(app.data, "app.db"));
  });

  await step("an unknown app is not found, and an id cannot be a path", async () => {
    assert.equal((await on.call("GET", "/api/webapps/nope/data")).status, 404);
    assert.equal((await on.call("GET", `/api/webapps/${encodeURIComponent("../x")}/data`)).status, 404);
    assert.equal((await on.call("GET", `/api/webapps/${encodeURIComponent("../x")}/data/t`)).status, 404);
  });

  // The app's database, as an app often makes it: WAL mode, left open (as when the app runs).
  const file = path.join(app.data, "app.db");
  const writer = new Database(file);
  writer.pragma("journal_mode = WAL");
  writer.exec(`
    create table notes (id integer primary key, title text not null, body text, score real, flag integer);
    create table "odd ""name" (a, b);
    create table users (id text primary key, email text, password_hash text, session_token text, token_count integer);
    create table blobs (id integer primary key, data blob, big integer);
    create view notes_view as select id, title from notes;
    create virtual table found using fts5(text);
    insert into "odd ""name" values (1, 2);
    insert into users values ('u1', 'a@example.com', 'argon2$secret', 'tok-123', 7), ('u2', 'b@example.com', '', null, 0);
    insert into blobs values (1, x'00010203', 9007199254740993), (2, null, -5);
  `);
  const ins = writer.prepare("insert into notes (title, body, score, flag) values (?, ?, ?, ?)");
  for (let n = 1; n <= 130; n++) ins.run(`Note ${n}`, n === 3 ? "x".repeat(DATA_CELL_MAX + 500) : `body ${n}`, n / 4, n % 2);
  const before = fs.readdirSync(app.data).sort();

  await step("the tables are listed with their columns and row counts (not views, virtual tables or the file's own)", async () => {
    const r = await on.call<WebAppDataTables>("GET", `/api/webapps/${app.id}/data`);
    assert.equal(r.status, 200);
    assert.equal(r.json.exists, true);
    assert.equal(r.json.file, "app.db");
    const names = r.json.tables.map((t) => t.name);
    assert.deepEqual(names, ['blobs', 'notes', 'odd "name', 'users']);
    const notes = r.json.tables.find((t) => t.name === "notes")!;
    assert.equal(notes.rows, 130);
    assert.deepEqual(notes.columns, [
      { name: "id", type: "INTEGER", pk: true },
      { name: "title", type: "TEXT", pk: false },
      { name: "body", type: "TEXT", pk: false },
      { name: "score", type: "REAL", pk: false },
      { name: "flag", type: "INTEGER", pk: false },
    ]);
    assert.equal(r.json.tables.find((t) => t.name === 'odd "name')!.rows, 1);
  });

  await step("rows come page by page, with a total, and the limits hold", async () => {
    const p1 = await on.call<WebAppDataPage>("GET", `/api/webapps/${app.id}/data/notes`);
    assert.equal(p1.status, 200);
    assert.equal(p1.json.total, 130);
    assert.equal(p1.json.rows.length, 50);
    assert.equal(p1.json.offset, 0);
    assert.equal(p1.json.limit, 50);
    assert.deepEqual(p1.json.rows[0].slice(0, 2), [1, "Note 1"]);
    const p3 = await on.call<WebAppDataPage>("GET", `/api/webapps/${app.id}/data/notes?offset=100&limit=50`);
    assert.equal(p3.json.rows.length, 30);
    assert.deepEqual(p3.json.rows[0].slice(0, 2), [101, "Note 101"]);
    const past = await on.call<WebAppDataPage>("GET", `/api/webapps/${app.id}/data/notes?offset=500`);
    assert.equal(past.json.rows.length, 0);
    assert.equal(past.json.total, 130);
    const max = await on.call<WebAppDataPage>("GET", `/api/webapps/${app.id}/data/notes?limit=${DATA_MAX_LIMIT}`);
    assert.equal(max.json.rows.length, DATA_MAX_LIMIT > 130 ? 130 : DATA_MAX_LIMIT);
    for (const bad of [`limit=${DATA_MAX_LIMIT + 1}`, "limit=0", "limit=-1", "limit=abc", "limit=1.5", "offset=-1", "offset=1e3", "offset=x", "offset=99999999999"]) {
      const r = await on.call<{ error: string }>("GET", `/api/webapps/${app.id}/data/notes?${bad}`);
      assert.equal(r.status, 400, bad);
    }
  });

  await step("a table is only ever a name the file lists: nothing else becomes SQL, and nothing changes", async () => {
    for (const evil of ['notes"; drop table notes; --', "notes; drop table users", "sqlite_master", "notes_view", "found", "found_data", "NOTES", "notes ", "../app", "main.notes"]) {
      const r = await on.call("GET", `/api/webapps/${app.id}/data/${encodeURIComponent(evil)}`);
      assert.equal(r.status, 404, evil);
    }
    // A name with a quote in it is a table like any other.
    const odd = await on.call<WebAppDataPage>("GET", `/api/webapps/${app.id}/data/${encodeURIComponent('odd "name')}`);
    assert.equal(odd.status, 200);
    assert.deepEqual(odd.json.rows, [[1, 2]]);
    assert.equal((writer.prepare("select count(*) as n from notes").get() as { n: number }).n, 130);
    assert.equal((writer.prepare("select count(*) as n from users").get() as { n: number }).n, 2);
  });

  await step("a long cell is cut (and says so), binary data and huge integers are told plainly, nulls stay nulls", async () => {
    const r = await on.call<WebAppDataPage>("GET", `/api/webapps/${app.id}/data/notes?limit=5`);
    const body = r.json.rows[2][2] as string;
    assert.equal(body.length, DATA_CELL_MAX);
    assert.equal(r.json.truncated, true);
    assert.equal((await on.call<WebAppDataPage>("GET", `/api/webapps/${app.id}/data/notes?limit=2`)).json.truncated, false);
    const b = await on.call<WebAppDataPage>("GET", `/api/webapps/${app.id}/data/blobs`);
    assert.deepEqual(b.json.rows, [
      [1, "[4 bytes of binary data]", "9007199254740993"],
      [2, null, -5],
    ]);
  });

  await step("passwords, hashes and tokens are not sent (a count of tokens is not one)", async () => {
    const r = await on.call<WebAppDataPage>("GET", `/api/webapps/${app.id}/data/users`);
    assert.deepEqual(r.json.columns.map((c) => c.hidden ?? false), [false, false, true, true, false]);
    assert.deepEqual(r.json.rows[0], ["u1", "a@example.com", "••••••", "••••••", 7]);
    assert.deepEqual(r.json.rows[1], ["u2", "b@example.com", "", null, 0]);
    assert.ok(!JSON.stringify(r.json).includes("argon2"));
    assert.ok(!JSON.stringify(r.json).includes("tok-123"));
  });

  await step("it only reads: the app's folder holds the same files afterwards, and the app can still write", async () => {
    const after = fs.readdirSync(app.data).sort();
    assert.deepEqual(after.filter((f) => !before.includes(f)), [], "reading left nothing new");
    writer.prepare("insert into notes (title) values ('later')").run();
    assert.equal((await on.call<WebAppDataTables>("GET", `/api/webapps/${app.id}/data`)).json.tables.find((t) => t.name === "notes")!.rows, 131);
  });

  await step("a path that tries to leave the data folder is refused (in the file's name, as a link, as a hard link)", async () => {
    // By name: only a plain file name of the folder is one.
    for (const bad of ["../../test.db", "../outside.db", "/etc/passwd", outside, "sub/app.db", "..", ".", "app.db/../app.db", "..%2Foutside.db", "a\\b.db", ".hidden.db", "app.txt", "x".repeat(200) + ".db", "app.db\0x"]) {
      const r = await on.call("GET", `/api/webapps/${app.id}/data?file=${encodeURIComponent(bad)}`);
      assert.equal(r.status, 400, `list: ${JSON.stringify(bad)}`);
      const t = await on.call("GET", `/api/webapps/${app.id}/data/notes?file=${encodeURIComponent(bad)}`);
      assert.equal(t.status, 400, `rows: ${JSON.stringify(bad)}`);
    }
    // A link the app made, to a database of its own folder's outside (Hydor's data, say).
    fs.symlinkSync(outside, path.join(app.data, "other.db"));
    for (const url of [`/api/webapps/${app.id}/data?file=other.db`, `/api/webapps/${app.id}/data/secrets?file=other.db`]) {
      const r = await on.call<{ error: string }>("GET", url);
      assert.equal(r.status, 400, url);
      assert.match(r.json.error, /not in the app's own data folder/);
      assert.ok(!JSON.stringify(r.json).includes("real data"));
    }
    // Even as app.db itself: the real file the link leads to is not Hydor's to show.
    const kept = path.join(app.data, "kept.db");
    fs.renameSync(file, kept);
    fs.symlinkSync(outside, file);
    const viaDefault = await on.call("GET", `/api/webapps/${app.id}/data`);
    assert.equal(viaDefault.status, 400);
    assert.equal((await on.call("GET", `/api/webapps/${app.id}/data/secrets`)).status, 400);
    fs.rmSync(file);
    // A link to another file of its own folder is fine (a plain copy of a database, not the live one, whose log sits by its name).
    const plain = path.join(app.data, "plain.db");
    fs.copyFileSync(outside, plain);
    fs.symlinkSync(plain, file);
    assert.equal((await on.call("GET", `/api/webapps/${app.id}/data`)).status, 200);
    fs.rmSync(file);
    // A folder named like a database, and a link to a folder.
    fs.mkdirSync(file);
    assert.equal((await on.call("GET", `/api/webapps/${app.id}/data`)).status, 400);
    fs.rmdirSync(file);
    fs.symlinkSync(scratch, file);
    assert.equal((await on.call("GET", `/api/webapps/${app.id}/data`)).status, 400);
    fs.rmSync(file);
    // A hard link to another file (the same data, two names): not plain.
    fs.linkSync(outside, file);
    const hard = await on.call<{ error: string }>("GET", `/api/webapps/${app.id}/data`);
    assert.equal(hard.status, 400);
    assert.ok(!JSON.stringify(hard.json).includes("real data"));
    fs.rmSync(file);
    fs.rmSync(plain);
    fs.renameSync(kept, file);
    assert.equal((await on.call("GET", `/api/webapps/${app.id}/data`)).status, 200);
    // The data folder itself is Hydor's to make (the app cannot replace it), so a link there is followed, whatever it is.
    const other = await register(on, "other");
    fs.rmSync(other.data, { recursive: true });
    fs.mkdirSync(path.join(scratch, "elsewhere"), { recursive: true });
    fs.copyFileSync(outside, path.join(scratch, "elsewhere", "app.db"));
    fs.symlinkSync(path.join(scratch, "elsewhere"), other.data);
    const viaFolder = await on.call<{ error: string }>("GET", `/api/webapps/${other.id}/data`);
    assert.equal(viaFolder.status, 200);
    // Hydor's own data folder is never reached by any name.
    assert.equal((await on.call("GET", `/api/webapps/${app.id}/data?file=test.db`)).json.exists, false);
  });

  await step("something that is not a database is said so, in plain words", async () => {
    fs.rmSync(file);
    fs.writeFileSync(file, "this is not a database, just a note the app left here ".repeat(10));
    const r = await on.call<{ error: string }>("GET", `/api/webapps/${app.id}/data`);
    assert.equal(r.status, 400);
    assert.match(r.json.error, /not a SQLite database/);
    // A real header with garbage after it is a sentence or an empty list, never a crash.
    fs.writeFileSync(file, Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(200, 7)]));
    const g = await on.call<{ error: string }>("GET", `/api/webapps/${app.id}/data`);
    assert.ok([200, 400, 422].includes(g.status), `${g.status}: never a crash`);
    if (g.status !== 200) assert.match(g.json.error, /./);
  });

  writer.close();
  await on.stop();
} catch (e) {
  failures.push(e);
  console.error(e);
}
fs.rmSync(scratch, { recursive: true, force: true });
if (failures.length) {
  console.error(`FAILED after ${passed} steps`);
  process.exit(1);
}
console.log(`all ${passed} steps passed`);
