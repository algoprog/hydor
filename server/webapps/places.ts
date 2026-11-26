// The places card of the Launch stage: where an app can go, each with one plain sentence on what it means, what it costs the
// person in effort and what it costs each month: inside this Hydor, or a server of the person's own (not for every app).
import type { LaunchPlace } from "../../shared/webapps.ts";
import { priceStale, type Catalog } from "../../shared/services.ts";

const HYDOR: LaunchPlace = {
  id: "hydor",
  title: "Inside this Hydor",
  line: "You open it here, signed in as you, on this computer; other people cannot sign in to it inside Hydor.",
  effort: "Nothing to set up: one click, then it is built, checked against its hydor.json and started.",
  cost: "Free: it runs on this computer, and is down when this computer is off.",
  state: "ready",
};

const SERVER: LaunchPlace = {
  id: "server",
  title: "A server of your own",
  line: "A server you rent, with its own address and https: Hydor sends the app there over SSH and keeps it running.",
  effort: "You need the server and a name that points at it; adding it takes about ten minutes, then each launch is one click.",
  cost: "The server you rent (a small one is a few euros or dollars a month) and a name for it.",
  state: "ready",
};

/** `noServer`: why this app cannot go to a server of the person's own, in a sentence, when it cannot. */
export function launchPlaces(noServer?: string): LaunchPlace[] {
  return [HYDOR, noServer ? { ...SERVER, state: "unavailable", unavailable: noServer } : SERVER];
}

/**
 * The places card as the services catalog says it: the servers it names for a server of your own, each with the sentence
 * it is chosen by and its price, shown only while it is fresh, and what cannot be had for now.
 */
export function withCatalog(places: LaunchPlace[], catalog: Catalog, now: number): LaunchPlace[] {
  const run = catalog.needs.find((n) => n.id === "run");
  if (!run) return places;
  return places.map((p) => {
    const named = p.id === "server" ? run.services.filter((s) => s.id !== "render") : [];
    if (!named.length || p.state !== "ready") return p;
    const offers = named.map((s) => {
      const fresh = s.paid && !priceStale(s.paid.read, now) ? s.paid : undefined;
      return { name: s.name, recommended: !!s.default, why: s.why, ...(fresh ? { price: fresh.text, readOn: fresh.read } : {}), ...(s.catch ? { catch: s.catch } : {}), page: s.page };
    });
    const notOffered = run.leftOut.flatMap((x) => (x.url ? [{ name: x.name, why: x.why, url: x.url }] : []));
    return { ...p, offers, ...(notOffered.length ? { notOffered } : {}), cost: "The server you rent (see below) and a name for it." };
  });
}
