// Select bounded active contract excerpts that overlap the current request.
import { browseWiki } from '../browse.ts';
import { readWiki } from '../core.ts';
import { redactSecrets, secretIn, steeringIn } from '../../memory/secrets.ts';

/** Return only explicitly marked active contract documents; ordinary articles are not promoted to contracts. */
export function relevantContracts(root: string, prompt: string): string[] {
  const terms = [...new Set((prompt.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []))].slice(0, 30);
  if (!terms.length) return [];
  const listing = browseWiki(root);
  if (listing.truncated) return [];
  const result: string[] = [];
  for (const article of listing.articles) {
    try {
      const content = readWiki(root, article.path).content;
      const front = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] ?? '';
      if (!/^\s*["']?document_kind["']?\s*:\s*["']?contract["']?\s*$/im.test(front) || !/^\s*["']?document_status["']?\s*:\s*["']?active["']?\s*$/im.test(front) || !/^\s*["']?authorization_ref["']?\s*:\s*\S+/im.test(front)) continue;
      if (secretIn(content) || steeringIn(content) || !terms.some((term) => content.toLocaleLowerCase().includes(term))) continue;
      result.push(`Wiki document: ${article.path}\n${redactSecrets(content).slice(0, 6000)}`);
      if (result.length === 4) break;
    } catch { /* Unsafe or unreadable entries never become context. */ }
  }
  return result;
}
