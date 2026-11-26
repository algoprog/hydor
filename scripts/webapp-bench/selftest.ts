// Is the judge fair? Before anyone reads a number from a comparison, the judge that scores every run is shown to be right about apps written by hand.
//   node scripts/webapp-bench/selftest.ts [--keep] [--port 4760] [--only <ids>]
// It makes correct apps by hand (fixtures/hand/: plain Node and SQLite, with the few calls of Express that lite.js has; each with its own judge.json) and requires every line of each
// to pass: the kiln waiting list twice (with an email for each name, and without one, because the maker never asks for an email), the translator's clients and jobs, and each of
// the four larger descriptions (a rowing club, crews, a help centre, a booking page). Then it makes spoiled copies of them, each wrong in one way a careless builder would be (a row
// someone else can read, a needed field not needed, a wrong number on the home page, a secret in a file a browser gets, a payment believed with any secret, a removal that is said
// and not done, a draft that is found, two bookings in one slot, and more), and for each the judge must fail the lines about that mistake and no other. Everything it makes is in a
// temp folder and is removed (--keep leaves it). Needs nothing from the network: the apps' one package, better-sqlite3, is this repository's own. About twenty minutes.
// `--only hand-club,club-` runs only the apps and spoiled copies whose id starts so (for working on the judge; the proof is a run without it). The four descriptions that are mostly
// their own logic are proved by logic.test.ts. Also read here, with no app: every brief's plan and the instructions (planChecks).
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { LINE_TEXT } from './expect.ts';
import { type Result, judge } from './judge.ts';
import { planChecks } from './plans.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const FIXED_SECRET = 'judge-secret-0123456789abcdef0123456789abcd';

const { values } = parseArgs({ options: { keep: { type: 'boolean' }, port: { type: 'string' }, only: { type: 'string' } } });
const only = values.only?.split(',').map((x) => x.trim()).filter(Boolean);
const wanted = (id: string): boolean => !only || only.some((o) => id.startsWith(o));
const root = mkdtempSync(join(tmpdir(), 'webapp-bench-selftest-'));
const port = Number(values.port ?? 4760);
const mask = (text: string) => text.replaceAll(root, '<tmp>').replaceAll(REPO, '<repo>').replaceAll(homedir(), '<home>');
const say = (text = '') => console.log(mask(text));
const failures: string[] = [];
let checks = 0;
function expect(ok: unknown, message: string): void {
  checks++;
  say(`  ${ok ? 'ok   ' : 'FAIL '} ${message}`);
  if (!ok) failures.push(message);
}

function edit(file: string, from: string | RegExp, to: string): void {
  const text = readFileSync(file, 'utf8');
  const next = text.replace(from, to);
  if (next === text) throw new Error(`the spoiling edit found nothing to change in ${file}`);
  writeFileSync(file, next);
}

/** The one package an app of fixtures/hand/ needs, this repository's own better-sqlite3, linked into its node_modules (nothing is installed). */
function linkPackages(dir: string): void {
  mkdirSync(join(dir, 'node_modules'), { recursive: true });
  symlinkSync(join(REPO, 'node_modules', 'better-sqlite3'), join(dir, 'node_modules', 'better-sqlite3'));
}

/** A copy of an app to spoil: its files, and its package linked again. */
function copyApp(from: string, to: string): void {
  cpSync(from, to, { recursive: true, filter: (src) => !/\/(node_modules|data)$/.test(src) });
  linkPackages(to);
}

// ------------------------------------------------------------------------------------------------ the correct apps

const apps = () => join(root, 'apps');
const base = (id: string) => join(apps(), id);

const fixture = (...parts: string[]) => join(HERE, 'fixtures', ...parts);

function hand(dir: string, which: 'kiln' | 'kiln-no-email' | 'translator' | 'club' | 'crews' | 'help-centre' | 'booking'): void {
  cpSync(fixture('hand', which), dir, { recursive: true });
  cpSync(fixture('hand', 'lite.js'), join(dir, 'lite.js'));
  linkPackages(dir);
}

