// Before and after screenshots of a web app an agent changed (ui_screenshot), as the server keeps them.

export interface UiShot {
  id: string;
  /** The session it was taken in. */
  key: string;
  /** Which screen: the same for its before and after. */
  label: string;
  phase: 'before' | 'after' | 'check';
  viewport: 'desktop' | 'phone';
  /** Where the page was (after redirects). */
  url: string;
  /** The page's own title. */
  title: string;
  /** The picture's size in pixels. */
  width: number;
  height: number;
  createdAt: number;
}

/** News the server sends the session's pages ({ t: 'feature', id: 'shots', key, data }). */
export type ShotsEvent = { what: 'shot'; ids: string[] };
