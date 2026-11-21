// The ```ui blocks of a reply, read as text: each one's UI name, the JSON inside it, and where it stands in the reply.
// Without the catalog, so whatever reads replies on the server can use it (a board card's refresh, an app drafted from a
// session). The pages draw blocks with their Markdown parser instead (web/src/components/Markdown.tsx).

export interface UiBlock {
  /** The word after ```ui: the UI's name as the agent wrote it. */
  name: string;
  /** What is inside the fence: the data, as JSON text. */
  body: string;
  /** Where the block starts and ends in the reply (its fences included). */
  start: number;
  end: number;
}

/** The ```ui <name> blocks of a reply, in order. */
export function uiBlocks(reply: string): UiBlock[] {
  const out: UiBlock[] = [];
  const re = /(^|\n)[ \t]*(`{3,}|~{3,})ui[ \t]+([A-Za-z0-9_-]+)[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g;
  for (let m = re.exec(reply); m; m = re.exec(reply)) out.push({ name: m[3], body: m[4], start: m.index + m[1].length, end: m.index + m[0].length });
  return out;
}

/** The reply without its ```ui blocks: its words, as they read around the cards. */
export function withoutUiBlocks(reply: string): string {
  let out = '';
  let at = 0;
  for (const b of uiBlocks(reply)) {
    out += reply.slice(at, b.start);
    at = b.end;
  }
  return (out + reply.slice(at)).replace(/\n{3,}/g, '\n\n').trim();
}
