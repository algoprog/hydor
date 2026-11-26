// The model for a web app's AI (an app that lists `ai` in its hydor.json): the host answers with the owner's own models, within the app's daily cap, and the app carries no key.
//
//   POST /api/apps/:slug/ai   { tier, messages, schema?, tools?, maxOutputTokens?, stream? } → { text, data?, toolCalls, stop, model, usage, cap }  (or server-sent events)
//
// It is the request the driver writes at the top of its own file, answered the way an agent app's "quick model answer" step is: through the helper (server/helper.ts), Custom's models with their
// start-up, prices and plan models. What the helper's one-question call could not do (tool calls, an answer as it is written, the usage of a turn) is helperChat there, built from the same parts.
//
// Which model. A tier is Settings → Models → Tiers for Custom (tiersOf); a tier with no model set there falls to the helper model when that is one of Custom's, and otherwise to "Automatic" (Claude Haiku
// through its program, `Sonnet` for best): plain text and an answer to fit a schema, in one piece, no tool calls (nothing says what such a call cost, so it counts tokens by length and no money). A model
// whose tools are not native cannot be asked for tool calls (403, with the sentence). Nothing of Hydor is reachable from a call: it gets the messages the app sent and no tool but the ones the app named,
// which the app runs itself; the host never calls the app.
//
// Who may ask. The key Hydor made for that web app (webCaller in embed.ts: the flows half's key, or the key made from the app's secret), only when its hydor.json lists `ai`, and only for a tier its
// hydor.json lists (services.ai.tiers) AND its owner allowed (Settings of the app: tiers). The owner is asked on the card on the app's page before the first use: until they allow, the answer is a 403 that says so.
// The person is proven, never claimed: the signed header Hydor put on the person's own request (x-hydor-person), forwarded as it is; one that does not verify is refused, one that ran out is told to open the app again.
//
// How much. A daily cap in money for the app (its Settings → dailyCapUsd, which is also what its flows half's runs are held to: the two add up), counted from the owner's midnight, a hard stop with
// the answer the driver expects (429, kind "cap", `until`), counted for the app and for each person. Calls in flight may pass it by what they cost. A model with no price counts as $0, so a
// daily ceiling of tokens stops that too. Sizes: 200 messages, 400,000 characters in all, 40 tools; 60 calls a minute for an app, 20 for a person; 4 at a time.
// What is logged: the app, the person's id, tier, model, tokens, cost and how it ended (table web_app_ai_calls, kept 14 days). Never a word of what anyone wrote or the model answered.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { WebAppAi } from "../../shared/webapps.ts";
import { ContextOverflow, ToolsUnsupported, type ChatMessage, type ToolSchema } from "../agent/llm.ts";
import { HttpError } from "../auth.ts";
import type { DB } from "../db.ts";
import type { Deps } from "../features/types.ts";
import { customModel, helper, helperChat, helperModelId } from "../helper.ts";
import { Limiter } from "../apps/limits.ts";
import { dayStart, usageSince } from "../apps/store.ts";
import { tiersOf } from "../assistants/tiers.ts";
import { linkOf, PERSON_GRACE_SECONDS } from "./flows.ts";
import { webCaller } from "./embed.ts";
import { verifyPerson, PERSON_HEADER, type Person } from "./sign.ts";
import { servicesOf } from "./shape.ts";
import type { WebAppRow } from "./store.ts";

/** The tiers a web app may ask for (Max is Hydor's own for hard problems). */
type AiTier = "quick" | "standard" | "best";

export const AI_LIMITS = {
  messages: 200,
  /** Characters in all the messages. */
  chars: 400_000,
  /** Characters in one message. */
  messageChars: 200_000,
  tools: 40,
  /** Characters of a tool's description, and of a schema. */
  descriptionChars: 2_000,
  schemaChars: 20_000,
  /** The longest answer asked for, in tokens; and what is asked when the app says nothing. */
  maxOutput: 8_192,
  defaultOutput: 4_096,
  callsPerMinute: 60,
  callsPerPersonMinute: 20,
  atOnce: 4,
  /** Tokens a day for one app, for the models that cost nothing to the owner's money (a plan, this computer) and so never reach the cap. */
  tokensPerDay: 5_000_000,
};

