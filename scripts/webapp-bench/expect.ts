// What a brief's `expect.json` says to this judge (never shown to a builder), as types, and the lines the judge has for it.
// The kinds of thing, their fields, the rows, the numbers and the days are in expect-base.ts (a plan is read for mistakes with the same checks); this file adds who may make an
// account, who may add a row, the pages a maker asks for, and the rules of the briefs that are mostly their own logic (`actions`).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type FieldSpec, type KindSpec, type NumberSpec, type Row, type ToolExpect, checkPlan } from './expect-base.ts';

export type { NumberSpec, Row };

export interface VField extends FieldSpec {
  /** The maker's own phrase for the field, quoted from brief.md, answers.md or change.md (plans.test.ts checks the quote is in the words and is among the accepted names). */
  said?: string[];
  /** A short text that must be an email address. */
  email?: boolean;
  /** The limits the maker named for a number or an amount of money: just outside them is refused. */
  min?: number;
  max?: number;
  /** The maker's words do not ask for it (or ask only for it as something nice to have): the app MAY have it. When judge.json maps a key for it the judge sends it in every row and tries it as
   * described (an email as an email, a number within its limits); when judge.json maps none the judge leaves it out of every row and every check, and nothing fails for its absence. A field is
   * `mayHave` when the maker's words need it only as an optional answer to a question a builder may not have asked, or not at all. It is never tried as needed: the app may make it so. */
  mayHave?: boolean;
  /** The app makes it (a web address made from a title, whether a member has paid): it is read back, never sent. judge.json has to say where to read it. */
  readOnly?: boolean;
  /** The maker gave no words for it: the judge sends a short text, or the first of the choices the builder lists for it. */
  open?: boolean;
}

export interface VKind extends KindSpec {
  /** The maker's own phrase for the kind of thing, quoted. */
  said?: string[];
  fields: VField[];
  /** A visitor (nobody signed in) adds rows (a sign-up list); nobody but the team reads them. */
  visitorAdds?: boolean;
  /** What the maker's words say a person does with a row besides adding it, so that judge.json has to give the way: only `change` is ever asked for by the plans. Reading one row by its own address
   * and removing one are tried when judge.json gives them, never required. */
  ops?: ('read' | 'change' | 'remove')[];
  /** Fields (ids) of which the maker needs at least one, whichever way the app holds it (one question or several): with all of them left out the row is refused, and judge.json has to map at least one. */
  needOne?: string[];
  /** The maker's words give each person one set of details ("put in their own details"): saving again may replace it. The judge adds one row as the first person, and tries other things on rows made by people of its own, never by adding more as the first person. */
  onePerPerson?: boolean;
  /** A person with a role above the rest (the chair of a club) sees everybody's rows of this kind: what a second person adds is rightly among theirs. */
  staffSeeAll?: boolean;
  /** Rows come from an action of the app, not from adding: the judge only reads them (a score board). */
  readOnly?: boolean;
  /** Visitors may read what is published (a help centre's articles): the judge does not fail a visitor's reading of it, only a visitor's writing; what must stay hidden (drafts) has its own line. */
  publicRead?: boolean;
}

export interface PageSpec {
  id: string;
  /** Where a builder may have put it (the judge also follows the links of the first page). */
  paths: string[];
  phrases: string[][];
}

export interface PartSpec {
  /** The maker's own phrase for it, quoted. */
  said?: string[];
  id: string;
  names: string[];
  kind: 'whole' | 'number' | 'text' | 'day' | 'list' | 'file' | 'rows';
  required?: boolean;
  /** For an output: how far a number may be from the case's (rounding is the builder's to choose within it). */
  tol?: number;
  /** For an output that is a list of items: the parts of one item. */
  items?: PartSpec[];
}

export interface Case {
  label: string;
  in: Record<string, unknown>;
  /** What must come back (only these are compared). Left out for a case that must be refused. */
  out?: Record<string, unknown>;
}

