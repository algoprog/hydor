// Settings → Memory → Bring in, skills: the skills the user made in Hermes (each profile's), OpenClaw, pi and Atomic Agent,
// found on this computer, and copied into the user's own skills (Settings → Skills, "Yours": the skills folder in the
// data folder) when they pick them. All four use the Agent Skills format: a folder with a SKILL.md whose front matter
// has a name and a description. Only read from there, never changed. What it will not do: copy a file that is, or looks
// like, a secret (.env files, keys, tokens, sign-in files), take a skill Hydor has a skill of the same name for (the user's
// own, a built-in one or a plugin's: it is left with a note), take the skills each of them ships with, or copy more
// than the caps below.
import fs from "node:fs";
import path from "node:path";
import { HttpError } from "../../auth.ts";
import type { DB } from "../../db.ts";
import {
  MAX_SKILL,
  folders,
  parseSkill,
  skillText,
  slug,
} from "../../skillpack/library.ts";
import { saveOwnSkill } from "../../skillpack/proposals.ts";
import { secretIn } from "../secrets.ts";
import {
  atomicDirs,
  hermesHomes,
  openclawDirs,
  piDir,
  type Roots,
} from "./sources.ts";

/** Most of a skill's folder that is copied: its files, one file, and all of them together. */
export const MAX_FILES = 200;
export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_SKILL_BYTES = 2 * 1024 * 1024;
/** Most skills looked at in one scan, how deep a folder of skills is searched, and how much of a file is read for secrets. */
const MAX_FOUND = 400;
const MAX_DEPTH = 4;
const SCAN_BYTES = 256 * 1024;

export interface FoundSkill {
  /** Stable between scans: the assistant, where in it, and the skill's folder. */
  id: string;
  /** The assistant, as the user knows it: "Hermes". */
  source: string;
  /** Where in it, when that says more: "profile coder", "workspace". */
  where?: string;
  /** The name it would have here (lowercase letters, digits and dashes). */
  name: string;
  description: string;
  /** Its folder, on this computer. */
  folder: string;
  /** Files that would be copied, and their size. */
  files: number;
  bytes: number;
  /** Files left out: secrets, and what is over the caps. */
  left: string[];
  /** Why it cannot be brought in: it is shown, not offered. */
  skip?: string;
}

/** The skills Atomic Agent installs itself (its starter skills): they are Atomic's, not the user's. */
const ATOMIC_STARTER = new Set([
  "apple-calendar",
  "apple-notes",
  "apple-reminders",
  "audio-transcribe",
  "currency",
  "docker",
  "ffmpeg",
  "github",
  "gog-workspace",
  "imagemagick",
  "notion",
  "obsidian",
  "pandoc",
  "pdf",
  "skill-creator",
  "verify-work",
  "wttr-weather",
  "xlsx",
]);

/** Names of files that hold secrets or sign-ins, wherever they are in a skill: never copied. */
const SECRET_FILE =
  /^\.|^env$|^(?:credentials?|secrets?|tokens?|auth)(?:\.(?:json|ya?ml|toml|ini|txt|cfg|conf|env))?$|^id_(?:rsa|dsa|ecdsa|ed25519)|\.(?:pem|key|p12|pfx|jks|keystore|kdbx|crt|cer|sqlite3?|db)$|\.secrets?\./i;
const SKIP_DIR = /^(?:node_modules|__pycache__|venv|env|dist|build|target)$/i;

const lstat = (p: string): fs.Stats | null => {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
};
const list = (dir: string): string[] => {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
};

/** What to copy of one skill's folder: its files (SKILL.md first), and what is left out and why it is not copied. */
export function planFolder(folder: string): {
  files: { rel: string; abs: string; size: number }[];
  left: string[];
  bytes: number;
} {
  const files: { rel: string; abs: string; size: number }[] = [];
  const left: string[] = [];
  let bytes = 0;
  const walk = (dir: string, rel: string, depth: number) => {
    for (const n of list(dir)) {
      const abs = path.join(dir, n);
      const r = rel ? `${rel}/${n}` : n;
      const st = lstat(abs);
      if (!st || st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (n.startsWith(".") || SKIP_DIR.test(n) || depth >= 5) continue;
        walk(abs, r, depth + 1);
        continue;
      }
      if (!st.isFile()) continue;
      if (r === "SKILL.md") continue;
      if (SECRET_FILE.test(n)) {
        // A dotfile is left out silently (.gitignore, .DS_Store); a file that looks like a sign-in or a key is named.
        if (!n.startsWith(".") || /^\.(?:env|npmrc|netrc|pypirc)/i.test(n))
          left.push(r);
        continue;
      }
      if (
        st.size > MAX_FILE_BYTES ||
        files.length >= MAX_FILES ||
        bytes + st.size > MAX_SKILL_BYTES
      ) {
        left.push(r);
        continue;
      }
      if (looksSecret(abs, st.size)) {
        left.push(r);
        continue;
      }
      files.push({ rel: r, abs, size: st.size });
      bytes += st.size;
    }
  };
  walk(folder, "", 0);
  return { files, left, bytes };
}

