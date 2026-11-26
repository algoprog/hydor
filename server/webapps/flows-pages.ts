// What the Flows tab and an app's pages need of the agent app linked to a web app (flows.ts): its flows in plain words
// (questions and answer fields), the runs, the functions the web app offers, and what could be linked.
import { inputsLine, type AnswerField, type AppDef, type AppField } from "../../shared/apps.ts";
import type { FlowsFunction, FlowsOffer, FlowsOverview, FlowsRun, JoinField, JoinFlow } from "../../shared/webapps.ts";
import { flowsOf } from "../apps/keyrun.ts";
import { useOpenApp } from "../apps/appfns.ts";
import { dayStart, getApp, listApps, listRuns, usageSince } from "../apps/store.ts";
import { HttpError } from "../auth.ts";
import type { Deps } from "../features/types.ts";
import { embedUse, hasSearch } from "./embed.ts";
import { linkOf, linkOfApp, startingRecipe } from "./flows.ts";
import { functionsView } from "./flows-functions.ts";
import { sessionFns } from "./session-fns.ts";
import { getWebApp, type WebAppRow } from "./store.ts";

const FORM_WORDS: Record<string, string> = { text: "Short text", long: "Long text", number: "Number", date: "Date", choice: "Choice", yesno: "Yes or no", file: "File" };
const ANSWER_WORDS: Record<string, string> = { text: "Text", markdown: "Formatted text", number: "Number", yesno: "Yes or no", date: "Date", url: "Link", list: "List", table: "Table", media: "Pictures or files", ui: "A card" };

const asked = (f: AppField): JoinField => ({ id: f.id, label: f.label, type: FORM_WORDS[f.type] ?? f.type, ...(f.required ? { required: true } : {}), ...(f.options?.length ? { options: f.options } : {}) });
const found = (f: AnswerField): JoinField => ({ id: f.id, label: f.label, type: ANSWER_WORDS[f.type] ?? f.type, ...(f.required ? { required: true } : {}), ...(f.columns?.length ? { columns: f.columns.map((c) => c.label) } : {}) });

/** One flow of an agent app in plain words: its form's questions and its answer's fields (what GET /api/apps/:slug/flows says, with the kinds said as people say them). */
export function joinFlows(a: AppDef): JoinFlow[] {
  return flowsOf(a).flows.map((f) => ({ id: f.id, name: f.name, form: f.form.map((q) => asked(q as AppField)), answer: f.answer.map((x) => found(x as AnswerField)) }));
}

export function flowsPageRoutes(d: Deps, h: { enabled: () => void; own: (req: { params: unknown }) => WebAppRow }) {
  const { app, db } = d;
  const person = (p: { id: string; name?: string } | null | undefined) => (p ? { id: p.id, name: p.name || p.id } : null);

  app.get("/api/webapps/:id/flows/overview", async (req): Promise<FlowsOverview> => {
    h.enabled();
    const web = h.own(req);
    const l = linkOf(db, web.id);
    const a = l ? getApp(db, l.app_id) : null;
    if (!a) throw new HttpError(404, "This web app has no flows half.");
    const runs: FlowsRun[] = listRuns(db, { app: a.id, limit: 15 }).map((r) => ({
      id: r.id,
      flow: r.flow ?? "run",
      status: r.status,
      person: person(r.person),
      inputs: inputsLine(r.recipe.fields, r.inputs, 100) || undefined,
      createdAt: r.createdAt,
      ...(r.endedAt ? { endedAt: r.endedAt } : {}),
      ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}),
      ...(r.ref ? { ref: r.ref } : {}),
      path: `/apps/runs/${encodeURIComponent(r.id)}`,
    }));
    const view = functionsView(web, a.tools, sessionFns(db, web.id));
    const list: FlowsFunction[] = view.functions.map((f) => ({ name: f.name, description: f.description, writes: f.writes, allowed: f.allowed, withoutAsking: f.withoutAsking, inSessions: f.inSessions, inSessionsWithoutAsking: f.inSessionsWithoutAsking }));
    return {
      app: { id: a.id, slug: a.slug, name: a.name, description: a.description },
      flows: joinFlows(a),
      runs,
      functions: { file: view.file, problems: view.problems, list },
      spend: { todayUsd: Math.round(usageSince(db, a.id, dayStart(), "api").spent * 10000) / 10000, capUsd: web.settings.dailyCapUsd, ...(hasSearch(web) ? { meaning: embedUse(db, web.id) } : {}) },
    };
  });

  app.get("/api/webapps/:id/flows/offer", async (req): Promise<FlowsOffer> => {
    h.enabled();
    const web = h.own(req);
    const have = linkOf(db, web.id);
    const start = startingRecipe(web.name);
    const apps = listApps(db)
      .filter((x) => !x.webapp && !linkOfApp(db, x.id))
      .map((x) => ({ id: x.id, slug: x.slug, name: x.name, description: x.description, icon: x.icon, color: x.color, flows: joinFlows(x) }));
    return {
      apps,
      starting: { name: start.name, description: start.description, flow: joinFlows({ ...(start as AppDef), id: "starting", slug: "starting" })[0] },
      ...(have ? { problem: `This web app has agents' work already: ${getApp(db, have.app_id)?.name ?? "an agent app"}.` } : {}),
    };
  });

  // Where a run of a linked agent app is shown in its web app: its home page.
  useOpenApp({
    of(run) {
      const l = linkOfApp(db, run.app);
      const web = l ? getWebApp(db, l.web_id) : null;
      return web ? { id: web.id, name: web.name, path: "/", row: false } : null;
    },
  });
}
