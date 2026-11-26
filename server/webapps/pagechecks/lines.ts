// The lines: what the visits and the probes saw, judged, each in a sentence for a person who does not code, with what to do.
import { cookiePairs, type Budget, kb, overBudget, parseSetCookie, type CrossSite, type Weight, weigh, isDevPart, isSignInPath, judgeTaps, type SmallTap, TAP_LEAST, TAP_MIN, TEXT_MIN, PHONE_WIDTH } from "./measure.ts";
import type { Found, PageSeen } from "./visit.ts";

export type LineState = "passed" | "failed" | "notRun" | "note";
export type LineGroup = "phone" | "reading" | "weight" | "safety" | "broken";

/** Ids do not change once the pages show them: add new ones at the end of their group. */
export const LINES = [
  ["phone-sideways", "phone", "Nothing scrolls sideways on a phone"],
  ["phone-text", "phone", "Text on a phone is big enough to read"],
  ["phone-tap", "phone", "Nothing to tap is too small"],
  ["phone-hidden", "phone", "Nothing is hidden behind a fixed bar"],
  ["contrast", "reading", "Text stands out from what is behind it"],
  ["page-title", "reading", "Every page has a title of its own"],
  ["page-description", "reading", "Every public page has a description"],
  ["page-language", "reading", "Every page says its language"],
  ["main-heading", "reading", "Every page has one main heading"],
  ["heading-order", "reading", "Headings are in order"],
  ["picture-words", "reading", "Pictures have words for people who cannot see them"],
  ["field-labels", "reading", "Every field has a label"],
  ["control-names", "reading", "Every button and link has a name"],
  ["focus-visible", "reading", "The keyboard shows where it is"],
  ["mouse-only", "reading", "Nothing needs a mouse"],
  ["weight-first", "weight", "The first page is light to open"],
  ["weight-inner", "weight", "A typical inner page is light to open"],
  ["other-sites", "weight", "Nothing comes from other sites"],
  ["slowest", "weight", "The slowest things"],
  ["browser-keys", "safety", "No key reaches a browser"],
  ["dev-parts", "safety", "Nothing only for making the app is served"],
  ["headers", "safety", "The safety headers are sent"],
  ["cross-site-forms", "safety", "Another site's form cannot change anything"],
  ["cookie-flags", "safety", "The sign-in cookie is protected"],
  ["pages-answer", "broken", "Every page answers"],
  ["links", "broken", "Links lead somewhere"],
  ["console-errors", "broken", "No errors in the pages"],
  ["pictures-load", "broken", "Pictures load"],
] as const;
export type LineId = (typeof LINES)[number][0];
export const LINE_IDS: LineId[] = LINES.map((l) => l[0]);

export interface Item {
  page: string;
  signedIn?: boolean;
  /** The thing on it. */
  thing: string;
}

export interface PageLine {
  id: LineId;
  group: LineGroup;
  title: string;
  state: LineState;
  text: string;
  hint?: string;
  /** At most three of them, as examples. */
  items?: Item[];
  /** The examples as sentences, each with its page. */
  details?: string[];
  /** How many different things were found, when it counts things. */
  count?: number;
}

export const where = (i: { page: string; signedIn?: boolean }): string => `${i.page}${i.signedIn ? " (signed in)" : ""}`;

/** The most examples a line gives, however many things it counts: every line a person or an agent reads costs them. */
export const EXAMPLES = 3;

/** How many different things, and the first few, each with the pages it is on (the same thing on every page is one thing). */
export function examplesOf(items: Item[], most = EXAMPLES): { count: number; items: Item[]; details: string[] } {
  const by = new Map<string, Item[]>();
  for (const i of items) by.set(i.thing, [...(by.get(i.thing) ?? []), i]);
  const first = [...by].slice(0, most);
  return {
    count: by.size,
    items: first.map(([, at]) => at[0]),
    details: first.map(([thing, at]) => {
      const pages = [...new Set(at.map(where))];
      return `${pages[0]}${pages.length > 1 ? ` and ${pages.length - 1} more ${pages.length === 2 ? "page" : "pages"}` : ""}: ${thing}`;
    }),
  };
}

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function line(id: LineId, state: LineState, text: string, o: { hint?: string; items?: Item[]; details?: string[] } = {}): PageLine {
  const [, group, title] = LINES.find((l) => l[0] === id)!;
  const found = o.items?.length ? examplesOf(o.items) : null;
  const details = o.details?.slice(0, EXAMPLES) ?? found?.details;
  return { id, group, title, state, text, ...(o.hint && state !== "passed" ? { hint: o.hint } : {}), ...(found ? { items: found.items, count: found.count } : {}), ...(details?.length ? { details } : {}) };
}