const limiter = new Limiter(Date.now, "web-ai");
/** Forgets the minute's calls (tests). */
export const forgetAiLimits = () => limiter.clear();
const going = new Map<string, number>();

// ---- the log and the day's count -----------------------------------------------------------------------------------------------------

const tables = new WeakSet<DB>();
function aiTables(db: DB) {
  if (tables.has(db)) return;
  db.exec(
    "create table if not exists web_app_ai_calls (id integer primary key autoincrement, web_id text not null, day integer not null, at integer not null, person text not null default '', person_name text not null default '', tier text not null, model text not null default '', input_tokens integer not null default 0, output_tokens integer not null default 0, usd real not null default 0, priced integer not null default 1, status text not null);" +
      "create index if not exists web_app_ai_calls_day on web_app_ai_calls (web_id, day);",
  );
  tables.add(db);
}

/** How a call ended: ok, or why it was refused or failed. */
type Status = "ok" | "refused-off" | "refused-tier" | "refused-cap" | "refused-person" | "refused-limit" | "failed" | "stopped";

function record(db: DB, web: string, o: { person?: Person | null; tier: string; model?: string; inputTokens?: number; outputTokens?: number; usd?: number; status: Status }) {
  aiTables(db);
  const now = Date.now();
  db.prepare("insert into web_app_ai_calls (web_id, day, at, person, person_name, tier, model, input_tokens, output_tokens, usd, priced, status) values (?,?,?,?,?,?,?,?,?,?,?,?)").run(
    web,
    dayStart(now),
    now,
    o.person?.id ?? "",
    (o.person?.name ?? "").slice(0, 80),
    o.tier.slice(0, 12),
    (o.model ?? "").slice(0, 120),
    Math.round(o.inputTokens ?? 0),
    Math.round(o.outputTokens ?? 0),
    o.usd ?? 0,
    o.usd === undefined && o.status === "ok" ? 0 : 1,
    o.status,
  );
  if (Math.random() < 0.02) db.prepare("delete from web_app_ai_calls where day < ?").run(dayStart(now - 14 * 24 * 3600_000));
}

/** The moment the day's count starts again: the owner's midnight. */
const nextMidnight = (now = Date.now()) => dayStart(dayStart(now) + 36 * 3600_000);

export interface AiToday {
  usd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  people: number;
  refused: number;
  unpriced: number;
}

/** What the app's model use is today, and for one person when given. */
export function aiToday(db: DB, webId: string, now = Date.now(), person?: string): AiToday {
  aiTables(db);
  const r = db
    .prepare(
      "select coalesce(sum(case when status='ok' then 1 else 0 end),0) as calls, coalesce(sum(usd),0) as usd, coalesce(sum(input_tokens),0) as i, coalesce(sum(output_tokens),0) as o, count(distinct case when person<>'' and status='ok' then person end) as people, coalesce(sum(case when status like 'refused%' then 1 else 0 end),0) as refused, coalesce(sum(case when status='ok' and priced=0 then 1 else 0 end),0) as unpriced from web_app_ai_calls where web_id = ? and day = ?" +
        (person === undefined ? "" : " and person = ?"),
    )
    .get(...(person === undefined ? [webId, dayStart(now)] : [webId, dayStart(now), person])) as { calls: number; usd: number; i: number; o: number; people: number; refused: number; unpriced: number };
  return { usd: r.usd, calls: r.calls, inputTokens: r.i, outputTokens: r.o, people: r.people, refused: r.refused, unpriced: r.unpriced };
}

/** The tiers a web app asks for (services.ai.tiers in its hydor.json), or null when it asks for no model. */
export function aiAsks(web: Pick<WebAppRow, "folder">): AiTier[] | null {
  return servicesOf(web).ai?.tiers ?? null;
}

/** What an agent app of a web app's flows half spent today (it is held to the same daily cap). */
function flowsSpent(db: DB, web: WebAppRow, now: number): number {
  const l = linkOf(db, web.id);
  return l ? usageSince(db, l.app_id, dayStart(now), "api").spent : 0;
}

