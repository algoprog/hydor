// The fourteen briefs read without any app: that each is complete and in its group, that the four of their own logic are what they are said to be (no accounts, no lists of rows
// to keep but a score board, a rule of their own), that every plan holds (rows point to rows, numbers move), that each change request differs from the first plan, and that every
// worked example in them agrees with rules.ts. Used by the unit tests and by the self-test, so that both say the same.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dough, seedCalendar, takings, race, board, CROPS } from './rules.ts';
import { corpus50, inCategory, search, slotsFor, slugify } from './rules-larger.ts';
import { type ActionSpec, type VersusExpect, linesFor, loadExpect, planProblems } from './expect.ts';
import { instructionFor } from './prepare.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BRIEFS = join(HERE, 'briefs');

export const ACCOUNTS = ['01-kiln-share', '02-veg-box', '03-salt-road', '07-food-bank', '08-choir-rota', '10-translator'];
export const LOGIC = ['13-dough-sums', '14-market-takings', '15-times-tables-race', '16-seed-calendar'];
export const LARGER = ['17-rowing-club', '18-crews', '19-help-centre', '20-booking-page'];

export interface Check {
  ok: boolean;
  say: string;
}

/** Words of a program, which a person who does not program does not use: the maker's words must not say them. */
const TECH_WORDS = /\b(resources?|blocks?|schema|api|endpoints?|database|migrations?|fields?|routes?|json|http|crud|tables?|starter|waitlist|csv)\b/i;
/** Two of those words are the maker's own in some briefs (a sourdough starter, times tables). */
const OWN_WORDS = new Set(['starter', 'tables']);

const text = (...parts: string[]) => readFileSync(join(...parts), 'utf8');

/** The cases of an action, as the rules say them, for the briefs that have a rule written down in rules.ts. Null for what rules.ts has nothing to say of. */
function ruleSays(id: string, a: ActionSpec, input: Record<string, any>, change: boolean): Record<string, unknown> | null {
  if (id === '13-dough-sums') {
    const r = dough(input as any);
    return { flour: r.flour, water: r.water, salt: r.salt, starter: r.starter, totalDough: r.totalDough };
  }
  if (id === '14-market-takings') {
    const t = takings(input.file)!;
    const out: Record<string, unknown> = { total: t.total, itemsSold: t.itemsSold, bestSeller: t.bestSeller, refunds: t.refunds, skipped: t.skipped, days: t.days };
    if (change) out.averageDay = Math.round((t.total / t.days.length) * 100) / 100;
    return out;
  }
  if (id === '15-times-tables-race') return race(input.answers, input.seconds, change ? 60 : 90);
  if (id === '16-seed-calendar') {
    const rules = change ? [...CROPS, { crop: 'Pumpkins', steps: [{ task: 'sow indoors', weeks: -3 }, { task: 'plant out', weeks: 2 }] }] : CROPS;
    return { tasks: seedCalendar(input.lastFrost, input.crops, rules)!.map((t) => ({ crop: t.crop, date: t.date })) };
  }
  void a;
  return null;
}

