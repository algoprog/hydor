// The choices an agent puts to the maker of a web app (the `webapp_choose` tool): what makes a card out of what the agent gave,
// what makes the answer out of what the card sent, the decision in a sentence, and where the choices are kept
// (<data>/webapps/<id>/choices/<card>.json) with the pictures taken of the app and of the design pages
// (<data>/webapps/<id>/pictures/<id>.png).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type ChooseAnswer, type ChooseDesign, type ChooseOption, type ChooseShape, isWebAppStage, type WebAppChoice, type WebAppChoose, type WebAppStage } from "../../shared/webapps.ts";

type Json = Record<string, any>;

const ID = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,60}$/;
const rec = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const line = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// ---- the card, from what the agent gave ----------------------------------------------------------------------------------------

export interface ChooseEnv {
  /** The web app the choice is for (its id). */
  app: string;
  /** Whether a picture with this id was taken for this app. */
  hasPicture: (id: string) => boolean;
  /** Makes the card's id. */
  newId?: () => string;
}

export type Made = { ok: true; choose: WebAppChoose } | { ok: false; errors: string[] };

/** A new card's id: letters and digits, safe as a file name. */
export const newChoiceId = () => `c${crypto.randomBytes(6).toString("hex")}`;

/** The card for what the agent gave, or what is wrong with it in plain words (every problem at once). A design comes with the pictures Hydor took of its page. */
export function normalizeChoose(a: Json, env: ChooseEnv): Made {
  const errors: string[] = [];
  const shape: ChooseShape | null = a.shape === "designs" || a.shape === "one" ? a.shape : null;
  if (!shape) errors.push("shape is designs or one");
  const stage: WebAppStage = isWebAppStage(a.stage) ? a.stage : shape === "designs" ? "design" : "brief";
  const title = line(a.title, 120);
  if (!title) errors.push("Give the card a title (what the maker is picking)");
  const out: WebAppChoose = { id: (env.newId ?? newChoiceId)(), app: env.app, shape: shape ?? "one", stage, title, ...(line(a.message, 600) ? { message: line(a.message, 600) } : {}), ...(line(a.submit, 30) ? { submit: line(a.submit, 30) } : {}) };
  const seen = new Set<string>();
  const picture = (v: unknown, where: string): string | undefined => {
    const id = line(v, 20);
    if (!id) return undefined;
    if (!env.hasPicture(id)) errors.push(`${where}: there is no picture “${id}” (webapp_look gives their ids)`);
    return id;
  };
  const idOf = (raw: Json, i: number) => {
    const id = line(raw.id, 60) || `o${i + 1}`;
    if (!ID.test(id)) errors.push(`Option ${i + 1}: the id is letters, digits and dashes`);
    if (seen.has(id)) errors.push(`Two options have the id “${id}”`);
    seen.add(id);
    return id;
  };
  if (shape === "designs") {
    const given = list(a.designs).slice(0, 4);
    if (given.length < 2) errors.push("Give two or three directions (designs), each { id, name, line, page }");
    out.designs = given.map((raw, i): ChooseDesign => {
      const d = rec(raw);
      const name = line(d.name, 60);
      const text = line(d.line, 220);
      if (!name || !text) errors.push(`Direction ${i + 1}: give a name and a line on what it is`);
      const pics = rec(d.pictures);
      const light = rec(d.light);
      const desktop = picture(pics.desktop, `Direction ${i + 1}`);
      const phone = picture(pics.phone, `Direction ${i + 1}`);
      if (!desktop && !phone) errors.push(`Direction ${i + 1}: there is no picture of it (give its page: an HTML file in the app's folder)`);
      const l = { desktop: picture(light.desktop, `Direction ${i + 1}`), phone: picture(light.phone, `Direction ${i + 1}`) };
      return { id: idOf(d, i), name, line: text, page: line(d.page, 200), pictures: { ...(desktop ? { desktop } : {}), ...(phone ? { phone } : {}) }, ...(l.desktop || l.phone ? { light: { ...(l.desktop ? { desktop: l.desktop } : {}), ...(l.phone ? { phone: l.phone } : {}) } } : {}) };
    });
    if (!out.submit) out.submit = "Use this design";
  } else if (shape === "one") {
    const given = list(a.options);
    if (given.length < 2 || given.length > 6) errors.push("Give two to six options");
    out.options = given.slice(0, 6).map((raw, i): ChooseOption => {
      const o = rec(raw);
      const t = line(o.title, 80);
      if (!t) errors.push(`Option ${i + 1}: give it a title`);
      const url = line(o.url, 300);
      if (url && !/^https:\/\//.test(url)) errors.push(`Option ${i + 1}: url is an https address`);
      const pic = picture(o.picture, `Option ${i + 1}`);
      return { id: idOf(o, i), title: t, ...(line(o.line, 220) ? { line: line(o.line, 220) } : {}), ...(pic ? { picture: pic } : {}), ...(url ? { url } : {}) };
    });
    if (a.other === true) out.other = true;
  }
  return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, choose: out };
}

/** What the card sent as the answer (an object or its JSON), checked against what was offered. */
export function readAnswer(offered: WebAppChoose, raw: unknown): { ok: true; answer: ChooseAnswer } | { ok: false; error: string } {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return { ok: false, error: "The answer is not what the card sends." };
    }
  }
  const a = rec(v);
  // "You decide": the choice handed back to the agent, whatever was offered.
  if (a.youDecide === true) return { ok: true, answer: { shape: offered.shape, ...(offered.shape === "designs" ? { pick: "" } : {}), youDecide: true } as ChooseAnswer };
  if (offered.shape === "designs") {
    const pick = line(a.pick, 60);
    if (!offered.designs?.some((d) => d.id === pick)) return { ok: false, error: "Pick one of the designs." };
    const take = line(a.take, 400);
    return { ok: true, answer: { shape: "designs", pick, ...(take ? { take } : {}) } };
  }
  const pick = line(a.pick, 60);
  const other = line(a.other, 300);
  if (pick) {
    if (!offered.options?.some((o) => o.id === pick)) return { ok: false, error: "Pick one of the options." };
    return { ok: true, answer: { shape: "one", pick } };
  }
  if (other && offered.other) return { ok: true, answer: { shape: "one", other } };
  return { ok: false, error: "Pick one of the options." };
}