/** The app's model use as its page and its JSON show it: what it asks for, what the owner allowed, what it has spent today against the cap. null when the app has no ai block. */
export function aiView(db: DB, web: WebAppRow, now = Date.now()): WebAppAi | null {
  const asks = aiAsks(web);
  if (!asks) return null;
  const t = aiToday(db, web.id, now);
  const flows = flowsSpent(db, web, now);
  const cap = web.settings.dailyCapUsd;
  const spent = t.usd + flows;
  const usdPerDay = servicesOf(web).ai?.usdPerDay;
  return {
    asks,
    allowed: asks.filter((x) => web.settings.tiers.includes(x)),
    ...(usdPerDay !== undefined ? { asksUsdPerDay: usdPerDay } : {}),
    capUsd: cap,
    spentUsd: Math.round(spent * 1e6) / 1e6,
    today: { ...t, usd: Math.round(t.usd * 1e6) / 1e6, flowsUsd: Math.round(flows * 1e6) / 1e6 },
    atCap: spent >= cap || t.inputTokens + t.outputTokens >= AI_LIMITS.tokensPerDay,
    until: new Date(nextMidnight(now)).toISOString(),
  };
}

// ---- the request ---------------------------------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const CALL_ID = /^[A-Za-z0-9_.:=-]{1,120}$/;

interface Ask {
  tier: "quick" | "standard" | "best";
  messages: { role: "system" | "user" | "assistant" | "tool"; content: string; toolCalls?: { id: string; name: string; input: Json }[]; toolCallId?: string }[];
  schema?: Json;
  tools: { name: string; description: string; input: Json }[];
  maxOutputTokens: number;
  stream: boolean;
}

const bad = (message: string) => new HttpError(400, message, { kind: "failed" });

/** What the app sent, checked: the app is code an agent wrote, so every field is untrusted until it is. */
function readAsk(body: unknown): Ask {
  if (!isObject(body)) throw bad("The request is one JSON object: { tier, messages }.");
  const tier = body.tier;
  if (tier !== "quick" && tier !== "standard" && tier !== "best") throw bad('tier is "quick", "standard" or "best".');
  if (!Array.isArray(body.messages) || body.messages.length < 1) throw bad("messages is a list of 1 to 200 messages.");
  if (body.messages.length > AI_LIMITS.messages) throw new HttpError(413, `At most ${AI_LIMITS.messages} messages in a call: start a shorter conversation.`, { kind: "too-long" });
  let chars = 0;
  const messages: Ask["messages"] = body.messages.map((raw, i) => {
    if (!isObject(raw)) throw bad(`Message ${i + 1} is not a message.`);
    const role = raw.role;
    if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") throw bad(`Message ${i + 1}: role is system, user, assistant or tool.`);
    const content = raw.content === undefined && role === "assistant" ? "" : raw.content;
    if (typeof content !== "string") throw bad(`Message ${i + 1}: content is text.`);
    if (content.length > AI_LIMITS.messageChars) throw new HttpError(413, `Message ${i + 1} is longer than ${AI_LIMITS.messageChars.toLocaleString("en")} characters.`, { kind: "too-long" });
    chars += content.length;
    const m: Ask["messages"][number] = { role, content };
    if (raw.toolCalls !== undefined) {
      if (role !== "assistant" || !Array.isArray(raw.toolCalls) || raw.toolCalls.length > 32) throw bad(`Message ${i + 1}: only an assistant message has toolCalls, at most 32.`);
      m.toolCalls = raw.toolCalls.map((c) => {
        if (!isObject(c) || typeof c.id !== "string" || !CALL_ID.test(c.id) || typeof c.name !== "string" || !TOOL_NAME.test(c.name)) throw bad(`Message ${i + 1}: a tool call needs an id and a name.`);
        const input = isObject(c.input) ? c.input : {};
        chars += JSON.stringify(input).length;
        return { id: c.id, name: c.name, input };
      });
    }
    if (role === "tool") {
      if (typeof raw.toolCallId !== "string" || !CALL_ID.test(raw.toolCallId)) throw bad(`Message ${i + 1}: a tool message says which call it answers (toolCallId).`);
      m.toolCallId = raw.toolCallId;
    }
    return m;
  });
  if (chars > AI_LIMITS.chars) throw new HttpError(413, "That is too long for the model: shorten the question, or start a new conversation.", { kind: "too-long" });
  if (messages[messages.length - 1].role === "assistant" && !messages[messages.length - 1].toolCalls) throw bad("The last message is the model's own: end with a user or tool message.");
  const tools: Ask["tools"] = [];
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools) || body.tools.length > AI_LIMITS.tools) throw bad(`tools is a list of at most ${AI_LIMITS.tools}.`);
    for (const t of body.tools) {
      if (!isObject(t) || typeof t.name !== "string" || !TOOL_NAME.test(t.name) || tools.some((x) => x.name === t.name)) throw bad("Each tool has its own name (letters, digits, _ . -, up to 64).");
      const input = isObject(t.input) ? t.input : { type: "object", properties: {} };
      if (JSON.stringify(input).length > AI_LIMITS.schemaChars) throw new HttpError(413, `A tool's input is described in at most ${AI_LIMITS.schemaChars.toLocaleString("en")} characters.`, { kind: "too-long" });
      tools.push({ name: t.name, description: typeof t.description === "string" ? t.description.slice(0, AI_LIMITS.descriptionChars) : "", input });
    }
  }
  let schema: Json | undefined;
  if (body.schema !== undefined && body.schema !== null) {
    if (!isObject(body.schema)) throw bad("schema is a JSON Schema (an object).");
    if (JSON.stringify(body.schema).length > AI_LIMITS.schemaChars) throw new HttpError(413, `A schema is at most ${AI_LIMITS.schemaChars.toLocaleString("en")} characters.`, { kind: "too-long" });
    schema = body.schema;
  }
  if (schema && tools.length) throw bad("Ask for tools or for an answer that fits a schema, not both in one call.");
  const out = body.maxOutputTokens;
  if (out !== undefined && (typeof out !== "number" || !Number.isFinite(out) || out < 1)) throw bad("maxOutputTokens is a number of tokens, 1 or more.");
  if (body.stream !== undefined && typeof body.stream !== "boolean") throw bad("stream is true or false.");
  return { tier, messages, ...(schema ? { schema } : {}), tools, maxOutputTokens: Math.min(AI_LIMITS.maxOutput, Math.floor((out as number | undefined) ?? AI_LIMITS.defaultOutput)), stream: body.stream === true };
}