/** What a larger brief's plan says, against the rules written once in rules-larger.ts: the articles and the searches and category pages the maker's rule gives, the slots of each day, and the parts a brief needs. */
function larger(name: string, e: VersusExpect, c: VersusExpect, expect: (ok: unknown, say: string) => void): void {
  expect(e.accounts !== 'none' && (!!e.club || !!e.teams || !!e.kb || !!e.booking), `${name}: it has accounts and its own part (${['club', 'teams', 'kb', 'booking'].filter((k) => (e as any)[k]).join()}) for the judge's new lines`);
  const words = readFileSync(join(BRIEFS, name, 'brief.md'), 'utf8').split(/\s+/).length;
  expect(words >= 120, `${name}: the description is longer than the small ones (${words} words)`);
  if (name === '19-help-centre') {
    for (const [label, x, extra] of [['expect.json', e, []], ['expect-change.json', c, ['Warranty']]] as const) {
      const corpus = (x.rows.articles ?? []).map((r) => ({ title: String(r.title), text: String(r.text), category: String(r.category), status: r.status as 'draft' | 'published' }));
      const base = corpus50();
      expect(base.every((a, i) => corpus[i]?.title === a.title && corpus[i]?.status === a.status), `${name}: the ${label} articles begin with the fifty the rules make`);
      expect(corpus.length === 50 + (extra.length ? 3 : 0), `${name}: ${label} has ${corpus.length} articles`);
      const wrong = (x.kb!.searches).filter((s) => JSON.stringify(search(corpus, s.q).map((a) => a.title)) !== JSON.stringify(s.expect)).map((s) => s.q);
      expect(wrong.length === 0, `${name}: every search in ${label} gives what the rule gives${wrong.length ? `: ${wrong.join(', ')}` : ''}`);
      const badCats = Object.entries(x.kb!.categories).filter(([cat, titles]) => JSON.stringify(inCategory(corpus, cat).map((a) => a.title)) !== JSON.stringify(titles)).map(([cat]) => cat);
      expect(badCats.length === 0, `${name}: every category page in ${label} is what the rule gives${badCats.length ? `: ${badCats.join(', ')}` : ''}`);
      expect(corpus.some((a) => a.status === 'draft' && a.title === x.kb!.draft.title) && search(corpus, x.kb!.draft.word).length === 0, `${name}: the draft in ${label} is a draft and its word finds nothing`);
      expect(new Set(corpus.map((a) => slugify(a.title))).size === corpus.length, `${name}: every article of ${label} has an address of its own`);
      expect(corpus.every((a) => !corpus.some((b) => a !== b && b.title.toLowerCase().includes(a.title.toLowerCase()))), `${name}: no title of ${label} is a part of another (a page can tell them apart)`);
    }
  }
  if (name === '20-booking-page') {
    for (const [label, x, minutes] of [['expect.json', e, 30], ['expect-change.json', c, 45]] as const) {
      const hours = (x.rows.hours ?? []).map((r) => ({ weekday: String(r.weekday), start: String(r.start), end: String(r.end) }));
      const off = (x.rows.daysoff ?? []).map((r) => String(r.date));
      const b = x.booking!;
      const wrong = (Object.keys(b.days) as (keyof typeof b.days)[]).filter((k) => JSON.stringify(slotsFor(b.days[k], hours, off, minutes)) !== JSON.stringify(b.slots[k]));
      expect(b.slotMinutes === minutes && wrong.length === 0, `${name}: the slots of every day in ${label} are what the maker's ${minutes}-minute rule gives${wrong.length ? `: ${wrong.join(', ')}` : ''}`);
      expect(new Date(`${b.days.summer}T00:00:00Z`).getUTCDay() === 1 && new Date(`${b.days.winter}T00:00:00Z`).getUTCDay() === 1 && new Date(`${b.days.off}T00:00:00Z`).getUTCDay() === 1, `${name}: the summer, the winter and the day-off days of ${label} are Mondays`);
      expect(Number(b.days.summer.slice(5, 7)) >= 4 && Number(b.days.summer.slice(5, 7)) <= 9 && (Number(b.days.winter.slice(5, 7)) <= 2), `${name}: one day is in summer time and one in winter time`);
    }
  }
  if (name === '17-rowing-club') expect(e.access === 'own' && !!e.theirs && e.kinds.find((k) => k.id === e.club!.details)?.staffSeeAll === true && e.kinds.some((k) => k.fields.some((f) => f.id === e.club!.paid && f.readOnly)), `${name}: members' own records are seen by the chair and the treasurer, and "paid" is read back`);
  if (name === '18-crews') expect(e.teams!.kinds.length === 3 && e.teams!.kinds.every((k) => e.kinds.some((x) => x.id === k)), `${name}: three kinds belong to teams`);
}

