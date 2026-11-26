// The card that asks for several credentials at once, each with how to get it (request_secret with items or steps,
// and web apps' keys): what the server keeps and sends, and what the card works out as the person types. Values
// are never here: a card holds what is asked, and each item's answer (saved, used, skipped).
import { secretName, SECRET_NAME, type SecretField } from './connections.ts';

/** A paste that is plainly something else, and what to say of it. */
export interface KeyWrong {
  starts?: string;
  /** Found anywhere in the paste. */
  pattern?: string;
  say: string;
  /** Warn only where this holds (conditions such as `place = hydor`): settled on the server, never sent to a page. */
  when?: string;
}

/**
 * What a right value looks like: how it starts, or a pattern, with a sentence to say when a paste does not; and pastes
 * that are plainly something else. `whole`: written as hydor.json writes it (the pattern matches the whole
 * value, and the sentence finishes "a right value …").
 */
export interface KeyLooks {
  prefix?: string[];
  pattern?: string;
  say?: string;
  not?: KeyWrong[];
  whole?: boolean;
}

export interface CardField extends SecretField {
  looks?: KeyLooks;
}

/** One thing asked for: one tab. One field (a key) or several (an id and a secret; host, port, user, password). */
export interface CardItem {
  /** Its name, in capitals: the key's name, what a sign-in's keys start with, or a group of keys got together. */
  id: string;
  title: string;
  /** Who gives it (a provider's name). */
  from?: string;
  why: string;
  /** How to get it, a step a line. */
  how?: string[];
  /** The provider's page (https), opened in a new tab. */
  url?: string;
  /** What a right value looks like, in a sentence. */
  hint?: string;
  fields: CardField[];
  /** Nothing waits for it. */
  optional?: boolean;
  /** "Skip for now" is offered: it is optional, or the app can go on without it. */
  skippable?: boolean;
  domains: string[];
  /** Commands on this computer need it: the card asks the person to allow that. */
  commands?: boolean;
  /** Ask for a new value even though one is saved (it stopped working, or the person asked to replace it). */
  replace?: boolean;
  /** Other items (by id) any one of which does instead of this one: saving one of them is enough. */
  or?: string[];
}

export type ItemState = 'todo' | 'saved' | 'used' | 'skipped';

/** Where else a value of the same name is, offered (never assumed) to a web app's card: its own other place, another app's, or the vault's. */
export interface ReuseSource {
  /** `vault`, or `app:<id>:<env>`. */
  id: string;
  kind: 'place' | 'app' | 'vault';
  env?: string;
  /** Another app's name. */
  app?: string;
  /** Its server environment is the only one that app has ("Your server"). */
  only?: boolean;
}

/**
 * Whether a saved value of this field can be offered for another place: only when the app's or the agent's `looks`
 * shows its form and nothing says a test value and a live one differ. When in doubt, no.
 */
export function offerable(item: { from?: string }, f: { key: string; secret: boolean; looks?: KeyLooks }): boolean {
  if (!f.secret || isPaymentsKey(item, f) || /WEBHOOK|TEST|LIVE|SANDBOX/.test(f.key)) return false;
  const l = f.looks;
  if (!l?.prefix?.length && !l?.pattern) return false;
  return !/test|live|sandbox/i.test([...(l.prefix ?? []), l.pattern ?? '', l.say ?? ''].join(' '));
}

export interface CardFieldView extends CardField {
  /** A value is in the vault under this name, saved then. Never the value, nor any part of it. */
  savedAt?: number;
  /** The saved one cannot be used here, and why (a live key for an app inside Hydor). */
  refused?: 'live';
  commandsOn?: boolean;
}

export interface CardItemView extends Omit<CardItem, 'fields'> {
  fields: CardFieldView[];
  state: ItemState;
  /** A web app's card: values of these names elsewhere that may be used here too. */
  reuse?: ReuseSource[];
}

export interface KeysCardView {
  id: string;
  /** The session it was put up in, or `webapp:<id>` for a card on a web app's page. */
  key: string;
  name: string;
  title?: string;
  why?: string;
  state: 'pending' | 'saved' | 'dismissed';
  items: CardItemView[];
  /** For an app that runs inside Hydor: payments take a test key only. */
  inside?: boolean;
  /** `env` is the place the values are for (`hydor`, or a server's environment); `only`, that server is the app's only one. */
  app?: { id: string; name: string; env: string; only?: boolean };
  /** Keys given to an app by name: no hosts to choose, no commands to allow (agents never get them). */
  byName?: boolean;
  createdAt: number;
  doneAt?: number;
}

