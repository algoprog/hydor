// What an answer UI of the catalog is (index.ts): its name, what it is for, the data it takes and an example of it.

export type AnswerUiGroup = 'summary' | 'compare' | 'shopping' | 'travel' | 'food' | 'plans' | 'data' | 'money' | 'learn' | 'science' | 'media' | 'people' | 'writing' | 'code';

export interface AnswerUiSpec {
  /** Its name in a ```ui block: lowercase words joined by dashes. */
  id: string;
  /** What the gallery calls it. */
  title: string;
  group: AnswerUiGroup;
  /**
   * What it is for and what it does, in a sentence or two of plain words: the gallery shows it under its title, agents
   * read it to pick one, and search finds it by it. Say what is interactive (the servings scale the amounts).
   */
  use: string;
  /** More words it may be looked for by: synonyms, and the things it shows ("forecast rain temperature"). */
  keywords: string;
  /**
   * The data it takes, as a TypeScript-like type agents read: `?` for what may be left out, `// …` notes after a field,
   * `md` for text written in Markdown, `url` for an address, `image` for a picture's address or a path on this computer,
   * `date` (YYYY-MM-DD), `time` (HH:MM), `datetime` (YYYY-MM-DDTHH:MM), `tone` ("good" | "warn" | "bad" | "info" | "neutral").
   */
  shape: string;
  /** Its data in an example: real-looking content, which the gallery draws. */
  example: Record<string, unknown>;
}
