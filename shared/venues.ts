// The review forms of the venues the Reviewer simulator knows: each one's fields as its reviewers fill them, the scores
// with their scales, and what the top of each scale means. Forms change a little each year: these follow the 2025
// calls, and the simulator says so; a venue that is not here is reviewed on a common form (Other).

export interface VenueScore {
  id: string;
  label: string;
  min: number;
  max: number;
  /** What the ends and the middle of the scale mean, as the form says it. */
  meaning: string;
}

export interface VenueForm {
  /** As the form and the app show it. */
  name: string;
  /** What reviewers write, in the order the form asks it. */
  fields: { id: string; label: string; ask: string }[];
  scores: VenueScore[];
  /** The score that says accept or reject. */
  overall: string;
  /** What reviewers there weigh most, in a line (for the reviewers' instructions). */
  weighs: string;
}

const conf = (min: number, max: number): VenueScore => ({ id: 'confidence', label: 'Confidence', min, max, meaning: `${min}: an educated guess; ${max}: certain, having checked the details` });

export const VENUES: VenueForm[] = [
  {
    name: 'ACL Rolling Review',
    fields: [
      { id: 'summary', label: 'Paper summary', ask: 'What the paper is about and what it contributes, in your own words' },
      { id: 'strengths', label: 'Summary of strengths', ask: 'The main reasons to publish it' },
      { id: 'weaknesses', label: 'Summary of weaknesses', ask: 'The main reasons not to, each with what would address it' },
      { id: 'comments', label: 'Comments, suggestions and typos', ask: 'Everything else that would make it better' },
    ],
    scores: [
      { id: 'soundness', label: 'Soundness', min: 1, max: 5, meaning: '5: excellent, every claim well supported; 3: acceptable, some claims need more support; 1: major claims unsupported' },
      { id: 'overall', label: 'Overall assessment', min: 1, max: 5, meaning: '5: award-level, consider for a top paper; 4: conference; 3: findings; 2: resubmit next cycle; 1: do not resubmit' },
      conf(1, 5),
      { id: 'reproducibility', label: 'Reproducibility', min: 1, max: 5, meaning: '5: could easily reproduce the results; 1: could not reproduce them' },
    ],
    overall: 'overall',
    weighs: 'soundness of the claims, fair comparison with strong baselines, a Limitations section, the data and models released',
  },
  {
    name: 'SIGIR',
    fields: [
      { id: 'summary', label: 'Summary', ask: 'The problem, the approach and the main findings' },
      { id: 'relevance', label: 'Relevance to SIGIR', ask: 'How it bears on information retrieval' },
      { id: 'strengths', label: 'Strengths', ask: 'Numbered' },
      { id: 'weaknesses', label: 'Weaknesses', ask: 'Numbered, each with what would address it' },
      { id: 'comments', label: 'Detailed comments', ask: 'Method, experiments, evaluation, writing' },
    ],
    scores: [
      { id: 'originality', label: 'Originality', min: 1, max: 5, meaning: '5: highly original; 1: known' },
      { id: 'soundness', label: 'Technical soundness', min: 1, max: 5, meaning: '5: rigorous; 1: flawed' },
      { id: 'evaluation', label: 'Quality of the evaluation', min: 1, max: 5, meaning: '5: strong baselines, collections and significance tests; 1: weak' },
      { id: 'presentation', label: 'Quality of presentation', min: 1, max: 5, meaning: '5: very clear; 1: hard to follow' },
      { id: 'overall', label: 'Overall recommendation', min: -3, max: 3, meaning: '3: strong accept; 1: weak accept; 0: borderline; -1: weak reject; -3: strong reject' },
      conf(1, 5),
    ],
    overall: 'overall',
    weighs: 'standard test collections and strong, tuned baselines (BM25 and recent neural rankers), significance testing, efficiency where it matters, and a clear contribution to retrieval',
  },
  {
    name: 'NeurIPS',
    fields: [
      { id: 'summary', label: 'Summary', ask: 'What it claims and how' },
      { id: 'strengths_weaknesses', label: 'Strengths and weaknesses', ask: 'On quality, clarity, significance and originality' },
      { id: 'questions', label: 'Questions', ask: 'What the authors should answer; what would change your score' },
      { id: 'limitations', label: 'Limitations', ask: 'Whether the authors state the limitations and the possible harms of their work' },
    ],
    scores: [
      { id: 'quality', label: 'Quality', min: 1, max: 4, meaning: '4: excellent; 1: poor' },
      { id: 'clarity', label: 'Clarity', min: 1, max: 4, meaning: '4: excellent; 1: poor' },
      { id: 'significance', label: 'Significance', min: 1, max: 4, meaning: '4: excellent; 1: poor' },
      { id: 'originality', label: 'Originality', min: 1, max: 4, meaning: '4: excellent; 1: poor' },
      { id: 'overall', label: 'Overall', min: 1, max: 6, meaning: '6: strong accept; 4: borderline accept; 3: borderline reject; 1: strong reject' },
      conf(1, 5),
    ],
    overall: 'overall',
    weighs: 'technical quality, honest claims backed by experiments with error bars, clear writing, significance to the field, the checklist answered',
  },
  {
    name: 'ICLR',
    fields: [
      { id: 'summary', label: 'Summary', ask: 'What it claims to contribute' },
      { id: 'strengths', label: 'Strengths', ask: 'The main ones' },
      { id: 'weaknesses', label: 'Weaknesses', ask: 'The main ones, each with what would fix it' },
      { id: 'questions', label: 'Questions', ask: 'For the authors, to clear up in the discussion' },
    ],
    scores: [
      { id: 'soundness', label: 'Soundness', min: 1, max: 4, meaning: '4: excellent; 1: poor' },
      { id: 'presentation', label: 'Presentation', min: 1, max: 4, meaning: '4: excellent; 1: poor' },
      { id: 'contribution', label: 'Contribution', min: 1, max: 4, meaning: '4: excellent; 1: poor' },
      { id: 'overall', label: 'Rating', min: 1, max: 10, meaning: '10: strong accept; 8: accept; 6: marginally above the threshold; 5: marginally below; 3: reject; 1: strong reject' },
      conf(1, 5),
    ],
    overall: 'overall',
    weighs: 'whether the claims are supported, ablations that show where the gains come from, comparison with recent work, clarity',
  },
  {
    name: 'ICML',
    fields: [
      { id: 'summary', label: 'Summary', ask: 'The main findings and contributions' },
      { id: 'claims', label: 'Claims and evidence', ask: 'Are the claims supported by clear and convincing evidence?' },
      { id: 'methods', label: 'Methods and evaluation criteria', ask: 'Do they make sense for the problem?' },
      { id: 'experiments', label: 'Experimental designs or analyses', ask: 'Are they sound and valid?' },
      { id: 'literature', label: 'Relation to the broader literature', ask: 'And essential references it does not discuss' },
      { id: 'other', label: 'Other strengths and weaknesses', ask: 'Originality, significance, clarity' },
      { id: 'questions', label: 'Questions for the authors', ask: 'Whose answers could change your evaluation' },
    ],
    scores: [{ id: 'overall', label: 'Overall recommendation', min: 1, max: 5, meaning: '5: strong accept; 4: accept; 3: weak accept; 2: weak reject; 1: reject' }, conf(1, 5)],
    overall: 'overall',
    weighs: 'claims backed by evidence, sound experimental design, the relation to prior work, and essential references',
  },
  {
    name: 'KDD',
    fields: [
      { id: 'summary', label: 'Summary', ask: 'The problem, the method and the results' },
      { id: 'strengths', label: 'Strengths', ask: 'S1, S2, …' },
      { id: 'weaknesses', label: 'Weaknesses', ask: 'W1, W2, …, each with what would address it' },
      { id: 'comments', label: 'Detailed comments', ask: 'Including reproducibility: code, data and settings' },
    ],
    scores: [
      { id: 'novelty', label: 'Novelty', min: 1, max: 5, meaning: '5: groundbreaking; 1: none' },
      { id: 'quality', label: 'Technical quality', min: 1, max: 5, meaning: '5: excellent; 1: poor' },
      { id: 'presentation', label: 'Presentation', min: 1, max: 5, meaning: '5: excellent; 1: poor' },
      { id: 'overall', label: 'Overall rating', min: 1, max: 6, meaning: '6: strong accept; 4: weak accept; 3: weak reject; 1: strong reject' },
      conf(1, 5),
    ],
    overall: 'overall',
    weighs: 'real-world significance and scale, strong baselines on public data, reproducibility (code and data), clear writing',
  },
  {
    name: 'CIKM',
    fields: [
      { id: 'summary', label: 'Summary', ask: 'The contribution in a few sentences' },
      { id: 'strengths', label: 'Strengths', ask: 'Numbered' },
      { id: 'weaknesses', label: 'Weaknesses', ask: 'Numbered' },
      { id: 'comments', label: 'Detailed comments', ask: 'For the authors' },
    ],
    scores: [{ id: 'overall', label: 'Overall evaluation', min: -3, max: 3, meaning: '3: strong accept; 0: borderline; -3: strong reject' }, conf(1, 5)],
    overall: 'overall',
    weighs: 'novelty, solid experiments with standard data and strong baselines, clarity',
  },
  {
    name: 'WSDM',
    fields: [
      { id: 'summary', label: 'Summary', ask: 'What the paper does' },
      { id: 'strengths', label: 'Strengths', ask: 'Numbered' },
      { id: 'weaknesses', label: 'Weaknesses', ask: 'Numbered' },
      { id: 'comments', label: 'Detailed comments', ask: 'For the authors' },
    ],
    scores: [
      { id: 'originality', label: 'Originality', min: 1, max: 5, meaning: '5: very original; 1: known' },
      { id: 'quality', label: 'Technical quality', min: 1, max: 5, meaning: '5: excellent; 1: poor' },
      { id: 'overall', label: 'Overall', min: 1, max: 5, meaning: '5: strong accept; 3: borderline; 1: strong reject' },
      conf(1, 5),
    ],
    overall: 'overall',
    weighs: 'methods for search and data mining on the web, evaluated on real data against strong baselines',
  },
  {
    name: 'TheWebConf',
    fields: [
      { id: 'summary', label: 'Summary', ask: 'The contribution and its relevance to the track' },
      { id: 'strengths', label: 'Strengths', ask: 'Numbered' },
      { id: 'weaknesses', label: 'Weaknesses', ask: 'Numbered' },
      { id: 'comments', label: 'Detailed comments', ask: 'For the authors' },
    ],
    scores: [
      { id: 'relevance', label: 'Relevance to the Web and the track', min: 1, max: 5, meaning: '5: central; 1: off topic' },
      { id: 'originality', label: 'Originality', min: 1, max: 5, meaning: '5: very original; 1: known' },
      { id: 'quality', label: 'Technical quality', min: 1, max: 5, meaning: '5: excellent; 1: poor' },
      { id: 'overall', label: 'Overall', min: -3, max: 3, meaning: '3: strong accept; 0: borderline; -3: strong reject' },
      conf(1, 5),
    ],
    overall: 'overall',
    weighs: 'a clear link to the Web, novelty, solid evaluation, ethics of the data used',
  },
  {
    name: 'A journal',
    fields: [
      { id: 'summary', label: 'Summary', ask: 'What it claims and how it shows it' },
      { id: 'major', label: 'Major comments', ask: 'Numbered: what must change for it to be published' },
      { id: 'minor', label: 'Minor comments', ask: 'Numbered: smaller fixes, clarity, typos' },
    ],
    scores: [
      { id: 'overall', label: 'Recommendation', min: 1, max: 4, meaning: '4: accept as it is; 3: minor revision; 2: major revision; 1: reject' },
      conf(1, 5),
    ],
    overall: 'overall',
    weighs: 'completeness, rigour, the discussion of related work and of limitations, and a clear contribution over the authors’ earlier papers',
  },
  {
    name: 'Other',
    fields: [
      { id: 'summary', label: 'Summary', ask: 'What it claims and contributes' },
      { id: 'strengths', label: 'Strengths', ask: 'The main ones' },
      { id: 'weaknesses', label: 'Weaknesses', ask: 'The main ones, each with what would fix it' },
      { id: 'questions', label: 'Questions', ask: 'For the authors' },
    ],
    scores: [{ id: 'overall', label: 'Overall', min: 1, max: 10, meaning: '10: top paper; 6: accept; 5: borderline; 3: reject; 1: strong reject' }, conf(1, 5)],
    overall: 'overall',
    weighs: 'whether the claims hold, the experiments and baselines, novelty, clarity',
  },
];

export const VENUE_NAMES = VENUES.map((v) => v.name);

/** A venue's form by its name (Other for one not known). */
export const venueForm = (name: string): VenueForm => VENUES.find((v) => v.name.toLowerCase() === String(name ?? '').trim().toLowerCase()) ?? VENUES[VENUES.length - 1];
