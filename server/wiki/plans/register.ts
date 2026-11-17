// Identify execution-register sections embedded in a project plan.
export function embeddedExecutionSections(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const result: string[] = [];
  // A marker preserves the exact heading selected when a plan is adopted.
  const marker = /^<!-- hydor-execution-register: ("(?:[^"\\]|\\.)*") -->$/m.exec(text);
  let named = '';
  if (marker) { try { named = String(JSON.parse(marker[1])); result.push(marker[0]); } catch { result.push('invalid register marker'); } }
  for (let i = 0; i < lines.length; i++) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (!match || !(match[2] === named || /^(execution(?:\s+control|\s+tracking)?|evidence|implementation\s+status|umsetzungskontrolle|nachweisregister)$/i.test(match[2]))) continue;
    const start = i, level = match[1].length;
    while (i + 1 < lines.length) {
      const next = /^(#{1,6})\s+/.exec(lines[i + 1]);
      if (next && next[1].length <= level) break;
      i++;
    }
    result.push(lines.slice(start, i + 1).join('\n'));
  }
  return result;
}

/** Recognize explicitly named or marked execution records outside the reserved evidence area. */
export function executionRegisterDocument(relative: string, text: string): boolean {
  const normalized = relative.replace(/\\/g, '/');
  const name = normalized.split('/').at(-1) ?? '';
  if (/^(?:evidence|nachweise|nachweisregister|execution[-_]?register|umsetzungskontrolle)(?:[-_.].*)?\.md$/i.test(name)) return true;
  if (/^wiki\/(?:evidence|nachweise|execution-register|umsetzungskontrolle)\//i.test(normalized)) return true;
  const front = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1] ?? '';
  if (/^\s*["']?(?:document_kind|type)["']?\s*:\s*["']?(?:execution[-_ ]register|execution[-_ ]evidence|evidence|nachweise|nachweisregister|umsetzungskontrolle)["']?\s*(?:#.*)?$/im.test(front)) return true;
  return embeddedExecutionSections(text).length > 0;
}

/** Allow an execution-only revision to change exactly one identified register section. */
export function executionOnlyChange(before: string, after: string): boolean {
  const split = (text: string) => {
    text = text.replace(/\r\n/g, '\n');
    const sections = embeddedExecutionSections(text).filter((value) => /^#{1,6}\s/.test(value));
    if (sections.length !== 1) return null;
    const section = sections[0], start = text.indexOf(section);
    if (start < 0 || start !== text.lastIndexOf(section)) return null;
    // A heading inside a fenced code example cannot identify an execution register.
    let fence = '';
    for (const line of text.slice(0, start).split('\n')) {
      const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (!match) continue;
      if (!fence) fence = match[1];
      else if (match[1][0] === fence[0] && match[1].length >= fence.length) fence = '';
    }
    if (fence) return null;
    return { prefix: text.slice(0, start), suffix: text.slice(start + section.length), heading: section.split('\n')[0], section };
  };
  const old = split(before), next = split(after);
  return !!old && !!next && old.heading === next.heading && old.prefix === next.prefix && old.suffix === next.suffix && old.section !== next.section;
}
