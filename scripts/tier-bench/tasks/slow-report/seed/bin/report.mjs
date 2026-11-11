// Prints the sales report for a JSON-lines file: node bin/report.mjs data/sales.jsonl
import fs from 'node:fs';
import { buildReport } from '../src/report.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node bin/report.mjs <file.jsonl>');
  process.exit(1);
}

const rows = fs
  .readFileSync(file, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line));

process.stdout.write(buildReport(rows));