// ---- the decision in a sentence ----------------------------------------------------------------------------------------------

export function summarize(offered: WebAppChoose, answer: ChooseAnswer): string {
  if (answer.youDecide) return `${offered.shape === "designs" ? "Design" : offered.title.replace(/[?:.]+$/, "")}: left to the agent to decide.`.slice(0, 900);
  if (answer.shape === "designs") {
    const d = offered.designs?.find((x) => x.id === answer.pick);
    return `Design: ${d?.name ?? answer.pick}${d?.line ? ` (${d.line.replace(/\.$/, "")})` : ""}.${answer.take ? ` Also: ${answer.take}` : ""}`.slice(0, 900);
  }
  const o = offered.options?.find((x) => x.id === answer.pick);
  return `${offered.title.replace(/[?:.]+$/, "")}: ${o?.title ?? answer.other ?? "no answer"}.`.slice(0, 900);
}

/** Today as year-month-day: a decision's day. */
export function dayOf(at = Date.now()): string {
  const now = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// ---- what is kept ------------------------------------------------------------------------------------------------------------

const CHOICE_ID = /^c[0-9a-f]{12}$/;
const PICTURE_ID = /^p[0-9a-f]{12}$/;
/** The most pictures kept for an app: the oldest go. */
export const PICTURES_KEEP = 160;
export const isChoiceId = (v: string) => CHOICE_ID.test(v);
export const isPictureId = (v: string) => PICTURE_ID.test(v);

export interface Keeper {
  /** Keeps a card that was put (waiting for an answer). */
  offer(choose: WebAppChoose): void;
  /** Keeps the answer. */
  answer(choose: WebAppChoose, answer: ChooseAnswer, summary: string, at?: number): WebAppChoice;
  /** The card that was put, answered or not, and the answer when there is one. */
  get(id: string): { choice: WebAppChoice | null; offered: WebAppChoose | null };
  /** The answered ones, oldest first. */
  list(): WebAppChoice[];
  /** Keeps a picture; its id. */
  savePicture(png: Buffer): string;
  picture(id: string): Buffer | null;
  hasPicture(id: string): boolean;
}

/** Where an app's choices and pictures are kept: <root>/<app id>/ (root is Hydor's web apps folder in its data folder). */
export function keeper(root: string, app: string): Keeper {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(app)) throw new Error("Not an app id");
  const choices = path.join(root, app, "choices");
  const pictures = path.join(root, app, "pictures");
  const fileOf = (id: string) => path.join(choices, `${id}.json`);
  const read = (id: string): { offered: WebAppChoose; choice?: WebAppChoice } | null => {
    if (!CHOICE_ID.test(id)) return null;
    try {
      return JSON.parse(fs.readFileSync(fileOf(id), "utf8"));
    } catch {
      return null;
    }
  };
  const write = (id: string, body: unknown) => {
    fs.mkdirSync(choices, { recursive: true, mode: 0o700 });
    const tmp = `${fileOf(id)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
    fs.renameSync(tmp, fileOf(id));
  };
  return {
    offer(choose) {
      if (!CHOICE_ID.test(choose.id)) throw new Error("Not a card id");
      if (!read(choose.id)) write(choose.id, { offered: choose });
    },
    answer(choose, answer, summary, at = Date.now()) {
      const choice: WebAppChoice = { id: choose.id, shape: choose.shape, stage: choose.stage, title: choose.title, at, offered: choose, answer, summary };
      write(choose.id, { offered: choose, choice });
      return choice;
    },
    get(id) {
      const r = read(id);
      return { choice: r?.choice ?? null, offered: r?.offered ?? null };
    },
    list() {
      let names: string[] = [];
      try {
        names = fs.readdirSync(choices).filter((n) => /^c[0-9a-f]{12}\.json$/.test(n));
      } catch {}
      return names
        .map((n) => read(n.slice(0, -5))?.choice)
        .filter((c): c is WebAppChoice => !!c)
        .sort((a, b) => a.at - b.at);
    },
    savePicture(png) {
      const id = `p${crypto.randomBytes(6).toString("hex")}`;
      fs.mkdirSync(pictures, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(pictures, `${id}.png`), png, { mode: 0o600 });
      // The oldest go (by name of file made here: only files of this shape, never a glob of the folder).
      try {
        const all = fs.readdirSync(pictures).filter((n) => /^p[0-9a-f]{12}\.png$/.test(n)).map((n) => ({ n, t: fs.statSync(path.join(pictures, n)).mtimeMs }));
        for (const old of all.sort((a, b) => b.t - a.t).slice(PICTURES_KEEP)) fs.rmSync(path.join(pictures, old.n), { force: true });
      } catch {}
      return id;
    },
    picture(id) {
      if (!PICTURE_ID.test(id)) return null;
      try {
        return fs.readFileSync(path.join(pictures, `${id}.png`));
      } catch {
        return null;
      }
    },
    hasPicture(id) {
      return PICTURE_ID.test(id) && fs.existsSync(path.join(pictures, `${id}.png`));
    },
  };
}
