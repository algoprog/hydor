// webapp_services: what the catalog offers for a need of a web app (services.json), and the person's choice. Where one
// service is offered there is no card: the agent says which it uses and why, and goes on. Where there are two or three,
// the card in the conversation asks the person; the agent gets a message with what they chose and its keys. Where an app
// can do without any (SQLite on its disk, its own log), that is said first, and the card is only for asking for more.
import { keysCardMarker, type KeysCardView } from "../../shared/keys.ts";
import { servicesCardMarker, type Catalog, type ChosenService, type Need, type NeedView, type ServicesCardView, type ServiceView } from "../../shared/services.ts";
import type { AppServicesView } from "../../shared/services.ts";
import type { RunTool, ToolOutput } from "../features/types.ts";
import type { KeyHelpers } from "./key-tools.ts";
import { needOf, readCatalog, serviceOf } from "./services.ts";

type Json = Record<string, any>;

export const SERVICES_TOOL = "webapp_services";

const price = (s: ServiceView) => (s.checkPrice ? `check the current price (${s.page})` : [s.free ? `free: ${s.free}` : "", s.paid ? `paid: ${s.paid}` : ""].filter(Boolean).join("; "));

/** One offered service in a line for the agent. */
const line = (s: ServiceView) => `- ${s.name}${s.recommended ? " (recommended)" : ""}: ${s.why} Costs: ${price(s)}.${s.catch ? ` Catch: ${s.catch}` : ""}`;

export function needText(v: NeedView): string {
  return [
    `${v.name}: ${v.what}.`,
    v.builtIn ? `Without a service: ${v.builtIn.say}` : "",
    ...v.services.map(line),
    ...v.also.map((s) => `- Also, not on the card: ${s.name}: ${s.why}${s.catch ? ` Catch: ${s.catch}` : ""}`),
    v.note ?? "",
    v.leftOut.length ? `Left out of the catalog, and why: ${v.leftOut.map((x) => `${x.name} (${x.why}${x.url ? `: ${x.url}` : ""})`).join("; ")}.` : "",
    v.readOn ? `Prices as read on ${v.readOn}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function servicesTool(h: KeyHelpers, APP: Json, catalog: () => Catalog = () => readCatalog()): RunTool {
  return {
    name: SERVICES_TOOL,
    description:
      "The outside services a web app can use, from Hydor's catalog: for each need (database, mail, search, files, model, payments, signin, sms, visits, errors, uptime, domain, bots, maps; where it runs is webapp_places) the services offered, one or at most three, with the recommended one, what each costs a small app, its catch, and why others are left out. Call it as soon as an app needs one. With need: a need with one service is not a question (it is chosen and its keys asked for: say in a line which and why); one with several puts a card in the conversation and a message tells you what the person chose and its keys; a need an app can do without says so first, and puts the card up only with ask: true. service: only when the person named it themselves. change: true shows the card again. Never recommend a service that is not in the catalog without saying so.",
    inputSchema: {
      type: "object",
      properties: {
        app: APP,
        need: { type: "string", description: "The need's id. Left out: the needs, and what this app has chosen." },
        service: { type: "string", description: "The service the person named, by id or name." },
        ask: { type: "boolean", description: "For a need the app can do without: put the card up all the same." },
        change: { type: "boolean", description: "Put the card up again although one was chosen." },
      },
    },
    async run(a, ctx) {
      try {
        const app = await h.findApp(ctx, a.app);
        const id = encodeURIComponent(app.id);
        const have = await h.api<AppServicesView>(ctx, "GET", `/api/webapps/${id}/services`);
        const chosenLine = (c: ChosenService) => `${c.needName}: ${c.name}${c.keys.length ? ` (${c.keys.join(", ")})` : ""}`;
        const needId = typeof a.need === "string" ? a.need.trim() : "";
        if (!needId) return h.text(`The needs: ${have.needs.map((n) => `${n.id} (${n.name})`).join(", ")}; where the app runs is webapp_places.\nChosen for ${app.name}: ${have.chosen.length ? have.chosen.map(chosenLine).join("; ") : "nothing yet"}.\n${h.marker(app)}`);
        if (needId === "run" || needId === "place") return h.text(`Where the app runs is the Launch stage's: webapp_places puts its card up, with the servers and platforms the catalog names.\n${h.marker(app)}`);
        const need: Need | undefined = needOf(catalog(), needId);
        if (!need) return h.text(`No need is called ${needId.slice(0, 40)}. They are: ${have.needs.map((n) => n.id).join(", ")}.`, true);
        const choose = async (service: string) => {
          const r = await h.api<{ say: string; keys: KeysCardView | null }>(ctx, "POST", `/api/webapps/${id}/services/${encodeURIComponent(need.id)}`, { service, session: ctx.key });
          return `${r.say}${r.keys && r.keys.items.some((i) => i.state === "todo") ? `\n${keysCardMarker(r.keys.id)}` : ""}`;
        };
        if (typeof a.service === "string" && a.service.trim()) {
          const s = serviceOf(need, a.service);
          if (!s) {
            const out = need.leftOut.find((x) => x.name.toLowerCase().includes(String(a.service).toLowerCase()));
            return h.text(`The catalog does not offer ${String(a.service).slice(0, 60)} for ${need.name.toLowerCase()}${out ? `, which leaves it out because ${out.why}${out.url ? ` (${out.url})` : ""}` : ""}. It offers ${[...need.services, ...(need.also ?? [])].map((x) => x.name).join(", ")}. If they want it all the same, say it is not in the catalog, read its current pages and ask for its keys with webapp_keys or request_secret.\n${h.marker(app)}`, true);
          }
          return h.text(`${await choose(s.id)}\n${h.marker(app)}`);
        }
        const current = have.chosen.find((c) => c.need === need.id);
        const { needs } = await h.api<{ needs: NeedView[] }>(ctx, "GET", "/api/webapps/services");
        const offered = needs.find((n) => n.id === need.id)!;
        if (current && a.change !== true) return h.text(`${app.name} uses ${current.name} for ${need.name.toLowerCase()} already${current.keys.length ? ` (${current.keys.join(", ")})` : ""}. ${current.applied.say}\nchange: true puts the card up again.\n${needText(offered)}\n${h.marker(app)}`);
        if (need.builtIn && a.ask !== true && !current)
          return h.text(`Without a service: ${need.builtIn.say} That is enough until ${need.builtIn.until}; then call again with ask: true.\n${needText({ ...offered, builtIn: undefined })}\n${h.marker(app)}`);
        // One service: no question for the person.
        if (need.services.length === 1 && !need.also?.length)
          return h.text(`The catalog has one service for ${need.name.toLowerCase()}: ${need.services[0].name}. ${need.services[0].why} Say so in a line and go on; do not ask them to choose.\n${await choose(need.services[0].id)}\n${h.marker(app)}`);
        const { card } = await h.api<{ card: ServicesCardView }>(ctx, "POST", `/api/webapps/${id}/services/cards`, { need: need.id, session: ctx.key });
        return h.text(`A card in the conversation asks the person to choose a service for ${need.name.toLowerCase()}: ${card.need.services.map((s) => `${s.name}${s.recommended ? " (recommended)" : ""}`).join(", ")}. You will get a message with what they chose and its keys; carry on with what does not need it, and do not ask again in words.\n${needText(card.need)}\n${servicesCardMarker(card.id)}\n${h.marker(app)}`);
      } catch (e) {
        return h.text((e as Error).message, true) as ToolOutput;
      }
    },
  };
}