// ---- a schema, in the small ---------------------------------------------------------------------------------------------------------

/** What is wrong with a value against the part of JSON Schema an answer is asked in (type, properties, required, items, enum, bounds); empty when it fits. */
export function misfits(schema: unknown, value: unknown, at = "the answer", depth = 0): string[] {
  if (!isObject(schema) || depth > 12) return [];
  const out: string[] = [];
  const types = schema.type === undefined ? null : Array.isArray(schema.type) ? schema.type : [schema.type];
  const kind = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  if (types && !types.some((t) => t === kind(value) || (t === "number" && typeof value === "number") || (t === "integer" && Number.isInteger(value)))) return [`${at} should be ${types.join(" or ")}`];
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) out.push(`${at} should be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) out.push(`${at} should be at least ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum) out.push(`${at} should be at most ${schema.maximum}`);
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) out.push(`${at} is too short`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) out.push(`${at} is too long`);
  }
  if (isObject(value)) {
    for (const r of Array.isArray(schema.required) ? schema.required : []) if (typeof r === "string" && !(r in value)) out.push(`${at} needs "${r}"`);
    if (isObject(schema.properties)) for (const [k, s] of Object.entries(schema.properties)) if (k in value) out.push(...misfits(s, value[k], `"${k}"`, depth + 1));
    if (schema.additionalProperties === false && isObject(schema.properties)) for (const k of Object.keys(value)) if (!(k in (schema.properties as Json))) out.push(`${at} has "${k}", which is not asked for`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) out.push(`${at} needs at least ${schema.minItems} items`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) out.push(`${at} takes at most ${schema.maxItems} items`);
    if (schema.items) value.slice(0, 200).forEach((v, i) => out.push(...misfits(schema.items, v, `${at}[${i}]`, depth + 1)));
  }
  return out.slice(0, 8);
}

