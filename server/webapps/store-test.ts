// Checks for the web apps store (store.ts): the table, slugs (safe as a hostname label, unique), what a folder must be,
// hydor.json read each time, and settings. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/store-test.ts
//   mkdir -p /tmp/hydor-webapps-data-x && DATA_DIR=/tmp/hydor-webapps-data-x node dist/dev/store-test.js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_WEBAPP_SETTINGS, WEBAPP_SLUG, webappSlug } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";
import { openDb } from "../db.ts";
import {
  addWebApp,
  changeWebApp,
  getWebApp,
  listWebApps,
  readSettings,
  removeWebApp,
  setStage,
  webAppBySlug,
} from "./store.ts";
import { shapeOf } from "./shape.ts";

if (!process.env.DATA_DIR?.startsWith("/tmp/")) {
  console.error("Run with DATA_DIR=/tmp/… so nothing touches real data.");
  process.exit(2);
}

const scratch = fs.mkdtempSync(path.join(process.env.DATA_DIR, "store-"));
const dataDir = path.join(scratch, "hydor-data");
fs.mkdirSync(dataDir);
const db = openDb(path.join(scratch, "test.db"));

let passed = 0;
const step = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};
const refuses = (fn: () => unknown, status: number, re: RegExp) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof HttpError, String(e));
    assert.equal(e.status, status, e.message);
    assert.match(e.message, re);
    return;
  }
  assert.fail(`Did not refuse (${re})`);
};

/** A folder with a hydor.json (what is given, or a name); a string is written as it is. */
const app = (name: string, file: unknown = { name, start: "node server.mjs", env: { port: "PORT", data: "DATA_DIR" }, ready: "/", signIn: "own" }) => {
  const dir = path.join(scratch, "apps", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "hydor.json"), typeof file === "string" ? file : JSON.stringify(file));
  return dir;
};
const plain = { start: "node server.mjs", env: { port: "PORT", data: "DATA_DIR" }, ready: "/", signIn: "own" };