export interface ActionSpec {
  /** The maker's own phrase for the rule, quoted. */
  said?: string[];
  id: string;
  names: string[];
  /** How the inputs may be sent: the builder says which in judge.json. */
  inputs: PartSpec[];
  outputs: PartSpec[];
  cases: Case[];
  edges: Case[];
  refused: Case[];
}

export interface BoardSpec {
  /** The action each play is sent to, the kind (a read-only list) the board is read from, and how many places it has. */
  action: string;
  kind: string;
  size: number;
  plays: Record<string, unknown>[];
  /** The board after those plays: the parts of each place, best first. */
  expect: Record<string, unknown>[];
}

/** A membership club: roles given by the owner, members' own records, notices that only members who have paid this month read, and a payment service that tells the app who has paid. */
export interface ClubSpec {
  details: string;
  notices: string;
  /** The read-only field of a member's record that says whether they have paid this month. */
  paid: string;
  /** The maker's words for the two helper roles. */
  roles: { treasurer: string; coach: string };
}

/** A team tool: rows belong to a team, people join by invitation with a role, and may be in two teams. */
export interface TeamsSpec {
  kinds: string[];
  roles: { lead: string; member: string };
}

export interface SearchCase {
  q: string;
  /** The titles of the published articles it finds, in the order the maker's words give. */
  expect: string[];
}

/** A knowledge base: public reading by an address made from the title, search, a page for each category, drafts that never show. */
export interface KbSpec {
  kind: string;
  /** The article's address as the maker's rule makes it from a title, for each article in the plan (title -> address). */
  searches: SearchCase[];
  /** For each category: the published titles it lists, in order. */
  categories: Record<string, string[]>;
  /** A draft's title, and a word only it has: neither may be found anywhere a visitor looks. */
  draft: { title: string; word: string; category: string };
  /** A published article whose title is changed: the new title, and a word of its text to look for on its page. */
  retitle: { title: string; to: string; word: string };
}

/** A booking page: weekly hours, free slots for visitors, nobody booked twice, days off, times in the maker's zone. */
export interface BookingSpec {
  hours: string;
  daysOff: string;
  bookings: string;
  action: string;
  zone: string;
  slotMinutes: number;
  /** Days written YYYY-MM-DD: a Monday in summer time, a Monday in winter time, a Wednesday, a Sunday, and a Monday that is a day off. */
  days: { summer: string; winter: string; wednesday: string; sunday: string; off: string };
  /** The slots the maker's rule gives for each of those days, as local times written HH:MM. */
  slots: { summer: string[]; winter: string[]; wednesday: string[]; sunday: string[]; off: string[] };
}

export type Accounts = 'none' | 'owner-only' | 'open' | 'any';

export interface VersusExpect {
  id: string;
  /** accounts: small apps with accounts and lists; logic: small tools that are mostly their own logic; larger: apps that need several things at once (accounts with roles, teams, search, concurrent bookings). Chosen, not drawn. */
  group: 'accounts' | 'logic' | 'larger';
  product: string;
  /** Things a person must be able to read on the first page and the public pages. */
  phrases: string[][];
  pages?: PageSpec[];
  /** none: nobody signs in. owner-only: the first person can, nobody else (the judge starts the app as it is in real use). open: anyone can. any: the maker did not say; the judge needs two people, and may use the builder's `judgeEnv`. */
  accounts: Accounts;
  /** Who sees the rows: the owner only, the whole team, or each person their own. */
  access?: 'owner' | 'team' | 'own';
  kinds: VKind[];
  rows: Record<string, Row[]>;
  later: Record<string, Row[]>;
  theirs?: Record<string, Row[]>;
  numbers: NumberSpec[];
  actions?: ActionSpec[];
  board?: BoardSpec;
  club?: ClubSpec;
  teams?: TeamsSpec;
  kb?: KbSpec;
  booking?: BookingSpec;
}