/** The first JSON value in a model's text (it may wrap it in a fence or a sentence). */
function jsonIn(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {}
  const i = t.search(/[{[]/);
  const j = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (i < 0 || j <= i) return undefined;
  try {
    return JSON.parse(t.slice(i, j + 1));
  } catch {
    return undefined;
  }
}

// ---- which model --------------------------------------------------------------------------------------------------------------------

type ModelPick = { how: "custom"; id: string } | { how: "auto" };

/** The model a tier means: Custom's pick for it, else the helper model when that is one of Custom's, else Automatic. */
export function pickFor(db: DB, tier: Ask["tier"]): ModelPick {
  const pick = tiersOf(db).console[tier]?.model;
  if (pick && customModel(pick)) return { how: "custom", id: pick };
  const helperId = helperModelId(db);
  if (helperId !== "auto" && customModel(helperId)) return { how: "custom", id: helperId };
  return { how: "auto" };
}

const sentence = (e: unknown) => ((e as Error)?.message ?? "").replace(/\s+/g, " ").slice(0, 200);

/** What a model's failure is, in an answer the app may show: a status, a kind and a sentence that says nothing of Hydor's insides. */
function failure(e: unknown): HttpError {
  if (e instanceof HttpError && e.extra?.kind) return e;
  if (e instanceof ContextOverflow) return new HttpError(413, "That is too long for the model: shorten the question, or start a new conversation.", { kind: "too-long" });
  if (e instanceof ToolsUnsupported) return new HttpError(403, "The model set up for this is not one that can call tools, so the assistant cannot use the app's functions here.", { kind: "none" });
  const m = sentence(e);
  if (/\b402\b|insufficient|credit|quota|billing/i.test(m)) return new HttpError(402, "The owner has no credit with the model's provider, so there are no answers until they add some.", { kind: "cap" });
  return new HttpError(502, "The model could not answer just now. Try again in a moment.", { kind: "busy" });
}

// ---- the answer ---------------------------------------------------------------------------------------------------------------------

interface Answer {
  text: string;
  data?: unknown;
  toolCalls: { id: string; name: string; input: Json }[];
  stop: "end" | "tools" | "length" | "refused";
  model: string;
  usage: { inputTokens: number; outputTokens: number; usd?: number };
}

const toChat = (ask: Ask, extraSystem?: string): ChatMessage[] => {
  const out: ChatMessage[] = ask.messages.map((m) => {
    if (m.role === "tool") return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
    if (m.role === "assistant" && m.toolCalls?.length)
      return { role: "assistant", content: m.content || null, tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })) };
    return { role: m.role, content: m.content };
  });
  if (extraSystem) {
    const first = out.findIndex((m) => m.role === "system");
    if (first >= 0) out[first] = { ...out[first], content: `${out[first].content}\n\n${extraSystem}` };
    else out.unshift({ role: "system", content: extraSystem });
  }
  return out;
};

const schemaLine = (schema: Json) => `Answer with one JSON value that fits this JSON Schema, and nothing else (no Markdown fence, no words around it):\n${JSON.stringify(schema)}`;
const guess = (chars: number) => Math.ceil(chars / 4);

