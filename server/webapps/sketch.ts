// app_sketch with kind "web": the sketch of a web app, before anything is made. It is the same tool and the same card position as an
// agent app's sketch (server/apps/builder.ts); what the agent gives is kept short and plain. Nothing is made: the person says Build
// it, changes it, or asks for a small tool instead.
import type { SketchKeeps, WebSketch } from "../../shared/webapps.ts";
import type { ToolOutput } from "../features/types.ts";
import { kindById } from "./ideas.ts";

type Json = Record<string, any>;

const line = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

export const RUNS_HERE = "Inside this Hydor, signed in as you.";

export async function sketchWeb(a: Json): Promise<ToolOutput> {
  const errors: string[] = [];
  const name = line(a.name, 80);
  const description = line(a.description, 240);
  if (!name) errors.push("Give it a name");
  if (!description) errors.push("Say what it is for in a sentence (description)");
  const who = line(a.who, 240);
  if (!who) errors.push("Say who uses it (who): “Mechanics and the people at the front desk of a bike shop”");
  const does = list(a.does).map((d) => line(d, 140)).filter(Boolean).slice(0, 7);
  if (!does.length) errors.push("Say the few things they do there (does): at least one, at most six");
  if (list(a.does).length > 6) errors.push("At most six things they do");
  const kind = kindById(line(a.type, 60));
  const keeps: SketchKeeps[] = list(a.keeps).slice(0, 10).flatMap((raw, i): SketchKeeps[] => {
    const k = rec(raw);
    const title = line(k.title, 60);
    const may = line(k.who, 120);
    if (!title || !may) {
      errors.push(`Kind of thing ${i + 1}: give a title (what it is called) and who may see it (who)`);
      return [];
    }
    return [{ title, ...(line(k.line, 200) ? { line: line(k.line, 200) } : {}), who: may }];
  });
  const assumed = list(a.assumed).map((x) => line(x, 200)).filter(Boolean);
  if (assumed.length > 10) errors.push("Say what you assumed in at most ten lines");
  const questions = list(a.questions).map((q) => {
    const o = rec(q);
    return { ask: line(o.ask, 200), choices: list(o.choices).filter((c): c is string => typeof c === "string" && !!c.trim()).map((c) => line(c, 100)) };
  });
  if (questions.length > 3) errors.push("Ask at most three questions: only those whose answers change the app");
  questions.forEach((q, i) => {
    if (!q.ask) errors.push(`Question ${i + 1}: write the question (ask)`);
    if (q.choices.length < 2 || q.choices.length > 6) errors.push(`Question ${i + 1}: give two to six choices to tap`);
  });
  if (errors.length) return { text: `Not shown. Fix these first:\n- ${[...new Set(errors)].join("\n- ")}`, isError: true };
  const sketch: WebSketch = { kind: "web", name, description, ...(kind ? { type: { id: kind.id, title: kind.name } } : {}), who, does, keeps, runs: line(a.runs, 200) || RUNS_HERE };
  return {
    text: JSON.stringify(
      {
        said: "The person sees this sketch of a web app as a card, with Build it, Change it and Make it a small tool instead; nothing is made. End your turn and wait for their answer. On “Build it.”, write the brief to docs/brief.md and go on with the web-app-builder skill's Design stage; if they say to make it the other kind, make an agent app's sketch instead.",
        sketch,
        assumed,
        ...(questions.length ? { questions } : {}),
      },
      null,
      1,
    ),
  };
}
