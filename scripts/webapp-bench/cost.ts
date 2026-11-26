// What a run cost, worked out from its tokens, for builders that ran on a subscription and so were billed nothing per run. Each token is priced as the model's price list
// prices it (US dollars per million tokens): new input and input written to the cache at one price, output at another, input read from the cache at a third.
//   node scripts/webapp-bench/cost.ts <input tokens> <output tokens> <tokens read from the cache> [--rates <input>,<output>,<cache read>]
// The recorded measurement (results/2026-11-26-kit-0.6.1.md) used 2, 10 and 0.20. Put the rates of the model you run, from its price list, and write them in the results file.
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

export interface Rates {
  input: number;
  output: number;
  cacheRead: number;
}

export const RECORDED: Rates = { input: 2, output: 10, cacheRead: 0.2 };

/** US dollars for these tokens: `input` is new input plus input written to the cache, `cached` is input read from the cache. */
export function costOf(tokens: { input: number; output: number; cached: number }, rates: Rates = RECORDED): number {
  return (tokens.input * rates.input + tokens.output * rates.output + tokens.cached * rates.cacheRead) / 1_000_000;
}

function main(): number {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { rates: { type: 'string' } } });
  const [input, output, cached] = positionals.map(Number);
  const given = values.rates?.split(',').map(Number);
  if (positionals.length !== 3 || [input, output, cached].some((n) => !Number.isFinite(n)) || (given && (given.length !== 3 || given.some((n) => !Number.isFinite(n))))) {
    console.error('usage: node scripts/webapp-bench/cost.ts <input tokens> <output tokens> <cache read tokens> [--rates <input>,<output>,<cache read>]');
    return 2;
  }
  const rates = given ? { input: given[0]!, output: given[1]!, cacheRead: given[2]! } : RECORDED;
  console.log(costOf({ input: input!, output: output!, cached: cached! }, rates).toFixed(2));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) process.exit(main());
