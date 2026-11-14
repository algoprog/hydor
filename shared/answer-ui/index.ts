// Answer UIs: cards, tables, charts, maps, galleries and small tools that an agent fills with data and shows inside its
// reply, instead of writing the same thing as text. The agent writes a fenced block, ```ui <name>, holding the UI's data
// as one JSON object; the pages draw it in place as the reply streams (web/src/components/answer), in the app's look.
//
// This is the catalog: what each UI is for (its `use`, which the gallery shows, agents read and search finds it by), the
// data it takes (`shape`: a TypeScript-like type that agents read) and an example (the gallery at /answers draws each
// with it). There are many, so agents are never handed them all: find_ui (server/answers) gives the few that fit a few
// words on what the answer shows, by words and by meaning. Shared: the server describes them, the pages draw them.
import { CODE } from './code.ts';
import { COMPARE } from './compare.ts';
import { DATA } from './data.ts';
import { FOOD } from './food.ts';
import { LEARN } from './learn.ts';
import { MEDIA } from './media.ts';
import { MONEY } from './money.ts';
import { PEOPLE } from './people.ts';
import { PLANS } from './plans.ts';
import { SCIENCE } from './science.ts';
import { SHOPPING } from './shopping.ts';
import { SUMMARY } from './summary.ts';
import { TRAVEL } from './travel.ts';
import { WORK } from './work.ts';
import { WRITING } from './writing.ts';
import type { AnswerUiGroup, AnswerUiSpec } from './types.ts';

export type { AnswerUiGroup, AnswerUiSpec } from './types.ts';

/** The groups the gallery shows them in, in order. */
export const ANSWER_UI_GROUPS: { id: AnswerUiGroup; label: string }[] = [
  { id: 'summary', label: 'Summaries and notes' },
  { id: 'compare', label: 'Compare and decide' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'travel', label: 'Places and travel' },
  { id: 'food', label: 'Food and fitness' },
  { id: 'plans', label: 'Time and plans' },
  { id: 'work', label: 'Work and business' },
  { id: 'data', label: 'Numbers and charts' },
  { id: 'money', label: 'Money' },
  { id: 'learn', label: 'Learning' },
  { id: 'science', label: 'Science and the sky' },
  { id: 'media', label: 'Media and events' },
  { id: 'people', label: 'People and sports' },
  { id: 'writing', label: 'Writing' },
  { id: 'code', label: 'Code' },
];

/** Every answer UI, by group. */
export const ANSWER_UIS: AnswerUiSpec[] = [...SUMMARY, ...COMPARE, ...SHOPPING, ...TRAVEL, ...FOOD, ...PLANS, ...WORK, ...DATA, ...MONEY, ...LEARN, ...SCIENCE, ...MEDIA, ...PEOPLE, ...WRITING, ...CODE];

const BY_ID = new Map(ANSWER_UIS.map((s) => [s.id, s]));

/**
 * Other names agents may write for a UI (they guess before they look): each to the UI it means. A name that is a UI's
 * own is never here.
 */