/** Something that names a key of the vault, told to the person removing it. */
export interface KeyUse {
  kind: 'webapp' | 'app';
  id: string;
  name: string;
  /** Where in it: a web app's environments. */
  where?: string[];
  /** It keeps a value of its own: removing this one does not touch it. */
  own?: boolean;
}

/** How many tabs one card takes. */
export const MAX_ITEMS = 8;

export const answered = (s: ItemState) => s !== 'todo';
export const filled = (s: ItemState) => s === 'saved' || s === 'used';

/**
 * Whether the turn goes on: every needed item is saved (or skipped where it may be). With nothing needed, when every
 * item is answered. One that another does instead of is answered once that other is saved.
 */
export function cardDone(items: { id?: string; optional?: boolean; state: ItemState; or?: string[] }[]): boolean {
  const needed = items.filter((i) => !i.optional);
  const instead = (i: { or?: string[] }) => !!i.or?.some((id) => items.some((x) => x.id === id && filled(x.state)));
  return (needed.length ? needed : items).every((i) => answered(i.state) || instead(i));
}

/** How many are filled or skipped, of how many: "2 of 3". */
export const cardCount = (items: { state: ItemState }[]) => ({ done: items.filter((i) => answered(i.state)).length, of: items.length });

/** A payments key that moves real money (Stripe's secret and restricted keys). */
export const isLiveKey = (value: string) => /^(sk|rk)_live_/.test(value.trim());

/** A web app's key still to be given: needed, and not there or not usable there. */
export const stillMissing = (k: { givenBy: string; needed: boolean; set: boolean; refused?: string }) => (k.givenBy === 'provider' || k.givenBy === 'you') && k.needed && (!k.set || !!k.refused);

/** Whether this field takes a payments key: the live-key rule is about these. */
export const isPaymentsKey = (item: { from?: string }, field: { key: string }) => /STRIPE/.test(field.key) || /stripe/i.test(item.from ?? '');

export type PasteWarning = 'line' | 'quotes' | 'not' | 'looks';

const found = (pattern: string, v: string) => {
  try {
    return new RegExp(pattern).test(v);
  } catch {
    return false;
  }
};

/** The entry of `not` a paste is, if any (one with a condition still on it was not settled, and is left alone). */
export function notThis(raw: string, looks: KeyLooks | undefined): KeyWrong | undefined {
  const v = raw.trim();
  if (!v || v.length > 2000) return undefined;
  return looks?.not?.find((w) => !w.when && ((!!w.starts && v.startsWith(w.starts)) || (!!w.pattern && found(w.pattern, v))));
}

/**
 * What is plainly wrong about a paste, if anything. A warning, never a block: the person may know better (the live
 * key inside Hydor is the one refusal, above).
 */
export function pasteWarning(raw: string, field: { key: string; looks?: KeyLooks }): PasteWarning | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith(`${field.key}=`) || /^(export\s+)?[A-Z][A-Z0-9_]{3,}=/.test(v)) return 'line';
  if (v.length >= 2 && /^(["'`]).*\1$/s.test(v)) return 'quotes';
  const l = field.looks;
  if (!l) return null;
  if (notThis(v, l)) return 'not';
  if (l.prefix?.length && !l.prefix.some((p) => v.startsWith(p))) return 'looks';
  if (l.pattern && v.length <= 500) {
    try {
      if (!new RegExp(l.whole ? `^(?:${l.pattern})$` : l.pattern).test(v)) return 'looks';
    } catch {}
  }
  return null;
}

/** The name a request_secret call's card is kept under: the card in the conversation finds it by this. */
export function requestName(input: { name?: unknown; items?: unknown }): string {
  const own = secretName(String(input.name ?? ''));
  if (!Array.isArray(input.items) || !input.items.length) return own;
  const names = input.items.map((i) => secretName(String((i as { name?: unknown })?.name ?? ''))).filter(Boolean);
  // As secretName leaves it, since the card is asked for by this name.
  const joined = secretName(names.join('_'));
  return SECRET_NAME.test(joined) ? joined : own;
}

/** The line a tool's answer ends a card with: the conversation draws that card there. */
export const keysCardMarker = (id: string) => `[keys card ${id}]`;
export const keysCardOf = (output: string | undefined) => /\[keys card (sr_[A-Za-z0-9_-]+)\]/.exec(output ?? '')?.[1] ?? null;