export function loadExpect(file: string): VersusExpect {
  return JSON.parse(readFileSync(file, 'utf8')) as VersusExpect;
}

export const briefFile = (briefDir: string, which: 'expect' | 'change' = 'expect'): string => join(briefDir, which === 'expect' ? 'expect.json' : 'expect-change.json');

// ------------------------------------------------------------------------------------------------ the lines

export interface LineInfo {
  id: string;
  what: string;
}

/** Every line the judge can have, with what it says. The ids are stable: a new check is a new id, and an old id is never reused for something else. */
export const LINE_TEXT: Record<string, string> = {
  'judge-json': "judge.json is there and says where everything the maker's words need is: the kinds of thing with their addresses and the fields the maker needs (a field the maker does not ask for may be there or not), the home page for numbers, the ways in and out of each rule, and how to make an account. This is the one line that fails for a gap in judge.json; the lines that needed what is missing are said not checked and left out of the count.",
  build: 'The build command in judge.json (when there is one) works.',
  starts: 'The app starts in production on the port and in the empty data folder the judge gives, and answers within 60 seconds.',
  'name-shown': "The product's name, as the maker gave it, is on the first page, in the HTML the server sends.",
  'phrases-shown': 'Each thing the maker\'s words need (each a list of ways to say it) is on a public page a person reads.',
  'second-page': 'Each other public page the maker asked for answers and says what it was asked to say.',
  'no-secret-in-browser': "No secret from the app's environment is in a file a browser downloads (the pages, the files they load, the folders judge.json says are sent as they are).",
  account: 'A person can make an account and is let in, can sign in again with the same email and password, and a wrong password is refused (a 4xx).',
  'signup-policy': 'Who may make an account is what the maker said: nobody but the first person, or anyone.',
  'add-and-read': 'Everything added comes back: each row added (by a visitor where the maker said so) is in the list with each value as given. Rows are found again by a field the app has, said in the line.',
  'required-fields': "A field the maker said is needed cannot be left out or blank (refused, nothing kept); one the maker said may be left out can be. Fields the maker's words do not ask for are tried only if the app has them, and never as needed.",
  'bad-values': 'Values that make no sense for a field (a fraction for a whole number, a day that does not exist, a word that is not a choice, a number beyond the maker\'s limit, a row that is not there) are refused and nothing is kept.',
  'change-remove': "A row is changed and the list shows the change (the maker's words say people change rows). Reading one row by its own address and removing one are tried when judge.json gives them, and never required.",
  'visitor-shut-out': 'A visitor cannot list, read, change or remove anyone\'s row by any address (including the id guessed), cannot add where only people may, and finds no row on the home page.',
  'team-shares': 'Everyone signed in sees the same rows, can add and change them, and sees what the others add (or, for a sign-up list, sees what visitors sent).',
  'others-cannot': 'A second person cannot read, list, change or remove the first person\'s row by any address (including the id guessed), sees only their own, and their rows are not in the first person\'s.',
  'home-numbers': 'Each number on the home page of a signed-in person, read from the HTML, is what their rows come to, and moves when rows are added.',
  'keeps-after-restart': 'What was kept is still there after the app is stopped and started again in the same data folder.',
  stops: 'The app stops within 10 seconds when asked to (SIGTERM) and leaves nothing answering on the port.',
  'rule-cases': "The maker's own worked examples give the answers the maker's words give.",
  'rule-edges': "The cases where a rule is easy to get wrong (a boundary, a tie, a day that is not a Saturday, a quoted comma, a bonus that adds up) give the right answer.",
  'bad-input-refused': 'Input that makes no sense is refused with a sentence and gives no answer.',
  'club-roles': "What each person may do is what the maker said: the chair (the first account) sees and changes everything and gives the two helpers their roles (nobody else can); the treasurer sees everybody's details and cannot change them; the coach posts notices and sees only their own details; a member sees only their own details and cannot post.",
  'club-payments': "The payment service's word is believed only with the shared secret; a member who has paid for this month reads the notices and one who has not (or paid for last month) cannot; the treasurer sees who has paid.",
  'teams-isolation': "Each team sees only its own rows in all three kinds: nobody reads, lists, changes or removes another team's row by any address (the id guessed too), and cannot put a row into a team they are not in.",
  'teams-invite': 'A lead invites a person into the team by a link with a role; the person follows the link and has that role; a member cannot invite or remove anyone.',
  'teams-two': 'A person in two teams sees the rows of both, and can add to either, and to no third.',
  'teams-removal': 'A person the lead takes out of a team loses access to its rows at once (their own session, the very next request) and keeps the other team.',
  'kb-reading': "A published article is on a public page whose address is made from its title as the maker's rule says, with its title and words in the HTML; a draft's address shows nothing.",
  'kb-search': 'A search shows the published articles with every word of the query, in the order the maker said, in the HTML, and never a draft.',
  'kb-category': "A category's page lists its published articles in the order the maker said, and never a draft.",
  'kb-address': "An article's address stays the same when its title is changed, and shows the new title.",
  'kb-drafts': 'A draft is not found by search, on a category page, at its address or in a visitor\'s list; a visitor cannot write; publishing a draft makes it appear and making it a draft again hides it.',
  'booking-slots': "A visitor sees the free slots the maker's rule gives for each day (every slot of the hours, none outside them, none on a day with no hours), a booked slot is gone, and a booking for a time that is no slot is refused.",
  'booking-once': 'A slot booked by several requests at the same moment is booked exactly once: one is accepted, the rest are refused, and the owner has one booking.',
  'booking-cancel': 'The owner cancels a booking and its slot is free again; nobody else can cancel.',
  'booking-dayoff': 'A day off has no free slots and cannot be booked, and the other days are as they were.',
  'booking-timezone': "The times a visitor reads on the page are those of the maker's zone, in summer time and in winter time.",
  'board-rules': 'The score board shows each name once with its best play, the best places only, best first, ties as the maker said.',
};

