// The answer UIs for people and sports (profiles, people, org charts, matches, league tables, fixtures): their views, by name (shared/answer-ui/people.ts has what each takes).
import { Fragment, useState, type ReactNode } from 'react';
import { ArrowLeftRight, Clock, Download, ExternalLink, Globe, Mail, MapPin, Phone, Trophy } from 'lucide-react';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../ui';
import { Legend, useWidth } from '../charts';
import { arr, Avatar, Btn, Card, Chip, Copy, download, fmtDate, fmtNum, fmtTime, Head, hostOf, initials, isObj, KeyValues, LinkOut, Md, num, parseDate, Pic, Section, seriesColor, str, textOf, TONE, TONE_FILL, toneOf, usePicOk, withUnit, words, type AnswerUiView, type Data, type Tone } from '../kit';

// ---- shared pieces ---------------------------------------------------------------------------------------------------

// ---- a profile -------------------------------------------------------------------------------------------------------

function Timeline({ items }: { items: Data[] }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-[13.5px]">
      {items.map((t, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={i}>
            <div className={cx('text-right font-semibold text-fg tabular-nums', !last && 'pb-3')}>{str(t.year ?? t.date ?? t.when)}</div>
            <div className={cx('relative border-l border-line-2 pl-3.5', !last && 'pb-3')}>
              <span className="absolute top-[6px] -left-[4.5px] h-2 w-2 rounded-full border-2 border-panel bg-accent" aria-hidden />
              <Md text={t.text ?? t.event} inline className="text-fg-2" />
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function Profile({ data }: { data: Data }) {
  const name = textOf(data, 'name', 'title');
  const sub = [str(data.role), str(data.org)].filter(Boolean).join(' · ');
  const facts = (
    isObj(data.facts)
      ? Object.entries(data.facts).map(([label, value]) => ({ label, value }))
      : arr(data.facts)
          .filter(isObj)
          .map((f) => ({
            label: str(f.label ?? f.name),
            value: f.value ?? f.text,
          }))
  ).filter((f) => f.label || str(f.value));
  const timeline = arr(data.timeline).filter((t) => isObj(t) && str(t.text ?? t.event));
  const links = arr(data.links)
    .map((l) => (isObj(l) ? l : { url: str(l) }))
    .filter((l) => /^https?:\/\//i.test(str(l.url)));
  const tags = words(data.tags);
  return (
    <Card>
      <div className="flex items-start gap-4">
        {(str(data.image) || name) && <Avatar name={name} image={data.image} className="h-20 w-20 text-[24px] @lg:h-24 @lg:w-24" />}
        <div className="min-w-0 flex-1 pt-1">
          {name && <h3 className="aui-h3 text-[19px]">{name}</h3>}
          {sub && <div className="mt-0.5 text-[13.5px] text-fg-2">{sub}</div>}
          {str(data.location) && (
            <div className="mt-1 flex items-center gap-1 text-[12.5px] text-fg-3">
              <MapPin size={12} className="shrink-0" />
              <span className="min-w-0">{str(data.location)}</span>
            </div>
          )}
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((t, i) => (
                <Chip key={i}>{t}</Chip>
              ))}
            </div>
          )}
        </div>
      </div>
      {str(data.bio) && <Md text={data.bio} className="mt-3.5 text-[14px] text-fg-2" />}
      {(facts.length > 0 || timeline.length > 0) && (
        <div className={cx('mt-4 grid gap-x-6 gap-y-5', facts.length > 0 && timeline.length > 0 && '@2xl:grid-cols-2')}>
          {facts.length > 0 && (
            <Section title={tr('Facts')}>
              <KeyValues rows={facts} />
            </Section>
          )}
          {timeline.length > 0 && (
            <Section title={tr('Timeline')}>
              <Timeline items={timeline} />
            </Section>
          )}
        </div>
      )}
      {links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[13px]">
          {links.map((l, i) => (
            <LinkOut key={i} url={l.url}>
              {str(l.label) || hostOf(l.url)}
            </LinkOut>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---- people ----------------------------------------------------------------------------------------------------------

function People({ data }: { data: Data }) {
  const people = arr(data.people ?? data.items ?? data.members)
    .map((p) => (isObj(p) ? p : { name: str(p) }))
    .filter((p) => textOf(p, 'name', 'title'));
  return (
    <Card>
      <Head title={data.title} />
      <ul className="m-0 grid list-none gap-x-6 gap-y-4 p-0 @xl:grid-cols-2">
        {people.map((p, i) => {
          const name = textOf(p, 'name', 'title');
          return (
            <li key={i} className="flex min-w-0 gap-3">
              <Avatar name={name} image={p.image ?? p.photo} className="h-14 w-14 text-[16px]" />
              <div className="min-w-0 flex-1 pt-0.5">
                {str(p.url) ? (
                  <LinkOut url={p.url} icon={false} className="max-w-full font-semibold text-fg">
                    {name}
                  </LinkOut>
                ) : (
                  <div className="font-semibold">{name}</div>
                )}
                {str(p.role) && <div className="text-[12.5px] text-fg-3">{str(p.role)}</div>}
                {str(p.note) && <Md text={p.note} className="mt-1 text-[13px] text-fg-2" />}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---- an org chart ------------------------------------------------------------------------------------------------------

interface OrgNode {
  name: string;
  role: string;
  image: string;
  kids: OrgNode[];
  /** How many levels are under it (0 for nobody). */
  height: number;
}

function orgNode(v: unknown, depth = 0): OrgNode | null {
  if (depth > 12) return null;
  const o = isObj(v) ? v : typeof v === 'string' ? { name: v } : null;
  if (!o) return null;
  const kids = arr(o.children ?? o.reports ?? o.team)
    .map((c) => orgNode(c, depth + 1))
    .filter((c): c is OrgNode => !!c);
  const name = textOf(o, 'name', 'label');
  const role = str(o.role ?? o.title ?? o.position);
  if (!name && !role && !kids.length) return null;
  return {
    name,
    role,
    image: str(o.image ?? o.photo ?? o.avatar),
    kids,
    height: kids.length ? 1 + Math.max(...kids.map((k) => k.height)) : 0,
  };
}

// The chart's measures (px): a box, a list's indent, a nested list's step in, a column's room on its sides.
const BOX = 164;
const INDENT = 16;
const COLUMN = 16;

/** A list's width: its indent and its widest row (a row with people under it holds their list, a step in). */
const listWidth = (n: OrgNode): number => INDENT + Math.max(...n.kids.map((k) => (k.kids.length ? Math.max(BOX, INDENT + listWidth(k)) : BOX)));
/** Whether the people under a node go one under another (true when no more than `fold` levels are under it). */
const listed = (n: OrgNode, fold: number) => n.kids.length >= 2 && n.height <= fold;
/** A node's width laid out with the levels up to `fold` as lists. */
function orgWidth(n: OrgNode, fold: number): number {
  if (!n.kids.length) return BOX;
  if (listed(n, fold)) return Math.max(BOX, listWidth(n));
  return Math.max(
    BOX,
    n.kids.reduce((w, k) => w + COLUMN + orgWidth(k, fold), 0),
  );
}

const LINE = 'border-line-2';

function OrgBox({ n, top }: { n: OrgNode; top?: boolean }) {
  return (
    <div className={cx('flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2', top ? 'border-accent/40 bg-accent-soft' : 'border-line bg-bg-1')} style={{ width: BOX }}>
      {n.image && <Pic src={n.image} alt={n.name} className="h-8 w-8 shrink-0 rounded-full" />}
      <div className="min-w-0">
        {n.name && <div className="text-[13px] leading-snug font-semibold text-fg">{n.name}</div>}
        {n.role && <div className="text-[11.5px] leading-snug text-fg-3">{n.role}</div>}
      </div>
    </div>
  );
}

/**
 * People one under another on a line down the left (and the people under each, a step further in): the line comes
 * from the middle of the box above them, or from its left when it is in a list itself (`nested`).
 */
function OrgList({ kids, nested }: { kids: OrgNode[]; nested?: boolean }) {
  return (
    <div style={nested ? { marginLeft: INDENT } : undefined}>
      {nested ? (
        <div className={cx('h-2 border-l', LINE)} />
      ) : (
        <div className="relative h-3">
          <span className={cx('absolute top-0 left-0 h-full w-1/2 rounded-tl-md border-t border-l', LINE)} />
        </div>
      )}
      {kids.map((k, i) => {
        const last = i === kids.length - 1;
        return (
          <div key={i} className={cx('relative', !last && 'pb-2')} style={{ paddingLeft: INDENT }}>
            {!last && <span className={cx('absolute top-0 left-0 h-full border-l', LINE)} />}
            <div className="relative">
              {last && <span className={cx('absolute top-0 h-1/2 border-l', LINE)} style={{ left: -INDENT }} />}
              <span className={cx('absolute top-1/2 border-t', LINE)} style={{ left: -INDENT, width: INDENT }} />
              <OrgBox n={k} />
            </div>
            {k.kids.length > 0 && <OrgList kids={k.kids} nested />}
          </div>
        );
      })}
    </div>
  );
}

function OrgTree({ n, fold, top }: { n: OrgNode; fold: number; top?: boolean }) {
  const kids = n.kids;
  return (
    <div className="flex flex-col items-center">
      <OrgBox n={n} top={top} />
      {kids.length > 0 && <span className={cx('h-4 w-0 border-l', LINE)} />}
      {kids.length > 0 &&
        (listed(n, fold) ? (
          <OrgList kids={kids} />
        ) : (
          <div className="flex items-start">
            {kids.map((k, i) => (
              <div key={i} className="flex flex-col items-center">
                {/* The line across spans the whole column, its sides too, so it meets the next column's. */}
                <div className="relative h-4 w-full">
                  {i > 0 && <span className={cx('absolute top-0 left-0 w-1/2 border-t', LINE)} />}
                  {i < kids.length - 1 && <span className={cx('absolute top-0 right-0 w-1/2 border-t', LINE)} />}
                  <span className={cx('absolute top-0 left-1/2 h-full border-l', LINE)} />
                </div>
                <div style={{ paddingInline: COLUMN / 2 }}>
                  <OrgTree n={k} fold={fold} />
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

function OrgChart({ data }: { data: Data }) {
  const given = data.root ?? data.tree ?? (str(data.name) || Array.isArray(data.children) ? data : null);
  const roots = (Array.isArray(given) ? given : [given]).map((r) => orgNode(r)).filter((r): r is OrgNode => !!r);
  const [ref, room] = useWidth<HTMLDivElement>();
  // Side by side where there is room; when the chart is wider than its room, the people at the bottom go one under
  // another, then the level above them too, and so on until it fits (or all of it is lists, scrolling sideways if even
  // that is too wide).
  const tallest = Math.max(1, ...roots.map((r) => r.height));
  let fold = 0;
  while (room > 0 && fold < tallest && roots.reduce((w, r, i) => w + (i ? 24 : 0) + orgWidth(r, fold), 0) > room - 8) fold++;
  return (
    <Card>
      <Head title={data.root || data.tree ? data.title : undefined} />
      {roots.length > 0 && (
        <div ref={ref} className="-mx-1 overflow-x-auto pb-1">
          <div className="mx-auto flex w-max items-start gap-6 px-1">
            {roots.map((r, i) => (
              <OrgTree key={i} n={r} fold={fold} top />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---- a match ---------------------------------------------------------------------------------------------------------

interface Side {
  name: string;
  logo: string;
  color: string;
  score: number | null;
}

const sideOf = (v: unknown): Side => {
  const o = isObj(v) ? v : { name: str(v) };
  return {
    name: textOf(o, 'name', 'team', 'club'),
    logo: str(o.logo ?? o.crest ?? o.badge),
    color: str(o.color ?? o.colour),
    score: num(o.score ?? o.goals),
  };
};

/** A minute as agents write it (67, "45+2", "67'") as a number to sort by. */
function minuteKey(v: unknown): number {
  const m = /(\d+)(?:\s*\+\s*(\d+))?/.exec(str(v));
  return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0) : 999;
}
/** A minute as a match report writes it: 67′, 90+2′. */
function minuteText(v: unknown): string {
  const s = str(v)
    .replace(/['′’]+$/, '')
    .replace(/\s*\+\s*/, '+')
    .trim();
  return s ? `${s}′` : '';
}

/** Black or white, whichever reads on a colour. */
function inkOn(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111' : '#fff';
}

/** A team's crest, or its initials on its colour. */
function Crest({ side, className }: { side: Side; className: string }) {
  const hasLogo = usePicOk(side.logo);
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(side.color) ? side.color : '';
  return (
    <>
      {side.logo && <Pic src={side.logo} alt={side.name} fit="contain" zoom={false} className={cx('shrink-0 bg-transparent', className)} />}
      {!hasLogo && (
        <span aria-hidden className={cx('grid shrink-0 place-items-center rounded-full text-[14px] font-bold', className, !hex && 'bg-bg-2 text-fg-2')} style={hex ? { background: hex, color: inkOn(hex) } : undefined}>
          {initials(side.name)}
        </span>
      )}
    </>
  );
}

/** A football, for goals. */
function Ball({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} className={cx('shrink-0', className)} aria-hidden>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.6l3.23 2.35-1.23 3.8H6l-1.23-3.8z" fill="currentColor" />
      <path d="M8 4.6V1.3M11.23 6.95l3.1-1M10 10.75l1.95 2.65M6 10.75l-1.95 2.65M4.77 6.95l-3.1-1" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

const EVENT_LABEL: Record<string, () => string> = {
  goal: () => tr('Goal'),
  penalty: () => tr('Penalty'),
  'own-goal': () => tr('Own goal'),
  yellow: () => tr('Yellow card'),
  red: () => tr('Red card'),
  sub: () => tr('Substitution'),
};

/** The kind of an event, from the words agents use for it. */
function eventType(v: unknown): string {
  const s = str(v)
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  if (/own/.test(s)) return 'own-goal';
  if (/pen/.test(s)) return 'penalty';
  if (/second|red/.test(s)) return 'red';
  if (/yellow|book|card/.test(s)) return 'yellow';
  if (/sub|change|replace/.test(s)) return 'sub';
  return 'goal';
}

function EventIcon({ type }: { type: string }) {
  if (type === 'yellow' || type === 'red') return <span className="inline-block h-[13px] w-[9.5px] shrink-0 rounded-[2px]" style={{ background: type === 'yellow' ? '#f5c518' : '#e03131' }} aria-hidden />;
  if (type === 'sub') return <ArrowLeftRight size={14} className="shrink-0 text-fg-3" aria-hidden />;
  return <Ball className={type === 'own-goal' ? 'text-err' : 'text-fg'} />;
}

const goalSuffix = (type: string) => (type === 'penalty' ? ` (${tr('pen.')})` : type === 'own-goal' ? ` (${tr('o.g.')})` : '');

function Match({ data }: { data: Data }) {
  const home = sideOf(data.home);
  const away = sideOf(data.away);
  const status = str(data.status).toLowerCase();
  const minute = minuteText(data.minute);
  const live = /live|progress|playing|half/.test(status) || (!status && !!minute);
  const final = !live && (/final|full|ft|finished|ended|played|result/.test(status) || (!status && (home.score !== null || away.score !== null)));
  const scored = home.score !== null || away.score !== null;
  const when = parseDate(data.date ?? data.kickoff);
  const timed = /T\d|\d:\d/.test(str(data.date ?? data.kickoff));
  const events = arr(data.events)
    .filter(isObj)
    .map((e, i) => ({
      i,
      minute: e.minute ?? e.time,
      side: /away|2/.test(str(e.team ?? e.side).toLowerCase()) ? 'away' : 'home',
      type: eventType(e.type),
      player: textOf(e, 'player', 'name', 'text'),
      detail: str(e.detail ?? e.assist ?? e.note),
    }))
    .sort((a, b) => minuteKey(a.minute) - minuteKey(b.minute) || a.i - b.i);
  const goals = (s: 'home' | 'away') => events.filter((e) => e.side === s && (e.type === 'goal' || e.type === 'penalty' || e.type === 'own-goal'));
  const stats = arr(data.stats).filter((s) => isObj(s) && str(s.label));
  const head = [when ? fmtDate(when, timed ? 'dateTime' : 'dayMonth') : '', str(data.venue)].filter(Boolean).join(' · ');
  const team = (s: Side, list: typeof events, right?: boolean) => (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      {(s.name || s.logo) && <Crest side={s} className="h-14 w-14 @md:h-16 @md:w-16" />}
      <div className="text-[14.5px] leading-snug font-semibold">{s.name}</div>
      {list.length > 0 && (
        <ul className={cx('m-0 list-none space-y-0.5 p-0 text-[12px] leading-snug text-fg-3', right ? '@md:text-left' : '@md:text-right')}>
          {list.map((e) => (
            <li key={e.i}>
              {e.player} {minuteText(e.minute)}
              {goalSuffix(e.type)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <Card>
      {(str(data.competition) || head) && (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[12px] text-fg-3">
          {str(data.competition) && <span className="font-semibold tracking-wide text-fg-2 uppercase">{str(data.competition)}</span>}
          {head && <span>{head}</span>}
        </div>
      )}
      {(home.name || away.name || scored) && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 @md:gap-4">
          {team(home, goals('home'))}
          <div className="flex flex-col items-center pt-3 @md:pt-4">
            {scored ? (
              <div className="text-[34px] leading-none font-bold tracking-tight whitespace-nowrap tabular-nums @md:text-[40px]">
                {home.score ?? 0}
                <span className="mx-1.5 font-normal text-fg-3">–</span>
                {away.score ?? 0}
              </div>
            ) : (
              <div className="text-[24px] leading-none font-semibold tabular-nums">{when && timed ? fmtTime(str(data.date ?? data.kickoff)) : '–'}</div>
            )}
            <div className="mt-2.5">
              {live ? (
                <Chip tone="bad">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                  {minute ? `${tr('Live')} · ${minute}` : tr('Live')}
                </Chip>
              ) : final ? (
                <Chip>{tr('Full time')}</Chip>
              ) : when ? (
                <span className="text-[12px] text-fg-3">{fmtDate(when, 'dayMonth')}</span>
              ) : null}
            </div>
          </div>
          {team(away, goals('away'), true)}
        </div>
      )}
      {events.length > 0 && (
        <Section title={tr('Match events')} className="mt-5">
          <div className="relative">
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line" aria-hidden />
            <ul className="relative m-0 list-none space-y-1.5 p-0">
              {events.map((e) => {
                const body = (
                  <div className={cx('flex min-w-0 items-center gap-2', e.side === 'home' && 'flex-row-reverse text-right')} title={EVENT_LABEL[e.type]?.()}>
                    <EventIcon type={e.type} />
                    <div className="min-w-0 leading-tight">
                      <div className="text-[13px] font-medium">
                        {e.player}
                        {goalSuffix(e.type) && <span className="font-normal text-fg-3">{goalSuffix(e.type)}</span>}
                      </div>
                      {e.detail && <div className="text-[11.5px] text-fg-3">{e.detail}</div>}
                    </div>
                  </div>
                );
                return (
                  <li key={e.i} className="grid grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] items-center gap-2">
                    <div className="flex justify-end">{e.side === 'home' && body}</div>
                    <div className="flex justify-center">
                      <span className="rounded-full border border-line bg-panel px-1.5 py-px text-[11.5px] font-semibold text-fg-2 tabular-nums">{minuteText(e.minute) || '·'}</span>
                    </div>
                    <div className="flex">{e.side === 'away' && body}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>
      )}
      {stats.length > 0 && (
        <Section title={tr('Stats')} className="mt-5" aside={home.name && away.name ? <Legend names={[home.name, away.name]} className="!mb-0" /> : undefined}>
          <div className="space-y-2.5">
            {stats.map((s, i) => {
              const h = num(s.home) ?? 0;
              const a = num(s.away) ?? 0;
              const unit = str(s.unit);
              return (
                <div key={i}>
                  <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-2 text-[13px]">
                    <span className={cx('tabular-nums', h >= a ? 'font-semibold text-fg' : 'text-fg-2')}>{withUnit(h, unit)}</span>
                    <span className="text-center text-[12px] text-fg-3">{str(s.label)}</span>
                    <span className={cx('text-right tabular-nums', a >= h ? 'font-semibold text-fg' : 'text-fg-2')}>{withUnit(a, unit)}</span>
                  </div>
                  <div className="flex h-1.5 gap-[2px]">
                    {h + a > 0 ? (
                      <>
                        {h > 0 && <span className={cx('rounded-l-full', !a && 'rounded-r-full')} style={{ flex: h, background: seriesColor(0) }} />}
                        {a > 0 && <span className={cx('rounded-r-full', !h && 'rounded-l-full')} style={{ flex: a, background: seriesColor(1) }} />}
                      </>
                    ) : (
                      <span className="flex-1 rounded-full bg-bg-3" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      {str(data.note) && <Md text={data.note} className="mt-4 border-t border-line pt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- a league table --------------------------------------------------------------------------------------------------

const RESULT: Record<string, { tone: Tone; label: () => string }> = {
  w: { tone: 'good', label: () => tr('Won') },
  d: { tone: 'neutral', label: () => tr('Drawn') },
  l: { tone: 'bad', label: () => tr('Lost') },
};

function Form({ text }: { text: string }) {
  const results = [...text.replace(/[\s,·|-]/g, '')].slice(-6);
  return (
    <span className="inline-flex gap-[3px]">
      {results.map((c, i) => {
        const r = RESULT[c.toLowerCase()];
        return (
          <span key={i} title={r?.label()} className={cx('grid h-[18px] w-[18px] place-items-center rounded-[5px] text-[10px] font-bold', TONE[r?.tone ?? 'neutral'])}>
            {c.toUpperCase()}
          </span>
        );
      })}
    </span>
  );
}

function Standings({ data }: { data: Data }) {
  const rows = arr(data.rows ?? data.table ?? data.standings ?? data.teams).filter(isObj);
  const zones = arr(data.zones)
    .filter(isObj)
    .map((z) => ({
      from: num(z.from),
      to: num(z.to ?? z.from),
      label: str(z.label),
      tone: toneOf(z.tone),
    }))
    .filter((z): z is { from: number; to: number; label: string; tone: Tone } => z.from !== null && z.to !== null);
  const posOf = (r: Data | undefined, i: number) => num(r?.pos ?? r?.position ?? r?.rank) ?? i + 1;
  const zoneAt = (pos: number) => zones.find((z) => pos >= z.from && pos <= z.to);
  const mark = str(data.highlight).trim().toLowerCase();
  const has = (k: string) => rows.some((r) => num(r[k]) !== null);
  const cols = [
    { key: 'played', short: tr('P'), long: tr('Played'), wide: false },
    { key: 'won', short: tr('W'), long: tr('Won'), wide: true },
    { key: 'drawn', short: tr('D'), long: tr('Drawn'), wide: true },
    { key: 'lost', short: tr('L'), long: tr('Lost'), wide: true },
    { key: 'gd', short: tr('GD'), long: tr('Goal difference'), wide: false },
  ].filter((c) => has(c.key));
  const form = rows.some((r) => str(r.form));
  const logos = rows.some((r) => str(r.logo));
  const pad = 'first:pl-4 last:pr-4 @lg:first:pl-5 @lg:last:pr-5';
  return (
    <Card pad={false} className="overflow-hidden">
      {str(data.title) && <Head title={data.title} className="mb-0 px-4 pt-4 pb-3 @lg:px-5" />}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-line bg-bg-1 text-[11.5px] text-fg-3">
                <th className={cx('w-9 py-1.5 pr-1 text-left font-medium', pad)}>#</th>
                <th className={cx('py-1.5 pr-2 text-left font-medium', pad)}>{tr('Team')}</th>
                {cols.map((c) => (
                  <th key={c.key} title={c.long} className={cx('w-9 px-1 py-1.5 text-right font-medium', c.wide && 'hidden @md:table-cell', pad)}>
                    {c.short}
                  </th>
                ))}
                <th title={tr('Points')} className={cx('w-10 px-1 py-1.5 text-right font-semibold text-fg-2', pad)}>
                  {tr('Pts')}
                </th>
                {form && <th className={cx('hidden py-1.5 pl-4 text-left font-medium @sm:table-cell', pad)}>{tr('Form')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const pos = posOf(r, i);
                const z = zoneAt(pos);
                const next = rows[i + 1];
                const edge = !!next && z !== zoneAt(posOf(next, i + 1));
                const team = textOf(r, 'team', 'name', 'club');
                const marked = !!mark && team.toLowerCase() === mark;
                const gd = num(r.gd ?? r.goal_difference);
                return (
                  <tr key={i} className={cx('border-b last:border-b-0', edge ? 'border-line-2' : 'border-line/60', marked && 'bg-accent-soft')}>
                    <td className={cx('relative py-1.5 pr-1 text-fg-2 tabular-nums', pad)}>
                      {z && <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: TONE_FILL[z.tone] }} aria-hidden />}
                      {pos}
                    </td>
                    <td className={cx('py-1.5 pr-2', pad)}>
                      <span className="flex min-w-0 items-center gap-2">
                        {logos && <Pic src={r.logo} alt="" fit="contain" zoom={false} className="h-5 w-5 shrink-0 bg-transparent" />}
                        <span className={cx('leading-snug', marked ? 'font-semibold' : 'font-medium')}>{team}</span>
                      </span>
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} className={cx('px-1 py-1.5 text-right text-fg-2 tabular-nums', c.wide && 'hidden @md:table-cell', pad)}>
                        {c.key === 'gd' && gd !== null ? (gd > 0 ? `+${fmtNum(gd)}` : gd < 0 ? `−${fmtNum(-gd)}` : '0') : fmtNum(num(r[c.key]))}
                      </td>
                    ))}
                    <td className={cx('px-1 py-1.5 text-right font-semibold tabular-nums', pad)}>{fmtNum(num(r.points ?? r.pts))}</td>
                    {form && (
                      <td className={cx('hidden py-1.5 pl-4 @sm:table-cell', pad)}>
                        <Form text={str(r.form)} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {zones.length > 0 && rows.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[12px] text-fg-2 @lg:px-5">
          {zones.map((z, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: TONE_FILL[z.tone] }} aria-hidden />
              {z.label}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---- fixtures and results ----------------------------------------------------------------------------------------------

/** "2-1", "2 – 1", "2:1 (4-3 pens)" as the two numbers and what follows them. */
function scoreOf(v: unknown): { h: number; a: number; rest: string } | null {
  const m = /^\s*(\d+)\s*[-–—:]\s*(\d+)\s*(.*)$/.exec(str(v));
  return m ? { h: Number(m[1]), a: Number(m[2]), rest: m[3].trim() } : null;
}

function FixtureRow({ m }: { m: Data }) {
  const home = textOf(m.home, 'name', 'team');
  const away = textOf(m.away, 'name', 'team');
  const status = str(m.status).toLowerCase();
  const score = scoreOf(m.score);
  const live = /live|progress|playing|half/.test(status);
  const off = /postpon|cancel|abandon|suspend/.test(status);
  const final = !live && !off && (!!score || /final|full|ft|finished|ended|played|result/.test(status));
  const date = str(m.date ?? m.kickoff ?? m.time);
  const timed = /T\d|\d:\d/.test(date);
  const won = final && score ? Math.sign(score.h - score.a) : 0;
  const below = [str(m.competition), str(m.venue)].filter(Boolean).join(' · ');
  const name = (t: string, side: 1 | -1, right?: boolean) => <span className={cx('min-w-0 text-[13.5px] leading-snug', right && 'text-right', won === side ? 'font-semibold text-fg' : final && won ? 'text-fg-2' : 'font-medium')}>{t}</span>;
  return (
    <div className="border-b border-line/60 px-4 py-2.5 last:border-b-0 @lg:px-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        {name(home, 1, true)}
        <div className="flex min-w-[68px] flex-col items-center">
          {off ? (
            <Chip tone="warn">{tr('Postponed')}</Chip>
          ) : score ? (
            <span className={cx('inline-flex min-w-[60px] justify-center rounded-md px-2 py-0.5 text-[14px] font-semibold whitespace-nowrap tabular-nums', live ? 'bg-err/12 text-err' : 'bg-bg-2 text-fg')}>
              {score.h} – {score.a}
            </span>
          ) : (
            <span className="inline-flex min-w-[60px] justify-center rounded-md border border-line px-2 py-0.5 text-[13px] font-medium text-fg-2 tabular-nums">{timed ? fmtTime(date) : '–'}</span>
          )}
          {live && <span className="mt-0.5 text-[10.5px] font-semibold tracking-wide text-err uppercase">{tr('Live')}</span>}
          {score?.rest && <span className="mt-0.5 text-[11px] text-fg-3">{score.rest}</span>}
        </div>
        {name(away, -1)}
      </div>
      {below && <div className="mt-1 text-center text-[11.5px] text-fg-3">{below}</div>}
    </div>
  );
}

function Fixtures({ data }: { data: Data }) {
  const matches = arr(data.matches ?? data.fixtures ?? data.games ?? data.items).filter(isObj);
  // Matches of the same day sit under its date, in the order given.
  const days: { key: string; date: Date | null; items: Data[] }[] = [];
  for (const m of matches) {
    const d = parseDate(m.date ?? m.kickoff ?? m.time);
    const key = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : '';
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(m);
    else days.push({ key, date: d, items: [m] });
  }
  return (
    <Card pad={false} className="overflow-hidden">
      {str(data.title) && <Head title={data.title} className="mb-0 px-4 pt-4 pb-3 @lg:px-5" />}
      {days.map((d, i) => (
        <section key={i}>
          {d.date && <div className={cx('border-b border-line bg-bg-1 px-4 py-1.5 text-[12px] font-semibold text-fg-2 @lg:px-5', (i > 0 || str(data.title)) && 'border-t')}>{fmtDate(d.date, 'long')}</div>}
          {d.items.map((m, j) => (
            <FixtureRow key={j} m={m} />
          ))}
        </section>
      ))}
    </Card>
  );
}

// ---- contact cards -----------------------------------------------------------------------------------------------------

interface Contact {
  name: string;
  role: string;
  org: string;
  image: string;
  phones: string[];
  emails: string[];
  website: string;
  address: string;
  lat: number | null;
  lng: number | null;
  hours: string;
  note: string;
}

const isWebUrl = (u: string) => /^https?:\/\//i.test(u);
/** One value or several: a list as it is, text as one. */
const several = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => textOf(x, 'value', 'number', 'address')).filter(Boolean) : str(v) ? [str(v)] : []);

function contactOf(c: Data): Contact {
  const lat = num(c.lat ?? c.latitude);
  const lng = num(c.lng ?? c.lon ?? c.longitude);
  return {
    name: textOf(c, 'name', 'title', 'org', 'company'),
    role: str(c.role ?? c.position ?? c.job ?? (str(c.name) ? c.title : undefined)),
    org: str(c.org ?? c.organization ?? c.company),
    image: str(c.image ?? c.photo ?? c.avatar ?? c.logo),
    phones: several(c.phone ?? c.phones ?? c.tel ?? c.telephone ?? c.mobile),
    emails: several(c.email ?? c.emails ?? c.mail),
    website: str(c.website ?? c.url ?? c.site ?? c.web),
    address: str(c.address ?? c.location),
    lat: lat !== null && Math.abs(lat) <= 90 ? lat : null,
    lng: lng !== null && Math.abs(lng) <= 180 ? lng : null,
    hours: str(c.hours ?? c.open ?? c.opening_hours),
    note: str(c.note ?? c.notes ?? c.description),
  };
}

/** Markdown as plain words: for an address book's note, a copy. */
const plainMd = (md: string) =>
  md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .trim();

const mapLink = (c: Contact) =>
  c.lat !== null && c.lng !== null ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}` : c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}` : '';

/** A name as an address book files it: family name, then given names ("Natarajan", "Priya"); "Last, First" as it is. */
function nameParts(name: string): [string, string] {
  if (name.includes(',')) {
    const k = name.indexOf(',');
    return [name.slice(0, k).trim(), name.slice(k + 1).trim()];
  }
  const w = name.trim().split(/\s+/);
  if (w.length < 2) return [name.trim(), ''];
  let k = w.length - 1;
  while (k > 1 && /^(van|von|de|del|della|der|den|da|di|du|dos|das|le|la|ter|ten|bin|ibn|al)$/i.test(w[k - 1])) k--;
  return [w.slice(k).join(' '), w.slice(0, k).join(' ')];
}

const vText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
/** A line of a vCard folded at 75 bytes, as address books want them. */
function vFold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const c = ch.codePointAt(0) ?? 0;
    const b = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    if (bytes + b > 74) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

/** A contact as a vCard (3.0), which address books on phones and computers open. */
function vcardOf(c: Contact): string {
  const [family, given] = nameParts(c.name);
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vText(family)};${vText(given)};;;`, `FN:${vText(c.name)}`];
  if (c.org) lines.push(`ORG:${vText(c.org)}`);
  if (c.role) lines.push(`TITLE:${vText(c.role)}`);
  for (const p of c.phones) lines.push(`TEL;TYPE=VOICE:${p.replace(/[\r\n]+/g, ' ')}`);
  for (const e of c.emails) lines.push(`EMAIL;TYPE=INTERNET:${e.replace(/\s+/g, '')}`);
  if (isWebUrl(c.website)) lines.push(`URL:${c.website}`);
  if (c.address) lines.push(`ADR;TYPE=WORK:;;${vText(c.address)};;;;`, `LABEL;TYPE=WORK:${vText(c.address)}`);
  if (c.lat !== null && c.lng !== null) lines.push(`GEO:${c.lat};${c.lng}`);
  if (isWebUrl(c.image)) lines.push(`PHOTO;VALUE=URI:${c.image}`);
  const note = [c.hours ? `${tr('Hours')}: ${c.hours}` : '', plainMd(c.note)].filter(Boolean).join('\n');
  if (note) lines.push(`NOTE:${vText(note)}`);
  lines.push('END:VCARD');
  return `${lines.map(vFold).join('\r\n')}\r\n`;
}

const contactText = (c: Contact) => [c.name, [c.role, c.org].filter(Boolean).join(', '), ...c.phones, ...c.emails, c.website, c.address, c.hours, plainMd(c.note)].filter(Boolean).join('\n');
const fileSlug = (s: string) =>
  (
    s
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'contact'
  ).toLowerCase();

/** A line of a contact card: its icon, and what it says (a link once the block is whole). */
function ContactRow({ icon, href, external, children }: { icon: ReactNode; href?: string; external?: boolean; children: ReactNode }) {
  const body = (
    <>
      <span className="mt-[3px] shrink-0 text-fg-3">{icon}</span>
      <span className="min-w-0 break-words">
        {children}
        {href && external && <ExternalLink size={11} className="ml-1 inline-block align-[-1px] opacity-60" />}
      </span>
    </>
  );
  return href ? (
    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className="flex min-w-0 items-start gap-2 rounded-md text-fg-2 transition-colors hover:text-accent">
      {body}
    </a>
  ) : (
    <div className="flex min-w-0 items-start gap-2 text-fg-2">{body}</div>
  );
}

function ContactCard({ c, done }: { c: Contact; done: boolean }) {
  const map = mapLink(c);
  const site = isWebUrl(c.website) ? c.website : '';
  const siteText = site ? site.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') : c.website;
  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-line p-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar name={c.name} image={c.image} className="h-12 w-12 text-[15px]" />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[15px] leading-snug font-semibold text-fg">{c.name}</div>
          {(c.role || c.org) && <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{[c.role, c.org].filter(Boolean).join(' · ')}</div>}
        </div>
      </div>
      {(c.phones.length > 0 || c.emails.length > 0 || c.website || c.address || c.hours) && (
        <div className="mt-3 space-y-1.5 text-[13px]">
          {c.phones.map((p, i) => (
            <ContactRow key={`p${i}`} icon={<Phone size={13} />} href={done ? `tel:${p.replace(/[^\d+]/g, '')}` : undefined}>
              <span className="tabular-nums">{p}</span>
            </ContactRow>
          ))}
          {c.emails.map((e, i) => (
            <ContactRow key={`e${i}`} icon={<Mail size={13} />} href={done ? `mailto:${e.replace(/\s+/g, '')}` : undefined}>
              {e}
            </ContactRow>
          ))}
          {c.website && (
            <ContactRow icon={<Globe size={13} />} href={done && site ? site : undefined} external>
              {siteText}
            </ContactRow>
          )}
          {c.address && (
            <ContactRow icon={<MapPin size={13} />} href={done && map ? map : undefined} external>
              {c.address}
            </ContactRow>
          )}
          {!c.address && map && done && (
            <ContactRow icon={<MapPin size={13} />} href={map} external>
              {tr('On the map')}
            </ContactRow>
          )}
          {c.hours && <ContactRow icon={<Clock size={13} />}>{c.hours}</ContactRow>}
        </div>
      )}
      {c.note && <Md text={c.note} className="mt-2.5 text-[13px] text-fg-2" />}
      {done && c.name && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
          <Btn icon={<Download size={13} />} className="h-7 px-2.5 text-[12px]" onClick={() => download(`${fileSlug(c.name)}.vcf`, 'text/vcard;charset=utf-8', vcardOf(c))}>
            {tr('Save contact')}
          </Btn>
          <Copy text={() => contactText(c)} label={tr('Copy the details')} />
        </div>
      )}
    </li>
  );
}

function Contacts({ data, done }: { data: Data; done: boolean }) {
  const given = arr(data.contacts ?? data.people ?? data.items).map((c) => (isObj(c) ? c : { name: str(c) }));
  // One contact written at the top level: { name, phone… }.
  const list = (given.length ? given : str(data.name) || str(data.phone) || str(data.email) ? [data] : []).map(contactOf).filter((c) => c.name);
  return (
    <Card>
      <Head
        title={given.length ? data.title : undefined}
        aside={
          done && list.length > 1 ? (
            <Btn icon={<Download size={13} />} onClick={() => download(`${fileSlug(str(data.title) || 'contacts')}.vcf`, 'text/vcard;charset=utf-8', list.map(vcardOf).join(''))}>
              {tr('Save all')}
            </Btn>
          ) : undefined
        }
      />
      <ul className={cx('m-0 grid list-none gap-3 p-0', list.length > 1 && '@xl:grid-cols-2')}>
        {list.map((c, i) => (
          <ContactCard key={i} c={c} done={done} />
        ))}
      </ul>
    </Card>
  );
}

// ---- a knockout bracket --------------------------------------------------------------------------------------------------

interface BSide {
  name: string;
  seed: number | null;
  score: string;
  logo: string;
}
interface BMatch {
  a: BSide;
  b: BSide;
  win: 'a' | 'b' | null;
  date: string;
  note: string;
}
interface BRound {
  name: string;
  matches: BMatch[];
}

const bSide = (v: unknown): BSide => {
  const o = isObj(v) ? v : { name: str(v) };
  return { name: textOf(o, 'name', 'team', 'player', 'title'), seed: num(o.seed), score: str(o.score ?? o.goals ?? o.points), logo: str(o.logo ?? o.flag ?? o.image ?? o.crest) };
};

/** Who won: as named ("a", "home", 1, or the side's name), else from the scores ("1 (5)" beats "1 (3)") when both are in. */
function winnerOf(m: Data, a: BSide, b: BSide): 'a' | 'b' | null {
  const w = isObj(m.winner) ? textOf(m.winner, 'name', 'team') : m.winner ?? m.won;
  const s = str(w).trim().toLowerCase();
  if (s === 'a' || s === 'home' || s === 'top' || s === '1') return 'a';
  if (s === 'b' || s === 'away' || s === 'bottom' || s === '2') return 'b';
  if (s && s === a.name.toLowerCase()) return 'a';
  if (s && s === b.name.toLowerCase()) return 'b';
  if (s) return null;
  const x = (a.score.match(/\d+/g) ?? []).map(Number);
  const y = (b.score.match(/\d+/g) ?? []).map(Number);
  if (!x.length || !y.length) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 'a' : 'b';
  return null;
}

const SIDE_H = 26;
const MATCH_H = SIDE_H * 2 + 1;

function MatchBox({ m, width, traced, seeded, done, onFocus }: { m: BMatch; width: number; traced: string | null; seeded: boolean; done: boolean; onFocus: (name: string | null) => void }) {
  const on = !!traced && (m.a.name === traced || m.b.name === traced);
  return (
    <div className={cx('overflow-hidden rounded-lg border bg-panel', on ? 'border-accent/60' : 'border-line')} style={{ width }}>
      {(['a', 'b'] as const).map((k) => {
        const s = m[k];
        const won = m.win === k;
        const lost = !!m.win && !won;
        return (
          <div
            key={k}
            onPointerEnter={(e) => done && e.pointerType === 'mouse' && s.name && onFocus(s.name)}
            onPointerLeave={() => onFocus(null)}
            className={cx('flex items-center gap-1.5 px-2 text-[12.5px]', k === 'a' && 'border-b border-line/70', traced && s.name === traced && 'bg-accent-soft')}
            style={{ height: SIDE_H }}
          >
            {seeded && <span className="w-4 shrink-0 text-right text-[10.5px] text-fg-3 tabular-nums">{s.seed ?? ''}</span>}
            {s.logo && <Pic src={s.logo} alt="" fit="contain" zoom={false} className="h-3.5 w-5 shrink-0 rounded-[2px] bg-transparent" />}
            <span className={cx('min-w-0 flex-1 truncate', won ? 'font-semibold text-fg' : lost ? 'text-fg-3' : 'text-fg')} title={s.name}>
              {s.name || '—'}
            </span>
            {s.score && <span className={cx('shrink-0 tabular-nums', won ? 'font-semibold text-fg' : 'text-fg-3')}>{s.score}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Bracket({ data, done }: { data: Data; done: boolean }) {
  const all: BRound[] = arr(data.rounds)
    .filter(isObj)
    .map((r, i) => ({
      name: str(r.name ?? r.title ?? r.label) || tr('Round {0}').replace('{0}', String(i + 1)),
      matches: arr(r.matches ?? r.games ?? r.items)
        .filter(isObj)
        .map((m) => {
          const teams = arr(m.teams ?? m.sides);
          const a = bSide(m.a ?? m.home ?? m.top ?? m.team1 ?? teams[0]);
          const b = bSide(m.b ?? m.away ?? m.bottom ?? m.team2 ?? teams[1]);
          return { a, b, win: winnerOf(m, a, b), date: str(m.date ?? m.when), note: str(m.note ?? m.detail) };
        }),
    }))
    .filter((r) => r.matches.length > 0);
  // A match for third place sits under the bracket, not in it.
  const extra = all.filter((r) => /third|3rd|bronze/i.test(r.name));
  const rounds = all.filter((r) => !extra.includes(r));
  const final = rounds[rounds.length - 1];
  const last = final?.matches.length === 1 ? final.matches[0] : null;
  const champ = last?.win ? last[last.win] : null;
  const [ref, room] = useWidth<HTMLDivElement>();
  const [focus, setFocus] = useState<string | null>(null);
  // Whose way through it is traced: the team under the pointer, else the champion's.
  const traced = (done && focus) || champ?.name || null;
  const seeded = all.some((r) => r.matches.some((m) => m.a.seed !== null || m.b.seed !== null));
  const meta = rounds.some((r) => r.matches.some((m) => m.date || m.note));
  const META = meta ? 17 : 0;
  const PITCH = MATCH_H + META + 12;
  const GAP = 26;
  const HEAD = 24;
  const CHAMP = champ ? 116 : 0;
  const R = rounds.length;
  // The scroller's own padding (4px a side) is not room for the bracket.
  const colW = Math.max(124, Math.min(200, Math.floor(((room ? room - 8 : 600) - (R - 1) * GAP - (champ ? GAP + CHAMP : 0)) / Math.max(1, R))));
  const xOf = (ri: number) => ri * (colW + GAP);
  // Each match sits level with the middle of the two that feed it (matches 2j and 2j + 1 of the round before).
  const ys: number[][] = [];
  rounds.forEach((r, ri) => {
    const prev = ys[ri - 1];
    const row: number[] = [];
    r.matches.forEach((_, j) => {
      const f1 = prev?.[2 * j];
      const f2 = prev?.[2 * j + 1];
      let y = f1 !== undefined && f2 !== undefined ? (f1 + f2) / 2 : (f1 ?? (j ? row[j - 1] + PITCH : 0));
      if (j && y < row[j - 1] + PITCH) y = row[j - 1] + PITCH;
      row.push(y);
    });
    ys.push(row);
  });
  const mid = (ri: number, j: number) => HEAD + ys[ri][j] + MATCH_H / 2;
  const height = HEAD + Math.max(0, ...ys.map((row) => (row.length ? row[row.length - 1] : 0))) + MATCH_H + META;
  const width = R ? xOf(R - 1) + colW + (champ ? GAP + CHAMP : 0) : 0;
  const winnerIs = (m: BMatch, name: string | null) => !!name && !!m.win && m[m.win].name === name;
  const lines: { d: string; on: boolean }[] = [];
  rounds.forEach((r, ri) => {
    if (!ri) return;
    r.matches.forEach((m, j) => {
      for (const f of [2 * j, 2 * j + 1]) {
        const from = rounds[ri - 1].matches[f];
        if (!from) continue;
        const x1 = xOf(ri - 1) + colW;
        const xm = x1 + GAP / 2;
        lines.push({ d: `M${x1},${mid(ri - 1, f)}H${xm}V${mid(ri, j)}H${xOf(ri)}`, on: winnerIs(from, traced) && (m.a.name === traced || m.b.name === traced) });
      }
    });
  });
  if (champ && last) lines.push({ d: `M${xOf(R - 1) + colW},${mid(R - 1, 0)}H${xOf(R - 1) + colW + GAP}`, on: champ.name === traced });
  return (
    <Card>
      <Head title={data.title} />
      <div ref={ref} className="-mx-1 overflow-x-auto px-1 pb-1">
        {R > 0 && (
          <div className="relative" style={{ width, height }}>
            <svg width={width} height={height} className="pointer-events-none absolute inset-0" aria-hidden>
              {[...lines.filter((l) => !l.on), ...lines.filter((l) => l.on)].map((l, i) => (
                <path key={i} d={l.d} fill="none" stroke={l.on ? 'var(--accent)' : 'var(--line-2)'} strokeWidth={l.on ? 2 : 1.25} strokeLinejoin="round" />
              ))}
            </svg>
            {rounds.map((r, ri) => (
              <Fragment key={ri}>
                <div className="absolute truncate text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase" style={{ left: xOf(ri), top: 0, width: colW }}>
                  {r.name}
                </div>
                {r.matches.map((m, j) => (
                  <div key={j} className="absolute" style={{ left: xOf(ri), top: HEAD + ys[ri][j] }}>
                    <MatchBox m={m} width={colW} traced={traced} seeded={seeded} done={done} onFocus={setFocus} />
                    {(m.date || m.note) && (
                      <div className="truncate px-0.5 pt-0.5 text-[10.5px] leading-[15px] text-fg-3" style={{ width: colW }} title={[m.date ? fmtDate(m.date, /T\d/.test(m.date) ? 'dateTime' : 'short') : '', m.note].filter(Boolean).join(' · ')}>
                        {[m.date ? fmtDate(m.date, /T\d/.test(m.date) ? 'dateTime' : 'short') : '', m.note].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </Fragment>
            ))}
            {champ && (
              <div
                className={cx('absolute flex flex-col items-center rounded-xl border px-2 py-2.5 text-center', champ.name === traced ? 'border-accent/50 bg-accent-soft' : 'border-line bg-bg-1')}
                style={{ left: xOf(R - 1) + colW + GAP, top: mid(R - 1, 0) - 44, width: CHAMP }}
                onPointerEnter={(e) => done && e.pointerType === 'mouse' && setFocus(champ.name)}
                onPointerLeave={() => setFocus(null)}
              >
                <Trophy size={20} className="text-[#e8a317]" />
                <div className="mt-1 text-[10.5px] font-semibold tracking-wide text-fg-3 uppercase">{tr('Champion')}</div>
                <div className="mt-0.5 flex max-w-full items-center gap-1.5">
                  {champ.logo && <Pic src={champ.logo} alt="" fit="contain" zoom={false} className="h-3.5 w-5 shrink-0 bg-transparent" />}
                  <span className="truncate text-[14px] leading-tight font-semibold">{champ.name}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {extra.map((r, i) => (
        <Section key={i} title={r.name} className="mt-4">
          <div className="flex flex-wrap gap-3">
            {r.matches.map((m, j) => (
              <div key={j}>
                <MatchBox m={m} width={colW} traced={traced} seeded={seeded} done={done} onFocus={setFocus} />
                {(m.date || m.note) && <div className="truncate px-0.5 pt-0.5 text-[10.5px] text-fg-3">{[m.date ? fmtDate(m.date, /T\d/.test(m.date) ? 'dateTime' : 'short') : '', m.note].filter(Boolean).join(' · ')}</div>}
              </div>
            ))}
          </div>
        </Section>
      ))}
    </Card>
  );
}

export const PEOPLE_UIS: Record<string, AnswerUiView> = {
  profile: Profile,
  people: People,
  'org-chart': OrgChart,
  match: Match,
  standings: Standings,
  fixtures: Fixtures,
  contact: Contacts,
  bracket: Bracket,
};
