// Inventory translation coverage separately from language quality; hashes invalidate stale reviews.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const hash = (text) => createHash('sha256').update(text).digest('hex');
const sources = read('web/src/i18n/strings.json');
const catalog = read('web/src/i18n/de.json');
// Use the application validators rather than a second, approximate placeholder grammar.
const bundled = await build({ stdin: { contents: "export { keepsValues } from './shared/translate.ts'; export { AGENT_TOPICS, topicId, parseTopic, translatedTopic } from './shared/guide.ts';", resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { keepsValues, AGENT_TOPICS, topicId, parseTopic, translatedTopic } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const output = process.argv[2];
const reviews = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};
const sourceUses = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : {};
const fileHashes = new Map();
// Reusing a key in a new context, or changing its source, requires another review.
const contextHash = (key) => {
  if (!process.argv[4]) return null;
  const uses = sourceUses[key] ?? sourceUses[key.replace(/^[a-z]+::/, '')] ?? [];
  return hash(JSON.stringify(uses.map((file) => {
    if (!fileHashes.has(file)) fileHashes.set(file, hash(fs.readFileSync(path.join(root, file), 'utf8')));
    return [file, fileHashes.get(file)];
  })));
};
// Brand names and executable flags stay literal even when their surrounding prose changes.
const brands = ['Hugging Face', 'OpenRouter', 'Playwright', 'Chromium', 'Zotero', 'Mermaid', 'Jupyter', 'Overleaf', 'Notion', 'Ollama', 'vLLM', 'OpenAI', 'Cloudflare', 'Gradio'];
const compact = (text) => text.replace(/[\s-]+/g, '');

// These are candidates for contextual review, never automatic replacement rules.
const keys = [...new Set([...Object.keys(sources), ...Object.keys(catalog)])].sort();
const entries = keys.map((key) => {
  const baseKey = key.replace(/^[a-z]+::/, '');
  const source = sources[key] ?? sources[baseKey] ?? 'catalog-only';
  const value = catalog[key];
  const flags = [];
  if (typeof value !== 'string' || !value.trim()) flags.push('missing');
  if (typeof value === 'string') {
    if (/\b(?:Sie|Ihnen|Ihr(?:e[rmns]?|er|es)?)\b/u.test(value)) flags.push('formal-or-third-person');
    if (key === value && /\b(?:the|your|you|when|what|why|how|with|from|this|that|such|cannot|could|should|would|nothing|something)\b/i.test(key)) flags.push('unchanged-prose');
    if (/\b(?:Gedächtnis|Computer-Nutzung|Eingabe-Tokens|Neuer Schwung)\b/u.test(value)) flags.push('terminology');
    if (!keepsValues(key, value)) flags.push('broken-values');
    for (const brand of brands) if (compact(key).includes(compact(brand)) && !compact(value).includes(compact(brand))) flags.push(`brand:${brand}`);
    // LaTeX command arguments contain prose, unlike application template variables.
    const literalTokens = [...key.matchAll(/\{[A-Za-z_][A-Za-z0-9_.-]*\}|\bsk-or\b|--[a-z][a-z0-9_-]*/g)]
      .filter((match) => !match[0].startsWith('{') || !/\\[A-Za-z]+\*?$/.test(key.slice(0, match.index)))
      .map((match) => match[0]);
    for (const token of new Set(literalTokens)) if (!value.includes(token)) flags.push(`technical-token:${token}`);
  }
  const digest = hash(JSON.stringify([key, value]));
  const review = reviews[key];
  const context = contextHash(key);
  const current = review?.hash === digest && context !== null && review.contextHash === context;
  return { key, source, catalogOnly: !Object.hasOwn(sources, key), sources: sourceUses[key] ?? sourceUses[baseKey] ?? [], value: value ?? null, hash: digest, contextHash: context, flags, review: current ? review.status : 'unreviewed', staleReview: !!review && !current };
});

// Native Markdown lives outside the UI extractor and needs its own coverage inventory.
const guideRoot = path.join(root, 'docs/guide');
const guides = fs.readdirSync(guideRoot, { withFileTypes: true })
  .filter((item) => item.isFile() && /^\d.*\.md$/.test(item.name))
  .map(({ name }) => {
    const english = fs.readFileSync(path.join(guideRoot, name), 'utf8');
    const target = path.join(guideRoot, 'de', name);
    const german = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    const accepted = german !== null && translatedTopic(parseTopic(name, english), name, german) !== null;
    const links = (text) => [...text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
    return { file: name, audience: AGENT_TOPICS.includes(topicId(name)) ? 'agent' : 'user', sourceHash: hash(english), translationHash: german === null ? null : hash(german), sourceWords: english.split(/\s+/).length, nativeTranslation: german !== null, acceptedStructure: accepted, sameLinkTargets: german !== null && JSON.stringify(links(english)) === JSON.stringify(links(german)) };
  });
const counts = Object.fromEntries(['missing', 'broken-values', 'formal-or-third-person', 'unchanged-prose', 'terminology'].map((flag) => [flag, entries.filter((entry) => entry.flags.includes(flag)).length]));
// Stable source groups make the remaining work reviewable without random catalog slices.
const batches = [...new Set(entries.map((entry) => entry.source))].sort().map((source) => {
  const group = entries.filter((entry) => entry.source === source);
  return { source, total: group.length, unreviewed: group.filter((entry) => entry.review === 'unreviewed').length, candidates: group.filter((entry) => entry.flags.length).length };
});
const report = { schema: 1, generatedAt: new Date().toISOString(), note: 'Flags are review candidates. Coverage and a clean scan do not certify linguistic quality.', counts, reviewed: entries.filter((entry) => entry.review !== 'unreviewed').length, entries, guides, batches };
// With no paths, print a quick coverage scan; supplied evidence enables review verification.
if (output) fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ entries: entries.length, ...counts, reviewed: report.reviewed, userGuidesTranslated: guides.filter((guide) => guide.audience === 'user' && guide.nativeTranslation).length, userGuides: guides.filter((guide) => guide.audience === 'user').length, agentReferences: guides.filter((guide) => guide.audience === 'agent').length }));