export const ANSWER_UI_ALIASES: Record<string, string> = {
  tldr: 'key-points',
  summary: 'key-points',
  takeaways: 'key-points',
  note: 'callout',
  warning: 'callout',
  tip: 'callout',
  infobox: 'fact-sheet',
  facts: 'fact-sheet',
  dictionary: 'definition',
  accordion: 'faq',
  compare: 'comparison',
  'comparison-table': 'comparison',
  vs: 'versus',
  options: 'choices',
  pick: 'recommendation',
  leaderboard: 'ranking',
  review: 'scorecard',
  shop: 'products',
  shopping: 'products',
  map: 'places',
  'places-map': 'places',
  trip: 'itinerary',
  route: 'directions',
  forecast: 'weather',
  hotels: 'stays',
  'time-zones': 'world-clock',
  converter: 'unit-converter',
  'currency-converter': 'currency',
  schedule: 'agenda',
  'how-to': 'steps',
  todo: 'checklist',
  tasks: 'checklist',
  kpi: 'stats',
  metrics: 'stats',
  donut: 'breakdown',
  pie: 'breakdown',
  'what-if': 'calculator',
  benchmark: 'results',
  mortgage: 'loan',
  'compound-interest': 'savings',
  bill: 'split-bill',
  plans: 'pricing',
  test: 'quiz',
  'study-cards': 'flashcards',
  'worked-solution': 'solution',
  papers: 'paper',
  'file-tree': 'tree',
  outline: 'tree',
  photos: 'gallery',
  images: 'gallery',
  videos: 'video',
  music: 'tracks',
  playlist: 'tracks',
  movies: 'media',
  books: 'media',
  events: 'event',
  palette: 'color-palette',
  person: 'profile',
  team: 'people',
  league: 'standings',
  'league-table': 'standings',
  matches: 'fixtures',
  tweet: 'social-post',
  post: 'social-post',
  drafts: 'variants',
  ideas: 'variants',
  'code-tabs': 'code',
  shell: 'commands',
  terminal: 'commands',
  endpoint: 'api',
  diagnosis: 'error',
  'test-results': 'tests',
  'keyboard-shortcuts': 'shortcuts',
  repos: 'repo',
  headlines: 'news',
  resources: 'links',
  'night-sky': 'sky',
  astronomy: 'sky',
  wizard: 'decision-tree',
  troubleshooter: 'decision-tree',
  flowchart: 'decision-tree',
  wheel: 'picker',
  spinner: 'picker',
  random: 'picker',
  dice: 'picker',
  timetable: 'week',
  'week-plan': 'week',
  'gantt-chart': 'gantt',
  timer: 'timers',
  stopwatch: 'timers',
  'action-list': 'action-items',
  shipment: 'tracking',
  'order-status': 'tracking',
  trains: 'departures',
  'transit-departures': 'departures',
  hike: 'elevation',
  'elevation-profile': 'elevation',
  homes: 'listings',
  apartments: 'listings',
  'real-estate': 'listings',
  'job-listings': 'jobs',
  openings: 'jobs',
  receipt: 'invoice',
  findings: 'issues',
  'code-review': 'issues',
  'review-notes': 'issues',
  histogram: 'distribution',
  'box-plot': 'distribution',
  bridge: 'waterfall',
  'calendar-heatmap': 'activity',
  streak: 'activity',
  tournament: 'bracket',
  knockout: 'bracket',
  holdings: 'portfolio',
  'function-plot': 'graph',
  plotter: 'graph',
  cloze: 'fill-blanks',
  'match-pairs': 'matching',
  sequence: 'ordering',
  verbs: 'conjugation',
  conversation: 'dialogue',
  chat: 'dialogue',
  reference: 'citation',
  bibliography: 'citation',
  hotspots: 'annotated-image',
  'labelled-image': 'annotated-image',
  'image-compare': 'before-after',
  guitar: 'chords',
  piano: 'chords',
  typography: 'fonts',
  'font-pairing': 'fonts',
  'qr-code': 'qr',
  log: 'logs',
  crontab: 'cron',
  'bubble-map': 'map-values',
  choropleth: 'map-values',
  vcard: 'contact',
  suggestions: 'follow-ups',
  followups: 'follow-ups',
  'next-steps': 'follow-ups',
  'next-questions': 'follow-ups',
  'related-questions': 'follow-ups',
  'suggested-questions': 'follow-ups',
  'quick-replies': 'follow-ups',
  claims: 'fact-check',
  verdicts: 'fact-check',
  factcheck: 'fact-check',
  'claim-check': 'fact-check',
  'myth-busting': 'fact-check',
  feedback: 'annotated-text',
  corrections: 'annotated-text',
  proofreading: 'annotated-text',
  proofread: 'annotated-text',
  markup: 'annotated-text',
  annotations: 'annotated-text',
  'text-feedback': 'annotated-text',
  'essay-feedback': 'annotated-text',
  'close-reading': 'annotated-text',
  exercises: 'practice',
  problems: 'practice',
  'problem-set': 'practice',
  worksheet: 'practice',
  homework: 'practice',
  drill: 'practice',
  'concept-map': 'network',
  'mind-map': 'network',
  'knowledge-graph': 'network',
  'relationship-map': 'network',
  'dependency-graph': 'network',
  'network-diagram': 'network',
  connections: 'network',
};

/** A UI by its name, or by another name agents write for it (ANSWER_UI_ALIASES); undefined when there is none. */
export function answerUi(name: string | undefined | null): AnswerUiSpec | undefined {
  const n = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  if (!n) return undefined;
  return BY_ID.get(n) ?? BY_ID.get(ANSWER_UI_ALIASES[n] ?? '') ?? BY_ID.get(n.replace(/s$/, ''));
}