try {
  step("slugs are safe as a hostname label: lower case letters, digits and hyphens, 48 at most, never empty", () => {
    assert.equal(webappSlug("My Notes!"), "my-notes");
    assert.equal(webappSlug("  Ünïcode — Åpp  "), "unicode-app");
    assert.equal(webappSlug("a".repeat(100)).length, 48);
    assert.equal(webappSlug("---"), "app");
    assert.equal(webappSlug(""), "app");
    assert.equal(webappSlug("x".repeat(47) + "--y"), "x".repeat(47), "no hyphen left at the end of a cut");
    for (const n of ["My Notes!", "日本語", "a.b.c", "UPPER", "-lead", "trail-", "a_b", "x".repeat(200)])
      assert.match(webappSlug(n), WEBAPP_SLUG, n);
  });

  step("an app is registered from a folder with a hydor.json: name from the file, a slug, the default settings, its stage, times", () => {
    const dir = app("notes", { ...plain, name: "Club Notes" });
    const a = addWebApp(db, { folder: dir }, dataDir);
    assert.match(a.id, /^[0-9a-f]{16}$/);
    assert.equal(a.name, "Club Notes");
    assert.equal(a.slug, "club-notes");
    assert.equal(a.folder, fs.realpathSync(dir));
    assert.deepEqual(a.settings, DEFAULT_WEBAPP_SETTINGS);
    assert.equal(a.settings.dailyCapUsd, 1);
    assert.equal(a.stage, "build", "one that is written already is at Build");
    assert.ok(a.createdAt > 0 && a.updatedAt === a.createdAt);
    assert.deepEqual(getWebApp(db, a.id), a);
    assert.deepEqual(webAppBySlug(db, "club-notes"), a);
    assert.equal(listWebApps(db).length, 1);
    const made = addWebApp(db, { folder: fs.mkdtempSync(path.join(scratch, "new-")), name: "Being made" }, dataDir, { unwritten: true });
    assert.equal(made.stage, "brief", "one that is being made starts at its brief");
    setStage(db, made.id, "design");
    assert.equal(getWebApp(db, made.id)!.stage, "design");
    db.prepare("update web_apps set stage = 'nonsense' where id = ?").run(made.id);
    assert.equal(getWebApp(db, made.id)!.stage, null);
    removeWebApp(db, made.id);
  });

  step("a given name wins over the file's, and one with no name anywhere takes the folder's", () => {
    const a = addWebApp(db, { folder: app("given"), name: "  My   own  name " }, dataDir);
    assert.equal(a.name, "My own name");
    assert.equal(a.slug, "my-own-name");
    const b = addWebApp(db, { folder: app("plain-folder", plain) }, dataDir);
    assert.equal(b.name, "plain-folder");
  });

  step("two apps with the same name get different slugs (name, name-2, name-3), and a slug a long name cut still fits", () => {
    const names = ["Twin", "Twin", "twin!"];
    const slugs = names.map((n, i) => addWebApp(db, { folder: app(`twin-${i}`), name: n }, dataDir).slug);
    assert.deepEqual(slugs, ["twin", "twin-2", "twin-3"]);
    const long = "z".repeat(60);
    const l1 = addWebApp(db, { folder: app("long-1"), name: long }, dataDir).slug;
    const l2 = addWebApp(db, { folder: app("long-2"), name: long }, dataDir).slug;
    assert.equal(l1.length, 48);
    assert.equal(l2, `${"z".repeat(46)}-2`);
    for (const s of [...slugs, l1, l2]) assert.match(s, WEBAPP_SLUG);
  });

  step("a folder is refused in plain words: not a path, missing, a file, no hydor.json, already registered, inside or holding Hydor's data", () => {
    refuses(() => addWebApp(db, { folder: "" }, dataDir), 400, /which folder/);
    refuses(() => addWebApp(db, { folder: "relative/dir" }, dataDir), 400, /full path/);
    refuses(() => addWebApp(db, { folder: path.join(scratch, "nowhere") }, dataDir), 400, /no folder at/);
    const file = path.join(scratch, "afile");
    fs.writeFileSync(file, "x");
    refuses(() => addWebApp(db, { folder: file }, dataDir), 400, /not a folder/);
    const bare = path.join(scratch, "apps", "bare");
    fs.mkdirSync(bare, { recursive: true });
    refuses(() => addWebApp(db, { folder: bare }, dataDir), 400, /no hydor\.json/);
    const first = listWebApps(db)[0];
    refuses(() => addWebApp(db, { folder: first.folder }, dataDir), 409, /already registered, as “Club Notes”/);
    // The same folder through a link is the same folder.
    const link = path.join(scratch, "link-to-notes");
    fs.symlinkSync(first.folder, link);
    refuses(() => addWebApp(db, { folder: link }, dataDir), 409, /already registered/);
    // Inside Hydor's data folder, and a folder that holds it.
    const inside = path.join(dataDir, "webapps", "x");
    fs.mkdirSync(inside, { recursive: true });
    fs.writeFileSync(path.join(inside, "hydor.json"), "{}");
    refuses(() => addWebApp(db, { folder: inside }, dataDir), 400, /inside Hydor’s own data folder/);
    refuses(() => addWebApp(db, { folder: dataDir }, dataDir), 400, /inside Hydor’s own data folder/);
    fs.writeFileSync(path.join(scratch, "hydor.json"), "{}");
    refuses(() => addWebApp(db, { folder: scratch }, dataDir), 400, /holds Hydor’s own data folder/);
    fs.rmSync(path.join(scratch, "hydor.json"));
    // A broken hydor.json is a plain refusal too.
    refuses(() => addWebApp(db, { folder: app("broken", "{ not json") }, dataDir), 400, /cannot be used yet/);
    refuses(() => addWebApp(db, { folder: app("array", "[1]") }, dataDir), 400, /one object/);
    refuses(() => addWebApp(db, { folder: app("longname"), name: "n".repeat(81) }, dataDir), 400, /at most 80/);
  });

  step("hydor.json is read each time: a broken or huge one is a sentence, never a crash", () => {
    const a = addWebApp(db, { folder: app("lenient", { ...plain, name: "Lenient" }) }, dataDir);
    assert.equal(shapeOf(a.folder).ok, true);
    fs.writeFileSync(path.join(a.folder, "hydor.json"), "{ nope");
    assert.equal(shapeOf(a.folder).ok, false);
    fs.writeFileSync(path.join(a.folder, "hydor.json"), JSON.stringify({ pad: "x".repeat(70 * 1024) }));
    assert.match(shapeOf(a.folder).problem!, /too large/);
    fs.rmSync(path.join(a.folder, "hydor.json"));
    assert.match(shapeOf(a.folder).problem!, /no hydor\.json/);
    fs.rmSync(a.folder, { recursive: true });
    assert.match(shapeOf(a.folder).problem!, /not there any more/);
    // The row is still there, and still lists.
    assert.equal(getWebApp(db, a.id)?.name, "Lenient");
    fs.mkdirSync(a.folder);
    fs.writeFileSync(path.join(a.folder, "hydor.json"), JSON.stringify({ ...plain, name: "Back" }));
    assert.equal(shapeOf(a.folder).name, "Back");
  });

  step("a change keeps the slug, checks the name, and changes the settings field by field (strictly), a field not named stays", () => {
    const a = listWebApps(db)[0];
    const b = changeWebApp(db, a.id, { name: "Renamed", settings: { tiers: ["quick", "standard", "quick"], dailyCapUsd: 2.5, notify: true } });
    assert.equal(b.name, "Renamed");
    assert.equal(b.slug, a.slug, "its address does not move");
    assert.deepEqual(b.settings, { tiers: ["quick", "standard"], dailyCapUsd: 2.5, apps: [], connections: [], notify: true });
    assert.ok(b.updatedAt >= a.updatedAt);
    const c = changeWebApp(db, a.id, { settings: { apps: ["tpl:deep-research", " ", "tpl:deep-research"], connections: ["gmail"] } });
    assert.deepEqual(c.settings, { tiers: ["quick", "standard"], dailyCapUsd: 2.5, apps: ["tpl:deep-research"], connections: ["gmail"], notify: true });
    assert.equal(c.name, "Renamed");
    refuses(() => changeWebApp(db, a.id, { name: "   " }), 400, /Give the app a name/);
    refuses(() => changeWebApp(db, a.id, { settings: { tiers: ["huge"] } }), 400, /Tiers are a list/);
    refuses(() => changeWebApp(db, a.id, { settings: { dailyCapUsd: -1 } }), 400, /daily cap/);
    refuses(() => changeWebApp(db, a.id, { settings: { dailyCapUsd: "lots" } }), 400, /daily cap/);
    refuses(() => changeWebApp(db, a.id, { settings: { dailyCapUsd: true } }), 400, /daily cap/);
    refuses(() => changeWebApp(db, a.id, { settings: { apps: "all" } }), 400, /list of ids/);
    refuses(() => changeWebApp(db, a.id, { settings: { connections: [1] } }), 400, /list of ids/);
    refuses(() => changeWebApp(db, a.id, { settings: { notify: "yes" } }), 400, /true or false/);
    refuses(() => changeWebApp(db, a.id, { settings: [] }), 400, /object/);
    refuses(() => changeWebApp(db, "nothing", { name: "x" }), 404, /no such web app/);
    assert.deepEqual(getWebApp(db, a.id)!.settings, c.settings, "a refused change changed nothing");
  });

  step("settings stored wrongly (hand-edited, or from a later version) read as defaults field by field", () => {
    assert.deepEqual(readSettings(null), DEFAULT_WEBAPP_SETTINGS);
    assert.deepEqual(readSettings("x"), DEFAULT_WEBAPP_SETTINGS);
    assert.deepEqual(readSettings({ tiers: ["best", "nope"], dailyCapUsd: "abc", apps: "no", connections: [3, "ok"], notify: "true" }), {
      tiers: ["best"],
      dailyCapUsd: 1,
      apps: [],
      connections: ["ok"],
      notify: false,
    });
    const a = listWebApps(db)[1];
    db.prepare("update web_apps set settings = ? where id = ?").run("{ garbage", a.id);
    assert.deepEqual(getWebApp(db, a.id)!.settings, DEFAULT_WEBAPP_SETTINGS);
  });

  step("the slug and the folder are unique in the table itself, and a removed app can be registered again", () => {
    const a = listWebApps(db)[0];
    assert.throws(() => db.prepare("insert into web_apps values ('x1', ?, 'n', '/some/where', '{}', 1, 1, null)").run(a.slug), /UNIQUE/);
    assert.throws(() => db.prepare("insert into web_apps values ('x2', 'unique-slug', 'n', ?, '{}', 1, 1, null)").run(a.folder), /UNIQUE/);
    const n = listWebApps(db).length;
    assert.equal(removeWebApp(db, a.id), true);
    assert.equal(removeWebApp(db, a.id), false);
    assert.equal(listWebApps(db).length, n - 1);
    assert.equal(getWebApp(db, a.id), null);
    assert.equal(webAppBySlug(db, a.slug), null);
    const again = addWebApp(db, { folder: a.folder, name: "Renamed" }, dataDir);
    assert.notEqual(again.id, a.id);
    assert.equal(again.slug, "renamed", "the slug of the one that went is free again");
  });
} finally {
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}

console.log(`\n${passed} checks passed`);
process.exit(0);