/** The lines a brief has, in the order they are said. Which lines there are depends on the brief alone, never on the app: the same brief has the same lines for every run of it. */
export function linesFor(e: VersusExpect): string[] {
  const ids = ['judge-json', 'build', 'starts', 'name-shown', 'phrases-shown'];
  if (e.pages?.length) ids.push('second-page');
  ids.push('no-secret-in-browser');
  const stateful = e.kinds.some((k) => !k.readOnly);
  const people = e.accounts !== 'none';
  if (people) ids.push('account');
  if (e.accounts === 'owner-only' || e.accounts === 'open') ids.push('signup-policy');
  if (stateful) {
    ids.push('add-and-read', 'required-fields', 'bad-values');
    if (e.kinds.some((k) => !k.readOnly && (k.ops?.length ?? 0) > 0)) ids.push('change-remove');
    ids.push('visitor-shut-out');
    if (e.access === 'team' && e.accounts !== 'owner-only') ids.push('team-shares');
    if (e.access === 'own') ids.push('others-cannot');
    if (e.numbers.length > 0) ids.push('home-numbers');
  }
  if (e.actions?.length && !e.booking) ids.push('rule-cases', 'rule-edges', 'bad-input-refused');
  if (e.board) ids.push('board-rules');
  if (e.club) ids.push('club-roles', 'club-payments');
  if (e.teams) ids.push('teams-isolation', 'teams-invite', 'teams-two', 'teams-removal');
  if (e.kb) ids.push('kb-reading', 'kb-search', 'kb-category', 'kb-address', 'kb-drafts');
  if (e.booking) ids.push('booking-slots', 'booking-once', 'booking-cancel', 'booking-dayoff', 'booking-timezone');
  if (stateful || e.board) ids.push('keeps-after-restart');
  ids.push('stops');
  return ids;
}