// ------------------------------------------------------------------------------------------------ the spoiled copies

interface Spoil {
  id: string;
  /** The app it is a copy of. */
  of: string;
  brief: string;
  wrong: string;
  /** The lines that must fail (and no other). */
  fails: string[];
  make: (dir: string) => void;
  /** What else must be so of the judge's answer (lines left out of the count, and what the others say). */
  also?: (result: Result) => { ok: boolean; say: string }[];
}

/** A secret written into a file that browsers get: its value is fixed in judge.json, as a builder who had put it there would have had to know it. */
function leakSecret(dir: string, folder: string, name: string): void {
  mkdirSync(join(dir, folder), { recursive: true });
  writeFileSync(join(dir, folder, 'config.js'), `window.APP_CONFIG = { key: "${FIXED_SECRET}" };\n`);
  edit(join(dir, 'judge.json'), `"${name}": "{secret}"`, `"${name}": "${FIXED_SECRET}"`);
}

const SPOILS: Spoil[] = [
  // ---- the kiln, by hand
  { id: 'hand-kiln-list-open', of: 'hand-kiln', brief: '01-kiln-share', wrong: 'the waiting list can be read by anybody', fails: ['visitor-shut-out'], make: (dir) => {
    copyApp(base('hand-kiln'), dir);
    edit(join(dir, 'server.js'), "app.get('/api/signups', needPerson, ", "app.get('/api/signups', ");
  } },
  { id: 'hand-kiln-name-optional', of: 'hand-kiln', brief: '01-kiln-share', wrong: 'the name is left optional on the list (the maker needs it)', fails: ['required-fields'], make: (dir) => {
    copyApp(base('hand-kiln'), dir);
    const file = join(dir, 'server.js');
    edit(file, "const name = text(req.body.name, 200);\n  const whatFor", "const name = text(req.body.name, 200) || '';\n  const whatFor");
    edit(file, "  if (!name) return res.status(400).json({ error: 'Please give your name.' });\n", '');
  } },
  { id: 'hand-kiln-signup-open', of: 'hand-kiln', brief: '01-kiln-share', wrong: 'anyone can make an account (the maker said nobody else)', fails: ['signup-policy'], make: (dir) => {
    copyApp(base('hand-kiln'), dir);
    edit(join(dir, 'server.js'), "  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return res.status(403).json({ error: 'Sign-up is closed: only the owner has an account.' });\n", '');
  } },
  { id: 'hand-kiln-secret-in-public', of: 'hand-kiln', brief: '01-kiln-share', wrong: "the session secret is written in a file of the public folder", fails: ['no-secret-in-browser'], make: (dir) => {
    copyApp(base('hand-kiln'), dir);
    leakSecret(dir, 'public', 'SESSION_SECRET');
  } },
  { id: 'hand-kiln-forgets', of: 'hand-kiln', brief: '01-kiln-share', wrong: 'the list is kept in memory: it is gone when the app is stopped and started again', fails: ['keeps-after-restart'], make: (dir) => {
    copyApp(base('hand-kiln'), dir);
    edit(join(dir, 'server.js'), "new Database(path.join(dataDir, 'kiln.db'))", "new Database(':memory:')");
  } },
  { id: 'hand-kiln-email-not-checked', of: 'hand-kiln', brief: '01-kiln-share', wrong: 'the app has an email for each name and takes "not an address" for it', fails: ['bad-values'], make: (dir) => {
    copyApp(base('hand-kiln'), dir);
    edit(join(dir, 'server.js'), '/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value.trim()) && value.trim().length <= 200', 'value.trim().length > 0 && value.trim().length <= 200');
  } },
  { id: 'hand-kiln-no-email-name-optional', of: 'hand-kiln-no-email', brief: '01-kiln-share', wrong: 'the app without an email leaves the name optional (the maker must have it)', fails: ['required-fields'], make: (dir) => {
    copyApp(base('hand-kiln-no-email'), dir);
    const file = join(dir, 'server.js');
    edit(file, "const name = text(req.body.name, 200);\n  const whatFor", "const name = text(req.body.name, 200) || '';\n  const whatFor");
    edit(file, "  if (!name) return res.status(400).json({ error: 'Please give your name.' });\n", '');
  } },
  { id: 'hand-kiln-no-email-list-open', of: 'hand-kiln-no-email', brief: '01-kiln-share', wrong: 'the app without an email lets anybody read the list', fails: ['visitor-shut-out'], make: (dir) => {
    copyApp(base('hand-kiln-no-email'), dir);
    edit(join(dir, 'server.js'), "app.get('/api/signups', needPerson, ", "app.get('/api/signups', ");
  } },
  // ---- the club, by hand: the payment service's word, last month's payment, who may change, who may give roles
  { id: 'club-any-secret', of: 'hand-club', brief: '17-rowing-club', wrong: 'the payment service is believed with any secret', fails: ['club-payments'], make: (dir) => {
    copyApp(base('hand-club'), dir);
    edit(join(dir, 'server.js'), 'if (!paymentSecret || given.length !== want.length || !crypto.timingSafeEqual(given, want)) return', 'if (false) return');
  } },
  { id: 'club-last-month-counts', of: 'hand-club', brief: '17-rowing-club', wrong: 'a member who paid for last month only is counted as paid for this month', fails: ['club-payments'], make: (dir) => {
    copyApp(base('hand-club'), dir);
    edit(join(dir, 'server.js'), "SELECT 1 FROM payments WHERE user_id = ? AND month = ?').get(userId, month())", "SELECT 1 FROM payments WHERE user_id = ?').get(userId)");
  } },
  { id: 'club-page-says-paid-for-all', of: 'hand-club-no-paid', brief: '17-rowing-club', wrong: 'with no name for "paid" in judge.json, the treasurer\'s page shows every member as paid', fails: ['club-payments'], make: (dir) => {
    copyApp(base('hand-club-no-paid'), dir);
    edit(join(dir, 'server.js'), "${hasPaid(r.owner_id) ? 'yes' : 'no'}", 'yes');
  } },
  { id: 'club-treasurer-changes', of: 'hand-club', brief: '17-rowing-club', wrong: "the treasurer can change other members' details (the maker said they only look)", fails: ['club-roles'], make: (dir) => {
    copyApp(base('hand-club'), dir);
    edit(join(dir, 'server.js'), "row.owner_id !== req.person.id && req.person.role !== 'owner'", "row.owner_id !== req.person.id && !['owner', 'treasurer'].includes(req.person.role)");
  } },
  { id: 'club-anyone-grants', of: 'hand-club', brief: '17-rowing-club', wrong: 'any member can give themselves a role (the maker said only the chair gives roles); the member made a coach then reads notices unpaid', fails: ['club-roles', 'club-payments'], make: (dir) => {
    copyApp(base('hand-club'), dir);
    edit(join(dir, 'server.js'), "  if (req.person.role !== 'owner') return res.status(403).json({ error: 'Only the chair gives people their roles.' });\n", '');
  } },
  // ---- the crews, by hand: removal, a crew's rows, who invites, a link used twice, a person in two crews
  { id: 'crews-removal-forgotten', of: 'hand-crews', brief: '18-crews', wrong: 'taking a person out of a crew is said to be done and is not', fails: ['teams-removal'], make: (dir) => {
    copyApp(base('hand-crews'), dir);
    edit(join(dir, 'server.js'), "  db.prepare('DELETE FROM members WHERE crew_id = ? AND user_id = ?').run(crew, user.id);\n", '');
  } },
  { id: 'crews-members-invite', of: 'hand-crews', brief: '18-crews', wrong: 'an ordinary member can invite people into the crew', fails: ['teams-invite'], make: (dir) => {
    copyApp(base('hand-crews'), dir);
    edit(join(dir, 'server.js'), "  if (roleIn(req.person.id, crew) !== 'lead') return res.status(403).json({ error: 'Only a lead invites people into the crew.' });\n", '');
  } },
  { id: 'crews-link-reusable', of: 'hand-crews', brief: '18-crews', wrong: 'an invitation link can be used again and again', fails: ['teams-invite'], make: (dir) => {
    copyApp(base('hand-crews'), dir);
    edit(join(dir, 'server.js'), "  db.prepare('UPDATE invitations SET used = 1 WHERE token = ?').run(inv.token);\n", '');
  } },
  { id: 'crews-only-first-crew', of: 'hand-crews', brief: '18-crews', wrong: 'a person who is in two crews sees the rows of the first only', fails: ['teams-two'], make: (dir) => {
    copyApp(base('hand-crews'), dir);
    edit(join(dir, 'server.js'), 'crew_id IN (SELECT crew_id FROM members WHERE user_id = ?) ORDER BY id DESC`).all(userId)', 'crew_id IN (SELECT crew_id FROM members WHERE user_id = ? ORDER BY crew_id LIMIT 1) ORDER BY id DESC`).all(userId)');
  } },
  { id: 'crews-everyone-sees-all', of: 'hand-crews', brief: '18-crews', wrong: "every crew's rows are in everybody's lists (so a used link, and a person taken out, change nothing)", fails: ['teams-isolation', 'teams-invite', 'teams-two', 'teams-removal'], make: (dir) => {
    copyApp(base('hand-crews'), dir);
    edit(join(dir, 'server.js'), 'crew_id IN (SELECT crew_id FROM members WHERE user_id = ?) ORDER BY id DESC`).all(userId)', '? IS NOT NULL ORDER BY id DESC`).all(userId)');
  } },
  // ---- the help centre, by hand: a draft that is found, a draft in a visitor's list, an address that follows the title
  { id: 'help-draft-in-search', of: 'hand-help-centre', brief: '19-help-centre', wrong: 'a search finds drafts', fails: ['kb-search', 'kb-drafts'], make: (dir) => {
    copyApp(base('hand-help-centre'), dir);
    edit(join(dir, 'server.js'), 'const found = q.length === 0 ? [] : published().filter(', "const found = q.length === 0 ? [] : db.prepare('SELECT * FROM articles').all().filter(");
  } },
  { id: 'help-draft-in-visitors-list', of: 'hand-help-centre', brief: '19-help-centre', wrong: "a visitor's list of articles has the drafts", fails: ['kb-drafts'], make: (dir) => {
    copyApp(base('hand-help-centre'), dir);
    edit(join(dir, 'server.js'), `isOwner(req) ? 'SELECT * FROM articles ORDER BY id DESC' : "SELECT * FROM articles WHERE status = 'published' ORDER BY id DESC"`, "'SELECT * FROM articles ORDER BY id DESC'");
  } },
  { id: 'help-address-follows-title', of: 'hand-help-centre', brief: '19-help-centre', wrong: "an article's address is made again when its title is changed", fails: ['kb-address'], make: (dir) => {
    copyApp(base('hand-help-centre'), dir);
    edit(join(dir, 'server.js'), "status = ? WHERE id = ?').run(...r.value, row.id);\n  res.json(shape(", "status = ?, slug = ? WHERE id = ?').run(...r.value, slugify(r.value[0]), row.id);\n  res.json(shape(");
  } },
  // ---- the booking page, by hand: two at once, a day off, the time zone, cancelling, a time that is no slot
  { id: 'booking-no-lock', of: 'hand-booking', brief: '20-booking-page', wrong: 'the slot is checked, then booked a moment later with nothing to stop two at once', fails: ['booking-once'], make: (dir) => {
    copyApp(base('hand-booking'), dir);
    const file = join(dir, 'server.js');
    edit(file, "app.post('/api/book', (req, res) => {", "app.post('/api/book', async (req, res) => {");
    edit(file, "  try {\n    const info = db.prepare('INSERT INTO bookings", "  await new Promise((r) => setTimeout(r, 40));\n  try {\n    const info = db.prepare('INSERT INTO bookings");
    edit(file, ', UNIQUE (date, time)', '');
  } },
  { id: 'booking-dayoff-ignored', of: 'hand-booking', brief: '20-booking-page', wrong: 'a day off is offered and can be booked', fails: ['booking-dayoff'], make: (dir) => {
    copyApp(base('hand-booking'), dir);
    edit(join(dir, 'server.js'), "  if (db.prepare('SELECT 1 FROM daysoff WHERE date = ?').get(date)) return [];\n", '');
  } },
  { id: 'booking-page-in-utc', of: 'hand-booking', brief: '20-booking-page', wrong: 'the page shows the times of a summer day an hour early, as UTC would', fails: ['booking-timezone'], make: (dir) => {
    copyApp(base('hand-booking'), dir);
    edit(join(dir, 'server.js'), '${slots.map((t) => `<li>${t}</li>`).join(\'\')}', "${slots.map((t) => `<li>${Number(date.slice(5, 7)) >= 4 && Number(date.slice(5, 7)) <= 10 ? clock(minutes(t) - 60) : t}</li>`).join('')}");
  } },
  { id: 'booking-cancel-does-nothing', of: 'hand-booking', brief: '20-booking-page', wrong: 'cancelling says it is done and the booking stays', fails: ['booking-cancel'], make: (dir) => {
    copyApp(base('hand-booking'), dir);
    edit(join(dir, 'server.js'), "const info = db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);", 'const info = { changes: 1 };');
  } },
  { id: 'booking-any-time', of: 'hand-booking', brief: '20-booking-page', wrong: 'any time is taken, even one that is no slot (and so a day off is booked too)', fails: ['booking-slots', 'booking-dayoff'], make: (dir) => {
    copyApp(base('hand-booking'), dir);
    edit(join(dir, 'server.js'), 'if (!isTime(time) || !freeSlots(date).includes(time)) return', 'if (!isTime(time)) return');
  } },
  // ---- the translator, by hand
  // a correct app whose judge.json names a needed field in a word the judge does not know: one line fails, the kind is left out of the lines about rows, the other kind is still checked
  { id: 'hand-translator-unknown-word', of: 'hand-translator', brief: '10-translator', wrong: 'judge.json names the title of a job "blurb", a word the judge does not know (the app is right)', fails: ['judge-json'], make: (dir) => {
    copyApp(base('hand-translator'), dir);
    edit(join(dir, 'judge.json'), '"title": "title"', '"blurb": "title"');
  }, also: (r) => {
    const line = (id: string) => r.lines.find((l) => l.id === id);
    return [
      { ok: /your name "blurb"/.test(line('judge-json')?.say ?? '') && /field "title"/.test(line('judge-json')?.say ?? ''), say: 'judge-json says which of the builder\'s names matched nothing and which field has no name, and does not guess' },
      { ok: line('home-numbers')?.status === 'not-checked' && /^not checked, because/.test(line('home-numbers')?.say ?? ''), say: 'home-numbers (worked out from the jobs) is not checked, and says so' },
      { ok: ['add-and-read', 'required-fields', 'bad-values', 'change-remove', 'visitor-shut-out', 'others-cannot', 'keeps-after-restart'].every((id) => line(id)?.status === 'pass' && /not checked for jobs, because judge.json has no field for title/.test(line(id)?.say ?? '')), say: 'every line about rows passes for the clients and says it was not checked for the jobs, and why' },
      { ok: r.score.total === r.lines.length - 1 && r.score.passed === r.score.total - 1, say: 'the score loses one line (judge-json) and the one left out, not the six that needed the jobs' },
    ];
  } },
  { id: 'hand-translator-clients-readable', of: 'hand-translator', brief: '10-translator', wrong: "every client of everybody is in each person's list and can be read by its id", fails: ['others-cannot'], make: (dir) => {
    copyApp(base('hand-translator'), dir);
    const file = join(dir, 'server.js');
    edit(file, "db.prepare('SELECT * FROM clients WHERE owner_id = ? ORDER BY id DESC').all(req.person.id)", "db.prepare('SELECT * FROM clients ORDER BY id DESC').all()");
    edit(file, "db.prepare('SELECT * FROM clients WHERE id = ? AND owner_id = ?').get(req.params.id, req.person.id)", "db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id)");
  } },
  { id: 'hand-translator-title-optional', of: 'hand-translator', brief: '10-translator', wrong: "a job's title is left optional (the maker needs it)", fails: ['required-fields'], make: (dir) => {
    copyApp(base('hand-translator'), dir);
    edit(join(dir, 'server.js'), "  const title = text(b.title, 200);\n  if (!title) return { error: 'A job needs a title.' };", "  const title = text(b.title, 200) || '';");
  } },
  { id: 'hand-translator-number-typed', of: 'hand-translator', brief: '10-translator', wrong: 'the average length on the home page is typed in, not worked out from the rows', fails: ['home-numbers'], make: (dir) => {
    copyApp(base('hand-translator'), dir);
    edit(join(dir, 'server.js'), /const average = db\.prepare\([^\n]*\n/, 'const average = 1234;\n');
  } },
  { id: 'hand-translator-words-taken', of: 'hand-translator', brief: '10-translator', wrong: 'a number of words may be a fraction or a word', fails: ['bad-values'], make: (dir) => {
    copyApp(base('hand-translator'), dir);
    edit(join(dir, 'server.js'), 'const isWhole = (v) => typeof v === \'number\' && Number.isInteger(v) && v >= 0 && v <= 10_000_000;', "const isWhole = (v) => v !== undefined && v !== null && v !== '';");
  } },
  { id: 'hand-translator-secret-in-public', of: 'hand-translator', brief: '10-translator', wrong: 'the session secret is written in a file of the public folder', fails: ['no-secret-in-browser'], make: (dir) => {
    copyApp(base('hand-translator'), dir);
    leakSecret(dir, 'public', 'SESSION_SECRET');
  } },
];

// ------------------------------------------------------------------------------------------------ the run

function show(result: Result, all: boolean): void {
  for (const l of result.lines) if (all || l.status !== 'pass') say(`    ${l.status === 'pass' ? 'pass' : l.status === 'fail' ? 'FAIL' : 'n/a '} ${l.id}: ${l.status === 'could-not-run' ? 'could not run: ' : ''}${l.say.slice(0, 240)}`);
  say(`    score ${result.score.passed} of ${result.score.total}`);
}

const BRIEFS = (id: string) => join(HERE, 'briefs', id);

async function main(): Promise<void> {
  say('== 1. The fourteen briefs and the instructions, read without any app');
  for (const c of planChecks()) expect(c.ok, c.say);

  mkdirSync(apps());

  say('\n== 2. Correct apps, written by hand: the judge must pass every line of each');
  const correct: [string, string, () => void, ((r: Result) => { ok: boolean; say: string }[])?][] = [
    ['hand-kiln', '01-kiln-share', () => hand(base('hand-kiln'), 'kiln')],
    // the maker never asks for an email: an app that has none, and says so in judge.json, passes every line as the one with one does
    ['hand-kiln-no-email', '01-kiln-share', () => hand(base('hand-kiln-no-email'), 'kiln-no-email')],
    ['hand-translator', '10-translator', () => hand(base('hand-translator'), 'translator')],
    // the four larger descriptions, each written by hand: the roles and payments of a club, crews with invitations and two teams, a help centre with drafts and search, a booking page
    ['hand-club', '17-rowing-club', () => hand(base('hand-club'), 'club'), (r) => [{ ok: /read from the field judge.json names: true for the member who paid/.test(r.lines.find((l) => l.id === 'club-payments')?.say ?? ''), say: 'with "paid" declared, who has paid is read from the treasurer\'s list' }]],
    // the maker's words give each member one set of details: an app that keeps one record for each person (saving again replaces it) passes every line too
    ['hand-club-one-record', '17-rowing-club', () => {
      hand(base('hand-club-one-record'), 'club');
      edit(join(base('hand-club-one-record'), 'server.js'), "  const info = db.prepare('INSERT INTO details (owner_id, full_name, phone, emergency) VALUES (?, ?, ?, ?)').run(req.person.id, ...read.value);\n  res.status(201).json({ id: String(info.lastInsertRowid) });", "  const own = db.prepare('SELECT id FROM details WHERE owner_id = ?').get(req.person.id);\n  if (own) {\n    db.prepare('UPDATE details SET full_name = ?, phone = ?, emergency = ? WHERE id = ?').run(...read.value, own.id);\n    return res.status(201).json({ id: String(own.id) });\n  }\n  const info = db.prepare('INSERT INTO details (owner_id, full_name, phone, emergency) VALUES (?, ?, ?, ?)').run(req.person.id, ...read.value);\n  res.status(201).json({ id: String(info.lastInsertRowid) });");
    }],
    // the same app with the treasurer's page and no name for "paid" in judge.json (which builders are not told to give): the lines this description is for are checked all the same
    ['hand-club-no-paid', '17-rowing-club', () => {
      hand(base('hand-club-no-paid'), 'club');
      edit(join(base('hand-club-no-paid'), 'judge.json'), ', "paid this month": "paid"', '');
    }, (r) => [
      { ok: ['club-roles', 'club-payments'].every((id) => r.lines.find((l) => l.id === id)?.status === 'pass'), say: 'club-roles and club-payments are checked and pass without a name for "paid"' },
      { ok: /read from the page the treasurer reaches from the home page: the member who paid is shown as paid/.test(r.lines.find((l) => l.id === 'club-payments')?.say ?? ''), say: 'who has paid is read from the page the treasurer reaches from the home page' },
    ]],
    // and with no page that lists the members either: only that part is not checked, and the line says why
    ['hand-club-no-page', '17-rowing-club', () => {
      hand(base('hand-club-no-page'), 'club');
      edit(join(base('hand-club-no-page'), 'judge.json'), ', "paid this month": "paid"', '');
      edit(join(base('hand-club-no-page'), 'server.js'), '<p><a href="/members">Members</a> (for the chair and the treasurer)</p>', '');
    }, (r) => [
      { ok: r.lines.find((l) => l.id === 'club-payments')?.status === 'pass' && /who has paid next to each member: not checked, because judge.json names no field for it and none of the pages/.test(r.lines.find((l) => l.id === 'club-payments')?.say ?? ''), say: 'club-payments passes on what people may do, and says that who has paid next to each member was not checked, and why' },
      { ok: r.score.notChecked === 0, say: 'no line is left out of the count for it' },
    ]],
    ['hand-crews', '18-crews', () => hand(base('hand-crews'), 'crews')],
    ['hand-help-centre', '19-help-centre', () => hand(base('hand-help-centre'), 'help-centre')],
    ['hand-booking', '20-booking-page', () => hand(base('hand-booking'), 'booking')],
  ];
  const sizes: string[] = [];
  for (const [id, brief, make, extra] of correct) {
    if (!wanted(id)) continue;
    say(`\n  ${id} (${brief})`);
    try {
      make();
    } catch (error) {
      say(`    (making it stopped: ${String(error instanceof Error ? error.message : error).split('\n')[0]?.slice(0, 120)}; made again once)`);
      rmSync(base(id), { recursive: true, force: true });
      make();
    }
    const result = await judge({ app: base(id), brief: BRIEFS(brief), port });
    show(result, true);
    expect(result.score.all, `${id}: all ${result.score.total} lines pass`);
    for (const x of extra?.(result) ?? []) expect(x.ok, `${id}: ${x.say}`);
    sizes.push(`${id.padEnd(16)} build ${result.timing.build === null ? '-' : `${result.timing.build} s`}, start ${result.timing.start === null ? '-' : `${result.timing.start} s`}`);
  }

  say(`\n== 3. ${SPOILS.length} spoiled copies: each is wrong in one way, and the judge must name that one line and no other`);
  const table: string[] = [];
  for (const spoil of SPOILS) {
    if (!wanted(spoil.id)) continue;
    say(`\n  ${spoil.id} (a copy of ${spoil.of}): ${spoil.wrong}`);
    const dir = join(apps(), spoil.id);
    try {
      spoil.make(dir);
    } catch (error) {
      say(`    (making it stopped: ${String(error instanceof Error ? error.message : error).split('\n')[0]?.slice(0, 120)}; made again once)`);
      rmSync(dir, { recursive: true, force: true });
      spoil.make(dir);
    }
    const result = await judge({ app: dir, brief: BRIEFS(spoil.brief), port });
    show(result, false);
    const failed = result.lines.filter((l) => l.status === 'fail').map((l) => l.id);
    const cannot = result.lines.filter((l) => l.status === 'could-not-run').map((l) => l.id);
    expect(failed.length === spoil.fails.length && spoil.fails.every((id) => failed.includes(id)), `${spoil.id}: the judge fails ${spoil.fails.join(' and ')}${failed.join() === spoil.fails.join() ? '' : `, and it failed ${failed.join(', ') || 'nothing'}`}`);
    for (const extra of spoil.also?.(result) ?? []) expect(extra.ok, `${spoil.id}: ${extra.say}`);
    expect(cannot.length === 0, `${spoil.id}: and every other line could run${cannot.length ? ` (could not: ${cannot.join(', ')})` : ''}`);
    table.push(`${spoil.id.padEnd(34)} ${spoil.fails.join(', ').padEnd(30)} ${failed.join(', ') || 'nothing'}`);
    rmSync(dir, { recursive: true, force: true });
  }
  say(`\n   spoiled copy                       line that must fail            actually failed`);
  for (const row of table) say(`   ${row}`);
  say('\n   how long the correct apps took to build and to start');
  for (const s of sizes) say(`   ${s}`);
  if (!only) {
    // What the proof holds, said plainly: which of the judge's lines have a spoiled copy that fails them, here or in logic.test.ts (the rules of the four descriptions of their own logic).
    const inLogic = ['rule-cases', 'rule-edges', 'bad-input-refused', 'board-rules'];
    const covered = new Set([...SPOILS.flatMap((s) => s.fails), ...inLogic]);
    const bare = Object.keys(LINE_TEXT).filter((id) => !covered.has(id));
    say(`\n   ${covered.size} of the judge's ${Object.keys(LINE_TEXT).length} lines have a spoiled copy that fails them (the rules' lines in logic.test.ts). Shown to pass on correct apps, with no spoiled copy of their own: ${bare.join(', ') || 'none'}`);
  }
}

try {
  await main();
} catch (error) {
  say(`\nthe self-test stopped: ${error instanceof Error ? error.message : String(error)}`);
  failures.push('the self-test stopped before it finished');
} finally {
  if (values.keep) say(`\nkept ${root}`);
  else rmSync(root, { recursive: true, force: true });
}
say(`\n${checks - failures.length} of ${checks} checks held${failures.length ? `; ${failures.length} did not:\n${failures.map((f) => `  - ${f}`).join('\n')}` : ''}`);
process.exit(failures.length === 0 ? 0 : 1);
