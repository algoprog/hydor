// Screenshots shown to the user, as the server keeps them: those the app's browser takes of a web app an agent
// changed (ui_screenshot, before and after), and those an agent already had as files and shows (show_screenshots).

export interface UiShot {
  id: string;
  /** The session it was taken in. */
  key: string;
  /** Which screen: the same for its before and after, and for its sizes and themes. */
  label: string;
  phase: 'before' | 'after' | 'check';
  viewport: 'desktop' | 'phone';
  /** Where the page was (after redirects); file://<path> for a picture shown from a file. */
  url: string;
  /** The page's own title ('' for a file). */
  title: string;
  /** The picture's size in pixels. */
  width: number;
  height: number;
  createdAt: number;
  /** The colour scheme it shows, when known. */
  theme?: 'dark' | 'light';
  /** The heading its screen shows under in the card, in the order first given (show_screenshots); absent: none. */
  section?: string;
  /** A line about the screen, shown in its review (show_screenshots). */
  note?: string;
  /** Taken by the app's browser (ui_screenshot) or copied from a file the agent had (show_screenshots). */
  source: 'capture' | 'file';
}

/** A shot and, for an after one, the before one it answers. */
export interface ShotPair {
  shot: UiShot;
  before: UiShot | null;
}

/** The tools whose calls show as a reply's screenshot card. */
export const SHOT_TOOLS = ['ui_screenshot', 'show_screenshots'] as const;

/** A call's shots, from what it answered: "… (shot <id>, <id>)". Both tools answer so. */
export const shotIdsOf = (output?: string): string[] =>
  /\(shot ([a-f0-9, ]+)\)/.exec(output ?? '')?.[1].split(/,\s*/).filter((x) => /^[a-f0-9]{12}$/.test(x)) ?? [];

/** News the server sends the session's pages ({ t: 'feature', id: 'shots', key, data }). */
export type ShotsEvent = { what: 'shot'; ids: string[] };