export function planChecks(): Check[] {
  const out: Check[] = [];
  const expect = (ok: unknown, say: string) => out.push({ ok: !!ok, say });
  const folders = readdirSync(BRIEFS, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d\d-/.test(d.name)).map((d) => d.name).sort();
  expect(folders.join() === [...ACCOUNTS, ...LOGIC, ...LARGER].join(), `there are fourteen briefs: ${folders.join(', ')}`);
  const seen: string[] = [];
  for (const name of folders) {
    const dir = join(BRIEFS, name);
    const files = ['brief.md', 'answers.md', 'expect.json', 'change.md', 'expect-change.json'].filter((f) => !existsSync(join(dir, f)));
    expect(files.length === 0, `${name}: has brief.md, answers.md, expect.json, change.md and expect-change.json${files.length ? ` (missing ${files.join(', ')})` : ''}`);
    if (files.length) continue;
    const brief = text(dir, 'brief.md');
    const paragraphs = brief.trim().split(/\n\s*\n/).length;
    const word = [...brief.matchAll(new RegExp(TECH_WORDS.source, 'gi'))].map((m) => m[0]).find((w) => !(LOGIC.includes(name) && OWN_WORDS.has(w.toLowerCase())));
    expect(paragraphs <= 2 && !word, `${name}: brief.md is ${paragraphs} paragraph(s) in the maker's words${word ? `, but says "${word}"` : ''}`);
    expect(/you decide\.?\s*$/.test(text(dir, 'answers.md').trim()), `${name}: answers.md ends with "the maker says: you decide"`);
    expect(/you decide\.?\s*$/.test(text(dir, 'change.md').trim()) && !TECH_WORDS.test(text(dir, 'change.md').split('# What the maker says')[0]!), `${name}: change.md is the maker's request and what they say if asked, without a word of a program`);
    const e = loadExpect(join(dir, 'expect.json'));
    const c = loadExpect(join(dir, 'expect-change.json'));
    expect(e.id === name && c.id === name, `${name}: expect.json and expect-change.json say id ${e.id}`);
    expect(e.group === (ACCOUNTS.includes(name) ? 'accounts' : LARGER.includes(name) ? 'larger' : 'logic'), `${name}: it is in the group ${e.group}`);
    for (const [label, x] of [['expect.json', e], ['expect-change.json', c]] as [string, VersusExpect][]) {
      const problems = planProblems(x);
      expect(problems.length === 0, `${name}: ${label} holds: ${x.kinds.length} kind(s), ${x.numbers.length} number(s), ${x.actions?.length ?? 0} rule(s), accounts ${x.accounts}${x.access ? `, ${x.access}` : ''}${problems.length ? `: ${problems.join('; ')}` : ''}`);
      expect(linesFor(x).length >= 9, `${name}: the judge has ${linesFor(x).length} lines for ${label}`);
    }
    expect(JSON.stringify(e) !== JSON.stringify(c), `${name}: the change request asks for something the first plan does not`);
    seen.push(JSON.stringify({ ...e, id: 0, product: 0, phrases: 0 }));
    if (ACCOUNTS.includes(name)) {
      expect(e.accounts !== 'none' && e.kinds.length > 0, `${name}: it has accounts (or a list owned by one person) and rows to keep`);
    } else if (LARGER.includes(name)) {
      larger(name, e, c, expect);
    } else {
      expect(e.accounts === 'none' && e.numbers.length === 0 && Object.keys(e.rows).length === 0, `${name}: nobody signs in, no home page of numbers, no rows to add: it is a rule of its own${e.board ? ' and a score board that is kept' : ''}`);
      expect((e.actions?.length ?? 0) >= 1 && e.actions!.every((a) => a.cases.length >= 3 && a.edges.length >= 3 && a.refused.length >= 3), `${name}: it has worked cases, edge cases and refused inputs`);
      for (const [label, x] of [['expect.json', e], ['expect-change.json', c]] as [string, VersusExpect][]) {
        const wrong: string[] = [];
        for (const a of x.actions ?? []) for (const k of [...a.cases, ...a.edges]) {
          const says = ruleSays(name, a, k.in, label === 'expect-change.json');
          if (!says) continue;
          for (const [key, value] of Object.entries(k.out ?? {})) if (JSON.stringify((says as any)[key]) !== JSON.stringify(value)) wrong.push(`${k.label}: ${key}`);
        }
        expect(wrong.length === 0, `${name}: every worked example in ${label} is what the rules in rules.ts say${wrong.length ? `: ${wrong.slice(0, 3).join('; ')}` : ''}`);
      }
      if (name === '15-times-tables-race') {
        const sets = [[e, 5, 90], [c, 10, 60]] as const;
        for (const [x, size, under] of sets) {
          const b = x.board!;
          const played = b.plays.map((p: any) => ({ name: p.name as string, points: race(p.answers, p.seconds, under).points, seconds: p.seconds as number }));
          const expected = board(played, size);
          expect(JSON.stringify(expected.map((p) => [p.name.toLowerCase(), p.points, p.seconds])) === JSON.stringify(b.expect.map((p: any) => [String(p.name).toLowerCase(), p.points, p.seconds])), `${name}: the board after ${b.plays.length} plays is the ${size} places the rules give`);
        }
      }
    }
  }
  expect(new Set(seen).size === seen.length, 'no two briefs ask for the same thing');
  // the instruction
  for (const kind of ['build', 'change'] as const) {
    const said = instructionFor(kind, '15', '60');
    expect(!/\{\{/.test(said), `the ${kind} instruction has no number left to fill in`);
    expect(said.includes('15 US dollars') && said.includes('60 minutes'), `the ${kind} instruction says the budget and the time`);
    expect(!/\bkit\b/i.test(said), `the ${kind} instruction names no framework`);
  }
  return out;
}
