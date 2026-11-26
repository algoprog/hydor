// The lines of the larger briefs, each a short scenario run through the addresses judge.json gives: a club (roles, payments), crews (teams, invitations, two teams, removal), a help centre
// (reading, search, categories, stable addresses, drafts) and a booking page (free slots, one booking at a time, cancelling, days off, the time zone). They use the people and the
// helpers of the judge (`Run`) and conclude everything by trying: judge.json says where, never what is true.
import { fold, visibleText } from './lib.ts';
import { type Row, resolveRow } from './expect-base.ts';
import { fill, opOf } from './acceptance.ts';
import type { Run } from './judge.ts';
import { Client, at, ok, refused } from './http.ts';
import type { Reply } from './http.ts';
import { localTime, slugify } from './rules-larger.ts';
import { type Bound, add, bodyOf, change, idOf, list, markerField, markerOf, remove, rowsOf } from './things.ts';

const short = (r: Reply): string => `${r.status}${r.json?.error ? ` ${JSON.stringify(r.json.error).slice(0, 60)}` : r.json?.message ? ` ${JSON.stringify(r.json.message).slice(0, 60)}` : ''}`;
const more = (problems: string[], n = 5): string => problems.slice(0, n).join('; ') + (problems.length > n ? `; and ${problems.length - n} more` : '');
const verdict = (run: Run, id: string, problems: string[], good: string): void => (problems.length === 0 ? run.pass(id, good) : run.fail(id, more(problems)));
let counter = 0;
const tag = (): string => `lg${++counter}x`;

/** The first row of a kind in the plan, with its days made real. */
const base = (run: Run, kind: string, i = 0) => resolveRow(run.e.rows[kind]![i]!, run.now);

/** The text a list (or any reply) says, for looking for marks in. */
const said = (r: Reply): string => JSON.stringify(r.json ?? r.text);

/** What a person lists: the marks of rows they see, or null when the list was refused. */
async function sees(who: Client, b: Bound, marks: string[]): Promise<{ seen: string[]; listed: boolean }> {
  const got = await list(who, b);
  if (!got.rows) return { seen: [], listed: false };
  const text = JSON.stringify(got.rows);
  return { seen: marks.filter((m) => text.includes(m)), listed: true };
}

// ================================================================================================ the club

