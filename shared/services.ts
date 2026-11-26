// The catalog of outside services for an app's needs (server/webapps/services.json, services.ts): what is offered for
// each need, one where one is better overall and at most three otherwise, the first the default; the card that offers
// them; and what a web app chose. The card's words are the catalog's, in English; prices carry the day they were read
// and are not shown as fact once that is more than ninety days ago.
import type { KeyLooks } from './keys.ts';

/** A figure and the day it was read. */
export interface ServicePrice {
  text: string;
  read: string;
}

/** A key of a service, in the keys card's shape. */
export interface ServiceKey {
  name: string;
  label: string;
  why: string;
  how: string[];
  url: string;
  secret: boolean;
  looks?: KeyLooks & { starts?: string[] };
}

/** How a server is made at a provider and compared, in plain clicks (the simple view's path to put an app online). */
export interface ServerSteps {
  /** The day they were read from the pages in `sources`. */
  read: string;
  /** The login a new server there takes. */
  login: string;
  /** Where a server is created. */
  open: string;
  /** Three things to click there. */
  clicks: string[];
  /** What the box for the key is called on its page, and what to press after. */
  box: string;
  boxThen: string;
  /** How to find the new server's address. */
  address: string;
  /** Where to compare the server's code, and the line to paste there. */
  compare: string;
  compareLine: string;
  sources: string[];
  /** For a provider whose new servers take a block of text and run it when they first start (cloud-init): creating one with Hydor's text pasted, in three clicks, the last naming the box. Nothing is compared then. */
  text?: { read: string; clicks: string[]; box: string; sources: string[] };
}

/** How the one record that points a web address at a server is added at a registrar. */
export interface RecordSteps {
  read: string;
  open: string;
  where: string;
  /** The field for the record's kind, and what to put there. */
  type: [string, string];
  /** The fields for the name and for the server's address. */
  name: string;
  value: string;
  then: string;
  /** What the name field takes for the bare domain. */
  apex: string;
  sources: string[];
}

export interface Service {
  /** For a place to run an app: how a server is made there. */
  server?: ServerSteps;
  /** For a registrar: how a record is added there. */
  record?: RecordSteps;
  id: string;
  name: string;
  default?: boolean;
  /** The one sentence it is chosen by. */
  why: string;
  free?: ServicePrice;
  paid?: ServicePrice;
  catch?: string;
  /** Where it does not fit. */
  notFor?: string[];
  /** The provider's pricing (or main) page. */
  page: string;
  keys: ServiceKey[];
  /** For a service with no key: how to get going. */
  setup?: string[];
  /** The day its steps were written from the pages in `sources`. */
  stepsRead: string;
  sources: string[];
}

export interface Need {
  id: string;
  name: string;
  /** What it is for, a few words that finish "a service for …". */
  what: string;
  /** Several needs shown as one row of the plan ("Seeing use and errors"). */
  row?: string;
  /** What an app uses with no service at all, and until when that is enough. */
  builtIn?: { say: string; until: string };
  /** A note beside the choice ("or your model provider's own search"). */
  note?: string;
  /** One to three, the first the default. */
  services: Service[];
  /** Offered too, but not as one of the cards (a mailbox you already have). */
  also?: Service[];
  /** With `url`: where the reason can be seen (a provider's status page). */
  leftOut: { name: string; why: string; url?: string }[];
}

export interface Catalog {
  about: string;
  pricesRead: string;
  stepsRead: string;
  needs: Need[];
}

/** How old a price may be before it is not shown as fact. */
export const PRICE_DAYS = 90;

export const priceStale = (read: string, now: number) => now - Date.parse(`${read}T00:00:00Z`) > PRICE_DAYS * 86_400_000;

/** A service as the card shows it: figures only while they are fresh (`checkPrice`: look at the provider's page). */
export interface ServiceView {
  id: string;
  name: string;
  recommended: boolean;
  why: string;
  free?: string;
  paid?: string;
  /** The prices are more than ninety days old, or there are none that could be read: check the page. */
  checkPrice: boolean;
  catch?: string;
  notFor?: string[];
  page: string;
  /** The names of its keys, as the app is given them. */
  keys: string[];
}

export interface NeedView {
  id: string;
  name: string;
  what: string;
  row?: string;
  builtIn?: { say: string; until: string };
  note?: string;
  services: ServiceView[];
  also: ServiceView[];
  leftOut: { name: string; why: string; url?: string }[];
  /** The day the prices shown were read (none shown: absent). */
  readOn?: string;
}

/** What was chosen for a need of a web app. */
export interface ChosenService {
  need: string;
  needName: string;
  service: string;
  name: string;
  keys: string[];
  at: number;
  /** What is left to do, in words: `agent`: the agent writes what uses it; `outside`: nothing in the app changes (a service that watches it from outside). */
  applied: { state: 'agent' | 'outside'; say: string };
  /** Only in an app's view of its services: what of its keys is not saved yet, here or for its server (their names on the service). */
  missing?: string[];
}

/** A web app's services: what it chose, and the needs a choice can be made for. */
export interface AppServicesView {
  chosen: ChosenService[];
  needs: { id: string; name: string; what: string; services: number; builtIn: boolean }[];
}

/** The choice card of one need for one app, in a session or on the app's page. */
export interface ServicesCardView {
  id: string;
  app: { id: string; name: string };
  need: NeedView;
  chosen?: ChosenService;
  /** The keys card that followed the choice. */
  keysCard?: string;
  createdAt: number;
}

/** The line a tool's answer ends a services card with: the conversation draws that card there. */
export const servicesCardMarker = (id: string) => `[services card ${id}]`;
export const servicesCardOf = (output: string | undefined) => /\[services card (sv_[A-Za-z0-9_-]+)\]/.exec(output ?? '')?.[1] ?? null;
