// My themes (Canva's brand kit): a deck's colours and fonts saved under a name of the user's, with its logo when it has
// one, offered beside the ready-made themes (the slides' Theme tab, New page → Slides) and to agents by its name.
import type { Logo, Theme } from './slides.ts';

export interface MyTheme {
  id: string;
  name: string;
  theme: Theme;
  /** The logo that comes with it on every slide, when it was saved with one. */
  logo?: Logo;
  createdAt: number;
  updatedAt: number;
}

/** How many a user keeps, and how long a name is. */
export const MY_THEMES_LIMITS = { count: 60, name: 60 };
