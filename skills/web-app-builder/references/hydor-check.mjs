#!/usr/bin/env node
// Checks that an app does what its hydor.json says. Needs Node 22 and nothing else: node hydor-check.mjs [folder]
// Made from Hydor's own checker by `npm run webapps:checker`; do not edit it here. AGPL-3.0, as Hydor is.

// server/webapps/contract-check.ts
import { spawn } from "node:child_process";
import crypto2 from "node:crypto";
import fs3 from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path3 from "node:path";

// shared/hydor-file.ts
var HYDOR_FILE = "hydor.json";
var HYDOR_FILE_MAX = 64 * 1024;
var HYDOR_FIELDS = ["$schema", "name", "build", "start", "dev", "env", "ready", "signIn", "private", "keys", "services", "database", "accounts", "smoke"];
var RESERVED_ENV = ["PATH", "HOME", "HOST", "NODE_ENV", "NODE_OPTIONS", "SHELL", "USER", "PWD", "TMPDIR", "IFS", "BASH_ENV", "ENV", "PYTHONPATH", "PYTHONSTARTUP"];
var reserved = (name) => RESERVED_ENV.includes(name) || /^(HYDOR_|LD_|DYLD_)/.test(name);
var ENV_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;
var KEY_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;
var DB_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
var TIERS = ["quick", "standard", "best"];
var isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function near(word, known) {
  const distance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let before = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const keep = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, before + (a[i - 1] === b[j - 1] ? 0 : 1));
        before = keep;
      }
    }
    return row[b.length];
  };
  return known.map((k) => ({ k, d: distance(word.toLowerCase(), k.toLowerCase()) })).filter((x) => x.d <= 2).sort((a, b) => a.d - b.d)[0]?.k;
}
function shellExtra(command) {
  let quote2 = "";
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote2) {
      if (c === "\\" && quote2 === '"') i++;
      else if (c === quote2) quote2 = "";
      else if (quote2 === '"' && (c === "`" || c === "$" && command[i + 1] === "(")) return c === "`" ? "`" : "$(";
      continue;
    }
    if (c === "\\") i++;
    else if (c === '"' || c === "'") quote2 = c;
    else if (";&|<>`\n".includes(c)) return c === "\n" ? "a new line" : c;
    else if (c === "$" && command[i + 1] === "(") return "$(";
  }
  return quote2 ? `an unclosed ${quote2}` : null;
}
function readHydorValue(value) {
  const problems = [];
  const say = (text) => void problems.push(text);
  if (!isObject(value)) return { ok: false, problems: [`${HYDOR_FILE} should hold one object, in braces.`] };
  const unknown = (o, known, where) => {
    for (const k of Object.keys(o)) {
      if (known.includes(k)) continue;
      const meant = near(k, known);
      say(`${where}\u201C${k}\u201D is not a field Hydor reads${meant ? ` (did you mean \u201C${meant}\u201D?)` : ""}: take it out.`);
    }
  };
  unknown(value, HYDOR_FIELDS, "");
  const line = (v, what, max) => {
    if (typeof v !== "string" || !v.trim()) return void say(`${what} should be text.`);
    if (v.length > max) return void say(`${what} is longer than ${max} characters.`);
    if (/[\u0000-\u001f\u007f]/.test(v)) return void say(`${what} should be one line.`);
    return v.trim();
  };
  const path4 = (v, what) => {
    if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//") || /[\s\\#]/.test(v) || v.length > 200) return void say(`${what} should be an address inside the app: it starts with one slash, like /health, with no spaces.`);
    return v;
  };
  const command = (v, what) => {
    const c = line(v, what, 500);
    if (!c) return void 0;
    const extra = shellExtra(c);
    if (extra) return void say(`${what} should be one command, with no ${extra}: put build steps in \u201Cbuild\u201D, and set what the program needs in the program.`);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(c)) return void say(`${what} should start with the program, not with a variable (NAME=value): Hydor sets the environment.`);
    return c;
  };
  const name = value.name === void 0 ? void 0 : line(value.name, "\u201Cname\u201D", 80);
  const build2 = value.build === void 0 ? void 0 : line(value.build, "\u201Cbuild\u201D", 1e3);
  const start = value.start === void 0 ? void say('\u201Cstart\u201D is missing: the one command that starts the app in production, like "node server.js".') : command(value.start, "\u201Cstart\u201D");
  const dev = value.dev === void 0 ? void 0 : command(value.dev, "\u201Cdev\u201D");
  const env = { port: "", data: "" };
  if (!isObject(value.env)) say('\u201Cenv\u201D is missing: the names of the variables the app reads its port and data folder from, like { "port": "PORT", "data": "DATA_DIR" }.');
  else {
    unknown(value.env, ["port", "data", "url", "secret", "host"], "In \u201Cenv\u201D, ");
    const taken = /* @__PURE__ */ new Map();
    for (const k of ["port", "data", "url", "secret", "host"]) {
      const v = value.env[k];
      if (v === void 0) {
        if (k === "port") say('\u201Cenv.port\u201D is missing: the variable the app reads its port from, usually "PORT".');
        if (k === "data") say('\u201Cenv.data\u201D is missing: the variable the app reads its data folder from, such as "DATA_DIR". Everything the app keeps goes in that folder.');
        continue;
      }
      if (typeof v !== "string" || !ENV_NAME.test(v)) say(`\u201Cenv.${k}\u201D should be a variable's name in capitals, such as ${k === "port" ? "PORT" : k === "data" ? "DATA_DIR" : k === "url" ? "APP_URL" : k === "host" ? "HOST" : "APP_SECRET"}.`);
      else if (reserved(v) && !(k === "host" && v === "HOST")) say(`\u201Cenv.${k}\u201D cannot be ${v}: Hydor sets that one itself.`);
      else if (taken.has(v)) say(`\u201Cenv.${k}\u201D and \u201Cenv.${taken.get(v)}\u201D are both ${v}: each needs a variable of its own.`);
      else {
        taken.set(v, k);
        env[k] = v;
      }
    }
  }
  const ready = value.ready === void 0 ? void say('\u201Cready\u201D is missing: an address that answers once the app is ready, like "/health". It has to answer without anyone signed in.') : path4(value.ready, "\u201Cready\u201D");
  const signIn = value.signIn === "hydor" || value.signIn === "own" ? value.signIn : void say('\u201CsignIn\u201D should be "hydor" (Hydor says who is there, in the x-hydor-person header) or "own" (the app has accounts of its own).');
  const privatePath = value.private === void 0 ? "/" : path4(value.private, "\u201Cprivate\u201D");
  if (value.private !== void 0 && value.signIn === "own") say('\u201Cprivate\u201D is only for "signIn": "hydor": take it out.');
  if (signIn === "hydor" && isObject(value.env) && value.env.secret === void 0) say('With "signIn": "hydor", \u201Cenv.secret\u201D is needed: the app checks who is there with its secret.');
  const tryOf = (v, what) => {
    if (v === void 0) return void 0;
    if (!isObject(v)) return void say(`${what} should be { "method": "POST", "path": "/\u2026", "body": {\u2026} }.`);
    unknown(v, ["method", "path", "body"], `In ${what}, `);
    if (v.method !== "GET" && v.method !== "POST") say(`${what}.method should be "GET" or "POST".`);
    const p = path4(v.path, `${what}.path`);
    if (!p || v.method !== "GET" && v.method !== "POST") return void 0;
    return { method: v.method, path: p, ...v.body !== void 0 ? { body: v.body } : {} };
  };
  const services = {};
  if (value.services !== void 0) {
    if (!isObject(value.services)) say('\u201Cservices\u201D should be an object: { "ai": {\u2026}, "embed": true, "mail": true }, with only those the app calls.');
    else {
      unknown(value.services, ["ai", "embed", "mail"], "In \u201Cservices\u201D, ");
      const ai = value.services.ai;
      if (ai !== void 0) {
        if (!isObject(ai)) say('\u201Cservices.ai\u201D should be { "tiers": ["quick"] }: the sizes of model the app asks for.');
        else {
          unknown(ai, ["tiers", "usdPerDay", "try"], "In \u201Cservices.ai\u201D, ");
          const tiers = Array.isArray(ai.tiers) ? ai.tiers : [];
          if (!tiers.length || !tiers.every((t2) => TIERS.includes(t2)) || new Set(tiers).size !== tiers.length) say('\u201Cservices.ai.tiers\u201D should list what the app asks for, each once, of "quick", "standard" and "best".');
          const usd = ai.usdPerDay;
          if (usd !== void 0 && !(typeof usd === "number" && Number.isFinite(usd) && usd >= 0 && usd <= 1e4)) say("\u201Cservices.ai.usdPerDay\u201D should be what a day of it costs, in US dollars (0 to 10000).");
          const t = tryOf(ai.try, "\u201Cservices.ai.try\u201D");
          services.ai = { tiers: tiers.filter((x) => TIERS.includes(x)), ...typeof usd === "number" ? { usdPerDay: usd } : {}, ...t ? { try: t } : {} };
        }
      }
      for (const k of ["embed", "mail"]) {
        const v = value.services[k];
        if (v === void 0 || v === false) continue;
        if (v === true) services[k] = {};
        else if (isObject(v)) {
          unknown(v, ["try"], `In \u201Cservices.${k}\u201D, `);
          const t = tryOf(v.try, `\u201Cservices.${k}.try\u201D`);
          services[k] = t ? { try: t } : {};
        } else say(`\u201Cservices.${k}\u201D should be true, or { "try": {\u2026} }.`);
      }
    }
  }
  const keys = [];
  if (value.keys !== void 0) {
    if (!Array.isArray(value.keys) || value.keys.length > 40) say("\u201Ckeys\u201D should be a list of at most 40 keys.");
    else
      value.keys.forEach((raw, i) => {
        if (!isObject(raw)) return say(`Key ${i + 1} should be an object with name, from, why and how.`);
        const at = typeof raw.name === "string" && raw.name ? `The key ${raw.name.slice(0, 40)}` : `Key ${i + 1}`;
        unknown(raw, ["name", "from", "why", "how", "url", "label", "optional", "group", "looks"], `${at}: `);
        const before = problems.length;
        const k = raw.name;
        if (typeof k !== "string" || !KEY_NAME.test(k)) say(`${at}: \u201Cname\u201D should be the variable it is given in, in capitals, such as STRIPE_SECRET_KEY.`);
        else if (reserved(k)) say(`${at} cannot have that name: Hydor sets it itself.`);
        else if (Object.values(env).includes(k)) say(`${at} is also a name in \u201Cenv\u201D: each needs a variable of its own.`);
        else if (keys.some((x) => x.name === k)) say(`${at} is listed twice.`);
        const from = line(raw.from, `${at}: \u201Cfrom\u201D (who gives it: a provider's name, "you" or "made")`, 60);
        const why = line(raw.why, `${at}: \u201Cwhy\u201D (what the app does with it)`, 600);
        let how;
        if (raw.how !== void 0) {
          if (!Array.isArray(raw.how) || !raw.how.length || raw.how.length > 8 || !raw.how.every((s) => typeof s === "string" && s.trim() && s.length <= 300)) say(`${at}: \u201Chow\u201D should be one to eight steps, each a short line.`);
          else how = raw.how.map((s) => s.trim());
        } else if (from && from.toLowerCase() !== "made") say(`${at}: \u201Chow\u201D is missing: the steps that get it, so the owner is not left looking.`);
        let url;
        if (raw.url !== void 0) {
          if (typeof raw.url !== "string" || !/^https:\/\/[^\s]+$/.test(raw.url) || raw.url.length > 300) say(`${at}: \u201Curl\u201D should be the provider's page, starting https://.`);
          else url = raw.url;
        }
        const label = raw.label === void 0 ? void 0 : line(raw.label, `${at}: \u201Clabel\u201D`, 60);
        if (raw.optional !== void 0 && typeof raw.optional !== "boolean") say(`${at}: \u201Coptional\u201D is true or false.`);
        let group;
        if (raw.group !== void 0) {
          if (!isObject(raw.group) || typeof raw.group.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(raw.group.id)) say(`${at}: \u201Cgroup\u201D should be { "id": "\u2026", "title": "\u2026" }, the same id for keys got together.`);
          else group = { id: raw.group.id, ...typeof raw.group.title === "string" && raw.group.title ? { title: raw.group.title.slice(0, 80) } : {} };
        }
        let looks;
        if (raw.looks !== void 0) {
          if (!isObject(raw.looks)) say(`${at}: \u201Clooks\u201D should be { "starts": ["sk_"], "say": "starts with sk_" }.`);
          else {
            const l = raw.looks;
            unknown(l, ["starts", "prefix", "pattern", "say", "not"], `${at}, in \u201Clooks\u201D: `);
            const starts = l.starts ?? l.prefix;
            const prefix = Array.isArray(starts) ? starts.filter((x) => typeof x === "string" && !!x).slice(0, 6) : [];
            if (starts !== void 0 && !prefix.length) say(`${at}: \u201Clooks.starts\u201D should be a list of how a right value starts, such as ["sk_"].`);
            const not = [];
            if (l.not !== void 0) {
              const list = Array.isArray(l.not) ? l.not.slice(0, 8) : [];
              if (!list.length) say(`${at}: \u201Clooks.not\u201D should be a list of { "starts": "pk_", "say": "\u2026" }.`);
              for (const w of list) {
                if (!isObject(w) || typeof w.say !== "string" || !w.say.trim() || !(typeof w.starts === "string" || typeof w.pattern === "string")) say(`${at}: each of \u201Clooks.not\u201D should say what it is ("starts" or "pattern") and what to tell the owner ("say").`);
                else
                  not.push({
                    ...typeof w.starts === "string" && w.starts ? { starts: w.starts.slice(0, 40) } : {},
                    ...typeof w.pattern === "string" && w.pattern.length <= 200 ? { pattern: w.pattern } : {},
                    say: w.say.trim().slice(0, 200),
                    ...typeof w.when === "string" ? { when: w.when.slice(0, 200) } : {}
                  });
              }
            }
            looks = { ...prefix.length ? { prefix } : {}, ...typeof l.pattern === "string" && l.pattern.length <= 200 ? { pattern: l.pattern } : {}, ...typeof l.say === "string" ? { say: l.say.slice(0, 200) } : {}, ...not.length ? { not } : {}, whole: true };
          }
        }
        if (problems.length === before && typeof k === "string" && from && why)
          keys.push({ name: k, from, why, ...how ? { how } : {}, ...url ? { url } : {}, ...label ? { label } : {}, ...raw.optional === true ? { optional: true } : {}, ...group ? { group } : {}, ...looks && Object.keys(looks).length ? { looks } : {} });
      });
  }
  let database;
  if (value.database !== void 0) {
    if (!isObject(value.database)) say('\u201Cdatabase\u201D should be { "file": "app.db", "sqlite": true }.');
    else {
      unknown(value.database, ["file", "sqlite"], "In \u201Cdatabase\u201D, ");
      const f = value.database.file;
      const sqlite = value.database.sqlite;
      if (typeof sqlite !== "boolean") say("\u201Cdatabase.sqlite\u201D should be true (a SQLite file, which Hydor backs up while the app runs) or false.");
      if (typeof f !== "string" || !DB_NAME.test(f)) say("\u201Cdatabase.file\u201D should be the name of the file in the data folder, with no folder before it, such as app.db.");
      else if (sqlite === true && !/\.(db|sqlite|sqlite3)$/i.test(f)) say("A SQLite file\u2019s name ends in .db, .sqlite or .sqlite3.");
      else if (typeof sqlite === "boolean") database = { file: f, sqlite };
    }
  }
  let accounts;
  const accountOf = (v, what) => {
    if (!isObject(v)) return void say(`${what} should be { "path": "/\u2026", "body": { "email": "{email}", "password": "{password}" } }.`);
    unknown(v, ["method", "path", "send", "body"], `In ${what}, `);
    const method = v.method === void 0 ? "POST" : v.method;
    if (method !== "POST" && method !== "PUT") say(`${what}.method should be "POST" or "PUT".`);
    const send = v.send === void 0 ? "json" : v.send;
    if (send !== "json" && send !== "form") say(`${what}.send should be "json" or "form".`);
    const p = path4(v.path, `${what}.path`);
    const body = isObject(v.body) && Object.values(v.body).every((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean") ? v.body : void 0;
    if (!body) say(`${what}.body should be the fields to send, such as { "email": "{email}", "password": "{password}" }.`);
    if (!p || !body || method !== "POST" && method !== "PUT" || send !== "json" && send !== "form") return void 0;
    return { method, path: p, send, body };
  };
  if (value.accounts !== void 0) {
    if (!isObject(value.accounts)) say('\u201Caccounts\u201D should be { "signUp": {\u2026}, "signIn": {\u2026} }.');
    else {
      unknown(value.accounts, ["signUp", "signIn"], "In \u201Caccounts\u201D, ");
      const signUp = accountOf(value.accounts.signUp, "\u201Caccounts.signUp\u201D");
      const signInTo = accountOf(value.accounts.signIn, "\u201Caccounts.signIn\u201D");
      if (signUp && signInTo) accounts = { signUp, signIn: signInTo };
    }
    if (value.signIn === "hydor") say('\u201Caccounts\u201D is only for "signIn": "own": take it out.');
  }
  let smoke;
  if (value.smoke !== void 0) {
    if (typeof value.smoke === "string") smoke = command(value.smoke, "\u201Csmoke\u201D");
    else if (isObject(value.smoke)) smoke = tryOf(value.smoke, "\u201Csmoke\u201D");
    else say('\u201Csmoke\u201D should be one command, like "node smoke.mjs", or one request, like { "method": "GET", "path": "/api/items" }.');
  }
  if (problems.length || !start || !ready || !signIn || !privatePath) return { ok: false, problems };
  return {
    ok: true,
    file: {
      ...name ? { name } : {},
      ...build2 ? { build: build2 } : {},
      start,
      ...dev ? { dev } : {},
      env,
      ready,
      signIn,
      private: privatePath,
      keys,
      services,
      ...database ? { database } : {},
      ...accounts ? { accounts } : {},
      ...smoke ? { smoke } : {}
    }
  };
}
function readHydorText(text) {
  if (text.length > HYDOR_FILE_MAX) return { ok: false, problems: [`${HYDOR_FILE} is too large to be one (over 64 KB).`] };
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, problems: [`${HYDOR_FILE} is not valid JSON (${e.message.replace(/^JSON\.parse: /, "")}).`] };
  }
  return readHydorValue(value);
}
var usesServices = (s) => !!(s.ai || s.embed || s.mail);