// ------------------------------------------------------------------------------------------------ a plan read for mistakes

/** What is wrong with a brief's plan, in sentences; empty when it holds. */
export function planProblems(e: VersusExpect, now = new Date()): string[] {
  const problems: string[] = [];
  const stateful = e.kinds.some((k) => !k.readOnly);
  if (e.numbers.length > 0 || Object.keys(e.rows).length > 0) {
    const asTool: ToolExpect = { id: e.id, kind: 'tool', product: e.product, phrases: e.phrases, access: e.access === 'own' ? 'own' : 'shared', kinds: e.kinds, rows: e.rows, later: e.later, numbers: e.numbers, ...(e.theirs ? { theirs: e.theirs } : {}) };
    // a sign-up list's rows are all there is to it: its numbers (none) are not checked for movement
    const found = checkPlan(asTool, now).filter((p) => !(e.numbers.length === 0 && /number/.test(p)));
    problems.push(...found);
  }
  if (stateful && e.accounts === 'none') problems.push('a brief with rows to keep and nobody signing in has no one to keep them for: say who sees them');
  if (e.access === 'own' && e.accounts !== 'any' && e.accounts !== 'open') problems.push('rows that are each person\'s own need a second person: accounts must be "open" or "any"');
  if (e.access === 'own' && !e.theirs) problems.push('access is "own", so the plan needs `theirs`');
  if (e.numbers.length > 0 && !stateful) problems.push('numbers need rows');
  for (const k of e.kinds) {
    if (!k.readOnly && Object.values(e.rows[k.id] ?? []).length === 0) problems.push(`${k.id}: no rows to add`);
    for (const f of k.fields) {
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) problems.push(`${k.id}.${f.id}: min is above max`);
      if (f.mayHave && f.required) problems.push(`${k.id}.${f.id}: a field the app may have is never required by the plan (the app may make it so)`);
    }
    for (const id of k.needOne ?? []) if (!k.fields.some((f) => f.id === id && f.mayHave)) problems.push(`${k.id}: needOne names "${id}", which is no field that may be had`);
  }
  for (const a of e.actions ?? []) {
    const ins = new Set(a.inputs.map((i) => i.id));
    const outs = new Set(a.outputs.map((o) => o.id));
    for (const c of [...a.cases, ...a.edges, ...a.refused]) {
      for (const key of Object.keys(c.in)) if (!ins.has(key)) problems.push(`${a.id}: case "${c.label}" gives "${key}", which is no input`);
      for (const key of Object.keys(c.out ?? {})) if (!outs.has(key)) problems.push(`${a.id}: case "${c.label}" expects "${key}", which is no output`);
    }
    for (const i of a.inputs) if (i.required && a.cases.some((c) => c.in[i.id] === undefined)) problems.push(`${a.id}: a worked case leaves out the required input "${i.id}"`);
    if (a.cases.length < 3) problems.push(`${a.id}: fewer than three worked cases`);
    if (a.edges.length < 3) problems.push(`${a.id}: fewer than three edge cases`);
    if (a.refused.length < 3) problems.push(`${a.id}: fewer than three refused cases`);
    for (const c of a.refused) if (c.out) problems.push(`${a.id}: the refused case "${c.label}" has an answer`);
  }
  if (e.board) {
    const action = e.actions?.find((a) => a.id === e.board!.action);
    if (!action) problems.push(`the board is read after plays of "${e.board.action}", which is no action`);
    if (!e.kinds.some((k) => k.id === e.board!.kind && k.readOnly)) problems.push(`the board is read from "${e.board.kind}", which is no read-only kind`);
    if (e.board.expect.length > e.board.size) problems.push('the board expects more places than it has');
  }
  if (e.accounts === 'none' && (e.access || e.theirs)) problems.push('nobody signs in, so there is no one to share or hide rows from');
  return problems;
}
