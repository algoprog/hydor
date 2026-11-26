// What the choice cards (ChooseCard, ChooseRow, WebSketch) decide without drawing anything: the state a card opens in, when an
// answer is ready, the answer the card sends, the pictures to show for the page's look, and how the tools' output is read.
// Pure, so a script tests it (chooseLogic-test.ts).
import type { ChooseAnswer, ChooseDesign, WebAppChoose, WebSketch } from "@shared/webapps";

// ---- designs -------------------------------------------------------------------------------------------------------

/** The pictures of a design for the page's look: the light ones when the page is light and there are some, else the dark ones, piece by piece. */
export function designPictures(
  d: ChooseDesign,
  light: boolean,
): { desktop?: string; phone?: string } {
  const dark = d.pictures ?? {};
  if (!light) return { desktop: dark.desktop, phone: dark.phone };
  return {
    desktop: d.light?.desktop ?? dark.desktop,
    phone: d.light?.phone ?? dark.phone,
  };
}

export const designsValid = (
  designs: ChooseDesign[] | undefined,
  pick: string,
): boolean => !!designs?.some((d) => d.id === pick);

/** Something to take from another look is asked about only once one is picked, and only when there is another one. */
export const askTake = (
  designs: ChooseDesign[] | undefined,
  pick: string,
): boolean => designsValid(designs, pick) && (designs?.length ?? 0) > 1;

export function designsAnswer(pick: string, take = ""): ChooseAnswer {
  const t = take.trim();
  return { shape: "designs", pick, ...(t ? { take: t } : {}) };
}

// ---- one of a few --------------------------------------------------------------------------------------------------

export const oneValid = (
  options: { id: string }[] | undefined,
  pick: string,
  other: string,
  allowOther: boolean,
): boolean =>
  !!options?.some((o) => o.id === pick) || (allowOther && other.trim() !== "");

/** The picked option, or the maker's own words (which win only when no option is picked). */
export function oneAnswer(pick: string, other = ""): ChooseAnswer {
  const o = other.trim();
  return pick
    ? { shape: "one", pick }
    : o
      ? { shape: "one", other: o }
      : { shape: "one" };
}

/** The address of a picture of a web app (webapp_look). */
export const pictureUrl = (app: string, id: string): string =>
  `/api/webapps/${encodeURIComponent(app)}/pictures/${encodeURIComponent(id)}`;

/** A link that is safe to show as a link: https only. */
export function httpsLink(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

// ---- the tools' output ---------------------------------------------------------------------------------------------

/** What the webapp_choose tool returns when it worked. */
export interface ChooseOutput {
  choice: string;
  app: string;
  status: string;
  answer?: ChooseAnswer;
}

/** The tool's output, or null when it was plain words (the tool failed: they say why). */
export function parseChooseOutput(
  text: string | undefined,
): ChooseOutput | null {
  try {
    const o = JSON.parse(text ?? "") as Partial<ChooseOutput> | null;
    if (
      !o ||
      typeof o !== "object" ||
      typeof o.choice !== "string" ||
      typeof o.app !== "string"
    )
      return null;
    return {
      choice: o.choice,
      app: o.app,
      status: typeof o.status === "string" ? o.status : "",
      answer: o.answer,
    };
  } catch {
    return null;
  }
}

/** What app_sketch with kind web returns. */
export interface WebSketched {
  said?: string;
  sketch: WebSketch;
  assumed?: string[];
  questions?: { ask: string; choices: string[] }[];
  needs?: { name: string; what?: string }[];
}

/** The sketch tool's output when it is a web app's sketch, else null. */
export function parseWebSketch(text: string | undefined): WebSketched | null {
  try {
    const o = JSON.parse(text ?? "") as Partial<WebSketched> | null;
    const s = o?.sketch;
    if (!o || !s || s.kind !== "web" || typeof s.name !== "string") return null;
    const list = <T>(x: T[] | undefined): T[] => (Array.isArray(x) ? x : []);
    return {
      said: o.said,
      sketch: {
        ...s,
        does: list(s.does),
        keeps: list(s.keeps).filter((k) => k && typeof k.title === "string"),
        who: s.who ?? "",
        runs: s.runs ?? "",
        description: s.description ?? "",
      },
      assumed: list(o.assumed),
      questions: list(o.questions).slice(0, 3),
      needs: list(o.needs),
    };
  } catch {
    return null;
  }
}

/** The message "Build it" sends: the words, then the questions that were answered, one line each. */
export function buildMessage(
  build: string,
  questions: { ask: string }[],
  picked: Record<number, string>,
): string {
  const lines = questions.flatMap((q, i) =>
    picked[i] ? [`- ${q.ask} ${picked[i]}`] : [],
  );
  return [build, ...lines].join("\n");
}

// ---- one draft for both shapes ---------------------------------------------------------------------------------------------

/** Everything a card holds before it is answered, whatever its shape. */
export interface Draft {
  pick: string;
  take: string;
  other: string;
  /** The choice was handed back to the agent ("You decide"). */
  youDecide?: boolean;
}

export const initialDraft = (_c: WebAppChoose): Draft => ({ pick: "", take: "", other: "" });

/** What a finished card shows: the answer put back into a draft. */
export function draftFromAnswer(
  c: WebAppChoose,
  a: ChooseAnswer | undefined,
): Draft {
  const d = initialDraft(c);
  if (!a) return d;
  if (a.youDecide) return { ...d, youDecide: true };
  if (a.shape === "designs") return { ...d, pick: a.pick, take: a.take ?? "" };
  return { ...d, pick: a.pick ?? "", other: a.other ?? "" };
}

/** The answer a card sends (by its shape). */
export function draftAnswer(c: WebAppChoose, d: Draft): ChooseAnswer {
  if (c.shape === "designs") return designsAnswer(d.pick, askTake(c.designs, d.pick) ? d.take : "");
  return oneAnswer(d.pick, c.other ? d.other : "");
}

/** Whether the card can be answered now. */
export function draftValid(c: WebAppChoose, d: Draft): boolean {
  if (c.shape === "designs") return designsValid(c.designs, d.pick);
  return oneValid(c.options, d.pick, d.other, !!c.other);
}