export interface FormResult {
  page: string;
  signedIn: boolean;
  what: string;
  action: string;
  result: CrossSite;
  status: number;
}

export interface Gathered {
  pages: PageSeen[];
  /** Addresses the caller named: they have to answer. */
  given: Set<string>;
  budgets: { public: Budget; signedIn: Budget };
  signIn: "none" | "given" | "failed";
  links: { checked: number; broken: Item[]; unanswered: number; server: Item[] };
  found: Found[];
  secrets: { looked: number; tooShort: string[]; files: number };
  forms: { tried: FormResult[]; why: string | null; anySignIn: boolean; leftOut: number };
  cookies: { signedInWith: string[]; setCookies: string[]; https: boolean; byHeader: boolean; unknown?: boolean };
  https: boolean;
}

const at = (p: PageSeen, thing: string): Item => ({ page: p.path, signedIn: p.signedIn, thing });

export function judge(g: Gathered): PageLine[] {
  const out: PageLine[] = [];
  const phone = g.pages.filter((p) => p.phone);
  const desk = g.pages.filter((p) => p.desktop);
  const slow = g.pages.filter((p) => p.problem === "slow");
  const unreadWhy = (area: RegExp) => g.pages.flatMap((p) => p.unread.filter((u) => area.test(u)).map((u) => `${where({ page: p.path, signedIn: p.signedIn })}: ${u}`));

  /** A line from what was found on the pages read: passed, failed, or could not be run when no page (or part) was read. */
  const from = (id: LineId, read: PageSeen[], area: RegExp | null, items: Item[], good: (pages: number) => string, bad: (count: number, pages: number) => string, hint: string) => {
    const missed = area ? unreadWhy(area) : [];
    const rest = missed.length || slow.length ? ` ${n(new Set([...missed, ...slow.map((p) => p.path)]).size, "page")} could not be read for this${slow.length ? " (too slow to answer here)" : ""}.` : "";
    // the same thing on every page (a header's link) is one thing
    if (items.length) out.push(line(id, "failed", `${bad(new Set(items.map((i) => i.thing)).size, new Set(items.map(where)).size)}${rest}`, { hint, items }));
    else if (!read.length || (area && missed.length >= read.length))
      out.push(line(id, "notRun", slow.length ? "The pages were too slow to answer here, so nothing was judged." : missed.length ? "This could not be looked at on any page." : "No page could be opened and read.", { details: missed, hint: "Run the checks again when this computer is less busy, and look at the app's own log." }));
    else out.push(line(id, "passed", `${good(read.length)}${rest}`));
  };

  // ---- on a phone
  from("phone-sideways", phone, /phone's layout/, phone.filter((p) => p.phone!.facts.scrollWidth > PHONE_WIDTH + 1).map((p) => {
    const f = p.phone!.facts;
    return at(p, !f.viewportTag ? "the page does not tell a phone to use its own width, so it is drawn as a desktop page, shrunk" : `${f.scrollWidth - PHONE_WIDTH} px wider than the screen${f.wide.length ? ` (${f.wide.slice(0, 2).join("; ")})` : ""}`);
  }), (p) => `None of the ${n(p, "page")} scrolls sideways on a ${PHONE_WIDTH} px phone.`, (_c, p) => `${n(p, "page")} ${p === 1 ? "scrolls" : "scroll"} sideways on a phone.`,
    'Add <meta name="viewport" content="width=device-width, initial-scale=1">, and let wide things (tables, long words, fixed widths) wrap or scroll inside their own box.');

  from("phone-text", phone, /phone's layout/, phone.flatMap((p) => p.phone!.facts.small.map((s) => at(p, `${s.what} is ${s.px} px`))), (p) => `All text on ${n(p, "page")} is at least ${TEXT_MIN} px on a phone.`,
    (_c, p) => `Some text is smaller than ${TEXT_MIN} px on a phone, on ${n(p, "page")}.`, `Use at least ${TEXT_MIN} px for any text, and 16 px for what is read.`);

  // ---- what is tapped: under the standard's minimum and crowded fails; under the comfortable size is only worth a note
  {
    const measured = phone.map((p) => ({ p, ...judgeTaps(p.phone!.taps) }));
    const bySize = (list: (SmallTap & { p: PageSeen })[]) => list.sort((a, b) => Math.min(a.width, a.height) - Math.min(b.width, b.height) || a.width * a.height - b.width * b.height);
    const size = (t: SmallTap) => `${t.what} is ${t.width} × ${t.height} px`;
    const failed = bySize(measured.flatMap((m) => m.failed.map((t) => ({ ...t, p: m.p })))).map((t) => at(t.p, size(t)));
    const small = bySize(measured.flatMap((m) => m.small.map((t) => ({ ...t, p: m.p })))).map((t) => at(t.p, size(t)));
    const things = (items: Item[]) => new Set(items.map((i) => i.thing)).size;
    const comfortable = small.length ? ` ${n(things(small), "more control")} ${things(small) === 1 ? "is" : "are"} under the comfortable ${TAP_MIN} px.` : "";
    const hint = `Make what is tapped at least ${TAP_LEAST} px each way (comfortably ${TAP_MIN} px high), with padding or min-height, or leave more room round it.`;
    if (failed.length)
      from("phone-tap", phone, /what is tapped/, failed, () => "", (c, p) => `${n(c, "control")} on ${n(p, "page")} ${c === 1 ? "is" : "are"} under ${TAP_LEAST} px, the web standard's minimum, and too close to another to hit safely.${comfortable}`, hint);
    else if (small.length) {
      const c = things(small);
      const named = examplesOf(small);
      const smallest = named.items.map((i) => i.thing.replace(" is ", " ").replace(/ px$/, "")).join(", ");
      out.push(line("phone-tap", "note", `${n(c, "control")} on a phone ${c === 1 ? "is" : "are"} smaller than the comfortable ${TAP_MIN} px (none breaks the standard's ${TAP_LEAST} px minimum); ${c > 3 ? "the three smallest" : "namely"}: ${smallest}.`, { hint, items: small }));
    } else from("phone-tap", phone, /what is tapped/, [], (p) => `Everything tapped on ${n(p, "page")} is at least ${TAP_MIN} px where a thumb reaches it.`, () => "", hint);
  }

  from("phone-hidden", phone, /behind fixed/, phone.flatMap((p) => p.phone!.hidden.map((h) => at(p, `${h.what} stays under ${h.by}`))), (p) => `Nothing on ${n(p, "page")} stays covered by a fixed header, bar or box.`,
    (c) => `${n(c, "thing")} on a phone ${c === 1 ? "stays" : "stay"} hidden behind something fixed, however the page is scrolled.`, "Give the page room under a fixed bar (padding as tall as the bar), or let the bar scroll with the page.");

  // ---- reading
  const low = desk.flatMap((p) => (p.desktop!.contrast ?? []).map((c) => at(p, `"${c.words}" in ${c.what}${c.look === "dark" ? " (dark look)" : ""} is ${c.ratio}:1, needs ${c.need}:1 (${c.color} on ${c.behind})`)));
  const dark = desk.some((p) => p.desktop!.hasDark);
  from("contrast", desk.filter((p) => p.desktop!.contrast), /contrast/, low, (p) => `The words on ${n(p, "page")} stand out from what is behind them (${dark ? "in the light and the dark look" : "one look: the pages have no dark one"}).`,
    (c) => `${n(c, "piece")} of text ${c === 1 ? "is" : "are"} hard to read against what is behind ${c === 1 ? "it" : "them"}.`, "Darken the text or lighten what is behind it, until it is 4.5:1 (3:1 for large text).");

  {
    const none = desk.filter((p) => !p.desktop!.reading.title);
    // one title on every page tells nobody which tab, bookmark or search result is which
    const byPath = new Map(desk.map((p) => [p.final.split("?")[0], p]));
    const titles = new Set([...byPath.values()].map((p) => p.desktop!.reading.title));
    if (!none.length && byPath.size > 1 && titles.size === 1)
      out.push(line("page-title", "failed", `All ${byPath.size} pages have the same title, "${[...titles][0].slice(0, 60)}", so tabs, bookmarks and search results cannot be told apart.`, { hint: "Give each page its own <title>, for example the page's name before the app's.", items: [...byPath.values()].map((p) => at(p, `titled "${p.desktop!.reading.title.slice(0, 60)}"`)) }));
    else from("page-title", desk, /words/, none.map((p) => at(p, "no title")), (p) => `Each of ${n(p, "page")} has a title${p > 1 ? ", and they are not all the same" : ""}.`, (_c, p) => `${n(p, "page")} ${p === 1 ? "has" : "have"} no title.`, "Give each page a <title> that says what it is.");
  }
  {
    // public pages: read without signing in, not the doors (sign-in, sign-up) nor the answers a search gives
    const open = desk.filter((p) => !p.signedIn && !p.desktop!.reading.hasPassword && !isSignInPath(p.final.split("?")[0]) && !p.path.includes("?"));
    if (desk.length && !open.length) out.push(line("page-description", "passed", "Nothing to check: no public page was found (only signing in, or pages for signed-in people)."));
    else from("page-description", open, /words/, open.filter((p) => !p.desktop!.reading.description).map((p) => at(p, "no description")), (p) => `Each of ${n(p, "public page")} has a description for search engines and shared links.`,
      (_c, p) => `${n(p, "public page")} ${p === 1 ? "has" : "have"} no description, so search engines and shared links make one up.`, 'Add <meta name="description" content="…"> with a sentence about the page.');
  }
  from("page-language", desk, /words/, desk.filter((p) => !/^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$/i.test(p.desktop!.reading.lang)).map((p) => at(p, p.desktop!.reading.lang ? `lang="${p.desktop!.reading.lang}" is not a language` : "no language named")),
    (p) => `Each of ${n(p, "page")} says its language.`, (c) => `${n(c, "page")} ${c === 1 ? "does" : "do"} not say ${c === 1 ? "its" : "their"} language, so a screen reader may read it in the wrong one.`, 'Put lang on <html>, for example <html lang="en">.');
  from("main-heading", desk, /words/, desk.filter((p) => p.desktop!.reading.mains.length !== 1).map((p) => at(p, p.desktop!.reading.mains.length ? `${p.desktop!.reading.mains.length} main headings (${p.desktop!.reading.mains.slice(0, 3).map((m) => `"${m}"`).join(", ")})` : "no main heading")),
    (p) => `Each of ${n(p, "page")} has one main heading.`, (c) => `${n(c, "page")} ${c === 1 ? "has" : "have"} no main heading, or more than one.`, "Give each page exactly one <h1> that names it.");
  const skipped = desk.flatMap((p) => {
    const levels = p.desktop!.reading.headings;
    return levels.flatMap((x, i) => (i && x.level > levels[i - 1].level + 1 ? [at(p, `an h${x.level} ("${x.words}") follows an h${levels[i - 1].level}`)] : []));
  });
  from("heading-order", desk, /words/, skipped, (p) => `The headings of ${n(p, "page")} skip no level.`, (c, p) => `${n(c, "heading")} on ${n(p, "page")} ${c === 1 ? "skips" : "skip"} a level, so someone moving by headings loses the outline.`,
    "Use heading levels one after another (an h2 under the h1, an h3 under an h2); choose the level by the outline, not the size.");
  from("picture-words", desk, /words/, desk.flatMap((p) => p.desktop!.reading.noAlt.map((w) => at(p, w))), (p) => `Every picture on ${n(p, "page")} has words, or is marked as decoration.`,
    (c) => `${n(c, "picture")} ${c === 1 ? "has" : "have"} no words for someone who cannot see ${c === 1 ? "it" : "them"}.`, 'Give each picture an alt that says what it shows, or alt="" when it only decorates.');
  from("field-labels", desk, /words/, desk.flatMap((p) => p.desktop!.reading.unlabelled.map((w) => at(p, w))), (p) => `Every field on ${n(p, "page")} has a label.`,
    (c) => `${n(c, "field")} ${c === 1 ? "has" : "have"} no label (words inside the box that vanish when you type do not count).`, 'Put a <label for="…"> beside each field (or aria-label).');
  from("control-names", desk, /words/, desk.flatMap((p) => p.desktop!.reading.unnamed.map((w) => at(p, w))), (p) => `Every button and link on ${n(p, "page")} has a name.`,
    (c) => `${n(c, "button or link", "buttons or links")} ${c === 1 ? "has" : "have"} no name a screen reader could say.`, "Give an icon button an aria-label, and a link some words.");

  const keyed = desk.filter((p) => p.desktop!.focus);
  const faint = keyed.flatMap((p) => p.desktop!.focus!.faint.map((w) => at(p, `only a faint mark on ${w}`)));
  if (faint.length && !keyed.some((p) => p.desktop!.focus!.missing.length || p.desktop!.focus!.trap)) {
    const c = new Set(faint.map((i) => i.thing)).size;
    out.push(line("focus-visible", "note", `Moving with the keyboard, ${n(c, "control shows", "controls show")} where you are only faintly (under the 3:1 the standard asks of a mark): ${examplesOf(faint).items.map((i) => i.thing.replace("only a faint mark on ", "")).join(", ")}.`, { hint: "Give :focus-visible an outline in a colour that stands out from what is around it.", items: faint }));
  } else from("focus-visible", keyed, /keyboard/, keyed.flatMap((p) => [...p.desktop!.focus!.missing.map((w) => at(p, `no mark when the keyboard is on ${w}`)), ...(p.desktop!.focus!.trap ? [at(p, `the Tab key does not get past ${p.desktop!.focus!.trap}`)] : [])]),
    (p) => `Moving with the Tab key through ${n(p, "page")}, the control it is on can be seen.`, (c) => `Moving with the keyboard, ${n(c, "control gives", "controls give")} no sign of where you are, or holds you there.`,
    "Do not remove the outline; give :focus-visible a clear one (outline: 3px solid …).");

  const moused = desk.filter((p) => p.desktop!.mouse);
  from("mouse-only", moused, /only a mouse/, moused.flatMap((p) => p.desktop!.mouse!.map((w) => at(p, `${w} answers a click but not the keyboard`))), (p) => `Nothing found on ${n(p, "page")} that only a mouse can press.`,
    (c) => `${n(c, "thing")} can be pressed with a mouse but not reached with the keyboard.`, "Use a <button> (or an <a href>) for anything that is pressed.");

  // ---- weight
  const heavy = (p: PageSeen) => [...p.phone!.downloads].sort((a, b) => b.size - a.size).slice(0, EXAMPLES).map((d) => `${kb(d.size)}  ${d.url}`);
  const weighed = new Map<PageSeen, Weight>(phone.map((p) => [p, weigh(p.phone!.downloads)]));
  const said = (p: PageSeen, w: Weight) => `A first visit to ${where({ page: p.path, signedIn: p.signedIn })} downloads ${kb(w.total)} after compression, in ${n(w.requests, "request")} (scripts ${kb(w.scripts)}, pictures ${kb(w.pictures)}, fonts ${kb(w.fonts)})`;
  const weightLine = (id: "weight-first" | "weight-inner", p: PageSeen | undefined, none: string) => {
    if (!p) return void out.push(line(id, phone.length ? "passed" : "notRun", phone.length ? none : "No page could be opened and weighed.", { hint: "Make sure the app is running and its pages answer." }));
    const w = weighed.get(p)!;
    const budget = p.signedIn ? g.budgets.signedIn : g.budgets.public;
    const over = overBudget(w, budget);
    const bare = w.wire > w.total * 1.3 && w.wire - w.total > 20_000 ? ` The app sends it uncompressed (${kb(w.wire)} on the wire): turn compression on, or leave it to the host.` : "";
    if (over.length) out.push(line(id, "failed", `${said(p, w)}: ${over.join("; ")}.${bare}`, { hint: "Leave out what this page does not need: make pictures smaller, drop scripts and fonts it does not use.", items: [{ page: p.path, signedIn: p.signedIn, thing: `heaviest: ${heavy(p)[0]}` }], details: heavy(p) }));
    else out.push(line(id, "passed", `${said(p, w)}; the budget for ${p.signedIn ? "a signed-in page" : "a public page"} is ${kb(budget.total)}.${bare}`, { details: heavy(p) }));
  };
  const first = phone.find((p) => !p.signedIn) ?? phone[0];
  weightLine("weight-first", first, "");
  // the typical inner page: the middle one by weight, of the signed-in pages when there are some
  const rest = phone.filter((p) => p !== first && p.path !== first?.path);
  const pool = rest.some((p) => p.signedIn) ? rest.filter((p) => p.signedIn) : rest;
  const sorted = [...pool].sort((a, b) => weighed.get(a)!.total - weighed.get(b)!.total);
  weightLine("weight-inner", sorted[Math.floor((sorted.length - 1) / 2)], "The app has one page, weighed above.");

  const others = g.pages.flatMap((p) => p.fetched.filter((f) => f.other).map((f) => ({ p, f })));
  if (!phone.length && !others.length) out.push(line("other-sites", "notRun", "No page could be opened."));
  else if (!others.length) out.push(line("other-sites", "passed", "Everything the pages load comes from the app itself."));
  else {
    const kinds: Record<string, string> = { scripts: "a script", styles: "a style sheet", fonts: "a font", pictures: "a picture", page: "a frame", other: "a request" };
    const items = others.map(({ p, f }) => at(p, `${kinds[f.kind]} from ${f.url}`));
    const code = others.some(({ f }) => f.kind !== "pictures" && f.type !== "Media");
    const hosts = [...new Set(others.map(({ f }) => f.url.replace(/^(\w+:\/\/[^/]+).*/, "$1")))];
    out.push(line("other-sites", code ? "failed" : "note", `The pages fetch from ${hosts.slice(0, 3).join(", ")}${hosts.length > 3 ? ` and ${hosts.length - 3} more` : ""}${code ? ": each such site learns who visits, and the page breaks or changes when it does" : " (pictures only): each such site learns who visits"}.`, { hint: "Keep fonts, scripts and style sheets in the app and serve them from it.", items }));
  }

  const slowest = phone.flatMap((p) => p.phone!.downloads.filter((d) => d.ms !== null).map((d) => ({ p, d }))).sort((a, b) => b.d.ms! - a.d.ms!);
  const named = [...new Map(slowest.map((s) => [s.d.url, s])).values()].slice(0, EXAMPLES);
  out.push(named.length ? line("slowest", "passed", `The slowest to arrive was ${named[0].d.url} (${(named[0].d.ms! / 1000).toFixed(1)} s here). For information: it depends on this computer, so it never fails.`, { details: named.map((s) => `${(s.d.ms! / 1000).toFixed(2)} s  ${s.d.url}`) }) : line("slowest", "notRun", "No page could be opened."));

  // ---- safety
  const short = g.secrets.tooShort.length ? ` ${g.secrets.tooShort.join(", ")} ${g.secrets.tooShort.length === 1 ? "is" : "are"} too short to look for.` : "";
  if (g.found.length) {
    const held = new Set(g.found.filter((f) => !f.read).map((f) => f.name)).size;
    const read = new Set(g.found.filter((f) => f.read).map((f) => f.name)).size;
    const said = held ? `${n(held, "key")} of the app's environment can be read by anyone with a browser.` : `A script the browser gets reads ${n(read, "key")} of the app's environment by name: the value is in it as soon as a build is given one.`;
    out.push(line("browser-keys", "failed", said, { hint: "Keep keys on the server: use them there and send the browser only the result. A key that has been in a page has been public: change it.", items: [...g.found].sort((a, b) => Number(a.read ?? false) - Number(b.read ?? false)).map((f) => ({ page: f.file, thing: `${f.read ? "reads" : "holds"} ${f.name}` })) }));
  }
  else if (!g.secrets.looked) out.push(line("browser-keys", g.secrets.tooShort.length ? "notRun" : "passed", g.secrets.tooShort.length ? `No key was long enough to look for.${short}` : "The app was given no key, so there is none to find."));
  else if (!g.secrets.files) out.push(line("browser-keys", "notRun", "No file of the app's was read."));
  else out.push(line("browser-keys", "passed", `Looked for ${n(g.secrets.looked, "value")} in ${n(g.secrets.files, "file")} a browser gets: none is there.${short}`));

  const dev = g.pages.flatMap((p) => p.fetched.filter((f) => isDevPart(f.url)).map((f) => at(p, `loads ${f.url}`)));
  if (dev.length) out.push(line("dev-parts", "failed", "The pages load parts of a development server (live reloading), which have no place in an app people use.", { hint: "Start the app the way it runs for people (its production build and start), not the development command.", items: dev }));
  else if (!g.pages.some((p) => p.fetched.length)) out.push(line("dev-parts", "notRun", "No page could be opened.", { hint: "Make sure the app is running and its pages answer." }));
  else out.push(line("dev-parts", "passed", "No page loads a development server's live reloading."));

  const answered = g.pages.filter((p) => p.html && p.status !== null && p.status < 400);
  if (!answered.length) out.push(line("headers", "notRun", "No page answered."));
  else {
    const missing: Item[] = [];
    for (const p of answered) {
      const h = p.headers;
      if (!/nosniff/i.test(h["x-content-type-options"] ?? "")) missing.push(at(p, "no X-Content-Type-Options: nosniff"));
      if (!h["referrer-policy"] && !p.desktop?.reading.referrerMeta) missing.push(at(p, "no Referrer-Policy"));
      if (!h["x-frame-options"] && !/frame-ancestors/i.test(h["content-security-policy"] ?? "")) missing.push(at(p, "no frame policy (X-Frame-Options, or frame-ancestors in Content-Security-Policy)"));
      if (g.https && !h["strict-transport-security"]) missing.push(at(p, "no Strict-Transport-Security"));
    }
    if (missing.length) out.push(line("headers", "note", `Some headers that protect visitors are not sent (${[...new Set(missing.map((m) => m.thing.replace(/^no /, "").replace(/ \(.*$/, "").replace(": nosniff", "")))].join(", ")}). Worth adding; nothing is broken without them.`, { hint: "Send X-Content-Type-Options: nosniff, Referrer-Policy: same-origin, X-Frame-Options: DENY (and Strict-Transport-Security over https) on every answer.", items: missing }));
    else out.push(line("headers", "passed", `The pages send nosniff, a referrer policy and a frame policy${g.https ? " and HSTS" : ""}.`));
  }

  const f = g.forms;
  const through = f.tried.filter((t) => t.result === "accepted");
  const unclear = f.tried.filter((t) => t.result === "unclear");
  const formItem = (t: FormResult): Item => ({ page: t.page, signedIn: t.signedIn, thing: `${t.what} (POST ${t.action}) was answered ${t.status} when it said it came from another site` });
  if (through.length) out.push(line("cross-site-forms", "failed", `${n(through.length, "form")} that ${through.length === 1 ? "changes" : "change"} something also ${through.length === 1 ? "works" : "work"} when another site posts ${through.length === 1 ? "it" : "them"}: a page elsewhere could act as someone signed in here.`, { hint: "Refuse any POST, PUT, PATCH or DELETE whose Sec-Fetch-Site is cross-site, or whose Origin is not the app's own (or use a token per session); and set the sign-in cookie SameSite=Lax.", items: through.map(formItem) }));
  else if (!f.anySignIn) out.push(line("cross-site-forms", "passed", "Nothing signs anyone in, so there is no one another site could act as."));
  else if (f.why) out.push(line("cross-site-forms", "notRun", f.why, { hint: "Give the check a way to sign in, and a copy of the app whose data nobody needs." }));
  else if (!f.tried.length) out.push(line("cross-site-forms", "notRun", `No form that posts to the app was found to try${f.leftOut ? ` (${n(f.leftOut, "form")} for signing in or out, passwords or deleting left alone)` : ""}. Changes made by scripts are not tried.`, { hint: "Check by hand that the app refuses a change that comes from another site." }));
  else if (unclear.length === f.tried.length) out.push(line("cross-site-forms", "notRun", "The app did not accept the made-up words from its own pages either, so nothing can be said.", { items: unclear.map(formItem) }));
  else out.push(line("cross-site-forms", "passed", `${n(f.tried.length - unclear.length, "form")} posted as another site would ${f.tried.length - unclear.length === 1 ? "was" : "were"} refused.${unclear.length ? ` ${unclear.length} could not be judged.` : ""}`));

  const c = g.cookies;
  const names = new Set(c.signedInWith.flatMap((s) => cookiePairs(s)).map((p) => p.name).filter((x) => !/csrf|xsrf/i.test(x)));
  const set = c.setCookies.map(parseSetCookie).filter((x) => x !== null && !x.gone && names.has(x.name));
  if (c.unknown) out.push(line("cookie-flags", "notRun", "The app asks people to sign in and no way to sign in was given, so its cookie was not seen."));
  else if (!names.size) out.push(line("cookie-flags", "passed", c.byHeader ? "People are signed in by a header from the host, not a cookie of the app's." : "Nothing signs anyone in with a cookie."));
  else if (!set.length) out.push(line("cookie-flags", "notRun", "How the sign-in cookie is set was not seen (the answer that set it was not given to the check)."));
  else {
    const bad: string[] = [];
    for (const k of set) {
      if (!k!.httpOnly) bad.push(`${k!.name} is not HttpOnly (a script on the page can read it)`);
      if (!k!.sameSite) bad.push(`${k!.name} has no SameSite (other sites' requests may carry it)`);
      else if (k!.sameSite === "none") bad.push(`${k!.name} is SameSite=None (other sites' requests carry it)`);
      if (c.https && !k!.secure) bad.push(`${k!.name} is not Secure (it can be sent without encryption)`);
    }
    const items = [...new Set(bad)].map((thing) => ({ page: "signing in", thing }));
    if (items.length) out.push(line("cookie-flags", "failed", `The cookie that signs people in is not protected: ${[...new Set(bad)].join("; ")}.`, { hint: "Set it with HttpOnly; SameSite=Lax (and Secure over https).", items }));
    else out.push(line("cookie-flags", "passed", `The sign-in cookie (${[...names].join(", ")}) is HttpOnly and SameSite.`));
  }

  // ---- broken things
  const answer: Item[] = [];
  for (const p of g.pages) {
    if (p.status !== null && p.status >= 500) answer.push(at(p, `answered ${p.status}`));
    else if (p.problem && p.problem !== "slow") answer.push(at(p, `did not answer (${p.problem})`));
    else if (g.given.has(`${p.signedIn}${p.path}`) && p.status !== null && p.status >= 400) answer.push(at(p, `answered ${p.status}`));
    for (const f of p.fetched) if (!f.other && f.status >= 500 && f.url !== p.path) answer.push(at(p, `${f.url} answered ${f.status}`));
  }
  answer.push(...g.links.server);
  const reached = g.pages.filter((p) => p.status !== null);
  if (answer.length) out.push(line("pages-answer", "failed", `${n(new Set(answer.map((a) => a.thing + a.page)).size, "address", "addresses")} did not answer, or answered with an error of the app's own.`, { hint: "Open each address and read the app's log: the program failed while answering.", items: answer }));
  else if (g.signIn === "failed") out.push(line("pages-answer", "notRun", "The sign-in given did not take, so the signed-in pages were not looked at. The pages seen without it answered."));
  else if (!reached.length) out.push(line("pages-answer", "notRun", slow.length ? "The pages were too slow to answer here." : "No page was asked."));
  else out.push(line("pages-answer", "passed", `Each of ${n(reached.length, "page")} answered.${slow.length ? ` ${n(slow.length, "page")} ${slow.length === 1 ? "was" : "were"} too slow to read.` : ""}`));

  const broken = [...g.links.broken];
  for (const p of desk) for (const id of p.desktop!.reading.missingTargets) broken.push(at(p, `a link to #${id}, which is not on the page`));
  for (const p of g.pages) for (const f of p.fetched) if (!f.other && f.status >= 400 && f.status < 500 && (f.kind === "scripts" || f.kind === "styles" || f.kind === "fonts")) broken.push(at(p, `the page asks for ${f.url}, which answers ${f.status}`));
  const dead = new Set(broken.map((b) => b.thing)).size;
  if (broken.length) out.push(line("links", "failed", `${n(dead, "link or file", "links or files")} ${dead === 1 ? "leads" : "lead"} nowhere.`, { hint: "Fix the address, or make the page or file it points to.", items: broken }));
  else if (!g.links.checked && !desk.length) out.push(line("links", "notRun", "No page could be read, so no link was followed."));
  else out.push(line("links", "passed", `${g.links.checked ? `All ${n(g.links.checked, "address", "addresses")} the pages link to lead somewhere` : "The pages link nowhere else in the app"}.${g.links.unanswered ? ` ${g.links.unanswered} did not answer in time.` : ""}`));

  from("console-errors", phone, null, phone.flatMap((p) => p.phone!.errors.slice(0, 6).map((e) => at(p, e.slice(0, 200)))), (p) => `No errors in the browser's console on ${n(p, "page")}.`,
    (_c, p) => `The browser reports errors on ${n(p, "page")}.`, "Open the page with the browser's console open, and fix each error.");

  const pictures: Item[] = [];
  for (const p of g.pages) {
    for (const b of p.phone?.broken ?? []) pictures.push(at(p, `${b} does not show`));
    for (const f of p.fetched) if (f.kind === "pictures" && !f.url.endsWith("/favicon.ico") && (f.status >= 400 || (f.other && f.failed)) && !pictures.some((i) => i.page === p.path && i.thing.includes(f.url))) pictures.push(at(p, `${f.url} ${f.status ? `answers ${f.status}` : "does not load"}`));
  }
  from("pictures-load", phone, /pictures/, pictures, (p) => `Every picture on ${n(p, "page")} loads.`, (c) => `${n(c, "picture")} ${c === 1 ? "does" : "do"} not load.`, "Check each picture's address, and that the app serves the file.");

  return LINE_IDS.map((id) => out.find((l) => l.id === id)!);
}