/** One turn with the model for a tier. `onText` is called with pieces as they are written (not for an answer to fit a schema, which is whole or nothing). */
async function turn(db: DB, ask: Ask, signal: AbortSignal, onText: (t: string) => void): Promise<Answer> {
  const pick = pickFor(db, ask.tier);
  const tools: ToolSchema[] = ask.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input } }));
  if (pick.how === "custom") {
    const model = customModel(pick.id)!;
    const run = (messages: ChatMessage[], piece: (t: string) => void) => helperChat(db, { model: pick.id, messages, tools: tools.length ? tools : undefined, maxTokens: ask.maxOutputTokens, signal, onText: piece });
    if (!ask.schema) {
      const r = await run(toChat(ask), onText);
      const names = new Set(ask.tools.map((t) => t.name));
      // What the model asks for is only what the app named: anything else is dropped (the model's words are as untrusted as the app's).
      const toolCalls = r.calls.filter((c) => names.has(c.name)).map((c) => ({ id: c.id.replace(/[^A-Za-z0-9_.:=-]/g, "_").slice(0, 120) || "call", name: c.name, input: (() => (isObject(jsonIn(c.arguments)) ? (jsonIn(c.arguments) as Json) : {}))() }));
      const stop = toolCalls.length ? "tools" : r.finish === "length" ? "length" : r.finish === "content_filter" ? "refused" : "end";
      return { text: r.text, toolCalls, stop, model: model.model, usage: r.usage };
    }
    // An answer to fit a schema: asked in words, read, checked; once more with what was wrong when it does not fit.
    let r = await run(toChat(ask, schemaLine(ask.schema)), () => {});
    let usage = r.usage;
    let value = jsonIn(r.text);
    let wrong = value === undefined ? ["it was not JSON"] : misfits(ask.schema, value);
    if (wrong.length) {
      const again = toChat(ask, schemaLine(ask.schema));
      again.push({ role: "assistant", content: r.text }, { role: "user", content: `That did not fit:\n${wrong.map((w) => `- ${w}`).join("\n")}\nAnswer again with the whole JSON value.` });
      r = await run(again, () => {});
      usage = { inputTokens: usage.inputTokens + r.usage.inputTokens, outputTokens: usage.outputTokens + r.usage.outputTokens, ...(usage.usd !== undefined && r.usage.usd !== undefined ? { usd: usage.usd + r.usage.usd } : {}) };
      value = jsonIn(r.text);
      wrong = value === undefined ? ["it was not JSON"] : misfits(ask.schema, value);
    }
    if (wrong.length) throw Object.assign(new HttpError(502, "The model's answer did not fit the shape asked for. Try again.", { kind: "failed" }), { usage });
    return { text: r.text, data: value, toolCalls: [], stop: r.finish === "length" ? "length" : "end", model: model.model, usage };
  }
  // Automatic: Claude (Haiku; Sonnet for best) or Codex through their programs, no tools: plain text and an answer to fit a schema, in one piece.
  if (tools.length) throw new HttpError(403, "No model that can call tools is set up for this tier: the owner can pick one in Settings → Models → Tiers.", { kind: "none" });
  const system = [...ask.messages.filter((m) => m.role === "system").map((m) => m.content), ...(ask.schema ? [schemaLine(ask.schema)] : [])].join("\n\n") || "Answer the person.";
  const rest = ask.messages.filter((m) => m.role !== "system");
  const prompt = rest.length === 1 && rest[0].role === "user" ? rest[0].content : rest.map((m) => `${m.role === "user" ? "Person" : m.role === "assistant" ? "You" : "Result"}: ${m.content}`).join("\n\n") + "\n\nYou:";
  const run = (p: string) => helper(db, { system, prompt: p, strong: ask.tier === "best", timeoutMs: 120_000, signal, task: "answering a web app" });
  let text = await run(prompt);
  let input = guess(system.length + prompt.length);
  let output = guess(text.length);
  let value: unknown;
  if (ask.schema) {
    value = jsonIn(text);
    let wrong = value === undefined ? ["it was not JSON"] : misfits(ask.schema, value);
    if (wrong.length) {
      const p = `${prompt}\n\n---\nYour last answer did not fit:\n${wrong.map((w) => `- ${w}`).join("\n")}\nAnswer again with the whole JSON value.`;
      text = await run(p);
      input += guess(system.length + p.length);
      output += guess(text.length);
      value = jsonIn(text);
      wrong = value === undefined ? ["it was not JSON"] : misfits(ask.schema, value);
    }
    if (wrong.length) throw new HttpError(502, "The model's answer did not fit the shape asked for. Try again.", { kind: "failed" });
  } else onText(text);
  return { text, ...(ask.schema ? { data: value } : {}), toolCalls: [], stop: "end", model: ask.tier === "best" ? "automatic (sonnet)" : "automatic", usage: { inputTokens: input, outputTokens: output } };
}

// ---- the route ------------------------------------------------------------------------------------------------------------------

