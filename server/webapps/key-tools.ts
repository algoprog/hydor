// What agents do about a web app's keys: webapp_keys says what the app needs and what is there (by name only) and puts the
// card up for the missing ones; webapp_launch does the same before its card. They go through the app's routes, as the pages
// do; values never pass here.
import { keysCardMarker, type KeysCardView } from "../../shared/keys.ts";
import type { AppKey, WebAppDetail, WebAppKeys } from "../../shared/webapps.ts";
import type { RunCtx, RunTool, ToolOutput } from "../features/types.ts";

type Json = Record<string, any>;

export interface KeyHelpers {
  api: <T = Json>(ctx: RunCtx, method: string, url: string, body?: Json) => Promise<T>;
  findApp: (ctx: RunCtx, ref: unknown) => Promise<WebAppDetail>;
  text: (t: string, isError?: boolean) => ToolOutput;
  marker: (a: { id: string }) => string;
}

const askable = (k: AppKey) => k.givenBy === "provider" || k.givenBy === "you";
const who = (k: AppKey) => (k.givenBy === "host" ? "given by Hydor or the server" : k.givenBy === "made" ? "made by Hydor" : k.givenBy === "you" ? "yours to choose" : k.from ? `from ${k.from}` : "from its provider");

const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? ""));

export function keysText(app: { name: string }, v: WebAppKeys): string {
  const where = v.env === "hydor" ? "inside Hydor" : `${v.env} on a server`;
  if (!v.keys.length) return `${app.name} needs no keys in ${where}.`;
  const lines = v.keys.map((k) => `- ${k.name} (${who(k)}): ${!askable(k) ? "never asked for" : k.refused ? "the saved one is a live key, REFUSED here: a test key is needed" : k.set ? "set for this place" : k.needed ? "needed, NOT SET" : "optional, not set"}`);
  return `Keys of ${app.name} in ${where}:\n${lines.join("\n")}${v.inside ? "\nPayments inside Hydor take a test key only (sk_test_…): a live key is refused. Preview and the version launched inside Hydor share these; the keys a launch makes, Hydor makes." : ""}`;
}

/** Puts the card up in the agent's session and says what happens next; null when there is nothing to ask. */
export async function askForKeys(h: KeyHelpers, ctx: RunCtx, app: { id: string }, body: { env: string; names?: string[]; skippable?: boolean; replace?: boolean }): Promise<{ card: KeysCardView; say: string } | null> {
  const { card } = await h.api<{ card: KeysCardView | null }>(ctx, "POST", `/api/webapps/${encodeURIComponent(app.id)}/keys/card`, { ...body, session: ctx.key });
  if (!card || card.state !== "pending" || !card.items.some((i) => i.state === "todo")) return null;
  const needed = card.items.some((i) => i.state === "todo" && !i.optional);
  const asked = card.items.filter((i) => i.state === "todo").map((i) => `${i.title} (${i.fields.map((f) => f.key).join(", ")}${i.optional ? "; optional" : ""})`);
  return {
    card,
    say: `A card in the conversation asks the person for ${list(asked)}, with how to get ${asked.length > 1 ? "each" : "it"}. You will get a message once ${needed ? "every needed one is saved" : "each is answered"} (or they close the card), saying for each: saved, skipped or left. Do not ask for any of it in words, and never ask them to paste a key into the chat.\n${keysCardMarker(card.id)}`,
  };
}

export function keysTool(h: KeyHelpers, APP: Json): RunTool {
  return {
    name: "webapp_keys",
    description:
      "The keys a web app needs (its hydor.json lists them), by name: who gives each, which are needed and which are set; never a value. A web app's keys are its own: you cannot use them by name. With ask: true it puts a card in the conversation for the missing ones (or those in names), a tab for each provider with how to get it, and a message tells you per key: saved, skipped or left. Use it as soon as a step needs a key, not when something fails; ask for all the keys of a step together; never ask anyone to paste a key into the chat. replace: true with names asks for new values (a key stopped working).",
    inputSchema: {
      type: "object",
      properties: {
        app: APP,
        place: { type: "string", description: "Whose keys: hydor (inside Hydor, the default), or the place on a server (production). Each place has its own values." },
        ask: { type: "boolean", description: "Put the card up for the missing keys." },
        names: { type: "array", items: { type: "string" }, description: "ask: only these keys." },
        replace: { type: "boolean", description: "ask: with names, ask again although they are saved." },
      },
    },
    async run(a, ctx) {
      try {
        const app = await h.findApp(ctx, a.app);
        const env = typeof a.place === "string" && a.place.trim() ? a.place.trim() : "hydor";
        const read = () => h.api<WebAppKeys>(ctx, "GET", `/api/webapps/${encodeURIComponent(app.id)}/keys?env=${encodeURIComponent(env)}`);
        const v = await read();
        if (a.ask !== true) return h.text(`${keysText(app, v)}
${h.marker(app)}`);
        const names = Array.isArray(a.names) ? a.names.map(String) : undefined;
        const replace = a.replace === true && !!names?.length;
        // Inside Hydor the app goes on without a key while it is being made.
        const asked = await askForKeys(h, ctx, app, { env, ...(names ? { names } : {}), ...(replace ? { replace } : {}), skippable: v.inside });
        if (asked) return h.text(`${asked.say}
${h.marker(app)}`);
        return h.text(`There is nothing to ask for.\n${keysText(app, await read())}\n${h.marker(app)}`);
      } catch (e) {
        return h.text((e as Error).message, true);
      }
    },
  };
}
