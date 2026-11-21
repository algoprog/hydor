// Where a card's picture loads from. In the app, through this server (a picture on the web by its fetcher, a file of
// this computer: Markdown.tsx replyPicture); in a confidential session, nothing from the web. On an app's public page,
// whose visitor is not signed in to this server, straight from its https address on the web and nothing else: a path
// on this computer or an app's own file (asset:…) shows no picture there, and the card's text takes its place.

export interface PictureWays {
  /** The folder a relative path is in. */
  cwd?: string;
  /** A confidential session's reply: nothing from the web. */
  offline?: boolean;
  /** An app's public page: only https addresses on the web, loaded straight from there. */
  webOnly?: boolean;
}

/** A picture's address as given → where it loads from here, or null when it may not load. `viaApp`: through this server. */
export function pictureAddress(src: string, o: PictureWays, viaApp: (src: string, cwd?: string) => string | null): string | null {
  const s = src.trim();
  if (!s) return null;
  if (o.webOnly) {
    // Written as an address on the web (the parser would read "https:/a.jpg" as one).
    if (!/^https:\/\/[^/\s]/i.test(s)) return null;
    try {
      const u = new URL(s);
      return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password ? u.href : null;
    } catch {
      return null;
    }
  }
  if (o.offline && /^https?:\/\//i.test(s)) return null;
  return viaApp(s, o.cwd);
}
