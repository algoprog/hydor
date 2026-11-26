// "Is this new?": what a check of an idea or a result for earlier work gives (server/research/prior-work.ts), as the
// prior_work tool answers it and the conversation's card shows it.

/** known: some paper does the same; partly: the nearest overlap its main part; new: none does; unjudged: no verdict could be given. */
export type PriorVerdict = 'new' | 'partly' | 'known' | 'unjudged';

/** How a paper stands to the idea; unjudged: found near it, but nothing compared the two. */
export type PriorRelation = 'same' | 'overlaps' | 'related' | 'unjudged';

export interface PriorPaper {
  title: string;
  /** The first three authors, then "et al." */
  authors: string;
  year?: number;
  venue?: string;
  /** From the source's own record, never from a model. */
  url: string;
  relation: PriorRelation;
  /** What it shares with the idea, and what differs: a sentence each ('' when unjudged). */
  same: string;
  differs: string;
}

export interface PriorWork {
  verdict: PriorVerdict;
  /** Two or three sentences: what exists, what does not seem to. */
  summary: string;
  /** By relation, the much-cited first among those of one relation; at most 8. */
  closest: PriorPaper[];
  searched: { queries: string[]; sources: string[]; candidates: number };
  /** Always says that finding nothing is not proof that it is new. */
  note: string;
}

export interface PriorAsk {
  /** The idea or the result: two to six sentences, with what makes it different. */
  idea: string;
  field?: string;
  /** Only work from this year on. */
  since?: number;
  /** How many of the closest papers to give (1 to 8). */
  limit?: number;
  /** Searches to run as well as the ones written for the idea. */
  queries?: string[];
  /** The language of the sentences, as its English name ("Greek"). */
  language?: string;
}