export interface AiContext {
  enabled: () => void;
  /** A web app's secrets (the launched side's too): the person's header is good if any of them signed it. */
  secrets: (webId: string) => string[];
  /** The key's secret (embed.ts). */
  secret: (webId: string) => string;
  /** The web app of a route of the owner's (by its id). */
  own: (req: { params: unknown }) => WebAppRow;
  /** Tells the pages something about a web app changed. */
  changed: () => void;
}

/** The person a header names, proven; null when there is none. Throws the refusal when there is one that is not good. */
function personOf(web: WebAppRow, header: unknown, secrets: string[]): Person | null {
  if (header === undefined || header === "") return null;
  let first: ReturnType<typeof verifyPerson> | null = null;
  for (const secret of secrets) {
    const c = verifyPerson(header, secret, PERSON_GRACE_SECONDS);
    if (c.ok) return c.person;
    first ??= c;
    if (c.why === "expired") first = c;
  }
  if (first && !first.ok && first.why === "expired") throw new HttpError(401, "That sign-in has run out: open the app from Hydor again.", { kind: "key" });
  throw new HttpError(403, `That ${PERSON_HEADER} header is not one Hydor signed for this app, so the answer is refused.`, { kind: "none" });
}

export function aiRoutes(d: Deps, ctx: AiContext) {
  const { app, db } = d;
  aiTables(db);

  app.post("/api/apps/:slug/ai", { bodyLimit: 3 * 1024 * 1024 }, async (req: FastifyRequest, reply: FastifyReply) => {
    ctx.enabled();
    const web = webCaller({ db, secret: ctx.secret }, req, "models");
    const asked = aiAsks(web);
    if (!asked) throw new HttpError(403, "This web app does not list ai under services in its hydor.json, so Hydor does not answer for it.", { kind: "none" });
    if (!limiter.take(`web:${web.id}`, AI_LIMITS.callsPerMinute, 60_000)) {
      reply.header("retry-after", String(Math.max(1, Math.ceil(limiter.wait(`web:${web.id}`, AI_LIMITS.callsPerMinute, 60_000) / 1000))));
      throw new HttpError(429, `Too many calls: a web app may make ${AI_LIMITS.callsPerMinute} a minute.`, { kind: "busy" });
    }
    const person = personOf(web, req.headers[PERSON_HEADER], ctx.secrets(web.id));
    const ask = readAsk(req.body);
    const log = (o: Omit<Parameters<typeof record>[2], "person" | "tier">) => record(db, web.id, { person, tier: ask.tier, ...o });
    const refuse = (status: Status, error: HttpError) => {
      log({ status });
      ctx.changed();
      return error;
    };
    // Which tiers: what the app says it uses, and what its owner allowed. Neither is a guess: a tier its hydor.json does not list is not asked for by this app.
    if (!asked.includes(ask.tier)) {
      const listed = asked.length ? asked.join(", ") : "none";
      throw refuse("refused-tier", new HttpError(403, `This app has not said it uses the ${ask.tier} tier (services.ai.tiers in its hydor.json lists ${listed}).`, { kind: "none" }));
    }
    if (!web.settings.tiers.includes(ask.tier)) throw refuse("refused-off", new HttpError(403, "The owner has not allowed this app to use their models yet: they can on the app's page in Hydor.", { kind: "none" }));
    if (person && !limiter.take(`person:${web.id}:${person.id}`, AI_LIMITS.callsPerPersonMinute, 60_000)) {
      reply.header("retry-after", "10");
      throw refuse("refused-limit", new HttpError(429, `Too many calls from one person: ${AI_LIMITS.callsPerPersonMinute} a minute.`, { kind: "busy" }));
    }
    const now = Date.now();
    const cap = web.settings.dailyCapUsd;
    const view = aiView(db, web, now)!;
    const capped = (until: string) => {
      reply.header("retry-after", String(Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 1000))));
      const minutes = Math.max(1, Math.round((Date.parse(until) - Date.now()) / 60_000));
      const when = minutes < 90 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `${Math.round(minutes / 60)} hours`;
      return refuse("refused-cap", new HttpError(429, `This app has used what it may spend on models today ($${cap} a day). It can answer again in about ${when}.`, { kind: "cap", until, cap: { usedUsd: view.spentUsd, limitUsd: cap } }));
    };
    if (cap <= 0) throw refuse("refused-cap", new HttpError(403, "The owner has set this app's daily cap to nothing, so it has no model.", { kind: "none" }));
    if (view.atCap) throw capped(view.until);
    if (going.get(web.id)! >= AI_LIMITS.atOnce) {
      reply.header("retry-after", "2");
      throw refuse("refused-limit", new HttpError(429, "The app has several answers going: try again in a moment.", { kind: "busy" }));
    }
    going.set(web.id, (going.get(web.id) ?? 0) + 1);
    const controller = new AbortController();
    const closed = () => controller.abort();
    reply.raw.once("close", () => {
      if (!reply.raw.writableFinished) closed();
    });
    const finish = async (onText: (t: string) => void) => {
      try {
        const a = await turn(db, ask, controller.signal, onText);
        log({ model: a.model, inputTokens: a.usage.inputTokens, outputTokens: a.usage.outputTokens, usd: a.usage.usd, status: "ok" });
        const now2 = aiView(db, web)!;
        return {
          text: a.text,
          ...(a.data !== undefined ? { data: a.data } : {}),
          toolCalls: a.toolCalls,
          stop: a.stop,
          model: a.model,
          usage: { inputTokens: a.usage.inputTokens, outputTokens: a.usage.outputTokens, ...(a.usage.usd !== undefined ? { usd: Math.round(a.usage.usd * 1e6) / 1e6 } : {}) },
          cap: { usedUsd: now2.spentUsd, limitUsd: cap },
        };
      } catch (e) {
        const stopped = controller.signal.aborted;
        const usage = (e as { usage?: { inputTokens: number; outputTokens: number; usd?: number } }).usage;
        log({ ...(usage ?? {}), status: stopped ? "stopped" : "failed" });
        // The reason is Hydor's to read (the owner's log), never the app's: what the app gets is a sentence made for it.
        if (!stopped && !(e instanceof HttpError && e.extra?.kind)) app.log.warn({ app: web.id, tier: ask.tier, why: sentence(e) }, "a web app's model call failed");
        throw failure(e);
      } finally {
        going.set(web.id, Math.max(0, (going.get(web.id) ?? 1) - 1));
        ctx.changed();
      }
    };
    reply.header("cache-control", "no-store");
    if (!ask.stream) return finish(() => {});
    reply.hijack();
    const out = reply.raw;
    out.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" });
    const send = (event: string, data: unknown) => {
      if (!out.destroyed && !out.writableEnded) out.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const ping = setInterval(() => !out.destroyed && !out.writableEnded && out.write(": keep-alive\n\n"), 15_000);
    try {
      send("done", await finish((text) => text && send("text", { text })));
    } catch (e) {
      const h = e instanceof HttpError ? e : failure(e);
      send("error", { error: h.message, ...(h.extra?.kind ? { kind: h.extra.kind } : {}), ...(h.extra?.until ? { until: h.extra.until } : {}) });
    } finally {
      clearInterval(ping);
      if (!out.destroyed && !out.writableEnded) out.end();
    }
  });

  /** What the owner sees of an app's model use: today's count with the people, and the last calls (no words of any). */
  app.get("/api/webapps/:id/ai", async (req) => {
    ctx.enabled();
    const web = ctx.own(req);
    const view = aiView(db, web);
    if (!view) throw new HttpError(404, "This web app asks for no model.");
    const people = db
      .prepare("select person as id, max(person_name) as name, count(*) as calls, sum(usd) as usd, sum(input_tokens + output_tokens) as tokens from web_app_ai_calls where web_id = ? and day = ? and status = 'ok' and person <> '' group by person order by usd desc, calls desc limit 20")
      .all(web.id, dayStart()) as { id: string; name: string; calls: number; usd: number; tokens: number }[];
    const recent = db
      .prepare("select at, person, tier, model, input_tokens as inputTokens, output_tokens as outputTokens, usd, status from web_app_ai_calls where web_id = ? order by id desc limit 30")
      .all(web.id) as { at: number; person: string; tier: string; model: string; inputTokens: number; outputTokens: number; usd: number; status: string }[];
    return { ai: view, people, recent };
  });
}
