// What the editors' writing helpers send and get back (server/write): design ideas for a slide (PowerPoint
// Designer's and Canva's Magic Design's: the slide's own words, pictures and data laid out anew), the words picked
// rewritten (Canva's Magic Write: shorter, longer, simpler, more formal, friendlier, spelling and grammar fixed,
// translated, or as the user says), and a picture described for people who can't see it (an accessibility fix).
import type { Slide } from './slides.ts';

/** How the words picked are rewritten. */
export type RewriteHow = 'shorter' | 'longer' | 'simpler' | 'formal' | 'friendly' | 'fix' | 'translate' | 'ask';
export const REWRITE_HOWS: RewriteHow[] = ['shorter', 'longer', 'simpler', 'formal', 'friendly', 'fix', 'translate', 'ask'];

/** The menu's words for each way (Translate and the user's own words open a list or a field of their own). */
export const REWRITE_LABELS: Record<RewriteHow, string> = {
  shorter: 'Shorter',
  longer: 'Longer',
  simpler: 'Simpler',
  formal: 'More formal',
  friendly: 'Friendlier',
  fix: 'Fix spelling and grammar',
  translate: 'Translate to',
  ask: 'Say how to rewrite it',
};

/** The most a rewrite takes (characters). */
export const REWRITE_MAX = 6000;

export interface RewriteAsk {
  /** The words, a paragraph or bullet a line; **bold** and *italic* marked where they differ from the rest. */
  text: string;
  how: RewriteHow;
  /** translate: the language, by its English name ("Spanish"). */
  lang?: string;
  /** ask: what the user wants ("Make it more exciting"). */
  ask?: string;
  /** Words around them, for the sense (the slide's title, the paragraph): never rewritten. */
  context?: string;
}

export interface RewriteAnswer {
  text: string;
  /** The model that wrote it. */
  model?: string;
}

/** Languages to translate into, by their English names: the most asked for, then any other typed. */
export const WRITE_LANGS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Greek', 'Chinese (Simplified)', 'Japanese', 'Korean', 'Arabic'];

/** A language's name as a person may type it: letters, spaces, brackets and hyphens. */
export const cleanLang = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s && s.length <= 40 && /^[\p{L}][\p{L} ()'-]*$/u.test(s) ? s : null;
};

/** The ways design ideas lay a slide out, by id, with their names under their pictures in the panel. */
export const IDEA_WAYS: Record<string, string> = {
  'picture-behind': 'Picture behind',
  'big-number': 'Big number',
  split: 'Half and half',
  cards: 'Cards',
  steps: 'Steps',
  statement: 'One statement',
  band: 'Side band',
  columns: 'In columns',
  'picture-grid': 'Picture grid',
  'chart-first': 'Chart first',
  quote: 'Quote',
  magazine: 'Magazine page',
  centred: 'Centred',
};

export interface IdeasAsk {
  /** The deck (its model as the editor has it, changes not saved yet too), or a saved deck's id. */
  deck: unknown;
  /** The slide, from 0. */
  slide: number;
  /** How many ideas (1–4; 3 when left out). */
  count?: number;
  /** The ways already shown (More ideas asks for others). */
  avoid?: string[];
}

export interface IdeasAnswer {
  /** Each idea: the slide laid out anew (its id, notes, transition and comments its own). */
  ideas: Slide[];
  /** Each idea's way, by its name ("Big number") and its id (for More ideas' `avoid`). */
  names: string[];
  ways: string[];
  /** The model that drew them up. */
  model?: string;
}

export interface DescribeAsk {
  /** A picture the app keeps: "naget-asset:<sha>". */
  src: string;
  /** Words around it (the slide's title and words), for its sense and its language. */
  context?: string;
}

export interface DescribeAnswer {
  /** The description, for people who can't see it. */
  alt: string;
  /** The model that wrote it. */
  by?: string;
}
