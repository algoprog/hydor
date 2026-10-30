// Dev check: parse transcripts and print stats.  node dist/dev/parse-test.js <file>...
import fs from 'node:fs';
import { ClaudeParser } from '../history/claude.ts';
import { CodexParser } from '../history/codex.ts';
import { LineSplitter } from '../runner/frames.ts';

for (const file of process.argv.slice(2)) {
  const codex = file.includes('/.codex/');
  const p = codex ? new CodexParser({ retain: true, collectChunks: true }) : new ClaudeParser({ retain: true, collectChunks: true });
  const t0 = Date.now();
  const sp = new LineSplitter();
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1 << 20);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) sp.push(Buffer.from(buf.subarray(0, n)), (l) => p.feed(l));
  p.finish();
  const ms = Date.now() - t0;
  const kinds: Record<string, number> = {};
  for (const it of p.items) kinds[it.kind === 'tool' ? 'tool:' + it.tool.category : it.kind] = (kinds[it.kind === 'tool' ? 'tool:' + it.tool.category : it.kind] ?? 0) + 1;
  console.log(`\n${file}\n  ${(fs.statSync(file).size / 1e6).toFixed(1)} MB in ${ms} ms, ${p.items.length} items, ${p.chunks.length} chunks`);
  console.log('  title:', p.title() ?? '-', '| first:', p.summary.firstPrompt?.slice(0, 80));
  console.log('  summary:', JSON.stringify({ ...p.summary, firstPrompt: undefined, lastPrompt: undefined }));
  console.log('  stats:', JSON.stringify(p.stats));
  console.log('  kinds:', JSON.stringify(kinds));
  const show = Number(process.env.SHOW ?? 0);
  for (const it of show ? p.items.slice(-show) : []) {
    const s = it.kind === 'tool' ? `${it.tool.name} [${it.tool.status}] ${it.tool.title?.slice(0, 90)} ${it.tool.files ? it.tool.files.map((f) => `${f.path} +${f.added}-${f.removed}`).join(', ') : ''} ${it.tool.exitCode != null ? 'exit=' + it.tool.exitCode : ''}${it.tool.background ? ' BG' : ''}` : it.kind === 'turn' ? `${it.status} ${it.durationMs}ms ${JSON.stringify(it.tokens)}` : 'text' in it ? it.text.slice(0, 100).replace(/\n/g, ' ') : '';
    console.log(`  [${it.seq}] ${it.kind}: ${s}`);
  }
}