// server/webapps/own-paths.ts
import fs from "node:fs";
import path from "node:path";
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", "dist", "build", "out", "coverage", "target", "vendor", "vendored", "third_party", "third-party", "bower_components", "jspm_packages", "site-packages", "venv", "__pycache__", "design"]);
var MARKUP = /* @__PURE__ */ new Set([".html", ".htm", ".vue", ".svelte", ".ejs", ".hbs", ".njk", ".pug", ".php", ".erb", ".jinja", ".j2", ".twig", ".liquid", ".mustache", ".mjml"]);
var CODE = /* @__PURE__ */ new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx", ".go"]);
var HASH = /* @__PURE__ */ new Set([".py", ".rb"]);
var STYLE = /* @__PURE__ */ new Set([".css", ".scss", ".sass", ".less"]);
var MAX_FILE = 512 * 1024;
var MAX_FILES = 3e3;
var MAX_DEPTH = 10;
var MAX_LINE = 2e3;
var kindOf = (ext) => MARKUP.has(ext) ? "markup" : CODE.has(ext) ? "code" : HASH.has(ext) ? "hash" : STYLE.has(ext) ? "style" : null;
function sources(root) {
  const out = [];
  const walk = (dir2, depth) => {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
    let names;
    try {
      names = fs.readdirSync(dir2, { withFileTypes: true });
    } catch {
      return;
    }
    names.sort((a, b) => a.name.localeCompare(b.name));
    for (const d of names) {
      if (out.length >= MAX_FILES) return;
      const full = path.join(dir2, d.name);
      if (d.isDirectory()) {
        if (d.name.startsWith(".") || SKIP_DIRS.has(d.name) || /^(__tests__|tests?|e2e)$/.test(d.name)) continue;
        walk(full, depth + 1);
      } else if (d.isFile()) {
        const kind = kindOf(path.extname(d.name).toLowerCase());
        if (!kind || /\.min\.|\.d\.ts$|(^|[.-])(test|spec)\.[a-z]+$|-test\.[a-z]+$/i.test(d.name)) continue;
        try {
          if (fs.statSync(full).size > MAX_FILE) continue;
        } catch {
          continue;
        }
        out.push({ file: full, kind });
      }
    }
  };
  walk(root, 0);
  return out;
}
function blank(text, kind) {
  if (kind === "markup") return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  if (kind === "style") return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const o = text.split("");
  const n = o.length;
  let i = 0;
  const wipe = (from, to) => {
    for (let k = from; k < to; k++) if (o[k] !== "\n") o[k] = " ";
  };
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (kind === "hash" && c === "#") {
      let e = text.indexOf("\n", i);
      if (e < 0) e = n;
      wipe(i, e);
      i = e;
    } else if (kind === "code" && c === "/" && next === "/") {
      let e = text.indexOf("\n", i);
      if (e < 0) e = n;
      wipe(i, e);
      i = e;
    } else if (kind === "code" && c === "/" && next === "*") {
      let e = text.indexOf("*/", i + 2);
      e = e < 0 ? n : e + 2;
      wipe(i, e);
      i = e;
    } else if (c === '"' || c === "'" || c === "`" && kind === "code") {
      let k = i + 1;
      while (k < n && text[k] !== c && (c === "`" || text[k] !== "\n")) k += text[k] === "\\" ? 2 : 1;
      i = k + 1;
    } else i++;
  }
  return o.join("");
}
var Q = "[\"'`]";
var OWN = String.raw`(\/(?!\/)[^"'\`\\\s)]*)`;
var OWN_STR = String.raw`(\/(?!\/)[^"'\`\\]*)`;
var RULES = [
  // markup: href, src, action, formaction, poster (and the ones scripts read), written or in JSX/templates as a string
  { re: new RegExp(String.raw`(?<![\w-])(?:href|src|action|formaction|poster|data-src|data-href)\s*=\s*(?:\{\s*)?\\?${Q}${OWN}`, "gi") },
  // meta refresh
  { re: new RegExp(String.raw`http-equiv\s*=\s*\\?["']refresh\\?["'][^>]*?content\s*=\s*\\?["']\s*\d+\s*;\s*url\s*=\s*${OWN}`, "gi") },
  // css: url(/…) and @import "/…"
  { re: new RegExp(String.raw`url\(\s*${Q}?${OWN}`, "gi") },
  { re: new RegExp(String.raw`@import\s+${Q}${OWN}`, "gi") },
  // requests
  { re: new RegExp(String.raw`(?<![\w$.])(?:window\.)?(?:fetch|axios|ky|got|new\s+EventSource|new\s+WebSocket|new\s+Request)\s*\(\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`(?<![\w$])(?:axios|ky|got|\$|superagent)\.(?:get|post|put|patch|delete|head|options|request|getJSON|ajax|postJSON)\s*\(\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`\.open\(\s*["'](?:GET|POST|PUT|PATCH|DELETE|HEAD)["']\s*,\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`\bbaseURL\s*:\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`navigator\.sendBeacon\(\s*${Q}${OWN_STR}`, "g") },
  // moving the page
  { re: new RegExp(String.raw`(?:(?<![\w$.])|(?<=\b(?:window|document|top|self|parent)\.))location(?:\.href)?\s*=(?!=)\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`\blocation\.(?:assign|replace)\(\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`\b(?:pushState|replaceState)\([^,()]*,[^,()]*,\s*${Q}${OWN_STR}`, "g") },
  // the server sending people on
  { re: new RegExp(String.raw`\bredirect\w*\(\s*(?:\d{3}\s*,\s*|[A-Za-z_.]*Status\w*\s*,\s*)?${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`\bRedirect\(\s*\w+\s*,\s*\w+\s*,\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`(?:["'](?:[Ll]ocation)["']|\bLocation)\s*[:,]\s*${Q}${OWN_STR}`, "g") },
  { re: new RegExp(String.raw`\bLocation:\s*${OWN}`, "g") }
];
var SRCSET = /(?<![\w-])srcset\s*=\s*\\?(["'])([^"']*)\1/gi;
var lineOf = (starts, at) => {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if (starts[mid] <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
};
var VITE = /^vite\.config\.(?:[cm]?[jt]s)$/;
function viteBase(dir2) {
  let config = null;
  try {
    config = fs.readdirSync(dir2).find((n) => VITE.test(n)) ?? null;
  } catch {
  }
  if (!config || !fs.existsSync(path.join(dir2, "index.html"))) return null;
  let text = "";
  try {
    text = fs.readFileSync(path.join(dir2, config), "utf8");
  } catch {
    return null;
  }
  const code = blank(text, "code");
  const m = /\bbase\s*:\s*(["'`])([^"'`]*)\1/.exec(code);
  if (m && m[2] !== "/") return null;
  if (!m && /\bbase\s*:/.test(code)) return null;
  const at = m ? m.index : 0;
  return { file: config, line: text.slice(0, at).split("\n").length, address: m ? `base: "/"` : `no base (Vite builds with "/": set base: './')` };
}
function addressesIn(text, ext) {
  const kind = kindOf(ext.toLowerCase());
  if (!kind) return [];
  const clean = blank(text, kind);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of RULES) {
    r.re.lastIndex = 0;
    for (let m = r.re.exec(clean); m; m = r.re.exec(clean)) {
      const address = m[r.at ?? 1];
      if (!address) continue;
      const at = m.index + m[0].lastIndexOf(address);
      if (seen.has(at)) continue;
      seen.add(at);
      out.push({ at, address });
    }
  }
  SRCSET.lastIndex = 0;
  for (let m = SRCSET.exec(clean); m; m = SRCSET.exec(clean)) {
    let pos = m.index + m[0].indexOf(m[2], m[0].indexOf("=") + 1);
    for (const part of m[2].split(",")) {
      const lead = part.length - part.trimStart().length;
      const url = part.trim().split(/\s+/)[0] ?? "";
      if (/^\/(?!\/)/.test(url) && !seen.has(pos + lead)) {
        seen.add(pos + lead);
        out.push({ at: pos + lead, address: url });
      }
      pos += part.length + 1;
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
function scanOwnPaths(dir2) {
  const root = path.resolve(dir2);
  const found = [];
  const list = sources(root);
  let files = 0;
  for (const { file, kind } of list) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    files++;
    if (text.split("\n").some((l) => l.length > MAX_LINE)) continue;
    const rel = path.relative(root, file).split(path.sep).join("/");
    const ext = path.extname(file).toLowerCase();
    if (path.basename(file) === "index.html" && kind === "markup") {
      const folder = path.dirname(file);
      let config = false;
      try {
        config = fs.readdirSync(folder).some((n) => VITE.test(n));
      } catch {
      }
      if (config) {
        const b = viteBase(folder);
        if (b) found.push({ file: path.relative(root, path.join(folder, b.file)).split(path.sep).join("/"), line: b.line, address: b.address });
        continue;
      }
    }
    const starts = [0];
    for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
    for (const a of addressesIn(text, ext)) found.push({ file: rel, line: lineOf(starts, a.at), address: a.address });
  }
  return { files, found };
}

// server/webapps/run-app.ts
import fs2 from "node:fs";
import path2 from "node:path";
function contractRunShape(file) {
  return {
    start: { shell: file.start },
    ...file.dev ? { dev: { shell: file.dev } } : {},
    vars: file.env,
    ready: file.ready
  };
}
var nodeBin = () => fs2.realpathSync(process.execPath);
var pathFor = (node) => `${path2.dirname(node)}:/usr/local/bin:/usr/bin:/bin`;
function argvOf(command) {
  if (process.platform === "win32") return [process.env.ComSpec ?? "cmd.exe", "/d", "/s", "/c", command.shell];
  return ["/bin/sh", "-c", `exec ${command.shell}`];
}
function appEnv(shape, o) {
  const env = {
    PATH: pathFor(o.node),
    NODE_ENV: o.dev ? "development" : "production",
    HOST: o.host ?? "127.0.0.1",
    NODE_OPTIONS: "--max-old-space-size=384"
  };
  env[shape.vars.host ?? "HOST"] = o.host ?? "127.0.0.1";
  env[shape.vars.port] = String(o.port);
  env[shape.vars.data] = o.data;
  if (shape.vars.secret) env[shape.vars.secret] = o.secret;
  if (shape.vars.url && o.address) env[shape.vars.url] = o.address;
  if (o.home) env.HOME = o.home;
  for (const [k, v] of Object.entries(o.extra ?? {})) if (/^[A-Z][A-Z0-9_]{0,63}$/.test(k) && !(k in env) && typeof v === "string") env[k] = v;
  return env;
}
function descendants(pid) {
  let ids;
  try {
    ids = fs2.readdirSync("/proc").filter((n) => /^\d+$/.test(n));
  } catch {
    return [];
  }
  const kids = /* @__PURE__ */ new Map();
  for (const id of ids) {
    try {
      const stat = fs2.readFileSync(`/proc/${id}/stat`, "utf8");
      const open2 = stat.indexOf("(");
      const close = stat.lastIndexOf(")");
      const ppid = Number(stat.slice(close + 2).split(" ")[1]);
      kids.set(ppid, [...kids.get(ppid) ?? [], { pid: Number(id), name: stat.slice(open2 + 1, close) }]);
    } catch {
    }
  }
  const out = [];
  const walk = (p) => {
    for (const k of kids.get(p) ?? []) {
      out.push(k);
      walk(k.pid);
    }
  };
  walk(pid);
  return out;
}
function signalApp(child, sandboxed, signal) {
  if (!child.pid) return;
  if (sandboxed && signal === "SIGTERM") {
    const inside = descendants(child.pid).filter((p) => p.name !== "bwrap");
    if (inside.length) {
      for (const p of inside) {
        try {
          process.kill(p.pid, signal);
        } catch {
        }
      }
      return;
    }
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
    }
  }
}
function buildEnv(node, home, extra = {}) {
  fs2.mkdirSync(home, { recursive: true, mode: 448 });
  const out = {
    PATH: pathFor(node),
    HOME: home,
    CI: "1",
    NO_COLOR: "1",
    LANG: "C.UTF-8",
    GIT_TERMINAL_PROMPT: "0",
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
    ...extra
  };
  for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "npm_config_registry", "NPM_CONFIG_REGISTRY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"]) if (process.env[k]) out[k] = process.env[k];
  return out;
}

// server/webapps/sign.ts
import crypto from "node:crypto";
var PERSON_HEADER = "x-hydor-person";
function signPerson(person2, secret, ttlSeconds = 60) {
  const body = {
    id: person2.id,
    name: person2.name,
    role: person2.role
  };
  if (person2.email !== void 0) body.email = person2.email;
  if (person2.teamId !== void 0) body.teamId = person2.teamId;
  body.exp = Math.floor(Date.now() / 1e3) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify(body), "utf8").toString(
    "base64url"
  );
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
function verifyPerson(value, secret, graceSeconds = 0, now = Date.now()) {
  if (typeof value !== "string" || value.length > 4096) return { ok: false, why: "malformed" };
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, why: "malformed" };
  const want = crypto.createHmac("sha256", secret).update(parts[0]).digest();
  let got;
  try {
    got = Buffer.from(parts[1], "base64url");
  } catch {
    return { ok: false, why: "malformed" };
  }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return { ok: false, why: "signature" };
  let body;
  try {
    body = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return { ok: false, why: "malformed" };
  }
  const line = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v);
  const roles = ["owner", "admin", "member", "guest"];
  if (!body || typeof body !== "object" || !line(body.id, 120) || !line(body.name, 80) || !roles.includes(body.role) || typeof body.exp !== "number") return { ok: false, why: "malformed" };
  if (body.exp * 1e3 + graceSeconds * 1e3 < now) return { ok: false, why: "expired" };
  const person2 = { id: body.id, name: body.name, role: body.role };
  if (line(body.email, 200)) person2.email = body.email;
  if (line(body.teamId, 120)) person2.teamId = body.teamId;
  return { ok: true, person: person2, exp: body.exp };
}

// server/webapps/contract-check.ts
var TITLES = {
  file: "hydor.json says what is needed",
  paths: "It works under any path",
  build: "It builds",
  ready: "It starts and says it is ready",
  loopback: "It listens where it is told, and nowhere else",
  signin: "It lets in only the people Hydor says",
  secrets: "No key or secret reaches a browser",
  ai: "It asks for a model the way Hydor answers",
  embed: "It asks for vectors the way Hydor answers",
  mail: "It sends mail the way Hydor takes it",
  smoke: "It passes its own smoke test",
  stop: "It stops when asked",
  data: "It keeps its data across a restart",
  writes: "It writes only in its data folder"
};
var VECTOR_SIZE = 768;
var SLUG = "hydor-check";
var STOP_MS = 5e3;
var SMOKE_MS = 6e4;
var OTHER = "127.0.0.2";
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var one = (s, n = 300) => s.replace(/\s+/g, " ").trim().slice(0, n);
var person = { id: "check-owner", name: "Check Owner", email: "owner@example.test", role: "owner" };
function take(port, address = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(null));
    s.listen(port, address, () => {
      const got = s.address().port;
      s.close(() => resolve(got));
    });
  });
}
async function freePort(range, taken) {
  if (range) {
    for (let p = range[0]; p <= range[1]; p++)
      if (!taken.has(p) && await take(p) !== null) {
        taken.add(p);
        return p;
      }
    throw new Error(`No free port from ${range[0]} to ${range[1]}.`);
  }
  for (let i = 0; i < 30; i++) {
    const p = await take(0);
    if (p !== null && !taken.has(p)) {
      taken.add(p);
      return p;
    }
  }
  throw new Error("No free port.");
}
async function stopApp(r) {
  const t = Date.now();
  if (r.ended()) return { polite: true, ms: 0 };
  signalApp(r.child, r.boxed, "SIGTERM");
  while (!r.ended() && Date.now() - t < STOP_MS) await sleep(40);
  const polite = r.ended();
  signalApp(r.child, false, "SIGKILL");
  for (let i = 0; i < 100 && !r.ended(); i++) await sleep(30);
  for (let i = 0; i < 80 && await take(r.port) === null; i++) await sleep(40);
  return { polite, ms: Date.now() - t };
}
function ask(port, method, at, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: o.address ?? "127.0.0.1", port, method, path: at, headers: { host: `localhost:${port}`, connection: "close", ...o.body !== void 0 ? { "content-length": String(Buffer.byteLength(o.body)) } : {}, ...o.headers }, timeout: o.timeoutMs ?? 1e4 },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size <= 4 << 20) chunks.push(c);
          else res.destroy();
        });
        const done = () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
        res.on("end", done);
        res.on("close", done);
        res.on("error", done);
      }
    );
    req.on("timeout", () => req.destroy(new Error("no answer in time")));
    req.on("error", reject);
    req.end(o.body);
  });
}
function listening(file) {
  let text;
  try {
    text = fs3.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return text.split("\n").slice(1).map((l) => l.trim().split(/\s+/)).filter((f) => f[3] === "0A").map((f) => ({ address: f[1].split(":")[0], port: parseInt(f[1].split(":")[1], 16), inode: f[9] }));
}
var local = (hex) => hex.length === 8 ? hex.endsWith("7F") : hex === "00000000000000000000000001000000" || hex.startsWith("0000000000000000FFFF0000") && hex.endsWith("7F");
function words(hex) {
  if (hex.length === 8) return [6, 4, 2, 0].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(".");
  if (/^0+$/.test(hex)) return "[::] (every address)";
  return `[IPv6 ${hex}]`;
}
function inodesOf(pid) {
  const out = /* @__PURE__ */ new Set();
  for (const p of [pid, ...descendants(pid).map((d) => d.pid)]) {
    try {
      for (const fd of fs3.readdirSync(`/proc/${p}/fd`)) {
        try {
          const m = /^socket:\[(\d+)\]$/.exec(fs3.readlinkSync(`/proc/${p}/fd/${fd}`));
          if (m) out.add(m[1]);
        } catch {
        }
      }
    } catch {
    }
  }
  return out;
}
async function open(r) {
  if (fs3.existsSync("/proc/net/tcp")) {
    const all = [...listening("/proc/net/tcp"), ...listening("/proc/net/tcp6")];
    const own = inodesOf(r.child.pid);
    const mine = all.filter((x) => x.port === r.port || own.has(x.inode));
    return [...new Set(mine.filter((x) => !local(x.address)).map((x) => `${words(x.address)} port ${x.port}`))];
  }
  const others = Object.values(os.networkInterfaces()).flatMap((n) => n ?? []).filter((n) => n.family === "IPv4" && !n.internal);
  if (!others.length) return null;
  const out = [];
  for (const n of others) {
    const answered = await new Promise((resolve) => {
      const s = net.connect({ host: n.address, port: r.port, timeout: 1e3 }, () => (s.destroy(), resolve(true)));
      s.on("error", () => resolve(false));
      s.on("timeout", () => (s.destroy(), resolve(false)));
    });
    if (answered) out.push(`${n.address} port ${r.port}`);
  }
  return out;
}
var SKIP = /* @__PURE__ */ new Set([".git"]);
async function snapshot(dir2) {
  const out = /* @__PURE__ */ new Map();
  const walk = async (at) => {
    let entries;
    try {
      entries = await fs3.promises.readdir(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path3.join(at, e.name);
      if (e.isDirectory()) {
        out.set(path3.relative(dir2, full) + "/", "folder");
        await walk(full);
      } else {
        try {
          const s = await fs3.promises.lstat(full);
          out.set(path3.relative(dir2, full), `${s.size}:${s.mtimeMs}`);
        } catch {
        }
      }
      if (out.size > 2e5) return;
    }
  };
  await walk(dir2);
  return out;
}
function changed(before, after) {
  const out = [];
  for (const [k, v] of after) if (!before.has(k)) out.push(`made ${k}`);
  else if (before.get(k) !== v) out.push(`changed ${k}`);
  for (const k of before.keys()) if (!after.has(k)) out.push(`removed ${k}`);
  return out.sort();
}
async function sqliteModule() {
  const warn = process.emitWarning;
  try {
    process.emitWarning = () => {
    };
    const m = await import("node:sqlite");
    return m.DatabaseSync;
  } catch {
    return null;
  } finally {
    process.emitWarning = warn;
  }
}
var quote = (n) => `"${n.replace(/"/g, '""')}"`;
function rows(db) {
  const names = db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite\\_%' escape '\\' and sql not like 'CREATE VIRTUAL%' order by name").all().map((r) => r.name);
  const tables = {};
  for (const n of names) {
    try {
      tables[n] = Number(db.prepare(`select count(*) as n from ${quote(n)}`).get().n);
    } catch {
    }
  }
  return { tables };
}
var isObject2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
var ADDRESS = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
function wrongAi(body, tiers) {
  if (!isObject2(body)) return ["the body is not one JSON object"];
  const out = [];
  if (body.tier !== "quick" && body.tier !== "standard" && body.tier !== "best") out.push('"tier" is not "quick", "standard" or "best"');
  else if (!tiers.includes(body.tier)) out.push(`the "${body.tier}" tier is not in services.ai.tiers`);
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length || messages.length > 200) out.push('"messages" is not a list of 1 to 200 messages');
  else {
    for (const m of messages) {
      if (!isObject2(m) || !["system", "user", "assistant", "tool"].includes(m.role)) out.push("a message has no role of system, user, assistant or tool");
      else if (typeof m.content !== "string" && !(m.role === "assistant" && m.content === void 0)) out.push("a message's content is not text");
      else if (m.role === "tool" && typeof m.toolCallId !== "string") out.push("a tool message does not say which call it answers (toolCallId)");
    }
    const last = messages[messages.length - 1];
    if (isObject2(last) && last.role === "assistant" && !last.toolCalls) out.push("the last message is the model's own");
  }
  if (body.tools !== void 0) {
    if (!Array.isArray(body.tools) || body.tools.length > 40 || !body.tools.every((t) => isObject2(t) && typeof t.name === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(t.name))) out.push('"tools" is not a list of tools, each with a name');
  }
  if (body.schema !== void 0 && body.schema !== null && !isObject2(body.schema)) out.push('"schema" is not a JSON Schema');
  if (body.schema && Array.isArray(body.tools) && body.tools.length) out.push("it asks for tools and a schema in one call");
  if (body.maxOutputTokens !== void 0 && !(typeof body.maxOutputTokens === "number" && body.maxOutputTokens >= 1)) out.push('"maxOutputTokens" is not a number of tokens');
  if (body.stream !== void 0 && typeof body.stream !== "boolean") out.push('"stream" is not true or false');
  return out;
}
function wrongEmbed(body) {
  const b = isObject2(body) ? body : {};
  const out = [];
  if (!Array.isArray(b.texts) || !b.texts.length || !b.texts.every((t) => typeof t === "string")) out.push('"texts" is not a list of 1 to 64 texts');
  else if (b.texts.length > 64) out.push("more than 64 texts in a call");
  else if (b.texts.some((t) => t.length > 8e3)) out.push("a text is longer than 8,000 characters");
  if (b.kind !== "query" && b.kind !== "document") out.push('"kind" is not "query" or "document"');
  return out;
}
function wrongMail(body) {
  if (!isObject2(body)) return ["the body is not one JSON object"];
  const out = [];
  const address = (v) => typeof v === "string" && v.length <= 254 && !CONTROL.test(v) && !/[[\]\\]/.test(v) && ADDRESS.test(v);
  if (!Array.isArray(body.to) || !body.to.length || body.to.length > 50 || !body.to.every(address)) out.push('"to" is not a list of 1 to 50 email addresses');
  if (typeof body.subject !== "string" || !body.subject.trim() || CONTROL.test(body.subject) || body.subject.length > 900) out.push('"subject" is not one line of text');
  if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 2e5) out.push('"text" is missing or too long');
  if (body.html !== void 0 && body.html !== null && typeof body.html !== "string") out.push('"html" is not text');
  if (body.replyTo && !address(body.replyTo)) out.push('"replyTo" is not one email address');
  if (body.fromName && (typeof body.fromName !== "string" || CONTROL.test(body.fromName) || /[<>@]/.test(body.fromName) || body.fromName.length > 80)) out.push('"fromName" is not a plain name of at most 80 characters');
  if (body.unsubscribe && !(typeof body.unsubscribe === "string" && /^(https:\/\/|mailto:)\S+$/i.test(body.unsubscribe))) out.push('"unsubscribe" is not an https:// or mailto: address');
  return out;
}
function sample(schema, depth = 0) {
  if (!isObject2(schema) || depth > 6) return "x";
  if (Array.isArray(schema.enum)) return schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type ?? (schema.properties ? "object" : "string");
  if (type === "object") return Object.fromEntries(Object.entries(isObject2(schema.properties) ? schema.properties : {}).map(([k, s]) => [k, sample(s, depth + 1)]));
  if (type === "array") return Array.from({ length: Math.max(1, Number(schema.minItems) || 0) }, () => sample(schema.items, depth + 1));
  if (type === "number" || type === "integer") return Number(schema.minimum) || 0;
  if (type === "boolean") return true;
  if (type === "null") return null;
  return "x".repeat(Math.max(1, Number(schema.minLength) || 0));
}
function vector(text) {
  const v = new Float32Array(VECTOR_SIZE);
  const seed = crypto2.createHash("sha256").update(text).digest();
  let sum = 0;
  for (let i = 0; i < VECTOR_SIZE; i++) {
    v[i] = seed[i % seed.length] - 127.5;
    sum += v[i] * v[i];
  }
  for (let i = 0; i < VECTOR_SIZE; i++) v[i] /= Math.sqrt(sum);
  return Buffer.from(v.buffer).toString("base64");
}
async function standIn(port, file, key, secret) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size <= 4 << 20) chunks.push(c);
    });
    req.on("end", () => {
      const say = (code, body2) => {
        res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(body2));
      };
      const m = /^\/api\/apps\/([^/]+)\/(ai|embed|mail)$/.exec(new URL(req.url ?? "/", "http://x").pathname);
      if (!m) {
        calls.push({ service: "other", wrong: [`it asked for ${one(`${req.method} ${req.url}`, 80)}, which is none of Hydor's three requests`] });
        return say(404, { error: "There is nothing at this address." });
      }
      const service = m[2];
      const wrong = [];
      if (req.method !== "POST") wrong.push(`it used ${req.method} where Hydor takes POST`);
      if (m[1] !== SLUG) wrong.push("the address is not the one in HYDOR_APP_SLUG");
      if (req.headers.authorization !== `Bearer ${key}`) wrong.push("Authorization is not \u201CBearer <HYDOR_APP_KEY>\u201D");
      if (!/^application\/json/i.test(String(req.headers["content-type"] ?? ""))) wrong.push("Content-Type is not application/json");
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        wrong.push("the body is not JSON");
      }
      if (!file.services[service]) wrong.push(`\u201C${service}\u201D is not under services in hydor.json`);
      const passed = req.headers[PERSON_HEADER];
      if (service === "ai" && passed !== void 0 && !verifyPerson(passed, secret, 120).ok) wrong.push(`the ${PERSON_HEADER} header passed on is not the one Hydor put on the person's request`);
      if (body !== void 0) wrong.push(...service === "ai" ? wrongAi(body, file.services.ai?.tiers ?? []) : service === "embed" ? wrongEmbed(body) : wrongMail(body));
      calls.push({ service, wrong });
      if (wrong.length) return say(400, { error: wrong.join("; "), kind: "failed" });
      const b = body;
      if (service === "embed") return say(200, { model: "hydor-check@0", dim: VECTOR_SIZE, vectors: b.texts.map(vector) });
      if (service === "mail") return say(200, { id: `mail_${crypto2.randomBytes(6).toString("hex")}`, status: "sent" });
      const data = b.schema ? sample(b.schema) : void 0;
      const answer = { text: data !== void 0 ? JSON.stringify(data) : "This is the checker's stand-in for a model.", ...data !== void 0 ? { data } : {}, toolCalls: [], stop: "end", model: "hydor-check", usage: { inputTokens: 1, outputTokens: 1, usd: 0 }, cap: { usedUsd: 0, limitUsd: 1 } };
      if (b.stream !== true) return say(200, answer);
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" });
      res.write(`event: text
data: ${JSON.stringify({ text: answer.text })}

`);
      res.end(`event: done
data: ${JSON.stringify(answer)}

`);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    })
  };
}
function linksOf(type, text, at, port) {
  const found = [];
  const add = (raw) => {
    try {
      const u = new URL(raw.replace(/&amp;/g, "&"), `http://localhost:${port}${at}`);
      if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return;
      if (u.port !== String(port)) return;
      const p = u.pathname + u.search;
      if (/(sign|log)[-_]?(out|off)|delete|remove|destroy|reset|revoke/i.test(p)) return;
      found.push(p);
    } catch {
    }
  };
  if (/html/i.test(type)) for (const m of text.matchAll(/\b(?:href|src)\s*=\s*("([^"]*)"|'([^']*)')/gi)) add(m[2] ?? m[3] ?? "");
  if (/javascript|ecmascript/i.test(type)) for (const m of text.matchAll(/\b(?:import|from)\s*\(?\s*["']((?:\.{0,2}\/)[^"']+)["']/g)) add(m[1]);
  if (/css/i.test(type)) for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) add(m[1]);
  if (/manifest|json/i.test(type) && /"icons"/.test(text)) for (const m of text.matchAll(/"src"\s*:\s*"([^"]+)"/g)) add(m[1]);
  return found.filter((p) => !p.startsWith("data:"));
}
var shapesOf = (value) => [.../* @__PURE__ */ new Set([value, encodeURIComponent(value), Buffer.from(value).toString("base64").replace(/=+$/, ""), Buffer.from(value).toString("base64url")])];
function readFile(dir2) {
  const at = path3.join(dir2, HYDOR_FILE);
  let text;
  try {
    const st = fs3.lstatSync(at);
    if (!st.isFile()) return { problems: [`${HYDOR_FILE} is not a plain file.`] };
    if (st.size > HYDOR_FILE_MAX) return { problems: [`${HYDOR_FILE} is too large to be one (over 64 KB).`] };
    text = fs3.readFileSync(at, "utf8");
  } catch {
    return { problems: [`There is no ${HYDOR_FILE} at the root of the app (${dir2}).`] };
  }
  const r = readHydorText(text);
  return r.ok ? { file: r.file, problems: [] } : { problems: r.problems };
}
async function runBuild(line, dir2, home, ms, signal, box) {
  const windows = process.platform === "win32";
  const cache = process.env.npm_config_cache ?? path3.join(os.homedir(), ".npm");
  const plain = buildEnv(nodeBin(), home, !box && fs3.existsSync(cache) ? { npm_config_cache: cache } : {});
  const argv = windows ? [process.env.ComSpec ?? "cmd.exe", "/d", "/s", "/c", line] : ["/bin/sh", "-c", line];
  const boxedAs = box ? await box({ dir: dir2, home, argv, env: plain }) : null;
  const all = boxedAs?.argv ?? argv;
  const result2 = await new Promise((resolve) => {
    const child = spawn(all[0], all.slice(1), { cwd: dir2, env: boxedAs?.env ?? plain, stdio: ["ignore", "pipe", "pipe"], detached: !windows });
    const tail = [];
    const feed = (b) => {
      for (const l of b.toString("utf8").split("\n")) if (l.trim()) tail.push(l.slice(0, 400));
      if (tail.length > 40) tail.splice(0, tail.length - 40);
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    let timedOut = false;
    const end = () => signalApp(child, false, "SIGKILL");
    const limit = setTimeout(() => (timedOut = true, end()), ms);
    signal?.addEventListener("abort", end, { once: true });
    child.on("error", (e) => {
      clearTimeout(limit);
      tail.push(e.message);
      resolve({ code: null, tail, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(limit);
      resolve({ code, tail, timedOut });
    });
  });
  await boxedAs?.close();
  return { ...result2, ...boxedAs?.say ? { say: boxedAs.say } : {} };
}
function runSmoke(line, dir2, env, box) {
  const windows = process.platform === "win32";
  const argv = windows ? [process.env.ComSpec ?? "cmd.exe", "/d", "/s", "/c", line] : ["/bin/sh", "-c", line];
  const all = box?.(argv) ?? argv;
  return new Promise((resolve) => {
    const child = spawn(all[0], all.slice(1), { cwd: dir2, env, stdio: ["ignore", "pipe", "pipe"], detached: !windows });
    const tail = [];
    const feed = (b) => {
      for (const l of b.toString("utf8").split("\n")) if (l.trim()) tail.push(l.slice(0, 400));
      if (tail.length > 40) tail.splice(0, tail.length - 40);
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    let late = false;
    const limit = setTimeout(() => (late = true, signalApp(child, false, "SIGKILL")), SMOKE_MS);
    child.on("error", (e) => (clearTimeout(limit), resolve({ code: 1, tail: [...tail, e.message] })));
    child.on("close", (code) => (clearTimeout(limit), resolve({ code: late ? null : code ?? 1, tail })));
  });
}
async function checkContract(o) {
  const dir2 = path3.resolve(o.dir);
  const lines = [];
  const line = (id, state, text, extra = {}) => {
    const l = { id, title: TITLES[id] ?? id, state, text, ...extra.hint ? { hint: extra.hint } : {}, ...extra.details?.length ? { details: extra.details.slice(0, 8) } : {}, ...extra.group ? { group: extra.group } : {} };
    lines.push(l);
    o.onLine?.(l);
  };
  const result2 = () => {
    const of = (s) => lines.filter((l) => l.state === s).length;
    const warned = lines.filter((l) => l.state === "failed" && l.group).length;
    const failed = of("failed") - warned;
    const untried = of("notRun");
    const summary = `${lines.length} ${lines.length === 1 ? "line" : "lines"}: ${of("passed")} passed, ${failed} failed${warned ? `, ${warned} to fix` : ""}${untried ? `, ${untried} could not be tried` : ""}${of("note") ? `, ${of("note")} to note` : ""}.`;
    return { ok: failed === 0, summary, lines };
  };
  const read = readFile(dir2);
  if (!read.file) {
    line("file", "failed", read.problems.join(" "), { hint: `Write ${HYDOR_FILE} as the builders' page shows it.`, details: read.problems });
    return result2();
  }
  const file = read.file;
  line("file", "passed", `${HYDOR_FILE} reads: start \u201C${one(file.start, 80)}\u201D, ready at ${file.ready}, sign-in by ${file.signIn === "hydor" ? "Hydor" : "the app itself"}${file.database ? `, database ${file.database.file}` : ""}${file.keys.length ? `, ${file.keys.length} ${file.keys.length === 1 ? "key" : "keys"}` : ""}.`);
  o.onStep?.("Reading its own addresses");
  const own = scanOwnPaths(dir2);
  if (!own.found.length) line("paths", "passed", own.files ? `None of its ${own.files} source ${own.files === 1 ? "file" : "files"} writes an address of its own that starts with \u201C/\u201D, so it works at any path.` : "It has no pages or scripts of its own to read, so there is no address to look at.", { group: "pages" });
  else {
    const named = own.found.slice(0, 5).map((f) => `${f.file}:${f.line} ${f.address}`);
    const more = own.found.length - named.length;
    line("paths", "failed", `${own.found.length} ${own.found.length === 1 ? "address" : "addresses"} of its own start with \u201C/\u201D: ${named.join("; ")}${more > 0 ? ` and ${more} more` : ""}. They leave the app when Hydor shows it through a tunnel, where it lives under a path of its own.`, {
      hint: "Make them relative: notes, app.js, api/notes, ./img/x.png, with no \u201C/\u201D at the start (a server can build them from the X-Forwarded-Prefix header; with Vite set base: './').",
      details: named,
      group: "pages"
    });
  }
  const work = o.work ?? fs3.mkdtempSync(path3.join(os.tmpdir(), "hydor-check-"));
  const data = path3.join(work, "data");
  const home = path3.join(work, "home");
  fs3.mkdirSync(data, { recursive: true });
  fs3.mkdirSync(home, { recursive: true });
  const taken = /* @__PURE__ */ new Set();
  let stand = null;
  let running = null;
  try {
    if (!file.build) line("build", "passed", "It names no build: there is nothing to build.");
    else if (o.build === false) line("build", "passed", `It was built already (${one(file.build, 120)}).`);
    else {
      o.onStep?.(`Building: ${file.build}`);
      const t = Date.now();
      const b = await runBuild(file.build, dir2, path3.join(work, "build-home"), o.buildMs ?? 10 * 6e4, o.signal, o.buildBox);
      if (b.code !== 0) {
        line("build", "failed", b.timedOut ? `\u201C${one(file.build, 120)}\u201D did not finish in time.` : `\u201C${one(file.build, 120)}\u201D ended with code ${b.code}.`, { hint: `The build runs in the app's folder with nothing of your environment: no keys, no global tools but Node's.${b.say ? ` ${b.say}` : ""}`, details: b.tail.slice(-6) });
        return result2();
      }
      line("build", "passed", `\u201C${one(file.build, 120)}\u201D ended well after ${Math.round((Date.now() - t) / 1e3)} s.`);
    }
    const secret = crypto2.randomBytes(32).toString("hex");
    const given = {};
    for (const k of file.keys) given[k.name] = `${k.looks?.prefix?.[0] ?? ""}hydorcheck${crypto2.randomBytes(18).toString("hex")}`;
    const hidden = [...Object.entries(given), ...file.env.secret ? [[file.env.secret, secret]] : []];
    const extra = { ...given };
    if (usesServices(file.services)) {
      const key = `napp_wcheck${crypto2.randomBytes(24).toString("hex")}`;
      stand = await standIn(await freePort(o.ports, taken), file, key, secret);
      Object.assign(extra, { HYDOR_URL: stand.url, HYDOR_APP_SLUG: SLUG, HYDOR_APP_KEY: key });
      hidden.push(["HYDOR_APP_KEY", key]);
    }
    const shape = contractRunShape(file);
    const node = nodeBin();
    const readyMs2 = o.readyMs ?? 3e4;
    const start = async (host = "127.0.0.1") => {
      const port = await freePort(o.ports, taken);
      taken.delete(port);
      const env = appEnv(shape, { node, port, data, home, secret, address: `http://localhost:${port}`, dev: false, host, extra });
      if (shape.vars.host && shape.vars.host !== "HOST") delete env.HOST;
      const argv = argvOf(shape.start);
      const boxed = o.box?.({ dir: dir2, data, home, argv }) ?? null;
      const cmd = boxed ?? argv;
      const nice = process.platform !== "win32" && fs3.existsSync("/usr/bin/nice") ? ["/usr/bin/nice", "-n", "10"] : [];
      const all = [...nice, ...cmd];
      const child = spawn(all[0], all.slice(1), { cwd: dir2, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
      const log = [];
      const feed = (b) => {
        for (let l of b.toString("utf8").split("\n")) {
          if (!l.trim()) continue;
          for (const [name, v] of hidden) l = l.split(v).join(`\xAB${name}\xBB`);
          log.push(l.slice(0, 300));
        }
        if (log.length > 60) log.splice(0, log.length - 60);
      };
      child.stdout.on("data", feed);
      child.stderr.on("data", feed);
      let ended = false;
      let how = "";
      child.on("error", (e) => {
        ended = true;
        how = `could not start: ${e.message}`;
      });
      child.on("exit", (code, signal) => {
        ended = true;
        how = signal ? `was ended by ${signal}` : `exited with code ${code}`;
      });
      const app2 = { child, boxed: !!boxed, port, log, ended: () => ended, how: () => how };
      running = app2;
      const t = Date.now();
      let said = "nothing answered";
      while (Date.now() - t < readyMs2 && !ended && !o.signal?.aborted) {
        try {
          const r = await ask(port, "GET", file.ready, { timeoutMs: 2e3, address: host });
          if (r.status >= 200 && r.status < 400) return { ok: true, ms: Date.now() - t, status: r.status, said: "", app: app2 };
          said = `it answered ${r.status}`;
        } catch (e) {
          said = e.code === "ECONNREFUSED" ? "nothing listened on the port" : e.message;
          if (host !== "127.0.0.1") {
            const r = await ask(port, "GET", file.ready, { timeoutMs: 2e3 }).catch(() => null);
            if (r && r.status >= 200 && r.status < 400) return { ok: true, elsewhere: true, ms: Date.now() - t, status: r.status, said: "", app: app2 };
          }
        }
        await sleep(120);
      }
      return { ok: false, ms: Date.now() - t, said: ended ? `the program ${how}` : said, app: app2 };
    };
    const before = await snapshot(dir2);
    o.onStep?.(`Starting: ${file.start}`);
    const first = await start();
    if (!first.ok) {
      line("ready", "failed", `Started with \u201C${one(file.start, 100)}\u201D and asked ${file.ready} for ${Math.round(first.ms / 1e3)} s: ${first.said}.`, {
        hint: `Listen on 127.0.0.1 and the port in ${file.env.port}; answer ${file.ready} with no sign-in; keep what you write in the folder in ${file.env.data}.`,
        details: first.app.log.slice(-8)
      });
      await stopApp(first.app);
      return result2();
    }
    const app = first.app;
    line("ready", "passed", `Started with \u201C${one(file.start, 100)}\u201D; ${file.ready} answered ${first.status} after ${(first.ms / 1e3).toFixed(1)} s.`);
    const hostVar = file.env.host ?? "HOST";
    const listenHint = `Listen on the address in ${hostVar} (Hydor sets 127.0.0.1 here and 0.0.0.0 on a server), never one written into the program, and on no other port.`;
    const reachable = await open(app);
    const loopbackAt = lines.length;
    const loopback = (state, text, extra2 = {}) => {
      line("loopback", state, text, extra2);
      lines.splice(loopbackAt, 0, lines.pop());
    };
    if (reachable?.length) loopback("failed", `It listens where other computers could reach it, past Hydor and its sign-in: ${reachable.join(", ")}.`, { hint: listenHint, details: reachable });
    const seen = [];
    const browse = async (method, at, headers = {}, body) => {
      const r = await ask(app.port, method, at, { headers, body });
      seen.push({ at: `${method} ${at}`, headers: JSON.stringify(r.headers), body: r.body });
      return r;
    };
    const as = (ttl = 60, with_ = secret) => ({ [PERSON_HEADER]: signPerson(person, with_, ttl) });
    const signed = () => file.signIn === "hydor" ? as() : {};
    if (file.signIn === "own") line("signin", "note", "It has accounts of its own: Hydor's header is not tried. Make sure each person sees only what is theirs.");
    else {
      o.onStep?.("Trying who is let in");
      const tries = [
        { what: "no header", headers: {}, want: "out" },
        { what: "a header signed with another secret", headers: as(60, crypto2.randomBytes(32).toString("hex")), want: "out" },
        { what: "a header that ran out an hour ago", headers: as(-3600), want: "out" },
        { what: "a header Hydor signed", headers: as(), want: "in" }
      ];
      const said = [];
      const bad = [];
      for (const t of tries) {
        try {
          const r = await browse("GET", file.private, t.headers);
          said.push(`${t.what}: ${r.status}`);
          if (t.want === "out" && r.status !== 401 && r.status !== 403) bad.push(`${t.what} was answered ${r.status} where it has to be 401 or 403`);
          if (t.want === "in" && r.status >= 400) bad.push(`${t.what} was answered ${r.status} where it has to be let in`);
        } catch (e) {
          bad.push(`${t.what}: ${e.message}`);
        }
      }
      if (bad.length) line("signin", "failed", `Asked ${file.private}: ${bad.join("; ")}.`, { hint: `Check the ${PERSON_HEADER} header with your secret (${file.env.secret}) on every request but the ready address. If ${file.private} is meant to be public, name in \u201Cprivate\u201D an address only a signed-in person gets.`, details: said });
      else line("signin", "passed", `Asked ${file.private}: ${said.join("; ")}.`);
    }
    const triedFrom = /* @__PURE__ */ new Map();
    for (const service of ["ai", "embed", "mail"]) {
      const declared = file.services[service];
      const t = declared?.try;
      if (!declared || !t) continue;
      o.onStep?.(`Trying the ${service} service: ${t.method} ${t.path}`);
      const had = stand.calls.filter((c) => c.service === service).length;
      try {
        const body = t.body === void 0 ? void 0 : typeof t.body === "string" ? t.body : JSON.stringify(t.body);
        const r = await browse(t.method, t.path, { ...signed(), ...body !== void 0 ? { "content-type": "application/json" } : {}, origin: `http://localhost:${app.port}`, "sec-fetch-site": "same-origin" }, body);
        triedFrom.set(service, { status: r.status });
      } catch (e) {
        triedFrom.set(service, { status: null, error: e.message });
      }
      for (let i = 0; i < 100 && stand.calls.filter((c) => c.service === service).length === had; i++) await sleep(50);
    }
    o.onStep?.("Looking at what a browser gets");
    const queue = [.../* @__PURE__ */ new Set(["/", file.ready, ...file.signIn === "hydor" ? [file.private] : []])];
    const asked = /* @__PURE__ */ new Set();
    while (queue.length && asked.size < 80 && !app.ended()) {
      const at = queue.shift();
      if (asked.has(at)) continue;
      asked.add(at);
      try {
        const r = await browse("GET", at, { ...signed(), accept: "text/html,*/*" });
        const type = String(r.headers["content-type"] ?? "");
        const loc = r.headers.location;
        if (loc) queue.push(...linksOf("text/html", `<a href="${loc}">`, at, app.port));
        queue.push(...linksOf(type, r.body.toString("utf8"), at, app.port));
      } catch {
      }
    }
    const found = [];
    for (const [name, value] of hidden) {
      const ways = shapesOf(value);
      const hit = seen.find((s) => ways.some((w) => s.headers.includes(w) || s.body.includes(w)));
      if (hit) found.push(`${name} is in the answer to ${hit.at}`);
    }
    const reached = file.signIn === "own" ? " Only what is reached without signing in was looked at." : "";
    if (!hidden.length) line("secrets", "passed", "It is given no key and no secret.");
    else if (found.length) line("secrets", "failed", `A value from its environment reaches the browser: ${found.join("; ")}.`, { hint: "Keys and the secret are for the server only: never put them in a page, a script or an answer.", details: found });
    else line("secrets", "passed", `Looked at ${seen.length} answers (${asked.size} addresses) for the ${hidden.length === 1 ? "one value" : `${hidden.length} values`} it was given: none is in any.${reached}`);
    for (const service of ["ai", "embed", "mail"]) {
      const declared = file.services[service];
      const calls = stand?.calls.filter((c) => c.service === service) ?? [];
      if (!declared) {
        if (calls.length) line(service, "failed", `It called the ${service} service, which is not under services in ${HYDOR_FILE}.`);
        continue;
      }
      const wrong = [...new Set(calls.flatMap((c) => c.wrong))];
      const t = triedFrom.get(service);
      const how = declared.try ? `${declared.try.method} ${declared.try.path}` : "";
      if (wrong.length) line(service, "failed", `It asked a stand-in for Hydor and would have been refused: ${wrong.join("; ")}.`, { details: wrong });
      else if (calls.length) {
        if (t && t.status !== null && t.status >= 500) line(service, "failed", `The request reached the stand-in as Hydor takes it, but ${how} then answered ${t.status}.`);
        else line(service, "passed", `${declared.try ? `${how} made it ask` : "It asked"} a stand-in for Hydor ${calls.length === 1 ? "once" : `${calls.length} times`}, each as Hydor takes it${t?.status != null ? `, and answered ${t.status}` : ""}.`);
      } else if (!declared.try) line(service, "notRun", `${HYDOR_FILE} gives no \u201Ctry\u201D request under services.${service}, so nothing made the app call it.`, { hint: `Add "try": { "method": "POST", "path": "/\u2026", "body": {\u2026} }: a request that makes the app use it.` });
      else if (t && (t.status === 401 || t.status === 403)) line(service, "notRun", `${how} answered ${t.status}: it asks for a sign-in the check does not have, so the call was not seen.`);
      else line(service, "failed", `${how} ${t?.status != null ? `answered ${t.status}` : `failed (${t?.error ?? "no answer"})`} and nothing reached the stand-in. Use HYDOR_URL, HYDOR_APP_SLUG and HYDOR_APP_KEY from the environment.`);
    }
    const strays = [...new Set((stand?.calls ?? []).filter((c) => c.service === "other").flatMap((c) => c.wrong))];
    if (strays.length) line("ai", "failed", strays.join("; "), { details: strays });
    if (file.smoke && !app.ended()) {
      o.onStep?.("Running its smoke test");
      const hint = `\u201Csmoke\u201D is what a launch runs to try the app: it has to pass with nobody's data, signed out (signed in by Hydor, with "signIn": "hydor").`;
      if (typeof file.smoke === "string") {
        const smokeHome = path3.join(work, "smoke-home");
        const address = `http://localhost:${app.port}`;
        const env = buildEnv(node, smokeHome, { SMOKE_URL: address, ...file.env.url ? { [file.env.url]: address } : {} });
        const ran = await runSmoke(file.smoke, dir2, env, o.box ? (argv) => o.box({ dir: dir2, data: smokeHome, home: smokeHome, argv }) : void 0);
        if (ran.code === 0) line("smoke", "passed", `\u201C${one(file.smoke, 120)}\u201D ended well.`);
        else line("smoke", "failed", `\u201C${one(file.smoke, 120)}\u201D ${ran.code === null ? "did not finish in time" : `ended with code ${ran.code}`}.`, { hint: `${hint} It is given the app's address in SMOKE_URL.`, details: ran.tail.slice(-6) });
      } else {
        const t = file.smoke;
        const what = `${t.method} ${t.path}`;
        try {
          const body = t.body === void 0 ? void 0 : typeof t.body === "string" ? t.body : JSON.stringify(t.body);
          const r = await browse(t.method, t.path, { ...signed(), ...body !== void 0 ? { "content-type": "application/json" } : {}, origin: `http://localhost:${app.port}`, "sec-fetch-site": "same-origin" }, body);
          if (r.status >= 200 && r.status < 400) line("smoke", "passed", `${what} answered ${r.status}.`);
          else line("smoke", "failed", `${what} answered ${r.status}.`, { hint });
        } catch (e) {
          line("smoke", "failed", `${what} failed (${e.message}).`, { hint });
        }
      }
    }
    if (o.running && !app.ended() && !o.signal?.aborted) await o.running({ port: app.port, file, hidden: hidden.map(([name, value]) => ({ name, value })), person: () => signed(), signal: o.signal });
    o.onStep?.("Asking it to stop");
    if (app.ended()) line("stop", "failed", `It stopped by itself during the check (it ${app.how()}).`, { details: app.log.slice(-8) });
    const stopped = await stopApp(app);
    if (!lines.some((l) => l.id === "stop")) {
      if (stopped.polite) line("stop", "passed", `Told to stop (SIGTERM), it ended after ${(stopped.ms / 1e3).toFixed(1)} s.`);
      else line("stop", "failed", `Told to stop (SIGTERM), it was still running after ${STOP_MS / 1e3} s and had to be killed.`, { hint: "On SIGTERM: stop taking requests, finish what is being answered, close the database, exit." });
    }
    o.onStep?.("Starting it again on the same data");
    const marker = path3.join(data, "hydor-check.keep");
    fs3.writeFileSync(marker, "kept");
    const db = file.database;
    const dbFile = db ? path3.join(data, db.file) : null;
    const Sql = db?.sqlite ? await sqliteModule() : null;
    let was = null;
    let wrote = fs3.readdirSync(data).filter((n) => n !== "hydor-check.keep");
    if (dbFile && Sql && fs3.existsSync(dbFile)) {
      try {
        const h = new Sql(dbFile);
        h.exec("create table if not exists _hydor_check (id integer primary key, said text); insert into _hydor_check (said) values ('kept')");
        was = rows(h);
        h.close();
      } catch (e) {
        line("data", "failed", `${db.file} could not be opened as SQLite (${one(e.message, 160)}).`);
      }
    }
    const other = await take(0, OTHER) === null ? "127.0.0.1" : OTHER;
    const second = await start(other);
    let kept = "";
    const lost = [];
    if (!second.ok) lost.push(`started again on the same data, it did not become ready: ${second.said}`);
    if (!reachable?.length) {
      const there = second.ok ? await open(second.app) : null;
      if (second.elsewhere) loopback("failed", `Told to listen on ${other} (in ${hostVar}), it listened on 127.0.0.1 instead: it does not read ${hostVar}. On a server it is told 0.0.0.0, and nobody would reach it.`, { hint: listenHint });
      else if (there?.length) loopback("failed", `Told to listen on ${other}, it also listened where other computers could reach it: ${there.join(", ")}.`, { hint: listenHint, details: there });
      else if (reachable === null) loopback("notRun", "This computer gives no way to tell what the app listens on.");
      else if (other === "127.0.0.1" || !second.ok) loopback("passed", `Port ${app.port} is open on 127.0.0.1 only. Whether it reads ${hostVar} could not be tried${second.ok ? " on this computer" : ""}.`);
      else loopback("passed", `Port ${app.port} was open on 127.0.0.1 only, and told ${other} in ${hostVar} it listened there.`);
    }
    await stopApp(second.app);
    if (!fs3.existsSync(marker)) lost.push("a file put in the data folder was gone after the restart");
    if (dbFile && db) {
      if (wrote.includes(db.file) && !fs3.existsSync(dbFile)) lost.push(`${db.file} was gone after the restart`);
      if (was && Sql) {
        try {
          const h = new Sql(dbFile);
          const now = rows(h);
          for (const [t, n] of Object.entries(was.tables)) if (now.tables[t] === void 0) lost.push(`the table ${t} was gone`);
          else if (now.tables[t] < n) lost.push(`the table ${t} had ${n} rows and has ${now.tables[t]}`);
          h.exec("drop table if exists _hydor_check");
          h.close();
          const own2 = Object.keys(was.tables).filter((t) => t !== "_hydor_check");
          kept = ` ${db.file} kept its ${own2.length === 1 ? "table" : `${own2.length} tables`} and every row.`;
        } catch (e) {
          lost.push(`${db.file} could not be read after the restart (${one(e.message, 120)})`);
        }
      }
    }
    fs3.rmSync(marker, { force: true });
    if (!lines.some((l) => l.id === "data")) {
      if (lost.length) line("data", "failed", `After a restart with the same data folder: ${lost.join("; ")}.`, { hint: `Keep everything in the folder in ${file.env.data}, and never empty or remake it as the app starts.`, details: lost });
      else if (db && !wrote.includes(db.file)) line("data", "note", `It answered again on the same data folder, but had not made ${db.file} there by then, so nothing of it could be looked at.`, { hint: `Make the database as the app starts, in the folder in ${file.env.data}.` });
      else if (!wrote.length) line("data", "note", "It answered again on the same data folder. It wrote nothing there while checked: make sure what people add goes in it.");
      else line("data", "passed", `Started again on the same data folder, it answered; a file the check put there was still there.${kept}`);
    }
    const wroteIn = changed(before, await snapshot(dir2));
    if (wroteIn.length) line("writes", "failed", `While running it changed its own folder: ${wroteIn.slice(0, 4).join(", ")}${wroteIn.length > 4 ? ` and ${wroteIn.length - 4} more` : ""}. Inside Hydor that folder is read-only, and a new version replaces it.`, { hint: `Write only in the folder in ${file.env.data} (logs go to the screen).`, details: wroteIn });
    else line("writes", "passed", "Over both runs nothing in its own folder was made, changed or removed.");
    return result2();
  } finally {
    const left = running;
    if (left && !left.ended()) await stopApp(left);
    await stand?.close();
    if (!o.work) fs3.rmSync(work, { recursive: true, force: true });
  }
}
var MARK = { passed: "ok  ", failed: "FAIL", note: "note", notRun: "??  " };
function printLine(l) {
  const more = l.state === "passed" ? [] : [...(l.details ?? []).map((d) => `        \xB7 ${d}`), ...l.hint ? [`        To do: ${l.hint}`] : []];
  return [`${l.state === "failed" && l.group ? "fix " : MARK[l.state]}  ${l.title}: ${l.text}`, ...more].join("\n");
}

// scripts/hydor-check.ts
var HELP = `Checks that an app does what its hydor.json says.

  node hydor-check.mjs [folder] [--no-build] [--timeout seconds] [--json]

It builds the app, starts it on a port and data folder of its own with made-up keys and a stand-in
for Hydor's services, and tries each claim. It ends with 0 when nothing failed, 1 when something did.`;
var args = process.argv.slice(2);
var dir = ".";
var build = true;
var json = false;
var readyMs = 3e4;
var ports;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--help" || a === "-h") {
    console.log(HELP);
    process.exit(0);
  } else if (a === "--no-build") build = false;
  else if (a === "--json") json = true;
  else if (a === "--timeout" && Number(args[i + 1]) > 0) readyMs = Number(args[++i]) * 1e3;
  else if (a === "--ports" && /^\d+-\d+$/.test(args[i + 1] ?? "")) ports = args[++i].split("-").map(Number);
  else if (!a.startsWith("-")) dir = a;
  else {
    console.error(`${a} is not something the check takes.

${HELP}`);
    process.exit(2);
  }
}
var stop = new AbortController();
for (const s of ["SIGINT", "SIGTERM"]) process.once(s, () => stop.abort());
var result = await checkContract({ dir, build, readyMs, ports, signal: stop.signal, onLine: json ? void 0 : (l) => console.log(printLine(l)) });
console.log(json ? JSON.stringify(result, null, 2) : `
${result.summary}`);
process.exit(result.ok ? 0 : 1);
