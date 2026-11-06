// The gallery of kinds an agent makes (shared/content-types.ts): a slide for the deck open, a section for the document
// open, a part for the page open, or a new deck, document, page or spreadsheet. openTypes opens it from anywhere (the
// editors' "made with AI" items, New in the Library); it shows over everything, mounted in <body> on its own the first
// time, and its code and the catalog load then, so no page carries them before. What its Make it asks goes through the
// Ask panel of the page open (askNow), so the person watches it being made; to `onDone` when the caller sends it
// itself; or, for something new, to the start page with the request in its box, in the project picked, as New's
// "Or describe it" does. `onPick` makes it a picker only: the type picked goes back, and nothing is asked here.
import { createElement, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { create } from 'zustand';
import type { ContentKind, ContentType } from '@shared/content-types';
import { LANGS } from '@shared/i18n';
import { currentLang } from '../../../i18n/locale';

export interface TypesOpts {
  kind: ContentKind;
  /** The page, deck or document open: what is made goes through its Ask panel. */
  pageId?: string;
  /** A slide: the one it goes after (its index from 0, and its title); left out, at the end. */
  after?: { index: number; title: string };
  /** A section or a page's part: where it goes, in words that follow "Add a section": "after the section “Pricing”". */
  at?: string;
  /** A slide's deck is in the web format (false: PowerPoint compatible, where the web's own kinds come with a note). */
  webDeck?: boolean;
  /** Something new: the project it goes in (the start page opens in it). */
  space?: string | null;
  /** Gets the request rather than it being sent from here. */
  onDone?(prompt: string): void;
  /** Picks a kind only: no words are asked for, and nothing is sent. */
  onPick?(t: ContentType): void;
}

export const useTypes = create<{ ask: (TypesOpts & { n: number }) | null }>(() => ({ ask: null }));

let n = 0;
let mounted = false;

const Gallery = lazy(() => import('./Gallery'));

/** Loads the gallery's code ahead (when a menu that opens it shows), so it opens at once. */
export const preloadTypes = () => void import('./Gallery').catch(() => {});

function TypesHost() {
  const ask = useTypes((s) => s.ask);
  if (!ask) return null;
  return createElement(Suspense, { fallback: null }, createElement(Gallery, { key: ask.n, o: ask }));
}

/** Opens the gallery: pick a kind, say what it is about if you like, Make it. */
export function openTypes(o: TypesOpts) {
  if (!mounted) {
    mounted = true;
    const el = document.createElement('div');
    document.body.append(el);
    createRoot(el).render(createElement(TypesHost));
  }
  useTypes.setState({ ask: { ...o, n: ++n } });
}

export const closeTypes = () => useTypes.setState({ ask: null });

/** The app's language, for what is made new in it, when it is not English ("Greek"). */
export function appLanguage(): string | undefined {
  const l = currentLang();
  return l === 'en' ? undefined : LANGS.find((x) => x.id === l)?.english;
}