/** A text file with a key or a token in it (what the helper never keeps in a note, here never copied). */
function looksSecret(file: string, size: number): boolean {
  try {
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(Math.min(size, SCAN_BYTES));
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      const head = buf.subarray(0, n);
      if (head.includes(0)) return false; // binary: not read as text
      return !!secretIn(head.toString("utf8"));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

/** The SKILL.md folders under a folder of skills, a category folder or two deep (Hermes groups its skills in categories). */
function skillFolders(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    for (const n of list(dir)) {
      if (n.startsWith(".") || SKIP_DIR.test(n)) continue;
      const abs = path.join(dir, n);
      const st = lstat(abs);
      if (!st?.isDirectory()) continue;
      if (lstat(path.join(abs, "SKILL.md"))?.isFile()) out.push(abs);
      else if (depth < MAX_DEPTH) walk(abs, depth + 1);
    }
  };
  walk(root, 1);
  return out;
}

/** Where each assistant keeps the skills the user made. */
function places(
  roots: Roots,
): {
  source: string;
  where?: string;
  dir: string;
  leave?: (name: string) => boolean;
}[] {
  const out: ReturnType<typeof places> = [];
  for (const h of hermesHomes(roots)) {
    // Hermes copies the skills it ships with into the same folder and lists them in a manifest (name:hash per line).
    const bundled = new Set<string>();
    try {
      for (const l of fs
        .readFileSync(path.join(h.dir, "skills", ".bundled_manifest"), "utf8")
        .split(/\r?\n/))
        if (l.trim()) bundled.add(l.split(":")[0].trim());
    } catch {}
    out.push({
      source: "Hermes",
      where: h.profile ? `profile ${h.profile}` : undefined,
      dir: path.join(h.dir, "skills"),
      leave: (n) => bundled.has(n),
    });
  }
  const oc = openclawDirs(roots);
  out.push({
    source: "OpenClaw",
    where: "workspace",
    dir: path.join(oc.workspace, "skills"),
  });
  out.push({
    source: "OpenClaw",
    where: "workspace",
    dir: path.join(oc.workspace, ".agents", "skills"),
  });
  out.push({
    source: "OpenClaw",
    where: "shared",
    dir: path.join(oc.state, "skills"),
  });
  for (const a of list(path.join(oc.state, "agents")))
    out.push({
      source: "OpenClaw",
      where: `learned by agent ${a}`,
      dir: path.join(oc.state, "agents", a, "agent", "workshop-skills"),
    });
  out.push({ source: "pi", dir: path.join(piDir(roots), "skills") });
  for (const d of atomicDirs(roots))
    out.push({
      source: "Atomic Agent",
      dir: path.join(d, "skills"),
      leave: (n) => ATOMIC_STARTER.has(n),
    });
  return out;
}

/** Every skill found, each with what would come over and, when it cannot, why not. A name taken (here or above) is said. */
export function findSkills(roots: Roots): FoundSkill[] {
  const out: FoundSkill[] = [];
  const seenFolders = new Set<string>();
  const names = new Map<string, FoundSkill>();
  for (const p of places(roots)) {
    for (const folder of skillFolders(p.dir)) {
      if (out.length >= MAX_FOUND) return out;
      let real = folder;
      try {
        real = fs.realpathSync(folder);
      } catch {}
      if (seenFolders.has(real)) continue;
      seenFolders.add(real);
      let text = "";
      try {
        text = fs
          .readFileSync(path.join(folder, "SKILL.md"), "utf8")
          .replace(/^﻿/, "");
      } catch {
        continue;
      }
      const fm = parseSkill(text);
      const dirName = path.basename(folder);
      if (p.leave?.(dirName) || (fm.name && p.leave?.(fm.name))) continue;
      const name = slug(fm.name || dirName);
      const plan = planFolder(folder);
      const found: FoundSkill = {
        id: `${p.source}|${p.where ?? ""}|${path.relative(p.dir, folder)}`,
        source: p.source,
        ...(p.where ? { where: p.where } : {}),
        name,
        description: (fm.description ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 400),
        folder,
        files: plan.files.length + 1,
        bytes: plan.bytes + Buffer.byteLength(text),
        left: plan.left,
      };
      const why = problem(found, text, fm);
      if (why) found.skip = why;
      else if (names.has(name))
        found.skip = `Another skill called ${name} came first (from ${names.get(name)!.source})`;
      else if (skillText(name))
        found.skip = `A skill called ${name} is in your skills already`;
      if (!found.skip) names.set(name, found);
      out.push(found);
    }
  }
  return out;
}

/** What is wrong with a skill's text, in words for the user, or null. */
function problem(
  f: FoundSkill,
  text: string,
  fm: ReturnType<typeof parseSkill>,
): string | null {
  if (!f.name) return "It has no name Hydor can use";
  if (!fm.description || fm.description.length < 10)
    return "It has no description saying when to use it";
  if (fm.body.trim().length < 40) return "It holds too little to follow";
  if (text.length > MAX_SKILL)
    return `Its SKILL.md is longer than the ${MAX_SKILL.toLocaleString("en")} characters a skill here holds`;
  if (secretIn(text))
    return "Its SKILL.md has what looks like a key or a token in it";
  return null;
}

/** A SKILL.md with the name it will have here in its front matter. */
function named(text: string, name: string): string {
  const t = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (parseSkill(t).name === name) return t;
  const m = /^---\n([\s\S]*?)\n---[ \t]*(\n|$)/.exec(t);
  if (!m) return t;
  const front = /^name:.*$/m.test(m[1])
    ? m[1].replace(/^name:.*$/m, `name: ${name}`)
    : `name: ${name}\n${m[1]}`;
  return `---\n${front}\n---${m[2]}${t.slice(m[0].length)}`;
}

export interface SkillResult {
  id: string;
  name: string;
  /** copied, or skipped (with why). */
  status: "copied" | "skipped";
  reason?: string;
  files?: number;
  left?: number;
}

/**
 * Copies the picked skills (by id, from a new scan) into the user's own skills: the SKILL.md through the same road as one
 * written in Settings → Skills (checked, scanned for secrets, put in its history), then its other files.
 */
export function bringSkills(
  db: DB,
  ids: string[],
  roots: Roots,
): SkillResult[] {
  const found = new Map(findSkills(roots).map((f) => [f.id, f]));
  const results: SkillResult[] = [];
  for (const id of ids.slice(0, MAX_FOUND)) {
    const f = found.get(id);
    if (!f) {
      results.push({
        id,
        name: id.split("|").pop() ?? id,
        status: "skipped",
        reason: "It is not there any more",
      });
      continue;
    }
    if (f.skip) {
      results.push({ id, name: f.name, status: "skipped", reason: f.skip });
      continue;
    }
    try {
      const plan = planFolder(f.folder);
      saveOwnSkill(
        db,
        f.name,
        named(fs.readFileSync(path.join(f.folder, "SKILL.md"), "utf8"), f.name),
        { create: true },
      );
      const dest = path.join(folders().learned, f.name);
      let copied = 0;
      for (const file of plan.files) {
        const to = path.join(dest, file.rel);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(file.abs, to, fs.constants.COPYFILE_EXCL);
        copied++;
      }
      results.push({
        id,
        name: f.name,
        status: "copied",
        files: copied + 1,
        left: plan.left.length,
      });
    } catch (e) {
      results.push({
        id,
        name: f.name,
        status: "skipped",
        reason:
          e instanceof HttpError || e instanceof Error
            ? e.message
            : "It could not be copied",
      });
    }
  }
  return results;
}

/** A found skill as the dialog shows it: where it is on this computer is left to its folder name. */
export const skillView = (f: FoundSkill) => ({
  id: f.id,
  source: f.source,
  where: f.where,
  name: f.name,
  description: f.description,
  files: f.files,
  bytes: f.bytes,
  left: f.left,
  skip: f.skip,
});
