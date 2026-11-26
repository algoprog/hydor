// Which of the numbers a run prints matter most, by the words in their names: what the Experiments page puts first in
// its tables and charts, and what the app puts first in the message a session gets when its run ends. Server and web
// share it so they agree.

// How much a metric matters, by the words in its name: a quality number (loss, accuracy, F1…) most, a rate or a
// learning rate less, bookkeeping (sizes, counts, times, steps) least. One that was read many times (a curve) gets more.
// As arrays of single words: a string of several words would be taken for the page's own text (i18n:extract).
const WORDS = (list: string[]) => new Set(list);
const QUALITY = WORDS([
  'loss', 'acc', 'accuracy', 'f1', 'bleu', 'rouge', 'rouge1', 'rouge2', 'rougel', 'chrf', 'meteor', 'ndcg', 'mrr',
  'map', 'recall', 'precision', 'prec', 'auc', 'auroc', 'ppl', 'perplexity', 'bpb', 'bpc', 'nll', 'll', 'wer',
  'cer', 'em', 'exact', 'score', 'reward', 'return', 'win', 'ksr', 'top1', 'top5', 'error', 'err', 'mse', 'mae',
  'rmse', 'iou', 'dice', 'psnr', 'ssim', 'fid', 'kl', 'agreement', 'correct', 'hit', 'hits', 'success', 'pass',
]);
const HELD_OUT = WORDS(['val', 'valid', 'validation', 'dev', 'eval', 'test', 'heldout']);
const RATE = WORDS(['lr', 'learning', 'grad', 'norm', 'throughput', 'mem', 'memory']);
const BOOKKEEPING = WORDS([
  'elapsed', 'time', 'seconds', 'secs', 'sec', 'duration', 'eta', 'epoch', 'n', 'num', 'count', 'total', 'size',
  'params', 'tokens', 'bytes', 'positions', 'examples', 'words', 'seqs', 'batch', 'accum', 'world', 'rank', 'steps',
  'step',
]);
const PER_SECOND = /per[^a-z]?(s|sec|secs|second|seconds)($|[^a-z])|\/s($|[^a-z])|_s_/;

/** What a line of numbers also never leads with: how much there was to score. */
const COUNTED = WORDS(['queries', 'query', 'docs', 'doc', 'documents', 'samples', 'questions', 'items', 'rows', 'seed', 'seeds']);

/** Words with their digits (f1, top5, rouge2); "acc@1" and "ksr@0.1" are acc and ksr. */
const wordsOf = (low: string) => low.split(/[^a-z0-9]+/).filter(Boolean);

export function metricScore(name: string, repeated: boolean): number {
  const low = name.toLowerCase();
  const words = wordsOf(low);
  const has = (set: Set<string>) => words.some((w) => set.has(w));
  let score = repeated ? 2 : 0;
  if (has(QUALITY)) score += 4 + (has(HELD_OUT) ? 1 : 0);
  else if (has(RATE) || PER_SECOND.test(low)) score -= 2;
  else if (has(BOOKKEEPING)) score -= 5;
  return score;
}

/** The names, the ones that matter most first (the order they came in otherwise). */
export function rankMetrics(names: string[], repeated: (k: string) => boolean): string[] {
  return names
    .map((k, i) => ({ k, i, s: metricScore(k, repeated(k)) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.k);
}

/** A size, a count or a time rather than a result. */
export function isBookkeeping(name: string): boolean {
  const words = wordsOf(name.toLowerCase());
  if (words.some((w) => QUALITY.has(w))) return false;
  return metricScore(name, false) <= -5 || words.some((w) => COUNTED.has(w));
}

/**
 * A run's numbers for a line of text, at most `n`. First those named as the ones that count, in the order named. Then
 * the results: a quality number printed once (at the end) before one printed again and again; then the other numbers,
 * the same way; rates last. Never bookkeeping, nor a setting the run prints back (but one with a quality number's name,
 * like a run's loss beside a --loss setting), unless it was named.
 */
export function keyNumbers(names: string[], o: { named?: string[]; repeated?: string[]; settings?: string[]; n?: number } = {}): string[] {
  const named = [...new Set(o.named ?? [])].filter((k) => names.includes(k));
  const rep = new Set(o.repeated ?? []);
  const settings = new Set(o.settings ?? []);
  const tier = (k: string) => {
    const s = metricScore(k, false);
    return s < 0 ? 4 : (s >= 4 ? 0 : 2) + (rep.has(k) ? 1 : 0);
  };
  const rest = names
    .map((k, i) => ({ k, i }))
    .filter(({ k }) => !named.includes(k) && !isBookkeeping(k) && !(settings.has(k) && metricScore(k, false) < 4))
    .sort((a, b) => tier(a.k) - tier(b.k) || metricScore(b.k, false) - metricScore(a.k, false) || a.i - b.i)
    .map((x) => x.k);
  return [...named, ...rest].slice(0, o.n ?? 6);
}