export async function club(run: Run): Promise<void> {
  const spec = run.e.club!;
  const j = run.j!;
  const details = run.bound.get(spec.details);
  const notices = run.bound.get(spec.notices);
  const A = run.A;
  if (!details?.decl.list || !details.decl.add || !notices?.decl.list || !notices.decl.add) return run.skip(['club-roles', 'club-payments'], 'judge.json gives no usable "list" and "add" for the details and the notices');
  if (!A) return run.rest(['club-roles', 'club-payments'], 'the chair (the first account) could not sign in');
  // five people: Dee (treasurer), Kofi (coach), two members (one pays), and the chair who is A
  const who: Record<string, Client> = {};
  for (const name of ['dee', 'kofi', 'mia', 'noor', 'ola']) {
    const p = await run.makePerson(name);
    if (!p.made) return run.fail('club-roles', `${name} could not make an account (${short(p.reply)}), and the maker said anyone could`);
    who[name] = p.client;
  }
  const mark: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const row = base(run, spec.details);
  // the chair's own record is the one the judge made first (a member keeps one set of details; saving again may replace it)
  mark.chair = run.markersOf(details)[0] ?? '';
  for (const [name, client] of Object.entries(who) as [string, Client][]) {
    const t = tag();
    // a member's own mark is made from the tag alone, so that no mark is a part of another (the chair's is the plan's name)
    const r: Row = { ...row, fullName: `Rower ${name} ${t}` };
    mark[name] = markerOf(details, r) ?? t;
    const sent = await add(client, details, bodyOf(details, r, run.ids, j));
    if (!ok(sent.reply)) return run.fail('club-roles', `${name} cannot add their own details (${short(sent.reply)})`);
    ids[name] = sent.id ?? '';
  }
  ids.chair = '';
  {
    const got = await list(A, details);
    for (const [name, m] of Object.entries(mark)) if (!ids[name]) ids[name] = idOf(details, got.rows?.find((r) => JSON.stringify(r).includes(m)) ?? {}) ?? '';
  }
  const post = async (client: Client, label: string) => {
    const t = tag();
    const r = run.tagged(notices, base(run, spec.notices), t);
    const sent = await add(client, notices, bodyOf(notices, r, run.ids, j));
    return { sent, mark: markerOf(notices, r) ?? t };
  };
  const reads = async (client: Client, marks: string[]) => (await sees(client, notices, marks)).seen;

  // ---- roles
  const roles = j.accounts?.grant;
  if (!roles) run.skip(['club-roles'], 'judge.json has no accounts.grant (how the chair gives a helper their role)');
  else {
    const problems: string[] = [];
    const word = (r: string) => j.accounts?.roles?.[r] ?? r;
    // nobody but the chair gives roles
    const self = await run.step(who.mia!, roles, { email: 'mia@judge.test', role: word(spec.roles.coach) });
    const dee = await run.step(A, roles, { email: 'dee@judge.test', role: word(spec.roles.treasurer) });
    const kofi = await run.step(A, roles, { email: 'kofi@judge.test', role: word(spec.roles.coach) });
    if (!ok(dee) || !ok(kofi)) problems.push(`the chair could not give the helpers their roles (${short(ok(dee) ? kofi : dee)})`);
    if (ok(self)) problems.push('an ordinary member could give themselves the role of coach (the maker said nobody but the chair gives roles)');
    // who sees which details
    const everyone = Object.values(mark);
    const chair = await sees(A, details, everyone);
    if (chair.seen.length < everyone.length) problems.push(`the chair sees ${chair.seen.length} of the ${everyone.length} members' details, and was to see everybody's`);
    const dees = await sees(who.dee!, details, everyone);
    if (dees.seen.length < everyone.length) problems.push(`the treasurer sees ${dees.seen.length} of the ${everyone.length} members' details, and was to see everybody's`);
    for (const name of ['kofi', 'mia', 'noor', 'ola']) {
      const got = await sees(who[name]!, details, everyone);
      if (!got.listed) problems.push(`${name} (${name === 'kofi' ? 'the coach' : 'a member'}) cannot list even their own details`);
      else if (got.seen.some((m) => m !== mark[name])) problems.push(`${name} (${name === 'kofi' ? 'the coach' : 'a member'}) sees other members' details`);
      else if (!got.seen.includes(mark[name]!)) problems.push(`${name} does not see their own details`);
    }
    // the treasurer reads and does not change; the chair changes
    // changing a member's details is tried where judge.json gives a way: the maker's words never ask for one, only say who may not
    if (opOf(details.decl.one, 'change')) {
      const hack = await change(who.dee!, details, ids.mia!, bodyOf(details, run.tagged(details, row, 'hackedzq'), run.ids, j));
      const afterHack = await list(A, details);
      if (ok(hack) || JSON.stringify(afterHack.rows ?? []).includes('hackedzq')) problems.push(`the treasurer changed a member's details (${short(hack)}); the maker said they only look`);
      const kofiHack = await change(who.kofi!, details, ids.mia!, bodyOf(details, run.tagged(details, row, 'hackedzq'), run.ids, j));
      if (ok(kofiHack)) problems.push("the coach changed another member's details");
      // a change keeps what the row is found by (the name) and adds to it
      const edited = (name: string, more: string) => bodyOf(details, { ...row, fullName: `${mark[name]} ${more}` }, run.ids, j);
      const mine = await change(who.mia!, details, ids.mia!, edited('mia', 'edited'));
      if (!ok(mine)) problems.push(`a member cannot change their own details (${short(mine)})`);
      const chairs = await change(A, details, ids.noor!, edited('noor', 'chairedited'));
      if (!ok(chairs)) problems.push(`the chair cannot change a member's details (${short(chairs)}); the maker said they change everything`);
    }
    // notices: the chair and the coach post, nobody else
    const chairPost = await post(A, 'chair');
    const coachPost = await post(who.kofi!, 'coach');
    if (!ok(chairPost.sent.reply)) problems.push(`the chair cannot post a notice (${short(chairPost.sent.reply)})`);
    if (!ok(coachPost.sent.reply)) problems.push(`the coach cannot post a notice (${short(coachPost.sent.reply)})`);
    const denied: string[] = [];
    for (const [name, label] of [['dee', 'the treasurer'], ['mia', 'a member']] as const) {
      const p = await post(who[name]!, name);
      if (ok(p.sent.reply)) problems.push(`${label} posted a notice (${p.sent.reply.status}); only the coach and the chair post`);
      denied.push(p.mark);
    }
    const kept = await sees(A, notices, denied);
    if (kept.seen.length > 0) problems.push('a notice posted by someone who may not post is in the list');
    // who reads them (nobody has paid yet)
    const marks = [chairPost.mark, coachPost.mark];
    for (const [name, label] of [['dee', 'the treasurer'], ['kofi', 'the coach']] as const) if ((await reads(who[name]!, marks)).length < 2) problems.push(`${label} cannot read the notices (the maker said they always can)`);
    if ((await reads(A, marks)).length < 2) problems.push('the chair cannot read the notices');
    for (const name of ['mia', 'noor']) if ((await reads(who[name]!, marks)).length > 0) problems.push(`${name}, who has not paid, reads the notices`);
    verdict(run, 'club-roles', problems, 'the chair gives the two helpers their roles and nobody else can; the chair and the treasurer see everybody\'s details, the treasurer cannot change them, the coach and members see only their own; the coach and the chair post notices and nobody else; helpers read notices and members who have not paid do not');
  }

  // ---- payments
  const pay = j.payments;
  if (!pay) return run.skip(['club-payments'], 'judge.json has no "payments" (how the payment service tells the app who has paid)');
  const problems: string[] = [];
  let seen = 'not checked';
  const secret = run.secrets[pay.secretEnv];
  const hook = run.newClient('payment-service');
  const month = (back = 0) => {
    const d = new Date(Date.UTC(run.now.getUTCFullYear(), run.now.getUTCMonth() - back, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const call = async (email: string, m: string, how: 'right' | 'wrong' | 'none') => {
    const fields: Record<string, unknown> = Object.fromEntries(Object.entries(pay.body).map(([k, v]) => [k, fill(v, { email, month: m })]));
    const headers: Record<string, string> = {};
    const value = how === 'right' ? secret : how === 'wrong' ? `${secret}-wrong` : undefined;
    if (value !== undefined) {
      if (pay.secretHeader) headers[pay.secretHeader] = value;
      else if (pay.secretField) fields[pay.secretField] = value;
    }
    return hook.call(pay.method ?? 'POST', pay.path, { send: pay.send ?? 'json', fields, headers });
  };
  if (!secret) return run.fail('club-payments', `the shared secret (${pay.secretEnv}) was not set: it must be an environment variable the app reads`);
  const t = tag();
  const notice = await post(A, 'chair');
  if (!ok(notice.sent.reply)) return run.fail('club-payments', `the chair cannot post a notice to read (${short(notice.sent.reply)})`);
  const wrong = await call('mia@judge.test', month(), 'wrong');
  const none = await call('mia@judge.test', month(), 'none');
  if (ok(wrong)) problems.push('the payment service is believed with the wrong secret');
  if (ok(none)) problems.push('the payment service is believed with no secret at all');
  if ((await reads(who.mia!, [notice.mark])).length > 0) problems.push('a member who has not paid, and whom a call with no right to be believed named, reads the notices');
  const right = await call('mia@judge.test', month(), 'right');
  if (!ok(right)) problems.push(`the payment service's call with the right secret answered ${short(right)}`);
  else {
    if ((await reads(who.mia!, [notice.mark])).length === 0) problems.push('a member who has paid for this month cannot read the notices');
    if ((await reads(who.noor!, [notice.mark])).length > 0) problems.push('a member who has not paid reads the notices');
    if ((await reads(who.ola!, [notice.mark])).length > 0) problems.push('a member who has never paid reads the notices');
    // paying for last month does not make this month's
    const last = await call('noor@judge.test', month(1), 'right');
    if (!ok(last)) problems.push(`the payment service told of last month's payment and the app answered ${short(last)}`);
    else if ((await reads(who.noor!, [notice.mark])).length > 0) problems.push("a member who paid for last month only reads this month's notices");
    // the treasurer sees, next to each member, whether they have paid this month: read from a field judge.json names, or else from the page the treasurer is given
    const shown = await treasurerSeesPaid(run, who.dee!, details, { paid: mark.mia!, lastMonth: mark.noor!, never: mark.ola! });
    if (shown.problem) problems.push(shown.problem);
    seen = shown.how;
  }
  void t;
  verdict(run, 'club-payments', problems, `the payment service is believed only with the shared secret; a member who paid for this month reads the notices and one who did not (or paid for last month) cannot; who has paid next to each member: ${seen}`);
}

/** What a treasurer's page says of a member who has paid, from the words after the member's mark up to the next member's. */
function paidWord(segment: string): 'paid' | 'unpaid' | 'none' {
  if (/\b(not paid|unpaid|has not paid|hasn't paid|not yet paid|overdue|owing|owes|outstanding|payment due|no)\b|✗|✘|❌/.test(segment)) return 'unpaid';
  if (/\b(paid|yes|up to date|up-to-date)\b|✓|✔|✅/.test(segment)) return 'paid';
  return 'none';
}

/**
 * "The treasurer sees, next to each member, whether they have paid this month." Looked for where it can be, without a name judge.json was never told to give: in the treasurer's list when judge.json maps a field for it,
 * else in the pages the treasurer gets by following the links of the home page (the page that lists the members). Says how it was seen; a problem only when what is shown is wrong; when it cannot be read at all, that
 * part alone is not checked, and says why.
 */
async function treasurerSeesPaid(run: Run, treasurer: Client, details: Bound, m: { paid: string; lastMonth: string; never: string }): Promise<{ problem?: string; how: string }> {
  const key = details.fields.get(run.e.club!.paid)?.key;
  if (key) {
    const got = await list(treasurer, details);
    const rowOf = (mark: string) => got.rows?.find((r) => JSON.stringify(r).includes(mark));
    const isPaid = (r: unknown) => ((v) => v === true || v === 1 || v === 'true' || v === 'yes')(at(r, key));
    const [a, b, c] = [rowOf(m.paid), rowOf(m.lastMonth), rowOf(m.never)];
    if (!a || !b || !c) return { problem: "the treasurer does not see the members' rows to tell who has paid", how: 'read from the field judge.json names' };
    if (!isPaid(a)) return { problem: 'the treasurer does not see that a member who has paid this month has paid', how: 'read from the field judge.json names' };
    if (isPaid(b) || isPaid(c)) return { problem: `the treasurer sees a member who ${isPaid(b) ? 'paid only for last month' : 'has not paid'} as having paid`, how: 'read from the field judge.json names' };
    return { how: 'read from the field judge.json names: true for the member who paid, false for the one who paid last month and the one who never paid' };
  }
  const home = run.j?.home ?? '/';
  const pages: string[] = [];
  const first = await treasurer.page(home);
  const queue = [first.text];
  const seen = new Set<string>([home]);
  for (const m2 of first.text.matchAll(/href="(\/[^"#?]*)/g)) {
    const path = m2[1]!;
    if (seen.has(path) || seen.size > 14 || /^\/(api|assets|_)/.test(path) || /\.\w{2,5}$/.test(path) || /sign-?out|log-?out/i.test(path)) continue;
    seen.add(path);
    const page = await treasurer.page(path);
    if (page.status === 200) queue.push(page.text);
  }
  for (const html of queue) if (fold(visibleText(html)).includes(fold(m.paid)) && fold(visibleText(html)).includes(fold(m.lastMonth))) pages.push(fold(visibleText(html)));
  if (pages.length === 0) return { how: 'not checked, because judge.json names no field for it and none of the pages the treasurer reaches from the home page lists the members' };
  // the words after each member's mark, up to the next member's: what the page says of whether they have paid
  const marks = [m.paid, m.lastMonth, m.never].map((x) => fold(x));
  const verdicts = pages.map((text) => {
    const at_ = marks.map((x) => text.indexOf(x));
    const all = [...new Set(at_.filter((i) => i >= 0))].sort((a, b) => a - b);
    const word = (i: number) => {
      const next = all.find((x) => x > i) ?? i + 220;
      return paidWord(text.slice(i + 8, Math.min(next, i + 220)));
    };
    return at_.map((i) => (i < 0 ? 'none' : word(i)));
  });
  const wrong = verdicts.find((v) => v[1] === 'paid' || v[2] === 'paid' || v[0] === 'unpaid');
  if (wrong) return { problem: `the page that lists the members shows ${wrong[0] === 'unpaid' ? 'a member who has paid this month as not paid' : `a member who ${wrong[1] === 'paid' ? 'paid only for last month' : 'never paid'} as paid`}`, how: 'read from the page the treasurer reaches from the home page' };
  const right = verdicts.find((v) => v[0] === 'paid');
  if (!right) return { how: 'not checked, because judge.json names no field for it and the page that lists the members says nothing of it in words the judge reads (paid, yes, a tick)' };
  return { how: 'read from the page the treasurer reaches from the home page: the member who paid is shown as paid, the other two are not' };
}

// ================================================================================================ the crews

interface TeamWorld {
  teams: Record<string, string>;
}

const teamWorld = new WeakMap<Run, TeamWorld>();

/** A row of a kind in a team: the plan's row with a mark, the team's id under the key the app gave. */
function inTeam(run: Run, b: Bound, team: string, t: string, i = 0): { body: Record<string, unknown>; mark: string } {
  // the row's own mark is made from the tag alone, so that it never contains the mark of a row the plan added (a mark that is a part of another is no mark)
  const row: Row = { ...base(run, b.kind.id, i % (run.e.rows[b.kind.id]!.length)) };
  const f = markerField(b);
  if (f) row[f] = `Row ${t}`;
  return { body: { ...bodyOf(b, row, run.ids, run.j!), [b.decl.teamKey!]: team }, mark: markerOf(b, row) ?? t };
}

async function makeTeam(run: Run, who: Client, name: string): Promise<{ id?: string; reply: Reply }> {
  const create = run.j!.teams!.create;
  const reply = await run.step(who, create, { name });
  const id = at(reply.json, create.id ?? 'id');
  return { reply, ...(id !== undefined && id !== null ? { id: String(id) } : {}) };
}

/** The person makes the link do its work: followed as a page when the app's link is an address, through `accept` when judge.json gives one. */
async function follow(run: Run, who: Client, link: string): Promise<Reply> {
  const accept = run.j!.teams!.accept;
  let path = link;
  try {
    const u = new URL(link, run.origin);
    path = u.pathname + u.search;
  } catch {}
  if (accept?.path) {
    const token = /[?&]token=([^&]+)/.exec(path)?.[1] ?? path.split(/[/?]/).filter(Boolean).pop() ?? link;
    return who.call(accept.method ?? 'POST', fill(accept.path, { token }), { send: 'json', fields: { token } });
  }
  return who.page(path);
}

async function invite(run: Run, lead: Client, team: string, email: string, role: 'lead' | 'member'): Promise<{ reply: Reply; link?: string }> {
  const t = run.j!.teams!;
  const reply = await run.step(lead, t.invite, { team, email, role: t.roles?.[role] ?? role });
  const link = at(reply.json, t.invite.link ?? 'link');
  return { reply, ...(typeof link === 'string' && link ? { link } : {}) };
}

/** The first person makes a crew and every kind's rows go into it (the team's id is sent with each row they add). */
export async function crewsSetup(run: Run): Promise<void> {
  const A = run.A;
  if (!A) return;
  const made = await makeTeam(run, A, 'Crew Alpha');
  if (!made.id) {
    run.teamProblem = `making a team answered ${short(made.reply)}${made.reply.json ? '' : ' and no id was found at teams.create.id'}`;
    return;
  }
  teamWorld.set(run, { teams: { alpha: made.id } });
  for (const kind of run.e.teams!.kinds) {
    const b = run.bound.get(kind);
    if (b?.decl.teamKey) b.extras.push({ name: '__team', key: b.decl.teamKey, value: made.id });
  }
}

export async function crews(run: Run): Promise<void> {
  const spec = run.e.teams!;
  const A = run.A;
  const world = teamWorld.get(run);
  const kinds = spec.kinds.map((k) => run.bound.get(k)).filter((b): b is Bound => !!b?.decl.list && !!b.decl.add && !!b.decl.teamKey);
  const ids4 = ['teams-isolation', 'teams-invite', 'teams-two', 'teams-removal'];
  if (kinds.length < spec.kinds.length) return run.skip(ids4, 'judge.json gives no usable "list", "add" and "teamKey" for every kind');
  if (!A || !world) return run.rest(ids4, run.teamProblem || 'the first person could not sign in or make a team');
  const alpha = world.teams.alpha!;
  const people: Record<string, Client> = {};
  const person = async (name: string) => (people[name] ??= (await run.makePerson(name)).client);
  const markers = async (team: string, who: Client, prefix: string) => {
    const out: string[] = [];
    for (const b of kinds) {
      const t = `${prefix}${tag()}`;
      const { body, mark } = inTeam(run, b, team, t);
      const sent = await add(who, b, body);
      if (!ok(sent.reply)) return { marks: out, failed: `${b.name}: adding a row to the team answered ${short(sent.reply)}`, ids: [] as string[] };
      out.push(mark);
    }
    return { marks: out, failed: '', ids: [] as string[] };
  };
  const seesAll = async (who: Client, marks: string[]) => {
    const seen: string[] = [];
    for (const b of kinds) seen.push(...(await sees(who, b, marks)).seen);
    return seen;
  };

  // ---- isolation: a second crew with its own person
  {
    const problems: string[] = [];
    const B = await person('bea');
    const made = await makeTeam(run, B, 'Crew Beta');
    if (!made.id) return run.rest(ids4, `a second person could not make a team (${short(made.reply)})`);
    world.teams.beta = made.id;
    const x = await markers(alpha, A, 'alpharow');
    const y = await markers(made.id, B, 'betarow');
    if (x.failed || y.failed) problems.push(x.failed || y.failed);
    const aSees = await seesAll(A, [...x.marks, ...y.marks]);
    if (y.marks.some((m) => aSees.includes(m))) problems.push("the first crew's lead sees the second crew's rows");
    const bSees = await seesAll(B, [...x.marks, ...y.marks]);
    if (x.marks.some((m) => bSees.includes(m))) problems.push("the second crew's lead sees the first crew's rows");
    if (!y.marks.every((m) => bSees.includes(m))) problems.push("the second crew's lead does not see their own crew's rows");
    for (const b of kinds) {
      const s = await run.spare(b);
      if (!s?.id) {
        problems.push(`${b.name}: a row of the first crew to try on could not be added`);
        continue;
      }
      problems.push(...(await run.probes(B, "someone from another crew", b, { id: s.id, tag: s.tag }, run.markersOf(b))));
      problems.push(...(await run.intact(b, { id: s.id, tag: s.tag })));
      const intrude = inTeam(run, b, alpha, 'intrudezq');
      const sent = await add(B, b, intrude.body);
      const after = await sees(A, b, ['intrudezq']);
      if (ok(sent.reply) || after.seen.length > 0) problems.push(`${b.name}: someone from another crew put a row into this crew (${short(sent.reply)})`);
    }
    verdict(run, 'teams-isolation', problems, `two crews, ${kinds.length} kinds each: nobody reads, lists, changes or removes another crew's row by any address (the id guessed too), and cannot add one to a crew they are not in`);
  }

  // ---- invitations
  const flows = async (): Promise<void> => {
    const problems: string[] = [];
    const pat = await person('pat');
    const first = await invite(run, A, alpha, 'pat@judge.test', 'member');
    if (!ok(first.reply) || !first.link) problems.push(`a lead's invitation answered ${short(first.reply)}${ok(first.reply) ? ' with no link at teams.invite.link' : ''}`);
    else {
      const used = await follow(run, pat, first.link);
      const mine = await markers(alpha, pat, 'patrow');
      if (mine.failed) problems.push(`a person who followed the link cannot add to the crew (${mine.failed})`);
      const seen = await seesAll(pat, run.markersOf(kinds[0]!));
      if (seen.length === 0 && !mine.failed) problems.push(`a person who followed the link (${used.status}) does not see the crew's rows`);
      // a link is used once
      const other = await person('uma');
      await follow(run, other, first.link);
      if ((await seesAll(other, run.markersOf(kinds[0]!))).length > 0) problems.push('a link that had been used got a second person into the crew');
      // a member does not invite or remove
      const asMember = await invite(run, pat, alpha, 'uma@judge.test', 'member');
      if (ok(asMember.reply) && asMember.link) problems.push('an ordinary member can invite people into the crew');
      const rem = await run.step(pat, run.j!.teams!.remove, { team: alpha, email: 'uma@judge.test' });
      const still = await seesAll(A, run.markersOf(kinds[0]!));
      if (ok(rem) && still.length === 0) problems.push('an ordinary member could take people out of the crew');
      const removeLead = await run.step(pat, run.j!.teams!.remove, { team: alpha, email: 'owner@judge.test' });
      if (ok(removeLead) && (await seesAll(A, run.markersOf(kinds[0]!))).length === 0) problems.push('an ordinary member took the lead out of the crew');
    }
    // a lead made by invitation can invite
    const lena = await person('lena');
    const asLead = await invite(run, A, alpha, 'lena@judge.test', 'lead');
    if (!ok(asLead.reply) || !asLead.link) problems.push(`inviting someone as a lead answered ${short(asLead.reply)}`);
    else {
      await follow(run, lena, asLead.link);
      const ned = await invite(run, lena, alpha, 'ned@judge.test', 'member');
      if (!ok(ned.reply) || !ned.link) problems.push(`a lead who came in by an invitation cannot invite (${short(ned.reply)})`);
    }
    verdict(run, 'teams-invite', problems, 'a lead invites by a link and the role is the one chosen; the link works once; an ordinary member cannot invite or take anyone out; a lead who came in by a link can invite');
  };
  await flows();

  // ---- a person in two crews
  {
    const problems: string[] = [];
    const pat = await person('pat');
    const beta = world.teams.beta!;
    const B = await person('bea');
    const link = await invite(run, B, beta, 'pat@judge.test', 'member');
    if (!ok(link.reply) || !link.link) problems.push(`the second crew's lead's invitation answered ${short(link.reply)}`);
    else {
      await follow(run, pat, link.link);
      const xs = await markers(alpha, pat, 'twoalpha');
      const ys = await markers(beta, pat, 'twobeta');
      if (xs.failed) problems.push(`a person in two crews cannot add to the first (${xs.failed})`);
      if (ys.failed) problems.push(`a person in two crews cannot add to the second (${ys.failed})`);
      const own = [...(await seesAll(A, [...xs.marks, ...ys.marks]))];
      const both = await seesAll(pat, [...xs.marks, ...ys.marks, ...run.markersOf(kinds[0]!)]);
      if (![...xs.marks, ...ys.marks].every((m) => both.includes(m))) problems.push("a person in two crews does not see the rows of both crews");
      if (own.some((m) => ys.marks.includes(m))) problems.push("the first crew's lead sees rows a shared person added to the second crew");
      const gamma = await makeTeam(run, await person('gus'), 'Crew Gamma');
      if (gamma.id) {
        const third = await markers(gamma.id, pat, 'thirdzq');
        const leaked = await seesAll(await person('gus'), ['thirdzq']);
        if (!third.failed || leaked.length > 0) problems.push('a person in two crews can add to a third crew they are not in');
      }
    }
    verdict(run, 'teams-two', problems, 'a person invited into two crews sees the rows of both, adds to either, and cannot add to a third');
  }

  // ---- removal
  {
    const problems: string[] = [];
    const pat = await person('pat');
    const beta = world.teams.beta!;
    const alphaMarks = run.markersOf(kinds[0]!);
    const before = await seesAll(pat, alphaMarks);
    if (before.length === 0) return run.rest(['teams-removal'], 'the person to take out was not in the crew, so taking them out could not be tried');
    const rem = await run.step(A, run.j!.teams!.remove, { team: alpha, email: 'pat@judge.test' });
    if (!ok(rem)) problems.push(`a lead taking a person out of the crew answered ${short(rem)}`);
    else {
      const after = await seesAll(pat, [...alphaMarks, 'patrow', 'twoalpha']);
      if (after.length > 0) problems.push('a person taken out of the crew still sees its rows on their very next request');
      const b0 = kinds[0]!;
      const s = await run.spare(b0);
      if (s?.id) {
        const peek = await Promise.all(
          (await import('./things.ts')).addressesOf(b0, s.id).map((a) => pat.call('GET', a)),
        );
        if (peek.some((r) => ok(r) && said(r).includes(s.tag))) problems.push('a person taken out of the crew can still read a row of it by its address');
        const t = tag();
        const back = await add(pat, b0, inTeam(run, b0, alpha, t).body);
        if (ok(back.reply)) problems.push('a person taken out of the crew can still add to it');
        await remove(A, b0, s.id);
      }
      const keep = await markers(beta, pat, 'afterzq');
      if (keep.failed) problems.push(`a person taken out of one crew lost the other as well (${keep.failed})`);
    }
    verdict(run, 'teams-removal', problems, 'a person taken out of a crew loses its rows on their next request, by list, by address and by adding, and keeps the other crew');
  }
}

// ================================================================================================ the help centre

interface Found {
  id: string;
  slug: string;
  title: string;
  status?: string;
}

async function articles(run: Run): Promise<{ b: Bound; rows: Found[] } | null> {
  const b = run.bound.get(run.e.kb!.kind);
  if (!b || !run.A) return null;
  const got = await list(run.A, b);
  const slugKey = b.fields.get('slug')?.key;
  const titleKey = b.fields.get('title')?.key;
  if (!got.rows || !slugKey || !titleKey) return null;
  return { b, rows: got.rows.map((r) => ({ id: idOf(b, r) ?? '', slug: String(at(r, slugKey) ?? ''), title: String(at(r, titleKey) ?? '') })) };
}

const page = async (run: Run, template: string, values: Record<string, string>): Promise<Reply> => run.V.page(fill(template, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v]))));

/** The titles a page says, in the order it says them. */
function titlesIn(reply: Reply, all: string[]): string[] {
  all = [...new Set(all)];
  const text = fold(visibleText(reply.text));
  return all
    .map((t) => ({ t, at: text.indexOf(fold(t)) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.t);
}

export async function kb(run: Run): Promise<void> {
  const spec = run.e.kb!;
  const site = run.j!.site;
  const ids5 = ['kb-reading', 'kb-search', 'kb-category', 'kb-address', 'kb-drafts'];
  const found = await articles(run);
  if (!found) return run.skip(ids5, 'judge.json says nothing of where an article\'s address (the slug) is read, or has no list for the articles');
  const { b, rows } = found;
  const titles = (run.e.rows[spec.kind] ?? []).map((r) => String(r.title));
  const bySlug = new Map(rows.map((r) => [r.title, r]));
  const planRows = run.e.rows[spec.kind]!;
  const status = (title: string) => String(planRows.find((r) => r.title === title)?.status ?? 'draft');
  const published = titles.filter((t) => status(t) === 'published');

  // ---- reading
  if (!site?.article) run.skip(['kb-reading', 'kb-address', 'kb-drafts'], 'judge.json has no site.article (the address of an article page)');
  else {
    const problems: string[] = [];
    for (const title of [published[0]!, published[7]!, published[20]!, published[40]!].filter(Boolean)) {
      const r = bySlug.get(title);
      if (!r) {
        problems.push(`"${title}" was added and is not in the owner's list`);
        continue;
      }
      if (r.slug !== slugify(title)) problems.push(`the address of "${title}" is "${r.slug}", not "${slugify(title)}", its title in lower case with hyphens`);
      const p = await page(run, site.article, { slug: r.slug });
      const text = visibleText(p.text);
      const body = String(planRows.find((x) => x.title === title)?.text ?? '').split('.')[0]!;
      if (p.status !== 200) problems.push(`the page of "${title}" at ${site.article.replace('{slug}', r.slug)} answers ${p.status}`);
      else if (!fold(text).includes(fold(title)) || !fold(text).includes(fold(body))) problems.push(`the page of "${title}" does not say its title and its text`);
    }
    const draft = bySlug.get(spec.draft.title);
    if (draft) {
      const p = await page(run, site.article, { slug: draft.slug || slugify(spec.draft.title) });
      if (p.status === 200 && fold(visibleText(p.text)).includes(fold(spec.draft.title))) problems.push('a draft is shown at its address');
    }
    verdict(run, 'kb-reading', problems, 'published articles are at an address made from the title in lower case with hyphens, with their title and text in the HTML; a draft shows nothing');
  }

  // ---- search
  if (!site?.search) run.skip(['kb-search'], 'judge.json has no site.search (the address of a search, with {q})');
  else {
    const problems: string[] = [];
    for (const c of spec.searches) {
      const r = await page(run, site.search, { q: encodeURIComponent(c.q) });
      if (r.status !== 200) {
        problems.push(`a search for "${c.q}" answers ${r.status}`);
        continue;
      }
      const got = titlesIn(r, titles);
      if (JSON.stringify(got) !== JSON.stringify(c.expect)) problems.push(`a search for "${c.q}" shows ${got.length} article(s)${got.length ? ` (${got.slice(0, 2).join(' | ')}…)` : ''}, the maker's rule gives ${c.expect.length}${c.expect.length ? ` (${c.expect.slice(0, 2).join(' | ')}…)` : ''}${got.length === c.expect.length ? ' in another order' : ''}`);
    }
    verdict(run, 'kb-search', problems, `${spec.searches.length} searches show exactly the published articles with every word, title matches first, alphabetical, in the HTML (no draft, none when nothing matches)`);
  }

  // ---- category pages
  if (!site?.category) run.skip(['kb-category'], 'judge.json has no site.category (the address of a category page, with {category} or {categoryName})');
  else {
    const problems: string[] = [];
    for (const [category, expect] of Object.entries(spec.categories)) {
      const r = await page(run, site.category, { category: slugify(category), categoryName: encodeURIComponent(category) });
      if (r.status !== 200) {
        problems.push(`the page of ${category} answers ${r.status}`);
        continue;
      }
      const got = titlesIn(r, [...new Set([...titles, ...Object.values(spec.categories).flat()])]);
      if (JSON.stringify(got) !== JSON.stringify(expect)) problems.push(`the page of ${category} lists ${got.length} article(s), the maker's rule gives ${expect.length}${got.length === expect.length ? ' in another order' : ''}`);
    }
    verdict(run, 'kb-category', problems, `${Object.keys(spec.categories).length} category pages list their published articles in alphabetical order and nothing else`);
  }

  // ---- the address stays
  if (site?.article) {
    const problems: string[] = [];
    const r = bySlug.get(spec.retitle.title);
    const row = planRows.find((x) => x.title === spec.retitle.title);
    if (!r || !row || !b.decl.one || !r.id) problems.push('the article to retitle could not be found or judge.json has no address to change one');
    else {
      const edited = await change(run.A!, b, r.id, bodyOf(b, { ...resolveRow(row, run.now), title: spec.retitle.to }, run.ids, run.j!));
      if (!ok(edited)) problems.push(`changing a title answered ${short(edited)}`);
      else {
        const after = (await articles(run))?.rows.find((x) => x.id === r.id);
        if (after?.slug !== r.slug) problems.push(`the address of an article changed with its title (${r.slug} became ${after?.slug})`);
        const p = await page(run, site.article, { slug: r.slug });
        if (p.status !== 200 || !fold(visibleText(p.text)).includes(fold(spec.retitle.to))) problems.push('the old address does not show the article with its new title');
      }
      await change(run.A!, b, r.id, bodyOf(b, resolveRow(row, run.now), run.ids, run.j!));
    }
    verdict(run, 'kb-address', problems, "an article's address is the same after its title is changed, and shows the new title");
  }

  // ---- drafts
  if (site?.article && site.search && site.category) {
    const problems: string[] = [];
    const d = bySlug.get(spec.draft.title);
    const row = planRows.find((x) => x.title === spec.draft.title);
    if (!d || !row || !d.id) return run.fail('kb-drafts', 'the draft article could not be found in the owner\'s list');
    const V = run.V;
    const hidden = async (label: string) => {
      const out: string[] = [];
      const s = await page(run, site.search!, { q: encodeURIComponent(spec.draft.word) });
      const s2 = await page(run, site.search!, { q: encodeURIComponent(spec.draft.title) });
      const c = await page(run, site.category!, { category: slugify(spec.draft.category), categoryName: encodeURIComponent(spec.draft.category) });
      const a = await page(run, site.article!, { slug: d.slug });
      const lst = await V.call('GET', b.decl.list!.path);
      for (const [where, r] of [['a search for its word', s], ['a search for its title', s2], ['its category page', c]] as const) if (fold(visibleText(r.text)).includes(fold(spec.draft.title))) out.push(`${label}: ${where} shows it`);
      if (a.status === 200 && fold(visibleText(a.text)).includes(fold(spec.draft.title))) out.push(`${label}: its address shows it`);
      if (ok(lst) && said(lst).includes(spec.draft.title)) out.push(`${label}: a visitor's list of articles has it`);
      return out;
    };
    problems.push(...(await hidden('a draft')));
    // a visitor cannot write
    const addr = (await import('./things.ts')).addressesOf(b, d.id);
    const hack = bodyOf(b, { ...resolveRow(row, run.now), title: 'Hacked by a visitor' }, run.ids, run.j!);
    const added = await add(V, b, hack);
    for (const address of addr) {
      await V.call('PATCH', address, { send: 'json', fields: hack });
      await V.call('DELETE', address);
    }
    const afterWrite = await list(run.A!, b);
    const text = JSON.stringify(afterWrite.rows ?? []);
    if (ok(added.reply) || text.includes('Hacked by a visitor')) problems.push('a visitor can write articles');
    if (!text.includes(spec.draft.title)) problems.push('a visitor could remove an article');
    // publishing shows it, a draft again hides it
    const set = async (to: 'published' | 'draft') => change(run.A!, b, d.id, bodyOf(b, { ...resolveRow(row, run.now), status: to }, run.ids, run.j!));
    const pub = await set('published');
    if (!ok(pub)) problems.push(`publishing a draft answered ${short(pub)}`);
    else {
      const s = await page(run, site.search, { q: encodeURIComponent(spec.draft.word) });
      const a = await page(run, site.article, { slug: d.slug });
      if (!fold(visibleText(s.text)).includes(fold(spec.draft.title))) problems.push('a draft that was published is not found by a search');
      if (a.status !== 200) problems.push(`a draft that was published is not at its address (${a.status})`);
      await set('draft');
      problems.push(...(await hidden('a published article made a draft again')));
    }
    verdict(run, 'kb-drafts', problems, 'a draft is not in a search, a category page, at its address or in a visitor\'s list; a visitor cannot write; publishing shows it and making it a draft again hides it');
  } else run.skip(['kb-drafts'], 'judge.json has no site.article, site.search and site.category');
}

// ================================================================================================ the booking page

async function slotsOn(run: Run, day: string): Promise<string[] | null> {
  const s = run.j!.slots;
  if (!s) return null;
  const r = await run.V.call('GET', fill(s.path, { date: day }));
  const rows = rowsOf(r, s.rows);
  if (!rows) return null;
  const zone = run.e.booking!.zone;
  const out: string[] = [];
  for (const item of rows) {
    const raw = typeof item === 'string' ? item : (at(item, s.time ?? 'time') ?? at(item, 'start') ?? at(item, 'startsAt'));
    if (typeof raw !== 'string') return null;
    const local = /^\d{1,2}:\d{2}$/.test(raw) ? raw.padStart(5, '0') : /^\d{1,2}:\d{2}(:\d{2})?$/.test(raw) ? raw.slice(0, 5).padStart(5, '0') : localTime(raw, zone);
    if (!local) return null;
    out.push(local);
  }
  return [...new Set(out)].sort();
}

export async function booking(run: Run): Promise<void> {
  const spec = run.e.booking!;
  const a = run.e.actions!.find((x) => x.id === spec.action)!;
  const ids5 = ['booking-slots', 'booking-once', 'booking-cancel', 'booking-dayoff', 'booking-timezone'];
  const bookings = run.bound.get(spec.bookings);
  if (!run.actionDecl(a)) return run.skip(ids5, `judge.json has no entry in "actions" for ${a.id} (how a visitor books)`);
  if (!run.j!.slots) return run.skip(ids5, 'judge.json has no "slots" (where the free slots of a day are read as JSON)');
  if (!bookings?.decl.list || !run.A) return run.skip(ids5, 'judge.json has no list for the bookings, or the owner could not sign in');
  const d = spec.days;
  const eq = (a: string[] | null, b: string[]) => a !== null && JSON.stringify(a) === JSON.stringify(b);
  const show = (s: string[] | null) => (s === null ? 'no list of slots' : s.length ? s.join(' ') : 'none');
  const book = (day: string, time: string, name: string, as?: Client) => run.callAction(a, { date: day, time, name, email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@judge.test` }, as);
  const owner = async () => rowsOf(await run.A!.call('GET', bookings.decl.list!.path), bookings.decl.list!.rows) ?? [];
  const nameKey = bookings.fields.get('name')?.key ?? 'name';

  // ---- the free slots
  {
    const problems: string[] = [];
    for (const [label, day] of [['a summer Monday', d.summer], ['a winter Monday', d.winter], ['a Wednesday', d.wednesday], ['a Sunday', d.sunday]] as const) {
      const got = await slotsOn(run, day);
      const want = spec.slots[label === 'a summer Monday' ? 'summer' : label === 'a winter Monday' ? 'winter' : label === 'a Wednesday' ? 'wednesday' : 'sunday'];
      if (!eq(got, want)) problems.push(`${label} (${day}) offers ${show(got)}, the maker's hours give ${show(want)}`);
    }
    for (const c of a.refused) {
      const lacking = run.unmapped(a, c.in);
      if (lacking.length > 0) continue;
      const r = await run.callAction(a, c.in);
      if (!r) continue;
      if (ok(r.reply)) problems.push(`a booking with ${c.label} was accepted`);
      else if (!refused(r.reply)) problems.push(`a booking with ${c.label} answered ${short(r.reply)}, a refusal is a 4xx`);
    }
    const first = spec.slots.summer[1]!;
    const r = await book(d.summer, first, 'Solo Guest');
    if (!r || !ok(r.reply)) problems.push(`booking a free slot answered ${r ? short(r.reply) : 'nothing'}`);
    else {
      const after = await slotsOn(run, d.summer);
      if (!eq(after, spec.slots.summer.filter((t) => t !== first))) problems.push(`after booking ${first} the day offers ${show(after)}`);
      if (!eq(await slotsOn(run, d.winter), spec.slots.winter)) problems.push('booking a summer slot changed the winter day');
      const again = await book(d.summer, first, 'Second Guest');
      if (again && ok(again.reply)) problems.push('a slot that was booked was booked again');
      const mine = (await owner()).filter((x) => String(at(x, nameKey)).includes('Solo Guest'));
      if (mine.length !== 1) problems.push(`the owner sees ${mine.length} bookings of the visitor, not 1`);
      const peek = await run.V.call('GET', bookings.decl.list!.path);
      if (ok(peek) && said(peek).includes('Solo Guest')) problems.push('a visitor reads the bookings');
    }
    verdict(run, 'booking-slots', problems, "each day offers the slots the maker's hours give (summer and winter, a Wednesday, a Sunday with none); a booked slot is gone and cannot be booked again; times that are no slot, an email that is no address, no name and words for a day are refused; a visitor does not read the bookings");
  }

  // ---- once only
  {
    const problems: string[] = [];
    const time = spec.slots.summer[3]!;
    const racers = Array.from({ length: 6 }, (_, i) => run.newClient(`racer${i}`));
    const replies = await Promise.all(racers.map((c, i) => book(d.summer, time, `Racer ${i + 1}`, c)));
    const accepted = replies.filter((r) => r && ok(r.reply)).length;
    const bad = replies.filter((r) => !r || (!ok(r.reply) && !refused(r.reply)));
    if (accepted !== 1) problems.push(`${accepted} of 6 requests for the same slot at the same moment were accepted, not exactly 1`);
    if (bad.length > 0) problems.push(`a refused booking answered ${bad[0] ? short(bad[0].reply) : 'nothing'}, a refusal is a 4xx`);
    const held = (await owner()).filter((x) => String(at(x, nameKey)).startsWith('Racer'));
    if (held.length !== 1) problems.push(`the owner has ${held.length} bookings for that slot, not 1`);
    if ((await slotsOn(run, d.summer))?.includes(time)) problems.push('the slot is still offered after it was booked');
    verdict(run, 'booking-once', problems, `6 requests for one slot at the same moment: exactly one accepted, the others refused, one booking, the slot gone`);
  }

  // ---- cancelling
  {
    const problems: string[] = [];
    const mine = (await owner()).find((x) => String(at(x, nameKey)).includes('Solo Guest'));
    const id = mine ? idOf(bookings, mine) : undefined;
    if (!id || !bookings.decl.one) problems.push('the visitor\'s booking could not be found by the owner, or judge.json has no address to cancel one');
    else {
      const first = spec.slots.summer[1]!;
      const stranger = await remove(run.V, bookings, id);
      if (stranger && ok(stranger)) problems.push('a visitor cancelled a booking');
      if ((await owner()).filter((x) => String(at(x, nameKey)).includes('Solo Guest')).length !== 1) problems.push('a booking a visitor tried to cancel is gone');
      const done = await remove(run.A!, bookings, id);
      if (!done || !ok(done)) problems.push(`the owner cancelling answered ${done ? short(done) : 'no address'}`);
      else {
        if ((await owner()).some((x) => String(at(x, nameKey)).includes('Solo Guest'))) problems.push('a cancelled booking is still in the owner\'s list');
        if (!(await slotsOn(run, d.summer))?.includes(first)) problems.push('a cancelled booking\'s slot is not free again');
        const again = await book(d.summer, first, 'Third Guest');
        if (!again || !ok(again.reply)) problems.push(`a slot that was cancelled could not be booked (${again ? short(again.reply) : 'nothing'})`);
      }
    }
    verdict(run, 'booking-cancel', problems, "the owner cancels a booking, its slot is free again and can be booked; a visitor cannot cancel");
  }

  // ---- a day off
  {
    const problems: string[] = [];
    const got = await slotsOn(run, d.off);
    if (!eq(got, [])) problems.push(`a day off (${d.off}, a Monday) offers ${show(got)}`);
    const r = await book(d.off, spec.slots.summer[0]!, 'Offday Guest');
    if (r && ok(r.reply)) problems.push('a day off was booked');
    const other = await slotsOn(run, d.wednesday);
    if (!eq(other, spec.slots.wednesday)) problems.push(`the days that are not off changed (${show(other)})`);
    verdict(run, 'booking-dayoff', problems, 'a day off has no free slots and cannot be booked; the other days are as they were');
  }

  // ---- the time zone on the page
  if (!run.j!.site?.slots) run.skip(['booking-timezone'], 'judge.json has no site.slots (the address of the page a visitor books on, with {date})');
  else {
    const problems: string[] = [];
    for (const [label, day, want] of [['summer time', d.summer, spec.slots.summer], ['winter time', d.winter, spec.slots.winter]] as const) {
      const now = (await slotsOn(run, day)) ?? [];
      const r = await run.V.page(fill(run.j!.site!.slots!, { date: day }));
      const text = visibleText(r.text);
      const missing = want.filter((t) => now.includes(t) && !new RegExp(`(^|[^0-9])0?${t.replace(/^0/, '')}([^0-9]|$)`).test(text));
      if (r.status !== 200) problems.push(`the booking page for ${day} answers ${r.status}`);
      else if (missing.length > 0) problems.push(`the page for ${day} (${label}) does not show ${missing.join(', ')}, the times of the maker's zone`);
    }
    verdict(run, 'booking-timezone', problems, `the booking page shows the free times in ${spec.zone} time on a summer day and a winter day`);
  }
}
